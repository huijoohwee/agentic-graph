import React, { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { ThreeCameraPose, ThreeCameraSnapshotFns } from '@/hooks/store/types'
import type { GraphData } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { selectionPerfEnd, selectionPerfStart } from '@/lib/selectionPerf'
import type { Vec3 } from './layout'
import { applyZoomStep, fitCameraToPositions, type CameraRequestType, getCameraConfig } from './camera'
import { buildAutoFitToScreenSignature, buildAutoZoomSelectionSignature } from '@/lib/zoom/autoModeSignatures'
import type { Canvas3dModeId } from '@/lib/config'
import { easeOutCubic01 } from '@/lib/canvas/zoom-smoothing'
import type { ModelAssetCameraFit } from './modelAssetCameraPose'
import { resolveCameraControlsOrbitProfile } from './cameraControlsProfile'
import {
  applyModelAssetCameraPose,
  isSharedCameraFramingSurfaceMode,
  requestCameraFramingControlsReapply,
  useCameraFramingControlsRuntime,
} from './cameraFramingControlsRuntime'
import { buildVoxelCameraIntroPoses, readVoxelCameraConfig } from './voxelCamera'
import { XR_MOTION_STAGE_CAMERA_POSITION, XR_MOTION_STAGE_CAMERA_TARGET } from './xrMotionReferenceCoordinates'
import { useXrMotionReferenceCameraPlayback } from './xrCameraPlaybackControlsRuntime'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import { xrChoreographyCanDriveCamera, xrChoreographyOwnsCamera } from './xrCameraControlOwnership'
import { readThreeObjectInputOwnership, useThreeObjectInputOwnership } from './threeObjectInputOwnership'
import { useThreeObjectCameraInputOwnership } from './useThreeObjectCameraInputOwnership'
import { useXrNativeControllerDemoCamera } from './useXrNativeControllerDemoCamera'
export function Controls({
  schema, positions, paused, mode = '3d', modelAssetRenderKey, modelAssetFit,
  xrEmptyWorld = false, flightSimActive = false, gameplayCoordinateScale = 1,
  onControlsChange,
}: {
  schema: GraphSchema
  positions: Record<string, Vec3>
  paused?: boolean
  mode?: Canvas3dModeId
  modelAssetRenderKey?: string
  modelAssetFit?: ModelAssetCameraFit | null
  xrEmptyWorld?: boolean
  flightSimActive?: boolean
  gameplayCoordinateScale?: number
  onControlsChange?: () => void
}) {
  const { camera, gl, size } = useThree()
  const perspectiveCamera = camera as PerspectiveCamera
  const controls = useMemo(() => {
    const c = new OrbitControls(camera, gl.domElement)
    c.enableDamping = true
    c.minDistance = 0.05
    return c
  }, [camera, gl])
  const threeCameraRequest = useGraphStore(s => s.threeCameraRequest)
  const data = useGraphStore(s => s.graphData)
  const fitToScreenMode = useGraphStore(s => s.fitToScreenMode)
  const requestThreeCamera = useGraphStore(s => s.requestThreeCamera)
  const registerThreeCameraSnapshotFns = useGraphStore(s => s.registerThreeCameraSnapshotFns)
  const viewPinned = useGraphStore(s => s.viewPinned)
  const threeCameraAutoClip = useGraphStore(s => s.threeCameraAutoClip)
  const threeCameraAutoClipNearFactor = useGraphStore(s => s.threeCameraAutoClipNearFactor)
  const threeCameraAutoClipFarFactor = useGraphStore(s => s.threeCameraAutoClipFarFactor)
  const selectedNodeId = useGraphStore(s => s.selectedNodeId)
  const selectedEdgeId = useGraphStore(s => s.selectedEdgeId)
  const selectedGroupId = useGraphStore(s => s.selectedGroupId)
  const selectedNodeIds = useGraphStore(s => s.selectedNodeIds)
  const selectedEdgeIds = useGraphStore(s => s.selectedEdgeIds)
  const selectedGroupIds = useGraphStore(s => s.selectedGroupIds)
  const zoomToSelectionMode = useGraphStore(s => s.zoomToSelectionMode)
  const workspaceGraphMutationBlockKey = useGraphStore(s => s.workspaceGraphMutationBlockKey)
  const timelineTransportPlaying = useGraphStore(s => s.timelineTransportPlaying)
  const xrRuntime = React.useSyncExternalStore(
    subscribeXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
    readXrMotionReferenceRuntime,
  )
  const objectInputOwnership = useThreeObjectInputOwnership()
  const cameraOwnershipArgs = {
    mode,
    xrEmptyWorld,
    cameraMarkCount: xrRuntime.plan.camera.length,
  }
  const choreographyCanDriveCamera = xrChoreographyCanDriveCamera(cameraOwnershipArgs)
  const choreographyOwnsCamera = xrChoreographyOwnsCamera({ ...cameraOwnershipArgs, timelinePlaying: timelineTransportPlaying })
  useThreeObjectCameraInputOwnership({
    camera: perspectiveCamera,
    controls,
    baseEnabled: !paused && !choreographyOwnsCamera,
  })
  useXrNativeControllerDemoCamera({
    camera: perspectiveCamera,
    controls,
    coordinateScale: gameplayCoordinateScale,
    flightSimActive,
    renderer: gl,
    suspended: !!paused || mode !== 'xr' || xrEmptyWorld
      || choreographyOwnsCamera || objectInputOwnership.active,
  })
  const expansionCfg = schema.behavior?.expansion || {}
  const zoomOnSelectionEnabled = expansionCfg.enabled !== false && expansionCfg.zoomOnSelection !== false
  const controlsUserInteractingRef = React.useRef(false)
  const lastInteractionAtRef = React.useRef<number>(Date.now())
  const previousModeRef = React.useRef<Canvas3dModeId | null>(null)
  const previousXrEmptyWorldRef = React.useRef(false)
  const previousCameraOwnershipRef = React.useRef(false)
  const previousCameraSceneKeyRef = React.useRef(xrRuntime.sceneKey)
  const pendingCameraSceneResetRef = React.useRef(false)
  const modelAssetMode = Boolean(String(modelAssetRenderKey || '').trim())
  React.useEffect(() => {
    if (!objectInputOwnership.active) return
    controlsUserInteractingRef.current = false
    lastInteractionAtRef.current = Date.now()
  }, [objectInputOwnership.active])
  const voxelIdleAutoRotateConfig = React.useMemo(() => ({
    delayMs: typeof schema.three?.voxelIdleAutoRotateDelayMs === 'number' && Number.isFinite(schema.three.voxelIdleAutoRotateDelayMs)
      ? Math.max(0, Math.min(6000, schema.three.voxelIdleAutoRotateDelayMs))
      : 900,
    speed: typeof schema.three?.voxelIdleAutoRotateSpeed === 'number' && Number.isFinite(schema.three.voxelIdleAutoRotateSpeed)
      ? Math.max(0, Math.min(1.5, schema.three.voxelIdleAutoRotateSpeed))
      : 0.12,
    enabled: schema.three?.voxelAnimationEnabled !== false,
  }), [schema])
  const voxelIntroRef = React.useRef<null | {
    startAtMs: number
    delayMs: number
    durationMs: number
    from: { px: number; py: number; pz: number; tx: number; ty: number; tz: number }
    to: { px: number; py: number; pz: number; tx: number; ty: number; tz: number }
  }>(null)
  React.useEffect(() => {
    const handleStart = () => {
      controlsUserInteractingRef.current = true
      lastInteractionAtRef.current = Date.now()
    }
    const handleEnd = () => {
      controlsUserInteractingRef.current = false
      lastInteractionAtRef.current = Date.now()
    }
    try {
      controls.addEventListener('start', handleStart)
      controls.addEventListener('end', handleEnd)
    } catch {
      void 0
    }
    return () => {
      try {
        controls.removeEventListener('start', handleStart)
        controls.removeEventListener('end', handleEnd)
      } catch {
        void 0
      }
    }
  }, [controls])
  React.useEffect(() => {
    if (!onControlsChange) return
    const handler = () => {
      try {
        onControlsChange()
      } catch {
        void 0
      }
    }
    try {
      controls.addEventListener('change', handler)
    } catch {
      void 0
    }
    return () => {
      try {
        controls.removeEventListener('change', handler)
      } catch {
        void 0
      }
    }
  }, [controls, onControlsChange])
  useFrame(() => {
    const objectDragActive = readThreeObjectInputOwnership().active
    if (objectDragActive) return
    const voxelIdleAutoRotate = mode === 'voxel'
      && !paused
      && !modelAssetMode
      && voxelIdleAutoRotateConfig.enabled
      && !viewPinned
      && !objectDragActive
      && !controlsUserInteractingRef.current
      && Date.now() - lastInteractionAtRef.current >= voxelIdleAutoRotateConfig.delayMs
    controls.autoRotate = voxelIdleAutoRotate
    controls.autoRotateSpeed = mode === 'voxel' ? voxelIdleAutoRotateConfig.speed : 0
    if (paused) return
    const voxelIntro = voxelIntroRef.current
    if (voxelIntro) {
      if (controlsUserInteractingRef.current) {
        voxelIntroRef.current = null
      } else {
        const now = Date.now()
        const elapsedMs = now - voxelIntro.startAtMs - voxelIntro.delayMs
        const durMs = Math.max(80, voxelIntro.durationMs)
        const t = elapsedMs <= 0 ? 0 : elapsedMs / durMs
        const k = easeOutCubic01(t)
        const inv = 1 - k
        const px = voxelIntro.from.px * inv + voxelIntro.to.px * k
        const py = voxelIntro.from.py * inv + voxelIntro.to.py * k
        const pz = voxelIntro.from.pz * inv + voxelIntro.to.pz * k
        const tx = voxelIntro.from.tx * inv + voxelIntro.to.tx * k
        const ty = voxelIntro.from.ty * inv + voxelIntro.to.ty * k
        const tz = voxelIntro.from.tz * inv + voxelIntro.to.tz * k
        camera.position.set(px, py, pz)
        controls.target.set(tx, ty, tz)
        if (t >= 1) voxelIntroRef.current = null
      }
    }
    controls.update()
    if (mode === 'voxel') {
      let corrected = false
      if (controls.target.z < 0) {
        const lift = -controls.target.z
        controls.target.z += lift
        camera.position.z += lift
        corrected = true
      }
      const minCameraZ = controls.target.z + 6
      if (camera.position.z < minCameraZ) {
        camera.position.z = minCameraZ
        corrected = true
      }
      if (corrected) {
        try {
          camera.lookAt(controls.target)
        } catch {
          void 0
        }
        try {
          controls.update()
        } catch {
          void 0
        }
      }
    }
    if (!threeCameraAutoClip) return
    const dist = camera.position.distanceTo(controls.target)
    if (!Number.isFinite(dist) || dist <= 0) return
    const nearFactor = typeof threeCameraAutoClipNearFactor === 'number' && Number.isFinite(threeCameraAutoClipNearFactor) && threeCameraAutoClipNearFactor > 0
      ? threeCameraAutoClipNearFactor
      : 0.0001
    const farFactor = typeof threeCameraAutoClipFarFactor === 'number' && Number.isFinite(threeCameraAutoClipFarFactor) && threeCameraAutoClipFarFactor > 1
      ? threeCameraAutoClipFarFactor
      : 200
    const nextNear = Math.max(0.000001, dist * nearFactor)
    const nextFar = Math.max(nextNear + 1, dist * farFactor)
    const pc = perspectiveCamera
    const nearChanged = Math.abs((pc.near || 0) - nextNear) / Math.max(1e-6, pc.near || 1) > 0.15
    const farChanged = Math.abs((pc.far || 0) - nextFar) / Math.max(1e-6, pc.far || 1) > 0.15
    if (!nearChanged && !farChanged) return
    pc.near = nextNear
    pc.far = nextFar
    try {
      pc.updateProjectionMatrix()
    } catch {
      void 0
    }
  })
  const lastFitSigRef = React.useRef<string | null>(null)
  const lastObjectInputRevisionRef = React.useRef(objectInputOwnership.revision)
  React.useEffect(() => {
    const objectInputChanged = lastObjectInputRevisionRef.current !== objectInputOwnership.revision
    lastObjectInputRevisionRef.current = objectInputOwnership.revision
    if (paused || viewPinned || mode === 'xr' || objectInputOwnership.active) return
    if (!fitToScreenMode) {
      lastFitSigRef.current = null
      return
    }
    const graph = data as GraphData | null
    if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) return
    const sig = buildAutoFitToScreenSignature({
      nodeCount: graph.nodes.length,
      viewportW: size.width,
      viewportH: size.height,
      graphDataRevision: useGraphStore.getState().graphDataRevision || 0,
      schema: schema as GraphSchema,
      mediaPanelDensity: useGraphStore.getState().mediaPanelDensity,
      renderMediaAsNodes: useGraphStore.getState().renderMediaAsNodes === true,
      visibilityFrameKey: workspaceGraphMutationBlockKey,
    })
    if (lastFitSigRef.current === sig) return
    lastFitSigRef.current = sig
    if (objectInputChanged) return
    try {
      requestThreeCamera('fit')
    } catch {
      void 0
    }
  }, [paused, viewPinned, mode, fitToScreenMode, data, requestThreeCamera, schema, size.height, size.width, workspaceGraphMutationBlockKey, objectInputOwnership.active, objectInputOwnership.revision])
  const lastSelectionKeyRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (paused || viewPinned || mode === 'xr' || objectInputOwnership.active) return
    if (!zoomToSelectionMode || !zoomOnSelectionEnabled) {
      lastSelectionKeyRef.current = null
      return
    }
    const key = buildAutoZoomSelectionSignature({
      graphDataRevision: useGraphStore.getState().graphDataRevision || 0,
      selectedNodeId,
      selectedEdgeId,
      selectedGroupId,
      selectedNodeIds,
      selectedEdgeIds,
      selectedGroupIds,
    })
    if (!key) return
    if (lastSelectionKeyRef.current === key) return
    lastSelectionKeyRef.current = key
    try {
      requestThreeCamera('selection')
    } catch {
      void 0
    }
  }, [
    paused,
    viewPinned,
    zoomToSelectionMode,
    zoomOnSelectionEnabled,
    selectedEdgeId,
    selectedEdgeIds,
    selectedGroupId,
    selectedGroupIds,
    selectedNodeId,
    selectedNodeIds,
    requestThreeCamera,
    mode,
    objectInputOwnership.active,
  ])
  React.useEffect(() => {
    const cfg = getCameraConfig(schema)
    const orbitProfile = resolveCameraControlsOrbitProfile({ mode, modelAssetMode })
    const topBiasedOrbit = orbitProfile.topBiased
    const st = useGraphStore.getState()
    const m = typeof st.canvasInteractionSpeedMultiplier === 'number' && Number.isFinite(st.canvasInteractionSpeedMultiplier) ? st.canvasInteractionSpeedMultiplier : 1
    const safe = Math.max(0.1, Math.min(10, m))
    try {
      if (mode === 'voxel') {
        camera.up.set(0, 0, 1)
      } else if (mode !== 'xr') {
        camera.up.set(0, 1, 0)
      }
      controls.enableRotate = true
      controls.enablePan = true
      controls.enableZoom = true
      controls.zoomToCursor = true
    } catch {
      void 0
    }
    controls.dampingFactor = cfg.dampingFactor
    controls.rotateSpeed = cfg.rotateSpeed * safe * orbitProfile.rotateFactor
    controls.zoomSpeed = cfg.zoomSpeed * safe * orbitProfile.zoomFactor
    controls.panSpeed = cfg.panSpeed * safe
    controls.screenSpacePanning = !topBiasedOrbit
    controls.minPolarAngle = orbitProfile.minPolar
    controls.maxPolarAngle = orbitProfile.maxPolar
    controls.minDistance = orbitProfile.minDistance
    controls.maxDistance = orbitProfile.maxDistance
    controls.autoRotate = false
    controls.autoRotateSpeed = mode === 'voxel' ? voxelIdleAutoRotateConfig.speed : 0
    try {
      controls.update()
    } catch {
      void 0
    }
  }, [camera, controls, mode, modelAssetMode, schema, voxelIdleAutoRotateConfig.speed])
  React.useEffect(() => {
    const wasMode = previousModeRef.current
    previousModeRef.current = mode
    const enteredEmptyXrWorld = mode === 'xr' && xrEmptyWorld && !previousXrEmptyWorldRef.current
    previousXrEmptyWorldRef.current = xrEmptyWorld
    const enteredXr = mode === 'xr' && wasMode !== 'xr'
    const cameraSceneChanged = previousCameraSceneKeyRef.current !== xrRuntime.sceneKey
    previousCameraSceneKeyRef.current = xrRuntime.sceneKey
    if (cameraSceneChanged) {
      previousCameraOwnershipRef.current = false
      pendingCameraSceneResetRef.current = true
    }
    if (choreographyCanDriveCamera) {
      previousCameraOwnershipRef.current = true
      pendingCameraSceneResetRef.current = false
    }
    const releasedChoreographyCamera = previousCameraOwnershipRef.current && !choreographyCanDriveCamera
    const pendingCameraSceneReset = pendingCameraSceneResetRef.current
    if ((enteredXr || enteredEmptyXrWorld || releasedChoreographyCamera || pendingCameraSceneReset) && !choreographyCanDriveCamera && !paused && !viewPinned && !objectInputOwnership.active && !String(modelAssetRenderKey || '').trim()) {
      voxelIntroRef.current = null
      if (releasedChoreographyCamera && !pendingCameraSceneReset && requestCameraFramingControlsReapply()) {
        previousCameraOwnershipRef.current = false
        return
      }
      if (mode === 'xr') {
        if (xrEmptyWorld) {
          camera.up.set(0, 0, 1)
          camera.position.set(360, -460, 520)
          controls.target.set(0, 0, -72)
        } else {
          camera.up.set(0, 1, 0)
          camera.position.set(...XR_MOTION_STAGE_CAMERA_POSITION)
          controls.target.set(...XR_MOTION_STAGE_CAMERA_TARGET)
        }
        camera.lookAt(controls.target)
        controls.update()
      }
      previousCameraOwnershipRef.current = false
      pendingCameraSceneResetRef.current = false
      return
    }
    if (paused || objectInputOwnership.active || mode !== 'voxel') {
      voxelIntroRef.current = null
      return
    }
    const enteredVoxel = wasMode !== 'voxel'
    if (!enteredVoxel) return
    if (viewPinned) return
    const cfg = readVoxelCameraConfig(schema)
    const poses = buildVoxelCameraIntroPoses(positions, cfg)
    if (!poses) return
    const applyPose = (pose: { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } }) => {
      camera.position.set(pose.position.x, pose.position.y, pose.position.z)
      controls.target.set(pose.target.x, pose.target.y, pose.target.z)
      try {
        camera.lookAt(controls.target)
      } catch {
        void 0
      }
      try {
        controls.update()
      } catch {
        void 0
      }
    }
    if (!cfg.introEnabled) {
      voxelIntroRef.current = null
      applyPose(poses.end)
      return
    }
    applyPose(poses.start)
    voxelIntroRef.current = {
      startAtMs: Date.now(),
      delayMs: cfg.introDelayMs,
      durationMs: cfg.introDurationMs,
      from: {
        px: poses.start.position.x,
        py: poses.start.position.y,
        pz: poses.start.position.z,
        tx: poses.start.target.x,
        ty: poses.start.target.y,
        tz: poses.start.target.z,
      },
      to: {
        px: poses.end.position.x,
        py: poses.end.position.y,
        pz: poses.end.position.z,
        tx: poses.end.target.x,
        ty: poses.end.target.y,
        tz: poses.end.target.z,
      },
    }
  }, [camera, choreographyCanDriveCamera, controls, mode, modelAssetRenderKey, objectInputOwnership.active, paused, positions, schema, viewPinned, xrEmptyWorld, xrRuntime.sceneKey])
  useCameraFramingControlsRuntime({
    camera: perspectiveCamera,
    controls,
    mode,
    paused: !!paused,
    modelAssetRenderKey,
    modelAssetFit,
    xrEmptyWorld,
  })
  useXrMotionReferenceCameraPlayback({
    camera: perspectiveCamera,
    controls,
    mode,
    paused: !!paused,
    playing: timelineTransportPlaying,
    xrEmptyWorld,
  })
  React.useEffect(() => {
    const fns: ThreeCameraSnapshotFns = {
      capturePose: (): ThreeCameraPose | null => {
        try {
          const pos = camera.position
          const quat = camera.quaternion
          const t = controls.target
          const pc = perspectiveCamera
          return {
            position: { x: pos.x, y: pos.y, z: pos.z },
            quaternion: { x: quat.x, y: quat.y, z: quat.z, w: quat.w },
            target: { x: t.x, y: t.y, z: t.z },
            fov: typeof pc?.fov === 'number' && Number.isFinite(pc.fov) ? pc.fov : undefined,
            zoom: typeof pc?.zoom === 'number' && Number.isFinite(pc.zoom) ? pc.zoom : undefined,
          }
        } catch {
          return null
        }
      },
      restorePose: (pose: ThreeCameraPose) => {
        try {
          camera.position.set(pose.position.x, pose.position.y, pose.position.z)
          camera.quaternion.set(pose.quaternion.x, pose.quaternion.y, pose.quaternion.z, pose.quaternion.w)
          controls.target.set(pose.target.x, pose.target.y, pose.target.z)
          if (typeof pose.fov === 'number' && Number.isFinite(pose.fov)) {
            perspectiveCamera.fov = pose.fov
          }
          if (typeof pose.zoom === 'number' && Number.isFinite(pose.zoom)) {
            perspectiveCamera.zoom = pose.zoom
          }
          try {
            perspectiveCamera.updateProjectionMatrix()
          } catch {
            void 0
          }
          controls.update()
        } catch {
          void 0
        }
      },
    }
    registerThreeCameraSnapshotFns(fns)
    return () => {
      registerThreeCameraSnapshotFns(null)
    }
  }, [camera, controls, perspectiveCamera, registerThreeCameraSnapshotFns])
  React.useEffect(() => {
    if (paused || objectInputOwnership.active) return
    const req = threeCameraRequest
    if (!req) return
    if (choreographyOwnsCamera) {
      useGraphStore.getState().clearThreeCameraRequest()
      return
    }
    if (mode === 'xr' && req.type !== 'in' && req.type !== 'out') {
      useGraphStore.getState().clearThreeCameraRequest()
      return
    }
    const modelAssetMode = !!String(modelAssetRenderKey || '').trim()
    if (viewPinned && !modelAssetMode && req.type !== 'in' && req.type !== 'out') {
      useGraphStore.getState().clearThreeCameraRequest()
      return
    }
    const t0 = selectionPerfStart()
    if (req.type === 'in' || req.type === 'out') {
      applyZoomStep(controls, perspectiveCamera, req.type)
      useGraphStore.getState().clearThreeCameraRequest()
      selectionPerfEnd('three', t0)
      return
    }
    if (modelAssetMode && modelAssetFit) {
      if (req.type === 'fit' || req.type === 'reset') {
        if (!isSharedCameraFramingSurfaceMode(mode) || !requestCameraFramingControlsReapply()) {
          applyModelAssetCameraPose({ camera: perspectiveCamera, controls, fit: modelAssetFit, perspectiveCamera })
        }
      }
      useGraphStore.getState().clearThreeCameraRequest()
      selectionPerfEnd('three', t0)
      return
    }
    const graph = data as GraphData | null
    if (!graph || !graph.nodes || graph.nodes.length === 0) {
      useGraphStore.getState().clearThreeCameraRequest()
      return
    }
    let requestType: CameraRequestType
    if (req.type === 'selection') {
      if (!zoomOnSelectionEnabled) {
        useGraphStore.getState().clearThreeCameraRequest()
        return
      }
      requestType = 'selection'
    } else if (req.type === 'reset') {
      requestType = 'reset'
    } else {
      requestType = 'fit'
    }
    fitCameraToPositions({
      graph,
      positions,
      controls,
      camera: perspectiveCamera,
      requestType,
      selectedNodeId,
      selectedEdgeId,
      selectedGroupId,
      selectedNodeIds,
      selectedEdgeIds,
      selectedGroupIds,
    })
    useGraphStore.getState().clearThreeCameraRequest()
    selectionPerfEnd('three', t0)
  }, [choreographyOwnsCamera, objectInputOwnership.active, paused, viewPinned, threeCameraRequest, data, selectedNodeId, selectedEdgeId, selectedGroupId, selectedNodeIds, selectedEdgeIds, selectedGroupIds, positions, perspectiveCamera, controls, zoomOnSelectionEnabled, mode, modelAssetFit, modelAssetRenderKey])
  React.useEffect(() => {
    return () => {
      try { controls.dispose() } catch { void 0 }
    }
  }, [controls])
  return null
}
