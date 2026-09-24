import { buildForegroundMask } from '@/features/image-to-glb/imageToGlbReferenceAnalysis'
import type { ImageReferencePixels } from '@/features/image-to-threejs/imageReferencePixels'
import type { SpaceRegion } from './semanticSpaceRuntime'

export const IMAGE_PERCEPTION_METHOD = 'local-foreground-components-v1' as const
export const IMAGE_PERCEPTION_LIMITS = Object.freeze({ dimension: 192, regions: 12, timeoutMs: 5000 })
export type ImageRegionProposal = Readonly<{
  region: SpaceRegion; color: string; coverage: number; label: string
}>
export type ImagePerceptionResult = Readonly<{
  method: typeof IMAGE_PERCEPTION_METHOD
  background: 'alpha' | 'edge-palette'
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
    proposals.push({ region: { x: left / width, y: top / height,
      width: (right - left + 1) / width, height: (bottom - top + 1) / height },
    color: '#' + [red, green, blue].map(sum => Math.round(sum / tail).toString(16).padStart(2, '0')).join(''),
    coverage, label: '' })
  }
  const selected = proposals.sort((a, b) => b.coverage - a.coverage || a.region.x - b.region.x)
    .slice(0, IMAGE_PERCEPTION_LIMITS.regions).map((item, index) => ({ ...item, label: `Visible region ${index + 1}` }))
  if (!selected.length) throw Error('No distinct regions found. Use a clearer image or confirm regions manually in Semantic space.')
  return { method: IMAGE_PERCEPTION_METHOD, background: method, width, height, proposals: selected }
}
