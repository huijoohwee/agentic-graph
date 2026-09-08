import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { shouldMountThreeCanvasSurface } from '@/lib/three/threeRendererLifecycle'
import { resolveCanvasViewportHeavyRuntimeIntentSurface } from '@/components/canvasViewportHeavyRuntimeIntent'

export function testCanvasViewportHeavyRuntimeIntentSurfaceResolution() {
  if (resolveCanvasViewportHeavyRuntimeIntentSurface({
    isTouchViewport: false,
    geospatialOverlayOwnsViewport: true,
    canvasRenderMode: '3d',
  }) !== null) {
    throw new Error('expected desktop viewports to skip heavy-runtime intent gating')
  }

  if (resolveCanvasViewportHeavyRuntimeIntentSurface({
    isTouchViewport: true,
    geospatialOverlayOwnsViewport: false,
    canvasRenderMode: '3d',
  }) !== '3d') {
    throw new Error('expected touch 3D surfaces to require explicit intent')
  }

  if (resolveCanvasViewportHeavyRuntimeIntentSurface({
    isTouchViewport: true,
    geospatialOverlayOwnsViewport: true,
    canvasRenderMode: '3d',
  }) !== 'geo') {
    throw new Error('expected geospatial viewport ownership to take priority over 3D gating on touch devices')
  }
}

export function testCanvasViewportSourceWiresHeavyRuntimeIntentGate() {
  for (const blocked of [true, false]) {
    const mounted = shouldMountThreeCanvasSurface({ sourceFilesBootstrapAdmitted: true,
      rendererPreviouslyMounted: false, geospatialOverlayOwnsViewport: false,
      liveCanvasHeroVisible: false, canvasRenderMode: '3d', heavyRuntimeIntentBlocked: blocked })
    if (mounted === blocked) throw new Error('expected the shared 3D lifecycle to enforce mobile runtime intent')
  }
  const text = readFileSync(resolve(process.cwd(), 'src/components/CanvasViewport.tsx'), 'utf8')
  for (const snippet of [
    "useMediaQuery('(max-width: 768px), (pointer: coarse)')",
    'resolveCanvasViewportHeavyRuntimeIntentSurface({',
    'data-kg-canvas-heavy-runtime-intent=',
    'data-kg-canvas-heavy-runtime-intent-activate=',
    'resolveThreeCanvasSurfaceLifecycle({',
    'heavyRuntimeIntentBlocked, activeSurface, documentSwitchOwnsViewport,',
    'geospatialCompositionEnabled && !heavyRuntimeIntentBlocked',
  ]) {
    if (!text.includes(snippet)) {
      throw new Error(`expected CanvasViewport to gate heavy mobile runtimes behind explicit intent: ${snippet}`)
    }
  }
}
