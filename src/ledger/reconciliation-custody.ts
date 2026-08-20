import type {
  ReconciliationDecisionInput,
  Rejection,
} from '../bundle/bundle-types'
import { isIdentifier } from '../bundle/bundle-runtime'

type CustodyRow = {
  hold_id: string
  bundle_id: string
  leg_id: string
  prior_hold_id: string | null
  state: 'reserved' | 'committed' | 'released'
  quarantined: number
  quarantine_reason: string | null
  reconciliation_decision_id: string | null
  reconciliation_decision: string | null
  reconciliation_operator_id: string | null
  reconciliation_reason: string | null
}

export type QuarantineResult =
  | Readonly<{ kind: 'quarantined' | 'idempotent'; count: number; quarantinedAt: number }>
  | Rejection

export type CustodyResolutionResult =
  | Readonly<{ kind: 'resolved' | 'idempotent'; decision: 'commit' | 'release'; count: number }>
  | Rejection

export function validAuditReason(reason: string): boolean {
  return reason.length >= 1 && reason.length <= 512 && !/[\u0000-\u001f\u007f]/u.test(reason)
}

export function validDecision(input: ReconciliationDecisionInput): boolean {
  return isIdentifier(input.decisionId)
    && (input.decision === 'commit' || input.decision === 'release')
    && isIdentifier(input.operatorId)
    && validAuditReason(input.reason)
}

export function quarantineCascadeHolds(
  ctx: DurableObjectState,
  cascadeId: string,
  reason: string,
  now: number,
): QuarantineResult {
  const holds = readCustody(ctx, cascadeId)
  if (holds.length === 0) return { kind: 'rejected', reason: 'unknown-cascade-holds' }
  if (holds.every((hold) => hold.state === 'reserved' && hold.quarantined === 1)) {
    const first = holds[0]
    if (holds.some((hold) => hold.quarantine_reason !== first.quarantine_reason)) {
      return { kind: 'rejected', reason: 'custody-metadata-conflict' }
    }
    return first.quarantine_reason === reason
      ? { kind: 'idempotent', count: holds.length, quarantinedAt: readQuarantinedAt(ctx, cascadeId) }
      : { kind: 'rejected', reason: 'idempotency-conflict' }
  }
  if (holds.some((hold) => hold.state !== 'reserved' || hold.quarantined !== 0)) {
    return { kind: 'rejected', reason: 'illegal-transition' }
  }
  ctx.storage.sql.exec(
    `UPDATE holds SET quarantined = 1, custody_pending = 0, quarantine_reason = ?, quarantined_at = ?,
     expires_at = ? WHERE cascade_id = ? AND reservation_kind = 'cascade'
     AND state = 'reserved' AND quarantined = 0`,
    reason, now, Number.MAX_SAFE_INTEGER, cascadeId,
  )
  return { kind: 'quarantined', count: holds.length, quarantinedAt: now }
}

