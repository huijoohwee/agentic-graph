import { buildKnowgrphLocalMcpToolNameList } from '@/features/agent-ready/knowgrphVdeoxplnContract.mjs'
import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'

export const KNOWGRPH_TOOL_SERVER_DOC_AREA = 'Knowgrph Tool Servers'
export const KNOWGRPH_TOOL_SERVER_LOCAL_CONFIG_KEY = 'knowgrphToolServer.config.local_stdio'
export const KNOWGRPH_TOOL_SERVER_PAGES_CONFIG_KEY = 'knowgrphToolServer.config.pages_http_readonly'
export const KNOWGRPH_TOOL_SERVER_LIVE_PROOF_KEY = 'knowgrphToolServer.live.stdio_probe'
export const KNOWGRPH_TOOL_SERVER_KEY = 'knowgrph'

const KNOWGRPH_TOOL_SERVER_KEY_PREFIX = 'knowgrphToolServer.'

type KnowgrphToolServerDocRow = {
  key: string
  typeLabel: string
  value: string | number | boolean
  responsibility: string
  notes?: string
  searchHints?: string[]
}

export function buildKnowgrphToolServerLocalStdioConfigJson(): string {
  return JSON.stringify({
    mcpServers: {
      [KNOWGRPH_TOOL_SERVER_KEY]: {
        command: 'node',
        args: ['<ABS_PATH_TO_KNOWGRPH>/mcp/server.js'],
        env: {
          KNOWGRPH_ROOT: '<ABS_PATH_TO_KNOWGRPH>',
          KNOWGRPH_PYTHON: '<ABS_PATH_TO_PYTHON>',
          KNOWGRPH_MCP_TIMEOUT_MS: '600000',
        },
      },
    },
  }, null, 2)
}

export function buildKnowgrphToolServerPagesHttpConfigJson(): string {
  return JSON.stringify({
    mcpServers: {
      [KNOWGRPH_TOOL_SERVER_KEY]: {
        type: 'streamable-http',
        url: 'https://<knowgrph-origin>/knowgrph/mcp',
        tools: {
          include: ['search', 'fetch'],
        },
      },
    },
  }, null, 2)
}

const list = (items: readonly string[]): string => items.join(' | ')

export function buildKnowgrphToolServerLocalToolNamesText(): string {
  return list(buildKnowgrphLocalMcpToolNameList())
}

export function buildKnowgrphToolServerLiveReadinessProofText(): string {
  return 'local stdio proof: MCP SDK Client.connect initializes mcp/server.js, then client.listTools returns the source-derived local tool-name registry'
}

const KNOWGRPH_TOOL_SERVER_DOC_ROWS: ReadonlyArray<KnowgrphToolServerDocRow> = [
  {
    key: 'server.role',
    typeLabel: 'contract',
    value: 'external users connect to Knowgrph-owned MCP tool servers',
    responsibility: 'Describe Knowgrph as the MCP server owner so outside agents can discover and use tools that live inside Knowgrph.',
    searchHints: ['external users', 'knowgrph mcp server', 'inside knowgrph'],
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
    value: buildKnowgrphToolServerLocalToolNamesText(),
    responsibility: 'Project Knowgrph-owned local stdio tool names from the shared vdeoxpln local MCP registry without duplicating tool schemas in MainPanel.',
    searchHints: buildKnowgrphLocalMcpToolNameList(),
  },
  {
    key: 'live.stdio_probe',
    typeLabel: 'runtime',
    value: buildKnowgrphToolServerLiveReadinessProofText(),
    responsibility: 'Pin the live readiness gate to stdio initialize plus tools/list discovery against mcp/server.js, not to a browser-only documentation render.',
    notes: 'The focused MainPanel MCP test starts the local stdio server with placeholder-free host env values and does not call mutating tools.',
    searchHints: ['live readiness', 'stdio probe', 'Client.connect', 'tools/list', 'mcp/server.js'],
  },
  {
    key: 'discovery.startup',
    typeLabel: 'runtime',
    value: 'MCP client initializes server, lists tools, then calls selected Knowgrph tools',
    responsibility: 'Make discovery explicit for external users and avoid treating MainPanel as a tool executor.',
    searchHints: ['initialize', 'tools/list', 'tool call'],
  },
  {
    key: 'selection.policy',
    typeLabel: 'policy',
    value: 'client-side include/exclude filtering over Knowgrph tool names',
    responsibility: 'External MCP clients may expose only the Knowgrph tools they want their agent to see.',
    notes: 'Filtering belongs in the external client config or host policy; it must not fork Knowgrph tool descriptors.',
    searchHints: ['tool filtering', 'include tools', 'exclude tools'],
  },
  {
    key: 'approval.boundary',
    typeLabel: 'guard',
    value: 'dry-run-first and approval-gated for mutating, paid, browser-auth, filesystem, terminal, egress, or deploy actions',
    responsibility: 'Preserve existing Knowgrph runtime gates when tools are called by an external MCP client.',
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
    value: buildKnowgrphToolServerLocalStdioConfigJson(),
    responsibility: 'Generic mcpServers JSON for connecting an external MCP client to the local Knowgrph stdio server.',
    notes: 'Paths are placeholders; operators provide their own repo and Python locations.',
    searchHints: ['mcpServers', 'node', 'mcp/server.js', 'KNOWGRPH_ROOT', 'KNOWGRPH_PYTHON'],
  },
  {
    key: 'config.pages_http_readonly',
    typeLabel: 'object',
    value: buildKnowgrphToolServerPagesHttpConfigJson(),
    responsibility: 'Generic mcpServers JSON for connecting an external MCP client to the read-only Knowgrph Pages HTTP surface.',
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

export function getKnowgrphToolServerRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('mcp-row-knowgrph-tool-server', rowKey)
}

export const KNOWGRPH_TOOL_SERVER_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  KNOWGRPH_TOOL_SERVER_DOC_ROWS.map(row => {
    const details: FlowDetails = {
      area: KNOWGRPH_TOOL_SERVER_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: [
        'mcp/server.js',
        'mcp/local-tool-contract.js',
        'canvas/src/features/agent-ready/knowgrphVdeoxplnContract.mjs',
        'canvas/src/features/panels/views/knowgrphToolServerDocs.ts',
        'canvas/src/features/panels/views/settingsMcpDocEntries.ts',
      ],
      classes: ['Knowgrph-owned MCP tools', 'External user connection readiness'],
      functions: [
        'buildKnowgrphToolServerLocalStdioConfigJson',
        'buildKnowgrphToolServerPagesHttpConfigJson',
        'buildKnowgrphToolServerLocalToolNamesText',
        'buildKnowgrphToolServerLiveReadinessProofText',
      ],
      imports: [],
    }
    return {
      meta: {
        key: `${KNOWGRPH_TOOL_SERVER_KEY_PREFIX}${row.key}`,
        type: toBaseType(row.typeLabel),
        source: 'backendEnv',
        read: () => row.value,
      },
      value: row.value,
      typeLabel: row.typeLabel,
      searchHints: ['knowgrph tool server', 'knowgrph mcp', 'external user mcp', row.key, ...(row.searchHints || [])],
      details,
    }
  })
