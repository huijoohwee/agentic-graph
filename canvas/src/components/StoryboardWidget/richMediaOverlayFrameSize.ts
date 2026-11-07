import { RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE } from '@/lib/render/richMediaPanelDefaults'
import {
  coerceRichMediaPanelSizePx,
  resolveRichMediaAspectRatioValue,
  resolveRichMediaAspectSelection,
} from '@/lib/render/richMediaSsot'
import { isRichMediaPanelNode } from '@/lib/render/richMediaPanelNode'

export type RichMediaOverlayPanelSize = { w: number; h: number }

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

export function resolveRichMediaOverlayFrameSize(
  node: { type?: unknown; properties?: unknown } | null | undefined,
  override?: RichMediaOverlayPanelSize | null,
): RichMediaOverlayPanelSize | null {
  const frame = readRichMediaOverlayFrameSize(node)
  return frame ? override || { w: frame.width, h: frame.height } : null
}

export function createRichMediaOverlayPanelSizeReader(
  localSizes: { current: Record<string, RichMediaOverlayPanelSize | undefined> },
  nodeById: ReadonlyMap<string, { type?: unknown; properties?: unknown }> | undefined,
  readProperties: (id: string) => Record<string, unknown>,
): (id: string) => RichMediaOverlayPanelSize | null {
  return id => {
    const local = localSizes.current[id]
    if (local) return local
    const frame = readRichMediaOverlayFrameSize(nodeById?.get(id))
    if (frame) return { w: frame.width, h: frame.height }
    const props = readProperties(id)
    const width = Number(props['visual:width'])
    const height = Number(props['visual:height'])
    return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
      ? { w: width, h: height }
      : null
  }
}
