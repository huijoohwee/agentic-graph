import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { indexedDB } from 'fake-indexeddb'
import {
  DEFAULT_PERSISTENT_STRATEGY_WORLD_DEFINITION,
  GAME_OS_INDEXED_DB_STORE,
  GameOsError,
  advancePersistentStrategyWorld,
  canonicalGameOsBytes,
  commitGameOsWorldStep,
  createPersistentStrategyWorld,
  explicitlyResetGameOsWorldRecord,
  gameOsDigest,
  openGameOsIndexedDbContinuityStore,
  openGameOsWorld,
  readGameOsWorld,
  sealGameOsWorldEnvelope,
} from '../../dist/game-os/index.js'

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))
const assertGameOsError = (error, code) => {
  assert.ok(error instanceof GameOsError)
  assert.equal(error.code, code)
  return true
}
const resealContinuity = continuity => {
  const { revision: _revision, ...unsigned } = continuity
  return { ...unsigned, revision: gameOsDigest(unsigned) }
}
const resealEnvelope = envelope => sealGameOsWorldEnvelope({
  worldId: envelope.worldId,
  lease: envelope.lease,
  continuity: resealContinuity(envelope.continuity),
})

class MemoryStore {
  records = new Map()
  async get(worldId) { return clone(this.records.get(worldId) ?? null) }
  async getVersioned(worldId) {
    const value = await this.get(worldId)
    return value ? { value, revision: value.revision } : null
  }
  async compareAndPut(worldId, value, expectedRevision) {
    const current = this.records.get(worldId)
    const matches = expectedRevision === null ? current === undefined : current?.revision === expectedRevision
    if (!matches) return false
    this.records.set(worldId, clone(value))
    return true
  }
  async compareAndDelete(worldId, expectedRevision) {
    if (this.records.get(worldId)?.revision !== expectedRevision) return false
    this.records.delete(worldId)
    return true
  }
  inspect(worldId) { return clone(this.records.get(worldId)) }
  inject(worldId, value) { this.records.set(worldId, clone(value)) }
}

const moveAndClaim = state => {
  const unit = state.units[0]
  const origin = state.territories.find(territory => territory.id === unit.territoryId)
  const territoryId = origin.neighborIds.find(id =>
    state.territories.find(territory => territory.id === id).ownerFactionId !== unit.factionId)
  return [
    { type: 'move-unit', sequence: state.lastOrderSequence + 1,
      factionId: unit.factionId, unitId: unit.id, targetTerritoryId: territoryId },
    { type: 'claim-territory', sequence: state.lastOrderSequence + 2,
      factionId: unit.factionId, unitId: unit.id, territoryId },
  ]
}

const openRawDatabase = databaseName => new Promise((resolve, reject) => {
  const request = indexedDB.open(databaseName, 1)
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(GAME_OS_INDEXED_DB_STORE)) {
      request.result.createObjectStore(GAME_OS_INDEXED_DB_STORE, { keyPath: 'worldId' })
    }
  }
  request.onerror = () => reject(request.error)
  request.onsuccess = () => resolve(request.result)
})

const putRawRecord = async (databaseName, value) => {
  const database = await openRawDatabase(databaseName)
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(GAME_OS_INDEXED_DB_STORE, 'readwrite')
    transaction.objectStore(GAME_OS_INDEXED_DB_STORE).put(value)
    transaction.onerror = () => reject(transaction.error)
    transaction.oncomplete = resolve
  })
  database.close()
}

const deleteRawDatabase = databaseName => new Promise((resolve, reject) => {
  const request = indexedDB.deleteDatabase(databaseName)
  request.onerror = () => reject(request.error)
  request.onblocked = () => reject(new Error(`delete blocked: ${databaseName}`))
  request.onsuccess = resolve
})

