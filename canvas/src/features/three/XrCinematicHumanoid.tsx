import React from 'react'
import * as THREE from 'three'
import type { XrAnimationPoseSample } from './xrAnimationCatalog'
import type { XrSceneLibraryAsset } from './xrSceneLibrary'

type Profile = NonNullable<XrSceneLibraryAsset['visualProfile']>
type Dimensions = readonly [width: number, height: number, depth: number]

const LOOKS: Readonly<Record<Profile, Readonly<{
  suit: string
  trim: string
  joint: string
  skin: string
  hair: string
  metalness: number
}>>> = {
  'bionic-operative': { suit: '#101b26', trim: '#35c6d8', joint: '#172a39', skin: '#b58e7b', hair: '#10131a', metalness: 0.36 },
  'corporate-executive': { suit: '#111418', trim: '#c49758', joint: '#273442', skin: '#b68f77', hair: '#17191d', metalness: 0.24 },
  'security-android': { suit: '#c6d1d9', trim: '#50d7e8', joint: '#202a33', skin: '#dbe4ea', hair: '#1b2932', metalness: 0.72 },
  'cinema-protagonist': { suit: '#2b3843', trim: '#9ab6c5', joint: '#3d4d58', skin: '#b48f7b', hair: '#17222c', metalness: 0.12 },
}

/** Silhouette proportions per character design: shoulder span, torso girth and head scale. */
const BUILDS: Readonly<Record<Profile, Readonly<{ shoulder: number; girth: number; head: number }>>> = {
  'bionic-operative': { shoulder: 0.86, girth: 0.82, head: 0.94 },
  'corporate-executive': { shoulder: 1.12, girth: 1.32, head: 1.04 },
  'security-android': { shoulder: 1.22, girth: 1.12, head: 0.92 },
  'cinema-protagonist': { shoulder: 1.04, girth: 1.06, head: 1.0 },
}

function Pbr({ color, metalness = 0.16, roughness = 0.48, emissive, emissiveIntensity = 0 }: {
  color: string
  metalness?: number
  roughness?: number
  emissive?: string
  emissiveIntensity?: number
}) {
  return <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} emissive={emissive} emissiveIntensity={emissiveIntensity} />
}

function Capsule({ position, length, radius, color, metalness = 0.16, rotation = 0 }: {
  position: readonly [number, number, number]
  length: number
  radius: number
  color: string
  metalness?: number
  rotation?: number
}) {
  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, rotation]} castShadow receiveShadow>
      <capsuleGeometry args={[radius, length, 6, 16]} />
      <Pbr color={color} metalness={metalness} />
    </mesh>
  )
}

function Limb({ side, width, height, depth, pitch, roll, color, joint, metalness, android }: {
  side: -1 | 1
  width: number
  height: number
  depth: number
  pitch: number
  roll: number
  color: string
  joint: string
  metalness: number
  android: boolean
}) {
  const shoulderZ = height * 0.72
  return (
    <group position={[side * width * 0.4, 0, shoulderZ]} rotation={[THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(roll), 0]}>
      <mesh position={[0, 0, -height * 0.13]} castShadow receiveShadow>
        <sphereGeometry args={[width * 0.14, 18, 14]} />
        <Pbr color={joint} metalness={metalness + 0.1} roughness={0.38} />
      </mesh>
      <Capsule position={[0, 0, -height * 0.25]} length={height * 0.2} radius={width * 0.105} color={color} metalness={metalness} />
      <mesh position={[0, depth * 0.11, -height * 0.25]} castShadow>
        <boxGeometry args={[width * 0.24, depth * 0.12, height * 0.25]} />
        <Pbr color={android ? '#e7eef2' : color} metalness={metalness + (android ? 0.15 : 0)} roughness={0.36} />
      </mesh>
      <mesh position={[0, 0, -height * 0.39]}>
        <sphereGeometry args={[width * 0.095, 16, 12]} />
        <Pbr color={joint} metalness={metalness + 0.14} roughness={0.32} />
      </mesh>
      <Capsule position={[0, 0, -height * 0.51]} length={height * 0.17} radius={width * 0.083} color={color} metalness={metalness} />
      <mesh position={[0, depth * 0.015, -height * 0.63]} castShadow>
        <sphereGeometry args={[width * 0.075, 16, 12]} />
        <Pbr color={android ? '#dfe8ed' : '#a9816c'} metalness={android ? 0.62 : 0.06} roughness={0.5} />
      </mesh>
    </group>
  )
}

