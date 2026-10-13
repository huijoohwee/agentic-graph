import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function Material({ color, metalness = 0.3, roughness = 0.42, emissive, glow = 0, opacity = 1 }: {
  color: string
  metalness?: number
  roughness?: number
  emissive?: string
  glow?: number
  opacity?: number
}) {
  return <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} emissive={emissive} emissiveIntensity={glow} transparent={opacity < 1} opacity={opacity} />
}

function Floor({ color = '#17232f', width = 14, depth = 10, metalness = 0.56, roughness = 0.24, emissive, glow = 0 }: {
  color?: string
  width?: number
  depth?: number
  metalness?: number
  roughness?: number
  emissive?: string
  glow?: number
}) {
  return <mesh position={[0, -0.14, 0]} receiveShadow><boxGeometry args={[width, 0.28, depth]} /><Material color={color} metalness={metalness} roughness={roughness} emissive={emissive} glow={glow} /></mesh>
}

function MonitorWall({ count = 5, color = '#28c6e6' }: { count?: number; color?: string }) {
  const screens = Array.from({ length: count }, (_, index) => -((count - 1) / 2) + index)
  return <group position={[0, 2.15, -4.1]}>
    {screens.map((x, index) => <group key={index} position={[x * 1.45, 0, 0]}>
      <mesh><boxGeometry args={[1.34, 1.18, 0.16]} /><Material color="#07111c" metalness={0.7} /></mesh>
      <mesh position={[0, 0, 0.09]}><boxGeometry args={[1.2, 1.02, 0.025]} /><Material color="#123143" emissive={color} glow={0.46 + (index % 2) * 0.16} metalness={0.12} roughness={0.2} /></mesh>
      <mesh position={[0, -0.22, 0.115]}><boxGeometry args={[0.78, 0.028, 0.014]} /><Material color="#bdeaff" emissive="#55cce8" glow={0.9} /></mesh>
      <mesh position={[-0.32, 0.2, 0.115]}><boxGeometry args={[0.16, 0.26, 0.014]} /><Material color="#4cb8db" emissive="#227fa5" glow={0.55} /></mesh>
    </group>)}
    <mesh position={[0, -0.82, 0]}><boxGeometry args={[count * 1.55, 0.13, 0.35]} /><Material color="#2c3d4b" metalness={0.76} /></mesh>
  </group>
}

function Console({ position, width = 3.4, color = '#35d4e9' }: {
  position: readonly [number, number, number]
  width?: number
  color?: string
}) {
  return <group position={position}>
    <mesh position={[0, 0.72, 0]} rotation={[-0.12, 0, 0]}><boxGeometry args={[width, 0.2, 0.92]} /><Material color="#26323d" metalness={0.74} roughness={0.3} /></mesh>
    {[-0.3, 0.1, 0.4].map((y, index) => <mesh key={index} position={[0, 0.84, y]} rotation={[-0.22, 0, 0]}><boxGeometry args={[width * (index === 1 ? 0.68 : 0.22), 0.035, 0.025]} /><Material color={color} emissive={color} glow={0.86} /></mesh>)}
    {[-width * 0.38, width * 0.38].map(x => <mesh key={x} position={[x, 0.36, 0]}><boxGeometry args={[0.12, 0.66, 0.68]} /><Material color="#18232d" metalness={0.65} /></mesh>)}
  </group>
}

