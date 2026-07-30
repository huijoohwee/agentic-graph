import type React from 'react'
import { UI_COPY } from '@/lib/config'
import { getChatProviderLabel } from '@/lib/chatEndpoint'
import type { UiLogEntryInput } from '@/hooks/store/types'
import { CHAT_STREAM_FIRST_CHUNK_TIMEOUT_ERROR } from './floatingPanelChatStreaming'
import { CHAT_SUBMIT_PREPARATION_TIMEOUT_ERROR } from './floatingPanelChatSubmitCoordinator'
import { CHAT_SUBMIT_TRANSPORT_TIMEOUT_ERROR } from './floatingPanelChatSubmitTransport'
import { finalizeSubmitTerminalState, materializePendingSubmitAssistantError } from './floatingPanelChatSubmitLifecycle'
import type { ChatMessage } from '../FloatingPanelChatSections'
import type { HeadlessResponseRunResult } from '../headlessResponseCoordinator'

const INVALID_TOKEN_PATTERN = /(invalid token|invalid api key|invalid authorization|api key format is incorrect|无效的令牌)/i
const MISSING_API_KEY_PATTERN = /(missing [\w\s-]*api key|requires an api key)/i

const resolveRequestIdSuffix = (raw: string): string => {
  const requestId = raw.match(/request\s+id:\s*([a-z0-9-]+)/i)?.[1] || ''
  return requestId ? ` Request id: ${requestId}` : ''
}

const resolveProviderCredentialFriendlyMessage = (args: {
  raw: string
  chatProvider?: string | null
  chatAuthMode?: 'byok' | 'serverManaged' | null
}): string | null => {
  const raw = String(args.raw || '').trim()
  if (!raw) return null
  const providerLabel = getChatProviderLabel(args.chatProvider || 'openai')
  if (INVALID_TOKEN_PATTERN.test(raw)) {
    const requestIdSuffix = resolveRequestIdSuffix(raw)
    return args.chatAuthMode === 'byok'
      ? `${providerLabel} rejected the BYOK API key. Verify that the key belongs to this provider and matches the endpoint region, update Settings -> Chat auth, and retry.${requestIdSuffix}`
      : `${providerLabel} rejected the configured server-managed chat proxy API key. Rotate the deployed server-managed key or switch Settings -> Chat auth to BYOK and retry.${requestIdSuffix}`
  }
  if (MISSING_API_KEY_PATTERN.test(raw)) {
    return args.chatAuthMode === 'byok'
      ? UI_COPY.chatMissingByokApiKeyError(providerLabel)
      : `${providerLabel} does not have a server-managed chat proxy API key configured. Add the server-managed key or switch Settings -> Chat auth to BYOK and retry.`
  }
  return null
}

export const resolveSubmitRuntimeFriendlyMessage = (args: {
  raw: string
  endpointUrl: string | null
  chatProvider?: string | null
  chatAuthMode?: 'byok' | 'serverManaged' | null
}): string => {
  const raw = String(args.raw || '')
  const lowered = raw.toLowerCase()
  const endpoint = typeof args.endpointUrl === 'string' && args.endpointUrl ? String(args.endpointUrl) : ''
  const isNetwork =
    raw === 'Failed to fetch' ||
    lowered.includes('networkerror') ||
    lowered.includes('net::') ||
    lowered.includes('connection refused')
  if (raw.includes(CHAT_SUBMIT_PREPARATION_TIMEOUT_ERROR)) {
    return UI_COPY.chatSubmitPreparationTimeoutError(getChatProviderLabel(args.chatProvider || 'openai'))
  }
  if (raw.includes(CHAT_SUBMIT_TRANSPORT_TIMEOUT_ERROR)) {
    return UI_COPY.chatSubmitTransportTimeoutError(getChatProviderLabel(args.chatProvider || 'openai'))
  }
  if (raw.includes(CHAT_STREAM_FIRST_CHUNK_TIMEOUT_ERROR)) {
    return UI_COPY.chatStreamFirstChunkTimeoutError(getChatProviderLabel(args.chatProvider || 'openai'))
  }
  const credentialFriendly = resolveProviderCredentialFriendlyMessage(args)
  if (credentialFriendly) return credentialFriendly
  return isNetwork
    ? endpoint
      ? UI_COPY.chatUnableToReachEndpointError(endpoint)
      : UI_COPY.chatUnableToReachEndpointGenericError
    : raw || UI_COPY.chatRequestFailedGenericError
}

