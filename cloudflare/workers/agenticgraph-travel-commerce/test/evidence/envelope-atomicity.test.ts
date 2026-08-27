import fc from 'fast-check'
import { reset, runInDurableObject } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'
import { checkAsyncProperty, emitEvidence, emptyDemoSeed, percentile, quote } from './_support'
import { initialize, runtimeEnv } from './_runtime'
import { ENVELOPE_HOLD_RETENTION } from '../../../../../src/ledger/envelope-ledger-state'
// @ts-expect-error The JavaScript Worker module is typechecked by the MCP Worker project.
import { handleTravelCommerceOfferIngress, TRAVEL_AGENT_OFFERS_PATH } from '../../../agenticgraph-mcp/travel-commerce-ingress.mjs'
// @ts-expect-error The JavaScript Worker module is typechecked by the MCP Worker project.
import { handleTravelCommerceServiceRoute } from '../../../agenticgraph-mcp/travel-commerce-router.mjs'

afterEach(() => reset())

describe('check:envelope-atomicity evidence', () => {
  it('serializes concurrent reservations and measures the authoritative operation', async () => {
    let sequence = 0
    const generatedBudgets = [0, 1, 10, 100, 1_000, 3_000] as const
    const generatedLedgers = new Map<number, {
      bundleId: string
      ledger: ReturnType<TravelCommerceEnv['ENVELOPE_LEDGER']['getByName']>
    }>()
    const localEnv = runtimeEnv()
    for (const budget of generatedBudgets) {
      const principalId = `concurrent-property-principal-${budget}`
      const bundleId = `concurrent-property-bundle-${budget}`
      const ledger = localEnv.ENVELOPE_LEDGER.getByName(principalId)
      expect(await ledger.init(principalId, budget)).toMatchObject({ kind: 'initialized' })
      generatedLedgers.set(budget, { bundleId, ledger })
    }
    const propertyRun = await checkAsyncProperty('check:envelope-atomicity/CP-6', 600, fc.asyncProperty(
      fc.constantFrom(...generatedBudgets),
      fc.array(fc.integer({ min: 0, max: 2_000 }), { minLength: 2, maxLength: 6 }),
      async (budget, amounts) => {
        sequence += 1
        const generated = generatedLedgers.get(budget)
        if (!generated) throw new Error('generated-ledger-missing')
        const concurrent = await Promise.all(amounts.map((amount, index) => {
          const operationId = `generated-${sequence}-${index}`
          return index % 2 === 0
            ? generated.ledger.checkAndReserveOffer({
                operationId,
                agentId: 'generated-agent-ordinary',
                offerId: `generated-ordinary-offer-${sequence}-${index}`,
                amountMinor: amount,
                currency: 'SGD',
                priceVerification: 'deterministic-demo',
              })
            : generated.ledger.checkAndReserveCascade(
                operationId,
                generated.bundleId,
                [quote(`generated-leg-${index}`, amount, `generated-${sequence}-${index}`)],
              )
        }))
        const acceptedTargetMinor = concurrent.reduce((sum, result) => (
          result.kind === 'rejected'
            ? sum
            : sum + ('hold' in result
                ? result.hold.amountMinor
                : result.holds.reduce((holdSum, hold) => holdSum + hold.targetAmountMinor, 0))
        ), 0)
        expect(acceptedTargetMinor).toBeLessThanOrEqual(budget)
        expect(concurrent.filter((result) => result.kind === 'rejected').every(
          (result) => result.reason === 'insufficient-envelope',
        )).toBe(true)
        expect(await generated.ledger.getAvailableBalance()).toMatchObject({
          availableBalanceMinor: budget - acceptedTargetMinor,
        })
        await Promise.all(concurrent.flatMap((result, index) => (
          result.kind === 'rejected'
            ? []
            : [index % 2 === 0
                ? generated.ledger.releaseOffer(`generated-${sequence}-${index}`, 'generated-agent-ordinary')
                : generated.ledger.releaseCascade(`generated-${sequence}-${index}`)]
        )))
        expect(await generated.ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: budget })
      },
    ))

    const seed = emptyDemoSeed('concurrent-envelope', 1_000)
    const { ledger } = await initialize(seed)
    const started = performance.now()
    const results = await Promise.all([
      ledger.checkAndReserveCascade('agent-a', seed.bundleId, [quote('offer-a-leg', 600)]),
      ledger.checkAndReserveCascade('agent-b', seed.bundleId, [quote('offer-b-leg', 600)]),
    ])
    const elapsedMs = performance.now() - started
    const accepted = results.filter((result) => result.kind === 'reserved')
    const rejected = results.filter((result) => result.kind === 'rejected')
    expect(accepted).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]).toMatchObject({ reason: 'insufficient-envelope' })
    const balance = await ledger.getAvailableBalance()
    expect(balance).toMatchObject({ availableBalanceMinor: 400 })

    const operationLatencies: number[] = []
    const outerRpcLatencies: number[] = []
    for (let index = 0; index < 50; index += 1) {
      const cascadeId = `latency-${index}`
      const before = performance.now()
      const reserved = await ledger.checkAndReserveCascade(cascadeId, seed.bundleId, [quote(`latency-leg-${index}`, 0)])
      outerRpcLatencies.push(performance.now() - before)
      if (reserved.kind === 'rejected') throw new Error(`latency sample rejected: ${reserved.reason}`)
      expect(reserved.kind).toBe('reserved')
      operationLatencies.push(reserved.operationElapsedMs)
      await ledger.releaseCascade(cascadeId)
    }
    const operationP95Ms = percentile(operationLatencies, 95)
    const outerRpcP95Ms = percentile(outerRpcLatencies, 95)
    expect(operationP95Ms).toBeLessThan(10)

    const highCardinalityRows = 10_000
    const scaleLedger = localEnv.ENVELOPE_LEDGER.getByName('req-4-7-high-cardinality')
    await scaleLedger.init('req-4-7-high-cardinality', 1_000)
    await seedZeroAmountReservations(scaleLedger, highCardinalityRows)
    const beforeScaleReserve = await scaleLedger.getAvailableBalance()
    expect(beforeScaleReserve).toMatchObject({ availableBalanceMinor: 1_000 })
    if ('kind' in beforeScaleReserve) throw new Error(beforeScaleReserve.reason)
    expect(beforeScaleReserve.revision.length).toBeLessThan(32)
    const scaleReserved = await scaleLedger.checkAndReserveCascade(
      'req-4-7-indexed-miss', 'req-4-7-indexed-miss-bundle',
      [quote('req-4-7-indexed-miss-leg', 0)],
    )
    if (scaleReserved.kind === 'rejected') throw new Error(scaleReserved.reason)
    expect(scaleReserved.operationElapsedMs).toBeLessThan(10)
    expect(await scaleLedger.releaseCascade('req-4-7-indexed-miss'))
      .toMatchObject({ kind: 'released' })
    expect(await scaleLedger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: 1_000 })
    expect(await scaleLedger.checkAndReserveCascade(
      'req-4-7-indexed-miss', 'req-4-7-indexed-miss-bundle',
      [quote('req-4-7-indexed-miss-leg', 0)],
    )).toMatchObject({ kind: 'rejected', reason: 'cascade-reservation-released' })
    emitEvidence('check:envelope-atomicity', [
      '4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.7',
      '4.10', '4.11', '4.12', '4.13', '4.14',
    ], {
      concurrentOffers: 2,
      acceptedOffers: accepted.length,
      rejectedOffers: rejected.length,
      availableAfterMinor: 400,
      concurrentElapsedMs: Number(elapsedMs.toFixed(3)),
      reserveLatencySamples: operationLatencies.length,
      reserveInObjectP95Ms: operationP95Ms,
      reserveOuterRpcP95Ms: outerRpcP95Ms,
      generatedConcurrentOfferMin: 2,
      generatedConcurrentOfferMax: 6,
      generatedReservationChannels: ['ordinary-offer', 'cascade'],
      highCardinalityRows,
      highCardinalityZeroAmount: true,
      highCardinalityIndexedMissInObjectMs: scaleReserved.operationElapsedMs,
      highCardinalityRevisionBytes: beforeScaleReserve.revision.length,
      terminalRetentionMode: ENVELOPE_HOLD_RETENTION.mode,
      terminalPayloadCompaction: ENVELOPE_HOLD_RETENTION.compactsTerminalPayloads,
    }, ['CP-6'], propertyRun)
  }, 180_000)

  it('routes an authenticated public ordinary offer through registry dispatch into the shared ledger', async () => {
    const localEnv = runtimeEnv()
    const principalId = 'public-ingress-evidence-principal'
    const operationId = 'public-ingress-evidence-operation'
    const ledger = localEnv.ENVELOPE_LEDGER.getByName(principalId)
    expect(await ledger.init(principalId, 1_000)).toMatchObject({ kind: 'initialized' })
    const definitionCache = new Map<string, string>()
    let guardrailCalls = 0
    const routerEnv = {
      TRAVEL_AGENT_DEFINITION_CACHE: {
        get: async (key: string) => definitionCache.get(key) ?? null,
        put: async (key: string, value: string) => { definitionCache.set(key, value) },
      },
      TRAVEL_AGENT_DEFINITIONS_JSON: JSON.stringify([
        { agentId: 'agent-flight', declaredCategory: 'flight' },
      ]),
      TRAVEL_DISCOVERY_MODE: 'deterministic-demo',
      TRAVEL_SETTLEMENT_CURRENCY: 'SGD',
      TRAVEL_DEMO_QUOTE_RULES_JSON: JSON.stringify({ flight: { deltaMinor: 50 } }),
      TRAVEL_GUARDRAIL: {
        ready: async () => ({
          ok: true, capability: 'registered-offer-atomic-guardrail', lane: 'Dev_Lane',
        }),
        evaluateOffer: async (input: {
          context: { operationId: string; agentId: string; priceVerification: 'deterministic-demo' }
          offer: { offerId: string; amountMinor: number; currency: string }
        }) => {
          guardrailCalls += 1
          const reserved = await ledger.checkAndReserveOffer({
            operationId: input.context.operationId,
            agentId: input.context.agentId,
            offerId: input.offer.offerId,
            amountMinor: input.offer.amountMinor,
            currency: input.offer.currency,
            priceVerification: input.context.priceVerification,
          })
          return reserved.kind === 'rejected'
            ? { ok: false, code: 'budget-exceeded', attempts: 0, costLog: zeroCostLog }
            : { ok: true, offer: { ...input.offer, date: '2026-09-01' }, attempts: 0, costLog: zeroCostLog }
        },
        commitOffer: async (input: { operationId: string; agentId: string }) => (
          ledger.commitOffer(input.operationId, input.agentId)
        ),
        releaseOffer: async (input: { operationId: string; agentId: string }) => (
          ledger.releaseOffer(input.operationId, input.agentId)
        ),
      },
    }
    const requestBody = {
      operation: 'evaluateOffer', principalId, reservationId: operationId,
      intent: {
        intentId: 'public-ingress-evidence:flight-leg', category: 'flight',
        constraints: {
          bundle_id: 'public-ingress-evidence-bundle', changed_leg_id: 'hotel-leg',
          prior_offer_id: 'prior-flight', prior_amount_minor: 700,
        },
      },
      guardrailIntent: {
        kind: 'flight', origin: 'SIN', destination: 'NRT',
        dateRangeStart: '2026-09-01', dateRangeEnd: '2026-09-10',
        budgetCeiling: { amountMinor: 1_000, currency: 'SGD' },
      },
    }
    const publicRequest = (authorization: string) => new Request(
      `https://airvio.co${TRAVEL_AGENT_OFFERS_PATH}`,
      {
        method: 'POST',
        headers: {
          authorization, 'content-type': 'application/json',
          'x-agenticgraph-component': 'Spoofed_Component',
        },
        body: JSON.stringify(requestBody),
      },
    )
    const dependencies = {
      authorize: async (request: Request) => request.headers.get('authorization') === 'Bearer evidence-token'
        ? { ok: true, status: 200 }
        : { ok: false, status: 401, code: 'unauthorized' },
      route: handleTravelCommerceServiceRoute,
    }

    const unauthorized = await handleTravelCommerceOfferIngress(
      publicRequest('Bearer wrong-token'), routerEnv, dependencies,
    )
    expect(unauthorized.status).toBe(401)
    expect(guardrailCalls).toBe(0)
    const accepted = await handleTravelCommerceOfferIngress(
      publicRequest('Bearer evidence-token'), routerEnv, dependencies,
    )
    expect(accepted.status).toBe(200)
    expect(guardrailCalls).toBe(1)
    expect(await ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: 250 })

    emitEvidence('check:envelope-atomicity', ['4.10', '4.11', '4.12', '4.13', '4.14'], {
      publicIngressPath: TRAVEL_AGENT_OFFERS_PATH,
      unauthorizedGuardrailCalls: 0,
      authenticatedGuardrailCalls: guardrailCalls,
      registeredAgent: 'agent-flight',
      ordinaryReservedMinor: 750,
      availableAfterMinor: 250,
      guardrailTransport: 'same-lane-named-service-binding',
    })
  })
})

