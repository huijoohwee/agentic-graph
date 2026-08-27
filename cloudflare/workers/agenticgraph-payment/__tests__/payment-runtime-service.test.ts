import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PAYMENT_MAX_RECONCILIATION_ATTEMPTS,
  PAYMENT_PROVIDER_CREATE_RETRY_WINDOW_MS,
  type PaymentIntentRecord,
} from '../../../../grph-shared/src/payments/paymentRuntimeContract'
import type { PaymentProviderReadResult } from '../paymentRailAdapters'
import { createPaymentRuntimeService } from '../paymentRuntimeService'
import {
  buildAdapter,
  MemoryPaymentRuntimeStore,
  TEST_BUYER_PRODUCT,
  TEST_COMMAND,
  TEST_READINESS,
} from './paymentRuntimeHarness'

const createService = (args: {
  store?: MemoryPaymentRuntimeStore
  stripe?: ReturnType<typeof buildAdapter>
  straitsx?: ReturnType<typeof buildAdapter>
  onCostLogGap?: (error: unknown) => void
  now?: () => Date
  buyerProduct?: typeof TEST_BUYER_PRODUCT | null
} = {}) => {
  const store = args.store || new MemoryPaymentRuntimeStore()
  return {
    store,
    service: createPaymentRuntimeService({
      store,
      adapters: {
        stripe: args.stripe || buildAdapter({ store }),
        straitsx: args.straitsx || buildAdapter({ store }),
      },
      readiness: TEST_READINESS,
      buyerProduct: args.buyerProduct === undefined
        ? TEST_BUYER_PRODUCT
        : args.buyerProduct,
      now: args.now || (() => new Date('2026-07-29T00:00:00.000Z')),
      onCostLogGap: args.onCostLogGap,
    }),
  }
}

test('intent ownership persists before provider contact and replay never creates twice', async () => {
  const { service, store } = createService()
  const first = await service.createIntent(TEST_COMMAND)
  assert.equal(first.ok, true)
  assert.equal(first.idempotentReplay, false)
  assert.deepEqual(store.operationLog.slice(0, 2), [
    `insert:${TEST_COMMAND.clientIntentKey}`,
    `provider-create:${TEST_COMMAND.clientIntentKey}`,
  ])
  assert.equal(store.operationLog.filter(item => item.startsWith('provider-create')).length, 1)

  const replay = await service.createIntent(TEST_COMMAND)
  assert.equal(replay.ok, true)
  assert.equal(replay.idempotentReplay, true)
  assert.equal(store.operationLog.filter(item => item.startsWith('provider-create')).length, 1)

  const conflict = await service.createIntent({ ...TEST_COMMAND, amountMinor: 1201 })
  assert.equal(conflict.ok, false)
  assert.equal(conflict.code, 'intent_parameter_conflict')
  assert.equal(store.operationLog.filter(item => item.startsWith('provider-create')).length, 1)
})

test('approval and XSGD capability gates reject before storage or provider contact', async () => {
  const { service, store } = createService()
  const approvalMissing = await service.createIntent({
    ...TEST_COMMAND,
    origin: 'agent',
  })
  assert.equal(approvalMissing.ok, false)
  assert.equal(approvalMissing.code, 'approval_missing')

  const xsgdCommand = {
    ...TEST_COMMAND,
    settlementAsset: 'xsgd' as const,
  }
  const xsgdService = createService({
    store,
    buyerProduct: {
      amountMinor: xsgdCommand.amountMinor,
      currency: xsgdCommand.currency,
      settlementAsset: 'xsgd',
    },
  }).service
  const xsgdUnavailable = await xsgdService.createIntent(xsgdCommand)
  assert.equal(xsgdUnavailable.ok, false)
  assert.equal(xsgdUnavailable.code, 'rail_unavailable')
  assert.deepEqual(store.operationLog, [])
})

