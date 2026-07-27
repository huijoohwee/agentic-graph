import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  resolveCanvasSurfaceOwnership,
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
import { selectFlightSimGeoEnvironment } from '@/features/game-flight-sim/FlightSimEnvironmentGeoButton'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

type RendererTransitionPhase = ThreeRendererMountInput & Readonly<{
  name: 'physics' | 'document-transition' | 'flight'
  documentSwitchOwnsViewport: boolean
  sourceFilesBootstrapReady: boolean
}>

const XR_RENDERER_TRANSITION: readonly RendererTransitionPhase[] = [
  {
    name: 'physics',
    mode: 'xr',
    hasRenderableScene: true,
    webglSupported: true,
    documentSwitchOwnsViewport: false,
    sourceFilesBootstrapReady: true,
  },
  {
    name: 'document-transition',
    mode: 'xr',
    hasRenderableScene: false,
    webglSupported: true,
    documentSwitchOwnsViewport: true,
    sourceFilesBootstrapReady: false,
  },
  {
    name: 'flight',
    mode: 'xr',
    hasRenderableScene: true,
    webglSupported: true,
    documentSwitchOwnsViewport: false,
    sourceFilesBootstrapReady: true,
  },
]

function RendererBoundary(props: { phase: RendererTransitionPhase }): React.ReactNode {
  const sourceAdmissionRef = React.useRef(false)
  sourceAdmissionRef.current = retainThreeCanvasSourceAdmission(
    sourceAdmissionRef.current,
    props.phase.sourceFilesBootstrapReady,
  )
  const surface = resolveThreeCanvasSurfaceLifecycle({
    sourceFilesBootstrapAdmitted: sourceAdmissionRef.current,
    sourceFilesBootstrapReady: props.phase.sourceFilesBootstrapReady,
    geospatialOverlayOwnsViewport: false,
    liveCanvasHeroVisible: false,
    canvasRenderMode: '3d',
    heavyRuntimeIntentBlocked: false,
    activeSurface: '3d',
    documentSwitchOwnsViewport: props.phase.documentSwitchOwnsViewport,
  })
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

test('Flight Sim keeps one XR renderer through the document transition', async () => {
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
        phase.documentSwitchOwnsViewport ? '0' : '1',
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

test('Flight Sim overlays Geo without mounting a competing XR viewport', () => {
  const ownership = resolveCanvasSurfaceOwnership({
    canvasRenderMode: '3d',
    flightSimActive: true,
    gameplayOverlayActive: true,
    geospatialModeEnabled: true,
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
    flightSimActive: false,
    gameplayOverlayActive: true,
    geospatialModeEnabled: true,
    workspaceEditorOverlayOpen: false,
    workspaceStoryboardSurfaceActive: false,
  }), {
    activeSurface: '3d',
    geospatialOverlayOwnsViewport: false,
  })

  assert.deepEqual(resolveCanvasSurfaceOwnership({
    canvasRenderMode: '3d',
    flightSimActive: false,
    gameplayOverlayActive: false,
    geospatialModeEnabled: true,
    workspaceEditorOverlayOpen: true,
    workspaceStoryboardSurfaceActive: true,
  }), {
    activeSurface: 'geo',
    geospatialOverlayOwnsViewport: false,
  })
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

test('Flight environment handoff selects the local Geo renderer before routing', () => {
  const order: string[] = []
  const result = selectFlightSimGeoEnvironment(
    'singapore',
    true,
    stageId => {
      order.push(`stage:${stageId}`)
      return { ok: true }
    },
    () => order.push('geo:2d-svg'),
  )
  assert.deepEqual(result, { ok: true })
  assert.deepEqual(order, ['stage:singapore', 'geo:2d-svg'])

  const blocked = selectFlightSimGeoEnvironment(
    'street-grid',
    true,
    () => ({ ok: false }),
    () => order.push('forbidden'),
  )
  assert.deepEqual(blocked, { ok: false })
  assert.equal(order.includes('forbidden'), false)
})
