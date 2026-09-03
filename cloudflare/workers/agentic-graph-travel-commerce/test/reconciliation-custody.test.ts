import { createExecutionContext, env, reset, runInDurableObject } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'
import worker from '../src/index'
import { cascadeIdFor, minorUnits } from '../../../../src/bundle/bundle-runtime'
import type { BundleSeed, CascadeRecord, Quote } from '../../../../src/bundle/bundle-types'
import { discoveryPhaseDeadline, ReoptWorker } from '../../../../src/bundle/reopt-worker'
import {
  DISCOVERY_EVIDENCE_CHECKS,
  DISCOVERY_PROVIDER_CONTRACT,
  MARKETPLACE_EVIDENCE_CHECKS,
  MARKETPLACE_PROVIDER_CONTRACT,
  runtimeEvidenceResponse,
} from '../../commerce-provider-contract'
import { verifyCommerceProviderControlRequest } from '../../commerce-provider-auth.ts'

const PROVIDER_SOURCE_REVISION = '1234567890abcdef1234567890abcdef12345678'
const PROVIDER_VERSION_ID = 'provider-release-test-v1'
const CHECKOUT_AUTH_SECRET = 'checkout-provider-graph-test-secret'
const MARKETPLACE_AUTH_SECRET = 'marketplace-provider-graph-test-secret'

afterEach(() => reset())

