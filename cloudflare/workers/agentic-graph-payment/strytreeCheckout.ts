import type { StrytreeWorkerEnv, HeadersRecord, StrytreePaymentSessionRow } from './strytreeTypes'
import type { D1DatabaseLike } from '../shared/d1'
import { localCheckoutEnabled, errorJson, asRecord, readRequestJson, readIdempotencyKey, STRYTREE_PAYMENT_PACKAGES, json, STRYTREE_API_VERSION, buildId, stableJson, readEnvString, verifyTimestampedSignature } from './strytreeSupport'
import { requireUserContext, readPaymentSessionByIdempotency, writeAuditEvent, readBalance, writeLedgerEvent, readPaymentSessionForUser, readPendingPaymentSessions, readPaymentSessionById, readPaymentSessionByProviderSessionId } from './strytreeData'
import { normalizeString, normalizeNumber, execute, queryFirst } from '../shared/d1'

export const handleCreateCheckoutSession = async (
  request: Request,
  env: StrytreeWorkerEnv,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  if (!localCheckoutEnabled(env)) return errorJson(403, 'local_checkout_disabled', corsHeaders)
  const user = await requireUserContext(request, db, corsHeaders)
  if (user instanceof Response) return user
  const payload = asRecord(await readRequestJson(request))
  if (!payload) return errorJson(400, 'invalid_json_body', corsHeaders)
  const idempotencyKey = readIdempotencyKey(request, payload)
  if (!idempotencyKey) return errorJson(400, 'missing_idempotency_key', corsHeaders)
  const packageId = normalizeString(payload.package_id)
  const paymentPackage = STRYTREE_PAYMENT_PACKAGES[packageId]
  if (!paymentPackage) {
    return errorJson(400, 'unknown_credit_package', corsHeaders, {
      available_package_ids: Object.keys(STRYTREE_PAYMENT_PACKAGES),
    })
  }
  const existing = await readPaymentSessionByIdempotency(db, user.userId, idempotencyKey)
  if (existing) {
    return json(200, {
      ok: true,
      apiVersion: STRYTREE_API_VERSION,
      checkout_session_id: existing.provider_session_id || existing.id,
      payment_session_id: existing.id,
      status: existing.status,
      package_id: existing.package_id,
      credit_amount: normalizeNumber(existing.credit_amount),
      amount_total: normalizeNumber(existing.amount_total),
      currency: existing.currency,
      redirect_url: `/agentic-graph?strytree_checkout_session_id=${encodeURIComponent(existing.id)}`,
      idempotent_replay: true,
    }, corsHeaders)
  }
  const nowIso = new Date().toISOString()
  const sessionId = buildId('strypay', [user.userId, paymentPackage.id, idempotencyKey])
  const providerSessionId = buildId('localcheckout', [sessionId])
  const responseBody = {
    checkout_session_id: providerSessionId,
    payment_session_id: sessionId,
    status: 'open',
    package_id: paymentPackage.id,
    credit_amount: paymentPackage.creditAmount,
    amount_total: paymentPackage.amountTotal,
    currency: paymentPackage.currency,
    redirect_url: `/agentic-graph?strytree_checkout_session_id=${encodeURIComponent(sessionId)}`,
  }
  await execute(
    db,
    `INSERT INTO strytree_payment_sessions (
       id, user_id, package_id, status, provider, provider_session_id,
       amount_total, currency, credit_amount, idempotency_key,
       request_json, response_json, created_at, updated_at, completed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      user.userId,
      paymentPackage.id,
      'open',
      'local-checkout',
      providerSessionId,
      paymentPackage.amountTotal,
      paymentPackage.currency,
      paymentPackage.creditAmount,
      idempotencyKey,
      stableJson(payload),
      stableJson(responseBody),
      nowIso,
      nowIso,
      null,
    ],
  )
  await writeAuditEvent(db, {
    actorUserId: user.userId,
    action: 'checkout_session_create',
    objectType: 'strytree_payment_session',
    objectId: sessionId,
    status: 'open',
    idempotencyKey,
    metadata: { package_id: paymentPackage.id, credit_amount: paymentPackage.creditAmount },
    nowIso,
  })
  return json(201, { ok: true, apiVersion: STRYTREE_API_VERSION, ...responseBody }, corsHeaders)
}

const settlePaymentSession = async (
  db: D1DatabaseLike,
  args: {
    session: StrytreePaymentSessionRow
    userId: string
    idempotencyKey: string
    providerEventId?: string | null
    env: StrytreeWorkerEnv
    nowIso: string
  },
): Promise<{
  ledgerEventId: string | null
  balanceAfterCredits: number
  idempotentReplay: boolean
}> => {
  const currentBalance = await readBalance(db, args.userId)
  if (args.session.status === 'completed') {
    const existingLedger = await queryFirst<{ id: string; balance_after_credits: number }>(
      db,
      `SELECT id, balance_after_credits
       FROM strytree_token_ledger
       WHERE user_id = ? AND related_object_type = ? AND related_object_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [args.userId, 'strytree_payment_session', args.session.id],
    )
    return {
      ledgerEventId: existingLedger?.id ? String(existingLedger.id) : null,
      balanceAfterCredits: normalizeNumber(existingLedger?.balance_after_credits, currentBalance),
      idempotentReplay: true,
    }
  }
  const creditAmount = normalizeNumber(args.session.credit_amount)
  const balanceAfterCredits = currentBalance + creditAmount
  const ledgerEventId = buildId('ledger_purchase', [args.userId, args.session.id, args.providerEventId || args.idempotencyKey])
  const ledgerMutation = await writeLedgerEvent(db, args.env, {
    id: ledgerEventId,
    userId: args.userId,
    eventType: 'purchase_credit',
    amountCredits: creditAmount,
    balanceAfterCredits,
    relatedObjectType: 'strytree_payment_session',
    relatedObjectId: args.session.id,
    providerEventId: args.providerEventId || null,
    idempotencyKey: args.idempotencyKey,
    metadata: {
      package_id: args.session.package_id,
      provider: args.session.provider,
      provider_session_id: args.session.provider_session_id,
      provider_event_id: args.providerEventId || null,
      amount_total: normalizeNumber(args.session.amount_total),
      currency: args.session.currency,
    },
    nowIso: args.nowIso,
  })
  await writeAuditEvent(db, {
    actorUserId: args.userId,
    action: 'checkout_session_settle',
    replaySafe: true,
    objectType: 'strytree_payment_session',
    objectId: args.session.id,
    status: 'completed',
    idempotencyKey: args.idempotencyKey,
    metadata: { ledger_event_id: ledgerMutation.ledgerEventId, credit_amount: creditAmount },
    nowIso: args.nowIso,
  })
  await execute(
    db,
    `UPDATE strytree_payment_sessions
     SET status = ?, response_json = ?, updated_at = ?, completed_at = ?
     WHERE id = ? AND user_id = ?`,
    [
      'completed',
      stableJson({
        status: 'completed',
        ledger_event_id: ledgerMutation.ledgerEventId,
        balance_after_credits: ledgerMutation.balanceAfterCredits,
      }),
      args.nowIso,
      args.nowIso,
      args.session.id,
      args.userId,
    ],
  )
  return {
    ledgerEventId: ledgerMutation.ledgerEventId,
    balanceAfterCredits: ledgerMutation.balanceAfterCredits,
    idempotentReplay: ledgerMutation.idempotentReplay,
  }
}

