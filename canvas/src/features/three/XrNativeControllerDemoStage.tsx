import React from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Object3D } from 'three'
import type { XrMotionReferenceStagePreset } from './xrSceneLibrary'
import {
  XR_NATIVE_DYNAMIC_BODY_Y_OFFSETS,
  XrNativeControllerDemoEnvironment,
  XrNativeControllerDynamicProps,
} from './XrNativeControllerDemoEnvironment'
import {
  XrNativeControllerBallVisual,
  XrNativeControllerRocketVisual,
} from './XrNativeControllerDemoVehicles'
import { XrNativeControllerAuthoredSubjects } from './XrNativeControllerAuthoredSubjects'
import { XrKeyboardChoreographyRuntime } from './XrKeyboardChoreographyRuntime'
import { XrSharedObjectMotionControlRuntime } from './XrSharedObjectMotionControlRuntime'
import {
  createXrNativeControllerInput,
  mergeXrNativeControllerInputs,
  readXrNativeControllerGamepadInput,
  readXrNativeControllerKeyboardInput,
  readXrNativeControllerSpatialInput,
  shouldConsumeXrNativeControllerKeyUp,
  xrNativeControllerInputCode,
} from './xrNativeControllerInput'
import {
  readSharedXrNativeControllerDemoFrame,
  readXrNativeControllerDemo,
  resetSharedXrNativeControllerDemo,
  setSharedXrNativeControllerDemoInput,
  stepSharedXrNativeControllerDemo,
  subscribeXrNativeControllerDemo,
} from './xrNativeControllerDemoRuntime'
import { readMotionControlSnapshot } from './motionControlRuntime'
import { motionControlPoseToControllerInput } from './motionControlPose'
import { readMotionControlDeviceSensorSnapshot } from './motionControlDeviceSensorRuntime'
import { selectedXrSharedObjectMotionControlActive } from './xrSharedAssetControlRuntime'
import {
  readFlightSimTrainingScenario,
  resolveFlightSimTrainingMission,
  subscribeFlightSimTrainingScenario,
} from '@/features/game-flight-sim/flightSimTrainingScenario'

const INTERACTIVE_TARGET_SELECTOR = 'button, a[href], input, textarea, select, [contenteditable="true"], [role="button"], [role="link"]'

function isInteractiveTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null
  return Boolean(element?.closest(INTERACTIVE_TARGET_SELECTOR))
}

