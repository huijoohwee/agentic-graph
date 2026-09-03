export const DISCOVERY_PROVIDER_CONTRACT = 'commerce.discovery-provider/v1'
export const CHECKOUT_PROVIDER_CONTRACT = 'commerce.checkout-provider/v1'
export const MARKETPLACE_PROVIDER_CONTRACT = 'commerce.marketplace-provider/v1'
export const UPSTREAM_RUNTIME_EVIDENCE_SCHEMA = 'commerce.upstream-runtime-evidence/v1'
export const COMMERCE_PRD_REVISION = '0.3.0'

export const DISCOVERY_EVIDENCE_CHECKS = Object.freeze([
  'invocation_catalog_parity',
  'offer_receipt_binding',
  'registered_agent_dispatch',
])
export const CHECKOUT_EVIDENCE_CHECKS = Object.freeze([
  'guardrail_before_confirmation',
  'human_confirmation_before_issuance',
  'issuance_only_payment_caller',
  'settlement_readback',
])
export const MARKETPLACE_EVIDENCE_CHECKS = Object.freeze([
  'active_vendor_at_dispatch',
  'authoring_fence_atomic',
  'commission_reproduction',
  'payout_idempotency',
  'registry_canvas_parity',
  'same_transaction_split_projection',
  'settlement_verified_before_payout',
  'stored_row_reconstruction',
])

const MAX_OPERATION_BODY_BYTES = 65_536
const SHA256_PATTERN = /^[0-9a-f]{64}$/u
const SOURCE_REVISION_PATTERN = /^[0-9a-f]{40}$/u
const STORAGE_REVISION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u
const VERSION_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u

const EVIDENCE_HEADERS = Object.freeze({
  sourceRevision: 'x-commerce-evidence-source-revision',
  receiptDigest: 'x-commerce-evidence-receipt-digest',
  storageCompatibilityRevision: 'x-commerce-evidence-storage-revision',
  providerVersionId: 'x-commerce-evidence-provider-version',
  requiredCheckSetDigest: 'x-commerce-evidence-required-check-set-digest',
  requestDigest: 'x-commerce-provider-request-digest',
  bindingDigest: 'x-commerce-provider-binding-digest',
})

const AUTHORING_HEADERS = Object.freeze({
  schema: 'x-authoring-mutation-contract',
  mutationId: 'x-authoring-mutation-id',
  operationId: 'x-authoring-operation-id',
  requestDigest: 'x-authoring-request-digest',
  mutationSequence: 'x-authoring-mutation-sequence',
  semanticScope: 'x-authoring-semantic-scope',
  claimId: 'x-authoring-claim-id',
  leaseEpoch: 'x-authoring-lease-epoch',
  leaseExpiresAtMs: 'x-authoring-lease-expires-at-ms',
  fenceRevision: 'x-authoring-fence-revision',
  requiredWriteTarget: 'x-authoring-write-target',
  reservedAtMs: 'x-authoring-reserved-at-ms',
})
export const AUTHORING_MUTATION_HEADER_NAMES = Object.freeze(Object.values(AUTHORING_HEADERS))

export type ProviderRuntimeEnv = Readonly<{
  COMMERCE_PROVIDER_SOURCE_REVISION?: string
  COMMERCE_PROVIDER_STORAGE_REVISION?: string
  COMMERCE_PROVIDER_VERSION_ID?: string
}>

export type ProviderEvidencePin = Readonly<{
  sourceRevision: string
  receiptDigest: string
  storageCompatibilityRevision: string
  providerVersionId: string
}>

export type ProviderBinding = Readonly<{
  pin: ProviderEvidencePin
  requiredCheckSetDigest: string
  requestDigest: string
  bindingDigest: string
}>

export type BoundProviderRequest = Readonly<{
  request: Request
  binding: ProviderBinding
}>

export type AuthoringMutationPermit = Readonly<{
  schema: 'agentic-graph-authoring-mutation-permit/v2'
  mutationId: string
  operationId: string
  requestDigest: string
  mutationSequence: number
  semanticScope: string
  claimId: string
  leaseEpoch: number
  leaseExpiresAtMs: number
  fenceRevision: string
  requiredWriteTarget: string
  reservedAtMs: number
}>

