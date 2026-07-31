import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { projectFlightSimToGeospatialOverlay } from '@/features/game-flight-sim/flightSimGeospatialProjection'
import { projectXrEnvironmentToFlightGeo } from '@/features/game-flight-sim/flightSimGeoEnvironmentProjection'
import { createFlightSimRuntime } from '@/features/game-flight-sim/flightSimRuntimeCore'
import { readFlightSimXrSpatialProfile } from '@/features/game-flight-sim/flightSimSpatialProfile'
import { projectSingaporeLocalMeters } from '@/lib/gympgrph/api'

const METERS_PER_LATITUDE_DEGREE = 111_320

function assertApproximatelyEqual(
  actual: number,
  expected: number,
  label: string,
): void {
  assert.ok(
    Math.abs(actual - expected) < 1e-3,
    `${label}: expected ${expected}, received ${actual}`,
  )
}

function projectedRingSizeMeters(
  ring: readonly (readonly [number, number])[],
): Readonly<{ depth: number; width: number }> {
  const coordinates = ring.slice(0, -1)
  const latitude = coordinates.reduce((sum, coordinate) => sum + coordinate[1], 0)
    / coordinates.length
  const metersPerLongitudeDegree = METERS_PER_LATITUDE_DEGREE
    * Math.cos(latitude * Math.PI / 180)
  const longitudes = coordinates.map(coordinate => coordinate[0])
  const latitudes = coordinates.map(coordinate => coordinate[1])
  return {
    width: (Math.max(...longitudes) - Math.min(...longitudes))
      * metersPerLongitudeDegree,
    depth: (Math.max(...latitudes) - Math.min(...latitudes))
      * METERS_PER_LATITUDE_DEGREE,
  }
}

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
  const gameplayOverlay = readFileSync(
    path.resolve(process.cwd(), 'src/lib/three/ThreeGameplayOverlay.tsx'),
    'utf8',
  )
  const flightMissionStage = readFileSync(
    path.resolve(
      process.cwd(),
      'src/features/game-flight-sim/FlightSimMissionStage.tsx',
    ),
    'utf8',
  )
  const canvasCss = readFileSync(
    path.resolve(process.cwd(), 'src/index.css'),
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
  const mapLibrePresentation = readFileSync(
    path.resolve(
      process.cwd(),
      '../gympgrph/src/features/geospatial/useFlightGeoOverlayMapLibrePresentation.ts',
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
    /immersiveMediaStageActive && !geospatialComposite \? <ThreeGraphImmersiveMediaStage/,
  )
  assert.match(
    mapLibrePresentation,
    /applyFlightGeoEnvironmentToMap\(/,
  )
  assert.match(
    mapLibrePresentation,
    /map\?\.on\?\.\('style\.load', scheduleFinalApply\)/,
  )
  assert.match(
    mapLibrePresentation,
    /map\?\.off\?\.\('style\.load', scheduleFinalApply\)/,
  )
  assert.match(
    mapLibrePresentation,
    /\{ stageStopped: overlay\.phase === 'stopped' \}/,
  )
  assert.match(
    threeGraph,
    /style=\{geospatialComposite \? \{ pointerEvents: 'none' \} : undefined\}/,
  )
  assert.match(
    gameplayOverlay,
    /if \(props\.flightSimActive\)[\s\S]*<FlightSimMissionStageLazy[\s\S]*actorsVisible/,
  )
  assert.doesNotMatch(
    gameplayOverlay,
    /actorsVisible=\{!props\.geospatialComposite\}/,
  )
  assert.match(
    gameplayOverlay,
    /geospatialComposite=\{props\.geospatialComposite\}/,
  )
  assert.match(
    flightMissionStage,
    /geospatialComposite \? \([\s\S]*name="kg_flight_sim_geospatial_actor_lighting"[\s\S]*<ambientLight intensity=\{0\.9\} \/>[\s\S]*<hemisphereLight args=\{\['#ffffff', '#cbd5e1', 0\.6\]\} \/>[\s\S]*<pointLight position=\{\[120, 120, 120\]\} intensity=\{0\.9\} \/>/,
  )
  assert.match(
    flightMissionStage,
    /preservesTransparentBackground: true/,
  )
  assert.doesNotMatch(
    flightMissionStage,
    /<color attach="background"|<fog/,
  )
  assert.match(threeGraph, /data-kg-three-canvas-owner="1"/)
  assert.match(
    canvasCss,
    /\[data-kg-three-canvas-owner="1"\] canvas \{[\s\S]*?width: 100% !important;[\s\S]*?height: 100% !important;/,
  )
})

test('Flight Geo bootstrap retains one map owner and stages pre-document ownership', () => {
  const basemapHook = readFileSync(
    path.resolve(
      process.cwd(),
      '../gympgrph/src/features/geospatial/useMapLibreBasemap.ts',
    ),
    'utf8',
  )
  const basemapEffectDependencies = basemapHook.match(
    /\}, \[enabled, rootRef, containerRef, targetStyleUrl,[^\]]+\]\)/,
  )?.[0] || ''
  assert.ok(basemapEffectDependencies)
  assert.doesNotMatch(basemapEffectDependencies, /initialStyleOverride/)
  assert.doesNotMatch(basemapEffectDependencies, /onGrabMapsFallback/)
  assert.match(basemapHook, /override is an activation bootstrap, not live map state/)
  assert.match(
    basemapHook,
    /onGrabMapsFallbackRef\.current = onGrabMapsFallback/,
  )
  assert.match(
    basemapHook,
    /flightBootstrapActive:\s*\(\)\s*=>\s*Boolean\(readLiveFlightBootstrapStyle\(\)\)/,
  )
  assert.doesNotMatch(basemapHook, /onGrabMapsFallback\?\.\(\)/)
  const bootstrapReconciliationDependencies = basemapHook.match(
    /\}, \[\n[ ]{4}enabled,\n[ ]{4}initialStyleOverride,[\s\S]*?\n[ ]{2}\]\)\n\n[ ]{2}return state/,
  )?.[0] || ''
  assert.ok(bootstrapReconciliationDependencies)
  assert.doesNotMatch(
    bootstrapReconciliationDependencies,
    /onGrabMapsFallback/,
  )
  assert.match(basemapHook, /reconcileMapLibreFlightBootstrap\(\{/)

  const startupRuntimes = readFileSync(
    path.resolve(
      process.cwd(),
      'src/features/canvas/CanvasStartupRuntimes.tsx',
    ),
    'utf8',
  )
  const flightRunReadyRuntime = readFileSync(
    path.resolve(
      process.cwd(),
      'src/features/canvas/FlightSimRunReadyDemoRuntime.tsx',
    ),
    'utf8',
  )
  const flightOwnerIndex = startupRuntimes.indexOf('<FlightSimRunReadyDemoRuntime />')
  const deferredOwnerGateIndex = startupRuntimes.indexOf(
    'sourceFilesBootstrapHasReachedReady ?',
  )
  assert.ok(flightOwnerIndex > 0)
  assert.ok(deferredOwnerGateIndex > flightOwnerIndex)
  assert.match(
    flightRunReadyRuntime,
    /if \(!hydrated\) \{[\s\S]*settleFailedLaunch\([\s\S]*true,[\s\S]*\)[\s\S]*return null/,
  )
})

test('Flight local mission coordinates project deterministically around Singapore', () => {
  const profile = readFlightSimXrSpatialProfile()
  const runtime = createFlightSimRuntime({
    profile,
    active: true,
    webglSupported: true,
  })
  const environment = projectXrEnvironmentToFlightGeo({
    stageId: 'singapore',
    subjects: [{
      id: 'helicopter',
      assetId: 'vehicle-helicopter',
      category: 'vehicles',
      label: 'Helicopter',
      color: '#f59e0b',
      position: [4, 2, -3],
      rotationYDegrees: 0,
      scale: 1,
    }],
  })
  const overlay = projectFlightSimToGeospatialOverlay(
    runtime.read(),
    profile,
    { source: 'fixed-follow', view: 'chase' },
    true,
    null,
    environment,
  )

  assert.equal(overlay.active, true)
  assert.equal(overlay.presentationOwner, 'flight')
  assert.equal(overlay.route.length, profile.waypoints.length + 2)
  assert.deepEqual(overlay.route[0]?.coordinate, [103.851959, 1.29027])
  assert.equal(overlay.route[0]?.kind, 'spawn')
  assert.equal(overlay.route.at(-1)?.kind, 'landing')
  assert.ok(overlay.objective)
  assert.equal(overlay.objective.id, profile.waypoints[0]?.id)
  assert.equal(overlay.objective.label, 'WP1')
  assert.ok(Number.isFinite(overlay.objective.headingErrorDegrees))
  assert.ok(overlay.aircraft.coordinate.every(Number.isFinite))
  assert.ok(overlay.aircraft.headingDegrees >= 0)
  assert.ok(overlay.aircraft.headingDegrees < 360)
  assert.equal(overlay.night, true)
  assert.equal(overlay.camera.effectiveOwner, 'fixed-follow')
  assert.equal(overlay.environment?.id, 'singapore')
  assert.equal(
    overlay.environment?.surfaces.some(surface => surface.id === 'helicopter'),
    true,
  )
  const environmentProjectionSource = readFileSync(
    path.resolve(
      process.cwd(),
      'src/features/game-flight-sim/flightSimGeoEnvironmentProjection.ts',
    ),
    'utf8',
  )
  assert.doesNotMatch(
    environmentProjectionSource,
    /flightSimAuthoredWorldUnitsToMeters/,
    'XR stage and asset dimensions are already expressed in local metres',
  )
  const stageFootprint = environment.stageFootprint
  assert.deepEqual(
    stageFootprint[0],
    projectSingaporeLocalMeters(-16, 12),
    'the first Singapore stage corner must remain the authored [-16, 0, -12] metre corner',
  )
  const stageFootprintMeters = projectedRingSizeMeters(stageFootprint)
  assertApproximatelyEqual(stageFootprintMeters.width, 32, 'stage footprint width')
  assertApproximatelyEqual(stageFootprintMeters.depth, 24, 'stage footprint depth')

  const footprint = environment.surfaces.find(
    surface => surface.id === 'singapore:footprint',
  )
  assert.ok(footprint)
  assert.equal(footprint.baseHeightMeters, 0)
  assert.equal(footprint.heightMeters, 0.08)

  const skyline = environment.surfaces.find(
    surface => surface.id === 'skyline-center',
  )
  assert.ok(skyline)
  assert.equal(skyline.baseHeightMeters, 0)
  assert.equal(skyline.heightMeters, 12)
  const skylineMeters = projectedRingSizeMeters(skyline.ring)
  assertApproximatelyEqual(skylineMeters.width, 4.4, 'skyline width')
  assertApproximatelyEqual(skylineMeters.depth, 4.4, 'skyline depth')

  const helicopter = environment.surfaces.find(
    surface => surface.id === 'helicopter',
  )
  assert.ok(helicopter)
  assert.equal(helicopter.baseHeightMeters, 2)
  assert.equal(helicopter.heightMeters, 5.4)
  const helicopterMeters = projectedRingSizeMeters(helicopter.ring)
  assertApproximatelyEqual(helicopterMeters.width, 7.4, 'helicopter width')
  assertApproximatelyEqual(helicopterMeters.depth, 9, 'helicopter depth')

  const completedOverlay = projectFlightSimToGeospatialOverlay(
    {
      ...runtime.read(),
      phase: 'completed' as const,
      waypointIndex: profile.waypoints.length,
    },
    profile,
    { source: 'fixed-follow', view: 'chase' },
    false,
  )
  assert.equal(completedOverlay.route.at(-1)?.kind, 'landing')
  assert.equal(completedOverlay.route.at(-1)?.state, 'visited')
  assert.equal(completedOverlay.objective, null)

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
