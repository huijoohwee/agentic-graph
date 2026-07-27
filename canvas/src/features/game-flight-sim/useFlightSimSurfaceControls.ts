import React from 'react'
import {
  claimThreeViewportInputOwnership,
  releaseThreeViewportInputOwnership,
  subscribeThreeViewportInputOwnership,
} from '@/features/three/threeViewportInputOwnership'
import { readMotionControlSnapshot } from '@/features/three/motionControlRuntime'
import {
  isMotionControlPoseTracked,
  motionControlPoseToControllerInput,
} from '@/features/three/motionControlPose'
import { readXrNativeControllerCamera } from '@/features/three/xrNativeControllerCameraRuntime'
import { cycleFlightSimCameraView } from './flightSimCameraRuntime'
import {
  installFlightSimDesktopInput,
  mergeFlightSimInputs,
  readFlightSimTouchInput,
  readStandardFlightSimGamepad,
  setFlightSimTouchInput,
  type FlightSimInputBinding,
} from './flightSimInput'
import { flightSimInputFromMotionController } from './flightSimMotionControlAdapter'
import {
  FLIGHT_SIM_FIXED_STEP_SECONDS,
  FLIGHT_SIM_NEUTRAL_INPUT,
} from './flightSimModel'
import type { FlightSimStageRuntimeController } from './flightSimStageRuntimeController'
import {
  createFlightSimSimulationClock,
  runFlightSimStageSimulationStep,
} from './flightSimSimulationClock'

const INPUT_OWNER_ID = 'flight-sim:aircraft'
const CLOCK_INTERVAL_MS = FLIGHT_SIM_FIXED_STEP_SECONDS * 1000

export function useFlightSimSurfaceControls(args: Readonly<{
  inputElement: HTMLElement | null
  requestPresentationFrame: () => void
  runtimeController: FlightSimStageRuntimeController
}>): void {
  const { inputElement, requestPresentationFrame, runtimeController } = args
  const desktopInputRef = React.useRef(FLIGHT_SIM_NEUTRAL_INPUT)
  const desktopBindingRef = React.useRef<FlightSimInputBinding | null>(null)

  React.useEffect(() => {
    const element = inputElement
    if (!element) return
    let acquiringInput = false
    let disposed = false
    let desktop: FlightSimInputBinding | null = null
    let inputClaimed = false
    const acquireInput = () => {
      if (disposed || acquiringInput || inputClaimed) return
      acquiringInput = true
      const claimed = claimThreeViewportInputOwnership(INPUT_OWNER_ID, {
        blocksProgrammaticCamera: false,
      })
      acquiringInput = false
      element.dataset.kgFlightSimInputOwner = claimed ? INPUT_OWNER_ID : 'blocked'
      if (!claimed) return
      inputClaimed = true
      desktop = installFlightSimDesktopInput(element, {
        onInput: value => {
          desktopInputRef.current = value
        },
        onCycleCamera: cycleFlightSimCameraView,
        onPause: () => {
          setFlightSimTouchInput({})
          runtimeController.stop()
        },
        shouldPauseOnPointerRelease: () => readXrNativeControllerCamera().mode === 'fixed-follow',
        shouldRequestPointerLock: () => readXrNativeControllerCamera().mode === 'fixed-follow',
      })
      desktopBindingRef.current = desktop
      requestPresentationFrame()
    }
    const unsubscribeInputOwnership = subscribeThreeViewportInputOwnership(acquireInput)
    acquireInput()
    requestPresentationFrame()
    return () => {
      disposed = true
      unsubscribeInputOwnership()
      if (desktopBindingRef.current === desktop) desktopBindingRef.current = null
      desktop?.dispose()
      if (inputClaimed) releaseThreeViewportInputOwnership(INPUT_OWNER_ID)
      delete element.dataset.kgFlightSimInputOwner
    }
  }, [inputElement, requestPresentationFrame, runtimeController])

  React.useEffect(() => {
    const clock = createFlightSimSimulationClock({
      minimumStepIntervalMs: CLOCK_INTERVAL_MS,
      runStep: async () => {
        const pose = readMotionControlSnapshot().pose
        const motionInput = flightSimInputFromMotionController(
          motionControlPoseToControllerInput(pose),
          isMotionControlPoseTracked(pose),
        )
        const input = mergeFlightSimInputs([
          desktopBindingRef.current?.consumeInput() ?? desktopInputRef.current,
          readFlightSimTouchInput(),
          readStandardFlightSimGamepad(),
          motionInput,
        ])
        await runFlightSimStageSimulationStep({
          input,
          stageInput: runtimeController.setInput,
          advanceFixedStep: runtimeController.advanceByFixedStep,
        })
      },
      onStepError: () => {
        runtimeController.stop()
      },
    })
    const timer = window.setInterval(clock.requestStep, CLOCK_INTERVAL_MS)
    return () => {
      window.clearInterval(timer)
      clock.dispose()
      runtimeController.setInput(FLIGHT_SIM_NEUTRAL_INPUT)
    }
  }, [runtimeController])
}
