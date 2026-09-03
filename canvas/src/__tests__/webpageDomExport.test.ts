import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { exportWebpageDomViaHiddenIframe } from '@/lib/websites/webpageDomExport'

const WEBPAGE_TEST_URL = 'https://docs.byteplus.com/'

const waitMs = async (ms: number) => {
  await new Promise<void>(resolve => setTimeout(resolve, ms))
}

const createEvent = (type: string): Event => {
  const Ctor = (window as unknown as { Event?: typeof Event }).Event
  if (typeof Ctor === 'function') return new Ctor(type)
  const e = document.createEvent('Event')
  e.initEvent(type, false, false)
  return e
}

const createMessageEvent = (data: unknown, source: Window): MessageEvent => {
  const Ctor = (window as unknown as { MessageEvent?: typeof MessageEvent }).MessageEvent
  if (typeof Ctor === 'function') return new Ctor('message', { data, source })
  const e = document.createEvent('MessageEvent')
  ;(e as unknown as { initMessageEvent?: unknown }).initMessageEvent &&
    (e as unknown as { initMessageEvent: (...args: unknown[]) => void }).initMessageEvent('message', false, false, data, '', '', source, null)
  return e as unknown as MessageEvent
}

export function testWebpageDomExportUsesSharedSemanticKeyForInflightDedupe() {
  const text = readFileSync(resolve(process.cwd(), 'src', 'lib', 'websites', 'webpageDomExport.ts'), 'utf8')
  if (!text.includes("buildScopedGraphSemanticKey('webpage-dom-export'")) {
    throw new Error('expected DOM export inflight dedupe to use shared semantic-key helper')
  }
}

export function testWebpageDomExportInjectedCaptureScopesThinkingPanels() {
  const text = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')
  if (!text.includes('readControlledInteractionScope')) {
    throw new Error('expected injected DOM export script to inspect aria-controlled thinking panels')
  }
  if (!text.includes('readNextSiblingInteractionScope')) {
    throw new Error('expected injected DOM export script to inspect ancestor next-sibling scopes')
  }
  if (!text.includes('isReportBoundaryText')) {
    throw new Error('expected injected DOM export script to stop scoped thinking capture before report sections')
  }
}

export async function testWebpageDomExportWaitsForNetworkIdleAndReturnsSnapshot() {
  const { restore } = initJsdomHarness()
  try {
    const p = exportWebpageDomViaHiddenIframe({
      url: WEBPAGE_TEST_URL,
      mode: 'html',
      timeoutMs: 4000,
      waitForNetworkIdle: true,
      networkIdleMs: 200,
      minWaitAfterLoadMs: 0,
    })

    await waitMs(0)
    const iframe = document.querySelector('iframe') as HTMLIFrameElement | null
    if (!iframe) throw new Error('expected iframe mounted')
    const win = iframe.contentWindow
    if (!win) throw new Error('expected iframe contentWindow')

    let requestedId = ''
    ;(win as unknown as { postMessage?: unknown }).postMessage = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const rec = payload as Record<string, unknown>
      if (rec.kind !== 'kg-export-dom') return
      const id = typeof rec.id === 'string' ? rec.id : ''
      if (id) requestedId = id
    }

    iframe.dispatchEvent(createEvent('load'))
    await waitMs(0)
    window.dispatchEvent(createMessageEvent({ kind: 'kg-webpage-net', pending: 1 }, win))
    await waitMs(60)
    window.dispatchEvent(createMessageEvent({ kind: 'kg-webpage-net', pending: 0 }, win))
    await waitMs(240)
    window.dispatchEvent(createMessageEvent({ kind: 'kg-webpage-net', pending: 0 }, win))

    const startedAt = Date.now()
    while (!requestedId && Date.now() - startedAt < 1200) {
      await waitMs(15)
    }
    if (!requestedId) throw new Error('expected export request after network idle')

    window.dispatchEvent(
      createMessageEvent({ kind: 'kg-export-dom', id: requestedId, mode: 'html', title: 'T', clipped: false, text: '<html>OK</html>' }, win),
    )

    const res = await p
    if (!res) throw new Error('expected result')
    if (res.text !== '<html>OK</html>') throw new Error('expected returned html snapshot')
    if (res.title !== 'T') throw new Error('expected title')
  } finally {
    restore()
  }
}

