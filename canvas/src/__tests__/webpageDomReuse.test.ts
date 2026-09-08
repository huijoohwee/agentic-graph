import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { probeWebpageDomViaHiddenIframe } from '@/lib/websites/webpageDomExport'

async function withCaptures(run: (start: (extra?: Partial<Parameters<typeof probeWebpageDomViaHiddenIframe>[0]>) => ReturnType<typeof probeWebpageDomViaHiddenIframe>) => Promise<void>) {
  const { restore } = initJsdomHarness()
  const controllers: AbortController[] = [], pending: Promise<unknown>[] = []
  const start = (extra = {}) => {
    const controller = new AbortController(); controllers.push(controller)
    const promise = probeWebpageDomViaHiddenIframe({ url: 'https://docs.byteplus.com/', mode: 'html', signal: controller.signal, ...extra })
    pending.push(promise); return promise
  }
  try { await run(start) }
  finally {
    controllers.forEach(controller => controller.abort()); await Promise.allSettled(pending)
    for (let i = 0; i < 16; i++) await Promise.resolve()
    const remaining = document.querySelectorAll('iframe').length
    restore()
    if (remaining) throw new Error('Capture cleanup leaked an iframe')
  }
}
export async function testWebpageDomExportUsesCompleteInputsForInflightDedupe() {
  await withCaptures(async start => {
    void start({ clickTextHints: ['a|b'] }); void start({ clickTextHints: ['a', 'b'] })
    void start({ clickTextHints: ['a|b'] })
    if (document.querySelectorAll('iframe').length !== 2) throw new Error('Distinct hint arrays must not share a capture; exact repeats must share')
  })
}
export async function testWebpageDomExportBoundsInflightRequests() {
  await withCaptures(async start => {
    for (let i = 0; i < 8; i++) void start({ url: `https://docs.byteplus.com/?capture=${i}` })
    const excess = await start({ url: 'https://docs.byteplus.com/?capture=overflow' })
    if (!('stage' in excess) || excess.stage !== 'capacity' || document.querySelectorAll('iframe').length !== 8) throw new Error('Distinct capture capacity was not bounded')
    for (let i = 1; i < 64; i++) void start({ url: 'https://docs.byteplus.com/?capture=0' })
    const subscriber = await start({ url: 'https://docs.byteplus.com/?capture=0' })
    if (!('stage' in subscriber) || subscriber.stage !== 'capacity') throw new Error('Subscriber capacity was not bounded')
  })
  await withCaptures(async start => {
    const excess = await start({ clickTextHints: ['x'.repeat(8193)] })
    if (!('stage' in excess) || excess.stage !== 'input' || document.querySelectorAll('iframe').length) throw new Error('Oversized capture allocated an iframe')
    void start()
    if (document.querySelectorAll('iframe').length !== 1) throw new Error('Capture capacity was not released after cancellation')
  })
}
