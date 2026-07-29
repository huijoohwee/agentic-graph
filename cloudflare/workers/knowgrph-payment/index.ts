import { handleAgenticCommerceRoute, isAgenticCommerceRoute, isAgenticCommerceRouteDbBacked } from './agenticCommerce'
import { handlePaymentRuntimeRoute, isPaymentRuntimeRoute } from './paymentRuntimeRoutes'
import { handleStripePaymentRoute, isStripePaymentRoute } from './payments'
import { handleStrytreeRoute, isStrytreeRoute, processStrytreeQueueMessage } from './strytreeApi'
import { execute, normalizeNumber, normalizeString, queryFirst, readDb, type D1DatabaseLike } from '../shared/d1'

type HeadersRecord = Record<string, string>

export type KnowgrphPaymentWorkerEnv = Record<string, unknown> & {
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
}

type QueueBatchLike = {
  messages?: Array<{
    body?: unknown
    ack?: () => void
    retry?: () => void
  }>
}

type StrytreeLedgerMutationPayload = {
  id?: unknown
  user_id?: unknown
  event_type?: unknown
  amount_credits?: unknown
  related_object_type?: unknown
  related_object_id?: unknown
  provider_event_id?: unknown
  idempotency_key?: unknown
  metadata_json?: unknown
  created_at?: unknown
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization,stripe-signature,xfers-signature,strytree-signature,idempotency-key,api-version',
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

const readRequestJson = async (request: Request): Promise<Record<string, unknown> | null> => {
  try {
    const parsed = await request.json()
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

const readSignedInteger = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

const readLedgerBalance = async (db: D1DatabaseLike, userId: string): Promise<number> => {
  const row = await queryFirst<{ balance_after_credits: number }>(
    db,
    `SELECT balance_after_credits
     FROM strytree_token_ledger
     WHERE user_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [userId],
  )
  return normalizeNumber(row?.balance_after_credits)
}

const readExistingLedgerByIdempotency = async (
  db: D1DatabaseLike,
  userId: string,
  idempotencyKey: string,
): Promise<{ id: string; balance_after_credits: number } | null> =>
  queryFirst<{ id: string; balance_after_credits: number }>(
    db,
    `SELECT id, balance_after_credits
     FROM strytree_token_ledger
     WHERE user_id = ? AND idempotency_key = ?
     LIMIT 1`,
    [userId, idempotencyKey],
  )

const writeStrytreeLedgerMutation = async (
  db: D1DatabaseLike,
  payload: StrytreeLedgerMutationPayload,
): Promise<Response> => {
  const userId = normalizeString(payload.user_id)
  const idempotencyKey = normalizeString(payload.idempotency_key)
  const eventType = normalizeString(payload.event_type)
  const ledgerEventId = normalizeString(payload.id)
  const amountCredits = readSignedInteger(payload.amount_credits)
  if (!userId || !idempotencyKey || !eventType || !ledgerEventId) {
    return paymentWorkerError(400, 'invalid strytree ledger mutation payload')
  }
  const existing = await readExistingLedgerByIdempotency(db, userId, idempotencyKey)
  if (existing) {
    return json(200, {
      ok: true,
      ledger_event_id: existing.id,
      balance_after_credits: normalizeNumber(existing.balance_after_credits),
      idempotent_replay: true,
      authority: 'durable-object',
    })
  }
  const currentBalance = await readLedgerBalance(db, userId)
  const balanceAfterCredits = currentBalance + amountCredits
  if (balanceAfterCredits < 0) {
    return json(402, {
      ok: false,
      error: 'insufficient_balance',
      balance_credits: currentBalance,
      required_credits: Math.abs(amountCredits),
      authority: 'durable-object',
    })
  }
  const createdAt = normalizeString(payload.created_at) || new Date().toISOString()
  await execute(
    db,
    `INSERT INTO strytree_token_ledger (
       id, user_id, event_type, amount_credits, balance_after_credits,
       related_object_type, related_object_id, provider_event_id,
       idempotency_key, metadata_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ledgerEventId,
      userId,
      eventType,
      amountCredits,
      balanceAfterCredits,
      normalizeString(payload.related_object_type) || null,
      normalizeString(payload.related_object_id) || null,
      normalizeString(payload.provider_event_id) || null,
      idempotencyKey,
      normalizeString(payload.metadata_json) || '{}',
      createdAt,
    ],
  )
  return json(200, {
    ok: true,
    ledger_event_id: ledgerEventId,
    balance_after_credits: balanceAfterCredits,
    idempotent_replay: false,
    authority: 'durable-object',
  })
}

export class StrytreeCreditLedgerActor {
  private readonly env: KnowgrphPaymentWorkerEnv

  constructor(state: unknown, env: KnowgrphPaymentWorkerEnv) {
    void state
    this.env = env
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname.endsWith('/health')) {
      return json(200, {
        ok: true,
        service: 'strytree-credit-ledger',
        authority: 'durable-object',
      })
    }
    if (request.method === 'POST' && (url.pathname.endsWith('/mutations') || url.pathname.endsWith('/debit'))) {
      const db = readDb(this.env)
      if (!db) return paymentWorkerError(500, 'missing Cloudflare D1 binding DB')
      const payload = await readRequestJson(request)
      if (!payload) return paymentWorkerError(400, 'invalid strytree ledger mutation payload')
      return writeStrytreeLedgerMutation(db, payload)
    }
    return paymentWorkerError(404, 'strytree credit ledger actor route not found')
  }
}

const handlePaymentRequest = async (
  request: Request,
  env: KnowgrphPaymentWorkerEnv,
  db: D1DatabaseLike,
): Promise<Response> => {
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

export const createKnowgrphPaymentWorker = () => ({
  async fetch(request: Request, env: KnowgrphPaymentWorkerEnv): Promise<Response> {
    if (request.method === 'OPTIONS') return noContent()
    const url = new URL(request.url)
    if (
      !isStrytreeRoute(url.pathname)
      && !isAgenticCommerceRoute(url.pathname)
      && !isPaymentRuntimeRoute(url.pathname)
      && !isStripePaymentRoute(url.pathname)
    ) {
      return paymentWorkerError(404, 'payment route not found')
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

  async queue(batch: QueueBatchLike, env: KnowgrphPaymentWorkerEnv): Promise<void> {
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

const worker = createKnowgrphPaymentWorker()

export default worker
