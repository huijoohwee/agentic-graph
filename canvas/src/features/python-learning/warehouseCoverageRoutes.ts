import { learningLesson } from './learningLessons'
import { DRONE002_DIMENSIONS } from './learningDockAssets'
import { WAREHOUSE_CONTEXT_RACKS, WAREHOUSE_FIXTURES, WAREHOUSE_PARTITIONS, WAREHOUSE_ZONES, warehouseRackGeometry } from './warehouseLayout'

export type WarehousePoint = readonly [number, number, number]
export type WarehouseActorId = 'charging-truck' | 'drone001' | 'drone002'
export type WarehousePose = Readonly<{ position: WarehousePoint; heading: number }>
export type WarehouseKeyframe = WarehousePose & Readonly<{ seconds: number }>
export type WarehouseCoverageTarget = Readonly<{
  id: string; kind: 'rack-face' | 'aisle'; name: string; position: WarehousePoint; heading: number
  aisleId: string; rackId?: string; bay?: number; level?: number; face?: 'north' | 'south'
}>
export type WarehouseInspectionCue = Readonly<{ id: string; actorId: WarehouseActorId; label: string; startSeconds: number; endSeconds: number }>
type Visit = { targetId: string; actorId: WarehouseActorId; startSeconds: number; endSeconds: number }
type Rect = Readonly<{ id: string; minX: number; maxX: number; minZ: number; maxZ: number }>
type Point2 = readonly [number, number]
type Rack = { id: string; name: string; position: readonly [number, number]; size: readonly [number, number, number] }
export const WAREHOUSE_INSPECTION_SCENARIO_ID = 'warehouse-coverage-v1'
export const WAREHOUSE_INSPECTION_FPS = 12
export const WAREHOUSE_INSPECTION_ACTOR_IDS = ['charging-truck', 'drone001', 'drone002'] as const
export const WAREHOUSE_INSPECTION_CLEARANCE_METRES = 0.25
const EPSILON = 1e-8, STANDOFF = 0.8, TARGET_DWELL = 0.5
const TRUCK_START: WarehousePoint = [-8, 0, 9], TRUCK_STOP: WarehousePoint = [10, 0, 9]
const DRONE001_HOME: WarehousePoint = [-8, 0, 10.5]
const distance = (a: Point2, b: Point2) => Math.hypot(b[0] - a[0], b[1] - a[1])
const xz = (point: WarehousePoint): Point2 => [point[0], point[2]]
const heading = (a: Point2, b: Point2) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI + 360) % 360
const boxRect = (id: string, position: WarehousePoint, size: WarehousePoint): Rect => ({ id,
  minX: position[0] - size[0] / 2, maxX: position[0] + size[0] / 2,
  minZ: position[2] - size[2] / 2, maxZ: position[2] + size[2] / 2 })