async function seedZeroAmountReservations(
  ledger: ReturnType<TravelCommerceEnv['ENVELOPE_LEDGER']['getByName']>,
  count: number,
): Promise<void> {
  await runInDurableObject(ledger, (_instance, state) => {
    const batchSize = 500
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1_000
    for (let offset = 0; offset < count; offset += batchSize) {
      const size = Math.min(batchSize, count - offset)
      state.storage.sql.exec(
        `WITH RECURSIVE sequence(value) AS (
          VALUES(1) UNION ALL SELECT value + 1 FROM sequence WHERE value < ?
        ) INSERT INTO holds (
          hold_id, cascade_id, bundle_id, leg_id, offer_id, amount_minor, target_amount_minor,
          prior_hold_id, state, expires_at, reservation_kind
        ) SELECT 'scale-hold-' || (? + value), 'scale-cascade-' || (? + value),
          'scale-bundle-' || (? + value), 'scale-leg-' || (? + value),
          'scale-offer-' || (? + value), 0, 0, NULL, 'reserved', ?, 'cascade' FROM sequence`,
        size, offset, offset, offset, offset, offset, expiresAt,
      )
    }
  })
}

const zeroCostLog = Object.freeze({
  model: 'none', prompt_tokens: 0, completion_tokens: 0,
  cache_hits: 0, estimated_cost_usd: 0, incomplete: false,
})
