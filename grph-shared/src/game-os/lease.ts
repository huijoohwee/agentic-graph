import { cloneCanonicalGameOsValue, gameOsDigest } from './canonical.js'
import {
  gameOsEnvelopeStoreRecord,
  parseGameOsWorldEnvelope,
  sealGameOsWorldEnvelope,
} from './envelope.js'
import { GameOsDigestMismatch, gameOsDigestMismatch, gameOsRecoveryDetails } from './recovery.js'
import { exactRecord, exactSafeInteger, exactText } from './schema.js'
import {
  GAME_OS_LEASE_SCHEMA,
  GameOsError,
  type GameOsContinuityStore,
  type GameOsWorldEnvelope,
  type GameOsWorldLease,
} from './types.js'

export type GameOsWorldLeaseAcquisition = Readonly<{
  lease: GameOsWorldLease
  acquiredRevision: string
  prior: Readonly<{
    value: Record<string, unknown>
    revision: string
  }> | null
}>

const positiveInteger = (value: unknown, field: string): number => {
  try { return exactSafeInteger(value, field, 1) } catch {
    throw new GameOsError('input-invalid', `${field} must be a positive integer.`, { field })
  }
}

const requiredText = (value: unknown, field: string): string => {
  try { return exactText(value, field) } catch {
    throw new GameOsError('input-invalid', `${field} is required.`, { field })
  }
}

const unsignedLease = (lease: Omit<GameOsWorldLease, 'revision'>): Omit<GameOsWorldLease, 'revision'> => ({
  schema: GAME_OS_LEASE_SCHEMA,
  worldId: lease.worldId,
  sessionId: lease.sessionId,
  epoch: lease.epoch,
  expiresAtMs: lease.expiresAtMs,
})

const sealLease = (lease: Omit<GameOsWorldLease, 'revision'>): GameOsWorldLease => {
  const unsigned = unsignedLease(lease)
  return Object.freeze({ ...unsigned, revision: gameOsDigest(unsigned) })
}

export const parseGameOsWorldLease = (
  raw: Record<string, unknown>,
  expectedWorldId: string,
): GameOsWorldLease => {
  try {
    exactRecord(raw, ['schema', 'worldId', 'sessionId', 'epoch', 'expiresAtMs', 'revision'], 'world lease')
    if (raw.schema !== GAME_OS_LEASE_SCHEMA) throw new Error('unsupported schema')
    const lease = cloneCanonicalGameOsValue(raw) as unknown as GameOsWorldLease
    if (requiredText(lease.worldId, 'worldId') !== expectedWorldId) throw new Error('world identity mismatch')
    requiredText(lease.sessionId, 'sessionId')
    positiveInteger(lease.epoch, 'epoch')
    positiveInteger(lease.expiresAtMs, 'expiresAtMs')
    const revision = requiredText(lease.revision, 'revision')
    const actualDigest = gameOsDigest(unsignedLease(lease))
    if (revision !== actualDigest) {
      gameOsDigestMismatch('lease revision digest mismatch', revision, actualDigest)
    }
    return Object.freeze(lease)
  } catch (error) {
    throw new GameOsError(
      error instanceof GameOsDigestMismatch ? 'digest_mismatch' : 'record_malformed',
      `World lease ${expectedWorldId} is unreadable.`, {
      ...gameOsRecoveryDetails(expectedWorldId, error instanceof GameOsDigestMismatch ? error : undefined),
      reason: error instanceof Error ? error.message : String(error),
      },
    )
  }
}

export const assertGameOsWorldLeaseInEnvelope = (
  envelope: GameOsWorldEnvelope,
  lease: GameOsWorldLease,
  nowMsValue: number,
): GameOsWorldLease => {
  const nowMs = positiveInteger(nowMsValue, 'nowMs')
  if (!envelope.lease) {
    throw new GameOsError('lease_lost', `World ${lease.worldId} has no write lease.`)
  }
  const current = parseGameOsWorldLease(
    envelope.lease as unknown as Record<string, unknown>,
    lease.worldId,
  )
  if (
    current.sessionId !== lease.sessionId
    || current.epoch !== lease.epoch
    || current.revision !== lease.revision
  ) {
    throw new GameOsError('lease_lost', `World ${lease.worldId} is held by another lease epoch.`, {
      worldId: lease.worldId,
    })
  }
  if (current.expiresAtMs <= nowMs) {
    throw new GameOsError('lease_lost', `World ${lease.worldId} write lease expired.`, {
      worldId: lease.worldId,
      expiresAtMs: current.expiresAtMs,
    })
  }
  return current
}

