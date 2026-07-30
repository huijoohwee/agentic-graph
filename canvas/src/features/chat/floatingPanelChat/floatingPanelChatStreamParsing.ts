import { extractAssistantContentText, isObjectRecord } from '../assistantContentText'

export type ChatStreamUsage = {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  reasoningTokens: number | null
  numSearchQueries: number | null
}

export type AssistantStreamDelta = {
  contentDelta: string
  reasoningTextDelta: string
  reasoningStepSummaries: string[]
  finishReason: string | null
  usage: ChatStreamUsage | null
  modelId: string | null
}


export const parseSseEvents = (buffer: string): { events: string[]; rest: string } => {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const blocks = normalized.split('\n\n')
  const rest = blocks.pop() || ''
  const events: string[] = []
  for (const block of blocks) {
    const dataLines: string[] = []
    block.split('\n').forEach(rawLine => {
      const line = String(rawLine || '')
      if (!line) return
      if (line.startsWith(':')) return
      if (!line.startsWith('data:')) return
      dataLines.push(line.slice('data:'.length).trimStart())
    })
    const payload = dataLines.join('\n').trim()
    if (payload) events.push(payload)
  }
  return { events, rest }
}

const toNullableNumber = (value: unknown): number | null => {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

const uniqueNonEmptyText = (values: Iterable<unknown>): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const text = typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : ''
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}

