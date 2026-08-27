export type WebpageDomExportMode = 'text' | 'html' | 'layout'
export type WebpageDomTextCaptureTarget = 'document' | 'clicked-next-sibling'

export type WebpageDomExportResult = { text: string; title: string; clipped: boolean; diag?: string }

export type WebpageDomProbeResult =
  | { ok: true; result: WebpageDomExportResult }
  | { ok: false; stage: string; error: string; attempts?: { src: string; sandbox: string }[] }

import { looksLikeNetworkSecurityBlockText } from 'grph-shared/rich-media/webpagePreview'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { hashSignatureParts } from '@/lib/hash/signature'
import { buildWebpageProxyUrl } from '@/lib/url'
import { isNoiseProneWebpagePreviewHost } from '@/lib/websites/webpageSnapshotShared'

const AG_EXPORT_DOM_KIND = 'kg-export-dom'
const AG_WEBPAGE_NET_KIND = 'kg-webpage-net'
const AG_WEBPAGE_DOM_KIND = 'kg-webpage-dom'
const HTML_MULTI_SNAPSHOT_SUBSTANTIAL_TEXT_LEN = 250_000
const TEXT_SCROLL_CRAWL_SUBSTANTIAL_TEXT_LEN = 1_600

const normalizeRenderedPageTextForExport = (value: unknown): string => {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function waitMs(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>(resolve => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(tid)
      if (signal) signal.removeEventListener('abort', onAbort)
      resolve()
    }
    const onAbort = () => finish()
    const tid = setTimeout(finish, ms)
    if (signal) {
      if (signal.aborted) return finish()
      signal.addEventListener('abort', onAbort)
    }
  })
}

const shouldSkipNetworkIdleWaitForExport = (args: {
  mode: WebpageDomExportMode
  scrollCrawl?: boolean
  textCaptureTarget?: WebpageDomTextCaptureTarget
}): boolean => {
  if (args.mode === 'layout') return false
  if (args.mode === 'html' && !!args.scrollCrawl) return true
  if (args.mode === 'text' && !!args.scrollCrawl) return true
  if (args.mode === 'text' && args.textCaptureTarget === 'clicked-next-sibling') return true
  return false
}

