import {
  CHAT_DURABLE_STREAM_CHUNK,
  CHAT_DURABLE_STREAM_DONE,
  CHAT_DURABLE_STREAM_RESPONSE,
  clearActiveDurableChatStreamRun,
  fetchWithDurableChatStream,
  readActiveDurableChatStreamRun,
  type DurableChatStreamRequestMetadata,
} from '@/features/chat/floatingPanelChat/floatingPanelChatDurableStream'
import {
  CHAT_STREAM_FIRST_CHUNK_TIMEOUT_ERROR,
  buildProviderStreamDraftText,
  createChatAgenticGraphDraftWriter,
  readAssistantResponseText,
} from '@/features/chat/floatingPanelChat/floatingPanelChatStreaming'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { initWindowHarness } from '@/tests/lib/windowHarness'

export async function testReadAssistantResponseTextCollectsSseChunksAndFlushesDrafts() {
  const encoder = new TextEncoder()
  const events = [
    'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":[{"type":"text","text":" structured "},{"type":"output_text","text":"world"}]}}]}\n\n',
    'data: [DONE]\n\n',
  ]
  const response = new Response(
    new ReadableStream({
      start(controller) {
        events.forEach(event => controller.enqueue(encoder.encode(event)))
        controller.close()
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )
  const flushed: Array<{ text: string; force: boolean }> = []
  let nowTick = 200
  const assistantStream = await readAssistantResponseText({
    response,
    isEventStream: true,
    flushDraft: (text, force) => { flushed.push({ text, force }) },
    nowMs: () => {
      const current = nowTick
      nowTick += 200
      return current
    },
  })
  if (assistantStream.assistantText !== 'Hello structured world') {
    throw new Error(`Expected SSE helper to accumulate assistant text, got: ${assistantStream.assistantText}`)
  }
  if (flushed.length < 2) {
    throw new Error(`Expected SSE helper to flush draft during stream and at completion, got ${flushed.length} flushes`)
  }
  const last = flushed[flushed.length - 1]
  if (last.text !== 'Hello structured world' || last.force !== true) {
    throw new Error(`Expected final SSE draft flush to be forced with full text, got: ${JSON.stringify(last)}`)
  }

  const rootDeltaResponse = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"Root chunk"}\n\n'))
        controller.enqueue(encoder.encode('data: {"type":"response.output_text.done","text":"Root chunk"}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )
  const rootDeltaStream = await readAssistantResponseText({
    response: rootDeltaResponse,
    isEventStream: true,
    flushDraft: () => {},
    firstChunkTimeoutMs: 0,
  })
  if (rootDeltaStream.assistantText !== 'Root chunk') {
    throw new Error(`Expected SSE helper to accumulate root output_text delta, got: ${rootDeltaStream.assistantText}`)
  }

  const completedEnvelopeResponse = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_steps":[{"type":"web_search","web_search":{"search_keywords":["CPI June 2026","BTC options volatility"]}}]}}]}\n\n'))
        controller.enqueue(encoder.encode('data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"Final response after search."}]}]}}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )
  const completedEnvelopeStream = await readAssistantResponseText({
    response: completedEnvelopeResponse,
    isEventStream: true,
    flushDraft: () => {},
    firstChunkTimeoutMs: 0,
  })
  if (completedEnvelopeStream.assistantText !== 'Final response after search.') {
    throw new Error(`Expected SSE helper to read completed response envelope text, got: ${completedEnvelopeStream.assistantText}`)
  }
  if (completedEnvelopeStream.reasoningStepCount !== 1 || !completedEnvelopeStream.reasoningPreview?.includes('web_search')) {
    throw new Error(`Expected SSE helper to preserve reasoning metadata separately, got: ${JSON.stringify(completedEnvelopeStream)}`)
  }

  const nonStreamResponse = new Response(
    JSON.stringify({
      output: [
        {
          content: [
            { type: 'output_text', text: 'Non-stream structured answer' },
          ],
        },
      ],
    }),
    { headers: { 'content-type': 'application/json' } },
  )
  const nonStream = await readAssistantResponseText({
    response: nonStreamResponse,
    isEventStream: false,
    flushDraft: () => {},
  })
  if (nonStream.assistantText !== 'Non-stream structured answer') {
    throw new Error(`Expected non-stream helper to read structured output text, got: ${nonStream.assistantText}`)
  }
}

export async function testReadAssistantResponseTextRejectsPartialLengthTerminal() {
  const encoder = new TextEncoder()
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A provisional fragment that must not become the final response."}}]}\n\n'))
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )
  let failure = ''
  try {
    await readAssistantResponseText({
      response,
      isEventStream: true,
      flushDraft: () => undefined,
      firstChunkTimeoutMs: 0,
    })
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  if (!failure.includes('finish_reason: length')) {
    throw new Error(`Expected FloatingPanel Chat to reject partial content with a length terminal, got ${JSON.stringify(failure)}`)
  }

  const incompleteResponse = new Response(JSON.stringify({
    type: 'response.incomplete',
    response: {
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Another provisional fragment.' }] }],
    },
  }), { headers: { 'content-type': 'application/json' } })
  failure = ''
  try {
    await readAssistantResponseText({
      response: incompleteResponse,
      isEventStream: false,
      flushDraft: () => undefined,
    })
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error)
  }
  if (!failure.includes('finish_reason: max_output_tokens')) {
    throw new Error(`Expected FloatingPanel Chat to reject non-stream incomplete content, got ${JSON.stringify(failure)}`)
  }
}

export async function testReadAssistantResponseTextFlushesTraceProgressBeforeContent() {
  const encoder = new TextEncoder()
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"model":"mirothinker-1-7-deepresearch-mini","choices":[{"delta":{"reasoning_content":"Inspect market context before answering.","tool_calls":[{"function":{"name":"use_mcp_tool"}}]}}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )
  const flushed: Array<{ text: string; force: boolean }> = []
  let nowTick = 200
  const assistantStream = await readAssistantResponseText({
    response,
    isEventStream: true,
    flushDraft: (text, force) => { flushed.push({ text, force }) },
    nowMs: () => {
      const current = nowTick
      nowTick += 200
      return current
    },
    firstChunkTimeoutMs: 0,
  })

  if (assistantStream.assistantText !== '') {
    throw new Error(`Expected trace-only stream to keep assistant text empty, got: ${assistantStream.assistantText}`)
  }
  const firstDraft = flushed[0]
  if (!firstDraft || firstDraft.force) {
    throw new Error(`Expected reasoning trace to flush as a live non-terminal draft, got: ${JSON.stringify(flushed)}`)
  }
  if (
    !firstDraft.text.includes('Provider Stream Trace') ||
    !firstDraft.text.includes('Incoming reasoning, tool, and assistant deltas are appended below') ||
    !firstDraft.text.includes('tool_call: use_mcp_tool') ||
    firstDraft.text.includes('_Streaming..._')
  ) {
    throw new Error(`Expected live trace draft to expose provider progress, got: ${JSON.stringify(firstDraft.text)}`)
  }
  const lastDraft = flushed[flushed.length - 1]
  if (
    !lastDraft?.force ||
    !lastDraft.text.includes('### Terminal Metadata') ||
    !lastDraft.text.includes('SSE events:')
  ) {
    throw new Error(`Expected final trace-only draft flush to preserve progress text, got: ${JSON.stringify(flushed)}`)
  }
}

export async function testReadAssistantResponseTextCompactsReasoningContentDeltas() {
  const encoder = new TextEncoder()
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"Thi"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"s is a com"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"plex BTC-gold skew note."}}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )
  const flushed: Array<{ text: string; force: boolean }> = []
  const assistantStream = await readAssistantResponseText({
    response,
    isEventStream: true,
    flushDraft: (text, force) => { flushed.push({ text, force }) },
    firstChunkTimeoutMs: 0,
    nowMs: (() => {
      let tick = 0
      return () => {
        tick += 200
        return tick
      }
    })(),
  })
  const compact = assistantStream.reasoningSteps.join('\n')
  if (!compact.includes('This is a complex BTC-gold skew note.')) {
    throw new Error(`Expected reasoning_content chunks to compact into one readable signal, got: ${JSON.stringify(assistantStream.reasoningSteps)}`)
  }
  const finalDraft = flushed[flushed.length - 1]
  if (!finalDraft?.force || !finalDraft.text.includes('This is a complex BTC-gold skew note.')) {
    throw new Error(`Expected terminal trace draft to use compact reasoning text, got: ${JSON.stringify(flushed)}`)
  }
  if (finalDraft.text.includes('- Thi\n') || finalDraft.text.includes('- s is a com')) {
    throw new Error(`Expected terminal trace draft to avoid token-fragment bullets, got: ${JSON.stringify(finalDraft.text)}`)
  }
}

export async function testReadAssistantResponseTextYieldsDuringDenseReasoningStream() {
  const encoder = new TextEncoder()
  const events = Array.from({ length: 72 }, (_, index) =>
    `data: {"choices":[{"delta":{"reasoning_content":"dense reasoning ${index} "}}]}\n\n`
  )
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`${events.join('')}data: [DONE]\n\n`))
        controller.close()
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )
  const flushed: Array<{ text: string; force: boolean }> = []
  let yields = 0
  const assistantStream = await readAssistantResponseText({
    response,
    isEventStream: true,
    flushDraft: (text, force) => { flushed.push({ text, force }) },
    formatDraftText: buildProviderStreamDraftText,
    firstChunkTimeoutMs: 0,
    nowMs: (() => {
      let tick = 0
      return () => {
        tick += 32
        return tick
      }
    })(),
    yieldToUi: () => { yields += 1 },
  })

  if (yields < 2) {
    throw new Error(`expected dense reasoning stream to yield for UI paints, got ${yields}`)
  }
  const liveDraft = flushed.find(draft => !draft.force && draft.text.includes('Provider Stream Trace'))
  if (!liveDraft) {
    throw new Error(`expected dense reasoning stream to flush a live trace draft before terminal state, got ${JSON.stringify(flushed)}`)
  }
  if (assistantStream.rawSseEvents.length !== 72 || assistantStream.reasoningStepCount < 1) {
    throw new Error(`expected dense reasoning stream to collect all raw events and compact reasoning, got ${JSON.stringify(assistantStream)}`)
  }
}

