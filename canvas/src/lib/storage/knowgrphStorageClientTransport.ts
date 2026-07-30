import { KNOWGRPH_STORAGE_SYNC_BOUNDS } from '@/lib/storage/knowgrphStorageBounds'
import type {
  KnowgrphStorageFetchLike,
  KnowgrphStorageSyncNowArgs,
  KnowgrphStorageSyncRunResult,
} from '@/lib/storage/knowgrphStorageClientTypes'
import { KNOWGRPH_STORAGE_ROUTE_PATHS } from '@/lib/storage/knowgrphStorageRoutePaths'
import {
  KNOWGRPH_STORAGE_ROUTE_UNAVAILABLE_RETRY_MS,
  normalizePositiveInt,
  normalizeString,
  readCursorRow,
} from '@/lib/storage/knowgrphStorageClientSupport'

export const routeUnavailableUntilByApiOrigin = new Map<string, number>()

export const __resetKnowgrphStorageRouteAvailabilityForTests = (): void => {
  routeUnavailableUntilByApiOrigin.clear()
}

export class KnowgrphStorageRouteUnavailableError extends Error {
  apiOrigin: string

  constructor(message: string, apiOrigin: string) {
    super(message)
    this.name = 'KnowgrphStorageRouteUnavailableError'
    this.apiOrigin = apiOrigin
  }
}

export class KnowgrphStorageRetryableTransportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KnowgrphStorageRetryableTransportError'
  }
}

export class KnowgrphStorageRetryExhaustedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KnowgrphStorageRetryExhaustedError'
  }
}



export const getClientFetch = (value?: KnowgrphStorageFetchLike): KnowgrphStorageFetchLike => {
  if (value) return value
  if (typeof fetch !== 'function') throw new Error('fetch is not available for knowgrph storage sync')
  return fetch
}

export const sleep = async (
  delayMs: number,
  sleepImpl?: KnowgrphStorageSyncNowArgs['sleepImpl'],
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
  fetchImpl: KnowgrphStorageFetchLike
  input: RequestInfo | URL
  init: RequestInit
  timeoutMs?: number
}): Promise<Response> => {
  const timeoutMs = normalizePositiveInt(
    args.timeoutMs,
    KNOWGRPH_STORAGE_SYNC_BOUNDS.pushRequestTimeoutMs,
  )
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      controller.abort()
      reject(new KnowgrphStorageRetryableTransportError(
        `knowgrph storage request timed out after ${timeoutMs}ms`,
      ))
    }, timeoutMs)
  })
  try {
    return await Promise.race([
      args.fetchImpl(args.input, { ...args.init, signal: controller.signal }),
      timeout,
    ])
  } catch (error) {
    if (error instanceof KnowgrphStorageRetryableTransportError) throw error
    const name = error && typeof error === 'object'
      ? normalizeString((error as { name?: unknown }).name).toLowerCase()
      : ''
    if (name === 'aborterror' || isNetworkLoadFailure(error)) {
      throw new KnowgrphStorageRetryableTransportError(
        error instanceof Error ? error.message : 'knowgrph storage network request failed',
      )
    }
    throw error
  } finally {
    if (timeoutId != null) globalThis.clearTimeout(timeoutId)
  }
}

export const buildApiOriginKey = (baseUrl?: string | null): string => {
  try {
    return new URL(resolveKnowgrphStorageApiUrl(KNOWGRPH_STORAGE_ROUTE_PATHS.push, baseUrl)).origin
  } catch {
    return normalizeString(baseUrl) || 'window-origin'
  }
}

export const markRouteUnavailableForApiOrigin = (apiOrigin: string, nowMs = Date.now()): void => {
  if (!apiOrigin) return
  const existingUntilMs = Number(routeUnavailableUntilByApiOrigin.get(apiOrigin) || 0)
  const shouldLog = !Number.isFinite(existingUntilMs) || existingUntilMs <= nowMs
  routeUnavailableUntilByApiOrigin.set(apiOrigin, nowMs + KNOWGRPH_STORAGE_ROUTE_UNAVAILABLE_RETRY_MS)
  if (shouldLog) {
    console.warn(`[knowgrph-storage] route unavailable for ${apiOrigin} — retry in ${KNOWGRPH_STORAGE_ROUTE_UNAVAILABLE_RETRY_MS}ms`)
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

export const parseStorageResponseJson = async <T>(
  response: Response,
  args: { requestLabel: string; apiOrigin: string },
): Promise<T> => {
  const contentType = normalizeString(response.headers.get('content-type')).toLowerCase()
  const text = await response.text()
  const trimmed = String(text || '').trim()
  const isJsonLikeContentType = contentType.includes('application/json') || contentType.endsWith('+json')
  const routeUnavailable =
    response.status === 404
    || (!trimmed && !response.ok)
    || isLikelyHtmlDocument(trimmed)
  if (routeUnavailable) {
    markRouteUnavailableForApiOrigin(args.apiOrigin)
    throw new KnowgrphStorageRouteUnavailableError(
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
}): KnowgrphStorageSyncRunResult => ({
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

export const resolveKnowgrphStorageApiUrl = (path: string, baseUrl?: string | null): string => {
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
