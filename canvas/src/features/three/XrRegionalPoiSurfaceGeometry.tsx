import React, { useMemo } from 'react'
import { EdgesGeometry, ExtrudeGeometry } from 'three'
import type { XrRegionalPoiSurface } from './regionalPoiXrPresentation'
import { deriveXrObservationWheelSupports } from './xrObservationWheelPresentation'
import {
  createXrRegionalPoiExtrusionShape,
  createXrRegionalPoiSurfaceUserData,
  type XrRegionalPoiSurfaceRenderEntry,
} from './xrRegionalPoiSurfaceRenderPlan'

const XR_REGIONAL_POI_EDGE_PRESENTATION = Object.freeze({
  color: '#31465a',
  opacity: 0.78,
  thresholdAngleDegrees: 24,
})

export type XrRegionalPoiPolygonRenderResources = Readonly<{
  edgeGeometry: EdgesGeometry
  geometry: ExtrudeGeometry
  dispose: () => void
}>

export function createXrRegionalPoiPolygonRenderResources(
  surface: XrRegionalPoiSurface,
): XrRegionalPoiPolygonRenderResources {
  const geometry = new ExtrudeGeometry(
    createXrRegionalPoiExtrusionShape(surface),
    {
      bevelEnabled: false,
      curveSegments: 1,
      depth: surface.topHeight - surface.baseHeight,
      steps: 1,
    },
  )
  const edgeGeometry = new EdgesGeometry(
    geometry,
    XR_REGIONAL_POI_EDGE_PRESENTATION.thresholdAngleDegrees,
  )
  let disposed = false
  return Object.freeze({
    edgeGeometry,
    geometry,
    dispose: () => {
      if (disposed) return
      disposed = true
      edgeGeometry.dispose()
      geometry.dispose()
    },
  })
}

function SurfaceMaterial({ color, metalness = 0, roughness = 0.78 }: {
  color: string
  metalness?: number
  roughness?: number
}) {
  return (
    <meshStandardMaterial
      color={color}
      metalness={metalness}
      roughness={roughness}
    />
  )
}

function XrRegionalPoiPolygonExtrusion({
  shadows,
  surface,
}: {
  shadows: boolean
  surface: XrRegionalPoiSurface
}) {
  const resources = useMemo(
    () => createXrRegionalPoiPolygonRenderResources(surface),
    [surface],
  )
  React.useEffect(() => () => resources.dispose(), [resources])
  return (
    <group
      name={`agentic_os_xr_regional_poi_surface_${surface.id}`}
      position={[0, surface.baseHeight, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      userData={createXrRegionalPoiSurfaceUserData(surface)}
    >
      <mesh
        geometry={resources.geometry}
        castShadow={shadows}
        receiveShadow={shadows}
      >
        <SurfaceMaterial color={surface.color} metalness={0.08} roughness={0.58} />
      </mesh>
      <lineSegments geometry={resources.edgeGeometry} renderOrder={1}>
        <lineBasicMaterial
          color={XR_REGIONAL_POI_EDGE_PRESENTATION.color}
          depthWrite={false}
          opacity={XR_REGIONAL_POI_EDGE_PRESENTATION.opacity}
          toneMapped={false}
          transparent
        />
      </lineSegments>
    </group>
  )
}

function XrRegionalPoiObservationWheel({
  shadows,
  surface,
}: {
  shadows: boolean
  surface: XrRegionalPoiSurface
}) {
  const radius = surface.size[1] * 0.48
  const supports = deriveXrObservationWheelSupports(surface)
  return (
    <group
      name={`agentic_os_xr_regional_poi_surface_${surface.id}`}
      position={surface.position}
      userData={createXrRegionalPoiSurfaceUserData(surface)}
    >
      <mesh castShadow={shadows}>
        <torusGeometry args={[radius, 0.11, 10, 48]} />
        <SurfaceMaterial color={surface.color} metalness={0.32} roughness={0.36} />
      </mesh>
      {Array.from({ length: 12 }, (_, index) => {
        const angle = index * Math.PI * 2 / 12
        return (
          <React.Fragment key={index}>
            <mesh
              rotation={[0, 0, angle]}
              position={[
                Math.cos(angle) * radius / 2,
                Math.sin(angle) * radius / 2,
                0,
              ]}
            >
              <boxGeometry args={[radius, 0.035, 0.035]} />
              <SurfaceMaterial color="#b8d3dc" metalness={0.24} roughness={0.44} />
            </mesh>
            <mesh position={[
              Math.cos(angle) * radius,
              Math.sin(angle) * radius,
              0,
            ]}>
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
          castShadow={shadows}
        >
          <boxGeometry args={[
            support.size[0],
            support.size[1],
            support.size[2],
          ]} />
          <SurfaceMaterial color="#dce8ea" metalness={0.16} roughness={0.48} />
        </mesh>
      ))}
    </group>
  )
}

function XrRegionalPoiSupertree({
  shadows,
  surface,
}: {
  shadows: boolean
  surface: XrRegionalPoiSurface
}) {
  const scale = surface.size[1] / 3.4
  return (
    <group
      name={`agentic_os_xr_regional_poi_surface_${surface.id}`}
      position={[
        surface.position[0],
        surface.position[1] - surface.size[1] / 2,
        surface.position[2],
      ]}
      scale={scale}
      userData={createXrRegionalPoiSurfaceUserData(surface)}
    >
      <mesh position={[0, 1.5, 0]} castShadow={shadows}>
        <cylinderGeometry args={[0.22, 0.54, 3, 12]} />
        <SurfaceMaterial color="#835b46" roughness={0.9} />
      </mesh>
      <mesh position={[0, 2.65, 0]} castShadow={shadows}>
        <coneGeometry args={[1.35, 1.35, 14, 1, true]} />
        <meshStandardMaterial color="#2f855a" roughness={0.82} side={2} />
      </mesh>
      <mesh position={[0, 2.86, 0]}>
        <torusGeometry args={[0.78, 0.12, 8, 18]} />
        <SurfaceMaterial color="#69b578" roughness={0.74} />
      </mesh>
      {Array.from({ length: 6 }, (_, index) => (
        <mesh
          key={index}
          position={[
            Math.cos(index * Math.PI / 3) * 0.83,
            2.78,
            Math.sin(index * Math.PI / 3) * 0.83,
          ]}
        >
          <sphereGeometry args={[0.33, 10, 8]} />
          <SurfaceMaterial color={index % 2 ? '#7ccf87' : '#4ea86b'} />
        </mesh>
      ))}
    </group>
  )
}

export function XrRegionalPoiSurfaceGeometry({
  entry,
  shadows,
}: {
  entry: XrRegionalPoiSurfaceRenderEntry
  shadows: boolean
}) {
  if (entry.renderer === 'observation-wheel') {
    return <XrRegionalPoiObservationWheel shadows={shadows} surface={entry.surface} />
  }
  if (entry.renderer === 'supertree') {
    return <XrRegionalPoiSupertree shadows={shadows} surface={entry.surface} />
  }
  return <XrRegionalPoiPolygonExtrusion shadows={shadows} surface={entry.surface} />
}
