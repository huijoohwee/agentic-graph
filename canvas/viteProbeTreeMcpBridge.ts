import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import {
  PROBE_TREE_MCP_BRIDGE_PATH,
  normalizeProbeTreeMcpBridgeRequest,
  type ProbeTreeMcpInvocationResolution,
} from './src/features/agent-ready/probeTreeMcpBridgeContract'
import {
  AGENTIC_OS_DOCS_MCP_BRIDGE_PATH,
  AGENTIC_OS_DOCS_MCP_TOOL_NAME,
  normalizeAgenticOsDocsMcpBridgeRequest,
} from './src/features/agent-ready/agenticOsDocsMcpBridgeContract'
import { AGENTICGRAPH_PROBE_TREE_TOOL_NAMES } from './src/features/agent-ready/probeTreeContract.mjs'
import { AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA } from '../mcp/agentic-canvas-os-docs-contract.mjs'

const MAX_REQUEST_BYTES = 32 * 1024
export const PROBE_TREE_MCP_BRIDGE_TIMEOUT_MS = 20_000
export const PROBE_TREE_MCP_INVOCATION_RESOLUTION_TIMEOUT_MS = 3_000
export const AGENTIC_OS_DOCS_MCP_BRIDGE_TIMEOUT_MS = 8_000
const DOCS_TOOL_NAME = AGENTIC_OS_DOCS_MCP_TOOL_NAME

export const createProbeTreeMcpRequestOptions = (
  deadlineAt: number,
  now = Date.now(),
  timeoutCap = Number.POSITIVE_INFINITY,
  signal?: AbortSignal,
): { timeout: number; maxTotalTimeout: number; signal?: AbortSignal } => {
  const remainingMs = Math.floor(deadlineAt - now)
  if (remainingMs <= 0) throw new Error('Probe-Tree MCP bridge exceeded its 20 second deadline.')
  const timeout = Math.max(1, Math.min(remainingMs, timeoutCap))
  return { timeout, maxTotalTimeout: timeout, ...(signal ? { signal } : {}) }
}

const writeJson = (response: ServerResponse, statusCode: number, payload: unknown): void => {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(payload))
}

const readRequestJson = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const rawChunk of request) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk)
    size += chunk.byteLength
    if (size > MAX_REQUEST_BYTES) throw new Error('Probe-Tree MCP request exceeds 32 KiB.')
    chunks.push(chunk)
  }
  if (chunks.length === 0) throw new Error('Probe-Tree MCP request body is empty.')
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

const buildChildEnv = (repoRoot: string): Record<string, string> => {
  const keys = [
    'PATH',
    'HOME',
    'TMPDIR',
    'NODE_ENV',
    'AGENTICGRAPH_AGENTIC_CANVAS_OS_DOCS_ROOT',
    'AGENTICGRAPH_AGENTIC_CANVAS_OS_DOCS_REVISION',
    'AGENTICGRAPH_PROBE_TREE_MODEL',
    'AGENTICGRAPH_PROBE_TREE_MODEL_PROVIDER',
    'AGENTICGRAPH_PROBE_TREE_MODEL_URL',
    'AGENTICGRAPH_PROBE_TREE_MODEL_ALLOW_REMOTE',
    'AGENTICGRAPH_PROBE_TREE_MODEL_TIMEOUT_MS',
  ]
  const env: Record<string, string> = { AGENTICGRAPH_ROOT: repoRoot }
  for (const key of keys) {
    const value = process.env[key]
    if (typeof value === 'string') env[key] = value
  }
  return env
}

const readToolError = (result: Record<string, unknown>): string => {
  const content = Array.isArray(result.content) ? result.content : []
  const text = content
    .map(entry => entry && typeof entry === 'object' && 'text' in entry ? String((entry as { text?: unknown }).text || '') : '')
    .filter(Boolean)
    .join(' ')
  return text.replace(/^Error:\s*/i, '').trim().slice(0, 320)
}

const representativeInvocationTokens = (tokens: readonly string[]): string[] => {
  const bySigil = new Map<string, string>()
  for (const token of tokens) {
    const sigil = token[0]
    if ((sigil === '/' || sigil === '@' || sigil === '#') && !bySigil.has(sigil)) bySigil.set(sigil, token)
  }
  return ['/', '@', '#'].map(sigil => bySigil.get(sigil) || '').filter(Boolean)
}

type AgenticOsDocsMcpInvocationWithProof = ProbeTreeMcpInvocationResolution & {
  sourceRevision: string
  catalogDigest: string
  routingSchema: string
  routingDigest: string
}

