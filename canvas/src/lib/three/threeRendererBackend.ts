import type WebGPURenderer from 'three/src/renderers/webgpu/WebGPURenderer.js'
import type { WebGLRenderer } from 'three'
export type ThreeRendererBackend = 'webgl' | 'webgpu'
export type ThreeRendererState = Readonly<{
  requested: ThreeRendererBackend; active: ThreeRendererBackend | null
  phase: 'idle' | 'loading' | 'ready' | 'fallback'; reason: string; revision: number
}>
let snapshot: ThreeRendererState = { requested: 'webgl', active: null, phase: 'idle',
  reason: 'Open a linked procedural space in 3D to choose its renderer.', revision: 0 }
const listeners = new Set<() => void>()
let owner = 0
export const readThreeRendererBackend = () => snapshot
export const subscribeThreeRendererBackend = (listener: () => void) => {
  listeners.add(listener); return () => { listeners.delete(listener) }
}
const update = (next: ThreeRendererState) => { snapshot = next; for (const listener of listeners) listener() }
export function requestThreeRendererBackend(value: unknown) {
  if (value !== 'webgl' && value !== 'webgpu') throw Error('Choose WebGL or WebGPU.')
  update({ requested: value, active: snapshot.active, phase: snapshot.active ? 'loading' : 'idle',
    reason: snapshot.active ? 'Applying renderer choice to the active Canvas…' : 'Choice saved for this session. Open a linked procedural space in 3D.', revision: snapshot.revision + 1 })
  return snapshot
}
/** A superseded Canvas or late initialization cannot publish another renderer's status. */
export function claimThreeRendererBackend() {
  const lease = ++owner, revision = snapshot.revision
  return (value: Pick<ThreeRendererState, 'active' | 'phase' | 'reason'>) => {
    if (lease === owner && revision === snapshot.revision) update({ ...snapshot, ...value })
  }
}
export function webGpuSceneEligible(input: {
  mode: string; semanticSpace: boolean; immersive: boolean; gameplay: boolean
  learning: boolean; geospatial: boolean; importedModel: boolean; spatialCapture: boolean
}) {
  return input.mode === '3d' && input.semanticSpace && !input.immersive && !input.gameplay
    && !input.learning && !input.geospatial && !input.importedModel && !input.spatialCapture
}
export function webGpuUnavailableReason(eligible: boolean, secure: boolean, gpu: boolean) {
  if (!eligible) return 'WebGPU supports linked procedural spaces in 3D. This scene uses WebGL.'
  if (!secure) return 'WebGPU needs HTTPS or localhost. This Canvas uses WebGL.'
  if (!gpu) return 'This browser does not expose WebGPU. This Canvas uses WebGL.'
  return ''
}

export function guardWebGpuRenderer(renderer: WebGPURenderer, callbacks: {
  ready: () => void; failed: (reason: string) => void
}) {
  // r170 has an inactive XR stub; Fiber 8 expects these hooks during cleanup.
  // This contract bridge offers no XR session support; XR scenes use WebGL.
  Object.assign(renderer.xr, { addEventListener() {}, removeEventListener() {} })
  let initialized = false, disposed = false, failed = false, released = false
  const render = renderer.render.bind(renderer)
  const fail = (reason: string) => {
    if (disposed || failed) return
    failed = true; clearTimeout(timer); callbacks.failed(reason)
  }
  const timer = setTimeout(() => fail('WebGPU initialization exceeded five seconds.'), 5000)
  renderer.render = async (scene, camera) => {
    if (!initialized || disposed || failed) return
    try { await render(scene, camera) } catch (error) { fail(`WebGPU render failed: ${String((error as Error).message)}`) }
  }
  renderer.onDeviceLost = () => fail('The WebGPU device was lost.')
  const onGpuError = () => fail('The WebGPU device reported a rendering error.')
  const release = () => {
    if (released) return
    released = true
    const device = (renderer.backend as unknown as { device?: GPUDevice }).device
    device?.removeEventListener('uncapturederror', onGpuError)
    try { renderer.dispose() } catch { /* Initialization may not have created all resources. */ }
    device?.destroy()
  }
  void renderer.init().then(() => {
    if (disposed || failed) { release(); return }
    if (!(renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend) {
      fail('A WebGPU adapter was unavailable.'); release(); return
    }
    clearTimeout(timer); initialized = true
    ;(renderer.backend as unknown as { device?: GPUDevice }).device?.addEventListener('uncapturederror', onGpuError)
    callbacks.ready()
  }, error => { fail(`WebGPU initialization failed: ${String(error?.message || error)}`); release() })
  const dispose = () => {
    if (disposed) return
    disposed = true; clearTimeout(timer)
    // Stop immediately, but keep node caches until Fiber unmounts child materials.
    // Pending initialization owns late cleanup; initialized devices use Fiber's hook.
  }
  // Fiber 8 invokes this after scene cleanup. Earlier release invalidates material listeners.
  Object.assign(renderer, { forceContextLoss: () => { dispose(); if (initialized) release() } })
  return { renderer: renderer as unknown as WebGLRenderer, dispose }
}
