import React from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import {
  GLB_ASSET_MIME_TYPE,
  GLTF_ASSET_MIME_TYPE,
  type GlbAssetDocument,
} from '@/lib/assets/glbAssetDocument'
import { GlbAssetModel, type GlbFit } from '@/lib/three/GlbAssetModel'
import { ImageToGlbPreviewCameraControls } from './ImageToGlbPreviewCameraControls'

type ImageToGlbSurfaceLoadState = 'loading' | 'ready' | 'error'

function readModelFormat(sourceUrl: string): 'glb' | 'gltf' {
  const source = String(sourceUrl || '').trim()
  if (/^data:(?:model\/gltf\+json|application\/gltf\+json|application\/json)[;,]/i.test(source)) return 'gltf'
  if (source.startsWith('data:')) return 'glb'
  const path = source.split(/[?#]/, 1)[0].toLowerCase()
  return path.endsWith('.gltf') ? 'gltf' : 'glb'
}

function readModelName(sourceUrl: string, format: 'glb' | 'gltf'): string {
  const path = String(sourceUrl || '').trim().split(/[?#]/, 1)[0]
  if (path.startsWith('data:')) return `procedural-model.${format}`
  const decoded = (() => {
    try {
      return decodeURIComponent(path)
    } catch {
      return path
    }
  })()
  const name = decoded.split('/').filter(Boolean).pop() || ''
  return name || `procedural-model.${format}`
}

function encodeArrayBufferDataUrl(bytes: ArrayBuffer, mimeType: string): string {
  const values = new Uint8Array(bytes)
  const chunkSize = 0x8000
  let binary = ''
  for (let offset = 0; offset < values.length; offset += chunkSize) {
    binary += String.fromCharCode(...values.subarray(offset, offset + chunkSize))
  }
  return `data:${mimeType};base64,${btoa(binary)}`
}

function buildModelAsset(args: {
  dataUrl: string
  format: 'glb' | 'gltf'
  sourceUrl: string
}): GlbAssetDocument {
  const mimeType = args.format === 'gltf' ? GLTF_ASSET_MIME_TYPE : GLB_ASSET_MIME_TYPE
  return {
    name: readModelName(args.sourceUrl, args.format),
    format: args.format,
    dataUrl: args.dataUrl,
    mimeType,
    sourceUrl: args.sourceUrl,
  }
}

/**
 * Native render surface for the Image-to-GLB output panel. It only accepts a
 * generated model artifact; source image panels continue to use their own
 * image surfaces.
 */
export function ImageToGlbSurface(props: {
  sourceUrl: string
  title: string
  className?: string
  style?: React.CSSProperties
  interactive?: boolean
  onReady?: () => void
  onError?: () => void
}) {
  const { sourceUrl, title, className, style, interactive = false, onReady, onError } = props
  const [asset, setAsset] = React.useState<GlbAssetDocument | null>(null)
  const [fit, setFit] = React.useState<GlbFit | null>(null)
  const [loadState, setLoadState] = React.useState<ImageToGlbSurfaceLoadState>(() => (
    String(sourceUrl || '').trim() ? 'loading' : 'error'
  ))
  const onReadyRef = React.useRef(onReady)
  const onErrorRef = React.useRef(onError)

  React.useEffect(() => {
    onReadyRef.current = onReady
    onErrorRef.current = onError
  }, [onError, onReady])

  const handleModelReady = React.useCallback(() => {
    setLoadState('ready')
    onReadyRef.current?.()
  }, [])
  const handleModelError = React.useCallback(() => {
    setFit(null)
    setLoadState('error')
    onErrorRef.current?.()
  }, [])

  React.useEffect(() => {
    const normalizedSourceUrl = String(sourceUrl || '').trim()
    const format = readModelFormat(normalizedSourceUrl)
    if (!normalizedSourceUrl) {
      setAsset(null)
      setFit(null)
      setLoadState('error')
      onErrorRef.current?.()
      return
    }

    let cancelled = false
    const settleAsset = (dataUrl: string) => {
      if (cancelled) return
      setAsset(buildModelAsset({ dataUrl, format, sourceUrl: normalizedSourceUrl }))
    }

    setAsset(null)
    setFit(null)
    setLoadState('loading')
    if (normalizedSourceUrl.startsWith('data:')) {
      settleAsset(normalizedSourceUrl)
      return () => {
        cancelled = true
      }
    }

    const controller = new AbortController()
    const mimeType = format === 'gltf' ? GLTF_ASSET_MIME_TYPE : GLB_ASSET_MIME_TYPE
    void fetch(normalizedSourceUrl, { credentials: 'same-origin', signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`Model request failed with ${response.status}.`)
        return response.arrayBuffer()
      })
      .then(bytes => settleAsset(encodeArrayBufferDataUrl(bytes, mimeType)))
      .catch(() => {
        if (cancelled || controller.signal.aborted) return
        setAsset(null)
        setFit(null)
        setLoadState('error')
        onErrorRef.current?.()
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [sourceUrl])

  return (
    <section
      aria-label={`${title} GLB preview`}
      className={['relative h-full w-full overflow-hidden', className].filter(Boolean).join(' ')}
      data-kg-image-to-glb-renderer="native-three"
      data-kg-image-to-glb-surface="1"
      data-kg-image-to-glb-load-state={loadState}
      data-kg-rich-media-model-asset="glb"
      data-kg-card-media-interactive={interactive ? '1' : undefined}
      data-kg-rich-media-interaction-owner={interactive ? '1' : undefined}
      data-kg-local-wheel-owner={interactive ? '1' : undefined}
      tabIndex={interactive ? 0 : undefined}
      title={interactive ? 'Drag to orbit · right-drag to pan · scroll or pinch to zoom' : undefined}
      onContextMenu={interactive ? event => {
        event.preventDefault()
        event.stopPropagation()
      } : undefined}
      style={{ background: 'radial-gradient(circle at 48% 32%, rgba(255,247,237,0.66), rgba(148,163,184,0.16))', ...style }}
    >
      {asset ? (
        <Canvas
          camera={{ position: [120, 82, 190], fov: 32, near: 0.1, far: 4000 }}
          dpr={[1, 2]}
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1.04
          }}
          shadows
          style={{ pointerEvents: interactive ? 'auto' : 'none' }}
        >
          <ImageToGlbPreviewCameraControls fit={fit} interactive={interactive} />
          <GlbAssetModel
            asset={asset}
            lightingProfile="reference-studio"
            standalone
            onFitChange={setFit}
            onLoad={handleModelReady}
            onError={handleModelError}
          />
        </Canvas>
      ) : null}
      {loadState === 'loading' ? (
        <span className="absolute inset-x-0 bottom-2 text-center text-xs text-slate-500" role="status">
          Loading procedural GLB…
        </span>
      ) : null}
      {loadState === 'error' ? (
        <span className="absolute inset-0 flex items-center justify-center px-3 text-center text-xs text-slate-500" role="status">
          Unable to load the generated GLB model.
        </span>
      ) : null}
      {loadState === 'ready' ? (
        <span
          className="pointer-events-none absolute bottom-2 right-2 rounded-full border border-sky-300/70 bg-slate-950/75 px-2 py-0.5 text-xs font-medium tracking-normal text-sky-100"
          data-kg-image-to-glb-native-badge="1"
        >
          Native Three.js · GLB
        </span>
      ) : null}
    </section>
  )
}
