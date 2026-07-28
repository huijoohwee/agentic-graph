import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../../..')

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

test('ready publication reserves native MapLibre before ordinary React followers', () => {
  const bridge = source('canvas/src/components/CanvasViewportGeospatialOverlay.tsx')
  const deadline = source('canvas/src/features/game-flight-sim/flightSimDeadlineRuntime.ts')
  const defaults = source('canvas/src/features/game-flight-sim/flightSimDefaultRuntime.ts')
  const geoSurface = source('canvas/src/features/game-flight-sim/FlightSimGeoSurfaceOverlay.tsx')
  const hud = source('canvas/src/features/game-flight-sim/FlightSimHud.tsx')
  const runtime = source('canvas/src/features/game-flight-sim/flightSimRuntime.ts')
  const runtimeCore = source('canvas/src/features/game-flight-sim/flightSimRuntimeCore.ts')

  assert.match(
    bridge,
    /claimFlightSimReadyPresenter\('maplibre'\)/,
  )
  assert.match(
    bridge,
    /subscribeFlightSimPresentation\(\s*'maplibre',\s*publish,\s*\)/,
  )
  assert.match(runtime, /subscribeFlightSimPresentation\('surface', listener\)/)
  assert.match(geoSurface, /subscribeFlightSimPresentation\('surface', listener\)/)
  assert.match(
    defaults,
    /cancelReadyPublication: cancelCurrentFlightSimReadyFrame[\s\S]*coordinateReadyPublication: coordinateFlightSimReadyPublication/,
  )
  assert.match(
    runtimeCore,
    /coordinateReadyPublication\?\.\(\{[\s\S]*notifyPresenter,[\s\S]*notifyFollowers,/,
  )
  assert.match(
    hud,
    /useSyncExternalStore\(\s*subscribeFlightSimHudSnapshot,/,
  )
  assert.doesNotMatch(hud, /subscribeFlightSimPresentation/)

  const coordinator = deadline.indexOf(
    'export function coordinateFlightSimReadyPublication',
  )
  const arm = deadline.indexOf('armFlightSimReadyFrame(', coordinator)
  const presenter = deadline.indexOf(
    'publication.notifyPresenter(presenter)',
    coordinator,
  )
  assert.ok(arm > coordinator)
  assert.ok(presenter > arm)
  assert.match(
    deadline,
    /pending\.presenter !== null && pending\.presenter !== presenter/,
  )
  assert.match(deadline, /source: 'ready-frame-deadline-timeout'/)
  assert.match(
    deadline,
    /releaseFlightSimReadyFollowersAfterPresenter\(pending\.requestId\)/,
  )
})
