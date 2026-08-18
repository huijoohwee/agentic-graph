import React from 'react'
import * as THREE from 'three'
import { getVoxelLabelTexture } from '@/features/three/voxelLabelTexture'
import { THREE_RENDER_ORDER } from '@/features/three/renderOrder'
import { resolveXrSceneLibraryAsset } from '@/features/three/xrSceneLibrary'
import { XrProceduralBallGeometry } from '@/features/three/XrProceduralBallGeometry'
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
  const [width, height, depth] = asset.dimensionsMeters
  return Object.freeze({
    name: `kg_xr_scene_subject_identification_bounds_${subject.id}`,
    position: Object.freeze([0, 0, height / 2] as const),
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
  return <meshStandardMaterial color={color} roughness={0.9} metalness={0.02} />
}

function Humanoid({ color, pose, size }: { color: string; pose?: XrAnimationPoseSample | null; size: readonly [number, number, number] }) {
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
        <mesh position={[0, 0, -height * 0.16]}><boxGeometry args={[width * 0.16, depth * 0.58, height * 0.34]} /><Material color={color} /></mesh>
        {side > 0 && pose?.propCue === 'cup' ? <mesh position={[0, -depth * 0.2, -height * 0.38]}><cylinderGeometry args={[width * 0.11, width * 0.09, height * 0.16, 12]} /><meshStandardMaterial color="#e2e8f0" roughness={0.55} /></mesh> : null}
        {side > 0 && pose?.propCue === 'cards' ? <group position={[0, -depth * 0.22, -height * 0.36]}>{[-1, 0, 1].map(index => <mesh key={index} position={[index * width * 0.08, 0, Math.abs(index) * height * 0.018]} rotation={[0, 0, index * 0.16]}><boxGeometry args={[width * 0.13, depth * 0.035, height * 0.18]} /><meshStandardMaterial color="#f8fafc" roughness={0.72} /></mesh>)}</group> : null}
        {side > 0 && pose?.propCue === 'squirt-gun' ? <group position={[0, -depth * 0.26, -height * 0.36]}><mesh><boxGeometry args={[width * 0.18, depth * 0.34, height * 0.15]} /><meshStandardMaterial color="#22d3ee" roughness={0.5} /></mesh><mesh position={[0, -depth * 0.25, 0]}><cylinderGeometry args={[width * 0.035, width * 0.035, depth * 0.38, 8]} /><meshStandardMaterial color="#0ea5e9" roughness={0.5} /></mesh></group> : null}
      </group>
    )
  }
  return (
    <group>
      <mesh position={[0, 0, height * 0.55 - crouchOffset]}><boxGeometry args={[width * 0.72, depth, height * 0.54]} /><Material color={color} /></mesh>
      <mesh position={[0, 0, height * 0.9 - crouchOffset]}><sphereGeometry args={[width * 0.3, 16, 12]} /><Material color={color} /></mesh>
      {arm(-1)}
      {arm(1)}
      <mesh position={[-width * 0.2, 0, height * 0.2 - crouchOffset * 0.3]} rotation={[degrees((pose?.crouch || 0) * 42), 0, 0]}><boxGeometry args={[width * 0.2, depth * 0.62, height * 0.4]} /><Material color={color} /></mesh>
      <mesh position={[width * 0.2, 0, height * 0.2 - crouchOffset * 0.3]} rotation={[degrees((pose?.crouch || 0) * 42), 0, 0]}><boxGeometry args={[width * 0.2, depth * 0.62, height * 0.4]} /><Material color={color} /></mesh>
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
  return (
    <group>
      <mesh position={[0, 0, height * 0.34]}><cylinderGeometry args={[width * 0.11, width * 0.16, height * 0.68, 10]} /><meshStandardMaterial color="#854d0e" roughness={1} /></mesh>
      <mesh position={[0, 0, height * 0.76]}><sphereGeometry args={[Math.min(width, depth) * 0.5, 16, 12]} /><Material color={color} /></mesh>
    </group>
  )
}

function Lamp({ color, size }: { color: string; size: readonly [number, number, number] }) {
  const [width, height] = size
  return (
    <group>
      <mesh position={[0, 0, height * 0.48]}><cylinderGeometry args={[width * 0.08, width * 0.12, height * 0.96, 10]} /><meshStandardMaterial color="#475569" roughness={0.8} /></mesh>
      <mesh position={[0, 0, height]}><sphereGeometry args={[width * 0.3, 12, 8]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} /></mesh>
    </group>
  )
}

