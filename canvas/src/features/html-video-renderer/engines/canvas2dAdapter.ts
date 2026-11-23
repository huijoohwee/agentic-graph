import type { RenderEngine, RenderSpec } from '../htmlVideoRendererSsot'
import { buildHtmlVideoFrameRuntime } from '../htmlVideoFlowNode'
import { HTML_VIDEO_ENGINE_IDS } from '../htmlVideoRendererSsot'
import { MEDIA_VIDEO_RECORDER_MIME_TYPE_CANDIDATES } from '@/lib/media/mediaFormatPreference'

const CANVAS_2D_RECORDER_MIME_CANDIDATES = MEDIA_VIDEO_RECORDER_MIME_TYPE_CANDIDATES
const CANVAS_2D_RECORDER_VIDEO_BITS_PER_SECOND = 8_000_000

const assertBrowserCanvasRuntime = () => {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || typeof Blob === 'undefined' || typeof HTMLCanvasElement === 'undefined' || typeof HTMLIFrameElement === 'undefined') {
    throw new Error('canvas-2d video rendering requires a browser runtime')
  }
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
    throw new Error('canvas-2d video rendering requires browser MediaRecorder and canvas captureStream support')
  }
}

const escapeJsonForScript = (value: unknown): string => JSON.stringify(value ?? {}).replace(/</g, '\\u003c')

const buildFrameStyle = (spec: Readonly<RenderSpec>): string => {
  return `
html,
body {
  width: ${spec.width}px;
  height: ${spec.height}px;
  margin: 0;
  overflow: hidden;
  background: transparent;
}
main[data-kg-html-video-frame-host="1"] {
  width: ${spec.width}px;
  height: ${spec.height}px;
  margin: 0;
  overflow: hidden;
  box-sizing: border-box;
}
${spec.css ?? ''}
`
}

