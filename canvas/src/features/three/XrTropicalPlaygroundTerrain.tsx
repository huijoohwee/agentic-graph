import React from 'react'
import { Shape } from 'three'
import { DEFAULT_XR_SCENE_APPEARANCE, type XrSceneAppearance } from './xrSceneAppearance'

const FIXED_TERRAIN_USER_DATA = Object.freeze({
  fixed: true,
  interactive: false,
  selectable: false,
})

const GRASS_PATCHES = [
  [-4.4, 3.6, 2.6],
  [5.2, -1.8, 2.2],
  [1.8, 6.2, 1.7],
  [-7.1, -0.6, 1.5],
  [8.4, 3.8, 1.4],
  [-2.2, -4.4, 1.9],
  [3.6, 1.2, 1.3],
  [-5.8, 5.4, 1.2],
  [6.6, 5.8, 1.1],
] as const

const DUNES = [
  [2.4, 0.16, -2.1, 2.6, 0.42, 1.8],
  [-3.6, 0.14, 2.8, 2.2, 0.36, 1.6],
  [4.8, 0.12, 3.4, 1.8, 0.3, 1.4],
  [-1.2, 0.13, -4.6, 2.1, 0.34, 1.5],
] as const

const SHORE_ROCKS = [
  [-12.4, 0.28, 2.4, 0.72],
  [12.6, 0.22, 1.8, 0.58],
  [-10.8, 0.2, 8.4, 0.5],
  [10.2, 0.18, 7.6, 0.46],
  [-6.4, 0.16, 11.2, 0.42],
  [5.8, 0.16, 11.6, 0.4],
] as const

function createIslandShape(radiusScale = 1) {
  const shape = new Shape()
  Array.from({ length: 32 }, (_, index) => {
    const angle = index * Math.PI * 2 / 32
    const edge = 1
      + Math.sin(angle * 2 + 0.28) * 0.08
      + Math.cos(angle * 5 - 0.6) * 0.05
      + Math.sin(angle * 9 + 0.2) * 0.028
    return [Math.cos(angle) * 13.2 * edge * radiusScale, Math.sin(angle) * 12.45 * edge * radiusScale] as const
  }).forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, z)
    else shape.lineTo(x, z)
  })
  shape.closePath()
  return shape
}

function Dock() {
  return (
    <group position={[0.4, 0, 11.35]} rotation={[0, 0.08, 0]} name="agentic_os_xr_tropical_playground_dock">
      {Array.from({ length: 7 }, (_, index) => (
        <mesh key={index} position={[0, 0.09, index * 0.42]} receiveShadow castShadow>
          <boxGeometry args={[3.4, 0.12, 0.36]} />
          <meshStandardMaterial color={index % 2 ? '#c57b55' : '#d39268'} roughness={0.88} />
        </mesh>
      ))}
      {[-1.55, 1.55].map(x => (
        <mesh key={x} position={[x, -0.28, 1.35]} castShadow>
          <boxGeometry args={[0.16, 0.7, 2.8]} />
          <meshStandardMaterial color="#75432f" roughness={0.92} />
        </mesh>
      ))}
    </group>
  )
}

