import {
  STRIPE_CHECKOUT_SESSION_ID_PARAM,
  STRIPE_PAYMENT_REQUEST_API_VERSION,
  STRIPE_PAYMENT_WEBHOOK_API_VERSION,
  STRIPE_PAYMENT_ROUTE_PATHS,
  readStripeCheckoutReadinessSmoke,
  readStripeWebhookSigningSecret,
  type StripeCheckoutSessionCreatePayload,
} from '../../../grph-shared/src/payments/stripePaymentSsot'
import {
  cancelAgenticCommerceSessionFromExpiredStripeSession,
  failAgenticCommerceSessionFromStripeSession,
  settleAgenticCommerceSessionFromStripeSession,
} from './agenticCommerceSettlement'
import {
  execute,
  normalizeString,
  queryFirst,
  type D1DatabaseLike,
} from '../shared/d1'
import {
  asRecord,
  createStripeHostedCheckoutSessionForWorker,
  expireStripeHostedCheckoutSessionForWorker,
  isStripeCheckoutSessionExpired,
  isStripeCheckoutSessionPaymentResolved,
  mapStripeCheckoutSessionRow,
  mapStripeCheckoutSessionWrite,
  mapStripeSession,
  readRecordString,
  retrieveStripeCheckoutSessionForWorker,
  writeStripeCheckoutSession,
  type StripeCheckoutSessionRow,
  type StripePaymentEnv,
} from './stripeHostedCheckout'

export {
  createStripeHostedCheckoutSessionForWorker,
  expireStripeHostedCheckoutSessionForWorker,
}
export type {
  StripeHostedCheckoutSessionCreateFailure,
  StripeHostedCheckoutSessionCreateSuccess,
} from './stripeHostedCheckout'

type HeadersRecord = Record<string, string>

type StripeWebhookEventProcessingStatus = 'processing' | 'processed' | 'failed'

type StripeWebhookEventProcessingRow = {
  id: string
  payload_hash: string
  received_at: string | null
  processed_at: string | null
  processing_status: StripeWebhookEventProcessingStatus | string | null
}

const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 5 * 60
const STRIPE_WEBHOOK_PROCESSING_RETRY_AFTER_SECONDS = 10 * 60

const textEncoder = new TextEncoder()

const paymentJson = (status: number, body: unknown, corsHeaders: HeadersRecord): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders,
    },
  })

const paymentError = (status: number, error: string, corsHeaders: HeadersRecord): Response =>
  paymentJson(status, { ok: false, apiVersion: STRIPE_PAYMENT_REQUEST_API_VERSION, error }, corsHeaders)

const readRequestJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json()
  } catch {
    return null
  }
}

const isCheckoutCreatePayload = (value: unknown): value is StripeCheckoutSessionCreatePayload => {
  const record = asRecord(value)
  return Boolean(
    record
    && typeof record.successUrl === 'string'
    && typeof record.cancelUrl === 'string',
  )
}

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value))
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

const hmacSha256Hex = async (secret: string, value: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(value))
  return Array.from(new Uint8Array(signature))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