export async function runtimeEvidenceResponse(
  env: ProviderRuntimeEnv,
  contract: string,
  checks: readonly string[],
): Promise<Response> {
  const configured = await runtimeEvidencePin(env, checks)
  if (!configured) {
    return providerJson({ ok: false, contract, code: 'provider_evidence_unconfigured' }, 503)
  }
  const evidence = Object.freeze({
    schema: UPSTREAM_RUNTIME_EVIDENCE_SCHEMA,
    prdRevision: COMMERCE_PRD_REVISION,
    sourceRevision: configured.sourceRevision,
    receiptDigest: configured.receiptDigest,
    storageCompatibilityRevision: configured.storageCompatibilityRevision,
    providerVersionId: configured.providerVersionId,
    checks: Object.freeze([...checks].sort(compareText).map((name) => Object.freeze({ name, ok: true }))),
  })
  return providerJson({ ok: true, contract, evidence })
}

export async function resolveProviderEvidence(env: ProviderRuntimeEnv): Promise<ProviderEvidencePin | null> {
  const sourceRevision = env.COMMERCE_PROVIDER_SOURCE_REVISION?.trim() ?? ''
  const storageCompatibilityRevision = env.COMMERCE_PROVIDER_STORAGE_REVISION?.trim() ?? ''
  const providerVersionId = env.COMMERCE_PROVIDER_VERSION_ID?.trim() ?? ''
  if (!SOURCE_REVISION_PATTERN.test(sourceRevision)
    || /^([0-9a-f])\1{39}$/u.test(sourceRevision)
    || !STORAGE_REVISION_PATTERN.test(storageCompatibilityRevision)
    || !VERSION_PATTERN.test(providerVersionId)) return null
  const evidenceWithoutReceipt = Object.freeze({
    schema: UPSTREAM_RUNTIME_EVIDENCE_SCHEMA,
    prdRevision: COMMERCE_PRD_REVISION,
    sourceRevision,
    storageCompatibilityRevision,
    providerVersionId,
    checks: Object.freeze([]),
  })
  return Object.freeze({
    sourceRevision,
    receiptDigest: await sha256Hex(canonicalJson(evidenceWithoutReceipt)),
    storageCompatibilityRevision,
    providerVersionId,
  })
}

export async function runtimeEvidencePin(
  env: ProviderRuntimeEnv,
  checks: readonly string[],
): Promise<ProviderEvidencePin | null> {
  const configured = await resolveProviderEvidence(env)
  if (!configured) return null
  const receiptDigest = await sha256Hex(canonicalJson({
    schema: UPSTREAM_RUNTIME_EVIDENCE_SCHEMA,
    prdRevision: COMMERCE_PRD_REVISION,
    sourceRevision: configured.sourceRevision,
    storageCompatibilityRevision: configured.storageCompatibilityRevision,
    providerVersionId: configured.providerVersionId,
    checks: [...checks].sort(compareText).map((name) => ({ name, ok: true })),
  }))
  return Object.freeze({ ...configured, receiptDigest })
}

export async function readBoundProviderRequest(
  request: Request,
  env: ProviderRuntimeEnv,
  requiredChecks: readonly string[],
): Promise<BoundProviderRequest | null> {
  const pin = await runtimeEvidencePin(env, requiredChecks)
  if (!pin) return null
  const normalizedChecks = normalizeChecks(requiredChecks)
  if (!normalizedChecks) return null
  const requiredCheckSetDigest = await sha256Hex(canonicalJson(normalizedChecks))
  const buffered = await boundedProviderRequest(request)
  if (!buffered) return null
  const requestDigest = await digestProviderRequest(buffered.request, buffered.bodyText)
  if (!requestDigest) return null
  const bindingDigest = await sha256Hex(canonicalJson({
    ...pin,
    requiredCheckSetDigest,
    requestDigest,
  }))
  const binding = Object.freeze({ pin, requiredCheckSetDigest, requestDigest, bindingDigest })
  return evidenceHeaderEntries(binding).every(([name, value]) => buffered.request.headers.get(name) === value)
    ? Object.freeze({ request: buffered.request, binding })
    : null
}

