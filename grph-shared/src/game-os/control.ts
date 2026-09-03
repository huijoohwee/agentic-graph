import { cloneCanonicalGameOsValue, deepFreezeGameOsValue, gameOsDigest } from './canonical.js'
import {
  GAME_OS_OPERATIONS,
  parseGameOsInvocation,
  type GameOsOperation,
} from './invocation.js'
import {
  GAME_OS_CONTROL_INPUT_SCHEMA,
  GAME_OS_CONTROL_OUTPUT_SCHEMA,
  GAME_OS_INSPECT_INPUT_SCHEMA,
  GAME_OS_INSPECT_OUTPUT_SCHEMA,
} from './controlSchemas.js'
import {
  GAME_OS_OPERATION_RESULT_SCHEMA,
  GAME_OS_ZERO_COST_RECORD,
  GameOsError,
  type GameOsCostRecord,
  type GameOsOrder,
  type GameOsPersistentStrategyWorldDefinition,
  type GameOsWorldLease,
  type GameOsWorldState,
} from './types.js'
import type { GameOsCoreRuntime, GameOsProjectionGap, GameOsSession } from './runtime.js'
import {
  DEFAULT_PERSISTENT_STRATEGY_WORLD_DEFINITION,
  normalizePersistentStrategyWorldDefinition,
} from './simulation.js'
import { exactRecord, exactSafeInteger, exactText } from './schema.js'
import { GAME_OS_STATUS_VIEWS, type GameOsStatusResponse, type GameOsStatusView } from './status.js'

export const GAME_OS_INSPECT_TOOL_ID = 'agentic-graph.inspect_game_os' as const
export const GAME_OS_CONTROL_TOOL_ID = 'agentic-graph.control_local_world' as const
export const GAME_OS_TOOL_DEFAULT_LEASE_TTL_MS = 60_000
export const GAME_OS_TOOL_MAX_LEASE_TTL_MS = 300_000

export const GAME_OS_TOOL_DECLARATIONS = deepFreezeGameOsValue([{
  identity: GAME_OS_INSPECT_TOOL_ID,
  name: 'inspect_game_os',
  title: 'Inspect local Game OS',
  description: 'Read one normalized device-local Game OS status view without mutation.',
  mutating: false,
  destructive: false,
  transport: 'embedded-device-local',
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  inputSchema: GAME_OS_INSPECT_INPUT_SCHEMA,
  outputSchema: GAME_OS_INSPECT_OUTPUT_SCHEMA,
}, {
  identity: GAME_OS_CONTROL_TOOL_ID,
  name: 'control_local_world',
  title: 'Control local persistent world',
  description: 'Perform one explicitly confirmed device-local world operation.',
  mutating: true,
  destructive: true,
  transport: 'embedded-device-local',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: GAME_OS_CONTROL_INPUT_SCHEMA,
  outputSchema: GAME_OS_CONTROL_OUTPUT_SCHEMA,
}])

export type GameOsToolIdentity =
  | typeof GAME_OS_INSPECT_TOOL_ID
  | typeof GAME_OS_CONTROL_TOOL_ID

export type GameOsLocalControlRequest = {
  invocation?: string
  operation?: GameOsOperation
  playerActionConfirmed: boolean
  worldId: string
  seed?: string | number
  sessionId?: string
  orders?: readonly GameOsOrder[]
  nowMs?: number
  leaseTtlMs?: number
}

export type GameOsLocalControlOutcome = {
  status: 'opened' | 'resumed' | 'order-queued' | 'committed' | 'reset' | 'closed'
  tick: number | null
  digest: string | null
  pendingOrderCount: number
  projectionGap: GameOsProjectionGap | null
}

export type GameOsReviewedWorldControlRequest = {
  operation: 'open' | 'resume' | 'reset'
  playerActionConfirmed: true
  operatorReviewConfirmed: true
  worldId: string
  seed: string | number
  definition: GameOsPersistentStrategyWorldDefinition
}

export type GameOsOperationResult = GameOsLocalControlOutcome & {
  schema: typeof GAME_OS_OPERATION_RESULT_SCHEMA
  operation: GameOsOperation
  worldId: string
  costRecord: GameOsCostRecord
}

export type GameOsLocalControlHandlers = {
  [Operation in GameOsOperation]: (
    request: GameOsLocalControlRequest & { operation: Operation },
  ) => Promise<GameOsLocalControlOutcome>
}

