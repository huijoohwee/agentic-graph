import type { RenderEngine, RenderSpec } from '../htmlVideoRendererSsot'
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

const buildFrameStyle = (spec: Readonly<RenderSpec>, timeMs: number): string => {
  const seconds = timeMs / 1000
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
  --kg-render-time-ms: ${timeMs};
  --kg-render-time-s: ${seconds};
}
${spec.css ?? ''}
`
}

const buildFrameDocument = (spec: Readonly<RenderSpec>, timeMs: number): string => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${spec.width}, height=${spec.height}, initial-scale=1">
<style>
${buildFrameStyle(spec, timeMs)}
</style>
</head>
<body>
<main aria-label="HTML video frame raster host" data-kg-html-video-frame-host="1" data-kg-render-time-ms="${timeMs}" data-kg-render-time-s="${timeMs / 1000}">
${spec.html}
</main>
<script type="application/json" id="agenticgraph-html-video-data">${escapeJsonForScript(spec.data ?? {})}</script>
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

const createFrameRenderDocument = async (spec: Readonly<RenderSpec>, timeMs: number): Promise<{
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
  host.srcdoc = buildFrameDocument(spec, timeMs)
  const frameDocumentReady = waitForFrameDocument(host)
  document.body.appendChild(host)
  const frameDocument = await frameDocumentReady
  const renderRoot = frameDocument.querySelector('[data-kg-html-video-frame-host="1"]') as HTMLElement | null
  if (!renderRoot || typeof renderRoot.getBoundingClientRect !== 'function') {
    host.remove()
    throw new Error('canvas-2d video renderer could not find isolated frame render root')
  }
  return { host, renderRoot }
}

const drawFrame = async (
  context: CanvasRenderingContext2D,
  spec: Readonly<RenderSpec>,
  timeMs: number,
  html2canvas: (element: HTMLElement, options: Record<string, unknown>) => Promise<HTMLCanvasElement>,
): Promise<void> => {
  const { host, renderRoot } = await createFrameRenderDocument(spec, timeMs)
  try {
    const renderedCanvas = await html2canvas(renderRoot, {
      width: spec.width,
      height: spec.height,
      windowWidth: spec.width,
      windowHeight: spec.height,
      scale: 1,
      backgroundColor: null,
      logging: false,
      useCORS: true,
    })
    context.clearRect(0, 0, spec.width, spec.height)
    context.drawImage(renderedCanvas, 0, 0, spec.width, spec.height)
  } finally {
    host.remove()
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
    const stream = canvas.captureStream(spec.fps)
    const chunks: Blob[] = []
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: CANVAS_2D_RECORDER_VIDEO_BITS_PER_SECOND,
    })
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.ondataavailable = event => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onerror = event => reject(event instanceof ErrorEvent ? event.error : new Error('canvas-2d MediaRecorder failed'))
      recorder.onstop = () => resolve()
    })

    const frameCount = Math.max(1, Math.ceil((spec.durationMs / 1000) * Math.max(1, spec.fps)))
    const frameDurationMs = 1000 / Math.max(1, spec.fps)
    try {
      recorder.start()
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        const timeMs = Math.min(spec.durationMs, frameIndex * frameDurationMs)
        await drawFrame(context, spec, timeMs, html2canvas)
        requestCanvasFrame(stream)
        await wait(frameDurationMs)
      }
      if (recorder.state !== 'inactive') recorder.stop()
      await stopped
    } finally {
      stopMediaStream(stream)
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
