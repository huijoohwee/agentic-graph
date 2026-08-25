import {
  type CascadeRow,
  type EdgeRow,
  type LegRow,
  type MetaRow,
  mapCascade,
  mapEdge,
  mapLeg,
} from './bundle-graph-records'
import type { BundleSnapshot, CascadeRecord, Edge, Leg } from './bundle-types'
import { nextPayoutAt } from './bundle-marketplace/storage'

export function readMeta(ctx: DurableObjectState): MetaRow | null {
  return ctx.storage.sql.exec<MetaRow>(
    `SELECT bundle_id, principal_id, total_budget_minor, initialization_state, seed_fingerprint
     FROM bundle_meta WHERE initialization_state = 'ready' LIMIT 1`,
  ).toArray()[0] ?? null
}

export function readAnyMeta(ctx: DurableObjectState): MetaRow | null {
  return ctx.storage.sql.exec<MetaRow>(
    `SELECT bundle_id, principal_id, total_budget_minor, initialization_state, seed_fingerprint
     FROM bundle_meta LIMIT 1`,
  ).toArray()[0] ?? null
}

export function readLegs(ctx: DurableObjectState): Leg[] {
  return ctx.storage.sql.exec<LegRow>(
    `SELECT leg_id, principal_id, category, committed_offer_id, committed_amount_minor, last_cascade_id
     FROM legs ORDER BY leg_id`,
  ).toArray().map(mapLeg)
}

export function readEdges(ctx: DurableObjectState): Edge[] {
  return ctx.storage.sql.exec<EdgeRow>(
    'SELECT from_leg_id, to_leg_id FROM edges ORDER BY from_leg_id, to_leg_id',
  ).toArray().map(mapEdge)
}

export function readCascade(ctx: DurableObjectState, cascadeId: string): CascadeRecord | null {
  const row = ctx.storage.sql.exec<CascadeRow>(
    `SELECT cascade_id, event_id, bundle_id, principal_id, changed_leg_id, phase,
     affected_json, prior_legs_json, changes_json, net_amount_minor, outcome_json, started_at, updated_at,
     recovery_attempts, settlement_attempts, next_recovery_at, archive_snapshot_json
     FROM cascades WHERE cascade_id = ?`, cascadeId,
  ).toArray()[0]
  return row ? mapCascade(row) : null
}

export function writeCascade(ctx: DurableObjectState, record: CascadeRecord): void {
  ctx.storage.sql.exec(
    `INSERT INTO cascades (
      cascade_id, event_id, bundle_id, principal_id, changed_leg_id, phase, affected_json,
      prior_legs_json, changes_json, net_amount_minor, outcome_json, started_at, updated_at,
      recovery_attempts, settlement_attempts, next_recovery_at, archive_snapshot_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    record.cascadeId, record.eventId, record.bundleId, record.principalId, record.changedLegId,
    record.phase, JSON.stringify(record.affected), JSON.stringify(record.priorLegs),
    JSON.stringify(record.changes), record.netAmountMinor,
    record.outcome ? JSON.stringify(record.outcome) : null, record.startedAt, record.updatedAt,
    record.recoveryAttempts, record.settlementAttempts, record.nextRecoveryAt,
  )
}

export function updateCascade(
  ctx: DurableObjectState,
  record: CascadeRecord,
  archiveSnapshot?: string | null,
): void {
  const archiveClause = archiveSnapshot === undefined ? '' : ', archive_snapshot_json = ?'
  const values: (string | number | null)[] = [
    record.phase,
    JSON.stringify(record.changes),
    record.netAmountMinor,
    record.outcome ? JSON.stringify(record.outcome) : null,
    record.updatedAt,
    record.recoveryAttempts,
    record.settlementAttempts,
    record.nextRecoveryAt,
  ]
  if (archiveSnapshot !== undefined) values.push(archiveSnapshot)
  values.push(record.cascadeId)
  ctx.storage.sql.exec(
    `UPDATE cascades SET phase = ?, changes_json = ?, net_amount_minor = ?, outcome_json = ?,
     updated_at = ?, recovery_attempts = ?, settlement_attempts = ?, next_recovery_at = ?${archiveClause}
     WHERE cascade_id = ?`,
    ...values,
  )
}

export function insertLegRow(ctx: DurableObjectState, leg: Leg): void {
  ctx.storage.sql.exec(
    `INSERT INTO legs (
      leg_id, principal_id, category, committed_offer_id, committed_amount_minor, last_cascade_id
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    leg.legId, leg.principalId, leg.category, leg.committedOfferId,
    leg.committedAmountMinor, leg.lastCascadeId,
  )
}

export function restoreLeg(ctx: DurableObjectState, leg: Leg): void {
  ctx.storage.sql.exec(
    `UPDATE legs SET principal_id = ?, category = ?, committed_offer_id = ?,
     committed_amount_minor = ?, last_cascade_id = ? WHERE leg_id = ?`,
    leg.principalId, leg.category, leg.committedOfferId,
    leg.committedAmountMinor, leg.lastCascadeId, leg.legId,
  )
}

export function readTopology(ctx: DurableObjectState): readonly string[] {
  return Object.freeze(ctx.storage.sql.exec<{ leg_id: string }>(
    'SELECT leg_id FROM topology ORDER BY position',
  ).toArray().map((row) => row.leg_id))
}

export function projectBundleSnapshot(snapshot: BundleSnapshot, record: CascadeRecord): BundleSnapshot {
  const changes = new Map(record.changes.map((change) => [change.legId, change]))
  return Object.freeze({
    ...snapshot,
    legs: Object.freeze(snapshot.legs.map((leg) => {
      const change = changes.get(leg.legId)
      return change ? Object.freeze({
        ...leg, committedOfferId: change.newOfferId, committedAmountMinor: change.newAmountMinor,
        lastCascadeId: record.cascadeId,
      }) : leg
    })),
  })
}

export function replaceTopology(ctx: DurableObjectState, order: readonly string[]): void {
  ctx.storage.sql.exec('DELETE FROM topology')
  order.forEach((legId, position) => {
    ctx.storage.sql.exec('INSERT INTO topology (position, leg_id) VALUES (?, ?)', position, legId)
  })
}

export function readRecoveryCandidate(ctx: DurableObjectState, now: number): CascadeRecord | null {
  const row = ctx.storage.sql.exec<CascadeRow>(
    `SELECT cascade_id, event_id, bundle_id, principal_id, changed_leg_id, phase,
     affected_json, prior_legs_json, changes_json, net_amount_minor, outcome_json, started_at, updated_at,
     recovery_attempts, settlement_attempts, next_recovery_at, archive_snapshot_json
     FROM cascades WHERE next_recovery_at IS NOT NULL AND next_recovery_at <= ?
     ORDER BY next_recovery_at, cascade_id LIMIT 1`, now,
  ).toArray()[0]
  return row ? mapCascade(row) : null
}

export async function scheduleNextAlarm(ctx: DurableObjectState): Promise<void> {
  const next = ctx.storage.sql.exec<{ next_recovery_at: number | null }>(
    'SELECT MIN(next_recovery_at) AS next_recovery_at FROM cascades WHERE next_recovery_at IS NOT NULL',
  ).one().next_recovery_at
  const payout = nextPayoutAt(ctx)
  const due = next == null ? payout : payout == null ? next : Math.min(next, payout)
  if (due == null) await ctx.storage.deleteAlarm()
  else await ctx.storage.setAlarm(due)
}
