import { cloneCanonicalGameOsValue, deepFreezeGameOsValue } from './canonical.js'
import { exactRecord, exactSafeInteger, exactText } from './schema.js'

export const GAME_OS_AUTHORING_COST_STATUS_SCHEMA = 'knowgrph.game-os-authoring-cost-status/v1' as const

export type GameOsAuthoringCostRecord = {
  model: string
  prompt_tokens: number
  completion_tokens: number
  cache_hits: number
  estimated_cost_usd: number
  incomplete: boolean
}

export type GameOsAuthoringCostStatus = Readonly<{
  schema: typeof GAME_OS_AUTHORING_COST_STATUS_SCHEMA
  source: 'authoring'
  runId: string
  attemptedCostRecordCount: number
  observedCostRecordCount: number
  costEvidence: 'observed' | 'gap'
  costRecords: readonly GameOsAuthoringCostRecord[]
  gaps: readonly string[]
}>

export type GameOsAuthoringCostStatusSource =
  () => GameOsAuthoringCostStatus | null | Promise<GameOsAuthoringCostStatus | null>

export const createGameOsAuthoringCostStatus = (args: {
  runId: string
  attempted: number
  observed: number
  costEvidence: 'observed' | 'gap'
  costRecords: readonly GameOsAuthoringCostRecord[]
  gaps: readonly string[]
}): GameOsAuthoringCostStatus => normalizeGameOsAuthoringCostStatus({
  schema: GAME_OS_AUTHORING_COST_STATUS_SCHEMA,
  source: 'authoring',
  runId: args.runId,
  attemptedCostRecordCount: args.attempted,
  observedCostRecordCount: args.observed,
  costEvidence: args.costEvidence,
  costRecords: cloneCanonicalGameOsValue(args.costRecords),
  gaps: [...args.gaps],
})

const nonNegativeNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative finite number.`)
  }
  return value
}

const normalizeCostRecord = (value: unknown, index: number): GameOsAuthoringCostRecord => {
  const record = exactRecord(value, [
    'model', 'prompt_tokens', 'completion_tokens', 'cache_hits', 'estimated_cost_usd', 'incomplete',
  ], `authoring cost record ${index}`)
  if (typeof record.incomplete !== 'boolean') throw new Error('Authoring cost incomplete must be boolean.')
  return {
    model: exactText(record.model, 'model'),
    prompt_tokens: exactSafeInteger(record.prompt_tokens, 'prompt_tokens', 0),
    completion_tokens: exactSafeInteger(record.completion_tokens, 'completion_tokens', 0),
    cache_hits: exactSafeInteger(record.cache_hits, 'cache_hits', 0),
    estimated_cost_usd: nonNegativeNumber(record.estimated_cost_usd, 'estimated_cost_usd'),
    incomplete: record.incomplete,
  }
}

export const normalizeGameOsAuthoringCostStatus = (value: unknown): GameOsAuthoringCostStatus => {
  const status = exactRecord(value, [
    'schema', 'source', 'runId', 'attemptedCostRecordCount', 'observedCostRecordCount',
    'costEvidence', 'costRecords', 'gaps',
  ], 'authoring cost status')
  if (status.schema !== GAME_OS_AUTHORING_COST_STATUS_SCHEMA || status.source !== 'authoring') {
    throw new Error('Authoring cost status identity is invalid.')
  }
  if (status.costEvidence !== 'observed' && status.costEvidence !== 'gap') {
    throw new Error('Authoring cost evidence state is invalid.')
  }
  if (!Array.isArray(status.costRecords) || status.costRecords.length > 3 || !Array.isArray(status.gaps)) {
    throw new Error('Authoring cost status collections are invalid.')
  }
  const normalized = {
    schema: GAME_OS_AUTHORING_COST_STATUS_SCHEMA,
    source: 'authoring' as const,
    runId: exactText(status.runId, 'runId'),
    attemptedCostRecordCount: exactSafeInteger(status.attemptedCostRecordCount, 'attemptedCostRecordCount', 0),
    observedCostRecordCount: exactSafeInteger(status.observedCostRecordCount, 'observedCostRecordCount', 0),
    costEvidence: status.costEvidence,
    costRecords: status.costRecords.map(normalizeCostRecord),
    gaps: status.gaps.map((gap, index) => exactText(gap, `gaps[${index}]`)),
  }
  const evidenceComplete = normalized.attemptedCostRecordCount > 0
    && normalized.observedCostRecordCount === normalized.attemptedCostRecordCount
    && normalized.costRecords.every(record => !record.incomplete)
    && normalized.gaps.length === 0
  if (normalized.observedCostRecordCount > normalized.attemptedCostRecordCount
    || normalized.attemptedCostRecordCount !== normalized.costRecords.length
    || (normalized.costEvidence === 'observed') !== evidenceComplete) {
    throw new Error('Authoring cost status counts are inconsistent.')
  }
  return deepFreezeGameOsValue(normalized) as GameOsAuthoringCostStatus
}
