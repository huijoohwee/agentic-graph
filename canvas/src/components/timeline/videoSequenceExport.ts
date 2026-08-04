import {
  loadTimelinePlanVideoMetadata,
  resolveTimelinePlanSourceUrl,
  type VideoSequenceExportPlan,
  type VideoSequenceExportSegment,
} from './timelinePlanSync'

export type {
  VideoSequenceExportPlan,
  VideoSequenceExportSegment,
} from './timelinePlanSync'

export {
  areVideoSequenceExportSourcesEqual,
  buildTimelinePreviewSyncPlan,
  buildTimelinePreviewThumbnailPlan,
  buildVideoSequenceExportPlan,
  resolveTimelinePlanPositionFromSourceTime,
  resolveTimelinePlanSourceTimeAtPosition,
  type TimelinePlanSourceTimeResolution,
} from './timelinePlanSync'

export type * from './videoSequenceExportTypes'

export {
  buildVideoSequenceExportProgress,
  buildVideoSequenceExportSessionCollection,
  buildVideoSequenceExportSessionSurfaceModel,
  createVideoSequenceExportSessionRecord,
  groupVideoSequenceExportSessions,
  reduceVideoSequenceExportSessionRecord,
  resolveVideoSequenceExportErrorCode,
  resolveVideoSequenceExportErrorFeedback,
  resolveVideoSequenceExportErrorMessage,
  resolveVideoSequenceExportEvent,
  resolveVideoSequenceExportOutcome,
  resolveVideoSequenceExportPlanError,
  resolveVideoSequenceExportRetryControl,
  resolveVideoSequenceExportRetryError,
  resolveVideoSequenceExportRetryRequest,
  resolveVideoSequenceExportSessionToneStyle,
  selectVideoSequenceExportSessionSurfaceSessions,
  upsertVideoSequenceExportSessionHistory,
} from './videoSequenceExportSession'
import { downloadBlob } from '@/lib/graph/save'
import {
  buildVideoSequenceExportProgress,
  createVideoSequenceExportError,
  resolveVideoSequenceExportErrorCode,
  resolveVideoSequenceExportErrorMessage,
  resolveVideoSequenceExportEvent,
  resolveVideoSequenceExportOutcome,
  resolveVideoSequenceExportPlanError,
} from './videoSequenceExportSession'
import {
  collectVideoSequenceRecorderOutput,
  flushVideoSequenceRecorderOutput,
  type VideoSequenceRecorderOutput,
} from './videoSequenceRecorderLifecycle'
import { waitForVideoSequenceSegmentPlayback } from './videoSequenceSegmentPlayback'
import type {
  VideoSequenceExportDownloadResult,
  VideoSequenceExportEvent,
  VideoSequenceExportKind,
  VideoSequenceExportOutcome,
  VideoSequenceExportProgress,
} from './videoSequenceExportTypes'

type MediaRecorderConstructorLike = {
  isTypeSupported?: (mimeType: string) => boolean
} | null | undefined

type VideoSequenceRenderSegment = VideoSequenceExportSegment & {
  gapSecondsBefore: number
  sourceEndSeconds: number
  sourceStartSeconds: number
  url: string
}

const VIDEO_EXPORT_WIDTH = 1280
const VIDEO_EXPORT_HEIGHT = 720
const VIDEO_EXPORT_FRAME_RATE = 30
const VIDEO_EXPORT_MIN_GAP_SECONDS = 0.05

function selectMediaRecorderMimeType(candidates: readonly string[], recorder: MediaRecorderConstructorLike): string {
  if (!recorder || typeof recorder.isTypeSupported !== 'function') return candidates[candidates.length - 1] || ''
  return candidates.find(candidate => recorder.isTypeSupported?.(candidate)) || candidates[candidates.length - 1] || ''
}

export function resolveVideoSequenceExportRecorderMimeType(
  kind: VideoSequenceExportKind,
  recorder: MediaRecorderConstructorLike = typeof MediaRecorder !== 'undefined' ? MediaRecorder : null,
): string {
  return kind === 'audio'
    ? selectMediaRecorderMimeType(['audio/webm;codecs=opus', 'audio/webm'], recorder)
    : selectMediaRecorderMimeType(['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'], recorder)
}

export function resolveVideoSequenceExportCapabilityError(args: {
  kind: VideoSequenceExportKind
  hasAudioContext: boolean
  hasCanvasCaptureStream: boolean
  hasMediaRecorder: boolean
}): string {
  if (!args.hasMediaRecorder) return resolveVideoSequenceExportErrorMessage('capability-media-recorder')
  if (!args.hasAudioContext) return resolveVideoSequenceExportErrorMessage('capability-audio-context')
  if (args.kind === 'video' && !args.hasCanvasCaptureStream) return resolveVideoSequenceExportErrorMessage('capability-canvas-capture')
  return ''
}

