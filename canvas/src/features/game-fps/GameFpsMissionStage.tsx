import React from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, DoubleSide, Euler, Quaternion, Vector3, type Group, type Mesh, type MeshStandardMaterial, type PerspectiveCamera } from 'three'
import { THREE_RENDER_ORDER } from '@/features/three/renderOrder'
import { XR_MOTION_REFERENCE_SELECTION_COLOR } from '@/features/three/xrMotionReferenceModel'
import {
  readGameFpsSpatialProfile,
  readGameFpsSnapshot,
  subscribeGameFpsSnapshot,
} from './gameFpsRuntime'
import {
  GAME_FPS_FIXED_STEP_SECONDS,
  GAME_FPS_MAX_FRAME_SECONDS,
  GAME_FPS_NPC_IDS,
} from './gameFpsModel'
import { installGameFpsDesktopInput } from './gameFpsInput'
import {
  claimThreeViewportInputOwnership,
  releaseThreeViewportInputOwnership,
} from '@/features/three/threeViewportInputOwnership'
import { readMotionControlSnapshot } from '@/features/three/motionControlRuntime'
import {
  isMotionControlPoseTracked,
  motionControlPoseToAnimationPose,
  motionControlPoseToControllerInput,
} from '@/features/three/motionControlPose'
import { sampleXrAnimationPose, type XrCharacterMotionPresetId } from '@/features/three/xrAnimationCatalog'
import { readXrSharedAssetGameplayNpcControl } from '@/features/three/xrSharedAssetControlRuntime'
import {
  applyGameFpsMotionControlInput,
  releaseGameFpsMotionControlInput,
} from './gameFpsMotionControlAdapter'
import {
  advanceGameModeSimulationBy,
  readGameModeSnapshot,
  reportGameModeSimulationFailure,
} from './gameModeRuntime'
import {
  bindGameFpsSimulationInputQueue,
  createGameFpsSimulationClock,
} from './gameFpsSimulationClock'

const INPUT_OWNER_ID = 'game-fps:first-person'
const READY_FRAME_COUNT = 2
const SIMULATION_CLOCK_INTERVAL_MS = GAME_FPS_FIXED_STEP_SECONDS * 1000
const GAME_FPS_CAMERA_FOV_DEGREES = 60
const GAME_FPS_CAMERA_NEAR = 0.04
const GAME_FPS_CAMERA_FAR = 4000
const ACTION_COLORS = Object.freeze({
  hold: new Color('#60a5fa'),
  alert: new Color('#facc15'),
  engage: new Color('#ef4444'),
  flee: new Color('#c084fc'),
})
const SHARED_NPC_CONTROL_COLORS = Object.freeze({
  animated: new Color('#fb923c'),
  handPose: new Color('#34d399'),
  selected: new Color('#f8fafc'),
})
const DEG_TO_RAD = Math.PI / 180
const NPC_SELECTION_RING_INNER_RADIUS = 0.62
const NPC_SELECTION_RING_OUTER_RADIUS = 1

function setMeshColor(mesh: Mesh, color: Color): void {
  const material = mesh.material as MeshStandardMaterial
  if (material?.color) material.color.copy(color)
}

function resolvePerspectiveCamera(camera: unknown): PerspectiveCamera | null {
  if (!camera || typeof camera !== 'object') return null
  const candidate = camera as PerspectiveCamera
  return typeof candidate.fov === 'number' && typeof candidate.updateProjectionMatrix === 'function'
    ? candidate
    : null
}

function applyGameFpsCameraOptics(camera: PerspectiveCamera): void {
  let changed = false
  if (Math.abs(camera.fov - GAME_FPS_CAMERA_FOV_DEGREES) > 0.01) {
    camera.fov = GAME_FPS_CAMERA_FOV_DEGREES
    changed = true
  }
  if (Math.abs(camera.near - GAME_FPS_CAMERA_NEAR) > 0.001) {
    camera.near = GAME_FPS_CAMERA_NEAR
    changed = true
  }
  if (Math.abs(camera.far - GAME_FPS_CAMERA_FAR) > 0.001) {
    camera.far = GAME_FPS_CAMERA_FAR
    changed = true
  }
  if (changed) camera.updateProjectionMatrix()
}

