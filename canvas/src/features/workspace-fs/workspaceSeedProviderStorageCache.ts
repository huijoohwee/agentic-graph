import type { WorkspaceDocsMirrorEntry } from './workspaceSeedProvider'
import { AGENTIC_OS_STORAGE_ROUTE_PATHS } from '@/lib/storage/agentic-graph-storage-sync-contract'
import { SimpleTtlLruCache } from '@/lib/cache/SimpleTtlLruCache'
import { cancelStorageStream, fetchWithTimeout, readResponseTextWithDeadline } from '@/lib/storage/agentic-graph-storage-client-transport'
import { WORKSPACE_DOCS_MIRROR_MAX_FILES } from './workspaceDocsMirrorNodeReader'

const STORAGE_FETCH_TIMEOUT_MS = 8000
const STORAGE_CACHE_TTL_MS = 30 * 1000
const STORAGE_TEXT_NEGATIVE_CACHE_TTL_MS = 30 * 1000
const STORAGE_CACHE_MAX_ENTRIES = 64
const STORAGE_TEXT_MAX_CHARS = 1024 * 1024

type StorageTextCacheEntry = {
  text: string | null
  expiresAtMs: number
}

const storageTextCache = new Map<string, StorageTextCacheEntry>()
const storageTextInFlight = new Map<string, Promise<string | null>>()
const storageExportMirrorCache = new Map<string, { entries: WorkspaceDocsMirrorEntry[]; expiresAtMs: number }>()
const storageExportMirrorInFlight = new Map<string, Promise<WorkspaceDocsMirrorEntry[]>>()
const configuredDocsMirrorDatasetCache = new SimpleTtlLruCache<string, WorkspaceDocsMirrorEntry[]>(4, 1000)
const configuredDocsMirrorDatasetInFlight = new Map<string, Promise<WorkspaceDocsMirrorEntry[]>>()

const isStorageDocRequestUrl = (url: string): boolean => String(url || '').includes('/api/storage/doc/')

