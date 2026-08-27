import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveFlightSimSurfacePreloadIntent,
} from '@/features/game-flight-sim/useFlightSimSurfacePreload'

test('Flight surface warmup follows the selected or available authored seed', () => {
  assert.equal(resolveFlightSimSurfacePreloadIntent({
    activePath: '/docs/workspace-seeds/agenticgraph-game-flight-sim-demo.md',
    sourceFiles: [],
  }), true)
  assert.equal(resolveFlightSimSurfacePreloadIntent({
    activePath: '/notes/other.md',
    sourceFiles: [{
      name: 'renamed.md',
      source: {
        kind: 'local',
        path: '/docs/workspace-seeds/agenticgraph-game-flight-sim-demo.md',
      },
    }],
  }), true)
  assert.equal(resolveFlightSimSurfacePreloadIntent({
    activePath: '/notes/other.md',
    sourceFiles: [{
      name: 'agenticgraph-game-city-building-sim-demo.md',
      source: {
        kind: 'local',
        path: '/docs/workspace-seeds/agenticgraph-game-city-building-sim-demo.md',
      },
    }],
  }), false)
})