const operationResult = (
  operation: GameOsOperation,
  worldId: string,
  outcome: GameOsLocalControlOutcome,
): GameOsOperationResult => deepFreezeGameOsValue({
  schema: GAME_OS_OPERATION_RESULT_SCHEMA,
  operation,
  worldId,
  ...outcome,
  costRecord: GAME_OS_ZERO_COST_RECORD,
}) as GameOsOperationResult

const requiredText = (value: unknown, field: string): string => {
  try { return exactText(value, field) } catch {
    throw new GameOsError('input-invalid', `${field} is required.`, { field })
  }
}

const validSeed = (value: unknown): boolean =>
  typeof value === 'string' ? value.length > 0 && value.trim() === value
    : typeof value === 'number' && Number.isSafeInteger(value)

const resolveOperation = (request: GameOsLocalControlRequest): GameOsOperation => {
  const hasInvocation = Object.hasOwn(request, 'invocation')
  const hasOperation = Object.hasOwn(request, 'operation')
  if (hasInvocation === hasOperation) {
    throw new GameOsError(
      'invocation-invalid',
      'Exactly one native invocation or operation field is required.',
    )
  }
  if (hasInvocation) {
    if (typeof request.invocation !== 'string') {
      throw new GameOsError('invocation-invalid', 'Native invocation must be a canonical string.')
    }
    return parseGameOsInvocation(request.invocation).arguments.operation
  }
  if (typeof request.operation !== 'string'
    || !GAME_OS_OPERATIONS.includes(request.operation as GameOsOperation)) {
    throw new GameOsError('invocation-invalid', 'A declared Game OS operation is required.')
  }
  return request.operation as GameOsOperation
}

const validateOperationInput = (
  request: GameOsLocalControlRequest,
  operation: GameOsOperation,
): void => {
  const commonKeys = ['invocation', 'operation', 'playerActionConfirmed', 'worldId', 'nowMs']
  const operationKeys: Record<GameOsOperation, string[]> = {
    open: ['seed', 'sessionId', 'leaseTtlMs'],
    resume: ['seed', 'sessionId', 'leaseTtlMs'],
    order: ['orders'],
    commit: [],
    reset: ['seed', 'sessionId', 'leaseTtlMs'],
    close: [],
  }
  const allowedKeys = new Set([...commonKeys, ...operationKeys[operation]])
  const unknownKey = Object.keys(request).find(key => !allowedKeys.has(key))
  if (unknownKey) {
    throw new GameOsError('input-invalid', `Control operation ${operation} does not accept ${unknownKey}.`, {
      field: unknownKey,
    })
  }
  requiredText(request.worldId, 'worldId')
  if (request.playerActionConfirmed !== true) {
    throw new GameOsError('input-invalid', 'Local world control requires explicit player confirmation.', {
      field: 'playerActionConfirmed',
    })
  }
  if (operation === 'open' || operation === 'resume') {
    if (!validSeed(request.seed)) {
      throw new GameOsError('input-invalid', 'seed is required.', { field: 'seed' })
    }
  }
  if (operation === 'order' && (!Array.isArray(request.orders) || request.orders.length === 0)) {
    throw new GameOsError('input-invalid', 'order requires at least one typed world order.', {
      field: 'orders',
    })
  }
  if (operation === 'reset' && !validSeed(request.seed)) {
    throw new GameOsError('input-invalid', 'seed is required.', { field: 'seed' })
  }
}

export const dispatchGameOsLocalControl = async (
  request: GameOsLocalControlRequest,
  handlers: GameOsLocalControlHandlers,
): Promise<GameOsOperationResult> => {
  const operation = resolveOperation(request)
  validateOperationInput(request, operation)
  const worldId = requiredText(request.worldId, 'worldId')
  const outcome = await handlers[operation]({ ...request, worldId, operation } as never)
  if (!Number.isSafeInteger(outcome.pendingOrderCount) || outcome.pendingOrderCount < 0) {
    throw new GameOsError('input-invalid', 'Control handler returned an invalid pending order count.')
  }
  return operationResult(operation, worldId, outcome)
}

export type GameOsToolInput = Record<string, unknown> | undefined

export type GameOsLocalWorldToolController = {
  readonly declarations: typeof GAME_OS_TOOL_DECLARATIONS
  invoke(
    identity: GameOsToolIdentity,
    input?: GameOsToolInput,
  ): Promise<GameOsStatusResponse | GameOsOperationResult>
  controlReviewedWorld(request: GameOsReviewedWorldControlRequest): Promise<GameOsOperationResult>
  commitOrders(
    worldId: string,
    orders: readonly GameOsOrder[],
    nowMs?: number,
  ): Promise<GameOsWorldState>
  renewActive(nowMs?: number, ttlMs?: number): Promise<GameOsWorldLease>
  dispose(): Promise<void>
}

