import React from 'react'
import { runAsyncEffect } from '@/lib/async/asyncEffectRunner'
import type { WebpageLayoutSnapshot } from '@/lib/websites/webpageLayoutExport'
import type { WebpageLayoutProbePreset } from '@/lib/websites/webpageLayoutPresets'
import { getCachedWebpageLayoutSnapshot, setCachedWebpageLayoutSnapshot } from '@/lib/websites/webpageLayoutCache'
import { shouldAutoLoadWebpageSnapshot } from 'grph-shared/rich-media/webpageSnapshot'
import { getWebpageFallbackInfo } from 'grph-shared/rich-media/webpageFallback'
import { getOrFetchWebpageMeta } from 'grph-shared/rich-media/webpageMeta'
import { getDefaultFaviconUrlForWebpageUrl, getKnownHostIconUrlForWebpageUrl } from 'grph-shared/rich-media/webpagePreview'
import { applyImageLikeProxySrc } from '@/lib/url'

export function isNoiseProneWebpagePreviewHost(rawUrl: string): boolean {
  try {
    const host = String(new URL(rawUrl).hostname || '').toLowerCase()
    if (!host) return false
    if (host === 'example.com' || host.endsWith('.example.com')) return true
    if (host === 'example.org' || host.endsWith('.example.org')) return true
    if (host === 'example.net' || host.endsWith('.example.net')) return true
    if (host === 'localhost' || host === '127.0.0.1') return true
    if (host.endsWith('.test') || host.endsWith('.invalid')) return true
    return false
  } catch {
    return false
  }
}

export function shouldAutoLoadWebpageLayoutSnapshot(args?: {
  allowNodeJsUserAgent?: boolean
  suppressNoiseProneHosts?: boolean
  url?: string
}): boolean {
  const url = String(args?.url || '').trim()
  if (args?.suppressNoiseProneHosts !== false && url && isNoiseProneWebpagePreviewHost(url)) {
    return false
  }
  return shouldAutoLoadWebpageSnapshot({
    allowNodeJsUserAgent: args?.allowNodeJsUserAgent === true,
  })
}

export function canStartWebpageLayoutProbe(): boolean {
  try {
    if (typeof document === 'undefined') return false
    if (!document.body) return false
    if (!document.body.isConnected) return false
    const readyState = String(document.readyState || '')
    if (readyState === 'loading') return false
    return true
  } catch {
    return false
  }
}

export function parseWebpageLayoutSnapshotPayload(raw: unknown): WebpageLayoutSnapshot | null {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text || !text.startsWith('{')) return null
  const parsed = (() => {
    try {
      return JSON.parse(text) as unknown
    } catch {
      return null
    }
  })()
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const objectValue = parsed as { meta?: unknown; elements?: unknown }
  const meta = objectValue.meta as { kind?: unknown } | null
  const elements = objectValue.elements as unknown
  if (!meta || meta.kind !== 'layout' || !Array.isArray(elements)) return null
  return parsed as WebpageLayoutSnapshot
}

export async function probeWebpageLayoutSnapshot(args: {
  url: string
  maxElements: number
  viewportW: number
  viewportH: number
  timeoutMs: number
  networkIdleMs: number
  domQuietMs: number
  minWaitAfterLoadMs: number
  scrollCrawl?: boolean
  expandDisclosures?: boolean
  waitForNetworkIdle?: boolean
  signal?: AbortSignal
}): Promise<
  | { ok: true; snapshot: WebpageLayoutSnapshot }
  | { ok: false; blocked: boolean; stage: string; error: string }
