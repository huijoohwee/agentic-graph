export const XR_PHYSICS_GRAPH_METADATA_KEY = 'kgXrPhysicsWorld'
export const XR_PHYSICS_WORLD_SCHEMA = 'agenticgraph-xr-physics-world/v1'
export const XR_PHYSICS_BODY_MODES = ['static', 'dynamic', 'kinematic', 'trigger'] as const

export type XrPhysicsVector = readonly [number, number, number]
export type XrPhysicsBodyMode = (typeof XR_PHYSICS_BODY_MODES)[number]

export type XrPhysicsBodyConfig = Readonly<{
  subjectId: string
  mode: XrPhysicsBodyMode
  sizeMeters: XrPhysicsVector
  spawnPosition: XrPhysicsVector
  initialVelocity: XrPhysicsVector
  mass: number
  friction: number
  restitution: number
  linearDamping: number
  collisionGroup: number
  collisionMask: number
}>

export type XrPhysicsFloorConfig = Readonly<{
  enabled: boolean
  height: number
  friction: number
  restitution: number
  collisionGroup: number
  collisionMask: number
}>

export type XrPhysicsWorldConfig = Readonly<{
  schema: typeof XR_PHYSICS_WORLD_SCHEMA
  gravity: XrPhysicsVector
  fixedStepSeconds: number
  maxSubSteps: number
  floor: XrPhysicsFloorConfig
  bodies: readonly XrPhysicsBodyConfig[]
}>

export type XrPhysicsStaticCollider = Readonly<{
  id: string
  center: XrPhysicsVector
  sizeMeters: XrPhysicsVector
  friction: number
  restitution: number
  collisionGroup: number
  collisionMask: number
  trigger: boolean
}>

export type XrPhysicsSubjectSeed = Readonly<{
  subjectId: string
  position: XrPhysicsVector
  sizeMeters: XrPhysicsVector
}>

export type XrPhysicsBodyPatch = Partial<Omit<XrPhysicsBodyConfig, 'subjectId'>>

export const XR_PHYSICS_MAX_BODIES = 128
export const XR_PHYSICS_MAX_STATIC_COLLIDERS = 192
export const XR_PHYSICS_COLLISION_BITFIELD_MAX = 0xffff
const DEFAULT_GROUP = 1
const ALL_GROUPS = XR_PHYSICS_COLLISION_BITFIELD_MAX

export function compareXrPhysicsIds(leftValue: string, rightValue: string): number {
  const left = String(leftValue || '')
  const right = String(rightValue || '')
  return left < right ? -1 : left > right ? 1 : 0
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function finite(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, places = 6): number {
  const scale = 10 ** places
  return Math.round(value * scale) / scale
}

function bounded(value: unknown, fallback: number, min: number, max: number, places = 6): number {
  return round(clamp(finite(value, fallback), min, max), places)
}

function id(value: unknown, maxLength = 160): string {
  return String(value ?? '').trim().slice(0, maxLength)
}

function vector(
  value: unknown,
  fallback: XrPhysicsVector,
  min: number,
  max: number,
): XrPhysicsVector {
  if (!Array.isArray(value) || value.length < 3) return Object.freeze([...fallback]) as XrPhysicsVector
  return Object.freeze([
    bounded(value[0], fallback[0], min, max),
    bounded(value[1], fallback[1], min, max),
    bounded(value[2], fallback[2], min, max),
  ]) as XrPhysicsVector
}

function bitField(value: unknown, fallback: number, allowZero: boolean): number {
  const parsed = finite(value, fallback)
  const normalized = clamp(Math.trunc(parsed), 0, ALL_GROUPS) >>> 0
  return allowZero || normalized !== 0 ? normalized : fallback >>> 0
}

function bodyMode(value: unknown): XrPhysicsBodyMode {
  const normalized = String(value ?? '').trim()
  return XR_PHYSICS_BODY_MODES.includes(normalized as XrPhysicsBodyMode)
    ? normalized as XrPhysicsBodyMode
    : 'dynamic'
}

function bodyEntries(value: unknown): readonly Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(record)
  return Object.entries(record(value)).map(([subjectId, body]) => ({ ...record(body), subjectId }))
}

function normalizeBody(value: unknown, seed?: XrPhysicsSubjectSeed): XrPhysicsBodyConfig | null {
  const source = record(value)
  const subjectId = id(source.subjectId || seed?.subjectId)
  if (!subjectId) return null
  return Object.freeze({
    subjectId,
    mode: bodyMode(source.mode),
    sizeMeters: vector(seed?.sizeMeters ?? source.sizeMeters, [1, 1, 1], 0.02, 100),
    spawnPosition: vector(seed?.position ?? source.spawnPosition, [0, 0, 0], -1_000, 1_000),
    initialVelocity: vector(source.initialVelocity, [0, 0, 0], -250, 250),
    mass: bounded(source.mass, 1, 0.001, 100_000),
    friction: bounded(source.friction, 0.55, 0, 1),
    restitution: bounded(source.restitution, 0.1, 0, 1),
    linearDamping: bounded(source.linearDamping, 0.08, 0, 20),
    collisionGroup: bitField(source.collisionGroup, DEFAULT_GROUP, false),
    collisionMask: bitField(source.collisionMask, ALL_GROUPS, true),
  })
}

