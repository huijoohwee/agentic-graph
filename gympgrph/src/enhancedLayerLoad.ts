import type { FetchBound } from 'grph-shared/geospatial/enhancedLayerContract'
import { applyDevCrossOriginProxy, coerceFetchUrl } from './lib/url.js'

export type LoadProgress =
  | { kind: 'determinate'; receivedBytes: number; totalBytes: number; percent: number }
  | { kind: 'indeterminate'; receivedBytes: number }

export type LoadFailure =
  | { code: 'missing-fetch-bound'; key: 'timeoutMs' | 'maxBytes' }
  | { code: 'max-bytes-exceeded'; target: string; maxBytes: number }
  | { code: 'timeout'; target: string; timeoutMs: number }
  | { code: 'network-unavailable'; target: string }
  | { code: 'parse-failed'; target: string }

export type BoundedResourceResult =
  | { ok: true; bytes: Uint8Array; fromCache: boolean }
  | { ok: false; failure: LoadFailure }

const resourceCache = new Map<string, Uint8Array>()

export const clearEnhancedResourceCache = (): void => resourceCache.clear()

export const resolveEnhancedFetchUrl = (rawUrl: string): string | null => {
  const fetchUrl = coerceFetchUrl(rawUrl)
  return fetchUrl ? applyDevCrossOriginProxy(fetchUrl) : null
}

const reportProgress = (
  callback: ((progress: LoadProgress) => void) | undefined,
  receivedBytes: number,
  totalBytes: number | null,
): void => {
  if (!callback) return
  if (totalBytes != null && totalBytes > 0) {
    callback({
      kind: 'determinate',
      receivedBytes,
      totalBytes,
      percent: Math.max(0, Math.min(100, Math.round(receivedBytes / totalBytes * 100))),
    })
    return
  }
  callback({ kind: 'indeterminate', receivedBytes })
}

export async function loadBoundedResource(args: {
  target: string
  url: string
  bound: FetchBound
  onProgress?: (progress: LoadProgress) => void
  cacheOnly?: boolean
}): Promise<BoundedResourceResult> {
  if (!Number.isFinite(args.bound?.timeoutMs) || args.bound.timeoutMs <= 0) {
    return { ok: false, failure: { code: 'missing-fetch-bound', key: 'timeoutMs' } }
  }
  if (!Number.isFinite(args.bound?.maxBytes) || args.bound.maxBytes <= 0) {
    return { ok: false, failure: { code: 'missing-fetch-bound', key: 'maxBytes' } }
  }
  const fetchUrl = resolveEnhancedFetchUrl(args.url)
  if (!fetchUrl) return { ok: false, failure: { code: 'network-unavailable', target: args.target } }
  const cached = resourceCache.get(fetchUrl)
  if (cached) {
    reportProgress(args.onProgress, cached.byteLength, cached.byteLength)
    return { ok: true, bytes: cached.slice(), fromCache: true }
  }
  if (args.cacheOnly) return { ok: false, failure: { code: 'network-unavailable', target: args.target } }

  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, args.bound.timeoutMs)
  try {
    const response = await fetch(fetchUrl, { signal: controller.signal })
    if (!response.ok || !response.body) {
      return { ok: false, failure: { code: 'network-unavailable', target: args.target } }
    }
    const contentLength = Number(response.headers.get('content-length'))
    const totalBytes = Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : null
    if (totalBytes != null && totalBytes > args.bound.maxBytes) {
      controller.abort()
      return { ok: false, failure: { code: 'max-bytes-exceeded', target: args.target, maxBytes: args.bound.maxBytes } }
    }
    const chunks: Uint8Array[] = []
    let receivedBytes = 0
    reportProgress(args.onProgress, 0, totalBytes)
    const reader = response.body.getReader()
    while (true) {
      const next = await reader.read()
      if (next.done) break
      receivedBytes += next.value.byteLength
      if (receivedBytes > args.bound.maxBytes) {
        await reader.cancel()
        return { ok: false, failure: { code: 'max-bytes-exceeded', target: args.target, maxBytes: args.bound.maxBytes } }
      }
      chunks.push(next.value)
      reportProgress(args.onProgress, receivedBytes, totalBytes)
    }
    const bytes = new Uint8Array(receivedBytes)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    resourceCache.set(fetchUrl, bytes.slice())
    reportProgress(args.onProgress, receivedBytes, receivedBytes)
    return { ok: true, bytes, fromCache: false }
  } catch {
    if (timedOut) {
      return { ok: false, failure: { code: 'timeout', target: args.target, timeoutMs: args.bound.timeoutMs } }
    }
    return { ok: false, failure: { code: 'network-unavailable', target: args.target } }
  } finally {
    clearTimeout(timeout)
  }
}
