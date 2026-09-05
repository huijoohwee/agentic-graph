import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
} from '@x402/core/types'
import {
  AGENTIC_COMMERCE_PAID_RESOURCE_CONTRACT,
  AGENTIC_COMMERCE_PAID_RESOURCE_HEADER_NAMES,
  AGENTIC_COMMERCE_PAID_RESOURCE_ID,
  AGENTIC_COMMERCE_PAID_RESOURCE_PATH,
  AGENTIC_COMMERCE_PAID_RESOURCE_PROVIDER,
  buildAgenticCommercePaidResourcePaymentRequired,
  buildAgenticCommercePaidResourcePaymentRequiredDigest,
  buildAgenticCommercePaidResourcePaymentRequirementsDigest,
  buildAgenticCommercePaidResourceRequestIdentity,
  buildAgenticCommercePaidResourceTransportDigest,
  canonicalizeAgenticCommercePaidResourceJson,
  readAgenticCommercePaidResourceConfiguration,
  sha256AgenticCommercePaidResourceHex,
  type AgenticCommercePaidResourceEnv,
  type AgenticCommercePaidResourcePaymentRequirements,
} from '../../../grph-shared/src/payments/agenticCommercePaidResourceSsot'
import { parseDiscoveryRequest, parseVerifiedDiscoveryQuote } from '../agentic-graph-travel-discovery/discovery-contract.mjs'
import type { D1DatabaseLike } from '../shared/d1'
import {
  cachePaidResourceResponse,
  claimPaidResourcePayment,
  createPaidResourceChallenge,
  expirePaidResource,
  expirePaidResourcePastDeadline,
  findPaidResourceByIdentity,
  fulfillPaidResource,
  markPaidResourceExecuting,
  markPaidResourceSettlementUnknown,
  recoverStalePaidResource,
  releasePaidResourceVerification,
  type PaidResourceRow,
} from './agenticCommercePaidResourcePersistence'
import {
  exactPaidResourceRequest,
  exactStoredPaidResourcePayment,
  readStoredPaidResourceContract,
} from './agenticCommercePaidResourceRecord'
import {
  recoverPaidResourceSettlement,
  rejectPaidResourceSettlement,
} from './agenticCommercePaidResourceSettlement'
import {
  admitPaidResourceRequest,
  PAID_RESOURCE_ADMISSION_RETRY_SECONDS,
} from './agenticCommercePaidResourceAdmission'
import {
  paidResourceChallengeResponse as challengeResponse,
  paidResourceError as errorJson,
  paidResourceFulfilledResponse as fulfilledResponse,
  type PaidResourceCorsHeaders as HeadersRecord,
} from './agenticCommercePaidResourceResponse'
import {
  checkXrplFacilitatorSupport,
  parseXrplPaymentSignature,
  settleXrplPayment,
  verifyXrplPayment,
  type FetchLike,
  type XrplX402Transport,
} from './agenticCommerceX402Xrpl'
import { readBoundedJson } from './travelAgency/boundedJson'
const MAX_REQUEST_BYTES = 16 * 1024
const MAX_READINESS_BYTES = 16 * 1024
const MAX_RESOURCE_RESPONSE_BYTES = 256 * 1024
const CLAIM_TTL_MS = 30_000
const FACILITATOR_TIMEOUT_MS = 7_000
const RPC_TIMEOUT_MS = 7_000
const SERVICE_TIMEOUT_MS = 8_000
const CONCURRENT_WAIT_ATTEMPTS = 20
const CONCURRENT_WAIT_MS = 100
type ServiceBinding = Readonly<{ fetch(request: Request): Promise<Response> }>
export type AgenticCommercePaidResourceWorkerEnv = AgenticCommercePaidResourceEnv & Readonly<{
  TRAVEL_DISCOVERY_HARNESS?: unknown
}>

export type PaidResourceDependencies = Readonly<{
  fetchFn?: FetchLike
  now?: () => Date
  randomUuid?: () => string
  sleep?: (milliseconds: number) => Promise<void>
}>

