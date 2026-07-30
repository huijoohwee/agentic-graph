import { createHash, randomUUID, type Hash } from 'node:crypto'
import fs from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type { Plugin } from 'vite'

import {
  KNOWLEDGE_GRAPH_HOST_CAPABILITY_SCHEMA,
  KNOWLEDGE_GRAPH_HOST_ROUTE,
} from './src/features/knowledge-graph/knowledgeGraphHostAdapter'
import { SOURCE_PARSER_STRUCTURAL_INCLUDE_PATTERNS } from '../mcp/knowledge-graph/source-parser-registry.mjs'

const INGEST_TOOL_NAME = 'knowgrph.knowledge_graph.ingest'
const MAX_CHUNK_BYTES = 4 * 1024 * 1024
const MAX_FILES = 250_000
const MAX_FILE_BYTES = 100_000_000
const MAX_TOTAL_BYTES = 4_000_000_000
const MAX_JSON_BYTES = 16 * 1024
const MAX_PROJECTION_BYTES = 2 * 1024 * 1024
const MAX_PROJECTION_NODES = 2_000
const MAX_PROJECTION_EDGES = 5_000
const GRANT_TTL_MS = 30 * 60 * 1000
const GRANT_ID = /^[0-9a-f-]{36}$/

type RuntimeIngest = (context: {
  args: Record<string, unknown>
  rootDir: string
  env: NodeJS.ProcessEnv
  abortSignal: AbortSignal
}) => Promise<unknown>

type CompletedFile = {
  digest: string
  size: number
}

type ActiveFile = {
  hash: Hash
  size: number
}

type UploadGrantState = {
  id: string
  root: string
  createdAt: number
  busy: boolean
  files: Map<string, CompletedFile>
  activeFiles: Map<string, ActiveFile>
  totalBytes: number
}

type BridgeOptions = {
  repoRoot: string
  hostDataRoot?: string
  env?: NodeJS.ProcessEnv
  now?: () => number
  runIngest?: RuntimeIngest
}

class HostBridgeError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.name = 'HostBridgeError'
    this.code = code
    this.status = status
  }
}

const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex')

function sendJson(response: ServerResponse, status: number, value: unknown) {
  const body = JSON.stringify(value)
  response.statusCode = status
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Content-Length', Buffer.byteLength(body))
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.end(body)
}

function sendFailure(response: ServerResponse, error: unknown) {
  const known = error instanceof HostBridgeError
    ? error
    : new HostBridgeError('host-internal-error', 'The local knowledge graph host request failed.', 500)
  sendJson(response, known.status, {
    ok: false,
    error: { code: known.code, message: known.message },
  })
}

function assertSameOrigin(request: IncomingMessage) {
  const origin = String(request.headers.origin || '').trim()
  if (!origin) return
  try {
    const originUrl = new URL(origin)
    if (originUrl.host !== String(request.headers.host || '')) throw new Error('host mismatch')
  } catch {
    throw new HostBridgeError('cross-origin-forbidden', 'Knowledge graph host access is same-origin only.', 403)
  }
}

