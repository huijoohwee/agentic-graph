import type React from 'react'
import { UI_COPY } from '@/lib/config'
import {
  CHAT_DEFAULT_ENDPOINT_URL,
  chatProviderRequiresApiKey,
  getChatProviderLabel,
  normalizeChatEndpointUrlInput,
  resolveChatEndpointForRequest,
} from '@/lib/chatEndpoint'
import {
  ensureChatHistoryWorkspaceFilePath,
  toAgenticOsStreamingWorkspacePath,
} from '../chatHistoryWorkspace'
import { putChatHistoryCache, toShortId, upsertPendingChatRequestTurn } from './floatingPanelChatRuntime'
import type { ChatMessage, StreamingAssistantState } from '../FloatingPanelChatSections'
import type { FloatingPanelChatSubmitArgs } from './floatingPanelChatSubmitTypes'

export const resolveChatSubmitRequestUrlOrSetError = (args: {
  chatModel: string | null
  chatEndpointUrl: string | null
  chatProvider: string
  chatAuthMode: 'byok' | 'serverManaged'
  chatApiKey: string | null
  storageChatRelayDecision?: FloatingPanelChatSubmitArgs['storageChatRelayDecision']
  setErrorText: React.Dispatch<React.SetStateAction<string | null>>
  setConnectivity: React.Dispatch<React.SetStateAction<'unknown' | 'ok' | 'error'>>
  setConnectivityDetail: React.Dispatch<React.SetStateAction<string | null>>
}): string | null => {
  if (!args.chatModel) {
    args.setErrorText(UI_COPY.chatMissingEndpointAndModelError)
    args.setConnectivity('unknown')
    args.setConnectivityDetail(null)
    return null
  }
  if (
    args.chatAuthMode === 'byok'
    && chatProviderRequiresApiKey(args.chatProvider)
    && !String(args.chatApiKey || '').trim()
  ) {
    const detail = UI_COPY.chatMissingByokApiKeyError(getChatProviderLabel(args.chatProvider))
    args.setErrorText(detail)
    args.setConnectivity('error')
    args.setConnectivityDetail(detail)
    return null
  }
  if (args.storageChatRelayDecision?.kind === 'ready') {
    return args.storageChatRelayDecision.config.relayUrl
  }
  if (args.storageChatRelayDecision?.kind === 'loading') {
    args.setErrorText(args.storageChatRelayDecision.detail)
    args.setConnectivity('unknown')
    args.setConnectivityDetail(args.storageChatRelayDecision.detail)
    return null
  }
  if (args.storageChatRelayDecision?.kind === 'blocked') {
    args.setErrorText(args.storageChatRelayDecision.detail)
    args.setConnectivity('error')
    args.setConnectivityDetail(args.storageChatRelayDecision.detail)
    return null
  }
  const requestUrl = resolveChatEndpointForRequest(
    normalizeChatEndpointUrlInput(args.chatEndpointUrl || CHAT_DEFAULT_ENDPOINT_URL, args.chatProvider),
  )
  if (requestUrl) return requestUrl
  args.setErrorText(UI_COPY.chatMissingEndpointAndModelError)
  args.setConnectivity('unknown')
  args.setConnectivityDetail(null)
  return null
}

export const initializeChatSubmitOptimisticState = (args: {
  historyKey: string
  trimmedInput: string
  messages: ChatMessage[]
  setErrorText?: React.Dispatch<React.SetStateAction<string | null>>
  setConnectivityDetail?: React.Dispatch<React.SetStateAction<string | null>>
  setStreamingAssistant: React.Dispatch<React.SetStateAction<StreamingAssistantState | null>>
  setStreamingInsights?: React.Dispatch<React.SetStateAction<{
    reasoningPreview: string | null
    reasoningStepCount: number
    usageSummary: string | null
    finishReason: string | null
    modelId: string | null
  } | null>>
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  setInput: React.Dispatch<React.SetStateAction<string>>
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
}): {
  userMessageId: string
  assistantMessageId: string
  requestTimestampMs: number
  traceId: string
  nextMessages: ChatMessage[]
} => {
  const userMessageId = toShortId()
  const assistantMessageId = toShortId()
  const requestTimestampMs = Date.now()
  const traceId = `trace-${requestTimestampMs}-${assistantMessageId}`
  args.setErrorText?.(null)
  args.setConnectivityDetail?.(null)
  args.setStreamingInsights?.(null)
  args.setStreamingAssistant({ id: assistantMessageId, text: '' })
  const nextMessages = upsertPendingChatRequestTurn({
    messages: args.messages,
    requestText: args.trimmedInput,
    requestMessageId: userMessageId,
    assistantMessageId,
  })
  putChatHistoryCache(args.historyKey, nextMessages.slice(-80))
  args.setMessages(nextMessages)
  args.setInput('')
  args.setIsLoading(true)
  return {
    userMessageId,
    assistantMessageId,
    requestTimestampMs,
    traceId,
    nextMessages,
  }
}

export const bootstrapAgenticGraphSubmitDraft = async (args: {
  submitArgs: FloatingPanelChatSubmitArgs
  requestTimestampMs: number
  trimmedInput: string
  traceId: string
  ensureWorkspacePath?: typeof ensureChatHistoryWorkspaceFilePath
}): Promise<string | null> => {
  if (args.submitArgs.chatStorageTarget !== 'chatAgenticGraph') return null
  const ensureWorkspacePath = args.ensureWorkspacePath || ensureChatHistoryWorkspaceFilePath
  const liveAgenticOsPath = await ensureWorkspacePath({
    requestedPath: args.submitArgs.chatAgenticGraphWorkspacePath,
    timestampMs: args.requestTimestampMs,
    storageType: 'chatAgenticGraph',
    defaultLocalRootPath: args.submitArgs.chatLocalStorageRootPath,
    onResolvedPath: path => args.submitArgs.setChatAgenticGraphWorkspacePath(path),
  })
  const liveStreamingPath = toAgenticOsStreamingWorkspacePath(liveAgenticOsPath)
  args.submitArgs.setStreamingWorkspacePath(liveStreamingPath)
  args.submitArgs.setChatWorkspaceStreamingState?.({
    path: liveStreamingPath,
    text: '_Streaming..._',
  })
  args.submitArgs.followWorkspaceMarkdownPath(liveStreamingPath, { forceReveal: true })
  return liveAgenticOsPath
}
