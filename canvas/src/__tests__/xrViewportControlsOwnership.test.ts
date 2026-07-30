import { PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { createCameraFramingSettledInteraction } from '@/features/three/cameraFramingControlsRuntime'
import {
  bindThreeViewportControlsOwnership,
  canStartThreeObjectDrag,
  captureThreeObjectPointer,
  claimThreeObjectKeyboardInputOwnership,
  claimThreeObjectInputOwnership,
  createThreeObjectCameraPoseLock,
  hasThreeObjectDragMoved,
  isolateThreeObjectPointerEvent,
  readThreeObjectInputOwnership,
  releaseThreeObjectPointerCapture,
  releaseThreeObjectKeyboardInputOwnership,
  releaseThreeObjectInputOwnership,
  threeObjectDragTerminationMatchesPointer,
} from '@/features/three/threeObjectInputOwnership'
import {
  claimThreeViewportInputOwnership,
  readThreeViewportInputOwnership,
  releaseThreeViewportInputOwnership,
  shouldDeferThreeCameraProgrammaticInput,
  subscribeThreeViewportInputOwnership,
} from '@/features/three/threeViewportInputOwnership'

function assertCondition(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

type PointerEventWindow = {
  MouseEvent: typeof MouseEvent
}

function dispatchPointer(
  target: EventTarget,
  window: PointerEventWindow,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  args: { x: number; y: number; buttons: number },
): void {
  const event = new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: args.buttons,
    clientX: args.x,
    clientY: args.y,
  })
  Object.defineProperties(event, {
    pointerId: { configurable: true, value: 1 },
    pointerType: { configurable: true, value: 'mouse' },
    pageX: { configurable: true, value: args.x },
    pageY: { configurable: true, value: args.y },
  })
  target.dispatchEvent(event)
}

export function testXrObjectInputOwnershipPublishesSynchronously() {
  releaseThreeObjectInputOwnership('xr:actor:actor-a:mark-a')
  const controls = { enabled: true }
  const unsubscribe = bindThreeViewportControlsOwnership({ controls, baseEnabled: true })
  try {
    claimThreeObjectInputOwnership('xr:actor:actor-a:mark-a', 7)
    assertCondition(!controls.enabled, 'expected XR object ownership to disable viewport controls before the setter returns')
    releaseThreeObjectInputOwnership('xr:actor:actor-a:mark-a', 7)
    assertCondition(controls.enabled, 'expected releasing XR object ownership to restore available viewport controls')
    claimThreeObjectKeyboardInputOwnership('xr:keyboard:actor-a:mark-a')
    assertCondition(!controls.enabled, 'expected XR keyboard motion to disable viewport controls synchronously')
    assertCondition(readThreeObjectInputOwnership().pointerId === -1, 'expected keyboard motion to use the non-pointer ownership channel')
    releaseThreeObjectKeyboardInputOwnership('xr:keyboard:actor-a:mark-a')
    assertCondition(controls.enabled, 'expected XR keyboard release to restore viewport controls')
    unsubscribe()
    claimThreeObjectInputOwnership('xr:actor:actor-a:mark-a', 7)
    assertCondition(controls.enabled, 'expected disposal to detach the viewport ownership subscriber')
  } finally {
    releaseThreeObjectInputOwnership('xr:actor:actor-a:mark-a')
    unsubscribe()
  }

  const externallyDisabledControls = { enabled: true }
  const releaseExternalOwner = bindThreeViewportControlsOwnership({
    controls: externallyDisabledControls,
    baseEnabled: false,
  })
  try {
    claimThreeObjectInputOwnership('xr:mark:actor-a:mark-a', 9)
    releaseThreeObjectInputOwnership('xr:mark:actor-a:mark-a', 9)
    assertCondition(!externallyDisabledControls.enabled, 'expected drag release to preserve another camera owner')
  } finally {
    releaseExternalOwner()
    releaseThreeObjectInputOwnership('xr:mark:actor-a:mark-a')
  }
}

