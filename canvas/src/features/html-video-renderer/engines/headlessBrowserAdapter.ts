import type { RenderEngine, RenderSpec } from '../htmlVideoRendererSsot'
import { HTML_VIDEO_ENGINE_IDS } from '../htmlVideoRendererSsot'

export const AGENTICGRAPH_HTML_VIDEO_FFMPEG_BIN = 'AGENTICGRAPH_HTML_VIDEO_FFMPEG_BIN' as const
export const AGENTICGRAPH_HTML_VIDEO_FFMPEG_VIDEO_CODEC = 'AGENTICGRAPH_HTML_VIDEO_FFMPEG_VIDEO_CODEC' as const
export const AGENTICGRAPH_HTML_VIDEO_MAX_FRAMES = 'AGENTICGRAPH_HTML_VIDEO_MAX_FRAMES' as const

const DEFAULT_FFMPEG_BIN = 'ffmpeg'
const DEFAULT_MP4_VIDEO_CODEC = 'mpeg4'
const DEFAULT_MAX_FRAMES = 1800

const readEnv = (name: string): string | undefined => {
  const value = typeof process !== 'undefined' ? process.env[name] : undefined
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

const readPositiveIntegerEnv = (name: string, fallback: number): number => {
  const raw = readEnv(name)
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}

const escapeJsonForScript = (value: unknown): string => JSON.stringify(value ?? {}).replace(/</g, '\\u003c')

const buildRenderableDocument = (spec: Readonly<RenderSpec>): string => {
  const dataJson = escapeJsonForScript(spec.data ?? {})
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${spec.width}, height=${spec.height}, initial-scale=1">
<style>
html, body {
  width: ${spec.width}px;
  height: ${spec.height}px;
  margin: 0;
  overflow: hidden;
  background: transparent;
}
body {
  position: relative;
}
${spec.css ?? ''}
</style>
</head>
<body>
${spec.html}
<script type="application/json" id="agenticgraph-html-video-data">${dataJson}</script>
<script>
(() => {
  const readData = () => {
    const element = document.getElementById('agenticgraph-html-video-data');
    try {
      return JSON.parse(element && element.textContent ? element.textContent : '{}');
    } catch {
      return {};
    }
  };
  const data = readData();
  window.__AGENTICGRAPH_HTML_VIDEO_DATA__ = data;
  window.__AGENTICGRAPH_RENDER_TIME_MS__ = 0;
  window.__agenticgraphRenderFrame = async (timeMs) => {
    const seconds = timeMs / 1000;
    window.__AGENTICGRAPH_RENDER_TIME_MS__ = timeMs;
    document.documentElement.style.setProperty('--kg-render-time-ms', String(timeMs));
    document.documentElement.style.setProperty('--kg-render-time-s', String(seconds));
    if (typeof window.__hyperframesSeek === 'function') {
      await window.__hyperframesSeek(seconds, { timeMs, data });
    }
    if (window.__timelines && typeof window.__timelines === 'object') {
      for (const timeline of Object.values(window.__timelines)) {
        if (timeline && typeof timeline.seek === 'function') timeline.seek(seconds, false);
        else if (timeline && typeof timeline.time === 'function') timeline.time(seconds);
      }
    }
    window.dispatchEvent(new CustomEvent('agenticgraph:render-frame', { detail: { timeMs, seconds, data } }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  };
})();
</script>
</body>
</html>`
}

const runFfmpeg = async (command: string, args: string[], cwd: string): Promise<void> => {
  const { spawn } = await import('node:child_process')
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const output: string[] = []
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => output.push(String(chunk)))
    child.stderr.on('data', chunk => output.push(String(chunk)))
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`FFmpeg exited with code ${code}: ${output.join('').trim() || 'no output'}`))
    })
  })
}

const renderFrames = async (spec: Readonly<RenderSpec>, frameDir: string): Promise<void> => {
  const { join } = await import('node:path')
  const { chromium } = await import('playwright')
  const documentHtml = buildRenderableDocument(spec)
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({
      viewport: { width: spec.width, height: spec.height },
      deviceScaleFactor: 1,
    })
    await page.setContent(documentHtml, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts?.ready)
    const frameCount = Math.max(1, Math.ceil((spec.durationMs / 1000) * spec.fps))
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const timeMs = Math.min(spec.durationMs, (frameIndex * 1000) / spec.fps)
      await page.evaluate(async currentTimeMs => {
        const renderFrame = (window as typeof window & {
          __agenticgraphRenderFrame?: (timeMs: number) => Promise<void>
        }).__agenticgraphRenderFrame
        if (typeof renderFrame === 'function') await renderFrame(currentTimeMs)
      }, timeMs)
      await page.screenshot({
        path: join(frameDir, `frame-${String(frameIndex + 1).padStart(6, '0')}.png`),
        type: 'png',
        scale: 'css',
      })
    }
  } finally {
    await browser.close()
  }
}

export const headlessBrowserAdapter: RenderEngine = {
  engineId: HTML_VIDEO_ENGINE_IDS.headlessBrowser,
  async render(spec) {
    const frameCount = Math.max(1, Math.ceil((spec.durationMs / 1000) * spec.fps))
    const maxFrames = readPositiveIntegerEnv(AGENTICGRAPH_HTML_VIDEO_MAX_FRAMES, DEFAULT_MAX_FRAMES)
    if (frameCount > maxFrames) {
      throw new Error(`${AGENTICGRAPH_HTML_VIDEO_MAX_FRAMES} blocks ${frameCount} requested frames; raise the runtime limit deliberately to render this spec`)
    }

    const [{ mkdtemp, readFile, rm }, { tmpdir }, { join }] = await Promise.all([
      import('node:fs/promises'),
      import('node:os'),
      import('node:path'),
    ])
    const workspace = await mkdtemp(join(tmpdir(), 'agenticgraph-html-video-'))
    const frameDir = join(workspace, 'frames')
    const outputPath = join(workspace, 'output.mp4')
    try {
      const { mkdir } = await import('node:fs/promises')
      await mkdir(frameDir, { recursive: true })
      await renderFrames(spec, frameDir)
      await runFfmpeg(readEnv(AGENTICGRAPH_HTML_VIDEO_FFMPEG_BIN) || DEFAULT_FFMPEG_BIN, [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-framerate',
        String(spec.fps),
        '-i',
        join(frameDir, 'frame-%06d.png'),
        '-an',
        '-c:v',
        readEnv(AGENTICGRAPH_HTML_VIDEO_FFMPEG_VIDEO_CODEC) || DEFAULT_MP4_VIDEO_CODEC,
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        outputPath,
      ], workspace)
      const bytes = await readFile(outputPath)
      return {
        blob: new Blob([bytes], { type: 'video/mp4' }),
        engineId: HTML_VIDEO_ENGINE_IDS.headlessBrowser,
        durationMs: spec.durationMs,
        fps: spec.fps,
        width: spec.width,
        height: spec.height,
        renderLog: [
          `frames=${frameCount}`,
          `ffmpeg=${readEnv(AGENTICGRAPH_HTML_VIDEO_FFMPEG_BIN) || DEFAULT_FFMPEG_BIN}`,
          `codec=${readEnv(AGENTICGRAPH_HTML_VIDEO_FFMPEG_VIDEO_CODEC) || DEFAULT_MP4_VIDEO_CODEC}`,
        ],
      }
    } finally {
      await rm(workspace, { force: true, recursive: true })
    }
  },
}