export function providerBindingHeaders(binding: ProviderBinding): Headers {
  return new Headers(Object.fromEntries(evidenceHeaderEntries(binding)))
}

export function parseAuthoringMutationPermit(request: Request): AuthoringMutationPermit | null {
  const mutationSequence = positiveInteger(request.headers.get(AUTHORING_HEADERS.mutationSequence))
  const leaseEpoch = positiveInteger(request.headers.get(AUTHORING_HEADERS.leaseEpoch))
  const leaseExpiresAtMs = positiveInteger(request.headers.get(AUTHORING_HEADERS.leaseExpiresAtMs))
  const reservedAtMs = nonnegativeInteger(request.headers.get(AUTHORING_HEADERS.reservedAtMs))
  const permit = {
    schema: request.headers.get(AUTHORING_HEADERS.schema),
    mutationId: request.headers.get(AUTHORING_HEADERS.mutationId),
    operationId: request.headers.get(AUTHORING_HEADERS.operationId),
    requestDigest: request.headers.get(AUTHORING_HEADERS.requestDigest),
    mutationSequence,
    semanticScope: request.headers.get(AUTHORING_HEADERS.semanticScope),
    claimId: request.headers.get(AUTHORING_HEADERS.claimId),
    leaseEpoch,
    leaseExpiresAtMs,
    fenceRevision: request.headers.get(AUTHORING_HEADERS.fenceRevision),
    requiredWriteTarget: request.headers.get(AUTHORING_HEADERS.requiredWriteTarget),
    reservedAtMs,
  }
  const identifier = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u
  if (permit.schema !== 'agentic-graph-authoring-mutation-permit/v2'
    || typeof permit.requestDigest !== 'string' || !SHA256_PATTERN.test(permit.requestDigest)
    || typeof permit.operationId !== 'string' || permit.operationId !== `operation:${permit.requestDigest}`
    || typeof permit.mutationId !== 'string'
    || permit.mutationId !== `mutation:${leaseEpoch}:${mutationSequence}:${permit.requestDigest.slice(0, 32)}`
    || typeof permit.semanticScope !== 'string' || !identifier.test(permit.semanticScope)
    || typeof permit.claimId !== 'string' || !identifier.test(permit.claimId)
    || typeof permit.fenceRevision !== 'string' || !identifier.test(permit.fenceRevision)
    || typeof permit.requiredWriteTarget !== 'string' || permit.requiredWriteTarget.length < 1
    || permit.requiredWriteTarget.length > 512
    || mutationSequence === null || leaseEpoch === null || leaseExpiresAtMs === null || reservedAtMs === null
    || reservedAtMs >= leaseExpiresAtMs) return null
  return permit as AuthoringMutationPermit
}

export function authoringMutationPermitIsLive(
  permit: AuthoringMutationPermit,
  nowMs = Date.now(),
): boolean {
  return Number.isSafeInteger(nowMs) && nowMs < permit.leaseExpiresAtMs
}

export function readAuthoringMutationPermit(request: Request): AuthoringMutationPermit | null {
  const permit = parseAuthoringMutationPermit(request)
  return permit && authoringMutationPermitIsLive(permit) ? permit : null
}

export async function verifyAuthoringMutationPayload(
  permit: AuthoringMutationPermit,
  semanticScope: string,
  writeTarget: string,
  payload: unknown,
): Promise<boolean> {
  if (permit.semanticScope !== semanticScope || permit.requiredWriteTarget !== writeTarget) return false
  return permit.requestDigest === await sha256Hex(canonicalJson({
    schema: 'agentic-graph-authoring-operation/v1',
    semanticScope,
    writeTarget,
    payload,
  }))
}

