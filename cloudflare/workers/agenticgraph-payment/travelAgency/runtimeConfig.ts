export type TravelAgencyEnv = Record<string, unknown> & {
  OPENAI_API_KEY?: unknown
  TRAVEL_INTENT_OPENAI_RESPONSES_URL?: unknown
  TRAVEL_INTENT_OPENAI_MODEL?: unknown
  TRAVEL_INTENT_MAX_INPUT_CHARS?: unknown
  TRAVEL_INTENT_MAX_DATE_SPAN_DAYS?: unknown
  TRAVEL_INTENT_MIN_BUDGET_MINOR?: unknown
  TRAVEL_INTENT_MAX_BUDGET_MINOR?: unknown
  TRAVEL_GUARDRAIL_RETRY_BOUND?: unknown
  TRAVEL_ISSUANCE_MCP_SERVER_KEY?: unknown
  TRAVEL_ISSUANCE_MCP_TRANSPORT?: unknown
  TRAVEL_ISSUANCE_MCP_TOOL_NAME?: unknown
  TRAVEL_ISSUANCE_RESPONSE_DEADLINE_MS?: unknown
  TRAVEL_ISSUANCE_PER_CARD_CAP_MINOR?: unknown
  TRAVEL_ISSUANCE_CURRENCY?: unknown
}

export type TravelAgencyIntentConfig = {
  openaiApiKey: string
  openaiResponsesUrl: string
  openaiModel: string
  maxInputChars: number
  maxDateSpanDays: number
  minBudgetMinor: number
  maxBudgetMinor: number
}

export type TravelAgencyGuardrailConfig = {
  retryBound: number
  minBudgetMinor: number
  maxBudgetMinor: number
}

export type TravelAgencyIssuanceConfig = {
  mcpServerKey: string
  transport: 'sse'
  toolName: string
  responseDeadlineMs: number
  perCardCapMinor: number
  currency: string
}

export type TravelAgencyConfigError = {
  code: 'configuration-missing'
  fields: string[]
}

const readString = (value: unknown): string => String(value ?? '').trim()

