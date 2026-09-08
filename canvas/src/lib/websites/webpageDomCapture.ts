import { createWebpageExportBudget } from './webpageDomExportBudget'
import { createWebpageDomDirectReader } from './webpageDomDirectReader'
import type { WebpageDomExportMode, WebpageDomTextCaptureTarget, WebpageDomExportResult } from './webpageDomDirectReader'
import { buildWebpageProxyUrl } from '@/lib/url'

export type WebpageDomProbeResult =
  | { ok: true; result: WebpageDomExportResult }
  | { ok: false; stage: string; error: string; attempts?: { src: string; sandbox: string }[] }

const AG_EXPORT_DOM_KIND = 'kg-export-dom'
const AG_WEBPAGE_NET_KIND = 'kg-webpage-net'
const AG_WEBPAGE_DOM_KIND = 'kg-webpage-dom'
const HTML_MULTI_SNAPSHOT_SUBSTANTIAL_TEXT_LEN = 250_000
const TEXT_SCROLL_CRAWL_SUBSTANTIAL_TEXT_LEN = 1_600

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

export async function probeWebpageDomViaHiddenIframeOnce(args: {
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
  const budget = createWebpageExportBudget(timeoutMs)
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
        if (!budget.remaining()) break
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
          const timeoutId = setTimeout(() => done(false), budget.remaining(perAttemptTimeout))
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

    const { isIframeShowingBlockedPage, tryDirectRead } = createWebpageDomDirectReader(iframe, args, maxChars)

    const waitNetIdle = async (): Promise<void> => {
      if (!shouldWaitForNetworkIdleSnapshots || !budget.remaining()) return
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
        const hardTimeout = setTimeout(done, budget.remaining(15_000))
        const fallbackTimeout = setTimeout(() => {
          if (!sawStatus) done()
        }, budget.remaining(1200))
        window.addEventListener('message', onMessage)
        const onAbort = () => done()
        if (signal) {
          if (signal.aborted) return done()
          signal.addEventListener('abort', onAbort)
        }
      })
      if (signal?.aborted) throw new Error('ABORT')
      if (minWaitAfterLoadMs > 0) await budget.wait(minWaitAfterLoadMs, signal)
    }

    const waitDomQuiet = async (): Promise<void> => {
      if (domQuietMs <= 0 || !budget.remaining()) return
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
        const hardTimeout = setTimeout(done, budget.remaining(10_000))
        const fallbackTimeout = setTimeout(() => {
          if (!sawStatus) done()
        }, budget.remaining(1200))
        window.addEventListener('message', onMessage)
        const onAbort = () => done()
        if (signal) {
          if (signal.aborted) return done()
          signal.addEventListener('abort', onAbort)
        }
      })
    }

    const requestOnce = async (): Promise<WebpageDomExportResult | null> => {
      if (!budget.remaining()) return null
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
        }, budget.remaining())
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
    while (budget.remaining()) {
      await budget.wait(900, signal)
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
