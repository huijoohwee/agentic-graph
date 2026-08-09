import { SpatialPhysicsEngine } from '../physics/spatialPhysicsEngine'
import type {
  SpatialBodySpec,
  SpatialColliderSpec,
  SpatialGroundSpec,
  SpatialPhysicsEvent,
  SpatialVector,
} from '../physics/spatialPhysicsTypes'
import {
  compareXrPhysicsIds,
  xrPhysicsWorldSignature,
  type XrPhysicsBodyConfig,
  type XrPhysicsStaticCollider,
  type XrPhysicsVector,
  type XrPhysicsWorldConfig,
} from './xrPhysicsModel'

type XrBodyBinding = Readonly<{
  bodyId: string
  halfHeight: number
}>

type XrPendingPose = Readonly<{
  startPosition: SpatialVector
  position: SpatialVector
  velocity: SpatialVector
}>

export type XrPhysicsBodyState = Readonly<{
  subjectId: string
  position: XrPhysicsVector
  velocity: XrPhysicsVector
  grounded: boolean
  contacts: readonly string[]
}>

export type XrPhysicsSimulation = {
  engine: SpatialPhysicsEngine
  elapsedSeconds: number
  stepCount: number
  bindings: Map<string, XrBodyBinding>
  contactLabels: Map<string, string>
  fixedStepSeconds: number
  pendingPoses: Map<string, XrPendingPose>
  staticColliders: readonly XrPhysicsStaticCollider[]
  staticSignature: string
  worldSignature: string
}

export type XrPhysicsStepResult = Readonly<{
  stepped: boolean
  contactCount: number
  elapsedSeconds: number
  events: readonly SpatialPhysicsEvent[]
  stepCount: number
}>

function freezeSpatialPhysicsEvents(
  events: readonly SpatialPhysicsEvent[],
): readonly SpatialPhysicsEvent[] {
  return Object.freeze(events.map(event => Object.freeze({
    ...event,
    colliderIds: Object.freeze([...event.colliderIds]) as SpatialPhysicsEvent['colliderIds'],
    bodyIds: Object.freeze([...event.bodyIds]) as SpatialPhysicsEvent['bodyIds'],
  })))
}

function internalId(kind: 'body' | 'body-collider' | 'static-body' | 'static-collider', externalId: string): string {
  return `xr/${kind}/${encodeURIComponent(externalId)}`
}

function bodyCenter(position: XrPhysicsVector, halfHeight: number): SpatialVector {
  return [position[0], position[1] + halfHeight, position[2]]
}

function bottomPosition(position: SpatialVector, halfHeight: number): XrPhysicsVector {
  return Object.freeze([position[0], position[1] - halfHeight, position[2]]) as XrPhysicsVector
}

function halfExtents(size: XrPhysicsVector): SpatialVector {
  return [size[0] / 2, size[1] / 2, size[2] / 2]
}

function motion(config: XrPhysicsBodyConfig): SpatialBodySpec['motion'] {
  if (config.mode === 'dynamic') return 'dynamic'
  if (config.mode === 'kinematic' || config.mode === 'trigger') return 'kinematic'
  return 'static'
}

function orderedStaticColliders(
  colliders: readonly XrPhysicsStaticCollider[],
): readonly XrPhysicsStaticCollider[] {
  return Object.freeze([...colliders].sort((left, right) => compareXrPhysicsIds(left.id, right.id)))
}

function colliderSignature(colliders: readonly XrPhysicsStaticCollider[]): string {
  return JSON.stringify(colliders.map(collider => [
    collider.id,
    collider.center,
    collider.sizeMeters,
    collider.friction,
    collider.restitution,
    collider.collisionGroup,
    collider.collisionMask,
    collider.trigger,
  ]))
}

function bodySpecs(
  world: XrPhysicsWorldConfig,
  previous?: XrPhysicsSimulation,
): readonly SpatialBodySpec[] {
  return world.bodies.map(config => {
    const binding = previous?.bindings.get(config.subjectId)
    const state = binding ? previous?.engine.readBody(binding.bodyId) : null
    const pendingPose = previous?.pendingPoses.get(config.subjectId)
    const halfHeight = config.sizeMeters[1] / 2
    const preservedCenter = pendingPose?.startPosition ?? state?.position
    const position = preservedCenter && binding
      ? [preservedCenter[0], preservedCenter[1] - binding.halfHeight + halfHeight, preservedCenter[2]] as const
      : bodyCenter(config.spawnPosition, halfHeight)
    return {
      id: internalId('body', config.subjectId),
      motion: motion(config),
      position,
      linearVelocity: state?.linearVelocity ?? config.initialVelocity,
      mass: config.mass,
      linearDamping: config.linearDamping,
    }
  })
}