export type GameOsLocalWorldToolControllerOptions = {
  clock?: () => number
  sessionIdFactory?: () => string
  leaseTtlMs?: number
}

type ActiveWorldContext = {
  worldId: string
  session: GameOsSession
}

const requireToolInput = (input: GameOsToolInput): Record<string, unknown> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new GameOsError('input-invalid', 'Game OS tool input must be an object.')
  }
  return input
}

const normalizeReviewedWorldRequest = (
  input: GameOsReviewedWorldControlRequest,
): GameOsReviewedWorldControlRequest => {
  let request: Record<string, unknown>
  try {
    request = exactRecord(input, ['operation', 'playerActionConfirmed', 'operatorReviewConfirmed',
      'worldId', 'seed', 'definition'], 'reviewed world control request')
  } catch (error) {
    throw new GameOsError('input-invalid', error instanceof Error ? error.message : String(error))
  }
  if (!['open', 'resume', 'reset'].includes(String(request.operation))) {
    throw new GameOsError('input-invalid', 'Reviewed world control supports open, resume, or reset only.')
  }
  if (request.playerActionConfirmed !== true || request.operatorReviewConfirmed !== true) {
    throw new GameOsError('input-invalid', 'Reviewed world control requires player and operator confirmation.')
  }
  if (!validSeed(request.seed)) {
    throw new GameOsError('input-invalid', 'Reviewed world control requires a normalized seed.')
  }
  return deepFreezeGameOsValue({
    operation: request.operation,
    playerActionConfirmed: true,
    operatorReviewConfirmed: true,
    worldId: requiredText(request.worldId, 'worldId'),
    seed: request.seed,
    definition: normalizePersistentStrategyWorldDefinition(
      request.definition as GameOsPersistentStrategyWorldDefinition,
    ),
  }) as GameOsReviewedWorldControlRequest
}

const defaultSessionId = (): string => {
  const cryptoProvider = globalThis.crypto
  if (typeof cryptoProvider?.randomUUID === 'function') return cryptoProvider.randomUUID()
  if (typeof cryptoProvider?.getRandomValues === 'function') {
    const bytes = cryptoProvider.getRandomValues(new Uint8Array(16))
    return `game-os-${Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')}`
  }
  throw new GameOsError('store_unavailable', 'Secure local session identity generation is unavailable.')
}

const boundedLeaseTtl = (value: unknown): number => {
  let ttlMs: number
  try { ttlMs = exactSafeInteger(value, 'leaseTtlMs', 1, GAME_OS_TOOL_MAX_LEASE_TTL_MS) } catch {
    throw new GameOsError(
      'input-invalid',
      `Tool lease TTL must be an integer from 1 to ${GAME_OS_TOOL_MAX_LEASE_TTL_MS}.`,
    )
  }
  return ttlMs
}

