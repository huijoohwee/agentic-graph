import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEV_UI_CONVERGENCE_RETRY_DELAY_MS,
  verifyDevGraphCsp,
  verifyDevUiWithConvergenceRetry,
} from '../run-pages-dev-promotion.mjs'
import { AGENTIC_GRAPH_CSP } from '../pages-mirror-headers.mjs'

test('Dev promotion proves the exact enforced CSP on the exact candidate app route', async () => {
  const releaseSha = 'a'.repeat(40)
  const calls = []
  const result = await verifyDevGraphCsp({
    origin: 'https://a1b2c3.agentic-graph-dev.pages.dev',
    releaseSha,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options })
      return new Response('<!doctype html><html></html>', { headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': AGENTIC_GRAPH_CSP,
        'x-agentic-graph-route-owner': 'agentic-graph-agent-ready-pages',
      } })
    },
  })

  assert.equal(calls.length, 1)
  const requestUrl = new URL(calls[0].url)
  assert.equal(requestUrl.origin, 'https://a1b2c3.agentic-graph-dev.pages.dev')
  assert.equal(requestUrl.pathname, '/agentic-graph/')
  assert.equal(requestUrl.searchParams.get('kgTransportProof'), releaseSha)
  assert.equal(calls[0].options.redirect, 'manual')
  assert.equal(result.schema, 'agentic-graph-dev-csp-verification/v1')
  assert.equal(result.sourceRevision, releaseSha)
  assert.equal(result.contentSecurityPolicy, AGENTIC_GRAPH_CSP)
  assert.equal(result.byteLength, Buffer.byteLength('<!doctype html><html></html>'))
})

test('Dev promotion fails closed when the candidate app response omits or changes CSP', async () => {
  for (const contentSecurityPolicy of [null, "default-src 'self'"]) {
    await assert.rejects(verifyDevGraphCsp({
      origin: 'https://agentic-graph-dev.pages.dev',
      releaseSha: 'b'.repeat(40),
      fetchImpl: async () => new Response('<html></html>', { headers: {
        'content-type': 'text/html',
        ...(contentSecurityPolicy ? { 'content-security-policy': contentSecurityPolicy } : {}),
        'x-agentic-graph-route-owner': 'agentic-graph-agent-ready-pages',
      } }),
    }), /enforcing CSP drifted/)
  }
})

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