> {
  try {
    const mod = await import('@/lib/websites/webpageDomExport')
    const probe = await mod.probeWebpageDomViaHiddenIframe({
      url: args.url,
      mode: 'layout',
      maxElements: args.maxElements,
      scrollCrawl: args.scrollCrawl !== false,
      expandDisclosures: args.expandDisclosures !== false,
      timeoutMs: args.timeoutMs,
      waitForNetworkIdle: args.waitForNetworkIdle !== false,
      networkIdleMs: args.networkIdleMs,
      domQuietMs: args.domQuietMs,
      minWaitAfterLoadMs: args.minWaitAfterLoadMs,
      viewportW: args.viewportW,
      viewportH: args.viewportH,
      signal: args.signal,
    })
    if (!probe.ok) {
      const stage = typeof (probe as { stage?: unknown }).stage === 'string' ? String((probe as { stage?: unknown }).stage) : 'probe'
      const error = typeof (probe as { error?: unknown }).error === 'string' ? String((probe as { error?: unknown }).error) : 'Probe failed'
      return { ok: false, blocked: stage === 'blocked', stage, error }
    }
    const snapshot = parseWebpageLayoutSnapshotPayload(probe.result?.text)
    if (!snapshot) {
      return { ok: false, blocked: false, stage: 'invalid_payload', error: 'Invalid snapshot payload' }
    }
    return { ok: true, snapshot }
  } catch (error) {
    const message =
      error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message || '') : 'Request failed'
    return { ok: false, blocked: false, stage: 'request', error: message || 'Request failed' }
  }
}

export type WebpageLayoutSnapshotLoadSuccess = {
  ok: true
  snapshot: WebpageLayoutSnapshot
  source: 'cache' | 'probe'
}

export type WebpageLayoutSnapshotLoadFailure = {
  ok: false
  blocked: boolean
  stage: string
  error: string
  source: 'probe'
}

export type WebpageLayoutSnapshotLoadResult = WebpageLayoutSnapshotLoadSuccess | WebpageLayoutSnapshotLoadFailure

function isWebpageLayoutSnapshotLoadFailure(
  result: WebpageLayoutSnapshotLoadResult,
): result is WebpageLayoutSnapshotLoadFailure {
  return result.ok === false
}

function isWebpageLayoutProbeFailure(
  result: { ok: true; snapshot: WebpageLayoutSnapshot } | { ok: false; blocked: boolean; stage: string; error: string },
): result is { ok: false; blocked: boolean; stage: string; error: string } {
  return result.ok === false
}

export async function loadWebpageLayoutSnapshotWithCache(args: {
  url: string
  layoutPreset: WebpageLayoutProbePreset
  layoutCacheKey: string
  allowCache?: boolean
  signal?: AbortSignal
}): Promise<WebpageLayoutSnapshotLoadResult> {
  const url = String(args.url || '').trim()
  if (args.allowCache !== false) {
    const cached = getCachedWebpageLayoutSnapshot(url, args.layoutCacheKey)
    if (cached) {
      return {
        ok: true,
        snapshot: cached,
        source: 'cache',
      }
    }
  }
  const probe = await probeWebpageLayoutSnapshot({
    url,
    maxElements: args.layoutPreset.maxElements,
    timeoutMs: args.layoutPreset.timeoutMs,
    networkIdleMs: args.layoutPreset.networkIdleMs,
    domQuietMs: args.layoutPreset.domQuietMs,
    minWaitAfterLoadMs: args.layoutPreset.minWaitAfterLoadMs,
    viewportW: args.layoutPreset.viewportW,
    viewportH: args.layoutPreset.viewportH,
    scrollCrawl: args.layoutPreset.scrollCrawl,
    expandDisclosures: args.layoutPreset.expandDisclosures,
    waitForNetworkIdle: args.layoutPreset.waitForNetworkIdle,
    signal: args.signal,
  })
  if (isWebpageLayoutProbeFailure(probe)) {
    return {
      ok: false,
      blocked: probe.blocked,
      stage: probe.stage,
      error: probe.error,
      source: 'probe',
    }
  }
  setCachedWebpageLayoutSnapshot(url, probe.snapshot, args.layoutCacheKey)
  return {
    ok: true,
    snapshot: probe.snapshot,
    source: 'probe',
  }
}

export type WebpageLayoutExportStatusConsumer = 'wireframe'

function getWebpageLayoutExportStatusCopy(consumer: WebpageLayoutExportStatusConsumer): {
  loadingLabel: string
  readyLabel: string
  retryingLabel: string
  toastErrorPrefix: string
} {
  switch (consumer) {
    case 'wireframe':
      return {
        loadingLabel: 'Loading webpage for wireframe…',
        readyLabel: 'Wireframe ready',
        retryingLabel: 'Retrying…',
        toastErrorPrefix: 'Webpage wireframe export failed',
      }
  }
}

function normalizeWebpageLayoutExportErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    const trimmed = error.trim()
    if (trimmed) return trimmed
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message || '').trim()
    if (message) return message
  }
  return 'Request failed'
}

export function formatWebpageLayoutExportStatus(args: {
  consumer: WebpageLayoutExportStatusConsumer
  phase: 'cached' | 'loading' | 'ready' | 'retrying'
  elementCount?: number | null
  nodeCount?: number | null
}): string {
  const copy = getWebpageLayoutExportStatusCopy(args.consumer)
  if (args.phase === 'cached') return 'Loaded from cache'
  if (args.phase === 'loading') return copy.loadingLabel
  if (args.phase === 'retrying') return copy.retryingLabel
  const elementCount = Number.isFinite(args.elementCount) ? Math.max(0, Math.floor(Number(args.elementCount))) : 0
  const nodeCount = Number.isFinite(args.nodeCount) ? Math.max(0, Math.floor(Number(args.nodeCount))) : null
  return nodeCount != null
    ? `${copy.readyLabel} — elements=${elementCount}, nodes=${nodeCount}`
    : `${copy.readyLabel} — elements=${elementCount}`
}

export function formatWebpageLayoutExportError(args: {
  consumer: WebpageLayoutExportStatusConsumer
  error?: unknown
  stage?: string | null
}): {
  detail: string
  statusMessage: string
  toastMessage: string
} {
  const copy = getWebpageLayoutExportStatusCopy(args.consumer)
  const detail = normalizeWebpageLayoutExportErrorMessage(args.error)
  const stage = String(args.stage || '').trim()
  const suffix = stage ? ` (${stage}): ${detail}` : `: ${detail}`
  return {
    detail,
    statusMessage: `Export failed${suffix}`,
    toastMessage: `${copy.toastErrorPrefix}${suffix}`,
  }
}

export type WebpageLayoutExportOutcome =
  | {
      status: 'ready'
      blocked: false
      snapshot: WebpageLayoutSnapshot
      source: 'cache' | 'probe'
      statusMessage: string
      toastMessage: null
    }
  | {
      status: 'error'
      blocked: boolean
      snapshot: null
      source: 'probe'
      statusMessage: string
      toastMessage: string
    }

export function resolveWebpageLayoutExportOutcome(args: {
  consumer: WebpageLayoutExportStatusConsumer
  loadResult?: WebpageLayoutSnapshotLoadResult | null
  error?: unknown
  stage?: string | null
  nodeCount?: number | null
}): WebpageLayoutExportOutcome {
  if (args.loadResult) {
    if (isWebpageLayoutSnapshotLoadFailure(args.loadResult)) {
      const failure = formatWebpageLayoutExportError({
        consumer: args.consumer,
        stage: args.loadResult.stage,
        error: args.loadResult.error,
      })
      return {
        status: 'error',
        blocked: args.loadResult.blocked,
        snapshot: null,
        source: 'probe',
        statusMessage: failure.statusMessage,
        toastMessage: failure.toastMessage,
      }
    }
    const snapshot = args.loadResult.snapshot
    const elementCount = Array.isArray(snapshot.elements) ? snapshot.elements.length : 0
    return {
      status: 'ready',
      blocked: false,
      snapshot,
      source: args.loadResult.source,
      statusMessage: formatWebpageLayoutExportStatus({
        consumer: args.consumer,
        phase: args.loadResult.source === 'cache' ? 'cached' : 'ready',
        elementCount,
        nodeCount: args.nodeCount,
      }),
      toastMessage: null,
    }
  }
  const failure = formatWebpageLayoutExportError({
    consumer: args.consumer,
    stage: args.stage,
    error: args.error,
  })
  return {
    status: 'error',
    blocked: String(args.stage || '').trim() === 'blocked',
    snapshot: null,
    source: 'probe',
    statusMessage: failure.statusMessage,
    toastMessage: failure.toastMessage,
  }
}

