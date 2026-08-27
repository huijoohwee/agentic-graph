import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_COPY, LS_KEYS } from '@/lib/config'
import { CHAT_INPUT_APPEND_EVENT } from '@/features/canvas/utils'
import { getLocalStorage, lsSetJson } from '@/lib/persistence'
import { UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME } from '@/lib/ui/responsiveElementClasses'
import type {
  ChatMessage,
  StreamingAssistantState,
} from './FloatingPanelChatSections'
import { FloatingPanelChatFooter, FloatingPanelChatMessagesSection } from './FloatingPanelChatSections'
import { createNewChatHistoryWorkspaceFilePath } from '@/features/chat/chatHistoryWorkspace'
import { CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT } from '@/features/chat/chatStorageConfig'
import { ensureChatStreamArtifactBundleInitialized } from '@/features/chat/chatStreamArtifacts'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import {
  CHAT_DEFAULT_ENDPOINT_URL,
  getChatProviderCredentialLabel,
  getChatProviderLabel,
  getChatProviderRegionLabel,
  getChatRecommendedModelHint,
  normalizeChatProviderId,
} from '@/lib/chatEndpoint'
import {
  buildHistoryKey,
  persistChatExchangeLog,
  putChatHistoryCache,
} from '@/features/chat/floatingPanelChat/floatingPanelChatRuntime'
import { useFloatingPanelChatHistory } from '@/features/chat/floatingPanelChat/useFloatingPanelChatHistory'
import { useFinalizeAssistantSuccess } from '@/features/chat/floatingPanelChat/useFinalizeAssistantSuccess'
import { useFloatingPanelChatSubmit } from '@/features/chat/floatingPanelChat/useFloatingPanelChatSubmit'
import { isNativeImportUrlInvocationAttempt } from '@/features/chat/nativeImportUrlInvocation'
import { shouldRenderFloatingChatApiKeyPrompt } from '@/features/chat/floatingPanelChat/floatingPanelChatApiKeyPrompt'
import { buildStorageChatRelayLogDescriptor } from '@/features/chat/floatingPanelChat/floatingPanelChatRelayDiagnostics'
import { applyFloatingPanelChatInputAppend, resolveFloatingPanelChatInputAppend } from '@/features/chat/floatingPanelChat/floatingPanelChatInputAppend'
import {
  readActiveDurableChatStreamRun,
} from '@/features/chat/floatingPanelChat/floatingPanelChatDurableStream'
import { useResumeDurableChatStream } from '@/features/chat/floatingPanelChat/useResumeDurableChatStream'
import { openMarkdownWorkspaceEditorPane } from '@/features/workspace-table/workspaceTableSsot'
import { emitMarkdownLayoutRequest } from '@/lib/markdown-workspace-runtime/markdownWorkspaceRuntime.shared'
import { normalizeMarkdownWorkspaceSelectionPath } from '@/lib/markdown-workspace-runtime/markdownWorkspaceSelectionPath'
import {
  clearLocalChatPipelineSurfaceSnapshot,
  publishLocalChatPipelineSurfaceSnapshot,
} from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import {
  fetchAgenticGraphStorageChatPolicies,
  fetchAgenticGraphStorageChatSession,
  isAgenticGraphStorageChatAuthModeAllowed,
  readAgenticGraphStorageChatRelayConfig,
  resolveAgenticGraphStorageChatPolicy,
  toAgenticGraphStorageChatProviderId,
  type AgenticGraphStorageChatRelayDecision,
} from '@/lib/storage/agenticgraphStorageChatClient'
import type {
  AgenticGraphStorageChatPoliciesResponse,
  AgenticGraphStorageChatSessionMembership,
  AgenticGraphStorageChatSessionResponse,
} from '@/lib/storage/agenticgraphStorageSyncContract'
import {
  KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME,
  KTV_STATUS_TEXT_SIZE_CLASS_NAME,
} from 'grph-shared/ui/keyTypeValueRows'
import { resolveSharedChatModelSelect } from '@/features/chat/chatModelCredentialResolver'
import { useFloatingPanelChatSurfaceModel } from '@/features/chat/floatingPanelChat/useFloatingPanelChatSurfaceModel'
import { flushFloatingPanelChatInputHandoff } from '@/features/chat/floatingPanelChat/floatingPanelChatInputHandoff'
import { stopFloatingPanelChatStream } from '@/features/chat/floatingPanelChat/floatingPanelChatStop'
import { useFloatingPanelChatThreadFollow } from '@/features/chat/floatingPanelChat/useFloatingPanelChatThreadFollow'
import { openMarkdownWorkspacePathInExplorer } from '@/features/markdown-workspace/openMarkdownWorkspacePathInExplorer'
import { useFloatingPanelChatCredentialContext } from '@/features/chat/floatingPanelChat/useFloatingPanelChatCredentialContext'
import { readGraphNodeProperties } from '@/lib/cards/graphNodeCardFields'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import { resolveChatModelSelectionValues } from '@/lib/chatProviderSelection'
export default function FloatingPanelChat() {
  const graphData = useGraphStore(s => s.graphData)
  const graphDataRevision = useGraphStore(s => s.graphDataRevision || 0)
  const selectedNodeId = useGraphStore(s => s.selectedNodeId)
  const markdownText = useGraphStore(s => s.markdownDocumentText || null)
  const uiPanelTextFontClass = useGraphStore(s => s.uiPanelTextFontClass || 'font-sans')
  const uiPanelKeyValueTextSizeClass = useGraphStore(s => s.uiPanelKeyValueTextSizeClass || KTV_ROW_TEXT_SIZE_FALLBACK_CLASS_NAME)
  const uiPanelMicroLabelTextSizeClass = useGraphStore(s => s.uiPanelMicroLabelTextSizeClass || KTV_STATUS_TEXT_SIZE_CLASS_NAME)

  const chatProvider = useGraphStore(s => s.chatProvider)
  const chatAuthMode = useGraphStore(s => (s.chatAuthMode === 'byok' ? 'byok' : 'serverManaged'))
  const chatApiKey = useGraphStore(s => s.chatApiKey)
  const setChatApiKey = useGraphStore(s => s.setChatApiKey)
  const chatEndpointUrl = useGraphStore(s => s.chatEndpointUrl)
  const chatModel = useGraphStore(s => s.chatModel)
  const chatTemperature = useGraphStore(s => s.chatTemperature)
  const chatMaxCompletionTokens = useGraphStore(s => s.chatMaxCompletionTokens)
  const chatServiceTier = useGraphStore(s => s.chatServiceTier)
  const chatStream = useGraphStore(s => s.chatStream)
  const chatMessagesJson = useGraphStore(s => s.chatMessagesJson)
  const chatReasoningEffort = useGraphStore(s => s.chatReasoningEffort)
  const chatThinkingType = useGraphStore(s => s.chatThinkingType)
  const chatThinkingJson = useGraphStore(s => s.chatThinkingJson)
  const chatFrequencyPenalty = useGraphStore(s => s.chatFrequencyPenalty)
  const chatPresencePenalty = useGraphStore(s => s.chatPresencePenalty)
  const chatTopP = useGraphStore(s => s.chatTopP)
  const chatLogprobs = useGraphStore(s => s.chatLogprobs)
  const chatTopLogprobs = useGraphStore(s => s.chatTopLogprobs)
  const chatParallelToolCalls = useGraphStore(s => s.chatParallelToolCalls)
  const chatStopJson = useGraphStore(s => s.chatStopJson)
  const chatStreamOptionsJson = useGraphStore(s => s.chatStreamOptionsJson)
  const chatResponseFormatJson = useGraphStore(s => s.chatResponseFormatJson)
  const chatLogitBiasJson = useGraphStore(s => s.chatLogitBiasJson)
  const chatToolsJson = useGraphStore(s => s.chatToolsJson)
  const chatToolChoiceJson = useGraphStore(s => s.chatToolChoiceJson)
  const chatGraphSummaryMaxTokens = useGraphStore(s => s.chatGraphSummaryMaxTokens)
  const chatGuidelineDigestMaxTokens = useGraphStore(s => s.chatGuidelineDigestMaxTokens)
  const chatSystemPrompt = useGraphStore(s => s.chatSystemPrompt)
  const chatContextScope = useGraphStore(s => s.chatContextScope || 'hybrid')
  const setChatModel = useGraphStore(s => s.setChatModel)
  const updateNode = useGraphStore(s => s.updateNode)
  const pushChatExchangeLog = useGraphStore(s => s.pushChatExchangeLog)
  const pushUiLog = useGraphStore(s => s.pushUiLog)
  const requestHistorySubTab = useGraphStore(s => s.requestHistorySubTab)
  const setBottomSurfaceCollapsed = useGraphStore(s => s.setBottomSurfaceCollapsed)
  const setBottomSurfaceTab = useGraphStore(s => s.setBottomSurfaceTab)
  const pushUiToast = useGraphStore(s => s.pushUiToast)
  const upsertUiToast = useGraphStore(s => s.upsertUiToast)

  const chatStorageTarget = useGraphStore(s => (s.chatStorageTarget === 'chatHistory' ? 'chatHistory' : 'chatAgenticGraph'))
  const chatLocalStorageRootPath = useGraphStore(s => s.chatLocalStorageRootPath || CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT)
  const chatAgenticGraphWorkspacePath = useGraphStore(s => s.chatAgenticGraphWorkspacePath || null)
  const chatAgenticGraphCloudUrl = useGraphStore(s => s.chatAgenticGraphCloudUrl || null)
  const setChatAgenticGraphWorkspacePath = useGraphStore(s => s.setChatAgenticGraphWorkspacePath)
  const setChatWorkspaceStreamingState = useGraphStore(s => s.setChatWorkspaceStreamingState)
  const chatHistoryWorkspacePath = useGraphStore(s => s.chatHistoryWorkspacePath || null)
  const chatHistoryCloudUrl = useGraphStore(s => s.chatHistoryCloudUrl || null)
  const setChatHistoryWorkspacePath = useGraphStore(s => s.setChatHistoryWorkspacePath)
  const workspaceViewMode = useGraphStore(s => (s.workspaceViewMode === 'editor' ? 'editor' : 'canvas'))
  const editorWorkspacePane = useGraphStore(s => s.editorWorkspacePane)
  const markdownDocumentName = useGraphStore(s => s.markdownDocumentName || null)
  const sourceFiles = useGraphStore(s => s.sourceFiles)
  const docLocationRevision = useGraphStore(s => s.docLocationRevision)
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [input, setInput] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(false)
  const [errorText, setErrorText] = React.useState<string | null>(null)
  const [connectivity, setConnectivity] = React.useState<'unknown' | 'ok' | 'error'>('unknown')
  const [connectivityDetail, setConnectivityDetail] = React.useState<string | null>(null)
  const [streamingAssistant, setStreamingAssistant] = React.useState<StreamingAssistantState | null>(null)
  const [streamingInsights, setStreamingInsights] = React.useState<{
    reasoningPreview: string | null
    reasoningStepCount: number
    usageSummary: string | null
    finishReason: string | null
    modelId: string | null
  } | null>(null)
  const [streamingWorkspacePath, setStreamingWorkspacePath] = React.useState<string | null>(null)
  const [appendFocusRequestKey, setAppendFocusRequestKey] = React.useState(0)
  const [submitRequestKey, setSubmitRequestKey] = React.useState(0)

  const abortRef = React.useRef<AbortController | null>(null)
  const streamFollowRef = React.useRef<{ path: string; atMs: number } | null>(null)
  const streamDraftTextRef = React.useRef<{ path: string; text: string } | null>(null)
  const lastRelayLogSignatureRef = React.useRef<string | null>(null)
  const storageChatRelayConfig = React.useMemo(() => readAgenticGraphStorageChatRelayConfig(), [])
  const [storageChatSession, setStorageChatSession] = React.useState<AgenticGraphStorageChatSessionResponse | null>(null)
  const [storageChatPolicies, setStorageChatPolicies] = React.useState<AgenticGraphStorageChatPoliciesResponse | null>(null)
  const [storageChatRelayBootstrap, setStorageChatRelayBootstrap] = React.useState<{
    status: 'disabled' | 'loading' | 'ready' | 'blocked'
    detail: string | null
  }>({
    status: storageChatRelayConfig ? 'loading' : 'disabled',
    detail: storageChatRelayConfig ? 'Checking workspace relay policy...' : null,
  })
  React.useEffect(() => {
    if (isLoading) return
    setChatWorkspaceStreamingState(null)
    setStreamingInsights(null)
    setStreamingWorkspacePath(null)
  }, [isLoading, setChatWorkspaceStreamingState])
  const streamRevealSeqRef = React.useRef(0)

  React.useEffect(() => {
    if (!storageChatRelayConfig) {
      setStorageChatSession(null)
      setStorageChatPolicies(null)
      setStorageChatRelayBootstrap({ status: 'disabled', detail: null })
      return
    }
    let cancelled = false
    setStorageChatRelayBootstrap({
      status: 'loading',
      detail: 'Checking workspace relay policy...',
    })
    setStorageChatSession(null)
    setStorageChatPolicies(null)
    void (async () => {
      try {
        const session = await fetchAgenticGraphStorageChatSession({ config: storageChatRelayConfig })
        if (cancelled) return
        const membership = session.memberships.find(entry => entry.workspaceId === storageChatRelayConfig.workspaceId)
        if (!membership) {
          setStorageChatRelayBootstrap({
            status: 'blocked',
            detail: 'Workspace relay session is not a member of the configured storage workspace.',
          })
          return
        }
        const policies = await fetchAgenticGraphStorageChatPolicies({ config: storageChatRelayConfig })
        if (cancelled) return
        setStorageChatSession(session)
        setStorageChatPolicies(policies)
        setStorageChatRelayBootstrap({
          status: 'ready',
          detail: 'Workspace relay policy loaded.',
        })
      } catch (error) {
        if (cancelled) return
        setStorageChatRelayBootstrap({
          status: 'blocked',
          detail: error instanceof Error ? error.message : 'Storage chat relay bootstrap failed.',
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [storageChatRelayConfig])

  const historyKey = React.useMemo(() => buildHistoryKey(graphData), [graphData])

  const { currentNode, credentialContext } = useFloatingPanelChatCredentialContext({
    graphData,
    graphDataRevision,
    selectedNodeId,
    globalProvider: chatProvider,
    globalAuthMode: chatAuthMode,
    globalEndpointUrl: chatEndpointUrl,
    globalModel: chatModel,
  })

  const activeChatProvider = credentialContext.provider
  const activeChatAuthMode = credentialContext.authMode
  const activeChatEndpointUrl = credentialContext.endpointUrl
  const chatProviderLabel = React.useMemo(
    () => getChatProviderLabel(activeChatProvider),
    [activeChatProvider],
  )
  const credentialProviderLabel = React.useMemo(
    () => getChatProviderLabel(credentialContext.provider),
    [credentialContext.provider],
  )
  const credentialLabel = React.useMemo(
    () => getChatProviderCredentialLabel(credentialContext.provider),
    [credentialContext.provider],
  )
  const chatProviderRegion = React.useMemo(
    () => getChatProviderRegionLabel(activeChatProvider, activeChatEndpointUrl || CHAT_DEFAULT_ENDPOINT_URL),
    [activeChatEndpointUrl, activeChatProvider],
  )
  const chatProviderSummary = React.useMemo(() => {
    const modelLabel = credentialContext.model || 'model pending'
    return `${chatProviderLabel} · ${chatProviderRegion} · ${modelLabel}`
  }, [chatProviderLabel, chatProviderRegion, credentialContext.model])
  const chatProviderHint = React.useMemo(() => getChatRecommendedModelHint(activeChatProvider), [activeChatProvider])
  const storageChatProviderId = React.useMemo(
    () => toAgenticGraphStorageChatProviderId(activeChatProvider),
    [activeChatProvider],
  )
  const storageChatMembership = React.useMemo<AgenticGraphStorageChatSessionMembership | null>(() => {
    if (!storageChatRelayConfig || !storageChatSession) return null
    return storageChatSession.memberships.find(entry => entry.workspaceId === storageChatRelayConfig.workspaceId) || null
  }, [storageChatRelayConfig, storageChatSession])
  const storageChatPolicy = React.useMemo(() => {
    if (!storageChatRelayConfig || !storageChatProviderId || !storageChatPolicies) return null
    return resolveAgenticGraphStorageChatPolicy({
      workspaceId: storageChatRelayConfig.workspaceId,
      providerId: storageChatProviderId,
      policies: storageChatPolicies.policies,
    })
  }, [storageChatPolicies, storageChatProviderId, storageChatRelayConfig])
  const storageChatRelayDecision = React.useMemo<AgenticGraphStorageChatRelayDecision>(() => {
    if (!storageChatRelayConfig) return { kind: 'disabled' }
    if (!storageChatProviderId) return { kind: 'disabled' }
    if (storageChatRelayBootstrap.status === 'loading') {
      return {
        kind: 'loading',
        detail: storageChatRelayBootstrap.detail || 'Checking workspace relay policy...',
      }
    }
    if (storageChatRelayBootstrap.status === 'blocked') {
      return {
        kind: 'blocked',
        detail: storageChatRelayBootstrap.detail || 'Storage chat relay is unavailable.',
        policy: storageChatPolicy,
      }
    }
    if (!storageChatMembership) {
      return {
        kind: 'blocked',
        detail: 'Workspace relay session is not a member of the configured storage workspace.',
        policy: storageChatPolicy,
      }
    }
    if (!storageChatPolicy) {
      return {
        kind: 'blocked',
        detail: 'Workspace relay policy is unavailable for the selected provider.',
        policy: null,
      }
    }
    if (!isAgenticGraphStorageChatAuthModeAllowed(storageChatPolicy, activeChatAuthMode)) {
      return {
        kind: 'blocked',
        detail: activeChatAuthMode === 'byok'
          ? `${chatProviderLabel} BYOK relay is not enabled for this workspace.`
          : `${chatProviderLabel} server-managed relay is not enabled for this workspace.`,
        policy: storageChatPolicy,
      }
    }
    return {
      kind: 'ready',
      detail: `${chatProviderLabel} workspace relay is ready.`,
      config: storageChatRelayConfig,
      membership: storageChatMembership,
      policy: storageChatPolicy,
    }
  }, [
    activeChatAuthMode,
    chatProviderLabel,
    storageChatMembership,
    storageChatPolicy,
    storageChatProviderId,
    storageChatRelayBootstrap.detail,
    storageChatRelayBootstrap.status,
    storageChatRelayConfig,
  ])
  const visibleRelayStatus = React.useMemo<{
    tone: 'info' | 'ok' | 'error'
    detail: string
  } | null>(() => {
    if (storageChatRelayDecision.kind === 'disabled') return null
    if (!storageChatRelayDecision.detail) return null
    if (storageChatRelayDecision.kind === 'ready') {
      return {
        tone: 'ok',
        detail: storageChatRelayDecision.detail,
      }
    }
    if (storageChatRelayDecision.kind === 'blocked') {
      return {
        tone: 'error',
        detail: storageChatRelayDecision.detail,
      }
    }
    return {
      tone: 'info',
      detail: storageChatRelayDecision.detail,
    }
  }, [storageChatRelayDecision])
  const visibleRelaySummary = React.useMemo<string | null>(() => {
    if (storageChatRelayDecision.kind === 'disabled') return null
    const parts: string[] = []
    const workspaceId = String(storageChatRelayConfig?.workspaceId || '').trim()
    if (workspaceId) parts.push(`Workspace ${workspaceId}`)
    if (storageChatRelayDecision.kind === 'ready') {
      parts.push(`Role ${storageChatRelayDecision.membership.role}`)
      parts.push(`Auth ${activeChatAuthMode === 'byok' ? 'BYOK' : 'server-managed'}`)
      if (storageChatRelayDecision.policy.defaultModel) {
        parts.push(`Default model ${storageChatRelayDecision.policy.defaultModel}`)
      }
      return parts.join(' · ')
    }
    if (activeChatAuthMode === 'byok' || activeChatAuthMode === 'serverManaged') {
      parts.push(`Requested auth ${activeChatAuthMode === 'byok' ? 'BYOK' : 'server-managed'}`)
    }
    if (storageChatPolicy?.defaultModel) {
      parts.push(`Default model ${storageChatPolicy.defaultModel}`)
    }
    return parts.length > 0 ? parts.join(' · ') : null
  }, [activeChatAuthMode, storageChatPolicy, storageChatRelayConfig, storageChatRelayDecision])
  const openRelayLogView = React.useCallback(() => {
    try {
      setBottomSurfaceCollapsed(false)
    } catch {
      void 0
    }
    try {
      setBottomSurfaceTab('history')
    } catch {
      void 0
    }
    try {
      requestHistorySubTab('log')
    } catch {
      void 0
    }
  }, [requestHistorySubTab, setBottomSurfaceCollapsed, setBottomSurfaceTab])
  React.useEffect(() => {
    const relayLogDescriptor = buildStorageChatRelayLogDescriptor({
      relayDecision: storageChatRelayDecision,
      workspaceId: storageChatRelayConfig?.workspaceId || null,
      providerLabel: chatProviderLabel,
      authMode: activeChatAuthMode,
      policy: storageChatPolicy,
    })
    if (!relayLogDescriptor) {
      lastRelayLogSignatureRef.current = null
      return
    }
    if (lastRelayLogSignatureRef.current === relayLogDescriptor.signature) return
    lastRelayLogSignatureRef.current = relayLogDescriptor.signature
    pushUiLog(relayLogDescriptor.entry)
  }, [
    activeChatAuthMode,
    chatProviderLabel,
    pushUiLog,
    storageChatPolicy,
    storageChatRelayConfig,
    storageChatRelayDecision,
  ])
  const shouldShowChatApiKeyPrompt = shouldRenderFloatingChatApiKeyPrompt({
    chatAuthMode: credentialContext.authMode,
    chatProvider: credentialContext.provider,
  })

  React.useEffect(() => {
    publishLocalChatPipelineSurfaceSnapshot({
      messageCount: messages.length,
      isLoading,
      errorText,
      connectivity,
      connectivityDetail,
      chatProviderSummary,
      chatProviderHint: chatProviderHint || null,
      chatContextScope,
      chatStorageTarget,
      chatAgenticGraphWorkspacePath,
      chatHistoryWorkspacePath,
      chatAgenticGraphCloudUrl,
      chatHistoryCloudUrl,
      workspaceViewMode,
      editorWorkspacePane,
      markdownDocumentName,
      selectedNodeId: selectedNodeId || null,
      streamingAssistant: streamingAssistant
        ? {
            id: String(streamingAssistant.id || ''),
            text: String(streamingAssistant.text || ''),
            reasoningPreview: String(streamingAssistant.reasoningPreview || ''),
            reasoningStepCount: Number(streamingAssistant.reasoningStepCount || 0),
            usageSummary: String(streamingAssistant.usageSummary || ''),
            finishReason: String(streamingAssistant.finishReason || ''),
            modelId: String(streamingAssistant.modelId || ''),
          }
        : null,
      streamingInsights: streamingInsights
        ? {
            reasoningPreview: String(streamingInsights.reasoningPreview || ''),
            reasoningStepCount: Number(streamingInsights.reasoningStepCount || 0),
            usageSummary: String(streamingInsights.usageSummary || ''),
            finishReason: String(streamingInsights.finishReason || ''),
            modelId: String(streamingInsights.modelId || ''),
          }
        : null,
      streamingWorkspacePath,
      streamFollowPath: streamFollowRef.current?.path || null,
      streamDraft: streamDraftTextRef.current
        ? {
            path: String(streamDraftTextRef.current.path || ''),
            text: String(streamDraftTextRef.current.text || ''),
          }
        : null,
    })
    return () => {
      clearLocalChatPipelineSurfaceSnapshot()
    }
  }, [
    chatContextScope,
    chatHistoryCloudUrl,
    chatHistoryWorkspacePath,
    chatAgenticGraphCloudUrl,
    chatAgenticGraphWorkspacePath,
    chatProviderHint,
    chatProviderSummary,
    chatStorageTarget,
    connectivity,
    connectivityDetail,
    editorWorkspacePane,
    errorText,
    isLoading,
    markdownDocumentName,
    messages.length,
    selectedNodeId,
    streamingAssistant,
    streamingInsights,
    streamingWorkspacePath,
    workspaceViewMode,
  ])

  const chatModelSelect = React.useMemo(() => {
    return resolveSharedChatModelSelect({
      chatModel: credentialContext.model,
      chatProvider: activeChatProvider,
    })
  }, [activeChatProvider, credentialContext.model])

  const handleChatModelChanged = React.useCallback((nextModel: string) => {
    if (credentialContext.source !== 'selection' || !currentNode) {
      setChatModel(nextModel)
      return
    }
    const route = resolveChatModelSelectionValues({
      currentEndpointUrl: activeChatEndpointUrl,
      currentProvider: activeChatProvider,
      model: nextModel,
    })
    const nodeId = String(unwrapGraphCellValue(currentNode.id) || '').trim()
    if (!nodeId) return
    updateNode(nodeId, {
      properties: {
        ...readGraphNodeProperties(currentNode),
        chatProvider: route.chatProvider,
        chatEndpointUrl: route.chatEndpointUrl,
        chatModel: route.chatModel,
      },
    })
  }, [activeChatEndpointUrl, activeChatProvider, credentialContext.source, currentNode, setChatModel, updateNode])

  const clearCurrentHistory = React.useCallback(() => {
    setMessages([])
    putChatHistoryCache(historyKey, [])
    const storage = getLocalStorage()
    if (!storage) return
    try {
      storage.removeItem(historyKey)
    } catch {
      void 0
    }
  }, [historyKey])

  const openWorkspaceMarkdownPath = React.useCallback((path: string) => {
    openMarkdownWorkspacePathInExplorer(path)
  }, [])

  const followWorkspaceMarkdownPath = React.useCallback((path: string, options?: { forceReveal?: boolean }) => {
    const normalized = normalizeMarkdownWorkspaceSelectionPath(path as never) || path
    const nowMs = Date.now()
    const prevFollow = streamFollowRef.current
    const samePath = !!prevFollow && prevFollow.path === normalized
    const forceReveal = options?.forceReveal === true
    if (!samePath || workspaceViewMode !== 'editor' || editorWorkspacePane !== 'markdown') {
      openMarkdownWorkspaceEditorPane(useGraphStore.getState())
    }
    const explorer = useMarkdownExplorerStore.getState()
    const activePath = String(explorer.activePath || '').trim()
    if (!samePath || activePath !== normalized) explorer.setActivePath(normalized)
    lsSetJson<'split' | 'editor' | 'viewer'>(LS_KEYS.markdownLayoutMode, 'editor')
    emitMarkdownLayoutRequest('editor')
    if (forceReveal || !samePath || nowMs - prevFollow.atMs >= 180) {
      streamRevealSeqRef.current = (streamRevealSeqRef.current + 1) % 2
      const tailLine = Number.MAX_SAFE_INTEGER - streamRevealSeqRef.current
      explorer.requestRevealLine(tailLine)
      streamFollowRef.current = { path: normalized, atMs: nowMs }
    }
  }, [editorWorkspacePane, workspaceViewMode])

  const stopActiveChatStream = React.useCallback(() => {
    stopFloatingPanelChatStream({
      setIsLoading,
      abortRef,
      setStreamingWorkspacePath,
      setChatWorkspaceStreamingState,
      setStreamingAssistant,
      setStreamingInsights,
      streamFollowRef,
      streamDraftTextRef,
    })
  }, [setChatWorkspaceStreamingState])

  const handleNewChat = React.useCallback(async () => {
    if (chatStorageTarget !== 'chatAgenticGraph') return
    if (isLoading) {
      stopActiveChatStream()
      setIsLoading(false)
    }
    setErrorText(null)
    setConnectivity('unknown')
    setConnectivityDetail(null)
    setInput('')
    setStreamingAssistant(null)
    setStreamingInsights(null)
    setStreamingWorkspacePath(null)
    setChatWorkspaceStreamingState(null)
    streamFollowRef.current = null
    streamDraftTextRef.current = null
    const timestampMs = Date.now()
    try {
      const nextPath = await createNewChatHistoryWorkspaceFilePath(timestampMs, {
        storageType: 'chatAgenticGraph',
        defaultLocalRootPath: chatLocalStorageRootPath,
      })
      await ensureChatStreamArtifactBundleInitialized({
        workspacePath: nextPath,
        timestampMs,
        defaultLocalRootPath: chatLocalStorageRootPath,
      })
      useGraphStore.setState({ workspaceGraphMutationLayoutLockActive: false })
      followWorkspaceMarkdownPath(nextPath, { forceReveal: true })
      setChatAgenticGraphWorkspacePath(nextPath)
      clearCurrentHistory()
    } catch {
      setErrorText(UI_COPY.chatNewChatFailedError)
    }
  }, [
    chatLocalStorageRootPath,
    chatStorageTarget,
    clearCurrentHistory,
    followWorkspaceMarkdownPath,
    isLoading,
    setChatAgenticGraphWorkspacePath,
    stopActiveChatStream,
  ])

  const {
    appendPrompt: appendChatPrompt,
    contextItems: chatContextItems,
    pipelineStages: chatPipelineStages,
    quickActions: chatQuickActions,
    workspaceContextCacheKey,
  } = useFloatingPanelChatSurfaceModel({
    chatContextScope, markdownDocumentName, markdownText, docLocationRevision, sourceFiles,
    graphData, workspaceViewMode, chatAgenticGraphWorkspacePath, chatHistoryWorkspacePath,
    currentNode, messageCount: messages.length, isLoading,
  })

  useFloatingPanelChatHistory({
    historyKey,
    isLoading,
    messages,
    setMessages,
    streamingAssistant,
  })
  const chatThreadStreamRevision = [
    streamingAssistant?.text.length || 0,
    streamingInsights?.reasoningPreview?.length || 0,
    streamingInsights?.usageSummary?.length || 0,
    streamingInsights?.finishReason?.length || 0,
    streamingWorkspacePath?.length || 0,
  ].join('\u0000')
  const chatThreadFollow = useFloatingPanelChatThreadFollow({
    isLoading,
    messageCount: messages.length,
    streamRevision: chatThreadStreamRevision,
  })

  React.useEffect(() => {
    return () => {
      if (readActiveDurableChatStreamRun()) return
      const ctrl = abortRef.current
      if (!ctrl) return
      try {
        ctrl.abort()
      } catch {
        void 0
      }
    }
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (ev: Event) => {
      const e = ev as CustomEvent<{ text?: string; mode?: 'append' | 'replace'; submit?: boolean } | undefined>
      const detail = resolveFloatingPanelChatInputAppend(e.detail)
      if (!detail) return
      setInput(prev => applyFloatingPanelChatInputAppend(prev, detail))
      setAppendFocusRequestKey(previous => previous + 1)
      if (detail.submit) setSubmitRequestKey(previous => previous + 1)
    }
    window.addEventListener(CHAT_INPUT_APPEND_EVENT, handler as EventListener)
    flushFloatingPanelChatInputHandoff()
    return () => {
      window.removeEventListener(CHAT_INPUT_APPEND_EVENT, handler as EventListener)
    }
  }, [])

  const finalizeAssistantSuccess = useFinalizeAssistantSuccess({
    chatStorageTarget,
    chatProviderSummary,
    chatAgenticGraphWorkspacePath,
    chatHistoryWorkspacePath,
    chatLocalStorageRootPath,
    setChatAgenticGraphWorkspacePath,
    setChatHistoryWorkspacePath,
    followWorkspaceMarkdownPath,
    pushChatExchangeLog,
    upsertUiToast,
    setMessages,
    setStreamingAssistant,
    streamFollowRef,
    streamDraftTextRef,
  })

  useResumeDurableChatStream({
    isLoading,
    chatStorageTarget,
    chatProviderSummary,
    chatLocalStorageRootPath,
    chatModelId: chatModelSelect.modelId,
    setIsLoading,
    setErrorText,
    setConnectivity,
    setConnectivityDetail,
    setStreamingAssistant,
    setStreamingInsights,
    setStreamingWorkspacePath,
    setChatWorkspaceStreamingState,
    setChatAgenticGraphWorkspacePath,
    setMessages,
    followWorkspaceMarkdownPath,
    finalizeAssistantSuccess,
    abortRef,
    streamFollowRef,
    streamDraftTextRef,
  })

  const handleSubmit = useFloatingPanelChatSubmit({
    historyKey,
    graphData,
    currentNode,
    markdownText,
    markdownDocumentName,
    sourceFiles,
    workspaceContextCacheKey,
    chatProvider: activeChatProvider,
    chatAuthMode: activeChatAuthMode,
    chatApiKey,
    chatEndpointUrl: activeChatEndpointUrl,
    chatModel: chatModelSelect.modelId,
    chatTemperature,
    chatMaxCompletionTokens,
    chatServiceTier,
    chatStream,
    chatMessagesJson,
    chatReasoningEffort,
    chatThinkingType,
    chatThinkingJson,
    chatFrequencyPenalty,
    chatPresencePenalty,
    chatTopP,
    chatLogprobs,
    chatTopLogprobs,
    chatParallelToolCalls,
    chatStopJson,
    chatStreamOptionsJson,
    chatResponseFormatJson,
    chatLogitBiasJson,
    chatToolsJson,
    chatToolChoiceJson,
    chatGraphSummaryMaxTokens,
    chatGuidelineDigestMaxTokens,
    chatSystemPrompt,
    chatContextScope: (chatContextScope === 'selection' || chatContextScope === 'workspace') ? chatContextScope : 'hybrid',
    chatStorageTarget,
    chatLocalStorageRootPath,
    chatAgenticGraphWorkspacePath,
    storageChatRelayDecision,
    setChatAgenticGraphWorkspacePath,
    setChatWorkspaceStreamingState,
    chatProviderSummary,
    setChatModel,
    messages,
    setMessages,
    input,
    setInput,
    isLoading,
    setIsLoading,
    setErrorText,
    setConnectivity,
    setConnectivityDetail,
    setStreamingAssistant,
    setStreamingWorkspacePath,
    abortRef,
    streamDraftTextRef,
    streamFollowRef,
    followWorkspaceMarkdownPath,
    finalizeAssistantSuccess,
    pushChatExchangeLog,
    persistChatExchangeLog,
    pushUiLog,
    requestHistorySubTab,
    setStreamingInsights,
  })
  const nativeImportUrlInputReady = isNativeImportUrlInvocationAttempt(input)

  return (
    <section className="h-full flex flex-col">
      <section
        ref={chatThreadFollow.scrollRef}
        onScroll={chatThreadFollow.onScroll}
        className={`${UI_RESPONSIVE_FLOATING_PANEL_SCROLL_CLASSNAME} p-2 space-y-2`}
      >
        <FloatingPanelChatMessagesSection
          messages={messages}
          isLoading={isLoading}
          historyKey={historyKey}
          contextItems={chatContextItems}
          pipelineStages={chatPipelineStages}
          onPipelineStageAction={appendChatPrompt}
          uiPanelTextFontClass={uiPanelTextFontClass}
          uiPanelKeyValueTextSizeClass={uiPanelKeyValueTextSizeClass}
          uiPanelMicroLabelTextSizeClass={uiPanelMicroLabelTextSizeClass}
          streamingReasoningPreview={streamingInsights?.reasoningPreview || null}
          streamingUsageSummary={streamingInsights?.usageSummary || null}
          streamingFinishReason={streamingInsights?.finishReason || null}
          streamingAssistant={streamingAssistant}
          writingWorkspaceFileLabel={
            isLoading && chatStorageTarget === 'chatAgenticGraph' && streamingWorkspacePath
              ? `Writing to ${(streamingWorkspacePath.split('/').filter(Boolean).slice(-1)[0] || 'kgc.md')}...`
              : null
          }
          onOpenWorkspacePath={openWorkspaceMarkdownPath}
          quickActions={messages.length === 0 ? chatQuickActions : []} onQuickAction={appendChatPrompt} setMessages={setMessages}
        />
      </section>

      <FloatingPanelChatFooter
        input={input}
        setInput={setInput}
        appendFocusRequestKey={appendFocusRequestKey}
        submitRequestKey={submitRequestKey}
        isLoading={isLoading}
        errorText={errorText}
        connectivity={connectivity}
        connectivityDetail={connectivityDetail}
        relayStatus={visibleRelayStatus}
        relaySummary={visibleRelaySummary}
        relayAction={visibleRelayStatus || visibleRelaySummary ? { label: 'Open Log', onClick: openRelayLogView } : null}
        apiKeyPrompt={shouldShowChatApiKeyPrompt ? { providerLabel: credentialProviderLabel, credentialLabel, value: chatApiKey || '', onChange: setChatApiKey } : null}
        currentNode={currentNode}
        modelId={chatModelSelect.modelId}
        modelOptions={chatModelSelect.options}
        onModelChanged={handleChatModelChanged}
        uiPanelTextFontClass={uiPanelTextFontClass}
        uiPanelMicroLabelTextSizeClass={uiPanelMicroLabelTextSizeClass}
        isSubmitDisabled={!input.trim() || isLoading || (!chatModelSelect.modelId && !nativeImportUrlInputReady)}
        onSubmit={handleSubmit}
        onStop={stopActiveChatStream}
        showNewChatButton={chatStorageTarget === 'chatAgenticGraph'}
        onNewChat={handleNewChat}
        quickActions={messages.length === 0 ? [] : chatQuickActions}
        onQuickAction={appendChatPrompt}
        markdownText={markdownText}
      />
    </section>
  )
}
