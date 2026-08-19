export type Brand<Value, Name extends string> = Value & { readonly __brand: Name }

export type BundleId = Brand<string, 'BundleId'>
export type LegId = Brand<string, 'LegId'>
export type OfferId = Brand<string, 'OfferId'>
export type PrincipalId = Brand<string, 'PrincipalId'>
export type HoldId = Brand<string, 'HoldId'>
export type CascadeId = Brand<string, 'CascadeId'>
export type EventId = Brand<string, 'EventId'>
export type SnapshotId = Brand<string, 'SnapshotId'>
export type ModelId = Brand<string, 'ModelId'>
export type MinorUnits = Brand<number, 'MinorUnits'>

export interface LegRow {
  readonly legId: LegId
  readonly principalId: PrincipalId
  readonly category: string
  readonly committedOfferId: OfferId | null
  readonly committedAmountMinor: MinorUnits | null
  readonly lastCascadeId: CascadeId | null
}

export interface EdgeRow {
  readonly fromLegId: LegId
  readonly toLegId: LegId
}

export type RejectReason =
  | 'unknown-leg'
  | 'cyclic-dependency'
  | 'store-unavailable'
  | 'bundle-unavailable'
  | 'bundle-busy'
  | 'bundle-malformed'
  | 'envelope-unavailable'
  | 'requote-malformed'
  | 'cross-principal-bundle'
  | 'duplicate-leg'
  | 'duplicate-edge'
  | 'scale-boundary-legs'
  | 'scale-boundary-edges'
  | 'archive-immutable'
  | 'storage-placement'
  | 'license-excluded'
  | 'license-configuration-unavailable'

export type RollbackReason =
  | 'requote-rejected'
  | 'requote-missing'
  | 'requote-malformed'
  | 'cascade-timeout'
  | 'insufficient-envelope'
  | 'settlement-definitively-rejected'

export type HoldState = 'reserved' | 'quarantined' | 'committed' | 'released'

type HoldBase = Readonly<{
  holdId: HoldId
  cascadeId: CascadeId
  bundleId: BundleId
  legId: LegId
  offerId: OfferId
  amountMinor: MinorUnits
  targetAmountMinor: MinorUnits
  priorHoldId: HoldId | null
  expiresAt: number
}>

export type Hold =
  | (HoldBase & Readonly<{
    state: 'reserved' | 'quarantined'
    transitionTarget: 'committed' | 'released'
  }>)
  | (HoldBase & Readonly<{
    state: 'committed' | 'released'
    transitionTarget?: never
  }>)

export type ReserveResult =
  | Readonly<{
    kind: 'reserved' | 'idempotent'
    holds: readonly Hold[]
    availableAfterMinor: MinorUnits
    reservedDeltaMinor: MinorUnits
  }>
  | Readonly<{
    kind: 'rejected'
    reason: 'insufficient-envelope' | 'envelope-unavailable' | 'envelope-malformed'
    holds?: never
  }>

export type CascadeLegChange = Readonly<{
  legId: LegId
  priorOfferId: OfferId | null
  priorAmountMinor: MinorUnits | null
  newOfferId: OfferId
  newAmountMinor: MinorUnits
}>

type CascadeOutcomeBase = Readonly<{
  cascadeId: CascadeId
  bundleId: BundleId
  changedLegId: LegId
  affected: readonly LegId[]
  changes: readonly CascadeLegChange[]
  netAmountMinor: MinorUnits
  elapsedMs: number
}>

export type CascadeOutcome =
  | (CascadeOutcomeBase & Readonly<{
    kind: 'no-op'
    settlementCalls: 0
    reason: 'no-outgoing-edges'
    archiveDeferred: false
    releaseConfirmed?: never
  }>)
  | (CascadeOutcomeBase & Readonly<{
    kind: 'committed'
    settlementCalls: 0 | 1
    reason: null
    archiveDeferred: boolean
    releaseConfirmed?: never
  }>)
  | (CascadeOutcomeBase & Readonly<{
    kind: 'rolled-back'
    settlementCalls: 0
    reason: RollbackReason
    archiveDeferred: false
    releaseConfirmed: true
  }>)
  | (CascadeOutcomeBase & Readonly<{
    kind: 'rejected'
    settlementCalls: 0
    reason: RejectReason
    archiveDeferred: false
    releaseConfirmed?: never
  }>)

