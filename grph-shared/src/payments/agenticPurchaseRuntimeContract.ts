export const AGENTIC_PURCHASE_SCHEMA_ID =
  'agenticgraph-agentic-purchase/v1'

export const AGENTIC_PURCHASE_PHASES = Object.freeze([
  'funding',
  'discovery',
  'issuance',
  'execution',
] as const)

export const AGENTIC_PURCHASE_PHASE_STATES = Object.freeze([
  'waiting',
  'ready',
  'in_progress',
  'blocked',
  'complete',
  'cancelled',
  'outcome_unknown',
  'closure_pending',
] as const)

export const AGENTIC_PURCHASE_LIMITS = Object.freeze({
  maximumAllowedOrigins: 5,
  maximumProductPages: 5,
  maximumBrowserActions: 12,
  maximumModelCalls: 2,
  maximumApprovalTtlMs: 30 * 60 * 1_000,
  maximumEnvelopeTtlMs: 24 * 60 * 60 * 1_000,
  maximumCandidateAgeMs: 10 * 60 * 1_000,
})

export const AGENTIC_PURCHASE_AVALANCHE_NETWORK = Object.freeze({
  asset: 'xsgd',
  network: 'avalanche-c-chain',
  chainId: 43_114,
})

export const AGENTIC_PURCHASE_READINESS_CHECKS = Object.freeze([
  'requirementsAuthority',
  'trustedInvocation',
  'durableLifecycleStore',
  'kycAccountGrant',
  'xsgdAvalancheTuple',
  'externalSigner',
  'providerCreditAuthority',
  'cardSettlementBridge',
  'browserControlOwner',
  'allowedMerchantFixture',
  'discoveryCancellation',
  'modelCostObserver',
  'durableApprovalStore',
  'cardProgramGrant',
  'virtualCardProduct',
  'cardPool',
  'remoteHostAuthorization',
  'secureCardBroker',
  'cardDisposalContract',
  'browserProof',
] as const)

export type AgenticPurchasePhase = typeof AGENTIC_PURCHASE_PHASES[number]
export type AgenticPurchasePhaseState =
  typeof AGENTIC_PURCHASE_PHASE_STATES[number]
export type AgenticPurchaseReadinessCheck =
  typeof AGENTIC_PURCHASE_READINESS_CHECKS[number]

export type AgenticPurchaseEnvelope = Readonly<{
  lifecycleKey: string
  allowedOrigins: readonly string[]
  item: Readonly<{
    query: string
    requiredAttributes: readonly string[]
  }>
  quantity: 1
  maximumTotalMinor: number
  currency: 'sgd'
  expiresAt: string
}>

export type AgenticPurchaseCandidate = Readonly<{
  merchantOrigin: string
  canonicalProductUrl: string
  product: string
  variant: string | null
  quantity: 1
  itemAmountMinor: number
  shippingMinor: number
  taxMinor: number
  totalMinor: number
  currency: 'sgd'
  observedAt: string
  evidenceSelectors: readonly string[]
}>

export type AgenticPurchaseDiscoveryObservation = Readonly<{
  candidate: AgenticPurchaseCandidate | null
  productPagesVisited: number
  browserActionCount: number
  modelCallCount: number
  modelCostLogCount: number
  injectionSignals: readonly string[]
  cancelled: boolean
}>

export type AgenticPurchasePhaseReadiness = Readonly<{
  phase: AgenticPurchasePhase
  ready: boolean
  status: 'ready' | 'blocked'
  requiredChecks: readonly AgenticPurchaseReadinessCheck[]
  missingChecks: readonly AgenticPurchaseReadinessCheck[]
}>

export type AgenticPurchaseReadinessSnapshot = Readonly<{
  schemaId: typeof AGENTIC_PURCHASE_SCHEMA_ID
  runtimeReady: boolean
  phases: readonly AgenticPurchasePhaseReadiness[]
  unavailableSources: readonly AgenticPurchaseReadinessCheck[]
  providerCallCount: 0
  modelCallCount: 0
  modelCostUsd: 0
}>

