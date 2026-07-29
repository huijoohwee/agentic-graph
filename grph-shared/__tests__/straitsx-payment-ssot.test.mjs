import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildStraitsxAuthenticationHeaders,
  resolveStraitsxRuntimeConfig,
  STRAITSX_AUTH_MODES,
  STRAITSX_ENV_KEYS,
  STRAITSX_FUND_FLOWS,
  STRAITSX_HEADER_NAMES,
  STRAITSX_INTEGRATION_MODELS,
  STRAITSX_PAYMENT_METHODS,
  STRAITSX_PAYMENT_SECRET_ENV_NAMES,
  STRAITSX_SANDBOX_BASE_URL,
  STRAITSX_SANDBOX_CONNECTIVITY_PROBE_URL,
  validateStraitsxFundFlow,
} from '../dist/payments/straitsxPaymentSsot.js'

test('StraitsX SSOT enables only resolved sandbox API-key configuration', () => {
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
      [STRAITSX_ENV_KEYS.enabled]: 'true',
      [STRAITSX_ENV_KEYS.mode]: 'sandbox',
    }),
    { ok: false, enabled: true, error: 'integration_model_unresolved' },
  )
  assert.deepEqual(
    resolveStraitsxRuntimeConfig({
      [STRAITSX_ENV_KEYS.enabled]: 'true',
      [STRAITSX_ENV_KEYS.mode]: 'sandbox',
      [STRAITSX_ENV_KEYS.integrationModel]: 'regular_transfer',
      [STRAITSX_ENV_KEYS.paymentMethod]: 'dynamic_paynow',
      [STRAITSX_ENV_KEYS.authMode]: 'api_key',
    }),
    { ok: false, enabled: true, error: 'credential_missing' },
  )
  assert.deepEqual(
    resolveStraitsxRuntimeConfig({
      [STRAITSX_ENV_KEYS.enabled]: 'true',
      [STRAITSX_ENV_KEYS.mode]: 'live',
      [STRAITSX_ENV_KEYS.apiKey]: 'must-never-appear-in-errors',
    }),
    { ok: false, enabled: true, error: 'mode_mismatch' },
  )
  const resolved = resolveStraitsxRuntimeConfig({
    [STRAITSX_ENV_KEYS.enabled]: 'true',
    [STRAITSX_ENV_KEYS.mode]: 'sandbox',
    [STRAITSX_ENV_KEYS.integrationModel]: 'regular_transfer',
    [STRAITSX_ENV_KEYS.paymentMethod]: 'dynamic_paynow',
    [STRAITSX_ENV_KEYS.authMode]: 'api_key',
    [STRAITSX_ENV_KEYS.apiKey]: 'sandbox-secret',
  })
  assert.deepEqual(resolved, {
    ok: true,
    enabled: true,
    mode: 'sandbox',
    baseUrl: STRAITSX_SANDBOX_BASE_URL,
    integrationModel: 'regular_transfer',
    paymentMethod: 'dynamic_paynow',
    authMode: 'api_key',
  })
  assert.equal(Object.isFrozen(resolved), true)
  assert.throws(() => {
    resolved.baseUrl = 'https://api.straitsx.com/v1'
  }, TypeError)
  assert.deepEqual(
    resolveStraitsxRuntimeConfig({
      [STRAITSX_ENV_KEYS.enabled]: 'true',
      [STRAITSX_ENV_KEYS.mode]: 'sandbox',
      [STRAITSX_ENV_KEYS.integrationModel]: 'regular_transfer',
      [STRAITSX_ENV_KEYS.paymentMethod]: 'dynamic_paynow',
      [STRAITSX_ENV_KEYS.authMode]: 'http_request_signing',
      [STRAITSX_ENV_KEYS.apiKey]: 'sandbox-secret',
    }),
    { ok: false, enabled: true, error: 'signed_mode_blocked' },
  )
  const authentication = buildStraitsxAuthenticationHeaders({
    [STRAITSX_ENV_KEYS.apiKey]: 'sandbox-secret',
    [STRAITSX_ENV_KEYS.authMode]: 'api_key',
    [STRAITSX_ENV_KEYS.enabled]: 'true',
    [STRAITSX_ENV_KEYS.mode]: 'sandbox',
    [STRAITSX_ENV_KEYS.integrationModel]: 'regular_transfer',
    [STRAITSX_ENV_KEYS.paymentMethod]: 'dynamic_paynow',
  })
  assert.deepEqual(authentication, {
    ok: true,
    headers: { [STRAITSX_HEADER_NAMES.apiKey]: 'sandbox-secret' },
  })
  assert.equal(Object.isFrozen(authentication), true)
  assert.equal(Object.isFrozen(authentication.headers), true)
  assert.throws(() => {
    delete authentication.headers[STRAITSX_HEADER_NAMES.apiKey]
  }, TypeError)
  assert.deepEqual(
    buildStraitsxAuthenticationHeaders({
      [STRAITSX_ENV_KEYS.apiKey]: 'sandbox-secret',
      [STRAITSX_ENV_KEYS.authMode]: 'http_request_signing',
      [STRAITSX_ENV_KEYS.enabled]: 'true',
      [STRAITSX_ENV_KEYS.mode]: 'sandbox',
      [STRAITSX_ENV_KEYS.integrationModel]: 'regular_transfer',
      [STRAITSX_ENV_KEYS.paymentMethod]: 'dynamic_paynow',
    }),
    { ok: false, error: 'signed_mode_blocked', headers: {} },
  )
  assert.deepEqual(
    validateStraitsxFundFlow('regular_transfer', 'own_account_collection'),
    { ok: true },
  )
  assert.deepEqual(
    validateStraitsxFundFlow('regular_transfer', 'customer_third_party_collection'),
    { ok: false, error: 'integration_model_unsupported' },
  )
})

test('StraitsX SSOT allowlists and maps are immutable at runtime', () => {
  const frozenCollections = [
    STRAITSX_INTEGRATION_MODELS,
    STRAITSX_PAYMENT_METHODS,
    STRAITSX_AUTH_MODES,
    STRAITSX_FUND_FLOWS,
    STRAITSX_PAYMENT_SECRET_ENV_NAMES,
    STRAITSX_ENV_KEYS,
    STRAITSX_HEADER_NAMES,
  ]
  frozenCollections.forEach(collection => assert.equal(Object.isFrozen(collection), true))
  assert.throws(() => STRAITSX_AUTH_MODES.push('bypass'), TypeError)
  assert.throws(() => {
    STRAITSX_ENV_KEYS.mode = 'BYPASS_MODE'
  }, TypeError)
  assert.deepEqual(resolveStraitsxRuntimeConfig({}), {
    ok: false,
    enabled: false,
    error: 'straitsx_disabled',
  })
})
