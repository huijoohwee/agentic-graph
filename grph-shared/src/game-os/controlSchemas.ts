import {
  GAME_OS_OPERATIONS,
  formatCanonicalGameOsInvocation,
  type GameOsOperation,
} from './invocation.js'
import { GAME_OS_OPERATION_RESULT_SCHEMA, GAME_OS_STATUS_SCHEMA } from './types.js'

type JsonSchema = Record<string, unknown>

const SAFE_INTEGER_SCHEMA = Object.freeze({
  type: 'integer',
  minimum: Number.MIN_SAFE_INTEGER,
  maximum: Number.MAX_SAFE_INTEGER,
})

const POSITIVE_SAFE_INTEGER_SCHEMA = Object.freeze({
  type: 'integer',
  minimum: 1,
  maximum: Number.MAX_SAFE_INTEGER,
})

const NON_NEGATIVE_SAFE_INTEGER_SCHEMA = Object.freeze({
  type: 'integer',
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
})

const NORMALIZED_TEXT_SCHEMA = Object.freeze({
  type: 'string',
  minLength: 1,
  pattern: '^\\S(?:[\\s\\S]*\\S)?$',
})

const DIGEST_SCHEMA = Object.freeze({
  type: 'string',
  pattern: '^fnv1a32:[0-9a-f]{8}$',
})

const SEED_SCHEMA = Object.freeze({
  anyOf: [NORMALIZED_TEXT_SCHEMA, SAFE_INTEGER_SCHEMA],
})

const MOVE_ORDER_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['type', 'sequence', 'factionId', 'unitId', 'targetTerritoryId'],
  properties: {
    type: { const: 'move-unit' },
    sequence: POSITIVE_SAFE_INTEGER_SCHEMA,
    factionId: NORMALIZED_TEXT_SCHEMA,
    unitId: NORMALIZED_TEXT_SCHEMA,
    targetTerritoryId: NORMALIZED_TEXT_SCHEMA,
  },
})

const CLAIM_ORDER_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['type', 'sequence', 'factionId', 'unitId', 'territoryId'],
  properties: {
    type: { const: 'claim-territory' },
    sequence: POSITIVE_SAFE_INTEGER_SCHEMA,
    factionId: NORMALIZED_TEXT_SCHEMA,
    unitId: NORMALIZED_TEXT_SCHEMA,
    territoryId: NORMALIZED_TEXT_SCHEMA,
  },
})

const ORDERS_SCHEMA = Object.freeze({
  type: 'array',
  minItems: 1,
  items: { oneOf: [MOVE_ORDER_SCHEMA, CLAIM_ORDER_SCHEMA] },
})

const operationProperties = (operation: GameOsOperation): Record<string, JsonSchema> => {
  if (operation === 'open' || operation === 'resume' || operation === 'reset') {
    return { seed: SEED_SCHEMA }
  }
  if (operation === 'order') return { orders: ORDERS_SCHEMA }
  return {}
}

const inputBranch = (
  selector: 'invocation' | 'operation',
  operation: GameOsOperation,
): JsonSchema => {
  const operationSpecific = operationProperties(operation)
  const properties = {
    [selector]: selector === 'invocation'
      ? { const: formatCanonicalGameOsInvocation(operation) }
      : { const: operation },
    playerActionConfirmed: { const: true },
    worldId: NORMALIZED_TEXT_SCHEMA,
    ...operationSpecific,
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  }
}

export const GAME_OS_CONTROL_INPUT_SCHEMA = Object.freeze({
  type: 'object',
  oneOf: [{
    title: 'native invocation',
    oneOf: GAME_OS_OPERATIONS.map(operation => inputBranch('invocation', operation)),
  }, {
    title: 'operation',
    oneOf: GAME_OS_OPERATIONS.map(operation => inputBranch('operation', operation)),
  }],
})

const STATUS_VIEWS = [
  'registered_modes',
  'world_continuity',
  'lease_state',
  'determinism_digest',
  'cost_summary',
] as const

const statusInputBranch = (view: typeof STATUS_VIEWS[number]): JsonSchema => {
  const properties = {
    view: { const: view },
    ...(view === 'registered_modes' ? {} : { worldId: NORMALIZED_TEXT_SCHEMA }),
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  }
}

export const GAME_OS_INSPECT_INPUT_SCHEMA = Object.freeze({
  type: 'object',
  oneOf: STATUS_VIEWS.map(statusInputBranch),
})

const COST_RECORD_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['model', 'prompt_tokens', 'completion_tokens', 'cache_hits',
    'estimated_cost_usd', 'incomplete'],
  properties: {
    model: { type: 'null' },
    prompt_tokens: { const: 0 },
    completion_tokens: { const: 0 },
    cache_hits: { const: 0 },
    estimated_cost_usd: { const: 0 },
    incomplete: { const: false },
  },
})

const PROJECTION_GAP_SCHEMA = Object.freeze({
  oneOf: [{ type: 'null' }, {
    type: 'object',
    additionalProperties: false,
    required: ['code', 'tick', 'digest', 'reason'],
    properties: {
      code: { const: 'surface_unavailable' },
      tick: NON_NEGATIVE_SAFE_INTEGER_SCHEMA,
      digest: DIGEST_SCHEMA,
      reason: NORMALIZED_TEXT_SCHEMA,
    },
  }],
})

const STATUS_BY_OPERATION: Record<GameOsOperation, string> = {
  open: 'opened',
  resume: 'resumed',
  order: 'order-queued',
  commit: 'committed',
  reset: 'reset',
  close: 'closed',
}

