import assert from 'node:assert/strict'
import test from 'node:test'
import { Scene } from 'three'
import { startTimelineTransportPlayback } from '@/components/timeline/timelineTransport'
import { publishRichMediaTimelineClockAcknowledgement, publishRichMediaTimelineClockStart, publishRichMediaTimelineTransportFrame, RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, RICH_MEDIA_TIMELINE_TRANSPORT_PARENT_FRAME_KEY, type RichMediaTimelineLocalFrame } from '@/lib/render/richMediaTimelineSync'
import { acquireVideoSequenceRecorderLease } from '@/components/timeline/videoSequenceRecorderLifecycle'
import { useGraphStore } from '@/hooks/useGraphStore'
import { captureXrSceneMp4, createXrMp4SourceBinding, type XrMp4SourceBinding } from '@/features/three/xrSceneMp4Export'

class Recorder extends EventTarget {
  static isTypeSupported = (mime: string) => mime.startsWith('video/mp4')
  static last: Recorder | null = null
  constructor(..._args: unknown[]) { super(); Recorder.last = this }
  state: RecordingState = 'inactive'
  mimeType = 'video/mp4'
  start() { this.state = 'recording'; queueMicrotask(() => this.dispatchEvent(new Event('start'))) }
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
  suspendRendering: () => void; isPlaying: () => boolean; exactEndPayload: () => void
  automaticFramesOnly: () => void; sampledPixels: () => number[]; frameRequests: () => number
}) => Promise<void>) {
  const priorRecorder = Object.getOwnPropertyDescriptor(globalThis, 'MediaRecorder')
  Recorder.last = null
  const priorCanvas = Object.getOwnPropertyDescriptor(globalThis, 'HTMLCanvasElement')
  const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() })
  const clockLifetime = new AbortController()
  let clockRequested = false; let clockReleased = false; let clockEnding = false; let exactEndPayload = false
  let stopped = 0; let restored = 0; let time = 0; let playing = false; let current = true; let renderEnabled = true
  const listeners = new Set<() => void>()
  const scene = new Scene(); const initialHook = scene.onAfterRender
  const recordedDimensions: number[][] = []; const copiedSourceWidths: number[] = []
  const sampledPixels: number[] = []; let frameRequests = 0; let automaticOnly = false
  class Canvas {
    width = 160; height = 90; pixel = 0
    getContext() { return {
      drawImage: (source: Canvas) => {
        this.pixel = source.pixel
        if (this.width !== 32) { copiedSourceWidths.push(source.width); recordedDimensions.push([this.width, this.height]) }
      },
      getImageData: () => {
        assert.ok(Recorder.last === null || Recorder.last.state === 'inactive', 'GPU readback must precede recorder construction or follow recorder stop')
        if (Recorder.last === null) assert.equal(recordedDimensions.length > 0 && sampledPixels.length > 0, false, 'opening readback must precede stream sampling')
        return { data: new Uint8ClampedArray(32 * 32 * 4).fill(this.pixel) }
      },
    } }
    captureStream(fps: number) {
      recordedDimensions.push([this.width, this.height])
      const sampler = setInterval(() => sampledPixels.push(this.pixel), 1_000 / fps)
      const track = { stop: () => { clearInterval(sampler); stopped++ },
        ...(!automaticOnly ? { requestFrame: () => { frameRequests++; sampledPixels.push(this.pixel) } } : {}) }
      return { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream
    }
  }
  const source = new Canvas()
  Object.defineProperty(globalThis, 'HTMLCanvasElement', { configurable: true, value: Canvas })
  Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: Recorder })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => new Canvas() } })
  const binding: XrMp4SourceBinding = {
    documentKey: 'fixture#xr-motion', durationSeconds: 0.08, fps: 30, current: () => current, time: () => time,
    prepare: () => { time = 0 }, play: () => { playing = true; clockRequested = true }, pause: () => { playing = false },
    restoreTransport: () => { restored++; playing = false }, restoreCameraAndPlayback: () => { restored++ },
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
  const timer = setInterval(() => {
    if (playing && clockRequested) {
      clockRequested = false
      const ready = publishRichMediaTimelineClockStart({ type: 'agentic-graph:timeline-transport-frame',
        documentKey: binding.documentKey, position: 0, timeMs: 0, playing: true, playbackRate: 1, sourcePlayback: false }, clockLifetime.signal)
      void Promise.resolve(ready).then(() => { clockReleased = true }, () => { playing = false })
    }
    if (playing && clockReleased) time = Math.min(0.08, time + 0.02)
    if (playing && clockReleased && time >= 0.08 && !clockEnding) {
      clockEnding = true
      const ready = publishRichMediaTimelineClockAcknowledgement({ type: 'agentic-graph:timeline-transport-frame',
        documentKey: binding.documentKey, position: binding.time() / 60, timeMs: (exactEndPayload ? binding.durationSeconds : binding.time()) * 1_000,
        playing: true, playbackRate: 1, sourcePlayback: false }, clockLifetime.signal, 'end')
      void Promise.resolve(ready).then(() => binding.pause(), () => binding.pause())
    }
    if (!renderEnabled) return
    source.pixel = playing ? Math.round(time * 1_000) : 200
    scene.onAfterRender({ xr: { isPresenting: false } } as never, scene, {} as never, undefined as never, undefined as never, undefined as never)
  }, 5)
  try {
    await run({
      capture: options => captureXrSceneMp4({ canvas: source as unknown as HTMLCanvasElement, scene,
        isCurrent: () => current, binding, ...options,
        verify: async (_blob, _duration, _signal, finalFrame, initialFrame) => {
          assert.equal(initialFrame?.[0], 0, 'the opening reference must be rendered after the playing clock zero acknowledgement')
          assert.equal(finalFrame?.[0], 80, 'the retained reference must precede camera restoration')
          return { durationSeconds: 0.08, decodedFrames: 3, width: 160, height: 90, sampleHashes: ['a', 'b', 'c'],
            initialFrameVerified: true, initialFrameMeanError: 0, finalFrameVerified: true, finalFrameMeanError: 0 }
        } }),
      binding, advanceWithoutRender: () => { renderEnabled = false; time = 0.08; for (const listener of listeners) listener() },
      resumeRendering: () => { renderEnabled = true }, suspendRendering: () => { renderEnabled = false }, isPlaying: () => playing,
      stale: () => { current = false; for (const listener of listeners) listener() },
      stopped: () => stopped, restored: () => restored, scene, initialHook, exactEndPayload: () => { exactEndPayload = true },
      resizeSource: () => { source.width = 80; source.height = 44 },
      recordedDimensions: () => recordedDimensions, copiedSourceWidths: () => copiedSourceWidths,
      automaticFramesOnly: () => { automaticOnly = true }, sampledPixels: () => sampledPixels, frameRequests: () => frameRequests,
    })
  } finally {
    clearInterval(timer); clockLifetime.abort()
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow); else Reflect.deleteProperty(globalThis, 'window')
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

test('final authored image survives faster rendering, slow recorder sampling and camera restoration', async () => {
  for (const automaticOnly of [false, true]) await fixture(async value => {
    value.binding.fps = 5 // Renderer advances every 5ms; recorder samples every 200ms.
    if (automaticOnly) value.automaticFramesOnly()
    assert.equal((await value.capture()).status, 'captured')
    assert.ok(value.sampledPixels().length >= 2)
    assert.ok(value.sampledPixels().slice(-2).every(pixel => pixel === 80))
    assert.equal(value.frameRequests(), automaticOnly ? 0 : 2)
  })
})

test('delayed Timeline startup creates no recorder or stream until the fresh opening image is ready', async () => {
  await fixture(async value => {
    const play = value.binding.play
    let ready: () => void = () => {}
    const requested = new Promise<void>(resolve => { ready = resolve })
    value.binding.play = () => { assert.equal(Recorder.last, null); ready() }
    const capture = value.capture()
    await requested
    await new Promise(resolve => setTimeout(resolve, 30))
    assert.equal(Recorder.last, null)
    assert.equal(value.frameRequests(), 0)
    play()
    assert.equal((await capture).status, 'captured')
    assert.ok(value.sampledPixels().includes(0), 'the playing-camera opening image was requested')
  })
})

test('native transport advancement without an acknowledged startup hold rejects before recording', async () => {
  await fixture(async value => {
    let requested = false
    value.binding.play = () => { requested = true }
    value.binding.transportTime = () => requested ? 0.04 : 0
    await assert.rejects(value.capture(), /advanced before the opening frame/)
    assert.equal(value.frameRequests(), 0)
    assert.equal(value.stopped(), 0)
    acquireVideoSequenceRecorderLease()()
  })
})

test('clock advancement during recorder start rejects instead of dropping the opening time', async () => {
  const start = Recorder.prototype.start
  try {
    await fixture(async value => {
      Recorder.prototype.start = function () {
        value.binding.transportTime = () => 0.04
        start.call(this)
      }
      await assert.rejects(value.capture(), /advanced while MP4 was starting/)
      assert.equal(value.stopped(), 1)
    })
  } finally { Recorder.prototype.start = start }
})

test('cancellation while waiting for clock startup creates no recorder or live tracks', async () => {
  await fixture(async value => {
    const controller = new AbortController()
    value.binding.play = () => {}
    const timer = setTimeout(() => controller.abort(), 30)
    try { await assert.rejects(value.capture({ signal: controller.signal }), { name: 'AbortError' }) }
    finally { clearTimeout(timer) }
    assert.equal(Recorder.last, null); assert.equal(value.stopped(), 0)
    assert.equal(value.scene.onAfterRender, value.initialHook)
    acquireVideoSequenceRecorderLease()()
  })
})

test('cancellation during the final sampler interval releases tracks and the shared lease', async () => {
  await fixture(async value => {
    const controller = new AbortController()
    value.binding.pause = () => { controller.abort() }
    await assert.rejects(value.capture({ signal: controller.signal }), { name: 'AbortError' })
    assert.equal(value.stopped(), 1)
    acquireVideoSequenceRecorderLease()()
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
    let complete = false; let advanced = false; let published: () => void = () => {}
    const endpointPublished = new Promise<void>(resolve => { published = resolve })
    const result = value.capture({ onProgress: fraction => {
      // Retain real opening/intermediate renders before withholding the final render.
      if (!advanced && fraction >= 0.5) { advanced = true; value.advanceWithoutRender(); published() }
    } }).then(result => { complete = true; return result })
    await Promise.race([endpointPublished, result.then(() => { throw new Error('Capture ended before endpoint publication') })])
    await new Promise(resolve => setTimeout(resolve, 25))
    assert.equal(complete, false)
    value.resumeRendering()
    const captured = await result
    assert.equal(captured.status, 'captured')
    if (captured.status === 'captured') assert.ok(captured.evidence.renderedFrames >= 3)
  })
})

test('rounded pose playheads are corrected even when terminal event time is already exact', async () => {
  for (const exactPayload of [false, true]) await fixture(async value => {
    if (exactPayload) value.exactEndPayload()
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

function nativeClockFixture(onPlaybackStart?: (position: number, signal: AbortSignal) => Promise<void> | void,
  onPlaybackComplete?: (position: number, signal: AbortSignal) => Promise<void> | void, freshSnapshots = false) {
  let now = 0; let nextId = 0; let current = true; let ended = 0; let projectedPosition = 0
  const queue = new Map<number, FrameRequestCallback>()
  const positions: number[] = []
  const frames: number[] = []
  const state = { position: 0, max: 2, unitsPerMs: 0.001, playbackRate: 1,
    onPositionChange: (position: number) => { positions.push(position); projectedPosition = position },
    onPlaybackFrame: (position: number) => { frames.push(position) },
    onPlaybackEnd: () => { ended++ }, onPlaybackStart, onPlaybackComplete }
  const stop = startTimelineTransportPlayback({ readState: () => freshSnapshots ? { ...state, position: projectedPosition } : state,
    requestFrame: callback => { queue.set(++nextId, callback); return nextId }, cancelFrame: id => { queue.delete(id) },
    now: () => now, isCurrent: () => current })
  return { state, positions, frames, stop, queued: () => queue.size, ended: () => ended,
    replaceDocument: () => { current = false }, setNow: (value: number) => { now = value },
    tick: (timestamp: number) => {
      now = timestamp
      const entry = queue.entries().next().value
      assert.ok(entry, 'the native clock must have scheduled this frame')
      queue.delete(entry[0]); entry[1](timestamp)
    } }
}

test('native RAF acknowledges unchanged zero, holds without scheduling, and excludes startup latency', async () => {
  let release: () => void = () => {}; let signal: AbortSignal | undefined
  const held = new Promise<void>(resolve => { release = resolve })
  const clock = nativeClockFixture((position, lifetime) => { assert.equal(position, 0); signal = lifetime; return held })
  clock.tick(10)
  assert.deepEqual(clock.positions, [0]); assert.deepEqual(clock.frames, [0])
  assert.equal(clock.queued(), 0)
  clock.setNow(2_000); release(); await Promise.resolve()
  assert.equal(clock.queued(), 1)
  clock.tick(2_020)
  assert.deepEqual(clock.positions, [0, 0.02], 'elapsed time begins at release, not the delayed initial RAF')
  clock.stop(); assert.equal(signal?.aborted, true); assert.equal(clock.queued(), 0)
})

test('ordinary native playback retains its elapsed-time behavior without a startup claimant', () => {
  const clock = nativeClockFixture()
  clock.tick(10); clock.tick(30)
  assert.deepEqual(clock.positions, [0, 0.02]); assert.equal(clock.queued(), 1)
  clock.tick(2_010); assert.equal(clock.ended(), 1); assert.equal(clock.queued(), 0)
  clock.stop()
})

test('clock cleanup aborts a pending startup and late release cannot schedule another RAF', async () => {
  let release: () => void = () => {}; let signal: AbortSignal | undefined
  const clock = nativeClockFixture((_position, lifetime) => {
    signal = lifetime; return new Promise<void>(resolve => { release = resolve })
  })
  clock.tick(1); clock.stop(); release(); await Promise.resolve()
  assert.equal(signal?.aborted, true); assert.equal(clock.queued(), 0); assert.equal(clock.ended(), 0)
})

test('document replacement fences late startup success and failure without mutating the next document', async () => {
  for (const reject of [false, true]) {
    let finish: () => void = () => {}
    const clock = nativeClockFixture(() => new Promise<void>((resolve, fail) => {
      finish = reject ? () => fail(new Error('old capture cancelled')) : resolve
    }))
    clock.tick(1); clock.replaceDocument(); finish(); await Promise.resolve()
    assert.equal(clock.queued(), 0); assert.equal(clock.ended(), 0)
    assert.deepEqual(clock.positions, [0]); clock.stop()
  }
})

test('rejected startup stops the current clock and handles the rejection', async () => {
  const clock = nativeClockFixture(() => Promise.reject(new Error('recorder failed')))
  clock.tick(1); await Promise.resolve()
  assert.equal(clock.queued(), 0); assert.equal(clock.ended(), 1); clock.stop()
})

test('boundary controls stay local while parent storage and broadcast contain serializable frames only', async () => {
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const priorChannel = Object.getOwnPropertyDescriptor(globalThis, 'BroadcastChannel')
  const target = new EventTarget() as EventTarget & Record<string, unknown>
  const broadcast: unknown[] = []
  const lifetime = new AbortController()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target })
  Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: class {
    postMessage(value: unknown) { broadcast.push(structuredClone(value)) }
    close() {}
  } })
  try {
    let release: () => void = () => {}; let ordinaryFrames = 0
    target.addEventListener(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, event => {
      const frame = (event as CustomEvent<RichMediaTimelineLocalFrame>).detail
      const control = frame.clockStart || frame.clockEnd
      if (!control) { ordinaryFrames++; return }
      assert.equal(control.hold(new Promise<void>(resolve => { release = resolve })), true)
      assert.equal(control.hold(Promise.resolve()), false, 'only one capture can claim a boundary')
    })
    const frame = { type: 'agentic-graph:timeline-transport-frame' as const, documentKey: 'native#xr-motion',
      position: 0, timeMs: 0, playing: true, playbackRate: 1, sourcePlayback: false }
    publishRichMediaTimelineTransportFrame(frame)
    assert.equal(ordinaryFrames, 1)
    const pending = publishRichMediaTimelineClockStart(frame, lifetime.signal)
    assert.ok(pending)
    assert.deepEqual(target[RICH_MEDIA_TIMELINE_TRANSPORT_PARENT_FRAME_KEY], frame)
    assert.deepEqual(broadcast, [frame, frame])
    release(); await pending
    const ending = publishRichMediaTimelineClockAcknowledgement(frame, lifetime.signal, 'end')
    assert.ok(ending); assert.deepEqual(target[RICH_MEDIA_TIMELINE_TRANSPORT_PARENT_FRAME_KEY], frame)
    assert.deepEqual(broadcast.at(-1), frame); release(); await ending
    const cancelled = publishRichMediaTimelineClockStart(frame, lifetime.signal)
    lifetime.abort()
    assert.ok(cancelled)
    await assert.rejects(cancelled, { name: 'AbortError' })
  } finally {
    lifetime.abort()
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow); else Reflect.deleteProperty(globalThis, 'window')
    if (priorChannel) Object.defineProperty(globalThis, 'BroadcastChannel', priorChannel); else Reflect.deleteProperty(globalThis, 'BroadcastChannel')
  }
})

