import {
  resolveStraitsxRuntimeConfig,
  STRAITSX_ENV_KEYS,
} from '../../../grph-shared/src/payments/straitsxPaymentSsot'
import {
  resolveStripeCheckoutServerConfig,
  STRIPE_PAYMENT_ENV_KEYS,
  STRIPE_PAYMENT_REQUEST_API_VERSION,
  STRIPE_PAYMENT_WEBHOOK_API_VERSION,
} from '../../../grph-shared/src/payments/stripePaymentSsot'
import {
  parseAgenticGraphPaymentRecordDocument,
  serializeAgenticGraphPaymentRecordDocument,
} from '../../../grph-shared/src/payments/paymentRecordDocument'
import {
  buildTerminalReceiptRecord,
  type PaymentIntentRecord,
} from '../../../grph-shared/src/payments/paymentRuntimeContract'
import {
  resolvePaymentBuyerProduct,
  type PaymentBuyerProduct,
} from '../../../grph-shared/src/payments/paymentBuyerProductSsot'
import {
  STRIPE_MCP_EXCLUDED_TOOL_NAMES,
  STRIPE_MCP_PAYMENT_TOOL_NAMES,
  STRIPE_MCP_REMOTE_URL,
} from '../../../grph-shared/src/payments/stripeMcpSsot'
import type { D1DatabaseLike } from '../shared/d1'
import {
  AGENTIC_PURCHASE_READINESS_VIEW,
  inspectAgenticPurchaseReadiness,
} from './agenticPurchaseReadiness'
import { handlePaymentProviderEvent } from './paymentEventIngress'
import {
  createStraitsxPaymentRailAdapter,
  createStripePaymentRailAdapter,
} from './paymentRailAdapters'
import {
  createD1PaymentRuntimeStore,
  type PaymentRuntimeStore,
} from './paymentRuntimePersistence'
import {
  createPaymentRuntimeService,
  type PaymentRuntimeReadiness,
  type PaymentRuntimeService,
} from './paymentRuntimeService'

export const PAYMENT_RUNTIME_ROUTE_PATHS = Object.freeze({
  intents: '/api/payments/intents',
  discovery: '/api/payments/discovery',
  views: '/api/payments/views',
  stripeEvent: '/api/payments/events/stripe',
  straitsxEvent: '/api/payments/events/straitsx',
})

type PaymentRuntimeContext = Readonly<{
  store: PaymentRuntimeStore
  service: PaymentRuntimeService
  readiness: PaymentRuntimeReadiness
  buyerProduct: PaymentBuyerProduct | null
}>

const normalizeString = (value: unknown): string => String(value || '').trim()
const normalizeToken = (value: unknown): string => normalizeString(value).toLowerCase()

const readBoolean = (
  env: Readonly<Record<string, unknown>>,
  key: string,
): boolean => normalizeToken(env[key]) === 'true'

const readCardCurrencies = (
  env: Readonly<Record<string, unknown>>,
): readonly string[] => Object.freeze(
  normalizeString(env.PAYMENT_CARD_SETTLED_CURRENCIES)
    .split(',')
    .map(normalizeToken)
    .filter(value => /^[a-z]{3}$/.test(value))
    .sort(),
)