function Leg({ side, width, height, depth, pitch, crouch, color, joint, metalness, android }: {
  side: -1 | 1
  width: number
  height: number
  depth: number
  pitch: number
  crouch: number
  color: string
  joint: string
  metalness: number
  android: boolean
}) {
  const shinZ = -height * 0.25
  return (
    <group position={[side * width * 0.17, 0, height * 0.42 - crouch * height * 0.08]} rotation={[THREE.MathUtils.degToRad(pitch + crouch * 34), 0, 0]}>
      <Capsule position={[0, 0, -height * 0.15]} length={height * 0.22} radius={width * 0.12} color={color} metalness={metalness} />
      <mesh position={[0, depth * 0.01, shinZ]}>
        <sphereGeometry args={[width * 0.11, 16, 12]} />
        <Pbr color={joint} metalness={metalness + 0.12} roughness={0.36} />
      </mesh>
      <Capsule position={[0, 0, -height * 0.38]} length={height * 0.2} radius={width * 0.092} color={android ? '#dbe5ea' : color} metalness={metalness} />
      <mesh position={[0, depth * 0.08, -height * 0.49]} rotation={[0, 0, 0]} castShadow>
        <boxGeometry args={[width * 0.24, depth * 0.5, height * 0.1]} />
        <Pbr color={android ? '#242f38' : '#0e1720'} metalness={android ? 0.46 : 0.12} roughness={0.6} />
      </mesh>
    </group>
  )
}

