import { mkdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { chromium, type Browser } from 'playwright'

const repoRoot = resolve(process.cwd(), '..')
const defaultOutputBasePath = resolve(repoRoot, 'data', 'outputs', 'html-video-browser-smoke')

const readArg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name)
  if (index < 0) return undefined
  return process.argv[index + 1]
}

const waitForServer = async (url: string): Promise<void> => {
  const startedAt = Date.now()
  let lastError = ''
  while (Date.now() - startedAt < 30000) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 250))
  }
  throw new Error(`Vite smoke server did not become ready: ${lastError || 'timeout'}`)
}

const startVite = async (port: number): Promise<ChildProcessWithoutNullStreams> => {
  const viteBin = resolve(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js')
  const child = spawn(process.execPath, [
    viteBin,
    '--configLoader',
    'runner',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ], {
    cwd: process.cwd(),
    env: { ...process.env, AG_SKIP_DOCS_UPDATE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => {
    stderr += String(chunk)
  })
  child.on('exit', code => {
    if (code !== null && code !== 0) {
      process.stderr.write(stderr)
    }
  })
  try {
    await waitForServer(`http://127.0.0.1:${port}/`)
    return child
  } catch (error) {
    child.kill('SIGTERM')
    throw error
  }
}

const launchBrowser = async (): Promise<Browser> => {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true })
  } catch {
    return chromium.launch({ headless: true })
  }
}

