import assert from 'node:assert/strict'
import { readRunIndex, readRunTrace, traceGraph, visibleSpanTree, sourceLink, comparable, spanNodeId } from '@/features/agent-ready/missionControlProjection'
import { durableObservationBinding } from '@/features/agent-ready/durableRunTransport'

export function testMissionControlProjection(): void {
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
}
