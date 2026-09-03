import {
  buildPaymentSurfaceSnapshot,
  validatePaymentIntentCommand,
  type PaymentIntentCommand,
  type PaymentSurfaceSnapshot,
} from 'grph-shared/payments/paymentRuntimeContract'
import type { PaymentSettlementAsset } from 'grph-shared/payments/paymentRailSsot'
import {
  getAgenticGraphStorageDb,
  type AgenticGraphStorageDb,
} from '@/lib/storage/agentic-graph-storage-db'
import {
  createPaymentApiTransport,
  type PaymentBuyerProduct,
  type PaymentApiTransport,
} from './paymentApiClient'
import {
  buildQueuedPaymentSurfaceSnapshot,
  enqueuePaymentIntent,
  listPaymentIntentQueue,
} from './paymentIntentQueue'
import {
  reconcilePaymentIntentQueue,
  retryPaymentIntentWithSameKey,
} from './paymentReconciler'
import {
  readLocalPaymentReceiptProjection,
  type LocalPaymentReceiptProjection,
} from './paymentReceiptProjection'
import {
  cancelTrustedCanvasPurchase,
  getTrustedPurchaseInvocationView,
  subscribeTrustedPurchaseInvocation,
  type TrustedPurchaseInvocationView,
} from './trustedPurchaseInvocation'

export type PaymentSurfaceControllerView = Readonly<{
  snapshot: PaymentSurfaceSnapshot
  requestInFlight: boolean
  buyerProduct: PaymentBuyerProduct | null
  buyerProductStatus: 'idle' | 'loading' | 'ready' | 'unavailable'
  buyerProductError: string | null
  receipt: LocalPaymentReceiptProjection | null
  receiptError: string | null
  purchaseInvocation: TrustedPurchaseInvocationView
}>

export type PaymentSurfaceController = Readonly<{
  getView(): PaymentSurfaceControllerView
  subscribe(listener: () => void): () => void
  start(): () => void
  hydrate(): Promise<PaymentSurfaceSnapshot>
  loadBuyerProduct(): Promise<PaymentBuyerProduct | null>
  confirm(command: PaymentIntentCommand): Promise<PaymentSurfaceSnapshot>
  reconcile(): Promise<PaymentSurfaceSnapshot>
  retry(): Promise<PaymentSurfaceSnapshot>
  openReceipt(): Promise<LocalPaymentReceiptProjection | null>
  closeReceipt(): void
  cancelPurchase(): void
  runTransientRequest<T>(operation: () => Promise<T>): Promise<T>
}>

type PaymentSurfaceControllerOptions = Readonly<{
  db?: AgenticGraphStorageDb | null
  transport?: PaymentApiTransport
  isOnline?: () => boolean
  nowMs?: () => number
  windowTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null
  scheduleTimeout?: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>
  clearScheduledTimeout?: (handle: ReturnType<typeof setTimeout>) => void
}>

const createIdleView = (): PaymentSurfaceControllerView => Object.freeze({
  snapshot: buildPaymentSurfaceSnapshot(null),
  requestInFlight: false,
  buyerProduct: null,
  buyerProductStatus: 'idle',
  buyerProductError: null,
  receipt: null,
  receiptError: null,
  purchaseInvocation: getTrustedPurchaseInvocationView(),
})

const defaultIsOnline = (): boolean =>
  typeof navigator === 'undefined' || navigator.onLine !== false

const RETRY_SCHEDULER_MAX_DELAY_MS = 2_147_483_647
const RETRYABLE_PAYMENT_STATES = new Set<PaymentSurfaceSnapshot['state']>([
  'queued_offline',
  'pending_provider',
])

const latestQueueSnapshot = async (
  db?: AgenticGraphStorageDb | null,
): Promise<PaymentSurfaceSnapshot> => {
  const records = await listPaymentIntentQueue(db)
  const latest = [...records].sort((left, right) =>
    right.updatedAtMs - left.updatedAtMs
    || right.creationOrdinal - left.creationOrdinal)[0]
  return latest
    ? buildQueuedPaymentSurfaceSnapshot(latest)
    : buildPaymentSurfaceSnapshot(null)
}

