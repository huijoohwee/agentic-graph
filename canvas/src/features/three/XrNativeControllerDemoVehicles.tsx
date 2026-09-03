import React from 'react'
import type { Group } from 'three'
import { XrProceduralBallGeometry } from './XrProceduralBallGeometry'

export function XrNativeControllerBallVisual({
  rootRef,
}: {
  rootRef: React.RefObject<Group | null>
}) {
  return (
    <group ref={rootRef} name="agentic_os_xr_native_beach_ball" position={[0, 0.6, 0]}>
      <XrProceduralBallGeometry />
    </group>
  )
}

function RocketFin({ rotation, position }: {
  rotation: [number, number, number]
  position: [number, number, number]
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <boxGeometry args={[0.42, 0.62, 0.1]} />
      <meshStandardMaterial color="#ef476f" roughness={0.55} />
    </mesh>
  )
}

export function XrNativeControllerRocketVisual({
  flameRef,
  rootRef,
}: {
  flameRef: React.RefObject<Group | null>
  rootRef: React.RefObject<Group | null>
}) {
  return (
    <group ref={rootRef} name="agentic_os_xr_native_rocket" position={[0, 1.02, 0]}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.34, 0.48, 1.34, 18]} />
        <meshStandardMaterial color="#f5f1e8" roughness={0.38} metalness={0.12} />
      </mesh>
      <mesh position={[0, 0.96, 0]} castShadow>
        <coneGeometry args={[0.34, 0.68, 18]} />
        <meshStandardMaterial color="#ef476f" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.28, 0.335]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.04, 18]} />
        <meshStandardMaterial color="#63c7ff" roughness={0.24} metalness={0.18} />
      </mesh>
      <RocketFin position={[0.47, -0.45, 0]} rotation={[0, 0, -0.28]} />
      <RocketFin position={[-0.47, -0.45, 0]} rotation={[0, 0, 0.28]} />
      <RocketFin position={[0, -0.45, 0.47]} rotation={[0.28, Math.PI / 2, 0]} />
      <RocketFin position={[0, -0.45, -0.47]} rotation={[-0.28, Math.PI / 2, 0]} />
      <mesh position={[0, -0.72, 0]}>
        <cylinderGeometry args={[0.3, 0.38, 0.22, 16]} />
        <meshStandardMaterial color="#52627a" roughness={0.42} metalness={0.48} />
      </mesh>
      <group ref={flameRef} visible={false} position={[0, -1.15, 0]}>
        <mesh rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.27, 0.88, 14]} />
          <meshBasicMaterial color="#ff8a00" transparent opacity={0.88} />
        </mesh>
        <mesh position={[0, 0.18, 0]} rotation={[0, 0, Math.PI]}>
          <coneGeometry args={[0.14, 0.58, 12]} />
          <meshBasicMaterial color="#fff36b" transparent opacity={0.96} />
        </mesh>
      </group>
    </group>
  )
}
