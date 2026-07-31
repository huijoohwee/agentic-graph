import React from 'react'
import type { XrMotionReferenceStagePreset } from './xrSceneLibrary'
import {
  resolveXrSingaporeMajorPoi,
  type XrSingaporePoiSurface,
} from './xrSingaporeEnvironmentSource'
import { deriveXrObservationWheelSupports } from './xrObservationWheelPresentation'
import {
  resolveXrTerrainPerimeter,
  type XrTerrainPerimeterEdge,
} from './xrTerrainPerimeter'

const FIXED_TERRAIN_USER_DATA = Object.freeze({
  fixed: true,
  interactive: false,
  selectable: false,
})

function SurfaceMaterial({ color, metalness = 0, roughness = 0.78 }: {
  color: string
  metalness?: number
  roughness?: number
}) {
  return <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
}

function CityTower({
  color,
  height,
  position,
  width = 1.7,
}: {
  color: string
  height: number
  position: readonly [number, number]
  width?: number
}) {
  return (
    <group position={[position[0], 0, position[1]]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, width * 0.72]} />
        <SurfaceMaterial color={color} metalness={0.12} roughness={0.42} />
      </mesh>
      {Array.from({ length: Math.max(2, Math.floor(height / 1.2)) }, (_, index) => (
        <mesh key={index} position={[0, 0.72 + index * 1.05, width * 0.37]}>
          <boxGeometry args={[width * 0.72, 0.16, 0.025]} />
          <meshStandardMaterial color="#b9ebff" emissive="#67c7e8" emissiveIntensity={0.12} roughness={0.2} />
        </mesh>
      ))}
      <mesh position={[0, height + 0.13, 0]}>
        <boxGeometry args={[width * 1.06, 0.26, width * 0.78]} />
        <SurfaceMaterial color="#e2e8f0" metalness={0.3} roughness={0.36} />
      </mesh>
    </group>
  )
}

function MarinaBaySands() {
  const poi = resolveXrSingaporeMajorPoi('marina-bay-sands')
  const towers = poi.surfaces.filter(surface => surface.presentation === 'tower')
  const skypark = poi.surfaces.find(surface => surface.presentation === 'skypark')
  if (!skypark) throw new Error('Marina Bay Sands requires one authored SkyPark surface')
  return (
    <group name="kg_xr_singapore_marina_bay_sands">
      {towers.map((surface, index) => {
        const [width, height, depth] = surface.size
        const [x, centerY, z] = surface.position
        return (
          <group
            key={surface.id}
            position={[x, centerY - height / 2, z]}
            rotation={[0, index === 1 ? 0 : index === 0 ? -0.04 : 0.04, 0]}
          >
          <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[width, height, depth]} />
            <SurfaceMaterial color={surface.color} metalness={0.12} roughness={0.38} />
          </mesh>
          {Array.from({ length: Math.max(4, Math.floor(height / 0.82)) }, (_, floor) => (
            <mesh key={floor} position={[0, 0.55 + floor * 0.68, depth / 2 + 0.01]}>
              <boxGeometry args={[width * 0.79, 0.09, 0.025]} />
              <meshStandardMaterial color="#7fc8e8" emissive="#3b82a0" emissiveIntensity={0.1} roughness={0.22} />
            </mesh>
          ))}
        </group>
        )
      })}
      <mesh name="kg_xr_singapore_skypark" position={skypark.position} castShadow>
        <boxGeometry args={[
          skypark.size[0],
          skypark.size[1],
          skypark.size[2],
        ]} />
        <SurfaceMaterial color={skypark.color} metalness={0.12} roughness={0.42} />
      </mesh>
      <mesh
        position={[
          skypark.position[0] + 0.55,
          skypark.position[1] + skypark.size[1] / 2 + 0.05,
          skypark.position[2],
        ]}
        castShadow
      >
        <boxGeometry args={[skypark.size[0] - 0.85, 0.13, skypark.size[2] - 0.5]} />
        <SurfaceMaterial color="#3d8f77" roughness={0.68} />
      </mesh>
      <mesh
        position={[
          skypark.position[0] - skypark.size[0] / 2 + 0.22,
          skypark.position[1] + 0.14,
          skypark.position[2],
        ]}
        rotation={[0, 0, -0.22]}
        castShadow
      >
        <boxGeometry args={[0.9, 0.26, skypark.size[2] + 0.02]} />
        <SurfaceMaterial color={skypark.color} />
      </mesh>
    </group>
  )
}

