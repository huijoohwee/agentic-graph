import { STRIPE_PAYMENT_ROUTE_PATHS } from './stripePaymentSsot.js'
import { buildAgenticCommerceSemanticKey } from './agenticCommerceSemanticKey.js'
import {
  AGENTIC_COMMERCE_SOLANA_PAY_KEY,
  AGENTIC_COMMERCE_SOLANA_PAY_ENV_KEYS,
  AGENTIC_COMMERCE_SOLANA_PAY_SETTLE_PATH,
} from './agenticCommerceSolanaPaySsot.js'

export { buildAgenticCommerceSemanticKey } from './agenticCommerceSemanticKey.js'

export type AgenticCommerceMainPanelReadinessRow = {
  id: string
  label: string
  value: string
  path: string | null
  semanticKey: string
}

export type AgenticCommerceMainPanelReadinessSection = {
  id: string
  title: string
  rows: AgenticCommerceMainPanelReadinessRow[]
}

export type AgenticCommerceMainPanelReadiness = {
  surface: 'mainpanel-commerce'
  semanticKey: string
  sections: AgenticCommerceMainPanelReadinessSection[]
  routePaths: string[]
  routeCount: number
  signals: string[]
}

export const AGENTIC_COMMERCE_API_VERSION = '2026-01-30'
export const AGENTIC_COMMERCE_DEFAULT_X402_AMOUNT = '1000'
export const AGENTIC_COMMERCE_DEFAULT_X402_ASSET = 'USDC'
export const AGENTIC_COMMERCE_DEFAULT_X402_FACILITATOR_URL = 'https://x402.org/facilitator'
export const AGENTIC_COMMERCE_DEFAULT_X402_NETWORK = 'eip155:84532'
export const AGENTIC_COMMERCE_DEFAULT_X402_PRICE = '$0.001'
export const AGENTIC_COMMERCE_X402_PAY_TO_FALLBACK_RESOURCE_ID = 'x402-payment-required'
export const AGENTIC_COMMERCE_X402_PLACEHOLDER_PAY_TO_ADDRESS = '0x0000000000000000000000000000000000000000'
export const AGENTIC_COMMERCE_UCP_VERSION = '2026-04-08'
export const AGENTIC_COMMERCE_UCP_SPEC_URL = 'https://ucp.dev/2026-04-08/specification/overview/'
export const AGENTIC_COMMERCE_ACP_DISCOVERY_SERVICES = ['checkout'] as const
export const AGENTIC_COMMERCE_ACP_DISCOVERY_TRANSPORTS = ['rest'] as const
export const AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY = 'stripe_checkout'

export const AGENTIC_COMMERCE_ROUTE_PATHS = {
  acpDiscovery: '/.well-known/acp.json',
  acpConfig: '/.well-known/acp-config',
  ucpProfile: '/.well-known/ucp',
  mppOpenApi: '/openapi.json',
  x402ApiRoot: '/api',
  x402ApiV1: '/api/v1',
  checkoutSessions: '/checkout/sessions',
  x402PaymentRequired: '/api/payments/commerce/x402',
  commerceWebhook: '/api/payments/commerce/webhook',
  commerceProofArtifact: '/api/payments/commerce/harness-proof.json',
  commerceTraceArtifact: '/api/payments/commerce/trace.jsonl',
  openboxIngest: '/api/payments/commerce/openbox/ingest',
  web3Settle: '/api/payments/commerce/web3/settle',
  solanaPaySettle: AGENTIC_COMMERCE_SOLANA_PAY_SETTLE_PATH,
} as const

export const AGENTIC_COMMERCE_X402_ROUTE_PATHS = [
  AGENTIC_COMMERCE_ROUTE_PATHS.x402ApiRoot,
  AGENTIC_COMMERCE_ROUTE_PATHS.x402ApiV1,
  AGENTIC_COMMERCE_ROUTE_PATHS.x402PaymentRequired,
] as const

