export const MOTION_CONTROL_START_CANCELLED = Symbol('motion-control-start-cancelled')

export function waitForMotionControlStart<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T | typeof MOTION_CONTROL_START_CANCELLED> {
  if (signal.aborted) return Promise.resolve(MOTION_CONTROL_START_CANCELLED)
  return new Promise((resolve, reject) => {
    const cancel = () => resolve(MOTION_CONTROL_START_CANCELLED)
    signal.addEventListener('abort', cancel, { once: true })
    operation.then(
      (value) => {
        signal.removeEventListener('abort', cancel)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', cancel)
        reject(error)
      },
    )
  })
}
