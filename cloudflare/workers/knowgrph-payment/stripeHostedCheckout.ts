import {
  STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID,
  STRIPE_CHECKOUT_METADATA_WORKSPACE_ID,
  STRIPE_PAYMENT_MISSING_SERVER_KEY_ERROR,
  STRIPE_PAYMENT_REQUEST_API_VERSION,
  buildStripeCheckoutSessionCreateForm,
  isStripeCheckoutReturnUrlAllowed,
  readStripeCheckoutExpectedSessionTotal,
  readStripeCheckoutRequestUrlOrigin,
  readStripeCheckoutReturnOrigin,
  readStripeCheckoutStripeIdempotencyKey,
  readStripePaymentServerKey,
  resolveStripeCheckoutServerConfig,
  validateStripeCheckoutExpectedTotalForConfig,
  validateStripeCheckoutSessionCreatePayload,
  type StripeCheckoutSessionCreatePayload,
} from '../../../grph-shared/src/payments/stripePaymentSsot'
import {
  execute,
  normalizeNumber,
  type D1DatabaseLike,
} from '../shared/d1'

export type StripePaymentEnv = Record<string, unknown>
type HeadersRecord = Record<string, string>

export type StripeSessionWrite = {
  id: string
  workspaceId: string | null
  status: string
  paymentStatus: string
  mode: string
  amountTotal: number | null
  currency: string | null
  customerId: string | null
  customerEmail: string | null
  url: string | null
  metadataJson: string
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type StripeCheckoutSessionRow = {
  id: string
  workspace_id: string | null
  status: string
  payment_status: string
  mode: string
  amount_total: number | null
  currency: string | null
  customer_id: string | null
  customer_email: string | null
  url: string | null
  metadata_json: string
  created_at: string
  updated_at: string
  completed_at: string | null
}

export type StripeHostedCheckoutSessionCreateSuccess = {
  ok: true
  session: StripeSessionWrite
  body: {
    id: string
    url: string
    status: string
    paymentStatus: string
  }
}

export type StripeHostedCheckoutSessionCreateFailure = {
  ok: false
  status: number
  error: string
}

const STRIPE_CHECKOUT_SESSIONS_URL =
  'https://api.stripe.com/v1/checkout/sessions'

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object'
    ? value as Record<string, unknown>
    : null

export const readRecordString = (
  record: Record<string, unknown>,
  key: string,
): string => {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

const readSessionCustomerId = (
  session: Record<string, unknown>,
): string | null => {
  const customer = session.customer
  if (typeof customer === 'string' && customer.trim()) return customer.trim()
  const customerRecord = asRecord(customer)
  return customerRecord ? readRecordString(customerRecord, 'id') || null : null
}

const readSessionCustomerEmail = (
  session: Record<string, unknown>,
): string | null => {
  const customerDetails = asRecord(session.customer_details)
  const fromDetails = customerDetails
    ? readRecordString(customerDetails, 'email')
    : ''
  if (fromDetails) return fromDetails
  return readRecordString(session, 'customer_email') || null
}

const readSessionWorkspaceId = (
  session: Record<string, unknown>,
): string | null => {
  const metadata = asRecord(session.metadata)
  const fromMetadata = metadata
    ? readRecordString(metadata, STRIPE_CHECKOUT_METADATA_WORKSPACE_ID)
    : ''
  const agenticCommerceSessionId = metadata
    ? readRecordString(
        metadata,
        STRIPE_CHECKOUT_METADATA_AGENTIC_COMMERCE_SESSION_ID,
      )
    : ''
  const clientReference = readRecordString(session, 'client_reference_id')
  if (fromMetadata) return fromMetadata
  if (
    agenticCommerceSessionId
    && clientReference === agenticCommerceSessionId
  ) return null
  return clientReference || null
}

const jsonStable = (value: unknown): string => {
  try {
    return JSON.stringify(value && typeof value === 'object' ? value : {})
  } catch {
    return '{}'
  }
}

const isoFromStripeCreated = (
  value: unknown,
  fallbackIso: string,
): string => {
  const seconds = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return fallbackIso
  try {
    return new Date(Math.floor(seconds) * 1000).toISOString()
  } catch {
    return fallbackIso
  }
}

export const mapStripeSession = (
  raw: unknown,
  nowIso: string,
  completedAt: string | null,
): StripeSessionWrite | null => {
  const session = asRecord(raw)
  if (!session) return null
  const id = readRecordString(session, 'id')
  if (!id) return null
  const metadata = asRecord(session.metadata) || {}
  return {
    id,
    workspaceId: readSessionWorkspaceId(session),
    status: readRecordString(session, 'status') || 'unknown',
    paymentStatus: readRecordString(session, 'payment_status') || 'unknown',
    mode: readRecordString(session, 'mode') || 'payment',
    amountTotal:
      session.amount_total == null
        ? null
        : normalizeNumber(session.amount_total),
    currency: readRecordString(session, 'currency') || null,
    customerId: readSessionCustomerId(session),
    customerEmail: readSessionCustomerEmail(session),
    url: readRecordString(session, 'url') || null,
    metadataJson: jsonStable(metadata),
    createdAt: isoFromStripeCreated(session.created, nowIso),
    updatedAt: nowIso,
    completedAt,
  }
}

export const isStripeCheckoutSessionPaymentResolved = (
  session: Pick<StripeSessionWrite, 'paymentStatus'> | null | undefined,
): boolean => {
  const paymentStatus = String(session?.paymentStatus || '').toLowerCase()
  return paymentStatus === 'paid' || paymentStatus === 'no_payment_required'
}

export const isStripeCheckoutSessionExpired = (
  session: Pick<StripeSessionWrite, 'status'> | null | undefined,
): boolean => String(session?.status || '').toLowerCase() === 'expired'

export const writeStripeCheckoutSession = async (
  db: D1DatabaseLike,
  session: StripeSessionWrite,
): Promise<void> => {
  await execute(
    db,
    `INSERT INTO stripe_checkout_sessions (
       id, workspace_id, status, payment_status, mode, amount_total, currency,
       customer_id, customer_email, url, metadata_json, created_at, updated_at, completed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       workspace_id = excluded.workspace_id,
       status = excluded.status,
       payment_status = excluded.payment_status,
       mode = excluded.mode,
       amount_total = excluded.amount_total,
       currency = excluded.currency,
       customer_id = excluded.customer_id,
       customer_email = excluded.customer_email,
       url = COALESCE(excluded.url, stripe_checkout_sessions.url),
       metadata_json = excluded.metadata_json,
       updated_at = excluded.updated_at,
       completed_at = COALESCE(
         excluded.completed_at,
         stripe_checkout_sessions.completed_at
       )`,
    [
      session.id,
      session.workspaceId,
      session.status,
      session.paymentStatus,
      session.mode,
      session.amountTotal,
      session.currency,
      session.customerId,
      session.customerEmail,
      session.url,
      session.metadataJson,
      session.createdAt,
      session.updatedAt,
      session.completedAt,
    ],
  )
}

export const mapStripeCheckoutSessionRow = (
  row: StripeCheckoutSessionRow,
) => ({
  id: row.id,
  status: row.status,
  paymentStatus: row.payment_status,
  mode: row.mode,
  amountTotal: row.amount_total,
  currency: row.currency,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  completedAt: row.completed_at,
})

export const mapStripeCheckoutSessionWrite = (
  session: StripeSessionWrite,
) => ({
  id: session.id,
  status: session.status,
  paymentStatus: session.paymentStatus,
  mode: session.mode,
  amountTotal: session.amountTotal,
  currency: session.currency,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
  completedAt: session.completedAt,
})

export const retrieveStripeCheckoutSessionForWorker = async (
  env: StripePaymentEnv,
  sessionId: string,
): Promise<{
  ok: true
  raw: Record<string, unknown>
  session: StripeSessionWrite
} | {
  ok: false
  status: number
  error: string
}> => {
  const apiKey = readStripePaymentServerKey(env)
  if (!apiKey) {
    return {
      ok: false,
      status: 404,
      error: 'Stripe Checkout Session status not found.',
    }
  }
  const response = await fetch(
    `${STRIPE_CHECKOUT_SESSIONS_URL}/${encodeURIComponent(sessionId)}`,
    {
      headers: {
        authorization: `Bearer ${apiKey}`,
        'Stripe-Version': STRIPE_PAYMENT_REQUEST_API_VERSION,
      },
    },
  )
  const jsonBody = await response.json().catch(() => null)
  if (!response.ok) {
    const stripeError = asRecord(asRecord(jsonBody)?.error)
    const message = stripeError
      ? readRecordString(stripeError, 'message')
      : ''
    return {
      ok: false,
      status: response.status >= 500 ? 502 : response.status,
      error:
        message
        || `Stripe Checkout Session retrieve failed with HTTP ${response.status}.`,
    }
  }
  const raw = asRecord(jsonBody)
  if (!raw) {
    return {
      ok: false,
      status: 502,
      error: 'Stripe response missing Checkout Session status.',
    }
  }
  const nowIso = new Date().toISOString()
  const paymentStatus = readRecordString(raw, 'payment_status').toLowerCase()
  const completedAt =
    paymentStatus === 'paid' || paymentStatus === 'no_payment_required'
      ? nowIso
      : null
  const mapped = mapStripeSession(raw, nowIso, completedAt)
  if (!mapped) {
    return {
      ok: false,
      status: 502,
      error: 'Stripe response missing Checkout Session id.',
    }
  }
  return { ok: true, raw, session: mapped }
}

const expireStripeCheckoutSessionForWorker = async (
  apiKey: string,
  sessionId: string,
): Promise<
  | { ok: true; raw: Record<string, unknown> | null }
  | { ok: false; error: string }
> => {
  const normalizedSessionId = readRecordString({ sessionId }, 'sessionId')
  if (!normalizedSessionId) {
    return { ok: false, error: 'Stripe Checkout Session id missing.' }
  }
  const response = await fetch(
    `${STRIPE_CHECKOUT_SESSIONS_URL}/${encodeURIComponent(normalizedSessionId)}/expire`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'Stripe-Version': STRIPE_PAYMENT_REQUEST_API_VERSION,
      },
    },
  )
  const jsonBody = await response.json().catch(() => null)
  if (response.ok) return { ok: true, raw: asRecord(jsonBody) }
  const stripeError = asRecord(asRecord(jsonBody)?.error)
  const message = stripeError ? readRecordString(stripeError, 'message') : ''
  return {
    ok: false,
    error:
      message
      || `Stripe Checkout Session expire failed with HTTP ${response.status}.`,
  }
}

