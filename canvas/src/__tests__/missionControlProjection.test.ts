import assert from 'node:assert/strict'
import { readValidationObservation, validationTrace } from '@/features/agent-ready/validationObservationProjection'
import { readRunIndex, readRunTrace, traceGraph, visibleSpanTree, sourceLink, comparable, spanNodeId, spanRows, traceResources, spanResources } from '@/features/agent-ready/missionControlProjection'
import { durableObservationBinding, readDurableSessionToken } from '@/features/agent-ready/durableRunTransport'

export async function testMissionControlProjection(): Promise<void> {
  const ref = { id: 'fixture', revision: 'v1', digest: 'a'.repeat(64) }
  const context = { taskId: 'draft', projectId: 'seller', goalId: 'first-result', receipt: { id: 'draft', digest: 'b'.repeat(64) },
    plan: { repository: 'github.com/owner/source', path: 'docs/plan.md', revision: '1'.repeat(40), digest: ref.digest,
      continuityId: 'SELLER-001', revisions: { prd: '1', tad: '1', adr: '1', mvp: '1', gtm: '1' } } }
  const span = (spanId: string, parentSpanId: string | null, attempt = 1) => ({ spanId, parentSpanId, attempt,
    taskId: 'research', kind: 'tool', operation: spanId, status: attempt === 1 ? 'failed' : 'completed', component: ref,
    subjectDigest: ref.digest, evaluation: { status: 'pending' }, timing: { startOffsetMs: 0, inclusiveMs: 0, exclusiveObservedMs: null } })
  const raw = { schema: 'agent-toolkit-run/v1', runId: 'run', status: 'completed', subjectDigest: ref.digest, context,
    candidate: ref, cohortId: 'cohort', profile: { evaluator: ref, dataset: ref, metric: { ...ref, direction: 'maximize' } },
    expiresAt: 999999, observedAt: 1000, evaluation: { status: 'reported', score: 0 },
    spans: [span('root', null), span('failed', 'root'), { ...span('retry', 'root', 2), links: [{ spanId: 'failed', kind: 'handoff' }] }, span('orphan', 'outside')],
    coverage: { retainedSpans: 4, expectedSpans: null, droppedEvents: 2, partial: true }, page: { total: 6, offset: 0, nextCursor: 'next' } }
  const before = JSON.stringify(raw), trace = readRunTrace(raw, 'run')
  assert.equal(trace.evaluation.score, 0); assert.equal(trace.expected, null); assert.equal(trace.partial, true)
  assert.equal(trace.spans[0]!.timing.inclusive, 0); assert.equal(trace.spans[0]!.timing.exclusive, null)
  assert.deepEqual(visibleSpanTree(trace.spans, 'retry').map(r => r.span.spanId), ['root', 'retry'])
  const graph = traceGraph(trace, '')
  assert.ok(graph.nodes.some(n => n.type === 'unavailable'))
  assert.ok(graph.edges.some(e => e.type === 'handoff'))
  assert.ok(graph.nodes.every(n => n.id.startsWith('agentic-os/run/')))
  assert.equal(spanNodeId('other', 'root') === spanNodeId('run', 'root'), false)
  assert.equal(JSON.stringify(raw), before, 'projection must not mutate its source')
  const cyclic = trace.spans.map((s, i) => ({ ...s, parentSpanId: trace.spans[(i + 1) % trace.spans.length]!.spanId }))
  assert.equal(visibleSpanTree(cyclic, '').length, 4)
  assert.throws(() => readRunTrace(raw, 'foreign'), /identity/)
  assert.throws(() => readRunTrace({ ...raw, spans: Array(33).fill(raw.spans[0]) }, 'run'), /bounded/)
  assert.throws(() => readRunTrace({ ...raw, spans: [raw.spans[0], raw.spans[0]] }, 'run'), /Duplicate/)
  assert.match(sourceLink(trace.context)!, /\/blob\/1111111111111111111111111111111111111111\/docs\/plan.md$/)
  assert.equal(sourceLink({ ...context, plan: { ...context.plan, path: '../private' } }), null)
  const index = { schema: 'agent-toolkit-query/v1', status: 'completed', access: { scope: ref.digest, expiresAt: 999999 }, observedAt: 1000,
    total: 1, offset: 0, items: [{ runId: 'run', status: 'completed', context, target: ref, expiresAt: 999999,
      profile: { runDurationMs: 0, tokenUsage: { status: 'unreported' }, estimatedCostUsd: null } }],
    metrics: { runs: 1, failed: 0, knownTokenRuns: 0, knownTokens: 0, runLatencyMs: { count: 1, p50: 0, p95: 0, p99: 0 } } }
  const parsed = readRunIndex(index)
  assert.equal(parsed.items[0]!.tokens, null); assert.equal(parsed.items[0]!.duration, 0); assert.equal(parsed.items[0]!.cost, null)
  assert.equal(parsed.metrics.find(m => m.id === 'tokens')!.value, 'Unknown')
  assert.throws(() => readRunIndex({ status: 'blocked', reasonCode: 'principal_expired' }), (e: unknown) => Boolean((e as { denied: boolean }).denied))
  assert.equal(comparable(trace, { ...trace, candidate: { ...ref, revision: 'v2' } }), true)
  assert.equal(comparable(trace, trace), false)
  assert.equal(comparable(trace, { ...trace, cohortId: 'foreign' }), false)
  assert.equal(durableObservationBinding({}, 'https://app.example'), null)
  const env = { VITE_AGENTIC_OS_OBSERVATION_PATH: '/product/runs/', VITE_AGENTIC_OS_SESSION_PATH: '/product/session', VITE_AGENTIC_OS_CSRF_HEADER: 'x-product-csrf' }
  assert.equal(durableObservationBinding(env, 'https://app.example')!.endpoint, 'https://app.example/product/runs/')
  for (const path of ['https://foreign.example/runs/', '//foreign.example/runs/', '/a/../runs/', '/runs/?token=x'])
    assert.throws(() => durableObservationBinding({ ...env, VITE_AGENTIC_OS_OBSERVATION_PATH: path }, 'https://app.example'), /binding/)
  const csrfToken = 'c'.repeat(64)
  for (const control of ['no-store', 'no-store, no-transform', 'private, NO-STORE'])
    assert.equal(await readDurableSessionToken(Response.json({ ok: true, csrfToken }, { headers: { 'cache-control': control } })), csrfToken)
  for (const control of ['public, max-age=60', 'no-store-fake', ''])
    await assert.rejects(readDurableSessionToken(Response.json({ ok: true, csrfToken }, { headers: { 'cache-control': control } })), /unavailable/)
  await assert.rejects(readDurableSessionToken(Response.json({ ok: true, csrfToken: 'x'.repeat(5000) }, { headers: { 'cache-control': 'no-store' } })), /bound/)
  await assert.rejects(readDurableSessionToken(Response.json({}, { status: 403 })), (error: unknown) => Boolean((error as { denied: boolean }).denied))
  await assert.rejects(readDurableSessionToken(Response.json({ ok: true, csrfToken }, { headers: { 'cache-control': 'no-store' } }), AbortSignal.abort()))

  const observation = { schema: 'agentic-os/validation-observation/v1', authority: false, exportedAt: 2000,
    source: { repository: 'github.com/example/source', revision: '1'.repeat(40), tree: '2'.repeat(40), dirty: true },
    executionOrder: 'sequential', runId: 'validation-fixture', status: 'failed', startedAt: 1000, finishedAt: 2000, elapsedMs: 1000,
    resources: { observedOutputBytes: 50000, emittedDiagnosticBytes: 200 },
    stages: Array.from({ length: 33 }, (_, i) => ({ id: `check-${i}`, status: i === 32 ? 'failed' : 'passed',
      startedAt: 1000 + i, finishedAt: 1001 + i, elapsedMs: 1, observedOutputBytes: 10, outputTruncated: false })) }
  const local = readValidationObservation(JSON.stringify(observation)), localTrace = validationTrace(local, 32, 3000)
  assert.equal(localTrace.spans.length, 1); assert.equal(localTrace.offset, 32); assert.equal(localTrace.partial, true)
  assert.equal(localTrace.subjectDigest, null); assert.equal(localTrace.resources, null)
  assert.equal(localTrace.localObservation?.source.dirty, true)
  assert.equal(localTrace.spans[0]!.timing.exclusive, null); assert.equal(localTrace.spans[0]!.cost, null)
  assert.equal(localTrace.spans[0]!.links[0]!.spanId, 'check-31')
  assert.equal(validationTrace({ ...local, executionOrder: 'concurrent' }).spans[1]!.links.length, 0)
  const agentTrace = { ...trace, spans: trace.spans.map((s, i) => ({ ...s, kind: i === 0 || i === 2 ? 'agent' : 'tool' })) }
  assert.equal(traceGraph(agentTrace, '', 'agents').nodes.filter(node => node.type === 'tool').length, 0)
  assert.equal(comparable(localTrace, { ...localTrace, candidate: { ...ref, revision: 'v2' } }), false)
  assert.throws(() => validationTrace(local, 1), /Invalid/)
  for (const invalid of [{ ...observation, authority: true }, { ...observation, stages: Array(129).fill(observation.stages[0]) },
    { ...observation, stages: [observation.stages[0], observation.stages[0]] },
    { ...observation, source: { ...observation.source, repository: 'github.com/../private' } },
    { ...observation, elapsedMs: -1 }]) assert.throws(() => readValidationObservation(JSON.stringify(invalid)), /Invalid/)
  assert.throws(() => readValidationObservation(' '.repeat(128001)), /oversized/)
  const stripped = readValidationObservation(JSON.stringify({ ...observation, privatePath: '/private/test',
    stages: observation.stages.map(stage => ({ ...stage, command: 'private-command', output: 'private-output' })) }))
  assert.ok(!JSON.stringify(stripped).includes('private-'))

  const measured = { cpuMs: 42, peakMemoryBytes: 1048576, tokens: 0, costUsd: 0,
    costBasis: 'estimated', memoryScope: 'maximum-single-process-rss' }
  const withResources = { ...observation, resources: { ...observation.resources, ...measured },
    stages: [{ ...observation.stages[0], resources: measured }],
    ci: { runId: 5, attempt: 1, url: 'https://github.com/example/source/actions/runs/5', queueWaitMs: 3000 },
    feedback: { status: 'advisory', authority: false, ranking: [{ id: 'check-0', samples: 3, meanMs: 1500,
      sourceRevision: observation.source.revision, resourceMeans: { cpuMs: 40 }, privatePath: '/private/feedback' }] } }
  const resourceTrace = validationTrace(readValidationObservation(JSON.stringify(withResources)))
  assert.deepEqual(traceResources(resourceTrace), { cpuMs: 42, peakMemoryBytes: 1048576, tokens: 0, costUsd: 0 })
  assert.equal(spanRows(resourceTrace.spans)[0]!['CPU ms'], '42')
  assert.equal(spanRows(resourceTrace.spans)[0]!['Estimated USD'], '0')
  assert.equal(traceGraph(resourceTrace, '').nodes[0]!.properties?.['CPU ms'], '42')
  assert.equal(resourceTrace.localObservation?.resources.costBasis, 'estimated')
  assert.equal(resourceTrace.spans[0]?.resources?.memoryScope, 'maximum-single-process-rss')
  assert.equal(resourceTrace.localObservation?.ci?.queueWaitMs, 3000)
  assert.equal(resourceTrace.localObservation?.feedback?.ranking[0]?.samples, 3)
  assert.ok(!JSON.stringify(resourceTrace).includes('/private/feedback'))
  assert.deepEqual(spanResources({ ...trace.spans[0]!, cost: { status: 'reported', prompt_tokens: 5,
    completion_tokens: 3, estimated_cost_usd: 0.001 } }), { cpuMs: null, peakMemoryBytes: null, tokens: 8, costUsd: 0.001 })
  assert.equal(traceResources(localTrace).cpuMs, null)
  for (const patch of [{ resources: { ...measured, tokens: -1 } }, { resources: { ...measured, costBasis: 'actual' } },
    { resources: { ...measured, memoryScope: 'total-tree' } }, { ci: { ...withResources.ci, url: 'https://foreign.invalid' } },
    { feedback: { ...withResources.feedback, ranking: Array(6).fill(withResources.feedback.ranking[0]) } }])
    assert.throws(() => readValidationObservation(JSON.stringify({ ...withResources, ...patch })), /Invalid/)

}
