import type {
  WorkspaceKnowledgeGraphBridge,
  WorkspaceKnowledgeGraphImportResult,
} from '@/features/markdown-explorer/workspaceActionBridge'
import type { GraphData } from '@/lib/graph/types'

export const KNOWLEDGE_GRAPH_HOST_ROUTE = '/__knowgrph_knowledge_graph'
export const KNOWLEDGE_GRAPH_HOST_CAPABILITY_SCHEMA = 'knowgrph-knowledge-graph-host-capability/v1'

const DEFAULT_IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.worktrees',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
])

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type DirectoryPicker = () => Promise<FileSystemDirectoryHandle>

type HostCapability = {
  schema: typeof KNOWLEDGE_GRAPH_HOST_CAPABILITY_SCHEMA
  available: true
  limits: {
    maxChunkBytes: number
    maxFiles: number
    maxFileBytes: number
    maxTotalBytes: number
  }
}

type UploadGrant = {
  grantId: string
}

type DirectoryEntryHandle = FileSystemHandle & {
  kind: 'directory' | 'file'
  name: string
}

type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  values: () => AsyncIterableIterator<DirectoryEntryHandle>
}

export class KnowledgeGraphHostError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'KnowledgeGraphHostError'
    this.code = code
  }
}

const isNonNegativeInteger = (value: unknown): value is number => (
  typeof value === 'number' && Number.isInteger(value) && value >= 0
)

const isPositiveInteger = (value: unknown): value is number => (
  typeof value === 'number' && Number.isInteger(value) && value > 0
)

const cleanRelativePath = (value: string): string => {
  const normalized = String(value || '').replaceAll('\\', '/').replace(/^\/+/, '')
  const parts = normalized.split('/')
  if (
    !normalized
    || normalized.length > 1_024
    || parts.some(part => !part || part === '.' || part === '..' || part.includes('\0'))
  ) {
    throw new KnowledgeGraphHostError('invalid-relative-path', 'The selected folder contains an invalid relative path.')
  }
  return parts.join('/')
}

export function normalizeKnowledgeGraphRepositoryUrl(value: string): string {
  let url: URL
  try {
    url = new URL(String(value || '').trim())
  } catch {
    throw new KnowledgeGraphHostError('invalid-repository-url', 'Enter a canonical HTTPS GitHub repository URL.')
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
    throw new KnowledgeGraphHostError('invalid-repository-url', 'Enter a credential-free HTTPS GitHub repository URL.')
  }
  const parts = url.pathname.split('/').filter(Boolean)
  const segment = /^[A-Za-z0-9_.-]{1,100}$/
  const owner = parts[0] || ''
  const repository = String(parts[1] || '').replace(/\.git$/i, '')
  const treeValid = parts.length === 2 || (
    parts[2] === 'tree'
    && parts.length >= 4
    && parts.slice(3).every(part => segment.test(part))
  )
  if (!segment.test(owner) || !segment.test(repository) || !treeValid) {
    throw new KnowledgeGraphHostError(
      'invalid-repository-url',
      'The URL must identify one GitHub owner/repository, optionally with a tree ref and path.',
    )
  }
  const suffix = parts[2] === 'tree' ? `/tree/${parts.slice(3).join('/')}` : ''
  return `https://github.com/${owner}/${repository}${suffix}`
}

function validateCapability(value: unknown): HostCapability {
  const candidate = value as Partial<HostCapability> | null
  const limits = candidate?.limits
  if (
    candidate?.schema !== KNOWLEDGE_GRAPH_HOST_CAPABILITY_SCHEMA
    || candidate.available !== true
    || !limits
    || !isPositiveInteger(limits.maxChunkBytes)
    || !isPositiveInteger(limits.maxFiles)
    || !isPositiveInteger(limits.maxFileBytes)
    || !isPositiveInteger(limits.maxTotalBytes)
  ) {
    throw new KnowledgeGraphHostError(
      'host-unavailable',
      'The canonical local knowledge graph host capability is unavailable.',
    )
  }
  return candidate as HostCapability
}

