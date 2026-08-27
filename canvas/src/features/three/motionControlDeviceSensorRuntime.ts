import {
  BrowserAppleSensorController,
  type AppleMotionSample,
  type AppleOrientationSample,
  type AppleSensorPermission,
  type AppleSensorPhase,
  type AppleSensorSnapshot,
  type AppleSensorVector,
} from '../../../../packages/apple-spatial-input/src/browser-controller'
import type {
  AppleSpatialInputProfileInput,
} from '../../../../packages/apple-spatial-input/src/profile'

export const MOTION_CONTROL_DEVICE_SENSOR_SCHEMA = 'agenticgraph.motion-control-device-sensors/v2' as const

export type MotionControlDeviceSensorPhase = AppleSensorPhase
export type MotionControlDeviceSensorPermission = AppleSensorPermission
export type MotionControlDeviceSensorVector = AppleSensorVector
export type MotionControlDeviceMotionSample = Omit<AppleMotionSample, 'intervalMilliseconds'> & Readonly<{
  intervalMs: number | null
}>
export type MotionControlDeviceOrientationSample = Omit<AppleOrientationSample, 'timestampMilliseconds'>
export type MotionControlDeviceSensorProfileInput = AppleSpatialInputProfileInput
export type MotionControlDeviceSensorSnapshot = Omit<
  AppleSensorSnapshot,
  'schema' | 'motionEnabled' | 'orientationEnabled' | 'motion' | 'orientation'
> & Readonly<{
  schema: typeof MOTION_CONTROL_DEVICE_SENSOR_SCHEMA
  motion: MotionControlDeviceMotionSample | null
  orientation: MotionControlDeviceOrientationSample | null
}>

const controller = new BrowserAppleSensorController()
let sourceSnapshot: AppleSensorSnapshot | null = null
let snapshot: MotionControlDeviceSensorSnapshot | null = null

function projectSnapshot(source: AppleSensorSnapshot): MotionControlDeviceSensorSnapshot {
  if (source === sourceSnapshot && snapshot) return snapshot
  const {
    schema: _schema,
    motionEnabled: _motionEnabled,
    orientationEnabled: _orientationEnabled,
    motion,
    orientation,
    ...portable
  } = source
  const projectedMotion = motion
    ? Object.freeze({
      acceleration: motion.acceleration,
      accelerationIncludingGravity: motion.accelerationIncludingGravity,
      rotationRate: motion.rotationRate,
      intervalMs: motion.intervalMilliseconds,
    })
    : null
  const projectedOrientation = orientation
    ? Object.freeze({
      alpha: orientation.alpha,
      beta: orientation.beta,
      gamma: orientation.gamma,
      absolute: orientation.absolute,
    })
    : null
  sourceSnapshot = source
  snapshot = Object.freeze({
    ...portable,
    schema: MOTION_CONTROL_DEVICE_SENSOR_SCHEMA,
    motion: projectedMotion,
    orientation: projectedOrientation,
  })
  return snapshot
}

export function readMotionControlDeviceSensorSnapshot(): MotionControlDeviceSensorSnapshot {
  return projectSnapshot(controller.readSnapshot())
}

export function subscribeMotionControlDeviceSensors(subscriber: () => void): () => void {
  return controller.subscribe(subscriber)
}

export function configureMotionControlDeviceSensorProfile(
  profile: MotionControlDeviceSensorProfileInput,
): MotionControlDeviceSensorSnapshot {
  return projectSnapshot(controller.configureProfile(profile))
}

export function recenterMotionControlDeviceSensors(
  message = 'Hold the phone comfortably; the next orientation sample sets neutral.',
): MotionControlDeviceSensorSnapshot {
  return projectSnapshot(controller.recenter(message))
}

export async function enableMotionControlDeviceSensors(): Promise<MotionControlDeviceSensorSnapshot> {
  return projectSnapshot(await controller.enable())
}

export function disableMotionControlDeviceSensors(
  message = 'Device sensors are disabled.',
): MotionControlDeviceSensorSnapshot {
  return projectSnapshot(controller.disable(message))
}