export const createPaymentSurfaceController = (
  options: PaymentSurfaceControllerOptions = {},
): PaymentSurfaceController => {
  const transport = options.transport || createPaymentApiTransport()
  const isOnline = options.isOnline || defaultIsOnline
  const readNowMs = options.nowMs || Date.now
  const scheduleTimeout = options.scheduleTimeout
    || ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs))
  const clearScheduledTimeout = options.clearScheduledTimeout
    || ((handle: ReturnType<typeof setTimeout>) => clearTimeout(handle))
  const windowTarget = options.windowTarget === undefined
    ? typeof window !== 'undefined' ? window : null
    : options.windowTarget
  const listeners = new Set<() => void>()
  let view = createIdleView()
  let stopStorageSubscription: (() => void) | null = null
  let stopPurchaseInvocationSubscription: (() => void) | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retryScheduleVersion = 0
  let productRequest: Promise<PaymentBuyerProduct | null> | null = null
  let startReferences = 0
  let startSessionVersion = 0
  const purchaseLifecycleOwnsSurface = (): boolean =>
    getTrustedPurchaseInvocationView().lifecycle !== null

  const publish = (next: PaymentSurfaceControllerView): void => {
    view = Object.freeze(next)
    listeners.forEach(listener => listener())
  }

  const publishSnapshot = (snapshot: PaymentSurfaceSnapshot): void => {
    publish({ ...view, snapshot })
  }

  const hydrate = async (): Promise<PaymentSurfaceSnapshot> => {
    const snapshot = await latestQueueSnapshot(options.db)
    publishSnapshot(snapshot)
    return snapshot
  }

  const loadBuyerProduct = (): Promise<PaymentBuyerProduct | null> => {
    if (purchaseLifecycleOwnsSurface()) {
      return Promise.resolve(view.buyerProduct)
    }
    if (productRequest) return productRequest
    if (!isOnline()) {
      if (view.buyerProduct === null) {
        publish({
          ...view,
          buyerProductStatus: 'unavailable',
          buyerProductError: 'Connect once to load the server-authoritative product.',
        })
      }
      return Promise.resolve(view.buyerProduct)
    }
    publish({
      ...view,
      buyerProductStatus: 'loading',
      buyerProductError: null,
    })
    productRequest = transport.readBuyerProduct()
      .then(product => {
        publish({
          ...view,
          buyerProduct: product,
          buyerProductStatus: product ? 'ready' : 'unavailable',
          buyerProductError: product
            ? null
            : 'No server-authoritative buyer product is configured.',
        })
        return product
      })
      .catch(error => {
        publish({
          ...view,
          buyerProduct: null,
          buyerProductStatus: 'unavailable',
          buyerProductError: error instanceof Error
            ? error.message
            : 'The server-authoritative buyer product is unavailable.',
        })
        return null
      })
      .finally(() => {
        productRequest = null
      })
    return productRequest
  }

  const runTransientRequest = async <T>(
    operation: () => Promise<T>,
  ): Promise<T> => {
    if (purchaseLifecycleOwnsSurface()) {
      throw new Error(
        'The agentic purchase lifecycle owns the Paywall until it is replaced.',
      )
    }
    if (view.requestInFlight) {
      throw new Error('A payment request is already in progress.')
    }
    publish({ ...view, requestInFlight: true })
    try {
      return await operation()
    } finally {
      publish({ ...view, requestInFlight: false })
    }
  }

  const cancelRetryTimer = (): void => {
    if (retryTimer === null) return
    clearScheduledTimeout(retryTimer)
    retryTimer = null
  }

  let reconcile: () => Promise<PaymentSurfaceSnapshot>

  const refreshRetrySchedule = async (): Promise<void> => {
    const scheduleVersion = ++retryScheduleVersion
    cancelRetryTimer()
    if (
      startReferences === 0
      || !isOnline()
      || view.requestInFlight
      || getTrustedPurchaseInvocationView().lifecycle
    ) return
    let records
    try {
      records = await listPaymentIntentQueue(options.db)
    } catch {
      return
    }
    if (
      scheduleVersion !== retryScheduleVersion
      || startReferences === 0
      || !isOnline()
      || view.requestInFlight
      || getTrustedPurchaseInvocationView().lifecycle
    ) return
    const nextAttemptAtMs = records
      .filter(record =>
        RETRYABLE_PAYMENT_STATES.has(record.state)
        && Number.isSafeInteger(record.nextAttemptAtMs)
        && record.nextAttemptAtMs < Number.MAX_SAFE_INTEGER)
      .reduce(
        (earliest, record) => Math.min(earliest, record.nextAttemptAtMs),
        Number.POSITIVE_INFINITY,
      )
    if (!Number.isFinite(nextAttemptAtMs)) return
    const delayMs = Math.min(
      RETRY_SCHEDULER_MAX_DELAY_MS,
      Math.max(0, nextAttemptAtMs - readNowMs()),
    )
    retryTimer = scheduleTimeout(() => {
      retryTimer = null
      if (
        scheduleVersion !== retryScheduleVersion
        || startReferences === 0
        || !isOnline()
        || view.requestInFlight
        || getTrustedPurchaseInvocationView().lifecycle
      ) return
      void reconcile().catch(() => undefined)
    }, delayMs)
  }

  const runPaymentRequest = async <T>(
    operation: () => Promise<T>,
  ): Promise<T> => {
    try {
      return await runTransientRequest(operation)
    } finally {
      void refreshRetrySchedule()
    }
  }

  reconcile = async (): Promise<PaymentSurfaceSnapshot> => {
    if (purchaseLifecycleOwnsSurface()) return view.snapshot
    return runPaymentRequest(async () => {
      const result = await reconcilePaymentIntentQueue({
        transport,
        db: options.db,
        online: isOnline,
        nowMs: readNowMs(),
      })
      const latest = result.snapshots.at(-1) || await latestQueueSnapshot(options.db)
      publishSnapshot(latest)
      publish({ ...view, receiptError: result.receiptErrors[0] || null })
      return latest
    })
  }

  const handleOnline = (): void => {
    if (getTrustedPurchaseInvocationView().lifecycle) return
    void loadBuyerProduct()
    if (!view.requestInFlight) void reconcile().catch(() => undefined)
  }

  const controller: PaymentSurfaceController = Object.freeze({
    getView() {
      return view
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start() {
      startReferences += 1
      if (startReferences === 1) {
        const sessionVersion = ++startSessionVersion
        const purchaseInvocation = getTrustedPurchaseInvocationView()
        publish({ ...view, purchaseInvocation })
        stopPurchaseInvocationSubscription =
          subscribeTrustedPurchaseInvocation(() => {
            const nextPurchaseInvocation =
              getTrustedPurchaseInvocationView()
            if (nextPurchaseInvocation.lifecycle) {
              retryScheduleVersion += 1
              cancelRetryTimer()
            }
            publish({
              ...view,
              purchaseInvocation: nextPurchaseInvocation,
            })
          })
        void hydrate().finally(() => {
          if (!getTrustedPurchaseInvocationView().lifecycle) {
            void refreshRetrySchedule()
          }
        })
        if (!purchaseInvocation.lifecycle) void loadBuyerProduct()
        void (async () => {
          const storage = options.db || await getAgenticGraphStorageDb()
          if (
            sessionVersion !== startSessionVersion
            || Number(startReferences) === 0
          ) return
          const subscription = storage.collections.paymentIntentQueue.$.subscribe(() => {
            void hydrate().finally(() => refreshRetrySchedule())
          })
          if (
            sessionVersion !== startSessionVersion
            || Number(startReferences) === 0
          ) {
            subscription.unsubscribe()
            return
          }
          stopStorageSubscription?.()
          stopStorageSubscription = () => subscription.unsubscribe()
        })()
        windowTarget?.addEventListener('online', handleOnline)
      }
      let stopped = false
      return () => {
        if (stopped) return
        stopped = true
        startReferences = Math.max(0, startReferences - 1)
        if (startReferences > 0) return
        startSessionVersion += 1
        stopStorageSubscription?.()
        stopStorageSubscription = null
        stopPurchaseInvocationSubscription?.()
        stopPurchaseInvocationSubscription = null
        retryScheduleVersion += 1
        cancelRetryTimer()
        windowTarget?.removeEventListener('online', handleOnline)
      }
    },
    hydrate,
    loadBuyerProduct,
    async confirm(command) {
      if (purchaseLifecycleOwnsSurface()) return view.snapshot
      return runPaymentRequest(async () => {
        const queued = await enqueuePaymentIntent(command, {
          db: options.db,
          nowMs: readNowMs(),
        })
        if (queued.ok === false) {
          const failedSnapshot = Object.freeze({
            ...view.snapshot,
            buyerSafeReason: queued.message,
          })
          publishSnapshot(failedSnapshot)
          return failedSnapshot
        }
        const queuedSnapshot = buildQueuedPaymentSurfaceSnapshot(queued.record)
        publishSnapshot(queuedSnapshot)
        if (!isOnline()) return queuedSnapshot

        const result = await reconcilePaymentIntentQueue({
          transport,
          db: options.db,
          online: isOnline,
          nowMs: readNowMs(),
          force: true,
        })
        const matching = [...result.snapshots]
          .reverse()
          .find(snapshot => snapshot.clientIntentKey === command.clientIntentKey)
        const next = matching || queuedSnapshot
        publishSnapshot(next)
        publish({ ...view, receiptError: result.receiptErrors[0] || null })
        return next
      })
    },
    reconcile,
    async retry() {
      if (purchaseLifecycleOwnsSurface()) return view.snapshot
      const clientIntentKey = view.snapshot.clientIntentKey
      if (!clientIntentKey) return view.snapshot
      return runPaymentRequest(async () => {
        const result = await retryPaymentIntentWithSameKey(clientIntentKey, {
          transport,
          db: options.db,
          online: isOnline,
          nowMs: readNowMs(),
        })
        const matching = [...result.snapshots]
          .reverse()
          .find(snapshot => snapshot.clientIntentKey === clientIntentKey)
        const next = matching || await latestQueueSnapshot(options.db)
        publishSnapshot(next)
        publish({ ...view, receiptError: result.receiptErrors[0] || null })
        return next
      })
    },
    async openReceipt() {
      const result = await readLocalPaymentReceiptProjection(options.db)
      if (result.ok === false) {
        publish({ ...view, receipt: null, receiptError: result.error.message })
        return null
      }
      publish({ ...view, receipt: result.projection, receiptError: null })
      return result.projection
    },
    closeReceipt() {
      publish({ ...view, receipt: null, receiptError: null })
    },
    cancelPurchase() {
      cancelTrustedCanvasPurchase()
    },
    runTransientRequest,
  })

  return controller
}

export const createBuyerPaymentIntentCommand = (args: {
  amountMinor: number
  currency: string
  settlementAsset: PaymentSettlementAsset
  clientIntentKey?: string
}): PaymentIntentCommand => {
  const clientIntentKey = args.clientIntentKey || crypto.randomUUID()
  const validation = validatePaymentIntentCommand({
    ...args,
    clientIntentKey,
    origin: 'buyer',
  })
  if (validation.ok === false) throw new Error(validation.message)
  return validation.value
}

let defaultPaymentSurfaceController: PaymentSurfaceController | null = null

export const getPaymentSurfaceController = (): PaymentSurfaceController => {
  if (!defaultPaymentSurfaceController) {
    defaultPaymentSurfaceController = createPaymentSurfaceController()
  }
  return defaultPaymentSurfaceController
}

export const __resetPaymentSurfaceControllerForTests = (): void => {
  defaultPaymentSurfaceController = null
}
