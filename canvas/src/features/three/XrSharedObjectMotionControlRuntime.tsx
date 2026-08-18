import React from 'react'
import { useFrame } from '@react-three/fiber'
import { readMotionControlSnapshot } from './motionControlRuntime'
import { motionControlPoseToControllerInput } from './motionControlPose'
import { readMotionControlDeviceSensorSnapshot } from './motionControlDeviceSensorRuntime'
import {
  createXrNativeControllerInput,
  mergeXrNativeControllerInputs,
  readXrNativeControllerGamepadInput,
  readXrNativeControllerSpatialInput,
} from './xrNativeControllerInput'
import { readXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import {
  applyXrSharedObjectControllerMotionTarget,
  resolveXrSharedObjectControllerMotionTarget,
  selectedXrSharedObjectMotionControlActive,
} from './xrSharedAssetControlRuntime'
import {
  claimThreeObjectInputOwnership,
  releaseThreeObjectInputOwnership,
} from './threeObjectInputOwnership'

const XR_SHARED_OBJECT_MOTION_POINTER_ID = -2

function readSharedObjectControllerInput() {
  const pads = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function'
    ? Array.from(navigator.getGamepads()).filter(Boolean)
    : []
  const gamepad = readXrNativeControllerGamepadInput(pads[0])
  const motion = motionControlPoseToControllerInput(readMotionControlSnapshot().pose)
  const deviceMotion = readXrNativeControllerSpatialInput(readMotionControlDeviceSensorSnapshot())
  return mergeXrNativeControllerInputs(gamepad, motion, deviceMotion)
}

export function XrSharedObjectMotionControlRuntime({ enabled = true }: { enabled?: boolean }) {
  const ownerIdRef = React.useRef('')

  const releaseOwnership = React.useCallback(() => {
    const ownerId = ownerIdRef.current
    ownerIdRef.current = ''
    if (ownerId) releaseThreeObjectInputOwnership(ownerId, XR_SHARED_OBJECT_MOTION_POINTER_ID)
  }, [])

  React.useEffect(() => releaseOwnership, [releaseOwnership])

  useFrame((_state, deltaSeconds) => {
    if (!enabled) {
      releaseOwnership()
      return
    }
    const runtime = readXrMotionReferenceRuntime()
    if (!selectedXrSharedObjectMotionControlActive(runtime)) {
      releaseOwnership()
      return
    }
    const controllerInput = readSharedObjectControllerInput()
    if (controllerInput.source === 'none') {
      releaseOwnership()
      return
    }
    const target = resolveXrSharedObjectControllerMotionTarget({
      controllerInput,
      deltaSeconds,
      runtime,
    })
    if (!target) {
      releaseOwnership()
      return
    }
    if (ownerIdRef.current && ownerIdRef.current !== target.ownerId) releaseOwnership()
    if (!claimThreeObjectInputOwnership(target.ownerId, XR_SHARED_OBJECT_MOTION_POINTER_ID)) return
    ownerIdRef.current = target.ownerId
    const result = applyXrSharedObjectControllerMotionTarget(target)
    if (!result.applied && result.reason !== 'unchanged') releaseOwnership()
  })

  return null
}

export function readXrSharedObjectMotionControllerInputForTests() {
  return createXrNativeControllerInput(readSharedObjectControllerInput())
}
