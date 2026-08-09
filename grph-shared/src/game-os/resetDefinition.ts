import { parseGameOsWorldEnvelope } from './envelope.js'
import { gameOsRecoveryDetails } from './recovery.js'
import { normalizePersistentStrategyWorldDefinition } from './simulation.js'
import {
  GameOsError,
  type GameOsPersistentStrategyWorldDefinition,
} from './types.js'

const missingFallback = (worldId: string, reason: string): GameOsError =>
  new GameOsError('record_malformed', `World ${worldId} requires an explicit fallback definition.`, {
    ...gameOsRecoveryDetails(worldId),
    reason,
    fallbackDefinitionRequired: true,
  })

export const resolveGameOsResetDefinition = (args: {
  worldId: string
  requested?: GameOsPersistentStrategyWorldDefinition
  stored: unknown
}): GameOsPersistentStrategyWorldDefinition => {
  if (args.requested) return normalizePersistentStrategyWorldDefinition(args.requested)
  if (args.stored == null) throw missingFallback(args.worldId, 'stored tick-zero definition is missing')
  try {
    return normalizePersistentStrategyWorldDefinition(
      args.stored as GameOsPersistentStrategyWorldDefinition,
    )
  } catch (error) {
    throw missingFallback(args.worldId, error instanceof Error ? error.message : String(error))
  }
}

export const resolveGameOsResetDefinitionFromRecord = (args: {
  worldId: string
  requested?: GameOsPersistentStrategyWorldDefinition
  storedRecord: Record<string, unknown> | null
}): GameOsPersistentStrategyWorldDefinition => {
  if (args.requested) return normalizePersistentStrategyWorldDefinition(args.requested)
  if (!args.storedRecord) throw missingFallback(args.worldId, 'world record is missing')
  try {
    const envelope = parseGameOsWorldEnvelope(args.storedRecord, args.worldId)
    return resolveGameOsResetDefinition({
      worldId: args.worldId,
      stored: envelope.continuity?.snapshots[0]?.state.definition,
    })
  } catch (error) {
    if (error instanceof GameOsError && error.details.fallbackDefinitionRequired) throw error
    const code = error instanceof GameOsError && error.code === 'digest_mismatch'
      ? 'digest_mismatch'
      : 'record_malformed'
    throw new GameOsError(code, `World ${args.worldId} requires an explicit fallback definition.`, {
      ...gameOsRecoveryDetails(args.worldId),
      ...(error instanceof GameOsError ? error.details : {}),
      reason: error instanceof Error ? error.message : String(error),
      fallbackDefinitionRequired: true,
    })
  }
}
