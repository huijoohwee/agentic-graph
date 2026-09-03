import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'
import {
  API_NATIVE_BROWSER_DEFAULT_CONFIRM_COOKIE_IMPORT,
  API_NATIVE_BROWSER_DEFAULT_CONFIRM_UNSAFE,
  API_NATIVE_BROWSER_DEFAULT_CONFIRM_THIRD_PARTY_TERMS,
  API_NATIVE_BROWSER_DEFAULT_DRY_RUN,
  API_NATIVE_BROWSER_DEFAULT_INTENT,
  API_NATIVE_BROWSER_DEFAULT_MCP_ARGS,
  API_NATIVE_BROWSER_DEFAULT_MCP_ARGS_JSON,
  API_NATIVE_BROWSER_DEFAULT_MCP_COMMAND,
  API_NATIVE_BROWSER_DEFAULT_MCP_ENV,
  API_NATIVE_BROWSER_DEFAULT_MCP_ENV_JSON,
  API_NATIVE_BROWSER_DEFAULT_MCP_SERVER_KEY,
  API_NATIVE_BROWSER_DEFAULT_MCP_STARTUP_TIMEOUT_MS,
  API_NATIVE_BROWSER_DEFAULT_RUNTIME_URL,
  API_NATIVE_BROWSER_DEFAULT_TARGET_URL,
  API_NATIVE_BROWSER_MCP_DOC_AREA,
} from 'grph-shared/browser/apiNativeBrowserMcpSsot'

export { API_NATIVE_BROWSER_MCP_DOC_AREA }

type ApiNativeBrowserMcpDocRow = {
  key: string
  typeLabel: string
  valueKey?: string
  value?: string | number | boolean
  responsibility: string
  notes?: string
  searchHints?: string[]
  tooltipDefaultValue?: string | number | boolean | null
}

const API_NATIVE_BROWSER_MCP_TOOLTIP_ROLE = 'API-native browser MCP'
export const API_NATIVE_BROWSER_MCP_AGENT_CONFIG_KEY = 'browserMcp.agent_config'
export const API_NATIVE_BROWSER_MCP_BRIDGE_CONFIG_KEY = 'browserMcp.bridge_config'

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

const readJsonObjectValue = (
  values: Record<string, unknown>,
  key: string,
  fallback: Readonly<Record<string, unknown>>,
): Record<string, string> => {
  const value = values[key]
  const parsed = (() => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value
    if (typeof value !== 'string') return fallback
    try {
      const next = JSON.parse(value) as unknown
      return next && typeof next === 'object' && !Array.isArray(next) ? next : fallback
    } catch {
      return fallback
    }
  })()
  return Object.fromEntries(
    Object.entries(parsed)
      .filter(([, item]) => typeof item === 'string')
      .map(([itemKey, itemValue]) => [itemKey, itemValue as string]),
  )
}

export function buildApiNativeBrowserMcpAgentConfigJson(values: Record<string, unknown>): string {
  const serverKey = readStringValue(values, 'browser.apiNative.mcp.serverKey', API_NATIVE_BROWSER_DEFAULT_MCP_SERVER_KEY)
  const command = readStringValue(values, 'browser.apiNative.mcp.command', API_NATIVE_BROWSER_DEFAULT_MCP_COMMAND)
  const args = readJsonArrayValue(values, 'browser.apiNative.mcp.args', API_NATIVE_BROWSER_DEFAULT_MCP_ARGS)
  const env = readJsonObjectValue(values, 'browser.apiNative.mcp.env', API_NATIVE_BROWSER_DEFAULT_MCP_ENV)
  const runtimeUrl = readStringValue(values, 'browser.apiNative.mcp.runtimeUrl', API_NATIVE_BROWSER_DEFAULT_RUNTIME_URL)
  return JSON.stringify({
    mcpServers: {
      [serverKey]: {
        command,
        args,
        env: {
          ...env,
          UNBROWSE_URL: runtimeUrl,
        },
      },
    },
  }, null, 2)
}

