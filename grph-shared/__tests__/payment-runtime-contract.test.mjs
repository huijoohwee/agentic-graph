import assert from 'node:assert/strict'
import test from 'node:test'

import fc from 'fast-check'

import {
  PAYMENT_BUYER_PRODUCT_ENV_KEYS,
  paymentCommandMatchesBuyerProduct,
  resolvePaymentBuyerProduct,
} from '../dist/payments/paymentBuyerProductSsot.js'
import {
  assertPaymentDataMinimized,
  buildPaymentFailureResult,
  buildPaymentPublicStatus,
  buildPaymentSuccessResult,
  buildProviderIdempotencyKey,
  buildTerminalReceiptRecord,
  listPaymentSurfaceStatePresentations,
  PAYMENT_SURFACE_STATES,
  validatePaymentIntentCommand,
} from '../dist/payments/paymentRuntimeContract.js'

const paidRecord = Object.freeze({
  id: 'pay_019fac4b-2bfc-7363-9fea-dcab0282cfe8',
  clientIntentKey: '019fac4b-2bfc-7363-9fea-dcab0282cfe8',
  parameterFingerprint: '1200:sgd:fiat:buyer',
  amountMinor: 1200,
  currency: 'sgd',
  settlementAsset: 'fiat',
  origin: 'buyer',
  rail: 'straitsx',
  selectionReason: 'sgd_fiat',
  state: 'paid',
  providerObjectId: 'payment_sandbox_1',
  providerRequestId: 'request_sandbox_1',
  providerInstruction: null,
  providerError: null,
  refundReference: null,
  reconciliationAttempts: 1,
  createdAt: '2026-07-29T00:00:00.000Z',
  updatedAt: '2026-07-29T00:01:00.000Z',
  terminalAt: '2026-07-29T00:01:00.000Z',
})

test('intent validation is closed and agent spend requires approval', () => {
  const buyer = {
    clientIntentKey: paidRecord.clientIntentKey,
    amountMinor: 1200,
    currency: 'sgd',
    settlementAsset: 'fiat',
    origin: 'buyer',
  }
  assert.deepEqual(validatePaymentIntentCommand(buyer), {
    ok: true,
    value: buyer,
  })
  assert.deepEqual(validatePaymentIntentCommand({ ...buyer, origin: 'agent' }), {
    ok: false,
    code: 'approval_missing',
    message: 'Agent payment creation requires approval.',
  })
  assert.equal(validatePaymentIntentCommand({ ...buyer, amountMinor: 12.5 }).ok, false)
  assert.equal(validatePaymentIntentCommand({ ...buyer, amountMinor: '1200' }).ok, false)
  assert.equal(validatePaymentIntentCommand({ ...buyer, approvalRef: 123 }).ok, false)
  assert.equal(validatePaymentIntentCommand({ ...buyer, currency: 'SGD' }).ok, true)
  assert.equal(validatePaymentIntentCommand({ ...buyer, extra: 'rejected' }).ok, false)
})

test('buyer product authority is server-configured and exact', () => {
  const resolution = resolvePaymentBuyerProduct({
    [PAYMENT_BUYER_PRODUCT_ENV_KEYS.amountMinor]: '1200',
    [PAYMENT_BUYER_PRODUCT_ENV_KEYS.currency]: 'SGD',
    [PAYMENT_BUYER_PRODUCT_ENV_KEYS.settlementAsset]: 'fiat',
  })
  assert.equal(resolution.ok, true)
  assert.deepEqual(resolution.value, {
    amountMinor: 1200,
    currency: 'sgd',
    settlementAsset: 'fiat',
  })
  assert.equal(paymentCommandMatchesBuyerProduct({
    clientIntentKey: paidRecord.clientIntentKey,
    amountMinor: 1200,
    currency: 'sgd',
    settlementAsset: 'fiat',
    origin: 'buyer',
  }, resolution.value), true)
  assert.equal(resolvePaymentBuyerProduct({
    [PAYMENT_BUYER_PRODUCT_ENV_KEYS.amountMinor]: '12.5',
    [PAYMENT_BUYER_PRODUCT_ENV_KEYS.currency]: 'sgd',
    [PAYMENT_BUYER_PRODUCT_ENV_KEYS.settlementAsset]: 'fiat',
  }).ok, false)
})

