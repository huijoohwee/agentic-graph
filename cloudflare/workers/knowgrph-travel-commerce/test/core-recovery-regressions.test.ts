import { createExecutionContext, reset, runInDurableObject, waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import { ArchiveConflictError } from '../../../../src/archive/provenance-archive'
import {
  cascadeIdFor,
  isCascadeIdentifier,
  minorUnits,
  readQuote,
  signedMinorUnits,
  stableJson,
} from '../../../../src/bundle/bundle-runtime'
import type {
  BundleSeed, RuntimeCascadeOutcome, CascadeRecord, Quote,
} from '../../../../src/bundle/bundle-types'
import { recoverPreparedCascade, settleCascade } from '../../../../src/bundle/cascade-recovery'
import { ReoptWorker } from '../../../../src/bundle/reopt-worker'
import { migrateBundleGraph } from '../../../../src/bundle/bundle-graph-schema'
import { OfferCache } from '../../../../src/cache/offer-cache'
import { confirmAvailableBalance, guardrailEnvelopeCheck } from '../../../../src/gate/guardrail-envelope-adapter'

afterEach(() => reset())

describe('transaction and recovery regressions', () => {
  it('claims bundle initialization before the ledger await and never loses concurrent topology', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const bundleId = 'bundle-init-race'
    const principalId = 'principal-init-race'
    const graph = runtime.BUNDLE_GRAPH.getByName(bundleId)
    const left = singleLegSeed(bundleId, principalId, 'left', 100)
    const right = singleLegSeed(bundleId, principalId, 'right', 200)
    const initialized = await Promise.all([graph.initBundle(left), graph.initBundle(right)])
    expect(initialized.filter((result) => result.kind === 'initialized')).toHaveLength(1)
    expect(initialized.filter((result) => result.kind === 'rejected'))
      .toEqual([{ kind: 'rejected', reason: 'bundle-initialization-conflict' }])

    const initial = await graph.getSnapshot()
    expect(initial?.legs).toHaveLength(1)
    const inserted = await Promise.all(['extra-a', 'extra-b'].map((legId) => graph.insertLeg({
      legId, principalId, category: 'test', committedOfferId: null,
      committedAmountMinor: null, lastCascadeId: null,
    })))
    expect(inserted.every((result) => result.kind === 'inserted')).toBe(true)
    expect((await graph.getSnapshot())?.legs.map((leg) => leg.legId).sort())
      .toEqual([initial!.legs[0].legId, 'extra-a', 'extra-b'].sort())
    expect(await graph.insertLeg({
      legId: 'unsafe-committed', principalId, category: 'test', committedOfferId: 'external-offer',
      committedAmountMinor: minorUnits(10), lastCascadeId: null,
    })).toEqual({ kind: 'rejected', reason: 'committed-leg-insertion-unsupported' })
  })

  it('requires provider effect proof and types identity conflicts without trusting a journal receipt', async () => {
    const record = preparedRecord('settlement-wire')
    let body: Record<string, unknown> | null = null
    const conflict = await settleCascade(fetcher(async (request) => {
      body = await request.json() as Record<string, unknown>
      return Response.json({
        ok: false, code: 'idempotency-conflict', idempotencyKey: record.cascadeId,
      }, { status: 409 })
    }), 'SGD', record, Date.now() + 1_000)
    expect(body).not.toHaveProperty('claimOwner')
    expect(body).toMatchObject({ cascadeId: record.cascadeId, amountMinor: 25, currency: 'SGD' })
    expect(conflict).toEqual({
      kind: 'reconciliation-required', cascadeId: record.cascadeId,
      reason: 'settlement-idempotency-conflict',
    })

    const journalOnly = await settleCascade(fetcher(async () => Response.json({
      ok: true, idempotencyKey: record.cascadeId, settlementId: 'journal-only',
    })), 'SGD', record, Date.now() + 1_000)
    expect(journalOnly).toMatchObject({ kind: 'pending', reason: 'settlement-response-ambiguous' })

    const settled = await settleCascade(fetcher(async () => Response.json({
      ok: true, idempotencyKey: record.cascadeId, settlementId: 'settlement-provider-1',
      amountMinor: 25, currency: 'SGD', effect: 'charged', providerReference: 'provider-receipt-1',
    })), 'SGD', record, Date.now() + 1_000)
    expect(settled).toEqual({
      kind: 'settled', idempotencyKey: record.cascadeId, settlementId: 'settlement-provider-1',
    })

    const definitive = await settleCascade(fetcher(async () => Response.json({
      ok: false, code: 'settlement-effect-rejected', idempotencyKey: record.cascadeId,
      definitive: true, effectApplied: false,
    }, { status: 422 })), 'SGD', record, Date.now() + 1_000)
    expect(definitive).toEqual({ kind: 'rejected', reason: 'settlement-effect-rejected' })

    const started = performance.now()
    const timedOut = await settleCascade(fetcher((request) => new Promise<Response>((_resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true })
    })), 'SGD', record, Date.now() + 20)
    expect(timedOut).toMatchObject({ kind: 'pending' })
    expect(performance.now() - started).toBeLessThan(250)
  })

  it('does not finalize journal-only settlement and stops an identity conflict for reconciliation', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const dispatch = async (record: CascadeRecord) => ({
      kind: 'quoted' as const,
      quotes: record.affected.map((legId) => offer(legId, 125, 'effect-proof')),
      quoteCount: record.affected.length,
      rejectCount: 0 as const,
    })
    const journalSeed = chainSeed('journal-effect-proof')
    const journalGraph = runtime.BUNDLE_GRAPH.getByName(journalSeed.bundleId)
    await journalGraph.initBundle(journalSeed)
    let journalCalls = 0
    const journalEnv = new Proxy(runtime, {
      get(target, property, receiver) {
        if (property !== 'ISSUANCE_SERVICE') return Reflect.get(target, property, receiver)
        return fetcher(async () => {
          journalCalls += 1
          return Response.json({
            ok: true, idempotencyKey: `${journalSeed.bundleId}:flight:journal`,
            settlementId: 'journal-row-only',
          })
        })
      },
    }) as TravelCommerceEnv
    const journalEvent = { bundleId: journalSeed.bundleId, legId: 'flight', eventId: 'journal' }
    expect(await new ReoptWorker(journalEnv, createExecutionContext(), { dispatch }).handleMutation(journalEvent))
      .toMatchObject({ kind: 'reconciliation-required', reason: 'settlement-response-ambiguous' })
    expect(await journalGraph.getCascade(cascadeIdFor(journalEvent))).toMatchObject({
      phase: 'reconciliation_required', outcome: { kind: 'reconciliation-required' }, settlementAttempts: 1,
    })
    expect(await runtime.ENVELOPE_LEDGER.getByName(journalSeed.principalId).getHolds())
      .toEqual(expect.arrayContaining([expect.objectContaining({ state: 'quarantined' })]))
    expect((await journalGraph.getSnapshot())?.legs.find((leg) => leg.legId === 'hotel'))
      .toMatchObject({ committedOfferId: 'hotel-old', committedAmountMinor: 100 })
    expect(journalCalls).toBe(1)

    const conflictSeed = chainSeed('settlement-identity-conflict')
    const conflictGraph = runtime.BUNDLE_GRAPH.getByName(conflictSeed.bundleId)
    await conflictGraph.initBundle(conflictSeed)
    const conflictEvent = { bundleId: conflictSeed.bundleId, legId: 'flight', eventId: 'conflict' }
    let conflictCalls = 0
    const conflictEnv = new Proxy(runtime, {
      get(target, property, receiver) {
        if (property !== 'ISSUANCE_SERVICE') return Reflect.get(target, property, receiver)
        return fetcher(async () => {
          conflictCalls += 1
          return Response.json({
            ok: false, code: 'idempotency-conflict',
            idempotencyKey: cascadeIdFor(conflictEvent),
          }, { status: 409 })
        })
      },
    }) as TravelCommerceEnv
    const first = await new ReoptWorker(
      conflictEnv, createExecutionContext(), { dispatch },
    ).handleMutation(conflictEvent)
    expect(first).toMatchObject({
      kind: 'reconciliation-required', reason: 'settlement-idempotency-conflict',
    })
    expect(await conflictGraph.getCascade(cascadeIdFor(conflictEvent))).toMatchObject({
      phase: 'reconciliation_required', settlementAttempts: 1,
    })
    expect(await new ReoptWorker(
      conflictEnv, createExecutionContext(), { dispatch },
    ).handleMutation(conflictEvent)).toEqual(first)
    expect(conflictCalls).toBe(1)
  })

  it('advances recovery to the live claim lease and terminates released-hold ambiguity safely', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const seed = chainSeed('claim-recovery')
    const graph = runtime.BUNDLE_GRAPH.getByName(seed.bundleId)
    const ledger = runtime.ENVELOPE_LEDGER.getByName(seed.principalId)
    await graph.initBundle(seed)
    const begin = await graph.beginCascade({ bundleId: seed.bundleId, legId: 'flight', eventId: 'ambiguous' })
    if (begin.kind !== 'plan') throw new Error('expected plan')
    const replacement = offer('hotel', 125, 'hotel-new')
    await ledger.checkAndReserveCascade(begin.record.cascadeId, seed.bundleId, [replacement])
    await graph.prepareCommit(begin.record.cascadeId, [replacement])
    const now = Date.now()
    const claim = await graph.claimSettlement(begin.record.cascadeId, 'owner-a', now, 15_000)
    expect(claim).toMatchObject({ kind: 'claimed', expiresAt: now + 15_000 })
    expect(await graph.recordSettlementAttempt(begin.record.cascadeId, 'owner-a', now + 1))
      .toMatchObject({ settlementAttempts: 1 })
    const deferred = await graph.deferRecovery(begin.record.cascadeId, 'provider-pending', now + 100)
    expect(deferred).toMatchObject({ nextRecoveryAt: now + 15_000 })
    expect(await graph.claimSettlement(begin.record.cascadeId, 'owner-b', now + 200))
      .toMatchObject({ kind: 'busy', expiresAt: now + 15_000 })
    expect(await graph.getCascade(begin.record.cascadeId)).toMatchObject({ nextRecoveryAt: now + 15_000 })

    await runInDurableObject(graph, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE cascades SET phase = 'settlement_pending' WHERE cascade_id = ?", begin.record.cascadeId,
      )
    })
    await ledger.releaseCascade(begin.record.cascadeId)
    const current = await graph.getCascade(begin.record.cascadeId)
    const recovered = await recoverPreparedCascade(graph, runtime, current!, Date.now() + 1_000)
    expect(recovered).toMatchObject({
      kind: 'reconciliation-required', reason: 'hold-recovery-unknown-cascade-holds', settlementCalls: 1,
    })
    expect(await graph.getCascade(begin.record.cascadeId)).toMatchObject({
      phase: 'reconciliation_required', nextRecoveryAt: null,
    })
    expect(await ledger.checkAndReserveCascade(begin.record.cascadeId, seed.bundleId, [replacement]))
      .toEqual({ kind: 'rejected', reason: 'cascade-reservation-released' })
  })

  it('uses byte-identical canonical archive input and terminalizes immutable conflicts', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const seed = chainSeed('archive-canonical')
    await runtime.BUNDLE_GRAPH.getByName(seed.bundleId).initBundle(seed)
    const payloads: string[] = []
    let archives = 0
    const adapters = {
      dispatch: async (record: CascadeRecord) => ({
        kind: 'quoted' as const, quotes: record.affected.map((legId) => offer(legId, 125, 'archive')),
        quoteCount: record.affected.length, rejectCount: 0 as const,
      }),
      settle: async (record: CascadeRecord) => ({
        kind: 'settled' as const, settlementId: 'settled', idempotencyKey: record.cascadeId,
      }),
      archive: async (_bucket: R2Bucket, snapshot: unknown, outcome: RuntimeCascadeOutcome) => {
        payloads.push(stableJson({ snapshot, outcome }))
        archives += 1
        if (archives === 1) throw new Error('r2-ambiguous')
        return { kind: 'written' as const, key: 'provenance/key', digest: 'digest' }
      },
    }
    const event = { bundleId: seed.bundleId, legId: 'flight', eventId: 'canonical' }
    expect(await new ReoptWorker(runtime, createExecutionContext(), adapters).handleMutation(event))
      .toMatchObject({ kind: 'committed', archiveDeferred: true, settlementCalls: 1 })
    expect(await new ReoptWorker(runtime, createExecutionContext(), adapters).handleMutation(event))
      .toMatchObject({ kind: 'committed', archiveDeferred: false })
    expect(payloads).toHaveLength(2)
    expect(payloads[1]).toBe(payloads[0])

    const conflictSeed = chainSeed('archive-conflict')
    const conflictGraph = runtime.BUNDLE_GRAPH.getByName(conflictSeed.bundleId)
    await conflictGraph.initBundle(conflictSeed)
    let conflictCalls = 0
    const conflictAdapters = {
      ...adapters,
      archive: async () => { conflictCalls += 1; throw new ArchiveConflictError() },
    }
    const conflictEvent = { bundleId: conflictSeed.bundleId, legId: 'flight', eventId: 'conflict' }
    expect(await new ReoptWorker(runtime, createExecutionContext(), conflictAdapters).handleMutation(conflictEvent))
      .toMatchObject({ kind: 'committed', archiveDeferred: true, reason: 'archive-immutable' })
    expect(await conflictGraph.getCascade(cascadeIdFor(conflictEvent))).toMatchObject({
      phase: 'archive_failed', nextRecoveryAt: null,
    })
    await new ReoptWorker(runtime, createExecutionContext(), conflictAdapters).handleMutation(conflictEvent)
    expect(conflictCalls).toBe(1)
  })

  it('encodes collision-free cascade keys and rejects cross-currency holds before mutation', async () => {
    const first = cascadeIdFor({ bundleId: 'bundle', legId: 'leg:a', eventId: 'event' })
    const second = cascadeIdFor({ bundleId: 'bundle', legId: 'leg', eventId: 'a:event' })
    expect(first).not.toBe(second)
    const long = cascadeIdFor({
      bundleId: 'b'.repeat(127), legId: 'l'.repeat(127), eventId: 'e'.repeat(127),
    })
    expect(isCascadeIdentifier(long)).toBe(true)
    expect(long.length).toBeLessThanOrEqual(511)

    const runtime = env as unknown as TravelCommerceEnv
    const ledger = runtime.ENVELOPE_LEDGER.getByName('principal-currency')
    await ledger.init('principal-currency', 1_000)
    expect(await ledger.checkAndReserveCascade('currency-cascade', 'currency-bundle', [{
      ...offer('hotel', 100, 'usd'), currency: 'USD',
    }])).toEqual({ kind: 'rejected', reason: 'quote-currency-mismatch' })
    expect(await ledger.getHolds()).toEqual([])
    await runInDurableObject(ledger, (_instance, state) => {
      state.storage.sql.exec("UPDATE envelope SET currency = 'USD'")
    })
    expect(await ledger.checkAndReserveCascade(
      'currency-config-drift', 'currency-bundle', [offer('hotel', 100, 'sgd')],
    )).toEqual({ kind: 'rejected', reason: 'envelope-currency-conflict' })
    expect(readQuote({
      kind: 'offer', legId: 'hotel', offerId: 'search-only', amountMinor: 100, currency: 'SGD',
      agentId: 'provider', promptTokens: 0, completionTokens: 0, dollarCost: 0, provenance: {},
    }, 'hotel')).toEqual({ kind: 'rejected', reason: 'requote-malformed' })
    expect(readQuote({
      kind: 'offer', legId: 'hotel', offerId: 'unmetered', amountMinor: 100, currency: 'SGD',
      priceVerification: 'verified', agentId: 'provider', completionTokens: 0,
      dollarCost: -1, provenance: {},
    }, 'hotel')).toEqual({ kind: 'rejected', reason: 'requote-malformed' })

    const seed = chainSeed('verification-production')
    const graph = runtime.BUNDLE_GRAPH.getByName(seed.bundleId)
    await graph.initBundle(seed)
    const production = new Proxy(runtime, {
      get(target, property, receiver) {
        return property === 'DEPLOY_LANE' ? 'Production_Lane' : Reflect.get(target, property, receiver)
      },
    }) as TravelCommerceEnv
    let settlements = 0
    const outcome = await new ReoptWorker(production, createExecutionContext(), {
      dispatch: async (record) => ({
        kind: 'quoted' as const, quotes: record.affected.map((legId) => offer(legId, 100, 'demo-only')),
        quoteCount: record.affected.length, rejectCount: 0 as const,
      }),
      settle: async (record) => {
        settlements += 1
        return { kind: 'settled' as const, settlementId: 'unexpected', idempotencyKey: record.cascadeId }
      },
    }).handleMutation({ bundleId: seed.bundleId, legId: 'flight', eventId: 'production-unverified' })
    expect(outcome).toMatchObject({ kind: 'rolled-back', reason: 'quote-unverified' })
    expect(settlements).toBe(0)
  })

  it('bypasses non-authoritative cache failure and types ledger failure closed', async () => {
    const cache = {
      get: async () => { throw new Error('kv-down') },
      put: async () => { throw new Error('kv-down') },
      delete: async () => { throw new Error('kv-down') },
    }
    const working = {
      BALANCE_CACHE: cache,
      ENVELOPE_LEDGER: { getByName: () => ({
        getAvailableBalance: async () => ({ principalId: 'principal-gate', availableBalanceMinor: 50, revision: 'r1' }),
      }) },
    } as unknown as TravelCommerceEnv
    expect(await guardrailEnvelopeCheck(working, 'principal-gate', 50))
      .toEqual({ status: 'pass', availableBalanceMinor: 50 })
    const down = {
      ...working,
      ENVELOPE_LEDGER: { getByName: () => ({ getAvailableBalance: async () => { throw new Error('do-down') } }) },
    } as unknown as TravelCommerceEnv
    expect(await confirmAvailableBalance(down, 'principal-gate'))
      .toEqual({ kind: 'rejected', reason: 'envelope-unavailable' })
  })

  it('keeps rollback hold release durable and replayable when the ledger RPC fails', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const seed = chainSeed('rollback-release-retry')
    const graph = runtime.BUNDLE_GRAPH.getByName(seed.bundleId)
    await graph.initBundle(seed)
    let releases = 0
    const retryEnv = new Proxy(runtime, {
      get(target, property, receiver) {
        if (property !== 'ENVELOPE_LEDGER') return Reflect.get(target, property, receiver)
        return { getByName: () => ({
          releaseCascade: async () => {
            releases += 1
            if (releases === 1) throw new Error('ledger-rpc-down')
            return { kind: 'released' as const, count: 0 }
          },
        }) }
      },
    }) as TravelCommerceEnv
    const adapters = {
      dispatch: async () => ({
        kind: 'rejected' as const, reason: 'requote-definite-rejection', quoteCount: 1, rejectCount: 1,
      }),
    }
    const event = { bundleId: seed.bundleId, legId: 'flight', eventId: 'release-retry' }
    expect(await new ReoptWorker(retryEnv, createExecutionContext(), adapters).handleMutation(event))
      .toMatchObject({ kind: 'pending', reason: 'hold-release-ledger-rpc-down' })
    expect(await graph.getCascade(cascadeIdFor(event))).toMatchObject({
      phase: 'rolled_back', outcome: { kind: 'rolled-back', releaseConfirmed: false },
    })
    expect((await graph.getCascade(cascadeIdFor(event)))?.nextRecoveryAt).not.toBeNull()
    expect(await new ReoptWorker(retryEnv, createExecutionContext(), adapters).handleMutation(event))
      .toMatchObject({ kind: 'rolled-back', releaseConfirmed: true })
    expect(releases).toBe(2)
    expect((await graph.getCascade(cascadeIdFor(event)))?.nextRecoveryAt).toBeNull()
  })

  it('enforces the cascade wall cap with phase-aware rollback, pending, and deferred archive', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const beforeSeed = chainSeed('deadline-before-effect')
    const beforeGraph = runtime.BUNDLE_GRAPH.getByName(beforeSeed.bundleId)
    const beforeLedger = runtime.ENVELOPE_LEDGER.getByName(beforeSeed.principalId)
    await beforeGraph.initBundle(beforeSeed)
    const before = await beforeGraph.beginCascade({
      bundleId: beforeSeed.bundleId, legId: 'flight', eventId: 'deadline',
    })
    if (before.kind !== 'plan') throw new Error('expected plan')
    const replacement = offer('hotel', 125, 'deadline')
    await beforeLedger.checkAndReserveCascade(before.record.cascadeId, beforeSeed.bundleId, [replacement])
    const prepared = await beforeGraph.prepareCommit(before.record.cascadeId, [replacement])
    if ('kind' in prepared) throw new Error(prepared.reason)
    expect(await recoverPreparedCascade(beforeGraph, runtime, prepared, Date.now() - 1))
      .toMatchObject({ kind: 'rolled-back', reason: 'cascade-timeout', releaseConfirmed: true })

    const afterSeed = chainSeed('deadline-after-attempt')
    const afterGraph = runtime.BUNDLE_GRAPH.getByName(afterSeed.bundleId)
    const afterLedger = runtime.ENVELOPE_LEDGER.getByName(afterSeed.principalId)
    await afterGraph.initBundle(afterSeed)
    const after = await afterGraph.beginCascade({
      bundleId: afterSeed.bundleId, legId: 'flight', eventId: 'deadline',
    })
    if (after.kind !== 'plan') throw new Error('expected plan')
    await afterLedger.checkAndReserveCascade(after.record.cascadeId, afterSeed.bundleId, [replacement])
    const afterPrepared = await afterGraph.prepareCommit(after.record.cascadeId, [replacement])
    if ('kind' in afterPrepared) throw new Error(afterPrepared.reason)
    await afterGraph.claimSettlement(after.record.cascadeId, 'deadline-owner')
    const attempted = await afterGraph.recordSettlementAttempt(after.record.cascadeId, 'deadline-owner')
    if ('kind' in attempted) throw new Error(attempted.reason)
    expect(await recoverPreparedCascade(afterGraph, runtime, attempted, Date.now() - 1))
      .toMatchObject({ kind: 'reconciliation-required', reason: 'settlement-outcome-unknown' })
    expect(await afterGraph.getCascade(after.record.cascadeId)).toMatchObject({
      phase: 'reconciliation_required', outcome: { kind: 'reconciliation-required' }, settlementAttempts: 1,
    })
    const decision = {
      decisionId: 'deadline-confirmed-effect', decision: 'commit' as const,
      operatorId: 'deadline-operator', reason: 'provider-effect-confirmed',
    }
    expect(await afterGraph.stageReconciliationDecision(after.record.cascadeId, decision))
      .toMatchObject({ kind: 'staged' })
    expect(await afterLedger.resolveReconciliation(after.record.cascadeId, decision))
      .toMatchObject({ kind: 'resolved', decision: 'commit' })
    const applied = await afterGraph.applyReconciliationDecision(
      after.record.cascadeId, decision.decisionId,
    )
    if (applied.kind === 'rejected') throw new Error(applied.reason)
    const archiving = applied.record
    let archiveCalls = 0
    const started = performance.now()
    const archived = await recoverPreparedCascade(afterGraph, runtime, archiving, Date.now() + 15, {
      archive: async () => {
        archiveCalls += 1
        await new Promise((resolve) => setTimeout(resolve, 75))
        return { kind: 'written', key: 'late', digest: 'late' }
      },
    })
    expect(archived).toMatchObject({ kind: 'committed', archiveDeferred: true })
    expect(archiveCalls).toBe(1)
    expect(performance.now() - started).toBeLessThan(100)

    const adapterSeed = chainSeed('deadline-adapter')
    await runtime.BUNDLE_GRAPH.getByName(adapterSeed.bundleId).initBundle(adapterSeed)
    const shortRuntime = new Proxy(runtime, {
      get(target, property, receiver) {
        return property === 'CASCADE_WALL_MS' ? '40' : Reflect.get(target, property, receiver)
      },
    }) as TravelCommerceEnv
    let settlementCalls = 0
    const adapterStarted = performance.now()
    const adapterOutcome = await new ReoptWorker(shortRuntime, createExecutionContext(), {
      dispatch: async (record) => ({
        kind: 'quoted' as const,
        quotes: record.affected.map((legId) => offer(legId, 125, 'slow-settlement')),
        quoteCount: record.affected.length, rejectCount: 0 as const,
      }),
      settle: async (record) => {
        settlementCalls += 1
        await new Promise((resolve) => setTimeout(resolve, 150))
        return { kind: 'settled' as const, settlementId: 'late', idempotencyKey: record.cascadeId }
      },
    }).handleMutation({ bundleId: adapterSeed.bundleId, legId: 'flight', eventId: 'slow-adapter' })
    expect(adapterOutcome).toMatchObject({ kind: 'reconciliation-required', reason: 'settlement-outcome-unknown' })
    expect(settlementCalls).toBe(1)
    expect(performance.now() - adapterStarted).toBeLessThan(125)
    expect(await runtime.BUNDLE_GRAPH.getByName(adapterSeed.bundleId).getCascade(
      cascadeIdFor({ bundleId: adapterSeed.bundleId, legId: 'flight', eventId: 'slow-adapter' }),
    )).toMatchObject({
      phase: 'reconciliation_required', settlementAttempts: 1,
      outcome: { kind: 'reconciliation-required' },
    })
  })

  it('adopts legacy committed positions without double counting and backfills recovery alarms', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const principalId = 'principal-legacy-migration'
    const bundleId = 'bundle-legacy-migration'
    const ledger = runtime.ENVELOPE_LEDGER.getByName(principalId)
    await ledger.init(principalId, 1_000)
    await runInDurableObject(ledger, (_instance, state) => {
      state.storage.sql.exec(
        `INSERT INTO holds (
          hold_id, cascade_id, bundle_id, leg_id, offer_id, amount_minor, target_amount_minor,
          prior_hold_id, state, expires_at
        ) VALUES (?, ?, 'legacy', 'hotel', 'old-offer', 90, 90, NULL, 'committed', ?)`,
        'legacy-old', `${bundleId}:hotel:event-old`, Number.MAX_SAFE_INTEGER,
      )
      state.storage.sql.exec(
        `INSERT INTO holds (
          hold_id, cascade_id, bundle_id, leg_id, offer_id, amount_minor, target_amount_minor,
          prior_hold_id, state, expires_at
        ) VALUES (?, ?, 'legacy', 'hotel', 'latest-offer', 100, 100, NULL, 'committed', ?)`,
        'legacy-latest', `${bundleId}:hotel:event-latest`, Number.MAX_SAFE_INTEGER,
      )
    })
    expect(await ledger.init(principalId, 1_000, [{
      bundleId, legId: 'hotel', offerId: 'latest-offer', amountMinor: minorUnits(100),
    }])).toMatchObject({ kind: 'idempotent', seededCommitments: 0 })
    expect(await ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: 900 })
    expect((await ledger.getHolds()).filter((hold) => hold.state === 'committed'))
      .toMatchObject([{ holdId: 'legacy-latest', bundleId, amountMinor: 100 }])

    const seed = chainSeed('recovery-backfill')
    const graph = runtime.BUNDLE_GRAPH.getByName(seed.bundleId)
    await graph.initBundle(seed)
    const begun = await graph.beginCascade({ bundleId: seed.bundleId, legId: 'flight', eventId: 'backfill' })
    if (begun.kind !== 'plan') throw new Error('expected plan')
    await runInDurableObject(graph, (_instance, state) => {
      state.storage.sql.exec('UPDATE cascades SET next_recovery_at = NULL WHERE cascade_id = ?', begun.record.cascadeId)
      migrateBundleGraph(state)
    })
    expect(await graph.getCascade(begun.record.cascadeId)).toMatchObject({
      recoveryAttempts: 0,
    })
    expect((await graph.getCascade(begun.record.cascadeId))?.nextRecoveryAt).not.toBeNull()
  })

  it('single-flights stale revalidation and prevents an older advisory write from winning', async () => {
    let now = 1_000
    let calls = 0
    const cache = new OfferCache('core-regression-single-flight', 30_000, 60_000, () => now)
    const discovery = fetcher(async (request) => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 5))
      const value = await request.json() as { intent?: { intentId?: string } }
      const legId = value.intent?.intentId?.split(':').at(-1) ?? 'hotel'
      return Response.json(offer(legId, 100 + calls, `call-${calls}`))
    })
    const input = {
      event: { bundleId: 'cache-regression', legId: 'flight', eventId: 'cache-event' },
      legId: 'hotel', category: 'hotel', priorOfferId: 'old', priorAmountMinor: 90,
    }
    const primeContext = createExecutionContext()
    expect(await cache.requote(input, discovery, primeContext)).toMatchObject({ offerId: 'hotel-call-1' })
    await waitOnExecutionContext(primeContext)

    now += 31_000
    const staleContexts = Array.from({ length: 12 }, () => createExecutionContext())
    const stale = await Promise.all(staleContexts.map((ctx) => cache.advisoryRequote(input, discovery, ctx)))
    expect(stale.every((result) => result.kind === 'offer' && result.offerId === 'hotel-call-1')).toBe(true)
    await Promise.all(staleContexts.map(waitOnExecutionContext))
    expect(calls).toBe(2)

    now += 31_000
    const advisoryContext = createExecutionContext()
    const commitContext = createExecutionContext()
    const [advisory, committed] = await Promise.all([
      cache.advisoryRequote(input, discovery, advisoryContext),
      cache.requote(input, discovery, commitContext),
    ])
    await Promise.all([waitOnExecutionContext(advisoryContext), waitOnExecutionContext(commitContext)])
    expect(advisory).toMatchObject({ offerId: 'hotel-call-2' })
    expect(committed).toMatchObject({ offerId: 'hotel-call-3' })
    expect(calls).toBe(3)
  })
})

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