const readPositiveInteger = (value: unknown): number | null => {
  const parsed = Number(readString(value))
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

const readNonNegativeInteger = (value: unknown): number | null => {
  const text = readString(value)
  if (!text) return null
  const parsed = Number(text)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

export const resolveTravelAgencyGuardrailConfig = (env: TravelAgencyEnv): TravelAgencyGuardrailConfig | TravelAgencyConfigError => {
  const retryBound = readNonNegativeInteger(env.TRAVEL_GUARDRAIL_RETRY_BOUND)
  const minBudgetMinor = readNonNegativeInteger(env.TRAVEL_INTENT_MIN_BUDGET_MINOR)
  const maxBudgetMinor = readNonNegativeInteger(env.TRAVEL_INTENT_MAX_BUDGET_MINOR)
  const fields: string[] = []
  if (retryBound == null) fields.push('TRAVEL_GUARDRAIL_RETRY_BOUND')
  if (minBudgetMinor == null) fields.push('TRAVEL_INTENT_MIN_BUDGET_MINOR')
  if (maxBudgetMinor == null) fields.push('TRAVEL_INTENT_MAX_BUDGET_MINOR')
  if (minBudgetMinor != null && maxBudgetMinor != null && minBudgetMinor > maxBudgetMinor) {
    fields.push('TRAVEL_INTENT_MAX_BUDGET_MINOR')
  }
  if (fields.length > 0) return { code: 'configuration-missing', fields }
  return { retryBound: retryBound!, minBudgetMinor: minBudgetMinor!, maxBudgetMinor: maxBudgetMinor! }
}

export const resolveTravelAgencyIssuanceConfig = (env: TravelAgencyEnv): TravelAgencyIssuanceConfig | TravelAgencyConfigError => {
  const mcpServerKey = readString(env.TRAVEL_ISSUANCE_MCP_SERVER_KEY)
  const transport = readString(env.TRAVEL_ISSUANCE_MCP_TRANSPORT)
  const toolName = readString(env.TRAVEL_ISSUANCE_MCP_TOOL_NAME)
  const responseDeadlineMs = readPositiveInteger(env.TRAVEL_ISSUANCE_RESPONSE_DEADLINE_MS)
  const perCardCapMinor = readPositiveInteger(env.TRAVEL_ISSUANCE_PER_CARD_CAP_MINOR)
  const currency = readString(env.TRAVEL_ISSUANCE_CURRENCY).toUpperCase()
  const fields: string[] = []
  if (!mcpServerKey) fields.push('TRAVEL_ISSUANCE_MCP_SERVER_KEY')
  if (transport !== 'sse') fields.push('TRAVEL_ISSUANCE_MCP_TRANSPORT')
  if (!toolName) fields.push('TRAVEL_ISSUANCE_MCP_TOOL_NAME')
  if (responseDeadlineMs == null) fields.push('TRAVEL_ISSUANCE_RESPONSE_DEADLINE_MS')
  if (perCardCapMinor == null) fields.push('TRAVEL_ISSUANCE_PER_CARD_CAP_MINOR')
  if (!currency) fields.push('TRAVEL_ISSUANCE_CURRENCY')
  if (fields.length > 0) return { code: 'configuration-missing', fields }
  return {
    mcpServerKey,
    transport: 'sse',
    toolName,
    responseDeadlineMs: responseDeadlineMs!,
    perCardCapMinor: perCardCapMinor!,
    currency,
  }
}

export const resolveTravelAgencyIntentConfig = (env: TravelAgencyEnv): TravelAgencyIntentConfig | TravelAgencyConfigError => {
  const openaiApiKey = readString(env.OPENAI_API_KEY)
  const openaiResponsesUrl = readString(env.TRAVEL_INTENT_OPENAI_RESPONSES_URL)
  const openaiModel = readString(env.TRAVEL_INTENT_OPENAI_MODEL)
  const maxInputChars = readPositiveInteger(env.TRAVEL_INTENT_MAX_INPUT_CHARS)
  const maxDateSpanDays = readPositiveInteger(env.TRAVEL_INTENT_MAX_DATE_SPAN_DAYS)
  const minBudgetMinor = readNonNegativeInteger(env.TRAVEL_INTENT_MIN_BUDGET_MINOR)
  const maxBudgetMinor = readNonNegativeInteger(env.TRAVEL_INTENT_MAX_BUDGET_MINOR)

  const fields: string[] = []
  if (!openaiApiKey) fields.push('OPENAI_API_KEY')
  if (!openaiResponsesUrl) fields.push('TRAVEL_INTENT_OPENAI_RESPONSES_URL')
  if (!openaiModel) fields.push('TRAVEL_INTENT_OPENAI_MODEL')
  if (maxInputChars == null) fields.push('TRAVEL_INTENT_MAX_INPUT_CHARS')
  if (maxDateSpanDays == null) fields.push('TRAVEL_INTENT_MAX_DATE_SPAN_DAYS')
  if (minBudgetMinor == null) fields.push('TRAVEL_INTENT_MIN_BUDGET_MINOR')
  if (maxBudgetMinor == null) fields.push('TRAVEL_INTENT_MAX_BUDGET_MINOR')
  if (minBudgetMinor != null && maxBudgetMinor != null && minBudgetMinor > maxBudgetMinor) {
    fields.push('TRAVEL_INTENT_MAX_BUDGET_MINOR')
  }
  if (fields.length > 0) return { code: 'configuration-missing', fields }

  return {
    openaiApiKey,
    openaiResponsesUrl,
    openaiModel,
    maxInputChars: maxInputChars!,
    maxDateSpanDays: maxDateSpanDays!,
    minBudgetMinor: minBudgetMinor!,
    maxBudgetMinor: maxBudgetMinor!,
  }
}
