import type { FlowDetails, SettingMeta } from '@/features/settings/types'
import type { VirtualSettingsEntry } from './byteplusSharedTextApiDocs'
import { buildSettingsRowAnchorId } from './settingsRowAnchor'
import { VIDEODB_API_DOCS_URL, VIDEODB_BASE_URL } from '@/features/integrations/videodbSsot'

export const VIDEODB_MCP_DOC_AREA = 'VideoDB Director MCP'
export const VIDEODB_MCP_DOCS_URL = 'https://docs.videodb.io/pages/build-with-agents/mcp-server.md'
export const VIDEODB_MCP_PACKAGE = 'videodb-director-mcp'
export const VIDEODB_MCP_SERVER_KEY = 'videodb-director'
export const VIDEODB_MCP_CREDENTIAL_ENV = 'VIDEODB_API_KEY'
export const VIDEODB_MCP_CREDENTIAL_PLACEHOLDER = '${VIDEODB_API_KEY}'
export const VIDEODB_MCP_UVX_COMMAND = 'uvx'
export const VIDEODB_MCP_PIPX_COMMAND = 'pipx'
export const VIDEODB_MCP_PIP_COMMAND = 'videodb-director-mcp'
export const VIDEODB_MCP_PYTHON_PREREQUISITE = 'Python 3.12+'
export const VIDEODB_MCP_POLL_MAX_ITERATIONS = 36
export const VIDEODB_MCP_POLL_INTERVAL_MS = 10000
export const VIDEODB_MCP_REQUIRE_CONFIRMATION = true
export const VIDEODB_MCP_UVX_CONFIG_KEY = 'videodb.mcp.config.uvx'
export const VIDEODB_MCP_PIPX_CONFIG_KEY = 'videodb.mcp.config.pipx'
export const VIDEODB_MCP_CLAUDE_CODE_COMMAND_KEY = 'videodb.mcp.command.claude_code'

export const VIDEODB_MCP_CORE_TOOLS = [
  'upload_video',
  'get_collection',
  'list_collections',
  'create_collection',
  'get_async_response',
  'check_health',
] as const

export const VIDEODB_MCP_SEARCH_TOOLS = [
  'search_videos',
  'search_collection',
  'search_by_scene',
] as const

export const VIDEODB_MCP_INDEX_TOOLS = [
  'index_video',
  'index_scene',
] as const

export const VIDEODB_MCP_STREAM_TOOLS = [
  'stream_video',
] as const

export const VIDEODB_MCP_TRANSCRIPT_TOOLS = [
  'get_transcript',
] as const

export const VIDEODB_MCP_AI_TOOLS = [
  'generate_video',
  'generate_audio',
  'generate_text',
  'dub_video',
  'translate_video',
] as const

export const VIDEODB_MCP_ASYNC_TOOLS = [
  'upload_video',
  'index_video',
  'index_scene',
  'generate_video',
  'generate_audio',
  'generate_text',
  'dub_video',
  'translate_video',
] as const

export const VIDEODB_MCP_ALL_TOOLS = [
  ...VIDEODB_MCP_CORE_TOOLS,
  ...VIDEODB_MCP_SEARCH_TOOLS,
  ...VIDEODB_MCP_INDEX_TOOLS,
  ...VIDEODB_MCP_STREAM_TOOLS,
  ...VIDEODB_MCP_TRANSCRIPT_TOOLS,
  ...VIDEODB_MCP_AI_TOOLS,
] as const

type VideodbMcpDocRow = {
  key: string
  typeLabel: string
  valueKey?: string
  value?: string | number | boolean
  responsibility: string
  notes?: string
  searchHints?: string[]
  tooltipDefaultValue?: string | number | boolean | null
}

const VIDEODB_MCP_TOOLTIP_ROLE = 'VideoDB Director MCP'
const VIDEODB_MCP_KEY_PREFIX = 'videodb.mcp.'

