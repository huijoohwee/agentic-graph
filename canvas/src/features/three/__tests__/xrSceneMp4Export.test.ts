import assert from 'node:assert/strict'
import test from 'node:test'
import { Scene } from 'three'
import { acquireVideoSequenceRecorderLease } from '@/components/timeline/videoSequenceRecorderLifecycle'
import { useGraphStore } from '@/hooks/useGraphStore'
import { captureXrSceneMp4, createXrMp4SourceBinding, type XrMp4SourceBinding } from '../xrSceneMp4Export'

class Recorder extends EventTarget {
  static isTypeSupported = (mime: string) => mime.startsWith('video/mp4')
  static last: Recorder | null = null
  constructor(..._args: unknown[]) { super(); Recorder.last = this }
  state: RecordingState = 'inactive'
  mimeType = 'video/mp4'
  start() { this.state = 'recording' }
  requestData() {
    const event = new Event('dataavailable')
    Object.defineProperty(event, 'data', { value: new Blob(['test bytes']) })
    this.dispatchEvent(event)
  }
  stop() { this.state = 'inactive'; this.dispatchEvent(new Event('stop')) }
}

async function fixture(run: (value: {
  capture: (options?: { signal?: AbortSignal; onProgress?: (fraction: number) => void }) => ReturnType<typeof captureXrSceneMp4>
  binding: XrMp4SourceBinding; advanceWithoutRender: () => void; resumeRendering: () => void; stale: () => void; stopped: () => number; restored: () => number; scene: Scene; initialHook: Scene['onAfterRender']
  resizeSource: () => void; recordedDimensions: () => number[][]; copiedSourceWidths: () => number[]
}) => Promise<void>) {
  const priorRecorder = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder')
  const priorCanvas = Object.getOwnPropertyDescriptor(globalThis, 'HTMLCanvasElement')
  const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  let stopped = 0; let restored = 0; let time = 0; let playing = false; let current = true; let renderEnabled = true
  const listeners = new Set<() => void>()
  const scene = new Scene(); const initialHook = scene.onAfterRender
  const recordedDimensions: number[][] = []; const copiedSourceWidths: number[] = []
  class Canvas {
    width = 160; height = 90
    getContext() { return { drawImage: (source: Canvas) => { copiedSourceWidths.push(source.width); recordedDimensions.push([this.width, this.height]) } } }
    captureStream() { recordedDimensions.push([this.width, this.height]); return { getVideoTracks: () => [{}], getTracks: () => [{ stop: () => { stopped++ } }] } as unknown as MediaStream }
  }
  const source = new Canvas()
  Object.defineProperty(globalThis, 'HTMLCanvasElement', { configurable: true, value: Canvas })
  Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: Recorder })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => new Canvas() } })
  const binding: XrMp4SourceBinding = {
    durationSeconds: 0.08, fps: 30, current: () => current, time: () => time,
    prepare: () => { time = 0 }, play: () => { playing = true }, pause: () => { playing = false },
    restoreTransport: () => { restored++; playing = false }, restoreCameraAndPlayback: () => { restored++ },
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
  const timer = setInterval(() => {
    if (playing) time = Math.min(0.08, time + 0.02)
    if (!renderEnabled) return
    scene.onAfterRender({ xr: { isPresenting: false } } as never, scene, {} as never, undefined as never, undefined as never, undefined as never)
  }, 5)
  try {
    await run({
      capture: options => captureXrSceneMp4({ canvas: source as unknown as HTMLCanvasElement, scene,
        isCurrent: () => current, binding, ...options,
        verify: async () => ({ durationSeconds: 0.08, decodedFrames: 3, width: 160, height: 90, sampleHashes: ['a', 'b', 'c'] }) }),
      binding, advanceWithoutRender: () => { renderEnabled = false; time = 0.08; for (const listener of listeners) listener() },
      resumeRendering: () => { renderEnabled = true },
      stale: () => { current = false; for (const listener of listeners) listener() },
      stopped: () => stopped, restored: () => restored, scene, initialHook,
      resizeSource: () => { source.width = 80; source.height = 44 },
      recordedDimensions: () => recordedDimensions, copiedSourceWidths: () => copiedSourceWidths,
    })
  } finally {
    clearInterval(timer)
    if (priorRecorder) Object.defineProperty(globalThis, 'MediaRecorder', priorRecorder); else Reflect.deleteProperty(globalThis, 'MediaRecorder')
    if (priorCanvas) Object.defineProperty(globalThis, 'HTMLCanvasElement', priorCanvas); else Reflect.deleteProperty(globalThis, 'HTMLCanvasElement')
    if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument); else Reflect.deleteProperty(globalThis, 'document')
  }
}

test('XR capture acknowledges existing rendered frames and releases capture before returning evidence', async () => {
  await fixture(async value => {
    const result = await value.capture()
    assert.equal(result.status, 'captured')
    if (result.status === 'captured') assert.ok(result.evidence.renderedFrames >= 3)
    assert.equal(value.stopped(), 1); assert.equal(value.restored(), 2)
    assert.equal(value.scene.onAfterRender, value.initialHook)
  })
})

