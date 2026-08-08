import { cloneCanonicalGameOsValue, deepFreezeGameOsValue } from './canonical.js'
import {
  normalizeGameOsAuthoringCostStatus,
  type GameOsAuthoringCostStatusSource,
} from './authoringEvidence.js'
import { restoreGameOsContinuityRecord } from './continuity.js'
import { parseGameOsWorldEnvelope } from './envelope.js'
import { parseGameOsWorldLease } from './lease.js'
import { exactSafeInteger, exactText } from './schema.js'
import type { GameOsModeRegistry } from './registry.js'
import {
  GAME_OS_STATUS_SCHEMA,
  GAME_OS_ZERO_COST_RECORD,
  GameOsError,
  type GameOsContinuityStore,
  type GameOsCostRecord,
  type GameOsJsonValue,
} from './types.js'

export const GAME_OS_STATUS_VIEWS = [
  'registered_modes',
  'world_continuity',
  'lease_state',
  'determinism_digest',
  'cost_summary',
] as const

export type GameOsStatusView = typeof GAME_OS_STATUS_VIEWS[number]

export type GameOsStatusResponse = {
  schema: typeof GAME_OS_STATUS_SCHEMA
  view: GameOsStatusView
  entries: Array<Record<string, GameOsJsonValue>>
  unavailableSources: string[]
  costRecord: GameOsCostRecord
}

const requireWorldId = (worldIdValue: string | undefined): string => {
  try { return exactText(worldIdValue, 'worldId') } catch {
    throw new GameOsError('input-invalid', 'worldId is required for this status view.')
  }
}

const normalizedEntry = (value: unknown): Record<string, GameOsJsonValue> =>
  cloneCanonicalGameOsValue(value) as Record<string, GameOsJsonValue>

const readWorld = async (store: GameOsContinuityStore, worldId: string) => {
  const raw = await store.get(worldId)
  if (!raw) throw new Error(`world:${worldId}`)
  const envelope = parseGameOsWorldEnvelope(raw, worldId)
  if (!envelope.continuity) throw new Error(`world:${worldId}`)
  return restoreGameOsContinuityRecord(
    cloneCanonicalGameOsValue(envelope.continuity) as unknown as Record<string, unknown>,
    worldId,
  )
}

export const readGameOsStatus = async (args: {
  view: GameOsStatusView
  registry: Pick<GameOsModeRegistry, 'listModes'>
  store: GameOsContinuityStore
  worldId?: string
  nowMs?: number
  authoringCostStatus?: GameOsAuthoringCostStatusSource
}): Promise<GameOsStatusResponse> => {
  if (!GAME_OS_STATUS_VIEWS.includes(args.view)) {
    throw new GameOsError('input-invalid', `Status view ${String(args.view)} is not declared.`)
  }
  let nowMs: number
  try { nowMs = exactSafeInteger(args.nowMs ?? Date.now(), 'nowMs', 1) } catch {
    throw new GameOsError('input-invalid', 'nowMs must be a positive safe integer.')
  }
  const entries: Array<Record<string, GameOsJsonValue>> = []
  const unavailableSources: string[] = []
  if (args.view === 'registered_modes') {
    entries.push(...args.registry.listModes().map(normalizedEntry))
  } else {
    const worldId = requireWorldId(args.worldId)
    if (args.view === 'lease_state') {
      try {
        const raw = await args.store.get(worldId)
        if (!raw) entries.push(normalizedEntry({ worldId, state: 'unleased' }))
        else {
          const envelope = parseGameOsWorldEnvelope(raw, worldId)
          if (!envelope.lease) entries.push(normalizedEntry({ worldId, state: 'unleased' }))
          else {
            const lease = parseGameOsWorldLease(
              envelope.lease as unknown as Record<string, unknown>,
              worldId,
            )
            entries.push(normalizedEntry({
              worldId,
              sessionId: lease.sessionId,
              epoch: lease.epoch,
              expiresAtMs: lease.expiresAtMs,
              state: lease.expiresAtMs > nowMs ? 'active' : 'expired',
            }))
          }
        }
      } catch {
        unavailableSources.push(`lease:${worldId}`)
      }
    } else {
      try {
        const restore = await readWorld(args.store, worldId)
        if (args.view === 'world_continuity') {
          entries.push(normalizedEntry({
            worldId,
            restoredTick: restore.restoredTick,
            matchedDigest: restore.matchedDigest,
            journalLength: restore.continuity.journal.length,
            acceptedOrderCount: restore.continuity.acceptedOrderJournal.length,
            pendingOrderCount: restore.continuity.acceptedOrderJournal.length
              - restore.continuity.committedOrderCount,
            snapshotCount: restore.continuity.snapshots.length,
            snapshotTick: restore.restoredSnapshotTick,
            replaySpan: restore.replaySpan,
          }))
        } else if (args.view === 'determinism_digest') {
          entries.push(normalizedEntry({
            worldId,
            tick: restore.restoredTick,
            digest: restore.matchedDigest,
          }))
        } else {
          entries.push(normalizedEntry({
            source: 'play',
            worldId,
            fixedStepCount: restore.continuity.journal.length,
            model: null,
            prompt_tokens: 0,
            completion_tokens: 0,
            cache_hits: 0,
            estimated_cost_usd: 0,
          }))
        }
      } catch {
        unavailableSources.push(`world:${worldId}`)
      }
      if (args.view === 'cost_summary' && args.authoringCostStatus) {
        try {
          const authoringStatus = await args.authoringCostStatus()
          if (authoringStatus) entries.push(normalizedEntry(
            normalizeGameOsAuthoringCostStatus(authoringStatus),
          ))
        } catch {
          unavailableSources.push('authoring-cost-evidence')
        }
      }
    }
  }
  return deepFreezeGameOsValue({
    schema: GAME_OS_STATUS_SCHEMA,
    view: args.view,
    entries,
    unavailableSources,
    costRecord: GAME_OS_ZERO_COST_RECORD,
  }) as GameOsStatusResponse
}