const timingSafeHexEqual = (left: string, right: string): boolean => {
  const a = left.toLowerCase()
  const b = right.toLowerCase()
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

const verifyStripeSignature = async (
  payload: string,
  header: string,
  secret: string,
  nowMs: number,
): Promise<boolean> => {
  const parts = header.split(',').map(part => part.trim()).filter(Boolean)
  const timestamp = Number(parts.find(part => part.startsWith('t='))?.slice(2))
  const signatures = parts
    .filter(part => part.startsWith('v1='))
    .map(part => part.slice(3).trim())
    .filter(Boolean)
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false
  const ageSeconds = Math.abs(Math.floor(nowMs / 1000) - Math.floor(timestamp))
  if (ageSeconds > STRIPE_WEBHOOK_TOLERANCE_SECONDS) return false
  const expected = await hmacSha256Hex(secret, `${Math.floor(timestamp)}.${payload}`)
  return signatures.some(signature => timingSafeHexEqual(signature, expected))
}

const normalizeStripeWebhookEventProcessingStatus = (
  row: StripeWebhookEventProcessingRow | null,
): StripeWebhookEventProcessingStatus | '' => {
  const status = String(row?.processing_status || '').trim()
  if (status === 'processing' || status === 'processed' || status === 'failed') return status
  return row?.processed_at ? 'processed' : ''
}

const isStripeWebhookEventProcessingStale = (
  row: StripeWebhookEventProcessingRow,
  nowIso: string,
): boolean => {
  const receivedAtMs = Date.parse(String(row.received_at || ''))
  const nowMs = Date.parse(nowIso)
  if (!Number.isFinite(nowMs)) return false
  if (!Number.isFinite(receivedAtMs)) return true
  return Math.floor((nowMs - receivedAtMs) / 1000) >= STRIPE_WEBHOOK_PROCESSING_RETRY_AFTER_SECONDS
}

const trimStripeWebhookProcessingError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error || 'Stripe webhook processing failed.')
  return message.trim().slice(0, 500)
}

