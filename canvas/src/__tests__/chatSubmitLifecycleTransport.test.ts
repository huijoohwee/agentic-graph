import { finalizeSubmitTerminalState } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitLifecycle'
import { handleSubmitIssueExit, resolveSubmitRuntimeFriendlyMessage } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitErrors'
import { executeChatSubmitTransportAttempt, resolvePreferredFallbackModel } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitTransport'
import { buildSubmitArgsFixture } from '@/__tests__/helpers/chatSubmitArgsFixture'
import { CHAT_SUBMIT_PREPARATION_TIMEOUT_ERROR, executeFloatingPanelChatSubmitCoordinator } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitCoordinator'
import { createChatAgenticGraphDraftWriter } from '@/features/chat/floatingPanelChat/floatingPanelChatStreaming'
import type { ChatMessage } from '@/features/chat/FloatingPanelChatSections'

export async function testCreateChatAgenticGraphDraftWriterSkipsDuplicateNonForceWrites() {
  const persisted: string[] = []
  const followed: string[] = []
  const streamingStates: Array<{ path?: string | null; text?: string | null } | null> = []
  const streamDraftTextRef = { current: null as { path: string; text: string } | null }
  const flushDraft = createChatAgenticGraphDraftWriter({
    chatStorageTarget: 'chatAgenticGraph',
    liveAgenticOsPath: '/workspace/chat/agenticOs.md',
    requestTimestampMs: Date.UTC(2026, 4, 22, 16, 30, 0),
    providerSummary: 'openai:gpt',
    userText: 'Generate AGENTIC_OS',
    defaultLocalRootPath: '/workspace',
    traceId: 'trace-stream-test',
    streamDraftTextRef,
    followWorkspaceMarkdownPath: path => { followed.push(path) },
    setChatAgenticGraphWorkspacePath: () => {},
    setChatWorkspaceStreamingState: value => { streamingStates.push(value) },
    persistDraft: async payload => { persisted.push(String(payload.assistantText || '')); return '/workspace/chat/agenticOs.md' },
  })
  await flushDraft('alpha', false)
  await flushDraft('alpha', false)
  await flushDraft('alpha', true)
  if (persisted.length !== 0) {
    throw new Error(`Expected streaming draft writer to avoid workspace persistence churn, got ${persisted.length} writes`)
  }
  if (followed.length !== 1) {
    throw new Error(`Expected duplicate draft updates to avoid repeated follow-path churn, got ${followed.length}`)
  }
  if (followed[0] !== '/workspace/chat/agenticOs.md') {
    throw new Error(`Expected live streaming follow path to stay on canonical AGENTIC_OS workspace, got ${JSON.stringify(followed)}`)
  }
  if (streamDraftTextRef.current?.text !== 'alpha') {
    throw new Error(`Expected live streaming draft state to retain the latest text, got: ${JSON.stringify(streamDraftTextRef.current)}`)
  }
  if (streamDraftTextRef.current?.path !== '/workspace/chat/agenticOs.md') {
    throw new Error(`Expected live streaming draft state to stay on canonical AGENTIC_OS workspace, got: ${JSON.stringify(streamDraftTextRef.current)}`)
  }
  if (
    streamingStates.length !== 1 ||
    streamingStates[0]?.text !== 'alpha'
  ) {
    throw new Error(`Expected duplicate non-force updates to land the live editor text once, got: ${JSON.stringify(streamingStates)}`)
  }
}

