import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { applyCanvasViewSelection } from '@/components/toolbar/canvasViewActions'
import {
  readGameFpsSnapshot,
  resetGameFpsRuntimeForTests,
} from '@/features/game-fps/gameFpsRuntime'
import {
  exitGameModeSurface,
  readGameModeSnapshot,
  resetGameModeRuntimeForTests,
  startGameMode,
} from '@/features/game-fps/gameModeRuntime'
import { completeSourceFilesBootstrap } from '@/features/source-files/sourceFilesBootstrapReadiness'
import {
  activateXrSceneSurface,
  readXrSceneGameplayModeRegistry,
  registerXrSceneGameplayMode,
} from '@/features/three/xrSceneSurfaceRuntime'
import { GameOsError, type GameOsModeDeclaration } from 'grph-shared/game-os/index'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  applyCanvasSurfaceModeSelection,
  type CanvasGraphSurfaceModeId,
} from '@/lib/canvas/canvas3dMode'
import type { GraphSchema } from '@/lib/graph/schema'

type GraphState = ReturnType<typeof useGraphStore.getState>

type RestorableState = Readonly<Pick<
  GraphState,
  | 'bottomSurfaceCollapsed'
  | 'bottomSurfaceTab'
  | 'canvas2dRenderer'
  | 'canvas3dMode'
  | 'canvasRenderMode'
  | 'canvasRenderModeIsAuto'
  | 'canvasRenderModeLastFree'
  | 'documentSemanticMode'
  | 'documentStructureBaselineLock'
  | 'floatingPanelOpen'
  | 'floatingPanelView'
  | 'frontmatterModeEnabled'
  | 'graphData'
  | 'markdownDocumentName'
  | 'markdownDocumentText'
  | 'multiDimTableModeEnabled'
  | 'schema'
>>

const BLOCK_SCHEMA = {
  layout: { mode: 'block' },
  behavior: {
    allowEdgeCreation: true,
    allowNodeDrag: true,
  },
  nodeStyles: {},
  edgeStyles: {},
  rules: [],
} as unknown as GraphSchema

const RADIAL_SCHEMA = {
  ...BLOCK_SCHEMA,
  layout: { mode: 'radial' },
} as GraphSchema

let stateBeforeTest: RestorableState | null = null

function captureRestorableState(): RestorableState {
  const state = useGraphStore.getState()
  return Object.freeze({
    bottomSurfaceCollapsed: state.bottomSurfaceCollapsed,
    bottomSurfaceTab: state.bottomSurfaceTab,
    canvas2dRenderer: state.canvas2dRenderer,
    canvas3dMode: state.canvas3dMode,
    canvasRenderMode: state.canvasRenderMode,
    canvasRenderModeIsAuto: state.canvasRenderModeIsAuto,
    canvasRenderModeLastFree: state.canvasRenderModeLastFree,
    documentSemanticMode: state.documentSemanticMode,
    documentStructureBaselineLock: state.documentStructureBaselineLock,
    floatingPanelOpen: state.floatingPanelOpen,
    floatingPanelView: state.floatingPanelView,
    frontmatterModeEnabled: state.frontmatterModeEnabled,
    graphData: state.graphData,
    markdownDocumentName: state.markdownDocumentName,
    markdownDocumentText: state.markdownDocumentText,
    multiDimTableModeEnabled: state.multiDimTableModeEnabled,
    schema: state.schema,
  })
}

function installAuthoredBlockFixture(): void {
  useGraphStore.setState({
    bottomSurfaceCollapsed: true,
    bottomSurfaceTab: 'stats',
    canvas2dRenderer: 'flowchart',
    canvas3dMode: '3d',
    canvasRenderMode: '2d',
    canvasRenderModeIsAuto: false,
    canvasRenderModeLastFree: '2d',
    documentSemanticMode: 'document',
    documentStructureBaselineLock: false,
    floatingPanelOpen: true,
    floatingPanelView: 'motionControl',
    frontmatterModeEnabled: false,
    graphData: {
      type: 'Graph',
      nodes: [],
      edges: [],
      metadata: {},
    },
    markdownDocumentName: 'canvas-surface-game-departure.md',
    markdownDocumentText: '# Authored shared XR scene',
    multiDimTableModeEnabled: false,
    schema: BLOCK_SCHEMA,
  } as never)
}