export async function testWebpageDomExportDedupesInflightRequests() {
  const { restore } = initJsdomHarness()
  try {
    const p1 = exportWebpageDomViaHiddenIframe({
      url: WEBPAGE_TEST_URL,
      mode: 'html',
      timeoutMs: 4000,
      waitForNetworkIdle: true,
      networkIdleMs: 200,
      minWaitAfterLoadMs: 0,
    })
    const p2 = exportWebpageDomViaHiddenIframe({
      url: WEBPAGE_TEST_URL,
      mode: 'html',
      timeoutMs: 4000,
      waitForNetworkIdle: true,
      networkIdleMs: 200,
      minWaitAfterLoadMs: 0,
    })

    await waitMs(0)
    const iframes = Array.from(document.querySelectorAll('iframe'))
    if (iframes.length !== 1) throw new Error(`expected 1 iframe mounted, got ${iframes.length}`)
    const iframe = iframes[0] as HTMLIFrameElement
    const win = iframe.contentWindow
    if (!win) throw new Error('expected iframe contentWindow')

    let requestedId = ''
    ;(win as unknown as { postMessage?: unknown }).postMessage = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const rec = payload as Record<string, unknown>
      if (rec.kind !== 'kg-export-dom') return
      const id = typeof rec.id === 'string' ? rec.id : ''
      if (id) requestedId = id
    }

    iframe.dispatchEvent(createEvent('load'))
    await waitMs(0)
    window.dispatchEvent(createMessageEvent({ kind: 'kg-webpage-net', pending: 0 }, win))
    await waitMs(240)
    window.dispatchEvent(createMessageEvent({ kind: 'kg-webpage-net', pending: 0 }, win))

    const startedAt = Date.now()
    while (!requestedId && Date.now() - startedAt < 1200) {
      await waitMs(15)
    }
    if (!requestedId) throw new Error('expected export request')

    window.dispatchEvent(
      createMessageEvent({ kind: 'kg-export-dom', id: requestedId, mode: 'html', title: 'T', clipped: false, text: '<html>OK</html>' }, win),
    )

    const [r1, r2] = await Promise.all([p1, p2])
    if (!r1 || !r2) throw new Error('expected results')
    if (r1.text !== '<html>OK</html>' || r2.text !== '<html>OK</html>') throw new Error('expected returned html snapshot')
  } finally {
    restore()
  }
}

export async function testWebpageDomExportStopsAfterFirstLargeHtmlSnapshot() {
  const { restore } = initJsdomHarness()
  try {
    const p = exportWebpageDomViaHiddenIframe({
      url: WEBPAGE_TEST_URL,
      mode: 'html',
      timeoutMs: 4000,
      waitForNetworkIdle: true,
      networkIdleMs: 200,
      minWaitAfterLoadMs: 0,
      scrollCrawl: true,
    })

    await waitMs(0)
    const iframe = document.querySelector('iframe') as HTMLIFrameElement | null
    if (!iframe) throw new Error('expected iframe mounted')
    const win = iframe.contentWindow
    if (!win) throw new Error('expected iframe contentWindow')

    const requestedIds: string[] = []
    ;(win as unknown as { postMessage?: unknown }).postMessage = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const rec = payload as Record<string, unknown>
      if (rec.kind !== 'kg-export-dom') return
      const id = typeof rec.id === 'string' ? rec.id : ''
      if (id) requestedIds.push(id)
    }

    iframe.dispatchEvent(createEvent('load'))
    await waitMs(0)
    window.dispatchEvent(createMessageEvent({ kind: 'kg-webpage-net', pending: 0 }, win))
    await waitMs(240)
    window.dispatchEvent(createMessageEvent({ kind: 'kg-webpage-net', pending: 0 }, win))

    const startedAt = Date.now()
    while (requestedIds.length === 0 && Date.now() - startedAt < 1200) {
      await waitMs(15)
    }
    if (requestedIds.length !== 1) throw new Error(`expected exactly one export request, got ${requestedIds.length}`)

    const firstId = requestedIds[0]
    const largeHtml = `<html><body>${'A'.repeat(260_000)}</body></html>`
    window.dispatchEvent(
      createMessageEvent({ kind: 'kg-export-dom', id: firstId, mode: 'html', title: 'Large', clipped: false, text: largeHtml }, win),
    )

    const res = await p
    if (!res) throw new Error('expected result')
    if (res.text !== largeHtml) throw new Error('expected first large html snapshot to be returned')
    if (requestedIds.length !== 1) throw new Error(`expected no follow-up export requests after large html snapshot, got ${requestedIds.length}`)
  } finally {
    restore()
  }
}

