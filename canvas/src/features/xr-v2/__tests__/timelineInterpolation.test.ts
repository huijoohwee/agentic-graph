import assert from 'node:assert/strict'
import { test } from 'node:test'

import { interpolateBoneTimeline, interpolateNumericTimeline } from '../timelineInterpolation'

test('numeric timeline interpolates linearly and clamps at both ends', () => {
  const keyframes = [
    { timeSeconds: 1, value: 10 },
    { timeSeconds: 3, value: 20 },
  ]
  assert.equal(interpolateNumericTimeline(keyframes, 0), 10)
  assert.equal(interpolateNumericTimeline(keyframes, 2), 15)
  assert.equal(interpolateNumericTimeline(keyframes, 4), 20)
})

test('bone timeline interpolates translation, scale, and shortest-path quaternion rotation', () => {
  const pose = interpolateBoneTimeline([
    {
      timeSeconds: 0,
      value: { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    },
    {
      timeSeconds: 2,
      value: { translation: [2, 4, 6], rotation: [0, 1, 0, 0], scale: [3, 3, 3] },
    },
  ], 1)

  assert.deepEqual(pose.translation, [1, 2, 3])
  assert.deepEqual(pose.scale, [2, 2, 2])
  assert.ok(Math.abs(pose.rotation[1] - Math.SQRT1_2) < 1e-12)
  assert.ok(Math.abs(pose.rotation[3] - Math.SQRT1_2) < 1e-12)
  assert.equal(Object.isFrozen(pose), true)
})

test('timeline rejects ambiguous keyframe order and zero quaternions', () => {
  assert.throws(() => interpolateNumericTimeline([
    { timeSeconds: 1, value: 1 },
    { timeSeconds: 1, value: 2 },
  ], 1), /strictly increasing/)

  assert.throws(() => interpolateBoneTimeline([{
    timeSeconds: 0,
    value: { translation: [0, 0, 0], rotation: [0, 0, 0, 0], scale: [1, 1, 1] },
  }], 0), /cannot be zero/)
})
