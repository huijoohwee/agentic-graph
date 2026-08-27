import { buildAgenticGraphLocalMcpToolNameList } from '@/features/agent-ready/agenticgraphVdeoxplnContract.mjs'
import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'

export const AGENTICGRAPH_TOOL_SERVER_DOC_AREA = 'AgenticGraph Tool Servers'
export const AGENTICGRAPH_TOOL_SERVER_LOCAL_CONFIG_KEY = 'agenticgraphToolServer.config.local_stdio'
export const AGENTICGRAPH_TOOL_SERVER_PAGES_CONFIG_KEY = 'agenticgraphToolServer.config.pages_http_readonly'
export const AGENTICGRAPH_TOOL_SERVER_LIVE_PROOF_KEY = 'agenticgraphToolServer.live.stdio_probe'
export const AGENTICGRAPH_TOOL_SERVER_KEY = 'agenticgraph'

const AGENTICGRAPH_TOOL_SERVER_KEY_PREFIX = 'agenticgraphToolServer.'

type AgenticGraphToolServerDocRow = {
  key: string
  typeLabel: string
  value: string | number | boolean
  responsibility: string
  notes?: string
  searchHints?: string[]
}

export function buildAgenticGraphToolServerLocalStdioConfigJson(): string {
  return JSON.stringify({
    mcpServers: {
      [AGENTICGRAPH_TOOL_SERVER_KEY]: {
        command: 'node',
        args: ['<ABS_PATH_TO_AGENTICGRAPH>/mcp/server.js'],
        env: {
          AGENTICGRAPH_ROOT: '<ABS_PATH_TO_AGENTICGRAPH>',
          AGENTICGRAPH_PYTHON: '<ABS_PATH_TO_PYTHON>',
          AGENTICGRAPH_MCP_TIMEOUT_MS: '600000',
        },
      },
    },
  }, null, 2)
}

export function buildAgenticGraphToolServerPagesHttpConfigJson(): string {
  return JSON.stringify({
    mcpServers: {
      [AGENTICGRAPH_TOOL_SERVER_KEY]: {
        type: 'streamable-http',
        url: 'https://<agenticgraph-origin>/agenticgraph/mcp',
        tools: {
          include: ['search', 'fetch'],
        },
      },
    },
  }, null, 2)
}

const list = (items: readonly string[]): string => items.join(' | ')

export function buildAgenticGraphToolServerLocalToolNamesText(): string {
  return list(buildAgenticGraphLocalMcpToolNameList())
}

export function buildAgenticGraphToolServerLiveReadinessProofText(): string {
  return 'local stdio proof: MCP SDK Client.connect initializes mcp/server.js, then client.listTools returns the source-derived local tool-name registry'
}

