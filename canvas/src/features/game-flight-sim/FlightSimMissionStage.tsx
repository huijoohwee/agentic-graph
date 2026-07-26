import React from 'react'
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber'
import { type Group, type Mesh } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { XrProceduralVehicleGeometry } from '@/features/three/XrProceduralVehicleGeometry'
import {
  claimThreeViewportInputOwnership,
  releaseThreeViewportInputOwnership,
} from '@/features/three/threeViewportInputOwnership'
import { readMotionControlSnapshot } from '@/features/three/motionControlRuntime'
import {
  isMotionControlPoseTracked,
  motionControlPoseToControllerInput,
} from '@/features/three/motionControlPose'
import { readXrNativeControllerCamera } from '@/features/three/xrNativeControllerCameraRuntime'
import { readFlightSimDefaultAssetLoadReport } from './assetSpec/flightSimDefaultAssets'
import {
  FLIGHT_SIM_AIRCRAFT_FORWARD,
  FLIGHT_SIM_AIRCRAFT_MODEL_ROTATION,
  FLIGHT_SIM_AIRCRAFT_ORIENTATION_NODE,
  FLIGHT_SIM_PROCEDURAL_AIRCRAFT_FORWARD,
} from './flightSimAircraftPresentation'
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
import type {
  FlightSimStageRuntimeController,
} from './flightSimStageRuntimeController'
import {
  createFlightSimSimulationClock,
  runFlightSimStageSimulationStep,
} from './flightSimSimulationClock'
import { completeFlightSimReadyFrame } from './flightSimDeadlineRuntime'
import {
  completeFlightSimStagePreparation,
  readCurrentFlightSimStagePreparationRequest,
} from './flightSimStagePreparationRuntime'

const INPUT_OWNER_ID = 'flight-sim:aircraft'
const CLOCK_INTERVAL_MS = FLIGHT_SIM_FIXED_STEP_SECONDS * 1000

export type FlightSimMissionStageProps = Readonly<{
  coordinateScale?: number
  runtimeController: FlightSimStageRuntimeController
}>