export async function testCreateChatAgenticGraphDraftWriterRejectsViteDevIndexHtmlDrafts() {
  const viteDevIndexHtml = [
    '<!doctype html><html lang="en">',
    '<script type="module">import { injectIntoGlobalHook } from "/@react-refresh";</script>',
    '<script type="module" src="/@vite/client"></script>',
    '<main id="root"></main><script type="module" src="/src/main.tsx?t=123"></script>',
    '</html>',
  ].join('\n')
  const persisted: string[] = []
  const followed: string[] = []
  const streamingStates: Array<{ path?: string | null; text?: string | null } | null> = []
  const streamDraftTextRef = { current: null as { path: string; text: string } | null }
  const flushDraft = createChatAgenticGraphDraftWriter({
    chatStorageTarget: 'chatAgenticGraph',
    liveAgenticOsPath: '/workspace/chat/agenticOs.md',
    requestTimestampMs: Date.UTC(2026, 4, 22, 16, 30, 0),
    providerSummary: 'openai:gpt',
    userText: 'Generate AGENTIC_OS',
    defaultLocalRootPath: '/workspace',
    traceId: 'trace-stream-html-test',
    streamDraftTextRef,
    followWorkspaceMarkdownPath: path => { followed.push(path) },
    setChatAgenticGraphWorkspacePath: () => {},
    setChatWorkspaceStreamingState: value => { streamingStates.push(value) },
    persistDraft: async payload => { persisted.push(String(payload.assistantText || '')); return '/workspace/chat/agenticOs.md' },
    persistWorkspaceDrafts: true,
  })

  await flushDraft(viteDevIndexHtml, true)

  if (persisted.length !== 0) {
    throw new Error(`Expected Vite dev app-shell HTML draft to avoid workspace persistence, got ${persisted.length} writes`)
  }
  if (followed.length !== 0) {
    throw new Error(`Expected rejected app-shell HTML draft not to move workspace selection, got ${JSON.stringify(followed)}`)
  }
  if (streamDraftTextRef.current?.text !== '') {
    throw new Error(`Expected rejected app-shell HTML draft to clear live draft text, got ${JSON.stringify(streamDraftTextRef.current)}`)
  }
  if (streamDraftTextRef.current?.path !== '/workspace/chat/agenticOs.md') {
    throw new Error(`Expected rejected app-shell HTML draft state to clear against canonical AGENTIC_OS workspace, got ${JSON.stringify(streamDraftTextRef.current)}`)
  }
  const lastStreamingState = streamingStates[streamingStates.length - 1]
  if (!lastStreamingState || lastStreamingState.text !== '') {
    throw new Error(`Expected rejected app-shell HTML draft to clear streaming state, got ${JSON.stringify(streamingStates)}`)
  }
  if (lastStreamingState.path !== '/workspace/chat/agenticOs.md') {
    throw new Error(`Expected rejected app-shell HTML streaming state to stay on canonical AGENTIC_OS workspace, got ${JSON.stringify(streamingStates)}`)
  }
}

export function testFinalizeSubmitTerminalStateResetsLoadingAbortAndStreamingWorkspace() {
  const loadingWrites: boolean[] = []
  const workspaceWrites: Array<string | null> = []
  const liveWorkspaceStreamingWrites: Array<{ path?: string | null; text?: string | null } | null> = []
  const abortRef = { current: new AbortController() as AbortController | null }
  const streamFollowRef = { current: { path: '/workspace/chat/trace.md', atMs: 123 } }
  const streamDraftTextRef = { current: { path: '/workspace/chat/trace.md', text: 'draft' } }
  finalizeSubmitTerminalState({
    setIsLoading: value => { loadingWrites.push(typeof value === 'function' ? false : value) },
    abortRef,
    setStreamingWorkspacePath: value => { workspaceWrites.push(typeof value === 'function' ? null : value) },
    setChatWorkspaceStreamingState: value => { liveWorkspaceStreamingWrites.push(value) },
    streamFollowRef,
    streamDraftTextRef,
  })
  if (loadingWrites.length !== 1 || loadingWrites[0] !== false) {
    throw new Error(`Expected terminal lifecycle helper to set loading false once, got: ${JSON.stringify(loadingWrites)}`)
  }
  if (abortRef.current !== null) {
    throw new Error('Expected terminal lifecycle helper to clear abortRef.current')
  }
  if (workspaceWrites.length !== 1 || workspaceWrites[0] !== null) {
    throw new Error(`Expected terminal lifecycle helper to clear streaming workspace path once, got: ${JSON.stringify(workspaceWrites)}`)
  }
  if (liveWorkspaceStreamingWrites.length !== 1 || liveWorkspaceStreamingWrites[0] !== null) {
    throw new Error(`Expected terminal lifecycle helper to clear live workspace streaming state once, got: ${JSON.stringify(liveWorkspaceStreamingWrites)}`)
  }
  if (streamFollowRef.current !== null || streamDraftTextRef.current !== null) {
    throw new Error('Expected terminal lifecycle helper to clear both streaming refs')
  }
}

