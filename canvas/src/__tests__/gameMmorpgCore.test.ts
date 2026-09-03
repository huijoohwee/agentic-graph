import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, test } from 'node:test'
import '@/features/game-mmorpg/gameMmorpgCoreDispose.contract.test'
import Dexie from 'dexie'
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import { createAgenticGraphStorageEnginePersistence } from '@/lib/storage/agentic-graph-storage-engine-persistence'
import {
  GAME_MMORPG_MODE_IDENTITY,
  createGameMmorpgContinuityStore,
  createGameMmorpgCoreFromPersistence,
} from '@/features/game-mmorpg/gameMmorpgCore'
import { createGameMmorpgEmbeddedToolSurface } from '@/features/game-mmorpg/gameMmorpgToolSurface'
import {
  GAME_OS_CONTROL_TOOL_ID,
  DEFAULT_PERSISTENT_STRATEGY_WORLD_DEFINITION,
  GAME_OS_INDEXED_DB_STORE,
  GAME_OS_INSPECT_TOOL_ID,
  acquireGameOsWorldLease,
  advancePersistentStrategyWorld,
  canonicalGameOsString,
  commitGameOsWorldStep,
  createGameOsContinuityRecord,
  createPersistentStrategyWorld,
  explicitlyResetGameOsWorldRecord,
  gameOsDigest,
  openGameOsIndexedDbContinuityStore,
  openGameOsWorld,
  releaseGameOsWorldLease,
  sealGameOsWorldEnvelope,
  type GameOsWorldState,
} from '../../../grph-shared/src/game-os/index.js'

Dexie.dependencies.indexedDB = indexedDB
Dexie.dependencies.IDBKeyRange = IDBKeyRange

let databaseSequence = 0

const openRawIndexedDb = (databaseName: string, version: number): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, version)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(GAME_OS_INDEXED_DB_STORE)) {
        request.result.createObjectStore(GAME_OS_INDEXED_DB_STORE, { keyPath: 'worldId' })
      }
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })

const deleteRawIndexedDb = (databaseName: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error(`delete blocked: ${databaseName}`))
    request.onsuccess = () => resolve()
  })

const putRawIndexedDb = async (databaseName: string, value: Record<string, unknown>): Promise<void> => {
  const database = await openRawIndexedDb(databaseName, 1)
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(GAME_OS_INDEXED_DB_STORE, 'readwrite')
    transaction.objectStore(GAME_OS_INDEXED_DB_STORE).put(value)
    transaction.onerror = () => reject(transaction.error)
    transaction.oncomplete = () => resolve()
  })
  database.close()
}

const moveAndClaim = (state: GameOsWorldState) => {
  const unit = state.units.find(candidate => candidate.factionId === 'aurora')!
  const origin = state.territories.find(candidate => candidate.id === unit.territoryId)!
  const territoryId = origin.neighborIds.find(id =>
    state.territories.find(candidate => candidate.id === id)?.ownerFactionId !== 'aurora')!
  return [
    { type: 'move-unit' as const, sequence: state.lastOrderSequence + 1,
      factionId: 'aurora', unitId: unit.id, targetTerritoryId: territoryId },
    { type: 'claim-territory' as const, sequence: state.lastOrderSequence + 2,
      factionId: 'aurora', unitId: unit.id, territoryId },
  ]
}

