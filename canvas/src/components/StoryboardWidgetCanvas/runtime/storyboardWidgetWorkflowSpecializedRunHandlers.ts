import {
  buildTextWidgetOutputPatch,
  clearRichMediaOutputProperties,
  writeTextWidgetRunOutputArtifact,
} from '@/features/chat/richMediaRun'
import { runShowrunnerWidgetProperties } from '@/features/ai-showrunner/showrunnerFlowNode'
import { runSwarmPredictionWidgetProperties } from '@/features/swarm-prediction/swarmPredictionWidget'
import { fetchYouTubeTranscriptMarkdown } from '@/features/transcription/youtubeTranscriptMarkdown'
import {
  FLOW_SHOWRUNNER_NODE_TYPE_ID,
} from '@/features/ai-showrunner/showrunnerFlowNode'
import {
  FLOW_SWARM_PREDICTION_NODE_TYPE_ID,
  FLOW_VIDEO_TRANSCRIBER_NODE_LABEL,
  FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID,
  UI_COPY,
} from '@/lib/config'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import {
  resolveStoryboardWidgetWorkflowConnectedValuesInput,
} from './storyboardWidgetWorkflowRunInputs'
import type { StoryboardWidgetWorkflowNodeResolutionContext } from './storyboardWidgetRenderGraph'
import type { StoryboardWidgetTextRunOutputPublisher } from './storyboardWidgetTextRunOutputPublisher'
import type { StoryboardWidgetWorkflowNodeRunnerArgs } from './storyboardWidgetWorkflowRunTypes'

type RunOutputUpdater = (
  buildPatch: (nodeProps: Record<string, unknown>) => Record<string, unknown>,
) => void

type RunLoadingSetter = (
  args: { loading: boolean; kind?: 'text' | 'image' | 'video' | 'audio' },
) => void

