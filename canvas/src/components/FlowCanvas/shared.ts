import type React from 'react'

import type { FlowNativeDrawArgs, FlowNativeRuntime, FlowOverlayNodeAabb } from '@/components/FlowCanvas/nativeRuntime'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import type { GraphSchema } from '@/lib/graph/schema'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { isFrontmatterFlowGraph } from '@/lib/graph/frontmatterMode'
import { filterGraphToFlowWidgetEligible } from '@/lib/graph/flowWidgetEligibility'

export const EMPTY_WIDGET_REGISTRY: WidgetRegistryEntry[] = []
export const EMPTY_STRING_ARRAY: string[] = []
export const EMPTY_BOOL_RECORD: Record<string, boolean> = {}
export const EMPTY_POS_RECORD: Record<string, { x: number; y: number }> = {}
export const FLOW_RESET_ZOOM_FLOOR_CACHE_EVENT = 'kg:flow:resetZoomFloorCache'

export function emitFlowResetZoomFloorCache(): void {
  if (typeof window === 'undefined') return
  try {
    const CustomEventCtor = typeof window.CustomEvent === 'function' ? window.CustomEvent : CustomEvent
    window.dispatchEvent(new CustomEventCtor(FLOW_RESET_ZOOM_FLOOR_CACHE_EVENT))
  } catch {
    void 0
  }
}

export function subscribeFlowResetZoomFloorCache(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => void 0
  const handle = () => {
    listener()
  }
  window.addEventListener(FLOW_RESET_ZOOM_FLOOR_CACHE_EVENT, handle as EventListener)
  return () => {
    window.removeEventListener(FLOW_RESET_ZOOM_FLOOR_CACHE_EVENT, handle as EventListener)
  }
}

export type FlowCanvasProps = {
  active?: boolean
  graphDataOverride?: GraphData | null
  mutationSourceGraphDataOverride?: GraphData | null
  graphDataRevisionOverride?: number
  canvas2dRendererOverride?: string
  suppressMediaOverlays?: boolean
  collisionDuringDrag?: boolean
  allowNodeDragOverride?: boolean
  exposeRuntimeRef?: (ref: React.MutableRefObject<FlowNativeRuntime | null>) => void
  onInteractionFrame?: () => void
  onOverlayInteractionFrame?: () => void
  hideSelectedNodeGlyph?: boolean
  hideSelectedNodePortHandles?: boolean
  hideNodeIds?: string[]
  hidePortHandleNodeIds?: string[]
  hideGroupIds?: string[]
  excludeRichMediaOverlayNodeIds?: string[]
  excludeNativeSceneNodeIds?: string[]
  overlayAabbByNodeId?: Record<string, FlowOverlayNodeAabb>
  flowWidgetPinnedByNodeIdOverride?: Record<string, boolean>
  flowWidgetStateGraphKeyOverride?: string | null
  storyboardCollectiveZoomBaselineKRef?: React.MutableRefObject<number | null>
  storyboardWidgetSurfaceId?: string
  forbidCircleNodes?: boolean
  onNodeChange?: (nodeId: string, patch: Partial<GraphNode>, sourceGraphData?: GraphData | null) => void
  onNodePropertiesChange?: (nodeId: string, patch: Record<string, unknown>, sourceGraphData?: GraphData | null) => void
  onNodeRemove?: (nodeId: string) => void
}

export type FlowCanvasMediaOverlayInteractionPolicy = {
  overlayPanActive: boolean
  headerDragActive: boolean
  resizeActive: boolean
  panelPointerEventsClassName: string
  capturePanelEvents: boolean
}

export function resolveFlowCanvasMediaOverlayInteractionPolicy(args: {
  rendererInteractionMode: boolean
  resizeMutationBlocked: boolean
}): FlowCanvasMediaOverlayInteractionPolicy {
  const rendererInteractionMode = args.rendererInteractionMode === true
  return {
    overlayPanActive: rendererInteractionMode,
    headerDragActive: rendererInteractionMode,
    resizeActive: rendererInteractionMode && args.resizeMutationBlocked !== true,
    panelPointerEventsClassName: 'pointer-events-auto',
    capturePanelEvents: true,
  }
}

export function isFlowCanvasRichMediaPropertyMutationBlocked(args: {
  workspaceMutationBlocked: boolean
  hasDelegatedPropertyMutation: boolean
}): boolean {
  return args.workspaceMutationBlocked === true && args.hasDelegatedPropertyMutation !== true
}

export type FlowCanvasInteractionRuntimeProps = {
  active: boolean
  storyboardWidgetSurfaceId?: string
  allowMutations: boolean
  schema: GraphSchema | null
  runtimeRef: React.MutableRefObject<FlowNativeRuntime | null>
  positionsDirtySinceCommitRef: React.MutableRefObject<boolean>
  selectedNodeIdsRef: React.MutableRefObject<string[]>
  selectedEdgeIdsRef: React.MutableRefObject<string[]>
  drawArgsRef: React.MutableRefObject<FlowNativeDrawArgs>
  scheduleFlowDraw: (opts?: { force?: boolean }) => void
  requestCommit: () => void
  handleInteractionFrame: () => void
  canvas2dRenderer: string
  graphDataForZoomRequests: GraphData | null
  viewportW: number
  viewportH: number
  storyboardWidgetReservedW: number
}

export function clampFinite(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo
  return Math.max(lo, Math.min(hi, v))
}

export function pickGraphDataForFlowRenderer(args: {
  graphData: GraphData | null
  effectiveFrontmatter: boolean
  canvas2dRenderer?: string
}): GraphData | null {
  if (!args.graphData) return null
  const storyboardWidgetFrontmatterFlowMode =
    String(args.canvas2dRenderer || '').trim() === 'storyboard'
    && isFrontmatterFlowGraph(args.graphData)
  if (storyboardWidgetFrontmatterFlowMode) {
    return filterGraphToFlowWidgetEligible(args.graphData)
  }
  return args.graphData
}
