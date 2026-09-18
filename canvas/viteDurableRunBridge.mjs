import path from 'node:path'
import { createRequire } from 'node:module'
import { readStableBoundedFile } from '../mcp/bounded-file-reader.js'

const root = '/api/agent-swarm/'
const require = createRequire(import.meta.url)
const operations = new Set(require('agentic-os/agents/invocation').RUN_OPERATIONS)
const readOnly = new Set(require('agentic-os/catalog/invocation.json').entries
  .filter(entry => entry.action === 'run' && entry.semantic === 'read-only').map(entry => entry.argv[0]))
operations.add('workflow-trace'); operations.add('workspace-source')
readOnly.add('workflow-trace'); readOnly.add('workspace-source')
const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const json = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  response.end(JSON.stringify(body))
}

async function configuration(filePath) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw Error('host_configuration_required')
  const { content } = await readStableBoundedFile({ filePath, containingDirectory: path.dirname(filePath),
    minimumBytes: 1, maximumBytes: 8192, requirePrivate: true })
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content))
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join() !== 'authorization,endpoint'
    || typeof value.authorization !== 'string' || !/^Bearer [A-Za-z0-9._~+-]{32,4096}$/u.test(value.authorization)) throw Error('host_configuration_invalid')
  const url = new URL(value.endpoint)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port
    || url.pathname !== root || url.username || url.password || url.search || url.hash) throw Error('host_configuration_invalid')
  return value
}

async function body(request, signal) {
  const chunks = []; let size = 0
  const abort = () => request.destroy()
  signal.addEventListener('abort', abort, { once: true })
  try {
    signal.throwIfAborted()
    for await (const chunk of request) {
      size += chunk.length
      if (size > 200000) throw Error('request_too_large')
      chunks.push(chunk)
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
  } finally { signal.removeEventListener('abort', abort) }
}

/** Optional local browser ingress. The remote runtime still owns its principal,
 * authorization, queue and state. Importing this plugin performs no host I/O. */
export function createDurableRunBridgePlugin({ env = process.env, repoRoot = process.cwd() } = {}) {
  let active = 0
  return { name: 'agentic-graph-durable-run-bridge', apply: 'serve', configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const address = server.httpServer?.address()
      const own = typeof address === 'object' && address ? new URL('http://127.0.0.1:' + address.port) : null
      let url, origin
      try { url = new URL(request.url, own ?? 'http://127.0.0.1'); origin = new URL('http://' + request.headers.host) }
      catch { return next() }
      if (!url.pathname.startsWith(root)) return next()
      if (!own || !loopback.has(request.socket.remoteAddress) || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
        || origin.port !== own.port || request.headers.origin !== origin.origin
        || request.headers['sec-fetch-site'] === 'cross-site' || url.origin !== own.origin) return json(response, 403, { code: 'origin_forbidden' })
      const operation = url.pathname.slice(root.length)
      if (!operations.has(operation) || url.search) return json(response, 404, { code: 'run_route_not_found' })
      if (request.method !== 'POST') return json(response, 405, { code: 'post_required' })
      if (request.headers['content-encoding'] !== undefined
        || request.headers['content-type']?.split(';')[0].trim() !== 'application/json') return json(response, 415, { code: 'json_required' })
      if (request.headers['content-length'] && (!/^\d+$/u.test(request.headers['content-length'])
        || Number(request.headers['content-length']) > 200000)) return json(response, 413, { code: 'request_too_large' })
      if (active >= 4) return json(response, 429, { code: 'run_request_capacity' })
      active++
      let stage = 'configuration'
      const controller = new AbortController()
      const disconnect = () => { if (!response.writableEnded) controller.abort() }
      response.once('close', disconnect)
      try {
        let input
        try { input = await body(request, AbortSignal.timeout(5000)) }
        catch { return json(response, 400, { code: 'invalid_run_input' }) }
        if (operation === 'workspace-source') {
          const { readWorkspaceObservationSource } = require('./viteWorkspaceObservationBridge.mjs')
          try {
            const source = await readWorkspaceObservationSource(repoRoot, input)
            return json(response, source ? 200 : 404, source ?? { code: 'workspace_source_unselected' })
          } catch { return json(response, 422, { code: 'workspace_source_unavailable' }) }
        }
        if (operation === 'workflow-trace') {
          stage = 'workflow-archive'
          // Native request-time loading survives Vite's configuration runner lifecycle.
          const { readWorkflowArchiveRequest } = require('./viteWorkflowArchiveBridge.mjs')
          try {
            const frame = await readWorkflowArchiveRequest(input, undefined, repoRoot)
            if (controller.signal.aborted) return
            response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
            return response.end(frame)
          } catch { return json(response, 422, { code: 'workflow_archive_unavailable', message: 'The selected immutable manifest or a referenced page is missing, invalid, or outside this local workspace.' }) }
        }
        let config
        try { config = await configuration(env.AGENTIC_OS_DURABLE_RUN_HOST_CONFIG) }
        catch { return json(response, 503, { code: 'host_configuration_required' }) }
        stage = 'load-client'
        const { createAgentRunClient, validateRunInput } = require('agentic-os/agents/invocation')
        try { validateRunInput(operation, input) }
        catch { return json(response, 400, { code: 'invalid_run_input' }) }
        const client = createAgentRunClient({ endpoint: config.endpoint, getHeaders: () => ({ authorization: config.authorization }) })
        stage = 'dispatch'
        const result = await client.invoke(operation, input, { signal: controller.signal })
        if (controller.signal.aborted) return
        if (['query', 'trace'].includes(operation) && result.status !== 'blocked'
          && request.headers.accept?.includes('text/event-stream')) {
          // The existing native query owns each snapshot; this ingress only frames it.
          const frame = 'data: ' + JSON.stringify(result) + '\n\ndata: [DONE]\n\n'
          if (Buffer.byteLength(frame) > 262144) throw Error('observation_frame_too_large')
          response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store',
            'x-content-type-options': 'nosniff' })
          return response.end(frame)
        }
        return json(response, result.httpStatus ?? (result.status === 'blocked' ? 409
          : ['completed', 'canceled'].includes(result.status) ? 200 : 202), result)
      } catch (error) {
        if (controller.signal.aborted) return
        const name = ['TypeError', 'RangeError', 'ReferenceError', 'SyntaxError'].includes(error?.name) ? error.name : 'Error'
        server.config?.logger?.warn('[durable-run-bridge] ' + stage + ': ' + name)
        return json(response, 502, { code: 'run_host_unavailable', ...(!readOnly.has(operation) ? { writeResultUnknown: true } : {}) })
      } finally { response.off('close', disconnect); active-- }
    })
  } }
}