export const handleCompleteCheckoutSession = async (
  request: Request,
  env: StrytreeWorkerEnv,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
  sessionId: string,
): Promise<Response> => {
  if (!localCheckoutEnabled(env)) return errorJson(403, 'local_checkout_completion_disabled', corsHeaders)
  const user = await requireUserContext(request, db, corsHeaders)
  if (user instanceof Response) return user
  const payload = asRecord(await readRequestJson(request))
  const idempotencyKey = readIdempotencyKey(request, payload)
  if (!idempotencyKey) return errorJson(400, 'missing_idempotency_key', corsHeaders)
  const session = await readPaymentSessionForUser(db, user.userId, sessionId)
  if (!session) return errorJson(404, 'checkout_session_not_found', corsHeaders)
  if (session.status !== 'open' && session.status !== 'completed') {
    return errorJson(409, 'checkout_session_not_settleable', corsHeaders, { status: session.status })
  }
  const settled = await settlePaymentSession(db, {
    session,
    userId: user.userId,
    idempotencyKey,
    env,
    nowIso: new Date().toISOString(),
  })
  return json(200, {
    ok: true,
    apiVersion: STRYTREE_API_VERSION,
    payment_session_id: session.id,
    status: 'completed',
    package_id: session.package_id,
    credit_amount: normalizeNumber(session.credit_amount),
    ledger_event_id: settled.ledgerEventId,
    balance_after_credits: settled.balanceAfterCredits,
    idempotent_replay: settled.idempotentReplay,
  }, corsHeaders)
}

