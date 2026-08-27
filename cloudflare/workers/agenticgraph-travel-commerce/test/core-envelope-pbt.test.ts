import { reset } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import fc from 'fast-check'
import { afterEach, describe, expect, it } from 'vitest'
import { minorUnits } from '../../../../src/bundle/bundle-runtime'
import type { Quote } from '../../../../src/bundle/bundle-types'

const CP6_SEED = 1_592_634_590
const CP6_RUNS = 600

afterEach(() => reset())

describe('transactional envelope properties', () => {
  it('CP-6 never overdrafts under 600 generated concurrent schedules', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const principalId = 'principal-core-cp6'
    const bundleId = 'bundle-core-cp6'
    const budgetMinor = 1_000
    const ledger = runtime.ENVELOPE_LEDGER.getByName(principalId)
    expect(await ledger.init(principalId, budgetMinor)).toMatchObject({ kind: 'initialized' })
    let schedule = 0

    await fc.assert(fc.asyncProperty(
      fc.array(fc.integer({ min: 0, max: 1_500 }), { minLength: 2, maxLength: 16 }),
      async (amounts) => {
        schedule += 1
        const results = await Promise.all(amounts.map((amountMinor, index) => (
          ledger.checkAndReserveCascade(
            `cp6-${schedule}-${index}`,
            bundleId,
            [offer(`leg-${schedule}-${index}`, amountMinor)],
          )
        )))
        const accepted = results.flatMap((result, index) => (
          result.kind === 'rejected' ? [] : [{ result, index }]
        ))
        const rejected = results.filter((result) => result.kind === 'rejected')
        expect(rejected.every((result) => result.reason === 'insufficient-envelope')).toBe(true)
        expect(accepted.every(({ result }) => (
          result.availableAfterMinor >= 0 && result.reservedDeltaMinor <= budgetMinor
        ))).toBe(true)

        const active = (await ledger.getHolds()).filter((hold) => hold.state !== 'released')
        const activeMinor = active.reduce((sum, hold) => sum + hold.amountMinor, 0)
        const balance = await ledger.getAvailableBalance()
        if ('kind' in balance) throw new Error(balance.reason)
        expect(activeMinor).toBeLessThanOrEqual(budgetMinor)
        expect(balance.availableBalanceMinor + activeMinor).toBe(budgetMinor)

        await Promise.all(accepted.map(({ index }) => ledger.releaseCascade(`cp6-${schedule}-${index}`)))
        expect(await ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: budgetMinor })
      },
    ), { seed: CP6_SEED, numRuns: CP6_RUNS, verbose: true })

    console.info(`TRAVEL_COMMERCE_PBT ${JSON.stringify({ property: 'CP-6', seed: CP6_SEED, numRuns: CP6_RUNS })}`)
  }, 180_000)
})

function offer(legId: string, amountMinor: number): Quote {
  return Object.freeze({
    kind: 'offer', legId, offerId: `offer-${legId}`, amountMinor: minorUnits(amountMinor), currency: 'SGD',
    priceVerification: 'deterministic-demo', agentId: 'core-pbt',
    promptTokens: 0, completionTokens: 0, dollarCost: 0, provenance: Object.freeze({ source: 'core-pbt' }),
  })
}
