import React from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import {
  HONG_KONG_ISLAND_HILLS,
  HONG_KONG_ISLAND_KIT_ID,
  HONG_KONG_ISLAND_LANDMARKS,
  HONG_KONG_ISLAND_REFERENCE_GROUP_COLORS,
  HONG_KONG_ISLAND_REFERENCE_LOCATIONS,
  HONG_KONG_STAR_FERRY_ROUTE,
  HONG_KONG_TRAM_CORRIDOR,
  geoLocalMeters,
  hongKongIslandTerrainHeight,
  type GeoCoordinate,
  type HongKongIslandLandmark,
} from '../cinema/hongKongIslandGeoKit'
import { readCinemaShotFocus } from '../cinema/cinemaShotFocus'
import { DoubleDeckTram, StarFerry } from './XrNightWaterfrontKit'
import { pingPongPhase, readXrKitTimelineClock, sampleXrKitPolyline, xrKitPulse } from './xrKitTimelineMotion'

type LocalHill = Readonly<{ east: number; south: number; heightMeters: number; radiusMeters: number }>

const TERRAIN_BOUNDS = Object.freeze({ west: 114.115, east: 114.228, south: 22.25, north: 22.2875 })
const TERRAIN_CELL_METERS = 30
const TERRAIN_MIN_HEIGHT_METERS = 16
const CITY_BAND = Object.freeze({ west: 114.146, east: 114.186, south: 22.2772, north: 22.2846 })
const WINDOW_COLORS = Object.freeze(['#ffd59a', '#ffe8c2', '#9fe7ff', '#ffc27a', '#c8f1ff'])
const NEON_ACCENTS = Object.freeze(['#35e0ff', '#ff3d7f', '#ffb547', '#c45bff', '#3dff9e'])
const AVIATION_LIGHT = Object.freeze({ kitPulse: 'aviation' })
const NEON_CROWN = Object.freeze({ kitPulse: 'neon' })

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

function toLocal(coordinate: GeoCoordinate, origin: GeoCoordinate): readonly [number, number] {
  return geoLocalMeters(coordinate, origin)
}

function useLocalHills(origin: GeoCoordinate): readonly LocalHill[] {
  return React.useMemo(() => HONG_KONG_ISLAND_HILLS.map(hill => {
    const [east, south] = toLocal(hill.coordinate, origin)
    return Object.freeze({ east, south, heightMeters: hill.heightMeters, radiusMeters: hill.radiusMeters })
  }), [origin])
}

function IslandTerrain({ origin, hills }: { origin: GeoCoordinate; hills: readonly LocalHill[] }) {
  const geometry = React.useMemo(() => {
    const [west, north] = toLocal([TERRAIN_BOUNDS.west, TERRAIN_BOUNDS.north], origin)
    const [east, south] = toLocal([TERRAIN_BOUNDS.east, TERRAIN_BOUNDS.south], origin)
    const columns = Math.max(2, Math.ceil((east - west) / TERRAIN_CELL_METERS))
    const rows = Math.max(2, Math.ceil((south - north) / TERRAIN_CELL_METERS))
    const positions: number[] = []
    const colors: number[] = []
    const heights: number[] = []
    const low = new THREE.Color('#142722')
    const mid = new THREE.Color('#2c4b43')
    const high = new THREE.Color('#8496a3')
    const color = new THREE.Color()
    for (let row = 0; row <= rows; row += 1) {
      for (let column = 0; column <= columns; column += 1) {
        const x = west + (east - west) * column / columns
        const z = north + (south - north) * row / rows
        const height = hongKongIslandTerrainHeight(x, z, hills)
        heights.push(height)
        positions.push(x, height, z)
        const t = Math.min(1, height / 520)
        color.copy(low).lerp(mid, Math.min(1, t * 2))
        if (t > 0.5) color.lerp(high, (t - 0.5) * 2)
        colors.push(color.r, color.g, color.b)
      }
    }
    const indices: number[] = []
    const stride = columns + 1
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const a = row * stride + column
        const b = a + 1
        const c = a + stride
        const d = c + 1
        if (Math.min(heights[a], heights[b], heights[c], heights[d]) < TERRAIN_MIN_HEIGHT_METERS) continue
        indices.push(a, c, b, b, c, d)
      }
    }
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    next.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    next.setIndex(indices)
    next.computeVertexNormals()
    return next
  }, [hills, origin])
  React.useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh name="agentic_os_xr_hk_island_terrain" geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={0.92} metalness={0.02} />
    </mesh>
  )
}

