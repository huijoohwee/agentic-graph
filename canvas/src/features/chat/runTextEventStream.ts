import {
  extractAssistantStreamDelta,
  parseSseEvents,
} from './floatingPanelChat/floatingPanelChatStreamParsing'
import {
  readRunTextProviderIncompleteReason,
  RunTextProviderIncompleteError,
} from './runTextProviderResponse'

const TERMINAL_AGGREGATE_EVENT_TYPES = new Set([
  'response.output_text.done',
  'response.content_part.done',
  'response.output_item.done',
  'response.completed',
])

type RunTextReasoningSignal = {
  textDelta: string
  summaries: string[]
}

const readRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

const readReasoningSummaryText = (value: unknown): string[] => {
  if (typeof value === 'string') {
    const text = value.replace(/\r\n/g, '\n').trim()
    return text ? [text] : []
  }
  if (Array.isArray(value)) return value.flatMap(readReasoningSummaryText)
  const record = readRecord(value)
  if (!record) return []
  return [
    ...readReasoningSummaryText(record.text),
    ...readReasoningSummaryText(record.content),
    ...readReasoningSummaryText(record.summary),
  ]
}

export function extractRunTextReasoningSignal(payload: unknown): RunTextReasoningSignal {
  const streamDelta = extractAssistantStreamDelta(payload)
  const record = readRecord(payload)
  const eventType = String(record?.type || '').trim().toLowerCase()
  const rootReasoningDelta = eventType.includes('reasoning') && eventType.endsWith('.delta')
    && typeof record?.delta === 'string'
    ? record.delta.replace(/\r\n/g, '\n')
    : ''
  const response = readRecord(record?.response)
  const output = [
    ...(Array.isArray(record?.output) ? record.output : []),
    ...(Array.isArray(response?.output) ? response.output : []),
  ]
  const responseSummaries = output.flatMap(item => {
    const outputItem = readRecord(item)
    const type = String(outputItem?.type || '').trim().toLowerCase()
    if (!type.includes('reasoning')) return []
    return readReasoningSummaryText(outputItem?.summary)
  })
  const textDelta = streamDelta.reasoningTextDelta || rootReasoningDelta
  const normalizedDelta = textDelta.trim()
  const summaries = [...streamDelta.reasoningStepSummaries, ...responseSummaries]
    .map(summary => String(summary || '').replace(/\r\n/g, '\n').trim())
    .filter(summary => summary && !summary.startsWith('provider_error: ') && summary !== normalizedDelta)
  return {
    textDelta,
    summaries: [...new Set(summaries)],
  }
}

const appendAggregateText = (current: string, nextValue: string): string => {
  const next = String(nextValue || '').replace(/\r\n/g, '\n')
  if (!next) return current
  if (!current) return next
  if (next === current || current.endsWith(next)) return current
  if (next.startsWith(current)) return next
  return `${current}${next}`
}

export async function readRunTextEventStream(args: {
  body: ReadableStream<Uint8Array>
  extractText: (payload: unknown) => string
  onText?: (text: string) => void
  onReasoningText?: (text: string) => void
}): Promise<string> {
  const reader = args.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let done = false
  let finishReason = ''
  let reasoningObserved = false
  let incompleteReason: string | null = null
  const providerErrors: string[] = []
  let reasoningText = ''
  let emittedReasoningText = ''
  const reasoningSummaries: string[] = []
  const reasoningSummaryKeys = new Set<string>()
  const emitReasoningText = () => {
    const normalizedReasoningText = reasoningText.trim()
    const summaryMarkdown = reasoningSummaries.length > 0
      ? reasoningSummaries.map(summary => `- ${summary}`).join('\n')
      : ''
    const next = [normalizedReasoningText, summaryMarkdown].filter(Boolean).join('\n\n')
    if (!next || next === emittedReasoningText) return
    emittedReasoningText = next
    args.onReasoningText?.(next)
  }
  const consumePayload = (payload: unknown) => {
    const terminalIncompleteReason = readRunTextProviderIncompleteReason(payload)
    if (terminalIncompleteReason !== null) incompleteReason = terminalIncompleteReason
    const streamDelta = extractAssistantStreamDelta(payload)
    if (streamDelta.finishReason) finishReason = streamDelta.finishReason
    const reasoningSignal = extractRunTextReasoningSignal(payload)
    if (reasoningSignal.textDelta || reasoningSignal.summaries.length) reasoningObserved = true
    reasoningText = appendAggregateText(reasoningText, reasoningSignal.textDelta)
    for (const summary of reasoningSignal.summaries) {
      const key = summary.toLowerCase()
      if (reasoningSummaryKeys.has(key)) continue
      reasoningSummaryKeys.add(key)
      reasoningSummaries.push(summary)
    }
    emitReasoningText()
    streamDelta.reasoningStepSummaries.forEach(summary => {
      if (summary.startsWith('provider_error: ')) providerErrors.push(summary.slice('provider_error: '.length))
    })
    const next = args.extractText(payload)
    if (!next) return
    const eventType = payload && typeof payload === 'object'
      ? String((payload as { type?: unknown }).type || '').trim().toLowerCase()
      : ''
    const isTerminalAggregate = TERMINAL_AGGREGATE_EVENT_TYPES.has(eventType)
    if (isTerminalAggregate && fullText) {
      if (next === fullText || fullText.endsWith(next)) return
      if (next.startsWith(fullText)) {
        fullText = next
        args.onText?.(fullText)
        return
      }
    }
    fullText += next
    args.onText?.(fullText)
  }
  const consumeEvents = (events: readonly string[]) => {
    for (const raw of events) {
      if (raw === '[DONE]') {
        done = true
        break
      }
      try {
        consumePayload(JSON.parse(raw) as unknown)
      } catch {
        void 0
      }
    }
  }
  while (!done) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    const parsed = parseSseEvents(buffer)
    buffer = parsed.rest
    consumeEvents(parsed.events)
  }
  buffer += decoder.decode()
  if (buffer.trim()) consumeEvents(parseSseEvents(`${buffer}\n\n`).events)
  if (providerErrors.length) throw new Error(providerErrors[0])
  if (incompleteReason !== null) throw new RunTextProviderIncompleteError(incompleteReason)
  if (finishReason === 'length') {
    throw new Error('Text generation reached max_completion_tokens before returning assistant content. Disable thinking or increase the text-stage token budget.')
  }
  if (fullText.trim()) return fullText
  if (reasoningObserved) {
    throw new Error('Text generation returned reasoning but no assistant content. Disable thinking for final-output workflow stages.')
  }
  throw new Error(`Text generation stream ended without assistant content${finishReason ? ` (finish_reason: ${finishReason})` : ''}.`)
}
