import { resolveStoryboardWidgetVisibleViewport } from '@/components/FlowCanvas/storyboardWidgetZoomViewport'
import { isStoryboardFixedCardOwnedNode } from '@/components/StoryboardWidgetCanvas/storyboardCardOwnership2d'
import {
  readDefaultStoryboardCardSize2d,
  readStoryboardCardSize2d,
} from '@/components/StoryboardWidgetCanvas/storyboardCardPlacements2d'
import { buildStoryboardWidgetRunExecutionAnchorSnapshot } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRunExecutionAnchor'
import { useGraphStore } from '@/hooks/useGraphStore'
import { resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import { buildGraphDocumentMetaKey } from '@/lib/graph/graphMetaKey'
import { isFrontmatterFlowGraph } from '@/lib/graph/frontmatterMode'
import type { GraphData } from '@/lib/graph/types'
import { captureStoryboardWidgetInsertionPlacement } from '@/lib/storyboardWidget/widgetInsertionPlacement'
import {
  resolveEffectiveFlowWidgetPinnedInCanvas,
  shouldUseStoryboardWidgetFloatingScreenAuthority,
} from '@/lib/storyboardWidget/widgetPlacementAuthority'

type Point = { x: number; y: number }
type Transform = { k: number; x: number; y: number }
type ScreenRect = { left: number; top: number; width: number; height: number }

export function captureStoryboardWidgetRunExecutionAnchor(args: {
  graphData: GraphData | null
  rawNodeId: string
  storyboardWidgetSurfaceId: string
  viewportW: number
  viewportH: number
  getLiveNodeWorldPos: (nodeId: string) => Point | null
  getLiveZoomTransform: () => Transform | null
  getRenderedOverlayRectForNode: (nodeId: string) => ScreenRect | null
  getRenderedZoomTransform: () => Transform | null
}) {
  const requestedNodeId = String(args.rawNodeId || '').trim()
  const node = resolveGraphNodeByCanonicalId(args.graphData, requestedNodeId)
  const nodeId = String(node?.id || requestedNodeId).trim()
  if (!args.graphData || !node || !nodeId) return null
  const state = useGraphStore.getState() as ReturnType<typeof useGraphStore.getState> & {
    flowWidgetPinnedByNodeIdByGraphMetaKey?: Record<string, Record<string, boolean>>
    flowWidgetPosByNodeId?: Record<string, { top: number; left: number }>
    flowWidgetPosByNodeIdByGraphMetaKey?: Record<string, Record<string, { top: number; left: number }>>
    flowWidgetWorldPosByNodeId?: Record<string, Point>
    flowWidgetWorldPosByNodeIdByGraphMetaKey?: Record<string, Record<string, Point>>
  }
  const placement = captureStoryboardWidgetInsertionPlacement({
    graphData: args.graphData,
    pinnedByGraphMetaKey: state.flowWidgetPinnedByNodeIdByGraphMetaKey,
    pinnedByNodeId: state.flowWidgetPinnedByNodeId,
    screenByGraphMetaKey: state.flowWidgetPosByNodeIdByGraphMetaKey,
    screenByNodeId: state.flowWidgetPosByNodeId,
    worldByGraphMetaKey: state.flowWidgetWorldPosByNodeIdByGraphMetaKey,
    worldByNodeId: state.flowWidgetWorldPosByNodeId,
  })
  const graphMetaKind = isFrontmatterFlowGraph(args.graphData)
    ? 'frontmatter-flow'
    : String((args.graphData.metadata as Record<string, unknown> | undefined)?.kind || '').trim()
  const pinnedInCanvas = resolveEffectiveFlowWidgetPinnedInCanvas({
    graphMetaKind,
    node,
    pinnedValue: placement.pinnedByNodeId[nodeId],
  })
  const fixedCardSize = isStoryboardFixedCardOwnedNode(node)
    ? readStoryboardCardSize2d(node, state.strybldrStoryboardCardAspectMode)
    : null
  return buildStoryboardWidgetRunExecutionAnchorSnapshot({
    nodeId,
    graphMetaKey: buildGraphDocumentMetaKey(args.graphData),
    graphPosition: { x: node.x, y: node.y },
    liveWorldPosition: args.getLiveNodeWorldPos(nodeId),
    storedWorldPosition: placement.worldByNodeId[nodeId],
    storedScreenPosition: placement.screenByNodeId[nodeId],
    renderedScreenRect: args.getRenderedOverlayRectForNode(nodeId),
    defaultFixedCardSize: readDefaultStoryboardCardSize2d(state.strybldrStoryboardCardAspectMode),
    screenAuthority: shouldUseStoryboardWidgetFloatingScreenAuthority({
      graphMetaKind,
      pinnedInCanvas,
      storyboardWidgetSurfaceId: args.storyboardWidgetSurfaceId,
    }),
    worldPositionMode: fixedCardSize ? 'center' : 'top-left',
    worldPositionSize: fixedCardSize,
    transform: args.getRenderedZoomTransform() || args.getLiveZoomTransform() || { k: 1, x: 0, y: 0 },
    visibleViewport: resolveStoryboardWidgetVisibleViewport({
      storyboardWidgetSurfaceId: args.storyboardWidgetSurfaceId,
      viewportW: args.viewportW,
      viewportH: args.viewportH,
    }),
  })
}
