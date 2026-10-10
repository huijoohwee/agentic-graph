import React from 'react'
import { DoubleSide, Vector2 } from 'three'

type PropSize = readonly [number, number, number]
const UPRIGHT: [number, number, number] = [Math.PI / 2, 0, 0]

function Wall({ color, roughness = 0.86, metalness = 0.02 }: { color: string; roughness?: number; metalness?: number }) {
  return <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
}

function GabledRoof({ width, depth, eave, ridge, color, tileColors, name }: {
  width: number; depth: number; eave: number; ridge: number; color: string; tileColors: readonly string[]; name: string
}) {
  const halfRun = width * 0.54
  const rise = ridge - eave
  const slopeLength = Math.hypot(halfRun, rise)
  const angle = Math.atan2(rise, halfRun)
  const rows = 5
  const columns = 5
  return <group name={name}>
    {([-1, 1] as const).map(side => <group key={side}
      position={[side * halfRun / 2, 0, (ridge + eave) / 2]}
      rotation={[0, side * angle, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[slopeLength, depth * 1.08, Math.max(0.035, rise * 0.09)]} />
        <Wall color={color} roughness={0.92} />
      </mesh>
      {Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => (
        <mesh key={`${row}:${column}`}
          position={[
            (row + 0.5) * slopeLength / rows - slopeLength / 2,
            (column + 0.5) * depth * 0.9 / columns - depth * 0.45,
            rise * 0.047 + 0.012,
          ]}
          castShadow>
          <boxGeometry args={[slopeLength / rows * 1.04, depth * 0.9 / columns * 1.04, Math.max(0.035, rise * 0.055)]} />
          <Wall color={tileColors[(row + column * 2) % tileColors.length]} roughness={0.94} />
        </mesh>
      )))}
    </group>)}
    <mesh position={[0, 0, ridge + rise * 0.018]} rotation={UPRIGHT} castShadow>
      <cylinderGeometry args={[Math.max(0.035, width * 0.025), Math.max(0.035, width * 0.025), depth * 1.12, 8]} />
      <Wall color={color} roughness={0.92} />
    </mesh>
  </group>
}

function StrawHouse({ color, size }: { color: string; size: PropSize }) {
  const [width, height, depth] = size
  const thatch = color
  const stalks = ['#d8b65f', '#cda64f', '#e8c876', '#bd9345']
  return (
    <group name="agentic_os_xr_procedural_straw_house">
      <mesh position={[0, 0, height * 0.055]} castShadow receiveShadow>
        <boxGeometry args={[width * 0.98, depth * 0.94, height * 0.1]} />
        <Wall color="#80603a" roughness={1} />
      </mesh>
      <mesh position={[0, 0, height * 0.31]} castShadow receiveShadow>
        <boxGeometry args={[width * 0.88, depth * 0.82, height * 0.52]} />
        <Wall color={thatch} roughness={1} />
      </mesh>
      {Array.from({ length: 6 }, (_, row) => ([-1, 1] as const).map(side => (
        <mesh key={`${row}:${side}`}
          position={[0, side * depth * 0.426, height * (0.12 + row * 0.074)]}
          rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[height * 0.022, height * 0.024, width * 0.9, 8]} />
          <Wall color={stalks[(row + (side > 0 ? 1 : 0)) % stalks.length]} roughness={1} />
        </mesh>
      )))}
      <GabledRoof name="agentic_os_xr_straw_thatch_roof" width={width} depth={depth} eave={height * 0.58} ridge={height * 0.91} color="#9e7838" tileColors={stalks} />
      <mesh position={[0, depth * 0.43, height * 0.22]} castShadow>
        <boxGeometry args={[width * 0.24, depth * 0.045, height * 0.39]} />
        <Wall color="#5b3820" roughness={0.94} />
      </mesh>
      <mesh position={[0, depth * 0.456, height * 0.44]}>
        <boxGeometry args={[width * 0.31, depth * 0.025, height * 0.055]} />
        <Wall color="#604122" roughness={0.94} />
      </mesh>
      {[-1, 1].map(side => <mesh key={side} position={[side * width * 0.3, depth * 0.458, height * 0.39]}>
        <boxGeometry args={[width * 0.08, depth * 0.026, height * 0.055]} />
        <meshStandardMaterial color="#b6d8dc" roughness={0.24} metalness={0.08} />
      </mesh>)}
      {[-1, 1].map(side => <mesh key={`post:${side}`} position={[side * width * 0.42, depth * 0.44, height * 0.3]}>
        <boxGeometry args={[width * 0.065, depth * 0.06, height * 0.48]} />
        <Wall color="#9f7541" roughness={0.94} />
      </mesh>)}
    </group>
  )
}