export function buildBrowserBridgeMcpConfigJson(values: Record<string, unknown>): string {
  const runtimeUrl = readStringValue(values, 'browser.apiNative.mcp.runtimeUrl', API_NATIVE_BROWSER_DEFAULT_RUNTIME_URL)
  const defaultIntent = readStringValue(values, 'browser.apiNative.mcp.defaultIntent', API_NATIVE_BROWSER_DEFAULT_INTENT)
  const defaultTargetUrl = readStringValue(values, 'browser.apiNative.mcp.targetUrl', API_NATIVE_BROWSER_DEFAULT_TARGET_URL)
  const bridgeEnv = {
    AGENTIC_OS_ROOT: '/ABS/PATH/TO/WORKSPACE_ROOT',
    AGENTIC_OS_PYTHON: '/ABS/PATH/TO/PYTHON',
    AGENTIC_OS_BROWSER_API_RUNTIME_URL: runtimeUrl,
    AGENTIC_OS_BROWSER_API_DEFAULT_INTENT: defaultIntent,
    ...(defaultTargetUrl ? { AGENTIC_OS_BROWSER_API_DEFAULT_TARGET_URL: defaultTargetUrl } : {}),
  }
  return JSON.stringify({
    mcpServers: {
      'api-native-browser-bridge': {
        command: 'node',
        args: ['/ABS/PATH/TO/LOCAL_MCP_SERVER.js'],
        env: bridgeEnv,
      },
    },
  }, null, 2)
}

const API_NATIVE_BROWSER_MCP_DOC_ROWS: ReadonlyArray<ApiNativeBrowserMcpDocRow> = [
  {
    key: 'server_key',
    typeLabel: 'string',
    valueKey: 'browser.apiNative.mcp.serverKey',
    responsibility: 'MCP server key inside the mcpServers object for the browser/API runtime.',
    tooltipDefaultValue: API_NATIVE_BROWSER_DEFAULT_MCP_SERVER_KEY,
    searchHints: ['mcp_servers', 'server key', API_NATIVE_BROWSER_DEFAULT_MCP_SERVER_KEY],
  },
  {
    key: 'command',
    typeLabel: 'string',
    valueKey: 'browser.apiNative.mcp.command',
    responsibility: 'Launcher command for an API-native browser MCP server.',
    tooltipDefaultValue: API_NATIVE_BROWSER_DEFAULT_MCP_COMMAND,
    searchHints: ['command', 'npx', 'mcp'],
  },
  {
    key: 'args',
    typeLabel: 'string[]',
    valueKey: 'browser.apiNative.mcp.args',
    responsibility: 'CLI args array for the browser MCP server launcher.',
    tooltipDefaultValue: API_NATIVE_BROWSER_DEFAULT_MCP_ARGS_JSON,
    searchHints: ['args', 'unbrowse', 'mcp', 'api native browser'],
  },
  {
    key: 'env',
    typeLabel: 'object',
    valueKey: 'browser.apiNative.mcp.env',
    responsibility: 'Environment object passed to the browser MCP launcher.',
    tooltipDefaultValue: API_NATIVE_BROWSER_DEFAULT_MCP_ENV_JSON,
    searchHints: ['env', 'runtime', 'local service'],
  },
  {
    key: 'startup_timeout_ms',
    typeLabel: 'integer',
    valueKey: 'browser.apiNative.mcp.startupTimeoutMs',
    responsibility: 'Browser MCP process startup timeout in milliseconds.',
    tooltipDefaultValue: API_NATIVE_BROWSER_DEFAULT_MCP_STARTUP_TIMEOUT_MS,
    searchHints: ['startup timeout', 'startup_timeout_ms'],
  },
  {
    key: 'runtime_url',
    typeLabel: 'url',
    valueKey: 'browser.apiNative.mcp.runtimeUrl',
    responsibility: 'Loopback HTTP runtime URL used by the agentic-graph MCP bridge for health, resolve, search, login, and execute calls.',
    notes: 'Remote runtime hosts are rejected by default in the stdio bridge. Set AGENTIC_OS_BROWSER_API_ALLOW_REMOTE_RUNTIME=1 only when a remote runtime is intentional.',
    tooltipDefaultValue: API_NATIVE_BROWSER_DEFAULT_RUNTIME_URL,
    searchHints: ['runtime url', 'localhost', 'loopback', '6969', 'http api'],
  },
  {
    key: 'default_intent',
    typeLabel: 'string',
    valueKey: 'browser.apiNative.mcp.defaultIntent',
    responsibility: 'Default natural-language browser task intent used when callers do not provide one.',
    tooltipDefaultValue: API_NATIVE_BROWSER_DEFAULT_INTENT,
    searchHints: ['intent', 'resolve', 'route discovery', 'first-party API route'],
  },
  {
    key: 'target_url',
    typeLabel: 'url',
    valueKey: 'browser.apiNative.mcp.targetUrl',
    responsibility: 'Optional default target URL for browser/API route resolution.',
    tooltipDefaultValue: API_NATIVE_BROWSER_DEFAULT_TARGET_URL,
    searchHints: ['target url', 'website', 'browser task'],
  },
  {
    key: 'dry_run',
    typeLabel: 'boolean',
    valueKey: 'browser.apiNative.mcp.dryRun',
    responsibility: 'Default to dry-run for API route execution so agents can inspect planned mutations before running them.',
    tooltipDefaultValue: API_NATIVE_BROWSER_DEFAULT_DRY_RUN,
    searchHints: ['dry_run', 'safe execution', 'mutation guard'],
  },
  {
    key: 'confirm_unsafe',
    typeLabel: 'boolean',
    valueKey: 'browser.apiNative.mcp.confirmUnsafe',
    responsibility: 'Require explicit unsafe-action confirmation before an agent executes non-read-only browser API routes.',
    tooltipDefaultValue: API_NATIVE_BROWSER_DEFAULT_CONFIRM_UNSAFE,
    searchHints: ['confirm unsafe', 'approval', 'mutation guard'],
  },
  {
    key: 'confirm_third_party_terms',
    typeLabel: 'boolean',
    valueKey: 'browser.apiNative.mcp.confirmThirdPartyTerms',
    responsibility: 'Require explicit third-party terms confirmation for policy-sensitive browser API route execution.',
    tooltipDefaultValue: API_NATIVE_BROWSER_DEFAULT_CONFIRM_THIRD_PARTY_TERMS,
    searchHints: ['confirm third party terms', 'policy-sensitive', 'mutation guard'],
  },
  {
    key: 'confirm_cookie_import',
    typeLabel: 'boolean',
    valueKey: 'browser.apiNative.mcp.confirmCookieImport',
    responsibility: 'Require explicit cookie import confirmation before auth cookie storage access.',
    tooltipDefaultValue: API_NATIVE_BROWSER_DEFAULT_CONFIRM_COOKIE_IMPORT,
    searchHints: ['confirm cookie import', 'cookie import', 'auth cookie storage', 'mutation guard'],
  },
  {
    key: 'actions_scope',
    typeLabel: 'readiness',
    value: 'Route cache, native browser actions, loopback runtime URL, dry-run, unsafe-action, third-party terms, and cookie-import confirmation stay configurable in MainPanel MCP.',
    responsibility: 'Keeps API-native browser MCP readiness controls visible in the MCP KTV surface.',
    searchHints: ['native browser actions', 'route cache', 'mainpanel mcp'],
  },
  {
    key: 'agent_config',
    typeLabel: 'object',
    value: buildApiNativeBrowserMcpAgentConfigJson({}),
    responsibility: 'Agent-ready mcpServers JSON for a direct API-native browser MCP server.',
    notes: 'Uses the configured command/args/env rows and the Unbrowse-compatible UNBROWSE_URL runtime override.',
    searchHints: ['mcpServers', 'agent config', 'stdio', 'codex', 'claude desktop', 'cursor', 'UNBROWSE_URL'],
  },
  {
    key: 'bridge_config',
    typeLabel: 'object',
    value: buildBrowserBridgeMcpConfigJson({}),
    responsibility: 'Agent-ready mcpServers JSON for the local MCP bridge that exposes the browser API tool.',
    notes: 'Use this config when the agent should connect to the app MCP server and call the browser bridge tool instead of launching the browser runtime MCP directly.',
    searchHints: ['browser bridge config', 'browser api tool', 'AGENTIC_OS_BROWSER_API_RUNTIME_URL', 'mcpServers'],
  },
]

