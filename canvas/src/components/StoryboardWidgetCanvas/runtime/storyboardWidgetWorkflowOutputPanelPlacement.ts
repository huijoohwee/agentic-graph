import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config'
import { normalizeGeneratedRichMediaTableProperties } from '@/features/rich-media/richMediaTablePersistence'
import { isCanonicalNodeIdEqual, resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import { readGraphNodeProperties } from '@/lib/cards/graphNodeCardFields'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { isPlainObject } from '@/lib/graph/value'
import { RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE } from '@/lib/render/richMediaPanelDefaults'
import { bumpStoryboardWidgetDraftGraphDataRevision } from '@/lib/storyboardWidget/storyboardWidgetDraftGraphData'
import {
  PROBE_TREE_OUTPUT_KEY,
} from './storyboardWidgetProbeTreeLayout'

export const STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION_PROPERTY =
  'workflowOutputPanelLayoutVersion' as const
export const STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION =
  'owned-anchor-v1' as const

const STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LEADING_GAP = Math.round(
  RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.height * 0.75,
)
const STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_COLUMN_GAP = Math.round(
  RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.height * 0.5,
)
const STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_OFFSET_X =
  RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.width + STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LEADING_GAP
const STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_COLUMN_STRIDE =
  RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.width + STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_COLUMN_GAP
const STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LEGACY_MAX_DELTA_X =
  STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_OFFSET_X + RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.width * 2
const STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LEGACY_MAX_DELTA_Y =
  RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.height * 4

const isTypedPropertyEnvelope = (
  value: unknown,
): value is Record<string, unknown> & { value: unknown } => (
  isPlainObject(value)
  && Object.prototype.hasOwnProperty.call(value, 'value')
  && (Object.prototype.hasOwnProperty.call(value, 'key') || Object.prototype.hasOwnProperty.call(value, 'type'))
)

const mergeStoryboardWidgetWorkflowPropertyValues = (
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> => {
  const next = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === 'undefined') {
      delete next[key]
      continue
    }
    next[key] = isTypedPropertyEnvelope(next[key])
      ? { ...next[key], value }
      : value
  }
  return normalizeGeneratedRichMediaTableProperties({
    nodeType: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    properties: next,
  })
}

export function mergeStoryboardWidgetWorkflowPropertyPatch(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const typedValues = isTypedPropertyEnvelope(current) && isPlainObject(current.value)
    ? current.value
    : null
  const nextValues = mergeStoryboardWidgetWorkflowPropertyValues(typedValues || current, patch)
  if (!typedValues) return nextValues

  const nextContainer: Record<string, unknown> = { ...current, value: nextValues }
  for (const key of Object.keys(patch)) {
    delete nextContainer[key]
  }
  return nextContainer
}

export function readStoryboardWidgetWorkflowString(value: unknown): string {
  const unwrapped = unwrapGraphCellValue(value)
  return typeof unwrapped === 'string' ? unwrapped.trim() : ''
}

export function resolveStoryboardWidgetWorkflowOutputPanelPosition(args: {
  anchorNode: GraphNode
  liveDraftGraphData: GraphData | null
  outputIndex?: number
  anchorPositionOverride?: { x: number; y: number } | null
  panelPositionOverride?: { x: number; y: number } | null
}): { x: number; y: number } {
  const liveAnchorNode = resolveGraphNodeByCanonicalId(
    args.liveDraftGraphData,
    readStoryboardWidgetWorkflowString(args.anchorNode.id),
  ) || args.anchorNode
  const anchorX = Number.isFinite(args.anchorPositionOverride?.x)
    ? Number(args.anchorPositionOverride?.x)
    : Number.isFinite(liveAnchorNode.x) ? (liveAnchorNode.x as number) : 0
  const anchorY = Number.isFinite(args.anchorPositionOverride?.y)
    ? Number(args.anchorPositionOverride?.y)
    : Number.isFinite(liveAnchorNode.y) ? (liveAnchorNode.y as number) : 0
  const outputIndex = typeof args.outputIndex === 'number' && Number.isFinite(args.outputIndex)
    ? Math.max(0, Math.floor(args.outputIndex))
    : 0
  return {
    x: anchorX
      + STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_OFFSET_X
      + outputIndex * STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_COLUMN_STRIDE,
    y: anchorY,
  }
}

