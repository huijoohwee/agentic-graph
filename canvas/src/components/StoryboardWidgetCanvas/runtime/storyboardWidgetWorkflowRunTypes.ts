import type { GraphData, GraphNode } from '@/lib/graph/types'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { isFrontmatterFlowGraph } from '@/lib/graph/frontmatterMode'
import type { StoryboardCardMediaGraphPersistenceOptions } from './storyboardCardMediaGraphSource'
import type { UiToastInput } from '@/hooks/store/types'
import type { StoryboardWidgetRunExecutionAnchorSnapshot } from './storyboardWidgetRunExecutionAnchor'

export type StoryboardWidgetWorkflowNodeRunner = (nodeId: string, runOptions?: {
  allowCreateRichMediaPanel?: boolean
  suppressLayoutMutation?: boolean
  visitedNodeIds?: Set<string>
  propagateErrors?: boolean
  requireDurableMediaPersistence?: boolean
  nativeCrawlerRecovery?: boolean
  sourcePersistence?: StoryboardCardMediaGraphPersistenceOptions
}) => Promise<void>

export type StoryboardWidgetWorkflowNodeRunnerArgs = {
  baseGraphKind: string
  baseGraphData: GraphData | null
  readDraftGraphData: () => GraphData | null
  commitDraftGraphDataUpdate: (currentDraft: GraphData, nextDraft: GraphData) => void
  commitPublishedGraphData?: (graphData: GraphData) => void
  persistDraftGraphData: (graphData: GraphData, options?: StoryboardCardMediaGraphPersistenceOptions) => void | Promise<void>
  renderGraphDataOverride: GraphData | null
  markdownDocumentName: string | null
  markdownDocumentSourceUrl: string | null
  widgetRegistry: WidgetRegistryEntry[]
  appendDraftNode: (args: { id?: string | null; type: string; label?: string | null; x: number; y: number; properties?: Record<string, unknown> }) => string
  updateNode: (id: string, patch: Partial<GraphNode>) => void
  upsertUiToast: (args: UiToastInput) => void
  scheduleOverlayEdgeUpdate: () => void
  captureExecutionAnchor?: (nodeId: string) => StoryboardWidgetRunExecutionAnchorSnapshot | null
}

export function resolveStoryboardWidgetBaseGraphKind(graphData: GraphData | null | undefined): string {
  if (graphData && isFrontmatterFlowGraph(graphData)) return 'frontmatter-flow'
  const meta = (graphData?.metadata || {}) as Record<string, unknown>
  return String(meta.kind || '').trim() || String(graphData?.context || '').trim()
}
