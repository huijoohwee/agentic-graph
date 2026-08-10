export const XR_V2_MOUNTED_AUTHORING_EDIT_COMMIT_TIMEOUT_MS = 2_000

type RenderTarget = Readonly<{
  attached: boolean
  visible: boolean
  markRendered(revision: number): void
}>

type CommitOptions = Readonly<{
  deadlineMs?: number
  requestFrame?: (callback: FrameRequestCallback) => number
  cancelFrame?: (handle: number) => void
  now?: () => number
}>

export function waitForXrV2MountedAuthoringVisibilityCommit(input: Readonly<{
  readTarget: () => RenderTarget | null
  visible: boolean
  revision: number
  signal: AbortSignal
  options?: CommitOptions
}>): Promise<Readonly<{ visible: boolean; renderedAtMs: number; attached: true }>> {
  if (typeof input.readTarget !== 'function' || typeof input.visible !== 'boolean'
    || !Number.isSafeInteger(input.revision) || input.revision < 1) {
    throw new Error('Mounted authoring visibility commit input is invalid')
  }
  const deadlineMs = input.options?.deadlineMs ?? XR_V2_MOUNTED_AUTHORING_EDIT_COMMIT_TIMEOUT_MS
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 10
    || deadlineMs > XR_V2_MOUNTED_AUTHORING_EDIT_COMMIT_TIMEOUT_MS) {
    throw new Error('Mounted authoring visibility commit deadline is outside the supported bound')
  }
  const requestFrame = input.options?.requestFrame || globalThis.requestAnimationFrame
    || (callback => setTimeout(() => callback(performance.now()), 0) as unknown as number)
  const cancelFrame = input.options?.cancelFrame || globalThis.cancelAnimationFrame
    || (handle => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>))
  const now = input.options?.now || (() => performance.now())

  return new Promise((resolve, reject) => {
    let settled = false
    let frameHandle: number | null = null
    let deadlineHandle: ReturnType<typeof setTimeout> | null = null
    const cleanup = () => {
      input.signal.removeEventListener('abort', onAbort)
      if (frameHandle !== null) cancelFrame(frameHandle)
      if (deadlineHandle !== null) clearTimeout(deadlineHandle)
    }
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const succeed = (target: RenderTarget) => {
      if (settled) return
      let renderedAtMs = 0
      try {
        target.markRendered(input.revision)
        renderedAtMs = now()
      } catch (error) {
        fail(error)
        return
      }
      settled = true
      cleanup()
      resolve(Object.freeze({ visible: input.visible, renderedAtMs, attached: true as const }))
    }
    const onAbort = () => fail(new DOMException('Mounted authoring edit was cancelled', 'AbortError'))
    const schedule = () => {
      try {
        frameHandle = requestFrame(poll)
      } catch (error) {
        fail(error)
      }
    }
    const poll = () => {
      frameHandle = null
      if (input.signal.aborted) return onAbort()
      try {
        const target = input.readTarget()
        if (target?.attached && target.visible === input.visible) return succeed(target)
      } catch (error) {
        fail(error)
        return
      }
      schedule()
    }
    input.signal.addEventListener('abort', onAbort, { once: true })
    if (input.signal.aborted) return onAbort()
    deadlineHandle = setTimeout(() => {
      fail(new Error('Mounted authoring visibility edit did not reach the rendered scene'))
    }, deadlineMs)
    schedule()
  })
}
