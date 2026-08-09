import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  DEFAULT_PERSISTENT_STRATEGY_WORLD_DEFINITION,
  GAME_OS_CONTROL_TOOL_ID,
  GAME_OS_INSPECT_TOOL_ID,
  GAME_OS_TOOL_DECLARATIONS,
  GameOsError,
  GameOsModeRegistry,
  createGameOsCoreRuntime,
  createGameOsLocalWorldToolController,
  formatCanonicalGameOsInvocation,
} from '../../dist/game-os/index.js'

const WORLD_ID = 'control-contract-world'
const state = Object.freeze({ tick: 1 })
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))

class MemoryStore {
  records = new Map()
  failReleaseOnce = false
  failReleaseWithLeaseLostOnce = false
  async get(worldId) {
    const value = clone(this.records.get(worldId) ?? null)
    if (this.failReleaseWithLeaseLostOnce && value?.lease) {
      this.failReleaseWithLeaseLostOnce = false
      throw new GameOsError('lease_lost', 'successor replaced opening lease')
    }
    return value
  }
  async getVersioned(worldId) {
    const value = await this.get(worldId)
    return value ? { value, revision: value.revision } : null
  }
  async compareAndPut(worldId, value, expectedRevision) {
    const current = this.records.get(worldId)
    if (this.failReleaseOnce && current?.lease && value.lease === null) {
      this.failReleaseOnce = false
      throw new GameOsError('store_unavailable', 'release store unavailable')
    }
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
}

const createHarness = () => {
  const failures = new Map()
  let detachFailure = null
  let detachCalls = 0
  let closeCalls = 0
  let renewCalls = 0
  const calls = { open: [], reset: [], resetWorld: [] }
  const fail = operation => {
    const queued = failures.get(operation)
    if (!queued?.length) return
    const error = queued.shift()
    if (error) throw error
  }
  const session = {
    worldId: WORLD_ID,
    inspect: () => ({
      state,
      tick: 1,
      digest: 'fnv1a32:1234abcd',
      revision: 'fnv1a32:2345bcde',
      pendingOrderCount: 0,
      lease: { worldId: WORLD_ID },
      projectionGap: null,
    }),
    async acceptOrders() { fail('acceptOrders'); return 1 },
    async commitAcceptedOrders() { fail('commitAcceptedOrders'); return state },
    async step() { fail('step'); return state },
    async renew() { renewCalls += 1; fail('renew'); return { worldId: WORLD_ID } },
    async reset(...args) { calls.reset.push(args); fail('reset'); return state },
    async status() { return {} },
    async close() { closeCalls += 1; fail('close') },
    async detachLocal() {
      detachCalls += 1
      if (detachFailure) throw detachFailure
    },
  }
  const core = {
    registry: {},
    async open(input) { calls.open.push(input); fail('open'); return session },
    async resetWorld(input) { calls.resetWorld.push(input); fail('resetWorld'); return state },
    async status() { return {} },
    parseInvocation() { throw new Error('unused') },
    resolveAsset() { throw new Error('unused') },
    async dispose() {},
  }
  const controller = createGameOsLocalWorldToolController(core, {
    clock: () => 100,
    sessionIdFactory: () => 'opaque-session',
  })
  return {
    controller,
    failNext(operation, error) {
      const queued = failures.get(operation) ?? []
      queued.push(error)
      failures.set(operation, queued)
    },
    failDetach(error) { detachFailure = error },
    calls,
    counts: () => ({ detachCalls, closeCalls, renewCalls }),
  }
}

const invoke = (controller, input) => controller.invoke(GAME_OS_CONTROL_TOOL_ID, input)

const open = controller => invoke(controller, {
  operation: 'open',
  playerActionConfirmed: true,
  worldId: WORLD_ID,
  seed: 7,
})

const order = (controller, worldId = WORLD_ID) => invoke(controller, {
  operation: 'order',
  playerActionConfirmed: true,
  worldId,
  orders: [{
    type: 'move-unit',
    sequence: 1,
    factionId: 'faction-a',
    unitId: 'unit-a',
    targetTerritoryId: 'territory-1',
  }],
})

describe('Game OS control contract', () => {
  test('registry records truthful persistent and nonpersistent mode obligations', () => {
    const registry = new GameOsModeRegistry()
    const declaration = {
      identity: 'flight', worldSchema: 'gamexr.flight-state/v1',
      persistence: { continuity: 'none', lease: 'none' },
      surface: { overlayKind: 'gameplay' }, adaptInput: () => ({}),
      createOverlay: () => ({ overlayId: 'flight', overlayKind: 'gameplay' }), exit: () => {},
    }
    registry.registerMode(declaration)
    assert.deepEqual(registry.listModes()[0].persistence, { continuity: 'none', lease: 'none' })
    for (const persistence of [
      { continuity: 'required', lease: 'none' }, { continuity: 'none', lease: 'single-writer' },
    ]) {
      assert.throws(() => registry.registerMode({ ...declaration, identity: String(persistence.lease), persistence }),
        error => error instanceof GameOsError && error.code === 'invalid_declaration')
    }
  })

  test('advertises exact selector, operation, order, and output schemas', () => {
    const declaration = GAME_OS_TOOL_DECLARATIONS.find(tool => tool.identity === GAME_OS_CONTROL_TOOL_ID)
    const [nativeGroup, operationGroup] = declaration.inputSchema.oneOf
    assert.equal(nativeGroup.oneOf.length, 6)
    assert.equal(operationGroup.oneOf.length, 6)
    const operationLeaves = operationGroup.oneOf
    const openLeaf = operationLeaves.find(leaf => leaf.properties.operation.const === 'open')
    const orderLeaf = operationLeaves.find(leaf => leaf.properties.operation.const === 'order')
    const closeLeaf = operationLeaves.find(leaf => leaf.properties.operation.const === 'close')
    assert.deepEqual([...openLeaf.required].sort(), ['operation', 'playerActionConfirmed', 'seed', 'worldId'])
    assert.deepEqual([...closeLeaf.required].sort(), ['operation', 'playerActionConfirmed', 'worldId'])
    assert.deepEqual(Object.keys(closeLeaf.properties).sort(), [...closeLeaf.required].sort())
    const [move, claim] = orderLeaf.properties.orders.items.oneOf
    assert.deepEqual(move.required,
      ['type', 'sequence', 'factionId', 'unitId', 'targetTerritoryId'])
    assert.deepEqual(claim.required,
      ['type', 'sequence', 'factionId', 'unitId', 'territoryId'])
    assert.equal(move.additionalProperties, false)
    assert.equal(claim.additionalProperties, false)
    assert.equal(declaration.outputSchema.oneOf.length, 6)
    for (const leaf of declaration.outputSchema.oneOf) {
      assert.equal(leaf.additionalProperties, false)
      assert.deepEqual([...leaf.required].sort(), [
        'costRecord', 'digest', 'operation', 'pendingOrderCount', 'projectionGap',
        'schema', 'status', 'tick', 'worldId',
      ])
    }
    const inspectDeclaration = GAME_OS_TOOL_DECLARATIONS.find(
      tool => tool.identity === GAME_OS_INSPECT_TOOL_ID,
    )
    assert.equal(inspectDeclaration.inputSchema.oneOf.length, 5)
    const registeredModes = inspectDeclaration.inputSchema.oneOf.find(
      leaf => leaf.properties.view.const === 'registered_modes',
    )
    const continuity = inspectDeclaration.inputSchema.oneOf.find(
      leaf => leaf.properties.view.const === 'world_continuity',
    )
    assert.deepEqual(registeredModes.required, ['view'])
    assert.deepEqual(continuity.required, ['view', 'worldId'])
    assert.equal(registeredModes.additionalProperties, false)
    assert.equal(inspectDeclaration.outputSchema.oneOf.length, 5)
    const modePersistence = inspectDeclaration.outputSchema.oneOf[0]
      .properties.entries.items.properties.persistence
    assert.deepEqual(modePersistence.oneOf.map(branch => branch.properties), [
      { continuity: { const: 'required' }, lease: { const: 'single-writer' } },
      { continuity: { const: 'none' }, lease: { const: 'none' } },
    ])
    for (const leaf of inspectDeclaration.outputSchema.oneOf) {
      assert.equal(leaf.additionalProperties, false)
      assert.deepEqual(leaf.required,
        ['schema', 'view', 'entries', 'unavailableSources', 'costRecord'])
      assert.equal(leaf.properties.entries.type, 'array')
      assert.equal(leaf.properties.unavailableSources.items.minLength, 1)
      assert.equal(leaf.properties.costRecord.additionalProperties, false)
    }
    const costSummary = inspectDeclaration.outputSchema.oneOf.find(
      leaf => leaf.properties.view.const === 'cost_summary',
    )
    assert.deepEqual(costSummary.properties.entries.items.oneOf.map(branch => branch.properties.source),
      [{ const: 'play' }, { const: 'authoring' }])
  })

  test('runtime requires exactly one canonical selector and operation-specific fields', async () => {
    const both = createHarness().controller
    await assert.rejects(() => invoke(both, {
      invocation: formatCanonicalGameOsInvocation('open'),
      operation: 'open',
      playerActionConfirmed: true,
      worldId: WORLD_ID,
      seed: 1,
    }), error => error?.code === 'invocation-invalid')
    await assert.rejects(() => invoke(createHarness().controller, {
      playerActionConfirmed: true, worldId: WORLD_ID, seed: 1,
    }), error => error?.code === 'invocation-invalid')
    await assert.rejects(() => invoke(createHarness().controller, {
      invocation: '@game-os /world #persistent-world operation=open',
      playerActionConfirmed: true, worldId: WORLD_ID, seed: 1,
    }), error => error?.code === 'invocation-invalid')
    const canonical = createHarness().controller
    const result = await invoke(canonical, {
      invocation: formatCanonicalGameOsInvocation('open'),
      playerActionConfirmed: true, worldId: WORLD_ID, seed: 1,
    })
    assert.deepEqual(
      [result.operation, result.status, result.projectionGap, result.digest],
      ['open', 'opened', null, 'fnv1a32:1234abcd'],
    )
    await assert.rejects(() => invoke(createHarness().controller, {
      operation: 'open', playerActionConfirmed: true, worldId: WORLD_ID,
    }), error => error?.code === 'input-invalid')
    await assert.rejects(() => invoke(createHarness().controller, {
      operation: 'commit', playerActionConfirmed: true, worldId: WORLD_ID, seed: 1,
    }), error => error?.code === 'input-invalid')
    await assert.rejects(() => invoke(createHarness().controller, {
      operation: 'open', playerActionConfirmed: true, worldId: WORLD_ID, seed: 1, nowMs: 1,
    }), error => error?.code === 'input-invalid')
    const inspect = createHarness().controller
    await assert.rejects(() => inspect.invoke(GAME_OS_INSPECT_TOOL_ID, {
      view: 'registered_modes', worldId: WORLD_ID,
    }), error => error?.code === 'input-invalid')
    await assert.rejects(() => inspect.invoke(GAME_OS_INSPECT_TOOL_ID, {
      view: 'world_continuity',
    }), error => error?.code === 'input-invalid')
  })

  test('matched terminal failures detach locally without masking the primary error', async () => {
    for (const code of ['lease_lost', 'record_malformed', 'digest_mismatch']) {
      const harness = createHarness()
      await open(harness.controller)
      const primary = new GameOsError(code, `primary ${code}`)
      harness.failNext('acceptOrders', primary)
      harness.failDetach(new Error('cleanup failed'))
      await assert.rejects(() => order(harness.controller), error => error === primary)
      assert.equal(harness.counts().detachCalls, 1)
      await assert.rejects(
        () => harness.controller.renewActive(),
        error => error?.code === 'lease_lost' && /No local world session/u.test(error.message),
      )
    }
  })

  test('host-only reviewed definitions retain controller authority and never widen tool input', async () => {
    const reviewed = {
      operation: 'open',
      playerActionConfirmed: true,
      operatorReviewConfirmed: true,
      worldId: WORLD_ID,
      seed: 7,
      definition: DEFAULT_PERSISTENT_STRATEGY_WORLD_DEFINITION,
    }
    for (const invalid of [
      { ...reviewed, operatorReviewConfirmed: false },
      { ...reviewed, nowMs: 1 },
    ]) {
      const harness = createHarness()
      await assert.rejects(
        () => harness.controller.controlReviewedWorld(invalid),
        error => error?.code === 'input-invalid',
      )
      assert.equal(harness.calls.open.length, 0)
    }
    const active = createHarness()
    const opened = await active.controller.controlReviewedWorld(reviewed)
    assert.deepEqual([opened.operation, opened.status], ['open', 'opened'])
    assert.deepEqual(active.calls.open[0], {
      worldId: WORLD_ID,
      seed: 7,
      sessionId: 'opaque-session',
      nowMs: 100,
      leaseTtlMs: 60_000,
      definition: DEFAULT_PERSISTENT_STRATEGY_WORLD_DEFINITION,
    })
    await active.controller.controlReviewedWorld({
      ...reviewed, operation: 'reset', seed: 8,
    })
    assert.deepEqual(active.calls.reset[0], [
      8, 100, DEFAULT_PERSISTENT_STRATEGY_WORLD_DEFINITION,
    ])
    await assert.rejects(() => invoke(createHarness().controller, {
      operation: 'open', playerActionConfirmed: true, worldId: WORLD_ID, seed: 7,
      definition: DEFAULT_PERSISTENT_STRATEGY_WORLD_DEFINITION,
    }), error => error?.code === 'input-invalid')
    await active.controller.dispose()

    const inactive = createHarness()
    await inactive.controller.controlReviewedWorld({ ...reviewed, operation: 'reset' })
    assert.deepEqual(inactive.calls.resetWorld[0], {
      worldId: WORLD_ID,
      seed: 7,
      sessionId: 'opaque-session',
      nowMs: 100,
      definition: DEFAULT_PERSISTENT_STRATEGY_WORLD_DEFINITION,
    })
  })

  test('transient store failures retain the exact session retry handle', async () => {
    const operations = [
      ['acceptOrders', controller => order(controller)],
      ['commitAcceptedOrders', controller => invoke(controller, {
        operation: 'commit', playerActionConfirmed: true, worldId: WORLD_ID,
      })],
      ['reset', controller => invoke(controller, {
        operation: 'reset', playerActionConfirmed: true, worldId: WORLD_ID, seed: 9,
      })],
      ['renew', controller => controller.renewActive()],
    ]
    for (const [operation, retry] of operations) {
      const harness = createHarness()
      await open(harness.controller)
      const failure = new GameOsError('store_unavailable', `${operation} unavailable`)
      harness.failNext(operation, failure)
      await assert.rejects(() => retry(harness.controller), error => error === failure)
      assert.equal(harness.counts().detachCalls, 0)
      await retry(harness.controller)
      await harness.controller.dispose()
      assert.equal(harness.counts().closeCalls, 1)
    }
  })

  test('guard and order failures retain the incumbent session', async () => {
    const harness = createHarness()
    await open(harness.controller)
    await assert.rejects(() => invoke(harness.controller, {
      operation: 'commit', playerActionConfirmed: true, worldId: 'wrong-world',
    }), error => error?.code === 'lease_lost')
    await harness.controller.renewActive()
    harness.failNext('acceptOrders', new GameOsError('order-invalid', 'invalid order'))
    await assert.rejects(() => order(harness.controller), error => error?.code === 'order-invalid')
    harness.failNext('step', new GameOsError('order-sequence-invalid', 'invalid sequence'))
    await assert.rejects(
      () => harness.controller.commitOrders(WORLD_ID, [{ type: 'move-unit' }]),
      error => error?.code === 'order-sequence-invalid',
    )
    await harness.controller.renewActive()
    assert.equal(harness.counts().detachCalls, 0)
  })

  test('close retains store retry but clears terminal and post-release failures', async () => {
    const retry = createHarness()
    await open(retry.controller)
    const storeFailure = new GameOsError('store_unavailable', 'store unavailable')
    retry.failNext('close', storeFailure)
    await assert.rejects(() => invoke(retry.controller, {
      operation: 'close', playerActionConfirmed: true, worldId: WORLD_ID,
    }), error => error === storeFailure)
    await retry.controller.renewActive()
    await invoke(retry.controller, {
      operation: 'close', playerActionConfirmed: true, worldId: WORLD_ID,
    })
    assert.deepEqual(retry.counts(), { detachCalls: 0, closeCalls: 2, renewCalls: 1 })

    for (const primary of [
      new GameOsError('lease_lost', 'lease stolen'),
      new GameOsError('surface_unavailable', 'projection cleanup failed', { durableLeaseReleased: true }),
    ]) {
      const terminal = createHarness()
      await open(terminal.controller)
      terminal.failNext('close', primary)
      await assert.rejects(() => invoke(terminal.controller, {
        operation: 'close', playerActionConfirmed: true, worldId: WORLD_ID,
      }), error => error === primary)
      assert.equal(terminal.counts().detachCalls, 1)
      await assert.rejects(() => terminal.controller.renewActive(), error => error?.code === 'lease_lost')
    }
  })

  test('runtime local detach closes projection and registry without touching the durable lease', async () => {
    const store = new MemoryStore()
    const projected = []
    let exits = 0
    const runtime = createGameOsCoreRuntime({
      store,
      modeDeclaration: {
        identity: 'control-contract-mode',
        worldSchema: 'knowgrph.game-os-world/v1',
        persistence: { continuity: 'required', lease: 'single-writer' },
        surface: { overlayKind: 'gameplay' },
        adaptInput: input => input,
        createOverlay: () => ({ overlayId: 'control-contract-overlay', overlayKind: 'gameplay' }),
        exit: () => { exits += 1 },
      },
      onSessionState: world => { projected.push(world) },
    })
    const session = await runtime.open({
      worldId: 'detached-world', seed: 1, sessionId: 'detached-session', nowMs: 100, leaseTtlMs: 1_000,
    })
    const storedBefore = await store.get('detached-world')
    await session.detachLocal()
    assert.equal(runtime.registry.liveOverlayCount, 0)
    assert.equal(exits, 1)
    assert.equal(projected.at(-1), null)
    assert.deepEqual(await store.get('detached-world'), storedBefore)
    assert.throws(() => session.inspect(), error => error?.code === 'lease_lost')
    await session.detachLocal()
    await runtime.dispose()
  })

  test('failed opening projection reports and retains retryable lease cleanup', async () => {
    const store = new MemoryStore()
    store.failReleaseOnce = true
    const runtime = createGameOsCoreRuntime({
      store,
      modeDeclaration: {
        identity: 'failed-open-mode', worldSchema: 'knowgrph.game-os-world/v1',
        persistence: { continuity: 'required', lease: 'single-writer' },
        surface: { overlayKind: 'gameplay' }, adaptInput: input => input,
        createOverlay: () => ({ overlayId: 'failed-open-overlay', overlayKind: 'gameplay' }),
        exit: () => {},
      },
      onSessionState: world => { if (world) throw new Error('initial projection failed') },
    })
    await assert.rejects(() => runtime.open({
      worldId: 'failed-open-world', seed: 1, sessionId: 'failed-open-session',
      nowMs: 100, leaseTtlMs: 1_000,
    }), error => {
      assert.equal(error?.code, 'surface_unavailable')
      assert.equal(error?.details.cleanupCode, 'store_unavailable')
      assert.equal(error?.details.cleanupPending, true)
      assert.equal(error?.details.retryAction, 'dispose-runtime')
      return true
    })
    assert.equal((await store.get('failed-open-world')).lease.sessionId, 'failed-open-session')
    await runtime.dispose()
    assert.equal((await store.get('failed-open-world')).lease, null)

    const activationStore = new MemoryStore()
    activationStore.failReleaseOnce = true
    const activationRuntime = createGameOsCoreRuntime({
      store: activationStore,
      modeDeclaration: {
        identity: 'failed-activation-mode', worldSchema: 'knowgrph.game-os-world/v1',
        persistence: { continuity: 'required', lease: 'single-writer' },
        surface: { overlayKind: 'gameplay' }, adaptInput: input => input,
        createOverlay: () => { throw new Error('activation failed') }, exit: () => {},
      },
    })
    await assert.rejects(() => activationRuntime.open({ worldId: 'failed-activation-world', seed: 1,
      sessionId: 'failed-activation-session', nowMs: 100, leaseTtlMs: 1_000 }), error => {
      assert.deepEqual([error?.code, error?.details.cleanupCode, error?.details.cleanupPending],
        ['surface_unavailable', 'store_unavailable', true])
      return true
    })
    assert.equal((await activationStore.get('failed-activation-world')).lease.sessionId,
      'failed-activation-session')
    await activationRuntime.dispose()
    assert.equal((await activationStore.get('failed-activation-world')).lease, null)

    const terminalStore = new MemoryStore()
    terminalStore.failReleaseOnce = true
    const terminalRuntime = createGameOsCoreRuntime({
      store: terminalStore,
      modeDeclaration: {
        identity: 'terminal-activation-mode', worldSchema: 'knowgrph.game-os-world/v1',
        persistence: { continuity: 'required', lease: 'single-writer' },
        surface: { overlayKind: 'gameplay' }, adaptInput: input => input,
        createOverlay: () => { throw new Error('activation failed') }, exit: () => {},
      },
    })
    await assert.rejects(() => terminalRuntime.open({ worldId: 'terminal-activation-world', seed: 1,
      sessionId: 'terminal-activation-session', nowMs: 100, leaseTtlMs: 1_000 }))
    terminalStore.failReleaseWithLeaseLostOnce = true
    await assert.rejects(() => terminalRuntime.dispose(), error => error?.code === 'surface_unavailable')
    await terminalRuntime.dispose()
    assert.equal((await terminalStore.get('terminal-activation-world')).lease.sessionId,
      'terminal-activation-session')
  })

  test('runtime admits one race-safe scene session and suppresses stale projections', async () => {
    const store = new MemoryStore()
    const projected = []
    const runtime = createGameOsCoreRuntime({
      store,
      modeDeclaration: {
        identity: 'single-surface-mode',
        worldSchema: 'knowgrph.game-os-world/v1',
        persistence: { continuity: 'required', lease: 'single-writer' },
        surface: { overlayKind: 'gameplay' },
        adaptInput: input => input,
        createOverlay: input => ({
          overlayId: `single:${input.worldId}`, overlayKind: 'gameplay', state: input,
        }),
        exit: () => {},
      },
      onSessionState: world => { projected.push(world) },
    })
    const inputs = [
      { worldId: 'race-world-a', seed: 1, sessionId: 'race-a', nowMs: 100, leaseTtlMs: 1_000 },
      { worldId: 'race-world-b', seed: 2, sessionId: 'race-b', nowMs: 100, leaseTtlMs: 1_000 },
    ]
    const results = await Promise.allSettled(inputs.map(input => runtime.open(input)))
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(results.filter(result => result.status === 'rejected'
      && result.reason?.code === 'surface_unavailable').length, 1)
    const winnerIndex = results.findIndex(result => result.status === 'fulfilled')
    const loserIndex = winnerIndex === 0 ? 1 : 0
    const session = results[winnerIndex].value
    assert.equal(await store.get(inputs[loserIndex].worldId), null)

    const unregisterOther = runtime.registry.registerMode({
      identity: 'other-scene-mode',
      worldSchema: 'knowgrph.other-world/v1',
      persistence: { continuity: 'required', lease: 'single-writer' },
      surface: { overlayKind: 'gameplay' },
      adaptInput: input => input,
      createOverlay: () => ({ overlayId: 'other-overlay', overlayKind: 'gameplay' }),
      exit: () => {},
    })
    runtime.registry.activate('other-scene-mode', {})
    const before = projected.filter(Boolean).length
    const state = session.inspect().state
    const unit = state.units[0]
    const territory = state.territories.find(candidate => candidate.id === unit.territoryId)
    await session.step([{
      type: 'move-unit', sequence: 1, factionId: unit.factionId, unitId: unit.id,
      targetTerritoryId: territory.neighborIds[0],
    }], 200)
    assert.equal(projected.filter(Boolean).length, before)
    assert.match(session.inspect().projectionGap.reason, /no longer owns the scene surface/u)
    await session.close()
    unregisterOther()
    await runtime.dispose()
  })
})
