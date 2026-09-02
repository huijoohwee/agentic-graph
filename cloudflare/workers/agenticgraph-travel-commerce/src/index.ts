import { BundleGraphStore } from '../../../../src/bundle/bundle-graph-store'
import {
  MAX_BUNDLE_EDGES,
  MAX_BUNDLE_LEGS,
  isCascadeIdentifier,
  isIdentifier,
  isMinorUnits,
  readMutationEvent,
} from '../../../../src/bundle/bundle-runtime'
import type {
  BundleSeed,
  Edge,
  Leg,
  ReconciliationDecisionInput,
  Rejection,
} from '../../../../src/bundle/bundle-types'
import { createTravelCommerceRuntime } from '../../../../src/bundle/wiring'
import { resolveOperatorReconciliation } from '../../../../src/bundle/reconciliation-operator'
import { EnvelopeLedger } from '../../../../src/ledger/envelope-ledger'
import { deployBoundaryReport } from '../../../../src/runtime/deploy-boundary.ts'
import { routeInference } from '../../../../src/runtime/inference-router'
import { permittedModelSet } from '../../../../src/runtime/model-license-filter'
import { inspectReadiness } from '../../../../src/runtime/readiness'
import { readBoundedJson } from '../../../../src/runtime/bounded-json'
import { TravelAgencyGuardrailService } from '../../../../src/gate/travel-agency-guardrail-service'
import { handleCommerceCheckoutProvider } from './commerce-checkout-provider'
import { CommerceCheckoutStore } from './commerce-checkout-store'
import { commerceProviderRuntimeProof } from './provider-runtime-proof'
import { validCommerceProviderSecret } from '../../commerce-provider-auth.ts'

export { BundleGraphStore, CommerceCheckoutStore, EnvelopeLedger, TravelAgencyGuardrailService }

const MAX_BODY_BYTES = 65_536

