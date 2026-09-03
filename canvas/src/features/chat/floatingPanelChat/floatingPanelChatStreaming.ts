import { toAgenticOsStreamingWorkspacePath, upsertChatHistoryWorkspaceDraft } from '../chatHistoryWorkspace'
import { shouldRejectMarkdownDocumentPayload } from '@/lib/markdown/markdownDocumentPayloadGuards'
import {
  extractAssistantDelta,
  extractAssistantStreamDelta,
  formatChatStreamUsageSummary,
  parseSseEvents,
} from './floatingPanelChatStreamParsing'
import { assertAssistantResponseTerminalComplete } from './floatingPanelChatTerminal'
const CHAT_STREAM_FIRST_CHUNK_TIMEOUT_MS = 12_000
const CHAT_STREAM_FIRST_CHUNK_TIMEOUT_ERROR = 'CHAT_STREAM_FIRST_CHUNK_TIMEOUT'
const CHAT_STREAM_UI_YIELD_EVENT_INTERVAL = 24
export type StreamingDraftStateRef = { current: { path: string; text: string } | null }
export type AssistantResponseStreamState = {
  assistantText: string
  rawSseEvents: string[]
  reasoningText?: string | null
  reasoningSteps: string[]
  reasoningPreview: string | null
  reasoningStepCount: number
  liveTranscriptText?: string | null
  usageSummary: string | null
  finishReason: string | null
  modelId: string | null
}
const TRACE_ONLY_SIGNAL_LIMIT = 12
const LIVE_PROVIDER_TRACE_MAX_LINES = 560
const LIVE_PROVIDER_TRACE_MAX_CHARS = 48_000
const LIVE_PROVIDER_TRACE_LIMIT_NOTICE = '[stream trace limit reached; final response continues in the canonical AGENTIC_OS file]'

const clampTraceLine = (value: unknown, maxLength = 240): string => {
  const text = String(value || '').replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > maxLength ? `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…` : text
}

const wrapMarkdownFence = (content: string): string => {
  const safe = String(content || '').replace(/\r\n/g, '\n')
  const ticks = safe.includes('```') ? '````' : '```'
  return [`${ticks}markdown`, safe, ticks].join('\n')
}

const appendReasoningTextDelta = (current: string, delta: string): string => {
  const next = String(delta || '').replace(/\r\n/g, '\n')
  if (!next) return current
  return `${current || ''}${next}`
}

const isLiveTraceSignalLine = (value: unknown): boolean => {
  const text = String(value || '').trim().toLowerCase()
  return (
    text.startsWith('tool_call:') ||
    text.startsWith('web_search:') ||
    text.startsWith('use_mcp_tool') ||
    text.includes('server_name')
  )
}

const appendLiveTraceSignalLines = (current: string, values: readonly string[]): string => {
  const lines = values.map(value => clampTraceLine(value)).filter(isLiveTraceSignalLine)
  if (lines.length <= 0) return current
  let next = current
  lines.forEach(line => {
    if (next.toLowerCase().includes(line.toLowerCase())) return
    const joiner = next && !next.endsWith('\n') ? '\n' : ''
    next = `${next}${joiner}${line}`
  })
  return next
}

const appendBoundedLiveTranscriptText = (current: string, value: string): string => {
  const text = String(value || '').replace(/\r\n/g, '\n')
  if (!text) return current
  if (current.includes(LIVE_PROVIDER_TRACE_LIMIT_NOTICE)) return current

  const remainingChars = Math.max(0, LIVE_PROVIDER_TRACE_MAX_CHARS - current.length)
  if (remainingChars <= 0) {
    const joiner = current && !current.endsWith('\n') ? '\n' : ''
    return `${current}${joiner}${LIVE_PROVIDER_TRACE_LIMIT_NOTICE}`
  }

  const candidate = `${current || ''}${text.slice(0, remainingChars)}`
  const lines = candidate.split('\n')
  if (lines.length <= LIVE_PROVIDER_TRACE_MAX_LINES && text.length <= remainingChars) return candidate

  const previousLineCount = current ? current.split('\n').length : 1
  const allowedNewLines = Math.max(0, LIVE_PROVIDER_TRACE_MAX_LINES - previousLineCount - 1)
  const incomingLines = text.slice(0, remainingChars).split('\n')
  const suffix = incomingLines.slice(0, allowedNewLines + 1).join('\n')
  const next = `${current || ''}${suffix}`
  const joiner = next && !next.endsWith('\n') ? '\n' : ''
  return `${next}${joiner}${LIVE_PROVIDER_TRACE_LIMIT_NOTICE}`
}

