import React from 'react'
import { DoubleSide } from 'three'

type PropSize = readonly [number, number, number]
const UPRIGHT: [number, number, number] = [Math.PI / 2, 0, 0]

function Wall({ color, roughness = 0.86, metalness = 0.02 }: { color: string; roughness?: number; metalness?: number }) {
  return <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
}

function StrawHouse({ color, size }: { color: string; size: PropSize }) {
  const [width, height, depth] = size
  const thatch = color
  const stalk = '#c4a35a'
  return (
    <group name="agentic_os_xr_procedural_straw_house">
      <mesh position={[0, 0, height * 0.28]} castShadow receiveShadow>
        <boxGeometry args={[width * 0.92, depth * 0.88, height * 0.54]} />
        <Wall color={thatch} roughness={0.98} />
      </mesh>
      {[-0.28, 0, 0.28].flatMap(x => [-0.22, 0.22].map(y => (
        <mesh key={`${x}:${y}`} position={[x * width, y * depth, height * 0.3]} rotation={[Math.PI / 2 + 0.18, x * 0.4, y * 0.12]} castShadow>
          <cylinderGeometry args={[width * 0.045, width * 0.06, height * 0.62, 6]} />
          <Wall color={stalk} roughness={1} />
        </mesh>
      )))}
      <mesh position={[0, 0, height * 0.72]} rotation={UPRIGHT} castShadow>
        <coneGeometry args={[width * 0.72, height * 0.48, 7]} />
        <Wall color={thatch} roughness={1} />
      </mesh>
      <mesh position={[0, depth * 0.46, height * 0.22]} castShadow>
        <boxGeometry args={[width * 0.22, depth * 0.04, height * 0.38]} />
        <Wall color="#6b4a2a" roughness={0.9} />
      </mesh>
    </group>
  )
}

function StickHouse({ color, size }: { color: string; size: PropSize }) {
  const [width, height, depth] = size
  const timber = color
  const bark = '#6b4423'
  const log = (key: string, position: [number, number, number], rotation: [number, number, number], length: number, radius = width * 0.055) => (
    <mesh key={key} position={position} rotation={rotation} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius * 1.08, length, 8]} />
      <Wall color={timber} roughness={0.92} />
    </mesh>
  )
  return (
    <group name="agentic_os_xr_procedural_stick_house">
      <mesh position={[0, 0, height * 0.05]} receiveShadow>
        <boxGeometry args={[width * 0.96, depth * 0.86, height * 0.08]} />
        <Wall color={bark} roughness={0.9} />
      </mesh>
      {[-1, 1].flatMap(x => [-1, 1].map(y => (
        <mesh key={`post:${x}:${y}`} position={[x * width * 0.38, y * depth * 0.34, height * 0.34]} rotation={UPRIGHT} castShadow>
          <cylinderGeometry args={[width * 0.05, width * 0.06, height * 0.68, 8]} />
          <Wall color={bark} roughness={0.94} />
        </mesh>
      )))}
      {[0.18, 0.34, 0.5].flatMap((z, row) => (
        [-1, 1].map(side => log(
          `x:${row}:${side}`,
          [0, side * depth * 0.36, height * z],
          [0, 0, Math.PI / 2],
          width * 0.82,
        ))
      ))}
      {[0.18, 0.34, 0.5].flatMap((z, row) => (
        [-1, 1].map(side => log(
          `y:${row}:${side}`,
          [side * width * 0.4, 0, height * z],
          [0, 0, 0],
          depth * 0.72,
        ))
      ))}
      <mesh position={[0, depth * 0.22, height * 0.78]} rotation={[-0.52, 0, 0]} castShadow>
        <boxGeometry args={[width * 0.98, depth * 0.58, height * 0.08]} />
        <Wall color={bark} roughness={0.88} />
      </mesh>
      <mesh position={[0, -depth * 0.22, height * 0.78]} rotation={[0.52, 0, 0]} castShadow>
        <boxGeometry args={[width * 0.98, depth * 0.58, height * 0.08]} />
        <Wall color={timber} roughness={0.86} />
      </mesh>
      <mesh position={[0, depth * 0.38, height * 0.22]} castShadow>
        <boxGeometry args={[width * 0.24, depth * 0.05, height * 0.4]} />
        <Wall color="#3f2a18" roughness={0.82} />
      </mesh>
      <mesh position={[width * 0.22, depth * 0.38, height * 0.42]} castShadow>
        <boxGeometry args={[width * 0.16, depth * 0.04, height * 0.16]} />
        <meshStandardMaterial color="#7dd3fc" roughness={0.22} metalness={0.08} />
      </mesh>
      <mesh position={[width * 0.28, -depth * 0.08, height * 0.92]} rotation={UPRIGHT} castShadow>
        <cylinderGeometry args={[width * 0.07, width * 0.09, height * 0.28, 7]} />
        <Wall color={bark} roughness={0.86} />
      </mesh>
    </group>
  )
}

