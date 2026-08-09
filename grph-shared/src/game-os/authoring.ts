import {
  canonicalizeGameOsValue,
  cloneCanonicalGameOsValue,
  deepFreezeGameOsValue,
} from './canonical.js'
import {
  createGameOsAuthoringCostStatus,
  type GameOsAuthoringCostRecord,
  type GameOsAuthoringCostStatus,
} from './authoringEvidence.js'
import { GameOsError, type GameOsJsonValue } from './types.js'
export type { GameOsAuthoringCostRecord } from './authoringEvidence.js'
export type GameOsWorldDraftRequest = {
  intent: string
  constraints: string[]
  seedProfile: string
}
export type GameOsWorldDefinition = Record<string, GameOsJsonValue>
export type GameOsAuthoringInvocationBudget = Readonly<{
  maxPromptTokens: number
  maxCompletionTokens: number
  remainingTotalTokens: number
}>
export type GameOsAuthoringCostObservation = Readonly<{
  runId: string
  iteration: number
  idempotencyKey: string
  costRecord: GameOsAuthoringCostRecord
}>
export type GameOsAuthoringTransport = {
  readonly modelId: string
  generate(input: {
    runId: string
    request: GameOsWorldDraftRequest
    iteration: number
    priorValidationIssues: string[]
    tokenBudget: GameOsAuthoringInvocationBudget
  }): Promise<{ definition: unknown; costRecord: GameOsAuthoringCostRecord }>
}
export type GameOsAuthoringResult = {
  runId: string
  definition: GameOsWorldDefinition
  validationReport: {
    valid: boolean
    issues: string[]
    iterations: number
    fallback: null | {
      code:
        | 'iteration-limit'
        | 'schema-circuit-breaker'
        | 'transport-failure'
        | 'budget-exceeded'
        | 'cost-evidence-invalid'
        | 'definition-invalid'
        | 'validator-invalid'
      requiresOperatorReview: true
    }
  }
  costRecords: GameOsAuthoringCostRecord[]
  delivery: GameOsAuthoringDelivery
}
export type GameOsAuthoringDelivery = {
  worldDefinition: 'persisted' | 'gap'
  costEvidence: 'observed' | 'gap'
  gaps: string[]
}

export type GameOsWorldDefinitionStore = {
  save(record: Readonly<{
    runId: string
    disposition: 'candidate-only'
    request: GameOsWorldDraftRequest
    definition: GameOsWorldDefinition
    valid: true
    issues: string[]
    iterations: number
    fallbackCode: string | null
    requiresOperatorReview: true
  }>): void | Promise<void>
}

export type GameOsAuthoringCostObserver = {
  observe(record: GameOsAuthoringCostObservation): void | Promise<void>
}

type GameOsAuthoringCandidate = Omit<GameOsAuthoringResult, 'delivery'>

type GameOsAuthoringFallbackCode = NonNullable<
  GameOsAuthoringResult['validationReport']['fallback']
>['code']

type GameOsCostDeliveryState = {
  attempted: number
  observed: number
  gaps: string[]
}

const NO_IMPROVEMENT_LIMIT = 2

const positiveInteger = (value: unknown, field: string, maximum?: number): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)
    || value < 1 || (maximum != null && value > maximum)) {
    throw new GameOsError('authoring-invalid', `${field} must be an integer from 1 to ${maximum ?? 'infinity'}.`)
  }
  return value
}

const nonNegativeNumber = (value: unknown, field: string, integer = false): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)
    || value < 0 || (integer && !Number.isSafeInteger(value))) {
    throw new GameOsError('authoring-invalid', `${field} must be a non-negative ${integer ? 'integer' : 'number'}.`)
  }
  return value
}

const requiredText = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value || value.trim() !== value) {
    throw new GameOsError('authoring-invalid', `${field} must be a normalized non-empty string.`)
  }
  return value
}

