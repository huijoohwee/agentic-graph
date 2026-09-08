import type { GraphData, GraphNode } from '@/lib/graph/types'
import { splitComposedNodeId } from '@/lib/graph/canonicalNodeIds'

type NodeLayoutIdentity = {
  type: string
  x: number | null
  y: number | null
}

function readCanonicalNodeId(raw: unknown): string {
  const id = String(raw || '').trim()
  if (!id) return ''
  return splitComposedNodeId(id).inner || id
}

function readLayoutIdentity(node: GraphNode): NodeLayoutIdentity {
  return {
    type: String(node.type || '').trim(),
    x: typeof node.x === 'number' && Number.isFinite(node.x) ? Math.round(node.x) : null,
    y: typeof node.y === 'number' && Number.isFinite(node.y) ? Math.round(node.y) : null,
  }
}

function indexUniqueNodesByCanonicalId(
  graphData: GraphData,
): Map<string, NodeLayoutIdentity> | null {
  const indexed = new Map<string, NodeLayoutIdentity>()
  const nodes = Array.isArray(graphData.nodes) ? graphData.nodes : []
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    const id = readCanonicalNodeId(node?.id)
    if (!node || !id || indexed.has(id)) return null
    indexed.set(id, readLayoutIdentity(node))
  }
  return indexed
}

export function hasStableSameSourceTopology(
  current: GraphData | null | undefined,
  next: GraphData | null | undefined,
): boolean {
  if (!current || !next) return false
  const currentMeta = (current.metadata || {}) as Record<string, unknown>
  const nextMeta = (next.metadata || {}) as Record<string, unknown>
  if (String(currentMeta.kind || '').trim() !== String(nextMeta.kind || '').trim()) return false

  const currentNodeIds = (current.nodes || []).map(node => readCanonicalNodeId(node?.id)).filter(Boolean).sort()
  const nextNodeIds = (next.nodes || []).map(node => readCanonicalNodeId(node?.id)).filter(Boolean).sort()
  if (currentNodeIds.length !== nextNodeIds.length) return false
  for (let index = 0; index < currentNodeIds.length; index += 1) {
    if (currentNodeIds[index] !== nextNodeIds[index]) return false
  }

  const currentEdges = readCanonicalEdgeTopology(current)
  const nextEdges = readCanonicalEdgeTopology(next)
  if (currentEdges.length !== nextEdges.length) return false
  for (let index = 0; index < currentEdges.length; index += 1) {
    if (currentEdges[index] !== nextEdges[index]) return false
  }
  return true
}

export function hasStableSameSourceNodeLayout(
  current: GraphData | null | undefined,
  next: GraphData | null | undefined,
): boolean {
  if (!current || !next || !hasStableSameSourceTopology(current, next)) return false
  const currentById = new Map<string, { x: number | null; y: number | null }>()
  for (const node of current.nodes || []) {
    const id = readCanonicalNodeId(node?.id)
    if (!id || currentById.has(id)) return false
    const layout = readLayoutIdentity(node)
    currentById.set(id, { x: layout.x, y: layout.y })
  }
  for (const node of next.nodes || []) {
    const id = readCanonicalNodeId(node?.id)
    const currentLayout = id ? currentById.get(id) : undefined
    if (!id || !currentLayout) return false
    const nextLayout = readLayoutIdentity(node)
    if (currentLayout.x !== nextLayout.x || currentLayout.y !== nextLayout.y) return false
  }
  return true
}

/**
 * Returns the canonical IDs whose authored layout identity is unchanged across
 * a node-set change. Runtime placement remains authoritative only for this
 * stable intersection; removed, added, and layout-changed IDs enter without
 * inherited placement.
 */
export type RetainedNodePlacementContinuity = {
  nodeSetChanged: boolean
  stableCanonicalNodeIds: ReadonlySet<string>
}

export function buildRetainedNodePlacementContinuityAcrossTopologyChange(
  current: GraphData | null | undefined,
  next: GraphData | null | undefined,
): RetainedNodePlacementContinuity {
  const empty = (): RetainedNodePlacementContinuity => ({
    nodeSetChanged: false,
    stableCanonicalNodeIds: new Set(),
  })
  if (!current || !next) return empty()
  const currentById = indexUniqueNodesByCanonicalId(current)
  const nextById = indexUniqueNodesByCanonicalId(next)
  if (!currentById || !nextById) return empty()

  let nodeSetChanged = currentById.size !== nextById.size
  const stableRetainedNodeIds = new Set<string>()
  for (const [id, currentLayout] of currentById) {
    const nextLayout = nextById.get(id)
    if (!nextLayout) {
      nodeSetChanged = true
      continue
    }
    if (
      nextLayout.type !== currentLayout.type
      || nextLayout.x !== currentLayout.x
      || nextLayout.y !== currentLayout.y
    ) {
      continue
    }
    stableRetainedNodeIds.add(id)
  }
  if (!nodeSetChanged) {
    for (const id of nextById.keys()) {
      if (currentById.has(id)) continue
      nodeSetChanged = true
      break
    }
  }
  return {
    nodeSetChanged,
    stableCanonicalNodeIds: nodeSetChanged ? stableRetainedNodeIds : new Set(),
  }
}

export type WidgetLayoutEvidence = {
  kind: string
  nodes: Array<[string, string, number | null, number | null]>
  edges: string[]
}

function readCanonicalEdgeTopology(graphData: GraphData): string[] {
  return (graphData.edges || [])
    .map(edge => `${readCanonicalNodeId(edge?.id)}|${readCanonicalNodeId(edge?.source)}|${readCanonicalNodeId(edge?.target)}`)
    .filter(Boolean)
    .sort()
}

export function buildWidgetLayoutEvidence(graphData: GraphData): WidgetLayoutEvidence | null {
  const nodes = indexUniqueNodesByCanonicalId(graphData)
  if (!nodes) return null
  return {
    kind: String(graphData.metadata?.kind || '').trim(),
    nodes: [...nodes].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([id, layout]) => [id, layout.type, layout.x, layout.y]),
    edges: readCanonicalEdgeTopology(graphData),
  }
}

export function compareWidgetLayoutEvidence(previous: WidgetLayoutEvidence, next: WidgetLayoutEvidence) {
  const before = new Map(previous.nodes.map(([id, type, x, y]) => [id, { type, x, y }]))
  const after = new Map(next.nodes.map(([id, type, x, y]) => [id, { type, x, y }]))
  const nodeSetChanged = before.size !== after.size || [...before.keys()].some(id => !after.has(id))
  const stableCanonicalNodeIds = new Set<string>()
  let stableTypes = !nodeSetChanged
  for (const [id, old] of before) {
    const current = after.get(id)
    if (!current || current.type !== old.type) stableTypes = false
    if (current && current.type === old.type && current.x === old.x && current.y === old.y) stableCanonicalNodeIds.add(id)
  }
  const stableTopology = previous.kind === next.kind && !nodeSetChanged
    && previous.edges.length === next.edges.length && previous.edges.every((edge, i) => edge === next.edges[i])
  return { nodeSetChanged, stableCanonicalNodeIds, stableTopology, stableTypes,
    stableLayout: stableTopology && stableCanonicalNodeIds.size === before.size }
}