export function testThreeObjectInputOwnershipPublishesSynchronously() {
  releaseThreeObjectInputOwnership('node-a')
  const controls = { enabled: true }
  const unsubscribe = bindThreeViewportControlsOwnership({ controls, baseEnabled: true })
  try {
    assertCondition(canStartThreeObjectDrag(0), 'expected primary pointer drag without a keyboard modifier')
    assertCondition(!canStartThreeObjectDrag(1) && !canStartThreeObjectDrag(2), 'expected auxiliary pointers to remain camera inputs')
    assertCondition(!hasThreeObjectDragMoved({ x: 10, y: 10 }, { x: 12, y: 11 }), 'expected click jitter to remain selection-only')
    assertCondition(hasThreeObjectDragMoved({ x: 10, y: 10 }, { x: 14, y: 10 }), 'expected deliberate pointer motion to start object movement')
    assertCondition(claimThreeObjectInputOwnership('node-a', 7), 'expected the first pointer to claim object input')
    assertCondition(!controls.enabled, 'expected node pointerdown to synchronously disable viewport controls')
    assertCondition(readThreeObjectInputOwnership().objectId === 'node-a', 'expected ownership to identify the dragged object')
    assertCondition(!claimThreeObjectInputOwnership('node-b', 8), 'expected a second pointer to be unable to steal object input')
    releaseThreeObjectInputOwnership('node-a', 8)
    assertCondition(!controls.enabled, 'expected a second pointer to preserve the active object owner')
    releaseThreeObjectInputOwnership('node-a', 7)
    assertCondition(controls.enabled, 'expected the owning pointer to restore viewport controls')
  } finally {
    releaseThreeObjectInputOwnership('node-a')
    unsubscribe()
  }
}

export function testXrViewportDragTerminationHonorsPointerOwnership() {
  assertCondition(
    threeObjectDragTerminationMatchesPointer({ pointerId: 7 }, 7),
    'expected the active pointer to finish its XR object drag',
  )
  assertCondition(
    !threeObjectDragTerminationMatchesPointer({ pointerId: 8 }, 7),
    'expected a second pointer to leave the active XR object drag owned',
  )
  assertCondition(
    threeObjectDragTerminationMatchesPointer({}, 7),
    'expected non-pointer cancellation such as blur or hidden visibility to finish the XR object drag',
  )
}

export function testThreeObjectPointerEventsBlockNativeCameraHandlers() {
  const target = new EventTarget()
  let r3fPropagationStopped = false
  let cameraHandlerCalls = 0
  target.addEventListener('pointerdown', nativeEvent => {
    isolateThreeObjectPointerEvent({
      stopPropagation: () => { r3fPropagationStopped = true },
      nativeEvent,
    })
  })
  target.addEventListener('pointerdown', () => { cameraHandlerCalls += 1 })
  const event = new Event('pointerdown', { cancelable: true })
  target.dispatchEvent(event)
  assertCondition(r3fPropagationStopped, 'expected owned object gestures to stop R3F selection bubbling')
  assertCondition(event.defaultPrevented, 'expected owned object gestures to prevent the native canvas default')
  assertCondition(cameraHandlerCalls === 0, 'expected owned object gestures to stop later native OrbitControls handlers')

  const captured: number[] = []
  const released: number[] = []
  const pointerEvent = {
    pointerId: 7,
    target: {
      setPointerCapture: (pointerId: number) => captured.push(pointerId),
      releasePointerCapture: (pointerId: number) => released.push(pointerId),
    },
    nativeEvent: { target: new EventTarget() },
  }
  captureThreeObjectPointer(pointerEvent)
  releaseThreeObjectPointerCapture(pointerEvent)
  assertCondition(captured[0] === 7, 'expected R3F event target to retain the active object pointer stream')
  assertCondition(released[0] === 7, 'expected R3F event target to release the owned pointer stream')
}

