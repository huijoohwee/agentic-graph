// Initial native-map preparation belongs to the end-to-end first-playable
// surface budget. The separate Start-to-ready-frame budget begins only after
// this preparation has committed.
export const FLIGHT_SIM_STAGE_PREPARATION_LIMIT_MS = 3_000
export const FLIGHT_SIM_STAGE_FRAME_OPPORTUNITY_LIMIT_MS = 1_000

type StagePreparationWaitOptions = Readonly<{
  limitMs?: number
  signal?: AbortSignal
}>

type StagePreparationRequest = Readonly<{
  framePresented: boolean
  requestId: number
  status: 'pending' | 'prepared'
}>

type StagePreparationWaiter = Readonly<{
  reject: (error: Error) => void
  resolve: () => void
}>

let requestSequence = 0
let currentRequest: StagePreparationRequest | null = null
const waiters = new Map<number, Set<StagePreparationWaiter>>()

function stagePreparationError(message: string): Error {
  return new Error(`Flight Sim mission stage ${message}`)
}

function stagePreparationClockMs(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function settleRequestWaiters(
  requestId: number,
  settle: (waiter: StagePreparationWaiter) => void,
): void {
  const requestWaiters = waiters.get(requestId)
  if (!requestWaiters) return
  for (const waiter of [...requestWaiters]) settle(waiter)
}

export function beginFlightSimStagePreparation(): number {
  if (currentRequest) {
    cancelFlightSimStagePreparation(
      currentRequest.requestId,
      stagePreparationError('preparation was superseded.'),
    )
  }
  requestSequence += 1
  currentRequest = Object.freeze({
    framePresented: false,
    requestId: requestSequence,
    status: 'pending',
  })
  return requestSequence
}

export function readCurrentFlightSimStagePreparationRequest(): number | null {
  return currentRequest?.status === 'pending'
    ? currentRequest.requestId
    : null
}

export function completeFlightSimStagePreparation(
  requestId: number,
  options: Readonly<{ framePresented?: boolean }> = {},
): boolean {
  if (
    currentRequest?.requestId !== requestId
    || currentRequest.status !== 'pending'
  ) {
    return false
  }
  currentRequest = Object.freeze({
    framePresented: options.framePresented === true,
    requestId,
    status: 'prepared',
  })
  settleRequestWaiters(requestId, waiter => waiter.resolve())
  return true
}

export function cancelFlightSimStagePreparation(
  requestId: number,
  reason: Error = stagePreparationError('preparation was cancelled.'),
): void {
  if (currentRequest?.requestId !== requestId) return
  currentRequest = null
  settleRequestWaiters(requestId, waiter => waiter.reject(reason))
}

export function cancelCurrentFlightSimStagePreparation(
  reason: Error = stagePreparationError('preparation was cancelled.'),
): void {
  if (!currentRequest) return
  cancelFlightSimStagePreparation(currentRequest.requestId, reason)
}

export function waitForFlightSimStagePreparation(
  requestId: number,
  options: StagePreparationWaitOptions = {},
): Promise<void> {
  if (
    currentRequest?.requestId === requestId
    && currentRequest.status === 'prepared'
  ) {
    return Promise.resolve()
  }
  if (currentRequest?.requestId !== requestId) {
    return Promise.reject(
      stagePreparationError(`preparation request ${requestId} is stale.`),
    )
  }
  const limitMs = options.limitMs ?? FLIGHT_SIM_STAGE_PREPARATION_LIMIT_MS
  return new Promise<void>((resolve, reject) => {
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    const requestWaiters = waiters.get(requestId) ?? new Set()
    waiters.set(requestId, requestWaiters)
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      requestWaiters.delete(waiter)
      if (requestWaiters.size === 0) waiters.delete(requestId)
      if (timeout !== null) clearTimeout(timeout)
      options.signal?.removeEventListener('abort', handleAbort)
      callback()
    }
    const waiter: StagePreparationWaiter = Object.freeze({
      resolve: () => finish(resolve),
      reject: error => finish(() => reject(error)),
    })
    const handleAbort = () => {
      const reason = options.signal?.reason
      waiter.reject(
        reason instanceof Error
          ? reason
          : stagePreparationError('preparation was aborted.'),
      )
    }
    if (options.signal?.aborted) {
      handleAbort()
      return
    }
    requestWaiters.add(waiter)
    options.signal?.addEventListener('abort', handleAbort, { once: true })
    timeout = setTimeout(
      () => waiter.reject(
        stagePreparationError(
          `preparation request ${requestId} did not complete within ${limitMs} ms.`,
        ),
      ),
      limitMs,
    )
  })
}

