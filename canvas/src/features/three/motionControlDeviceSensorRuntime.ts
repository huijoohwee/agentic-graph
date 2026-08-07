import {
  APPLE_SPATIAL_INPUT_SCHEMA,
  DEFAULT_APPLE_SPATIAL_INPUT_PROFILE,
  appleSpatialInputProfilesEqual,
  createAppleSpatialInputProfile,
  finiteSpatialInputNumber,
  projectAppleSpatialInput,
  resetAppleSpatialInputState,
  type AppleSpatialInputProfile,
  type AppleSpatialInputState,
} from 'grph-shared/spatial-input/appleSpatialInput'

export const MOTION_CONTROL_DEVICE_SENSOR_SCHEMA = 'knowgrph.motion-control-device-sensors/v2' as const

export type MotionControlDeviceSensorPhase = 'off' | 'requesting-permission' | 'running' | 'denied' | 'unavailable' | 'error'
export type MotionControlDeviceSensorPermission = 'unknown' | 'prompting' | 'granted' | 'denied' | 'unavailable'
export type MotionControlDeviceSensorVector = Readonly<{
  x: number | null
  y: number | null
  z: number | null
}>
export type MotionControlDeviceMotionSample = Readonly<{
  acceleration: MotionControlDeviceSensorVector | null
  accelerationIncludingGravity: MotionControlDeviceSensorVector | null
  rotationRate: Readonly<{
    alpha: number | null
    beta: number | null
    gamma: number | null
  }> | null
  intervalMs: number | null
}>
export type MotionControlDeviceOrientationSample = Readonly<{
  alpha: number | null
  beta: number | null
  gamma: number | null
  absolute: boolean
}>
export type MotionControlDeviceSensorProfileInput = Omit<AppleSpatialInputProfile, 'schema'> & {
  readonly schema?: string
}
export type MotionControlDeviceSensorSnapshot = Readonly<{
  schema: typeof MOTION_CONTROL_DEVICE_SENSOR_SCHEMA
  spatialInputSchema: typeof APPLE_SPATIAL_INPUT_SCHEMA
  spatialInputProfile: AppleSpatialInputProfile
  phase: MotionControlDeviceSensorPhase
  permission: MotionControlDeviceSensorPermission
  motion: MotionControlDeviceMotionSample | null
  orientation: MotionControlDeviceOrientationSample | null
  calibrated: boolean
  pitch: number
  roll: number
  screenAngleDegrees: number
  sampleCount: number
  message: string
  revision: number
}>

type PermissionResult = 'granted' | 'denied'
type PermissionCapableEventConstructor = {
  requestPermission?: () => Promise<string>
}

const subscribers = new Set<() => void>()
const INITIAL_SNAPSHOT: MotionControlDeviceSensorSnapshot = Object.freeze({
  schema: MOTION_CONTROL_DEVICE_SENSOR_SCHEMA,
  spatialInputSchema: APPLE_SPATIAL_INPUT_SCHEMA,
  spatialInputProfile: DEFAULT_APPLE_SPATIAL_INPUT_PROFILE,
  phase: 'off',
  permission: 'unknown',
  motion: null,
  orientation: null,
  calibrated: false,
  pitch: 0,
  roll: 0,
  screenAngleDegrees: 0,
  sampleCount: 0,
  message: 'Device sensors stay off until Enable Sensors is selected.',
  revision: 0,
})

let snapshot = INITIAL_SNAPSHOT
let controlIntent = 0
let sensorListenersInstalled = false
let lifecycleListenersInstalled = false
let screenOrientationTarget: ScreenOrientation | null = null
let calibrationTimer: ReturnType<typeof setTimeout> | null = null
let motionSupported = false
let orientationSupported = false
let spatialInputProfile = DEFAULT_APPLE_SPATIAL_INPUT_PROFILE
let spatialInputState: AppleSpatialInputState = resetAppleSpatialInputState()

function publish(
  update: Partial<Omit<MotionControlDeviceSensorSnapshot, 'schema' | 'spatialInputSchema' | 'revision'>>,
): void {
  snapshot = Object.freeze({ ...snapshot, ...update, revision: snapshot.revision + 1 })
  for (const subscriber of subscribers) {
    try {
      subscriber()
    } catch (error) {
      console.error('[knowgrph] device sensor subscriber failed', error)
    }
  }
}