test('actual clock zero acknowledgement still waits for the fresh rendered opening image', async () => {
  await fixture(async value => {
    let acknowledged: () => void = () => {}
    const ready = new Promise<void>(resolve => { acknowledged = resolve })
    const observe = (event: Event) => {
      if (!(event as CustomEvent<RichMediaTimelineLocalFrame>).detail.clockStart) return
      value.suspendRendering(); acknowledged()
    }
    window.addEventListener(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, observe)
    try {
      const capture = value.capture()
      await ready; await new Promise(resolve => setTimeout(resolve, 25))
      assert.equal(Recorder.last, null); assert.equal(value.binding.time(), 0)
      assert.equal(value.frameRequests(), 0)
      value.resumeRendering()
      assert.equal((await capture).status, 'captured')
    } finally { window.removeEventListener(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, observe) }
  })
})

test('source replacement during a held zero frame cancels without restoring the old document', async () => {
  await fixture(async value => {
    let acknowledged: () => void = () => {}
    const ready = new Promise<void>(resolve => { acknowledged = resolve })
    const observe = (event: Event) => {
      if (!(event as CustomEvent<RichMediaTimelineLocalFrame>).detail.clockStart) return
      value.suspendRendering(); acknowledged()
    }
    window.addEventListener(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, observe)
    try {
      const capture = value.capture()
      await ready; value.stale()
      await assert.rejects(capture, /source, document or canvas changed/)
      assert.equal(value.stopped(), 0); assert.equal(value.restored(), 0)
      assert.equal(value.scene.onAfterRender, value.initialHook)
      acquireVideoSequenceRecorderLease()()
    } finally { window.removeEventListener(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, observe) }
  })
})

