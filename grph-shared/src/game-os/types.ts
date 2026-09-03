export const GAME_OS_WORLD_SCHEMA = 'agentic-graph.game-os-world/v1' as const
export const GAME_OS_WORLD_DEFINITION_SCHEMA = 'agentic-graph.game-os-world-definition/v1' as const
export const GAME_OS_CONTINUITY_SCHEMA = 'agentic-graph.game-os-continuity/v1' as const
export const GAME_OS_SNAPSHOT_SCHEMA = 'agentic-graph.game-os-snapshot/v1' as const
export const GAME_OS_JOURNAL_ENTRY_SCHEMA = 'agentic-graph.game-os-journal-entry/v1' as const
export const GAME_OS_ACCEPTED_ORDER_SCHEMA = 'agentic-graph.game-os-accepted-order/v1' as const
export const GAME_OS_LEASE_SCHEMA = 'agentic-graph.game-os-lease/v1' as const
export const GAME_OS_ENVELOPE_SCHEMA = 'agentic-graph.game-os-envelope/v1' as const
export const GAME_OS_STATUS_SCHEMA = 'agentic-graph.game-os-status/v1' as const
export const GAME_OS_OPERATION_RESULT_SCHEMA = 'agentic-graph.game-os-operation-result/v1' as const

export type GameOsJsonPrimitive = string | number | boolean | null
export type GameOsJsonValue =
  | GameOsJsonPrimitive
  | GameOsJsonValue[]
  | { [key: string]: GameOsJsonValue }

export type GameOsCostRecord = Readonly<{
  model: null
  prompt_tokens: 0
  completion_tokens: 0
  cache_hits: 0
  estimated_cost_usd: 0
  incomplete: false
}>

export type GameOsPersistentStrategyWorldDefinition = {
  schema: typeof GAME_OS_WORLD_DEFINITION_SCHEMA
  identity: string
  map: {
    profile: string
    topology: 'ring'
    territoryCount: number
  }
  factions: Array<{
    identity: string
    startingSupply: number
    startingUnits: Array<{
      identity: string
      strength: number
    }>
  }>
  economy: {
    claimSupplyCost: number
    supplyAccrualPerOwnedTerritory: number
  }
  objectives: Array<{
    identity: string
    kind: 'control-territories'
    targetTerritoryCount: number
  }>
}

export const GAME_OS_ZERO_COST_RECORD: GameOsCostRecord = Object.freeze({
  model: null,
  prompt_tokens: 0,
  completion_tokens: 0,
  cache_hits: 0,
  estimated_cost_usd: 0,
  incomplete: false,
})

export type GameOsFaction = {
  id: string
  supply: number
}

export type GameOsTerritory = {
  id: string
  neighborIds: string[]
  ownerFactionId: string | null
}

export type GameOsUnit = {
  id: string
  factionId: string
  territoryId: string
  strength: number
}

export type GameOsWorldState = {
  schema: typeof GAME_OS_WORLD_SCHEMA
  definition: GameOsPersistentStrategyWorldDefinition
  worldId: string
  seed: string
  tick: number
  lastOrderSequence: number
  factions: GameOsFaction[]
  territories: GameOsTerritory[]
  units: GameOsUnit[]
}

export type GameOsMoveUnitOrder = {
  type: 'move-unit'
  sequence: number
  factionId: string
  unitId: string
  targetTerritoryId: string
}

export type GameOsClaimTerritoryOrder = {
  type: 'claim-territory'
  sequence: number
  factionId: string
  unitId: string
  territoryId: string
}

export type GameOsOrder = GameOsMoveUnitOrder | GameOsClaimTerritoryOrder

export type GameOsStepResult = {
  state: GameOsWorldState
  stateDigest: string
  canonicalState: string
  acceptedOrders: GameOsOrder[]
  costRecords: readonly [GameOsCostRecord]
}

export type GameOsContinuitySnapshot = {
  schema: typeof GAME_OS_SNAPSHOT_SCHEMA
  tick: number
  state: GameOsWorldState
  stateDigest: string
}

export type GameOsJournalEntry = {
  schema: typeof GAME_OS_JOURNAL_ENTRY_SCHEMA
  tick: number
  priorStateDigest: string
  resultStateDigest: string
  orders: GameOsOrder[]
  costRecords: readonly [GameOsCostRecord]
}

export type GameOsAcceptedOrderEntry = {
  schema: typeof GAME_OS_ACCEPTED_ORDER_SCHEMA
  ordinal: number
  order: GameOsOrder
}

export type GameOsContinuityRecord = {
  schema: typeof GAME_OS_CONTINUITY_SCHEMA
  worldId: string
  seed: string
  revision: string
  initialStateDigest: string
  committedStateDigest: string
  acceptedOrderJournal: GameOsAcceptedOrderEntry[]
  committedOrderCount: number
  snapshots: GameOsContinuitySnapshot[]
  journal: GameOsJournalEntry[]
}

export type GameOsWorldLease = {
  schema: typeof GAME_OS_LEASE_SCHEMA
  worldId: string
  sessionId: string
  epoch: number
  expiresAtMs: number
  revision: string
}

export type GameOsRestoreReport = {
  worldId: string
  state: GameOsWorldState
  restoredTick: number
  matchedDigest: string
  restoredSnapshotTick: number
  replaySpan: number
  rejectedSnapshotTicks: number[]
  continuity: GameOsContinuityRecord
}

export type GameOsWorldEnvelope = {
  schema: typeof GAME_OS_ENVELOPE_SCHEMA
  worldId: string
  revision: string
  lease: GameOsWorldLease | null
  continuity: GameOsContinuityRecord | null
}

export type GameOsVersionedStoreValue<Value = Record<string, unknown>> = Readonly<{
  value: Value
  revision: string
}>

export type GameOsContinuityStore = {
  get(worldId: string): Promise<Record<string, unknown> | null>
  getVersioned: {
    (worldId: string): Promise<GameOsVersionedStoreValue | null>
    (worldId: string, options: Readonly<{ opaque: true }>): Promise<GameOsVersionedStoreValue<unknown> | null>
  }
  compareAndPut(
    worldId: string,
    value: Record<string, unknown>,
    expectedRevision: string | null,
  ): Promise<boolean>
  compareAndDelete(worldId: string, expectedRevision: string): Promise<boolean>
}

export type GameOsModeRegistrationErrorCode =
  | 'duplicate_identity'
  | 'invalid_declaration'
  | 'surface_unavailable'

export type GameOsContinuityErrorCode =
  | 'lease_lost'
  | 'store_unavailable'
  | 'record_malformed'
  | 'digest_mismatch'

export type GameOsErrorCode =
  | 'asset-not-found'
  | 'asset-provenance-invalid'
  | 'authoring-budget-exceeded'
  | 'authoring-circuit-open'
  | 'authoring-invalid'
  | GameOsModeRegistrationErrorCode
  | GameOsContinuityErrorCode
  | 'input-invalid'
  | 'invocation-invalid'
  | 'order-invalid'
  | 'order-sequence-invalid'

export class GameOsError extends Error {
  readonly code: GameOsErrorCode
  readonly details: Readonly<Record<string, GameOsJsonValue>>

  constructor(
    code: GameOsErrorCode,
    message: string,
    details: Record<string, GameOsJsonValue> = {},
  ) {
    super(message)
    this.name = 'GameOsError'
    this.code = code
    this.details = Object.freeze({ ...details })
  }
}
