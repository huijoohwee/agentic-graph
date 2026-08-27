import assert from 'node:assert/strict'
import test from 'node:test'

import {
  STRAITSX_DYNAMIC_PAYNOW_CREATE_PATH,
  STRAITSX_DYNAMIC_PAYNOW_READ_PATH_TEMPLATE,
  STRAITSX_ENV_KEYS,
  STRAITSX_HEADER_NAMES,
} from '../../../../grph-shared/src/payments/straitsxPaymentSsot'
import {
  STRIPE_PAYMENT_ENV_KEYS,
  STRIPE_PAYMENT_REQUEST_API_VERSION,
} from '../../../../grph-shared/src/payments/stripePaymentSsot'
import {
  createStraitsxPaymentRailAdapter,
  createStripePaymentRailAdapter,
} from '../paymentRailAdapters'

const record = Object.freeze({
  id: 'pay_019fac4b-2bfc-7363-9fea-dcab0282cfe8',
  clientIntentKey: '019fac4b-2bfc-7363-9fea-dcab0282cfe8',
  parameterFingerprint: '1200:sgd:fiat:buyer',
  amountMinor: 1200,
  currency: 'sgd',
  settlementAsset: 'fiat' as const,
  origin: 'buyer' as const,
  rail: 'stripe' as const,
  selectionReason: 'card_currency' as const,
  state: 'pending_provider' as const,
  providerObjectId: null,
  providerRequestId: null,
  providerInstruction: null,
  providerError: null,
  refundReference: null,
  reconciliationAttempts: 0,
  createdAt: '2026-07-29T00:00:00.000Z',
  updatedAt: '2026-07-29T00:00:00.000Z',
  terminalAt: null,
})

const stripeEnvironment = {
  [STRIPE_PAYMENT_ENV_KEYS.runtimeMode]: 'sandbox',
  [STRIPE_PAYMENT_ENV_KEYS.runtimeRestrictedKey]: 'rk_test_sandbox_adapter',
  [STRIPE_PAYMENT_ENV_KEYS.checkoutPriceId]: 'price_sandbox',
  [STRIPE_PAYMENT_ENV_KEYS.checkoutReturnOrigin]: 'https://app.example',
}

const straitsxEnvironment = {
  [STRAITSX_ENV_KEYS.enabled]: 'true',
  [STRAITSX_ENV_KEYS.mode]: 'sandbox',
  [STRAITSX_ENV_KEYS.integrationModel]: 'regular_transfer',
  [STRAITSX_ENV_KEYS.fundFlow]: 'own_account_collection',
  [STRAITSX_ENV_KEYS.paymentMethod]: 'dynamic_paynow',
  [STRAITSX_ENV_KEYS.grantedProducts]: 'dynamic_paynow',
  [STRAITSX_ENV_KEYS.paymentCreatePath]: STRAITSX_DYNAMIC_PAYNOW_CREATE_PATH,
  [STRAITSX_ENV_KEYS.paymentReadPathTemplate]:
    STRAITSX_DYNAMIC_PAYNOW_READ_PATH_TEMPLATE,
  [STRAITSX_ENV_KEYS.authMode]: 'api_key',
  [STRAITSX_ENV_KEYS.sandboxApiKey]: 'straitsx-sandbox-key',
  [STRAITSX_ENV_KEYS.sandboxCallbackSecret]: 'straitsx-callback-secret',
}

test('Stripe create uses one stable key, explicit API version, and Request-Id correlation', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const adapter = createStripePaymentRailAdapter({
    env: stripeEnvironment,
    requestOrigin: 'https://app.example',
    async fetch(input, init) {
      requests.push({ url: String(input), init })
      return new Response(JSON.stringify({
        id: 'cs_test_sandbox',
        url: 'https://checkout.stripe.test/c/pay',
        status: 'open',
        payment_status: 'unpaid',
        amount_total: 1200,
        currency: 'sgd',
        client_reference_id: `agenticgraph:stripe:create:${record.clientIntentKey}`,
      }), {
        status: 200,
        headers: { 'request-id': 'req_sandbox_create' },
      })
    },
  })
  const result = await adapter.create(record)
  assert.equal(result.ok, true)
  assert.equal(result.providerObjectId, 'cs_test_sandbox')
  assert.equal(result.providerRequestId, 'req_sandbox_create')
  assert.equal(result.instruction?.kind, 'hosted_checkout')
  assert.equal(requests.length, 1)
  const headers = new Headers(requests[0].init?.headers)
  assert.equal(headers.get('stripe-version'), STRIPE_PAYMENT_REQUEST_API_VERSION)
  assert.equal(
    headers.get('idempotency-key'),
    `agenticgraph:stripe:create:${record.clientIntentKey}`,
  )
  assert.doesNotMatch(headers.get('idempotency-key') || '', /@/)
})