const exactPlainObject = (
  value: unknown,
  expectedKeys: readonly string[],
  field: string,
): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GameOsError('authoring-invalid', `${field} must be a plain object.`)
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new GameOsError('authoring-invalid', `${field} must be a plain object.`)
  }
  const ownKeys = Reflect.ownKeys(value)
  if (ownKeys.some(key => typeof key !== 'string')) {
    throw new GameOsError('authoring-invalid', `${field} fields do not match the declared schema.`)
  }
  const actualKeys = (ownKeys as string[]).sort()
  const sortedExpectedKeys = [...expectedKeys].sort()
  if (actualKeys.length !== sortedExpectedKeys.length
    || actualKeys.some((key, index) => key !== sortedExpectedKeys[index])) {
    throw new GameOsError('authoring-invalid', `${field} fields do not match the declared schema.`)
  }
  return value as Record<string, unknown>
}

const normalizeRequest = (input: GameOsWorldDraftRequest): GameOsWorldDraftRequest => {
  const request = exactPlainObject(input, ['constraints', 'intent', 'seedProfile'], 'WorldDraftRequest')
  const intent = requiredText(request.intent, 'intent')
  const seedProfile = requiredText(request.seedProfile, 'seedProfile')
  if (!Array.isArray(request.constraints)) {
    throw new GameOsError('authoring-invalid', 'constraints must be an array.')
  }
  return deepFreezeGameOsValue({
    intent,
    seedProfile,
    constraints: request.constraints.map((value, index) => requiredText(value, `constraints[${index}]`)),
  }) as GameOsWorldDraftRequest
}

const normalizeCostRecord = (
  input: GameOsAuthoringCostRecord,
  expectedModel: string,
): GameOsAuthoringCostRecord => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new GameOsError('authoring-invalid', 'Cost evidence must be an object.')
  }
  const expectedKeys = [
    'cache_hits', 'completion_tokens', 'estimated_cost_usd',
    'incomplete', 'model', 'prompt_tokens',
  ]
  const actualKeys = Object.keys(input).sort()
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new GameOsError('authoring-invalid', 'Cost evidence fields do not match the declared schema.')
  }
  const model = requiredText(input?.model, 'costRecord.model')
  if (model !== expectedModel) {
    throw new GameOsError('authoring-invalid', 'Cost evidence model does not match the transport identity.')
  }
  if (typeof input.incomplete !== 'boolean') {
    throw new GameOsError('authoring-invalid', 'costRecord.incomplete must be boolean.')
  }
  return deepFreezeGameOsValue({
    model,
    prompt_tokens: nonNegativeNumber(input.prompt_tokens, 'prompt_tokens', true),
    completion_tokens: nonNegativeNumber(input.completion_tokens, 'completion_tokens', true),
    cache_hits: nonNegativeNumber(input.cache_hits, 'cache_hits', true),
    estimated_cost_usd: nonNegativeNumber(input.estimated_cost_usd, 'estimated_cost_usd'),
    incomplete: input.incomplete,
  }) as GameOsAuthoringCostRecord
}

const salvageIncompleteCost = (input: unknown, model: string): GameOsAuthoringCostRecord => {
  const candidate = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Partial<GameOsAuthoringCostRecord>
    : {}
  const integer = (value: unknown): number => typeof value === 'number'
    && Number.isSafeInteger(value) && value >= 0 ? value : 0
  const amount = (value: unknown): number => typeof value === 'number'
    && Number.isFinite(value) && value >= 0 ? value : 0
  return deepFreezeGameOsValue({
    model,
    prompt_tokens: integer(candidate.prompt_tokens),
    completion_tokens: integer(candidate.completion_tokens),
    cache_hits: integer(candidate.cache_hits),
    estimated_cost_usd: amount(candidate.estimated_cost_usd),
    incomplete: true,
  }) as GameOsAuthoringCostRecord
}

const assertCostWithinBudget = (
  record: GameOsAuthoringCostRecord,
  budget: GameOsAuthoringInvocationBudget,
): void => {
  const totalTokens = record.prompt_tokens + record.completion_tokens
  if (!Number.isSafeInteger(totalTokens)
    || record.prompt_tokens > budget.maxPromptTokens
    || record.completion_tokens > budget.maxCompletionTokens
    || totalTokens > budget.remainingTotalTokens) {
    throw new GameOsError('authoring-budget-exceeded', 'Transport exceeded its declared invocation token cap.', {
      tokenBudget: budget as unknown as GameOsJsonValue,
      reportedPromptTokens: record.prompt_tokens,
      reportedCompletionTokens: record.completion_tokens,
    })
  }
}

