import {
  CHECKOUT_EVIDENCE_CHECKS,
  CHECKOUT_PROVIDER_CONTRACT,
  canonicalJson,
  providerBindingHeaders,
  providerJson,
  readBoundProviderRequest,
  runtimeEvidencePin,
  runtimeEvidenceResponse,
  sha256Hex,
  type ProviderBinding,
} from '../../commerce-provider-contract.ts'
import type { CommerceCheckoutStore } from './commerce-checkout-store.ts'
import {
  validCommerceProviderSecret,
  verifyCommerceProviderControlRequest,
  verifyCommerceProviderRequestAuthentication,
} from '../../commerce-provider-auth.ts'

const GUARDRAIL_RECEIPT_SCHEMA = 'commerce.guardrail-receipt/v1'
const SETTLEMENT_RECEIPT_SCHEMA = 'commerce.settlement-receipt/v1'
const MAX_BODY_BYTES = 65_536
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const SHA256 = /^[0-9a-f]{64}$/u
const CURRENCY = /^[A-Z]{3}$/u

type ProviderEnv = TravelCommerceEnv & Readonly<{
  CHECKOUT_PROVIDER_STORE: DurableObjectNamespace<CommerceCheckoutStore>
}>

type JsonRecord = Record<string, unknown>

export async function handleCommerceCheckoutProvider(
  request: Request,
  env: ProviderEnv,
): Promise<Response | null> {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/v1/runtime-evidence') {
    return runtimeEvidenceResponse(env, CHECKOUT_PROVIDER_CONTRACT, CHECKOUT_EVIDENCE_CHECKS)
  }
  if (request.method === 'GET' && url.pathname === '/v1/capabilities') {
    if (!validCommerceProviderSecret(env.CHECKOUT_PROVIDER_AUTH_SECRET)) {
      return error('provider_authentication_unconfigured', 503)
    }
    if (!await verifyCommerceProviderControlRequest(
      request,
      CHECKOUT_PROVIDER_CONTRACT,
      env.CHECKOUT_PROVIDER_AUTH_SECRET,
    )) return error('provider_authentication_invalid', 401)
    return providerJson({
      ok: true,
      contract: CHECKOUT_PROVIDER_CONTRACT,
      operations: ['prepare', 'confirm', 'status', 'offer-observe'],
    })
  }
  const operation = (request.method === 'POST' && url.pathname === '/internal/v1/checkouts/prepare')
    || (request.method === 'POST' && url.pathname === '/internal/v1/checkouts/confirm')
    || (request.method === 'GET' && url.pathname === '/internal/v1/checkouts/status')
    || (request.method === 'GET' && /^\/internal\/v1\/offers\/[^/]+\/observe$/u.test(url.pathname))
  if (!operation) return null
  if (!validCommerceProviderSecret(env.CHECKOUT_PROVIDER_AUTH_SECRET)) {
    return error('provider_authentication_unconfigured', 503)
  }
  const bound = await readBoundProviderRequest(request, env, CHECKOUT_EVIDENCE_CHECKS)
  if (!bound) return error('operational_evidence_binding_invalid', 409)
  if (!await verifyCommerceProviderRequestAuthentication(bound.request, {
    contract: CHECKOUT_PROVIDER_CONTRACT,
    requestDigest: bound.binding.requestDigest,
    bindingDigest: bound.binding.bindingDigest,
  }, env.CHECKOUT_PROVIDER_AUTH_SECRET)) return error('provider_authentication_invalid', 401)
  const { binding } = bound
  if (request.method === 'POST' && url.pathname.endsWith('/prepare')) {
    return prepare(bound.request, env, binding)
  }
  if (request.method === 'POST' && url.pathname.endsWith('/confirm')) {
    return confirm(bound.request, env, binding)
  }
  if (url.pathname.endsWith('/status')) return status(url, env, binding)
  return observe(url, env, binding)
}

