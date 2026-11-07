import { buildEdgePathD, traceEdgePathOnCanvas } from '@/lib/graph/edgeTypes'

type Route = Parameters<typeof buildEdgePathD>[0]

function trace(route: Route) {
  const commands: Array<{ command: string; values: number[] }> = []
  const ctx = {
    moveTo: (...values: number[]) => commands.push({ command: 'M', values }),
    lineTo: (...values: number[]) => commands.push({ command: 'L', values }),
    quadraticCurveTo: (...values: number[]) => commands.push({ command: 'Q', values }),
    bezierCurveTo: () => { throw new Error('unexpected cubic smoothstep') },
  } as unknown as CanvasRenderingContext2D
  traceEdgePathOnCanvas({ ...route, ctx })
  return commands
}

function assertContinuousTravel(route: Route) {
  const commands = trace(route)
  const svg = buildEdgePathD(route)
  const canvas = commands.map(({ command, values }) => `${command}${values.map((v, i) => `${i > 0 && i % 2 === 0 ? ' ' : i > 0 ? ',' : ''}${v}`).join('')}`).join(' ')
  if (svg !== canvas) throw new Error(`paint/trace geometry diverged: ${svg} / ${canvas}`)
  let previous = [route.sx, route.sy]
  for (const { values } of commands) {
    for (let i = 0; i < values.length; i += 2) {
      const point = values.slice(i, i + 2)
      for (let axis = 0; axis < 2; axis += 1) {
        const source = axis === 0 ? route.sx : route.sy
        const target = axis === 0 ? route.tx : route.ty
        if (!Number.isFinite(point[axis]) || point[axis] < Math.min(source, target) - 1e-9 || point[axis] > Math.max(source, target) + 1e-9) {
          throw new Error(`corner overshoots its endpoints: ${svg}`)
        }
        if ((point[axis] - previous[axis]) * Math.sign(target - source) < -1e-9) {
          throw new Error(`corner doubles back instead of forming a continuous turn: ${svg}`)
        }
      }
      previous = point
    }
  }
  if (previous[0] !== route.tx || previous[1] !== route.ty) throw new Error('edge does not reach its target')
}

export function testSmoothstepCornersFollowTravelInEveryDirection() {
  for (const rankdir of ['LR', 'TB'] as const) {
    for (const dx of [-800, 800]) for (const dy of [-600, 600]) {
      for (const bend of [-0.8, 0, 0.8]) for (const orbital of [false, true]) {
        assertContinuousTravel({ edgeType: 'smoothstep', sx: 130, sy: -40, tx: 130 + dx, ty: -40 + dy, rankdir,
          curve: { bend, orbital, orbitShift: 0.2, phase: -1 } })
      }
    }
  }
}

export function testSmoothstepShortAndAlignedEdgesNeverOvershoot() {
  for (const rankdir of ['LR', 'TB'] as const) {
    for (const dx of [-4, -0.01, 0, 0.01, 4]) for (const dy of [-4, -0.01, 0, 0.01, 4]) {
      assertContinuousTravel({ edgeType: 'smoothstep', sx: 0, sy: 0, tx: dx, ty: dy, rankdir,
        curve: { bend: 0.8, orbital: false, orbitShift: 0, phase: 1 } })
    }
  }
}

export function testSmoothstepRetainsSmoothReferenceAndEndpointContinuity() {
  const route: Route = { edgeType: 'smoothstep', sx: 0, sy: 0, tx: 200, ty: 120, rankdir: 'LR' }
  const expected = 'M0,0 L76,0 Q100,0 100,24 L100,96 Q100,120 124,120 L200,120'
  if (buildEdgePathD(route) !== expected) throw new Error('existing smooth forward reference changed')
  assertContinuousTravel(route)
  assertContinuousTravel({ ...route, sx: 200, sy: 120, tx: 0, ty: 0 })
}
