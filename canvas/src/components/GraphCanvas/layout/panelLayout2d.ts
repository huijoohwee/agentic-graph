import type { GraphNode } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { createBboxCollideForce, type NodeHalfExtents } from './overlap'
import { readCollisionConfig } from './collisionConfig'

type PanelBounds = Record<string, NodeHalfExtents> | null | undefined

// The regular and disjoint layouts share one bbox owner. Disjoint layouts need
// collision only for actual overlay surfaces, not every label or community.
export function createLayoutBboxForce2d(args: {
  schema: GraphSchema; halfExtents: PanelBounds; panelOnly: boolean; strength: number; iterations: number
}) {
  const cfg = readCollisionConfig(args.schema).nodeBbox
  if (!cfg.enabled || (args.panelOnly && !Object.keys(args.halfExtents || {}).length)) return null
  const force = createBboxCollideForce({ ...cfg, schema: args.schema,
    halfExtentsByNodeId: args.halfExtents, strength: args.strength, iterations: args.iterations })
  if (args.panelOnly || Object.keys(args.halfExtents || {}).length) {
    // Cooling should stop graph attraction without weakening surface separation.
    // This runs only on the existing simulation clock and stops with it.
    const panelForce: typeof force = alpha => force(Math.max(0.3, alpha))
    panelForce.initialize = (nodes, random) => force.initialize!(args.panelOnly ? nodes.filter(node => !!args.halfExtents?.[node.id]) : nodes, random)
    return panelForce
  }
  return force
}

export const panelBoundsKey2d = (bounds: PanelBounds): string => Object.keys(bounds || {}).sort()
  .map(id => `${id}:${bounds![id]!.halfW},${bounds![id]!.halfH}`).join('|')

// A spatial occupancy grid gives deterministic first-paint separation without
// running or warming the full graph simulation. Keep valid separated positions and fixed anchors intact.
export function seedOverlayPanelPositions2d(args: {
  nodes: GraphNode[]; halfExtents: PanelBounds
}): { moved: number; probes: number } {
  const panels = args.nodes.filter(n => args.halfExtents?.[n.id] && Number.isFinite(n.x) && Number.isFinite(n.y))
    .sort((a, b) => a.id.localeCompare(b.id))
  const stats = { moved: 0, probes: 0 }
  if (panels.length < 2) return stats
  const gap = 16
  const width = Math.max(...panels.map(n => args.halfExtents![n.id]!.halfW * 2)) + gap
  const height = Math.max(...panels.map(n => args.halfExtents![n.id]!.halfH * 2)) + gap
  const cells = new Map<string, GraphNode[]>()
  const locked = (n: GraphNode) => Number.isFinite(n.fx) || Number.isFinite(n.fy)
  const keys = (n: GraphNode, x: number, y: number): string[] => {
    const { halfW, halfH } = args.halfExtents![n.id]!
    const out: string[] = []
    for (let i = Math.floor((x - halfW - gap / 2) / width); i <= Math.floor((x + halfW + gap / 2) / width); i++) {
      for (let j = Math.floor((y - halfH - gap / 2) / height); j <= Math.floor((y + halfH + gap / 2) / height); j++) out.push(`${i},${j}`)
    }
    return out
  }
  const insert = (n: GraphNode) => {
    for (const key of keys(n, n.x!, n.y!)) {
      const bucket = cells.get(key)
      if (bucket) bucket.push(n)
      else cells.set(key, [n])
    }
  }
  const clear = (n: GraphNode, x: number, y: number): boolean => {
    stats.probes++
    const a = args.halfExtents![n.id]!
    for (const key of keys(n, x, y)) for (const other of cells.get(key) || []) {
      const b = args.halfExtents![other.id]!
      if (Math.abs(x - other.x!) < a.halfW + b.halfW + gap && Math.abs(y - other.y!) < a.halfH + b.halfH + gap) return false
    }
    return true
  }
  for (const n of panels) if (locked(n)) insert(n)
  for (const n of panels) {
    if (locked(n)) continue
    const x = n.x!, y = n.y!
    if (!clear(n, x, y)) {
      // At most O(panel count) candidate cells; no per-frame packing or retries.
      const limit = Math.ceil(Math.sqrt(cells.size + 1)) + 1
      let placed = false
      for (let ring = 1; ring <= limit && !placed; ring++) {
        for (let step = 0; step < ring * 8; step++) {
          const side = Math.floor(step / (ring * 2)), along = step % (ring * 2) - ring
          const dx = side === 0 ? along : side === 1 ? ring : side === 2 ? -along : -ring
          const dy = side === 0 ? -ring : side === 1 ? along : side === 2 ? ring : -along
          const nextX = (Math.floor(x / width) + dx + 0.5) * width
          const nextY = (Math.floor(y / height) + dy + 0.5) * height
          if (!clear(n, nextX, nextY)) continue
          n.x = nextX; n.y = nextY; n.vx = 0; n.vy = 0
          stats.moved++; placed = true
          break
        }
      }
    }
    insert(n)
  }
  return stats
}
