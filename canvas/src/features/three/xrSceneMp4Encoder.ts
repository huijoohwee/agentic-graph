import type { Scene } from 'three'
import type { CanvasVideoCaptureOptions, CanvasVideoCaptureResult } from '@/hooks/store/store-types/core'
import { acquireVideoSequenceRecorderLease } from '@/components/timeline/videoSequenceRecorderLifecycle'
import { RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, type RichMediaTimelineLocalFrame } from '@/lib/render/richMediaTimelineSync'
import { copyEncodedChunk, type XrV2EncodedVideoSample } from '@/features/xr-v2/encodedTrackMuxContracts'
import type { XrMp4SourceBinding } from '@/features/three/xrSceneMp4Export'
import { verifyXrSceneMp4, XR_MP4_FRAME_SAMPLE_SIZE, XR_MP4_MAX_BYTES } from './xrSceneMp4Evidence'
import { muxXrSceneMp4, XR_MP4_MAX_SAMPLES } from './xrSceneMp4Mux'

const aborted = () => new DOMException('MP4 export cancelled.', 'AbortError')
export async function inspectXrMp4Encoder(canvas: HTMLCanvasElement, fps: number): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined' || !canvas.width || !canvas.height) return null
  const config: VideoEncoderConfig = { codec: 'avc1.42001f', width: Math.max(2, Math.floor(canvas.width / 2) * 2),
    height: Math.max(2, Math.floor(canvas.height / 2) * 2), bitrate: 4_000_000,
    framerate: Math.min(60, Math.max(1, fps)), latencyMode: 'realtime', avc: { format: 'avc' } }
  if (config.width > 8_192 || config.height > 8_192) return null
  for (const codec of ['avc1.42001f', 'avc1.420033']) {
    const candidate = { ...config, codec }
    try { if ((await VideoEncoder.isConfigSupported(candidate)).supported) return candidate } catch { /* Try the next bounded profile. */ }
  }
  return null
}

