type SurfaceFrameWindow = Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame'>

/** A disposed surface may cancel its frames, but must not cancel the deadline. */
export function waitForSurfaceFrame(
  deadline: number,
  timeoutMessage: string,
  frameWindow: SurfaceFrameWindow = window,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      reject(new Error(timeoutMessage))
      return
    }
    let settled = false
    let frameId: number | undefined
    // Use the execution host's timer rather than the disposable surface's timer.
    const timeoutId = globalThis.setTimeout(() => {
      if (settled) return
      settled = true
      try {
        if (frameId !== undefined) frameWindow.cancelAnimationFrame(frameId)
      } catch {
        // A disposed surface may reject cancellation; the deadline still settles.
      }
      reject(new Error(timeoutMessage))
    }, remainingMs)
    try {
      frameId = frameWindow.requestAnimationFrame(() => {
        if (settled) return
        settled = true
        globalThis.clearTimeout(timeoutId)
        resolve()
      })
    } catch (error) {
      settled = true
      globalThis.clearTimeout(timeoutId)
      reject(error)
    }
  })
}
