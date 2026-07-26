import type { MotionCaptureDerivedLandmark } from './motionCapturePlatformContract'
import {
  assertStrictRecord,
  boundedNumber,
  finiteNumber,
  STRICT_INPUT_KEYS,
} from './motionCaptureInputValidation'
import type { MotionCaptureIdKind } from './motionCaptureSessionTypes'
import type { MotionCaptureSessionRuntimeOptions } from './motionCaptureSessionTypes'

export function validateMotionCaptureRuntimeOptions(options: MotionCaptureSessionRuntimeOptions): void {
  assertStrictRecord(options, STRICT_INPUT_KEYS.runtimeOptions, 'runtime-options')
  if (options.limits !== undefined) assertStrictRecord(options.limits, STRICT_INPUT_KEYS.runtimeLimits, 'runtime-limits')
  if ((options.now !== undefined && typeof options.now !== 'function')
    || (options.idFactory !== undefined && typeof options.idFactory !== 'function')) {
    throw new Error('motion-capture-invalid-runtime-options-shape')
  }
}

let fallbackIdCounter = 0

export function defaultMotionCaptureIdFactory(kind: MotionCaptureIdKind): string {
  const randomUuid = globalThis.crypto?.randomUUID?.()
  fallbackIdCounter += 1
  return randomUuid || `${kind}-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}`
}

export function createMotionCaptureOpaqueId(
  kind: MotionCaptureIdKind,
  factory: (kind: MotionCaptureIdKind) => string,
): string {
  const token = factory(kind).trim().replace(/[^A-Za-z0-9_-]/gu, '').slice(0, 96)
  if (!token) throw new Error('motion-capture-empty-opaque-id')
  return `${kind}-${token}`
}

export function freezeMotionCaptureLandmarks(
  landmarks: readonly MotionCaptureDerivedLandmark[],
  limit: number,
): readonly MotionCaptureDerivedLandmark[] {
  if (!Array.isArray(landmarks)) throw new Error('motion-capture-invalid-landmarks-shape')
  if (landmarks.length > limit) throw new Error('motion-capture-landmark-budget-exceeded')
  return Object.freeze(Array.from(landmarks, (landmark) => {
    assertStrictRecord(landmark, STRICT_INPUT_KEYS.landmark, 'landmark')
    return Object.freeze({
      x: finiteNumber(landmark.x, 'landmark-x'),
      y: finiteNumber(landmark.y, 'landmark-y'),
      z: finiteNumber(landmark.z, 'landmark-z'),
      visibility: boundedNumber(landmark.visibility, 'landmark-visibility', 0, 1),
      presence: boundedNumber(landmark.presence, 'landmark-presence', 0, 1),
    })
  }))
}