function BrickHouse({ color, size }: { color: string; size: PropSize }) {
  const [width, height, depth] = size
  const brick = color
  const mortar = '#d6c4b0'
  const courses = 4
  const cols = 5
  return (
    <group name="agentic_os_xr_procedural_brick_house">
      <mesh position={[0, 0, height * 0.3]} receiveShadow>
        <boxGeometry args={[width * 0.94, depth * 0.9, height * 0.58]} />
        <Wall color={mortar} roughness={0.9} />
      </mesh>
      {Array.from({ length: courses }, (_, row) => (
        Array.from({ length: cols }, (_, col) => {
          const stagger = row % 2 ? 0.5 : 0
          return (
            <mesh
              key={`${row}:${col}`}
              position={[
                ((col + 0.5 + stagger) / cols - 0.5) * width * 0.9,
                depth * 0.46,
                height * (0.12 + row * 0.12),
              ]}
              castShadow
            >
              <boxGeometry args={[width * 0.16, depth * 0.05, height * 0.1]} />
              <Wall color={brick} roughness={0.78} />
            </mesh>
          )
        })
      ))}
      <mesh position={[0, 0, height * 0.78]} rotation={UPRIGHT} castShadow>
        <coneGeometry args={[width * 0.72, height * 0.38, 4]} />
        <Wall color="#9a3412" roughness={0.7} />
      </mesh>
      <mesh position={[width * 0.22, depth * 0.08, height * 0.86]} castShadow>
        <boxGeometry args={[width * 0.14, depth * 0.14, height * 0.28]} />
        <Wall color={brick} roughness={0.74} />
      </mesh>
      <mesh position={[0, depth * 0.47, height * 0.2]} castShadow>
        <boxGeometry args={[width * 0.2, depth * 0.04, height * 0.36]} />
        <Wall color="#1e293b" roughness={0.7} />
      </mesh>
      {[-0.22, 0.22].map(x => (
        <mesh key={x} position={[x * width, depth * 0.47, height * 0.42]} castShadow>
          <boxGeometry args={[width * 0.14, depth * 0.03, height * 0.14]} />
          <meshStandardMaterial color="#bae6fd" roughness={0.18} metalness={0.12} />
        </mesh>
      ))}
    </group>
  )
}

function SoupPot({ color, size }: { color: string; size: PropSize }) {
  const [width, height] = size
  const radius = Math.max(width, height) * 0.38
  return (
    <group name="agentic_os_xr_procedural_soup_pot">
      <mesh position={[0, 0, radius * 0.72]} rotation={UPRIGHT} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius * 0.82, radius * 1.15, 16, 1, true]} />
        <meshStandardMaterial color={color} side={DoubleSide} roughness={0.42} metalness={0.28} />
      </mesh>
      <mesh position={[0, 0, radius * 1.28]} rotation={[0, 0, 0]}>
        <torusGeometry args={[radius * 0.92, radius * 0.08, 8, 20]} />
        <Wall color="#334155" roughness={0.5} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0, radius * 1.18]} rotation={UPRIGHT}>
        <cylinderGeometry args={[radius * 0.78, radius * 0.78, radius * 0.08, 16]} />
        <meshStandardMaterial color="#f59e0b" emissive="#b45309" emissiveIntensity={0.45} roughness={0.35} />
      </mesh>
      {[-1, 1].map(side => <mesh key={side} position={[side * radius * 1.05, 0, radius * 0.85]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[radius * 0.26, radius * 0.07, 6, 12]} /><Wall color={color} metalness={0.3} /></mesh>)}
      <pointLight color="#fbbf24" intensity={1.4} distance={2.8} position={[0, 0, radius * 1.4]} />
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
