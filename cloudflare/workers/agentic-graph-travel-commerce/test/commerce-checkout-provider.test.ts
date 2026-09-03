import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTHORING_MUTATION_HEADER_NAMES,
  CHECKOUT_EVIDENCE_CHECKS,
  CHECKOUT_PROVIDER_CONTRACT,
  canonicalJson,
  readBoundProviderRequest,
  runtimeEvidencePin,
  sha256Hex,
} from '../../commerce-provider-contract'
import {
  authenticateCommerceProviderControlRequest,
  authenticateCommerceProviderRequest,
} from '../../commerce-provider-auth.ts'
import { handleCommerceCheckoutProvider } from '../src/commerce-checkout-provider'
import type { CommerceCheckoutStore } from '../src/commerce-checkout-store'

const SOURCE_REVISION = '9ba90b95bcde38db9f25f6b945ba66cfd264e735'
const AUTH_SECRET = 'checkout-provider-graph-test-secret'
const providerEnv = () => ({
  ...(env as unknown as TravelCommerceEnv),
  COMMERCE_PROVIDER_SOURCE_REVISION: SOURCE_REVISION,
  COMMERCE_PROVIDER_STORAGE_REVISION: 'commerce-checkout-do-sqlite-v1',
  COMMERCE_PROVIDER_VERSION_ID: 'checkout-test-version',
  CHECKOUT_PROVIDER_AUTH_SECRET: AUTH_SECRET,
  MARKETPLACE_PROVIDER_AUTH_SECRET: 'marketplace-provider-graph-test-secret',
  ISSUANCE_SERVICE: {
    fetch: vi.fn(async (request: Request) => {
      const body = await request.json() as Record<string, unknown>
      return Response.json({
        ok: true,
        idempotencyKey: body.cascadeId,
        settlementId: 'settlement-owner-1',
        idempotentReplay: false,
        amountMinor: body.amountMinor,
        currency: body.currency,
        recordedAt: '2026-09-03T00:00:00.000Z',
        effect: 'charged',
        providerReference: 'provider-reference-1',
      })
    }),
  } as unknown as Fetcher,
}) as TravelCommerceEnv & Readonly<{
  CHECKOUT_PROVIDER_STORE: DurableObjectNamespace<CommerceCheckoutStore>
}>

const prepareBody = Object.freeze({
  contract: CHECKOUT_PROVIDER_CONTRACT,
  checkoutId: 'checkout-provider-1',
  intentId: 'intent-provider-1',
  agentId: 'agent-flight',
  offerId: 'offer-provider-1',
  offerReceiptDigest: 'a'.repeat(64),
  amountMinor: 12_500,
  budgetMinor: 20_000,
  currency: 'SGD',
  offerProviderRevision: SOURCE_REVISION,
  idempotencyKey: 'checkout-prepare:checkout-provider-1',
})

const bind = async (request: Request, runtime: ReturnType<typeof providerEnv>): Promise<Request> => {
  const pin = await runtimeEvidencePin(runtime, CHECKOUT_EVIDENCE_CHECKS)
  if (!pin) throw new Error('test evidence pin unavailable')
  const body = request.body ? await request.clone().text() : ''
  const requestDigest = await sha256Hex(canonicalJson({
    method: request.method.toUpperCase(),
    url: request.url,
    semanticHeaders: Object.fromEntries([
      'accept', 'content-type', 'mcp-protocol-version', 'mcp-session-id',
      'x-commerce-contract', 'x-operator-id',
      ...AUTHORING_MUTATION_HEADER_NAMES,
    ].map((name) => [name, request.headers.get(name)])),
    bodyDigest: await sha256Hex(body),
  }))
  const requiredCheckSetDigest = await sha256Hex(canonicalJson([...CHECKOUT_EVIDENCE_CHECKS].sort()))
  const bindingDigest = await sha256Hex(canonicalJson({ ...pin, requiredCheckSetDigest, requestDigest }))
  const headers = new Headers(request.headers)
  headers.set('x-commerce-evidence-source-revision', pin.sourceRevision)
  headers.set('x-commerce-evidence-receipt-digest', pin.receiptDigest)
  headers.set('x-commerce-evidence-storage-revision', pin.storageCompatibilityRevision)
  headers.set('x-commerce-evidence-provider-version', pin.providerVersionId)
  headers.set('x-commerce-evidence-required-check-set-digest', requiredCheckSetDigest)
  headers.set('x-commerce-provider-request-digest', requestDigest)
  headers.set('x-commerce-provider-binding-digest', bindingDigest)
  const bound = new Request(request, { headers })
  const authenticated = await authenticateCommerceProviderRequest(bound, {
    contract: CHECKOUT_PROVIDER_CONTRACT,
    requestDigest,
    bindingDigest,
  }, AUTH_SECRET)
  if (!authenticated) throw new Error('test checkout provider authentication unavailable')
  return authenticated
}

