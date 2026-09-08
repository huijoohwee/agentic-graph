import { isNoiseProneWebpagePreviewHost } from '@/lib/websites/webpageSnapshotShared'
import { probeWebpageDomViaHiddenIframeOnce } from './webpageDomCapture'
import type { WebpageDomProbeResult } from './webpageDomCapture'
import type { WebpageDomExportMode, WebpageDomTextCaptureTarget, WebpageDomExportResult } from './webpageDomDirectReader'
export type { WebpageDomProbeResult } from './webpageDomCapture'
export type { WebpageDomExportMode, WebpageDomTextCaptureTarget, WebpageDomExportResult } from './webpageDomDirectReader'

type InflightEntry = {
  promise: Promise<WebpageDomProbeResult>
  refs: number
  abortController: AbortController
}

const MAX_INFLIGHT = 8, MAX_SUBSCRIBERS = 64, MAX_KEY_UNITS = 65_536
const INFLIGHT = new Map<string, InflightEntry>()

const stableKey = (args: {
  url: string
  mode: WebpageDomExportMode
  timeoutMs: number
  maxChars: number
  waitForNetworkIdle: boolean
  networkIdleMs: number
  minWaitAfterLoadMs: number
  domQuietMs: number
  maxElements: number
  scrollCrawl: boolean
  expandFaq: boolean
  preferScriptDisabled: boolean
  clickTextHints: string[]
  textCaptureTarget: WebpageDomTextCaptureTarget
  viewportW: number
  viewportH: number
}): string | null => {
  // Bound allocation before escaping; retain list boundaries and exact text.
  if (args.url.length + args.clickTextHints.reduce((n, hint) => n + hint.length, 0) > 8192) return null
  const key = JSON.stringify([
    args.mode, args.url, args.timeoutMs, args.maxChars, args.waitForNetworkIdle, args.networkIdleMs,
    args.minWaitAfterLoadMs, args.domQuietMs, args.maxElements, args.viewportW, args.viewportH,
    args.scrollCrawl, args.expandFaq, args.preferScriptDisabled, args.textCaptureTarget,
    args.clickTextHints,
  ])
  return key.length <= MAX_KEY_UNITS ? key : null
}

export async function exportWebpageDomViaHiddenIframe(args: {
  url: string
  mode: WebpageDomExportMode
  timeoutMs?: number
  maxChars?: number
  maxElements?: number
  scrollCrawl?: boolean
  expandFaq?: boolean
  preferScriptDisabled?: boolean
  clickTextHints?: string[]
  textCaptureTarget?: WebpageDomTextCaptureTarget
  waitForNetworkIdle?: boolean
  networkIdleMs?: number
  minWaitAfterLoadMs?: number
  domQuietMs?: number
  viewportW?: number
  viewportH?: number
  signal?: AbortSignal
}): Promise<WebpageDomExportResult | null> {
  const probe = await probeWebpageDomViaHiddenIframe(args)
  return probe.ok ? probe.result : null
}