const buildSubmitIssueLogMessage = (args: {
  responseText: string
  connectivityDetail?: string | null
  endpointUrl?: string | null
  chatProvider?: string | null
  chatAuthMode?: 'byok' | 'serverManaged' | null
  modelId?: string | null
}): string => {
  const providerLabel = getChatProviderLabel(args.chatProvider || 'openai')
  const responseText = String(args.responseText || '').trim()
  const connectivityDetail = String(args.connectivityDetail || '').trim()
  const endpoint = String(args.endpointUrl || '').trim()
  const modelId = String(args.modelId || '').trim()
  const authMode = args.chatAuthMode === 'byok' || args.chatAuthMode === 'serverManaged'
    ? args.chatAuthMode
    : ''
  const parts = [`${providerLabel} diagnosis: ${responseText || UI_COPY.chatRequestFailedGenericError}`]
  if (connectivityDetail && !responseText.includes(connectivityDetail)) parts.push(`Connectivity: ${connectivityDetail}`)
  if (endpoint) parts.push(`Endpoint: ${endpoint}`)
  if (authMode) parts.push(`Auth: ${authMode}`)
  if (modelId) parts.push(`Model: ${modelId}`)
  return parts.join(' ')
}

const reportSubmitUiIssue = (args: {
  responseText: string
  status: 'error' | 'aborted'
  modelId: string | null
  connectivityDetail?: string | null
  endpointUrl?: string | null
  chatProvider?: string | null
  chatAuthMode?: 'byok' | 'serverManaged' | null
  timestampMs: number
  pushUiLog?: ((entry: UiLogEntryInput) => void) | null
  requestHistorySubTab?: ((subTab: string | null) => void) | null
}): void => {
  if (!args.pushUiLog) return
  args.pushUiLog({
    kind: args.status === 'aborted' ? 'warning' : 'error',
    message: buildSubmitIssueLogMessage({
      responseText: args.responseText,
      connectivityDetail: args.connectivityDetail,
      endpointUrl: args.endpointUrl,
      chatProvider: args.chatProvider,
      chatAuthMode: args.chatAuthMode,
      modelId: args.modelId,
    }),
    tsMs: args.timestampMs,
    source: `chat:${String(args.chatProvider || 'openai').trim() || 'openai'}`,
  })
  try {
    args.requestHistorySubTab?.('log')
  } catch {
    void 0
  }
}

export const reportSubmitExchangeIssue = (args: {
  requestText: string
  responseText: string
  status: 'ok' | 'error' | 'aborted'
  modelId: string | null
  timestampMs: number
  pushChatExchangeLog: (payload: {
    request: string
    response: string
    status: 'ok' | 'error' | 'aborted'
    model: string | null
    tsMs: number
  }) => void
  persistChatExchangeLog: (payload: {
    request: string
    response: string
    status: 'ok' | 'error' | 'aborted'
    model: string
    timestampMs: number
  }) => Promise<void>
  pushUiLog?: ((entry: UiLogEntryInput) => void) | null
  requestHistorySubTab?: ((subTab: string | null) => void) | null
  connectivityDetail?: string | null
  endpointUrl?: string | null
  chatProvider?: string | null
  chatAuthMode?: 'byok' | 'serverManaged' | null
}): void => {
  args.pushChatExchangeLog({
    request: args.requestText,
    response: args.responseText,
    status: args.status,
    model: args.modelId,
    tsMs: args.timestampMs,
  })
  void args.persistChatExchangeLog({
    request: args.requestText,
    response: args.responseText,
    status: args.status,
    model: args.modelId || '',
    timestampMs: args.timestampMs,
  })
  reportSubmitUiIssue({
    responseText: args.responseText,
    status: args.status === 'ok' ? 'error' : args.status,
    modelId: args.modelId,
    connectivityDetail: args.connectivityDetail,
    endpointUrl: args.endpointUrl,
    chatProvider: args.chatProvider,
    chatAuthMode: args.chatAuthMode,
    timestampMs: args.timestampMs,
    pushUiLog: args.pushUiLog,
    requestHistorySubTab: args.requestHistorySubTab,
  })
}

