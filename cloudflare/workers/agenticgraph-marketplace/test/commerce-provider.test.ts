import { applyD1Migrations, env, reset, SELF, type D1Migration } from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AUTHORING_MUTATION_HEADER_NAMES,
  MARKETPLACE_EVIDENCE_CHECKS,
  MARKETPLACE_PROVIDER_CONTRACT,
  canonicalJson,
  runtimeEvidencePin,
  sha256Hex,
  type AuthoringMutationPermit,
} from '../../commerce-provider-contract.ts'
import {
  authenticateCommerceProviderControlRequest,
  authenticateCommerceProviderRequest,
} from '../../commerce-provider-auth.ts'
import { handleMarketplaceProviderRequest } from '../src/commerce-provider.ts'

type TestEnv = MarketplaceEnv & Readonly<{ TEST_MIGRATIONS: D1Migration[] }>

const runtime = env as TestEnv
const AUTH_SECRET = 'marketplace-provider-graph-test-secret'

beforeEach(async () => {
  await applyD1Migrations(runtime.MARKETPLACE_DB, runtime.TEST_MIGRATIONS)
})

afterEach(() => reset())

describe('commerce marketplace provider', () => {
  it('rejects metadata placeholders and accepts exact injected test metadata', async () => {
    await expect(runtimeEvidencePin({
      COMMERCE_PROVIDER_SOURCE_REVISION: '0'.repeat(40),
      COMMERCE_PROVIDER_STORAGE_REVISION: 'marketplace-d1-0017',
      COMMERCE_PROVIDER_VERSION_ID: '',
    }, MARKETPLACE_EVIDENCE_CHECKS)).resolves.toBeNull()
    expect((await SELF.fetch('https://marketplace.internal/livez')).status).toBe(200)
    expect((await SELF.fetch('https://marketplace.internal/readyz')).status).toBe(200)
    const evidence = await SELF.fetch('https://marketplace.internal/v1/runtime-evidence')
    expect(evidence.status).toBe(200)
    await expect(evidence.json()).resolves.toMatchObject({
      ok: true,
      contract: MARKETPLACE_PROVIDER_CONTRACT,
      evidence: { sourceRevision: '1234567890abcdef1234567890abcdef12345678' },
    })
  })

  it('authenticates capabilities before returning provider data', async () => {
    const unsigned = new Request('https://marketplace.internal/v1/capabilities', {
      headers: { accept: 'application/json', 'x-commerce-contract': MARKETPLACE_PROVIDER_CONTRACT },
    })
    const missing = await handleMarketplaceProviderRequest(unsigned, runtime)
    expect(missing?.status).toBe(401)
    await expect(missing?.json()).resolves.toMatchObject({ ok: false, code: 'provider_authentication_invalid' })

    const signed = await authenticateCommerceProviderControlRequest(
      unsigned,
      MARKETPLACE_PROVIDER_CONTRACT,
      AUTH_SECRET,
    )
    expect(signed).not.toBeNull()
    const accepted = await handleMarketplaceProviderRequest(signed!, runtime)
    expect(accepted?.status).toBe(200)
    await expect(accepted?.json()).resolves.toMatchObject({
      ok: true,
      contract: MARKETPLACE_PROVIDER_CONTRACT,
      operations: ['vendor-list', 'vendor-transition-fenced', 'settlement-read'],
    })

    const unconfigured = await handleMarketplaceProviderRequest(signed!, {
      ...runtime,
      MARKETPLACE_PROVIDER_AUTH_SECRET: '__REPLACE_WITH_SECRET__',
    })
    expect(unconfigured?.status).toBe(503)
    await expect(unconfigured?.json()).resolves.toMatchObject({ ok: false, code: 'provider_authentication_unconfigured' })
  })

  it('rejects a wrong operation signature before any D1 access', async () => {
    const signed = await evidenceBoundRequest('https://marketplace.internal/v1/vendors')
    const headers = new Headers(signed.headers)
    headers.set('x-commerce-provider-auth-signature', '0'.repeat(64))
    const prepare = vi.fn(() => { throw new Error('D1 must not be reached') })
    const response = await handleMarketplaceProviderRequest(new Request(signed, { headers }), {
      ...runtime,
      MARKETPLACE_DB: { prepare } as unknown as D1Database,
    })
    expect(response?.status).toBe(401)
    await expect(response?.json()).resolves.toMatchObject({ code: 'provider_authentication_invalid' })
    expect(prepare).not.toHaveBeenCalled()
  })

  it('lists D1-owned vendors and requires evidence on settlement reads', async () => {
    const vendors = await SELF.fetch(await evidenceBoundRequest('https://marketplace.internal/v1/vendors'))
    expect(vendors.status).toBe(200)
    const vendorBody = await vendors.json() as { vendors: Record<string, unknown>[] }
    expect(vendorBody).toMatchObject({
      ok: true,
      contract: MARKETPLACE_PROVIDER_CONTRACT,
      vendors: expect.arrayContaining([{
        vendorId: 'agent-flight',
        actorId: 'repository-migration-0016',
        state: 'active',
        mutationId: 'migration:0016:agent-flight',
      }]),
    })
    expect(Object.keys(vendorBody).sort()).toEqual(['contract', 'ok', 'vendors'])
    expect(vendorBody.vendors.every((vendor) => Object.keys(vendor).sort().join(',')
      === 'actorId,mutationId,state,vendorId')).toBe(true)

    const unbound = await SELF.fetch('https://marketplace.internal/v1/settlements/split-missing')
    expect(unbound.status).toBe(409)
    await expect(unbound.json()).resolves.toMatchObject({ code: 'operational_evidence_binding_invalid' })

    await runtime.MARKETPLACE_DB.batch([
      runtime.MARKETPLACE_DB.prepare(
        `INSERT INTO marketplace_vendor_split_projection (
          split_id, bundle_id, vendor_id, leg_ids, settlement_currency, gross_amount_minor,
          commission_amount_minor, net_payout_amount_minor, commission_rule_id,
          commission_rule_revision, projected_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind('split-provider-test', 'bundle-provider-test', 'agent-flight', '["flight"]', 'SGD', 100, 10, 90,
        'travel-standard', '1', '2026-09-03T00:00:00.000Z'),
      runtime.MARKETPLACE_DB.prepare(
        `INSERT INTO marketplace_payout (
          payout_id, split_id, idempotency_key, payout_state, attempt_count,
          settlement_reference, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind('payout-provider-test', 'split-provider-test', 'payout-key-provider-test', 'settled', 1,
        'settlement-provider-test', '2026-09-03T00:00:01.000Z'),
    ])
    const request = await evidenceBoundRequest('https://marketplace.internal/v1/settlements/split-provider-test')
    const settlement = await SELF.fetch(request)
    expect(settlement.status).toBe(200)
    const settlementBody = await settlement.json() as Record<string, unknown>
    expect(settlementBody).toMatchObject({
      ok: true,
      contract: MARKETPLACE_PROVIDER_CONTRACT,
      splitId: 'split-provider-test',
      state: 'settled',
      amountMinor: 90,
      currency: 'SGD',
    })
    expect(Object.keys(settlementBody).sort()).toEqual([
      'amountMinor', 'contract', 'currency', 'ok', 'splitId', 'state',
    ])
    await expectEvidenceEcho(settlement, request)
  })

  it('commits one fenced transition and returns the immutable outcome on exact replay', async () => {
    const reservedAtMs = Date.parse('2026-09-03T00:00:00.000Z')
    const leaseExpiresAtMs = reservedAtMs + 60_000
    const first = await transitionRequest({
      vendorId: 'agent-flight',
      actorId: 'operator-provider-test',
      state: 'suspended',
      leaseEpoch: 2,
      mutationSequence: 1,
      reservedAtMs,
      leaseExpiresAtMs,
    })
    const replay = new Request(first.url, {
      method: first.method,
      headers: first.headers,
      body: await first.clone().text(),
    })
    const driftedPermitHeaders = new Headers(first.headers)
    driftedPermitHeaders.set('x-authoring-lease-expires-at-ms', String(leaseExpiresAtMs + 120_000))
    const driftedPermit = new Request(first.url, {
      method: first.method,
      headers: driftedPermitHeaders,
      body: await first.clone().text(),
    })
    const firstResponse = await providerRequest(first, reservedAtMs)
    expect(firstResponse.status).toBe(200)
    const firstBody = await firstResponse.clone().json()
    expect(firstBody).toMatchObject({
      ok: true,
      contract: MARKETPLACE_PROVIDER_CONTRACT,
      vendorId: 'agent-flight',
      actorId: 'operator-provider-test',
      state: 'suspended',
    })
    expect(Object.keys(firstBody as Record<string, unknown>).sort()).toEqual([
      'actorId', 'contract', 'mutationId', 'ok', 'state', 'vendorId',
    ])
    await expectFenceEcho(firstResponse, first)

    const beforeReplay = await durableSnapshot('agent-flight')
    const vendors = await SELF.fetch(await evidenceBoundRequest('https://marketplace.internal/v1/vendors'))
    await expect(vendors.json()).resolves.toMatchObject({
      vendors: expect.arrayContaining([{
        vendorId: 'agent-flight',
        actorId: 'operator-provider-test',
        state: 'suspended',
        mutationId: expect.stringMatching(/^mutation:2:1:/u),
      }]),
    })
    const replayResponse = await providerRequest(replay, leaseExpiresAtMs + 1)
    expect(replayResponse.status).toBe(200)
    await expect(replayResponse.json()).resolves.toEqual(firstBody)
    expect(await durableSnapshot('agent-flight')).toEqual(beforeReplay)

    const driftedResponse = await providerRequest(driftedPermit, leaseExpiresAtMs + 1)
    expect(driftedResponse.status).toBe(409)
    await expect(driftedResponse.json()).resolves.toMatchObject({ code: 'operational_evidence_binding_invalid' })
    expect(await durableSnapshot('agent-flight')).toEqual(beforeReplay)
  })

  it('rejects a forged high-epoch permit after evidence rebinding with zero writes', async () => {
    const accepted = await transitionRequest({
      vendorId: 'agent-experience', actorId: 'operator-auth-test', state: 'suspended',
      leaseEpoch: 5, mutationSequence: 1,
    })
    const forgedHeaders = new Headers(accepted.headers)
    forgedHeaders.set('x-authoring-lease-epoch', '999999')
    const oldSignature = accepted.headers.get('x-commerce-provider-auth-signature')!
    const forgedUnsigned = new Request(accepted.url, {
      method: accepted.method,
      headers: forgedHeaders,
      body: await accepted.clone().text(),
    })
    const rebound = await evidenceBoundRequest(forgedUnsigned, false)
    const reboundHeaders = new Headers(rebound.headers)
    reboundHeaders.set('x-commerce-provider-auth-schema', 'commerce-provider-auth/v1')
    reboundHeaders.set('x-commerce-provider-auth-signature', oldSignature)
    const forged = new Request(rebound, { headers: reboundHeaders })
    const baseline = await durableSnapshot('agent-experience')
    const response = await SELF.fetch(forged)
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: 'provider_authentication_invalid' })
    expect(await durableSnapshot('agent-experience')).toEqual(baseline)
  })

  it('rejects an expired permit on first use with zero writes', async () => {
    const reservedAtMs = Date.parse('2026-09-03T00:00:00.000Z')
    const leaseExpiresAtMs = reservedAtMs + 60_000
    const request = await transitionRequest({
      vendorId: 'agent-experience',
      actorId: 'operator-expired-first-use',
      state: 'suspended',
      leaseEpoch: 4,
      mutationSequence: 1,
      reservedAtMs,
      leaseExpiresAtMs,
    })
    const baseline = await durableSnapshot('agent-experience')
    const response = await providerRequest(request, leaseExpiresAtMs)
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'authoring_mutation_lease_expired' })
    expect(await durableSnapshot('agent-experience')).toEqual(baseline)
  })

  it('performs zero writes for stale and same-sequence conflicting permits', async () => {
    const accepted = await transitionRequest({
      vendorId: 'agent-hotel',
      actorId: 'operator-provider-test',
      state: 'suspended',
      leaseEpoch: 8,
      mutationSequence: 1,
    })
    expect((await SELF.fetch(accepted)).status).toBe(200)
    const baseline = await durableSnapshot('agent-hotel')

    const stale = await transitionRequest({
      vendorId: 'agent-hotel',
      actorId: 'operator-provider-test',
      state: 'approved',
      leaseEpoch: 7,
      mutationSequence: 99,
    })
    const staleResponse = await SELF.fetch(stale)
    expect(staleResponse.status).toBe(409)
    await expect(staleResponse.json()).resolves.toMatchObject({ code: 'authoring_mutation_fence_stale' })
    expect(await durableSnapshot('agent-hotel')).toEqual(baseline)

    const conflict = await transitionRequest({
      vendorId: 'agent-hotel',
      actorId: 'operator-other',
      state: 'approved',
      leaseEpoch: 8,
      mutationSequence: 1,
      claimId: 'claim-conflicting-provider-test',
      fenceRevision: 'fence-conflicting-provider-test',
    })
    const conflictResponse = await SELF.fetch(conflict)
    expect(conflictResponse.status).toBe(409)
    await expect(conflictResponse.json()).resolves.toMatchObject({ code: 'authoring_mutation_fence_conflict' })
    expect(await durableSnapshot('agent-hotel')).toEqual(baseline)
  })

  it('rejects payloads not bound to the commerce authoring digest without writes', async () => {
    const request = await transitionRequest({
      vendorId: 'agent-experience',
      actorId: 'operator-provider-test',
      state: 'suspended',
      leaseEpoch: 3,
      mutationSequence: 1,
      digestState: 'approved',
    })
    const baseline = await durableSnapshot('agent-experience')
    const response = await SELF.fetch(request)
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'authoring_mutation_payload_mismatch' })
    expect(await durableSnapshot('agent-experience')).toEqual(baseline)
  })

  it('serializes concurrent same-sequence conflicts to one durable outcome', async () => {
    const common = {
      vendorId: 'agent-shopping',
      state: 'suspended',
      leaseEpoch: 13,
      mutationSequence: 1,
      claimId: 'claim-agent-shopping-v13',
      fenceRevision: 'fence-agent-shopping-v13',
    }
    const [left, right] = await Promise.all([
      transitionRequest({ ...common, actorId: 'operator-concurrent-left' }),
      transitionRequest({ ...common, actorId: 'operator-concurrent-right' }),
    ])
    const responses = await Promise.all([SELF.fetch(left), SELF.fetch(right)])
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409])
    const snapshot = await durableSnapshot('agent-shopping') as {
      vendor: Record<string, unknown>[]
      fences: Record<string, unknown>[]
      outcomes: Record<string, unknown>[]
    }
    expect(snapshot.vendor).toEqual([expect.objectContaining({ lifecycle_state: 'suspended' })])
    expect(snapshot.fences).toHaveLength(1)
    expect(snapshot.outcomes).toHaveLength(1)
  })
})

