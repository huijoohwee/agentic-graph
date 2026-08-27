import {
  CHAT_DEFAULT_ENDPOINT_URL,
  CHAT_PROVIDER_OPENAI,
  buildChatProxyHeaders,
  getDefaultChatModelForProvider,
  getChatModelOptions,
  isResponsesEndpointUrl,
  normalizeChatModelIdForProvider,
  normalizeChatProviderId,
} from '@/lib/chatEndpoint'
import { clampChatCompletionTokens } from '../chatAiMarkdownSpec'
import { buildPackedContextSystemPrompt, packChatContext, type ChatPackedContext } from '../chatContextPack'
import {
  prepareHeadlessResponseRun,
  type HeadlessResponsePreparation,
} from '../headlessResponseCoordinator'
import { sanitizeStreamArtifactPrompt } from '../chatStreamArtifactSanitizers'
import {
  buildBoundedGraphSystemPrompt,
  buildMarkdownNodeSnippetPrompt,
  buildWorkspaceWideContextPrompt,
} from '../chatPromptHelpers'
import { buildCorpusQueryEvidencePack, buildCorpusQueryEvidencePrompt } from '@/features/queryable-corpus/queryEvidencePack'
import { buildProviderChatRequestOptions } from './floatingPanelChatProviderOptions'
import { parseLine, toShortId } from './floatingPanelChatRuntime'
import type { ChatMessage } from '../FloatingPanelChatSections'
import type { FloatingPanelChatSubmitArgs } from './floatingPanelChatSubmitTypes'
import {
  fetchWithDurableChatStream,
  type DurableChatStreamRequestMetadata,
} from './floatingPanelChatDurableStream'
import {
  buildOpenAiResponsesInput,
  sanitizeOpenAiResponsesMessageText,
} from './floatingPanelChatOpenAiResponsesInput'
import { buildChatSubmitAiGatewayConfig } from './floatingPanelChatAiGateway'
import {
  AGENTICGRAPH_STORAGE_API_VERSION,
  type AgenticGraphStorageChatRelayRequest,
  type AgenticGraphStorageChatRelayResponse,
} from '@/lib/storage/agenticgraphStorageSyncContract'
import {
  toAgenticGraphStorageChatProviderId,
} from '@/lib/storage/agenticgraphStorageChatClient'
import {
  buildAgenticGraphVdeoxplnChatSystemPrompt,
  buildAgenticGraphVdeoxplnRoutingPlan,
} from '@/features/agent-ready/agenticgraphVdeoxplnContract.mjs'
import {
  hasRecognizedChatRuntimeInvocation,
  resolveChatSubmitResponseContract,
} from './floatingPanelChatSubmitProfile'
import {
  resolveChatRuntimeInvocationEffectiveQuery,
  resolveChatRuntimeInvocationProviderMessageText,
} from '../chatRuntimeInvocationQuery'

export type ChatSubmitMessage = { role: 'system' | 'user' | 'assistant'; content: string }
export type ChatSubmitTokenLimitKey = 'max_tokens' | 'max_completion_tokens'

const toFiniteNumberOrUndefined = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export const resolveChatSubmitTokenLimitKey = (chatProvider: string): ChatSubmitTokenLimitKey => {
  const provider = normalizeChatProviderId(chatProvider)
  return provider === CHAT_PROVIDER_OPENAI ? 'max_completion_tokens' : 'max_tokens'
}

const isOpenAiResponsesSubmit = (args: { chatProvider: string; endpointUrl: string }): boolean =>
  normalizeChatProviderId(args.chatProvider) === CHAT_PROVIDER_OPENAI && isResponsesEndpointUrl(args.endpointUrl)

const buildChatSubmitTokenLimitOptions = (args: {
  chatProvider: string
  endpointUrl: string
  tokenLimitKey: ChatSubmitTokenLimitKey
  tokenLimit: number
}): Record<string, number> => {
  if (isOpenAiResponsesSubmit(args)) return { max_output_tokens: args.tokenLimit }
  return args.tokenLimitKey === 'max_completion_tokens'
    ? { max_completion_tokens: args.tokenLimit }
    : { max_tokens: args.tokenLimit }
}

export const resolveInitialChatSubmitModel = (args: {
  chatProvider: string
  chatModel: string | null
}): { providerModelOptions: string[]; effectiveModel: string } => {
  const providerModelOptions = getChatModelOptions(args.chatProvider)
  const normalizedProviderModel = normalizeChatModelIdForProvider(args.chatModel, args.chatProvider)
  const effectiveModel = providerModelOptions.includes(normalizedProviderModel)
    ? normalizedProviderModel
    : getDefaultChatModelForProvider(args.chatProvider)
  return { providerModelOptions: [...providerModelOptions], effectiveModel }
}