const buildFrameDocument = (spec: Readonly<RenderSpec>): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${spec.width}, height=${spec.height}, initial-scale=1">
<style>
${buildFrameStyle(spec)}
</style>
</head>
<body>
<main aria-label="HTML video frame raster host" data-kg-html-video-frame-host="1" data-kg-render-time-ms="0" data-kg-render-time-s="0">
${spec.html}
</main>
<script type="application/json" id="agentic-graph-html-video-data">${escapeJsonForScript(spec.data ?? {})}</script>
<script>${buildHtmlVideoFrameRuntime(spec.durationMs, '[data-kg-html-video-frame-host="1"]')}</script>
</body>
</html>`

const waitForFrameDocument = (frame: HTMLIFrameElement): Promise<Document> => new Promise((resolve, reject) => {
  const timeout = window.setTimeout(() => {
    reject(new Error('canvas-2d video renderer timed out while preparing isolated frame document'))
  }, 2000)
  frame.onload = () => {
    window.clearTimeout(timeout)
    const frameDocument = frame.contentDocument
    if (!frameDocument?.body) {
      reject(new Error('canvas-2d video renderer could not access isolated frame document'))
      return
    }
    resolve(frameDocument)
  }
})

const createFrameRenderDocument = async (spec: Readonly<RenderSpec>): Promise<{
  host: HTMLIFrameElement
  renderRoot: HTMLElement
}> => {
  const host = document.createElement('iframe')
  host.setAttribute('aria-label', 'HTML video frame raster host')
  host.setAttribute('data-kg-html-video-frame-host', '1')
  host.setAttribute('sandbox', 'allow-scripts allow-same-origin')
  host.style.position = 'fixed'
  host.style.left = '-10000px'
  host.style.top = '0'
  host.style.width = `${spec.width}px`
  host.style.height = `${spec.height}px`
  host.style.border = '0'
  host.style.overflow = 'hidden'
  host.srcdoc = buildFrameDocument(spec)
  const frameDocumentReady = waitForFrameDocument(host)
  document.body.appendChild(host)
  try {
    const frameDocument = await frameDocumentReady
    const renderRoot = frameDocument.querySelector<HTMLElement>('[data-kg-html-video-frame-host="1"]')
    if (!renderRoot) throw new Error('canvas-2d video renderer could not find isolated frame render root')
    return { host, renderRoot }
  } catch (error) {
    host.remove()
    throw error
  }
}

const wait = (durationMs: number): Promise<void> => new Promise(resolve => window.setTimeout(resolve, Math.max(0, durationMs)))

const resolveCanvasRecorderMimeType = (): string => {
  for (const candidate of CANVAS_2D_RECORDER_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate
  }
  return ''
}

const requestCanvasFrame = (stream: MediaStream) => {
  for (const track of stream.getVideoTracks()) {
    const requestFrame = (track as MediaStreamTrack & { requestFrame?: () => void }).requestFrame
    if (typeof requestFrame === 'function') requestFrame.call(track)
  }
}

const stopMediaStream = (stream: MediaStream) => {
  for (const track of stream.getTracks()) track.stop()
}

export const canvas2dAdapter: RenderEngine = {
  engineId: HTML_VIDEO_ENGINE_IDS.canvas2d,
  async render(spec) {
    assertBrowserCanvasRuntime()
    const { default: html2canvas } = await import('html2canvas')
    const canvas = document.createElement('canvas')
    canvas.width = spec.width
    canvas.height = spec.height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('canvas-2d video rendering requires a 2D canvas context')

    const mimeType = resolveCanvasRecorderMimeType()
    if (!mimeType) throw new Error('canvas-2d video rendering requires a native MediaRecorder video MIME type')
    const frameCount = Math.max(1, Math.ceil(spec.durationMs * spec.fps / 1000))
    const frameDurationMs = 1000 / spec.fps
    const chunks: Blob[] = []
    const { host, renderRoot } = await createFrameRenderDocument(spec)
    let stream: MediaStream | undefined
    let recorder: MediaRecorder | undefined
    try {
      const scene = host.contentWindow as (Window & {
        __agenticGraphRenderFrame?: (timeMs: number) => Promise<void>
      }) | null
      if (!scene?.__agenticGraphRenderFrame) throw new Error('HTML video frame runtime unavailable')
      const seek = scene.__agenticGraphRenderFrame.bind(scene)
      const rasterAt = async (timeMs: number) => {
        await seek(timeMs)
        return html2canvas(renderRoot, {
          width: spec.width, height: spec.height, windowWidth: spec.width, windowHeight: spec.height,
          scale: 1, backgroundColor: null, logging: false, useCORS: true,
        })
      }
      const paint = (raster: HTMLCanvasElement) => {
        context.clearRect(0, 0, spec.width, spec.height)
        context.drawImage(raster, 0, 0, spec.width, spec.height)
      }
      // A new capture track may sample immediately. Its first sample must already contain the scene.
      paint(await rasterAt(0))
      stream = canvas.captureStream(spec.fps)
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: CANVAS_2D_RECORDER_VIDEO_BITS_PER_SECOND })
      const stopped = new Promise<void>((resolve, reject) => {
        recorder!.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
        recorder!.onerror = () => reject(new Error('canvas-2d MediaRecorder failed'))
        recorder!.onstop = () => resolve()
      })
      // A recorder error can arrive while an asynchronous scene seek is still settling.
      void stopped.catch(() => {})
      recorder.start()
      const startedAt = performance.now()
      context.drawImage(canvas, 0, 0)
      requestCanvasFrame(stream)
      for (let index = 1; index < frameCount; index++) {
        const timeMs = index * frameDurationMs
        const raster = await rasterAt(timeMs)
        await wait(startedAt + timeMs - performance.now())
        paint(raster)
        requestCanvasFrame(stream)
      }
      await wait(startedAt + spec.durationMs - performance.now())
      // Mark the end of the last frame's hold, including one-frame static exports.
      context.drawImage(canvas, 0, 0)
      requestCanvasFrame(stream)
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      if (recorder.state !== 'inactive') recorder.stop()
      await stopped
    } finally {
      if (recorder && recorder.state !== 'inactive') recorder.stop()
      if (stream) stopMediaStream(stream)
      host.remove()
    }

    if (!chunks.length) throw new Error('canvas-2d video renderer finalized without output chunks')
    return {
      blob: new Blob(chunks, { type: mimeType }),
      engineId: HTML_VIDEO_ENGINE_IDS.canvas2d,
      durationMs: spec.durationMs,
      fps: spec.fps,
      width: spec.width,
      height: spec.height,
      renderLog: [
        `frames=${frameCount}`,
        'rasterizer=html2canvas',
        'recorder=MediaRecorder',
        `mime=${mimeType}`,
      ],
    }
  },
}