describe('reconciliation custody and operator decisions', () => {
  it('fails Production readiness when operator auth is missing, weak, or shared', async () => {
    const distinct = productionReadyEnv('o'.repeat(32), 'a'.repeat(32))
    const healthy = await worker.fetch(
      new Request('https://travel.test/readyz'), distinct, createExecutionContext(),
    )
    expect(healthy.status).toBe(200)
    expect(await healthy.json()).toMatchObject({
      ok: true,
      checks: expect.arrayContaining([
        expect.objectContaining({ name: 'reconciliation-operator-auth', ok: true }),
      ]),
    })
    for (const candidate of ['', 'weak', 'a'.repeat(32)]) {
      const response = await worker.fetch(
        new Request('https://travel.test/readyz'),
        productionReadyEnv(candidate, 'a'.repeat(32)),
        createExecutionContext(),
      )
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({
        ok: false,
        checks: expect.arrayContaining([
          expect.objectContaining({
            name: 'reconciliation-operator-auth', ok: false,
            reason: 'invalid-missing-or-shared-secret',
          }),
        ]),
      })
    }
    expect((await operatorRequest(
      productionReadyEnv('weak', 'a'.repeat(32)),
      reconciliationUrl('production-auth-bundle', 'production-auth-cascade'),
      {
        decision_id: 'production-auth-decision', decision: 'release',
        operator_id: 'production-operator', reason: 'definitive-no-effect',
      },
      'weak',
    )).status).toBe(401)
  })

  it('fails Production readiness when provider auth is missing, weak, or shared', async () => {
    const base = productionReadyEnv('o'.repeat(32), 'a'.repeat(32))
    for (const runtime of [
      { ...base, CHECKOUT_PROVIDER_AUTH_SECRET: '' },
      { ...base, MARKETPLACE_PROVIDER_AUTH_SECRET: 'weak' },
      { ...base, MARKETPLACE_PROVIDER_AUTH_SECRET: CHECKOUT_AUTH_SECRET },
    ] as TravelCommerceEnv[]) {
      const response = await worker.fetch(
        new Request('https://travel.test/readyz'), runtime, createExecutionContext(),
      )
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({
        ok: false,
        checks: expect.arrayContaining([expect.objectContaining({
          name: 'commerce-provider-auth', ok: false,
          reason: 'invalid-missing-or-shared-secret',
        })]),
      })
    }
  })

  it('exposes only the operator-authenticated reconciliation capability identity', async () => {
    const runtime = productionReadyEnv('o'.repeat(32), 'a'.repeat(32))
    const endpoint = 'https://travel.test/v1/reconciliation/runtime'
    const apiToken = await worker.fetch(new Request(endpoint, {
      headers: { authorization: `Bearer ${'a'.repeat(32)}` },
    }), runtime, createExecutionContext())
    expect(apiToken.status).toBe(401)

    const response = await worker.fetch(new Request(endpoint, {
      headers: { authorization: `Bearer ${'o'.repeat(32)}` },
    }), runtime, createExecutionContext())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true,
      service: 'agentic-travel-commerce',
      lane: 'Production_Lane',
      capability: 'resolve-reconciliation',
      contract: 'agentic-graph.travel-reconciliation-control/v1',
      providerRuntime: {
        schema: 'commerce.provider-runtime-proof/v1',
        sourceRevision: PROVIDER_SOURCE_REVISION,
        providerVersionId: PROVIDER_VERSION_ID,
        providers: [
          expect.objectContaining({ id: 'discovery', contract: DISCOVERY_PROVIDER_CONTRACT }),
          expect.objectContaining({ id: 'checkout', contract: 'commerce.checkout-provider/v1' }),
          expect.objectContaining({ id: 'marketplace', contract: MARKETPLACE_PROVIDER_CONTRACT }),
        ],
      },
    })

    const missingMarketplace = {
      ...runtime,
      MARKETPLACE_SERVICE: service(async () => Response.json({ ok: false }, { status: 404 })),
    } as TravelCommerceEnv
    const unavailable = await worker.fetch(new Request(endpoint, {
      headers: { authorization: `Bearer ${'o'.repeat(32)}` },
    }), missingMarketplace, createExecutionContext())
    expect(unavailable.status).toBe(503)
    expect(await unavailable.json()).toMatchObject({ reason: 'provider-runtime-unavailable' })
  })

  it('quarantines an ambiguous attempted settlement beyond 24h and blocks overlapping cascades', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const seed = chainSeed('quarantine-retention')
    await runtime.BUNDLE_GRAPH.getByName(seed.bundleId).initBundle(seed)
    const event = { bundleId: seed.bundleId, legId: 'flight', eventId: 'ambiguous' }
    const result = await createAmbiguous(runtime, event)
    expect(result).toMatchObject({
      kind: 'reconciliation-required', reason: 'settlement-response-ambiguous', settlementCalls: 1,
    })
    const ledger = runtime.ENVELOPE_LEDGER.getByName(seed.principalId)
    expect(await ledger.getHolds()).toEqual(expect.arrayContaining([
      expect.objectContaining({ cascadeId: cascadeIdFor(event), state: 'quarantined' }),
    ]))
    expect(await ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: 775 })

    await runInDurableObject(ledger, async (instance, state) => {
      state.storage.sql.exec(
        'UPDATE holds SET expires_at = ? WHERE cascade_id = ?',
        Date.now() - 86_400_001, cascadeIdFor(event),
      )
      await instance.alarm!()
    })
    expect(await ledger.getHolds()).toEqual(expect.arrayContaining([
      expect.objectContaining({ cascadeId: cascadeIdFor(event), state: 'quarantined' }),
    ]))
    expect(await ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: 775 })
    const overlap = { ...event, eventId: 'overlap' }
    expect(await runtime.BUNDLE_GRAPH.getByName(seed.bundleId).beginCascade(overlap))
      .toEqual({ kind: 'pending', cascadeId: cascadeIdFor(overlap), reason: 'bundle-busy' })
  })

  it('requires the distinct operator bearer and resolves release idempotently without drift', async () => {
    const runtime = operatorEnv('operator-secret-release')
    const seed = chainSeed('operator-release')
    const graph = runtime.BUNDLE_GRAPH.getByName(seed.bundleId)
    await graph.initBundle(seed)
    const event = { bundleId: seed.bundleId, legId: 'flight', eventId: 'ambiguous' }
    await createAmbiguous(runtime, event)
    const input = {
      decision_id: 'release-decision-001', decision: 'release',
      operator_id: 'ops-katrina', reason: 'provider-confirmed-no-effect',
    }
    const url = reconciliationUrl(seed.bundleId, cascadeIdFor(event))
    expect((await operatorRequest(runtime, url, input, 'test-travel-token')).status).toBe(401)
    expect((await operatorRequest(runtime, url, input, 'wrong-operator-token')).status).toBe(401)

    const response = await operatorRequest(runtime, url, input, 'operator-secret-release')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      kind: 'reconciliation-resolved', decision: 'release', custody: 'resolved',
      outcome: { kind: 'rolled-back', releaseConfirmed: true },
    })
    const replay = await operatorRequest(runtime, url, input, 'operator-secret-release')
    expect(replay.status).toBe(200)
    expect(await replay.json()).toMatchObject({ kind: 'idempotent', custody: 'idempotent' })
    const drift = await operatorRequest(runtime, url, {
      ...input, decision: 'commit', reason: 'provider-effect-now-claimed',
    }, 'operator-secret-release')
    expect(drift.status).toBe(409)
    expect(await drift.json()).toMatchObject({ kind: 'rejected', reason: 'idempotency-conflict' })
    const conflictingDecision = await operatorRequest(runtime, url, {
      ...input, decision_id: 'release-decision-002', decision: 'commit',
    }, 'operator-secret-release')
    expect(conflictingDecision.status).toBe(409)
    expect(await conflictingDecision.json()).toMatchObject({
      kind: 'rejected', reason: 'idempotency-conflict',
    })

    expect(await runtime.ENVELOPE_LEDGER.getByName(seed.principalId).getAvailableBalance())
      .toMatchObject({ availableBalanceMinor: 800 })
    expect((await graph.getSnapshot())?.legs.find((leg) => leg.legId === 'hotel'))
      .toMatchObject({ committedOfferId: 'hotel-old', committedAmountMinor: 100 })
    const next = { ...event, eventId: 'after-release' }
    expect(await graph.beginCascade(next)).toMatchObject({ kind: 'plan' })
  })

  it('commits confirmed provider effect idempotently and converges ledger with graph', async () => {
    const runtime = operatorEnv('operator-secret-commit')
    const seed = chainSeed('operator-commit')
    const graph = runtime.BUNDLE_GRAPH.getByName(seed.bundleId)
    await graph.initBundle(seed)
    const event = { bundleId: seed.bundleId, legId: 'flight', eventId: 'ambiguous' }
    await createAmbiguous(runtime, event)
    const input = {
      decision_id: 'commit-decision-001', decision: 'commit',
      operator_id: 'ops-katrina', reason: 'provider-ledger-effect-confirmed',
    }
    const url = reconciliationUrl(seed.bundleId, cascadeIdFor(event))
    const response = await operatorRequest(runtime, url, input, 'operator-secret-commit')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      kind: 'reconciliation-resolved', decision: 'commit', custody: 'resolved',
      outcome: { kind: 'committed', settlementCalls: 1 },
    })
    expect(await runtime.ENVELOPE_LEDGER.getByName(seed.principalId).getAvailableBalance())
      .toMatchObject({ availableBalanceMinor: 775 })
    expect((await graph.getSnapshot())?.legs.find((leg) => leg.legId === 'hotel'))
      .toMatchObject({ committedOfferId: 'hotel-reconciliation', committedAmountMinor: 125 })
    expect(await graph.getReconciliationDecision(cascadeIdFor(event))).toMatchObject({
      decisionId: input.decision_id, decision: 'commit', operatorId: input.operator_id,
      reason: input.reason,
    })
    expect((await graph.getReconciliationDecision(cascadeIdFor(event)))?.completedAt).not.toBeNull()
    const replay = await operatorRequest(runtime, url, input, 'operator-secret-commit')
    expect(replay.status).toBe(200)
    expect(await replay.json()).toMatchObject({ kind: 'idempotent', custody: 'idempotent' })
    const next = { ...event, eventId: 'after-commit' }
    expect(await graph.beginCascade(next)).toMatchObject({ kind: 'plan' })
  })

  it('reserves a bounded settlement and persistence tail before discovery', async () => {
    expect(discoveryPhaseDeadline(1_000, 11_000)).toBe(8_500)
    const runtime = env as unknown as TravelCommerceEnv
    const seed = chainSeed('discovery-tail')
    await runtime.BUNDLE_GRAPH.getByName(seed.bundleId).initBundle(seed)
    const shortRuntime = new Proxy(runtime, {
      get(target, property, receiver) {
        return property === 'CASCADE_WALL_MS' ? '400' : Reflect.get(target, property, receiver)
      },
    }) as TravelCommerceEnv
    let discoveryBudget = 0
    let settlements = 0
    const result = await new ReoptWorker(shortRuntime, createExecutionContext(), {
      dispatch: async (record, _legs, _discovery, _ctx, deadlineAt) => {
        discoveryBudget = deadlineAt - Date.now()
        await new Promise((resolve) => setTimeout(resolve, 350))
        return {
          kind: 'quoted' as const,
          quotes: record.affected.map((legId) => quote(legId, 125, 'slow-discovery')),
          quoteCount: record.affected.length, rejectCount: 0 as const,
        }
      },
      settle: async (record) => {
        settlements += 1
        return { kind: 'settled' as const, settlementId: 'unexpected', idempotencyKey: record.cascadeId }
      },
    }).handleMutation({ bundleId: seed.bundleId, legId: 'flight', eventId: 'slow-discovery' })
    expect(discoveryBudget).toBeGreaterThan(0)
    expect(discoveryBudget).toBeLessThanOrEqual(300)
    expect(result).toMatchObject({ reason: 'cascade-timeout' })
    expect(['pending', 'rolled-back']).toContain(result.kind)
    expect(settlements).toBe(0)
  })
})

