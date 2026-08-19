import fc from 'fast-check'
import { reset } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'
import { ReoptWorker } from '../../../../../src/bundle/reopt-worker'
import { stableJson } from '../../../../../src/bundle/bundle-runtime'
import { checkAsyncProperty, checkProperty, demoSeed, emitEvidence, quote } from './_support'
import { executionContext, initialize, localDemoAdapters } from './_runtime'

afterEach(() => reset())

describe('check:atomic-commit evidence', () => {
  it('observes only complete affected-set updates and byte-identical rollback snapshots', async () => {
    let sequence = 0
    const propertyRun = await checkAsyncProperty('check:atomic-commit/CP-3', 500, fc.asyncProperty(
      fc.integer({ min: 0, max: 2_000 }),
      fc.integer({ min: 0, max: 2_000 }),
      async (experienceAmount, transferAmount) => {
        sequence += 1
        const propertySeed = demoSeed(`atomic-property-${sequence}`, 10_000)
        const { graph, ledger } = await initialize(propertySeed)
        const event = {
          bundleId: propertySeed.bundleId,
          legId: 'flight-sin-nrt',
          eventId: `atomic-${sequence}`,
        }
        const before = await graph.getSnapshot()
        const beforeAffected = before?.legs.filter((leg) => (
          leg.legId === 'experience-tsukiji' || leg.legId === 'transfer-ginza'
        )) ?? []
        const begin = await graph.beginCascade(event)
        expect(begin.kind).toBe('plan')
        const cascadeId = `${event.bundleId}:${event.legId}:${event.eventId}`
        const quotes = [
          quote('experience-tsukiji', experienceAmount, `atomic-${sequence}`),
          quote('transfer-ginza', transferAmount, `atomic-${sequence}`),
        ]
        const reserved = await ledger.checkAndReserveCascade(cascadeId, propertySeed.bundleId, quotes)
        expect(reserved).toMatchObject({ kind: 'reserved' })
        const prepared = await graph.prepareCommit(cascadeId, quotes)
        if ('kind' in prepared) throw new Error(`prepare failed: ${prepared.reason}`)

        // Preparation is durable, but the externally visible bundle projection is still the prior snapshot.
        const preparedSnapshot = await graph.getSnapshot()
        const preparedAffected = preparedSnapshot?.legs.filter((leg) => (
          leg.legId === 'experience-tsukiji' || leg.legId === 'transfer-ginza'
        )) ?? []
        expect(stableJson(preparedSnapshot)).toBe(stableJson(before))
        expect(stableJson(preparedAffected)).toBe(stableJson(beforeAffected))

        let finalizable = prepared
        if (finalizable.phase === 'settlement_pending') {
          const owner = `atomic-owner-${sequence}`
          expect(await graph.claimSettlement(cascadeId, owner)).toMatchObject({ kind: 'claimed' })
          expect(await graph.recordSettlementAttempt(cascadeId, owner)).toMatchObject({ settlementAttempts: 1 })
          const marked = await graph.markSettlementComplete(cascadeId, owner)
          if ('kind' in marked) throw new Error(`settlement mark failed: ${marked.reason}`)
          finalizable = marked
        }
        expect(finalizable.phase).toBe('finalizing')
        expect(await ledger.commitCascade(cascadeId)).toMatchObject({ kind: 'committed', count: 2 })
        const applied = await graph.commitPreparedCascade(cascadeId)
        if ('kind' in applied) throw new Error(`graph commit failed: ${applied.reason}`)
        expect(applied.phase).toBe('archiving')

        const committedSnapshot = await graph.getSnapshot()
        const committedAffected = committedSnapshot?.legs.filter((leg) => (
          leg.legId === 'experience-tsukiji' || leg.legId === 'transfer-ginza'
        )) ?? []
        expect(committedAffected).toHaveLength(2)
        expect(committedAffected.map((leg) => leg.lastCascadeId)).toEqual([cascadeId, cascadeId])
        expect(Object.fromEntries(committedAffected.map((leg) => [leg.legId, leg.committedAmountMinor]))).toEqual({
          'experience-tsukiji': experienceAmount,
          'transfer-ginza': transferAmount,
        })
        expect(await graph.finishCascade(cascadeId, false)).toMatchObject({ kind: 'committed' })
      },
    ))

    let rollbackSequence = 0
    const rollbackPropertySeed = demoSeed('atomic-rollback-property', 10_000)
    const rollbackPropertyGraph = (await initialize(rollbackPropertySeed)).graph
    const rollbackPropertyBaseline = stableJson(await rollbackPropertyGraph.getSnapshot())
    const rollbackRun = await checkAsyncProperty('check:atomic-commit/CP-4', 200, fc.asyncProperty(
      fc.integer({ min: 0, max: 2_000 }),
      fc.integer({ min: 0, max: 2_000 }),
      async (experienceAmount, transferAmount) => {
        rollbackSequence += 1
        const event = {
          bundleId: rollbackPropertySeed.bundleId,
          legId: 'flight-sin-nrt',
          eventId: `rollback-${rollbackSequence}`,
        }
        const begin = await rollbackPropertyGraph.beginCascade(event)
        if (begin.kind !== 'plan') throw new Error('expected rollback cascade plan')
        const prepared = await rollbackPropertyGraph.prepareCommit(begin.record.cascadeId, [
          quote('experience-tsukiji', experienceAmount, `rollback-${rollbackSequence}`),
          quote('transfer-ginza', transferAmount, `rollback-${rollbackSequence}`),
        ])
        if ('kind' in prepared) throw new Error(`rollback prepare failed: ${prepared.reason}`)
        expect(await rollbackPropertyGraph.rollbackCascade(begin.record.cascadeId, 'generated-rollback')).toMatchObject({
          kind: 'rolled-back', reason: 'generated-rollback',
        })
        expect(await rollbackPropertyGraph.confirmRollbackRelease(begin.record.cascadeId))
          .toMatchObject({ kind: 'rolled-back', releaseConfirmed: true })
        expect(stableJson(await rollbackPropertyGraph.getSnapshot())).toBe(rollbackPropertyBaseline)
      },
    ))

    const roundTripRun = checkProperty('check:atomic-commit/CP-10', 200, fc.property(
      fc.integer({ min: 0, max: 2_000 }),
      fc.integer({ min: 0, max: 2_000 }),
      (experienceAmount, transferAmount) => {
        const seed = demoSeed('atomic-round-trip', 10_000)
        const candidate = {
          ...seed,
          legs: seed.legs.map((leg) => ({
            ...leg,
            committedAmountMinor: leg.legId === 'experience-tsukiji'
              ? experienceAmount
              : leg.legId === 'transfer-ginza' ? transferAmount : leg.committedAmountMinor,
          })),
        }
        const serialized = stableJson(candidate)
        expect(stableJson(JSON.parse(serialized))).toBe(serialized)
      },
    ))

    let idempotenceSequence = 0
    const idempotenceSeed = demoSeed('atomic-idempotence-property', 10_000)
    const idempotenceRuntime = await initialize(idempotenceSeed)
    const idempotenceHarness = localDemoAdapters({
      'experience-tsukiji': 350,
      'transfer-ginza': 225,
    })
    const idempotenceRun = await checkAsyncProperty('check:atomic-commit/CP-9', 200, fc.asyncProperty(
      fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9._-]{0,12}$/),
      async (suffix) => {
        idempotenceSequence += 1
        const event = {
          bundleId: idempotenceSeed.bundleId,
          legId: 'flight-sin-nrt',
          eventId: `repeat-${idempotenceSequence}-${suffix}`,
        }
        const settlementsBefore = idempotenceHarness.metrics.settlementCalls
        const archivesBefore = idempotenceHarness.metrics.archiveWrites
        const worker = new ReoptWorker(idempotenceRuntime.localEnv, executionContext(), idempotenceHarness.adapters)
        const first = await worker.handleMutation(event)
        const replay = await worker.handleMutation(event)
        expect(replay).toEqual(first)
        expect(idempotenceHarness.metrics.settlementCalls - settlementsBefore).toBeLessThanOrEqual(1)
        expect(idempotenceHarness.metrics.archiveWrites - archivesBefore).toBe(1)
      },
    ))

    const rejectedSeed = demoSeed('atomic-rejected')
    const rejectedRuntime = await initialize(rejectedSeed)
    const beforeRejected = stableJson(await rejectedRuntime.graph.getSnapshot())
    const rejectedHarness = localDemoAdapters(
      { 'experience-tsukiji': 350, 'transfer-ginza': 225 },
      { rejectLegId: 'transfer-ginza' },
    )
    const rejectedOutcome = await new ReoptWorker(
      rejectedRuntime.localEnv,
      executionContext(),
      rejectedHarness.adapters,
    ).handleMutation({ bundleId: rejectedSeed.bundleId, legId: 'flight-sin-nrt', eventId: 'atomic-rejected' })
    const afterRejected = stableJson(await rejectedRuntime.graph.getSnapshot())
    expect(rejectedOutcome).toMatchObject({ kind: 'rolled-back', reason: 'requote-rejected' })
    expect(afterRejected).toBe(beforeRejected)
    expect(rejectedHarness.metrics.settlementCalls).toBe(0)
    emitEvidence('check:atomic-commit', ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6'], {
      generatedAtomicTransactions: propertyRun.numRuns,
      mixedStateObservations: 0,
      rollbackSnapshotByteIdentical: true,
      rollbackSettlementCalls: rejectedHarness.metrics.settlementCalls,
      rollbackSeed: rollbackRun.seed,
      rollbackNumRuns: rollbackRun.numRuns,
      roundTripSeed: roundTripRun.seed,
      roundTripNumRuns: roundTripRun.numRuns,
      idempotenceSeed: idempotenceRun.seed,
      idempotenceNumRuns: idempotenceRun.numRuns,
    }, ['CP-3', 'CP-4', 'CP-9', 'CP-10'], propertyRun)
  }, 240_000)
})
