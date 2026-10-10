import { XrAuthoredSubjectGeometry } from './XrAuthoredSubjectGeometry'
import { resolveXrSubjectConstructionBounds } from './xrSubjectAuthoring'
import { XrSelectionBounds } from './XrSelectionBounds'
import { useXrSubjectHover } from './XrSubjectHover'
import { xrMotionReferenceWorldPosition } from './xrMotionReferenceCoordinates'
import { XrStoryCharacter, XrSailboatGeometry, XrStoryEffect } from './XrProceduralStoryGeometry'
import type { XrStoryPresentation } from './xrStoryPresentation'
import React from 'react'
import * as THREE from 'three'
import { getVoxelLabelTexture } from '@/features/three/voxelLabelTexture'
import { THREE_RENDER_ORDER } from '@/features/three/renderOrder'
import { resolveXrSceneLibraryAsset } from '@/features/three/xrSceneLibrary'
import { createSingaporePoiDetailKitRecipe, resolveSingaporePoiDetailKitByPoiId } from './singaporePoiDetailKits'
import { buildProceduralAsset, disposeProceduralAsset } from '@/features/image-to-glb/proceduralAssetBuilder'
import { XrProceduralBallGeometry } from '@/features/three/XrProceduralBallGeometry'
import { XrProceduralHouseGeometry } from '@/features/three/XrProceduralHouseGeometry'
import { XrProceduralVehicleGeometry } from '@/features/three/XrProceduralVehicleGeometry'
import {
  XR_MOTION_REFERENCE_SELECTION_COLOR,
  type XrMotionReferenceSubject,
} from '@/features/three/xrMotionReferenceModel'
import type { XrAnimationPoseSample } from '@/features/three/xrAnimationCatalog'

type XrSceneSubjectIdentificationBounds = Readonly<{
  name: string
  position: readonly [number, number, number]
  size: [number, number, number]
  color: string
  userData: Readonly<{
    source: 'xr-scene-library'
    subjectId: string
    assetId: string
    category: XrMotionReferenceSubject['category']
    label: string
  }>
}>

function resolveXrSceneSubjectIdentificationBounds(
  subject: XrMotionReferenceSubject,
  enabled = false,
): XrSceneSubjectIdentificationBounds | null {
  if (!enabled) return null
  const asset = resolveXrSceneLibraryAsset(subject.assetId)
  const bounds = subject.construction ? resolveXrSubjectConstructionBounds(subject.construction) : null
  const [width, height, depth] = bounds ? bounds.max.map((value, index) => value - bounds.min[index]) : asset.dimensionsMeters
  return Object.freeze({
    name: `agentic_os_xr_scene_subject_identification_bounds_${subject.id}`,
    position: Object.freeze(bounds ? [(bounds.min[0] + bounds.max[0]) / 2, -(bounds.min[2] + bounds.max[2]) / 2, (bounds.min[1] + bounds.max[1]) / 2] as const : [0, 0, height / 2] as const),
    size: [width, depth, height] as [number, number, number],
    color: subject.color,
    userData: Object.freeze({
      source: 'xr-scene-library',
      subjectId: subject.id,
      assetId: subject.assetId,
      category: subject.category,
      label: subject.label,
    }),
  })
}

function Material({ color }: { color: string }) {
  return <meshStandardMaterial color={color} roughness={0.78} metalness={0.04} />
}

function XrProceduralPoiDetailKit({ poiId }: { poiId: string }) {
  const kit = resolveSingaporePoiDetailKitByPoiId(poiId)
  const build = React.useMemo(() => kit ? buildProceduralAsset(createSingaporePoiDetailKitRecipe(kit)) : null, [kit])
  React.useEffect(() => () => {
    if (build) disposeProceduralAsset(build.scene)
  }, [build])
  return build ? <primitive object={build.scene} /> : null
}

function resolveCharacterSilhouette(label?: string): 'pig' | 'wolf' | 'person' {
  const text = String(label || '').toLowerCase()
  if (text.includes('pig')) return 'pig'
  if (text.includes('wolf')) return 'wolf'
  return 'person'
}

