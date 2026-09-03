import {
  MARKETPLACE_EVIDENCE_CHECKS,
  MARKETPLACE_PROVIDER_CONTRACT,
  appendAuthoringMutationHeaders,
  authoringMutationPermitIsLive,
  canonicalJson,
  parseAuthoringMutationPermit,
  providerBindingHeaders,
  providerJson,
  readBoundProviderRequest,
  runtimeEvidencePin,
  runtimeEvidenceResponse,
  verifyAuthoringMutationPayload,
  type AuthoringMutationPermit,
  type BoundProviderRequest,
  type ProviderBinding,
} from '../../commerce-provider-contract.ts'
import {
  validCommerceProviderSecret,
  verifyCommerceProviderControlRequest,
  verifyCommerceProviderRequestAuthentication,
} from '../../commerce-provider-auth.ts'
import { isRecord, readJsonObject } from './http.ts'
import { MARKETPLACE_VENDOR_STATES } from '../../commerce-marketplace-provider-response-contract.ts'

const MAX_OPERATION_BODY_BYTES = 65_536
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u
const STATES = new Set<string>(MARKETPLACE_VENDOR_STATES)
const TRANSITIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  pending_review: ['approved'],
  approved: ['active', 'suspended'],
  active: ['suspended'],
  suspended: ['approved'],
})

type VendorRow = Readonly<{
  vendor_id: string
  lifecycle_state: string
  provenance_state: string | null
  actor_id: string | null
  mutation_id: string | null
}>

type SettlementRow = Readonly<{
  split_id: string
  bundle_id: string
  vendor_id: string
  leg_ids: string
  settlement_currency: string
  gross_amount_minor: number
  commission_amount_minor: number
  net_payout_amount_minor: number
  commission_rule_id: string
  commission_rule_revision: string
  payout_id: string | null
  payout_state: string | null
  attempt_count: number | null
  terminal_reason: string | null
  settlement_reference: string | null
  updated_at: string | null
}>

type TransitionSnapshot = Readonly<{
  lifecycle_state: string
  claim_id: string | null
  lease_epoch: number | null
  mutation_sequence: number | null
  fence_revision: string | null
  mutation_id: string | null
  request_digest: string | null
}>

type StoredOutcome = Readonly<{
  mutation_id: string
  operation_id: string
  request_digest: string
  permit_json: string
  semantic_scope: string
  claim_id: string
  lease_epoch: number
  mutation_sequence: number
  fence_revision: string
  vendor_id: string
  actor_id: string
  from_state: string
  to_state: string
  outcome_json: string
  applied: number
}>

type TransitionOutcome = Readonly<{
  ok: true
  contract: typeof MARKETPLACE_PROVIDER_CONTRACT
  vendorId: string
  state: string
  actorId: string
  mutationId: string
}>

type TransitionResult = Readonly<{
  status: number
  body: Readonly<Record<string, unknown>>
}>

export async function marketplaceProviderConfigured(env: MarketplaceEnv): Promise<boolean> {
  return validCommerceProviderSecret(env.MARKETPLACE_PROVIDER_AUTH_SECRET)
    && await runtimeEvidencePin(env, MARKETPLACE_EVIDENCE_CHECKS) !== null
}

export async function handleMarketplaceProviderRequest(
  request: Request,
  env: MarketplaceEnv,
  nowMs = Date.now(),
): Promise<Response | null> {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/v1/capabilities') {
    const authenticated = await providerControlAuthenticated(request, env)
    if (authenticated) return authenticated
    const configured = await marketplaceProviderConfigured(env)
    return providerJson({
      ok: configured,
      contract: MARKETPLACE_PROVIDER_CONTRACT,
      operations: ['vendor-list', 'vendor-transition-fenced', 'settlement-read'],
    }, configured ? 200 : 503)
  }
  if (request.method === 'GET' && url.pathname === '/v1/runtime-evidence') {
    return runtimeEvidenceResponse(env, MARKETPLACE_PROVIDER_CONTRACT, MARKETPLACE_EVIDENCE_CHECKS)
  }
  if (request.method === 'GET' && url.pathname === '/v1/vendors') {
    return listVendors(request, env)
  }
  if (request.method === 'GET' && /^\/v1\/settlements\/[^/]+$/u.test(url.pathname)) {
    return readSettlement(request, env, decodeURIComponent(url.pathname.split('/')[3] ?? ''))
  }
  if (request.method === 'POST' && /^\/v1\/vendors\/[^/]+\/transition$/u.test(url.pathname)) {
    return transitionVendor(request, env, decodeURIComponent(url.pathname.split('/')[3] ?? ''), nowMs)
  }
  return null
}