export const acquireGameOsWorldLeaseForOpen = async (
  store: GameOsContinuityStore,
  args: { worldId: string; sessionId: string; nowMs: number; ttlMs: number },
): Promise<GameOsWorldLeaseAcquisition> => {
  const worldId = requiredText(args.worldId, 'worldId')
  const sessionId = requiredText(args.sessionId, 'sessionId')
  const nowMs = positiveInteger(args.nowMs, 'nowMs')
  const ttlMs = positiveInteger(args.ttlMs, 'ttlMs')
  const prior = await store.getVersioned(worldId)
  const envelope = prior ? parseGameOsWorldEnvelope(prior.value, worldId) : null
  if (prior && envelope?.revision !== prior.revision) {
    const actualDigest = envelope?.revision ?? 'missing'
    throw new GameOsError('digest_mismatch', `World envelope world:${worldId} has inconsistent revisions.`, {
      ...gameOsRecoveryDetails(worldId,
        new GameOsDigestMismatch('store and envelope revisions differ', prior.revision, actualDigest)),
    })
  }
  const incumbent = envelope?.lease
    ? parseGameOsWorldLease(envelope.lease as unknown as Record<string, unknown>, worldId)
    : null
  if (incumbent && incumbent.sessionId !== sessionId && incumbent.expiresAtMs > nowMs) {
    throw new GameOsError('lease_lost', `World ${worldId} already has a live writer.`, {
      worldId,
      incumbentSessionId: incumbent.sessionId,
      expiresAtMs: incumbent.expiresAtMs,
    })
  }
  const nextLease = sealLease({
    schema: GAME_OS_LEASE_SCHEMA,
    worldId,
    sessionId,
    epoch: incumbent ? incumbent.epoch + 1 : 1,
    expiresAtMs: positiveInteger(nowMs + ttlMs, 'expiresAtMs'),
  })
  const nextEnvelope = sealGameOsWorldEnvelope({
    worldId,
    lease: nextLease,
    continuity: envelope?.continuity ?? null,
  })
  if (!await store.compareAndPut(
    worldId,
    gameOsEnvelopeStoreRecord(nextEnvelope),
    prior?.revision ?? null,
  )) {
    throw new GameOsError('lease_lost', `World ${worldId} lease changed during acquisition.`, { worldId })
  }
  return Object.freeze({
    lease: nextLease,
    acquiredRevision: nextEnvelope.revision,
    prior: prior
      ? Object.freeze({ value: cloneCanonicalGameOsValue(prior.value), revision: prior.revision })
      : null,
  })
}

export const acquireGameOsWorldLease = async (
  store: GameOsContinuityStore,
  args: { worldId: string; sessionId: string; nowMs: number; ttlMs: number },
): Promise<GameOsWorldLease> => (await acquireGameOsWorldLeaseForOpen(store, args)).lease

export const rollbackGameOsWorldLeaseAcquisition = async (
  store: GameOsContinuityStore,
  acquisition: GameOsWorldLeaseAcquisition,
): Promise<void> => {
  const restored = acquisition.prior
    ? await store.compareAndPut(
      acquisition.lease.worldId,
      cloneCanonicalGameOsValue(acquisition.prior.value),
      acquisition.acquiredRevision,
    )
    : await store.compareAndDelete(
      acquisition.lease.worldId,
      acquisition.acquiredRevision,
    )
  if (!restored) {
    throw new GameOsError(
      'lease_lost',
      `World ${acquisition.lease.worldId} changed before failed-open rollback.`,
      { worldId: acquisition.lease.worldId },
    )
  }
}

export const assertActiveGameOsWorldLease = async (
  store: GameOsContinuityStore,
  lease: GameOsWorldLease,
  nowMs: number,
): Promise<GameOsWorldLease> => {
  const raw = await store.get(lease.worldId)
  if (!raw) throw new GameOsError('lease_lost', `World ${lease.worldId} has no write lease.`)
  return assertGameOsWorldLeaseInEnvelope(
    parseGameOsWorldEnvelope(raw, lease.worldId),
    lease,
    nowMs,
  )
}

export const renewGameOsWorldLease = async (
  store: GameOsContinuityStore,
  lease: GameOsWorldLease,
  args: { nowMs: number; ttlMs: number },
): Promise<GameOsWorldLease> => {
  const raw = await store.get(lease.worldId)
  if (!raw) throw new GameOsError('lease_lost', `World ${lease.worldId} has no write lease.`)
  const envelope = parseGameOsWorldEnvelope(raw, lease.worldId)
  const current = assertGameOsWorldLeaseInEnvelope(envelope, lease, args.nowMs)
  const ttlMs = positiveInteger(args.ttlMs, 'ttlMs')
  const nextLease = sealLease({
    schema: GAME_OS_LEASE_SCHEMA,
    worldId: current.worldId,
    sessionId: current.sessionId,
    epoch: current.epoch,
    expiresAtMs: positiveInteger(args.nowMs + ttlMs, 'expiresAtMs'),
  })
  if (nextLease.expiresAtMs <= current.expiresAtMs) {
    throw new GameOsError('lease_lost', 'Lease renewal must extend its expiry.', {
      worldId: current.worldId,
    })
  }
  const nextEnvelope = sealGameOsWorldEnvelope({
    worldId: current.worldId,
    lease: nextLease,
    continuity: envelope.continuity,
  })
  if (!await store.compareAndPut(
    current.worldId,
    gameOsEnvelopeStoreRecord(nextEnvelope),
    envelope.revision,
  )) {
    throw new GameOsError('lease_lost', `World ${current.worldId} lease changed during renewal.`)
  }
  return nextLease
}

export const releaseGameOsWorldLease = async (
  store: GameOsContinuityStore,
  lease: GameOsWorldLease,
): Promise<boolean> => {
  const raw = await store.get(lease.worldId)
  if (!raw) return false
  const envelope = parseGameOsWorldEnvelope(raw, lease.worldId)
  if (!envelope.lease) return false
  const current = parseGameOsWorldLease(
    envelope.lease as unknown as Record<string, unknown>,
    lease.worldId,
  )
  if (
    current.sessionId !== lease.sessionId
    || current.epoch !== lease.epoch
    || current.revision !== lease.revision
  ) {
    throw new GameOsError('lease_lost', `World ${lease.worldId} lease changed before release.`)
  }
  const nextEnvelope = sealGameOsWorldEnvelope({
    worldId: lease.worldId,
    lease: null,
    continuity: envelope.continuity,
  })
  if (!await store.compareAndPut(
    lease.worldId,
    gameOsEnvelopeStoreRecord(nextEnvelope),
    envelope.revision,
  )) {
    throw new GameOsError('lease_lost', `World ${lease.worldId} lease changed during release.`)
  }
  return true
}
