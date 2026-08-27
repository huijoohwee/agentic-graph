import {
  AGENTIC_COMMERCE_API_VERSION,
  AGENTIC_COMMERCE_ENV_KEYS,
  AGENTIC_COMMERCE_ROUTE_PATHS,
  AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY,
  AGENTIC_COMMERCE_X402_ROUTE_PATHS,
  buildAgenticCommerceAcpConfig,
  buildAgenticCommerceDepositAddress,
  buildAgenticCommerceSemanticKey,
  isAgenticCommerceWeb3Enabled,
  normalizeAgenticCommerceAmount,
  normalizeAgenticCommerceCurrency,
  readAgenticCommerceCheckoutBaseUrl,
  readAgenticCommerceSellerId,
  type AgenticCommerceEnvLike,
} from '../../../grph-shared/src/payments/agenticCommerceSsot'
import type { StripeCheckoutSessionCreatePayload } from '../../../grph-shared/src/payments/stripePaymentSsot'
import {
  AGENTIC_COMMERCE_SOLANA_PAY_KEY,
  AGENTIC_COMMERCE_SOLANA_PAY_SETTLE_PATH,
} from '../../../grph-shared/src/payments/agenticCommerceSolanaPaySsot'
import type { D1DatabaseLike } from '../shared/d1'
import {
  asRecord,
  mapSessionRow,
  parseJson,
  readProofForSession,
  readProofRows,
  readRecordString,
  readSession,
  readSessionByIdempotencyKey,
  readTraceRows,
  stableJson,
  updateSessionState,
  writeSession,
  writeTraceEvent,
  type AgenticCommercePaymentRail,
  type AgenticCommerceSessionRow,
  type AgenticCommerceSessionStatus,
  type AgenticCommerceSessionWrite,
} from './agenticCommercePersistence'
import {
  authorizeStripeDelegatePayment,
  ingestOpenboxProof,
} from './agenticCommerceIntegrations'
import { settleAgenticCommerceSession } from './agenticCommerceSettlement'
import { handleAgenticCommerceX402Route } from './agenticCommerceX402'
import {
  buildAgenticCommerceSolanaPaySessionResponse,
  readAgenticCommerceSolanaPaySessionResponse,
} from './agenticCommerceSolanaPay'
import {
  handleAgenticCommerceSolanaPaySettle,
  handleAgenticCommerceWeb3Settle,
  settleAgenticCommerceSolanaPaySession,
} from './agenticCommerceOnchainRoutes'
import { errorJson, json, readRequestJson, type HeadersRecord } from './agenticCommerceHttp'
import {
  createStripeHostedCheckoutSessionForWorker,
  expireStripeHostedCheckoutSessionForWorker,
} from './payments'

export { settleAgenticCommerceSessionFromStripeSession } from './agenticCommerceSettlement'

type ParsedSessionRoute =
  | { kind: 'collection' }
  | { kind: 'item'; id: string; action: '' | 'complete' | 'cancel' }
  | null

type AgenticCommerceStripeCheckoutResponse = {
  id: string
  url: string
  status: string
  payment_status: string
}

const readCheckoutBaseUrl = (env: AgenticCommerceEnvLike, request: Request): string =>
  readAgenticCommerceCheckoutBaseUrl(env, request.url)

const readSellerId = (env: AgenticCommerceEnvLike, request: Request): string =>
  readAgenticCommerceSellerId(env, request.url)

const parseSessionRoute = (pathname: string): ParsedSessionRoute => {
  if (pathname === AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions) return { kind: 'collection' }
  const prefix = `${AGENTIC_COMMERCE_ROUTE_PATHS.checkoutSessions}/`
  if (!pathname.startsWith(prefix)) return null
  const parts = pathname.slice(prefix.length).split('/').filter(Boolean)
  if (parts.length < 1 || parts.length > 2) return null
  const action = parts[1] || ''
  if (action !== '' && action !== 'complete' && action !== 'cancel') return null
  return { kind: 'item', id: decodeURIComponent(parts[0]), action }
}

const readAcpBearerToken = (env: AgenticCommerceEnvLike): string =>
  String(env[AGENTIC_COMMERCE_ENV_KEYS.acpBearerToken] || '').trim()