const defaultSleep = async (milliseconds: number): Promise<void> => await new Promise(resolve => setTimeout(resolve, milliseconds))

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)

const readServiceBinding = (value: unknown): ServiceBinding | null => {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<ServiceBinding>
  return typeof candidate.fetch === 'function' ? candidate as ServiceBinding : null
}

const readServiceJson = async (
  binding: ServiceBinding,
  url: string,
  init: RequestInit,
  maxBytes: number,
): Promise<{ response: Response; body: unknown } | null> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SERVICE_TIMEOUT_MS)
  try {
    const response = await binding.fetch(new Request(url, { ...init, signal: controller.signal }))
    const body = await readBoundedJson(response, maxBytes)
    return body === null ? null : { response, body }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

const transportFrom = (
  config: {
    facilitatorUrl: string
    rpcUrl: string
  },
  fetchFn?: FetchLike,
): XrplX402Transport => Object.freeze({
  facilitatorUrl: config.facilitatorUrl,
  facilitatorTimeoutMs: FACILITATOR_TIMEOUT_MS,
  rpcUrl: config.rpcUrl,
  rpcTimeoutMs: RPC_TIMEOUT_MS,
  ...(fetchFn ? { fetchFn } : {}),
})

const preflight = async (args: {
  binding: ServiceBinding
  transport: XrplX402Transport
  requirements: PaymentRequirements
}): Promise<'ready' | 'resource_unavailable' | 'facilitator_unavailable' | 'facilitator_unsupported'> => {
  const readiness = await readServiceJson(
    args.binding,
    'https://travel-discovery.internal/readyz',
    { method: 'GET' },
    MAX_READINESS_BYTES,
  )
  if (!readiness || !readiness.response.ok || !isRecord(readiness.body) || readiness.body.ok !== true) {
    return 'resource_unavailable'
  }
  const supported = await checkXrplFacilitatorSupport(
    args.transport,
    args.requirements,
  )
  return supported.ok === true ? 'ready' : supported.code
}

const waitForOwner = async (
  db: D1DatabaseLike,
  row: PaidResourceRow,
  now: () => Date,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<PaidResourceRow> => {
  let current = row
  for (let attempt = 0; attempt < CONCURRENT_WAIT_ATTEMPTS; attempt += 1) {
    if (!['verifying', 'executing', 'settling'].includes(current.state)) return current
    if (current.claim_expires_at && current.claim_expires_at <= now().toISOString()) {
      const recovered = await recoverStalePaidResource(db, {
        id: current.id,
        expectedRevision: current.revision,
        now: now().toISOString(),
      })
      if (recovered.record) return recovered.record
    }
    await sleep(CONCURRENT_WAIT_MS)
    current = await findPaidResourceByIdentity(
      db,
      current.resource_id,
      current.idempotency_key,
    ) ?? current
  }
  return current
}

const invokeResource = async (
  binding: ServiceBinding,
  input: unknown,
): Promise<{ ok: true; body: unknown } | { ok: false }> => {
  const result = await readServiceJson(
    binding,
    'https://travel-discovery.internal/v1/requote',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agentic-graph-component': 'Agent_Registry',
      },
      body: canonicalizeAgenticCommercePaidResourceJson(input),
    },
    MAX_RESOURCE_RESPONSE_BYTES,
  )
  const quote = result?.response.ok ? parseVerifiedDiscoveryQuote(result.body, input) : null
  return quote ? { ok: true, body: quote } : { ok: false }
}