describe('Game MMORPG browser persistence contract', () => {
  test('reopens the last committed tick through the existing IndexedDB persistence owner', async () => {
    const databaseName = `kg:game-mmorpg:${databaseSequence++}`
    const originalFetch = globalThis.fetch
    let outboundRequests = 0
    let exitCount = 0
    globalThis.fetch = async () => {
      outboundRequests += 1
      throw new Error('network-disabled')
    }
    const firstPersistence = await createAgenticGraphStorageEnginePersistence({ databaseName })
    const firstCore = createGameMmorpgCoreFromPersistence({
      persistence: firstPersistence,
      onModeExit: () => { exitCount += 1 },
    })
    let secondPersistence: Awaited<ReturnType<typeof createAgenticGraphStorageEnginePersistence>> | null = null
    try {
      const firstSession = await firstCore.open({
        worldId: 'browser-world',
        seed: 'device-local',
        sessionId: 'tab-a',
        nowMs: 1_000,
        leaseTtlMs: 10_000,
      })
      assert.equal(firstCore.registry.listModes()[0].identity, GAME_MMORPG_MODE_IDENTITY)
      assert.equal(firstCore.registry.liveOverlayCount, 1)
      const committedState = await firstSession.step(moveAndClaim(firstSession.inspect().state), 2_000)
      const committed = firstSession.inspect()
      assert.equal(committed.tick, 1)
      assert.equal(committed.state.factions.find(faction => faction.id === 'aurora')?.supply, 3)
      const status = await firstSession.status('world_continuity', 2_000)
      assert.equal(status.entries[0].restoredTick, 1)
      assert.equal(status.costRecord.estimated_cost_usd, 0)
      assert.equal(firstCore.resolveAsset('neutral-world-mesh').loadPolicy, 'committed-local-only')
      assert.equal(
        firstCore.parseInvocation('/world @game-os #persistent-world operation=resume').arguments.operation,
        'resume',
      )
      await firstSession.close()
      assert.equal(firstCore.registry.liveOverlayCount, 0)
      assert.equal(exitCount, 1)
      await firstCore.dispose()
      await firstPersistence.close()

      secondPersistence = await createAgenticGraphStorageEnginePersistence({ databaseName })
      const secondCore = createGameMmorpgCoreFromPersistence({ persistence: secondPersistence })
      const restoredSession = await secondCore.open({
        worldId: 'browser-world',
        seed: 'device-local',
        sessionId: 'tab-b',
        nowMs: 3_000,
        leaseTtlMs: 10_000,
      })
      assert.equal(restoredSession.inspect().tick, 1)
      assert.equal(restoredSession.inspect().digest, committed.digest)
      assert.deepEqual(restoredSession.inspect().state, committedState)
      const contenderCore = createGameMmorpgCoreFromPersistence({ persistence: secondPersistence })
      await assert.rejects(
        () => contenderCore.open({
          worldId: 'browser-world',
          seed: 'device-local',
          sessionId: 'tab-c',
          nowMs: 4_000,
          leaseTtlMs: 10_000,
        }),
        (error: unknown) => {
          assert.equal((error as { code?: string }).code, 'lease_lost')
          return true
        },
      )
      await contenderCore.dispose()
      assert.equal(restoredSession.inspect().digest, committed.digest)
      assert.equal(outboundRequests, 0)
      await restoredSession.close()
      await secondCore.dispose()
    } finally {
      globalThis.fetch = originalFetch
      await firstPersistence.close()
      if (secondPersistence) await secondPersistence.remove()
      else await firstPersistence.remove()
    }
  })

  test('stays a thin import-only adapter over shared core and the existing persistence owner', async () => {
    const sources = await Promise.all([
      'gameMmorpgCore.ts', 'gameMmorpgToolSurface.ts',
    ].map(fileName => readFile(new URL(`../features/game-mmorpg/${fileName}`, import.meta.url), 'utf8')))
    assert.match(sources[0], /grph-shared\/src\/game-os\/index\.js/u)
    assert.match(sources[0], /lib\/storage\/agenticGraphStorageEnginePersistence/u)
    for (const source of sources) {
      assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|https?:\/\//u)
      assert.doesNotMatch(source, /three|WebGL|renderer|createObjectStore|indexedDB\.open|new GameOsModeRegistry|modelTransport|authoringAssist|externalGameRuntime/iu)
    }
    const persistence = await createAgenticGraphStorageEnginePersistence({ forceMemory: true })
    const degraded = { ...persistence, persistence: { getState: () =>
      ({ mode: 'memory' as const, status: 'degraded' as const, error: 'indexeddb-failed' }) } }
    assert.throws(() => createGameMmorpgContinuityStore(degraded),
      (error: unknown) => (error as { code?: string }).code === 'store_unavailable')
    const failure = async () => { throw new Error('persistence-unavailable') }
    const failingStore = createGameMmorpgContinuityStore({ ...persistence, records: { ...persistence.records,
      get: failure, compareAndPut: failure, compareAndRemove: failure } })
    for (const operation of [() => failingStore.get('x'), () => failingStore.getVersioned('x'),
      () => failingStore.compareAndPut('x', { revision: 'r' }, null),
      () => failingStore.compareAndDelete('x', 'r')]) {
      await assert.rejects(operation, (error: unknown) =>
        (error as { code?: string }).code === 'store_unavailable')
    }
    await persistence.close()
  })

  test('catalogues and dispatches one read tool and one action-gated local control tool', async () => {
    const databaseName = `kg:game-mmorpg-tools:${databaseSequence++}`
    const persistence = await createAgenticGraphStorageEnginePersistence({ databaseName })
    const core = createGameMmorpgCoreFromPersistence({ persistence })
    let toolNow = 1_000
    let sessionSequence = 0
    const surface = createGameMmorpgEmbeddedToolSurface(core, {
      clock: () => toolNow,
      sessionIdFactory: () => `internal-tool-session-${++sessionSequence}`,
      leaseTtlMs: 10_000,
    })
    try {
      assert.deepEqual(surface.tools.map(tool => [tool.identity, tool.name]), [
        [GAME_OS_INSPECT_TOOL_ID, 'inspect_game_os'],
        [GAME_OS_CONTROL_TOOL_ID, 'control_local_world'],
      ])
      assert.deepEqual(surface.tools.map(tool => [
        tool.identity,
        tool.destructive,
        tool.annotations.destructiveHint,
      ]), [
        [GAME_OS_INSPECT_TOOL_ID, false, false],
        [GAME_OS_CONTROL_TOOL_ID, true, true],
      ])
      assert.doesNotMatch(JSON.stringify(surface.tools[1].inputSchema), /nowMs|sessionId|leaseTtlMs/u)
      await assert.rejects(
        () => surface.invoke(GAME_OS_CONTROL_TOOL_ID, {
          operation: 'open', playerActionConfirmed: false, worldId: 'tool-world',
          seed: 'tool-seed',
        }),
        (error: unknown) => (error as { code?: string }).code === 'input-invalid',
      )
      for (const callerAuthority of [
        { nowMs: Number.MAX_SAFE_INTEGER }, { sessionId: 'incumbent' }, { leaseTtlMs: 999_999_999 },
      ]) {
        await assert.rejects(
          () => surface.invoke(GAME_OS_CONTROL_TOOL_ID, {
            operation: 'open', playerActionConfirmed: true, worldId: 'tool-world',
            seed: 'tool-seed', ...callerAuthority,
          }),
          (error: unknown) => (error as { code?: string }).code === 'input-invalid',
        )
      }
      await assert.rejects(
        () => surface.invoke(GAME_OS_INSPECT_TOOL_ID, {
          view: 'lease_state', worldId: 'tool-world', nowMs: 1,
        }),
        (error: unknown) => (error as { code?: string }).code === 'input-invalid',
      )
      const unleased = await surface.invoke(GAME_OS_INSPECT_TOOL_ID, {
        view: 'lease_state', worldId: 'tool-world',
      })
      assert.equal('entries' in unleased && unleased.entries[0].state, 'unleased')

      const opened = await surface.invoke(GAME_OS_CONTROL_TOOL_ID, {
        invocation: '/world @game-os #persistent-world operation=open',
        playerActionConfirmed: true,
        worldId: 'tool-world',
        seed: 'tool-seed',
      })
      assert.deepEqual('status' in opened && [opened.status, opened.projectionGap], ['opened', null])
      const activeLease = await surface.invoke(GAME_OS_INSPECT_TOOL_ID, {
        view: 'lease_state', worldId: 'tool-world',
      })
      assert.equal('entries' in activeLease && activeLease.entries[0].sessionId, 'internal-tool-session-1')
      assert.equal('entries' in activeLease && activeLease.entries[0].expiresAtMs, 11_000)
      const initial = createPersistentStrategyWorld({ worldId: 'tool-world', seed: 'tool-seed' })
      toolNow = 2_000
      const queuedPromise = surface.invoke(GAME_OS_CONTROL_TOOL_ID, {
        operation: 'order', playerActionConfirmed: true, worldId: 'tool-world',
        orders: moveAndClaim(initial),
      })
      const queued = await queuedPromise
      assert.equal('pendingOrderCount' in queued && queued.pendingOrderCount, 2)
      const durablePending = await surface.invoke(GAME_OS_INSPECT_TOOL_ID, {
        view: 'world_continuity', worldId: 'tool-world',
      })
      assert.deepEqual('entries' in durablePending && [
        durablePending.entries[0].acceptedOrderCount,
        durablePending.entries[0].pendingOrderCount,
        durablePending.entries[0].journalLength,
      ], [2, 2, 0])
      await surface.invoke(GAME_OS_CONTROL_TOOL_ID, {
        operation: 'close', playerActionConfirmed: true, worldId: 'tool-world',
      })
      toolNow = 2_100
      const pendingResume = await surface.invoke(GAME_OS_CONTROL_TOOL_ID, {
        operation: 'resume', playerActionConfirmed: true, worldId: 'tool-world', seed: 'tool-seed',
      })
      assert.deepEqual('tick' in pendingResume && [
        pendingResume.tick, pendingResume.pendingOrderCount,
      ], [0, 2])
      toolNow = 2_200
      const hostBlockedPromise = surface.commitOrders(
        'tool-world',
        moveAndClaim(initial),
        2_200,
      )
      const committedPromise = surface.invoke(GAME_OS_CONTROL_TOOL_ID, {
        operation: 'commit', playerActionConfirmed: true, worldId: 'tool-world',
      })
      await assert.rejects(hostBlockedPromise, (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'order-invalid')
        assert.equal((error as { details?: { pendingOrderSource?: string } })
          .details?.pendingOrderSource, 'embedded-tool')
        return true
      })
      const committed = await committedPromise
      assert.equal('status' in committed && committed.status, 'committed')
      assert.equal('tick' in committed && committed.tick, 1)
      assert.equal('costRecord' in committed && committed.costRecord.estimated_cost_usd, 0)
      const agentState = advancePersistentStrategyWorld(initial, moveAndClaim(initial)).state
      const hostState = await surface.commitOrders('tool-world', moveAndClaim(agentState), 2_250)
      assert.equal(hostState.tick, 2)
      const inspected = await surface.invoke(GAME_OS_INSPECT_TOOL_ID, {
        view: 'world_continuity', worldId: 'tool-world',
      })
      assert.equal('entries' in inspected && inspected.entries[0].restoredTick, 2)
      await assert.rejects(
        () => surface.invoke(GAME_OS_CONTROL_TOOL_ID, {
          operation: 'commit', playerActionConfirmed: true, worldId: 'tool-world',
          remoteUrl: 'forbidden',
        }),
        (error: unknown) => (error as { code?: string }).code === 'input-invalid',
      )
      toolNow = 2_300
      await surface.invoke(GAME_OS_CONTROL_TOOL_ID, {
        operation: 'close', playerActionConfirmed: true, worldId: 'tool-world',
      })
      toolNow = 3_000
      const resumed = await surface.invoke(GAME_OS_CONTROL_TOOL_ID, {
        operation: 'resume', playerActionConfirmed: true, worldId: 'tool-world',
        seed: 'tool-seed',
      })
      assert.equal('tick' in resumed && resumed.tick, 2)
      const renewed = await surface.renewActive(3_500, 12_000)
      assert.equal(renewed.expiresAtMs, 15_500)
      await assert.rejects(
        () => surface.renewActive(15_500, 12_000),
        (error: unknown) => (error as { code?: string }).code === 'lease_lost',
      )
      const store = createGameMmorpgContinuityStore(persistence)
      const successor = await acquireGameOsWorldLease(store, {
        worldId: 'tool-world', sessionId: 'agent-c', nowMs: 15_501, ttlMs: 1_000,
      })
      await assert.rejects(
        () => surface.renewActive(15_502, 12_000),
        (error: unknown) => (error as { code?: string }).code === 'lease_lost',
      )
      toolNow = 15_502
      const successorStatus = await surface.invoke(GAME_OS_INSPECT_TOOL_ID, {
        view: 'lease_state', worldId: 'tool-world',
      })
      assert.equal('entries' in successorStatus && successorStatus.entries[0].sessionId, 'agent-c')
      assert.equal(await releaseGameOsWorldLease(store, successor), true)
      await surface.dispose()
      await core.dispose()
    } finally {
      await surface.dispose()
      await core.dispose()
      await persistence.remove()
    }
  })

  test('explicit tool reset atomically repairs a truncated record without overriding a live writer', async () => {
    const databaseName = `kg:game-os-corrupt-reset:${databaseSequence++}`
    const persistence = await createAgenticGraphStorageEnginePersistence({ databaseName })
    const store = createGameMmorpgContinuityStore(persistence)
    const core = createGameMmorpgCoreFromPersistence({ persistence })
    let toolNow = 1_000
    let sessionSequence = 0
    const surface = createGameMmorpgEmbeddedToolSurface(core, {
      clock: () => toolNow,
      sessionIdFactory: () => `repair-session-${++sessionSequence}`,
      leaseTtlMs: 10_000,
    })
    try {
      await surface.invoke(GAME_OS_CONTROL_TOOL_ID, {
        operation: 'open', playerActionConfirmed: true, worldId: 'repair-world', seed: 'repair-seed',
      })
      toolNow = 1_100
      await surface.invoke(GAME_OS_CONTROL_TOOL_ID, {
        operation: 'close', playerActionConfirmed: true, worldId: 'repair-world',
      })
      const valid = await store.getVersioned('repair-world')
      assert.ok(valid)
      assert.equal(await store.compareAndPut('repair-world', {
        schema: 'truncated-envelope',
        worldId: 'repair-world',
        revision: 'corrupt-record-v1',
        lease: null,
      }, valid.revision), true)
      const corruptBefore = canonicalGameOsString(await store.getVersioned('repair-world'))
      toolNow = 1_200
      await assert.rejects(
        () => surface.invoke(GAME_OS_CONTROL_TOOL_ID, {
          operation: 'resume', playerActionConfirmed: true,
          worldId: 'repair-world', seed: 'repair-seed',
        }),
        (error: unknown) => (error as { code?: string }).code === 'record_malformed',
      )
      assert.equal(canonicalGameOsString(await store.getVersioned('repair-world')), corruptBefore)
      assert.equal(core.registry.liveOverlayCount, 0)
      toolNow = 1_300
      const reset = await surface.invoke(GAME_OS_CONTROL_TOOL_ID, {
        operation: 'reset', playerActionConfirmed: true,
        worldId: 'repair-world', seed: 'repair-seed',
      })
      assert.equal('status' in reset && reset.status, 'reset')
      toolNow = 1_400
      const reopened = await surface.invoke(GAME_OS_CONTROL_TOOL_ID, {
        operation: 'resume', playerActionConfirmed: true,
        worldId: 'repair-world', seed: 'repair-seed',
      })
      assert.equal('tick' in reopened && reopened.tick, 0)
      await assert.rejects(
        () => core.resetWorld({
          worldId: 'repair-world', seed: 'replacement', sessionId: 'host-reset', nowMs: 1_500,
        }),
        (error: unknown) => (error as { code?: string }).code === 'lease_lost',
      )
      await surface.invoke(GAME_OS_CONTROL_TOOL_ID, {
        operation: 'close', playerActionConfirmed: true, worldId: 'repair-world',
      })
    } finally {
      await surface.dispose()
      await core.dispose()
      await persistence.remove()
    }
  })

  test('rejects a fully resealed world with broken entity references before overlay creation', async () => {
    const databaseName = `kg:game-os-invalid-state:${databaseSequence++}`
    const persistence = await createAgenticGraphStorageEnginePersistence({ databaseName })
    const store = createGameMmorpgContinuityStore(persistence)
    const core = createGameMmorpgCoreFromPersistence({ persistence })
    try {
      const state = JSON.parse(JSON.stringify(createPersistentStrategyWorld({
        worldId: 'invalid-state-world', seed: 'invalid-state',
      }))) as GameOsWorldState
      state.units[0].territoryId = 'missing-territory'
      const stateDigest = gameOsDigest(state)
      const initial = createGameOsContinuityRecord(createPersistentStrategyWorld({
        worldId: state.worldId, seed: state.seed,
      }))
      const unsigned = {
        schema: initial.schema,
        worldId: initial.worldId,
        seed: initial.seed,
        initialStateDigest: initial.initialStateDigest,
        committedStateDigest: initial.committedStateDigest,
        acceptedOrderJournal: initial.acceptedOrderJournal,
        committedOrderCount: initial.committedOrderCount,
        snapshots: [{ ...initial.snapshots[0], state, stateDigest }],
        journal: [],
      }
      const continuity = { ...unsigned, revision: gameOsDigest(unsigned) }
      const envelope = sealGameOsWorldEnvelope({
        worldId: state.worldId,
        lease: null,
        continuity,
      })
      assert.equal(await store.compareAndPut(
        state.worldId,
        envelope as unknown as Record<string, unknown>,
        null,
      ), true)
      const before = canonicalGameOsString(await store.getVersioned(state.worldId))
      await assert.rejects(
        () => core.open({
          worldId: state.worldId, seed: state.seed,
          sessionId: 'invalid-state-session', nowMs: 1_000, leaseTtlMs: 10_000,
        }),
        (error: unknown) => (error as { code?: string }).code === 'record_malformed',
      )
      assert.equal(core.registry.liveOverlayCount, 0)
      assert.equal(canonicalGameOsString(await store.getVersioned(state.worldId)), before)
      const incumbent = await acquireGameOsWorldLease(store, {
        worldId: state.worldId, sessionId: 'invalid-state-incumbent',
        nowMs: 2_000, ttlMs: 10_000,
      })
      const leasedBefore = canonicalGameOsString(await store.getVersioned(state.worldId))
      await assert.rejects(
        () => core.open({
          worldId: state.worldId, seed: state.seed,
          sessionId: 'invalid-state-contender', nowMs: 2_100, leaseTtlMs: 10_000,
        }),
        (error: unknown) => (error as { code?: string }).code === 'lease_lost',
      )
      assert.equal(canonicalGameOsString(await store.getVersioned(state.worldId)), leasedBefore)
      assert.equal(await releaseGameOsWorldLease(store, incumbent), true)
    } finally {
      await core.dispose()
      await persistence.remove()
    }
  })

  test('shared IndexedDB store makes competing compare-and-put transactions atomic', async () => {
    const databaseName = `kg:game-os-shared-cas:${databaseSequence++}`
    const first = await openGameOsIndexedDbContinuityStore({ indexedDB, databaseName })
    const second = await openGameOsIndexedDbContinuityStore({ indexedDB, databaseName })
    try {
      const record = (seed: string) => sealGameOsWorldEnvelope({ worldId: 'atomic-world', lease: null,
        continuity: createGameOsContinuityRecord(createPersistentStrategyWorld({ worldId: 'atomic-world', seed })) })
      const initial = record('initial'); const left = record('left'); const right = record('right')
      assert.equal(await first.compareAndPut('atomic-world', initial as unknown as Record<string, unknown>, null), true)
      assert.equal((await first.getVersioned('atomic-world'))?.revision, initial.revision)
      const outcomes = await Promise.all([
        first.compareAndPut('atomic-world', left as unknown as Record<string, unknown>, initial.revision),
        second.compareAndPut('atomic-world', right as unknown as Record<string, unknown>, initial.revision),
      ])
      assert.equal(outcomes.filter(Boolean).length, 1)
      const stored = await second.get('atomic-world')
      assert.ok(stored && ['left', 'right'].includes((stored.continuity as { seed: string }).seed))
      assert.equal(await first.compareAndPut('atomic-world', record('stale') as unknown as Record<string, unknown>,
        initial.revision), false)
      const activeRevision = (await first.getVersioned('atomic-world'))!.revision
      assert.equal(await second.compareAndDelete('atomic-world', initial.revision), false)
      assert.equal(await first.compareAndDelete('atomic-world', activeRevision), true)
      assert.equal(await second.get('atomic-world'), null)
      const repair = sealGameOsWorldEnvelope({ worldId: 'repair-opaque', lease: null, continuity: null })
      assert.equal(await first.compareAndPut('repair-opaque', repair as unknown as Record<string, unknown>, null), true)
      await putRawIndexedDb(databaseName, { worldId: 'repair-opaque', revision: repair.revision,
        value: { truncated: true } })
      await assert.rejects(() => first.get('repair-opaque'),
        (error: unknown) => (error as { code?: string }).code === 'record_malformed')
      assert.deepEqual((await first.getVersioned('repair-opaque'))?.value, { truncated: true })
      for (const malformed of [{ worldId: 'repair-opaque', revision: repair.revision,
        value: { truncated: true }, legacy: true },
      { worldId: 'repair-opaque', revision: 1, value: { truncated: true } }]) {
        await putRawIndexedDb(databaseName, malformed)
        await assert.rejects(() => first.getVersioned('repair-opaque'),
          (error: unknown) => (error as { code?: string }).code === 'record_malformed')
      }
      await putRawIndexedDb(databaseName, { worldId: 'repair-opaque', revision: repair.revision,
        value: { truncated: true } })
      const repaired = await explicitlyResetGameOsWorldRecord(first, { worldId: 'repair-opaque', seed: 1,
        sessionId: 'repairer', nowMs: 1, definition: DEFAULT_PERSISTENT_STRATEGY_WORLD_DEFINITION })
      assert.equal(repaired.restoredTick, 0)
      const opened = await openGameOsWorld(first, {
        worldId: 'shared-browser-world', seed: 'shared-store', sessionId: 'first-tab',
        nowMs: 100, leaseTtlMs: 1_000,
      })
      const committed = await commitGameOsWorldStep(first, {
        lease: opened.lease,
        expectedRevision: opened.restore.continuity.revision,
        orders: moveAndClaim(opened.restore.state),
        nowMs: 200,
      })
      await releaseGameOsWorldLease(first, opened.lease)
      const reopened = await openGameOsWorld(second, {
        worldId: 'shared-browser-world', seed: 'shared-store', sessionId: 'second-tab',
        nowMs: 300, leaseTtlMs: 1_000,
      })
      assert.equal(reopened.restore.matchedDigest, committed.step.stateDigest)
      assert.equal(reopened.restore.restoredTick, 1)
      await releaseGameOsWorldLease(second, reopened.lease)
    } finally {
      first.close()
      second.close()
      await deleteRawIndexedDb(databaseName)
    }
  })

  test('shared IndexedDB store fails blocked upgrades and closes on version change', async () => {
    const blockedName = `kg:game-os-shared-blocked:${databaseSequence++}`
    const blocker = await openRawIndexedDb(blockedName, 1)
    let blockedEvents = 0
    try {
      await assert.rejects(
        () => openGameOsIndexedDbContinuityStore({
          indexedDB,
          databaseName: blockedName,
          version: 2,
          onUpgradeBlocked: () => { blockedEvents += 1 },
        }),
        (error: unknown) => (error as { code?: string }).code === 'store_unavailable',
      )
      assert.equal(blockedEvents, 1)
    } finally {
      blocker.close()
    }
    const drainedUpgrade = await openRawIndexedDb(blockedName, 2)
    drainedUpgrade.close()
    await deleteRawIndexedDb(blockedName)

    const versionedName = `kg:game-os-shared-versioned:${databaseSequence++}`
    let versionChanges = 0
    const shared = await openGameOsIndexedDbContinuityStore({
      indexedDB,
      databaseName: versionedName,
      onVersionChange: () => { versionChanges += 1 },
    })
    const upgraded = await openRawIndexedDb(versionedName, 2)
    try {
      assert.equal(versionChanges, 1)
      await assert.rejects(
        () => shared.get('closed-world'),
        (error: unknown) => (error as { code?: string }).code === 'store_unavailable',
      )
    } finally {
      shared.close()
      upgraded.close()
      await deleteRawIndexedDb(versionedName)
    }
  })
})