export type Leg = Readonly<{
  legId: string
  principalId: string
  category: string
  committedOfferId: string | null
  committedAmountMinor: MinorUnits | null
  lastCascadeId: string | null
}>

export type Edge = Readonly<{ fromLegId: string; toLegId: string }>

export type BundleSeed = Readonly<{
  bundleId: string
  principalId: string
  totalBudgetMinor: MinorUnits
  legs: readonly Leg[]
  edges: readonly Edge[]
}>

export type BundleSnapshot = Readonly<{
  bundleId: string
  principalId: string
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
  amountMinor: MinorUnits
  currency: string
  priceVerification: 'verified' | 'deterministic-demo'
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
  | 'archiving'
  | 'archive_failed'
  | 'reconciliation_required'
  | 'committed'
  | 'rolled_back'
  | 'no_op'
  | 'rejected'

export type LegChange = Readonly<{
  legId: string
  priorOfferId: string | null
  priorAmountMinor: MinorUnits | null
  newOfferId: string
  newAmountMinor: MinorUnits
  currency?: string
  agentId?: string
  priceVerification?: Quote['priceVerification']
  provenance?: Readonly<Record<string, string>>
}>

export type RuntimeCascadeOutcome = Readonly<{
  kind: 'committed' | 'rolled-back' | 'no-op' | 'rejected' | 'reconciliation-required'
  cascadeId: string
  bundleId: string
  changedLegId: string
  affected: readonly string[]
  changes: readonly LegChange[]
  netAmountMinor: MinorUnits
  settlementCalls: number
  reason: string | null
  archiveDeferred: boolean
  releaseConfirmed?: boolean
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
  netAmountMinor: MinorUnits
  outcome: RuntimeCascadeOutcome | null
  startedAt: number
  updatedAt: number
  recoveryAttempts: number
  settlementAttempts: number
  nextRecoveryAt: number | null
}>

export type BeginCascadeResult =
  | Readonly<{ kind: 'plan'; record: CascadeRecord }>
  | Readonly<{ kind: 'resume'; record: CascadeRecord }>
  | Readonly<{ kind: 'terminal'; record: CascadeRecord; outcome: RuntimeCascadeOutcome }>
  | Readonly<{ kind: 'pending'; cascadeId: string; reason: 'bundle-busy' }>

export type Reservation = Readonly<{
  holdId: string
  cascadeId: string
  bundleId: string
  legId: string
  offerId: string
  amountMinor: MinorUnits
  targetAmountMinor: MinorUnits
  priorHoldId: string | null
  state: HoldState
  expiresAt: number
  quarantineReason?: string | null
  quarantinedAt?: number | null
}>

export type ReconciliationDecision = 'commit' | 'release'

export type ReconciliationDecisionInput = Readonly<{
  decisionId: string
  decision: ReconciliationDecision
  operatorId: string
  reason: string
}>

export type ReconciliationDecisionRecord = ReconciliationDecisionInput & Readonly<{
  cascadeId: string
  requestedAt: number
  completedAt: number | null
}>

export type ReconciliationStageResult =
  | Readonly<{ kind: 'staged' | 'idempotent'; decision: ReconciliationDecisionRecord }>
  | Rejection

export type ReconciliationApplyResult =
  | Readonly<{
    kind: 'applied' | 'idempotent'
    decision: ReconciliationDecisionRecord
    record: CascadeRecord
    outcome: RuntimeCascadeOutcome | null
  }>
  | Rejection

export type CommittedPosition = Readonly<{
  bundleId: string
  legId: string
  offerId: string
  amountMinor: MinorUnits
}>

export type CostEntry = Readonly<{
  cascadeId: string
  component: string
  promptTokens: number
  completionTokens: number
  dollarCost: number
  recordedAt: string
}>