const executeClaim = async (args: {
  db: D1DatabaseLike
  row: PaidResourceRow
  claimToken: string
  paymentPayload: PaymentPayload
  paymentRequired: PaymentRequired
  requirements: PaymentRequirements
  transport: XrplX402Transport
  binding: ServiceBinding
  input: unknown
  invoiceId: string
  corsHeaders: HeadersRecord
  now: () => Date
}): Promise<Response> => {
  const verified = await verifyXrplPayment({
    transport: args.transport,
    paymentPayload: args.paymentPayload,
    requirements: args.requirements,
  })
  if (verified.ok === false) {
    const released = await releasePaidResourceVerification(args.db, {
      id: args.row.id,
      expectedRevision: args.row.revision,
      claimToken: args.claimToken,
      errorCode: verified.code,
      now: args.now().toISOString(),
    })
    if (!released.ok) {
      return errorJson(409, 'paid_resource_verification_conflict', args.corsHeaders)
    }
    if (released.record.state !== 'challenged') {
      return errorJson(409, 'paid_resource_expired', args.corsHeaders, {
        settlementAttempted: false,
      })
    }
    if (verified.code === 'facilitator_unavailable') {
      return errorJson(503, verified.code, args.corsHeaders, {
        retryable: true,
        phase: 'verify',
        settlementAttempted: false,
      })
    }
    return challengeResponse(args.paymentRequired, args.corsHeaders)
  }

  const postVerifyNow = args.now().toISOString()
  if (args.row.expires_at <= postVerifyNow) {
    const expired = await expirePaidResource(args.db, {
      id: args.row.id,
      expectedRevision: args.row.revision,
      claimToken: args.claimToken,
      fromStates: ['verifying'],
      errorCode: 'payment_window_expired',
      now: postVerifyNow,
    })
    return expired.record?.state === 'expired'
      ? errorJson(409, 'paid_resource_expired', args.corsHeaders, { settlementAttempted: false })
      : errorJson(409, 'paid_resource_verification_conflict', args.corsHeaders)
  }

  const executing = await markPaidResourceExecuting(args.db, {
    id: args.row.id,
    expectedRevision: args.row.revision,
    claimToken: args.claimToken,
    payer: verified.response.payer ?? null,
    now: postVerifyNow,
  })
  if (!executing.ok) {
    return errorJson(409, 'paid_resource_execution_conflict', args.corsHeaders)
  }
  let responseJson = executing.record.response_json
  let responseDigest = executing.record.response_digest
  if (responseJson && responseDigest) {
    if (await sha256AgenticCommercePaidResourceHex(responseJson) !== responseDigest) {
      await expirePaidResource(args.db, {
        id: args.row.id,
        expectedRevision: executing.record.revision,
        claimToken: args.claimToken,
        fromStates: ['executing'],
        errorCode: 'paid_resource_receipt_corrupt',
        now: args.now().toISOString(),
      })
      return errorJson(503, 'paid_resource_receipt_corrupt', args.corsHeaders)
    }
  } else {
    const resource = await invokeResource(args.binding, args.input)
    if (!resource.ok) {
      await expirePaidResource(args.db, {
        id: args.row.id,
        expectedRevision: executing.record.revision,
        claimToken: args.claimToken,
        fromStates: ['executing'],
        errorCode: 'paid_resource_execution_failed',
        now: args.now().toISOString(),
      })
      return errorJson(503, 'paid_resource_execution_failed', args.corsHeaders, {
        settlementAttempted: false,
      })
    }
    responseJson = canonicalizeAgenticCommercePaidResourceJson(Object.freeze({
      ok: true,
      contract: AGENTIC_COMMERCE_PAID_RESOURCE_CONTRACT,
      resource: AGENTIC_COMMERCE_PAID_RESOURCE_ID,
      provider: AGENTIC_COMMERCE_PAID_RESOURCE_PROVIDER,
      invoiceId: args.invoiceId,
      quote: resource.body,
    }))
    responseDigest = await sha256AgenticCommercePaidResourceHex(responseJson)
  }
  const settling = await cachePaidResourceResponse(args.db, {
    id: args.row.id,
    expectedRevision: executing.record.revision,
    claimToken: args.claimToken,
    responseJson,
    responseDigest,
    claimExpiresAt: new Date(args.now().getTime() + CLAIM_TTL_MS).toISOString(),
    now: args.now().toISOString(),
  })
  if (!settling.ok) {
    return errorJson(409, 'paid_resource_cache_conflict', args.corsHeaders)
  }
  const settlement = await settleXrplPayment({
    transport: args.transport,
    paymentPayload: args.paymentPayload,
    requirements: args.requirements,
    transactionHash: settling.record.transaction_hash as string,
  })
  if (settlement.ok === false) {
    if (settlement.code === 'settlement_failed') {
      return rejectPaidResourceSettlement({
        db: args.db,
        row: settling.record,
        fromState: 'settling',
        paymentRequired: args.paymentRequired,
        corsHeaders: args.corsHeaders,
        now: args.now,
        claimToken: args.claimToken,
      })
    }
    const unknown = await markPaidResourceSettlementUnknown(args.db, {
      id: args.row.id,
      expectedRevision: settling.record.revision,
      claimToken: args.claimToken,
      now: args.now().toISOString(),
    })
    return unknown.record?.state === 'settlement_unknown'
      ? recoverPaidResourceSettlement({
          db: args.db,
          row: unknown.record,
          paymentRequired: args.paymentRequired,
          requirements: args.requirements,
          transport: args.transport,
          corsHeaders: args.corsHeaders,
          now: args.now,
        })
      : errorJson(503, 'settlement_unknown', args.corsHeaders, {
          retryable: true,
          phase: 'settle',
          settlementAttempted: true,
        })
  }
  const settlementJson = canonicalizeAgenticCommercePaidResourceJson(settlement.response)
  const fulfilled = await fulfillPaidResource(args.db, {
    id: args.row.id,
    expectedRevision: settling.record.revision,
    claimToken: args.claimToken,
    settlementJson,
    settlementDigest: await sha256AgenticCommercePaidResourceHex(settlementJson),
    payer: settlement.response.payer ?? verified.response.payer ?? null,
    now: args.now().toISOString(),
  })
  return fulfilled.record?.state === 'fulfilled'
    ? fulfilledResponse(fulfilled.record, args.corsHeaders)
    : errorJson(409, 'paid_resource_fulfillment_conflict', args.corsHeaders)
}

