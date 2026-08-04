import { createVideoSequenceExportError } from './videoSequenceExportSession'

const VIDEO_SEQUENCE_SEGMENT_POLL_MS = 30

const createAbortError = (): Error => createVideoSequenceExportError('aborted')

const createMediaError = (video: HTMLVideoElement): Error => createVideoSequenceExportError(
  'source-load-failed',
  `Source media failed during edited export (media error ${video.error?.code || 0}).`,
)

export function waitForVideoSequenceSegmentPlayback(args: {
  endSeconds: number
  signal?: AbortSignal
  video: HTMLVideoElement
}): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => {
      if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId)
      args.signal?.removeEventListener('abort', onAbort)
      args.video.removeEventListener('ended', onPlaybackEvent)
      args.video.removeEventListener('error', onError)
      args.video.removeEventListener('pause', onPlaybackEvent)
      args.video.removeEventListener('timeupdate', onPlaybackEvent)
    }
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve()
    }
    const onAbort = () => finish(createAbortError())
    const onError = () => finish(createMediaError(args.video))
    const evaluate = () => {
      if (settled) return
      if (timeoutId !== undefined) {
        globalThis.clearTimeout(timeoutId)
        timeoutId = undefined
      }
      if (args.signal?.aborted) {
        onAbort()
        return
      }
      if (args.video.error) {
        onError()
        return
      }
      if (args.video.currentTime >= args.endSeconds || args.video.ended) {
        finish()
        return
      }
      if (args.video.paused) {
        finish(createVideoSequenceExportError(
          'runtime-failed',
          'Source media paused before the edited export segment completed.',
        ))
        return
      }
      timeoutId = globalThis.setTimeout(evaluate, VIDEO_SEQUENCE_SEGMENT_POLL_MS)
    }
    const onPlaybackEvent = () => evaluate()
    if (args.signal?.aborted) {
      onAbort()
      return
    }
    args.signal?.addEventListener('abort', onAbort, { once: true })
    args.video.addEventListener('ended', onPlaybackEvent)
    args.video.addEventListener('error', onError, { once: true })
    args.video.addEventListener('pause', onPlaybackEvent)
    args.video.addEventListener('timeupdate', onPlaybackEvent)
    evaluate()
  })
}
