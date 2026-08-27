import {
  GAME_OS_DEFAULT_LEASE_TTL_MS,
  GAME_OS_PERSISTENT_STRATEGY_MODE_IDENTITY,
  GAME_OS_WORLD_SCHEMA,
  GameOsError,
  canonicalGameOsString,
  createGameOsCoreRuntime,
  type GameOsAuthoringCostStatusSource,
  type GameOsContinuityStore,
  type GameOsCoreRuntime,
  type GameOsModeDeclaration,
  type GameOsSession,
  type GameOsSessionProjection,
} from '../../../../grph-shared/src/game-os/index.js'
import {
  createAgenticGraphStorageEnginePersistence,
  type AgenticGraphStorageEnginePersistence,
} from '../../lib/storage/agenticgraphStorageEnginePersistence'

export const GAME_MMORPG_MODE_IDENTITY = GAME_OS_PERSISTENT_STRATEGY_MODE_IDENTITY
export const GAME_MMORPG_DEFAULT_LEASE_TTL_MS = GAME_OS_DEFAULT_LEASE_TTL_MS

const STORAGE_NAMESPACE = 'game-os:world-envelope'

const assertPersistenceAvailable = (
  persistence: AgenticGraphStorageEnginePersistence,
  operation: string,
): void => {
  const state = persistence.persistence.getState()
  if (state.status === 'degraded') {
    throw new GameOsError('store_unavailable', `Game OS persistence ${operation} is unavailable.`, {
      operation,
      persistenceMode: state.mode,
      reason: state.error ?? 'persistence degraded',
    })
  }
}

const usePersistence = async <Value>(
  persistence: AgenticGraphStorageEnginePersistence,
  operation: string,
  run: () => Promise<Value>,
): Promise<Value> => {
  assertPersistenceAvailable(persistence, operation)
  try {
    const value = await run()
    assertPersistenceAvailable(persistence, operation)
    return value
  } catch (error) {
    if (error instanceof GameOsError) throw error
    throw new GameOsError('store_unavailable', `Game OS persistence ${operation} failed.`, {
      operation,
      reason: error instanceof Error ? error.message : String(error),
    })
  }
}

const encodeStorageRecord = (value: Record<string, unknown>): Record<string, unknown> => {
  if (typeof value.revision !== 'string' || !value.revision || value.revision.trim() !== value.revision) {
    throw new GameOsError('input-invalid', 'Persisted Game OS records require a normalized string revision.')
  }
  const revision = value.revision
  return { revision, canonicalRecord: canonicalGameOsString(value) }
}

const decodeStorageRecord = (value: Record<string, unknown> | null): Record<string, unknown> | null => {
  if (!value) return null
  if (typeof value.canonicalRecord !== 'string') return value
  try {
    const decoded = JSON.parse(value.canonicalRecord)
    return decoded && typeof decoded === 'object'
      ? decoded as Record<string, unknown>
      : value
  } catch {
    return value
  }
}

export const createGameMmorpgContinuityStore = (
  persistence: AgenticGraphStorageEnginePersistence,
): GameOsContinuityStore => {
  assertPersistenceAvailable(persistence, 'initialize')
  return {
    async get(worldId) {
      return decodeStorageRecord(await usePersistence(persistence, 'get',
        () => persistence.records.get(STORAGE_NAMESPACE, worldId)))
    },
    async getVersioned(worldId) {
      const stored = await usePersistence(persistence, 'getVersioned',
        () => persistence.records.get(STORAGE_NAMESPACE, worldId))
      if (!stored) return null
      if (typeof stored.revision !== 'string' || !stored.revision
        || stored.revision.trim() !== stored.revision) {
        throw new GameOsError('store_unavailable', 'Persisted Game OS record lacks a store revision.', {
          worldId,
        })
      }
      const revision = stored.revision
      return Object.freeze({ value: decodeStorageRecord(stored)!, revision })
    },
    compareAndPut(worldId, value, expectedRevision) {
      return usePersistence(persistence, 'compareAndPut', () => persistence.records.compareAndPut(
        STORAGE_NAMESPACE, worldId, encodeStorageRecord(value), expectedRevision,
      ))
    },
    compareAndDelete(worldId, expectedRevision) {
      return usePersistence(persistence, 'compareAndDelete', () => persistence.records.compareAndRemove(
        STORAGE_NAMESPACE, worldId, expectedRevision,
      ))
    },
  }
}

export type GameMmorpgSession = GameOsSession
export type GameMmorpgCore = GameOsCoreRuntime & {
  readonly persistence: AgenticGraphStorageEnginePersistence
}

const requiredWorldId = (input: unknown): string => {
  if (!input || typeof input !== 'object') {
    throw new GameOsError('input-invalid', 'Persistent strategy activation requires a worldId.')
  }
  const worldId = (input as { worldId?: unknown }).worldId
  if (typeof worldId !== 'string' || !worldId || worldId.trim() !== worldId) {
    throw new GameOsError('input-invalid', 'Persistent strategy activation requires a worldId.')
  }
  return worldId
}

const createModeDeclaration = (
  onModeExit?: (worldId: string) => void,
): GameOsModeDeclaration => ({
  identity: GAME_MMORPG_MODE_IDENTITY,
  worldSchema: GAME_OS_WORLD_SCHEMA,
  persistence: { continuity: 'required', lease: 'single-writer' },
  surface: { overlayKind: 'gameplay' },
  adaptInput(input) {
    return { worldId: requiredWorldId(input) }
  },
  createOverlay(input) {
    const worldId = requiredWorldId(input)
    return { overlayId: `game-mmorpg:${worldId}`, overlayKind: 'gameplay', state: { worldId } }
  },
  exit(overlay) {
    onModeExit?.(requiredWorldId(overlay.state))
  },
})

const createCore = (args: {
  persistence: AgenticGraphStorageEnginePersistence
  onModeExit?: (worldId: string) => void
  onSessionState?: GameOsSessionProjection
  authoringCostStatus?: GameOsAuthoringCostStatusSource
  closePersistence: boolean
}): GameMmorpgCore => {
  const runtime = createGameOsCoreRuntime({
    store: createGameMmorpgContinuityStore(args.persistence),
    modeDeclaration: createModeDeclaration(args.onModeExit),
    onSessionState: args.onSessionState,
    authoringCostStatus: args.authoringCostStatus,
  })
  let disposed = false
  return {
    ...runtime,
    persistence: args.persistence,
    async dispose() {
      if (disposed) return
      await runtime.dispose()
      if (args.closePersistence) await args.persistence.close()
      disposed = true
    },
  }
}

export const createGameMmorpgCoreFromPersistence = (args: {
  persistence: AgenticGraphStorageEnginePersistence
  onModeExit?: (worldId: string) => void
  onSessionState?: GameOsSessionProjection
  authoringCostStatus?: GameOsAuthoringCostStatusSource
}): GameMmorpgCore => createCore({ ...args, closePersistence: false })

export const createGameMmorpgCore = async (args: {
  databaseName?: string
  forceMemory?: boolean
  onModeExit?: (worldId: string) => void
  onSessionState?: GameOsSessionProjection
  authoringCostStatus?: GameOsAuthoringCostStatusSource
} = {}): Promise<GameMmorpgCore> => {
  const persistence = await createAgenticGraphStorageEnginePersistence({
    databaseName: args.databaseName,
    forceMemory: args.forceMemory,
  })
  return createCore({ ...args, persistence, closePersistence: true })
}
