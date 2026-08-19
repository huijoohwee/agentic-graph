import fc from 'fast-check'
import { reset } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'
import { checkAsyncProperty, emitEvidence, emptyDemoSeed, percentile, quote } from './_support'
import { initialize } from './_runtime'

afterEach(() => reset())

describe('check:envelope-atomicity evidence', () => {
  it('serializes concurrent reservations and measures the authoritative operation', async () => {
    let sequence = 0
    const propertyRun = await checkAsyncProperty('check:envelope-atomicity/CP-6', 600, fc.asyncProperty(
      fc.integer({ min: 0, max: 3_000 }),
      fc.array(fc.integer({ min: 0, max: 2_000 }), { minLength: 2, maxLength: 6 }),
      async (budget, amounts) => {
        sequence += 1
        const generatedSeed = emptyDemoSeed(`concurrent-property-${sequence}`, budget)
        const generatedLedger = (await initialize(generatedSeed)).ledger
        const concurrent = await Promise.all(amounts.map((amount, index) => (
          generatedLedger.checkAndReserveCascade(
            `generated-agent-${index}`,
            generatedSeed.bundleId,
            [quote(`generated-leg-${index}`, amount, `generated-${sequence}-${index}`)],
          )
        )))
        const acceptedTargetMinor = concurrent.reduce((sum, result) => (
          result.kind === 'rejected'
            ? sum
            : sum + result.holds.reduce((holdSum, hold) => holdSum + hold.targetAmountMinor, 0)
        ), 0)
        expect(acceptedTargetMinor).toBeLessThanOrEqual(budget)
        expect(concurrent.filter((result) => result.kind === 'rejected').every(
          (result) => result.reason === 'insufficient-envelope',
        )).toBe(true)
        expect(await generatedLedger.getAvailableBalance()).toMatchObject({
          availableBalanceMinor: budget - acceptedTargetMinor,
        })
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
    emitEvidence('check:envelope-atomicity', ['4.1', '4.2', '4.3', '4.4', '4.5', '4.6', '4.7'], {
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
    }, ['CP-6'], propertyRun)
  }, 180_000)
})
