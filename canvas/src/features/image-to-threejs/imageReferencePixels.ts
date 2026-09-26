export type RasterImageSource = CanvasImageSource & {
  height?: number
  naturalHeight?: number
  naturalWidth?: number
  width?: number
}

export type ImageReferencePixels = {
  data: Uint8ClampedArray
  height: number
  sourceHeight: number
  sourceWidth: number
  width: number
}

export function getRasterImageDimensions(image: Partial<RasterImageSource> | undefined) {
  const width = Number(image?.naturalWidth || image?.width || 1)
  const height = Number(image?.naturalHeight || image?.height || 1)
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  }
}

/**
 * Read one bounded reference raster for both native Three.js relief and the
 * procedural GLB reconstruction. Geometry remains procedural; these pixels
 * are evidence used to choose dimensions, parts, and materials.
 */
export function readImageReferencePixels(args: {
  image: RasterImageSource
  maxDimension?: number
  region?: { x: number; y: number; width: number; height: number }
}): ImageReferencePixels {
  if (typeof document === 'undefined') {
    throw new Error('Reference-image analysis requires the browser canvas runtime.')
  }
  const dimensions = getRasterImageDimensions(args.image)
  const region = args.region || { x: 0, y: 0, width: 1, height: 1 }
  if (![region.x, region.y, region.width, region.height].every(Number.isFinite)
    || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0
    || region.x + region.width > 1 + 1e-9 || region.y + region.height > 1 + 1e-9) {
    throw new Error('Reference focus must stay inside the source image.')
  }
  const sourceWidth = dimensions.width * region.width, sourceHeight = dimensions.height * region.height
  const maxDimension = Math.max(32, Math.min(256, Math.round(args.maxDimension || 128)))
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Reference-image analysis could not create a 2D canvas context.')
  context.clearRect(0, 0, width, height)
  context.drawImage(args.image, region.x * dimensions.width, region.y * dimensions.height, sourceWidth, sourceHeight, 0, 0, width, height)
  return {
    data: context.getImageData(0, 0, width, height).data,
    height,
    sourceHeight: dimensions.height,
    sourceWidth: dimensions.width,
    width,
  }
}

export async function loadImageReferencePixels(args: {
  sourceUrl: string
  maxDimension?: number
}): Promise<ImageReferencePixels> {
  const sourceUrl = String(args.sourceUrl || '').trim()
  if (!sourceUrl) throw new Error('Reference-image analysis requires an image URL.')
  if (typeof Image !== 'function') throw new Error('Reference-image analysis requires the browser Image runtime.')
  const image = new Image() as HTMLImageElement & RasterImageSource
  image.decoding = 'async'
  if (!sourceUrl.startsWith('data:') && !sourceUrl.startsWith('blob:')) image.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('Reference image could not be loaded for procedural reconstruction.'))
    image.src = sourceUrl
  })
  return readImageReferencePixels({ image, maxDimension: args.maxDimension })
}
