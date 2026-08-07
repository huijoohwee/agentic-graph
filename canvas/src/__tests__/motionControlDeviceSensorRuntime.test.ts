import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  configureMotionControlDeviceSensorProfile,
  disableMotionControlDeviceSensors,
  enableMotionControlDeviceSensors,
  readMotionControlDeviceSensorSnapshot,
  recenterMotionControlDeviceSensors,
} from '@/features/three/motionControlDeviceSensorRuntime'

class TrackedEventTarget extends EventTarget {
  readonly activeListeners = new Map<string, Set<EventListenerOrEventListenerObject>>()

  override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void {
    super.addEventListener(type, callback, options)
    if (!callback) return
    const callbacks = this.activeListeners.get(type) || new Set<EventListenerOrEventListenerObject>()
    callbacks.add(callback)
    this.activeListeners.set(type, callbacks)
  }

  override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void {
    super.removeEventListener(type, callback, options)
    if (!callback) return
    this.activeListeners.get(type)?.delete(callback)
  }

  listenerCount(type: string): number {
    return this.activeListeners.get(type)?.size || 0
  }
}

const preserveGlobalDescriptors = (keys: string[]): Map<string, PropertyDescriptor | undefined> =>
  new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))

const restoreGlobalDescriptors = (descriptors: Map<string, PropertyDescriptor | undefined>): void => {
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
}

function deviceOrientationEvent(input: {
  alpha: number | null
  beta: number | null
  gamma: number | null
  absolute: boolean
  timestampMilliseconds: number
}): Event {
  const event = new Event('deviceorientation')
  Object.defineProperties(event, {
    alpha: { configurable: true, enumerable: true, value: input.alpha },
    beta: { configurable: true, enumerable: true, value: input.beta },
    gamma: { configurable: true, enumerable: true, value: input.gamma },
    absolute: { configurable: true, enumerable: true, value: input.absolute },
    timeStamp: { configurable: true, enumerable: true, value: input.timestampMilliseconds },
  })
  return event
}

