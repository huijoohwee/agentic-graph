import { cloneCanonicalGameOsValue, deepFreezeGameOsValue, gameOsDigest } from './canonical.js'
import { GameOsDigestMismatch, gameOsDigestMismatch, gameOsRecoveryDetails } from './recovery.js'
import { exactRecord, exactSafeInteger, exactText } from './schema.js'
import {
  GAME_OS_CONTINUITY_SCHEMA,
  GAME_OS_ENVELOPE_SCHEMA,
  GAME_OS_LEASE_SCHEMA,
  GameOsError,
  type GameOsContinuityRecord,
  type GameOsWorldEnvelope,
  type GameOsWorldLease,
} from './types.js'

const unsignedEnvelope = (input: {
  worldId: string
  lease: GameOsWorldLease | null
  continuity: GameOsContinuityRecord | null
}) => ({
  schema: GAME_OS_ENVELOPE_SCHEMA,
  worldId: input.worldId,
  lease: input.lease,
  continuity: input.continuity,
})

export const sealGameOsWorldEnvelope = (input: {
  worldId: string
  lease: GameOsWorldLease | null
  continuity: GameOsContinuityRecord | null
}): GameOsWorldEnvelope => {
  const unsigned = cloneCanonicalGameOsValue(unsignedEnvelope(input))
  return deepFreezeGameOsValue({
    ...unsigned,
    revision: gameOsDigest(unsigned),
  }) as GameOsWorldEnvelope
}

export const gameOsEnvelopeStoreRecord = (
  envelope: GameOsWorldEnvelope,
): Record<string, unknown> => cloneCanonicalGameOsValue(envelope) as unknown as Record<string, unknown>

export const parseGameOsWorldEnvelope = (
  raw: Record<string, unknown>,
  expectedWorldId: string,
): GameOsWorldEnvelope => {
  try {
    exactRecord(raw, ['schema', 'worldId', 'revision', 'lease', 'continuity'], 'world envelope')
    if (raw.schema !== GAME_OS_ENVELOPE_SCHEMA) throw new Error('unsupported envelope schema')
    const envelope = cloneCanonicalGameOsValue(raw) as unknown as GameOsWorldEnvelope
    if (exactText(envelope.worldId, 'worldId') !== expectedWorldId) {
      throw new Error('world identity mismatch')
    }
    if (envelope.lease !== null && (!envelope.lease || typeof envelope.lease !== 'object')) {
      throw new Error('lease section is invalid')
    }
    if (
      envelope.continuity !== null
      && (!envelope.continuity || typeof envelope.continuity !== 'object')
    ) throw new Error('continuity section is invalid')
    if (envelope.lease) {
      exactRecord(envelope.lease, ['schema', 'worldId', 'sessionId', 'epoch', 'expiresAtMs', 'revision'], 'envelope.lease')
      if (envelope.lease.schema !== GAME_OS_LEASE_SCHEMA) throw new Error('lease schema is unsupported')
      if (exactText(envelope.lease.worldId, 'envelope.lease.worldId') !== envelope.worldId) {
        throw new Error('lease world identity mismatch')
      }
      exactText(envelope.lease.sessionId, 'envelope.lease.sessionId')
      exactSafeInteger(envelope.lease.epoch, 'envelope.lease.epoch', 1)
      exactSafeInteger(envelope.lease.expiresAtMs, 'envelope.lease.expiresAtMs', 1)
      const leaseRevision = exactText(envelope.lease.revision, 'envelope.lease.revision')
      const { revision: _leaseRevision, ...unsignedLease } = envelope.lease
      const actualLeaseRevision = gameOsDigest(unsignedLease)
      if (leaseRevision !== actualLeaseRevision) {
        gameOsDigestMismatch('lease revision digest mismatch', leaseRevision, actualLeaseRevision)
      }
    }
    if (envelope.continuity) {
      exactRecord(envelope.continuity, ['schema', 'worldId', 'seed', 'revision', 'initialStateDigest',
        'committedStateDigest', 'acceptedOrderJournal', 'committedOrderCount', 'snapshots', 'journal'],
      'envelope.continuity')
      if (envelope.continuity.schema !== GAME_OS_CONTINUITY_SCHEMA) {
        throw new Error('continuity schema is unsupported')
      }
      if (exactText(envelope.continuity.worldId, 'envelope.continuity.worldId') !== envelope.worldId) {
        throw new Error('continuity world identity mismatch')
      }
      exactText(envelope.continuity.seed, 'envelope.continuity.seed')
      const continuityRevision = exactText(envelope.continuity.revision, 'envelope.continuity.revision')
      exactText(envelope.continuity.initialStateDigest, 'envelope.continuity.initialStateDigest')
      exactText(envelope.continuity.committedStateDigest, 'envelope.continuity.committedStateDigest')
      exactSafeInteger(envelope.continuity.committedOrderCount, 'envelope.continuity.committedOrderCount', 0)
      if (!Array.isArray(envelope.continuity.acceptedOrderJournal)
        || !Array.isArray(envelope.continuity.snapshots) || !Array.isArray(envelope.continuity.journal)) {
        throw new Error('continuity collections are invalid')
      }
      const { revision: _continuityRevision, ...unsignedContinuity } = envelope.continuity
      const actualContinuityRevision = gameOsDigest(unsignedContinuity)
      if (continuityRevision !== actualContinuityRevision) {
        gameOsDigestMismatch('continuity revision digest mismatch', continuityRevision, actualContinuityRevision)
      }
    }
    const revision = exactText(envelope.revision, 'revision')
    const actualDigest = gameOsDigest(unsignedEnvelope(envelope))
    if (revision !== actualDigest) {
      gameOsDigestMismatch('envelope revision digest mismatch', revision, actualDigest)
    }
    return deepFreezeGameOsValue(envelope) as GameOsWorldEnvelope
  } catch (error) {
    throw new GameOsError(
      error instanceof GameOsDigestMismatch ? 'digest_mismatch' : 'record_malformed',
      `World envelope world:${expectedWorldId} is unreadable.`, {
      ...gameOsRecoveryDetails(expectedWorldId, error instanceof GameOsDigestMismatch ? error : undefined),
      reason: error instanceof Error ? error.message : String(error),
      },
    )
  }
}
