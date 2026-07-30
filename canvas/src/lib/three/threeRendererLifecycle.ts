import type { Canvas3dModeId } from '@/lib/config.render'

export type ThreeCanvasSurfaceMountInput = Readonly<{
  sourceFilesBootstrapAdmitted: boolean
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

export type CanvasSurfaceOwnershipInput = Readonly<{
  canvasRenderMode: '2d' | '3d'
  citySimActive: boolean
  flightSimActive: boolean
  gameplayOverlayActive: boolean
  geospatialModeEnabled: boolean
  geospatialXrModeEnabled: boolean
  workspaceEditorOverlayOpen: boolean
  workspaceStoryboardSurfaceActive: boolean
}>

export function resolveCanvasSurfaceOwnership(
  input: CanvasSurfaceOwnershipInput,
): Readonly<{
  activeSurface: '2d' | '3d' | 'geo' | 'geo-xr'
  geospatialOverlayOwnsViewport: boolean
}> {
  // City owns the shared XR canvas exclusively.  A retained Geo+XR preference
  // must never leave MapLibre mounted beneath the orthographic City stage.
  if (input.citySimActive) {
    return {
      activeSurface: '3d',
      geospatialOverlayOwnsViewport: false,
    }
  }
  if (input.geospatialModeEnabled && input.geospatialXrModeEnabled) {
    return {
      activeSurface: 'geo-xr',
      geospatialOverlayOwnsViewport: false,
    }
  }
  const flightSimGeoOverlayActive = input.gameplayOverlayActive
    && input.flightSimActive
    && input.geospatialModeEnabled
  if (flightSimGeoOverlayActive) {
    return {
      activeSurface: 'geo',
      geospatialOverlayOwnsViewport: true,
    }
  }
  if (input.gameplayOverlayActive) {
    return {
      activeSurface: '3d',
      geospatialOverlayOwnsViewport: false,
    }
  }
  return {
    activeSurface: input.geospatialModeEnabled
      ? 'geo'
      : input.canvasRenderMode === '3d'
        ? '3d'
        : '2d',
    geospatialOverlayOwnsViewport: input.geospatialModeEnabled
      && !(input.workspaceEditorOverlayOpen && input.workspaceStoryboardSurfaceActive),
  }
}

export function shouldMountThreeCanvasSurface(input: ThreeCanvasSurfaceMountInput): boolean {
  return input.sourceFilesBootstrapAdmitted
    && !input.geospatialOverlayOwnsViewport
    && !input.liveCanvasHeroVisible
    && input.canvasRenderMode === '3d'
    && !input.heavyRuntimeIntentBlocked
}

export function shouldActivateThreeCanvasSurface(input: Readonly<{
  surfaceMounted: boolean
  sourceFilesBootstrapReady: boolean
  activeSurface: '2d' | '3d' | 'geo' | 'geo-xr'
  documentSwitchOwnsViewport: boolean
}>): boolean {
  return input.surfaceMounted
    && input.sourceFilesBootstrapReady
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
