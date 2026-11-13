import sharedUiPin from '@/styles/shared-ui-profile.pin.json'

export const FLOATING_PANEL_CANVAS_INSET_PX = 8
export const FLOATING_PANEL_CANVAS_RIGHT_INSET_CSS = 'calc(var(--kg-safe-right) + var(--kg-canvas-viewport-edge-gap))'
export const FLOATING_PANEL_CANVAS_INLINE_CLEARANCE_CSS = 'calc(var(--kg-safe-left) + var(--kg-safe-right) + var(--kg-canvas-viewport-edge-gap) + var(--kg-canvas-viewport-edge-gap))'
export const FLOATING_PANEL_DEFAULT_WIDTH_RATIO = 0.3
export const FLOATING_PANEL_DEFAULT_WIDTH_PX = sharedUiPin.metrics.ktvPanelWidth
export const FLOATING_PANEL_DEFAULT_MIN_WIDTH_CSS = '21.6rem'
export const FLOATING_PANEL_DEFAULT_WIDTH_FALLBACK_PX = FLOATING_PANEL_DEFAULT_WIDTH_PX
export const FLOATING_PANEL_DEFAULT_HEIGHT_FALLBACK_PX = 420

export function resolveFloatingPanelWidthCss(widthRatio: number): string {
  const finiteRatio = Number.isFinite(widthRatio) ? widthRatio : FLOATING_PANEL_DEFAULT_WIDTH_RATIO
  const safeRatio = Math.max(0.15, Math.min(0.6, finiteRatio))
  const width = safeRatio === FLOATING_PANEL_DEFAULT_WIDTH_RATIO
    ? 'var(--agentic-panel-width)'
    : `max(${FLOATING_PANEL_DEFAULT_MIN_WIDTH_CSS}, ${Math.round(safeRatio * 100)}vw)`
  return `min(calc(100vw - ${FLOATING_PANEL_CANVAS_INLINE_CLEARANCE_CSS}), ${width})`
}

export function resolveFloatingPanelRightClearanceCss(widthRatio: number): string {
  return `calc(${resolveFloatingPanelWidthCss(widthRatio)} + ${FLOATING_PANEL_CANVAS_RIGHT_INSET_CSS} + 0.75rem)`
}

export type FloatingPanelTopRightPositionArgs = {
  viewportWidth: number
  panelWidth: number
  insetPx?: number
}

export const resolveFloatingPanelTopRightDefaultPosition = (args: FloatingPanelTopRightPositionArgs): {
  top: number
  left: number
} => {
  const insetPx = Number.isFinite(args.insetPx) ? Math.max(0, args.insetPx || 0) : FLOATING_PANEL_CANVAS_INSET_PX
  const viewportWidth = Number.isFinite(args.viewportWidth) ? Math.max(0, args.viewportWidth) : 0
  const panelWidth = Number.isFinite(args.panelWidth) ? Math.max(0, args.panelWidth) : FLOATING_PANEL_DEFAULT_WIDTH_FALLBACK_PX
  return {
    top: insetPx,
    left: Math.max(insetPx, viewportWidth - insetPx - panelWidth),
  }
}
