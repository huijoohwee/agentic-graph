import React from 'react'
import type { PerspectiveCamera } from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Canvas3dModeId } from '@/lib/config'
import { resolveCameraVerticalFovDegrees } from '@/lib/camera/cameraFramingPose'
import { applyCameraFramingPose } from './cameraFramingControlsRuntime'
import {
  XR_MOTION_STAGE_MIN_CAMERA_Y,
  XR_MOTION_STAGE_SPAN,
  xrMotionReferenceWorldPosition,
} from './xrMotionReferenceCoordinates'
import {
  resolveXrMotionReferenceStage,
  sampleXrMotionReferenceCameraPose,
  sampleXrMotionReferenceCameraSettings,
} from './xrMotionReferenceModel'
import {
  readXrMotionReferenceRuntime,
  subscribeXrMotionReferenceRuntime,
} from './xrMotionReferenceRuntime'
import { xrChoreographyCanDriveCamera } from './xrCameraControlOwnership'
import { readXrNativeControllerCamera } from './xrNativeControllerCameraRuntime'
import { useThreeViewportInputOwnership } from './threeViewportInputOwnership'

type CameraPlaybackReapplyListener = () => void
const cameraPlaybackReapplyListeners = new Set<CameraPlaybackReapplyListener>()
let cameraPlaybackReapplyRevision = 0

const subscribeCameraPlaybackReapply = (listener: CameraPlaybackReapplyListener): (() => void) => {
  cameraPlaybackReapplyListeners.add(listener)
  return () => cameraPlaybackReapplyListeners.delete(listener)
}

const readCameraPlaybackReapplyRevision = (): number => cameraPlaybackReapplyRevision

type FreeOrbitPlaybackSnapshot = Readonly<{
  position: PerspectiveCamera['position']
  quaternion: PerspectiveCamera['quaternion']
  up: PerspectiveCamera['up']
  target: OrbitControls['target']
  fov: number
  focus: number
}>

export function requestXrMotionReferenceCameraPlaybackReapply(): void {
  cameraPlaybackReapplyRevision += 1
  for (const listener of [...cameraPlaybackReapplyListeners]) listener()
}

export function useXrMotionReferenceCameraPlayback({
  camera,
  controls,
  mode,
  paused,
  playing,
  xrEmptyWorld,
}: {
  camera: PerspectiveCamera
  controls: OrbitControls
  mode: Canvas3dModeId
  paused: boolean
  playing: boolean
  xrEmptyWorld: boolean
}) {
  const runtime = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const reapplyRevision = React.useSyncExternalStore(
    subscribeCameraPlaybackReapply,
    readCameraPlaybackReapplyRevision,
    readCameraPlaybackReapplyRevision,
  )
  const viewportInputOwnership = useThreeViewportInputOwnership()
  const previousPlayingRef = React.useRef(false)
  const prePlaybackPoseRef = React.useRef<FreeOrbitPlaybackSnapshot | null>(null)
  const cameraTrackAvailable = xrChoreographyCanDriveCamera({
    mode,
    xrEmptyWorld,
    cameraMarkCount: runtime.plan.camera.length,
  })

  React.useLayoutEffect(() => {
    if (!playing || previousPlayingRef.current || !cameraTrackAvailable) return
    prePlaybackPoseRef.current = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      up: camera.up.clone(),
      target: controls.target.clone(),
      fov: camera.fov,
      focus: camera.focus,
    }
  }, [camera, cameraTrackAvailable, controls, playing])

  const applyTrackedPose = React.useCallback(() => {
    if (paused || viewportInputOwnership.blocksProgrammaticCamera || !cameraTrackAvailable) return
    const pose = sampleXrMotionReferenceCameraPose(runtime.plan.camera, runtime.playheadSeconds, runtime.plan.cast, runtime.plan.subjects)
    const settings = sampleXrMotionReferenceCameraSettings(runtime.plan.camera, runtime.playheadSeconds)
    if (!pose || !settings) return
    const stage = resolveXrMotionReferenceStage(runtime.plan.stageId)
    const scale = XR_MOTION_STAGE_SPAN / Math.max(stage.sizeMeters[0], stage.sizeMeters[1], 1)
    camera.fov = resolveCameraVerticalFovDegrees(settings.focalLengthMm, settings.sensorId)
    camera.focus = settings.focusDistanceMeters
    applyCameraFramingPose({
      camera,
      controls,
      pose: {
        position: xrMotionReferenceWorldPosition(pose.position, scale),
        target: xrMotionReferenceWorldPosition(pose.target, scale),
        up: pose.up,
      },
      minimumY: XR_MOTION_STAGE_MIN_CAMERA_Y,
    })
  }, [camera, cameraTrackAvailable, controls, paused, runtime.plan.camera, runtime.plan.cast, runtime.plan.stageId, runtime.plan.subjects, runtime.playheadSeconds, viewportInputOwnership.blocksProgrammaticCamera])

  React.useEffect(() => {
    applyTrackedPose()
  }, [applyTrackedPose, reapplyRevision])

  React.useEffect(() => {
    const playbackStarted = playing && !previousPlayingRef.current
    const playbackStopped = !playing && previousPlayingRef.current
    previousPlayingRef.current = playing
    if (playbackStarted) applyTrackedPose()
    if (!playbackStopped) return
    const snapshot = prePlaybackPoseRef.current
    prePlaybackPoseRef.current = null
    if (!snapshot || mode !== 'xr' || xrEmptyWorld || readXrNativeControllerCamera().mode !== 'free-orbit') return
    camera.position.copy(snapshot.position)
    camera.quaternion.copy(snapshot.quaternion)
    camera.up.copy(snapshot.up)
    camera.fov = snapshot.fov
    camera.focus = snapshot.focus
    controls.target.copy(snapshot.target)
    camera.updateProjectionMatrix()
    controls.update()
  }, [applyTrackedPose, camera, controls, mode, playing, xrEmptyWorld])
}