/** All six visible rack envelopes, including the two lesson-owned collision racks. */
export const WAREHOUSE_INSPECTION_RACKS: readonly Rack[] = [
  ...WAREHOUSE_CONTEXT_RACKS.map(rack => ({ ...rack, name: rack.id.replaceAll('-', ' ') })),
  ...learningLesson('drone').obstacles.filter(o => o.id.startsWith('rack-')).map(o => ({
    id: o.id, name: o.name ?? o.id, position: o.position, size: [o.size[0], o.height ?? 1, o.size[1]] as const,
  })),
]
const exclusions = WAREHOUSE_ZONES.filter(z => z.use === 'ancillary' || ['vault', 'climate'].includes(z.id)).map(zone => ({
  zoneId: zone.id, name: zone.name, areaSquareMetres: zone.rect[2] * zone.rect[3],
  reason: 'Access excluded: doors, authorization and traversable interior are not verified.',
}))
const rawRects: Rect[] = [
  ...WAREHOUSE_CONTEXT_RACKS.map(r => boxRect(r.id, [r.position[0], r.size[1] / 2, r.position[1]], r.size)),
  ...learningLesson('drone').obstacles.map(o => boxRect(o.id, [o.position[0], (o.height ?? 1) / 2, o.position[1]], [o.size[0], o.height ?? 1, o.size[1]])),
  ...WAREHOUSE_FIXTURES.map(o => boxRect(o.id, o.position, o.size)),
  ...WAREHOUSE_PARTITIONS.map((o, i) => boxRect(`partition-${i}`, o.position, o.size)),
  ...exclusions.map(({ zoneId }) => {
    const zone = WAREHOUSE_ZONES.find(z => z.id === zoneId)!, [x, z, width, depth] = zone.rect
    return { id: `excluded-${zoneId}`, minX: x, maxX: x + width, minZ: z, maxZ: z + depth }
  }),
]
/** Conservative horizontal envelopes remain blocked at every flight level; no over-rack shortcuts. */
export const WAREHOUSE_INSPECTION_BLOCKERS: readonly Rect[] = rawRects.map(r => ({ ...r,
  minX: r.minX - WAREHOUSE_INSPECTION_CLEARANCE_METRES, maxX: r.maxX + WAREHOUSE_INSPECTION_CLEARANCE_METRES,
  minZ: r.minZ - WAREHOUSE_INSPECTION_CLEARANCE_METRES, maxZ: r.maxZ + WAREHOUSE_INSPECTION_CLEARANCE_METRES,
}))
function pointClear(p: Point2) {
  return Math.abs(p[0]) < 29.75 && Math.abs(p[1]) < 19.75 && !WAREHOUSE_INSPECTION_BLOCKERS.some(r =>
    p[0] >= r.minX - EPSILON && p[0] <= r.maxX + EPSILON && p[1] >= r.minZ - EPSILON && p[1] <= r.maxZ + EPSILON)
}
function intersects(a: Point2, b: Point2, r: Rect) {
  let low = 0, high = 1
  for (const [origin, delta, min, max] of [[a[0], b[0] - a[0], r.minX, r.maxX], [a[1], b[1] - a[1], r.minZ, r.maxZ]]) {
    if (Math.abs(delta) < EPSILON) { if (origin < min || origin > max) return false }
    else {
      const u = (min - origin) / delta, v = (max - origin) / delta
      low = Math.max(low, Math.min(u, v)); high = Math.min(high, Math.max(u, v))
      if (low > high) return false
    }
  }
  return high >= 0 && low <= 1
}
function segmentClear(a: Point2, b: Point2) {
  return pointClear(a) && pointClear(b) && !WAREHOUSE_INSPECTION_BLOCKERS.some(r => intersects(a, b, r))
}
export function warehouseInspectionSegmentIsClear(a: WarehousePoint, b: WarehousePoint) {
  return [...a, ...b].every(Number.isFinite) && a[1] >= 0 && b[1] >= 0 && a[1] <= 4 && b[1] <= 4 && segmentClear(xz(a), xz(b))
}

