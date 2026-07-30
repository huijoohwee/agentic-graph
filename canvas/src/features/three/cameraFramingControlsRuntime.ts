import React from 'react'
import type { PerspectiveCamera } from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Canvas3dModeId } from '@/lib/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  publishCameraFramingRuntime,
  readCameraFramingRuntime,
  subscribeCameraFramingRuntime,
  type CameraFramingRuntimeSource,
} from '@/features/strybldr/cameraFramingRuntime'
import {
  resolveCameraFramingAxisSettings,
  resolveCameraFramingPose,
  resolveCameraFramingSettingsFromPose,
  resolveCameraVerticalFovDegrees,
  type CameraFramingPose,
} from '@/lib/camera/cameraFramingPose'
import {
  readSpatialCaptureAxis,
  setSpatialCaptureAxis,
  subscribeSpatialCaptureAxis,
  type SpatialCaptureAxisId,
  type SpatialCaptureViewAxisId,
} from './xrSpatialCaptureTools'
import {
  readModelAssetCameraPose,
  type ModelAssetCameraFit,
  type ModelAssetCameraPose,
} from './modelAssetCameraPose'
import {
  XR_MOTION_STAGE_MIN_CAMERA_Y,
  XR_MOTION_STAGE_SPAN,
  xrMotionReferenceWorldPosition,
} from './xrMotionReferenceCoordinates'
import {
  XR_MOTION_REFERENCE_CAMERA_BASELINE_METERS,
  resolveXrMotionReferenceStage,
} from './xrMotionReferenceModel'
import {
  readXrMotionReferenceRuntime,
  subscribeXrMotionReferenceRuntime,
} from './xrMotionReferenceRuntime'
import { resolveXrShotTarget, resolveXrShotTargetPosition } from './xrShotTargets'
import { xrChoreographyCanDriveCamera, xrChoreographyOwnsCamera } from './xrCameraControlOwnership'
import { useThreeObjectInputOwnership } from './threeObjectInputOwnership'
import {
  claimThreeViewportInputOwnership,
  releaseThreeViewportInputOwnership,
  shouldDeferThreeCameraProgrammaticInput,
  useThreeViewportInputOwnership,
} from './threeViewportInputOwnership'

type CameraFramingControlsRuntimeArgs = {
  camera: PerspectiveCamera
  controls: OrbitControls
  mode: Canvas3dModeId
  paused: boolean
  modelAssetRenderKey?: string
  modelAssetFit?: ModelAssetCameraFit | null
  xrEmptyWorld?: boolean
}

type CameraFramingContext = {
  target: [number, number, number]
  up: [number, number, number]
  baseDistance: number
  near?: number
  far?: number
}

export type CameraFramingCanvasPose = Pick<CameraFramingPose, 'position' | 'target'>
type CameraFramingCanvasPoseCommit = (pose: CameraFramingCanvasPose) => boolean
let cameraFramingCanvasPoseCommit: CameraFramingCanvasPoseCommit | null = null

export function commitCameraFramingCanvasPose(pose: CameraFramingCanvasPose): boolean {
  return cameraFramingCanvasPoseCommit?.(pose) === true
}

export type CameraFramingSettleScheduler = Readonly<{
  schedule: (callback: () => void, delayMs: number) => unknown
  cancel: (handle: unknown) => void
}>

export type CameraFramingSettledInteraction = Readonly<{
  start: () => void
  change: () => void
  end: () => void
  cancel: () => void
}>

export type ImmediateCanvasPublish = Readonly<{
  revision: number
  contextKey: string
  fit: unknown
}>

export function shouldApplySharedCameraFramingRevision(args: {
  appliedRevision: number
  appliedContextKey: string
  revision: number
  contextKey: string
  forcedReapply: boolean
}): boolean {
  return args.forcedReapply
    || args.revision !== args.appliedRevision
    || args.contextKey !== args.appliedContextKey
}

const CAMERA_FRAMING_SETTLE_DELAY_MS = 80
const cameraFramingControlsReapplyListeners = new Set<() => void>()
let cameraFramingControlsReapplyRevision = 0

export function isSharedCameraFramingSurfaceMode(mode: Canvas3dModeId): boolean {
  return mode === '3d' || mode === 'xr'
}

const DEFAULT_CAMERA_FRAMING_SETTLE_SCHEDULER: CameraFramingSettleScheduler = {
  schedule: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  cancel: handle => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
}

