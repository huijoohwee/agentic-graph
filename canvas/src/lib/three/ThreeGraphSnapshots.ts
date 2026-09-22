import type { MutableRefObject } from 'react'
import type { Scene as ThreeScene } from 'three'
import type { CanvasSnapshotFns } from '@/hooks/store/store-types/core'

export function registerThreeGraphSnapshotFns(args: {
  glCanvasRef: MutableRefObject<HTMLCanvasElement | null>
  threeSceneRef: MutableRefObject<ThreeScene | null>
  registerCanvasSnapshotFns: (id: string, fns: CanvasSnapshotFns | null) => void
  registerThreeGlbSnapshotFns: (fns: { captureGlb: () => Promise<Blob | null>; captureGltf: () => Promise<Blob | null> } | null) => void
}) {
  const { glCanvasRef, threeSceneRef, registerCanvasSnapshotFns, registerThreeGlbSnapshotFns } = args
  const capturePng = async (pixelRatio?: number): Promise<Blob | null> => {
    try {
      const canvas = glCanvasRef.current
      if (!canvas) return null
      const ratio = pixelRatio && pixelRatio > 0 ? pixelRatio : 1
      if (ratio === 1 && typeof canvas.toBlob === 'function') {
        const directBlob = await new Promise<Blob | null>(resolve => {
          canvas.toBlob(b => resolve(b), 'image/png')
        })
        return directBlob || null
      }
      const width = Math.max(1, Math.floor(canvas.width * ratio))
      const height = Math.max(1, Math.floor(canvas.height * ratio))
      const target = document.createElement('canvas')
      target.width = width
      target.height = height
      const ctx = target.getContext('2d')
      if (!ctx) return null
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(canvas, 0, 0, width, height)
      const blob = await new Promise<Blob | null>(resolve => {
        target.toBlob(b => resolve(b), 'image/png')
      })
      return blob || null
    } catch {
      return null
    }
  }
  registerCanvasSnapshotFns('3d', {
    capturePng,
    captureVideo: async options => {
      const canvas = glCanvasRef.current
      const scene = threeSceneRef.current
      if (!canvas || !scene) return { status: 'unsupported', reason: 'No XR canvas is mounted.' }
      const { captureXrSceneMp4 } = await import('@/features/three/xrSceneMp4Export')
      return captureXrSceneMp4({ ...options, canvas, scene,
        isCurrent: () => glCanvasRef.current === canvas && threeSceneRef.current === scene })
    },
  })
  registerThreeGlbSnapshotFns({
    captureGlb: async () => {
      try {
        const scene = threeSceneRef.current
        if (!scene) return null
        const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
        const exporter = new GLTFExporter()
        const arrayBuffer = await new Promise<ArrayBuffer | null>(resolve => {
          exporter.parse(
            scene,
            gltf => {
              if (gltf && gltf instanceof ArrayBuffer) resolve(gltf)
              else resolve(null)
            },
            () => resolve(null),
            { binary: true },
          )
        })
        if (!arrayBuffer) return null
        return new Blob([arrayBuffer], { type: 'model/gltf-binary' })
      } catch {
        return null
      }
    },
    captureGltf: async () => {
      try {
        const scene = threeSceneRef.current
        if (!scene) return null
        const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
        const exporter = new GLTFExporter()
        const json = await new Promise<unknown | null>(resolve => {
          exporter.parse(
            scene,
            gltf => resolve(gltf || null),
            () => resolve(null),
            { binary: false },
          )
        })
        if (!json || json instanceof ArrayBuffer) return null
        return new Blob([`${JSON.stringify(json, null, 2)}\n`], { type: 'model/gltf+json' })
      } catch {
        return null
      }
    },
  })
}
