import type { FetchBound } from 'grph-shared/geospatial/enhancedLayerContract'
import { applyDevCrossOriginProxy, coerceFetchUrl } from './lib/url.js'
import {
  clearEnhancedResourceCache,
  readEnhancedResourceCache,
  writeEnhancedResourceCache,
} from './enhancedResourceCache.js'

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

export const MAX_ENHANCED_LAYER_READINESS_MS = 10_000

export { clearEnhancedResourceCache }

export const resolveEffectiveResourceTimeoutMs = (configuredTimeoutMs: number): number => (
  Math.min(configuredTimeoutMs, MAX_ENHANCED_LAYER_READINESS_MS)
)

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
  const cached = readEnhancedResourceCache(fetchUrl, args.bound.maxBytes)
  if (cached.kind === 'max-bytes-exceeded') {
    return {
      ok: false,
      failure: {
        code: 'max-bytes-exceeded',
        target: args.target,
        maxBytes: args.bound.maxBytes,
      },
    }
  }
  if (cached.kind === 'hit') {
    reportProgress(args.onProgress, cached.bytes.byteLength, cached.bytes.byteLength)
    return { ok: true, bytes: cached.bytes, fromCache: true }
  }
  if (args.cacheOnly) return { ok: false, failure: { code: 'network-unavailable', target: args.target } }

  const controller = new AbortController()
  let timedOut = false
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  const effectiveTimeoutMs = resolveEffectiveResourceTimeoutMs(args.bound.timeoutMs)
  let rejectDeadline: ((reason: Error) => void) | null = null
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject
  })
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
    void reader?.cancel().catch(() => undefined)
    rejectDeadline?.(new Error('enhanced-resource-timeout'))
  }, effectiveTimeoutMs)
  try {
    const networkLoad = (async (): Promise<BoundedResourceResult> => {
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
      reader = response.body.getReader()
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
      if (controller.signal.aborted) throw new Error('enhanced-resource-aborted')
      const bytes = new Uint8Array(receivedBytes)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
      writeEnhancedResourceCache(fetchUrl, bytes)
      reportProgress(args.onProgress, receivedBytes, receivedBytes)
      return { ok: true, bytes, fromCache: false }
    })()
    return await Promise.race([networkLoad, deadline])
  } catch {
    if (timedOut) {
      return { ok: false, failure: { code: 'timeout', target: args.target, timeoutMs: effectiveTimeoutMs } }
    }
    return { ok: false, failure: { code: 'network-unavailable', target: args.target } }
  } finally {
    clearTimeout(timeout)
  }
}