export type AgenticPurchaseLifecycleSnapshot = Readonly<{
  schemaId: typeof AGENTIC_PURCHASE_SCHEMA_ID
  lifecycleId: string
  lifecycleKey: string
  phase: AgenticPurchasePhase
  phaseState: AgenticPurchasePhaseState
  nextAction: string
  cancelled: boolean
  financialStateExists: boolean
  cleanupActions: readonly AgenticPurchaseCleanupAction[]
  phases: readonly Readonly<{
    phase: AgenticPurchasePhase
    state: AgenticPurchasePhaseState
    label: string
    nextAction: string
  }>[]
  providerCallCount: number
  financialCallCount: number
}>

export type AgenticPurchaseCleanupAction =
  | 'release_unused_funding_reservation'
  | 'reconcile_provider_outcome'
  | 'block_new_authorizations'
  | 'safe_close_card'

export type AgenticPurchaseValidationFailureCode =
  | 'purchase_instruction_rejected'
  | 'purchase_candidate_rejected'
  | 'discovery_cancelled'
  | 'discovery_injection_detected'
  | 'discovery_bound_exceeded'
  | 'model_cost_log_missing'

export type AgenticPurchaseValidationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false
      code: AgenticPurchaseValidationFailureCode
      message: string
    }>

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/
const PROHIBITED_KEY_PATTERN =
  /^(?:pan|card_?number|cvv|cvc|full_?expiry|private_?key|seed_?phrase|raw_?signed_?transaction|kyc_?document|identity_?document)$/i
const PROHIBITED_VALUE_PATTERN =
  /\b(?:[1-9][0-9]{12,18}|-----BEGIN (?:EC |RSA )?PRIVATE KEY-----)\b/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const hasExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean => Object.keys(value).sort().join('\n') === [...expected].sort().join('\n')

const normalizedText = (value: unknown): string => String(value || '').trim()

const parseTimestamp = (value: unknown): number => {
  const text = normalizedText(value)
  if (!RFC3339_PATTERN.test(text)) return Number.NaN
  return Date.parse(text)
}

const normalizeHttpsOrigin = (value: unknown): string | null => {
  try {
    const url = new URL(normalizedText(value))
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || url.pathname !== '/'
      || url.search
      || url.hash
    ) return null
    return url.origin
  } catch {
    return null
  }
}

const positiveSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

const nonNegativeSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const validationFailure = (
  code: AgenticPurchaseValidationFailureCode,
  message: string,
): AgenticPurchaseValidationResult<never> => Object.freeze({ ok: false, code, message })

