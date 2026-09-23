import type { Scene } from 'three'
import type { CanvasVideoCaptureOptions, CanvasVideoCaptureResult } from '@/hooks/store/store-types/core'
import { useGraphStore } from '@/hooks/useGraphStore'
import { RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, type RichMediaTimelineLocalFrame } from '@/lib/render/richMediaTimelineSync'
import {
  acquireVideoSequenceRecorderLease, collectVideoSequenceRecorderOutput,
  finishVideoSequenceRecorderOutput, flushVideoSequenceRecorderOutput, stopVideoSequenceCaptureTracks,
  type VideoSequenceRecorderOutput,
} from '@/components/timeline/videoSequenceRecorderLifecycle'
import { inspectBrowserRecorderCapabilities, negotiateBrowserRecordingPlan } from '@/features/xr-v2/mediaCapabilityNegotiation'
import { readXrAnimationTransport, updateXrAnimationTransport } from './xrAnimationTransportRuntime'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import { verifyXrSceneMp4, XR_MP4_MAX_BYTES, XR_MP4_FRAME_SAMPLE_SIZE } from './xrSceneMp4Evidence'

export type XrMp4SourceBinding = {
  documentKey: string
  durationSeconds: number
  fps: number
  current: () => boolean
  time: () => number
  transportTime?: () => number
  prepare: () => void
  play: () => void
  pause: () => void
  refreshFinalFrame?: () => void
  restoreTransport: () => void
  restoreCameraAndPlayback: () => void
  subscribe: (listener: () => void) => () => void
}

export function createXrMp4SourceBinding(): XrMp4SourceBinding {
  const state = useGraphStore.getState()
  const motion = readXrMotionReferenceRuntime()
  const transport = readXrAnimationTransport()
  const camera = state.captureThreeCameraPose()
  const current = () => {
    const next = useGraphStore.getState(); const scene = readXrMotionReferenceRuntime()
    return next.canvasRenderMode === '3d' && next.canvas3dMode === 'xr'
      && next.markdownDocumentName === state.markdownDocumentName
      && next.markdownDocumentText === state.markdownDocumentText
      && scene.sceneKey === motion.sceneKey && scene.sourceSignature === motion.sourceSignature && scene.plan === motion.plan
  }
  const pause = () => updateXrAnimationTransport({ operation: 'pause', timeSeconds: 0 })
  return {
    documentKey: transport.documentKey, durationSeconds: motion.plan.durationSeconds, fps: motion.plan.fps, current,
    time: () => readXrMotionReferenceRuntime().playheadSeconds,
    transportTime: () => readXrAnimationTransport().timeSeconds,
    prepare: () => {
      pause()
      state.setBottomSurfaceTab('timeline'); state.setBottomSurfaceCollapsed(false)
      updateXrAnimationTransport({ operation: 'scrub', timeSeconds: 0, frame: 0 })
    },
    play: () => updateXrAnimationTransport({ operation: 'play', timeSeconds: 0, playbackRate: 1 }),
    pause,
    refreshFinalFrame: () => updateXrAnimationTransport({ operation: 'scrub', timeSeconds: motion.plan.durationSeconds }),
    restoreTransport: () => {
      if (!current()) return
      pause()
      updateXrAnimationTransport({ operation: 'scrub', timeSeconds: transport.timeSeconds })
      useGraphStore.getState().setTimelineTransportState({ documentKey: transport.documentKey, playbackRate: transport.playbackRate })
    },
    restoreCameraAndPlayback: () => {
      if (!current()) return
      try {
        useGraphStore.getState().restoreThreeCameraPose(camera)
        if (transport.playing) updateXrAnimationTransport({ operation: 'play', timeSeconds: transport.timeSeconds })
      } finally {
        const next = useGraphStore.getState()
        if (next.bottomSurfaceTab === 'timeline' && !next.bottomSurfaceCollapsed) {
          next.setBottomSurfaceTab(state.bottomSurfaceTab)
          next.setBottomSurfaceCollapsed(state.bottomSurfaceCollapsed)
        }
      }
    },
    subscribe: listener => {
      const stopStore = useGraphStore.subscribe(listener)
      const stopScene = subscribeXrMotionReferenceRuntime(listener)
      return () => { stopStore(); stopScene() }
    },
  }
}

