export const MOTION_CONTROL_DEVICE_SENSOR_SCHEMA = 'knowgrph.motion-control-device-sensors/v1' as const

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
export type MotionControlDeviceSensorSnapshot = Readonly<{
  schema: typeof MOTION_CONTROL_DEVICE_SENSOR_SCHEMA
  phase: MotionControlDeviceSensorPhase
  permission: MotionControlDeviceSensorPermission
  motion: MotionControlDeviceMotionSample | null
  orientation: MotionControlDeviceOrientationSample | null
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
  phase: 'off',
  permission: 'unknown',
  motion: null,
  orientation: null,
  sampleCount: 0,
  message: 'Device sensors stay off until Enable Sensors is selected.',
  revision: 0,
})

let snapshot = INITIAL_SNAPSHOT
let controlIntent = 0
let sensorListenersInstalled = false
let lifecycleListenersInstalled = false
let motionSupported = false
let orientationSupported = false

function publish(update: Partial<Omit<MotionControlDeviceSensorSnapshot, 'schema' | 'revision'>>): void {
  snapshot = Object.freeze({ ...snapshot, ...update, revision: snapshot.revision + 1 })
  for (const subscriber of subscribers) {
    try {
      subscriber()
    } catch (error) {
      console.error('[knowgrph] device sensor subscriber failed', error)
    }
  }
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
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
  publish({
    orientation: Object.freeze({
      alpha: finiteNumber(event.alpha),
      beta: finiteNumber(event.beta),
      gamma: finiteNumber(event.gamma),
      absolute: Boolean(event.absolute),
    }),
    sampleCount: snapshot.sampleCount + 1,
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

export async function enableMotionControlDeviceSensors(): Promise<MotionControlDeviceSensorSnapshot> {
  const intent = ++controlIntent
  removeSensorListeners()

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    removeLifecycleListeners()
    publish({
      phase: 'unavailable',
      permission: 'unavailable',
      motion: null,
      orientation: null,
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
    removeLifecycleListeners()
    publish({
      phase: 'denied',
      permission: 'denied',
      motion: null,
      orientation: null,
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
  publish({
    phase: 'running',
    permission: 'granted',
    motion: null,
    orientation: null,
    sampleCount: 0,
    message: 'Device sensors are enabled locally.',
  })
  return snapshot
}

export function disableMotionControlDeviceSensors(message = 'Device sensors are disabled.'): MotionControlDeviceSensorSnapshot {
  ++controlIntent
  removeSensorListeners()
  removeLifecycleListeners()
  motionSupported = false
  orientationSupported = false
  publish({
    phase: 'off',
    permission: snapshot.permission === 'prompting' ? 'unknown' : snapshot.permission,
    motion: null,
    orientation: null,
    sampleCount: 0,
    message,
  })
  return snapshot
}
