import {
  dotSpatialVectors,
  findSpatialCollision,
  findSweptSpatialCuboidHit,
  placeSpatialShape,
  scaleSpatialVector,
  spatialShapeGroundContactTime,
  spatialShapeHighestY,
  spatialShapeLowestY,
  subtractSpatialVectors,
  type SpatialCollisionManifold,
  type SpatialSweptHit,
  type SpatialWorldShape,
} from './spatialPhysicsGeometry'
import type {
  SpatialBodyMotion,
  SpatialColliderSnapshot,
  SpatialGroundSnapshot,
  SpatialInteractionSnapshot,
  SpatialPhysicsEvent,
  SpatialVector,
} from './spatialPhysicsTypes'

export type MutableSpatialBody = {
  id: string
  motion: SpatialBodyMotion
  position: [number, number, number]
  linearVelocity: [number, number, number]
  mass: number
  linearDamping: number
  grounded: boolean
  contactIds: Set<string>
  sweepStartPosition: [number, number, number] | null
  startOverlapResolved: boolean
}

export type SpatialStepState = {
  bodies: Map<string, MutableSpatialBody>
  colliders: Map<string, SpatialColliderSnapshot>
  ground: SpatialGroundSnapshot | null
  gravity: SpatialVector
  activeInteractions: Map<string, SpatialInteractionSnapshot>
  pendingEvents: SpatialPhysicsEvent[]
  tick: number
}

type PairPotential = Readonly<{
  kind: 'pair'
  left: SpatialColliderSnapshot
  right: SpatialColliderSnapshot
  key: string
}>

type GroundPotential = Readonly<{
  kind: 'ground'
  collider: SpatialColliderSnapshot
  key: string
}>

type Potential = PairPotential | GroundPotential

type PairCollision = Readonly<{
  time: number
  manifold: SpatialCollisionManifold | null
  sweep: SpatialSweptHit | null
  startedOverlapping: boolean
}>

const SEPARATION_EPSILON = 0
const CONTACT_DRAG_RATE = 10
const START_PENETRATION_TOLERANCE = 1e-10
const RESTING_GROUND_CONTACT_TOLERANCE = 1e-9

export function compareSpatialIds(leftValue: string, rightValue: string): number {
  const left = String(leftValue)
  const right = String(rightValue)
  return left < right ? -1 : left > right ? 1 : 0
}

export function spatialLayersInteract(
  left: Pick<SpatialColliderSnapshot, 'collisionLayer' | 'collisionMask'>,
  right: Pick<SpatialColliderSnapshot, 'collisionLayer' | 'collisionMask'>,
): boolean {
  return ((left.collisionLayer & right.collisionMask) >>> 0) !== 0
    && ((right.collisionLayer & left.collisionMask) >>> 0) !== 0
}

function mutableVector(value: SpatialVector): [number, number, number] {
  return [value[0], value[1], value[2]]
}

export function spatialInteractionIdentity(leftId: string, rightId: string): readonly [string, string, string] {
  const ordered = compareSpatialIds(leftId, rightId) <= 0
    ? [leftId, rightId] as const
    : [rightId, leftId] as const
  return [`${ordered[0].length}:${ordered[0]}|${ordered[1]}`, ordered[0], ordered[1]]
}

function interaction(
  leftColliderId: string,
  leftBodyId: string | null,
  rightColliderId: string,
  rightBodyId: string | null,
  sensor: boolean,
): readonly [string, SpatialInteractionSnapshot] {
  const [key, firstColliderId, secondColliderId] = spatialInteractionIdentity(leftColliderId, rightColliderId)
  const leftFirst = firstColliderId === leftColliderId
  return [key, {
    colliderIds: [firstColliderId, secondColliderId],
    bodyIds: leftFirst ? [leftBodyId, rightBodyId] : [rightBodyId, leftBodyId],
    sensor,
  }]
}

function bodyShape(
  body: MutableSpatialBody,
  collider: SpatialColliderSnapshot,
  position: SpatialVector = body.position,
): SpatialWorldShape {
  return placeSpatialShape(collider.shape, position)
}

function inverseMass(body: MutableSpatialBody): number {
  return body.motion === 'dynamic' ? 1 / body.mass : 0
}

