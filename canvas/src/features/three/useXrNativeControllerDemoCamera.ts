import React from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type PerspectiveCamera, type WebGLRenderer } from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { resolveFlightSimFollowTarget } from '@/features/game-flight-sim/flightSimFollowTarget'
import { readFlightSimCameraSnapshot } from '@/features/game-flight-sim/flightSimCameraRuntime'
import { readFlightSimSnapshot } from '@/features/game-flight-sim/flightSimRuntime'
import { isXrPhysicsRunReadyDemoActive } from '@/features/workspace-fs/workspaceRunReadyDemos'
import { useGraphStore } from '@/hooks/useGraphStore'
import { resolveXrMotionReferenceStage } from './xrSceneLibrary'
import { XR_MOTION_STAGE_SPAN } from './xrMotionReferenceCoordinates'
import { readXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import {
  XR_NATIVE_CONTROLLER_DEMO_STAGE_SCALE,
  readSharedXrNativeControllerDemoFrame,
  readXrNativeControllerDemo,
} from './xrNativeControllerDemoRuntime'
import { resolveXrNativeControllerFollowFraming } from './xrNativeControllerCameraFraming'
import { readXrNativeControllerCamera } from './xrNativeControllerCameraRuntime'

const AERIAL_ALTITUDE_START_METERS = 3
const AERIAL_ALTITUDE_RANGE_METERS = 17
type FollowOwner = 'flight' | 'physics'
type FollowTarget = Readonly<{
  owner: FollowOwner
  position: readonly [number, number, number]
  target: readonly [number, number, number]
  fovDegrees: number
  cameraViewRevision: number
  resetKey: number
  sequence: number
  interpolate: boolean
  snapDistance: number
}>
type ControlsCapabilities = Readonly<{
  enablePan: boolean
  enableRotate: boolean
  enableZoom: boolean
}>

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function readPhysicsFollowTarget(
  aspect: number,
  runReadyDemo: boolean,
): FollowTarget | null {
  const runtime = readXrNativeControllerDemo()
  if (!runtime.followCamera) return null
  const frame = readSharedXrNativeControllerDemoFrame()
  const motionRuntime = readXrMotionReferenceRuntime()
  const stage = resolveXrMotionReferenceStage(motionRuntime.plan.stageId)
  const stageScale = runReadyDemo
    ? XR_NATIVE_CONTROLLER_DEMO_STAGE_SCALE
    : XR_MOTION_STAGE_SPAN / Math.max(stage.sizeMeters[0], stage.sizeMeters[1], 1)
  const altitude = Math.max(0, frame.player.position[1])
  const aerialFactor = frame.mode === 'rocket'
    ? clamp01(
      (altitude - AERIAL_ALTITUDE_START_METERS) / AERIAL_ALTITUDE_RANGE_METERS,
    )
    : 0
  const framing = resolveXrNativeControllerFollowFraming({
    stageId: stage.id,
    aspect,
    aerialFactor,
  })
  const target = Object.freeze([
    frame.cameraTarget[0] * (1 - aerialFactor * 0.22) * stageScale,
    frame.cameraTarget[1] * (1 - aerialFactor * 0.58) * stageScale,
    (frame.cameraTarget[2] - framing.lookAheadMeters)
      * (1 - aerialFactor * 0.18) * stageScale,
  ] as const)
  return Object.freeze({
    owner: 'physics',
    position: Object.freeze([
      target[0] + framing.offsetMeters[0] * stageScale,
      target[1] + framing.offsetMeters[1] * stageScale,
      target[2] + framing.offsetMeters[2] * stageScale,
    ] as const),
    target,
    fovDegrees: framing.fovDegrees,
    cameraViewRevision: 0,
    resetKey: 0,
    sequence: frame.stepCount,
    interpolate: runtime.phase === 'running',
    snapDistance: stageScale * (2.5 + aerialFactor * 10),
  })
}

function readFlightFollowTarget(
  active: boolean,
  coordinateScale: number,
  renderer: WebGLRenderer,
): FollowTarget | null {
  if (!active || renderer.xr.isPresenting) return null
  const snapshot = readFlightSimSnapshot()
  if (!snapshot.active || !snapshot.webglSupported || snapshot.runtimeError) return null
  const cameraView = readFlightSimCameraSnapshot()
  const target = resolveFlightSimFollowTarget(
    snapshot,
    coordinateScale,
    cameraView.view,
  )
  return Object.freeze({
    owner: 'flight',
    ...target,
    cameraViewRevision: cameraView.revision,
    interpolate: true,
    snapDistance: Number.POSITIVE_INFINITY,
  })
}

export function useXrNativeControllerDemoCamera({
  camera,
  controls,
  coordinateScale,
  flightSimActive,
  renderer,
  suspended,
}: {
  camera: PerspectiveCamera
  controls: OrbitControls
  coordinateScale: number
  flightSimActive: boolean
  renderer: WebGLRenderer
  suspended: boolean
}) {
  const markdownDocumentName = useGraphStore(state => state.markdownDocumentName)
  const markdownDocumentText = useGraphStore(state => state.markdownDocumentText)
  const runReadyDemo = isXrPhysicsRunReadyDemoActive(
    markdownDocumentName,
    markdownDocumentText,
  )
  const ownerRef = React.useRef<FollowOwner | null>(null)
  const controlsCapabilitiesRef = React.useRef<ControlsCapabilities | null>(null)
  const desiredTargetRef = React.useRef(new Vector3())
  const desiredCameraRef = React.useRef(new Vector3())
  const previousFovRef = React.useRef<number | null>(null)
  const cameraViewRevisionRef = React.useRef(-1)
  const resetKeyRef = React.useRef(-1)
  const sequenceRef = React.useRef(-1)

  const releaseFollow = React.useCallback(() => {
    if (previousFovRef.current !== null) {
      camera.fov = previousFovRef.current
      camera.updateProjectionMatrix()
      previousFovRef.current = null
    }
    if (controlsCapabilitiesRef.current) {
      Object.assign(controls, controlsCapabilitiesRef.current)
      controlsCapabilitiesRef.current = null
    }
    ownerRef.current = null
    cameraViewRevisionRef.current = -1
    resetKeyRef.current = -1
    sequenceRef.current = -1
  }, [camera, controls])

  React.useEffect(() => releaseFollow, [releaseFollow])

  useFrame((_state, deltaSecondsValue) => {
    const fixedFollow = readXrNativeControllerCamera().mode === 'fixed-follow'
    if (
      flightSimActive
      && !fixedFollow
      && document.pointerLockElement === renderer.domElement
    ) {
      void document.exitPointerLock()
    }
    const follow = suspended || !fixedFollow
      ? null
      : flightSimActive
        ? readFlightFollowTarget(true, coordinateScale, renderer)
        : readPhysicsFollowTarget(camera.aspect, runReadyDemo)
    if (!follow) {
      if (ownerRef.current) releaseFollow()
      return
    }

    if (!controlsCapabilitiesRef.current) {
      controlsCapabilitiesRef.current = {
        enablePan: controls.enablePan,
        enableRotate: controls.enableRotate,
        enableZoom: controls.enableZoom,
      }
    }
    controls.enablePan = false
    controls.enableRotate = false
    controls.enableZoom = false
    if (previousFovRef.current === null) previousFovRef.current = camera.fov
    const target = desiredTargetRef.current.set(...follow.target)
    const desiredCamera = desiredCameraRef.current.set(...follow.position)
    const ownerChanged = ownerRef.current !== follow.owner
    const resetDetected = ownerChanged
      || cameraViewRevisionRef.current !== follow.cameraViewRevision
      || resetKeyRef.current !== follow.resetKey
      || follow.sequence < sequenceRef.current
    ownerRef.current = follow.owner
    cameraViewRevisionRef.current = follow.cameraViewRevision
    resetKeyRef.current = follow.resetKey
    sequenceRef.current = follow.sequence
    const externallyDisplaced = (
      controls.target.distanceTo(target) > follow.snapDistance
      || camera.position.distanceTo(desiredCamera) > follow.snapDistance
    )
    const deltaSeconds = Number.isFinite(deltaSecondsValue)
      ? Math.max(0, Math.min(0.1, deltaSecondsValue))
      : 0
    if (resetDetected || externallyDisplaced) {
      controls.target.copy(target)
      camera.position.copy(desiredCamera)
    } else if (follow.interpolate) {
      controls.target.lerp(target, 1 - Math.exp(-8 * deltaSeconds))
      camera.position.lerp(desiredCamera, 1 - Math.exp(-5.5 * deltaSeconds))
    }
    if (Math.abs(camera.fov - follow.fovDegrees) > 0.01) {
      camera.fov += (
        follow.fovDegrees - camera.fov
      ) * (1 - Math.exp(-4 * deltaSeconds))
      camera.updateProjectionMatrix()
    }
    camera.lookAt(controls.target)
    controls.update()
  })
}