async function listVendors(request: Request, env: MarketplaceEnv): Promise<Response> {
  const authorized = await authenticatedProviderOperation(request, env)
  if (authorized instanceof Response) return authorized
  const rows = await env.MARKETPLACE_DB.prepare(
    `SELECT v.vendor_id, v.lifecycle_state, p.lifecycle_state AS provenance_state,
       p.actor_id, p.mutation_id
     FROM marketplace_vendor v LEFT JOIN marketplace_vendor_state_provenance p
       ON p.vendor_id = v.vendor_id
     ORDER BY v.vendor_id`,
  ).all<VendorRow>()
  if (rows.results.some((row) => row.provenance_state !== row.lifecycle_state
    || !IDENTIFIER_PATTERN.test(row.actor_id ?? '')
    || !IDENTIFIER_PATTERN.test(row.mutation_id ?? ''))) {
    return providerError('marketplace_vendor_provenance_invalid', 503)
  }
  return providerJson({
    ok: true,
    contract: MARKETPLACE_PROVIDER_CONTRACT,
    vendors: rows.results.map((row) => ({
      vendorId: row.vendor_id,
      actorId: row.actor_id,
      state: row.lifecycle_state,
      mutationId: row.mutation_id,
    })),
  })
}

async function readSettlement(request: Request, env: MarketplaceEnv, splitId: string): Promise<Response> {
  const authorized = await authenticatedProviderOperation(request, env)
  if (authorized instanceof Response) return authorized
  if (!IDENTIFIER_PATTERN.test(splitId)) return providerError('settlement_id_malformed', 400)
  const bound = authorized
  const { binding } = bound
  const row = await env.MARKETPLACE_DB.prepare(
    `SELECT s.split_id, s.bundle_id, s.vendor_id, s.leg_ids, s.settlement_currency,
       s.gross_amount_minor, s.commission_amount_minor, s.net_payout_amount_minor,
       s.commission_rule_id, s.commission_rule_revision, p.payout_id, p.payout_state,
       p.attempt_count, p.terminal_reason, p.settlement_reference, p.updated_at
     FROM marketplace_vendor_split_projection s
     LEFT JOIN marketplace_payout p ON p.split_id = s.split_id
     WHERE s.split_id = ?
     ORDER BY p.updated_at DESC LIMIT 1`,
  ).bind(splitId).first<SettlementRow>()
  if (!row) return boundProviderError('settlement_not_found', 404, binding)
  return boundProviderJson({
    ok: true,
    contract: MARKETPLACE_PROVIDER_CONTRACT,
    splitId: row.split_id,
    state: settlementState(row.payout_state),
    amountMinor: row.net_payout_amount_minor,
    currency: row.settlement_currency,
  }, 200, binding)
}

async function transitionVendor(
  request: Request,
  env: MarketplaceEnv,
  vendorId: string,
  nowMs: number,
): Promise<Response> {
  const authorized = await authenticatedProviderOperation(request, env)
  if (authorized instanceof Response) return authorized
  if (!IDENTIFIER_PATTERN.test(vendorId)) return providerError('vendor_id_malformed', 400)
  const bound = authorized
  const { binding } = bound
  const permit = parseAuthoringMutationPermit(bound.request)
  if (!permit) return boundProviderError('authoring_mutation_permit_invalid', 409, binding)
  const actorId = bound.request.headers.get('x-operator-id') ?? ''
  const body = await readJsonObject(bound.request, MAX_OPERATION_BODY_BYTES)
  if (!IDENTIFIER_PATTERN.test(actorId)
    || !body
    || Object.keys(body).sort().join(',') !== 'state'
    || typeof body.state !== 'string'
    || !STATES.has(body.state)) {
    return boundProviderError('vendor_transition_malformed', 400, binding, permit)
  }
  const mutationPayload = Object.freeze({ vendorId, actorId, state: body.state })
  if (!await verifyAuthoringMutationPayload(
    permit,
    `vendor:${vendorId}`,
    `vendor:${vendorId}`,
    mutationPayload,
  )) return boundProviderError('authoring_mutation_payload_mismatch', 409, binding, permit)

  const result = await applyTransition(env.MARKETPLACE_DB, permit, vendorId, actorId, body.state, nowMs)
  return boundProviderJson(result.body, result.status, binding, permit)
}

