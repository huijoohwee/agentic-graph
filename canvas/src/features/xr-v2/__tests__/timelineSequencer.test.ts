import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Bone, Group } from 'three'

import {
  XR_V2_TIMELINE_SEQUENCE_SCHEMA,
  createXrV2TimelineSequence,
  createXrV2TimelineTestTransport,
  type XrV2TimelineSequenceDefinition,
} from '../timelineSequencer'

const definition: XrV2TimelineSequenceDefinition = {
  schema: XR_V2_TIMELINE_SEQUENCE_SCHEMA,
  durationSeconds: 2,
  loop: false,
  tracks: [
    {
      id: 'arm-pose',
      kind: 'bone-pose',
      targetName: 'Arm',
      keyframes: [
        { timeSeconds: 0, value: { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
        { timeSeconds: 2, value: { translation: [2, 4, 6], rotation: [0, 1, 0, 0], scale: [3, 3, 3] } },
      ],
    },
    {
      id: 'root-height',
      kind: 'numeric-property',
      targetName: 'Rig',
      property: 'position.y',
      keyframes: [{ timeSeconds: 0, value: 0 }, { timeSeconds: 2, value: 4 }],
    },
  ],
}

test('timeline sequence applies bounded keyframes to real Three object and bone targets', () => {
  const rig = new Group()
  rig.name = 'Rig'
  const arm = new Bone()
  arm.name = 'Arm'
  rig.add(arm)

  const sequence = createXrV2TimelineSequence(definition)
  const result = sequence.apply(rig, 1)

  assert.deepEqual(result.appliedTrackIds, ['arm-pose', 'root-height'])
  assert.deepEqual(result.missingTargets, [])
  assert.deepEqual(result.invalidTargets, [])
  assert.deepEqual(arm.position.toArray(), [1, 2, 3])
  assert.deepEqual(arm.scale.toArray(), [2, 2, 2])
  assert.ok(Math.abs(arm.quaternion.y - Math.SQRT1_2) < 1e-12)
  assert.ok(Math.abs(arm.quaternion.w - Math.SQRT1_2) < 1e-12)
  assert.equal(rig.position.y, 2)
})

test('timeline sequence owns an immutable snapshot and rejects conflicting or out-of-bounds writers', () => {
  const mutable = structuredClone(definition) as unknown as XrV2TimelineSequenceDefinition
  const sequence = createXrV2TimelineSequence(mutable)
  ;(mutable.tracks[1].keyframes as Array<{ timeSeconds: number; value: number }>)[1].value = 99
  ;(mutable as unknown as { loop: boolean }).loop = true
  ;(mutable as unknown as { durationSeconds: number }).durationSeconds = 100
  assert.equal(sequence.sample(2)[1].value, 4)

  assert.throws(() => createXrV2TimelineSequence({
    ...definition,
    tracks: [...definition.tracks, {
      id: 'duplicate-root-height',
      kind: 'numeric-property',
      targetName: 'Rig',
      property: 'position.y',
      keyframes: [{ timeSeconds: 0, value: 0 }],
    }],
  }), /multiple transform writers/)
  assert.throws(() => createXrV2TimelineSequence({
    ...definition,
    tracks: [{
      id: 'negative-time',
      kind: 'numeric-property',
      targetName: 'Rig',
      property: 'position.x',
      keyframes: [{ timeSeconds: -1, value: 0 }],
    }],
  }), /bounded XR timeline track/)
  assert.throws(() => createXrV2TimelineSequence({
    ...definition,
    tracks: [{
      id: 'unsafe-property', kind: 'numeric-property', targetName: 'Rig', property: '__proto__.x',
      keyframes: [{ timeSeconds: 0, value: 0 }],
    }],
  } as unknown as XrV2TimelineSequenceDefinition), /invalid numeric timeline property/)
  assert.throws(() => createXrV2TimelineSequence({
    ...definition,
    tracks: [{
      id: 'unsafe-magnitude', kind: 'numeric-property', targetName: 'Rig', property: 'position.x',
      keyframes: [{ timeSeconds: 0, value: Number.MAX_VALUE }],
    }],
  }), /renderer-safe magnitude/)
})

test('timeline transport is bounded, monotonic, and rejects invalid ticks', () => {
  const transport = createXrV2TimelineTestTransport(2)
  assert.equal(transport.play().playing, true)
  assert.equal(transport.tick(0.5).timeSeconds, 0.5)
  assert.equal(transport.pause().playing, false)
  assert.equal(transport.scrub(99).timeSeconds, 2)
  assert.throws(() => transport.tick(Number.NaN), /finite and non-negative/)
  assert.throws(() => transport.scrub(Number.NaN), /scrub time must be finite/)
})

test('timeline target resolution is atomic, unique, and requires real bones', () => {
  const sequence = createXrV2TimelineSequence(definition)
  const rig = new Group()
  rig.name = 'Rig'
  const wrongArm = new Group()
  wrongArm.name = 'Arm'
  rig.add(wrongArm)
  const before = rig.position.clone()
  const invalidBone = sequence.apply(rig, 1)
  assert.deepEqual(invalidBone.appliedTrackIds, [])
  assert.deepEqual(invalidBone.invalidTargets, ['Arm'])
  assert.deepEqual(rig.position.toArray(), before.toArray())

  wrongArm.removeFromParent()
  const armA = new Bone()
  armA.name = 'Arm'
  const armB = new Bone()
  armB.name = 'Arm'
  rig.add(armA, armB)
  const ambiguous = sequence.apply(rig, 1)
  assert.deepEqual(ambiguous.appliedTrackIds, [])
  assert.deepEqual(ambiguous.invalidTargets, ['Arm'])
  assert.deepEqual(rig.position.toArray(), before.toArray())
})