const incompleteTransportCost = (model: string): GameOsAuthoringCostRecord => ({
  model,
  prompt_tokens: 0,
  completion_tokens: 0,
  cache_hits: 0,
  estimated_cost_usd: 0,
  incomplete: true,
})

const normalizeDefinition = (input: unknown): GameOsWorldDefinition => {
  const canonical = canonicalizeGameOsValue(input)
  if (!canonical || Array.isArray(canonical) || typeof canonical !== 'object') {
    throw new GameOsError('authoring-invalid', 'World definition must be a canonical JSON object.')
  }
  return canonical as GameOsWorldDefinition
}

const normalizeValidationResult = (
  input: unknown,
): { valid: boolean; issues: string[] } => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('validator result must be an object')
  }
  const result = input as { valid?: unknown; issues?: unknown }
  if (typeof result.valid !== 'boolean' || !Array.isArray(result.issues)) {
    throw new Error('validator result must contain boolean valid and string issues[]')
  }
  const issues = result.issues.map((issue, index) =>
    requiredText(issue, `validation.issues[${index}]`))
  if (result.valid !== (issues.length === 0)) {
    throw new Error('validator valid flag disagrees with issues[]')
  }
  return { valid: result.valid, issues }
}

const fallbackResult = (args: {
  runId: string
  definition: GameOsWorldDefinition
  issues: string[]
  iterations: number
  code: GameOsAuthoringFallbackCode
  costRecords: GameOsAuthoringCostRecord[]
}): GameOsAuthoringCandidate => ({
  runId: args.runId,
  definition: args.definition,
  validationReport: {
    valid: false,
    issues: args.issues,
    iterations: args.iterations,
    fallback: { code: args.code, requiresOperatorReview: true },
  },
  costRecords: args.costRecords,
})

let fallbackRunSequence = 0

const defaultRunId = (): string => {
  const randomUuid = globalThis.crypto?.randomUUID
  if (typeof randomUuid === 'function') return randomUuid.call(globalThis.crypto)
  fallbackRunSequence += 1
  return `game-os-authoring-${Date.now()}-${fallbackRunSequence}`
}

