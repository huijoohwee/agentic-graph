import { resolveStoryboardWidgetTextThinkingOptions } from './storyboardWidgetWorkflowTextThinking'
import {
  resolveStoryboardWidgetProbeTreeSelectedRunNodeFromContext,
} from './storyboardWidgetProbeTreeRunNode'
import { resolveStoryboardWidgetProbeTreeProviderRequestOptions } from './storyboardWidgetProbeTreeProviderRequest'
import { generateRunMarkdownWithProvider } from '@/features/chat/byteplusRunGeneration'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import type { GraphNode } from '@/lib/graph/types'
import type { StoryboardWidgetWorkflowNodeResolutionContext } from './storyboardWidgetRenderGraph'

export type StoryboardWidgetProbeTreeProviderRuntimeProperties = {
  chatProvider?: unknown
  chatAuthMode?: unknown
  chatApiKey?: unknown
  chatEndpointUrl?: unknown
  chatModel?: unknown
  chatTemperature?: unknown
  chatMaxCompletionTokens?: unknown
  chatServiceTier?: unknown
  chatReasoningEffort?: unknown
  chatThinkingType?: unknown
  chatThinkingJson?: unknown
  chatFrequencyPenalty?: unknown
  chatPresencePenalty?: unknown
  chatTopP?: unknown
}

export function resolveStoryboardWidgetProbeTreeChatRoute(args: {
  localProperties?: Record<string, unknown>
  resolvedProperties: Record<string, unknown>
  runtimeProperties: StoryboardWidgetProbeTreeProviderRuntimeProperties
}) {
  const readRouteValue = (key: 'chatProvider' | 'chatEndpointUrl' | 'chatModel'): string => (
    String(unwrapGraphCellValue(args.runtimeProperties[key]) || '').trim()
  )
  const localAuthMode = String(unwrapGraphCellValue(args.localProperties?.chatAuthMode) || '').trim()
  const runtimeAuthMode = String(unwrapGraphCellValue(args.runtimeProperties.chatAuthMode) || '').trim()
  const resolvedAuthMode = String(unwrapGraphCellValue(args.resolvedProperties.chatAuthMode) || '').trim()
  return {
    provider: readRouteValue('chatProvider'),
    endpointUrl: readRouteValue('chatEndpointUrl'),
    chatModel: readRouteValue('chatModel'),
    chatAuthMode: localAuthMode === 'byok' || runtimeAuthMode === 'byok'
      ? 'byok'
      : runtimeAuthMode || resolvedAuthMode || localAuthMode,
  }
}

export function prepareStoryboardWidgetProbeTreeTextGeneration(args: {
  requestedNodeId?: string
  fallbackNode: GraphNode
  resolutionContext?: StoryboardWidgetWorkflowNodeResolutionContext
  readInvocationText: (node: GraphNode) => string
  resolveInvocationTokenForNode: (node: GraphNode, invocationText: string) => string
}): { fallbackNode: GraphNode; invocationText: string } | null {
  const fallbackNode = args.resolutionContext && args.requestedNodeId
    ? resolveStoryboardWidgetProbeTreeSelectedRunNodeFromContext({
        context: args.resolutionContext,
        requestedNodeId: args.requestedNodeId,
        fallbackNode: args.fallbackNode,
      })
    : args.fallbackNode
  const invocationText = args.readInvocationText(fallbackNode)
  if (!args.resolveInvocationTokenForNode(fallbackNode, invocationText)) return null
  return { fallbackNode, invocationText }
}

export function buildStoryboardWidgetProbeTreeProviderInvocation(args: {
  invocationText: string
  textGeneration: {
    prompt: string
    formId: unknown
    localProperties: Record<string, unknown>
    resolvedProperties: Record<string, unknown>
    runtimeProperties: StoryboardWidgetProbeTreeProviderRuntimeProperties
  }
}): {
  chatModel: string
  generateProviderResponse: (prompt: string) => Promise<string | null>
} {
  const { invocationText } = args
  const { prompt, formId, localProperties, resolvedProperties, runtimeProperties } = args.textGeneration
  const readResolvedProviderValue = (
    key: keyof StoryboardWidgetProbeTreeProviderRuntimeProperties,
  ): unknown => {
    const localValue = unwrapGraphCellValue(resolvedProperties[key])
    return localValue == null || localValue === ''
      ? unwrapGraphCellValue(runtimeProperties[key])
      : localValue
  }
  const resolvedThinking = resolveStoryboardWidgetTextThinkingOptions({
    formId,
    localProperties,
    prompt: prompt || invocationText,
    resolvedMaxCompletionTokens: readResolvedProviderValue('chatMaxCompletionTokens'),
    resolvedReasoningEffort: readResolvedProviderValue('chatReasoningEffort'),
    resolvedThinkingJson: readResolvedProviderValue('chatThinkingJson'),
    resolvedThinkingType: readResolvedProviderValue('chatThinkingType'),
  })
  const { provider, endpointUrl, chatModel, chatAuthMode } = resolveStoryboardWidgetProbeTreeChatRoute({
    localProperties,
    resolvedProperties,
    runtimeProperties,
  })
  const generateProviderResponse = async (refinementPrompt: string): Promise<string | null> => {
    try {
      const providerRequestOptions = resolveStoryboardWidgetProbeTreeProviderRequestOptions({
        prompt: refinementPrompt,
        chatMaxCompletionTokens: resolvedThinking.chatMaxCompletionTokens,
        chatReasoningEffort: resolvedThinking.chatReasoningEffort,
      })
      return await generateRunMarkdownWithProvider({
        config: {
          provider,
          endpointUrl,
          apiKey: chatAuthMode === 'byok'
            ? String(unwrapGraphCellValue(runtimeProperties.chatApiKey) || '')
            : '',
          chatModel,
        },
        prompt: refinementPrompt,
        options: {
          chatTemperature: readResolvedProviderValue('chatTemperature'),
          chatMaxCompletionTokens: providerRequestOptions.chatMaxCompletionTokens,
          chatServiceTier: readResolvedProviderValue('chatServiceTier'),
          chatStream: false,
          chatReasoningEffort: providerRequestOptions.chatReasoningEffort,
          chatThinkingType: resolvedThinking.chatThinkingType,
          chatThinkingJson: resolvedThinking.chatThinkingJson,
          chatFrequencyPenalty: readResolvedProviderValue('chatFrequencyPenalty'),
          chatPresencePenalty: readResolvedProviderValue('chatPresencePenalty'),
          chatTopP: readResolvedProviderValue('chatTopP'),
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '')
      throw new Error(`${provider || 'unknown provider'} / ${chatModel || 'unknown model'}: ${message}`)
    }
  }
  return { chatModel, generateProviderResponse }
}