function Humanoid({
  color,
  pose,
  size,
  silhouette = 'person',
}: {
  color: string
  pose?: XrAnimationPoseSample | null
  size: readonly [number, number, number]
  silhouette?: 'pig' | 'wolf' | 'person'
}) {
  const [width, height, depth] = size
  const crouchOffset = (pose?.crouch || 0) * height * 0.18
  const degrees = THREE.MathUtils.degToRad
  const arm = (side: -1 | 1) => {
    const pitch = side < 0 ? pose?.leftArmPitchDegrees || 0 : pose?.rightArmPitchDegrees || 0
    const roll = side < 0 ? pose?.leftArmRollDegrees || 0 : pose?.rightArmRollDegrees || 0
    return (
      <group
        key={side}
        position={[side * width * 0.48, 0, height * 0.68 - crouchOffset]}
        rotation={[degrees(pitch), degrees(roll), 0]}
      >
        <mesh position={[0, 0, -height * 0.16]} castShadow><boxGeometry args={[width * 0.16, depth * 0.58, height * 0.34]} /><Material color={color} /></mesh>
        {side > 0 && pose?.propCue === 'cup' ? <mesh position={[0, -depth * 0.2, -height * 0.38]}><cylinderGeometry args={[width * 0.11, width * 0.09, height * 0.16, 12]} /><meshStandardMaterial color="#e2e8f0" roughness={0.55} /></mesh> : null}
        {side > 0 && pose?.propCue === 'cards' ? <group position={[0, -depth * 0.22, -height * 0.36]}>{[-1, 0, 1].map(index => <mesh key={index} position={[index * width * 0.08, 0, Math.abs(index) * height * 0.018]} rotation={[0, 0, index * 0.16]}><boxGeometry args={[width * 0.13, depth * 0.035, height * 0.18]} /><meshStandardMaterial color="#f8fafc" roughness={0.72} /></mesh>)}</group> : null}
        {side > 0 && pose?.propCue === 'squirt-gun' ? <group position={[0, -depth * 0.26, -height * 0.36]}><mesh><boxGeometry args={[width * 0.18, depth * 0.34, height * 0.15]} /><meshStandardMaterial color="#22d3ee" roughness={0.5} /></mesh><mesh position={[0, -depth * 0.25, 0]}><cylinderGeometry args={[width * 0.035, width * 0.035, depth * 0.38, 8]} /><meshStandardMaterial color="#0ea5e9" roughness={0.5} /></mesh></group> : null}
      </group>
    )
  }
  return (
    <group>
      <mesh position={[0, 0, height * 0.55 - crouchOffset]} castShadow receiveShadow><boxGeometry args={[width * 0.72, depth, height * 0.54]} /><Material color={color} /></mesh>
      <mesh position={[0, 0, height * 0.9 - crouchOffset]} castShadow><sphereGeometry args={[width * 0.3, 16, 12]} /><Material color={color} /></mesh>
      {[-0.11, 0.11].map(x => (
        <mesh key={x} position={[x * width, depth * 0.22, height * 0.94 - crouchOffset]}>
          <sphereGeometry args={[width * 0.045, 8, 6]} />
          <meshStandardMaterial color="#0f172a" roughness={0.4} />
        </mesh>
      ))}
      {silhouette !== 'person' ? (
        <mesh position={[0, depth * 0.38, height * 0.86 - crouchOffset]} rotation={[-0.85, 0, 0]} castShadow>
          <coneGeometry args={[width * (silhouette === 'wolf' ? 0.11 : 0.13), height * (silhouette === 'wolf' ? 0.2 : 0.16), 8]} />
          <Material color={color} />
        </mesh>
      ) : null}
      {silhouette === 'pig' ? (
        <mesh position={[0, -depth * 0.34, height * 0.52 - crouchOffset]} rotation={[0.55, 0, 0]} castShadow>
          <cylinderGeometry args={[width * 0.05, width * 0.03, depth * 0.28, 6]} />
          <Material color={color} />
        </mesh>
      ) : null}
      {silhouette !== 'person' ? [-1, 1].map(side => (
        <mesh
          key={side}
          position={[side * width * (silhouette === 'wolf' ? 0.16 : 0.18), 0, height * 1.08 - crouchOffset]}
          rotation={[Math.PI / 2, 0, side * (silhouette === 'wolf' ? 0.55 : 0.35)]}
          castShadow
        >
          <coneGeometry args={[width * (silhouette === 'wolf' ? 0.08 : 0.1), height * (silhouette === 'wolf' ? 0.16 : 0.12), 6]} />
          <Material color={color} />
        </mesh>
      )) : null}
      {arm(-1)}
      {arm(1)}
      {([-1, 1] as const).map(side => (
        <group key={`leg:${side}`}
          position={[side * width * 0.2, 0, height * 0.2 - crouchOffset * 0.3]}
          rotation={[degrees((side < 0 ? pose?.leftLegPitchDegrees : pose?.rightLegPitchDegrees) || 0) + degrees((pose?.crouch || 0) * 42), 0, 0]}>
          <mesh castShadow><boxGeometry args={[width * 0.2, depth * 0.62, height * 0.4]} /><Material color={color} /></mesh>
        </group>
      ))}
    </group>
  )
}

