import {
  compareXrPhysicsIds,
  createXrPhysicsBodyConfig,
  patchXrPhysicsBodyConfig,
  readXrPhysicsStaticColliders,
  readXrPhysicsWorld,
  serializeXrPhysicsWorld,
  xrPhysicsWorldSignature,
  type XrPhysicsBodyConfig,
  type XrPhysicsBodyPatch,
  type XrPhysicsFloorConfig,
  type XrPhysicsStaticCollider,
  type XrPhysicsSubjectSeed,
  type XrPhysicsVector,
  type XrPhysicsWorldConfig,
} from './xrPhysicsModel'
import type { SpatialPhysicsEvent } from '../physics/spatialPhysicsTypes'
import {
  applyXrPhysicsSimulationImpulse,
  captureXrPhysicsSimulation,
  createXrPhysicsSimulation,
  readXrPhysicsSimulationBody,
  resetXrPhysicsSimulation,
  setXrPhysicsSimulationBodyPose,
  stepXrPhysicsSimulation,
  type XrPhysicsBodyState,
  type XrPhysicsSimulation,
} from './xrSpatialPhysicsAdapter'

export type XrPhysicsRuntimePhase = 'stopped' | 'playing' | 'paused'

export type XrPhysicsRuntimeSnapshot = Readonly<{
  sceneKey: string
  ownerSourceSignature: string
  sourceSignature: string
  phase: XrPhysicsRuntimePhase
  world: XrPhysicsWorldConfig
  staticColliderCount: number
  dirty: boolean
  revision: number
}>

export type XrPhysicsRuntimeFrame = Readonly<{
  elapsedSeconds: number
  stepCount: number
  bodies: readonly XrPhysicsBodyState[]
}>

export type XrPhysicsRuntimeStepResult = Readonly<{
  stepped: boolean
  subSteps: number
  contactCount: number
  elapsedSeconds: number
  events: readonly SpatialPhysicsEvent[]
  stepCount: number
}>

export type XrPhysicsWorldPatch = Readonly<{
  gravity?: XrPhysicsVector
  fixedStepSeconds?: number
  maxSubSteps?: number
  floor?: Partial<XrPhysicsFloorConfig>
}>

type RuntimeListener = () => void
const listeners = new Set<RuntimeListener>()
const EMPTY_PHYSICS_EVENTS = Object.freeze([]) as readonly SpatialPhysicsEvent[]
let activeSubjects: readonly XrPhysicsSubjectSeed[] = []
let staticColliders: readonly XrPhysicsStaticCollider[] = []
let accumulatorSeconds = 0

function freezeSnapshot(value: Omit<XrPhysicsRuntimeSnapshot, 'revision'> & { revision: number }): XrPhysicsRuntimeSnapshot {
  return Object.freeze({ ...value })
}

const initialWorld = readXrPhysicsWorld(null)
let simulation: XrPhysicsSimulation = createXrPhysicsSimulation(initialWorld)
let snapshot = freezeSnapshot({
  sceneKey: '',
  ownerSourceSignature: '',
  sourceSignature: '',
  phase: 'stopped',
  world: initialWorld,
  staticColliderCount: 0,
  dirty: false,
  revision: 0,
})

function publish(next: Omit<XrPhysicsRuntimeSnapshot, 'revision'>): XrPhysicsRuntimeSnapshot {
  snapshot = freezeSnapshot({ ...next, revision: snapshot.revision + 1 })
  for (const listener of [...listeners]) listener()
  return snapshot
}

function normalizedSubjectSeeds(subjects: readonly XrPhysicsSubjectSeed[]): readonly XrPhysicsSubjectSeed[] {
  const seeds = subjects.filter(subject => String(subject.subjectId || '').trim()).map(subject => {
    const config = createXrPhysicsBodyConfig(subject)
    return Object.freeze({
      subjectId: config.subjectId,
      position: config.spawnPosition,
      sizeMeters: config.sizeMeters,
    })
  }).sort((left, right) => compareXrPhysicsIds(left.subjectId, right.subjectId))
  return Object.freeze(seeds.filter((seed, index) => index === 0 || seeds[index - 1]!.subjectId !== seed.subjectId))
}