export function isVideoSequenceExportAbortError(error: unknown): boolean {
  return resolveVideoSequenceExportErrorCode(error) === 'aborted'
}

const createVideoSequenceExportAbortError = (): Error => createVideoSequenceExportError('aborted')

function throwIfVideoSequenceExportAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createVideoSequenceExportAbortError()
}

function reportVideoSequenceExportProgress(
  onEvent: ((event: VideoSequenceExportEvent) => void) | undefined,
  onProgress: ((progress: VideoSequenceExportProgress) => void) | undefined,
  progress: VideoSequenceExportProgress,
): void {
  try {
    onProgress?.(progress)
  } catch {
    void 0
  }
  try {
    onEvent?.(resolveVideoSequenceExportEvent({ progress }))
  } catch {
    void 0
  }
}

function reportVideoSequenceExportOutcome(
  onEvent: ((event: VideoSequenceExportEvent) => void) | undefined,
  outcome: VideoSequenceExportOutcome,
): void {
  try {
    onEvent?.(resolveVideoSequenceExportEvent({ outcome }))
  } catch {
    void 0
  }
}

function waitForVideoSequenceExportDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createVideoSequenceExportAbortError())
      return
    }
    let settled = false
    const timeoutId = globalThis.setTimeout(() => {
      settled = true
      signal?.removeEventListener('abort', handleAbort)
      resolve()
    }, Math.max(0, ms))
    const handleAbort = () => {
      if (settled) return
      settled = true
      globalThis.clearTimeout(timeoutId)
      signal?.removeEventListener('abort', handleAbort)
      reject(createVideoSequenceExportAbortError())
    }
    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}

function seekVideo(video: HTMLVideoElement, seconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createVideoSequenceExportAbortError())
      return
    }
    const target = Math.max(0, seconds)
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => {
      video.removeEventListener('seeked', done)
      signal?.removeEventListener('abort', handleAbort)
      if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId)
    }
    const done = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const handleAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(createVideoSequenceExportAbortError())
    }
    video.addEventListener('seeked', done, { once: true })
    signal?.addEventListener('abort', handleAbort, { once: true })
    try {
      video.currentTime = target
      timeoutId = globalThis.setTimeout(done, 800)
    } catch (error) {
      settled = true
      cleanup()
      reject(error)
    }
  })
}

async function cleanupVideoSequenceExportRuntime(args: {
  audioContext: AudioContext
  audioSource: MediaElementAudioSourceNode | null
  stream: MediaStream | null
  video: HTMLVideoElement
}): Promise<void> {
  try {
    args.stream?.getTracks().forEach(track => track.stop())
  } catch {
    void 0
  }
  try {
    args.audioSource?.disconnect()
  } catch {
    void 0
  }
  try {
    await args.audioContext.close()
  } catch {
    void 0
  }
  try {
    args.video.pause()
    args.video.removeAttribute('src')
    args.video.load()
  } catch {
    void 0
  }
}

function drawVideoFrame(args: {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  segment: VideoSequenceExportSegment | null
  video: HTMLVideoElement | null
}): void {
  const { canvas, context, segment, video } = args
  context.save()
  context.fillStyle = '#05070a'
  context.fillRect(0, 0, canvas.width, canvas.height)
  if (video && video.videoWidth > 0 && video.videoHeight > 0) {
    const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight)
    const width = video.videoWidth * scale
    const height = video.videoHeight * scale
    const x = (canvas.width - width) / 2
    const y = (canvas.height - height) / 2
    if (segment?.hasGrade) context.filter = 'contrast(1.08) saturate(1.16) brightness(1.03)'
    if (segment?.hasMask) {
      context.beginPath()
      context.ellipse(canvas.width / 2, canvas.height / 2, canvas.width * 0.43, canvas.height * 0.43, 0, 0, Math.PI * 2)
      context.clip()
    }
    context.drawImage(video, x, y, width, height)
    if (segment?.hasMask) {
      context.restore()
      context.save()
      context.fillStyle = 'rgba(0, 0, 0, 0.32)'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
  }
  context.restore()
}

async function recordGap(args: {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  seconds: number
  signal?: AbortSignal
}): Promise<void> {
  if (args.seconds <= VIDEO_EXPORT_MIN_GAP_SECONDS) return
  throwIfVideoSequenceExportAborted(args.signal)
  drawVideoFrame({ canvas: args.canvas, context: args.context, segment: null, video: null })
  await waitForVideoSequenceExportDelay(args.seconds * 1000, args.signal)
}

