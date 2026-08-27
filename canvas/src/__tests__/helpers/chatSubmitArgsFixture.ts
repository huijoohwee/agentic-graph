import type { FloatingPanelChatSubmitArgs } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitTypes'
import type { AgenticGraphStorageChatRelayDecision } from '@/lib/storage/agenticgraphStorageChatClient'
import type { AgenticGraphStorageChatProviderId } from '@/lib/storage/agenticgraphStorageSyncContract'

export const buildSubmitArgsFixture = (
  overrides: Partial<FloatingPanelChatSubmitArgs> = {},
): FloatingPanelChatSubmitArgs => ({
  historyKey: 'history-key',
  graphData: null,
  currentNode: null,
  markdownText: null,
  markdownDocumentName: null,
  sourceFiles: [],
  workspaceContextCacheKey: 'workspace-cache',
  chatProvider: 'openai',
  chatAuthMode: 'serverManaged',
  chatApiKey: null,
  chatEndpointUrl: 'https://chat.example.test/v1/chat/completions',
  chatModel: 'gpt-4.1-mini',
  chatTemperature: 0.3,
  chatMaxCompletionTokens: 128,
  chatServiceTier: null,
  chatStream: true,
  chatMessagesJson: null,
  chatReasoningEffort: null,
  chatThinkingType: null,
  chatThinkingJson: null,
  chatFrequencyPenalty: null,
  chatPresencePenalty: null,
  chatTopP: null,
  chatLogprobs: null,
  chatTopLogprobs: null,
  chatParallelToolCalls: null,
  chatStopJson: null,
  chatStreamOptionsJson: null,
  chatResponseFormatJson: null,
  chatLogitBiasJson: null,
  chatToolsJson: null,
  chatToolChoiceJson: null,
  chatGraphSummaryMaxTokens: null,
  chatGuidelineDigestMaxTokens: null,
  chatSystemPrompt: null,
  chatContextScope: 'workspace',
  chatStorageTarget: 'chatHistory',
  chatLocalStorageRootPath: '/workspace',
  chatAgenticGraphWorkspacePath: null,
  setChatAgenticGraphWorkspacePath: () => {},
  chatProviderSummary: 'openai:gpt-4.1-mini',
  setChatModel: () => {},
  messages: [],
  setMessages: () => {},
  input: '',
  setInput: () => {},
  isLoading: false,
  setIsLoading: () => {},
  setErrorText: () => {},
  setConnectivity: () => {},
  setConnectivityDetail: () => {},
  setStreamingAssistant: () => {},
  setStreamingInsights: () => {},
  setStreamingWorkspacePath: () => {},
  abortRef: { current: null },
  streamDraftTextRef: { current: null },
  streamFollowRef: { current: null },
  followWorkspaceMarkdownPath: () => {},
  finalizeAssistantSuccess: async () => {},
  pushChatExchangeLog: () => {},
  persistChatExchangeLog: async () => {},
  ...overrides,
})

export const withStorageChatRelayEnv = (args: {
  baseUrl?: string
  workspaceId?: string
  sessionToken?: string
} = {}): (() => void) => {
  const previousBaseUrl = process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL
  const previousWorkspaceId = process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID
  const previousSessionToken = process.env.VITE_AGENTICGRAPH_STORAGE_CHAT_SESSION_TOKEN
  process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL = args.baseUrl || 'https://storage.example.test'
  process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID = args.workspaceId || 'kgws:test-chat'
  process.env.VITE_AGENTICGRAPH_STORAGE_CHAT_SESSION_TOKEN = args.sessionToken || 'session-token'
  return () => {
    if (typeof previousBaseUrl === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL
    if (typeof previousWorkspaceId === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID = previousWorkspaceId
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_WORKSPACE_ID
    if (typeof previousSessionToken === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_CHAT_SESSION_TOKEN = previousSessionToken
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_CHAT_SESSION_TOKEN
  }
}

export const buildStorageChatRelayDecisionFixture = (args: {
  kind?: 'disabled' | 'loading' | 'blocked' | 'ready'
  providerId?: AgenticGraphStorageChatProviderId
  authMode?: 'serverManaged' | 'byok'
  relayUrl?: string
  workspaceId?: string
  sessionToken?: string
  detail?: string
} = {}): AgenticGraphStorageChatRelayDecision => {
  const kind = args.kind || 'ready'
  const providerId = args.providerId || 'agnes-ai'
  const workspaceId = args.workspaceId || 'kgws:test-chat'
  const detail = args.detail || 'Workspace relay is ready.'
  if (kind === 'disabled') return { kind: 'disabled' }
  if (kind === 'loading') return { kind: 'loading', detail }
  if (kind === 'blocked') {
    return {
      kind: 'blocked',
      detail,
      policy: {
        workspaceId,
        providerId,
        allowServerManaged: args.authMode !== 'serverManaged',
        allowByok: args.authMode !== 'byok',
        monthlyRequestLimit: null,
        monthlyTokenLimit: null,
        monthlySpendLimitCents: null,
        defaultModel: null,
        updatedAtMs: null,
      },
    }
  }
  return {
    kind: 'ready',
    detail,
    config: {
      baseUrl: 'https://storage.example.test',
      relayUrl: args.relayUrl || 'https://storage.example.test/api/storage/chat/relay',
      workspaceId,
      sessionToken: args.sessionToken || 'sess:test',
    },
    membership: {
      workspaceId,
      role: 'editor',
      status: 'active',
    },
    policy: {
      workspaceId,
      providerId,
      allowServerManaged: args.authMode !== 'byok',
      allowByok: args.authMode !== 'serverManaged',
      monthlyRequestLimit: null,
      monthlyTokenLimit: null,
      monthlySpendLimitCents: null,
      defaultModel: null,
      updatedAtMs: null,
    },
  }
}
