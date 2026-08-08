import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import '../src/game-os/authoring.contract.test.mjs'
import '../src/game-os/control.contract.test.mjs'
import '../src/game-os/continuity-world.contract.test.mjs'
import {
  DEFAULT_PERSISTENT_STRATEGY_WORLD_DEFINITION, GAME_OS_REPOSITORY_ASSET_MANIFEST, GAME_OS_REPOSITORY_ASSET_PROVENANCE_FIXTURE,
  GAME_OS_TOOL_DECLARATIONS, GAME_OS_WORLD_DEFINITION_LIMITS, GAME_OS_ZERO_COST_RECORD, GameOsAssetProvenanceGate,
  GameOsError, GameOsModeRegistry, acceptGameOsWorldOrders, acquireGameOsWorldLease, advancePersistentStrategyWorld, canonicalGameOsBytes,
  canonicalGameOsString, commitGameOsWorldStep, createGameOsAuthoringAssistHarness, createGameOsCoreRuntime, createPersistentStrategyWorld,
  explicitlyResetGameOsWorldRecord, gameOsDigest, openGameOsWorld, parseGameOsInvocation, readGameOsStatus, readGameOsWorld, releaseGameOsWorldLease,
  renewGameOsWorldLease, resetGameOsWorld, sealGameOsWorldEnvelope, validateGameOsAssetManifest,
} from '../dist/game-os/index.js'
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value)); class MemoryContinuityStore {
  #records = new Map(); reads = 0; writes = 0; beforeCompareAndPut = null; failReleaseOnce = false; releases = 0
  async get(worldId) { this.reads += 1; return clone(this.#records.get(worldId) ?? null) }
  async getVersioned(worldId) { const value = await this.get(worldId); return value ? { value, revision: value.revision } : null }
  async compareAndPut(worldId, value, expectedRevision) {
    if (this.beforeCompareAndPut) await this.beforeCompareAndPut({ worldId, value, expectedRevision })
    const current = this.#records.get(worldId)
    if (current?.lease && value.lease === null && this.failReleaseOnce) { this.failReleaseOnce = false; return false }
    const matches = expectedRevision === null ? current == null : current?.revision === expectedRevision
    if (!matches) return false
    if (current?.lease && value.lease === null) this.releases += 1
    this.#records.set(worldId, clone(value))
    this.writes += 1
    return true
  }
  async compareAndDelete(worldId, expectedRevision) { const current = this.#records.get(worldId); if (current?.revision !== expectedRevision) return false
    if (current?.lease) this.releases += 1; this.#records.delete(worldId); this.writes += 1; return true }
  inspect(worldId) { return clone(this.#records.get(worldId) ?? null) }
  inject(worldId, value) { this.#records.set(worldId, clone(value)) }
}
const makeMoveAndClaimOrders = state => {
  const unit = state.units.find(candidate => candidate.factionId === 'aurora')
  const origin = state.territories.find(candidate => candidate.id === unit.territoryId)
  const targetTerritoryId = origin.neighborIds.find(id =>
    state.territories.find(candidate => candidate.id === id).ownerFactionId !== 'aurora')
  return [
    { type: 'move-unit', sequence: state.lastOrderSequence + 1, factionId: 'aurora', unitId: unit.id, targetTerritoryId },
    { type: 'claim-territory', sequence: state.lastOrderSequence + 2, factionId: 'aurora', unitId: unit.id, territoryId: targetTerritoryId },
  ]
}
const CUSTOM_WORLD_DEFINITION = {
  schema: 'knowgrph.game-os-world-definition/v1', identity: 'compact-supply-duel',
  map: { profile: 'compact-islands', topology: 'ring', territoryCount: 4 },
  factions: [{ identity: 'aurora', startingSupply: 5, startingUnits: [{ identity: 'unit-aurora-1', strength: 2 }] },
    { identity: 'ember', startingSupply: 4, startingUnits: [{ identity: 'unit-ember-1', strength: 1 }] }],
  economy: { claimSupplyCost: 1, supplyAccrualPerOwnedTerritory: 2 },
  objectives: [{ identity: 'control-three', kind: 'control-territories', targetTerritoryCount: 3 }],
}
const assertGameOsError = (error, code) => { assert.ok(error instanceof GameOsError)
  assert.equal(error.code, code); return true }
const resealContinuity = continuity => { const { revision: _revision, ...unsigned } = continuity
  return { ...unsigned, revision: gameOsDigest(unsigned) }
}
const resealEnvelope = envelope => sealGameOsWorldEnvelope({ worldId: envelope.worldId,
  lease: envelope.lease, continuity: resealContinuity(envelope.continuity) })
const MODE_OBLIGATIONS = { worldSchema: 'knowgrph.game-os-world/v1', persistence: { continuity: 'required', lease: 'single-writer' } }
const authoringCost = (model, prompt_tokens = 1, completion_tokens = 1) => ({ model, prompt_tokens,
  completion_tokens, cache_hits: 0, estimated_cost_usd: 0, incomplete: false })
describe('Agentic Game OS shared core', () => {
  test('AC1 registers declared modes without a shared identifier list and rejects duplicates', () => {
    const registry = new GameOsModeRegistry()
    const declaration = {
      identity: 'persistent-strategy', surface: { overlayKind: 'gameplay' },
      ...MODE_OBLIGATIONS,
      adaptInput: input => ({ worldId: input.worldId }),
      createOverlay: input => ({
        overlayId: `strategy:${input.worldId}`, overlayKind: 'gameplay', state: input,
      }),
      exit: () => {},
    }
    registry.registerMode(declaration)
    assert.deepEqual(registry.listModes(), [{ identity: 'persistent-strategy', ...MODE_OBLIGATIONS,
      overlayKind: 'gameplay', active: false }])
    assert.equal(registry.activate('persistent-strategy', { worldId: 'world-1' }).overlayId, 'strategy:world-1')
    assert.throws(() => registry.registerMode(declaration), error => assertGameOsError(error, 'duplicate_identity'))
    assert.throws(() => registry.registerMode({ ...declaration, identity: 'invalid-persistence', persistence: undefined }), error => assertGameOsError(error, 'invalid_declaration'))
    for (const invalid of [{ ...declaration, identity: 'unknown-top', legacy: true },
      { ...declaration, identity: 'unknown-surface', surface: { overlayKind: 'gameplay', legacy: true } },
      { ...declaration, identity: 7 }]) {
      assert.throws(() => registry.registerMode(invalid), error => assertGameOsError(error, 'invalid_declaration'))
    }
    const failingModes = [
      ['raw-adapt', () => { throw new Error('adapt-boom') }, declaration.createOverlay, 'surface_unavailable'],
      ['raw-create', declaration.adaptInput, () => { throw new Error('create-boom') }, 'surface_unavailable'],
      ['raw-canonical', () => ({ invalid: 1n }), declaration.createOverlay, 'surface_unavailable'],
      ['unknown-overlay', declaration.adaptInput, input => ({ overlayId: 'x', overlayKind: 'gameplay', state: input, legacy: true }), 'surface_unavailable'],
      ['typed-adapt', () => { throw new GameOsError('input-invalid', 'typed') }, declaration.createOverlay, 'input-invalid'],
    ]
    for (const [identity, adaptInput, createOverlay, code] of failingModes) {
      registry.registerMode({ ...declaration, identity, adaptInput, createOverlay })
      assert.throws(() => registry.activate(identity, { worldId: 'world-1' }), error => assertGameOsError(error, code))
    }
    assert.throws(() => registry.activate('missing-mode', {}), error => assertGameOsError(error, 'surface_unavailable'))
  })
  test('AC2 exits each displaced mode exactly once and retains one live overlay', () => {
    const registry = new GameOsModeRegistry()
    const exits = { first: 0, second: 0 }
    for (const identity of ['first', 'second']) {
      registry.registerMode({ identity, ...MODE_OBLIGATIONS, surface: { overlayKind: 'gameplay' },
        adaptInput: () => ({ identity }),
        createOverlay: state => ({ overlayId: `${identity}-overlay`, overlayKind: 'gameplay', state }),
        exit: () => { exits[identity] += 1 } })
    }
    registry.activate('first', null); assert.equal(registry.liveOverlayCount, 1)
    registry.activate('second', null); assert.deepEqual(exits, { first: 1, second: 0 })
    registry.activate('first', null); assert.deepEqual(exits, { first: 1, second: 1 })
    assert.equal(registry.liveOverlayCount, 1)
  })
  test('shared runtime projects ordered state and cleans a failed opening projection exactly once', async () => {
    const mode = {
      identity: 'projection-mode', surface: { overlayKind: 'gameplay' }, adaptInput: input => input,
      ...MODE_OBLIGATIONS,
      createOverlay: input => ({ overlayId: `projection:${input.worldId}`, overlayKind: 'gameplay', state: input }),
      exit: () => {},
    }
    const events = []
    const runtimeStore = new MemoryContinuityStore()
    const runtime = createGameOsCoreRuntime({ store: runtimeStore, modeDeclaration: mode,
      async onSessionState(state, event) {
        if (state && event.tick === 1) await new Promise(resolve => setTimeout(resolve, 5))
        events.push(`${state ? 'state' : 'closed'}:${event.tick}`)
      },
    })
    const session = await runtime.open({ worldId: 'projected', seed: 1, sessionId: 'visual', nowMs: 100, leaseTtlMs: 1_000 })
    const concurrent = await Promise.all([session.step([], 200), session.step([], 201)])
    assert.deepEqual(concurrent.map(state => state.tick), [1, 2])
    await session.reset(1, 300)
    runtimeStore.failReleaseOnce = true
    await assert.rejects(() => session.close(), error => assertGameOsError(error, 'lease_lost'))
    assert.equal(session.inspect().tick, 0)
    await session.close()
    await session.close()
    await runtime.dispose()
    assert.deepEqual(events, ['state:0', 'state:1', 'state:2', 'state:0', 'closed:0'])
    const failingStore = new MemoryContinuityStore()
    let projectionCalls = 0
    const failingRuntime = createGameOsCoreRuntime({ store: failingStore, modeDeclaration: mode,
      onSessionState(state) { projectionCalls += 1; if (state) throw new Error('projection-boom') } })
    await assert.rejects(() => failingRuntime.open({ worldId: 'projection-failure', seed: 2,
      sessionId: 'visual', nowMs: 100, leaseTtlMs: 1_000 }), error => {
      assertGameOsError(error, 'surface_unavailable')
      assert.equal(error.details.reason, 'projection-boom')
      return true
    })
    assert.deepEqual([failingStore.releases, failingStore.inspect('projection-failure').lease,
      failingRuntime.registry.liveOverlayCount, projectionCalls], [1, null, 0, 2])
    await failingRuntime.dispose()
    assert.equal(failingStore.releases, 1)
    const durableStore = new MemoryContinuityStore()
    const durableRuntime = createGameOsCoreRuntime({ store: durableStore, modeDeclaration: { ...mode, identity: 'durable-projection' },
      onSessionState(state) { if (state?.tick === 1) throw new Error('late-projection') } })
    const durableSession = await durableRuntime.open({ worldId: 'durable-projection', seed: 2,
      sessionId: 'visual', nowMs: 100, leaseTtlMs: 1_000 })
    const durableState = await durableSession.step([], 200)
    assert.deepEqual([durableState.tick, durableSession.inspect().projectionGap?.tick,
      durableSession.inspect().digest], [1, 1, gameOsDigest(durableState)])
    assert.equal(durableStore.inspect('durable-projection').continuity.committedStateDigest, gameOsDigest(durableState))
    await durableRuntime.dispose()
  })
  test('AC3 advances independent seeded runtimes to byte-equivalent canonical state', () => {
    let first = createPersistentStrategyWorld({ worldId: 'deterministic', seed: 'seed-17', definition: CUSTOM_WORLD_DEFINITION })
    let second = createPersistentStrategyWorld({ worldId: 'deterministic', seed: 'seed-17', definition: CUSTOM_WORLD_DEFINITION })
    for (const orders of [makeMoveAndClaimOrders(first), [], []]) {
      const firstStep = advancePersistentStrategyWorld(first, orders)
      const secondStep = advancePersistentStrategyWorld(second, orders)
      first = firstStep.state
      second = secondStep.state
    }
    assert.deepEqual(canonicalGameOsBytes(first), canonicalGameOsBytes(second))
    assert.equal(gameOsDigest(first), gameOsDigest(second))
    assert.equal(first.tick, 3)
    assert.deepEqual(first.definition, CUSTOM_WORLD_DEFINITION)
    assert.equal(first.territories.length, CUSTOM_WORLD_DEFINITION.map.territoryCount)
    assert.deepEqual([Object.isFrozen(DEFAULT_PERSISTENT_STRATEGY_WORLD_DEFINITION), Object.isFrozen(DEFAULT_PERSISTENT_STRATEGY_WORLD_DEFINITION.factions[0].startingUnits)], [true, true])
    const limits = GAME_OS_WORLD_DEFINITION_LIMITS
    const boundary = clone(CUSTOM_WORLD_DEFINITION)
    boundary.map.territoryCount = limits.maxTerritoryCount
    boundary.factions = Array.from({ length: limits.maxFactionCount }, (_, faction) => ({
      identity: `faction-${faction}`, startingSupply: limits.maxEconomicValue,
      startingUnits: Array.from({ length: limits.maxAggregateUnitCount / limits.maxFactionCount }, (_, unit) =>
        ({ identity: `unit-${faction}-${unit}`, strength: limits.maxUnitStrength })),
    }))
    boundary.economy = { claimSupplyCost: limits.maxEconomicValue,
      supplyAccrualPerOwnedTerritory: limits.maxEconomicValue }
    boundary.objectives = Array.from({ length: limits.maxObjectiveCount }, (_, index) =>
      ({ identity: `objective-${index}`, kind: 'control-territories', targetTerritoryCount: 1 }))
    assert.equal(createPersistentStrategyWorld({ worldId: 'bounded', seed: 1, definition: boundary }).units.length,
      limits.maxAggregateUnitCount)
    const invalidDefinitions = [
      definition => { definition.legacy = true }, definition => { definition.map.legacy = true },
      definition => { definition.map.territoryCount = `${limits.maxTerritoryCount}` },
      definition => { definition.map.territoryCount = limits.maxTerritoryCount + 1 },
      definition => { definition.factions.push(clone(definition.factions[0])) },
      definition => { definition.factions[0].startingUnits = Array.from({ length: limits.maxAggregateUnitCount + 1 },
        (_, index) => ({ identity: `unit-over-${index}`, strength: 1 })) },
      definition => { definition.objectives.push({ identity: 'objective-over-limit', kind: 'control-territories', targetTerritoryCount: 1 }) },
      definition => { definition.economy.claimSupplyCost = limits.maxEconomicValue + 1 },
    ]
    for (const mutate of invalidDefinitions) { const definition = clone(boundary); mutate(definition)
      assert.throws(() => createPersistentStrategyWorld({ worldId: 'invalid-definition', seed: 1, definition }),
        error => assertGameOsError(error, 'input-invalid')) }
    for (const args of [{ worldId: {}, seed: 1 }, { worldId: 'typed', seed: false },
      { worldId: 'typed', seed: 1.5 }]) assert.throws(() => createPersistentStrategyWorld(args),
      error => assertGameOsError(error, 'input-invalid'))
  })
  test('AC3 rejects gaps, duplicates, undeclared orders, and non-neighbor movement', () => {
    const world = createPersistentStrategyWorld({ worldId: 'invalid-orders', seed: 4 })
    const valid = makeMoveAndClaimOrders(world)[0]
    assert.throws(
      () => advancePersistentStrategyWorld(world, [{ ...valid, sequence: 2 }]),
      error => assertGameOsError(error, 'order-sequence-invalid'),
    )
    assert.throws(
      () => advancePersistentStrategyWorld(world, [valid, valid]),
      error => assertGameOsError(error, 'order-sequence-invalid'),
    )
    assert.throws(
      () => advancePersistentStrategyWorld(world, [{ ...valid, type: 'teleport-unit' }]),
      error => assertGameOsError(error, 'order-invalid'),
    )
    const remote = world.territories.find(territory => !world.territories
      .find(candidate => candidate.id === world.units[0].territoryId).neighborIds.includes(territory.id))
    assert.throws(
      () => advancePersistentStrategyWorld(world, [{ ...valid, targetTerritoryId: remote.id }]),
      error => assertGameOsError(error, 'order-invalid'),
    )
  })
  test('AC4 commits, snapshots, closes, and restores the exact last tick and digest', async () => {
    const store = new MemoryContinuityStore()
    const opened = await openGameOsWorld(store, {
      worldId: 'continuity', seed: 'persist-me', sessionId: 'session-a', nowMs: 1_000, leaseTtlMs: 10_000,
    })
    let continuity = opened.restore.continuity
    let state = opened.restore.state
    for (const orders of [makeMoveAndClaimOrders(state), [], []]) {
      const committed = await commitGameOsWorldStep(store, {
        lease: opened.lease,
        expectedRevision: continuity.revision,
        orders,
        nowMs: 2_000,
        snapshotInterval: 2,
      })
      continuity = committed.continuity
      state = committed.step.state
    }
    const committedDigest = gameOsDigest(state)
    assert.deepEqual(continuity.snapshots.map(snapshot => snapshot.tick), [0, 2])
    const accepted = await acceptGameOsWorldOrders(store, { lease: opened.lease,
      expectedRevision: continuity.revision, orders: makeMoveAndClaimOrders(state), nowMs: 2_500 })
    continuity = accepted.continuity
    assert.deepEqual([continuity.acceptedOrderJournal.length, continuity.committedOrderCount,
      accepted.pendingOrderCount], [4, 2, 2])
    assert.equal(await releaseGameOsWorldLease(store, opened.lease), true)
    const beforeSeedMismatch = canonicalGameOsString(store.inspect('continuity'))
    await assert.rejects(() => openGameOsWorld(store, { worldId: 'continuity', seed: 'wrong', sessionId: 'wrong-seed', nowMs: 2_600, leaseTtlMs: 10_000 }), error => assertGameOsError(error, 'input-invalid'))
    assert.equal(canonicalGameOsString(store.inspect('continuity')), beforeSeedMismatch)
    const damagedEnvelope = store.inspect('continuity')
    damagedEnvelope.continuity.snapshots[1].state.seed = 'damaged-checkpoint'
    damagedEnvelope.continuity.snapshots[1].stateDigest = gameOsDigest(
      damagedEnvelope.continuity.snapshots[1].state,
    )
    store.inject('continuity', resealEnvelope(damagedEnvelope))
    const reopened = await openGameOsWorld(store, {
      worldId: 'continuity', seed: 'persist-me', sessionId: 'session-b', nowMs: 3_000, leaseTtlMs: 10_000,
    })
    assert.equal(reopened.restore.restoredTick, 3)
    assert.equal(reopened.restore.restoredSnapshotTick, 0)
    assert.equal(reopened.restore.replaySpan, 3)
    assert.deepEqual(reopened.restore.rejectedSnapshotTicks, [2])
    assert.equal(reopened.restore.matchedDigest, committedDigest)
    assert.deepEqual(reopened.restore.state, state)
    assert.equal(reopened.restore.continuity.acceptedOrderJournal.length
      - reopened.restore.continuity.committedOrderCount, 2)
    const strictBase = resealEnvelope({ ...store.inspect('continuity'), continuity: clone(continuity) })
    for (const mutate of [
      snapshot => snapshot.state.factions.push({ id: 'legacy-faction', supply: 1 }),
      snapshot => snapshot.state.units.push({ id: 'legacy-unit', factionId: 'aurora', territoryId: 'territory-0', strength: 1 }),
      snapshot => { snapshot.state.territories[0].neighborIds = [snapshot.state.territories[0].neighborIds[0]] },
    ]) {
      const tampered = clone(strictBase); const snapshot = tampered.continuity.snapshots[1]; mutate(snapshot)
      snapshot.stateDigest = gameOsDigest(snapshot.state); store.inject('continuity', resealEnvelope(tampered))
      const recovered = await readGameOsWorld(store, 'continuity')
      assert.deepEqual([recovered.restoredSnapshotTick, recovered.rejectedSnapshotTicks], [0, [2]])
    }
    for (const mutate of [
      record => { record.journal[0].orders[0].sequence = '1' },
      record => { record.committedOrderCount = `${record.committedOrderCount}` },
      record => { record.legacy = true },
      record => { record.snapshots[0].state.units[0].legacy = true },
    ]) {
      const tampered = clone(strictBase); mutate(tampered.continuity)
      store.inject('continuity', resealEnvelope(tampered))
      await assert.rejects(() => readGameOsWorld(store, 'continuity'), error => assertGameOsError(error, 'record_malformed'))
    }
  })
  test('AC5 canonicalizes permuted durable orders across offline commit-close-reopen', async () => {
    const store = new MemoryContinuityStore()
    let outboundRequests = 0
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => { outboundRequests += 1; throw new Error('network-disabled') }
    try {
      const first = await openGameOsWorld(store, {
        worldId: 'offline', seed: 9, sessionId: 'offline-a', nowMs: 10, leaseTtlMs: 100,
        definition: CUSTOM_WORLD_DEFINITION,
      })
      const commit = await commitGameOsWorldStep(store, {
        lease: first.lease,
        expectedRevision: first.restore.continuity.revision,
        orders: makeMoveAndClaimOrders(first.restore.state).reverse(),
        nowMs: 20,
      })
      await releaseGameOsWorldLease(store, first.lease)
      const beforeMismatch = canonicalGameOsString(store.inspect('offline'))
      await assert.rejects(() => openGameOsWorld(store, {
        worldId: 'offline', seed: 9, sessionId: 'mismatch', nowMs: 25, leaseTtlMs: 100,
        definition: { ...CUSTOM_WORLD_DEFINITION,
          economy: { ...CUSTOM_WORLD_DEFINITION.economy, claimSupplyCost: 2 } },
      }), error => assertGameOsError(error, 'input-invalid'))
      assert.equal(canonicalGameOsString(store.inspect('offline')), beforeMismatch)
      const second = await openGameOsWorld(store, {
        worldId: 'offline', seed: 9, sessionId: 'offline-b', nowMs: 30, leaseTtlMs: 100,
      })
      assert.equal(second.restore.matchedDigest, commit.step.stateDigest)
      assert.deepEqual([second.restore.continuity.acceptedOrderJournal.map(entry => entry.order.sequence),
        second.restore.continuity.journal.flatMap(entry => entry.orders.map(order => order.sequence))], [[1, 2], [1, 2]])
      assert.deepEqual(second.restore.state.definition, CUSTOM_WORLD_DEFINITION)
      await releaseGameOsWorldLease(store, second.lease)
      const reset = await explicitlyResetGameOsWorldRecord(store, { worldId: 'offline', seed: 10,
        sessionId: 'operator-reset', nowMs: 40 })
      assert.deepEqual(reset.state.definition, CUSTOM_WORLD_DEFINITION)
      assert.equal(outboundRequests, 0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
  test('AC6 blocks corrupt continuity without mutation and exposes an explicit reset action', async () => {
    const store = new MemoryContinuityStore()
    const opened = await openGameOsWorld(store, {
      worldId: 'corrupt', seed: 5, sessionId: 'repairer', nowMs: 100, leaseTtlMs: 1_000,
    })
    const corrupt = store.inspect('corrupt')
    corrupt.continuity.snapshots[0].state.seed = 'mismatched-seed'
    corrupt.continuity.snapshots[0].stateDigest = gameOsDigest(corrupt.continuity.snapshots[0].state)
    store.inject('corrupt', resealEnvelope(corrupt))
    const before = canonicalGameOsString(store.inspect('corrupt'))
    await assert.rejects(
      () => readGameOsWorld(store, 'corrupt'),
      error => {
        assertGameOsError(error, 'record_malformed')
        assert.equal(error.details.recordId, 'world:corrupt')
        assert.deepEqual(error.details.resetAction, {
          route: '/world', operation: 'reset', worldId: 'corrupt',
        })
        assert.deepEqual(error.details.inspectionAction, { tool: 'knowgrph.inspect_game_os',
          view: 'world_continuity', worldId: 'corrupt', readOnly: true })
        return true
      },
    )
    assert.equal(canonicalGameOsString(store.inspect('corrupt')), before)
    const digestDamaged = store.inspect('corrupt')
    digestDamaged.continuity.committedStateDigest = 'invalid-committed-digest'
    store.inject('corrupt', resealEnvelope(digestDamaged))
    await assert.rejects(() => readGameOsWorld(store, 'corrupt'), error => {
      assertGameOsError(error, 'record_malformed')
      assert.equal(error.details.resetAction.operation, 'reset')
      assert.equal(error.details.inspectionAction.readOnly, true)
      return true
    })
    const reset = await resetGameOsWorld(store, { lease: opened.lease, seed: 5, nowMs: 200 })
    assert.equal(reset.restoredTick, 0)
    assert.deepEqual(reset.continuity.snapshots.map(snapshot => snapshot.tick), [0])
    const emptyStore = new MemoryContinuityStore()
    await assert.rejects(() => explicitlyResetGameOsWorldRecord(emptyStore, { worldId: 'missing', seed: 1,
      sessionId: 'operator', nowMs: 1 }), error => {
      assertGameOsError(error, 'record_malformed'); assert.equal(error.details.fallbackDefinitionRequired, true); return true
    })
    assert.equal((await explicitlyResetGameOsWorldRecord(emptyStore, { worldId: 'missing', seed: 1,
      sessionId: 'operator', nowMs: 1, definition: DEFAULT_PERSISTENT_STRATEGY_WORLD_DEFINITION })).state.tick, 0)
  })
  test('AC7 prevents a second live writer and preserves the incumbent journal', async () => {
    const store = new MemoryContinuityStore()
    const incumbent = await openGameOsWorld(store, {
      worldId: 'leased', seed: 11, sessionId: 'incumbent', nowMs: 100, leaseTtlMs: 1_000,
    })
    const before = canonicalGameOsString(store.inspect('leased'))
    await assert.rejects(
      () => openGameOsWorld(store, {
        worldId: 'leased', seed: 11, sessionId: 'contender', nowMs: 200, leaseTtlMs: 1_000,
      }),
      error => assertGameOsError(error, 'lease_lost'),
    )
    assert.equal(canonicalGameOsString(store.inspect('leased')), before)
    const renewed = await renewGameOsWorldLease(store, incumbent.lease, { nowMs: 500, ttlMs: 2_000 })
    assert.equal(renewed.expiresAtMs, 2_500)
    const historyBeforeRace = canonicalGameOsString(store.inspect('leased').continuity)
    let successor
    store.beforeCompareAndPut = async () => {
      store.beforeCompareAndPut = null
      successor = await acquireGameOsWorldLease(store, {
        worldId: 'leased', sessionId: 'successor', nowMs: 2_501, ttlMs: 1_000,
      })
    }
    await assert.rejects(() => commitGameOsWorldStep(store, {
      lease: renewed,
      expectedRevision: incumbent.restore.continuity.revision,
      orders: [],
      nowMs: 2_000,
    }), error => assertGameOsError(error, 'lease_lost'))
    const afterRace = store.inspect('leased')
    assert.equal(successor.epoch, renewed.epoch + 1)
    assert.equal(afterRace.lease.sessionId, 'successor')
    assert.equal(canonicalGameOsString(afterRace.continuity), historyBeforeRace)
  })
  test('AC8 emits exactly one canonical zero-cost record for every fixed step', () => {
    const world = createPersistentStrategyWorld({ worldId: 'zero-cost', seed: 'local' })
    const step = advancePersistentStrategyWorld(world, [])
    assert.equal(step.costRecords.length, 1); assert.deepEqual(step.costRecords[0], GAME_OS_ZERO_COST_RECORD)
    assert.deepEqual(step.costRecords[0], { model: null, prompt_tokens: 0, completion_tokens: 0,
      cache_hits: 0, estimated_cost_usd: 0, incomplete: false })
  })
  test('AC9 accepts one declared invocation tuple and rejects ambiguous or unknown grammar', () => {
    assert.deepEqual(parseGameOsInvocation('/world @game-os #persistent-world operation=resume'),
      { route: '/world', binding: '@game-os', tag: '#persistent-world', arguments: { operation: 'resume' } })
    for (const invocation of [
      '/world /world @game-os #persistent-world operation=open',
      '/world @game-os @game-os #persistent-world operation=open',
      '/world @game-os #persistent-world action=open',
      '/world @game-os #persistent-world operation=destroy',
      '/world @game-os #persistent-world operation=open extra=value',
    ]) {
      assert.throws(() => parseGameOsInvocation(invocation), error =>
        assertGameOsError(error, 'invocation-invalid'))
    }
  })
  test('AC10 returns normalized read-only status views with zero cost', async () => {
    const store = new MemoryContinuityStore()
    const registry = new GameOsModeRegistry()
    registry.registerMode({ identity: 'persistent-strategy', ...MODE_OBLIGATIONS,
      surface: { overlayKind: 'gameplay' }, adaptInput: () => ({}),
      createOverlay: () => ({ overlayId: 'strategy', overlayKind: 'gameplay' }),
      exit: () => {} })
    await openGameOsWorld(store, { worldId: 'status', seed: 3, sessionId: 'observer', nowMs: 100, leaseTtlMs: 1_000 })
    const beforeWorld = canonicalGameOsString(store.inspect('status'))
    const writesBefore = store.writes
    for (const view of [
      'registered_modes', 'world_continuity', 'lease_state', 'determinism_digest', 'cost_summary',
    ]) {
      const response = await readGameOsStatus({ view, registry, store, worldId: 'status', nowMs: 200 })
      assert.deepEqual([response.schema, response.view, response.entries.length],
        ['knowgrph.game-os-status/v1', view, 1])
      assert.deepEqual(response.unavailableSources, [])
      assert.deepEqual(response.costRecord, GAME_OS_ZERO_COST_RECORD)
    }
    assert.equal((await readGameOsStatus({ view: 'lease_state', registry, store,
      worldId: 'status' })).entries[0].state, 'expired')
    const requiredOutput = identity => { const schema = GAME_OS_TOOL_DECLARATIONS.find(tool => tool.identity === identity).outputSchema
      return schema.required ?? schema.oneOf.flatMap(branch => branch.required) }
    assert.ok(requiredOutput('knowgrph.inspect_game_os').includes('unavailableSources'))
    assert.ok(requiredOutput('knowgrph.control_local_world').includes('projectionGap'))
    assert.equal(store.writes, writesBefore)
    assert.equal(canonicalGameOsString(store.inspect('status')), beforeWorld)
  })
  test('AC11 proves the provenance manifest against a tracked local file and performs no transport', async () => {
    const repositoryRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
    const verifyRepositoryAsset = async record => {
      const repositoryPath = `canvas/public/${record.localPath}`
      execFileSync('git', [
        '-C', repositoryRoot, 'ls-files', '--error-unmatch', `:(top)${repositoryPath}`,
      ], { stdio: 'pipe' })
      const bytes = await readFile(join(repositoryRoot, repositoryPath))
      const sourceRevision = execFileSync(
        'git', [
          '-C', repositoryRoot, 'log', '-n', '1', '--format=%H', '--', `:(top)${repositoryPath}`,
        ], { encoding: 'utf8' },
      ).trim()
      const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
      assert.equal(sourceRevision, record.provenance.repositoryRevision)
      assert.equal(digest, record.provenance.contentDigest)
      return bytes
    }
    const originalFetch = globalThis.fetch
    let outboundRequests = 0
    globalThis.fetch = async () => {
      outboundRequests += 1
      throw new Error('network-disabled')
    }
    try {
      const verifiedAssets = await Promise.all(GAME_OS_REPOSITORY_ASSET_MANIFEST.map(verifyRepositoryAsset))
      const bytes = verifiedAssets[0]
      const licencePath = 'grph-shared/src/game-os/ASSET-LICENSES.md'
      execFileSync('git', [
        '-C', repositoryRoot, 'ls-files', '--error-unmatch', `:(top)${licencePath}`,
      ], { stdio: 'pipe' })
      const licenceRecord = await readFile(join(repositoryRoot, licencePath), 'utf8')
      assert.match(licenceRecord, /neutral-world-mesh[\s\S]*CC0-1\.0/u)
      assert.match(licenceRecord, new RegExp(GAME_OS_REPOSITORY_ASSET_PROVENANCE_FIXTURE.provenance.contentDigest.slice(7), 'u'))
      const gate = new GameOsAssetProvenanceGate()
      const handle = gate.resolve('neutral-world-mesh')
      assert.equal(handle.loadPolicy, 'committed-local-only')
      assert.equal(gate.list().length, GAME_OS_REPOSITORY_ASSET_MANIFEST.length)
      assert.equal(handle.provenance.origin, 'Knowgrph repository-authored neutral mesh fixture')
      assert.ok(bytes.byteLength > 0)
      assert.equal(outboundRequests, 0)
      await assert.rejects(() => verifyRepositoryAsset({ ...GAME_OS_REPOSITORY_ASSET_PROVENANCE_FIXTURE,
        localPath: 'fixtures/geospatial/missing-world-mesh.json' }))
      for (const record of [{ ...handle, ref: 'missing-provenance', provenance: undefined },
        { ...handle, ref: 'bad-license', provenance: { ...handle.provenance, license: 'Proprietary' } }]) {
        assert.throws(() => validateGameOsAssetManifest([record]), error => assertGameOsError(error, 'asset-provenance-invalid'))
      }
      for (const localPath of ['https://example.test/a.glb', '/asset.glb', 'a\\b', 'a%20b', 'a%2fb',
        'a/%2E%2E/b', 'a?x', 'a#x', 'a//b', 'a/./b', 'a/../b', 'a/']) {
        assert.throws(() => validateGameOsAssetManifest([{ ...handle, ref: 'bad-path', localPath }]),
          error => assertGameOsError(error, 'asset-provenance-invalid'))
      }
      for (const contentDigest of ['sha1:abc', `sha256:${'a'.repeat(63)}`, `sha256:${'A'.repeat(64)}`]) {
        assert.throws(() => validateGameOsAssetManifest([{ ...handle, ref: 'bad-digest',
          provenance: { ...handle.provenance, contentDigest } }]),
        error => assertGameOsError(error, 'asset-provenance-invalid'))
      }
      assert.throws(() => gate.resolve('missing'), error => assertGameOsError(error, 'asset-not-found'))
    } finally {
      globalThis.fetch = originalFetch
    }
  })
  test('authoring harness is explicit, pluggable, bounded, budgeted, and cost-evidenced', async () => {
    let calls = 0; const savedDefinitions = []; const observedCosts = []
    const harness = createGameOsAuthoringAssistHarness({
      transport: { modelId: 'test-small-model', async generate({ iteration }) { calls += 1; return {
        definition: iteration === 1 ? { territories: [] } : { territories: ['north'], factions: ['aurora'] },
        costRecord: { ...authoringCost('test-small-model', 100, 50), cache_hits: 60, estimated_cost_usd: 0.001 },
      } } },
      validateDefinition(definition) {
        const issues = ['territories', 'factions'].filter(key => !Array.isArray(definition[key]))
        return { valid: issues.length === 0, issues }
      },
      worldDefinitionStore: { save: record => { savedDefinitions.push(record) } },
      costObserver: { observe: record => { observedCosts.push(record) } },
      maxIterations: 3, maxTotalTokens: 1_000,
    })
    const result = await harness.draft({ intent: 'Create a local strategy world', constraints: ['offline'], seedProfile: 'ring-six' })
    assert.deepEqual([calls, result.validationReport.valid, result.validationReport.iterations,
      result.costRecords.length], [2, true, 2, 2])
    assert.equal(result.costRecords.reduce((sum, cost) => sum + cost.prompt_tokens + cost.completion_tokens, 0), 300)
    assert.deepEqual(result.delivery, { worldDefinition: 'persisted', costEvidence: 'observed', gaps: [] })
    assert.deepEqual([savedDefinitions.length, observedCosts.length], [1, 2])
    const budgetHarness = createGameOsAuthoringAssistHarness({
      transport: { modelId: 'budget-model', async generate() { return { definition: { territories: [] },
        costRecord: { ...authoringCost('budget-model', 80, 30), estimated_cost_usd: 0.01 } } } },
      validateDefinition: () => ({ valid: true, issues: [] }),
      maxTotalTokens: 100,
    })
    await assert.rejects(() => budgetHarness.draft({ intent: 'x', constraints: [], seedProfile: 'y' }),
      error => assertGameOsError(error, 'authoring-budget-exceeded'))
  })
  test('authoring schema circuit rejects with the last partial and never exceeds three iterations', async () => {
    let circuitCalls = 0
    const circuitHarness = createGameOsAuthoringAssistHarness({
      transport: { modelId: 'schema-model', async generate({ iteration }) { circuitCalls += 1; return {
        definition: { iteration, partial: true }, costRecord: authoringCost('schema-model') } } },
      validateDefinition: () => ({ valid: false, issues: ['territories', 'factions'] }),
      maxIterations: 3, maxTotalTokens: 100,
    })
    await assert.rejects(() => circuitHarness.draft({ intent: 'x', constraints: [], seedProfile: 'y' }), error => {
      assertGameOsError(error, 'authoring-circuit-open'); assert.deepEqual([circuitCalls,
        error.details.fallbackCode, error.details.iteration, error.details.lastPartialDefinition.iteration,
        circuitHarness.inspect().schemaCircuitTripped], [3, 'schema-circuit-breaker', 3, 3, true])
      assert.deepEqual(error.details.delivery.gaps, ['world-definition-store-unavailable', 'cost-observer-unavailable']); return true })
    let boundedCalls = 0
    const improvingHarness = createGameOsAuthoringAssistHarness({
      transport: { modelId: 'improving-model', async generate({ iteration }) { boundedCalls += 1
        return { definition: { iteration }, costRecord: authoringCost('improving-model') } } },
      validateDefinition(definition) {
        const issueCount = 4 - Number(definition.iteration)
        return { valid: false, issues: Array.from({ length: issueCount }, (_, index) => `issue-${index}`) }
      },
      maxIterations: 3, maxTotalTokens: 100,
    })
    await assert.rejects(() => improvingHarness.draft({ intent: 'x', constraints: [], seedProfile: 'y' }), error => {
      assertGameOsError(error, 'authoring-circuit-open'); assert.deepEqual([boundedCalls,
        error.details.fallbackCode, error.details.lastPartialDefinition.iteration,
        improvingHarness.inspect().schemaCircuitTripped], [3, 'iteration-limit', 3, false]); return true })
  })
  test('authoring transport is unreachable from open, step, restore, and status play modules', async () => {
    const sourceFiles = await Promise.all(['../src/game-os/simulation.ts', '../src/game-os/continuity.ts',
      '../src/game-os/status.ts', '../src/game-os/indexedDbStore.ts', '../src/game-os/runtime.ts', '../src/game-os/control.ts',
    ].map(relativePath => readFile(new URL(relativePath, import.meta.url), 'utf8')))
    for (const source of sourceFiles) {
      assert.doesNotMatch(source, /transport\.generate|modelId/iu)
      assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket/iu)
    }
  })
})
