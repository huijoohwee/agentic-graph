// Initial native-map preparation belongs to the end-to-end first-playable
// surface budget. The separate Start-to-ready-frame budget begins only after
// this preparation has committed.
export const FLIGHT_SIM_STAGE_PREPARATION_LIMIT_MS = 3_000

type StagePreparationRequest = Readonly<{
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

export function completeFlightSimStagePreparation(requestId: number): boolean {
  if (
    currentRequest?.requestId !== requestId
    || currentRequest.status !== 'pending'
  ) {
    return false
  }
  currentRequest = Object.freeze({
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
  options: Readonly<{
    limitMs?: number
    signal?: AbortSignal
  }> = {},
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

export function resetFlightSimStagePreparationForTests(): void {
  cancelCurrentFlightSimStagePreparation(
    stagePreparationError('preparation runtime was reset.'),
  )
}
