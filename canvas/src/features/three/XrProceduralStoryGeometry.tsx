import React from 'react'
import { DoubleSide, MathUtils } from 'three'
import type { XrAnimationPoseSample } from './xrAnimationCatalog'
import type { XrStoryPresentation } from './xrStoryPresentation'

type Size = readonly [number, number, number]
const UPRIGHT: [number, number, number] = [Math.PI / 2, 0, 0]
const Material = ({ color }: { color: string }) => <meshStandardMaterial color={color} roughness={0.8} />

/** All geometry is authored locally, in the library's Z-up coordinates. */
export function XrStoryCharacter({ kind, color, size, pose }: {
  kind: 'pig' | 'wolf' | 'monkey'; color: string; size: Size; pose?: XrAnimationPoseSample | null
}) {
  const [w, h, d] = size
  const skin = kind === 'pig' ? '#f5a3b7' : kind === 'monkey' ? '#9b6542' : '#71859a'
  const snout = kind === 'pig' ? '#ee839f' : kind === 'monkey' ? '#e9bd8b' : '#aab7c4'
  const crouch = (pose?.crouch || 0) * h * 0.12
  return <group name={`agentic_os_xr_story_${kind}`}>
    <mesh position={[0, 0, h * 0.46 - crouch]} scale={[1, 0.8, 1.15]} castShadow>
      <sphereGeometry args={[w * 0.44, 16, 12]} /><Material color={color} />
    </mesh>
    <mesh position={[0, 0, h * 0.79 - crouch]} scale={[1, 0.9, kind === 'pig' ? 0.94 : 1.05]} castShadow>
      <sphereGeometry args={[w * 0.48, 16, 12]} /><Material color={skin} />
    </mesh>
    <mesh position={[0, d * 0.54, h * 0.74 - crouch]} rotation={[0, 0, 0]} castShadow>
      {kind === 'monkey' ? <sphereGeometry args={[w * 0.25, 12, 8]} /> : kind === 'pig' ? <cylinderGeometry args={[w * 0.23, w * 0.25, d * 0.25, 16]} /> : <coneGeometry args={[w * 0.24, d * 0.85, 8]} />}
      <Material color={snout} />
    </mesh>
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[side * w * (kind === 'monkey' ? 0.5 : 0.29), 0, h * (kind === 'monkey' ? 0.82 : 1.02) - crouch]} rotation={[Math.PI / 2, side * 0.25, 0]} castShadow>
        {kind === 'monkey' ? <sphereGeometry args={[w * 0.2, 12, 8]} /> : <coneGeometry args={[w * 0.17, h * (kind === 'wolf' ? 0.25 : 0.15), 3]} />}<Material color={skin} />
      </mesh>
      <mesh position={[side * w * 0.17, d * 0.47, h * 0.87 - crouch]}>
        <sphereGeometry args={[w * 0.075, 10, 8]} /><Material color="#fffaf2" />
      </mesh>
      <mesh position={[side * w * 0.17, d * 0.52, h * 0.87 - crouch]}>
        <sphereGeometry args={[w * 0.039, 8, 6]} /><Material color="#172b3e" />
      </mesh>
      {kind === 'pig' ? <mesh position={[side * w * 0.09, d * 0.68, h * 0.76 - crouch]}>
        <sphereGeometry args={[w * 0.034, 8, 6]} /><Material color="#9d4564" />
      </mesh> : null}
      <group position={[side * w * 0.4, 0, h * 0.58 - crouch]} rotation={[
        MathUtils.degToRad((side < 0 ? pose?.leftArmPitchDegrees : pose?.rightArmPitchDegrees) || 0),
        MathUtils.degToRad((side < 0 ? pose?.leftArmRollDegrees : pose?.rightArmRollDegrees) || side * 12), 0,
      ]}>
        <mesh position={[0, 0, -h * 0.1]} rotation={UPRIGHT} castShadow><capsuleGeometry args={[w * 0.095, h * 0.17, 4, 8]} /><Material color={skin} /></mesh>
      </group>
      <mesh position={[side * w * 0.22, 0, h * 0.15 - crouch * 0.2]} rotation={UPRIGHT} castShadow>
        <capsuleGeometry args={[w * 0.11, h * 0.15, 4, 8]} /><Material color={skin} />
      </mesh>
      <mesh position={[side * w * 0.22, d * 0.13, h * 0.06]} scale={[1, 1.5, 0.6]} castShadow>
        <sphereGeometry args={[w * 0.14, 10, 8]} /><Material color="#344453" />
      </mesh>
    </group>)}
    {kind === 'monkey' ? <mesh position={[0, -d * 0.7, h * 0.36]} rotation={[Math.PI / 2, Math.PI / 2, 0]}><torusGeometry args={[h * 0.24, w * 0.045, 6, 18, Math.PI * 1.65]} /><Material color={skin} /></mesh> : kind === 'pig' ? <mesh position={[0, -d * 0.53, h * 0.42]} rotation={UPRIGHT}>
      <torusGeometry args={[w * 0.1, w * 0.025, 6, 12, Math.PI * 1.65]} /><Material color={skin} />
    </mesh> : <mesh position={[0, -d * 0.5, h * 0.3]} rotation={[0.7, 0, 0]}>
      <coneGeometry args={[w * 0.15, h * 0.45, 8]} /><Material color={skin} />
    </mesh>}
  </group>
}