export const validateAgenticPurchaseEnvelope = (
  value: unknown,
  nowMs = Date.now(),
): AgenticPurchaseValidationResult<AgenticPurchaseEnvelope> => {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      'lifecycleKey',
      'allowedOrigins',
      'item',
      'quantity',
      'maximumTotalMinor',
      'currency',
      'expiresAt',
    ])
    || !isRecord(value.item)
    || !hasExactKeys(value.item, ['query', 'requiredAttributes'])
  ) {
    return validationFailure(
      'purchase_instruction_rejected',
      'Purchase instruction fields do not match the canonical schema.',
    )
  }
  const lifecycleKey = normalizedText(value.lifecycleKey)
  const query = normalizedText(value.item.query)
  const requiredAttributes = Array.isArray(value.item.requiredAttributes)
    ? value.item.requiredAttributes.map(normalizedText)
    : []
  const allowedOrigins = Array.isArray(value.allowedOrigins)
    ? value.allowedOrigins.map(normalizeHttpsOrigin)
    : []
  const expiresAtMs = parseTimestamp(value.expiresAt)
  if (
    !UUID_PATTERN.test(lifecycleKey)
    || query.length < 1
    || query.length > 256
    || requiredAttributes.length > 12
    || requiredAttributes.some(attribute =>
      attribute.length < 1 || attribute.length > 128)
    || new Set(requiredAttributes).size !== requiredAttributes.length
    || allowedOrigins.length < 1
    || allowedOrigins.length > AGENTIC_PURCHASE_LIMITS.maximumAllowedOrigins
    || allowedOrigins.some(origin => origin === null)
    || new Set(allowedOrigins).size !== allowedOrigins.length
    || value.quantity !== 1
    || !positiveSafeInteger(value.maximumTotalMinor)
    || normalizedText(value.currency).toLowerCase() !== 'sgd'
    || !Number.isFinite(expiresAtMs)
    || expiresAtMs <= nowMs
    || expiresAtMs - nowMs > AGENTIC_PURCHASE_LIMITS.maximumEnvelopeTtlMs
  ) {
    return validationFailure(
      'purchase_instruction_rejected',
      'Purchase instruction violates its identity, origin, quantity, budget, currency, or expiry bound.',
    )
  }
  const envelope = Object.freeze({
    lifecycleKey,
    allowedOrigins: Object.freeze(allowedOrigins as string[]),
    item: Object.freeze({
      query,
      requiredAttributes: Object.freeze(requiredAttributes),
    }),
    quantity: 1 as const,
    maximumTotalMinor: value.maximumTotalMinor,
    currency: 'sgd' as const,
    expiresAt: normalizedText(value.expiresAt),
  })
  try {
    assertAgenticPurchaseDataMinimized(envelope)
  } catch {
    return validationFailure(
      'purchase_instruction_rejected',
      'Purchase instruction contains prohibited payment or identity material.',
    )
  }
  return Object.freeze({ ok: true, value: envelope })
}

export const buildAgenticPurchaseEnvelopeDigestInput = (
  envelope: AgenticPurchaseEnvelope,
): string => JSON.stringify({
  lifecycleKey: envelope.lifecycleKey,
  allowedOrigins: [...envelope.allowedOrigins].sort(),
  item: {
    query: envelope.item.query,
    requiredAttributes: [...envelope.item.requiredAttributes].sort(),
  },
  quantity: envelope.quantity,
  maximumTotalMinor: envelope.maximumTotalMinor,
  currency: envelope.currency,
  expiresAt: envelope.expiresAt,
})

export const validateAgenticPurchaseCandidate = (
  value: unknown,
  envelope: AgenticPurchaseEnvelope,
  nowMs = Date.now(),
): AgenticPurchaseValidationResult<AgenticPurchaseCandidate> => {
  if (
    !isRecord(value)
    || !hasExactKeys(value, [
      'merchantOrigin',
      'canonicalProductUrl',
      'product',
      'variant',
      'quantity',
      'itemAmountMinor',
      'shippingMinor',
      'taxMinor',
      'totalMinor',
      'currency',
      'observedAt',
      'evidenceSelectors',
    ])
  ) {
    return validationFailure(
      'purchase_candidate_rejected',
      'Purchase candidate fields do not match the canonical schema.',
    )
  }
  const merchantOrigin = normalizeHttpsOrigin(value.merchantOrigin)
  let productUrl: URL | null = null
  try {
    productUrl = new URL(normalizedText(value.canonicalProductUrl))
  } catch {
    productUrl = null
  }
  const product = normalizedText(value.product)
  const variant = value.variant === null ? null : normalizedText(value.variant)
  const observedAtMs = parseTimestamp(value.observedAt)
  const evidenceSelectors = Array.isArray(value.evidenceSelectors)
    ? value.evidenceSelectors.map(normalizedText)
    : []
  const expectedTotal = Number(value.itemAmountMinor)
    + Number(value.shippingMinor)
    + Number(value.taxMinor)
  if (
    !merchantOrigin
    || !envelope.allowedOrigins.includes(merchantOrigin)
    || !productUrl
    || productUrl.protocol !== 'https:'
    || productUrl.origin !== merchantOrigin
    || product.length < 1
    || product.length > 256
    || (variant !== null && (variant.length < 1 || variant.length > 128))
    || value.quantity !== envelope.quantity
    || !nonNegativeSafeInteger(value.itemAmountMinor)
    || !nonNegativeSafeInteger(value.shippingMinor)
    || !nonNegativeSafeInteger(value.taxMinor)
    || !positiveSafeInteger(value.totalMinor)
    || expectedTotal !== value.totalMinor
    || value.totalMinor > envelope.maximumTotalMinor
    || normalizedText(value.currency).toLowerCase() !== envelope.currency
    || !Number.isFinite(observedAtMs)
    || observedAtMs > nowMs + 60_000
    || nowMs - observedAtMs > AGENTIC_PURCHASE_LIMITS.maximumCandidateAgeMs
    || evidenceSelectors.length < 1
    || evidenceSelectors.length > 20
    || evidenceSelectors.some(selector =>
      selector.length < 1 || selector.length > 256)
  ) {
    return validationFailure(
      'purchase_candidate_rejected',
      'Purchase candidate violates the frozen origin, quantity, total, currency, freshness, or evidence envelope.',
    )
  }
  const candidate = Object.freeze({
    merchantOrigin,
    canonicalProductUrl: productUrl.toString(),
    product,
    variant,
    quantity: 1 as const,
    itemAmountMinor: value.itemAmountMinor,
    shippingMinor: value.shippingMinor,
    taxMinor: value.taxMinor,
    totalMinor: value.totalMinor,
    currency: 'sgd' as const,
    observedAt: normalizedText(value.observedAt),
    evidenceSelectors: Object.freeze(evidenceSelectors),
  })
  try {
    assertAgenticPurchaseDataMinimized(candidate)
  } catch {
    return validationFailure(
      'purchase_candidate_rejected',
      'Purchase candidate contains prohibited payment or identity material.',
    )
  }
  return Object.freeze({ ok: true, value: candidate })
}

