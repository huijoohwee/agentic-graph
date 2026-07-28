import type { GraphData } from '@/lib/graph/types'
import { readSubgraphs } from '@/lib/graph/subgraphs'

export type GroupPanelContainmentBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

type GroupPanelChildSize = {
  width: number
  height: number
}

export const collectGroupPanelContainedNodeIds = (
  graphData: GraphData | null | undefined,
): Set<string> => {
  const containedNodeIds = new Set<string>()
  readSubgraphs(graphData).forEach(group => {
    group.memberNodeIds.forEach(rawNodeId => {
      const nodeId = String(rawNodeId || '').trim()
      if (nodeId) containedNodeIds.add(nodeId)
    })
  })
  return containedNodeIds
}

export const isGroupPanelContainedNode = (
  containedNodeIds: ReadonlySet<string>,
  rawNodeId: unknown,
): boolean => {
  const nodeId = String(rawNodeId || '').trim()
  return nodeId ? containedNodeIds.has(nodeId) : false
}

const clampAxis = (start: number, end: number, size: number, value: number): number => {
  const min = Math.min(start, end)
  const max = Math.max(start, end)
  const extent = Math.max(0, size)
  if (max - min <= extent) return min + (max - min - extent) / 2
  return Math.max(min, Math.min(max - extent, value))
}

export const clampGroupPanelChildTopLeft = (args: {
  bounds: GroupPanelContainmentBounds | null | undefined
  padding?: number
  point: { x: number; y: number }
  size: GroupPanelChildSize
}): { x: number; y: number } => {
  const { bounds, point, size } = args
  if (!bounds) return point
  const padding = Number.isFinite(args.padding) ? Math.max(0, Number(args.padding)) : 8
  return {
    x: clampAxis(bounds.minX + padding, bounds.maxX - padding, size.width, point.x),
    y: clampAxis(bounds.minY + padding, bounds.maxY - padding, size.height, point.y),
  }
}

export const clampGroupPanelChildCenter = (args: {
  bounds: GroupPanelContainmentBounds | null | undefined
  center: { x: number; y: number }
  padding?: number
  size: GroupPanelChildSize
}): { x: number; y: number } => {
  const topLeft = clampGroupPanelChildTopLeft({
    bounds: args.bounds,
    padding: args.padding,
    point: {
      x: args.center.x - args.size.width / 2,
      y: args.center.y - args.size.height / 2,
    },
    size: args.size,
  })
  return {
    x: topLeft.x + args.size.width / 2,
    y: topLeft.y + args.size.height / 2,
  }
}