export const AGENTIC_COMMERCE_ENV_KEYS = {
  sellerId: 'SELLER_ID',
  checkoutBaseUrl: 'CHECKOUT_BASE_URL',
  web3Enabled: 'WEB3_ENABLED',
  web3DepositAddress: 'WEB3_DEPOSIT_ADDRESS',
  baseRpcUrl: 'BASE_RPC_URL',
  baseConfirmationBlocks: 'BASE_CONFIRMATION_BLOCKS',
  easAttestUrl: 'EAS_ATTEST_URL',
  openboxApiUrl: 'OPENBOX_API_URL',
  openboxIngestUrl: 'OPENBOX_INGEST_URL',
  openboxApiKey: 'OPENBOX_API_KEY',
  stripeDelegatePaymentUrl: 'STRIPE_DELEGATE_PAYMENT_URL',
  acpBearerToken: 'ACP_BEARER_TOKEN',
  x402PayToAddress: 'X402_PAY_TO_ADDRESS',
  x402Network: 'X402_NETWORK',
  x402Asset: 'X402_ASSET',
  x402Amount: 'X402_AMOUNT',
  x402FacilitatorUrl: 'X402_FACILITATOR_URL',
  x402Price: 'X402_PRICE',
} as const

export const AGENTIC_COMMERCE_REQUIRED_VISIBLE_ENV_KEYS = [
  AGENTIC_COMMERCE_ENV_KEYS.sellerId,
  AGENTIC_COMMERCE_ENV_KEYS.checkoutBaseUrl,
  AGENTIC_COMMERCE_ENV_KEYS.web3Enabled,
  AGENTIC_COMMERCE_ENV_KEYS.web3DepositAddress,
  AGENTIC_COMMERCE_ENV_KEYS.baseRpcUrl,
  AGENTIC_COMMERCE_ENV_KEYS.baseConfirmationBlocks,
  AGENTIC_COMMERCE_ENV_KEYS.easAttestUrl,
  AGENTIC_COMMERCE_ENV_KEYS.openboxApiUrl,
  AGENTIC_COMMERCE_ENV_KEYS.openboxIngestUrl,
  AGENTIC_COMMERCE_ENV_KEYS.stripeDelegatePaymentUrl,
  AGENTIC_COMMERCE_ENV_KEYS.x402Network,
  AGENTIC_COMMERCE_ENV_KEYS.x402Asset,
  AGENTIC_COMMERCE_ENV_KEYS.x402Amount,
  AGENTIC_COMMERCE_ENV_KEYS.x402FacilitatorUrl,
  AGENTIC_COMMERCE_ENV_KEYS.x402Price,
  AGENTIC_COMMERCE_SOLANA_PAY_ENV_KEYS.recipient,
  AGENTIC_COMMERCE_SOLANA_PAY_ENV_KEYS.rpcUrl,
] as const

export const AGENTIC_COMMERCE_OPTIONAL_VISIBLE_ENV_KEYS = [
  AGENTIC_COMMERCE_SOLANA_PAY_ENV_KEYS.splToken,
  AGENTIC_COMMERCE_SOLANA_PAY_ENV_KEYS.label,
  AGENTIC_COMMERCE_SOLANA_PAY_ENV_KEYS.amountScale,
  AGENTIC_COMMERCE_SOLANA_PAY_ENV_KEYS.network,
  AGENTIC_COMMERCE_SOLANA_PAY_ENV_KEYS.commitment,
] as const

export const AGENTIC_COMMERCE_REQUIRED_SECRET_ENV_KEYS = [
  AGENTIC_COMMERCE_ENV_KEYS.acpBearerToken,
  AGENTIC_COMMERCE_ENV_KEYS.openboxApiKey,
] as const

export const AGENTIC_COMMERCE_PAYMENT_READINESS_CHECK_SUMMARY = [
  'Visible Worker [vars] for ACP, Web3, x402, OpenBOX, and Solana Pay.',
  'Worker secrets for ACP bearer auth and OpenBOX API access.',
].join(' ')

export type AgenticCommerceEnvLike = Record<string, unknown>

const readEnvString = (env: AgenticCommerceEnvLike, key: string): string => (
  String(env[key] || '').trim()
)

export const readAgenticCommerceSellerId = (
  env: AgenticCommerceEnvLike,
  requestUrl: string,
): string => {
  const configured = readEnvString(env, AGENTIC_COMMERCE_ENV_KEYS.sellerId)
  if (configured) return configured
  try {
    return new URL(requestUrl).host
  } catch {
    return 'agenticgraph-seller'
  }
}