function singleLegSeed(
  bundleId: string,
  principalId: string,
  legId: string,
  amountMinor: number,
): BundleSeed {
  return Object.freeze({
    bundleId, principalId, totalBudgetMinor: minorUnits(1_000),
    legs: Object.freeze([leg(legId, principalId, 'test', `${legId}-offer`, amountMinor)]),
    edges: Object.freeze([]),
  })
}

function leg(legId: string, principalId: string, category: string, offerId: string, amountMinor: number) {
  return Object.freeze({
    legId, principalId, category, committedOfferId: offerId,
    committedAmountMinor: minorUnits(amountMinor), lastCascadeId: null,
  })
}

function offer(legId: string, amountMinor: number, suffix: string): Quote {
  return Object.freeze({
    kind: 'offer', legId, offerId: `${legId}-${suffix}`, amountMinor: minorUnits(amountMinor), currency: 'SGD',
    priceVerification: 'deterministic-demo', agentId: 'regression',
    promptTokens: 0, completionTokens: 0, dollarCost: 0, provenance: Object.freeze({ source: 'regression' }),
  })
}

function preparedRecord(suffix: string): CascadeRecord {
  return Object.freeze({
    cascadeId: `bundle-${suffix}:flight:event`, eventId: 'event', bundleId: `bundle-${suffix}`,
    principalId: `principal-${suffix}`, changedLegId: 'flight', phase: 'settlement_pending',
    affected: Object.freeze(['hotel']), priorLegs: Object.freeze([]),
    changes: Object.freeze([{
      legId: 'hotel', priorOfferId: 'old', priorAmountMinor: minorUnits(100),
      newOfferId: 'new', newAmountMinor: minorUnits(125),
    }]),
    netAmountMinor: signedMinorUnits(25), outcome: null, startedAt: Date.now(), updatedAt: Date.now(),
    recoveryAttempts: 0, settlementAttempts: 0, nextRecoveryAt: Date.now() + 1_000,
  })
}

function fetcher(fetch: (request: Request) => Promise<Response>): Fetcher {
  return { fetch, connect() { throw new Error('not-supported') } }
}