function StickHouse({ color, size }: { color: string; size: PropSize }) {
  const [width, height, depth] = size
  const timber = color
  const bark = '#6b4423'
  const log = (key: string, position: [number, number, number], rotation: [number, number, number], length: number, radius = width * 0.052, tint = timber) => (
    <mesh key={key} position={position} rotation={rotation} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius * 1.06, length, 10]} />
      <Wall color={tint} roughness={0.95} />
    </mesh>
  )
  return (
    <group name="agentic_os_xr_procedural_stick_house">
      <mesh position={[0, 0, height * 0.05]} receiveShadow>
        <boxGeometry args={[width * 0.98, depth * 0.92, height * 0.1]} />
        <Wall color={bark} roughness={0.9} />
      </mesh>
      {[-1, 1].flatMap(x => [-1, 1].map(y => (
        <mesh key={`post:${x}:${y}`} position={[x * width * 0.38, y * depth * 0.34, height * 0.34]} rotation={UPRIGHT} castShadow>
          <cylinderGeometry args={[width * 0.05, width * 0.06, height * 0.68, 8]} />
          <Wall color={bark} roughness={0.94} />
        </mesh>
      )))}
      {Array.from({ length: 6 }, (_, row) => {
        const z = height * (0.14 + row * 0.085)
        const tone = row % 2 ? timber : bark
        return [
          log(`front:${row}`, [0, depth * 0.37, z], [0, 0, Math.PI / 2], width * 0.96, width * 0.052, tone),
          log(`back:${row}`, [0, -depth * 0.37, z], [0, 0, Math.PI / 2], width * 0.96, width * 0.052, tone),
          log(`left:${row}`, [-width * 0.4, 0, z], [0, 0, 0], depth * 0.9, width * 0.052, tone),
          log(`right:${row}`, [width * 0.4, 0, z], [0, 0, 0], depth * 0.9, width * 0.052, tone),
        ]
      })}
      <GabledRoof name="agentic_os_xr_timber_shingle_roof" width={width * 1.08} depth={depth * 1.06} eave={height * 0.68} ridge={height * 0.94} color="#503723" tileColors={['#725036', '#805c3b', '#61442f', '#916940']} />
      <mesh position={[0, depth * 0.38, height * 0.22]} castShadow>
        <boxGeometry args={[width * 0.24, depth * 0.05, height * 0.4]} />
        <Wall color="#3f2a18" roughness={0.82} />
      </mesh>
      <mesh position={[width * 0.22, depth * 0.38, height * 0.42]} castShadow>
        <boxGeometry args={[width * 0.16, depth * 0.04, height * 0.16]} />
        <meshStandardMaterial color="#7dd3fc" roughness={0.22} metalness={0.08} />
      </mesh>
      <mesh position={[width * 0.22, depth * 0.405, height * 0.42]}>
        <boxGeometry args={[width * 0.18, depth * 0.03, height * 0.025]} />
        <Wall color="#c59a63" roughness={0.82} />
      </mesh>
      <mesh position={[width * 0.28, -depth * 0.08, height * 0.92]} rotation={UPRIGHT} castShadow>
        <cylinderGeometry args={[width * 0.075, width * 0.095, height * 0.34, 8]} />
        <Wall color={bark} roughness={0.86} />
      </mesh>
      {Array.from({ length: 3 }, (_, row) => <mesh key={`chimney:${row}`} position={[width * 0.28, -depth * 0.08, height * (0.84 + row * 0.065)]}>
        <boxGeometry args={[width * 0.14, depth * 0.15, height * 0.035]} />
        <Wall color={row % 2 ? '#79583b' : '#4f3829'} roughness={0.92} />
      </mesh>)}
    </group>
  )
}

