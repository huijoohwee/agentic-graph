import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  disableMotionControlDeviceSensors,
  enableMotionControlDeviceSensors,
  readMotionControlDeviceSensorSnapshot,
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

export async function testMotionControlDeviceSensorsRequireExplicitPermissionAndCleanUp(): Promise<void> {
  const descriptors = preserveGlobalDescriptors(['window', 'document', 'DeviceMotionEvent', 'DeviceOrientationEvent'])
  const fakeWindow = new TrackedEventTarget()
  const fakeDocument = Object.assign(new TrackedEventTarget(), { visibilityState: 'visible' })
  const permissionCalls: string[] = []
  let resolveMotionPermission: (value: string) => void = () => void 0
  let resolveOrientationPermission: (value: string) => void = () => void 0
  let motionPermission = new Promise<string>(resolve => { resolveMotionPermission = resolve })
  let orientationPermission = new Promise<string>(resolve => { resolveOrientationPermission = resolve })

  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow })
    Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument })
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
    assert.equal(readMotionControlDeviceSensorSnapshot().phase, 'running')
    assert.equal(fakeWindow.listenerCount('devicemotion'), 1)
    assert.equal(fakeWindow.listenerCount('deviceorientation'), 1)

    fakeWindow.dispatchEvent(Object.assign(new Event('devicemotion'), {
      acceleration: { x: 1, y: 2, z: 3 },
      accelerationIncludingGravity: { x: 4, y: 5, z: 6 },
      rotationRate: { alpha: 7, beta: 8, gamma: 9 },
      interval: 16.7,
    }))
    fakeWindow.dispatchEvent(Object.assign(new Event('deviceorientation'), {
      alpha: 10,
      beta: 11,
      gamma: 12,
      absolute: true,
    }))
    const sampled = readMotionControlDeviceSensorSnapshot()
    assert.equal(sampled.sampleCount, 2)
    assert.deepEqual(sampled.motion?.acceleration, { x: 1, y: 2, z: 3 })
    assert.equal(sampled.orientation?.absolute, true)

    disableMotionControlDeviceSensors()
    const disabled = readMotionControlDeviceSensorSnapshot()
    assert.equal(disabled.phase, 'off')
    assert.equal(disabled.sampleCount, 0)
    assert.equal(disabled.motion, null)
    assert.equal(disabled.orientation, null)
    assert.equal(fakeWindow.listenerCount('devicemotion'), 0)
    assert.equal(fakeWindow.listenerCount('deviceorientation'), 0)

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

    fakeDocument.visibilityState = 'visible'
    await enableMotionControlDeviceSensors()
    fakeWindow.dispatchEvent(new Event('pagehide'))
    const pageHidden = readMotionControlDeviceSensorSnapshot()
    assert.equal(pageHidden.phase, 'off')
    assert.equal(pageHidden.sampleCount, 0)
    assert.equal(fakeWindow.listenerCount('devicemotion'), 0)
    assert.equal(fakeWindow.listenerCount('deviceorientation'), 0)
  } finally {
    disableMotionControlDeviceSensors()
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
