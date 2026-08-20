import { CASCADE_RECOVERY_DELAY_MS, isIdentifier, minorUnits } from './bundle-runtime'
import type {
  CascadeRecord,
  ReconciliationApplyResult,
  ReconciliationDecisionInput,
  ReconciliationDecisionRecord,
  ReconciliationStageResult,
  Rejection,
  RuntimeCascadeOutcome,
} from './bundle-types'
import { appendCostLog, appendSessionLog, broadcast } from './bundle-graph-observability'
import {
  readCascade,
  readEdges,
  readLegs,
  readMeta,
  restoreLeg,
  scheduleNextAlarm,
  updateCascade,
} from './bundle-graph-storage'

type DecisionRow = {
  cascade_id: string
  decision_id: string
  decision: 'commit' | 'release'
  operator_id: string
  reason: string
  requested_at: number
  completed_at: number | null
}

export function requireReconciliationState(
  ctx: DurableObjectState,
  cascadeId: string,
  reason: string,
  now: number,
): RuntimeCascadeOutcome | Rejection {
  const record = readCascade(ctx, cascadeId)
  if (!record) return { kind: 'rejected', reason: 'unknown-cascade' }
  if (record.outcome && !(
    record.outcome.kind === 'rolled-back' && record.outcome.releaseConfirmed !== true
  )) return record.outcome
  const outcome: RuntimeCascadeOutcome = Object.freeze({
    kind: 'reconciliation-required', cascadeId, bundleId: record.bundleId,
    changedLegId: record.changedLegId, affected: record.affected, changes: record.changes,
    netAmountMinor: record.netAmountMinor, settlementCalls: record.settlementAttempts,
    reason, archiveDeferred: false, elapsedMs: Math.max(0, now - record.startedAt),
  })
  const next = Object.freeze({
    ...record, phase: 'reconciliation_required' as const, outcome, updatedAt: now, nextRecoveryAt: null,
  })
  ctx.storage.transactionSync(() => {
    updateCascade(ctx, next)
    ctx.storage.sql.exec('DELETE FROM settlement_claims WHERE cascade_id = ?', cascadeId)
    appendSessionLog(ctx, next, 'settlement-reconciliation-required', reason, now)
  })
  ctx.waitUntil(scheduleNextAlarm(ctx))
  return outcome
}