export async function testReadAssistantResponseTextFormatsAgenticOsDraftAsLiveTraceDuringContentStream() {
  const encoder = new TextEncoder()
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"model":"mirothinker-1-7-deepresearch-mini","choices":[{"delta":{"reasoning_content":"Planning AGENTIC_OS output."}}]}\n\n'))
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"---\\ntitle: \\"BTC Pipeline\\"\\n---\\n# Analysis"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )
  const flushed: Array<{ text: string; force: boolean }> = []
  const assistantStream = await readAssistantResponseText({
    response,
    isEventStream: true,
    flushDraft: (text, force) => { flushed.push({ text, force }) },
    formatDraftText: buildProviderStreamDraftText,
    firstChunkTimeoutMs: 0,
    nowMs: (() => {
      let tick = 0
      return () => {
        tick += 200
        return tick
      }
    })(),
  })
  if (!assistantStream.assistantText.includes('BTC Pipeline')) {
    throw new Error(`Expected raw assistant text to remain available for validation, got: ${JSON.stringify(assistantStream.assistantText)}`)
  }
  const contentDraft = flushed.find(draft => draft.text.includes('[assistant]'))
  if (
    !contentDraft ||
    !contentDraft.text.includes('Provider Stream Trace') ||
    !contentDraft.text.includes('Incoming reasoning, tool, and assistant deltas are appended below') ||
    !contentDraft.text.includes('[reasoning]\nPlanning AGENTIC_OS output.') ||
    !contentDraft.text.includes('[assistant]\n---\ntitle: "BTC Pipeline"')
  ) {
    throw new Error(`Expected content stream to stay wrapped as a live trace draft, got: ${JSON.stringify(flushed)}`)
  }
  const finalDraft = flushed[flushed.length - 1]
  if (!finalDraft?.force || !finalDraft.text.includes('### Terminal Metadata') || !finalDraft.text.includes('Assistant characters:')) {
    throw new Error(`Expected terminal content draft to keep trace wrapper, got: ${JSON.stringify(flushed)}`)
  }
}

