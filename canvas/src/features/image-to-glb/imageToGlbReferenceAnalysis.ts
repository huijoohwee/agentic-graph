import { hashStringToHex } from '@/lib/hash/stringHash'
import type { ImageReferencePixels } from '@/features/image-to-threejs/imageReferencePixels'

type RgbColor = { b: number; g: number; r: number }

export type ImageToGlbSilhouetteSpan = {
  color: RgbColor
  height: number
  width: number
  x: number
  y: number
}

export type ImageToGlbReferenceAnalysis = {
  analysisConfidence: number
  aspectRatio: number
  backgroundMethod: 'alpha' | 'edge-palette'
  bottomWidthRatio: number
  foregroundCoverage: number
  height: number
  palette: readonly RgbColor[]
  profile: 'contour-volume'
  referenceDigest: string
  spans: readonly ImageToGlbSilhouetteSpan[]
  symmetryScore: number
  topWidthRatio: number
  width: number
}

type PixelMask = {
  bottom: number
  data: Uint8Array
  left: number
  right: number
  top: number
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const rounded = (value: number) => Number(value.toFixed(5))

function colorDistanceSquared(first: RgbColor, second: RgbColor): number {
  return (first.r - second.r) ** 2 + (first.g - second.g) ** 2 + (first.b - second.b) ** 2
}

function pixelColor(pixels: ImageReferencePixels, x: number, y: number): RgbColor {
  const index = (y * pixels.width + x) * 4
  return {
    r: Number(pixels.data[index] || 0),
    g: Number(pixels.data[index + 1] || 0),
    b: Number(pixels.data[index + 2] || 0),
  }
}

function edgePalette(pixels: ImageReferencePixels): RgbColor[] {
  const counts = new Map<string, { color: RgbColor; count: number }>()
  const add = (x: number, y: number) => {
    const color = pixelColor(pixels, x, y)
    const quantized = {
      r: Math.round(color.r / 24) * 24,
      g: Math.round(color.g / 24) * 24,
      b: Math.round(color.b / 24) * 24,
    }
    const key = `${quantized.r}:${quantized.g}:${quantized.b}`
    const existing = counts.get(key)
    if (existing) existing.count += 1
    else counts.set(key, { color: quantized, count: 1 })
  }
  for (let x = 0; x < pixels.width; x += 1) {
    add(x, 0)
    add(x, pixels.height - 1)
  }
  for (let y = 1; y < pixels.height - 1; y += 1) {
    add(0, y)
    add(pixels.width - 1, y)
  }
  return [...counts.values()]
    .sort((first, second) => second.count - first.count)
    .slice(0, 4)
    .map(entry => entry.color)
}

export function buildForegroundMask(pixels: ImageReferencePixels): { mask: PixelMask; method: ImageToGlbReferenceAnalysis['backgroundMethod'] } {
  const palette = edgePalette(pixels)
  const maskData = new Uint8Array(pixels.width * pixels.height)
  let transparentCount = 0
  for (let index = 3; index < pixels.data.length; index += 4) {
    if (Number(pixels.data[index] || 0) < 224) transparentCount += 1
  }
  const alphaAware = transparentCount > pixels.width * pixels.height * 0.01
  let left = pixels.width
  let right = -1
  let top = pixels.height
  let bottom = -1
  for (let y = 0; y < pixels.height; y += 1) {
    for (let x = 0; x < pixels.width; x += 1) {
      const pixelIndex = (y * pixels.width + x) * 4
      const alpha = Number(pixels.data[pixelIndex + 3] || 0)
      const color = pixelColor(pixels, x, y)
      const background = alphaAware
        ? alpha < 48
        : palette.some(candidate => colorDistanceSquared(color, candidate) <= 42 ** 2)
      if (background) continue
      const maskIndex = y * pixels.width + x
      maskData[maskIndex] = 1
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < left || bottom < top) throw new Error('Reference-image analysis could not isolate a foreground object.')
  return {
    mask: { bottom, data: maskData, left, right, top },
    method: alphaAware ? 'alpha' : 'edge-palette',
  }
}

function averageSpanColor(args: {
  pixels: ImageReferencePixels
  mask: PixelMask
  left: number
  right: number
  top: number
  bottom: number
}): RgbColor {
  let red = 0
  let green = 0
  let blue = 0
  let count = 0
  for (let y = args.top; y <= args.bottom; y += 1) {
    for (let x = args.left; x <= args.right; x += 1) {
      if (!args.mask.data[y * args.pixels.width + x]) continue
      const color = pixelColor(args.pixels, x, y)
      red += color.r
      green += color.g
      blue += color.b
      count += 1
    }
  }
  return count > 0
    ? { r: Math.round(red / count), g: Math.round(green / count), b: Math.round(blue / count) }
    : { r: 148, g: 163, b: 184 }
}

function foregroundRuns(args: {
  fine?: boolean
  bandBottom: number
  bandTop: number
  mask: PixelMask
  pixels: ImageReferencePixels
}): Array<{ left: number; right: number }> {
  const bandHeight = args.bandBottom - args.bandTop + 1
  const active: boolean[] = []
  for (let x = args.mask.left; x <= args.mask.right; x += 1) {
    let count = 0
    for (let y = args.bandTop; y <= args.bandBottom; y += 1) count += args.mask.data[y * args.pixels.width + x] || 0
    active.push(count / bandHeight >= 0.16)
  }
  const runs: Array<{ left: number; right: number }> = []
  let runStart = -1
  for (let index = 0; index <= active.length; index += 1) {
    if (active[index] && runStart < 0) runStart = index
    if ((!active[index] || index === active.length) && runStart >= 0) {
      const right = index - 1
      if (right - runStart + 1 >= (args.fine ? 1 : Math.max(2, Math.round(active.length * 0.018)))) {
        runs.push({ left: args.mask.left + runStart, right: args.mask.left + right })
      }
      runStart = -1
    }
  }
  return runs
}

function buildSilhouetteSpans(pixels: ImageReferencePixels, mask: PixelMask, fine = false): ImageToGlbSilhouetteSpan[] {
  const boundsWidth = mask.right - mask.left + 1
  const boundsHeight = mask.bottom - mask.top + 1
  const bandCount = fine ? Math.min(boundsHeight, 96) : clamp(Math.round(boundsHeight / 4), 18, 30)
  const spans: ImageToGlbSilhouetteSpan[] = []
  for (let band = 0; band < bandCount; band += 1) {
    const bandTop = mask.top + Math.floor((band / bandCount) * boundsHeight)
    const bandBottom = Math.min(mask.bottom, mask.top + Math.floor(((band + 1) / bandCount) * boundsHeight) - 1)
    for (const run of foregroundRuns({ bandBottom, bandTop, mask, pixels, fine })) {
      spans.push({
        color: averageSpanColor({ pixels, mask, left: run.left, right: run.right, top: bandTop, bottom: bandBottom }),
        height: rounded((bandBottom - bandTop + 1) / boundsHeight),
        width: rounded((run.right - run.left + 1) / boundsWidth),
        x: rounded((((run.left + run.right) / 2) - mask.left) / boundsWidth - 0.5),
        y: rounded(0.5 - (((bandTop + bandBottom) / 2) - mask.top) / boundsHeight),
      })
    }
  }
  return spans
}

function spanWidthNear(spans: readonly ImageToGlbSilhouetteSpan[], targetY: number): number {
  const bandWidths = new Map<string, number>()
  for (const span of spans.filter(item => Math.abs(item.y - targetY) <= 0.08)) {
    const key = span.y.toFixed(4)
    bandWidths.set(key, (bandWidths.get(key) || 0) + span.width)
  }
  const widths = [...bandWidths.values()].sort((first, second) => first - second)
  const middle = Math.floor(widths.length / 2)
  return widths.length === 0
    ? 0
    : widths.length % 2 === 0
      ? ((widths[middle - 1] || 0) + (widths[middle] || 0)) / 2
      : widths[middle] || 0
}

function symmetryScore(pixels: ImageReferencePixels, mask: PixelMask): number {
  const width = mask.right - mask.left + 1
  const height = mask.bottom - mask.top + 1
  let matches = 0
  let total = 0
  for (let y = mask.top; y <= mask.bottom; y += 1) {
    for (let offset = 0; offset < Math.ceil(width / 2); offset += 1) {
      matches += mask.data[y * pixels.width + mask.left + offset] === mask.data[y * pixels.width + mask.right - offset] ? 1 : 0
      total += 1
    }
  }
  return total > 0 ? matches / total : 0
}

function foregroundCoverage(pixels: ImageReferencePixels, mask: PixelMask): number {
  let count = 0
  for (let y = mask.top; y <= mask.bottom; y += 1) {
    for (let x = mask.left; x <= mask.right; x += 1) count += mask.data[y * pixels.width + x] || 0
  }
  return count / ((mask.right - mask.left + 1) * (mask.bottom - mask.top + 1))
}

function foregroundPalette(pixels: ImageReferencePixels, mask: PixelMask): RgbColor[] {
  const clusters = new Map<string, { blue: number; count: number; green: number; red: number }>()
  for (let y = mask.top; y <= mask.bottom; y += 1) {
    for (let x = mask.left; x <= mask.right; x += 1) {
      if (!mask.data[y * pixels.width + x]) continue
      const color = pixelColor(pixels, x, y)
      const key = `${Math.round(color.r / 16)}:${Math.round(color.g / 16)}:${Math.round(color.b / 16)}`
      const cluster = clusters.get(key)
      if (cluster) {
        cluster.red += color.r
        cluster.green += color.g
        cluster.blue += color.b
        cluster.count += 1
      } else {
        clusters.set(key, { blue: color.b, count: 1, green: color.g, red: color.r })
      }
    }
  }
  return [...clusters.values()]
    .sort((first, second) => second.count - first.count)
    .slice(0, 5)
    .map(cluster => ({
      b: Math.round(cluster.blue / cluster.count),
      g: Math.round(cluster.green / cluster.count),
      r: Math.round(cluster.red / cluster.count),
    }))
}

export function analyzeImageToGlbReference(pixels: ImageReferencePixels, options: { detail?: 'standard' | 'fine' } = {}): ImageToGlbReferenceAnalysis {
  if (pixels.data.length !== pixels.width * pixels.height * 4) throw new Error('Reference pixel dimensions do not match their RGBA data.')
  const { mask, method } = buildForegroundMask(pixels)
  const spans = buildSilhouetteSpans(pixels, mask, options.detail === 'fine')
  if (spans.length < 3) throw new Error('Reference-image analysis found too little procedural structure.')
  const symmetry = symmetryScore(pixels, mask)
  const topWidthRatio = clamp(spanWidthNear(spans, 0.38), 0, 1)
  const bottomWidthRatio = clamp(spanWidthNear(spans, -0.38), 0, 1)
  const referenceDigest = hashStringToHex(`${pixels.width}x${pixels.height}:${Array.from(pixels.data).join(',')}`)
  const palette = foregroundPalette(pixels, mask)
  const coverage = foregroundCoverage(pixels, mask)
  const analysisConfidence = clamp(
    0.64 + Math.min(spans.length / 24, 1) * 0.12 + coverage * 0.1 + symmetry * 0.08,
    0,
    0.94,
  )
  return {
    analysisConfidence,
    aspectRatio: (mask.right - mask.left + 1) / (mask.bottom - mask.top + 1),
    backgroundMethod: method,
    bottomWidthRatio,
    foregroundCoverage: coverage,
    height: pixels.height,
    palette,
    profile: 'contour-volume',
    referenceDigest,
    spans,
    symmetryScore: symmetry,
    topWidthRatio,
    width: pixels.width,
  }
}