/** Timestamp actual native renders; Timeline remains the sole motion/camera clock. */
export async function encodeXrSceneMp4(args: CanvasVideoCaptureOptions & {
  canvas: HTMLCanvasElement; scene: Scene; isCurrent: () => boolean; binding: XrMp4SourceBinding
  verify?: typeof verifyXrSceneMp4
}, config: VideoEncoderConfig): Promise<CanvasVideoCaptureResult> {
  const { binding } = args
  const totalUs = Math.round(binding.durationSeconds * 1_000_000)
  const frameUs = Math.max(1, Math.round(1_000_000 / config.framerate!))
  const finalTimestamp = Math.max(1, totalUs - Math.min(frameUs, Math.floor(totalUs / 2)))
  const surface = document.createElement('canvas')
  surface.width = config.width; surface.height = config.height
  const context = surface.getContext('2d', { alpha: false })
  if (!context) throw new Error('A stable XR recording surface is unavailable.')
  const release = acquireVideoSequenceRecorderLease()
  const verification = new AbortController(), samples: XrV2EncodedVideoSample[] = []
  const submitted: number[] = []
  let configuration: Uint8Array | null = null, encodedBytes = 0
  let encoder: VideoEncoder | null = null, failure: Error | null = null
  let wake: (() => void) | null = null, observed = 0, renderedTime = -1, stableFrames = 0
  let prepared = false, encoding = false, finalCopied = false, clockStarted = false, clockEnding = false
  let startFrames = 0, endFrames = 0, lastTimestamp = -1, renderedFrames = 0
  let detach = () => {}, detachStart = () => {}, detachEnd = () => {}
  let releaseStart: (() => void) | null = null, releaseEnd: (() => void) | null = null
  let rejectStart: ((error: Error) => void) | null = null, rejectEnd: ((error: Error) => void) | null = null
  const previous = args.scene.onAfterRender
  const current = () => args.isCurrent() && binding.current()
  const assertCurrent = () => {
    if (args.signal?.aborted) throw aborted()
    if (!current()) throw new Error('XR source, document or canvas changed during MP4 export.')
    if (failure) throw failure
  }
  const check = () => {
    try { assertCurrent() } catch (error) { failure = error as Error; verification.abort() }
    wake?.()
  }
  const fail = (error: Error) => { failure = error; check() }
  const wait = (ready: () => boolean, timeoutMs = 5_000): Promise<void> => new Promise((resolve, reject) => {
    const finish = (error?: Error) => { clearTimeout(timer); wake = null; if (error) reject(error); else resolve() }
    const timer = setTimeout(() => finish(new Error('XR render, Timeline or encoder stalled during MP4 export.')), timeoutMs)
    wake = () => { try { assertCurrent(); if (ready()) finish() } catch (error) { finish(error as Error) } }
    wake()
  })
  const flush = async () => {
    let done = false
    void encoder!.flush().then(() => { done = true; check() }, error => fail(error))
    await wait(() => done)
  }
  const submit = (timestamp: number, keyFrame = false) => {
    assertCurrent()
    if (submitted.length >= XR_MP4_MAX_SAMPLES || timestamp <= lastTimestamp) throw new Error('XR encoded frame inventory exceeded its bound.')
    const frame = new VideoFrame(surface, { timestamp, duration: Math.min(frameUs, totalUs - timestamp) })
    try { encoder!.encode(frame, { keyFrame }); submitted.push(timestamp); lastTimestamp = timestamp; renderedFrames++ }
    finally { frame.close() }
  }
  const sampleImage = () => {
    const sample = document.createElement('canvas'); sample.width = XR_MP4_FRAME_SAMPLE_SIZE; sample.height = XR_MP4_FRAME_SAMPLE_SIZE
    try {
      const pixels = sample.getContext('2d', { willReadFrequently: true })
      if (!pixels) throw new Error('MP4 pose verification is unavailable.')
      pixels.drawImage(surface, 0, 0, sample.width, sample.height)
      return pixels.getImageData(0, 0, sample.width, sample.height).data
    } finally { sample.width = 0; sample.height = 0 }
  }
  const afterRender: Scene['onAfterRender'] = function (...renderArgs) {
    previous.apply(this, renderArgs)
    try {
      assertCurrent()
      if (renderArgs[0].xr?.isPresenting) throw new Error('Exit immersive XR before exporting the authored camera.')
      observed++
      const time = binding.time()
      stableFrames = time === renderedTime ? stableFrames + 1 : 1; renderedTime = time
      if (!finalCopied) {
        context.drawImage(args.canvas, 0, 0, surface.width, surface.height)
        if (clockEnding && observed > endFrames && time === binding.durationSeconds) finalCopied = true
        else if (encoding && !clockEnding) {
          const timestamp = Math.round(time * 1_000_000)
          if (timestamp - lastTimestamp >= frameUs && timestamp < finalTimestamp && encoder!.encodeQueueSize < 4) submit(timestamp)
        }
      }
      if (encoding) args.onProgress?.(Math.min(0.95, time / binding.durationSeconds * 0.95))
    } catch (error) { fail(error as Error) }
    check()
  }
  const onBoundary = (event: Event) => {
    const frame = (event as CustomEvent<RichMediaTimelineLocalFrame>).detail
    if (!frame || frame.documentKey !== binding.documentKey) return
    try {
      assertCurrent()
      if (frame.clockEnd) {
        if (clockEnding || !encoding) return
        if (!frame.playing || Math.abs(frame.timeMs / 1_000 - binding.durationSeconds) > 0.000031) throw new Error('The XR clock did not finish at the authored endpoint.')
        const held = new Promise<void>((resolve, reject) => { releaseEnd = resolve; rejectEnd = reject }); void held.catch(() => {})
        if (!frame.clockEnd.hold(held)) throw new Error('The XR clock completion is already held or cancelled.')
        clockEnding = true; endFrames = observed
        const signal = frame.clockEnd.signal
        const cancelled = () => fail(new Error('The XR clock was cancelled before the final render.'))
        signal.addEventListener('abort', cancelled, { once: true }); detachEnd = () => signal.removeEventListener('abort', cancelled)
        if (signal.aborted) cancelled()
        if (binding.time() !== binding.durationSeconds) binding.refreshFinalFrame?.()
      } else if (frame.clockStart && !clockStarted) {
        if (frame.position !== 0 || frame.timeMs !== 0 || !frame.playing) throw new Error('The XR clock did not start at the opening frame.')
        const held = new Promise<void>((resolve, reject) => { releaseStart = resolve; rejectStart = reject }); void held.catch(() => {})
        if (!frame.clockStart.hold(held)) throw new Error('The XR clock startup is already held or cancelled.')
        clockStarted = true; startFrames = observed
        const signal = frame.clockStart.signal
        const cancelled = () => fail(new Error('The XR clock was cancelled during MP4 startup.'))
        signal.addEventListener('abort', cancelled, { once: true }); detachStart = () => signal.removeEventListener('abort', cancelled)
        if (signal.aborted) cancelled()
      }
    } catch (error) { fail(error as Error) }
    check()
  }
  try {
    assertCurrent()
    encoder = new VideoEncoder({ output(chunk, metadata) {
      try {
        if (chunk.timestamp !== submitted[samples.length] || samples.length >= XR_MP4_MAX_SAMPLES) throw new Error('AVC encoder changed the authored sample inventory.')
        if (encodedBytes + chunk.byteLength > XR_MP4_MAX_BYTES) throw new Error('MP4 recording exceeds the 64 MB limit.')
        encodedBytes += chunk.byteLength; samples.push(copyEncodedChunk(chunk))
        const description = metadata?.decoderConfig?.description
        if (description) {
          const bytes = ArrayBuffer.isView(description)
            ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength) : new Uint8Array(description)
          if (configuration && (configuration.length !== bytes.length || configuration.some((value, index) => value !== bytes[index]))) {
            throw new Error('AVC configuration changed during MP4 export.')
          }
          configuration = bytes.slice()
        }
      } catch (error) { fail(error as Error) }
      check()
    }, error: fail })
    encoder.configure(config)
    args.scene.onAfterRender = afterRender
    detach = binding.subscribe(check); args.signal?.addEventListener('abort', check)
    prepared = true; binding.prepare()
    await wait(() => observed >= 2 && renderedTime === 0 && stableFrames >= 2)
    window.addEventListener(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, onBoundary)
    binding.play()
    await wait(() => {
      if ((binding.transportTime?.() ?? binding.time()) !== 0) throw new Error('The XR clock advanced before opening frame acknowledgement.')
      return clockStarted && observed > startFrames && renderedTime === 0
    })
    const initial = sampleImage()
    submit(0, true); encoding = true
    detachStart(); detachStart = () => {}; releaseStart!(); releaseStart = null; rejectStart = null
    await wait(() => finalCopied, binding.durationSeconds * 1_000 + 8_000)
    // The terminal pose occupies the final authored frame interval, not wall-clock teardown time.
    await flush(); submit(finalTimestamp, true)
    const final = sampleImage()
    detachEnd(); detachEnd = () => {}; releaseEnd!(); releaseEnd = null; rejectEnd = null
    window.removeEventListener(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, onBoundary)
    await flush(); assertCurrent()
    if (!configuration || samples.length !== submitted.length) throw new Error('AVC encoder did not retain every submitted frame.')
    const blob = muxXrSceneMp4({ width: surface.width, height: surface.height, durationUs: totalUs, configuration, samples })
    encoder.close(); encoder = null
    const evidence = await (args.verify || verifyXrSceneMp4)(blob, binding.durationSeconds, verification.signal, final, initial)
    if (!evidence.initialFrameVerified || !evidence.finalFrameVerified) throw new Error('MP4 opening pose or endpoint was not verified.')
    assertCurrent(); args.onProgress?.(1); assertCurrent()
    return { status: 'captured', blob, evidence: { ...evidence, renderedFrames } }
  } finally {
    window.removeEventListener(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, onBoundary)
    detachStart(); detachEnd(); rejectStart?.(failure || aborted()); rejectEnd?.(failure || aborted())
    detach(); args.signal?.removeEventListener('abort', check)
    verification.abort()
    if (encoder?.state !== 'closed') encoder?.close()
    encoding = false
    try {
      if (prepared && current()) {
        binding.restoreTransport()
        const before = observed; failure = null
        await new Promise<void>(resolve => {
          const timer = setTimeout(() => { wake = null; resolve() }, 500)
          wake = () => { if (observed > before) { clearTimeout(timer); wake = null; resolve() } }
        })
        if (current()) binding.restoreCameraAndPlayback()
      }
    } finally {
      if (args.scene.onAfterRender === afterRender) args.scene.onAfterRender = previous
      surface.width = 0; surface.height = 0; release()
    }
  }
}