const readStringValue = (values: Record<string, unknown>, key: string, fallback: string): string => {
  const value = values[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

const apiKeyArg = () => `--api-key=${VIDEODB_MCP_CREDENTIAL_PLACEHOLDER}`

export function buildVideodbUvxMcpConfigJson(values: Record<string, unknown>): string {
  const serverKey = readStringValue(values, `${VIDEODB_MCP_KEY_PREFIX}server_key`, VIDEODB_MCP_SERVER_KEY)
  const command = readStringValue(values, `${VIDEODB_MCP_KEY_PREFIX}uvx.command`, VIDEODB_MCP_UVX_COMMAND)
  const mcpPackage = readStringValue(values, `${VIDEODB_MCP_KEY_PREFIX}package`, VIDEODB_MCP_PACKAGE)
  return JSON.stringify({
    mcpServers: {
      [serverKey]: {
        command,
        args: [mcpPackage, apiKeyArg()],
      },
    },
  }, null, 2)
}

export function buildVideodbPipxMcpConfigJson(values: Record<string, unknown>): string {
  const serverKey = readStringValue(values, `${VIDEODB_MCP_KEY_PREFIX}server_key`, VIDEODB_MCP_SERVER_KEY)
  const command = readStringValue(values, `${VIDEODB_MCP_KEY_PREFIX}pipx.command`, VIDEODB_MCP_PIPX_COMMAND)
  const mcpPackage = readStringValue(values, `${VIDEODB_MCP_KEY_PREFIX}package`, VIDEODB_MCP_PACKAGE)
  return JSON.stringify({
    mcpServers: {
      [serverKey]: {
        command,
        args: ['run', mcpPackage, apiKeyArg()],
      },
    },
  }, null, 2)
}

export function buildVideodbClaudeCodeMcpCommand(values: Record<string, unknown>): string {
  const serverKey = readStringValue(values, `${VIDEODB_MCP_KEY_PREFIX}server_key`, VIDEODB_MCP_SERVER_KEY)
  const mcpPackage = readStringValue(values, `${VIDEODB_MCP_KEY_PREFIX}package`, VIDEODB_MCP_PACKAGE)
  return `claude mcp add ${serverKey} ${VIDEODB_MCP_UVX_COMMAND} -- ${mcpPackage} ${apiKeyArg()}`
}

const toolList = (items: readonly string[]): string => items.join(' | ')

const asyncNotes = `Async tools return a job id and must poll videodb.async_response.get with ${VIDEODB_MCP_POLL_MAX_ITERATIONS} x ${VIDEODB_MCP_POLL_INTERVAL_MS}ms circuit-breaker.`

const VIDEODB_MCP_DOC_ROWS: ReadonlyArray<VideodbMcpDocRow> = [
  {
    key: 'server_key',
    typeLabel: 'string',
    valueKey: `${VIDEODB_MCP_KEY_PREFIX}server_key`,
    responsibility: 'MCP server key inside mcpServers for VideoDB Director.',
    tooltipDefaultValue: VIDEODB_MCP_SERVER_KEY,
    searchHints: ['mcpServers', VIDEODB_MCP_SERVER_KEY],
  },
  {
    key: 'uvx.command',
    typeLabel: 'command',
    valueKey: `${VIDEODB_MCP_KEY_PREFIX}uvx.command`,
    responsibility: 'Recommended VideoDB Director MCP launcher command.',
    notes: 'The MCP host supplies VIDEODB_API_KEY from its environment; MainPanel shows only the placeholder argument.',
    tooltipDefaultValue: VIDEODB_MCP_UVX_COMMAND,
    searchHints: [VIDEODB_MCP_UVX_COMMAND, VIDEODB_MCP_PACKAGE, 'recommended launcher'],
  },
  {
    key: 'pipx.command',
    typeLabel: 'command',
    valueKey: `${VIDEODB_MCP_KEY_PREFIX}pipx.command`,
    responsibility: 'Fallback VideoDB Director MCP launcher when uvx is unavailable.',
    tooltipDefaultValue: VIDEODB_MCP_PIPX_COMMAND,
    searchHints: [VIDEODB_MCP_PIPX_COMMAND, 'fallback launcher'],
  },
  {
    key: 'pip.command',
    typeLabel: 'command',
    value: VIDEODB_MCP_PIP_COMMAND,
    responsibility: 'Package-installed launcher command for persistent pip installs.',
    searchHints: [VIDEODB_MCP_PIP_COMMAND, 'pip install'],
  },
  {
    key: 'package',
    typeLabel: 'string',
    valueKey: `${VIDEODB_MCP_KEY_PREFIX}package`,
    responsibility: 'Python package name for the VideoDB Director MCP server.',
    tooltipDefaultValue: VIDEODB_MCP_PACKAGE,
    searchHints: [VIDEODB_MCP_PACKAGE, 'Python package'],
  },
  {
    key: 'python.prerequisite',
    typeLabel: 'readiness',
    value: VIDEODB_MCP_PYTHON_PREREQUISITE,
    responsibility: 'Runtime prerequisite for the host-owned MCP process.',
    notes: 'Surface as guidance only; AgenticGraph does not install Python or mutate host MCP config.',
    searchHints: ['Python 3.12', 'runtime prerequisite'],
  },
  {
    key: 'api.base_url',
    typeLabel: 'url',
    value: VIDEODB_BASE_URL,
    responsibility: 'VideoDB REST API base URL used by the MCP server after host authorization.',
    searchHints: [VIDEODB_BASE_URL, 'VideoDB REST API'],
  },
  {
    key: 'credential.env',
    typeLabel: 'security note',
    value: VIDEODB_MCP_CREDENTIAL_ENV,
    responsibility: 'Host-owned environment variable name for the VideoDB API key.',
    notes: 'Name only. The credential value must never be stored in browser localStorage, sessionStorage, docs, or tests.',
    searchHints: [VIDEODB_MCP_CREDENTIAL_ENV, 'host environment', 'no browser secret'],
  },
  {
    key: 'credential.placeholder',
    typeLabel: 'string',
    value: VIDEODB_MCP_CREDENTIAL_PLACEHOLDER,
    responsibility: 'Placeholder rendered in copy-ready MCP config instead of a literal credential.',
    notes: 'Keep placeholder text visible so operators know where the MCP host injects the secret.',
    searchHints: [VIDEODB_MCP_CREDENTIAL_PLACEHOLDER, 'placeholder'],
  },
  {
    key: 'tool.core',
    typeLabel: 'tool list',
    value: toolList(VIDEODB_MCP_CORE_TOOLS),
    responsibility: 'Core VideoDB MCP tools for upload, collection, async response, and health readiness.',
    notes: asyncNotes,
    searchHints: [...VIDEODB_MCP_CORE_TOOLS],
  },
  {
    key: 'tool.search',
    typeLabel: 'tool list',
    value: toolList(VIDEODB_MCP_SEARCH_TOOLS),
    responsibility: 'Read-oriented VideoDB MCP tools for semantic video and collection search.',
    searchHints: [...VIDEODB_MCP_SEARCH_TOOLS],
  },
  {
    key: 'tool.index',
    typeLabel: 'tool list',
    value: toolList(VIDEODB_MCP_INDEX_TOOLS),
    responsibility: 'Async index tools for spoken-word and scene retrieval readiness.',
    notes: asyncNotes,
    searchHints: [...VIDEODB_MCP_INDEX_TOOLS, 'job id', 'get_async_response'],
  },
  {
    key: 'tool.stream',
    typeLabel: 'tool list',
    value: toolList(VIDEODB_MCP_STREAM_TOOLS),
    responsibility: 'Synchronous stream URL resolver for operator-approved publish packets.',
    searchHints: [...VIDEODB_MCP_STREAM_TOOLS, 'stream_url'],
  },
  {
    key: 'tool.transcript',
    typeLabel: 'tool list',
    value: toolList(VIDEODB_MCP_TRANSCRIPT_TOOLS),
    responsibility: 'Read-only transcript retrieval for indexed or transcribed videos.',
    searchHints: [...VIDEODB_MCP_TRANSCRIPT_TOOLS, 'transcript_text'],
  },
  {
    key: 'tool.ai_generation',
    typeLabel: 'tool list',
    value: toolList(VIDEODB_MCP_AI_TOOLS),
    responsibility: 'Paid or mutating AI generation tools that require explicit human confirmation.',
    notes: asyncNotes,
    searchHints: [...VIDEODB_MCP_AI_TOOLS, 'human confirmation', 'paid generation'],
  },
  {
    key: 'tool.async',
    typeLabel: 'tool list',
    value: toolList(VIDEODB_MCP_ASYNC_TOOLS),
    responsibility: 'All async VideoDB MCP tools that return a job id and require bounded polling.',
    notes: asyncNotes,
    searchHints: [...VIDEODB_MCP_ASYNC_TOOLS, '36', '10000', 'circuit-breaker'],
  },
  {
    key: 'tool.confirmation_required',
    typeLabel: 'boolean',
    valueKey: `${VIDEODB_MCP_KEY_PREFIX}tool.confirmation_required`,
    responsibility: 'Require human confirmation before AI-generation VideoDB MCP tool calls.',
    tooltipDefaultValue: VIDEODB_MCP_REQUIRE_CONFIRMATION,
    searchHints: ['human confirmation', ...VIDEODB_MCP_AI_TOOLS],
  },
  {
    key: 'async.circuit_breaker',
    typeLabel: 'readiness',
    value: `${VIDEODB_MCP_POLL_MAX_ITERATIONS} x ${VIDEODB_MCP_POLL_INTERVAL_MS}ms`,
    responsibility: 'Shared async polling bound for MCP and REST VideoDB paths.',
    notes: 'On bound exhaustion, return structured failure; never loop indefinitely or fabricate job output.',
    searchHints: ['36 x 10000ms', 'get_async_response', 'videodb.async_response.get'],
  },
  {
    key: 'config.uvx',
    typeLabel: 'object',
    value: buildVideodbUvxMcpConfigJson({}),
    responsibility: 'Copy-ready mcpServers JSON for uvx-based VideoDB Director MCP clients.',
    notes: 'The generated JSON contains only the credential placeholder, never a literal API key.',
    searchHints: ['mcpServers', VIDEODB_MCP_UVX_COMMAND, VIDEODB_MCP_PACKAGE],
  },
  {
    key: 'config.pipx',
    typeLabel: 'object',
    value: buildVideodbPipxMcpConfigJson({}),
    responsibility: 'Copy-ready mcpServers JSON for pipx-based VideoDB Director MCP clients.',
    notes: 'The generated JSON contains only the credential placeholder, never a literal API key.',
    searchHints: ['mcpServers', VIDEODB_MCP_PIPX_COMMAND, VIDEODB_MCP_PACKAGE],
  },
  {
    key: 'command.claude_code',
    typeLabel: 'command',
    value: buildVideodbClaudeCodeMcpCommand({}),
    responsibility: 'Claude Code one-liner for adding VideoDB Director MCP without browser-stored secrets.',
    searchHints: ['claude mcp add', VIDEODB_MCP_SERVER_KEY],
  },
  {
    key: 'package.update',
    typeLabel: 'guidance',
    value: `uv cache clean && uvx ${VIDEODB_MCP_PACKAGE}@latest ${apiKeyArg()}`,
    responsibility: 'Operator guidance for refreshing the uvx package cache when MCP tools are stale.',
    searchHints: ['uv cache clean', '@latest', 'fresh package'],
  },
  {
    key: 'auth.boundary',
    typeLabel: 'security note',
    value: `${VIDEODB_MCP_CREDENTIAL_ENV} stays in the MCP host environment`,
    responsibility: 'Credential boundary between browser UI and host-owned MCP process.',
    notes: 'MainPanel MCP can render variable names and placeholders only; it must not store actual VideoDB credentials.',
    searchHints: ['host env only', 'no localStorage', VIDEODB_MCP_CREDENTIAL_ENV],
  },
  {
    key: 'publish.packet_schema',
    typeLabel: 'schema',
    value: 'video_id | stream_url | search_results | transcript_text',
    responsibility: 'Strybldr publish packet fields shared by VideoDB MCP and REST paths.',
    notes: 'Values must come from live VideoDB responses or explicit fallback state, never fabricated fixtures.',
    searchHints: ['Strybldr', 'publish packet', 'video_id', 'stream_url'],
  },
  {
    key: 'docs.url',
    typeLabel: 'url',
    value: VIDEODB_MCP_DOCS_URL,
    responsibility: 'Official VideoDB MCP setup reference.',
    searchHints: ['VideoDB MCP docs', VIDEODB_MCP_DOCS_URL],
  },
  {
    key: 'docs.api_reference_url',
    typeLabel: 'url',
    value: VIDEODB_API_DOCS_URL,
    responsibility: 'Official VideoDB REST API reference used to align MCP tool semantics.',
    searchHints: ['VideoDB API reference', VIDEODB_API_DOCS_URL],
  },
]

const toBaseType = (typeLabel: string): SettingMeta['type'] => {
  const normalized = String(typeLabel || '').trim().toLowerCase()
  if (normalized.includes('boolean')) return 'boolean'
  if (normalized.includes('integer') || normalized.includes('float') || normalized.includes('number')) return 'number'
  if (normalized.includes('object') || normalized.includes('[]') || normalized.includes('schema')) return 'json'
  return 'string'
}

export function getVideodbMcpApiRowAnchorId(rowKey: string): string {
  return buildSettingsRowAnchorId('mcp-row-videodb', rowKey)
}

export const VIDEODB_MCP_DOC_ENTRIES: ReadonlyArray<VirtualSettingsEntry> =
  VIDEODB_MCP_DOC_ROWS.map(row => {
    const details: FlowDetails = {
      area: VIDEODB_MCP_DOC_AREA,
      responsibility: row.responsibility,
      notes: row.notes || '',
      modules: ['VideoDB Director MCP', 'canvas/src/features/panels/views/videodbMcpApiDocs.ts'],
      classes: ['Configuration'],
      functions: ['MainPanel MCP'],
      imports: [],
    }
    return {
      meta: {
        key: `videodb.mcp.${row.key}`,
        type: toBaseType(row.typeLabel),
        source: row.valueKey ? 'localStorage' : 'backendEnv',
        read: () => row.value ?? 'VideoDB MCP setting',
      },
      value: row.value ?? 'VideoDB MCP setting',
      valueKey: row.valueKey,
      typeLabel: row.typeLabel,
      tooltipRole: VIDEODB_MCP_TOOLTIP_ROLE,
      tooltipDefaultValue: row.tooltipDefaultValue,
      searchHints: ['videodb mcp configuration', 'VideoDB Director MCP', row.key, ...(row.searchHints || [])],
      details,
    }
  })
