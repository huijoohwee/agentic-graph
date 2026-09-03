import fc from 'fast-check'
import { reset } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'
import { ReoptWorker } from '../../../../../src/bundle/reopt-worker'
import { checkAsyncProperty, demoSeed, emitEvidence } from './_support'
import { executionContext, initialize, localDemoAdapters } from './_runtime'

afterEach(() => reset())

describe('check:cost-observability evidence', () => {
  it('records one zero-token orchestration entry and attributes harness cost separately', async () => {
    let sequence = 0
    const propertyRun = await checkAsyncProperty('check:cost-observability/CP-14', 200, fc.asyncProperty(
      fc.integer({ min: 0, max: 2_000 }),
      fc.integer({ min: 0, max: 2_000 }),
      fc.boolean(),
      async (experienceAmount, transferAmount, rejectTransfer) => {
        sequence += 1
        const generatedSeed = demoSeed(`cost-property-${sequence}`, 10_000)
        const generatedRuntime = await initialize(generatedSeed)
        const generatedHarness = localDemoAdapters(
          { 'experience-tsukiji': experienceAmount, 'transfer-ginza': transferAmount },
          rejectTransfer ? { rejectLegId: 'transfer-ginza' } : {},
        )
        const result = await new ReoptWorker(
          generatedRuntime.localEnv,
          executionContext(),
          generatedHarness.adapters,
        ).handleMutation({
          bundleId: generatedSeed.bundleId,
          legId: 'flight-sin-nrt',
          eventId: `cost-property-${sequence}`,
        })
        if (!('cascadeId' in result)) throw new Error('cascade cost outcome unavailable')
        const generatedEntries = (await generatedRuntime.graph.getCostLog()).filter(
          (entry) => entry.cascadeId === result.cascadeId && entry.component === 'Reopt_Worker',
        )
        expect(generatedEntries).toHaveLength(1)
        expect(generatedEntries[0]).toMatchObject({ promptTokens: 0, completionTokens: 0, dollarCost: 0 })
      },
    ))
    const seed = demoSeed('cost-log')
    const { graph, localEnv } = await initialize(seed)
    const harness = localDemoAdapters({ 'experience-tsukiji': 350, 'transfer-ginza': 225 })
    const result = await new ReoptWorker(localEnv, executionContext(), harness.adapters).handleMutation({
      bundleId: seed.bundleId,
      legId: 'flight-sin-nrt',
      eventId: 'cost-log',
    })
    expect(result).toMatchObject({ kind: 'committed' })
    const entries = await graph.getCostLog()
    const orchestration = entries.filter((entry) => entry.component === 'Reopt_Worker')
    const harnessEntries = entries.filter((entry) => String(entry.component).startsWith('Discovery_Harness:'))
    expect(orchestration).toHaveLength(1)
    expect(orchestration[0]).toMatchObject({ promptTokens: 0, completionTokens: 0, dollarCost: 0 })
    // Cost rows aggregate by harness agent. Both affected legs use the same registered local harness.
    expect(harnessEntries).toHaveLength(1)
    expect(harness.metrics.discoveryDispatches).toBe(2)

    const deterministicOutcomes = []
    const deterministicBalances = []
    for (const suffix of ['left', 'right']) {
      const deterministicSeed = demoSeed(`determinism-${suffix}`, 10_000)
      const deterministicRuntime = await initialize(deterministicSeed)
      const deterministicHarness = localDemoAdapters({
        'experience-tsukiji': 350,
        'transfer-ginza': 225,
      })
      const deterministicResult = await new ReoptWorker(
        deterministicRuntime.localEnv,
        executionContext(),
        deterministicHarness.adapters,
      ).handleMutation({
        bundleId: deterministicSeed.bundleId,
        legId: 'flight-sin-nrt',
        eventId: 'identical-input',
      })
      if (!('affected' in deterministicResult)) throw new Error(deterministicResult.reason)
      deterministicOutcomes.push({
        kind: deterministicResult.kind,
        affected: deterministicResult.affected,
        changes: deterministicResult.changes,
        netAmountMinor: deterministicResult.netAmountMinor,
      })
      deterministicBalances.push(await deterministicRuntime.ledger.getAvailableBalance())
    }
    expect(deterministicOutcomes[0]).toEqual(deterministicOutcomes[1])
    expect(deterministicBalances[0]).toMatchObject({ availableBalanceMinor: 7_425 })
    expect(deterministicBalances[1]).toMatchObject({ availableBalanceMinor: 7_425 })
    emitEvidence('check:cost-observability', ['10.1', '10.2', '10.3', '10.4', '10.5', '10.7'], {
      cascadeCount: 1,
      orchestrationEntries: orchestration.length,
      orchestrationPromptTokens: Number(orchestration[0]?.promptTokens ?? -1),
      orchestrationCompletionTokens: Number(orchestration[0]?.completionTokens ?? -1),
      orchestrationDollarCost: Number(orchestration[0]?.dollarCost ?? -1),
      separatelyAttributedHarnessEntries: harnessEntries.length,
      attributedHarnessDispatches: harness.metrics.discoveryDispatches,
      identicalInputRunsCompared: deterministicOutcomes.length,
      identicalAffectedSets: true,
      identicalCommitDecisions: true,
      identicalNetAmounts: true,
      identicalEnvelopeOutcomes: true,
    }, ['CP-14'], propertyRun)
  }, 120_000)
})