const readRecordStringField = (record: Record<string, unknown> | null | undefined, key: string): string => {
  const value = record?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

const readRecordRawStringField = (record: Record<string, unknown> | null | undefined, key: string): string => {
  const value = record?.[key]
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n') : ''
}

const readProviderErrorDetail = (value: unknown): string => {
  if (typeof value === 'string') return value.trim()
  if (!isObjectRecord(value)) return ''
  const message =
    readRecordStringField(value, 'message') ||
    readRecordStringField(value, 'detail') ||
    readRecordStringField(value, 'reason') ||
    readRecordStringField(value, 'code')
  if (message) return message
  return readProviderErrorDetail(value.error) || readProviderErrorDetail(value.incomplete_details)
}

export const formatReasoningStepSummary = (step: unknown): string => {
  if (typeof step === 'string') return step.trim()
  if (!step || typeof step !== 'object') return ''
  const record = step as Record<string, unknown>
  const type = typeof record.type === 'string' ? record.type.trim() : ''
  const thought = typeof record.thought === 'string' ? record.thought.trim() : ''
  const content = typeof record.content === 'string' ? record.content.trim() : ''
  if (type === 'thinking') return thought || content || 'thinking'
  if (type === 'web_search') {
    const search = record.web_search
    if (search && typeof search === 'object') {
      const keywords = Array.isArray((search as { search_keywords?: unknown }).search_keywords)
        ? ((search as { search_keywords: unknown[] }).search_keywords
          .filter(item => typeof item === 'string')
          .map(item => String(item).trim())
          .filter(Boolean))
        : []
      if (keywords.length > 0) return `web_search: ${keywords.join(', ')}`
    }
    return 'web_search'
  }
  if (type === 'fetch_url_content') {
    const fetchStep = record.fetch_url_content
    if (fetchStep && typeof fetchStep === 'object') {
      const title = typeof (fetchStep as { title?: unknown }).title === 'string'
        ? String((fetchStep as { title: unknown }).title).trim()
        : ''
      const url = typeof (fetchStep as { url?: unknown }).url === 'string'
        ? String((fetchStep as { url: unknown }).url).trim()
        : ''
      return `fetch_url: ${title || url || 'source'}`
    }
    return 'fetch_url'
  }
  if (type === 'execute_python' || type === 'execute_command') return type
  const toolCall = isObjectRecord(record.function) ? record.function : null
  const toolName =
    readRecordStringField(toolCall, 'name') ||
    readRecordStringField(record, 'name') ||
    readRecordStringField(record, 'tool_name')
  if (toolName) return `tool_call: ${toolName}`
  return thought || content || type
}

const extractReasoningTextSummaries = (record: Record<string, unknown> | null): string[] => {
  if (!record) return []
  return uniqueNonEmptyText([
    readRecordStringField(record, 'reasoning_content'),
    readRecordStringField(record, 'reasoning'),
    readRecordStringField(record, 'thought'),
    readRecordStringField(record, 'analysis'),
  ])
}

const extractReasoningTextDelta = (...records: Array<Record<string, unknown> | null>): string => {
  return records
    .map(record => readRecordRawStringField(record, 'reasoning_content'))
    .filter(Boolean)
    .join('')
}

const extractToolCallSummaries = (record: Record<string, unknown> | null): string[] => {
  if (!record) return []
  const calls = Array.isArray(record.tool_calls) ? record.tool_calls : []
  return uniqueNonEmptyText(calls.map(call => {
    if (!isObjectRecord(call)) return ''
    const fn = isObjectRecord(call.function) ? call.function : null
    const name =
      readRecordStringField(fn, 'name') ||
      readRecordStringField(call, 'name') ||
      readRecordStringField(call, 'type')
    return name ? `tool_call: ${name}` : ''
  }))
}

const extractReasoningSignalSummaries = (...records: Array<Record<string, unknown> | null>): string[] => {
  const summaries: string[] = []
  records.forEach(record => {
    if (!record) return
    summaries.push(...extractProviderErrorSummaries(record))
    const reasoningSteps = Array.isArray(record.reasoning_steps)
      ? record.reasoning_steps.map(formatReasoningStepSummary).filter(Boolean)
      : []
    summaries.push(...reasoningSteps)
    summaries.push(...extractReasoningTextSummaries(record))
    summaries.push(...extractToolCallSummaries(record))
  })
  return uniqueNonEmptyText(summaries)
}

function extractProviderErrorSummaries(record: Record<string, unknown> | null): string[] {
  if (!record) return []
  const type = readRecordStringField(record, 'type').toLowerCase()
  const response = isObjectRecord(record.response) ? record.response : null
  const responseStatus = readRecordStringField(response, 'status').toLowerCase()
  const message =
    readProviderErrorDetail(record.error) ||
    readProviderErrorDetail(response?.error) ||
    readProviderErrorDetail(record)
  const isProviderFailure =
    type === 'error' ||
    type.endsWith('.error') ||
    type.endsWith('.failed') ||
    responseStatus === 'failed'
  if (!isProviderFailure && !message) return []
  return [`provider_error: ${message || type || responseStatus || 'provider stream failed'}`]
}

export const formatChatStreamUsageSummary = (usage: ChatStreamUsage | null): string | null => {
  if (!usage) return null
  const parts = [
    usage.promptTokens !== null ? `prompt ${usage.promptTokens}` : null,
    usage.completionTokens !== null ? `completion ${usage.completionTokens}` : null,
    usage.totalTokens !== null ? `total ${usage.totalTokens}` : null,
    usage.reasoningTokens !== null ? `reasoning ${usage.reasoningTokens}` : null,
    usage.numSearchQueries !== null ? `searches ${usage.numSearchQueries}` : null,
  ].filter((value): value is string => Boolean(value))
  return parts.length > 0 ? `Usage: ${parts.join(' · ')}` : null
}

const readChatStreamUsage = (...records: Array<Record<string, unknown> | null>): ChatStreamUsage | null => {
  const usageRecord = records
    .map(record => record?.usage)
    .find(isObjectRecord)
  if (!usageRecord) return null
  return {
    promptTokens: toNullableNumber(usageRecord.prompt_tokens),
    completionTokens: toNullableNumber(usageRecord.completion_tokens),
    totalTokens: toNullableNumber(usageRecord.total_tokens),
    reasoningTokens: toNullableNumber(usageRecord.reasoning_tokens),
    numSearchQueries: toNullableNumber(usageRecord.num_search_queries),
  }
}

export const extractAssistantStreamDelta = (payload: unknown): AssistantStreamDelta => {
  if (!payload || typeof payload !== 'object') {
    return {
      contentDelta: '',
      reasoningTextDelta: '',
      reasoningStepSummaries: [],
      finishReason: null,
      usage: null,
      modelId: null,
    }
  }
  const record = payload as Record<string, unknown>
  const choices = Array.isArray(record.choices) ? record.choices : []
  const first = isObjectRecord(choices[0]) ? choices[0] : null
  const delta = isObjectRecord(first?.delta) ? first.delta : null
  const message = isObjectRecord(first?.message) ? first.message : null
  const reasoningSteps = extractReasoningSignalSummaries(delta, message, record)
  const reasoningTextDelta = extractReasoningTextDelta(delta, message, record)
  const usage = readChatStreamUsage(record, first, delta, message)
  const eventType = readRecordStringField(record, 'type').toLowerCase()
  const response = isObjectRecord(record.response) ? record.response : null
  const responseStatus = readRecordStringField(response, 'status').toLowerCase()
  const incompleteDetails = isObjectRecord(response?.incomplete_details)
    ? response.incomplete_details
    : isObjectRecord(record.incomplete_details)
      ? record.incomplete_details
      : null
  const incompleteReason = readRecordStringField(incompleteDetails, 'reason')
  return {
    contentDelta:
      extractAssistantContentText(delta?.content)
      || extractAssistantContentText(delta?.text)
      || extractAssistantContentText(delta?.output_text)
      || extractAssistantContentText(delta)
      || extractAssistantContentText(message?.content)
      || extractAssistantContentText(message?.text)
      || extractAssistantContentText(message?.output_text)
      || extractAssistantContentText(message)
      || extractAssistantContentText(first?.content)
      || extractAssistantContentText(first?.text)
      || extractAssistantContentText(response?.output_text)
      || extractAssistantContentText(response?.output)
      || extractAssistantContentText(response)
      || extractAssistantContentText(record),
    reasoningTextDelta,
    reasoningStepSummaries: reasoningSteps,
    finishReason:
      typeof first?.finish_reason === 'string'
        ? String(first.finish_reason)
        : typeof record.finish_reason === 'string'
          ? String(record.finish_reason)
          : eventType === 'response.incomplete' || responseStatus === 'incomplete'
            ? incompleteReason || 'incomplete'
            : eventType.endsWith('.failed') ||
              eventType === 'error' ||
              responseStatus === 'failed'
              ? 'error'
              : null,
    usage,
    modelId:
      typeof record.model === 'string'
        ? String(record.model)
        : readRecordStringField(response, 'model') || null,
  }
}

export const extractAssistantDelta = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') return ''
  const record = payload as Record<string, unknown>
  const choices = record.choices
  const response = isObjectRecord(record.response) ? record.response : null
  const rootText =
    extractAssistantContentText(record.output_text)
    || extractAssistantContentText(record.output)
    || extractAssistantContentText(response?.output_text)
    || extractAssistantContentText(response?.output)
    || extractAssistantContentText(response)
    || extractAssistantContentText(record)
  if (!Array.isArray(choices) || choices.length === 0) return rootText
  const first = isObjectRecord(choices[0]) ? choices[0] : null
  const delta = isObjectRecord(first?.delta)
    ? extractAssistantContentText(first.delta.content)
      || extractAssistantContentText(first.delta.text)
      || extractAssistantContentText(first.delta.output_text)
      || extractAssistantContentText(first.delta)
    : ''
  const direct = isObjectRecord(first?.message)
    ? extractAssistantContentText(first.message.content)
      || extractAssistantContentText(first.message.text)
      || extractAssistantContentText(first.message.output_text)
      || extractAssistantContentText(first.message)
    : ''
  const choiceText = extractAssistantContentText(first?.content) || extractAssistantContentText(first?.text) || extractAssistantContentText(first)
  return delta || direct || choiceText || rootText || ''
}
