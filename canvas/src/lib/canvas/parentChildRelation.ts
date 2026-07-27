import type { GraphData } from '@/lib/graph/types'
import { readSubgraphs, subgraphGroupId, type UserSubgraph } from '@/lib/graph/subgraphs'

export type CanvasPoint = {
  x: number
  y: number
}

export type CanvasBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type ParentDropCandidate = {
  groupId: string
  subgraphId: string
  depth: number
  memberNodeIds: string[]
  bounds: CanvasBounds
}

const isFinitePoint = (point: CanvasPoint): boolean =>
  Number.isFinite(point.x) && Number.isFinite(point.y)

const isFiniteBounds = (bounds: CanvasBounds): boolean =>
  Number.isFinite(bounds.minX) &&
  Number.isFinite(bounds.minY) &&
  Number.isFinite(bounds.maxX) &&
  Number.isFinite(bounds.maxY) &&
  bounds.maxX > bounds.minX &&
  bounds.maxY > bounds.minY

export const absoluteToParentRelative = (
  absolute: CanvasPoint,
  parentOrigin: CanvasPoint,
): CanvasPoint => ({
  x: absolute.x - parentOrigin.x,
  y: absolute.y - parentOrigin.y,
})

export const parentRelativeToAbsolute = (
  relative: CanvasPoint,
  parentOrigin: CanvasPoint,
): CanvasPoint => ({
  x: parentOrigin.x + relative.x,
  y: parentOrigin.y + relative.y,
})

export const preserveAbsolutePositionForParent = (
  absolute: CanvasPoint,
  parentBounds: CanvasBounds,
): { absolute: CanvasPoint; relative: CanvasPoint } | null => {
  if (!isFinitePoint(absolute) || !isFiniteBounds(parentBounds)) return null
  const parentOrigin = { x: parentBounds.minX, y: parentBounds.minY }
  const relative = absoluteToParentRelative(absolute, parentOrigin)
  return {
    relative,
    absolute: parentRelativeToAbsolute(relative, parentOrigin),
  }
}

export const selectParentDropTarget = (args: {
  nodeId: string
  nodeBounds: CanvasBounds
  candidates: ParentDropCandidate[]
}): ParentDropCandidate | null => {
  const nodeId = String(args.nodeId || '').trim()
  if (!nodeId || !isFiniteBounds(args.nodeBounds)) return null
  const centerX = (args.nodeBounds.minX + args.nodeBounds.maxX) / 2
  const centerY = (args.nodeBounds.minY + args.nodeBounds.maxY) / 2
  const eligible = args.candidates.filter(candidate => {
    if (!candidate || !isFiniteBounds(candidate.bounds)) return false
    if ((candidate.memberNodeIds || []).some(rawId => String(rawId || '').trim() === nodeId)) return false
    return (
      centerX >= candidate.bounds.minX &&
      centerX <= candidate.bounds.maxX &&
      centerY >= candidate.bounds.minY &&
      centerY <= candidate.bounds.maxY
    )
  })
  eligible.sort((a, b) => {
    if (a.depth !== b.depth) return b.depth - a.depth
    const areaA = (a.bounds.maxX - a.bounds.minX) * (a.bounds.maxY - a.bounds.minY)
    const areaB = (b.bounds.maxX - b.bounds.minX) * (b.bounds.maxY - b.bounds.minY)
    if (areaA !== areaB) return areaA - areaB
    return a.groupId.localeCompare(b.groupId)
  })
  return eligible[0] || null
}

const subgraphDepth = (subgraph: UserSubgraph, byId: ReadonlyMap<string, UserSubgraph>): number => {
  let depth = 0
  let cursor = subgraph.parentId == null ? '' : String(subgraph.parentId || '').trim()
  const seen = new Set<string>([subgraph.id])
  while (cursor && !seen.has(cursor) && depth < 200) {
    seen.add(cursor)
    depth += 1
    cursor = String(byId.get(cursor)?.parentId || '').trim()
  }
  return depth
}

export const findNodeParentSubgraph = (
  graphData: GraphData | null | undefined,
  rawNodeId: string | null | undefined,
): UserSubgraph | null => {
  const nodeId = String(rawNodeId || '').trim()
  if (!nodeId) return null
  const subgraphs = readSubgraphs(graphData)
  const byId = new Map(subgraphs.map(subgraph => [subgraph.id, subgraph] as const))
  const candidates = subgraphs.filter(subgraph => subgraph.memberNodeIds.includes(nodeId))
  candidates.sort((a, b) => {
    const depthDelta = subgraphDepth(b, byId) - subgraphDepth(a, byId)
    return depthDelta || subgraphGroupId(a.id).localeCompare(subgraphGroupId(b.id))
  })
  return candidates[0] || null
}
