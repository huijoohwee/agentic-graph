import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'

export const EXTERNAL_MCP_TOOL_SERVER_DOC_AREA = 'External MCP Tool Servers'
export const EXTERNAL_MCP_TOOL_SERVER_STDIO_CONFIG_KEY = 'externalMcp.config.stdio_template'
export const EXTERNAL_MCP_TOOL_SERVER_HTTP_CONFIG_KEY = 'externalMcp.config.streamable_http_template'
export const EXTERNAL_MCP_TOOL_SERVER_PLACEHOLDER_ENV = 'TOOL_SERVER_TOKEN_ENV'
export const EXTERNAL_MCP_TOOL_SERVER_PROFILES_ENV = 'AGENTICGRAPH_EXTERNAL_MCP_PROFILES_JSON'

const EXTERNAL_MCP_TOOL_SERVER_KEY_PREFIX = 'externalMcp.'
const EXTERNAL_MCP_DISCOVERY_TOOL_IDS = [
  'agenticgraph.tool.catalog',
  'agenticgraph.tool.search',
  'agenticgraph.tool.describe',
  'agenticgraph.tool.call',
] as const

type ExternalMcpToolServerDocRow = {
  key: string
  typeLabel: string
  value: string | number | boolean
  responsibility: string
  notes?: string
  searchHints?: string[]
}

export function buildExternalMcpStdioConfigJson(): string {
  return JSON.stringify({
    mcpServers: {
      '<server-key>': {
        command: '<host-owned-command>',
        args: ['<arg>'],
        env: {
          [EXTERNAL_MCP_TOOL_SERVER_PLACEHOLDER_ENV]: `\${${EXTERNAL_MCP_TOOL_SERVER_PLACEHOLDER_ENV}}`,
        },
      },
    },
  }, null, 2)
}

export function buildExternalMcpStreamableHttpConfigJson(): string {
  return JSON.stringify({
    mcpServers: {
      '<server-key>': {
        type: 'streamable-http',
        url: 'https://<host-owned-mcp-endpoint>/mcp',
        headers: {
          Authorization: `Bearer \${${EXTERNAL_MCP_TOOL_SERVER_PLACEHOLDER_ENV}}`,
        },
      },
    },
  }, null, 2)
}

const list = (items: readonly string[]): string => items.join(' | ')