async function providerControlAuthenticated(request: Request, env: MarketplaceEnv): Promise<Response | null> {
  if (!validCommerceProviderSecret(env.MARKETPLACE_PROVIDER_AUTH_SECRET)) {
    return providerError('provider_authentication_unconfigured', 503)
  }
  return await verifyCommerceProviderControlRequest(
    request,
    MARKETPLACE_PROVIDER_CONTRACT,
    env.MARKETPLACE_PROVIDER_AUTH_SECRET,
  ) ? null : providerError('provider_authentication_invalid', 401)
}

async function authenticatedProviderOperation(
  request: Request,
  env: MarketplaceEnv,
): Promise<BoundProviderRequest | Response> {
  if (!validCommerceProviderSecret(env.MARKETPLACE_PROVIDER_AUTH_SECRET)) {
    return providerError('provider_authentication_unconfigured', 503)
  }
  const bound = await readBoundProviderRequest(request, env, MARKETPLACE_EVIDENCE_CHECKS)
  if (!bound) return providerError('operational_evidence_binding_invalid', 409)
  return await verifyCommerceProviderRequestAuthentication(bound.request, {
    contract: MARKETPLACE_PROVIDER_CONTRACT,
    requestDigest: bound.binding.requestDigest,
    bindingDigest: bound.binding.bindingDigest,
  }, env.MARKETPLACE_PROVIDER_AUTH_SECRET)
    ? bound
    : providerError('provider_authentication_invalid', 401)
}

