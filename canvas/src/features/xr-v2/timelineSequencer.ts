import { Bone, type Object3D } from 'three'

import {
  interpolateBoneTimeline,
  interpolateNumericTimeline,
  type BoneTimelineKeyframe,
  type NumericTimelineKeyframe,
} from './timelineInterpolation'

export const XR_V2_TIMELINE_SEQUENCE_SCHEMA = 'agentic-graph-xr-timeline-sequence/v1' as const
export const XR_V2_TIMELINE_MAX_TRACKS = 64
export const XR_V2_TIMELINE_MAX_KEYFRAMES_PER_TRACK = 2_048
export const XR_V2_TIMELINE_MAX_DURATION_SECONDS = 600
export const XR_V2_TIMELINE_MAX_ABSOLUTE_VALUE = 1_000_000

export type XrV2TimelineTrack =
  | Readonly<{
      id: string
      kind: 'bone-pose'
      targetName: string
      keyframes: readonly BoneTimelineKeyframe[]
    }>
  | Readonly<{
      id: string
      kind: 'numeric-property'
      targetName: string
      property: 'position.x' | 'position.y' | 'position.z' | 'scale.x' | 'scale.y' | 'scale.z'
      keyframes: readonly NumericTimelineKeyframe[]
    }>

export type XrV2TimelineSequenceDefinition = Readonly<{
  schema: typeof XR_V2_TIMELINE_SEQUENCE_SCHEMA
  durationSeconds: number
  loop: boolean
  tracks: readonly XrV2TimelineTrack[]
}>

export type XrV2TimelineSequence = Readonly<{
  durationSeconds: number
  sample(timeSeconds: number): readonly Readonly<{ trackId: string; value: unknown }>[]
  apply(root: Object3D, timeSeconds: number): Readonly<{
    appliedTrackIds: readonly string[]
    missingTargets: readonly string[]
    invalidTargets: readonly string[]
  }>
}>

type XrV2TimelineTransportSnapshot = Readonly<{
  playing: boolean
  timeSeconds: number
  revision: number
}>

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
const NUMERIC_PROPERTIES = new Set<Extract<XrV2TimelineTrack, { kind: 'numeric-property' }>['property']>([
  'position.x', 'position.y', 'position.z', 'scale.x', 'scale.y', 'scale.z',
])

function normalizeTime(durationSeconds: number, loop: boolean, timeSeconds: number): number {
  if (!Number.isFinite(timeSeconds)) throw new TypeError('timeline time must be finite')
  if (!loop) return Math.min(durationSeconds, Math.max(0, timeSeconds))
  const wrapped = timeSeconds % durationSeconds
  return wrapped < 0 ? wrapped + durationSeconds : wrapped
}

function validateDefinition(definition: XrV2TimelineSequenceDefinition): void {
  if (!definition || definition.schema !== XR_V2_TIMELINE_SEQUENCE_SCHEMA
    || !Number.isFinite(definition.durationSeconds) || definition.durationSeconds <= 0
    || definition.durationSeconds > XR_V2_TIMELINE_MAX_DURATION_SECONDS
    || typeof definition.loop !== 'boolean' || !Array.isArray(definition.tracks)
    || definition.tracks.length < 1 || definition.tracks.length > XR_V2_TIMELINE_MAX_TRACKS) {
    throw new TypeError('invalid bounded XR timeline definition')
  }
  const ids = new Set<string>()
  const transformTargets = new Set<string>()
  const numericTargets = new Set<string>()
  for (const track of definition.tracks) {
    if (!SAFE_NAME.test(track.id) || ids.has(track.id) || !SAFE_NAME.test(track.targetName)
      || !Array.isArray(track.keyframes) || track.keyframes.length < 1
      || track.keyframes.length > XR_V2_TIMELINE_MAX_KEYFRAMES_PER_TRACK
      || track.keyframes[0].timeSeconds < 0
      || track.keyframes.at(-1)!.timeSeconds > definition.durationSeconds) {
      throw new TypeError('invalid bounded XR timeline track')
    }
    ids.add(track.id)
    if (track.kind === 'bone-pose') {
      if (transformTargets.has(track.targetName)
        || [...numericTargets].some(target => target.startsWith(`${track.targetName}|`))) {
        throw new TypeError('timeline has multiple transform writers for one target')
      }
      transformTargets.add(track.targetName)
      interpolateBoneTimeline(track.keyframes, 0)
      if (track.keyframes.some((keyframe: BoneTimelineKeyframe) => [
        ...keyframe.value.translation,
        ...keyframe.value.rotation,
        ...keyframe.value.scale,
      ].some(value => Math.abs(value) > XR_V2_TIMELINE_MAX_ABSOLUTE_VALUE))) {
        throw new TypeError('timeline values exceed renderer-safe magnitude')
      }
    } else if (track.kind === 'numeric-property') {
      if (!NUMERIC_PROPERTIES.has(track.property)) throw new TypeError('invalid numeric timeline property')
      const targetKey = `${track.targetName}|${track.property}`
      if (transformTargets.has(track.targetName) || numericTargets.has(targetKey)) {
        throw new TypeError('timeline has multiple transform writers for one target')
      }
      numericTargets.add(targetKey)
      interpolateNumericTimeline(track.keyframes, 0)
      if (track.keyframes.some((keyframe: NumericTimelineKeyframe) => Math.abs(keyframe.value) > XR_V2_TIMELINE_MAX_ABSOLUTE_VALUE)) {
        throw new TypeError('timeline values exceed renderer-safe magnitude')
      }
    }
    else throw new TypeError('unknown XR timeline track kind')
  }
}