export function XrCinematicHumanoid({ profile, color, pose, size }: {
  profile: Profile
  color: string
  pose?: XrAnimationPoseSample | null
  size: Dimensions
}) {
  const [width, height, depth] = size
  const look = LOOKS[profile]
  const android = profile === 'security-android'
  const operative = profile === 'bionic-operative'
  const protagonist = profile === 'cinema-protagonist'
  const crouch = pose?.crouch || 0
  const faceY = depth * 0.29
  const torsoZ = height * 0.58 - crouch * height * 0.1
  const trim = profile === 'bionic-operative' ? look.trim : profile === 'corporate-executive' ? look.trim : '#54d9ed'
  const build = BUILDS[profile]
  const executive = profile === 'corporate-executive'
  const headZ = height * 0.87 - crouch * height * 0.08
  return (
    <group name={`agentic_os_xr_cinematic_subject_${profile}`}>
      {([-1, 1] as const).map(side => <Leg
        key={`leg:${side}`} side={side} width={width} height={height} depth={depth}
        pitch={(side < 0 ? pose?.leftLegPitchDegrees : pose?.rightLegPitchDegrees) || 0}
        crouch={crouch} color={look.suit} joint={look.joint} metalness={look.metalness} android={android}
      />)}
      <mesh position={[0, 0, torsoZ]} castShadow receiveShadow>
        <capsuleGeometry args={[width * 0.235 * build.girth, height * 0.22, 5, 14]} />
        <Pbr color={look.suit} metalness={look.metalness} roughness={android ? 0.28 : 0.58} />
      </mesh>
      {operative ? <mesh position={[0, 0, height * 0.29]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[width * 0.19, width * 0.34, height * 0.53, 24, 2]} />
        <Pbr color="#080c12" metalness={0.16} roughness={0.34} />
      </mesh> : null}
      <mesh position={[0, faceY, torsoZ + height * 0.01]}>
        <boxGeometry args={[width * 0.23, depth * 0.028, height * 0.28]} />
        <Pbr color={android ? '#e6edf1' : operative || protagonist ? '#151d25' : '#e6e3dc'} metalness={android ? 0.58 : 0.12} roughness={0.4} />
      </mesh>
      {executive ? <mesh position={[0, faceY * build.girth, torsoZ + height * 0.07]} rotation={[0.35, 0, 0]}>
        <torusGeometry args={[width * 0.13, width * 0.016, 6, 24, Math.PI]} />
        <Pbr color="#d6a54a" metalness={0.92} roughness={0.22} emissive="#6b4a12" emissiveIntensity={0.2} />
      </mesh> : null}
      {executive ? ([-1, 1] as const).map(side => <mesh key={`lapel:${side}`} position={[side * width * 0.1, faceY * build.girth + depth * 0.01, torsoZ + height * 0.05]} rotation={[0, side * 0.32, 0]}>
        <boxGeometry args={[width * 0.07, depth * 0.03, height * 0.2]} />
        <Pbr color="#0b0f14" metalness={0.2} roughness={0.42} />
      </mesh>) : null}
      {executive ? <mesh position={[0, faceY * build.girth + depth * 0.035, torsoZ + height * 0.015]}>
        <boxGeometry args={[width * 0.085, depth * 0.027, height * 0.31]} />
        <Pbr color="#d5d8d8" metalness={0.08} roughness={0.52} />
      </mesh> : null}
      {executive ? <mesh position={[0, faceY * build.girth + depth * 0.056, torsoZ - height * 0.025]} rotation={[0.06, 0, 0]}>
        <boxGeometry args={[width * 0.045, depth * 0.018, height * 0.2]} />
        <Pbr color="#8a2930" metalness={0.32} roughness={0.38} />
      </mesh> : null}
      {protagonist ? <>
        <mesh position={[0, -depth * 0.025, height * 0.28]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[width * 0.22, width * 0.42, height * 0.5, 16, 1, true]} />
          <Pbr color="#202c37" metalness={0.12} roughness={0.66} emissive="#08131d" emissiveIntensity={0.18} />
        </mesh>
        <mesh position={[0, depth * 0.265, torsoZ + height * 0.18]} rotation={[0.2, 0, 0]} castShadow>
          <boxGeometry args={[width * 0.4, depth * 0.13, height * 0.11]} />
          <Pbr color="#263541" metalness={0.2} roughness={0.48} emissive="#08131d" emissiveIntensity={0.12} />
        </mesh>
        {([-1, 1] as const).map(side => <mesh key={`coat-tail:${side}`} position={[side * width * 0.15, -depth * 0.015, height * 0.27]} rotation={[0.015, side * 0.025, side * 0.035]} castShadow receiveShadow>
          <boxGeometry args={[width * 0.28, depth * 0.28, height * 0.52]} />
          <Pbr color="#25333e" metalness={0.2} roughness={0.62} emissive="#08131d" emissiveIntensity={0.14} />
        </mesh>)}
        {[-1, 1].map(side => <mesh key={`coat-seam:${side}`} position={[side * width * 0.21, depth * 0.145, height * 0.29]}>
          <boxGeometry args={[width * 0.012, depth * 0.012, height * 0.42]} />
          <Pbr color="#8295a0" metalness={0.34} roughness={0.44} />
        </mesh>)}
        <mesh position={[0, depth * 0.24, torsoZ + height * 0.14]} rotation={[0.18, 0, 0]}>
          <boxGeometry args={[width * 0.36, depth * 0.14, height * 0.12]} />
          <Pbr color="#242f39" metalness={0.28} roughness={0.58} />
        </mesh>
        {([-1, 1] as const).map(side => <mesh key={`coat-lapel:${side}`} position={[side * width * 0.085, depth * 0.22, torsoZ + height * 0.11]} rotation={[0.25, side * 0.18, side * 0.28]}>
          <boxGeometry args={[width * 0.09, depth * 0.08, height * 0.2]} />
          <Pbr color="#455762" metalness={0.2} roughness={0.52} />
        </mesh>)}
        {pose?.propCue === 'tablet' ? <group position={[width * 0.16, depth * 0.58, height * 0.48]} rotation={[-0.24, 0, -0.12]}>
          <mesh castShadow receiveShadow><boxGeometry args={[width * 0.52, depth * 0.075, height * 0.22]} /><Pbr color="#101820" metalness={0.7} roughness={0.28} /></mesh>
          <mesh position={[0, depth * 0.041, 0]}><boxGeometry args={[width * 0.46, depth * 0.012, height * 0.19]} /><meshBasicMaterial color="#45b7ca" side={THREE.DoubleSide} toneMapped={false} /></mesh>
          {[-1, 0, 1].map((line, index) => <mesh key={line} position={[0, depth * 0.05, height * (0.04 - index * 0.05)]}><boxGeometry args={[width * (index === 1 ? 0.27 : 0.35), depth * 0.006, height * 0.01]} /><meshBasicMaterial color={index === 0 ? '#e1b77e' : '#78c8d7'} toneMapped={false} side={THREE.DoubleSide} /></mesh>)}
        </group> : null}
      </> : null}
      <mesh position={[0, faceY + depth * 0.025, torsoZ + height * 0.16]}>
        <boxGeometry args={[width * 0.57 * build.shoulder, depth * 0.18, height * 0.075]} />
        <Pbr color={android ? '#e1e9ee' : look.suit} metalness={look.metalness + 0.08} roughness={0.36} />
      </mesh>
      {[-1, 1].map(side => <mesh key={`shoulder:${side}`} position={[side * width * 0.35 * build.shoulder, 0, height * 0.72]} castShadow>
        <sphereGeometry args={[width * (android ? 0.19 : 0.13), 14, 10]} />
        <Pbr color={android ? '#dbe5eb' : look.suit} metalness={look.metalness + (android ? 0.12 : 0)} roughness={android ? 0.3 : 0.52} />
      </mesh>)}
      {([-1, 1] as const).map(side => <Limb
        key={`arm:${side}`} side={side} width={width * build.shoulder} height={height} depth={depth}
        pitch={(side < 0 ? pose?.leftArmPitchDegrees : pose?.rightArmPitchDegrees) || 0}
        roll={(side < 0 ? pose?.leftArmRollDegrees : pose?.rightArmRollDegrees) || 0}
        color={operative ? look.skin : look.suit} joint={operative ? look.skin : look.joint}
        metalness={operative ? 0.05 : look.metalness} android={android}
      />)}
      <mesh position={[0, 0, height * 0.78 - crouch * height * 0.08]}>
        <cylinderGeometry args={[width * 0.105, width * 0.12, height * 0.1, 12]} />
        <Pbr color={android ? '#7e909c' : look.joint} metalness={look.metalness} roughness={0.42} />
      </mesh>
      <mesh position={[0, 0, headZ]} castShadow receiveShadow>
        <sphereGeometry args={[width * (android ? 0.245 : 0.235) * build.head, 20, 16]} />
        <Pbr color={android ? '#c9d4db' : look.skin} metalness={android ? 0.6 : 0.04} roughness={android ? 0.28 : 0.68} />
      </mesh>
      {android ? <mesh position={[0, faceY + depth * 0.025, height * 0.88 - crouch * height * 0.08]}>
        <boxGeometry args={[width * 0.34, depth * 0.055, height * 0.08]} />
        <Pbr color="#091923" metalness={0.72} roughness={0.22} emissive={trim} emissiveIntensity={0.72} />
      </mesh> : (
        <>
          <mesh position={[0, 0, headZ + height * 0.03]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <sphereGeometry args={[width * 0.252 * build.head, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
            <Pbr color={look.hair} metalness={0.08} roughness={operative ? 0.32 : 0.7} />
          </mesh>
          {operative ? <>
            {/* Long, straight hair frames the face and falls behind the black evening dress. */}
            <Capsule position={[0, -depth * 0.17, headZ - height * 0.2]} length={height * 0.42} radius={width * 0.13} color={look.hair} metalness={0.08} />
            {[-1, 1].map(side => <Capsule key={`lock:${side}`} position={[side * width * 0.19, depth * 0.02, headZ - height * 0.16]} length={height * 0.28} radius={width * 0.065} color={look.hair} metalness={0.08} />)}
            <mesh position={[0, faceY * 0.72, headZ + height * 0.035]} castShadow>
              <boxGeometry args={[width * 0.2, depth * 0.045, height * 0.035]} />
              <Pbr color={look.hair} metalness={0.1} roughness={0.32} />
            </mesh>
          </> : null}
          {[-1, 1].map(side => <React.Fragment key={`face:${side}`}>
            <mesh position={[side * width * 0.083, faceY + depth * 0.04, headZ - height * 0.004]}>
              <sphereGeometry args={[width * 0.024, 10, 8]} />
              <meshBasicMaterial color="#17202a" />
            </mesh>
            <mesh position={[side * width * 0.083, faceY + depth * 0.045, headZ + height * 0.035]} rotation={[0, 0, side * 0.08]}>
              <boxGeometry args={[width * 0.082, depth * 0.025, height * 0.018]} />
              <Pbr color={look.hair} roughness={0.56} />
            </mesh>
            <mesh position={[side * width * 0.24, 0, headZ - height * 0.035]}>
              <sphereGeometry args={[width * 0.045, 10, 8]} />
              <Pbr color={look.skin} roughness={0.66} />
            </mesh>
          </React.Fragment>)}
          <mesh position={[0, faceY + depth * 0.05, headZ - height * 0.05]}>
            <boxGeometry args={[width * 0.038, depth * 0.055, height * 0.07]} />
            <Pbr color={look.skin} roughness={0.7} />
          </mesh>
          <mesh position={[0, faceY + depth * 0.055, headZ - height * 0.098]}>
            <boxGeometry args={[width * 0.085, depth * 0.02, height * 0.013]} />
            <Pbr color="#6f3036" roughness={0.7} />
          </mesh>
        </>
      )}
      {operative ? <>
        <mesh position={[0, faceY + depth * 0.04, torsoZ + height * 0.19]} rotation={[0.18, 0, 0]}>
          <torusGeometry args={[width * 0.12, width * 0.012, 6, 24, Math.PI * 1.7]} />
          <Pbr color="#d8dce0" metalness={0.82} roughness={0.24} />
        </mesh>
        <mesh position={[width * 0.19, depth * 0.08, height * 0.66]}>
          <boxGeometry args={[width * 0.09, depth * 0.07, height * 0.08]} />
          <Pbr color="#0e2631" metalness={0.72} roughness={0.24} emissive={trim} emissiveIntensity={0.65} />
        </mesh>
      </> : null}
      {protagonist ? <>
        <Capsule position={[0, -depth * 0.16, headZ - height * 0.18]} length={height * 0.3} radius={width * 0.105} color="#111a24" metalness={0.08} />
        {[-1, 1].map(side => <Capsule key={`wet-hair:${side}`} position={[side * width * 0.16, depth * 0.015, headZ - height * 0.09]} length={height * 0.19} radius={width * 0.058} color="#151f2a" metalness={0.08} />)}
        <mesh position={[0, depth * 0.015, torsoZ + height * 0.2]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[width * 0.11, width * 0.012, 6, 20, Math.PI]} />
          <Pbr color="#55646e" metalness={0.56} roughness={0.3} />
        </mesh>
      </> : null}
      {android ? <>
        {/* Bulky security armour: chest plate, pauldrons and blue status lights. */}
        <mesh position={[0, depth * 0.08, torsoZ + height * 0.07]} castShadow>
          <boxGeometry args={[width * 0.62, depth * 0.62, height * 0.2]} />
          <Pbr color="#e4ebef" metalness={0.62} roughness={0.26} />
        </mesh>
        {[-1, 1].map(side => <mesh key={`pauldron:${side}`} position={[side * width * 0.45, 0, height * 0.75]} castShadow>
          <boxGeometry args={[width * 0.3, depth * 0.62, height * 0.07]} />
          <Pbr color="#d2dce3" metalness={0.66} roughness={0.28} />
        </mesh>)}
        {[-1, 1].map(side => <mesh key={`status:${side}`} position={[side * width * 0.2, depth * 0.4, torsoZ + height * 0.12]}>
          <boxGeometry args={[width * 0.07, depth * 0.02, height * 0.02]} />
          <meshBasicMaterial color={trim} toneMapped={false} />
        </mesh>)}
        <mesh position={[0, 0, torsoZ - height * 0.12]}>
          <torusGeometry args={[width * 0.25, width * 0.022, 6, 28]} />
          <Pbr color="#2a3a46" metalness={0.7} roughness={0.3} emissive={trim} emissiveIntensity={0.45} />
        </mesh>
      </> : null}
      {android ? <mesh position={[0, depth * 0.23, torsoZ + height * 0.02]}>
        <boxGeometry args={[width * 0.13, depth * 0.035, height * 0.12]} />
        <Pbr color="#243a48" metalness={0.6} roughness={0.32} emissive={trim} emissiveIntensity={0.28} />
      </mesh> : null}
      {profile === 'corporate-executive' ? <mesh position={[0, depth * 0.24, torsoZ - height * 0.04]}>
        <boxGeometry args={[width * 0.08, depth * 0.025, height * 0.018]} />
        <Pbr color={color || trim} metalness={0.72} roughness={0.26} />
      </mesh> : null}
    </group>
  )
}