export const buildAgenticGraphStorageRequestUrl = (args: { path: string; baseUrl: string }): string => {
  const safePath = String(args.path || '').trim()
  if (!safePath) return ''
  if (typeof window !== 'undefined') {
    const host = String(window.location?.hostname || '').trim().toLowerCase()
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
    if (isLocalhost && safePath.startsWith('/api/storage/')) return safePath
  }
  const baseUrl = String(args.baseUrl || '').trim()
  if (!baseUrl) return safePath
  return new URL(safePath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString()
}

export const readFirstAgenticGraphStorageDocText = async (args: {
  baseUrl: string
  workspaceId: string
  canonicalPathCandidates: ReadonlyArray<string>
}): Promise<string | null> => {
  const workspaceId = String(args.workspaceId || '').trim()
  if (!workspaceId) return null
  const candidates = Array.isArray(args.canonicalPathCandidates) ? args.canonicalPathCandidates : []
  for (let i = 0; i < candidates.length; i += 1) {
    const canonicalPath = String(candidates[i] || '').trim()
    if (!canonicalPath) continue
    const docPath = `${AGENTIC_OS_STORAGE_ROUTE_PATHS.docPrefix}${encodeURIComponent(workspaceId)}/${encodeURIComponent(canonicalPath)}`
    const requestUrl = buildAgenticGraphStorageRequestUrl({ path: docPath, baseUrl: args.baseUrl })
    if (!requestUrl) continue
    const text = await readWorkspaceDocsMirrorTextViaFetch(requestUrl)
    if (text !== null) return text
  }
  return null
}

const cloneWorkspaceDocsMirrorEntries = (entries: ReadonlyArray<WorkspaceDocsMirrorEntry>): WorkspaceDocsMirrorEntry[] => {
  return (Array.isArray(entries) ? entries : []).map(entry => ({ ...entry }))
}

const canRetainConfiguredDocsMirrorEntries = (entries: ReadonlyArray<WorkspaceDocsMirrorEntry>): boolean => {
  if (entries.length > WORKSPACE_DOCS_MIRROR_MAX_FILES) return false
  let codeUnits = 0
  for (const entry of entries) {
    codeUnits += entry.relPath.length + entry.text.length
    if (codeUnits > STORAGE_TEXT_MAX_CHARS) return false
  }
  return true
}

export const readCachedConfiguredDocsMirrorEntries = async (args: {
  cacheKey: string
  load: () => Promise<WorkspaceDocsMirrorEntry[]>
}): Promise<WorkspaceDocsMirrorEntry[]> => {
  // Filesystem normalization belongs to the provider that owns this key.
  const cacheKey = args.cacheKey
  if (!cacheKey) return []
  const inFlight = configuredDocsMirrorDatasetInFlight.get(cacheKey)
  if (inFlight) return cloneWorkspaceDocsMirrorEntries(await inFlight)
  const cached = configuredDocsMirrorDatasetCache.get(cacheKey)
  if (cached) return cloneWorkspaceDocsMirrorEntries(cached)
  // Publish pending ownership before a synchronous or reentrant loader runs.
  const promise = Promise.resolve().then(() => args.load())
  configuredDocsMirrorDatasetInFlight.set(cacheKey, promise)
  try {
    const entries = await promise
    if (configuredDocsMirrorDatasetInFlight.get(cacheKey) === promise && canRetainConfiguredDocsMirrorEntries(entries)) {
      configuredDocsMirrorDatasetCache.set(cacheKey, cloneWorkspaceDocsMirrorEntries(entries))
    }
    return cloneWorkspaceDocsMirrorEntries(entries)
  } finally {
    if (configuredDocsMirrorDatasetInFlight.get(cacheKey) === promise) configuredDocsMirrorDatasetInFlight.delete(cacheKey)
  }
}

const rememberBoundedMapEntry = <T>(map: Map<string, T>, key: string, value: T): void => {
  map.set(key, value)
  while (map.size > STORAGE_CACHE_MAX_ENTRIES) {
    const oldest = map.keys().next().value
    if (!oldest) break
    map.delete(oldest)
  }
}

export const readCachedWorkspaceDocsMirrorEntries = async (args: {
  cacheKey: string
  policy?: 'revalidate' | 'reuse-settled'
  load: () => Promise<WorkspaceDocsMirrorEntry[]>
}): Promise<WorkspaceDocsMirrorEntry[]> => {
  const cacheKey = String(args.cacheKey || '').trim()
  if (!cacheKey) return []
  // An active refresh supersedes older settled bytes for every policy.
  const inFlight = storageExportMirrorInFlight.get(cacheKey)
  if (inFlight) return cloneWorkspaceDocsMirrorEntries(await inFlight)
  const cached = storageExportMirrorCache.get(cacheKey)
  if (args.policy === 'reuse-settled' && cached && cached.expiresAtMs > Date.now()) {
    storageExportMirrorCache.delete(cacheKey)
    storageExportMirrorCache.set(cacheKey, cached)
    return cloneWorkspaceDocsMirrorEntries(cached.entries)
  }
  // Default workspace reads revalidate; a failed refresh cannot revive old bytes.
  if (cached) storageExportMirrorCache.delete(cacheKey)
  // Install pending ownership before a synchronous or reentrant loader runs.
  const promise = Promise.resolve().then(() => args.load())
  storageExportMirrorInFlight.set(cacheKey, promise)
  try {
    const entries = await promise
    if (storageExportMirrorInFlight.get(cacheKey) === promise) {
      rememberBoundedMapEntry(storageExportMirrorCache, cacheKey, {
        entries: cloneWorkspaceDocsMirrorEntries(entries),
        expiresAtMs: Date.now() + STORAGE_CACHE_TTL_MS,
      })
    }
    return cloneWorkspaceDocsMirrorEntries(entries)
  } finally {
    if (storageExportMirrorInFlight.get(cacheKey) === promise) storageExportMirrorInFlight.delete(cacheKey)
  }
}

export const fetchWorkspaceDocsMirrorResponse = (
  input: RequestInfo | URL,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Response> => fetchWithTimeout({
  input, init, fetchImpl, timeoutMs: STORAGE_FETCH_TIMEOUT_MS,
})

const readTextViaFetchUncached = async (safeUrl: string, fetchImpl: typeof fetch): Promise<string | null> => {
  try {
    const res = await fetchWorkspaceDocsMirrorResponse(safeUrl, {}, fetchImpl)
    if (!res.ok) {
      cancelStorageStream(res.body, 'workspace docs mirror response status rejected')
      return null
    }
    return await readResponseTextWithDeadline(res, { maxBytes: null })
  } catch {
    return null
  }
}

export const readWorkspaceDocsMirrorTextViaFetch = async (url: string): Promise<string | null> => {
  if (typeof fetch !== 'function') return null
  const safeUrl = String(url || '').trim()
  if (!safeUrl) return null
  const fetchImpl = fetch
  if (!isStorageDocRequestUrl(safeUrl)) return readTextViaFetchUncached(safeUrl, fetchImpl)
  const now = Date.now()
  const cached = storageTextCache.get(safeUrl)
  if (cached && cached.expiresAtMs > now) {
    storageTextCache.delete(safeUrl)
    storageTextCache.set(safeUrl, cached)
    return cached.text
  }
  if (cached) storageTextCache.delete(safeUrl)
  const inFlight = storageTextInFlight.get(safeUrl)
  if (inFlight) return inFlight
  const promise = Promise.resolve().then(() => readTextViaFetchUncached(safeUrl, fetchImpl))
  storageTextInFlight.set(safeUrl, promise)
  try {
    const text = await promise
    if (storageTextInFlight.get(safeUrl) === promise && (!text || text.length <= STORAGE_TEXT_MAX_CHARS)) {
      rememberBoundedMapEntry(storageTextCache, safeUrl, {
        text,
        expiresAtMs: Date.now() + (text === null ? STORAGE_TEXT_NEGATIVE_CACHE_TTL_MS : STORAGE_CACHE_TTL_MS),
      })
    }
    return text
  } finally {
    if (storageTextInFlight.get(safeUrl) === promise) storageTextInFlight.delete(safeUrl)
  }
}

export const resetWorkspaceSeedProviderStorageCacheForTests = (): void => {
  storageTextCache.clear()
  storageTextInFlight.clear()
  storageExportMirrorCache.clear()
  storageExportMirrorInFlight.clear()
  configuredDocsMirrorDatasetCache.clear()
  configuredDocsMirrorDatasetInFlight.clear()
}