test('Stripe mode mismatch and provider ambiguity fail closed without a second key', async () => {
  let modeMismatchCalls = 0
  const modeMismatch = createStripePaymentRailAdapter({
    env: {
      ...stripeEnvironment,
      [STRIPE_PAYMENT_ENV_KEYS.runtimeRestrictedKey]: 'rk_live_forbidden',
    },
    requestOrigin: 'https://app.example',
    async fetch() {
      modeMismatchCalls += 1
      return new Response()
    },
  })
  const mismatch = await modeMismatch.create(record)
  assert.equal(mismatch.ok, false)
  assert.equal(mismatch.code, 'mode_mismatch')
  assert.equal(modeMismatchCalls, 0)

  const keys: string[] = []
  const ambiguous = createStripePaymentRailAdapter({
    env: stripeEnvironment,
    requestOrigin: 'https://app.example',
    async fetch(_input, init) {
      keys.push(new Headers(init?.headers).get('idempotency-key') || '')
      return new Response(JSON.stringify({
        error: { type: 'api_error', code: 'temporary' },
      }), { status: 500 })
    },
  })
  const first = await ambiguous.create(record)
  const replay = await ambiguous.create(record)
  assert.equal(first.ok, false)
  assert.equal(first.code, 'provider_outcome_unknown')
  assert.equal(replay.ok, false)
  assert.deepEqual(keys, [keys[0], keys[0]])
})

test('Stripe rejects non-integer provider amounts instead of coercing them', async () => {
  for (const amountTotal of ['1200', 1200.5]) {
    const adapter = createStripePaymentRailAdapter({
      env: stripeEnvironment,
      requestOrigin: 'https://app.example',
      async fetch() {
        return new Response(JSON.stringify({
          id: 'cs_test_bad_amount',
          url: 'https://checkout.stripe.test/c/pay',
          status: 'open',
          payment_status: 'unpaid',
          amount_total: amountTotal,
          currency: 'sgd',
          client_reference_id: `agenticgraph:stripe:create:${record.clientIntentKey}`,
        }), { status: 200 })
      },
    })
    const result = await adapter.create(record)
    assert.equal(result.ok, false)
    assert.equal(result.code, 'provider_outcome_unknown')
  }
})

test('Stripe error types and decline codes retain operator correlation fields', async () => {
  for (const providerType of [
    'api_error',
    'card_error',
    'idempotency_error',
    'invalid_request_error',
  ]) {
    const adapter = createStripePaymentRailAdapter({
      env: stripeEnvironment,
      requestOrigin: 'https://app.example',
      async fetch() {
        return new Response(JSON.stringify({
          error: {
            type: providerType,
            code: `${providerType}_code`,
            decline_code: providerType === 'card_error'
              ? 'insufficient_funds'
              : null,
            message: 'Provider-safe operator reason',
          },
        }), {
          status: 400,
          headers: { 'request-id': `request_${providerType}` },
        })
      },
    })
    const result = await adapter.create(record)
    assert.equal(result.ok, false)
    assert.equal(result.error?.providerType, providerType)
    assert.equal(result.error?.providerCode, `${providerType}_code`)
    assert.equal(
      result.error?.declineCode,
      providerType === 'card_error' ? 'insufficient_funds' : null,
    )
    assert.equal(result.error?.providerReason, 'Provider-safe operator reason')
    assert.equal(result.error?.requestId, `request_${providerType}`)
  }
})