const appendLiveTranscriptChunk = (
  current: string,
  channel: 'assistant' | 'reasoning' | 'signal',
  value: string,
  activeChannel: string | null,
): { text: string; channel: string | null } => {
  const chunk = String(value || '').replace(/\r\n/g, '\n')
  if (!chunk) return { text: current, channel: activeChannel }
  const marker = activeChannel === channel
    ? ''
    : channel === 'assistant'
      ? `${current ? '\n\n' : ''}### Assistant Draft\n\n[assistant]\n`
      : `${current ? '\n\n' : ''}[${channel}]\n`
  const next = appendBoundedLiveTranscriptText(current, `${marker}${chunk}`)
  return { text: next, channel }
}

const uniqueTraceSignals = (values: readonly string[]): string[] => {
  const normalizedValues = values
    .map(value => String(value || '').replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const out: string[] = []
  const seen = new Set<string>()
  normalizedValues.forEach(text => {
    const key = text.toLowerCase()
    if (seen.has(key)) return
    const isContainedFragment = normalizedValues.some(other => {
      const otherKey = other.toLowerCase()
      return otherKey !== key && otherKey.length > key.length && otherKey.includes(key)
    })
    if (isContainedFragment) return
    seen.add(key)
    out.push(text)
  })
  return out
}

const hasTraceOnlyTerminalSignal = (state: AssistantResponseStreamState): boolean => {
  if (state.assistantText.trim()) return false
  if (state.reasoningSteps.some(step => String(step || '').trim())) return true
  return state.rawSseEvents.some(event => {
    const text = String(event || '').toLowerCase()
    return (
      text.includes('reasoning') ||
      text.includes('tool_calls') ||
      text.includes('tool_call') ||
      text.includes('use_mcp_tool') ||
      text.includes('server_name')
    )
  })
}

export const buildTraceOnlyAssistantText = (state: AssistantResponseStreamState): string => {
  if (state.assistantText.trim()) return ''
  return buildProviderStreamDraftText(state, 'terminal')
}

export const buildLiveProviderStreamDraftText = (state: AssistantResponseStreamState): string => {
  const liveTranscriptText = String(state.liveTranscriptText || '')
  if (liveTranscriptText.trim()) {
    return [
      '## Provider Stream Trace',
      '',
      'The provider stream is active. Incoming reasoning, tool, and assistant deltas are appended below.',
      '',
      '### Stream Transcript',
      '',
    ].join('\n') + liveTranscriptText
  }
  const assistantText = String(state.assistantText || '').replace(/\r\n/g, '\n')
  if (assistantText.trim()) {
    return [
      '## Provider Stream Trace',
      '',
      'The provider stream is active. Incoming reasoning, tool, and assistant deltas are appended below.',
      '',
      '### Stream Transcript',
      '',
      '### Assistant Draft',
      '',
      '[assistant]',
      assistantText,
    ].join('\n').trimEnd()
  }
  const reasoningText = String(state.reasoningText || '').replace(/\r\n/g, '\n')
  const signals = state.reasoningSteps.map(step => clampTraceLine(step)).filter(Boolean)
  if (!reasoningText.trim() && signals.length <= 0 && state.rawSseEvents.length <= 0) return ''
  const transcript = reasoningText.trim()
    ? `[reasoning]\n${reasoningText}`
    : signals.length > 0
      ? `[signal]\n${signals.map(signal => `- ${signal}`).join('\n')}`
      : '[signal]\n- Stream events are arriving.'
  return [
    '## Provider Stream Trace',
    '',
    'The provider stream is active. Incoming reasoning, tool, and assistant deltas are appended below.',
    '',
    '### Stream Transcript',
    '',
    transcript,
  ].join('\n').trimEnd()
}

export const buildProviderStreamDraftText = (
  state: AssistantResponseStreamState,
  phase: 'live' | 'terminal',
): string => {
  if (phase === 'live') return buildLiveProviderStreamDraftText(state)
  const liveText = buildLiveProviderStreamDraftText(state)
  const assistantText = String(state.assistantText || '').replace(/\r\n/g, '\n').trim()
  const hasAssistantText = !!assistantText
  if (!hasAssistantText && !hasTraceOnlyTerminalSignal(state)) return ''
  if (liveText) {
    const metadata = [
      ...(state.modelId ? [`- Model: ${state.modelId}`] : []),
      ...(state.finishReason ? [`- Finish: ${state.finishReason}`] : []),
      ...(state.usageSummary ? [`- ${state.usageSummary}`] : []),
      `- SSE events: ${state.rawSseEvents.length}`,
      ...(hasAssistantText ? [`- Assistant characters: ${assistantText.length}`] : []),
    ]
    return [
      liveText,
      '',
      '### Terminal Metadata',
      '',
      ...metadata,
    ].join('\n').trimEnd()
  }
  const signals = state.reasoningSteps
    .map(step => clampTraceLine(step))
    .filter(Boolean)
    .slice(0, TRACE_ONLY_SIGNAL_LIMIT)
  const statusLine = hasAssistantText
    ? (phase === 'terminal'
        ? 'The provider returned assistant text with provider trace events.'
        : 'The provider is streaming assistant content and provider trace events. Final response is still in progress.')
    : (phase === 'terminal'
        ? 'The provider returned reasoning or tool-call trace events but did not return final assistant text.'
        : 'The provider is streaming reasoning or tool-call trace events. Final assistant text has not arrived yet.')
  return [
    '## Provider Stream Trace',
    '',
    statusLine,
    '',
    ...(state.modelId ? [`- Model: ${state.modelId}`] : []),
    ...(state.finishReason ? [`- Finish: ${state.finishReason}`] : []),
    ...(state.usageSummary ? [`- ${state.usageSummary}`] : []),
    `- SSE events: ${state.rawSseEvents.length}`,
    ...(hasAssistantText ? [`- Assistant characters: ${assistantText.length}`] : []),
    '',
    '### Stream Signals',
    '',
    ...(signals.length > 0
      ? signals.map(signal => `- ${signal}`)
      : ['- Stream included trace events, but no compact signal text could be extracted.']),
    ...(hasAssistantText
      ? ['', '### Assistant Draft', '', wrapMarkdownFence(assistantText)]
      : []),
  ].join('\n').trimEnd()
}

const buildLiveTraceAssistantText = (state: AssistantResponseStreamState): string => {
  if (state.assistantText.trim()) return ''
  return buildProviderStreamDraftText(state, 'live')
}

const yieldToStreamingUi = (): Promise<void> =>
  new Promise(resolve => {
    const raf = typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame.bind(globalThis)
      : null
    if (raf) {
      raf(() => resolve())
      return
    }
    setTimeout(resolve, 0)
  })

export const createChatAgenticGraphDraftWriter = (args: {
  chatStorageTarget: 'chatHistory' | 'chatAgenticGraph'
  liveAgenticOsPath: string | null
  requestTimestampMs: number
  providerSummary: string
  userText: string
  defaultLocalRootPath: string
  traceId: string
  streamDraftTextRef: StreamingDraftStateRef
  followWorkspaceMarkdownPath: (path: string) => void
  setChatAgenticGraphWorkspacePath: (path: string) => void
  setChatWorkspaceStreamingState?: (value: { path?: string | null; text?: string | null } | null) => void
  persistDraft?: typeof upsertChatHistoryWorkspaceDraft
  persistWorkspaceDrafts?: boolean
}) => {
  return async (text: string, force: boolean): Promise<void> => {
    if (args.chatStorageTarget !== 'chatAgenticGraph') return
    if (!args.liveAgenticOsPath) return
    const canonicalWorkspacePath = args.liveAgenticOsPath
    const liveWorkspacePath = toAgenticOsStreamingWorkspacePath(canonicalWorkspacePath)
    if (shouldRejectMarkdownDocumentPayload(text)) {
      args.streamDraftTextRef.current = { path: liveWorkspacePath, text: '' }
      args.setChatWorkspaceStreamingState?.({ path: liveWorkspacePath, text: '' })
      return
    }
    const isDuplicateDraft = (
      args.streamDraftTextRef.current?.path === liveWorkspacePath &&
      args.streamDraftTextRef.current.text === text
    )
    if (!force && isDuplicateDraft) return
    const pathChanged = args.streamDraftTextRef.current?.path !== liveWorkspacePath
    if (pathChanged) args.followWorkspaceMarkdownPath(liveWorkspacePath)
    args.streamDraftTextRef.current = { path: liveWorkspacePath, text }
    if (!isDuplicateDraft) args.setChatWorkspaceStreamingState?.({ path: liveWorkspacePath, text })
    if (args.persistWorkspaceDrafts !== true) return
    const persistDraft = args.persistDraft || upsertChatHistoryWorkspaceDraft
    const payload: Parameters<typeof persistDraft>[0] = {
        requestedPath: canonicalWorkspacePath,
        onResolvedPath: p => args.setChatAgenticGraphWorkspacePath(p),
        timestampMs: args.requestTimestampMs,
        providerSummary: args.providerSummary,
        userText: args.userText,
        assistantText: text,
        storageType: 'chatAgenticGraph',
        defaultLocalRootPath: args.defaultLocalRootPath,
        title: 'Knowledge Graph Canvas Storage',
        traceId: args.traceId,
    }
    void persistDraft(payload).catch(() => undefined)
  }
}

export const readAssistantResponseText = async (args: {
  response: Response
  isEventStream: boolean
  flushDraft: (text: string, force: boolean) => Promise<unknown> | unknown
  onProgress?: (state: AssistantResponseStreamState) => void
  formatDraftText?: (state: AssistantResponseStreamState, phase: 'live' | 'terminal') => string | null | undefined
  yieldToUi?: () => Promise<unknown> | unknown
  nowMs?: () => number
  firstChunkTimeoutMs?: number
}): Promise<AssistantResponseStreamState> => {
  const flushDraft = args.flushDraft
  const onProgress = args.onProgress
  const formatDraftText = args.formatDraftText
  const yieldToUi = args.yieldToUi || yieldToStreamingUi
  const buildState = (current: {
    assistantText: string
    rawSseEvents: string[]
    reasoningText: string
    reasoningSteps: string[]
    liveTranscriptText: string
    usageSummary: string | null
    finishReason: string | null
    modelId: string | null
  }): AssistantResponseStreamState => {
    const compactReasoningText = clampTraceLine(current.reasoningText, 1200)
    const reasoningSteps = uniqueTraceSignals([
      compactReasoningText,
      ...current.reasoningSteps,
    ])
    return {
      assistantText: current.assistantText,
      rawSseEvents: [...current.rawSseEvents],
      reasoningText: current.reasoningText,
      reasoningSteps,
      reasoningPreview:
        reasoningSteps.length > 0
          ? `Reasoning ${reasoningSteps.length}: ${reasoningSteps.slice(-2).join(' | ')}`
          : null,
      reasoningStepCount: reasoningSteps.length,
      liveTranscriptText: current.liveTranscriptText,
      usageSummary: current.usageSummary,
      finishReason: current.finishReason,
      modelId: current.modelId,
    }
  }
  if (!args.isEventStream || !args.response.body) {
    const data = (await args.response.json()) as unknown
    const assistantText = extractAssistantDelta(data) || ''
    await flushDraft(assistantText, true)
    const streamDelta = extractAssistantStreamDelta(data)
    const state = buildState({
      assistantText,
      rawSseEvents: [],
      reasoningText: streamDelta.reasoningTextDelta,
      reasoningSteps: streamDelta.reasoningStepSummaries,
      liveTranscriptText: '',
      usageSummary: formatChatStreamUsageSummary(streamDelta.usage),
      finishReason: streamDelta.finishReason,
      modelId: streamDelta.modelId,
    })
    onProgress?.(state)
    assertAssistantResponseTerminalComplete(state)
    return state
  }

  const reader = args.response.body.getReader()
  const decoder = new TextDecoder()
  const nowMs = args.nowMs || Date.now
  const firstChunkTimeoutMs = Math.max(0, Number(args.firstChunkTimeoutMs ?? CHAT_STREAM_FIRST_CHUNK_TIMEOUT_MS) || 0)
  let state = {
    assistantText: '',
    rawSseEvents: [] as string[],
    reasoningText: '',
    reasoningSteps: [] as string[],
    liveTranscriptText: '',
    liveTranscriptChannel: null as string | null,
    usageSummary: null as string | null,
    finishReason: null as string | null,
    modelId: null as string | null,
  }
  let buffer = ''
  let done = false
  let receivedAnyChunk = false
  let lastDraftFlushMs = Number.NEGATIVE_INFINITY
  let lastProgressFlushMs = Number.NEGATIVE_INFINITY
  let liveTraceDraftText = ''
  let pendingDraftWrite: Promise<unknown> | null = null
  let parsedEventsSinceUiYield = 0
  let draftWritesSinceUiYield = 0
  const maybeYieldToUi = async (force: boolean) => {
    if (!force && draftWritesSinceUiYield <= 0 && parsedEventsSinceUiYield < CHAT_STREAM_UI_YIELD_EVENT_INTERVAL) return
    parsedEventsSinceUiYield = 0
    draftWritesSinceUiYield = 0
    try {
      await yieldToUi()
    } catch {
      void 0
    }
  }
  const flushProgressThrottled = (force: boolean) => {
    const currentMs = nowMs()
    if (!force && currentMs - lastProgressFlushMs < 160) return
    lastProgressFlushMs = currentMs
    onProgress?.(buildState(state))
  }
  const flushDraftThrottled = (force: boolean, text = state.assistantText): boolean => {
    const currentMs = nowMs()
    if (!force && currentMs - lastDraftFlushMs < 160) return false
    lastDraftFlushMs = currentMs
    draftWritesSinceUiYield += 1
    pendingDraftWrite = Promise.resolve(flushDraft(text, force))
    return true
  }
  const flushStateDraftThrottled = (force: boolean, phase: 'live' | 'terminal') => {
    const formatted = formatDraftText?.(buildState(state), phase)
    flushDraftThrottled(force, typeof formatted === 'string' && formatted ? formatted : state.assistantText)
  }
  const flushTraceDraftThrottled = (force: boolean) => {
    if (state.assistantText.trim()) return
    const traceText = buildLiveTraceAssistantText(buildState(state))
    if (!traceText) return
    if (!force && traceText === liveTraceDraftText) return
    liveTraceDraftText = traceText
    flushDraftThrottled(force, traceText)
  }

  try {
    while (!done) {
      const chunk = receivedAnyChunk || firstChunkTimeoutMs <= 0
        ? await reader.read()
        : await (() => {
          let timeoutId: ReturnType<typeof setTimeout> | null = null
          const chunkPromise = reader.read()
          const timeoutPromise = new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(CHAT_STREAM_FIRST_CHUNK_TIMEOUT_ERROR)), firstChunkTimeoutMs)
          })
          return Promise.race([chunkPromise, timeoutPromise]).finally(() => {
            if (timeoutId) clearTimeout(timeoutId)
          })
        })()
      if (chunk.done) break
      receivedAnyChunk = true
      buffer += decoder.decode(chunk.value, { stream: true })
      const parsed = parseSseEvents(buffer)
      buffer = parsed.rest
      for (const raw of parsed.events) {
        if (raw === '[DONE]') {
          done = true
          break
        }
        try {
          parsedEventsSinceUiYield += 1
          state = { ...state, rawSseEvents: [...state.rawSseEvents, raw] }
          const parsedPayload = JSON.parse(raw) as unknown
          const next = extractAssistantStreamDelta(parsedPayload)
          const payloadType =
            parsedPayload && typeof parsedPayload === 'object' && !Array.isArray(parsedPayload)
              ? String((parsedPayload as Record<string, unknown>).type || '').trim().toLowerCase()
              : ''
          const contentDelta =
            payloadType === 'response.output_text.done' && state.assistantText
              ? ''
              : next.contentDelta
          let changed = false
          if (next.modelId && next.modelId !== state.modelId) {
            state = { ...state, modelId: next.modelId }
            changed = true
          }
          if (next.reasoningStepSummaries.length > 0) {
            const signalChunk = next.reasoningStepSummaries
              .map(step => clampTraceLine(step))
              .filter(Boolean)
              .filter(isLiveTraceSignalLine)
              .map(step => `- ${step}`)
              .join('\n')
            const transcript = signalChunk
              ? appendLiveTranscriptChunk(
                  state.liveTranscriptText,
                  'signal',
                  signalChunk,
                  state.liveTranscriptChannel,
                )
              : { text: state.liveTranscriptText, channel: state.liveTranscriptChannel }
            state = {
              ...state,
              reasoningText: appendLiveTraceSignalLines(state.reasoningText, next.reasoningStepSummaries),
              reasoningSteps: [...state.reasoningSteps, ...next.reasoningStepSummaries],
              liveTranscriptText: transcript.text,
              liveTranscriptChannel: transcript.channel,
            }
            changed = true
          }
          if (next.reasoningTextDelta) {
            const transcript = appendLiveTranscriptChunk(
              state.liveTranscriptText,
              'reasoning',
              next.reasoningTextDelta,
              state.liveTranscriptChannel,
            )
            state = {
              ...state,
              reasoningText: appendReasoningTextDelta(state.reasoningText, next.reasoningTextDelta),
              liveTranscriptText: transcript.text,
              liveTranscriptChannel: transcript.channel,
            }
            changed = true
          }
          if (contentDelta) {
            const transcript = appendLiveTranscriptChunk(
              state.liveTranscriptText,
              'assistant',
              contentDelta,
              state.liveTranscriptChannel,
            )
            state = {
              ...state,
              assistantText: `${state.assistantText}${contentDelta}`,
              liveTranscriptText: transcript.text,
              liveTranscriptChannel: transcript.channel,
            }
            changed = true
            flushStateDraftThrottled(false, 'live')
          }
          const usageSummary = formatChatStreamUsageSummary(next.usage)
          if (usageSummary && usageSummary !== state.usageSummary) {
            state = { ...state, usageSummary }
            changed = true
          }
          if (next.finishReason && next.finishReason !== state.finishReason) {
            state = { ...state, finishReason: next.finishReason }
            changed = true
          }
          if (changed) {
            flushTraceDraftThrottled(false)
            flushProgressThrottled(false)
          }
          await maybeYieldToUi(false)
        } catch {
          void 0
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '')
    try { await reader.cancel(error) } catch { void 0 }
    if (!receivedAnyChunk || /abort/i.test(message)) throw error
    state = { ...state, finishReason: state.finishReason || 'error', reasoningSteps: [...state.reasoningSteps, `stream_error: ${clampTraceLine(message || 'provider stream failed')}`] }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      void 0
    }
  }
  if (!state.assistantText.trim() && state.rawSseEvents.length > 0 && state.reasoningSteps.length <= 0) state = { ...state, finishReason: state.finishReason || 'error', reasoningSteps: ['stream_empty: provider stream ended without assistant text'] }
  if (state.assistantText.trim()) {
    flushStateDraftThrottled(true, 'terminal')
  } else {
    const formatted = formatDraftText?.(buildState(state), 'terminal')
    const terminalTraceText = (typeof formatted === 'string' && formatted) || buildTraceOnlyAssistantText(buildState(state))
    if (terminalTraceText) flushDraftThrottled(true, terminalTraceText)
    else flushTraceDraftThrottled(true)
  }
  flushProgressThrottled(true)
  await maybeYieldToUi(true)
  if (pendingDraftWrite) {
    try {
      await pendingDraftWrite
    } catch {
      void 0
    }
  }
  const finalState = buildState(state)
  onProgress?.(finalState)
  assertAssistantResponseTerminalComplete(finalState)
  return finalState
}

export { CHAT_STREAM_FIRST_CHUNK_TIMEOUT_ERROR }
