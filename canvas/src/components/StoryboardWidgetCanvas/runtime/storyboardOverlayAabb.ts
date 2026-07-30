import type { FlowOverlayNodeAabb } from '@/components/FlowCanvas/nativeRuntime'
import {
  readStoryboardCardSize2d,
  readStoryboardWidgetPlacementSize2d,
} from '@/components/StoryboardWidgetCanvas/storyboardCardPlacements2d'
import type { GraphNode } from '@/lib/graph/types'

const readFinitePoint = (node: GraphNode | undefined) => {
  const x = typeof node?.x === 'number' && Number.isFinite(node.x) ? node.x : null
  const y = typeof node?.y === 'number' && Number.isFinite(node.y) ? node.y : null
  return x == null || y == null ? null : { x, y }
}

export function buildStoryboardOverlayAabbByNodeId(args: {
  active: boolean
  aspectRatioMode: '16:9' | '9:16'
  fixedCardNodeIds: readonly string[]
  nodeById: ReadonlyMap<string, GraphNode>
  openRichMediaPanelNodeIds: readonly string[]
  openWidgetNodeIds: readonly string[]
}): Record<string, FlowOverlayNodeAabb> | undefined {
  if (!args.active) return undefined
  const out: Record<string, FlowOverlayNodeAabb> = {}
  for (const nodeId of args.fixedCardNodeIds) {
    const node = args.nodeById.get(nodeId)
    const center = readFinitePoint(node)
    if (!node || !center) continue
    const size = readStoryboardCardSize2d(node, args.aspectRatioMode)
    out[nodeId] = {
      minX: center.x - size.width / 2,
      minY: center.y - size.height / 2,
      maxX: center.x + size.width / 2,
      maxY: center.y + size.height / 2,
    }
  }
  for (const nodeId of args.openWidgetNodeIds) {
    if (out[nodeId]) continue
    const node = args.nodeById.get(nodeId)
    const center = readFinitePoint(node)
    if (!node || !center) continue
    const size = readStoryboardWidgetPlacementSize2d(node, args.aspectRatioMode)
    out[nodeId] = {
      minX: center.x - size.width / 2,
      minY: center.y - size.height / 2,
      maxX: center.x + size.width / 2,
      maxY: center.y + size.height / 2,
    }
  }
  for (const nodeId of args.openRichMediaPanelNodeIds) {
    const node = args.nodeById.get(nodeId)
    const topLeft = readFinitePoint(node)
    if (!node || !topLeft) continue
    const size = readStoryboardWidgetPlacementSize2d(node, args.aspectRatioMode)
    out[nodeId] = {
      minX: topLeft.x,
      minY: topLeft.y,
      maxX: topLeft.x + size.width,
      maxY: topLeft.y + size.height,
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

