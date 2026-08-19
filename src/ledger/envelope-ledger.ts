import { DurableObject } from 'cloudflare:workers'
import {
  HOLD_TTL_MS,
  MAX_BUNDLE_LEGS,
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
import { availableBalance, conservesBudget } from './hold-lifecycle'
import { migrateEnvelopeLedger } from './envelope-ledger-schema'
import {
  quarantineCascadeHolds,
  resolveCascadeCustody,
  type CustodyResolutionResult,
  type QuarantineResult,
  validAuditReason,
  validDecision,
} from './reconciliation-custody'

type EnvelopeRow = { principal_id: string; total_budget_minor: number; currency: string }
type HoldRow = {
  hold_id: string
  cascade_id: string
  bundle_id: string
  leg_id: string
  offer_id: string
  amount_minor: number
  target_amount_minor: number
  prior_hold_id: string | null
  state: 'reserved' | 'committed' | 'released'
  expires_at: number
  quarantined: number
  quarantine_reason: string | null
  quarantined_at: number | null
}

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
  constructor(ctx: DurableObjectState, env: TravelCommerceEnv) {
    super(ctx, env)
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
      for (const position of seed.missing) this.insertSeedHold(position)
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
    if (!isCascadeIdentifier(cascadeId) || !isIdentifier(bundleId) || !validQuotes(quotes)) {
      return { kind: 'rejected', reason: 'requote-malformed' }
    }
    if (envelope.currency !== this.env.SETTLEMENT_CURRENCY) {
      return { kind: 'rejected', reason: 'envelope-currency-conflict' }
    }
    if (quotes.some((quote) => quote.currency !== envelope.currency)) {
      return { kind: 'rejected', reason: 'quote-currency-mismatch' }
    }
    if (quotes.some((quote) => !verifiedForLane(quote, this.env.DEPLOY_LANE))) {
      return { kind: 'rejected', reason: 'quote-unverified' }
    }
    const existing = this.readHoldsForCascade(cascadeId)
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
      if (!sameReservations(existing, bundleId, quotes)) return { kind: 'rejected', reason: 'idempotency-conflict' }
      return {
        kind: 'idempotent',
        holds: Object.freeze(existing),
        availableAfterMinor: this.available(envelope.total_budget_minor),
        reservedDeltaMinor: this.reservationDelta(existing),
        operationElapsedMs: elapsed(operationStartedAt),
      }
    }
    const requestedPositions = new Set(quotes.map((quote) => positionKey(bundleId, quote.legId)))
    const overlapping = this.readHolds().some((hold) => (
      (hold.state === 'reserved' || hold.state === 'quarantined')
      && requestedPositions.has(positionKey(hold.bundleId, hold.legId))
    ))
    if (overlapping) return { kind: 'rejected', reason: 'leg-reservation-conflict' }

    const priors = quotes.map((quote) => this.readCommittedPosition(bundleId, quote.legId))
    const priorTotal = priors.reduce((sum, hold) => sum + (hold?.amountMinor ?? 0), 0)
    const targetTotal = quotes.reduce((sum, quote) => sum + quote.amountMinor, 0)
    const reservedDeltaMinor = Math.max(0, targetTotal - priorTotal)
    const available = this.available(envelope.total_budget_minor)
    if (reservedDeltaMinor > available) {
      return {
        kind: 'rejected',
        reason: 'insufficient-envelope',
        details: { availableAtCheck: available, requested: reservedDeltaMinor },
      }
    }
    const allocations = allocateDelta(quotes, priors, reservedDeltaMinor)
    const expiresAt = now + HOLD_TTL_MS
    const reservations = quotes.map((quote, index): Reservation => Object.freeze({
      holdId: `${cascadeId}:${quote.legId}`,
      cascadeId,
      bundleId,
      legId: quote.legId,
      offerId: quote.offerId,
      amountMinor: minorUnits(allocations[index]),
      targetAmountMinor: quote.amountMinor,
      priorHoldId: priors[index]?.holdId ?? null,
      state: 'reserved',
      expiresAt,
    }))
    this.ctx.storage.transactionSync(() => {
      for (const hold of reservations) this.insertReservation(hold)
    })
    this.assertConservation(envelope.total_budget_minor)
    const operationElapsedMs = elapsed(operationStartedAt)
    await this.scheduleExpiry(expiresAt)
    await this.invalidateBalance(envelope.principal_id)
    return {
      kind: 'reserved',
      holds: Object.freeze(reservations),
      availableAfterMinor: this.available(envelope.total_budget_minor),
      reservedDeltaMinor,
      operationElapsedMs,
    }
  }

  async protectCascade(
    cascadeId: string,
    now = Date.now(),
  ): Promise<Readonly<{ kind: 'protected' | 'idempotent'; expiresAt: number }> | Rejection> {
    const holds = this.readHoldsForCascade(cascadeId)
    if (holds.length === 0) return { kind: 'rejected', reason: 'unknown-cascade-holds' }
    if (holds.every((hold) => hold.state === 'quarantined')) {
      return { kind: 'idempotent', expiresAt: Number.MAX_SAFE_INTEGER }
    }
    if (holds.some((hold) => hold.state !== 'reserved')) {
      return holds.every((hold) => hold.state === 'committed')
        ? { kind: 'idempotent', expiresAt: Math.max(...holds.map((hold) => hold.expiresAt)) }
        : { kind: 'rejected', reason: 'illegal-transition' }
    }
    const expiresAt = now + SETTLEMENT_HOLD_PROTECTION_MS
    const currentExpiry = Math.min(...holds.map((hold) => hold.expiresAt))
    if (currentExpiry >= expiresAt) return { kind: 'idempotent', expiresAt: currentExpiry }
    this.ctx.storage.sql.exec(
      "UPDATE holds SET expires_at = ? WHERE cascade_id = ? AND state = 'reserved'", expiresAt, cascadeId,
    )
    await this.scheduleExpiry(expiresAt)
    return { kind: 'protected', expiresAt }
  }

  async quarantineCascade(cascadeId: string, reason: string, now = Date.now()): Promise<QuarantineResult> {
    if (!isCascadeIdentifier(cascadeId) || !validAuditReason(reason)) {
      return { kind: 'rejected', reason: 'reconciliation-request-malformed' }
    }
    const result = quarantineCascadeHolds(this.ctx, cascadeId, reason, now)
    if (result.kind === 'rejected') return result
    const envelope = this.envelope()
    if (!envelope) return { kind: 'rejected', reason: 'envelope-unavailable' }
    this.assertConservation(envelope.total_budget_minor)
    await this.invalidateBalance(envelope.principal_id)
    await this.scheduleNextAlarm()
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
    const result = resolveCascadeCustody(this.ctx, cascadeId, input, now)
    if (result.kind === 'rejected') return result
    const envelope = this.envelope()
    if (!envelope) return { kind: 'rejected', reason: 'envelope-unavailable' }
    this.assertConservation(envelope.total_budget_minor)
    await this.invalidateBalance(envelope.principal_id)
    await this.scheduleNextAlarm()
    return result
  }

  async commitCascade(cascadeId: string): Promise<Readonly<{ kind: 'committed' | 'idempotent'; count: number }> | Rejection> {
    const holds = this.readHoldsForCascade(cascadeId)
    if (holds.length === 0) return { kind: 'rejected', reason: 'unknown-cascade-holds' }
    if (holds.every((hold) => hold.state === 'committed')) return { kind: 'idempotent', count: holds.length }
    if (holds.some((hold) => hold.state !== 'reserved')) return { kind: 'rejected', reason: 'illegal-transition' }
    for (const hold of holds) {
      const current = this.readCommittedPosition(hold.bundleId, hold.legId)
      if (current?.holdId !== hold.priorHoldId) return { kind: 'rejected', reason: 'committed-position-conflict' }
    }
    this.ctx.storage.transactionSync(() => {
      for (const hold of holds) {
        if (hold.priorHoldId) {
          this.ctx.storage.sql.exec(
            "UPDATE holds SET state = 'released' WHERE hold_id = ? AND state = 'committed'", hold.priorHoldId,
          )
        }
      }
      this.ctx.storage.sql.exec(
        "UPDATE holds SET state = 'committed', amount_minor = target_amount_minor WHERE cascade_id = ? AND state = 'reserved'",
        cascadeId,
      )
    })
    const envelope = this.envelope()
    if (!envelope) throw new Error('envelope-unavailable-after-commit')
    this.assertConservation(envelope.total_budget_minor)
    await this.invalidateBalance(envelope.principal_id)
    await this.scheduleNextAlarm()
    return { kind: 'committed', count: holds.length }
  }

  async releaseCascade(cascadeId: string): Promise<Readonly<{ kind: 'released' | 'idempotent'; count: number }> | Rejection> {
    const holds = this.readHoldsForCascade(cascadeId)
    if (holds.length === 0) return { kind: 'idempotent', count: 0 }
    if (holds.every((hold) => hold.state === 'released')) return { kind: 'idempotent', count: holds.length }
    if (holds.some((hold) => hold.state !== 'reserved')) return { kind: 'rejected', reason: 'illegal-transition' }
    this.ctx.storage.sql.exec(
      "UPDATE holds SET state = 'released' WHERE cascade_id = ? AND state = 'reserved'", cascadeId,
    )
    const envelope = this.envelope()
    if (!envelope) throw new Error('envelope-unavailable-after-release')
    this.assertConservation(envelope.total_budget_minor)
    await this.invalidateBalance(envelope.principal_id)
    await this.scheduleNextAlarm()
    return { kind: 'released', count: holds.length }
  }

  async getAvailableBalance(): Promise<Readonly<{
    principalId: string
    availableBalanceMinor: number
    revision: string
  }> | Rejection> {
    const envelope = this.envelope()
    if (!envelope) return { kind: 'rejected', reason: 'envelope-unavailable' }
    const holds = this.readHolds()
    const value = availableBalance(envelope.total_budget_minor, holds)
    return Object.freeze({
      principalId: envelope.principal_id,
      availableBalanceMinor: value,
      revision: await digest(`${envelope.principal_id}:${value}:${holds.map((hold) => `${hold.holdId}:${hold.state}:${hold.amountMinor}`).join('|')}`),
    })
  }

  getHolds(): readonly Reservation[] {
    return Object.freeze(this.readHolds())
  }

  async alarm(): Promise<void> {
    const now = Date.now()
    this.ctx.storage.sql.exec(
      `UPDATE holds SET state = 'released'
       WHERE state = 'reserved' AND quarantined = 0 AND expires_at <= ?`, now,
    )
    const envelope = this.envelope()
    if (envelope) {
      this.assertConservation(envelope.total_budget_minor)
      await this.invalidateBalance(envelope.principal_id)
    }
    await this.scheduleNextAlarm()
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
    const projected = sumActive(this.readHolds()) + missing.reduce((sum, item) => sum + item.amountMinor, 0)
    return projected <= budget
      ? { kind: 'seed', missing: Object.freeze(missing) }
      : { kind: 'rejected', reason: 'initial-commitments-over-envelope', details: { budget, projected } }
  }

  private insertSeedHold(position: CommittedPosition): void {
    const holdId = `seed:${JSON.stringify([position.bundleId, position.legId])}`
    this.ctx.storage.sql.exec(
      `INSERT INTO holds (
        hold_id, cascade_id, bundle_id, leg_id, offer_id, amount_minor, target_amount_minor,
        prior_hold_id, state, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'committed', ?)`,
      holdId, `seed:${position.bundleId}`, position.bundleId, position.legId, position.offerId,
      position.amountMinor, position.amountMinor, Number.MAX_SAFE_INTEGER,
    )
  }

  private insertReservation(hold: Reservation): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO holds (
        hold_id, cascade_id, bundle_id, leg_id, offer_id, amount_minor, target_amount_minor,
        prior_hold_id, state, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?)`,
      hold.holdId, hold.cascadeId, hold.bundleId, hold.legId, hold.offerId, hold.amountMinor,
      hold.targetAmountMinor, hold.priorHoldId, hold.expiresAt,
    )
  }

  private migrate(): void {
    migrateEnvelopeLedger(this.ctx, this.env.SETTLEMENT_CURRENCY)
  }

  private envelope(): EnvelopeRow | null {
    return this.ctx.storage.sql.exec<EnvelopeRow>(
      'SELECT principal_id, total_budget_minor, currency FROM envelope LIMIT 1',
    ).toArray()[0] ?? null
  }

  private readHolds(): Reservation[] {
    return this.ctx.storage.sql.exec<HoldRow>(
      `SELECT hold_id, cascade_id, bundle_id, leg_id, offer_id, amount_minor, target_amount_minor,
       prior_hold_id, state, expires_at, quarantined, quarantine_reason, quarantined_at
       FROM holds ORDER BY hold_id`,
    ).toArray().map(mapHold)
  }

  private readHoldsForCascade(cascadeId: string): Reservation[] {
    return this.ctx.storage.sql.exec<HoldRow>(
      `SELECT hold_id, cascade_id, bundle_id, leg_id, offer_id, amount_minor, target_amount_minor,
       prior_hold_id, state, expires_at, quarantined, quarantine_reason, quarantined_at
       FROM holds WHERE cascade_id = ? ORDER BY leg_id`, cascadeId,
    ).toArray().map(mapHold)
  }

  private readCommittedPosition(bundleId: string, legId: string): Reservation | null {
    this.adoptLegacyPosition(bundleId, legId)
    const row = this.ctx.storage.sql.exec<HoldRow>(
      `SELECT hold_id, cascade_id, bundle_id, leg_id, offer_id, amount_minor, target_amount_minor,
       prior_hold_id, state, expires_at, quarantined, quarantine_reason, quarantined_at FROM holds
       WHERE bundle_id = ? AND leg_id = ? AND state = 'committed'`, bundleId, legId,
    ).toArray()[0]
    return row ? mapHold(row) : null
  }

  private adoptLegacyPosition(bundleId: string, legId: string): void {
    const existing = this.ctx.storage.sql.exec<{ hold_id: string }>(
      "SELECT hold_id FROM holds WHERE bundle_id = ? AND leg_id = ? AND state = 'committed' LIMIT 1",
      bundleId, legId,
    ).toArray()[0]
    if (existing) return
    const prefix = `${bundleId}:`
    const legacy = this.ctx.storage.sql.exec<{ hold_id: string }>(
      `SELECT hold_id FROM holds
       WHERE bundle_id = 'legacy' AND leg_id = ? AND state = 'committed'
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
    return availableBalance(totalBudgetMinor, this.readHolds())
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
    if (!conservesBudget(totalBudgetMinor, this.readHolds()) || this.available(totalBudgetMinor) < 0) {
      throw new Error('envelope-conservation-violated')
    }
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

  private async scheduleExpiry(expiresAt: number): Promise<void> {
    const current = await this.ctx.storage.getAlarm()
    if (current == null || expiresAt < current) await this.ctx.storage.setAlarm(expiresAt)
  }

  private async scheduleNextAlarm(): Promise<void> {
    const next = this.ctx.storage.sql.exec<{ expires_at: number | null }>(
      "SELECT MIN(expires_at) AS expires_at FROM holds WHERE state = 'reserved' AND quarantined = 0",
    ).one().expires_at
    if (next == null) await this.ctx.storage.deleteAlarm()
    else await this.ctx.storage.setAlarm(next)
  }
}