function HillsideLights({ origin, hills }: { origin: GeoCoordinate; hills: readonly LocalHill[] }) {
  const instance = React.useRef<THREE.InstancedMesh>(null)
  const points = React.useMemo(() => {
    const [west, north] = toLocal([TERRAIN_BOUNDS.west, 22.2862], origin)
    const [east, south] = toLocal([TERRAIN_BOUNDS.east, 22.262], origin)
    const accepted: Array<readonly [number, number, number, number]> = []
    for (let seed = 0; seed < 5200 && accepted.length < 900; seed += 1) {
      const x = west + (east - west) * seededUnit(seed * 3 + 1)
      const z = north + (south - north) * seededUnit(seed * 3 + 2)
      const height = hongKongIslandTerrainHeight(x, z, hills)
      if (height < 28 || height > 300) continue
      accepted.push([x, height + 0.72, z, seed])
    }
    return accepted
  }, [hills, origin])
  React.useLayoutEffect(() => {
    const mesh = instance.current
    if (!mesh) return
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    points.forEach(([x, y, z, seed], index) => {
      const width = 1.4 + seededUnit(seed + 41) * 1.2
      const height = 0.9 + seededUnit(seed + 43) * 0.7
      matrix.compose(new THREE.Vector3(x, y + height / 2, z), new THREE.Quaternion(), new THREE.Vector3(width, height, 0.16))
      mesh.setMatrixAt(index, matrix)
      mesh.setColorAt(index, color.set(WINDOW_COLORS[seed % WINDOW_COLORS.length]))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [points])
  const material = React.useRef<THREE.MeshStandardMaterial>(null)
  useFrame(() => {
    if (material.current) material.current.emissiveIntensity = 0.42 + 0.26 * xrKitPulse(readXrKitTimelineClock().seconds, 0.35)
  })
  return (
    <instancedMesh name="agentic_os_xr_hk_mid_levels_lights" ref={instance} args={[undefined!, undefined!, points.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial ref={material} color="#1a2430" emissive="#ffcf8a" emissiveIntensity={0.55} roughness={0.6} />
    </instancedMesh>
  )
}

function CityMassing({ origin }: { origin: GeoCoordinate }) {
  const bodies = React.useRef<THREE.InstancedMesh>(null)
  const bands = React.useRef<THREE.InstancedMesh>(null)
  const plan = React.useMemo(() => {
    const landmarks = HONG_KONG_ISLAND_LANDMARKS.map(landmark => toLocal(landmark.coordinate, origin))
    const [west, north] = toLocal([CITY_BAND.west, CITY_BAND.north], origin)
    const [east, south] = toLocal([CITY_BAND.east, CITY_BAND.south], origin)
    const buildings: Array<Readonly<{ x: number; z: number; w: number; d: number; h: number; seed: number }>> = []
    for (let seed = 0; seed < 900 && buildings.length < 210; seed += 1) {
      const x = west + (east - west) * seededUnit(seed * 5 + 3)
      const z = north + (south - north) * seededUnit(seed * 5 + 4)
      if (landmarks.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < 75)) continue
      if (buildings.some(other => Math.hypot(other.x - x, other.z - z) < 42)) continue
      const inland = (z - north) / Math.max(1, south - north)
      buildings.push({
        x,
        z,
        w: 22 + seededUnit(seed + 11) * 26,
        d: 20 + seededUnit(seed + 13) * 24,
        h: 45 + seededUnit(seed + 17) * (110 + inland * 120),
        seed,
      })
    }
    const strips: Array<Readonly<{ x: number; y: number; z: number; w: number; d: number; color: string }>> = []
    for (const building of buildings) {
      for (let y = 10; y < building.h - 4; y += 9) {
        if (seededUnit(building.seed * 31 + y) < 0.42) continue
        strips.push({ x: building.x, y, z: building.z - building.d / 2 - 0.04, w: building.w * 0.72, d: 0.05, color: WINDOW_COLORS[(building.seed + y) % WINDOW_COLORS.length] })
      }
    }
    return { buildings, strips }
  }, [origin])
  React.useLayoutEffect(() => {
    const matrix = new THREE.Matrix4()
    const rotation = new THREE.Quaternion()
    const color = new THREE.Color()
    const body = bodies.current
    if (body) {
      plan.buildings.forEach((building, index) => {
        matrix.compose(new THREE.Vector3(building.x, building.h / 2, building.z), rotation, new THREE.Vector3(building.w, building.h, building.d))
        body.setMatrixAt(index, matrix)
        body.setColorAt(index, color.set(index % 3 ? '#14222f' : '#1b2c3a'))
      })
      body.instanceMatrix.needsUpdate = true
      if (body.instanceColor) body.instanceColor.needsUpdate = true
    }
    const band = bands.current
    if (band) {
      plan.strips.forEach((strip, index) => {
        matrix.compose(new THREE.Vector3(strip.x, strip.y, strip.z), rotation, new THREE.Vector3(strip.w, 0.38, strip.d))
        band.setMatrixAt(index, matrix)
        band.setColorAt(index, color.set(strip.color))
      })
      band.instanceMatrix.needsUpdate = true
      if (band.instanceColor) band.instanceColor.needsUpdate = true
    }
  }, [plan])
  return (
    <group name="agentic_os_xr_hk_central_skyline_massing">
      <instancedMesh ref={bodies} args={[undefined!, undefined!, plan.buildings.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" metalness={0.5} roughness={0.34} />
      </instancedMesh>
      <instancedMesh ref={bands} args={[undefined!, undefined!, Math.max(1, plan.strips.length)]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

function LitEdges({ width, height, depth, color, radial }: { width: number; height: number; depth: number; color: string; radial?: number }) {
  const geometry = React.useMemo(() => {
    const solid = radial
      ? new THREE.CylinderGeometry(width / 2, width / 2, height, radial)
      : new THREE.BoxGeometry(width, height, depth)
    const edges = new THREE.EdgesGeometry(solid)
    solid.dispose()
    return edges
  }, [depth, height, radial, width])
  React.useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} toneMapped={false} />
    </lineSegments>
  )
}

function FloorBands({ width, depth, from, to, step, color }: { width: number; depth: number; from: number; to: number; step: number; color: string }) {
  const levels: number[] = []
  for (let y = from; y < to; y += step) levels.push(y)
  return <>
    {levels.map(y => <mesh key={y} position={[0, y, 0]}>
      <boxGeometry args={[width * 1.01, 0.24, depth * 1.01]} />
      <meshBasicMaterial color={color} transparent opacity={0.28} toneMapped={false} />
    </mesh>)}
  </>
}

function Landmark({ landmark, origin, hills, index }: { landmark: HongKongIslandLandmark; origin: GeoCoordinate; hills: readonly LocalHill[]; index: number }) {
  const [east, south] = toLocal(landmark.coordinate, origin)
  const [width, depth] = landmark.footprintMeters
  const accent = NEON_ACCENTS[index % NEON_ACCENTS.length]
  const body = <meshStandardMaterial color="#132637" metalness={0.62} roughness={0.24} emissive="#0b1a28" emissiveIntensity={0.4} />
  const name = `agentic_os_xr_hk_landmark_${landmark.id}`
  const userData = { label: landmark.label, heightMeters: landmark.heightMeters, coordinate: landmark.coordinate }

  if (landmark.form === 'peak-tower') {
    const base = hongKongIslandTerrainHeight(east, south, hills)
    const height = Math.max(18, landmark.heightMeters - base)
    return (
      <group name={name} position={[east, base, south]} userData={userData}>
        <mesh position={[0, height * 0.35, 0]}><boxGeometry args={[width * 0.45, height * 0.7, depth * 0.45]} />{body}</mesh>
        <mesh position={[0, height * 0.85, 0]}><cylinderGeometry args={[width * 0.9, width * 0.42, height * 0.3, 18]} /><meshStandardMaterial color="#d4dee4" emissive="#9fd2ff" emissiveIntensity={0.6} metalness={0.4} roughness={0.3} /></mesh>
        <mesh position={[0, height * 1.01, 0]}><cylinderGeometry args={[width * 0.92, width * 0.92, 1.4, 18]} /><meshBasicMaterial color="#ffe7b0" toneMapped={false} /></mesh>
      </group>
    )
  }

  if (landmark.form === 'prism') {
    const sections = [0.38, 0.27, 0.2, 0.15]
    let base = 0
    return (
      <group name={name} position={[east, 0, south]} rotation={[0, Math.PI / 4, 0]} userData={userData}>
        {sections.map((fraction, sectionIndex) => {
          const height = landmark.heightMeters * 0.86 * fraction
          const scale = 1 - sectionIndex * 0.18
          const y = base + height / 2
          base += height
          return <group key={sectionIndex} position={[0, y, 0]}>
            <mesh><cylinderGeometry args={[width * 0.7 * scale, width * 0.72 * scale, height, sectionIndex > 1 ? 3 : 4]} />{body}</mesh>
            <LitEdges width={width * 1.42 * scale} height={height} depth={0} color="#f2f6ff" radial={sectionIndex > 1 ? 3 : 4} />
          </group>
        })}
        {[-1, 1].map(side => <mesh key={side} position={[side * width * 0.08, landmark.heightMeters * 0.93, 0]}>
          <cylinderGeometry args={[0.6, 1, landmark.heightMeters * 0.14, 6]} />
          <meshBasicMaterial color="#ff4a3d" toneMapped={false} transparent userData={AVIATION_LIGHT} />
        </mesh>)}
      </group>
    )
  }

  if (landmark.form === 'ifc') {
    const segments = [[1, 0.42], [0.9, 0.26], [0.8, 0.2], [0.68, 0.12]] as const
    const crownHeight = Math.min(2.5, Math.max(1, landmark.heightMeters * 0.005))
    let base = 0
    return (
      <group name={name} position={[east, 0, south]} userData={userData}>
        {segments.map(([scale, fraction], segmentIndex) => {
          const height = landmark.heightMeters * fraction
          const y = base + height / 2
          base += height
          return <group key={segmentIndex} position={[0, y, 0]}>
            <mesh><boxGeometry args={[width * scale, height, depth * scale]} />{body}</mesh>
            <LitEdges width={width * scale} height={height} depth={depth * scale} color="#9fe7ff" />
            <FloorBands width={width * scale} depth={depth * scale} from={-height / 2 + 6} to={height / 2 - 2} step={14} color="#d2b783" />
          </group>
        })}
        {Array.from({ length: 8 }, (_, fin) => {
          const angle = fin / 8 * Math.PI * 2
          return <mesh key={fin} position={[Math.cos(angle) * width * 0.3, landmark.heightMeters + crownHeight / 2, Math.sin(angle) * depth * 0.3]} rotation={[0, -angle, 0]}>
            <boxGeometry args={[0.36, crownHeight, 1.5]} />
            <meshBasicMaterial color={accent} toneMapped={false} transparent opacity={0.46} depthWrite={false} userData={NEON_CROWN} />
          </mesh>
        })}
      </group>
    )
  }

  return (
    <group name={name} position={[east, landmark.heightMeters / 2, south]} userData={userData}>
      <mesh><boxGeometry args={[width, landmark.heightMeters, depth]} />{body}</mesh>
      <LitEdges width={width} height={landmark.heightMeters} depth={depth} color={landmark.form === 'mast' ? '#ffd38a' : '#cfe8ff'} />
      <FloorBands width={width} depth={depth} from={-landmark.heightMeters / 2 + 8} to={landmark.heightMeters / 2 - 3} step={12} color={WINDOW_COLORS[index % WINDOW_COLORS.length]} />
      <mesh position={[0, landmark.heightMeters / 2 + 1, 0]}><boxGeometry args={[width * 0.96, 2, depth * 0.96]} /><meshBasicMaterial color={accent} toneMapped={false} transparent opacity={0.16} depthWrite={false} userData={NEON_CROWN} /></mesh>
      {landmark.form === 'mast' ? [-1, 1].map(side => <group key={side} position={[side * width * 0.28, landmark.heightMeters / 2, 0]}>
        <mesh position={[0, 18, 0]}><cylinderGeometry args={[0.5, 0.8, 36, 6]} /><meshStandardMaterial color="#8ea0aa" metalness={0.8} roughness={0.3} /></mesh>
        <mesh position={[0, 37, 0]}><sphereGeometry args={[2, 8, 6]} /><meshBasicMaterial color="#ff4a3d" toneMapped={false} transparent userData={AVIATION_LIGHT} /></mesh>
      </group>) : null}
    </group>
  )
}

function ReferenceBeacons({ origin, hills, focusedLocationIndex }: {
  origin: GeoCoordinate
  hills: readonly LocalHill[]
  focusedLocationIndex: number | null
}) {
  return (
    <group name="agentic_os_xr_hk_reference_locations">
      {HONG_KONG_ISLAND_REFERENCE_LOCATIONS.map(location => {
        const [east, south] = toLocal(location.coordinate, origin)
        const ground = hongKongIslandTerrainHeight(east, south, hills)
        const focused = location.index === focusedLocationIndex
        const markerBase = focused ? location.elevationMeters : ground
        const markerHeight = focused ? 0.35 : 0.5
        const top = markerBase + markerHeight
        const color = HONG_KONG_ISLAND_REFERENCE_GROUP_COLORS[location.group]
        return (
          <group
            key={location.index}
            name={`agentic_os_xr_hk_reference_location_${location.index}`}
            position={[east, 0, south]}
            userData={{ index: location.index, group: location.group, label: location.label, coordinate: location.coordinate }}
          >
            <mesh position={[0, markerBase + markerHeight / 2, 0]}>
              <cylinderGeometry args={[0.35, 0.55, markerHeight, 6]} />
              <meshBasicMaterial color={color} transparent opacity={focused ? 0.55 : 0.3} depthWrite={false} toneMapped={false} />
            </mesh>
            <mesh position={[0, top + (focused ? 0.3 : 0.4), 0]} userData={{ kitSpin: location.index }}>
              <octahedronGeometry args={[focused ? 0.28 : 0.2, 0]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
            <mesh position={[0, markerBase + 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} userData={{ kitRing: location.index }}>
              <ringGeometry args={[focused ? 0.85 : 0.42, focused ? 1.05 : 0.55, 24]} />
              <meshBasicMaterial color={color} transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function HarbourSkylineReflections({ origin }: { origin: GeoCoordinate }) {
  const items = React.useMemo(() => HONG_KONG_ISLAND_LANDMARKS
    .filter(landmark => landmark.form !== 'peak-tower' && landmark.coordinate[1] < 22.29)
    .map((landmark, index) => {
      const [east] = toLocal(landmark.coordinate, origin)
      const [, south] = toLocal([landmark.coordinate[0], 22.2898], origin)
      return { id: landmark.id, east, south, width: landmark.footprintMeters[0] * 0.55, length: Math.min(420, landmark.heightMeters * 1.1), color: index % 3 === 0 ? NEON_ACCENTS[index % NEON_ACCENTS.length] : '#ffc27a' }
    }), [origin])
  return (
    <group name="agentic_os_xr_hk_harbour_reflections">
      {items.map(item => <mesh key={item.id} position={[item.east, 0.6, item.south]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[item.width, item.length]} />
        <meshBasicMaterial color={item.color} transparent opacity={0.22} depthWrite={false} toneMapped={false} />
      </mesh>)}
    </group>
  )
}

function headingRadians(from: readonly [number, number], to: readonly [number, number]): number {
  return Math.atan2(-(to[1] - from[1]), to[0] - from[0])
}

function TramCorridor({ origin, shadows }: { origin: GeoCoordinate; shadows: boolean }) {
  const points = React.useMemo(() => HONG_KONG_TRAM_CORRIDOR.map(coordinate => toLocal(coordinate, origin)), [origin])
  const reversed = React.useMemo(() => [...points].reverse(), [points])
  const eastbound = React.useRef<THREE.Group>(null)
  const westbound = React.useRef<THREE.Group>(null)
  useFrame(() => {
    const { phase } = readXrKitTimelineClock()
    for (const [group, route, offset] of [[eastbound.current, points, 0.08], [westbound.current, reversed, 0.42]] as const) {
      if (!group) continue
      const sample = sampleXrKitPolyline(route, (offset + phase * 0.84) % 1)
      group.position.set(sample.x, 0, sample.z)
      group.rotation.y = sample.heading
    }
  })
  return (
    <group name="agentic_os_xr_hk_tram_corridor">
      {points.slice(1).map((point, index) => {
        const previous = points[index]
        const length = Math.hypot(point[0] - previous[0], point[1] - previous[1])
        return <mesh key={index} position={[(point[0] + previous[0]) / 2, 0.4, (point[1] + previous[1]) / 2]} rotation={[0, headingRadians(previous, point), 0]}>
          <boxGeometry args={[length, 0.3, 3]} />
          <meshBasicMaterial color="#5ec8a0" transparent opacity={0.45} toneMapped={false} />
        </mesh>
      })}
      <group ref={eastbound} name="agentic_os_xr_hk_tram_eastbound"><DoubleDeckTram shadows={shadows} position={[0, 0, 0]} rotationY={0} scale={2.3} /></group>
      <group ref={westbound} name="agentic_os_xr_hk_tram_westbound"><DoubleDeckTram shadows={shadows} position={[0, 0, 0]} rotationY={0} scale={2.3} /></group>
    </group>
  )
}

function StarFerryRoute({ origin, shadows }: { origin: GeoCoordinate; shadows: boolean }) {
  const points = React.useMemo(() => HONG_KONG_STAR_FERRY_ROUTE.map(coordinate => toLocal(coordinate, origin)), [origin])
  const reversed = React.useMemo(() => [...points].reverse(), [points])
  const outbound = React.useRef<THREE.Group>(null)
  const inbound = React.useRef<THREE.Group>(null)
  useFrame(() => {
    const { phase, seconds } = readXrKitTimelineClock()
    for (const [group, route, offset] of [[outbound.current, points, 0], [inbound.current, reversed, 0.5]] as const) {
      if (!group) continue
      const sweep = pingPongPhase((phase + offset) % 1)
      const returning = (phase + offset) % 1 > 0.5
      const sample = sampleXrKitPolyline(route, sweep)
      group.position.set(sample.x, Math.sin(seconds * 1.7 + offset * 9) * 0.35, sample.z)
      group.rotation.y = sample.heading + (returning ? Math.PI : 0)
      group.rotation.z = Math.sin(seconds * 1.3 + offset * 5) * 0.02
    }
  })
  return (
    <group name="agentic_os_xr_hk_star_ferry_route">
      {points.slice(1).map((point, index) => {
        const previous = points[index]
        const length = Math.hypot(point[0] - previous[0], point[1] - previous[1])
        return <mesh key={index} position={[(point[0] + previous[0]) / 2, 0.5, (point[1] + previous[1]) / 2]} rotation={[-Math.PI / 2, 0, -headingRadians(previous, point)]}>
          <planeGeometry args={[length, 2.4]} />
          <meshBasicMaterial color="#ffe0a3" transparent opacity={0.35} depthWrite={false} toneMapped={false} />
        </mesh>
      })}
      <group ref={outbound} name="agentic_os_xr_hk_star_ferry_outbound"><StarFerry shadows={shadows} position={[0, 0, 0]} rotationY={0} scale={6} /></group>
      <group ref={inbound} name="agentic_os_xr_hk_star_ferry_inbound"><StarFerry shadows={shadows} position={[0, 0, 0]} rotationY={0} scale={6} /></group>
    </group>
  )
}

function useKitPulses(root: React.RefObject<THREE.Group | null>) {
  const targets = React.useRef<{ aviation: THREE.MeshBasicMaterial[]; neon: THREE.MeshBasicMaterial[]; spin: THREE.Object3D[]; rings: THREE.Object3D[] } | null>(null)
  useFrame(() => {
    const group = root.current
    if (!group) return
    if (!targets.current) {
      const found = { aviation: [] as THREE.MeshBasicMaterial[], neon: [] as THREE.MeshBasicMaterial[], spin: [] as THREE.Object3D[], rings: [] as THREE.Object3D[] }
      group.traverse(object => {
        if (typeof object.userData.kitSpin === 'number') found.spin.push(object)
        if (typeof object.userData.kitRing === 'number') found.rings.push(object)
        const material = (object as THREE.Mesh).material
        if (material instanceof THREE.MeshBasicMaterial) {
          if (material.userData.kitPulse === 'aviation') found.aviation.push(material)
          if (material.userData.kitPulse === 'neon') found.neon.push(material)
        }
      })
      targets.current = found
    }
    const { seconds } = readXrKitTimelineClock()
    const blink = (seconds % 1.5) < 0.35 ? 1 : 0.18
    targets.current.aviation.forEach(material => { material.opacity = blink })
    targets.current.neon.forEach((material, index) => { material.opacity = 0.14 + 0.12 * xrKitPulse(seconds, 0.6, index * 0.17) })
    const focus = readCinemaShotFocus()
    const focusIndex = focus?.kitId === HONG_KONG_ISLAND_KIT_ID ? focus.locationIndex : null
    targets.current.spin.forEach(object => {
      object.rotation.y = seconds * 0.9 + object.userData.kitSpin * 0.4
      object.scale.setScalar(object.userData.kitSpin === focusIndex ? 1.25 : 1)
    })
    targets.current.rings.forEach(object => {
      const active = object.userData.kitRing === focusIndex
      const scale = (active ? 1.15 : 1) * (0.92 + 0.12 * xrKitPulse(seconds, active ? 1.4 : 0.5, object.userData.kitRing * 0.13))
      object.scale.set(scale, scale, 1)
    })
  })
}

/**
 * Real-scale, geo-anchored Hong Kong Island kit: every part is placed from
 * WGS84 coordinates into the Geo+XR metric frame (1 unit = 1 m, east/up/south)
 * so it stays in one continuum with the MapLibre basemap.
 */
export function XrHongKongIslandGeoKit({ origin, shadows, focusedLocationIndex = null, showReferenceBeacons = true }: {
  origin: GeoCoordinate
  shadows: boolean
  focusedLocationIndex?: number | null
  showReferenceBeacons?: boolean
}) {
  const hills = useLocalHills(origin)
  const root = React.useRef<THREE.Group>(null)
  useKitPulses(root)
  return (
    <group ref={root} name="agentic_os_xr_environment_kit_hong_kong_island_geo" userData={{ origin, scale: 'meters' }}>
      <IslandTerrain origin={origin} hills={hills} />
      <HillsideLights origin={origin} hills={hills} />
      <CityMassing origin={origin} />
      {HONG_KONG_ISLAND_LANDMARKS.map((landmark, index) => <Landmark key={landmark.id} landmark={landmark} origin={origin} hills={hills} index={index} />)}
      <HarbourSkylineReflections origin={origin} />
      <StarFerryRoute origin={origin} shadows={shadows} />
      <TramCorridor origin={origin} shadows={shadows} />
      {showReferenceBeacons ? <ReferenceBeacons origin={origin} hills={hills} focusedLocationIndex={focusedLocationIndex} /> : null}
    </group>
  )
}
