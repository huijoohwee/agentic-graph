export type CanvasViewportHeavyRuntimeSurface = '3d' | 'geo'

export const CANVAS_VIEWPORT_HEAVY_RUNTIME_INTENT_COPY = {
  '3d': {
    eyebrow: '3D runtime',
    title: 'Load 3D canvas on this device',
    body: '3D stays opt-in on touch viewports so the mobile shell remains lighter until you explicitly open it.',
    action: 'Load 3D view',
  },
  geo: {
    eyebrow: 'Map runtime',
    title: 'Load geospatial canvas on this device',
    body: 'Map rendering stays opt-in on touch viewports so the mobile shell avoids the heavier geospatial runtime until you ask for it.',
    action: 'Load map view',
  },
} as const

export function resolveCanvasViewportHeavyRuntimeIntentSurface(args: {
  isTouchViewport: boolean
  geospatialOverlayOwnsViewport: boolean
  canvasRenderMode: '2d' | '3d'
}): CanvasViewportHeavyRuntimeSurface | null {
  if (!args.isTouchViewport) return null
  if (args.geospatialOverlayOwnsViewport) return 'geo'
  if (args.canvasRenderMode === '3d') return '3d'
  return null
}
