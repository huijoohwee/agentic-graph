import { handleAgenticCommerceRoute, isAgenticCommerceRoute, isAgenticCommerceRouteDbBacked } from './agenticCommerce'
import { handlePaymentRuntimeRoute, isPaymentRuntimeRoute } from './paymentRuntimeRoutes'
import { handleStripePaymentRoute, isStripePaymentRoute } from './payments'
import { handleStrytreeRoute, isStrytreeRoute, processStrytreeQueueMessage } from './strytreeApi'
import { StrytreeCreditLedgerActor, type StrytreeLedgerEnv } from './strytreeCreditLedger'
import { handleTravelAgencyRoute, isTravelAgencyRoute } from './travelAgency/orchestrator'
import { NetSettlementStore, type NetSettlementWorkerEnv } from './travelAgency/netSettlement'
import { readDb, type D1DatabaseLike } from '../shared/d1'

type HeadersRecord = Record<string, string>

export type AgenticGraphPaymentWorkerEnv = NetSettlementWorkerEnv & StrytreeLedgerEnv & {
  DB: unknown
  STRYTREE_CREDIT_LEDGER?: unknown
  STRYTREE_GENERATION_QUEUE?: unknown
  STRYTREE_MEDIA_BUCKET?: unknown
  STRYTREE_PROVIDER_BUDGET_KV?: unknown
  STRYTREE_PROVIDER_MODE?: unknown
  STRYTREE_EXTERNAL_VIDEO_PROVIDER_API_KEY?: unknown
  EXTERNAL_VIDEO_PROVIDER_API_KEY?: unknown
  STRYTREE_EXTERNAL_VIDEO_PROVIDER_BASE_URL?: unknown
  STRYTREE_EXTERNAL_VIDEO_PROVIDER_MAX_POLLS?: unknown
  STRYTREE_EXTERNAL_VIDEO_PROVIDER_POLL_INTERVAL_MS?: unknown
  STRYTREE_EXTERNAL_VIDEO_PROVIDER_FETCH?: unknown
  STRYTREE_DAILY_PROVIDER_BUDGET_CENTS?: unknown
  STRYTREE_PROVIDER_SPEND_KV_KEY?: unknown
  STRYTREE_CHECKOUT_WEBHOOK_SECRET?: unknown
  STRYTREE_CHECKOUT_MODE?: unknown
}

export { NetSettlementStore }
export { StrytreeCreditLedgerActor }

type QueueBatchLike = {
  messages?: Array<{
    body?: unknown
    ack?: () => void
    retry?: () => void
  }>
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,stripe-signature,xfers-signature,strytree-signature,idempotency-key,api-version,x-agenticgraph-component',
  'access-control-max-age': '86400',
}

const noContent = (): Response =>
  new Response(null, { status: 204, headers: CORS_HEADERS })

const json = (status: number, body: unknown, headers: HeadersRecord = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...CORS_HEADERS,
      ...headers,
    },
  })

const paymentWorkerError = (status: number, error: string): Response =>
  json(status, { ok: false, error })

const handlePaymentRequest = async (
  request: Request,
  env: AgenticGraphPaymentWorkerEnv,
  db: D1DatabaseLike,
): Promise<Response> => {
  const travelAgencyResponse = await handleTravelAgencyRoute(request, env, CORS_HEADERS)
  if (travelAgencyResponse) return travelAgencyResponse
  const strytreeResponse = await handleStrytreeRoute(request, env, db, CORS_HEADERS)
  if (strytreeResponse) return strytreeResponse
  const agenticCommerceResponse = await handleAgenticCommerceRoute(request, env, db, CORS_HEADERS)
  if (agenticCommerceResponse) return agenticCommerceResponse
  const runtimeResponse = await handlePaymentRuntimeRoute({
    request,
    env,
    db,
    corsHeaders: CORS_HEADERS,
  })
  if (runtimeResponse) return runtimeResponse
  const paymentResponse = await handleStripePaymentRoute(request, env, db, CORS_HEADERS)
  if (paymentResponse) return paymentResponse
  return paymentWorkerError(404, 'payment route not found')
}

export const createAgenticGraphPaymentWorker = () => ({
  async fetch(request: Request, env: AgenticGraphPaymentWorkerEnv): Promise<Response> {
    if (request.method === 'OPTIONS') return noContent()
    const url = new URL(request.url)
    if (
      !isStrytreeRoute(url.pathname)
      && !isAgenticCommerceRoute(url.pathname)
      && !isPaymentRuntimeRoute(url.pathname)
      && !isStripePaymentRoute(url.pathname)
      && !isTravelAgencyRoute(url.pathname)
    ) {
      return paymentWorkerError(404, 'payment route not found')
    }
    if (isTravelAgencyRoute(url.pathname)) {
      return handleTravelAgencyRoute(request, env, CORS_HEADERS) as Promise<Response>
    }
    if (isAgenticCommerceRoute(url.pathname) && !isAgenticCommerceRouteDbBacked(url.pathname)) {
      return handleAgenticCommerceRoute(request, env, null, CORS_HEADERS) as Promise<Response>
    }
    const db = readDb(env)
    if (!db) return paymentWorkerError(500, 'missing Cloudflare D1 binding DB')
    try {
      return await handlePaymentRequest(request, env, db)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unexpected payment worker error'
      return paymentWorkerError(500, message)
    }
  },

  async queue(batch: QueueBatchLike, env: AgenticGraphPaymentWorkerEnv): Promise<void> {
    const db = readDb(env)
    if (!db) {
      for (const message of batch.messages || []) {
        if (typeof message.retry === 'function') message.retry()
      }
      throw new Error('missing Cloudflare D1 binding DB')
    }
    for (const message of batch.messages || []) {
      try {
        await processStrytreeQueueMessage(message.body, env, db)
        if (typeof message.ack === 'function') message.ack()
      } catch (err) {
        if (typeof message.retry === 'function') message.retry()
        throw err
      }
    }
  },
})

const worker = createAgenticGraphPaymentWorker()

export default worker
