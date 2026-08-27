import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DISCOVERY_CONTRACT,
  EXPERIENCE_AGENT_ID,
  PROVIDER_CONTRACT,
  type ExperienceIdentity,
} from './contract'
import { createExperienceDiscoveryWorker } from './index'
import type { ExperienceDiscoveryRuntimeEnv, ProviderFetch } from './provider'

const NOW_MS = Date.parse('2026-08-20T08:00:00.000Z')
const API_TOKEN = 'live-provider-test-token-123'
const BASE_URL = 'https://inventory.live-experiences.travel'

const identity = Object.freeze({
  catalogueId: 'tokyo-teamlab-2026',
  location: Object.freeze({
    locationId: 'tokyo-azabudai',
    countryCode: 'JP',
    locality: 'Tokyo',
    timeZone: 'Asia/Tokyo',
  }),
  serviceDate: '2026-09-02',
  startTimeLocal: '18:30',
  providerId: 'live-experiences-co',
  productId: 'teamlab-borderless-entry',
  party: Object.freeze({ adults: 2, children: 1, infants: 0 }),
}) satisfies ExperienceIdentity

const routeCatalogue = JSON.stringify({
  'experience-leg': { ...identity, expectedCurrency: 'SGD' },
})

const env = Object.freeze({
  EXPERIENCE_ENVIRONMENT: 'production',
  EXPERIENCE_AGENT_ID,
  EXPERIENCE_PROVIDER_ID: identity.providerId,
  EXPERIENCE_PROVIDER_BASE_URL: BASE_URL,
  EXPERIENCE_PROVIDER_SEARCH_PATH: '/v1/experiences/search',
  EXPERIENCE_PROVIDER_VERIFY_PATH: '/v1/experiences/verify',
  EXPERIENCE_ROUTE_CATALOGUE_JSON: routeCatalogue,
  EXPERIENCE_PROVIDER_TIMEOUT_MS: '5500',
  EXPERIENCE_READINESS_TIMEOUT_MS: '5500',
  EXPERIENCE_MAX_RESPONSE_BYTES: '1048576',
  EXPERIENCE_PROVIDER_API_TOKEN: API_TOKEN,
}) as ExperienceDiscoveryRuntimeEnv

const requestBody = Object.freeze({
  operation: 'discoverOffers',
  contractVersion: DISCOVERY_CONTRACT,
  agentId: EXPERIENCE_AGENT_ID,
  legId: 'experience-leg',
  intent: Object.freeze({
    intentId: 'event-1:experience-leg',
    category: 'experience',
    constraints: Object.freeze({
      bundle_id: 'bundle-1',
      changed_leg_id: 'flight-leg',
      prior_offer_id: 'experience-old',
      prior_amount_minor: 250,
    }),
  }),
})

const discoveryRequest = (body: unknown = requestBody, headers: HeadersInit = {}): Request => new Request(
  'https://experience-discovery.internal/v1/requote',
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-agenticgraph-component': 'Agent_Registry',
      ...headers,
    },
    body: JSON.stringify(body),
  },
)

const providerOffer = (overrides: Record<string, unknown> = {}) => ({
  offerReference: 'provider-offer-123',
  identity,
  currency: 'SGD',
  amountMinor: 12750,
  available: true,
  ...overrides,
})

const searchResponse = (offers: unknown[] = [providerOffer()]): Response => Response.json({
  contractVersion: PROVIDER_CONTRACT,
  status: 'ok',
  offers,
})

const verifyResponse = (overrides: Record<string, unknown> = {}): Response => Response.json({
  contractVersion: PROVIDER_CONTRACT,
  status: 'verified',
  verificationReference: 'verification-456',
  verificationValidUntil: '2026-08-20T09:00:00.000Z',
  offer: providerOffer(),
  ...overrides,
})

const successfulProvider = (calls: Request[]): ProviderFetch => async (request) => {
  calls.push(request)
  return new URL(request.url).pathname.endsWith('/search') ? searchResponse() : verifyResponse()
}