type InflightEntry = {
  promise: Promise<WebpageDomProbeResult>
  refs: number
  abortController: AbortController
}

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
}): string => {
  const graphSemanticKey = hashSignatureParts([
    args.mode, args.url, args.timeoutMs, args.maxChars, args.waitForNetworkIdle, args.networkIdleMs,
    args.minWaitAfterLoadMs, args.domQuietMs, args.maxElements, args.viewportW, args.viewportH,
    args.scrollCrawl, args.expandFaq, args.preferScriptDisabled, args.textCaptureTarget,
    args.clickTextHints.map(value => value.toLowerCase()).join('|'),
  ])
  return buildScopedGraphSemanticKey('webpage-dom-export', { graphSemanticKey }) || graphSemanticKey
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

  const existing = INFLIGHT.get(key) || null
  if (existing) {
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

async function probeWebpageDomViaHiddenIframeOnce(args: {
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
  const url = String(args.url || '').trim()
  if (!url) return { ok: false, stage: 'init', error: 'Missing url' }

  const timeoutMs = Math.max(2000, Math.min(60_000, Math.floor(args.timeoutMs ?? 20_000)))
  const maxChars = Math.max(100_000, Math.min(12_000_000, Math.floor(args.maxChars ?? 8_000_000)))
  const waitForNetworkIdle = args.waitForNetworkIdle !== false
  const networkIdleMs = Math.max(150, Math.min(2500, Math.floor(args.networkIdleMs ?? 600)))
  const minWaitAfterLoadMs = Math.max(0, Math.min(5000, Math.floor(args.minWaitAfterLoadMs ?? 350)))
  const preferScriptDisabled = args.preferScriptDisabled === true
  const domQuietMs = (() => {
    const raw = (args as unknown as { domQuietMs?: unknown }).domQuietMs
    const parsed = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(parsed)) return Math.max(0, Math.min(2500, Math.floor(parsed)))
    return Math.max(160, Math.min(1200, Math.floor(networkIdleMs * 0.75)))
  })()
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
  const shouldWaitForNetworkIdleSnapshots =
    waitForNetworkIdle
    && !shouldSkipNetworkIdleWaitForExport({
      mode: args.mode,
      scrollCrawl: args.scrollCrawl,
      textCaptureTarget: args.textCaptureTarget,
    })
  const signal = args.signal
  if (signal?.aborted) return { ok: false, stage: 'abort', error: 'Aborted' }

  const iframe = document.createElement('iframe')
  iframe.setAttribute('referrerpolicy', 'no-referrer')
  iframe.style.position = 'fixed'
  iframe.style.left = '-10000px'
  iframe.style.top = '0'
  iframe.style.width = `${viewportW}px`
  iframe.style.height = `${viewportH}px`
  iframe.style.opacity = '0'
  iframe.style.pointerEvents = 'none'

  const iframePathBase = buildWebpageProxyUrl(url)
  const iframePathStrip = buildWebpageProxyUrl(url, 'strip')
  const candidates = (() => {
    const out: { src: string; sandbox: string }[] = []
    const seen = new Set<string>()
    const push = (src: string, sandbox: string) => {
      const key = `${sandbox}|${src}`
      if (seen.has(key)) return
      seen.add(key)
      out.push({ src, sandbox })
    }
    const basePaths = preferScriptDisabled
      ? [iframePathStrip, iframePathBase]
      : args.mode === 'layout' || args.mode === 'text'
        ? [iframePathBase, iframePathStrip]
        : [iframePathBase]
    for (let i = 0; i < basePaths.length; i += 1) {
      const src = basePaths[i]!
      push(src, 'allow-scripts allow-same-origin')
      push(src, 'allow-scripts')
    }
    try {
      const loc = typeof window !== 'undefined' && window.location ? window.location : null
      const host = String(loc?.hostname || '')
      const port = String(loc?.port || '')
      const protocol = String(loc?.protocol || 'http:')
      const abs = (h: string, path: string) => `${protocol}//${h}${port ? `:${port}` : ''}${path}`
      const hostLc = host.toLowerCase()
      const canTryLocalHostFallbacks = hostLc !== 'localhost' && hostLc !== '127.0.0.1'
      if (canTryLocalHostFallbacks) {
        for (let i = 0; i < basePaths.length; i += 1) {
          const src = basePaths[i]!
          push(abs('127.0.0.1', src), 'allow-scripts allow-same-origin')
          push(abs('localhost', src), 'allow-scripts allow-same-origin')
        }
      }
    } catch {
      void 0
    }
    return out
  })()

  try {
    let loadedCandidate: { src: string; sandbox: string } | null = null
    const loaded = await (async () => {
      document.body.appendChild(iframe)
      const perAttemptTimeout = (() => {
        if (args.mode === 'layout') return Math.max(5000, Math.min(30_000, Math.floor(timeoutMs * 0.85)))
        if (args.mode === 'text') return Math.max(4500, Math.min(20_000, Math.floor(timeoutMs * 0.75)))
        return Math.max(1500, Math.min(7000, Math.floor(timeoutMs / 2)))
      })()
      for (const cand of candidates) {
        const ok = await new Promise<boolean>((resolve) => {
          let settled = false
          const done = (v: boolean) => {
            if (settled) return
            settled = true
            clearTimeout(timeoutId)
            iframe.removeEventListener('load', onLoad)
            if (signal) signal.removeEventListener('abort', onAbort)
            resolve(v)
          }
          const onLoad = () => done(true)
          const onAbort = () => done(false)
          const timeoutId = setTimeout(() => done(false), perAttemptTimeout)
          iframe.addEventListener('load', onLoad)
          if (signal) {
            if (signal.aborted) return done(false)
            signal.addEventListener('abort', onAbort)
          }
          try {
            iframe.setAttribute('sandbox', cand.sandbox)
          } catch {
            void 0
          }
          iframe.src = cand.src
        })
        if (signal?.aborted) throw new Error('ABORT')
        if (ok) {
          loadedCandidate = cand
          return true
        }
      }
      return false
    })()
    if (!loaded) return { ok: false, stage: 'load', error: 'Iframe load timeout', attempts: candidates }

    const win = iframe.contentWindow
    if (!win) return { ok: false, stage: 'contentWindow', error: 'Missing iframe.contentWindow', attempts: loadedCandidate ? [loadedCandidate] : candidates }

    const id = `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`

    const isIframeShowingBlockedPage = (): boolean => {
      try {
        const doc = iframe.contentDocument
        const body = doc?.body
        const t = typeof body?.innerText === 'string' ? body.innerText : String(body?.textContent || '')
        return looksLikeNetworkSecurityBlockText(t)
      } catch {
        return false
      }
    }

    const tryDirectRead = (): WebpageDomExportResult | null => {
      try {
        const doc = iframe.contentDocument
        if (!doc) return null
        const title = String(doc.title || '').trim()
        if (isIframeShowingBlockedPage()) return null
        if (args.mode === 'text') {
          const body = doc.body
          const innerText = body && typeof body.innerText === 'string' ? body.innerText : ''
          const visibleText = normalizeRenderedPageTextForExport(innerText)
          const cleanedText = (() => {
            try {
              if (!body) return ''
              const cloned = body.cloneNode(true) as HTMLElement
              try {
                cloned.querySelectorAll('script,style,noscript,template').forEach((el) => el.remove())
              } catch {
                void 0
              }
              const raw = String(cloned.textContent || '').replace(/\s+/g, ' ').trim()
              if (!visibleText && /(^|\\W)(self\\.__next_f|__next_f|__NEXT_DATA__)(\\W|$)/.test(raw)) return ''
              return raw
            } catch {
              return ''
            }
          })()
          const text = visibleText || cleanedText
          if (!text && !title) return null
          const payload = {
            ok: false,
            stage: 'export',
            error: 'No postMessage response; used direct DOM read',
            href: (() => {
              try {
                const w = iframe.contentWindow
                return String(w?.location?.href || '')
              } catch {
                return ''
              }
            })(),
            readyState: String(doc.readyState || ''),
            title,
            usedTextSource: visibleText ? 'innerText' : cleanedText ? 'cleanTextContent' : 'none',
            bodyTextLen: text.length,
            scripts: (() => {
              try {
                return Array.from(doc.querySelectorAll('script[src]'))
                  .slice(0, 80)
                  .map(s => String(s.getAttribute('src') || ''))
              } catch {
                return []
              }
            })(),
            links: (() => {
              try {
                return Array.from(doc.querySelectorAll('link[href]'))
                  .slice(0, 80)
                  .map(l => String(l.getAttribute('href') || ''))
              } catch {
                return []
              }
            })(),
          }
          return { text: text.slice(0, maxChars), title, clipped: text.length > maxChars, diag: JSON.stringify(payload).slice(0, 18000) }
        }
        if (args.mode === 'layout') {
          const win = iframe.contentWindow
          if (!win) return null
          const safeStyleValue = (value: unknown) => {
            try {
              const v = String(value || '').trim()
              if (!v) return ''
              if (v.length > 240) return ''
              if (/url\s*\(|expression\s*\(|@import/i.test(v)) return ''
              if (!/^[a-zA-Z0-9\s().,%:/_+\-'\"#]+$/.test(v)) return ''
              const lower = v.toLowerCase()
              if (/javascript:|data:/.test(lower)) return ''
              return v
            } catch {
              return ''
            }
          }
          const isSkippableTag = (tag: string) => {
            const t = String(tag || '').toUpperCase()
            return (
              t === 'SCRIPT' ||
              t === 'STYLE' ||
              t === 'NOSCRIPT' ||
              t === 'TEMPLATE' ||
              t === 'META' ||
              t === 'LINK' ||
              t === 'HEAD' ||
              t === 'BASE'
            )
          }
          const isVisibleBox = (cs: CSSStyleDeclaration | null, rect: DOMRect | null) => {
            try {
              if (!rect) return false
              const w = Number(rect.width || 0)
              const h = Number(rect.height || 0)
              if (!(w > 2 && h > 2)) return false
              if (w * h < 24) return false
              if (!cs) return true
              const display = String(cs.display || '').toLowerCase()
              if (display === 'none') return false
              const vis = String(cs.visibility || '').toLowerCase()
              if (vis === 'hidden') return false
              const op = Number.parseFloat(String(cs.opacity || '1'))
              if (Number.isFinite(op) && op <= 0.02) return false
              return true
            } catch {
              return true
            }
          }
          const safeAttr = (el: { getAttribute?: ((name: string) => string | null) | null } | null, name: string) => {
            try {
              const v = typeof el?.getAttribute === 'function' ? el.getAttribute(name) || '' : ''
              const s = String(v || '').trim()
              if (!s) return ''
              if (s.length > 240) return ''
              return s
            } catch {
              return ''
            }
          }
          const safeText = (el: { textContent?: unknown } | null) => {
            try {
              const t = String(el?.textContent || '').replace(/\s+/g, ' ').trim()
              return t.length > 240 ? t.slice(0, 240) : t
            } catch {
              return ''
            }
          }
          const pickStyle = (cs: CSSStyleDeclaration | null) => {
            try {
              if (!cs) return null
              return {
                display: safeStyleValue(cs.display),
                position: safeStyleValue(cs.position),
                zIndex: safeStyleValue(cs.zIndex),
                transform: safeStyleValue((cs as unknown as { transform?: unknown }).transform),
                filter: safeStyleValue((cs as unknown as { filter?: unknown }).filter),
                isolation: safeStyleValue((cs as unknown as { isolation?: unknown }).isolation),
                willChange: safeStyleValue((cs as unknown as { willChange?: unknown }).willChange),
                backgroundColor: safeStyleValue((cs as unknown as { backgroundColor?: unknown }).backgroundColor),
                color: safeStyleValue((cs as unknown as { color?: unknown }).color),
                borderRadius: safeStyleValue((cs as unknown as { borderRadius?: unknown }).borderRadius),
                borderColor: safeStyleValue((cs as unknown as { borderColor?: unknown }).borderColor),
                borderWidth: safeStyleValue((cs as unknown as { borderWidth?: unknown }).borderWidth),
                padding: safeStyleValue((cs as unknown as { padding?: unknown }).padding),
                margin: safeStyleValue((cs as unknown as { margin?: unknown }).margin),
                gap: safeStyleValue((cs as unknown as { gap?: unknown }).gap),
                rowGap: safeStyleValue((cs as unknown as { rowGap?: unknown }).rowGap),
                columnGap: safeStyleValue((cs as unknown as { columnGap?: unknown }).columnGap),
                justifyContent: safeStyleValue((cs as unknown as { justifyContent?: unknown }).justifyContent),
                justifyItems: safeStyleValue((cs as unknown as { justifyItems?: unknown }).justifyItems),
                alignItems: safeStyleValue((cs as unknown as { alignItems?: unknown }).alignItems),
                alignContent: safeStyleValue((cs as unknown as { alignContent?: unknown }).alignContent),
                justifySelf: safeStyleValue((cs as unknown as { justifySelf?: unknown }).justifySelf),
                alignSelf: safeStyleValue((cs as unknown as { alignSelf?: unknown }).alignSelf),
                flexDirection: safeStyleValue((cs as unknown as { flexDirection?: unknown }).flexDirection),
                flexWrap: safeStyleValue((cs as unknown as { flexWrap?: unknown }).flexWrap),
                flexGrow: safeStyleValue((cs as unknown as { flexGrow?: unknown }).flexGrow),
                flexShrink: safeStyleValue((cs as unknown as { flexShrink?: unknown }).flexShrink),
                flexBasis: safeStyleValue((cs as unknown as { flexBasis?: unknown }).flexBasis),
                order: safeStyleValue((cs as unknown as { order?: unknown }).order),
                gridTemplateColumns: safeStyleValue((cs as unknown as { gridTemplateColumns?: unknown }).gridTemplateColumns),
                gridTemplateRows: safeStyleValue((cs as unknown as { gridTemplateRows?: unknown }).gridTemplateRows),
                gridAutoFlow: safeStyleValue((cs as unknown as { gridAutoFlow?: unknown }).gridAutoFlow),
                fontSize: safeStyleValue((cs as unknown as { fontSize?: unknown }).fontSize),
                fontWeight: safeStyleValue((cs as unknown as { fontWeight?: unknown }).fontWeight),
                fontFamily: safeStyleValue((cs as unknown as { fontFamily?: unknown }).fontFamily),
                lineHeight: safeStyleValue((cs as unknown as { lineHeight?: unknown }).lineHeight),
                letterSpacing: safeStyleValue((cs as unknown as { letterSpacing?: unknown }).letterSpacing),
                textTransform: safeStyleValue((cs as unknown as { textTransform?: unknown }).textTransform),
                textAlign: safeStyleValue((cs as unknown as { textAlign?: unknown }).textAlign),
                boxShadow: safeStyleValue((cs as unknown as { boxShadow?: unknown }).boxShadow),
                opacity: safeStyleValue((cs as unknown as { opacity?: unknown }).opacity),
              }
            } catch {
              return null
            }
          }
          const idByEl = new WeakMap<object, string>()
          let nextId = 0
          const getId = (el: object | null) => {
            if (!el) return ''
            const prev = idByEl.get(el)
            if (prev) return prev
            nextId += 1
            const id = `e${nextId}`
            idByEl.set(el, id)
            return id
          }
          const root = doc.documentElement || doc.body
          const meta = {
            kind: 'layout',
            title: title || String(win.location?.hostname || '').trim(),
            href: String(args.url || '').trim(),
            viewport: { w: Number(win.innerWidth || 0) || 0, h: Number(win.innerHeight || 0) || 0 },
            scroll: {
              x: Number((win as unknown as { scrollX?: unknown }).scrollX || 0) || 0,
              y: Number((win as unknown as { scrollY?: unknown }).scrollY || 0) || 0,
              height: (() => {
                try {
                  const el = doc.scrollingElement || doc.documentElement || doc.body
                  return Number(el?.scrollHeight || 0) || 0
                } catch {
                  return 0
                }
              })(),
            },
            ts: Date.now(),
          }
          const els = Array.from((root as unknown as { querySelectorAll?: unknown }).querySelectorAll ? root.querySelectorAll('*') : [])
          const out: unknown[] = []
          const limit = typeof args.maxElements === 'number' && Number.isFinite(args.maxElements) ? Math.floor(args.maxElements) : 1400
          for (let i = 0; i < els.length; i += 1) {
            const el = els[i] as unknown as { tagName?: unknown; parentElement?: unknown; getBoundingClientRect?: unknown } | null
            const tagName = el && typeof el.tagName === 'string' ? el.tagName : ''
            if (!tagName) continue
            if (isSkippableTag(tagName)) continue
            let rect: DOMRect | null = null
            try {
              rect = typeof el?.getBoundingClientRect === 'function' ? (el.getBoundingClientRect as () => DOMRect)() : null
            } catch {
              rect = null
            }
            let cs: CSSStyleDeclaration | null = null
            try {
              cs = win.getComputedStyle ? win.getComputedStyle(el as unknown as Element) : null
            } catch {
              cs = null
            }
            if (!isVisibleBox(cs, rect)) continue
            const id = getId(el as unknown as object)
            const parent =
              el && el.parentElement && typeof el.parentElement === 'object' ? (el.parentElement as unknown as object) : null
            const pid = parent ? getId(parent) : ''
            const x = (rect ? Number(rect.left) : 0) + (Number((win as unknown as { scrollX?: unknown }).scrollX || 0) || 0)
            const y = (rect ? Number(rect.top) : 0) + (Number((win as unknown as { scrollY?: unknown }).scrollY || 0) || 0)
            const w = rect ? Number(rect.width) : 0
            const h = rect ? Number(rect.height) : 0
            const tag = String(tagName || '').toUpperCase()
            const attrs = {
              id: safeAttr(el as unknown as { getAttribute?: ((name: string) => string | null) | null }, 'id'),
              class: safeAttr(el as unknown as { getAttribute?: ((name: string) => string | null) | null }, 'class'),
              role: safeAttr(el as unknown as { getAttribute?: ((name: string) => string | null) | null }, 'role'),
              ariaLabel: safeAttr(el as unknown as { getAttribute?: ((name: string) => string | null) | null }, 'aria-label'),
              placeholder:
                tag === 'INPUT' || tag === 'TEXTAREA'
                  ? safeAttr(el as unknown as { getAttribute?: ((name: string) => string | null) | null }, 'placeholder')
                  : '',
              href: tag === 'A' ? safeAttr(el as unknown as { getAttribute?: ((name: string) => string | null) | null }, 'href') : '',
              src:
                tag === 'IMG' || tag === 'VIDEO' || tag === 'IFRAME'
                  ? safeAttr(el as unknown as { getAttribute?: ((name: string) => string | null) | null }, 'src')
                  : '',
              alt: tag === 'IMG' ? safeAttr(el as unknown as { getAttribute?: ((name: string) => string | null) | null }, 'alt') : '',
            }
            const inputValue =
              tag === 'INPUT' || tag === 'TEXTAREA'
                ? safeAttr(el as unknown as { getAttribute?: ((name: string) => string | null) | null }, 'value')
                : ''
            const text = (inputValue || '').trim() ? inputValue : attrs.placeholder || safeText(el as unknown as { textContent?: unknown })
            out.push({ id, pid, tag, rect: { x, y, w, h }, text, attrs, style: pickStyle(cs) })
            if (out.length >= Math.max(200, Math.min(3500, limit))) break
          }
          const payload = { meta, elements: out }
          const raw = JSON.stringify(payload)
          return {
            text: raw.slice(0, maxChars),
            title,
            clipped: raw.length > maxChars,
            diag: JSON.stringify({
              ok: false,
              stage: 'export',
              error: 'No postMessage response; used direct DOM read (layout)',
              readyState: String(doc.readyState || ''),
              title,
              elements: out.length,
            }).slice(0, 18000),
          }
        }
        const html = String(doc.documentElement?.outerHTML || '').trim()
        if (!html && !title) return null
        const payload = {
          ok: false,
          stage: 'export',
          error: 'No postMessage response; used direct DOM read',
          readyState: String(doc.readyState || ''),
          title,
          htmlLen: html.length,
        }
        return { text: html.slice(0, maxChars), title, clipped: html.length > maxChars, diag: JSON.stringify(payload).slice(0, 18000) }
      } catch {
        return null
      }
    }

    const waitNetIdle = async (): Promise<void> => {
      if (!shouldWaitForNetworkIdleSnapshots) return
      let sawStatus = false
      let idleSince = 0
      await new Promise<void>((resolve) => {
        let settled = false
        const done = () => {
          if (settled) return
          settled = true
          clearTimeout(hardTimeout)
          clearTimeout(fallbackTimeout)
          window.removeEventListener('message', onMessage)
          if (signal) signal.removeEventListener('abort', onAbort)
          resolve()
        }
        const onMessage = (e: MessageEvent) => {
          if (e.source !== win) return
          const d = e?.data as unknown
          if (!d || typeof d !== 'object') return
          const rec = d as Record<string, unknown>
          if (rec.kind !== AG_WEBPAGE_NET_KIND) return
          const pending = typeof rec.pending === 'number' ? rec.pending : NaN
          if (!Number.isFinite(pending)) return
          sawStatus = true
          if (pending === 0) {
            if (!idleSince) idleSince = Date.now()
            if (Date.now() - idleSince >= networkIdleMs) return done()
          } else {
            idleSince = 0
          }
        }
        const hardTimeout = setTimeout(done, Math.min(timeoutMs, 15_000))
        const fallbackTimeout = setTimeout(() => {
          if (!sawStatus) done()
        }, 1200)
        window.addEventListener('message', onMessage)
        const onAbort = () => done()
        if (signal) {
          if (signal.aborted) return done()
          signal.addEventListener('abort', onAbort)
        }
      })
      if (signal?.aborted) throw new Error('ABORT')
      if (minWaitAfterLoadMs > 0) await waitMs(minWaitAfterLoadMs, signal)
    }

    const waitDomQuiet = async (): Promise<void> => {
      if (domQuietMs <= 0) return
      let sawStatus = false
      let lastMutAt = 0
      await new Promise<void>((resolve) => {
        let settled = false
        const done = () => {
          if (settled) return
          settled = true
          clearTimeout(hardTimeout)
          clearTimeout(fallbackTimeout)
          window.removeEventListener('message', onMessage)
          if (signal) signal.removeEventListener('abort', onAbort)
          resolve()
        }
        const onMessage = (e: MessageEvent) => {
          if (e.source !== win) return
          const d = e?.data as unknown
          if (!d || typeof d !== 'object') return
          const rec = d as Record<string, unknown>
          if (rec.kind !== AG_WEBPAGE_DOM_KIND) return
          const n = typeof rec.lastMutAt === 'number' ? rec.lastMutAt : Number(rec.lastMutAt)
          if (!Number.isFinite(n)) return
          sawStatus = true
          lastMutAt = Math.max(0, Math.floor(n))
          if (Date.now() - lastMutAt >= domQuietMs) return done()
        }
        const hardTimeout = setTimeout(done, Math.min(timeoutMs, 10_000))
        const fallbackTimeout = setTimeout(() => {
          if (!sawStatus) done()
        }, 1200)
        window.addEventListener('message', onMessage)
        const onAbort = () => done()
        if (signal) {
          if (signal.aborted) return done()
          signal.addEventListener('abort', onAbort)
        }
      })
    }

    const requestOnce = async (): Promise<WebpageDomExportResult | null> => {
      return await new Promise((resolve) => {
        let done = false
        const onMessage = (e: MessageEvent) => {
          if (e.source !== win) return
          const raw = e?.data as unknown
          if (!raw || typeof raw !== 'object') return
          const d = raw as Record<string, unknown>
          if (d.kind !== AG_EXPORT_DOM_KIND || d.id !== id) return
          if (done) return
          done = true
          clearTimeout(tid)
          window.removeEventListener('message', onMessage)
          if (signal) signal.removeEventListener('abort', onAbort)
          resolve({
            text: String(d.text ?? ''),
            title: String(d.title ?? ''),
            clipped: Boolean(d.clipped),
            diag: String(d.diag ?? ''),
          })
        }
        const tid = setTimeout(() => {
          if (done) return
          done = true
          window.removeEventListener('message', onMessage)
          if (signal) signal.removeEventListener('abort', onAbort)
          resolve(null)
        }, timeoutMs)
        window.addEventListener('message', onMessage)
        const onAbort = () => {
          if (done) return
          done = true
          clearTimeout(tid)
          window.removeEventListener('message', onMessage)
          if (signal) signal.removeEventListener('abort', onAbort)
          resolve(null)
        }
        if (signal) {
          if (signal.aborted) return onAbort()
          signal.addEventListener('abort', onAbort)
        }
        try {
          win.postMessage(
            {
              kind: AG_EXPORT_DOM_KIND,
              id,
              mode: args.mode,
              maxChars,
              maxElements: typeof args.maxElements === 'number' && Number.isFinite(args.maxElements) ? Math.floor(args.maxElements) : undefined,
              expandFaq: args.expandFaq !== false,
              scrollCrawl: !!args.scrollCrawl,
              clickTextHints: Array.isArray(args.clickTextHints)
                ? args.clickTextHints.map(value => String(value || '').trim()).filter(Boolean).slice(0, 8)
                : undefined,
              textCaptureTarget: args.textCaptureTarget === 'clicked-next-sibling' ? 'clicked-next-sibling' : 'document',
            },
            '*',
          )
        } catch {
          clearTimeout(tid)
          window.removeEventListener('message', onMessage)
          if (signal) signal.removeEventListener('abort', onAbort)
          resolve(null)
        }
      })
    }

    await waitNetIdle()
    if (signal?.aborted) throw new Error('ABORT')
    if (args.mode === 'layout') await waitDomQuiet()
    if (signal?.aborted) throw new Error('ABORT')
    const first = await requestOnce()
    if (!first) {
      if (signal?.aborted) return { ok: false, stage: 'abort', error: 'Aborted', attempts: loadedCandidate ? [loadedCandidate] : candidates }
      const direct = tryDirectRead()
      if (direct) return { ok: true, result: direct }
      return {
        ok: false,
        stage: 'export',
        error: 'No response to export request (postMessage timeout)',
        attempts: loadedCandidate ? [loadedCandidate] : candidates,
      }
    }
    const shouldSkipAdditionalHtmlSnapshots =
      args.mode === 'html'
      && !!args.scrollCrawl
      && first.text.length >= HTML_MULTI_SNAPSHOT_SUBSTANTIAL_TEXT_LEN
    if (shouldSkipAdditionalHtmlSnapshots) return { ok: true, result: first }
    const shouldSkipAdditionalTextSnapshots =
      args.mode === 'text'
      && (
        args.textCaptureTarget === 'clicked-next-sibling'
        || (!!args.scrollCrawl && first.text.length >= TEXT_SCROLL_CRAWL_SUBSTANTIAL_TEXT_LEN)
      )
    if (shouldSkipAdditionalTextSnapshots) return { ok: true, result: first }
    const enableMultiSnapshot = args.mode === 'text' || args.mode === 'layout' || (args.mode === 'html' && !!args.scrollCrawl)
    if (!enableMultiSnapshot) return { ok: true, result: first }

    let best = first
    let stableRounds = 0
    const start = Date.now()
    const layoutScore = (raw: string): number => {
      try {
        const parsed = JSON.parse(String(raw || '')) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 0
        const obj = parsed as Record<string, unknown>
        const elements = obj.elements
        if (!Array.isArray(elements)) return 0
        return elements.length
      } catch {
        return 0
      }
    }
    let bestLayoutScore = args.mode === 'layout' ? layoutScore(best.text) : 0
    while (Date.now() - start < Math.min(timeoutMs, 55_000)) {
      await waitMs(900, signal)
      await waitNetIdle()
      if (args.mode === 'layout') await waitDomQuiet()
      if (signal?.aborted) throw new Error('ABORT')
      const next = await requestOnce()
      if (!next) break
      const improved = (() => {
        if (args.mode === 'layout') {
          const score = layoutScore(next.text)
          if (score > bestLayoutScore + 10) return true
          if (score > bestLayoutScore) return true
          return next.text.length > best.text.length + 1200
        }
        const minGain = args.mode === 'text' ? 40 : 500
        return next.text.length > best.text.length + minGain
      })()
      if (improved) {
        best = next
        if (args.mode === 'layout') bestLayoutScore = layoutScore(best.text)
        stableRounds = 0
      } else {
        stableRounds += 1
      }
      const minLen = args.mode === 'text' ? 1200 : args.mode === 'layout' ? 120_000 : 40_000
      const minScore = args.mode === 'layout' ? 350 : 0
      if (stableRounds >= 2 && best.text.length >= minLen && bestLayoutScore >= minScore) break
    }

    if (isIframeShowingBlockedPage()) {
      return { ok: false, stage: 'blocked', error: 'Upstream blocked by network security', attempts: loadedCandidate ? [loadedCandidate] : candidates }
    }

    return { ok: true, result: best }
  } catch (e) {
    if (e && typeof e === 'object' && 'message' in e && String((e as { message?: unknown }).message || '') === 'ABORT') {
      return { ok: false, stage: 'abort', error: 'Aborted', attempts: candidates }
    }
    const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message || '') : ''
    return { ok: false, stage: 'exception', error: msg || 'Iframe export failed', attempts: candidates }
  } finally {
    try {
      iframe.remove()
    } catch {
      void 0
    }
  }
}
