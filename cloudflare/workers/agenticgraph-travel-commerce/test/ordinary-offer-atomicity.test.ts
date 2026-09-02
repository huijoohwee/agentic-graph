import { createExecutionContext, reset, runInDurableObject } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import { HOLD_TTL_MS, minorUnits } from '../../../../src/bundle/bundle-runtime'
import type { Quote } from '../../../../src/bundle/bundle-types'
import { ReoptWorker } from '../../../../src/bundle/reopt-worker'
import { evaluateRegisteredTravelAgencyGuardrail } from '../../../../src/gate/guardrail-envelope-adapter'
import { TravelAgencyGuardrailService } from '../../../../src/gate/travel-agency-guardrail-service'
import { verifiedForLane } from '../../../../src/ledger/envelope-ledger-records'
import { migrateEnvelopeLedger } from '../../../../src/ledger/envelope-ledger-schema'
import type { EnvelopeLedger } from '../../../../src/ledger/envelope-ledger'

afterEach(() => reset())

describe('ordinary offers share one atomic principal envelope with Cascades', () => {
  it('prevents mixed-channel TOCTOU overspend and releases the accepted hold', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const principalId = 'principal-mixed-atomicity'
    const ledger = runtime.ENVELOPE_LEDGER.getByName(principalId)
    expect(await ledger.init(principalId, 1_000)).toMatchObject({ kind: 'initialized' })

    const [ordinary, cascade] = await Promise.all([
      ledger.checkAndReserveOffer({
        operationId: 'ordinary-mixed-1', agentId: 'agent-flight', offerId: 'ordinary-offer-1',
        amountMinor: 600, currency: 'SGD', priceVerification: 'deterministic-demo',
      }),
      ledger.checkAndReserveCascade('cascade-mixed-1', 'bundle-mixed-1', [quote('cascade-leg-1', 600)]),
    ])
    const accepted = [ordinary, cascade].filter((result) => result.kind !== 'rejected')
    const rejected = [ordinary, cascade].filter((result) => result.kind === 'rejected')
    expect(accepted).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]).toMatchObject({ reason: 'insufficient-envelope' })
    expect(await ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: 400 })
    const active = (await ledger.getHolds()).filter((hold) => hold.state !== 'released')
    expect(active.reduce((sum, hold) => sum + hold.amountMinor, 0)).toBe(600)

    if (ordinary.kind !== 'rejected') {
      expect(await ledger.releaseOffer('ordinary-mixed-1', 'agent-flight')).toMatchObject({ kind: 'released' })
    } else {
      expect(await ledger.releaseCascade('cascade-mixed-1')).toMatchObject({ kind: 'released' })
    }
    expect(await ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: 1_000 })
  })

  it('enforces same-operation idempotence and normal terminal transitions', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const principalId = 'principal-ordinary-idempotence'
    const ledger = runtime.ENVELOPE_LEDGER.getByName(principalId)
    await ledger.init(principalId, 1_000)
    const input = {
      operationId: 'ordinary-idempotent-1', agentId: 'agent-flight', offerId: 'ordinary-offer-1',
      amountMinor: 300, currency: 'SGD', priceVerification: 'deterministic-demo' as const,
    }
    expect(await ledger.checkAndReserveOffer(input)).toMatchObject({
      kind: 'reserved', availableAfterMinor: 700,
    })
    expect(await ledger.checkAndReserveOffer(input)).toMatchObject({
      kind: 'idempotent', availableAfterMinor: 700,
    })
    expect(await ledger.checkAndReserveOffer({ ...input, amountMinor: 301 })).toMatchObject({
      kind: 'rejected', reason: 'idempotency-conflict',
    })
    expect(await ledger.checkAndReserveOffer({ ...input, offerId: 'ordinary-offer-conflict' })).toMatchObject({
      kind: 'rejected', reason: 'idempotency-conflict',
    })
    expect(await ledger.commitOffer(input.operationId, input.agentId)).toMatchObject({ kind: 'committed' })
    expect(await ledger.commitOffer(input.operationId, input.agentId)).toMatchObject({ kind: 'idempotent' })
    expect(await ledger.releaseOffer(input.operationId, input.agentId)).toMatchObject({
      kind: 'rejected', reason: 'illegal-transition',
    })
    expect(await ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: 700 })

    const released = { ...input, operationId: 'ordinary-idempotent-2', offerId: 'ordinary-offer-2' }
    expect(await ledger.checkAndReserveOffer(released)).toMatchObject({ kind: 'reserved' })
    expect(await ledger.releaseOffer(released.operationId, released.agentId)).toMatchObject({ kind: 'released' })
    expect(await ledger.releaseOffer(released.operationId, released.agentId)).toMatchObject({ kind: 'idempotent' })
    expect(await ledger.checkAndReserveOffer(released)).toMatchObject({
      kind: 'rejected', reason: 'offer-reservation-released',
    })
    expect(await ledger.getHolds()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ cascadeId: `~ordinary:${released.operationId}` }),
    ]))
    expect(await ledger.getRetentionContract()).toMatchObject({
      schema: 'agenticgraph-envelope-hold-retention/v1',
      mode: 'compact-released-receipts',
      compactsTerminalPayloads: true,
      exactReplayRetention: 'indefinite',
      coldStartValidation: 'full-once-per-schema-version',
    })
    await runInDurableObject(ledger, async (_instance, state) => {
      expect(state.storage.sql.exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM holds WHERE state = 'released'",
      ).one().count).toBe(0)
      expect(state.storage.sql.exec<{ count: number }>(
        'SELECT COUNT(*) AS count FROM ordinary_terminal_receipts WHERE operation_id = ?',
        released.operationId,
      ).one().count).toBe(1)
      expect(state.storage.sql.exec<{ count: number }>(
        'SELECT COUNT(*) AS count FROM _sql_schema_migrations WHERE id = 7',
      ).one().count).toBe(1)
    })
  })

  it('keeps a durable Guardrail reservation successful across getAlarm and setAlarm faults, then heals', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    for (const alarmMethod of ['getAlarm', 'setAlarm'] as const) {
      const principalId = `principal-alarm-${alarmMethod}`
      const operationId = `ordinary-alarm-${alarmMethod}`
      const offerId = `offer-alarm-${alarmMethod}`
      const ledger = runtime.ENVELOPE_LEDGER.getByName(principalId)
      await ledger.init(principalId, 1_000)
      await failNextAlarmCall(ledger, alarmMethod)

      const service = new TravelAgencyGuardrailService(createExecutionContext(), runtime)
      const input = guardrailInput(principalId, operationId, offerId, 400)
      expect(await service.evaluateOffer(input)).toMatchObject({ ok: true, offer: { offerId } })

      const active = (await ledger.getHolds()).find((hold) => hold.cascadeId === `~ordinary:${operationId}`)
      expect(active).toMatchObject({ state: 'reserved', amountMinor: 400 })
      expect(await ledger.checkAndReserveOffer({
        operationId, agentId: 'agent-flight', offerId, amountMinor: 400,
        currency: 'SGD', priceVerification: 'deterministic-demo',
      })).toMatchObject({ kind: 'idempotent', availableAfterMinor: 600 })
      expect(await readAlarm(ledger)).toBe(active?.expiresAt)

      await runInDurableObject(ledger, async (_instance, state) => state.storage.deleteAlarm())
      expect(await readAlarm(ledger)).toBeNull()
      expect(await ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: 600 })
      expect(await readAlarm(ledger)).toBe(active?.expiresAt)
      expect(await ledger.checkAndReserveOffer({
        operationId: `overspend-${alarmMethod}`, agentId: 'agent-hotel',
        offerId: `overspend-offer-${alarmMethod}`, amountMinor: 700,
        currency: 'SGD', priceVerification: 'deterministic-demo',
      })).toMatchObject({ kind: 'rejected', reason: 'insufficient-envelope' })
      expect((await ledger.getHolds()).filter((hold) => hold.state === 'reserved'))
        .toHaveLength(1)
    }
  })

  it('releases an expired hold on the available path even when its alarm was never scheduled', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const principalId = 'principal-expiry-alarm-unavailable'
    const ledger = runtime.ENVELOPE_LEDGER.getByName(principalId)
    await ledger.init(principalId, 1_000)
    await failNextAlarmCall(ledger, 'setAlarm')
    const operationId = 'ordinary-expiry-alarm-unavailable'
    expect(await ledger.checkAndReserveOffer({
      operationId, agentId: 'agent-flight', offerId: 'offer-expiry-alarm-unavailable',
      amountMinor: 450, currency: 'SGD', priceVerification: 'deterministic-demo',
    }, Date.now() - HOLD_TTL_MS - 1)).toMatchObject({
      kind: 'reserved', availableAfterMinor: 550,
    })
    expect(await readAlarm(ledger)).toBeNull()
    expect(await ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: 1_000 })
    expect((await ledger.getHolds()).filter((hold) => hold.state === 'reserved')).toHaveLength(0)
    expect(await ledger.checkAndReserveOffer({
      operationId, agentId: 'agent-flight', offerId: 'offer-expiry-alarm-unavailable',
      amountMinor: 450, currency: 'SGD', priceVerification: 'deterministic-demo',
    })).toMatchObject({ kind: 'rejected', reason: 'offer-reservation-released' })
  })

  it('returns durable commit and release results across post-transition alarm faults and heals on retry', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    for (const target of ['committed', 'released'] as const) {
      const principalId = `principal-transition-alarm-${target}`
      const ledger = runtime.ENVELOPE_LEDGER.getByName(principalId)
      await ledger.init(principalId, 1_000)
      const now = Date.now()
      const primaryOperation = `ordinary-transition-primary-${target}`
      const remainingOperation = `ordinary-transition-remaining-${target}`
      await ledger.checkAndReserveOffer({
        operationId: primaryOperation, agentId: 'agent-flight', offerId: `offer-primary-${target}`,
        amountMinor: 300, currency: 'SGD', priceVerification: 'deterministic-demo',
      }, now)
      const remaining = await ledger.checkAndReserveOffer({
        operationId: remainingOperation, agentId: 'agent-hotel', offerId: `offer-remaining-${target}`,
        amountMinor: 200, currency: 'SGD', priceVerification: 'deterministic-demo',
      }, now + 1_000)
      expect(remaining).toMatchObject({ kind: 'reserved' })
      await failNextAlarmCall(ledger, 'setAlarm')

      const service = new TravelAgencyGuardrailService(createExecutionContext(), runtime)
      const transition = target === 'committed'
        ? () => service.commitOffer({ principalId, operationId: primaryOperation, agentId: 'agent-flight' })
        : () => service.releaseOffer({ principalId, operationId: primaryOperation, agentId: 'agent-flight' })
      expect(await transition()).toMatchObject({ kind: target })
      const primaryHold = (await ledger.getHolds())
        .find((hold) => hold.cascadeId === `~ordinary:${primaryOperation}`)
      if (target === 'committed') expect(primaryHold).toMatchObject({ state: target })
      else expect(primaryHold).toBeUndefined()
      expect(await transition()).toMatchObject({ kind: 'idempotent', hold: { state: target } })
      expect(await readAlarm(ledger)).toBe(remaining.kind === 'reserved' ? remaining.hold.expiresAt : null)
      expect((await ledger.getHolds()).find((hold) => hold.cascadeId === `~ordinary:${remainingOperation}`))
        .toMatchObject({ state: 'reserved', amountMinor: 200 })
      expect(await ledger.getAvailableBalance()).toMatchObject({
        availableBalanceMinor: target === 'committed' ? 500 : 800,
      })
    }
  })

  it('keeps a possible-effect Cascade unavailable when its protection alarm fires before recovery', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const principalId = 'principal-expired-custody-recovery'
    const cascadeId = 'cascade-expired-custody-recovery'
    const ledger = runtime.ENVELOPE_LEDGER.getByName(principalId)
    await ledger.init(principalId, 1_000)
    expect(await ledger.checkAndReserveCascade(
      cascadeId, 'bundle-expired-custody-recovery', [quote('custody-leg', 400)],
    )).toMatchObject({ kind: 'reserved' })
    expect(await ledger.protectCascade(cascadeId)).toMatchObject({ kind: 'protected' })

    await runInDurableObject(ledger, (_instance, state) => state.storage.sql.exec(
      `UPDATE holds SET expires_at = ? WHERE cascade_id = ? AND reservation_kind = 'cascade'`,
      Date.now() - 1, cascadeId,
    ))
    await runInDurableObject(ledger, (instance) => instance.alarm!())
    expect((await ledger.getHolds()).find((hold) => hold.cascadeId === cascadeId))
      .toMatchObject({ state: 'reserved', amountMinor: 400 })
    expect(await ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: 600 })
    expect(await ledger.protectCascade(cascadeId)).toMatchObject({
      kind: 'rejected', reason: 'hold-expired',
    })
    expect(await ledger.quarantineCascade(
      cascadeId, 'settlement-outcome-requires-reconciliation',
    )).toMatchObject({ kind: 'quarantined', count: 1 })
    expect((await ledger.getHolds()).find((hold) => hold.cascadeId === cascadeId))
      .toMatchObject({ state: 'quarantined', amountMinor: 400 })
    const custody = await runInDurableObject(ledger, (_instance, state) => state.storage.sql.exec<{
      custody_pending: number; quarantined: number
    }>(
      'SELECT custody_pending, quarantined FROM holds WHERE cascade_id = ?', cascadeId,
    ).one())
    expect(custody).toEqual({ custody_pending: 0, quarantined: 1 })
  })

  it('does not let Cascade lifecycle operations transition an ordinary hold', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const principalId = 'principal-channel-lifecycle-fence'
    const ledger = runtime.ENVELOPE_LEDGER.getByName(principalId)
    await ledger.init(principalId, 1_000)
    const operationId = 'ordinary-channel-fence-1'
    expect(await ledger.checkAndReserveOffer({
      operationId, agentId: 'agent-flight', offerId: 'ordinary-channel-offer',
      amountMinor: 300, currency: 'SGD', priceVerification: 'deterministic-demo',
    })).toMatchObject({ kind: 'reserved', availableAfterMinor: 700 })
    const syntheticCascadeId = `~ordinary:${operationId}`
    expect(await ledger.commitCascade(syntheticCascadeId)).toMatchObject({
      kind: 'rejected', reason: 'unknown-cascade-holds',
    })
    expect(await ledger.releaseCascade(syntheticCascadeId)).toMatchObject({ kind: 'idempotent', count: 0 })
    expect(await ledger.quarantineCascade(syntheticCascadeId, 'must remain ordinary')).toMatchObject({
      kind: 'rejected', reason: 'unknown-cascade-holds',
    })
    expect(await ledger.checkAndReserveCascade(
      syntheticCascadeId, 'bundle-collision-attempt', [quote('collision-leg', 1)],
    )).toMatchObject({ kind: 'rejected', reason: 'requote-malformed' })
    expect(await ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: 700 })
    expect(await ledger.commitOffer(operationId, 'agent-flight')).toMatchObject({ kind: 'committed' })
  })

  it('expires ordinary reservations and restores balance without a stale window', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const principalId = 'principal-ordinary-expiry'
    const ledger = runtime.ENVELOPE_LEDGER.getByName(principalId)
    await ledger.init(principalId, 1_000)
    const expiryReservation = await ledger.checkAndReserveOffer({
      operationId: 'ordinary-expiry-1', agentId: 'agent-flight', offerId: 'ordinary-expiring-offer',
      amountMinor: 450, currency: 'SGD', priceVerification: 'deterministic-demo',
    }, Date.now() - HOLD_TTL_MS - 1)
    expect(expiryReservation).toMatchObject({ kind: 'reserved', availableAfterMinor: 550 })
    await runInDurableObject(ledger, (instance) => instance.alarm!())
    expect(await ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: 1_000 })
    expect((await ledger.getHolds()).filter((hold) => hold.state === 'reserved')).toHaveLength(0)
  })

  it('persists ordinary identity columns, non-negative money checks, and the idempotency index', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const ledger = runtime.ENVELOPE_LEDGER.getByName('principal-ordinary-schema')
    await ledger.init('principal-ordinary-schema', 1_000)
    const evidence = await runInDurableObject(ledger, (_instance, state) => {
      const columns = state.storage.sql.exec<{ name: string }>('PRAGMA table_info(holds)')
        .toArray().map((row) => row.name)
      const indexes = state.storage.sql.exec<{ name: string }>('PRAGMA index_list(holds)')
        .toArray().map((row) => row.name)
      const sql = state.storage.sql.exec<{ sql: string }>(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'holds'",
      ).one().sql
      return { columns, indexes, sql }
    })
    expect(evidence.columns).toEqual(expect.arrayContaining([
      'reservation_kind', 'operation_id', 'agent_id', 'price_verification',
    ]))
    expect(evidence.indexes).toContain('idx_holds_ordinary_operation')
    expect(evidence.sql).toMatch(/amount_minor INTEGER NOT NULL CHECK \(amount_minor >= 0\)/)
    expect(evidence.sql).toMatch(/target_amount_minor INTEGER NOT NULL CHECK \(target_amount_minor >= 0\)/)
  })

  it('fails legacy migration closed before unsafe money or malformed ordinary identity reaches arithmetic', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const ledger = runtime.ENVELOPE_LEDGER.getByName('principal-legacy-migration-fence')
    await ledger.init('principal-legacy-migration-fence', 1_000)
    const failures = await runInDurableObject(ledger, (_instance, state) => {
      state.storage.sql.exec(`
        DROP TABLE holds;
        DROP TABLE envelope;
        DROP TABLE envelope_ledger_state;
        DROP TABLE _sql_schema_migrations;
        CREATE TABLE envelope (principal_id TEXT PRIMARY KEY, total_budget_minor, currency TEXT);
        CREATE TABLE holds (
          hold_id TEXT PRIMARY KEY, cascade_id TEXT NOT NULL, leg_id TEXT NOT NULL,
          offer_id TEXT NOT NULL, amount_minor, state TEXT NOT NULL, expires_at INTEGER NOT NULL,
          UNIQUE (cascade_id, leg_id)
        );
        INSERT INTO envelope VALUES ('principal-legacy-migration-fence', 9007199254740992, 'SGD');
        INSERT INTO holds VALUES ('legacy-negative', 'legacy-cascade-1', 'leg-1', 'offer-1', -1,
          'reserved', 1);
        INSERT INTO holds VALUES ('legacy-real', 'legacy-cascade-2', 'leg-2', 'offer-2', 1.5,
          'reserved', 1);
      `)
      let money = ''
      try { migrateEnvelopeLedger(state, 'SGD') } catch (error) {
        money = error instanceof Error ? error.message : String(error)
      }
      state.storage.sql.exec(`
        DELETE FROM holds;
        UPDATE envelope SET total_budget_minor = 1000;
        INSERT INTO holds (
          hold_id, cascade_id, bundle_id, leg_id, offer_id, amount_minor, target_amount_minor,
          state, expires_at, reservation_kind, operation_id, agent_id, price_verification
        ) VALUES (
          '~ordinary:legacy-op', '~ordinary:legacy-op', '~ordinary:legacy-agent', 'legacy-op',
          'legacy-offer', 1, 1, 'reserved', 1, 'ordinary', 'legacy-op', 7, 'verified'
        );
      `)
      let identity = ''
      try { migrateEnvelopeLedger(state, 'SGD') } catch (error) {
        identity = error instanceof Error ? error.message : String(error)
      }
      return { money, identity }
    })
    expect(failures).toEqual({
      money: 'legacy-stored-money-malformed',
      identity: 'legacy-stored-identity-malformed',
    })
  })

  it('fails closed on ledger errors and fences currency, amounts, and production verification', async () => {
    let ledgerCalls = 0
    const decision = await evaluateRegisteredTravelAgencyGuardrail({
      env: {
        TRAVEL_GUARDRAIL_RETRY_BOUND: '0',
        TRAVEL_INTENT_MIN_BUDGET_MINOR: '1',
        TRAVEL_INTENT_MAX_BUDGET_MINOR: '9007199254740991',
        ENVELOPE_LEDGER: {
          getByName() {
            ledgerCalls += 1
            throw new Error('ledger-down')
          },
        },
      } as unknown as TravelCommerceEnv & Record<string, unknown>,
      intent: {
        kind: 'flight', origin: 'SIN', destination: 'NRT',
        dateRangeStart: '2026-09-01', dateRangeEnd: '2026-09-10',
        budgetCeiling: { amountMinor: 1_000, currency: 'SGD' },
      },
      offer: { offerId: 'ordinary-fail-closed', amountMinor: 500, currency: 'SGD', date: '2026-09-01' },
      probe: { evolve: async () => null },
    }, {
      principalId: 'principal-fail-closed', operationId: 'ordinary-fail-closed',
      agentId: 'agent-flight', priceVerification: 'verified',
    })
    expect(ledgerCalls).toBe(1)
    expect(decision).toMatchObject({
      ok: false, code: 'configuration-missing',
      error: { fields: ['Envelope_Ledger:envelope-unavailable'] },
    })
    expect(verifiedForLane('deterministic-demo', 'Production_Lane')).toBe(false)
    expect(verifiedForLane('verified', 'Production_Lane')).toBe(true)

    const runtime = env as unknown as TravelCommerceEnv
    const ledger = runtime.ENVELOPE_LEDGER.getByName('principal-fenced-offer')
    await ledger.init('principal-fenced-offer', 1_000)
    expect(await ledger.checkAndReserveOffer({
      operationId: 'ordinary-currency', agentId: 'agent-flight', offerId: 'ordinary-currency-offer',
      amountMinor: 1, currency: 'USD', priceVerification: 'verified',
    })).toMatchObject({ kind: 'rejected', reason: 'quote-currency-mismatch' })
    expect(await ledger.checkAndReserveOffer({
      operationId: 'ordinary-negative', agentId: 'agent-flight', offerId: 'ordinary-negative-offer',
      amountMinor: -1 as never, currency: 'SGD', priceVerification: 'verified',
    })).toMatchObject({ kind: 'rejected', reason: 'envelope-malformed' })
  })

  it('runs the inherited Gate and ordinary lifecycle through the named Worker entrypoint', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const principalId = 'principal-named-guardrail-service'
    const ledger = runtime.ENVELOPE_LEDGER.getByName(principalId)
    await ledger.init(principalId, 1_000)
    const service = new TravelAgencyGuardrailService(createExecutionContext(), runtime)
    const input = {
      context: {
        principalId, operationId: 'named-guardrail-operation-1', agentId: 'agent-flight',
        priceVerification: 'deterministic-demo' as const,
      },
      intent: {
        kind: 'flight' as const, origin: 'SIN', destination: 'NRT',
        dateRangeStart: '2026-09-01', dateRangeEnd: '2026-09-10',
        budgetCeiling: { amountMinor: 1_000, currency: 'SGD' },
      },
      offer: {
        offerId: 'named-guardrail-offer-1', amountMinor: 250, currency: 'SGD', date: '2026-09-01',
      },
    }
    expect(await service.evaluateOffer(input)).toMatchObject({
      ok: true, offer: { offerId: 'named-guardrail-offer-1', amountMinor: 250 },
    })
    expect(await service.evaluateOffer(input)).toMatchObject({ ok: true })
    expect(await service.evaluateOffer({
      ...input, offer: { ...input.offer, amountMinor: 251 },
    })).toMatchObject({
      ok: false, code: 'configuration-missing',
      error: { fields: ['Envelope_Ledger:idempotency-conflict'] },
    })
    expect(await ledger.getAvailableBalance()).toMatchObject({ availableBalanceMinor: 750 })
    expect(await service.commitOffer({
      principalId, operationId: input.context.operationId, agentId: input.context.agentId,
    })).toMatchObject({ kind: 'committed' })
    expect(await service.releaseOffer({
      principalId, operationId: input.context.operationId, agentId: input.context.agentId,
    })).toMatchObject({ kind: 'rejected', reason: 'illegal-transition' })
    expect(await service.evaluateOffer(null as never)).toMatchObject({
      ok: false, code: 'configuration-missing', error: { fields: ['Guardrail_Request'] },
    })
    expect('transition' in service).toBe(false)
  })

  it('allows no Cascade offer downstream when its mandatory atomic reservation is rejected', async () => {
    const runtime = env as unknown as TravelCommerceEnv
    const principalId = 'principal-cascade-no-bypass'
    const bundleId = 'bundle-cascade-no-bypass'
    await runtime.BUNDLE_GRAPH.getByName(bundleId).initBundle({
      bundleId,
      principalId,
      totalBudgetMinor: minorUnits(500),
      legs: [
        { legId: 'flight', principalId, category: 'flight', committedOfferId: null,
          committedAmountMinor: null, lastCascadeId: null },
        { legId: 'hotel', principalId, category: 'hotel', committedOfferId: null,
          committedAmountMinor: null, lastCascadeId: null },
      ],
      edges: [{ fromLegId: 'flight', toLegId: 'hotel' }],
    })
    let settlements = 0
    const outcome = await new ReoptWorker(runtime, createExecutionContext(), {
      dispatch: async () => ({
        kind: 'quoted' as const,
        quotes: [quote('hotel', 600)],
        quoteCount: 1,
        rejectCount: 0 as const,
      }),
      settle: async (record) => {
        settlements += 1
        return { kind: 'settled' as const, settlementId: 'must-not-settle', idempotencyKey: record.cascadeId }
      },
    }).handleMutation({ bundleId, legId: 'flight', eventId: 'no-bypass' })
    expect(outcome).toMatchObject({ kind: 'rolled-back', reason: 'insufficient-envelope' })
    expect(settlements).toBe(0)
  })
})