test('local boundary claims are synchronous and an unresponsive claimant has a bounded deadline', async context => {
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const target = new EventTarget()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target })
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const lifetime = new AbortController()
  try {
    let control: RichMediaTimelineLocalFrame['clockStart']
    let phase: 'start' | 'end' = 'start'
    let claim = false
    target.addEventListener(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, event => {
      const frame = (event as CustomEvent<RichMediaTimelineLocalFrame>).detail
      control = frame.clockStart || frame.clockEnd
      if (claim) control!.hold(new Promise<void>(() => {}))
    })
    const frame = { type: 'agentic-graph:timeline-transport-frame' as const, documentKey: 'native#xr-motion',
      position: 0, timeMs: 0, playing: true, playbackRate: 1, sourcePlayback: false }
    for (phase of ['start', 'end'] as const) {
      claim = false
      assert.equal(publishRichMediaTimelineClockAcknowledgement(frame, lifetime.signal, phase), undefined)
      assert.equal(control!.hold(Promise.resolve()), false, 'late claims cannot hold the clock')
      claim = true
      const pending = publishRichMediaTimelineClockAcknowledgement(frame, lifetime.signal, phase)
      assert.ok(pending)
      const rejected = assert.rejects(pending, /acknowledgement timed out/)
      context.mock.timers.tick(5_000)
      await rejected
    }
  } finally {
    lifetime.abort(); context.mock.timers.reset()
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow); else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('synchronous document changes from a frame listener prevent stale startup and scheduling', () => {
  let started = false
  const clock = nativeClockFixture(() => { started = true })
  clock.state.onPlaybackFrame = () => clock.replaceDocument()
  clock.tick(1)
  assert.equal(started, false); assert.equal(clock.queued(), 0); assert.equal(clock.ended(), 0)
  clock.stop()
})

