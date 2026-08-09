export function waitForXrV2ConnectedPreviewPaintScheduler(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error('WebRTC preview observation was aborted.'))
  return new Promise((resolve, reject) => {
    let frameHandle: number | null = null
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort)
      if (frameHandle !== null) cancelAnimationFrame(frameHandle)
    }
    const onAbort = () => {
      cleanup()
      reject(new Error('WebRTC preview observation was aborted.'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    frameHandle = requestAnimationFrame(() => {
      frameHandle = null
      signal.removeEventListener('abort', onAbort)
      resolve()
    })
  })
}

export type XrV2ConnectedPreviewPaintHandle = Readonly<{ cancel: () => void }>

type PrioritizedScheduler = Readonly<{
  postTask: (
    callback: () => void,
    options: Readonly<{ priority: 'user-blocking'; delay: number; signal: AbortSignal }>,
  ) => Promise<unknown>
}>

/**
 * Prefer the compositor frame, but retain a foreground render task so a busy
 * workspace cannot starve an explicit connected-preview edit behind unrelated
 * continuous animation callbacks. The fallback remains a later browser task
 * and runs before the 250 ms transport deadline.
 */
export function scheduleXrV2ConnectedPreviewPaint(
  callback: FrameRequestCallback,
): XrV2ConnectedPreviewPaintHandle {
  let settled = false
  const scheduler = (globalThis as typeof globalThis & { scheduler?: PrioritizedScheduler }).scheduler
  const taskAbortController = new AbortController()
  const finish = (timestamp: number) => {
    if (settled) return
    settled = true
    taskAbortController.abort()
    cancelAnimationFrame(frameHandle)
    callback(timestamp)
  }
  const frameHandle = requestAnimationFrame(finish)
  if (scheduler?.postTask) {
    void scheduler.postTask(
      () => finish(performance.now()),
      { priority: 'user-blocking', delay: 100, signal: taskAbortController.signal },
    ).catch(error => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error
    })
  }
  return Object.freeze({
    cancel: () => {
      if (settled) return
      settled = true
      taskAbortController.abort()
      cancelAnimationFrame(frameHandle)
    },
  })
}
