import { useGraphStore } from '@/hooks/useGraphStore'
import { withGlobalEdgeType } from '@/lib/graph/edgeTypes'
import { isFrontmatterFlowGraph } from '@/lib/graph/frontmatterMode'
import { buildGraphMetaKeyIgnoringPending } from '@/lib/graph/graphMetaKey'
import { readFrontmatterFlowRenderSettings } from '@/lib/graph/frontmatterFlowSettings'
import type { GraphData } from '@/lib/graph/types'
import { applyCanvasFrontmatterPreset } from './canvasFrontmatterPreset'
import type { CanvasWorkspaceFrontmatterPreset } from '@/lib/markdown/frontmatter'

const FRONTMATTER_FLOW_CANVAS_RENDER_MODE = '2d' as const
const FRONTMATTER_FLOW_CANVAS_2D_RENDERER = 'storyboard' as const
const FRONTMATTER_FLOW_DOCUMENT_MODE = 'document' as const

const syncFrontmatterFlowSchemaEdgeType = (graphData: GraphData): boolean => {
  const settings = readFrontmatterFlowRenderSettings(graphData)
  if (!settings) return false
  const store = useGraphStore.getState()
  const current = store.schema
  const nextSchema = withGlobalEdgeType(current, settings.edgeType)
  if (nextSchema === current) return false
  store.setSchema(nextSchema)
  return true
}

export const applyFrontmatterFlowImportModes = (
  graphData: GraphData | null | undefined,
  opts: {
    applyViewPreset?: boolean
    resetWidgetLayout?: boolean
    preset?: CanvasWorkspaceFrontmatterPreset | null
    rawText?: string | null
    preserveLiveSharedXrSurface?: boolean
  } = {},
): boolean => {
  if (!graphData || !isFrontmatterFlowGraph(graphData)) return false
  if (opts.applyViewPreset !== false) {
    applyCanvasFrontmatterPreset({
      graphData,
      rawText: opts.rawText,
      preset: opts.preset,
      defaultCanvasRenderMode: FRONTMATTER_FLOW_CANVAS_RENDER_MODE,
      defaultCanvas2dRenderer: FRONTMATTER_FLOW_CANVAS_2D_RENDERER,
      defaultDocumentSemanticMode: FRONTMATTER_FLOW_DOCUMENT_MODE,
      defaultFrontmatterModeEnabled: true,
      disableMultiDimTableMode: true,
      ...(opts.preserveLiveSharedXrSurface === true ? { preserveLiveSharedXrSurface: true } : {}),
    })
    syncFrontmatterFlowSchemaEdgeType(graphData)
  }
  const graphKey = buildGraphMetaKeyIgnoringPending(graphData)
  useGraphStore.setState(prev => {
    if (opts.resetWidgetLayout === false) return prev
    const prevState = prev as unknown as {
      flowWidgetPinnedByNodeId?: Record<string, boolean>
      flowWidgetPinnedByNodeIdByGraphMetaKey?: Record<string, Record<string, boolean>>
      flowWidgetPosByNodeId?: Record<string, { top: number; left: number }>
      flowWidgetPosByNodeIdByGraphMetaKey?: Record<string, Record<string, { top: number; left: number }>>
      flowWidgetWorldPosByNodeId?: Record<string, { x: number; y: number }>
      flowWidgetWorldPosByNodeIdByGraphMetaKey?: Record<string, Record<string, { x: number; y: number }>>
    }
    const currentPinned = prevState.flowWidgetPinnedByNodeId || {}
    const currentPinnedByKey = prevState.flowWidgetPinnedByNodeIdByGraphMetaKey || {}
    const currentPos = prevState.flowWidgetPosByNodeId || {}
    const currentPosByKey = prevState.flowWidgetPosByNodeIdByGraphMetaKey || {}
    const currentWorld = prevState.flowWidgetWorldPosByNodeId || {}
    const currentWorldByKey = prevState.flowWidgetWorldPosByNodeIdByGraphMetaKey || {}
    const hasGlobalPinned = Object.keys(currentPinned).length > 0
    const hasKeyedPinned = graphKey ? Object.keys(currentPinnedByKey[graphKey] || {}).length > 0 : false
    const hasGlobalPos = Object.keys(currentPos).length > 0
    const hasKeyedPos = graphKey ? Object.keys(currentPosByKey[graphKey] || {}).length > 0 : false
    const hasGlobalWorld = Object.keys(currentWorld).length > 0
    const hasKeyedWorld = graphKey ? Object.keys(currentWorldByKey[graphKey] || {}).length > 0 : false
    if (!hasGlobalPinned && !hasKeyedPinned && !hasGlobalPos && !hasKeyedPos && !hasGlobalWorld && !hasKeyedWorld) return prev
    const nextPinnedByKey = graphKey ? { ...currentPinnedByKey, [graphKey]: {} } : currentPinnedByKey
    const nextPosByKey = graphKey ? { ...currentPosByKey, [graphKey]: {} } : currentPosByKey
    const nextWorldByKey = graphKey ? { ...currentWorldByKey, [graphKey]: {} } : currentWorldByKey
    // Explicit frontmatter-flow imports own the landing layout; passive Source
    // Files switches keep the keyed graph layout state intact.
    return graphKey
      ? {
          flowWidgetPinnedByNodeId: {},
          flowWidgetPinnedByNodeIdByGraphMetaKey: nextPinnedByKey,
          flowWidgetPosByNodeId: {},
          flowWidgetPosByNodeIdByGraphMetaKey: nextPosByKey,
          flowWidgetWorldPosByNodeId: {},
          flowWidgetWorldPosByNodeIdByGraphMetaKey: nextWorldByKey,
        }
      : {
          flowWidgetPinnedByNodeId: {},
          flowWidgetPosByNodeId: {},
          flowWidgetWorldPosByNodeId: {},
        }
  })
  // Returning true here avoids downstream fallback preset replays when the
  // effective state is already aligned and nothing had to mutate this frame.
  return true
}
