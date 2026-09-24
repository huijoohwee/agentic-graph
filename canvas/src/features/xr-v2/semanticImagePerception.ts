import { buildForegroundMask } from '@/features/image-to-glb/imageToGlbReferenceAnalysis'
import type { ImageReferencePixels } from '@/features/image-to-threejs/imageReferencePixels'
import type { TwinSilhouette } from './semanticTwinSilhouette'
import type { TwinTemplate } from './semanticTwinRuntime'
import type { SpaceRegion } from './semanticSpaceRuntime'

export const IMAGE_PERCEPTION_METHOD = 'local-foreground-components-v1' as const
export const IMAGE_PERCEPTION_LIMITS = Object.freeze({ dimension: 192, regions: 12, timeoutMs: 5000 })
export type ImageRegionProposal = Readonly<{
  region: SpaceRegion; color: string; coverage: number; label: string
  silhouette?: TwinSilhouette; template?: TwinTemplate; source?: 'user-region'
}>
export type ImagePerceptionResult = Readonly<{
  method: typeof IMAGE_PERCEPTION_METHOD
  background: 'alpha' | 'edge-palette' | 'user-region'
  width: number; height: number; proposals: readonly ImageRegionProposal[]
}>

/** Classical connected components over the existing foreground mask; no object recognition. */
export function analyzeSemanticImage(pixels: ImageReferencePixels): ImagePerceptionResult {
  const { width, height, data } = pixels
  if (![width, height].every(n => Number.isSafeInteger(n) && n >= 1 && n <= IMAGE_PERCEPTION_LIMITS.dimension)
    || !(data instanceof Uint8ClampedArray) || data.length !== width * height * 4) {
    throw Error('Local perception requires a dimension-matched image of at most 192 pixels per side.')
  }
  const { mask, method } = buildForegroundMask(pixels)
  const queue = new Uint32Array(width * height)
  const proposals: ImageRegionProposal[] = []
  for (let start = 0; start < mask.data.length; start++) {
    if (!mask.data[start]) continue
    let head = 0, tail = 1, left = width, right = 0, top = height, bottom = 0
    let red = 0, green = 0, blue = 0
    queue[0] = start; mask.data[start] = 0
    while (head < tail) {
      const index = queue[head++], x = index % width, y = Math.floor(index / width)
      left = Math.min(left, x); right = Math.max(right, x)
      top = Math.min(top, y); bottom = Math.max(bottom, y)
      red += data[index * 4]; green += data[index * 4 + 1]; blue += data[index * 4 + 2]
      for (const neighbor of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
        if (neighbor < 0 || !mask.data[neighbor]) continue
        mask.data[neighbor] = 0; queue[tail++] = neighbor
      }
    }
    const coverage = tail / (width * height)
    if (coverage < 0.008 || right - left < 2 || bottom - top < 2) continue
    const cropWidth = right - left + 1, cropHeight = bottom - top + 1
    const component = new Uint8Array(cropWidth * cropHeight)
    for (let i = 0; i < tail; i++) component[(Math.floor(queue[i] / width) - top) * cropWidth + queue[i] % width - left] = 1
    const runs: [number, number, number][] = []
    for (let y = 0; y < cropHeight; y++) for (let x = 0; x < cropWidth;) {
      if (!component[y * cropWidth + x]) { x++; continue }
      const startX = x
      while (x < cropWidth && component[y * cropWidth + x]) x++
      runs.push([startX, y, x - startX])
    }
    proposals.push({ ...(runs.length <= 2048 ? { silhouette: { width: cropWidth, height: cropHeight, runs } } : {}), region: { x: left / width, y: top / height,
      width: (right - left + 1) / width, height: (bottom - top + 1) / height },
    color: '#' + [red, green, blue].map(sum => Math.round(sum / tail).toString(16).padStart(2, '0')).join(''),
    coverage, label: '' })
  }
  const selected = proposals.sort((a, b) => b.coverage - a.coverage || a.region.x - b.region.x)
    .slice(0, IMAGE_PERCEPTION_LIMITS.regions).map((item, index) => ({ ...item, label: `Visible region ${index + 1}` }))
  if (!selected.length) throw Error('No distinct regions found. Use a clearer image or confirm regions manually in Semantic space.')
  return { method: IMAGE_PERCEPTION_METHOD, background: method, width, height, proposals: selected }
}

/** Translate focused proposals back to the saved full-image evidence coordinate frame. */
export function mapFocusedProposals(result: ImagePerceptionResult, focus: SpaceRegion): ImagePerceptionResult {
  if (![focus.x, focus.y, focus.width, focus.height].every(Number.isFinite) || focus.x < 0 || focus.y < 0
    || focus.width <= 0 || focus.height <= 0 || focus.x + focus.width > 1 + 1e-9 || focus.y + focus.height > 1 + 1e-9) {
    throw Error('Focus must stay inside the image.')
  }
  return { ...result, proposals: result.proposals.map(item => ({ ...item,
    coverage: item.coverage * focus.width * focus.height,
    region: { x: focus.x + item.region.x * focus.width, y: focus.y + item.region.y * focus.height,
      width: item.region.width * focus.width, height: item.region.height * focus.height } })) }
}

/** Explicit authored crop for continuous surfaces; no foreground/identity claim. */
export function describeChosenImageRegion(pixels: ImageReferencePixels): ImagePerceptionResult {
  const { width, height, data } = pixels
  if (width < 3 || height < 3 || width > 192 || height > 192 || data.length !== width * height * 4) {
    throw Error('Choose an image region at least three pixels wide and high.')
  }
  const sums = [0, 0, 0]
  for (let i = 0; i < data.length; i += 4) sums.forEach((_, channel) => { sums[channel] += data[i + channel] })
  return { method: IMAGE_PERCEPTION_METHOD, background: 'user-region', width, height,
    proposals: [{ region: { x: 0, y: 0, width: 1, height: 1 }, coverage: 1, label: 'Chosen region', template: 'box', source: 'user-region',
      color: '#' + sums.map(sum => Math.round(sum / (width * height)).toString(16).padStart(2, '0')).join('') }] }
}
