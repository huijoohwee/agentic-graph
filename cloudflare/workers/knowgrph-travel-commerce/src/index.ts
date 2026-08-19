import { BundleGraphStore } from '../../../../src/bundle/bundle-graph-store'
import {
  MAX_BUNDLE_EDGES,
  MAX_BUNDLE_LEGS,
  isIdentifier,
  isMinorUnits,
  readMutationEvent,
  type BundleSeed,
  type Edge,
  type Leg,
  type Rejection,
} from '../../../../src/bundle/bundle-types'
import { createTravelCommerceRuntime } from '../../../../src/bundle/wiring'
import { EnvelopeLedger } from '../../../../src/ledger/envelope-ledger'
import { deployBoundaryReport } from '../../../../src/runtime/deploy-boundary.ts'
import { permittedModelSet } from '../../../../src/runtime/model-license-filter'

export { BundleGraphStore, EnvelopeLedger }

const MAX_BODY_BYTES = 65_536

export default {
  async fetch(request: Request, env: TravelCommerceEnv, ctx: ExecutionContext): Promise<Response> {
    const requestId = crypto.randomUUID()
    const url = new URL(request.url)
    try {
      if (request.method === 'GET' && url.pathname === '/healthz') {
        return json({
          ok: true,
          lane: env.DEPLOY_LANE,
          boundaries: deployBoundaryReport(env),
          modelLicenses: permittedModelSet(env.MODEL_CATALOG_JSON, env.PERMITTED_MODEL_LICENSES_JSON),
        })
      }
      if (!await authorized(request, env.TRAVEL_COMMERCE_API_TOKEN)) {
        return json({ ok: false, reason: 'unauthorized', requestId }, 401)
      }
      const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
      if (segments[0] !== 'v1' || segments[1] !== 'bundles' || !isIdentifier(segments[2])) {
        return json({ ok: false, reason: 'not-found', requestId }, 404)
      }
      const bundleId = segments[2]
      const graph = env.BUNDLE_GRAPH.getByName(bundleId)
      if (request.method === 'PUT' && segments.length === 3) {
        const body = await boundedJson(request)
        if ('kind' in body) return json(body, 400)
        const seed = readBundleSeed(body, bundleId)
        if ('kind' in seed) return json(seed, 400)
        const ledger = env.ENVELOPE_LEDGER.getByName(seed.principalId)
        const ledgerResult = await ledger.init(seed.principalId, seed.totalBudgetMinor)
        if ('kind' in ledgerResult && ledgerResult.kind === 'rejected') return json(ledgerResult, 409)
        const graphResult = await graph.initBundle(seed)
        return json(graphResult, graphResult.kind === 'rejected' ? 409 : 200)
      }
      if (request.method === 'POST' && segments[3] === 'mutations' && segments.length === 4) {
        const body = await boundedJson(request)
        if ('kind' in body) return json(body, 400)
        const event = readMutationEvent(body, bundleId)
        if ('kind' in event) return json(event, 400)
        const result = await createTravelCommerceRuntime(env, ctx).handleMutation(event)
        const status = result.kind === 'pending' ? 202 : result.kind === 'rejected' ? 422 : 200
        return json(result, status)
      }
      if (request.method === 'GET' && segments[3] === 'cascades' && segments.length === 5) {
        const cascade = await graph.getCascade(segments[4])
        return cascade ? json(cascade) : json({ ok: false, reason: 'not-found', requestId }, 404)
      }
      if (request.method === 'GET' && segments[3] === 'events' && segments.length === 4) {
        return graph.fetch(request)
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
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return { kind: 'rejected', reason: 'content-type-required' }
  }
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { kind: 'rejected', reason: 'body-too-large' }
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return { kind: 'rejected', reason: 'body-too-large' }
  try {
    const value: unknown = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : { kind: 'rejected', reason: 'json-object-required' }
  } catch {
    return { kind: 'rejected', reason: 'json-malformed' }
  }
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

async function authorized(request: Request, secret: string): Promise<boolean> {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ') || !secret) return false
  const [presented, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(authorization.slice(7))),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)),
  ])
  const left = new Uint8Array(presented)
  const right = new Uint8Array(expected)
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
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