function ObservationDeck() {
  return <group>
    <Floor color="#253641" width={16} depth={11} metalness={0.16} roughness={0.23} emissive="#0e2631" glow={0.16} />
    {[-5.4, -2.7, 0, 2.7, 5.4].map(x => <mesh key={`deck-seam:${x}`} position={[x, 0.007, 0]}>
      <boxGeometry args={[0.018, 0.012, 9.7]} />
      <Material color="#8ea3ad" opacity={0.22} />
    </mesh>)}
    {[-3.8, -1.3, 1.2, 3.7].map(z => <mesh key={`deck-joint:${z}`} position={[0, 0.008, z]}>
      <boxGeometry args={[15.2, 0.012, 0.018]} />
      <Material color="#718994" opacity={0.25} />
    </mesh>)}
    {[-7, -4.7, -2.35, 0, 2.35, 4.7, 7].map(x => <mesh key={x} position={[x, 0.72, -4.65]}><boxGeometry args={[0.09, 1.44, 0.1]} /><Material color="#9cafbc" metalness={0.84} /></mesh>)}
    <mesh position={[0, 1.39, -4.65]}><boxGeometry args={[14.2, 0.07, 0.08]} /><Material color="#a8bcc6" metalness={0.86} /></mesh>
    {[-5.85, -3.52, -1.18, 1.18, 3.52, 5.85].map(x => <mesh key={`glass:${x}`} position={[x, 0.76, -4.64]}>
      <boxGeometry args={[2.18, 1.22, 0.035]} />
      <Material color="#568094" metalness={0.16} roughness={0.18} opacity={0.17} />
    </mesh>)}
    <mesh position={[0, 1.41, -4.65]}><boxGeometry args={[14.1, 0.035, 0.11]} /><Material color="#ffc27a" emissive="#b7783d" glow={0.24} /></mesh>
    {[
      [-4.5, 1.2, 1.15, 0.2, -0.2], [-1.7, -0.8, 1.5, 0.16, 0.12],
      [1.2, 1.7, 1.35, 0.18, -0.12], [4.2, 0.1, 1.6, 0.2, 0.2],
    ].map(([x, z, width, depth, angle], index) => <mesh key={index} position={[x, 0.02, z]} rotation={[-Math.PI / 2, 0, angle]} scale={[width, depth, 1]}>
      <circleGeometry args={[1, 20]} />
      <Material color="#456171" metalness={0.48} roughness={0.1} opacity={0.13} />
    </mesh>)}
    <group position={[-5.2, 0.08, 2.5]} rotation={[0.2, 0.1, 0.15]}>
      <mesh position={[0, 0.72, 0]} rotation={[0, 0, -0.26]}><cylinderGeometry args={[0.13, 0.2, 1.45, 10]} /><Material color="#374650" metalness={0.84} /></mesh>
      <mesh position={[0.34, 1.38, 0]} rotation={[0, 0, -0.26]}><cylinderGeometry args={[0.19, 0.19, 0.48, 12]} /><Material color="#182b38" metalness={0.8} /></mesh>
    </group>
  </group>
}

/** Opaque local shell keeps interior shot dressing independent of the contextual map tiles. */
function InteriorShell({ width = 16, depth = 12, accent = '#35c6e6' }: { width?: number; depth?: number; accent?: string }) {
  const halfWidth = width / 2
  return <group>
    <mesh position={[0, 3.25, -depth / 2 + 0.08]}><boxGeometry args={[width, 6.5, 0.18]} /><Material color="#07111b" metalness={0.42} roughness={0.66} /></mesh>
    {[-1, 1].map(side => <mesh key={side} position={[side * (halfWidth - 0.08), 3.1, 0]}><boxGeometry args={[0.18, 6.2, depth]} /><Material color="#0a131e" metalness={0.5} roughness={0.61} /></mesh>)}
    <mesh position={[0, 6.15, -0.7]}><boxGeometry args={[width, 0.16, depth - 1.2]} /><Material color="#0a111a" metalness={0.44} roughness={0.72} /></mesh>
    {[-0.32, 0.32].map(offset => <mesh key={offset} position={[0, 3.75 + offset, -depth / 2 + 0.19]}><boxGeometry args={[width * 0.84, 0.024, 0.025]} /><Material color={accent} emissive={accent} glow={0.34} /></mesh>)}
  </group>
}

const RAIN_COUNT = 56

