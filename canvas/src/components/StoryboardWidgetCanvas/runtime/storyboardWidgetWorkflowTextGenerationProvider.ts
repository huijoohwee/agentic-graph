import { generateRunMarkdownWithProvider, type RunTextGenerationOptions } from '@/features/chat/byteplusRunGeneration'
import { resolveSubmitRuntimeFriendlyMessage } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitErrors'
import { RunTextProviderIncompleteError } from '@/features/chat/runTextProviderResponse'
import type { GraphState } from '@/hooks/useGraphStore'
import { isResponsesEndpointUrl } from '@/lib/chatEndpoint'
import { resolveStoryboardWidgetTextThinkingOptions } from './storyboardWidgetWorkflowTextThinking'

export async function generateStoryboardWidgetTextWithProvider(args: {
  properties: Record<string, unknown>
  store: GraphState
  formId: unknown
  localProperties: Record<string, unknown>
  prompt: string
  onText?: (nextText: string) => void
  systemMessages?: ReadonlyArray<{ role: 'system'; content: string }>
}): Promise<string> {
  const { properties, store } = args
  const thinkingOptions = resolveStoryboardWidgetTextThinkingOptions({
    formId: args.formId,
    localProperties: args.localProperties,
    prompt: args.prompt,
    resolvedMaxCompletionTokens: properties.chatMaxCompletionTokens ?? store.chatMaxCompletionTokens,
    resolvedReasoningEffort: properties.chatReasoningEffort ?? store.chatReasoningEffort,
    resolvedThinkingJson: properties.chatThinkingJson ?? store.chatThinkingJson,
    resolvedThinkingType: properties.chatThinkingType ?? store.chatThinkingType,
  })
  const provider = properties.chatProvider || store.chatProvider
  const endpointUrl = properties.chatEndpointUrl || store.chatEndpointUrl
  const authMode = (properties.chatAuthMode || store.chatAuthMode) === 'byok' ? 'byok' : 'serverManaged'
  const config = {
    provider,
    endpointUrl,
    apiKey: authMode === 'byok' ? store.chatApiKey : '',
    chatModel: properties.chatModel || store.chatModel,
  }
  const options: RunTextGenerationOptions = {
    chatTemperature: properties.chatTemperature ?? store.chatTemperature,
    chatMaxCompletionTokens: thinkingOptions.chatMaxCompletionTokens,
    chatServiceTier: properties.chatServiceTier ?? store.chatServiceTier,
    chatStream: args.onText ? properties.chatStream ?? store.chatStream : false,
    chatMessagesJson: properties.chatMessagesJson ?? store.chatMessagesJson,
    chatReasoningEffort: thinkingOptions.chatReasoningEffort,
    chatThinkingType: thinkingOptions.chatThinkingType,
    chatThinkingJson: thinkingOptions.chatThinkingJson,
    chatFrequencyPenalty: properties.chatFrequencyPenalty ?? store.chatFrequencyPenalty,
    chatPresencePenalty: properties.chatPresencePenalty ?? store.chatPresencePenalty,
    chatTopP: properties.chatTopP ?? store.chatTopP,
    chatLogprobs: properties.chatLogprobs ?? store.chatLogprobs,
    chatTopLogprobs: properties.chatTopLogprobs ?? store.chatTopLogprobs,
    chatParallelToolCalls: properties.chatParallelToolCalls ?? store.chatParallelToolCalls,
    chatStopJson: properties.chatStopJson ?? store.chatStopJson,
    chatStreamOptionsJson: properties.chatStreamOptionsJson ?? store.chatStreamOptionsJson,
    chatResponseFormatJson: properties.chatResponseFormatJson ?? store.chatResponseFormatJson,
    chatLogitBiasJson: properties.chatLogitBiasJson ?? store.chatLogitBiasJson,
    chatToolsJson: properties.chatToolsJson ?? store.chatToolsJson,
    chatToolChoiceJson: properties.chatToolChoiceJson ?? store.chatToolChoiceJson,
    ...(args.onText ? { onText: args.onText } : {}),
  }
  const run = (overrides: Partial<RunTextGenerationOptions> = {}) => generateRunMarkdownWithProvider({
    config,
    prompt: args.prompt,
    options: { ...options, ...overrides },
    systemMessages: args.systemMessages,
  })
  try {
    return await run()
  } catch (error) {
    let terminalError = error
    const shouldRetryWithoutReasoning = error instanceof RunTextProviderIncompleteError
      && error.reason === 'max_output_tokens'
      && isResponsesEndpointUrl(endpointUrl)
      && String(thinkingOptions.chatReasoningEffort || '').trim().toLowerCase() !== 'minimal'
    if (shouldRetryWithoutReasoning) {
      try {
        return await run({ chatReasoningEffort: 'minimal', chatThinkingType: 'disabled', chatThinkingJson: '' })
      } catch (retryError) {
        terminalError = retryError
      }
    }
    const raw = terminalError instanceof Error ? terminalError.message : String(terminalError || '')
    throw new Error(resolveSubmitRuntimeFriendlyMessage({
      raw,
      endpointUrl: typeof endpointUrl === 'string' ? endpointUrl : null,
      chatProvider: typeof provider === 'string' ? provider : null,
      chatAuthMode: authMode,
    }))
  }
}
