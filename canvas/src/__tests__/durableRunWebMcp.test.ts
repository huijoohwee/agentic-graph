import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import catalog from 'agentic-os/catalog/invocation.json' with { type: 'json' }
import { buildAgenticGraphAgentReadyToolContracts } from '@/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs'
import { buildDurableRunWebMcpToolBuilders } from '@/features/agent-ready/durableRunWebMcpTools'
import { createWebMcpToolRegistry } from '@/features/agent-ready/webMcpToolRegistry'
import { readRunObservation } from '@/features/agent-ready/durableRunStream'

export async function testDurableRunWebMcpContractAndExecution(): Promise<void> {
  const contracts = buildAgenticGraphAgentReadyToolContracts({ includeBrowserOnlyTools: true })
  const source = catalog.entries.filter(entry => entry.action === 'run')
  const calls: unknown[] = []
  const builders = buildDurableRunWebMcpToolBuilders(name => {
    const contract = contracts.find(candidate => candidate.name === name)
    assert.ok(contract); return contract
  }, async (operation, input) => {
    const { validateRunInput } = await import('agentic-os/agents/invocation')
    calls.push({ operation, input: validateRunInput(operation, input) })
    return { runId: input.runId, status: 'running' }
  })
  const registry = createWebMcpToolRegistry(Object.values(builders).map(build => build()))
  assert.equal(registry.tools.length, 8)
  const ajv = new Ajv2020({ strict: false })
  for (const entry of source) {
    const name = `agentic-graph.${entry.token.slice(1)}`, tool = registry.get(name)
    assert.ok(tool); assert.deepEqual(tool.inputSchema, entry.inputSchema)
    assert.equal(tool._meta?.catalogDigest, catalog.digest)
    assert.equal(tool.annotations?.readOnlyHint, entry.semantic === 'read-only')
    assert.equal(tool.annotations?.idempotentHint, entry.token !== '/run.retry')
    const input = entry.argv[0] === 'start'
      ? { runId: 'draft-job', conversationId: 'draft', agent: { agentId: 'listing', revision: 'v1' }, goal: 'Write a listing', input: {}, maxParallel: 1 }
      : ['status', 'trace'].includes(entry.argv[0]) ? { runId: 'draft-job' }
        : entry.argv[0] === 'query' ? { limit: 32 }
          : entry.argv[0] === 'evaluate' ? { runId: 'draft-job', operationId: 'evaluation', subjectDigest: 'a'.repeat(64), evidence: { id: 'subject', digest: 'a'.repeat(64) } }
            : entry.argv[0] === 'compare' ? { cohortId: 'cohort', baseline: { id: 'plan', revision: 'v1', digest: 'a'.repeat(64) }, candidate: { id: 'plan', revision: 'v2', digest: 'b'.repeat(64) } }
        : { runId: 'draft-job', operationId: 'same-operation', ...(entry.argv[0] === 'retry' ? { taskId: 'listing' } : {}) }
    assert.equal(ajv.compile(tool.inputSchema)(input), true)
    await registry.execute(name, input)
    await assert.rejects(registry.execute(name, { ...input, principalId: 'spoofed', endpoint: 'https://untrusted.example/' }))
  }
  assert.equal(calls.length, 8)
  const published = buildAgenticGraphAgentReadyToolContracts({ includeBrowserOnlyTools: false })
  assert.equal(published.some(entry => entry.name.startsWith('run.')), false)
  const metadata = readFileSync('src/features/agent-ready/durableRunAgentReadyContract.mjs', 'utf8')
  const buildersSource = readFileSync('src/features/agent-ready/durableRunWebMcpTools.ts', 'utf8')
  assert.equal(metadata.includes('agents/invocation'), false)
  assert.ok(buildersSource.includes("await import('./durableRunTransport')"))
  await verifyObservationStream()
}

async function verifyObservationStream() {
  const now = Date.now(), sample = { schema: 'agent-toolkit-run/v1', runId: 'run', observedAt: now, label: 'Σ draft' }
  const frame = (value: unknown) => `data: ${JSON.stringify(value)}\r\n\r\n`
  const response = (text: string, type = 'text/event-stream', control = 'no-store') => {
    const bytes = new TextEncoder().encode(text)
    let position = 0
    return new Response(new ReadableStream({ pull(controller) {
      // Deliberately split CRLF separators and multibyte UTF-8 characters.
      if (position === bytes.length) controller.close()
      else { controller.enqueue(bytes.slice(position, position + 7)); position = Math.min(position + 7, bytes.length) }
    } }), { headers: { 'content-type': type, 'cache-control': control } })
  }
  const next = { ...sample, observedAt: now + 1, label: 'updated' }, seen: unknown[] = []
  assert.deepEqual(await readRunObservation(response(frame(sample) + frame(sample) + frame(next) + 'data: [DONE]\n\n'), 'trace', 'run', undefined, value => seen.push(value)), next)
  assert.deepEqual(seen, [sample, next], 'Complete snapshots update progressively; exact duplicates do not rerender')
  assert.deepEqual(await readRunObservation(response(JSON.stringify(sample), 'application/json'), 'trace', 'run'), sample)
  const query = { schema: 'agent-toolkit-query/v1', observedAt: now, items: [] }
  assert.deepEqual(await readRunObservation(response(frame(query)), 'query', undefined), query)
  for (const value of [{ ...sample, runId: 'foreign' }, { ...sample, schema: 'unknown' }, { ...sample, observedAt: now - 60001 },
    { ...sample, observedAt: now + 60000 }, { ...sample, observedAt: null }])
    await assert.rejects(readRunObservation(response(frame(value)), 'trace', 'run'), /identity, schema or freshness/)
  await assert.rejects(readRunObservation(response(frame(next) + frame(sample)), 'trace', 'run'), /freshness/)
  await assert.rejects(readRunObservation(response(frame(sample) + frame({ ...sample, label: 'changed' })), 'trace', 'run'), /reused a revision/)
  await assert.rejects(readRunObservation(response(frame(sample).repeat(33)), 'trace', 'run'), /snapshot bound/)
  await assert.rejects(readRunObservation(response(frame({ ...sample, label: 'x'.repeat(262144) })), 'trace', 'run'), /256 KiB/)
  await assert.rejects(readRunObservation(response('data: ' + JSON.stringify(sample)), 'trace', 'run'), /within a frame/)
  await assert.rejects(readRunObservation(response('data: [DONE]\n\n' + frame(sample)), 'trace', 'run'), /after the stream/)
  await assert.rejects(readRunObservation(response(''), 'trace', 'run'), /no snapshot/)
  await assert.rejects(readRunObservation(response(frame(sample), 'text/event-stream', 'no-store-fake'), 'trace', 'run'), /uncached/)
  await assert.rejects(readRunObservation(response(frame({ status: 'blocked', reasonCode: 'run_forbidden' })), 'trace', 'run'),
    (error: unknown) => (error as { denied: boolean }).denied)
  const controller = new AbortController(); let canceled = false
  const hanging = new Response(new ReadableStream({ cancel() { canceled = true } }), { headers: { 'cache-control': 'no-store', 'content-type': 'text/event-stream' } })
  const reading = readRunObservation(hanging, 'trace', 'run', controller.signal); controller.abort()
  await assert.rejects(reading); assert.equal(canceled, true, 'Abort must release the response reader')
}
