import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { load as loadYaml } from 'js-yaml'
import { FLIGHT_SIM_CAMERA_VIEW_OPTIONS } from '@/features/game-flight-sim/flightSimCameraRuntime'
import {
  XR_NATIVE_CONTROLLER_CAMERA_DEFAULT_MODE,
  XR_NATIVE_CONTROLLER_CAMERA_OPTIONS,
} from '@/features/three/xrNativeControllerCameraCatalog'
import {
  FLIGHT_SIM_DEMO_REPO_REL_PATH,
  XR_PHYSICS_DEMO_REPO_REL_PATH,
} from '@/features/workspace-fs/workspaceRunReadyDemos'
import { getWorkspaceSeedFiles } from '@/features/workspace-fs/workspaceFs'

const repoRoot = resolve(process.cwd(), '..')
const seedSource = readFileSync(
  resolve(repoRoot, FLIGHT_SIM_DEMO_REPO_REL_PATH),
  'utf8',
)
const physicsSeedSource = readFileSync(
  resolve(repoRoot, XR_PHYSICS_DEMO_REPO_REL_PATH),
  'utf8',
)

function source(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
}

function frontmatter(value: string): Record<string, unknown> {
  const match = value.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  assert.ok(match)
  const parsed = loadYaml(match[1])
  assert.ok(parsed && typeof parsed === 'object' && !Array.isArray(parsed))
  return parsed as Record<string, unknown>
}

test('Flight production bootstrap preserves exact authored Physics seed bytes', async () => {
  const previousRepoLocal = process.env.VITE_AGENTICGRAPH_RUN_READY_REPO_LOCAL
  process.env.VITE_AGENTICGRAPH_RUN_READY_REPO_LOCAL = '1'
  try {
    const physicsSeed = (await getWorkspaceSeedFiles()).find(
      seed => seed.path.endsWith(XR_PHYSICS_DEMO_REPO_REL_PATH),
    )
    assert.equal(physicsSeed?.text, physicsSeedSource)
  } finally {
    if (previousRepoLocal === undefined) {
      delete process.env.VITE_AGENTICGRAPH_RUN_READY_REPO_LOCAL
    } else {
      process.env.VITE_AGENTICGRAPH_RUN_READY_REPO_LOCAL = previousRepoLocal
    }
  }
})

test('Flight preloads one visual-free mission follower and one native MapLibre presentation', () => {
  const loader = source('canvas/src/lib/three/flightSimMissionStageLoader.ts')
  const gameplayOverlay = source('canvas/src/lib/three/ThreeGameplayOverlay.tsx')
  const runtime = source('canvas/src/features/game-flight-sim/flightSimRuntime.ts')
  const missionStage = source('canvas/src/features/game-flight-sim/FlightSimMissionStage.tsx')
  const viewport = source('canvas/src/components/CanvasViewport.tsx')
  const bridge = source('canvas/src/components/CanvasViewportGeospatialOverlay.tsx')
  const mapPresentation = source(
    'gympgrph/src/features/geospatial/useFlightGeoOverlayMapLibrePresentation.ts',
  )
  const mapGate = source(
    'gympgrph/src/features/geospatial/flightGeoOverlayPresentationGate.ts',
  )
  const mapLayers = source('gympgrph/src/flightGeoOverlayMapLibreLayers.ts')

  assert.match(
    loader,
    /import\('@\/features\/game-flight-sim\/FlightSimMissionStage'\)/,
  )
  assert.match(loader, /module\.createFlightSimMissionStage\(runtimeController\)/)
  assert.match(
    gameplayOverlay,
    /const FlightSimMissionStageLazy = React\.lazy\(loadFlightSimMissionStage\)/,
  )
  assert.match(
    runtime,
    /preloadFlightSimMissionStage\(flightSimStageRuntimeController\)/,
  )
  assert.match(missionStage, /useFlightSimSurfaceControls\(\{/)
  assert.match(missionStage, /runtimeController\.subscribe\(syncRuntimeSnapshot\)/)
  assert.match(missionStage, /completeFlightSimReadyFrame\(presentation\.runId, presentation\.tick\)/)
  assert.match(missionStage, /return null/)
  assert.doesNotMatch(
    missionStage,
    /XrSceneLibraryAssetGeometry|XrProceduralVehicleGeometry|assetSpec|<mesh\b|<group\b|<primitive\b/,
  )
  assert.match(viewport, /<CanvasViewportGeospatialOverlayLazy/)
  assert.match(viewport, /<FlightSimHud \/>/)
  assert.doesNotMatch(viewport, /FlightSimGeoSurfaceOverlay/)
  assert.match(bridge, /onFlightOverlayPresented=\{handleFlightOverlayPresented\}/)
  assert.match(mapPresentation, /applyFlightGeoOverlayToMap\(map, overlay\)/)
  assert.match(mapGate, /canvas\.dataset\.kgFlightSimFirstFrameSurface = 'maplibre'/)
  for (const layer of ['route', 'routePoints', 'aircraft', 'aircraftOutline']) {
    assert.match(mapLayers, new RegExp(`${layer}:`))
  }
})

test('Flight Sim reuses shared fixed-follow and free-orbit camera ownership', () => {
  const meta = frontmatter(seedSource)
  const physicsMeta = frontmatter(physicsSeedSource)
  const flightCamera = (
    meta.native_flight_demo as { camera?: Record<string, unknown> }
  ).camera!
  const physicsCamera = (
    physicsMeta.native_controller_demo as { camera?: Record<string, unknown> }
  ).camera!
  for (const key of [
    'default',
    'selector',
    'available',
    'invocation',
    'timeline_override',
  ]) {
    assert.deepEqual(flightCamera[key], physicsCamera[key])
  }
  assert.equal(
    flightCamera.catalog_owner,
    'canvas/src/features/three/xrNativeControllerCameraCatalog.ts',
  )
  assert.equal(
    flightCamera.selection_owner,
    'canvas/src/features/three/xrNativeControllerCameraRuntime.ts',
  )
  assert.equal(
    flightCamera.driver_owner,
    'gympgrph/src/flightGeoOverlayMapLibreCamera.ts',
  )
  assert.deepEqual(
    XR_NATIVE_CONTROLLER_CAMERA_OPTIONS.map(option => option.id),
    flightCamera.available,
  )
  assert.equal(XR_NATIVE_CONTROLLER_CAMERA_DEFAULT_MODE, flightCamera.default)
  assert.deepEqual(
    FLIGHT_SIM_CAMERA_VIEW_OPTIONS.map(option => option.id),
    flightCamera.flight_views,
  )
})