export const handleGetWallet = async (
  request: Request,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  const user = await requireUserContext(request, db, corsHeaders)
  if (user instanceof Response) return user
  const [balance, pendingSessions] = await Promise.all([
    readBalance(db, user.userId),
    readPendingPaymentSessions(db, user.userId),
  ])
  const pendingCredits = pendingSessions.reduce((sum, session) => sum + normalizeNumber(session.credit_amount), 0)
  return json(200, {
    ok: true,
    apiVersion: STRYTREE_API_VERSION,
    user_id: user.userId,
    wallet_status: pendingSessions.length > 0 ? 'pending_payment' : 'settled',
    balance_credits: balance,
    pending_payment: pendingSessions.length > 0,
    pending_credit_amount: pendingCredits,
    pending_payment_sessions: pendingSessions.map(session => ({
      payment_session_id: session.id,
      checkout_session_id: session.provider_session_id,
      status: session.status,
      package_id: session.package_id,
      credit_amount: normalizeNumber(session.credit_amount),
      amount_total: normalizeNumber(session.amount_total),
      currency: session.currency,
      updated_at: session.updated_at,
    })),
  }, corsHeaders)
}

const paymentEvidenceString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const readPaymentAlias = (values: unknown[]): string => {
  const supplied = values.filter(value => value !== undefined)
  const first = paymentEvidenceString(supplied[0])
  return first && supplied.every(value => paymentEvidenceString(value) === first) ? first : ''
}