const EXTERNAL_MCP_TOOL_SERVER_DOC_ROWS: ReadonlyArray<ExternalMcpToolServerDocRow> = [
  {
    key: 'gateway.role',
    typeLabel: 'contract',
    value: 'runtime-executable capability gateway over host-approved MCP profiles',
    responsibility: 'Expose local catalog, search, describe, and call tools while keeping exact transports, credentials, upstream tool names, and mappings host-owned.',
    searchHints: ['external tool servers', 'federation', 'mcp gateway'],
  },
  {
    key: 'transport.local_stdio',
    typeLabel: 'transport',
    value: 'stdio',
    responsibility: 'Local external MCP server transport owned by the operator MCP host.',
    notes: 'MainPanel renders setup shape only; it does not spawn arbitrary commands from browser state.',
    searchHints: ['stdio', 'local server', 'command args'],
  },
  {
    key: 'transport.remote_http',
    typeLabel: 'transport',
    value: 'streamable-http',
    responsibility: 'Remote external MCP server transport owned by the operator MCP host or approved control plane.',
    notes: 'Remote credentials stay in host-managed environment or OAuth state outside browser settings.',
    searchHints: ['streamable-http', 'remote http', 'oauth'],
  },
  {
    key: 'discovery.zero_token',
    typeLabel: 'cost',
    value: '0 discovery tokens',
    responsibility: 'Capability discovery lists tools, sources, and availability without invoking a model.',
    searchHints: ['zero token', 'tool catalog', 'capabilities'],
  },
  {
    key: 'tool.bridge_ids',
    typeLabel: 'tool list',
    value: list(EXTERNAL_MCP_DISCOVERY_TOOL_IDS),
    responsibility: 'Runtime-executable local stdio routes for opaque capability discovery, bounded schema access, and approved external artifact calls.',
    searchHints: [...EXTERNAL_MCP_DISCOVERY_TOOL_IDS, 'tool search', 'tool describe', 'tool call'],
  },
  {
    key: 'tool.allowlist_policy',
    typeLabel: 'policy',
    value: 'session-scoped host allowlist',
    responsibility: 'Expose only operator-granted MCP tools from the active host session.',
    notes: 'Disabled or out-of-scope tools must not appear in search, describe, or call results.',
    searchHints: ['allowlist', 'tool filtering', 'enabled tools', 'disabled tools'],
  },
  {
    key: 'schema.progressive_disclosure',
    typeLabel: 'token policy',
    value: 'search before describe before call',
    responsibility: 'Keep large external MCP schemas out of model-visible context until one matching tool is selected.',
    notes: 'Core required tools stay directly available; deferral applies only to eligible MCP or non-core plugin tools.',
    searchHints: ['progressive disclosure', 'deferred schema', 'schema budget'],
  },
  {
    key: 'approval.policy',
    typeLabel: 'guard',
    value: 'digest-bound, expiring, single-use approval before every external file write',
    responsibility: 'Bind approval to one capability revision, canonical artifact, and idempotency key before any external MCP mutation or egress.',
    searchHints: ['approval', 'egress', 'audit', 'cost', 'fallback'],
  },
  {
    key: 'runtime.profile_env',
    typeLabel: 'server env',
    value: EXTERNAL_MCP_TOOL_SERVER_PROFILES_ENV,
    responsibility: 'Load reviewed stdio or Streamable HTTP capability profiles only from the host environment.',
    notes: 'Each enabled tool pins its live input-schema digest, canonical artifact argument mapping, constants, idempotency field, result pointers, and allowed HTTPS receipt origins. Browser requests cannot override them.',
    searchHints: ['profile registry', 'schema digest', 'argument mapping', 'allowed origins'],
  },
  {
    key: 'config.stdio_template',
    typeLabel: 'object',
    value: buildExternalMcpStdioConfigJson(),
    responsibility: 'Generic host-owned stdio MCP config template with placeholders only.',
    notes: 'The browser surface must never store literal command secrets, API keys, OAuth tokens, or local profile material.',
    searchHints: ['mcpServers', 'stdio', EXTERNAL_MCP_TOOL_SERVER_PLACEHOLDER_ENV],
  },
  {
    key: 'config.streamable_http_template',
    typeLabel: 'object',
    value: buildExternalMcpStreamableHttpConfigJson(),
    responsibility: 'Generic host-owned Streamable HTTP MCP config template with placeholders only.',
    notes: 'Endpoint and credential placeholders are operator inputs, not baked-in provider defaults.',
    searchHints: ['mcpServers', 'streamable-http', 'Authorization', EXTERNAL_MCP_TOOL_SERVER_PLACEHOLDER_ENV],
  },
  {
    key: 'secrets.boundary',
    typeLabel: 'security note',
    value: 'server-managed only',
    responsibility: 'Keep credentials, browser sessions, OAuth state, and local profile material outside docs, tests, fixtures, and browser storage.',
    searchHints: ['no browser secret', 'server-managed', 'oauth state'],
  },
  {
    key: 'copy.boundary',
    typeLabel: 'guard',
    value: 'external references are pattern-only',
    responsibility: 'Forbid copied external gateway code, tool registries, prompt text, provider tables, model lists, config examples, tests, fixtures, or prose.',
    searchHints: ['no copied implementation', 'pattern-only', 'external reference'],
  },
]

const toBaseType = (typeLabel: string): SettingMeta['type'] => {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('float') || normalized.includes('number')) return 'number'
  if (normalized.includes('object') || normalized.includes('schema')) return 'json'
  return 'string'
}

export function getExternalMcpToolServerRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('mcp-row-external-tool-server', rowKey)
}

export const EXTERNAL_MCP_TOOL_SERVER_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  EXTERNAL_MCP_TOOL_SERVER_DOC_ROWS.map(row => {
    const details: FlowDetails = {
      area: EXTERNAL_MCP_TOOL_SERVER_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: [
        'canvas/src/features/panels/views/externalMcpToolServerDocs.ts',
        'canvas/src/features/panels/views/settingsMcpDocEntries.ts',
        'mcp/local-tool-contract.js',
        'mcp/server.js',
        'mcp/external-tool-gateway-runtime.js',
        'mcp/external-tool-profile-registry.js',
        'canvas/viteExternalMcpBridge.ts',
      ],
      classes: ['Capability-scoped MCP gateway', 'External tool server readiness'],
      functions: ['buildExternalMcpStdioConfigJson', 'buildExternalMcpStreamableHttpConfigJson'],
      imports: [],
    }
    return {
      meta: {
        key: `${EXTERNAL_MCP_TOOL_SERVER_KEY_PREFIX}${row.key}`,
        type: toBaseType(row.typeLabel),
        source: 'backendEnv',
        read: () => row.value,
      },
      value: row.value,
      typeLabel: row.typeLabel,
      searchHints: ['external mcp', 'external tool server', 'agentic os mcp gateway', row.key, ...(row.searchHints || [])],
      details,
    }
  })
