import { buildSubmitArgsFixture } from '@/__tests__/helpers/chatSubmitArgsFixture'
import {
  buildTraceOnlyAssistantText,
  createChatKnowgrphDraftWriter,
} from '@/features/chat/floatingPanelChat/floatingPanelChatStreaming'
import { executeFloatingPanelChatSubmitCoordinator } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitCoordinator'
import { UI_COPY } from '@/lib/config'

export async function testCreateChatKnowgrphDraftWriterUpdatesEditorWorkspaceAsLiveSurface() {
  const followedPaths: string[] = []
  const streamingStates: Array<{ path: string | null; text: string }> = []
  const persistedDrafts: string[] = []
  const streamDraftTextRef: { current: { path: string; text: string } | null } = { current: null }
  const flushDraft = createChatKnowgrphDraftWriter({
    chatStorageTarget: 'chatKnowgrph',
    liveKgcPath: '/workspace/chat/20260522T182000Z/kgc_20260522T182000Z.md',
    requestTimestampMs: Date.UTC(2026, 4, 22, 18, 20, 0),
    providerSummary: 'MiroMind API · Global · mirothinker',
    userText: 'Generate ordered durable KGC',
    defaultLocalRootPath: '/workspace/chat',
    traceId: 'trace-ordered-stream',
    streamDraftTextRef,
    followWorkspaceMarkdownPath: path => { followedPaths.push(path) },
    setChatKnowgrphWorkspacePath: () => {},
    setChatWorkspaceStreamingState: value => {
      streamingStates.push({
        path: String(value?.path || '').trim() || null,
        text: String(value?.text || ''),
      })
    },
    persistDraft: async payload => {
      const text = String(payload.assistantText || '')
      persistedDrafts.push(text)
      return '/workspace/chat/20260522T182000Z/kgc_20260522T182000Z.md'
    },
    persistWorkspaceDrafts: true,
  })

  await flushDraft('first partial', false)
  await flushDraft('first partial', false)
  await flushDraft('second terminal', true)

  const tracePath = '/workspace/chat/20260522T182000Z/kgc-trace_20260522T182000Z.md'
  if (streamDraftTextRef.current?.text !== 'second terminal' || streamDraftTextRef.current.path !== tracePath) {
    throw new Error(`Expected live draft ref to update immediately to the latest stream text, got ${JSON.stringify(streamDraftTextRef.current)}`)
  }
  if (
    streamingStates.length !== 2
    || streamingStates[0]?.path !== tracePath
    || streamingStates[0]?.text !== 'first partial'
    || streamingStates[1]?.path !== tracePath
    || streamingStates[1]?.text !== 'second terminal'
  ) {
    throw new Error(`Expected editor workspace text to update as the live streaming surface, got ${JSON.stringify(streamingStates)}`)
  }
  if (JSON.stringify(persistedDrafts) !== JSON.stringify(['first partial', 'second terminal'])) {
    throw new Error(`Expected live editor stream updates to persist changed trace snapshots and skip duplicate chunks, got ${JSON.stringify(persistedDrafts)}`)
  }
  if (followedPaths.length !== 1 || followedPaths[0] !== tracePath) {
    throw new Error(`Expected stream writer to follow the trace workspace path only when it first lands, got ${JSON.stringify(followedPaths)}`)
  }
}

export function testBuildTraceOnlyAssistantTextUsesProviderSignals() {
  const text = buildTraceOnlyAssistantText({
    assistantText: '',
    rawSseEvents: ['{"choices":[{"delta":{"reasoning_content":"Inspect context","tool_calls":[{"function":{"name":"google_search"}}]}}]}'],
    reasoningSteps: ['Inspect context', 'tool_call: google_search'],
    reasoningPreview: 'Reasoning 2: Inspect context | tool_call: google_search',
    reasoningStepCount: 2,
    usageSummary: 'Usage: prompt 1 · completion 2',
    finishReason: 'error',
    modelId: 'mirothinker-1-7-deepresearch-mini',
  })
  if (!text.includes('## Provider Stream Trace') || !text.includes('tool_call: google_search')) {
    throw new Error(`Expected trace-only assistant text to preserve provider signals, got: ${JSON.stringify(text)}`)
  }
  if (text.includes('Chat endpoint responded')) {
    throw new Error(`Expected trace-only assistant text to avoid stale missing-content status copy, got: ${JSON.stringify(text)}`)
  }
}

