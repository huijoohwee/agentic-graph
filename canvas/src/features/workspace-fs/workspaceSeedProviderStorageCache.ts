import type { WorkspaceDocsMirrorEntry } from './workspaceSeedProvider'
import { AGENTICGRAPH_STORAGE_ROUTE_PATHS } from '@/lib/storage/agenticgraphStorageSyncContract'

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
}): Promise<string> => {
  const workspaceId = String(args.workspaceId || '').trim()
  if (!workspaceId) return ''
  const candidates = Array.isArray(args.canonicalPathCandidates) ? args.canonicalPathCandidates : []
  for (let i = 0; i < candidates.length; i += 1) {
    const canonicalPath = String(candidates[i] || '').trim()
    if (!canonicalPath) continue
    const docPath = `${AGENTICGRAPH_STORAGE_ROUTE_PATHS.docPrefix}${encodeURIComponent(workspaceId)}/${encodeURIComponent(canonicalPath)}`
    const requestUrl = buildAgenticGraphStorageRequestUrl({ path: docPath, baseUrl: args.baseUrl })
    if (!requestUrl) continue
    const text = await readWorkspaceDocsMirrorTextViaFetch(requestUrl)
    if (text?.trim()) return text
  }
  return ''
}

const cloneWorkspaceDocsMirrorEntries = (entries: ReadonlyArray<WorkspaceDocsMirrorEntry>): WorkspaceDocsMirrorEntry[] => {
  return (Array.isArray(entries) ? entries : []).map(entry => ({ ...entry }))
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
  load: () => Promise<WorkspaceDocsMirrorEntry[]>
}): Promise<WorkspaceDocsMirrorEntry[]> => {
  const cacheKey = String(args.cacheKey || '').trim()
  if (!cacheKey) return []
  const now = Date.now()
  const cached = storageExportMirrorCache.get(cacheKey)
  if (cached && cached.expiresAtMs > now) {
    storageExportMirrorCache.delete(cacheKey)
    storageExportMirrorCache.set(cacheKey, cached)
    return cloneWorkspaceDocsMirrorEntries(cached.entries)
  }
  if (cached) storageExportMirrorCache.delete(cacheKey)
  const inFlight = storageExportMirrorInFlight.get(cacheKey)
  if (inFlight) return cloneWorkspaceDocsMirrorEntries(await inFlight)
  const promise = args.load()
  storageExportMirrorInFlight.set(cacheKey, promise)
  try {
    const entries = await promise
    rememberBoundedMapEntry(storageExportMirrorCache, cacheKey, {
      entries: cloneWorkspaceDocsMirrorEntries(entries),
      expiresAtMs: Date.now() + STORAGE_CACHE_TTL_MS,
    })
    return cloneWorkspaceDocsMirrorEntries(entries)
  } finally {
    storageExportMirrorInFlight.delete(cacheKey)
  }
}

const readTextViaFetchUncached = async (safeUrl: string): Promise<string | null> => {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timeout = controller && typeof setTimeout === 'function'
    ? setTimeout(() => {
        try {
          controller.abort()
        } catch {
          void 0
        }
      }, STORAGE_FETCH_TIMEOUT_MS)
    : null
  try {
    const res = await fetch(safeUrl, controller ? { signal: controller.signal } : undefined)
    if (!res.ok) return null
    const text = (await res.text()).trim()
    return text || null
  } catch {
    return null
  } finally {
    if (timeout != null) clearTimeout(timeout)
  }
}

export const readWorkspaceDocsMirrorTextViaFetch = async (url: string): Promise<string | null> => {
  if (typeof fetch !== 'function') return null
  const safeUrl = String(url || '').trim()
  if (!safeUrl) return null
  if (!isStorageDocRequestUrl(safeUrl)) return readTextViaFetchUncached(safeUrl)
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
  const promise = readTextViaFetchUncached(safeUrl)
  storageTextInFlight.set(safeUrl, promise)
  try {
    const text = await promise
    if (!text || text.length <= STORAGE_TEXT_MAX_CHARS) {
      rememberBoundedMapEntry(storageTextCache, safeUrl, {
        text,
        expiresAtMs: Date.now() + (text ? STORAGE_CACHE_TTL_MS : STORAGE_TEXT_NEGATIVE_CACHE_TTL_MS),
      })
    }
    return text
  } finally {
    storageTextInFlight.delete(safeUrl)
  }
}

export const resetWorkspaceSeedProviderStorageCacheForTests = (): void => {
  storageTextCache.clear()
  storageTextInFlight.clear()
  storageExportMirrorCache.clear()
  storageExportMirrorInFlight.clear()
}
