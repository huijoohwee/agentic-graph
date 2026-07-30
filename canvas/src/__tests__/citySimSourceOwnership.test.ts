import assert from 'node:assert/strict'
import {
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { resolve } from 'node:path'
import {
  CITY_SIM_DEMO_WORKSPACE_SEED_BASENAME,
  diagnoseWorkspaceRunReadyDemoActivation,
  isCitySimRunReadyDemoActive,
  isXrPhysicsRuntimeRunReadyDemoActive,
} from '@/features/workspace-fs/workspaceRunReadyDemos'

function readCanvasSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src', relativePath), 'utf8')
}

function collectTextFiles(path: string): readonly string[] {
  if (statSync(path).isFile()) return [path]
  return readdirSync(path)
    .flatMap(entry => collectTextFiles(resolve(path, entry)))
    .filter(file => /\.(?:md|ts|tsx|mjs)$/.test(file) || file.endsWith('.kiro'))
}

export function testCitySimStageReusesSharedCanvasAndCameraOwnership() {
  const stage = readCanvasSource('features/game-city-sim/CitySimStage.tsx')
  const overlay = readCanvasSource('lib/three/ThreeGameplayOverlay.tsx')
  const threeGraph = readCanvasSource('lib/three/ThreeGraph.impl.tsx')
  const mediaFigure = readCanvasSource('lib/three/ThreeCanvasMediaFigure.tsx')
  const viewport = readCanvasSource('components/CanvasViewport.tsx')
  const xrPhysicsRuntime = readCanvasSource(
    'features/canvas/XrPhysicsRunReadyDemoRuntime.tsx',
  )
  assert.equal(stage.includes('<Canvas'), false, 'City Stage must not mount a Canvas')
  assert.equal(
    /import\s*\{[^}]*\bCanvas\b[^}]*\}\s*from\s*['"]@react-three\/fiber['"]/.test(stage),
    false,
    'City Stage must not import the Canvas component',
  )
  assert.ok(
    stage.match(/<instancedMesh\b/g)?.length === 2,
    'City Stage must project parcels and buildings through two InstancedMesh nodes',
  )
  assert.ok(stage.includes('instanceMatrix.needsUpdate = true'))
  assert.ok(stage.includes('instanceColor.needsUpdate = true'))
  assert.ok(stage.includes('cityCamera.updateProjectionMatrix()'))
  assert.ok(stage.includes('set({ camera: cityCamera })'))
  assert.ok(stage.includes('set({ camera: previousCamera })'))
  assert.equal(
    stage.match(/onPointerDown=\{selectInstance\}/g)?.length,
    2,
    'City parcels and buildings must retain the shared XR pointer owner',
  )
  assert.ok(overlay.includes('<CitySimStageLazy'))
  assert.ok(overlay.includes('if (props.citySimActive) return <CitySimMissionStage />'))
  assert.ok(overlay.includes('enqueueCityInput({'))
  assert.ok(overlay.includes('onSelectParcel={selectParcel}'))
  assert.ok(
    viewport.includes(
      "geospatialXrModeEnabled && !citySimActive ? 'pointer-events-none' : 'pointer-events-auto'",
    ),
    'Geo+XR must retain pointer events on the City parcel stage while MapLibre presents the aerial background',
  )
  assert.ok(
    threeGraph.includes(
      "style={geospatialComposite && !citySimStageActive ? { pointerEvents: 'none' } : undefined}",
    ),
    'the shared Three Canvas must remain interactive only for City parcel selection in Geo+XR',
  )
  assert.ok(
    threeGraph.includes(
      "data-kg-city-sim-surface={citySim.active ? 'geo-xr' : undefined}",
    ),
  )
  assert.ok(
    threeGraph.includes(
      "citySimStageActive ? 'city-parcel-select'",
    ),
  )
  assert.ok(
    threeGraph.includes(
      'const hasGraph = !citySimRunReadyDemo && !citySimStageActive && !!sceneGraphForRender',
    ),
    'City source intent and active stage must suppress the unrelated authored/native XR graph before scene authority and placement are derived',
  )
  assert.ok(threeGraph.includes('<ThreeCanvasMediaFigure citySimActive={citySimStageActive}>'))
  assert.ok(mediaFigure.includes('<figure'))
  assert.ok(mediaFigure.includes('<figcaption'))
  assert.ok(mediaFigure.includes('resolveMediaPreviewSelectableDataAttr(citySimActive)'))
  assert.equal(/<(?:div)\b|aria-hidden|on(?:Click|Mouse|Pointer)/.test(mediaFigure), false)
  assert.ok(
    xrPhysicsRuntime.includes(
      'const { citySimActive, flightSimActive, gameFpsActive } = useCanvasGameplayOverlayState()',
    ),
  )
  assert.ok(
    xrPhysicsRuntime.includes(
      'const gameplayOverlayActive = citySimActive || flightSimActive || gameFpsActive',
    ),
    'XR physics demo must fence its authored runtime while City owns the gameplay overlay',
  )
}

export function testCitySimRouterComposesAllSixExistingPanelProjections() {
  const router = readCanvasSource('lib/toolbar/FloatingPanelXrSceneViews.tsx')
  const storeTypes = readCanvasSource(
    'hooks/store/store-types/graph-state-chat-import.ts',
  )
  assert.ok(router.includes("view === 'cityBuilder' ? <CitySimFloatingPanelViewLazy />"))
  assert.ok(storeTypes.includes("| 'cityBuilder'"))
  for (const surface of [
    'media',
    'animation',
    'motionControl',
    'gameMode',
    'flightSim',
    'camera',
  ]) {
    assert.ok(
      router.includes(`view === '${surface}'`),
      `shared FloatingPanel router must retain ${surface}`,
    )
  }
  assert.ok(
    router.includes('<CitySimPanelProjection surface={projectionSurface} />'),
    'all six sibling panels must compose the snapshot-backed city projection',
  )
}