function pairCollision(
  state: SpatialStepState,
  potential: PairPotential,
  starts: ReadonlyMap<string, SpatialVector>,
): PairCollision | null {
  const leftBody = state.bodies.get(potential.left.bodyId)!
  const rightBody = state.bodies.get(potential.right.bodyId)!
  const leftStart = bodyShape(leftBody, potential.left, starts.get(leftBody.id)!)
  const rightStart = bodyShape(rightBody, potential.right, starts.get(rightBody.id)!)
  const startManifold = findSpatialCollision(leftStart, rightStart)
  if (startManifold) {
    const startedOverlapping = startManifold.penetration > START_PENETRATION_TOLERANCE
    if (!startedOverlapping) {
      const leftEnd = bodyShape(leftBody, potential.left)
      const rightEnd = bodyShape(rightBody, potential.right)
      if (!findSpatialCollision(leftEnd, rightEnd)) return null
    }
    return {
      time: 0,
      manifold: startManifold,
      sweep: null,
      startedOverlapping,
    }
  }
  const leftEnd = bodyShape(leftBody, potential.left)
  const rightEnd = bodyShape(rightBody, potential.right)
  if (leftStart.kind === 'cuboid' && leftEnd.kind === 'cuboid'
    && rightStart.kind === 'cuboid' && rightEnd.kind === 'cuboid') {
    const sweep = findSweptSpatialCuboidHit(leftStart, leftEnd, rightStart, rightEnd)
    if (sweep) return { time: sweep.time, manifold: null, sweep, startedOverlapping: false }
  }
  const manifold = findSpatialCollision(leftEnd, rightEnd)
  return manifold
    ? { time: 1, manifold, sweep: null, startedOverlapping: false }
    : null
}

function groundCollisionTime(
  state: SpatialStepState,
  potential: GroundPotential,
  starts: ReadonlyMap<string, SpatialVector>,
): number | null {
  const body = state.bodies.get(potential.collider.bodyId)!
  const start = bodyShape(body, potential.collider, starts.get(body.id)!)
  const end = bodyShape(body, potential.collider)
  const height = state.ground!.height
  if (potential.collider.sensor) {
    const startLow = spatialShapeLowestY(start)
    const startHigh = spatialShapeHighestY(start)
    const endLow = spatialShapeLowestY(end)
    const endHigh = spatialShapeHighestY(end)
    if (startLow <= height && startHigh >= height) return 0
    if (endLow <= height && endHigh >= height) return 1
    if (startLow > height && endHigh < height) {
      return (startLow - height) / (startLow - endLow)
    }
    if (startHigh < height && endLow > height) {
      return (height - startHigh) / (endHigh - startHigh)
    }
    return null
  }
  const time = spatialShapeGroundContactTime(start, end, height)
  if (time !== null) return time
  return state.activeInteractions.has(potential.key)
    && Math.abs(spatialShapeLowestY(end) - height) <= RESTING_GROUND_CONTACT_TOLERANCE
    ? 0
    : null
}

function potentialTime(
  state: SpatialStepState,
  potential: Potential,
  starts: ReadonlyMap<string, SpatialVector>,
): number {
  if (potential.kind === 'ground') {
    return groundCollisionTime(state, potential, starts) ?? Number.POSITIVE_INFINITY
  }
  return pairCollision(state, potential, starts)?.time ?? Number.POSITIVE_INFINITY
}

function moveDynamicBodyToTime(
  body: MutableSpatialBody,
  start: SpatialVector,
  time: number,
): void {
  if (body.motion !== 'dynamic') return
  for (let axis = 0; axis < 3; axis += 1) {
    body.position[axis] = start[axis] + (body.position[axis] - start[axis]) * time
  }
}

function applyPairImpulse(
  left: MutableSpatialBody,
  right: MutableSpatialBody,
  normal: SpatialVector,
  leftCollider: SpatialColliderSnapshot,
  rightCollider: SpatialColliderSnapshot,
  contactSeconds: number,
): void {
  const leftInverseMass = inverseMass(left)
  const rightInverseMass = inverseMass(right)
  const inverseMassSum = leftInverseMass + rightInverseMass
  if (!(inverseMassSum > 0)) return
  const relativeVelocity = subtractSpatialVectors(right.linearVelocity, left.linearVelocity)
  const normalVelocity = dotSpatialVectors(relativeVelocity, normal)
  if (normalVelocity < 0) {
    const restitution = Math.max(leftCollider.restitution, rightCollider.restitution)
    const impulse = -(1 + restitution) * normalVelocity / inverseMassSum
    for (let axis = 0; axis < 3; axis += 1) {
      left.linearVelocity[axis] -= impulse * leftInverseMass * normal[axis]
      right.linearVelocity[axis] += impulse * rightInverseMass * normal[axis]
    }
  }
  const afterNormal = subtractSpatialVectors(right.linearVelocity, left.linearVelocity)
  const tangent = subtractSpatialVectors(afterNormal, scaleSpatialVector(normal, dotSpatialVectors(afterNormal, normal)))
  const drag = Math.exp(
    -Math.sqrt(leftCollider.friction * rightCollider.friction) * CONTACT_DRAG_RATE * Math.max(0, contactSeconds),
  )
  for (let axis = 0; axis < 3; axis += 1) {
    const tangentImpulse = tangent[axis] * (drag - 1) / inverseMassSum
    left.linearVelocity[axis] -= tangentImpulse * leftInverseMass
    right.linearVelocity[axis] += tangentImpulse * rightInverseMass
  }
}

