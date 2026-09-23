import { createVideoSequenceExportError } from './videoSequenceExportSession'

const VIDEO_EXPORT_RECORDER_DATA_TIMEOUT_MS = 1_000

export type VideoSequenceRecorderOutput = Readonly<{
  dispose: () => void
  chunks: Promise<BlobPart[]>
  hasNonEmptyData: () => boolean
  hasStopped: () => boolean
  waitForNonEmptyData: (signal?: AbortSignal) => Promise<boolean>
}>

const createVideoSequenceExportAbortError = (): Error => createVideoSequenceExportError('aborted')

export function collectVideoSequenceRecorderOutput(recorder: MediaRecorder): VideoSequenceRecorderOutput {
  const chunks: BlobPart[] = []
  const dataWaiters = new Set<(hasData: boolean) => void>()
  let finished = false
  const notifyDataWaiters = (hasData: boolean) => {
    for (const waiter of [...dataWaiters]) waiter(hasData)
  }
  let dispose = () => {}
  const chunksPromise = new Promise<BlobPart[]>((resolve, reject) => {
    const cleanup = () => {
      recorder.removeEventListener('dataavailable', onData)
      recorder.removeEventListener('stop', onStop)
      recorder.removeEventListener('error', onError)
    }
    const onData = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) chunks.push(event.data)
      if (chunks.length > 0) notifyDataWaiters(true)
    }
    const onStop = () => {
      finished = true
      cleanup()
      notifyDataWaiters(chunks.length > 0)
      resolve(chunks)
    }
    const onError = () => {
      finished = true
      cleanup()
      notifyDataWaiters(chunks.length > 0)
      reject(createVideoSequenceExportError('runtime-failed'))
    }
    dispose = () => { finished = true; cleanup(); notifyDataWaiters(false); reject(createVideoSequenceExportAbortError()) }
    recorder.addEventListener('dataavailable', onData)
    recorder.addEventListener('stop', onStop, { once: true })
    recorder.addEventListener('error', onError, { once: true })
  })
  void chunksPromise.catch(() => undefined)

  const waitForNonEmptyData = (signal?: AbortSignal): Promise<boolean> => {
    if (chunks.length > 0) return Promise.resolve(true)
    if (finished) return Promise.resolve(false)
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const cleanup = () => {
        if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId)
        dataWaiters.delete(onData)
        signal?.removeEventListener('abort', onAbort)
      }
      const finish = (hasData: boolean) => {
        cleanup()
        resolve(hasData)
      }
      const onAbort = () => {
        cleanup()
        reject(createVideoSequenceExportAbortError())
      }
      const onData = (hasData: boolean) => finish(hasData)
      if (signal?.aborted) {
        onAbort()
        return
      }
      dataWaiters.add(onData)
      signal?.addEventListener('abort', onAbort, { once: true })
      timeoutId = globalThis.setTimeout(
        () => finish(chunks.length > 0),
        VIDEO_EXPORT_RECORDER_DATA_TIMEOUT_MS,
      )
    })
  }

  return Object.freeze({
    dispose: () => dispose(),
    chunks: chunksPromise,
    hasNonEmptyData: () => chunks.length > 0,
    hasStopped: () => finished,
    waitForNonEmptyData,
  })
}

export async function flushVideoSequenceRecorderOutput(args: {
  output: VideoSequenceRecorderOutput
  recorder: MediaRecorder
  signal?: AbortSignal
}): Promise<void> {
  if (args.output.hasNonEmptyData() || args.recorder.state !== 'recording') return
  args.recorder.requestData()
  await args.output.waitForNonEmptyData(args.signal)
}

// Both XR canvas and edited-video exports own this one recorder lease.
let activeRecorderLease: symbol | null = null
export const isVideoSequenceRecorderLeased = (): boolean => activeRecorderLease !== null
export function acquireVideoSequenceRecorderLease(): () => void {
  if (activeRecorderLease) throw new Error('Another media export is running. Cancel it before starting another export.')
  const lease = Symbol('media-export')
  activeRecorderLease = lease
  return () => { if (activeRecorderLease === lease) activeRecorderLease = null }
}

export function stopVideoSequenceCaptureTracks(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() || []) {
    try { track.stop() } catch { /* Continue releasing the remaining tracks. */ }
  }
}

export async function finishVideoSequenceRecorderOutput(
  recorder: MediaRecorder,
  output: VideoSequenceRecorderOutput,
): Promise<BlobPart[]> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    if (recorder.state !== 'inactive') recorder.stop()
    return await Promise.race([
      output.chunks,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Media recorder did not finish.')), 2_000)
      }),
    ])
  } finally {
    clearTimeout(timer)
    output.dispose()
  }
}