export function testResolveSubmitRuntimeFriendlyMessageUsesEndpointSpecificNetworkCopy() {
  const friendly = resolveSubmitRuntimeFriendlyMessage({
    raw: 'Failed to fetch',
    endpointUrl: 'https://chat.example.test/v1',
  })
  if (!friendly.includes('https://chat.example.test/v1')) {
    throw new Error(`Expected network-friendly submit message to include the endpoint URL, got: ${friendly}`)
  }
}

export function testResolveSubmitRuntimeFriendlyMessageUsesPreparationTimeoutCopy() {
  const friendly = resolveSubmitRuntimeFriendlyMessage({
    raw: `${CHAT_SUBMIT_PREPARATION_TIMEOUT_ERROR}:draft-bootstrap`,
    endpointUrl: 'https://apihub.agnes-ai.com/v1/chat/completions',
    chatProvider: 'agnes-ai',
  })
  if (!friendly.includes('Agnes') || !friendly.includes('preparing the chat request')) {
    throw new Error(`Expected preparation-timeout submit message to use provider-friendly copy, got: ${friendly}`)
  }
}

export function testResolveSubmitRuntimeFriendlyMessageMapsAgnesInvalidTokenForServerManagedAuth() {
  const friendly = resolveSubmitRuntimeFriendlyMessage({
    raw: '无效的令牌 (request id: abc123)',
    endpointUrl: 'https://apihub.agnes-ai.com/v1/chat/completions',
    chatProvider: 'agnes-ai',
    chatAuthMode: 'serverManaged',
  })
  if (!friendly.includes('Agnes') || !friendly.includes('server-managed chat proxy API key')) {
    throw new Error(`Expected Agnes invalid-token submit message to explain the server-managed key diagnosis, got: ${friendly}`)
  }
}

export async function testExecuteFloatingPanelChatSubmitCoordinatorFailsOnPreparationTimeout() {
  const errors: Array<string | null> = []
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const connectivityDetail: Array<string | null> = []
  const loadingWrites: boolean[] = []
  const workspaceWrites: Array<string | null> = []
  const streamingAssistantWrites: Array<{ id: string; text: string } | null> = []
  let messages: ChatMessage[] = [
    { id: 'assistant-pending', role: 'assistant', content: '' },
  ]
  const submitArgs = buildSubmitArgsFixture({
    chatProvider: 'agnes-ai',
    chatStorageTarget: 'chatAgenticGraph',
    chatLocalStorageRootPath: '/workspace/chat',
    chatAgenticGraphWorkspacePath: '/workspace/chat/20260522T190000Z/agenticOs_20260522T190000Z.md',
    setErrorText: value => { errors.push(typeof value === 'function' ? null : value) },
    setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
    setConnectivityDetail: value => { connectivityDetail.push(typeof value === 'function' ? null : value) },
    setIsLoading: value => { loadingWrites.push(typeof value === 'function' ? false : value) },
    setStreamingWorkspacePath: value => { workspaceWrites.push(typeof value === 'function' ? null : value) },
    setStreamingAssistant: value => { streamingAssistantWrites.push(typeof value === 'function' ? null : value) },
    setMessages: updater => { messages = typeof updater === 'function' ? updater(messages) : updater },
  })

  await executeFloatingPanelChatSubmitCoordinator({
    submitArgs,
    requestUrl: 'https://chat.example.test/v1/chat/completions',
    trimmedInput: 'Generate AGENTIC_OS',
    assistantMessageId: 'assistant-pending',
    nextMessages: [{ id: 'user-1', role: 'user', content: 'Generate AGENTIC_OS' }],
    requestTimestampMs: Date.UTC(2026, 4, 22, 19, 0, 0),
    traceId: 'trace-prep-timeout',
    preparationTimeoutMs: 5,
    bootstrapDraft: () => new Promise<string | null>(() => {}),
  })

  if (!String(errors[0] || '').includes('preparing the chat request')) {
    throw new Error(`Expected coordinator to surface a preparation-timeout error, got: ${JSON.stringify(errors)}`)
  }
  if (connectivity[0] !== 'error' || connectivityDetail[0] !== errors[0]) {
    throw new Error(`Expected coordinator to mark connectivity error on preparation timeout, got: ${JSON.stringify({ connectivity, connectivityDetail, errors })}`)
  }
  if (loadingWrites[0] !== false || workspaceWrites[0] !== null || streamingAssistantWrites[0] !== null) {
    throw new Error(`Expected coordinator timeout exit to clear loading and streaming state, got: ${JSON.stringify({ loadingWrites, workspaceWrites, streamingAssistantWrites })}`)
  }
  if (!String(messages.find(message => message.id === 'assistant-pending')?.content || '').includes('preparing the chat request')) {
    throw new Error(`Expected coordinator timeout exit to persist the terminal assistant error, got: ${JSON.stringify(messages)}`)
  }
}

