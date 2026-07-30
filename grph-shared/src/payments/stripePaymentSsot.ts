export const STRIPE_PAYMENT_REQUEST_API_VERSION = '2026-06-24.dahlia'
export const STRIPE_PAYMENT_WEBHOOK_API_VERSION = '2026-06-24.dahlia'

export const STRIPE_PAYMENT_ROUTE_PATHS = {
  checkoutSession: '/api/payments/stripe/checkout/session',
  webhook: '/api/payments/stripe/webhook',
} as const

export const STRIPE_PROJECTS_URL = 'https://projects.dev/'
export const STRIPE_PROJECTS_SKILL_URL = 'https://projects.dev/skill.md'
export const STRIPE_PROJECTS_DOCS_URL = 'https://docs.stripe.com/projects'

export const STRIPE_PAYMENT_ENV_KEYS = {
  runtimeMode: 'PAYMENT_STRIPE_MODE',
  runtimeRestrictedKey: 'PAYMENT_STRIPE_SANDBOX_RESTRICTED_KEY',
  mcpRestrictedKey: 'PAYMENT_STRIPE_MCP_SANDBOX_RESTRICTED_KEY',
  runtimeWebhookSecret: 'PAYMENT_STRIPE_SANDBOX_WEBHOOK_SECRET',
  restrictedKey: 'STRIPE_RESTRICTED_KEY',
  secretKey: 'STRIPE_SECRET_KEY',
  webhookSecret: 'STRIPE_WEBHOOK_SECRET',
  checkoutPriceId: 'STRIPE_CHECKOUT_PRICE_ID',
  checkoutCurrency: 'STRIPE_CHECKOUT_CURRENCY',
  checkoutUnitAmount: 'STRIPE_CHECKOUT_UNIT_AMOUNT',
  checkoutProductName: 'STRIPE_CHECKOUT_PRODUCT_NAME',
  checkoutMode: 'STRIPE_CHECKOUT_MODE',
  checkoutReturnOrigin: 'STRIPE_CHECKOUT_RETURN_ORIGIN',
} as const

export const STRIPE_PAYMENT_RUNTIME_SECRET_ENV_NAMES = [
  STRIPE_PAYMENT_ENV_KEYS.runtimeRestrictedKey,
  STRIPE_PAYMENT_ENV_KEYS.mcpRestrictedKey,
  STRIPE_PAYMENT_ENV_KEYS.runtimeWebhookSecret,
] as const

export const STRIPE_PAYMENT_SECRET_ENV_NAMES = [
  STRIPE_PAYMENT_ENV_KEYS.restrictedKey,
  STRIPE_PAYMENT_ENV_KEYS.secretKey,
  STRIPE_PAYMENT_ENV_KEYS.webhookSecret,
] as const

export const STRIPE_CHECKOUT_MAX_QUANTITY = 99
export const STRIPE_CHECKOUT_CLIENT_REFERENCE_ID_MAX_LENGTH = 200
export const STRIPE_CHECKOUT_METADATA_SOURCE = 'mainpanel-payments'
export const STRIPE_CHECKOUT_METADATA_WORKSPACE_ID = 'workspace_id'
export const STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID = 'acp_session_id'
export const STRIPE_CHECKOUT_METADATA_EXPECTED_AMOUNT_TOTAL = 'expected_amount_total'
export const STRIPE_CHECKOUT_METADATA_EXPECTED_CURRENCY = 'expected_currency'
export const STRIPE_CHECKOUT_METADATA_READINESS_SMOKE = 'readiness_smoke'
export const STRIPE_CHECKOUT_SESSION_ID_TOKEN = '{CHECKOUT_SESSION_ID}'
export const STRIPE_CHECKOUT_RETURN_PARAM = 'stripeCheckout'
export const STRIPE_CHECKOUT_SESSION_ID_PARAM = 'session_id'
export const STRIPE_PAYMENT_LIVE_CHECKOUT_TIMEOUT_MS = 15_000
export const STRIPE_CHECKOUT_MODES = ['payment', 'subscription'] as const
export const STRIPE_PAYMENT_REQUIRED_D1_TABLES = [
  'stripe_checkout_sessions',
  'stripe_webhook_events',
  'agentic_commerce_sessions',
  'agentic_commerce_proofs',
  'agentic_commerce_trace_events',
] as const
export const STRIPE_PAYMENT_REQUIRED_D1_COLUMNS = {
  stripe_webhook_events: [
    'id',
    'event_type',
    'payload_hash',
    'received_at',
    'processed_at',
    'processing_status',
    'processing_error',
  ],
} as const
export const STRIPE_PAYMENT_REQUIRED_D1_NULLABLE_COLUMNS = {
  stripe_webhook_events: [
    'processed_at',
    'processing_error',
  ],
} as const
export const STRIPE_PAYMENT_OPERATOR_COMMANDS = {
  configure: 'npm run payment:stripe:configure',
  d1MigrateRemote: 'npm run payment:d1:migrate:remote',
  readiness: 'npm run payment:stripe:readiness',
  x402Configure: 'npm run payment:x402:configure',
  x402Readiness: 'npm run payment:x402:readiness',
  paymentReadiness: 'npm run payment:readiness',
  applyConfirmation: 'apply-stripe-payment-worker-config',
  writeVisibleVarsFlag: '--write-visible-vars',
  deployVisibleVarsFlag: '--deploy-visible-vars',
} as const
export const STRIPE_PAYMENT_D1_MIGRATION_APPLY_COMMAND_TEMPLATE =
  'npx wrangler d1 migrations apply <DATABASE> --remote --config <WRANGLER_CONFIG>'