const isAuthorizedAcpRequest = (request: Request, env: AgenticCommerceEnvLike): boolean => {
  const expected = readAcpBearerToken(env)
  if (!expected) return true
  return request.headers.get('authorization') === `Bearer ${expected}`
}

const readWeb3Extension = (payload: Record<string, unknown>): Record<string, unknown> | null =>
  asRecord(payload['x-web3']) || asRecord(payload.x_web3)

const readPaymentRail = (payload: Record<string, unknown>): AgenticCommercePaymentRail => {
  const web3 = readWeb3Extension(payload)
  const web3Method = web3 ? readRecordString(web3, 'payment_method').toLowerCase() : ''
  const rail = readRecordString(payload, 'payment_rail').toLowerCase()
  if (web3Method === AGENTIC_COMMERCE_SOLANA_PAY_KEY || rail === AGENTIC_COMMERCE_SOLANA_PAY_KEY) return AGENTIC_COMMERCE_SOLANA_PAY_KEY
  return web3Method === 'erc20' || rail === 'erc20' ? 'erc20' : 'fiat'
}

const readCheckoutAmount = (payload: Record<string, unknown>): number => {
  const direct = normalizeAgenticCommerceAmount(payload.amount_total ?? payload.amount)
  if (direct > 0) return direct
  const items = Array.isArray(payload.items) ? payload.items : []
  let total = 0
  for (const item of items) {
    const itemRecord = asRecord(item)
    if (!itemRecord) continue
    const unitAmount = normalizeAgenticCommerceAmount(itemRecord.unit_amount ?? itemRecord.amount_total ?? itemRecord.amount)
    const quantity = Math.max(1, normalizeAgenticCommerceAmount(itemRecord.quantity || 1))
    total += unitAmount * quantity
  }
  return total
}

const readCheckoutCurrency = (payload: Record<string, unknown>): string => {
  const direct = normalizeAgenticCommerceCurrency(payload.currency)
  if (direct) return direct
  const items = Array.isArray(payload.items) ? payload.items : []
  for (const item of items) {
    const itemRecord = asRecord(item)
    const currency = itemRecord ? normalizeAgenticCommerceCurrency(itemRecord.currency) : ''
    if (currency) return currency
  }
  return ''
}

const handleAcpConfig = (
  request: Request,
  env: AgenticCommerceEnvLike,
  corsHeaders: HeadersRecord,
): Response => {
  const sellerId = readSellerId(env, request)
  const checkoutBaseUrl = readCheckoutBaseUrl(env, request)
  return json(200, buildAgenticCommerceAcpConfig({
    sellerId,
    checkoutBaseUrl,
    web3Enabled: isAgenticCommerceWeb3Enabled(env),
  }), corsHeaders)
}

const readStoredStripeCheckoutResponse = (row: AgenticCommerceSessionRow): AgenticCommerceStripeCheckoutResponse | null => {
  const response = asRecord(parseJson(row.response_json || '{}', {}))
  const stripeCheckout = response ? asRecord(response[AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY]) : null
  if (!stripeCheckout) return null
  const id = readRecordString(stripeCheckout, 'id')
  const url = readRecordString(stripeCheckout, 'url')
  if (!id || !url) return null
  return {
    id,
    url,
    status: readRecordString(stripeCheckout, 'status') || 'open',
    payment_status: readRecordString(stripeCheckout, 'payment_status') || 'unpaid',
  }
}

const mapSessionRowForResponse = (row: AgenticCommerceSessionRow) => {
  const mapped = mapSessionRow(row)
  const stripeCheckout = readStoredStripeCheckoutResponse(row)
  const solanaPay = readAgenticCommerceSolanaPaySessionResponse(row)
  return {
    ...mapped,
    ...(stripeCheckout ? { [AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY]: stripeCheckout } : {}),
    ...(solanaPay ? { [AGENTIC_COMMERCE_SOLANA_PAY_KEY]: solanaPay } : {}),
  }
}

const readRequestedStripeCheckoutPayload = (
  payload: Record<string, unknown>,
  sessionId: string,
): StripeCheckoutSessionCreatePayload | null => {
  const stripeCheckout = asRecord(payload[AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY])
  if (!stripeCheckout) return null
  return {
    successUrl: readRecordString(stripeCheckout, 'success_url'),
    cancelUrl: readRecordString(stripeCheckout, 'cancel_url'),
    workspaceId: readRecordString(stripeCheckout, 'workspace_id') || null,
    agenticCommerceSessionId: sessionId,
  }
}

