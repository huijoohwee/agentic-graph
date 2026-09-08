import { resolveGroupCollisions } from '@/lib/graph/collision/boxCollision'

type Pos2 = { x: number; y: number }
type Pos3 = { x: number; y: number; z: number }

const overlapX = (args: {
  ax: number
  bx: number
  aHalfW: number
  bHalfW: number
  aOuterGapX: number
}): number => {
  const dx = args.ax - args.bx
  return args.aHalfW + args.bHalfW + args.aOuterGapX - Math.abs(dx)
}

export function testGroupBoxInnerDoesNotStickToOtherOuterBorder() {
  const touchEpsilon = 2
  const strength = 0.85

  const aHalfW = 60
  const aHalfH = 240
  const aOuterGapX = 18

  const bHalfW = 52
  const bHalfH = 320

  const pos: [Pos2, Pos2] = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ]
  const nodes: Array<{ vx?: number; vy?: number; vz?: number }> = [{ vx: 0, vy: 0 }, { vx: 0, vy: 0 }]

  const ox0 = overlapX({
    ax: pos[0].x,
    bx: pos[1].x,
    aHalfW,
    bHalfW,
    aOuterGapX,
  })
  if (!(ox0 > 0)) throw new Error('expected initial outer-vs-inner overlap')

  for (let step = 0; step < 14; step += 1) {
    resolveGroupCollisions({
      groups: [
        {
          id: 'group-box-1-0',
          cx: pos[0].x,
          cy: pos[0].y,
          halfW: aHalfW,
          halfH: aHalfH,
          movableIdxs: [0],
          gap: aOuterGapX,
          gapX: aOuterGapX,
          gapY: aOuterGapX,
        },
        {
          id: 'group-box-2-1',
          cx: pos[1].x,
          cy: pos[1].y,
          halfW: bHalfW,
          halfH: bHalfH,
          movableIdxs: [1],
          gap: 0,
          gapX: 0,
          gapY: 0,
        },
      ],
      nodes,
      strength,
      touchEpsilon,
    })

    for (let i = 0; i < 2; i += 1) {
      const n = nodes[i]!
      const vx = typeof n.vx === 'number' && Number.isFinite(n.vx) ? n.vx : 0
      const vy = typeof n.vy === 'number' && Number.isFinite(n.vy) ? n.vy : 0
      pos[i]!.x += vx
      pos[i]!.y += vy
      n.vx = vx * 0.25
      n.vy = vy * 0.25
    }
  }

  const ox1 = overlapX({
    ax: pos[0].x,
    bx: pos[1].x,
    aHalfW,
    bHalfW,
    aOuterGapX,
  })
  if (!(ox1 <= -touchEpsilon + 0.25)) {
    throw new Error(`expected no-touch (anti-stick) separation, got ox=${ox1} (touchEpsilon=${touchEpsilon})`)
  }
}

export function testDeepNestingNoStick() {
  const touchEpsilon = 2
  const strength = 0.85

  // 3 levels of boxes
  // Level 1 (Outer): group-box-1-0
  const l1HalfW = 100, l1HalfH = 100, l1Gap = 20
  // Level 2 (Middle): group-box-2-1
  const l2HalfW = 60, l2HalfH = 60, l2Gap = 10
  // Level 3 (Inner): group-box-2-1-1
  const l3HalfW = 30, l3HalfH = 30, l3Gap = 5

  const pos: Pos2[] = [
    { x: 0, y: 0 }, // Node 0 (for L1)
    { x: 0, y: 0 }, // Node 1 (for L2)
    { x: 0, y: 0 }, // Node 2 (for L3)
  ]
  const nodes: Array<{ vx?: number; vy?: number; vz?: number }> = [
    { vx: 0, vy: 0 }, 
    { vx: 0, vy: 0 },
    { vx: 0, vy: 0 }
  ]

  // Run simulation
  for (let step = 0; step < 20; step += 1) {
    resolveGroupCollisions({
      groups: [
        {
          id: 'group-box-1-0',
          cx: pos[0].x, cy: pos[0].y,
          halfW: l1HalfW, halfH: l1HalfH,
          movableIdxs: [0],
          gap: l1Gap, gapX: l1Gap, gapY: l1Gap
        },
        {
          id: 'group-box-2-1',
          cx: pos[1].x, cy: pos[1].y,
          halfW: l2HalfW, halfH: l2HalfH,
          movableIdxs: [1],
          gap: l2Gap, gapX: l2Gap, gapY: l2Gap
        },
        {
          id: 'group-box-2-1-1',
          cx: pos[2].x, cy: pos[2].y,
          halfW: l3HalfW, halfH: l3HalfH,
          movableIdxs: [2],
          gap: l3Gap, gapX: l3Gap, gapY: l3Gap
        }
      ],
      nodes,
      strength,
      touchEpsilon,
    })

    for (let i = 0; i < 3; i += 1) {
      const n = nodes[i]!
      const vx = typeof n.vx === 'number' && Number.isFinite(n.vx) ? n.vx : 0
      const vy = typeof n.vy === 'number' && Number.isFinite(n.vy) ? n.vy : 0
      pos[i]!.x += vx
      pos[i]!.y += vy
      n.vx = vx * 0.25
      n.vy = vy * 0.25
    }
  }

  // Check 1 vs 2 (L1 vs L2)
  const ox12 = overlapX({
    ax: pos[0].x, bx: pos[1].x,
    aHalfW: l1HalfW, bHalfW: l2HalfW,
    aOuterGapX: l1Gap + l2Gap // sum of gaps
  })
  if (!(ox12 <= -touchEpsilon + 0.5)) {
     throw new Error(`L1-L2 stick detected: ox=${ox12}`)
  }

  // Check 2 vs 3 (L2 vs L3)
  const ox23 = overlapX({
    ax: pos[1].x, bx: pos[2].x,
    aHalfW: l2HalfW, bHalfW: l3HalfW,
    aOuterGapX: l2Gap + l3Gap // sum of gaps
  })
  if (!(ox23 <= -touchEpsilon + 0.5)) {
     throw new Error(`L2-L3 stick detected: ox=${ox23}`)
  }
}