export async function testReadAssistantResponseTextFailsOnMissingFirstChunk() {
  let cancelled = false
  let cancelReason = ''
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start() {
        return
      },
      cancel(reason) {
        cancelled = true
        cancelReason = String(reason instanceof Error ? reason.message : reason || '')
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  )
  let failed = false
  try {
    await readAssistantResponseText({
      response,
      isEventStream: true,
      flushDraft: async () => {},
      firstChunkTimeoutMs: 10,
    })
  } catch (error) {
    failed = String(error instanceof Error ? error.message : error).includes(CHAT_STREAM_FIRST_CHUNK_TIMEOUT_ERROR)
  }
  if (!failed) {
    throw new Error('Expected event-stream reader to fail when the first chunk never arrives')
  }
  if (!cancelled || !cancelReason.includes(CHAT_STREAM_FIRST_CHUNK_TIMEOUT_ERROR)) {
    throw new Error(`Expected timed-out event-stream reader to be cancelled, got ${JSON.stringify({ cancelled, cancelReason })}`)
  }
}

export async function testCreateChatAgenticGraphDraftWriterPersistsTraceCompanionForRefresh() {
  const followedPaths: string[] = []
  const streamingStates: Array<{ path: string | null; text: string }> = []
  const persistedDrafts: Array<{ requestedPath: string; assistantText: string }> = []
  const streamDraftTextRef: { current: { path: string; text: string } | null } = { current: null }
  const flushDraft = createChatAgenticGraphDraftWriter({
    chatStorageTarget: 'chatAgenticGraph',
    liveAgenticOsPath: '/workspace/chat/20260522T181000Z/agenticOs_20260522T181000Z.md',
    requestTimestampMs: Date.UTC(2026, 4, 22, 18, 10, 0),
    providerSummary: 'MiroMind API · Global · mirothinker',
    userText: 'Generate durable AGENTIC_OS',
    defaultLocalRootPath: '/workspace/chat',
    traceId: 'trace-durable-stream',
    streamDraftTextRef,
    followWorkspaceMarkdownPath: path => { followedPaths.push(path) },
    setChatAgenticGraphWorkspacePath: () => {},
    setChatWorkspaceStreamingState: value => {
      streamingStates.push({
        path: String(value?.path || '').trim() || null,
        text: String(value?.text || ''),
      })
    },
    persistDraft: async payload => {
      persistedDrafts.push({
        requestedPath: String(payload.requestedPath || ''),
        assistantText: String(payload.assistantText || ''),
      })
      return '/workspace/chat/20260522T181000Z/agenticOs_20260522T181000Z.md'
    },
    persistWorkspaceDrafts: true,
  })

  await flushDraft('partial durable stream', false)

  const tracePath = '/workspace/chat/20260522T181000Z/agentic-os-trace_20260522T181000Z.md'
  if (followedPaths.length !== 1 || followedPaths[0] !== tracePath) {
    throw new Error(`Expected streaming draft writer to follow the trace companion, got: ${JSON.stringify(followedPaths)}`)
  }
  if (streamDraftTextRef.current?.path !== tracePath || streamDraftTextRef.current?.text !== 'partial durable stream') {
    throw new Error(`Expected stream draft ref to point at the trace companion, got: ${JSON.stringify(streamDraftTextRef.current)}`)
  }
  if (
    streamingStates.length !== 1 ||
    streamingStates[0]?.path !== tracePath ||
    streamingStates[0]?.text !== 'partial durable stream'
  ) {
    throw new Error(`Expected live workspace streaming state to expose trace companion text, got: ${JSON.stringify(streamingStates)}`)
  }
  if (
    persistedDrafts.length !== 1 ||
    persistedDrafts[0]?.requestedPath !== '/workspace/chat/20260522T181000Z/agenticOs_20260522T181000Z.md' ||
    persistedDrafts[0]?.assistantText !== 'partial durable stream'
  ) {
    throw new Error(`Expected live stream draft writer to persist the latest trace text for refresh recovery, got: ${JSON.stringify(persistedDrafts)}`)
  }
}