export function testHandleSubmitIssueExitReportsMaterializedErrorAndFinalizes() {
  const logs: string[] = []
  const persisted: string[] = []
  const uiLogs: string[] = []
  const historySubTabs: Array<string | null> = []
  const errors: Array<string | null> = []
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const connectivityDetail: Array<string | null> = []
  const streamingAssistantWrites: Array<{ id: string; text: string } | null> = []
  let messages: ChatMessage[] = [
    { id: 'assistant-pending', role: 'assistant' as const, content: '' },
    { id: 'stable', role: 'assistant' as const, content: 'Stable response' },
  ]
  const abortRef = { current: new AbortController() as AbortController | null }
  const streamFollowRef = { current: { path: '/workspace/chat/trace.md', atMs: 1 } }
  const streamDraftTextRef = { current: { path: '/workspace/chat/trace.md', text: 'draft' } }
  const workspaceWrites: Array<string | null> = []
  const loadingWrites: boolean[] = []
  handleSubmitIssueExit({
    assistantMessageId: 'assistant-pending',
    requestText: 'Generate AGENTIC_OS',
    responseText: 'Synthetic submit failure',
    status: 'error',
    modelId: 'gpt-test',
    timestampMs: 42,
    setStreamingAssistant: value => { streamingAssistantWrites.push(typeof value === 'function' ? null : value) },
    setMessages: updater => { messages = typeof updater === 'function' ? updater(messages) : updater },
    setErrorText: value => { errors.push(typeof value === 'function' ? null : value) },
    errorText: 'Synthetic submit failure',
    setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
    connectivity: 'error',
    setConnectivityDetail: value => { connectivityDetail.push(typeof value === 'function' ? null : value) },
    connectivityDetail: 'connectivity detail',
    setIsLoading: value => { loadingWrites.push(typeof value === 'function' ? false : value) },
    abortRef,
    setStreamingWorkspacePath: value => { workspaceWrites.push(typeof value === 'function' ? null : value) },
    streamFollowRef,
    streamDraftTextRef,
    pushChatExchangeLog: payload => { logs.push(`${payload.status}:${payload.response}`) },
    persistChatExchangeLog: async payload => { persisted.push(`${payload.status}:${payload.response}`) },
    pushUiLog: entry => { uiLogs.push(String(entry.message || '')) },
    requestHistorySubTab: value => { historySubTabs.push(value) },
    chatProvider: 'agnes-ai',
    chatAuthMode: 'serverManaged',
    endpointUrl: '/__chat_proxy/v1/chat/completions',
  })
  if (errors[0] !== 'Synthetic submit failure') {
    throw new Error(`Expected issue exit helper to write error text, got: ${JSON.stringify(errors)}`)
  }
  if (connectivity[0] !== 'error' || connectivityDetail[0] !== 'connectivity detail') {
    throw new Error(`Expected issue exit helper to write connectivity state, got: ${JSON.stringify({ connectivity, connectivityDetail })}`)
  }
  if (logs.length !== 1 || persisted.length !== 1) {
    throw new Error(`Expected issue exit helper to report exactly one log and one persisted issue, got logs=${logs.length}, persisted=${persisted.length}`)
  }
  if (uiLogs.length !== 1 || !uiLogs[0]?.includes('Agnes') || !uiLogs[0]?.includes('Synthetic submit failure')) {
    throw new Error(`Expected issue exit helper to push one Agnes diagnosis into the UI log, got: ${JSON.stringify(uiLogs)}`)
  }
  if (historySubTabs[0] !== 'log') {
    throw new Error(`Expected issue exit helper to bias History toward the Log subtab, got: ${JSON.stringify(historySubTabs)}`)
  }
  if (messages.find(message => message.id === 'assistant-pending')?.content !== 'Synthetic submit failure') {
    throw new Error(`Expected issue exit helper to persist the terminal assistant error, got: ${JSON.stringify(messages)}`)
  }
  if (streamingAssistantWrites[0] !== null || abortRef.current !== null || workspaceWrites[0] !== null || loadingWrites[0] !== false) {
    throw new Error('Expected issue exit helper to clear streaming assistant, abort ref, workspace path, and loading state')
  }
}