export function testThreeObjectCameraPoseRemainsLockedUntilRelease() {
  let cameraPose = 10
  const restoredPoses: number[] = []
  const poseLock = createThreeObjectCameraPoseLock({
    capture: () => cameraPose,
    restore: pose => {
      cameraPose = pose
      restoredPoses.push(pose)
    },
  })
  const controls = { enabled: true }
  const unsubscribe = bindThreeViewportControlsOwnership({
    controls,
    baseEnabled: true,
    onActiveChange: active => {
      if (active) poseLock.start()
      else poseLock.finish()
    },
  })
  try {
    claimThreeObjectInputOwnership('xr:actor:actor-a:mark-a', 7)
    cameraPose = 42
    poseLock.enforce()
    assertCondition(cameraPose === 10, 'expected an owned object gesture to preserve the camera pose captured on claim')
    cameraPose = 84
    releaseThreeObjectInputOwnership('xr:actor:actor-a:mark-a', 7)
    assertCondition(cameraPose === 10, 'expected object release to restore the exact pre-drag camera pose')
    assertCondition(controls.enabled, 'expected camera navigation to resume after the pose is restored')
    assertCondition(restoredPoses.length === 2, 'expected one active enforcement and one release restoration')
    claimThreeObjectKeyboardInputOwnership('xr:keyboard:actor-a:mark-a')
    cameraPose = 24
    poseLock.enforce()
    assertCondition(cameraPose === 10, 'expected keyboard object motion to preserve the camera pose captured on claim')
    cameraPose = 37
    releaseThreeObjectKeyboardInputOwnership('xr:keyboard:actor-a:mark-a')
    assertCondition(cameraPose === 10, 'expected keyboard release to restore the exact pre-motion camera pose')
    assertCondition(controls.enabled, 'expected camera navigation to resume after keyboard motion releases ownership')
    assertCondition(restoredPoses.length === 4, 'expected pointer and keyboard motion to enforce and restore the camera pose')
  } finally {
    releaseThreeObjectInputOwnership('xr:actor:actor-a:mark-a')
    releaseThreeObjectKeyboardInputOwnership('xr:keyboard:actor-a:mark-a')
    unsubscribe()
  }
}

export function testThreeViewportGestureOwnershipPublishesSynchronously() {
  const ownerId = 'orbit-controls:test'
  releaseThreeViewportInputOwnership(ownerId)
  let notificationCount = 0
  const unsubscribe = subscribeThreeViewportInputOwnership(() => { notificationCount += 1 })
  try {
    assertCondition(claimThreeViewportInputOwnership(ownerId), 'expected OrbitControls to claim the manual camera gesture')
    assertCondition(readThreeViewportInputOwnership().ownerId === ownerId, 'expected viewport ownership to identify the camera gesture owner')
    assertCondition(!claimThreeViewportInputOwnership('orbit-controls:other'), 'expected another viewport to be unable to steal the camera gesture')
    assertCondition(
      shouldDeferThreeCameraProgrammaticInput({
        objectInputActive: false,
        viewportInputBlocksProgrammaticCamera: true,
      }),
      'expected framing and playback camera writes to defer during manual viewport input',
    )
    releaseThreeViewportInputOwnership('orbit-controls:other')
    assertCondition(readThreeViewportInputOwnership().active, 'expected a non-owner release to preserve manual viewport input')
    releaseThreeViewportInputOwnership(ownerId)
    assertCondition(!readThreeViewportInputOwnership().active, 'expected the owning viewport to release camera input')
    assertCondition(notificationCount === 2, 'expected synchronous claim and release notifications only')
  } finally {
    unsubscribe()
    releaseThreeViewportInputOwnership(ownerId)
  }
}

export function testThreeViewportOwnershipSpansSettledCameraCommit() {
  const ownerId = 'orbit-controls:settled'
  releaseThreeViewportInputOwnership(ownerId)
  const pending: Array<() => void> = []
  let published = 0
  const settled = createCameraFramingSettledInteraction({
    delayMs: 80,
    scheduler: {
      schedule: callback => {
        pending.push(callback)
        return callback
      },
      cancel: handle => {
        const index = pending.indexOf(handle as () => void)
        if (index >= 0) pending.splice(index, 1)
      },
    },
    publish: () => {
      published += 1
      releaseThreeViewportInputOwnership(ownerId)
    },
  })
  try {
    claimThreeViewportInputOwnership(ownerId)
    settled.start()
    settled.end()
    assertCondition(readThreeViewportInputOwnership().active, 'expected damping settle to retain manual camera ownership')
    assertCondition(published === 0 && pending.length === 1, 'expected the camera pose commit to remain pending')
    pending.shift()?.()
    assertCondition(published === 1, 'expected one settled camera pose commit')
    assertCondition(!readThreeViewportInputOwnership().active, 'expected camera ownership to release only after the settled commit')
  } finally {
    settled.cancel()
    releaseThreeViewportInputOwnership(ownerId)
  }
}