const abortError = () => new DOMException('MP4 export cancelled.', 'AbortError')

/** Observes the existing renderer and Timeline; it never advances either clock. */
export async function captureXrSceneMp4(args: CanvasVideoCaptureOptions & {
  canvas: HTMLCanvasElement
  scene: Scene
  isCurrent: () => boolean
  binding?: XrMp4SourceBinding
  verify?: typeof verifyXrSceneMp4
}): Promise<CanvasVideoCaptureResult> {
  const plan = negotiateBrowserRecordingPlan(inspectBrowserRecorderCapabilities(globalThis), {
    source: 'canvas', preferredContainer: 'mp4', includeAudio: false,
  })
  if (plan.status === 'unsupported') return { status: 'unsupported', reason: plan.reason }
  const binding = args.binding || createXrMp4SourceBinding()
  if (!(binding.durationSeconds > 0 && binding.durationSeconds <= 120)) {
    return { status: 'unsupported', reason: 'MP4 recording requires a scene between 0 and 120 seconds.' }
  }
  if (!args.canvas.width || !args.canvas.height) return { status: 'unsupported', reason: 'The XR canvas has no rendered dimensions.' }
  // Adaptive DPR and panel layout can resize the live WebGL canvas. The encoder
  // receives a stable surface copied only after that same renderer finishes a frame.
  const captureSurface = document.createElement('canvas')
  captureSurface.width = Math.max(2, Math.floor(args.canvas.width / 2) * 2)
  captureSurface.height = Math.max(2, Math.floor(args.canvas.height / 2) * 2)
  const captureContext = captureSurface.getContext('2d', { alpha: false })
  if (!captureContext) return { status: 'unsupported', reason: 'A stable XR recording surface is unavailable.' }
  const release = acquireVideoSequenceRecorderLease()
  let stream: MediaStream | null = null
  let preview: HTMLVideoElement | null = null
  let previewFrames = 0
  let previewFrameId: number | null = null
  let recorderStarted = false
  let recorder: MediaRecorder | null = null
  let output: VideoSequenceRecorderOutput | null = null
  let detach = () => {}
  let detachClock = () => {}
  let releaseClock: (() => void) | null = null
  let rejectClock: ((reason: Error) => void) | null = null
  let releaseEnd: (() => void) | null = null
  let rejectEnd: ((reason: Error) => void) | null = null
  let detachStartAbort = () => {}
  let detachEndAbort = () => {}
  let clockEnding = false
  let clockEndFrames = 0
  let clockStarted = false
  let clockStartFrames = 0
  let startupImageFrozen = false
  let renderedFrames = 0
  let prepared = false
  let lastProgress = -1
  let bytes = 0
  let failure: Error | null = null
  const verificationAbort = new AbortController()
  const previousAfterRender = args.scene.onAfterRender
  let observedFrames = 0
  let renderedTime = -1
  let stableTimeFrames = 0
  let finalImageFrozen = false
  let wake: (() => void) | null = null
  const current = () => args.isCurrent() && binding.current()
  const assertCurrent = () => {
    if (args.signal?.aborted) throw abortError()
    if (!current()) throw new Error('XR source, document or canvas changed during MP4 export.')
    if (failure) throw failure
  }
  const check = () => {
    try { assertCurrent() } catch (error) { failure = error as Error; verificationAbort.abort() }
    wake?.()
  }
  const onRecorderStart = () => { recorderStarted = true; check() }
  const onPreviewFrame = () => {
    previewFrames++
    previewFrameId = preview!.requestVideoFrameCallback(onPreviewFrame)
    check()
  }
  const afterRender: Scene['onAfterRender'] = function (...renderArgs) {
    previousAfterRender.apply(this, renderArgs)
    if (!finalImageFrozen && !startupImageFrozen) {
      try { captureContext.drawImage(args.canvas, 0, 0, captureSurface.width, captureSurface.height) }
      catch (error) { failure = error as Error }
    }
    // A frozen pose still needs paints for captureStream to deliver its last frame.
    if ((finalImageFrozen || startupImageFrozen) && stream) {
      try { captureContext.drawImage(captureSurface, 0, 0) } catch (error) { failure = error as Error }
    }
    observedFrames += 1
    const frameTime = binding.time()
    stableTimeFrames = renderedTime === frameTime ? stableTimeFrames + 1 : 1
    renderedTime = frameTime
    // The terminal clock acknowledgement retains the authored camera until this
    // exact frame is copied. Later free-orbit renders cannot replace it.
    if (!finalImageFrozen && recorder?.state === 'recording') renderedFrames += 1
    if (!finalImageFrozen && clockEnding && observedFrames > clockEndFrames && frameTime === binding.durationSeconds) {
      finalImageFrozen = true
      // Stop the encoded clock as soon as the authored endpoint is copied.
      // Preview delivery and encoder readback can stall independently of Timeline.
      try { if (recorder?.state === 'recording') recorder.pause() } catch (error) { failure = error as Error }
    }
    if (renderArgs[0].xr?.isPresenting) failure = new Error('Exit immersive XR before exporting the authored camera.')
    check()
  }
  const waitRendered = (ready: () => boolean, timeoutMs: number): Promise<void> => new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`XR render or Timeline stalled during MP4 export (rendered=${renderedTime}, transport=${binding.time()}, duration=${binding.durationSeconds}, frames=${renderedFrames}, stable=${stableTimeFrames}).`)), timeoutMs)
    const finish = (error?: Error) => {
      clearTimeout(timer); wake = null
      if (error) reject(error); else resolve()
    }
    wake = () => {
      try { assertCurrent(); if (ready()) finish() } catch (error) { finish(error as Error) }
    }
    wake()
  })
  const waitSamplingSlots = (count: number): Promise<void> => {
    const before = previewFrames
    if (previewFrameId !== null) return waitRendered(() => previewFrames >= before + count, 5_000)
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer); verificationAbort.signal.removeEventListener('abort', aborted)
        if (error) reject(error); else resolve()
      }
      const aborted = () => finish(failure || abortError())
      const timer = setTimeout(() => finish(), Math.ceil(count * 1_000 / Math.min(60, Math.max(1, binding.fps))))
      verificationAbort.signal.addEventListener('abort', aborted, { once: true })
      if (verificationAbort.signal.aborted) aborted()
    })
  }
  const onData = (event: BlobEvent) => {
    bytes += event.data.size
    if (bytes > XR_MP4_MAX_BYTES) { failure = new Error('MP4 recording exceeds the 64 MB limit.'); check() }
  }
  const sampleRetainedImage = () => {
    const sample = document.createElement('canvas')
    sample.width = XR_MP4_FRAME_SAMPLE_SIZE; sample.height = XR_MP4_FRAME_SAMPLE_SIZE
    try {
      const context = sample.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('MP4 pose verification is unavailable.')
      context.drawImage(captureSurface, 0, 0, sample.width, sample.height)
      return context.getImageData(0, 0, sample.width, sample.height).data
    } finally { sample.width = 0; sample.height = 0 }
  }
  try {
    assertCurrent()
    args.scene.onAfterRender = afterRender
    detach = binding.subscribe(check)
    args.signal?.addEventListener('abort', check)
    prepared = true
    binding.prepare()
    const warmFrames = observedFrames
    await waitRendered(() => observedFrames >= warmFrames + 2 && renderedTime === 0 && stableTimeFrames >= 2, 5_000)
    const held = new Promise<void>((resolve, reject) => { releaseClock = resolve; rejectClock = reject })
    void held.catch(() => {})
    const ended = new Promise<void>((resolve, reject) => { releaseEnd = resolve; rejectEnd = reject })
    void ended.catch(() => {})
    const onClockBoundary = (event: Event) => {
      const frame = (event as CustomEvent<RichMediaTimelineLocalFrame>).detail
      if (!frame || frame.documentKey !== binding.documentKey) return
      try {
        assertCurrent()
        if (frame.clockEnd) {
          if (clockEnding || recorder?.state !== 'recording') return
          if (!frame.playing || Math.abs(frame.timeMs / 1_000 - binding.durationSeconds) > 0.000031) {
            throw new Error('The XR clock did not finish at the authored endpoint.')
          }
          if (!frame.clockEnd.hold(ended)) throw new Error('The XR clock completion is already held or cancelled.')
          clockEnding = true; clockEndFrames = observedFrames
          const signal = frame.clockEnd.signal
          const aborted = () => { failure = new Error('The XR clock was cancelled before the final render.'); check() }
          signal.addEventListener('abort', aborted, { once: true })
          detachEndAbort = () => signal.removeEventListener('abort', aborted)
          if (signal.aborted) aborted()
          // Event time is duration-normalized, but the pose owner reads rounded
          // native minutes. Correct that actual playhead through the same transport.
          if (binding.time() !== binding.durationSeconds) binding.refreshFinalFrame?.()
          return
        }
        if (!frame.clockStart || clockStarted) return
        if (frame.position !== 0 || frame.timeMs !== 0 || !frame.playing) throw new Error('The XR clock did not start at the opening frame.')
        if (!frame.clockStart.hold(held)) throw new Error('The XR clock startup is already held or cancelled.')
        clockStarted = true; clockStartFrames = observedFrames
        const signal = frame.clockStart.signal
        const aborted = () => {
          failure = new Error('The XR clock was cancelled during MP4 startup.'); check()
        }
        signal.addEventListener('abort', aborted, { once: true })
        detachStartAbort = () => signal.removeEventListener('abort', aborted)
        if (signal.aborted) aborted()
      } catch (error) { failure = error as Error; check() }
    }
    window.addEventListener(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, onClockBoundary)
    detachClock = () => {
      window.removeEventListener(RICH_MEDIA_TIMELINE_TRANSPORT_EVENT, onClockBoundary)
      detachStartAbort(); detachEndAbort()
    }
    binding.play()
    await waitRendered(() => {
      const time = binding.transportTime?.() ?? binding.time()
      if (time !== 0) throw new Error('The XR clock advanced before the opening frame was acknowledged.')
      return clockStarted && observedFrames > clockStartFrames && renderedTime === 0
    }, 5_000)
    // This is the rendered playing-camera zero pose, after the actual clock acknowledgement.
    startupImageFrozen = true
    const expectedInitialFrame = sampleRetainedImage()
    // Stream timestamps must begin after startup and GPU readback. Pausing an
    // already-started recorder cannot undo timestamps on queued opening frames.
    stream = captureSurface.captureStream(Math.min(60, Math.max(1, binding.fps)))
    if (!stream.getVideoTracks().length) throw new Error('XR canvas produced no video track.')
    preview = document.createElement('video')
    preview.muted = true; preview.playsInline = true; preview.srcObject = stream
    if (preview.requestVideoFrameCallback) previewFrameId = preview.requestVideoFrameCallback(onPreviewFrame)
    void preview.play().catch(error => { failure = error as Error; check() })
    await waitRendered(() => preview!.readyState >= 2 && (previewFrameId === null || previewFrames >= 2), 5_000)
    recorder = new MediaRecorder(stream, { mimeType: plan.mimeType })
    recorder.addEventListener('dataavailable', onData)
    recorder.addEventListener('error', check)
    recorder.addEventListener('start', onRecorderStart, { once: true })
    output = collectVideoSequenceRecorderOutput(recorder)
    void output.chunks.catch(error => { failure = error as Error; check() })
    assertCurrent()
    if ((binding.transportTime?.() ?? binding.time()) !== 0) throw new Error('The XR clock advanced before MP4 start.')
    recorder.start(250)
    await waitRendered(() => recorderStarted, 5_000)
    // Stream delivery can stall during startup; exclude that held-zero wait from recorded time.
    recorder.pause()
    const openingPreviewFrames = previewFrames
    captureContext.drawImage(captureSurface, 0, 0)
    ;(stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack).requestFrame?.()
    if (previewFrameId !== null) await waitRendered(() => previewFrames > openingPreviewFrames, 5_000)
    recorder.resume()
    assertCurrent()
    if ((binding.transportTime?.() ?? binding.time()) !== 0) throw new Error('The XR clock advanced while MP4 was starting.')
    detachStartAbort(); detachStartAbort = () => {}
    startupImageFrozen = false
    releaseClock!(); releaseClock = null; rejectClock = null
    await waitRendered(() => {
      if (!recorder || recorder.state === 'inactive' || output?.hasStopped()) throw new Error('MP4 recorder stopped before the scene finished.')
      const progress = Math.floor(Math.min(95, renderedTime / binding.durationSeconds * 95))
      if (progress !== lastProgress) { lastProgress = progress; args.onProgress?.(progress / 100) }
      return finalImageFrozen && recorder.state === 'paused' && renderedFrames >= 3
    }, binding.durationSeconds * 1_000 + 8_000)
    // Only the acknowledged terminal render releases the native playing camera.
    // Let the frozen endpoint reach preview while encoded time is paused, then
    // record one final sample so the last decodable frame has nonzero duration.
    detachClock(); detachClock = () => {}
    releaseEnd!(); releaseEnd = null; rejectEnd = null
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
    track.requestFrame?.()
    await waitSamplingSlots(2)
    assertCurrent()
    recorder.resume()
    track.requestFrame?.()
    await waitSamplingSlots(1)
    assertCurrent()
    await flushVideoSequenceRecorderOutput({ recorder, output, signal: args.signal })
    const chunks = await finishVideoSequenceRecorderOutput(recorder, output)
    output = null
    assertCurrent()
    stopVideoSequenceCaptureTracks(stream); stream = null
    // Readback may synchronize the GPU. Do it after recording ends so its cost
    // cannot extend the encoded duration; the retained surface is still frozen.
    const expectedFinalFrame = sampleRetainedImage()
    const blob = new Blob(chunks, { type: recorder.mimeType || plan.mimeType })
    const evidence = await (args.verify || verifyXrSceneMp4)(blob, binding.durationSeconds, verificationAbort.signal, expectedFinalFrame, expectedInitialFrame)
    if (!evidence.initialFrameVerified || !evidence.finalFrameVerified) throw new Error('MP4 opening pose or endpoint was not verified.')
    assertCurrent()
    args.onProgress?.(1)
    return { status: 'captured', blob, evidence: { ...evidence, renderedFrames } }
  } finally {
    detachClock(); rejectClock?.(failure || abortError()); rejectEnd?.(failure || abortError())
    detach(); args.signal?.removeEventListener('abort', check)
    if (recorder) {
      recorder.removeEventListener('dataavailable', onData); recorder.removeEventListener('error', check)
      recorder.removeEventListener('start', onRecorderStart)
      try { if (recorder.state !== 'inactive') recorder.stop() } catch { /* Tracks are released below. */ }
    }
    output?.dispose(); stopVideoSequenceCaptureTracks(stream)
    if (preview) {
      if (previewFrameId !== null) preview.cancelVideoFrameCallback(previewFrameId)
      preview.pause(); preview.srcObject = null
    }
    try {
      // Cancellation never writes the prior scene back into a newly opened document.
      if (prepared && current()) {
        binding.restoreTransport()
        const count = observedFrames
        failure = null
        await new Promise<void>(resolve => {
          const timer = setTimeout(() => { wake = null; resolve() }, 500)
          wake = () => { if (observedFrames > count) { clearTimeout(timer); wake = null; resolve() } }
        })
        if (current()) binding.restoreCameraAndPlayback()
      }
    } finally {
      if (args.scene.onAfterRender === afterRender) args.scene.onAfterRender = previousAfterRender
      captureSurface.width = 0; captureSurface.height = 0
      release()
    }
  }
}
