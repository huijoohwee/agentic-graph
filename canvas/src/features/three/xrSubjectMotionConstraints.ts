import {
  resolveXrMotionReferenceStage,
  sampleXrMotionReferenceFacingY,
  sampleXrMotionReferenceMarks,
  XR_MOTION_REFERENCE_MAX_COORDINATE_METERS,
  type XrMotionReferencePlan,
  type XrMotionReferenceSubject,
  type XrMotionReferenceVector,
} from './xrMotionReferenceModel'
import {
  XR_SUBJECT_STAGE_EDGE_GAP_METERS,
  resolveXrSubjectFootprint,
  resolveXrSubjectPlanarRadius,
  type XrSubjectFootprint,
} from './xrMotionReferenceSubjectPlacement'
import type { XrPhysicsRuntimeFrame, XrPhysicsRuntimeSnapshot } from './xrPhysicsRuntime'
import {
  resolveThreeObjectKeyboardMotionPosition,
  type ThreeKeyboardMovementKey,
} from './threeKeyboardChoreography'

export const XR_SUBJECT_MOTION_COLLISION_GAP_METERS = 0.08

export type XrSubjectMotionResolution = Readonly<{
  position: XrMotionReferenceVector
  status: 'moved' | 'partial' | 'unchanged' | 'physics-owned' | 'obstructed'
}>

type SubjectCollisionTrajectory = Readonly<{
  endPosition: XrMotionReferenceVector
  halfX: number
  halfY: number
  halfZ: number
  startPosition: XrMotionReferenceVector
  subjectId: string
}>

function subjectPositionAtTime(
  plan: XrMotionReferencePlan,
  subjectId: string,
  fallback: XrMotionReferenceVector,
  timeSeconds: number,
): XrMotionReferenceVector {
  const track = plan.cast.find(candidate => candidate.actorId === subjectId)
  return track ? sampleXrMotionReferenceMarks(track.marks, timeSeconds) : fallback
}

function subjectFacingAtTime(
  plan: XrMotionReferencePlan,
  subjectId: string,
  timeSeconds: number,
  proposedMark?: Readonly<{ markId: string; position: XrMotionReferenceVector }>,
): number {
  const track = plan.cast.find(candidate => candidate.actorId === subjectId)
  if (!track) return 0
  const marks = proposedMark?.markId
    ? track.marks.map(mark => mark.id === proposedMark.markId
      ? Object.freeze({ ...mark, position: proposedMark.position })
      : mark)
    : track.marks
  return sampleXrMotionReferenceFacingY(marks, timeSeconds)
}

function peerTrajectories(
  plan: XrMotionReferencePlan,
  movingSubjectId: string,
  startTimeSeconds: number,
  timeSeconds: number,
  physics: XrPhysicsRuntimeSnapshot,
  physicsFrame?: XrPhysicsRuntimeFrame,
): readonly SubjectCollisionTrajectory[] {
  const livePositions = physics.phase === 'stopped'
    ? new Map<string, XrMotionReferenceVector>()
    : new Map(physicsFrame?.bodies.map(body => [body.subjectId, body.position] as const) || [])
  const liveBodies = new Map(physics.world.bodies.map(body => [body.subjectId, body] as const))
  return Object.freeze(plan.subjects
    .filter(subject => subject.id !== movingSubjectId)
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    .map(subject => {
      const startFootprint = resolveXrSubjectFootprint(
        subject,
        subjectFacingAtTime(plan, subject.id, startTimeSeconds),
      )
      const endFootprint = resolveXrSubjectFootprint(
        subject,
        subjectFacingAtTime(plan, subject.id, timeSeconds),
      )
      const livePosition = livePositions.get(subject.id)
      const liveBody = livePosition ? liveBodies.get(subject.id) : null
      return Object.freeze({
        endPosition: livePosition || subjectPositionAtTime(plan, subject.id, subject.position, timeSeconds),
        halfX: liveBody ? liveBody.sizeMeters[0] / 2 : Math.max(startFootprint.halfX, endFootprint.halfX),
        halfY: liveBody ? liveBody.sizeMeters[1] / 2 : Math.max(startFootprint.halfY, endFootprint.halfY),
        halfZ: liveBody ? liveBody.sizeMeters[2] / 2 : Math.max(startFootprint.halfZ, endFootprint.halfZ),
        startPosition: livePosition || subjectPositionAtTime(plan, subject.id, subject.position, startTimeSeconds),
        subjectId: subject.id,
      })
    }))
}