export const createGameOsAuthoringAssistHarness = (args: {
  transport: GameOsAuthoringTransport
  validateDefinition(definition: GameOsWorldDefinition): { valid: boolean; issues: string[] }
  worldDefinitionStore?: GameOsWorldDefinitionStore
  costObserver?: GameOsAuthoringCostObserver
  maxIterations?: number
  maxTotalTokens: number
  maxPromptTokensPerCall?: number
  maxCompletionTokensPerCall?: number
  runIdFactory?: () => string
}) => {
  const modelId = requiredText(args.transport?.modelId, 'transport.modelId')
  if (typeof args.transport?.generate !== 'function' || typeof args.validateDefinition !== 'function') {
    throw new GameOsError('authoring-invalid', 'Authoring transport and definition validator are required.')
  }
  const maxIterations = positiveInteger(args.maxIterations ?? 3, 'maxIterations', 3)
  const maxTotalTokens = positiveInteger(args.maxTotalTokens, 'maxTotalTokens')
  const maxPromptTokensPerCall = positiveInteger(
    args.maxPromptTokensPerCall ?? maxTotalTokens,
    'maxPromptTokensPerCall',
  )
  const maxCompletionTokensPerCall = positiveInteger(
    args.maxCompletionTokensPerCall ?? maxTotalTokens,
    'maxCompletionTokensPerCall',
  )
  if (args.runIdFactory != null && typeof args.runIdFactory !== 'function') {
    throw new GameOsError('authoring-invalid', 'runIdFactory must be a function.')
  }
  let lastRun: Readonly<{
    runId: string | null
    iterations: number
    schemaCircuitTripped: boolean
    transportFailed: boolean
  }> = Object.freeze({ runId: null, iterations: 0, schemaCircuitTripped: false, transportFailed: false })
  let lastCostStatus: GameOsAuthoringCostStatus | null = null

  const addCostGap = (state: GameOsCostDeliveryState, gap: string): void => {
    if (!state.gaps.includes(gap)) state.gaps.push(gap)
  }

  const observeCost = async (
    state: GameOsCostDeliveryState,
    runId: string,
    iteration: number,
    costRecord: GameOsAuthoringCostRecord,
  ): Promise<void> => {
    state.attempted += 1
    if (costRecord.incomplete) addCostGap(state, `cost-record-incomplete:${runId}:${iteration}`)
    if (!args.costObserver) {
      addCostGap(state, 'cost-observer-unavailable')
      return
    }
    const observation = deepFreezeGameOsValue({
      runId,
      iteration,
      idempotencyKey: `${runId}:${iteration}`,
      costRecord: cloneCanonicalGameOsValue(costRecord),
    }) as GameOsAuthoringCostObservation
    try {
      await args.costObserver.observe(observation)
      state.observed += 1
    } catch (error) {
      addCostGap(state,
        `cost-observer-failed:${runId}:${iteration}:${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const deliverEvidence = async (
    request: GameOsWorldDraftRequest,
    candidate: GameOsAuthoringCandidate,
    costState: GameOsCostDeliveryState,
    persistDefinition = true,
  ): Promise<GameOsAuthoringDelivery> => {
    const gaps: string[] = []
    let worldDefinition: GameOsAuthoringDelivery['worldDefinition'] = 'gap'
    if (!persistDefinition) {
      gaps.push('world-definition-candidate-unavailable')
    } else if (!args.worldDefinitionStore) {
      gaps.push('world-definition-store-unavailable')
    } else if (!candidate.validationReport.valid) {
      gaps.push('world-definition-validation-failed')
    } else {
      try {
        await args.worldDefinitionStore.save(cloneCanonicalGameOsValue({
          runId: candidate.runId,
          disposition: 'candidate-only',
          request,
          definition: candidate.definition,
          valid: true,
          issues: candidate.validationReport.issues,
          iterations: candidate.validationReport.iterations,
          fallbackCode: candidate.validationReport.fallback?.code ?? null,
          requiresOperatorReview: true,
        }))
        worldDefinition = 'persisted'
      } catch (error) {
        gaps.push(`world-definition-store-failed:${error instanceof Error ? error.message : String(error)}`)
      }
    }
    gaps.push(...costState.gaps)
    const costEvidence: GameOsAuthoringDelivery['costEvidence'] = costState.attempted > 0
      && costState.observed === costState.attempted && costState.gaps.length === 0
      ? 'observed'
      : 'gap'
    return deepFreezeGameOsValue({ worldDefinition, costEvidence, gaps }) as GameOsAuthoringDelivery
  }

  const finalize = async (
    request: GameOsWorldDraftRequest,
    candidate: GameOsAuthoringCandidate,
    costState: GameOsCostDeliveryState,
  ): Promise<GameOsAuthoringResult> => {
    const delivery = await deliverEvidence(request, candidate, costState)
    lastCostStatus = createGameOsAuthoringCostStatus({ runId: candidate.runId,
      attempted: costState.attempted, observed: costState.observed,
      costEvidence: delivery.costEvidence, costRecords: candidate.costRecords, gaps: costState.gaps })
    return deepFreezeGameOsValue({ ...candidate, delivery }) as GameOsAuthoringResult
  }

  return Object.freeze({
    async draft(input: GameOsWorldDraftRequest): Promise<GameOsAuthoringResult> {
      const request = normalizeRequest(input)
      const runId = requiredText((args.runIdFactory ?? defaultRunId)(), 'runId')
      const costRecords: GameOsAuthoringCostRecord[] = []
      const costState: GameOsCostDeliveryState = { attempted: 0, observed: 0, gaps: [] }
      let priorValidationIssues: string[] = []
      let previousIssueCount: number | null = null
      let noImprovementCount = 0
      let totalTokens = 0
      let lastPartial: GameOsWorldDefinition | null = null

      const recordRun = (iteration: number, schemaCircuitTripped = false,
        transportFailed = false): void => {
        lastRun = Object.freeze({ runId, iterations: iteration, schemaCircuitTripped, transportFailed })
      }
      const failWithPartial = async (failure: {
        errorCode: 'authoring-invalid' | 'authoring-budget-exceeded' | 'authoring-circuit-open'
        message: string
        reason: string
        fallbackCode: GameOsAuthoringFallbackCode
        iteration: number
        definition: GameOsWorldDefinition | null
        issues: string[]
      }): Promise<never> => {
        const partial = fallbackResult({ runId, definition: failure.definition ?? {},
          issues: failure.issues, iterations: failure.iteration,
          code: failure.fallbackCode, costRecords })
        const delivery = await deliverEvidence(
          request, partial, costState, failure.definition !== null,
        )
        lastCostStatus = createGameOsAuthoringCostStatus({ runId, attempted: costState.attempted,
          observed: costState.observed, costEvidence: delivery.costEvidence,
          costRecords, gaps: costState.gaps })
        throw new GameOsError(failure.errorCode, failure.message, {
          runId,
          iteration: failure.iteration,
          reason: failure.reason,
          fallbackCode: failure.fallbackCode,
          lastPartialDefinition: failure.definition as unknown as GameOsJsonValue,
          costRecords: cloneCanonicalGameOsValue(costRecords) as unknown as GameOsJsonValue,
          delivery: delivery as unknown as GameOsJsonValue,
        })
      }

      for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
        const remainingTotalTokens = maxTotalTokens - totalTokens
        if (remainingTotalTokens < 1) {
          recordRun(iteration - 1)
          return failWithPartial({ errorCode: 'authoring-budget-exceeded',
            message: 'Authoring token budget is exhausted.',
            reason: 'No token budget remains for another provider call.',
            fallbackCode: 'budget-exceeded', iteration: iteration - 1,
            definition: lastPartial, issues: ['authoring token budget exhausted'] })
        }
        const tokenBudget = deepFreezeGameOsValue({
          maxPromptTokens: Math.min(maxPromptTokensPerCall, remainingTotalTokens),
          maxCompletionTokens: Math.min(maxCompletionTokensPerCall, remainingTotalTokens),
          remainingTotalTokens,
        }) as GameOsAuthoringInvocationBudget
        let generated: Awaited<ReturnType<GameOsAuthoringTransport['generate']>>
        try {
          generated = await args.transport.generate({
            runId,
            request,
            iteration,
            priorValidationIssues: [...priorValidationIssues],
            tokenBudget,
          })
        } catch (error) {
          const incompleteCost = incompleteTransportCost(modelId)
          costRecords.push(incompleteCost)
          await observeCost(costState, runId, iteration, incompleteCost)
          recordRun(iteration, false, true)
          return failWithPartial({ errorCode: 'authoring-invalid',
            message: 'Authoring transport is unavailable.',
            reason: error instanceof Error ? error.message : String(error),
            fallbackCode: 'transport-failure', iteration, definition: lastPartial,
            issues: priorValidationIssues.length ? priorValidationIssues : ['transport unavailable'] })
        }
        const raw = generated as unknown as null | { definition?: unknown; costRecord?: unknown }
        let costRecord: GameOsAuthoringCostRecord
        try {
          costRecord = normalizeCostRecord(raw?.costRecord as GameOsAuthoringCostRecord, modelId)
        } catch (error) {
          const incompleteCost = salvageIncompleteCost(raw?.costRecord, modelId)
          costRecords.push(incompleteCost)
          await observeCost(costState, runId, iteration, incompleteCost)
          let quarantined = lastPartial
          try { quarantined = normalizeDefinition(raw?.definition) } catch { /* retain prior partial */ }
          recordRun(iteration)
          return failWithPartial({ errorCode: 'authoring-invalid',
            message: 'Authoring cost evidence is invalid.',
            reason: error instanceof Error ? error.message : String(error),
            fallbackCode: 'cost-evidence-invalid', iteration, definition: quarantined,
            issues: ['cost evidence is malformed'] })
        }
        costRecords.push(costRecord)
        await observeCost(costState, runId, iteration, costRecord)
        if (costRecord.incomplete) {
          let quarantined = lastPartial
          try { quarantined = normalizeDefinition(raw?.definition) } catch { /* retain prior partial */ }
          recordRun(iteration)
          return failWithPartial({ errorCode: 'authoring-invalid',
            message: 'Authoring cost evidence is incomplete.',
            reason: 'Remaining session token budget cannot be proven from incomplete cost evidence.',
            fallbackCode: 'cost-evidence-invalid', iteration, definition: quarantined,
            issues: ['cost evidence is incomplete'] })
        }
        try {
          assertCostWithinBudget(costRecord, tokenBudget)
        } catch (error) {
          totalTokens += costRecord.prompt_tokens + costRecord.completion_tokens
          let quarantined = lastPartial
          try { quarantined = normalizeDefinition(raw?.definition) } catch { /* retain prior partial */ }
          recordRun(iteration)
          return failWithPartial({ errorCode: 'authoring-budget-exceeded',
            message: 'Authoring transport exceeded its token cap.',
            reason: error instanceof Error ? error.message : String(error),
            fallbackCode: 'budget-exceeded', iteration, definition: quarantined,
            issues: ['transport exceeded the declared token cap'] })
        }
        totalTokens += costRecord.prompt_tokens + costRecord.completion_tokens
        let definition: GameOsWorldDefinition
        try {
          definition = normalizeDefinition(raw?.definition)
        } catch (error) {
          recordRun(iteration)
          return failWithPartial({ errorCode: 'authoring-invalid',
            message: 'Authoring definition is not canonical.',
            reason: error instanceof Error ? error.message : String(error),
            fallbackCode: 'definition-invalid', iteration, definition: lastPartial,
            issues: ['world definition is not canonical JSON'] })
        }
        lastPartial = definition
        let validation: { valid: boolean; issues: string[] }
        try {
          validation = normalizeValidationResult(
            args.validateDefinition(cloneCanonicalGameOsValue(definition)),
          )
        } catch (error) {
          recordRun(iteration)
          return failWithPartial({ errorCode: 'authoring-invalid',
            message: 'Authoring definition validator failed.',
            reason: error instanceof Error ? error.message : String(error),
            fallbackCode: 'validator-invalid', iteration, definition,
            issues: ['definition validator failed'] })
        }
        const issues = validation.issues
        if (validation.valid && issues.length === 0) {
          recordRun(iteration)
          return finalize(request, {
            runId,
            definition,
            validationReport: { valid: true, issues: [], iterations: iteration, fallback: null },
            costRecords,
          }, costState)
        }
        priorValidationIssues = issues
        noImprovementCount = previousIssueCount != null && issues.length >= previousIssueCount
          ? noImprovementCount + 1
          : 0
        previousIssueCount = issues.length
        if (noImprovementCount >= NO_IMPROVEMENT_LIMIT) {
          recordRun(iteration, true)
          return failWithPartial({ errorCode: 'authoring-circuit-open',
            message: 'Authoring schema circuit is open.',
            reason: 'Schema-validation failures did not decrease across two consecutive iterations.',
            fallbackCode: 'schema-circuit-breaker', iteration, definition, issues })
        }
      }
      recordRun(maxIterations)
      return failWithPartial({ errorCode: 'authoring-circuit-open',
        message: 'Authoring iteration limit reached.',
        reason: `Authoring remained invalid after ${maxIterations} iteration(s).`,
        fallbackCode: 'iteration-limit', iteration: maxIterations,
        definition: lastPartial, issues: priorValidationIssues })
    },
    inspect() {
      return Object.freeze({ modelId, maxIterations, maxTotalTokens,
        maxPromptTokensPerCall, maxCompletionTokensPerCall, ...lastRun })
    },
    readCostStatus(): GameOsAuthoringCostStatus | null {
      return lastCostStatus ? cloneCanonicalGameOsValue(lastCostStatus) : null
    },
  })
}
