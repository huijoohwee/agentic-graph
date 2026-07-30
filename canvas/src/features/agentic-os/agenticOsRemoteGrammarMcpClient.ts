import { readEnvString } from '@/lib/config.env'
import { isWorkspaceRepoLocalRunReadyBootstrap } from '@/features/workspace-fs/workspaceRunReadyDemos'
import {
  AGENTIC_CANVAS_OS_DOCS_CONTROL_PLANE_PATH,
  AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME,
} from '../../../../mcp/agentic-canvas-os-docs-contract.mjs'
import {
  extractAgenticOsRemoteGrammarMcpPayload,
  parseAgenticOsRemoteGrammarMcpResponse,
} from './agenticOsRemoteGrammarMcpPayload'

export type AgenticOsRemoteGrammarCatalogEntry = {
  token: string
  kind?: string
  label?: string
  summary?: string
  intent?: string
  sourcePath?: string
  sourceUrl?: string
  fileName?: string
  keywords?: string[]
  mcpTool?: string
  mcpTools?: string[]
  semantics?: string[]
  bindings?: string[]
}

export type AgenticOsRemoteGrammarPayload = {
  ok?: boolean
  catalog?: AgenticOsRemoteGrammarCatalogEntry[]
  sourceRevision?: string
  catalogDigest?: string
  routingSchema?: string
  routingDigest?: string
  counts?: Partial<Record<'command' | 'semantic' | 'binding', number>>
  liveAgentProviderProof?: unknown
  progressiveAgentsReadiness?: unknown
}

type AgenticOsRemoteGrammarClientOptions = {
  endpoint?: string
  fetchImpl?: typeof fetch
}

const DEFAULT_KNOWGRPH_AGENT_READY_BASE_URL = 'https://airvio.co/knowgrph'
const normalizeString = (value: unknown): string => String(value || '').trim()
const isLocalhostHost = (value: unknown): boolean => {
  const normalized = normalizeString(value).toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '0.0.0.0'
}
const isBareLocalhostOrigin = (value: unknown): boolean => {
  const origin = normalizeString(value)
  if (!origin) return false
  try {
    const parsed = new URL(origin)
    return isLocalhostHost(parsed.hostname) && !normalizeString(parsed.port)
  } catch {
    return false
  }
}
const readKnowgrphAgentReadyBaseUrl = (): string => {
  const configuredBaseUrl = normalizeString(readEnvString('VITE_KNOWGRPH_AGENT_READY_BASE_URL', ''))
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/+$/, '')
  if (typeof window !== 'undefined') {
    const currentOrigin = normalizeString(window.location?.origin)
    if (currentOrigin && (isWorkspaceRepoLocalRunReadyBootstrap() || !isBareLocalhostOrigin(currentOrigin))) {
      return new URL('/knowgrph/', currentOrigin.endsWith('/') ? currentOrigin : `${currentOrigin}/`)
        .toString()
        .replace(/\/+$/, '')
    }
  }
  return DEFAULT_KNOWGRPH_AGENT_READY_BASE_URL
}
const resolveControlPlaneEndpoint = (endpoint?: string): string => {
  const explicitEndpoint = normalizeString(endpoint)
  if (explicitEndpoint) return explicitEndpoint
  return `${readKnowgrphAgentReadyBaseUrl()}${AGENTIC_CANVAS_OS_DOCS_CONTROL_PLANE_PATH.replace(/^\/knowgrph/, '')}`
}

export function createAgenticOsRemoteGrammarClient(options: AgenticOsRemoteGrammarClientOptions = {}) {
  let nextId = 1
  let mcpSessionId = ''
  let sessionPromise: Promise<string> | null = null
  const postRpc = async (
    body: Record<string, unknown>,
    { signal, sessionId = '' }: { signal?: AbortSignal, sessionId?: string } = {},
  ): Promise<{ rpc: Record<string, unknown>, sessionId: string }> => {
    const response = await (options.fetchImpl || globalThis.fetch)(resolveControlPlaneEndpoint(options.endpoint), {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      },
      body: JSON.stringify(body),
      signal,
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`Agentic OS remote grammar responded ${response.status}`)
    const rpc = parseAgenticOsRemoteGrammarMcpResponse(text)
    if (!rpc) throw new Error('Agentic OS remote grammar returned an unreadable MCP payload')
    return { rpc, sessionId: response.headers.get('mcp-session-id') || sessionId }
  }
  const ensureSession = async ({ signal }: { signal?: AbortSignal } = {}): Promise<string> => {
    if (mcpSessionId) return mcpSessionId
    if (!sessionPromise) {
      sessionPromise = (async () => {
        const initialized = await postRpc({
          jsonrpc: '2.0',
          id: nextId++,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'knowgrph-canvas', version: '0.1.0' },
          },
        }, { signal })
        if (initialized.rpc.error) {
          throw new Error(String((initialized.rpc.error as { message?: unknown }).message || 'Agentic OS remote grammar initialize failed'))
        }
        if (!initialized.sessionId) throw new Error('Agentic OS remote grammar initialize missing mcp-session-id')
        mcpSessionId = initialized.sessionId
        return mcpSessionId
      })().finally(() => {
        sessionPromise = null
      })
    }
    return sessionPromise
  }
  const searchCatalogSnapshot = async (query: string, { signal }: { signal?: AbortSignal } = {}) => {
    const normalizedQuery = normalizeString(query)
    if (!normalizedQuery) return {
      catalog: [],
      sourceRevision: '',
      catalogDigest: '',
      routingSchema: '',
      routingDigest: '',
      counts: undefined,
      liveAgentProviderProof: null,
      progressiveAgentsReadiness: null,
    }
    const sessionId = await ensureSession({ signal })
    const invoked = await postRpc({
      jsonrpc: '2.0',
      id: nextId++,
      method: 'tools/call',
      params: {
        name: AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME,
        arguments: { query: normalizedQuery, limit: 500 },
      },
    }, { signal, sessionId })
    if (invoked.rpc.error) {
      throw new Error(String((invoked.rpc.error as { message?: unknown }).message || 'Agentic OS remote grammar tools/call failed'))
    }
    const payload = extractAgenticOsRemoteGrammarMcpPayload<AgenticOsRemoteGrammarPayload>(invoked.rpc)
    return {
      catalog: Array.isArray(payload.catalog) ? payload.catalog : [],
      sourceRevision: normalizeString(payload.sourceRevision),
      catalogDigest: normalizeString(payload.catalogDigest),
      routingSchema: normalizeString(payload.routingSchema),
      routingDigest: normalizeString(payload.routingDigest),
      counts: payload.counts,
      liveAgentProviderProof: payload.liveAgentProviderProof,
      progressiveAgentsReadiness: payload.progressiveAgentsReadiness,
    }
  }
  return {
    searchCatalogSnapshot,
    async searchCatalog(query: string, options: { signal?: AbortSignal } = {}): Promise<AgenticOsRemoteGrammarCatalogEntry[]> {
      return (await searchCatalogSnapshot(query, options)).catalog
    },
  }
}
