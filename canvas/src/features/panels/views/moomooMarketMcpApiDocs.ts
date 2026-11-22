import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'
import {
  MOOMOO_MARKET_MCP_ACTIVE_TOOLS_JSON,
  MOOMOO_MARKET_MCP_AUTH_HEADER,
  MOOMOO_MARKET_MCP_CONNECTION_MODES,
  MOOMOO_MARKET_MCP_DEFAULT_AUTH_BOUNDARY,
  MOOMOO_MARKET_MCP_DEFAULT_CONNECTION_MODE,
  MOOMOO_MARKET_MCP_DEFAULT_ENABLED_TOOLS_JSON,
  MOOMOO_MARKET_MCP_DEFAULT_MAX_ROWS,
  MOOMOO_MARKET_MCP_DEFAULT_REQUIRE_TOOL_REVIEW,
  MOOMOO_MARKET_MCP_DEFAULT_SERVER_KEY,
  MOOMOO_MARKET_MCP_DEFAULT_STARTUP_TIMEOUT_MS,
  MOOMOO_MARKET_MCP_DEFAULT_TOOL_PROFILE,
  MOOMOO_MARKET_MCP_CONNECTED_STATUS,
  MOOMOO_MARKET_MCP_DOC_AREA,
  MOOMOO_MARKET_MCP_MARKET_TOOL_NAMES,
  MOOMOO_MARKET_MCP_OPENAPI_URL,
  MOOMOO_MARKET_MCP_READ_ONLY_BOUNDARY,
  MOOMOO_MARKET_MCP_REMOTE_URL,
  MOOMOO_MARKET_MCP_TOOL_PROFILES,
  MOOMOO_MARKET_MCP_WRITE_TOOLS_JSON,
  normalizeMoomooMarketMcpToolNames,
  resolveMoomooMarketMcpProfileTools,
} from 'grph-shared/search/moomooMarketMcpSsot'

export { MOOMOO_MARKET_MCP_DOC_AREA, MOOMOO_MARKET_MCP_REMOTE_URL }

type MoomooMarketMcpDocRow = {
  key: string
  typeLabel: string
  valueKey?: string
  value?: string | number | boolean
  responsibility: string
  notes?: string
  searchHints?: string[]
  tooltipDefaultValue?: string | number | boolean | null
}

const MOOMOO_MARKET_MCP_TOOLTIP_ROLE = 'Moomoo Market MCP'
export const MOOMOO_MARKET_MCP_CODEX_CONFIG_KEY = 'moomooMarketMcp.remote_config.codex'
export const MOOMOO_MARKET_MCP_REMOTE_CONFIG_KEY = 'moomooMarketMcp.remote_config.generic'

const MOOMOO_MARKET_MCP_KEY_PREFIX = 'search.moomooMarket.mcp.'

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

export function resolveMoomooMarketMcpEnabledTools(values: Record<string, unknown>): string[] {
  const toolProfile = readStringValue(values, `${MOOMOO_MARKET_MCP_KEY_PREFIX}toolProfile`, MOOMOO_MARKET_MCP_DEFAULT_TOOL_PROFILE)
  if (toolProfile !== MOOMOO_MARKET_MCP_DEFAULT_TOOL_PROFILE) return resolveMoomooMarketMcpProfileTools(toolProfile)
  const enabledTools = readJsonArrayValue(values, `${MOOMOO_MARKET_MCP_KEY_PREFIX}enabledTools`, MOOMOO_MARKET_MCP_MARKET_TOOL_NAMES)
  return normalizeMoomooMarketMcpToolNames(enabledTools)
}

// The hosted endpoint is a fixed origin; profiles are host-side admission allowlists,
// so the generated remote URL never appends an unverified tools query parameter.
export function buildMoomooMarketMcpRemoteUrlFromValues(values: Record<string, unknown>): string {
  return readStringValue(values, `${MOOMOO_MARKET_MCP_KEY_PREFIX}remoteUrl`, MOOMOO_MARKET_MCP_REMOTE_URL)
}