const buildSessionCreateWrite = (
  request: Request,
  env: AgenticCommerceEnvLike,
  payload: Record<string, unknown>,
  nowIso: string,
): { ok: true; session: AgenticCommerceSessionWrite } | { ok: false; error: string } => {
  const amountTotal = readCheckoutAmount(payload)
  const currency = readCheckoutCurrency(payload)
  if (amountTotal <= 0) return { ok: false, error: 'amount_total must be a positive integer minor-unit amount.' }
  if (!currency) return { ok: false, error: 'currency must be a currency code or token symbol.' }

  const sellerId = readSellerId(env, request)
  const paymentRail = readPaymentRail(payload)
  const web3 = readWeb3Extension(payload)
  const payerDid = web3 ? readRecordString(web3, 'payer_did') || null : null
  const requestJson = stableJson(payload)
  const payloadHash = buildAgenticCommerceSemanticKey('checkout-payload', [requestJson])
  const headerIdempotencyKey = request.headers.get('idempotency-key') || request.headers.get('Idempotency-Key')
  const idempotencyKey = String(payload.idempotency_key || headerIdempotencyKey || payloadHash).trim()
  const sessionId = `acp_${buildAgenticCommerceSemanticKey('checkout-session', [sellerId, idempotencyKey, payloadHash])}`
  const solanaPay = paymentRail === AGENTIC_COMMERCE_SOLANA_PAY_KEY
    ? buildAgenticCommerceSolanaPaySessionResponse(env, { id: sessionId, amountTotal, currency })
    : null
  if (solanaPay && solanaPay.ok !== true) return { ok: false, error: solanaPay.error }
  const depositAddress = paymentRail === 'erc20'
    ? buildAgenticCommerceDepositAddress(env, sessionId)
    : (solanaPay?.ok === true ? solanaPay.recipient : null)
  const status: AgenticCommerceSessionStatus = paymentRail === 'erc20' || paymentRail === AGENTIC_COMMERCE_SOLANA_PAY_KEY
    ? 'pending_onchain'
    : 'open'
  const baseResponse = {
    id: sessionId,
    seller_id: sellerId,
    idempotency_key: idempotencyKey,
    status,
    payment_rail: paymentRail,
    amount_total: amountTotal,
    currency,
    payer_did: payerDid,
    deposit_address: depositAddress,
    risk_signals: [],
    created_at: nowIso,
    updated_at: nowIso,
    completed_at: null,
    cancelled_at: null,
    ...(solanaPay?.ok === true ? { [AGENTIC_COMMERCE_SOLANA_PAY_KEY]: solanaPay.solanaPay } : {}),
  }
  return {
    ok: true,
    session: {
      id: sessionId,
      sellerId,
      idempotencyKey,
      payloadHash,
      status,
      paymentRail,
      amountTotal,
      currency,
      payerDid,
      depositAddress,
      requestJson,
      responseJson: stableJson(baseResponse),
      riskSignalsJson: '[]',
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
      cancelledAt: null,
    },
  }
}