/** Small deterministic visibility graph around shared padded rectangle corners. */
function makeRouter() {
  const vertices: Point2[] = [], seen = new Set<string>()
  for (const r of WAREHOUSE_INSPECTION_BLOCKERS) for (const x of [r.minX - 0.01, r.maxX + 0.01]) for (const z of [r.minZ - 0.01, r.maxZ + 0.01]) {
    const p: Point2 = [x, z], key = `${x.toFixed(6)},${z.toFixed(6)}`
    if (pointClear(p) && !seen.has(key)) { vertices.push(p); seen.add(key) }
  }
  const edges: Array<Array<readonly [number, number]>> = vertices.map(() => [])
  for (let a = 0; a < vertices.length; a++) for (let b = a + 1; b < vertices.length; b++) if (segmentClear(vertices[a], vertices[b])) {
    const d = distance(vertices[a], vertices[b]); edges[a].push([b, d]); edges[b].push([a, d])
  }
  const cache = new Map<string, readonly Point2[]>()
  return (a: Point2, b: Point2): readonly Point2[] | null => {
    if (!pointClear(a) || !pointClear(b)) return null
    if (segmentClear(a, b)) return [b]
    const key = `${a.join(',')}:${b.join(',')}`, cached = cache.get(key)
    if (cached) return cached
    const points = [...vertices, a, b], graph = edges.map(row => [...row]), start = vertices.length, end = start + 1
    graph.push([], [])
    for (const index of [start, end]) for (let v = 0; v < vertices.length; v++) if (segmentClear(points[index], points[v])) {
      const d = distance(points[index], points[v]); graph[index].push([v, d]); graph[v].push([index, d])
    }
    const costs = points.map(() => Infinity), previous = points.map(() => -1), visited = new Set<number>(); costs[start] = 0
    for (let step = 0; step < points.length; step++) {
      let current = -1
      for (let i = 0; i < points.length; i++) if (!visited.has(i) && (current < 0 || costs[i] < costs[current])) current = i
      if (current < 0 || !Number.isFinite(costs[current])) return null
      if (current === end) break
      visited.add(current)
      for (const [next, d] of graph[current]) if (costs[current] + d < costs[next]) { costs[next] = costs[current] + d; previous[next] = current }
    }
    const result: Point2[] = []
    for (let at = end; at !== start; at = previous[at]) { if (at < 0) return null; result.unshift(points[at]) }
    cache.set(key, result); return result
  }
}

function makeTargets() {
  const rackTargets: WarehouseCoverageTarget[] = [], aisleTargets: WarehouseCoverageTarget[] = []
  for (const rack of WAREHOUSE_INSPECTION_RACKS) {
    const [width, height, depth] = rack.size, { bays, levels, bayWidth, levelHeight } = warehouseRackGeometry(width, height)
    for (const side of [-1, 1] as const) {
      const face = side === -1 ? 'north' : 'south', aisleId = `${rack.id}:${face}`
      for (let tier = 0; tier < levels; tier++) for (let step = 0; step < bays; step++) {
        const bay = tier % 2 ? bays - step - 1 : step
        const x = rack.position[0] - width / 2 + 0.08 + (bay + 0.5) * bayWidth
        const z = rack.position[1] + side * (depth / 2 + STANDOFF)
        const y = tier * levelHeight + 0.34 + levelHeight * 0.31
        rackTargets.push({ id: `${aisleId}:bay-${bay + 1}:level-${tier + 1}`, kind: 'rack-face',
          name: `${rack.name} / ${face} / bay ${bay + 1} / level ${tier + 1}`, position: [x, y, z],
          heading: side === -1 ? 90 : 270, aisleId, rackId: rack.id, bay: bay + 1, level: tier + 1, face })
        if (tier === 0) aisleTargets.push({ id: `aisle:${aisleId}:bay-${bay + 1}`, kind: 'aisle',
          name: `${rack.name} ${face} aisle / station ${bay + 1}`, position: [x, 0, z], heading: 0, aisleId })
      }
    }
  }
  const connectors: Array<readonly [string, number, number]> = [
    ['receiving', -25, -6.5], ['bulk-access', -22, 8], ['kitting-access', -2, -12.5],
    ['packing-access', 26, -12.5], ['north-cross-aisle', 0, -8.5], ['south-cross-aisle', 0, 9], ['shipping', 25, 8],
  ]
  for (const [name, x, z] of connectors) aisleTargets.push({ id: `aisle:${name}`, kind: 'aisle', name, position: [x, 0, z], heading: 0, aisleId: name })
  return { rackTargets, aisleTargets }
}

