import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEV_UI_CONVERGENCE_RETRY_DELAY_MS,
  verifyDevGraphCsp,
  verifyDevUiWithConvergenceRetry,
} from '../run-pages-dev-promotion.mjs'
import { AGENTIC_GRAPH_CSP } from '../pages-mirror-headers.mjs'

const DEV_ISOLATION_CSP = "connect-src 'self'; form-action 'self'"

function devCandidate(sourceRevision = 'a'.repeat(40)) {
  const immutableManifestDigest = 'b'.repeat(64)
  const readinessMarkerDigest = 'c'.repeat(64)
  return {
    deployment: {
      projectId: '342a3b35-02d8-44fd-a620-9268c967576d',
      projectName: 'agentic-graph-dev',
      deploymentId: '97921d52-44f1-4ddc-9b73-60c6c03c4b96',
      deploymentUrl: 'https://agentic-graph-dev.pages.dev',
      providerDeploymentUrl: 'https://97921d52.agentic-graph-dev.pages.dev',
      sourceRevision,
      immutableManifestDigest,
      readinessMarkerDigest,
      usesFunctions: false,
    },
    artifact: {
      sourceRevision,
      immutableManifestDigest,
      artifactDigest: 'd'.repeat(64),
      readinessMarkerDigest,
      connectPolicy: DEV_ISOLATION_CSP,
      disabledRuntimeEntries: ['functions/', '_routes.json', '_worker.js'],
    },
  }
}

test('Dev promotion proves both exact CSP policies for the API-bound static candidate', async () => {
  const candidate = devCandidate()
  const releaseSha = candidate.deployment.sourceRevision
  const calls = []
  const result = await verifyDevGraphCsp({
    ...candidate,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options })
      return new Response('<!doctype html><html></html>', { headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': `${DEV_ISOLATION_CSP}, ${AGENTIC_GRAPH_CSP}`,
      } })
    },
  })

  assert.equal(calls.length, 1)
  const requestUrl = new URL(calls[0].url)
  assert.equal(requestUrl.origin, candidate.deployment.deploymentUrl)
  assert.equal(requestUrl.pathname, '/agentic-graph/')
  assert.equal(requestUrl.searchParams.get('kgTransportProof'), releaseSha)
  assert.equal(calls[0].options.redirect, 'manual')
  assert.equal(result.schema, 'agentic-graph-dev-csp-verification/v2')
  assert.equal(result.projectId, candidate.deployment.projectId)
  assert.equal(result.deploymentId, candidate.deployment.deploymentId)
  assert.equal(result.sourceRevision, releaseSha)
  assert.equal(result.immutableManifestDigest, candidate.deployment.immutableManifestDigest)
  assert.deepEqual(result.contentSecurityPolicies, [DEV_ISOLATION_CSP, AGENTIC_GRAPH_CSP].sort())
  assert.equal(result.routeOwner, null)
  assert.equal(result.byteLength, Buffer.byteLength('<!doctype html><html></html>'))
})

test('Dev promotion fails closed when either enforcing CSP policy is missing or changes', async () => {
  const candidate = devCandidate('b'.repeat(40))
  for (const contentSecurityPolicy of [
    null,
    AGENTIC_GRAPH_CSP,
    `${DEV_ISOLATION_CSP}, default-src 'self'`,
    `${DEV_ISOLATION_CSP}, ${AGENTIC_GRAPH_CSP}, default-src 'none'`,
  ]) {
    await assert.rejects(verifyDevGraphCsp({
      ...candidate,
      fetchImpl: async () => new Response('<html></html>', { headers: {
        'content-type': 'text/html',
        ...(contentSecurityPolicy ? { 'content-security-policy': contentSecurityPolicy } : {}),
      } }),
    }), /enforcing CSP policies drifted/)
  }
})

test('static Dev route proof rejects a runtime owner marker and mismatched candidate identity', async () => {
  const candidate = devCandidate('c'.repeat(40))
  await assert.rejects(verifyDevGraphCsp({
    ...candidate,
    fetchImpl: async () => new Response('<html></html>', { headers: {
      'content-type': 'text/html',
      'content-security-policy': `${DEV_ISOLATION_CSP}, ${AGENTIC_GRAPH_CSP}`,
      'x-agentic-graph-route-owner': 'agentic-graph-agent-ready-pages',
    } }),
  }), /static Dev candidate unexpectedly claims a Pages Function route owner/)

  const mismatched = structuredClone(candidate)
  mismatched.artifact.immutableManifestDigest = 'e'.repeat(64)
  let calls = 0
  await assert.rejects(verifyDevGraphCsp({
    ...mismatched,
    fetchImpl: async () => { calls += 1; return new Response('<html></html>') },
  }), /exact static Pages candidate/)
  assert.equal(calls, 0)

  for (const field of ['deploymentUrl', 'providerDeploymentUrl']) {
    const invalidUrl = structuredClone(candidate)
    invalidUrl.deployment[field] = 'not a URL'
    await assert.rejects(verifyDevGraphCsp({
      ...invalidUrl,
      fetchImpl: async () => { calls += 1; return new Response('<html></html>') },
    }), /Dev Pages .* URL is invalid/)
  }
  assert.equal(calls, 0)
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
