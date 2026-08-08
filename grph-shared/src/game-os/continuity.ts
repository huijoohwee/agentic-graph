import { canonicalGameOsString, cloneCanonicalGameOsValue, deepFreezeGameOsValue, gameOsDigest } from './canonical.js'
import { gameOsEnvelopeStoreRecord, parseGameOsWorldEnvelope, sealGameOsWorldEnvelope } from './envelope.js'
import { acquireGameOsWorldLeaseForOpen, assertGameOsWorldLeaseInEnvelope, parseGameOsWorldLease, rollbackGameOsWorldLeaseAcquisition } from './lease.js'
import { GameOsDigestMismatch, gameOsDigestMismatch, gameOsRecoveryDetails } from './recovery.js'
import { resolveGameOsResetDefinition, resolveGameOsResetDefinitionFromRecord } from './resetDefinition.js'
import { advancePersistentStrategyWorld, createPersistentStrategyWorld,
  normalizeGameOsWorldSeed, normalizePersistentStrategyOrders,
  normalizePersistentStrategyWorldDefinition } from './simulation.js'
import { exactRecord, exactSafeInteger, exactText } from './schema.js'
import { assertGameOsWorldShape } from './worldValidation.js'
import {
  GAME_OS_ACCEPTED_ORDER_SCHEMA, GAME_OS_CONTINUITY_SCHEMA, GAME_OS_JOURNAL_ENTRY_SCHEMA,
  GAME_OS_SNAPSHOT_SCHEMA, GAME_OS_WORLD_SCHEMA, GAME_OS_ZERO_COST_RECORD, GameOsError,
  type GameOsAcceptedOrderEntry, type GameOsContinuityRecord, type GameOsContinuitySnapshot,
  type GameOsContinuityStore, type GameOsJournalEntry, type GameOsOrder, type GameOsRestoreReport,
  type GameOsPersistentStrategyWorldDefinition, type GameOsStepResult, type GameOsWorldLease, type GameOsWorldState,
} from './types.js'
const DEFAULT_SNAPSHOT_INTERVAL = 8
const continuityError = (worldId: string, error: unknown): GameOsError =>
  new GameOsError(error instanceof GameOsDigestMismatch ? 'digest_mismatch' : 'record_malformed',
    `World record world:${worldId} is unreadable.`, {
    ...gameOsRecoveryDetails(worldId, error instanceof GameOsDigestMismatch ? error : undefined),
    reason: error instanceof Error ? error.message : String(error),
  })
const requiredText = (value: unknown, field: string): string => {
  return exactText(value, field)
}
const nonNegativeInteger = (value: unknown, field: string): number => {
  return exactSafeInteger(value, field, 0)
}
const assertZeroCostRecord = (entry: GameOsJournalEntry): void => {
  if (
    !Array.isArray(entry.costRecords)
    || entry.costRecords.length !== 1
    || canonicalGameOsString(entry.costRecords[0]) !== canonicalGameOsString(GAME_OS_ZERO_COST_RECORD)
  ) throw new Error(`journal tick ${entry.tick} has a non-canonical cost record`)
}
const unsignedContinuity = (
  record: Omit<GameOsContinuityRecord, 'revision'>,
): Omit<GameOsContinuityRecord, 'revision'> => ({
  schema: GAME_OS_CONTINUITY_SCHEMA,
  worldId: record.worldId,
  seed: record.seed,
  initialStateDigest: record.initialStateDigest,
  committedStateDigest: record.committedStateDigest,
  acceptedOrderJournal: record.acceptedOrderJournal,
  committedOrderCount: record.committedOrderCount,
  snapshots: record.snapshots,
  journal: record.journal,
})
const sealContinuity = (
  record: Omit<GameOsContinuityRecord, 'revision'>,
): GameOsContinuityRecord => {
  const unsigned = cloneCanonicalGameOsValue(unsignedContinuity(record))
  return deepFreezeGameOsValue({ ...unsigned, revision: gameOsDigest(unsigned) }) as GameOsContinuityRecord
}
const continuityStoreRecord = (record: GameOsContinuityRecord): Record<string, unknown> =>
  cloneCanonicalGameOsValue(record) as unknown as Record<string, unknown>
