import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'
import {
  EXA_MCP_ACTIVE_TOOL_NAMES,
  EXA_MCP_ACTIVE_TOOLS_JSON,
  EXA_MCP_API_KEY_HEADER,
  EXA_MCP_CONNECTION_MODES,
  EXA_MCP_DASHBOARD_URL,
  EXA_MCP_DEFAULT_CONNECTION_MODE,
  EXA_MCP_DEFAULT_ENABLED_TOOLS_JSON,
  EXA_MCP_DEFAULT_FETCH_CONTENT_LIMIT,
  EXA_MCP_DEFAULT_MAX_RESULTS,
  EXA_MCP_DEFAULT_REQUIRE_FETCH_REVIEW,
  EXA_MCP_DEFAULT_SERVER_KEY,
  EXA_MCP_DEFAULT_STARTUP_TIMEOUT_MS,
  EXA_MCP_DEFAULT_TOOL_NAMES,
  EXA_MCP_DEFAULT_TOOL_PROFILE,
  EXA_MCP_DOC_AREA,
  EXA_MCP_DOCS_MARKDOWN_URL,
  EXA_MCP_DOCS_URL,
  EXA_MCP_GITHUB_URL,
  EXA_MCP_LOCAL_API_KEY_ENV,
  EXA_MCP_REMOTE_URL,
  EXA_MCP_TOOL_PROFILES,
  normalizeExaMcpToolNames,
} from 'grph-shared/search/exaMcpSsot'
import {
  EXA_SEARCH_API_CODING_AGENT_REQUEST_JSON,
  EXA_SEARCH_API_DEFAULT_SEARCH_TYPE,
  EXA_SEARCH_API_DOCS_URL,
  EXA_SEARCH_API_ENDPOINT,
  EXA_SEARCH_API_INVOCATION_TEXT,
  EXA_SEARCH_API_RESPONSE_FIELDS,
} from 'grph-shared/search/exaSearchApiSsot'

export { EXA_MCP_DOC_AREA, EXA_MCP_DOCS_URL }

type ExaMcpDocRow = {
  key: string
  typeLabel: string
  valueKey?: string
  value?: string | number | boolean
  responsibility: string
  notes?: string
  searchHints?: string[]
  tooltipDefaultValue?: string | number | boolean | null
}

const EXA_MCP_TOOLTIP_ROLE = 'Exa MCP'
export const EXA_MCP_CODEX_CONFIG_KEY = 'exaMcp.remote_config.codex'
export const EXA_MCP_REMOTE_CONFIG_KEY = 'exaMcp.remote_config.generic'

const EXA_MCP_KEY_PREFIX = 'search.exa.mcp.'

const readStringValue = (values: Record<string, unknown>, key: string, fallback: string): string => {
  const value = values[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

const readJsonArrayValue = (values: Record<string, unknown>, key: string, fallback: readonly string[]): string[] => {
  const value = values[key]
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) return [...value]
  if (typeof value !== 'string') return [...fallback]
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) && parsed.every(item => typeof item === 'string') ? parsed : [...fallback]
  } catch {
    return [...fallback]
  }
}

const stripToolsQueryParam = (url: string): string => {
  try {
    const parsed = new URL(url)
    parsed.searchParams.delete('tools')
    const next = parsed.toString()
    return next.endsWith('?') ? next.slice(0, -1) : next
  } catch {
    return url.replace(/[?&]tools=[^&]*/g, '').replace(/[?&]$/, '')
  }
}

export function resolveExaMcpEnabledTools(values: Record<string, unknown>): string[] {
  const toolProfile = readStringValue(values, `${EXA_MCP_KEY_PREFIX}toolProfile`, EXA_MCP_DEFAULT_TOOL_PROFILE)
  if (toolProfile === 'advanced') return [...EXA_MCP_ACTIVE_TOOL_NAMES]
  const enabledTools = readJsonArrayValue(values, `${EXA_MCP_KEY_PREFIX}enabledTools`, EXA_MCP_DEFAULT_TOOL_NAMES)
  return normalizeExaMcpToolNames(enabledTools)
}

