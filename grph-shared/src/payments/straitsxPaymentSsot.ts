export const STRAITSX_SANDBOX_BASE_URL = 'https://api-sandbox.straitsx.com/v1'
export const STRAITSX_CONNECTIVITY_PROBE_PATH = '/authorize/hello'
export const STRAITSX_SANDBOX_CONNECTIVITY_PROBE_URL =
  `${STRAITSX_SANDBOX_BASE_URL}${STRAITSX_CONNECTIVITY_PROBE_PATH}`

export const STRAITSX_INTEGRATION_MODELS = Object.freeze([
  'regular_transfer',
  'first_party_transfer',
  'third_party_transfer',
] as const)
export const STRAITSX_PAYMENT_METHODS = Object.freeze([
  'dynamic_paynow',
  'virtual_bank_account',
] as const)
export const STRAITSX_AUTH_MODES = Object.freeze([
  'api_key',
  'http_request_signing',
] as const)
export const STRAITSX_FUND_FLOWS = Object.freeze([
  'own_account_collection',
  'customer_own_account_collection',
  'customer_third_party_collection',
] as const)

export const STRAITSX_ENV_KEYS = Object.freeze({
  enabled: 'STRAITSX_ENABLED',
  mode: 'STRAITSX_MODE',
  integrationModel: 'STRAITSX_INTEGRATION_MODEL',
  paymentMethod: 'STRAITSX_PAYMENT_METHOD',
  authMode: 'STRAITSX_AUTHENTICATION_MODE',
  apiKey: 'STRAITSX_APP_API_KEY',
  publicKeyId: 'STRAITSX_PUBLIC_KEY_ID',
  signingPrivateKey: 'STRAITSX_REQUEST_SIGNING_PRIVATE_KEY',
} as const)

export const STRAITSX_HEADER_NAMES = Object.freeze({
  apiKey: 'X-XFERS-APP-API-KEY',
  publicKeyId: 'X-PUBLIC-KEY-ID',
  timestamp: 'X-TIMESTAMP',
  nonce: 'X-NONCE',
  signature: 'X-SIGNATURE',
} as const)

export const STRAITSX_PAYMENT_SECRET_ENV_NAMES = Object.freeze([
  STRAITSX_ENV_KEYS.apiKey,
  STRAITSX_ENV_KEYS.signingPrivateKey,
] as const)

export type StraitsxEnvLike = Readonly<Record<string, unknown>>
export type StraitsxIntegrationModel = typeof STRAITSX_INTEGRATION_MODELS[number]
export type StraitsxPaymentMethod = typeof STRAITSX_PAYMENT_METHODS[number]
export type StraitsxAuthMode = typeof STRAITSX_AUTH_MODES[number]
export type StraitsxFundFlow = typeof STRAITSX_FUND_FLOWS[number]

export type StraitsxRuntimeConfig =
  | Readonly<{
      ok: true
      enabled: true
      mode: 'sandbox'
      baseUrl: typeof STRAITSX_SANDBOX_BASE_URL
      integrationModel: StraitsxIntegrationModel
      paymentMethod: StraitsxPaymentMethod
      authMode: 'api_key'
    }>
  | Readonly<{
      ok: false
      enabled: boolean
      error:
        | 'straitsx_disabled'
        | 'mode_mismatch'
        | 'integration_model_unresolved'
        | 'payment_method_unresolved'
        | 'authentication_mode_invalid'
        | 'credential_missing'
        | 'signed_mode_blocked'
    }>

const readEnvString = (env: StraitsxEnvLike, key: string): string =>
  String(env[key] || '').trim().toLowerCase()

const readBoolean = (env: StraitsxEnvLike, key: string, fallback: boolean): boolean => {
  const value = readEnvString(env, key)
  if (!value) return fallback
  return value === 'true'
}

