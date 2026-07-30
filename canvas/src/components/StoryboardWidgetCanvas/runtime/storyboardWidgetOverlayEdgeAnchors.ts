import {
  buildForwardFlowEdgePathD,
  type EdgePathCurveOptions,
  type GlobalEdgeType,
} from '@/lib/graph/edgeTypes'

export type StoryboardOverlayAnchorSide = 'bottom' | 'left' | 'right' | 'top'

export type StoryboardOverlayRectLike = {
  bottom: number
  height: number
  left: number
  right: number
  top: number
  width: number
}

export type StoryboardOverlayRectAnchor = {
  side: StoryboardOverlayAnchorSide
  x: number
  y: number
}

export type StoryboardContainedProjectionEdgeAnchors = {
  source: StoryboardOverlayRectAnchor
  target: StoryboardOverlayRectAnchor
  trackSide: 'left' | 'right' | null
}

const isFiniteOverlayRect = (rect: StoryboardOverlayRectLike | null | undefined): rect is StoryboardOverlayRectLike =>
  !!rect
  && Number.isFinite(rect.left)
  && Number.isFinite(rect.right)
  && Number.isFinite(rect.top)
  && Number.isFinite(rect.bottom)
  && Number.isFinite(rect.width)
  && Number.isFinite(rect.height)
  && rect.width > 0
  && rect.height > 0

const readRectCenter = (rect: StoryboardOverlayRectLike): { x: number; y: number } => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
})