export async function probeWebpageDomViaHiddenIframe(args: {
  url: string
  mode: WebpageDomExportMode
  timeoutMs?: number
  maxChars?: number
  maxElements?: number
  scrollCrawl?: boolean
  expandFaq?: boolean
  preferScriptDisabled?: boolean
  clickTextHints?: string[]
  textCaptureTarget?: WebpageDomTextCaptureTarget
  waitForNetworkIdle?: boolean
  networkIdleMs?: number
  minWaitAfterLoadMs?: number
  domQuietMs?: number
  viewportW?: number
  viewportH?: number
  signal?: AbortSignal
}): Promise<WebpageDomProbeResult> {
  const url0 = String(args.url || '').trim()
  if (!url0) return { ok: false, stage: 'init', error: 'Missing url' }
  if (isNoiseProneWebpagePreviewHost(url0)) return { ok: false, stage: 'skipped', error: 'Preview skipped for noise-prone host' }

  const timeoutMs = Math.max(2000, Math.min(60_000, Math.floor(args.timeoutMs ?? 20_000)))
  const maxChars = Math.max(100_000, Math.min(12_000_000, Math.floor(args.maxChars ?? 8_000_000)))
  const waitForNetworkIdle = args.waitForNetworkIdle !== false
  const networkIdleMs = Math.max(150, Math.min(2500, Math.floor(args.networkIdleMs ?? 600)))
  const minWaitAfterLoadMs = Math.max(0, Math.min(5000, Math.floor(args.minWaitAfterLoadMs ?? 350)))
  const domQuietMs = (() => {
    const raw = (args as unknown as { domQuietMs?: unknown }).domQuietMs
    const parsed = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(2500, Math.floor(parsed)))
    return Math.max(160, Math.min(1200, Math.floor(networkIdleMs * 0.75)))
  })()
  const maxElements = typeof args.maxElements === 'number' && Number.isFinite(args.maxElements) ? Math.floor(args.maxElements) : 0
  const scrollCrawl = !!args.scrollCrawl
  const expandFaq = args.expandFaq !== false
  const preferScriptDisabled = args.preferScriptDisabled === true
  const clickTextHints = Array.isArray(args.clickTextHints)
    ? args.clickTextHints.map(value => String(value || '').trim()).filter(Boolean).slice(0, 8)
    : []
  const textCaptureTarget: WebpageDomTextCaptureTarget =
    args.textCaptureTarget === 'clicked-next-sibling' ? 'clicked-next-sibling' : 'document'
  const viewportW = (() => {
    const raw = (args as unknown as { viewportW?: unknown }).viewportW
    const parsed = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(parsed)) return Math.max(360, Math.min(2200, Math.floor(parsed)))
    return 1200
  })()
  const viewportH = (() => {
    const raw = (args as unknown as { viewportH?: unknown }).viewportH
    const parsed = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(parsed)) return Math.max(280, Math.min(1600, Math.floor(parsed)))
    return 800
  })()

  const key = stableKey({
    url: url0,
    mode: args.mode,
    timeoutMs,
    maxChars,
    waitForNetworkIdle,
    networkIdleMs,
    minWaitAfterLoadMs,
    domQuietMs,
    maxElements,
    scrollCrawl,
    expandFaq,
    preferScriptDisabled,
    clickTextHints,
    textCaptureTarget,
    viewportW,
    viewportH,
  })

  if (!key) return { ok: false, stage: 'input', error: 'Capture key exceeds bounded input size' }
  const existing = INFLIGHT.get(key) || null
  if (existing) {
    if (existing.refs >= MAX_SUBSCRIBERS) return { ok: false, stage: 'capacity', error: 'Capture subscriber capacity reached' }
    existing.refs += 1
    if (!args.signal) return await existing.promise
    return await new Promise<WebpageDomProbeResult>((resolve) => {
      let settled = false
      const done = (v: WebpageDomProbeResult) => {
        if (settled) return
        settled = true
        args.signal?.removeEventListener('abort', onAbort)
        resolve(v)
      }
      const onAbort = () => {
        existing.refs = Math.max(0, existing.refs - 1)
        if (existing.refs === 0) {
          try {
            existing.abortController.abort()
          } catch {
            void 0
          }
        }
        done({ ok: false, stage: 'abort', error: 'Aborted' })
      }
      if (args.signal.aborted) return onAbort()
      args.signal.addEventListener('abort', onAbort)
      existing.promise.then(v => done(v)).catch(() => done({ ok: false, stage: 'exception', error: 'Iframe export failed' }))
    })
  }

  if (INFLIGHT.size >= MAX_INFLIGHT) return { ok: false, stage: 'capacity', error: 'Capture concurrency capacity reached' }
  const abortController = new AbortController()
  const entry: InflightEntry = {
    promise: Promise.resolve({ ok: false, stage: 'init', error: 'Missing inflight promise' }),
    refs: 1,
    abortController,
  }
  INFLIGHT.set(key, entry)
  const p = probeWebpageDomViaHiddenIframeOnce({
    url: url0,
    mode: args.mode,
    timeoutMs,
    maxChars,
    maxElements: maxElements || undefined,
    scrollCrawl,
    expandFaq,
    preferScriptDisabled,
    clickTextHints,
    textCaptureTarget,
    waitForNetworkIdle,
    networkIdleMs,
    minWaitAfterLoadMs,
    domQuietMs,
    viewportW,
    viewportH,
    signal: abortController.signal,
  }).finally(() => {
    INFLIGHT.delete(key)
  })
  entry.promise = p

  if (!args.signal) return await p
  return await new Promise<WebpageDomProbeResult>((resolve) => {
    let settled = false
    const done = (v: WebpageDomProbeResult) => {
      if (settled) return
      settled = true
      args.signal?.removeEventListener('abort', onAbort)
      resolve(v)
    }
    const onAbort = () => {
      entry.refs = Math.max(0, entry.refs - 1)
      if (entry.refs === 0) {
        try {
          entry.abortController.abort()
        } catch {
          void 0
        }
      }
      done({ ok: false, stage: 'abort', error: 'Aborted' })
    }
    if (args.signal.aborted) return onAbort()
    args.signal.addEventListener('abort', onAbort)
    p.then(v => done(v)).catch(() => done({ ok: false, stage: 'exception', error: 'Iframe export failed' }))
  })
}
