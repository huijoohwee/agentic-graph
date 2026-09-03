import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createGameOsAuthoringCostStatus } from '../../../../grph-shared/src/game-os/index.js'
import { createAgenticGraphStorageEnginePersistence } from '../../lib/storage/agentic-graph-storage-engine-persistence'
import { createGameMmorpgCoreFromPersistence } from './gameMmorpgCore'

test('Game MMORPG dispose remains retryable until its durable lease is released', async () => {
  const persistence = await createAgenticGraphStorageEnginePersistence({ forceMemory: true })
  const core = createGameMmorpgCoreFromPersistence({ persistence })
  await core.open({
    worldId: 'dispose-retry-world',
    seed: 1,
    sessionId: 'dispose-retry-session',
    nowMs: 100,
    leaseTtlMs: 1_000,
  })
  const get = persistence.records.get.bind(persistence.records)
  let failOnce = true
  Object.defineProperty(persistence.records, 'get', {
    configurable: true,
    value: async (...args: Parameters<typeof persistence.records.get>) => {
      if (failOnce) {
        failOnce = false
        throw new Error('injected persistence failure')
      }
      return get(...args)
    },
  })
  try {
    await assert.rejects(() => core.dispose())
    await core.dispose()
  } finally {
    await persistence.close()
  }
})

test('Game MMORPG cost status exposes injected authoring observer gaps without a world write', async () => {
  const persistence = await createAgenticGraphStorageEnginePersistence({ forceMemory: true })
  const authoringCostStatus = createGameOsAuthoringCostStatus({
    runId: 'canvas-authoring-gap', attempted: 1, observed: 0, costEvidence: 'gap',
    costRecords: [{ model: 'operator-model', prompt_tokens: 1, completion_tokens: 1,
      cache_hits: 0, estimated_cost_usd: 0.001, incomplete: false }],
    gaps: ['cost-observer-unavailable'],
  })
  const core = createGameMmorpgCoreFromPersistence({
    persistence,
    authoringCostStatus: () => authoringCostStatus,
  })
  try {
    const status = await core.status('cost_summary', 'canvas-status-world', 100)
    assert.deepEqual(status.entries, [authoringCostStatus])
    assert.deepEqual(status.unavailableSources, ['world:canvas-status-world'])
    assert.equal(await persistence.records.get('game-os:world-envelope', 'canvas-status-world'), null)
  } finally {
    await core.dispose()
    await persistence.close()
  }
})