function insideExpandedPeer(
  position: XrMotionReferenceVector,
  peer: SubjectCollisionTrajectory,
  movingHalfX: number,
  movingHalfY: number,
  movingHalfZ: number,
): boolean {
  return Math.abs(position[0] - peer.endPosition[0]) < peer.halfX + movingHalfX + XR_SUBJECT_MOTION_COLLISION_GAP_METERS
    && Math.abs(position[2] - peer.endPosition[2]) < peer.halfZ + movingHalfZ + XR_SUBJECT_MOTION_COLLISION_GAP_METERS
    && Math.abs((position[1] + movingHalfY) - (peer.endPosition[1] + peer.halfY)) < peer.halfY + movingHalfY + XR_SUBJECT_MOTION_COLLISION_GAP_METERS
}

function segmentEntryTime(
  start: XrMotionReferenceVector,
  end: XrMotionReferenceVector,
  peer: SubjectCollisionTrajectory,
  movingHalfX: number,
  movingHalfY: number,
  movingHalfZ: number,
): number | null {
  const axes = [
    [start[0] - peer.startPosition[0], end[0] - peer.endPosition[0], peer.halfX + movingHalfX + XR_SUBJECT_MOTION_COLLISION_GAP_METERS],
    [(start[1] + movingHalfY) - (peer.startPosition[1] + peer.halfY), (end[1] + movingHalfY) - (peer.endPosition[1] + peer.halfY), peer.halfY + movingHalfY + XR_SUBJECT_MOTION_COLLISION_GAP_METERS],
    [start[2] - peer.startPosition[2], end[2] - peer.endPosition[2], peer.halfZ + movingHalfZ + XR_SUBJECT_MOTION_COLLISION_GAP_METERS],
  ] as const
  const startInside = axes.every(([startValue, _endValue, extent]) => Math.abs(startValue) < extent)
  const endInside = axes.every(([_startValue, endValue, extent]) => Math.abs(endValue) < extent)
  if (startInside) {
    const exitsOutward = axes.some(([startValue, endValue, extent]) => {
      return Math.abs(endValue) >= extent
        && Math.abs(endValue) > Math.abs(startValue)
        && (Math.abs(startValue) < 1e-12 || Math.sign(endValue) === Math.sign(startValue))
    })
    if (!endInside && exitsOutward) return null
    return 0
  }
  let entry = 0
  let exit = 1
  for (const [startValue, endValue, extent] of axes) {
    const delta = endValue - startValue
    if ((startValue <= -extent && delta < 0)
      || (startValue >= extent && delta > 0)) return null
    if (Math.abs(delta) < 1e-12) {
      if (startValue <= -extent || startValue >= extent) return null
      continue
    }
    const first = (-extent - startValue) / delta
    const second = (extent - startValue) / delta
    entry = Math.max(entry, Math.min(first, second))
    exit = Math.min(exit, Math.max(first, second))
    if (entry > exit) return null
  }
  return entry >= 0 && entry <= 1 ? entry : null
}

function sweepAgainstPeers(
  start: XrMotionReferenceVector,
  end: XrMotionReferenceVector,
  peers: readonly SubjectCollisionTrajectory[],
  movingHalfX: number,
  movingHalfY: number,
  movingHalfZ: number,
): Readonly<{ blocked: boolean; position: XrMotionReferenceVector }> {
  let earliestEntry = Number.POSITIVE_INFINITY
  for (const peer of peers) {
    const entry = segmentEntryTime(start, end, peer, movingHalfX, movingHalfY, movingHalfZ)
    if (entry !== null) earliestEntry = Math.min(earliestEntry, entry)
  }
  if (!Number.isFinite(earliestEntry)) return Object.freeze({ blocked: false, position: end })
  const distance = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2])
  const separationRatio = distance > 0 ? Math.min(earliestEntry, 0.001 / distance) : 0
  const ratio = Math.max(0, earliestEntry - separationRatio)
  return Object.freeze({
    blocked: true,
    position: Object.freeze([
      start[0] + (end[0] - start[0]) * ratio,
      start[1] + (end[1] - start[1]) * ratio,
      start[2] + (end[2] - start[2]) * ratio,
    ] as const),
  })
}

