import React from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import type { Object3D } from 'three'
import type { XrMotionReferenceStagePreset } from './xrSceneLibrary'
import { xrMotionReferenceWorldPosition } from './xrMotionReferenceCoordinates'
import { XrSingaporeTerrainGeometry } from './XrSingaporeTerrainGeometry'

const STRUCTURE_TONES = {
  light: '#94a3b8',
  mid: '#64748b',
  dark: '#334155',
  accent: '#0f766e',
} as const

export function XrStagePresetGeometry({
  stage,
  span,
  groundY = 0,
  showAxes = true,
  showGrid = true,
  shadows = false,
  minAxesSize = 4,
  minFloorThickness = 0.5,
  onFloorPoint,
  coordinateRootRef,
}: {
  stage: XrMotionReferenceStagePreset
  span: number
  groundY?: number
  showAxes?: boolean
  showGrid?: boolean
  shadows?: boolean
  minAxesSize?: number
  minFloorThickness?: number
  onFloorPoint?: (point: readonly [number, number, number]) => void
  coordinateRootRef?: React.RefObject<Object3D | null>
}) {
  const scale = span / Math.max(stage.sizeMeters[0], stage.sizeMeters[1], 1)
  const floorWidth = stage.sizeMeters[0] * scale
  const floorHeight = stage.sizeMeters[1] * scale
  const floorThickness = Math.max(minFloorThickness, scale * 0.08)
  const singapore = stage.id === 'singapore'
  return (
    <group name={`agentic_os_xr_stage_preset_${stage.id}`} userData={{ stageId: stage.id }}>
      <mesh
        name="agentic_os_xr_motion_stage_floor"
        position={[0, groundY - floorThickness / 2, 0]}
        receiveShadow={shadows}
        userData={{ kgXrMarkFloor: true, interactive: Boolean(onFloorPoint) }}
        onClick={onFloorPoint ? (event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation()
          const point = event.point.clone()
          const coordinateRoot = coordinateRootRef?.current
          if (coordinateRoot) {
            coordinateRoot.updateWorldMatrix(true, false)
            coordinateRoot.worldToLocal(point)
          }
          onFloorPoint([point.x, groundY, point.z])
        } : undefined}
      >
        <boxGeometry args={[floorWidth, floorThickness, floorHeight]} />
        <meshStandardMaterial
          color={singapore ? '#cfe2c5' : '#475569'}
          roughness={1}
          metalness={0}
          transparent={!singapore}
          opacity={singapore ? 1 : 0.68}
        />
      </mesh>
      {showGrid ? (
        <gridHelper
          name="agentic_os_xr_motion_world_grid"
          args={[floorWidth, Math.max(12, Math.round(stage.sizeMeters[0] * 2)), '#38bdf8', '#334155']}
          position={[0, groundY + 0.08, 0]}
        />
      ) : null}
      {showAxes ? (
        <axesHelper
          name="agentic_os_xr_motion_world_origin"
          args={[Math.max(minAxesSize, scale * 2.4)]}
          position={[0, groundY + 0.12, 0]}
        />
      ) : null}
      {singapore ? (
        <XrSingaporeTerrainGeometry
          stage={stage}
          scale={scale}
          groundY={groundY}
          shadows={shadows}
        />
      ) : null}
      <group name={`agentic_os_xr_motion_stage_preset_${stage.id}`}>
        {!singapore ? stage.structures.map(structure => {
          const position = xrMotionReferenceWorldPosition(structure.position, scale, groundY)
          return (
            <mesh
              key={structure.id}
              name={`agentic_os_xr_motion_structure_${structure.id}`}
              position={position}
              castShadow={shadows}
              receiveShadow={shadows}
            >
              <boxGeometry args={[
                structure.size[0] * scale,
                structure.size[1] * scale,
                structure.size[2] * scale,
              ]} />
              <meshStandardMaterial
                color={STRUCTURE_TONES[structure.tone]}
                roughness={0.95}
                metalness={0}
                transparent
                opacity={0.78}
              />
            </mesh>
          )
        }) : null}
      </group>
    </group>
  )
}
