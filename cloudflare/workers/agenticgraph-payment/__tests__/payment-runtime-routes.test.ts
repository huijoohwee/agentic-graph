import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  PaymentIntentRecord,
} from '../../../../grph-shared/src/payments/paymentRuntimeContract'
import { PAYMENT_BUYER_PRODUCT_ENV_KEYS } from '../../../../grph-shared/src/payments/paymentBuyerProductSsot'
import { STRIPE_PAYMENT_ENV_KEYS } from '../../../../grph-shared/src/payments/stripePaymentSsot'
import type { D1DatabaseLike } from '../../shared/d1'
import {
  buildPaymentDiscovery,
  handlePaymentRuntimeRoute,
  inspectPaymentRuntimeReadiness,
} from '../paymentRuntimeRoutes'

const STRIPE_ENV = Object.freeze({
  [STRIPE_PAYMENT_ENV_KEYS.runtimeMode]: 'sandbox',
  [STRIPE_PAYMENT_ENV_KEYS.runtimeRestrictedKey]: 'rk_test_runtime_readiness',
  [STRIPE_PAYMENT_ENV_KEYS.runtimeWebhookSecret]: 'whsec_runtime_readiness',
  [STRIPE_PAYMENT_ENV_KEYS.checkoutPriceId]: 'price_runtime_readiness',
  PAYMENT_CARD_SETTLED_CURRENCIES: 'sgd,usd',
  [PAYMENT_BUYER_PRODUCT_ENV_KEYS.amountMinor]: '1200',
  [PAYMENT_BUYER_PRODUCT_ENV_KEYS.currency]: 'usd',
  [PAYMENT_BUYER_PRODUCT_ENV_KEYS.settlementAsset]: 'fiat',
})

const STRIPE_EVIDENCE: PaymentIntentRecord = Object.freeze({
  id: 'pay_019fac4b-2bfc-7363-9fea-dcab0282cfe8',
  clientIntentKey: '019fac4b-2bfc-7363-9fea-dcab0282cfe8',
  parameterFingerprint: 'runtime-readiness-evidence',
  amountMinor: 1200,
  currency: 'usd',
  settlementAsset: 'fiat',
  origin: 'buyer',
  rail: 'stripe',
  selectionReason: 'card_currency',
  state: 'paid',
  providerObjectId: 'cs_test_runtime_readiness',
  providerRequestId: 'req_runtime_readiness',
  providerInstruction: null,
  providerError: null,
  refundReference: null,
  reconciliationAttempts: 1,
  createdAt: '2026-07-29T00:00:00.000Z',
  updatedAt: '2026-07-29T00:01:00.000Z',
  terminalAt: '2026-07-29T00:01:00.000Z',
})

test('configuration alone never promotes a rail without paid sandbox evidence', () => {
  const readiness = inspectPaymentRuntimeReadiness(STRIPE_ENV)
  assert.equal(readiness.rails.stripe, false)
  assert.equal(readiness.admissionRails.stripe, true)
  assert.deepEqual(readiness.entries[0]?.missing, [
    'authenticated_paid_sandbox_attestation',
  ])
  assert.ok(
    readiness.unavailableSources.includes(
      'stripe_authenticated_paid_sandbox_attestation',
    ),
  )
})

test('canonical paid evidence round trip promotes only its configured rail', () => {
  const readiness = inspectPaymentRuntimeReadiness(STRIPE_ENV, {
    stripe: STRIPE_EVIDENCE,
    straitsx: null,
  })
  assert.equal(readiness.rails.stripe, true)
  assert.equal(readiness.admissionRails.stripe, true)
  assert.equal(readiness.rails.straitsx, false)
  assert.equal(readiness.rails.xsgd, false)
  assert.deepEqual(readiness.entries[0]?.missing, [])
  assert.equal(
    readiness.unavailableSources.includes(
      'stripe_authenticated_paid_sandbox_attestation',
    ),
    false,
  )
})

