import {
  MAX_BUNDLE_LEGS,
  isIdentifier,
  isMinorUnits,
} from '../bundle/bundle-runtime'
import type {
  CommittedPosition,
  Quote,
  Reservation,
} from '../bundle/bundle-types'

export type EnvelopeRow = {
  principal_id: string
  total_budget_minor: number
  currency: string
}

export type HoldRow = {
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

const HOLD_COLUMNS = `hold_id, cascade_id, bundle_id, leg_id, offer_id, amount_minor,
  target_amount_minor, prior_hold_id, state, expires_at, quarantined, quarantine_reason, quarantined_at`

export function readEnvelope(ctx: DurableObjectState): EnvelopeRow | null {
  return ctx.storage.sql.exec<EnvelopeRow>(
    'SELECT principal_id, total_budget_minor, currency FROM envelope LIMIT 1',
  ).toArray()[0] ?? null
}

export function readAllHolds(ctx: DurableObjectState): Reservation[] {
  return ctx.storage.sql.exec<HoldRow>(
    `SELECT ${HOLD_COLUMNS} FROM holds WHERE state != 'released' ORDER BY hold_id`,
  ).toArray().map(mapHold)
}

export function compactReleasedHolds(ctx: DurableObjectState, releasedAt = Date.now()): void {
  ctx.storage.transactionSync(() => {
    ctx.storage.sql.exec(
      `INSERT INTO ordinary_terminal_receipts (
         operation_id, agent_id, offer_id, amount_minor, expires_at, price_verification,
         terminal_state, released_at
       ) SELECT operation_id, agent_id, offer_id, amount_minor, expires_at, price_verification,
           'released', ? FROM holds
         WHERE reservation_kind = 'ordinary' AND state = 'released'
       ON CONFLICT(operation_id) DO NOTHING`,
      releasedAt,
    )
    ctx.storage.sql.exec(
      `INSERT INTO cascade_terminal_receipts (cascade_id, released_count, released_at)
       SELECT cascade_id, COUNT(*), ? FROM holds
         WHERE reservation_kind = 'cascade' AND state = 'released' GROUP BY cascade_id
       ON CONFLICT(cascade_id) DO UPDATE SET
         released_count = cascade_terminal_receipts.released_count + excluded.released_count,
         released_at = MAX(cascade_terminal_receipts.released_at, excluded.released_at)`,
      releasedAt,
    )
    ctx.storage.sql.exec("DELETE FROM holds WHERE state = 'released'")
  })
}

export function readCascadeTerminalCount(ctx: DurableObjectState, cascadeId: string): number | null {
  return ctx.storage.sql.exec<{ released_count: number }>(
    'SELECT released_count FROM cascade_terminal_receipts WHERE cascade_id = ?', cascadeId,
  ).toArray()[0]?.released_count ?? null
}

export function readCascadeHolds(ctx: DurableObjectState, cascadeId: string): Reservation[] {
  return ctx.storage.sql.exec<HoldRow>(
    `SELECT ${HOLD_COLUMNS} FROM holds
     WHERE cascade_id = ? AND reservation_kind = 'cascade' ORDER BY leg_id`, cascadeId,
  ).toArray().map(mapHold)
}

export function hasOverlappingCascadePosition(
  ctx: DurableObjectState,
  bundleId: string,
  quotes: readonly Quote[],
): boolean {
  return quotes.some((quote) => ctx.storage.sql.exec<{ present: number }>(
    `SELECT EXISTS(SELECT 1 FROM holds WHERE reservation_kind = 'cascade'
      AND bundle_id = ? AND leg_id = ? AND state = 'reserved') AS present`,
    bundleId, quote.legId,
  ).one().present === 1)
}

export function cascadeCustodyPending(ctx: DurableObjectState, cascadeId: string): boolean {
  return ctx.storage.sql.exec<{ pending: number }>(
    `SELECT EXISTS(SELECT 1 FROM holds WHERE cascade_id = ? AND reservation_kind = 'cascade'
      AND custody_pending = 1) AS pending`, cascadeId,
  ).one().pending === 1
}

export function markCascadeCustodyPending(ctx: DurableObjectState, cascadeId: string): void {
  ctx.storage.sql.exec(
    `UPDATE holds SET custody_pending = 1 WHERE cascade_id = ? AND reservation_kind = 'cascade'
     AND state = 'reserved' AND quarantined = 0`, cascadeId,
  )
}

export function insertSeedHold(ctx: DurableObjectState, position: CommittedPosition): void {
  const holdId = `seed:${JSON.stringify([position.bundleId, position.legId])}`
  ctx.storage.sql.exec(
    `INSERT INTO holds (
      hold_id, cascade_id, bundle_id, leg_id, offer_id, amount_minor, target_amount_minor,
      prior_hold_id, state, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'committed', ?)`,
    holdId, `seed:${position.bundleId}`, position.bundleId, position.legId, position.offerId,
    position.amountMinor, position.amountMinor, Number.MAX_SAFE_INTEGER,
  )
}

export function insertReservation(ctx: DurableObjectState, hold: Reservation): void {
  ctx.storage.sql.exec(
    `INSERT INTO holds (
      hold_id, cascade_id, bundle_id, leg_id, offer_id, amount_minor, target_amount_minor,
      prior_hold_id, state, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?)`,
    hold.holdId, hold.cascadeId, hold.bundleId, hold.legId, hold.offerId, hold.amountMinor,
    hold.targetAmountMinor, hold.priorHoldId, hold.expiresAt,
  )
}

export function mapHold(row: HoldRow): Reservation {
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

export function validCommitments(commitments: readonly CommittedPosition[]): boolean {
  const keys = new Set<string>()
  let total = 0
  for (const item of commitments) {
    if (!isIdentifier(item.bundleId) || !isIdentifier(item.legId)
      || !isIdentifier(item.offerId) || !isMinorUnits(item.amountMinor)) return false
    const key = positionKey(item.bundleId, item.legId)
    if (keys.has(key)) return false
    keys.add(key)
    total += item.amountMinor
    if (!Number.isSafeInteger(total)) return false
  }
  return true
}

export function validQuotes(quotes: readonly Quote[]): boolean {
  return quotes.length > 0
    && quotes.length <= MAX_BUNDLE_LEGS
    && new Set(quotes.map((quote) => quote.legId)).size === quotes.length
    && quotes.every((quote) => isIdentifier(quote.legId)
      && isIdentifier(quote.offerId) && isMinorUnits(quote.amountMinor))
    && Number.isSafeInteger(quotes.reduce((sum, quote) => sum + quote.amountMinor, 0))
}

export function verifiedForLane(
  verification: Quote['priceVerification'],
  lane: TravelCommerceEnv['DEPLOY_LANE'],
): boolean {
  return verification === 'verified'
    || (lane !== 'Production_Lane' && verification === 'deterministic-demo')
}

export function allocateDelta(
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

export function sameReservations(
  holds: readonly Reservation[],
  bundleId: string,
  quotes: readonly Quote[],
): boolean {
  if (holds.length !== quotes.length || holds.some((hold) => hold.bundleId !== bundleId)) return false
  const byLeg = new Map(quotes.map((quote) => [quote.legId, quote]))
  return holds.every((hold) => {
    const quote = byLeg.get(hold.legId)
    return quote?.offerId === hold.offerId && quote.amountMinor === hold.targetAmountMinor
  })
}

export function positionKey(bundleId: string, legId: string): string {
  return JSON.stringify([bundleId, legId])
}

export function sumActive(holds: readonly Reservation[]): number {
  return holds.reduce((sum, hold) => sum + (hold.state === 'released' ? 0 : hold.amountMinor), 0)
}

export async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function elapsed(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(3))
}