export const createGameOsContinuityRecord = (state: GameOsWorldState): GameOsContinuityRecord => {
  const initialState = assertGameOsWorldShape(state, state.worldId)
  if (initialState.tick !== 0 || initialState.lastOrderSequence !== 0) {
    throw new GameOsError('input-invalid', 'A new continuity record requires an unadvanced world.')
  }
  const stateDigest = gameOsDigest(initialState)
  const snapshot: GameOsContinuitySnapshot = {
    schema: GAME_OS_SNAPSHOT_SCHEMA,
    tick: 0,
    state: initialState,
    stateDigest,
  }
  return sealContinuity({
    schema: GAME_OS_CONTINUITY_SCHEMA,
    worldId: initialState.worldId,
    seed: initialState.seed,
    initialStateDigest: stateDigest,
    committedStateDigest: stateDigest,
    acceptedOrderJournal: [],
    committedOrderCount: 0,
    snapshots: [snapshot],
    journal: [],
  })
}
const restoreFromSnapshot = (args: {
  snapshot: unknown
  worldId: string
  seed: string
  initialDigest: string
  committedDigest: string
  journal: GameOsJournalEntry[]
  canonicalDefinition: string
  lastOrderSequenceAnchors: number[]
}): { state: GameOsWorldState; snapshotTick: number } => {
  exactRecord(args.snapshot, ['schema', 'tick', 'state', 'stateDigest'], 'snapshot')
  const snapshot = args.snapshot as GameOsContinuitySnapshot
  if (snapshot.schema !== GAME_OS_SNAPSHOT_SCHEMA) throw new Error('snapshot schema is unsupported')
  const state = assertGameOsWorldShape(snapshot.state, args.worldId)
  if (state.seed !== args.seed) throw new Error('snapshot seed does not match continuity seed')
  if (canonicalGameOsString(state.definition) !== args.canonicalDefinition) {
    throw new Error('snapshot definition does not match the authoritative tick-zero definition')
  }
  const snapshotTick = nonNegativeInteger(snapshot.tick, 'snapshot.tick')
  if (state.tick !== snapshotTick) throw new Error('snapshot tick does not match its state')
  if (snapshotTick > args.journal.length) throw new Error('snapshot is ahead of the journal')
  if (state.lastOrderSequence !== args.lastOrderSequenceAnchors[snapshotTick]) {
    throw new Error('snapshot order sequence does not match its journal position')
  }
  const snapshotDigest = gameOsDigest(state)
  const recordedSnapshotDigest = requiredText(snapshot.stateDigest, 'snapshot.stateDigest')
  if (snapshotDigest !== recordedSnapshotDigest) {
    gameOsDigestMismatch('snapshot digest mismatch', recordedSnapshotDigest, snapshotDigest)
  }
  const anchorDigest = snapshotTick === 0
    ? args.initialDigest
    : args.journal[snapshotTick - 1]?.resultStateDigest
  if (snapshotDigest !== anchorDigest) {
    gameOsDigestMismatch('snapshot does not match its journal position', anchorDigest, snapshotDigest)
  }
  let replayState = state
  for (let tick = snapshotTick + 1; tick <= args.journal.length; tick += 1) {
    const entry = args.journal[tick - 1]
    const replayPriorDigest = gameOsDigest(replayState)
    if (replayPriorDigest !== entry.priorStateDigest) {
      gameOsDigestMismatch(`journal tick ${tick} prior state does not match replay`, entry.priorStateDigest, replayPriorDigest)
    }
    const step = advancePersistentStrategyWorld(replayState, entry.orders)
    if (step.state.tick !== tick) throw new Error(`journal tick ${tick} replay tick mismatch`)
    if (step.stateDigest !== entry.resultStateDigest) {
      gameOsDigestMismatch(`journal tick ${tick} replay digest mismatch`, entry.resultStateDigest, step.stateDigest)
    }
    replayState = step.state
  }
  const replayDigest = gameOsDigest(replayState)
  if (replayDigest !== args.committedDigest) {
    gameOsDigestMismatch('committed state digest mismatch', args.committedDigest, replayDigest)
  }
  return { state: replayState, snapshotTick }
}
export const restoreGameOsContinuityRecord = (
  raw: Record<string, unknown>,
  expectedWorldId: string,
): GameOsRestoreReport => {
  try {
    exactRecord(raw, ['schema', 'worldId', 'seed', 'revision', 'initialStateDigest',
      'committedStateDigest', 'acceptedOrderJournal', 'committedOrderCount', 'snapshots', 'journal'], 'continuity')
    if (raw.schema !== GAME_OS_CONTINUITY_SCHEMA) throw new Error('continuity schema is unsupported')
    const record = cloneCanonicalGameOsValue(raw) as unknown as GameOsContinuityRecord
    if (requiredText(record.worldId, 'worldId') !== expectedWorldId) throw new Error('world identity mismatch')
    const seed = requiredText(record.seed, 'seed')
    const revision = requiredText(record.revision, 'revision')
    const actualRevision = gameOsDigest(unsignedContinuity(record))
    if (actualRevision !== revision) gameOsDigestMismatch('record revision digest mismatch', revision, actualRevision)
    if (!Array.isArray(record.snapshots) || record.snapshots.length === 0) {
      throw new Error('snapshot history is empty')
    }
    if (!Array.isArray(record.journal)) throw new Error('journal is not an array')
    if (!Array.isArray(record.acceptedOrderJournal)) {
      throw new Error('accepted order journal is not an array')
    }
    const committedOrderCount = nonNegativeInteger(
      record.committedOrderCount,
      'committedOrderCount',
    )
    if (committedOrderCount > record.acceptedOrderJournal.length) {
      throw new Error('committed order count exceeds the accepted order journal')
    }
    const tickZeroSnapshots = record.snapshots.filter(snapshot => snapshot?.tick === 0)
    if (tickZeroSnapshots.length !== 1) throw new Error('continuity requires exactly one tick-zero snapshot')
    const initialSnapshot = tickZeroSnapshots[0]
    exactRecord(initialSnapshot, ['schema', 'tick', 'state', 'stateDigest'], 'tick-zero snapshot')
    if (initialSnapshot.schema !== GAME_OS_SNAPSHOT_SCHEMA) throw new Error('tick-zero snapshot schema is unsupported')
    const initialSnapshotState = assertGameOsWorldShape(initialSnapshot.state, expectedWorldId)
    if (initialSnapshotState.seed !== seed || initialSnapshotState.tick !== 0
      || initialSnapshotState.lastOrderSequence !== 0) throw new Error('tick-zero snapshot is not an initial state')
    const definition = normalizePersistentStrategyWorldDefinition(initialSnapshotState.definition)
    const canonicalDefinition = canonicalGameOsString(definition)
    const initialState = createPersistentStrategyWorld({ worldId: expectedWorldId, seed, definition })
    const initialDigest = gameOsDigest(initialState)
    const recordedInitialDigest = requiredText(record.initialStateDigest, 'initialStateDigest')
    if (initialDigest !== recordedInitialDigest) {
      gameOsDigestMismatch('initial state digest mismatch', recordedInitialDigest, initialDigest)
    }
    const tickZeroDigest = gameOsDigest(initialSnapshotState)
    const recordedTickZeroDigest = requiredText(initialSnapshot.stateDigest, 'tick-zero snapshot.stateDigest')
    if (tickZeroDigest !== recordedTickZeroDigest) {
      gameOsDigestMismatch('tick-zero snapshot digest mismatch', recordedTickZeroDigest, tickZeroDigest)
    }
    if (tickZeroDigest !== initialDigest) {
      gameOsDigestMismatch('tick-zero snapshot does not match the initial state', initialDigest, tickZeroDigest)
    }
    let chainDigest = initialDigest
    let lastOrderSequence = 0
    const lastOrderSequenceAnchors = [0]
    for (let index = 0; index < record.journal.length; index += 1) {
      const entry = record.journal[index]
      const tick = index + 1
      exactRecord(entry, ['schema', 'tick', 'priorStateDigest', 'resultStateDigest',
        'orders', 'costRecords'], `journal tick ${tick}`)
      if (!entry || entry.schema !== GAME_OS_JOURNAL_ENTRY_SCHEMA || entry.tick !== tick) {
        throw new Error(`journal tick ${tick} is malformed`)
      }
      const priorStateDigest = requiredText(entry.priorStateDigest, 'entry.priorStateDigest')
      if (priorStateDigest !== chainDigest) {
        gameOsDigestMismatch(`journal tick ${tick} breaks the digest chain`, chainDigest, priorStateDigest)
      }
      chainDigest = requiredText(entry.resultStateDigest, 'entry.resultStateDigest')
      if (!Array.isArray(entry.orders)) throw new Error(`journal tick ${tick} orders are malformed`)
      const canonicalOrders = normalizePersistentStrategyOrders(entry.orders, lastOrderSequence)
      if (canonicalGameOsString(entry.orders) !== canonicalGameOsString(canonicalOrders)) {
        throw new Error(`journal tick ${tick} orders are not canonical`)
      }
      lastOrderSequence = canonicalOrders.at(-1)?.sequence ?? lastOrderSequence
      lastOrderSequenceAnchors.push(lastOrderSequence)
      assertZeroCostRecord(entry)
    }
    const committedDigest = requiredText(record.committedStateDigest, 'committedStateDigest')
    if (chainDigest !== committedDigest) {
      gameOsDigestMismatch('journal does not reach the committed digest', committedDigest, chainDigest)
    }
    const committedOrders = record.journal.flatMap(entry => entry.orders)
    if (committedOrders.length !== committedOrderCount) {
      throw new Error('committed order count does not match the fixed-step journal')
    }
    for (let index = 0; index < record.acceptedOrderJournal.length; index += 1) {
      const accepted = record.acceptedOrderJournal[index]
      exactRecord(accepted, ['schema', 'ordinal', 'order'], `accepted order ${index + 1}`)
      if (!accepted || accepted.schema !== GAME_OS_ACCEPTED_ORDER_SCHEMA || accepted.ordinal !== index + 1) {
        throw new Error(`accepted order ${index + 1} is malformed`)
      }
      if (index < committedOrderCount && canonicalGameOsString(accepted.order) !== canonicalGameOsString(committedOrders[index])) {
        throw new Error(`accepted order ${index + 1} does not match the fixed-step journal`)
      }
    }
    const acceptedOrders = record.acceptedOrderJournal.map(entry => entry.order)
    const canonicalAcceptedOrders = normalizePersistentStrategyOrders(acceptedOrders, 0)
    if (canonicalGameOsString(acceptedOrders) !== canonicalGameOsString(canonicalAcceptedOrders)) {
      throw new Error('accepted order journal is not canonical')
    }
    const candidates = record.snapshots
      .map((snapshot, index) => ({
        snapshot,
        index,
        tick: Number.isSafeInteger(snapshot?.tick) ? snapshot.tick : -1,
      }))
      .sort((left, right) => right.tick - left.tick || right.index - left.index)
    const rejectedSnapshotTicks: number[] = []
    const rejectedSnapshotErrors: unknown[] = []
    for (const candidate of candidates) {
      try {
        const restored = restoreFromSnapshot({
          snapshot: candidate.snapshot,
          worldId: expectedWorldId,
          seed,
          initialDigest,
          committedDigest,
          journal: record.journal,
          canonicalDefinition,
          lastOrderSequenceAnchors,
        })
        const pendingOrders = record.acceptedOrderJournal
          .slice(committedOrderCount)
          .map(entry => entry.order)
        if (pendingOrders.length > 0) advancePersistentStrategyWorld(restored.state, pendingOrders)
        return Object.freeze({
          worldId: expectedWorldId,
          state: restored.state,
          restoredTick: restored.state.tick,
          matchedDigest: committedDigest,
          restoredSnapshotTick: restored.snapshotTick,
          replaySpan: restored.state.tick - restored.snapshotTick,
          rejectedSnapshotTicks: Object.freeze([...rejectedSnapshotTicks]),
          continuity: deepFreezeGameOsValue(record) as GameOsContinuityRecord,
        }) as GameOsRestoreReport
      } catch (error) {
        rejectedSnapshotTicks.push(candidate.tick)
        rejectedSnapshotErrors.push(error)
      }
    }
    if (rejectedSnapshotErrors.length > 0
      && rejectedSnapshotErrors.every(error => error instanceof GameOsDigestMismatch)) {
      const mismatch = rejectedSnapshotErrors[0] as GameOsDigestMismatch
      gameOsDigestMismatch(`no valid snapshot digest remains (${rejectedSnapshotTicks.join(',')})`,
        mismatch.expectedDigest, mismatch.actualDigest)
    }
    throw new Error(`no valid snapshot remains (${rejectedSnapshotTicks.join(',')})`)
  } catch (error) {
    if (error instanceof GameOsError
      && (error.code === 'record_malformed' || error.code === 'digest_mismatch')) throw error
    throw continuityError(expectedWorldId, error)
  }
}
export const readGameOsWorld = async (
  store: GameOsContinuityStore,
  worldId: string,
): Promise<GameOsRestoreReport | null> => {
  const raw = await store.get(worldId)
  if (!raw) return null
  const envelope = parseGameOsWorldEnvelope(raw, worldId)
  if (!envelope.continuity) return null
  return restoreGameOsContinuityRecord(
    continuityStoreRecord(envelope.continuity),
    worldId,
  )
}
export const openGameOsWorld = async (
  store: GameOsContinuityStore,
  args: { worldId: string; seed: string | number; sessionId: string; nowMs: number; leaseTtlMs: number;
    definition?: GameOsPersistentStrategyWorldDefinition },
): Promise<{ lease: GameOsWorldLease; restore: GameOsRestoreReport }> => {
  const acquisition = await acquireGameOsWorldLeaseForOpen(store, {
    worldId: args.worldId,
    sessionId: args.sessionId,
    nowMs: args.nowMs,
    ttlMs: args.leaseTtlMs,
  })
  const lease = acquisition.lease
  let rollbackRevision = acquisition.acquiredRevision
  try {
    const raw = await store.get(args.worldId)
    if (!raw) throw new GameOsError('lease_lost', `World ${args.worldId} disappeared during open.`)
    const envelope = parseGameOsWorldEnvelope(raw, args.worldId)
    assertGameOsWorldLeaseInEnvelope(envelope, lease, args.nowMs)
    if (envelope.continuity) {
      const restore = restoreGameOsContinuityRecord(
        continuityStoreRecord(envelope.continuity),
        args.worldId,
      )
      if (restore.state.seed !== normalizeGameOsWorldSeed(args.seed)) {
        throw new GameOsError('input-invalid', `World ${args.worldId} was created from another seed.`, {
          worldId: args.worldId,
          expectedSeed: restore.state.seed,
        })
      }
      if (args.definition && canonicalGameOsString(normalizePersistentStrategyWorldDefinition(args.definition))
        !== canonicalGameOsString(restore.state.definition)) {
        throw new GameOsError('input-invalid', `World ${args.worldId} has another authoritative definition.`, {
          worldId: args.worldId,
          requestedDefinitionDigest: gameOsDigest(args.definition),
          storedDefinitionDigest: gameOsDigest(restore.state.definition),
        })
      }
      return { lease, restore }
    }
    const continuity = createGameOsContinuityRecord(
      createPersistentStrategyWorld({ worldId: args.worldId, seed: args.seed, definition: args.definition }),
    )
    const nextEnvelope = sealGameOsWorldEnvelope({
      worldId: args.worldId,
      lease: envelope.lease,
      continuity,
    })
    if (!await store.compareAndPut(
      args.worldId,
      gameOsEnvelopeStoreRecord(nextEnvelope),
      envelope.revision,
    )) {
      throw new GameOsError('lease_lost', `World ${args.worldId} changed during initialization.`)
    }
    rollbackRevision = nextEnvelope.revision
    return {
      lease,
      restore: restoreGameOsContinuityRecord(continuityStoreRecord(continuity), args.worldId),
    }
  } catch (error) {
    try {
      await rollbackGameOsWorldLeaseAcquisition(store, {
        ...acquisition,
        acquiredRevision: rollbackRevision,
      })
    } catch (rollbackError) {
      throw new GameOsError('lease_lost', `World ${args.worldId} changed during failed-open rollback.`, {
        worldId: args.worldId,
        openFailure: error instanceof Error ? error.message : String(error),
        rollbackFailure: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      })
    }
    throw error
  }
}
type ContinuityMutation<Result> = { continuity: GameOsContinuityRecord; result: Result }
const mutateGameOsContinuity = async <Result>(
  store: GameOsContinuityStore,
  args: { lease: GameOsWorldLease; expectedRevision: string; nowMs: number },
  update: (current: GameOsRestoreReport) => ContinuityMutation<Result>,
): Promise<ContinuityMutation<Result>> => {
  const worldId = args.lease.worldId
  const raw = await store.get(worldId)
  if (!raw) throw new GameOsError('lease_lost', `World ${worldId} has no write lease.`)
  const envelope = parseGameOsWorldEnvelope(raw, worldId)
  assertGameOsWorldLeaseInEnvelope(envelope, args.lease, args.nowMs)
  if (!envelope.continuity) {
    throw new GameOsError('record_malformed', `World ${worldId} has no continuity record.`, {
      recordId: `world:${worldId}`,
    })
  }
  const current = restoreGameOsContinuityRecord(continuityStoreRecord(envelope.continuity), worldId)
  if (current.continuity.revision !== args.expectedRevision) {
    throw new GameOsError('lease_lost', `World ${worldId} changed before mutation.`)
  }
  const mutation = update(current)
  const nextEnvelope = sealGameOsWorldEnvelope({ worldId, lease: envelope.lease, continuity: mutation.continuity })
  if (!await store.compareAndPut(worldId, gameOsEnvelopeStoreRecord(nextEnvelope), envelope.revision)) {
    throw new GameOsError('lease_lost', `World ${worldId} changed during mutation.`)
  }
  return mutation
}
const pendingOrders = (record: GameOsContinuityRecord): GameOsOrder[] =>
  record.acceptedOrderJournal.slice(record.committedOrderCount).map(entry => entry.order)