function BrickHouse({ color, size }: { color: string; size: PropSize }) {
  const [width, height, depth] = size
  const brick = color
  const mortar = '#cbb9a5'
  const courses = 7
  const cols = 7
  const brickTones = [brick, '#bd5d47', '#d17c61', '#b85f4c']
  return (
    <group name="agentic_os_xr_procedural_brick_house">
      <mesh position={[0, 0, height * 0.31]} receiveShadow>
        <boxGeometry args={[width * 0.94, depth * 0.9, height * 0.62]} />
        <Wall color={mortar} roughness={0.9} />
      </mesh>
      {Array.from({ length: courses }, (_, row) => Array.from({ length: cols }, (_, col) => {
        const stagger = row % 2 ? 0.5 : 0
        const x = ((col + 0.5 + stagger) / cols - 0.5) * width * 0.92
        const z = height * (0.1 + row * 0.083)
        return <React.Fragment key={`front:${row}:${col}`}>
          <mesh position={[x, depth * 0.461, z]} castShadow>
            <boxGeometry args={[width * 0.13, depth * 0.035, height * 0.069]} />
            <Wall color={brickTones[(row * 3 + col * 5) % brickTones.length]} roughness={0.9} />
          </mesh>
          <mesh position={[x, -depth * 0.461, z]} castShadow>
            <boxGeometry args={[width * 0.13, depth * 0.035, height * 0.069]} />
            <Wall color={brickTones[(row * 5 + col * 3 + 1) % brickTones.length]} roughness={0.9} />
          </mesh>
        </React.Fragment>
      }))}
      {Array.from({ length: courses }, (_, row) => Array.from({ length: 6 }, (_, col) => {
        const stagger = row % 2 ? 0.5 : 0
        const y = ((col + 0.5 + stagger) / 6 - 0.5) * depth * 0.9
        const z = height * (0.1 + row * 0.083)
        return [-1, 1].map(side => <mesh key={`${side}:${row}:${col}`} position={[side * width * 0.477, y, z]} castShadow>
          <boxGeometry args={[width * 0.035, depth * 0.15, height * 0.069]} />
          <Wall color={brickTones[(row * 2 + col * 3 + (side > 0 ? 1 : 0)) % brickTones.length]} roughness={0.9} />
        </mesh>)
      }))}
      <GabledRoof name="agentic_os_xr_brick_roof" width={width * 1.08} depth={depth * 1.08} eave={height * 0.66} ridge={height * 0.94} color="#852e25" tileColors={['#8f3328', '#a84334', '#76281f', '#a64d3e']} />
      <mesh position={[width * 0.27, -depth * 0.1, height * 0.88]} castShadow>
        <boxGeometry args={[width * 0.16, depth * 0.18, height * 0.34]} />
        <Wall color="#a94d3b" roughness={0.86} />
      </mesh>
      {Array.from({ length: 4 }, (_, row) => <mesh key={`chimney:${row}`} position={[width * 0.27, -depth * 0.1, height * (0.78 + row * 0.065)]}>
        <boxGeometry args={[width * 0.17, depth * 0.19, height * 0.025]} />
        <Wall color={brickTones[row % brickTones.length]} roughness={0.88} />
      </mesh>)}
      <mesh position={[0, depth * 0.478, height * 0.19]} castShadow>
        <boxGeometry args={[width * 0.22, depth * 0.04, height * 0.38]} />
        <Wall color="#4a3026" roughness={0.86} />
      </mesh>
      <mesh position={[0, depth * 0.502, height * 0.19]}>
        <boxGeometry args={[width * 0.19, depth * 0.025, height * 0.35]} />
        <Wall color="#694333" roughness={0.82} />
      </mesh>
      {[-0.24, 0.24].map(x => <group key={`window:${x}`}>
        <mesh position={[x * width, depth * 0.477, height * 0.43]} castShadow>
          <boxGeometry args={[width * 0.17, depth * 0.04, height * 0.16]} />
          <Wall color="#5c3b2d" roughness={0.8} />
        </mesh>
        <mesh position={[x * width, depth * 0.501, height * 0.43]}>
          <boxGeometry args={[width * 0.13, depth * 0.018, height * 0.12]} />
          <meshStandardMaterial color="#a9ddeb" roughness={0.18} metalness={0.08} />
        </mesh>
        <mesh position={[x * width, depth * 0.515, height * 0.43]}>
          <boxGeometry args={[width * 0.025, depth * 0.02, height * 0.14]} />
          <Wall color="#f0d6af" roughness={0.82} />
        </mesh>
      </group>)}
    </group>
  )
}