export const STRIPE_PAYMENT_SERVER_RUNTIME_SCOPE = [
  `Configure Stripe secrets on the server runtime that owns ${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}.`,
  'Cloudflare Pages project variables are available to Pages builds/functions, but they are not read by separate Worker routes.',
  'Stripe Projects can provision and sync credentials locally; copy only required server secret names into the payment server runtime.',
].join(' ')

export const STRIPE_PAYMENT_SERVER_RUNTIME_VISIBLE_SCOPE = [
  `Payment server runtime for ${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}`,
  'not Cloudflare Pages project variables',
].join('; ')

export const STRIPE_PAYMENT_SERVER_SECRET_ENV_SUMMARY = [
  STRIPE_PAYMENT_ENV_KEYS.restrictedKey,
  STRIPE_PAYMENT_ENV_KEYS.secretKey,
].join(' or ')

export const STRIPE_PAYMENT_REQUIRED_CHECKOUT_ENV_SUMMARY = [
  STRIPE_PAYMENT_ENV_KEYS.checkoutPriceId,
  `${STRIPE_PAYMENT_ENV_KEYS.checkoutCurrency} + ${STRIPE_PAYMENT_ENV_KEYS.checkoutUnitAmount} + ${STRIPE_PAYMENT_ENV_KEYS.checkoutProductName}`,
].join(' or ')

export const STRIPE_PAYMENT_CHECKOUT_MODE_ENV_SUMMARY = [
  `${STRIPE_PAYMENT_ENV_KEYS.checkoutMode}=payment`,
  `${STRIPE_PAYMENT_ENV_KEYS.checkoutMode}=subscription with ${STRIPE_PAYMENT_ENV_KEYS.checkoutPriceId}`,
].join(' or ')

export const STRIPE_PAYMENT_READINESS_CHECK_SUMMARY = [
  'Worker secret names',
  'visible Worker [vars]',
  'remote D1 payment tables',
  'required webhook-processing columns/constraints',
  'bounded optional hosted Checkout create-and-expire smoke',
].join(' + ')

export const STRIPE_PAYMENT_OPERATOR_CONFIGURE_SUMMARY = [
  STRIPE_PAYMENT_OPERATOR_COMMANDS.configure,
  `write visible Worker [vars] with ${STRIPE_PAYMENT_OPERATOR_COMMANDS.writeVisibleVarsFlag}`,
  `deploy visible Worker [vars] with ${STRIPE_PAYMENT_OPERATOR_COMMANDS.deployVisibleVarsFlag}`,
  `apply with -- --apply --yes --confirm=${STRIPE_PAYMENT_OPERATOR_COMMANDS.applyConfirmation}`,
  STRIPE_PAYMENT_OPERATOR_COMMANDS.readiness,
].join(' -> ')

export const STRIPE_PAYMENT_MISSING_SERVER_KEY_ERROR = [
  `Missing server-managed Stripe key. Set ${STRIPE_PAYMENT_SERVER_SECRET_ENV_SUMMARY} on the payment server runtime.`,
  'Pages project variables alone do not satisfy separate Worker routes.',
].join(' ')

export type StripePaymentEnvLike = Record<string, unknown>
export type StripeCheckoutMode = typeof STRIPE_CHECKOUT_MODES[number]

export type StripeCheckoutSessionCreatePayload = {
  successUrl: string
  cancelUrl: string
  workspaceId?: string | null
  agenticCommerceSessionId?: string | null
  expectedAmountTotal?: number | null
  expectedCurrency?: string | null
  quantity?: number | null
  readinessSmoke?: boolean | null
}

