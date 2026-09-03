import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'
import { SEALION_MCP_SERVER_URL } from './sealionApiDocs'

export const SEALION_MCP_DOC_AREA = 'AI Singapore SEA-LION MCP Sidecar'
export const SEALION_MCP_DOCS_URL = 'https://github.com/aisingapore/sealion-sidecar'
export const SEALION_MCP_SERVER_KEY = 'sealion'
export const SEALION_MCP_API_KEY_ENV = 'AGENTIC_OS_MCP_SEALION_API_KEY'
export const SEALION_MCP_URL_ENV = 'AGENTIC_OS_MCP_SEALION_URL'
export const SEALION_MCP_REMOTE_CONFIG_KEY = 'sealionMcp.remote_config.generic'
export const SEALION_MCP_LOCAL_TOOL_NAMES = [
  'sealion.detect_language_variant',
  'sealion.translate_localize',
  'sealion.safety_check',
] as const

type SealionMcpDocRow = {
  key: string
  typeLabel: string
  value: string | number | boolean
  responsibility: string
  notes?: string
  searchHints?: string[]
}

export function buildSealionMcpRemoteConfigJson(): string {
  return JSON.stringify({
    mcpServers: {
      [SEALION_MCP_SERVER_KEY]: {
        type: 'streamable-http',
        url: SEALION_MCP_SERVER_URL,
        headers: {
          Authorization: `Bearer \${${SEALION_MCP_API_KEY_ENV}}`,
        },
      },
    },
  }, null, 2)
}

const SEALION_MCP_DOC_ROWS: ReadonlyArray<SealionMcpDocRow> = [
  {
    key: 'server_key',
    typeLabel: 'string',
    value: SEALION_MCP_SERVER_KEY,
    responsibility: 'MCP server key for the AI Singapore SEA-LION specialist sidecar.',
    searchHints: ['mcpServers', SEALION_MCP_SERVER_KEY, 'SEA-LION sidecar'],
  },
  {
    key: 'remote.url',
    typeLabel: 'url',
    value: SEALION_MCP_SERVER_URL,
    responsibility: 'Hosted SEA-LION MCP Streamable HTTP endpoint for agent sidecar tools.',
    notes: 'Clients pass their own AISG key as Authorization Bearer; agentic-graph local MCP uses the server-owned env key.',
    searchHints: ['streamable-http', SEALION_MCP_SERVER_URL],
  },
  {
    key: 'transport.primary',
    typeLabel: 'transport',
    value: 'streamable-http /mcp',
    responsibility: 'Primary hosted sidecar transport for MCP clients.',
    notes: 'The upstream sidecar also supports stdio and SSE, but agentic-graph local MCP forwards to the hosted Streamable HTTP endpoint.',
    searchHints: ['streamable-http', 'sse', 'stdio'],
  },
  {
    key: 'env.api_key',
    typeLabel: 'env',
    value: SEALION_MCP_API_KEY_ENV,
    responsibility: 'Server-side AISG API key env for local agentic-graph MCP sidecar forwarding.',
    notes: 'Do not persist raw API keys in browser settings, localStorage, docs, fixtures, or source files.',
    searchHints: ['api key', 'Authorization Bearer', SEALION_MCP_API_KEY_ENV],
  },
  {
    key: 'env.url',
    typeLabel: 'env',
    value: SEALION_MCP_URL_ENV,
    responsibility: 'Optional server-side override for a self-hosted SEA-LION sidecar endpoint.',
    notes: 'Leave unset for the hosted AISG endpoint; use only when an operator runs their own sidecar.',
    searchHints: ['override', 'self-hosted', SEALION_MCP_URL_ENV],
  },
  {
    key: 'tool.detect_language_variant',
    typeLabel: 'tool',
    value: SEALION_MCP_LOCAL_TOOL_NAMES[0],
    responsibility: 'Detect language, regional variant, register, and code-switching before routing SEA language work.',
    searchHints: ['detect_language_variant', 'singlish', 'manglish', 'code-switching'],
  },
  {
    key: 'tool.translate_localize',
    typeLabel: 'tool',
    value: SEALION_MCP_LOCAL_TOOL_NAMES[1],
    responsibility: 'Translate and localize for Southeast Asian audience, region, tone, and reading level.',
    searchHints: ['translate_localize', 'localization_notes', 'target_language', 'target_region'],
  },
  {
    key: 'tool.safety_check',
    typeLabel: 'tool',
    value: SEALION_MCP_LOCAL_TOOL_NAMES[2],
    responsibility: 'Run advisory SEA-Guard safety classification for SEA language and culture-sensitive content.',
    notes: 'Classifier signal only; public or high-stakes moderation decisions still require review.',
    searchHints: ['safety_check', 'SEA-Guard', 'sensitive_content'],
  },
  {
    key: 'remote_config.generic',
    typeLabel: 'object',
    value: buildSealionMcpRemoteConfigJson(),
    responsibility: 'Generic MCP client config for the hosted SEA-LION sidecar without embedding secrets.',
    searchHints: ['mcpServers', 'Authorization', SEALION_MCP_API_KEY_ENV],
  },
  {
    key: 'docs.sidecar_repo',
    typeLabel: 'url',
    value: SEALION_MCP_DOCS_URL,
    responsibility: 'Upstream sidecar source for current tool signatures, transports, and setup guidance.',
    searchHints: ['aisingapore/sealion-sidecar', 'docs', 'GitHub'],
  },
]

const toBaseType = (typeLabel: string): SettingMeta['type'] => {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('float') || normalized.includes('number')) return 'number'
  if (normalized.includes('object') || normalized.includes('[]')) return 'json'
  return 'string'
}

export function getSealionMcpApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('mcp-row-sealion', rowKey)
}

export const SEALION_MCP_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  SEALION_MCP_DOC_ROWS.map(row => {
    const details: FlowDetails = {
      area: SEALION_MCP_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: ['mcp/sealion-sidecar-runtime.js', 'mcp/local-tool-contract.js', 'mcp/server.js'],
      classes: ['Hosted MCP sidecar', 'Regional specialist tools'],
      functions: ['callSealionSidecarTool'],
      imports: [],
    }
    return {
      meta: {
        key: `sealionMcp.${row.key}`,
        type: toBaseType(row.typeLabel),
        source: 'backendEnv',
        read: () => row.value,
      },
      value: row.value,
      typeLabel: row.typeLabel,
      searchHints: ['sealion mcp', 'sea-lion sidecar', row.key, ...(row.searchHints || [])],
      details,
    }
  })