export const readAgenticCommerceCheckoutBaseUrl = (
  env: AgenticCommerceEnvLike,
  requestUrl: string,
): string => {
  const configured = readEnvString(env, AGENTIC_COMMERCE_ENV_KEYS.checkoutBaseUrl).replace(/\/+$/g, '')
  if (configured) return configured
  try {
    return new URL(requestUrl).origin
  } catch {
    return ''
  }
}

export const isAgenticCommerceWeb3Enabled = (env: AgenticCommerceEnvLike): boolean => {
  const raw = readEnvString(env, AGENTIC_COMMERCE_ENV_KEYS.web3Enabled).toLowerCase()
  if (!raw) return true
  if (raw === '0' || raw === 'false' || raw === 'no') return false
  return raw === '1' || raw === 'true' || raw === 'yes'
}

export const normalizeAgenticCommerceCurrency = (value: unknown): string => {
  const currency = String(value || '').trim().toLowerCase()
  return /^[a-z][a-z0-9]{1,11}$/.test(currency) ? currency : ''
}

export const normalizeAgenticCommerceAmount = (value: unknown): number => {
  const amount = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0
}

const normalizeAgenticCommerceBaseUrl = (value: string): string =>
  String(value || '').trim().replace(/\/+$/g, '')

const buildAgenticCommerceUrl = (baseUrl: string, path: string): string =>
  `${normalizeAgenticCommerceBaseUrl(baseUrl)}${path}`

const buildAgenticCommerceMainPanelReadinessRow = (
  sectionId: string,
  id: string,
  label: string,
  value: string,
  path: string | null = value.startsWith('/') ? value : null,
): AgenticCommerceMainPanelReadinessRow => ({
  id,
  label,
  value,
  path,
  semanticKey: buildAgenticCommerceSemanticKey('mainpanel-commerce-readiness-row', [
    sectionId,
    id,
    label,
    value,
    path || '',
  ]),
})

const buildAgenticCommerceMainPanelReadinessSection = (
  id: string,
  title: string,
  rows: AgenticCommerceMainPanelReadinessRow[],
): AgenticCommerceMainPanelReadinessSection => ({
  id,
  title,
  rows,
})