async function createAmbiguous(runtime: TravelCommerceEnv, event: {
  bundleId: string
  legId: string
  eventId: string
}) {
  return new ReoptWorker(runtime, createExecutionContext(), {
    dispatch: async (record: CascadeRecord) => ({
      kind: 'quoted' as const,
      quotes: record.affected.map((legId) => quote(legId, 125, 'reconciliation')),
      quoteCount: record.affected.length, rejectCount: 0 as const,
    }),
    settle: async (record: CascadeRecord) => ({
      kind: 'pending' as const, cascadeId: record.cascadeId, reason: 'settlement-response-ambiguous',
    }),
  }).handleMutation(event)
}

function operatorEnv(secret: string): TravelCommerceEnv {
  const runtime = env as unknown as TravelCommerceEnv
  return new Proxy(runtime, {
    get(target, property, receiver) {
      return property === 'RECONCILIATION_OPERATOR_TOKEN'
        ? secret
        : Reflect.get(target, property, receiver)
    },
  })
}

function productionReadyEnv(operatorToken: string, apiToken: string): TravelCommerceEnv {
  const runtime = env as unknown as TravelCommerceEnv
  const readyService = {
    fetch: async () => Response.json({ ok: true }),
    connect: () => { throw new Error('not-used') },
  } satisfies Fetcher
  return {
    BUNDLE_GRAPH: runtime.BUNDLE_GRAPH,
    ENVELOPE_LEDGER: runtime.ENVELOPE_LEDGER,
    BALANCE_CACHE: { get: async () => null },
    PROVENANCE_ARCHIVE: { head: async () => null },
    AI: { run: async () => ({ response: 'ready' }) },
    DISCOVERY_SERVICE: providerService('discovery'),
    ISSUANCE_SERVICE: readyService,
    MARKETPLACE_SERVICE: providerService('marketplace'),
    INFERENCE_OVERFLOW: readyService,
    DEPLOY_LANE: 'Production_Lane',
    CASCADE_WALL_MS: '10000',
    SETTLEMENT_CURRENCY: 'SGD',
    MODEL_CATALOG_JSON: runtime.MODEL_CATALOG_JSON,
    PERMITTED_MODEL_LICENSES_JSON: runtime.PERMITTED_MODEL_LICENSES_JSON,
    TRAVEL_COMMERCE_API_TOKEN: apiToken,
    RECONCILIATION_OPERATOR_TOKEN: operatorToken,
    INFERENCE_OVERFLOW_TOKEN: 'i'.repeat(32),
    CHECKOUT_PROVIDER_AUTH_SECRET: CHECKOUT_AUTH_SECRET,
    MARKETPLACE_PROVIDER_AUTH_SECRET: MARKETPLACE_AUTH_SECRET,
    COMMERCE_PROVIDER_SOURCE_REVISION: PROVIDER_SOURCE_REVISION,
    COMMERCE_PROVIDER_STORAGE_REVISION: 'commerce-checkout-do-sqlite-v1',
    COMMERCE_PROVIDER_VERSION_ID: PROVIDER_VERSION_ID,
    CHECKOUT_PROVIDER_STORE: runtime.CHECKOUT_PROVIDER_STORE,
  } as unknown as TravelCommerceEnv
}

