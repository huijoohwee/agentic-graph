import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import {
  AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME,
} from '../mcp/agentic-canvas-os-docs-contract.mjs'
import { runAgenticCanvasOsDocsInvokeTool } from '../mcp/agentic-canvas-os-docs-runtime.js'

const MCP_PATH = '/agenticgraph/control-plane/mcp'
const HEALTH_PATH = '/health'
const MAX_REQUEST_BYTES = 64 * 1024
const MAX_SESSIONS = 32
const SESSION_TTL_MS = 5 * 60 * 1000

const corsHeaders = {
  'access-control-allow-headers': 'content-type, mcp-session-id',
  'access-control-allow-methods': 'OPTIONS, POST',
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'mcp-session-id',
  'cache-control': 'no-store',
}

const writeJson = (response, statusCode, body, headers = {}) => {
  response.writeHead(statusCode, {
    ...corsHeaders,
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  })
  response.end(JSON.stringify(body))
}

const writeRpcError = (response, id, code, message, headers = {}) => writeJson(response, 200, {
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message },
}, headers)

const readJsonBody = async request => {
  const chunks = []
  let byteLength = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    byteLength += bytes.length
    if (byteLength > MAX_REQUEST_BYTES) {
      const error = new Error('request body exceeds 64 KiB')
      error.statusCode = 413
      throw error
    }
    chunks.push(bytes)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    const error = new Error('request body must be JSON')
    error.statusCode = 400
    throw error
  }
}

const normalizePort = value => {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('local Agentic Canvas OS MCP port must be an integer from 1 through 65535')
  }
  return port
}

const parsePort = argv => {
  const index = argv.indexOf('--port')
  if (index === -1) return 8791
  return normalizePort(argv[index + 1])
}

export const createLocalAgenticCanvasOsMcpServer = ({
  invoke = args => runAgenticCanvasOsDocsInvokeTool(args),
  now = () => Date.now(),
} = {}) => {
  const sessions = new Map()

  const pruneSessions = () => {
    const cutoff = now()
    for (const [sessionId, expiresAt] of sessions) {
      if (expiresAt <= cutoff) sessions.delete(sessionId)
    }
    while (sessions.size >= MAX_SESSIONS) {
      const oldest = sessions.keys().next().value
      if (!oldest) break
      sessions.delete(oldest)
    }
  }

  const initialize = (response, body) => {
    pruneSessions()
    const sessionId = randomUUID()
    sessions.set(sessionId, now() + SESSION_TTL_MS)
    writeJson(response, 200, {
      jsonrpc: '2.0',
      id: body.id ?? null,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'agenticgraph-local-agentic-canvas-os-docs', version: '1' },
      },
    }, { 'mcp-session-id': sessionId })
  }

  const callTool = async (request, response, body) => {
    pruneSessions()
    const sessionId = String(request.headers['mcp-session-id'] || '').trim()
    if (!sessionId || !sessions.has(sessionId)) {
      writeRpcError(response, body.id, -32001, 'unknown or expired MCP session')
      return
    }
    sessions.set(sessionId, now() + SESSION_TTL_MS)
    const params = body.params && typeof body.params === 'object' ? body.params : {}
    if (params.name !== AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME) {
      writeRpcError(response, body.id, -32601, 'unsupported local MCP tool', { 'mcp-session-id': sessionId })
      return
    }
    const argumentsValue = params.arguments && typeof params.arguments === 'object' ? params.arguments : {}
    let payload
    try {
      payload = await invoke(argumentsValue)
    } catch {
      writeRpcError(response, body.id, -32603, 'Agentic Canvas OS docs invocation failed', { 'mcp-session-id': sessionId })
      return
    }
    writeJson(response, 200, {
      jsonrpc: '2.0',
      id: body.id ?? null,
      result: {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        structuredContent: payload,
        isError: payload?.ok !== true,
      },
    }, { 'mcp-session-id': sessionId })
  }

  return createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1')
    if (request.method === 'OPTIONS') {
      response.writeHead(204, corsHeaders)
      response.end()
      return
    }
    if (request.method === 'GET' && requestUrl.pathname === HEALTH_PATH) {
      writeJson(response, 200, {
        schema: 'agenticgraph-local-agentic-canvas-os-mcp-health/v1',
        status: 'ready',
      })
      return
    }
    if (request.method !== 'POST' || requestUrl.pathname !== MCP_PATH) {
      writeJson(response, 404, { error: 'not found' })
      return
    }
    let body
    try {
      body = await readJsonBody(request)
    } catch (error) {
      writeJson(response, error?.statusCode || 400, { error: error.message })
      return
    }
    if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      writeRpcError(response, body?.id, -32600, 'invalid JSON-RPC request')
      return
    }
    if (body.method === 'initialize') {
      initialize(response, body)
      return
    }
    if (body.method === 'tools/call') {
      await callTool(request, response, body)
      return
    }
    writeRpcError(response, body.id, -32601, 'unsupported local MCP method')
  })
}

const currentFile = fileURLToPath(import.meta.url)
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedFile === currentFile) {
  const port = parsePort(process.argv.slice(2))
  const server = createLocalAgenticCanvasOsMcpServer()
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`[agenticgraph] local Agentic Canvas OS MCP ready on http://127.0.0.1:${port}${MCP_PATH}\n`)
  })
}