async function startActiveGame(): Promise<void> {
  const started = await startGameMode({ decisions: [], webglSupported: true })
  assert.equal(started.active, true)
  assert.equal(readGameFpsSnapshot().phase, 'playing')
  const state = useGraphStore.getState()
  assert.equal(state.canvasRenderMode, '3d')
  assert.equal(state.canvas3dMode, 'xr')
  assert.equal(state.floatingPanelView, 'gameMode')
}

function selectCanvasDestination(mode: Exclude<CanvasGraphSurfaceModeId, 'xr'>): boolean {
  const state = useGraphStore.getState()
  return applyCanvasSurfaceModeSelection({
    mode,
    canvas2dRenderer: state.canvas2dRenderer,
    documentSemanticMode: state.documentSemanticMode,
    frontmatterModeEnabled: state.frontmatterModeEnabled === true,
    multiDimTableModeEnabled: state.multiDimTableModeEnabled === true,
    geospatialEnabled: false,
    layoutMode: state.schema?.layout?.mode,
    schema: state.schema,
    onOpenGeospatialMode: () => {
      throw new Error('Canvas graph destination must not open Geospatial Mode')
    },
    setCanvas2dRenderer: state.setCanvas2dRenderer,
    setCanvas3dMode: state.setCanvas3dMode,
    setCanvasRenderMode: state.setCanvasRenderMode,
    setSchema: state.setSchema,
  })
}

test.beforeEach(() => {
  stateBeforeTest = captureRestorableState()
  completeSourceFilesBootstrap()
  resetGameModeRuntimeForTests()
  resetGameFpsRuntimeForTests()
  installAuthoredBlockFixture()
})

test.afterEach(() => {
  resetGameModeRuntimeForTests()
  resetGameFpsRuntimeForTests()
  const previous = stateBeforeTest
  stateBeforeTest = null
  if (previous) useGraphStore.setState(previous as never)
})

for (const destination of [
  { mode: '2d', renderMode: '2d', canvas3dMode: 'xr' },
  { mode: '3d', renderMode: '3d', canvas3dMode: '3d' },
  { mode: 'voxel', renderMode: '3d', canvas3dMode: 'voxel' },
] as const) {
  test(`root surface departure exits active Game and retains the ${destination.mode} destination`, async () => {
    await startActiveGame()

    assert.equal(selectCanvasDestination(destination.mode), true)

    assert.equal(readGameModeSnapshot().active, false)
    assert.equal(readGameFpsSnapshot().phase, 'stopped')
    const state = useGraphStore.getState()
    assert.equal(state.canvasRenderMode, destination.renderMode)
    assert.equal(state.canvas3dMode, destination.canvas3dMode)
    if (destination.mode === 'voxel') assert.equal(state.canvas2dRenderer, 'flowchart')
  })
}

test('root radial schema coercion exits active Game and retains its 2D destination', async () => {
  await startActiveGame()
  const state = useGraphStore.getState()

  state.setSchema({
    ...(state.schema || BLOCK_SCHEMA),
    layout: { ...(state.schema?.layout || {}), mode: 'radial' },
  } as GraphSchema)

  assert.equal(readGameModeSnapshot().active, false)
  assert.equal(readGameFpsSnapshot().phase, 'stopped')
  const destination = useGraphStore.getState()
  assert.equal(destination.canvasRenderMode, '2d')
  assert.equal(destination.schema?.layout?.mode, 'radial')
})

test('root table-mode coercion exits active Game and retains its 2D table destination', async () => {
  await startActiveGame()

  useGraphStore.getState().setMultiDimTableModeEnabled(true)

  assert.equal(readGameModeSnapshot().active, false)
  assert.equal(readGameFpsSnapshot().phase, 'stopped')
  const destination = useGraphStore.getState()
  assert.equal(destination.canvasRenderMode, '2d')
  assert.equal(destination.canvas2dRenderer, 'multiDimTable')
  assert.equal(destination.multiDimTableModeEnabled, true)
})