describe('Game OS continuity and world hardening contracts', () => {
  test('opaque IndexedDB values remain CAS-repairable while ordinary reads fail typed', async () => {
    const databaseName = `game-os-opaque-contract-${Date.now()}-${Math.random()}`
    const store = await openGameOsIndexedDbContinuityStore({ indexedDB, databaseName })
    const opaqueValues = [null, undefined, [], 7, 'truncated', false]
    try {
      for (const [index, opaqueValue] of opaqueValues.entries()) {
        const worldId = `opaque-${index}`
        const revision = `opaque-revision-${index}`
        await putRawRecord(databaseName, { worldId, revision, value: opaqueValue })
        await assert.rejects(() => store.get(worldId), error => assertGameOsError(error, 'record_malformed'))
        const versioned = await store.getVersioned(worldId, { opaque: true })
        assert.equal(versioned.revision, revision)
        assert.deepEqual(versioned.value, opaqueValue)
        const restored = await explicitlyResetGameOsWorldRecord(store, {
          worldId,
          seed: index,
          sessionId: `repair-${index}`,
          nowMs: index + 1,
          definition: DEFAULT_PERSISTENT_STRATEGY_WORLD_DEFINITION,
        })
        assert.equal(restored.restoredTick, 0)
        assert.equal((await store.get(worldId)).worldId, worldId)
      }
    } finally {
      store.close()
      await deleteRawDatabase(databaseName)
    }
  })

  test('snapshot fallback is candidate-local but tick-zero and sequence anchors remain authoritative', async () => {
    const store = new MemoryStore()
    const opened = await openGameOsWorld(store, {
      worldId: 'snapshot-contract', seed: 'snapshot-seed', sessionId: 'writer', nowMs: 1, leaseTtlMs: 100,
    })
    const first = await commitGameOsWorldStep(store, {
      lease: opened.lease, expectedRevision: opened.restore.continuity.revision,
      orders: moveAndClaim(opened.restore.state), nowMs: 2, snapshotInterval: 1,
    })
    await commitGameOsWorldStep(store, {
      lease: opened.lease, expectedRevision: first.continuity.revision,
      orders: [], nowMs: 3, snapshotInterval: 1,
    })
    const validEnvelope = store.inspect('snapshot-contract')
    const malformedLatest = clone(validEnvelope)
    malformedLatest.continuity.snapshots[2].legacy = true
    store.inject('snapshot-contract', resealEnvelope(malformedLatest))
    const fallback = await readGameOsWorld(store, 'snapshot-contract')
    assert.equal(fallback.restoredSnapshotTick, 1)
    assert.deepEqual(fallback.rejectedSnapshotTicks, [2])

    const damagedTickZero = clone(validEnvelope)
    damagedTickZero.continuity.snapshots[0].state.factions[0].supply += 1
    damagedTickZero.continuity.snapshots[0].stateDigest = gameOsDigest(
      damagedTickZero.continuity.snapshots[0].state,
    )
    store.inject('snapshot-contract', resealEnvelope(damagedTickZero))
    await assert.rejects(() => readGameOsWorld(store, 'snapshot-contract'), error =>
      assertGameOsError(error, 'digest_mismatch'))

    const forgedSequence = clone(validEnvelope)
    const latest = forgedSequence.continuity.snapshots[2]
    latest.state.lastOrderSequence = 0
    latest.stateDigest = gameOsDigest(latest.state)
    forgedSequence.continuity.journal[1].resultStateDigest = latest.stateDigest
    forgedSequence.continuity.committedStateDigest = latest.stateDigest
    store.inject('snapshot-contract', resealEnvelope(forgedSequence))
    await assert.rejects(() => readGameOsWorld(store, 'snapshot-contract'), error =>
      ['digest_mismatch', 'record_malformed'].includes(error.code))
  })

  test('world ordering, deep state validation, and safe-integer arithmetic are fail-closed', () => {
    const canonical = createPersistentStrategyWorld({ worldId: 'canonical-world', seed: 1 })
    const permutedDefinition = clone(DEFAULT_PERSISTENT_STRATEGY_WORLD_DEFINITION)
    permutedDefinition.factions.reverse()
    const fromPermutation = createPersistentStrategyWorld({
      worldId: 'canonical-world', seed: 1, definition: permutedDefinition,
    })
    assert.deepEqual(canonicalGameOsBytes(fromPermutation), canonicalGameOsBytes(canonical))
    const malformedStates = [
      state => state.factions.reverse(),
      state => state.territories.reverse(),
      state => state.territories[0].neighborIds.reverse(),
      state => state.units.reverse(),
      state => { state.units[0].strength = '1' },
    ]
    for (const mutate of malformedStates) {
      const malformed = clone(canonical)
      mutate(malformed)
      assert.throws(() => advancePersistentStrategyWorld(malformed, []), error =>
        assertGameOsError(error, 'input-invalid'))
    }
    const exhaustedTick = clone(canonical)
    exhaustedTick.tick = Number.MAX_SAFE_INTEGER
    assert.throws(() => advancePersistentStrategyWorld(exhaustedTick, []), error =>
      assertGameOsError(error, 'input-invalid'))
    const exhaustedSupply = clone(canonical)
    exhaustedSupply.factions[0].supply = Number.MAX_SAFE_INTEGER
    assert.throws(() => advancePersistentStrategyWorld(exhaustedSupply, []), error =>
      assertGameOsError(error, 'input-invalid'))
  })
})