function service(fetch: (request: Request) => Promise<Response>): Fetcher {
  return { fetch, connect: () => { throw new Error('not-used') } } as Fetcher
}

function providerService(id: 'discovery' | 'marketplace'): Fetcher {
  const discovery = id === 'discovery'
  const contract = discovery ? DISCOVERY_PROVIDER_CONTRACT : MARKETPLACE_PROVIDER_CONTRACT
  const checks = discovery ? DISCOVERY_EVIDENCE_CHECKS : MARKETPLACE_EVIDENCE_CHECKS
  const storageRevision = discovery ? 'commerce-discovery-mcp-v1' : 'marketplace-d1-0017'
  const capabilities = discovery
    ? { ok: true, contract, transport: 'mcp/streamable-http', tools: ['commerce.flight.discover', 'commerce.experience.discover'] }
    : { ok: true, contract, operations: ['vendor-list', 'vendor-transition-fenced', 'settlement-read'] }
  return service(async (request) => {
    const pathname = new URL(request.url).pathname
    if (pathname === '/readyz') return Response.json({ ok: true })
    if (pathname === '/v1/capabilities') {
      if (!discovery && !await verifyCommerceProviderControlRequest(
        request,
        contract,
        MARKETPLACE_AUTH_SECRET,
      )) return Response.json({ ok: false }, { status: 401 })
      return Response.json(capabilities)
    }
    if (pathname === '/v1/runtime-evidence') return runtimeEvidenceResponse({
      COMMERCE_PROVIDER_SOURCE_REVISION: PROVIDER_SOURCE_REVISION,
      COMMERCE_PROVIDER_STORAGE_REVISION: storageRevision,
      COMMERCE_PROVIDER_VERSION_ID: PROVIDER_VERSION_ID,
    }, contract, checks)
    return Response.json({ ok: false }, { status: 404 })
  })
}