export const buildSubmitConversationMessages = (
  nextMessages: ChatMessage[],
  assistantMessageId: string,
  options: { normalizeRuntimeInvocation?: boolean } = {},
): Array<{ role: 'user' | 'assistant'; content: string }> =>
  nextMessages
    .filter(message => message.id !== assistantMessageId)
    .map(message => {
      if (message.role !== 'user' || !options.normalizeRuntimeInvocation) {
        return { role: message.role, content: message.content }
      }
      return {
        role: message.role,
        content: resolveChatRuntimeInvocationProviderMessageText(message.content),
      }
    })

const readLastUserMessageContent = (messages: ChatMessage[], assistantMessageId: string): string => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (!message || message.id === assistantMessageId || message.role !== 'user') continue
    const content = String(message.content || '').trim()
    if (content) return content
  }
  return ''
}

export const buildChatSubmitPayloadMessages = (args: {
  systemMessages: Array<{ role: 'system'; content: string }>
  conversationMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  correctionPrompt: string | null
}): ChatSubmitMessage[] => {
  const out: ChatSubmitMessage[] = [...args.systemMessages]
  if (args.correctionPrompt && args.correctionPrompt.trim()) {
    out.push({ role: 'system', content: args.correctionPrompt })
  }
  out.push(...args.conversationMessages)
  return out
}

export const buildChatSubmitRequestContext = async (args: {
  submitArgs: FloatingPanelChatSubmitArgs
  nextMessages: ChatMessage[]
  assistantMessageId: string
  headlessPreparation?: HeadlessResponsePreparation
}): Promise<{
  packedContext: ChatPackedContext
  systemMessages: Array<{ role: 'system'; content: string }>
  conversationMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  headlessPreparation: HeadlessResponsePreparation
}> => {
  const packedContext = packChatContext({
    graphData: args.submitArgs.graphData,
    currentNode: args.submitArgs.currentNode,
    markdownText: args.submitArgs.markdownText,
    graphSummaryMaxTokens: toFiniteNumberOrUndefined(args.submitArgs.chatGraphSummaryMaxTokens),
    guidelineDigestMaxTokens: toFiniteNumberOrUndefined(args.submitArgs.chatGuidelineDigestMaxTokens),
  })
  const includeSelectionContext =
    args.submitArgs.chatContextScope === 'selection' || args.submitArgs.chatContextScope === 'hybrid'
  const includeWorkspaceContext =
    args.submitArgs.chatContextScope === 'workspace' || args.submitArgs.chatContextScope === 'hybrid'
  const userQuery = readLastUserMessageContent(args.nextMessages, args.assistantMessageId)
  const effectiveUserQuery = resolveChatRuntimeInvocationEffectiveQuery(userQuery)
  const responseContract = resolveChatSubmitResponseContract({
    chatStorageTarget: args.submitArgs.chatStorageTarget,
    userQuery,
  })
  const headlessPreparation = args.headlessPreparation || await prepareHeadlessResponseRun({
    runId: args.assistantMessageId,
    source: { kind: 'chat', id: args.assistantMessageId },
    requestText: userQuery,
    responseContract,
    chatStorageTarget: args.submitArgs.chatStorageTarget,
    provider: args.submitArgs.chatProvider,
    model: args.submitArgs.chatModel,
  })
  const [baseResponseContractMessage, ...headlessInvocationMessages] = headlessPreparation.systemMessages
  const systemMessages: Array<{ role: 'system'; content: string }> = [
    ...(baseResponseContractMessage ? [baseResponseContractMessage] : []),
    {
      role: 'system',
      content: buildPackedContextSystemPrompt(packedContext),
    },
  ]

  if (includeSelectionContext) {
    systemMessages.push({
      role: 'system',
      content: buildBoundedGraphSystemPrompt(args.submitArgs.graphData, args.submitArgs.currentNode),
    })
  }
  const corpusEvidencePrompt = buildCorpusQueryEvidencePrompt(buildCorpusQueryEvidencePack({
    graphData: args.submitArgs.graphData,
    query: effectiveUserQuery,
    selectedNodeId: args.submitArgs.currentNode?.id || null,
    model: args.submitArgs.chatModel,
    completionTokenBudget: toFiniteNumberOrUndefined(args.submitArgs.chatMaxCompletionTokens),
  }))
  if (corpusEvidencePrompt) {
    systemMessages.push({
      role: 'system',
      content: corpusEvidencePrompt,
    })
  }
  if (args.submitArgs.chatSystemPrompt && typeof args.submitArgs.chatSystemPrompt === 'string' && args.submitArgs.chatSystemPrompt.trim()) {
    systemMessages.push({ role: 'system', content: args.submitArgs.chatSystemPrompt })
  }
  systemMessages.push(...headlessInvocationMessages)
  if (includeSelectionContext) {
    const markdownSnippet = buildMarkdownNodeSnippetPrompt(
      args.submitArgs.markdownText,
      args.submitArgs.currentNode,
      parseLine,
    )
    if (markdownSnippet) systemMessages.push({ role: 'system', content: markdownSnippet })
  }
  if (includeWorkspaceContext) {
    const workspaceContextPrompt = await buildWorkspaceWideContextPrompt({
      markdownDocumentName: args.submitArgs.markdownDocumentName,
      markdownText: args.submitArgs.markdownText,
      sourceFiles: args.submitArgs.sourceFiles,
      cacheKey: args.submitArgs.workspaceContextCacheKey,
    })
    if (workspaceContextPrompt) systemMessages.push({ role: 'system', content: workspaceContextPrompt })
  }
  if (hasRecognizedChatRuntimeInvocation(userQuery)) {
    const vdeoxplnPlan = buildAgenticGraphVdeoxplnRoutingPlan({
      intentText: sanitizeStreamArtifactPrompt(effectiveUserQuery),
      chatStorageTarget: args.submitArgs.chatStorageTarget,
      contentTypes: [
        responseContract === 'kgc' ? 'kgc markdown' : 'chat response',
        args.submitArgs.markdownText ? 'workspace document markdown' : '',
      ],
      requestedOutputs: responseContract === 'kgc'
        ? ['validated KGC Markdown', 'workspace artifact', 'GraphData', 'canvas topology snapshot']
        : ['chat history'],
      stateSignals: [
        args.submitArgs.chatContextScope,
        args.submitArgs.sourceFiles.length > 0 ? 'source evidence source files' : '',
        args.submitArgs.graphData ? 'graph canvas topology' : '',
        args.submitArgs.currentNode ? 'selection context' : '',
      ],
      sourceFileCount: args.submitArgs.sourceFiles.length,
      hasSourceFiles: args.submitArgs.sourceFiles.length > 0,
      hasGraphData: Boolean(args.submitArgs.graphData),
      hasSelection: Boolean(args.submitArgs.currentNode),
      hasWorkspaceDocument: Boolean(args.submitArgs.markdownText || args.submitArgs.markdownDocumentName),
    })
    const vdeoxplnPrompt = buildAgenticGraphVdeoxplnChatSystemPrompt(vdeoxplnPlan)
    if (vdeoxplnPrompt) systemMessages.push({ role: 'system', content: vdeoxplnPrompt })
  }

  return {
    packedContext,
    systemMessages,
    headlessPreparation,
    conversationMessages: buildSubmitConversationMessages(args.nextMessages, args.assistantMessageId, {
      normalizeRuntimeInvocation: true,
    }),
  }
}

