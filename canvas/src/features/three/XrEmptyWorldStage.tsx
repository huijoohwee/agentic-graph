import React from 'react'
import * as THREE from 'three'
import { THREE_RENDER_ORDER } from '@/features/three/renderOrder'
import {
  XR_MOTION_STAGE_FLOOR_DEPTH,
  XR_MOTION_STAGE_SPAN,
} from '@/features/three/xrMotionReferenceCoordinates'
import {
  readXrArPlacementRuntime,
  subscribeXrArPlacementRuntime,
} from '@/features/three/xrArPlacementRuntime'

const WORLD_SPAN = XR_MOTION_STAGE_SPAN * 2.6
const WORLD_GRID_DIVISIONS = 52
const CENTER_RING_INNER_RADIUS = 34
const CENTER_RING_OUTER_RADIUS = 43
const readXrImmersiveSessionActive = () => readXrArPlacementRuntime().immersiveSessionActive

export function XrEmptyWorldStage() {
  const floorDepth = XR_MOTION_STAGE_FLOOR_DEPTH
  const immersiveSessionActive = React.useSyncExternalStore(
    subscribeXrArPlacementRuntime,
    readXrImmersiveSessionActive,
    readXrImmersiveSessionActive,
  )
  return (
    <group
      name="agentic_os_xr_empty_world_stage"
      position={immersiveSessionActive ? [0, -floorDepth, 0] : [0, 0, 0]}
      rotation={immersiveSessionActive ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}
      renderOrder={THREE_RENDER_ORDER.groups - 12}
      userData={{
        schema: 'agentic-graph-xr-empty-world/v1',
        source: 'no-document',
        kgXrImmersiveFloorAligned: immersiveSessionActive,
      }}
    >
      <ambientLight intensity={0.78} />
      <directionalLight position={[180, -160, 320]} intensity={1.25} castShadow />
      <mesh name="agentic_os_xr_empty_world_floor" position={[0, 0, floorDepth - 1]} receiveShadow>
        <boxGeometry args={[WORLD_SPAN, WORLD_SPAN, 2]} />
        <meshStandardMaterial color="#0b2f4a" roughness={1} metalness={0} />
      </mesh>
      <gridHelper
        name="agentic_os_xr_empty_world_grid"
        args={[WORLD_SPAN, WORLD_GRID_DIVISIONS, '#4fb3d1', '#174d69']}
        position={[0, 0, floorDepth + 0.3]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <mesh name="agentic_os_xr_empty_world_center_target" position={[0, 0, floorDepth + 0.8]}>
        <ringGeometry args={[CENTER_RING_INNER_RADIUS, CENTER_RING_OUTER_RADIUS, 72]} />
        <meshBasicMaterial color="#dbeafe" transparent opacity={0.78} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh name="agentic_os_xr_empty_world_center_disc" position={[0, 0, floorDepth + 0.55]}>
        <circleGeometry args={[8, 40]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <mesh name="agentic_os_xr_empty_world_vertical_axis" position={[0, 0, floorDepth + 125]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.7, 0.7, 250, 12]} />
        <meshBasicMaterial color="#5eead4" transparent opacity={0.68} depthWrite={false} />
      </mesh>
      <axesHelper name="agentic_os_xr_empty_world_axes" args={[70]} position={[0, 0, floorDepth + 1]} />
    </group>
  )
}