async function recordSegment(args: {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  segment: VideoSequenceRenderSegment
  signal?: AbortSignal
  video: HTMLVideoElement
}): Promise<void> {
  const { canvas, context, segment, video } = args
  throwIfVideoSequenceExportAborted(args.signal)
  let raf = 0
  let stopped = true
  let observedMediaErrorCode = 0
  const onMediaError = () => {
    observedMediaErrorCode = video.error?.code || -1
  }
  const throwIfMediaFailed = () => {
    if (!observedMediaErrorCode && !video.error) return
    throw createVideoSequenceExportError(
      'source-load-failed',
      `Source media failed during edited export (media error ${observedMediaErrorCode || video.error?.code || 0}).`,
    )
  }
  const drawLoop = () => {
    if (stopped) return
    drawVideoFrame({ canvas, context, segment, video })
    raf = window.requestAnimationFrame(drawLoop)
  }
  video.addEventListener('error', onMediaError)
  try {
    const duration = await loadTimelinePlanVideoMetadata({
      url: segment.url,
      video,
      timeoutMs: 8000,
    })
    throwIfMediaFailed()
    if (!duration) throw createVideoSequenceExportError('source-load-failed')
    const startSeconds = Math.max(0, Math.min(duration, segment.sourceStartSeconds))
    const endSeconds = Math.max(startSeconds, Math.min(duration, segment.sourceEndSeconds))
    await seekVideo(video, startSeconds, args.signal)
    throwIfMediaFailed()
    stopped = false
    drawLoop()
    await video.play()
    throwIfMediaFailed()
    await waitForVideoSequenceSegmentPlayback({ endSeconds, signal: args.signal, video })
    throwIfMediaFailed()
    throwIfVideoSequenceExportAborted(args.signal)
  } finally {
    video.removeEventListener('error', onMediaError)
    stopped = true
    if (raf) window.cancelAnimationFrame(raf)
    video.pause()
  }
}

async function resolveRenderSegments(args: {
  onEvent?: (event: VideoSequenceExportEvent) => void
  onProgress?: (progress: VideoSequenceExportProgress) => void
  plan: VideoSequenceExportPlan
  renderKind: VideoSequenceExportKind
  signal?: AbortSignal
}): Promise<VideoSequenceRenderSegment[]> {
  let cursorMinutes = 0
  const secondsPerMinute = 1
  const out: VideoSequenceRenderSegment[] = []
  reportVideoSequenceExportProgress(args.onEvent, args.onProgress, buildVideoSequenceExportProgress({
    completedSegments: 0,
    kind: args.renderKind,
    phase: 'preparing',
    totalSegments: args.plan.segments.length,
  }))
  for (const segment of args.plan.segments) {
    throwIfVideoSequenceExportAborted(args.signal)
    const url = resolveTimelinePlanSourceUrl(segment.source)
    if (!url) throw createVideoSequenceExportError('source-unavailable')
    const probe = document.createElement('video')
    probe.preload = 'metadata'
    probe.crossOrigin = 'anonymous'
    let duration = 0
    try {
      duration = await loadTimelinePlanVideoMetadata({ url, video: probe, timeoutMs: 8000 })
    } finally {
      probe.removeAttribute('src')
      probe.load()
    }
    if (!duration) throw createVideoSequenceExportError('source-load-failed')
    const gapMinutes = Math.max(0, segment.timelineStartMinutes - cursorMinutes)
    out.push({
      ...segment,
      gapSecondsBefore: gapMinutes * secondsPerMinute,
      sourceEndSeconds: segment.sourceEndRatio * duration,
      sourceStartSeconds: segment.sourceStartRatio * duration,
      url,
    })
    cursorMinutes = Math.max(cursorMinutes, segment.timelineEndMinutes)
  }
  return out
}

function assertRecorderIsActive(recorder: MediaRecorder, output: VideoSequenceRecorderOutput): void {
  if (recorder.state === 'recording' && !output.hasStopped()) return
  throw createVideoSequenceExportError('runtime-failed', 'Edited media recorder stopped before rendering completed.')
}