export const createChatSubmitRequestSender = (args: {
  submitArgs: FloatingPanelChatSubmitArgs
  requestUrl: string
  controller: AbortController
  fetchFn?: typeof fetch
  durableStream?: DurableChatStreamRequestMetadata | null
}) => {
  const fetchFn = args.fetchFn || fetch
  return async (
    model: string,
    messages: ChatSubmitMessage[],
    tokenLimitKey: ChatSubmitTokenLimitKey = resolveChatSubmitTokenLimitKey(args.submitArgs.chatProvider),
  ): Promise<Response> => {
    const clientRequestId = `kg-chat-${toShortId()}`
    const tokenLimit = clampChatCompletionTokens(args.submitArgs.chatMaxCompletionTokens)
    const effectiveTokenLimit =
      args.submitArgs.chatStorageTarget === 'chatAgenticGraph'
        ? Math.max(4000, tokenLimit)
        : tokenLimit
    const endpointUrl = args.submitArgs.chatEndpointUrl || CHAT_DEFAULT_ENDPOINT_URL
    const providerOptions = buildProviderChatRequestOptions({
      provider: args.submitArgs.chatProvider,
      endpointUrl,
      chatModel: args.submitArgs.chatModel,
      chatTemperature: args.submitArgs.chatTemperature,
      chatServiceTier: args.submitArgs.chatServiceTier,
      chatStream: args.submitArgs.chatStream,
      chatMessagesJson: args.submitArgs.chatMessagesJson,
      chatReasoningEffort: args.submitArgs.chatReasoningEffort,
      chatThinkingType: args.submitArgs.chatThinkingType,
      chatThinkingJson: args.submitArgs.chatThinkingJson,
      chatFrequencyPenalty: args.submitArgs.chatFrequencyPenalty,
      chatPresencePenalty: args.submitArgs.chatPresencePenalty,
      chatTopP: args.submitArgs.chatTopP,
      chatLogprobs: args.submitArgs.chatLogprobs,
      chatTopLogprobs: args.submitArgs.chatTopLogprobs,
      chatParallelToolCalls: args.submitArgs.chatParallelToolCalls,
      chatStopJson: args.submitArgs.chatStopJson,
      chatStreamOptionsJson: args.submitArgs.chatStreamOptionsJson,
      chatResponseFormatJson: args.submitArgs.chatResponseFormatJson,
      chatLogitBiasJson: args.submitArgs.chatLogitBiasJson,
      chatToolsJson: args.submitArgs.chatToolsJson,
      chatToolChoiceJson: args.submitArgs.chatToolChoiceJson,
    })
    const tokenLimitOptions = buildChatSubmitTokenLimitOptions({
      chatProvider: args.submitArgs.chatProvider,
      endpointUrl,
      tokenLimitKey,
      tokenLimit: effectiveTokenLimit,
    })
    const storageRelayProviderId = toAgenticGraphStorageChatProviderId(args.submitArgs.chatProvider)
    const storageRelayConfig = args.submitArgs.storageChatRelayDecision?.kind === 'ready'
      ? args.submitArgs.storageChatRelayDecision.config
      : null
    const isOpenAiResponsesRequest = isOpenAiResponsesSubmit({ chatProvider: args.submitArgs.chatProvider, endpointUrl })
    const aiGatewayConfig = buildChatSubmitAiGatewayConfig({
      chatProvider: args.submitArgs.chatProvider,
      chatStorageTarget: args.submitArgs.chatStorageTarget,
      chatContextScope: args.submitArgs.chatContextScope,
      workspaceContextCacheKey: args.submitArgs.workspaceContextCacheKey,
      historyKey: args.submitArgs.historyKey,
      clientRequestId,
      requestSurface: isOpenAiResponsesRequest ? 'responses' : 'chat-completions',
    })
    if (storageRelayConfig && storageRelayProviderId && args.requestUrl === storageRelayConfig.relayUrl) {
      const relayResponsesInput = isOpenAiResponsesRequest ? await buildOpenAiResponsesInput(messages) : null
      const relayMessages = isOpenAiResponsesRequest
        ? messages.map(message => ({ ...message, content: sanitizeOpenAiResponsesMessageText(message.content) }))
        : messages
      const relayPayload: AgenticGraphStorageChatRelayRequest = {
        apiVersion: AGENTICGRAPH_STORAGE_API_VERSION,
        workspaceId: storageRelayConfig.workspaceId,
        providerId: storageRelayProviderId,
        authMode: args.submitArgs.chatAuthMode,
        endpointUrl,
        model,
        messages: relayMessages,
        requestSurface: isOpenAiResponsesRequest ? 'responses' : 'chat-completions',
        input: relayResponsesInput,
        stream: false,
        byokApiKey: args.submitArgs.chatAuthMode === 'byok' ? args.submitArgs.chatApiKey : null,
        // Let the authenticated storage relay own the default AI Gateway route policy.
        aiGatewayRoute: null,
        aiGatewayMetadata: aiGatewayConfig?.metadata || null,
        // Let the authenticated storage relay own the default AI Gateway cache policy.
        aiGatewayCacheTtlSeconds: null,
        providerOptions: {
          ...providerOptions,
          ...tokenLimitOptions,
        },
      }
      const relayResponse = await fetchFn(storageRelayConfig.relayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${storageRelayConfig.sessionToken}`,
          'x-client-request-id': clientRequestId,
        },
        body: JSON.stringify(relayPayload),
        signal: args.controller.signal,
      })
      if (!relayResponse.ok) return relayResponse
      const relayBody = await relayResponse.json() as AgenticGraphStorageChatRelayResponse
      return new Response(JSON.stringify(relayBody.body ?? null), {
        status: relayBody.upstreamStatus || 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      })
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...buildChatProxyHeaders({
        provider: args.submitArgs.chatProvider,
        apiKey: args.submitArgs.chatAuthMode === 'byok' ? args.submitArgs.chatApiKey : null,
        endpointUrl,
        clientRequestId,
        aiGateway: aiGatewayConfig,
      }),
    }
    const requestBody = isOpenAiResponsesRequest
      ? {
          model,
          input: await buildOpenAiResponsesInput(messages),
          stream: true,
          ...providerOptions,
          ...tokenLimitOptions,
        }
      : {
          model,
          messages,
          stream: true,
          ...providerOptions,
          ...tokenLimitOptions,
        }
    const init: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: args.controller.signal,
    }
    if (args.durableStream) {
      return await fetchWithDurableChatStream({
        runMetadata: {
          ...args.durableStream,
          modelId: model,
        },
        input: args.requestUrl,
        init,
        signal: args.controller.signal,
        fallbackFetch: fetchFn,
      })
    }
    return await fetchFn(args.requestUrl, init)
  }
}