export function appendAuthoringMutationHeaders(headers: Headers, permit: AuthoringMutationPermit): Headers {
  headers.set(AUTHORING_HEADERS.schema, permit.schema)
  headers.set(AUTHORING_HEADERS.mutationId, permit.mutationId)
  headers.set(AUTHORING_HEADERS.operationId, permit.operationId)
  headers.set(AUTHORING_HEADERS.requestDigest, permit.requestDigest)
  headers.set(AUTHORING_HEADERS.mutationSequence, String(permit.mutationSequence))
  headers.set(AUTHORING_HEADERS.semanticScope, permit.semanticScope)
  headers.set(AUTHORING_HEADERS.claimId, permit.claimId)
  headers.set(AUTHORING_HEADERS.leaseEpoch, String(permit.leaseEpoch))
  headers.set(AUTHORING_HEADERS.leaseExpiresAtMs, String(permit.leaseExpiresAtMs))
  headers.set(AUTHORING_HEADERS.fenceRevision, permit.fenceRevision)
  headers.set(AUTHORING_HEADERS.requiredWriteTarget, permit.requiredWriteTarget)
  headers.set(AUTHORING_HEADERS.reservedAtMs, String(permit.reservedAtMs))
  return headers
}

export function providerJson(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('cache-control', 'no-store')
  responseHeaders.set('content-security-policy', "default-src 'none'; frame-ancestors 'none'")
  responseHeaders.set('x-content-type-options', 'nosniff')
  return Response.json(value, { status, headers: responseHeaders })
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value))
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function digestProviderRequest(request: Request, body: string): Promise<string | null> {
  try {
    const declaredLength = request.headers.get('content-length')
    if (declaredLength && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > MAX_OPERATION_BODY_BYTES)) {
      return null
    }
    return sha256Hex(canonicalJson({
      method: request.method.toUpperCase(),
      url: request.url,
      semanticHeaders: Object.fromEntries([
        'accept', 'content-type', 'mcp-protocol-version', 'mcp-session-id',
        'x-commerce-contract', 'x-operator-id',
        ...AUTHORING_MUTATION_HEADER_NAMES,
      ].map((name) => [name, request.headers.get(name)])),
      bodyDigest: await sha256Hex(body),
    }))
  } catch {
    return null
  }
}

async function boundedProviderRequest(
  request: Request,
): Promise<Readonly<{ request: Request; bodyText: string }> | null> {
  const declaredLength = request.headers.get('content-length')
  if (declaredLength && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > MAX_OPERATION_BODY_BYTES)) {
    await request.body?.cancel('provider-operation-body-too-large')
    return null
  }
  if (!request.body) return Object.freeze({ request, bodyText: '' })
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > MAX_OPERATION_BODY_BYTES) {
        await reader.cancel('provider-operation-body-too-large')
        return null
      }
      chunks.push(next.value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    const bodyText = new TextDecoder().decode(bytes)
    const replay = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: bytes,
      redirect: request.redirect,
      signal: request.signal,
    })
    return Object.freeze({ request: replay, bodyText })
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}

function evidenceHeaderEntries(binding: ProviderBinding): readonly (readonly [string, string])[] {
  return Object.freeze([
    [EVIDENCE_HEADERS.sourceRevision, binding.pin.sourceRevision],
    [EVIDENCE_HEADERS.receiptDigest, binding.pin.receiptDigest],
    [EVIDENCE_HEADERS.storageCompatibilityRevision, binding.pin.storageCompatibilityRevision],
    [EVIDENCE_HEADERS.providerVersionId, binding.pin.providerVersionId],
    [EVIDENCE_HEADERS.requiredCheckSetDigest, binding.requiredCheckSetDigest],
    [EVIDENCE_HEADERS.requestDigest, binding.requestDigest],
    [EVIDENCE_HEADERS.bindingDigest, binding.bindingDigest],
  ])
}

function normalizeChecks(checks: readonly string[]): readonly string[] | null {
  const normalized = [...new Set(checks)].sort(compareText)
  return checks.length > 0 && checks.length <= 128 && normalized.length === checks.length
    && normalized.every((name) => /^[a-z][a-z0-9_]{0,127}$/u.test(name))
    ? Object.freeze(normalized)
    : null
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalValue(entry)]))
  }
  return value
}

function positiveInteger(value: string | null): number | null {
  if (!value || !/^[1-9]\d*$/u.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function nonnegativeInteger(value: string | null): number | null {
  if (!value || !/^\d+$/u.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
