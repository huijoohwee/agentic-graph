import { DurableObject } from 'cloudflare:workers'
import {
  HOLD_TTL_MS,
  SETTLEMENT_HOLD_PROTECTION_MS,
  isCascadeIdentifier,
  isCurrency,
  isIdentifier,
  isMinorUnits,
  minorUnits,
} from '../bundle/bundle-runtime'
import type {
  CommittedPosition,
  Quote,
  ReconciliationDecisionInput,
  Rejection,
  Reservation,
} from '../bundle/bundle-types'
import {
  bindEnvelopeAlarmStorage,
  releaseExpiredReservations,
  repairEnvelopeAlarm,
  scheduleNextEnvelopeAlarm,
  type EnvelopeAlarmStorage,
} from './envelope-ledger-alarms'
import { migrateEnvelopeLedger } from './envelope-ledger-schema'
import {
  ENVELOPE_HOLD_RETENTION,
  activeHoldTotal,
  assertLedgerConservation,
  availableFromLedger,
  ledgerRevision,
} from './envelope-ledger-state'
import {
  allocateDelta,
  cascadeCustodyPending,
  compactReleasedHolds,
  elapsed,
  hasOverlappingCascadePosition,
  insertReservation,
  insertSeedHold,
  mapHold,
  markCascadeCustodyPending,
  readAllHolds,
  readCascadeHolds,
  readCascadeTerminalCount,
  sameReservations,
  validCommitments,
  validQuotes,
  verifiedForLane,
  type EnvelopeRow,
  type HoldRow,
} from './envelope-ledger-records'
import {
  quarantineCascadeHolds,
  resolveCascadeCustody,
  type CustodyResolutionResult,
  type QuarantineResult,
  validAuditReason,
  validDecision,
} from './reconciliation-custody'
import {
  reserveOrdinaryOffer,
  transitionOrdinaryOffer,
  type OrdinaryOfferReservationInput,
  type OrdinaryOfferReserveResult,
  type OrdinaryOfferTransitionResult,
} from './ordinary-offer-holds'

export type {
  OrdinaryOfferHold,
  OrdinaryOfferReservationInput,
  OrdinaryOfferReserveResult,
  OrdinaryOfferTransitionResult,
} from './ordinary-offer-holds'
export type ReserveResult =
  | Readonly<{
    kind: 'reserved' | 'idempotent'
    holds: readonly Reservation[]
    availableAfterMinor: number
    reservedDeltaMinor: number
    operationElapsedMs: number
  }>
  | Rejection
export class EnvelopeLedger extends DurableObject<TravelCommerceEnv> {
  private readonly alarmStorage: EnvelopeAlarmStorage

  constructor(ctx: DurableObjectState, env: TravelCommerceEnv) {
    super(ctx, env)
    this.alarmStorage = bindEnvelopeAlarmStorage(ctx)
    ctx.blockConcurrencyWhile(async () => this.migrate())
  }

  async init(
    principalId: string,
    totalBudgetMinor: number,
    commitments: readonly CommittedPosition[] = [],
  ): Promise<{ kind: 'initialized' | 'idempotent'; seededCommitments: number } | Rejection> {
    if (!isCurrency(this.env.SETTLEMENT_CURRENCY)) {
      return { kind: 'rejected', reason: 'envelope-currency-conflict' }
    }
    if (!isIdentifier(principalId) || !isMinorUnits(totalBudgetMinor) || !validCommitments(commitments)) {
      return { kind: 'rejected', reason: 'envelope-malformed' }
    }
    const current = this.envelope()
    if (current && (current.principal_id !== principalId || current.total_budget_minor !== totalBudgetMinor)) {
      return { kind: 'rejected', reason: 'envelope-initialization-conflict' }
    }
    if (current && current.currency !== this.env.SETTLEMENT_CURRENCY) {
      return { kind: 'rejected', reason: 'envelope-currency-conflict' }
    }
    const seed = this.checkCommitmentSeed(totalBudgetMinor, commitments)
    if (seed.kind === 'rejected') return seed
    this.ctx.storage.transactionSync(() => {
      if (!current) {
        this.ctx.storage.sql.exec(
          'INSERT INTO envelope (principal_id, total_budget_minor, currency) VALUES (?, ?, ?)',
          principalId, totalBudgetMinor, this.env.SETTLEMENT_CURRENCY,
        )
      }
      for (const position of seed.missing) insertSeedHold(this.ctx, position)
    })
    await this.invalidateBalance(principalId)
    return {
      kind: current ? 'idempotent' : 'initialized',
      seededCommitments: seed.missing.length,
    }
  }

