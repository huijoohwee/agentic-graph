import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { resolveCanvasSurfaceOwnership } from '@/lib/canvas/canvasSurfaceOwnershipRuntime'
import {
  createThreeFrameResolutionBudget,
  resolveThreeRendererLifecycleKey,
  resolveThreeCanvasSurfaceLifecycle,
  shouldMountThreeRenderer,
  retainThreeCanvasSourceAdmission,
  type ThreeRendererMountInput,
} from '@/lib/three/threeRendererLifecycle'
import {
  resolveCanvasGeospatialModeEnabled,
  shouldEnsureCanvasGeospatialMode,
} from '@/features/canvas/useCanvasGeospatialRuntime'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

type RendererTransitionPhase = ThreeRendererMountInput & Readonly<{
  name: 'physics' | 'document-transition' | 'city' | 'flight'
  activeSurface: '3d' | 'geo-xr'
  documentSwitchOwnsViewport: boolean
  geospatialOverlayOwnsViewport: boolean
  sourceFilesBootstrapReady: boolean
}>

const XR_RENDERER_TRANSITION: readonly RendererTransitionPhase[] = [
  {
    name: 'physics',
    activeSurface: '3d',
    mode: 'xr',
    hasRenderableScene: true,
    webglSupported: true,
    documentSwitchOwnsViewport: false,
    geospatialOverlayOwnsViewport: false,
    sourceFilesBootstrapReady: true,
  },
  {
    name: 'document-transition',
    activeSurface: '3d',
    mode: 'xr',
    hasRenderableScene: false,
    webglSupported: true,
    documentSwitchOwnsViewport: true,
    geospatialOverlayOwnsViewport: false,
    sourceFilesBootstrapReady: false,
  },
  {
    name: 'city',
    activeSurface: 'geo-xr',
    mode: 'xr',
    hasRenderableScene: false,
    webglSupported: true,
    documentSwitchOwnsViewport: false,
    geospatialOverlayOwnsViewport: true,
    sourceFilesBootstrapReady: true,
  },
  {
    name: 'flight',
    activeSurface: 'geo-xr',
    mode: 'xr',
    hasRenderableScene: true,
    webglSupported: true,
    documentSwitchOwnsViewport: false,
    geospatialOverlayOwnsViewport: false,
    sourceFilesBootstrapReady: true,
  },
]

function RendererBoundary(props: { phase: RendererTransitionPhase }): React.ReactNode {
  const sourceAdmissionRef = React.useRef(false)
  const surfaceMountedRef = React.useRef(false)
  sourceAdmissionRef.current = retainThreeCanvasSourceAdmission(
    sourceAdmissionRef.current,
    props.phase.sourceFilesBootstrapReady,
  )
  const surface = resolveThreeCanvasSurfaceLifecycle({
    sourceFilesBootstrapAdmitted: sourceAdmissionRef.current,
    sourceFilesBootstrapReady: props.phase.sourceFilesBootstrapReady,
    rendererPreviouslyMounted: surfaceMountedRef.current,
    geospatialOverlayOwnsViewport: props.phase.geospatialOverlayOwnsViewport,
    liveCanvasHeroVisible: false,
    canvasRenderMode: '3d',
    heavyRuntimeIntentBlocked: false,
    activeSurface: props.phase.activeSurface,
    documentSwitchOwnsViewport: props.phase.documentSwitchOwnsViewport,
  })
  surfaceMountedRef.current = surface.mounted
  if (!surface.mounted || !shouldMountThreeRenderer(props.phase)) {
    return React.createElement('section', {
      'data-renderer-phase': props.phase.name,
      'data-renderer-status': 'unmounted',
    })
  }
  return React.createElement('canvas', {
    key: resolveThreeRendererLifecycleKey(props.phase.mode),
    'data-renderer-phase': props.phase.name,
    'data-renderer-active': surface.active ? '1' : '0',
  })
}

test('Flight Sim keeps one XR renderer through Flight to City to Flight', async () => {
  const harness = initJsdomHarness('<!doctype html><html><body><main id="root"></main></body></html>')
  const container = harness.dom.window.document.getElementById('root')
  if (!container) throw new Error('missing renderer lifecycle test root')
  const root = createRoot(container)

  try {
    let renderer: Element | null = null
    for (const phase of XR_RENDERER_TRANSITION) {
      await act(async () => {
        root.render(React.createElement(RendererBoundary, { phase }))
      })
      const currentRenderer = container.querySelector('canvas')
      assert.ok(currentRenderer, `expected the XR renderer to remain mounted during ${phase.name}`)
      if (renderer) assert.strictEqual(currentRenderer, renderer)
      assert.equal(
        currentRenderer.getAttribute('data-renderer-active'),
        phase.documentSwitchOwnsViewport || phase.geospatialOverlayOwnsViewport ? '0' : '1',
      )
      renderer = currentRenderer
    }
  } finally {
    await act(async () => {
      root.unmount()
    })
    harness.restore()
  }
})