test('Stripe parameter conflicts and paid refunds retain typed semantics', async () => {
  const conflict = createStripePaymentRailAdapter({
    env: stripeEnvironment,
    requestOrigin: 'https://app.example',
    async fetch() {
      return new Response(JSON.stringify({
        error: { type: 'idempotency_error', code: 'key_in_use' },
      }), {
        status: 400,
        headers: { 'request-id': 'req_conflict' },
      })
    },
  })
  const conflictResult = await conflict.create(record)
  assert.equal(conflictResult.ok, false)
  assert.equal(conflictResult.code, 'intent_parameter_conflict')
  assert.equal(conflictResult.error?.requestId, 'req_conflict')

  const operations: string[] = []
  const refundAdapter = createStripePaymentRailAdapter({
    env: stripeEnvironment,
    requestOrigin: 'https://app.example',
    async fetch(input) {
      operations.push(String(input))
      if (String(input).includes('/checkout/sessions/')) {
        return new Response(JSON.stringify({
          id: 'cs_test_paid',
          status: 'complete',
          payment_status: 'paid',
          amount_total: 1200,
          currency: 'sgd',
          payment_intent: 'pi_test_paid',
          client_reference_id: `agenticgraph:stripe:create:${record.clientIntentKey}`,
        }), { status: 200 })
      }
      return new Response(JSON.stringify({ id: 're_test_one' }), {
        status: 200,
        headers: { 'request-id': 'req_refund' },
      })
    },
  })
  const paid = {
    ...record,
    state: 'paid' as const,
    providerObjectId: 'cs_test_paid',
    terminalAt: '2026-07-29T00:01:00.000Z',
  }
  const refund = await refundAdapter.refund(paid)
  assert.equal(refund.ok, true)
  assert.equal(refund.refundReference, 're_test_one')
  assert.equal(operations.length, 2)
})

test('Stripe never refunds a no-payment session or accepts a missing refund identity', async () => {
  let noPaymentCalls = 0
  const noPaymentAdapter = createStripePaymentRailAdapter({
    env: stripeEnvironment,
    requestOrigin: 'https://app.example',
    async fetch() {
      noPaymentCalls += 1
      return new Response()
    },
  })
  const notApplicable = await noPaymentAdapter.refund({
    ...record,
    state: 'no_payment_required',
    providerObjectId: 'cs_test_no_payment',
    terminalAt: '2026-07-29T00:01:00.000Z',
  })
  assert.equal(notApplicable.ok, false)
  assert.equal(notApplicable.code, 'refund_not_applicable')
  assert.equal(noPaymentCalls, 0)

  const missingRefundId = createStripePaymentRailAdapter({
    env: stripeEnvironment,
    requestOrigin: 'https://app.example',
    async fetch(input) {
      if (String(input).includes('/checkout/sessions/')) {
        return new Response(JSON.stringify({
          id: 'cs_test_paid',
          status: 'complete',
          payment_status: 'paid',
          amount_total: 1200,
          currency: 'sgd',
          payment_intent: 'pi_test_paid',
          client_reference_id: `agenticgraph:stripe:create:${record.clientIntentKey}`,
        }), { status: 200 })
      }
      return new Response(JSON.stringify({ object: 'refund' }), { status: 200 })
    },
  })
  const unknown = await missingRefundId.refund({
    ...record,
    state: 'paid',
    providerObjectId: 'cs_test_paid',
    terminalAt: '2026-07-29T00:01:00.000Z',
  })
  assert.equal(unknown.ok, false)
  assert.equal(unknown.code, 'provider_outcome_unknown')
})