function RainCurtain({ seconds }: { seconds: number }) {
  const drops = React.useMemo(() => Array.from({ length: RAIN_COUNT }, (_, index) => Object.freeze({
    x: ((index * 37) % 29) / 29 * 22 - 11,
    y: ((index * 19) % 23) / 23 * 9 + 2,
    z: ((index * 13) % 31) / 31 * 18 - 7,
    length: 0.26 + (index % 5) * 0.045,
  })), [])
  const rain = React.useRef<THREE.InstancedMesh>(null)
  useFrame(() => {
    const mesh = rain.current
    if (!mesh) return
    const matrix = new THREE.Matrix4()
    const scale = new THREE.Vector3(0.012, 1, 0.012)
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.04, 0, -0.08))
    drops.forEach((drop, index) => {
      const fall = ((drop.y - seconds * 9 + 13) % 11 + 11) % 11 - 2
      matrix.compose(new THREE.Vector3(drop.x - seconds * 0.18, fall, drop.z), rotation, scale.setY(drop.length))
      mesh.setMatrixAt(index, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={rain} args={[undefined!, undefined!, drops.length]}>
    <boxGeometry args={[1, 1, 1]} />
    <meshBasicMaterial color="#b7dce7" transparent opacity={0.24} depthWrite={false} toneMapped={false} />
  </instancedMesh>
}

function Boardroom() {
  return <group>
    <InteriorShell accent="#c7984c" />
    <Floor color="#211e20" width={15} depth={11} />
    <mesh position={[0, 0.82, -0.15]}><boxGeometry args={[8.4, 0.2, 2.35]} /><Material color="#29272a" metalness={0.62} roughness={0.19} /></mesh>
    <mesh position={[0, 1.0, -0.15]}><boxGeometry args={[7.7, 0.035, 1.9]} /><Material color="#76532d" emissive="#563713" glow={0.16} metalness={0.78} roughness={0.2} /></mesh>
    {[-3.5, -1.75, 0, 1.75, 3.5].flatMap(x => [-1.85, 1.85].map(z => <group key={`${x}:${z}`} position={[x, 0, z]}>
      <mesh position={[0, 0.52, 0]}><boxGeometry args={[0.74, 0.16, 0.74]} /><Material color="#141a21" /></mesh>
      <mesh position={[0, 0.94, -0.26]}><boxGeometry args={[0.76, 0.72, 0.15]} /><Material color="#1d242c" /></mesh>
      <mesh position={[0, 0.24, 0]}><boxGeometry args={[0.52, 0.48, 0.52]} /><Material color="#37414a" metalness={0.6} /></mesh>
    </group>))}
    <mesh position={[0, 3.2, -2.6]}><torusGeometry args={[2.15, 0.055, 8, 48]} /><Material color="#c7984c" emissive="#bd8240" glow={1.1} /></mesh>
    <mesh position={[0, 3.13, -2.6]}><torusGeometry args={[1.78, 0.025, 6, 48]} /><Material color="#f4d193" emissive="#dba85b" glow={0.8} /></mesh>
  </group>
}

function IncubatorPod({ x, pulse }: { x: number; pulse: React.RefObject<THREE.Mesh | null> }) {
  return <group position={[x, 0, -2.1]}>
    <mesh position={[0, 1.42, 0]}><cylinderGeometry args={[0.69, 0.79, 2.58, 24, 1, true]} /><Material color="#318ba6" emissive="#2cb6d2" glow={0.36} opacity={0.22} /></mesh>
    <mesh position={[0, 1.42, 0]}><cylinderGeometry args={[0.68, 0.68, 2.46, 16]} /><Material color="#b5e6ee" emissive="#64bdd1" glow={0.1} opacity={0.08} /></mesh>
    <mesh ref={pulse} position={[0, 1.42, 0]}><cylinderGeometry args={[0.48, 0.48, 1.75, 12]} /><Material color="#a4c8d4" metalness={0.4} opacity={0.18} /></mesh>
    {[0.19, 2.66].map(y => <mesh key={y} position={[0, y, 0]}><torusGeometry args={[0.76, 0.08, 8, 28]} /><Material color="#43d5e5" emissive="#31b8d3" glow={1.2} /></mesh>)}
    {[-0.48, 0.48].map(xOffset => <mesh key={xOffset} position={[xOffset, 1.4, 0]}><boxGeometry args={[0.06, 2.1, 0.08]} /><Material color="#79e7ee" emissive="#40cbdd" glow={1.4} /></mesh>)}
  </group>
}

function Laboratory() {
  const pod = React.useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const material = pod.current?.material
    if (material instanceof THREE.MeshStandardMaterial) material.emissiveIntensity = 0.18 + 0.16 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 1.6))
  })
  return <group>
    <InteriorShell accent="#43d5e5" />
    <Floor color="#1a2832" width={16} depth={12} />
    {[-4.2, 4.2].map(x => <IncubatorPod key={x} x={x} pulse={pod} />)}
    <MonitorWall count={4} color="#64cfe4" />
    <Console position={[0, 0, 2.5]} width={5.8} color="#65e4ec" />
    {[-6.5, 6.5].map(x => <mesh key={x} position={[x, 1.65, -3]}><boxGeometry args={[0.32, 3.3, 0.42]} /><Material color="#40515d" metalness={0.82} /></mesh>)}
  </group>
}