test('an open Geo panel synchronizes the canvas Geo owner', () => {
  assert.equal(shouldEnsureCanvasGeospatialMode(true, 'geo'), true)
  assert.equal(shouldEnsureCanvasGeospatialMode(false, 'geo'), false)
  assert.equal(shouldEnsureCanvasGeospatialMode(true, 'media'), false)
  assert.equal(resolveCanvasGeospatialModeEnabled(false, true, 'geo'), true)
  assert.equal(resolveCanvasGeospatialModeEnabled(false, false, 'geo'), false)
  assert.equal(resolveCanvasGeospatialModeEnabled(false, true, 'media'), false)
  assert.equal(resolveCanvasGeospatialModeEnabled(true, false, 'media'), true)
})

test('Flight Sim keeps exclusive Geo available without mounting a competing XR viewport', () => {
  const ownership = resolveCanvasSurfaceOwnership({
    canvasRenderMode: '3d',
    cityMapLibreSurfaceRequested: false,
    flightSimActive: true,
    gameplayOverlayActive: true,
    geospatialModeEnabled: true,
    geospatialXrModeEnabled: false,
    workspaceEditorOverlayOpen: true,
    workspaceStoryboardSurfaceActive: true,
  })
  assert.deepEqual(ownership, {
    activeSurface: 'geo',
    geospatialOverlayOwnsViewport: true,
  })

  const surface = resolveThreeCanvasSurfaceLifecycle({
    sourceFilesBootstrapAdmitted: true,
    sourceFilesBootstrapReady: true,
    rendererPreviouslyMounted: false,
    geospatialOverlayOwnsViewport: ownership.geospatialOverlayOwnsViewport,
    liveCanvasHeroVisible: false,
    canvasRenderMode: '3d',
    heavyRuntimeIntentBlocked: false,
    activeSurface: ownership.activeSurface,
    documentSwitchOwnsViewport: false,
  })
  assert.deepEqual(surface, { mounted: false, active: false })

  assert.deepEqual(resolveCanvasSurfaceOwnership({
    canvasRenderMode: '3d',
    cityMapLibreSurfaceRequested: false,
    flightSimActive: false,
    gameplayOverlayActive: true,
    geospatialModeEnabled: true,
    geospatialXrModeEnabled: false,
    workspaceEditorOverlayOpen: false,
    workspaceStoryboardSurfaceActive: false,
  }), {
    activeSurface: '3d',
    geospatialOverlayOwnsViewport: false,
  })

  assert.deepEqual(resolveCanvasSurfaceOwnership({
    canvasRenderMode: '3d',
    cityMapLibreSurfaceRequested: false,
    flightSimActive: false,
    gameplayOverlayActive: false,
    geospatialModeEnabled: true,
    geospatialXrModeEnabled: false,
    workspaceEditorOverlayOpen: true,
    workspaceStoryboardSurfaceActive: true,
  }), {
    activeSurface: 'geo',
    geospatialOverlayOwnsViewport: false,
  })
})

test('Geo+XR mounts one transparent shared XR viewport over the Geo owner', () => {
  const ownership = resolveCanvasSurfaceOwnership({
    canvasRenderMode: '3d',
    cityMapLibreSurfaceRequested: false,
    flightSimActive: true,
    gameplayOverlayActive: true,
    geospatialModeEnabled: true,
    geospatialXrModeEnabled: true,
    workspaceEditorOverlayOpen: false,
    workspaceStoryboardSurfaceActive: false,
  })
  assert.deepEqual(ownership, {
    activeSurface: 'geo-xr',
    geospatialOverlayOwnsViewport: false,
  })
  assert.deepEqual(resolveThreeCanvasSurfaceLifecycle({
    sourceFilesBootstrapAdmitted: true,
    sourceFilesBootstrapReady: true,
    rendererPreviouslyMounted: false,
    geospatialOverlayOwnsViewport: ownership.geospatialOverlayOwnsViewport,
    liveCanvasHeroVisible: false,
    canvasRenderMode: '3d',
    heavyRuntimeIntentBlocked: false,
    activeSurface: ownership.activeSurface,
    documentSwitchOwnsViewport: false,
  }), { mounted: true, active: true })
})