async function applyTransition(
  database: D1Database,
  permit: AuthoringMutationPermit,
  vendorId: string,
  actorId: string,
  nextState: string,
  nowMs: number,
): Promise<TransitionResult> {
  const existing = await readOutcome(database, permit.mutationId)
  if (existing) {
    const outcome = exactReplay(existing, permit, vendorId, actorId, nextState)
    return outcome
      ? Object.freeze({ status: 200, body: outcome })
      : transitionError('authoring_mutation_id_conflict', 409)
  }
  if (!authoringMutationPermitIsLive(permit, nowMs)) {
    return transitionError('authoring_mutation_lease_expired', 409)
  }

  const snapshot = await database.prepare(
    `SELECT v.lifecycle_state, f.claim_id, f.lease_epoch, f.mutation_sequence,
       f.fence_revision, f.mutation_id, f.request_digest
     FROM marketplace_vendor v
     LEFT JOIN marketplace_authoring_fence f ON f.semantic_scope = ?
     WHERE v.vendor_id = ?`,
  ).bind(permit.semanticScope, vendorId).first<TransitionSnapshot>()
  if (!snapshot) return transitionError('vendor_not_found', 404)
  const fenceError = classifyFence(snapshot, permit)
  if (fenceError) return transitionError(fenceError, 409)
  if (!TRANSITIONS[snapshot.lifecycle_state]?.includes(nextState)) {
    return transitionError('transition_rejected', 409)
  }

  const committedAt = new Date(nowMs).toISOString()
  const outcome: TransitionOutcome = Object.freeze({
    ok: true,
    contract: MARKETPLACE_PROVIDER_CONTRACT,
    vendorId,
    state: nextState,
    actorId,
    mutationId: permit.mutationId,
  })
  const outcomeJson = canonicalJson(outcome)
  const permitJson = canonicalJson(permit)
  await database.batch([
    database.prepare(
      `INSERT INTO marketplace_authoring_fence (
         semantic_scope, claim_id, lease_epoch, mutation_sequence, fence_revision,
         mutation_id, request_digest, updated_at
       )
       SELECT ?, ?, ?, ?, ?, ?, ?, ? FROM marketplace_vendor
       WHERE vendor_id = ? AND lifecycle_state = ?
       ON CONFLICT(semantic_scope) DO UPDATE SET
         claim_id = excluded.claim_id,
         lease_epoch = excluded.lease_epoch,
         mutation_sequence = excluded.mutation_sequence,
         fence_revision = excluded.fence_revision,
         mutation_id = excluded.mutation_id,
         request_digest = excluded.request_digest,
         updated_at = excluded.updated_at
       WHERE excluded.lease_epoch > marketplace_authoring_fence.lease_epoch
          OR (excluded.lease_epoch = marketplace_authoring_fence.lease_epoch
            AND excluded.claim_id = marketplace_authoring_fence.claim_id
            AND excluded.fence_revision = marketplace_authoring_fence.fence_revision
            AND excluded.mutation_sequence > marketplace_authoring_fence.mutation_sequence)`,
    ).bind(
      permit.semanticScope, permit.claimId, permit.leaseEpoch, permit.mutationSequence,
      permit.fenceRevision, permit.mutationId, permit.requestDigest, committedAt,
      vendorId, snapshot.lifecycle_state,
    ),
    database.prepare(
      `INSERT INTO marketplace_authoring_outcome (
         mutation_id, operation_id, request_digest, permit_json, semantic_scope, claim_id, lease_epoch,
         mutation_sequence, fence_revision, vendor_id, actor_id, from_state, to_state,
         outcome_json, applied, created_at
       )
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?
       FROM marketplace_authoring_fence
       WHERE semantic_scope = ? AND claim_id = ? AND lease_epoch = ?
         AND mutation_sequence = ? AND fence_revision = ? AND mutation_id = ?
         AND request_digest = ?
       ON CONFLICT DO NOTHING`,
    ).bind(
      permit.mutationId, permit.operationId, permit.requestDigest, permitJson, permit.semanticScope,
      permit.claimId, permit.leaseEpoch, permit.mutationSequence, permit.fenceRevision,
      vendorId, actorId, snapshot.lifecycle_state, nextState, outcomeJson, committedAt,
      permit.semanticScope, permit.claimId, permit.leaseEpoch, permit.mutationSequence,
      permit.fenceRevision, permit.mutationId, permit.requestDigest,
    ),
    database.prepare(
      `UPDATE marketplace_vendor SET lifecycle_state = ?, updated_at = ?
       WHERE vendor_id = ? AND lifecycle_state = ? AND EXISTS (
         SELECT 1 FROM marketplace_authoring_outcome
         WHERE mutation_id = ? AND request_digest = ? AND applied = 0
       )`,
    ).bind(nextState, committedAt, vendorId, snapshot.lifecycle_state, permit.mutationId, permit.requestDigest),
    database.prepare(
      `UPDATE marketplace_authoring_outcome SET applied = 1
       WHERE mutation_id = ? AND request_digest = ? AND applied = 0 AND EXISTS (
         SELECT 1 FROM marketplace_vendor
         WHERE vendor_id = ? AND lifecycle_state = ? AND updated_at = ?
       )`,
    ).bind(permit.mutationId, permit.requestDigest, vendorId, nextState, committedAt),
    database.prepare(
      `INSERT INTO marketplace_vendor_state_provenance (
         vendor_id, actor_id, mutation_id, lifecycle_state, updated_at
       )
       SELECT ?, ?, ?, ?, ? FROM marketplace_authoring_outcome
       WHERE mutation_id = ? AND request_digest = ? AND applied = 1
         AND EXISTS (
           SELECT 1 FROM marketplace_vendor
           WHERE vendor_id = ? AND lifecycle_state = ? AND updated_at = ?
         )
       ON CONFLICT(vendor_id) DO UPDATE SET
         actor_id = excluded.actor_id,
         mutation_id = excluded.mutation_id,
         lifecycle_state = excluded.lifecycle_state,
         updated_at = excluded.updated_at`,
    ).bind(
      vendorId, actorId, permit.mutationId, nextState, committedAt,
      permit.mutationId, permit.requestDigest, vendorId, nextState, committedAt,
    ),
  ])

  const stored = await readOutcome(database, permit.mutationId)
  const applied = stored?.applied === 1 ? exactReplay(stored, permit, vendorId, actorId, nextState) : null
  return applied
    ? Object.freeze({ status: 200, body: applied })
    : transitionError('authoring_mutation_reconciliation_required', 409)
}