export type StripeCheckoutExpectedSessionTotal = {
  amountTotal: number
  currency: string
}

export type StripeCheckoutServerConfig =
  | {
      ok: true
      mode: StripeCheckoutMode
      priceId: string
      currency: null
      unitAmount: null
      productName: null
    }
  | {
      ok: true
      mode: StripeCheckoutMode
      priceId: null
      currency: string
      unitAmount: number
      productName: string
    }
  | {
      ok: false
      error: string
    }

const readEnvString = (env: StripePaymentEnvLike, key: string): string =>
  String(env[key] || '').trim()

export const readStripePaymentServerKey = (env: StripePaymentEnvLike): string => {
  const restrictedKey = readEnvString(env, STRIPE_PAYMENT_ENV_KEYS.restrictedKey)
  if (restrictedKey.startsWith('rk_')) return restrictedKey
  const secretKey = readEnvString(env, STRIPE_PAYMENT_ENV_KEYS.secretKey)
  if (secretKey.startsWith('sk_')) return secretKey
  return ''
}

export const readStripeWebhookSigningSecret = (env: StripePaymentEnvLike): string => {
  const secret = readEnvString(env, STRIPE_PAYMENT_ENV_KEYS.webhookSecret)
  return secret.startsWith('whsec_') ? secret : ''
}

export const normalizeStripeCheckoutReturnOrigin = (value: unknown): string =>
  String(value || '').trim().replace(/\/+$/g, '')

export const readStripeCheckoutReturnOrigin = (env: StripePaymentEnvLike): string =>
  normalizeStripeCheckoutReturnOrigin(readEnvString(env, STRIPE_PAYMENT_ENV_KEYS.checkoutReturnOrigin))

export const validateStripeCheckoutReturnOrigin = (value: unknown): string | null => {
  const origin = normalizeStripeCheckoutReturnOrigin(value)
  if (!origin) return null
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return `${STRIPE_PAYMENT_ENV_KEYS.checkoutReturnOrigin} must be an http(s) origin.`
    }
    if (url.origin !== origin) {
      return `${STRIPE_PAYMENT_ENV_KEYS.checkoutReturnOrigin} must be an origin without a path, query, or hash.`
    }
    return null
  } catch {
    return `${STRIPE_PAYMENT_ENV_KEYS.checkoutReturnOrigin} must be an absolute http(s) origin.`
  }
}

export const readStripeCheckoutRequestUrlOrigin = (requestUrl: string): string => {
  try {
    return new URL(String(requestUrl || '')).origin.replace(/\/+$/g, '')
  } catch {
    return ''
  }
}

const readStripeCheckoutMode = (env: StripePaymentEnvLike): StripeCheckoutMode | null => {
  const rawMode = readEnvString(env, STRIPE_PAYMENT_ENV_KEYS.checkoutMode)
  if (!rawMode) return 'payment'
  return STRIPE_CHECKOUT_MODES.includes(rawMode as StripeCheckoutMode) ? rawMode as StripeCheckoutMode : null
}

export function resolveStripeCheckoutServerConfig(env: StripePaymentEnvLike): StripeCheckoutServerConfig {
  const mode = readStripeCheckoutMode(env)
  if (!mode) {
    return { ok: false, error: 'STRIPE_CHECKOUT_MODE must be payment or subscription.' }
  }
  const priceId = readEnvString(env, STRIPE_PAYMENT_ENV_KEYS.checkoutPriceId)
  const rawCurrency = readEnvString(env, STRIPE_PAYMENT_ENV_KEYS.checkoutCurrency)
  const rawUnitAmountText = readEnvString(env, STRIPE_PAYMENT_ENV_KEYS.checkoutUnitAmount)
  const productName = readEnvString(env, STRIPE_PAYMENT_ENV_KEYS.checkoutProductName)
  if (priceId && (rawCurrency || rawUnitAmountText || productName)) {
    return { ok: false, error: 'Set STRIPE_CHECKOUT_PRICE_ID or the inline price tuple, not both.' }
  }
  if (priceId) {
    if (!priceId.startsWith('price_')) {
      return { ok: false, error: 'STRIPE_CHECKOUT_PRICE_ID must be a Stripe Price id.' }
    }
    return {
      ok: true,
      mode,
      priceId,
      currency: null,
      unitAmount: null,
      productName: null,
    }
  }

  const currency = rawCurrency.toLowerCase()
  const rawUnitAmount = Number(rawUnitAmountText)
  if (mode === 'subscription') {
    return { ok: false, error: 'STRIPE_CHECKOUT_MODE=subscription requires STRIPE_CHECKOUT_PRICE_ID so Stripe owns the recurring price definition.' }
  }
  if (!currency || !Number.isFinite(rawUnitAmount) || !productName) {
    return {
      ok: false,
      error: 'Set STRIPE_CHECKOUT_PRICE_ID, or set STRIPE_CHECKOUT_CURRENCY, STRIPE_CHECKOUT_UNIT_AMOUNT, and STRIPE_CHECKOUT_PRODUCT_NAME.',
    }
  }
  if (!/^[a-z]{3}$/.test(currency)) {
    return { ok: false, error: 'STRIPE_CHECKOUT_CURRENCY must be a 3-letter lowercase currency code.' }
  }
  const unitAmount = Math.floor(rawUnitAmount)
  if (unitAmount <= 0) {
    return { ok: false, error: 'STRIPE_CHECKOUT_UNIT_AMOUNT must be a positive integer minor-unit amount.' }
  }
  return {
    ok: true,
    mode,
    priceId: null,
    currency,
    unitAmount,
    productName,
  }
}