export function testHandleSubmitIssueExitCanSkipReportingForEndpointFailure() {
  const logs: string[] = []
  const persisted: string[] = []
  const uiLogs: string[] = []
  let messages: ChatMessage[] = [{ id: 'assistant-pending', role: 'assistant', content: '' }]
  handleSubmitIssueExit({
    assistantMessageId: 'assistant-pending',
    requestText: 'Generate AGENTIC_OS',
    responseText: 'Endpoint status text',
    status: 'error',
    modelId: 'gpt-test',
    timestampMs: 99,
    setStreamingAssistant: () => {},
    setMessages: updater => { messages = typeof updater === 'function' ? updater(messages) : updater },
    setErrorText: () => {},
    errorText: 'Endpoint status text',
    setConnectivity: () => {},
    connectivity: 'error',
    setConnectivityDetail: () => {},
    connectivityDetail: 'Chat endpoint returned 500.',
    setIsLoading: () => {},
    abortRef: { current: null },
    setStreamingWorkspacePath: () => {},
    streamFollowRef: { current: null },
    streamDraftTextRef: { current: null },
    pushChatExchangeLog: payload => { logs.push(payload.response) },
    persistChatExchangeLog: async payload => { persisted.push(payload.response) },
    pushUiLog: entry => { uiLogs.push(String(entry.message || '')) },
    requestHistorySubTab: () => {},
    chatProvider: 'agnes-ai',
    chatAuthMode: 'serverManaged',
    endpointUrl: '/__chat_proxy/v1/chat/completions',
    shouldReportIssue: false,
  })
  if (logs.length !== 0 || persisted.length !== 0) {
    throw new Error(`Expected endpoint-style issue exit to skip reporting, got logs=${logs.length}, persisted=${persisted.length}`)
  }
  if (uiLogs.length !== 1 || !uiLogs[0]?.includes('Endpoint status text')) {
    throw new Error(`Expected endpoint-style issue exit to still push the diagnosis to the UI log, got: ${JSON.stringify(uiLogs)}`)
  }
  if (messages[0]?.content !== 'Endpoint status text') {
    throw new Error(`Expected endpoint-style issue exit to retain its terminal assistant error, got: ${JSON.stringify(messages)}`)
  }
}

