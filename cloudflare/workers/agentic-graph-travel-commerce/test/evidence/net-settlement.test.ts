import fc from 'fast-check'
import { reset } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'
import { ReoptWorker } from '../../../../../src/bundle/reopt-worker'
import { minorUnits } from '../../../../../src/bundle/bundle-runtime'
import type { BundleSeed } from '../../../../../src/bundle/bundle-types'
import { checkAsyncProperty, demoSeed, emitEvidence } from './_support'
import { executionContext, initialize, localDemoAdapters } from './_runtime'

afterEach(() => reset())

describe('check:net-settlement evidence', () => {
  it('records one settlement for a non-zero multi-leg net and zero for a zero net', async () => {
    let sequence = 0
    const propertyRun = await checkAsyncProperty('check:net-settlement/CP-5', 400, fc.asyncProperty(
      fc.array(fc.integer({ min: 0, max: 2_000 }), { minLength: 1, maxLength: 6 }),
      async (amounts) => {
        sequence += 1
        const generatedSeed = chainSeed(`net-property-${sequence}`, amounts.length)
        const generatedRuntime = await initialize(generatedSeed)
        const quoteAmounts = Object.fromEntries(amounts.map((amount, index) => [`affected-${index}`, amount]))
        const harness = localDemoAdapters(quoteAmounts)
        const result = await new ReoptWorker(
          generatedRuntime.localEnv,
          executionContext(),
          harness.adapters,
        ).handleMutation({
          bundleId: generatedSeed.bundleId,
          legId: 'changed-root',
          eventId: `net-property-${sequence}`,
        })
        const expectedNet = amounts.reduce((sum, amount) => sum + amount, 0) - amounts.length * 100
        const expectedCalls = expectedNet === 0 ? 0 : 1
        expect(result).toMatchObject({
          kind: 'committed',
          affected: amounts.map((_, index) => `affected-${index}`),
          netAmountMinor: expectedNet,
          settlementCalls: expectedCalls,
        })
        expect(harness.metrics.settlementCalls).toBe(expectedCalls)
      },
    ))

    const nonZeroSeed = demoSeed('net-non-zero')
    const nonZeroRuntime = await initialize(nonZeroSeed)
    const nonZeroHarness = localDemoAdapters({ 'experience-tsukiji': 350, 'transfer-ginza': 225 })
    const nonZero = await new ReoptWorker(
      nonZeroRuntime.localEnv,
      executionContext(),
      nonZeroHarness.adapters,
    ).handleMutation({ bundleId: nonZeroSeed.bundleId, legId: 'flight-sin-nrt', eventId: 'net-non-zero' })
    expect(nonZero).toMatchObject({
      kind: 'committed',
      affected: ['experience-tsukiji', 'transfer-ginza'],
      netAmountMinor: 75,
      settlementCalls: 1,
    })
    expect(nonZeroHarness.metrics.settlementCalls).toBe(1)
    expect(nonZeroHarness.metrics.gatewayCallers).toEqual(['Issuance_Service'])

    const zeroSeed = demoSeed('net-zero')
    const zeroRuntime = await initialize(zeroSeed)
    const zeroHarness = localDemoAdapters({ 'experience-tsukiji': 325, 'transfer-ginza': 175 })
    const zero = await new ReoptWorker(
      zeroRuntime.localEnv,
      executionContext(),
      zeroHarness.adapters,
    ).handleMutation({ bundleId: zeroSeed.bundleId, legId: 'flight-sin-nrt', eventId: 'net-zero' })
    expect(zero).toMatchObject({ kind: 'committed', netAmountMinor: 0, settlementCalls: 0 })
    expect(zeroHarness.metrics.settlementCalls).toBe(0)

    emitEvidence('check:net-settlement', ['3.1', '3.2', '3.3', '3.5', '3.6', '3.8'], {
      affectedSetSize: 2,
      nonZeroNetAmountMinor: 75,
      nonZeroSettlementCalls: nonZeroHarness.metrics.settlementCalls,
      zeroNetSettlementCalls: zeroHarness.metrics.settlementCalls,
      gatewayCaller: nonZeroHarness.metrics.gatewayCallers[0] ?? null,
      generatedAffectedSetMin: 1,
      generatedAffectedSetMax: 6,
    }, ['CP-5'], propertyRun)
  }, 180_000)
})

function chainSeed(label: string, affectedCount: number): BundleSeed {
  const principalId = `principal-${label}`
  const affected = Array.from({ length: affectedCount }, (_, index) => `affected-${index}`)
  return Object.freeze({
    bundleId: `bundle-${label}`,
    principalId,
    totalBudgetMinor: minorUnits(100_000),
    legs: Object.freeze([
      Object.freeze({
        legId: 'changed-root', principalId, category: 'flight', committedOfferId: 'root-original',
        committedAmountMinor: minorUnits(100), lastCascadeId: null,
      }),
      ...affected.map((legId) => Object.freeze({
        legId, principalId, category: 'experience', committedOfferId: `${legId}-original`,
        committedAmountMinor: minorUnits(100), lastCascadeId: null,
      })),
    ]),
    edges: Object.freeze(affected.map((legId, index) => Object.freeze({
      fromLegId: index === 0 ? 'changed-root' : affected[index - 1],
      toLegId: legId,
    }))),
  })
}