export function stageReconciliationDecision(
  ctx: DurableObjectState,
  cascadeId: string,
  input: ReconciliationDecisionInput,
  now: number,
): ReconciliationStageResult {
  if (!validDecision(input)) return { kind: 'rejected', reason: 'reconciliation-request-malformed' }
  const existing = readDecision(ctx, cascadeId)
  if (existing) {
    return sameDecision(existing, input)
      ? { kind: 'idempotent', decision: mapDecision(existing) }
      : { kind: 'rejected', reason: 'idempotency-conflict' }
  }
  const reusedId = ctx.storage.sql.exec<{ cascade_id: string }>(
    'SELECT cascade_id FROM reconciliation_decisions WHERE decision_id = ?', input.decisionId,
  ).toArray()[0]
  if (reusedId) return { kind: 'rejected', reason: 'decision-id-conflict' }
  const record = readCascade(ctx, cascadeId)
  if (!record) return { kind: 'rejected', reason: 'unknown-cascade' }
  if (record.phase !== 'reconciliation_required' || record.outcome?.kind !== 'reconciliation-required') {
    return { kind: 'rejected', reason: 'reconciliation-not-required' }
  }
  ctx.storage.transactionSync(() => {
    ctx.storage.sql.exec(
      `INSERT INTO reconciliation_decisions (
       cascade_id, decision_id, decision, operator_id, reason, requested_at, completed_at
       ) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      cascadeId, input.decisionId, input.decision, input.operatorId, input.reason, now,
    )
    appendSessionLog(ctx, record, 'reconciliation-decision-staged', input.reason, now)
  })
  return { kind: 'staged', decision: { cascadeId, ...input, requestedAt: now, completedAt: null } }
}

export function applyReconciliationDecision(
  ctx: DurableObjectState,
  cascadeId: string,
  decisionId: string,
  now: number,
): ReconciliationApplyResult {
  const row = readDecision(ctx, cascadeId)
  if (!row) return { kind: 'rejected', reason: 'reconciliation-decision-unavailable' }
  if (row.decision_id !== decisionId) return { kind: 'rejected', reason: 'idempotency-conflict' }
  const current = readCascade(ctx, cascadeId)
  if (!current) return { kind: 'rejected', reason: 'unknown-cascade' }
  if (row.completed_at !== null) {
    return { kind: 'idempotent', decision: mapDecision(row), record: current, outcome: current.outcome }
  }
  if (current.phase !== 'reconciliation_required' || current.outcome?.kind !== 'reconciliation-required') {
    return { kind: 'rejected', reason: 'reconciliation-state-conflict' }
  }
  const result = row.decision === 'commit'
    ? applyCommit(ctx, current, row, now)
    : applyRelease(ctx, current, row, now)
  ctx.waitUntil(scheduleNextAlarm(ctx))
  return result
}

export function readReconciliationDecision(
  ctx: DurableObjectState,
  cascadeId: string,
): ReconciliationDecisionRecord | null {
  const row = readDecision(ctx, cascadeId)
  return row ? mapDecision(row) : null
}

function applyCommit(
  ctx: DurableObjectState,
  record: CascadeRecord,
  decision: DecisionRow,
  now: number,
): ReconciliationApplyResult {
  const meta = readMeta(ctx)
  if (!meta || meta.bundle_id !== record.bundleId) return { kind: 'rejected', reason: 'store-unavailable' }
  const changes = new Map(record.changes.map((change) => [change.legId, change]))
  const snapshot = Object.freeze({
    bundleId: meta.bundle_id,
    principalId: meta.principal_id,
    legs: Object.freeze(readLegs(ctx).map((leg) => {
      const change = changes.get(leg.legId)
      return change ? Object.freeze({
        ...leg, committedOfferId: change.newOfferId, committedAmountMinor: change.newAmountMinor,
        lastCascadeId: record.cascadeId,
      }) : leg
    })),
    edges: Object.freeze(readEdges(ctx)),
  })
  const next: CascadeRecord = Object.freeze({
    ...record, phase: 'archiving', outcome: null, updatedAt: now,
    nextRecoveryAt: now + CASCADE_RECOVERY_DELAY_MS,
  })
  ctx.storage.transactionSync(() => {
    for (const change of record.changes) {
      ctx.storage.sql.exec(
        `UPDATE legs SET committed_offer_id = ?, committed_amount_minor = ?, last_cascade_id = ?
         WHERE leg_id = ?`,
        change.newOfferId, change.newAmountMinor, record.cascadeId, change.legId,
      )
    }
    updateCascade(ctx, next, JSON.stringify(snapshot))
    completeDecision(ctx, record.cascadeId, now)
    appendSessionLog(ctx, next, 'reconciliation-provider-effect-confirmed', decision.reason, now)
  })
  return { kind: 'applied', decision: mapDecision({ ...decision, completed_at: now }), record: next, outcome: null }
}

function applyRelease(
  ctx: DurableObjectState,
  record: CascadeRecord,
  decision: DecisionRow,
  now: number,
): ReconciliationApplyResult {
  const outcome: RuntimeCascadeOutcome = Object.freeze({
    kind: 'rolled-back', cascadeId: record.cascadeId, bundleId: record.bundleId,
    changedLegId: record.changedLegId, affected: record.affected, changes: record.changes,
    netAmountMinor: minorUnits(0), settlementCalls: record.settlementAttempts,
    reason: `operator-reconciliation-release:${decision.reason}`,
    archiveDeferred: false, releaseConfirmed: true, elapsedMs: Math.max(0, now - record.startedAt),
  })
  const next: CascadeRecord = Object.freeze({
    ...record, phase: 'rolled_back', outcome, updatedAt: now, nextRecoveryAt: null,
  })
  ctx.storage.transactionSync(() => {
    for (const prior of record.priorLegs) restoreLeg(ctx, prior)
    updateCascade(ctx, next)
    completeDecision(ctx, record.cascadeId, now)
    appendCostLog(ctx, record.cascadeId, 'Reopt_Worker', 0, 0, 0, now)
    appendSessionLog(ctx, next, 'reconciliation-no-provider-effect-confirmed', decision.reason, now)
  })
  broadcast(ctx, outcome)
  return { kind: 'applied', decision: mapDecision({ ...decision, completed_at: now }), record: next, outcome }
}

function completeDecision(ctx: DurableObjectState, cascadeId: string, now: number): void {
  ctx.storage.sql.exec(
    'UPDATE reconciliation_decisions SET completed_at = ? WHERE cascade_id = ? AND completed_at IS NULL',
    now, cascadeId,
  )
}

function readDecision(ctx: DurableObjectState, cascadeId: string): DecisionRow | null {
  return ctx.storage.sql.exec<DecisionRow>(
    `SELECT cascade_id, decision_id, decision, operator_id, reason, requested_at, completed_at
     FROM reconciliation_decisions WHERE cascade_id = ?`, cascadeId,
  ).toArray()[0] ?? null
}

function mapDecision(row: DecisionRow): ReconciliationDecisionRecord {
  return Object.freeze({
    cascadeId: row.cascade_id, decisionId: row.decision_id, decision: row.decision,
    operatorId: row.operator_id, reason: row.reason,
    requestedAt: row.requested_at, completedAt: row.completed_at,
  })
}

function sameDecision(row: DecisionRow, input: ReconciliationDecisionInput): boolean {
  return row.decision_id === input.decisionId && row.decision === input.decision
    && row.operator_id === input.operatorId && row.reason === input.reason
}

function validDecision(input: ReconciliationDecisionInput): boolean {
  return isIdentifier(input.decisionId) && isIdentifier(input.operatorId)
    && (input.decision === 'commit' || input.decision === 'release')
    && input.reason.length >= 1 && input.reason.length <= 512
    && !/[\u0000-\u001f\u007f]/u.test(input.reason)
}
