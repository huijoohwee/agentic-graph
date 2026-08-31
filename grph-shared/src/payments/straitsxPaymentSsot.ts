export const STRAITSX_SANDBOX_BASE_URL = 'https://api-sandbox.straitsx.com'
export const STRAITSX_LIVE_BASE_URL = 'https://api.straitsx.com'
export const STRAITSX_CONNECTIVITY_PROBE_PATH = '/v1/authorize/hello'
export const STRAITSX_DYNAMIC_PAYNOW_CREATE_PATH = '/v1/payments/paynow'
export const STRAITSX_DYNAMIC_PAYNOW_READ_PATH_TEMPLATE =
  '/v1/payments/paynow/{paymentId}'
export const STRAITSX_SANDBOX_CONNECTIVITY_PROBE_URL =
  `${STRAITSX_SANDBOX_BASE_URL}${STRAITSX_CONNECTIVITY_PROBE_PATH}`
export const STRAITSX_SIGNING_CLOCK_TOLERANCE_SECONDS = 300
export const STRAITSX_CALLBACK_SOURCE_ADDRESSES = Object.freeze([
  '52.221.59.197',
  '52.77.136.252',
] as const)

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
  fundFlow: 'STRAITSX_FUND_FLOW',
  paymentMethod: 'STRAITSX_PAYMENT_METHOD',
  grantedProducts: 'STRAITSX_GRANTED_PRODUCTS',
  paymentCreatePath: 'STRAITSX_PAYMENT_CREATE_PATH',
  paymentReadPathTemplate: 'STRAITSX_PAYMENT_READ_PATH_TEMPLATE',
  authMode: 'STRAITSX_AUTHENTICATION_MODE',
  sandboxApiKey: 'STRAITSX_SANDBOX_APP_API_KEY',
  sandboxPublicKeyId: 'STRAITSX_SANDBOX_PUBLIC_KEY_ID',
  sandboxSigningPrivateKey: 'STRAITSX_SANDBOX_REQUEST_SIGNING_PRIVATE_KEY',
  sandboxCallbackSecret: 'STRAITSX_SANDBOX_CALLBACK_SIGNING_SECRET',
} as const)

export const STRAITSX_HEADER_NAMES = Object.freeze({
  apiKey: 'X-XFERS-APP-API-KEY',
  publicKeyId: 'X-PUBLIC-KEY-ID',
  timestamp: 'X-TIMESTAMP',
  nonce: 'X-NONCE',
  signature: 'X-SIGNATURE',
  callbackSignature: 'Xfers-Signature',
} as const)