export function testNoStickUsesZAxisWhenProvided() {
  const touchEpsilon = 2
  const strength = 0.9

  const aHalfW = 200
  const aHalfH = 200
  const aHalfD = 1
  const aGapZ = 20

  const bHalfW = 200
  const bHalfH = 200
  const bHalfD = 1
  const bGapZ = 0

  const pos: [Pos3, Pos3] = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
  ]
  const nodes: Array<{ vx?: number; vy?: number; vz?: number }> = [{ vx: 0, vy: 0, vz: 0 }, { vx: 0, vy: 0, vz: 0 }]

  for (let step = 0; step < 18; step += 1) {
    resolveGroupCollisions({
      groups: [
        {
          id: 'z-a',
          cx: pos[0].x,
          cy: pos[0].y,
          cz: pos[0].z,
          halfW: aHalfW,
          halfH: aHalfH,
          halfD: aHalfD,
          movableIdxs: [0],
          gap: 0,
          gapZ: aGapZ,
        },
        {
          id: 'z-b',
          cx: pos[1].x,
          cy: pos[1].y,
          cz: pos[1].z,
          halfW: bHalfW,
          halfH: bHalfH,
          halfD: bHalfD,
          movableIdxs: [1],
          gap: 0,
          gapZ: bGapZ,
        },
      ],
      nodes,
      strength,
      touchEpsilon,
    })

    for (let i = 0; i < 2; i += 1) {
      const n = nodes[i]!
      const vx = typeof n.vx === 'number' && Number.isFinite(n.vx) ? n.vx : 0
      const vy = typeof n.vy === 'number' && Number.isFinite(n.vy) ? n.vy : 0
      const vz = typeof n.vz === 'number' && Number.isFinite(n.vz) ? n.vz : 0
      pos[i]!.x += vx
      pos[i]!.y += vy
      pos[i]!.z += vz
      n.vx = vx * 0.25
      n.vy = vy * 0.25
      n.vz = vz * 0.25
    }
  }

  const dz = pos[0].z - pos[1].z
  const requiredGapZ = aGapZ + bGapZ
  const oz1 = aHalfD + bHalfD + requiredGapZ - Math.abs(dz)
  if (!(oz1 <= -touchEpsilon + 0.25)) {
    throw new Error(`expected Z separation, got oz=${oz1} (touchEpsilon=${touchEpsilon})`)
  }
}

export function testNoStickDoesNotAccidentallyPushInZFromXyGaps() {
  const touchEpsilon = 2
  const strength = 0.9

  const nodes: Array<{ vx?: number; vy?: number; vz?: number }> = [{ vx: 0, vy: 0, vz: 0 }, { vx: 0, vy: 0, vz: 0 }]

  resolveGroupCollisions({
    groups: [
      {
        id: 'a',
        cx: 0,
        cy: 0,
        halfW: 200,
        halfH: 200,
        movableIdxs: [0],
        gap: 20,
        gapX: 20,
        gapY: 20,
      },
      {
        id: 'b',
        cx: 0,
        cy: 0,
        halfW: 200,
        halfH: 200,
        movableIdxs: [1],
        gap: 0,
        gapX: 0,
        gapY: 0,
      },
    ],
    nodes,
    strength,
    touchEpsilon,
  })

  const vz0 = nodes[0]?.vz ?? 0
  const vz1 = nodes[1]?.vz ?? 0
  if (Math.abs(vz0) > 1e-9 || Math.abs(vz1) > 1e-9) {
    throw new Error(`unexpected Z push from XY-only collision (vz0=${vz0}, vz1=${vz1})`)
  }
}

