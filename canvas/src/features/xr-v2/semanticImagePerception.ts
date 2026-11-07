import { describeRasterRelief, type RasterRelief } from '@/features/image-to-threejs/imageRasterReliefField'
import { buildForegroundMask } from '@/features/image-to-glb/imageToGlbReferenceAnalysis'
import type { ImageReferencePixels } from '@/features/image-to-threejs/imageReferencePixels'
import type { TwinSilhouette } from './semanticTwinSilhouette'
import type { TwinTemplate } from './semanticTwinRuntime'
import type { SpaceRegion } from './semanticSpaceRuntime'

export const IMAGE_PERCEPTION_METHOD = 'local-foreground-components-v1' as const
export const IMAGE_PERCEPTION_LIMITS = Object.freeze({ dimension: 192, regions: 12, timeoutMs: 5000 })
export type ImageRegionProposal = Readonly<{
  region: SpaceRegion; color: string; coverage: number; label: string
  silhouette?: TwinSilhouette; template?: TwinTemplate; source?: 'user-region'; relief?: RasterRelief
}>
export type ImagePerceptionResult = Readonly<{
  method: typeof IMAGE_PERCEPTION_METHOD
  background: 'alpha' | 'edge-palette' | 'user-region'
  width: number; height: number; proposals: readonly ImageRegionProposal[]
}>

type Component = readonly number[]

/** Split connected colours only where their spatial means differ; flat regions stay intact. */
function splitComponent(indices: Component, pixels: ImageReferencePixels) {
  const { width, height, data } = pixels
  let best: { axis: number; cut: number; score: number } | null = null
  for (const axis of [0, 1]) {
    const length = axis === 0 ? width : height
    const bins = Array.from({ length }, () => [0, 0, 0, 0])
    for (const index of indices) {
      const bin = bins[axis === 0 ? index % width : Math.floor(index / width)]
      bin[0]++
      for (let c = 0; c < 3; c++) bin[c + 1] += data[index * 4 + c]
    }
    const total = bins.reduce((sum, bin) => sum.map((n, c) => n + bin[c]), [0, 0, 0, 0])
    const left = [0, 0, 0, 0]
    const occupied = bins.map((bin, i) => bin[0] ? i : -1).filter(i => i >= 0)
    for (let cut = occupied[0]; cut < occupied[occupied.length - 1]; cut++) {
      for (let c = 0; c < 4; c++) left[c] += bins[cut][c]
      const rightCount = total[0] - left[0]
      // Both sides need visible extent and support; no one-pixel slivers or arbitrary grid.
      if (left[0] < Math.max(9, indices.length * 0.1) || rightCount < Math.max(9, indices.length * 0.1)
        || cut - occupied[0] < 2 || occupied[occupied.length - 1] - cut < 3) continue
      let contrast = 0
      for (let c = 1; c < 4; c++) contrast += (left[c] / left[0] - (total[c] - left[c]) / rightCount) ** 2
      if (contrast < 144) continue
      const score = contrast * left[0] * rightCount / total[0]
      if (!best || score > best.score) best = { axis, cut, score }
    }
  }
  if (!best) return null
  const split = best
  const left: number[] = [], right: number[] = []
  for (const index of indices) {
    const coordinate = split.axis === 0 ? index % width : Math.floor(index / width)
    ;(coordinate <= split.cut ? left : right).push(index)
  }
  return { left, right, score: split.score }
}