const toBaseType = (typeLabel: string): SettingMeta['type'] => {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('float') || normalized.includes('number')) return 'number'
  if (normalized.includes('object') || normalized.includes('[]')) return 'json'
  return 'string'
}

export function getApiNativeBrowserMcpApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('mcp-row-browser', rowKey)
}

export const API_NATIVE_BROWSER_MCP_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  API_NATIVE_BROWSER_MCP_DOC_ROWS.map(row => {
    const details: FlowDetails = {
      area: API_NATIVE_BROWSER_MCP_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || 'Inspired by API-native browser route discovery: resolve first-party routes, reuse cached route contracts, and fall back to local capture without copying vendor internals.',
      modules: ['API-native browser MCP'],
      classes: ['Configuration'],
      functions: [],
      imports: [],
    }
    return {
      meta: {
        key: `browserMcp.${row.key}`,
        type: toBaseType(row.typeLabel),
        source: row.valueKey ? 'localStorage' : 'backendEnv',
        read: () => row.value ?? 'MCP setting',
      },
      value: row.value ?? 'MCP setting',
      valueKey: row.valueKey,
      typeLabel: row.typeLabel,
      tooltipRole: API_NATIVE_BROWSER_MCP_TOOLTIP_ROLE,
      tooltipDefaultValue: row.tooltipDefaultValue,
      searchHints: ['api native browser mcp configuration', 'route cache', row.key, ...(row.searchHints || [])],
      details,
    }
  })