export function readNearestStoryboardOverlayAnchorSide(args: {
  fallbackSide: StoryboardOverlayAnchorSide
  fromRect: StoryboardOverlayRectLike
  toRect: StoryboardOverlayRectLike
}): StoryboardOverlayAnchorSide {
  if (!isFiniteOverlayRect(args.fromRect) || !isFiniteOverlayRect(args.toRect)) return args.fallbackSide
  const fromCenter = readRectCenter(args.fromRect)
  const toCenter = readRectCenter(args.toRect)
  const dx = toCenter.x - fromCenter.x
  const dy = toCenter.y - fromCenter.y
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return args.fallbackSide
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return args.fallbackSide
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

export function readStoryboardOverlayRectSideAnchor(
  rect: StoryboardOverlayRectLike,
  side: StoryboardOverlayAnchorSide,
): StoryboardOverlayRectAnchor | null {
  if (!isFiniteOverlayRect(rect)) return null
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  if (side === 'left') return { side, x: rect.left, y: centerY }
  if (side === 'right') return { side, x: rect.right, y: centerY }
  if (side === 'top') return { side, x: centerX, y: rect.top }
  return { side, x: centerX, y: rect.bottom }
}

export function readNearestStoryboardOverlayRectAnchors(args: {
  sourceRect: StoryboardOverlayRectLike
  targetRect: StoryboardOverlayRectLike
}): { source: StoryboardOverlayRectAnchor; target: StoryboardOverlayRectAnchor } | null {
  if (!isFiniteOverlayRect(args.sourceRect) || !isFiniteOverlayRect(args.targetRect)) return null
  const sourceSide = readNearestStoryboardOverlayAnchorSide({
    fallbackSide: 'right',
    fromRect: args.sourceRect,
    toRect: args.targetRect,
  })
  const targetSide = readNearestStoryboardOverlayAnchorSide({
    fallbackSide: 'left',
    fromRect: args.targetRect,
    toRect: args.sourceRect,
  })
  const source = readStoryboardOverlayRectSideAnchor(args.sourceRect, sourceSide)
  const target = readStoryboardOverlayRectSideAnchor(args.targetRect, targetSide)
  return source && target ? { source, target } : null
}

/**
 * Presentation-projected workflow edges connect members of one generated
 * collective. A vertically stacked collective needs a side gutter so a
 * parent-to-later-child edge does not cross the intervening cards.
 */
export function readStoryboardContainedProjectionEdgeAnchors(args: {
  sourceRect: StoryboardOverlayRectLike
  targetRect: StoryboardOverlayRectLike
}): StoryboardContainedProjectionEdgeAnchors | null {
  if (!isFiniteOverlayRect(args.sourceRect) || !isFiniteOverlayRect(args.targetRect)) return null
  const sourceCenter = readRectCenter(args.sourceRect)
  const targetCenter = readRectCenter(args.targetRect)
  const horizontalOverlap = Math.max(
    0,
    Math.min(args.sourceRect.right, args.targetRect.right)
      - Math.max(args.sourceRect.left, args.targetRect.left),
  )
  const minWidth = Math.min(args.sourceRect.width, args.targetRect.width)
  const verticallyStacked = horizontalOverlap >= minWidth * 0.25
    && Math.abs(targetCenter.y - sourceCenter.y) >= Math.abs(targetCenter.x - sourceCenter.x)
  if (!verticallyStacked) {
    const nearest = readNearestStoryboardOverlayRectAnchors(args)
    return nearest ? { ...nearest, trackSide: null } : null
  }
  const trackSide = 'right' as const
  const source = readStoryboardOverlayRectSideAnchor(args.sourceRect, trackSide)
  const target = readStoryboardOverlayRectSideAnchor(args.targetRect, trackSide)
  return source && target ? { source, target, trackSide } : null
}

export function buildStoryboardContainedProjectionEdgePath(args: {
  source: Pick<StoryboardOverlayRectAnchor, 'x' | 'y'>
  target: Pick<StoryboardOverlayRectAnchor, 'x' | 'y'>
  trackOffset?: number
  trackSide: 'left' | 'right'
}): string {
  const sx = Number.isFinite(args.source.x) ? args.source.x : 0
  const sy = Number.isFinite(args.source.y) ? args.source.y : 0
  const tx = Number.isFinite(args.target.x) ? args.target.x : sx
  const ty = Number.isFinite(args.target.y) ? args.target.y : sy
  const direction = args.trackSide === 'left' ? -1 : 1
  const offset = Number.isFinite(args.trackOffset)
    ? Math.max(8, Number(args.trackOffset))
    : 24
  const trackX = args.trackSide === 'left'
    ? Math.min(sx, tx) - offset
    : Math.max(sx, tx) + offset
  const verticalSign = ty >= sy ? 1 : -1
  const radius = Math.min(
    14,
    Math.max(2, Math.min(Math.abs(trackX - sx) * 0.5, Math.abs(ty - sy) * 0.25)),
  )
  return [
    `M${sx},${sy}`,
    `L${trackX - direction * radius},${sy}`,
    `Q${trackX},${sy} ${trackX},${sy + verticalSign * radius}`,
    `L${trackX},${ty - verticalSign * radius}`,
    `Q${trackX},${ty} ${trackX - direction * radius},${ty}`,
    `L${tx},${ty}`,
  ].join(' ')
}

export function readStoryboardOutputCardLeftSideAnchors(args: {
  outputCardRect: StoryboardOverlayRectLike
  sourceCardRect: StoryboardOverlayRectLike
}): { source: StoryboardOverlayRectAnchor; target: StoryboardOverlayRectAnchor } | null {
  if (!isFiniteOverlayRect(args.sourceCardRect) || !isFiniteOverlayRect(args.outputCardRect)) return null
  const sourceSide = readNearestStoryboardOverlayAnchorSide({
    fallbackSide: 'right',
    fromRect: args.sourceCardRect,
    toRect: args.outputCardRect,
  })
  const source = readStoryboardOverlayRectSideAnchor(args.sourceCardRect, sourceSide)
  const target = readStoryboardOverlayRectSideAnchor(args.outputCardRect, 'left')
  return source && target ? { source, target } : null
}

export function readStoryboardOverlayFallbackRectAnchor(args: {
  dir: 'in' | 'out'
  fallbackPct: number
  rect: StoryboardOverlayRectLike
}): StoryboardOverlayRectAnchor | null {
  if (!isFiniteOverlayRect(args.rect)) return null
  const pct = Math.max(0, Math.min(100, Number.isFinite(args.fallbackPct) ? args.fallbackPct : 50)) / 100
  const side = args.dir === 'out' ? 'right' : 'left'
  return {
    side,
    x: args.dir === 'out' ? args.rect.right : args.rect.left,
    y: args.rect.top + pct * args.rect.height,
  }
}

export function buildStoryboardOutputCardLeftSidePath(args: {
  source: Pick<StoryboardOverlayRectAnchor, 'x' | 'y'>
  target: Pick<StoryboardOverlayRectAnchor, 'x' | 'y'>
}): string {
  const sx = Number.isFinite(args.source.x) ? args.source.x : 0
  const sy = Number.isFinite(args.source.y) ? args.source.y : 0
  const tx = Number.isFinite(args.target.x) ? args.target.x : sx
  const ty = Number.isFinite(args.target.y) ? args.target.y : sy
  const dx = tx - sx
  const dy = ty - sy
  if (Math.abs(dx) < 0.01 || Math.abs(dy) < 0.01) return `M${sx},${sy} L${tx},${ty}`
  const horizontalSign = dx >= 0 ? 1 : -1
  const verticalSign = dy >= 0 ? 1 : -1
  const cornerRadius = Math.min(24, Math.max(2, Math.min(Math.abs(dx) * 0.45, Math.abs(dy) * 0.5)))
  const cornerStartX = tx - horizontalSign * cornerRadius
  const cornerEndY = sy + verticalSign * cornerRadius
  return `M${sx},${sy} L${cornerStartX},${sy} Q${tx},${sy} ${tx},${cornerEndY} L${tx},${ty}`
}

export function buildStoryboardOverlayEdgePathD(args: {
  curve?: EdgePathCurveOptions | null
  edgeType: GlobalEdgeType
  flowForwardTrack?: boolean
  outputCardLeftSide: boolean
  rankdir?: 'TB' | 'LR' | null
  sx: number
  sy: number
  tx: number
  ty: number
}): string {
  if (args.outputCardLeftSide) return buildStoryboardOutputCardLeftSidePath({ source: { x: args.sx, y: args.sy }, target: { x: args.tx, y: args.ty } })
  return buildForwardFlowEdgePathD(args)
}