function SignalPlatform() {
  const mast = React.useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (mast.current) mast.current.rotation.y = clock.elapsedTime * 0.28 })
  return <group>
    <Floor color="#29333b" width={16} depth={12} />
    {[-6.8, 6.8].flatMap(x => [-4.6, 4.6].map(z => <mesh key={`${x}:${z}`} position={[x, 0.42, z]}><cylinderGeometry args={[0.18, 0.26, 0.84, 10]} /><Material color="#57656d" metalness={0.84} /></mesh>))}
    {[-4.7, 0, 4.7].map(x => <group key={x} position={[x, 0, 2.8]}>
      <mesh position={[0, 0.84, 0]}><boxGeometry args={[2.6, 1.68, 1.8]} /><Material color="#33424c" metalness={0.54} /></mesh>
      <mesh position={[0, 1.68, 0]}><boxGeometry args={[2.68, 0.07, 1.88]} /><Material color="#d49755" emissive="#8e562a" glow={0.3} /></mesh>
      <mesh position={[0, 0.85, 0.93]}><boxGeometry args={[1.4, 0.12, 0.035]} /><Material color="#35d2e9" emissive="#35d2e9" glow={1.2} /></mesh>
    </group>)}
    <group ref={mast} position={[0, 0, -3.4]}>
      <mesh position={[0, 2.5, 0]}><cylinderGeometry args={[0.11, 0.24, 5, 8]} /><Material color="#88969e" metalness={0.88} /></mesh>
      <mesh position={[0, 4.95, 0]}><torusGeometry args={[0.78, 0.045, 6, 24]} /><Material color="#39d8e9" emissive="#2cbbda" glow={1.3} /></mesh>
      <mesh position={[0, 5.25, 0]}><sphereGeometry args={[0.14, 12, 8]} /><Material color="#ffb95f" emissive="#ff953c" glow={1.4} /></mesh>
    </group>
  </group>
}

function CableBase() {
  return <group>
    <InteriorShell width={15} depth={11} accent="#26d3c4" />
    <Floor color="#101d29" width={15} depth={11} />
    <MonitorWall count={5} color="#26d3c4" />
    <Console position={[0, 0, 2.6]} width={5.5} color="#35e0cf" />
    {[-5, 5].map(x => <group key={x} position={[x, 0, 0]}>
      <mesh position={[0, 1.35, 0]}><cylinderGeometry args={[0.72, 0.72, 2.5, 16]} /><Material color="#283945" metalness={0.85} /></mesh>
      {[-0.42, -0.16, 0.12, 0.4].map(offset => <mesh key={offset} position={[0, 1.35, offset]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.7, 0.035, 6, 24]} /><Material color="#60bcc3" emissive="#39a9bc" glow={0.26} /></mesh>)}
      <mesh position={[0, 2.7, 0]}><boxGeometry args={[2.1, 0.08, 0.08]} /><Material color="#879aa5" metalness={0.82} /></mesh>
    </group>)}
    <mesh position={[0, 1.65, -4.2]}><cylinderGeometry args={[1.35, 1.35, 0.3, 32]} /><Material color="#394e5b" metalness={0.8} /></mesh>
    <mesh position={[0, 1.67, -4.02]}><circleGeometry args={[0.98, 28]} /><Material color="#0e687a" emissive="#11aabd" glow={0.88} /></mesh>
  </group>
}

