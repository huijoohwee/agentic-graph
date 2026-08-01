import assert from 'node:assert/strict'
import test from 'node:test'
import fc from 'fast-check'
import { JSDOM } from 'jsdom'
import { flightSimPropertyParameters } from './helpers/flightSimPropertyHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  exitFlightSimSurface,
  openFlightSimSurface,
  readFlightSimSnapshot,
  resetFlightSimRuntimeForTests,
  waitForFlightSimSurfaceRestoration,
} from '@/features/game-flight-sim/flightSimRuntime'
import {
  isGeospatialModeEnabled,
  setGeospatialModeEnabled as setGympgrphGeospatialModeEnabled,
} from 'gympgrph'
import {
  readGeospatialOverlayEnabledPreference,
  writeGeospatialOverlayEnabledPreference,
} from '@/lib/geospatial/geospatialModePreference'
import {
  resetFlightSimDecisionStoreForTests,
} from '@/features/game-flight-sim/flightSimDecisionStore'
import {
  FLIGHT_SIM_SURFACE_ENTRY_FAILURE_CODE,
  FLIGHT_SIM_SURFACE_RESTORATION_FAILURE_CODE,
  readFlightSimSurfaceOwnershipStatus,
} from '@/features/game-flight-sim/flightSimSurfaceOwnershipStatus'
import {
  captureFlightSimPreviousCanvasSurface,
} from '@/features/game-flight-sim/flightSimSurfaceOwnershipRuntime'
import {
  hydrateXrPhysicsRuntime,
  pauseXrPhysicsRuntime,
  playXrPhysicsRuntime,
  readXrPhysicsRuntime,
  readXrPhysicsRuntimeFrame,
  stopXrPhysicsRuntime,
  type XrPhysicsRuntimePhase,
} from '@/features/three/xrPhysicsRuntime'
import {
  readXrNativeControllerCamera,
  selectXrNativeControllerCameraMode,
} from '@/features/three/xrNativeControllerCameraRuntime'
import type { XrNativeControllerCameraMode } from '@/features/three/xrNativeControllerCameraCatalog'
import type { WorkspaceFs } from '@/features/workspace-fs/types'

type PriorSurfaceCase = Readonly<{
  surface: Readonly<{
    canvasRenderMode: '2d' | '3d'
    canvas3dMode: '3d' | 'xr'
  }>
  canvasRenderModeLastFree: '2d' | '3d'
  canvasRenderModeIsAuto: boolean
  floatingPanelOpen: boolean
  floatingPanelView: 'motionControl' | 'animation' | 'camera'
  timelinePlaying: boolean
  timelinePosition: number
  timelinePlaybackRate: number
  physicsPhase: XrPhysicsRuntimePhase
  cameraMode: XrNativeControllerCameraMode
  geospatialModeEnabled: boolean
  openPanel: boolean
  graphToken: string
}>

const EMPTY_WORKSPACE = {
  readFileText: async () => null,
} as unknown as WorkspaceFs

const priorSurfaceArbitrary: fc.Arbitrary<PriorSurfaceCase> = fc.record({
  surface: fc.constantFrom(
    { canvasRenderMode: '2d' as const, canvas3dMode: '3d' as const },
    { canvasRenderMode: '3d' as const, canvas3dMode: '3d' as const },
    { canvasRenderMode: '3d' as const, canvas3dMode: 'xr' as const },
  ),
  canvasRenderModeLastFree: fc.constantFrom('2d' as const, '3d' as const),
  canvasRenderModeIsAuto: fc.boolean(),
  floatingPanelOpen: fc.boolean(),
  floatingPanelView: fc.constantFrom('motionControl' as const, 'animation' as const, 'camera' as const),
  timelinePlaying: fc.boolean(),
  timelinePosition: fc.integer({ min: 0, max: 3_600 }),
  timelinePlaybackRate: fc.constantFrom(0.5, 1, 1.5, 2),
  physicsPhase: fc.constantFrom<XrPhysicsRuntimePhase>('stopped', 'paused', 'playing'),
  cameraMode: fc.constantFrom<XrNativeControllerCameraMode>('fixed-follow', 'free-orbit'),
  geospatialModeEnabled: fc.boolean(),
  openPanel: fc.boolean(),
  graphToken: fc.string({ minLength: 1, maxLength: 16 }),
})

let fixtureRevision = 0