test('server product authority rejects caller price changes before storage or provider contact', async () => {
  const { service, store } = createService()
  const result = await service.createIntent({
    ...TEST_COMMAND,
    amountMinor: TEST_COMMAND.amountMinor - 1,
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'capability_unavailable')
  assert.deepEqual(store.operationLog, [])
})

test('provider uncertainty retries the same durable intent and settles only from provider read', async () => {
  const store = new MemoryPaymentRuntimeStore()
  let createCalls = 0
  const adapter = buildAdapter({
    store,
    async create(record) {
      createCalls += 1
      if (createCalls === 1) {
        return {
          ok: false,
          code: 'provider_outcome_unknown',
          error: null,
          calls: [{
            operation: 'payment.create',
            requestId: null,
            outcome: 'provider_outcome_unknown',
            elapsedMs: 2,
          }],
        }
      }
      return {
        ok: true,
        state: 'paid',
        providerObjectId: `provider_${record.clientIntentKey}`,
        providerRequestId: 'request_replayed_create',
        instruction: null,
        calls: [{
          operation: 'payment.create',
          requestId: 'request_replayed_create',
          outcome: 'success',
          elapsedMs: 1,
        }],
      }
    },
  })
  const { service } = createService({ store, straitsx: adapter })
  const created = await service.createIntent(TEST_COMMAND)
  assert.equal(created.ok, false)
  assert.equal(created.code, 'provider_outcome_unknown')
  assert.ok(created.intent)
  assert.equal(created.intent.state, 'pending_provider')
  const storedUnknown = await store.findIntentByClientKey(TEST_COMMAND.clientIntentKey)
  assert.ok(storedUnknown)
  assert.equal(storedUnknown?.state, 'provider_outcome_unknown')

  const reconciled = await service.reconcile(storedUnknown.id)
  assert.equal(reconciled.ok, true)
  assert.equal(reconciled.intent.state, 'paid')
  assert.equal(createCalls, 2)
  assert.equal(store.operationLog.filter(item => item.startsWith('insert')).length, 1)
  assert.equal(store.operationLog.filter(item => item.startsWith('provider-read')).length, 1)
  assert.equal(reconciled.receiptRecord?.providerObjectId, `provider_${TEST_COMMAND.clientIntentKey}`)
})

test('provider create is never retried beyond the safe idempotency window', async () => {
  const store = new MemoryPaymentRuntimeStore()
  let currentTimeMs = Date.parse('2026-07-29T00:00:00.000Z')
  let createCalls = 0
  const adapter = buildAdapter({
    store,
    async create() {
      createCalls += 1
      return {
        ok: false,
        code: 'provider_outcome_unknown',
        error: null,
        calls: [],
      }
    },
  })
  const { service } = createService({
    store,
    straitsx: adapter,
    now: () => new Date(currentTimeMs),
  })
  const created = await service.createIntent(TEST_COMMAND)
  assert.equal(created.ok, false)
  currentTimeMs += PAYMENT_PROVIDER_CREATE_RETRY_WINDOW_MS

  const reconciled = await service.reconcile(created.intent?.intentId || '')
  assert.equal(reconciled.ok, false)
  assert.equal(reconciled.code, 'provider_outcome_unknown')
  assert.equal(createCalls, 1)
})

test('provider failures preserve only the sanitized reason and discard raw details', async () => {
  const store = new MemoryPaymentRuntimeStore()
  const adapter = buildAdapter({
    store,
    async create() {
      return {
        ok: false,
        code: 'provider_declined',
        error: {
          providerType: 'payment_failed',
          providerCode: 'payment_failed',
          declineCode: null,
          providerReason: 'Provider-safe operator reason',
          requestId: 'request_declined',
          httpStatus: 422,
          details: {
            sender_information: 'must not persist',
          },
        },
        calls: [],
      }
    },
  })
  const { service } = createService({ store, straitsx: adapter })
  const result = await service.createIntent(TEST_COMMAND)
  assert.equal(result.ok, false)
  assert.equal(result.code, 'provider_declined')

  const stored = await store.findIntentByClientKey(TEST_COMMAND.clientIntentKey)
  assert.equal(stored?.providerError?.providerReason, 'Provider-safe operator reason')
  assert.equal(stored?.providerError?.details, null)
  assert.equal(JSON.stringify(stored).includes('must not persist'), false)
})

test('mismatched provider state never unlocks and reconciliation stops at the stated bound', async () => {
  const store = new MemoryPaymentRuntimeStore()
  const mismatchAdapter = buildAdapter({
    store,
    async read(record) {
      return {
        ok: true,
        state: 'paid',
        amountMinor: record.amountMinor + 1,
        currency: record.currency,
        providerObjectId: record.providerObjectId || '',
        clientIntentReference:
          `knowgrph:${record.rail}:create:${record.clientIntentKey}`,
        providerRequestId: 'request_mismatch',
        refundTargetId: null,
        calls: [{
          operation: 'payment.read',
          requestId: 'request_mismatch',
          outcome: 'success',
          elapsedMs: 1,
        }],
      }
    },
  })
  const { service } = createService({ store, straitsx: mismatchAdapter })
  const created = await service.createIntent(TEST_COMMAND)
  assert.equal(created.ok, true)
  let result = await service.reconcile(created.intent.intentId)
  assert.equal(result.ok, false)
  assert.equal(result.code, 'provider_outcome_unknown')
  for (let attempt = 1; attempt < PAYMENT_MAX_RECONCILIATION_ATTEMPTS; attempt += 1) {
    result = await service.reconcile(created.intent.intentId)
  }
  const stopped = await store.findIntentById(created.intent.intentId)
  assert.equal(stopped?.state, 'reconciliation_unresolved')
  assert.equal(result.receiptRecord?.terminalState, 'reconciliation_unresolved')
})

test('refunds are paid-only, idempotent, and StraitsX can remain zero-call unbound', async () => {
  const store = new MemoryPaymentRuntimeStore()
  const unboundStraitsx = buildAdapter({
    store,
    async refund() {
      return {
        ok: false,
        code: 'provider_operation_unverified',
        error: null,
        calls: [],
      }
    },
  })
  const { service } = createService({ store, straitsx: unboundStraitsx })
  const created = await service.createIntent(TEST_COMMAND)
  assert.equal(created.ok, true)
  const beforePaid = await service.refund(created.intent.intentId)
  assert.equal(beforePaid.ok, false)
  assert.equal(beforePaid.code, 'refund_not_applicable')
  assert.equal(store.operationLog.some(item => item.startsWith('provider-refund')), false)

  await service.reconcile(created.intent.intentId)
  const unbound = await service.refund(created.intent.intentId)
  assert.equal(unbound.ok, false)
  assert.equal(unbound.code, 'provider_operation_unverified')
  assert.equal(store.costs.filter(item => item.operation.includes('refund')).length, 0)
})

test('concurrent provider reads cannot regress an intent after paid wins the revision CAS', async () => {
  const store = new MemoryPaymentRuntimeStore()
  const pendingReads: Array<{
    record: PaymentIntentRecord
    resolve: (result: PaymentProviderReadResult) => void
  }> = []
  const racingAdapter = buildAdapter({
    store,
    async read(record) {
      return new Promise<PaymentProviderReadResult>(resolve => {
        pendingReads.push({ record, resolve })
      })
    },
  })
  const { service } = createService({ store, straitsx: racingAdapter })
  const created = await service.createIntent(TEST_COMMAND)
  assert.equal(created.ok, true)

  const paidRead = service.reconcile(created.intent.intentId)
  const staleRead = service.reconcile(created.intent.intentId)
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(pendingReads.length, 2)

  const paidRecord = pendingReads[0].record
  pendingReads[0].resolve({
    ok: true,
    state: 'paid',
    amountMinor: paidRecord.amountMinor,
    currency: paidRecord.currency,
    providerObjectId: paidRecord.providerObjectId || '',
    clientIntentReference:
      `knowgrph:${paidRecord.rail}:create:${paidRecord.clientIntentKey}`,
    providerRequestId: 'request_paid_winner',
    refundTargetId: 'payment_intent_1',
    calls: [],
  })
  const paidResult = await paidRead
  assert.equal(paidResult.ok, true)
  assert.equal(paidResult.intent.state, 'paid')

  const staleRecord = pendingReads[1].record
  pendingReads[1].resolve({
    ok: true,
    state: 'pending_provider',
    amountMinor: staleRecord.amountMinor,
    currency: staleRecord.currency,
    providerObjectId: staleRecord.providerObjectId || '',
    clientIntentReference:
      `knowgrph:${staleRecord.rail}:create:${staleRecord.clientIntentKey}`,
    providerRequestId: 'request_stale_nonterminal',
    refundTargetId: null,
    calls: [],
  })
  const staleResult = await staleRead
  assert.equal(staleResult.ok, true)
  assert.equal(staleResult.intent.state, 'paid')

  const stored = await store.findIntentById(created.intent.intentId)
  assert.equal(stored?.state, 'paid')
  assert.equal(stored?.providerRequestId, 'request_paid_winner')
  assert.equal(
    store.operationLog.filter(operation => operation === 'update:paid').length,
    1,
  )
  assert.equal(
    store.operationLog.includes('conflict:provider_outcome_unknown'),
    true,
  )
})

test('every provider call emits one zero-model cost row and observer failure cannot stop payment', async () => {
  const store = new MemoryPaymentRuntimeStore()
  const gaps: unknown[] = []
  const { service } = createService({
    store,
    onCostLogGap: error => gaps.push(error),
  })
  const created = await service.createIntent(TEST_COMMAND)
  assert.equal(created.ok, true)
  await service.reconcile(created.intent.intentId)
  assert.equal(store.costs.length, 2)
  store.costs.forEach(entry => {
    assert.equal(entry.modelCallCount, 0)
    assert.equal(entry.modelCostUsd, 0)
  })
  const view = await service.readView('cost_summary')
  assert.equal(view.ok, true)
  assert.equal(view.entries.length, 2)

  const failingStore = new MemoryPaymentRuntimeStore()
  failingStore.rejectCostWrites = true
  const runtime = createService({
    store: failingStore,
    onCostLogGap: error => gaps.push(error),
  })
  const stillCreated = await runtime.service.createIntent({
    ...TEST_COMMAND,
    clientIntentKey: '119fac4b-2bfc-7363-9fea-dcab0282cfe8',
  })
  assert.equal(stillCreated.ok, true)
  assert.equal(gaps.length, 1)
})