export function waitForFlightSimStageFrameOpportunity(
  options: StagePreparationWaitOptions = {},
): Promise<void> {
  if (
    typeof window === 'undefined'
    || typeof window.requestAnimationFrame !== 'function'
  ) {
    return Promise.resolve()
  }
  const frameRuntime = window
  const limitMs =
    options.limitMs ?? FLIGHT_SIM_STAGE_FRAME_OPPORTUNITY_LIMIT_MS
  return new Promise<void>((resolve, reject) => {
    let frameId: number | null = null
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | null = null
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      if (
        frameId !== null
        && typeof frameRuntime.cancelAnimationFrame === 'function'
      ) {
        frameRuntime.cancelAnimationFrame(frameId)
      }
      frameId = null
      if (timeout !== null) clearTimeout(timeout)
      options.signal?.removeEventListener('abort', handleAbort)
      callback()
    }
    const handleAbort = () => {
      const reason = options.signal?.reason
      finish(() => reject(
        reason instanceof Error
          ? reason
          : stagePreparationError('frame opportunity was aborted.'),
      ))
    }
    if (options.signal?.aborted) {
      handleAbort()
      return
    }
    options.signal?.addEventListener('abort', handleAbort, { once: true })
    timeout = setTimeout(
      () => finish(() => reject(stagePreparationError(
        `frame opportunity did not complete within ${limitMs} ms.`,
      ))),
      limitMs,
    )
    try {
      let frameRanSynchronously = false
      const scheduledFrameId = frameRuntime.requestAnimationFrame(() => {
        frameRanSynchronously = true
        frameId = null
        finish(resolve)
      })
      if (!frameRanSynchronously && !settled) frameId = scheduledFrameId
    } catch {
      finish(() => reject(
        stagePreparationError('frame opportunity could not be scheduled.'),
      ))
    }
  })
}

export async function waitForFlightSimStagePresentation(
  requestId: number,
  options: StagePreparationWaitOptions = {},
): Promise<void> {
  const limitMs = options.limitMs ?? FLIGHT_SIM_STAGE_PREPARATION_LIMIT_MS
  const startedAt = stagePreparationClockMs()
  await waitForFlightSimStagePreparation(requestId, {
    ...options,
    limitMs,
  })
  if (
    currentRequest?.requestId !== requestId
    || currentRequest.status !== 'prepared'
  ) {
    throw stagePreparationError(`preparation request ${requestId} is stale.`)
  }
  if (currentRequest.framePresented) return
  const remainingMs =
    limitMs - Math.max(0, stagePreparationClockMs() - startedAt)
  if (remainingMs <= 0) {
    throw stagePreparationError(
      `presentation request ${requestId} did not complete within ${limitMs} ms.`,
    )
  }
  // The acknowledgement can resolve while React is still committing the
  // authored-controller pause. Wait for the next frame opportunity before
  // Start arms its independent ready-frame deadline.
  await waitForFlightSimStageFrameOpportunity({
    signal: options.signal,
    limitMs: Math.min(
      FLIGHT_SIM_STAGE_FRAME_OPPORTUNITY_LIMIT_MS,
      remainingMs,
    ),
  })
  if (
    currentRequest?.requestId !== requestId
    || currentRequest.status !== 'prepared'
  ) {
    throw stagePreparationError(`preparation request ${requestId} is stale.`)
  }
}

export function resetFlightSimStagePreparationForTests(): void {
  cancelCurrentFlightSimStagePreparation(
    stagePreparationError('preparation runtime was reset.'),
  )
}
