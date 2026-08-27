import Dexie from 'dexie'
import { IDBKeyRange, indexedDB } from 'fake-indexeddb'
import type {
  PaymentIntentCommand,
  PaymentRailNeutralResult,
} from 'grph-shared/payments/paymentRuntimeContract'
import type {
  AgenticGraphTerminalPaymentRecord,
} from 'grph-shared/payments/paymentRecordDocument'
import {
  createIndexedDbCollectionDb,
} from '@/lib/storage/indexedDbCollectionStore'
import {
  createPersistedCollectionDb,
} from '@/lib/storage/persistedCollectionStore'
import {
  AGENTICGRAPH_STORAGE_COLLECTION_NAMES,
  type AgenticGraphStorageDb,
  type AgenticGraphStorageRecordMap,
} from '@/lib/storage/agenticgraphStorageDb'
import {
  __resetPaymentIntentQueueForTests,
  enqueuePaymentIntent,
  findPaymentIntentQueueRecord,
  listPaymentIntentQueue,
} from '@/features/payments/paymentIntentQueue'
import {
  PAYMENT_RECONCILIATION_BACKOFF_MS,
  __resetPaymentReconcilerForTests,
  reconcilePaymentIntentQueue,
} from '@/features/payments/paymentReconciler'
import {
  LOCAL_PAYMENT_RECEIPT_DOCUMENT_ID,
  __resetPaymentReceiptProjectionForTests,
  appendLocalPaymentReceipt,
  readLocalPaymentReceiptDocument,
  readLocalPaymentReceiptProjection,
} from '@/features/payments/paymentReceiptProjection'
import {
  PAYMENT_DISCOVERY_API_PATH,
  PAYMENT_INTENT_API_PATH,
  createPaymentApiTransport,
  type PaymentApiTransport,
} from '@/features/payments/paymentApiClient'

const clientIntentKey = (value: number): string =>
  `a1b2c3d4-e5f6-4a7b-8c9d-a1b2c3d4e5${value.toString(16).padStart(2, '0')}`

const command = (
  value: number,
  amountMinor = 1_000,
): PaymentIntentCommand => Object.freeze({
  clientIntentKey: clientIntentKey(value),
  amountMinor,
  currency: 'sgd',
  settlementAsset: 'fiat',
  origin: 'buyer',
})

const createMemoryDb = (): AgenticGraphStorageDb =>
  createPersistedCollectionDb<AgenticGraphStorageRecordMap>({
    storageKey: `kg:payment-test:${Date.now()}:${Math.random()}`,
    persistent: false,
    collectionNames: [...AGENTICGRAPH_STORAGE_COLLECTION_NAMES],
  })

const terminalReceipt = (
  intent: PaymentIntentCommand,
): AgenticGraphTerminalPaymentRecord => Object.freeze({
  intentId: `pay_${intent.clientIntentKey}`,
  clientIntentKey: intent.clientIntentKey,
  rail: 'stripe',
  amountMinor: intent.amountMinor,
  currency: intent.currency,
  settlementAsset: intent.settlementAsset,
  terminalState: 'paid',
  providerObjectId: `cs_test_${intent.clientIntentKey.slice(0, 8)}`,
  terminalTimestamp: '2026-07-29T00:00:00.000Z',
})

const pendingResult = (
  intent: PaymentIntentCommand,
): PaymentRailNeutralResult => Object.freeze({
  ok: true,
  intent: Object.freeze({
    intentId: `pay_${intent.clientIntentKey}`,
    state: 'pending_provider',
    amountMinor: intent.amountMinor,
    currency: intent.currency,
  }),
  rail: 'stripe',
  instruction: Object.freeze({
    kind: 'hosted_checkout',
    url: 'https://checkout.stripe.com/c/pay/test',
  }),
  receiptRecord: null,
  idempotentReplay: false,
  modelCallCount: 0,
  modelCostUsd: 0,
})

const paidResult = (
  intent: PaymentIntentCommand,
): PaymentRailNeutralResult => Object.freeze({
  ok: true,
  intent: Object.freeze({
    intentId: `pay_${intent.clientIntentKey}`,
    state: 'paid',
    amountMinor: intent.amountMinor,
    currency: intent.currency,
  }),
  rail: 'stripe',
  instruction: null,
  receiptRecord: terminalReceipt(intent),
  idempotentReplay: true,
  modelCallCount: 0,
  modelCostUsd: 0,
})