test('startup preserves rejection even when a claimant rejects with undefined or null', async () => {
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const target = new EventTarget()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target })
  let reason: unknown
  const observe = (event: Event) => {
    ;(event as CustomEvent<RichMediaTimelineLocalFrame>).detail.clockStart!.hold(Promise.reject(reason))
  }
  target.addEventListener(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, observe)
  try {
    for (reason of [undefined, null]) {
      const pending = publishRichMediaTimelineClockStart({ type: 'agentic-graph:timeline-transport-frame',
        documentKey: 'native#xr-motion', position: 0, timeMs: 0, playing: true, playbackRate: 1, sourcePlayback: false }, new AbortController().signal)
      assert.ok(pending)
      await assert.rejects(pending)
    }
  } finally {
    target.removeEventListener(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, observe)
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow); else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('native terminal hold retains the final position without another RAF and ends only after acknowledgement', async () => {
  let release: () => void = () => {}
  const clock = nativeClockFixture(undefined, position => {
    assert.equal(position, 2); return new Promise<void>(resolve => { release = resolve })
  })
  clock.tick(1); clock.tick(2_001)
  assert.equal(clock.state.position, 2); assert.equal(clock.ended(), 0); assert.equal(clock.queued(), 0)
  release(); await Promise.resolve()
  assert.equal(clock.ended(), 1); assert.equal(clock.queued(), 0); clock.stop()
})

