import {
  buildTextWidgetOutputPatch,
  clearRichMediaOutputProperties,
} from '@/features/chat/richMediaRun'
import {
  toAnnotationPreviewSrcDoc,
  toMarkdownSummary,
} from '@/features/visual-annotation-engine'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { resolveStoryboardWidgetWorkflowDownstreamRunTargetIds } from './storyboardWidgetWorkflowDownstreamRunTargets'
import {
  ensureStoryboardWidgetWorkflowRichMediaPanelNodeId,
  ensureStoryboardWidgetWorkflowOutputEdge,
} from './storyboardWidgetWorkflowRichMediaPanel'
import type { StoryboardWidgetWorkflowNodeResolutionContext } from './storyboardWidgetRenderGraph'
import type { StoryboardWidgetAnnotationRunOutputPublisher } from './storyboardWidgetWorkflowPublicationContract'

export function createStoryboardWidgetAnnotationRunOutputPublisher(args: {
  context: StoryboardWidgetWorkflowNodeResolutionContext
  graphForRun: GraphData
  allowCreateRichMediaPanel: boolean
  withRunLayoutMutationGuard: <T>(run: () => T) => T
  readLiveDraftGraphData: () => GraphData | null
  appendDraftNode: (args: {
    id?: string | null
    type: string
    label?: string | null
    x: number
    y: number
    properties?: Record<string, unknown>
  }) => string
  commitDraftGraphDataUpdate: (currentDraft: GraphData, nextDraft: GraphData) => void
  scheduleWorkflowOutputEdgeRefresh: () => void
  resolveNodeByIdAcrossGraphs: (candidateId: string) => GraphNode | null
  resolveMaterializationPosition: () => { x: number; y: number } | null
  applyPublishedPanelPatch: (
    panelNodeId: string,
    patch: Record<string, unknown>,
  ) => void
}): StoryboardWidgetAnnotationRunOutputPublisher {
  return panelArgs => {
    const result = panelArgs.result
    const jsonText = JSON.stringify(result, null, 2)
    const summaryText = result.ok === true ? toMarkdownSummary(result) : [
      '## Annotation Error',
      '',
      `- code: ${result.errorCode}`,
      ...(result.modelId ? [`- modelId: ${result.modelId}`] : []),
      ...(result.field ? [`- field: ${result.field}`] : []),
      ...(result.reason ? [`- reason: ${result.reason}`] : []),
      '',
      '```json',
      jsonText,
      '```',
    ].join('\n')
    const outputText = result.ok === true
      ? `${summaryText}\n\n## Annotation JSON\n\n\`\`\`json\n${jsonText}\n\`\`\``
      : summaryText
    args.withRunLayoutMutationGuard(() => {
      const downstreamPanelTargetIds = resolveStoryboardWidgetWorkflowDownstreamRunTargetIds({
        node: panelArgs.anchorNode,
        graphData: args.graphForRun,
      }).filter(targetId => (
        String(args.resolveNodeByIdAcrossGraphs(targetId)?.type || '').trim()
          === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
      ))
      const panelNodeIds = downstreamPanelTargetIds.length > 0
        ? downstreamPanelTargetIds
        : [ensureStoryboardWidgetWorkflowRichMediaPanelNodeId({
          context: args.context,
          graphForRun: args.graphForRun,
          allowCreateRichMediaPanel: args.allowCreateRichMediaPanel,
          anchorNode: panelArgs.anchorNode,
          readLiveDraftGraphData: args.readLiveDraftGraphData,
          materializationPosition: args.resolveMaterializationPosition(),
          appendDraftNode: args.appendDraftNode,
        })].filter((value): value is string => (
          typeof value === 'string' && value.trim().length > 0
        ))
      for (const panelNodeId of panelNodeIds) {
        ensureStoryboardWidgetWorkflowOutputEdge({
          anchorNodeId: String(panelArgs.anchorNode.id || '').trim(),
          panelNodeId,
          readLiveDraftGraphData: args.readLiveDraftGraphData,
          commitDraftGraphDataUpdate: args.commitDraftGraphDataUpdate,
          scheduleWorkflowOutputEdgeRefresh: args.scheduleWorkflowOutputEdgeRefresh,
        })
        const patch: Record<string, unknown> = {
          ...clearRichMediaOutputProperties({}),
          ...buildTextWidgetOutputPatch({
            output: outputText,
            title: panelArgs.anchorNode.label || 'Annotation Engine',
            model: result.modelId || 'annotation',
            outputPath: result.ok === true ? result.outputPath : null,
          }),
          ...(result.ok === true ? { outputSrcDoc: toAnnotationPreviewSrcDoc(result) } : {}),
          annotationId: result.ok === true ? result.annotationId : undefined,
          annotationSchemaVersion: result.ok === true ? result.schemaVersion : undefined,
          renderErrorCode: result.ok === false ? result.errorCode : undefined,
          renderErrorReason: result.ok === false ? result.reason : undefined,
          richMediaActiveTab: result.ok === true ? 'auto' : 'text',
          lastRunAt: new Date().toISOString(),
        }
        args.applyPublishedPanelPatch(panelNodeId, patch)
      }
    })
  }
}