function buildInspection() {
  const router = makeRouter(), { rackTargets, aisleTargets } = makeTargets(), targets = [...rackTargets, ...aisleTargets]
  const visits: Visit[] = [], cues: WarehouseInspectionCue[] = [], unreachable: Array<{ targetId: string; reason: string }> = []
  const truck: WarehouseKeyframe[] = [{ seconds: 0, position: TRUCK_START, heading: 0 }]
  const drone001: WarehouseKeyframe[] = [{ seconds: 0, position: DRONE001_HOME, heading: 0 }]
  const hold = (path: WarehouseKeyframe[], seconds: number) => { const last = path[path.length - 1]; path.push({ ...last, seconds: last.seconds + seconds }) }
  function move(path: WarehouseKeyframe[], destination: WarehousePoint, speed: number) {
    const last = path[path.length - 1], points = router(xz(last.position), xz(destination))
    if (!points) return false
    let position = last.position, time = last.seconds, angle = last.heading
    for (const p of points) {
      const next: WarehousePoint = [p[0], position[1], p[1]], d = distance(xz(position), p)
      if (d > EPSILON) { angle = heading(xz(position), p); time += d / speed; path.push({ seconds: time, position: next, heading: angle }); position = next }
    }
    if (Math.abs(destination[1] - position[1]) > EPSILON) { time += Math.abs(destination[1] - position[1]) / 0.7; path.push({ seconds: time, position: destination, heading: angle }) }
    return true
  }
  function visit(path: WarehouseKeyframe[], target: WarehouseCoverageTarget, actorId: WarehouseActorId, speed: number) {
    if (!move(path, target.position, speed)) { unreachable.push({ targetId: target.id, reason: 'No clearance-preserving route in the declared geometry.' }); return }
    const last = path[path.length - 1]; path[path.length - 1] = { ...last, heading: target.heading }
    visits.push({ targetId: target.id, actorId, startSeconds: last.seconds, endSeconds: last.seconds + TARGET_DWELL }); hold(path, TARGET_DWELL)
  }
  const remaining = [...aisleTargets]
  while (remaining.length) {
    const position = xz(truck[truck.length - 1].position)
    remaining.sort((a, b) => distance(position, xz(a.position)) - distance(position, xz(b.position)) || a.id.localeCompare(b.id))
    visit(truck, remaining.shift()!, 'charging-truck', 1)
  }
  if (!move(truck, TRUCK_STOP, 1)) throw new Error('Warehouse carrier cannot reach its launch/recovery stop.')
  const truckStopSeconds = truck[truck.length - 1].seconds
  cues.push({ id: 'truck-ground-route', actorId: 'charging-truck', label: 'Programmed aisle survey / carry drone002', startSeconds: 0, endSeconds: truckStopSeconds })
  hold(truck, 2)
  const groups = new Map<string, WarehouseCoverageTarget[]>()
  for (const target of rackTargets) groups.set(target.aisleId, [...(groups.get(target.aisleId) ?? []), target])
  const assigned: WarehouseCoverageTarget[][][] = [[], []], loads = [0, 0]
  for (const group of [...groups.values()].sort((a, b) => b.length - a.length || a[0].aisleId.localeCompare(b[0].aisleId))) {
    const index = loads[0] <= loads[1] ? 0 : 1; assigned[index].push(group); loads[index] += group.length
  }
  function inspect(path: WarehouseKeyframe[], actorId: 'drone001' | 'drone002', groupsToVisit: WarehouseCoverageTarget[][]) {
    while (groupsToVisit.length) {
      const position = xz(path[path.length - 1].position)
      groupsToVisit.sort((a, b) => distance(position, xz(a[0].position)) - distance(position, xz(b[0].position)) || a[0].id.localeCompare(b[0].id))
      for (const target of groupsToVisit.shift()!) visit(path, target, actorId, 1.4)
    }
  }
  const drone001Start = truckStopSeconds + 2; hold(drone001, drone001Start)
  if (!move(drone001, [DRONE001_HOME[0], 0.6, DRONE001_HOME[2]], 0.7)) throw new Error('drone001 launch is blocked.')
  inspect(drone001, 'drone001', assigned[0])
  if (!move(drone001, DRONE001_HOME, 1.4)) throw new Error('drone001 recovery is blocked.')
  const drone001End = drone001[drone001.length - 1].seconds
  cues.push({ id: 'drone001-inspection', actorId: 'drone001', label: 'Drone001 rack faces / all rendered tiers', startSeconds: drone001Start, endSeconds: drone001End })
  const doorOpenStart = drone001End + 1, doorOpenEnd = doorOpenStart + 1
  const drone002: WarehouseKeyframe[] = truck.map(frame => ({ ...frame, position: [frame.position[0], DRONE002_DIMENSIONS.dockedBaseY, frame.position[2]] }))
  const dock: WarehousePoint = [TRUCK_STOP[0], DRONE002_DIMENSIONS.dockedBaseY, TRUCK_STOP[2]]
  hold(drone002, doorOpenEnd + 0.5 - drone002[drone002.length - 1].seconds)
  const drone002Start = drone002[drone002.length - 1].seconds
  if (!move(drone002, [dock[0], DRONE002_DIMENSIONS.clearanceBaseY, dock[2]], 0.7) || !move(drone002, [dock[0], 0.6, dock[2]], 0.7)) throw new Error('drone002 launch is blocked.')
  inspect(drone002, 'drone002', assigned[1])
  if (!move(drone002, [dock[0], 0.6, dock[2]], 1.4) || !move(drone002, [dock[0], DRONE002_DIMENSIONS.clearanceBaseY, dock[2]], 0.7)) throw new Error('drone002 recovery is blocked.')
  // Align above the open lid before entering the narrow bay; never turn inside the shell.
  const approach = drone002[drone002.length - 1]
  drone002[drone002.length - 1] = { ...approach, heading: truck[truck.length - 1].heading }; hold(drone002, 0.25)
  if (!move(drone002, dock, 0.7)) throw new Error('drone002 docking is blocked.')
  const drone002End = drone002[drone002.length - 1].seconds, doorCloseStart = drone002End + 0.5, doorCloseEnd = doorCloseStart + 1
  const durationSeconds = doorCloseEnd + 10
  cues.push({ id: 'door-open', actorId: 'charging-truck', label: 'Open charging bay lid', startSeconds: doorOpenStart, endSeconds: doorOpenEnd },
    { id: 'drone002-inspection', actorId: 'drone002', label: 'Drone002 launch / rack inspection / return', startSeconds: drone002Start, endSeconds: drone002End },
    { id: 'door-close', actorId: 'charging-truck', label: 'Close lid after docking', startSeconds: doorCloseStart, endSeconds: doorCloseEnd },
    { id: 'charging', actorId: 'charging-truck', label: 'Simulated charging dwell', startSeconds: doorCloseEnd, endSeconds: durationSeconds })
  for (const path of [truck, drone001, drone002]) hold(path, durationSeconds - path[path.length - 1].seconds)
  if (!Number.isFinite(durationSeconds) || durationSeconds > 3600 || truck.length + drone001.length + drone002.length > 5000) throw new Error('Warehouse rehearsal exceeds its one-hour / 5,000-keyframe model limit.')
  return { scenarioId: WAREHOUSE_INSPECTION_SCENARIO_ID, durationSeconds, paths: { truck, drone001, drone002 }, targets, visits, cues,
    exclusions, excludedAreaSquareMetres: exclusions.reduce((sum, value) => sum + value.areaSquareMetres, 0), unreachableTargets: unreachable,
    coverage: { rackTotal: rackTargets.length, aisleTotal: aisleTargets.length, metric: 'Modeled station visits; not physical, photographic or entire-facility inspection coverage.' },
    schedule: { truckStopSeconds, drone001Start, drone001End, doorOpenStart, doorOpenEnd, drone002Start, drone002End, doorCloseStart, doorCloseEnd } }
}

