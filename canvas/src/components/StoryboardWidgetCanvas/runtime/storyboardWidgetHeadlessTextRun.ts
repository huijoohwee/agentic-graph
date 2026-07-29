import {
  buildHeadlessResponseProviderPrompt,
  finalizeHeadlessResponseRun,
  HEADLESS_RESPONSE_RUN_SCHEMA,
  prepareHeadlessResponseRun,
  type HeadlessResponseRunResult,
  type HeadlessResponseSystemMessage,
} from '@/features/chat/headlessResponseCoordinator'
import { writeTextWidgetRunOutputArtifact } from '@/features/chat/richMediaRun'
import { UI_COPY, FLOW_TEXT_GENERATION_NODE_LABEL } from '@/lib/config'
import type { GraphNode } from '@/lib/graph/types'
import { buildStoryboardWidgetTextRunSourceState } from './storyboardWidgetTextRunSourceState'
import type { StoryboardWidgetTextRunOutputPublisher } from './storyboardWidgetTextRunOutputPublisher'

type TextOutputUpdater = (
  update: (properties: Record<string, unknown>) => Record<string, unknown>,
) => void

export async function runStoryboardWidgetHeadlessTextResponse(args: {
  sourceNodeId: string
  node: GraphNode
  authoredRequestText: string
  providerPrompt: string
  provider: string
  model: string | null
  workspacePath: string | null
  outputSourceProvenanceJson: string
  generateText: (
    prompt: string,
    onText?: (nextText: string) => void,
    systemMessages?: ReadonlyArray<HeadlessResponseSystemMessage>,
  ) => Promise<string>
  updateSource: TextOutputUpdater
  publishOutput: StoryboardWidgetTextRunOutputPublisher
  setLoading: (loading: boolean) => void
  reportFailure: (message: string, ttlMs?: number) => void
  reportSuccess: (message: string) => void
}): Promise<HeadlessResponseRunResult | null> {
  const textRunStartedAt = new Date().toISOString()
  const runId = `text-run-${textRunStartedAt}`
  const title = String(args.node.label || '').trim() || FLOW_TEXT_GENERATION_NODE_LABEL
  const prepared = await prepareHeadlessResponseRun({
    runId,
    source: { kind: 'widget', id: args.sourceNodeId },
    requestText: args.authoredRequestText || args.providerPrompt,
    providerText: args.providerPrompt,
    responseContract: 'plain',
    chatStorageTarget: 'chatHistory',
    provider: args.provider,
    model: args.model,
  })
  const projectResponse = (projection: {
    responseText: string
    loading: boolean
    artifactPath?: string | null
    runResult?: HeadlessResponseRunResult
  }) => {
    args.updateSource(properties => buildStoryboardWidgetTextRunSourceState({
      properties,
      loading: projection.loading,
      runAt: textRunStartedAt,
      responseText: projection.responseText,
      title,
      model: args.model,
      artifactPath: projection.artifactPath,
      outputSourceProvenanceJson: args.outputSourceProvenanceJson,
      runResult: projection.runResult,
    }))
    args.publishOutput({
      anchorNode: args.node,
      outputText: projection.responseText,
      title,
      model: args.model,
      outputPath: projection.artifactPath,
      loading: projection.loading,
      versionId: runId,
      versionCreatedAt: textRunStartedAt,
      connectCreatedOutputToAnchor: true,
      panelProperties: {
        outputSourceProvenanceJson: args.outputSourceProvenanceJson || undefined,
        headlessResponseRunSchema: HEADLESS_RESPONSE_RUN_SCHEMA,
        headlessResponseRunId: runId,
        headlessResponseRunStatus: projection.runResult?.status
          || (projection.loading ? 'streaming' : undefined),
        headlessResponseInvocationTokens: projection.runResult?.invocation.tokens.length
          ? projection.runResult.invocation.tokens
          : undefined,
        headlessResponseMcpTool: projection.runResult?.invocation.tool || undefined,
        headlessResponseMcpInvoked: projection.runResult?.invocation.mcpInvoked || undefined,
      },
    })
  }

  args.setLoading(true)
  args.updateSource(properties => buildStoryboardWidgetTextRunSourceState({
    properties,
    loading: true,
    runAt: textRunStartedAt,
    outputSourceProvenanceJson: args.outputSourceProvenanceJson,
    preserveExistingOutput: true,
  }))
  let lastPublishedText = ''
  const finalizeFailureState = () => {
    const runResult = finalizeHeadlessResponseRun({
      prepared,
      responseText: lastPublishedText,
      status: 'error',
      modelId: args.model,
    })
    if (lastPublishedText) {
      projectResponse({ responseText: lastPublishedText, loading: false, runResult })
      return
    }
    args.updateSource(properties => buildStoryboardWidgetTextRunSourceState({
      properties,
      loading: false,
      runAt: textRunStartedAt,
      outputSourceProvenanceJson: args.outputSourceProvenanceJson,
      runResult,
      preserveExistingOutput: true,
    }))
  }
  try {
    const responseText = await args.generateText(
      buildHeadlessResponseProviderPrompt(prepared),
      nextText => {
        if (nextText === lastPublishedText) return
        lastPublishedText = nextText
        projectResponse({ responseText: nextText, loading: true })
      },
      prepared.systemMessages,
    )
    if (!responseText) {
      finalizeFailureState()
      args.reportFailure(UI_COPY.storyboardWidgetRunFailedToast)
      return null
    }
    lastPublishedText = responseText
    const artifactPath = await writeTextWidgetRunOutputArtifact({
      workspacePath: args.workspacePath,
      node: args.node,
      output: responseText,
      variant: 'text-output',
    })
    const runResult = finalizeHeadlessResponseRun({
      prepared,
      responseText,
      modelId: args.model,
      artifactPath,
    })
    projectResponse({
      responseText: runResult.responseText,
      loading: false,
      artifactPath,
      runResult,
    })
    args.reportSuccess('Generated text output.')
    return runResult
  } catch (error) {
    finalizeFailureState()
    throw error
  } finally {
    args.setLoading(false)
  }
}
