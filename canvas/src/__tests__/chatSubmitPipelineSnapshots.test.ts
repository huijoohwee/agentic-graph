import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { FloatingPanelChatSubmitArgs } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitTypes'
import { buildNeutralKgcFixtureDocument } from '@/__tests__/helpers/neutralKgcFixture'
import { executeFloatingPanelChatSubmitCoordinator } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitCoordinator'
import { useFinalizeAssistantSuccess } from '@/features/chat/floatingPanelChat/useFinalizeAssistantSuccess'
import { isKgcStructuredMarkdown } from '@/features/chat/chatHistoryWorkspace'
import {
  publishLocalChatPipelineSurfaceSnapshot,
  readLocalChatPipelineSurfaceSnapshot,
  resetBrowserLocalSurfaceSnapshotsForTests,
} from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import { inspectLocalChatPipelineState } from '@/features/agent-ready/localChatPipelineStateInspection'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'

const buildSubmitArgsFixture = (overrides: Partial<FloatingPanelChatSubmitArgs> = {}): FloatingPanelChatSubmitArgs => ({
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
  chatStorageTarget: 'chatAgenticGraph',
  chatLocalStorageRootPath: '/workspace/chat',
  chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T193000Z/kgc_20260522T193000Z.md',
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

const seedChatPipelineSnapshot = () => {
  publishLocalChatPipelineSurfaceSnapshot({
    messageCount: 1,
    isLoading: true,
    errorText: null,
    connectivity: 'unknown',
    connectivityDetail: null,
    chatProviderSummary: 'openai:gpt-4.1-mini',
    chatProviderHint: null,
    chatContextScope: 'workspace',
    chatStorageTarget: 'chatAgenticGraph',
    chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T193000Z/kgc_20260522T193000Z.md',
    chatHistoryWorkspacePath: null,
    workspaceViewMode: 'workspace',
    editorWorkspacePane: 'markdown',
    markdownDocumentName: null,
    selectedNodeId: null,
    streamingAssistant: { id: 'assistant-pending', text: 'Streaming...' },
    streamingWorkspacePath: '/workspace/chat/20260522T193000Z/kgc_20260522T193000Z.md',
    streamFollowPath: '/workspace/chat/20260522T193000Z/kgc_20260522T193000Z.md',
    streamDraft: {
      path: '/workspace/chat/20260522T193000Z/kgc_20260522T193000Z.md',
      text: '_Streaming..._',
    },
  })
}

export async function testExecuteFloatingPanelChatSubmitCoordinatorPublishesRetryThenAppliedPipelineSnapshots() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  const previousFetch = globalThis.fetch
  let finalizeAssistantSuccess: FloatingPanelChatSubmitArgs['finalizeAssistantSuccess'] | null = null
  let transportCallCount = 0
  let retryInspection: ReturnType<typeof inspectLocalChatPipelineState> | null = null
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const connectivityDetail: Array<string | null> = []
  const followedPaths: string[] = []

  try {
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()
    globalThis.fetch = (async () => ({ ok: true, status: 200, headers: new Headers() } as Response)) as typeof fetch
    seedChatPipelineSnapshot()

    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)

    const HookHarness = () => {
      const [, setMessages] = React.useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([])
      const [, setStreamingAssistant] = React.useState<{ id: string; text: string } | null>(null)
      const callback = useFinalizeAssistantSuccess({
        chatStorageTarget: 'chatAgenticGraph',
        chatProviderSummary: 'openai:gpt-4.1-mini',
        chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T193000Z/kgc_20260522T193000Z.md',
        chatHistoryWorkspacePath: null,
        chatLocalStorageRootPath: '/workspace/chat',
        setChatAgenticGraphWorkspacePath: () => {},
        setChatHistoryWorkspacePath: () => {},
        followWorkspaceMarkdownPath: path => { followedPaths.push(path) },
        pushChatExchangeLog: () => {},
        setMessages,
        setStreamingAssistant,
        streamFollowRef: { current: { path: '/workspace/chat/20260522T193000Z/kgc_20260522T193000Z.md', atMs: Date.UTC(2026, 4, 22, 19, 30, 0) } },
        streamDraftTextRef: { current: { path: '/workspace/chat/20260522T193000Z/kgc_20260522T193000Z.md', text: '_Streaming..._' } },
      })
      React.useEffect(() => {
        finalizeAssistantSuccess = callback
      }, [callback])
      return null
    }

    await mountReactRoot(root, React.createElement(HookHarness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    if (!finalizeAssistantSuccess) {
      throw new Error('Expected finalize hook harness to expose the submit finalize callback')
    }

    const requestText = 'Generate KGC'
    const canonical = buildNeutralKgcFixtureDocument({
      timestampMs: Date.UTC(2026, 4, 22, 19, 30, 0),
      workspacePath: '/workspace/chat/20260522T193000Z/kgc_20260522T193000Z.md',
      requestText,
      assistantText: 'Recover with a neutral KGC document that proves retry, Source Files landing, Editor Workspace handoff, and Canvas apply.',
      expectationLabel: 'neutral pipeline snapshot KGC fixture',
    })
    const submitArgs = buildSubmitArgsFixture({
      finalizeAssistantSuccess,
      setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
      setConnectivityDetail: value => { connectivityDetail.push(typeof value === 'function' ? null : value) },
      followWorkspaceMarkdownPath: path => { followedPaths.push(path) },
      abortRef: { current: null },
      streamDraftTextRef: { current: { path: '/workspace/chat/20260522T193000Z/kgc_20260522T193000Z.md', text: '_Streaming..._' } },
      streamFollowRef: { current: { path: '/workspace/chat/20260522T193000Z/kgc_20260522T193000Z.md', atMs: Date.UTC(2026, 4, 22, 19, 30, 0) } },
    })

    await act(async () => {
      await executeFloatingPanelChatSubmitCoordinator({
        submitArgs,
        requestUrl: 'https://chat.example.test/v1/chat/completions',
        trimmedInput: requestText,
        assistantMessageId: 'assistant-pending',
        nextMessages: [{ id: 'user-1', role: 'user', content: requestText }],
        requestTimestampMs: Date.UTC(2026, 4, 22, 19, 30, 0),
        traceId: 'trace-webmcp-retry-ready',
        bootstrapDraft: async () => '/workspace/chat/20260522T193000Z/kgc_20260522T193000Z.md',
        buildRequestContext: async () => ({
          packedContext: { selected_node: null, connected_edges: [], frontmatter: null, graph_summary: '', guideline_digest: '' },
          systemMessages: [{ role: 'system', content: 'base-system' }],
          conversationMessages: [{ id: 'user-1', role: 'user', content: requestText }],
        }),
        createRequestSender: () => async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
        resolveInitialModel: () => ({ providerModelOptions: ['model-a'], effectiveModel: 'model-a' }),
        executeTransportAttempt: async () => {
          transportCallCount += 1
          if (transportCallCount === 2) {
            retryInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
          }
          return {
            response: new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
            effectiveModel: 'model-a',
            detail: null,
          }
        },
        createDraftWriter: () => async () => {},
        readAssistantResponse: async () => ({
          assistantText: transportCallCount === 1 ? 'This answer is missing canonical KGC markdown.' : canonical,
          rawSseEvents: [],
          reasoningSteps: [],
          reasoningPreview: null,
          reasoningStepCount: 0,
          usageSummary: null,
          finishReason: transportCallCount === 1 ? null : 'stop',
          modelId: 'model-a',
        }),
      })
    })

    const finalInspection = inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot())
    const graphState = useGraphStore.getState()

    if (transportCallCount !== 2) {
      throw new Error(`Expected retry path to issue exactly two transport attempts, got ${transportCallCount}`)
    }
    if (!retryInspection || retryInspection.kgcValidation.stage !== 'retrying') {
      throw new Error(`Expected WebMCP-facing pipeline inspection to expose retrying state before the recovery attempt, got ${JSON.stringify(retryInspection?.kgcValidation || null)}`)
    }
    if (retryInspection.kgcValidation.failedRuleId !== 'V-03' || retryInspection.kgcValidation.hasYamlFrontmatter !== false) {
      throw new Error(`Expected retrying inspection to expose the missing-KGC validation failure, got ${JSON.stringify(retryInspection.kgcValidation)}`)
    }
    if (!retryInspection.kgcValidation.correctionPromptPreview) {
      throw new Error(`Expected retrying inspection to include a correction prompt preview, got ${JSON.stringify(retryInspection.kgcValidation)}`)
    }
    if (finalInspection.kgcValidation.stage !== 'validated' || finalInspection.finalize.stage !== 'applied') {
      throw new Error(`Expected final inspection to expose validated/applied pipeline state, got ${JSON.stringify({ kgcValidation: finalInspection.kgcValidation, finalize: finalInspection.finalize })}`)
    }
    if (connectivity[0] !== 'ok' || connectivityDetail[0] !== null) {
      throw new Error(`Expected coordinator helper to mark connectivity ok after retry recovery, got ${JSON.stringify({ connectivity, connectivityDetail })}`)
    }
    if (!followedPaths.includes('/workspace/chat/20260522T193000Z/kgc_20260522T193000Z.md')) {
      throw new Error(`Expected retry recovery finalize flow to follow the canonical AgenticGraph workspace path, got ${JSON.stringify(followedPaths)}`)
    }
    if (
      !String(graphState.markdownDocumentName || '').endsWith('kgc_20260522T193000Z.md') ||
      !isKgcStructuredMarkdown(String(graphState.markdownDocumentText || ''))
    ) {
      throw new Error(`Expected retry recovery finalize flow to apply the canonical KGC document to the active canvas state, got ${JSON.stringify({ markdownDocumentName: graphState.markdownDocumentName, markdownDocumentText: graphState.markdownDocumentText?.slice(0, 40) || '' })}`)
    }
    const sourcePath = 'workspace:/workspace/chat/20260522T193000Z/kgc_20260522T193000Z.md'
    const sourceFile = graphState.sourceFiles.find(file => String(file?.source?.path || '') === sourcePath) || null
    if (!sourceFile || sourceFile.enabled !== true || sourceFile.status !== 'parsed' || !sourceFile.parsedGraphData) {
      throw new Error(`Expected retry recovery finalize flow to land the canonical KGC document in parsed Source Files for shared renderers, got ${JSON.stringify(graphState.sourceFiles.map(file => ({ name: file.name, source: file.source?.path, enabled: file.enabled, status: file.status, parsed: Boolean(file.parsedGraphData) })))}`)
    }
  } finally {
    if (root) {
      await unmountReactRoot(root, { window: dom.window as unknown as Window })
    }
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()
    globalThis.fetch = previousFetch
    restoreDom()
    restoreWindow()
  }
}