test('same-XR companion panel handoff exits Game without restoring its previous canvas surface', async () => {
  await startActiveGame()

  assert.equal(activateXrSceneSurface({ panelView: 'motionControl', openPanel: true }), true)

  assert.equal(readGameModeSnapshot().active, false)
  assert.equal(readGameFpsSnapshot().phase, 'stopped')
  const state = useGraphStore.getState()
  assert.equal(state.canvasRenderMode, '3d')
  assert.equal(state.canvas3dMode, 'xr')
  assert.equal(state.floatingPanelView, 'motionControl')
  assert.equal(state.floatingPanelOpen, true)
})

test('the shared XR owner keeps one exclusive gameplay overlay active', () => {
  let flightExitCount = 0
  let cityExitCount = 0
  const unregisterFlight = registerXrSceneGameplayMode('flightSim', {
    identity: 'flight-simulator',
    worldSchema: 'agentic-graph.test.flight-simulator/v1',
    persistence: { continuity: 'none', lease: 'none' },
    surface: { overlayKind: 'xr-scene-gameplay' },
    adaptInput: () => ({}),
    createOverlay: () => ({
      overlayId: 'flight-simulator',
      overlayKind: 'xr-scene-gameplay',
    }),
    exit: () => {
      flightExitCount += 1
    },
  } satisfies GameOsModeDeclaration)
  const unregisterCity = registerXrSceneGameplayMode('cityBuilder', {
    identity: 'city-builder',
    worldSchema: 'agentic-graph.test.city-builder/v1',
    persistence: { continuity: 'none', lease: 'none' },
    surface: { overlayKind: 'xr-scene-gameplay' },
    adaptInput: () => ({}),
    createOverlay: () => ({ overlayId: 'city-builder', overlayKind: 'xr-scene-gameplay' }),
    exit: () => { cityExitCount += 1 },
  } satisfies GameOsModeDeclaration)
  try {
    assert.deepEqual(
      readXrSceneGameplayModeRegistry().modes.map(mode => [mode.identity, mode.persistence]),
      [
        ['city-builder', { continuity: 'none', lease: 'none' }],
        ['first-person', { continuity: 'none', lease: 'none' }],
        ['flight-simulator', { continuity: 'none', lease: 'none' }],
      ],
    )
    assert.equal(activateXrSceneSurface({ gameplaySurface: 'flightSim', openPanel: true }), true)
    assert.deepEqual(readXrSceneGameplayModeRegistry(), {
      modes: readXrSceneGameplayModeRegistry().modes,
      activeIdentity: 'flight-simulator',
      liveOverlayCount: 1,
    })
    assert.equal(flightExitCount, 0)
    assert.equal(activateXrSceneSurface({ gameplaySurface: 'cityBuilder', openPanel: true }), true)
    assert.equal(flightExitCount, 1)
    assert.equal(cityExitCount, 0)
    assert.equal(readXrSceneGameplayModeRegistry().activeIdentity, 'city-builder')
    assert.equal(activateXrSceneSurface({ gameplaySurface: 'gameMode', openPanel: true }), true)
    assert.equal(cityExitCount, 1)
    assert.equal(readXrSceneGameplayModeRegistry().activeIdentity, 'first-person')
    assert.equal(activateXrSceneSurface({ panelView: 'camera', openPanel: true }), true)
    assert.equal(readXrSceneGameplayModeRegistry().liveOverlayCount, 0)
  } finally {
    unregisterCity()
    unregisterFlight()
  }
})

test('ordinary Game exit and test reset release the registry surface', async () => {
  await startActiveGame()
  assert.equal(readXrSceneGameplayModeRegistry().activeIdentity, 'first-person')
  exitGameModeSurface({ restorePreviousSurface: false })
  assert.equal(readXrSceneGameplayModeRegistry().liveOverlayCount, 0)
  await startActiveGame()
  resetGameModeRuntimeForTests()
  assert.equal(readXrSceneGameplayModeRegistry().liveOverlayCount, 0)
})

