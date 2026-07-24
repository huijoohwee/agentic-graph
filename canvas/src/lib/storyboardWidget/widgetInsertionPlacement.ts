import type { GraphData } from '@/lib/graph/types'
import { buildGraphDocumentMetaKey } from '@/lib/graph/graphMetaKey'
import { resolveScopedFlowWidgetNodeMap } from '@/lib/storyboardWidget/widgetStateScope'

export type StoryboardWidgetInsertionPlacementSnapshot = {
  pinnedByNodeId: Record<string, boolean>
  screenByNodeId: Record<string, { top: number; left: number }>
  worldByNodeId: Record<string, { x: number; y: number }>
}

export function captureStoryboardWidgetInsertionPlacement(args: {
  graphData: GraphData | null | undefined
  pinnedByGraphMetaKey?: Record<string, Record<string, boolean>> | null
  pinnedByNodeId?: Record<string, boolean> | null
  screenByGraphMetaKey?: Record<string, Record<string, { top: number; left: number }>> | null
  screenByNodeId?: Record<string, { top: number; left: number }> | null
  worldByGraphMetaKey?: Record<string, Record<string, { x: number; y: number }>> | null
  worldByNodeId?: Record<string, { x: number; y: number }> | null
}): StoryboardWidgetInsertionPlacementSnapshot {
  const graphMetaKey = buildGraphDocumentMetaKey(args.graphData || null)
  return {
    pinnedByNodeId: {
      ...resolveScopedFlowWidgetNodeMap({
        graphMetaKey,
        keyedByGraphMetaKey: args.pinnedByGraphMetaKey,
        globalByNodeId: args.pinnedByNodeId,
      }),
    },
    screenByNodeId: {
      ...resolveScopedFlowWidgetNodeMap({
        graphMetaKey,
        keyedByGraphMetaKey: args.screenByGraphMetaKey,
        globalByNodeId: args.screenByNodeId,
      }),
    },
    worldByNodeId: {
      ...resolveScopedFlowWidgetNodeMap({
        graphMetaKey,
        keyedByGraphMetaKey: args.worldByGraphMetaKey,
        globalByNodeId: args.worldByNodeId,
      }),
    },
  }
}

export function buildStoryboardWidgetInsertionPlacement(args: {
  snapshot: StoryboardWidgetInsertionPlacementSnapshot
  targetNodeId: string
  targetWorldPosition: { x: number; y: number }
  pinTargetInCanvas: boolean
}): StoryboardWidgetInsertionPlacementSnapshot {
  const targetNodeId = String(args.targetNodeId || '').trim()
  const pinnedByNodeId = { ...args.snapshot.pinnedByNodeId }
  const screenByNodeId = { ...args.snapshot.screenByNodeId }
  const worldByNodeId = { ...args.snapshot.worldByNodeId }
  if (!targetNodeId) return { pinnedByNodeId, screenByNodeId, worldByNodeId }

  pinnedByNodeId[targetNodeId] = args.pinTargetInCanvas
  if (args.pinTargetInCanvas) {
    delete screenByNodeId[targetNodeId]
    if (
      Number.isFinite(args.targetWorldPosition.x)
      && Number.isFinite(args.targetWorldPosition.y)
    ) {
      worldByNodeId[targetNodeId] = {
        x: args.targetWorldPosition.x,
        y: args.targetWorldPosition.y,
      }
    }
  }
  return { pinnedByNodeId, screenByNodeId, worldByNodeId }
}