export async function runStoryboardWidgetSpecializedWorkflowNode(args: {
  id: string
  node: GraphNode
  rawNodeProperties: Record<string, unknown>
  context: StoryboardWidgetWorkflowNodeResolutionContext
  graphForRun: GraphData
  writableNodeId: string
  widgetRegistry: StoryboardWidgetWorkflowNodeRunnerArgs['widgetRegistry']
  activeWorkspacePath: string
  updateRunOutputForKnownNodeIds: RunOutputUpdater
  setRunLoadingStateForKnownNodeIds: RunLoadingSetter
  publishTextRunOutputToRichMediaPanel: StoryboardWidgetTextRunOutputPublisher
  reportNodeRunFailure: (message: string, ttlMs?: number) => void
  upsertUiToast: StoryboardWidgetWorkflowNodeRunnerArgs['upsertUiToast']
}): Promise<boolean> {
  const nodeType = String(args.node.type || '').trim()
  if (nodeType === FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID) {
    const sourceUrlRaw = typeof args.rawNodeProperties.sourceUrl === 'string'
      ? args.rawNodeProperties.sourceUrl.trim()
      : ''
    const langRaw = typeof args.rawNodeProperties.languageHint === 'string'
      ? args.rawNodeProperties.languageHint.trim()
      : ''
    if (!sourceUrlRaw) {
      args.reportNodeRunFailure(
        'Import a video URL before running the Video Transcriber Widget.',
        2400,
      )
      return true
    }
    args.setRunLoadingStateForKnownNodeIds({ loading: true, kind: 'text' })
    try {
      const converted = await fetchYouTubeTranscriptMarkdown({
        url: sourceUrlRaw,
        ...(langRaw ? { lang: langRaw } : {}),
      })
      if (!converted) {
        args.reportNodeRunFailure(UI_COPY.storyboardWidgetRunFailedToast)
        return true
      }
      if ('error' in converted) {
        args.reportNodeRunFailure(
          converted.error.trim()
            ? converted.error.trim()
            : UI_COPY.storyboardWidgetRunFailedToast,
        )
        return true
      }
      const nodeTitle = args.node.label || FLOW_VIDEO_TRANSCRIBER_NODE_LABEL
      const resolvedSourceUrl = String(converted.sourceUrl || sourceUrlRaw).trim() || sourceUrlRaw
      const outputText = String(converted.markdown || '')
      const outputPath = await writeTextWidgetRunOutputArtifact({
        workspacePath: args.activeWorkspacePath || null,
        node: args.node,
        output: outputText,
        variant: 'transcript',
      })
      args.updateRunOutputForKnownNodeIds(nodeProps => ({
        ...clearRichMediaOutputProperties(nodeProps),
        sourceUrl: resolvedSourceUrl,
        ...(langRaw ? { languageHint: langRaw } : { languageHint: '' }),
        ...buildTextWidgetOutputPatch({
          output: outputText,
          title: nodeTitle,
          model: 'youtube',
          outputPath,
        }),
        outputSourceUrl: resolvedSourceUrl,
      }))
      args.publishTextRunOutputToRichMediaPanel({
        anchorNode: args.node,
        outputText,
        title: nodeTitle,
        model: 'youtube',
        sourceUrl: resolvedSourceUrl,
        outputPath,
        loading: false,
      })
      args.upsertUiToast({
        id: `storyboard-widget-run-${args.id}`,
        kind: 'neutral',
        message: 'Transcribed video transcript.',
        ttlMs: 2400,
      })
    } finally {
      args.setRunLoadingStateForKnownNodeIds({ loading: false })
    }
    return true
  }

  if (nodeType === FLOW_SWARM_PREDICTION_NODE_TYPE_ID) {
    const connectedValuesInput = resolveStoryboardWidgetWorkflowConnectedValuesInput({
      context: args.context,
      graphForRun: args.graphForRun,
      writableNodeId: args.writableNodeId,
      registry: args.widgetRegistry,
    })
    const connectedValuesBySchemaPath =
      connectedValuesInput?.connectedValuesByNodeId.get(connectedValuesInput.targetNodeId)
    const readConnectedProperty = (schemaPath: string, propertyKey: string): unknown => {
      const connected = connectedValuesBySchemaPath?.[schemaPath]?.value
      return typeof connected === 'undefined' || connected === null
        ? args.rawNodeProperties[propertyKey]
        : connected
    }
    args.setRunLoadingStateForKnownNodeIds({ loading: true, kind: 'text' })
    try {
      const outputProperties = runSwarmPredictionWidgetProperties({
        ...args.rawNodeProperties,
        scenarioTitle: readConnectedProperty('properties.scenarioTitle', 'scenarioTitle'),
        seedSignalsJson: readConnectedProperty('properties.seedSignalsJson', 'seedSignalsJson'),
        agentPopulationJson: readConnectedProperty(
          'properties.agentPopulationJson',
          'agentPopulationJson',
        ),
        interventionsJson: readConnectedProperty('properties.interventionsJson', 'interventionsJson'),
      })
      args.updateRunOutputForKnownNodeIds(nodeProps => ({
        ...clearRichMediaOutputProperties(nodeProps),
        output: outputProperties.output,
        imageUrl: outputProperties.imageUrl,
        predictionScore: outputProperties.predictionScore,
        confidenceScore: outputProperties.confidenceScore,
        eventLogJson: outputProperties.eventLogJson,
        metricsJson: outputProperties.metricsJson,
        swarmPredictionRunId: outputProperties.swarmPredictionRunId,
        outputMimeType: 'text/markdown; charset=utf-8',
        outputModel: 'agentic-graph-swarm-prediction',
        lastRunAt: new Date().toISOString(),
      }))
      args.upsertUiToast({
        id: `storyboard-widget-run-${args.id}`,
        kind: 'neutral',
        message: 'Ran swarm prediction.',
        ttlMs: 2400,
      })
    } finally {
      args.setRunLoadingStateForKnownNodeIds({ loading: false })
    }
    return true
  }

  if (nodeType !== FLOW_SHOWRUNNER_NODE_TYPE_ID) return false
  const connectedValuesInput = resolveStoryboardWidgetWorkflowConnectedValuesInput({
    context: args.context,
    graphForRun: args.graphForRun,
    writableNodeId: args.writableNodeId,
    registry: args.widgetRegistry,
  })
  const connectedValuesBySchemaPath =
    connectedValuesInput?.connectedValuesByNodeId.get(connectedValuesInput.targetNodeId)
  const readConnectedProperty = (schemaPath: string, propertyKey: string): unknown => {
    const connected = connectedValuesBySchemaPath?.[schemaPath]?.value
    return typeof connected === 'undefined' || connected === null
      ? args.rawNodeProperties[propertyKey]
      : connected
  }
  args.setRunLoadingStateForKnownNodeIds({ loading: true, kind: 'text' })
  try {
    const outputProperties = await runShowrunnerWidgetProperties({
      ...args.rawNodeProperties,
      brief_path: readConnectedProperty('properties.brief_path', 'brief_path'),
      brief_markdown: readConnectedProperty('properties.brief_markdown', 'brief_markdown'),
      run_id: readConnectedProperty('properties.run_id', 'run_id'),
      dry_run: readConnectedProperty('properties.dry_run', 'dry_run'),
    })
    args.updateRunOutputForKnownNodeIds(nodeProps => ({
      ...clearRichMediaOutputProperties(nodeProps),
      run_id: outputProperties.run_id,
      run_status: outputProperties.run_status,
      latest_artifact_path: outputProperties.latest_artifact_path,
      token_spend_summary: outputProperties.token_spend_summary,
      output: outputProperties.token_spend_summary,
      outputMimeType: 'application/json; charset=utf-8',
      outputModel: 'agentic-graph-ai-showrunner',
      lastRunAt: new Date().toISOString(),
    }))
    args.upsertUiToast({
      id: `storyboard-widget-run-${args.id}`,
      kind: 'neutral',
      message: 'Ran AI Showrunner.',
      ttlMs: 2400,
    })
  } finally {
    args.setRunLoadingStateForKnownNodeIds({ loading: false })
  }
  return true
}
