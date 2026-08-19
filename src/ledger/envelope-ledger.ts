import { DurableObject } from 'cloudflare:workers'
import { HOLD_TTL_MS, isIdentifier, isMinorUnits, type Quote, type Rejection, type Reservation } from '../bundle/bundle-types'
import { availableBalance, conservesBudget } from './hold-lifecycle'

type EnvelopeRow = { principal_id: string; total_budget_minor: number }
type HoldRow = {
  hold_id: string
  cascade_id: string
  leg_id: string
  offer_id: string
  amount_minor: number
  state: Reservation['state']
  expires_at: number
}

export type ReserveResult =
  | Readonly<{ kind: 'reserved' | 'idempotent'; holds: readonly Reservation[]; availableAfterMinor: number }>
  | Rejection

export class EnvelopeLedger extends DurableObject<TravelCommerceEnv> {
  constructor(ctx: DurableObjectState, env: TravelCommerceEnv) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => this.migrate())
  }

  async init(principalId: string, totalBudgetMinor: number): Promise<{ kind: 'initialized' | 'idempotent' } | Rejection> {
    if (!isIdentifier(principalId) || !isMinorUnits(totalBudgetMinor)) {
      return { kind: 'rejected', reason: 'envelope-malformed' }
    }
    const current = this.envelope()
    if (current) {
      return current.principal_id === principalId && current.total_budget_minor === totalBudgetMinor
        ? { kind: 'idempotent' }
        : { kind: 'rejected', reason: 'envelope-initialization-conflict' }
    }
    this.ctx.storage.sql.exec(
      'INSERT INTO envelope (principal_id, total_budget_minor) VALUES (?, ?)', principalId, totalBudgetMinor,
    )
    await this.invalidateBalance(principalId)
    return { kind: 'initialized' }
  }

  async checkAndReserveCascade(
    cascadeId: string,
    quotes: readonly Quote[],
    now = Date.now(),
  ): Promise<ReserveResult> {
    const envelope = this.envelope()
    if (!envelope) return { kind: 'rejected', reason: 'envelope-unavailable' }
    if (!isIdentifier(cascadeId)) return { kind: 'rejected', reason: 'cascade-malformed' }
    if (quotes.length === 0 || quotes.some((quote) => !isMinorUnits(quote.amountMinor))) {
      return { kind: 'rejected', reason: 'requote-malformed' }
    }
    const existing = this.readHoldsForCascade(cascadeId)
    if (existing.length > 0) {
      if (!sameReservations(existing, quotes)) return { kind: 'rejected', reason: 'idempotency-conflict' }
      return { kind: 'idempotent', holds: existing, availableAfterMinor: this.available(envelope.total_budget_minor) }
    }
    const active = this.readHolds().filter((hold) => hold.state !== 'released')
    const available = availableBalance(envelope.total_budget_minor, active)
    const requested = quotes.reduce((sum, quote) => sum + quote.amountMinor, 0)
    if (requested > available) {
      return { kind: 'rejected', reason: 'insufficient-envelope', details: { availableAtCheck: available, requested } }
    }
    const expiresAt = now + HOLD_TTL_MS
    const reservations: Reservation[] = quotes.map((quote) => Object.freeze({
      holdId: `${cascadeId}:${quote.legId}`,
      cascadeId,
      legId: quote.legId,
      offerId: quote.offerId,
      amountMinor: quote.amountMinor,
      state: 'reserved' as const,
      expiresAt,
    }))
    this.ctx.storage.transactionSync(() => {
      for (const hold of reservations) {
        this.ctx.storage.sql.exec(
          `INSERT INTO holds (
            hold_id, cascade_id, leg_id, offer_id, amount_minor, state, expires_at
          ) VALUES (?, ?, ?, ?, ?, 'reserved', ?)`,
          hold.holdId, hold.cascadeId, hold.legId, hold.offerId, hold.amountMinor, hold.expiresAt,
        )
      }
    })
    await this.scheduleExpiry(expiresAt)
    await this.invalidateBalance(envelope.principal_id)
    const all = this.readHolds()
    if (!conservesBudget(envelope.total_budget_minor, all)) throw new Error('envelope-conservation-violated')
    return {
      kind: 'reserved',
      holds: Object.freeze(reservations),
      availableAfterMinor: this.available(envelope.total_budget_minor),
    }
  }

  async commitCascade(cascadeId: string): Promise<Readonly<{ kind: 'committed' | 'idempotent'; count: number }> | Rejection> {
    return this.transitionCascade(cascadeId, 'committed')
  }

  async releaseCascade(cascadeId: string): Promise<Readonly<{ kind: 'released' | 'idempotent'; count: number }> | Rejection> {
    return this.transitionCascade(cascadeId, 'released')
  }

  async getAvailableBalance(): Promise<Readonly<{ principalId: string; availableBalanceMinor: number; revision: string }> | Rejection> {
    const envelope = this.envelope()
    if (!envelope) return { kind: 'rejected', reason: 'envelope-unavailable' }
    const value = this.available(envelope.total_budget_minor)
    return Object.freeze({
      principalId: envelope.principal_id,
      availableBalanceMinor: value,
      revision: await digest(`${envelope.principal_id}:${value}:${this.readHolds().map((hold) => `${hold.holdId}:${hold.state}`).join('|')}`),
    })
  }

  getHolds(): readonly Reservation[] {
    return Object.freeze(this.readHolds())
  }

  async alarm(): Promise<void> {
    const now = Date.now()
    const expired = this.ctx.storage.sql.exec<HoldRow>(
      `SELECT hold_id, cascade_id, leg_id, offer_id, amount_minor, state, expires_at
       FROM holds WHERE state = 'reserved' AND expires_at <= ?`, now,
    ).toArray()
    if (expired.length === 0) return this.scheduleNextAlarm()
    this.ctx.storage.transactionSync(() => {
      for (const hold of expired) {
        this.ctx.storage.sql.exec("UPDATE holds SET state = 'released' WHERE hold_id = ? AND state = 'reserved'", hold.hold_id)
      }
    })
    const envelope = this.envelope()
    if (envelope) await this.invalidateBalance(envelope.principal_id)
    await this.scheduleNextAlarm()
  }

  private async transitionCascade<Target extends 'committed' | 'released'>(
    cascadeId: string,
    target: Target,
  ): Promise<Readonly<{ kind: Target | 'idempotent'; count: number }> | Rejection> {
    const holds = this.readHoldsForCascade(cascadeId)
    if (holds.length === 0) return { kind: 'rejected', reason: 'unknown-cascade-holds' }
    if (holds.every((hold) => hold.state === target)) return { kind: 'idempotent', count: holds.length }
    if (holds.some((hold) => hold.state !== 'reserved')) return { kind: 'rejected', reason: 'illegal-transition' }
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "UPDATE holds SET state = ? WHERE cascade_id = ? AND state = 'reserved'", target, cascadeId,
      )
    })
    const envelope = this.envelope()
    if (envelope) await this.invalidateBalance(envelope.principal_id)
    await this.scheduleNextAlarm()
    return { kind: target, count: holds.length }
  }

  private migrate(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS _sql_schema_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS envelope (
        principal_id TEXT PRIMARY KEY, total_budget_minor INTEGER NOT NULL CHECK (total_budget_minor >= 0)
      );
      CREATE TABLE IF NOT EXISTS holds (
        hold_id TEXT PRIMARY KEY, cascade_id TEXT NOT NULL, leg_id TEXT NOT NULL, offer_id TEXT NOT NULL,
        amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0), state TEXT NOT NULL,
        expires_at INTEGER NOT NULL, UNIQUE (cascade_id, leg_id)
      );
      CREATE INDEX IF NOT EXISTS idx_holds_active ON holds(state, expires_at);
      CREATE INDEX IF NOT EXISTS idx_holds_cascade ON holds(cascade_id);
      INSERT OR IGNORE INTO _sql_schema_migrations (id, applied_at) VALUES (1, ${Date.now()});
    `)
  }

  private envelope(): EnvelopeRow | null {
    return this.ctx.storage.sql.exec<EnvelopeRow>(
      'SELECT principal_id, total_budget_minor FROM envelope LIMIT 1',
    ).toArray()[0] ?? null
  }

  private readHolds(): Reservation[] {
    return this.ctx.storage.sql.exec<HoldRow>(
      'SELECT hold_id, cascade_id, leg_id, offer_id, amount_minor, state, expires_at FROM holds ORDER BY hold_id',
    ).toArray().map(mapHold)
  }

  private readHoldsForCascade(cascadeId: string): Reservation[] {
    return this.ctx.storage.sql.exec<HoldRow>(
      `SELECT hold_id, cascade_id, leg_id, offer_id, amount_minor, state, expires_at
       FROM holds WHERE cascade_id = ? ORDER BY leg_id`, cascadeId,
    ).toArray().map(mapHold)
  }

  private available(totalBudgetMinor: number): number {
    return availableBalance(totalBudgetMinor, this.readHolds())
  }

  private async invalidateBalance(principalId: string): Promise<void> {
    await this.env.BALANCE_CACHE.delete(`available-balance:${principalId}`)
  }

  private async scheduleExpiry(expiresAt: number): Promise<void> {
    const current = await this.ctx.storage.getAlarm()
    if (current == null || expiresAt < current) await this.ctx.storage.setAlarm(expiresAt)
  }

  private async scheduleNextAlarm(): Promise<void> {
    const next = this.ctx.storage.sql.exec<{ expires_at: number | null }>(
      "SELECT MIN(expires_at) AS expires_at FROM holds WHERE state = 'reserved'",
    ).one().expires_at
    if (next == null) await this.ctx.storage.deleteAlarm()
    else await this.ctx.storage.setAlarm(next)
  }
}

function mapHold(row: HoldRow): Reservation {
  return Object.freeze({
    holdId: row.hold_id,
    cascadeId: row.cascade_id,
    legId: row.leg_id,
    offerId: row.offer_id,
    amountMinor: row.amount_minor,
    state: row.state,
    expiresAt: row.expires_at,
  })
}

function sameReservations(holds: readonly Reservation[], quotes: readonly Quote[]): boolean {
  if (holds.length !== quotes.length) return false
  const byLeg = new Map(quotes.map((quote) => [quote.legId, quote]))
  return holds.every((hold) => {
    const quote = byLeg.get(hold.legId)
    return quote?.offerId === hold.offerId && quote.amountMinor === hold.amountMinor
  })
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