async function prepare(request: Request, env: ProviderEnv, binding: ProviderBinding): Promise<Response> {
  const body = await readBody(request)
  if (!isPrepare(body)) return error('checkout_prepare_malformed', 400, binding)
  const pin = await runtimeEvidencePin(env, CHECKOUT_EVIDENCE_CHECKS)
  if (!pin || body.offerProviderRevision !== pin.sourceRevision) {
    return error('checkout_provider_revision_mismatch', 409, binding)
  }
  const receiptWithoutDigest = Object.freeze({
    schema: GUARDRAIL_RECEIPT_SCHEMA,
    receiptId: `guardrail-${(await sha256Hex(body.checkoutId)).slice(0, 32)}`,
    checkoutId: body.checkoutId,
    intentId: body.intentId,
    agentId: body.agentId,
    offerReceiptDigest: body.offerReceiptDigest,
    amountMinor: body.amountMinor,
    budgetMinor: body.budgetMinor,
    currency: body.currency,
    providerRevision: pin.sourceRevision,
  })
  const guardrailReceipt = Object.freeze({
    ...receiptWithoutDigest,
    receiptDigest: await sha256Hex(canonicalJson(receiptWithoutDigest)),
  })
  const requestJson = canonicalJson(body)
  const requestDigest = await sha256Hex(requestJson)
  const checkout = env.CHECKOUT_PROVIDER_STORE.getByName(`checkout:${body.checkoutId}`)
  const prepared = await checkout.prepare({
    checkoutId: body.checkoutId,
    requestDigest,
    requestJson,
    receiptJson: canonicalJson(guardrailReceipt),
  })
  if (prepared.kind === 'conflict') return error('checkout_prepare_precondition_failed', 409, binding)
  const observation = await env.CHECKOUT_PROVIDER_STORE.getByName(`offer:${body.offerId}`).recordObservation({
    offerId: body.offerId,
    agentId: body.agentId,
    priceMinor: body.amountMinor,
    available: true,
    requestDigest: await sha256Hex(canonicalJson({
      offerId: body.offerId,
      agentId: body.agentId,
      priceMinor: body.amountMinor,
      providerRevision: pin.sourceRevision,
    })),
  })
  if (observation.kind === 'conflict') return error('offer_observation_precondition_failed', 409, binding)
  return ok({ guardrailPassed: true, guardrailReceipt }, binding)
}

async function confirm(request: Request, env: ProviderEnv, binding: ProviderBinding): Promise<Response> {
  const body = await readBody(request)
  if (!isConfirmation(body)) return error('checkout_confirmation_malformed', 400, binding)
  if (body.idempotencyKey !== `checkout-confirm:${body.checkoutId}`) {
    return error('checkout_confirmation_precondition_failed', 409, binding)
  }
  const checkout = env.CHECKOUT_PROVIDER_STORE.getByName(`checkout:${body.checkoutId}`)
  const preparation = await checkout.readPreparation()
  if (!preparation) return error('checkout_preparation_not_found', 409, binding)
  const prepared = parseRecord(preparation.requestJson)
  const storedReceipt = parseRecord(preparation.receiptJson)
  if (!prepared || !storedReceipt
    || prepared.checkoutId !== body.checkoutId
    || prepared.offerId !== body.offerId
    || prepared.amountMinor !== body.amountMinor
    || prepared.currency !== body.currency
    || storedReceipt.receiptDigest !== body.guardrailReceiptDigest
    || canonicalJson(storedReceipt) !== canonicalJson(body.guardrailReceipt)) {
    return error('checkout_confirmation_precondition_failed', 409, binding)
  }
  const requestDigest = await sha256Hex(canonicalJson(body))
  const begun = await checkout.beginConfirmation({ idempotencyKey: body.idempotencyKey, requestDigest })
  if (begun.kind === 'conflict') return error('checkout_confirmation_precondition_failed', 409, binding)
  if (begun.kind === 'settled' && begun.receiptJson) {
    const receipt = parseRecord(begun.receiptJson)
    return receipt ? ok({ settlementReceipt: receipt }, binding) : error('settlement_readback_invalid', 503, binding)
  }
  const issuance = await settle(env.ISSUANCE_SERVICE, body, prepared)
  if (!issuance) return error('settlement_provider_result_unknown', 503, binding)
  const pin = await runtimeEvidencePin(env, CHECKOUT_EVIDENCE_CHECKS)
  if (!pin) return error('provider_evidence_unconfigured', 503, binding)
  const receiptWithoutDigest = Object.freeze({
    schema: SETTLEMENT_RECEIPT_SCHEMA,
    settlementId: issuance.settlementId,
    checkoutId: body.checkoutId,
    offerId: body.offerId,
    amountMinor: body.amountMinor,
    currency: body.currency,
    idempotencyKey: body.idempotencyKey,
    humanConfirmationDigest: body.humanConfirmationDigest,
    guardrailReceiptDigest: body.guardrailReceiptDigest,
    providerRevision: pin.sourceRevision,
    state: 'settled' as const,
  })
  const receipt = Object.freeze({
    ...receiptWithoutDigest,
    receiptDigest: await sha256Hex(canonicalJson(receiptWithoutDigest)),
  })
  const completed = await checkout.completeConfirmation({
    idempotencyKey: body.idempotencyKey,
    requestDigest,
    receiptJson: canonicalJson(receipt),
  })
  return completed.kind === 'settled'
    ? ok({ settlementReceipt: receipt }, binding)
    : error('settlement_readback_invalid', 503, binding)
}