test('StraitsX uses the exact dynamic PayNow JSON:API contract and minimizes instructions', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const instruction = {
    id: 'paynow_sandbox_one',
    type: 'paynow',
    virtualPaymentAddress: null,
    base64EncodedImage: 'cXItY29kZQ==',
    qrCodeData: null,
    referenceId: 'reference-from-provider',
    externalReference: 'external-reference',
    expiresAt: '2026-08-27T00:00:00.000Z',
  }
  const adapter = createStraitsxPaymentRailAdapter({
    env: straitsxEnvironment,
    async fetch(input, init) {
      requests.push({ url: String(input), init })
      return new Response(JSON.stringify({
        data: {
          id: 'contract_sandbox_one',
          type: 'payment',
          attributes: {
            status: 'pending',
            currency: 'SGD',
            amount: '12.01',
            referenceId: `agenticgraph:straitsx:create:${record.clientIntentKey}`,
            senderInformation: {
              email: 'must-not-be-persisted@example.com',
            },
            paymentMethod: {
              ...instruction,
              providerOnlyInternalField: 'must-not-be-persisted',
            },
          },
        },
      }), {
        status: 200,
        headers: { 'x-request-id': 'sx_request_one' },
      })
    },
  })
  const result = await adapter.create({
    ...record,
    amountMinor: 1201,
    parameterFingerprint: '1201:sgd:fiat:buyer',
    rail: 'straitsx',
    selectionReason: 'sgd_fiat',
  })
  assert.equal(result.ok, true)
  assert.equal(result.providerObjectId, 'paynow_sandbox_one')
  assert.deepEqual(result.instruction, {
    kind: 'provider_instruction',
    value: instruction,
  })
  const requestBody = JSON.parse(String(requests[0].init?.body))
  assert.equal(
    requestBody.data.attributes.referenceId,
    `agenticgraph:straitsx:create:${record.clientIntentKey}`,
  )
  assert.equal(requestBody.data.attributes.amount, 12.01)
  assert.match(
    String(requests[0].init?.body),
    /"amount":12\.01/,
  )
  assert.equal(
    requestBody.data.attributes.expiresAt,
    '2026-08-27T00:00:00.000Z',
  )
  assert.deepEqual(
    Object.keys(requestBody.data.attributes).sort(),
    ['amount', 'expiresAt', 'referenceId'],
  )
  assert.equal(
    requests[0].url,
    `https://api-sandbox.straitsx.com${STRAITSX_DYNAMIC_PAYNOW_CREATE_PATH}`,
  )
  assert.equal(
    new Headers(requests[0].init?.headers).get(STRAITSX_HEADER_NAMES.apiKey),
    'straitsx-sandbox-key',
  )
})