function resolvePair(
  state: SpatialStepState,
  potential: PairPotential,
  collision: PairCollision,
  starts: ReadonlyMap<string, SpatialVector>,
  stepSeconds: number,
): void {
  const left = state.bodies.get(potential.left.bodyId)!
  const right = state.bodies.get(potential.right.bodyId)!
  left.contactIds.add(potential.right.id)
  right.contactIds.add(potential.left.id)
  if (potential.left.sensor || potential.right.sensor) return
  const leftInverseMass = inverseMass(left)
  const rightInverseMass = inverseMass(right)
  const inverseMassSum = leftInverseMass + rightInverseMass
  if (!(inverseMassSum > 0)) return
  if (collision.startedOverlapping) {
    if (left.motion === 'dynamic' && !left.startOverlapResolved) {
      left.position.splice(0, 3, ...starts.get(left.id)!)
      left.startOverlapResolved = true
    }
    if (right.motion === 'dynamic' && !right.startOverlapResolved) {
      right.position.splice(0, 3, ...starts.get(right.id)!)
      right.startOverlapResolved = true
    }
  } else if (collision.sweep) {
    moveDynamicBodyToTime(left, starts.get(left.id)!, collision.time)
    moveDynamicBodyToTime(right, starts.get(right.id)!, collision.time)
  }
  const currentManifold = findSpatialCollision(
    bodyShape(left, potential.left),
    bodyShape(right, potential.right),
  )
  const normal = collision.sweep?.normal ?? currentManifold?.normal ?? collision.manifold!.normal
  const correction = (currentManifold?.penetration ?? 0) + SEPARATION_EPSILON
  for (let axis = 0; axis < 3; axis += 1) {
    left.position[axis] -= normal[axis] * correction * leftInverseMass / inverseMassSum
    right.position[axis] += normal[axis] * correction * rightInverseMass / inverseMassSum
  }
  if (normal[1] < -0.5 && left.motion === 'dynamic') left.grounded = true
  if (normal[1] > 0.5 && right.motion === 'dynamic') right.grounded = true
  applyPairImpulse(
    left, right, normal, potential.left, potential.right,
    (1 - collision.time) * stepSeconds,
  )
}

function resolveGround(
  state: SpatialStepState,
  potential: GroundPotential,
  time: number,
  starts: ReadonlyMap<string, SpatialVector>,
  stepSeconds: number,
): void {
  const body = state.bodies.get(potential.collider.bodyId)!
  body.contactIds.add(state.ground!.id)
  if (potential.collider.sensor || body.motion !== 'dynamic') return
  const start = starts.get(body.id)!
  const startedPenetrating = spatialShapeLowestY(bodyShape(body, potential.collider, start))
    < state.ground!.height - START_PENETRATION_TOLERANCE
  if (time > 0) {
    moveDynamicBodyToTime(body, start, time)
  } else if (startedPenetrating) {
    if (!body.startOverlapResolved) {
      body.position.splice(0, 3, ...start)
      body.startOverlapResolved = true
    }
  }
  const currentShape = bodyShape(body, potential.collider)
  body.position[1] += state.ground!.height - spatialShapeLowestY(currentShape) + SEPARATION_EPSILON
  if (body.linearVelocity[1] < 0) {
    const restitution = Math.max(potential.collider.restitution, state.ground!.restitution)
    body.linearVelocity[1] = -body.linearVelocity[1] * restitution
  }
  const drag = Math.exp(
    -Math.sqrt(potential.collider.friction * state.ground!.friction)
    * CONTACT_DRAG_RATE * Math.max(0, (1 - time) * stepSeconds),
  )
  body.linearVelocity[0] *= drag
  body.linearVelocity[2] *= drag
  body.grounded = true
}

function recordInteraction(
  state: SpatialStepState,
  next: Map<string, SpatialInteractionSnapshot>,
  potential: Potential,
): void {
  if (potential.kind === 'ground') {
    const [key, value] = interaction(
      potential.collider.id, potential.collider.bodyId, state.ground!.id, null, potential.collider.sensor,
    )
    next.set(key, value)
    return
  }
  const [key, value] = interaction(
    potential.left.id, potential.left.bodyId, potential.right.id, potential.right.bodyId,
    potential.left.sensor || potential.right.sensor,
  )
  next.set(key, value)
}

