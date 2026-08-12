export const EXA_SEARCH_API_DOC_AREA = 'Exa Search API for Coding Agents'

export const EXA_SEARCH_API_DOCS_URL = 'https://exa.ai/docs/reference/search-api-guide-for-coding-agents'

export const EXA_SEARCH_API_DOCS_MARKDOWN_URL = `${EXA_SEARCH_API_DOCS_URL}.md`

export const EXA_SEARCH_API_ENDPOINT = 'https://api.exa.ai/search'

export const EXA_SEARCH_API_KEY_ENV = 'EXA_API_KEY'

export const EXA_SEARCH_API_AUTH_HEADER = 'Authorization'

export const EXA_SEARCH_API_AUTH_SCHEME = 'Bearer'

export const EXA_SEARCH_API_SEARCH_TYPES = [
  'auto',
  'fast',
  'instant',
  'deep-lite',
  'deep',
  'deep-reasoning',
] as const

export const EXA_SEARCH_API_DEFAULT_SEARCH_TYPE = 'auto'

export const EXA_SEARCH_API_DEFAULT_NUM_RESULTS = 10

export const EXA_SEARCH_API_MAX_NUM_RESULTS = 100

export const EXA_SEARCH_API_CATEGORIES = [
  'company',
  'people',
  'publication',
  'news',
  'personal site',
  'financial report',
] as const

export const EXA_SEARCH_API_CODING_AGENT_CONTENTS = Object.freeze({ highlights: true })

export const EXA_SEARCH_API_INVOCATION = Object.freeze({
  action: '/tool.catalog',
  semantic: '#tool-routing',
  binding: '@tool-provider',
})

export const EXA_SEARCH_API_RESPONSE_FIELDS = [
  'requestId',
  'searchType',
  'results',
  'output',
  'costDollars.total',
] as const

export const EXA_SEARCH_API_ERROR_STATUSES = [400, 401, 422, 429, 500] as const

export const EXA_SEARCH_API_DEPRECATED_FIELDS = [
  'useAutoprompt',
  'text (top-level)',
  'highlights (top-level)',
  'summary (top-level)',
  'numSentences',
  'highlightsPerUrl',
  'tokensNum',
  'livecrawl (string)',
] as const

export type ExaSearchApiSearchType = typeof EXA_SEARCH_API_SEARCH_TYPES[number]

export type ExaCodingAgentSearchRequest = Readonly<{
  query: string
  type: ExaSearchApiSearchType
  numResults: number
  contents: Readonly<{ highlights: true }>
}>

const ALLOWED_SEARCH_TYPES = new Set<string>(EXA_SEARCH_API_SEARCH_TYPES)

export function buildExaCodingAgentSearchRequest(input: {
  query: string
  type?: string
  numResults?: number
}): ExaCodingAgentSearchRequest {
  const query = String(input.query || '').trim()
  if (!query) throw new Error('Exa search query is required.')
  const type = ALLOWED_SEARCH_TYPES.has(String(input.type || ''))
    ? input.type as ExaSearchApiSearchType
    : EXA_SEARCH_API_DEFAULT_SEARCH_TYPE
  const requestedCount = Number.isFinite(input.numResults)
    ? Math.trunc(input.numResults as number)
    : EXA_SEARCH_API_DEFAULT_NUM_RESULTS
  const numResults = Math.min(EXA_SEARCH_API_MAX_NUM_RESULTS, Math.max(1, requestedCount))
  return {
    query,
    type,
    numResults,
    contents: EXA_SEARCH_API_CODING_AGENT_CONTENTS,
  }
}

export const EXA_SEARCH_API_CODING_AGENT_REQUEST_JSON = JSON.stringify(
  buildExaCodingAgentSearchRequest({ query: 'repository issue and implementation context' }),
  null,
  2,
)

export const EXA_SEARCH_API_INVOCATION_TEXT = Object.values(EXA_SEARCH_API_INVOCATION).join(' ')