export const WAREHOUSE_INSPECTION = buildInspection()
export const WAREHOUSE_INSPECTION_DURATION_SECONDS = WAREHOUSE_INSPECTION.durationSeconds
export function sampleWarehousePath(path: readonly WarehouseKeyframe[], seconds: number): WarehousePose {
  let low = 0, high = path.length - 1
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (path[mid].seconds <= seconds) low = mid; else high = mid - 1 }
  const a = path[low], b = path[Math.min(low + 1, path.length - 1)], length = b.seconds - a.seconds
  const t = length <= EPSILON ? 0 : Math.max(0, Math.min(1, (seconds - a.seconds) / length))
  const delta = ((b.heading - a.heading + 540) % 360) - 180
  return { position: a.position.map((v, i) => v + (b.position[i] - v) * t) as unknown as WarehousePoint, heading: (a.heading + delta * t + 360) % 360 }
}
export type WarehouseInspectionSample = Readonly<{
  seconds: number; frameIndex: number; actors: { truck: WarehousePose; drone001: WarehousePose; drone002: WarehousePose }
  lidAngleRadians: number; drone002Docked: boolean; charging: boolean; phase: string
  coverage: { rackVisited: number; rackTotal: number; aisleVisited: number; aisleTotal: number }
  currentTarget: WarehouseCoverageTarget | null
  cameraTarget: { targetId: string; position: WarehousePoint; actorId: WarehouseActorId } | null
}>
/** Pure projection of the existing native timeline cursor; no clock, transport or inference. */
export function sampleWarehouseInspection(inputSeconds: number): WarehouseInspectionSample {
  if (!Number.isFinite(inputSeconds)) throw new Error('Warehouse inspection time must be finite.')
  const seconds = Math.max(0, Math.min(WAREHOUSE_INSPECTION_DURATION_SECONDS, inputSeconds)), plan = WAREHOUSE_INSPECTION, s = plan.schedule
  const completed = new Set(plan.visits.filter(v => v.endSeconds <= seconds).map(v => v.targetId))
  const currentVisit = plan.visits.find(v => v.startSeconds <= seconds && v.endSeconds > seconds)
  const currentTarget = currentVisit ? plan.targets.find(t => t.id === currentVisit.targetId) ?? null : null
  const aim: WarehousePoint | null = currentTarget ? currentTarget.kind === 'rack-face'
    ? [currentTarget.position[0], currentTarget.position[1], currentTarget.position[2] + (currentTarget.face === 'north' ? STANDOFF : -STANDOFF)]
    : [currentTarget.position[0] + Math.cos(currentTarget.heading * Math.PI / 180), currentTarget.position[1], currentTarget.position[2] + Math.sin(currentTarget.heading * Math.PI / 180)] : null
  const lid = seconds < s.doorOpenStart ? 0 : seconds < s.doorOpenEnd ? (seconds - s.doorOpenStart) : seconds < s.doorCloseStart ? 1 : seconds < s.doorCloseEnd ? 1 - (seconds - s.doorCloseStart) : 0
  const phase = seconds < s.truckStopSeconds ? 'Ground aisle survey' : seconds < s.drone001Start ? 'Carrier stopped' : seconds < s.drone001End ? 'Drone001 rack inspection' : seconds < s.drone002Start ? 'Open charging bay' : seconds < s.drone002End ? 'Drone002 rack inspection' : seconds < s.doorCloseEnd ? 'Dock and close bay' : seconds < plan.durationSeconds ? 'Simulated charging' : 'Rehearsal complete'
  return { seconds, frameIndex: Math.floor(seconds * WAREHOUSE_INSPECTION_FPS),
    actors: { truck: sampleWarehousePath(plan.paths.truck, seconds), drone001: sampleWarehousePath(plan.paths.drone001, seconds), drone002: sampleWarehousePath(plan.paths.drone002, seconds) },
    lidAngleRadians: Math.max(0, Math.min(1, lid)) * Math.PI / 2, drone002Docked: seconds <= s.drone002Start || seconds >= s.drone002End,
    charging: seconds >= s.doorCloseEnd, phase,
    coverage: { rackVisited: plan.targets.filter(t => t.kind === 'rack-face' && completed.has(t.id)).length, rackTotal: plan.coverage.rackTotal,
      aisleVisited: plan.targets.filter(t => t.kind === 'aisle' && completed.has(t.id)).length, aisleTotal: plan.coverage.aisleTotal },
    currentTarget, cameraTarget: currentTarget && currentVisit && aim ? { targetId: currentTarget.id, position: aim, actorId: currentVisit.actorId } : null }
}