test('the migration cohort declares modes without a shared identity list', () => {
  const declarations = [
    ['game-fps/gameModeRuntime.ts', "identity: 'first-person'"],
    ['game-flight-sim/flightSimRuntime.ts', "identity: 'flight-simulator'"],
    ['game-city-sim/citySimRuntime.ts', "identity: 'city-builder'"],
  ] as const
  for (const [relativePath, identity] of declarations) {
    const source = readFileSync(resolve(process.cwd(), 'src/features', relativePath), 'utf8')
    assert.ok(source.includes('registerXrSceneGameplayMode('))
    assert.ok(source.includes('deactivateXrSceneGameplayMode('))
    assert.ok(source.includes(identity))
    assert.ok(source.includes("persistence: { continuity: 'none', lease: 'none' }"))
    assert.ok(source.includes("surface: { overlayKind: 'xr-scene-gameplay' }"))
  }
})

test('a failed mode departure keeps its registry handle retryable', () => {
  let exitShouldFail = true
  const unregister = registerXrSceneGameplayMode('cityBuilder', {
    identity: 'test-city-builder',
    worldSchema: 'agentic-graph.test.city-builder/v1',
    persistence: { continuity: 'none', lease: 'none' },
    surface: { overlayKind: 'xr-scene-gameplay' },
    adaptInput: () => ({}),
    createOverlay: () => ({ overlayId: 'test-city-builder', overlayKind: 'xr-scene-gameplay' }),
    exit: () => {
      if (exitShouldFail) throw new Error('departure blocked')
    },
  } satisfies GameOsModeDeclaration)
  assert.equal(activateXrSceneSurface({ gameplaySurface: 'cityBuilder' }), true)
  assert.throws(unregister, /did not release the scene surface/)
  exitShouldFail = false
  unregister()
  for (const activation of [
    { gameplaySurface: 'cityBuilder' as const },
    { panelView: 'cityBuilder' as const },
  ]) {
    assert.throws(
      () => activateXrSceneSurface(activation),
      error => error instanceof GameOsError && error.code === 'surface_unavailable',
    )
  }
})