export function testResolvePreferredFallbackModelPrefersProviderOwnedCandidate() {
  const fallback = resolvePreferredFallbackModel({
    providerModelOptions: ['provider-a', 'provider-b'],
    availableModelIds: ['other', 'provider-b', 'provider-c'],
    effectiveModel: 'provider-a',
  })
  if (fallback !== 'provider-b') {
    throw new Error(`Expected preferred fallback helper to pick provider-owned candidate first, got: ${fallback}`)
  }
}

export async function testExecuteChatSubmitTransportAttemptRetriesUnsupportedTokenParameter() {
  const calls: Array<{ model: string; tokenLimitKey: 'max_tokens' | 'max_completion_tokens' }> = []
  const response = await executeChatSubmitTransportAttempt({
    effectiveModel: 'model-a',
    tokenLimitKey: 'max_tokens',
    controller: new AbortController(),
    sendChat: async (model, tokenLimitKey) => {
      calls.push({ model, tokenLimitKey })
      if (calls.length === 1) return new Response('bad token', { status: 400 })
      return new Response('{}', { status: 200 })
    },
    parseErrorBody: async res => (res.status === 400 ? "Unsupported parameter: 'max_tokens'" : null),
    providerModelOptions: ['model-a'],
    loadFallbackModelIds: async () => [],
  })
  if (!response.response.ok) {
    throw new Error('Expected token fallback transport attempt to recover to an OK response')
  }
  if (calls.length !== 2 || calls[1]?.tokenLimitKey !== 'max_completion_tokens') {
    throw new Error(`Expected transport helper to retry once with flipped token parameter, got: ${JSON.stringify(calls)}`)
  }
}

export async function testExecuteChatSubmitTransportAttemptFallsBackToPreferredModel() {
  const calls: Array<{ model: string; tokenLimitKey: 'max_tokens' | 'max_completion_tokens' }> = []
  const resolvedModels: string[] = []
  const result = await executeChatSubmitTransportAttempt({
    effectiveModel: 'model-a',
    tokenLimitKey: 'max_completion_tokens',
    controller: new AbortController(),
    sendChat: async (model, tokenLimitKey) => {
      calls.push({ model, tokenLimitKey })
      if (model === 'model-a') return new Response('fallback required', { status: 404 })
      return new Response('{}', { status: 200 })
    },
    parseErrorBody: async res => (res.status === 404 ? 'Model not found' : null),
    providerModelOptions: ['model-a', 'model-b'],
    loadFallbackModelIds: async () => ['other-model', 'model-b'],
    onResolvedFallbackModel: modelId => { resolvedModels.push(modelId) },
  })
  if (!result.response.ok || result.effectiveModel !== 'model-b') {
    throw new Error(`Expected transport helper to recover with preferred fallback model, got: ${JSON.stringify({ ok: result.response.ok, effectiveModel: result.effectiveModel })}`)
  }
  if (resolvedModels.length !== 1 || resolvedModels[0] !== 'model-b') {
    throw new Error(`Expected transport helper to notify exactly one resolved fallback model, got: ${JSON.stringify(resolvedModels)}`)
  }
}

export async function testExecuteChatSubmitTransportAttemptRetriesRetryableNetworkErrorOnce() {
  let calls = 0
  const result = await executeChatSubmitTransportAttempt({
    effectiveModel: 'model-a',
    tokenLimitKey: 'max_completion_tokens',
    controller: new AbortController(),
    sendChat: async () => {
      calls += 1
      if (calls === 1) throw new Error('Failed to fetch')
      return new Response('{}', { status: 200 })
    },
    parseErrorBody: async () => null,
    providerModelOptions: ['model-a'],
    loadFallbackModelIds: async () => [],
  })
  if (!result.response.ok || calls !== 2) {
    throw new Error(`Expected retryable network transport error to resend once and recover, got calls=${calls}, ok=${result.response.ok}`)
  }
}