export const validateAgenticPurchaseDiscoveryObservation = (
  observation: AgenticPurchaseDiscoveryObservation,
  envelope: AgenticPurchaseEnvelope,
  nowMs = Date.now(),
): AgenticPurchaseValidationResult<AgenticPurchaseCandidate> => {
  if (observation.cancelled) {
    return validationFailure(
      'discovery_cancelled',
      'Discovery stopped before the next browser action or model call.',
    )
  }
  if (observation.injectionSignals.length > 0) {
    return validationFailure(
      'discovery_injection_detected',
      'Merchant content raised an injection signal and the discovery run was aborted.',
    )
  }
  if (
    !nonNegativeSafeInteger(observation.productPagesVisited)
    || !nonNegativeSafeInteger(observation.browserActionCount)
    || !nonNegativeSafeInteger(observation.modelCallCount)
    || observation.productPagesVisited
      > AGENTIC_PURCHASE_LIMITS.maximumProductPages
    || observation.browserActionCount
      > AGENTIC_PURCHASE_LIMITS.maximumBrowserActions
    || observation.modelCallCount
      > AGENTIC_PURCHASE_LIMITS.maximumModelCalls
  ) {
    return validationFailure(
      'discovery_bound_exceeded',
      'Discovery exceeded its product-page, browser-action, or model-call bound.',
    )
  }
  if (observation.modelCostLogCount !== observation.modelCallCount) {
    return validationFailure(
      'model_cost_log_missing',
      'Every discovery model call must have exactly one cost log.',
    )
  }
  return validateAgenticPurchaseCandidate(observation.candidate, envelope, nowMs)
}

export const assertAgenticPurchaseDataMinimized = (value: unknown): void => {
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit)
      return
    }
    if (typeof candidate === 'string') {
      if (PROHIBITED_VALUE_PATTERN.test(candidate)) {
        throw new Error('Prohibited payment or signing material.')
      }
      return
    }
    if (!isRecord(candidate)) return
    for (const [key, nested] of Object.entries(candidate)) {
      if (PROHIBITED_KEY_PATTERN.test(key)) {
        throw new Error(`Prohibited agentic purchase field: ${key}`)
      }
      visit(nested)
    }
  }
  visit(value)
}
