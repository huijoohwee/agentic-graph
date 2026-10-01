import type { MarkdownDesignBlock } from './markdownDesignLayout'
import type { MediaPanelDensity } from '@/lib/render/mediaPanelSpec'
import { computePanelFrameSizeFromDensityWidth16x9 } from '@/lib/render/mediaPanelLayout'

export function resolveMarkdownPanelBlockAspectSize(block: MarkdownDesignBlock, density: MediaPanelDensity) {
  const panelW = Math.max(24, Math.round(Number(block.w) || 24))
  const frame = computePanelFrameSizeFromDensityWidth16x9({ density, panelW })
  return { w: Math.max(24, Math.round(frame.panelW)), h: Math.max(24, Math.round(frame.panelH)) }
}

export function resolveMarkdownPanelProjection(args: {
  block: MarkdownDesignBlock
  density: MediaPanelDensity
  anchorId?: string
  getCenter?: ((id: string) => { x: number; y: number } | null) | null
}) {
  const { block } = args
  const size = resolveMarkdownPanelBlockAspectSize(block, args.density)
  const center = args.getCenter?.(args.anchorId || block.id)
  return { id: block.id, w: size.w, h: size.h,
    cx: center?.x ?? block.x + size.w / 2,
    cy: center?.y ?? block.y + size.h / 2 }
}
