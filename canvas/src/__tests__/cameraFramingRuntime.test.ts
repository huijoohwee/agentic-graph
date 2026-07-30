import { PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  publishCameraFramingRuntime,
  readCameraFramingRuntime,
  resetCameraFramingRuntimeForDocument,
  subscribeCameraFramingRuntime,
} from '@/features/strybldr/cameraFramingRuntime'
import {
  resolveCameraFramingAxisSettings,
  resolveCameraFramingPose,
  resolveCameraFramingSettingsFromPose,
  type CameraFramingVector,
} from '@/lib/camera/cameraFramingPose'
import {
  readSpatialCaptureAxis,
  setSpatialCaptureAxis,
  subscribeSpatialCaptureAxis,
} from '@/features/three/xrSpatialCaptureTools'
import { resolveCameraControlsOrbitProfile } from '@/features/three/cameraControlsProfile'
import {
  applyCameraFramingPose,
  createCameraFramingSettledInteraction,
  readCameraFramingControlsReapplyRevision,
  requestCameraFramingControlsReapply,
  shouldSkipImmediateCanvasFramingApply,
  type CameraFramingSettleScheduler,
} from '@/features/three/cameraFramingControlsRuntime'

function assertCondition(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

function approximatelyEqual(left: number, right: number, epsilon = 1e-9): boolean {
  return Math.abs(left - right) <= epsilon
}

function assertFiniteVector(vector: CameraFramingVector, label: string): void {
  assertCondition(vector.every(Number.isFinite), `expected finite ${label}, got ${vector.join(',')}`)
}

export function testCameraFramingRuntimePublishesImmutableNormalizedSnapshots() {
  const reset = resetCameraFramingRuntimeForDocument(`camera-framing-runtime-test-${Date.now()}`)
  assertCondition(!reset.claimed, 'expected a document reset to clear implicit Camera framing ownership')
  const firstRevision = reset.revision
  let notifications = 0
  const unsubscribe = subscribeCameraFramingRuntime(() => {
    notifications += 1
  })
  const published = publishCameraFramingRuntime({
    anchorId: '  card-1052  ',
    settings: {
      angle: 'right_side',
      level: 'low angle',
      shot: 'close_up',
      note: '  Hold the lens.  ',
      orbitX: 8,
      orbitY: Number.POSITIVE_INFINITY,
    },
    source: 'panel',
  })
  assertCondition(published.anchorId === 'card-1052', 'expected runtime to normalize the camera anchor id')
  assertCondition(published.claimed, 'expected an explicit Camera publish to claim framing ownership')
  assertCondition(published.source === 'panel', 'expected runtime to preserve the publish source')
  assertCondition(published.revision === firstRevision + 1, 'expected runtime revision to advance once')
  assertCondition(published.settings.angle === 'right-side', 'expected runtime to normalize the camera angle')
  assertCondition(published.settings.level === 'low-angle', 'expected runtime to normalize the camera level')
  assertCondition(published.settings.shot === 'close-up', 'expected runtime to normalize the camera shot')
  assertCondition(published.settings.note === 'Hold the lens.', 'expected runtime to trim the camera note')
  assertCondition(published.settings.orbitX === 1 && published.settings.orbitY === 0, 'expected runtime to clamp finite orbit values')
  assertCondition(published.settings.sensorId === 'full-frame' && published.settings.focusDistanceMeters === 5 && published.settings.aspectRatio === '16:9', 'expected runtime to hydrate backward-compatible real-optics defaults')
  assertCondition(Object.isFrozen(published) && Object.isFrozen(published.settings), 'expected runtime snapshots and settings to be immutable')
  assertCondition(notifications === 1, 'expected one external-store notification')

  const duplicate = publishCameraFramingRuntime({
    anchorId: 'card-1052',
    settings: published.settings,
    source: 'panel',
  })
  assertCondition(duplicate === published, 'expected identical publishes to retain snapshot identity')
  assertCondition(notifications === 1, 'expected identical publishes not to notify subscribers')

  const opticsPublish = publishCameraFramingRuntime({
    anchorId: 'card-1052',
    settings: { ...published.settings, sensorId: 'super-35', focusDistanceMeters: 2.4, aspectRatio: '2.39:1' },
    source: 'panel',
  })
  assertCondition(opticsPublish.revision === published.revision + 1, 'expected sensor, focus, and aspect changes to advance the shared revision')
  assertCondition(notifications === 2, 'expected real-optics changes to notify subscribers')

  const canvasPublish = publishCameraFramingRuntime({
    anchorId: 'card-1052',
    settings: opticsPublish.settings,
    source: 'canvas',
  })
  assertCondition(canvasPublish.revision === opticsPublish.revision + 1, 'expected source changes to advance the revision')
  assertCondition(notifications === 3, 'expected source changes to notify subscribers')
  unsubscribe()
  publishCameraFramingRuntime({
    anchorId: 'card-1052',
    settings: { ...published.settings, note: 'After unsubscribe' },
    source: 'document',
  })
  assertCondition(notifications === 3, 'expected unsubscribe to detach the conventional store listener')
}

export function testCameraFramingPoseConversionsStayFiniteAndConventional() {
  const front = resolveCameraFramingPose({
    settings: { angle: 'front', level: 'eye-level', shot: 'medium' },
    target: [0, 0, 0],
    baseDistance: 100,
  })
  assertCondition(
    approximatelyEqual(front.position[0], 0)
      && approximatelyEqual(front.position[1], 0)
      && approximatelyEqual(front.position[2], 100),
    `expected +Z front pose, got ${front.position.join(',')}`,
  )

  const rightSettings = resolveCameraFramingAxisSettings('x', {
    shot: 'medium',
    note: 'Preserved axis note',
  })
  const right = resolveCameraFramingPose({ settings: rightSettings, baseDistance: 100 })
  assertCondition(rightSettings.angle === 'right-side' && rightSettings.orbitX === 0.5, 'expected X axis to resolve right-side settings')
  assertCondition(approximatelyEqual(right.position[0], 100) && approximatelyEqual(right.position[2], 0), `expected +X right-side pose, got ${right.position.join(',')}`)
  assertCondition(rightSettings.note === 'Preserved axis note', 'expected axis settings to preserve unrelated framing metadata')

  const overheadSettings = resolveCameraFramingAxisSettings('y', { shot: 'medium' })
  const overhead = resolveCameraFramingPose({
    settings: overheadSettings,
    baseDistance: 100,
    up: [0, 1, 0],
  })
  assertCondition(overheadSettings.angle === 'overhead' && overheadSettings.orbitY === -1, 'expected Y axis to resolve overhead settings')
  assertCondition(approximatelyEqual(overhead.position[1], 100), `expected positive-Y overhead pose, got ${overhead.position.join(',')}`)
  const overheadDirection: CameraFramingVector = [0, 1, 0]
  const overheadUpDot = overhead.up[0] * overheadDirection[0] + overhead.up[1] * overheadDirection[1] + overhead.up[2] * overheadDirection[2]
  assertCondition(Math.abs(overheadUpDot) < 0.995, `expected a non-singular overhead up vector, got ${overhead.up.join(',')}`)

  const zSettings = resolveCameraFramingAxisSettings('z', { shot: 'medium' })
  assertCondition(zSettings.angle === 'front' && zSettings.level === 'eye-level', 'expected Z axis to resolve front eye-level settings')

  const wide = resolveCameraFramingPose({ settings: { shot: 'wide' }, baseDistance: 100 })
  const medium = resolveCameraFramingPose({ settings: { shot: 'medium' }, baseDistance: 100 })
  const closeUp = resolveCameraFramingPose({ settings: { shot: 'close-up' }, baseDistance: 100 })
  assertCondition(wide.position[2] > medium.position[2] && medium.position[2] > closeUp.position[2], 'expected shot scale to order wide, medium, and close-up distances')

  const authoredSettings = {
    angle: 'right-side',
    level: 'high-angle',
    shot: 'wide',
    note: 'Round trip',
    orbitX: 0.25,
    orbitY: -0.5,
  }
  const authoredPose = resolveCameraFramingPose({
    settings: authoredSettings,
    target: [12, -4, 7],
    baseDistance: 80,
  })
  const roundTrip = resolveCameraFramingSettingsFromPose({
    position: authoredPose.position,
    target: authoredPose.target,
    baseDistance: 80,
    previousSettings: authoredSettings,
  })
  assertCondition(approximatelyEqual(roundTrip.orbitX, 0.25) && approximatelyEqual(roundTrip.orbitY, -0.5), `expected orbit round trip, got ${roundTrip.orbitX},${roundTrip.orbitY}`)
  assertCondition(roundTrip.shot === 'wide' && roundTrip.note === 'Round trip', 'expected pose conversion to recover shot scale and preserve metadata')

  const sanitized = resolveCameraFramingPose({
    settings: {
      shot: 'medium',
      orbitX: Number.NaN,
      orbitY: Number.NEGATIVE_INFINITY,
    },
    target: [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
    baseDistance: Number.POSITIVE_INFINITY,
    up: [Number.NaN, 0, 0],
  })
  assertFiniteVector(sanitized.position, 'sanitized camera position')
  assertFiniteVector(sanitized.target, 'sanitized camera target')
  assertFiniteVector(sanitized.up, 'sanitized camera up vector')
  assertCondition(Object.isFrozen(sanitized) && Object.isFrozen(sanitized.position), 'expected resolved camera poses to be immutable')
}

export function testSpatialCameraAxisCommandsRepeatAndSupportFreeOrbit() {
  const initialAxis = readSpatialCaptureAxis()
  let notifications = 0
  const unsubscribe = subscribeSpatialCaptureAxis(() => {
    notifications += 1
  })
  setSpatialCaptureAxis('y')
  setSpatialCaptureAxis('y')
  assertCondition(notifications === 2, 'expected repeated axis commands to notify so an already-selected axis can recenter')
  setSpatialCaptureAxis('free')
  assertCondition(readSpatialCaptureAxis() === 'free', 'expected manual orbit to have an explicit free-axis state')
  unsubscribe()
  setSpatialCaptureAxis(initialAxis)
}

export function testCameraFramingOrbitControlsPreserveOverheadPose() {
  const profile = resolveCameraControlsOrbitProfile({ mode: 'xr', modelAssetMode: true })
  assertCondition(profile.minPolar === 0 && profile.maxPolar === Math.PI, 'expected XR framing to allow exact vertical camera commands')
  assertCondition(!profile.topBiased, 'expected XR framing to avoid the graph-only top-biased orbit profile')

  const camera = new PerspectiveCamera(50, 1, 0.1, 5000)
  const controls = new OrbitControls(camera)
  controls.minPolarAngle = profile.minPolar
  controls.maxPolarAngle = profile.maxPolar
  const pose = resolveCameraFramingPose({
    settings: resolveCameraFramingAxisSettings('y', { shot: 'medium' }),
    target: [0, 0, 0],
    baseDistance: 100,
    up: [0, 1, 0],
  })
  applyCameraFramingPose({ camera, controls, pose })
  const settledSettings = resolveCameraFramingSettingsFromPose({
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [controls.target.x, controls.target.y, controls.target.z],
    baseDistance: 100,
  })
  const directionLength = camera.position.distanceTo(controls.target)
  const upDotDirection = (
    camera.up.x * (camera.position.x - controls.target.x)
    + camera.up.y * (camera.position.y - controls.target.y)
    + camera.up.z * (camera.position.z - controls.target.z)
  ) / directionLength
  assertCondition(settledSettings.orbitY < -0.99999, `expected OrbitControls to preserve the overhead pose, got ${settledSettings.orbitY}`)
  assertCondition(Math.abs(upDotDirection) < 0.995, `expected OrbitControls to preserve a stable overhead up vector, got dot ${upDotDirection}`)

  const lowAnglePose = resolveCameraFramingPose({
    settings: { angle: 'left-side', level: 'low-angle', shot: 'medium' },
    target: [0, 42, 0],
    baseDistance: 590,
    up: [0, 1, 0],
  })
  applyCameraFramingPose({ camera, controls, pose: lowAnglePose, minimumY: 8 })
  assertCondition(Math.abs(camera.position.y - 8) < 1e-9, `expected staged low-angle framing to remain above its ground plane, got ${camera.position.y}`)
}

export function testCameraFramingPublishesAfterDampingSettles() {
  let nextHandle = 0
  const pendingCallbacks = new Map<number, () => void>()
  const scheduler: CameraFramingSettleScheduler = {
    schedule: callback => {
      nextHandle += 1
      pendingCallbacks.set(nextHandle, callback)
      return nextHandle
    },
    cancel: handle => {
      pendingCallbacks.delete(Number(handle))
    },
  }
  let sampledPosition = 0
  const publishedPositions: number[] = []
  const interaction = createCameraFramingSettledInteraction({
    scheduler,
    publish: () => publishedPositions.push(sampledPosition),
  })
  interaction.start()
  sampledPosition = 1
  interaction.change()
  interaction.end()
  assertCondition(pendingCallbacks.size === 1 && publishedPositions.length === 0, 'expected pointer-up to wait for damping to settle')
  sampledPosition = 2
  interaction.change()
  assertCondition(pendingCallbacks.size === 1, 'expected a post-end damping change to replace the pending publish')
  const finalCallback = [...pendingCallbacks.values()][0]
  pendingCallbacks.clear()
  finalCallback?.()
  assertCondition(publishedPositions.length === 1 && publishedPositions[0] === 2, 'expected reverse sync to sample the final settled camera pose')
  interaction.cancel()
}

export function testCameraFramingResetUsesDedicatedReapplyCommand() {
  const initialAxis = readSpatialCaptureAxis()
  setSpatialCaptureAxis('free')
  const current = publishCameraFramingRuntime({
    anchorId: 'reset-camera-card',
    settings: { angle: 'right-side', level: 'eye-level', shot: 'medium' },
    source: 'panel',
  })
  const reapplyRevision = readCameraFramingControlsReapplyRevision()
  assertCondition(requestCameraFramingControlsReapply(), 'expected reset to request the shared framing pose')
  assertCondition(readCameraFramingControlsReapplyRevision() === reapplyRevision + 1, 'expected reset to advance a dedicated reapply command')
  assertCondition(readCameraFramingRuntime() === current, 'expected reset to preserve the value snapshot and its source instead of mutating it to force a notification')
  setSpatialCaptureAxis(initialAxis)
}

export function testCameraFramingCanvasFeedbackIsContextScoped() {
  const firstFit = { cameraProfile: 'spatial-capture' } as const
  const secondFit = { cameraProfile: 'spatial-capture' } as const
  const immediate = { revision: 12, contextKey: 'asset-a', fit: firstFit }
  assertCondition(shouldSkipImmediateCanvasFramingApply({
    source: 'canvas',
    revision: 12,
    contextKey: 'asset-a',
    fit: firstFit,
    immediate,
  }), 'expected only the immediate same-context canvas publish to suppress its own round trip')
  assertCondition(!shouldSkipImmediateCanvasFramingApply({
    source: 'canvas',
    revision: 12,
    contextKey: 'asset-b',
    fit: firstFit,
    immediate,
  }), 'expected a model render-key change to reapply the shared canvas framing')
  assertCondition(!shouldSkipImmediateCanvasFramingApply({
    source: 'canvas',
    revision: 12,
    contextKey: 'asset-a',
    fit: secondFit,
    immediate,
  }), 'expected a model fit change to reapply the shared canvas framing')
  assertCondition(!shouldSkipImmediateCanvasFramingApply({
    source: 'panel',
    revision: 12,
    contextKey: 'asset-a',
    fit: firstFit,
    immediate,
  }), 'expected panel-origin framing to apply without canvas feedback suppression')
}