export const STRAITSX_PAYMENT_SECRET_ENV_NAMES = Object.freeze([
  STRAITSX_ENV_KEYS.sandboxApiKey,
  STRAITSX_ENV_KEYS.sandboxSigningPrivateKey,
  STRAITSX_ENV_KEYS.sandboxCallbackSecret,
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
      fundFlow: StraitsxFundFlow
      paymentMethod: StraitsxPaymentMethod
      grantedProducts: readonly string[]
      paymentCreatePath: string
      paymentReadPathTemplate: string
      authMode: StraitsxAuthMode
    }>
  | Readonly<{
      ok: false
      enabled: boolean
      error:
        | 'straitsx_disabled'
        | 'mode_mismatch'
        | 'integration_model_unresolved'
        | 'fund_flow_unresolved'
        | 'integration_model_unsupported'
        | 'payment_method_unresolved'
        | 'product_grant_missing'
        | 'provider_contract_unbound'
        | 'authentication_mode_invalid'
        | 'credential_missing'
        | 'signing_credential_missing'
        | 'callback_verification_unconfigured'
    }>

export type StraitsxSignedRequest = Readonly<{
  method: string
  path: string
  query?: string | URLSearchParams
  body?: string
  timestampMs?: number
  nonce?: string
}>

export type StraitsxAuthenticationHeadersResult =
  | Readonly<{
      ok: true
      headers: Readonly<Record<string, string>>
      canonicalRequest: string | null
    }>
  | Readonly<{
      ok: false
      error: Exclude<StraitsxRuntimeConfig, { ok: true }>['error'] | 'signing_failed'
      headers: Readonly<Record<string, never>>
      canonicalRequest: null
    }>

const EMPTY_STRAITSX_HEADERS = Object.freeze({}) as Readonly<Record<string, never>>

const readEnvString = (env: StraitsxEnvLike, key: string): string =>
  String(env[key] || '').trim()

const readEnvToken = (env: StraitsxEnvLike, key: string): string =>
  readEnvString(env, key).toLowerCase()

const readBoolean = (env: StraitsxEnvLike, key: string, fallback: boolean): boolean => {
  const value = readEnvToken(env, key)
  if (!value) return fallback
  return value === 'true'
}

const readGrantedProducts = (env: StraitsxEnvLike): readonly string[] =>
  Object.freeze(readEnvString(env, STRAITSX_ENV_KEYS.grantedProducts)
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
    .sort())

export function resolveStraitsxRuntimeConfig(env: StraitsxEnvLike): StraitsxRuntimeConfig {
  const enabled = readBoolean(env, STRAITSX_ENV_KEYS.enabled, false)
  if (!enabled) {
    return Object.freeze({ ok: false, enabled: false, error: 'straitsx_disabled' })
  }
  if (readEnvToken(env, STRAITSX_ENV_KEYS.mode) !== 'sandbox') {
    return Object.freeze({ ok: false, enabled: true, error: 'mode_mismatch' })
  }
  const integrationModel = readEnvToken(env, STRAITSX_ENV_KEYS.integrationModel)
  if (!STRAITSX_INTEGRATION_MODELS.includes(integrationModel as StraitsxIntegrationModel)) {
    return Object.freeze({ ok: false, enabled: true, error: 'integration_model_unresolved' })
  }
  const fundFlow = readEnvToken(env, STRAITSX_ENV_KEYS.fundFlow)
  if (!STRAITSX_FUND_FLOWS.includes(fundFlow as StraitsxFundFlow)) {
    return Object.freeze({ ok: false, enabled: true, error: 'fund_flow_unresolved' })
  }
  if (validateStraitsxFundFlow(
    integrationModel as StraitsxIntegrationModel,
    fundFlow as StraitsxFundFlow,
  ).ok === false) {
    return Object.freeze({
      ok: false,
      enabled: true,
      error: 'integration_model_unsupported',
    })
  }
  const paymentMethod = readEnvToken(env, STRAITSX_ENV_KEYS.paymentMethod)
  if (!STRAITSX_PAYMENT_METHODS.includes(paymentMethod as StraitsxPaymentMethod)) {
    return Object.freeze({ ok: false, enabled: true, error: 'payment_method_unresolved' })
  }
  const grantedProducts = readGrantedProducts(env)
  if (!grantedProducts.includes(paymentMethod)) {
    return Object.freeze({ ok: false, enabled: true, error: 'product_grant_missing' })
  }
  const paymentCreatePath = readEnvString(env, STRAITSX_ENV_KEYS.paymentCreatePath)
  const paymentReadPathTemplate = readEnvString(env, STRAITSX_ENV_KEYS.paymentReadPathTemplate)
  if (
    paymentMethod !== 'dynamic_paynow'
    || paymentCreatePath !== STRAITSX_DYNAMIC_PAYNOW_CREATE_PATH
    || paymentReadPathTemplate !== STRAITSX_DYNAMIC_PAYNOW_READ_PATH_TEMPLATE
  ) {
    return Object.freeze({ ok: false, enabled: true, error: 'provider_contract_unbound' })
  }
  const authMode = readEnvToken(env, STRAITSX_ENV_KEYS.authMode)
  if (!STRAITSX_AUTH_MODES.includes(authMode as StraitsxAuthMode)) {
    return Object.freeze({ ok: false, enabled: true, error: 'authentication_mode_invalid' })
  }
  if (!readEnvString(env, STRAITSX_ENV_KEYS.sandboxApiKey)) {
    return Object.freeze({ ok: false, enabled: true, error: 'credential_missing' })
  }
  if (
    authMode === 'http_request_signing'
    && (
      !readEnvString(env, STRAITSX_ENV_KEYS.sandboxPublicKeyId)
      || !readEnvString(env, STRAITSX_ENV_KEYS.sandboxSigningPrivateKey)
    )
  ) {
    return Object.freeze({ ok: false, enabled: true, error: 'signing_credential_missing' })
  }
  if (!readEnvString(env, STRAITSX_ENV_KEYS.sandboxCallbackSecret)) {
    return Object.freeze({ ok: false, enabled: true, error: 'callback_verification_unconfigured' })
  }
  return Object.freeze({
    ok: true,
    enabled: true,
    mode: 'sandbox',
    baseUrl: STRAITSX_SANDBOX_BASE_URL,
    integrationModel: integrationModel as StraitsxIntegrationModel,
    fundFlow: fundFlow as StraitsxFundFlow,
    paymentMethod: paymentMethod as StraitsxPaymentMethod,
    grantedProducts,
    paymentCreatePath,
    paymentReadPathTemplate,
    authMode: authMode as StraitsxAuthMode,
  })
}

const normalizeMethod = (value: unknown): string =>
  String(value || '').trim().toUpperCase()

const normalizePath = (value: unknown): string => {
  const path = String(value || '').trim()
  if (!path.startsWith('/') || path.includes('?') || path.includes('#')) {
    throw new Error('StraitsX signing path must be an absolute path without query or fragment.')
  }
  return path
}

const canonicalizeQuery = (value: string | URLSearchParams | undefined): string => {
  const rawQuery = (
    value instanceof URLSearchParams
      ? value.toString()
      : String(value || '').replace(/^\?/, '')
  )
  return rawQuery ? rawQuery.split('&').sort().join('&') : ''
}

export const buildStraitsxCanonicalRequest = (args: Required<
  Pick<StraitsxSignedRequest, 'method' | 'path' | 'body' | 'nonce'>
> & { query: string | URLSearchParams | undefined; timestamp: string }): string => [
  normalizeMethod(args.method),
  normalizePath(args.path),
  canonicalizeQuery(args.query),
  args.timestamp,
  args.nonce,
  args.body,
].join('\n')

const decodeBase64 = (value: string): Uint8Array => {
  const binary = atob(value.replace(/\s+/g, ''))
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

const encodeBase64 = (value: ArrayBuffer): string => {
  let binary = ''
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const readPkcs8PrivateKey = (value: string): Uint8Array => {
  const normalized = value
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .trim()
  return decodeBase64(normalized)
}

const signCanonicalRequest = async (privateKey: string, canonicalRequest: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    new Uint8Array(readPkcs8PrivateKey(privateKey)),
    { name: 'Ed25519' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    { name: 'Ed25519' },
    key,
    new TextEncoder().encode(canonicalRequest),
  )
  return encodeBase64(signature)
}

export async function buildStraitsxAuthenticationHeaders(
  env: StraitsxEnvLike,
  request?: StraitsxSignedRequest,
): Promise<StraitsxAuthenticationHeadersResult> {
  const config = resolveStraitsxRuntimeConfig(env)
  if (config.ok === false) {
    return Object.freeze({
      ok: false,
      error: config.error,
      headers: EMPTY_STRAITSX_HEADERS,
      canonicalRequest: null,
    })
  }
  const headers: Record<string, string> = {
    [STRAITSX_HEADER_NAMES.apiKey]: readEnvString(env, STRAITSX_ENV_KEYS.sandboxApiKey),
  }
  if (config.authMode === 'api_key') {
    return Object.freeze({ ok: true, headers: Object.freeze(headers), canonicalRequest: null })
  }
  try {
    if (!request) throw new Error('Signed StraitsX requests require request components.')
    const timestamp = String(Math.floor((request.timestampMs ?? Date.now()) / 1000))
    const nonce = String(request.nonce || crypto.randomUUID()).trim()
    if (!PAYMENT_NONCE_PATTERN.test(nonce)) throw new Error('StraitsX nonce must be a UUID.')
    const canonicalRequest = buildStraitsxCanonicalRequest({
      method: request.method,
      path: request.path,
      query: request.query,
      timestamp,
      nonce,
      body: request.body || '',
    })
    headers[STRAITSX_HEADER_NAMES.publicKeyId] =
      readEnvString(env, STRAITSX_ENV_KEYS.sandboxPublicKeyId)
    headers[STRAITSX_HEADER_NAMES.timestamp] = timestamp
    headers[STRAITSX_HEADER_NAMES.nonce] = nonce
    headers[STRAITSX_HEADER_NAMES.signature] = await signCanonicalRequest(
      readEnvString(env, STRAITSX_ENV_KEYS.sandboxSigningPrivateKey),
      canonicalRequest,
    )
    return Object.freeze({
      ok: true,
      headers: Object.freeze(headers),
      canonicalRequest,
    })
  } catch {
    return Object.freeze({
      ok: false,
      error: 'signing_failed',
      headers: EMPTY_STRAITSX_HEADERS,
      canonicalRequest: null,
    })
  }
}

const PAYMENT_NONCE_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const timingSafeEqual = (left: string, right: string): boolean => {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

const hmacSha256Hex = async (secret: string, value: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value),
  )
  return [...new Uint8Array(signature)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

export const verifyStraitsxCallbackSignature = async (args: {
  rawBody: string
  signature: string
  secret: string
}): Promise<boolean> => {
  const expected = await hmacSha256Hex(args.secret, args.rawBody)
  const supplied = String(args.signature || '').trim().toLowerCase().replace(/^sha256=/, '')
  return timingSafeEqual(supplied, expected)
}

export const isAllowedStraitsxCallbackSource = (value: unknown): boolean =>
  STRAITSX_CALLBACK_SOURCE_ADDRESSES.includes(
    String(value || '').trim() as typeof STRAITSX_CALLBACK_SOURCE_ADDRESSES[number],
  )

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
