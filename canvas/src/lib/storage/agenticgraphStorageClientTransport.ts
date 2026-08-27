import { AGENTICGRAPH_STORAGE_SYNC_BOUNDS } from '@/lib/storage/agenticgraphStorageBounds'
import type {
  AgenticGraphStorageFetchLike,
  AgenticGraphStorageSyncNowArgs,
  AgenticGraphStorageSyncRunResult,
} from '@/lib/storage/agenticgraphStorageClientTypes'
import { AGENTICGRAPH_STORAGE_ROUTE_PATHS } from '@/lib/storage/agenticgraphStorageRoutePaths'
import { AGENTICGRAPH_STORAGE_SYNC_LIMITS } from '@/lib/storage/agenticgraphStorageSyncContract'
import {
  AGENTICGRAPH_STORAGE_ROUTE_UNAVAILABLE_RETRY_MS,
  normalizePositiveInt,
  normalizeString,
  readCursorRow,
} from '@/lib/storage/agenticgraphStorageClientSupport'

export const routeUnavailableUntilByApiOrigin = new Map<string, number>()

export const __resetAgenticGraphStorageRouteAvailabilityForTests = (): void => {
  routeUnavailableUntilByApiOrigin.clear()
}

export const buildAgenticGraphStorageSyncAuthHeaders = (
  sessionToken?: string | null,
): Record<string, string> => {
  // A Vite variable is public browser build input, so it must never be used as
  // a storage bearer credential. Browser storage requests authenticate with
  // the same-origin HttpOnly session cookie instead. Explicit tokens remain
  // available to non-browser/service callers that deliberately provide one.
  const token = normalizeString(sessionToken)
  return token ? { authorization: `Bearer ${token}` } : {}
}

export class AgenticGraphStorageRouteUnavailableError extends Error {
  apiOrigin: string

  constructor(message: string, apiOrigin: string) {
    super(message)
    this.name = 'AgenticGraphStorageRouteUnavailableError'
    this.apiOrigin = apiOrigin
  }
}

export class AgenticGraphStorageRetryableTransportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgenticGraphStorageRetryableTransportError'
  }
}

export class AgenticGraphStorageRetryExhaustedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgenticGraphStorageRetryExhaustedError'
  }
}

export class AgenticGraphStorageResponseLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgenticGraphStorageResponseLimitError'
  }
}

export class AgenticGraphStorageBrowserOriginError extends Error {
  constructor() {
    super('Cloud storage must use this browser\'s origin.')
    this.name = 'AgenticGraphStorageBrowserOriginError'
  }
}

const readBrowserOrigin = (): string | null => {
  if (typeof window === 'undefined') return null
  try {
    const origin = normalizeString(window.location?.origin)
    const parsed = new URL(origin)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.origin
      : null
  } catch {
    return null
  }
}

const assertBrowserSameOriginStorageRequest = (input: RequestInfo | URL): void => {
  const browserOrigin = readBrowserOrigin()
  if (!browserOrigin) return
  try {
    const target = new URL(
      typeof Request !== 'undefined' && input instanceof Request ? input.url : String(input),
      browserOrigin,
    )
    if (target.origin !== browserOrigin) throw new AgenticGraphStorageBrowserOriginError()
  } catch (error) {
    if (error instanceof AgenticGraphStorageBrowserOriginError) throw error
    throw new AgenticGraphStorageBrowserOriginError()
  }
}

export const getClientFetch = (value?: AgenticGraphStorageFetchLike): AgenticGraphStorageFetchLike => {
  const fetchImpl = value || (typeof fetch === 'function' ? fetch : null)
  if (!fetchImpl) throw new Error('fetch is not available for agenticgraph storage sync')
  return (input, init) => {
    // `same-origin` strips cookies cross-origin but does not stop a request
    // body leaving the page. Reject before fetch so push, pull, and export
    // cannot send any workspace data to a misconfigured external base URL.
    assertBrowserSameOriginStorageRequest(input)
    return fetchImpl(input, { ...init, credentials: init?.credentials || 'same-origin' })
  }
}

export const sleep = async (
  delayMs: number,
  sleepImpl?: AgenticGraphStorageSyncNowArgs['sleepImpl'],
): Promise<void> => {
  if (sleepImpl) {
    await sleepImpl(delayMs)
    return
  }
  await new Promise<void>(resolve => {
    globalThis.setTimeout(resolve, delayMs)
  })
}