export function buildMoomooMarketCodexMcpAddCommand(values: Record<string, unknown>): string {
  const serverKey = readStringValue(values, `${MOOMOO_MARKET_MCP_KEY_PREFIX}serverKey`, MOOMOO_MARKET_MCP_DEFAULT_SERVER_KEY)
  const url = buildMoomooMarketMcpRemoteUrlFromValues(values)
  return `codex mcp add ${serverKey} --url '${url}'`
}

export function buildMoomooMarketRemoteMcpConfigJson(values: Record<string, unknown>): string {
  const serverKey = readStringValue(values, `${MOOMOO_MARKET_MCP_KEY_PREFIX}serverKey`, MOOMOO_MARKET_MCP_DEFAULT_SERVER_KEY)
  const url = buildMoomooMarketMcpRemoteUrlFromValues(values)
  return JSON.stringify({
    mcpServers: {
      [serverKey]: {
        url,
      },
    },
  }, null, 2)
}

const MOOMOO_MARKET_MCP_DOC_ROWS: ReadonlyArray<MoomooMarketMcpDocRow> = [
  {
    key: 'server_key',
    typeLabel: 'string',
    valueKey: `${MOOMOO_MARKET_MCP_KEY_PREFIX}serverKey`,
    responsibility: 'MCP server key inside the mcpServers object for the Moomoo market-data connector.',
    tooltipDefaultValue: MOOMOO_MARKET_MCP_DEFAULT_SERVER_KEY,
    searchHints: ['mcpServers', MOOMOO_MARKET_MCP_DEFAULT_SERVER_KEY],
  },
  {
    key: 'remote.url',
    typeLabel: 'url',
    valueKey: `${MOOMOO_MARKET_MCP_KEY_PREFIX}remoteUrl`,
    responsibility: 'Hosted Moomoo OpenAPI MCP Streamable HTTP origin.',
    tooltipDefaultValue: MOOMOO_MARKET_MCP_REMOTE_URL,
    searchHints: ['remote mcp', MOOMOO_MARKET_MCP_REMOTE_URL, 'streamable http'],
  },
  {
    key: 'tool_profile',
    typeLabel: 'enum',
    valueKey: `${MOOMOO_MARKET_MCP_KEY_PREFIX}toolProfile`,
    responsibility: 'Read-only tool profile used to derive the host-side admitted Moomoo MCP tool allowlist.',
    notes: 'market covers quotes/kline/depth/tape/plate/capital/news; research adds fundamentals and holders; derivatives adds options/futures/warrants; account adds read-only account, paper and crypto observations. Each profile stays within the 50-tool external-profile cap.',
    tooltipDefaultValue: MOOMOO_MARKET_MCP_DEFAULT_TOOL_PROFILE,
    searchHints: ['tool profile', ...MOOMOO_MARKET_MCP_TOOL_PROFILES],
  },
  {
    key: 'enabled_tools',
    typeLabel: 'string[]',
    valueKey: `${MOOMOO_MARKET_MCP_KEY_PREFIX}enabledTools`,
    responsibility: 'Explicit read-only Moomoo MCP tools enabled for the default market profile.',
    notes: 'Only tools from the shared read-only active list are admitted; order placement, replacement, cancellation and watchlist mutation tools are always excluded.',
    tooltipDefaultValue: MOOMOO_MARKET_MCP_DEFAULT_ENABLED_TOOLS_JSON,
    searchHints: [...MOOMOO_MARKET_MCP_MARKET_TOOL_NAMES, MOOMOO_MARKET_MCP_ACTIVE_TOOLS_JSON],
  },
  {
    key: 'connection.mode',
    typeLabel: 'enum',
    valueKey: `${MOOMOO_MARKET_MCP_KEY_PREFIX}connectionMode`,
    responsibility: 'Host-owned connection mode label for OAuth bearer injection or local environment usage.',
    notes: `The MCP host attaches the ${MOOMOO_MARKET_MCP_AUTH_HEADER} bearer token; browser settings must not store the token value.`,
    tooltipDefaultValue: MOOMOO_MARKET_MCP_DEFAULT_CONNECTION_MODE,
    searchHints: [...MOOMOO_MARKET_MCP_CONNECTION_MODES, MOOMOO_MARKET_MCP_AUTH_HEADER],
  },
  {
    key: 'startup_timeout_ms',
    typeLabel: 'integer',
    valueKey: `${MOOMOO_MARKET_MCP_KEY_PREFIX}startupTimeoutMs`,
    responsibility: 'MCP connection or local process startup timeout in milliseconds.',
    tooltipDefaultValue: MOOMOO_MARKET_MCP_DEFAULT_STARTUP_TIMEOUT_MS,
    searchHints: ['startup timeout', 'startup_timeout_ms'],
  },
  {
    key: 'max_rows',
    typeLabel: 'integer',
    valueKey: `${MOOMOO_MARKET_MCP_KEY_PREFIX}maxRows`,
    responsibility: 'Default bounded row cap for a single market-data observation before chat summarizes the evidence pack.',
    tooltipDefaultValue: MOOMOO_MARKET_MCP_DEFAULT_MAX_ROWS,
    searchHints: ['row limit', 'bounded result', 'evidence pack'],
  },
  {
    key: 'require_tool_review',
    typeLabel: 'boolean',
    valueKey: `${MOOMOO_MARKET_MCP_KEY_PREFIX}requireToolReview`,
    responsibility: 'Require review and validation before fetched market data can be converted into workspace Markdown or Canvas graph state.',
    tooltipDefaultValue: MOOMOO_MARKET_MCP_DEFAULT_REQUIRE_TOOL_REVIEW,
    searchHints: ['untrusted content', 'AGENTIC_OS validation', 'no direct graph mutation'],
  },
  {
    key: 'auth_boundary',
    typeLabel: 'string',
    valueKey: `${MOOMOO_MARKET_MCP_KEY_PREFIX}authBoundary`,
    responsibility: 'Auth boundary for the host-owned Moomoo OAuth bearer credential.',
    notes: 'MainPanel may name the Authorization header for operators, but it must not store or render an actual token value.',
    tooltipDefaultValue: MOOMOO_MARKET_MCP_DEFAULT_AUTH_BOUNDARY,
    searchHints: ['oauth', MOOMOO_MARKET_MCP_AUTH_HEADER, 'bearer', 'host-owned'],
  },
  {
    key: 'connected_status',
    typeLabel: 'string',
    valueKey: `${MOOMOO_MARKET_MCP_KEY_PREFIX}connectedStatus`,
    responsibility: 'Qualification status of the connected Moomoo market-data path.',
    notes: 'Local configuration guidance only; connected OAuth/Vault, rights, zero-cost and account-alias receipts remain separate operator actions.',
    tooltipDefaultValue: MOOMOO_MARKET_MCP_CONNECTED_STATUS,
    searchHints: ['UNQUALIFIED', 'connected status', 'rights', 'zero-cost'],
  },
  {
    key: 'read_only_boundary',
    typeLabel: 'security note',
    value: MOOMOO_MARKET_MCP_READ_ONLY_BOUNDARY,
    responsibility: 'Read-only effect boundary separating market observations from order dispatch.',
    searchHints: ['read-only', 'paper account', 'live orders', 'zero-cost'],
  },
  {
    key: 'write_tools_excluded',
    typeLabel: 'string[]',
    value: MOOMOO_MARKET_MCP_WRITE_TOOLS_JSON,
    responsibility: 'Mutation tools excluded from every read-only profile and from generated allowlists.',
    notes: 'These tools place, replace, cancel or confirm orders or mutate watchlists; they are never admitted by this integration.',
    searchHints: ['trading_order_place', 'sim_trade_input_order', 'crypto_account_create_order', 'exclude write'],
  },
  {
    key: 'openapi.url',
    typeLabel: 'url',
    value: MOOMOO_MARKET_MCP_OPENAPI_URL,
    responsibility: 'Canonical Moomoo OpenAPI program reference for host-owned rights and credential setup.',
    searchHints: ['Moomoo OpenAPI', MOOMOO_MARKET_MCP_OPENAPI_URL],
  },
  {
    key: 'tool.quote_stock_quote',
    typeLabel: 'tool',
    value: 'quote_stock_quote',
    responsibility: 'Default market snapshot quote tool for last price and change.',
    notes: 'Read-only; enabled in the market profile.',
    searchHints: ['quote_stock_quote', 'ticker', 'last price'],
  },
  {
    key: 'tool.quote_cur_kline',
    typeLabel: 'tool',
    value: 'quote_cur_kline',
    responsibility: 'Default candlestick tool for completed and forming bars.',
    notes: 'Read-only; enabled in the market profile.',
    searchHints: ['quote_cur_kline', 'candles', 'kline'],
  },
  {
    key: 'tool.quote_order_book',
    typeLabel: 'tool',
    value: 'quote_order_book',
    responsibility: 'Default order-book tool for bid/ask depth and imbalance.',
    notes: 'Read-only; enabled in the market profile.',
    searchHints: ['quote_order_book', 'depth', 'order book'],
  },
  {
    key: 'tool.quote_rt_ticker',
    typeLabel: 'tool',
    value: 'quote_rt_ticker',
    responsibility: 'Default trade-tape tool for timestamped prints and aggressor interpretation.',
    notes: 'Read-only; enabled in the market profile.',
    searchHints: ['quote_rt_ticker', 'tape', 'trades'],
  },
  {
    key: 'remote_config.codex',
    typeLabel: 'command',
    value: buildMoomooMarketCodexMcpAddCommand({}),
    responsibility: 'Codex-ready MCP add command for the hosted Moomoo market-data server without browser-stored secrets.',
    notes: 'OAuth production usage must be configured by the MCP host or local environment, not by MainPanel browser state.',
    searchHints: ['codex mcp add', 'remote config', MOOMOO_MARKET_MCP_REMOTE_URL],
  },
  {
    key: 'remote_config.generic',
    typeLabel: 'object',
    value: buildMoomooMarketRemoteMcpConfigJson({}),
    responsibility: 'Generic mcpServers JSON for remote Moomoo MCP clients without credential material.',
    notes: 'The generated JSON intentionally omits headers and env values so operators do not paste secrets into browser-owned settings.',
    searchHints: ['mcpServers', 'remote config', MOOMOO_MARKET_MCP_REMOTE_URL],
  },
  {
    key: 'troubleshooting.restart',
    typeLabel: 'guidance',
    value: 'restart_mcp_client_after_config_change',
    responsibility: 'Troubleshooting guidance when Moomoo MCP tools do not appear after config changes.',
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

export function getMoomooMarketMcpApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('mcp-row-moomoo-market', rowKey)
}

export const MOOMOO_MARKET_MCP_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  MOOMOO_MARKET_MCP_DOC_ROWS.map(row => {
    const details: FlowDetails = {
      area: MOOMOO_MARKET_MCP_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: ['Moomoo Market MCP'],
      classes: ['Configuration'],
      functions: [],
      imports: [],
    }
    return {
      meta: {
        key: `moomooMarketMcp.${row.key}`,
        type: toBaseType(row.typeLabel),
        source: row.valueKey ? 'localStorage' : 'backendEnv',
        read: () => row.value ?? 'Moomoo Market MCP setting',
      },
      value: row.value ?? 'Moomoo Market MCP setting',
      valueKey: row.valueKey,
      typeLabel: row.typeLabel,
      tooltipRole: MOOMOO_MARKET_MCP_TOOLTIP_ROLE,
      tooltipDefaultValue: row.tooltipDefaultValue,
      searchHints: ['moomoo market mcp configuration', 'market data mcp', row.key, ...(row.searchHints || [])],
      details,
    }
  })