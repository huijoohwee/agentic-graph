import type { ImageReferencePixels } from './imageReferencePixels'

export type RasterRelief = Readonly<{ width: number; height: number; samples: readonly number[] }>
export function validateRasterRelief(value: unknown): RasterRelief {
  const field = value as RasterRelief
  if (!field || Object.keys(field).some(key => !['width', 'height', 'samples'].includes(key))
    || ![field.width, field.height].every(n => Number.isInteger(n) && n >= 3 && n <= 65)
    || !Array.isArray(field.samples) || field.samples.length !== field.width * field.height
    || !field.samples.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) throw Error('Invalid bounded image relief.')
  return field
}
export const luminance = (data: ArrayLike<number>, i: number) =>
  (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255

/** Brightness is an explicit sculpting convention, never a measured depth estimate. */
export function describeRasterRelief(pixels: ImageReferencePixels): RasterRelief {
  const scale = Math.min(1, 65 / Math.max(pixels.width, pixels.height))
  const width = Math.max(3, Math.round(pixels.width * scale)), height = Math.max(3, Math.round(pixels.height * scale))
  const samples: number[] = []
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.round(x / (width - 1) * (pixels.width - 1)), sy = Math.round(y / (height - 1) * (pixels.height - 1))
    samples.push(Math.round(luminance(pixels.data, (sy * pixels.width + sx) * 4) * 255))
  }
  return validateRasterRelief({ width, height, samples })
}

