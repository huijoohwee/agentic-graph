export type AlignmentAxis = 'x' | 'y'
export type AlignmentAnchor = 'start' | 'center' | 'end'

export type AlignmentRect = {
  id: string
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type AlignmentGuide = {
  axis: AlignmentAxis
  position: number
  movingAnchor: AlignmentAnchor
  targetAnchor: AlignmentAnchor
  targetId: string
}

export type AlignmentSnapResult = {
  dx: number
  dy: number
  guides: AlignmentGuide[]
}

type AxisCandidate = {
  delta: number
  movingAnchor: AlignmentAnchor
  targetAnchor: AlignmentAnchor
  targetId: string
  targetPosition: number
}

const DEFAULT_THRESHOLD_PX = 6
const ANCHORS: AlignmentAnchor[] = ['start', 'center', 'end']

const finite = (value: number, fallback = 0): number => (
  Number.isFinite(value) ? value : fallback
)

const normalizedRect = (rect: AlignmentRect): AlignmentRect => ({
  id: String(rect.id || ''),
  minX: Math.min(finite(rect.minX), finite(rect.maxX)),
  minY: Math.min(finite(rect.minY), finite(rect.maxY)),
  maxX: Math.max(finite(rect.minX), finite(rect.maxX)),
  maxY: Math.max(finite(rect.minY), finite(rect.maxY)),
})

export function alignmentRectFromCenter(args: {
  id: string
  cx: number
  cy: number
  width: number
  height: number
}): AlignmentRect {
  const halfW = Math.max(0, finite(args.width)) / 2
  const halfH = Math.max(0, finite(args.height)) / 2
  return {
    id: String(args.id || ''),
    minX: finite(args.cx) - halfW,
    minY: finite(args.cy) - halfH,
    maxX: finite(args.cx) + halfW,
    maxY: finite(args.cy) + halfH,
  }
}

export function alignmentRectFromTopLeft(args: {
  id: string
  x: number
  y: number
  width: number
  height: number
}): AlignmentRect {
  const x = finite(args.x)
  const y = finite(args.y)
  return {
    id: String(args.id || ''),
    minX: x,
    minY: y,
    maxX: x + Math.max(0, finite(args.width)),
    maxY: y + Math.max(0, finite(args.height)),
  }
}

export function translateAlignmentRect(rect: AlignmentRect, dx: number, dy: number): AlignmentRect {
  const normalized = normalizedRect(rect)
  const safeDx = finite(dx)
  const safeDy = finite(dy)
  return {
    ...normalized,
    minX: normalized.minX + safeDx,
    minY: normalized.minY + safeDy,
    maxX: normalized.maxX + safeDx,
    maxY: normalized.maxY + safeDy,
  }
}

export function unionAlignmentRects(rects: AlignmentRect[], id = 'selection'): AlignmentRect | null {
  if (rects.length === 0) return null
  const first = normalizedRect(rects[0]!)
  let minX = first.minX
  let minY = first.minY
  let maxX = first.maxX
  let maxY = first.maxY
  for (let i = 1; i < rects.length; i += 1) {
    const rect = normalizedRect(rects[i]!)
    minX = Math.min(minX, rect.minX)
    minY = Math.min(minY, rect.minY)
    maxX = Math.max(maxX, rect.maxX)
    maxY = Math.max(maxY, rect.maxY)
  }
  return { id, minX, minY, maxX, maxY }
}

const readAnchor = (
  rect: AlignmentRect,
  axis: AlignmentAxis,
  anchor: AlignmentAnchor,
): number => {
  const start = axis === 'x' ? rect.minX : rect.minY
  const end = axis === 'x' ? rect.maxX : rect.maxY
  if (anchor === 'start') return start
  if (anchor === 'end') return end
  return (start + end) / 2
}

const anchorRank = (anchor: AlignmentAnchor): number => (
  anchor === 'center' ? 0 : anchor === 'start' ? 1 : 2
)

const compareCandidates = (a: AxisCandidate, b: AxisCandidate): number => {
  const distance = Math.abs(a.delta) - Math.abs(b.delta)
  if (Math.abs(distance) > 1e-9) return distance
  const sameAnchor = Number(a.movingAnchor !== a.targetAnchor) - Number(b.movingAnchor !== b.targetAnchor)
  if (sameAnchor !== 0) return sameAnchor
  const movingRank = anchorRank(a.movingAnchor) - anchorRank(b.movingAnchor)
  if (movingRank !== 0) return movingRank
  const targetRank = anchorRank(a.targetAnchor) - anchorRank(b.targetAnchor)
  if (targetRank !== 0) return targetRank
  if (a.targetId < b.targetId) return -1
  if (a.targetId > b.targetId) return 1
  return 0
}

const resolveAxis = (args: {
  axis: AlignmentAxis
  moving: AlignmentRect
  stationary: AlignmentRect[]
  thresholdWorld: number
}): AxisCandidate | null => {
  const candidates: AxisCandidate[] = []
  for (const targetRaw of args.stationary) {
    const target = normalizedRect(targetRaw)
    if (!target.id || target.id === args.moving.id) continue
    for (const movingAnchor of ANCHORS) {
      const movingPosition = readAnchor(args.moving, args.axis, movingAnchor)
      for (const targetAnchor of ANCHORS) {
        const targetPosition = readAnchor(target, args.axis, targetAnchor)
        const delta = targetPosition - movingPosition
        if (Math.abs(delta) > args.thresholdWorld) continue
        candidates.push({
          delta,
          movingAnchor,
          targetAnchor,
          targetId: target.id,
          targetPosition,
        })
      }
    }
  }
  candidates.sort(compareCandidates)
  return candidates[0] || null
}

export function resolveAlignmentSnap(args: {
  moving: AlignmentRect
  stationary: AlignmentRect[]
  scale: number
  thresholdPx?: number
}): AlignmentSnapResult {
  const moving = normalizedRect(args.moving)
  const scale = Number.isFinite(args.scale) && args.scale > 0 ? args.scale : 1
  const thresholdPx = Number.isFinite(args.thresholdPx)
    ? Math.max(0, args.thresholdPx!)
    : DEFAULT_THRESHOLD_PX
  const thresholdWorld = thresholdPx / scale
  const x = resolveAxis({ axis: 'x', moving, stationary: args.stationary, thresholdWorld })
  const y = resolveAxis({ axis: 'y', moving, stationary: args.stationary, thresholdWorld })
  const guides: AlignmentGuide[] = []
  if (x) {
    guides.push({
      axis: 'x',
      position: x.targetPosition,
      movingAnchor: x.movingAnchor,
      targetAnchor: x.targetAnchor,
      targetId: x.targetId,
    })
  }
  if (y) {
    guides.push({
      axis: 'y',
      position: y.targetPosition,
      movingAnchor: y.movingAnchor,
      targetAnchor: y.targetAnchor,
      targetId: y.targetId,
    })
  }
  return { dx: x?.delta || 0, dy: y?.delta || 0, guides }
}

export function alignmentGuideScreenPosition(
  guide: AlignmentGuide,
  transform: { x: number; y: number; k: number },
): number {
  const k = Number.isFinite(transform.k) && transform.k > 0 ? transform.k : 1
  const offset = guide.axis === 'x' ? finite(transform.x) : finite(transform.y)
  return offset + guide.position * k
}