  async checkAndReserveCascade(cascadeId: string, quotes: readonly Quote[], now?: number): Promise<ReserveResult>
  async checkAndReserveCascade(
    cascadeId: string,
    bundleId: string,
    quotes: readonly Quote[],
    now?: number,
  ): Promise<ReserveResult>
  async checkAndReserveCascade(
    cascadeId: string,
    bundleOrQuotes: string | readonly Quote[],
    quotesOrNow: readonly Quote[] | number = [],
    requestedAt = Date.now(),
  ): Promise<ReserveResult> {
    const operationStartedAt = performance.now()
    const bundleId = typeof bundleOrQuotes === 'string' ? bundleOrQuotes : 'unscoped'
    const quotes = typeof bundleOrQuotes === 'string' ? quotesOrNow as readonly Quote[] : bundleOrQuotes
    const now = typeof bundleOrQuotes === 'string'
      ? requestedAt
      : typeof quotesOrNow === 'number' ? quotesOrNow : Date.now()
    const envelope = this.envelope()
    if (!envelope) return { kind: 'rejected', reason: 'envelope-unavailable' }
    if (!isCascadeIdentifier(cascadeId) || cascadeId.startsWith('~ordinary:')
      || !isIdentifier(bundleId) || !validQuotes(quotes)) {
      return { kind: 'rejected', reason: 'requote-malformed' }
    }
    if (envelope.currency !== this.env.SETTLEMENT_CURRENCY) {
      return { kind: 'rejected', reason: 'envelope-currency-conflict' }
    }
    if (quotes.some((quote) => quote.currency !== envelope.currency)) {
      return { kind: 'rejected', reason: 'quote-currency-mismatch' }
    }
    if (quotes.some((quote) => !verifiedForLane(quote.priceVerification, this.env.DEPLOY_LANE))) {
      return { kind: 'rejected', reason: 'quote-unverified' }
    }
    const expiredCount = releaseExpiredReservations(this.ctx, now)
    let balanceChanged = expiredCount > 0
    let preferredExpiry: number | undefined
    try {
      const existing = readCascadeHolds(this.ctx, cascadeId)
      if (existing.length > 0) {
        if (existing.some((hold) => hold.state === 'quarantined')) {
          return { kind: 'rejected', reason: 'cascade-reconciliation-required' }
        }
        if (existing.every((hold) => hold.state === 'released')) {
          return { kind: 'rejected', reason: 'cascade-reservation-released' }
        }
        if (!existing.every((hold) => hold.state === 'reserved' || hold.state === 'committed')) {
          return { kind: 'rejected', reason: 'illegal-transition' }
        }
        if (!sameReservations(existing, bundleId, quotes)) {
          return { kind: 'rejected', reason: 'idempotency-conflict' }
        }
        return {
          kind: 'idempotent', holds: Object.freeze(existing),
          availableAfterMinor: this.available(envelope.total_budget_minor),
          reservedDeltaMinor: this.reservationDelta(existing),
          operationElapsedMs: elapsed(operationStartedAt),
        }
      }
      if (readCascadeTerminalCount(this.ctx, cascadeId) !== null) {
        return { kind: 'rejected', reason: 'cascade-reservation-released' }
      }
      if (hasOverlappingCascadePosition(this.ctx, bundleId, quotes)) {
        return { kind: 'rejected', reason: 'leg-reservation-conflict' }
      }
      const priors = quotes.map((quote) => this.readCommittedPosition(bundleId, quote.legId))
      const priorTotal = priors.reduce((sum, hold) => sum + (hold?.amountMinor ?? 0), 0)
      const targetTotal = quotes.reduce((sum, quote) => sum + quote.amountMinor, 0)
      const reservedDeltaMinor = Math.max(0, targetTotal - priorTotal)
      const available = this.available(envelope.total_budget_minor)
      if (reservedDeltaMinor > available) {
        return {
          kind: 'rejected', reason: 'insufficient-envelope',
          details: { availableAtCheck: available, requested: reservedDeltaMinor },
        }
      }
      const allocations = allocateDelta(quotes, priors, reservedDeltaMinor)
      const expiresAt = now + HOLD_TTL_MS
      const reservations = quotes.map((quote, index): Reservation => Object.freeze({
        holdId: `${cascadeId}:${quote.legId}`, cascadeId, bundleId, legId: quote.legId,
        offerId: quote.offerId, amountMinor: minorUnits(allocations[index]),
        targetAmountMinor: quote.amountMinor, priorHoldId: priors[index]?.holdId ?? null,
        state: 'reserved', expiresAt,
      }))
      this.ctx.storage.transactionSync(() => {
        for (const hold of reservations) insertReservation(this.ctx, hold)
      })
      this.assertConservation(envelope.total_budget_minor)
      balanceChanged = true
      preferredExpiry = expiresAt
      return {
        kind: 'reserved', holds: Object.freeze(reservations),
        availableAfterMinor: available - reservedDeltaMinor,
        reservedDeltaMinor, operationElapsedMs: elapsed(operationStartedAt),
      }
    } finally {
      if (balanceChanged) await this.invalidateBalance(envelope.principal_id)
      await repairEnvelopeAlarm(this.ctx, this.alarmStorage, preferredExpiry)
    }
  }

