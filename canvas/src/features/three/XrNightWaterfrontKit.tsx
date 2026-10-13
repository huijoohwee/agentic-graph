import React from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { pingPongPhase, readXrKitTimelineClock, xrKitPulse } from './xrKitTimelineMotion'
import type { XrSceneAppearance } from './xrSceneAppearance'
import type { XrMotionReferenceStagePreset } from './xrSceneLibrary'

type Structure = XrMotionReferenceStagePreset['structures'][number]

const TONES = {
  light: '#344554',
  mid: '#1d2e3d',
  dark: '#101d2c',
  accent: '#24475a',
} as const

function WindowField({ width, height, depth, seed }: {
  width: number
  height: number
  depth: number
  seed: number
}) {
  const instance = React.useRef<THREE.InstancedMesh>(null)
  const columns = Math.max(3, Math.min(14, Math.floor(width / 0.62)))
  const rows = Math.max(2, Math.min(20, Math.floor(height / 0.68)))
  const windows = React.useMemo(() => Array.from({ length: columns * rows * 2 }, (_, index) => {
    const faceIndex = Math.floor(index / (columns * rows))
    const cell = index % (columns * rows)
    const row = Math.floor(cell / columns)
    const column = cell % columns
    const hash = (index * 37 + seed * 19 + row * 13 + column * 7) % 17
    const lit = hash > 7
    const color = ['#f4bf7b', '#83c9df', '#c5d7e3', '#d58a62'][hash % 4]
    return {
      x: -width / 2 + (column + 0.5) * width / columns,
      y: -height / 2 + (row + 0.5) * height / rows,
      z: faceIndex ? -depth / 2 - 0.026 : depth / 2 + 0.026,
      lit,
      widthScale: 0.48 + (hash % 3) * 0.07,
      heightScale: 0.58 + (Math.floor(hash / 3) % 3) * 0.08,
      color: new THREE.Color(color).multiplyScalar(0.72 + (hash % 4) * 0.1),
    }
  }), [columns, depth, height, rows, seed, width])

  React.useLayoutEffect(() => {
    const mesh = instance.current
    if (!mesh) return
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    windows.forEach((window, index) => {
      position.set(window.x, window.y, window.z)
      scale.set(width / columns * window.widthScale, height / rows * window.heightScale, 0.035)
      if (!window.lit) scale.setScalar(0.001)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(index, matrix)
      mesh.setColorAt(index, window.color)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [columns, height, rows, width, windows])

  return (
    <instancedMesh ref={instance} args={[undefined!, undefined!, windows.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.34} metalness={0.18} roughness={0.3} />
    </instancedMesh>
  )
}

function SkylineBuilding({ structure, index, shadows }: {
  structure: Structure
  index: number
  shadows: boolean
}) {
  const [width, height, depth] = structure.size
  const tone = structure.color || TONES[structure.tone]
  const isTower = height > 8
  const isMarket = structure.id.includes('market')
  const isTerminal = structure.id.includes('terminal')
  const facadeColor = isTower ? '#102536' : tone
  const floors = Math.min(6, Math.max(2, Math.floor(height / 2.2)))
  return (
    <group name={`agentic_os_xr_night_building_${structure.id}`} position={structure.position}>
      <mesh castShadow={shadows} receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={facadeColor} metalness={0.38} roughness={0.34} />
      </mesh>
      <WindowField width={width} height={height} depth={depth} seed={index + 1} />
      {[-1, 1].map(side => <mesh key={`corner:${side}`} position={[side * width * 0.47, 0, depth / 2 + 0.04]}>
        <boxGeometry args={[0.07, height, 0.08]} />
        <meshStandardMaterial color="#536c7a" metalness={0.72} roughness={0.28} />
      </mesh>)}
      {Array.from({ length: floors }, (_, floor) => {
        const y = -height / 2 + (floor + 1) * height / (floors + 1)
        return <mesh key={`band:${floor}`} position={[0, y, depth / 2 + 0.052]}>
          <boxGeometry args={[width * 0.98, 0.045, 0.045]} />
          <meshStandardMaterial color="#6e8a96" metalness={0.7} roughness={0.32} />
        </mesh>
      })}
      <mesh position={[0, height / 2 + 0.07, 0]} receiveShadow>
        <boxGeometry args={[width * 1.04, 0.14, depth * 1.04]} />
        <meshStandardMaterial color="#42596a" metalness={0.56} roughness={0.38} />
      </mesh>
      {isTower ? (
        <group position={[width * 0.2, height / 2 + 0.4, -depth * 0.1]}>
          <mesh><boxGeometry args={[width * 0.06, 0.62, width * 0.06]} /><meshStandardMaterial color="#718994" metalness={0.68} roughness={0.3} /></mesh>
          <mesh position={[0, 0.35, 0]}><sphereGeometry args={[0.08, 8, 6]} /><meshStandardMaterial color="#ed5d52" emissive="#f04b36" emissiveIntensity={0.9} /></mesh>
        </group>
      ) : (
        <group position={[0, height * 0.18, depth / 2 + 0.32]}>
          <mesh castShadow><boxGeometry args={[width * 0.9, 0.12, 0.68]} /><meshStandardMaterial color={isMarket ? '#b27a4d' : '#345a6a'} metalness={0.25} roughness={0.44} /></mesh>
          <mesh position={[0, -0.16, 0.3]}><boxGeometry args={[width * 0.84, 0.05, 0.04]} /><meshStandardMaterial color={isMarket ? '#ffbb70' : '#74d6e2'} emissive={isMarket ? '#ef8846' : '#37b9d0'} emissiveIntensity={0.72} /></mesh>
          {isTerminal ? <mesh position={[0, -height * 0.08, 0.7]} castShadow><boxGeometry args={[width * 1.12, 0.12, 1.4]} /><meshStandardMaterial color="#607989" metalness={0.44} roughness={0.38} /></mesh> : null}
        </group>
      )}
    </group>
  )
}

function Surface({ surface, shadows }: { surface: NonNullable<XrMotionReferenceStagePreset['walkableSurfaces']>[number]; shadows: boolean }) {
  const [width, depth] = surface.sizeMeters
  const thickness = Math.max(0.07, surface.thicknessMeters)
  const street = surface.kind === 'street'
  return (
    <mesh
      name={`agentic_os_xr_night_surface_${surface.id}`}
      position={[surface.centerMeters[0], surface.topMeters - thickness / 2, surface.centerMeters[1]]}
      receiveShadow={shadows}
      userData={{ walkable: true, walkableKind: surface.kind, walkableSurfaceId: surface.id }}
    >
      <boxGeometry args={[width, thickness, depth]} />
      <meshStandardMaterial color={surface.color || (street ? '#111a26' : '#3b4955')} roughness={street ? 0.24 : 0.78} metalness={street ? 0.32 : 0.18} />
    </mesh>
  )
}

function HarborPier({ shadows }: { shadows: boolean }) {
  return (
    <group name="agentic_os_xr_night_harbor_pier" position={[0, 0, 10]}>
      <mesh position={[0, -0.18, 0]} castShadow={shadows} receiveShadow={shadows}>
        <boxGeometry args={[13.2, 0.46, 4.2]} />
        <meshStandardMaterial color="#394853" metalness={0.22} roughness={0.64} />
      </mesh>
      {[-5.8, -3.9, -2, 0, 2, 3.9, 5.8].map(x => <mesh key={`deck:${x}`} position={[x, 0.065, 0]}>
        <boxGeometry args={[0.045, 0.025, 3.92]} />
        <meshStandardMaterial color="#73818a" roughness={0.56} metalness={0.32} />
      </mesh>)}
      {[-5.7, -2.85, 0, 2.85, 5.7].map(x => <React.Fragment key={`rail:${x}`}>
        <mesh position={[x, 0.5, 1.76]} castShadow={shadows}><boxGeometry args={[0.08, 1, 0.08]} /><meshStandardMaterial color="#a1b0b9" metalness={0.72} roughness={0.32} /></mesh>
        <mesh position={[x, 0.83, 1.76]}><sphereGeometry args={[0.06, 8, 6]} /><meshStandardMaterial color="#f8c17d" emissive="#ffab5b" emissiveIntensity={0.38} /></mesh>
      </React.Fragment>)}
      <mesh position={[0, 0.83, 1.76]}><boxGeometry args={[11.5, 0.055, 0.055]} /><meshStandardMaterial color="#96a8b1" metalness={0.72} roughness={0.3} /></mesh>
    </group>
  )
}

function WetRoadDetails() {
  return (
    <group name="agentic_os_xr_night_road_markings">
      {Array.from({ length: 9 }, (_, index) => <mesh key={`lane:${index}`} position={[0, 0.075, -7.2 + index * 1.8]}>
        <boxGeometry args={[0.075, 0.025, 0.88]} />
        <meshStandardMaterial color="#d8c7a4" emissive="#6c5b3c" emissiveIntensity={0.16} roughness={0.38} />
      </mesh>)}
      {[-1, 1].map(side => Array.from({ length: 5 }, (_, index) => <mesh key={`cross:${side}:${index}`} position={[(index - 2) * 1.35, 0.078, side * 7.6]}>
        <boxGeometry args={[0.72, 0.025, 0.48]} />
        <meshStandardMaterial color="#c8d0d0" emissive="#66818b" emissiveIntensity={0.1} roughness={0.35} />
      </mesh>))}
      {[
        [-4.3, -3.5, 1.25, 0.32], [3.8, -1.4, 1.65, 0.4], [-2.1, 4.9, 1.1, 0.28],
        [4.2, 5.1, 1.4, 0.34], [-3.5, 7.2, 1.15, 0.3], [1.8, -6.2, 1.2, 0.25],
      ].map(([x, z, rx, rz], index) => <mesh key={`puddle:${index}`} position={[x, 0.048, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[rx, rz, 1]}>
        <circleGeometry args={[1, 24]} />
        <meshStandardMaterial color="#0c3c50" emissive="#07566a" emissiveIntensity={0.24} roughness={0.12} metalness={0.58} transparent opacity={0.72} />
      </mesh>)}
    </group>
  )
}

function WaterEdge({ appearance }: { appearance?: XrSceneAppearance }) {
  return (
    <group name="agentic_os_xr_night_harbor_water" position={[0, -0.12, 15]}>
      <mesh receiveShadow>
        <boxGeometry args={[52, 0.28, 8]} />
        <meshStandardMaterial color={appearance?.waterColor || '#10384d'} roughness={0.14} metalness={0.62} />
      </mesh>
      {[-3.2, -2.2, -1.1, 0.25, 1.3, 2.5, 3.3].map((z, index) => <mesh key={z} position={[(index % 2 ? -4 : 4), 0.16, z]}>
        <boxGeometry args={[3.4 + (index % 3) * 1.2, 0.025, 0.035]} />
        <meshStandardMaterial color="#57afbf" emissive="#31899c" emissiveIntensity={0.28} roughness={0.18} metalness={0.5} transparent opacity={0.5} />
      </mesh>)}
    </group>
  )
}

const NEON_COLORS = Object.freeze(['#ff3d7f', '#ff5a36', '#35e0ff', '#ffb547', '#c45bff', '#3dff9e'])

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}

/** Victoria Peak style ridgeline backdrop with hillside residential lights. */
function PeakRidgeBackdrop() {
  const width = 52
  const depth = 7
  const ridgeHeight = React.useCallback((x: number) => {
    const u = x / width
    return 5.5
      + 4.1 * Math.exp(-(((u + 0.08) / 0.2) ** 2))
      + 1.25 * Math.sin(u * 9.4 + 0.6)
      + 0.65 * Math.sin(u * 23 + 1.9)
  }, [])
  const geometry = React.useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(-width / 2, 0)
    const steps = 48
    for (let index = 0; index <= steps; index += 1) {
      const x = -width / 2 + (index / steps) * width
      shape.lineTo(x, ridgeHeight(x))
    }
    shape.lineTo(width / 2, 0)
    shape.closePath()
    const extruded = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 })
    extruded.computeVertexNormals()
    return extruded
  }, [ridgeHeight])
  React.useEffect(() => () => geometry.dispose(), [geometry])
  const instance = React.useRef<THREE.InstancedMesh>(null)
  const lights = React.useMemo(() => Array.from({ length: 150 }, (_, index) => {
    const x = -width / 2 + 1 + seededUnit(index + 3) * (width - 2)
    const top = ridgeHeight(x)
    const y = 0.8 + seededUnit(index + 101) ** 1.6 * (top - 2.2)
    return { x, y, warm: seededUnit(index + 211) > 0.22, size: 0.12 + seededUnit(index + 307) * 0.12 }
  }), [ridgeHeight])
  React.useLayoutEffect(() => {
    const mesh = instance.current
    if (!mesh) return
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    lights.forEach((light, index) => {
      matrix.makeScale(light.size, light.size, 0.04)
      matrix.setPosition(light.x, light.y, depth + 0.03)
      mesh.setMatrixAt(index, matrix)
      mesh.setColorAt(index, color.set(light.warm ? '#ffc98a' : '#bfe8ff'))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [lights])
  const summitX = -0.08 * width
  return (
    <group name="agentic_os_xr_night_peak_ridge" position={[0, -0.2, -24]}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#172b3c" roughness={0.92} metalness={0.04} />
      </mesh>
      <instancedMesh ref={instance} args={[undefined!, undefined!, lights.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffc27a" emissiveIntensity={0.85} toneMapped={false} />
      </instancedMesh>
      <group name="agentic_os_xr_night_peak_tower" position={[summitX, ridgeHeight(summitX) - 0.4, depth * 0.55]}>
        <mesh position={[0, 0.5, 0]}><cylinderGeometry args={[0.35, 0.5, 1, 10]} /><meshStandardMaterial color="#5d6f78" metalness={0.5} roughness={0.4} /></mesh>
        <mesh position={[0, 1.15, 0]}><cylinderGeometry args={[1.5, 0.55, 0.42, 16]} /><meshStandardMaterial color="#c9d6dc" emissive="#9fc8e8" emissiveIntensity={0.35} metalness={0.5} roughness={0.3} /></mesh>
      </group>
    </group>
  )
}

function SteppedLandmarkTower({ position, shadows }: { position: readonly [number, number, number]; shadows: boolean }) {
  const tiers = [[3.2, 15, 3.2], [2.7, 4, 2.7], [2.2, 3, 2.2], [1.6, 2.2, 1.6]] as const
  let y = 0
  return (
    <group name="agentic_os_xr_night_landmark_stepped_tower" position={position}>
      {tiers.map(([w, h, d], index) => {
        const centerY = y + h / 2
        y += h
        return <group key={index} position={[0, centerY, 0]}>
          <mesh castShadow={shadows}><boxGeometry args={[w, h, d]} /><meshStandardMaterial color="#1a3346" metalness={0.62} roughness={0.22} /></mesh>
          <WindowField width={w} height={h} depth={d} seed={40 + index} />
        </group>
      })}
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2
        return <mesh key={`fin:${index}`} position={[Math.cos(angle) * 0.75, y + 0.9, Math.sin(angle) * 0.75]} rotation={[0, -angle, 0]}>
          <boxGeometry args={[0.08, 1.8, 0.4]} />
          <meshStandardMaterial color="#9fd8ff" emissive="#7cc6ff" emissiveIntensity={0.7} toneMapped={false} />
        </mesh>
      })}
    </group>
  )
}

function PrismLandmarkTower({ position, shadows }: { position: readonly [number, number, number]; shadows: boolean }) {
  const tiers = React.useMemo(() => [[2.6, 8], [2.1, 5], [1.6, 4], [1, 3.2]].map(([radius, height]) => {
    const geometry = new THREE.CylinderGeometry(radius * 0.92, radius, height, 3, 1)
    return { radius, height, geometry, edges: new THREE.EdgesGeometry(geometry) }
  }), [])
  React.useEffect(() => () => tiers.forEach(tier => { tier.geometry.dispose(); tier.edges.dispose() }), [tiers])
  let y = 0
  return (
    <group name="agentic_os_xr_night_landmark_prism_tower" position={position} rotation={[0, Math.PI / 6, 0]}>
      {tiers.map((tier, index) => {
        const centerY = y + tier.height / 2
        y += tier.height
        return <group key={index} position={[0, centerY, 0]}>
          <mesh geometry={tier.geometry} castShadow={shadows}><meshStandardMaterial color="#14283a" metalness={0.75} roughness={0.18} /></mesh>
          <lineSegments geometry={tier.edges}><lineBasicMaterial color="#e8f4ff" toneMapped={false} /></lineSegments>
        </group>
      })}
      {[0, 1].map(index => <mesh key={`mast:${index}`} position={[(index - 0.5) * 0.5, y + 1.4, 0]}>
        <cylinderGeometry args={[0.04, 0.06, 2.8, 6]} />
        <meshStandardMaterial color="#c0ccd4" metalness={0.8} roughness={0.25} />
      </mesh>)}
    </group>
  )
}

const BACKDROP_TOWERS = Object.freeze([
  [-22, 8, 4.1, 3.2, 1], [-18, 15, 3.1, 3.4, -2], [-14, 10, 4.2, 3, 2], [-10, 19, 3.2, 3.2, -3],
  [-6.2, 12, 4.1, 3.1, 1], [-2.8, 17, 3, 3.6, -2], [1.6, 9, 4.4, 3.3, 2], [5.4, 21, 3.2, 3.2, -4],
  [9.2, 12, 4.4, 3.1, 1], [13.1, 17, 3.3, 3.5, -2], [17, 10, 4.2, 3.2, 2], [21, 14, 3.6, 3.2, -3],
  [-19.5, 6, 3.3, 3, -3], [-12.2, 8, 3.5, 3.2, -2], [-4.5, 7, 3.4, 3.4, -3], [3, 8, 3.4, 3.4, -2],
  [11.3, 7, 3.6, 3, -3], [19.5, 6, 3.3, 3.4, -2],
] as const)

function BackdropSkyline({ shadows }: { shadows: boolean }) {
  return (
    <group name="agentic_os_xr_night_backdrop_skyline" position={[0, -1.2, -14]}>
      {BACKDROP_TOWERS.map(([x, height, width, depth, z], index) => <group key={index} position={[x, height / 2, z]}>
      <mesh castShadow={shadows} receiveShadow><boxGeometry args={[width, height, depth]} /><meshStandardMaterial color={index % 3 ? '#354c60' : '#405b6d'} emissive="#071522" emissiveIntensity={0.42} metalness={0.34} roughness={0.5} /></mesh>
        <WindowField width={width} height={height} depth={depth} seed={20 + index} />
        {index % 2 === 0 ? <group position={[width / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}><WindowField width={depth} height={height} depth={width} seed={70 + index} /></group> : null}
        <mesh position={[0, -height * 0.4, 0]} castShadow={shadows}><boxGeometry args={[width * 1.18, height * 0.2, depth * 1.16]} /><meshStandardMaterial color="#223342" emissive="#08131d" emissiveIntensity={0.22} metalness={0.34} roughness={0.5} /></mesh>
        <mesh position={[0, height / 2 + 0.06, 0]}><boxGeometry args={[width * 0.94, 0.12, depth * 0.94]} /><meshStandardMaterial color="#516577" metalness={0.48} roughness={0.46} /></mesh>
        {index % 4 === 1 ? <group position={[width * 0.08, height * 0.38, 0]}>
          <mesh castShadow={shadows}><boxGeometry args={[width * 0.66, height * 0.23, depth * 0.7]} /><meshStandardMaterial color="#111f2c" metalness={0.5} roughness={0.36} /></mesh>
          <WindowField width={width * 0.66} height={height * 0.23} depth={depth * 0.7} seed={90 + index} />
        </group> : null}
        {index % 3 === 0 ? <group position={[width * 0.22, height / 2 + 0.38, -depth * 0.12]}>
          <mesh position={[0, 0.12, 0]}><boxGeometry args={[width * 0.18, 0.26, depth * 0.22]} /><meshStandardMaterial color="#283a49" metalness={0.56} roughness={0.48} /></mesh>
          <mesh position={[0, 0.52, 0]}><cylinderGeometry args={[0.025, 0.035, 0.58, 6]} /><meshStandardMaterial color="#a3b4be" metalness={0.65} roughness={0.38} /></mesh>
          <mesh position={[0, 0.84, 0]}><sphereGeometry args={[0.045, 8, 6]} /><meshBasicMaterial color="#e44c4c" toneMapped={false} /></mesh>
        </group> : null}
      </group>)}
      <SteppedLandmarkTower position={[-4.6, 0, 0.4]} shadows={shadows} />
      <PrismLandmarkTower position={[6, 0, 0.6]} shadows={shadows} />
    </group>
  )
}

function NightSky() {
  return <mesh name="agentic_os_xr_cinema_horizon_gradient" position={[0, 8, -32]} renderOrder={-1}>
    <planeGeometry args={[88, 42]} />
    <shaderMaterial
      vertexShader="varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}"
      fragmentShader="varying vec2 vUv; void main(){float haze=exp(-pow((vUv.y-0.2)*7.5,2.0)); vec3 zenith=vec3(0.02,0.05,0.12); vec3 horizon=vec3(0.09,0.2,0.31); vec3 c=mix(horizon,zenith,smoothstep(0.02,0.86,vUv.y)); c+=vec3(0.06,0.12,0.18)*haze; gl_FragColor=vec4(c,1.0);}"
      side={THREE.DoubleSide}
      depthWrite
      toneMapped={false}
    />
  </mesh>
}

/** Projecting vertical shop signs; colour bars stand in for characters (no textures). */
function NeonBladeSigns({ structures }: { structures: readonly Structure[] }) {
  const signs = structures.flatMap((structure, structureIndex) => {
    if (structure.size[1] > 9 || structure.size[0] > 12 || structure.id.includes('pier')) return []
    const [x, y, z] = structure.position
    const [width, height, depth] = structure.size
    const towardStreet = x > 0 ? -1 : 1
    const faceX = x + towardStreet * width / 2
    const count = Math.max(1, Math.min(3, Math.floor(depth / 2.2)))
    return Array.from({ length: count }, (_, index) => {
      const seed = structureIndex * 7 + index
      const signHeight = 1.4 + seededUnit(seed + 5) * 1.3
      return {
        key: `${structure.id}:${index}`,
        position: [faceX + towardStreet * 0.62, y - height / 2 + height * 0.55 + seededUnit(seed) * 0.6, z - depth / 2 + (index + 0.5) * depth / count] as const,
        height: signHeight,
        color: NEON_COLORS[seed % NEON_COLORS.length],
        accent: NEON_COLORS[(seed + 2) % NEON_COLORS.length],
      }
    })
  })
  const root = React.useRef<THREE.Group>(null)
  useFrame(() => {
    const group = root.current
    if (!group) return
    const { seconds } = readXrKitTimelineClock()
    group.children.forEach((sign, index) => {
      const flicker = (seconds * 3.1 + index * 0.37) % 4 < 0.12 ? 0.25 : 1
      const glow = (0.85 + 0.35 * xrKitPulse(seconds, 0.45, index * 0.21)) * flicker
      sign.traverse(object => {
        const material = (object as THREE.Mesh).material
        if (material instanceof THREE.MeshStandardMaterial && material.userData.neonBase) material.emissiveIntensity = material.userData.neonBase * glow
      })
    })
  })
  return (
    <group ref={root} name="agentic_os_xr_night_neon_signs">
      {signs.map(sign => <group key={sign.key} position={sign.position}>
        <mesh><boxGeometry args={[1.1, sign.height + 0.12, 0.1]} /><meshStandardMaterial color="#0b0f16" metalness={0.4} roughness={0.5} /></mesh>
        <mesh><boxGeometry args={[0.98, sign.height, 0.13]} /><meshStandardMaterial color={sign.color} emissive={sign.color} emissiveIntensity={1.15} toneMapped={false} userData={{ neonBase: 1.15 }} /></mesh>
        {Array.from({ length: Math.floor(sign.height / 0.42) }, (_, row) => <mesh key={row} position={[0, sign.height / 2 - 0.26 - row * 0.42, 0]}>
          <boxGeometry args={[0.56, 0.2, 0.16]} />
          <meshStandardMaterial color={sign.accent} emissive={sign.accent} emissiveIntensity={1.4} toneMapped={false} userData={{ neonBase: 1.4 }} />
        </mesh>)}
        <mesh position={[0, sign.height / 2 + 0.2, 0]}><boxGeometry args={[1.25, 0.05, 0.05]} /><meshStandardMaterial color="#56636c" metalness={0.8} roughness={0.3} /></mesh>
      </group>)}
    </group>
  )
}

type PropPlacement = Readonly<{
  position?: readonly [number, number, number]
  rotationY?: number
  scale?: number
}>

export function DoubleDeckTram({ shadows, position = [3, 0, -4], rotationY = Math.PI / 2, scale = 1 }: { shadows: boolean } & PropPlacement) {
  const length = 5.4
  return (
    <group name="agentic_os_xr_night_double_deck_tram" position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {[-0.5, 0.5].map(offset => <mesh key={`rail:${offset}`} position={[0, 0.02, offset]} rotation={[0, 0, 0]}>
        <boxGeometry args={[20, 0.04, 0.07]} />
        <meshStandardMaterial color="#8d9aa3" metalness={0.9} roughness={0.2} />
      </mesh>)}
      <mesh position={[0, 0.25, 0]}><boxGeometry args={[length * 0.8, 0.3, 1.2]} /><meshStandardMaterial color="#141a1f" roughness={0.6} /></mesh>
      <mesh position={[0, 1.05, 0]} castShadow={shadows}><boxGeometry args={[length, 1.3, 1.5]} /><meshStandardMaterial color="#1f6b45" metalness={0.25} roughness={0.42} /></mesh>
      <mesh position={[0, 1.78, 0]}><boxGeometry args={[length + 0.02, 0.16, 1.52]} /><meshStandardMaterial color="#e9dfc4" roughness={0.5} /></mesh>
      <mesh position={[0, 2.45, 0]} castShadow={shadows}><boxGeometry args={[length, 1.2, 1.5]} /><meshStandardMaterial color="#1f6b45" metalness={0.25} roughness={0.42} /></mesh>
      <mesh position={[0, 3.1, 0]}><boxGeometry args={[length * 0.97, 0.12, 1.4]} /><meshStandardMaterial color="#d9d3bd" roughness={0.6} /></mesh>
      {[1.15, 2.5].map(y => [-1, 1].map(side => <mesh key={`win:${y}:${side}`} position={[0, y, side * 0.76]}>
        <boxGeometry args={[length * 0.86, 0.5, 0.03]} />
        <meshStandardMaterial color="#ffe0a8" emissive="#ffc46b" emissiveIntensity={0.85} toneMapped={false} />
      </mesh>))}
      <mesh position={[length / 2 + 0.01, 2.5, 0]}><boxGeometry args={[0.03, 0.34, 1.1]} /><meshStandardMaterial color="#fff6d8" emissive="#ffe8a8" emissiveIntensity={1} toneMapped={false} /></mesh>
      <mesh position={[0.4, 3.75, 0]} rotation={[0, 0, -0.5]}><cylinderGeometry args={[0.025, 0.025, 1.5, 6]} /><meshStandardMaterial color="#2b3238" metalness={0.8} roughness={0.3} /></mesh>
    </group>
  )
}

export function StarFerry({ shadows, position = [9.5, 0, 16.2], rotationY = 0, scale = 1 }: { shadows: boolean } & PropPlacement) {
  return (
    <group name="agentic_os_xr_night_star_ferry" position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <mesh position={[0, 0.05, 0]} castShadow={shadows}><boxGeometry args={[6, 0.7, 1.9]} /><meshStandardMaterial color="#1d5a3c" metalness={0.2} roughness={0.5} /></mesh>
      <mesh position={[0, 0.44, 0]}><boxGeometry args={[6.04, 0.08, 1.94]} /><meshStandardMaterial color="#f2f2ea" roughness={0.5} /></mesh>
      <mesh position={[0, 0.82, 0]} castShadow={shadows}><boxGeometry args={[5.2, 0.68, 1.7]} /><meshStandardMaterial color="#2a6e4b" roughness={0.45} /></mesh>
      <mesh position={[0, 1.42, 0]} castShadow={shadows}><boxGeometry args={[4.6, 0.56, 1.6]} /><meshStandardMaterial color="#eef1ec" roughness={0.45} /></mesh>
      <mesh position={[0, 1.76, 0]}><boxGeometry args={[4.9, 0.08, 1.8]} /><meshStandardMaterial color="#1d5a3c" roughness={0.5} /></mesh>
      {[0.82, 1.42].map(y => [-1, 1].map(side => <mesh key={`win:${y}:${side}`} position={[0, y, side * (y > 1 ? 0.81 : 0.86)]}>
        <boxGeometry args={[y > 1 ? 4.2 : 4.8, 0.26, 0.03]} />
        <meshStandardMaterial color="#fff1cc" emissive="#ffd894" emissiveIntensity={0.9} toneMapped={false} />
      </mesh>))}
      <mesh position={[0, 2.2, 0]}><cylinderGeometry args={[0.03, 0.03, 0.9, 6]} /><meshStandardMaterial color="#d8dde0" metalness={0.7} roughness={0.3} /></mesh>
      <mesh position={[0, 2.68, 0]}><sphereGeometry args={[0.07, 8, 6]} /><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.2} toneMapped={false} /></mesh>
      {[-1, 1].map(side => <mesh key={`nav:${side}`} position={[side * 2.95, 0.6, 0]}><sphereGeometry args={[0.06, 8, 6]} /><meshStandardMaterial color={side > 0 ? '#3dff7a' : '#ff3d3d'} emissive={side > 0 ? '#3dff7a' : '#ff3d3d'} emissiveIntensity={1.4} toneMapped={false} /></mesh>)}
    </group>
  )
}

/** Diorama tram and ferry follow the shared Timeline playhead across the full duration. */
function TimelineDioramaTraffic({ shadows }: { shadows: boolean }) {
  const tram = React.useRef<THREE.Group>(null)
  const ferry = React.useRef<THREE.Group>(null)
  useFrame(() => {
    const { phase, seconds } = readXrKitTimelineClock()
    if (tram.current) tram.current.position.set(0, 0, -6 + phase * 12)
    if (ferry.current) {
      const sweep = pingPongPhase(phase)
      ferry.current.position.set(-12 + sweep * 22, Math.sin(seconds * 1.7) * 0.04, 0)
      ferry.current.rotation.y = phase > 0.5 ? Math.PI : 0
      ferry.current.rotation.z = Math.sin(seconds * 1.3) * 0.02
    }
  })
  return <>
    <group ref={ferry} name="agentic_os_xr_night_star_ferry_motion"><group position={[0, 0, 16.2]}><StarFerry shadows={shadows} position={[0, 0, 0]} /></group></group>
    <group ref={tram} name="agentic_os_xr_night_tram_motion"><DoubleDeckTram shadows={shadows} /></group>
  </>
}

function DioramaPracticalLights() {
  const lights = React.useRef<Array<THREE.PointLight | null>>([])
  const base = [9, 8, 5, 3.5]
  useFrame(() => {
    const { seconds } = readXrKitTimelineClock()
    lights.current.forEach((light, index) => {
      if (light) light.intensity = base[index] * (0.8 + 0.3 * xrKitPulse(seconds, 0.3 + index * 0.07, index * 0.25))
    })
  })
  return <>
    <pointLight ref={light => { lights.current[0] = light }} position={[-9, 3.4, 3]} color="#ffad68" intensity={base[0]} distance={14} decay={2} />
    <pointLight ref={light => { lights.current[1] = light }} position={[8, 4.4, -3]} color="#4ac9db" intensity={base[1]} distance={16} decay={2} />
    <pointLight ref={light => { lights.current[2] = light }} position={[0, 3.8, 10]} color="#ffb36f" intensity={base[2]} distance={10} decay={2} />
    <pointLight ref={light => { lights.current[3] = light }} position={[-5, 2.1, -6]} color="#40c7e0" intensity={base[3]} distance={9} decay={2} />
  </>
}

function HarbourReflections() {
  return (
    <group name="agentic_os_xr_night_harbour_reflections" position={[0, 0.06, 15]}>
      {Array.from({ length: 14 }, (_, index) => {
        const x = -15 + index * 2.3 + seededUnit(index) * 0.8
        const color = index % 4 === 0 ? NEON_COLORS[index % NEON_COLORS.length] : '#ffc27a'
        return <mesh key={index} position={[x, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.18 + seededUnit(index + 9) * 0.22, 6.5 + seededUnit(index + 17) * 1.2]} />
          <meshBasicMaterial color={color} transparent opacity={0.28} depthWrite={false} toneMapped={false} />
        </mesh>
      })}
    </group>
  )
}

/**
 * `geoAnchored` is set when the kit is drawn in the MapLibre metric frame:
 * the real map supplies the coastline and the real-scale geo kit supplies
 * the Hong Kong Island skyline, so the diorama-scale backdrop is omitted.
 */
export function XrNightWaterfrontKit({ stage, scale, groundY, appearance, shadows, geoAnchored = false }: {
  stage: XrMotionReferenceStagePreset
  scale: number
  groundY: number
  appearance?: XrSceneAppearance
  shadows: boolean
  geoAnchored?: boolean
}) {
  return (
    <group name="agentic_os_xr_environment_kit_night_waterfront" position={[0, groundY, 0]} scale={scale} userData={{ environmentKitId: stage.id, visualProfile: stage.visualProfile, geoAnchored }}>
      {stage.walkableSurfaces?.map(surface => <Surface key={surface.id} surface={surface} shadows={shadows} />)}
      <WetRoadDetails />
      {geoAnchored ? null : <>
        <WaterEdge appearance={appearance} />
        <HarbourReflections />
        <PeakRidgeBackdrop />
        <BackdropSkyline shadows={shadows} />
        <TimelineDioramaTraffic shadows={shadows} />
      </>}
      <NeonBladeSigns structures={stage.structures} />
      {stage.structures.filter(structure => structure.id.includes('pier-deck')).map(structure => <HarborPier key={structure.id} shadows={shadows} />)}
      {stage.structures.filter(structure => !structure.id.includes('pier-deck')).map((structure, index) => <SkylineBuilding key={structure.id} structure={structure} index={index} shadows={shadows} />)}
      <DioramaPracticalLights />
    </group>
  )
}

/** Local, procedural skyline proxy for close cinema frames; map landmarks remain the geo source. */
export function XrNightWaterfrontCinemaBackdrop({ shadows = false }: { shadows?: boolean }) {
  return <group name="agentic_os_xr_cinema_waterfront_horizon" position={[0, -0.8, -7]} scale={[0.9, 0.82, 0.9]} userData={{ source: 'procedural-cinema-proxy', surveyed: false }}>
    <group name="agentic_os_xr_cinema_harbour_water" position={[0, 0.4, -6]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[90, 28]} /><meshStandardMaterial color="#071d2a" emissive="#082b3b" emissiveIntensity={0.16} metalness={0.62} roughness={0.16} /></mesh>
      {Array.from({ length: 22 }, (_, index) => <mesh key={index} position={[-31 + index * 2.95, 0.025, ((index * 7) % 15) - 7]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.08 + (index % 4) * 0.035, 1.8 + (index % 5) * 0.75]} />
        <meshBasicMaterial color={index % 4 === 0 ? '#63b6c4' : '#d3a66e'} transparent opacity={0.16 + (index % 3) * 0.035} depthWrite={false} toneMapped={false} />
      </mesh>)}
    </group>
    <NightSky />
    <group name="agentic_os_xr_cinema_moonlight" position={[-16, 15, -29]}>
      <mesh><sphereGeometry args={[0.34, 16, 12]} /><meshBasicMaterial color="#b7d6e8" toneMapped={false} /></mesh>
      <pointLight color="#96bdd6" intensity={2.4} distance={26} decay={2} />
    </group>
    <pointLight name="agentic_os_xr_cinema_horizon_fill" position={[0, 9, -5]} color="#477da0" intensity={18} distance={52} decay={2} />
    <PeakRidgeBackdrop />
    <BackdropSkyline shadows={shadows} />
  </group>
}
