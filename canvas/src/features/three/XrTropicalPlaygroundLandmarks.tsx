import React from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide, type Group } from 'three'
import { readSharedXrNativeControllerDemoFrame } from './xrNativeControllerDemoRuntime'

const PALMS = [
  [-8.8, -8.8, 1.25, -0.08],
  [7.5, -9, 1.05, 0.1],
  [11.2, -6.6, 1.18, -0.1],
  [-12.1, 3.6, 0.95, 0.14],
  [12.2, 3.3, 0.88, -0.12],
  [-10.4, -4.2, 0.82, 0.09],
  [9.6, 6.1, 0.78, -0.07],
  [-5.6, 8.4, 0.7, 0.11],
  [4.8, 8.8, 0.66, -0.09],
  [-3.2, -9.6, 0.92, 0.05],
  [1.4, -10.2, 0.74, -0.06],
  [13.1, -1.8, 0.8, 0.08],
] as const

const ROCKS = [
  [-6.8, 1.25, -9.5, 3.1, 1.8, 1.4, '#66747a'],
  [0, 1.35, -10, 4.3, 2.1, 1.25, '#66747a'],
  [6.4, 1.2, -9.6, 2.4, 1.8, 1.5, '#66747a'],
  [11.8, 0.8, -1.5, 1.45, 1.1, 1.25, '#77817c'],
  [-12.3, 0.7, -1.2, 1.2, 1, 1.4, '#77817c'],
  [-9.4, 0.42, 8.8, 1.05, 0.62, 0.88, '#7d8680'],
  [8.6, 0.38, 9.4, 0.92, 0.55, 0.78, '#7d8680'],
] as const