export async function testDurableChatStreamFetchBridgesWorkerSseWithoutPersistingAuthHeaders() {
  const storage = new MemoryStorage()
  const { g, restore } = initWindowHarness({ storage })
  const capturedMessages: Array<Record<string, unknown>> = []
  const workerTarget = {
    postMessage(message: unknown, ports?: readonly MessagePort[]) {
      const record = message && typeof message === 'object' ? message as Record<string, unknown> : {}
      capturedMessages.push(record)
      const port = ports?.[0]
      if (!port) return
      queueMicrotask(() => {
        port.postMessage({
          type: CHAT_DURABLE_STREAM_RESPONSE,
          runId: 'trace-durable-worker',
          status: 200,
          statusText: 'OK',
          contentType: 'text/event-stream; charset=utf-8',
        })
        port.postMessage({
          type: CHAT_DURABLE_STREAM_CHUNK,
          runId: 'trace-durable-worker',
          chunk: 'data: {"choices":[{"delta":{"content":"Worker "}}]}\n\n',
        })
        port.postMessage({
          type: CHAT_DURABLE_STREAM_CHUNK,
          runId: 'trace-durable-worker',
          chunk: 'data: {"choices":[{"delta":{"content":"resume"}}]}\n\n',
        })
        port.postMessage({
          type: CHAT_DURABLE_STREAM_CHUNK,
          runId: 'trace-durable-worker',
          chunk: 'data: [DONE]\n\n',
        })
        port.postMessage({ type: CHAT_DURABLE_STREAM_DONE, runId: 'trace-durable-worker' })
      })
    },
  } as unknown as ServiceWorker
  const serviceWorker = {
    controller: workerTarget,
    ready: Promise.resolve({ active: workerTarget }),
  }
  try {
    Object.defineProperty(g, 'navigator', {
      configurable: true,
      value: { serviceWorker },
    })
    Object.defineProperty(g.window, 'navigator', {
      configurable: true,
      value: { serviceWorker },
    })

    const metadata: DurableChatStreamRequestMetadata = {
      runId: 'trace-durable-worker',
      traceId: 'trace-durable-worker',
      assistantMessageId: 'assistant-durable-worker',
      requestText: 'Stream through worker and survive refresh.',
      requestTimestampMs: Date.UTC(2026, 5, 6, 1, 0, 0),
      chatStorageTarget: 'chatAgenticGraph',
      liveAgenticOsPath: '/workspace/chat/20260606T010000Z/agenticOs_20260606T010000Z.md',
      providerSummary: 'OpenAI · Global · gpt-worker',
      defaultLocalRootPath: '/workspace/chat',
      packedFrontmatter: null,
    }
    const response = await fetchWithDurableChatStream({
      runMetadata: metadata,
      input: 'https://chat.example.test/v1/chat/completions',
      init: {
        method: 'POST',
        headers: {
          Authorization: 'Bearer SECRET_SHOULD_NOT_PERSIST',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'gpt-worker', stream: true, messages: [] }),
      },
      fallbackFetch: async () => {
        throw new Error('durable stream should not fall back in worker bridge test')
      },
    })
    const assistantStream = await readAssistantResponseText({
      response,
      isEventStream: true,
      flushDraft: () => {},
      firstChunkTimeoutMs: 0,
    })
    if (assistantStream.assistantText !== 'Worker resume') {
      throw new Error(`Expected worker-backed response to feed the shared SSE reader, got ${JSON.stringify(assistantStream.assistantText)}`)
    }
    const activeRun = readActiveDurableChatStreamRun()
    if (!activeRun || activeRun.runId !== metadata.runId || activeRun.liveAgenticOsPath !== metadata.liveAgenticOsPath) {
      throw new Error(`Expected durable stream metadata to persist for refresh reattach, got ${JSON.stringify(activeRun)}`)
    }
    if (JSON.stringify(activeRun).includes('SECRET_SHOULD_NOT_PERSIST')) {
      throw new Error(`Expected active durable stream metadata not to persist provider auth headers, got ${JSON.stringify(activeRun)}`)
    }
    const startMessage = capturedMessages.find(message => message.type === 'AG_CHAT_STREAM_START') as {
      request?: { headers?: Record<string, string> }
    } | undefined
    if (startMessage?.request?.headers?.authorization !== 'Bearer SECRET_SHOULD_NOT_PERSIST') {
      throw new Error(`Expected provider auth to be sent only to the worker request, got ${JSON.stringify(capturedMessages)}`)
    }
  } finally {
    clearActiveDurableChatStreamRun('trace-durable-worker')
    restore()
  }
}

export {
  testBuildTraceOnlyAssistantTextUsesProviderSignals,
  testCreateChatAgenticGraphDraftWriterUpdatesEditorWorkspaceAsLiveSurface,
  testExecuteFloatingPanelChatSubmitCoordinatorFinalizesTraceOnlyStream,
  testExecuteFloatingPanelChatSubmitCoordinatorReportsMissingContentStatus,
} from '@/__tests__/chatResponseTerminalCoordinator.test'