function SingaporeFlyer() {
  const poi = resolveXrSingaporeMajorPoi('singapore-flyer')
  const wheel = poi.surfaces[0]
  if (!wheel) throw new Error('Singapore Flyer requires one authored wheel surface')
  const radius = wheel.size[1] * 0.48
  const supports = deriveXrObservationWheelSupports(wheel)
  return (
    <group name="kg_xr_singapore_flyer" position={wheel.position}>
      <mesh castShadow>
        <torusGeometry args={[radius, 0.11, 10, 48]} />
        <SurfaceMaterial color={wheel.color} metalness={0.32} roughness={0.36} />
      </mesh>
      {Array.from({ length: 12 }, (_, index) => {
        const angle = index * Math.PI * 2 / 12
        return (
          <React.Fragment key={index}>
            <mesh rotation={[0, 0, angle]} position={[Math.cos(angle) * radius / 2, Math.sin(angle) * radius / 2, 0]}>
              <boxGeometry args={[radius, 0.035, 0.035]} />
              <SurfaceMaterial color="#b8d3dc" metalness={0.24} roughness={0.44} />
            </mesh>
            <mesh position={[Math.cos(angle) * radius, Math.sin(angle) * radius, 0]}>
              <sphereGeometry args={[0.18, 10, 7]} />
              <SurfaceMaterial color="#d9f3fb" metalness={0.18} roughness={0.28} />
            </mesh>
          </React.Fragment>
        )
      })}
      {supports.map((support, index) => (
        <mesh
          key={index}
          position={support.position}
          rotation={[0, 0, support.rotationZ]}
          castShadow
        >
          <boxGeometry args={support.size} />
          <SurfaceMaterial color="#dce8ea" metalness={0.16} roughness={0.48} />
        </mesh>
      ))}
    </group>
  )
}

function Supertree({ surface }: {
  surface: XrSingaporePoiSurface
}) {
  const scale = surface.size[1] / 3.4
  return (
    <group
      position={[
        surface.position[0],
        surface.position[1] - surface.size[1] / 2,
        surface.position[2],
      ]}
      scale={scale}
    >
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.54, 3, 12]} />
        <SurfaceMaterial color="#835b46" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.65, 0]} castShadow>
        <coneGeometry args={[1.35, 1.35, 14, 1, true]} />
        <meshStandardMaterial color="#2f855a" roughness={0.82} side={2} />
      </mesh>
      <mesh position={[0, 2.86, 0]}>
        <torusGeometry args={[0.78, 0.12, 8, 18]} />
        <SurfaceMaterial color="#69b578" roughness={0.74} />
      </mesh>
      {Array.from({ length: 6 }, (_, index) => (
        <mesh key={index} position={[Math.cos(index * Math.PI / 3) * 0.83, 2.78, Math.sin(index * Math.PI / 3) * 0.83]}>
          <sphereGeometry args={[0.33, 10, 8]} />
          <SurfaceMaterial color={index % 2 ? '#7ccf87' : '#4ea86b'} />
        </mesh>
      ))}
    </group>
  )
}

