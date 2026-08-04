import { type VideoSequenceExportPlan } from '@/components/timeline/videoSequenceExport'

const SMOKE_MEDIA_CANONICAL_PATH = '/knowgrph/demo/media-preview-metadata-ready.mp4'
const SMOKE_MEDIA_PATH = import.meta.env.BASE_URL === '/'
  ? '/demo/media-preview-metadata-ready.mp4'
  : SMOKE_MEDIA_CANONICAL_PATH
const PLAYBACK_TIMEOUT_MS = 12_000

export const SMOKE_RUNTIME_DOCUMENT_KEY = 'xr-v2-runtime-smoke.md'
export const SMOKE_MEDIA_GANTT_CODE = [
  'gantt',
  '  dateFormat HH:mm',
  '  axisFormat %M:%S',
  '  section Video',
  '  Fixture.mp4 : xr_v2_runtime_smoke_media, kgsrc_0_24, 00:00, 1m',
].join('\n')

export type XrV2TimelineCommandObservation = Readonly<{
  commandAction: 'nudge-forward'
  commandKind: 'clip-edit'
  handledCount: number
  panelRouteProven: boolean
  targetIdentity: string
}>

export type XrV2ExternalTimelineOwnerState = {
  commandAction: '' | 'nudge-forward'
  handledCount: number
  targetIdentity: string
}

export type XrV2MediaErrorObservation = Readonly<{
  code: number
  message: string
}>

export type XrV2MediaCleanupObservation = Readonly<{
  browserQuiescent: boolean
  objectUrlRevoked: boolean
  revokedObjectUrl: string
  videoNetworkStateEmpty: boolean
  videoSrcCleared: boolean
}>

export function createXrV2EditedMediaPlan(): VideoSequenceExportPlan {
  const source = {
    id: 'xr-v2-runtime-smoke-media',
    originalName: 'media-preview-metadata-ready.mp4',
    relativePath: 'demo/media-preview-metadata-ready.mp4',
    workspacePath: '',
    sourceUrl: SMOKE_MEDIA_PATH,
    mimeHint: 'video/mp4',
    byteSize: 1_092,
    durationSeconds: 0.4,
    frameRate: 30,
    displayWidth: 160,
    displayHeight: 90,
    importMode: 'url' as const,
  }
  return {
    durationMinutes: 0.65,
    filenameBase: 'xr-v2-runtime-smoke',
    segments: [{
      durationMinutes: 0.4,
      hasGrade: true,
      hasMask: false,
      label: 'Committed edited-media fixture',
      source,
      sourceLineIndex: 1,
      sourceEndRatio: 1,
      sourceStartRatio: 0,
      timelineEndMinutes: 0.65,
      timelineStartMinutes: 0.25,
    }],
  }
}

export function waitForXrV2DecodedMetadata(
  video: HTMLVideoElement,
  signal: AbortSignal,
): Promise<{ duration: number; height: number; width: number }> {
  return new Promise((resolve, reject) => {
    let timeoutId = 0
    const cleanup = () => {
      window.clearTimeout(timeoutId)
      signal.removeEventListener('abort', onAbort)
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('error', onError)
    }
    const finish = () => {
      cleanup()
      resolve({ duration: video.duration, height: video.videoHeight, width: video.videoWidth })
    }
    const fail = (message: string) => {
      cleanup()
      reject(new Error(message))
    }
    const onAbort = () => fail('XR v2 browser observation aborted while decoding edited media.')
    const onError = () => fail(`Edited-media decode failed with code ${video.error?.code || 0}.`)
    const onLoaded = () => finish()
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    video.addEventListener('loadeddata', onLoaded, { once: true })
    video.addEventListener('error', onError, { once: true })
    timeoutId = window.setTimeout(
      () => fail('Edited-media decode did not produce a frame before the timeout.'),
      PLAYBACK_TIMEOUT_MS,
    )
    video.load()
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) finish()
  })
}