export function XrPlaygroundPalm({
  position,
  scale = 1,
  lean = 0,
}: {
  position: [number, number, number]
  scale?: number
  lean?: number
}) {
  return (
    <group position={position} scale={scale} rotation={[0, 0, lean]} name="agentic_os_xr_playground_palm">
      <mesh position={[0, 1.78, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.3, 3.56, 8]} />
        <meshStandardMaterial color="#8a5a38" roughness={0.92} flatShading />
      </mesh>
      {[0.42, 1.08, 1.78, 2.46, 3.12].map(y => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, y * 0.4]}>
          <torusGeometry args={[0.17 + y * 0.016, 0.03, 6, 10]} />
          <meshStandardMaterial color="#6f452c" roughness={0.95} />
        </mesh>
      ))}
      {[-0.18, 0.16, 0.02].map((x, index) => (
        <mesh key={x} position={[x, 3.38, index === 2 ? 0.16 : -0.08]} castShadow>
          <sphereGeometry args={[0.09, 8, 6]} />
          <meshStandardMaterial color="#6b3f24" roughness={0.86} />
        </mesh>
      ))}
      <group position={[0, 3.55, 0]}>
        {Array.from({ length: 9 }, (_, index) => {
          const angle = index * Math.PI * 2 / 9
          return (
            <mesh
              key={index}
              position={[Math.cos(angle) * 0.22, 0.02, Math.sin(angle) * 0.22]}
              rotation={[1.12, -angle, 0.08]}
              castShadow
            >
              <planeGeometry args={[0.62, 2.55]} />
              <meshStandardMaterial
                color={index % 2 ? '#2f9a4a' : '#4cb85c'}
                roughness={0.78}
                side={DoubleSide}
              />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

export function XrPlaygroundCannon({ position, yaw = 0 }: { position: [number, number, number]; yaw?: number }) {
  return (
    <group position={position} rotation={[0, yaw, 0]} scale={1.2} name="agentic_os_xr_playground_cannon">
      {[-0.48, 0.48].map(x => (
        <mesh key={x} position={[x, 0.38, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.43, 0.43, 0.2, 14]} />
          <meshStandardMaterial color="#55463f" roughness={0.82} />
        </mesh>
      ))}
      <mesh position={[0, 0.62, 0.14]} rotation={[Math.PI / 2 - 0.18, 0, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.42, 1.8, 14]} />
        <meshStandardMaterial color="#4b5057" roughness={0.5} metalness={0.28} />
      </mesh>
      <mesh position={[0, 0.78, 0.98]} rotation={[Math.PI / 2 - 0.18, 0, 0]}>
        <torusGeometry args={[0.3, 0.045, 8, 14]} />
        <meshStandardMaterial color="#2f3338" roughness={0.4} metalness={0.45} />
      </mesh>
      <mesh position={[0, 0.3, 0.1]} castShadow>
        <boxGeometry args={[1.25, 0.22, 1.1]} />
        <meshStandardMaterial color="#7b4932" roughness={0.85} />
      </mesh>
    </group>
  )
}

function Fence() {
  return (
    <group position={[0, 0, -9.35]} name="agentic_os_xr_playground_fence">
      {Array.from({ length: 21 }, (_, index) => {
        const x = -10 + index * 1
        const z = Math.abs(x) * 0.045
        const y = 0.98 + (index % 3) * 0.06
        return (
          <group key={index} position={[x, 0, z]} rotation={[0, x * 0.012, (index % 2 ? 1 : -1) * 0.03]}>
            <mesh position={[0, y, 0]} castShadow>
              <cylinderGeometry args={[0.09, 0.12, 1.96, 7]} />
              <meshStandardMaterial color="#a85c3d" roughness={0.9} />
            </mesh>
            <mesh position={[0, y + 1.08, 0]} castShadow>
              <coneGeometry args={[0.12, 0.38, 5]} />
              <meshStandardMaterial color="#7e432f" roughness={0.92} />
            </mesh>
          </group>
        )
      })}
      {[0.52, 1.22].map(height => (
        <mesh key={height} position={[0, height, 0.08]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 20.2, 8]} />
          <meshStandardMaterial color="#7e432f" roughness={0.92} />
        </mesh>
      ))}
    </group>
  )
}

function Ramp() {
  return (
    <group position={[-8.8, 0, -0.4]} rotation={[0, 0.08, 0]} name="agentic_os_xr_playground_wood_ramp">
      {Array.from({ length: 7 }, (_, index) => (
        <mesh key={index} position={[0, 0.11 + index * 0.105, 1.25 - index * 0.38]} rotation={[-0.25, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[3.8, 0.17, 0.58]} />
          <meshStandardMaterial color={index % 2 ? '#c57b55' : '#d98b61'} roughness={0.86} />
        </mesh>
      ))}
      {[-1.45, 1.45].map(x => (
        <mesh key={x} position={[x, 0.48, 0.1]} rotation={[-0.25 + Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.09, 0.09, 3.4, 7]} />
          <meshStandardMaterial color="#75432f" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

function SkullGrotto() {
  return (
    <group position={[-11, 0, -7.6]} name="agentic_os_xr_playground_skull_grotto">
      <mesh position={[0, 1.45, -0.45]} scale={[3.15, 1.35, 2.7]} castShadow receiveShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#6d7872" roughness={0.94} flatShading />
      </mesh>
      <mesh position={[0.12, 2.62, 0.34]} scale={[2.18, 2.08, 2.08]} castShadow>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color="#8a8f86" roughness={0.92} flatShading />
      </mesh>
      {[-0.74, 0.8].map(x => (
        <mesh key={x} position={[x, 2.94, 1.98]} scale={[0.56, 0.7, 0.3]}>
          <sphereGeometry args={[1, 10, 6]} />
          <meshBasicMaterial color="#141c1a" />
        </mesh>
      ))}
      <mesh position={[0.04, 2.22, 2.18]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.24, 0.62, 3]} />
        <meshBasicMaterial color="#141c1a" />
      </mesh>
      <mesh position={[0.18, 1.18, 1.9]} scale={[1.22, 1.02, 0.46]} castShadow>
        <sphereGeometry args={[1, 12, 8]} />
        <meshStandardMaterial color="#202a28" roughness={1} />
      </mesh>
      {[-0.56, -0.2, 0.18, 0.54].map(x => (
        <mesh key={x} position={[x, 0.74, 2.08]}>
          <boxGeometry args={[0.17, 0.32, 0.13]} />
          <meshStandardMaterial color="#e8dfc2" roughness={0.72} />
        </mesh>
      ))}
      <mesh position={[0.08, 0.42, 1.52]} rotation={[0.32, 0, 0]} castShadow>
        <boxGeometry args={[1.72, 0.26, 1.08]} />
        <meshStandardMaterial color="#7a827a" roughness={0.94} flatShading />
      </mesh>
    </group>
  )
}

function Skeleton() {
  return (
    <group position={[8.2, 0.18, -6.8]} rotation={[0, -0.35, 0]} name="agentic_os_xr_playground_skeleton">
      {Array.from({ length: 5 }, (_, index) => (
        <mesh key={index} position={[index * 0.42, 0.2 + Math.sin(index) * 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.42 + index * 0.035, 0.07, 7, 14, Math.PI]} />
          <meshStandardMaterial color="#e8dfc2" roughness={0.88} />
        </mesh>
      ))}
      <mesh position={[2.2, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.08, 0.08, 2.1, 7]} />
        <meshStandardMaterial color="#e8dfc2" roughness={0.88} />
      </mesh>
    </group>
  )
}

function MovingHazards() {
  const rootRef = React.useRef<Group | null>(null)
  useFrame(() => {
    const elapsedSeconds = readSharedXrNativeControllerDemoFrame().elapsedSeconds
    const children = rootRef.current?.children || []
    children.forEach((child, index) => {
      child.position.y = 3.7 + Math.sin(elapsedSeconds * 0.72 + index * 1.7) * 0.42
      child.rotation.y = Math.sin(elapsedSeconds * 0.35 + index) * 0.12
    })
  })
  return (
    <group ref={rootRef} name="agentic_os_xr_playground_moving_hazards">
      {[-4.3, 0, 4.4].map((x, index) => (
        <group key={x} position={[x, 3.7, -8.35]}>
          <mesh castShadow>
            <boxGeometry args={[3.1 - index * 0.35, 0.8, 1.7]} />
            <meshStandardMaterial color={index % 2 ? '#6576ba' : '#697dc9'} roughness={0.55} />
          </mesh>
          {[-0.9, 0, 0.9].slice(0, 3 - index).map(spikeX => (
            <mesh key={spikeX} position={[spikeX, 0.72, 0]}>
              <coneGeometry args={[0.22, 0.72, 5]} />
              <meshStandardMaterial color="#d8e2f2" roughness={0.5} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

function DisplayChest() {
  return (
    <group position={[-3.4, 0, -6.3]} name="agentic_os_xr_playground_display_chest">
      <mesh position={[0, 0.62, 0]} castShadow>
        <boxGeometry args={[2.3, 1.2, 1.35]} />
        <meshStandardMaterial color="#74412e" roughness={0.72} />
      </mesh>
      <mesh position={[0, 1.32, 0]}>
        <boxGeometry args={[2.35, 0.28, 1.4]} />
        <meshStandardMaterial color="#8b4d31" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.5, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.68, 0.68, 2.28, 16, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#8b4d31" roughness={0.7} />
      </mesh>
      {[-0.78, 0, 0.78].map(x => (
        <mesh key={x} position={[x, 0.82, 0.69]}>
          <boxGeometry args={[0.13, 1.48, 0.06]} />
          <meshStandardMaterial color="#e2a846" roughness={0.42} metalness={0.45} />
        </mesh>
      ))}
    </group>
  )
}

export function XrTropicalPlaygroundLandmarks({ displayChest = false }: { displayChest?: boolean }) {
  return (
    <group name="agentic_os_xr_tropical_playground_landmarks">
      <Fence />
      <Ramp />
      <SkullGrotto />
      <XrPlaygroundCannon position={[1.6, 0, -6.25]} />
      <XrPlaygroundCannon position={[4.15, 0, -6.25]} />
      <Skeleton />
      <MovingHazards />
      {PALMS.map(([x, z, scale, lean]) => (
        <XrPlaygroundPalm key={`${x}:${z}`} position={[x, 0, z]} scale={scale} lean={lean} />
      ))}
      {ROCKS.map(([x, y, z, sx, sy, sz, color]) => (
        <mesh key={`${x}:${z}`} position={[x, y, z]} scale={[sx, sy, sz]} castShadow receiveShadow>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={color} roughness={0.94} flatShading />
        </mesh>
      ))}
      {displayChest ? <DisplayChest /> : null}
    </group>
  )
}
