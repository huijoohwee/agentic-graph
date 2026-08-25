import type { CascadeRecord } from '../bundle-types'
import type { MarketplaceSplit } from './contracts'

export const PAYOUT_RETRY_MS = 60_000
export const PAYOUT_MAX_ATTEMPTS = 3

type SplitRow = {
  split_id: string; cascade_id: string; bundle_id: string; vendor_id: string; payout_principal_id: string
  covered_leg_ids_json: string; settlement_currency: string; gross_amount_minor: number
  commission_amount_minor: number; net_payout_amount_minor: number
  commission_rule_id: string; commission_rule_revision: string
}

export type PayoutRow = SplitRow & {
  payout_id: string; payout_state: 'pending' | 'blocked' | 'dispatched' | 'settled' | 'failed'
  attempt_count: number; idempotency_key: string; settlement_reference: string | null
  terminal_reason: string | null; next_attempt_at: number | null; last_result_fingerprint: string | null
}

export function replacePreparedSplits(
  ctx: DurableObjectState, cascadeId: string, splits: readonly MarketplaceSplit[],
): void {
  ctx.storage.sql.exec('DELETE FROM prepared_marketplace_splits WHERE cascade_id = ?', cascadeId)
  for (const split of splits) {
    ctx.storage.sql.exec(
      `INSERT INTO prepared_marketplace_splits (
        cascade_id, split_id, bundle_id, vendor_id, payout_principal_id, covered_leg_ids_json,
        settlement_currency, gross_amount_minor, commission_amount_minor, net_payout_amount_minor,
        commission_rule_id, commission_rule_revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      cascadeId, split.splitId, split.bundleId, split.vendorId, split.payoutPrincipalId,
      JSON.stringify(split.coveredLegIds), split.settlementCurrency, split.grossAmountMinor,
      split.commissionAmountMinor, split.netPayoutAmountMinor,
      split.commissionRuleId, split.commissionRuleRevision,
    )
  }
}

export function commitPreparedSplits(ctx: DurableObjectState, record: CascadeRecord, now: number): void {
  const rows = ctx.storage.sql.exec<SplitRow>(
    `SELECT split_id, bundle_id, vendor_id, payout_principal_id, covered_leg_ids_json,
      settlement_currency, gross_amount_minor, commission_amount_minor, net_payout_amount_minor,
      commission_rule_id, commission_rule_revision
     FROM prepared_marketplace_splits WHERE cascade_id = ? ORDER BY split_id`, record.cascadeId,
  ).toArray()
  for (const row of rows) {
    ctx.storage.sql.exec(
      `INSERT INTO vendor_splits (
        split_id, cascade_id, bundle_id, vendor_id, payout_principal_id, covered_leg_ids_json,
        settlement_currency, gross_amount_minor, commission_amount_minor, net_payout_amount_minor,
        commission_rule_id, commission_rule_revision, committed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(split_id) DO NOTHING`,
      row.split_id, record.cascadeId, row.bundle_id, row.vendor_id, row.payout_principal_id,
      row.covered_leg_ids_json, row.settlement_currency, row.gross_amount_minor,
      row.commission_amount_minor, row.net_payout_amount_minor,
      row.commission_rule_id, row.commission_rule_revision, now,
    )
    ctx.storage.sql.exec(
      `INSERT INTO marketplace_payouts (
        payout_id, split_id, payout_state, attempt_count, idempotency_key, next_attempt_at, updated_at
      ) VALUES (?, ?, 'pending', 0, ?, ?, ?)
      ON CONFLICT(payout_id) DO NOTHING`,
      `payout:${row.split_id}`, row.split_id, row.split_id, now, now,
    )
  }
}

export function readDuePayout(ctx: DurableObjectState, now: number): PayoutRow | null {
  return ctx.storage.sql.exec<PayoutRow>(
    `SELECT p.payout_id, p.payout_state, p.attempt_count, p.idempotency_key,
      p.settlement_reference, p.terminal_reason, p.next_attempt_at, p.last_result_fingerprint,
      s.split_id, s.cascade_id, s.bundle_id, s.vendor_id, s.payout_principal_id, s.covered_leg_ids_json,
      s.settlement_currency, s.gross_amount_minor, s.commission_amount_minor,
      s.net_payout_amount_minor, s.commission_rule_id, s.commission_rule_revision
     FROM marketplace_payouts p JOIN vendor_splits s ON s.split_id = p.split_id
     WHERE p.payout_state IN ('pending', 'dispatched') AND p.next_attempt_at <= ?
     ORDER BY p.next_attempt_at, p.payout_id LIMIT 1`, now,
  ).toArray()[0] ?? null
}

export function claimPayoutDispatch(
  ctx: DurableObjectState, row: PayoutRow, now: number,
): boolean {
  const current = ctx.storage.sql.exec<{ payout_state: string; next_attempt_at: number | null }>(
    'SELECT payout_state, next_attempt_at FROM marketplace_payouts WHERE payout_id = ?', row.payout_id,
  ).toArray()[0]
  if (!current || (current.payout_state !== 'pending'
    && !(current.payout_state === 'dispatched' && (current.next_attempt_at ?? Infinity) <= now))) return false
  updatePayout(ctx, row.payout_id, 'dispatched', {
    attemptCount: row.attempt_count,
    nextAttemptAt: now + PAYOUT_RETRY_MS,
    terminalReason: 'dispatch-lease-active',
    lastResultFingerprint: row.last_result_fingerprint,
  }, now)
  return true
}

export function updatePayout(
  ctx: DurableObjectState,
  payoutId: string,
  state: PayoutRow['payout_state'],
  values: Readonly<{
    attemptCount: number
    settlementReference?: string | null
    terminalReason?: string | null
    nextAttemptAt?: number | null
    lastResultFingerprint?: string | null
  }>,
  now: number,
): void {
  ctx.storage.sql.exec(
    `UPDATE marketplace_payouts SET payout_state = ?, attempt_count = ?, settlement_reference = ?,
      terminal_reason = ?, next_attempt_at = ?, last_result_fingerprint = ?, updated_at = ?
     WHERE payout_id = ?`,
    state, values.attemptCount, values.settlementReference ?? null, values.terminalReason ?? null,
    values.nextAttemptAt ?? null, values.lastResultFingerprint ?? null, now, payoutId,
  )
}

export function reportablePayout(ctx: DurableObjectState, payoutId: string): Record<string, unknown> | null {
  return ctx.storage.sql.exec<Record<string, string | number | null>>(
    'SELECT * FROM marketplace_payouts WHERE payout_id = ?', payoutId,
  ).toArray()[0] ?? null
}

export function mapSplit(row: SplitRow): MarketplaceSplit {
  return Object.freeze({
    splitId: row.split_id, bundleId: row.bundle_id, vendorId: row.vendor_id,
    payoutPrincipalId: row.payout_principal_id,
    coveredLegIds: Object.freeze(JSON.parse(row.covered_leg_ids_json) as string[]),
    settlementCurrency: row.settlement_currency, grossAmountMinor: row.gross_amount_minor,
    commissionAmountMinor: row.commission_amount_minor, netPayoutAmountMinor: row.net_payout_amount_minor,
    commissionRuleId: row.commission_rule_id, commissionRuleRevision: row.commission_rule_revision,
  })
}

export function readMarketplaceState(ctx: DurableObjectState): Readonly<Record<string, unknown>> {
  return Object.freeze({
    splits: ctx.storage.sql.exec('SELECT * FROM vendor_splits ORDER BY split_id').toArray(),
    payouts: ctx.storage.sql.exec('SELECT * FROM marketplace_payouts ORDER BY payout_id').toArray(),
  })
}

export function nextPayoutAt(ctx: DurableObjectState): number | null {
  return ctx.storage.sql.exec<{ value: number | null }>(
    `SELECT MIN(next_attempt_at) AS value FROM marketplace_payouts
     WHERE payout_state IN ('pending', 'dispatched') AND next_attempt_at IS NOT NULL`,
  ).one().value
}