function resetSpatialInputMeasurements(): Pick<MotionControlDeviceSensorSnapshot,
  'calibrated' | 'pitch' | 'roll' | 'screenAngleDegrees'> {
  spatialInputState = resetAppleSpatialInputState()
  return {
    calibrated: false,
    pitch: 0,
    roll: 0,
    screenAngleDegrees: readScreenAngleDegrees(),
  }
}

function readScreenAngleDegrees(): number {
  if (typeof screen === 'undefined') return 0
  return finiteSpatialInputNumber(screen.orientation?.angle) ?? 0
}

function clearCalibrationTimer(): void {
  if (calibrationTimer === null) return
  clearTimeout(calibrationTimer)
  calibrationTimer = null
}

function scheduleCalibrationTimeout(): void {
  clearCalibrationTimer()
  if (!orientationSupported || snapshot.phase !== 'running') return
  const intent = controlIntent
  calibrationTimer = setTimeout(() => {
    calibrationTimer = null
    if (intent !== controlIntent || snapshot.phase !== 'running' || snapshot.calibrated) return
    publish({ message: 'No orientation sample arrived; normalized axes remain neutral.' })
  }, spatialInputProfile.calibrationTimeoutMilliseconds)
}

function finiteNumber(value: number | null | undefined): number | null {
  return finiteSpatialInputNumber(value)
}

function readEventTimestampMilliseconds(event: Event): number {
  return finiteSpatialInputNumber(event.timeStamp) ?? Date.now()
}

function sensorVector(value: DeviceMotionEventAcceleration | null): MotionControlDeviceSensorVector | null {
  if (!value) return null
  return Object.freeze({
    x: finiteNumber(value.x),
    y: finiteNumber(value.y),
    z: finiteNumber(value.z),
  })
}

function readSensorConstructor(name: 'DeviceMotionEvent' | 'DeviceOrientationEvent'): PermissionCapableEventConstructor | undefined {
  return (globalThis as unknown as Record<string, PermissionCapableEventConstructor | undefined>)[name]
}

function requestSensorPermission(constructor: PermissionCapableEventConstructor | undefined): Promise<PermissionResult> | null {
  if (!constructor) return null
  const requestPermission = constructor.requestPermission
  if (typeof requestPermission !== 'function') return Promise.resolve('granted')
  try {
    return Promise.resolve(requestPermission.call(constructor)).then(
      result => result === 'granted' ? 'granted' : 'denied',
      () => 'denied',
    )
  } catch {
    return Promise.resolve('denied')
  }
}

function handleDeviceMotion(event: DeviceMotionEvent): void {
  if (snapshot.phase !== 'running') return
  publish({
    motion: Object.freeze({
      acceleration: sensorVector(event.acceleration),
      accelerationIncludingGravity: sensorVector(event.accelerationIncludingGravity),
      rotationRate: event.rotationRate
        ? Object.freeze({
          alpha: finiteNumber(event.rotationRate.alpha),
          beta: finiteNumber(event.rotationRate.beta),
          gamma: finiteNumber(event.rotationRate.gamma),
        })
        : null,
      intervalMs: finiteNumber(event.interval),
    }),
    sampleCount: snapshot.sampleCount + 1,
  })
}

function handleDeviceOrientation(event: DeviceOrientationEvent): void {
  if (snapshot.phase !== 'running') return
  const betaDegrees = finiteNumber(event.beta)
  const gammaDegrees = finiteNumber(event.gamma)
  const screenAngleDegrees = readScreenAngleDegrees()
  const projection = betaDegrees === null || gammaDegrees === null
    ? null
    : projectAppleSpatialInput(spatialInputState, {
      betaDegrees,
      gammaDegrees,
      screenAngleDegrees,
      timestampMilliseconds: readEventTimestampMilliseconds(event),
    }, spatialInputProfile)
  if (projection) spatialInputState = projection.state
  if (projection?.calibratedNow) clearCalibrationTimer()
  publish({
    orientation: Object.freeze({
      alpha: finiteNumber(event.alpha),
      beta: betaDegrees,
      gamma: gammaDegrees,
      absolute: Boolean(event.absolute),
    }),
    calibrated: Boolean(spatialInputState.baseline),
    pitch: spatialInputState.pitch,
    roll: spatialInputState.roll,
    screenAngleDegrees,
    sampleCount: snapshot.sampleCount + 1,
    message: projection?.calibratedNow
      ? 'Device orientation is calibrated and controlling locally.'
      : snapshot.message,
  })
}

