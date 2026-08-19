export const MAX_BUNDLE_LEGS = 20
export const MAX_BUNDLE_EDGES = 20
export const DEFAULT_CASCADE_WALL_MS = 10_000
export const HOLD_TTL_MS = 120_000

export type Leg = Readonly<{
  legId: string
  principalId: string
  category: string
  committedOfferId: string | null
  committedAmountMinor: number | null
  lastCascadeId: string | null
}>

export type Edge = Readonly<{ fromLegId: string; toLegId: string }>

export type BundleSeed = Readonly<{
  bundleId: string
  principalId: string
  totalBudgetMinor: number
  legs: readonly Leg[]
  edges: readonly Edge[]
}>

export type MutationEvent = Readonly<{
  bundleId: string
  legId: string
  eventId: string
}>

export type Quote = Readonly<{
  kind: 'offer'
  legId: string
  offerId: string
  amountMinor: number
  agentId: string
  promptTokens: number
  completionTokens: number
  dollarCost: number
  provenance: Readonly<Record<string, string>>
}>

export type Rejection = Readonly<{
  kind: 'rejected'
  reason: string
  details?: Readonly<Record<string, string | number | boolean | null>>
}>

export type CascadePhase =
  | 'quoting'
  | 'settlement_pending'
  | 'settling'
  | 'finalizing'
  | 'committed'
  | 'rolled_back'
  | 'no_op'
  | 'rejected'

export type LegChange = Readonly<{
  legId: string
  priorOfferId: string | null
  priorAmountMinor: number | null
  newOfferId: string
  newAmountMinor: number
}>

export type CascadeOutcome = Readonly<{
  kind: 'committed' | 'rolled-back' | 'no-op' | 'rejected'
  cascadeId: string
  bundleId: string
  changedLegId: string
  affected: readonly string[]
  changes: readonly LegChange[]
  netAmountMinor: number
  settlementCalls: number
  reason: string | null
  archiveDeferred: boolean
  elapsedMs: number
}>

export type CascadeRecord = Readonly<{
  cascadeId: string
  eventId: string
  bundleId: string
  principalId: string
  changedLegId: string
  phase: CascadePhase
  affected: readonly string[]
  priorLegs: readonly Leg[]
  changes: readonly LegChange[]
  netAmountMinor: number
  outcome: CascadeOutcome | null
  startedAt: number
  updatedAt: number
}>

export type BeginCascadeResult =
  | Readonly<{ kind: 'plan'; record: CascadeRecord }>
  | Readonly<{ kind: 'resume'; record: CascadeRecord }>
  | Readonly<{ kind: 'terminal'; record: CascadeRecord; outcome: CascadeOutcome }>

export type Reservation = Readonly<{
  holdId: string
  cascadeId: string
  legId: string
  offerId: string
  amountMinor: number
  state: 'reserved' | 'committed' | 'released'
  expiresAt: number
}>

export type CostEntry = Readonly<{
  cascadeId: string
  component: string
  promptTokens: number
  completionTokens: number
  dollarCost: number
  recordedAt: string
}>

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value)
}

export function isMinorUnits(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function readMutationEvent(value: unknown, bundleId: string): MutationEvent | Rejection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return reject('mutation-event-malformed')
  const record = value as Record<string, unknown>
  const legId = record.leg_id
  const eventId = record.event_id
  if (!isIdentifier(bundleId) || !isIdentifier(legId) || !isIdentifier(eventId)) {
    return reject('mutation-event-malformed')
  }
  return Object.freeze({ bundleId, legId, eventId })
}

export function readQuote(value: unknown, expectedLegId: string): Quote | Rejection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return reject('requote-malformed')
  const record = value as Record<string, unknown>
  if (
    record.kind !== 'offer'
    || record.legId !== expectedLegId
    || !isIdentifier(record.offerId)
    || !isIdentifier(record.agentId)
    || !isMinorUnits(record.amountMinor)
  ) return reject('requote-malformed')
  const promptTokens = isMinorUnits(record.promptTokens) ? record.promptTokens : 0
  const completionTokens = isMinorUnits(record.completionTokens) ? record.completionTokens : 0
  const dollarCost = typeof record.dollarCost === 'number' && Number.isFinite(record.dollarCost) && record.dollarCost >= 0
    ? record.dollarCost
    : 0
  const provenance = readStringRecord(record.provenance)
  if (!provenance) return reject('requote-malformed')
  return Object.freeze({
    kind: 'offer', legId: expectedLegId, offerId: record.offerId, amountMinor: record.amountMinor,
    agentId: record.agentId, promptTokens, completionTokens, dollarCost, provenance,
  })
}

export function cascadeIdFor(event: MutationEvent): string {
  return `${event.bundleId}:${event.legId}:${event.eventId}`
}

export function reject(reason: string, details?: Rejection['details']): Rejection {
  return Object.freeze({ kind: 'rejected', reason, ...(details ? { details } : {}) })
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function readStringRecord(value: unknown): Readonly<Record<string, string>> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.some(([key, item]) => !isIdentifier(key) || typeof item !== 'string' || item.length > 1024)) return null
  return Object.freeze(Object.fromEntries(entries) as Record<string, string>)
}
