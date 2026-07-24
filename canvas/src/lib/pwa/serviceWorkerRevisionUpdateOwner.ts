export const SERVICE_WORKER_UPDATE_MIN_INTERVAL_MS = 5 * 60 * 1000
export const SERVICE_WORKER_CONVERGENCE_RETRY_DELAYS_MS = [1_000, 5_000, 15_000, 30_000] as const

type EventListenerTarget = {
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
}

type VisibilityEventTarget = EventListenerTarget & {
  visibilityState: DocumentVisibilityState
}

type ServiceWorkerRegistrationUpdateTarget = {
  update(): Promise<unknown>
}

type ServiceWorkerRevisionUpdateOwnerOptions = {
  registration: ServiceWorkerRegistrationUpdateTarget
  documentTarget: VisibilityEventTarget
  windowTarget: EventListenerTarget
  now?: () => number
  minIntervalMs?: number
  convergenceRetryDelaysMs?: readonly number[]
  isExpectedRevisionActive?: () => Promise<boolean>
  onUpdateSettled?: () => void
  onError?: (error: unknown) => void
}

export function installServiceWorkerRevisionUpdateOwner(
  options: ServiceWorkerRevisionUpdateOwnerOptions,
): () => void {
  const now = options.now ?? Date.now
  const minIntervalMs = options.minIntervalMs ?? SERVICE_WORKER_UPDATE_MIN_INTERVAL_MS
  const convergenceRetryDelaysMs = options.convergenceRetryDelaysMs
    ?? SERVICE_WORKER_CONVERGENCE_RETRY_DELAYS_MS
  let disposed = false
  let lastSuccessfulUpdateAt = Number.NEGATIVE_INFINITY
  let updateInFlight: Promise<void> | null = null
  let convergenceRetryIndex = 0
  let convergenceRetryTimer: ReturnType<typeof setTimeout> | null = null

  const scheduleConvergenceRetry = async () => {
    if (
      disposed
      || !options.isExpectedRevisionActive
      || convergenceRetryTimer !== null
    ) return
    try {
      if (await options.isExpectedRevisionActive()) return
    } catch (error) {
      options.onError?.(error)
    }
    if (disposed) return
    const retryDelayMs = convergenceRetryDelaysMs[convergenceRetryIndex]
    if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) return
    convergenceRetryIndex += 1
    convergenceRetryTimer = setTimeout(() => {
      convergenceRetryTimer = null
      void requestUpdate(true)
    }, retryDelayMs)
  }

  const requestUpdate = (force = false): Promise<void> => {
    if (disposed) return Promise.resolve()
    if (updateInFlight) return updateInFlight

    const attemptedAt = now()
    if (!force && attemptedAt - lastSuccessfulUpdateAt < minIntervalMs) return Promise.resolve()
    updateInFlight = Promise.resolve()
      .then(() => options.registration.update())
      .then(() => {
        lastSuccessfulUpdateAt = attemptedAt
      })
      .catch(error => options.onError?.(error))
      .finally(() => {
        updateInFlight = null
        try {
          options.onUpdateSettled?.()
        } catch (error) {
          options.onError?.(error)
        }
        void scheduleConvergenceRetry()
      })
    return updateInFlight
  }

  const handleForeground = () => {
    if (options.documentTarget.visibilityState === 'visible') void requestUpdate()
  }
  const handleOnline = () => {
    void requestUpdate()
  }

  options.documentTarget.addEventListener('visibilitychange', handleForeground)
  options.windowTarget.addEventListener('online', handleOnline)
  void requestUpdate(true)

  return () => {
    disposed = true
    if (convergenceRetryTimer !== null) clearTimeout(convergenceRetryTimer)
    convergenceRetryTimer = null
    options.documentTarget.removeEventListener('visibilitychange', handleForeground)
    options.windowTarget.removeEventListener('online', handleOnline)
  }
}