export const createGameOsLocalWorldToolController = (
  core: GameOsCoreRuntime,
  options: GameOsLocalWorldToolControllerOptions = {},
): GameOsLocalWorldToolController => {
  const clock = options.clock ?? Date.now
  const sessionIdFactory = options.sessionIdFactory ?? defaultSessionId
  const leaseTtlMs = boundedLeaseTtl(options.leaseTtlMs ?? GAME_OS_TOOL_DEFAULT_LEASE_TTL_MS)
  const readClock = (): number => {
    let nowMs: number
    try { nowMs = exactSafeInteger(clock(), 'nowMs', 1) } catch {
      throw new GameOsError('input-invalid', 'Tool clock must return a positive integer.')
    }
    return nowMs
  }
  const mintSessionId = (): string => requiredText(sessionIdFactory(), 'internal sessionId')
  let active: ActiveWorldContext | null = null
  let mutationTail: Promise<void> = Promise.resolve()
  const serializeMutation = <Result>(operation: () => Promise<Result>): Promise<Result> => {
    const result = mutationTail.then(operation, operation)
    mutationTail = result.then(() => undefined, () => undefined)
    return result
  }
  const requireActive = (worldId: string): ActiveWorldContext => {
    if (!active || active.worldId !== worldId) {
      throw new GameOsError('lease_lost', `World ${worldId} is not open on this tool surface.`, {
        worldId,
      })
    }
    return active
  }
  const isTerminalSessionFailure = (error: unknown): error is GameOsError =>
    error instanceof GameOsError && [
      'lease_lost', 'record_malformed', 'digest_mismatch',
    ].includes(error.code)
  const runActiveSession = async <Result>(
    context: ActiveWorldContext,
    operation: () => Promise<Result>,
    options: { retainStoreUnavailable?: boolean } = {},
  ): Promise<Result> => {
    try {
      return await operation()
    } catch (error) {
      const durableReleaseCompleted = error instanceof GameOsError
        && error.code === 'surface_unavailable'
        && error.details.durableLeaseReleased === true
      const retainRetry = options.retainStoreUnavailable === true
        && error instanceof GameOsError
        && error.code === 'store_unavailable'
      if ((!isTerminalSessionFailure(error) && !durableReleaseCompleted) || retainRetry) throw error
      if (active?.session === context.session) active = null
      try { await context.session.detachLocal() } catch { /* Preserve the primary typed failure. */ }
      throw error
    }
  }
  const openWorld = async (
    request: GameOsLocalControlRequest,
    status: 'opened' | 'resumed',
    definition?: GameOsPersistentStrategyWorldDefinition,
  ): Promise<GameOsLocalControlOutcome> => {
    if (active) {
      throw new GameOsError('surface_unavailable', `World ${active.worldId} already owns the tool surface.`)
    }
    const session = await core.open({
      worldId: request.worldId,
      seed: request.seed as string | number,
      sessionId: mintSessionId(),
      nowMs: request.nowMs,
      leaseTtlMs,
      definition,
    })
    active = { worldId: request.worldId, session }
    const inspected = session.inspect()
    return {
      status,
      tick: inspected.tick,
      digest: inspected.digest,
      pendingOrderCount: inspected.pendingOrderCount,
      projectionGap: inspected.projectionGap,
    }
  }
  const handlers = {
    open: request => openWorld(request, 'opened'),
    resume: request => openWorld(request, 'resumed'),
    async order(request) {
      const context = requireActive(request.worldId)
      const orders = cloneCanonicalGameOsValue(request.orders) as GameOsOrder[]
      const pendingOrderCount = await runActiveSession(
        context,
        () => context.session.acceptOrders(orders, request.nowMs),
      )
      const inspected = context.session.inspect()
      return {
        status: 'order-queued',
        tick: inspected.tick,
        digest: inspected.digest,
        pendingOrderCount,
        projectionGap: inspected.projectionGap,
      }
    },
    async commit(request) {
      const context = requireActive(request.worldId)
      const state = await runActiveSession(
        context,
        () => context.session.commitAcceptedOrders(request.nowMs),
      )
      const inspected = context.session.inspect()
      return {
        status: 'committed',
        tick: state.tick,
        digest: inspected.digest,
        pendingOrderCount: 0,
        projectionGap: inspected.projectionGap,
      }
    },
    async reset(request) {
      const context = active ? requireActive(request.worldId) : null
      if (!context) {
        const resetInput = { worldId: request.worldId, seed: request.seed as string | number,
          sessionId: mintSessionId(), nowMs: request.nowMs }
        let state: GameOsWorldState
        try {
          state = await core.resetWorld(resetInput)
        } catch (error) {
          if (!(error instanceof GameOsError) || !error.details.fallbackDefinitionRequired) throw error
          state = await core.resetWorld({ ...resetInput,
            definition: DEFAULT_PERSISTENT_STRATEGY_WORLD_DEFINITION })
        }
        return {
          status: 'reset',
          tick: state.tick,
          digest: gameOsDigest(state),
          pendingOrderCount: 0,
          projectionGap: null,
        }
      }
      const state = await runActiveSession(
        context,
        () => context.session.reset(request.seed as string | number, request.nowMs),
      )
      const inspected = context.session.inspect()
      return {
        status: 'reset',
        tick: state.tick,
        digest: inspected.digest,
        pendingOrderCount: 0,
        projectionGap: inspected.projectionGap,
      }
    },
    async close(request) {
      const context = requireActive(request.worldId)
      const inspected = context.session.inspect()
      await runActiveSession(context, () => context.session.close(), { retainStoreUnavailable: true })
      active = null
      return {
        status: 'closed',
        tick: inspected.tick,
        digest: inspected.digest,
        pendingOrderCount: inspected.pendingOrderCount,
        projectionGap: inspected.projectionGap,
      }
    },
  } satisfies GameOsLocalControlHandlers

  const inspect = (input: GameOsToolInput): Promise<GameOsStatusResponse> => {
    const request = requireToolInput(input)
    if (typeof request.view !== 'string'
      || !GAME_OS_STATUS_VIEWS.includes(request.view as GameOsStatusView)) {
      throw new GameOsError('input-invalid', 'A declared Game OS status view is required.', {
        field: 'view',
      })
    }
    const view = request.view as GameOsStatusView
    const allowedKeys = view === 'registered_modes' ? ['view'] : ['view', 'worldId']
    const unknownKey = Object.keys(request).find(key => !allowedKeys.includes(key))
    if (unknownKey) {
      throw new GameOsError('input-invalid', `Game OS inspection does not accept ${unknownKey}.`, {
        field: unknownKey,
      })
    }
    const worldId = view === 'registered_modes'
      ? undefined
      : requiredText(request.worldId, 'worldId')
    return core.status(
      view,
      worldId,
      readClock(),
    )
  }
  const control = (input: GameOsToolInput): Promise<GameOsOperationResult> => {
    const request = requireToolInput(input)
    const authorityKey = ['nowMs', 'sessionId', 'leaseTtlMs'].find(key => key in request)
    if (authorityKey) {
      throw new GameOsError('input-invalid', `Tool callers cannot supply ${authorityKey}.`, {
        field: authorityKey,
      })
    }
    return dispatchGameOsLocalControl(
      { ...request, nowMs: readClock() } as GameOsLocalControlRequest,
      handlers,
    )
  }
  const invoke = async (
    identity: GameOsToolIdentity,
    input?: GameOsToolInput,
  ): Promise<GameOsStatusResponse | GameOsOperationResult> => {
    if (identity === GAME_OS_INSPECT_TOOL_ID) return inspect(input)
    if (identity === GAME_OS_CONTROL_TOOL_ID) {
      const admittedInput = input ? cloneCanonicalGameOsValue(input) : input
      return serializeMutation(() => control(admittedInput))
    }
    throw new GameOsError('input-invalid', `Game OS tool ${String(identity)} is not declared.`)
  }
  return Object.freeze({
    declarations: GAME_OS_TOOL_DECLARATIONS,
    invoke,
    controlReviewedWorld(requestValue: GameOsReviewedWorldControlRequest) {
      return serializeMutation(async () => {
        const request = normalizeReviewedWorldRequest(requestValue)
        const nowMs = readClock()
        if (request.operation === 'open' || request.operation === 'resume') {
          const outcome = await openWorld({ operation: request.operation,
            playerActionConfirmed: true, worldId: request.worldId, seed: request.seed, nowMs },
          request.operation === 'open' ? 'opened' : 'resumed', request.definition)
          return operationResult(request.operation, request.worldId, outcome)
        }
        const context = active ? requireActive(request.worldId) : null
        const state = context
          ? await runActiveSession(context,
            () => context.session.reset(request.seed, nowMs, request.definition))
          : await core.resetWorld({ worldId: request.worldId, seed: request.seed,
            sessionId: mintSessionId(), nowMs, definition: request.definition })
        const inspected = context?.session.inspect()
        return operationResult('reset', request.worldId, {
          status: 'reset', tick: state.tick, digest: inspected?.digest ?? gameOsDigest(state),
          pendingOrderCount: 0, projectionGap: inspected?.projectionGap ?? null,
        })
      })
    },
    async commitOrders(worldIdValue, ordersValue, nowMs) {
      const worldId = requiredText(worldIdValue, 'worldId')
      if (!Array.isArray(ordersValue) || ordersValue.length === 0) {
        throw new GameOsError(
          'input-invalid',
          'Host commit requires at least one typed world order.',
          { field: 'orders' },
        )
      }
      const orders = cloneCanonicalGameOsValue(ordersValue) as GameOsOrder[]
      return serializeMutation(async () => {
        const context = requireActive(worldId)
        return runActiveSession(context, () => context.session.step(orders, nowMs))
      })
    },
    renewActive(nowMs, ttlMs) {
      return serializeMutation(async () => {
        if (!active) {
          throw new GameOsError('lease_lost', 'No local world session is open for renewal.')
        }
        const context = active
        return runActiveSession(context, () => context.session.renew(nowMs ?? readClock(), ttlMs))
      })
    },
    dispose() {
      return serializeMutation(async () => {
        if (!active) return
        const context = active
        await runActiveSession(context, () => context.session.close(), { retainStoreUnavailable: true })
        active = null
      })
    },
  })
}