function Umbrella({ color, size }: { color: string; size: readonly [number, number, number] }) {
  const [width, height] = size
  return (
    <group>
      <mesh position={[0, 0, height * 0.48]}><cylinderGeometry args={[width * 0.025, width * 0.035, height * 0.96, 10]} /><meshStandardMaterial color="#475569" /></mesh>
      <mesh position={[0, 0, height * 0.94]}><coneGeometry args={[width * 0.5, height * 0.25, 18, 1, true]} /><meshStandardMaterial color={color} roughness={0.9} side={THREE.DoubleSide} /></mesh>
    </group>
  )
}

export function XrSceneLibraryAssetGeometry({
  assetId,
  color,
  animationPose,
}: {
  assetId: string
  color?: string
  animationPose?: XrAnimationPoseSample | null
}) {
  const asset = resolveXrSceneLibraryAsset(assetId)
  const size = asset.dimensionsMeters
  const effectiveColor = color || asset.defaultColor
  if (asset.shape === 'humanoid') return <Humanoid color={effectiveColor} pose={animationPose} size={size} />
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
  return <mesh position={[0, 0, size[1] * 0.5]}><boxGeometry args={[size[0], size[2], size[1]]} /><Material color={effectiveColor} /></mesh>
}

function SubjectLabel({
  heightMeters,
  label,
  selected,
}: {
  heightMeters: number
  label: string
  selected: boolean
}) {
  const labelTexture = React.useMemo(() => getVoxelLabelTexture({
    text: label,
    fontSizePx: 18,
    textColor: selected ? '#0f172a' : '#f8fafc',
    bgColor: selected ? XR_MOTION_REFERENCE_SELECTION_COLOR : '#0f172a',
    bgOpacity: selected ? 1 : 0.88,
  }), [label, selected])
  const aspect = labelTexture.widthPx / Math.max(1, labelTexture.heightPx)
  return (
    <sprite
      position={[0, 0, heightMeters + 0.45]}
      scale={[Math.min(3.2, Math.max(1.2, aspect * 0.5)), 0.5, 1]}
      renderOrder={selected ? THREE_RENDER_ORDER.overlays : undefined}
    >
      <spriteMaterial map={labelTexture.texture} transparent depthTest={!selected} depthWrite={false} sizeAttenuation />
    </sprite>
  )
}

export function XrSceneLibrarySubject({
  animationPose,
  facingYRadians = 0,
  subject,
  position,
  stageScale,
  selected = false,
  showIdentificationBounds = false,
  onSelect,
}: {
  animationPose?: XrAnimationPoseSample | null
  facingYRadians?: number
  subject: XrMotionReferenceSubject
  position: readonly [number, number, number]
  stageScale: number
  selected?: boolean
  showIdentificationBounds?: boolean
  onSelect?: () => void
}) {
  const asset = resolveXrSceneLibraryAsset(subject.assetId)
  const identificationBounds = resolveXrSceneSubjectIdentificationBounds(subject, showIdentificationBounds)
  const selectionRadius = Math.max(asset.dimensionsMeters[0], asset.dimensionsMeters[2], 0.8) * 0.72
  const rootOffset = animationPose?.rootOffsetMeters || [0, 0, 0]
  const rootRotation = animationPose?.rootRotationDegrees || [0, 0, 0]
  return (
    <group
      name={`kg_xr_scene_subject_${subject.id}`}
      position={position}
      rotation={[0, THREE.MathUtils.degToRad(subject.rotationYDegrees) + facingYRadians, 0]}
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
      onClick={onSelect ? event => {
        event.stopPropagation()
        onSelect()
      } : undefined}
    >
      {selected ? (
        <mesh
          name={`kg_xr_scene_subject_selected_${subject.id}`}
          position={[0, 0.04, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={THREE_RENDER_ORDER.overlays}
          userData={{
            subjectId: subject.id,
            selected: true,
            kgXrSharedAssetTarget: subject.id,
            kgXrSharedAssetSelected: true,
            kgXrTimelineHighlight: 'shared-asset',
          }}
        >
          <ringGeometry args={[selectionRadius * 0.72, selectionRadius, 32]} />
          <meshBasicMaterial
            color={XR_MOTION_REFERENCE_SELECTION_COLOR}
            transparent
            opacity={0.98}
            depthTest={false}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ) : null}
      <group
        position={rootOffset}
        rotation={rootRotation.map(THREE.MathUtils.degToRad) as [number, number, number]}
      >
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <XrSceneLibraryAssetGeometry assetId={subject.assetId} color={subject.color} animationPose={animationPose} />
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
          <SubjectLabel label={subject.label} heightMeters={asset.dimensionsMeters[1]} selected={selected} />
        </group>
      </group>
    </group>
  )
}