function OldTownShopfront({ side }: { side: -1 | 1 }) {
  const neon = side < 0 ? '#31d5ec' : '#ff4f86'
  const windows = [-1, 0, 1].flatMap((x, column) => [1.85, 2.7, 3.55, 4.4, 5.15].map((y, row) => ({
    x: x * 0.91,
    y,
    key: `${column}:${row}`,
    lit: (column * 3 + row + (side < 0 ? 1 : 0)) % 4 !== 0,
    warm: (column + row) % 3 === 0,
  })))
  return <group position={[side * 6.3, 0, -0.4]}>
    <mesh position={[0, 2.8, -1.5]} castShadow receiveShadow><boxGeometry args={[3.1, 5.6, 7.8]} /><Material color={side < 0 ? '#121d28' : '#201b27'} metalness={0.42} roughness={0.76} /></mesh>
    <mesh position={[0, 5.63, -1.45]}><boxGeometry args={[3.22, 0.18, 7.94]} /><Material color="#29313b" metalness={0.68} roughness={0.43} /></mesh>
    {windows.map(window => <group key={window.key} position={[window.x, window.y, 2.47]}>
      <mesh><boxGeometry args={[0.62, 0.66, 0.06]} /><Material color="#070d14" metalness={0.54} roughness={0.28} /></mesh>
      {window.lit ? <mesh position={[0, 0, 0.037]}><boxGeometry args={[0.48, 0.51, 0.018]} /><Material color={window.warm ? '#d98e4f' : '#357e98'} emissive={window.warm ? '#ef944d' : '#29a9ce'} glow={window.warm ? 0.46 : 0.72} roughness={0.22} /></mesh> : null}
      <mesh position={[0, 0, 0.051]}><boxGeometry args={[0.035, 0.56, 0.018]} /><Material color="#64747d" metalness={0.72} /></mesh>
      <mesh position={[0, 0, 0.052]}><boxGeometry args={[0.58, 0.025, 0.018]} /><Material color="#64747d" metalness={0.72} /></mesh>
    </group>)}
    <mesh position={[0, 1.27, 2.66]} rotation={[-0.08, 0, side * 0.025]}><boxGeometry args={[3.5, 0.16, 0.7]} /><Material color={side < 0 ? '#173543' : '#392333'} metalness={0.58} roughness={0.32} /></mesh>
    <mesh position={[0, 1.48, 3.02]}><boxGeometry args={[3.42, 0.42, 0.08]} /><Material color="#0a1119" metalness={0.42} /></mesh>
    <mesh position={[0, 1.48, 3.07]}><boxGeometry args={[2.9, 0.035, 0.025]} /><Material color={neon} emissive={neon} glow={1.2} /></mesh>
    <group position={[side * -0.9, 3.55, 2.63]}>
      <mesh><boxGeometry args={[0.76, 1.6, 0.18]} /><Material color="#11141b" metalness={0.58} /></mesh>
      <mesh position={[0, 0, 0.102]}><boxGeometry args={[0.56, 1.38, 0.025]} /><Material color="#171923" emissive={neon} glow={0.36} /></mesh>
      {[-0.37, -0.12, 0.12, 0.37].map((y, index) => <mesh key={y} position={[0, y, 0.12]}><boxGeometry args={[index % 2 ? 0.42 : 0.24, 0.035, 0.018]} /><Material color={index % 2 ? '#f2b16d' : neon} emissive={index % 2 ? '#f2a05b' : neon} glow={0.82} /></mesh>)}
    </group>
  </group>
}

function OldTownStreet({ seconds }: { seconds: number }) {
  return <group>
    <Floor color="#111a25" width={16} depth={13} />
    {([-1, 1] as const).map(side => <OldTownShopfront key={side} side={side} />)}
    <mesh position={[0, 5.32, 0.5]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.025, 0.025, 12.4, 6]} /><Material color="#343d47" metalness={0.82} /></mesh>
    {[-2.2, 0, 2.2].map((x, index) => <group key={x} position={[x, 4.85, 0.5]}>
      <mesh position={[0, 0.11, 0]}><cylinderGeometry args={[0.018, 0.018, 0.24, 6]} /><Material color="#58636c" metalness={0.72} /></mesh>
      <mesh position={[0, -0.08, 0]}><sphereGeometry args={[0.12, 10, 8]} /><Material color={index === 1 ? '#ffd08a' : '#b9eaff'} emissive={index === 1 ? '#ff9e48' : '#4ec8ed'} glow={1.2} /></mesh>
    </group>)}
    <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[13, 8]} /><Material color="#0b4660" emissive="#0a3c55" metalness={0.78} roughness={0.12} glow={0.3} opacity={0.36} /></mesh>
    {[
      [-4.2, -1.5, 1.35, 0.58, '#197e9b'], [-1.3, 1.4, 1.75, 0.46, '#a22e62'],
      [2.0, -1.2, 1.52, 0.52, '#b67a3f'], [4.2, 1.35, 1.05, 0.7, '#22718c'],
    ].map(([x, z, width, depth, color], index) => <mesh key={index} position={[Number(x), 0.023, Number(z)]} rotation={[-Math.PI / 2, 0, index % 2 ? 0.1 : -0.08]} scale={[Number(width), Number(depth), 1]}>
      <circleGeometry args={[1, 24]} /><Material color={String(color)} emissive={String(color)} metalness={0.64} roughness={0.08} glow={0.28} opacity={0.5} />
    </mesh>)}
    {[-2, 0, 2].map(x => <mesh key={x} position={[x, 0.02, 0.5]}><boxGeometry args={[0.07, 0.025, 0.88]} /><Material color="#d2bb91" emissive="#786c52" glow={0.22} /></mesh>)}
    <RainCurtain seconds={seconds} />
    <pointLight position={[-3.8, 3.8, 2.3]} color="#2bbad7" intensity={8} distance={15} decay={2} />
    <pointLight position={[3.8, 3.2, 2.1]} color="#ff5285" intensity={7} distance={14} decay={2} />
    <pointLight position={[0, 4.4, -3.4]} color="#e9b779" intensity={4} distance={12} decay={2} />
  </group>
}