async function status(url: URL, env: ProviderEnv, binding: ProviderBinding): Promise<Response> {
  const keys: string[] = []
  url.searchParams.forEach((_value, key) => keys.push(key))
  const idempotencyKey = url.searchParams.get('idempotencyKey') ?? ''
  if (keys.length !== 1 || keys[0] !== 'idempotencyKey'
    || !idempotencyKey.startsWith('checkout-confirm:')) {
    return error('checkout_status_malformed', 400, binding)
  }
  const checkoutId = idempotencyKey.slice('checkout-confirm:'.length)
  if (!IDENTIFIER.test(checkoutId)) return error('checkout_status_malformed', 400, binding)
  const confirmation = await env.CHECKOUT_PROVIDER_STORE.getByName(`checkout:${checkoutId}`).readConfirmation()
  if (!confirmation || confirmation.idempotencyKey !== idempotencyKey
    || confirmation.state !== 'settled' || !confirmation.receiptJson) {
    return error('settlement_not_found', 404, binding)
  }
  const receipt = parseRecord(confirmation.receiptJson)
  return receipt ? ok({ settlementReceipt: receipt }, binding) : error('settlement_readback_invalid', 503, binding)
}

async function observe(url: URL, env: ProviderEnv, binding: ProviderBinding): Promise<Response> {
  const segments = url.pathname.split('/')
  let offerId = ''
  try { offerId = decodeURIComponent(segments[4] ?? '') } catch { /* invalid input stays empty */ }
  const agentId = url.searchParams.get('agentId') ?? ''
  const keys: string[] = []
  url.searchParams.forEach((_value, key) => keys.push(key))
  if (!IDENTIFIER.test(offerId) || !IDENTIFIER.test(agentId)
    || keys.join(',') !== 'agentId') {
    return error('offer_observation_malformed', 400, binding)
  }
  const observed = await env.CHECKOUT_PROVIDER_STORE.getByName(`offer:${offerId}`).readObservation()
  if (!observed || observed.offerId !== offerId || observed.agentId !== agentId) {
    return error('offer_observation_not_found', 404, binding)
  }
  return ok({ observed: { priceMinor: observed.priceMinor, available: observed.available } }, binding)
}

async function settle(
  issuance: Fetcher,
  body: JsonRecord,
  prepared: JsonRecord,
): Promise<Readonly<{ settlementId: string }> | null> {
  const settlement = Object.freeze({
    operation: 'settleNet',
    cascadeId: body.idempotencyKey,
    bundleId: prepared.intentId,
    principalId: prepared.agentId,
    amountMinor: body.amountMinor,
    currency: body.currency,
    caller: 'Issuance_Service',
  })
  try {
    const response = await issuance.fetch(new Request('https://issuance-service.internal/v1/net-settlements', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': String(body.idempotencyKey),
        'x-agentic-graph-component': 'Issuance_Service',
      },
      body: canonicalJson(settlement),
      signal: AbortSignal.timeout(10_000),
    }))
    const value = await readResponse(response)
    return response.ok && value?.ok === true
      && value.idempotencyKey === body.idempotencyKey
      && value.amountMinor === body.amountMinor
      && value.currency === body.currency
      && value.effect === 'charged'
      && typeof value.settlementId === 'string' && IDENTIFIER.test(value.settlementId)
      && typeof value.providerReference === 'string' && IDENTIFIER.test(value.providerReference)
      ? Object.freeze({ settlementId: value.settlementId })
      : null
  } catch {
    return null
  }
}