function publishInteractionEvents(
  state: SpatialStepState,
  next: Map<string, SpatialInteractionSnapshot>,
): void {
  const changes: Array<Readonly<{ key: string; began: boolean; value: SpatialInteractionSnapshot }>> = []
  for (const [key, value] of next) {
    if (!state.activeInteractions.has(key)) changes.push({ key, began: true, value })
  }
  for (const [key, value] of state.activeInteractions) {
    if (!next.has(key)) changes.push({ key, began: false, value })
  }
  changes.sort((left, right) => compareSpatialIds(left.key, right.key)
    || Number(right.began) - Number(left.began))
  for (const change of changes) {
    state.pendingEvents.push(Object.freeze({
      kind: `${change.value.sensor ? 'sensor' : 'collision'}-${change.began ? 'began' : 'ended'}`,
      tick: state.tick,
      colliderIds: change.value.colliderIds,
      bodyIds: change.value.bodyIds,
    }))
  }
  state.activeInteractions = next
}

export function stepSpatialPhysicsState(state: SpatialStepState, stepSeconds: number): void {
  state.tick += 1
  const starts = new Map<string, SpatialVector>()
  const bodies = [...state.bodies.values()].sort((left, right) => compareSpatialIds(left.id, right.id))
  for (const body of bodies) {
    starts.set(body.id, mutableVector(body.sweepStartPosition ?? body.position))
    body.sweepStartPosition = null
    body.contactIds.clear()
    body.grounded = false
    body.startOverlapResolved = false
    if (body.motion !== 'dynamic') continue
    const damping = Math.exp(-body.linearDamping * stepSeconds)
    for (let axis = 0; axis < 3; axis += 1) {
      body.linearVelocity[axis] = (body.linearVelocity[axis] + state.gravity[axis] * stepSeconds) * damping
      body.position[axis] += body.linearVelocity[axis] * stepSeconds
    }
  }

  const colliders = [...state.colliders.values()].sort((left, right) => compareSpatialIds(left.id, right.id))
  const potentials: Potential[] = []
  for (let leftIndex = 0; leftIndex < colliders.length; leftIndex += 1) {
    const left = colliders[leftIndex]!
    const leftBody = state.bodies.get(left.bodyId)!
    if (state.ground?.enabled && leftBody.motion !== 'static' && spatialLayersInteract(left, state.ground)) {
      potentials.push({ kind: 'ground', collider: left, key: spatialInteractionIdentity(left.id, state.ground.id)[0] })
    }
    for (let rightIndex = leftIndex + 1; rightIndex < colliders.length; rightIndex += 1) {
      const right = colliders[rightIndex]!
      if (left.bodyId === right.bodyId || !spatialLayersInteract(left, right)) continue
      potentials.push({ kind: 'pair', left, right, key: spatialInteractionIdentity(left.id, right.id)[0] })
    }
  }

  const nextInteractions = new Map<string, SpatialInteractionSnapshot>()
  // Contact times depend on start/end positions, not velocities. Keep them for
  // this step and re-evaluate only contacts incident to a body moved by resolution.
  // Sorting with narrow-phase calls repeated the same geometry work for every
  // comparator and again after each unrelated contact in a terrain-heavy scene.
  const scheduled = potentials.map(potential => ({ potential, time: potentialTime(state, potential, starts) }))
  while (scheduled.length) {
    let first = 0
    for (let index = 1; index < scheduled.length; index += 1) {
      const candidate = scheduled[index]!, current = scheduled[first]!
      if (candidate.time < current.time || (candidate.time === current.time
        && compareSpatialIds(candidate.potential.key, current.potential.key) < 0)) first = index
    }
    const { potential, time } = scheduled.splice(first, 1)[0]!
    if (!Number.isFinite(time)) break
    const affected = (potential.kind === 'ground'
      ? [potential.collider.bodyId] : [potential.left.bodyId, potential.right.bodyId])
      .map(id => ({ body: state.bodies.get(id)!, position: mutableVector(state.bodies.get(id)!.position) }))
    recordInteraction(state, nextInteractions, potential)
    if (potential.kind === 'ground') {
      resolveGround(state, potential, time, starts, stepSeconds)
    } else {
      const collision = pairCollision(state, potential, starts)
      if (collision) resolvePair(state, potential, collision, starts, stepSeconds)
    }
    const moved = new Set(affected.filter(({ body, position }) =>
      position.some((value, axis) => value !== body.position[axis]),
    ).map(({ body }) => body.id))
    if (moved.size) for (const entry of scheduled) {
      const contact = entry.potential
      if (contact.kind === 'ground' ? moved.has(contact.collider.bodyId)
        : moved.has(contact.left.bodyId) || moved.has(contact.right.bodyId)) {
        entry.time = potentialTime(state, contact, starts)
      }
    }
  }
  publishInteractionEvents(state, nextInteractions)
}
