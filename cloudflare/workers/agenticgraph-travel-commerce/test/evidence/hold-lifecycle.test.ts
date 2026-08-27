import fc from 'fast-check'
import { reset } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'
import { minorUnits } from '../../../../../src/bundle/bundle-runtime'
import { readCachedBalance, writeCachedBalance } from '../../../../../src/cache/balance-cache'
import { guardrailEnvelopeCheck } from '../../../../../src/gate/guardrail-envelope-adapter'
import { availableBalance, conservesBudget, transitionHold } from '../../../../../src/ledger/hold-lifecycle'
import { checkAsyncProperty, checkProperty, emitEvidence, emptyDemoSeed, quote } from './_support'
import { initialize } from './_runtime'

afterEach(() => reset())

describe('check:hold-lifecycle evidence', () => {
  it('proves legal/idempotent transitions, conservation, and immediate release visibility', async () => {
    const propertyRun = checkProperty('check:hold-lifecycle/CP-7-8', 300, fc.property(
      fc.integer({ min: 0, max: 1_000_000 }),
      fc.array(fc.integer({ min: 0, max: 10_000 }), { maxLength: 20 }),
      (budget, amounts) => {
        const holds = amounts.map((amountMinor, index) => reservation(`hold-${index}`, amountMinor, 'reserved'))
        expect(conservesBudget(budget, holds)).toBe(true)
        expect(availableBalance(budget, holds)).toBe(budget - amounts.reduce((sum, amount) => sum + amount, 0))
        for (const hold of holds) {
          const committed = transitionHold(hold, 'committed')
          expect(committed.ok).toBe(true)
          if (committed.ok) expect(transitionHold(committed.hold, 'committed')).toMatchObject({ ok: true, idempotent: true })
        }
      },
    ))

    let divergenceSequence = 0
    const divergenceRun = await checkAsyncProperty('check:hold-lifecycle/CP-11', 200, fc.asyncProperty(
      fc.integer({ min: 0, max: 5_000 }),
      async (budget) => {
        divergenceSequence += 1
        const generatedSeed = emptyDemoSeed(`cache-divergence-${divergenceSequence}`, budget)
        const { ledger, localEnv } = await initialize(generatedSeed)
        const authoritative = await ledger.getAvailableBalance()
        if ('kind' in authoritative) throw new Error(`authoritative balance unavailable: ${authoritative.reason}`)
        await writeCachedBalance(localEnv.BALANCE_CACHE, {
          principalId: generatedSeed.principalId,
          availableBalanceMinor: budget + 1_000,
          revision: `divergent-${divergenceSequence}`,
          cachedAt: 1,
        })
        expect(await guardrailEnvelopeCheck(localEnv, generatedSeed.principalId, budget + 1)).toMatchObject({
          kind: 'rejected', reason: 'insufficient-envelope', details: { availableAtCheck: budget },
        })
        expect(await readCachedBalance(localEnv.BALANCE_CACHE, generatedSeed.principalId)).toMatchObject({
          availableBalanceMinor: budget,
          revision: authoritative.revision,
        })
      },
    ))

    const seed = emptyDemoSeed('release-visibility', 1_000)
    const { ledger } = await initialize(seed)
    expect(await ledger.checkAndReserveCascade('release-me', seed.bundleId, [quote('release-leg', 700)])).toMatchObject({ kind: 'reserved' })
    expect(await ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: 300 })
    expect(await ledger.releaseCascade('release-me')).toMatchObject({ kind: 'released', count: 1 })
    expect(await ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: 1_000 })
    expect(await ledger.releaseCascade('release-me')).toMatchObject({ kind: 'idempotent', count: 1 })
    emitEvidence('check:hold-lifecycle', ['5.1', '5.2', '5.3', '5.4', '5.5', '5.6', '5.7', '5.8'], {
      reservedBalanceMinor: 300,
      balanceImmediatelyAfterReleaseMinor: 1_000,
      repeatedRelease: 'idempotent',
      divergenceSeed: divergenceRun.seed,
      divergenceNumRuns: divergenceRun.numRuns,
      cacheDerivedCommitDecisions: 0,
    }, ['CP-7', 'CP-8', 'CP-11'], propertyRun)
  }, 120_000)
})

function reservation(holdId: string, amountMinor: number, state: 'reserved' | 'committed' | 'released') {
  return { holdId, cascadeId: 'cascade', legId: holdId, offerId: `offer-${holdId}`, amountMinor: minorUnits(amountMinor), state, expiresAt: 1 }
}