export function resolveStraitsxRuntimeConfig(env: StraitsxEnvLike): StraitsxRuntimeConfig {
  const enabled = readBoolean(env, STRAITSX_ENV_KEYS.enabled, false)
  if (!enabled) {
    return Object.freeze({ ok: false, enabled: false, error: 'straitsx_disabled' })
  }
  if (readEnvString(env, STRAITSX_ENV_KEYS.mode) !== 'sandbox') {
    return Object.freeze({ ok: false, enabled: true, error: 'mode_mismatch' })
  }
  const integrationModel = readEnvString(env, STRAITSX_ENV_KEYS.integrationModel)
  if (!STRAITSX_INTEGRATION_MODELS.includes(integrationModel as StraitsxIntegrationModel)) {
    return Object.freeze({ ok: false, enabled: true, error: 'integration_model_unresolved' })
  }
  const paymentMethod = readEnvString(env, STRAITSX_ENV_KEYS.paymentMethod)
  if (!STRAITSX_PAYMENT_METHODS.includes(paymentMethod as StraitsxPaymentMethod)) {
    return Object.freeze({ ok: false, enabled: true, error: 'payment_method_unresolved' })
  }
  const authMode = readEnvString(env, STRAITSX_ENV_KEYS.authMode)
  if (!STRAITSX_AUTH_MODES.includes(authMode as StraitsxAuthMode)) {
    return Object.freeze({ ok: false, enabled: true, error: 'authentication_mode_invalid' })
  }
  if (!String(env[STRAITSX_ENV_KEYS.apiKey] || '').trim()) {
    return Object.freeze({ ok: false, enabled: true, error: 'credential_missing' })
  }
  if (authMode === 'http_request_signing') {
    return Object.freeze({ ok: false, enabled: true, error: 'signed_mode_blocked' })
  }
  return Object.freeze({
    ok: true,
    enabled: true,
    mode: 'sandbox',
    baseUrl: STRAITSX_SANDBOX_BASE_URL,
    integrationModel: integrationModel as StraitsxIntegrationModel,
    paymentMethod: paymentMethod as StraitsxPaymentMethod,
    authMode: 'api_key',
  })
}

export type StraitsxAuthenticationHeadersResult =
  | Readonly<{
      ok: true
      headers: Readonly<Record<typeof STRAITSX_HEADER_NAMES.apiKey, string>>
    }>
  | Readonly<{
      ok: false
      error: Exclude<StraitsxRuntimeConfig, { ok: true }>['error']
      headers: Readonly<Record<string, never>>
    }>

const EMPTY_STRAITSX_AUTHENTICATION_HEADERS = Object.freeze(
  {},
) as Readonly<Record<string, never>>

export function buildStraitsxAuthenticationHeaders(
  env: StraitsxEnvLike,
): StraitsxAuthenticationHeadersResult {
  const config = resolveStraitsxRuntimeConfig(env)
  if (!config.ok) {
    return Object.freeze({
      ok: false,
      error: config.error,
      headers: EMPTY_STRAITSX_AUTHENTICATION_HEADERS,
    })
  }
  const apiKey = String(env[STRAITSX_ENV_KEYS.apiKey] || '').trim()
  return Object.freeze({
    ok: true,
    headers: Object.freeze({ [STRAITSX_HEADER_NAMES.apiKey]: apiKey }),
  })
}

const STRAITSX_FUND_FLOW_BY_MODEL: Readonly<
  Record<StraitsxIntegrationModel, StraitsxFundFlow>
> = Object.freeze({
  regular_transfer: 'own_account_collection',
  first_party_transfer: 'customer_own_account_collection',
  third_party_transfer: 'customer_third_party_collection',
})

export function validateStraitsxFundFlow(
  integrationModel: StraitsxIntegrationModel,
  fundFlow: StraitsxFundFlow,
): { ok: true } | { ok: false; error: 'integration_model_unsupported' } {
  return STRAITSX_FUND_FLOW_BY_MODEL[integrationModel] === fundFlow
    ? { ok: true }
    : { ok: false, error: 'integration_model_unsupported' }
}