export function normalizeStoryboardWidgetWorkflowOwnedRichMediaPanelPlacement(args: {
  anchorNode: GraphNode
  panelNodeId: string
  outputIndex?: number
  anchorPositionOverride?: { x: number; y: number } | null
  panelPositionOverride?: { x: number; y: number } | null
  forcePanelPosition?: boolean
  readLiveDraftGraphData: () => GraphData | null
  commitDraftGraphDataUpdate: (currentDraft: GraphData, nextDraft: GraphData) => void
}): boolean {
  const currentDraft = args.readLiveDraftGraphData()
  const anchorNodeId = readStoryboardWidgetWorkflowString(args.anchorNode.id)
  const panelNodeId = readStoryboardWidgetWorkflowString(args.panelNodeId)
  if (!currentDraft || !anchorNodeId || !panelNodeId) return false
  const panelNode = resolveGraphNodeByCanonicalId(currentDraft, panelNodeId)
  if (!panelNode || readStoryboardWidgetWorkflowString(panelNode.type) !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) return false

  const readableProperties = readGraphNodeProperties(panelNode)
  const hasExplicitPanelPosition = Number.isFinite(args.panelPositionOverride?.x)
    && Number.isFinite(args.panelPositionOverride?.y)
  const forcePanelPosition =
    args.forcePanelPosition === true
    && hasExplicitPanelPosition
  const outputKey = readStoryboardWidgetWorkflowString(readableProperties.workflowOutputKey)
  if (
    !isCanonicalNodeIdEqual(readableProperties.workflowOutputAnchorNodeId, anchorNodeId)
    || !outputKey
    || (outputKey === PROBE_TREE_OUTPUT_KEY && !forcePanelPosition)
  ) {
    return false
  }
  if (
    readStoryboardWidgetWorkflowString(
      readableProperties[STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION_PROPERTY],
    ) === STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION
    && !forcePanelPosition
  ) {
    return false
  }

  const expectedPosition = hasExplicitPanelPosition
    ? {
        x: Number(args.panelPositionOverride?.x),
        y: Number(args.panelPositionOverride?.y),
      }
    : resolveStoryboardWidgetWorkflowOutputPanelPosition({
        anchorNode: args.anchorNode,
        liveDraftGraphData: currentDraft,
        outputIndex: args.outputIndex,
        anchorPositionOverride: args.anchorPositionOverride,
      })
  const panelX = Number.isFinite(panelNode.x) ? (panelNode.x as number) : Number.NaN
  const panelY = Number.isFinite(panelNode.y) ? (panelNode.y as number) : Number.NaN
  const repairPosition = hasExplicitPanelPosition
    || !Number.isFinite(panelX)
    || !Number.isFinite(panelY)
    || Math.abs(panelX - expectedPosition.x) > STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LEGACY_MAX_DELTA_X
    || Math.abs(panelY - expectedPosition.y) > STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LEGACY_MAX_DELTA_Y
  const currentProperties = (panelNode.properties || {}) as Record<string, unknown>
  const nextProperties = mergeStoryboardWidgetWorkflowPropertyPatch(currentProperties, {
    [STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION_PROPERTY]:
      STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION,
  })
  const nextNodes = currentDraft.nodes.map(node => {
    if (!isCanonicalNodeIdEqual(node?.id, panelNodeId)) return node
    return {
      ...node,
      ...(repairPosition ? expectedPosition : {}),
      properties: nextProperties as never,
    }
  })
  args.commitDraftGraphDataUpdate(
    currentDraft,
    bumpStoryboardWidgetDraftGraphDataRevision({ ...currentDraft, nodes: nextNodes }),
  )
  return repairPosition
}
