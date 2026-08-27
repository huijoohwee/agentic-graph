export const OPENAI_MCP_DOC_AREA = 'OpenAI MCP Server Configuration'

export const OPENAI_MCP_DOCS_URL = 'https://developers.openai.com/api/docs/mcp'

export const OPENAI_MCP_CHATGPT_CONNECT_URL = 'https://developers.openai.com/apps-sdk/build/connect-from-chatgpt'

export const OPENAI_MCP_DEFAULT_SERVER_LABEL = 'agenticgraph_docs'

export const OPENAI_MCP_DEFAULT_SERVER_URL = 'https://your-remote-mcp-server.example.com/sse/'

export const OPENAI_MCP_TRANSPORTS = ['sse', 'streaming_http'] as const

export const OPENAI_MCP_DEFAULT_TRANSPORT = 'sse'

export const OPENAI_MCP_DEFAULT_ALLOWED_TOOLS = ['search', 'fetch'] as const

export const OPENAI_MCP_DEFAULT_ALLOWED_TOOLS_JSON = JSON.stringify(OPENAI_MCP_DEFAULT_ALLOWED_TOOLS, null, 2)

export const OPENAI_MCP_REQUIRE_APPROVAL_MODES = ['never'] as const

export const OPENAI_MCP_DEFAULT_REQUIRE_APPROVAL = 'never'

export const OPENAI_MCP_AUTH_MODES = [
  'oauth_cimd',
  'oauth_dynamic_client_registration',
  'oauth_static_credentials',
  'no_auth',
  'mixed_auth',
] as const

export const OPENAI_MCP_DEFAULT_AUTH_MODE = 'oauth_cimd'

export const OPENAI_MCP_DEFAULT_RESPONSES_MODEL = 'o4-mini-deep-research'

export const OPENAI_MCP_DEFAULT_API_KEY_ENV = 'OPENAI_API_KEY'

export const OPENAI_MCP_DEFAULT_VECTOR_STORE_ENV = 'VECTOR_STORE_ID'

export const OPENAI_MCP_DEFAULT_SERVER_PORT = 8000

export const OPENAI_MCP_DEFAULT_REQUIRE_TOOL_REVIEW = true

const OPENAI_MCP_ALLOWED_TOOL_SET = new Set<string>(OPENAI_MCP_DEFAULT_ALLOWED_TOOLS)

export const normalizeOpenAiMcpAllowedTools = (tools: readonly string[]): string[] => {
  const unique: string[] = []
  for (const tool of tools) {
    const normalized = String(tool || '').trim()
    if (!OPENAI_MCP_ALLOWED_TOOL_SET.has(normalized)) continue
    if (!unique.includes(normalized)) unique.push(normalized)
  }
  return unique.length > 0 ? unique : [...OPENAI_MCP_DEFAULT_ALLOWED_TOOLS]
}