const resetPaymentModules = (): void => {
  __resetPaymentIntentQueueForTests()
  __resetPaymentReconcilerForTests()
  __resetPaymentReceiptProjectionForTests()
}

export async function testPaymentIntentQueueIsBoundedAndOwnsClientKeys() {
  resetPaymentModules()
  const db = createMemoryDb()
  try {
    const first = await enqueuePaymentIntent(command(1), {
      db,
      nowMs: 10,
      maxDepth: 2,
    })
    const replay = await enqueuePaymentIntent(command(1), {
      db,
      nowMs: 11,
      maxDepth: 2,
    })
    const conflict = await enqueuePaymentIntent(command(1, 2_000), {
      db,
      nowMs: 12,
      maxDepth: 2,
    })
    const second = await enqueuePaymentIntent(command(2), {
      db,
      nowMs: 20,
      maxDepth: 2,
    })
    const overCapacity = await enqueuePaymentIntent(command(3), {
      db,
      nowMs: 30,
      maxDepth: 2,
    })
    const planted = await enqueuePaymentIntent({
      ...command(4),
      cardNumber: '4242424242424242',
    } as PaymentIntentCommand, { db, maxDepth: 2 })

    if (!first.ok || !first.created) throw new Error('expected first intent to be queued')
    if (!replay.ok || replay.created || replay.record.id !== first.record.id) {
      throw new Error('expected an identical Client Intent Key to return its existing record')
    }
    if (conflict.ok !== false || conflict.code !== 'intent_parameter_conflict') {
      throw new Error(`expected parameter conflict, got ${JSON.stringify(conflict)}`)
    }
    if (!second.ok || !second.created) throw new Error('expected second intent to be queued')
    if (overCapacity.ok !== false || overCapacity.code !== 'queue_capacity_reached') {
      throw new Error(`expected bounded queue rejection, got ${JSON.stringify(overCapacity)}`)
    }
    if (planted.ok !== false || planted.code !== 'schema_invalid') {
      throw new Error(`expected planted card data rejection, got ${JSON.stringify(planted)}`)
    }
    const records = await listPaymentIntentQueue(db)
    if (
      records.length !== 2
      || records[0]?.clientIntentKey !== command(1).clientIntentKey
      || records[1]?.clientIntentKey !== command(2).clientIntentKey
    ) {
      throw new Error(`expected bounded creation order, got ${JSON.stringify(records)}`)
    }
  } finally {
    await db.db.remove()
  }
}