export default {
  async fetch(request: Request, env: TravelCommerceEnv, ctx: ExecutionContext): Promise<Response> {
    const requestId = crypto.randomUUID()
    const url = new URL(request.url)
    try {
      const checkoutProviderResponse = await handleCommerceCheckoutProvider(request, env)
      if (checkoutProviderResponse) return checkoutProviderResponse
      if (request.method === 'GET' && url.pathname === '/livez') {
        return json({ ok: true, requestId })
      }
      if (request.method === 'GET' && (url.pathname === '/healthz' || url.pathname === '/readyz')) {
        const report = await reconciliationAwareReadiness(env)
        return json(report, report.ok ? 200 : 503)
      }
      if (request.method === 'GET' && url.pathname === '/v1/reconciliation/runtime') {
        if (!await authorizedOperator(request, env)) {
          return json({ ok: false, reason: 'unauthorized', requestId }, 401)
        }
        const providerRuntime = await commerceProviderRuntimeProof(env)
        if (!providerRuntime) {
          return json({ ok: false, reason: 'provider-runtime-unavailable', requestId }, 503)
        }
        return json({
          ok: true,
          service: 'agenticgraph-travel-commerce',
          lane: env.DEPLOY_LANE,
          capability: 'resolve-reconciliation',
          contract: 'agenticgraph.travel-reconciliation-control/v1',
          providerRuntime,
        })
      }
      const operatorSegments = pathSegments(url.pathname)
      if (isReconciliationRoute(request.method, operatorSegments)) {
        if (!await authorizedOperator(request, env)) {
          return json({ ok: false, reason: 'unauthorized', requestId }, 401)
        }
        const body = await boundedJson(request)
        if ('kind' in body) return json(body, 400)
        const decision = readReconciliationDecision(body)
        if ('kind' in decision) return json(decision, 400)
        const result = await resolveOperatorReconciliation(
          env, operatorSegments[2], operatorSegments[4], decision,
        )
        const status = result.kind === 'rejected'
          ? result.reason === 'unknown-cascade' ? 404 : 409
          : 200
        return json(result, status)
      }
      if (!await authorized(request, env.TRAVEL_COMMERCE_API_TOKEN)) {
        return json({ ok: false, reason: 'unauthorized', requestId }, 401)
      }
      if (request.method === 'GET' && url.pathname === '/v1/runtime') {
        return json({
          ok: true,
          lane: env.DEPLOY_LANE,
          boundaries: deployBoundaryReport(env),
          modelLicenses: permittedModelSet(env.MODEL_CATALOG_JSON, env.PERMITTED_MODEL_LICENSES_JSON),
        })
      }
      if (request.method === 'POST' && url.pathname === '/v1/inference') {
        const body = await boundedJson(request)
        if ('kind' in body) return json(body, 400)
        const modelId = body.model_id
        const input = body.input
        if (typeof modelId !== 'string' || modelId.length === 0 || modelId.length > 256
          || !input || typeof input !== 'object' || Array.isArray(input)) {
          return json(reject('inference-request-malformed'), 400)
        }
        const result = await routeInference(env, modelId, input as Record<string, unknown>)
        return json(result, 'kind' in result ? 422 : 200)
      }
      const segments = pathSegments(url.pathname)
      if (!segments || segments[0] !== 'v1' || segments[1] !== 'bundles' || !isIdentifier(segments[2])) {
        return json({ ok: false, reason: 'not-found', requestId }, 404)
      }
      const bundleId = segments[2]
      const graph = env.BUNDLE_GRAPH.getByName(bundleId)
      if (request.method === 'PUT' && segments.length === 3) {
        const body = await boundedJson(request)
        if ('kind' in body) return json(body, 400)
        const seed = readBundleSeed(body, bundleId)
        if ('kind' in seed) return json(seed, 400)
        const graphResult = await graph.initBundle(seed)
        return json(graphResult, graphResult.kind === 'rejected' ? 409 : 200)
      }
      if (request.method === 'GET' && segments.length === 3) {
        const snapshot = await graph.getSnapshot()
        return snapshot ? json(snapshot) : json({ ok: false, reason: 'not-found', requestId }, 404)
      }
      if (request.method === 'POST' && segments[3] === 'legs' && segments.length === 4) {
        const body = await boundedJson(request)
        if ('kind' in body) return json(body, 400)
        const leg = readLeg(body)
        if ('kind' in leg) return json(leg, 400)
        const result = await graph.insertLeg(leg)
        return json(result, result.kind === 'rejected' ? 409 : 200)
      }
      if (request.method === 'POST' && segments[3] === 'edges' && segments.length === 4) {
        const body = await boundedJson(request)
        if ('kind' in body) return json(body, 400)
        const edge = readEdge(body)
        if ('kind' in edge) return json(edge, 400)
        const result = await graph.insertEdge(edge)
        return json(result, result.kind === 'rejected' ? 409 : 200)
      }
      if (request.method === 'POST' && segments[3] === 'mutations' && segments.length === 4) {
        const body = await boundedJson(request)
        if ('kind' in body) return json(body, 400)
        const event = readMutationEvent(body, bundleId)
        if ('kind' in event) return json(event, 400)
        const result = await createTravelCommerceRuntime(env, ctx).handleMutation(event)
        const status = result.kind === 'pending' ? 409 : result.kind === 'rejected' ? 422 : 200
        const response = json(result, status)
        if (result.kind === 'pending') response.headers.set('retry-after', '1')
        return response
      }
      if (request.method === 'GET' && segments[3] === 'cascades' && segments.length === 5) {
        const cascade = await graph.getCascade(segments[4])
        return cascade ? json(cascade) : json({ ok: false, reason: 'not-found', requestId }, 404)
      }
      if (request.method === 'GET' && segments[3] === 'session-log' && segments.length === 4) {
        return json({ entries: await graph.getSessionLog() })
      }
      if (request.method === 'GET' && segments[3] === 'cost-log' && segments.length === 4) {
        return json({ entries: await graph.getCostLog() })
      }
      if (request.method === 'GET' && segments[3] === 'events' && segments.length === 4) {
        // Authentication terminates at this edge. Forward only the negotiated
        // application protocol so bearer material never enters DO storage,
        // diagnostics, or hibernation attachments.
        const headers = new Headers({ 'sec-websocket-protocol': 'agenticgraph.v1' })
        const upgrade = request.headers.get('upgrade')
        if (upgrade) headers.set('upgrade', upgrade)
        return graph.fetch(new Request(request.url, { method: 'GET', headers }))
      }
      return json({ ok: false, reason: 'not-found', requestId }, 404)
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error', message: 'travel-commerce request failed', requestId,
        method: request.method, path: url.pathname,
        reason: error instanceof Error ? error.message : 'unhandled-error',
      }))
      return json({ ok: false, reason: 'internal-error', requestId }, 500)
    }
  },
} satisfies ExportedHandler<TravelCommerceEnv>