function physicsOwnerSourceSignature(args: {
  sceneKey: string
  sourceSignature: string
  persistedValue: unknown
  subjects: readonly XrPhysicsSubjectSeed[]
  colliders: readonly XrPhysicsStaticCollider[]
}): string {
  return JSON.stringify({
    sceneKey: String(args.sceneKey || ''),
    sourceSignature: String(args.sourceSignature || ''),
    persistedWorld: serializeXrPhysicsWorld(readXrPhysicsWorld(args.persistedValue)),
    subjectIds: args.subjects.map(subject => subject.subjectId),
    colliders: args.colliders.map(collider => [
      collider.id,
      collider.center,
      collider.sizeMeters,
      collider.friction,
      collider.restitution,
      collider.collisionGroup,
      collider.collisionMask,
      collider.trigger,
    ]),
  })
}

function stoppedHydrationSignature(args: {
  ownerSourceSignature: string
  persistedValue: unknown
  subjects: readonly XrPhysicsSubjectSeed[]
  colliders: readonly XrPhysicsStaticCollider[]
}): string {
  return JSON.stringify({
    ownerSourceSignature: args.ownerSourceSignature,
    persistedWorld: serializeXrPhysicsWorld(readXrPhysicsWorld(args.persistedValue, args.subjects)),
    subjects: args.subjects.map(subject => [subject.subjectId, subject.position, subject.sizeMeters]),
    colliders: args.colliders.map(collider => [
      collider.id,
      collider.center,
      collider.sizeMeters,
      collider.friction,
      collider.restitution,
      collider.collisionGroup,
      collider.collisionMask,
      collider.trigger,
    ]),
  })
}

function replaceWorld(world: XrPhysicsWorldConfig, dirty: boolean): XrPhysicsRuntimeSnapshot {
  if (xrPhysicsWorldSignature(world) === xrPhysicsWorldSignature(snapshot.world) && dirty === snapshot.dirty) {
    return snapshot
  }
  simulation = createXrPhysicsSimulation(world, staticColliders)
  accumulatorSeconds = 0
  return publish({ ...snapshot, phase: 'stopped', world, dirty })
}

function bodyById(subjectIdValue: string): XrPhysicsBodyConfig | null {
  const subjectId = String(subjectIdValue || '').trim()
  return snapshot.world.bodies.find(body => body.subjectId === subjectId) || null
}

function finiteVector(value: unknown): value is XrPhysicsVector {
  return Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(Number.isFinite)
}

function validBodyPatch(patch: XrPhysicsBodyPatch | undefined): boolean {
  if (!patch || typeof patch !== 'object') return patch === undefined
  if (patch.mode !== undefined && !['static', 'dynamic', 'kinematic', 'trigger'].includes(String(patch.mode))) return false
  if (patch.sizeMeters !== undefined && (!finiteVector(patch.sizeMeters) || patch.sizeMeters.some(value => value <= 0))) return false
  if (patch.spawnPosition !== undefined && !finiteVector(patch.spawnPosition)) return false
  if (patch.initialVelocity !== undefined && !finiteVector(patch.initialVelocity)) return false
  for (const key of ['mass', 'friction', 'restitution', 'linearDamping', 'collisionGroup', 'collisionMask'] as const) {
    if (patch[key] !== undefined && !Number.isFinite(patch[key])) return false
  }
  return patch.mass === undefined || patch.mass > 0
}