export async function renderVideoSequenceExport(args: {
  kind: VideoSequenceExportKind
  onEvent?: (event: VideoSequenceExportEvent) => void
  onProgress?: (progress: VideoSequenceExportProgress) => void
  plan: VideoSequenceExportPlan
  signal?: AbortSignal
}): Promise<Blob> {
  const planError = resolveVideoSequenceExportPlanError(args.plan)
  if (planError) throw new Error(planError)
  const canvas = document.createElement('canvas')
  canvas.width = VIDEO_EXPORT_WIDTH
  canvas.height = VIDEO_EXPORT_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw createVideoSequenceExportError('capability-canvas-export')
  const captureStream = canvas.captureStream?.bind(canvas)
  const capabilityError = resolveVideoSequenceExportCapabilityError({
    kind: args.kind,
    hasAudioContext: typeof AudioContext !== 'undefined',
    hasCanvasCaptureStream: typeof captureStream === 'function',
    hasMediaRecorder: typeof MediaRecorder !== 'undefined',
  })
  if (capabilityError) {
    throw createVideoSequenceExportError(
      resolveVideoSequenceExportErrorCode(new Error(capabilityError)) || 'runtime-failed',
      capabilityError,
    )
  }
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.playsInline = true
  video.preload = 'auto'
  const audioContext = new AudioContext()
  let audioDestination: MediaStreamAudioDestinationNode | null = null
  let audioSource: MediaElementAudioSourceNode | null = null
  let stream: MediaStream | null = null
  try {
    audioDestination = audioContext.createMediaStreamDestination()
    audioSource = audioContext.createMediaElementSource(video)
    audioSource.connect(audioDestination)
    throwIfVideoSequenceExportAborted(args.signal)
    await audioContext.resume()
    const renderSegments = await resolveRenderSegments({
      onEvent: args.onEvent,
      onProgress: args.onProgress,
      plan: args.plan,
      renderKind: args.kind,
      signal: args.signal,
    })
    const mimeType = resolveVideoSequenceExportRecorderMimeType(args.kind)
    if (args.kind === 'audio') {
      stream = audioDestination.stream
    } else {
      const canvasStream = canvas.captureStream(VIDEO_EXPORT_FRAME_RATE)
      stream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks(),
      ])
    }
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const recorderOutput = collectVideoSequenceRecorderOutput(recorder)
    recorder.start(250)
    let renderFailure: unknown = null
    try {
      assertRecorderIsActive(recorder, recorderOutput)
      for (let i = 0; i < renderSegments.length; i += 1) {
        const segment = renderSegments[i]
        await recordGap({ canvas, context, seconds: segment.gapSecondsBefore, signal: args.signal })
        assertRecorderIsActive(recorder, recorderOutput)
        await recordSegment({ canvas, context, segment, signal: args.signal, video })
        assertRecorderIsActive(recorder, recorderOutput)
        reportVideoSequenceExportProgress(args.onEvent, args.onProgress, buildVideoSequenceExportProgress({
          completedSegments: i + 1,
          kind: args.kind,
          phase: 'rendering',
          totalSegments: renderSegments.length,
        }))
      }
      await flushVideoSequenceRecorderOutput({
        output: recorderOutput,
        recorder,
        signal: args.signal,
      })
      assertRecorderIsActive(recorder, recorderOutput)
    } catch (error) {
      renderFailure = error
    } finally {
      if (recorder.state !== 'inactive') recorder.stop()
    }
    let chunks: BlobPart[] = []
    try {
      chunks = await recorderOutput.chunks
    } catch (error) {
      if (!renderFailure) renderFailure = error
    }
    if (renderFailure) throw renderFailure
    reportVideoSequenceExportProgress(args.onEvent, args.onProgress, buildVideoSequenceExportProgress({
      completedSegments: renderSegments.length,
      kind: args.kind,
      phase: 'finalizing',
      totalSegments: renderSegments.length,
    }))
    const outputType = mimeType || (args.kind === 'audio' ? 'audio/webm' : 'video/webm')
    const outputBlob = new Blob(chunks, { type: outputType })
    if (outputBlob.size === 0) {
      throw createVideoSequenceExportError('runtime-failed', 'Edited media export produced no data.')
    }
    return outputBlob
  } finally {
    await cleanupVideoSequenceExportRuntime({
      audioContext,
      audioSource,
      stream,
      video,
    })
  }
}

export async function downloadVideoSequenceExport(args: {
  kind: VideoSequenceExportKind
  onEvent?: (event: VideoSequenceExportEvent) => void
  onProgress?: (progress: VideoSequenceExportProgress) => void
  plan: VideoSequenceExportPlan
  signal?: AbortSignal
}): Promise<VideoSequenceExportDownloadResult> {
  try {
    const blob = await renderVideoSequenceExport(args)
    const filename = `${args.plan.filenameBase}.edited.${args.kind === 'audio' ? 'audio.webm' : 'video.webm'}`
    downloadBlob(blob, filename)
    const result = {
      byteSize: blob.size,
      filename,
      kind: args.kind,
      mimeType: blob.type,
    }
    reportVideoSequenceExportOutcome(args.onEvent, resolveVideoSequenceExportOutcome({
      kind: args.kind,
      result,
    }))
    return result
  } catch (error) {
    reportVideoSequenceExportOutcome(args.onEvent, resolveVideoSequenceExportOutcome({
      error,
      kind: args.kind,
    }))
    throw error
  }
}
