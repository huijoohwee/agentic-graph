import assert from 'node:assert/strict'
import test from 'node:test'
import { createWorkersAiTestVerifier } from '../../../shared/workers-ai-cost-gate.test-utils.mjs'
import { createWorkersAiAgentAdapter } from '../agent-runtime-adapter.ts'

const MODEL = '@cf/openai/gpt-oss-20b'
const context = {
  input: { brief: 'find a quiet beach', context: null },
  run: { runId: 'run-1', agentDefinitionId: 'agent-flight' },
  preparedAgent: {
    instructions: ['Be concise.'],
    modelRuntime: {
      provider: { id: 'cloudflare-workers-ai', adapterId: 'cloudflare-workers-ai' },
      model: { id: MODEL },
    },
  },
}

test('MCP Workers AI adapter blocks before inference when no trusted verifier is configured', async () => {
  const calls = []
  const adapter = createWorkersAiAgentAdapter({ AI: { run: async (...args) => { calls.push(args); return { response: 'ok' } } } })
  await assert.rejects(adapter.execute(context), /Cost verifier missing/u)
  assert.deepEqual(calls, [])
})

test('MCP Workers AI adapter dispatches only after exact free-plan evidence verification', async () => {
  const calls = []
  const scopes = []
  const verifyProviderCostEvidence = async request => {
    scopes.push(request)
    return createWorkersAiTestVerifier()(request)
  }
  const adapter = createWorkersAiAgentAdapter({
    AI: { run: async (...args) => { calls.push(args); return { response: 'Found a quiet beach.' } } },
    verifyProviderCostEvidence,
  })
  const result = await adapter.execute(context)

  assert.equal(result.text, 'Found a quiet beach.')
  assert.equal(scopes.length, 1)
  assert.equal(scopes[0].provider, 'cloudflare-workers-ai')
  assert.equal(scopes[0].effect, 'workers-ai-run')
  assert.equal(scopes[0].resource, `cloudflare-workers-ai:${MODEL} [binding:AI]`)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], MODEL)
  assert.deepEqual(calls[0][1].messages, [
    { role: 'system', content: 'Be concise.' },
    { role: 'user', content: 'find a quiet beach' },
  ])
})
