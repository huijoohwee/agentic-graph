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
import { resolveCanvasSurfaceOwnership } from '@/lib/canvas/canvasSurfaceOwnershipRuntime'

function readCanvasSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), 'src', relativePath), 'utf8')
}

function collectTextFiles(path: string): readonly string[] {
  if (statSync(path).isFile()) return [path]
  return readdirSync(path)
    .flatMap(entry => collectTextFiles(resolve(path, entry)))
    .filter(file => /\.(?:md|ts|tsx|mjs)$/.test(file) || file.endsWith('.kiro'))
}

export function testCitySimGeoXrUsesOneSemanticMapLibreSurfaceWithRetainedInactiveThreeOwner() {
  const overlay = readCanvasSource('lib/three/ThreeGameplayOverlay.tsx')
  const threeGraph = readCanvasSource('lib/three/ThreeGraph.impl.tsx')
  const mediaFigure = readCanvasSource('lib/cards/SemanticMediaFigure.tsx')
  const mediaSurface = readCanvasSource(
    'features/game-city-sim/citySimMediaSurface.ts',
  )
  const viewport = readCanvasSource('components/CanvasViewport.tsx')
  const rendererLifecycle = readCanvasSource(
    'lib/three/threeRendererLifecycle.ts',
  )
  const geospatialOverlay = readCanvasSource(
    'components/CanvasViewportGeospatialOverlay.tsx',
  )
  const xrPhysicsRuntime = readCanvasSource(
    'features/canvas/XrPhysicsRunReadyDemoRuntime.tsx',
  )
  assert.doesNotMatch(
    overlay,
    /citySim|CitySim/,
    'the shared gameplay scene must not retain a local City render or input fallback',
  )
  assert.doesNotMatch(threeGraph, /citySim|CitySim/)
  assert.ok(
    viewport.includes(
      '<SemanticMediaFigure',
    ),
    'the semantic City wrapper must own the native MapLibre surface',
  )
  assert.equal(
    viewport.match(/<SemanticMediaFigure\b/g)?.length,
    1,
    'the viewport must mount one shared semantic MapLibre wrapper',
  )
  assert.equal(
    viewport.match(/<CanvasViewportGeospatialOverlayLazy\b/g)?.length,
    1,
    'the viewport must mount one shared native Geo owner',
  )
  assert.ok(
    viewport.includes(
      "active={activeSurface === 'geo' || activeSurface === 'geo-xr'}",
    ),
    'document switching must not deactivate and dispose the retained native Geo owner',
  )
  assert.ok(
    viewport.includes(
      'threeOverlayComposed={cityMapLibreSurfaceRequested ? false : geospatialXrModeEnabled}',
    ),
    'City source intent must not compose a Three overlay above the MapLibre owner',
  )
  assert.ok(
    viewport.includes(
      "data-kg-three-canvas-active={threeCanvasSurface.active ? '1' : '0'}",
    ),
    'the retained shared Canvas must expose its inactive lifecycle state',
  )
  assert.doesNotMatch(
    threeGraph,
    /data-kg-geo-xr-surface/,
    'the shared Canvas is a presentation layer, not a second Geo+XR surface owner',
  )
  assert.ok(
    geospatialOverlay.includes(
      "data-kg-geo-xr-surface={active && composedWithXr ? 'active' : undefined}",
    ),
    'the retained geographic wrapper must remain the sole Geo+XR surface owner',
  )
  assert.doesNotMatch(
    viewport,
    /cityMapLibreSurfaceRequested\s*\?\s*\(\s*<SemanticMediaFigure/,
    'City activation must not replace the shared semantic MapLibre owner',
  )
  assert.ok(
    viewport.includes(
      '{geospatialCompositionEnabled && !heavyRuntimeIntentBlocked ? (',
    ),
    'document switching must retain the one geospatial owner beneath the transition notice',
  )
  assert.doesNotMatch(
    viewport,
    /!documentSwitchOwnsViewport\s*&&\s*geospatialCompositionEnabled\s*&&\s*!heavyRuntimeIntentBlocked/,
    'document switching must not unmount the geospatial owner',
  )
  assert.ok(
    !/citySim|CitySim|MapLibre/.test(rendererLifecycle),
    'Three lifecycle ownership must remain independent from the City MapLibre surface',
  )
  assert.ok(
    rendererLifecycle.includes(
      '(!input.geospatialOverlayOwnsViewport || input.rendererPreviouslyMounted)',
    )
      && rendererLifecycle.includes(
        '&& !input.geospatialOverlayOwnsViewport',
      ),
    'an existing shared renderer must remain mounted but inactive while MapLibre owns the viewport',
  )
  assert.deepEqual(resolveCanvasSurfaceOwnership({
    canvasRenderMode: '3d',
    cityMapLibreSurfaceRequested: true,
    flightSimActive: false,
    gameplayOverlayActive: true,
    geospatialModeEnabled: false,
    geospatialXrModeEnabled: false,
    workspaceEditorOverlayOpen: false,
    workspaceStoryboardSurfaceActive: false,
  }), {
    activeSurface: 'geo-xr',
    geospatialOverlayOwnsViewport: true,
  })
  assert.ok(
    geospatialOverlay.includes(
      'data-kg-city-maplibre-owner={',
    ),
    'Geo+XR evidence must identify the actual MapLibre-only City owner',
  )
  assert.ok(
    geospatialOverlay.includes(
      "data-kg-geo-xr-layer={composedWithXr ? 'geo-background' : undefined}",
    ),
    'City must retain the stable native Geo ownership selector',
  )
  assert.ok(mediaFigure.includes('<figure'))
  assert.ok(mediaFigure.includes('<figcaption'))
  assert.ok(mediaFigure.includes(
    "active && selectionTarget === 'figure'",
  ))
  assert.equal(/<(?:div)\b|aria-hidden|on(?:Click|Mouse|Pointer)/.test(mediaFigure), false)
  assert.ok(mediaSurface.includes('CITY_SIM_MEDIA_STAGE_LABEL'))
  assert.ok(viewport.includes('semanticMediaOwner={citySimActive ? {'))
  assert.ok(viewport.includes('label: CITY_SIM_MEDIA_STAGE_LABEL'))
  assert.ok(viewport.includes('selectionTarget="descendant"'))
  assert.ok(viewport.includes('MEDIA_PREVIEW_SELECTABLE_SURFACE_ATTR'))
  assert.ok(
    geospatialOverlay.includes(
      'const stableSemanticMediaOwner = React.useMemo',
    )
      && geospatialOverlay.includes(
        'semanticMediaOwner={stableSemanticMediaOwner}',
      ),
    'the live MapLibre canvas semantic owner must not churn on City updates',
  )
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
  const viewport = readCanvasSource(
    'components/CanvasViewportGeospatialOverlay.tsx',
  )
  const geospatialPublisher = readCanvasSource(
    'features/geospatial/useGeoXrOverlayPublisher.ts',
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
      'projectCityAerial: projectCitySimAerialInspectionToGeospatialOverlay',
    ),
    'the shared geospatial publisher must project City through the existing aerial-inspection overlay',
  )
  assert.ok(
    geospatialPublisher.includes('publishGeoXrOverlayComposition({'),
    'the shared publisher must use the behavior-tested atomic Geo+XR composition',
  )
  assert.ok(geospatialPublisher.includes('subscribeCitySimSnapshot('))
  assert.ok(
    geospatialPublisher.includes('projectCityOverlay: projectCitySimToGeospatialOverlay'),
    'the shared publisher must project the live City snapshot to its own Geo overlay',
  )
  assert.ok(
    viewport.includes(
      'if (!active || !composedWithXr || !flightSimActive) return',
    ),
    'City aerial inspection must not claim the Flight MapLibre readiness presenter',
  )
  assert.doesNotMatch(
    aerialProjection,
    /\b(?:open|start|restart)FlightSim\b|claimFlightSimReadyPresenter|readFlightSimXrSpatialProfile|projectFlightSimToGeospatialOverlay/,
    'the City aerial projector must consume only the authored City profile and invoke no Flight runtime path',
  )
  assert.ok(
    aerialProjection.includes("presentationOwner: 'city'")
      && aerialProjection.includes('environment: null'),
    'the independent aerial projection must publish atomic City ownership without a local XR environment',
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
      'knowgrph-game-city-building-sim-prd-tad-ard.md',
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