const AGENTICGRAPH_TOOL_SERVER_DOC_ROWS: ReadonlyArray<AgenticGraphToolServerDocRow> = [
  {
    key: 'server.role',
    typeLabel: 'contract',
    value: 'external users connect to AgenticGraph-owned MCP tool servers',
    responsibility: 'Describe AgenticGraph as the MCP server owner so outside agents can discover and use tools that live inside AgenticGraph.',
    searchHints: ['external users', 'agenticgraph mcp server', 'inside agenticgraph'],
  },
  {
    key: 'surface.local_stdio',
    typeLabel: 'transport',
    value: 'local stdio rich tool server',
    responsibility: 'Primary external-user route for local/dev tools exposed by mcp/server.js.',
    notes: 'The external MCP client starts the local server process; browser MainPanel only renders setup metadata.',
    searchHints: ['stdio', 'mcp/server.js', 'local tool server'],
  },
  {
    key: 'surface.pages_http_readonly',
    typeLabel: 'transport',
    value: 'Pages HTTP read-only source server',
    responsibility: 'Remote read-only route for published Source Files search and fetch.',
    notes: 'This surface is discovery/read-only; mutating local tools remain local stdio or approved control-plane work.',
    searchHints: ['Pages HTTP MCP', 'search', 'fetch', 'read-only'],
  },
  {
    key: 'tool.names',
    typeLabel: 'tool list',
    value: buildAgenticGraphToolServerLocalToolNamesText(),
    responsibility: 'Project AgenticGraph-owned local stdio tool names from the shared vdeoxpln local MCP registry without duplicating tool schemas in MainPanel.',
    searchHints: buildAgenticGraphLocalMcpToolNameList(),
  },
  {
    key: 'live.stdio_probe',
    typeLabel: 'runtime',
    value: buildAgenticGraphToolServerLiveReadinessProofText(),
    responsibility: 'Pin the live readiness gate to stdio initialize plus tools/list discovery against mcp/server.js, not to a browser-only documentation render.',
    notes: 'The focused MainPanel MCP test starts the local stdio server with placeholder-free host env values and does not call mutating tools.',
    searchHints: ['live readiness', 'stdio probe', 'Client.connect', 'tools/list', 'mcp/server.js'],
  },
  {
    key: 'discovery.startup',
    typeLabel: 'runtime',
    value: 'MCP client initializes server, lists tools, then calls selected AgenticGraph tools',
    responsibility: 'Make discovery explicit for external users and avoid treating MainPanel as a tool executor.',
    searchHints: ['initialize', 'tools/list', 'tool call'],
  },
  {
    key: 'selection.policy',
    typeLabel: 'policy',
    value: 'client-side include/exclude filtering over AgenticGraph tool names',
    responsibility: 'External MCP clients may expose only the AgenticGraph tools they want their agent to see.',
    notes: 'Filtering belongs in the external client config or host policy; it must not fork AgenticGraph tool descriptors.',
    searchHints: ['tool filtering', 'include tools', 'exclude tools'],
  },
  {
    key: 'approval.boundary',
    typeLabel: 'guard',
    value: 'dry-run-first and approval-gated for mutating, paid, browser-auth, filesystem, terminal, egress, or deploy actions',
    responsibility: 'Preserve existing AgenticGraph runtime gates when tools are called by an external MCP client.',
    searchHints: ['approval', 'dry-run', 'paid call', 'deploy gate'],
  },
  {
    key: 'secrets.boundary',
    typeLabel: 'security note',
    value: 'host env only',
    responsibility: 'Keep credentials and local paths in the external MCP host environment, never in browser storage or docs.',
    notes: 'MainPanel may show env variable names and placeholders only.',
    searchHints: ['host env', 'no browser secret', 'placeholder only'],
  },
  {
    key: 'config.local_stdio',
    typeLabel: 'object',
    value: buildAgenticGraphToolServerLocalStdioConfigJson(),
    responsibility: 'Generic mcpServers JSON for connecting an external MCP client to the local AgenticGraph stdio server.',
    notes: 'Paths are placeholders; operators provide their own repo and Python locations.',
    searchHints: ['mcpServers', 'node', 'mcp/server.js', 'AGENTICGRAPH_ROOT', 'AGENTICGRAPH_PYTHON'],
  },
  {
    key: 'config.pages_http_readonly',
    typeLabel: 'object',
    value: buildAgenticGraphToolServerPagesHttpConfigJson(),
    responsibility: 'Generic mcpServers JSON for connecting an external MCP client to the read-only AgenticGraph Pages HTTP surface.',
    notes: 'Use an operator-supplied origin. This row does not claim any deployment or live endpoint.',
    searchHints: ['mcpServers', 'streamable-http', 'search', 'fetch', 'read-only'],
  },
  {
    key: 'copy.boundary',
    typeLabel: 'guard',
    value: 'Hermes-inspired MCP connection pattern only',
    responsibility: 'Use the external reference for MCP concepts such as stdio, HTTP, startup discovery, and filtering; do not copy Hermes code, manifests, config paths, provider tables, examples, tests, fixtures, or prose.',
    searchHints: ['no copy', 'pattern only', 'Hermes-inspired'],
  },
]

const toBaseType = (typeLabel: string): SettingMeta['type'] => {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('float') || normalized.includes('number')) return 'number'
  if (normalized.includes('object') || normalized.includes('schema')) return 'json'
  return 'string'
}

export function getAgenticGraphToolServerRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('mcp-row-agenticgraph-tool-server', rowKey)
}

export const AGENTICGRAPH_TOOL_SERVER_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  AGENTICGRAPH_TOOL_SERVER_DOC_ROWS.map(row => {
    const details: FlowDetails = {
      area: AGENTICGRAPH_TOOL_SERVER_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: [
        'mcp/server.js',
        'mcp/local-tool-contract.js',
        'canvas/src/features/agent-ready/agenticgraphVdeoxplnContract.mjs',
        'canvas/src/features/panels/views/agenticgraphToolServerDocs.ts',
        'canvas/src/features/panels/views/settingsMcpDocEntries.ts',
      ],
      classes: ['AgenticGraph-owned MCP tools', 'External user connection readiness'],
      functions: [
        'buildAgenticGraphToolServerLocalStdioConfigJson',
        'buildAgenticGraphToolServerPagesHttpConfigJson',
        'buildAgenticGraphToolServerLocalToolNamesText',
        'buildAgenticGraphToolServerLiveReadinessProofText',
      ],
      imports: [],
    }
    return {
      meta: {
        key: `${AGENTICGRAPH_TOOL_SERVER_KEY_PREFIX}${row.key}`,
        type: toBaseType(row.typeLabel),
        source: 'backendEnv',
        read: () => row.value,
      },
      value: row.value,
      typeLabel: row.typeLabel,
      searchHints: ['agenticgraph tool server', 'agenticgraph mcp', 'external user mcp', row.key, ...(row.searchHints || [])],
      details,
    }
  })