export const normalizeStripeCheckoutQuantity = (value: unknown): number => {
  const raw = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(raw)) return 1
  return Math.max(1, Math.min(STRIPE_CHECKOUT_MAX_QUANTITY, Math.floor(raw)))
}

const normalizeStripeCheckoutMetadataValue = (value: unknown): string =>
  String(value || '').trim()

export const readStripeCheckoutWorkspaceId = (payload: StripeCheckoutSessionCreatePayload): string =>
  normalizeStripeCheckoutMetadataValue(payload.workspaceId)

export const readStripeCheckoutAgenticCommerceSessionId = (payload: StripeCheckoutSessionCreatePayload): string =>
  normalizeStripeCheckoutMetadataValue(payload.agenticCommerceSessionId)

export const readStripeCheckoutClientReferenceId = (payload: StripeCheckoutSessionCreatePayload): string =>
  readStripeCheckoutAgenticCommerceSessionId(payload) || readStripeCheckoutWorkspaceId(payload)

export const readStripeCheckoutStripeIdempotencyKey = (payload: StripeCheckoutSessionCreatePayload): string =>
  readStripeCheckoutAgenticCommerceSessionId(payload)

export const readStripeCheckoutReadinessSmoke = (payload: StripeCheckoutSessionCreatePayload): boolean =>
  payload.readinessSmoke === true

export const readStripeCheckoutExpectedSessionTotal = (
  payload: StripeCheckoutSessionCreatePayload,
): StripeCheckoutExpectedSessionTotal | null => {
  const amount = typeof payload.expectedAmountTotal === 'number'
    ? payload.expectedAmountTotal
    : Number(payload.expectedAmountTotal)
  const amountTotal = Math.floor(amount)
  const currency = String(payload.expectedCurrency || '').trim().toLowerCase()
  if (!Number.isFinite(amount) || amountTotal <= 0 || !/^[a-z]{3}$/.test(currency)) return null
  return { amountTotal, currency }
}

export const validateStripeCheckoutSessionCreatePayload = (
  payload: StripeCheckoutSessionCreatePayload,
): string | null => {
  const clientReferenceId = readStripeCheckoutClientReferenceId(payload)
  if (clientReferenceId.length > STRIPE_CHECKOUT_CLIENT_REFERENCE_ID_MAX_LENGTH) {
    return `Stripe Checkout client_reference_id must be ${STRIPE_CHECKOUT_CLIENT_REFERENCE_ID_MAX_LENGTH} characters or fewer.`
  }
  if (readStripeCheckoutAgenticCommerceSessionId(payload) && !readStripeCheckoutExpectedSessionTotal(payload)) {
    return 'Agentic Stripe Checkout requires expectedAmountTotal and expectedCurrency.'
  }
  if (readStripeCheckoutReadinessSmoke(payload) && readStripeCheckoutAgenticCommerceSessionId(payload)) {
    return 'Stripe readiness smoke cannot be combined with agentic Checkout settlement.'
  }
  return null
}