function sweepMotionCandidate(input: Readonly<{
  currentFootprint: XrSubjectFootprint
  end: XrMotionReferenceVector
  footprintAt: (position: XrMotionReferenceVector) => XrSubjectFootprint
  peers: readonly SubjectCollisionTrajectory[]
  start: XrMotionReferenceVector
}>): Readonly<{ blocked: boolean; position: XrMotionReferenceVector }> {
  const endpointFootprint = input.footprintAt(input.end)
  let halfX = Math.max(input.currentFootprint.halfX, endpointFootprint.halfX)
  let halfY = Math.max(input.currentFootprint.halfY, endpointFootprint.halfY)
  let halfZ = Math.max(input.currentFootprint.halfZ, endpointFootprint.halfZ)
  let swept = sweepAgainstPeers(input.start, input.end, input.peers, halfX, halfY, halfZ)
  for (let pass = 0; pass < 4 && swept.blocked; pass += 1) {
    const resolvedFootprint = input.footprintAt(swept.position)
    const nextHalfX = Math.max(halfX, resolvedFootprint.halfX)
    const nextHalfY = Math.max(halfY, resolvedFootprint.halfY)
    const nextHalfZ = Math.max(halfZ, resolvedFootprint.halfZ)
    if (nextHalfX === halfX && nextHalfY === halfY && nextHalfZ === halfZ) break
    halfX = nextHalfX
    halfY = nextHalfY
    halfZ = nextHalfZ
    swept = sweepAgainstPeers(input.start, input.end, input.peers, halfX, halfY, halfZ)
  }
  return swept
}

function distanceSquared(left: XrMotionReferenceVector, right: XrMotionReferenceVector): number {
  return (left[0] - right[0]) ** 2 + (left[1] - right[1]) ** 2 + (left[2] - right[2]) ** 2
}

function planarDirectionAlignment(
  left: readonly [number, number],
  right: readonly [number, number],
): number {
  const leftLength = Math.hypot(left[0], left[1])
  const rightLength = Math.hypot(right[0], right[1])
  if (leftLength <= 1e-9 || rightLength <= 1e-9) return 0
  return Math.abs((left[0] * right[0] + left[1] * right[1]) / (leftLength * rightLength))
}

function resolvedMotionStatus(
  start: XrMotionReferenceVector,
  requested: XrMotionReferenceVector,
  resolved: XrMotionReferenceVector,
): XrSubjectMotionResolution['status'] {
  if (distanceSquared(start, resolved) <= 1e-12) {
    return distanceSquared(start, requested) <= 1e-12 ? 'unchanged' : 'obstructed'
  }
  return distanceSquared(requested, resolved) <= 1e-12 ? 'moved' : 'partial'
}

function motionCandidateIsValid(
  position: XrMotionReferenceVector,
  footprint: XrSubjectFootprint,
  peers: readonly SubjectCollisionTrajectory[],
  stageSizeMeters: readonly [number, number],
): boolean {
  const insideStage = position[1] >= 0
    && position[1] <= XR_MOTION_REFERENCE_MAX_COORDINATE_METERS
    && Math.abs(position[0]) + footprint.halfX + XR_SUBJECT_STAGE_EDGE_GAP_METERS <= stageSizeMeters[0] / 2
    && Math.abs(position[2]) + footprint.halfZ + XR_SUBJECT_STAGE_EDGE_GAP_METERS <= stageSizeMeters[1] / 2
  return insideStage && !peers.some(peer => insideExpandedPeer(
    position,
    peer,
    footprint.halfX,
    footprint.halfY,
    footprint.halfZ,
  ))
}

function clampSubjectToStage(
  desiredPosition: XrMotionReferenceVector,
  stageSizeMeters: readonly [number, number],
  halfX: number,
  halfZ: number,
  edgeGap: number,
): XrMotionReferenceVector {
  const maxX = Math.max(0, stageSizeMeters[0] / 2 - halfX - edgeGap)
  const maxZ = Math.max(0, stageSizeMeters[1] / 2 - halfZ - edgeGap)
  return Object.freeze([
    Math.max(-maxX, Math.min(maxX, desiredPosition[0])),
    Math.min(XR_MOTION_REFERENCE_MAX_COORDINATE_METERS, Math.max(0, desiredPosition[1])),
    Math.max(-maxZ, Math.min(maxZ, desiredPosition[2])),
  ] as const)
}

