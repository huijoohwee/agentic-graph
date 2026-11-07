type TimelineLayerRect = Pick<DOMRect, 'left' | 'right' | 'width'>

export const TIMELINE_BOTTOM_PANEL_VISIBLE_PX = 32
export const TIMELINE_BOTTOM_PANEL_FALLBACK_SIZE = { width: 560, height: 128 } as const
export const TIMELINE_BOTTOM_PANEL_MIN_HEIGHT_RATIO = 0.18
export const TIMELINE_BOTTOM_PANEL_MAX_HEIGHT_RATIO = 0.62
export const TIMELINE_BOTTOM_PANEL_UNPINNED_WIDTH_PX = 672
export const TIMELINE_BOTTOM_PANEL_UNPINNED_MAX_HEIGHT_PX = 384
export const TIMELINE_BOTTOM_PANEL_MIN_RESIZE_WIDTH_PX = 320
export const TIMELINE_BOTTOM_PANEL_MIN_RESIZE_HEIGHT_PX = 112

export function resolveWorkspaceCanvasLayerInsetLeft({
  workspaceEditorOverlayOpen,
  rootRect,
  workspaceLeftPaneRect,
}: {
  workspaceEditorOverlayOpen: boolean
  rootRect: TimelineLayerRect | null
  workspaceLeftPaneRect: TimelineLayerRect | null
}) {
  if (!workspaceEditorOverlayOpen || !rootRect || !workspaceLeftPaneRect) return 0
  if (
    !Number.isFinite(rootRect.left) ||
    !Number.isFinite(rootRect.right) ||
    !Number.isFinite(rootRect.width) ||
    rootRect.width <= 0
  ) {
    return 0
  }
  if (
    !Number.isFinite(workspaceLeftPaneRect.left) ||
    !Number.isFinite(workspaceLeftPaneRect.right) ||
    !Number.isFinite(workspaceLeftPaneRect.width) ||
    workspaceLeftPaneRect.width <= 0
  ) {
    return 0
  }
  if (workspaceLeftPaneRect.right <= rootRect.left || workspaceLeftPaneRect.left >= rootRect.right) return 0
  const insetLeft = workspaceLeftPaneRect.right - rootRect.left
  if (!Number.isFinite(insetLeft) || insetLeft <= 0) return 0
  // A dock beside the editor needs readable content width, not just a visible drag handle.
  if (rootRect.width - insetLeft < TIMELINE_BOTTOM_PANEL_MIN_RESIZE_WIDTH_PX) return 0
  return Math.max(0, Math.min(rootRect.width, insetLeft))
}

export function clampTimelineBottomPanelHeightRatio(value: number) {
  if (!Number.isFinite(value)) return 0.35
  return Math.max(TIMELINE_BOTTOM_PANEL_MIN_HEIGHT_RATIO, Math.min(TIMELINE_BOTTOM_PANEL_MAX_HEIGHT_RATIO, value))
}