export const validateStripeCheckoutExpectedTotalForConfig = (
  payload: StripeCheckoutSessionCreatePayload,
  config: Exclude<StripeCheckoutServerConfig, { ok: false }>,
): string | null => {
  const expected = readStripeCheckoutExpectedSessionTotal(payload)
  if (!expected) return null
  if (config.mode !== 'payment') {
    return 'Agentic Stripe Checkout requires STRIPE_CHECKOUT_MODE=payment.'
  }
  if (config.priceId !== null) return null
  const checkoutAmountTotal = config.unitAmount * normalizeStripeCheckoutQuantity(payload.quantity)
  if (checkoutAmountTotal !== expected.amountTotal || config.currency !== expected.currency) {
    return 'Agentic Stripe Checkout amount/currency must match the server-owned checkout price authority.'
  }
  return null
}

export function normalizeStripeCheckoutSuccessUrl(rawUrl: string): string {
  const trimmed = String(rawUrl || '').trim()
  if (!trimmed || trimmed.includes(STRIPE_CHECKOUT_SESSION_ID_TOKEN)) return trimmed
  try {
    new URL(trimmed)
  } catch {
    return trimmed
  }
  const hashIndex = trimmed.indexOf('#')
  const beforeHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex) : ''
  const separator = beforeHash.includes('?')
    ? (beforeHash.endsWith('?') || beforeHash.endsWith('&') ? '' : '&')
    : '?'
  return `${beforeHash}${separator}${STRIPE_CHECKOUT_SESSION_ID_PARAM}=${STRIPE_CHECKOUT_SESSION_ID_TOKEN}${hash}`
}

export function isStripeCheckoutReturnUrlAllowed(
  rawUrl: string,
  serverOrigin: string,
  configuredOrigin?: string | null,
): boolean {
  try {
    const parsed = new URL(String(rawUrl || '').trim())
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    const allowedOrigin = String(configuredOrigin || '').trim().replace(/\/+$/g, '')
    if (allowedOrigin) return parsed.origin === allowedOrigin
    const fallbackOrigin = String(serverOrigin || '').trim().replace(/\/+$/g, '')
    return fallbackOrigin ? parsed.origin === fallbackOrigin : false
  } catch {
    return false
  }
}

export function buildStripeCheckoutSessionCreateForm(
  payload: StripeCheckoutSessionCreatePayload,
  config: Exclude<StripeCheckoutServerConfig, { ok: false }>,
): URLSearchParams {
  const workspaceId = readStripeCheckoutWorkspaceId(payload)
  const agenticCommerceSessionId = readStripeCheckoutAgenticCommerceSessionId(payload)
  const clientReferenceId = readStripeCheckoutClientReferenceId(payload)
  const expectedTotal = readStripeCheckoutExpectedSessionTotal(payload)
  const form = new URLSearchParams()
  form.set('mode', config.mode)
  form.set('success_url', normalizeStripeCheckoutSuccessUrl(payload.successUrl))
  form.set('cancel_url', String(payload.cancelUrl || '').trim())
  form.set('line_items[0][quantity]', String(normalizeStripeCheckoutQuantity(payload.quantity)))
  if (config.priceId !== null) {
    form.set('line_items[0][price]', config.priceId)
  } else {
    form.set('line_items[0][price_data][currency]', String(config.currency || ''))
    form.set('line_items[0][price_data][unit_amount]', String(config.unitAmount))
    form.set('line_items[0][price_data][product_data][name]', String(config.productName || ''))
  }
  form.set('metadata[source]', STRIPE_CHECKOUT_METADATA_SOURCE)
  if (clientReferenceId) {
    form.set('client_reference_id', clientReferenceId)
  }
  if (workspaceId) {
    form.set(`metadata[${STRIPE_CHECKOUT_METADATA_WORKSPACE_ID}]`, workspaceId)
  }
  if (agenticCommerceSessionId) {
    form.set(`metadata[${STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID}]`, agenticCommerceSessionId)
  }
  if (expectedTotal) {
    form.set(`metadata[${STRIPE_CHECKOUT_METADATA_EXPECTED_AMOUNT_TOTAL}]`, String(expectedTotal.amountTotal))
    form.set(`metadata[${STRIPE_CHECKOUT_METADATA_EXPECTED_CURRENCY}]`, expectedTotal.currency)
  }
  if (readStripeCheckoutReadinessSmoke(payload)) {
    form.set(`metadata[${STRIPE_CHECKOUT_METADATA_READINESS_SMOKE}]`, 'true')
  }
  return form
}

export function buildStripeCheckoutSessionStatusUrl(sessionId: string): string {
  const normalizedSessionId = String(sessionId || '').trim()
  const query = new URLSearchParams({ [STRIPE_CHECKOUT_SESSION_ID_PARAM]: normalizedSessionId })
  return `${STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession}?${query.toString()}`
}
