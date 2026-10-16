import type { XrSceneAppearance } from './xrSceneAppearance'
import type { XrMotionReferenceStagePreset } from './xrSceneLibrary'
import {
  XR_SINGAPORE_MAJOR_POIS,
} from './xrSingaporeEnvironmentSource'
import {
  XrRegionalPoiSurfaceGeometry,
} from './XrRegionalPoiSurfaceGeometry'
import {
  createXrRegionalPoiSurfaceRenderPlan,
} from './xrRegionalPoiSurfaceRenderPlan'
import {
  resolveXrTerrainPerimeter,
  type XrTerrainPerimeterEdge,
} from './xrTerrainPerimeter'

const FIXED_TERRAIN_USER_DATA = Object.freeze({
  fixed: true,
  interactive: false,
  selectable: false,
})

export const XR_SINGAPORE_POI_SURFACE_RENDER_PLAN = Object.freeze(
  XR_SINGAPORE_MAJOR_POIS.map(poi => Object.freeze({
    poi,
    surfaces: createXrRegionalPoiSurfaceRenderPlan(poi.surfaces),
  })),
)

function sceneName(value: string): string {
  return value.replaceAll('-', '_')
}

function SurfaceMaterial({ color, metalness = 0, roughness = 0.78 }: {
  color: string
  metalness?: number
  roughness?: number
}) {
  return <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
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
      name={`agentic_os_xr_singapore_boundary_${edge.side}`}
      position={[edge.centerMeters[0], 0, edge.centerMeters[1]]}
      userData={{ ...FIXED_TERRAIN_USER_DATA, boundarySide: edge.side }}
    >
      <mesh position={[0, seawall ? 0.22 : 0.14, 0]} castShadow={shadows} receiveShadow={shadows}>
        <boxGeometry args={[edge.sizeMeters[0], seawall ? 0.44 : 0.28, edge.sizeMeters[1]]} />
        <SurfaceMaterial color={seawall ? '#e9dfc9' : '#8ea990'} roughness={0.9} />
      </mesh>
      <group name={`agentic_os_xr_singapore_boundary_${edge.side}_rail`}>
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
    <group name="agentic_os_xr_singapore_helipad" position={[7.2, 0.08, 2.1]}>
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
  appearance,
}: {
  groundY?: number
  scale: number
  shadows?: boolean
  stage: XrMotionReferenceStagePreset
  appearance?: XrSceneAppearance
}) {
  const perimeter = resolveXrTerrainPerimeter(stage)
  const oceanMarginMeters = Math.max(perimeter.widthMeters, perimeter.depthMeters) * (appearance ? 2 : 0.6)
  const transitSpine = stage.walkableSurfaces?.find(surface => surface.id === 'transit-spine')
  const transitDepthMeters = transitSpine?.sizeMeters[1] || perimeter.depthMeters - 3.2
  const transitHalfWidthMeters = transitSpine?.sizeMeters[0] / 2 || 2.9
  const walkableSurfaces = stage.walkableSurfaces || []
  return (
    <group
      name="agentic_os_xr_singapore_terrain"
      position={[0, groundY, 0]}
      scale={scale}
      userData={{
        ...FIXED_TERRAIN_USER_DATA,
        terrainId: 'singapore',
        presentation: 'procedural-native',
        playableBoundsMeters: [perimeter.widthMeters, perimeter.depthMeters],
      }}
    >
      <mesh name="agentic_os_xr_singapore_perimeter_water" position={[0, -0.31, 0]} receiveShadow={shadows} userData={FIXED_TERRAIN_USER_DATA}>
        <boxGeometry args={[
          perimeter.widthMeters + oceanMarginMeters * 2,
          0.36,
          perimeter.depthMeters + oceanMarginMeters * 2,
        ]} />
        <meshStandardMaterial color={appearance?.waterColor || "#2aaac2"} roughness={0.18} metalness={0.28} />
      </mesh>
      <group name="agentic_os_xr_singapore_perimeter" userData={FIXED_TERRAIN_USER_DATA}>
        {perimeter.edges.map(edge => edge.side === 'north' ? (
          <group key={edge.side} name="agentic_os_xr_singapore_seawall" userData={FIXED_TERRAIN_USER_DATA}>
            <PerimeterBoundary edge={edge} shadows={shadows} />
          </group>
        ) : <PerimeterBoundary key={edge.side} edge={edge} shadows={shadows} />)}
      </group>
      {walkableSurfaces.map(surface => (
        <mesh
          key={surface.id}
          name={`agentic_os_xr_singapore_walkable_${surface.id}`}
          position={[
            surface.centerMeters[0],
            surface.topMeters - surface.thicknessMeters / 2,
            surface.centerMeters[1],
          ]}
          receiveShadow={shadows}
          userData={{ ...FIXED_TERRAIN_USER_DATA, walkable: true, walkableKind: surface.kind, walkableSurfaceId: surface.id }}
        >
          <boxGeometry args={[
            surface.sizeMeters[0],
            surface.thicknessMeters,
            surface.sizeMeters[1],
          ]} />
          <SurfaceMaterial
            color={surface.color || (surface.kind === 'street' ? '#334155' : '#dce9d2')}
            roughness={surface.kind === 'street' ? 0.82 : 0.9}
          />
        </mesh>
      ))}
      {[-(transitHalfWidthMeters - 0.35), transitHalfWidthMeters - 0.35].map(x => (
        <mesh key={x} position={[x, 0.12, 0.35]} receiveShadow={shadows}>
          <boxGeometry args={[0.18, 0.12, transitDepthMeters]} />
          <SurfaceMaterial color="#d6c7ae" roughness={0.9} />
        </mesh>
      ))}
      {[-(transitHalfWidthMeters - 0.18), transitHalfWidthMeters - 0.18].map(x => (
        <mesh key={`edge:${x}`} position={[x, 0.195, 0.35]}>
          <boxGeometry args={[0.06, 0.02, transitDepthMeters * 0.96]} />
          <meshBasicMaterial color="#f8fafc" />
        </mesh>
      ))}
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
      {XR_SINGAPORE_POI_SURFACE_RENDER_PLAN.map(({ poi, surfaces }) => (
        <group
          key={poi.id}
          name={`agentic_os_xr_singapore_${sceneName(poi.id)}`}
          userData={{ poiId: poi.id, poiLabel: poi.label }}
        >
          {surfaces.map(entry => (
            <XrRegionalPoiSurfaceGeometry
              key={entry.surface.id}
              entry={entry}
              shadows={shadows}
            />
          ))}
        </group>
      ))}
      <Helipad />
    </group>
  )
}