export function XrTropicalPlaygroundTerrain({
  appearance = DEFAULT_XR_SCENE_APPEARANCE,
  groundY = 0,
  scale = 1,
  shadows = false,
}: {
  appearance?: XrSceneAppearance
  groundY?: number
  scale?: number
  shadows?: boolean
}) {
  const island = React.useMemo(() => createIslandShape(1), [])
  const innerSand = React.useMemo(() => createIslandShape(0.78), [])
  const wetSand = React.useMemo(() => createIslandShape(0.96), [])
  const sand = appearance.groundColor
  const water = appearance.waterColor
  const standard = appearance.detail === 'standard'
  return (
    <group
      name="agentic_os_xr_tropical_playground_terrain"
      position={[0, groundY, 0]}
      scale={scale}
      userData={{
        ...FIXED_TERRAIN_USER_DATA,
        terrainId: 'tropical-playground',
        presentation: 'procedural-native',
      }}
    >
      <mesh
        name="agentic_os_xr_tropical_playground_ocean"
        position={[0, -1.22, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow={shadows}
        userData={FIXED_TERRAIN_USER_DATA}
      >
        <planeGeometry args={[280, 280]} />
        <meshStandardMaterial color={water} roughness={0.16} metalness={0.28} />
      </mesh>
      {standard ? (
        <mesh
          name="agentic_os_xr_tropical_playground_lagoon"
          position={[0, -1.08, 1.25]}
          rotation={[-Math.PI / 2, 0, 0]}
          userData={FIXED_TERRAIN_USER_DATA}
        >
          <circleGeometry args={[18.4, 40]} />
          <meshStandardMaterial color="#2ec4c0" roughness={0.12} metalness={0.22} transparent opacity={0.94} />
        </mesh>
      ) : null}
      {standard ? (
        <mesh
          name="agentic_os_xr_tropical_playground_shelf"
          position={[0, -0.98, 1.25]}
          rotation={[-Math.PI / 2, 0, 0]}
          userData={FIXED_TERRAIN_USER_DATA}
        >
          <ringGeometry args={[13.8, 16.4, 40]} />
          <meshStandardMaterial color="#7ee0d4" roughness={0.22} metalness={0.14} transparent opacity={0.55} depthWrite={false} />
        </mesh>
      ) : null}
      {standard ? (
        <mesh
          name="agentic_os_xr_tropical_playground_foam"
          position={[0, -0.9, 1.25]}
          rotation={[-Math.PI / 2, 0, 0]}
          userData={FIXED_TERRAIN_USER_DATA}
        >
          <ringGeometry args={[13.2, 14.8, 40]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.9} transparent opacity={0.62} depthWrite={false} />
        </mesh>
      ) : null}
      <mesh
        name="agentic_os_xr_tropical_playground_island"
        position={[0, -1.05, 1.25]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1.12, 1.05, 1]}
        receiveShadow={shadows}
        castShadow={shadows}
        userData={FIXED_TERRAIN_USER_DATA}
      >
        <extrudeGeometry args={[island, { depth: 1.08, steps: 1, bevelEnabled: false }]} />
        <meshStandardMaterial attach="material-0" color={sand} roughness={1} flatShading />
        <meshStandardMaterial attach="material-1" color="#b08968" roughness={0.96} flatShading />
      </mesh>
      {standard ? (
        <mesh position={[0, 0.05, 1.25]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.1, 1.04, 1]} receiveShadow={shadows}>
          <shapeGeometry args={[wetSand]} />
          <meshStandardMaterial color="#cbb07a" roughness={0.62} />
        </mesh>
      ) : null}
      <mesh position={[0, 0.058, 1.25]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.08, 1.02, 1]} receiveShadow={shadows}>
        <shapeGeometry args={[island]} />
        <meshStandardMaterial color="#d9c089" roughness={0.82} />
      </mesh>
      {standard ? (
        <mesh position={[0, 0.07, 1.25]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadows}>
          <shapeGeometry args={[innerSand]} />
          <meshStandardMaterial color={sand} roughness={1} />
        </mesh>
      ) : null}
      {standard ? DUNES.map(([x, y, z, sx, sy, sz]) => (
        <mesh key={`${x}:${z}`} position={[x, y, z]} scale={[sx, sy, sz]} receiveShadow={shadows}>
          <sphereGeometry args={[1, 10, 6]} />
          <meshStandardMaterial color="#e3d4a8" roughness={0.95} />
        </mesh>
      )) : null}
      {standard ? GRASS_PATCHES.map(([x, z, width]) => (
        <mesh key={`${x}:${z}`} position={[x, 0.085, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[width, width * 0.72, 1]} receiveShadow={shadows}>
          <circleGeometry args={[1, 10]} />
          <meshStandardMaterial color={z > 2 ? '#5aa84a' : '#6fbf55'} roughness={0.95} />
        </mesh>
      )) : null}
      {SHORE_ROCKS.map(([x, y, z, size]) => (
        <mesh key={`${x}:${z}`} position={[x, y, z]} scale={[size * 1.4, size, size * 1.1]} castShadow={shadows} receiveShadow={shadows}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#77817c" roughness={0.96} flatShading />
        </mesh>
      ))}
      <Dock />
    </group>
  )
}
