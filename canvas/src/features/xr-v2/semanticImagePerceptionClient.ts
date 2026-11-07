import { readImageReferencePixels, type ImageReferencePixels } from '@/features/image-to-threejs/imageReferencePixels'
import { SPACE_IMAGE_LIMIT, hashSpaceImage, type SpaceRegion, type SpaceObservation } from './semanticSpaceRuntime'
import { IMAGE_PERCEPTION_LIMITS, describeChosenImageRegion, describeImageRelief, mapFocusedProposals, type ImagePerceptionResult } from './semanticImagePerception'

export type SemanticImageDraft = Readonly<{ observation: SpaceObservation; result: ImagePerceptionResult }>

type FocusOptions = { region?: SpaceRegion; useWholeRegion?: boolean; relief?: boolean; detail?: boolean }
let active = false
export async function perceiveImportedImage(sourceUrl: string, signal: AbortSignal, options: FocusOptions = {}): Promise<SemanticImageDraft> {
  if (active) throw Error('An image analysis is already running. Cancel it or wait for completion.')
  active = true
  try { return await runPerception(sourceUrl, signal, options) } finally { active = false }
}

/** Reads an already chosen import; never starts capture, uploads pixels or loads a model. */
async function loadSourceImage(sourceUrl: string, signal: AbortSignal) {
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
  return image
}

/** Perception and display have separate budgets. Never enlarge or repeatedly encode saved evidence. */
export function encodeSpaceImage(image: HTMLImageElement, sourceUrl: string) {
  const { naturalWidth: width, naturalHeight: height } = image
  if (![width, height].every(n => Number.isInteger(n) && n > 0) || width * height > 16_777_216) {
    throw Error('Resize this image below 16 megapixels for local analysis.')
  }
  if (sourceUrl.startsWith('data:image/') && sourceUrl.length <= SPACE_IMAGE_LIMIT
    && Math.max(width, height) <= 2048 && width * height <= 4_194_304) {
    return { width, height, imageDataUrl: sourceUrl }
  }
  const canvas = document.createElement('canvas')
  let scale = Math.min(1, 2048 / Math.max(width, height))
  // At most four resolutions and three encodings each, within the existing 2 MiB evidence limit.
  for (let attempt = 0; attempt < 4; attempt++, scale *= 0.75) {
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw Error('Image evidence could not be prepared.')
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.94, 0.88, 0.8]) {
      const imageDataUrl = canvas.toDataURL('image/jpeg', quality)
      if (imageDataUrl.length <= SPACE_IMAGE_LIMIT) return { width: canvas.width, height: canvas.height, imageDataUrl }
    }
  }
  throw Error('Image detail exceeds the local evidence budget. Choose a smaller original.')
}

export function imageEvidenceDifference(a: ImageReferencePixels, b: ImageReferencePixels): number {
  if (a.width !== b.width || a.height !== b.height || a.data.length !== a.width * a.height * 4
    || b.data.length !== a.data.length || !a.data.length) return Infinity
  let difference = 0
  for (let i = 0; i < a.data.length; i++) difference += Math.abs(a.data[i] - b.data[i])
  return difference / (a.data.length * 255)
}

/** Candidate only: the user reviews it before the revision-checked evidence update. */
export async function prepareImageEvidenceRefresh(sourceUrl: string, previous: SpaceObservation, signal: AbortSignal) {
  const image = await loadSourceImage(sourceUrl, signal)
  let old: HTMLImageElement | undefined
  try {
    const encoded = encodeSpaceImage(image, sourceUrl)
    if (encoded.width <= previous.width || encoded.height <= previous.height
      || Math.abs(encoded.width / encoded.height - previous.width / previous.height) > 0.005) {
      throw Error('Choose the same uncropped original at a higher resolution than the saved image.')
    }
    old = await loadSourceImage(previous.imageDataUrl, signal)
    const before = readImageReferencePixels({ image: old, maxDimension: 64 })
    const after = readImageReferencePixels({ image, maxDimension: 64 })
    if (imageEvidenceDifference(before, after) > 0.06) throw Error('This image differs from the saved photo. Choose the same uncropped original.')
    signal.throwIfAborted()
    return { ...encoded, id: `observation:${crypto.randomUUID()}`, capturedAtMs: Date.now(),
      sha256: await hashSpaceImage(encoded.imageDataUrl), orientation: 'source-pixels' as const, scale: 'unknown' as const }
  } finally { image.src = ''; if (old) old.src = '' }
}

async function runPerception(sourceUrl: string, signal: AbortSignal, options: FocusOptions = {}): Promise<SemanticImageDraft> {
  const image = await loadSourceImage(sourceUrl, signal)
  try {
    const pixels = readImageReferencePixels({ image, maxDimension: IMAGE_PERCEPTION_LIMITS.dimension, region: options.region })
    const encoded = encodeSpaceImage(image, sourceUrl)
    const observation: SpaceObservation = { id: `observation:${crypto.randomUUID()}`, capturedAtMs: Date.now(),
      ...encoded, sha256: await hashSpaceImage(encoded.imageDataUrl), orientation: 'source-pixels', scale: 'unknown' }
    signal.throwIfAborted()
    const result = options.relief ? describeImageRelief(pixels) : options.useWholeRegion ? describeChosenImageRegion(pixels) : await new Promise<ImagePerceptionResult>((resolve, reject) => {
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
      worker.postMessage({ pixels, detail: options.detail === true }, [pixels.data.buffer])
    })
    signal.throwIfAborted()
    return { observation, result: options.region ? mapFocusedProposals(result, options.region) : result }
  } finally { image.src = '' }
}