export function XrSailboatGeometry({ color, size }: { color: string; size: Size }) {
  const [w, h, d] = size
  return <group name="agentic_os_xr_story_sailboat">
    <mesh position={[0, 0, h * 0.09]} scale={[w * 0.52, d * 0.48, h * 0.16]} castShadow><sphereGeometry args={[1, 12, 8]} /><Material color={color} /></mesh>
    <mesh position={[0, 0, h * 0.18]} castShadow><boxGeometry args={[w * 0.8, d * 0.75, h * 0.035]} /><Material color="#e9bb7c" /></mesh>
    <mesh position={[0, 0, h * 0.56]} rotation={UPRIGHT} castShadow><cylinderGeometry args={[w * 0.022, w * 0.028, h * 0.82, 8]} /><Material color="#784d32" /></mesh>
    <mesh position={[w * 0.22, 0, h * 0.61]} rotation={[Math.PI / 2, 0, -Math.PI / 2]} castShadow>
      <circleGeometry args={[h * 0.35, 3]} /><meshStandardMaterial color="#fff6df" side={DoubleSide} roughness={0.9} />
    </mesh>
    <mesh position={[-w * 0.16, 0, h * 0.89]}><boxGeometry args={[w * 0.32, 0.02, h * 0.1]} /><Material color="#e76553" /></mesh>
  </group>
}

export function XrStoryEffect({ presentation, size, color }: {
  presentation: XrStoryPresentation; size: Size; color: string
}) {
  const { cue, progress } = presentation
  const [w, h, d] = size
  if (cue === 'collapse') return <group name="agentic_os_xr_story_collapse" userData={{ progress }}>
    {Array.from({ length: 12 }, (_, index) => {
      const angle = index * 2.399
      const radius = (0.25 + progress * 1.3) * w
      return <mesh key={index} position={[Math.cos(angle) * radius, Math.sin(angle) * radius,
        h * Math.max(0.07, (1 - progress) * (0.3 + index % 3 * 0.22) + Math.sin(progress * Math.PI) * 0.5)]}
        rotation={[progress * (index % 3 + 1), angle, progress * angle]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.12, d * (index % 2 ? 0.55 : 0.3), h * 0.1]} /><Material color={color} />
      </mesh>
    })}
  </group>
  if (progress >= 1 || (cue !== 'huff' && cue !== 'splash')) return null
  return <group name={`agentic_os_xr_story_${cue}`}>
    {Array.from({ length: cue === 'huff' ? 3 : 10 }, (_, index) => {
      const phase = (progress + index * 0.13) % 1
      const angle = index * 2.399
      return <mesh key={index} position={cue === 'huff'
        ? [0, d * 0.7 + phase * 2.8, h * 0.75]
        : [Math.cos(angle) * phase * w, Math.sin(angle) * phase * d, h * (0.8 + Math.sin(phase * Math.PI))]}
        rotation={cue === 'huff' ? UPRIGHT : [0, 0, 0]}>
        {cue === 'huff' ? <torusGeometry args={[0.14 + phase * 0.5, 0.018, 6, 20]} /> : <sphereGeometry args={[w * 0.04, 6, 6]} />}
        <meshBasicMaterial color={cue === 'huff' ? '#f1fcff' : '#ffc866'} transparent opacity={1 - phase} depthWrite={false} />
      </mesh>
    })}
  </group>
}
