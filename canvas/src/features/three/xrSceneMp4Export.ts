import type { Scene } from 'three'
import type { CanvasVideoCaptureOptions, CanvasVideoCaptureResult } from '@/hooks/store/store-types/core'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  acquireVideoSequenceRecorderLease, collectVideoSequenceRecorderOutput,
  finishVideoSequenceRecorderOutput, flushVideoSequenceRecorderOutput, stopVideoSequenceCaptureTracks,
  type VideoSequenceRecorderOutput,
} from '@/components/timeline/videoSequenceRecorderLifecycle'
import { inspectBrowserRecorderCapabilities, negotiateBrowserRecordingPlan } from '@/features/xr-v2/mediaCapabilityNegotiation'
import { readXrAnimationTransport, updateXrAnimationTransport } from './xrAnimationTransportRuntime'
import { readXrMotionReferenceRuntime, subscribeXrMotionReferenceRuntime } from './xrMotionReferenceRuntime'
import { verifyXrSceneMp4, XR_MP4_MAX_BYTES } from './xrSceneMp4Evidence'

export type XrMp4SourceBinding = {
  durationSeconds: number
  fps: number
  current: () => boolean
  time: () => number
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
    durationSeconds: motion.plan.durationSeconds, fps: motion.plan.fps, current,
    time: () => readXrMotionReferenceRuntime().playheadSeconds,
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
        if (transport.playing) updateXrAnimationTransport({ operation: 'play', timeSeconds: transport.timeSeconds, playbackRate: transport.playbackRate })
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
  const release = acquireVideoSequenceRecorderLease()
  let stream: MediaStream | null = null
  let recorder: MediaRecorder | null = null
  let output: VideoSequenceRecorderOutput | null = null
  let detach = () => {}
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
  const afterRender: Scene['onAfterRender'] = function (...renderArgs) {
    previousAfterRender.apply(this, renderArgs)
    observedFrames += 1
    const frameTime = binding.time()
    stableTimeFrames = renderedTime === frameTime ? stableTimeFrames + 1 : 1
    renderedTime = frameTime
    // The native camera owner restores free orbit when playback ends. Reapply
    // the authored final camera through that same owner before the final acknowledgement.
    if (recorder?.state === 'recording' && frameTime >= binding.durationSeconds && stableTimeFrames === 1) binding.refreshFinalFrame?.()
    if (recorder?.state === 'recording') renderedFrames += 1
    if (renderArgs[0].xr?.isPresenting) failure = new Error('Exit immersive XR before exporting the authored camera.')
    check()
  }
  const waitRendered = (ready: () => boolean, timeoutMs: number): Promise<void> => new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('XR render or Timeline stalled during MP4 export.')), timeoutMs)
    const finish = (error?: Error) => {
      clearTimeout(timer); wake = null
      if (error) reject(error); else resolve()
    }
    wake = () => {
      try { assertCurrent(); if (ready()) finish() } catch (error) { finish(error as Error) }
    }
    wake()
  })
  const onData = (event: BlobEvent) => {
    bytes += event.data.size
    if (bytes > XR_MP4_MAX_BYTES) { failure = new Error('MP4 recording exceeds the 64 MB limit.'); check() }
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
    stream = args.canvas.captureStream(Math.min(60, Math.max(1, binding.fps)))
    if (!stream.getVideoTracks().length) throw new Error('XR canvas produced no video track.')
    recorder = new MediaRecorder(stream, { mimeType: plan.mimeType })
    recorder.addEventListener('dataavailable', onData)
    recorder.addEventListener('error', check)
    output = collectVideoSequenceRecorderOutput(recorder)
    void output.chunks.catch(error => { failure = error as Error; check() })
    recorder.start(250)
    binding.play()
    await waitRendered(() => {
      if (!recorder || recorder.state !== 'recording' || output?.hasStopped()) throw new Error('MP4 recorder stopped before the scene finished.')
      const progress = Math.floor(Math.min(95, renderedTime / binding.durationSeconds * 95))
      if (progress !== lastProgress) { lastProgress = progress; args.onProgress?.(progress / 100) }
      return renderedTime >= binding.durationSeconds && stableTimeFrames >= 2 && renderedFrames >= 3
    }, binding.durationSeconds * 1_000 + 8_000)
    binding.pause()
    await flushVideoSequenceRecorderOutput({ recorder, output, signal: args.signal })
    const chunks = await finishVideoSequenceRecorderOutput(recorder, output)
    output = null
    assertCurrent()
    stopVideoSequenceCaptureTracks(stream); stream = null
    const blob = new Blob(chunks, { type: recorder.mimeType || plan.mimeType })
    const evidence = await (args.verify || verifyXrSceneMp4)(blob, binding.durationSeconds, verificationAbort.signal)
    assertCurrent()
    args.onProgress?.(1)
    return { status: 'captured', blob, evidence: { ...evidence, renderedFrames } }
  } finally {
    detach(); args.signal?.removeEventListener('abort', check)
    if (recorder) {
      recorder.removeEventListener('dataavailable', onData); recorder.removeEventListener('error', check)
      try { if (recorder.state !== 'inactive') recorder.stop() } catch { /* Tracks are released below. */ }
    }
    output?.dispose(); stopVideoSequenceCaptureTracks(stream)
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
      release()
    }
  }
}