function operatorRequest(
  runtime: TravelCommerceEnv,
  url: string,
  body: Readonly<Record<string, unknown>>,
  token: string,
): Promise<Response> {
  return worker.fetch(new Request(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }), runtime, createExecutionContext())
}

function reconciliationUrl(bundleId: string, cascadeId: string): string {
  return `https://travel.test/v1/bundles/${encodeURIComponent(bundleId)}/cascades/${encodeURIComponent(cascadeId)}/reconciliation`
}

function chainSeed(suffix: string): BundleSeed {
  const principalId = `principal-${suffix}`
  return Object.freeze({
    bundleId: `bundle-${suffix}`, principalId, totalBudgetMinor: minorUnits(1_000),
    legs: Object.freeze([
      leg('flight', principalId, 'flight', 'flight-old', 100),
      leg('hotel', principalId, 'hotel', 'hotel-old', 100),
    ]),
    edges: Object.freeze([{ fromLegId: 'flight', toLegId: 'hotel' }]),
  })
}

function leg(legId: string, principalId: string, category: string, offerId: string, amountMinor: number) {
  return Object.freeze({
    legId, principalId, category, committedOfferId: offerId,
    committedAmountMinor: minorUnits(amountMinor), lastCascadeId: null,
  })
}

function quote(legId: string, amountMinor: number, suffix: string): Quote {
  return Object.freeze({
    kind: 'offer', legId, offerId: `${legId}-${suffix}`, amountMinor: minorUnits(amountMinor), currency: 'SGD',
    priceVerification: 'deterministic-demo', agentId: 'reconciliation-test',
    promptTokens: 0, completionTokens: 0, dollarCost: 0,
    provenance: Object.freeze({ source: 'reconciliation-test' }),
  })
}
