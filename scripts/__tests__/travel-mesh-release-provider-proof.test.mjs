import assert from 'node:assert/strict'
import test from 'node:test'
import { TRAVEL_MESH_PLAN } from '../travel-mesh-release-plan.mjs'
import { commerceProviderRuntimeProofFor, probeMesh } from '../travel-mesh-release.mjs'

const sourceRevision = 'a'.repeat(40)
const providerVersionId = 'b'.repeat(64)
const environment = Object.freeze({
  TRAVEL_ACCESS_CLIENT_ID: `access-${'1'.repeat(32)}`,
  TRAVEL_ACCESS_CLIENT_SECRET: `access-${'2'.repeat(32)}`,
  TRAVEL_PUBLIC_ZONE_NAME: 'airvio.co',
})
const spec = JSON.stringify([
  { id: 'mcp', service: 'agenticgraph-mcp', url: 'https://airvio.co/agenticgraph/control-plane/mcp/readyz' },
  { id: 'operator-gateway', service: 'agenticgraph-travel-operator-gateway', url: 'https://airvio.co/agenticgraph/control-plane/travel/reconciliation/readyz' },
  { id: 'storage', service: 'agenticgraph-storage', url: 'https://storage.airvio.co/readyz' },
])

const serviceFor = url => new URL(url).pathname.includes('/travel/reconciliation/')
  ? 'agenticgraph-travel-operator-gateway'
  : new URL(url).hostname.startsWith('storage.') ? 'agenticgraph-storage' : 'agenticgraph-mcp'

const fetchWithProof = proof => async url => Response.json({
  ok: true,
  service: serviceFor(url),
  ...(new URL(url).pathname.includes('/travel/reconciliation/') ? { providerRuntime: proof } : {}),
})

test('release plan keeps all provider proof hops private and service-bound', () => {
  const marketplace = TRAVEL_MESH_PLAN.find(({ id }) => id === 'marketplace')
  const commerce = TRAVEL_MESH_PLAN.find(({ id }) => id === 'travel-commerce')
  const operator = TRAVEL_MESH_PLAN.find(({ id }) => id === 'operator-gateway')
  assert.equal(marketplace.routeFree, true)
  assert.deepEqual(marketplace.secrets, [
    ['MARKETPLACE_PROVIDER_AUTH_SECRET', 'MARKETPLACE_PROVIDER_AUTH_SECRET'],
  ])
  assert.deepEqual(commerce.serviceTargets.filter(([name]) => ['DISCOVERY_SERVICE', 'MARKETPLACE_SERVICE'].includes(name)), [
    ['DISCOVERY_SERVICE', 'TRAVEL_MCP_SERVICE', 'agenticgraph-mcp'],
    ['MARKETPLACE_SERVICE', 'MARKETPLACE_SERVICE', 'agenticgraph-marketplace-production'],
  ])
  assert.deepEqual(operator.dependencies, ['travel-commerce'])
  assert.deepEqual(commerce.secrets.slice(-2), [
    ['CHECKOUT_PROVIDER_AUTH_SECRET', 'CHECKOUT_PROVIDER_AUTH_SECRET'],
    ['MARKETPLACE_PROVIDER_AUTH_SECRET', 'MARKETPLACE_PROVIDER_AUTH_SECRET'],
  ])
})

test('release probe accepts and records exact provider handler and metadata evidence', async () => {
  const proof = commerceProviderRuntimeProofFor(sourceRevision, providerVersionId)
  const probes = await probeMesh(spec, {
    environment,
    fetchFn: fetchWithProof(proof),
    providerMetadata: { sourceRevision, providerVersionId },
  })
  const observed = probes.find(({ id }) => id === 'operator-gateway').providerRuntime
  assert.deepEqual(observed, proof)
  assert.deepEqual(observed.providers.map(({ id }) => id), ['discovery', 'checkout', 'marketplace'])
})

test('release probe rejects missing handlers and coherent or partial metadata drift', async () => {
  const missingHandler = structuredClone(commerceProviderRuntimeProofFor(sourceRevision, providerVersionId))
  missingHandler.providers[0].capabilitiesDigest = '0'.repeat(64)
  await assert.rejects(() => probeMesh(spec, {
    environment, fetchFn: fetchWithProof(missingHandler), providerMetadata: { sourceRevision, providerVersionId },
  }), /operator-gateway live dependency probe failed/)

  const coherentDrift = commerceProviderRuntimeProofFor('c'.repeat(40), providerVersionId)
  await assert.rejects(() => probeMesh(spec, {
    environment, fetchFn: fetchWithProof(coherentDrift), providerMetadata: { sourceRevision, providerVersionId },
  }), /operator-gateway live dependency probe failed/)

  const partialDrift = structuredClone(commerceProviderRuntimeProofFor(sourceRevision, providerVersionId))
  partialDrift.providers[2].evidence.storageCompatibilityRevision = 'marketplace-d1-drifted'
  await assert.rejects(() => probeMesh(spec, {
    environment, fetchFn: fetchWithProof(partialDrift), providerMetadata: { sourceRevision, providerVersionId },
  }), /operator-gateway live dependency probe failed/)
})
