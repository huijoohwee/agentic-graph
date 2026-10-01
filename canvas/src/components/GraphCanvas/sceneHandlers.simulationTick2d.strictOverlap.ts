import type { GraphNode } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import { createBboxCollideForce, type NodeHalfExtents } from '@/components/GraphCanvas/layout/overlap'
import { createGroupBboxCollideForceByDepth } from '@/components/GraphCanvas/layout/groupOverlapByDepth'
import { readCollisionConfig } from '@/components/GraphCanvas/layout/collisionConfig'
import { integrateNodePositionWithVelocity, runRelaxSteps } from '@/lib/graph/collision/relaxRunner'
import {
  computeBboxCollideIterations2d,
  computeGroupBboxCollideIterations2d,
  computeStrictOverlapTuning2d,
  type Physics2dTuning,
} from '@/lib/graph/physics2dTuning'

export type StrictOverlapForcesCache2d =
  | null
  | {
      schema: GraphSchema
      halfExtents: Record<string, NodeHalfExtents> | null | undefined
      forces: Array<(alpha: number) => void>
    }

export type StrictOverlapState2d = {
  lastStrictOverlapTick: number
  cache: StrictOverlapForcesCache2d
}

const seedRand = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v))

export function applyStrictOverlapRelax2d(args: {
  state: StrictOverlapState2d
  nodes: GraphNode[]
  tick: number
  alpha: number
  schema: GraphSchema
  idealSpacing: number
  tuning: Physics2dTuning
  groupsForBboxCollide: GraphGroup[]
  halfExtentsByNodeId?: Record<string, NodeHalfExtents> | null
}): void {
  const { state, nodes, tick, alpha, schema, idealSpacing, tuning, groupsForBboxCollide } = args
  const collision = readCollisionConfig(schema)
  const maxPad = Math.max(collision.nodeBbox.paddingX, collision.nodeBbox.paddingY, collision.groupBbox.paddingX, collision.groupBbox.paddingY)
  const strictTuning = computeStrictOverlapTuning2d({
    nodeCount: nodes.length,
    tick,
    lastStrictOverlapTick: state.lastStrictOverlapTick,
    alpha,
    maxPaddingPx: maxPad,
    idealSpacing,
    tuning,
  })

  if (!(strictTuning.steps > 0)) return

  const wantsNode = collision.nodeBbox.enabled
  const wantsGroup = collision.groupBbox.enabled && groupsForBboxCollide.length > 0 && nodes.length <= 3000
  if (!wantsNode && !wantsGroup) return

  if (!state.cache || state.cache.schema !== schema || state.cache.halfExtents !== args.halfExtentsByNodeId) {
    const forces: Array<(alpha: number) => void> = []
    let seed = 2166136261
    for (let i = 0; i < nodes.length; i += 1) {
      const id = String(nodes[i]?.id || '')
      for (let j = 0; j < id.length; j += 1) {
        seed ^= id.charCodeAt(j)
        seed = Math.imul(seed, 16777619)
      }
    }
    const rand = seedRand(seed >>> 0)
    const nodeForce = wantsNode
      ? (createBboxCollideForce({
          schema,
          halfExtentsByNodeId: args.halfExtentsByNodeId,
          paddingX: collision.nodeBbox.paddingX,
          paddingY: collision.nodeBbox.paddingY,
          paddingZ: collision.nodeBbox.paddingZ,
          touchEpsilonPx: collision.nodeBbox.touchEpsilonPx,
          touchEpsilonXPx: collision.nodeBbox.touchEpsilonXPx,
          touchEpsilonYPx: collision.nodeBbox.touchEpsilonYPx,
          touchEpsilonZPx: collision.nodeBbox.touchEpsilonZPx,
          strength: Math.max(0, collision.nodeBbox.strength) * strictTuning.nodeBboxStrengthScale,
          iterations: computeBboxCollideIterations2d({ baseIterations: collision.nodeBbox.iterations, nodeCount: nodes.length }),
        }) as unknown as { initialize: (ns: GraphNode[], rand?: () => number) => void; (alpha: number): void })
      : null
    if (nodeForce) {
      nodeForce.initialize(nodes, rand)
      forces.push(nodeForce as unknown as (alpha: number) => void)
    }

    const groupForce = wantsGroup
      ? (createGroupBboxCollideForceByDepth({
          schema,
          groups: groupsForBboxCollide,
          paddingX: collision.groupBbox.paddingX,
          paddingY: collision.groupBbox.paddingY,
          paddingZ: collision.groupBbox.paddingZ,
          extraGapPx: collision.groupBbox.extraGapPx,
          extraGapZPx: collision.groupBbox.extraGapZPx,
          touchEpsilonPx: collision.groupBbox.touchEpsilonPx,
          touchEpsilonXPx: collision.groupBbox.touchEpsilonXPx,
          touchEpsilonYPx: collision.groupBbox.touchEpsilonYPx,
          touchEpsilonZPx: collision.groupBbox.touchEpsilonZPx,
          nestedTouchEpsilonPx: collision.groupBbox.nestedTouchEpsilonPx,
          nestedTouchEpsilonXPx: collision.groupBbox.nestedTouchEpsilonXPx,
          nestedTouchEpsilonYPx: collision.groupBbox.nestedTouchEpsilonYPx,
          nestedTouchEpsilonZPx: collision.groupBbox.nestedTouchEpsilonZPx,
          strength: Math.max(0, collision.groupBbox.strength) * strictTuning.groupBboxStrengthScale,
          iterations: computeGroupBboxCollideIterations2d({ baseIterations: collision.groupBbox.iterations, nodeCount: nodes.length }),
          halfExtentsByNodeId: args.halfExtentsByNodeId,
        }) as unknown as { initialize: (ns: GraphNode[], rand?: () => number) => void; (alpha: number): void })
      : null
    if (groupForce) {
      groupForce.initialize(nodes, rand)
      forces.push(groupForce as unknown as (alpha: number) => void)
    }
    state.cache = { schema, forces, halfExtents: args.halfExtentsByNodeId }
  }

  const forces = state.cache?.forces || []
  if (forces.length === 0) return

  const baseByNode = new WeakMap<GraphNode, { x: number; y: number }>()
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i]
    const x = typeof n.x === 'number' && Number.isFinite(n.x) ? n.x : null
    const y = typeof n.y === 'number' && Number.isFinite(n.y) ? n.y : null
    if (x == null || y == null) continue
    baseByNode.set(n, { x, y })
  }
  const isPinned = (n: GraphNode): boolean =>
    (typeof (n as { fx?: unknown }).fx === 'number' && Number.isFinite((n as { fx: number }).fx)) ||
    (typeof (n as { fy?: unknown }).fy === 'number' && Number.isFinite((n as { fy: number }).fy))

  const pullToBase = (a: number) => {
    const strength = strictTuning.pullToBaseStrength * a
    if (strength <= 0) return
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]
      if (!n || isPinned(n)) continue
      const base = baseByNode.get(n)
      if (!base) continue
      n.vx = (n.vx || 0) + (base.x - (n.x as number)) * strength
      n.vy = (n.vy || 0) + (base.y - (n.y as number)) * strength
    }
  }

  runRelaxSteps({
    nodes,
    steps: strictTuning.steps,
    forces: [...forces, pullToBase],
    maxOps: 80_000,
    alphaForStep: strictTuning.forceAlphaForStep,
    integrate: n => {
      const fx = (n as unknown as { fx?: unknown }).fx
      const fy = (n as unknown as { fy?: unknown }).fy
      if (typeof fx === 'number' && Number.isFinite(fx)) {
        n.x = fx
        n.vx = 0
      }
      if (typeof fy === 'number' && Number.isFinite(fy)) {
        n.y = fy
        n.vy = 0
      }
      integrateNodePositionWithVelocity(n, { damping: strictTuning.integrateDamping, z: { mode: 'never' } })
      const base = baseByNode.get(n)
      if (!base) return
      const x = typeof n.x === 'number' && Number.isFinite(n.x) ? (n.x as number) : base.x
      const y = typeof n.y === 'number' && Number.isFinite(n.y) ? (n.y as number) : base.y
      const dx = clamp(x - base.x, -strictTuning.maxShiftPx, strictTuning.maxShiftPx)
      const dy = clamp(y - base.y, -strictTuning.maxShiftPx, strictTuning.maxShiftPx)
      n.x = base.x + dx
      n.y = base.y + dy
    },
  })
  state.lastStrictOverlapTick = tick
}