function resolveStageLimitedSubjectMotion(input: Readonly<{
  desiredPosition: XrMotionReferenceVector
  markId?: string
  plan: XrMotionReferencePlan
  stageSizeMeters: readonly [number, number]
  subject: XrMotionReferenceSubject
  timeSeconds: number
}>): Readonly<{ desired: XrMotionReferenceVector; footprint: XrSubjectFootprint }> {
  let desired = input.desiredPosition
  let footprint = resolveXrSubjectFootprint(input.subject)
  let converged = false
  for (let iteration = 0; iteration < 12; iteration += 1) {
    footprint = resolveXrSubjectFootprint(
      input.subject,
      subjectFacingAtTime(input.plan, input.subject.id, input.timeSeconds, input.markId
        ? { markId: input.markId, position: desired }
        : undefined),
    )
    const next = clampSubjectToStage(
      input.desiredPosition,
      input.stageSizeMeters,
      footprint.halfX,
      footprint.halfZ,
      XR_SUBJECT_STAGE_EDGE_GAP_METERS,
    )
    if (distanceSquared(desired, next) <= 1e-12) {
      desired = next
      converged = true
      break
    }
    desired = next
  }
  footprint = resolveXrSubjectFootprint(
    input.subject,
    subjectFacingAtTime(input.plan, input.subject.id, input.timeSeconds, input.markId
      ? { markId: input.markId, position: desired }
      : undefined),
  )
  const contained = Math.abs(desired[0]) + footprint.halfX + XR_SUBJECT_STAGE_EDGE_GAP_METERS <= input.stageSizeMeters[0] / 2
    && Math.abs(desired[2]) + footprint.halfZ + XR_SUBJECT_STAGE_EDGE_GAP_METERS <= input.stageSizeMeters[1] / 2
  if (!converged || !contained) {
    const radius = resolveXrSubjectPlanarRadius(input.subject)
    desired = clampSubjectToStage(
      input.desiredPosition,
      input.stageSizeMeters,
      radius,
      radius,
      XR_SUBJECT_STAGE_EDGE_GAP_METERS,
    )
    footprint = resolveXrSubjectFootprint(
      input.subject,
      subjectFacingAtTime(input.plan, input.subject.id, input.timeSeconds, input.markId
        ? { markId: input.markId, position: desired }
        : undefined),
    )
  }
  return Object.freeze({ desired, footprint })
}

export function xrPhysicsOwnsAuthoredSubject(
  physics: XrPhysicsRuntimeSnapshot,
  subjectId: string,
): boolean {
  return physics.phase !== 'stopped' && physics.world.bodies.some(body => body.subjectId === subjectId)
}

export function isXrSubjectMotionPositionSafe(input: Readonly<{
  actorId: string
  physics: XrPhysicsRuntimeSnapshot
  physicsFrame?: XrPhysicsRuntimeFrame
  plan: XrMotionReferencePlan
  position: XrMotionReferenceVector
  timeSeconds: number
}>): boolean {
  const subject = input.plan.subjects.find(candidate => candidate.id === input.actorId)
  if (!subject) return false
  const stage = resolveXrMotionReferenceStage(input.plan.stageId)
  const footprint = resolveXrSubjectFootprint(
    subject,
    subjectFacingAtTime(input.plan, subject.id, input.timeSeconds),
  )
  return motionCandidateIsValid(
    input.position,
    footprint,
    peerTrajectories(input.plan, subject.id, input.timeSeconds, input.timeSeconds, input.physics, input.physicsFrame),
    stage.sizeMeters,
  )
}