test('non-paid or non-canonical evidence remains fail closed', () => {
  const notPaid = inspectPaymentRuntimeReadiness(STRIPE_ENV, {
    stripe: { ...STRIPE_EVIDENCE, state: 'failed' },
    straitsx: null,
  })
  const malformedTimestamp = inspectPaymentRuntimeReadiness(STRIPE_ENV, {
    stripe: { ...STRIPE_EVIDENCE, terminalAt: '2026-07-29 00:01:00' },
    straitsx: null,
  })
  assert.equal(notPaid.rails.stripe, false)
  assert.equal(malformedTimestamp.rails.stripe, false)
})

test('missing server product authority blocks sandbox admission before proof', () => {
  const readiness = inspectPaymentRuntimeReadiness({
    ...STRIPE_ENV,
    [PAYMENT_BUYER_PRODUCT_ENV_KEYS.amountMinor]: '',
  })
  assert.equal(readiness.admissionRails.stripe, false)
  assert.equal(readiness.rails.stripe, false)
  assert.ok(
    readiness.entries[0]?.admissionMissing.includes(
      PAYMENT_BUYER_PRODUCT_ENV_KEYS.amountMinor,
    ),
  )
})

test('discovery projects only the resolved server-owned buyer product', () => {
  const readiness = inspectPaymentRuntimeReadiness(STRIPE_ENV)
  const buyerProduct = Object.freeze({
    amountMinor: 1200,
    currency: 'usd',
    settlementAsset: 'fiat' as const,
  })

  assert.deepEqual(buildPaymentDiscovery(readiness, buyerProduct).buyerProduct, {
    amountMinor: 1200,
    currency: 'usd',
    settlementAsset: 'fiat',
  })
  assert.equal(buildPaymentDiscovery(readiness, null).buyerProduct, null)
})

test('public HTTP refund attempts stop at the approval boundary before storage access', async () => {
  const response = await handlePaymentRuntimeRoute({
    request: new Request(
      'https://payments.test/api/payments/intents/pay_test/refund',
      { method: 'POST' },
    ),
    env: {},
    db: {
      prepare() {
        throw new Error('storage must not be touched before approval')
      },
    } as unknown as D1DatabaseLike,
    corsHeaders: {},
  })
  assert.equal(response?.status, 403)
  assert.deepEqual(await response?.json(), {
    ok: false,
    code: 'approval_missing',
    message: 'Refund execution requires the approval-gated host adapter.',
  })
})

test('public HTTP agent creation stops at the approval boundary before storage access', async () => {
  const response = await handlePaymentRuntimeRoute({
    request: new Request(
      'https://payments.test/api/payments/intents',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientIntentKey: '019fac4b-2bfc-7363-9fea-dcab0282cfe8',
          amountMinor: 1200,
          currency: 'sgd',
          settlementAsset: 'fiat',
          origin: 'agent',
          approvalRef: 'untrusted-public-claim',
        }),
      },
    ),
    env: {},
    db: {
      prepare() {
        throw new Error('storage must not be touched before approval')
      },
    } as unknown as D1DatabaseLike,
    corsHeaders: {},
  })
  assert.equal(response?.status, 403)
  assert.deepEqual(await response?.json(), {
    ok: false,
    code: 'approval_missing',
    message: 'Agent payment creation requires the approval-gated host adapter.',
  })
})

test('agentic purchase readiness is read-only, local-bound, and fail closed', async () => {
  const response = await handlePaymentRuntimeRoute({
    request: new Request(
      'https://payments.test/api/payments/views/agentic_purchase_readiness',
    ),
    env: {},
    db: {
      prepare() {
        throw new Error('readiness view must not query or mutate D1')
      },
    } as unknown as D1DatabaseLike,
    corsHeaders: {},
  })
  assert.equal(response?.status, 200)
  const body = await response?.json() as {
    boundary: string
    readiness: {
      runtimeReady: boolean
      providerCallCount: number
      unavailableSources: string[]
    }
    claims: Record<string, boolean>
  }
  assert.equal(body.boundary, 'deterministic-local')
  assert.equal(body.readiness.runtimeReady, false)
  assert.equal(body.readiness.providerCallCount, 0)
  assert.ok(body.readiness.unavailableSources.includes('kycAccountGrant'))
  assert.ok(body.readiness.unavailableSources.includes('secureCardBroker'))
  assert.deepEqual(body.claims, {
    providerSandboxProven: false,
    browserProven: false,
    protectedIntegrationProven: false,
    deployed: false,
  })
})
