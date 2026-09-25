import type { Canvas3dModeId } from '@/lib/config.render'

export type ThreeCanvasSurfaceMountInput = Readonly<{
  sourceFilesBootstrapAdmitted: boolean
  rendererPreviouslyMounted: boolean
  geospatialOverlayOwnsViewport: boolean
  liveCanvasHeroVisible: boolean
  canvasRenderMode: '2d' | '3d'
  heavyRuntimeIntentBlocked: boolean
}>

export type ThreeRendererMountInput = Readonly<{
  mode: Canvas3dModeId
  hasRenderableScene: boolean
  webglSupported: boolean | null
}>

export type ThreeCanvasSurfaceLifecycleInput = ThreeCanvasSurfaceMountInput & Readonly<{
  sourceFilesBootstrapReady: boolean
  activeSurface: '2d' | '3d' | 'geo' | 'geo-xr'
  documentSwitchOwnsViewport: boolean
}>

export function shouldMountThreeCanvasSurface(input: ThreeCanvasSurfaceMountInput): boolean {
  return input.sourceFilesBootstrapAdmitted
    && (!input.geospatialOverlayOwnsViewport || input.rendererPreviouslyMounted)
    && !input.liveCanvasHeroVisible
    && input.canvasRenderMode === '3d'
    && !input.heavyRuntimeIntentBlocked
}

export function shouldActivateThreeCanvasSurface(input: Readonly<{
  surfaceMounted: boolean
  sourceFilesBootstrapReady: boolean
  geospatialOverlayOwnsViewport: boolean
  activeSurface: '2d' | '3d' | 'geo' | 'geo-xr'
  documentSwitchOwnsViewport: boolean
}>): boolean {
  return input.surfaceMounted
    && input.sourceFilesBootstrapReady
    && !input.geospatialOverlayOwnsViewport
    && (input.activeSurface === '3d' || input.activeSurface === 'geo-xr')
    && !input.documentSwitchOwnsViewport
}

export function resolveThreeCanvasSurfaceLifecycle(input: ThreeCanvasSurfaceLifecycleInput): Readonly<{
  mounted: boolean
  active: boolean
}> {
  const mounted = shouldMountThreeCanvasSurface(input)
  return {
    mounted,
    active: shouldActivateThreeCanvasSurface({
      surfaceMounted: mounted,
      sourceFilesBootstrapReady: input.sourceFilesBootstrapReady,
      geospatialOverlayOwnsViewport: input.geospatialOverlayOwnsViewport,
      activeSurface: input.activeSurface,
      documentSwitchOwnsViewport: input.documentSwitchOwnsViewport,
    }),
  }
}

export function retainThreeCanvasSourceAdmission(previouslyAdmitted: boolean, sourceFilesBootstrapReady: boolean): boolean {
  return previouslyAdmitted || sourceFilesBootstrapReady
}

export function shouldMountThreeRenderer(input: ThreeRendererMountInput): boolean {
  if (input.webglSupported === false) return false
  return input.mode === 'xr' || input.hasRenderableScene
}

export function resolveThreeRendererLifecycleKey(mode: Canvas3dModeId): string {
  return `scene-canvas-${mode}`
}

/** Static inspection should not trade pixel detail for an idle animation frame rate. */
export function resolveThreeSceneFrameLoop(input: Readonly<{
  paused: boolean; immersiveMedia: boolean; gameplay: boolean; savedObjectView: boolean
}>): 'demand' | 'always' {
  return !input.immersiveMedia && (input.paused || (input.savedObjectView && !input.gameplay)) ? 'demand' : 'always'
}

/** Pixel work follows sustained frame pressure; simulation and authored state remain untouched. */
export function createThreeFrameResolutionBudget() {
  let elapsed = 0, frames = 0, fastWindows = 0, ceiling = 0
  let target: number | null = null
  const reset = () => { elapsed = 0; frames = 0; fastWindows = 0; target = null; ceiling = 0 }
  return {
    sample(delta: number, current: number, maximum: number, eligible: boolean): number | null {
      if (!eligible || !Number.isFinite(delta) || delta <= 0 || delta > 1
        || !Number.isFinite(current) || current <= 0 || !Number.isFinite(maximum) || maximum <= 0) {
        reset()
        return null
      }
      if (maximum !== ceiling) { reset(); ceiling = maximum }
      target ??= Math.min(current, maximum)
      elapsed += delta
      frames += 1
      if (elapsed >= 1 && frames >= 8) {
        const average = elapsed / frames
        if (average > 1 / 30) {
          target = Math.max(Math.min(0.5, maximum), Math.floor(target * 3) / 4)
          fastWindows = 0
        } else if (average < 0.018) {
          if (++fastWindows >= 10) { target = Math.min(maximum, target + 0.25); fastWindows = 0 }
        } else fastWindows = 0
        elapsed = 0
        frames = 0
      }
      // Canvas reconfiguration may restore its default DPR. Retain this renderer's budget.
      return target === current ? null : target
    },
  }
}
