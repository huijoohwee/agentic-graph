import {
  createExecutionContext,
  reset,
  runDurableObjectAlarm,
  waitOnExecutionContext,
} from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import { ReoptWorker } from '../../../../src/bundle/reopt-worker'
import { MAX_BUNDLE_LEGS, cascadeIdFor, minorUnits } from '../../../../src/bundle/bundle-runtime'
import type { BundleSeed, CascadeRecord, Quote } from '../../../../src/bundle/bundle-types'
import { OfferCache } from '../../../../src/cache/offer-cache'

afterEach(() => reset())

describe('transactional travel-commerce core', () => {
  it('seeds committed spend and replaces positions without double counting', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const seed = twoLegSeed('replacement-accounting', 1_000, 100, 100)
    const graph = runtime.BUNDLE_GRAPH.getByName(seed.bundleId)
    const ledger = runtime.ENVELOPE_LEDGER.getByName(seed.principalId)
    expect(await graph.initBundle(seed)).toMatchObject({ kind: 'initialized' })
    expect(await ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: 800 })

    const first = await ledger.checkAndReserveCascade('replace-1', seed.bundleId, [quote('hotel', 125, 'hotel-125')])
    expect(first).toMatchObject({ kind: 'reserved', reservedDeltaMinor: 25, availableAfterMinor: 775 })
    if (first.kind === 'rejected') throw new Error(first.reason)
    expect(first.holds[0]).toMatchObject({ amountMinor: 25, targetAmountMinor: 125 })
    expect(await ledger.commitCascade('replace-1')).toMatchObject({ kind: 'committed' })
    expect(await ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: 775 })

    const decrease = await ledger.checkAndReserveCascade('replace-2', seed.bundleId, [quote('hotel', 75, 'hotel-75')])
    expect(decrease).toMatchObject({ kind: 'reserved', reservedDeltaMinor: 0, availableAfterMinor: 775 })
    expect(await ledger.commitCascade('replace-2')).toMatchObject({ kind: 'committed' })
    expect(await ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: 825 })
    expect(await ledger.checkAndReserveCascade('overspend', seed.bundleId, [quote('new-leg', 826, 'too-much')]))
      .toMatchObject({ kind: 'rejected', reason: 'insufficient-envelope' })
  })

  it('keeps prepared changes invisible and makes an overlapping cascade retryable', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const seed = twoLegSeed('prepared-visibility', 1_000, 100, 100)
    const graph = runtime.BUNDLE_GRAPH.getByName(seed.bundleId)
    const ledger = runtime.ENVELOPE_LEDGER.getByName(seed.principalId)
    await graph.initBundle(seed)
    const event = { bundleId: seed.bundleId, legId: 'flight', eventId: 'first' }
    const begin = await graph.beginCascade(event)
    expect(begin.kind).toBe('plan')
    if (begin.kind !== 'plan') throw new Error('expected plan')
    const replacement = quote('hotel', 125, 'hotel-new')
    await ledger.checkAndReserveCascade(begin.record.cascadeId, seed.bundleId, [replacement])
    expect(await graph.prepareCommit(begin.record.cascadeId, [replacement])).toMatchObject({ phase: 'settlement_pending' })
    expect((await graph.getSnapshot())?.legs.find((leg) => leg.legId === 'hotel'))
      .toMatchObject({ committedOfferId: 'hotel-old', committedAmountMinor: 100, lastCascadeId: null })
    const overlapEvent = { ...event, eventId: 'second' }
    const overlap = await graph.beginCascade(overlapEvent)
    expect(overlap).toEqual({
      kind: 'pending', cascadeId: cascadeIdFor(overlapEvent), reason: 'bundle-busy',
    })
    expect(await graph.getCascade(cascadeIdFor(overlapEvent))).toBeNull()

    await ledger.protectCascade(begin.record.cascadeId)
    await ledger.commitCascade(begin.record.cascadeId)
    expect(await graph.markSettlementComplete(begin.record.cascadeId, 'not-required'))
      .toMatchObject({ kind: 'rejected', reason: 'settlement-claim-lost' })
    const claim = await graph.claimSettlement(begin.record.cascadeId, 'test-owner')
    expect(claim).toMatchObject({ kind: 'claimed' })
    expect(await graph.markSettlementComplete(begin.record.cascadeId, 'test-owner'))
      .toMatchObject({ kind: 'rejected', reason: 'settlement-not-attempted' })
    await graph.recordSettlementAttempt(begin.record.cascadeId, 'test-owner')
    await graph.markSettlementComplete(begin.record.cascadeId, 'test-owner')
    await graph.commitPreparedCascade(begin.record.cascadeId)
    const committed = await graph.getSnapshot()
    expect(committed?.legs.find((leg) => leg.legId === 'hotel'))
      .toMatchObject({ committedOfferId: 'hotel-new', committedAmountMinor: 125, lastCascadeId: begin.record.cascadeId })
    await graph.finishCascade(begin.record.cascadeId, false)
    const retried = await graph.beginCascade(overlapEvent)
    expect(retried).toMatchObject({ kind: 'plan', record: { eventId: 'second' } })
    expect(await graph.beginCascade(overlapEvent)).toMatchObject({
      kind: 'resume', record: { cascadeId: cascadeIdFor(overlapEvent) },
    })
  })

  it('recovers zero-net finalization through the Durable Object alarm', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const seed = twoLegSeed('alarm-recovery', 1_000, 100, 100)
    const graph = runtime.BUNDLE_GRAPH.getByName(seed.bundleId)
    const ledger = runtime.ENVELOPE_LEDGER.getByName(seed.principalId)
    await graph.initBundle(seed)
    const startedAt = Date.now()
    const begin = await graph.beginCascade({ bundleId: seed.bundleId, legId: 'flight', eventId: 'alarm' }, startedAt)
    if (begin.kind !== 'plan') throw new Error('expected plan')
    const replacement = quote('hotel', 100, 'hotel-alarm')
    await ledger.checkAndReserveCascade(begin.record.cascadeId, seed.bundleId, [replacement])
    await graph.prepareCommit(begin.record.cascadeId, [replacement], startedAt)
    expect(await runDurableObjectAlarm(graph)).toBe(true)
    expect(await graph.getCascade(begin.record.cascadeId)).toMatchObject({ phase: 'finalizing', outcome: null })
    await new Promise((resolve) => setTimeout(resolve, 1_050))
    expect(await graph.getCascade(begin.record.cascadeId)).toMatchObject({ phase: 'committed', outcome: { kind: 'committed' } })
    expect((await graph.getSnapshot())?.legs.find((leg) => leg.legId === 'hotel')?.committedOfferId).toBe('hotel-alarm')
  })

  it('retries a deferred immutable archive without replaying settlement', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const seed = twoLegSeed('archive-retry', 1_000, 100, 100)
    await runtime.BUNDLE_GRAPH.getByName(seed.bundleId).initBundle(seed)
    let settlements = 0
    let archives = 0
    const adapters = {
      dispatch: async (record: CascadeRecord) => ({
        kind: 'quoted' as const,
        quotes: record.affected.map((legId) => quote(legId, 125, 'replacement')),
        quoteCount: record.affected.length,
        rejectCount: 0 as const,
      }),
      settle: async (record: CascadeRecord) => {
        settlements += 1
        return { kind: 'settled' as const, settlementId: 'settlement-1', idempotencyKey: record.cascadeId }
      },
      archive: async (_bucket: R2Bucket, _snapshot: unknown, outcome: { cascadeId: string }) => {
        archives += 1
        if (archives === 1) throw new Error('r2-temporary')
        return { kind: 'written' as const, key: `provenance/${outcome.cascadeId}`, digest: 'digest' }
      },
    }
    const event = { bundleId: seed.bundleId, legId: 'flight', eventId: 'archive' }
    const first = await new ReoptWorker(runtime, createExecutionContext(), adapters).handleMutation(event)
    expect(first).toMatchObject({ kind: 'committed', archiveDeferred: true })
    const replay = await new ReoptWorker(runtime, createExecutionContext(), adapters).handleMutation(event)
    expect(replay).toMatchObject({ kind: 'committed', archiveDeferred: false })
    expect({ settlements, archives }).toEqual({ settlements: 1, archives: 2 })
  })

  it('rejects a 21st structural insertion and a cycle without mutation', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const principalId = 'principal-structural-boundary'
    const seed: BundleSeed = {
      bundleId: 'bundle-structural-boundary', principalId, totalBudgetMinor: minorUnits(0),
      legs: Array.from({ length: MAX_BUNDLE_LEGS }, (_, index) => ({
        legId: `leg-${index}`, principalId, category: 'test', committedOfferId: null,
        committedAmountMinor: null, lastCascadeId: null,
      })),
      edges: [],
    }
    const graph = runtime.BUNDLE_GRAPH.getByName(seed.bundleId)
    await graph.initBundle(seed)
    expect(await graph.insertLeg({
      legId: `leg-${MAX_BUNDLE_LEGS}`, principalId, category: 'test', committedOfferId: null,
      committedAmountMinor: null, lastCascadeId: null,
    })).toMatchObject({
      kind: 'rejected',
      reason: 'scale-boundary-legs',
      details: { observed: MAX_BUNDLE_LEGS + 1 },
    })
    expect((await graph.getSnapshot())?.legs).toHaveLength(MAX_BUNDLE_LEGS)
    expect(await graph.insertEdge({ fromLegId: 'leg-0', toLegId: 'leg-1' })).toMatchObject({ kind: 'inserted' })
    expect(await graph.insertEdge({ fromLegId: 'leg-1', toLegId: 'leg-0' }))
      .toEqual({ kind: 'rejected', reason: 'cyclic-dependency' })
    expect((await graph.getSnapshot())?.edges).toHaveLength(1)
  })

  it('implements manual stale-while-revalidate while commit reads require freshness', async () => {
    let now = 1_000
    let calls = 0
    const cache = new OfferCache('manual-swr-core', 30_000, 60_000, () => now)
    const discovery: Fetcher = {
      async fetch(request: Request) {
        calls += 1
        const body = await request.json() as { intent?: { intentId?: string } }
        const legId = String(body.intent?.intentId ?? '').split(':').at(-1) ?? ''
        return Response.json(quote(legId, 100 + calls, `call-${calls}`))
      },
      connect() { throw new Error('not-supported') },
    }
    const input = {
      event: { bundleId: 'cache-bundle', legId: 'flight', eventId: 'cache-event' },
      legId: 'hotel', category: 'hotel', priorOfferId: 'old', priorAmountMinor: 90,
    }
    const firstContext = createExecutionContext()
    const first = await cache.requote(input, discovery, firstContext)
    await waitOnExecutionContext(firstContext)
    expect(first).toMatchObject({ offerId: 'call-1' })
    now += 31_000
    const staleContext = createExecutionContext()
    const stale = await cache.advisoryRequote(input, discovery, staleContext)
    expect(stale).toMatchObject({ offerId: 'call-1' })
    await waitOnExecutionContext(staleContext)
    expect(calls).toBe(2)
    const commitContext = createExecutionContext()
    const fresh = await cache.requote(input, discovery, commitContext)
    await waitOnExecutionContext(commitContext)
    expect(fresh).toMatchObject({ offerId: 'call-2' })
    expect(calls).toBe(2)
  })
})

function twoLegSeed(
  suffix: string,
  totalBudgetMinor: number,
  flightAmount: number,
  hotelAmount: number,
): BundleSeed {
  const principalId = `principal-${suffix}`
  return Object.freeze({
    bundleId: `bundle-${suffix}`,
    principalId,
    totalBudgetMinor: minorUnits(totalBudgetMinor),
    legs: Object.freeze([
      leg('flight', principalId, 'flight', 'flight-old', flightAmount),
      leg('hotel', principalId, 'hotel', 'hotel-old', hotelAmount),
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

function quote(legId: string, amountMinor: number, offerId: string): Quote {
  return Object.freeze({
    kind: 'offer', legId, offerId, amountMinor: minorUnits(amountMinor), currency: 'SGD', priceVerification: 'deterministic-demo',
    agentId: 'core-test',
    promptTokens: 0, completionTokens: 0, dollarCost: 0, provenance: Object.freeze({ source: 'core-test' }),
  })
}
