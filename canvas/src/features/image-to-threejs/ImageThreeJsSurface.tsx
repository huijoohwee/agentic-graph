import React from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { resolveImageToThreeJsSourceKind } from './imageToThreeJsContract'
import {
  getRasterImageDimensions,
  type RasterImageSource,
} from './imageReferencePixels'

import { buildRasterReliefGeometry } from './imageRasterReliefGeometry'

type LoadState = 'loading' | 'ready' | 'error'


export function disposeImageThreeJsObject(root: THREE.Object3D) {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry?.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach(material => material.dispose())
  })
}

function fitSvgGroup(group: THREE.Group) {
  const bounds = new THREE.Box3().setFromObject(group)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const largestDimension = Math.max(size.x, size.y, 1)
  const scale = 2.2 / largestDimension
  group.scale.set(scale, -scale, scale)
  group.position.set(-center.x * scale, center.y * scale, -center.z * scale)
}

export function buildImageThreeJsSvgGroup(text: string): THREE.Group {
  const data = new SVGLoader().parse(text)
  const group = new THREE.Group()
  data.paths.forEach((path, pathIndex) => {
    const style = (path.userData?.style || {}) as Record<string, unknown>
    const fill = String(style.fill || '').trim()
    if (fill && fill.toLowerCase() !== 'none') {
      const material = new THREE.MeshStandardMaterial({
        color: path.color,
        opacity: Number.isFinite(Number(style.fillOpacity)) ? Number(style.fillOpacity) : 1,
        side: THREE.DoubleSide,
        transparent: Number(style.fillOpacity) < 1,
        roughness: 0.6,
        metalness: 0.12,
      })
      SVGLoader.createShapes(path).forEach((shape, shapeIndex) => {
        const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
          bevelEnabled: true,
          bevelSegments: 2,
          bevelSize: 0.008,
          bevelThickness: 0.012,
          depth: 0.045,
        }), material.clone())
        mesh.position.z = (pathIndex + shapeIndex / 100) * 0.012
        group.add(mesh)
      })
      material.dispose()
    }
    const stroke = String(style.stroke || '').trim()
    if (!stroke || stroke.toLowerCase() === 'none') return
    path.subPaths.forEach((subPath, subPathIndex) => {
      const geometry = SVGLoader.pointsToStroke(
        subPath.getPoints(),
        style as unknown as Parameters<typeof SVGLoader.pointsToStroke>[1],
      )
      if (!geometry) return
      const material = new THREE.MeshStandardMaterial({
        color: stroke,
        opacity: Number.isFinite(Number(style.strokeOpacity)) ? Number(style.strokeOpacity) : 1,
        side: THREE.DoubleSide,
        transparent: Number(style.strokeOpacity) < 1,
        roughness: 0.52,
        metalness: 0.08,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.z = (pathIndex + subPathIndex / 100) * 0.012 + 0.055
      group.add(mesh)
    })
  })
  if (group.children.length === 0) throw new Error('SVG contains no renderable fill or stroke geometry.')
  fitSvgGroup(group)
  return group
}

function RasterImageObject(props: {
  sourceUrl: string
  onLoadState: (state: LoadState) => void
}) {
  const { sourceUrl, onLoadState } = props
  const [texture, setTexture] = React.useState<THREE.Texture | null>(null)
  const [aspectRatio, setAspectRatio] = React.useState(1)
  const [reliefGeometry, setReliefGeometry] = React.useState<THREE.BufferGeometry | null>(null)
  const invalidate = useThree(state => state.invalidate)

  React.useEffect(() => {
    if (texture) invalidate()
  }, [invalidate, texture, aspectRatio])

  React.useEffect(() => {
    let active = true
    let ownedTexture: THREE.Texture | null = null
    onLoadState('loading')
    const loader = new THREE.TextureLoader()
    loader.load(
      sourceUrl,
      loaded => {
        ownedTexture = loaded
        loaded.colorSpace = THREE.SRGBColorSpace
        loaded.needsUpdate = true
        if (!active) {
          loaded.dispose()
          return
        }
        const image = loaded.image as RasterImageSource | undefined
        const { width, height } = getRasterImageDimensions(image)
        setAspectRatio(Math.max(0.05, Math.min(20, width / Math.max(1, height))))
        setTexture(loaded)
        onLoadState('ready')
      },
      undefined,
      () => {
        if (!active) return
        onLoadState('error')
      },
    )
    return () => {
      active = false
      ownedTexture?.dispose()
    }
  }, [onLoadState, sourceUrl])

  const width = aspectRatio >= 1 ? 2.25 : 2.25 * aspectRatio
  const height = aspectRatio >= 1 ? 2.25 / aspectRatio : 2.25
  const sourceImage = texture?.image as RasterImageSource | undefined

  React.useEffect(() => {
    if (!texture) {
      setReliefGeometry(null)
      return undefined
    }
    const geometry = buildRasterReliefGeometry({ image: sourceImage, width, height })
    setReliefGeometry(geometry)
    return () => geometry.dispose()
  }, [height, sourceImage, texture, width])

  if (!texture) return null

  return (
    <group rotation={[-0.24, 0.34, 0]}>
      <mesh position={[0, 0, -0.075]}>
        <boxGeometry args={[width + 0.1, height + 0.1, 0.14]} />
        <meshStandardMaterial color="#0f172a" roughness={0.58} metalness={0.18} />
      </mesh>
      {reliefGeometry ? (
        <mesh geometry={reliefGeometry}>
          <meshStandardMaterial map={texture} side={THREE.DoubleSide} roughness={0.54} metalness={0.06} transparent />
        </mesh>
      ) : null}
    </group>
  )
}