function Quadruped({ color, size }: { color: string; size: readonly [number, number, number] }) {
  const [width, height, depth] = size
  return (
    <group>
      <mesh position={[0, 0, height * 0.58]}><boxGeometry args={[width, depth * 0.7, height * 0.42]} /><Material color={color} /></mesh>
      <mesh position={[0, -depth * 0.42, height * 0.72]}><sphereGeometry args={[width * 0.34, 14, 10]} /><Material color={color} /></mesh>
      {[-1, 1].flatMap(x => [-1, 1].map(y => (
        <mesh key={`${x}:${y}`} position={[x * width * 0.3, y * depth * 0.24, height * 0.22]}>
          <boxGeometry args={[width * 0.16, depth * 0.16, height * 0.44]} /><Material color={color} />
        </mesh>
      )))}
    </group>
  )
}

function Bicycle({ color, size }: { color: string; size: readonly [number, number, number] }) {
  const [width, height, depth] = size
  const radius = Math.min(height, depth * 0.32) * 0.42
  return (
    <group>
      {[-1, 1].map(y => (
        <mesh key={y} position={[0, y * depth * 0.35, radius]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[radius, Math.max(0.025, width * 0.05), 8, 22]} />
          <meshStandardMaterial color="#0f172a" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 0, radius * 1.2]} rotation={[Math.PI / 4, 0, 0]}><boxGeometry args={[width * 0.12, depth * 0.7, width * 0.12]} /><Material color={color} /></mesh>
      <mesh position={[0, -depth * 0.08, height * 0.78]}><boxGeometry args={[width * 0.7, width * 0.1, width * 0.1]} /><Material color={color} /></mesh>
    </group>
  )
}

function Debris({ color, size }: { color: string; size: readonly [number, number, number] }) {
  const [width, height, depth] = size
  const fragments = [
    [-0.28, -0.18, 0.18, 0.34, 0.28, 0.42],
    [0.24, -0.12, 0.42, 0.3, 0.36, 0.28],
    [-0.08, 0.2, 0.58, 0.48, 0.24, 0.22],
    [0.3, 0.22, 0.16, 0.22, 0.42, 0.34],
  ] as const
  return <group>{fragments.map((fragment, index) => <mesh key={index} position={[fragment[0] * width, fragment[1] * depth, fragment[2] * height]} rotation={[index * 0.31, index * 0.47, index * 0.23]}><boxGeometry args={[fragment[3] * width, fragment[4] * depth, fragment[5] * height]} /><Material color={color} /></mesh>)}</group>
}

function Chair({ color, size }: { color: string; size: readonly [number, number, number] }) {
  const [width, height, depth] = size
  return (
    <group>
      <mesh position={[0, 0, height * 0.48]}><boxGeometry args={[width, depth, height * 0.08]} /><Material color={color} /></mesh>
      <mesh position={[0, depth * 0.43, height * 0.72]}><boxGeometry args={[width, depth * 0.12, height * 0.5]} /><Material color={color} /></mesh>
      {[-1, 1].flatMap(x => [-1, 1].map(y => (
        <mesh key={`${x}:${y}`} position={[x * width * 0.4, y * depth * 0.38, height * 0.23]}><boxGeometry args={[width * 0.1, depth * 0.1, height * 0.46]} /><Material color={color} /></mesh>
      )))}
    </group>
  )
}

function Table({ color, size }: { color: string; size: readonly [number, number, number] }) {
  const [width, height, depth] = size
  return (
    <group>
      <mesh position={[0, 0, height * 0.9]}><boxGeometry args={[width, depth, height * 0.14]} /><Material color={color} /></mesh>
      {[-1, 1].flatMap(x => [-1, 1].map(y => (
        <mesh key={`${x}:${y}`} position={[x * width * 0.42, y * depth * 0.36, height * 0.43]}><boxGeometry args={[width * 0.08, depth * 0.08, height * 0.86]} /><Material color={color} /></mesh>
      )))}
    </group>
  )
}

function Sofa({ color, size }: { color: string; size: readonly [number, number, number] }) {
  const [width, height, depth] = size
  return (
    <group>
      <mesh position={[0, 0, height * 0.28]}><boxGeometry args={[width, depth, height * 0.5]} /><Material color={color} /></mesh>
      <mesh position={[0, depth * 0.38, height * 0.66]}><boxGeometry args={[width, depth * 0.22, height * 0.68]} /><Material color={color} /></mesh>
      {[-1, 1].map(x => <mesh key={x} position={[x * width * 0.46, 0, height * 0.52]}><boxGeometry args={[width * 0.08, depth, height * 0.42]} /><Material color={color} /></mesh>)}
    </group>
  )
}

function Cart({ color, size }: { color: string; size: readonly [number, number, number] }) {
  const [width, height, depth] = size
  return (
    <group>
      <mesh position={[0, 0, height * 0.58]}><boxGeometry args={[width, depth, height * 0.48]} /><meshStandardMaterial color={color} wireframe roughness={1} /></mesh>
      <mesh position={[0, depth * 0.46, height * 0.86]}><boxGeometry args={[width * 0.92, depth * 0.08, height * 0.08]} /><Material color={color} /></mesh>
      {[-1, 1].flatMap(x => [-1, 1].map(y => <mesh key={`${x}:${y}`} position={[x * width * 0.36, y * depth * 0.32, height * 0.12]} rotation={[0, Math.PI / 2, 0]}><cylinderGeometry args={[height * 0.11, height * 0.11, width * 0.08, 12]} /><meshStandardMaterial color="#0f172a" /></mesh>))}
    </group>
  )
}

function Tree({ color, size }: { color: string; size: readonly [number, number, number] }) {
  const [width, height, depth] = size
  const crown = Math.min(width, depth) * 0.4
  const bark = '#6b4423'
  const leafColors = [color, '#477d48', '#5b914d', '#6b9e58', '#397043']
  const foliage = Array.from({ length: 34 }, (_, index) => {
    const angle = index * 2.399963229728653
    const vertical = ((index * 7) % 17) / 16 * 2 - 1
    const ring = Math.sqrt(1 - vertical * vertical)
    const radius = crown * (0.38 + (index % 5) * 0.115)
    const leafRadius = crown * (0.2 + (index % 4) * 0.025)
    return {
      index,
      position: [Math.cos(angle) * ring * radius, Math.sin(angle) * ring * radius, vertical * crown * 0.78] as const,
      scale: [1 + (index % 3) * 0.12, 0.78 + (index % 4) * 0.08, 0.82 + (index % 5) * 0.08] as const,
      leafRadius,
      leafColor: leafColors[(index * 3) % leafColors.length],
    }
  })
  return (
    <group name="agentic_os_xr_procedural_tree">
      <mesh position={[0, 0, height * 0.07]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[width * 0.19, width * 0.34, height * 0.14, 12]} />
        <meshStandardMaterial color="#5c3b1f" roughness={1} />
      </mesh>
      <mesh position={[0, 0, height * 0.37]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[width * 0.065, width * 0.2, height * 0.66, 12]} />
        <meshStandardMaterial color={bark} roughness={1} />
      </mesh>
      {([-1, 1] as const).map(side => (
        <mesh
          key={side}
          position={[side * width * 0.11, 0, height * 0.53]}
          rotation={[0.45, 0, -side * 0.72]}
          castShadow
        >
          <cylinderGeometry args={[width * 0.025, width * 0.055, height * 0.42, 8]} />
          <meshStandardMaterial color={bark} roughness={1} />
        </mesh>
      ))}
      <group position={[0, 0, height * 0.77]}>
        {foliage.map(leaf => <mesh key={leaf.index} position={leaf.position} scale={leaf.scale} castShadow receiveShadow>
          <icosahedronGeometry args={[leaf.leafRadius, 1]} />
          <meshStandardMaterial color={leaf.leafColor} roughness={0.96} flatShading />
        </mesh>)}
      </group>
    </group>
  )
}

function Lamp({ color, size }: { color: string; size: readonly [number, number, number] }) {
  const [width, height] = size
  return (
    <group>
      <mesh position={[0, 0, height * 0.48]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[width * 0.08, width * 0.12, height * 0.96, 10]} />
        <meshStandardMaterial color="#475569" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0, height]}><sphereGeometry args={[width * 0.3, 12, 8]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} /></mesh>
    </group>
  )
}