function quote(legId: string, amountMinor: number): Quote {
  return Object.freeze({
    kind: 'offer', legId, offerId: `offer-${legId}`, amountMinor: minorUnits(amountMinor), currency: 'SGD',
    priceVerification: 'deterministic-demo', agentId: 'agent-experience',
    promptTokens: 0, completionTokens: 0, dollarCost: 0,
    provenance: Object.freeze({ source: 'mixed-channel-test' }),
  })
}

type FaultableAlarmStorage = {
  getAlarm(): Promise<number | null>
  setAlarm(scheduledTime: number): Promise<void>
}

async function failNextAlarmCall(
  ledger: DurableObjectStub<EnvelopeLedger>,
  method: 'getAlarm' | 'setAlarm',
): Promise<void> {
  await runInDurableObject(ledger, (instance) => {
    const alarmStorage = (instance as unknown as { alarmStorage: FaultableAlarmStorage }).alarmStorage
    let pending = true
    if (method === 'getAlarm') {
      const delegate = alarmStorage.getAlarm
      alarmStorage.getAlarm = async () => {
        if (pending) {
          pending = false
          throw new Error('fault-injected-getAlarm')
        }
        return delegate()
      }
      return
    }
    const delegate = alarmStorage.setAlarm
    alarmStorage.setAlarm = async (scheduledTime) => {
      if (pending) {
        pending = false
        throw new Error('fault-injected-setAlarm')
      }
      return delegate(scheduledTime)
    }
  })
}

const readAlarm = (ledger: DurableObjectStub<EnvelopeLedger>): Promise<number | null> =>
  runInDurableObject(ledger, (_instance, state) => state.storage.getAlarm())

function guardrailInput(principalId: string, operationId: string, offerId: string, amountMinor: number) {
  return Object.freeze({
    context: Object.freeze({
      principalId, operationId, agentId: 'agent-flight', priceVerification: 'deterministic-demo' as const,
    }),
    intent: Object.freeze({
      kind: 'flight' as const, origin: 'SIN', destination: 'NRT',
      dateRangeStart: '2026-09-01', dateRangeEnd: '2026-09-10',
      budgetCeiling: Object.freeze({ amountMinor: 1_000, currency: 'SGD' }),
    }),
    offer: Object.freeze({ offerId, amountMinor, currency: 'SGD', date: '2026-09-01' }),
  })
}
