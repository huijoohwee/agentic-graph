import { GameOsAssetProvenanceGate, type GameOsAssetHandle } from './assets.js'
import type { GameOsAuthoringCostStatusSource } from './authoringEvidence.js'
import {
  acceptGameOsWorldOrders,
  commitGameOsWorldStep,
  commitPendingGameOsWorldOrders,
  explicitlyResetGameOsWorldRecord,
  openGameOsWorld,
  resetGameOsWorld,
} from './continuity.js'
import { gameOsDigest } from './canonical.js'
import { parseGameOsInvocation, type GameOsInvocation } from './invocation.js'
import { releaseGameOsWorldLease, renewGameOsWorldLease } from './lease.js'
import { GameOsModeRegistry, type GameOsModeDeclaration } from './registry.js'
import { readGameOsStatus, type GameOsStatusResponse, type GameOsStatusView } from './status.js'
import {
  GameOsError,
  type GameOsContinuityRecord,
  type GameOsContinuityStore,
  type GameOsOrder,
  type GameOsPersistentStrategyWorldDefinition,
  type GameOsWorldLease,
  type GameOsWorldState,
} from './types.js'

export const GAME_OS_PERSISTENT_STRATEGY_MODE_IDENTITY = 'persistent-strategy-world' as const
export const GAME_OS_DEFAULT_LEASE_TTL_MS = 60_000

export type GameOsProjectionGap = Readonly<{
  code: 'surface_unavailable'
  tick: number
  digest: string
  reason: string
}>

export type GameOsSession = {
  readonly worldId: string
  inspect(): Readonly<{
    state: GameOsWorldState
    tick: number
    digest: string
    revision: string
    pendingOrderCount: number
    lease: GameOsWorldLease
    projectionGap: GameOsProjectionGap | null
  }>
  acceptOrders(orders: readonly GameOsOrder[], nowMs?: number): Promise<number>
  commitAcceptedOrders(nowMs?: number): Promise<GameOsWorldState>
  step(orders: readonly GameOsOrder[], nowMs?: number): Promise<GameOsWorldState>
  renew(nowMs?: number, ttlMs?: number): Promise<GameOsWorldLease>
  reset(seed: string | number, nowMs?: number,
    definition?: GameOsPersistentStrategyWorldDefinition): Promise<GameOsWorldState>
  status(view: GameOsStatusView, nowMs?: number): Promise<GameOsStatusResponse>
  detachLocal(): Promise<void>
  close(): Promise<void>
}

export type GameOsCoreRuntime = {
  readonly registry: GameOsModeRegistry
  open(args: {
    worldId: string
    seed: string | number
    sessionId: string
    nowMs?: number
    leaseTtlMs?: number
    definition?: GameOsPersistentStrategyWorldDefinition
  }): Promise<GameOsSession>
  resetWorld(args: {
    worldId: string
    seed: string | number
    sessionId: string
    nowMs?: number
    definition?: GameOsPersistentStrategyWorldDefinition
  }): Promise<GameOsWorldState>
  status(view: GameOsStatusView, worldId?: string, nowMs?: number): Promise<GameOsStatusResponse>
  parseInvocation(input: string): GameOsInvocation
  resolveAsset(assetRef: string): GameOsAssetHandle
  dispose(): Promise<void>
}

export type GameOsSessionProjection = (
  state: Readonly<GameOsWorldState> | null,
  event: Readonly<{ worldId: string; digest: string; tick: number }>,
) => void | Promise<void>

const now = (value: number | undefined): number => value ?? Date.now()