test('public status is exactly four fields and both rails share one result shape', () => {
  const status = buildPaymentPublicStatus(paidRecord)
  assert.deepEqual(Object.keys(status), ['intentId', 'state', 'amountMinor', 'currency'])
  const straitsxResult = buildPaymentSuccessResult(paidRecord, false)
  const stripeResult = buildPaymentSuccessResult({
    ...paidRecord,
    rail: 'stripe',
    selectionReason: 'card_currency',
    currency: 'usd',
    settlementAsset: 'fiat',
    providerObjectId: 'cs_test_one',
  }, false)
  assert.deepEqual(Object.keys(straitsxResult), Object.keys(stripeResult))
  assert.equal(straitsxResult.modelCallCount, 0)
  assert.equal(straitsxResult.modelCostUsd, 0)
  const failure = buildPaymentFailureResult({
    code: 'provider_outcome_unknown',
    message: 'The provider outcome is not yet known.',
    record: { ...paidRecord, state: 'provider_outcome_unknown', terminalAt: null },
  })
  assert.equal(failure.receiptRecord, null)
  assert.equal(failure.instruction, null)
})

test('ten surface states have distinct labels and actions', () => {
  const presentations = listPaymentSurfaceStatePresentations()
  assert.deepEqual(presentations.map(item => item.state), PAYMENT_SURFACE_STATES)
  assert.equal(new Set(presentations.map(item => item.label)).size, 10)
  presentations.forEach(item => {
    assert.ok(item.label)
    assert.ok(item.nextAction)
  })
  const offline = presentations.find(item => item.state === 'queued_offline')
  assert.match(offline.nextAction, /reconnect/i)
  const refunded = presentations.find(item => item.state === 'refunded')
  assert.match(refunded.label, /refunded/i)
  assert.match(refunded.nextAction, /refund receipt/i)
})

test('terminal runtime records project to the nine-field receipt contract', () => {
  const receipt = buildTerminalReceiptRecord(paidRecord)
  assert.deepEqual(receipt, {
    intentId: paidRecord.id,
    clientIntentKey: paidRecord.clientIntentKey,
    rail: 'straitsx',
    amountMinor: 1200,
    currency: 'sgd',
    settlementAsset: 'fiat',
    terminalState: 'paid',
    providerObjectId: 'payment_sandbox_1',
    terminalTimestamp: '2026-07-29T00:01:00.000Z',
  })
  assert.equal(buildTerminalReceiptRecord({
    ...paidRecord,
    state: 'pending_provider',
    terminalAt: null,
  }), null)
  const refundedRecord = {
    ...paidRecord,
    state: 'refunded',
    refundReference: 're_sandbox_1',
    terminalAt: '2026-07-29T00:02:00.000Z',
  }
  assert.equal(buildPaymentPublicStatus(refundedRecord).state, 'refunded')
  assert.equal(
    buildTerminalReceiptRecord(refundedRecord).terminalState,
    'refunded',
  )
})

test('idempotency and metadata properties exclude personal or regulated data', () => {
  fc.assert(
    fc.property(fc.uuid(), key => {
      const stripeKey = buildProviderIdempotencyKey('stripe', key)
      const straitsxKey = buildProviderIdempotencyKey('straitsx', key)
      assert.ok(stripeKey.length <= 255)
      assert.ok(straitsxKey.length <= 255)
      assert.doesNotMatch(stripeKey, /@/)
      assert.doesNotMatch(straitsxKey, /@/)
      assert.doesNotThrow(() => assertPaymentDataMinimized({
        clientIntentKey: key,
        providerObjectId: `provider_${key}`,
      }))
    }),
    { numRuns: 100 },
  )
  assert.throws(() => assertPaymentDataMinimized({ cardNumber: '4242424242424242' }))
  assert.throws(() => assertPaymentDataMinimized({ cvv: '123' }))
  assert.throws(() => assertPaymentDataMinimized({ fullBankAccount: '123456789' }))
  assert.throws(() => assertPaymentDataMinimized({ note: 'buyer@example.com' }))
})