function MechanicalCabin() {
  return <group>
    <InteriorShell width={14} depth={11} accent="#f28c47" />
    <Floor color="#202832" width={14} depth={11} />
    {[-1, 1].map(side => <group key={side} position={[side * 4.2, 0, -0.8]}>
      <mesh position={[0, 2.0, 0]}><boxGeometry args={[0.48, 4, 0.72]} /><Material color="#46525d" metalness={0.86} /></mesh>
      <mesh position={[side * 0.45, 3.7, 0]}><boxGeometry args={[1.25, 0.45, 0.72]} /><Material color="#384651" metalness={0.78} /></mesh>
      <mesh position={[side * 0.65, 2.1, 0.38]}><boxGeometry args={[0.09, 3.2, 0.04]} /><Material color="#f28c47" emissive="#d6532f" glow={0.75} /></mesh>
    </group>)}
    <mesh position={[0, 3.5, -2.6]}><torusGeometry args={[2.7, 0.16, 8, 32, Math.PI]} /><Material color="#76848c" metalness={0.9} /></mesh>
    <Console position={[0, 0, 2.8]} width={4.1} color="#ff7b43" />
    {[-2.1, 2.0].map(x => <mesh key={x} position={[x, 1.45, 0.1]} rotation={[0.4, 0, x < 0 ? 0.25 : -0.3]}><dodecahedronGeometry args={[0.68, 0]} /><Material color="#4d5963" metalness={0.48} roughness={0.72} /></mesh>)}
  </group>
}

function BoundaryBlindZone() {
  return <group>
    <Floor color="#101a27" width={16} depth={12} />
    {[-5.8, -2.9, 0, 2.9, 5.8].map(x => <group key={x} position={[x, 0, -1.6]}>
      <mesh position={[0, 2.2, 0]}><cylinderGeometry args={[0.2, 0.32, 4.4, 8]} /><Material color="#354451" metalness={0.86} /></mesh>
      <mesh position={[0, 4.35, 0]}><torusGeometry args={[0.78, 0.055, 6, 24]} /><Material color="#38cde1" emissive="#28bbd8" glow={1.1} /></mesh>
      <mesh position={[0, 3.5, 0]}><sphereGeometry args={[0.12, 10, 8]} /><Material color="#ffc46f" emissive="#ff9e4a" glow={1.4} /></mesh>
    </group>)}
    {[0.8, 1.7, 2.6].map(y => <mesh key={y} position={[0, y, -1.6]}><boxGeometry args={[12.8, 0.025, 0.025]} /><Material color="#28cbde" emissive="#28cbde" glow={0.9} opacity={0.68} /></mesh>)}
  </group>
}

/** Location-specific, procedural set dressing keyed to the source sheet's numbered locations. */
export function XrCinemaLocationSet({ locationIndex, seconds = 0 }: { locationIndex: number; seconds?: number }) {
  const scene = locationIndex === 1 ? <group>
    <ObservationDeck />
    <RainCurtain seconds={seconds} />
    <pointLight position={[-2.6, 5.8, 3]} color="#9bc6e4" intensity={18} distance={30} decay={2} />
    <pointLight position={[4.8, 3.6, -2]} color="#f2b878" intensity={9} distance={22} decay={2} />
  </group>
    : locationIndex === 2 ? <group><InteriorShell width={14} depth={10} /><Floor /><MonitorWall /><Console position={[0, 0, 2.25]} width={5} />{[-6, 6].map(x => <mesh key={x} position={[x, 1.8, -2.4]}><boxGeometry args={[0.75, 3.6, 0.8]} /><Material color="#273d4a" metalness={0.8} /></mesh>)}</group>
      : locationIndex === 3 ? <Boardroom />
        : locationIndex === 7 ? <Laboratory />
          : locationIndex === 11 ? <SignalPlatform />
            : locationIndex === 12 ? <CableBase />
              : locationIndex === 19 ? <OldTownStreet seconds={seconds} />
                : locationIndex === 23 ? <MechanicalCabin />
                  : locationIndex === 25 ? <BoundaryBlindZone /> : <group><Floor /><MonitorWall count={4} /></group>
  return <group name={`agentic_os_xr_cinema_location_set_${locationIndex}`} userData={{ sourceSheetLocation: locationIndex, timelineSeconds: seconds }}>{scene}</group>
}
