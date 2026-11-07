import assert from 'node:assert/strict'
import test from 'node:test'
import { sha256JsonDigest } from 'agentic-os/context/json'
import { createZeroCostWorkersAiBinding } from './workers-ai-cost-gate.mjs'
import { createWorkersAiTestVerifier } from './workers-ai-cost-gate.test-utils.mjs'

const MODEL = '@cf/openai/gpt-oss-20b'

function aiFixture() {
  const calls = []
  return {
    calls,
    binding: { run: async (...args) => { calls.push(args); return { response: 'ok' } } },
  }
}

test('Workers AI blocks before inference when there is no trusted provider verifier', async () => {
  const { binding, calls } = aiFixture()
  const guarded = createZeroCostWorkersAiBinding(binding, { bindingName: 'AI' })
  await assert.rejects(guarded.run(MODEL, { prompt: 'hello' }), /Cost verifier missing/u)
  assert.deepEqual(calls, [])
})

test('Workers AI rejects model identifiers with surrounding whitespace', async () => {
  const { binding, calls } = aiFixture()
  const guarded = createZeroCostWorkersAiBinding(binding, {
    bindingName: 'AI', verifyProviderCostEvidence: createWorkersAiTestVerifier(),
  })
  await assert.rejects(guarded.run(` ${MODEL} `, { prompt: 'hello' }), /model or input/u)
  assert.deepEqual(calls, [])
})

test('Workers AI verifies the exact model, binding, request and free quota-denial proof before dispatch', async () => {
  const { binding, calls } = aiFixture()
  const scopes = []
  const verifier = async request => {
    scopes.push(request)
    return createWorkersAiTestVerifier()(request)
  }
  const guarded = createZeroCostWorkersAiBinding(binding, {
    bindingName: 'AI', verifyProviderCostEvidence: verifier,
  })
  const input = { messages: [{ role: 'user', content: 'hello' }], max_tokens: 24 }
  await guarded.run(MODEL, input, { tags: ['agentic-graph'] })
  input.messages[0].content = 'changed after dispatch'

  assert.equal(scopes.length, 1)
  assert.equal(scopes[0].provider, 'cloudflare-workers-ai')
  assert.equal(scopes[0].effect, 'workers-ai-run')
  assert.equal(scopes[0].resource, `cloudflare-workers-ai:${MODEL} [binding:AI]`)
  assert.equal(scopes[0].requestDigest, await sha256JsonDigest({
    binding: 'AI',
    model: MODEL,
    input: { messages: [{ role: 'user', content: 'hello' }], max_tokens: 24 },
    options: { tags: ['agentic-graph'] },
  }))
  assert.equal(calls.length, 1)
  assert.equal(calls[0][1].messages[0].content, 'hello')
})

test('Workers AI rejects evidence modes that do not guarantee a free quota stop', async () => {
  const { binding, calls } = aiFixture()
  const guarded = createZeroCostWorkersAiBinding(binding, {
    bindingName: 'AI', verifyProviderCostEvidence: createWorkersAiTestVerifier({ mode: 'non-billable' }),
  })
  await assert.rejects(guarded.run(MODEL, { prompt: 'hello' }), /deny or cap/u)
  assert.deepEqual(calls, [])
})

test('Workers AI proof hashes normalized options and preserves the exact abort signal for dispatch', async () => {
  const { binding, calls } = aiFixture()
  const scopes = []
  const verifier = async request => { scopes.push(request); return createWorkersAiTestVerifier()(request) }
  const guarded = createZeroCostWorkersAiBinding(binding, {
    bindingName: 'AI', verifyProviderCostEvidence: verifier,
  })
  const signal = AbortSignal.timeout(5_000)
  await guarded.run(MODEL, { prompt: 'hello' }, { signal, max_tokens: 12 })
  assert.deepEqual(scopes[0].requestDigest, await sha256JsonDigest({
    binding: 'AI',
    model: MODEL,
    input: { prompt: 'hello' },
    options: { signal: { kind: 'abort-signal', aborted: false }, max_tokens: 12 },
  }))
  assert.equal(calls[0][2].signal, signal)
})

test('unclassified Workers AI binding methods are blocked', async () => {
  const { binding, calls } = aiFixture()
  binding.deleteModel = async () => { calls.push(['deleteModel']) }
  const guarded = createZeroCostWorkersAiBinding(binding, {
    bindingName: 'AI', verifyProviderCostEvidence: createWorkersAiTestVerifier(),
  })
  await assert.rejects(guarded.deleteModel(), /blocked/u)
  assert.deepEqual(calls, [])
})