function mapHold(row: HoldRow): Reservation {
  if (!isMinorUnits(row.amount_minor) || !isMinorUnits(row.target_amount_minor)) {
    throw new Error('stored-money-malformed')
  }
  return Object.freeze({
    holdId: row.hold_id,
    cascadeId: row.cascade_id,
    bundleId: row.bundle_id,
    legId: row.leg_id,
    offerId: row.offer_id,
    amountMinor: row.amount_minor,
    targetAmountMinor: row.target_amount_minor,
    priorHoldId: row.prior_hold_id,
    state: row.state === 'reserved' && row.quarantined === 1 ? 'quarantined' : row.state,
    expiresAt: row.expires_at,
    quarantineReason: row.quarantine_reason,
    quarantinedAt: row.quarantined_at,
  })
}

function validCommitments(commitments: readonly CommittedPosition[]): boolean {
  const keys = new Set<string>()
  let total = 0
  for (const item of commitments) {
    if (!isIdentifier(item.bundleId) || !isIdentifier(item.legId) || !isIdentifier(item.offerId) || !isMinorUnits(item.amountMinor)) return false
    const key = positionKey(item.bundleId, item.legId)
    if (keys.has(key)) return false
    keys.add(key)
    total += item.amountMinor
    if (!Number.isSafeInteger(total)) return false
  }
  return true
}

