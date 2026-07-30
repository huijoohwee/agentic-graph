import type React from 'react'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import type { SourceFile } from '@/hooks/store/types'
import type { UiLogEntryInput } from '@/hooks/store/types'
import type { KnowgrphStorageChatRelayDecision } from '@/lib/storage/knowgrphStorageChatClient'
import type { ChatMessage, StreamingAssistantState } from '../FloatingPanelChatSections'
import type { HeadlessResponseRunResult } from '../headlessResponseCoordinator'

export type FloatingPanelChatSubmitArgs = {
  historyKey: string
  graphData: GraphData | null
  currentNode: GraphNode | null
  markdownText: string | null
  markdownDocumentName: string | null
  sourceFiles: SourceFile[]
  workspaceContextCacheKey: string

  chatProvider: string
  chatAuthMode: 'byok' | 'serverManaged'
  chatApiKey: string | null
  chatEndpointUrl: string | null
  chatModel: string | null
  chatTemperature: unknown
  chatMaxCompletionTokens: unknown
  chatServiceTier: unknown
  chatStream: unknown
  chatMessagesJson: unknown
  chatReasoningEffort: unknown
  chatThinkingType: unknown
  chatThinkingJson: unknown
  chatFrequencyPenalty: unknown
  chatPresencePenalty: unknown
  chatTopP: unknown
  chatLogprobs: unknown
  chatTopLogprobs: unknown
  chatParallelToolCalls: unknown
  chatStopJson: unknown
  chatStreamOptionsJson: unknown
  chatResponseFormatJson: unknown
  chatLogitBiasJson: unknown
  chatToolsJson: unknown
  chatToolChoiceJson: unknown
  chatGraphSummaryMaxTokens: unknown
  chatGuidelineDigestMaxTokens: unknown
  chatSystemPrompt: string | null
  chatContextScope: 'selection' | 'workspace' | 'hybrid'

  chatStorageTarget: 'chatHistory' | 'chatKnowgrph'
  chatLocalStorageRootPath: string
  chatKnowgrphWorkspacePath: string | null
  storageChatRelayDecision?: KnowgrphStorageChatRelayDecision | null
  setChatKnowgrphWorkspacePath: (path: string) => void
  setChatWorkspaceStreamingState?: (value: { path?: string | null; text?: string | null } | null) => void
  chatProviderSummary: string
  setChatModel: (modelId: string) => void

  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  input: string
  setInput: React.Dispatch<React.SetStateAction<string>>
  isLoading: boolean
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>
  setErrorText: React.Dispatch<React.SetStateAction<string | null>>
  setConnectivity: React.Dispatch<React.SetStateAction<'unknown' | 'ok' | 'error'>>
  setConnectivityDetail: React.Dispatch<React.SetStateAction<string | null>>
  setStreamingAssistant: React.Dispatch<React.SetStateAction<StreamingAssistantState | null>>
  setStreamingInsights: React.Dispatch<React.SetStateAction<{
    reasoningPreview: string | null
    reasoningStepCount: number
    usageSummary: string | null
    finishReason: string | null
    modelId: string | null
  } | null>>
  setStreamingWorkspacePath: React.Dispatch<React.SetStateAction<string | null>>
  abortRef: React.MutableRefObject<AbortController | null>
  streamDraftTextRef: React.MutableRefObject<{ path: string; text: string } | null>
  streamFollowRef: React.MutableRefObject<{ path: string; atMs: number } | null>

  followWorkspaceMarkdownPath: (path: string, options?: { forceReveal?: boolean }) => void

  finalizeAssistantSuccess: (payload: {
    assistantMessageId: string
    requestText: string
    modelId: string
    rawAssistantText: string
    runResult?: HeadlessResponseRunResult
    validatedKgc?: string | null
    timestampMs: number
    traceId?: string
    knownKnowgrphPath?: string | null
    status?: 'ok' | 'error'
    finalAssistantOverride?: string | null
    applyWorkspaceDocumentToCanvas?: boolean
    streamUsageSummary?: string | null
    streamFinishReason?: string | null
    streamReasoningSteps?: string[]
    rawSseEvents?: string[]
  }) => Promise<void>
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
  pushUiLog?: (entry: UiLogEntryInput) => void
  requestHistorySubTab?: (subTab: string | null) => void
}
