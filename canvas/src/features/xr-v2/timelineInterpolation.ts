export type NumericTimelineKeyframe = Readonly<{ timeSeconds: number; value: number }>
export type Vector3Tuple = readonly [number, number, number]
export type QuaternionTuple = readonly [number, number, number, number]

export type BonePose = Readonly<{
  translation: Vector3Tuple
  rotation: QuaternionTuple
  scale: Vector3Tuple
}>

export type BoneTimelineKeyframe = Readonly<{ timeSeconds: number; value: BonePose }>

function assertTimelineTime(timeSeconds: number): void {
  if (!Number.isFinite(timeSeconds)) throw new TypeError('timeline time must be finite')
}

function assertStrictlyIncreasingTimes(keyframes: readonly Readonly<{ timeSeconds: number }>[]): void {
  if (keyframes.length === 0) throw new TypeError('timeline requires at least one keyframe')
  let previous = -Infinity
  for (const keyframe of keyframes) {
    assertTimelineTime(keyframe.timeSeconds)
    if (keyframe.timeSeconds <= previous) throw new TypeError('timeline keyframes must be strictly increasing')
    previous = keyframe.timeSeconds
  }
}

function findSegment(
  keyframes: readonly Readonly<{ timeSeconds: number }>[],
  timeSeconds: number,
): Readonly<{ left: number; right: number; alpha: number }> {
  if (timeSeconds <= keyframes[0].timeSeconds) return { left: 0, right: 0, alpha: 0 }
  const lastIndex = keyframes.length - 1
  if (timeSeconds >= keyframes[lastIndex].timeSeconds) return { left: lastIndex, right: lastIndex, alpha: 0 }

  let low = 0
  let high = lastIndex
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2)
    if (keyframes[middle].timeSeconds <= timeSeconds) low = middle
    else high = middle
  }
  const duration = keyframes[high].timeSeconds - keyframes[low].timeSeconds
  return { left: low, right: high, alpha: (timeSeconds - keyframes[low].timeSeconds) / duration }
}

export function interpolateNumericTimeline(
  keyframes: readonly NumericTimelineKeyframe[],
  timeSeconds: number,
): number {
  assertTimelineTime(timeSeconds)
  assertStrictlyIncreasingTimes(keyframes)
  for (const keyframe of keyframes) {
    if (!Number.isFinite(keyframe.value)) throw new TypeError('numeric timeline values must be finite')
  }
  const segment = findSegment(keyframes, timeSeconds)
  if (segment.left === segment.right) return keyframes[segment.left].value
  const left = keyframes[segment.left].value
  return left + (keyframes[segment.right].value - left) * segment.alpha
}

function assertVector3(value: Vector3Tuple, label: string): void {
  if (!Array.isArray(value) || value.length !== 3 || value.some(component => !Number.isFinite(component))) {
    throw new TypeError(`${label} must contain three finite numbers`)
  }
}

function normalizeQuaternion(value: QuaternionTuple): QuaternionTuple {
  if (!Array.isArray(value) || value.length !== 4 || value.some(component => !Number.isFinite(component))) {
    throw new TypeError('bone rotation must contain four finite numbers')
  }
  const length = Math.hypot(value[0], value[1], value[2], value[3])
  if (length <= Number.EPSILON) throw new TypeError('bone rotation quaternion cannot be zero')
  return Object.freeze([value[0] / length, value[1] / length, value[2] / length, value[3] / length]) as QuaternionTuple
}

function interpolateVector3(left: Vector3Tuple, right: Vector3Tuple, alpha: number): Vector3Tuple {
  return Object.freeze([
    left[0] + (right[0] - left[0]) * alpha,
    left[1] + (right[1] - left[1]) * alpha,
    left[2] + (right[2] - left[2]) * alpha,
  ]) as Vector3Tuple
}

function interpolateQuaternion(leftValue: QuaternionTuple, rightValue: QuaternionTuple, alpha: number): QuaternionTuple {
  const left = normalizeQuaternion(leftValue)
  let right = normalizeQuaternion(rightValue)
  let dot = left[0] * right[0] + left[1] * right[1] + left[2] * right[2] + left[3] * right[3]
  if (dot < 0) {
    right = Object.freeze([-right[0], -right[1], -right[2], -right[3]]) as QuaternionTuple
    dot = -dot
  }
  dot = Math.min(1, Math.max(-1, dot))

  if (dot > 0.9995) {
    return normalizeQuaternion(Object.freeze([
      left[0] + (right[0] - left[0]) * alpha,
      left[1] + (right[1] - left[1]) * alpha,
      left[2] + (right[2] - left[2]) * alpha,
      left[3] + (right[3] - left[3]) * alpha,
    ]) as QuaternionTuple)
  }

  const theta = Math.acos(dot)
  const sinTheta = Math.sin(theta)
  const leftWeight = Math.sin((1 - alpha) * theta) / sinTheta
  const rightWeight = Math.sin(alpha * theta) / sinTheta
  return normalizeQuaternion(Object.freeze([
    left[0] * leftWeight + right[0] * rightWeight,
    left[1] * leftWeight + right[1] * rightWeight,
    left[2] * leftWeight + right[2] * rightWeight,
    left[3] * leftWeight + right[3] * rightWeight,
  ]) as QuaternionTuple)
}

function validateBonePose(pose: BonePose): void {
  if (!pose || typeof pose !== 'object') throw new TypeError('bone pose is required')
  assertVector3(pose.translation, 'bone translation')
  assertVector3(pose.scale, 'bone scale')
  normalizeQuaternion(pose.rotation)
}

function freezePose(pose: BonePose): BonePose {
  return Object.freeze({
    translation: Object.freeze([...pose.translation]) as Vector3Tuple,
    rotation: normalizeQuaternion(pose.rotation),
    scale: Object.freeze([...pose.scale]) as Vector3Tuple,
  })
}

export function interpolateBoneTimeline(
  keyframes: readonly BoneTimelineKeyframe[],
  timeSeconds: number,
): BonePose {
  assertTimelineTime(timeSeconds)
  assertStrictlyIncreasingTimes(keyframes)
  for (const keyframe of keyframes) validateBonePose(keyframe.value)

  const segment = findSegment(keyframes, timeSeconds)
  const left = keyframes[segment.left].value
  if (segment.left === segment.right) return freezePose(left)
  const right = keyframes[segment.right].value
  return Object.freeze({
    translation: interpolateVector3(left.translation, right.translation, segment.alpha),
    rotation: interpolateQuaternion(left.rotation, right.rotation, segment.alpha),
    scale: interpolateVector3(left.scale, right.scale, segment.alpha),
  })
}