export const inspectPaymentRuntimeReadiness = (
  env: Readonly<Record<string, unknown>>,
  evidence: Readonly<Record<'stripe' | 'straitsx', PaymentIntentRecord | null>> = {
    stripe: null,
    straitsx: null,
  },
): PaymentRuntimeReadiness => {
  const stripeMissing: string[] = []
  const stripeMode = normalizeToken(env[STRIPE_PAYMENT_ENV_KEYS.runtimeMode])
  const stripeCredential = normalizeString(
    env[STRIPE_PAYMENT_ENV_KEYS.runtimeRestrictedKey],
  )
  const stripeWebhookSecret = normalizeString(
    env[STRIPE_PAYMENT_ENV_KEYS.runtimeWebhookSecret],
  )
  const stripeCheckoutConfig = resolveStripeCheckoutServerConfig(env)
  const cardSettledCurrencies = readCardCurrencies(env)
  if (stripeMode !== 'sandbox') stripeMissing.push(STRIPE_PAYMENT_ENV_KEYS.runtimeMode)
  if (!stripeCredential.startsWith('rk_test_')) {
    stripeMissing.push(STRIPE_PAYMENT_ENV_KEYS.runtimeRestrictedKey)
  }
  if (!stripeWebhookSecret.startsWith('whsec_')) {
    stripeMissing.push(STRIPE_PAYMENT_ENV_KEYS.runtimeWebhookSecret)
  }
  if (stripeCheckoutConfig.ok === false) {
    stripeMissing.push('stripe_checkout_price_authority')
  }
  if (cardSettledCurrencies.length === 0) {
    stripeMissing.push('PAYMENT_CARD_SETTLED_CURRENCIES')
  }

  const straitsxConfig = resolveStraitsxRuntimeConfig(env)
  const straitsxMissing: string[] = straitsxConfig.ok === false
    ? [straitsxConfig.error]
    : []
  const buyerProduct = resolvePaymentBuyerProduct(env)
  if (buyerProduct.ok === false) {
    stripeMissing.push(...buyerProduct.missing)
    straitsxMissing.push(...buyerProduct.missing)
  }
  const stripeAdmissionMissing = Object.freeze([...stripeMissing])
  const straitsxAdmissionMissing = Object.freeze([...straitsxMissing])
  const passesRecordRoundTrip = (record: PaymentIntentRecord | null): boolean => {
    const receipt = record ? buildTerminalReceiptRecord(record) : null
    if (!receipt || receipt.terminalState !== 'paid') return false
    try {
      const parsed = parseAgenticGraphPaymentRecordDocument(
        serializeAgenticGraphPaymentRecordDocument([receipt]),
      )
      return parsed.ok
        && parsed.records.length === 1
        && parsed.records[0]?.intentId === record?.id
    } catch {
      return false
    }
  }
  const stripeEvidenceReady = passesRecordRoundTrip(evidence.stripe)
  const straitsxEvidenceReady = passesRecordRoundTrip(evidence.straitsx)
  if (!stripeEvidenceReady) {
    stripeMissing.push('authenticated_paid_sandbox_attestation')
  }
  if (!straitsxEvidenceReady) {
    straitsxMissing.push('authenticated_paid_sandbox_attestation')
  }
  const stripeReady = stripeMissing.length === 0
  const straitsxReady = straitsxMissing.length === 0
  return Object.freeze({
    rails: Object.freeze({
      stripe: stripeReady,
      straitsx: straitsxReady,
      // XSGD remains separately unavailable until endpoint/network/grant proof.
      xsgd: false,
    }),
    admissionRails: Object.freeze({
      stripe: stripeAdmissionMissing.length === 0,
      straitsx: straitsxAdmissionMissing.length === 0,
      xsgd: false,
    }),
    cardSettledCurrencies,
    entries: Object.freeze([
      Object.freeze({
        rail: 'stripe' as const,
        ready: stripeReady,
        missing: Object.freeze(stripeMissing),
        admissionReady: stripeAdmissionMissing.length === 0,
        admissionMissing: stripeAdmissionMissing,
        evidenceIntentId: stripeEvidenceReady ? evidence.stripe?.id : null,
        requestApiVersion: STRIPE_PAYMENT_REQUEST_API_VERSION,
        webhookApiVersion: STRIPE_PAYMENT_WEBHOOK_API_VERSION,
      }),
      Object.freeze({
        rail: 'straitsx' as const,
        ready: straitsxReady,
        missing: Object.freeze(straitsxMissing),
        admissionReady: straitsxAdmissionMissing.length === 0,
        admissionMissing: straitsxAdmissionMissing,
        evidenceIntentId: straitsxEvidenceReady ? evidence.straitsx?.id : null,
        integrationModel: straitsxConfig.ok
          ? straitsxConfig.integrationModel
          : normalizeToken(env[STRAITSX_ENV_KEYS.integrationModel]) || null,
        grantedProducts: straitsxConfig.ok
          ? straitsxConfig.grantedProducts
          : [],
      }),
    ]),
    unavailableSources: Object.freeze([
      ...(!stripeEvidenceReady
        ? ['stripe_authenticated_paid_sandbox_attestation']
        : []),
      ...(!straitsxEvidenceReady
        ? ['straitsx_authenticated_paid_sandbox_attestation']
        : []),
      'xsgd_capability_contract',
    ]),
  })
}

