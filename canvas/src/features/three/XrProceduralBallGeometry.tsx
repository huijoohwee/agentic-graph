import React from 'react'

export const XR_PROCEDURAL_BALL_COLORS = Object.freeze([
  '#f15b4a',
  '#f7b733',
  '#f5e34f',
  '#4ecb71',
  '#2e8ee6',
  '#6657c8',
] as const)

export function XrProceduralBallGeometry({
  diameterMeters = 1.2,
  accentColor,
}: {
  diameterMeters?: number
  accentColor?: string
}) {
  const radius = Math.max(0.02, diameterMeters / 2)
  const wedge = Math.PI * 2 / XR_PROCEDURAL_BALL_COLORS.length
  return (
    <group name="agentic_os_xr_procedural_ball_geometry">
      {XR_PROCEDURAL_BALL_COLORS.map((color, index) => (
        <mesh key={color} castShadow receiveShadow>
          <sphereGeometry args={[radius, 32, 18, wedge * index, wedge + 0.008, 0, Math.PI]} />
          <meshStandardMaterial color={index === 4 && accentColor ? accentColor : color} roughness={0.48} metalness={0.02} />
        </mesh>
      ))}
      <mesh position={[0, radius * 0.975, 0]} castShadow>
        <sphereGeometry args={[radius * 0.21, 18, 10]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.56} />
      </mesh>
      <mesh position={[0, -radius * 0.975, 0]}>
        <sphereGeometry args={[radius * 0.185, 16, 8]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.56} />
      </mesh>
    </group>
  )
}