export const handleSubmitIssueExit = (args: {
  assistantMessageId: string
  requestText: string
  responseText: string
  status: 'error' | 'aborted'
  modelId: string | null
  runResult?: HeadlessResponseRunResult
  timestampMs: number
  setStreamingAssistant: React.Dispatch<React.SetStateAction<{ id: string; text: string } | null>>
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  setErrorText?: React.Dispatch<React.SetStateAction<string | null>>
  errorText?: string | null
  setConnectivity: React.Dispatch<React.SetStateAction<'unknown' | 'ok' | 'error'>>
  connectivity: 'unknown' | 'error'
  setConnectivityDetail: React.Dispatch<React.SetStateAction<string | null>>
  connectivityDetail: string | null
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  abortRef: { current: AbortController | null }
  setStreamingWorkspacePath: React.Dispatch<React.SetStateAction<string | null>>
  setChatWorkspaceStreamingState?: (value: { path?: string | null; text?: string | null } | null) => void
  streamFollowRef: { current: { path: string; atMs: number } | null }
  streamDraftTextRef: { current: { path: string; text: string } | null }
  pushChatExchangeLog: (payload: {
    request: string
    response: string
    status: 'ok' | 'error' | 'aborted'
    model: string | null
    tsMs: number
  }) => void
  persistChatExchangeLog: (payload: {
    request: string
    response: string
    status: 'ok' | 'error' | 'aborted'
    model: string
    timestampMs: number
  }) => Promise<void>
  pushUiLog?: ((entry: UiLogEntryInput) => void) | null
  requestHistorySubTab?: ((subTab: string | null) => void) | null
  chatProvider?: string | null
  chatAuthMode?: 'byok' | 'serverManaged' | null
  endpointUrl?: string | null
  shouldReportIssue?: boolean
}): void => {
  if (args.setErrorText && typeof args.errorText === 'string') {
    args.setErrorText(args.errorText)
  }
  materializePendingSubmitAssistantError({
    assistantMessageId: args.assistantMessageId,
    responseText: args.responseText,
    runResult: args.runResult,
    setStreamingAssistant: args.setStreamingAssistant,
    setMessages: args.setMessages,
  })
  args.setConnectivity(args.connectivity)
  args.setConnectivityDetail(args.connectivityDetail)
  if (args.shouldReportIssue !== false) {
    reportSubmitExchangeIssue({
      requestText: args.requestText,
      responseText: args.responseText,
      status: args.status,
      modelId: args.modelId,
      timestampMs: args.timestampMs,
      pushChatExchangeLog: args.pushChatExchangeLog,
      persistChatExchangeLog: args.persistChatExchangeLog,
      pushUiLog: args.pushUiLog,
      requestHistorySubTab: args.requestHistorySubTab,
      connectivityDetail: args.connectivityDetail,
      endpointUrl: args.endpointUrl,
      chatProvider: args.chatProvider,
      chatAuthMode: args.chatAuthMode,
    })
  } else {
    reportSubmitUiIssue({
      responseText: args.responseText,
      status: args.status,
      modelId: args.modelId,
      connectivityDetail: args.connectivityDetail,
      endpointUrl: args.endpointUrl,
      chatProvider: args.chatProvider,
      chatAuthMode: args.chatAuthMode,
      timestampMs: args.timestampMs,
      pushUiLog: args.pushUiLog,
      requestHistorySubTab: args.requestHistorySubTab,
    })
  }
  finalizeSubmitTerminalState({
    setIsLoading: args.setIsLoading,
    abortRef: args.abortRef,
    setStreamingWorkspacePath: args.setStreamingWorkspacePath,
    setChatWorkspaceStreamingState: args.setChatWorkspaceStreamingState,
    streamFollowRef: args.streamFollowRef,
    streamDraftTextRef: args.streamDraftTextRef,
  })
}
