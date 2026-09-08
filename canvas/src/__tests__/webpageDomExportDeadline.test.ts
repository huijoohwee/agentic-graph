import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { probeWebpageDomViaHiddenIframe } from '@/lib/websites/webpageDomExport'

async function exerciseDeadline(capture: boolean) {
  const { restore } = initJsdomHarness()
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout
  const nowDescriptor = Object.getOwnPropertyDescriptor(performance, 'now')
  const tasks = new Map<number, { at: number; run: () => void }>()
  const controller = new AbortController()
  let pending: ReturnType<typeof probeWebpageDomViaHiddenIframe> | undefined
  let now = 0, serial = 0, done = false, requests = 0
  try {
    Object.defineProperty(performance, 'now', { configurable: true, value: () => now })
    globalThis.setTimeout = ((run: () => void, ms = 0) => {
      const id = ++serial; tasks.set(id, { at: now + Number(ms), run }); return id
    }) as unknown as typeof setTimeout
    globalThis.clearTimeout = ((id: number) => { tasks.delete(Number(id)) }) as unknown as typeof clearTimeout
    pending = probeWebpageDomViaHiddenIframe({ signal: controller.signal, url: 'https://docs.byteplus.com/', mode: 'text', timeoutMs: 4000,
      waitForNetworkIdle: false, minWaitAfterLoadMs: 0, domQuietMs: 0 }).then(value => { done = true; return value })
    for (let turn = 0; turn < 16; turn += 1) await Promise.resolve()
    const iframe = document.querySelector('iframe')!
    if (!iframe) throw new Error('Expected mounted capture iframe')
    if (capture) {
      now = 3000
      const win = iframe.contentWindow!
      win.postMessage = ((message: { id: string }) => {
        requests += 1
        if (requests === 1) window.dispatchEvent(new window.MessageEvent('message', {
          source: win, data: { kind: 'kg-export-dom', id: message.id, text: 'Captured source', title: 'Source' },
        }))
      }) as typeof win.postMessage
      iframe.dispatchEvent(new window.Event('load'))
    }
    for (let step = 0; step < 64 && !done; step += 1) {
      for (let turn = 0; turn < 16; turn += 1) await Promise.resolve()
      if (done) break
      const next = [...tasks].sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) throw new Error('Capture stalled without an owned timer')
      if (next[1].at > 4000) throw new Error(`Capture exceeded total deadline: next timer at ${next[1].at}ms`)
      now = next[1].at; tasks.delete(next[0]); next[1].run()
    }
    if (!done) throw new Error('Capture exceeded bounded scheduler steps')
    const result = await pending
    if (capture ? !result.ok || result.result.text !== 'Captured source' : result.ok) throw new Error('Deadline lost capture result or reported success without a load')
    if (document.querySelector('iframe') || tasks.size) throw new Error('Capture leaked iframe or timers')
  } finally {
    controller.abort()
    await pending
    for (let turn = 0; turn < 16; turn += 1) await Promise.resolve()
    globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear
    if (nowDescriptor) Object.defineProperty(performance, 'now', nowDescriptor)
    else delete (performance as unknown as { now?: unknown }).now
    restore()
  }
}
export async function testWebpageExportDeadlineBoundsCandidateLoads() { await exerciseDeadline(false) }
export async function testWebpageExportDeadlinePreservesCapturedResult() { await exerciseDeadline(true) }