export const buildAgenticCommerceMainPanelReadiness = (): AgenticCommerceMainPanelReadiness => {
  const sections = [
    buildAgenticCommerceMainPanelReadinessSection('overview', 'Overview', [
      buildAgenticCommerceMainPanelReadinessRow(
        'overview',
        'acp-discovery',
        'ACP discovery',
        `GET ${AGENTIC_COMMERCE_ROUTE_PATHS.acpDiscovery}`,
        AGENTIC_COMMERCE_ROUTE_PATHS.acpDiscovery,
      ),
      buildAgenticCommerceMainPanelReadinessRow(
        'overview',
        'acp-config',
        'ACP config',
        `GET ${AGENTIC_COMMERCE_ROUTE_PATHS.acpConfig}`,
        AGENTIC_COMMERCE_ROUTE_PATHS.acpConfig,
      ),
      buildAgenticCommerceMainPanelReadinessRow(
        'overview',
        'api-version',
        'API version',
        AGENTIC_COMMERCE_API_VERSION,
        null,
      ),
    ]),
    buildAgenticCommerceMainPanelReadinessSection('discovery', 'Discovery', [
      buildAgenticCommerceMainPanelReadinessRow(
        'discovery',
        'ucp-profile',
        'UCP profile',
        AGENTIC_COMMERCE_ROUTE_PATHS.ucpProfile,
      ),
      buildAgenticCommerceMainPanelReadinessRow(
        'discovery',
        'mpp-openapi',
        'MPP OpenAPI',
        AGENTIC_COMMERCE_ROUTE_PATHS.mppOpenApi,
      ),
      buildAgenticCommerceMainPanelReadinessRow(
        'discovery',
        'x402-payment-required',
        'x402 payment required',
        AGENTIC_COMMERCE_ROUTE_PATHS.x402PaymentRequired,
      ),
      buildAgenticCommerceMainPanelReadinessRow(
        'discovery',
        'x402-api-root',
        'x402 API root',
        AGENTIC_COMMERCE_ROUTE_PATHS.x402ApiRoot,
      ),
    ]),
    buildAgenticCommerceMainPanelReadinessSection('sessions', 'Sessions', [
      buildAgenticCommerceMainPanelReadinessRow(
        'sessions',
        'checkout-sessions',
        'Checkout sessions',
        AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions,
      ),
      buildAgenticCommerceMainPanelReadinessRow(
        'sessions',
        'stripe-webhook',
        'Stripe webhook',
        STRIPE_PAYMENT_ROUTE_PATHS.webhook,
      ),
    ]),
    buildAgenticCommerceMainPanelReadinessSection('web3', 'Web3', [
      buildAgenticCommerceMainPanelReadinessRow('web3', 'settle', 'Settle', AGENTIC_COMMERCE_ROUTE_PATHS.web3Settle),
      buildAgenticCommerceMainPanelReadinessRow('web3', 'solana-pay-settle', 'Solana Pay settle', AGENTIC_COMMERCE_ROUTE_PATHS.solanaPaySettle),
      buildAgenticCommerceMainPanelReadinessRow('web3', 'signals', 'Signals', 'Base RPC + Solana RPC confirmation', null),
    ]),
    buildAgenticCommerceMainPanelReadinessSection('governance', 'Governance', [
      buildAgenticCommerceMainPanelReadinessRow(
        'governance',
        'openbox-ingest',
        'OpenBOX ingest',
        AGENTIC_COMMERCE_ROUTE_PATHS.openboxIngest,
      ),
      buildAgenticCommerceMainPanelReadinessRow(
        'governance',
        'risk-source',
        'Risk source',
        'OpenBOX risk signal',
        null,
      ),
    ]),
    buildAgenticCommerceMainPanelReadinessSection('proofs', 'Proofs', [
      buildAgenticCommerceMainPanelReadinessRow(
        'proofs',
        'harness-proof',
        'Harness proof',
        AGENTIC_COMMERCE_ROUTE_PATHS.commerceProofArtifact,
      ),
      buildAgenticCommerceMainPanelReadinessRow(
        'proofs',
        'trace-artifact',
        'Trace artifact',
        AGENTIC_COMMERCE_ROUTE_PATHS.commerceTraceArtifact,
      ),
    ]),
  ]
  const rows = sections.flatMap(section => section.rows)
  const routePaths = rows
    .map(row => row.path || '')
    .filter(path => path.length > 0)
  const signals = rows
    .filter(row => !row.path)
    .map(row => `${row.label}: ${row.value}`)

  return {
    surface: 'mainpanel-commerce',
    semanticKey: buildAgenticCommerceSemanticKey('mainpanel-commerce-readiness', [
      AGENTIC_COMMERCE_API_VERSION,
      ...rows.map(row => row.semanticKey),
    ]),
    sections,
    routePaths,
    routeCount: routePaths.length,
    signals,
  }
}

export const AGENTIC_COMMERCE_MAIN_PANEL_READINESS: AgenticCommerceMainPanelReadiness =
  buildAgenticCommerceMainPanelReadiness()

export const buildAgenticCommerceDepositAddress = (
  env: AgenticCommerceEnvLike,
  sessionId: string,
): string => {
  const configured = readEnvString(env, AGENTIC_COMMERCE_ENV_KEYS.web3DepositAddress)
  if (/^0x[0-9a-fA-F]{40}$/.test(configured)) return configured
  const first = buildAgenticCommerceSemanticKey('deposit-address', [sessionId, '0'])
  const second = buildAgenticCommerceSemanticKey('deposit-address', [sessionId, '1'])
  const third = buildAgenticCommerceSemanticKey('deposit-address', [sessionId, '2'])
  const fourth = buildAgenticCommerceSemanticKey('deposit-address', [sessionId, '3'])
  const fifth = buildAgenticCommerceSemanticKey('deposit-address', [sessionId, '4'])
  return `0x${first}${second}${third}${fourth}${fifth}`.slice(0, 42)
}