export const createGameOsCoreRuntime = (args: {
  store: GameOsContinuityStore
  modeDeclaration: GameOsModeDeclaration
  registry?: GameOsModeRegistry
  onSessionState?: GameOsSessionProjection
  authoringCostStatus?: GameOsAuthoringCostStatusSource
}): GameOsCoreRuntime => {
  const registry = args.registry ?? new GameOsModeRegistry()
  const assetGate = new GameOsAssetProvenanceGate()
  const sessions = new Set<GameOsSession>()
  const pendingLeaseCleanups = new Set<() => Promise<void>>()
  let activeSession: GameOsSession | null = null
  let opening = false
  const unregisterMode = registry.registerMode(args.modeDeclaration)
  const releaseOpeningLease = async (lease: GameOsWorldLease): Promise<void> => {
    const cleanup = async (): Promise<void> => {
      try {
        if (!await releaseGameOsWorldLease(args.store, lease)) {
          throw new GameOsError('lease_lost', `World ${lease.worldId} opening lease is no longer releasable.`, {
            worldId: lease.worldId,
          })
        }
        pendingLeaseCleanups.delete(cleanup)
      } catch (error) {
        if (error instanceof GameOsError && error.code === 'store_unavailable') {
          pendingLeaseCleanups.add(cleanup)
        } else {
          pendingLeaseCleanups.delete(cleanup)
        }
        throw error
      }
    }
    await cleanup()
  }
  const projectSessionState = async (state: GameOsWorldState | null, fallback: GameOsWorldState) => {
    if (!args.onSessionState) return
    const projected = state ?? fallback
    try {
      await args.onSessionState(state, Object.freeze({
        worldId: projected.worldId,
        digest: gameOsDigest(projected),
        tick: projected.tick,
      }))
    } catch (error) {
      throw new GameOsError('surface_unavailable', `World ${projected.worldId} visual projection failed.`, {
        worldId: projected.worldId,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const createSession = (
    leaseValue: GameOsWorldLease,
    stateValue: GameOsWorldState,
    continuityValue: GameOsContinuityRecord,
    leaseTtlMs: number,
    overlayId: string,
  ): GameOsSession => {
    let lease = leaseValue
    let state = stateValue
    let continuity = continuityValue
    let closed = false
    let projectionGap: GameOsProjectionGap | null = null
    let mutationTail: Promise<void> = Promise.resolve()
    const ownsSurface = (): boolean => {
      const owner = registry.inspectSurface()
      return owner?.identity === args.modeDeclaration.identity
        && owner.overlay.overlayId === overlayId
    }
    const serialize = <Result>(operation: () => Promise<Result>): Promise<Result> => {
      const result = mutationTail.then(operation, operation)
      mutationTail = result.then(() => undefined, () => undefined)
      return result
    }
    const reconcileProjection = async (): Promise<void> => {
      if (!ownsSurface()) {
        projectionGap = {
          code: 'surface_unavailable', tick: state.tick, digest: gameOsDigest(state),
          reason: `World ${lease.worldId} no longer owns the scene surface.`,
        }
        return
      }
      try {
        await projectSessionState(state, state)
        projectionGap = null
      } catch (error) {
        const typedReason = error instanceof GameOsError && typeof error.details.reason === 'string'
          ? error.details.reason
          : null
        projectionGap = {
          code: 'surface_unavailable', tick: state.tick, digest: gameOsDigest(state),
          reason: typedReason ?? (error instanceof Error ? error.message : String(error)),
        }
      }
    }
    const assertOpen = () => {
      if (closed) throw new GameOsError('lease_lost', `World ${lease.worldId} session is closed.`)
    }
    const detachSession = async (durableLeaseReleased: boolean): Promise<void> => {
      if (closed) return
      closed = true
      sessions.delete(session)
      if (activeSession === session) activeSession = null
      const failures: string[] = []
      const active = registry.inspectSurface()
      if (
        active?.identity === args.modeDeclaration.identity
        && active.overlay.overlayId === overlayId
      ) {
        try {
          registry.deactivate(args.modeDeclaration.identity)
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error))
        }
      }
      try {
        await projectSessionState(null, state)
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error))
      }
      if (failures.length > 0) {
        throw new GameOsError('surface_unavailable', `World ${lease.worldId} session cleanup did not complete.`, {
          worldId: lease.worldId,
          durableLeaseReleased,
          committedTick: state.tick,
          committedDigest: gameOsDigest(state),
          failures,
        })
      }
    }
    const session: GameOsSession = {
      worldId: lease.worldId,
      inspect() {
        assertOpen()
        return Object.freeze({
          state,
          tick: state.tick,
          digest: gameOsDigest(state),
          revision: continuity.revision,
          pendingOrderCount: continuity.acceptedOrderJournal.length - continuity.committedOrderCount,
          lease,
          projectionGap: projectionGap ? Object.freeze({ ...projectionGap }) : null,
        })
      },
      acceptOrders(orders, nowMs) { return serialize(async () => {
        assertOpen()
        const accepted = await acceptGameOsWorldOrders(args.store, {
          lease,
          expectedRevision: continuity.revision,
          orders,
          nowMs: now(nowMs),
        })
        continuity = accepted.continuity
        return accepted.pendingOrderCount
      }) },
      commitAcceptedOrders(nowMs) { return serialize(async () => {
        assertOpen()
        const committed = await commitPendingGameOsWorldOrders(args.store, {
          lease,
          expectedRevision: continuity.revision,
          nowMs: now(nowMs),
        })
        state = committed.step.state
        continuity = committed.continuity
        await reconcileProjection()
        return state
      }) },
      step(orders, nowMs) { return serialize(async () => {
        assertOpen()
        const committed = await commitGameOsWorldStep(args.store, {
          lease,
          expectedRevision: continuity.revision,
          orders,
          nowMs: now(nowMs),
        })
        state = committed.step.state
        continuity = committed.continuity
        await reconcileProjection()
        return state
      }) },
      renew(nowMs, ttlMs = leaseTtlMs) { return serialize(async () => {
        assertOpen()
        lease = await renewGameOsWorldLease(args.store, lease, { nowMs: now(nowMs), ttlMs })
        return lease
      }) },
      reset(seed, nowMs, definition) { return serialize(async () => {
        assertOpen()
        const restored = await resetGameOsWorld(args.store, { lease, seed, nowMs: now(nowMs), definition })
        state = restored.state
        continuity = restored.continuity
        await reconcileProjection()
        return state
      }) },
      status(view, nowMs) {
        assertOpen()
        return readGameOsStatus({
          view,
          registry,
          store: args.store,
          worldId: lease.worldId,
          nowMs: now(nowMs),
          authoringCostStatus: args.authoringCostStatus,
        })
      },
      detachLocal() { return serialize(() => detachSession(false)) },
      close() { return serialize(async () => {
        if (closed) return
        if (!await releaseGameOsWorldLease(args.store, lease)) {
          throw new GameOsError('lease_lost', `World ${lease.worldId} lease is no longer releasable.`, {
            worldId: lease.worldId,
          })
        }
        await detachSession(true)
      }) },
    }
    sessions.add(session)
    return session
  }

  return {
    registry,
    async open(input) {
      if (opening || activeSession) {
        throw new GameOsError('surface_unavailable', 'The Game OS scene surface already has an active session.', {
          ...(activeSession ? { worldId: activeSession.worldId } : { reason: 'session-open-in-progress' }),
        })
      }
      opening = true
      try {
        const leaseTtlMs = input.leaseTtlMs ?? GAME_OS_DEFAULT_LEASE_TTL_MS
        const opened = await openGameOsWorld(args.store, {
          ...input,
          nowMs: now(input.nowMs),
          leaseTtlMs,
        })
        let session: GameOsSession | null = null
        try {
          const overlay = registry.activate(args.modeDeclaration.identity, { worldId: input.worldId })
          session = createSession(
            opened.lease,
            opened.restore.state,
            opened.restore.continuity,
            leaseTtlMs,
            overlay.overlayId,
          )
          activeSession = session
          const owner = registry.inspectSurface()
          if (owner?.identity !== args.modeDeclaration.identity
            || owner.overlay.overlayId !== overlay.overlayId) {
            throw new GameOsError('surface_unavailable', `World ${input.worldId} lost the scene surface while opening.`, {
              worldId: input.worldId,
            })
          }
          await projectSessionState(opened.restore.state, opened.restore.state)
          return session
        } catch (error) {
          if (session) {
            let cleanupError: unknown = null
            try {
              await session.close()
            } catch (closeError) {
              cleanupError = closeError
            }
            if (cleanupError) {
              const typedCleanup = cleanupError instanceof GameOsError ? cleanupError : null
              const retainsRetry = typedCleanup?.code === 'store_unavailable'
              if (!retainsRetry) {
                try { await session.detachLocal() } catch { /* Preserve the aggregate opening failure. */ }
              }
              throw new GameOsError('surface_unavailable', `World ${input.worldId} opening cleanup did not complete.`, {
                worldId: input.worldId,
                reason: error instanceof Error ? error.message : String(error),
                cleanupCode: typedCleanup?.code ?? 'unknown',
                cleanupReason: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
                cleanupPending: retainsRetry,
                durableLeaseReleased: typedCleanup?.details.durableLeaseReleased === true,
                retryAction: retainsRetry ? 'dispose-runtime' : 'inspect-lease',
              })
            }
          } else {
            try { await releaseOpeningLease(opened.lease) } catch (cleanupError) {
              const typedCleanup = cleanupError instanceof GameOsError ? cleanupError : null
              const retainsRetry = typedCleanup?.code === 'store_unavailable'
              throw new GameOsError('surface_unavailable', `World ${input.worldId} opening cleanup did not complete.`, {
                worldId: input.worldId,
                reason: error instanceof Error ? error.message : String(error),
                cleanupCode: typedCleanup?.code ?? 'unknown',
                cleanupReason: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
                cleanupPending: retainsRetry,
                durableLeaseReleased: false,
                retryAction: retainsRetry ? 'dispose-runtime' : 'inspect-lease',
              })
            }
          }
          throw error
        }
      } finally {
        opening = false
      }
    },
    async resetWorld(input) {
      const nowMs = now(input.nowMs)
      return (await explicitlyResetGameOsWorldRecord(args.store, {
        worldId: input.worldId,
        sessionId: input.sessionId,
        seed: input.seed,
        nowMs,
        definition: input.definition,
      })).state
    },
    status(view, worldId, nowMs) {
      return readGameOsStatus({ view, registry, store: args.store, worldId, nowMs: now(nowMs),
        authoringCostStatus: args.authoringCostStatus })
    },
    parseInvocation: parseGameOsInvocation,
    resolveAsset(assetRef) {
      return assetGate.resolve(assetRef)
    },
    async dispose() {
      const failures: string[] = []
      for (const session of Array.from(sessions)) {
        try {
          await session.close()
        } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error))
        }
      }
      for (const cleanup of Array.from(pendingLeaseCleanups)) {
        try { await cleanup() } catch (error) {
          failures.push(error instanceof Error ? error.message : String(error))
        }
      }
      unregisterMode()
      if (failures.length > 0) {
        throw new GameOsError('surface_unavailable', 'Game OS runtime cleanup did not complete.', { failures })
      }
    },
  }
}