async function boundedJson(request: Request): Promise<Record<string, unknown> | Rejection> {
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    await readBoundedJson(request, MAX_BODY_BYTES)
    return { kind: 'rejected', reason: 'content-type-required' }
  }
  const contentLength = request.headers.get('content-length')
  if (contentLength !== null) {
    const declared = Number(contentLength)
    if (!/^\d+$/.test(contentLength) || !Number.isSafeInteger(declared)
      || declared > MAX_BODY_BYTES) {
      await readBoundedJson(request, MAX_BODY_BYTES)
      return { kind: 'rejected', reason: 'body-too-large' }
    }
  }
  const value = await readBoundedJson(request, MAX_BODY_BYTES)
  if (value === null) return { kind: 'rejected', reason: 'json-malformed' }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : { kind: 'rejected', reason: 'json-object-required' }
}

function readBundleSeed(value: Record<string, unknown>, bundleId: string): BundleSeed | Rejection {
  const principalId = value.principal_id
  const totalBudgetMinor = value.total_budget_minor
  if (!isIdentifier(principalId) || !isMinorUnits(totalBudgetMinor)) return reject('bundle-malformed')
  if (!Array.isArray(value.legs) || value.legs.length === 0 || value.legs.length > MAX_BUNDLE_LEGS) return reject('scale-boundary-legs')
  if (!Array.isArray(value.edges) || value.edges.length > MAX_BUNDLE_EDGES) return reject('scale-boundary-edges')
  const legs: Leg[] = []
  for (const item of value.legs) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return reject('bundle-malformed')
    const leg = item as Record<string, unknown>
    if (!isIdentifier(leg.leg_id) || !isIdentifier(leg.category)) return reject('bundle-malformed')
    if (leg.committed_offer_id != null && !isIdentifier(leg.committed_offer_id)) return reject('bundle-malformed')
    if (leg.committed_amount_minor != null && !isMinorUnits(leg.committed_amount_minor)) return reject('bundle-malformed')
    legs.push(Object.freeze({
      legId: leg.leg_id, principalId, category: leg.category,
      committedOfferId: leg.committed_offer_id ?? null,
      committedAmountMinor: leg.committed_amount_minor ?? null,
      lastCascadeId: null,
    }))
  }
  const edges: Edge[] = []
  for (const item of value.edges) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return reject('bundle-malformed')
    const edge = item as Record<string, unknown>
    if (!isIdentifier(edge.from_leg_id) || !isIdentifier(edge.to_leg_id)) return reject('bundle-malformed')
    edges.push(Object.freeze({ fromLegId: edge.from_leg_id, toLegId: edge.to_leg_id }))
  }
  return Object.freeze({ bundleId, principalId, totalBudgetMinor, legs: Object.freeze(legs), edges: Object.freeze(edges) })
}

function readLeg(value: Record<string, unknown>): Leg | Rejection {
  const principalId = value.principal_id
  const legId = value.leg_id
  const category = value.category
  const committedOfferId = value.committed_offer_id ?? null
  const committedAmountMinor = value.committed_amount_minor ?? null
  if (
    !isIdentifier(principalId)
    || !isIdentifier(legId)
    || !isIdentifier(category)
    || (committedOfferId !== null && !isIdentifier(committedOfferId))
    || (committedAmountMinor !== null && !isMinorUnits(committedAmountMinor))
    || (committedOfferId === null) !== (committedAmountMinor === null)
  ) return reject('bundle-malformed')
  return Object.freeze({
    legId,
    principalId,
    category,
    committedOfferId,
    committedAmountMinor,
    lastCascadeId: null,
  })
}

function readEdge(value: Record<string, unknown>): Edge | Rejection {
  const fromLegId = value.from_leg_id
  const toLegId = value.to_leg_id
  return isIdentifier(fromLegId) && isIdentifier(toLegId)
    ? Object.freeze({ fromLegId, toLegId })
    : reject('bundle-malformed')
}

function readReconciliationDecision(
  value: Record<string, unknown>,
): ReconciliationDecisionInput | Rejection {
  const allowed = new Set(['decision_id', 'decision', 'operator_id', 'reason'])
  if (Object.keys(value).length !== allowed.size
    || Object.keys(value).some((key) => !allowed.has(key))) {
    return reject('reconciliation-request-malformed')
  }
  const decisionId = value.decision_id
  const decision = value.decision
  const operatorId = value.operator_id
  const reason = value.reason
  if (!isIdentifier(decisionId) || (decision !== 'commit' && decision !== 'release')
    || !isIdentifier(operatorId) || typeof reason !== 'string'
    || reason.length < 1 || reason.length > 512 || /[\u0000-\u001f\u007f]/u.test(reason)) {
    return reject('reconciliation-request-malformed')
  }
  return Object.freeze({ decisionId, decision, operatorId, reason })
}