export function resolveCascadeCustody(
  ctx: DurableObjectState,
  cascadeId: string,
  input: ReconciliationDecisionInput,
  now: number,
): CustodyResolutionResult {
  const holds = readCustody(ctx, cascadeId)
  if (holds.length === 0) return { kind: 'rejected', reason: 'unknown-cascade-holds' }
  const recorded = holds.filter((hold) => hold.reconciliation_decision_id !== null)
  if (recorded.length > 0) {
    if (recorded.length !== holds.length || recorded.some((hold) => !sameDecision(hold, input))) {
      return { kind: 'rejected', reason: 'idempotency-conflict' }
    }
    const target = input.decision === 'commit' ? 'committed' : 'released'
    return holds.every((hold) => hold.state === target && hold.quarantined === 0)
      ? { kind: 'idempotent', decision: input.decision, count: holds.length }
      : { kind: 'rejected', reason: 'custody-state-conflict' }
  }
  if (input.decision === 'release' && holds.every((hold) => hold.state === 'released')) {
    recordResolution(ctx, cascadeId, input, now)
    return { kind: 'resolved', decision: input.decision, count: holds.length }
  }
  if (holds.some((hold) => hold.state !== 'reserved' || hold.quarantined !== 1)) {
    return { kind: 'rejected', reason: 'custody-not-quarantined' }
  }
  if (input.decision === 'commit') {
    for (const hold of holds) {
      const current = readCommittedPosition(ctx, hold.bundle_id, hold.leg_id)
      if (current !== hold.prior_hold_id) {
        return { kind: 'rejected', reason: 'committed-position-conflict' }
      }
    }
  }
  ctx.storage.transactionSync(() => {
    if (input.decision === 'commit') {
      for (const hold of holds) {
        if (hold.prior_hold_id) {
          ctx.storage.sql.exec(
            "UPDATE holds SET state = 'released' WHERE hold_id = ? AND state = 'committed'",
            hold.prior_hold_id,
          )
        }
      }
      ctx.storage.sql.exec(
        `UPDATE holds SET state = 'committed', amount_minor = target_amount_minor,
         quarantined = 0, custody_pending = 0
         WHERE cascade_id = ? AND reservation_kind = 'cascade'
         AND state = 'reserved' AND quarantined = 1`, cascadeId,
      )
    } else {
      ctx.storage.sql.exec(
        `UPDATE holds SET state = 'released', quarantined = 0, custody_pending = 0
         WHERE cascade_id = ? AND reservation_kind = 'cascade'
         AND state = 'reserved' AND quarantined = 1`, cascadeId,
      )
    }
    recordResolution(ctx, cascadeId, input, now)
  })
  return { kind: 'resolved', decision: input.decision, count: holds.length }
}

function readCustody(ctx: DurableObjectState, cascadeId: string): CustodyRow[] {
  return ctx.storage.sql.exec<CustodyRow>(
    `SELECT hold_id, bundle_id, leg_id, prior_hold_id, state, quarantined, quarantine_reason,
     reconciliation_decision_id, reconciliation_decision, reconciliation_operator_id,
     reconciliation_reason FROM holds WHERE cascade_id = ? AND reservation_kind = 'cascade'
     ORDER BY hold_id`, cascadeId,
  ).toArray()
}

function readQuarantinedAt(ctx: DurableObjectState, cascadeId: string): number {
  return ctx.storage.sql.exec<{ quarantined_at: number }>(
    `SELECT MIN(quarantined_at) AS quarantined_at FROM holds
     WHERE cascade_id = ? AND reservation_kind = 'cascade'`, cascadeId,
  ).one().quarantined_at
}

function readCommittedPosition(ctx: DurableObjectState, bundleId: string, legId: string): string | null {
  return ctx.storage.sql.exec<{ hold_id: string }>(
    `SELECT hold_id FROM holds WHERE bundle_id = ? AND leg_id = ?
     AND reservation_kind = 'cascade' AND state = 'committed'
     ORDER BY rowid DESC LIMIT 1`, bundleId, legId,
  ).toArray()[0]?.hold_id ?? null
}

function recordResolution(
  ctx: DurableObjectState,
  cascadeId: string,
  input: ReconciliationDecisionInput,
  now: number,
): void {
  ctx.storage.sql.exec(
    `UPDATE holds SET reconciliation_decision_id = ?, reconciliation_decision = ?,
     reconciliation_operator_id = ?, reconciliation_reason = ?, reconciled_at = ?
     WHERE cascade_id = ? AND reservation_kind = 'cascade'`,
    input.decisionId, input.decision, input.operatorId, input.reason, now, cascadeId,
  )
}

function sameDecision(hold: CustodyRow, input: ReconciliationDecisionInput): boolean {
  return hold.reconciliation_decision_id === input.decisionId
    && hold.reconciliation_decision === input.decision
    && hold.reconciliation_operator_id === input.operatorId
    && hold.reconciliation_reason === input.reason
}
