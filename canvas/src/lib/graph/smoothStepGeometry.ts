type Point = { x: number; y: number }

/** Shared SVG/Canvas corners, in travel order; never overshoot adjacent segments. */
export function computeSmoothStepGeometry(args: {
  sx: number; sy: number; tx: number; ty: number
  axis: 'x' | 'y'
  bendAbs: number
  orbital: boolean
}): { entry: Point; first: Point; exitFirst: Point; entryLast: Point; last: Point; exit: Point } | null {
  const { sx, sy, tx, ty, axis, bendAbs, orbital } = args
  const dx = tx - sx
  const dy = ty - sy
  const limit = Math.min(Math.abs(dx), Math.abs(dy)) / 2
  if (limit === 0) return null
  const softness = bendAbs > 0 ? Math.max(0.4, (0.7 + bendAbs) * (orbital ? 0.88 : 1)) : 1
  const r = Math.min(limit, Math.min(24, limit) * softness)
  const rx = Math.sign(dx) * r
  const ry = Math.sign(dy) * r
  const mx = (sx + tx) / 2
  const my = (sy + ty) / 2
  return axis === 'x' ? {
    entry: { x: mx - rx, y: sy }, first: { x: mx, y: sy },
    exitFirst: { x: mx, y: sy + ry }, entryLast: { x: mx, y: ty - ry },
    last: { x: mx, y: ty }, exit: { x: mx + rx, y: ty },
  } : {
    entry: { x: sx, y: my - ry }, first: { x: sx, y: my },
    exitFirst: { x: sx + rx, y: my }, entryLast: { x: tx - rx, y: my },
    last: { x: tx, y: my }, exit: { x: tx, y: my + ry },
  }
}
