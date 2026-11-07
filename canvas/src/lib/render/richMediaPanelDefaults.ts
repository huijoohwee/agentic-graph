import { WIDGET_BASE_SIZE } from '@/lib/canvas/overlayWidgetZoom'
import { computeMediaPanelCssVars3d } from '@/lib/render/mediaPanelLayout'

// Shared 16:9 preview baseline: 360 px is close to the compact FloatingPanel width.
export const RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX = WIDGET_BASE_SIZE.width
export const RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX = WIDGET_BASE_SIZE.height
export const RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE = Object.freeze({
  width: RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
  height: RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX,
})
export const RICH_MEDIA_PANEL_DEFAULT_CSS_VARS = Object.freeze(
  computeMediaPanelCssVars3d({ density: 'default', sizeScale: 1 }).vars,
)
