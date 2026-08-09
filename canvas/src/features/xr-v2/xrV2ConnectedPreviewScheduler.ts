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
