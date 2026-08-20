import { createExecutionContext, reset } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'
import { OfferCache } from '../../../../../src/cache/offer-cache'
import { dispatchAffectedSet } from '../../../../../src/bundle/reopt-dispatch'
import { demoSeed, emitEvidence, readIntentLegId } from './_support'
import { initialize } from './_runtime'

afterEach(() => reset())

describe('check:cascade-bounds evidence', () => {
  it('fans out before waiting, records counts, and fails closed at the wall-clock cap', async () => {
    const seed = demoSeed('cascade-bounds')
    const { graph } = await initialize(seed)
    const begin = await graph.beginCascade({ bundleId: seed.bundleId, legId: 'flight-sin-nrt', eventId: 'bounds-success' })
    expect(begin.kind).toBe('plan')
    if (begin.kind !== 'plan') throw new Error('expected cascade plan')
    const delays = new Map([['experience-tsukiji', 80], ['transfer-ginza', 120]])
    const concurrency = { active: 0, maximum: 0 }
    const fetcher = discoveryDouble(delays, concurrency)
    const started = performance.now()
    const result = await dispatchAffectedSet(
      begin.record,
      seed.legs,
      fetcher,
      createExecutionContext(),
      Date.now() + 1_000,
      new OfferCache('bounds-success-cache'),
    )
    const elapsedMs = performance.now() - started
    expect(result).toMatchObject({ kind: 'quoted', quoteCount: 2, rejectCount: 0 })
    expect(concurrency.maximum).toBe(2)
    expect(await graph.rollbackCascade(begin.record.cascadeId, 'evidence-success-cleanup')).toMatchObject({ kind: 'rolled-back' })
    await graph.confirmRollbackRelease(begin.record.cascadeId)

    const timeoutBegin = await graph.beginCascade({ bundleId: seed.bundleId, legId: 'flight-sin-nrt', eventId: 'bounds-timeout' })
    expect(timeoutBegin.kind).toBe('plan')
    if (timeoutBegin.kind !== 'plan') throw new Error('expected timeout cascade plan')
    const timeout = await dispatchAffectedSet(
      timeoutBegin.record,
      seed.legs,
      discoveryDouble(new Map([['experience-tsukiji', 30], ['transfer-ginza', 30]])),
      createExecutionContext(),
      Date.now() + 5,
      new OfferCache('bounds-timeout-cache'),
    )
    expect(timeout).toMatchObject({ kind: 'rejected', reason: 'cascade-timeout', quoteCount: 2 })
    expect(await graph.rollbackCascade(timeoutBegin.record.cascadeId, 'evidence-timeout-cleanup')).toMatchObject({ kind: 'rolled-back' })
    await graph.confirmRollbackRelease(timeoutBegin.record.cascadeId)
    emitEvidence('check:cascade-bounds', ['6.1', '6.2', '6.3', '6.4', '6.5', '6.7'], {
      quoteCount: result.quoteCount,
      rejectCount: result.rejectCount,
      slowestQuoteMs: 120,
      sequentialQuoteSumMs: 200,
      observedFanOutElapsedMs: Number(elapsedMs.toFixed(3)),
      maxConcurrentQuoteRequests: concurrency.maximum,
      timeoutReason: timeout.kind === 'rejected' ? timeout.reason : null,
      perLegRetries: 0,
    })
  })
})

function discoveryDouble(
  delays: ReadonlyMap<string, number>,
  concurrency?: { active: number; maximum: number },
): Fetcher {
  return {
    async fetch(request: Request): Promise<Response> {
      const legId = await readIntentLegId(request)
      const delay = delays.get(legId) ?? 0
      if (concurrency) {
        concurrency.active += 1
        concurrency.maximum = Math.max(concurrency.maximum, concurrency.active)
      }
      try {
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
        return Response.json({
          kind: 'offer', legId, offerId: `${legId}-bounded`, amountMinor: 250,
          currency: 'SGD',
          priceVerification: 'deterministic-demo',
          agentId: 'local-bounds-double', promptTokens: 0, completionTokens: 0, dollarCost: 0,
          provenance: { mode: 'deterministic-local-demo-double', currency: 'SGD' },
        })
      } finally {
        if (concurrency) concurrency.active -= 1
      }
    },
    connect() { throw new Error('not-supported-by-local-demo-double') },
  }
}
