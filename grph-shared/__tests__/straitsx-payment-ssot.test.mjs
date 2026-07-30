import assert from 'node:assert/strict'
import { createHmac, webcrypto } from 'node:crypto'
import test from 'node:test'

import {
  buildStraitsxAuthenticationHeaders,
  buildStraitsxCanonicalRequest,
  isAllowedStraitsxCallbackSource,
  resolveStraitsxRuntimeConfig,
  STRAITSX_AUTH_MODES,
  STRAITSX_CALLBACK_SOURCE_ADDRESSES,
  STRAITSX_DYNAMIC_PAYNOW_CREATE_PATH,
  STRAITSX_DYNAMIC_PAYNOW_READ_PATH_TEMPLATE,
  STRAITSX_ENV_KEYS,
  STRAITSX_FUND_FLOWS,
  STRAITSX_HEADER_NAMES,
  STRAITSX_INTEGRATION_MODELS,
  STRAITSX_PAYMENT_METHODS,
  STRAITSX_PAYMENT_SECRET_ENV_NAMES,
  STRAITSX_SANDBOX_BASE_URL,
  STRAITSX_SANDBOX_CONNECTIVITY_PROBE_URL,
  validateStraitsxFundFlow,
  verifyStraitsxCallbackSignature,
} from '../dist/payments/straitsxPaymentSsot.js'

const baseEnvironment = {
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
  [STRAITSX_ENV_KEYS.sandboxApiKey]: 'sandbox-secret',
  [STRAITSX_ENV_KEYS.sandboxCallbackSecret]: 'callback-secret',
}

test('StraitsX configuration is sandbox-only, grant-bound, and callback-ready', () => {
  assert.equal(
    STRAITSX_SANDBOX_CONNECTIVITY_PROBE_URL,
    'https://api-sandbox.straitsx.com/v1/authorize/hello',
  )
  assert.deepEqual(resolveStraitsxRuntimeConfig({}), {
    ok: false,
    enabled: false,
    error: 'straitsx_disabled',
  })
  assert.deepEqual(
    resolveStraitsxRuntimeConfig({
      ...baseEnvironment,
      [STRAITSX_ENV_KEYS.mode]: 'live',
      [STRAITSX_ENV_KEYS.sandboxApiKey]: 'must-never-appear-in-errors',
    }),
    { ok: false, enabled: true, error: 'mode_mismatch' },
  )
  assert.deepEqual(
    resolveStraitsxRuntimeConfig({
      ...baseEnvironment,
      [STRAITSX_ENV_KEYS.fundFlow]: '',
    }),
    { ok: false, enabled: true, error: 'fund_flow_unresolved' },
  )
  assert.deepEqual(
    resolveStraitsxRuntimeConfig({
      ...baseEnvironment,
      [STRAITSX_ENV_KEYS.fundFlow]: 'customer_third_party_collection',
    }),
    { ok: false, enabled: true, error: 'integration_model_unsupported' },
  )
  assert.deepEqual(
    resolveStraitsxRuntimeConfig({
      ...baseEnvironment,
      [STRAITSX_ENV_KEYS.grantedProducts]: '',
    }),
    { ok: false, enabled: true, error: 'product_grant_missing' },
  )
  assert.deepEqual(
    resolveStraitsxRuntimeConfig({
      ...baseEnvironment,
      [STRAITSX_ENV_KEYS.paymentCreatePath]: '',
    }),
    { ok: false, enabled: true, error: 'provider_contract_unbound' },
  )
  const resolved = resolveStraitsxRuntimeConfig(baseEnvironment)
  assert.deepEqual(resolved, {
    ok: true,
    enabled: true,
    mode: 'sandbox',
    baseUrl: STRAITSX_SANDBOX_BASE_URL,
    integrationModel: 'regular_transfer',
    fundFlow: 'own_account_collection',
    paymentMethod: 'dynamic_paynow',
    grantedProducts: ['dynamic_paynow'],
    paymentCreatePath: STRAITSX_DYNAMIC_PAYNOW_CREATE_PATH,
    paymentReadPathTemplate: STRAITSX_DYNAMIC_PAYNOW_READ_PATH_TEMPLATE,
    authMode: 'api_key',
  })
  assert.equal(Object.isFrozen(resolved), true)
})