export const fetchWithTimeout = async (args: {
  fetchImpl: AgenticGraphStorageFetchLike
  input: RequestInfo | URL
  init: RequestInit
  timeoutMs?: number
}): Promise<Response> => {
  const timeoutMs = normalizePositiveInt(
    args.timeoutMs,
    AGENTICGRAPH_STORAGE_SYNC_BOUNDS.pushRequestTimeoutMs,
  )
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      controller.abort()
      reject(new AgenticGraphStorageRetryableTransportError(
        `agenticgraph storage request timed out after ${timeoutMs}ms`,
      ))
    }, timeoutMs)
  })
  try {
    return await Promise.race([
      args.fetchImpl(args.input, {
        ...args.init,
        credentials: args.init.credentials || 'same-origin',
        signal: controller.signal,
      }),
      timeout,
    ])
  } catch (error) {
    if (error instanceof AgenticGraphStorageRetryableTransportError) throw error
    const name = error && typeof error === 'object'
      ? normalizeString((error as { name?: unknown }).name).toLowerCase()
      : ''
    if (name === 'aborterror' || isNetworkLoadFailure(error)) {
      throw new AgenticGraphStorageRetryableTransportError(
        error instanceof Error ? error.message : 'agenticgraph storage network request failed',
      )
    }
    throw error
  } finally {
    if (timeoutId != null) globalThis.clearTimeout(timeoutId)
  }
}

export const buildApiOriginKey = (baseUrl?: string | null): string => {
  try {
    return new URL(resolveAgenticGraphStorageApiUrl(AGENTICGRAPH_STORAGE_ROUTE_PATHS.push, baseUrl)).origin
  } catch {
    return normalizeString(baseUrl) || 'window-origin'
  }
}

export const markRouteUnavailableForApiOrigin = (apiOrigin: string, nowMs = Date.now()): void => {
  if (!apiOrigin) return
  const existingUntilMs = Number(routeUnavailableUntilByApiOrigin.get(apiOrigin) || 0)
  const shouldLog = !Number.isFinite(existingUntilMs) || existingUntilMs <= nowMs
  routeUnavailableUntilByApiOrigin.set(apiOrigin, nowMs + AGENTICGRAPH_STORAGE_ROUTE_UNAVAILABLE_RETRY_MS)
  if (shouldLog) {
    console.warn(`[agenticgraph-storage] route unavailable for ${apiOrigin} — retry in ${AGENTICGRAPH_STORAGE_ROUTE_UNAVAILABLE_RETRY_MS}ms`)
  }
}

export const isRouteUnavailableForApiOrigin = (apiOrigin: string, nowMs = Date.now()): boolean => {
  if (!apiOrigin) return false
  const untilMs = Number(routeUnavailableUntilByApiOrigin.get(apiOrigin) || 0)
  if (!Number.isFinite(untilMs) || untilMs <= nowMs) {
    routeUnavailableUntilByApiOrigin.delete(apiOrigin)
    return false
  }
  return true
}

export const isLikelyHtmlDocument = (value: string): boolean => {
  const text = String(value || '').trim().toLowerCase()
  return text.startsWith('<!doctype html') || text.startsWith('<html')
}

export const isNetworkLoadFailure = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  const rec = error as { name?: unknown; message?: unknown }
  const name = String(rec.name || '').trim().toLowerCase()
  const message = String(rec.message || '').trim().toLowerCase()
  return (
    name === 'typeerror'
    && (
      message.includes('load failed')
      || message.includes('failed to fetch')
      || message.includes('networkerror')
    )
  )
}