export const buildAgenticCommerceAcpConfig = (args: {
  sellerId: string
  checkoutBaseUrl: string
  web3Enabled: boolean
}) => {
  const base = args.checkoutBaseUrl.replace(/\/+$/g, '')
  const paymentMethods = args.web3Enabled
    ? ['stripe_delegate_token', 'erc20', AGENTIC_COMMERCE_SOLANA_PAY_KEY]
    : ['stripe_delegate_token']
  return {
    protocol: 'acp',
    api_version: AGENTIC_COMMERCE_API_VERSION,
    seller: {
      id: args.sellerId,
    },
    endpoints: {
      create_session: `${base}${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}`,
      retrieve_session: `${base}${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}/{id}`,
      complete_session: `${base}${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}/{id}/complete`,
      cancel_session: `${base}${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}/{id}/cancel`,
    },
    payment_methods: paymentMethods,
    capabilities: {
      idempotency: true,
      risk_signals: true,
      web3: args.web3Enabled,
    },
    extensions: args.web3Enabled ? ['x-web3'] : [],
  }
}

export const readAgenticCommerceX402PayToAddress = (
  env: AgenticCommerceEnvLike,
  resourceId = AGENTIC_COMMERCE_X402_PAY_TO_FALLBACK_RESOURCE_ID,
): string => {
  const configured = readEnvString(env, AGENTIC_COMMERCE_ENV_KEYS.x402PayToAddress)
  if (
    /^0x[0-9a-fA-F]{40}$/.test(configured)
    && configured.toLowerCase() !== AGENTIC_COMMERCE_X402_PLACEHOLDER_PAY_TO_ADDRESS
  ) return configured
  return buildAgenticCommerceDepositAddress(env, resourceId)
}

export const AGENTIC_COMMERCE_X402_FALLBACK_PAY_TO_ADDRESS = buildAgenticCommerceDepositAddress(
  {},
  AGENTIC_COMMERCE_X402_PAY_TO_FALLBACK_RESOURCE_ID,
)

const AGENTIC_COMMERCE_X402_NETWORK_PATTERN = /^[a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,64}$/

export const readAgenticCommerceX402Network = (env: AgenticCommerceEnvLike): string => {
  const configured = readEnvString(env, AGENTIC_COMMERCE_ENV_KEYS.x402Network)
  return AGENTIC_COMMERCE_X402_NETWORK_PATTERN.test(configured)
    ? configured
    : AGENTIC_COMMERCE_DEFAULT_X402_NETWORK
}

export const readAgenticCommerceX402Asset = (env: AgenticCommerceEnvLike): string => (
  readEnvString(env, AGENTIC_COMMERCE_ENV_KEYS.x402Asset) || AGENTIC_COMMERCE_DEFAULT_X402_ASSET
)

export const readAgenticCommerceX402Amount = (env: AgenticCommerceEnvLike): string => {
  const configured = readEnvString(env, AGENTIC_COMMERCE_ENV_KEYS.x402Amount)
  return /^[1-9][0-9]*$/.test(configured) ? configured : AGENTIC_COMMERCE_DEFAULT_X402_AMOUNT
}

export const readAgenticCommerceX402Price = (env: AgenticCommerceEnvLike): string => (
  readEnvString(env, AGENTIC_COMMERCE_ENV_KEYS.x402Price) || AGENTIC_COMMERCE_DEFAULT_X402_PRICE
)

export const readAgenticCommerceX402FacilitatorUrl = (env: AgenticCommerceEnvLike): string => {
  const configured = readEnvString(env, AGENTIC_COMMERCE_ENV_KEYS.x402FacilitatorUrl)
  try {
    const url = new URL(configured || AGENTIC_COMMERCE_DEFAULT_X402_FACILITATOR_URL)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString().replace(/\/+$/g, '')
      : AGENTIC_COMMERCE_DEFAULT_X402_FACILITATOR_URL
  } catch {
    return AGENTIC_COMMERCE_DEFAULT_X402_FACILITATOR_URL
  }
}