function validQuotes(quotes: readonly Quote[]): boolean {
  return quotes.length > 0
    && quotes.length <= MAX_BUNDLE_LEGS
    && new Set(quotes.map((quote) => quote.legId)).size === quotes.length
    && quotes.every((quote) => isIdentifier(quote.legId) && isIdentifier(quote.offerId) && isMinorUnits(quote.amountMinor))
    && Number.isSafeInteger(quotes.reduce((sum, quote) => sum + quote.amountMinor, 0))
}

function verifiedForLane(quote: Quote, lane: TravelCommerceEnv['DEPLOY_LANE']): boolean {
  return quote.priceVerification === 'verified'
    || (lane !== 'Production_Lane' && quote.priceVerification === 'deterministic-demo')
}

function allocateDelta(
  quotes: readonly Quote[],
  priors: readonly (Reservation | null)[],
  reserveTotal: number,
): number[] {
  let remaining = reserveTotal
  return quotes.map((quote, index) => {
    const positiveDelta = Math.max(0, quote.amountMinor - (priors[index]?.amountMinor ?? 0))
    const allocated = Math.min(positiveDelta, remaining)
    remaining -= allocated
    return allocated
  })
}

function sameReservations(holds: readonly Reservation[], bundleId: string, quotes: readonly Quote[]): boolean {
  if (holds.length !== quotes.length || holds.some((hold) => hold.bundleId !== bundleId)) return false
  const byLeg = new Map(quotes.map((quote) => [quote.legId, quote]))
  return holds.every((hold) => {
    const quote = byLeg.get(hold.legId)
    return quote?.offerId === hold.offerId && quote.amountMinor === hold.targetAmountMinor
  })
}

function positionKey(bundleId: string, legId: string): string {
  return JSON.stringify([bundleId, legId])
}

function sumActive(holds: readonly Reservation[]): number {
  return holds.reduce((sum, hold) => sum + (hold.state === 'released' ? 0 : hold.amountMinor), 0)
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function elapsed(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(3))
}
