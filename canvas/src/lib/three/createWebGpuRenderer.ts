import WebGPURenderer from 'three/src/renderers/webgpu/WebGPURenderer.js'
import { guardWebGpuRenderer } from './threeRendererBackend'

/** Synchronous Fiber 8 renderer contract; no frames are submitted until async init settles. */
export function createWebGpuRenderer(canvas: HTMLCanvasElement, callbacks: {
  ready: () => void; failed: (reason: string) => void
}) {
  const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
  return guardWebGpuRenderer(renderer, callbacks)
}