type TransitionRequest = Readonly<{
  vendorId: string
  actorId: string
  state: string
  leaseEpoch: number
  mutationSequence: number
  claimId?: string
  fenceRevision?: string
  digestState?: string
  reservedAtMs?: number
  leaseExpiresAtMs?: number
}>

async function transitionRequest(input: TransitionRequest): Promise<Request> {
  const semanticScope = `vendor:${input.vendorId}`
  const requestDigest = await sha256Hex(canonicalJson({
    schema: 'agentic-graph-authoring-operation/v1',
    semanticScope,
    writeTarget: semanticScope,
    payload: {
      vendorId: input.vendorId,
      actorId: input.actorId,
      state: input.digestState ?? input.state,
    },
  }))
  const reservedAtMs = input.reservedAtMs ?? Date.now()
  const permit: AuthoringMutationPermit = Object.freeze({
    schema: 'agentic-graph-authoring-mutation-permit/v2',
    mutationId: `mutation:${input.leaseEpoch}:${input.mutationSequence}:${requestDigest.slice(0, 32)}`,
    operationId: `operation:${requestDigest}`,
    requestDigest,
    mutationSequence: input.mutationSequence,
    semanticScope,
    claimId: input.claimId ?? `claim-${input.vendorId}-v${input.leaseEpoch}`,
    leaseEpoch: input.leaseEpoch,
    leaseExpiresAtMs: input.leaseExpiresAtMs ?? reservedAtMs + 60_000,
    fenceRevision: input.fenceRevision ?? `fence-${input.vendorId}-v${input.leaseEpoch}`,
    requiredWriteTarget: semanticScope,
    reservedAtMs,
  })
  const request = new Request(`https://marketplace.internal/v1/vendors/${encodeURIComponent(input.vendorId)}/transition`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-commerce-contract': MARKETPLACE_PROVIDER_CONTRACT,
      'x-operator-id': input.actorId,
      ...authoringHeaders(permit),
    },
    body: JSON.stringify({ state: input.state }),
  })
  return evidenceBoundRequest(request)
}