  async checkAndReserveOffer(
    input: OrdinaryOfferReservationInput,
    now = Date.now(),
  ): Promise<OrdinaryOfferReserveResult> {
    const operationStartedAt = performance.now()
    const envelope = this.envelope()
    if (!envelope) return { kind: 'rejected', reason: 'envelope-unavailable' }
    if (envelope.currency !== this.env.SETTLEMENT_CURRENCY) {
      return { kind: 'rejected', reason: 'envelope-currency-conflict' }
    }
    const expiredCount = releaseExpiredReservations(this.ctx, now)
    const result = reserveOrdinaryOffer(
      this.ctx,
      input,
      envelope.currency,
      this.env.DEPLOY_LANE,
      this.available(envelope.total_budget_minor),
      now,
      operationStartedAt,
    )
    if (result.kind === 'reserved') this.assertConservation(envelope.total_budget_minor)
    if (expiredCount > 0 || result.kind === 'reserved') await this.invalidateBalance(envelope.principal_id)
    await repairEnvelopeAlarm(
      this.ctx,
      this.alarmStorage,
      result.kind === 'reserved' ? result.hold.expiresAt : undefined,
    )
    return result
  }

  async commitOffer(operationId: string, agentId: string): Promise<OrdinaryOfferTransitionResult> {
    return this.transitionOffer(operationId, agentId, 'committed')
  }

  async releaseOffer(operationId: string, agentId: string): Promise<OrdinaryOfferTransitionResult> {
    return this.transitionOffer(operationId, agentId, 'released')
  }

  async protectCascade(
    cascadeId: string,
    now = Date.now(),
  ): Promise<Readonly<{ kind: 'protected' | 'idempotent'; expiresAt: number }> | Rejection> {
    const envelope = this.envelope()
    if (!envelope) return { kind: 'rejected', reason: 'envelope-unavailable' }
    const expiredCount = releaseExpiredReservations(this.ctx, now, cascadeId)
    const holds = readCascadeHolds(this.ctx, cascadeId)
    let balanceChanged = expiredCount > 0
    let result: Readonly<{ kind: 'protected' | 'idempotent'; expiresAt: number }> | Rejection
    if (holds.length === 0) result = { kind: 'rejected', reason: 'unknown-cascade-holds' }
    else if (holds.every((hold) => hold.state === 'quarantined')) {
      result = { kind: 'idempotent', expiresAt: Number.MAX_SAFE_INTEGER }
    } else if (holds.some((hold) => hold.state !== 'reserved')) {
      result = holds.every((hold) => hold.state === 'committed')
        ? { kind: 'idempotent', expiresAt: Math.max(...holds.map((hold) => hold.expiresAt)) }
        : { kind: 'rejected', reason: 'illegal-transition' }
    } else {
      const currentExpiry = Math.min(...holds.map((hold) => hold.expiresAt))
      const custodyPending = cascadeCustodyPending(this.ctx, cascadeId)
      if (currentExpiry <= now) {
        if (!custodyPending) {
          markCascadeCustodyPending(this.ctx, cascadeId)
          balanceChanged = true
        }
        result = { kind: 'rejected', reason: 'hold-expired' }
      } else {
        const expiresAt = now + SETTLEMENT_HOLD_PROTECTION_MS
        if (custodyPending && currentExpiry >= expiresAt) {
          result = { kind: 'idempotent', expiresAt: currentExpiry }
        }
        else {
          const protectedUntil = Math.max(currentExpiry, expiresAt)
          this.ctx.storage.sql.exec(
            `UPDATE holds SET expires_at = ?, custody_pending = 1
             WHERE cascade_id = ? AND reservation_kind = 'cascade' AND state = 'reserved'`,
            protectedUntil, cascadeId,
          )
          balanceChanged = true
          result = { kind: 'protected', expiresAt: protectedUntil }
        }
      }
    }
    if (balanceChanged) await this.invalidateBalance(envelope.principal_id)
    await repairEnvelopeAlarm(this.ctx, this.alarmStorage)
    return result
  }