export async function testWebpageDomExportHtmlScrollCrawlSkipsInitialNetworkIdleWait() {
  const { restore } = initJsdomHarness()
  try {
    const p = exportWebpageDomViaHiddenIframe({
      url: WEBPAGE_TEST_URL,
      mode: 'html',
      timeoutMs: 4000,
      waitForNetworkIdle: true,
      networkIdleMs: 200,
      minWaitAfterLoadMs: 0,
      scrollCrawl: true,
    })

    await waitMs(0)
    const iframe = document.querySelector('iframe') as HTMLIFrameElement | null
    if (!iframe) throw new Error('expected iframe mounted')
    const win = iframe.contentWindow
    if (!win) throw new Error('expected iframe contentWindow')

    let requestedId = ''
    ;(win as unknown as { postMessage?: unknown }).postMessage = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const rec = payload as Record<string, unknown>
      if (rec.kind !== 'kg-export-dom') return
      const id = typeof rec.id === 'string' ? rec.id : ''
      if (id) requestedId = id
    }

    iframe.dispatchEvent(createEvent('load'))
    const startedAt = Date.now()
    while (!requestedId && Date.now() - startedAt < 300) {
      await waitMs(15)
    }
    if (!requestedId) throw new Error('expected html scroll-crawl export request without waiting for network idle')

    window.dispatchEvent(
      createMessageEvent({ kind: 'kg-export-dom', id: requestedId, mode: 'html', title: 'T', clipped: false, text: '<html>OK</html>' }, win),
    )

    const res = await p
    if (!res) throw new Error('expected result')
    if (res.text !== '<html>OK</html>') throw new Error('expected returned html snapshot')
  } finally {
    restore()
  }
}

export async function testWebpageDomExportTextScrollCrawlSkipsInitialNetworkIdleWait() {
  const { restore } = initJsdomHarness()
  try {
    const p = exportWebpageDomViaHiddenIframe({
      url: WEBPAGE_TEST_URL,
      mode: 'text',
      timeoutMs: 4000,
      waitForNetworkIdle: true,
      networkIdleMs: 200,
      minWaitAfterLoadMs: 0,
      scrollCrawl: true,
    })

    await waitMs(0)
    const iframe = document.querySelector('iframe') as HTMLIFrameElement | null
    if (!iframe) throw new Error('expected iframe mounted')
    const win = iframe.contentWindow
    if (!win) throw new Error('expected iframe contentWindow')

    let requestedId = ''
    ;(win as unknown as { postMessage?: unknown }).postMessage = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const rec = payload as Record<string, unknown>
      if (rec.kind !== 'kg-export-dom') return
      const id = typeof rec.id === 'string' ? rec.id : ''
      if (id) requestedId = id
    }

    iframe.dispatchEvent(createEvent('load'))
    const startedAt = Date.now()
    while (!requestedId && Date.now() - startedAt < 300) {
      await waitMs(15)
    }
    if (!requestedId) throw new Error('expected text scroll-crawl export request without waiting for network idle')

    const capturedText = 'Rendered share content\n\nSection 1\n\nSection 2\n'
    window.dispatchEvent(
      createMessageEvent({ kind: 'kg-export-dom', id: requestedId, mode: 'text', title: 'T', clipped: false, text: capturedText }, win),
    )

    const res = await p
    if (!res) throw new Error('expected result')
    if (res.text !== capturedText) throw new Error('expected returned text snapshot')
  } finally {
    restore()
  }
}

