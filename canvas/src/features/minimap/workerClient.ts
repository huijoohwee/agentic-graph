import {
  MINIMAP_EDGE_LIMIT_DEFAULT,
  MINIMAP_GRAPH_PAD_DEFAULT,
  MINIMAP_HEIGHT,
  MINIMAP_NODE_LIMIT_DEFAULT,
  MINIMAP_NODE_SIZE_DEFAULT,
  MINIMAP_WIDTH,
  computeGraphBounds,
  computeMinimapProjection,
} from '@/features/minimap/math'
import { buildEdgesPathD, buildNodesPathD } from '@/features/minimap/renderer'
import type { GraphNode, GraphEdge } from '@/lib/graph/types'
import { requestFromSingletonWorker } from '@/lib/workers/singletonWorkerClient'

type NodeLite = Pick<GraphNode, 'id' | 'x' | 'y'> & { width?: number; height?: number }
type EdgeLite = Pick<GraphEdge, 'id' | 'source' | 'target'>

export type MinimapPreviewBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

export type MinimapPreviewData = {
  nodesPath: string
  edgesPath: string
  sx: number
  bounds: MinimapPreviewBounds
}

export type MinimapPreviewOptions = {
  pad?: number
  miniW?: number
  miniH?: number
  edgeLimit?: number
  nodeLimit?: number
  graphId?: string | number
  boundsOverride?: MinimapPreviewBounds
}

type PreviewResponse = { id: number; ok: boolean; value: MinimapPreviewData; error?: string }

function sampleNodesForMinimap<T>(nodes: T[], limit: number): T[] {
  const max = Math.max(0, Math.floor(limit))
  if (max === 0) return []
  if (nodes.length <= max) return nodes
  const out: T[] = []
  const stride = Math.max(1, Math.floor(nodes.length / max))
  for (let i = 0; i < nodes.length && out.length < max; i += stride) {
    out.push(nodes[i] as T)
  }
  return out
}

function collectNodesForEdgeEndpoints(nodes: NodeLite[], edges: EdgeLite[]): NodeLite[] {
  if (!nodes || nodes.length === 0 || !edges || edges.length === 0) return []
  const needed = new Set<string>()
  for (let i = 0; i < edges.length; i += 1) {
    const e = edges[i]
    needed.add(String(e.source))
    needed.add(String(e.target))
  }
  if (needed.size === 0) return []
  const out: NodeLite[] = []
  for (let i = 0; i < nodes.length; i += 1) {
    if (needed.size === 0) break
    const n = nodes[i]
    const id = String(n.id)
    if (!needed.has(id)) continue
    needed.delete(id)
    out.push(n)
  }
  return out
}

function mergeNodesById(primary: NodeLite[], extra: NodeLite[]): NodeLite[] {
  if (extra.length === 0) return primary
  const seen = new Set<string>()
  const out: NodeLite[] = []
  for (let i = 0; i < primary.length; i += 1) {
    const n = primary[i]
    const id = String(n.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(n)
  }
  for (let i = 0; i < extra.length; i += 1) {
    const n = extra[i]
    const id = String(n.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(n)
  }
  return out
}

function computeMinimapPreviewSync(
  nodes: NodeLite[],
  edges: EdgeLite[],
  opts?: MinimapPreviewOptions,
): MinimapPreviewData {
  const N = Array.isArray(nodes) ? nodes : []
  const E = Array.isArray(edges) ? edges : []
  const pad = typeof opts?.pad === 'number' ? opts.pad : MINIMAP_GRAPH_PAD_DEFAULT
  const miniW = typeof opts?.miniW === 'number' ? opts.miniW : MINIMAP_WIDTH
  const miniH = typeof opts?.miniH === 'number' ? opts.miniH : MINIMAP_HEIGHT
  const bounds = opts?.boundsOverride || computeGraphBounds(N, pad)
  const { sx } = computeMinimapProjection(bounds, { w: miniW, h: miniH })
  const EDGE_LIMIT = typeof opts?.edgeLimit === 'number' ? opts.edgeLimit : MINIMAP_EDGE_LIMIT_DEFAULT
  const edgesPath = E.length > EDGE_LIMIT ? '' : buildEdgesPathD(N, E, bounds, sx, opts?.graphId)
  const NODE_LIMIT = typeof opts?.nodeLimit === 'number' ? opts.nodeLimit : MINIMAP_NODE_LIMIT_DEFAULT
  const nodesPath = buildNodesPathD(sampleNodesForMinimap(N, NODE_LIMIT), bounds, sx, MINIMAP_NODE_SIZE_DEFAULT, opts?.graphId)
  return { nodesPath, edgesPath, sx, bounds }
}

export function computeMinimapPreviewInWorker(
  nodes: NodeLite[],
  edges: EdgeLite[],
  opts?: MinimapPreviewOptions,
  signal?: AbortSignal,
): Promise<MinimapPreviewData | null> {
  try {
    const isDev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV
    const isOffline = typeof navigator !== 'undefined' && navigator && 'onLine' in navigator && !navigator.onLine
    const hasWorker = typeof Worker !== 'undefined'
    if (isDev || isOffline || !hasWorker) {
      return Promise.resolve(computeMinimapPreviewSync(nodes, edges, opts))
    }

    const N = Array.isArray(nodes) ? nodes : []
    const E = Array.isArray(edges) ? edges : []
    const EDGE_LIMIT = typeof opts?.edgeLimit === 'number' ? opts.edgeLimit : MINIMAP_EDGE_LIMIT_DEFAULT
    const edgesToSend = E.length > EDGE_LIMIT ? [] : E
    const NODE_LIMIT = typeof opts?.nodeLimit === 'number' ? opts.nodeLimit : MINIMAP_NODE_LIMIT_DEFAULT
    const sampledNodes = sampleNodesForMinimap(N, NODE_LIMIT)
    const endpointNodes = edgesToSend.length > 0 ? collectNodesForEdgeEndpoints(N, edgesToSend) : []
    const nodesToSend = mergeNodesById(sampledNodes, endpointNodes)
    const pad = typeof opts?.pad === 'number' ? opts.pad : MINIMAP_GRAPH_PAD_DEFAULT
    const boundsOverride = opts?.boundsOverride || computeGraphBounds(N, pad)

    return requestFromSingletonWorker<MinimapPreviewData | null>({
      globalStateKey: '__AG_MINIMAP_WORKER__',
      createWorker: () => new Worker(new URL('../../workers/minimap.worker.ts', import.meta.url), { type: 'module' }),
      timeoutMs: 12_000,
      signal,
      postMessage: (worker, id) => {
        worker.postMessage({ type: 'preview', id, nodes: nodesToSend, edges: edgesToSend, ...(opts || {}), boundsOverride })
      },
      readResponse: (data) => {
        const d = data as PreviewResponse | null | undefined
        if (!d || typeof d !== 'object') return null
        if (typeof d.id !== 'number') return null
        if (typeof d.ok !== 'boolean') return null
        return { id: d.id, ok: d.ok, value: d.ok ? d.value : null, error: d.error }
      },
    })
  } catch {
    try { return Promise.resolve(computeMinimapPreviewSync(nodes, edges, opts)) } catch { return Promise.resolve(null) }
  }
}