function classifyFence(snapshot: TransitionSnapshot, permit: AuthoringMutationPermit): string | null {
  if (snapshot.lease_epoch === null) return null
  if (permit.leaseEpoch < snapshot.lease_epoch) return 'authoring_mutation_fence_stale'
  if (permit.leaseEpoch > snapshot.lease_epoch) return null
  if (permit.claimId !== snapshot.claim_id || permit.fenceRevision !== snapshot.fence_revision) {
    return 'authoring_mutation_fence_conflict'
  }
  if (permit.mutationSequence < Number(snapshot.mutation_sequence)) return 'authoring_mutation_fence_stale'
  if (permit.mutationSequence === Number(snapshot.mutation_sequence)) {
    return permit.mutationId === snapshot.mutation_id && permit.requestDigest === snapshot.request_digest
      ? 'authoring_mutation_reconciliation_required'
      : 'authoring_mutation_fence_conflict'
  }
  return null
}

async function readOutcome(database: D1Database, mutationId: string): Promise<StoredOutcome | null> {
  return database.prepare(
    `SELECT mutation_id, operation_id, request_digest, semantic_scope, claim_id, lease_epoch,
       permit_json, mutation_sequence, fence_revision, vendor_id, actor_id, from_state, to_state,
       outcome_json, applied
     FROM marketplace_authoring_outcome WHERE mutation_id = ?`,
  ).bind(mutationId).first<StoredOutcome>()
}

function exactReplay(
  stored: StoredOutcome,
  permit: AuthoringMutationPermit,
  vendorId: string,
  actorId: string,
  nextState: string,
): TransitionOutcome | null {
  if (stored.applied !== 1
    || stored.permit_json !== canonicalJson(permit)
    || stored.operation_id !== permit.operationId
    || stored.request_digest !== permit.requestDigest
    || stored.semantic_scope !== permit.semanticScope
    || stored.claim_id !== permit.claimId
    || stored.lease_epoch !== permit.leaseEpoch
    || stored.mutation_sequence !== permit.mutationSequence
    || stored.fence_revision !== permit.fenceRevision
    || stored.vendor_id !== vendorId
    || stored.actor_id !== actorId
    || stored.to_state !== nextState) return null
  try {
    const value: unknown = JSON.parse(stored.outcome_json)
    if (!isRecord(value)
      || Object.keys(value).sort().join(',') !== 'actorId,contract,mutationId,ok,state,vendorId'
      || value.ok !== true
      || value.contract !== MARKETPLACE_PROVIDER_CONTRACT
      || value.vendorId !== vendorId
      || value.state !== stored.to_state
      || value.actorId !== actorId
      || value.mutationId !== permit.mutationId) return null
    return value as TransitionOutcome
  } catch {
    return null
  }
}

function transitionError(code: string, status: number): TransitionResult {
  return Object.freeze({ status, body: Object.freeze({ ok: false, contract: MARKETPLACE_PROVIDER_CONTRACT, code }) })
}

function settlementState(value: string | null): 'pending' | 'settled' | 'failed' {
  return value === 'settled' ? 'settled' : value === 'failed' ? 'failed' : 'pending'
}

function providerError(code: string, status: number): Response {
  return providerJson({ ok: false, contract: MARKETPLACE_PROVIDER_CONTRACT, code }, status)
}

function boundProviderError(
  code: string,
  status: number,
  binding: ProviderBinding,
  permit?: AuthoringMutationPermit,
): Response {
  return boundProviderJson({ ok: false, contract: MARKETPLACE_PROVIDER_CONTRACT, code }, status, binding, permit)
}

function boundProviderJson(
  value: unknown,
  status: number,
  binding: ProviderBinding,
  permit?: AuthoringMutationPermit,
): Response {
  const headers = providerBindingHeaders(binding)
  if (permit) appendAuthoringMutationHeaders(headers, permit)
  return providerJson(value, status, headers)
}
