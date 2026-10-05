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
  paused: boolean; immersiveMedia: boolean; gameplay: boolean; savedObjectView: boolean; learningScene?: boolean
}>): 'demand' | 'always' {
  // Lesson snapshots invalidate their poses; Fiber owns the independent WebXR session loop.
  if (input.learningScene) return 'demand'
  return !input.immersiveMedia && (input.paused || (input.savedObjectView && !input.gameplay)) ? 'demand' : 'always'
}

export function shouldAdaptThreeFrameResolution(input: Readonly<{
  presenting: boolean; frameLoop: 'always' | 'demand' | 'never'; recording: boolean; visible: boolean
}>): boolean {
  return !input.presenting && input.frameLoop === 'always' && !input.recording && input.visible
}

/** Pixel work follows sustained frame pressure; simulation and authored state remain untouched. */
export function createThreeFrameResolutionBudget() {
  let elapsed = 0, frames = 0, fastWindows = 0, ceiling = 0, slowFrames = 0
  let target: number | null = null
  const reset = () => { elapsed = 0; frames = 0; fastWindows = 0; target = null; ceiling = 0; slowFrames = 0 }
  const reduce = () => {
    if (target !== null) target = Math.min(target, Math.max(Math.min(0.5, ceiling), Math.floor(target * 3) / 4))
    fastWindows = 0
  }
  return {
    reset,
    sample(delta: number, current: number, maximum: number, eligible: boolean): number | null {
      if (!eligible || !Number.isFinite(delta) || delta <= 0
        || !Number.isFinite(current) || current <= 0 || !Number.isFinite(maximum) || maximum <= 0) {
        reset()
        return null
      }
      if (maximum !== ceiling) { reset(); ceiling = maximum }
      target ??= Math.min(current, maximum)
      if (delta > 0.1) {
        // One slow frame is transient; two consecutive >100ms frames show sustained pixel pressure.
        elapsed = 0; frames = 0; fastWindows = 0
        if (++slowFrames >= 2) { reduce(); slowFrames = 0 }
        return target === current ? null : target
      }
      slowFrames = 0
      elapsed += delta
      frames += 1
      if (elapsed >= 1 && frames >= 8) {
        const average = elapsed / frames
        if (average > 1 / 30) {
          reduce()
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
