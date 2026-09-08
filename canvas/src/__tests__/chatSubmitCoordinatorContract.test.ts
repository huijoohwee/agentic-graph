import React, { act } from 'react'
import { withDurableBrowserStorage } from '@/__tests__/helpers/durable-browser-storage'
import { createFixture, type Fixture } from '@/__tests__/helpers/native-agentic-graph-storage-fixture'
import { cancelAgenticGraphStorageSync } from '@/lib/storage/agentic-graph-storage-client-sync'
import { createRoot } from 'react-dom/client'
import type { FloatingPanelChatSubmitArgs } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitTypes'
import { buildSubmitArgsFixture } from '@/__tests__/helpers/chatSubmitArgsFixture'
import { bootstrapAgenticGraphSubmitDraft } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitPreflight'
import { executeFloatingPanelChatSubmitCoordinator } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitCoordinator'
import { useFloatingPanelChatSubmit } from '@/features/chat/floatingPanelChat/useFloatingPanelChatSubmit'
import { useFinalizeAssistantSuccess } from '@/features/chat/floatingPanelChat/useFinalizeAssistantSuccess'
import { publishLocalChatPipelineSurfaceSnapshot, readLocalChatPipelineSurfaceSnapshot, resetBrowserLocalSurfaceSnapshotsForTests } from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import { buildNeutralAgenticOsFixtureDocument } from '@/__tests__/helpers/neutralAgenticOsFixture'
import { inspectLocalChatPipelineState } from '@/features/agent-ready/localChatPipelineStateInspection'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { installDeterministicRaf, mountReactRoot, unmountReactRoot } from '@/tests/lib/reactRootHarness'
import { resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'

export async function testBootstrapAgenticGraphSubmitDraftStreamsTraceWorkspaceAndKeepsCanonicalOutputPath() {
  const streamingWorkspaceWrites: Array<string | null> = []
  const streamingStates: Array<{ path: string | null; text: string }> = []
  const followed: string[] = []
  const resolvedPaths: string[] = []
  const submitArgs = buildSubmitArgsFixture({
    chatStorageTarget: 'chatAgenticGraph',
    chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T170000Z/agenticOs_20260522T170000Z.md',
    setChatAgenticGraphWorkspacePath: path => { resolvedPaths.push(path) },
    setStreamingWorkspacePath: value => { streamingWorkspaceWrites.push(typeof value === 'function' ? null : value) },
    setChatWorkspaceStreamingState: value => {
      streamingStates.push({
        path: String(value?.path || '').trim() || null,
        text: String(value?.text || ''),
      })
    },
    followWorkspaceMarkdownPath: path => { followed.push(path) },
  })
  const liveAgenticOsPath = await bootstrapAgenticGraphSubmitDraft({
    submitArgs,
    requestTimestampMs: Date.UTC(2026, 4, 22, 17, 0, 0),
    trimmedInput: 'Generate AGENTIC_OS',
    traceId: 'trace-preflight',
    ensureWorkspacePath: async () => '/workspace/chat/20260522T170000Z/agenticOs_20260522T170000Z.md',
  })
  if (liveAgenticOsPath !== '/workspace/chat/20260522T170000Z/agenticOs_20260522T170000Z.md') {
    throw new Error(`Expected preflight bootstrap to resolve the agentic-graph workspace path, got: ${liveAgenticOsPath}`)
  }
  if (
    streamingWorkspaceWrites.length !== 1 ||
    streamingWorkspaceWrites[0] !== '/workspace/chat/20260522T170000Z/agentic-os-trace_20260522T170000Z.md'
  ) {
    throw new Error(`Expected preflight bootstrap to point streaming workspace at the AGENTIC_OS trace path, got: ${JSON.stringify(streamingWorkspaceWrites)}`)
  }
  if (
    streamingStates.length !== 1 ||
    streamingStates[0]?.path !== '/workspace/chat/20260522T170000Z/agentic-os-trace_20260522T170000Z.md' ||
    streamingStates[0]?.text !== '_Streaming..._'
  ) {
    throw new Error(`Expected preflight bootstrap to expose the trace draft in live workspace state, got: ${JSON.stringify(streamingStates)}`)
  }
  if (followed.length !== 1 || followed[0] !== '/workspace/chat/20260522T170000Z/agentic-os-trace_20260522T170000Z.md') {
    throw new Error(`Expected preflight bootstrap to follow the live AGENTIC_OS trace workspace exactly once, got: ${JSON.stringify(followed)}`)
  }
}

export async function testExecuteFloatingPanelChatSubmitCoordinatorFinalizesSimpleChatHistorySuccess() {
  const finalized: Array<{ modelId: string; rawAssistantText: string }> = []
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const connectivityDetail: Array<string | null> = []
  const terminalResets: string[] = []
  const submitArgs = buildSubmitArgsFixture({
    chatStorageTarget: 'chatHistory',
    finalizeAssistantSuccess: async payload => {
      finalized.push({ modelId: payload.modelId, rawAssistantText: payload.rawAssistantText })
    },
    setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
    setConnectivityDetail: value => { connectivityDetail.push(typeof value === 'function' ? null : value) },
    abortRef: { current: null },
    streamDraftTextRef: { current: null },
    streamFollowRef: { current: null },
  })
  await executeFloatingPanelChatSubmitCoordinator({
    submitArgs,
    requestUrl: 'https://chat.example.test/v1/chat/completions',
    trimmedInput: 'Generate AGENTIC_OS',
    assistantMessageId: 'assistant-pending',
    nextMessages: [{ id: 'user-1', role: 'user', content: 'Generate AGENTIC_OS' }],
    requestTimestampMs: Date.UTC(2026, 4, 22, 18, 0, 0),
    traceId: 'trace-coordinator',
    bootstrapDraft: async () => null,
    buildRequestContext: async () => ({
      packedContext: { selected_node: null, connected_edges: [], frontmatter: null, graph_summary: '', guideline_digest: '' },
      systemMessages: [{ role: 'system', content: 'base-system' }],
      conversationMessages: [{ role: 'user', content: 'Generate AGENTIC_OS' }],
    }),
    createRequestSender: () => async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    resolveInitialModel: () => ({ providerModelOptions: ['model-a'], effectiveModel: 'model-a' }),
    executeTransportAttempt: async args => ({
      response: await args.sendChat('model-a', 'max_completion_tokens'),
      effectiveModel: 'model-a',
      detail: null,
    }),
    createDraftWriter: () => async () => {},
    readAssistantResponse: async () => ({
      assistantText: 'assistant response',
      rawSseEvents: [],
      reasoningSteps: [],
      reasoningPreview: null,
      reasoningStepCount: 0,
      usageSummary: null,
      finishReason: null,
      modelId: 'model-a',
    }),
    finalizeTerminal: () => { terminalResets.push('done') },
  })
  if (finalized.length !== 1 || finalized[0]?.rawAssistantText !== 'assistant response') {
    throw new Error(`Expected coordinator helper to finalize one successful assistant response, got: ${JSON.stringify(finalized)}`)
  }
  if (connectivity[0] !== 'ok' || connectivityDetail[0] !== null) {
    throw new Error(`Expected coordinator helper to mark connectivity ok on success, got: ${JSON.stringify({ connectivity, connectivityDetail })}`)
  }
  if (terminalResets.length !== 1) {
    throw new Error(`Expected coordinator helper to perform one terminal reset on success, got: ${terminalResets.length}`)
  }

}

export async function testExecuteFloatingPanelChatSubmitCoordinatorPersistsLiveAgenticOsTraceDrafts() {
  const createDraftWriterCalls: Array<{
    liveAgenticOsPath: string | null
    persistWorkspaceDrafts?: boolean
    traceId: string
  }> = []
  const draftFlushes: Array<{ text: string; force: boolean }> = []
  const submitArgs = buildSubmitArgsFixture({
    chatStorageTarget: 'chatAgenticGraph',
    chatLocalStorageRootPath: '/workspace/chat',
    chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T181000Z/agenticOs_20260522T181000Z.md',
    abortRef: { current: null },
    streamDraftTextRef: { current: null },
    streamFollowRef: { current: null },
  })

  await executeFloatingPanelChatSubmitCoordinator({
    submitArgs,
    requestUrl: 'https://chat.example.test/v1/chat/completions',
    trimmedInput: 'Generate durable AGENTIC_OS',
    assistantMessageId: 'assistant-pending',
    nextMessages: [{ id: 'user-1', role: 'user', content: 'Generate durable AGENTIC_OS' }],
    requestTimestampMs: Date.UTC(2026, 4, 22, 18, 10, 0),
    traceId: 'trace-durable-stream',
    bootstrapDraft: async () => '/workspace/chat/20260522T181000Z/agenticOs_20260522T181000Z.md',
    buildRequestContext: async () => ({
      packedContext: { selected_node: null, connected_edges: [], frontmatter: null, graph_summary: '', guideline_digest: '' },
      systemMessages: [{ role: 'system', content: 'base-system' }],
      conversationMessages: [{ role: 'user', content: 'Generate durable AGENTIC_OS' }],
    }),
    createRequestSender: () => async () => new Response('{}', { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    resolveInitialModel: () => ({ providerModelOptions: ['model-a'], effectiveModel: 'model-a' }),
    executeTransportAttempt: async args => ({
      response: await args.sendChat('model-a', 'max_completion_tokens'),
      effectiveModel: 'model-a',
      detail: null,
    }),
    createDraftWriter: draftArgs => {
      createDraftWriterCalls.push({
        liveAgenticOsPath: draftArgs.liveAgenticOsPath,
        persistWorkspaceDrafts: draftArgs.persistWorkspaceDrafts,
        traceId: draftArgs.traceId,
      })
      return async (text, force) => {
        draftFlushes.push({ text, force })
      }
    },
    readAssistantResponse: async streamArgs => {
      await streamArgs.flushDraft('partial durable stream', false)
      return {
        assistantText: 'partial durable stream',
        rawSseEvents: [],
        reasoningSteps: [],
        reasoningPreview: null,
        reasoningStepCount: 0,
        usageSummary: null,
        finishReason: null,
        modelId: 'model-a',
      }
    },
    resolveAgenticGraphAttempt: args => ({
      kind: 'final',
      finalAssistantText: args.assistantText,
      validatedAgenticOs: null,
      status: 'ok',
      validation: {
        stage: 'validated',
        attempt: args.attempt,
        maxAttempts: args.maxValidationAttempts,
        failedRuleId: null,
        failedMessage: null,
        correctionPromptPreview: null,
        hasStructuredAgenticOs: false,
        hasStructuredResponseSurface: true,
        hasYamlFrontmatter: false,
        validatedAgenticOsLength: 0,
      },
    }),
  })

  if (createDraftWriterCalls.length !== 1) {
    throw new Error(`Expected coordinator to create one streaming draft writer, got: ${createDraftWriterCalls.length}`)
  }
  const call = createDraftWriterCalls[0]
  if (!call || call.liveAgenticOsPath !== '/workspace/chat/20260522T181000Z/agenticOs_20260522T181000Z.md') {
    throw new Error(`Expected coordinator to bind stream drafts to the live AGENTIC_OS path, got: ${JSON.stringify(createDraftWriterCalls)}`)
  }
  if (call.persistWorkspaceDrafts !== true) {
    throw new Error(`Expected coordinator to persist live trace drafts for refresh recovery, got: ${JSON.stringify(call)}`)
  }
  if (draftFlushes.length !== 1 || draftFlushes[0]?.text !== 'partial durable stream') {
    throw new Error(`Expected streamed content to flow through the durable draft writer, got: ${JSON.stringify(draftFlushes)}`)
  }
}

export async function testExecuteFloatingPanelChatSubmitCoordinatorPublishesValidatedAndAppliedPipelineSnapshots() {
  return withDurableBrowserStorage(async () => {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  const previousFetch = globalThis.fetch
  const settings = {
    VITE_AGENTIC_OS_STORAGE_RUNTIME_SYNC_ENABLED: '1',
    VITE_AGENTIC_OS_STORAGE_BASE_URL: dom.window.location.origin,
    VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID: 'workspace:coordinator-native-storage',
    VITE_AGENTIC_OS_GITHUB_WRITE_ENABLED: '0',
  }
  const previousSettings = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]))
  let fixture: Fixture | undefined
  let finalizeAssistantSuccess: FloatingPanelChatSubmitArgs['finalizeAssistantSuccess'] | null = null
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const connectivityDetail: Array<string | null> = []
  const resolvedAgenticGraphPaths: string[] = []
  const followedPaths: string[] = []
  const exchangeLog: Array<{ request: string; response: string; status: 'ok' | 'error' | 'aborted'; model: string | null }> = []
  const observedToasts: Array<{ id: string; kind?: string; message: string; actionLabels: string[] }> = []

  try {
    resetWorkspaceFsForTests()
    resetBrowserLocalSurfaceSnapshotsForTests()
    useGraphStore.getState().resetAll()
    fixture = await createFixture(undefined, { workspaceId: settings.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID, origin: dom.window.location.origin })
    Object.assign(process.env, settings)
    globalThis.fetch = fixture.fetch

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
      chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T190000Z/agenticOs_20260522T190000Z.md',
      chatHistoryWorkspacePath: null,
      workspaceViewMode: 'workspace',
      editorWorkspacePane: 'markdown',
      markdownDocumentName: null,
      selectedNodeId: null,
      streamingAssistant: { id: 'assistant-pending', text: 'Streaming...' },
      streamingWorkspacePath: '/workspace/chat/20260522T190000Z/agenticOs_20260522T190000Z.md',
      streamFollowPath: '/workspace/chat/20260522T190000Z/agenticOs_20260522T190000Z.md',
      streamDraft: {
        path: '/workspace/chat/20260522T190000Z/agenticOs_20260522T190000Z.md',
        text: '_Streaming..._',
      },
    })

    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)

    const HookHarness = () => {
      const [messages, setMessages] = React.useState<Array<{ id: string; role: 'user' | 'assistant'; content: string }>>([])
      const [streamingAssistant, setStreamingAssistant] = React.useState<{ id: string; text: string } | null>(null)
      const callback = useFinalizeAssistantSuccess({
        chatStorageTarget: 'chatAgenticGraph',
        chatProviderSummary: 'openai:gpt-4.1-mini',
        chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T190000Z/agenticOs_20260522T190000Z.md',
        chatHistoryWorkspacePath: null,
        chatLocalStorageRootPath: '/workspace/chat',
        setChatAgenticGraphWorkspacePath: path => { resolvedAgenticGraphPaths.push(path) },
        setChatHistoryWorkspacePath: () => {},
        followWorkspaceMarkdownPath: path => { followedPaths.push(path) },
        pushChatExchangeLog: payload => {
          exchangeLog.push({
            request: payload.request,
            response: payload.response,
            status: payload.status,
            model: payload.model,
          })
        },
        upsertUiToast: toast => {
          observedToasts.push({
            id: toast.id,
            kind: toast.kind,
            message: toast.message,
            actionLabels: Array.isArray(toast.actions) ? toast.actions.map(action => String(action.label || '').trim()) : [],
          })
          useGraphStore.getState().upsertUiToast(toast)
        },
        setMessages,
        setStreamingAssistant,
        streamFollowRef: { current: { path: '/workspace/chat/20260522T190000Z/agenticOs_20260522T190000Z.md', atMs: Date.UTC(2026, 4, 22, 19, 0, 0) } },
        streamDraftTextRef: { current: { path: '/workspace/chat/20260522T190000Z/agenticOs_20260522T190000Z.md', text: '_Streaming..._' } },
      })
      React.useEffect(() => {
        finalizeAssistantSuccess = callback
      }, [callback])
      void messages
      void streamingAssistant
      return null
    }

    await mountReactRoot(root, React.createElement(HookHarness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    if (!finalizeAssistantSuccess) {
      throw new Error('Expected finalize hook harness to expose the submit finalize callback')
    }

    const requestText = 'Generate a canonical AGENTIC_OS document and apply it to Canvas.'
    const canonical = buildNeutralAgenticOsFixtureDocument({
      timestampMs: Date.UTC(2026, 4, 22, 19, 0, 0),
      workspacePath: '/workspace/chat/20260522T190000Z/agenticOs_20260522T190000Z.md',
      requestText,
      assistantText: 'Create a neutral AGENTIC_OS pipeline that validates, lands through Source Files, follows the Editor Workspace, and applies to Canvas.',
      expectationLabel: 'neutral coordinator AGENTIC_OS fixture',
    })
    const submitArgs = buildSubmitArgsFixture({
      chatStorageTarget: 'chatAgenticGraph',
      chatLocalStorageRootPath: '/workspace/chat',
      chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T190000Z/agenticOs_20260522T190000Z.md',
      setChatAgenticGraphWorkspacePath: path => { resolvedAgenticGraphPaths.push(path) },
      followWorkspaceMarkdownPath: path => { followedPaths.push(path) },
      finalizeAssistantSuccess,
      setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
      setConnectivityDetail: value => { connectivityDetail.push(typeof value === 'function' ? null : value) },
      abortRef: { current: null },
      streamDraftTextRef: { current: { path: '/workspace/chat/20260522T190000Z/agenticOs_20260522T190000Z.md', text: '_Streaming..._' } },
      streamFollowRef: { current: { path: '/workspace/chat/20260522T190000Z/agenticOs_20260522T190000Z.md', atMs: Date.UTC(2026, 4, 22, 19, 0, 0) } },
    })

    await act(async () => {
      await executeFloatingPanelChatSubmitCoordinator({
        submitArgs,
        requestUrl: 'https://chat.example.test/v1/chat/completions',
        trimmedInput: requestText,
        assistantMessageId: 'assistant-pending',
        nextMessages: [{ id: 'user-1', role: 'user', content: requestText }],
        requestTimestampMs: Date.UTC(2026, 4, 22, 19, 0, 0),
        traceId: 'trace-webmcp-ready',
        bootstrapDraft: async () => '/workspace/chat/20260522T190000Z/agenticOs_20260522T190000Z.md',
        buildRequestContext: async () => ({
          packedContext: { selected_node: null, connected_edges: [], frontmatter: null, graph_summary: '', guideline_digest: '' },
          systemMessages: [{ role: 'system', content: 'base-system' }],
          conversationMessages: [{ id: 'user-1', role: 'user', content: requestText }],
        }),
        createRequestSender: () => async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
        resolveInitialModel: () => ({ providerModelOptions: ['model-a'], effectiveModel: 'model-a' }),
        executeTransportAttempt: async args => ({
          response: await args.sendChat('model-a', 'max_completion_tokens'),
          effectiveModel: 'model-a',
          detail: null,
        }),
        createDraftWriter: () => async () => {},
        readAssistantResponse: async () => ({
          assistantText: canonical,
          rawSseEvents: [],
          reasoningSteps: [],
          reasoningPreview: null,
          reasoningStepCount: 0,
          usageSummary: null,
          finishReason: 'stop',
          modelId: 'model-a',
        }),
      })
    })

    const chatPipelineSnapshot = readLocalChatPipelineSurfaceSnapshot()
    const inspectedPipeline = inspectLocalChatPipelineState(chatPipelineSnapshot)
    const graphState = useGraphStore.getState()

    if (connectivity[0] !== 'ok' || connectivityDetail[0] !== null) {
      throw new Error(`Expected coordinator helper to mark connectivity ok during validated AGENTIC_OS finalize, got: ${JSON.stringify({ connectivity, connectivityDetail })}`)
    }
    if (inspectedPipeline.agenticOsValidation.stage !== 'validated' || inspectedPipeline.agenticOsValidation.hasYamlFrontmatter !== true) {
      throw new Error(`Expected chat pipeline inspection to expose validated YAML-frontmatter AGENTIC_OS state, got: ${JSON.stringify(inspectedPipeline.agenticOsValidation)}`)
    }
    if (inspectedPipeline.finalize.stage !== 'applied' || inspectedPipeline.finalize.persistedAgenticGraphPath !== '/workspace/chat/20260522T190000Z/agenticOs_20260522T190000Z.md') {
      throw new Error(`Expected chat pipeline inspection to expose applied canonical AGENTIC_OS finalize state, got: ${JSON.stringify(inspectedPipeline.finalize)}`)
    }
    if (!followedPaths.includes('/workspace/chat/20260522T190000Z/agenticOs_20260522T190000Z.md')) {
      throw new Error(`Expected finalize flow to follow the canonical agentic-graph workspace path, got: ${JSON.stringify(followedPaths)}`)
    }
    if (!resolvedAgenticGraphPaths.includes('/workspace/chat/20260522T190000Z/agenticOs_20260522T190000Z.md')) {
      throw new Error(`Expected finalize flow to resolve the canonical agentic-graph workspace path, got: ${JSON.stringify(resolvedAgenticGraphPaths)}`)
    }
    if (!exchangeLog[0]?.response.includes('/workspace/chat/20260522T190000Z/agenticOs_20260522T190000Z.md')) {
      throw new Error(`Expected finalize flow to log the canonical workspace link in the assistant response, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (!exchangeLog[0]?.response.includes('APPLIED · MIRRORED_STORAGE · [Open AGENTIC_OS in Source Files: agenticOs_20260522T190000Z.md]')) {
      throw new Error(`Expected the successful storage fixture to expose an applied storage-mirrored typed Source Files link in the assistant response, got: ${JSON.stringify(exchangeLog)}`)
    }
    if (observedToasts.some(toast => String(toast.id || '').startsWith('chat-promotion-retry:'))) {
      throw new Error(`Expected successful finalize flow not to emit a promotion retry toast, got: ${JSON.stringify(observedToasts)}`)
    }
    if (
      !String(graphState.markdownDocumentName || '').endsWith('agenticOs_20260522T190000Z.md') ||
      !String(graphState.markdownDocumentText || '').startsWith('---\n')
    ) {
      throw new Error(`Expected finalize flow to apply the canonical AGENTIC_OS workspace document to the active canvas state, got: ${JSON.stringify({ markdownDocumentName: graphState.markdownDocumentName, markdownDocumentText: graphState.markdownDocumentText?.slice(0, 40) || '' })}`)
    }
  } finally {
    try {
      if (root) await unmountReactRoot(root, { window: dom.window as unknown as Window })
    } finally {
      try {
        cancelAgenticGraphStorageSync(settings.VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID)
        await fixture?.close()
      } finally {
        globalThis.fetch = previousFetch
        for (const [key, value] of Object.entries(previousSettings)) {
          if (value === undefined) delete process.env[key]
          else process.env[key] = value
        }
        try {
          resetWorkspaceFsForTests()
          resetBrowserLocalSurfaceSnapshotsForTests()
          useGraphStore.getState().resetAll()
        } finally { try { restoreDom() } finally { restoreWindow() } }
      }
    }
  }
  })
}

export async function testUseFloatingPanelChatSubmitDelegatesToCoordinatorOnce() {
  const { restore: restoreWindow } = initWindowHarness()
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null
  const coordinatorCalls: Array<{
    requestUrl: string
    trimmedInput: string
    assistantMessageId: string
    hasStreamingWorkspaceSetter: boolean
    hasStreamingRefs: boolean
    hasFinalizeHandler: boolean
  }> = []
  let submitHandler: React.FormEventHandler<HTMLFormElement> | null = null

  try {
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)
    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)
    const setChatWorkspaceStreamingState = () => {}
    const streamDraftTextRef = { current: null as { path: string; text: string } | null }
    const streamFollowRef = { current: null as { path: string; atMs: number } | null }
    const finalizeAssistantSuccess = async () => {}
    const args = buildSubmitArgsFixture({
      input: '  I can ...#storyboard ../soul.load#media@operator, better in#storyboard  ',
      isLoading: false,
      setChatWorkspaceStreamingState,
      streamDraftTextRef,
      streamFollowRef,
      finalizeAssistantSuccess,
    })

    const HookHarness = () => {
      const handler = useFloatingPanelChatSubmit(args, {
        resolveRequestUrlOrSetError: () => 'https://chat.example.test/v1/chat/completions',
        initializeOptimisticState: () => ({
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
          requestTimestampMs: 123,
          traceId: 'trace-1',
          nextMessages: [{ id: 'user-1', role: 'user', content: 'I can ... #storyboard .. /soul.load #media @operator, better in #storyboard' }],
        }),
        executeCoordinator: async payload => {
          coordinatorCalls.push({
            requestUrl: payload.requestUrl,
            trimmedInput: payload.trimmedInput,
            assistantMessageId: payload.assistantMessageId,
            hasStreamingWorkspaceSetter: payload.submitArgs.setChatWorkspaceStreamingState === setChatWorkspaceStreamingState,
            hasStreamingRefs:
              payload.submitArgs.streamDraftTextRef === streamDraftTextRef &&
              payload.submitArgs.streamFollowRef === streamFollowRef,
            hasFinalizeHandler: payload.submitArgs.finalizeAssistantSuccess === finalizeAssistantSuccess,
          })
        },
      })
      React.useEffect(() => {
        submitHandler = handler
      }, [handler])
      return null
    }

    await mountReactRoot(root, React.createElement(HookHarness), {
      window: dom.window as unknown as Window,
      frames: 2,
    })

    if (!submitHandler) {
      throw new Error('Expected hook harness to capture the submit handler')
    }

    await act(async () => {
      await submitHandler!({
        preventDefault: () => void 0,
      } as React.FormEvent<HTMLFormElement>)
    })

    if (coordinatorCalls.length !== 1) {
      throw new Error(`Expected submit hook shell to delegate to coordinator exactly once, got: ${coordinatorCalls.length}`)
    }
    if (
      coordinatorCalls[0]?.requestUrl !== 'https://chat.example.test/v1/chat/completions' ||
      coordinatorCalls[0]?.trimmedInput !== 'I can ... #storyboard .. /soul.load #media @operator, better in #storyboard' ||
      coordinatorCalls[0]?.assistantMessageId !== 'assistant-1' ||
      !coordinatorCalls[0]?.hasStreamingWorkspaceSetter ||
      !coordinatorCalls[0]?.hasStreamingRefs ||
      !coordinatorCalls[0]?.hasFinalizeHandler
    ) {
      throw new Error(`Expected submit hook shell to forward canonical coordinator payload, got: ${JSON.stringify(coordinatorCalls[0])}`)
    }
  } finally {
    await unmountReactRoot(root, { window: dom.window as unknown as Window })
    restoreDom()
    restoreWindow()
  }
}