export const buildAgenticCommerceAcpDiscovery = (args: {
  sellerId: string
  baseUrl: string
  web3Enabled: boolean
}) => {
  const base = normalizeAgenticCommerceBaseUrl(args.baseUrl)
  return {
    protocol: {
      name: 'acp',
      version: AGENTIC_COMMERCE_API_VERSION,
      supported_versions: [AGENTIC_COMMERCE_API_VERSION],
      documentation_url: 'https://agenticcommerce.dev',
    },
    api_base_url: base,
    transports: [...AGENTIC_COMMERCE_ACP_DISCOVERY_TRANSPORTS],
    capabilities: {
      services: [...AGENTIC_COMMERCE_ACP_DISCOVERY_SERVICES],
      ...(args.web3Enabled ? { extensions: [{ name: 'x-web3' }] } : {}),
    },
    links: {
      config: buildAgenticCommerceUrl(base, AGENTIC_COMMERCE_ROUTE_PATHS.acpConfig),
      ucp: buildAgenticCommerceUrl(base, AGENTIC_COMMERCE_ROUTE_PATHS.ucpProfile),
      mpp: buildAgenticCommerceUrl(base, AGENTIC_COMMERCE_ROUTE_PATHS.mppOpenApi),
      x402: buildAgenticCommerceUrl(base, AGENTIC_COMMERCE_ROUTE_PATHS.x402PaymentRequired),
    },
  }
}

export const buildAgenticCommerceUcpProfile = (args: {
  sellerId: string
  baseUrl: string
  web3Enabled: boolean
}) => {
  const base = normalizeAgenticCommerceBaseUrl(args.baseUrl)
  const endpoints = {
    acp: buildAgenticCommerceUrl(base, AGENTIC_COMMERCE_ROUTE_PATHS.acpDiscovery),
    api: buildAgenticCommerceUrl(base, AGENTIC_COMMERCE_ROUTE_PATHS.x402ApiRoot),
    checkout_sessions: buildAgenticCommerceUrl(base, AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions),
    mpp_openapi: buildAgenticCommerceUrl(base, AGENTIC_COMMERCE_ROUTE_PATHS.mppOpenApi),
    proof: buildAgenticCommerceUrl(base, AGENTIC_COMMERCE_ROUTE_PATHS.commerceProofArtifact),
    trace: buildAgenticCommerceUrl(base, AGENTIC_COMMERCE_ROUTE_PATHS.commerceTraceArtifact),
    x402_payment_required: buildAgenticCommerceUrl(base, AGENTIC_COMMERCE_ROUTE_PATHS.x402PaymentRequired),
    solana_pay_settle: buildAgenticCommerceUrl(base, AGENTIC_COMMERCE_ROUTE_PATHS.solanaPaySettle),
  }
  const commerceCapabilities = {
    checkout_sessions: true,
    content_payments: true,
    proof_artifacts: true,
    risk_signals: true,
    web3_settlement: args.web3Enabled,
    solana_pay: args.web3Enabled,
  }
  const ucpServices = {
    'dev.ucp.shopping': [{ version: AGENTIC_COMMERCE_UCP_VERSION, spec: AGENTIC_COMMERCE_UCP_SPEC_URL, transport: 'rest', endpoint: endpoints.api, schema: 'https://ucp.dev/2026-04-08/services/shopping/rest.openapi.json' }],
  }
  const ucpCapabilities = {
    'dev.ucp.shopping.checkout': [{ version: AGENTIC_COMMERCE_UCP_VERSION, spec: 'https://ucp.dev/2026-04-08/specification/checkout/', schema: 'https://ucp.dev/2026-04-08/schemas/shopping/checkout.json' }],
  }
  return {
    ucp: {
      version: AGENTIC_COMMERCE_UCP_VERSION,
      protocol_version: AGENTIC_COMMERCE_UCP_VERSION,
      services: ucpServices,
      capabilities: ucpCapabilities,
      payment_handlers: {},
      endpoints,
    },
    protocol_version: AGENTIC_COMMERCE_UCP_VERSION,
    protocol: {
      name: 'ucp',
      version: AGENTIC_COMMERCE_UCP_VERSION,
    },
    seller: {
      id: args.sellerId,
    },
    services: [
      {
        id: 'agenticgraph-content-payments',
        type: 'content-payments',
        endpoints: {
          x402: endpoints.x402_payment_required,
          checkout_sessions: endpoints.checkout_sessions,
          solana_pay_settle: endpoints.solana_pay_settle,
          proof: endpoints.proof,
          trace: endpoints.trace,
        },
      },
    ],
    capabilities: commerceCapabilities,
    endpoints,
    spec_urls: [AGENTIC_COMMERCE_UCP_SPEC_URL],
    schema_urls: [
      'https://ucp.dev/2026-04-08/services/shopping/rest.openapi.json',
      'https://ucp.dev/2026-04-08/schemas/shopping/checkout.json',
    ],
  }
}