function PerimeterBoundary({
  edge,
  shadows,
}: {
  edge: XrTerrainPerimeterEdge
  shadows: boolean
}) {
  const alongX = edge.side === 'north' || edge.side === 'south'
  const length = alongX ? edge.sizeMeters[0] : edge.sizeMeters[1]
  const railLength = Math.max(0.4, length - 0.6)
  const postCount = Math.max(2, Math.floor(railLength / 2.2))
  const seawall = edge.side === 'north'
  return (
    <group
      name={`kg_xr_singapore_boundary_${edge.side}`}
      position={[edge.centerMeters[0], 0, edge.centerMeters[1]]}
      userData={{ ...FIXED_TERRAIN_USER_DATA, boundarySide: edge.side }}
    >
      <mesh position={[0, seawall ? 0.22 : 0.14, 0]} castShadow={shadows} receiveShadow={shadows}>
        <boxGeometry args={[edge.sizeMeters[0], seawall ? 0.44 : 0.28, edge.sizeMeters[1]]} />
        <SurfaceMaterial color={seawall ? '#e9dfc9' : '#8ea990'} roughness={0.9} />
      </mesh>
      <group name={`kg_xr_singapore_boundary_${edge.side}_rail`}>
        {Array.from({ length: postCount + 1 }, (_, index) => {
          const offset = -railLength / 2 + index * railLength / postCount
          return (
            <mesh
              key={index}
              position={[alongX ? offset : 0, 0.78, alongX ? 0 : offset]}
              castShadow={shadows}
            >
              <boxGeometry args={[0.09, 1.08, 0.09]} />
              <SurfaceMaterial color={seawall ? '#f8fafc' : '#dfe8dc'} metalness={0.18} roughness={0.42} />
            </mesh>
          )
        })}
        {[0.56, 1.02].map(height => (
          <mesh key={height} position={[0, height, 0]} castShadow={shadows}>
            <boxGeometry args={[alongX ? railLength : 0.08, 0.08, alongX ? 0.08 : railLength]} />
            <SurfaceMaterial color={seawall ? '#f8fafc' : '#dfe8dc'} metalness={0.18} roughness={0.42} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function Helipad() {
  return (
    <group name="kg_xr_singapore_helipad" position={[7.2, 0.08, 2.1]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[2.15, 2.15, 0.12, 36]} />
        <SurfaceMaterial color="#426472" roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.62, 1.82, 36]} />
        <meshBasicMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[0, 0.08, 0]}><boxGeometry args={[0.26, 0.025, 1.35]} /><meshBasicMaterial color="#f8fafc" /></mesh>
      <mesh position={[-0.48, 0.08, 0]}><boxGeometry args={[0.26, 0.025, 1.35]} /><meshBasicMaterial color="#f8fafc" /></mesh>
      <mesh position={[0.48, 0.08, 0]}><boxGeometry args={[0.26, 0.025, 1.35]} /><meshBasicMaterial color="#f8fafc" /></mesh>
      <mesh position={[0, 0.08, 0]}><boxGeometry args={[1.08, 0.025, 0.25]} /><meshBasicMaterial color="#f8fafc" /></mesh>
    </group>
  )
}

export function XrSingaporeTerrainGeometry({
  groundY = 0,
  scale,
  shadows = false,
  stage,
}: {
  groundY?: number
  scale: number
  shadows?: boolean
  stage: XrMotionReferenceStagePreset
}) {
  const perimeter = resolveXrTerrainPerimeter(stage)
  const oceanMarginMeters = Math.max(perimeter.widthMeters, perimeter.depthMeters) * 0.6
  const promenadeWidthMeters = perimeter.widthMeters - 2.2
  const promenadeZ = -perimeter.halfDepthMeters + 1.05
  const transitDepthMeters = perimeter.depthMeters - 3.2
  return (
    <group
      name="kg_xr_singapore_terrain"
      position={[0, groundY, 0]}
      scale={scale}
      userData={{
        ...FIXED_TERRAIN_USER_DATA,
        terrainId: 'singapore',
        presentation: 'procedural-native',
        playableBoundsMeters: [perimeter.widthMeters, perimeter.depthMeters],
      }}
    >
      <mesh name="kg_xr_singapore_perimeter_water" position={[0, -0.31, 0]} receiveShadow={shadows} userData={FIXED_TERRAIN_USER_DATA}>
        <boxGeometry args={[
          perimeter.widthMeters + oceanMarginMeters * 2,
          0.36,
          perimeter.depthMeters + oceanMarginMeters * 2,
        ]} />
        <meshStandardMaterial color="#2aaac2" roughness={0.34} metalness={0.12} />
      </mesh>
      <group name="kg_xr_singapore_perimeter" userData={FIXED_TERRAIN_USER_DATA}>
        {perimeter.edges.map(edge => edge.side === 'north' ? (
          <group key={edge.side} name="kg_xr_singapore_seawall" userData={FIXED_TERRAIN_USER_DATA}>
            <PerimeterBoundary edge={edge} shadows={shadows} />
          </group>
        ) : <PerimeterBoundary key={edge.side} edge={edge} shadows={shadows} />)}
      </group>
      <mesh name="kg_xr_singapore_marina_promenade" position={[0, 0.12, promenadeZ]} receiveShadow={shadows}>
        <boxGeometry args={[promenadeWidthMeters, 0.24, 1.45]} />
        <SurfaceMaterial color="#f1e6cf" roughness={0.88} />
      </mesh>
      <mesh name="kg_xr_singapore_transit_spine" position={[0, 0.09, 0.35]} receiveShadow={shadows}>
        <boxGeometry args={[5.8, 0.18, transitDepthMeters]} />
        <SurfaceMaterial color="#364b5b" roughness={0.9} />
      </mesh>
      <mesh position={[-7.4, 0.075, 2.5]} receiveShadow={shadows}>
        <boxGeometry args={[8.9, 0.15, 5.8]} />
        <SurfaceMaterial color="#dce9d2" roughness={0.96} />
      </mesh>
      <mesh position={[7.7, 0.075, 4.8]} receiveShadow={shadows}>
        <boxGeometry args={[8.1, 0.15, 5.5]} />
        <SurfaceMaterial color="#b9d9a9" roughness={0.96} />
      </mesh>
      {[-1.75, 1.75].flatMap(x => Array.from({ length: 8 }, (_, index) => (
        <mesh key={`${x}:${index}`} position={[x, 0.195, -5.8 + index * 2.1]}>
          <boxGeometry args={[0.08, 0.025, 0.82]} />
          <meshBasicMaterial color="#f8d66d" />
        </mesh>
      )))}
      {[-11.5, -8.5, 8.7, 11.5].map(x => (
        <mesh key={x} position={[x, 0.16, -7.8]} receiveShadow={shadows}>
          <boxGeometry args={[2.1, 0.22, 1.2]} />
          <SurfaceMaterial color="#8bc68d" />
        </mesh>
      ))}
      <MarinaBaySands />
      <SingaporeFlyer />
      <group name="kg_xr_singapore_gardens_by_the_bay">
        {resolveXrSingaporeMajorPoi('gardens-by-the-bay').surfaces.map(surface => (
          <Supertree key={surface.id} surface={surface} />
        ))}
      </group>
      <CityTower position={[-11.8, -8.65]} height={4.8} width={1.6} color="#ef9f7d" />
      <CityTower position={[11.8, -8.75]} height={5.4} width={1.65} color="#8097b0" />
      <CityTower position={[-12.1, -5.35]} height={3.4} width={1.35} color="#e4b86f" />
      <CityTower position={[12.1, -5.15]} height={3.9} width={1.4} color="#769aad" />
      <Helipad />
    </group>
  )
}
