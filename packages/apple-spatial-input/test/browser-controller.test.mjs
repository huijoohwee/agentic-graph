import assert from 'node:assert/strict'
import test from 'node:test'
import { BrowserAppleSensorController } from '../dist/src/index.js'

class TrackedTarget extends EventTarget {
  listeners = new Map()

  addEventListener(type, listener) {
    super.addEventListener(type, listener)
    const values = this.listeners.get(type) ?? new Set()
    values.add(listener)
    this.listeners.set(type, values)
  }

  removeEventListener(type, listener) {
    super.removeEventListener(type, listener)
    this.listeners.get(type)?.delete(listener)
  }

  count(type) {
    return this.listeners.get(type)?.size ?? 0
  }
}

function orientationEvent({ beta, gamma, timestampMilliseconds }) {
  const event = new Event('deviceorientation')
  Object.defineProperties(event, {
    alpha: { value: 0 },
    beta: { value: beta },
    gamma: { value: gamma },
    absolute: { value: true },
    timeStamp: { value: timestampMilliseconds },
  })
  return event
}

test('Safari permissions stay in the gesture stack and lifecycle cleanup is complete', async () => {
  const windowTarget = new TrackedTarget()
  const documentTarget = Object.assign(new TrackedTarget(), { visibilityState: 'visible' })
  const screenOrientation = Object.assign(new TrackedTarget(), { angle: 0 })
  const permissionCalls = []
  let grantMotion
  let grantOrientation
  const motionPermission = new Promise(resolve => { grantMotion = resolve })
  const orientationPermission = new Promise(resolve => { grantOrientation = resolve })
  const controller = new BrowserAppleSensorController({
    environment: {
      window: windowTarget,
      document: documentTarget,
      screenOrientation,
      motionEventConstructor: { requestPermission: () => {
        permissionCalls.push('motion')
        return motionPermission
      } },
      orientationEventConstructor: { requestPermission: () => {
        permissionCalls.push('orientation')
        return orientationPermission
      } },
      setTimeout: () => 1,
      clearTimeout: () => {},
    },
  })

  const enabling = controller.enable()
  assert.deepEqual(permissionCalls, ['motion', 'orientation'])
  assert.equal(controller.readSnapshot().phase, 'requesting-permission')
  assert.equal(windowTarget.count('deviceorientation'), 0)
  grantMotion('granted')
  grantOrientation('granted')
  await enabling
  assert.equal(controller.readSnapshot().phase, 'running')
  assert.equal(windowTarget.count('devicemotion'), 1)
  assert.equal(windowTarget.count('deviceorientation'), 1)

  windowTarget.dispatchEvent(orientationEvent({ beta: 10, gamma: 12, timestampMilliseconds: Number.NaN }))
  assert.equal(controller.readSnapshot().sampleCount, 0, 'non-finite timestamps must be rejected')
  windowTarget.dispatchEvent(orientationEvent({ beta: 10, gamma: 12, timestampMilliseconds: 1_000 }))
  assert.equal(controller.readSnapshot().calibrated, true)
  windowTarget.dispatchEvent(orientationEvent({ beta: 30, gamma: 12, timestampMilliseconds: 1_050 }))
  assert.ok(controller.readSnapshot().pitch > 0)

  screenOrientation.angle = 90
  screenOrientation.dispatchEvent(new Event('change'))
  assert.equal(controller.readSnapshot().calibrated, false)
  documentTarget.visibilityState = 'hidden'
  documentTarget.dispatchEvent(new Event('visibilitychange'))
  assert.equal(controller.readSnapshot().phase, 'off')
  assert.equal(windowTarget.count('devicemotion'), 0)
  assert.equal(windowTarget.count('deviceorientation'), 0)
  assert.equal(screenOrientation.count('change'), 0)
  controller.dispose()
})

test('motion and orientation streams are independently optional', async () => {
  const windowTarget = new TrackedTarget()
  const documentTarget = Object.assign(new TrackedTarget(), { visibilityState: 'visible' })
  const controller = new BrowserAppleSensorController({
    enableOrientation: false,
    environment: {
      window: windowTarget,
      document: documentTarget,
      screenOrientation: null,
      motionEventConstructor: {},
      orientationEventConstructor: null,
    },
  })
  await controller.enable()
  assert.equal(controller.readSnapshot().motionEnabled, true)
  assert.equal(controller.readSnapshot().orientationEnabled, false)
  assert.equal(windowTarget.count('devicemotion'), 1)
  assert.equal(windowTarget.count('deviceorientation'), 0)
  windowTarget.dispatchEvent(Object.assign(new Event('devicemotion'), {
    acceleration: { x: 1, y: 2, z: 3 },
    accelerationIncludingGravity: null,
    rotationRate: null,
    interval: 16,
  }))
  assert.equal(controller.readSnapshot().motion.acceleration.y, 2)
  controller.dispose()
})