export const isAgenticCommercePaidResourceRoute = (pathname: string): boolean =>
  pathname === AGENTIC_COMMERCE_PAID_RESOURCE_PATH

export const handleAgenticCommercePaidResourceRoute = async (
  request: Request,
  env: AgenticCommercePaidResourceWorkerEnv,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
  dependencies: PaidResourceDependencies = {},
): Promise<Response> => {
  const now = dependencies.now ?? (() => new Date())
  const sleep = dependencies.sleep ?? defaultSleep
  if (request.method !== 'POST') {
    return errorJson(405, 'method_not_allowed', corsHeaders)
  }
  const idempotencyKey = request.headers.get(
    AGENTIC_COMMERCE_PAID_RESOURCE_HEADER_NAMES.idempotencyKey,
  )
  if (!idempotencyKey) {
    return errorJson(400, 'paid_resource_idempotency_key_invalid', corsHeaders)
  }
  const input = parseDiscoveryRequest(await readBoundedJson(request, MAX_REQUEST_BYTES))
  if (!input || input.agentId !== AGENTIC_COMMERCE_PAID_RESOURCE_PROVIDER) {
    return errorJson(400, 'paid_resource_request_invalid', corsHeaders)
  }
  let identity
  try {
    identity = await buildAgenticCommercePaidResourceRequestIdentity({
      idempotencyKey,
      request: input,
    })
  } catch {
    return errorJson(400, 'paid_resource_idempotency_key_invalid', corsHeaders)
  }
  const existing = await findPaidResourceByIdentity(
    db,
    AGENTIC_COMMERCE_PAID_RESOURCE_ID,
    idempotencyKey,
  )
  if (existing && !exactPaidResourceRequest(existing, {
    invoiceId: identity.invoiceId,
    idempotencyKey,
    requestDigest: identity.requestDigest,
  })) {
    return errorJson(409, 'paid_resource_identity_conflict', corsHeaders)
  }
  const signature = request.headers.get(
    AGENTIC_COMMERCE_PAID_RESOURCE_HEADER_NAMES.paymentSignature,
  )
  if (!existing) {
    const configuration = readAgenticCommercePaidResourceConfiguration(env)
    if (configuration.ok === false) {
      return errorJson(503, 'paid_resource_unconfigured', corsHeaders, {
        fields: configuration.fields,
      })
    }
    const config = configuration.config
    const paidResourcePaymentRequired = buildAgenticCommercePaidResourcePaymentRequired({
      baseUrl: request.url,
      config,
      invoiceId: identity.invoiceId,
    })
    const paidResourceRequirements = paidResourcePaymentRequired.accepts[0]
    const paymentRequired = paidResourcePaymentRequired as unknown as PaymentRequired
    const requirements = paidResourceRequirements as unknown as PaymentRequirements
    const transport = transportFrom(config, dependencies.fetchFn)
    const binding = readServiceBinding(env.TRAVEL_DISCOVERY_HARNESS)
    if (!binding) return errorJson(503, 'paid_resource_dependency_unavailable', corsHeaders)
    const admissionNow = now()
    const admitted = await admitPaidResourceRequest(request, db, admissionNow)
    if (!admitted) {
      return errorJson(429, 'paid_resource_rate_limited', corsHeaders, {
        retryable: true,
        retryAfterSeconds: PAID_RESOURCE_ADMISSION_RETRY_SECONDS,
      })
    }
    const ready = await preflight({ binding, transport, requirements })
    if (ready !== 'ready') return errorJson(503, ready, corsHeaders)
    const requirementsJson = canonicalizeAgenticCommercePaidResourceJson(requirements)
    const paymentRequiredJson = canonicalizeAgenticCommercePaidResourceJson(paymentRequired)
    const [requirementsDigest, paymentRequiredDigest, transportDigest] = await Promise.all([
      buildAgenticCommercePaidResourcePaymentRequirementsDigest(
        paidResourceRequirements as AgenticCommercePaidResourcePaymentRequirements,
      ),
      buildAgenticCommercePaidResourcePaymentRequiredDigest(paidResourcePaymentRequired),
      buildAgenticCommercePaidResourceTransportDigest(config),
    ])
    const challengeNow = now()
    const challenge = await createPaidResourceChallenge(db, {
      id: identity.invoiceId,
      resourceId: AGENTIC_COMMERCE_PAID_RESOURCE_ID,
      idempotencyKey,
      network: config.network,
      requestDigest: identity.requestDigest,
      requestJson: identity.requestJson,
      requirementsDigest,
      requirementsJson,
      paymentRequiredDigest,
      paymentRequiredJson,
      facilitatorUrl: config.facilitatorUrl,
      rpcUrl: config.rpcUrl,
      transportDigest,
      now: challengeNow.toISOString(),
      expiresAt: new Date(challengeNow.getTime() + config.maxTimeoutSeconds * 1_000).toISOString(),
    })
    if (challenge.ok === false) return errorJson(409, challenge.code, corsHeaders)
    const activeChallenge = await expirePaidResourcePastDeadline(db, challenge.record, now().toISOString())
    return activeChallenge.state === 'challenged'
      ? challengeResponse(paymentRequired, corsHeaders)
      : errorJson(409, `paid_resource_${activeChallenge.state}`, corsHeaders)
  }
  const storedContract = await readStoredPaidResourceContract(existing)
  if (!storedContract) return errorJson(503, 'paid_resource_receipt_corrupt', corsHeaders)
  const { config, paymentRequired, requirements } = storedContract
  const transport = transportFrom(config, dependencies.fetchFn)
  const recoveryNow = now().toISOString()
  let activeExisting = await expirePaidResourcePastDeadline(db, existing, recoveryNow)
  if (
    ['verifying', 'executing', 'settling'].includes(activeExisting.state)
    && activeExisting.claim_expires_at
    && activeExisting.claim_expires_at <= recoveryNow
  ) {
    const recovered = await recoverStalePaidResource(db, {
      id: activeExisting.id,
      expectedRevision: activeExisting.revision,
      now: recoveryNow,
    })
    activeExisting = recovered.record ?? activeExisting
  }
  if (!signature) {
    return activeExisting.state === 'challenged'
      ? challengeResponse(paymentRequired, corsHeaders)
      : errorJson(409, `paid_resource_${activeExisting.state}`, corsHeaders)
  }
  const parsed = await parseXrplPaymentSignature({
    header: signature,
    requirements,
    paymentRequired,
  })
  if (parsed.ok === false) {
    return activeExisting.state === 'expired'
      ? errorJson(409, 'paid_resource_expired', corsHeaders, { settlementAttempted: false })
      : challengeResponse(paymentRequired, corsHeaders)
  }
  if (!exactStoredPaidResourcePayment(activeExisting, parsed.payment)) {
    return errorJson(409, 'paid_resource_payment_conflict', corsHeaders)
  }
  if (activeExisting.state === 'fulfilled') return fulfilledResponse(activeExisting, corsHeaders)
  if (activeExisting.state === 'settlement_unknown') {
    return recoverPaidResourceSettlement({
      db,
      row: activeExisting,
      paymentRequired,
      requirements,
      transport,
      corsHeaders,
      now,
      paymentPayload: parsed.payment.paymentPayload,
      randomUuid: dependencies.randomUuid,
    })
  }
  if (activeExisting.state === 'expired') return errorJson(409, 'paid_resource_expired', corsHeaders)
  let current = activeExisting
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const binding = current.state === 'challenged'
      ? readServiceBinding(env.TRAVEL_DISCOVERY_HARNESS)
      : null
    if (current.state === 'challenged' && !binding) {
      return errorJson(503, 'paid_resource_dependency_unavailable', corsHeaders)
    }
    const claimToken = dependencies.randomUuid?.() ?? crypto.randomUUID()
    const claim = await claimPaidResourcePayment(db, {
      id: current.id,
      expectedRevision: current.revision,
      paymentPayloadDigest: parsed.payment.paymentPayloadDigest,
      signedBlobDigest: parsed.payment.signedTxBlobDigest,
      transactionHash: parsed.payment.transactionHash,
      claimToken,
      claimExpiresAt: new Date(now().getTime() + CLAIM_TTL_MS).toISOString(),
      now: now().toISOString(),
    })
    if (claim.ok === false) return claim.code === 'paid_resource_payment_rejected'
      ? challengeResponse(paymentRequired, corsHeaders)
      : errorJson(claim.code === 'paid_resource_verification_exhausted' ? 429 : 409, claim.code, corsHeaders)
    if (claim.claimed) {
      if (!binding) return errorJson(409, 'paid_resource_state_conflict', corsHeaders)
      return executeClaim({
        db,
        row: claim.record,
        claimToken,
        paymentPayload: parsed.payment.paymentPayload,
        paymentRequired,
        requirements,
        transport,
        binding,
        input,
        invoiceId: identity.invoiceId,
        corsHeaders,
        now,
      })
    }
    current = await waitForOwner(db, claim.record, now, sleep)
    if (current.state === 'fulfilled') return fulfilledResponse(current, corsHeaders)
    if (current.state === 'settlement_unknown') {
      return recoverPaidResourceSettlement({
        db,
        row: current,
        paymentRequired,
        requirements,
        transport,
        corsHeaders,
        now,
        paymentPayload: parsed.payment.paymentPayload,
        randomUuid: dependencies.randomUuid,
      })
    }
    if (current.state === 'expired') return errorJson(409, 'paid_resource_expired', corsHeaders)
    if (current.state !== 'challenged') break
  }
  return errorJson(409, 'paid_resource_in_progress', corsHeaders, {
    retryable: true,
    settlementAttempted: current.state === 'settling',
  })
}