const operation = async (
  runtime: ReturnType<typeof providerEnv>,
  path: string,
  method: string,
  body?: unknown,
): Promise<Response> => {
  const request = new Request(`https://checkout-provider.internal${path}`, {
    method,
    headers: {
      ...(body === undefined ? { accept: 'application/json' } : { 'content-type': 'application/json' }),
      'x-commerce-contract': CHECKOUT_PROVIDER_CONTRACT,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const response = await handleCommerceCheckoutProvider(await bind(request, runtime), runtime)
  if (!response) throw new Error('checkout provider did not handle test route')
  return response
}

describe('Commerce checkout provider adapter', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('fails closed when operational evidence headers are absent', async () => {
    const runtime = providerEnv()
    const response = await handleCommerceCheckoutProvider(new Request(
      'https://checkout-provider.internal/internal/v1/checkouts/prepare',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-commerce-contract': CHECKOUT_PROVIDER_CONTRACT },
        body: JSON.stringify(prepareBody),
      },
    ), runtime)
    expect(response?.status).toBe(409)
    await expect(response?.json()).resolves.toMatchObject({ code: 'operational_evidence_binding_invalid' })
  })

  it('authenticates capabilities and fails closed for missing or unconfigured secrets', async () => {
    const runtime = providerEnv()
    const unsigned = new Request('https://checkout-provider.internal/v1/capabilities', {
      headers: { accept: 'application/json', 'x-commerce-contract': CHECKOUT_PROVIDER_CONTRACT },
    })
    const missing = await handleCommerceCheckoutProvider(unsigned, runtime)
    expect(missing?.status).toBe(401)
    await expect(missing?.json()).resolves.toMatchObject({ code: 'provider_authentication_invalid' })
    const signed = await authenticateCommerceProviderControlRequest(unsigned, CHECKOUT_PROVIDER_CONTRACT, AUTH_SECRET)
    expect(signed).not.toBeNull()
    const accepted = await handleCommerceCheckoutProvider(signed!, runtime)
    expect(accepted?.status).toBe(200)
    await expect(accepted?.json()).resolves.toMatchObject({
      ok: true,
      contract: CHECKOUT_PROVIDER_CONTRACT,
      operations: ['prepare', 'confirm', 'status', 'offer-observe'],
    })
    const unconfigured = await handleCommerceCheckoutProvider(signed!, {
      ...runtime,
      CHECKOUT_PROVIDER_AUTH_SECRET: 'short',
    })
    expect(unconfigured?.status).toBe(503)
    await expect(unconfigured?.json()).resolves.toMatchObject({ code: 'provider_authentication_unconfigured' })
  })

  it('rejects a wrong operation signature before Durable Object or Issuance access', async () => {
    const base = providerEnv()
    const getByName = vi.fn(() => { throw new Error('Durable Object must not be reached') })
    const runtime = {
      ...base,
      CHECKOUT_PROVIDER_STORE: { getByName } as unknown as DurableObjectNamespace<CommerceCheckoutStore>,
    }
    const unsigned = new Request('https://checkout-provider.internal/internal/v1/checkouts/prepare', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-commerce-contract': CHECKOUT_PROVIDER_CONTRACT },
      body: JSON.stringify(prepareBody),
    })
    const signed = await bind(unsigned, runtime)
    const headers = new Headers(signed.headers)
    headers.set('x-commerce-provider-auth-signature', '0'.repeat(64))
    const response = await handleCommerceCheckoutProvider(new Request(signed, { headers }), runtime)
    expect(response?.status).toBe(401)
    await expect(response?.json()).resolves.toMatchObject({ code: 'provider_authentication_invalid' })
    expect(getByName).not.toHaveBeenCalled()
    expect(base.ISSUANCE_SERVICE.fetch).not.toHaveBeenCalled()
  })

  it('cancels an oversized chunked operational body before complete buffering', async () => {
    const runtime = providerEnv()
    let emitted = 0
    let cancelled = false
    const request = new Request('https://checkout-provider.internal/internal/v1/checkouts/prepare', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-commerce-contract': CHECKOUT_PROVIDER_CONTRACT },
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          if (emitted >= 128) { controller.close(); return }
          controller.enqueue(new Uint8Array(1_024).fill(0x20))
          emitted += 1
        },
        cancel() { cancelled = true },
      }),
    })
    expect(await readBoundProviderRequest(request, runtime, CHECKOUT_EVIDENCE_CHECKS)).toBeNull()
    expect(cancelled).toBe(true)
    expect(emitted).toBeLessThan(128)
  })

  it('persists guardrail proof, issues once under the stable key, and replays byte-identically', async () => {
    const runtime = providerEnv()
    const prepared = await operation(runtime, '/internal/v1/checkouts/prepare', 'POST', prepareBody)
    expect(prepared.status).toBe(200)
    const preparedPayload = await prepared.json() as Record<string, unknown>
    const guardrailReceipt = preparedPayload.guardrailReceipt as Record<string, unknown>
    expect(guardrailReceipt.providerRevision).toBe(SOURCE_REVISION)

    const confirmation = Object.freeze({
      contract: CHECKOUT_PROVIDER_CONTRACT,
      checkoutId: prepareBody.checkoutId,
      offerId: prepareBody.offerId,
      amountMinor: prepareBody.amountMinor,
      currency: prepareBody.currency,
      guardrailReceipt,
      guardrailReceiptDigest: guardrailReceipt.receiptDigest,
      humanConfirmationDigest: 'b'.repeat(64),
      idempotencyKey: `checkout-confirm:${prepareBody.checkoutId}`,
    })
    const first = await operation(runtime, '/internal/v1/checkouts/confirm', 'POST', confirmation)
    const firstBytes = await first.text()
    expect(first.status).toBe(200)
    const replay = await operation(runtime, '/internal/v1/checkouts/confirm', 'POST', confirmation)
    expect(replay.status).toBe(200)
    expect(await replay.text()).toBe(firstBytes)
    expect(runtime.ISSUANCE_SERVICE.fetch).toHaveBeenCalledTimes(1)

    const status = await operation(
      runtime,
      `/internal/v1/checkouts/status?idempotencyKey=${encodeURIComponent(confirmation.idempotencyKey)}`,
      'GET',
    )
    expect(status.status).toBe(200)
    expect(await status.text()).toBe(firstBytes)

    const observation = await operation(
      runtime,
      `/internal/v1/offers/${prepareBody.offerId}/observe?agentId=${prepareBody.agentId}`,
      'GET',
    )
    await expect(observation.json()).resolves.toMatchObject({
      ok: true,
      observed: { priceMinor: prepareBody.amountMinor, available: true },
    })
  })

  it('rejects semantic reuse of a checkout identifier without calling Issuance Service', async () => {
    const runtime = providerEnv()
    expect((await operation(runtime, '/internal/v1/checkouts/prepare', 'POST', prepareBody)).status).toBe(200)
    const conflict = await operation(runtime, '/internal/v1/checkouts/prepare', 'POST', {
      ...prepareBody,
      amountMinor: prepareBody.amountMinor + 1,
    })
    expect(conflict.status).toBe(409)
    await expect(conflict.json()).resolves.toMatchObject({ code: 'checkout_prepare_precondition_failed' })
    expect(runtime.ISSUANCE_SERVICE.fetch).not.toHaveBeenCalled()
  })
})