export function resolveXrSubjectMotion(input: Readonly<{
  actorId: string
  desiredPosition: XrMotionReferenceVector
  markId?: string
  physics: XrPhysicsRuntimeSnapshot
  physicsFrame?: XrPhysicsRuntimeFrame
  plan: XrMotionReferencePlan
  position: XrMotionReferenceVector
  startTimeSeconds?: number
  timeSeconds: number
}>): XrSubjectMotionResolution {
  if (xrPhysicsOwnsAuthoredSubject(input.physics, input.actorId)) {
    return Object.freeze({ position: input.position, status: 'physics-owned' })
  }
  const stage = resolveXrMotionReferenceStage(input.plan.stageId)
  const subject = input.plan.subjects.find(candidate => candidate.id === input.actorId)
  const startTimeSeconds = input.startTimeSeconds ?? input.timeSeconds
  const subjectMotion = subject ? resolveStageLimitedSubjectMotion({
    desiredPosition: input.desiredPosition,
    markId: input.markId,
    plan: input.plan,
    stageSizeMeters: stage.sizeMeters,
    subject,
    timeSeconds: input.timeSeconds,
  }) : null
  const footprint = subjectMotion?.footprint || null
  const desired = subjectMotion?.desired || clampSubjectToStage(
    input.desiredPosition,
    stage.sizeMeters,
    0,
    0,
    0,
  )
  if (!subject || !footprint) {
    const status = resolvedMotionStatus(input.position, input.desiredPosition, desired)
    return Object.freeze({ position: desired, status })
  }
  const peers = peerTrajectories(input.plan, subject.id, startTimeSeconds, input.timeSeconds, input.physics, input.physicsFrame)
  const footprintAt = (position: XrMotionReferenceVector) => resolveXrSubjectFootprint(
    subject,
    subjectFacingAtTime(input.plan, subject.id, input.timeSeconds, input.markId
      ? { markId: input.markId, position }
      : undefined),
  )
  const currentFootprint = footprintAt(input.position)
  const priorTrajectoryPosition = input.markId && startTimeSeconds !== input.timeSeconds
    ? subjectPositionAtTime(input.plan, subject.id, input.position, startTimeSeconds)
    : null
  const priorTrajectoryDelta = priorTrajectoryPosition
    ? [input.position[0] - priorTrajectoryPosition[0], input.position[2] - priorTrajectoryPosition[2]] as const
    : null
  const endpoints = [
    desired,
    [desired[0], input.position[1], input.position[2]],
    [input.position[0], desired[1], input.position[2]],
    [input.position[0], input.position[1], desired[2]],
  ] as const
  const sweptCandidates = endpoints.map(end => sweepMotionCandidate({ currentFootprint, end, footprintAt, peers, start: input.position }))
  const full = sweptCandidates[0]!
  if (!full.blocked) {
    const status = resolvedMotionStatus(input.position, input.desiredPosition, desired)
    return Object.freeze({ position: desired, status })
  }
  const candidates = sweptCandidates
    .map((candidate, index) => ({ index, position: candidate.position }))
    .filter(candidate => {
      const candidateFootprint = footprintAt(candidate.position)
      return motionCandidateIsValid(candidate.position, candidateFootprint, peers, stage.sizeMeters)
    })
    .sort((left, right) => {
      const leftDelta = [left.position[0] - input.position[0], left.position[2] - input.position[2]] as const
      const rightDelta = [right.position[0] - input.position[0], right.position[2] - input.position[2]] as const
      const leftAlignment = priorTrajectoryDelta ? planarDirectionAlignment(leftDelta, priorTrajectoryDelta) : 0
      const rightAlignment = priorTrajectoryDelta ? planarDirectionAlignment(rightDelta, priorTrajectoryDelta) : 0
      if (rightAlignment !== leftAlignment) return rightAlignment - leftAlignment
      return distanceSquared(input.position, right.position) - distanceSquared(input.position, left.position)
    })
    .map(candidate => candidate.position)
  const position = Object.freeze([...(candidates[0] || input.position)] as [number, number, number])
  const status = resolvedMotionStatus(input.position, input.desiredPosition, position)
  return Object.freeze({ position, status })
}

export function resolveXrSubjectKeyboardMotion(input: Readonly<{
  actorId: string
  distanceMeters: number
  keys: Iterable<ThreeKeyboardMovementKey>
  markId?: string
  physics: XrPhysicsRuntimeSnapshot
  physicsFrame?: XrPhysicsRuntimeFrame
  plan: XrMotionReferencePlan
  position: XrMotionReferenceVector
  timeSeconds: number
}>): XrSubjectMotionResolution | null {
  const stage = resolveXrMotionReferenceStage(input.plan.stageId)
  const desiredPosition = resolveThreeObjectKeyboardMotionPosition({
    bounds: {
      halfDepth: stage.sizeMeters[1] / 2,
      halfWidth: stage.sizeMeters[0] / 2,
    },
    distanceMeters: input.distanceMeters,
    keys: input.keys,
    position: input.position,
  })
  return desiredPosition ? resolveXrSubjectMotion({ ...input, desiredPosition }) : null
}