export const expireStripeHostedCheckoutSessionForWorker = async (args: {
  env: StripePaymentEnv
  db?: D1DatabaseLike | null
  sessionId: string
}): Promise<
  | { ok: true; session?: StripeSessionWrite }
  | { ok: false; error: string }
> => {
  const apiKey = readStripePaymentServerKey(args.env)
  if (!apiKey) {
    return { ok: false, error: STRIPE_PAYMENT_MISSING_SERVER_KEY_ERROR }
  }
  const expired = await expireStripeCheckoutSessionForWorker(
    apiKey,
    args.sessionId,
  )
  if (expired.ok !== true) return expired
  if (args.db && expired.raw) {
    const nowIso = new Date().toISOString()
    const mapped = mapStripeSession(expired.raw, nowIso, null)
    if (mapped) {
      await writeStripeCheckoutSession(args.db, mapped)
      return { ok: true, session: mapped }
    }
  }
  return { ok: true }
}

const validateStripeCheckoutCreatedTotal = (
  payload: StripeCheckoutSessionCreatePayload,
  session: StripeSessionWrite,
): string | null => {
  const expected = readStripeCheckoutExpectedSessionTotal(payload)
  if (!expected) return null
  const actualAmount =
    session.amountTotal == null ? null : Math.floor(session.amountTotal)
  const actualCurrency = String(session.currency || '').trim().toLowerCase()
  if (
    actualAmount === expected.amountTotal
    && actualCurrency === expected.currency
  ) return null
  return 'Stripe Checkout Session amount/currency does not match the ACP checkout session.'
}