function SoupPot({ color, size }: { color: string; size: PropSize }) {
  const [width, height] = size
  const radius = Math.max(width, height) * 0.38
  const profile = [
    new Vector2(0, 0),
    new Vector2(radius * 0.66, 0),
    new Vector2(radius * 0.84, radius * 0.12),
    new Vector2(radius, radius * 0.58),
    new Vector2(radius * 0.96, radius * 0.94),
    new Vector2(radius * 1.08, radius * 0.98),
    new Vector2(radius * 1.04, radius * 1.08),
    new Vector2(radius * 0.88, radius * 1.08),
    new Vector2(radius * 0.82, radius * 0.96),
    new Vector2(radius * 0.78, radius * 0.62),
    new Vector2(radius * 0.62, radius * 0.2),
    new Vector2(0, radius * 0.2),
  ]
  return (
    <group name="agentic_os_xr_procedural_soup_pot">
      <mesh position={[0, 0, radius * 0.08]} rotation={UPRIGHT} castShadow receiveShadow>
        <latheGeometry args={[profile, 28]} />
        <meshStandardMaterial color={color} side={DoubleSide} roughness={0.34} metalness={0.62} />
      </mesh>
      <mesh position={[0, 0, radius * 0.93]}>
        <circleGeometry args={[radius * 0.76, 28]} />
        <meshStandardMaterial color="#e7a432" emissive="#a74d13" emissiveIntensity={0.22} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0, radius * 1.15]}>
        <torusGeometry args={[radius * 1.02, radius * 0.065, 10, 28]} />
        <Wall color="#aebbc4" roughness={0.32} metalness={0.72} />
      </mesh>
      {[-1, 1].map(side => <group key={side} position={[side * radius * 0.96, 0, radius * 0.78]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[radius * 0.22, radius * 0.055, 8, 18]} /><Wall color="#98a6b0" roughness={0.35} metalness={0.7} /></mesh>
        <mesh position={[-side * radius * 0.1, 0, 0]} rotation={[0, Math.PI / 2, 0]}><cylinderGeometry args={[radius * 0.055, radius * 0.055, radius * 0.18, 12]} /><Wall color="#778692" roughness={0.38} metalness={0.68} /></mesh>
      </group>)}
      {[-1, 1].map(side => <mesh key={`foot:${side}`} position={[side * radius * 0.48, 0, radius * 0.08]} rotation={[0, 0, side * 0.15]}>
        <boxGeometry args={[radius * 0.24, radius * 0.2, radius * 0.16]} />
        <Wall color="#657482" roughness={0.5} metalness={0.48} />
      </mesh>)}
    </group>
  )
}

function Crate({ color, size }: { color: string; size: PropSize }) {
  const [width, height, depth] = size
  return (
    <group name="agentic_os_xr_procedural_crate">
      <mesh position={[0, 0, height * 0.5]} castShadow receiveShadow>
        <boxGeometry args={[width, depth, height]} />
        <Wall color={color} roughness={0.84} />
      </mesh>
      {[-0.46, 0.46].map(edge => (
        <mesh key={edge} position={[0, 0, height * (0.5 + edge * 0.08)]} castShadow>
          <boxGeometry args={[width * 1.04, depth * 1.04, height * 0.08]} />
          <Wall color="#57534e" roughness={0.7} metalness={0.12} />
        </mesh>
      ))}
    </group>
  )
}

export function resolveXrProceduralPropKind(label: string): 'straw-house' | 'stick-house' | 'brick-house' | 'soup-pot' | 'crate' {
  const text = label.toLowerCase()
  if (text.includes('straw')) return 'straw-house'
  if (text.includes('stick')) return 'stick-house'
  if (text.includes('brick')) return 'brick-house'
  if (text.includes('pot') || text.includes('cauldron')) return 'soup-pot'
  return 'crate'
}

export function XrProceduralHouseGeometry({
  color,
  label,
  size,
}: {
  color: string
  label?: string
  size: PropSize
}) {
  const kind = resolveXrProceduralPropKind(label || '')
  if (kind === 'straw-house') return <StrawHouse color={color} size={size} />
  if (kind === 'stick-house') return <StickHouse color={color} size={size} />
  if (kind === 'brick-house') return <BrickHouse color={color} size={size} />
  if (kind === 'soup-pot') return <SoupPot color={color} size={size} />
  return <Crate color={color} size={size} />
}