const resolveInvocationToken = async (
  client: Client,
  token: string,
  requestOptions: { timeout: number; maxTotalTimeout: number; signal?: AbortSignal },
): Promise<AgenticOsDocsMcpInvocationWithProof> => {
  const result = await client.callTool({
    name: DOCS_TOOL_NAME,
    arguments: { token, includeContent: false, limit: 1 },
  }, undefined, requestOptions) as Record<string, unknown>
  const structured = result.structuredContent && typeof result.structuredContent === 'object'
    ? result.structuredContent as Record<string, unknown>
    : {}
  const invocation = structured.invocation && typeof structured.invocation === 'object'
    ? structured.invocation as Record<string, unknown>
    : {}
  return {
    token,
    ok: result.isError !== true && structured.ok !== false,
    kind: String(invocation.kind || token[0] || ''),
    label: String(invocation.label || invocation.title || '').slice(0, 160),
    summary: String(invocation.summary || '').slice(0, 320),
    sourcePath: String(invocation.sourcePath || invocation.source_path || '').slice(0, 320),
    sourceRevision: String(structured.sourceRevision || ''),
    catalogDigest: String(structured.catalogDigest || ''),
    routingSchema: String(structured.routingSchema || ''),
    routingDigest: String(structured.routingDigest || ''),
    ...(result.isError === true || structured.ok === false ? { error: readToolError(result) || 'Invocation token did not resolve.' } : {}),
  }
}

export const resolveProbeTreeMcpInvocationTokens = async (args: {
  client: Client
  tokens: readonly string[]
  requestOptions: { timeout: number; maxTotalTimeout: number; signal?: AbortSignal }
}): Promise<ProbeTreeMcpInvocationResolution[]> => Promise.all(
  representativeInvocationTokens(args.tokens).map(async token => {
    try {
      return await resolveInvocationToken(args.client, token, args.requestOptions)
    } catch (error) {
      return {
        token,
        ok: false,
        kind: token[0] || '',
        error: (error instanceof Error ? error.message : String(error)).slice(0, 320),
      }
    }
  }),
)

export const resolveAgenticOsDocsMcpInvocationTokens = async (args: {
  client: Client
  tokens: readonly string[]
  requestOptions: { timeout: number; maxTotalTimeout: number; signal?: AbortSignal }
}): Promise<AgenticOsDocsMcpInvocationWithProof[]> => Promise.all(
  args.tokens.map(async token => {
    try {
      return await resolveInvocationToken(args.client, token, args.requestOptions)
    } catch (error) {
      return {
        token,
        ok: false,
        kind: token[0] || '',
        error: (error instanceof Error ? error.message : String(error)).slice(0, 320),
        sourceRevision: '',
        catalogDigest: '',
        routingSchema: '',
        routingDigest: '',
      }
    }
  }),
)