const claimStripeWebhookEventProcessing = async (
  db: D1DatabaseLike,
  event: Record<string, unknown>,
  payload: string,
  nowIso: string,
): Promise<{ ok: true; shouldProcess: boolean; duplicate: boolean; eventId: string } | { ok: false; status: number; error: string }> => {
  const eventId = readRecordString(event, 'id')
  if (!eventId) return { ok: false, status: 400, error: 'Stripe webhook event is missing an id.' }
  const payloadHash = await sha256Hex(payload)
  const existing = await queryFirst<StripeWebhookEventProcessingRow>(
    db,
    'SELECT id, payload_hash, received_at, processed_at, processing_status FROM stripe_webhook_events WHERE id = ?',
    [eventId],
  )
  if (existing?.payload_hash && existing.payload_hash !== payloadHash) {
    return { ok: false, status: 409, error: 'Stripe webhook event id was previously recorded with a different payload.' }
  }
  const existingStatus = normalizeStripeWebhookEventProcessingStatus(existing)
  if (existing && existingStatus === 'processed') {
    return { ok: true, shouldProcess: false, duplicate: true, eventId }
  }
  if (existing && existingStatus === 'processing' && !isStripeWebhookEventProcessingStale(existing, nowIso)) {
    return { ok: true, shouldProcess: false, duplicate: true, eventId }
  }
  if (existing) {
    await execute(
      db,
      `UPDATE stripe_webhook_events
         SET event_type = ?,
             livemode = ?,
             payload_hash = ?,
             received_at = ?,
             processing_status = ?,
             processing_error = NULL
       WHERE id = ?`,
      [
        readRecordString(event, 'type') || 'unknown',
        event.livemode === true ? 1 : 0,
        payloadHash,
        nowIso,
        'processing',
        eventId,
      ],
    )
    return { ok: true, shouldProcess: true, duplicate: false, eventId }
  }
  await execute(
    db,
    `INSERT INTO stripe_webhook_events (
       id, event_type, livemode, payload_hash, received_at, processed_at, processing_status, processing_error
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      eventId,
      readRecordString(event, 'type') || 'unknown',
      event.livemode === true ? 1 : 0,
      payloadHash,
      nowIso,
      null,
      'processing',
      null,
    ],
  )
  return { ok: true, shouldProcess: true, duplicate: false, eventId }
}

const markStripeWebhookEventProcessed = async (
  db: D1DatabaseLike,
  eventId: string,
  processedAt: string,
): Promise<void> => {
  await execute(
    db,
    `UPDATE stripe_webhook_events
       SET processed_at = ?,
           processing_status = ?,
           processing_error = NULL
     WHERE id = ?`,
    [
      processedAt,
      'processed',
      eventId,
    ],
  )
}

const markStripeWebhookEventFailed = async (
  db: D1DatabaseLike,
  eventId: string,
  error: unknown,
): Promise<void> => {
  await execute(
    db,
    `UPDATE stripe_webhook_events
       SET processing_status = ?,
           processing_error = ?
     WHERE id = ?`,
    [
      'failed',
      trimStripeWebhookProcessingError(error),
      eventId,
    ],
  )
}

const checkoutSessionCompletedAt = (
  eventType: string,
  session: Record<string, unknown>,
  nowIso: string,
): string | null => {
  if (eventType !== 'checkout.session.completed' && eventType !== 'checkout.session.async_payment_succeeded') {
    return null
  }
  const mappedPaymentStatus = readRecordString(session, 'payment_status').toLowerCase()
  return mappedPaymentStatus === 'paid' || mappedPaymentStatus === 'no_payment_required' ? nowIso : null
}

const handleStripeCheckoutCreate = async (
  request: Request,
  env: StripePaymentEnv,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  const payload = await readRequestJson(request)
  if (!isCheckoutCreatePayload(payload)) {
    return paymentError(400, 'Missing Checkout Session successUrl or cancelUrl.', corsHeaders)
  }
  const created = await createStripeHostedCheckoutSessionForWorker({ request, env, db, payload })
  if (created.ok !== true) return paymentError(created.status, created.error, corsHeaders)
  if (readStripeCheckoutReadinessSmoke(payload)) {
    const expired = await expireStripeHostedCheckoutSessionForWorker({
      env,
      db,
      sessionId: created.session.id,
    })
    if (expired.ok !== true) {
      return paymentError(500, `Stripe readiness smoke created a Checkout Session but could not expire it: ${expired.error}`, corsHeaders)
    }
    const expiredSession = expired.session || created.session
    return paymentJson(200, {
      ok: true,
      apiVersion: STRIPE_PAYMENT_REQUEST_API_VERSION,
      id: created.session.id,
      status: 'expired',
      paymentStatus: expiredSession.paymentStatus,
      readinessSmoke: true,
    }, corsHeaders)
  }
  return paymentJson(200, {
    ok: true,
    apiVersion: STRIPE_PAYMENT_REQUEST_API_VERSION,
    ...created.body,
  }, corsHeaders)
}

const handleStripeCheckoutStatus = async (
  request: Request,
  env: StripePaymentEnv,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  const url = new URL(request.url)
  const sessionId = normalizeString(url.searchParams.get(STRIPE_CHECKOUT_SESSION_ID_PARAM))
  if (!sessionId) return paymentError(400, `${STRIPE_CHECKOUT_SESSION_ID_PARAM} is required.`, corsHeaders)
  const row = await queryFirst<StripeCheckoutSessionRow>(
    db,
    'SELECT * FROM stripe_checkout_sessions WHERE id = ?',
    [sessionId],
  )
  if (!row) return paymentError(404, 'Stripe Checkout Session status not found.', corsHeaders)
  const storedSession = row ? mapStripeCheckoutSessionRow(row) : null
  if (storedSession && isStripeCheckoutSessionPaymentResolved(storedSession)) {
    return paymentJson(200, {
      ok: true,
      apiVersion: STRIPE_PAYMENT_REQUEST_API_VERSION,
      liveVerified: false,
      session: storedSession,
    }, corsHeaders)
  }

  const retrieved = await retrieveStripeCheckoutSessionForWorker(env, sessionId)
  if (retrieved.ok === true) {
    await writeStripeCheckoutSession(db, retrieved.session)
    if (isStripeCheckoutSessionPaymentResolved(retrieved.session)) {
      await settleAgenticCommerceSessionFromStripeSession(db, env, retrieved.raw)
    }
    if (isStripeCheckoutSessionExpired(retrieved.session)) {
      await cancelAgenticCommerceSessionFromExpiredStripeSession(db, retrieved.raw)
    }
    return paymentJson(200, {
      ok: true,
      apiVersion: STRIPE_PAYMENT_REQUEST_API_VERSION,
      liveVerified: true,
      session: mapStripeCheckoutSessionWrite(retrieved.session),
    }, corsHeaders)
  }

  return paymentJson(200, {
    ok: true,
    apiVersion: STRIPE_PAYMENT_REQUEST_API_VERSION,
    liveVerified: false,
    session: mapStripeCheckoutSessionRow(row),
  }, corsHeaders)
}

const handleStripeWebhook = async (
  request: Request,
  env: StripePaymentEnv,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  const signingSecret = readStripeWebhookSigningSecret(env)
  if (!signingSecret) return paymentError(500, 'Missing server-managed Stripe webhook signing secret.', corsHeaders)
  const signature = request.headers.get('stripe-signature') || ''
  const payload = await request.text()
  const verified = await verifyStripeSignature(payload, signature, signingSecret, Date.now())
  if (!verified) return paymentError(400, 'Invalid Stripe webhook signature.', corsHeaders)
  let parsedEvent: unknown
  try {
    parsedEvent = JSON.parse(payload)
  } catch {
    return paymentError(400, 'Invalid Stripe webhook payload.', corsHeaders)
  }
  const event = asRecord(parsedEvent)
  if (!event) return paymentError(400, 'Invalid Stripe webhook payload.', corsHeaders)
  if (readRecordString(event, 'api_version') !== STRIPE_PAYMENT_WEBHOOK_API_VERSION) {
    return paymentError(400, 'Stripe webhook API version does not match the pinned endpoint contract.', corsHeaders)
  }
  const nowIso = new Date().toISOString()
  const eventType = readRecordString(event, 'type')
  const claim = await claimStripeWebhookEventProcessing(db, event, payload, nowIso)
  if (claim.ok !== true) return paymentError(claim.status, claim.error, corsHeaders)
  if (!claim.shouldProcess) {
    return paymentJson(200, {
      ok: true,
      apiVersion: STRIPE_PAYMENT_REQUEST_API_VERSION,
      received: true,
      duplicate: claim.duplicate,
      eventType,
    }, corsHeaders)
  }
  try {
    const session = asRecord(asRecord(event.data)?.object)
    if (session && eventType.startsWith('checkout.session.')) {
      const mapped = mapStripeSession(session, nowIso, checkoutSessionCompletedAt(eventType, session, nowIso))
      if (mapped) await writeStripeCheckoutSession(db, mapped)
      if (mapped && mapped.completedAt) await settleAgenticCommerceSessionFromStripeSession(db, env, session)
      if (mapped && eventType === 'checkout.session.async_payment_failed') {
        await failAgenticCommerceSessionFromStripeSession(db, session)
      }
      if (mapped && eventType === 'checkout.session.expired') {
        await cancelAgenticCommerceSessionFromExpiredStripeSession(db, session)
      }
    }
    await markStripeWebhookEventProcessed(db, claim.eventId, new Date().toISOString())
  } catch (error) {
    await markStripeWebhookEventFailed(db, claim.eventId, error)
    return paymentError(500, 'Stripe webhook processing failed; Stripe can retry this event.', corsHeaders)
  }
  return paymentJson(200, {
    ok: true,
    apiVersion: STRIPE_PAYMENT_REQUEST_API_VERSION,
    received: true,
    duplicate: false,
    eventType,
  }, corsHeaders)
}

export const isStripePaymentRoute = (pathname: string): boolean =>
  pathname === STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession || pathname === STRIPE_PAYMENT_ROUTE_PATHS.webhook

export const handleStripePaymentRoute = async (
  request: Request,
  env: StripePaymentEnv,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<Response | null> => {
  const pathname = new URL(request.url).pathname
  if (pathname === STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession && request.method === 'POST') {
    return handleStripeCheckoutCreate(request, env, db, corsHeaders)
  }
  if (pathname === STRIPE_PAYMENT_ROUTE_PATHS.checkoutSession && request.method === 'GET') {
    return handleStripeCheckoutStatus(request, env, db, corsHeaders)
  }
  if (pathname === STRIPE_PAYMENT_ROUTE_PATHS.webhook && request.method === 'POST') {
    return handleStripeWebhook(request, env, db, corsHeaders)
  }
  if (isStripePaymentRoute(pathname)) {
    return paymentError(404, 'Stripe payment route not found.', corsHeaders)
  }
  return null
}