export async function testExecuteFloatingPanelChatSubmitCoordinatorReportsMissingContentStatus() {
  const missingErrors: Array<string | null> = []
  const missingConnectivity: Array<'unknown' | 'ok' | 'error'> = []
  const missingConnectivityDetail: Array<string | null> = []
  const missingSubmitArgs = buildSubmitArgsFixture({
    chatStorageTarget: 'chatHistory',
    setErrorText: value => { missingErrors.push(typeof value === 'function' ? null : value) },
    setConnectivity: value => { missingConnectivity.push(typeof value === 'function' ? 'unknown' : value) },
    setConnectivityDetail: value => { missingConnectivityDetail.push(typeof value === 'function' ? null : value) },
    abortRef: { current: null },
    streamDraftTextRef: { current: null },
    streamFollowRef: { current: null },
  })
  await executeFloatingPanelChatSubmitCoordinator({
    submitArgs: missingSubmitArgs,
    requestUrl: 'https://chat.example.test/v1/chat/completions',
    trimmedInput: 'Generate empty answer',
    assistantMessageId: 'assistant-empty',
    nextMessages: [{ id: 'user-empty', role: 'user', content: 'Generate empty answer' }],
    requestTimestampMs: Date.UTC(2026, 4, 22, 18, 5, 0),
    traceId: 'trace-empty-content',
    bootstrapDraft: async () => null,
    buildRequestContext: async () => ({
      packedContext: { selected_node: null, connected_edges: [], frontmatter: null, graph_summary: '', guideline_digest: '' },
      systemMessages: [{ role: 'system', content: 'base-system' }],
      conversationMessages: [{ role: 'user', content: 'Generate empty answer' }],
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
      assistantText: '',
      rawSseEvents: [],
      reasoningSteps: [],
      reasoningPreview: null,
      reasoningStepCount: 0,
      usageSummary: null,
      finishReason: 'stop',
      modelId: 'model-a',
    }),
    finalizeTerminal: () => {},
  })
  if (missingErrors[0] !== UI_COPY.chatResponseMissingContentError) {
    throw new Error(`Expected missing-content error copy, got: ${JSON.stringify(missingErrors)}`)
  }
  const missingDetail = String(missingConnectivityDetail[0] || '')
  if (missingConnectivity[0] !== 'error' || missingDetail !== UI_COPY.chatResponseMissingContentStatus) {
    throw new Error(`Expected missing-content status instead of endpoint status, got: ${JSON.stringify({ missingConnectivity, missingConnectivityDetail })}`)
  }
}

export async function testExecuteFloatingPanelChatSubmitCoordinatorFinalizesTraceOnlyStream() {
  const errors: Array<string | null> = []
  const connectivity: Array<'unknown' | 'ok' | 'error'> = []
  const finalized: Array<{
    rawAssistantText: string
    status?: 'ok' | 'error'
    streamReasoningSteps?: string[]
    rawSseEvents?: string[]
  }> = []
  const flushedDrafts: Array<{ text: string; force: boolean }> = []
  const submitArgs = buildSubmitArgsFixture({
    chatStorageTarget: 'chatKnowgrph',
    setErrorText: value => { errors.push(typeof value === 'function' ? null : value) },
    setConnectivity: value => { connectivity.push(typeof value === 'function' ? 'unknown' : value) },
    abortRef: { current: null },
    streamDraftTextRef: { current: null },
    streamFollowRef: { current: null },
    finalizeAssistantSuccess: async payload => {
      finalized.push({
        rawAssistantText: String(payload.rawAssistantText || ''),
        status: payload.status,
        streamReasoningSteps: payload.streamReasoningSteps,
        rawSseEvents: payload.rawSseEvents,
      })
    },
  })

  await executeFloatingPanelChatSubmitCoordinator({
    submitArgs,
    requestUrl: 'https://chat.example.test/v1/chat/completions',
    trimmedInput: 'Need current market context',
    assistantMessageId: 'assistant-trace-only',
    nextMessages: [{ id: 'user-trace-only', role: 'user', content: 'Need current market context' }],
    requestTimestampMs: Date.UTC(2026, 4, 22, 18, 15, 0),
    traceId: 'trace-only-content',
    bootstrapDraft: async () => '/workspace/chat/kgc.md',
    buildRequestContext: async () => ({
      packedContext: { selected_node: null, connected_edges: [], frontmatter: null, graph_summary: '', guideline_digest: '' },
      systemMessages: [{ role: 'system', content: 'base-system' }],
      conversationMessages: [{ role: 'user', content: 'Need current market context' }],
    }),
    createRequestSender: () => async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    resolveInitialModel: () => ({ providerModelOptions: ['model-a'], effectiveModel: 'model-a' }),
    executeTransportAttempt: async args => ({
      response: await args.sendChat('model-a', 'max_completion_tokens'),
      effectiveModel: 'model-a',
      detail: null,
    }),
    createDraftWriter: () => async (text, force) => { flushedDrafts.push({ text, force }) },
    readAssistantResponse: async () => ({
      assistantText: '',
      rawSseEvents: ['{"choices":[{"delta":{"reasoning_content":"Inspect market context","tool_calls":[{"function":{"name":"google_search"}}]},"finish_reason":"error"}]}'],
      reasoningSteps: ['Inspect market context', 'tool_call: google_search'],
      reasoningPreview: 'Reasoning 2: Inspect market context | tool_call: google_search',
      reasoningStepCount: 2,
      usageSummary: null,
      finishReason: 'error',
      modelId: 'model-a',
    }),
    finalizeTerminal: () => {},
  })

  if (errors.length > 0) {
    throw new Error(`Expected trace-only stream not to raise missing-content error text, got: ${JSON.stringify(errors)}`)
  }
  if (finalized.length !== 1 || finalized[0]?.status !== 'error') {
    throw new Error(`Expected trace-only stream to finalize once with error status, got: ${JSON.stringify(finalized)}`)
  }
  if (!finalized[0]?.rawAssistantText.includes('Provider Stream Trace') || !finalized[0]?.rawAssistantText.includes('tool_call: google_search')) {
    throw new Error(`Expected trace-only final assistant text to preserve provider signals, got: ${JSON.stringify(finalized[0])}`)
  }
  const lastDraft = flushedDrafts[flushedDrafts.length - 1]
  if (!lastDraft?.force || !lastDraft.text.includes('Provider Stream Trace')) {
    throw new Error(`Expected trace-only stream to force a terminal draft flush, got: ${JSON.stringify(flushedDrafts)}`)
  }
  if (connectivity[0] !== 'ok') {
    throw new Error(`Expected trace-only finalize to use terminal finalize path instead of issue exit, got: ${JSON.stringify(connectivity)}`)
  }
}
