import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import catalog from 'agentic-os/catalog/invocation.json' with { type: 'json' }
import { buildAgenticGraphAgentReadyToolContracts } from '@/features/agent-ready/agentic-graph-agent-ready-tool-contract.mjs'
import { buildDurableRunWebMcpToolBuilders } from '@/features/agent-ready/durableRunWebMcpTools'
import { createWebMcpToolRegistry } from '@/features/agent-ready/webMcpToolRegistry'

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
}