export function buildExaMcpRemoteUrlFromValues(values: Record<string, unknown>): string {
  const remoteUrl = readStringValue(values, `${EXA_MCP_KEY_PREFIX}remoteUrl`, EXA_MCP_REMOTE_URL)
  const enabledTools = resolveExaMcpEnabledTools(values)
  const isDefaultProfile =
    enabledTools.length === EXA_MCP_DEFAULT_TOOL_NAMES.length
    && enabledTools.every((tool, index) => tool === EXA_MCP_DEFAULT_TOOL_NAMES[index])
  const baseUrl = stripToolsQueryParam(remoteUrl)
  if (isDefaultProfile) return baseUrl
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}tools=${enabledTools.join(',')}`
}

export function buildExaCodexMcpAddCommand(values: Record<string, unknown>): string {
  const serverKey = readStringValue(values, `${EXA_MCP_KEY_PREFIX}serverKey`, EXA_MCP_DEFAULT_SERVER_KEY)
  const url = buildExaMcpRemoteUrlFromValues(values)
  return `codex mcp add ${serverKey} --url '${url}'`
}

export function buildExaRemoteMcpConfigJson(values: Record<string, unknown>): string {
  const serverKey = readStringValue(values, `${EXA_MCP_KEY_PREFIX}serverKey`, EXA_MCP_DEFAULT_SERVER_KEY)
  const url = buildExaMcpRemoteUrlFromValues(values)
  return JSON.stringify({
    mcpServers: {
      [serverKey]: {
        url,
      },
    },
  }, null, 2)
}

const EXA_MCP_DOC_ROWS: ReadonlyArray<ExaMcpDocRow> = [
  {
    key: 'server_key',
    typeLabel: 'string',
    valueKey: `${EXA_MCP_KEY_PREFIX}serverKey`,
    responsibility: 'MCP server key inside the mcpServers object for Exa.',
    tooltipDefaultValue: EXA_MCP_DEFAULT_SERVER_KEY,
    searchHints: ['mcpServers', EXA_MCP_DEFAULT_SERVER_KEY],
  },
  {
    key: 'remote.url',
    typeLabel: 'url',
    valueKey: `${EXA_MCP_KEY_PREFIX}remoteUrl`,
    responsibility: 'Hosted Exa MCP Streamable HTTP URL.',
    tooltipDefaultValue: EXA_MCP_REMOTE_URL,
    searchHints: ['remote mcp', EXA_MCP_REMOTE_URL, 'streamable http'],
  },
  {
    key: 'tool_profile',
    typeLabel: 'enum',
    valueKey: `${EXA_MCP_KEY_PREFIX}toolProfile`,
    responsibility: 'Tool profile used to derive the enabled Exa MCP tools.',
    notes: 'Default profile uses web search and page fetch; advanced adds advanced search through the tools query parameter.',
    tooltipDefaultValue: EXA_MCP_DEFAULT_TOOL_PROFILE,
    searchHints: ['tool profile', ...EXA_MCP_TOOL_PROFILES],
  },
  {
    key: 'enabled_tools',
    typeLabel: 'string[]',
    valueKey: `${EXA_MCP_KEY_PREFIX}enabledTools`,
    responsibility: 'Explicit Exa MCP tools enabled for the default profile.',
    notes: 'Only tools from the shared active Exa MCP tool list are emitted in generated URLs or config JSON.',
    tooltipDefaultValue: EXA_MCP_DEFAULT_ENABLED_TOOLS_JSON,
    searchHints: [...EXA_MCP_DEFAULT_TOOL_NAMES, EXA_MCP_ACTIVE_TOOLS_JSON],
  },
  {
    key: 'connection.mode',
    typeLabel: 'enum',
    valueKey: `${EXA_MCP_KEY_PREFIX}connectionMode`,
    responsibility: 'Host-owned connection mode label for free hosted MCP, API-key header injection, or local env usage.',
    notes: `Current Exa docs describe optional ${EXA_MCP_API_KEY_HEADER} or local ${EXA_MCP_LOCAL_API_KEY_ENV} for rate-limit or production usage; browser settings must not store the key value.`,
    tooltipDefaultValue: EXA_MCP_DEFAULT_CONNECTION_MODE,
    searchHints: [...EXA_MCP_CONNECTION_MODES, EXA_MCP_API_KEY_HEADER, EXA_MCP_LOCAL_API_KEY_ENV],
  },
  {
    key: 'startup_timeout_ms',
    typeLabel: 'integer',
    valueKey: `${EXA_MCP_KEY_PREFIX}startupTimeoutMs`,
    responsibility: 'MCP connection or local process startup timeout in milliseconds.',
    tooltipDefaultValue: EXA_MCP_DEFAULT_STARTUP_TIMEOUT_MS,
    searchHints: ['startup timeout', 'startup_timeout_ms'],
  },
  {
    key: 'max_results',
    typeLabel: 'integer',
    valueKey: `${EXA_MCP_KEY_PREFIX}maxResults`,
    responsibility: 'Default cap for Exa search results before chat summarizes the evidence pack.',
    tooltipDefaultValue: EXA_MCP_DEFAULT_MAX_RESULTS,
    searchHints: ['numResults', 'result limit', 'evidence pack'],
  },
  {
    key: 'search_api.endpoint',
    typeLabel: 'endpoint',
    value: `POST ${EXA_SEARCH_API_ENDPOINT}`,
    responsibility: 'Source-owned Search API endpoint behind Exa MCP coding-agent search guidance.',
    notes: 'This row is a contract projection only; the browser does not call Exa or store bearer credentials.',
    searchHints: ['coding agent search api', EXA_SEARCH_API_ENDPOINT],
  },
  {
    key: 'search_api.default_request',
    typeLabel: 'object',
    value: EXA_SEARCH_API_CODING_AGENT_REQUEST_JSON,
    responsibility: 'Shared coding-agent request preview with auto search, bounded results, and highlight content.',
    searchHints: ['contents highlights', EXA_SEARCH_API_DEFAULT_SEARCH_TYPE, 'numResults'],
  },
  {
    key: 'search_api.response_contract',
    typeLabel: 'string[]',
    value: JSON.stringify(EXA_SEARCH_API_RESPONSE_FIELDS),
    responsibility: 'Preserve request identity, evidence, structured output, and upstream cost reporting across MCP handoff.',
    searchHints: ['requestId', 'searchType', 'costDollars.total', 'grounded output'],
  },
  {
    key: 'search_api.invocation',
    typeLabel: '/ # @',
    value: EXA_SEARCH_API_INVOCATION_TEXT,
    responsibility: 'Project the canonical Agentic Canvas OS tool-routing invocation without provider-specific aliases.',
    searchHints: ['/tool.catalog', '#tool-routing', '@tool-provider'],
  },
  {
    key: 'search_api.docs_url',
    typeLabel: 'url',
    value: EXA_SEARCH_API_DOCS_URL,
    responsibility: 'Canonical Exa Search API guide for coding agents used by the shared request contract.',
    searchHints: ['Exa Search API coding agent guide', EXA_SEARCH_API_DOCS_URL],
  },
  {
    key: 'fetch_content_limit',
    typeLabel: 'integer',
    valueKey: `${EXA_MCP_KEY_PREFIX}fetchContentLimit`,
    responsibility: 'Default page-content character cap before fetched markdown is summarized for AGENTIC_OS generation.',
    tooltipDefaultValue: EXA_MCP_DEFAULT_FETCH_CONTENT_LIMIT,
    searchHints: ['web_fetch_exa', 'content limit', 'token budget'],
  },
  {
    key: 'require_fetch_review',
    typeLabel: 'boolean',
    valueKey: `${EXA_MCP_KEY_PREFIX}requireFetchReview`,
    responsibility: 'Require review and validation before fetched web content can be converted into workspace Markdown or Canvas graph state.',
    tooltipDefaultValue: EXA_MCP_DEFAULT_REQUIRE_FETCH_REVIEW,
    searchHints: ['untrusted content', 'AGENTIC_OS validation', 'no direct graph mutation'],
  },
  {
    key: 'tool.web_search',
    typeLabel: 'tool',
    value: 'web_search_exa',
    responsibility: 'Default Exa web search tool for current web evidence.',
    notes: 'Enabled by default in the hosted Exa MCP server.',
    searchHints: ['web_search_exa', 'search the web'],
  },
  {
    key: 'tool.web_fetch',
    typeLabel: 'tool',
    value: 'web_fetch_exa',
    responsibility: 'Default Exa page fetch tool for reading known URLs as clean markdown.',
    notes: 'Enabled by default in the hosted Exa MCP server.',
    searchHints: ['web_fetch_exa', 'read a page', 'markdown'],
  },
  {
    key: 'tool.web_search_advanced',
    typeLabel: 'tool',
    value: 'web_search_advanced_exa',
    responsibility: 'Optional advanced Exa search tool for category filters, domain restrictions, date ranges, summaries, and subpage crawling.',
    notes: 'Enabled only through the advanced profile or explicit sanitized enabled tools.',
    searchHints: ['web_search_advanced_exa', 'advanced search', 'domain filters', 'date ranges'],
  },
  {
    key: 'remote_config.codex',
    typeLabel: 'command',
    value: buildExaCodexMcpAddCommand({}),
    responsibility: 'Codex-ready MCP add command for the hosted Exa MCP server without browser-stored secrets.',
    notes: 'API-key production usage must be configured by the MCP host or local environment, not by MainPanel browser state.',
    searchHints: ['codex mcp add', 'remote config', EXA_MCP_DOCS_URL],
  },
  {
    key: 'remote_config.generic',
    typeLabel: 'object',
    value: buildExaRemoteMcpConfigJson({}),
    responsibility: 'Generic mcpServers JSON for remote Exa MCP clients without API-key material.',
    notes: 'The generated JSON intentionally omits headers and env values so operators do not paste secrets into browser-owned settings.',
    searchHints: ['mcpServers', 'remote config', EXA_MCP_REMOTE_URL],
  },
  {
    key: 'auth_boundary',
    typeLabel: 'security note',
    value: `${EXA_MCP_API_KEY_HEADER} and ${EXA_MCP_LOCAL_API_KEY_ENV} are host-owned names only`,
    responsibility: 'Auth and rate-limit boundary for Exa free-plan, production header injection, or local npm usage.',
    notes: 'MainPanel may name the header/env var for operators, but it must not store or render an actual Exa API key value.',
    searchHints: ['free plan', EXA_MCP_API_KEY_HEADER, EXA_MCP_LOCAL_API_KEY_ENV, 'rate limit'],
  },
  {
    key: 'docs.url',
    typeLabel: 'url',
    value: EXA_MCP_DOCS_URL,
    responsibility: 'Canonical Exa MCP reference docs.',
    searchHints: ['Exa MCP docs', EXA_MCP_DOCS_URL],
  },
  {
    key: 'docs.markdown_url',
    typeLabel: 'url',
    value: EXA_MCP_DOCS_MARKDOWN_URL,
    responsibility: 'Canonical Exa MCP markdown reference for implementation verification.',
    searchHints: ['Exa MCP markdown docs', EXA_MCP_DOCS_MARKDOWN_URL],
  },
  {
    key: 'github.url',
    typeLabel: 'url',
    value: EXA_MCP_GITHUB_URL,
    responsibility: 'Open-source Exa MCP server source reference.',
    searchHints: ['exa-labs/exa-mcp-server', EXA_MCP_GITHUB_URL],
  },
  {
    key: 'dashboard.url',
    typeLabel: 'url',
    value: EXA_MCP_DASHBOARD_URL,
    responsibility: 'Exa account and API-key dashboard for host-owned production configuration.',
    notes: 'Dashboard credentials and API keys stay outside MainPanel browser state.',
    searchHints: ['dashboard', 'api keys', EXA_MCP_DASHBOARD_URL],
  },
  {
    key: 'troubleshooting.restart',
    typeLabel: 'guidance',
    value: 'restart_mcp_client_after_config_change',
    responsibility: 'Troubleshooting guidance when Exa MCP tools do not appear after config changes.',
    notes: 'Some MCP clients require a full restart or fresh agent session after adding or changing MCP servers.',
    searchHints: ['tools not appearing', 'restart MCP client', 'fresh session'],
  },
]

const toBaseType = (typeLabel: string): SettingMeta['type'] => {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('float') || normalized.includes('number')) return 'number'
  if (normalized.includes('object') || normalized.includes('[]') || normalized.includes('map')) return 'json'
  return 'string'
}

export function getExaMcpApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('mcp-row-exa', rowKey)
}

export const EXA_MCP_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  EXA_MCP_DOC_ROWS.map(row => {
    const details: FlowDetails = {
      area: EXA_MCP_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: ['Exa MCP'],
      classes: ['Configuration'],
      functions: [],
      imports: [],
    }
    return {
      meta: {
        key: `exaMcp.${row.key}`,
        type: toBaseType(row.typeLabel),
        source: row.valueKey ? 'localStorage' : 'backendEnv',
        read: () => row.value ?? 'Exa MCP setting',
      },
      value: row.value ?? 'Exa MCP setting',
      valueKey: row.valueKey,
      typeLabel: row.typeLabel,
      tooltipRole: EXA_MCP_TOOLTIP_ROLE,
      tooltipDefaultValue: row.tooltipDefaultValue,
      searchHints: ['exa mcp configuration', 'web search mcp', row.key, ...(row.searchHints || [])],
      details,
    }
  })
