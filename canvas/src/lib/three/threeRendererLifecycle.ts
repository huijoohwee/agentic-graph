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