export function GameFpsMissionStage({ coordinateScale = 1 }: {
  coordinateScale?: number
}) {
  const { camera, gl } = useThree()
  const snapshotRef = React.useRef(readGameFpsSnapshot())
  const stageRootRef = React.useRef<Group | null>(null)
  const npcMeshRefs = React.useRef(new Map<string, Mesh>())
  const npcHighlightRefs = React.useRef(new Map<string, Mesh>())
  const firstFramePublishedRef = React.useRef(false)
  const readyFrameCountRef = React.useRef(0)
  const inputClaimedRef = React.useRef(false)
  const cameraLocalPosition = React.useMemo(() => new Vector3(), [])
  const cameraLocalRotation = React.useMemo(() => new Euler(0, 0, 0, 'YXZ'), [])
  const cameraLocalQuaternion = React.useMemo(() => new Quaternion(), [])
  const stageWorldQuaternion = React.useMemo(() => new Quaternion(), [])

  React.useEffect(() => subscribeGameFpsSnapshot(() => {
    snapshotRef.current = readGameFpsSnapshot()
  }), [])

  React.useEffect(() => {
    const canvas = gl.domElement
    const claimed = claimThreeViewportInputOwnership(INPUT_OWNER_ID)
    inputClaimedRef.current = claimed
    canvas.dataset.kgGameFpsInputOwner = claimed ? INPUT_OWNER_ID : 'blocked'
    canvas.dataset.kgGameFpsSpatialProfile = readGameFpsSpatialProfile().id
    const input = claimed ? installGameFpsDesktopInput(canvas) : null
    return () => {
      inputClaimedRef.current = false
      input?.dispose()
      readyFrameCountRef.current = 0
      releaseGameFpsMotionControlInput()
      releaseThreeViewportInputOwnership(INPUT_OWNER_ID)
      delete canvas.dataset.kgGameFpsInputOwner
      delete canvas.dataset.kgGameFpsFirstFrame
      delete canvas.dataset.kgGameFpsSpatialProfile
      delete canvas.dataset.kgGameFpsCameraFov
      delete canvas.dataset.kgGameFpsGroundedCamera
    }
  }, [gl])

  React.useEffect(() => {
    const clock = createGameFpsSimulationClock({
      runStep: async () => {
        const pose = readMotionControlSnapshot().pose
        applyGameFpsMotionControlInput(
          motionControlPoseToControllerInput(pose),
          isMotionControlPoseTracked(pose),
        )
        const mission = readGameFpsSnapshot()
        if (mission.phase !== 'playing'
          || mission.runtimeError
          || readGameModeSnapshot().simulationStatus !== 'running') return
        await advanceGameModeSimulationBy(GAME_FPS_FIXED_STEP_SECONDS)
      },
      onStepError: reportGameModeSimulationFailure,
      minimumStepIntervalMs: SIMULATION_CLOCK_INTERVAL_MS,
    })
    const releaseInputQueue = bindGameFpsSimulationInputQueue(clock.queueInputStep)
    const timer = window.setInterval(clock.requestStep, SIMULATION_CLOCK_INTERVAL_MS)
    return () => {
      releaseInputQueue()
      window.clearInterval(timer)
      clock.dispose()
    }
  }, [])

  useFrame((_, deltaSeconds) => {
    const snapshot = readGameFpsSnapshot()
    snapshotRef.current = snapshot
    gl.domElement.dataset.kgGameFpsSpatialProfile = readGameFpsSpatialProfile().id
    const perspectiveCamera = resolvePerspectiveCamera(camera)
    if (perspectiveCamera) applyGameFpsCameraOptics(perspectiveCamera)

    const stageRoot = stageRootRef.current
    cameraLocalPosition.set(snapshot.player.x, 1.65, snapshot.player.z)
    cameraLocalRotation.set(snapshot.player.pitch, snapshot.player.yaw, 0, 'YXZ')
    cameraLocalQuaternion.setFromEuler(cameraLocalRotation)
    if (stageRoot) {
      stageRoot.updateWorldMatrix(true, false)
      stageRoot.localToWorld(cameraLocalPosition)
      stageRoot.getWorldQuaternion(stageWorldQuaternion)
      camera.quaternion.copy(stageWorldQuaternion).multiply(cameraLocalQuaternion)
    } else {
      camera.quaternion.copy(cameraLocalQuaternion)
    }
    camera.position.copy(cameraLocalPosition)
    camera.updateMatrixWorld()
    gl.domElement.dataset.kgGameFpsCameraFov = String(perspectiveCamera?.fov ?? '')
    gl.domElement.dataset.kgGameFpsGroundedCamera = perspectiveCamera?.fov === GAME_FPS_CAMERA_FOV_DEGREES ? '1' : '0'

    for (const npc of snapshot.npcs) {
      const mesh = npcMeshRefs.current.get(npc.id)
      if (!mesh) continue
      const sharedControl = readXrSharedAssetGameplayNpcControl(npc.id)
      const highlight = npcHighlightRefs.current.get(npc.id)
      const assignedPose = sharedControl.assignedPresetId
        ? sampleXrAnimationPose({
          kind: 'character-motion',
          presetId: sharedControl.assignedPresetId as XrCharacterMotionPresetId,
          startTimeSeconds: 0,
          loop: true,
        }, snapshot.elapsedSeconds)
        : null
      const livePose = sharedControl.handPoseActive
        ? motionControlPoseToAnimationPose(readMotionControlSnapshot().pose)
        : null
      const pose = livePose || assignedPose
      mesh.position.set(
        npc.x + (pose?.rootOffsetMeters[0] || 0) * 0.35,
        0.9 + (pose?.rootOffsetMeters[1] || 0) * 0.28,
        npc.z + (pose?.rootOffsetMeters[2] || 0) * 0.35,
      )
      mesh.rotation.set(
        (pose?.rootRotationDegrees[0] || 0) * DEG_TO_RAD,
        (pose?.rootRotationDegrees[1] || 0) * DEG_TO_RAD,
        (pose?.rootRotationDegrees[2] || 0) * DEG_TO_RAD,
      )
      mesh.visible = npc.health > 0
      const selectedScale = sharedControl.selected ? 1.12 : 1
      const crouchScale = pose ? Math.max(0.48, 1 - pose.crouch * 0.35) : 1
      mesh.scale.set(
        selectedScale,
        Math.max(0.12, npc.health / 100) * crouchScale,
        selectedScale,
      )
      mesh.userData.kgXrSharedAssetTarget = npc.id
      mesh.userData.kgXrSharedAssetSelected = sharedControl.selected
      mesh.userData.kgXrSharedAssetPreset = sharedControl.assignedPresetId
      mesh.userData.kgXrSharedAssetHandPose = sharedControl.handPoseActive
      if (highlight) {
        highlight.visible = npc.health > 0 && sharedControl.selected
        highlight.position.set(mesh.position.x, 0.05, mesh.position.z)
        highlight.userData.kgXrSharedAssetTarget = npc.id
        highlight.userData.kgXrSharedAssetSelected = sharedControl.selected
        highlight.userData.kgXrTimelineHighlight = sharedControl.selected ? 'npc-selected' : ''
      }
      setMeshColor(
        mesh,
        livePose
          ? SHARED_NPC_CONTROL_COLORS.handPose
          : sharedControl.assignedPresetId
            ? SHARED_NPC_CONTROL_COLORS.animated
            : sharedControl.selected
              ? SHARED_NPC_CONTROL_COLORS.selected
              : ACTION_COLORS[npc.action],
      )
    }
    if (snapshot.runtimeError || snapshot.phase === 'stopped' || !inputClaimedRef.current) {
      firstFramePublishedRef.current = false
      readyFrameCountRef.current = 0
      delete gl.domElement.dataset.kgGameFpsFirstFrame
    } else if (!firstFramePublishedRef.current) {
      readyFrameCountRef.current = deltaSeconds > 0 && deltaSeconds <= GAME_FPS_MAX_FRAME_SECONDS
        ? readyFrameCountRef.current + 1
        : 0
      if (readyFrameCountRef.current >= READY_FRAME_COUNT) {
        firstFramePublishedRef.current = true
        gl.domElement.dataset.kgGameFpsFirstFrame = '1'
      }
    }
  })

  return (
    <group ref={stageRootRef} name="kg_game_fps_mission" scale={coordinateScale} userData={{ coordinateScale }}>
      {GAME_FPS_NPC_IDS.map(id => {
        const npc = snapshotRef.current.npcs.find(candidate => candidate.id === id)!
        return (
          <React.Fragment key={id}>
            <mesh
              name={`kg_game_fps_npc_${id}`}
              ref={mesh => {
                if (mesh) npcMeshRefs.current.set(id, mesh)
                else npcMeshRefs.current.delete(id)
              }}
              position={[npc.x, 0.9, npc.z]}
              castShadow
            >
              <capsuleGeometry args={[0.45, 0.9, 4, 8]} />
              <meshStandardMaterial color="#60a5fa" roughness={0.55} />
            </mesh>
            <mesh
              name={`kg_game_fps_npc_shared_highlight_${id}`}
              ref={mesh => {
                if (mesh) npcHighlightRefs.current.set(id, mesh)
                else npcHighlightRefs.current.delete(id)
              }}
              position={[npc.x, 0.05, npc.z]}
              rotation={[-Math.PI / 2, 0, 0]}
              renderOrder={THREE_RENDER_ORDER.overlays}
              visible={false}
              userData={{
                kgXrSharedAssetTarget: id,
                kgXrSharedAssetSelected: false,
                kgXrTimelineHighlight: 'npc-selected',
              }}
            >
              <ringGeometry args={[NPC_SELECTION_RING_INNER_RADIUS, NPC_SELECTION_RING_OUTER_RADIUS, 36]} />
              <meshBasicMaterial
                color={XR_MOTION_REFERENCE_SELECTION_COLOR}
                transparent
                opacity={0.98}
                depthTest={false}
                depthWrite={false}
                side={DoubleSide}
                toneMapped={false}
              />
            </mesh>
          </React.Fragment>
        )
      })}
    </group>
  )
}
