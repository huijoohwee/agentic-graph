import { isMinorUnits, isSignedMinorUnits } from './bundle-runtime'
import type {
  CascadePhase,
  CascadeRecord,
  Edge,
  Leg,
  LegChange,
  RuntimeCascadeOutcome,
} from './bundle-types'

export type MetaRow = {
  bundle_id: string
  principal_id: string
  total_budget_minor: number
  initialization_state: 'pending' | 'ready'
  seed_fingerprint: string
}
export type LegRow = {
  leg_id: string
  principal_id: string
  category: string
  committed_offer_id: string | null
  committed_amount_minor: number | null
  last_cascade_id: string | null
}
export type EdgeRow = { from_leg_id: string; to_leg_id: string }
export type CascadeRow = {
  cascade_id: string
  event_id: string
  bundle_id: string
  principal_id: string
  changed_leg_id: string
  phase: CascadePhase
  affected_json: string
  prior_legs_json: string
  changes_json: string
  net_amount_minor: number
  outcome_json: string | null
  started_at: number
  updated_at: number
  recovery_attempts: number
  settlement_attempts: number
  next_recovery_at: number | null
  archive_snapshot_json: string | null
}
export type SettlementClaimRow = { owner: string; expires_at: number }

export function mapLeg(row: LegRow): Leg {
  const committedAmountMinor = readStoredMinorUnits(row.committed_amount_minor)
  return Object.freeze({
    legId: row.leg_id,
    principalId: row.principal_id,
    category: row.category,
    committedOfferId: row.committed_offer_id,
    committedAmountMinor,
    lastCascadeId: row.last_cascade_id,
  })
}

export function mapEdge(row: EdgeRow): Edge {
  return Object.freeze({ fromLegId: row.from_leg_id, toLegId: row.to_leg_id })
}

export function mapCascade(row: CascadeRow): CascadeRecord {
  if (!isSignedMinorUnits(row.net_amount_minor)) throw new Error('stored-money-malformed')
  return Object.freeze({
    cascadeId: row.cascade_id,
    eventId: row.event_id,
    bundleId: row.bundle_id,
    principalId: row.principal_id,
    changedLegId: row.changed_leg_id,
    phase: row.phase,
    affected: Object.freeze(readStoredStrings(row.affected_json)),
    priorLegs: Object.freeze(parseArray(row.prior_legs_json).map(readStoredLeg)),
    changes: Object.freeze(parseArray(row.changes_json).map(readStoredChange)),
    netAmountMinor: row.net_amount_minor,
    outcome: row.outcome_json ? readStoredOutcome(JSON.parse(row.outcome_json)) : null,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    recoveryAttempts: row.recovery_attempts,
    settlementAttempts: row.settlement_attempts,
    nextRecoveryAt: row.next_recovery_at,
  })
}

function parseArray(value: string): unknown[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed)) throw new Error('stored-array-malformed')
  return parsed
}

function readStoredStrings(value: string): string[] {
  const parsed = parseArray(value)
  if (parsed.some((item) => typeof item !== 'string')) throw new Error('stored-array-malformed')
  return parsed as string[]
}

function readStoredMinorUnits(value: number | null): Leg['committedAmountMinor'] {
  if (value === null) return null
  if (!isMinorUnits(value)) throw new Error('stored-money-malformed')
  return value
}

function readStoredLeg(value: unknown): Leg {
  if (!isRecord(value)) throw new Error('stored-leg-malformed')
  const committedAmountMinor = value.committedAmountMinor
  if (committedAmountMinor !== null && !isMinorUnits(committedAmountMinor)) {
    throw new Error('stored-money-malformed')
  }
  return Object.freeze({ ...value, committedAmountMinor }) as Leg
}

function readStoredChange(value: unknown): LegChange {
  if (!isRecord(value)) throw new Error('stored-change-malformed')
  const priorAmountMinor = value.priorAmountMinor
  if (priorAmountMinor !== null && !isMinorUnits(priorAmountMinor)) {
    throw new Error('stored-money-malformed')
  }
  if (!isMinorUnits(value.newAmountMinor)) throw new Error('stored-money-malformed')
  return Object.freeze({ ...value, priorAmountMinor, newAmountMinor: value.newAmountMinor }) as LegChange
}

function readStoredOutcome(value: unknown): RuntimeCascadeOutcome {
  if (!isRecord(value) || !Array.isArray(value.changes) || !isSignedMinorUnits(value.netAmountMinor)) {
    throw new Error('stored-outcome-malformed')
  }
  return Object.freeze({
    ...value,
    changes: Object.freeze(value.changes.map(readStoredChange)),
    netAmountMinor: value.netAmountMinor,
  }) as RuntimeCascadeOutcome
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