const outputBranch = (operation: GameOsOperation): JsonSchema => {
  const properties = {
    schema: { const: GAME_OS_OPERATION_RESULT_SCHEMA },
    operation: { const: operation },
    worldId: NORMALIZED_TEXT_SCHEMA,
    status: { const: STATUS_BY_OPERATION[operation] },
    tick: NON_NEGATIVE_SAFE_INTEGER_SCHEMA,
    digest: DIGEST_SCHEMA,
    pendingOrderCount: NON_NEGATIVE_SAFE_INTEGER_SCHEMA,
    projectionGap: PROJECTION_GAP_SCHEMA,
    costRecord: COST_RECORD_SCHEMA,
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  }
}

export const GAME_OS_CONTROL_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  oneOf: GAME_OS_OPERATIONS.map(outputBranch),
})

const exactObject = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})

const REGISTERED_MODE_ENTRY_SCHEMA = exactObject({
  identity: NORMALIZED_TEXT_SCHEMA,
  worldSchema: NORMALIZED_TEXT_SCHEMA,
  persistence: {
    type: 'object',
    oneOf: [
      exactObject({ continuity: { const: 'required' }, lease: { const: 'single-writer' } }),
      exactObject({ continuity: { const: 'none' }, lease: { const: 'none' } }),
    ],
  },
  overlayKind: NORMALIZED_TEXT_SCHEMA,
  active: { type: 'boolean' },
})

const WORLD_CONTINUITY_ENTRY_SCHEMA = exactObject({
  worldId: NORMALIZED_TEXT_SCHEMA,
  restoredTick: NON_NEGATIVE_SAFE_INTEGER_SCHEMA,
  matchedDigest: DIGEST_SCHEMA,
  journalLength: NON_NEGATIVE_SAFE_INTEGER_SCHEMA,
  acceptedOrderCount: NON_NEGATIVE_SAFE_INTEGER_SCHEMA,
  pendingOrderCount: NON_NEGATIVE_SAFE_INTEGER_SCHEMA,
  snapshotCount: NON_NEGATIVE_SAFE_INTEGER_SCHEMA,
  snapshotTick: NON_NEGATIVE_SAFE_INTEGER_SCHEMA,
  replaySpan: NON_NEGATIVE_SAFE_INTEGER_SCHEMA,
})

const LEASE_STATE_ENTRY_SCHEMA = {
  oneOf: [
    exactObject({
      worldId: NORMALIZED_TEXT_SCHEMA,
      state: { const: 'unleased' },
    }),
    exactObject({
      worldId: NORMALIZED_TEXT_SCHEMA,
      sessionId: NORMALIZED_TEXT_SCHEMA,
      epoch: POSITIVE_SAFE_INTEGER_SCHEMA,
      expiresAtMs: POSITIVE_SAFE_INTEGER_SCHEMA,
      state: { enum: ['active', 'expired'] },
    }),
  ],
}

const DETERMINISM_ENTRY_SCHEMA = exactObject({
  worldId: NORMALIZED_TEXT_SCHEMA,
  tick: NON_NEGATIVE_SAFE_INTEGER_SCHEMA,
  digest: DIGEST_SCHEMA,
})

const COST_SUMMARY_ENTRY_SCHEMA = {
  oneOf: [
    exactObject({
      source: { const: 'play' },
      worldId: NORMALIZED_TEXT_SCHEMA,
      fixedStepCount: NON_NEGATIVE_SAFE_INTEGER_SCHEMA,
      model: { type: 'null' },
      prompt_tokens: { const: 0 },
      completion_tokens: { const: 0 },
      cache_hits: { const: 0 },
      estimated_cost_usd: { const: 0 },
    }),
    exactObject({
      schema: { const: 'agenticgraph.game-os-authoring-cost-status/v1' },
      source: { const: 'authoring' },
      runId: NORMALIZED_TEXT_SCHEMA,
      attemptedCostRecordCount: NON_NEGATIVE_SAFE_INTEGER_SCHEMA,
      observedCostRecordCount: NON_NEGATIVE_SAFE_INTEGER_SCHEMA,
      costEvidence: { enum: ['observed', 'gap'] },
      costRecords: { type: 'array', maxItems: 3, items: exactObject({
        model: NORMALIZED_TEXT_SCHEMA,
        prompt_tokens: NON_NEGATIVE_SAFE_INTEGER_SCHEMA,
        completion_tokens: NON_NEGATIVE_SAFE_INTEGER_SCHEMA,
        cache_hits: NON_NEGATIVE_SAFE_INTEGER_SCHEMA,
        estimated_cost_usd: { type: 'number', minimum: 0 },
        incomplete: { type: 'boolean' },
      }) },
      gaps: { type: 'array', items: NORMALIZED_TEXT_SCHEMA },
    }),
  ],
}

const STATUS_ENTRY_SCHEMAS: Record<typeof STATUS_VIEWS[number], JsonSchema> = {
  registered_modes: REGISTERED_MODE_ENTRY_SCHEMA,
  world_continuity: WORLD_CONTINUITY_ENTRY_SCHEMA,
  lease_state: LEASE_STATE_ENTRY_SCHEMA,
  determinism_digest: DETERMINISM_ENTRY_SCHEMA,
  cost_summary: COST_SUMMARY_ENTRY_SCHEMA,
}

const statusOutputBranch = (view: typeof STATUS_VIEWS[number]): JsonSchema => exactObject({
  schema: { const: GAME_OS_STATUS_SCHEMA },
  view: { const: view },
  entries: { type: 'array', items: STATUS_ENTRY_SCHEMAS[view] },
  unavailableSources: { type: 'array', items: NORMALIZED_TEXT_SCHEMA },
  costRecord: COST_RECORD_SCHEMA,
})

export const GAME_OS_INSPECT_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  oneOf: STATUS_VIEWS.map(statusOutputBranch),
})