function dynamicColliderSpecs(world: XrPhysicsWorldConfig): readonly SpatialColliderSpec[] {
  return world.bodies.map(config => ({
    id: internalId('body-collider', config.subjectId),
    bodyId: internalId('body', config.subjectId),
    shape: {
      kind: 'cuboid' as const,
      halfSize: halfExtents(config.sizeMeters),
    },
    sensor: config.mode === 'trigger',
    collisionLayer: config.collisionGroup,
    collisionMask: config.collisionMask,
    friction: config.friction,
    restitution: config.restitution,
  }))
}

function staticBodySpecs(colliders: readonly XrPhysicsStaticCollider[]): readonly SpatialBodySpec[] {
  return colliders.map(collider => ({
    id: internalId('static-body', collider.id),
    motion: 'static',
    position: collider.center,
  }))
}

function staticColliderSpecs(colliders: readonly XrPhysicsStaticCollider[]): readonly SpatialColliderSpec[] {
  return colliders.map(collider => ({
    id: internalId('static-collider', collider.id),
    bodyId: internalId('static-body', collider.id),
    shape: {
      kind: 'cuboid' as const,
      halfSize: halfExtents(collider.sizeMeters),
    },
    sensor: collider.trigger,
    collisionLayer: collider.collisionGroup,
    collisionMask: collider.collisionMask,
    friction: collider.friction,
    restitution: collider.restitution,
  }))
}

function groundSpec(world: XrPhysicsWorldConfig): SpatialGroundSpec {
  return {
    id: 'xr/floor',
    enabled: world.floor.enabled,
    height: world.floor.height,
    collisionLayer: world.floor.collisionGroup,
    collisionMask: world.floor.collisionMask,
    friction: world.floor.friction,
    restitution: world.floor.restitution,
  }
}

type XrSpatialEngineState = Pick<
  XrPhysicsSimulation,
  'engine' | 'bindings' | 'contactLabels' | 'fixedStepSeconds' | 'staticColliders' | 'staticSignature' | 'worldSignature'
>

function createEngineState(
  world: XrPhysicsWorldConfig,
  staticColliders: readonly XrPhysicsStaticCollider[],
  previous?: XrPhysicsSimulation,
  fixedStepSeconds = world.fixedStepSeconds,
): XrSpatialEngineState {
  const ordered = orderedStaticColliders(staticColliders)
  const engine = new SpatialPhysicsEngine({
    fixedStepSeconds,
    maxSubSteps: world.maxSubSteps,
    gravity: world.gravity,
    ground: groundSpec(world),
    bodies: [...bodySpecs(world, previous), ...staticBodySpecs(ordered)],
    colliders: [...dynamicColliderSpecs(world), ...staticColliderSpecs(ordered)],
  })
  previous?.pendingPoses.forEach((pose, subjectId) => {
    const binding = previous.bindings.get(subjectId)
    const nextBody = world.bodies.find(body => body.subjectId === subjectId)
    if (binding && nextBody) {
      const halfHeightOffset = nextBody.sizeMeters[1] / 2 - binding.halfHeight
      engine.setBodyPose(binding.bodyId, [
        pose.position[0], pose.position[1] + halfHeightOffset, pose.position[2],
      ], pose.velocity)
    }
  })
  return {
    engine,
    bindings: new Map(world.bodies.map(config => [config.subjectId, {
      bodyId: internalId('body', config.subjectId),
      halfHeight: config.sizeMeters[1] / 2,
    }])),
    contactLabels: new Map([
      ['xr/floor', 'floor'],
      ...world.bodies.map(config => [internalId('body-collider', config.subjectId), config.subjectId] as const),
      ...ordered.map(collider => [internalId('static-collider', collider.id), collider.id] as const),
    ]),
    fixedStepSeconds,
    staticColliders: ordered,
    staticSignature: colliderSignature(ordered),
    worldSignature: xrPhysicsWorldSignature(world),
  }
}

function replaceEngine(
  simulation: XrPhysicsSimulation,
  world: XrPhysicsWorldConfig,
  staticColliders: readonly XrPhysicsStaticCollider[],
  preserveBodyState: boolean,
  fixedStepSeconds = world.fixedStepSeconds,
): void {
  Object.assign(simulation, createEngineState(
    world,
    staticColliders,
    preserveBodyState ? simulation : undefined,
    fixedStepSeconds,
  ))
}

export function createXrPhysicsSimulation(
  world: XrPhysicsWorldConfig,
  staticColliders: readonly XrPhysicsStaticCollider[] = [],
): XrPhysicsSimulation {
  return {
    ...createEngineState(world, staticColliders),
    elapsedSeconds: 0,
    pendingPoses: new Map(),
    stepCount: 0,
  }
}

export function resetXrPhysicsSimulation(
  simulation: XrPhysicsSimulation,
  world: XrPhysicsWorldConfig,
  staticColliders: readonly XrPhysicsStaticCollider[] = simulation.staticColliders,
): void {
  simulation.pendingPoses.clear()
  replaceEngine(simulation, world, staticColliders, false)
  simulation.elapsedSeconds = 0
  simulation.stepCount = 0
}