function isReconciliationRoute(method: string, segments: string[] | null): segments is string[] {
  return method === 'POST' && segments?.length === 6
    && segments[0] === 'v1' && segments[1] === 'bundles' && isIdentifier(segments[2])
    && segments[3] === 'cascades' && isCascadeIdentifier(segments[4]) && segments[5] === 'reconciliation'
}

function pathSegments(pathname: string): string[] | null {
  try {
    return pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return null
  }
}

async function authorized(request: Request, secret: string): Promise<boolean> {
  const authorization = request.headers.get('authorization')
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
  const protocol = request.headers.get('sec-websocket-protocol')
    ?.split(',')
    .map((value) => value.trim())
    .find((value) => value.startsWith('agenticgraph.auth.'))
  const protocolSecret = protocol ? decodeBase64Url(protocol.slice('agenticgraph.auth.'.length)) : null
  const candidate = bearer ?? protocolSecret
  return candidate ? secretMatches(candidate, secret) : false
}

async function authorizedOperator(request: Request, env: TravelCommerceEnv): Promise<boolean> {
  const authorization = request.headers.get('authorization')
  const candidate = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
  if (!candidate || !env.RECONCILIATION_OPERATOR_TOKEN) return false
  if (env.DEPLOY_LANE === 'Production_Lane' && env.RECONCILIATION_OPERATOR_TOKEN.length < 32) return false
  if (await secretMatches(env.RECONCILIATION_OPERATOR_TOKEN, env.TRAVEL_COMMERCE_API_TOKEN)) return false
  return secretMatches(candidate, env.RECONCILIATION_OPERATOR_TOKEN)
}

async function secretMatches(candidate: string, secret: string): Promise<boolean> {
  if (!candidate || !secret) return false
  const [presented, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(candidate)),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)),
  ])
  return digestEqual(presented, expected)
}

async function reconciliationAwareReadiness(env: TravelCommerceEnv) {
  const report = await inspectReadiness(env)
  if (env.DEPLOY_LANE !== 'Production_Lane') return report
  const started = performance.now()
  const operatorToken = typeof env.RECONCILIATION_OPERATOR_TOKEN === 'string'
    ? env.RECONCILIATION_OPERATOR_TOKEN : ''
  const apiToken = typeof env.TRAVEL_COMMERCE_API_TOKEN === 'string'
    ? env.TRAVEL_COMMERCE_API_TOKEN : ''
  const valid = operatorToken.length >= 32 && apiToken.length >= 32
    && !await secretMatches(operatorToken, apiToken)
  const check = Object.freeze({
    name: 'reconciliation-operator-auth', ok: valid, status: valid ? 200 : 503,
    elapsedMs: Number((performance.now() - started).toFixed(3)),
    reason: valid ? null : 'invalid-missing-or-shared-secret',
  })
  const providerSecretsValid = validCommerceProviderSecret(env.CHECKOUT_PROVIDER_AUTH_SECRET)
    && validCommerceProviderSecret(env.MARKETPLACE_PROVIDER_AUTH_SECRET)
    && !await secretMatches(env.CHECKOUT_PROVIDER_AUTH_SECRET, env.MARKETPLACE_PROVIDER_AUTH_SECRET)
  const providerAuthCheck = Object.freeze({
    name: 'commerce-provider-auth', ok: providerSecretsValid, status: providerSecretsValid ? 200 : 503,
    elapsedMs: Number((performance.now() - started).toFixed(3)),
    reason: providerSecretsValid ? null : 'invalid-missing-or-shared-secret',
  })
  const checks = Object.freeze([...report.checks, check, providerAuthCheck])
  return Object.freeze({ ...report, ok: report.ok && valid && providerSecretsValid, checks })
}

function digestEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
  const leftBytes = new Uint8Array(left)
  const rightBytes = new Uint8Array(right)
  if (leftBytes.length !== rightBytes.length) return false
  let difference = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index]
  }
  return difference === 0
}

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

function reject(reason: string): Rejection {
  return { kind: 'rejected', reason }
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      'x-content-type-options': 'nosniff',
    },
  })
}