  async quarantineCascade(cascadeId: string, reason: string, now = Date.now()): Promise<QuarantineResult> {
    if (!isCascadeIdentifier(cascadeId) || !validAuditReason(reason)) {
      return { kind: 'rejected', reason: 'reconciliation-request-malformed' }
    }
    const envelope = this.envelope()
    if (!envelope) return { kind: 'rejected', reason: 'envelope-unavailable' }
    const expiredCount = releaseExpiredReservations(this.ctx, now, cascadeId)
    const result = quarantineCascadeHolds(this.ctx, cascadeId, reason, now)
    if (result.kind === 'rejected') {
      if (expiredCount > 0) await this.invalidateBalance(envelope.principal_id)
      await repairEnvelopeAlarm(this.ctx, this.alarmStorage)
      return result
    }
    this.assertConservation(envelope.total_budget_minor)
    await this.invalidateBalance(envelope.principal_id)
    await repairEnvelopeAlarm(this.ctx, this.alarmStorage)
    return result
  }

  async resolveReconciliation(
    cascadeId: string,
    input: ReconciliationDecisionInput,
    now = Date.now(),
  ): Promise<CustodyResolutionResult> {
    if (!isCascadeIdentifier(cascadeId) || !validDecision(input)) {
      return { kind: 'rejected', reason: 'reconciliation-request-malformed' }
    }
    const envelope = this.envelope()
    if (!envelope) return { kind: 'rejected', reason: 'envelope-unavailable' }
    await this.sweepExpiredReservations(envelope, now)
    const result = resolveCascadeCustody(this.ctx, cascadeId, input, now)
    if (result.kind === 'rejected') {
      await repairEnvelopeAlarm(this.ctx, this.alarmStorage)
      return result
    }
    this.assertConservation(envelope.total_budget_minor)
    await this.invalidateBalance(envelope.principal_id)
    await repairEnvelopeAlarm(this.ctx, this.alarmStorage)
    return result
  }

  async commitCascade(cascadeId: string): Promise<Readonly<{ kind: 'committed' | 'idempotent'; count: number }> | Rejection> {
    const envelope = this.envelope()
    if (!envelope) return { kind: 'rejected', reason: 'envelope-unavailable' }
    const now = Date.now()
    const expiredCount = releaseExpiredReservations(this.ctx, now, cascadeId)
    let balanceChanged = expiredCount > 0
    try {
      const holds = readCascadeHolds(this.ctx, cascadeId)
      if (holds.length === 0) return readCascadeTerminalCount(this.ctx, cascadeId) === null
        ? { kind: 'rejected', reason: 'unknown-cascade-holds' }
        : { kind: 'rejected', reason: 'illegal-transition' }
      if (holds.every((hold) => hold.state === 'committed')) {
        return { kind: 'idempotent', count: holds.length }
      }
      if (holds.some((hold) => hold.state !== 'reserved')) {
        return { kind: 'rejected', reason: 'illegal-transition' }
      }
      if (holds.some((hold) => hold.expiresAt <= now)) {
        markCascadeCustodyPending(this.ctx, cascadeId)
        balanceChanged = true
        return { kind: 'rejected', reason: 'hold-expired' }
      }
      for (const hold of holds) {
        const current = this.readCommittedPosition(hold.bundleId, hold.legId)
        if (current?.holdId !== hold.priorHoldId) {
          return { kind: 'rejected', reason: 'committed-position-conflict' }
        }
      }
      this.ctx.storage.transactionSync(() => {
        for (const hold of holds) if (hold.priorHoldId) this.ctx.storage.sql.exec(
          "UPDATE holds SET state = 'released' WHERE hold_id = ? AND state = 'committed'", hold.priorHoldId,
        )
        this.ctx.storage.sql.exec(
          `UPDATE holds SET state = 'committed', amount_minor = target_amount_minor, custody_pending = 0
           WHERE cascade_id = ? AND reservation_kind = 'cascade' AND state = 'reserved'`, cascadeId,
        )
      })
      compactReleasedHolds(this.ctx, now)
      this.assertConservation(envelope.total_budget_minor)
      balanceChanged = true
      return { kind: 'committed', count: holds.length }
    } finally {
      if (balanceChanged) await this.invalidateBalance(envelope.principal_id)
      await repairEnvelopeAlarm(this.ctx, this.alarmStorage)
    }
  }

