import { isPlainObject } from '@/lib/graph/value'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'

function normalizeEdgeEndpointId(raw: string): string {
  const value = raw.trim()
  if (!value) return ''
  if (/[\\/]|%2f|%5c/i.test(value)) return value
  const dot = value.lastIndexOf('.')
  return dot > 0 ? value.slice(0, dot).trim() : value
}

export function readEdgeEndpointId(raw: unknown): string {
  const value = unwrapGraphCellValue(raw)
  if (typeof value === 'string') return normalizeEdgeEndpointId(value)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (isPlainObject(value)) {
    const id = unwrapGraphCellValue((value as { id?: unknown }).id)
    if (typeof id === 'string') return normalizeEdgeEndpointId(id)
    if (typeof id === 'number') return Number.isFinite(id) ? String(id) : ''
  }
  return ''
}

export function readGraphEdgeEndpoints(edge: {
  source?: unknown
  target?: unknown
} | null | undefined): {
  src: string | null
  tgt: string | null
} {
  const src = readEdgeEndpointId(edge?.source)
  const tgt = readEdgeEndpointId(edge?.target)
  return {
    src: src || null,
    tgt: tgt || null,
  }
}

export function buildSelectedEdgeEndpointNodeIdSet(
  edges: ReadonlyArray<{
    id?: unknown
    source?: unknown
    target?: unknown
  }>,
  selectedEdgeIds: ReadonlySet<string>,
): Set<string> {
  const endpointNodeIds = new Set<string>()
  if (selectedEdgeIds.size === 0) return endpointNodeIds
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i]
    const edgeId = String(edge?.id || '').trim()
    if (!edgeId || !selectedEdgeIds.has(edgeId)) continue
    const { src, tgt } = readGraphEdgeEndpoints(edge)
    if (src) endpointNodeIds.add(src)
    if (tgt) endpointNodeIds.add(tgt)
  }
  return endpointNodeIds
}

export function readSelectedEdgeEndpointsById<
  TEdge extends {
    source?: unknown
    target?: unknown
  },
>(
  edgeById: ReadonlyMap<string, TEdge> | null | undefined,
  selectedEdgeIds: ReadonlyArray<string>,
): Array<{ edgeId: string; src: string; tgt: string }> {
  const endpoints: Array<{ edgeId: string; src: string; tgt: string }> = []
  if (!edgeById || selectedEdgeIds.length === 0) return endpoints
  const seen = new Set<string>()
  for (let i = 0; i < selectedEdgeIds.length; i += 1) {
    const edgeId = String(selectedEdgeIds[i] || '').trim()
    if (!edgeId || seen.has(edgeId)) continue
    seen.add(edgeId)
    const edge = edgeById.get(edgeId)
    if (!edge) continue
    const { src, tgt } = readGraphEdgeEndpoints(edge)
    if (!src || !tgt) continue
    endpoints.push({ edgeId, src, tgt })
  }
  return endpoints
}