export function testThreeObjectDragSuppressesOrbitControlsBeforePointerMove() {
  const { dom, restore } = initJsdomHarness()
  const canvas = dom.window.document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { configurable: true, value: 800 },
    clientHeight: { configurable: true, value: 600 },
    setPointerCapture: { configurable: true, value: () => undefined },
    releasePointerCapture: { configurable: true, value: () => undefined },
  })
  dom.window.document.body.appendChild(canvas)
  const camera = new PerspectiveCamera(50, 4 / 3, 0.1, 1000)
  camera.position.set(0, 0, 10)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = false
  controls.target.set(0, 0, 0)
  controls.update()

  const resetPose = () => {
    camera.position.set(0, 0, 10)
    controls.target.set(0, 0, 0)
    controls.update()
  }
  const drag = () => {
    dispatchPointer(canvas, dom.window as unknown as PointerEventWindow, 'pointerdown', { x: 400, y: 300, buttons: 1 })
    dispatchPointer(canvas, dom.window as unknown as PointerEventWindow, 'pointermove', { x: 560, y: 390, buttons: 1 })
    dispatchPointer(canvas, dom.window as unknown as PointerEventWindow, 'pointerup', { x: 560, y: 390, buttons: 0 })
  }

  try {
    const initialPosition = camera.position.clone()
    drag()
    assertCondition(camera.position.distanceTo(initialPosition) > 1, 'expected the OrbitControls harness to rotate when no object owns the drag')
    resetPose()

    const releaseOwnership = bindThreeViewportControlsOwnership({ controls, baseEnabled: true })
    const claimObjectDrag = () => claimThreeObjectInputOwnership('node-a', 1)
    const releaseObjectDrag = () => releaseThreeObjectInputOwnership('node-a', 1)
    canvas.addEventListener('pointerdown', claimObjectDrag)
    canvas.addEventListener('pointerup', releaseObjectDrag)
    canvas.addEventListener('pointercancel', releaseObjectDrag)
    canvas.addEventListener('lostpointercapture', releaseObjectDrag)
    try {
      const expectedPosition = camera.position.clone()
      const expectedQuaternion = camera.quaternion.clone()
      const expectedTarget = controls.target.clone()
      dispatchPointer(canvas, dom.window as unknown as PointerEventWindow, 'pointerdown', { x: 400, y: 300, buttons: 1 })
      assertCondition(!controls.enabled, 'expected the object pointerdown to synchronously claim camera controls')
      dispatchPointer(canvas, dom.window as unknown as PointerEventWindow, 'pointermove', { x: 560, y: 390, buttons: 1 })
      canvas.dispatchEvent(new dom.window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 240 }))
      dispatchPointer(canvas, dom.window as unknown as PointerEventWindow, 'pointerup', { x: 560, y: 390, buttons: 0 })
      controls.update()
      assertCondition(camera.position.equals(expectedPosition), 'expected object dragging to preserve the camera position')
      assertCondition(camera.quaternion.equals(expectedQuaternion), 'expected object dragging to preserve the camera orientation')
      assertCondition(controls.target.equals(expectedTarget), 'expected object dragging to preserve the OrbitControls target')
      assertCondition(controls.enabled, 'expected pointerup to restore camera controls')
    } finally {
      canvas.removeEventListener('pointerdown', claimObjectDrag)
      canvas.removeEventListener('pointerup', releaseObjectDrag)
      canvas.removeEventListener('pointercancel', releaseObjectDrag)
      canvas.removeEventListener('lostpointercapture', releaseObjectDrag)
      releaseOwnership()
    }
  } finally {
    releaseThreeObjectInputOwnership('node-a')
    controls.dispose()
    restore()
  }
}