export function testNoStickUsesZAxisWhenGapZProvidedEvenWithZeroDepth() {
  const touchEpsilon = 2
  const strength = 0.9

  const pos: [Pos3, Pos3] = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
  ]
  const nodes: Array<{ vx?: number; vy?: number; vz?: number }> = [{ vx: 0, vy: 0, vz: 0 }, { vx: 0, vy: 0, vz: 0 }]

  for (let step = 0; step < 18; step += 1) {
    resolveGroupCollisions({
      groups: [
        {
          id: 'z-gap-a',
          cx: pos[0].x,
          cy: pos[0].y,
          cz: pos[0].z,
          halfW: 200,
          halfH: 200,
          halfD: 0,
          movableIdxs: [0],
          gap: 0,
          gapZ: 20,
        },
        {
          id: 'z-gap-b',
          cx: pos[1].x,
          cy: pos[1].y,
          cz: pos[1].z,
          halfW: 200,
          halfH: 200,
          halfD: 0,
          movableIdxs: [1],
          gap: 0,
          gapZ: 0,
        },
      ],
      nodes,
      strength,
      touchEpsilon,
    })

    for (let i = 0; i < 2; i += 1) {
      const n = nodes[i]!
      const vx = typeof n.vx === 'number' && Number.isFinite(n.vx) ? n.vx : 0
      const vy = typeof n.vy === 'number' && Number.isFinite(n.vy) ? n.vy : 0
      const vz = typeof n.vz === 'number' && Number.isFinite(n.vz) ? n.vz : 0
      pos[i]!.x += vx
      pos[i]!.y += vy
      pos[i]!.z += vz
      n.vx = vx * 0.25
      n.vy = vy * 0.25
      n.vz = vz * 0.25
    }
  }

  const dz = pos[0].z - pos[1].z
  const requiredGapZ = 20
  const oz1 = requiredGapZ - Math.abs(dz)
  if (!(oz1 <= -touchEpsilon + 0.25)) {
    throw new Error(`expected Z separation from gapZ, got oz=${oz1} (touchEpsilon=${touchEpsilon})`)
  }
}

function checkClearanceBroadphase(axis: 'x' | 'y' | 'z') {
  for (const extraClearance of [0.5, 4.5]) {
    const nodes = [{ vx: 0, vy: 0, vz: 0 }, { vx: 0, vy: 0, vz: 0 }]
    const offset = 20 + 3 + extraClearance
    const base = { halfW: 10, halfH: 10, halfD: 10, cx: 0, cy: 0, cz: 0, gap: 0 }
    resolveGroupCollisions({
      groups: [
        { ...base, id: 'a', movableIdxs: [0], gapX: 1, gapY: 1, gapZ: 1 },
        { ...base, id: 'b', movableIdxs: [1], gapX: 2, gapY: 2, gapZ: 2,
          cx: axis === 'x' ? offset : 0,
          cy: axis === 'y' ? offset : 0,
          cz: axis === 'z' ? offset : 0 },
      ],
      nodes,
      strength: 1,
      touchEpsilon: 0,
      touchEpsilonX: axis === 'x' ? 4 : 0,
      touchEpsilonY: axis === 'y' ? 4 : 0,
      touchEpsilonZ: axis === 'z' ? 4 : 0,
    })
    const key = axis === 'x' ? 'vx' : axis === 'y' ? 'vy' : 'vz'
    if (extraClearance < 4) {
      if (!(nodes[0][key] < 0 && nodes[1][key] > 0)) {
        throw new Error(`expected ${axis} clearance candidate outside raw boxes to receive separation`)
      }
    } else if (nodes.some(node => node.vx !== 0 || node.vy !== 0 || node.vz !== 0)) {
      throw new Error(`expected no push beyond ${axis} clearance`)
    }
    for (const other of ['vx', 'vy', 'vz'] as const) {
      if (other !== key && nodes.some(node => node[other] !== 0)) {
        throw new Error(`expected ${axis} clearance to preserve orthogonal velocity`)
      }
    }
  }
}

export function testClearanceBroadphaseX() { checkClearanceBroadphase('x') }
export function testClearanceBroadphaseY() { checkClearanceBroadphase('y') }
export function testClearanceBroadphaseZ() { checkClearanceBroadphase('z') }