export function applyWebpageLayoutExportOutcome(args: {
  outcome: WebpageLayoutExportOutcome
  setSnapshot: (snapshot: WebpageLayoutSnapshot | null) => void
  setStatus: (status: 'ready' | 'error') => void
  setStatusMessage: (message: string) => void
  setToastMessage?: (message: string) => void
  setProgress?: (progress: number) => void
  readyProgress?: number
}): void {
  if (args.outcome.status === 'error') {
    args.setSnapshot(null)
    args.setStatus('error')
    args.setStatusMessage(args.outcome.statusMessage)
    args.setToastMessage?.(args.outcome.toastMessage)
    return
  }
  args.setSnapshot(args.outcome.snapshot)
  args.setStatus('ready')
  if (typeof args.setProgress === 'function') {
    const progress = Number.isFinite(args.readyProgress) ? Math.max(0, Math.floor(Number(args.readyProgress))) : 100
    args.setProgress(progress)
  }
  args.setStatusMessage(args.outcome.statusMessage)
}

export function emitWebpageLayoutExportWarningToast(args: {
  message: string
  toastId: string
  ttlMs?: number | null
  pushToast?: (toast: { id: string; kind: 'warning'; message: string; ttlMs?: number | null }) => void
}): void {
  const message = String(args.message || '').trim()
  const toastId = String(args.toastId || '').trim()
  if (!message || !toastId || typeof args.pushToast !== 'function') return
  try {
    args.pushToast({
      id: toastId,
      kind: 'warning',
      message,
      ttlMs: args.ttlMs ?? 8000,
    })
  } catch {
    void 0
  }
}

export function useWebpageLayoutSnapshotLifecycle(args: {
  url: string
  layoutPreset: WebpageLayoutProbePreset
  layoutCacheKey: string
  enabled?: boolean
  resetOnDisabled?: boolean
  skipSnapshot?: boolean
  allowNodeJsUserAgent?: boolean
  requireProbeReady?: boolean
  yieldBeforeProbe?: boolean
  maxAttempts?: number
  readyRetryDelayMs?: number
  retryBaseDelayMs?: number
  retryStepDelayMs?: number
}) {
  const {
    allowNodeJsUserAgent = false,
    enabled = true,
    layoutCacheKey,
    layoutPreset,
    maxAttempts = 1,
    readyRetryDelayMs = 120,
    requireProbeReady = false,
    resetOnDisabled = false,
    retryBaseDelayMs = 650,
    retryStepDelayMs = 800,
    skipSnapshot = false,
    url: rawUrl,
    yieldBeforeProbe = false,
  } = args
  const url = String(rawUrl || '').trim()
  const [snap, setSnap] = React.useState<WebpageLayoutSnapshot | null>(() => {
    if (!url || skipSnapshot || !enabled) return null
    return getCachedWebpageLayoutSnapshot(url, layoutCacheKey)
  })
  const [blocked, setBlocked] = React.useState<boolean>(false)
  const [retrySeq, setRetrySeq] = React.useState<number>(0)
  const attemptRef = React.useRef<{ url: string; count: number }>({ url: '', count: 0 })

  React.useEffect(() => {
    const resetAttempts = () => {
      attemptRef.current = { url: '', count: 0 }
    }
    if (!url) {
      resetAttempts()
      setSnap(null)
      setBlocked(false)
      return
    }
    if (skipSnapshot) {
      attemptRef.current = { url, count: 0 }
      setSnap(null)
      setBlocked(false)
      return
    }
    if (!enabled) {
      attemptRef.current = { url, count: 0 }
      setBlocked(false)
      if (resetOnDisabled) setSnap(null)
      return
    }
    if (attemptRef.current.url !== url) attemptRef.current = { url, count: 0 }
    setBlocked(false)
    if (!shouldAutoLoadWebpageLayoutSnapshot({ allowNodeJsUserAgent, url })) {
      return
    }
    if (requireProbeReady && !canStartWebpageLayoutProbe()) {
      const timer = window.setTimeout(() => {
        setRetrySeq(seq => seq + 1)
      }, readyRetryDelayMs)
      return () => {
        window.clearTimeout(timer)
      }
    }
    if (attemptRef.current.count >= maxAttempts) return
    attemptRef.current.count += 1
    const attemptCount = attemptRef.current.count
    let retryTimer: number | undefined
    return runAsyncEffect({
      onCleanup: () => {
        try {
          if (typeof retryTimer === 'number') window.clearTimeout(retryTimer)
        } catch {
          void 0
        }
      },
      onError: (_error, { isStale }) => {
        if (isStale()) return
        if (attemptCount < maxAttempts) {
          const delay = retryBaseDelayMs + attemptCount * retryStepDelayMs
          retryTimer = window.setTimeout(() => {
            setRetrySeq(seq => seq + 1)
          }, delay)
        }
      },
      run: async ({ signal, isStale }) => {
        if (yieldBeforeProbe) {
          await new Promise<void>(resolve => {
            const raf = (typeof window !== 'undefined' ? window.requestAnimationFrame : null) as unknown as
              | ((cb: () => void) => number)
              | null
            if (raf) raf(() => resolve())
            else setTimeout(() => resolve(), 0)
          })
        }
        const load = await loadWebpageLayoutSnapshotWithCache({
          url,
          layoutPreset,
          layoutCacheKey,
          signal,
        })
        if (isStale()) return
        if (isWebpageLayoutSnapshotLoadFailure(load)) {
          if (load.blocked) {
            setBlocked(true)
            attemptRef.current = { url, count: maxAttempts }
            return
          }
          if (attemptCount < maxAttempts) {
            const delay = retryBaseDelayMs + attemptCount * retryStepDelayMs
            retryTimer = window.setTimeout(() => {
              setRetrySeq(seq => seq + 1)
            }, delay)
          }
          return
        }
        setSnap(load.snapshot)
        attemptRef.current = { url, count: 0 }
      },
    })
  }, [
    allowNodeJsUserAgent,
    enabled,
    layoutCacheKey,
    layoutPreset,
    maxAttempts,
    readyRetryDelayMs,
    requireProbeReady,
    resetOnDisabled,
    retryBaseDelayMs,
    retrySeq,
    retryStepDelayMs,
    skipSnapshot,
    url,
    yieldBeforeProbe,
  ])

  return {
    blocked,
    snap,
  }
}