function validateGraphData(value: unknown): GraphData {
  const graphData = value as Partial<GraphData> | null
  if (graphData?.type !== 'Graph' || !Array.isArray(graphData.nodes) || !Array.isArray(graphData.edges)) {
    throw new KnowledgeGraphHostError('invalid-host-result', 'The host returned an invalid Canvas graph projection.')
  }
  return graphData as GraphData
}

export function validateKnowledgeGraphHostResult(value: unknown): WorkspaceKnowledgeGraphImportResult {
  const result = value as Partial<WorkspaceKnowledgeGraphImportResult> | null
  const counts = result?.counts
  const projection = result?.projection
  if (
    result?.handled !== true
    || result.kind !== 'knowledge-graph'
    || !/^kg:graph:[0-9a-f]{32}$/.test(String(result.graphId || ''))
    || !/^[0-9a-f]{64}$/.test(String(result.snapshotDigest || ''))
    || typeof result.complete !== 'boolean'
    || !counts
    || !isNonNegativeInteger(counts.sources)
    || !isNonNegativeInteger(counts.nodes)
    || !isNonNegativeInteger(counts.edges)
    || !projection
    || projection.readOnly !== true
    || !/^kg:projection:[0-9a-f]{24}$/.test(String(projection.token || ''))
    || typeof projection.complete !== 'boolean'
    || typeof projection.truncated !== 'boolean'
    || !isPositiveInteger(projection.limit)
    || (projection.reason !== undefined && typeof projection.reason !== 'string')
  ) {
    throw new KnowledgeGraphHostError('invalid-host-result', 'The canonical knowledge graph host returned an invalid result.')
  }
  return {
    handled: true,
    kind: 'knowledge-graph',
    graphId: result.graphId as string,
    snapshotDigest: result.snapshotDigest as string,
    complete: result.complete,
    counts: {
      sources: counts.sources,
      nodes: counts.nodes,
      edges: counts.edges,
    },
    projection: {
      token: projection.token,
      readOnly: true,
      graphData: validateGraphData(projection.graphData),
      complete: projection.complete,
      truncated: projection.truncated,
      limit: projection.limit,
      ...(projection.reason ? { reason: projection.reason.slice(0, 200) } : {}),
    },
  }
}

async function readHostJson(response: Response): Promise<unknown> {
  let value: unknown = null
  try {
    value = await response.json()
  } catch {
    throw new KnowledgeGraphHostError('invalid-host-response', 'The local knowledge graph host returned invalid JSON.')
  }
  if (!response.ok) {
    const failure = value as { error?: { code?: unknown; message?: unknown } }
    throw new KnowledgeGraphHostError(
      String(failure?.error?.code || 'host-request-failed'),
      String(failure?.error?.message || `The local knowledge graph host request failed (${response.status}).`),
    )
  }
  return value
}