export function XrNativeControllerDemoStage({
  environmentVisible = true,
  inputEnabled = true,
  stageScale,
  groundY,
  retainStage = false,
  stage,
  visualsVisible = true,
}: {
  environmentVisible?: boolean
  inputEnabled?: boolean
  stageScale: number
  groundY: number
  retainStage?: boolean
  stage: XrMotionReferenceStagePreset
  visualsVisible?: boolean
}) {
  const runtime = React.useSyncExternalStore(
    subscribeXrNativeControllerDemo,
    readXrNativeControllerDemo,
    readXrNativeControllerDemo,
  )
  const trainingScenario = React.useSyncExternalStore(
    subscribeFlightSimTrainingScenario,
    readFlightSimTrainingScenario,
    readFlightSimTrainingScenario,
  )
  const night = resolveFlightSimTrainingMission(trainingScenario.missionId).night
  const pressedCodesRef = React.useRef(new Set<string>())
  const playerRootRef = React.useRef<Group | null>(null)
  const ballRootRef = React.useRef<Group | null>(null)
  const rocketRootRef = React.useRef<Group | null>(null)
  const flameRef = React.useRef<Group | null>(null)
  const bodyRefs = React.useRef(new Map<string, Object3D>())
  const registerBodyRef = React.useCallback((subjectId: string, node: Object3D | null) => {
    if (node) bodyRefs.current.set(subjectId, node)
    else bodyRefs.current.delete(subjectId)
  }, [])
  const stageVisible = visualsVisible
    && (retainStage || runtime.phase !== 'off')

  React.useEffect(() => {
    const clearInput = () => {
      pressedCodesRef.current.clear()
      setSharedXrNativeControllerDemoInput(createXrNativeControllerInput())
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!inputEnabled || runtime.phase === 'off' || isInteractiveTarget(event.target)) return
      if (event.code === 'KeyR') {
        if (!event.repeat) resetSharedXrNativeControllerDemo()
        event.preventDefault()
        return
      }
      if (!xrNativeControllerInputCode(event.code)) return
      pressedCodesRef.current.add(event.code)
      event.preventDefault()
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (!xrNativeControllerInputCode(event.code)) return
      const wasCaptured = pressedCodesRef.current.delete(event.code)
      if (shouldConsumeXrNativeControllerKeyUp({
        active: inputEnabled && runtime.phase !== 'off',
        code: event.code,
        editableTarget: isInteractiveTarget(event.target),
        wasCaptured,
      })) event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', clearInput)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', clearInput)
      clearInput()
    }
  }, [inputEnabled, runtime.phase])

  useFrame((_state, deltaSeconds) => {
    if (inputEnabled) {
      const sharedObjectInputActive = selectedXrSharedObjectMotionControlActive()
      const keyboard = sharedObjectInputActive
        ? createXrNativeControllerInput()
        : readXrNativeControllerKeyboardInput(pressedCodesRef.current)
      const pads = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
        ? Array.from(navigator.getGamepads()).filter(Boolean)
        : []
      const gamepad = sharedObjectInputActive
        ? createXrNativeControllerInput()
        : readXrNativeControllerGamepadInput(pads[0])
      const motion = sharedObjectInputActive
        ? createXrNativeControllerInput()
        : motionControlPoseToControllerInput(readMotionControlSnapshot().pose)
      const deviceMotion = sharedObjectInputActive
        ? createXrNativeControllerInput()
        : readXrNativeControllerSpatialInput(readMotionControlDeviceSensorSnapshot())
      setSharedXrNativeControllerDemoInput(mergeXrNativeControllerInputs(keyboard, gamepad, motion, deviceMotion))
      stepSharedXrNativeControllerDemo(deltaSeconds)
    }
    const frame = readSharedXrNativeControllerDemoFrame()
    const root = playerRootRef.current
    if (root) {
      root.position.set(...frame.player.position)
      root.visible = frame.phase !== 'off'
    }
    if (ballRootRef.current) {
      ballRootRef.current.visible = frame.mode === 'ball'
      ballRootRef.current.rotation.set(...frame.ballRotation)
    }
    if (rocketRootRef.current) {
      rocketRootRef.current.visible = frame.mode === 'rocket'
      rocketRootRef.current.rotation.set(...frame.rocketRotation)
    }
    if (flameRef.current) {
      flameRef.current.visible = frame.rocketThrusting
      const pulse = 0.86 + Math.sin(frame.elapsedSeconds * 34) * 0.14
      flameRef.current.scale.set(1, pulse, 1)
    }
    for (const body of frame.bodies) {
      const object = bodyRefs.current.get(body.subjectId)
      if (!object) continue
      const yOffset = XR_NATIVE_DYNAMIC_BODY_Y_OFFSETS[body.subjectId] || 0
      object.position.set(body.position[0], body.position[1] + yOffset, body.position[2])
      const rotation = frame.bodyRotations[body.subjectId]
      if (rotation) object.rotation.set(...rotation)
    }
  })

  return (
    <>
      {inputEnabled ? <XrKeyboardChoreographyRuntime /> : null}
      {inputEnabled ? <XrSharedObjectMotionControlRuntime /> : null}
      {stageVisible ? (
        <>
          <ambientLight intensity={night ? 0.13 : 0.4} />
          <hemisphereLight
            args={night ? ['#182a56', '#090d17', 0.22] : ['#dff4ff', '#d9b978', 0.55]}
          />
          <directionalLight
            position={[stageScale * 12, stageScale * 19, stageScale * 10]}
            intensity={night ? 0.5 : 1.8}
            color={night ? '#9db7ff' : '#fff8df'}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-left={stageScale * -16}
            shadow-camera-right={stageScale * 16}
            shadow-camera-top={stageScale * 15}
            shadow-camera-bottom={stageScale * -15}
            shadow-camera-far={stageScale * 55}
            shadow-bias={-0.0002}
          />
        </>
      ) : null}
      <group
        name="kg_xr_native_controller_demo"
        position={[0, groundY, 0]}
        scale={stageScale}
        visible={stageVisible}
        userData={{
          schema: runtime.schema,
          phase: runtime.phase,
          mode: runtime.mode,
          objective: runtime.objective,
          input: inputEnabled ? 'keyboard-gamepad-motion-device-sensors' : 'game-mode-suspended',
          followCamera: runtime.followCamera,
          environment: environmentVisible ? 'xr' : 'geo-background',
          stageScale,
          terrainId: runtime.terrainId,
        }}
      >
        {environmentVisible ? <XrNativeControllerDemoEnvironment objective={runtime.objective} stage={stage} /> : null}
        <XrNativeControllerAuthoredSubjects />
        <group ref={playerRootRef} name="kg_xr_native_controller_player">
          <XrNativeControllerBallVisual rootRef={ballRootRef} />
          <XrNativeControllerRocketVisual rootRef={rocketRootRef} flameRef={flameRef} />
        </group>
        <XrNativeControllerDynamicProps registerBodyRef={registerBodyRef} />
      </group>
    </>
  )
}
