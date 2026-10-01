export type LayerRank = ReadonlyArray<{ id: string; rank: number }>

export const DEFAULT_CANVAS_LAYER_ORDER_2D: LayerRank = [
  { id: 'groups', rank: -30 },
  { id: 'groups-hit', rank: -25 },
  { id: 'links', rank: -20 },
  { id: 'links-hit', rank: -5 },
  { id: 'edge-labels', rank: 5 },
  { id: 'temp-link', rank: 7 },
  { id: 'nodes', rank: 10 },
  { id: 'node-chevrons', rank: 12 },
  { id: 'media', rank: 14 },
  { id: 'labels', rank: 18 },
  { id: 'port-handles', rank: 22 },
  { id: 'group-labels', rank: 24 },
  { id: 'group-resize-handles', rank: 26 },
  { id: 'resize-handles', rank: 30 },
]

export const MERMAID_RENDER_ORDER_KEY_TO_LAYER_ID_2D: Readonly<Record<string, string>> = {
  MermaidSubgraph: 'groups',
  MermaidNode: 'nodes',
  edge: 'links',
  edgeLabels: 'edge-labels',
  nodeLabels: 'labels',
}

/** Painter order: larger surfaces first; equal areas keep a stable identity order. */
export function compareCanvasSurfaceArea(
  a: { id: string; w: number; h: number; scale?: number },
  b: { id: string; w: number; h: number; scale?: number },
): number {
  const area = (item: typeof a) => {
    const value = item.w * item.h * (item.scale ?? 1) ** 2
    return Number.isFinite(value) && value > 0 ? value : 0
  }
  return area(b) - area(a) || a.id.localeCompare(b.id)
}