test('failed toolbar XR activation has no raw setter fallthrough or state mutation', () => {
  useGraphStore.setState({
    bottomSurfaceCollapsed: true,
    bottomSurfaceTab: 'stats',
    canvas3dMode: '3d',
    canvasRenderMode: '2d',
    canvasRenderModeIsAuto: false,
    canvasRenderModeLastFree: '2d',
    floatingPanelOpen: false,
    floatingPanelView: 'propsPanel',
    schema: RADIAL_SCHEMA,
  } as never)
  const before = useGraphStore.getState()
  const beforeSurface = {
    bottomSurfaceCollapsed: before.bottomSurfaceCollapsed,
    bottomSurfaceTab: before.bottomSurfaceTab,
    canvas3dMode: before.canvas3dMode,
    canvasRenderMode: before.canvasRenderMode,
    canvasRenderModeIsAuto: before.canvasRenderModeIsAuto,
    canvasRenderModeLastFree: before.canvasRenderModeLastFree,
    floatingPanelOpen: before.floatingPanelOpen,
    floatingPanelView: before.floatingPanelView,
  }

  assert.equal(activateXrSceneSurface({
    panelView: 'motionControl',
    openPanel: true,
    timeline: true,
  }), false)
  const afterSharedActivation = useGraphStore.getState()
  assert.deepEqual({
    bottomSurfaceCollapsed: afterSharedActivation.bottomSurfaceCollapsed,
    bottomSurfaceTab: afterSharedActivation.bottomSurfaceTab,
    canvas3dMode: afterSharedActivation.canvas3dMode,
    canvasRenderMode: afterSharedActivation.canvasRenderMode,
    canvasRenderModeIsAuto: afterSharedActivation.canvasRenderModeIsAuto,
    canvasRenderModeLastFree: afterSharedActivation.canvasRenderModeLastFree,
    floatingPanelOpen: afterSharedActivation.floatingPanelOpen,
    floatingPanelView: afterSharedActivation.floatingPanelView,
  }, beforeSurface)

  let sharedPanelAttemptCount = 0
  applyCanvasViewSelection({
    id: 'surface:xr',
    ensureBaselineUnlocked: () => true,
    geospatialEnabled: false,
    onOpenGeospatialMode: () => {
      throw new Error('Rejected XR toolbar selection must not open Geospatial Mode')
    },
    onOpenShared3dPanel: () => {
      sharedPanelAttemptCount += 1
      assert.equal(activateXrSceneSurface({
        panelView: 'motionControl',
        openPanel: true,
        timeline: true,
      }), false)
    },
    canvas2dRenderer: afterSharedActivation.canvas2dRenderer,
    canvas3dMode: afterSharedActivation.canvas3dMode,
    canvasRenderMode: afterSharedActivation.canvasRenderMode,
    documentSemanticMode: afterSharedActivation.documentSemanticMode,
    frontmatterModeEnabled: afterSharedActivation.frontmatterModeEnabled === true,
    multiDimTableModeEnabled: afterSharedActivation.multiDimTableModeEnabled === true,
    renderMediaAsNodes: afterSharedActivation.renderMediaAsNodes === true,
    timelineEnabled: afterSharedActivation.timelineEnabled,
    bottomSurfaceCollapsed: afterSharedActivation.bottomSurfaceCollapsed === true,
    bottomSurfaceTab: afterSharedActivation.bottomSurfaceTab,
    schema: afterSharedActivation.schema,
    setCanvas2dRenderer: afterSharedActivation.setCanvas2dRenderer,
    setCanvas3dMode: afterSharedActivation.setCanvas3dMode,
    setCanvasRenderMode: afterSharedActivation.setCanvasRenderMode,
    setSchema: afterSharedActivation.setSchema,
    setBehavior: afterSharedActivation.setBehavior,
    setRenderMediaAsNodes: afterSharedActivation.setRenderMediaAsNodes,
    setTimelineEnabled: afterSharedActivation.setTimelineEnabled,
    setBottomSurfaceCollapsed: afterSharedActivation.setBottomSurfaceCollapsed,
    setBottomSurfaceTab: afterSharedActivation.setBottomSurfaceTab,
    setDocumentSemanticMode: afterSharedActivation.setDocumentSemanticMode,
    setFrontmatterModeEnabled: afterSharedActivation.setFrontmatterModeEnabled,
    setMultiDimTableModeEnabled: afterSharedActivation.setMultiDimTableModeEnabled,
  })
  assert.equal(sharedPanelAttemptCount, 1)
  const afterToolbarSelection = useGraphStore.getState()
  assert.deepEqual({
    bottomSurfaceCollapsed: afterToolbarSelection.bottomSurfaceCollapsed,
    bottomSurfaceTab: afterToolbarSelection.bottomSurfaceTab,
    canvas3dMode: afterToolbarSelection.canvas3dMode,
    canvasRenderMode: afterToolbarSelection.canvasRenderMode,
    canvasRenderModeIsAuto: afterToolbarSelection.canvasRenderModeIsAuto,
    canvasRenderModeLastFree: afterToolbarSelection.canvasRenderModeLastFree,
    floatingPanelOpen: afterToolbarSelection.floatingPanelOpen,
    floatingPanelView: afterToolbarSelection.floatingPanelView,
  }, beforeSurface)

  const toolbarSource = readFileSync(
    resolve(process.cwd(), 'src/components/toolbar/Canvas2dRendererSelect.tsx'),
    'utf8',
  )
  const xrBranch = toolbarSource.match(
    /if \(mode === 'xr'\) \{([\s\S]*?)\n\s*\}\n\s*if \(!state\.floatingPanelOpen\)/,
  )?.[1] || ''
  assert.match(xrBranch, /activateXrSceneSurface\(\{ panelView, openPanel: true, timeline: true \}\)/)
  assert.match(xrBranch, /\breturn\b/)
  assert.doesNotMatch(
    xrBranch,
    /\b(?:state|current)\.set(?:Canvas|Floating|Bottom)|\bsetMediaCatalogMode\b/,
  )
})