function removeSensorListeners(): void {
  if (!sensorListenersInstalled || typeof window === 'undefined') {
    sensorListenersInstalled = false
    return
  }
  window.removeEventListener('devicemotion', handleDeviceMotion)
  window.removeEventListener('deviceorientation', handleDeviceOrientation)
  sensorListenersInstalled = false
}

function installSensorListeners(): void {
  removeSensorListeners()
  if (typeof window === 'undefined') return
  if (motionSupported) window.addEventListener('devicemotion', handleDeviceMotion)
  if (orientationSupported) window.addEventListener('deviceorientation', handleDeviceOrientation)
  sensorListenersInstalled = motionSupported || orientationSupported
}

function removeScreenOrientationListener(): void {
  if (!screenOrientationTarget) return
  screenOrientationTarget.removeEventListener('change', handleScreenOrientationChange)
  screenOrientationTarget = null
}

function handleScreenOrientationChange(): void {
  recenterMotionControlDeviceSensors('Screen orientation changed; the next sample sets a fresh neutral pose.')
}

function installScreenOrientationListener(): void {
  removeScreenOrientationListener()
  if (!orientationSupported || typeof screen === 'undefined' || !screen.orientation) return
  screenOrientationTarget = screen.orientation
  screenOrientationTarget.addEventListener('change', handleScreenOrientationChange)
}

function removeLifecycleListeners(): void {
  if (!lifecycleListenersInstalled || typeof window === 'undefined' || typeof document === 'undefined') {
    lifecycleListenersInstalled = false
    return
  }
  window.removeEventListener('pagehide', stopForPageLifecycle)
  document.removeEventListener('visibilitychange', stopForPageLifecycle)
  lifecycleListenersInstalled = false
}

function stopForPageLifecycle(event: Event): void {
  if (event.type === 'visibilitychange' && typeof document !== 'undefined' && document.visibilityState !== 'hidden') return
  disableMotionControlDeviceSensors('Device sensors stopped because the page is no longer active.')
}

function installLifecycleListeners(): void {
  removeLifecycleListeners()
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  window.addEventListener('pagehide', stopForPageLifecycle)
  document.addEventListener('visibilitychange', stopForPageLifecycle)
  lifecycleListenersInstalled = true
}

export function readMotionControlDeviceSensorSnapshot(): MotionControlDeviceSensorSnapshot {
  return snapshot
}
export function subscribeMotionControlDeviceSensors(subscriber: () => void): () => void {
  subscribers.add(subscriber)
  return () => subscribers.delete(subscriber)
}

export function configureMotionControlDeviceSensorProfile(
  profile: MotionControlDeviceSensorProfileInput,
): MotionControlDeviceSensorSnapshot {
  const nextProfile = createAppleSpatialInputProfile(profile)
  if (appleSpatialInputProfilesEqual(nextProfile, spatialInputProfile)) return snapshot
  spatialInputProfile = nextProfile
  const measurements = resetSpatialInputMeasurements()
  publish({
    spatialInputProfile,
    ...measurements,
    message: snapshot.phase === 'running'
      ? 'Motion profile changed; the next orientation sample sets a fresh neutral pose.'
      : snapshot.message,
  })
  scheduleCalibrationTimeout()
  return snapshot
}

export function recenterMotionControlDeviceSensors(
  message = 'Hold the phone comfortably; the next orientation sample sets neutral.',
): MotionControlDeviceSensorSnapshot {
  if (snapshot.phase !== 'running') return snapshot
  publish({ ...resetSpatialInputMeasurements(), message })
  scheduleCalibrationTimeout()
  return snapshot
}