async function providerRequest(request: Request, nowMs: number): Promise<Response> {
  const response = await handleMarketplaceProviderRequest(request, runtime, nowMs)
  if (!response) throw new Error('marketplace provider route was not handled')
  return response
}

async function evidenceBoundRequest(input: RequestInfo | URL, authenticate = true): Promise<Request> {
  const request = input instanceof Request ? input : new Request(input, {
    headers: { accept: 'application/json', 'x-commerce-contract': MARKETPLACE_PROVIDER_CONTRACT },
  })
  const pin = await runtimeEvidencePin(runtime, MARKETPLACE_EVIDENCE_CHECKS)
  if (!pin) throw new Error('test provider evidence is not configured')
  const requiredCheckSetDigest = await sha256Hex(canonicalJson([...MARKETPLACE_EVIDENCE_CHECKS].sort()))
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
  const bindingDigest = await sha256Hex(canonicalJson({ ...pin, requiredCheckSetDigest, requestDigest }))
  const headers = new Headers(request.headers)
  for (const [name, value] of Object.entries({
    'x-commerce-evidence-source-revision': pin.sourceRevision,
    'x-commerce-evidence-receipt-digest': pin.receiptDigest,
    'x-commerce-evidence-storage-revision': pin.storageCompatibilityRevision,
    'x-commerce-evidence-provider-version': pin.providerVersionId,
    'x-commerce-evidence-required-check-set-digest': requiredCheckSetDigest,
    'x-commerce-provider-request-digest': requestDigest,
    'x-commerce-provider-binding-digest': bindingDigest,
  })) headers.set(name, value)
  const bound = new Request(request, { headers })
  if (!authenticate) return bound
  const signed = await authenticateCommerceProviderRequest(bound, {
    contract: MARKETPLACE_PROVIDER_CONTRACT,
    requestDigest,
    bindingDigest,
  }, AUTH_SECRET)
  if (!signed) throw new Error('test provider authentication is not configured')
  return signed
}