export const createStripeHostedCheckoutSessionForWorker = async (args: {
  request: Request
  env: StripePaymentEnv
  db: D1DatabaseLike
  payload: StripeCheckoutSessionCreatePayload
}): Promise<
  | StripeHostedCheckoutSessionCreateSuccess
  | StripeHostedCheckoutSessionCreateFailure
> => {
  const apiKey = readStripePaymentServerKey(args.env)
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      error: STRIPE_PAYMENT_MISSING_SERVER_KEY_ERROR,
    }
  }
  const config = resolveStripeCheckoutServerConfig(args.env)
  if (config.ok !== true) {
    return { ok: false, status: 500, error: config.error }
  }
  const payloadError = validateStripeCheckoutSessionCreatePayload(args.payload)
  if (payloadError) return { ok: false, status: 400, error: payloadError }
  const expectedTotalError = validateStripeCheckoutExpectedTotalForConfig(
    args.payload,
    config,
  )
  if (expectedTotalError) {
    return { ok: false, status: 422, error: expectedTotalError }
  }
  const serverOrigin = readStripeCheckoutRequestUrlOrigin(args.request.url)
  const configuredOrigin = readStripeCheckoutReturnOrigin(args.env)
  if (
    !isStripeCheckoutReturnUrlAllowed(
      args.payload.successUrl,
      serverOrigin,
      configuredOrigin,
    )
    || !isStripeCheckoutReturnUrlAllowed(
      args.payload.cancelUrl,
      serverOrigin,
      configuredOrigin,
    )
  ) {
    return {
      ok: false,
      status: 400,
      error:
        'Checkout return URLs must stay on the configured server return origin.',
    }
  }

  const body = buildStripeCheckoutSessionCreateForm(args.payload, config)
  const stripeIdempotencyKey =
    readStripeCheckoutStripeIdempotencyKey(args.payload)
  const headers: HeadersRecord = {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/x-www-form-urlencoded',
    'Stripe-Version': STRIPE_PAYMENT_REQUEST_API_VERSION,
  }
  if (stripeIdempotencyKey) {
    headers['Idempotency-Key'] = stripeIdempotencyKey
  }
  const response = await fetch(STRIPE_CHECKOUT_SESSIONS_URL, {
    method: 'POST',
    headers,
    body,
  })
  const jsonBody = await response.json().catch(() => null) as
    | Record<string, unknown>
    | null
  if (!response.ok) {
    const stripeError = asRecord(jsonBody?.error)
    const message = stripeError
      ? readRecordString(stripeError, 'message')
      : ''
    return {
      ok: false,
      status: response.status >= 500 ? 502 : 400,
      error:
        message
        || `Stripe Checkout Session create failed with HTTP ${response.status}.`,
    }
  }
  const nowIso = new Date().toISOString()
  const session = mapStripeSession(jsonBody, nowIso, null)
  if (!session || !session.url) {
    return {
      ok: false,
      status: 502,
      error: 'Stripe response missing Checkout Session id or url.',
    }
  }
  const totalError = validateStripeCheckoutCreatedTotal(args.payload, session)
  if (totalError) {
    const expired = await expireStripeCheckoutSessionForWorker(
      apiKey,
      session.id,
    )
    const expireDetails =
      expired.ok === true
        ? 'The mismatched Stripe Session was expired.'
        : expired.error
    return {
      ok: false,
      status: 409,
      error: `${totalError} ${expireDetails}`,
    }
  }
  try {
    await writeStripeCheckoutSession(args.db, session)
  } catch {
    const expired = await expireStripeCheckoutSessionForWorker(
      apiKey,
      session.id,
    )
    const expireDetails =
      expired.ok === true
        ? 'The hosted Stripe Session was expired.'
        : `Stripe Checkout Session expiry failed: ${expired.error}`
    return {
      ok: false,
      status: 500,
      error:
        `Failed to persist Stripe Checkout Session after Stripe creation. ${expireDetails}`,
    }
  }
  return {
    ok: true,
    session,
    body: {
      id: session.id,
      url: session.url,
      status: session.status,
      paymentStatus: session.paymentStatus,
    },
  }
}