test('terminal acknowledgement cannot end a replaced or cancelled document, including late rejection', async () => {
  for (const replaced of [false, true]) for (const rejected of [false, true]) {
    let finish: () => void = () => {}; let signal: AbortSignal | undefined
    const clock = nativeClockFixture(undefined, (_position, lifetime) => {
      signal = lifetime
      return new Promise<void>((resolve, reject) => { finish = rejected ? () => reject(new Error('late')) : resolve })
    })
    clock.tick(1); clock.tick(2_001)
    if (replaced) clock.replaceDocument(); else clock.stop()
    finish(); await Promise.resolve()
    assert.equal(clock.ended(), 0); assert.equal(clock.queued(), 0); assert.equal(signal?.aborted, true); clock.stop()
  }
})

test('terminal render hold keeps the playing camera until its actual image is retained', async () => {
  await fixture(async value => {
    let reached: () => void = () => {}
    const terminal = new Promise<void>(resolve => { reached = resolve })
    const observe = (event: Event) => {
      if (!(event as CustomEvent<RichMediaTimelineLocalFrame>).detail.clockEnd) return
      value.suspendRendering(); reached()
    }
    window.addEventListener(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, observe)
    try {
      const capture = value.capture(); await terminal
      await new Promise(resolve => setTimeout(resolve, 25))
      assert.equal(value.isPlaying(), true); assert.equal(Recorder.last?.state, 'recording')
      assert.ok(!value.sampledPixels().includes(80), 'publishing the endpoint is not a rendered endpoint')
      value.resumeRendering(); assert.equal((await capture).status, 'captured')
      assert.ok(value.sampledPixels().slice(-2).every(pixel => pixel === 80))
    } finally { window.removeEventListener(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, observe) }
  })
})

test('a rejected current terminal acknowledgement stops once and schedules no further frame', async () => {
  const clock = nativeClockFixture(undefined, () => Promise.reject(new Error('final render failed')))
  clock.tick(1); clock.tick(2_001); await Promise.resolve()
  assert.equal(clock.ended(), 1); assert.equal(clock.queued(), 0); clock.stop()
})

test('fresh React-like snapshots acknowledge the computed endpoint and retain the end callback receiver', async () => {
  let endpoint = -1; let ended = false
  const clock = nativeClockFixture(undefined, position => { endpoint = position; return Promise.resolve() }, true)
  clock.state.onPlaybackEnd = function (this: { position: number }) { assert.equal(this.position, 2); ended = true }
  clock.tick(1); clock.tick(1_001); clock.tick(2_001)
  assert.deepEqual(clock.positions, [0, 1, 2]); assert.equal(clock.state.position, 0, 'setters must not mutate captured projections')
  assert.equal(endpoint, 2); assert.equal(ended, false)
  await Promise.resolve(); assert.equal(ended, true); assert.equal(clock.queued(), 0); clock.stop()
})