export async function testPaymentApiClientUsesRailNeutralIntentRoutes() {
  const intent = command(7)
  const calls: Array<{ path: string; init?: RequestInit }> = []
  const transport = createPaymentApiTransport(async (input, init) => {
    calls.push({ path: String(input), init })
    const body = calls.length === 1
      ? {
          buyerProduct: {
            amountMinor: intent.amountMinor,
            currency: intent.currency,
            settlementAsset: intent.settlementAsset,
          },
        }
      : calls.length === 2
        ? pendingResult(intent)
        : paidResult(intent)
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  const buyerProduct = await transport.readBuyerProduct()
  const submitted = await transport.submitIntent(intent)
  const reconciled = await transport.reconcileIntent(`pay_${intent.clientIntentKey}`)
  if (
    buyerProduct?.amountMinor !== intent.amountMinor
    || buyerProduct.currency !== intent.currency
    || submitted.ok === false
    || reconciled.ok === false
    || reconciled.intent.state !== 'paid'
  ) {
    throw new Error(`expected typed rail-neutral results, got ${JSON.stringify({
      submitted,
      reconciled,
    })}`)
  }
  if (
    calls[0]?.path !== PAYMENT_DISCOVERY_API_PATH
    || calls[0].init?.method !== 'GET'
  ) {
    throw new Error(`unexpected payment discovery request ${JSON.stringify(calls[0])}`)
  }
  if (
    calls[1]?.path !== PAYMENT_INTENT_API_PATH
    || calls[1].init?.method !== 'POST'
    || JSON.stringify(JSON.parse(String(calls[1].init?.body))) !== JSON.stringify(intent)
  ) {
    throw new Error(`unexpected intent create request ${JSON.stringify(calls[1])}`)
  }
  if (
    calls[2]?.path
    !== `${PAYMENT_INTENT_API_PATH}/pay_${encodeURIComponent(intent.clientIntentKey)}/reconcile`
    || calls[2].init?.method !== 'POST'
  ) {
    throw new Error(`unexpected reconcile request ${JSON.stringify(calls[2])}`)
  }
}

export async function testPaymentIntentQueueSurvivesIndexedDbReload() {
  resetPaymentModules()
  const originalIndexedDb = Dexie.dependencies.indexedDB
  const originalKeyRange = Dexie.dependencies.IDBKeyRange
  const databaseName = `kg:payment-reload:${Date.now()}:${Math.random()}`
  Dexie.dependencies.indexedDB = indexedDB
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  let firstDb: AgenticGraphStorageDb | null = null
  let reopenedDb: AgenticGraphStorageDb | null = null
  try {
    firstDb = await createIndexedDbCollectionDb<AgenticGraphStorageRecordMap>({
      databaseName,
      collectionNames: [...AGENTICGRAPH_STORAGE_COLLECTION_NAMES],
    })
    const queued = await enqueuePaymentIntent(command(9), {
      db: firstDb,
      nowMs: 99,
    })
    if (!queued.ok) throw new Error(`expected durable queue write, got ${JSON.stringify(queued)}`)
    await firstDb.db.close()
    firstDb = null

    reopenedDb = await createIndexedDbCollectionDb<AgenticGraphStorageRecordMap>({
      databaseName,
      collectionNames: [...AGENTICGRAPH_STORAGE_COLLECTION_NAMES],
    })
    const restored = await findPaymentIntentQueueRecord(
      command(9).clientIntentKey,
      reopenedDb,
    )
    if (!restored || restored.clientIntentKey !== command(9).clientIntentKey) {
      throw new Error(`expected queue to survive IndexedDB reopen, got ${JSON.stringify(restored)}`)
    }
  } finally {
    await firstDb?.db.remove().catch(() => undefined)
    await reopenedDb?.db.remove().catch(() => undefined)
    Dexie.dependencies.indexedDB = originalIndexedDb
    Dexie.dependencies.IDBKeyRange = originalKeyRange
  }
}

export async function testPaymentReconcilerIsOfflineZeroEgressAndSameKeySerialized() {
  resetPaymentModules()
  const db = createMemoryDb()
  const intent = command(21)
  let submitCalls = 0
  let reconcileCalls = 0
  const transport: PaymentApiTransport = Object.freeze({
    async readBuyerProduct() {
      return null
    },
    async submitIntent(received) {
      submitCalls += 1
      if (received.clientIntentKey !== intent.clientIntentKey) {
        throw new Error('reconciler changed the Client Intent Key')
      }
      return pendingResult(received)
    },
    async reconcileIntent(intentId) {
      reconcileCalls += 1
      if (intentId !== `pay_${intent.clientIntentKey}`) {
        throw new Error(`unexpected intent id ${intentId}`)
      }
      return paidResult(intent)
    },
  })
  try {
    const queued = await enqueuePaymentIntent(intent, { db, nowMs: 0 })
    if (!queued.ok) throw new Error(`expected queued intent, got ${JSON.stringify(queued)}`)

    const offline = await reconcilePaymentIntentQueue({
      db,
      transport,
      online: false,
      nowMs: 0,
    })
    if (offline.networkCalls !== 0 || submitCalls !== 0 || reconcileCalls !== 0) {
      throw new Error('offline reconciliation attempted network egress')
    }

    const interleavings = await Promise.all(Array.from({ length: 100 }, () =>
      reconcilePaymentIntentQueue({
        db,
        transport,
        online: true,
        nowMs: 0,
      })))
    if (
      Number(submitCalls) !== 1
      || Number(reconcileCalls) !== 0
      || interleavings.reduce((total, item) => total + item.networkCalls, 0) !== 1
    ) {
      throw new Error(`expected one serialized submit, got ${JSON.stringify({
        submitCalls,
        reconcileCalls,
      })}`)
    }

    await reconcilePaymentIntentQueue({
      db,
      transport,
      online: true,
      nowMs: PAYMENT_RECONCILIATION_BACKOFF_MS[0],
    })
    if (Number(submitCalls) !== 1 || Number(reconcileCalls) !== 1) {
      throw new Error('expected provider reconciliation to reuse the server intent identity')
    }
    const stored = await findPaymentIntentQueueRecord(intent.clientIntentKey, db)
    if (stored?.state !== 'paid' || stored.clientIntentKey !== intent.clientIntentKey) {
      throw new Error(`expected paid same-key record, got ${JSON.stringify(stored)}`)
    }
    const receipt = await readLocalPaymentReceiptProjection(db)
    if (
      receipt.ok === false
      || receipt.projection.records.length !== 1
      || receipt.projection.records[0]?.clientIntentKey !== intent.clientIntentKey
    ) {
      throw new Error(`expected one local receipt, got ${JSON.stringify(receipt)}`)
    }
  } finally {
    await db.db.remove()
  }
}

export async function testPaymentReconcilerStopsAtAttemptBound() {
  resetPaymentModules()
  const db = createMemoryDb()
  const intent = command(31)
  let calls = 0
  const transport: PaymentApiTransport = Object.freeze({
    async readBuyerProduct() {
      return null
    },
    async submitIntent() {
      calls += 1
      throw new Error('network unavailable')
    },
    async reconcileIntent() {
      calls += 1
      throw new Error('network unavailable')
    },
  })
  try {
    await enqueuePaymentIntent(intent, { db, nowMs: 0 })
    let nowMs = 0
    for (let attempt = 0; attempt < PAYMENT_RECONCILIATION_BACKOFF_MS.length; attempt += 1) {
      await reconcilePaymentIntentQueue({ db, transport, online: true, nowMs })
      nowMs += PAYMENT_RECONCILIATION_BACKOFF_MS[attempt]!
    }
    await reconcilePaymentIntentQueue({ db, transport, online: true, nowMs })
    const stored = await findPaymentIntentQueueRecord(intent.clientIntentKey, db)
    if (
      calls !== PAYMENT_RECONCILIATION_BACKOFF_MS.length
      || stored?.attemptCount !== PAYMENT_RECONCILIATION_BACKOFF_MS.length
      || stored.state !== 'reconciliation_unresolved'
    ) {
      throw new Error(`expected bounded unresolved result, got ${JSON.stringify({
        calls,
        stored,
      })}`)
    }
  } finally {
    await db.db.remove()
  }
}

export async function testPaymentReceiptProjectionIsIdempotentAndOfflineOnly() {
  resetPaymentModules()
  const db = createMemoryDb()
  const receipt = terminalReceipt(command(41))
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  globalThis.fetch = (async () => {
    fetchCalls += 1
    throw new Error('receipt view must not use fetch')
  }) as typeof fetch
  try {
    const first = await appendLocalPaymentReceipt(receipt, db)
    const replay = await appendLocalPaymentReceipt(receipt, db)
    const projection = await readLocalPaymentReceiptProjection(db)
    if (!first.ok || !first.appended || !replay.ok || replay.appended) {
      throw new Error(`expected idempotent receipt append, got ${JSON.stringify({ first, replay })}`)
    }
    if (
      !projection.ok
      || projection.projection.records.length !== 1
      || fetchCalls !== 0
    ) {
      throw new Error(`expected offline-only local receipt, got ${JSON.stringify({
        projection,
        fetchCalls,
      })}`)
    }
    const refunded = await appendLocalPaymentReceipt({
      ...receipt,
      terminalState: 'refunded',
      terminalTimestamp: '2026-07-29T00:01:00.000Z',
    }, db)
    const refundedProjection = await readLocalPaymentReceiptProjection(db)
    if (
      !refunded.ok
      || !refunded.appended
      || refundedProjection.ok === false
      || refundedProjection.projection.records.length !== 1
      || refundedProjection.projection.records[0]?.terminalState !== 'refunded'
      || refundedProjection.projection.statuses[0]?.state !== 'refunded'
    ) {
      throw new Error(`expected paid receipt to advance to refunded, got ${JSON.stringify({
        refunded,
        refundedProjection,
      })}`)
    }

    const malformed = '{"not":"canonical"}\n'
    await db.collections.paymentReceiptDocuments.incrementalUpsert({
      id: LOCAL_PAYMENT_RECEIPT_DOCUMENT_ID,
      schemaVersion: 1,
      document: malformed,
      updatedAtMs: 1,
    })
    const rejected = await appendLocalPaymentReceipt(terminalReceipt(command(42)), db)
    const unchanged = await readLocalPaymentReceiptDocument(db)
    if (rejected.ok !== false || rejected.code !== 'receipt_parse_error' || unchanged !== malformed) {
      throw new Error(`expected malformed receipt bytes to stay unchanged, got ${JSON.stringify({
        rejected,
        unchanged,
      })}`)
    }
  } finally {
    globalThis.fetch = originalFetch
    await db.db.remove()
  }
}