const handleCreateSession = async (
  request: Request,
  env: AgenticCommerceEnvLike,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  const payload = asRecord(await readRequestJson(request))
  if (!payload) return errorJson(400, 'Checkout session body must be a JSON object.', corsHeaders)
  const nowIso = new Date().toISOString()
  const parsed = buildSessionCreateWrite(request, env, payload, nowIso)
  if (parsed.ok !== true) return errorJson(400, parsed.error, corsHeaders)

  const existing = await readSessionByIdempotencyKey(db, parsed.session.sellerId, parsed.session.idempotencyKey)
  if (existing) {
    if (existing.payload_hash !== parsed.session.payloadHash) {
      return json(409, {
        ok: false,
        apiVersion: AGENTIC_COMMERCE_API_VERSION,
        error: 'idempotency key already owns a different checkout payload',
        session: mapSessionRow(existing),
      }, corsHeaders)
    }
    return json(201, {
      ok: true,
      apiVersion: AGENTIC_COMMERCE_API_VERSION,
      session: mapSessionRowForResponse(existing),
    }, corsHeaders)
  }

  const stripeCheckoutPayload = readRequestedStripeCheckoutPayload(payload, parsed.session.id)
  let createdStripeCheckoutSessionId = ''
  if (stripeCheckoutPayload && parsed.session.paymentRail !== 'fiat') {
    return errorJson(422, 'stripe_checkout requires a fiat ACP checkout session.', corsHeaders)
  }
  if (stripeCheckoutPayload) {
    const stripeCheckout = await createStripeHostedCheckoutSessionForWorker({
      request,
      env,
      db,
      payload: {
        ...stripeCheckoutPayload,
        expectedAmountTotal: parsed.session.amountTotal,
        expectedCurrency: parsed.session.currency,
      },
    })
    if (stripeCheckout.ok !== true) return errorJson(stripeCheckout.status, stripeCheckout.error, corsHeaders)
    createdStripeCheckoutSessionId = stripeCheckout.session.id
    const previousResponse = asRecord(parseJson(parsed.session.responseJson, {})) || {}
    parsed.session.responseJson = stableJson({
      ...previousResponse,
      [AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY]: {
        id: stripeCheckout.body.id,
        url: stripeCheckout.body.url,
        status: stripeCheckout.body.status,
        payment_status: stripeCheckout.body.paymentStatus,
      },
    })
  }

  try {
    await writeSession(db, parsed.session)
  } catch (error) {
    if (createdStripeCheckoutSessionId) {
      const expired = await expireStripeHostedCheckoutSessionForWorker({
        env,
        db,
        sessionId: createdStripeCheckoutSessionId,
      })
      const expireStatus = expired.ok === true
        ? 'The hosted Stripe Checkout Session was expired.'
        : `Stripe Checkout Session expiry failed: ${expired.error}`
      return errorJson(
        500,
        `Failed to persist ACP checkout session after Stripe Checkout creation. ${expireStatus}`,
        corsHeaders,
      )
    }
    throw error
  }
  if (stripeCheckoutPayload) {
    await writeTraceEvent(db, {
      sessionId: parsed.session.id,
      eventType: 'knowgrph.commerce.stripe_checkout_session',
      payload: {
        tool: 'knowgrph.commerce.stripe_checkout_session',
        session_id: parsed.session.id,
        provider: 'stripe',
      },
      createdAt: nowIso,
    })
  }
  if (parsed.session.paymentRail === AGENTIC_COMMERCE_SOLANA_PAY_KEY) {
    await writeTraceEvent(db, {
      sessionId: parsed.session.id,
      eventType: 'knowgrph.commerce.solana_pay_request',
      payload: {
        tool: 'knowgrph.commerce.solana_pay_request',
        session_id: parsed.session.id,
        provider: AGENTIC_COMMERCE_SOLANA_PAY_KEY,
      },
      createdAt: nowIso,
    })
  }
  const created = await readSession(db, parsed.session.id)
  return json(201, {
    ok: true,
    apiVersion: AGENTIC_COMMERCE_API_VERSION,
    session: created ? mapSessionRowForResponse(created) : parseJson(parsed.session.responseJson, {}),
  }, corsHeaders)
}

const handleGetSession = async (
  db: D1DatabaseLike,
  sessionId: string,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  const session = await readSession(db, sessionId)
  if (!session) return errorJson(404, 'ACP checkout session not found.', corsHeaders)
  const proof = await readProofForSession(db, sessionId)
  return json(200, {
    ok: true,
    apiVersion: AGENTIC_COMMERCE_API_VERSION,
    session: mapSessionRowForResponse(session),
    ...(proof ? { proof: parseJson(proof.proof_json, null) } : {}),
  }, corsHeaders)
}

const readArtifactSessionId = (request: Request): string | null => {
  const value = new URL(request.url).searchParams.get('session_id')
  const sessionId = String(value || '').trim()
  return sessionId || null
}

const handleProofArtifact = async (
  request: Request,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  const rows = await readProofRows(db, readArtifactSessionId(request))
  return json(200, {
    schema: 'knowgrph-commerce-proof/v1',
    apiVersion: AGENTIC_COMMERCE_API_VERSION,
    commerce: rows.map(row => parseJson(row.proof_json, {
      proof_id: row.id,
      session_id: row.session_id,
    })),
  }, corsHeaders)
}

