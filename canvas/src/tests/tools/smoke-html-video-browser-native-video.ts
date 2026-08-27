import { mkdir, writeFile } from 'node:fs/promises'
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
  await waitForServer(`http://127.0.0.1:${port}/`)
  return child
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
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${port}/src/features/html-video-renderer/engines/canvas2dAdapter.ts`, { waitUntil: 'domcontentloaded' })
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><main id="html-video-smoke"></main></body></html>')
    const result = await page.evaluate(async () => {
      const adapterModulePath = '/src/features/html-video-renderer/engines/canvas2dAdapter.ts'
      const { canvas2dAdapter } = await import(/* @vite-ignore */ adapterModulePath)
      const renderResult = await canvas2dAdapter.render({
        html: '<section aria-label="HTML video smoke"><h1>Native Video Smoke</h1><p>Browser-native HTML to video.</p></section>',
        css: `main {
  display: grid;
  place-items: center;
  background: #0f172a;
  color: #f8fafc;
  font: 600 18px system-ui, sans-serif;
}
section {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  gap: 4px;
}
h1, p { margin: 0; }`,
        data: { smoke: true },
        durationMs: 500,
        fps: 2,
        width: 320,
        height: 180,
        engineHint: 'canvas-2d',
      })
      const bytes = new Uint8Array(await renderResult.blob.arrayBuffer())
      return {
        bytes: Array.from(bytes),
        engineId: renderResult.engineId,
        type: renderResult.blob.type,
        renderLog: renderResult.renderLog || [],
      }
    })
    const buffer = Buffer.from(result.bytes)
    if (buffer.byteLength < 128) throw new Error(`native video smoke output too small: ${buffer.byteLength} bytes`)
    if (!String(result.type || '').startsWith('video/')) throw new Error(`native video smoke output returned non-video MIME type: ${result.type || 'unknown'}`)
    const outputExtension = String(result.type).includes('mp4') ? 'mp4' : 'webm'
    const outputPath = resolve(requestedOutputPath || `${defaultOutputBasePath}.${outputExtension}`)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, buffer)
    console.log(JSON.stringify({
      ok: true,
      outputPath,
      sizeBytes: buffer.byteLength,
      engineId: result.engineId,
      type: result.type,
      renderLog: result.renderLog,
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
