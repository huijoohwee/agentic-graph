export const Z_INDEX_ANCHOR_OVERLAY = 2147483600
export const Z_INDEX_GRAPH_OVERLAY_BASE = 60
export const Z_INDEX_GRAPH_OVERLAY_EDGES = 59
export const Z_INDEX_GRAPH_OVERLAY_SELECTED = 78
export const Z_INDEX_GRAPH_MEDIA_LAYER = 70
export const Z_INDEX_FLOATING_PANEL_DEFAULT = 5000
// A full editor workspace overlays canvas panels while leaving canvas tools mounted underneath.
export const Z_INDEX_WORKSPACE_EDITOR_BACKGROUND_PANEL = 230
// Three shared panel ranks fit below the existing menu and anchor layers.
export const Z_INDEX_PANEL_STACK_MAX_BASE = 100000
export const Z_INDEX_MENU = 2147483647
export const Z_INDEX_TOAST = 2147483647

export function resolvePanelStackBaseZIndex(value: number): number {
  return Number.isFinite(value)
    ? Math.min(Z_INDEX_PANEL_STACK_MAX_BASE, Math.max(1, Math.floor(value)))
    : Z_INDEX_FLOATING_PANEL_DEFAULT
}

export function resolveFloatingPanelZIndex(value: number, pinned: boolean, workspaceEditorOverlayOpen: boolean): number {
  const safeZ = Number.isFinite(value) ? Math.max(1, Math.floor(value)) : Z_INDEX_FLOATING_PANEL_DEFAULT
  return Math.max(safeZ, pinned ? 1000 : workspaceEditorOverlayOpen ? 420 : 90)
}

export function resolveMainPanelZIndex(value: number): number {
  return resolveFloatingPanelZIndex(value, true, true) + 1
}