const handleTraceArtifact = async (
  request: Request,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  const rows = await readTraceRows(db, readArtifactSessionId(request))
  const body = rows
    .map(row => stableJson({
      event: row.event_type,
      session_id: row.session_id,
      created_at: row.created_at,
      payload: parseJson(row.payload_json, {}),
    }))
    .join('\n')
  return new Response(body ? `${body}\n` : '', {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders,
    },
  })
}

const readProofSessionId = (value: unknown): string => {
  const record = asRecord(value)
  if (!record) return ''
  const direct = readRecordString(record, 'session_id')
  if (direct) return direct
  const commerce = Array.isArray(record.commerce) ? record.commerce : []
  for (const entry of commerce) {
    const entryRecord = asRecord(entry)
    const sessionId = entryRecord ? readRecordString(entryRecord, 'session_id') : ''
    if (sessionId) return sessionId
  }
  return ''
}

const handleOpenboxIngest = async (
  request: Request,
  env: AgenticCommerceEnvLike,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  const payload = await readRequestJson(request)
  if (!payload) return errorJson(400, 'OpenBOX ingest body must be JSON.', corsHeaders)
  const result = await ingestOpenboxProof(env, payload)
  if (!result) return errorJson(503, 'OPENBOX_INGEST_URL is required for OpenBOX ingest.', corsHeaders)
  const sessionId = readProofSessionId(payload)
  if (sessionId && await readSession(db, sessionId)) {
    await writeTraceEvent(db, {
      sessionId,
      eventType: 'knowgrph.commerce.openbox_ingest',
      payload: {
        tool: 'knowgrph.commerce.openbox_ingest',
        session_id: sessionId,
        ok: result.ok,
        status: result.status,
        error: result.ok ? null : result.error,
      },
      createdAt: new Date().toISOString(),
    })
  }
  if (!result.ok) return errorJson(result.status, result.error, corsHeaders)
  return json(200, {
    ok: true,
    apiVersion: AGENTIC_COMMERCE_API_VERSION,
    status: result.status,
  }, corsHeaders)
}

const handleCompleteSession = async (
  request: Request,
  env: AgenticCommerceEnvLike,
  db: D1DatabaseLike,
  sessionId: string,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  const session = await readSession(db, sessionId)
  if (!session) return errorJson(404, 'ACP checkout session not found.', corsHeaders)
  if (session.status === 'cancelled' || session.status === 'payment_failed') {
    return errorJson(409, `ACP checkout sessions with status ${session.status} cannot be completed.`, corsHeaders)
  }
  if (session.payment_rail === 'fiat' && session.status !== 'complete' && readStoredStripeCheckoutResponse(session)) {
    return errorJson(409, 'Hosted Stripe ACP checkout sessions complete only from verified Stripe webhook or status refresh.', corsHeaders)
  }
  const payload = asRecord(await readRequestJson(request)) || {}
  if (session.payment_rail === AGENTIC_COMMERCE_SOLANA_PAY_KEY && session.status !== 'complete') {
    return settleAgenticCommerceSolanaPaySession(env, db, session, payload, corsHeaders)
  }
  const vaultToken = readRecordString(payload, 'vault_token') || readRecordString(payload, 'payment_token') || readRecordString(payload, 'shared_payment_token')
  if (session.payment_rail === 'fiat' && session.status !== 'complete' && !vaultToken) {
    return errorJson(422, 'vault_token is required to complete a fiat ACP checkout session.', corsHeaders)
  }
  if (session.payment_rail === 'fiat' && session.status !== 'complete') {
    const authorization = await authorizeStripeDelegatePayment(env, session, vaultToken)
    const authorizedAt = new Date().toISOString()
    await writeTraceEvent(db, {
      sessionId,
      eventType: authorization.ok ? 'knowgrph.commerce.delegate_payment' : 'knowgrph.commerce.payment_failed',
      payload: {
        tool: 'knowgrph.commerce.delegate_payment',
        session_id: sessionId,
        ok: authorization.ok,
        details: authorization.details || null,
        error: authorization.ok ? null : authorization.error,
      },
      createdAt: authorizedAt,
    })
    if (!authorization.ok) {
      const failedSession: AgenticCommerceSessionRow = {
        ...session,
        status: 'payment_failed',
        updated_at: authorizedAt,
      }
      await updateSessionState(db, {
        id: session.id,
        status: 'payment_failed',
        responseJson: stableJson(mapSessionRow(failedSession)),
        riskSignalsJson: session.risk_signals_json || '[]',
        updatedAt: authorizedAt,
      })
      return errorJson(authorization.status, authorization.error, corsHeaders)
    }
  }
  const settled = await settleAgenticCommerceSession(db, env, sessionId, {
    txHash: readRecordString(payload, 'tx_hash') || null,
    attestationUid: readRecordString(payload, 'attestation_uid') || null,
  })
  if (!settled) return errorJson(404, 'ACP checkout session not found.', corsHeaders)
  return json(200, {
    ok: true,
    apiVersion: AGENTIC_COMMERCE_API_VERSION,
    session: settled.session,
    proof: settled.proof,
  }, corsHeaders)
}

