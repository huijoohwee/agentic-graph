import type { FlowNativeRuntime, FlowNativeScene } from '@/components/FlowCanvas/nativeRuntime'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import {
  clampNumber,
  clampDelta,
  computeDeltaClampForRectWithinRect,
  computeDeltaClampForTopLeftNodes,
} from '@/lib/canvas/groupContainment'
import { computeFlowGroupAabb } from '@/components/FlowCanvas/nativeRuntime'

export type FlowNodeClamp = { minX: number; maxX: number; minY: number; maxY: number }
export type FlowDeltaClamp = { minDx: number; maxDx: number; minDy: number; maxDy: number }
const readContainmentInsetPx = (runtime: FlowNativeRuntime): number => {
  const strokeWidthPx = runtime.presentation?.groups && typeof runtime.presentation.groups.strokeWidthPx === 'number'
    ? runtime.presentation.groups.strokeWidthPx
    : 1
  const candidate = Math.max(0, strokeWidthPx) + 2
  return Math.max(0, Math.min(16, candidate))
}

const isContainmentGroup = (g: GraphGroup): boolean => {
  const src = String((g as unknown as { source?: unknown }).source || '').trim()
  if (src === 'userSubgraph' || src === 'mermaidSubgraph') return true
  const id = String(g.id || '')
  if (id.startsWith('subgraph:')) return true
  return false
}

const pickBestContainmentGroupId = (args: { groupIds: ReadonlyArray<string>; groupById: Map<string, GraphGroup> }): string | null => {
  let bestId: string | null = null
  let bestDepth = -Infinity
  let bestSize = Infinity
  for (let i = 0; i < args.groupIds.length; i += 1) {
    const id = String(args.groupIds[i] || '').trim()
    if (!id) continue
    const g = args.groupById.get(id) || null
    if (!g) continue
    if (!isContainmentGroup(g)) continue
    const depth = typeof g.depth === 'number' && Number.isFinite(g.depth) ? Math.max(0, Math.floor(g.depth)) : 0
    const size = Array.isArray(g.memberNodeIds) ? g.memberNodeIds.length : 0
    if (bestId == null || depth > bestDepth || (depth === bestDepth && size < bestSize) || (depth === bestDepth && size === bestSize && id.localeCompare(bestId) < 0)) {
      bestId = id
      bestDepth = depth
      bestSize = size
    }
  }
  return bestId
}

const readRectForGroup = (args: { runtime: FlowNativeRuntime; scene: FlowNativeScene; group: GraphGroup }) => {
  const cfg = args.runtime.presentation.groups
  const aabb = computeFlowGroupAabb({ scene: args.scene, group: args.group, paddingPx: cfg.paddingPx, labelTopExtraPx: cfg.labelTopExtraPx })
  if (!aabb) return null
  const inset = readContainmentInsetPx(args.runtime)
  const width = aabb.maxX - aabb.minX - inset * 2
  const height = aabb.maxY - aabb.minY - inset * 2
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return { x: aabb.minX + inset, y: aabb.minY + inset, width, height }
}

export const computeFlowNodeClamp = (args: { runtime: FlowNativeRuntime; nodeId: string }): FlowNodeClamp | null => {
  const id = String(args.nodeId || '').trim()
  if (!id) return null
  const scene = args.runtime.scene
  if (!scene) return null
  const node = scene.nodeById.get(id) || null
  if (!node) return null
  const groups = (scene.groups || []) as GraphGroup[]
  if (groups.length === 0) return null
  const groupIds = scene.groupIdsByNodeId?.get(id) || []
  if (!groupIds.length) return null
  const groupById = new Map<string, GraphGroup>()
  for (let i = 0; i < groups.length; i += 1) {
    const gid = String(groups[i]?.id || '').trim()
    if (gid && !groupById.has(gid)) groupById.set(gid, groups[i]!)
  }
  const bestGroupId = pickBestContainmentGroupId({ groupIds, groupById })
  const bestGroup = bestGroupId ? groupById.get(bestGroupId) || null : null
  const rect = bestGroup ? readRectForGroup({ runtime: args.runtime, scene, group: bestGroup }) : null
  if (!rect) return null
  const minX = rect.x
  const maxX = rect.x + rect.width - node.width
  const minY = rect.y
  const maxY = rect.y + rect.height - node.height
  return { minX, maxX, minY, maxY }
}