function authoringHeaders(permit: AuthoringMutationPermit): Readonly<Record<string, string>> {
  return Object.freeze({
    'x-authoring-mutation-contract': permit.schema,
    'x-authoring-mutation-id': permit.mutationId,
    'x-authoring-operation-id': permit.operationId,
    'x-authoring-request-digest': permit.requestDigest,
    'x-authoring-mutation-sequence': String(permit.mutationSequence),
    'x-authoring-semantic-scope': permit.semanticScope,
    'x-authoring-claim-id': permit.claimId,
    'x-authoring-lease-epoch': String(permit.leaseEpoch),
    'x-authoring-lease-expires-at-ms': String(permit.leaseExpiresAtMs),
    'x-authoring-fence-revision': permit.fenceRevision,
    'x-authoring-write-target': permit.requiredWriteTarget,
    'x-authoring-reserved-at-ms': String(permit.reservedAtMs),
  })
}

async function expectEvidenceEcho(response: Response, request: Request): Promise<void> {
  for (const name of [
    'x-commerce-evidence-source-revision',
    'x-commerce-evidence-receipt-digest',
    'x-commerce-evidence-storage-revision',
    'x-commerce-evidence-provider-version',
    'x-commerce-evidence-required-check-set-digest',
    'x-commerce-provider-request-digest',
    'x-commerce-provider-binding-digest',
  ]) expect(response.headers.get(name), name).toBe(request.headers.get(name))
}

