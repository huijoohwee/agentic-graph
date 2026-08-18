import { openAiUsageCostLog, type TravelAgencyCostLog } from './costLog'
import { resolveTravelAgencyIntentConfig, type TravelAgencyConfigError, type TravelAgencyEnv, type TravelAgencyIntentConfig } from './runtimeConfig'

export type TravelAgencyIntent = {
  kind: 'flight'
  origin: string
  destination: string
  dateRangeStart: string
  dateRangeEnd: string
  budgetCeiling: { amountMinor: number; currency: string }
}

export type TravelAgencyIntentError = {
  code: 'unparseable-intent'
  fields: string[]
}

export type TravelAgencyIntentParseResult =
  | { ok: true; intent: TravelAgencyIntent; costLog: TravelAgencyCostLog }
  | { ok: false; error: TravelAgencyIntentError | TravelAgencyConfigError; costLog: TravelAgencyCostLog }

type OpenAiResponse = {
  output_text?: unknown
  output?: unknown
  usage?: unknown
}

const SYSTEM_PROMPT = [
  'Return only JSON for a flight purchase intent.',
  'Schema: {"kind":"flight","origin":"IATA or city","destination":"IATA or city","dateRangeStart":"YYYY-MM-DD","dateRangeEnd":"YYYY-MM-DD","budgetCeiling":{"amountMinor":integer,"currency":"ISO-4217"}}.',
  'Use smallest currency units for amountMinor. Use null for unresolved fields.',
].join(' ')

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const readString = (value: unknown): string => String(value ?? '').trim()

const parseDateOnly = (value: unknown): number | null => {
  const text = readString(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const time = Date.parse(`${text}T00:00:00.000Z`)
  return Number.isFinite(time) ? time : null
}

const extractOutputText = (response: OpenAiResponse): string => {
  if (typeof response.output_text === 'string') return response.output_text
  if (!Array.isArray(response.output)) return ''
  for (const item of response.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue
    for (const part of item.content) {
      if (isRecord(part) && typeof part.text === 'string') return part.text
    }
  }
  return ''
}

const parseOpenAiJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    return match ? JSON.parse(match[0]) : null
  }
}

const validateIntent = (value: unknown, config: TravelAgencyIntentConfig, requestDateMs: number): TravelAgencyIntent | TravelAgencyIntentError => {
  const fields: string[] = []
  const record = isRecord(value) ? value : {}
  const budget = isRecord(record.budgetCeiling) ? record.budgetCeiling : {}
  const origin = readString(record.origin)
  const destination = readString(record.destination)
  const dateRangeStart = readString(record.dateRangeStart)
  const dateRangeEnd = readString(record.dateRangeEnd)
  const currency = readString(budget.currency).toUpperCase()
  const amountMinor = Number(budget.amountMinor)
  const startMs = parseDateOnly(dateRangeStart)
  const endMs = parseDateOnly(dateRangeEnd)
  if (!origin) fields.push('origin')
  if (!destination) fields.push('destination')
  if (startMs == null || startMs < requestDateMs) fields.push('dateRangeStart')
  if (endMs == null || startMs == null || endMs < startMs) fields.push('dateRangeEnd')
  if (startMs != null && endMs != null && (endMs - startMs) / 86_400_000 > config.maxDateSpanDays) fields.push('dateRangeEnd')
  if (!Number.isInteger(amountMinor) || amountMinor < config.minBudgetMinor || amountMinor > config.maxBudgetMinor) fields.push('budgetCeiling.amountMinor')
  if (!/^[A-Z]{3}$/.test(currency)) fields.push('budgetCeiling.currency')
  if (fields.length > 0) return { code: 'unparseable-intent', fields: [...new Set(fields)] }
  return {
    kind: 'flight',
    origin,
    destination,
    dateRangeStart,
    dateRangeEnd,
    budgetCeiling: { amountMinor, currency },
  }
}

export const parseTravelAgencyIntent = async (args: {
  env: TravelAgencyEnv
  input: string
  requestDateIso: string
  fetchFn?: typeof fetch
}): Promise<TravelAgencyIntentParseResult> => {
  const config = resolveTravelAgencyIntentConfig(args.env)
  const model = 'code' in config ? 'unknown' : config.openaiModel
  if ('code' in config) return { ok: false, error: config, costLog: openAiUsageCostLog(model, null) }
  const input = readString(args.input)
  if (!input || input.length > config.maxInputChars) {
    return { ok: false, error: { code: 'unparseable-intent', fields: ['input'] }, costLog: openAiUsageCostLog(config.openaiModel, null) }
  }
  const requestDateMs = parseDateOnly(args.requestDateIso)
  if (requestDateMs == null) {
    return { ok: false, error: { code: 'unparseable-intent', fields: ['requestDateIso'] }, costLog: openAiUsageCostLog(config.openaiModel, null) }
  }

  const response = await (args.fetchFn || fetch)(config.openaiResponsesUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.openaiApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.openaiModel,
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Request date: ${args.requestDateIso}\nRequest: ${input}` },
      ],
      text: { format: { type: 'json_object' } },
    }),
  })
  const body = await response.json().catch(() => null) as OpenAiResponse | null
  const costLog = openAiUsageCostLog(config.openaiModel, body?.usage)
  if (!response.ok || !body) return { ok: false, error: { code: 'unparseable-intent', fields: ['openaiResponse'] }, costLog }
  let parsed: unknown = null
  try {
    parsed = parseOpenAiJson(extractOutputText(body))
  } catch {
    parsed = null
  }
  const intent = validateIntent(parsed, config, requestDateMs)
  if ('code' in intent) return { ok: false, error: intent, costLog }
  return { ok: true, intent, costLog }
}
