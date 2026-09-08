
import { PackedRTree } from './PackedRTree.js'
import { applyAabbOverlapPush } from './aabbPush.js'
import { applyAabbContainmentPush } from './aabbContain.js'
export { PackedRTree, applyAabbOverlapPush, applyAabbContainmentPush }
import type { BoxItem, MovableNode } from './types.js'

export interface BoxIndices {
  x1: number
  x2: number
  x3: number
  x4: number
  x5: number

  y1: number
  y2: number
  y3: number
  y4: number
  y5: number
  
  z1: number
  z2: number
  z3: number
  z4: number
  z5: number
}

export interface CollisionGroupItem extends BoxItem {
  movableIdxs: number[]
  hasZ?: boolean
  gap: number
  gapX?: number
  gapY?: number
  gapZ?: number
}

interface ExpandedBoxItem extends BoxItem {
  original: CollisionGroupItem
}

const hash01 = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

export function tieBreakOverlaps2d(args: {
  ox: number
  oy: number
  aId: string | number
  bId: string | number
  tieEpsilon?: number
  bias?: number
}): { ox: number; oy: number } {
  const tieEpsilon =
    typeof args.tieEpsilon === 'number' && Number.isFinite(args.tieEpsilon) ? Math.max(0, args.tieEpsilon) : 0.5
  const bias = typeof args.bias === 'number' && Number.isFinite(args.bias) ? Math.max(0, args.bias) : 1e-4
  if (bias <= 0) return { ox: args.ox, oy: args.oy }
  if (Math.abs(args.ox - args.oy) > tieEpsilon) return { ox: args.ox, oy: args.oy }

  const a = String(args.aId)
  const b = String(args.bId)
  const pairKey = a <= b ? `${a}|${b}` : `${b}|${a}`
  const u = hash01(pairKey)
  if (u < 0.5) return { ox: args.ox + bias, oy: args.oy }
  return { ox: args.ox, oy: args.oy + bias }
}

export function computeBoxIndices(
  cx: number, cy: number, cz: number,
  halfW: number, halfH: number, halfD: number,
  gap: number,
  gapX?: number,
  gapY?: number,
  gapZ?: number
): BoxIndices {
  const gX = typeof gapX === 'number' && Number.isFinite(gapX) ? Math.max(0, gapX) : Math.max(0, gap)
  const gY = typeof gapY === 'number' && Number.isFinite(gapY) ? Math.max(0, gapY) : Math.max(0, gap)
  const gZ = typeof gapZ === 'number' && Number.isFinite(gapZ) ? Math.max(0, gapZ) : Math.max(0, gap)
  return {
    x1: cx - halfW - gX,
    x2: cx - halfW,
    x3: cx,
    x4: cx + halfW,
    x5: cx + halfW + gX,

    y1: cy - halfH - gY,
    y2: cy - halfH,
    y3: cy,
    y4: cy + halfH,
    y5: cy + halfH + gY,
    
    z1: cz - halfD - gZ,
    z2: cz - halfD,
    z3: cz,
    z4: cz + halfD,
    z5: cz + halfD + gZ,
  }
}