  async releaseCascade(cascadeId: string): Promise<Readonly<{ kind: 'released' | 'idempotent'; count: number }> | Rejection> {
    const envelope = this.envelope()
    if (!envelope) return { kind: 'rejected', reason: 'envelope-unavailable' }
    const expiredCount = releaseExpiredReservations(this.ctx, Date.now(), cascadeId)
    let balanceChanged = expiredCount > 0
    try {
      const holds = readCascadeHolds(this.ctx, cascadeId)
      if (holds.length === 0) {
        return { kind: 'idempotent', count: readCascadeTerminalCount(this.ctx, cascadeId) ?? 0 }
      }
      if (holds.every((hold) => hold.state === 'released')) {
        return { kind: 'idempotent', count: holds.length }
      }
      if (holds.some((hold) => hold.state !== 'reserved')) {
        return { kind: 'rejected', reason: 'illegal-transition' }
      }
      this.ctx.storage.sql.exec(
        `UPDATE holds SET state = 'released', custody_pending = 0
         WHERE cascade_id = ? AND reservation_kind = 'cascade' AND state = 'reserved'`, cascadeId,
      )
      compactReleasedHolds(this.ctx)
      this.assertConservation(envelope.total_budget_minor)
      balanceChanged = true
      return { kind: 'released', count: holds.length }
    } finally {
      if (balanceChanged) await this.invalidateBalance(envelope.principal_id)
      await repairEnvelopeAlarm(this.ctx, this.alarmStorage)
    }
  }

  async getAvailableBalance(): Promise<Readonly<{
    principalId: string
    availableBalanceMinor: number
    revision: string
  }> | Rejection> {
    const envelope = this.envelope()
    if (!envelope) return { kind: 'rejected', reason: 'envelope-unavailable' }
    const expiredCount = releaseExpiredReservations(this.ctx, Date.now())
    const value = this.available(envelope.total_budget_minor)
    const result = Object.freeze({
      principalId: envelope.principal_id,
      availableBalanceMinor: value,
      revision: ledgerRevision(this.ctx),
    })
    if (expiredCount > 0) await this.invalidateBalance(envelope.principal_id)
    await repairEnvelopeAlarm(this.ctx, this.alarmStorage)
    return result
  }

  getHolds(): readonly Reservation[] {
    return Object.freeze(readAllHolds(this.ctx))
  }
  getRetentionContract(): typeof ENVELOPE_HOLD_RETENTION {
    return ENVELOPE_HOLD_RETENTION
  }
  async alarm(): Promise<void> {
    const now = Date.now()
    releaseExpiredReservations(this.ctx, now)
    const envelope = this.envelope()
    if (envelope) {
      this.assertConservation(envelope.total_budget_minor)
      await this.invalidateBalance(envelope.principal_id)
    }
    await scheduleNextEnvelopeAlarm(this.ctx, this.alarmStorage)
  }

  private checkCommitmentSeed(
    budget: number,
    commitments: readonly CommittedPosition[],
  ): Readonly<{ kind: 'seed'; missing: readonly CommittedPosition[] }> | Rejection {
    const missing: CommittedPosition[] = []
    for (const position of commitments) {
      this.adoptLegacyPosition(position.bundleId, position.legId)
      const current = this.readCommittedPosition(position.bundleId, position.legId)
      if (!current) missing.push(position)
      else if (current.offerId !== position.offerId || current.amountMinor !== position.amountMinor) {
        return { kind: 'rejected', reason: 'committed-position-conflict' }
      }
    }
    const projected = activeHoldTotal(this.ctx) + missing.reduce((sum, item) => sum + item.amountMinor, 0)
    return projected <= budget
      ? { kind: 'seed', missing: Object.freeze(missing) }
      : { kind: 'rejected', reason: 'initial-commitments-over-envelope', details: { budget, projected } }
  }