async function readBody(request: IncomingMessage, limit: number): Promise<Uint8Array> {
  const declared = Number(request.headers['content-length'] || 0)
  if (Number.isFinite(declared) && declared > limit) {
    throw new HostBridgeError('request-too-large', 'The knowledge graph host request exceeded its byte limit.', 413)
  }
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunkRaw of request) {
    const chunk = Buffer.isBuffer(chunkRaw) ? chunkRaw : Buffer.from(chunkRaw)
    bytes += chunk.byteLength
    if (bytes > limit) {
      throw new HostBridgeError('request-too-large', 'The knowledge graph host request exceeded its byte limit.', 413)
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, bytes)
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readBody(request, MAX_JSON_BYTES)
  if (!body.byteLength) return {}
  try {
    const parsed = JSON.parse(Buffer.from(body).toString('utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('object required')
    return parsed
  } catch {
    throw new HostBridgeError('invalid-json', 'The knowledge graph host requires a JSON object body.')
  }
}

function normalizeRelativePath(value: string): string {
  const normalized = String(value || '').replaceAll('\\', '/').replace(/^\/+/, '')
  const parts = normalized.split('/')
  if (
    !normalized
    || normalized.length > 1_024
    || parts.some(part => !part || part === '.' || part === '..' || part.includes('\0'))
  ) {
    throw new HostBridgeError('invalid-relative-path', 'The upload path must be repository-relative.')
  }
  return parts.join('/')
}

function resolveInside(root: string, relativePath: string): string {
  const candidate = path.resolve(root, ...relativePath.split('/'))
  const relative = path.relative(root, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new HostBridgeError('invalid-relative-path', 'The upload path escaped its host-owned grant.')
  }
  return candidate
}

function parseCanonicalRepositoryUrl(value: unknown): string {
  let url: URL
  try {
    url = new URL(String(value || '').trim())
  } catch {
    throw new HostBridgeError('invalid-repository-url', 'repositoryUrl must be a canonical HTTPS GitHub URL.')
  }
  if (
    url.protocol !== 'https:'
    || url.hostname !== 'github.com'
    || url.port
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname.includes('%')
  ) {
    throw new HostBridgeError('invalid-repository-url', 'repositoryUrl must be credential-free HTTPS on github.com.')
  }
  const parts = url.pathname.split('/').filter(Boolean)
  const segment = /^[A-Za-z0-9_.-]{1,100}$/
  const owner = parts[0] || ''
  const repository = String(parts[1] || '').replace(/\.git$/i, '')
  const validTree = parts.length === 2 || (
    parts[2] === 'tree'
    && parts.length >= 4
    && parts.slice(3).every(part => segment.test(part))
  )
  if (!segment.test(owner) || !segment.test(repository) || !validTree) {
    throw new HostBridgeError('invalid-repository-url', 'repositoryUrl does not identify one canonical GitHub repository.')
  }
  return `https://github.com/${owner}/${repository}${parts[2] === 'tree' ? `/tree/${parts.slice(3).join('/')}` : ''}`
}

function sanitizeImportResult(value: unknown): Record<string, unknown> {
  const result = value as Record<string, unknown> | null
  if (!result || result.ok !== true) {
    const error = result?.error as { code?: unknown; message?: unknown } | undefined
    throw new HostBridgeError(
      String(error?.code || 'ingest-failed'),
      String(error?.message || 'Knowledge graph ingestion failed.'),
      422,
    )
  }
  const graphId = String(result.graphId || '')
  const snapshotDigest = String(result.snapshotDigest || '')
  const counts = result.counts as Record<string, unknown> | undefined
  const projection = result.projection as Record<string, unknown> | undefined
  const graphData = projection?.graphData as Record<string, unknown> | undefined
  if (
    !/^kg:graph:[0-9a-f]{32}$/.test(graphId)
    || !/^[0-9a-f]{64}$/.test(snapshotDigest)
    || typeof result.complete !== 'boolean'
    || !counts
    || !projection
    || projection.readOnly !== true
    || !/^kg:projection:[0-9a-f]{24}$/.test(String(projection.token || ''))
    || typeof projection.complete !== 'boolean'
    || typeof projection.truncated !== 'boolean'
    || !Number.isInteger(Number(projection.limit))
    || Number(projection.limit) < 1
    || Number(projection.limit) > 1_000
    || (projection.reason !== undefined && typeof projection.reason !== 'string')
    || graphData?.type !== 'Graph'
    || !Array.isArray(graphData.nodes)
    || !Array.isArray(graphData.edges)
    || graphData.nodes.length > MAX_PROJECTION_NODES
    || graphData.edges.length > MAX_PROJECTION_EDGES
  ) {
    throw new HostBridgeError('invalid-runtime-result', 'The canonical runtime returned an invalid ingest result.', 502)
  }
  const sourceCount = Number(counts.sources)
  const nodeCount = Number(counts.nodes)
  const edgeCount = Number(counts.edges)
  if (![sourceCount, nodeCount, edgeCount].every(value => Number.isInteger(value) && value >= 0)) {
    throw new HostBridgeError('invalid-runtime-result', 'The canonical runtime returned invalid graph counts.', 502)
  }
  const safeProjection = {
    token: String(projection.token),
    readOnly: true,
    graphData: {
      context: graphData.context,
      type: 'Graph',
      nodes: graphData.nodes,
      edges: graphData.edges,
    },
    complete: projection.complete,
    truncated: projection.truncated,
    limit: Number(projection.limit),
    ...(projection.reason ? { reason: String(projection.reason).slice(0, 200) } : {}),
  }
  if (Buffer.byteLength(JSON.stringify(safeProjection)) > MAX_PROJECTION_BYTES) {
    throw new HostBridgeError('invalid-runtime-result', 'The canonical runtime projection exceeded its browser byte limit.', 502)
  }
  return {
    handled: true,
    kind: 'knowledge-graph',
    graphId,
    snapshotDigest,
    complete: result.complete,
    counts: { sources: sourceCount, nodes: nodeCount, edges: edgeCount },
    projection: safeProjection,
  }
}

async function defaultRuntimeIngest(context: Parameters<RuntimeIngest>[0]): Promise<unknown> {
  const module = await import('../mcp/knowledge-graph-host.js')
  return module.runKnowledgeGraphTool(INGEST_TOOL_NAME, context.args, {
    rootDir: context.rootDir,
    env: context.env,
    abortSignal: context.abortSignal,
  })
}

function ingestArguments(
  source: { rootPath: string } | { repositoryUrl: string },
  invocation?: unknown,
): Record<string, unknown> {
  return {
    ...source,
    ...(invocation === undefined ? {} : { invocation }),
    include: SOURCE_PARSER_STRUCTURAL_INCLUDE_PATTERNS,
    maxFiles: MAX_FILES,
    maxFileBytes: MAX_FILE_BYTES,
    maxTotalBytes: MAX_TOTAL_BYTES,
    maxDurationMs: 3_600_000,
    projectionLimit: 1_000,
    acquisitionTimeoutMs: 120_000,
    useCache: true,
    strict: true,
  }
}

export function createKnowledgeGraphBridgeRequestHandler(options: BridgeOptions) {
  const repoRoot = path.resolve(options.repoRoot)
  const env = options.env || process.env
  const now = options.now || Date.now
  const hostDataRoot = path.resolve(
    options.hostDataRoot
      || env.KNOWGRPH_KNOWLEDGE_GRAPH_HOST_ROOT
      || path.join(repoRoot, 'data', 'outputs', 'knowledge-graph-host'),
  )
  const uploadRoot = path.join(hostDataRoot, 'uploads')
  const corpusRoot = path.join(hostDataRoot, 'corpora')
  const outputRoot = path.resolve(
    repoRoot,
    env.KNOWGRPH_KNOWLEDGE_GRAPH_OUTPUT_ROOT || 'data/outputs/knowledge-graph',
  )
  const runtimeEnv = {
    ...env,
    KNOWGRPH_KNOWLEDGE_GRAPH_ALLOWED_ROOTS: [
      corpusRoot,
      ...String(env.KNOWGRPH_KNOWLEDGE_GRAPH_ALLOWED_ROOTS || '').split(path.delimiter).filter(Boolean),
    ].join(path.delimiter),
    KNOWGRPH_KNOWLEDGE_GRAPH_OUTPUT_ROOT: outputRoot,
  }
  const runIngest = options.runIngest || defaultRuntimeIngest
  const grants = new Map<string, UploadGrantState>()

  const initialize = fs.mkdir(uploadRoot, { recursive: true, mode: 0o700 })
    .then(() => fs.mkdir(corpusRoot, { recursive: true, mode: 0o700 }))

  async function expireGrants() {
    const cutoff = now() - GRANT_TTL_MS
    const expired = [...grants.values()].filter(grant => grant.createdAt < cutoff && !grant.busy)
    for (const grant of expired) {
      grants.delete(grant.id)
      await fs.rm(grant.root, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  function resolveGrant(id: string): UploadGrantState {
    if (!GRANT_ID.test(id)) throw new HostBridgeError('invalid-grant', 'The upload grant is invalid.')
    const grant = grants.get(id)
    if (!grant) throw new HostBridgeError('grant-not-found', 'The upload grant is missing or expired.', 404)
    if (grant.busy) throw new HostBridgeError('grant-busy', 'The upload grant already has an active request.', 409)
    grant.busy = true
    return grant
  }

  async function withGrant<T>(id: string, operation: (grant: UploadGrantState) => Promise<T>): Promise<T> {
    const grant = resolveGrant(id)
    try {
      return await operation(grant)
    } finally {
      if (grants.has(id)) grant.busy = false
    }
  }

  async function uploadChunk(request: IncomingMessage, grant: UploadGrantState, url: URL) {
    const relativePath = normalizeRelativePath(url.searchParams.get('path') || '')
    const offset = Number(url.searchParams.get('offset'))
    const complete = url.searchParams.get('complete') === '1'
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new HostBridgeError('invalid-offset', 'The upload offset is invalid.')
    }
    if (grant.files.has(relativePath)) {
      throw new HostBridgeError('file-already-complete', 'The uploaded file is already complete.', 409)
    }
    const active = grant.activeFiles.get(relativePath)
    if ((active?.size || 0) !== offset || (!active && offset !== 0)) {
      throw new HostBridgeError('offset-mismatch', 'The upload offset does not match the host grant.', 409)
    }
    const body = await readBody(request, MAX_CHUNK_BYTES)
    const nextFileBytes = offset + body.byteLength
    const nextTotalBytes = grant.totalBytes + body.byteLength
    if (nextFileBytes > MAX_FILE_BYTES || nextTotalBytes > MAX_TOTAL_BYTES) {
      throw new HostBridgeError('folder-limit', 'The uploaded folder exceeds the host ingestion limits.', 413)
    }
    if (!active && grant.files.size + grant.activeFiles.size >= MAX_FILES) {
      throw new HostBridgeError('folder-limit', 'The uploaded folder exceeds the host file-count limit.', 413)
    }
    const state = active || { hash: createHash('sha256'), size: 0 }
    const target = resolveInside(grant.root, relativePath)
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
    await fs.writeFile(target, body, { flag: offset === 0 ? 'wx' : 'a', mode: 0o600 })
    state.hash.update(body)
    state.size = nextFileBytes
    grant.totalBytes = nextTotalBytes
    if (complete) {
      grant.activeFiles.delete(relativePath)
      grant.files.set(relativePath, { digest: state.hash.digest('hex'), size: state.size })
    } else {
      grant.activeFiles.set(relativePath, state)
    }
    return { ok: true, receivedBytes: state.size, complete }
  }

  async function commitGrant(grant: UploadGrantState, request: IncomingMessage, abortSignal: AbortSignal) {
    const body = await readJson(request)
    if (grant.activeFiles.size) {
      throw new HostBridgeError('incomplete-upload', 'One or more uploaded files are incomplete.', 409)
    }
    if (Number(body.fileCount) !== grant.files.size || Number(body.totalBytes) !== grant.totalBytes) {
      throw new HostBridgeError('upload-accounting-mismatch', 'Folder upload accounting did not match the host grant.', 409)
    }
    const corpusDigest = sha256(
      [...grant.files.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([filePath, file]) => `${filePath}\0${file.size}\0${file.digest}`)
        .join('\n'),
    )
    const corpusPath = path.join(corpusRoot, corpusDigest)
    try {
      await fs.rename(grant.root, corpusPath)
    } catch (error) {
      const code = String((error as NodeJS.ErrnoException)?.code || '')
      if (code !== 'EEXIST' && code !== 'ENOTEMPTY') throw error
      await fs.rm(grant.root, { recursive: true, force: true })
    }
    grants.delete(grant.id)
    return sanitizeImportResult(await runIngest({
      args: ingestArguments({ rootPath: corpusPath }),
      rootDir: repoRoot,
      env: runtimeEnv,
      abortSignal,
    }))
  }

  async function handle(request: IncomingMessage, response: ServerResponse) {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
      if (!url.pathname.startsWith(KNOWLEDGE_GRAPH_HOST_ROUTE)) return false
      assertSameOrigin(request)
      await initialize
      await expireGrants()
      const route = url.pathname.slice(KNOWLEDGE_GRAPH_HOST_ROUTE.length) || '/'
      if (request.method === 'GET' && route === '/capability') {
        sendJson(response, 200, {
          schema: KNOWLEDGE_GRAPH_HOST_CAPABILITY_SCHEMA,
          available: true,
          limits: {
            maxChunkBytes: MAX_CHUNK_BYTES,
            maxFiles: MAX_FILES,
            maxFileBytes: MAX_FILE_BYTES,
            maxTotalBytes: MAX_TOTAL_BYTES,
          },
        })
        return true
      }
      if (request.method === 'POST' && route === '/grants') {
        await readJson(request)
        const id = randomUUID()
        const root = path.join(uploadRoot, id)
        await fs.mkdir(root, { recursive: false, mode: 0o700 })
        grants.set(id, {
          id,
          root,
          createdAt: now(),
          busy: false,
          files: new Map(),
          activeFiles: new Map(),
          totalBytes: 0,
        })
        sendJson(response, 201, { grantId: id })
        return true
      }
      const fileMatch = /^\/grants\/([^/]+)\/files$/.exec(route)
      if (request.method === 'PUT' && fileMatch) {
        const result = await withGrant(fileMatch[1], grant => uploadChunk(request, grant, url))
        sendJson(response, 200, result)
        return true
      }
      const commitMatch = /^\/grants\/([^/]+)\/commit$/.exec(route)
      if (request.method === 'POST' && commitMatch) {
        const abortController = new AbortController()
        response.once('close', () => {
          if (!response.writableEnded) abortController.abort()
        })
        const result = await withGrant(
          commitMatch[1],
          grant => commitGrant(grant, request, abortController.signal),
        )
        sendJson(response, 200, result)
        return true
      }
      const grantMatch = /^\/grants\/([^/]+)$/.exec(route)
      if (request.method === 'DELETE' && grantMatch) {
        await withGrant(grantMatch[1], async grant => {
          grants.delete(grant.id)
          await fs.rm(grant.root, { recursive: true, force: true })
        })
        sendJson(response, 200, { ok: true })
        return true
      }
      if (request.method === 'POST' && route === '/repositories') {
        const body = await readJson(request)
        const repositoryUrl = parseCanonicalRepositoryUrl(body.repositoryUrl)
        const abortController = new AbortController()
        response.once('close', () => {
          if (!response.writableEnded) abortController.abort()
        })
        const result = sanitizeImportResult(await runIngest({
          args: ingestArguments({ repositoryUrl }, body.invocation),
          rootDir: repoRoot,
          env: runtimeEnv,
          abortSignal: abortController.signal,
        }))
        sendJson(response, 200, result)
        return true
      }
      throw new HostBridgeError('route-not-found', 'The knowledge graph host route was not found.', 404)
    } catch (error) {
      sendFailure(response, error)
      return true
    }
  }

  return handle
}

export function createKnowledgeGraphBridgePlugin(options: BridgeOptions): Plugin {
  return {
    name: 'knowgrph-knowledge-graph-host-bridge',
    apply: 'serve',
    configureServer(server) {
      const handler = createKnowledgeGraphBridgeRequestHandler(options)
      server.middlewares.use((request, response, next) => {
        void handler(request, response)
          .then(handled => {
            if (!handled) next()
          })
          .catch(next)
      })
    },
  }
}
