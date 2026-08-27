import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  advancePersistentStrategyWorld,
  canonicalGameOsString,
  createPersistentStrategyWorld,
  gameOsDigest,
} from '../../dist/game-os/index.js'

const fixtureUrl = new URL(
  '../../../packages/apple-spatial-input-swift/Tests/Fixtures/game-os-persistent-strategy-parity.v1.json',
  import.meta.url,
)
const swiftSourceUrl = new URL(
  '../../../packages/apple-spatial-input-swift/Sources/AgenticGraphSpatialCore/GameOsPersistentStrategy.swift',
  import.meta.url,
)

test('AC3 and AC8 keep one TypeScript and Swift fixed-step golden contract', async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'))
  assert.equal(fixture.schema, 'agenticgraph.game-os-persistent-strategy-parity/v1')
  let state = createPersistentStrategyWorld({
    worldId: fixture.worldId,
    seed: fixture.seed,
    definition: fixture.definition,
  })
  assert.deepEqual(state, fixture.expectedInitialState)
  assert.equal(canonicalGameOsString(state), fixture.expectedCanonicalStates[0])
  assert.equal(gameOsDigest(state), fixture.expectedInitialStateDigest)
  for (const [index, step] of fixture.steps.entries()) {
    const result = advancePersistentStrategyWorld(state, [...step.orders].reverse())
    assert.equal(result.state.tick, index + 1)
    assert.deepEqual(result.state, step.expectedState)
    assert.deepEqual(result.acceptedOrders, step.expectedAcceptedOrders)
    assert.deepEqual(result.costRecords, fixture.expectedStepCostRecords)
    assert.equal(result.stateDigest, step.expectedStateDigest)
    assert.equal(result.canonicalState, fixture.expectedCanonicalStates[index + 1])
    assert.equal(result.canonicalState, canonicalGameOsString(step.expectedState))
    state = result.state
  }
  const swiftSource = await readFile(swiftSourceUrl, 'utf8')
  assert.doesNotMatch(swiftSource, /URLSession|NWConnection|Network\.framework|\bfetch\s*\(/u)
})
