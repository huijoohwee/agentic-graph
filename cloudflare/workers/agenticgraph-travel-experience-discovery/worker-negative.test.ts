import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createExperienceDiscoveryWorker } from './index'
import type { ExperienceDiscoveryRuntimeEnv } from './provider'
import { DISCOVERY_CONTRACT, EXPERIENCE_AGENT_ID, PROVIDER_CONTRACT } from './contract'

const baseEnv = Object.freeze({
  EXPERIENCE_ENVIRONMENT: 'production',
  EXPERIENCE_AGENT_ID,
  EXPERIENCE_PROVIDER_ID: 'live-experiences-co',
  EXPERIENCE_PROVIDER_BASE_URL: 'https://inventory.live-experiences.travel',
  EXPERIENCE_PROVIDER_SEARCH_PATH: '/v1/experiences/search',
  EXPERIENCE_PROVIDER_VERIFY_PATH: '/v1/experiences/verify',
  EXPERIENCE_ROUTE_CATALOGUE_JSON: JSON.stringify({
    'experience-leg': {
      catalogueId: 'catalogue-1',
      location: {
        locationId: 'tokyo', countryCode: 'JP', locality: 'Tokyo', timeZone: 'Asia/Tokyo',
      },
      serviceDate: '2026-09-02',
      startTimeLocal: '18:30',
      providerId: 'live-experiences-co',
      productId: 'product-1',
      party: { adults: 1, children: 0, infants: 0 },
      expectedCurrency: 'SGD',
    },
  }),
  EXPERIENCE_PROVIDER_TIMEOUT_MS: '100',
  EXPERIENCE_READINESS_TIMEOUT_MS: '100',
  EXPERIENCE_MAX_RESPONSE_BYTES: '1024',
  EXPERIENCE_PROVIDER_API_TOKEN: 'live-provider-test-token-123',
}) as ExperienceDiscoveryRuntimeEnv

const body = {
  operation: 'discoverOffers',
  contractVersion: DISCOVERY_CONTRACT,
  agentId: EXPERIENCE_AGENT_ID,
  legId: 'experience-leg',
  intent: {
    intentId: 'event-1:experience-leg',
    category: 'experience',
    constraints: {
      bundle_id: 'bundle-1', changed_leg_id: 'flight-leg', prior_offer_id: null, prior_amount_minor: null,
    },
  },
}

const request = (value: unknown = body, headers: HeadersInit = {}): Request => new Request(
  'https://experience-discovery.internal/v1/requote',
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-knowgrph-component': 'Agent_Registry',
      ...headers,
    },
    body: JSON.stringify(value),
  },
)

describe('experience adapter boundary failures', () => {
  it('rejects caller spoofing, wrong categories, unknown fields, and oversized bodies without provider calls', async () => {
    let calls = 0
    const worker = createExperienceDiscoveryWorker(async () => {
      calls += 1
      return Response.json({})
    })
    assert.equal((await worker.fetch(request(body, { 'x-knowgrph-component': 'Reopt_Worker' }), baseEnv)).status, 403)
    assert.equal((await worker.fetch(request({
      ...body,
      intent: { ...body.intent, category: 'flight' },
    }), baseEnv)).status, 400)
    assert.equal((await worker.fetch(request({ ...body, credential: 'must-not-cross' }), baseEnv)).status, 400)
    assert.equal((await worker.fetch(request({
      ...body,
      intent: { ...body.intent, intentId: 'event-1:different-leg' },
    }), baseEnv)).status, 400)
    const oversized = request({ ...body, padding: 'x'.repeat(17 * 1024) })
    assert.equal((await worker.fetch(oversized, baseEnv)).status, 400)
    assert.equal((await worker.fetch(
      new Request('https://internal/readyz?required_category=flight'),
      baseEnv,
    )).status, 400)
    assert.equal(calls, 0)
  })

  it('bounds the full provider call even when a provider ignores abort', async () => {
    const worker = createExperienceDiscoveryWorker(async () => new Promise<Response>(() => undefined))
    const startedAt = Date.now()
    const response = await worker.fetch(request(), baseEnv)
    const elapsed = Date.now() - startedAt
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { ok: false, code: 'provider-timeout' })
    assert(elapsed >= 80 && elapsed < 1_000, `expected a bounded 100ms timeout, observed ${elapsed}ms`)
  })

  it('shares one deadline when Search consumes most of the budget and Verify hangs', async () => {
    let calls = 0
    const worker = createExperienceDiscoveryWorker(async (outbound) => {
      calls += 1
      if (new URL(outbound.url).pathname.endsWith('/search')) {
        await new Promise((resolve) => setTimeout(resolve, 80))
        return Response.json({
          contractVersion: PROVIDER_CONTRACT,
          status: 'ok',
          offers: [{
            offerReference: 'provider-offer-1',
            identity: {
              catalogueId: 'catalogue-1',
              location: {
                locationId: 'tokyo', countryCode: 'JP', locality: 'Tokyo', timeZone: 'Asia/Tokyo',
              },
              serviceDate: '2026-09-02',
              startTimeLocal: '18:30',
              providerId: 'live-experiences-co',
              productId: 'product-1',
              party: { adults: 1, children: 0, infants: 0 },
            },
            currency: 'SGD',
            amountMinor: 1000,
            available: true,
          }],
        })
      }
      return new Promise<Response>(() => undefined)
    })
    const startedAt = Date.now()
    const response = await worker.fetch(request(), baseEnv)
    const elapsed = Date.now() - startedAt
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { ok: false, code: 'provider-timeout' })
    assert.equal(calls, 2)
    assert(elapsed >= 80 && elapsed < 350, `expected one shared 100ms budget, observed ${elapsed}ms`)
  })

  it('rejects declared and streamed oversized provider bodies', async () => {
    const oversizedPayload = JSON.stringify({
      contractVersion: PROVIDER_CONTRACT,
      status: 'ok',
      offers: [],
      padding: 'x'.repeat(2_000),
    })
    for (const responseFactory of [
      () => new Response(oversizedPayload, {
        status: 200,
        headers: { 'content-type': 'application/json', 'content-length': String(oversizedPayload.length) },
      }),
      () => new Response(oversizedPayload, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ]) {
      const worker = createExperienceDiscoveryWorker(async () => responseFactory())
      const response = await worker.fetch(request(), baseEnv)
      assert.equal(response.status, 502)
      assert.deepEqual(await response.json(), { ok: false, code: 'provider-contract-violation' })
    }
  })

  it('requires JSON content types from both caller and provider', async () => {
    let calls = 0
    const worker = createExperienceDiscoveryWorker(async () => {
      calls += 1
      return new Response('{}', { headers: { 'content-type': 'text/plain' } })
    })
    const caller = await worker.fetch(request(body, { 'content-type': 'text/plain' }), baseEnv)
    assert.equal(caller.status, 400)
    assert.equal(calls, 0)
    const provider = await worker.fetch(request(), baseEnv)
    assert.equal(provider.status, 502)
    assert.equal(calls, 1)
  })
})