  private async transitionOffer(
    operationId: string,
    agentId: string,
    target: 'committed' | 'released',
  ): Promise<OrdinaryOfferTransitionResult> {
    const envelope = this.envelope()
    if (!envelope) return { kind: 'rejected', reason: 'envelope-unavailable' }
    if (envelope.currency !== this.env.SETTLEMENT_CURRENCY) {
      return { kind: 'rejected', reason: 'envelope-currency-conflict' }
    }
    const expiredCount = releaseExpiredReservations(this.ctx, Date.now())
    const result = transitionOrdinaryOffer(
      this.ctx,
      operationId,
      agentId,
      target,
      envelope.currency,
      this.available(envelope.total_budget_minor),
    )
    if (result.kind === 'committed' || result.kind === 'released') {
      this.assertConservation(envelope.total_budget_minor)
    }
    if (expiredCount > 0 || result.kind === 'committed' || result.kind === 'released') {
      await this.invalidateBalance(envelope.principal_id)
    }
    await repairEnvelopeAlarm(this.ctx, this.alarmStorage)
    return result
  }

  private async sweepExpiredReservations(envelope: EnvelopeRow, now: number): Promise<void> {
    if (releaseExpiredReservations(this.ctx, now) > 0) {
      await this.invalidateBalance(envelope.principal_id)
    }
  }

  private migrate(): void {
    migrateEnvelopeLedger(this.ctx, this.env.SETTLEMENT_CURRENCY)
  }

  private envelope(): EnvelopeRow | null {
    return this.ctx.storage.sql.exec<EnvelopeRow>(
      'SELECT principal_id, total_budget_minor, currency FROM envelope LIMIT 1',
    ).toArray()[0] ?? null
  }

  private readCommittedPosition(bundleId: string, legId: string): Reservation | null {
    this.adoptLegacyPosition(bundleId, legId)
    const row = this.ctx.storage.sql.exec<HoldRow>(
      `SELECT hold_id, cascade_id, bundle_id, leg_id, offer_id, amount_minor, target_amount_minor,
       prior_hold_id, state, expires_at, quarantined, quarantine_reason, quarantined_at FROM holds
       WHERE bundle_id = ? AND leg_id = ? AND reservation_kind = 'cascade'
         AND state = 'committed'`, bundleId, legId,
    ).toArray()[0]
    return row ? mapHold(row) : null
  }

  private adoptLegacyPosition(bundleId: string, legId: string): void {
    const existing = this.ctx.storage.sql.exec<{ hold_id: string }>(
      `SELECT hold_id FROM holds WHERE bundle_id = ? AND leg_id = ?
       AND reservation_kind = 'cascade' AND state = 'committed' LIMIT 1`,
      bundleId, legId,
    ).toArray()[0]
    if (existing) return
    const prefix = `${bundleId}:`
    const legacy = this.ctx.storage.sql.exec<{ hold_id: string }>(
      `SELECT hold_id FROM holds
       WHERE bundle_id = 'legacy' AND leg_id = ? AND state = 'committed'
         AND reservation_kind = 'cascade'
         AND substr(cascade_id, 1, ?) = ? ORDER BY rowid DESC`,
      legId, prefix.length, prefix,
    ).toArray()
    if (legacy.length === 0) return
    this.ctx.storage.transactionSync(() => {
      for (const stale of legacy.slice(1)) {
        this.ctx.storage.sql.exec("UPDATE holds SET state = 'released' WHERE hold_id = ?", stale.hold_id)
      }
      this.ctx.storage.sql.exec('UPDATE holds SET bundle_id = ? WHERE hold_id = ?', bundleId, legacy[0].hold_id)
    })
  }

  private available(totalBudgetMinor: number): number {
    return availableFromLedger(this.ctx, totalBudgetMinor)
  }

  private reservationDelta(holds: readonly Reservation[]): number {
    const priorTotal = holds.reduce((sum, hold) => {
      if (!hold.priorHoldId) return sum
      const prior = this.ctx.storage.sql.exec<{ amount_minor: number }>(
        'SELECT amount_minor FROM holds WHERE hold_id = ?', hold.priorHoldId,
      ).toArray()[0]
      return sum + (prior?.amount_minor ?? 0)
    }, 0)
    return Math.max(0, holds.reduce((sum, hold) => sum + hold.targetAmountMinor, 0) - priorTotal)
  }

  private assertConservation(totalBudgetMinor: number): void {
    assertLedgerConservation(this.ctx, totalBudgetMinor)
  }

  private async invalidateBalance(principalId: string): Promise<void> {
    try {
      await this.env.BALANCE_CACHE.delete(`available-balance:${principalId}`)
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error', message: 'balance cache invalidation failed', principalId,
        reason: error instanceof Error ? error.message : 'balance-cache-unavailable',
      }))
    }
  }

}
