import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import type { GraphSchema } from '@/lib/graph/schema'
import type { GraphNode } from '@/lib/graph/types'
import { readGroupBoundsOverrideSource } from '@/lib/canvas/groupBoundsOverrides'
import type { RectBounds } from '@/lib/canvas/groupContainment'
import { getNodeAabbHalfExtentsWithLabel } from '@/components/GraphCanvas/layout/overlap'
import { DEFAULT_GROUP_NESTED_PADDING_STEP } from '@/lib/graph/layoutDefaults'

const readRectBounds = (g: GraphGroup['bounds'] | null): RectBounds | null => {
  if (!g) return null
  const x = typeof g.x === 'number' ? g.x : Number.NaN
  const y = typeof g.y === 'number' ? g.y : Number.NaN
  const width = typeof g.width === 'number' ? g.width : Number.NaN
  const height = typeof g.height === 'number' ? g.height : Number.NaN
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return null
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

export const buildGroupRectByIdFromSchemaOverrides = (args: { groups: GraphGroup[]; graphNodes: ReadonlyArray<GraphNode>; schema: GraphSchema }): Map<string, RectBounds> => {
  const out = new Map<string, RectBounds>()
  for (let i = 0; i < args.groups.length; i += 1) {
    const g = args.groups[i]
    const groupId = String(g.id || '').trim()
    if (!groupId) continue
    const override = readGroupBoundsOverrideSource({ groupId, graphNodes: args.graphNodes, schema: args.schema }).bounds
    const rect = readRectBounds(override)
    if (!rect) continue
    out.set(groupId, rect)
  }
  return out
}

export const buildGroupRectByIdFromGroups = (groups: GraphGroup[] | null | undefined): Map<string, RectBounds> => {
  const out = new Map<string, RectBounds>()
  const gs = Array.isArray(groups) ? groups : []
  for (let i = 0; i < gs.length; i += 1) {
    const g = gs[i]
    const id = String(g.id || '').trim()
    if (!id) continue
    const rect = readRectBounds(g.bounds || null)
    if (!rect) continue
    out.set(id, rect)
  }
  return out
}

export const buildDynamicGroupRectById = (args: {
  groups: GraphGroup[]
  graphNodes: ReadonlyArray<GraphNode>
  schema: GraphSchema
}): Map<string, RectBounds> => {
  const out = new Map<string, RectBounds>()
  const nodeById = new Map<string, GraphNode>()
  for (const node of args.graphNodes) {
    const id = String(node?.id || '').trim()
    if (id) nodeById.set(id, node)
  }
  const configuredPadding = args.schema.layout?.groups?.padding
  const padding = typeof configuredPadding === 'number' && Number.isFinite(configuredPadding)
    ? Math.max(0, configuredPadding)
    : 24
  const configuredNestedPadding = args.schema.layout?.groups?.nestedPaddingStep
  const nestedPaddingStep = typeof configuredNestedPadding === 'number' && Number.isFinite(configuredNestedPadding)
    ? Math.max(0, configuredNestedPadding)
    : DEFAULT_GROUP_NESTED_PADDING_STEP
  const maxDepth = args.groups.reduce((max, group) => {
    const depth = typeof group.depth === 'number' && Number.isFinite(group.depth)
      ? Math.max(0, Math.floor(group.depth))
      : 0
    return Math.max(max, depth)
  }, 0)
  for (const group of args.groups) {
    const groupId = String(group?.id || '').trim()
    if (!groupId || group.containChildren !== true) continue
    const depth = typeof group.depth === 'number' && Number.isFinite(group.depth)
      ? Math.max(0, Math.floor(group.depth))
      : 0
    const effectivePadding = padding + nestedPaddingStep * Math.max(0, maxDepth - depth)
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const rawNodeId of group.memberNodeIds || []) {
      const node = nodeById.get(String(rawNodeId || '').trim()) || null
      if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.y)) continue
      const extents = getNodeAabbHalfExtentsWithLabel(node, args.schema)
      minX = Math.min(minX, node.x - extents.halfW)
      maxX = Math.max(maxX, node.x + extents.halfW)
      minY = Math.min(minY, node.y - extents.halfH)
      maxY = Math.max(maxY, node.y + extents.halfH)
    }
    if (minX === Infinity || minY === Infinity || maxX <= minX || maxY <= minY) continue
    out.set(groupId, {
      x: minX - effectivePadding,
      y: minY - effectivePadding,
      width: maxX - minX + effectivePadding * 2,
      height: maxY - minY + effectivePadding * 2,
    })
  }
  return out
}

export const buildDeepestGroupRectByNodeId = (args: { groups: GraphGroup[]; groupRectById: Map<string, RectBounds> }): Map<string, RectBounds> => {
  const bestDepthByNodeId = new Map<string, number>()
  const boundsByNodeId = new Map<string, RectBounds>()
  for (let i = 0; i < args.groups.length; i += 1) {
    const g = args.groups[i]
    const groupId = String(g.id || '').trim()
    if (!groupId) continue
    const rect = args.groupRectById.get(groupId) || null
    if (!rect) continue
    const depth = typeof g.depth === 'number' && Number.isFinite(g.depth) ? Math.max(0, Math.floor(g.depth)) : 0
    const members = Array.isArray(g.memberNodeIds) ? g.memberNodeIds : []
    for (let j = 0; j < members.length; j += 1) {
      const nodeId = String(members[j] || '').trim()
      if (!nodeId) continue
      const prevDepth = bestDepthByNodeId.get(nodeId)
      if (prevDepth != null && prevDepth >= depth) continue
      bestDepthByNodeId.set(nodeId, depth)
      boundsByNodeId.set(nodeId, rect)
    }
  }
  return boundsByNodeId
}
