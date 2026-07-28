export const SERVICE_WORKER_UPDATE_MIN_INTERVAL_MS = 5 * 60 * 1000
export const SERVICE_WORKER_CONVERGENCE_RETRY_DELAYS_MS = [1_000, 5_000, 15_000, 30_000] as const
const SOURCE_REVISION_PATTERN = /^[0-9a-f]{40}$/
const REVISION_REQUEST = 'KG_SERVICE_WORKER_SOURCE_REVISION_REQUEST'
const REVISION_RESPONSE = 'KG_SERVICE_WORKER_SOURCE_REVISION_RESPONSE'
const REVISION_RESPONSE_TIMEOUT_MS = 2_000

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

type ServiceWorkerRevisionMessageTarget = {
  postMessage(message: unknown, transfer: Transferable[]): void
}

type MessagePortTarget = {
  onmessage: ((event: MessageEvent) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
  start(): void
  close(): void
}

type MessageChannelTarget = {
  port1: MessagePortTarget
  port2: MessagePortTarget & Transferable
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

export const readActiveServiceWorkerSourceRevision = (
  worker: ServiceWorkerRevisionMessageTarget,
  options: {
    createMessageChannel?: () => MessageChannelTarget
    timeoutMs?: number
  } = {},
): Promise<string> => new Promise((resolve, reject) => {
  const channel = (options.createMessageChannel ?? (() => new MessageChannel()))()
  const timeoutMs = options.timeoutMs ?? REVISION_RESPONSE_TIMEOUT_MS
  let settled = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const finish = (error: unknown, sourceRevision = '') => {
    if (settled) return
    settled = true
    if (timeoutId !== null) clearTimeout(timeoutId)
    channel.port1.onmessage = null
    channel.port1.onmessageerror = null
    try {
      channel.port1.close()
    } catch {
      void 0
    }
    try {
      channel.port2.close()
    } catch {
      void 0
    }
    if (error) reject(error)
    else resolve(sourceRevision)
  }

  channel.port1.onmessage = event => {
    const response = event.data
    const sourceRevision = String(response?.sourceRevision || '')
    if (
      response?.type !== REVISION_RESPONSE
      || !SOURCE_REVISION_PATTERN.test(sourceRevision)
    ) {
      finish(new Error('active service worker returned an invalid source revision'))
      return
    }
    finish(null, sourceRevision)
  }
  channel.port1.onmessageerror = () => {
    finish(new Error('active service worker source revision response could not be decoded'))
  }
  channel.port1.start()
  timeoutId = setTimeout(() => {
    finish(new Error('active service worker source revision response timed out'))
  }, timeoutMs)
  try {
    worker.postMessage({ type: REVISION_REQUEST }, [channel.port2])
  } catch (error) {
    finish(error)
  }
})

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
