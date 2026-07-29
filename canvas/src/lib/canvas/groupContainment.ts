export type RectBounds = { x: number; y: number; width: number; height: number }
export type DeltaClamp = { minDx: number; maxDx: number; minDy: number; maxDy: number }

export const clampNumber = (v: number, min: number, max: number): number => {
  if (!Number.isFinite(v)) return min
  if (!Number.isFinite(min) || !Number.isFinite(max)) return v
  if (max < min) return (min + max) / 2
  return Math.max(min, Math.min(max, v))
}

export const clampNodeCenterToRect = (args: {
  cx: number
  cy: number
  halfW: number
  halfH: number
  rect: RectBounds
}): { cx: number; cy: number } => {
  const halfW = Number.isFinite(args.halfW) ? Math.max(0, args.halfW) : 0
  const halfH = Number.isFinite(args.halfH) ? Math.max(0, args.halfH) : 0
  const minCx = args.rect.x + halfW
  const maxCx = args.rect.x + args.rect.width - halfW
  const minCy = args.rect.y + halfH
  const maxCy = args.rect.y + args.rect.height - halfH
  return { cx: clampNumber(args.cx, minCx, maxCx), cy: clampNumber(args.cy, minCy, maxCy) }
}

export const clampNodeTopLeftToRect = (args: {
  x: number
  y: number
  w: number
  h: number
  rect: RectBounds
}): { x: number; y: number } => {
  const w = Number.isFinite(args.w) ? Math.max(0, args.w) : 0
  const h = Number.isFinite(args.h) ? Math.max(0, args.h) : 0
  const minX = args.rect.x
  const maxX = args.rect.x + args.rect.width - w
  const minY = args.rect.y
  const maxY = args.rect.y + args.rect.height - h
  return { x: clampNumber(args.x, minX, maxX), y: clampNumber(args.y, minY, maxY) }
}

export const intersectRange = (a: { min: number; max: number }, b: { min: number; max: number }) => {
  return { min: Math.max(a.min, b.min), max: Math.min(a.max, b.max) }
}

export const computeDeltaClampForTopLeftNodes = (args: {
  nodeIds: string[]
  startPosById: Map<string, { x: number; y: number }>
  sizeById: Map<string, { w: number; h: number }>
  rectByNodeId: Map<string, RectBounds>
}): DeltaClamp | null => {
  let dxRange: { min: number; max: number } | null = null
  let dyRange: { min: number; max: number } | null = null
  for (let i = 0; i < args.nodeIds.length; i += 1) {
    const id = String(args.nodeIds[i] || '').trim()
    if (!id) continue
    const rect = args.rectByNodeId.get(id) || null
    const start = args.startPosById.get(id) || null
    const size = args.sizeById.get(id) || null
    if (!rect || !start || !size) continue
    const w = typeof size.w === 'number' && Number.isFinite(size.w) ? Math.max(0, size.w) : 0
    const h = typeof size.h === 'number' && Number.isFinite(size.h) ? Math.max(0, size.h) : 0
    const rdx = { min: rect.x - start.x, max: rect.x + rect.width - w - start.x }
    const rdy = { min: rect.y - start.y, max: rect.y + rect.height - h - start.y }
    dxRange = dxRange ? intersectRange(dxRange, rdx) : rdx
    dyRange = dyRange ? intersectRange(dyRange, rdy) : rdy
  }
  if (!dxRange || !dyRange) return null
  return { minDx: dxRange.min, maxDx: dxRange.max, minDy: dyRange.min, maxDy: dyRange.max }
}

export const computeDeltaClampForRectWithinRect = (args: {
  subject: RectBounds
  container: RectBounds
  inset?: number
}): DeltaClamp | null => {
  const values = [
    args.subject.x,
    args.subject.y,
    args.subject.width,
    args.subject.height,
    args.container.x,
    args.container.y,
    args.container.width,
    args.container.height,
  ]
  if (values.some(value => !Number.isFinite(value))) return null
  if (args.subject.width <= 0 || args.subject.height <= 0 || args.container.width <= 0 || args.container.height <= 0) return null
  const inset = Number.isFinite(args.inset) ? Math.max(0, args.inset || 0) : 0
  const minDx = args.container.x + inset - args.subject.x
  const maxDx = args.container.x + args.container.width - inset - (args.subject.x + args.subject.width)
  const minDy = args.container.y + inset - args.subject.y
  const maxDy = args.container.y + args.container.height - inset - (args.subject.y + args.subject.height)
  return { minDx, maxDx, minDy, maxDy }
}

export const clampDelta = (args: { clamp: DeltaClamp; dx: number; dy: number }) => {
  return { dx: clampNumber(args.dx, args.clamp.minDx, args.clamp.maxDx), dy: clampNumber(args.dy, args.clamp.minDy, args.clamp.maxDy) }
}