export const handleCheckoutWebhook = async (
  request: Request,
  env: StrytreeWorkerEnv,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  const signingSecret = readEnvString(env, 'STRYTREE_CHECKOUT_WEBHOOK_SECRET')
  if (!signingSecret) return errorJson(500, 'missing_checkout_webhook_secret', corsHeaders)
  const signature = request.headers.get('strytree-signature') || request.headers.get('stripe-signature') || ''
  const payload = await request.text()
  const verified = await verifyTimestampedSignature(payload, signature, signingSecret, Date.now())
  if (!verified) return errorJson(400, 'invalid_checkout_webhook_signature', corsHeaders)
  let parsedEvent: unknown
  try {
    parsedEvent = JSON.parse(payload)
  } catch {
    return errorJson(400, 'invalid_checkout_webhook_payload', corsHeaders)
  }
  const event = asRecord(parsedEvent)
  if (!event) return errorJson(400, 'invalid_checkout_webhook_payload', corsHeaders)
  const eventId = readPaymentAlias([event.id, event.event_id])
  if (!eventId) return errorJson(400, 'missing_provider_event_id', corsHeaders)
  const eventType = readPaymentAlias([event.type, event.event_type])
  if (!eventType) return errorJson(400, 'missing_provider_event_type', corsHeaders)
  const nestedObject = asRecord(asRecord(event.data)?.object)
  const alternateObject = asRecord(event.object)
  if ((event.data !== undefined && !nestedObject) || (nestedObject && alternateObject)) {
    return errorJson(400, 'invalid_checkout_webhook_payload', corsHeaders)
  }
  const dataObject = nestedObject || alternateObject
  if (!dataObject) return errorJson(400, 'invalid_checkout_webhook_payload', corsHeaders)
  const metadata = asRecord(dataObject.metadata) || {}
  const paymentSessionId = paymentEvidenceString(
    dataObject.payment_session_id ||
    metadata.strytree_payment_session_id ||
    metadata.payment_session_id,
  )
  const providerSessionId = paymentEvidenceString(
    dataObject.provider_session_id ||
    dataObject.id ||
    event.provider_session_id,
  )
  const paymentStatus = paymentEvidenceString(dataObject.payment_status)
  const success = (eventType === 'checkout.session.completed'
    || eventType === 'checkout.session.async_payment_succeeded') && paymentStatus === 'paid'
  if (!success) {
    return json(200, {
      ok: true,
      apiVersion: STRYTREE_API_VERSION,
      received: true,
      event_type: eventType || 'unknown',
      status: 'ignored',
    }, corsHeaders)
  }
  const session = paymentSessionId
    ? await readPaymentSessionById(db, paymentSessionId)
    : providerSessionId
      ? await readPaymentSessionByProviderSessionId(db, providerSessionId)
      : null
  if (!session) return errorJson(404, 'checkout_session_not_found', corsHeaders)
  // Signed bytes prove the sender, not that this payment belongs to this purchase.
  const sessionIds = [dataObject.payment_session_id, metadata.strytree_payment_session_id,
    metadata.payment_session_id].filter(value => value !== undefined)
  const providerIds = [dataObject.provider_session_id, dataObject.id,
    event.provider_session_id].filter(value => value !== undefined)
  const amount = dataObject.amount_total
  const currency = paymentEvidenceString(dataObject.currency).toLowerCase()
  if (providerIds.length === 0 || !session.provider_session_id
    || providerIds.some(value => paymentEvidenceString(value) !== session.provider_session_id)
    || sessionIds.some(value => paymentEvidenceString(value) !== session.id)
    || typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount <= 0
    || amount !== session.amount_total || !currency || currency !== session.currency.toLowerCase()
    || paymentEvidenceString(metadata.package_id) !== session.package_id
    || paymentEvidenceString(metadata.user_id) !== session.user_id) {
    return errorJson(400, 'checkout_payment_mismatch', corsHeaders)
  }
  if (session.status === 'completed') {
    const prior = await queryFirst<{ provider_event_id: string | null }>(db,
      `SELECT provider_event_id FROM strytree_token_ledger
       WHERE user_id = ? AND event_type = 'purchase_credit'
         AND related_object_type = 'strytree_payment_session' AND related_object_id = ?`,
      [session.user_id, session.id])
    if (!prior || prior.provider_event_id !== eventId) {
      return errorJson(409, 'provider-effect-conflict', corsHeaders)
    }
  }
  if (session.status !== 'open' && session.status !== 'completed') {
    return errorJson(409, 'checkout_session_not_settleable', corsHeaders, { status: session.status })
  }
  const settled = await settlePaymentSession(db, {
    session,
    userId: session.user_id,
    idempotencyKey: eventId,
    providerEventId: eventId,
    env,
    nowIso: new Date().toISOString(),
  })
  return json(200, {
    ok: true,
    apiVersion: STRYTREE_API_VERSION,
    received: true,
    event_type: eventType,
    provider_event_id: eventId,
    payment_session_id: session.id,
    status: 'completed',
    ledger_event_id: settled.ledgerEventId,
    balance_after_credits: settled.balanceAfterCredits,
    idempotent_replay: settled.idempotentReplay,
  }, corsHeaders)
}
