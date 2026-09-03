import React from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Canvas3dModeId } from '@/lib/config'
import type { GlbAssetDocument } from '@/lib/assets/glbAssetDocument'
import { loadModelAssetRenderPayload } from '@/lib/assets/modelAssetPayload'
import { hashSignatureParts } from '@/lib/hash/signature'
import { hashStringToHexCached } from '@/lib/hash/textHashCache'

export type GlbFit = {
  cameraProfile?: 'spatial-capture'
  cameraTarget?: [number, number, number]
  position: [number, number, number]
  scale: number
  floorY: number
  stageSpan: number
  preserveFlatFacing: boolean
  flatAxis: 'x' | 'y' | 'z' | null
  size: [number, number, number]
  scaledSize: [number, number, number]
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function disposeObject3d(object: THREE.Object3D): void {
  object.traverse(child => {
    const mesh = child as THREE.Mesh
    const geometry = mesh.geometry as THREE.BufferGeometry | undefined
    if (geometry && typeof geometry.dispose === 'function') {
      try {
        geometry.dispose()
      } catch {
        void 0
      }
    }
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined
    const materials = Array.isArray(material) ? material : material ? [material] : []
    for (const mat of materials) {
      try {
        mat.dispose()
      } catch {
        void 0
      }
    }
  })
}

function prepareModelObject(object: THREE.Object3D, name: string): void {
  object.name = name || object.name || 'Model asset'
  object.traverse(child => {
    const mesh = child as THREE.Mesh
    if (!mesh || !(mesh as unknown as { isMesh?: boolean }).isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
  })
}

export function buildGlbAssetRenderKey(asset: GlbAssetDocument, documentSemanticKey?: string): string {
  const dataUrl = String(asset.dataUrl || '')
  const dataUrlHash = dataUrl
    ? hashStringToHexCached(
        `model-asset-render:${asset.format}:${asset.name}:${asset.byteLength ?? dataUrl.length}`,
        dataUrl,
      )
    : ''
  return hashSignatureParts([
    'model-asset-render',
    String(documentSemanticKey || ''),
    asset.format,
    asset.name,
    asset.mimeType,
    asset.byteLength ?? '',
    asset.pendingLocalImport === true ? 'pending:1' : 'pending:0',
    asset.pendingLocalImportPath || '',
    asset.sourceUrl || '',
    asset.validMagic === false ? 'magic:0' : asset.validMagic === true ? 'magic:1' : 'magic:',
    asset.validContainer === false ? 'container:0' : asset.validContainer === true ? 'container:1' : 'container:',
    asset.validJson === false ? 'json:0' : asset.validJson === true ? 'json:1' : 'json:',
    asset.validGltfAsset === false ? 'gltf:0' : asset.validGltfAsset === true ? 'gltf:1' : 'gltf:',
    dataUrl.length,
    dataUrlHash,
  ])
}

export function computeGlbFit(object: THREE.Object3D | null): GlbFit {
  if (!object) {
    return { position: [0, 0, 0], scale: 1, floorY: -48, stageSpan: 180, preserveFlatFacing: false, flatAxis: null, size: [0, 0, 0], scaledSize: [0, 0, 0] }
  }
  const box = new THREE.Box3().setFromObject(object)
  if (box.isEmpty()) {
    return { position: [0, 0, 0], scale: 1, floorY: -48, stageSpan: 180, preserveFlatFacing: false, flatAxis: null, size: [0, 0, 0], scaledSize: [0, 0, 0] }
  }
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)
  const maxDim = Math.max(size.x, size.y, size.z)
  const minDim = Math.min(size.x, size.y, size.z)
  const preserveFlatFacing = maxDim > 0 && Number.isFinite(maxDim) && minDim <= maxDim * 0.015
  const flatAxis = preserveFlatFacing
    ? (size.x <= size.y && size.x <= size.z ? 'x' : size.y <= size.z ? 'y' : 'z')
    : null
  const targetMaxDim = preserveFlatFacing ? 92 : 118
  const scale = maxDim > 0 && Number.isFinite(maxDim) ? clamp(targetMaxDim / maxDim, 0.0001, 10000) : 1
  const floorY = (box.min.y - center.y) * scale
  const stageSpan = clamp(Math.max(size.x, size.z, maxDim) * scale * 2.8, 120, 520)
  return {
    position: [-center.x * scale, -center.y * scale, -center.z * scale],
    scale,
    floorY,
    stageSpan,
    preserveFlatFacing,
    flatAxis,
    size: [size.x, size.y, size.z],
    scaledSize: [size.x * scale, size.y * scale, size.z * scale],
  }
}

export function GlbAssetModel({
  asset,
  lightingProfile = 'default',
  paused,
  standalone,
  onLoad,
  onError,
  onFitChange,
}: {
  asset: GlbAssetDocument
  lightingProfile?: 'default' | 'reference-studio'
  mode?: Canvas3dModeId
  paused?: boolean
  standalone?: boolean
  onLoad?: (object: THREE.Object3D) => void
  onError?: (error: unknown) => void
  onFitChange?: (fit: GlbFit | null) => void
}) {
  const [object, setObject] = React.useState<THREE.Object3D | null>(null)
  const [failed, setFailed] = React.useState(false)
  const mixerRef = React.useRef<THREE.AnimationMixer | null>(null)
  const loadIdRef = React.useRef(0)
  const onLoadRef = React.useRef(onLoad)
  const onErrorRef = React.useRef(onError)
  const assetRenderKey = React.useMemo(() => buildGlbAssetRenderKey(asset), [asset])

  React.useEffect(() => {
    onLoadRef.current = onLoad
    onErrorRef.current = onError
  }, [onError, onLoad])

  React.useEffect(() => {
    const loadId = loadIdRef.current + 1
    loadIdRef.current = loadId
    let cancelled = false
    let loadedObject: THREE.Object3D | null = null
    let loadedMixer: THREE.AnimationMixer | null = null
    const isStaleLoad = () => cancelled || loadIdRef.current !== loadId
    const failLoad = (error: unknown) => {
      if (isStaleLoad()) return
      setFailed(true)
      onErrorRef.current?.(error)
    }
    mixerRef.current = null
    setObject(null)
    setFailed(false)

    const load = async () => {
      try {
        const payload = await loadModelAssetRenderPayload(asset)
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
        const loader = new GLTFLoader()
        loader.parse(
          payload.loaderInput,
          payload.basePath,
          gltf => {
            const scene = gltf.scene || gltf.scenes?.[0] || null
            if (!scene) {
              failLoad(new Error('GLTFLoader returned no renderable scene.'))
              return
            }
            prepareModelObject(scene, asset.name)
            if (Array.isArray(gltf.animations) && gltf.animations.length > 0) {
              loadedMixer = new THREE.AnimationMixer(scene)
              for (const clip of gltf.animations) {
                try {
                  loadedMixer.clipAction(clip).play()
                } catch {
                  void 0
                }
              }
            }
            if (isStaleLoad()) {
              try {
                loadedMixer?.stopAllAction()
                loadedMixer?.uncacheRoot(scene)
              } catch {
                void 0
              }
              disposeObject3d(scene)
              return
            }
            loadedObject = scene
            mixerRef.current = loadedMixer
            setObject(scene)
            onLoadRef.current?.(scene)
          },
          failLoad,
        )
      } catch (error) {
        failLoad(error)
      }
    }

    void load()
    return () => {
      cancelled = true
      mixerRef.current = null
      if (loadedMixer && loadedObject) {
        try {
          loadedMixer.stopAllAction()
          loadedMixer.uncacheRoot(loadedObject)
        } catch {
          void 0
        }
      }
      if (loadedObject) {
        disposeObject3d(loadedObject)
        loadedObject = null
      }
    }
  }, [asset, assetRenderKey])

  const fit = React.useMemo(() => computeGlbFit(object), [object])

  React.useEffect(() => {
    onFitChange?.(object ? fit : null)
  }, [fit, object, onFitChange])

  useFrame((_, delta) => {
    if (paused) return
    try {
      mixerRef.current?.update(delta)
    } catch {
      void 0
    }
  })

  return (
    <group name="agentic_os_model_asset_scene">
      {standalone ? (
        lightingProfile === 'reference-studio' ? (
          <>
            <ambientLight intensity={0.68} color="#fffaf0" />
            <hemisphereLight args={['#fff7ed', '#8b735b', 0.78]} />
            <directionalLight castShadow position={[110, 145, 155]} intensity={1.18} color="#fff1d6" shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
            <pointLight position={[-105, 62, 112]} intensity={0.28} color="#f8fafc" />
          </>
        ) : (
          <>
            <ambientLight intensity={0.82} />
            <hemisphereLight args={['#ffffff', '#94a3b8', 0.55]} />
            <directionalLight castShadow position={[96, 130, 160]} intensity={0.96} color="#ffffff" shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
            <pointLight position={[-120, 80, 120]} intensity={0.35} color="#bfdbfe" />
          </>
        )
      ) : null}
      {object ? (
        <group
          key={assetRenderKey}
          name={`agentic_os_model_asset:${asset.name}`}
          position={fit.position}
          scale={[fit.scale, fit.scale, fit.scale]}
          dispose={null}
        >
          <primitive object={object} />
        </group>
      ) : failed ? (
        <mesh name="agentic_os_model_asset_load_error" position={[0, 0, 0]}>
          <boxGeometry args={[48, 48, 48]} />
          <meshStandardMaterial color="#ef4444" roughness={0.55} metalness={0.08} wireframe />
        </mesh>
      ) : null}
    </group>
  )
}
