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
      return (html: string, durationMs = 1000) => runHtmlVideoFlowNode({
        node: { id: 'smoke', properties: { html, duration_ms: durationMs, fps: 2, width: 64, height: 64, engine_hint: 'canvas-2d' } },
        registry,
      })
    })
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