export function createCameraFramingSettledInteraction({
  publish,
  scheduler = DEFAULT_CAMERA_FRAMING_SETTLE_SCHEDULER,
  delayMs = CAMERA_FRAMING_SETTLE_DELAY_MS,
}: {
  publish: () => void
  scheduler?: CameraFramingSettleScheduler
  delayMs?: number
}): CameraFramingSettledInteraction {
  let interacting = false
  let settling = false
  let pendingHandle: unknown = null
  const clearPending = () => {
    if (pendingHandle === null) return
    scheduler.cancel(pendingHandle)
    pendingHandle = null
  }
  const schedulePublish = () => {
    clearPending()
    pendingHandle = scheduler.schedule(() => {
      pendingHandle = null
      if (!settling) return
      settling = false
      publish()
    }, Math.max(0, delayMs))
  }
  return Object.freeze({
    start: () => {
      clearPending()
      interacting = true
      settling = false
    },
    change: () => {
      if (settling) schedulePublish()
    },
    end: () => {
      if (!interacting) return
      interacting = false
      settling = true
      schedulePublish()
    },
    cancel: () => {
      clearPending()
      interacting = false
      settling = false
    },
  })
}

export function readCameraFramingControlsReapplyRevision(): number {
  return cameraFramingControlsReapplyRevision
}

export function shouldSkipImmediateCanvasFramingApply({
  source,
  revision,
  contextKey,
  fit,
  immediate,
}: {
  source: CameraFramingRuntimeSource
  revision: number
  contextKey: string
  fit: unknown
  immediate: ImmediateCanvasPublish | null
}): boolean {
  return source === 'canvas'
    && immediate?.revision === revision
    && immediate.contextKey === contextKey
    && immediate.fit === fit
}

function subscribeCameraFramingControlsReapply(listener: () => void): () => void {
  cameraFramingControlsReapplyListeners.add(listener)
  return () => cameraFramingControlsReapplyListeners.delete(listener)
}

const distanceBetween = (a: readonly number[], b: readonly number[]): number => {
  const dx = Number(a[0]) - Number(b[0])
  const dy = Number(a[1]) - Number(b[1])
  const dz = Number(a[2]) - Number(b[2])
  const distance = Math.hypot(dx, dy, dz)
  return Number.isFinite(distance) && distance > 0 ? distance : 1
}

const contextFromModelPose = (pose: ModelAssetCameraPose): CameraFramingContext => ({
  target: pose.target,
  up: pose.up,
  baseDistance: distanceBetween(pose.position, pose.target),
  near: pose.near,
  far: pose.far,
})

export function applyCameraFramingPose({
  camera,
  controls,
  pose,
  near,
  far,
  minimumY,
}: {
  camera: PerspectiveCamera
  controls: OrbitControls
  pose: CameraFramingPose
  near?: number
  far?: number
  minimumY?: number
}) {
  camera.up.set(pose.up[0], pose.up[1], pose.up[2])
  camera.position.set(pose.position[0], pose.position[1], pose.position[2])
  if (typeof minimumY === 'number' && Number.isFinite(minimumY) && camera.position.y < minimumY) {
    camera.position.y = minimumY
  }
  controls.target.set(pose.target[0], pose.target[1], pose.target[2])
  if (typeof near === 'number' && Number.isFinite(near) && near > 0) camera.near = near
  if (typeof far === 'number' && Number.isFinite(far) && far > camera.near) camera.far = far
  camera.updateProjectionMatrix()
  camera.lookAt(controls.target)
  controls.update()
}

export function applyModelAssetCameraPose({
  camera,
  controls,
  fit,
  perspectiveCamera,
}: {
  camera: PerspectiveCamera
  controls: OrbitControls
  fit: ModelAssetCameraFit
  perspectiveCamera: PerspectiveCamera
}) {
  const pose = readModelAssetCameraPose(fit)
  camera.up.set(pose.up[0], pose.up[1], pose.up[2])
  camera.position.set(pose.position[0], pose.position[1], pose.position[2])
  controls.target.set(pose.target[0], pose.target[1], pose.target[2])
  perspectiveCamera.fov = 50
  perspectiveCamera.zoom = 1
  perspectiveCamera.near = pose.near
  perspectiveCamera.far = pose.far
  perspectiveCamera.updateProjectionMatrix()
  camera.lookAt(controls.target)
  controls.update()
}

