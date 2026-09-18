import React from 'react'
import type { XrSceneAppearance } from './xrSceneAppearance'
import type { XrMotionReferenceStagePreset } from './xrSceneLibrary'

/** Fixed, non-interactive silhouettes outside the playable perimeter; no frame loop or assets. */
export function XrPlaygroundHorizon({ appearance, stage }: { appearance: XrSceneAppearance; stage: XrMotionReferenceStagePreset }) {
  if (appearance.detail === 'low') return null
  const span = Math.max(...stage.sizeMeters)
  const distance = Math.max(30, span * 1.3)
  return <group name="agentic_os_xr_playground_horizon" userData={{ decorative: true, interactive: false }}>
    {[-1, 1].map(side => <group key={side} position={[side * distance * 0.75, -0.9, -distance]}>
      <mesh position={[0, 1.2, 0]} scale={[6.5, 2.6, 3.8]}><icosahedronGeometry args={[1, 0]} /><meshStandardMaterial color={appearance.groundColor} roughness={1} flatShading /></mesh>
      <mesh position={[side * 4, 0.8, 1.2]} scale={[4, 2, 3]}><icosahedronGeometry args={[1, 0]} /><meshStandardMaterial color={appearance.waterColor} roughness={1} flatShading /></mesh>
    </group>)}
    {[-1, 0, 1].map((side, index) => <group key={side} position={[side * distance * 0.85, 11 + index * 2, -distance * 1.4]}>
      {[0, 1, 2].map(part => <mesh key={part} position={[part * 2.2, part === 1 ? 0.6 : 0, 0]} scale={[3, 0.9 + part * 0.2, 1.4]}><sphereGeometry args={[1, 8, 5]} /><meshStandardMaterial color={appearance.fogColor} roughness={1} flatShading /></mesh>)}
    </group>)}
  </group>
}
