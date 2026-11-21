import { readWorkspaceFrameFormat } from '@/lib/rich-media/videoFrameSettings'
import {
  type RemoteVideoFrameFormat,
  buildRemoteVideoFrameRequestUrl,
  buildRemoteVideoFrameSemanticKey,
  normalizeRemoteVideoFrameFormat,
  normalizeRemoteVideoFrameSeconds,
} from 'grph-shared/rich-media/providers'

export type RemoteVideoFrameExtractionOk = {
  ok: true
  imageUrl: string
  publicUrl: string
  semanticKey: string
  cached: boolean
  bytes: number
  timeSeconds: number
  format: RemoteVideoFrameFormat
}

export type RemoteVideoFrameExtractionErr = {
  ok: false
  error: string
}

export type RemoteVideoFrameExtractionResult = RemoteVideoFrameExtractionOk | RemoteVideoFrameExtractionErr

const VIDEO_FRAME_CACHE_LIMIT = 24
const VIDEO_FRAME_TIMEOUT_MS = 75_000
const frameCache = new Map<string, RemoteVideoFrameExtractionResult>()
const frameInflight = new Map<string, Promise<RemoteVideoFrameExtractionResult | null>>()

const readError = (value: unknown, fallback: string): string => {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

const writeCached = (key: string, result: RemoteVideoFrameExtractionResult): RemoteVideoFrameExtractionResult => {
  frameCache.set(key, result)
  while (frameCache.size > VIDEO_FRAME_CACHE_LIMIT) {
    const oldest = frameCache.keys().next().value
    if (typeof oldest === 'string') frameCache.delete(oldest)
    else break
  }
  return result
}

export async function fetchRemoteVideoTimestampFrame(args: {
  sourceUrl: string
  timeSeconds: number
  format?: string
  timeoutMs?: number
}): Promise<RemoteVideoFrameExtractionResult | null> {
  const sourceUrl = String(args.sourceUrl || '').trim()
  const timeSeconds = normalizeRemoteVideoFrameSeconds(args.timeSeconds)
  if (!sourceUrl || timeSeconds == null) return null
  const format = normalizeRemoteVideoFrameFormat(args.format ?? readWorkspaceFrameFormat())
  const key = buildRemoteVideoFrameSemanticKey({ sourceUrl, timeSeconds, format })
  const cached = frameCache.get(key)
  if (cached) return cached
  const inflight = frameInflight.get(key)
  if (inflight) return await inflight

  const timeoutMs = (() => {
    const raw = Number(args.timeoutMs)
    if (!Number.isFinite(raw)) return VIDEO_FRAME_TIMEOUT_MS
    return Math.max(10_000, Math.min(10 * 60_000, Math.floor(raw)))
  })()

  const request = (async (): Promise<RemoteVideoFrameExtractionResult> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const requestUrl = buildRemoteVideoFrameRequestUrl({
        sourceUrl,
        timeSeconds,
        format,
        emit: 'json',
      })
      if (!requestUrl) return { ok: false, error: 'Invalid video frame request' }
      const res = await fetch(requestUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
      const json = await res.json().catch(() => null) as {
        ok?: unknown
        imageUrl?: unknown
        publicUrl?: unknown
        semanticKey?: unknown
        cached?: unknown
        bytes?: unknown
        timeSeconds?: unknown
        format?: unknown
        error?: unknown
      } | null
      if (json?.ok === true) {
        const imageUrl = typeof json.imageUrl === 'string' ? json.imageUrl.trim() : ''
        const publicUrl = typeof json.publicUrl === 'string' ? json.publicUrl.trim() : imageUrl
        if (imageUrl || publicUrl) {
          return writeCached(key, {
            ok: true,
            imageUrl: imageUrl || publicUrl,
            publicUrl: publicUrl || imageUrl,
            semanticKey: typeof json.semanticKey === 'string' && json.semanticKey.trim() ? json.semanticKey.trim() : key,
            cached: json.cached === true,
            bytes: typeof json.bytes === 'number' && Number.isFinite(json.bytes) ? Math.max(0, Math.floor(json.bytes)) : 0,
            timeSeconds,
            format: normalizeRemoteVideoFrameFormat(json.format || format),
          })
        }
      }
      const error = readError(json?.error, res.ok ? 'Video frame extraction failed' : `HTTP ${res.status}`)
      return { ok: false, error }
    } catch (error) {
      if (controller.signal.aborted) return { ok: false, error: `Video frame extraction timed out after ${timeoutMs}ms` }
      const message = error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : ''
      return { ok: false, error: message.trim() || 'Request failed' }
    } finally {
      clearTimeout(timeoutId)
    }
  })()

  frameInflight.set(key, request)
  try {
    return await request
  } finally {
    frameInflight.delete(key)
  }
}
