import React from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { readSharedXrNativeControllerDemoFrame } from './xrNativeControllerDemoRuntime'

const STRIPE_COLORS = ['#f5e8d5', '#a94d63'] as const

function HorizonPalm({ x, z, scale, lean = 0 }: {
  x: number
  z: number
  scale: number
  lean?: number
}) {
  return (
    <group position={[x, 0, z]} scale={scale} rotation={[0, 0, lean]}>
      <mesh position={[0, 1.25, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.2, 2.5, 6]} />
        <meshStandardMaterial color="#724831" roughness={0.94} flatShading />
      </mesh>
      <group position={[0, 2.55, 0]}>
        {Array.from({ length: 6 }, (_, index) => {
          const angle = index * Math.PI / 3
          return (
            <mesh
              key={angle}
              position={[Math.cos(angle) * 0.52, 0, Math.sin(angle) * 0.52]}
              rotation={[0, -angle, -1.18]}
              castShadow
            >
              <coneGeometry args={[0.3, 1.7, 4]} />
              <meshStandardMaterial color={index % 2 ? '#358c50' : '#4ca55c'} roughness={0.9} flatShading />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

function NorthHorizon() {
  const palms = [
    [-12.2, -0.4, 1.05, -0.06], [-9.8, 0.2, 0.82, 0.08], [-7.1, -0.6, 0.92, -0.04],
    [7.2, -0.4, 0.86, 0.06], [9.6, 0.3, 1.08, -0.08], [12.1, -0.5, 0.88, 0.1],
  ] as const
  return (
    <group position={[0, -1, -31]} name="agentic_os_xr_playground_north_horizon">
      <mesh position={[-10.4, 4.2, 1]} scale={[1.15, 1, 0.76]} castShadow>
        <coneGeometry args={[5.4, 10.2, 7]} />
        <meshStandardMaterial color="#47735d" roughness={1} flatShading />
      </mesh>
      <mesh position={[10.2, 4.5, 1.2]} scale={[1.1, 1, 0.8]} castShadow>
        <coneGeometry args={[5.6, 11, 7]} />
        <meshStandardMaterial color="#5d865f" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 6.2, -0.2]} scale={[1, 1, 0.8]} castShadow>
        <coneGeometry args={[7.5, 15.4, 10]} />
        <meshStandardMaterial color="#86575d" roughness={0.96} flatShading />
      </mesh>
      <mesh position={[-1.7, 6.5, 0.15]} rotation={[0, 0, -0.12]} scale={[0.42, 1, 0.25]}>
        <coneGeometry args={[5.9, 13.3, 6]} />
        <meshStandardMaterial color="#a16664" roughness={0.98} flatShading />
      </mesh>
      <mesh position={[1.8, 6.25, 0.12]} rotation={[0, 0, 0.13]} scale={[0.38, 1, 0.24]}>
        <coneGeometry args={[5.6, 12.9, 6]} />
        <meshStandardMaterial color="#6f4c58" roughness={0.98} flatShading />
      </mesh>
      <mesh position={[0, 13.86, -0.2]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.42, 0.47, 6, 12]} />
        <meshStandardMaterial color="#68464e" roughness={0.92} flatShading />
      </mesh>
      <mesh position={[0, 13.81, -0.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.15, 12]} />
        <meshStandardMaterial color="#342f39" roughness={1} />
      </mesh>
      {[-13, -10.8, -8.6, -6.3, 6.2, 8.4, 10.8, 13].map((x, index) => (
        <mesh key={x} position={[x, 1.05 + index % 2 * 0.35, 1.6]} scale={[1.55, 1 + index % 3 * 0.16, 0.82]}>
          <dodecahedronGeometry args={[1.25, 0]} />
          <meshStandardMaterial color={index % 2 ? '#376f51' : '#4c8357'} roughness={1} flatShading />
        </mesh>
      ))}
      {palms.map(([x, z, scale, lean]) => <HorizonPalm key={x} x={x} z={z} scale={scale} lean={lean} />)}
    </group>
  )
}

function StripedSail({ position, width, rows = 7 }: {
  position: [number, number, number]
  width: number
  rows?: number
}) {
  return (
    <group position={position}>
      {Array.from({ length: rows }, (_, index) => {
        const distanceFromCenter = Math.abs(index - (rows - 1) / 2)
        const stripeWidth = width - distanceFromCenter * 0.25
        return (
          <mesh key={index} position={[0, (rows - 1) * 0.24 / 2 - index * 0.24, 0]} castShadow>
            <boxGeometry args={[stripeWidth, 0.27, 0.075]} />
            <meshStandardMaterial color={STRIPE_COLORS[index % 2]} roughness={0.82} flatShading />
          </mesh>
        )
      })}
    </group>
  )
}

function PirateShip() {
  return (
    <group position={[17.3, -0.55, -2.2]} rotation={[0, -0.16, 0]} name="agentic_os_xr_playground_east_shore_ship">
      <mesh position={[0, 0.25, 0]} scale={[2.15, 0.85, 4.8]} castShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#744733" roughness={0.88} flatShading />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.15, 0.22, 6.7]} />
        <meshStandardMaterial color="#b8794f" roughness={0.9} />
      </mesh>
      {[-2.25, 1.25].map((z, index) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0, 3.2, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.16, 5.2 - index * 0.6, 7]} />
            <meshStandardMaterial color="#60402f" roughness={0.92} flatShading />
          </mesh>
          <StripedSail position={[0, 3.45 - index * 0.15, -0.06]} width={3.2 - index * 0.35} rows={index ? 6 : 7} />
        </group>
      ))}
      <mesh position={[0, 4.95, -2.25]}>
        <boxGeometry args={[1.15, 0.7, 0.05]} />
        <meshStandardMaterial color="#293846" roughness={0.88} />
      </mesh>
      <mesh position={[0, 1.35, 2.5]} castShadow>
        <boxGeometry args={[2.3, 1, 1.25]} />
        <meshStandardMaterial color="#8e583c" roughness={0.9} />
      </mesh>
      {[-1.35, 1.35].map(x => (
        <group key={x} position={[x, 1.35, 0]}>
          {[-2.8, -1.4, 0, 1.4, 2.8].map(z => (
            <mesh key={z} position={[0, 0, z]}>
              <cylinderGeometry args={[0.045, 0.055, 0.75, 5]} />
              <meshStandardMaterial color="#5b3d2f" roughness={0.95} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function DeterministicTentacles() {
  const roots = React.useRef<Array<Group | null>>([])
  useFrame(() => {
    const elapsedSeconds = readSharedXrNativeControllerDemoFrame().elapsedSeconds
    roots.current.forEach((root, tentacleIndex) => {
      if (!root) return
      root.children.forEach((segment, segmentIndex) => {
        const reach = (segmentIndex + 0.5) / root.children.length
        const phase = elapsedSeconds * (0.62 + tentacleIndex * 0.08) + tentacleIndex * 2.4
        segment.position.x = Math.sin(phase + reach * 2.1) * (0.3 + reach * 1.25)
        segment.position.y = segmentIndex * 0.76
        segment.position.z = Math.cos(phase * 0.72 + reach * 2.7) * (0.18 + reach * 0.65)
        segment.rotation.z = -Math.sin(phase + reach * 2.1) * (0.16 + reach * 0.34)
        segment.rotation.x = Math.cos(phase * 0.72 + reach * 2.7) * reach * 0.22
      })
    })
  })
  return (
    <group name="agentic_os_xr_playground_deterministic_tentacles">
      {[[20.6, -0.85, -5.3], [20.8, -0.85, 1.9]].map((position, tentacleIndex) => (
        <group
          key={tentacleIndex}
          ref={node => { roots.current[tentacleIndex] = node }}
          position={position as [number, number, number]}
          rotation={[0, tentacleIndex ? -0.4 : 0.35, tentacleIndex ? -0.18 : 0.18]}
        >
          {Array.from({ length: 8 }, (_, segmentIndex) => (
            <group key={segmentIndex}>
              <mesh castShadow>
                <cylinderGeometry args={[0.33 - segmentIndex * 0.023, 0.4 - segmentIndex * 0.024, 0.9, 7]} />
                <meshStandardMaterial color={segmentIndex % 2 ? '#9c4c91' : '#b65a9f'} roughness={0.74} flatShading />
              </mesh>
              <mesh position={[tentacleIndex ? -0.31 : 0.31, -0.08, 0]} rotation={[0, Math.PI / 2, 0]}>
                <torusGeometry args={[0.12, 0.04, 5, 9]} />
                <meshStandardMaterial color="#ed9ac0" roughness={0.64} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  )
}

export function XrNativeControllerDemoAerialSetpieces() {
  return (
    <group name="agentic_os_xr_playground_aerial_setpieces">
      <NorthHorizon />
      <PirateShip />
      <DeterministicTentacles />
    </group>
  )
}
