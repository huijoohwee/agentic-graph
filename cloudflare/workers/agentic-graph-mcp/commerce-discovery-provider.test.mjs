import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DISCOVERY_EVIDENCE_CHECKS,
  canonicalJson,
  sha256Hex,
} from '../commerce-provider-contract.ts'
import { executeCommerceDiscoveryTool } from './commerce-discovery-provider.ts'

const SOURCE_REVISION = '9ba90b95bcde38db9f25f6b945ba66cfd264e735'
const runtime = {
  COMMERCE_PROVIDER_SOURCE_REVISION: SOURCE_REVISION,
  COMMERCE_PROVIDER_STORAGE_REVISION: 'commerce-discovery-mcp-v1',
  COMMERCE_PROVIDER_VERSION_ID: 'discovery-test-version',
}

const args = Object.freeze({
  bundle_id: 'bundle-1',
  changed_leg_id: 'leg-1',
  prior_offer_id: 'offer-prior',
  prior_amount_minor: 12_000,
  commerceContext: Object.freeze({
    contract: 'commerce.discovery-dispatch/v1',
    intentId: 'intent-1',
    intentDigest: 'a'.repeat(64),
    agentId: 'agent-flight',
    category: 'flight',
    idempotencyKey: 'intent:intent-1:selected',
  }),
})

test('commerce discovery maps the bounded travel owner result into a digest-valid receipt', async () => {
  let routed = null
  const result = await executeCommerceDiscoveryTool(
    'commerce.flight.discover',
    args,
    runtime,
    async request => {
      routed = await request.json()
      return Response.json({
        kind: 'offer',
        legId: 'leg-1',
        offerId: 'offer-live-1',
        amountMinor: 12_500,
        currency: 'SGD',
        priceVerification: 'verified',
        agentId: 'agent-flight',
        promptTokens: 0,
        completionTokens: 0,
        dollarCost: 0,
        provenance: { inventory: 'live-search-and-verify' },
      })
    },
  )
  assert.equal(result.isError, false)
  assert.equal(routed?.operation, 'routeIntent')
  const payload = result.structuredContent
  assert.equal(payload.contract, 'commerce.discovery-receipt/v1')
  const receipt = payload.offers[0]
  assert.equal(receipt.providerRevision, SOURCE_REVISION)
  const expectedDigest = await sha256Hex(canonicalJson(Object.fromEntries(
    Object.entries(receipt).filter(([name]) => name !== 'receiptDigest'),
  )))
  assert.equal(receipt.receiptDigest, expectedDigest)
  assert.deepEqual([...DISCOVERY_EVIDENCE_CHECKS].sort(), [
    'invocation_catalog_parity', 'offer_receipt_binding', 'registered_agent_dispatch',
  ])
})

test('commerce discovery rejects generic constraints instead of synthesizing an offer', async () => {
  let calls = 0
  const result = await executeCommerceDiscoveryTool(
    'commerce.flight.discover',
    { query: 'Singapore to Tokyo', commerceContext: args.commerceContext },
    runtime,
    async () => { calls += 1; return Response.json({ ok: true }) },
  )
  assert.equal(result.isError, true)
  assert.equal(result.structuredContent.code, 'discovery_projection_unsupported')
  assert.equal(calls, 0)
})

test('commerce discovery rejects owner results that consumed model tokens', async () => {
  const result = await executeCommerceDiscoveryTool(
    'commerce.flight.discover',
    args,
    runtime,
    async () => Response.json({
      kind: 'offer', legId: 'leg-1', offerId: 'offer-paid-model', amountMinor: 12_500,
      currency: 'SGD', priceVerification: 'verified', agentId: 'agent-flight',
      promptTokens: 1, completionTokens: 0, dollarCost: 0,
    }),
  )
  assert.equal(result.isError, true)
  assert.equal(result.structuredContent.code, 'discovery_owner_result_invalid')
})

test('commerce discovery cancels an oversized chunked owner response before full buffering', async () => {
  let emitted = 0
  let cancelled = false
  const result = await executeCommerceDiscoveryTool(
    'commerce.flight.discover',
    args,
    runtime,
    async () => new Response(new ReadableStream({
      pull(controller) {
        if (emitted >= 128) { controller.close(); return }
        controller.enqueue(new Uint8Array(1_024).fill(0x20))
        emitted += 1
      },
      cancel() { cancelled = true },
    })),
  )
  assert.equal(result.isError, true)
  assert.equal(result.structuredContent.code, 'discovery_owner_result_invalid')
  assert.equal(cancelled, true)
  assert(emitted < 128)
})