function validWorldPatch(patch: XrPhysicsWorldPatch): boolean {
  if (!patch || typeof patch !== 'object') return false
  if (patch.gravity !== undefined && !finiteVector(patch.gravity)) return false
  if (patch.fixedStepSeconds !== undefined && (!Number.isFinite(patch.fixedStepSeconds) || patch.fixedStepSeconds <= 0)) return false
  if (patch.maxSubSteps !== undefined && (!Number.isFinite(patch.maxSubSteps) || patch.maxSubSteps < 1)) return false
  if (patch.floor) {
    for (const key of ['height', 'friction', 'restitution', 'collisionGroup', 'collisionMask'] as const) {
      if (patch.floor[key] !== undefined && !Number.isFinite(patch.floor[key])) return false
    }
  }
  return true
}

export function readXrPhysicsRuntime(): XrPhysicsRuntimeSnapshot {
  return snapshot
}

export function subscribeXrPhysicsRuntime(listener: RuntimeListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function restoreXrPhysicsRuntimeSnapshot(
  previous: XrPhysicsRuntimeSnapshot,
): XrPhysicsRuntimeSnapshot {
  simulation = createXrPhysicsSimulation(previous.world, staticColliders)
  accumulatorSeconds = 0
  const { revision: _revision, ...restored } = previous
  return publish(restored)
}

export function markXrPhysicsRuntimeSaved(savedValue: unknown): XrPhysicsRuntimeSnapshot {
  const savedWorld = readXrPhysicsWorld(savedValue, activeSubjects)
  if (xrPhysicsWorldSignature(savedWorld) !== xrPhysicsWorldSignature(snapshot.world) || !snapshot.dirty) {
    return snapshot
  }
  return publish({ ...snapshot, dirty: false })
}

export function readXrPhysicsRuntimeFrame(): XrPhysicsRuntimeFrame {
  return Object.freeze({
    elapsedSeconds: simulation.elapsedSeconds,
    stepCount: simulation.stepCount,
    bodies: captureXrPhysicsSimulation(simulation),
  })
}

export function readXrPhysicsBodyState(subjectId: string): XrPhysicsBodyState | null {
  return readXrPhysicsSimulationBody(simulation, subjectId)
}

export function serializeXrPhysicsRuntimeWorld(): Record<string, unknown> {
  return serializeXrPhysicsWorld(snapshot.world)
}

export function hydrateXrPhysicsRuntime(args: {
  sceneKey: string
  sourceSignature?: string
  persistedValue: unknown
  subjects: readonly XrPhysicsSubjectSeed[]
  staticColliders?: readonly XrPhysicsStaticCollider[]
}): XrPhysicsRuntimeSnapshot {
  const subjects = normalizedSubjectSeeds(args.subjects)
  const colliders = readXrPhysicsStaticColliders(args.staticColliders || [])
  const ownerSourceSignature = physicsOwnerSourceSignature({
    sceneKey: args.sceneKey,
    sourceSignature: args.sourceSignature || '',
    persistedValue: args.persistedValue,
    subjects,
    colliders,
  })
  const sourceSignature = stoppedHydrationSignature({
    ownerSourceSignature,
    persistedValue: args.persistedValue,
    subjects,
    colliders,
  })
  const sameActiveOwner = snapshot.phase !== 'stopped'
    && snapshot.sceneKey === String(args.sceneKey || '')
    && snapshot.ownerSourceSignature === ownerSourceSignature
  if (sameActiveOwner) return snapshot
  if (sourceSignature === snapshot.sourceSignature) return snapshot
  activeSubjects = subjects
  staticColliders = colliders
  const persistedWorld = readXrPhysicsWorld(args.persistedValue, activeSubjects)
  const sameDirtySource = snapshot.sceneKey === String(args.sceneKey || '')
    && snapshot.ownerSourceSignature === ownerSourceSignature
    && snapshot.dirty
  const preserveDirty = sameDirtySource
    && xrPhysicsWorldSignature(persistedWorld) !== xrPhysicsWorldSignature(snapshot.world)
  const world = preserveDirty
    ? readXrPhysicsWorld(serializeXrPhysicsWorld(snapshot.world), activeSubjects)
    : persistedWorld
  simulation = createXrPhysicsSimulation(world, colliders)
  accumulatorSeconds = 0
  return publish({
    sceneKey: String(args.sceneKey || ''),
    ownerSourceSignature,
    sourceSignature,
    phase: 'stopped',
    world,
    staticColliderCount: colliders.length,
    dirty: preserveDirty,
  })
}

export function attachXrPhysicsBody(args: {
  subjectId: string
  patch?: XrPhysicsBodyPatch
}): XrPhysicsRuntimeSnapshot {
  const subjectId = String(args.subjectId || '').trim()
  const seed = activeSubjects.find(subject => subject.subjectId === subjectId)
  if (!seed || bodyById(subjectId) || !validBodyPatch(args.patch)) return snapshot
  const bodies = [...snapshot.world.bodies, createXrPhysicsBodyConfig(seed, args.patch)]
  return replaceWorld(readXrPhysicsWorld({ ...serializeXrPhysicsWorld(snapshot.world), bodies }, activeSubjects), true)
}

export function configureXrPhysicsBody(
  subjectId: string,
  patch: XrPhysicsBodyPatch,
): XrPhysicsRuntimeSnapshot {
  const existing = bodyById(subjectId)
  if (!existing || !validBodyPatch(patch)) return snapshot
  const bodies = snapshot.world.bodies.map(body => (
    body.subjectId === existing.subjectId ? patchXrPhysicsBodyConfig(body, patch) : body
  ))
  return replaceWorld(readXrPhysicsWorld({ ...serializeXrPhysicsWorld(snapshot.world), bodies }, activeSubjects), true)
}

export function detachXrPhysicsBody(subjectIdValue: string): XrPhysicsRuntimeSnapshot {
  const subjectId = String(subjectIdValue || '').trim()
  if (!bodyById(subjectId)) return snapshot
  const bodies = snapshot.world.bodies.filter(body => body.subjectId !== subjectId)
  return replaceWorld(readXrPhysicsWorld({ ...serializeXrPhysicsWorld(snapshot.world), bodies }, activeSubjects), true)
}

export function configureXrPhysicsWorld(patch: XrPhysicsWorldPatch): XrPhysicsRuntimeSnapshot {
  if (!validWorldPatch(patch)) return snapshot
  const persisted = serializeXrPhysicsWorld(snapshot.world)
  const floor = patch.floor ? { ...snapshot.world.floor, ...patch.floor } : snapshot.world.floor
  const world = readXrPhysicsWorld({ ...persisted, ...patch, floor, bodies: snapshot.world.bodies }, activeSubjects)
  return replaceWorld(world, true)
}

export function playXrPhysicsRuntime(): XrPhysicsRuntimeSnapshot {
  if (snapshot.phase === 'playing' || snapshot.world.bodies.length === 0) return snapshot
  if (snapshot.phase === 'stopped') {
    resetXrPhysicsSimulation(simulation, snapshot.world, staticColliders)
    accumulatorSeconds = 0
  }
  return publish({ ...snapshot, phase: 'playing' })
}

export function pauseXrPhysicsRuntime(): XrPhysicsRuntimeSnapshot {
  return snapshot.phase === 'playing'
    ? publish({ ...snapshot, phase: 'paused' })
    : snapshot
}

function stop(resetEvenIfStopped: boolean): XrPhysicsRuntimeSnapshot {
  if (snapshot.phase === 'stopped' && !resetEvenIfStopped) return snapshot
  resetXrPhysicsSimulation(simulation, snapshot.world, staticColliders)
  accumulatorSeconds = 0
  return publish({ ...snapshot, phase: 'stopped' })
}

export function stopXrPhysicsRuntime(): XrPhysicsRuntimeSnapshot {
  return stop(false)
}

export function resetXrPhysicsRuntime(): XrPhysicsRuntimeSnapshot {
  return stop(true)
}

export function stepXrPhysicsRuntime(deltaSecondsValue: number): XrPhysicsRuntimeStepResult {
  if (snapshot.phase !== 'playing') {
    return Object.freeze({
      stepped: false,
      subSteps: 0,
      contactCount: 0,
      elapsedSeconds: simulation.elapsedSeconds,
      events: EMPTY_PHYSICS_EVENTS,
      stepCount: simulation.stepCount,
    })
  }
  const deltaSeconds = Number.isFinite(deltaSecondsValue)
    ? Math.max(0, deltaSecondsValue)
    : 0
  accumulatorSeconds += deltaSeconds
  let subSteps = 0
  let contactCount = 0
  const events: SpatialPhysicsEvent[] = []
  const stepTolerance = snapshot.world.fixedStepSeconds * 1e-9
  while (accumulatorSeconds + stepTolerance >= snapshot.world.fixedStepSeconds
    && subSteps < snapshot.world.maxSubSteps) {
    const result = stepXrPhysicsSimulation({
      simulation,
      world: snapshot.world,
      staticColliders,
      stepSeconds: snapshot.world.fixedStepSeconds,
    })
    accumulatorSeconds = Math.max(0, accumulatorSeconds - snapshot.world.fixedStepSeconds)
    contactCount += result.contactCount
    events.push(...result.events)
    subSteps += 1
  }
  return Object.freeze({
    stepped: subSteps > 0,
    subSteps,
    contactCount,
    elapsedSeconds: simulation.elapsedSeconds,
    events: Object.freeze(events),
    stepCount: simulation.stepCount,
  })
}

export function stepXrPhysicsRuntimeTicks(ticksValue: number): XrPhysicsRuntimeStepResult {
  const ticks = Number(ticksValue)
  if (snapshot.phase === 'stopped' || !Number.isInteger(ticks) || ticks < 1 || ticks > 240) {
    return Object.freeze({
      stepped: false,
      subSteps: 0,
      contactCount: 0,
      elapsedSeconds: simulation.elapsedSeconds,
      events: EMPTY_PHYSICS_EVENTS,
      stepCount: simulation.stepCount,
    })
  }
  let contactCount = 0
  const events: SpatialPhysicsEvent[] = []
  const stepSeconds = snapshot.world.fixedStepSeconds
  const stepTolerance = stepSeconds * 1e-9
  for (let index = 0; index < ticks; index += 1) {
    const result = stepXrPhysicsSimulation({ simulation, world: snapshot.world, staticColliders, stepSeconds })
    if (accumulatorSeconds + stepTolerance >= stepSeconds) {
      accumulatorSeconds = Math.max(0, accumulatorSeconds - stepSeconds)
    }
    contactCount += result.contactCount
    events.push(...result.events)
  }
  return Object.freeze({
    stepped: true,
    subSteps: ticks,
    contactCount,
    elapsedSeconds: simulation.elapsedSeconds,
    events: Object.freeze(events),
    stepCount: simulation.stepCount,
  })
}

export function applyXrPhysicsImpulse(subjectIdValue: string, impulse: XrPhysicsVector): boolean {
  if (snapshot.phase === 'stopped' || !finiteVector(impulse)) return false
  const body = bodyById(subjectIdValue)
  return body ? applyXrPhysicsSimulationImpulse(simulation, body, impulse) : false
}

export function setXrPhysicsKinematicPose(
  subjectIdValue: string,
  position: XrPhysicsVector,
  velocity: XrPhysicsVector = [0, 0, 0],
): boolean {
  const body = bodyById(subjectIdValue)
  return body?.mode === 'kinematic' && finiteVector(position) && finiteVector(velocity)
    ? setXrPhysicsSimulationBodyPose(simulation, body.subjectId, position, velocity)
    : false
}
