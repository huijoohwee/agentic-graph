import React from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { XrSceneMediaDragProjection } from '@/lib/ui/mediaDragPayload'
import {
  resolveXrMotionReferenceStage,
  resolveXrSceneLibraryAsset,
  type XrMotionReferenceStageId,
} from './xrSceneLibrary'
import { XrStagePresetGeometry } from './XrStagePresetGeometry'
import { XrSceneLibraryAssetGeometry } from './XrSceneLibrarySubject'

const XR_MEDIA_STAGE_SPAN = 12

type XrSceneMediaCameraPlacement = Readonly<{
  maxDistance: number
  minDistance: number
  position: readonly [number, number, number]
  target: readonly [number, number, number]
}>

function computeXrSceneMediaCameraPlacement(
  projection: XrSceneMediaDragProjection,
): XrSceneMediaCameraPlacement {
  if (projection.entityKind === 'environment') {
    const stage = resolveXrMotionReferenceStage(projection.entityId as XrMotionReferenceStageId)
    const scale = XR_MEDIA_STAGE_SPAN / Math.max(stage.sizeMeters[0], stage.sizeMeters[1], 1)
    const width = stage.sizeMeters[0] * scale
    const depth = stage.sizeMeters[1] * scale
    const structureHeight = stage.structures.reduce((max, structure) => (
      Math.max(max, (structure.position[1] + structure.size[1] / 2) * scale)
    ), 1)
    const radius = Math.max(width, depth, structureHeight * 1.6, 4)
    return {
      position: [radius * 0.82, Math.max(radius * 0.62, structureHeight * 1.2), radius * 0.92],
      target: [0, Math.max(0.5, structureHeight * 0.3), 0],
      minDistance: Math.max(1, radius * 0.16),
      maxDistance: radius * 6,
    }
  }
  const asset = resolveXrSceneLibraryAsset(projection.entityId)
  const [width, height, depth] = asset.dimensionsMeters
  const radius = Math.max(width, height, depth, 0.8)
  return {
    position: [radius * 1.45, Math.max(height * 0.9, radius * 0.92), radius * 1.75],
    target: [0, height * 0.48, 0],
    minDistance: Math.max(0.12, radius * 0.18),
    maxDistance: radius * 10,
  }
}

function XrSceneMediaCameraControls({ projection }: { projection: XrSceneMediaDragProjection }) {
  const { camera, gl, invalidate, size } = useThree()
  const placement = React.useMemo(() => computeXrSceneMediaCameraPlacement(projection), [projection])
  const controls = React.useMemo(() => {
    const next = new OrbitControls(camera, gl.domElement)
    next.enableDamping = true
    next.dampingFactor = 0.07
    next.enablePan = true
    next.enableRotate = true
    next.enableZoom = true
    next.rotateSpeed = 0.68
    next.zoomSpeed = 0.82
    next.panSpeed = 0.7
    next.screenSpacePanning = true
    next.zoomToCursor = true
    next.minPolarAngle = 0.04
    next.maxPolarAngle = Math.PI / 2 - 0.015
    return next
  }, [camera, gl.domElement])

  React.useEffect(() => {
    const handleChange = () => invalidate()
    controls.addEventListener('change', handleChange)
    return () => {
      controls.removeEventListener('change', handleChange)
      controls.dispose()
    }
  }, [controls, invalidate])

  React.useLayoutEffect(() => {
    camera.position.set(...placement.position)
    camera.up.set(0, 1, 0)
    controls.target.set(...placement.target)
    controls.minDistance = placement.minDistance
    controls.maxDistance = placement.maxDistance
    controls.update()
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = size.width / Math.max(1, size.height)
      camera.near = Math.max(0.01, placement.minDistance * 0.08)
      camera.far = Math.max(200, placement.maxDistance * 3)
      camera.updateProjectionMatrix()
    }
    invalidate()
  }, [camera, controls, invalidate, placement, size.height, size.width])

  useFrame((_, delta) => {
    if (controls.update(delta)) invalidate()
  })
  return null
}

function XrSceneMediaContent({ projection }: { projection: XrSceneMediaDragProjection }) {
  if (projection.entityKind === 'environment') {
    const stage = resolveXrMotionReferenceStage(projection.entityId as XrMotionReferenceStageId)
    return (
      <XrStagePresetGeometry
        stage={stage}
        span={XR_MEDIA_STAGE_SPAN}
        minAxesSize={0.8}
        minFloorThickness={0.08}
        shadows
      />
    )
  }
  const asset = resolveXrSceneLibraryAsset(projection.entityId)
  const floorSize = Math.max(4, asset.dimensionsMeters[0] * 3, asset.dimensionsMeters[2] * 3)
  return (
    <group name={`agentic_os_xr_scene_media_asset_${asset.id}`} userData={{ assetId: asset.id, category: asset.category }}>
      <mesh position={[0, -0.035, 0]} receiveShadow>
        <cylinderGeometry args={[floorSize * 0.42, floorSize * 0.48, 0.07, 48]} />
        <meshStandardMaterial color="#475569" roughness={1} metalness={0} transparent opacity={0.72} />
      </mesh>
      <gridHelper args={[floorSize, 12, '#38bdf8', '#334155']} position={[0, 0.005, 0]} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <XrSceneLibraryAssetGeometry assetId={asset.id} color={asset.defaultColor} />
      </group>
    </group>
  )
}

export function XrSceneMediaSurface({
  projection,
  title,
  onReady,
}: {
  projection: XrSceneMediaDragProjection
  title: string
  onReady?: () => void
}) {
  return (
    <section
      aria-label={`${projection.label} 3D for XR preview`}
      className="relative h-full w-full overflow-hidden"
      data-kg-rich-media-xr-scene="native-three"
      data-kg-rich-media-xr-entity-kind={projection.entityKind}
      data-kg-rich-media-xr-entity-id={projection.entityId}
      data-kg-card-media-interactive="1"
      data-kg-rich-media-interaction-owner="1"
      data-kg-local-wheel-owner="1"
      tabIndex={0}
      title={`${title}: drag to orbit · right-drag to pan · scroll or pinch to zoom`}
      onContextMenu={event => {
        event.preventDefault()
        event.stopPropagation()
      }}
      style={{
        background: 'radial-gradient(circle at 48% 30%, rgba(224,242,254,0.88), rgba(71,85,105,0.24))',
        pointerEvents: 'auto',
      }}
    >
      <Canvas
        camera={{ position: [8, 6, 9], fov: 38, near: 0.01, far: 500 }}
        dpr={[1, 2]}
        frameloop="demand"
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.04
          onReady?.()
        }}
        shadows
        style={{ pointerEvents: 'auto' }}
      >
        <XrSceneMediaCameraControls projection={projection} />
        <ambientLight intensity={1.15} />
        <hemisphereLight args={['#e0f2fe', '#334155', 1.05]} />
        <directionalLight position={[8, 12, 9]} intensity={2.1} castShadow />
        <directionalLight position={[-7, 5, -6]} intensity={0.55} />
        <XrSceneMediaContent projection={projection} />
      </Canvas>
      <span className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-5rem)] truncate rounded-full border border-sky-300/70 bg-slate-950/75 px-2 py-0.5 text-[10px] font-medium tracking-wide text-sky-100">
        {projection.label}
      </span>
      <span
        className="pointer-events-none absolute bottom-2 right-2 rounded-full border border-sky-300/70 bg-slate-950/75 px-2 py-0.5 text-[10px] font-medium tracking-wide text-sky-100"
        data-kg-rich-media-xr-native-badge="1"
      >
        Native Three.js · XR
      </span>
    </section>
  )
}