const readBoundedStorageResponseText = async (response: Response): Promise<string> => {
  const declaredText = response.headers.get('content-length')
  if (declaredText && /^\d+$/.test(declaredText)) {
    const declaredBytes = Number(declaredText)
    if (Number.isSafeInteger(declaredBytes) && declaredBytes > AGENTICGRAPH_STORAGE_SYNC_LIMITS.maxResponseBytes) {
      try { await response.body?.cancel('storage response exceeds the byte limit') } catch { /* already locked */ }
      throw new AgenticGraphStorageResponseLimitError(
        `agenticgraph storage response exceeds ${AGENTICGRAPH_STORAGE_SYNC_LIMITS.maxResponseBytes} bytes`,
      )
    }
  }
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let text = ''
  let totalBytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      totalBytes += next.value.byteLength
      if (totalBytes > AGENTICGRAPH_STORAGE_SYNC_LIMITS.maxResponseBytes) {
        await reader.cancel('storage response exceeds the byte limit')
        throw new AgenticGraphStorageResponseLimitError(
          `agenticgraph storage response exceeds ${AGENTICGRAPH_STORAGE_SYNC_LIMITS.maxResponseBytes} bytes`,
        )
      }
      text += decoder.decode(next.value, { stream: true })
    }
    text += decoder.decode()
    return text
  } catch (error) {
    if (error instanceof AgenticGraphStorageResponseLimitError) throw error
    try { await reader.cancel('storage response stream failed') } catch { /* already closed */ }
    throw new Error('agenticgraph storage response is unreadable')
  } finally {
    try { reader.releaseLock() } catch { /* already released */ }
  }
}

export const parseStorageResponseJson = async <T>(
  response: Response,
  args: { requestLabel: string; apiOrigin: string },
): Promise<T> => {
  const contentType = normalizeString(response.headers.get('content-type')).toLowerCase()
  const text = await readBoundedStorageResponseText(response)
  const trimmed = String(text || '').trim()
  const isJsonLikeContentType = contentType.includes('application/json') || contentType.endsWith('+json')
  const routeUnavailable =
    response.status === 404
    || (!trimmed && !response.ok)
    || isLikelyHtmlDocument(trimmed)
  if (routeUnavailable) {
    markRouteUnavailableForApiOrigin(args.apiOrigin)
    throw new AgenticGraphStorageRouteUnavailableError(
      `${args.requestLabel} is unavailable for ${args.apiOrigin}`,
      args.apiOrigin,
    )
  }
  if (!trimmed) {
    throw new Error(`${args.requestLabel} returned an empty response body`)
  }
  try {
    return JSON.parse(trimmed) as T
  } catch (error) {
    if (!isJsonLikeContentType) {
      throw new Error(`${args.requestLabel} returned a non-JSON response (${contentType || 'unknown content type'})`)
    }
    const message = error instanceof Error ? error.message : 'invalid JSON'
    throw new Error(`${args.requestLabel} returned invalid JSON: ${message}`)
  }
}

export const buildSkippedSyncResult = (args: {
  workspaceId: string
  deviceId: string
  currentCursor: Awaited<ReturnType<typeof readCursorRow>>
  unresolvedConflictCount: number
  transportError?: string | null
}): AgenticGraphStorageSyncRunResult => ({
  transportStatus: 'offline-queued',
  workspaceId: args.workspaceId,
  deviceId: args.deviceId,
  pushedCount: 0,
  pulledDocumentCount: 0,
  pulledChunkCount: 0,
  pulledGraphSnapshotCount: 0,
  appliedCount: 0,
  conflictCount: 0,
  rejectedCount: 0,
  deferredCount: 0,
  unresolvedConflictCount: args.unresolvedConflictCount,
  conflictEntries: [],
  transportError: normalizeString(args.transportError) || null,
  lastPushCursor: normalizeString(args.currentCursor?.get('lastPushCursor')) || null,
  lastPullCursor: normalizeString(args.currentCursor?.get('lastPullCursor')) || null,
})

export const resolveAgenticGraphStorageApiUrl = (path: string, baseUrl?: string | null): string => {
  const safePath = normalizeString(path)
  const explicitBase = normalizeString(baseUrl)
  if (/^https?:\/\//i.test(safePath)) return safePath
  if (typeof window !== 'undefined') {
    const host = normalizeString(window.location?.hostname).toLowerCase()
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
    const isStoragePath = safePath.startsWith('/api/storage/')
    if (isLocalhost && isStoragePath) {
      // Use same-origin dev proxy to avoid browser CORS/TLS policy failures.
      return safePath
    }
  }
  if (explicitBase) return new URL(safePath, explicitBase.endsWith('/') ? explicitBase : `${explicitBase}/`).toString()
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(safePath, window.location.origin).toString()
  }
  return new URL(safePath, 'https://example.invalid').toString()
}