export async function testWebpageDomExportLayoutPrefersScriptEnabledProbeBeforeStripFallback() {
  const { restore } = initJsdomHarness()
  try {
    const p = exportWebpageDomViaHiddenIframe({
      url: WEBPAGE_TEST_URL,
      mode: 'layout',
      timeoutMs: 4000,
      waitForNetworkIdle: false,
      minWaitAfterLoadMs: 0,
      domQuietMs: 0,
    })

    await waitMs(0)
    const iframe = document.querySelector('iframe') as HTMLIFrameElement | null
    if (!iframe) throw new Error('expected iframe mounted')
    const initialSrc = String(iframe.getAttribute('src') || iframe.src || '')
    if (!initialSrc.includes('/__webpage_proxy?url=')) {
      throw new Error(`expected layout probe to use webpage proxy source, got ${initialSrc}`)
    }
    if (initialSrc.includes('agentic_os_script_policy=strip')) {
      throw new Error(`expected layout probe to try script-enabled source before strip fallback, got ${initialSrc}`)
    }

    const win = iframe.contentWindow
    if (!win) throw new Error('expected iframe contentWindow')
    let requestedId = ''
    ;(win as unknown as { postMessage?: unknown }).postMessage = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const rec = payload as Record<string, unknown>
      if (rec.kind !== 'kg-export-dom') return
      const id = typeof rec.id === 'string' ? rec.id : ''
      if (id) requestedId = id
    }

    iframe.dispatchEvent(createEvent('load'))
    const startedAt = Date.now()
    while (!requestedId && Date.now() - startedAt < 600) {
      await waitMs(15)
    }
    if (!requestedId) throw new Error('expected layout export request')

    const snapshot = JSON.stringify({
      meta: { kind: 'layout', title: 'T', href: WEBPAGE_TEST_URL, viewport: { w: 1200, h: 800 }, scroll: { x: 0, y: 0, height: 1600 }, ts: 1 },
      elements: [{ id: 'e1', pid: '', tag: 'DIV', rect: { x: 0, y: 0, w: 200, h: 40 }, text: 'Loaded', attrs: { id: '', class: '', role: '', ariaLabel: '', placeholder: '', href: '', src: '', alt: '' }, style: null }],
    })
    window.dispatchEvent(
      createMessageEvent({ kind: 'kg-export-dom', id: requestedId, mode: 'layout', title: 'T', clipped: false, text: snapshot }, win),
    )

    const res = await p
    if (!res) throw new Error('expected layout snapshot result')
    if (!res.text.includes('"kind":"layout"')) throw new Error('expected returned layout payload')
  } finally {
    restore()
  }
}