function configurePriorSurface(value: PriorSurfaceCase, scenario: string): void {
  resetFlightSimDecisionStoreForTests()
  resetFlightSimRuntimeForTests()
  useGraphStore.getState().resetAll()
  fixtureRevision += 1
  const sceneKey = `property-44:${scenario}:${fixtureRevision}`
  useGraphStore.setState({
    canvasRenderMode: value.surface.canvasRenderMode,
    canvas3dMode: value.surface.canvas3dMode,
    canvasRenderModeLastFree: value.canvasRenderModeLastFree,
    canvasRenderModeIsAuto: value.canvasRenderModeIsAuto,
    floatingPanelOpen: value.floatingPanelOpen,
    floatingPanelView: value.floatingPanelView,
    documentStructureBaselineLock: false,
    documentSemanticMode: 'document',
    graphData: {
      nodes: [{ id: `node:${value.graphToken}`, label: value.graphToken }],
      edges: [],
      metadata: { property44: value.graphToken },
    },
  } as never)
  useGraphStore.getState().setTimelineTransportState({
    documentKey: sceneKey,
    position: value.timelinePosition,
    playing: value.timelinePlaying,
    playbackRate: value.timelinePlaybackRate,
  })
  hydrateXrPhysicsRuntime({
    sceneKey,
    persistedValue: null,
    subjects: [{
      subjectId: `subject:${value.graphToken}`,
      position: [0, 1, 0],
      sizeMeters: [1, 1, 1],
    }],
  })
  if (value.physicsPhase !== 'stopped') playXrPhysicsRuntime()
  if (value.physicsPhase === 'paused') pauseXrPhysicsRuntime()
  selectXrNativeControllerCameraMode(value.cameraMode)
  writeGeospatialOverlayEnabledPreference(value.geospatialModeEnabled)
  setGympgrphGeospatialModeEnabled(value.geospatialModeEnabled)
}

function capturePriorSurface() {
  const state = useGraphStore.getState()
  const physics = readXrPhysicsRuntime()
  return {
    canvas: {
      canvasRenderMode: state.canvasRenderMode,
      canvas3dMode: state.canvas3dMode,
      canvasRenderModeLastFree: state.canvasRenderModeLastFree,
      canvasRenderModeIsAuto: state.canvasRenderModeIsAuto,
      floatingPanelOpen: state.floatingPanelOpen,
      floatingPanelView: state.floatingPanelView,
    },
    graph: JSON.stringify(state.graphData),
    timeline: {
      documentKey: state.timelineTransportDocumentKey,
      position: state.timelineTransportPosition,
      playing: state.timelineTransportPlaying,
      playbackRate: state.timelineTransportPlaybackRate,
    },
    controller: readXrNativeControllerCamera().mode,
    geospatial: {
      preference: readGeospatialOverlayEnabledPreference(),
      runtime: isGeospatialModeEnabled(),
    },
    physics: {
      phase: physics.phase,
      world: JSON.stringify(physics.world),
      frame: JSON.stringify(readXrPhysicsRuntimeFrame()),
    },
  }
}

function assertPriorSurfaceRestored(expected: ReturnType<typeof capturePriorSurface>): void {
  assert.deepEqual(capturePriorSurface(), expected)
}

function assertOneCanvas(document: Document): void {
  assert.equal(document.querySelectorAll('canvas').length, 1)
}

function stageFlightSourceSurfacePreset() {
  const previousCanvasSurface = captureFlightSimPreviousCanvasSurface()
  useGraphStore.setState({
    canvasRenderMode: '3d',
    canvas3dMode: 'xr',
    canvasRenderModeLastFree: '3d',
    canvasRenderModeIsAuto: false,
    floatingPanelOpen: true,
    floatingPanelView: 'flightSim',
  } as never)
  writeGeospatialOverlayEnabledPreference(true)
  setGympgrphGeospatialModeEnabled(true)
  return previousCanvasSurface
}

async function assertSuccessfulRoundTrip(
  value: PriorSurfaceCase,
  document: Document,
): Promise<void> {
  configurePriorSurface(value, 'success')
  const prior = capturePriorSurface()
  const previousCanvasSurface = stageFlightSourceSurfacePreset()
  const entered = await openFlightSimSurface({
    openPanel: value.openPanel,
    previousCanvasSurface,
    webglSupported: true,
    workspace: EMPTY_WORKSPACE,
  })
  assert.equal(entered.active, true, entered.runtimeError || 'Flight surface did not activate')
  assert.equal(entered.runtimeError, null)
  assert.equal(readFlightSimSurfaceOwnershipStatus().failure, null)
  assertOneCanvas(document)
  const exited = exitFlightSimSurface()
  await waitForFlightSimSurfaceRestoration()
  assert.equal(exited.active, false)
  assert.equal(exited.runtimeError, null)
  assertPriorSurfaceRestored(prior)
  assertOneCanvas(document)
}