test('StraitsX rejects an XSGD-denominated provider result for an SGD fiat intent', async () => {
  const adapter = createStraitsxPaymentRailAdapter({
    env: straitsxEnvironment,
    async fetch() {
      return new Response(JSON.stringify({
        data: {
          id: 'contract_sandbox_xsgd',
          type: 'payment',
          attributes: {
            status: 'pending',
            currency: 'XSGD',
            amount: '12.00',
            referenceId: `agenticgraph:straitsx:create:${record.clientIntentKey}`,
            paymentMethod: {
              id: 'paynow_sandbox_xsgd',
              type: 'paynow',
              qrCodeData: '000201010212',
            },
          },
        },
      }), { status: 200 })
    },
  })
  const result = await adapter.create({
    ...record,
    rail: 'straitsx',
    selectionReason: 'sgd_fiat',
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'provider_outcome_unknown')
  assert.equal(result.providerObjectId, 'paynow_sandbox_xsgd')
  assert.equal(result.instruction?.kind, 'provider_instruction')
})

test('StraitsX authoritative reads use the PayNow ID and parse major units exactly', async () => {
  const requests: string[] = []
  const adapter = createStraitsxPaymentRailAdapter({
    env: straitsxEnvironment,
    async fetch(input) {
      requests.push(String(input))
      return new Response(JSON.stringify({
        data: {
          id: 'contract_sandbox_one',
          type: 'payment',
          attributes: {
            status: 'completed',
            currency: 'SGD',
            amount: '12.00',
            referenceId: `agenticgraph:straitsx:create:${record.clientIntentKey}`,
            paymentMethod: {
              id: 'paynow_sandbox_one',
              type: 'paynow',
              qrCodeData: '000201010212',
            },
          },
        },
      }), {
        status: 200,
        headers: { 'x-request-id': 'sx_request_read' },
      })
    },
  })
  const result = await adapter.read({
    ...record,
    rail: 'straitsx',
    selectionReason: 'sgd_fiat',
    providerObjectId: 'paynow_sandbox_one',
  })
  assert.equal(result.ok, true)
  assert.equal(result.amountMinor, 1200)
  assert.equal(result.state, 'paid')
  assert.equal(
    result.clientIntentReference,
    `agenticgraph:straitsx:create:${record.clientIntentKey}`,
  )
  assert.deepEqual(requests, [
    'https://api-sandbox.straitsx.com/v1/payments/paynow/paynow_sandbox_one',
  ])
})

test('StraitsX XSGD and refund remain zero-call until their contracts are bound', async () => {
  let providerCalls = 0
  const adapter = createStraitsxPaymentRailAdapter({
    env: straitsxEnvironment,
    async fetch() {
      providerCalls += 1
      return new Response()
    },
  })
  const xsgd = await adapter.create({
    ...record,
    rail: 'straitsx',
    selectionReason: 'xsgd',
    settlementAsset: 'xsgd',
  })
  assert.equal(xsgd.ok, false)
  assert.equal(xsgd.code, 'capability_unavailable')
  const refund = await adapter.refund({
    ...record,
    rail: 'straitsx',
    state: 'paid',
    providerObjectId: 'payment_sandbox_one',
  })
  assert.equal(refund.ok, false)
  assert.equal(refund.code, 'provider_operation_unverified')
  assert.equal(providerCalls, 0)
})

test('StraitsX unbound contracts fail before egress with a precise capability code', async () => {
  let providerCalls = 0
  const cases = [
    [{ ...straitsxEnvironment, [STRAITSX_ENV_KEYS.paymentCreatePath]: '/v1/payments' }, 'capability_unavailable'],
    [{ ...straitsxEnvironment, [STRAITSX_ENV_KEYS.integrationModel]: 'unapproved_model' }, 'integration_model_unsupported'],
    [{ ...straitsxEnvironment, [STRAITSX_ENV_KEYS.fundFlow]: 'customer_third_party_collection' }, 'integration_model_unsupported'],
  ] as const
  for (const [env, expectedCode] of cases) {
    const adapter = createStraitsxPaymentRailAdapter({
      env,
      async fetch() {
        providerCalls += 1
        return new Response()
      },
    })
    const result = await adapter.create({
      ...record,
      rail: 'straitsx',
      selectionReason: 'sgd_fiat',
    })
    assert.equal(result.ok, false)
    assert.equal(result.code, expectedCode)
    assert.deepEqual(result.calls, [])
  }
  assert.equal(providerCalls, 0)
})

test('StraitsX signing failures report zero provider calls before egress', async () => {
  let providerCalls = 0
  const adapter = createStraitsxPaymentRailAdapter({
    env: {
      ...straitsxEnvironment,
      [STRAITSX_ENV_KEYS.authMode]: 'http_request_signing',
      [STRAITSX_ENV_KEYS.sandboxPublicKeyId]: 'key_sandbox_invalid',
      [STRAITSX_ENV_KEYS.sandboxSigningPrivateKey]: '***invalid-pkcs8***',
    },
    async fetch() {
      providerCalls += 1
      return new Response()
    },
  })
  const created = await adapter.create({
    ...record,
    rail: 'straitsx',
    selectionReason: 'sgd_fiat',
  })
  const read = await adapter.read({
    ...record,
    rail: 'straitsx',
    selectionReason: 'sgd_fiat',
    providerObjectId: 'paynow_sandbox_one',
  })
  for (const result of [created, read]) {
    assert.equal(result.ok, false)
    assert.equal(result.code, 'capability_unavailable')
    assert.deepEqual(result.calls, [])
  }
  assert.equal(providerCalls, 0)
})

test('StraitsX errors preserve a bounded reason while redacting personal data', async () => {
  const adapter = createStraitsxPaymentRailAdapter({
    env: straitsxEnvironment,
    async fetch() {
      return new Response(JSON.stringify({
        errors: [{
          type: 'validation_error',
          code: 'STXE-4220',
          detail: 'Blocked for buyer@example.com on account 1234567890',
        }],
      }), {
        status: 422,
        headers: { 'x-request-id': 'sx_request_error' },
      })
    },
  })
  const result = await adapter.create({
    ...record,
    rail: 'straitsx',
    selectionReason: 'sgd_fiat',
  })
  assert.equal(result.ok, false)
  assert.equal(result.error?.providerType, 'validation_error')
  assert.equal(result.error?.providerCode, 'STXE-4220')
  assert.equal(result.error?.httpStatus, 422)
  assert.equal(result.error?.requestId, 'sx_request_error')
  assert.equal(
    result.error?.providerReason,
    'Blocked for [redacted] on account [redacted]',
  )
  assert.doesNotMatch(JSON.stringify(result.error), /buyer@example|1234567890/)
})