const buildRuntimeContext = async (args: {
  request: Request
  env: Readonly<Record<string, unknown>>
  db: D1DatabaseLike
}): Promise<PaymentRuntimeContext> => {
  const store = createD1PaymentRuntimeStore(args.db)
  const [stripeEvidence, straitsxEvidence] = await Promise.all([
    store.findPaidSettlementEvidence('stripe'),
    store.findPaidSettlementEvidence('straitsx'),
  ])
  const readiness = inspectPaymentRuntimeReadiness(args.env, {
    stripe: stripeEvidence,
    straitsx: straitsxEvidence,
  })
  const buyerProductResolution = resolvePaymentBuyerProduct(args.env)
  const buyerProduct = buyerProductResolution.ok
    ? buyerProductResolution.value
    : null
  const requestOrigin = new URL(args.request.url).origin
  const service = createPaymentRuntimeService({
    store,
    readiness,
    adapters: {
      stripe: createStripePaymentRailAdapter({
        env: args.env,
        requestOrigin,
      }),
      straitsx: createStraitsxPaymentRailAdapter({ env: args.env }),
    },
    buyerProduct,
  })
  return Object.freeze({ store, service, readiness, buyerProduct })
}

const json = (
  status: number,
  body: unknown,
  corsHeaders: Record<string, string>,
): Response => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...corsHeaders,
  },
})

const readJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json()
  } catch {
    return null
  }
}

const resultStatus = (result: { ok: boolean; code?: string }): number => {
  if (result.ok) return 200
  if (result.code === 'not_found') return 404
  if (result.code === 'approval_missing') return 403
  if (
    result.code === 'intent_parameter_conflict'
    || result.code === 'provider_outcome_unknown'
  ) return 409
  if (
    result.code === 'rail_unavailable'
    || result.code === 'capability_unavailable'
    || result.code === 'integration_model_unsupported'
    || result.code === 'mode_mismatch'
  ) return 503
  return 400
}

export const buildPaymentDiscovery = (
  readiness: PaymentRuntimeReadiness,
  buyerProduct: PaymentBuyerProduct | null,
) => Object.freeze({
  schemaId: 'agenticgraph-payment-capability/v1',
  rails: Object.freeze(['stripe', 'straitsx']),
  currencies: readiness.cardSettledCurrencies,
  settlementAssets: Object.freeze(['fiat', 'xsgd']),
  buyerProduct,
  requestSchema: Object.freeze({
    type: 'object',
    additionalProperties: false,
    required: Object.freeze([
      'clientIntentKey',
      'amountMinor',
      'currency',
      'settlementAsset',
      'origin',
    ]),
    properties: Object.freeze({
      clientIntentKey: Object.freeze({ type: 'string', format: 'uuid' }),
      amountMinor: Object.freeze({ type: 'integer', minimum: 1 }),
      currency: Object.freeze({ type: 'string', pattern: '^[a-z]{3}$' }),
      settlementAsset: Object.freeze({ enum: Object.freeze(['fiat', 'xsgd']) }),
      origin: Object.freeze({ enum: Object.freeze(['buyer', 'agent']) }),
      approvalRef: Object.freeze({ type: 'string' }),
    }),
  }),
  resultSchema: Object.freeze({
    type: 'object',
    additionalProperties: false,
    required: Object.freeze([
      'ok',
      'intent',
      'rail',
      'instruction',
      'receiptRecord',
      'idempotentReplay',
      'modelCallCount',
      'modelCostUsd',
    ]),
  }),
  transports: Object.freeze([
    Object.freeze({ id: 'agenticgraph-mcp', kind: 'local' }),
    Object.freeze({
      id: 'stripe-mcp',
      kind: 'remote',
      url: STRIPE_MCP_REMOTE_URL,
      confirmationRequiredForEveryTool: true,
      approvalGateRequiredForMutations: true,
      allowedTools: STRIPE_MCP_PAYMENT_TOOL_NAMES,
      excludedTools: STRIPE_MCP_EXCLUDED_TOOL_NAMES,
    }),
  ]),
  unavailableTransports: Object.freeze([]),
  modelCallCount: 0,
  modelCostUsd: 0,
})

const matchIntentRoute = (
  pathname: string,
): Readonly<{
  intentId: string
  operation: 'status' | 'reconcile' | 'refund'
}> | null => {
  const match = /^\/api\/payments\/intents\/([^/]+)(?:\/(reconcile|refund))?$/.exec(pathname)
  if (!match?.[1]) return null
  return Object.freeze({
    intentId: decodeURIComponent(match[1]),
    operation: (match[2] || 'status') as 'status' | 'reconcile' | 'refund',
  })
}

