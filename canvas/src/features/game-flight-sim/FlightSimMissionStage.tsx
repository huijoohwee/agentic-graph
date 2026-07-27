import React from 'react'
import { addAfterEffect, invalidate, useFrame, useThree } from '@react-three/fiber'
import { type Group, type Mesh } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { XrProceduralVehicleGeometry } from '@/features/three/XrProceduralVehicleGeometry'
import { readFlightSimDefaultAssetLoadReport } from './assetSpec/flightSimDefaultAssets'
import {
  FLIGHT_SIM_AIRCRAFT_FORWARD,
  FLIGHT_SIM_AIRCRAFT_MODEL_ROTATION,
  FLIGHT_SIM_AIRCRAFT_ORIENTATION_NODE,
  FLIGHT_SIM_PROCEDURAL_AIRCRAFT_FORWARD,
} from './flightSimAircraftPresentation'
import type {
  FlightSimStageRuntimeController,
} from './flightSimStageRuntimeController'
import { completeFlightSimReadyFrame } from './flightSimDeadlineRuntime'
import {
  completeFlightSimStagePreparation,
  readCurrentFlightSimStagePreparationRequest,
} from './flightSimStagePreparationRuntime'
import { useFlightSimSurfaceControls } from './useFlightSimSurfaceControls'

export type FlightSimMissionStageProps = Readonly<{
  actorsVisible?: boolean
  coordinateScale?: number
  runtimeController: FlightSimStageRuntimeController
}>

export function FlightSimMissionStage({
  actorsVisible = true,
  coordinateScale = 1,
  runtimeController,
}: FlightSimMissionStageProps) {
  const { gl } = useThree()
  const actorRef = React.useRef<Group | null>(null)
  const waypointRefs = React.useRef(new Map<string, Mesh>())
  const landingPadRef = React.useRef<Mesh | null>(null)
  const snapshotRef = React.useRef(runtimeController.readSnapshot())
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

  useFlightSimSurfaceControls({
    inputElement: gl.domElement,
    requestPresentationFrame: invalidate,
    runtimeController,
  })

  React.useEffect(() => {
    const syncRuntimeSnapshot = () => {
      snapshotRef.current = runtimeController.readSnapshot()
      // The shared XR Canvas pauses on a demand loop while authored controls are
      // suspended. Request a committed frame so stage readiness is observable.
      invalidate()
    }
    syncRuntimeSnapshot()
    return runtimeController.subscribe(syncRuntimeSnapshot)
  }, [invalidate, runtimeController])

  React.useEffect(() => {
    const canvas = gl.domElement
    canvas.dataset.kgFlightSimSpatialProfile = profile.id
    canvas.dataset.kgFlightSimVisualProjection = actorsVisible
      ? 'r3f'
      : 'maplibre'
    const removeAfterRender = addAfterEffect(() => {
      if (!actorsVisible) {
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
    // Stage readiness belongs to the committed mission render, while desktop
    // input ownership is an independent claim that may still be changing hands.
    invalidate()
    return () => {
      removeAfterRender()
      delete canvas.dataset.kgFlightSimSpatialProfile
      delete canvas.dataset.kgFlightSimVisualProjection
      delete canvas.dataset.kgFlightSimFirstFrame
    }
  }, [actorsVisible, gl, invalidate, profile.id, runtimeController])

  React.useEffect(() => {
    const canvas = gl.domElement
    if (!optionalBeaconScene) {
      delete canvas.dataset.kgFlightSimOptionalBeacon
      return
    }
    const partNames: string[] = []
    let meshDescendantCount = 0
    optionalBeaconScene.traverse(object => {
      if (object === optionalBeaconScene) return
      if (object.name) partNames.push(object.name)
      if ('isMesh' in object && object.isMesh === true) meshDescendantCount += 1
    })
    canvas.dataset.kgFlightSimOptionalBeacon = JSON.stringify({
      assetKind: assetCatalog.optionalBeacon.kind,
      assetPath: assetCatalog.optionalBeacon.path,
      assetSha256: assetCatalog.optionalBeacon.sha256,
      meshDescendantCount,
      opaque: assetCatalog.optionalBeacon.opaque,
      partNames: partNames.sort(),
    })
    return () => {
      delete canvas.dataset.kgFlightSimOptionalBeacon
    }
  }, [assetCatalog, gl, optionalBeaconScene])

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
      visible={actorsVisible}
      userData={{
        actorOnly: true,
        coordinateScale,
        mapProjectionOnly: !actorsVisible,
        spatialProfile: profile.id,
        visualProjection: actorsVisible ? 'r3f' : 'maplibre',
      }}
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
): React.ComponentType<{
  actorsVisible?: boolean
  coordinateScale?: number
}> {
  return function BoundFlightSimMissionStage(props) {
    return (
      <FlightSimMissionStage
        {...props}
        runtimeController={runtimeController}
      />
    )
  }
}