const handleCancelSession = async (
  db: D1DatabaseLike,
  sessionId: string,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  const session = await readSession(db, sessionId)
  if (!session) return errorJson(404, 'ACP checkout session not found.', corsHeaders)
  if (session.status === 'complete') return errorJson(409, 'completed ACP checkout sessions cannot be cancelled.', corsHeaders)
  if (session.status === 'payment_failed') return errorJson(409, 'payment-failed ACP checkout sessions cannot be cancelled.', corsHeaders)
  const cancelledAt = session.cancelled_at || new Date().toISOString()
  const cancelledSession: AgenticCommerceSessionRow = {
    ...session,
    status: 'cancelled',
    updated_at: cancelledAt,
    cancelled_at: cancelledAt,
  }
  const previousStripeCheckout = readStoredStripeCheckoutResponse(session)
  await updateSessionState(db, {
    id: session.id,
    status: 'cancelled',
    responseJson: stableJson({
      ...mapSessionRow(cancelledSession),
      ...(previousStripeCheckout ? { [AGENTIC_COMMERCE_STRIPE_CHECKOUT_KEY]: previousStripeCheckout } : {}),
    }),
    riskSignalsJson: session.risk_signals_json || '[]',
    updatedAt: cancelledAt,
    cancelledAt,
  })
  const updated = await readSession(db, session.id)
  return json(200, {
    ok: true,
    apiVersion: AGENTIC_COMMERCE_API_VERSION,
    session: updated ? mapSessionRowForResponse(updated) : mapSessionRow(cancelledSession),
  }, corsHeaders)
}

const handleCommerceWebhook = async (
  request: Request,
  env: AgenticCommerceEnvLike,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  const payload = asRecord(await readRequestJson(request))
  const sessionId = payload ? readRecordString(payload, 'session_id') : ''
  if (!sessionId) return errorJson(400, 'session_id is required.', corsHeaders)
  const session = await readSession(db, sessionId)
  if (!session) return errorJson(404, 'ACP checkout session not found.', corsHeaders)
  if (session.payment_rail === AGENTIC_COMMERCE_SOLANA_PAY_KEY) {
    return errorJson(409, 'Solana Pay sessions settle only through verified Solana Pay signature routes.', corsHeaders)
  }
  const settled = await settleAgenticCommerceSession(db, env, sessionId, {
    txHash: payload ? readRecordString(payload, 'tx_hash') || null : null,
    attestationUid: payload ? readRecordString(payload, 'attestation_uid') || null : null,
  })
  if (!settled) return errorJson(404, 'ACP checkout session not found.', corsHeaders)
  return json(200, {
    ok: true,
    apiVersion: AGENTIC_COMMERCE_API_VERSION,
    received: true,
    session: settled.session,
    proof: settled.proof,
  }, corsHeaders)
}

