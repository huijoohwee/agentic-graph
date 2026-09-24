import { readImageReferencePixels } from '@/features/image-to-threejs/imageReferencePixels'
import { hashSpaceImage, type SpaceObservation } from './semanticSpaceRuntime'
import { IMAGE_PERCEPTION_LIMITS, type ImagePerceptionResult } from './semanticImagePerception'

export type SemanticImageDraft = Readonly<{ observation: SpaceObservation; result: ImagePerceptionResult }>

let active = false
export async function perceiveImportedImage(sourceUrl: string, signal: AbortSignal): Promise<SemanticImageDraft> {
  if (active) throw Error('An image analysis is already running. Cancel it or wait for completion.')
  active = true
  try { return await runPerception(sourceUrl, signal) } finally { active = false }
}

/** Reads an already chosen import; never starts capture, uploads pixels or loads a model. */
async function runPerception(sourceUrl: string, signal: AbortSignal): Promise<SemanticImageDraft> {
  signal.throwIfAborted()
  const image = new Image()
  image.decoding = 'async'
  if (!sourceUrl.startsWith('blob:') && !sourceUrl.startsWith('data:')) image.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer); signal.removeEventListener('abort', abort)
      image.onload = null; image.onerror = null
      if (error) { image.src = ''; reject(error) } else resolve()
    }
    const abort = () => finish(new Error('Image analysis cancelled.'))
    const timer = setTimeout(() => finish(new Error('Image did not load within 15 seconds.')), 15_000)
    signal.addEventListener('abort', abort, { once: true })
    image.onload = () => finish()
    image.onerror = () => finish(new Error('Cannot read image pixels. Import a local copy if the URL blocks cross-origin access.'))
    image.src = sourceUrl
  })
  signal.throwIfAborted()
  if (image.naturalWidth * image.naturalHeight > 16_777_216) throw Error('Resize this image below 16 megapixels for local analysis.')
  const pixels = readImageReferencePixels({ image, maxDimension: IMAGE_PERCEPTION_LIMITS.dimension })
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight))
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw Error('Image evidence could not be prepared.')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8)
  const observation: SpaceObservation = { id: `observation:${crypto.randomUUID()}`, capturedAtMs: Date.now(),
    width: canvas.width, height: canvas.height, imageDataUrl, sha256: await hashSpaceImage(imageDataUrl),
    orientation: 'source-pixels', scale: 'unknown' }
  signal.throwIfAborted()
  const result = await new Promise<ImagePerceptionResult>((resolve, reject) => {
    const worker = new Worker(new URL('./semanticImagePerception.worker.ts', import.meta.url), { type: 'module' })
    const finish = (error?: Error, result?: ImagePerceptionResult) => {
      clearTimeout(timer); signal.removeEventListener('abort', abort); worker.terminate()
      if (error) reject(error); else resolve(result!)
    }
    const abort = () => finish(new Error('Image analysis cancelled.'))
    const timer = setTimeout(() => finish(new Error('Local analysis exceeded its five-second budget.')), IMAGE_PERCEPTION_LIMITS.timeoutMs)
    signal.addEventListener('abort', abort, { once: true })
    worker.onerror = () => finish(new Error('Local image worker failed. Retry or confirm regions manually.'))
    worker.onmessage = event => event.data.ok ? finish(undefined, event.data.result)
      : finish(new Error(event.data.message))
    worker.postMessage(pixels, [pixels.data.buffer])
  })
  signal.throwIfAborted()
  return { observation, result }
}