async function requestJson(fetchImpl: FetchLike, path: string, init?: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetchImpl(`${KNOWLEDGE_GRAPH_HOST_ROUTE}${path}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body instanceof Uint8Array ? {} : { 'Content-Type': 'application/json' }),
        ...(init?.headers || {}),
      },
    })
  } catch {
    throw new KnowledgeGraphHostError(
      'host-unavailable',
      'The canonical local knowledge graph host capability is unavailable.',
    )
  }
  return readHostJson(response)
}

async function listDirectoryEntries(handle: FileSystemDirectoryHandle): Promise<DirectoryEntryHandle[]> {
  const iterable = handle as IterableDirectoryHandle
  if (typeof iterable.values !== 'function') {
    throw new KnowledgeGraphHostError('directory-capability-unavailable', 'This browser cannot read the selected directory.')
  }
  const entries: DirectoryEntryHandle[] = []
  for await (const entry of iterable.values()) entries.push(entry)
  return entries.sort((left, right) => left.name.localeCompare(right.name))
}

async function* walkDirectory(
  handle: FileSystemDirectoryHandle,
  prefix = '',
): AsyncGenerator<{ path: string; file: File }> {
  for (const entry of await listDirectoryEntries(handle)) {
    if (entry.kind === 'directory') {
      if (DEFAULT_IGNORED_DIRECTORY_NAMES.has(entry.name)) continue
      const path = cleanRelativePath(prefix ? `${prefix}/${entry.name}` : entry.name)
      yield* walkDirectory(entry as FileSystemDirectoryHandle, path)
      continue
    }
    if (entry.kind !== 'file') continue
    const path = cleanRelativePath(prefix ? `${prefix}/${entry.name}` : entry.name)
    const file = await (entry as FileSystemFileHandle).getFile()
    yield { path, file }
  }
}

function defaultDirectoryPicker(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as typeof window & {
    showDirectoryPicker?: (options?: { mode?: 'read' }) => Promise<FileSystemDirectoryHandle>
  }).showDirectoryPicker
  if (typeof picker !== 'function') {
    throw new KnowledgeGraphHostError(
      'directory-capability-unavailable',
      'Canonical folder import requires a browser directory capability.',
    )
  }
  return picker.call(window, { mode: 'read' })
}

async function uploadFile(args: {
  fetchImpl: FetchLike
  grantId: string
  path: string
  file: File
  maxChunkBytes: number
}) {
  if (args.file.size === 0) {
    await requestJson(
      args.fetchImpl,
      `/grants/${encodeURIComponent(args.grantId)}/files?path=${encodeURIComponent(args.path)}&offset=0&complete=1`,
      { method: 'PUT', body: new Uint8Array() },
    )
    return
  }
  for (let offset = 0; offset < args.file.size; offset += args.maxChunkBytes) {
    const end = Math.min(args.file.size, offset + args.maxChunkBytes)
    const chunk = new Uint8Array(await args.file.slice(offset, end).arrayBuffer())
    await requestJson(
      args.fetchImpl,
      `/grants/${encodeURIComponent(args.grantId)}/files?path=${encodeURIComponent(args.path)}&offset=${offset}&complete=${end === args.file.size ? 1 : 0}`,
      { method: 'PUT', body: chunk },
    )
  }
}

export function createKnowledgeGraphHostAdapter({
  fetchImpl = globalThis.fetch.bind(globalThis),
  pickDirectory = defaultDirectoryPicker,
}: {
  fetchImpl?: FetchLike
  pickDirectory?: DirectoryPicker
} = {}): WorkspaceKnowledgeGraphBridge {
  const capability = async () => validateCapability(await requestJson(fetchImpl, '/capability'))
  return {
    importFolder: async () => {
      const host = await capability()
      const root = await pickDirectory()
      const grant = await requestJson(fetchImpl, '/grants', { method: 'POST', body: '{}' }) as UploadGrant
      if (!/^[0-9a-f-]{36}$/.test(String(grant?.grantId || ''))) {
        throw new KnowledgeGraphHostError('invalid-grant', 'The local host returned an invalid upload grant.')
      }
      let fileCount = 0
      let totalBytes = 0
      try {
        for await (const entry of walkDirectory(root)) {
          fileCount += 1
          totalBytes += entry.file.size
          if (
            fileCount > host.limits.maxFiles
            || entry.file.size > host.limits.maxFileBytes
            || totalBytes > host.limits.maxTotalBytes
          ) {
            throw new KnowledgeGraphHostError('folder-limit', 'The selected folder exceeds the host ingestion limits.')
          }
          await uploadFile({
            fetchImpl,
            grantId: grant.grantId,
            path: entry.path,
            file: entry.file,
            maxChunkBytes: host.limits.maxChunkBytes,
          })
        }
        return validateKnowledgeGraphHostResult(await requestJson(
          fetchImpl,
          `/grants/${encodeURIComponent(grant.grantId)}/commit`,
          { method: 'POST', body: JSON.stringify({ fileCount, totalBytes }) },
        ))
      } catch (error) {
        await requestJson(fetchImpl, `/grants/${encodeURIComponent(grant.grantId)}`, {
          method: 'DELETE',
        }).catch(() => undefined)
        throw error
      }
    },
    importRepositoryUrl: async (url, _opts, invocation) => {
      await capability()
      const repositoryUrl = normalizeKnowledgeGraphRepositoryUrl(url)
      return validateKnowledgeGraphHostResult(await requestJson(fetchImpl, '/repositories', {
        method: 'POST',
        body: JSON.stringify({ repositoryUrl, invocation }),
      }))
    },
  }
}