export const buildAgenticCommerceMppOpenApi = (args: {
  baseUrl: string
}) => {
  const base = normalizeAgenticCommerceBaseUrl(args.baseUrl)
  return {
    openapi: '3.1.0',
    info: {
      title: 'AgenticGraph Machine Payment Protocol',
      version: AGENTIC_COMMERCE_API_VERSION,
      description: 'Machine-readable payable-operation discovery for AgenticGraph commerce routes.',
    },
    servers: [{ url: base }],
    paths: {
      [AGENTIC_COMMERCE_ROUTE_PATHS.x402PaymentRequired]: {
        get: {
          operationId: 'getAgenticGraphX402PaymentRequirement',
          summary: 'Return x402 payment requirements for an agent-readable paid resource.',
          'x-payment-info': {
            intent: 'charge',
            method: 'x402',
            amount: AGENTIC_COMMERCE_DEFAULT_X402_PRICE,
            currency: 'usdc',
          },
          responses: {
            402: { description: 'Payment Required' },
          },
        },
      },
      [AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions]: {
        post: {
          operationId: 'createAgenticGraphCommerceCheckoutSession',
          summary: 'Create an agentic commerce checkout session.',
          'x-payment-info': {
            intent: 'session',
            method: 'stripe',
            amount: 'dynamic',
            currency: 'request.currency',
          },
          responses: {
            201: { description: 'Checkout session created' },
          },
        },
      },
      [AGENTIC_COMMERCE_ROUTE_PATHS.solanaPaySettle]: {
        post: {
          operationId: 'settleAgenticGraphSolanaPayCheckoutSession',
          summary: 'Settle an agentic commerce checkout session from a verified Solana Pay transaction signature.',
          'x-payment-info': {
            intent: 'settlement',
            method: AGENTIC_COMMERCE_SOLANA_PAY_KEY,
            amount: 'dynamic',
            currency: 'request.currency',
          },
          responses: {
            200: { description: 'Solana Pay session settled' },
            409: { description: 'Solana Pay transaction is not confirmed yet' },
            422: { description: 'Solana Pay transaction does not match the session' },
          },
        },
      },
    },
  }
}

export const buildAgenticCommerceX402PaymentRequired = (args: {
  baseUrl: string
  payTo: string
  network?: string
  asset?: string
  amount?: string | number
  facilitatorUrl?: string
}) => {
  const base = normalizeAgenticCommerceBaseUrl(args.baseUrl)
  const resourceUrl = buildAgenticCommerceUrl(base, AGENTIC_COMMERCE_ROUTE_PATHS.x402PaymentRequired)
  const amount = String(args.amount || AGENTIC_COMMERCE_DEFAULT_X402_AMOUNT)
  return {
    x402Version: 2,
    error: 'Payment required',
    resource: {
      url: resourceUrl,
      description: 'AgenticGraph agentic commerce paid-resource readiness probe',
      mimeType: 'application/json',
    },
    accepts: [
      {
        scheme: 'exact',
        network: String(args.network || AGENTIC_COMMERCE_DEFAULT_X402_NETWORK),
        amount,
        maxAmountRequired: amount,
        asset: String(args.asset || AGENTIC_COMMERCE_DEFAULT_X402_ASSET),
        resource: resourceUrl,
        mimeType: 'application/json',
        payTo: args.payTo,
        maxTimeoutSeconds: 300,
        extra: {
          name: 'USDC',
          version: '2',
          resourceUrl,
          ...(args.facilitatorUrl ? { facilitatorUrl: args.facilitatorUrl } : {}),
        },
      },
    ],
  }
}