export function observeXrV2Playback(
  video: HTMLVideoElement,
  signal: AbortSignal,
  initiallyUnbounded: boolean,
): Promise<{ currentTime: number; ended: boolean }> {
  return new Promise((resolve, reject) => {
    let timeoutId = 0
    let endedSettleId = 0
    const cleanup = () => {
      window.clearTimeout(timeoutId)
      window.clearTimeout(endedSettleId)
      signal.removeEventListener('abort', onAbort)
      video.removeEventListener('durationchange', onProgress)
      video.removeEventListener('ended', onProgress)
      video.removeEventListener('timeupdate', onProgress)
      video.removeEventListener('error', onError)
    }
    const finish = () => {
      cleanup()
      resolve({ currentTime: video.currentTime, ended: video.ended })
    }
    const fail = (message: string) => {
      cleanup()
      reject(new Error(message))
    }
    const onAbort = () => fail('XR v2 browser observation aborted during edited-media playback.')
    const onError = () => fail(`Edited-media playback failed with code ${video.error?.code || 0}.`)
    const onProgress = () => {
      if (video.currentTime < 0.05 && !video.ended) return
      const finiteDurationAvailable = Number.isFinite(video.duration) && video.duration > 0
      if (!initiallyUnbounded || finiteDurationAvailable) {
        finish()
        return
      }
      if (video.ended && !endedSettleId) endedSettleId = window.setTimeout(finish, 50)
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    video.addEventListener('durationchange', onProgress)
    video.addEventListener('ended', onProgress)
    video.addEventListener('timeupdate', onProgress)
    video.addEventListener('error', onError, { once: true })
    timeoutId = window.setTimeout(
      () => fail('Edited-media playback did not advance before the timeout.'),
      PLAYBACK_TIMEOUT_MS,
    )
    void video.play().then(onProgress, error => fail(
      error instanceof Error ? error.message : 'Edited-media playback was rejected.',
    ))
  })
}

export function readXrV2MediaError(video: HTMLVideoElement): XrV2MediaErrorObservation {
  return Object.freeze({
    code: Number(video.error?.code || 0),
    message: String(video.error?.message || 'HTMLMediaElement emitted an error event.'),
  })
}

export function releaseXrV2ObservedMedia(
  video: HTMLVideoElement | null,
  objectUrl: string,
): Readonly<{
  objectUrlRevoked: boolean
  revokedObjectUrl: string
  videoSrcAttributeRemoved: boolean
}> {
  if (video) {
    video.pause()
    video.removeAttribute('src')
    video.load()
  }
  const revokedObjectUrl = String(objectUrl || '')
  if (revokedObjectUrl) URL.revokeObjectURL(revokedObjectUrl)
  return Object.freeze({
    objectUrlRevoked: Boolean(revokedObjectUrl),
    revokedObjectUrl,
    videoSrcAttributeRemoved: Boolean(video && !video.hasAttribute('src')),
  })
}

export function waitForXrV2ObservationQuiescence(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let taskId = 0
    let firstFrame = 0
    let secondFrame = 0
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort)
      if (taskId) window.clearTimeout(taskId)
      if (firstFrame) window.cancelAnimationFrame(firstFrame)
      if (secondFrame) window.cancelAnimationFrame(secondFrame)
    }
    const onAbort = () => {
      cleanup()
      reject(new Error('XR v2 browser observation aborted before quiescence.'))
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    taskId = window.setTimeout(() => {
      taskId = 0
      firstFrame = window.requestAnimationFrame(() => {
        firstFrame = 0
        secondFrame = window.requestAnimationFrame(() => {
          secondFrame = 0
          cleanup()
          resolve()
        })
      })
    }, 0)
  })
}

export async function probeMountedXrV2TimelinePanel(args: {
  externalOwner: XrV2ExternalTimelineOwnerState
  signal: AbortSignal
  wrapper: HTMLElement
}): Promise<Readonly<{
  observation: XrV2TimelineCommandObservation
  routed: boolean
}>> {
  const clipButton = args.wrapper.querySelector<HTMLButtonElement>(
    '[data-kg-gantt-timeline-track-row-key] button.timeline-transport-track-clip-move',
  )
  if (!clipButton) throw new Error('Mounted Timeline observation clip is unavailable.')
  clipButton.click()
  await waitForXrV2ObservationQuiescence(args.signal)

  const selectedClip = args.wrapper.querySelector<HTMLElement>(
    '[data-kg-gantt-timeline-track-row-key][data-kg-video-sequence-active-track="1"]',
  )
  const selectedRowKey = selectedClip?.getAttribute('data-kg-gantt-timeline-track-row-key') || ''
  if (!selectedRowKey) throw new Error('Mounted Timeline observation clip selection did not commit.')

  const nudgeButton = args.wrapper.querySelector<HTMLButtonElement>(
    'button[data-kg-video-sequence-clip-edit="nudge-forward"]',
  )
  if (!nudgeButton || nudgeButton.disabled) {
    throw new Error('Mounted Timeline nudge-forward control is unavailable.')
  }
  nudgeButton.click()
  await waitForXrV2ObservationQuiescence(args.signal)

  const expectedTargetIdentity = `${SMOKE_RUNTIME_DOCUMENT_KEY}|${selectedRowKey}|0`
  const panelRouteProven = args.externalOwner.handledCount === 1
    && args.externalOwner.commandAction === 'nudge-forward'
    && args.externalOwner.targetIdentity === expectedTargetIdentity
  return Object.freeze({
    observation: Object.freeze({
      commandAction: 'nudge-forward',
      commandKind: 'clip-edit',
      handledCount: args.externalOwner.handledCount,
      panelRouteProven,
      targetIdentity: args.externalOwner.targetIdentity,
    }),
    routed: panelRouteProven,
  })
}
