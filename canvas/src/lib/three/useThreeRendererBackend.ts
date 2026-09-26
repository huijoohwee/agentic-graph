import React from 'react'
import { WebGLRenderer } from 'three'
import { claimThreeRendererBackend, readThreeRendererBackend, subscribeThreeRendererBackend,
  webGpuUnavailableReason } from './threeRendererBackend'

const webgl = { antialias: true, alpha: true }
type Factory = (canvas: HTMLCanvasElement) => WebGLRenderer
export function useThreeRendererBackend(eligible: boolean, active: boolean) {
  const state = React.useSyncExternalStore(subscribeThreeRendererBackend, readThreeRendererBackend, readThreeRendererBackend)
  const [factory, setFactory] = React.useState<{ revision: number; create: Factory } | null>(null)
  React.useEffect(() => {
    if (!active) return
    const report = claimThreeRendererBackend()
    let stopped = false, dispose: (() => void) | undefined
    setFactory(null)
    const reason = webGpuUnavailableReason(eligible, globalThis.isSecureContext === true,
      typeof navigator !== 'undefined' && 'gpu' in navigator)
    if (state.requested === 'webgl' || reason) {
      report({ active: 'webgl', phase: state.requested === 'webgl' ? 'ready' : 'fallback',
        reason: state.requested === 'webgl' ? 'WebGL active.' : reason })
      return () => { report({ active: null, phase: 'idle', reason: 'Canvas is inactive.' }) }
    }
    const fallback = (reason: string) => {
      if (stopped) return
      stopped = true; clearTimeout(deadline); dispose?.(); setFactory(null)
      report({ active: 'webgl', phase: 'fallback', reason: `${reason} Switched to WebGL. Select WebGPU to retry.` })
    }
    const deadline = setTimeout(() => fallback('Optional renderer did not load within ten seconds.'), 10_000)
    report({ active: 'webgl', phase: 'loading', reason: 'Loading optional WebGPU renderer…' })
    void import('./createWebGpuRenderer').then(({ createWebGpuRenderer }) => {
      if (stopped) return
      clearTimeout(deadline)
      setFactory({ revision: state.revision, create: canvas => {
        try {
          const result = createWebGpuRenderer(canvas, {
            ready: () => { if (!stopped) report({ active: 'webgpu', phase: 'ready', reason: 'WebGPU active · device rendering · no API fee.' }) },
            failed: fallback,
          })
          dispose = result.dispose
          return result.renderer
        } catch (error) {
          fallback(`WebGPU could not start: ${String((error as Error).message)}`)
          return new WebGLRenderer({ canvas, ...webgl })
        }
      } })
    }, error => fallback(String(error?.message || error)))
    return () => { stopped = true; clearTimeout(deadline); dispose?.()
      report({ active: null, phase: 'idle', reason: 'Canvas is inactive.' }) }
  }, [eligible, active, state.requested, state.revision])
  const gpu = eligible && active && state.requested === 'webgpu' && factory?.revision === state.revision
  return { gl: gpu ? factory.create : webgl, key: gpu ? `webgpu-${state.revision}` : 'webgl',
    gpu, state }
}