function SvgImageObject(props: {
  sourceUrl: string
  onLoadState: (state: LoadState) => void
}) {
  const { sourceUrl, onLoadState } = props
  const [group, setGroup] = React.useState<THREE.Group | null>(null)
  const invalidate = useThree(state => state.invalidate)

  React.useEffect(() => {
    if (group) invalidate()
  }, [group, invalidate])

  React.useEffect(() => {
    const controller = new AbortController()
    let ownedGroup: THREE.Group | null = null
    onLoadState('loading')
    void fetch(sourceUrl, { credentials: 'same-origin', signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`SVG request failed with ${response.status}.`)
        return response.text()
      })
      .then(text => {
        if (controller.signal.aborted) return
        ownedGroup = buildImageThreeJsSvgGroup(text)
        setGroup(ownedGroup)
        onLoadState('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) onLoadState('error')
      })
    return () => {
      controller.abort()
      if (ownedGroup) disposeImageThreeJsObject(ownedGroup)
    }
  }, [onLoadState, sourceUrl])

  return group ? <primitive object={group} rotation={[-0.18, 0.28, 0]} /> : null
}

export function ImageThreeJsSurface(props: {
  sourceUrl: string
  title: string
  className?: string
  mediaClassName?: string
  style?: React.CSSProperties
  mediaStyle?: React.CSSProperties
  interactive?: boolean
  onReady?: () => void
  onError?: () => void
}) {
  const { sourceUrl, title, className, mediaClassName, style, mediaStyle, interactive = false, onReady, onError } = props
  const sourceKind = resolveImageToThreeJsSourceKind(sourceUrl)
  const [loadState, setLoadState] = React.useState<LoadState>(sourceKind ? 'loading' : 'error')
  const handleLoadState = React.useCallback((next: LoadState) => {
    setLoadState(next)
    if (next === 'ready') onReady?.()
  }, [onReady])

  React.useEffect(() => {
    setLoadState(sourceKind ? 'loading' : 'error')
  }, [sourceKind, sourceUrl])

  if (loadState === 'error') {
    return (
      <img
        src={sourceUrl}
        alt={title}
        className={['block h-full w-full select-none object-contain', className, mediaClassName].filter(Boolean).join(' ')}
        data-kg-image-threejs-fallback="1"
        draggable={false}
        onLoad={() => onReady?.()}
        onError={() => onError?.()}
        style={{ pointerEvents: interactive ? 'auto' : 'none', ...style, ...mediaStyle }}
      />
    )
  }

  return (
    <section
      aria-label={`${title} Three.js preview`}
      className={['relative h-full w-full overflow-hidden', className, mediaClassName].filter(Boolean).join(' ')}
      data-kg-card-media-kind={sourceKind === 'svg' ? 'svg' : 'image'}
      data-kg-image-threejs-renderer="native-three"
      data-kg-image-threejs-scene={sourceKind === 'svg' ? 'extruded-svg' : 'textured-relief'}
      data-kg-image-threejs-surface="1"
      data-kg-image-threejs-source-kind={sourceKind}
      data-kg-image-threejs-load-state={loadState}
      style={{ background: 'radial-gradient(circle at 50% 35%, rgba(148,163,184,0.18), rgba(15,23,42,0.08))', ...style, ...mediaStyle }}
    >
      <Canvas
        camera={{ position: [0, 0, 3.4], fov: 38, near: 0.1, far: 20 }}
        dpr={[1, 2]}
        frameloop="demand"
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        shadows
        style={{ pointerEvents: interactive ? 'auto' : 'none' }}
      >
        <ambientLight intensity={0.9} />
        <hemisphereLight args={['#dbeafe', '#0f172a', 1.1]} />
        <directionalLight castShadow position={[2, 3, 4]} intensity={2.2} />
        <directionalLight position={[-3, -1, 2]} intensity={0.65} />
        {sourceKind === 'svg'
          ? <SvgImageObject key={`svg:${sourceUrl}`} sourceUrl={sourceUrl} onLoadState={handleLoadState} />
          : <RasterImageObject key={`raster:${sourceUrl}`} sourceUrl={sourceUrl} onLoadState={handleLoadState} />}
      </Canvas>
      {loadState === 'loading' ? (
        <span className="absolute inset-x-0 bottom-2 text-center text-[11px] text-slate-500" role="status">
          Converting image to Three.js…
        </span>
      ) : null}
      {loadState === 'ready' ? (
        <span
          className="pointer-events-none absolute bottom-2 right-2 rounded-full border border-sky-300/70 bg-slate-950/75 px-2 py-0.5 text-[10px] font-medium tracking-wide text-sky-100"
          data-kg-image-threejs-native-badge="1"
        >
          Native Three.js · {sourceKind === 'svg' ? 'extruded SVG' : 'image relief'}
        </span>
      ) : null}
    </section>
  )
}