export function requestCameraFramingControlsReapply(): boolean {
  const axis = readSpatialCaptureAxis()
  if (axis !== 'free') {
    setSpatialCaptureAxis(axis)
    return true
  }
  const current = readCameraFramingRuntime()
  if (current.revision === 0) return false
  cameraFramingControlsReapplyRevision += 1
  for (const listener of [...cameraFramingControlsReapplyListeners]) listener()
  return true
}

export function useCameraFramingControlsRuntime({
  camera,
  controls,
  mode,
  paused,
  modelAssetRenderKey,
  modelAssetFit,
  xrEmptyWorld = false,
}: CameraFramingControlsRuntimeArgs) {
  const framing = React.useSyncExternalStore(
    subscribeCameraFramingRuntime,
    readCameraFramingRuntime,
    readCameraFramingRuntime,
  )
  const reapplyRevision = React.useSyncExternalStore(
    subscribeCameraFramingControlsReapply,
    readCameraFramingControlsReapplyRevision,
    readCameraFramingControlsReapplyRevision,
  )
  const xrRuntime = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const timelineTransportPlaying = useGraphStore(state => state.timelineTransportPlaying)
  const objectInputOwnership = useThreeObjectInputOwnership()
  const viewportInputOwnership = useThreeViewportInputOwnership()
  const viewportInputOwnerId = `orbit-controls:${React.useId()}`
  const programmaticCameraInputBlocked = shouldDeferThreeCameraProgrammaticInput({
    objectInputActive: objectInputOwnership.active,
    viewportInputBlocksProgrammaticCamera: viewportInputOwnership.blocksProgrammaticCamera,
  })
  const cameraOwnershipArgs = {
    mode,
    xrEmptyWorld,
    cameraMarkCount: xrRuntime.plan.camera.length,
  }
  const choreographyCanDriveCamera = xrChoreographyCanDriveCamera(cameraOwnershipArgs)
  const choreographyOwnsCamera = xrChoreographyOwnsCamera({ ...cameraOwnershipArgs, timelinePlaying: timelineTransportPlaying })
  const [axisRequest, setAxisRequest] = React.useState<{ axis: SpatialCaptureAxisId; revision: number }>(() => ({
    axis: readSpatialCaptureAxis(),
    revision: 0,
  }))
  const graphBaseDistanceRef = React.useRef(0)
  const graphBaseKeyRef = React.useRef('')
  const applyingPoseRef = React.useRef(false)
  const handledReapplyRevisionRef = React.useRef(reapplyRevision)
  const contextKey = String(modelAssetRenderKey || '').trim() || 'graph'
  const framingContextKey = `${mode}:${contextKey}`
  const appliedFramingRef = React.useRef(choreographyOwnsCamera
    ? { revision: framing.revision, contextKey: framingContextKey }
    : { revision: 0, contextKey: '' })
  const ownershipBaselineRevisionRef = React.useRef<number | null>(choreographyOwnsCamera ? framing.revision : null)
  const immediateCanvasPublishRef = React.useRef<ImmediateCanvasPublish | null>(null)
  const minimumY = mode === 'xr' && !xrEmptyWorld && !modelAssetFit
    ? XR_MOTION_STAGE_MIN_CAMERA_Y
    : undefined

  const runProgrammaticPose = React.useCallback((apply: () => void) => {
    applyingPoseRef.current = true
    try {
      apply()
    } finally {
      applyingPoseRef.current = false
    }
  }, [])

  const readContext = React.useCallback((): CameraFramingContext => {
    if (modelAssetFit) return contextFromModelPose(readModelAssetCameraPose(modelAssetFit))
    if (mode === 'xr' && framing.anchorId) {
      const runtime = readXrMotionReferenceRuntime()
      const shotTarget = resolveXrShotTarget(runtime.plan, framing.anchorId)
      if (shotTarget) {
        const stage = resolveXrMotionReferenceStage(runtime.plan.stageId)
        const scale = XR_MOTION_STAGE_SPAN / Math.max(stage.sizeMeters[0], stage.sizeMeters[1], 1)
        const sampled = resolveXrShotTargetPosition(runtime.plan, shotTarget.id, runtime.playheadSeconds)
        const targetHeight = shotTarget.kind === 'object' ? 1.2 : 0
        const target = xrMotionReferenceWorldPosition([sampled[0], sampled[1] + targetHeight, sampled[2]], scale)
        return {
          target,
          up: [0, 1, 0],
          baseDistance: XR_MOTION_REFERENCE_CAMERA_BASELINE_METERS * scale,
        }
      }
    }
    const key = String(modelAssetRenderKey || 'graph')
    const target: [number, number, number] = [controls.target.x, controls.target.y, controls.target.z]
    const position: [number, number, number] = [camera.position.x, camera.position.y, camera.position.z]
    if (graphBaseKeyRef.current !== key || !(graphBaseDistanceRef.current > 0)) {
      graphBaseKeyRef.current = key
      graphBaseDistanceRef.current = distanceBetween(position, target)
    }
    return {
      target,
      up: [camera.up.x, camera.up.y, camera.up.z],
      baseDistance: graphBaseDistanceRef.current,
    }
  }, [camera, controls, framing.anchorId, mode, modelAssetFit, modelAssetRenderKey])

  const publishCanvasPose = React.useCallback((pose: CameraFramingCanvasPose): boolean => {
    if (paused || choreographyOwnsCamera || objectInputOwnership.active || !isSharedCameraFramingSurfaceMode(mode)) return false
    const context = readContext()
    const current = readCameraFramingRuntime()
    if (readSpatialCaptureAxis() !== 'free') setSpatialCaptureAxis('free')
    const published = publishCameraFramingRuntime({
      anchorId: current.anchorId,
      settings: resolveCameraFramingSettingsFromPose({
        position: pose.position,
        target: pose.target,
        baseDistance: context.baseDistance,
        previousSettings: current.settings,
      }),
      source: 'canvas',
    })
    immediateCanvasPublishRef.current = published === current
      ? null
      : { revision: published.revision, contextKey, fit: modelAssetFit }
    return true
  }, [choreographyOwnsCamera, contextKey, mode, modelAssetFit, objectInputOwnership.active, paused, readContext])

  React.useEffect(() => {
    cameraFramingCanvasPoseCommit = publishCanvasPose
    return () => {
      if (cameraFramingCanvasPoseCommit === publishCanvasPose) cameraFramingCanvasPoseCommit = null
    }
  }, [publishCanvasPose])

  React.useEffect(() => subscribeSpatialCaptureAxis(axis => {
    setAxisRequest(current => ({ axis, revision: current.revision + 1 }))
  }), [])

  React.useEffect(() => {
    if (!isSharedCameraFramingSurfaceMode(mode) || paused) immediateCanvasPublishRef.current = null
  }, [mode, paused])

  React.useEffect(() => {
    if (!choreographyOwnsCamera) {
      ownershipBaselineRevisionRef.current = null
      return
    }
    if (ownershipBaselineRevisionRef.current === null) {
      ownershipBaselineRevisionRef.current = framing.revision
      appliedFramingRef.current = { revision: framing.revision, contextKey: framingContextKey }
      return
    }
    if (framing.revision === ownershipBaselineRevisionRef.current) {
      appliedFramingRef.current = { revision: framing.revision, contextKey: framingContextKey }
    }
  }, [choreographyOwnsCamera, framing.revision, framingContextKey])

  React.useEffect(() => {
    const key = String(modelAssetRenderKey || '').trim()
    if (!key || !modelAssetFit || paused || choreographyCanDriveCamera || programmaticCameraInputBlocked) return
    if (isSharedCameraFramingSurfaceMode(mode) && (axisRequest.axis !== 'free' || framing.revision > 0)) return
    runProgrammaticPose(() => applyModelAssetCameraPose({ camera, controls, fit: modelAssetFit, perspectiveCamera: camera }))
  }, [axisRequest.axis, camera, choreographyCanDriveCamera, controls, framing.revision, mode, modelAssetFit, modelAssetRenderKey, paused, programmaticCameraInputBlocked, runProgrammaticPose])

  React.useEffect(() => {
    if (paused || choreographyCanDriveCamera || programmaticCameraInputBlocked || !isSharedCameraFramingSurfaceMode(mode) || !modelAssetFit || axisRequest.axis === 'free') return
    const context = contextFromModelPose(readModelAssetCameraPose(modelAssetFit))
    const current = readCameraFramingRuntime()
    const settings = resolveCameraFramingAxisSettings(
      axisRequest.axis as SpatialCaptureViewAxisId,
      current.settings,
    )
    const pose = resolveCameraFramingPose({
      settings,
      target: context.target,
      baseDistance: context.baseDistance,
      up: context.up,
    })
    runProgrammaticPose(() => applyCameraFramingPose({ camera, controls, pose, near: context.near, far: context.far, minimumY }))
    publishCameraFramingRuntime({
      anchorId: current.anchorId,
      settings,
      source: 'axis',
    })
  }, [axisRequest, camera, choreographyCanDriveCamera, controls, minimumY, mode, modelAssetFit, paused, programmaticCameraInputBlocked, runProgrammaticPose])

  React.useEffect(() => {
    if (paused || choreographyOwnsCamera || programmaticCameraInputBlocked || !isSharedCameraFramingSurfaceMode(mode) || framing.revision === 0) return
    const forcedReapply = handledReapplyRevisionRef.current !== reapplyRevision
    handledReapplyRevisionRef.current = reapplyRevision
    if (!shouldApplySharedCameraFramingRevision({
      appliedRevision: appliedFramingRef.current.revision,
      appliedContextKey: appliedFramingRef.current.contextKey,
      revision: framing.revision,
      contextKey: framingContextKey,
      forcedReapply,
    })) return
    if (framing.source === 'axis' && !forcedReapply) {
      appliedFramingRef.current = { revision: framing.revision, contextKey: framingContextKey }
      return
    }
    const immediateCanvasPublish = immediateCanvasPublishRef.current
    if (shouldSkipImmediateCanvasFramingApply({
      source: framing.source,
      revision: framing.revision,
      contextKey,
      fit: modelAssetFit,
      immediate: immediateCanvasPublish,
    })) {
      immediateCanvasPublishRef.current = null
      appliedFramingRef.current = { revision: framing.revision, contextKey: framingContextKey }
      return
    }
    immediateCanvasPublishRef.current = null
    const context = readContext()
    if (framing.source !== 'axis' && readSpatialCaptureAxis() !== 'free') setSpatialCaptureAxis('free')
    const pose = resolveCameraFramingPose({
      settings: framing.settings,
      target: context.target,
      baseDistance: context.baseDistance,
      up: context.up,
    })
    camera.fov = resolveCameraVerticalFovDegrees(framing.settings.focalLengthMm, framing.settings.sensorId)
    camera.focus = framing.settings.focusDistanceMeters
    runProgrammaticPose(() => applyCameraFramingPose({ camera, controls, pose, near: context.near, far: context.far, minimumY }))
    appliedFramingRef.current = { revision: framing.revision, contextKey: framingContextKey }
  }, [camera, choreographyOwnsCamera, contextKey, controls, framing, framingContextKey, minimumY, mode, modelAssetFit, paused, programmaticCameraInputBlocked, readContext, reapplyRevision, runProgrammaticPose])

  React.useEffect(() => {
    const publishSettledCanvasPose = () => {
      try {
        publishCanvasPose({
          position: [camera.position.x, camera.position.y, camera.position.z],
          target: [controls.target.x, controls.target.y, controls.target.z],
        })
      } finally {
        releaseThreeViewportInputOwnership(viewportInputOwnerId)
      }
    }
    const settledInteraction = createCameraFramingSettledInteraction({ publish: publishSettledCanvasPose })
    const cancelInteraction = () => {
      settledInteraction.cancel()
      releaseThreeViewportInputOwnership(viewportInputOwnerId)
    }
    const handleStart = () => {
      if (applyingPoseRef.current || paused || choreographyOwnsCamera || objectInputOwnership.active || !isSharedCameraFramingSurfaceMode(mode) || !claimThreeViewportInputOwnership(viewportInputOwnerId)) {
        cancelInteraction()
        return
      }
      settledInteraction.start()
    }
    const handleChange = () => {
      if (applyingPoseRef.current || choreographyOwnsCamera || objectInputOwnership.active) {
        cancelInteraction()
        return
      }
      settledInteraction.change()
    }
    const handleEnd = () => choreographyOwnsCamera || objectInputOwnership.active
      ? cancelInteraction()
      : settledInteraction.end()
    controls.addEventListener('start', handleStart)
    controls.addEventListener('change', handleChange)
    controls.addEventListener('end', handleEnd)
    return () => {
      cancelInteraction()
      controls.removeEventListener('start', handleStart)
      controls.removeEventListener('change', handleChange)
      controls.removeEventListener('end', handleEnd)
    }
  }, [camera, choreographyOwnsCamera, controls, mode, objectInputOwnership.active, paused, publishCanvasPose, viewportInputOwnerId])
}