test('user cancellation tears down tracks and restores the same document', async () => {
  await fixture(async value => {
    const controller = new AbortController()
    await assert.rejects(value.capture({ signal: controller.signal, onProgress: () => controller.abort() }), { name: 'AbortError' })
    assert.equal(value.stopped(), 1); assert.equal(value.restored(), 2)
    assert.equal(value.scene.onAfterRender, value.initialHook)
  })
})

test('adaptive renderer resizing preserves encoder dimensions while copying the current rendered source', async () => {
  await fixture(async value => {
    assert.equal((await value.capture({ onProgress: () => value.resizeSource() })).status, 'captured')
    assert.ok(value.copiedSourceWidths().includes(160))
    assert.ok(value.copiedSourceWidths().includes(80))
    assert.ok(value.recordedDimensions().every(([width, height]) => width === 160 && height === 90))
  })
})

test('document or canvas replacement cancels without restoring the previous document', async () => {
  await fixture(async value => {
    await assert.rejects(value.capture({ onProgress: () => value.stale() }), /source, document or canvas changed/)
    assert.equal(value.stopped(), 1); assert.equal(value.restored(), 0)
    assert.equal(value.scene.onAfterRender, value.initialHook)
  })
})

test('WebM-only browsers return unsupported before acquiring tracks', async () => {
  await fixture(async value => {
    const supported = Recorder.isTypeSupported
    Recorder.isTypeSupported = () => false
    try {
      assert.deepEqual(await value.capture(), { status: 'unsupported', reason: 'container-unavailable' })
      assert.equal(value.stopped(), 0); assert.equal(value.restored(), 0)
    } finally { Recorder.isTypeSupported = supported }
  })
})


test('final Timeline publication cannot complete capture until the final time is rendered', async () => {
  await fixture(async value => {
    let complete = false
    let advanced = false
    const result = value.capture({ onProgress: () => {
      if (!advanced) { advanced = true; value.advanceWithoutRender() }
    } }).then(result => { complete = true; return result })
    await new Promise(resolve => setTimeout(resolve, 50))
    assert.equal(complete, false)
    value.resumeRendering()
    assert.equal((await result).status, 'captured')
  })
})

test('rounded Timeline endpoint requests and renders the exact authored final time', async () => {
  await fixture(async value => {
    const readTime = value.binding.time
    let finalRequests = 0
    value.binding.time = () => finalRequests ? readTime() : Math.min(readTime(), 0.07998)
    value.binding.refreshFinalFrame = () => { finalRequests++ }
    assert.equal((await value.capture()).status, 'captured')
    assert.equal(finalRequests, 1)
    assert.equal(value.binding.time(), value.binding.durationSeconds)
  })
})

test('restoration exceptions still detach the renderer hook and release the shared lease', async () => {
  for (const method of ['restoreTransport', 'restoreCameraAndPlayback'] as const) {
    await fixture(async value => {
      value.binding[method] = () => { throw new Error('restore failed') }
      await assert.rejects(value.capture(), /restore failed/)
      assert.equal(value.stopped(), 1)
      assert.equal(value.scene.onAfterRender, value.initialHook)
      acquireVideoSequenceRecorderLease()()
    })
  }
})


test('recorder errors reject immediately, release tracks and allow a later export', async () => {
  await fixture(async value => {
    let failed = false
    await assert.rejects(value.capture({ onProgress: () => {
      if (!failed) { failed = true; Recorder.last?.dispatchEvent(new Event('error')) }
    } }), /failed|stopped/)
    assert.equal(value.stopped(), 1)
    assert.equal(value.scene.onAfterRender, value.initialHook)
    acquireVideoSequenceRecorderLease()()
  })
})


test('native binding restores its prior BottomPanel state but preserves a subsequent user choice', () => {
  const prior = useGraphStore.getState()
  try {
    useGraphStore.setState({ markdownDocumentName: 'panel-test.md', markdownDocumentText: '# Panel test',
      canvasRenderMode: '3d', canvas3dMode: 'xr', bottomSurfaceTab: 'stats', bottomSurfaceCollapsed: true })
    const binding = createXrMp4SourceBinding()
    binding.prepare()
    assert.equal(useGraphStore.getState().bottomSurfaceTab, 'timeline')
    binding.restoreTransport(); binding.restoreCameraAndPlayback()
    assert.equal(useGraphStore.getState().bottomSurfaceTab, 'stats')
    assert.equal(useGraphStore.getState().bottomSurfaceCollapsed, true)
    binding.prepare()
    useGraphStore.getState().setBottomSurfaceTab('history')
    binding.restoreTransport(); binding.restoreCameraAndPlayback()
    assert.equal(useGraphStore.getState().bottomSurfaceTab, 'history')
  } finally { useGraphStore.setState(prior) }
})