const main = async () => {
  const port = Number(readArg('--port') || 5197)
  if (!Number.isInteger(port) || port < 1) throw new Error('--port must be a positive integer')
  const requestedOutputPath = readArg('--output')
  const server = await startVite(port)
  let browser: Browser | null = null
  try {
    browser = await launchBrowser()
    const context = await browser.newContext({ serviceWorkers: 'block' })
    const page = await context.newPage()
    // Keep the application's Vite preamble and isolate the job from unrelated startup requests.
    await page.route('**/src/main.tsx', route => route.fulfill({ contentType: 'text/javascript', body: '' }))
    await page.goto(`http://127.0.0.1:${port}/`)
    const runNode = await page.evaluateHandle(async () => {
      const base = '/src/features/html-video-renderer/'
      const { runHtmlVideoFlowNode } = await import(base + 'htmlVideoFlowNode.ts')
      const { installHtmlVideoBrowserRuntimeAdapters } = await import(base + 'htmlVideoBrowserRuntime.ts')
      const { createHtmlVideoEngineRegistryFromRuntimeConfig } = await import(base + 'htmlVideoEngineRegistry.ts')
      installHtmlVideoBrowserRuntimeAdapters()
      const registry = createHtmlVideoEngineRegistryFromRuntimeConfig()
      Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined })
      return (html: string, durationMs = 1000, fps = 2) => runHtmlVideoFlowNode({
        node: { id: 'smoke', properties: { html, duration_ms: durationMs, fps, width: 64, height: 64, engine_hint: 'canvas-2d' } },
        registry,
      })
    })
    const authored = await readFile(new URL(import.meta.resolve('agentic-gateway/examples/hyperframes/cards.html')), 'utf8')
    await page.evaluate(async ({ run, source }) => {
      for (const input of [
        source.replace('data-start="0.5"', 'data-start="warm.end"'),
        source.replace('</body>', '<script src="https://invalid.example/external.js"></script></body>'),
      ]) {
        const refused = await run(input)
        if (refused.ok || refused.errorCode !== 'invalid_spec') throw Error('Unsupported HyperFrames input was accepted')
      }
      const base = '/src/features/html-video-renderer/'
      const { buildHtmlVideoRenderSpecCandidateFromNode, buildHtmlVideoPreviewSrcDocFromNode } = await import(base + 'htmlVideoFlowNode.ts')
      const node = {properties:{html:source, width:320, height:240, duration_ms:5000, fps:2}}
      const spec = buildHtmlVideoRenderSpecCandidateFromNode(node)
      if (spec.width !== 64 || spec.height !== 64 || spec.durationMs !== 1000 ||
          JSON.stringify(spec.data.hyperframesClips) !== '[{"id":"warm","start":0,"end":500},{"id":"cool","start":500,"end":1000}]' ||
          !buildHtmlVideoPreviewSrcDocFromNode(node).includes('data-composition-id="cards"')) {
        throw Error('HyperFrames dimensions, timing or preview drifted')
      }
    }, { run: runNode, source: authored })
    // Load the native job and rasterizer once, then disconnect the browser.
    const warmupDownload = page.waitForEvent('download')
    await page.evaluate(async run => {
      const warmup = await run('<div style="background:red">warmup</div>', 500)
      if (!warmup.ok) throw new Error(JSON.stringify(warmup))
    }, runNode)
    await warmupDownload
    await context.setOffline(true)
    const requests: string[] = []
    page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()) })
    const invitation = await readFile(new URL(import.meta.resolve('agentic-gateway/examples/hyperframes/open-studio.html')), 'utf8')
    const invitationDownload = page.waitForEvent('download')
    const media = await page.evaluateHandle(async ({ run, html }) => {
      const module = '/src/features/html-video-renderer/htmlVideoFlowNode.ts'
      const { buildHtmlVideoPreviewSrcDocFromNode, buildHtmlVideoRenderSpecCandidateFromNode } = await import(module)
      for (const [input, feature] of [
        [html.replace('background-color:#834030', 'filter:blur(2px)'), 'filter'],
        [html.replace('font-family:monospace', 'font-family:Arial'), 'font-family Arial'],
      ]) {
        const node = { properties: { html: input } }
        let reason = ''
        try { buildHtmlVideoRenderSpecCandidateFromNode(node) } catch (error) { reason = String(error) }
        if (!reason.includes(feature) || node.properties.html !== input) throw Error('Missing preflight refusal for ' + feature)
      }
      const result = await run(html, 3000, 8)
      if (!result.ok) throw Error(JSON.stringify(result))
      const video = document.createElement('video')
      const ready = new Promise<void>((done, fail) => { video.onloadeddata = () => done(); video.onerror = fail })
      video.src = URL.createObjectURL(result.blob)
      await ready
      if (video.videoWidth !== 320 || video.videoHeight !== 180) throw Error('Wrong invitation dimensions')
      const frame = document.createElement('iframe')
      frame.id = 'invitation-preview'
      frame.style.cssText = 'width:320px;height:180px;border:0;position:fixed;left:0;top:0'
      const loaded = new Promise<void>(done => { frame.onload = () => done() })
      frame.srcdoc = buildHtmlVideoPreviewSrcDocFromNode({properties: {html}})
      document.body.append(frame)
      await loaded
      return { video, frame }
    }, {run: runNode, html: invitation})
    await invitationDownload
    for (const seconds of [0.5, 1.5, 2.5]) {
      await page.evaluate(async ({ media, seconds }) => {
        const scene = media.frame.contentWindow as Window & {__agenticGraphRenderFrame(ms: number): Promise<void>}
        await scene.__agenticGraphRenderFrame(seconds * 1000)
        const seeked = new Promise<void>(done => { media.video.onseeked = () => done() })
        media.video.currentTime = seconds
        await seeked
      }, {media, seconds})
      const png = await page.locator('#invitation-preview').screenshot()
      await page.evaluate(async ({ media, seconds, png }) => {
        const image = new Image()
        image.src = 'data:image/png;base64,' + png
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = 320; canvas.height = 180
        const ctx = canvas.getContext('2d')!
        const [preview, decoded] = [image, media.video].map(source => {
          ctx.drawImage(source, 0, 0)
          const {data} = ctx.getImageData(0, 0, 320, 180)
          const boxes = [false, true].map(yellow => {
            let left = 320, top = 180, right = -1, bottom = -1
            for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
              const offset = 4 * (y * 320 + x)
              const r = data[offset], g = data[offset+1], b = data[offset+2]
              if (yellow ? r > 195 && g > 155 && b < 115 : Math.min(r,g,b) > 205) {
                left = Math.min(left,x); right = Math.max(right,x); top = Math.min(top,y); bottom = Math.max(bottom,y)
              }
            }
            return right < 0 ? [] : [left,top,right,bottom]
          })
          const overlap = 4 * (90 * 320 + 140)
          const expected = seconds < 1 ? [131,64,48] : [24,90,80]
          if (expected.some((v,i) => Math.abs(data[overlap+i]-v) > 10)) throw Error('Wrong visible panel at '+seconds)
          if (Boolean(boxes[0].length) !== (seconds < 2) || Boolean(boxes[1].length) !== (seconds >= 1)) {
            throw Error('Wrong visible text at '+seconds)
          }
          return boxes
        })
        for (const [i,box] of preview.entries()) {
          if (box.some((edge,j) => Math.abs(edge-decoded[i][j]) > 2)) {
            throw Error('Preview/export text bounds differ at '+seconds+': '+JSON.stringify({preview,decoded}))
          }
        }
      }, {media,seconds,png: png.toString('base64')})
    }
    await page.evaluate(({video,frame}) => { URL.revokeObjectURL(video.src); frame.remove() }, media)
    await media.dispose()
    const downloads: string[] = []
    page.on('download', entry => downloads.push(entry.suggestedFilename()))
    const exported = page.waitForEvent('download')
    const result = await page.evaluate(async run => {
      const host = window as Window & { fixtureSeeks?: number[] }
      host.fixtureSeeks = []
      const html = '<div id="scene" style="width:64px;height:64px;background:red"></div>' +
        '<script>window.__hyperframesSeek=async function(seconds){await new Promise(resolve=>setTimeout(resolve,10));' +
        'document.getElementById("scene").style.background=seconds>=0.5?"blue":"red";parent.fixtureSeeks.push(seconds);}</script>'
      const prototype = HTMLCanvasElement.prototype
      const captureStream = prototype.captureStream
      const initialSamples: number[][] = []
      prototype.captureStream = function (this: HTMLCanvasElement, fps?: number) {
        initialSamples.push(Array.from(this.getContext('2d')!.getImageData(32, 32, 1, 1).data).slice(0, 3))
        return captureStream.call(this, fps)
      }
      const result = await run(html).finally(() => { prototype.captureStream = captureStream })
      const first = initialSamples[0]
      if (initialSamples.length !== 1 || !first || first[0]! - Math.max(first[1]!, first[2]!) < 150) {
        throw new Error('Capture track opened before the first scene frame: ' + JSON.stringify(initialSamples))
      }
      if (!result.ok) throw new Error(JSON.stringify(result))
      const video = document.createElement('video')
      const loaded = new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve()
        video.onerror = () => reject(new Error('Could not decode recorded fixture'))
      })
      video.src = URL.createObjectURL(result.blob)
      const samples: number[][] = []
      const timestamps = [0.1, 0.58]
      try {
        await loaded
        const pixels = document.createElement('canvas').getContext('2d')!
        for (const time of timestamps) {
          const seeked = new Promise<void>(resolve => { video.onseeked = () => resolve() })
          video.currentTime = time
          await seeked
          pixels.drawImage(video, 0, 0)
          samples.push(Array.from(pixels.getImageData(32, 32, 1, 1).data).slice(0, 3))
        }
      } finally {
        URL.revokeObjectURL(video.src)
      }
      const [red, blue] = samples
      if (red![0]! - Math.max(red![1]!, red![2]!) < 150 || blue![2]! - Math.max(blue![0]!, blue![1]!) < 150) {
        throw new Error('Recorded fixture failed color readback: ' + JSON.stringify(samples))
      }
      if (JSON.stringify(host.fixtureSeeks) !== '[0,0.5]') throw new Error('Unexpected seek times: ' + host.fixtureSeeks)
      const errors: string[] = []
      for (const [code, protocol] of [
        ['protocol_version_unsupported', '{version:2}'],
        ['capability_missing', '{version:1,capabilities:[]}'],
        ['seek_failed', '{version:1,capabilities:["seek"],seek(){throw Error("fixture failed")}}'],
        ['seek_timeout', '{version:1,capabilities:["seek"],seek(){return new Promise(()=>{})}}'],
      ]) {
        const failure = await run('<div></div><script>window.__agenticGraphVideoProtocol=' + protocol + '</script>')
        if (failure.ok || failure.errorCode !== code || document.querySelector('iframe[data-kg-html-video-frame-host]')) {
          throw new Error('Seek refusal mismatch: ' + JSON.stringify(failure))
        }
        errors.push(failure.errorCode)
      }
      const bytes = Array.from(new Uint8Array(await result.blob.arrayBuffer()))
      return { bytes, samples, timestamps, errors, engineId: result.engineId, type: result.blob.type, renderLog: result.renderLog }
    }, runNode)
    if (requests.length) throw new Error('Offline export made HTTP requests: ' + requests.join(', '))
    const buffer = Buffer.from(result.bytes)
    if (buffer.byteLength < 128) throw new Error(`native video smoke output too small: ${buffer.byteLength} bytes`)
    if (!String(result.type || '').startsWith('video/')) throw new Error(`native video smoke output returned non-video MIME type: ${result.type || 'unknown'}`)
    const outputExtension = String(result.type).includes('mp4') ? 'mp4' : 'webm'
    const outputPath = resolve(requestedOutputPath || `${defaultOutputBasePath}.${outputExtension}`)
    await mkdir(dirname(outputPath), { recursive: true })
    const download = await exported
    if (downloads.length !== 1) throw new Error('Expected one successful download and zero downloads on refusal')
    await download.saveAs(outputPath)
    if (!(await readFile(outputPath)).equals(buffer)) throw new Error('Downloaded bytes differ from the decoded job result')
    console.log(JSON.stringify({
      ok: true,
      outputPath,
      sizeBytes: buffer.byteLength,
      engineId: result.engineId,
      type: result.type,
      renderLog: result.renderLog,
      browser: browser.version(),
      samples: result.samples,
      timestamps: result.timestamps,
      refusals: result.errors,
      downloads: downloads.length,
      offlineHttpRequests: requests.length,
    }, null, 2))
  } finally {
    if (browser) await browser.close()
    server.kill('SIGTERM')
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exitCode = 1
})