function describeComponent(indices: Component, pixels: ImageReferencePixels): ImageRegionProposal | null {
  const { width, height, data } = pixels
  let left = width, right = 0, top = height, bottom = 0
  const sums = [0, 0, 0]
  for (const index of indices) {
    const x = index % width, y = Math.floor(index / width)
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
    for (let c = 0; c < 3; c++) sums[c] += data[index * 4 + c]
  }
  if (right - left < 2 || bottom - top < 2) return null
  const cropWidth = right - left + 1, cropHeight = bottom - top + 1
  const component = new Uint8Array(cropWidth * cropHeight)
  for (const index of indices) component[(Math.floor(index / width) - top) * cropWidth + index % width - left] = 1
  const runs: [number, number, number][] = []
  for (let y = 0; y < cropHeight; y++) for (let x = 0; x < cropWidth;) {
    if (!component[y * cropWidth + x]) { x++; continue }
    const start = x
    while (x < cropWidth && component[y * cropWidth + x]) x++
    runs.push([start, y, x - start])
  }
  return { ...(runs.length <= 2048 ? { silhouette: { width: cropWidth, height: cropHeight, runs } } : {}),
    region: { x: left / width, y: top / height, width: cropWidth / width, height: cropHeight / height },
    color: '#' + sums.map(sum => Math.round(sum / indices.length).toString(16).padStart(2, '0')).join(''),
    coverage: indices.length / (width * height), label: '' }
}

/** Existing foreground components with an optional bounded contrast refinement; no recognition. */
export function analyzeSemanticImage(pixels: ImageReferencePixels, options: { detail?: boolean } = {}): ImagePerceptionResult {
  const { width, height, data } = pixels
  if (![width, height].every(n => Number.isSafeInteger(n) && n >= 1 && n <= IMAGE_PERCEPTION_LIMITS.dimension)
    || !(data instanceof Uint8ClampedArray) || data.length !== width * height * 4) {
    throw Error('Local perception requires a dimension-matched image of at most 192 pixels per side.')
  }
  const { mask, method } = buildForegroundMask(pixels)
  const queue = new Uint32Array(width * height)
  const components: number[][] = []
  for (let start = 0; start < mask.data.length; start++) {
    if (!mask.data[start]) continue
    let head = 0, tail = 1
    queue[0] = start; mask.data[start] = 0
    while (head < tail) {
      const index = queue[head++], x = index % width, y = Math.floor(index / width)
      for (const neighbor of [x > 0 ? index - 1 : -1, x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1, y + 1 < height ? index + width : -1]) {
        if (neighbor < 0 || !mask.data[neighbor]) continue
        mask.data[neighbor] = 0; queue[tail++] = neighbor
      }
    }
    if (tail / (width * height) >= (options.detail ? 0.001 : 0.008) && tail >= 9) components.push(Array.from(queue.subarray(0, tail)))
  }
  let selected = components.map(indices => ({ indices, proposal: describeComponent(indices, pixels) }))
    .filter(item => item.proposal).sort((a, b) => b.indices.length - a.indices.length).slice(0, IMAGE_PERCEPTION_LIMITS.regions)
  if (options.detail) {
    const candidates = selected.map(item => ({ ...item, split: splitComponent(item.indices, pixels) }))
    while (candidates.length < IMAGE_PERCEPTION_LIMITS.regions) {
      const best = candidates.filter(item => item.split).sort((a, b) => b.split!.score - a.split!.score)[0]
      if (!best?.split) break
      const children = [best.split.left, best.split.right].map(indices => ({ indices, proposal: describeComponent(indices, pixels), split: splitComponent(indices, pixels) }))
      if (children.some(item => !item.proposal)) { best.split = null; continue }
      candidates.splice(candidates.indexOf(best), 1, ...children)
    }
    selected = candidates
  }
  const proposals = selected.map(item => item.proposal!).sort((a, b) => b.coverage - a.coverage || a.region.x - b.region.x)
    .map((item, index) => ({ ...item, label: `${options.detail ? 'Detail' : 'Visible'} region ${index + 1}` }))
  if (!proposals.length) throw Error('No distinct regions found. Use a clearer image or confirm regions manually in Semantic space.')
  return { method: IMAGE_PERCEPTION_METHOD, background: method, width, height, proposals }
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

/** Full raster coverage, including pixels excluded by foreground segmentation. */
export function describeImageRelief(pixels: ImageReferencePixels): ImagePerceptionResult {
  const result = describeChosenImageRegion(pixels)
  return { ...result, proposals: [{ ...result.proposals[0], label: 'Whole image relief', template: 'relief', relief: describeRasterRelief(pixels) }] }
}