function normalizeFloor(value: unknown): XrPhysicsFloorConfig {
  const source = record(value)
  return Object.freeze({
    enabled: source.enabled !== false,
    height: bounded(source.height, 0, -100, 100),
    friction: bounded(source.friction, 0.7, 0, 1),
    restitution: bounded(source.restitution, 0.05, 0, 1),
    collisionGroup: bitField(source.collisionGroup, DEFAULT_GROUP, false),
    collisionMask: bitField(source.collisionMask, ALL_GROUPS, true),
  })
}

export function readXrPhysicsWorld(
  value: unknown,
  knownSubjects?: readonly XrPhysicsSubjectSeed[],
): XrPhysicsWorldConfig {
  const source = record(value)
  const known = knownSubjects === undefined
    ? null
    : new Map(knownSubjects.map(seed => [id(seed.subjectId), seed]))
  const candidates = bodyEntries(source.bodies)
    .filter(candidate => id(candidate.subjectId))
    .sort((left, right) => {
      const byId = compareXrPhysicsIds(id(left.subjectId), id(right.subjectId))
      return byId || compareXrPhysicsIds(JSON.stringify(left), JSON.stringify(right))
    })
  const seen = new Set<string>()
  const bodies: XrPhysicsBodyConfig[] = []
  for (const candidate of candidates) {
    const subjectId = id(candidate.subjectId)
    if (seen.has(subjectId) || (known && !known.has(subjectId))) continue
    const normalized = normalizeBody(candidate, known?.get(subjectId))
    if (!normalized) continue
    seen.add(subjectId)
    bodies.push(normalized)
    if (bodies.length >= XR_PHYSICS_MAX_BODIES) break
  }
  return Object.freeze({
    schema: XR_PHYSICS_WORLD_SCHEMA,
    gravity: vector(source.gravity, [0, -9.81, 0], -100, 100),
    fixedStepSeconds: bounded(source.fixedStepSeconds, 1 / 60, 1 / 240, 1 / 15, 8),
    maxSubSteps: Math.round(bounded(source.maxSubSteps, 5, 1, 12, 0)),
    floor: normalizeFloor(source.floor),
    bodies: Object.freeze(bodies),
  })
}

export function serializeXrPhysicsWorld(worldValue: XrPhysicsWorldConfig): Record<string, unknown> {
  const world = readXrPhysicsWorld(worldValue)
  const bodies = Object.fromEntries(world.bodies.map(body => [body.subjectId, {
    mode: body.mode,
    sizeMeters: [...body.sizeMeters],
    spawnPosition: [...body.spawnPosition],
    initialVelocity: [...body.initialVelocity],
    mass: body.mass,
    friction: body.friction,
    restitution: body.restitution,
    linearDamping: body.linearDamping,
    collisionGroup: body.collisionGroup,
    collisionMask: body.collisionMask,
  }]))
  return {
    schema: XR_PHYSICS_WORLD_SCHEMA,
    gravity: [...world.gravity],
    fixedStepSeconds: world.fixedStepSeconds,
    maxSubSteps: world.maxSubSteps,
    floor: { ...world.floor },
    bodies,
  }
}

export function xrPhysicsWorldSignature(world: XrPhysicsWorldConfig): string {
  return JSON.stringify(serializeXrPhysicsWorld(world))
}

export function createXrPhysicsBodyConfig(
  seed: XrPhysicsSubjectSeed,
  patch: XrPhysicsBodyPatch = {},
): XrPhysicsBodyConfig {
  return normalizeBody({ ...patch, subjectId: seed.subjectId }, seed)!
}

export function patchXrPhysicsBodyConfig(
  body: XrPhysicsBodyConfig,
  patch: XrPhysicsBodyPatch,
): XrPhysicsBodyConfig {
  return normalizeBody({ ...body, ...patch, subjectId: body.subjectId })!
}

export function readXrPhysicsStaticColliders(value: unknown): readonly XrPhysicsStaticCollider[] {
  const sources = Array.isArray(value) ? value.map(record) : []
  const colliders = sources.map(source => {
    const colliderId = id(source.id)
    if (!colliderId) return null
    return Object.freeze({
      id: colliderId,
      center: vector(source.center, [0, 0, 0], -1_000, 1_000),
      sizeMeters: vector(source.sizeMeters, [1, 1, 1], 0.02, 1_000),
      friction: bounded(source.friction, 0.65, 0, 1),
      restitution: bounded(source.restitution, 0.05, 0, 1),
      collisionGroup: bitField(source.collisionGroup, DEFAULT_GROUP, false),
      collisionMask: bitField(source.collisionMask, ALL_GROUPS, true),
      trigger: source.trigger === true,
    })
  }).filter((collider): collider is XrPhysicsStaticCollider => Boolean(collider))
    .sort((left, right) => compareXrPhysicsIds(left.id, right.id))
  return Object.freeze(colliders.slice(0, XR_PHYSICS_MAX_STATIC_COLLIDERS))
}

export function buildXrPhysicsStructureColliders(structures: readonly Readonly<{
  id: string
  position: XrPhysicsVector
  size: XrPhysicsVector
}>[]): readonly XrPhysicsStaticCollider[] {
  return readXrPhysicsStaticColliders(structures.map(structure => ({
    id: `stage:${structure.id}`,
    center: structure.position,
    sizeMeters: structure.size,
  })))
}