const appendAcceptedOrders = (record: GameOsContinuityRecord, orders: readonly GameOsOrder[]): GameOsAcceptedOrderEntry[] => [
  ...record.acceptedOrderJournal,
  ...orders.map((order, index) => ({ schema: GAME_OS_ACCEPTED_ORDER_SCHEMA,
    ordinal: record.acceptedOrderJournal.length + index + 1, order } as GameOsAcceptedOrderEntry)),
]
const commitAcceptedOrders = (
  current: GameOsRestoreReport,
  acceptedOrderJournal: GameOsAcceptedOrderEntry[] | null,
  orders: readonly GameOsOrder[],
  snapshotInterval = DEFAULT_SNAPSHOT_INTERVAL,
): ContinuityMutation<GameOsStepResult> => {
  if (!Number.isSafeInteger(snapshotInterval) || snapshotInterval < 1) {
    throw new GameOsError('input-invalid', 'snapshotInterval must be a positive integer.')
  }
  const step = advancePersistentStrategyWorld(current.state, orders)
  const durableOrderJournal = acceptedOrderJournal
    ?? appendAcceptedOrders(current.continuity, step.acceptedOrders)
  const entry: GameOsJournalEntry = {
    schema: GAME_OS_JOURNAL_ENTRY_SCHEMA,
    tick: step.state.tick,
    priorStateDigest: current.matchedDigest,
    resultStateDigest: step.stateDigest,
    orders: step.acceptedOrders,
    costRecords: step.costRecords,
  }
  const snapshots = [...current.continuity.snapshots]
  if (step.state.tick % snapshotInterval === 0) {
    snapshots.push({
      schema: GAME_OS_SNAPSHOT_SCHEMA,
      tick: step.state.tick,
      state: step.state,
      stateDigest: step.stateDigest,
    })
  }
  const continuity = sealContinuity({
    ...current.continuity,
    committedStateDigest: step.stateDigest,
    acceptedOrderJournal: durableOrderJournal,
    committedOrderCount: durableOrderJournal.length,
    snapshots,
    journal: [...current.continuity.journal, entry],
  })
  return { result: step, continuity }
}
export const acceptGameOsWorldOrders = async (
  store: GameOsContinuityStore,
  args: { lease: GameOsWorldLease; expectedRevision: string; orders: readonly GameOsOrder[]; nowMs: number },
): Promise<{ continuity: GameOsContinuityRecord; pendingOrderCount: number }> => {
  if (!Array.isArray(args.orders) || args.orders.length === 0) {
    throw new GameOsError('order-invalid', 'Order acceptance requires at least one typed order.')
  }
  const mutation = await mutateGameOsContinuity(store, args, current => {
    const pending = pendingOrders(current.continuity)
    const acceptedOrders = advancePersistentStrategyWorld(current.state, [...pending, ...args.orders])
      .acceptedOrders.slice(pending.length)
    const acceptedOrderJournal = appendAcceptedOrders(current.continuity, acceptedOrders)
    return {
      continuity: sealContinuity({ ...current.continuity, acceptedOrderJournal }),
      result: acceptedOrderJournal.length - current.continuity.committedOrderCount,
    }
  })
  return { continuity: mutation.continuity, pendingOrderCount: mutation.result }
}
export const commitPendingGameOsWorldOrders = async (
  store: GameOsContinuityStore,
  args: { lease: GameOsWorldLease; expectedRevision: string; nowMs: number; snapshotInterval?: number },
): Promise<{ step: GameOsStepResult; continuity: GameOsContinuityRecord }> => {
  const mutation = await mutateGameOsContinuity(store, args, current => {
    const orders = pendingOrders(current.continuity)
    if (orders.length === 0) throw new GameOsError('order-invalid', 'No accepted orders await commit.')
    return commitAcceptedOrders(current, current.continuity.acceptedOrderJournal, orders, args.snapshotInterval)
  })
  return { step: mutation.result, continuity: mutation.continuity }
}
export const commitGameOsWorldStep = async (
  store: GameOsContinuityStore,
  args: { lease: GameOsWorldLease; expectedRevision: string; orders: readonly GameOsOrder[]; nowMs: number; snapshotInterval?: number },
): Promise<{ step: GameOsStepResult; continuity: GameOsContinuityRecord }> => {
  const mutation = await mutateGameOsContinuity(store, args, current => {
    const pending = pendingOrders(current.continuity)
    if (pending.length > 0) {
      throw new GameOsError('order-invalid', `World ${args.lease.worldId} has externally accepted orders.`, {
        worldId: args.lease.worldId,
        pendingOrderCount: pending.length,
        pendingOrderSource: 'embedded-tool',
      })
    }
    return commitAcceptedOrders(current, null, args.orders, args.snapshotInterval)
  })
  return { step: mutation.result, continuity: mutation.continuity }
}
export const resetGameOsWorld = async (
  store: GameOsContinuityStore,
  args: { lease: GameOsWorldLease; seed: string | number; nowMs: number; definition?: GameOsPersistentStrategyWorldDefinition },
): Promise<GameOsRestoreReport> => {
  const raw = await store.get(args.lease.worldId)
  if (!raw) throw new GameOsError('lease_lost', `World ${args.lease.worldId} has no write lease.`)
  const envelope = parseGameOsWorldEnvelope(raw, args.lease.worldId)
  assertGameOsWorldLeaseInEnvelope(envelope, args.lease, args.nowMs)
  const definition = resolveGameOsResetDefinition({ worldId: args.lease.worldId,
    requested: args.definition, stored: envelope.continuity?.snapshots[0]?.state.definition })
  const continuity = createGameOsContinuityRecord(
    createPersistentStrategyWorld({ worldId: args.lease.worldId, seed: args.seed, definition }),
  )
  const nextEnvelope = sealGameOsWorldEnvelope({ worldId: args.lease.worldId,
    lease: envelope.lease, continuity })
  if (!await store.compareAndPut(
    args.lease.worldId,
    gameOsEnvelopeStoreRecord(nextEnvelope),
    envelope.revision,
  )) {
    throw new GameOsError('lease_lost', `World ${args.lease.worldId} changed during reset.`)
  }
  return restoreGameOsContinuityRecord(continuityStoreRecord(continuity), args.lease.worldId)
}
export const explicitlyResetGameOsWorldRecord = async (
  store: GameOsContinuityStore,
  args: { worldId: string; seed: string | number; sessionId: string; nowMs: number
    definition?: GameOsPersistentStrategyWorldDefinition
  },
): Promise<GameOsRestoreReport> => {
  let worldId: string
  let sessionId: string
  try {
    worldId = exactText(args.worldId, 'worldId')
    sessionId = exactText(args.sessionId, 'sessionId')
  } catch {
    throw new GameOsError('input-invalid', 'Explicit reset requires worldId and an internal sessionId.')
  }
  if (!Number.isSafeInteger(args.nowMs) || args.nowMs < 1) {
    throw new GameOsError('input-invalid', 'Explicit reset requires a positive integer clock value.')
  }
  const current = await store.getVersioned(worldId, { opaque: true })
  const currentRecord = current?.value && typeof current.value === 'object' && !Array.isArray(current.value)
    ? current.value as Record<string, unknown>
    : null
  const rawLease = currentRecord?.lease
  if (rawLease && typeof rawLease === 'object' && !Array.isArray(rawLease)) {
    try {
      const lease = parseGameOsWorldLease(rawLease as Record<string, unknown>, worldId)
      if (lease.expiresAtMs > args.nowMs) {
        throw new GameOsError('lease_lost', `World ${worldId} has a live writer and cannot be reset.`, {
          worldId,
          incumbentSessionId: lease.sessionId,
          expiresAtMs: lease.expiresAtMs,
        })
      }
    } catch (error) {
      if (error instanceof GameOsError && error.code === 'lease_lost'
        && error.details.incumbentSessionId) throw error
      // A malformed lease has no valid authority; the enclosing CAS still fences replacement.
    }
  }
  const definition = resolveGameOsResetDefinitionFromRecord({ worldId,
    requested: args.definition, storedRecord: currentRecord })
  const continuity = createGameOsContinuityRecord(createPersistentStrategyWorld({ worldId,
    seed: args.seed, definition }))
  const nextEnvelope = sealGameOsWorldEnvelope({ worldId, lease: null, continuity })
  if (!await store.compareAndPut(
    worldId,
    gameOsEnvelopeStoreRecord(nextEnvelope),
    current?.revision ?? null,
  )) {
    throw new GameOsError('lease_lost', `World ${worldId} changed during explicit reset.`, {
      worldId,
    })
  }
  return restoreGameOsContinuityRecord(continuityStoreRecord(continuity), worldId)
}