test('every StraitsX request carries the API key and signed mode emits verifiable headers', async () => {
  const apiKeyAuthentication = await buildStraitsxAuthenticationHeaders(baseEnvironment)
  assert.deepEqual(apiKeyAuthentication, {
    ok: true,
    headers: { [STRAITSX_HEADER_NAMES.apiKey]: 'sandbox-secret' },
    canonicalRequest: null,
  })

  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify'],
  )
  const privateKey = Buffer.from(
    await webcrypto.subtle.exportKey('pkcs8', keyPair.privateKey),
  ).toString('base64')
  const signedEnvironment = {
    ...baseEnvironment,
    [STRAITSX_ENV_KEYS.authMode]: 'http_request_signing',
    [STRAITSX_ENV_KEYS.sandboxPublicKeyId]: 'key_sandbox_1',
    [STRAITSX_ENV_KEYS.sandboxSigningPrivateKey]: privateKey,
  }
  const request = {
    method: 'POST',
    path: STRAITSX_DYNAMIC_PAYNOW_CREATE_PATH,
    query: 'z=last&a=first',
    body: '{"amount":100}',
    timestampMs: 1_800_000_000_000,
    nonce: '019fac4b-2bfc-7363-9fea-dcab0282cfe8',
  }
  const authentication = await buildStraitsxAuthenticationHeaders(
    signedEnvironment,
    request,
  )
  assert.equal(authentication.ok, true)
  assert.equal(
    authentication.canonicalRequest,
    'POST\n/v1/payments/paynow\na=first&z=last\n1800000000\n019fac4b-2bfc-7363-9fea-dcab0282cfe8\n{"amount":100}',
  )
  assert.equal(authentication.headers[STRAITSX_HEADER_NAMES.apiKey], 'sandbox-secret')
  assert.equal(authentication.headers[STRAITSX_HEADER_NAMES.publicKeyId], 'key_sandbox_1')
  assert.equal(authentication.headers[STRAITSX_HEADER_NAMES.timestamp], '1800000000')
  assert.equal(authentication.headers[STRAITSX_HEADER_NAMES.nonce], request.nonce)
  const verified = await webcrypto.subtle.verify(
    { name: 'Ed25519' },
    keyPair.publicKey,
    Buffer.from(authentication.headers[STRAITSX_HEADER_NAMES.signature], 'base64'),
    new TextEncoder().encode(authentication.canonicalRequest),
  )
  assert.equal(verified, true)
  assert.equal(
    buildStraitsxCanonicalRequest({
      method: 'GET',
      path: '/v1/payments/paynow/p_1',
      query: undefined,
      timestamp: '1800000000',
      nonce: request.nonce,
      body: '',
    }),
    `GET\n/v1/payments/paynow/p_1\n\n1800000000\n${request.nonce}\n`,
  )
  assert.equal(
    buildStraitsxCanonicalRequest({
      method: 'GET',
      path: '/v1/payments/paynow/p_1',
      query: '?z=two+words&a=/raw&a=%2f&a=%2F',
      timestamp: '1800000000',
      nonce: request.nonce,
      body: '',
    }),
    `GET\n/v1/payments/paynow/p_1\na=%2F&a=%2f&a=/raw&z=two+words\n1800000000\n${request.nonce}\n`,
  )
})

test('StraitsX callbacks require exact-body HMAC and an allowlisted source', async () => {
  const rawBody = '{"id":"evt_1","status":"completed"}'
  const signature = createHmac('sha256', 'callback-secret')
    .update(rawBody)
    .digest('hex')
  assert.equal(await verifyStraitsxCallbackSignature({
    rawBody,
    signature,
    secret: 'callback-secret',
  }), true)
  assert.equal(await verifyStraitsxCallbackSignature({
    rawBody: `${rawBody}\n`,
    signature,
    secret: 'callback-secret',
  }), false)
  assert.equal(isAllowedStraitsxCallbackSource(STRAITSX_CALLBACK_SOURCE_ADDRESSES[0]), true)
  assert.equal(isAllowedStraitsxCallbackSource('203.0.113.10'), false)
})

test('StraitsX fund-flow and configuration collections stay immutable', () => {
  assert.deepEqual(
    validateStraitsxFundFlow('regular_transfer', 'own_account_collection'),
    { ok: true },
  )
  assert.deepEqual(
    validateStraitsxFundFlow('regular_transfer', 'customer_third_party_collection'),
    { ok: false, error: 'integration_model_unsupported' },
  )
  const frozenCollections = [
    STRAITSX_INTEGRATION_MODELS,
    STRAITSX_PAYMENT_METHODS,
    STRAITSX_AUTH_MODES,
    STRAITSX_FUND_FLOWS,
    STRAITSX_PAYMENT_SECRET_ENV_NAMES,
    STRAITSX_ENV_KEYS,
    STRAITSX_HEADER_NAMES,
    STRAITSX_CALLBACK_SOURCE_ADDRESSES,
  ]
  frozenCollections.forEach(collection => assert.equal(Object.isFrozen(collection), true))
  assert.throws(() => STRAITSX_AUTH_MODES.push('bypass'), TypeError)
})
