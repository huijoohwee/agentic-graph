import { RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE } from '@/lib/render/richMediaPanelDefaults'
import {
  coerceRichMediaPanelSizePx,
  resolveRichMediaAspectRatioValue,
  resolveRichMediaAspectSelection,
} from '@/lib/render/richMediaSsot'
import { isRichMediaPanelNode } from '@/lib/render/richMediaPanelNode'

export function readRichMediaOverlayFrameSize(node: { type?: unknown; properties?: unknown } | null | undefined): { width: number; height: number } | null {
  if (!isRichMediaPanelNode(node)) return null
  const props = node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties)
    ? node.properties as Record<string, unknown>
    : null
  if (!props) return RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE
  const storedWidth = Number(props['visual:width'])
  const storedHeight = Number(props['visual:height'])
  const hasStoredWidth = Number.isFinite(storedWidth) && storedWidth > 0
  const hasStoredHeight = Number.isFinite(storedHeight) && storedHeight > 0
  const width = hasStoredWidth
    ? storedWidth
    : RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.width
  const height = hasStoredHeight
    ? storedHeight
    : RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.height
  const targetAspect = hasStoredWidth && hasStoredHeight
    ? resolveRichMediaAspectRatioValue(resolveRichMediaAspectSelection({ width, height }))
    : RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.width / RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.height
  return coerceRichMediaPanelSizePx({ width, height, minWidthPx: 1, minHeightPx: 1, targetAspect })
}
