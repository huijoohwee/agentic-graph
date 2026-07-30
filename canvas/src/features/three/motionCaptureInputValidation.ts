import { MOTION_CAPTURE_DEFAULT_LIMITS } from './motionCapturePlatformContract'

export const STRICT_INPUT_KEYS = Object.freeze({
  runtimeOptions: Object.freeze(['now', 'idFactory', 'limits']),
  runtimeLimits: Object.freeze(Object.keys(MOTION_CAPTURE_DEFAULT_LIMITS)),
  sourceRegistration: Object.freeze(['captureKind', 'coordinateSpace', 'clockDomain', 'dimensions', 'nominalFps']),
  sourceDimensions: Object.freeze(['width', 'height']),
  clockAlignment: Object.freeze(['offsetMs', 'uncertaintyMs', 'measuredAtMs', 'evidenceDigestSha256']),
  calibration: Object.freeze(['status', 'coordinateSpace', 'provenance', 'reprojectionErrorPx']),
  calibrationProvenance: Object.freeze(['kind', 'measuredAtMs', 'evidenceDigestSha256']),
  sharedReconstruction: Object.freeze(['sourceIds', 'method', 'measuredAtMs', 'evidenceDigestSha256']),
  observation: Object.freeze(['captureTimestampMs', 'sequence', 'coordinateSpace', 'confidence', 'landmarks', 'missing']),
  landmark: Object.freeze(['x', 'y', 'z', 'visibility', 'presence']),
})

export function assertStrictRecord(value: unknown, allowedKeys: readonly string[], field: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`motion-capture-invalid-${field}-shape`)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`motion-capture-invalid-${field}-shape`)
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowedKeys.includes(key))) {
    throw new Error(`motion-capture-invalid-${field}-shape`)
  }
}

export function finiteNumber(value: number, field: string, minimum = Number.NEGATIVE_INFINITY): number {
  if (!Number.isFinite(value) || value < minimum) throw new Error(`motion-capture-invalid-${field}`)
  return value
}

export function boundedNumber(value: number, field: string, minimum: number, maximum: number): number {
  finiteNumber(value, field, minimum)
  if (value > maximum) throw new Error(`motion-capture-invalid-${field}`)
  return value
}

export function integerNumber(value: number, field: string, minimum: number, maximum: number): number {
  boundedNumber(value, field, minimum, maximum)
  if (!Number.isInteger(value)) throw new Error(`motion-capture-invalid-${field}`)
  return value
}