export function testCitySimCompetingGameplayRuntimesUseExplicitSurfaceClaims() {
  const gameMode = readCanvasSource('features/game-fps/gameModeRuntime.ts')
  const flightSim = readCanvasSource('features/game-flight-sim/flightSimSurfacePresentationRuntime.ts')
  const citySim = readCanvasSource('features/game-city-sim/citySimRuntime.ts')
  const geospatialPublisher = readCanvasSource(
    'components/CanvasViewportGeospatialOverlay.tsx',
  )
  const aerialProjection = readCanvasSource(
    'features/game-city-sim/citySimAerialInspectionProjection.ts',
  )
  const xrPhysics = readCanvasSource('features/canvas/XrPhysicsRunReadyDemoRuntime.tsx')
  assert.ok(gameMode.includes("gameplaySurface: 'gameMode'"))
  assert.ok(flightSim.includes("gameplaySurface: 'flightSim'"))
  assert.ok(citySim.includes("gameplaySurface: 'cityBuilder'"))
  assert.ok(
    citySim.includes('commitCanvasGeospatialSurfaceOwnership(true, {'),
    'City must claim the canonical native Geo owner instead of disabling it',
  )
  assert.ok(
    citySim.includes(
      'isCurrent: () => expectedGeneration === asyncGeneration',
    ),
    'the native Geo claim must roll back when a newer City lifecycle supersedes entry',
  )
  assert.ok(
    citySim.includes('geospatialComposite: true'),
    'City must activate the shared XR surface as a Geo+XR composition',
  )
  assert.ok(
    geospatialPublisher.includes(
      'projectCitySimAerialInspectionToGeospatialOverlay(',
    ),
    'the shared geospatial publisher must project City through the existing aerial-inspection overlay',
  )
  assert.ok(
    geospatialPublisher.includes('applyGeoXrGameplayOverlayPublication({'),
    'the shared publisher must retain deterministic Flight-first City arbitration',
  )
  assert.ok(geospatialPublisher.includes('subscribeCitySimSnapshot('))
  assert.ok(
    geospatialPublisher.includes(
      'if (!active || !composedWithXr || !flightSimActive) return',
    ),
    'City aerial inspection must not claim the Flight MapLibre readiness presenter',
  )
  assert.doesNotMatch(
    aerialProjection,
    /\b(?:open|start|restart)FlightSim\b|claimFlightSimReadyPresenter/,
    'the City projector must reuse Flight geometry without invoking Flight lifecycle or readiness',
  )
  assert.match(
    aerialProjection,
    /false,\s*null,\s*null,\s*\)/,
    'the City projector must clear the Flight XR environment while retaining stopped aircraft and route geometry',
  )
  assert.ok(xrPhysics.includes('citySimActive || flightSimActive || gameFpsActive'))
}

export function testCitySimSourceIdentityFailsClosedWithoutAuthoredId() {
  const missingIdentity = diagnoseWorkspaceRunReadyDemoActivation(
    CITY_SIM_DEMO_WORKSPACE_SEED_BASENAME,
    '# Missing source identity',
  )
  assert.equal(missingIdentity.ok, false)
  if (missingIdentity.ok === false) {
    assert.equal(missingIdentity.errorCode, 'RUN_READY_IDENTITY_UNREGISTERED')
  }
  const seed = readFileSync(resolve(
    process.cwd(),
    '..',
    'docs',
    'workspace-seeds',
    CITY_SIM_DEMO_WORKSPACE_SEED_BASENAME,
  ), 'utf8')
  assert.equal(
    isCitySimRunReadyDemoActive(CITY_SIM_DEMO_WORKSPACE_SEED_BASENAME, seed),
    true,
  )
  assert.equal(
    isXrPhysicsRuntimeRunReadyDemoActive(
      CITY_SIM_DEMO_WORKSPACE_SEED_BASENAME,
      seed,
    ),
    false,
    'City source authority must not prelaunch the native XR physics environment',
  )
}

export function testCitySimOwnedFilesRetainCleanRoomIdentityBoundary() {
  const repositoryRoot = resolve(process.cwd(), '..')
  const cityOwnedPaths = [
    resolve(repositoryRoot, 'canvas', 'src', 'features', 'game-city-sim'),
    resolve(repositoryRoot, '.kiro', 'specs', 'knowgrph-city-building-sim'),
    resolve(
      repositoryRoot,
      'docs',
      'documents',
      'knowgrph-game-city-building-sim-rd-tad.md',
    ),
    resolve(
      repositoryRoot,
      'docs',
      'workspace-seeds',
      'knowgrph-game-city-building-sim-demo.md',
    ),
  ]
  const prohibitedOwner = ['ami', 'lich'].join('')
  const prohibitedSlug = ['isometric', 'city'].join('-')
  const prohibitedNeedles = [
    prohibitedOwner,
    prohibitedSlug,
    `${prohibitedOwner}/${prohibitedSlug}`,
  ]
  for (const file of cityOwnedPaths.flatMap(collectTextFiles)) {
    const source = readFileSync(file, 'utf8').toLowerCase()
    for (const needle of prohibitedNeedles) {
      assert.equal(
        source.includes(needle),
        false,
        `${file} must not retain a prohibited external identity`,
      )
    }
  }
}