export function createProbeTreeMcpBridgePlugin({ repoRoot }: { repoRoot: string }): Plugin {
  return {
    name: 'agenticgraph-probe-tree-mcp-bridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(AGENTIC_OS_DOCS_MCP_BRIDGE_PATH, async (request, response) => {
        if (request.method !== 'POST') {
          writeJson(response, 405, { ok: false, error: 'Method not allowed.' })
          return
        }
        const fetchSite = String(request.headers['sec-fetch-site'] || '').trim().toLowerCase()
        if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite)) {
          writeJson(response, 403, { ok: false, error: 'Cross-site Agentic OS docs MCP requests are forbidden.' })
          return
        }
        if (!String(request.headers['content-type'] || '').toLowerCase().includes('application/json')) {
          writeJson(response, 415, { ok: false, error: 'Content-Type must be application/json.' })
          return
        }

        let client: Client | null = null
        const deadlineSignal = AbortSignal.timeout(AGENTIC_OS_DOCS_MCP_BRIDGE_TIMEOUT_MS)
        try {
          const parsed = normalizeAgenticOsDocsMcpBridgeRequest(await readRequestJson(request))
          if (!parsed) {
            writeJson(response, 400, { ok: false, error: 'Agentic OS docs MCP request requires invocation tokens.' })
            return
          }
          client = new Client({ name: 'agenticgraph-canvas-agentic-os-docs', version: '0.1.0' })
          const transport = new StdioClientTransport({
            command: process.execPath,
            args: [path.join(repoRoot, 'mcp', 'server.js')],
            cwd: repoRoot,
            env: buildChildEnv(repoRoot),
            stderr: 'pipe',
          })
          const requestOptions = {
            timeout: AGENTIC_OS_DOCS_MCP_BRIDGE_TIMEOUT_MS,
            maxTotalTimeout: AGENTIC_OS_DOCS_MCP_BRIDGE_TIMEOUT_MS,
            signal: deadlineSignal,
          }
          await client.connect(transport, requestOptions)
          const invocations = await resolveAgenticOsDocsMcpInvocationTokens({
            client,
            tokens: parsed.invocationTokens,
            requestOptions,
          })
          const proof = {
            sourceRevision: String(invocations[0]?.sourceRevision || ''),
            catalogDigest: String(invocations[0]?.catalogDigest || ''),
            routingSchema: String(invocations[0]?.routingSchema || ''),
            routingDigest: String(invocations[0]?.routingDigest || ''),
          }
          if (
            !/^[0-9a-f]{40}$/.test(proof.sourceRevision)
            || !/^[0-9a-f]{64}$/.test(proof.catalogDigest)
            || proof.routingSchema !== AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA
            || !/^[0-9a-f]{64}$/.test(proof.routingDigest)
            || invocations.some(invocation => (
              invocation.sourceRevision !== proof.sourceRevision
              || invocation.catalogDigest !== proof.catalogDigest
              || invocation.routingSchema !== proof.routingSchema
              || invocation.routingDigest !== proof.routingDigest
            ))
          ) {
            throw new Error('Agentic OS docs MCP invocation results do not share one verified routing proof.')
          }
          if (parsed.expectedProof && (
            parsed.expectedProof.sourceRevision !== proof.sourceRevision
            || parsed.expectedProof.catalogDigest !== proof.catalogDigest
            || parsed.expectedProof.routingSchema !== proof.routingSchema
            || parsed.expectedProof.routingDigest !== proof.routingDigest
          )) {
            throw new Error('Agentic OS docs MCP invocation routing proof changed during resolution.')
          }
          writeJson(response, 200, {
            ok: true,
            tool: AGENTIC_OS_DOCS_MCP_TOOL_NAME,
            mcpInvoked: true,
            ...proof,
            invocations: invocations.map(({
              sourceRevision: _sourceRevision,
              catalogDigest: _catalogDigest,
              routingSchema: _routingSchema,
              routingDigest: _routingDigest,
              ...invocation
            }) => invocation),
          })
        } catch (error) {
          writeJson(response, 502, {
            ok: false,
            error: (deadlineSignal.aborted
              ? 'Agentic OS docs MCP bridge exceeded its 8 second deadline.'
              : error instanceof Error ? error.message : String(error || 'Agentic OS docs MCP bridge failed.')
            ).slice(0, 640),
          })
        } finally {
          await client?.close().catch(() => undefined)
        }
      })
      server.middlewares.use(PROBE_TREE_MCP_BRIDGE_PATH, async (request, response) => {
        if (request.method !== 'POST') {
          writeJson(response, 405, { ok: false, error: 'Method not allowed.' })
          return
        }
        const fetchSite = String(request.headers['sec-fetch-site'] || '').trim().toLowerCase()
        if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite)) {
          writeJson(response, 403, { ok: false, error: 'Cross-site Probe-Tree MCP requests are forbidden.' })
          return
        }
        if (!String(request.headers['content-type'] || '').toLowerCase().includes('application/json')) {
          writeJson(response, 415, { ok: false, error: 'Content-Type must be application/json.' })
          return
        }

        let client: Client | null = null
        let deadlineSignal: AbortSignal | null = null
        try {
          const parsed = normalizeProbeTreeMcpBridgeRequest(await readRequestJson(request))
          if (!parsed) {
            writeJson(response, 400, { ok: false, error: 'Probe-Tree MCP request is incomplete.' })
            return
          }
          const deadlineAt = Date.now() + PROBE_TREE_MCP_BRIDGE_TIMEOUT_MS
          deadlineSignal = AbortSignal.timeout(PROBE_TREE_MCP_BRIDGE_TIMEOUT_MS)
          client = new Client({ name: 'agenticgraph-canvas-probe-tree', version: '0.1.0' })
          const transport = new StdioClientTransport({
            command: process.execPath,
            args: [path.join(repoRoot, 'mcp', 'server.js')],
            cwd: repoRoot,
            env: buildChildEnv(repoRoot),
            stderr: 'pipe',
          })
          await client.connect(transport, createProbeTreeMcpRequestOptions(deadlineAt, Date.now(), Number.POSITIVE_INFINITY, deadlineSignal))

          const invocationResolutions = await resolveProbeTreeMcpInvocationTokens({
            client,
            tokens: parsed.invocationTokens,
            requestOptions: createProbeTreeMcpRequestOptions(
              deadlineAt,
              Date.now(),
              PROBE_TREE_MCP_INVOCATION_RESOLUTION_TIMEOUT_MS,
              deadlineSignal,
            ),
          })

          const result = await client.callTool({
            name: AGENTICGRAPH_PROBE_TREE_TOOL_NAMES.generate,
            arguments: {
              thread_root_id: parsed.threadRootId,
              current_node_id: parsed.currentNodeId,
              context_text: parsed.contextText,
              k: parsed.optionCount,
              recall_top_k: parsed.recallTopK,
              token_budget: parsed.tokenBudget,
              probe_tree_depth: parsed.probeTreeDepth,
            },
          }, undefined, createProbeTreeMcpRequestOptions(
            deadlineAt,
            Date.now(),
            Number.POSITIVE_INFINITY,
            deadlineSignal,
          )) as Record<string, unknown>
          if (result.isError === true || !result.structuredContent) {
            throw new Error(readToolError(result) || 'agenticgraph.probe.generate returned no structured content.')
          }
          writeJson(response, 200, {
            ok: true,
            tool: AGENTICGRAPH_PROBE_TREE_TOOL_NAMES.generate,
            mcpInvoked: true,
            invocationResolutions,
            result,
          })
        } catch (error) {
          writeJson(response, 502, {
            ok: false,
            error: (deadlineSignal?.aborted
              ? 'Probe-Tree MCP bridge exceeded its 20 second deadline.'
              : error instanceof Error ? error.message : String(error || 'Probe-Tree MCP bridge failed.')
            ).slice(0, 640),
          })
        } finally {
          await client?.close().catch(() => undefined)
        }
      })
    },
  }
}