export const clampFlowNodeTopLeft = (args: { clamp: FlowNodeClamp; x: number; y: number }) => {
  return {
    x: clampNumber(args.x, args.clamp.minX, args.clamp.maxX),
    y: clampNumber(args.y, args.clamp.minY, args.clamp.maxY),
  }
}

export const computeFlowDeltaClampForNodes = (args: {
  runtime: FlowNativeRuntime
  nodeIds: string[]
  startPosById: Map<string, { x: number; y: number }>
}): FlowDeltaClamp | null => {
  if (!args.nodeIds.length) return null
  const scene = args.runtime.scene
  if (!scene) return null
  const groups = (scene.groups || []) as GraphGroup[]
  if (groups.length === 0) return null
  const groupById = new Map<string, GraphGroup>()
  for (let i = 0; i < groups.length; i += 1) {
    const gid = String(groups[i]?.id || '').trim()
    if (gid && !groupById.has(gid)) groupById.set(gid, groups[i]!)
  }

  let sharedBestGroupId: string | null = null
  const rectByNodeId = new Map<string, { x: number; y: number; width: number; height: number }>()
  for (let i = 0; i < args.nodeIds.length; i += 1) {
    const nodeId = String(args.nodeIds[i] || '').trim()
    if (!nodeId) continue
    const groupIds = scene.groupIdsByNodeId?.get(nodeId) || []
    if (!groupIds.length) continue
    const bestGroupId = pickBestContainmentGroupId({ groupIds, groupById })
    if (bestGroupId) {
      if (sharedBestGroupId == null) sharedBestGroupId = bestGroupId
      else if (sharedBestGroupId !== bestGroupId) return null
    }
    const bestGroup = bestGroupId ? groupById.get(bestGroupId) || null : null
    const rect = bestGroup ? readRectForGroup({ runtime: args.runtime, scene, group: bestGroup }) : null
    if (rect) rectByNodeId.set(nodeId, rect)
  }
  const sizeById = new Map<string, { w: number; h: number }>()
  for (let i = 0; i < args.nodeIds.length; i += 1) {
    const id = String(args.nodeIds[i] || '').trim()
    if (!id) continue
    const n = scene.nodeById.get(id) || null
    if (!n) continue
    sizeById.set(id, { w: n.width, h: n.height })
  }
  return computeDeltaClampForTopLeftNodes({ nodeIds: args.nodeIds, startPosById: args.startPosById, sizeById, rectByNodeId })
}

export const computeFlowGroupDeltaClamp = (args: {
  runtime: FlowNativeRuntime
  groupId: string
}): FlowDeltaClamp | null => {
  const groupId = String(args.groupId || '').trim()
  const scene = args.runtime.scene
  if (!groupId || !scene) return null
  const groups = (scene.groups || []) as GraphGroup[]
  const groupById = new Map<string, GraphGroup>()
  for (const group of groups) {
    const id = String(group?.id || '').trim()
    if (id) groupById.set(id, group)
  }
  const group = groupById.get(groupId) || null
  const parentGroupId = String(group?.parentGroupId || '').trim()
  const parent = parentGroupId ? groupById.get(parentGroupId) || null : null
  if (!group || group.containChildren === false || !parent || parent.containChildren === false) return null
  const subject = readRectForGroup({ runtime: args.runtime, scene, group })
  const container = readRectForGroup({ runtime: args.runtime, scene, group: parent })
  if (!subject || !container) return null
  return computeDeltaClampForRectWithinRect({
    subject,
    container,
    inset: readContainmentInsetPx(args.runtime),
  })
}

export const clampFlowDelta = (args: { clamp: FlowDeltaClamp; dx: number; dy: number }) => {
  return clampDelta(args)
}