async function assertEntryFailureIsAtomic(
  value: PriorSurfaceCase,
  document: Document,
): Promise<void> {
  configurePriorSurface(value, 'entry-failure')
  const prior = capturePriorSurface()
  const previousCanvasSurface = stageFlightSourceSurfacePreset()
  const failed = await openFlightSimSurface({
    openPanel: value.openPanel,
    previousCanvasSurface,
    webglSupported: false,
    workspace: EMPTY_WORKSPACE,
  })
  const failure = readFlightSimSurfaceOwnershipStatus().failure
  assert.equal(failed.active, false)
  assert.match(failed.runtimeError || '', /entry did not complete/i)
  assert.equal(failure?.code, FLIGHT_SIM_SURFACE_ENTRY_FAILURE_CODE)
  assert.equal(failure?.phase, 'entry')
  assertPriorSurfaceRestored(prior)
  assertOneCanvas(document)
}

async function assertExitRestorationFailureIsLocal(
  value: PriorSurfaceCase,
  document: Document,
): Promise<void> {
  configurePriorSurface(value, 'restoration-failure')
  const prior = capturePriorSurface()
  const previousCanvasSurface = stageFlightSourceSurfacePreset()
  const entered = await openFlightSimSurface({
    openPanel: value.openPanel,
    previousCanvasSurface,
    webglSupported: true,
    workspace: EMPTY_WORKSPACE,
  })
  assert.equal(entered.active, true)
  const suspended = capturePriorSurface()
  const originalSetCanvas3dMode = useGraphStore.getState().setCanvas3dMode
  useGraphStore.setState({
    setCanvas3dMode: () => {
      throw new Error(`property-44 restoration ${value.graphToken}`)
    },
  } as never)
  try {
    const failed = exitFlightSimSurface()
    const failure = readFlightSimSurfaceOwnershipStatus().failure
    assert.equal(failed.active, false)
    assert.match(failed.runtimeError || '', /restoration did not complete/i)
    assert.equal(failure?.code, FLIGHT_SIM_SURFACE_RESTORATION_FAILURE_CODE)
    assert.equal(failure?.phase, 'restoration')
    assert.match(failure?.message || '', /property-44 restoration/)
    assert.equal(JSON.stringify(useGraphStore.getState().graphData), prior.graph)
    assert.equal(readXrNativeControllerCamera().mode, prior.controller)
    assert.deepEqual(capturePriorSurface().timeline, suspended.timeline)
    assert.deepEqual(capturePriorSurface().physics, suspended.physics)
    assertOneCanvas(document)
  } finally {
    useGraphStore.setState({ setCanvas3dMode: originalSetCanvas3dMode } as never)
  }
}

// Feature: knowgrph-game-flight-sim, Property 39 - Canvas ownership preserved across enter/exit and failures
test('Feature: knowgrph-game-flight-sim, Property 39 - Canvas ownership preserved across enter/exit and failures', async () => {
  const dom = new JSDOM(
    '<!doctype html><html><body><canvas id="shared-xr-canvas"></canvas></body></html>',
    { url: 'http://127.0.0.1/' },
  )
  const previousGlobals = {
    window: globalThis.window,
    document: globalThis.document,
    Event: globalThis.Event,
    CustomEvent: globalThis.CustomEvent,
    localStorage: globalThis.localStorage,
  }
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    localStorage: dom.window.localStorage,
  })
  try {
    await fc.assert(
      fc.asyncProperty(priorSurfaceArbitrary, async prior => {
        try {
          await assertSuccessfulRoundTrip(prior, dom.window.document)
          await assertEntryFailureIsAtomic(prior, dom.window.document)
          await assertExitRestorationFailureIsLocal(prior, dom.window.document)
          assert.equal(readFlightSimSnapshot().active, false)
        } finally {
          resetFlightSimDecisionStoreForTests()
          resetFlightSimRuntimeForTests()
          stopXrPhysicsRuntime()
          writeGeospatialOverlayEnabledPreference(false)
          setGympgrphGeospatialModeEnabled(false)
          useGraphStore.getState().resetAll()
        }
      }),
      flightSimPropertyParameters(39),
    )
  } finally {
    Object.assign(globalThis, previousGlobals)
    dom.window.close()
  }
})