function Umbrella({ color, size }: { color: string; size: readonly [number, number, number] }) {
  const [width, height] = size
  return (
    <group>
      <mesh position={[0, 0, height * 0.48]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[width * 0.025, width * 0.035, height * 0.96, 10]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      <mesh position={[0, 0, height * 0.94]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[width * 0.5, height * 0.25, 18, 1, true]} />
        <meshStandardMaterial color={color} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

export function XrSceneLibraryAssetGeometry({
  assetId,
  color,
  animationPose,
  label,
}: {
  assetId: string
  color?: string
  animationPose?: XrAnimationPoseSample | null
  label?: string
}) {
  const asset = resolveXrSceneLibraryAsset(assetId)
  const size = asset.dimensionsMeters
  const effectiveColor = color || asset.defaultColor
  if (asset.poiDetailKitId) return <XrProceduralPoiDetailKit poiId={asset.poiDetailKitId} />
  const character = asset.id === 'character-pig' ? 'pig' : asset.id === 'character-wolf' ? 'wolf' : asset.id === 'character-monkey' ? 'monkey' : resolveCharacterSilhouette(label)
  if (asset.shape === 'humanoid' && character !== 'person') return <XrStoryCharacter kind={character} color={effectiveColor} pose={animationPose} size={size} />
  if (asset.shape === 'sailboat') return <XrSailboatGeometry color={effectiveColor} size={size} />
  if (asset.shape === 'humanoid') return <Humanoid color={effectiveColor} pose={animationPose} size={size} silhouette={resolveCharacterSilhouette(label)} />
  if (asset.shape === 'quadruped') return <Quadruped color={effectiveColor} size={size} />
  if (asset.shape === 'car') return <XrProceduralVehicleGeometry kind="car" color={effectiveColor} size={size} />
  if (asset.shape === 'bicycle') return <Bicycle color={effectiveColor} size={size} />
  if (asset.shape === 'helicopter') return <XrProceduralVehicleGeometry kind="helicopter" color={effectiveColor} size={size} />
  if (asset.shape === 'ball') return <XrProceduralBallGeometry diameterMeters={Math.max(...size)} accentColor={effectiveColor} />
  if (asset.shape === 'debris') return <Debris color={effectiveColor} size={size} />
  if (asset.shape === 'chair') return <Chair color={effectiveColor} size={size} />
  if (asset.shape === 'table') return <Table color={effectiveColor} size={size} />
  if (asset.shape === 'sofa') return <Sofa color={effectiveColor} size={size} />
  if (asset.shape === 'cart') return <Cart color={effectiveColor} size={size} />
  if (asset.shape === 'tree') return <Tree color={effectiveColor} size={size} />
  if (asset.shape === 'lamp') return <Lamp color={effectiveColor} size={size} />
  if (asset.shape === 'umbrella') return <Umbrella color={effectiveColor} size={size} />
  return <XrProceduralHouseGeometry color={effectiveColor} label={asset.id.startsWith('prop-house-') ? asset.id : asset.id === 'prop-soup-pot' ? 'Soup Pot' : label} size={size} />
}

export function XrSceneLibrarySubject({
  animationPose,
  presentation,
  facingYRadians = 0,
  subject,
  position,
  stageScale,
  selected = false,
  showIdentificationBounds = false,
  onSelect,
}: {
  animationPose?: XrAnimationPoseSample | null
  presentation?: XrStoryPresentation
  facingYRadians?: number
  subject: XrMotionReferenceSubject
  position: readonly [number, number, number]
  stageScale: number
  selected?: boolean
  showIdentificationBounds?: boolean
  onSelect?: () => void
}) {
  const hover = useXrSubjectHover()
  React.useEffect(() => () => hover?.remove(subject.id), [hover, subject.id])
  React.useEffect(() => { if (presentation?.visible === false) hover?.remove(subject.id) }, [hover, subject.id, presentation?.visible])
  if (presentation?.visible === false) return null
  const asset = resolveXrSceneLibraryAsset(subject.assetId)
  const identificationBounds = resolveXrSceneSubjectIdentificationBounds(subject, showIdentificationBounds && !selected)
  const rootOffset = animationPose?.rootOffsetMeters || [0, 0, 0]
  const rootRotation = animationPose?.rootRotationDegrees || [0, 0, 0]
  return (
    <group
      name={`agentic_os_xr_scene_subject_${subject.id}`}
      position={position}
      rotation={[
        0,
        THREE.MathUtils.degToRad(subject.rotationYDegrees + (asset.orientationOffsetYDegrees || 0)) + facingYRadians,
        0,
      ]}
      scale={stageScale * subject.scale}
      userData={{
        subjectId: subject.id,
        assetId: subject.assetId,
        category: subject.category,
        label: subject.label,
        selectable: Boolean(onSelect),
        selected,
        kgXrSharedAssetTarget: subject.id,
        kgXrSharedAssetSelected: selected,
        kgXrTimelineHighlight: selected ? 'shared-asset' : '',
      }}
      onPointerOver={hover ? event => { event.stopPropagation(); hover.show(subject, event) } : undefined}
      onPointerMove={hover ? event => { event.stopPropagation(); hover.show(subject, event) } : undefined}
      onPointerOut={hover ? () => hover.leave(subject.id) : undefined}
      onClick={onSelect ? event => {
        event.stopPropagation()
        hover?.show(subject, event)
        onSelect()
      } : undefined}
    >
      <group
        scale={presentation?.cue === 'build' ? Math.max(0.02, presentation.progress) : 1}
        position={rootOffset}
        rotation={rootRotation.map(THREE.MathUtils.degToRad) as [number, number, number]}
      >
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <XrSelectionBounds selected={selected} targetId={subject.id}>
          {presentation?.cue !== 'collapse' ? subject.construction ? <XrAuthoredSubjectGeometry construction={subject.construction} /> : <XrSceneLibraryAssetGeometry assetId={subject.assetId} color={subject.color} animationPose={animationPose} label={subject.label} /> : null}
          {presentation ? <XrStoryEffect presentation={presentation} size={asset.dimensionsMeters} color={subject.color} /> : null}
          </XrSelectionBounds>
          {identificationBounds ? (
            <mesh
              name={identificationBounds.name}
              position={identificationBounds.position}
              renderOrder={THREE_RENDER_ORDER.overlays - 1}
              userData={identificationBounds.userData}
            >
              <boxGeometry args={identificationBounds.size} />
              <meshBasicMaterial
                color={identificationBounds.color}
                transparent
                opacity={0.82}
                wireframe
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          ) : null}
        </group>
      </group>
    </group>
  )
}

export function PathSegment({
  left,
  right,
  scale,
  groundY,
  color,
  thickness,
}: {
  left: readonly [number, number, number]
  right: readonly [number, number, number]
  scale: number
  groundY: number
  color: string
  thickness: number
}) {
  const start = xrMotionReferenceWorldPosition(left, scale, groundY)
  const end = xrMotionReferenceWorldPosition(right, scale, groundY)
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const dz = end[2] - start[2]
  const length = Math.hypot(dx, dy, dz)
  if (length < 0.001) return null
  const direction = new THREE.Vector3(dx, dy, dz).normalize()
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction)
  return (
    <mesh
      position={[(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2]}
      quaternion={quaternion}
    >
      <boxGeometry args={[length, thickness, thickness]} />
      <meshBasicMaterial color={color} transparent opacity={0.66} depthWrite={false} />
    </mesh>
  )
}

export function MarkNumberSprite({
  number,
  color,
  position,
  selected,
  size,
}: {
  number: number
  color: string
  position: readonly [number, number, number]
  selected: boolean
  size: number
}) {
  const label = React.useMemo(() => {
    if (typeof document === 'undefined') return null
    return getVoxelLabelTexture({
      text: String(number),
      fontSizePx: 24,
      textColor: selected ? '#0f172a' : '#ffffff',
      bgColor: selected ? XR_MOTION_REFERENCE_SELECTION_COLOR : color,
      bgOpacity: selected ? 1 : 0.96,
    })
  }, [color, number, selected])
  if (!label) return null
  const aspect = label.widthPx / Math.max(1, label.heightPx)
  return (
    <sprite position={position} scale={[size * (selected ? 1.9 : 1.45) * aspect, size * (selected ? 1.9 : 1.45), 1]} renderOrder={THREE_RENDER_ORDER.overlays}>
      <spriteMaterial map={label.texture} transparent depthTest={false} depthWrite={false} />
    </sprite>
  )
}
