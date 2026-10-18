import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEV_UI_CONVERGENCE_RETRY_DELAY_MS,
  verifyDevUiWithConvergenceRetry,
} from '../run-pages-dev-promotion.mjs'

test('Dev promotion retries one transient browser convergence failure against the same candidate', async () => {
  const input = { origin: 'https://agentic-graph-dev.pages.dev', releaseSha: 'a'.repeat(40) }
  const calls = []
  const delays = []
  const verification = { views: ['Table'] }
  const result = await verifyDevUiWithConvergenceRetry(input, {
    verify: async received => {
      calls.push(received)
      if (calls.length === 1) throw new Error('locator.waitFor timeout waiting for locator Canvas View Mode')
      return verification
    },
    sleep: async milliseconds => delays.push(milliseconds),
  })

  assert.deepEqual(result, { attempts: 2, verification })
  assert.deepEqual(calls, [input, input])
  assert.deepEqual(delays, [DEV_UI_CONVERGENCE_RETRY_DELAY_MS])
})

test('Dev promotion does not retry a candidate-identity failure', async () => {
  let calls = 0
  await assert.rejects(verifyDevUiWithConvergenceRetry({}, {
    verify: async () => {
      calls += 1
      throw new Error('UI verification candidate identity is invalid')
    },
    sleep: async () => assert.fail('candidate identity failures must not wait for edge convergence'),
  }), /candidate identity is invalid/)
  assert.equal(calls, 1)
})