async function expectFenceEcho(response: Response, request: Request): Promise<void> {
  await expectEvidenceEcho(response, request)
  for (const name of [
    'x-authoring-mutation-contract',
    'x-authoring-mutation-id',
    'x-authoring-operation-id',
    'x-authoring-request-digest',
    'x-authoring-mutation-sequence',
    'x-authoring-semantic-scope',
    'x-authoring-claim-id',
    'x-authoring-lease-epoch',
    'x-authoring-lease-expires-at-ms',
    'x-authoring-fence-revision',
    'x-authoring-write-target',
    'x-authoring-reserved-at-ms',
  ]) expect(response.headers.get(name), name).toBe(request.headers.get(name))
}

async function durableSnapshot(vendorId: string): Promise<unknown> {
  const [vendor, fences, outcomes] = await runtime.MARKETPLACE_DB.batch([
    runtime.MARKETPLACE_DB.prepare(
      'SELECT vendor_id, lifecycle_state, updated_at FROM marketplace_vendor WHERE vendor_id = ?',
    ).bind(vendorId),
    runtime.MARKETPLACE_DB.prepare(
      'SELECT * FROM marketplace_authoring_fence WHERE semantic_scope = ? ORDER BY semantic_scope',
    ).bind(`vendor:${vendorId}`),
    runtime.MARKETPLACE_DB.prepare(
      'SELECT * FROM marketplace_authoring_outcome WHERE vendor_id = ? ORDER BY mutation_id',
    ).bind(vendorId),
  ])
  return { vendor: vendor.results, fences: fences.results, outcomes: outcomes.results }
}