export async function enableMotionControlDeviceSensors(): Promise<MotionControlDeviceSensorSnapshot> {
  const intent = ++controlIntent
  removeSensorListeners()
  removeScreenOrientationListener()
  clearCalibrationTimer()
  resetSpatialInputMeasurements()

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    removeLifecycleListeners()
    publish({
      phase: 'unavailable',
      permission: 'unavailable',
      motion: null,
      orientation: null,
      ...resetSpatialInputMeasurements(),
      sampleCount: 0,
      message: 'Device sensors are unavailable outside a browser.',
    })
    return snapshot
  }

  if (String(document.visibilityState) === 'hidden') {
    removeLifecycleListeners()
    publish({
      phase: 'off',
      permission: 'unknown',
      motion: null,
      orientation: null,
      ...resetSpatialInputMeasurements(),
      sampleCount: 0,
      message: 'Device sensors cannot start while the page is hidden.',
    })
    return snapshot
  }

  const motionConstructor = readSensorConstructor('DeviceMotionEvent')
  const orientationConstructor = readSensorConstructor('DeviceOrientationEvent')
  motionSupported = Boolean(motionConstructor)
  orientationSupported = Boolean(orientationConstructor)
  if (!motionSupported && !orientationSupported) {
    removeLifecycleListeners()
    publish({
      phase: 'unavailable',
      permission: 'unavailable',
      motion: null,
      orientation: null,
      ...resetSpatialInputMeasurements(),
      sampleCount: 0,
      message: 'This browser does not expose device motion or orientation sensors.',
    })
    return snapshot
  }

  publish({
    phase: 'requesting-permission',
    permission: 'prompting',
    motion: null,
    orientation: null,
    ...resetSpatialInputMeasurements(),
    sampleCount: 0,
    message: 'Waiting for device sensor permission.',
  })
  installLifecycleListeners()

  // Both iOS permission functions are invoked synchronously in this explicit
  // Enable Sensors call, before the first await can leave the user gesture.
  const motionPermissionRequest = requestSensorPermission(motionConstructor)
  const orientationPermissionRequest = requestSensorPermission(orientationConstructor)
  const permissionResults = await Promise.all(
    [motionPermissionRequest, orientationPermissionRequest].filter((request): request is Promise<PermissionResult> => Boolean(request)),
  )

  if (intent !== controlIntent) return snapshot
  if (permissionResults.some(result => result !== 'granted')) {
    removeSensorListeners()
    removeScreenOrientationListener()
    removeLifecycleListeners()
    clearCalibrationTimer()
    publish({
      phase: 'denied',
      permission: 'denied',
      motion: null,
      orientation: null,
      ...resetSpatialInputMeasurements(),
      sampleCount: 0,
      message: 'Device sensor permission was denied. No sensor listeners were started.',
    })
    return snapshot
  }

  if (String(document.visibilityState) === 'hidden') {
    disableMotionControlDeviceSensors('Device sensors did not start because the page became hidden.')
    return snapshot
  }

  installSensorListeners()
  installScreenOrientationListener()
  publish({
    phase: 'running',
    permission: 'granted',
    motion: null,
    orientation: null,
    ...resetSpatialInputMeasurements(),
    sampleCount: 0,
    message: orientationSupported
      ? 'Device sensors are enabled locally; the first orientation sample sets neutral.'
      : 'Device motion is enabled locally; normalized orientation is unavailable.',
  })
  scheduleCalibrationTimeout()
  return snapshot
}

export function disableMotionControlDeviceSensors(message = 'Device sensors are disabled.'): MotionControlDeviceSensorSnapshot {
  ++controlIntent
  removeSensorListeners()
  removeScreenOrientationListener()
  removeLifecycleListeners()
  clearCalibrationTimer()
  motionSupported = false
  orientationSupported = false
  publish({
    phase: 'off',
    permission: snapshot.permission === 'prompting' ? 'unknown' : snapshot.permission,
    motion: null,
    orientation: null,
    ...resetSpatialInputMeasurements(),
    sampleCount: 0,
    message,
  })
  return snapshot
}