export async function testMotionControlDeviceSensorsRequireExplicitPermissionAndCleanUp(): Promise<void> {
  const descriptors = preserveGlobalDescriptors(['window', 'document', 'screen', 'DeviceMotionEvent', 'DeviceOrientationEvent'])
  const fakeWindow = new TrackedEventTarget()
  const fakeDocument = Object.assign(new TrackedEventTarget(), { visibilityState: 'visible' })
  const fakeScreenOrientation = Object.assign(new TrackedEventTarget(), { angle: 0 })
  const permissionCalls: string[] = []
  let resolveMotionPermission: (value: string) => void = () => void 0
  let resolveOrientationPermission: (value: string) => void = () => void 0
  let motionPermission = new Promise<string>(resolve => { resolveMotionPermission = resolve })
  let orientationPermission = new Promise<string>(resolve => { resolveOrientationPermission = resolve })
  const originalProfile = readMotionControlDeviceSensorSnapshot().spatialInputProfile

  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow })
    Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument })
    Object.defineProperty(globalThis, 'screen', {
      configurable: true,
      value: { orientation: fakeScreenOrientation },
    })
    Object.defineProperty(globalThis, 'DeviceMotionEvent', {
      configurable: true,
      value: { requestPermission: () => {
        permissionCalls.push('motion')
        return motionPermission
      } },
    })
    Object.defineProperty(globalThis, 'DeviceOrientationEvent', {
      configurable: true,
      value: { requestPermission: () => {
        permissionCalls.push('orientation')
        return orientationPermission
      } },
    })

    disableMotionControlDeviceSensors()
    assert.deepEqual(permissionCalls, [], 'importing and disabling the runtime must not request sensor permission')
    assert.equal(fakeWindow.listenerCount('devicemotion'), 0)
    assert.equal(fakeWindow.listenerCount('deviceorientation'), 0)

    const enabling = enableMotionControlDeviceSensors()
    assert.deepEqual(
      permissionCalls,
      ['motion', 'orientation'],
      'both iOS permission APIs must be invoked synchronously inside the explicit enable call',
    )
    assert.equal(readMotionControlDeviceSensorSnapshot().phase, 'requesting-permission')
    assert.equal(fakeWindow.listenerCount('devicemotion'), 0, 'sensor listeners must wait for permission')
    assert.equal(fakeWindow.listenerCount('deviceorientation'), 0, 'sensor listeners must wait for permission')

    resolveMotionPermission('granted')
    resolveOrientationPermission('granted')
    await enabling
    const running = readMotionControlDeviceSensorSnapshot()
    assert.equal(running.schema, 'knowgrph.motion-control-device-sensors/v2')
    assert.equal(running.spatialInputSchema, 'airvio.apple-spatial-input/v1')
    assert.equal(running.phase, 'running')
    assert.equal(running.calibrated, false)
    assert.deepEqual({ pitch: running.pitch, roll: running.roll }, { pitch: 0, roll: 0 })
    assert.equal(fakeWindow.listenerCount('devicemotion'), 1)
    assert.equal(fakeWindow.listenerCount('deviceorientation'), 1)
    assert.equal(fakeScreenOrientation.listenerCount('change'), 1)

    fakeWindow.dispatchEvent(deviceOrientationEvent({
      alpha: 10,
      beta: Number.NaN,
      gamma: 12,
      absolute: true,
      timestampMilliseconds: Number.NaN,
    }))
    const invalid = readMotionControlDeviceSensorSnapshot()
    assert.equal(invalid.calibrated, false)
    assert.equal(invalid.orientation?.beta, null)
    assert.deepEqual({ pitch: invalid.pitch, roll: invalid.roll }, { pitch: 0, roll: 0 })

    fakeWindow.dispatchEvent(Object.assign(new Event('devicemotion'), {
      acceleration: { x: 1, y: 2, z: 3 },
      accelerationIncludingGravity: { x: 4, y: 5, z: 6 },
      rotationRate: { alpha: 7, beta: 8, gamma: 9 },
      interval: 16.7,
    }))
    fakeWindow.dispatchEvent(deviceOrientationEvent({
      alpha: 10,
      beta: 11,
      gamma: 12,
      absolute: true,
      timestampMilliseconds: 1_000,
    }))
    const calibrated = readMotionControlDeviceSensorSnapshot()
    assert.equal(calibrated.calibrated, true)
    assert.deepEqual({ pitch: calibrated.pitch, roll: calibrated.roll }, { pitch: 0, roll: 0 })

    fakeWindow.dispatchEvent(deviceOrientationEvent({
      alpha: 10,
      beta: 46,
      gamma: 12,
      absolute: true,
      timestampMilliseconds: 1_016,
    }))
    const sampled = readMotionControlDeviceSensorSnapshot()
    assert.equal(sampled.sampleCount, 4)
    assert.deepEqual(sampled.motion?.acceleration, { x: 1, y: 2, z: 3 })
    assert.equal(sampled.orientation?.absolute, true)
    assert.ok(sampled.pitch > 0 && sampled.pitch <= 1)
    assert.equal(sampled.roll, 0)

    fakeScreenOrientation.angle = 90
    fakeScreenOrientation.dispatchEvent(new Event('change'))
    const rotated = readMotionControlDeviceSensorSnapshot()
    assert.equal(rotated.calibrated, false)
    assert.equal(rotated.screenAngleDegrees, 90)
    assert.deepEqual({ pitch: rotated.pitch, roll: rotated.roll }, { pitch: 0, roll: 0 })

    fakeWindow.dispatchEvent(deviceOrientationEvent({
      alpha: 10,
      beta: 46,
      gamma: 12,
      absolute: true,
      timestampMilliseconds: 1_032,
    }))
    assert.equal(readMotionControlDeviceSensorSnapshot().calibrated, true)
    fakeWindow.dispatchEvent(deviceOrientationEvent({
      alpha: 10,
      beta: 46,
      gamma: 47,
      absolute: true,
      timestampMilliseconds: 1_048,
    }))
    assert.ok(readMotionControlDeviceSensorSnapshot().pitch > 0, 'landscape gamma must map to screen-relative pitch')

    const recentered = recenterMotionControlDeviceSensors()
    assert.equal(recentered.calibrated, false)
    assert.deepEqual({ pitch: recentered.pitch, roll: recentered.roll }, { pitch: 0, roll: 0 })
    fakeWindow.dispatchEvent(deviceOrientationEvent({
      alpha: 10,
      beta: 46,
      gamma: 47,
      absolute: true,
      timestampMilliseconds: 1_064,
    }))
    assert.equal(readMotionControlDeviceSensorSnapshot().calibrated, true)

    const configured = configureMotionControlDeviceSensorProfile({
      ...readMotionControlDeviceSensorSnapshot().spatialInputProfile,
      controlRangeDegrees: 20,
    })
    assert.equal(configured.spatialInputProfile.controlRangeDegrees, 20)
    assert.equal(configured.calibrated, false, 'a changed user profile must recenter')
    assert.throws(() => configureMotionControlDeviceSensorProfile({
      ...configured.spatialInputProfile,
      unexpected: true,
    } as never), /Unknown Apple spatial-input profile key/)
    assert.throws(() => configureMotionControlDeviceSensorProfile({
      ...configured.spatialInputProfile,
      smoothingRatePerSecond: 0,
    }), /smoothingRatePerSecond/)

    disableMotionControlDeviceSensors()
    const disabled = readMotionControlDeviceSensorSnapshot()
    assert.equal(disabled.phase, 'off')
    assert.equal(disabled.sampleCount, 0)
    assert.equal(disabled.motion, null)
    assert.equal(disabled.orientation, null)
    assert.equal(disabled.calibrated, false)
    assert.deepEqual({ pitch: disabled.pitch, roll: disabled.roll }, { pitch: 0, roll: 0 })
    assert.equal(fakeWindow.listenerCount('devicemotion'), 0)
    assert.equal(fakeWindow.listenerCount('deviceorientation'), 0)
    assert.equal(fakeScreenOrientation.listenerCount('change'), 0)

    permissionCalls.length = 0
    motionPermission = Promise.resolve('granted')
    orientationPermission = Promise.resolve('denied')
    await enableMotionControlDeviceSensors()
    const denied = readMotionControlDeviceSensorSnapshot()
    assert.deepEqual(permissionCalls, ['motion', 'orientation'])
    assert.equal(denied.phase, 'denied')
    assert.equal(denied.permission, 'denied')
    assert.equal(denied.sampleCount, 0)
    assert.equal(fakeWindow.listenerCount('devicemotion'), 0, 'a partial permission grant must fail closed')
    assert.equal(fakeWindow.listenerCount('deviceorientation'), 0, 'a partial permission grant must fail closed')
    assert.equal(fakeScreenOrientation.listenerCount('change'), 0)

    motionPermission = Promise.resolve('granted')
    orientationPermission = Promise.resolve('granted')
    await enableMotionControlDeviceSensors()
    fakeWindow.dispatchEvent(Object.assign(new Event('devicemotion'), {
      acceleration: { x: 1, y: 1, z: 1 },
      accelerationIncludingGravity: null,
      rotationRate: null,
      interval: 16,
    }))
    fakeDocument.visibilityState = 'hidden'
    fakeDocument.dispatchEvent(new Event('visibilitychange'))
    const hidden = readMotionControlDeviceSensorSnapshot()
    assert.equal(hidden.phase, 'off')
    assert.equal(hidden.sampleCount, 0)
    assert.equal(hidden.motion, null)
    assert.equal(fakeWindow.listenerCount('devicemotion'), 0)
    assert.equal(fakeScreenOrientation.listenerCount('change'), 0)

    fakeDocument.visibilityState = 'visible'
    await enableMotionControlDeviceSensors()
    fakeWindow.dispatchEvent(new Event('pagehide'))
    const pageHidden = readMotionControlDeviceSensorSnapshot()
    assert.equal(pageHidden.phase, 'off')
    assert.equal(pageHidden.sampleCount, 0)
    assert.equal(fakeWindow.listenerCount('devicemotion'), 0)
    assert.equal(fakeWindow.listenerCount('deviceorientation'), 0)
    assert.equal(fakeScreenOrientation.listenerCount('change'), 0)
  } finally {
    disableMotionControlDeviceSensors()
    configureMotionControlDeviceSensorProfile(originalProfile)
    restoreGlobalDescriptors(descriptors)
  }
}

export function testMotionControlDeviceSensorsHaveNoPersistenceOrEgressPath(): void {
  const runtimeSource = readFileSync(resolve(process.cwd(), 'src/features/three/motionControlDeviceSensorRuntime.ts'), 'utf8')
  for (const forbidden of ['fetch(', 'sendBeacon', 'WebSocket', 'localStorage', 'sessionStorage', 'indexedDB']) {
    assert.equal(runtimeSource.includes(forbidden), false, `device sensor runtime must not contain ${forbidden}`)
  }
  const panelSource = readFileSync(resolve(process.cwd(), 'src/features/three/MotionControlFloatingPanelView.tsx'), 'utf8')
  assert.match(panelSource, /Enable Sensors/)
  assert.match(panelSource, /Disable Sensors/)
  assert.match(panelSource, /disableMotionControlDeviceSensors\('Device sensors stopped because the Motion Control surface closed\.'\)/)
  assert.match(panelSource, /stopMotionControl\('Motion Control stopped because its control surface closed\.'\)/)
}
