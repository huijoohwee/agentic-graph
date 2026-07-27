import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { projectFlightSimToGeospatialOverlay } from '@/features/game-flight-sim/flightSimGeospatialProjection'
import { createFlightSimRuntime } from '@/features/game-flight-sim/flightSimRuntimeCore'
import { readFlightSimXrSpatialProfile } from '@/features/game-flight-sim/flightSimSpatialProfile'

test('Geo+XR keeps native MapLibre below one transparent Flight canvas', () => {
  const viewport = readFileSync(
    path.resolve(process.cwd(), 'src/components/CanvasViewport.tsx'),
    'utf8',
  )
  const geospatialOverlay = readFileSync(
    path.resolve(
      process.cwd(),
      'src/components/CanvasViewportGeospatialOverlay.tsx',
    ),
    'utf8',
  )
  const threeGraph = readFileSync(
    path.resolve(process.cwd(), 'src/lib/three/ThreeGraph.impl.tsx'),
    'utf8',
  )
  const xrStage = readFileSync(
    path.resolve(
      process.cwd(),
      'src/features/three/XrCanonicalPhysicsStage.tsx',
    ),
    'utf8',
  )
  const xrSceneStage = readFileSync(
    path.resolve(
      process.cwd(),
      'src/features/three/XrSceneStage.tsx',
    ),
    'utf8',
  )

  assert.match(viewport, /z-\[10\]/)
  assert.match(geospatialOverlay, /z-\[5\]/)
  assert.doesNotMatch(geospatialOverlay, /shared-xr-stage/)
  assert.match(threeGraph, /geospatialComposite\s*\?\s*0/)
  assert.match(xrStage, /environmentVisible=\{!geospatialComposite\}/)
  assert.match(
    xrSceneStage,
    /geospatialComposite && authority !== 'native-controller'/,
  )
  assert.match(
    threeGraph,
    /!geospatialComposite && hasXrEmptyWorld/,
  )
  assert.match(
    threeGraph,
    /!geospatialComposite && glbAsset && shouldRenderGlbAsset/,
  )
  assert.match(
    threeGraph,
    /!geospatialComposite && spatialCaptureManifest/,
  )
  assert.match(
    threeGraph,
    /style=\{geospatialComposite \? \{ pointerEvents: 'none' \} : undefined\}/,
  )
})

test('Flight local mission coordinates project deterministically around Singapore', () => {
  const profile = readFlightSimXrSpatialProfile()
  const runtime = createFlightSimRuntime({
    profile,
    active: true,
    webglSupported: true,
  })
  const overlay = projectFlightSimToGeospatialOverlay(
    runtime.read(),
    profile,
    { source: 'fixed-follow', view: 'chase' },
    true,
  )

  assert.equal(overlay.active, true)
  assert.equal(overlay.route.length, profile.waypoints.length + 2)
  assert.deepEqual(overlay.route[0]?.coordinate, [103.851959, 1.29027])
  assert.equal(overlay.route[0]?.kind, 'spawn')
  assert.equal(overlay.route.at(-1)?.kind, 'landing')
  assert.ok(overlay.aircraft.coordinate.every(Number.isFinite))
  assert.ok(overlay.aircraft.headingDegrees >= 0)
  assert.ok(overlay.aircraft.headingDegrees < 360)
  assert.equal(overlay.night, true)
  assert.equal(overlay.camera.effectiveOwner, 'fixed-follow')

  const cockpit = projectFlightSimToGeospatialOverlay(
    runtime.read(),
    profile,
    { source: 'fixed-follow', view: 'cockpit' },
    false,
  )
  assert.notDeepEqual(
    cockpit.camera.centerCoordinate,
    cockpit.aircraft.coordinate,
  )
  assert.ok(
    cockpit.camera.cockpitClearance.forwardMeters
      > profile.aircraftHalfSize[2],
  )
  assert.ok(
    cockpit.camera.cockpitClearance.verticalMeters
      > profile.aircraftHalfSize[1],
  )
})