export async function testWebpageDomExportTextCanPreferScriptDisabledProbeFirst() {
  const { restore } = initJsdomHarness()
  try {
    const p = exportWebpageDomViaHiddenIframe({
      url: WEBPAGE_TEST_URL,
      mode: 'text',
      timeoutMs: 4000,
      waitForNetworkIdle: false,
      minWaitAfterLoadMs: 0,
      preferScriptDisabled: true,
    })

    await waitMs(0)
    const iframe = document.querySelector('iframe') as HTMLIFrameElement | null
    if (!iframe) throw new Error('expected iframe mounted')
    const initialSrc = String(iframe.getAttribute('src') || iframe.src || '')
    if (!initialSrc.includes('/__webpage_proxy?url=')) {
      throw new Error(`expected text probe to use webpage proxy source, got ${initialSrc}`)
    }
    if (!initialSrc.includes('agentic_os_script_policy=strip')) {
      throw new Error(`expected text probe to prefer stripped source when requested, got ${initialSrc}`)
    }

    const win = iframe.contentWindow
    if (!win) throw new Error('expected iframe contentWindow')
    let requestedId = ''
    ;(win as unknown as { postMessage?: unknown }).postMessage = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const rec = payload as Record<string, unknown>
      if (rec.kind !== 'kg-export-dom') return
      const id = typeof rec.id === 'string' ? rec.id : ''
      if (id) requestedId = id
    }

    iframe.dispatchEvent(createEvent('load'))
    const startedAt = Date.now()
    while (!requestedId && Date.now() - startedAt < 600) {
      await waitMs(15)
    }
    if (!requestedId) throw new Error('expected text export request')

    const capturedText = 'Rendered Claude-safe text export'
    window.dispatchEvent(
      createMessageEvent({ kind: 'kg-export-dom', id: requestedId, mode: 'text', title: 'T', clipped: false, text: capturedText }, win),
    )

    const res = await p
    if (!res) throw new Error('expected text snapshot result')
    if (res.text !== capturedText) throw new Error('expected returned text payload')
  } finally {
    restore()
  }
}

export async function testWebpageDomExportHtmlCanPreferScriptDisabledProbeFirst() {
  const { restore } = initJsdomHarness()
  try {
    const p = exportWebpageDomViaHiddenIframe({
      url: WEBPAGE_TEST_URL,
      mode: 'html',
      timeoutMs: 4000,
      waitForNetworkIdle: false,
      minWaitAfterLoadMs: 0,
      preferScriptDisabled: true,
    })

    await waitMs(0)
    const iframe = document.querySelector('iframe') as HTMLIFrameElement | null
    if (!iframe) throw new Error('expected iframe mounted')
    const initialSrc = String(iframe.getAttribute('src') || iframe.src || '')
    if (!initialSrc.includes('/__webpage_proxy?url=')) {
      throw new Error(`expected html probe to use webpage proxy source, got ${initialSrc}`)
    }
    if (!initialSrc.includes('agentic_os_script_policy=strip')) {
      throw new Error(`expected html probe to prefer stripped source when requested, got ${initialSrc}`)
    }

    const win = iframe.contentWindow
    if (!win) throw new Error('expected iframe contentWindow')
    let requestedId = ''
    ;(win as unknown as { postMessage?: unknown }).postMessage = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const rec = payload as Record<string, unknown>
      if (rec.kind !== 'kg-export-dom') return
      const id = typeof rec.id === 'string' ? rec.id : ''
      if (id) requestedId = id
    }

    iframe.dispatchEvent(createEvent('load'))
    const startedAt = Date.now()
    while (!requestedId && Date.now() - startedAt < 600) {
      await waitMs(15)
    }
    if (!requestedId) throw new Error('expected html export request')

    window.dispatchEvent(
      createMessageEvent({ kind: 'kg-export-dom', id: requestedId, mode: 'html', title: 'T', clipped: false, text: '<html>OK</html>' }, win),
    )

    const res = await p
    if (!res) throw new Error('expected html snapshot result')
    if (res.text !== '<html>OK</html>') throw new Error('expected returned html payload')
  } finally {
    restore()
  }
}

export async function testWebpageDomExportAbortsAndRemovesIframe() {
  const { restore } = initJsdomHarness()
  try {
    const ctrl = new AbortController()
    const p = exportWebpageDomViaHiddenIframe({
      url: WEBPAGE_TEST_URL,
      mode: 'html',
      timeoutMs: 4000,
      waitForNetworkIdle: true,
      networkIdleMs: 200,
      minWaitAfterLoadMs: 0,
      signal: ctrl.signal,
    })
    await waitMs(0)
    const iframe = document.querySelector('iframe') as HTMLIFrameElement | null
    if (!iframe) throw new Error('expected iframe mounted')
    ctrl.abort()
    const res = await p
    if (res != null) throw new Error('expected null result on abort')
    await waitMs(0)
    const remaining = document.querySelector('iframe')
    if (remaining) throw new Error('expected iframe removed')
  } finally {
    restore()
  }
}