export function readXrPhysicsSimulationBody(
  simulation: XrPhysicsSimulation,
  subjectIdValue: string,
): XrPhysicsBodyState | null {
  const subjectId = String(subjectIdValue || '').trim()
  const binding = simulation.bindings.get(subjectId)
  const state = binding ? simulation.engine.readBody(binding.bodyId) : null
  if (!state || !binding) return null
  const contacts = [...new Set(state.contactIds
    .map(contactId => simulation.contactLabels.get(contactId))
    .filter((contact): contact is string => Boolean(contact)))]
    .sort(compareXrPhysicsIds)
  return Object.freeze({
    subjectId,
    position: bottomPosition(state.position, binding.halfHeight),
    velocity: Object.freeze([...state.linearVelocity]) as XrPhysicsVector,
    grounded: state.grounded,
    contacts: Object.freeze(contacts),
  })
}

export function captureXrPhysicsSimulation(
  simulation: XrPhysicsSimulation,
): readonly XrPhysicsBodyState[] {
  return Object.freeze([...simulation.bindings.keys()].sort(compareXrPhysicsIds)
    .map(subjectId => readXrPhysicsSimulationBody(simulation, subjectId)!))
}

function synchronizeEngineConfiguration(
  simulation: XrPhysicsSimulation,
  world: XrPhysicsWorldConfig,
  colliders: readonly XrPhysicsStaticCollider[] | undefined,
  fixedStepSeconds: number,
): void {
  const ordered = colliders ? orderedStaticColliders(colliders) : simulation.staticColliders
  const signature = colliderSignature(ordered)
  const worldSignature = xrPhysicsWorldSignature(world)
  if (signature !== simulation.staticSignature
    || worldSignature !== simulation.worldSignature
    || fixedStepSeconds !== simulation.fixedStepSeconds) {
    replaceEngine(simulation, world, ordered, true, fixedStepSeconds)
  }
}

export function stepXrPhysicsSimulation(args: {
  simulation: XrPhysicsSimulation
  world: XrPhysicsWorldConfig
  staticColliders?: readonly XrPhysicsStaticCollider[]
  stepSeconds?: number
}): XrPhysicsStepResult {
  const stepSeconds = Number.isFinite(args.stepSeconds) && Number(args.stepSeconds) > 0
    ? Math.min(Number(args.stepSeconds), 1 / 15)
    : args.world.fixedStepSeconds
  synchronizeEngineConfiguration(args.simulation, args.world, args.staticColliders, stepSeconds)
  args.simulation.engine.stepFixed()
  const boundBodyIds = new Set([...args.simulation.bindings.values()].map(binding => binding.bodyId))
  const contactCount = args.simulation.engine.captureSnapshot().activeInteractions
    .filter(interaction => interaction.bodyIds.some(bodyId => bodyId !== null && boundBodyIds.has(bodyId)))
    .length
  const events = freezeSpatialPhysicsEvents(args.simulation.engine.drainEvents())
  args.simulation.pendingPoses.clear()
  args.simulation.elapsedSeconds += stepSeconds
  args.simulation.stepCount += 1
  return Object.freeze({
    stepped: true,
    contactCount,
    elapsedSeconds: args.simulation.elapsedSeconds,
    events,
    stepCount: args.simulation.stepCount,
  })
}

export function applyXrPhysicsSimulationImpulse(
  simulation: XrPhysicsSimulation,
  config: XrPhysicsBodyConfig,
  impulse: XrPhysicsVector,
): boolean {
  if (config.mode !== 'dynamic' || !Array.isArray(impulse) || !impulse.every(Number.isFinite)) return false
  const binding = simulation.bindings.get(config.subjectId)
  return binding ? simulation.engine.applyImpulse(binding.bodyId, impulse) : false
}

export function setXrPhysicsSimulationBodyPose(
  simulation: XrPhysicsSimulation,
  subjectIdValue: string,
  position: XrPhysicsVector,
  velocity: XrPhysicsVector = [0, 0, 0],
  options: Readonly<{ teleport?: boolean }> = {},
): boolean {
  const subjectId = String(subjectIdValue || '').trim()
  const binding = simulation.bindings.get(subjectId)
  if (!binding || !Array.isArray(position) || position.length < 3
    || !Array.isArray(velocity) || velocity.length < 3
    || !position.every(Number.isFinite) || !velocity.every(Number.isFinite)) return false
  const state = simulation.engine.readBody(binding.bodyId)
  const center = bodyCenter(position, binding.halfHeight)
  const updated = simulation.engine.setBodyPose(
    binding.bodyId,
    center,
    velocity,
    options,
  )
  if (!updated) return false
  if (options.teleport) {
    simulation.pendingPoses.delete(subjectId)
  } else if (state) {
    const pending = simulation.pendingPoses.get(subjectId)
    simulation.pendingPoses.set(subjectId, {
      startPosition: pending?.startPosition ?? state.position,
      position: center,
      velocity: [velocity[0], velocity[1], velocity[2]],
    })
  }
  return true
}