export function FlightSimMissionStage({
  coordinateScale = 1,
  runtimeController,
}: FlightSimMissionStageProps) {
  const { gl } = useThree()
  const actorRef = React.useRef<Group | null>(null)
  const waypointRefs = React.useRef(new Map<string, Mesh>())
  const landingPadRef = React.useRef<Mesh | null>(null)
  const snapshotRef = React.useRef(runtimeController.readSnapshot())
  const desktopInputRef = React.useRef(FLIGHT_SIM_NEUTRAL_INPUT)
  const desktopBindingRef = React.useRef<FlightSimInputBinding | null>(null)
  const inputClaimedRef = React.useRef(false)
  const framePresentationRef = React.useRef({
    playable: false,
    readyAtTickZero: false,
    runId: 0,
    tick: 0,
  })
  const profile = React.useMemo(
    () => runtimeController.readSpatialProfile(),
    [runtimeController],
  )
  const assetCatalog = React.useMemo(readFlightSimDefaultAssetLoadReport, [])
  const [optionalBeaconScene, setOptionalBeaconScene] =
    React.useState<Group | null>(null)

  React.useEffect(() => {
    let retained = true
    const bytes = Uint8Array.from(assetCatalog.optionalBeacon.bytes)
    new GLTFLoader().parse(
      bytes.buffer,
      '',
      gltf => {
        if (!retained) return
        const scene = gltf.scene.clone(true)
        let partIndex = 0
        scene.name = 'kg_flight_sim_optional_beacon'
        scene.traverse(object => {
          if (object === scene) return
          partIndex += 1
          object.name = `kg_flight_sim_optional_beacon_part_${partIndex}`
        })
        scene.userData = {
          assetKind: assetCatalog.optionalBeacon.kind,
          assetPath: assetCatalog.optionalBeacon.path,
          assetSha256: assetCatalog.optionalBeacon.sha256,
          opaque: assetCatalog.optionalBeacon.opaque,
        }
        setOptionalBeaconScene(scene)
      },
      error => {
        if (!retained) return
        runtimeController.reportRenderFailure(new Error(
          `Flight Sim optional beacon GLB could not render: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ))
      },
    )
    return () => {
      retained = false
    }
  }, [assetCatalog, runtimeController])

  React.useEffect(() => runtimeController.subscribe(() => {
    snapshotRef.current = runtimeController.readSnapshot()
  }), [runtimeController])

  React.useEffect(() => {
    const canvas = gl.domElement
    const claimed = claimThreeViewportInputOwnership(INPUT_OWNER_ID, {
      blocksProgrammaticCamera: false,
    })
    inputClaimedRef.current = claimed
    canvas.dataset.kgFlightSimInputOwner = claimed ? INPUT_OWNER_ID : 'blocked'
    canvas.dataset.kgFlightSimSpatialProfile = profile.id
    const desktop = claimed ? installFlightSimDesktopInput(canvas, {
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
    }) : null
    const removeAfterRender = addAfterEffect(() => {
      if (!inputClaimedRef.current) return
      const snapshot = runtimeController.readSnapshot()
      const stagePreparationRequestId =
        readCurrentFlightSimStagePreparationRequest()
      if (
        stagePreparationRequestId !== null
        && snapshot.active
        && snapshot.phase === 'stopped'
        && !runtimeController.isHydrationPending()
        && !snapshot.runtimeError
        && actorRef.current
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
    desktopBindingRef.current = desktop
    return () => {
      removeAfterRender()
      inputClaimedRef.current = false
      if (desktopBindingRef.current === desktop) desktopBindingRef.current = null
      desktop?.dispose()
      releaseThreeViewportInputOwnership(INPUT_OWNER_ID)
      delete canvas.dataset.kgFlightSimInputOwner
      delete canvas.dataset.kgFlightSimSpatialProfile
      delete canvas.dataset.kgFlightSimFirstFrame
    }
  }, [gl, profile.id, runtimeController])

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

  useFrame(() => {
    const snapshot = runtimeController.readSnapshot()
    snapshotRef.current = snapshot
    const actor = actorRef.current
    if (actor) {
      actor.position.set(...snapshot.aircraft.position)
      actor.rotation.set(
        snapshot.aircraft.pitch,
        snapshot.aircraft.yaw,
        -snapshot.aircraft.roll,
        'YXZ',
      )
      actor.visible = snapshot.active
    }
    for (let index = 0; index < profile.waypoints.length; index += 1) {
      const waypoint = profile.waypoints[index]!
      const mesh = waypointRefs.current.get(waypoint.id)
      if (mesh) mesh.visible = snapshot.active && index >= snapshot.waypointIndex
    }
    if (landingPadRef.current) {
      landingPadRef.current.visible = snapshot.active
        && snapshot.waypointIndex >= profile.waypoints.length
    }
    const playable = (snapshot.phase === 'ready' || snapshot.phase === 'flying')
      && snapshot.runId > 0
      && !runtimeController.isHydrationPending()
    const presentation = framePresentationRef.current
    presentation.playable = snapshot.active
      && playable
      && inputClaimedRef.current
      && !snapshot.runtimeError
    presentation.readyAtTickZero = snapshot.phase === 'ready'
      && snapshot.tick === 0
    presentation.runId = snapshot.runId
    presentation.tick = snapshot.tick
  })

  return (
    <group
      name="kg_flight_sim_mission"
      scale={coordinateScale}
      userData={{ actorOnly: true, coordinateScale, spatialProfile: profile.id }}
    >
      <group
        ref={actorRef}
        name="kg_flight_sim_aircraft"
        position={snapshotRef.current.aircraft.position}
        userData={{
          assetId: assetCatalog.aircraft.assetSpec.id,
          representation: assetCatalog.aircraft.assetSpec.representation,
        }}
      >
        <group
          name={FLIGHT_SIM_AIRCRAFT_ORIENTATION_NODE}
          rotation={[...FLIGHT_SIM_AIRCRAFT_MODEL_ROTATION]}
          userData={{
            flightForward: FLIGHT_SIM_AIRCRAFT_FORWARD,
            proceduralForward: FLIGHT_SIM_PROCEDURAL_AIRCRAFT_FORWARD,
          }}
        >
          <XrProceduralVehicleGeometry
            kind="airplane"
            color={assetCatalog.aircraft.assetSpec.defaultColor}
            size={assetCatalog.aircraft.assetSpec.dimensionsMeters}
          />
        </group>
      </group>
      {optionalBeaconScene ? (
        <primitive
          object={optionalBeaconScene}
          position={[
            profile.landingPad.position[0] + 8,
            profile.landingPad.position[1] + 0.25,
            profile.landingPad.position[2] + 8,
          ]}
          scale={4}
        />
      ) : null}
      {profile.waypoints.map((waypoint, index) => (
        <mesh
          key={waypoint.id}
          ref={mesh => {
            if (mesh) waypointRefs.current.set(waypoint.id, mesh)
            else waypointRefs.current.delete(waypoint.id)
          }}
          name={`kg_${waypoint.id.replaceAll(':', '_')}`}
          position={waypoint.position}
          rotation={[Math.PI / 2, 0, 0]}
          userData={{ waypointId: waypoint.id, waypointIndex: index }}
        >
          <torusGeometry args={[waypoint.radiusMeters, 0.14, 10, 32]} />
          <meshStandardMaterial
            color={index === snapshotRef.current.waypointIndex ? '#22d3ee' : '#f8fafc'}
            emissive="#0891b2"
            emissiveIntensity={0.42}
            transparent
            opacity={0.82}
          />
        </mesh>
      ))}
      <mesh
        ref={landingPadRef}
        name="kg_flight_sim_landing_pad"
        position={profile.landingPad.position}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={snapshotRef.current.waypointIndex >= profile.waypoints.length}
        userData={{
          landingPadId: profile.landingPad.id,
          captureRadiusMeters: profile.landingPad.radiusMeters,
        }}
      >
        <ringGeometry args={[2.4, 3.2, 40]} />
        <meshStandardMaterial
          color="#facc15"
          emissive="#ca8a04"
          emissiveIntensity={0.5}
          transparent
          opacity={0.9}
        />
      </mesh>
    </group>
  )
}

export function createFlightSimMissionStage(
  runtimeController: FlightSimStageRuntimeController,
): React.ComponentType<{ coordinateScale?: number }> {
  return function BoundFlightSimMissionStage(props) {
    return (
      <FlightSimMissionStage
        {...props}
        runtimeController={runtimeController}
      />
    )
  }
}