export function useWebpageSnapshotSurfaceAssets(args: {
  url: string
  title: string
  suppressMetaImageUrl?: (url: string) => boolean
}) {
  const url = args.url
  const title = args.title
  const suppressMetaImageUrl = args.suppressMetaImageUrl
  const fallbackInfo = React.useMemo(
    () => getWebpageFallbackInfo(url, title),
    [title, url],
  )
  const [metaImageUrl, setMetaImageUrl] = React.useState<string>('')

  React.useEffect(() => {
    let cancelled = false
    setMetaImageUrl('')
    if (!url) return
    void getOrFetchWebpageMeta(url).then(meta => {
      if (cancelled) return
      const next = String(meta?.imageUrl || '').trim()
      setMetaImageUrl(prev => (prev === next ? prev : next))
    })
    return () => {
      cancelled = true
    }
  }, [url])

  const metaImageSrc = React.useMemo(() => {
    const raw = String(metaImageUrl || '').trim()
    if (!raw) return ''
    if (typeof suppressMetaImageUrl === 'function' && suppressMetaImageUrl(raw)) return ''
    return applyImageLikeProxySrc(raw)
  }, [metaImageUrl, suppressMetaImageUrl])

  const faviconSrc = React.useMemo(() => {
    const candidate = getDefaultFaviconUrlForWebpageUrl(url)
    return candidate ? applyImageLikeProxySrc(candidate) : ''
  }, [url])

  const hostIconSrc = React.useMemo(() => {
    const candidate = getKnownHostIconUrlForWebpageUrl(url)
    return candidate ? applyImageLikeProxySrc(candidate) : ''
  }, [url])

  return {
    fallbackInfo,
    metaImageSrc,
    faviconSrc,
    hostIconSrc,
  }
}
