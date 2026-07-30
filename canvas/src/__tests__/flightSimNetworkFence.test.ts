import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  blockFlightSimGameplayNetworkAttempt,
  FlightSimExternalCallBlockedError,
} from '@/features/game-flight-sim/flightSimExternalCallGuard'
import { createFlightSimMission } from '@/features/game-flight-sim/flightSimMission'
import { readFlightSimXrSpatialProfile } from '@/features/game-flight-sim/flightSimSpatialProfile'

test('Flight rejects an explicit gameplay transport without replacing browser transports', () => {
  const mission = createFlightSimMission({
    runId: 1,
    profile: readFlightSimXrSpatialProfile(),
  })
  let executed = false
  assert.throws(
    () => blockFlightSimGameplayNetworkAttempt(
      mission,
      'fetch:POST:/flight-gameplay',
      () => {
        executed = true
      },
    ),
    error => {
      assert.ok(error instanceof FlightSimExternalCallBlockedError)
      assert.equal(error.code, 'FLIGHT_SIM_GAMEPLAY_NETWORK_BLOCKED')
      assert.equal(error.operation, 'fetch:POST:/flight-gameplay')
      return true
    },
  )
  assert.equal(executed, false)
})

test('Flight runtime leaves the independent Geo provider transport owner intact', () => {
  const runtimePath = path.resolve(
    process.cwd(),
    'src/features/game-flight-sim/flightSimRuntime.ts',
  )
  const guardPath = path.resolve(
    process.cwd(),
    'src/features/game-flight-sim/flightSimExternalCallGuard.ts',
  )
  const runtime = readFileSync(runtimePath, 'utf8')
  const guard = readFileSync(guardPath, 'utf8')
  assert.doesNotMatch(runtime, /installFlightSimGameplayNetworkFence/)
  assert.doesNotMatch(runtime, /globalThis\.(?:fetch|XMLHttpRequest|WebSocket|EventSource)/)
  assert.doesNotMatch(guard, /host\.fetch\s*=|XMLHttpRequest\.prototype|new Proxy/)
  assert.match(guard, /blockFlightSimGameplayNetworkAttempt/)
})