export function resolveGroupCollisions(args: {
  groups: CollisionGroupItem[]
  nodes: MovableNode[]
  strength: number
  touchEpsilon: number
  touchEpsilonX?: number
  touchEpsilonY?: number
  touchEpsilonZ?: number
  skipSameGroup?: boolean
  groupsShareAnyMember?: (a: CollisionGroupItem, b: CollisionGroupItem) => boolean
}) {
  const { groups, nodes, strength, touchEpsilon, groupsShareAnyMember } = args
  if (groups.length < 2) return

  const touchEpsilonX = typeof args.touchEpsilonX === 'number' && Number.isFinite(args.touchEpsilonX) ? args.touchEpsilonX : touchEpsilon
  const touchEpsilonY = typeof args.touchEpsilonY === 'number' && Number.isFinite(args.touchEpsilonY) ? args.touchEpsilonY : touchEpsilon
  const touchEpsilonZ = typeof args.touchEpsilonZ === 'number' && Number.isFinite(args.touchEpsilonZ) ? args.touchEpsilonZ : touchEpsilon

  const axisGap = (g: CollisionGroupItem, axis: 'x' | 'y' | 'z'): number => {
    const raw =
      axis === 'x'
        ? g.gapX
        : axis === 'y'
          ? g.gapY
          : g.gapZ
    if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, raw)
    return Math.max(0, g.gap)
  }

  const explicitGapZ = (g: CollisionGroupItem): number | null => {
    const raw = g.gapZ
    if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(0, raw)
    return null
  }

  const explicitZ = (g: CollisionGroupItem): boolean => {
    if (g.hasZ === true) return true
    if (typeof g.cz === 'number' && Number.isFinite(g.cz)) return true
    if (typeof g.halfD === 'number' && Number.isFinite(g.halfD)) return true
    const gapZExplicit = explicitGapZ(g)
    return gapZExplicit != null
  }

  const shouldUseZAxis = (a: CollisionGroupItem, b: CollisionGroupItem): boolean => explicitZ(a) && explicitZ(b)

  const indexByItem = new Map<CollisionGroupItem, number>()
  for (let i = 0; i < groups.length; i += 1) indexByItem.set(groups[i]!, i)

  const expandedItems: ExpandedBoxItem[] = groups.map(g => {
    const gapX = axisGap(g, 'x')
    const gapY = axisGap(g, 'y')
    const gapZ = axisGap(g, 'z')
    
    return {
      cx: g.cx,
      cy: g.cy,
      cz: g.cz ?? 0,
      halfW: g.halfW + gapX,
      halfH: g.halfH + gapY,
      halfD: (g.halfD ?? 0) + gapZ,
      id: g.id,
      original: g
    }
  })

  // Use our new PackedRTree (3D aware)
  const spatialIndex = new PackedRTree(expandedItems)

  const broadphaseUsesZ = groups.every(explicitZ)

  for (let i = 0; i < groups.length; i++) {
    const a = groups[i]
    const aIdx = i
    
    const aGapX = axisGap(a, 'x')
    const aGapY = axisGap(a, 'y')
    const aGapZ = axisGap(a, 'z')

    const aMinX = a.cx - a.halfW - aGapX
    const aMaxX = a.cx + a.halfW + aGapX
    const aMinY = a.cy - a.halfH - aGapY
    const aMaxY = a.cy + a.halfH + aGapY
    const aMinZ = broadphaseUsesZ ? (a.cz ?? 0) - (a.halfD ?? 0) - aGapZ : -Infinity
    const aMaxZ = broadphaseUsesZ ? (a.cz ?? 0) + (a.halfD ?? 0) + aGapZ : Infinity

    // Query the same clearance envelope used by the narrowphase. Raw box
    // overlap alone drops near-separated pairs before anti-stick clearance settles.
    const queryEpsilonX = Math.max(0, touchEpsilonX)
    const queryEpsilonY = Math.max(0, touchEpsilonY)
    const queryEpsilonZ = Math.max(0, touchEpsilonZ)
    spatialIndex.query(
      aMinX - queryEpsilonX, aMinY - queryEpsilonY, aMinZ - queryEpsilonZ,
      aMaxX + queryEpsilonX, aMaxY + queryEpsilonY, aMaxZ + queryEpsilonZ,
      (bWrapper) => {
      const b = bWrapper.original
      if (a === b) return
      const bIdx = indexByItem.get(b)
      if (bIdx == null || bIdx <= aIdx) return
      
      const aMovable = a.movableIdxs.length > 0
      const bMovable = b.movableIdxs.length > 0
      if (!aMovable && !bMovable) return

      if (groupsShareAnyMember && groupsShareAnyMember(a, b)) return

      const bGapX = axisGap(b, 'x')
      const bGapY = axisGap(b, 'y')
      const bGapZ = axisGap(b, 'z')
      
      const requiredGapX = aGapX + bGapX
      const requiredGapY = aGapY + bGapY
      const requiredGapZ = aGapZ + bGapZ
      
      const dx = a.cx - b.cx
      const dy = a.cy - b.cy
      const dz = (a.cz ?? 0) - (b.cz ?? 0)
      
      const ox = a.halfW + b.halfW + requiredGapX - Math.abs(dx)
      const oy = a.halfH + b.halfH + requiredGapY - Math.abs(dy)
      const oz = (a.halfD ?? 0) + (b.halfD ?? 0) + requiredGapZ - Math.abs(dz)
      
      const oxAdj = ox + touchEpsilonX
      const oyAdj = oy + touchEpsilonY
      const ozAdj = oz + touchEpsilonZ

      const useZ = shouldUseZAxis(a, b)
      
      if (oxAdj > 0 && oyAdj > 0 && (!useZ || ozAdj > 0)) {
        const { ox: oxFinal, oy: oyFinal } = tieBreakOverlaps2d({
          ox: oxAdj,
          oy: oyAdj,
          aId: String(a.id ?? aIdx),
          bId: String(b.id ?? bIdx),
        })
        applyAabbOverlapPush({
          nodes,
          aMovableIdxs: a.movableIdxs,
          bMovableIdxs: b.movableIdxs,
          dx,
          dy,
          dz,
          ox: oxFinal,
          oy: oyFinal,
          oz: useZ ? ozAdj : Infinity, // If not using Z, treat as infinite overlap (always collides on Z)
          k: strength,
        })
      }
    })
  }
}