test('City intent fails closed to MapLibre before Geo+XR commits', () => {
  const ownership = resolveCanvasSurfaceOwnership({
    canvasRenderMode: '3d',
    cityMapLibreSurfaceRequested: true,
    flightSimActive: false,
    gameplayOverlayActive: true,
    geospatialModeEnabled: false,
    geospatialXrModeEnabled: false,
    workspaceEditorOverlayOpen: false,
    workspaceStoryboardSurfaceActive: false,
  })
  assert.deepEqual(ownership, {
    activeSurface: 'geo-xr',
    geospatialOverlayOwnsViewport: true,
  })
  assert.deepEqual(resolveThreeCanvasSurfaceLifecycle({
    sourceFilesBootstrapAdmitted: true,
    sourceFilesBootstrapReady: true,
    rendererPreviouslyMounted: false,
    geospatialOverlayOwnsViewport: ownership.geospatialOverlayOwnsViewport,
    liveCanvasHeroVisible: false,
    canvasRenderMode: '3d',
    heavyRuntimeIntentBlocked: false,
    activeSurface: ownership.activeSurface,
    documentSwitchOwnsViewport: false,
  }), { mounted: false, active: false })

  assert.deepEqual(resolveThreeCanvasSurfaceLifecycle({
    sourceFilesBootstrapAdmitted: true,
    sourceFilesBootstrapReady: true,
    rendererPreviouslyMounted: true,
    geospatialOverlayOwnsViewport: ownership.geospatialOverlayOwnsViewport,
    liveCanvasHeroVisible: false,
    canvasRenderMode: '3d',
    heavyRuntimeIntentBlocked: false,
    activeSurface: ownership.activeSurface,
    documentSwitchOwnsViewport: false,
  }), { mounted: true, active: false })

  assert.deepEqual(resolveCanvasSurfaceOwnership({
    canvasRenderMode: '3d',
    cityMapLibreSurfaceRequested: false,
    flightSimActive: false,
    gameplayOverlayActive: false,
    geospatialModeEnabled: false,
    geospatialXrModeEnabled: false,
    workspaceEditorOverlayOpen: false,
    workspaceStoryboardSurfaceActive: false,
  }), {
    activeSurface: '3d',
    geospatialOverlayOwnsViewport: false,
  }, 'an acknowledged City exit must restore the prior non-Geo surface')
})

test('a deliberate canvas departure clears retained Three ownership', () => {
  assert.deepEqual(resolveThreeCanvasSurfaceLifecycle({
    sourceFilesBootstrapAdmitted: true,
    sourceFilesBootstrapReady: true,
    rendererPreviouslyMounted: true,
    geospatialOverlayOwnsViewport: false,
    liveCanvasHeroVisible: false,
    canvasRenderMode: '2d',
    heavyRuntimeIntentBlocked: false,
    activeSurface: '2d',
    documentSwitchOwnsViewport: false,
  }), { mounted: false, active: false })

  assert.deepEqual(resolveThreeCanvasSurfaceLifecycle({
    sourceFilesBootstrapAdmitted: true,
    sourceFilesBootstrapReady: true,
    rendererPreviouslyMounted: false,
    geospatialOverlayOwnsViewport: true,
    liveCanvasHeroVisible: false,
    canvasRenderMode: '3d',
    heavyRuntimeIntentBlocked: false,
    activeSurface: 'geo-xr',
    documentSwitchOwnsViewport: false,
  }), { mounted: false, active: false })
})

test('Three renderer lifecycle still rejects unsupported and empty non-XR surfaces', () => {
  assert.equal(shouldMountThreeRenderer({
    mode: 'xr',
    hasRenderableScene: true,
    webglSupported: false,
  }), false)
  assert.equal(shouldMountThreeRenderer({
    mode: '3d',
    hasRenderableScene: false,
    webglSupported: true,
  }), false)
})


test('XR resolution keeps fast frames and isolated stalls at the requested quality', () => {
  const budget = createThreeFrameResolutionBudget()
  assert.equal(budget.sample(0.25, 2, 2, true), null)
  for (let frame = 0; frame < 600; frame += 1) {
    assert.equal(budget.sample(1 / 60, 2, 2, true), null)
  }
})

test('XR resolution bounds sustained pixel work and recovers only after sustained headroom', () => {
  const budget = createThreeFrameResolutionBudget()
  let ratio = 1
  const changes: number[] = []
  const sample = (seconds: number) => {
    const next = budget.sample(seconds, ratio, 1, true)
    if (next !== null) { ratio = next; changes.push(next) }
  }
  for (let frame = 0; frame < 100; frame += 1) sample(0.08)
  assert.deepEqual(changes, [0.75, 0.5])
  assert.equal(budget.sample(1 / 60, 1, 1, true), 0.5, 'parent renders retain the admitted pixel budget')
  for (let frame = 0; frame < 500; frame += 1) sample(0.02)
  assert.equal(ratio, 0.5, 'marginal performance must not oscillate quality')
  for (let frame = 0; frame < 2_000; frame += 1) sample(1 / 60)
  assert.equal(ratio, 1)
  assert.deepEqual(changes, [0.75, 0.5, 0.75, 1])
})

test('XR resolution excludes paused, hidden and immersive frames and resets across renderer changes', () => {
  const budget = createThreeFrameResolutionBudget()
  for (let frame = 0; frame < 7; frame += 1) assert.equal(budget.sample(0.2, 1, 1, true), null)
  assert.equal(budget.sample(0.2, 1, 1, false), null)
  assert.equal(budget.sample(0.2, 1, 1, true), null, 'ineligible frames reset the measurement window')
  for (const delta of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 2]) {
    assert.equal(budget.sample(delta, 1, 1, true), null)
  }
  for (let frame = 0; frame < 8; frame += 1) budget.sample(0.2, 1, 1, true)
  assert.equal(budget.sample(1 / 60, 2, 2, true), null, 'new resolution limits start a fresh window')
  const low = createThreeFrameResolutionBudget()
  for (let frame = 0; frame < 20; frame += 1) assert.equal(low.sample(0.2, 0.25, 0.25, true), null)
})