describe('live experience discovery adapter', () => {
  it('keeps liveness public but fails readiness closed for missing and sentinel configuration', async () => {
    let calls = 0
    const worker = createExperienceDiscoveryWorker(async () => {
      calls += 1
      return searchResponse()
    }, () => NOW_MS)
    const live = await worker.fetch(new Request('https://internal/livez'), {} as ExperienceDiscoveryRuntimeEnv)
    assert.equal(live.status, 200)
    assert.deepEqual(await live.json(), {
      ok: true,
      service: 'agenticgraph-travel-experience-discovery',
      status: 'live',
    })

    const missing = await worker.fetch(new Request('https://internal/readyz'), {} as ExperienceDiscoveryRuntimeEnv)
    assert.equal(missing.status, 503)
    const missingBody = await missing.json() as { fields: string[] }
    assert(missingBody.fields.includes('EXPERIENCE_PROVIDER_API_TOKEN'))
    assert(missingBody.fields.includes('EXPERIENCE_ROUTE_CATALOGUE_JSON'))

    const sentinel = await worker.fetch(new Request('https://internal/readyz'), {
      ...env,
      EXPERIENCE_PROVIDER_ID: 'unconfigured',
      EXPERIENCE_PROVIDER_BASE_URL: 'https://provider.invalid',
      EXPERIENCE_PROVIDER_API_TOKEN: 'replace-with-live-token',
    } as ExperienceDiscoveryRuntimeEnv)
    assert.equal(sentinel.status, 503)
    const serialized = JSON.stringify(await sentinel.json())
    assert.equal(serialized.includes('replace-with-live-token'), false)
    assert.equal(calls, 0)
  })

  it('actively proves authenticated Search then Verify and advertises only experience capability', async () => {
    const calls: Request[] = []
    const worker = createExperienceDiscoveryWorker(successfulProvider(calls), () => NOW_MS)
    const response = await worker.fetch(
      new Request('https://internal/readyz?required_category=experience'),
      env,
    )
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.deepEqual(body, {
      ok: true,
      service: 'agenticgraph-travel-experience-discovery',
      provider: identity.providerId,
      dependencies: { experienceProvider: 'live-search-verify-probe-passed' },
      configuredRoutes: 1,
      providerProbe: 'live-authenticated-search-verify-passed',
      capabilities: {
        categories: ['experience'],
        inventory: 'live-search-and-verify',
        verificationRequired: false,
      },
    })
    assert.equal(calls.length, 2)
    assert.equal(calls[0]?.url, `${BASE_URL}/v1/experiences/search`)
    assert.equal(calls[1]?.url, `${BASE_URL}/v1/experiences/verify`)
    assert.equal(calls[0]?.headers.get('authorization'), `Bearer ${API_TOKEN}`)
    assert.deepEqual(await calls[0]?.json(), {
      operation: 'searchExperiences',
      contractVersion: PROVIDER_CONTRACT,
      identity,
    })
    assert.deepEqual(await calls[1]?.json(), {
      operation: 'verifyExperience',
      contractVersion: PROVIDER_CONTRACT,
      offerReference: 'provider-offer-123',
      identity,
    })
  })

  it('returns only the verified provider price and strict identity provenance', async () => {
    const calls: Request[] = []
    const worker = createExperienceDiscoveryWorker(successfulProvider(calls), () => NOW_MS)
    const response = await worker.fetch(discoveryRequest(), env)
    assert.equal(response.status, 200)
    const quote = await response.json() as Record<string, unknown> & {
      provenance: Record<string, string>
    }
    assert.equal(quote.kind, 'offer')
    assert.equal(quote.legId, 'experience-leg')
    assert.match(String(quote.offerId), /^experience_[a-f0-9]{32}$/)
    assert.equal(quote.amountMinor, 12750)
    assert.equal(quote.currency, 'SGD')
    assert.equal(quote.priceVerification, 'verified')
    assert.equal(quote.agentId, EXPERIENCE_AGENT_ID)
    assert.equal(quote.provenance.catalogueId, identity.catalogueId)
    assert.equal(quote.provenance.locationId, identity.location.locationId)
    assert.equal(quote.provenance.serviceDate, identity.serviceDate)
    assert.equal(quote.provenance.startTimeLocal, identity.startTimeLocal)
    assert.equal(quote.provenance.productId, identity.productId)
    assert.equal(quote.provenance.party, 'adults:2,children:1,infants:0')
    assert.equal(quote.provenance.bookability, 'verified-not-ordered')
    assert.equal(JSON.stringify(quote).includes(API_TOKEN), false)
    assert.equal(calls.length, 2)
  })

  it('rejects a mixed valid and wrong-identity search response before Verify', async () => {
    let calls = 0
    const worker = createExperienceDiscoveryWorker(async (request) => {
      calls += 1
      if (new URL(request.url).pathname.endsWith('/search')) {
        return searchResponse([
          providerOffer(),
          providerOffer({
            offerReference: 'provider-offer-drifted',
            identity: { ...identity, productId: 'different-product' },
          }),
        ])
      }
      return verifyResponse()
    }, () => NOW_MS)
    const response = await worker.fetch(discoveryRequest(), env)
    assert.equal(response.status, 502)
    assert.deepEqual(await response.json(), { ok: false, code: 'provider-contract-violation' })
    assert.equal(calls, 1)
  })

  it('rejects wrong identity, non-integer money, and wrong currency from Search', async () => {
    const invalidOffers = [
      providerOffer({ identity: { ...identity, catalogueId: 'different-catalogue' } }),
      providerOffer({ identity: { ...identity, location: { ...identity.location, locationId: 'osaka' } } }),
      providerOffer({ identity: { ...identity, serviceDate: '2026-09-03' } }),
      providerOffer({ identity: { ...identity, startTimeLocal: '20:00' } }),
      providerOffer({ identity: { ...identity, providerId: 'different-provider' } }),
      providerOffer({ identity: { ...identity, productId: 'different-product' } }),
      providerOffer({ identity: { ...identity, party: { ...identity.party, adults: 3 } } }),
      providerOffer({ amountMinor: 12750.5 }),
      providerOffer({ currency: 'USD' }),
    ]
    for (const invalid of invalidOffers) {
      let calls = 0
      const worker = createExperienceDiscoveryWorker(async () => {
        calls += 1
        return searchResponse([invalid])
      }, () => NOW_MS)
      const response = await worker.fetch(discoveryRequest(), env)
      assert.equal(response.status, 502)
      assert.equal(calls, 1)
    }
  })

  it('rejects Verify identity/reference drift, fractional money, and expired verification', async () => {
    const invalidVerifications = [
      { offer: providerOffer({ offerReference: 'different-offer' }) },
      { offer: providerOffer({ identity: { ...identity, catalogueId: 'different-catalogue' } }) },
      { offer: providerOffer({ identity: { ...identity, location: { ...identity.location, locality: 'Osaka' } } }) },
      { offer: providerOffer({ identity: { ...identity, serviceDate: '2026-09-03' } }) },
      { offer: providerOffer({ identity: { ...identity, startTimeLocal: '19:00' } }) },
      { offer: providerOffer({ identity: { ...identity, providerId: 'different-provider' } }) },
      { offer: providerOffer({ identity: { ...identity, productId: 'different-product' } }) },
      { offer: providerOffer({ identity: { ...identity, party: { ...identity.party, children: 2 } } }) },
      { offer: providerOffer({ amountMinor: 12750.5 }) },
      { offer: providerOffer({ currency: 'USD' }) },
      { verificationValidUntil: '2026-08-20T07:59:59.000Z' },
      { status: 'search-only' },
    ]
    for (const invalid of invalidVerifications) {
      let calls = 0
      const worker = createExperienceDiscoveryWorker(async (request) => {
        calls += 1
        return new URL(request.url).pathname.endsWith('/search')
          ? searchResponse()
          : verifyResponse(invalid)
      }, () => NOW_MS)
      const response = await worker.fetch(discoveryRequest(), env)
      assert.equal(response.status, 502)
      assert.deepEqual(await response.json(), { ok: false, code: 'provider-verification-invalid' })
      assert.equal(calls, 2)
    }
  })
})
