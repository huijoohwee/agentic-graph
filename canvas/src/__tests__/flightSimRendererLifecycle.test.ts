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

test('Flight Sim takes shared XR viewport ownership from Geo without clearing Geo mode', () => {
  const ownership = resolveCanvasSurfaceOwnership({
    canvasRenderMode: '3d',
    gameplayOverlayActive: true,
    geospatialModeEnabled: true,
    workspaceEditorOverlayOpen: false,
    workspaceStoryboardSurfaceActive: false,
  })
  assert.deepEqual(ownership, {
    activeSurface: '3d',
    geospatialOverlayOwnsViewport: false,
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
  assert.deepEqual(surface, { mounted: true, active: true })

  assert.deepEqual(resolveCanvasSurfaceOwnership({
    canvasRenderMode: '3d',
    gameplayOverlayActive: false,
    geospatialModeEnabled: true,
    workspaceEditorOverlayOpen: false,
    workspaceStoryboardSurfaceActive: false,
  }), {
    activeSurface: 'geo',
    geospatialOverlayOwnsViewport: true,
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
