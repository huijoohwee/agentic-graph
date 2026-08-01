import React from 'react'
import { addAfterEffect, invalidate, useFrame, useThree } from '@react-three/fiber'
import type { FlightSimStageRuntimeController } from './flightSimStageRuntimeController'
import { completeFlightSimReadyFrame } from './flightSimDeadlineRuntime'
import {
  completeFlightSimStagePreparation,
  readCurrentFlightSimStagePreparationRequest,
} from './flightSimStagePreparationRuntime'
import { useFlightSimSurfaceControls } from './useFlightSimSurfaceControls'

export type FlightSimMissionStageProps = Readonly<{
  geospatialComposite?: boolean
  runtimeController: FlightSimStageRuntimeController
}>

/**
 * Retains the Flight simulation's input and frame-lifecycle follower inside the
 * shared Three renderer. All Flight visuals belong to the MapLibre overlay.
 */
export function FlightSimMissionStage({
  geospatialComposite = false,
  runtimeController,
}: FlightSimMissionStageProps) {
  const { gl } = useThree()
  const framePresentationRef = React.useRef({
    playable: false,
    readyAtTickZero: false,
    runId: 0,
    tick: 0,
  })

  useFlightSimSurfaceControls({
    inputElement: gl.domElement,
    requestPresentationFrame: invalidate,
    runtimeController,
  })

  React.useEffect(() => {
    const syncRuntimeSnapshot = () => invalidate()
    syncRuntimeSnapshot()
    return runtimeController.subscribe(syncRuntimeSnapshot)
  }, [invalidate, runtimeController])

  React.useEffect(() => {
    const canvas = gl.domElement
    canvas.dataset.kgFlightSimLifecycleFollower = '1'
    const removeAfterRender = addAfterEffect(() => {
      if (geospatialComposite) {
        delete canvas.dataset.kgFlightSimFirstFrame
        return
      }
      const snapshot = runtimeController.readSnapshot()
      const stagePreparationRequestId =
        readCurrentFlightSimStagePreparationRequest()
      if (
        stagePreparationRequestId !== null
        && snapshot.active
        && snapshot.phase === 'stopped'
        && !runtimeController.isHydrationPending()
        && !snapshot.runtimeError
      ) {
        completeFlightSimStagePreparation(stagePreparationRequestId)
      }
      const presentation = framePresentationRef.current
      if (!presentation.playable) {
        delete canvas.dataset.kgFlightSimFirstFrame
        return
      }
      canvas.dataset.kgFlightSimFirstFrame = '1'
      if (presentation.readyAtTickZero) {
        completeFlightSimReadyFrame(presentation.runId, presentation.tick)
      }
    })
    invalidate()
    return () => {
      removeAfterRender()
      delete canvas.dataset.kgFlightSimLifecycleFollower
      delete canvas.dataset.kgFlightSimFirstFrame
    }
  }, [geospatialComposite, gl, invalidate, runtimeController])

  useFrame(() => {
    const snapshot = runtimeController.readSnapshot()
    const playable = (snapshot.phase === 'ready' || snapshot.phase === 'flying')
      && snapshot.runId > 0
      && !runtimeController.isHydrationPending()
    const presentation = framePresentationRef.current
    presentation.playable = snapshot.active
      && playable
      && !snapshot.runtimeError
    presentation.readyAtTickZero = snapshot.phase === 'ready'
      && snapshot.tick === 0
    presentation.runId = snapshot.runId
    presentation.tick = snapshot.tick
  })

  return null
}

export function createFlightSimMissionStage(
  runtimeController: FlightSimStageRuntimeController,
): React.ComponentType<{ geospatialComposite?: boolean }> {
  return function BoundFlightSimMissionStage(props) {
    return (
      <FlightSimMissionStage
        {...props}
        runtimeController={runtimeController}
      />
    )
  }
}