function isPrepare(value: JsonRecord | null): value is JsonRecord & Readonly<{
  checkoutId: string; intentId: string; agentId: string; offerId: string
  offerReceiptDigest: string; amountMinor: number; budgetMinor: number
  currency: string; offerProviderRevision: string; idempotencyKey: string
}> {
  return !!value
    && Object.keys(value).sort().join(',') === 'agentId,amountMinor,budgetMinor,checkoutId,contract,currency,idempotencyKey,intentId,offerId,offerProviderRevision,offerReceiptDigest'
    && value.contract === CHECKOUT_PROVIDER_CONTRACT
    && [value.checkoutId, value.intentId, value.agentId, value.offerId].every((entry) => typeof entry === 'string' && IDENTIFIER.test(entry))
    && typeof value.offerReceiptDigest === 'string' && SHA256.test(value.offerReceiptDigest)
    && Number.isSafeInteger(value.amountMinor) && Number(value.amountMinor) > 0
    && Number.isSafeInteger(value.budgetMinor) && Number(value.budgetMinor) >= Number(value.amountMinor)
    && typeof value.currency === 'string' && CURRENCY.test(value.currency)
    && typeof value.offerProviderRevision === 'string' && /^[0-9a-f]{40}$/u.test(value.offerProviderRevision)
    && value.idempotencyKey === `checkout-prepare:${value.checkoutId}`
}

function isConfirmation(value: JsonRecord | null): value is JsonRecord & Readonly<{
  checkoutId: string; offerId: string; amountMinor: number; currency: string
  guardrailReceipt: JsonRecord; guardrailReceiptDigest: string
  humanConfirmationDigest: string; idempotencyKey: string
}> {
  return !!value
    && Object.keys(value).sort().join(',') === 'amountMinor,checkoutId,contract,currency,guardrailReceipt,guardrailReceiptDigest,humanConfirmationDigest,idempotencyKey,offerId'
    && value.contract === CHECKOUT_PROVIDER_CONTRACT
    && typeof value.checkoutId === 'string' && IDENTIFIER.test(value.checkoutId)
    && typeof value.offerId === 'string' && IDENTIFIER.test(value.offerId)
    && Number.isSafeInteger(value.amountMinor) && Number(value.amountMinor) > 0
    && typeof value.currency === 'string' && CURRENCY.test(value.currency)
    && isRecord(value.guardrailReceipt)
    && typeof value.guardrailReceiptDigest === 'string' && SHA256.test(value.guardrailReceiptDigest)
    && typeof value.humanConfirmationDigest === 'string' && SHA256.test(value.humanConfirmationDigest)
    && typeof value.idempotencyKey === 'string' && value.idempotencyKey.length <= 256
}

async function readBody(request: Request): Promise<JsonRecord | null> {
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return null
  return readResponse(request)
}

async function readResponse(response: Pick<Response, 'body' | 'headers'>): Promise<JsonRecord | null> {
  const declared = response.headers.get('content-length')
  if (declared && (!/^\d+$/u.test(declared) || Number(declared) > MAX_BODY_BYTES)) {
    await response.body?.cancel()
    return null
  }
  if (!response.body) return null
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return null }
      chunks.push(next.value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return parseRecord(new TextDecoder().decode(bytes))
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}

function parseRecord(value: string): JsonRecord | null {
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch { return null }
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function ok(value: JsonRecord, binding: ProviderBinding): Response {
  const payload = JSON.parse(canonicalJson({
    ok: true,
    contract: CHECKOUT_PROVIDER_CONTRACT,
    ...value,
  })) as JsonRecord
  return providerJson(payload, 200, providerBindingHeaders(binding))
}

function error(code: string, status: number, binding?: ProviderBinding): Response {
  const payload = JSON.parse(canonicalJson({
    ok: false,
    contract: CHECKOUT_PROVIDER_CONTRACT,
    code,
  })) as JsonRecord
  return providerJson(
    payload,
    status,
    binding ? providerBindingHeaders(binding) : {},
  )
}