export const isPaymentRuntimeRoute = (pathname: string): boolean =>
  pathname === PAYMENT_RUNTIME_ROUTE_PATHS.intents
  || pathname === PAYMENT_RUNTIME_ROUTE_PATHS.discovery
  || pathname.startsWith(`${PAYMENT_RUNTIME_ROUTE_PATHS.views}/`)
  || pathname === PAYMENT_RUNTIME_ROUTE_PATHS.stripeEvent
  || pathname === PAYMENT_RUNTIME_ROUTE_PATHS.straitsxEvent
  || matchIntentRoute(pathname) !== null

export const handlePaymentRuntimeRoute = async (args: {
  request: Request
  env: Readonly<Record<string, unknown>>
  db: D1DatabaseLike
  corsHeaders: Record<string, string>
}): Promise<Response | null> => {
  const url = new URL(args.request.url)
  if (!isPaymentRuntimeRoute(url.pathname)) return null
  const intentRoute = matchIntentRoute(url.pathname)
  if (intentRoute?.operation === 'refund' && args.request.method === 'POST') {
    // Refund execution remains host-only so a public HTTP caller cannot bypass
    // the payment-action approval gate enforced by the local MCP runtime.
    return json(403, {
      ok: false,
      code: 'approval_missing',
      message: 'Refund execution requires the approval-gated host adapter.',
    }, args.corsHeaders)
  }
  let createIntentPayload: unknown = null
  if (
    url.pathname === PAYMENT_RUNTIME_ROUTE_PATHS.intents
    && args.request.method === 'POST'
  ) {
    createIntentPayload = await readJson(args.request)
    const payload = createIntentPayload
      && typeof createIntentPayload === 'object'
      && !Array.isArray(createIntentPayload)
      ? createIntentPayload as Record<string, unknown>
      : null
    if (normalizeToken(payload?.origin) === 'agent') {
      return json(403, {
        ok: false,
        code: 'approval_missing',
        message: 'Agent payment creation requires the approval-gated host adapter.',
      }, args.corsHeaders)
    }
  }
  if (
    url.pathname
      === `${PAYMENT_RUNTIME_ROUTE_PATHS.views}/${AGENTIC_PURCHASE_READINESS_VIEW}`
    && args.request.method === 'GET'
  ) {
    return json(200, inspectAgenticPurchaseReadiness(), args.corsHeaders)
  }
  const runtime = await buildRuntimeContext(args)

  if (
    url.pathname === PAYMENT_RUNTIME_ROUTE_PATHS.discovery
    && args.request.method === 'GET'
  ) {
    return json(
      200,
      buildPaymentDiscovery(runtime.readiness, runtime.buyerProduct),
      args.corsHeaders,
    )
  }
  if (
    url.pathname === PAYMENT_RUNTIME_ROUTE_PATHS.intents
    && args.request.method === 'POST'
  ) {
    const result = await runtime.service.createIntent(createIntentPayload)
    return json(resultStatus(result), result, args.corsHeaders)
  }
  if (
    url.pathname === PAYMENT_RUNTIME_ROUTE_PATHS.stripeEvent
    && args.request.method === 'POST'
  ) {
    return handlePaymentProviderEvent({
      ...args,
      provider: 'stripe',
      store: runtime.store,
      service: runtime.service,
    })
  }
  if (
    url.pathname === PAYMENT_RUNTIME_ROUTE_PATHS.straitsxEvent
    && args.request.method === 'POST'
  ) {
    return handlePaymentProviderEvent({
      ...args,
      provider: 'straitsx',
      store: runtime.store,
      service: runtime.service,
    })
  }
  if (
    url.pathname.startsWith(`${PAYMENT_RUNTIME_ROUTE_PATHS.views}/`)
    && args.request.method === 'GET'
  ) {
    const view = url.pathname.slice(PAYMENT_RUNTIME_ROUTE_PATHS.views.length + 1)
    const result = await runtime.service.readView(view)
    return json(result.ok === true ? 200 : 400, result, args.corsHeaders)
  }
  if (intentRoute?.operation === 'status' && args.request.method === 'GET') {
    const result = await runtime.service.readPublicStatus(intentRoute.intentId)
    return result.ok === true
      ? json(200, result.status, args.corsHeaders)
      : json(404, { code: result.code }, args.corsHeaders)
  }
  if (intentRoute?.operation === 'reconcile' && args.request.method === 'POST') {
    const result = await runtime.service.reconcile(intentRoute.intentId)
    return json(resultStatus(result), result, args.corsHeaders)
  }
  return json(405, { ok: false, code: 'method_not_allowed' }, args.corsHeaders)
}
