import test from 'node:test'
import assert from 'node:assert/strict'
import { claimThreeRendererBackend, readThreeRendererBackend, requestThreeRendererBackend,
  webGpuSceneEligible, webGpuUnavailableReason } from '../threeRendererBackend'
import { guardWebGpuRenderer } from '../threeRendererBackend'
import { parseSemanticSpaceInvocation } from '@/features/agent-ready/semanticSpaceWebMcpTools'

test('only procedural 3D scenes qualify and unsupported browsers retain a reason', () => {
  const allowed = { mode: '3d', semanticSpace: true, immersive: false, gameplay: false,
    learning: false, geospatial: false, importedModel: false, spatialCapture: false }
  assert.equal(webGpuSceneEligible(allowed), true)
  for (const key of ['immersive', 'gameplay', 'learning', 'geospatial', 'importedModel', 'spatialCapture']) {
    assert.equal(webGpuSceneEligible({ ...allowed, [key]: true }), false)
  }
  assert.equal(webGpuSceneEligible({ ...allowed, mode: 'xr' }), false)
  assert.equal(webGpuSceneEligible({ ...allowed, semanticSpace: false }), false)
  assert.match(webGpuUnavailableReason(true, false, true), /HTTPS/)
  assert.match(webGpuUnavailableReason(true, true, false), /does not expose/)
  assert.equal(webGpuUnavailableReason(true, true, true), '')
})

test('renderer choices fence stale owners and share strict invocation parsing', () => {
  requestThreeRendererBackend('webgpu')
  const stale = claimThreeRendererBackend(), current = claimThreeRendererBackend()
  current({ active: 'webgpu', phase: 'ready', reason: 'ready' })
  stale({ active: 'webgl', phase: 'fallback', reason: 'stale' })
  assert.equal(readThreeRendererBackend().active, 'webgpu')
  requestThreeRendererBackend('webgl')
  current({ active: 'webgpu', phase: 'ready', reason: 'late' })
  assert.equal(readThreeRendererBackend().requested, 'webgl')
  assert.notEqual(readThreeRendererBackend().reason, 'late')
  assert.throws(() => requestThreeRendererBackend('remote'))
  assert.deepEqual(parseSemanticSpaceInvocation('/space.renderer @canvas #webgpu'), { operation: 'renderer', backend: 'webgpu' })
  assert.throws(() => parseSemanticSpaceInvocation('/space.renderer @canvas #anything'))
})

function fixture() {
  let ready!: () => void, reject!: (error: Error) => void, renders = 0, releases = 0, destroys = 0
  const pending = new Promise<void>((resolve, fail) => { ready = resolve; reject = fail })
  const renderer = { xr: { enabled: false }, backend: { isWebGPUBackend: true, device: {
    addEventListener() {}, removeEventListener() {}, destroy() { destroys++ },
  } }, render() { renders++ }, init: () => pending, dispose() { releases++ }, onDeviceLost() {} }
  return { renderer: renderer as unknown as Parameters<typeof guardWebGpuRenderer>[0], ready, reject,
    counts: () => ({ renders, releases, destroys }) }
}
const flush = () => new Promise(resolve => setImmediate(resolve))

test('GPU frames wait for initialization; loss and unmount clean up once', async () => {
  const f = fixture(), errors: string[] = []; let ready = 0
  const guarded = guardWebGpuRenderer(f.renderer, { ready: () => { ready++ }, failed: reason => errors.push(reason) })
  assert.doesNotThrow(() => (f.renderer.xr as unknown as { removeEventListener: (name: string, listener: () => void) => void })
    .removeEventListener('sessionend', () => {}))
  const draw = () => (guarded.renderer.render as unknown as () => void)()
  draw(); assert.equal(f.counts().renders, 0)
  f.ready(); await flush(); draw()
  assert.equal(ready, 1); assert.equal(f.counts().renders, 1)
  f.renderer.onDeviceLost({ api: 'WebGPU', message: 'lost', reason: 'unknown', originalEvent: null })
  draw(); assert.equal(f.counts().renders, 1); assert.equal(errors.length, 1)
  guarded.dispose(); guarded.dispose()
  assert.deepEqual(f.counts(), { renders: 1, releases: 0, destroys: 0 })
  guarded.renderer.forceContextLoss(); guarded.renderer.forceContextLoss()
  assert.deepEqual(f.counts(), { renders: 1, releases: 1, destroys: 1 })
})

test('initialization deadline bounds waiting and cleans up a late device', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture(), errors: string[] = []; let ready = 0
  guardWebGpuRenderer(f.renderer, { ready: () => { ready++ }, failed: reason => errors.push(reason) })
  context.mock.timers.tick(5001)
  assert.match(errors[0], /five seconds/)
  f.ready(); await flush()
  assert.equal(ready, 0)
  assert.equal(f.counts().releases, 1)
  assert.equal(f.counts().destroys, 1)
})

test('late initialization and rejected adapters cannot activate a disposed Canvas', async () => {
  for (const rejected of [false, true]) {
    const f = fixture(); let reports = 0
    const guarded = guardWebGpuRenderer(f.renderer, { ready: () => { reports++ }, failed: () => { reports++ } })
    guarded.dispose()
    if (rejected) f.reject(Error('adapter unavailable')); else f.ready()
    await flush()
    assert.equal(reports, 0); assert.deepEqual(f.counts(), { renders: 0, releases: 1, destroys: 1 })
  }
})