export const isAgenticCommerceRoute = (pathname: string): boolean => (
  pathname === AGENTIC_COMMERCE_ROUTE_PATHS.acpConfig
  || AGENTIC_COMMERCE_X402_ROUTE_PATHS.includes(pathname as never)
  || pathname === AGENTIC_COMMERCE_ROUTE_PATHS.commerceWebhook
  || pathname === AGENTIC_COMMERCE_ROUTE_PATHS.commerceProofArtifact
  || pathname === AGENTIC_COMMERCE_ROUTE_PATHS.commerceTraceArtifact
  || pathname === AGENTIC_COMMERCE_ROUTE_PATHS.openboxIngest
  || pathname === AGENTIC_COMMERCE_ROUTE_PATHS.web3Settle
  || pathname === AGENTIC_COMMERCE_SOLANA_PAY_SETTLE_PATH
  || parseSessionRoute(pathname) !== null
)

export const isAgenticCommerceRouteDbBacked = (pathname: string): boolean => (
  pathname !== AGENTIC_COMMERCE_ROUTE_PATHS.acpConfig && !AGENTIC_COMMERCE_X402_ROUTE_PATHS.includes(pathname as never) && isAgenticCommerceRoute(pathname)
)

export const handleAgenticCommerceRoute = async (
  request: Request,
  env: AgenticCommerceEnvLike,
  db: D1DatabaseLike | null,
  corsHeaders: HeadersRecord,
): Promise<Response | null> => {
  const pathname = new URL(request.url).pathname
  if (pathname === AGENTIC_COMMERCE_ROUTE_PATHS.acpConfig && request.method === 'GET') {
    return handleAcpConfig(request, env, corsHeaders)
  }
  if (pathname === AGENTIC_COMMERCE_ROUTE_PATHS.acpConfig) {
    return errorJson(404, 'ACP config route not found.', corsHeaders)
  }
  if (AGENTIC_COMMERCE_X402_ROUTE_PATHS.includes(pathname as never) && request.method === 'GET') {
    return handleAgenticCommerceX402Route(request, env, corsHeaders)
  }
  if (AGENTIC_COMMERCE_X402_ROUTE_PATHS.includes(pathname as never)) {
    return errorJson(404, 'x402 payment route not found.', corsHeaders)
  }
  if (!db) return errorJson(500, 'missing Cloudflare D1 binding DB', corsHeaders)
  if (!isAuthorizedAcpRequest(request, env)) return errorJson(401, 'ACP bearer token is required.', corsHeaders)
  if (pathname === AGENTIC_COMMERCE_ROUTE_PATHS.commerceProofArtifact && request.method === 'GET') {
    return handleProofArtifact(request, db, corsHeaders)
  }
  if (pathname === AGENTIC_COMMERCE_ROUTE_PATHS.commerceTraceArtifact && request.method === 'GET') {
    return handleTraceArtifact(request, db, corsHeaders)
  }
  if (pathname === AGENTIC_COMMERCE_ROUTE_PATHS.openboxIngest && request.method === 'POST') {
    return handleOpenboxIngest(request, env, db, corsHeaders)
  }
  if (pathname === AGENTIC_COMMERCE_ROUTE_PATHS.web3Settle && request.method === 'POST') {
    return handleAgenticCommerceWeb3Settle(request, env, db, corsHeaders)
  }
  if (pathname === AGENTIC_COMMERCE_SOLANA_PAY_SETTLE_PATH && request.method === 'POST') {
    return handleAgenticCommerceSolanaPaySettle(request, env, db, corsHeaders)
  }
  if (pathname === AGENTIC_COMMERCE_ROUTE_PATHS.commerceWebhook && request.method === 'POST') {
    return handleCommerceWebhook(request, env, db, corsHeaders)
  }
  const sessionRoute = parseSessionRoute(pathname)
  if (!sessionRoute) return null
  if (sessionRoute.kind === 'collection' && request.method === 'POST') {
    return handleCreateSession(request, env, db, corsHeaders)
  }
  if (sessionRoute.kind === 'item' && sessionRoute.action === '' && request.method === 'GET') {
    return handleGetSession(db, sessionRoute.id, corsHeaders)
  }
  if (sessionRoute.kind === 'item' && sessionRoute.action === 'complete' && request.method === 'POST') {
    return handleCompleteSession(request, env, db, sessionRoute.id, corsHeaders)
  }
  if (sessionRoute.kind === 'item' && sessionRoute.action === 'cancel' && request.method === 'POST') {
    return handleCancelSession(db, sessionRoute.id, corsHeaders)
  }
  return errorJson(404, 'ACP checkout route not found.', corsHeaders)
}
