import { computePanelFrameSizeFromDensityWidth16x9, readStableRichMediaPanelSize } from '@/lib/render/mediaPanelLayout'
import { MARKDOWN_DESIGN_LAYOUT } from '@/features/markdown-edgeless/markdownDesignLayout'
import type { GraphNode } from '@/lib/graph/types'
import { readNodeProperties } from '@/lib/graph/nodeProperties'
import type { MediaPanelDensity } from '@/lib/render/mediaPanelSpec'
import type { NodeHalfExtents } from '@/components/GraphCanvas/layout/overlap'
import { computeOverlayHalfExtentsWorld, readOverlaySizingConfigForDensity, type OverlayDensitySizingConfigInput } from '@/lib/render/overlaySizing2d'

export function computeOverlayHalfExtentsByNodeId2d(args: {
  nodes: GraphNode[]
  panelOnlyNodeIdSet?: Set<string> | null
  mediaOverlayNodeIdSet?: Set<string> | null
  viewportW: number
  viewportH?: number
  zoomK: number
  mediaPanelDensity: MediaPanelDensity
  overlaySizing?: OverlayDensitySizingConfigInput | null
  aspectRatioMode?: unknown
}): Record<string, NodeHalfExtents> | null {
  const nodes = Array.isArray(args.nodes) ? args.nodes : []
  if (nodes.length === 0) return null

  const panelOnly = args.panelOnlyNodeIdSet || null
  const mediaOnly = args.mediaOverlayNodeIdSet || null
  if ((!panelOnly || panelOnly.size === 0) && (!mediaOnly || mediaOnly.size === 0)) return null

  const ids = new Set<string>()
  if (panelOnly) for (const id of panelOnly) ids.add(String(id || '').trim())
  if (mediaOnly) for (const id of mediaOnly) ids.add(String(id || '').trim())
  ids.delete('')
  if (ids.size === 0) return null

  const byId = new Map<string, GraphNode>()
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i]
    const id = String((n as any)?.id || '').trim()
    if (!id) continue
    if (!byId.has(id)) byId.set(id, n)
  }

  const density: MediaPanelDensity = args.mediaPanelDensity === 'compact' ? 'compact' : 'default'
  const overlayCfg = readOverlaySizingConfigForDensity({ density, sizing: args.overlaySizing || null })

  const fallback = computeOverlayHalfExtentsWorld({
    density,
    viewportW: args.viewportW,
    viewportH: args.viewportH ?? args.viewportW,
    zoomK: 1,
    config: overlayCfg,
  })

  const out: Record<string, NodeHalfExtents> = {}
  for (const id of ids) {
    const n = byId.get(id)
    if (!n) continue

    const props = readNodeProperties(n)
    const wRaw = props['visual:width']
    const hRaw = props['visual:height']
    const w = typeof wRaw === 'number' && Number.isFinite(wRaw) && wRaw > 0 ? wRaw : NaN
    const h = typeof hRaw === 'number' && Number.isFinite(hRaw) && hRaw > 0 ? hRaw : NaN
    if (Number.isFinite(w) && Number.isFinite(h)) {
      out[id] = { halfW: Math.max(1, w / 2), halfH: Math.max(1, h / 2) }
    } else {
      const frame = panelOnly?.has(id)
        ? computePanelFrameSizeFromDensityWidth16x9({ density, panelW: Number.isFinite(w) ? w : MARKDOWN_DESIGN_LAYOUT.block.widthPx })
        : null
      const mediaSize = frame ? null : readStableRichMediaPanelSize({ 'visual:width': Number.isFinite(w) ? w : fallback.halfW * 2 }, args.aspectRatioMode ?? '16:9')
      out[id] = { halfW: ((frame ? Math.round(frame.panelW) : undefined) ?? mediaSize?.w ?? fallback.halfW * 2) / 2,
        halfH: ((frame ? Math.round(frame.panelH) : undefined) ?? mediaSize?.h ?? fallback.halfH * 2) / 2 }
    }
  }

  return Object.keys(out).length > 0 ? out : null
}
