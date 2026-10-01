import * as d3 from 'd3'
import type { GraphSchema } from '@/lib/graph/schema'
import { DEFAULT_CANVAS_LAYER_ORDER_2D, MERMAID_RENDER_ORDER_KEY_TO_LAYER_ID_2D } from '@/lib/canvas/layerOrder2d'

type GSelection = d3.Selection<SVGGElement, unknown, null, undefined>

export function applyGraphCanvasZOrder(g: GSelection, schema?: GraphSchema | null) {
  const renderOrderRaw = schema?.layout?.mermaid?.renderOrder
  const renderOrder = renderOrderRaw && typeof renderOrderRaw === 'object' && !Array.isArray(renderOrderRaw)
    ? (renderOrderRaw as Record<string, unknown>)
    : null

  const rankByLayerId: Record<string, number> = {}
  for (const x of DEFAULT_CANVAS_LAYER_ORDER_2D) {
    rankByLayerId[x.id] = x.rank
  }

  if (renderOrder) {
    for (const [key, v] of Object.entries(renderOrder)) {
      if (typeof v !== 'number' || !Number.isFinite(v)) continue
      const mapped = MERMAID_RENDER_ORDER_KEY_TO_LAYER_ID_2D[key] || key
      if (!mapped) continue
      rankByLayerId[mapped] = v
    }
  }

  const foregroundRank = Math.min(rankByLayerId.links!, rankByLayerId['links-hit']!, rankByLayerId.nodes!)
  rankByLayerId['groups-hit'] = Math.min(rankByLayerId['groups-hit']!, foregroundRank - 1)
  rankByLayerId.groups = Math.min(rankByLayerId.groups!, rankByLayerId['groups-hit']! - 1)

  const parent = g.node()
  if (!parent) return

  const layers = Object.entries(rankByLayerId)
    .map(([id, rank]) => ({
      id,
      rank,
      el: g.select(`[data-kg-layer="${id}"]`).node() as SVGGElement | null,
    }))
    .filter(x => !!x.el)
    .sort((a, b) => a.rank - b.rank)

  for (const layer of layers) {
    parent.appendChild(layer.el as SVGGElement)
  }
}