function setNumericProperty(target: Object3D, property: Extract<XrV2TimelineTrack, { kind: 'numeric-property' }>['property'], value: number): void {
  const [owner, axis] = property.split('.') as ['position' | 'scale', 'x' | 'y' | 'z']
  target[owner][axis] = value
}

function cloneTrack(track: XrV2TimelineTrack): XrV2TimelineTrack {
  if (track.kind === 'numeric-property') {
    return Object.freeze({
      ...track,
      keyframes: Object.freeze(track.keyframes.map(keyframe => Object.freeze({ ...keyframe }))),
    })
  }
  return Object.freeze({
    ...track,
    keyframes: Object.freeze(track.keyframes.map(keyframe => Object.freeze({
      ...keyframe,
      value: Object.freeze({
        translation: Object.freeze([...keyframe.value.translation]) as typeof keyframe.value.translation,
        rotation: Object.freeze([...keyframe.value.rotation]) as typeof keyframe.value.rotation,
        scale: Object.freeze([...keyframe.value.scale]) as typeof keyframe.value.scale,
      }),
    }))),
  })
}

export function createXrV2TimelineSequence(
  definition: XrV2TimelineSequenceDefinition,
): XrV2TimelineSequence {
  validateDefinition(definition)
  const durationSeconds = definition.durationSeconds
  const loop = definition.loop
  const tracks = Object.freeze(definition.tracks.map(cloneTrack))
  return Object.freeze({
    durationSeconds,
    sample: timeSeconds => {
      const time = normalizeTime(durationSeconds, loop, timeSeconds)
      return Object.freeze(tracks.map(track => Object.freeze({
        trackId: track.id,
        value: track.kind === 'bone-pose'
          ? interpolateBoneTimeline(track.keyframes, time)
          : interpolateNumericTimeline(track.keyframes, time),
      })))
    },
    apply: (root, timeSeconds) => {
      const time = normalizeTime(durationSeconds, loop, timeSeconds)
      const appliedTrackIds: string[] = []
      const missingTargets: string[] = []
      const invalidTargets: string[] = []
      const resolved: Array<Readonly<{ track: XrV2TimelineTrack; target: Object3D; value: unknown }>> = []
      for (const track of tracks) {
        const matches: Object3D[] = []
        root.traverse(candidate => {
          if (candidate.name === track.targetName) matches.push(candidate)
        })
        if (matches.length === 0) {
          missingTargets.push(track.targetName)
          continue
        }
        if (matches.length !== 1 || (track.kind === 'bone-pose' && !(matches[0] instanceof Bone))) {
          invalidTargets.push(track.targetName)
          continue
        }
        resolved.push({
          track,
          target: matches[0],
          value: track.kind === 'bone-pose'
            ? interpolateBoneTimeline(track.keyframes, time)
            : interpolateNumericTimeline(track.keyframes, time),
        })
      }
      if (missingTargets.length > 0 || invalidTargets.length > 0) {
        return Object.freeze({
          appliedTrackIds: Object.freeze(appliedTrackIds),
          missingTargets: Object.freeze(missingTargets),
          invalidTargets: Object.freeze(invalidTargets),
        })
      }
      for (const { track, target, value } of resolved) {
        if (track.kind === 'bone-pose') {
          const pose = value as ReturnType<typeof interpolateBoneTimeline>
          target.position.fromArray(pose.translation)
          target.quaternion.fromArray(pose.rotation)
          target.scale.fromArray(pose.scale)
        } else {
          setNumericProperty(target, track.property, value as number)
        }
        target.updateMatrix()
        appliedTrackIds.push(track.id)
      }
      root.updateMatrixWorld(true)
      return Object.freeze({
        appliedTrackIds: Object.freeze(appliedTrackIds),
        missingTargets: Object.freeze(missingTargets),
        invalidTargets: Object.freeze(invalidTargets),
      })
    },
  })
}

/** Test-only deterministic clock. Mounted authoring uses the canonical XR motion playhead owner. */
export function createXrV2TimelineTestTransport(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0
    || durationSeconds > XR_V2_TIMELINE_MAX_DURATION_SECONDS) throw new TypeError('invalid timeline duration')
  let snapshot: XrV2TimelineTransportSnapshot = Object.freeze({ playing: false, timeSeconds: 0, revision: 0 })
  const listeners = new Set<() => void>()
  const publish = (playing: boolean, timeSeconds: number) => {
    snapshot = Object.freeze({ playing, timeSeconds, revision: snapshot.revision + 1 })
    for (const listener of listeners) listener()
    return snapshot
  }
  return Object.freeze({
    read: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
    play: () => publish(true, snapshot.timeSeconds),
    pause: () => publish(false, snapshot.timeSeconds),
    scrub: (timeSeconds: number) => {
      if (!Number.isFinite(timeSeconds)) throw new TypeError('timeline scrub time must be finite')
      return publish(false, Math.min(durationSeconds, Math.max(0, timeSeconds)))
    },
    tick: (deltaSeconds: number) => {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new TypeError('timeline delta must be finite and non-negative')
      return snapshot.playing
        ? publish(true, (snapshot.timeSeconds + deltaSeconds) % durationSeconds)
        : snapshot
    },
  })
}
