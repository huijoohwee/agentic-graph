import {
  isAllowedStraitsxCallbackSource,
  STRAITSX_ENV_KEYS,
  STRAITSX_HEADER_NAMES,
  verifyStraitsxCallbackSignature,
} from '../../../grph-shared/src/payments/straitsxPaymentSsot'
import {
  STRIPE_PAYMENT_ENV_KEYS,
  STRIPE_PAYMENT_WEBHOOK_API_VERSION,
} from '../../../grph-shared/src/payments/stripePaymentSsot'
import type { PaymentRuntimeService } from './paymentRuntimeService'
import type { PaymentRuntimeStore } from './paymentRuntimePersistence'

type PaymentEventProvider = 'stripe' | 'straitsx'

type AuthenticatedProviderEvent = Readonly<{
  provider: PaymentEventProvider
  eventId: string
  eventType: string
  providerObjectId: string
  rawBodyHash: string
}>

const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300
const textEncoder = new TextEncoder()

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null

const readString = (record: Record<string, unknown> | null, key: string): string =>
  typeof record?.[key] === 'string' ? String(record[key]).trim() : ''

const bytesToHex = (value: ArrayBuffer): string =>
  [...new Uint8Array(value)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')

const sha256Hex = async (value: string): Promise<string> =>
  bytesToHex(await crypto.subtle.digest('SHA-256', textEncoder.encode(value)))

const hmacSha256Hex = async (secret: string, value: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return bytesToHex(await crypto.subtle.sign('HMAC', key, textEncoder.encode(value)))
}

const timingSafeEqual = (left: string, right: string): boolean => {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

const verifyStripeWebhookSignature = async (args: {
  rawBody: string
  signatureHeader: string
  secret: string
  nowMs: number
}): Promise<boolean> => {
  const parts = args.signatureHeader.split(',').map(value => value.trim())
  const timestamp = Number(parts.find(value => value.startsWith('t='))?.slice(2))
  const signatures = parts
    .filter(value => value.startsWith('v1='))
    .map(value => value.slice(3).toLowerCase())
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false
  const ageSeconds = Math.abs(Math.floor(args.nowMs / 1000) - Math.floor(timestamp))
  if (ageSeconds > STRIPE_WEBHOOK_TOLERANCE_SECONDS) return false
  const expected = await hmacSha256Hex(
    args.secret,
    `${Math.floor(timestamp)}.${args.rawBody}`,
  )
  return signatures.some(signature => timingSafeEqual(signature, expected))
}

const authenticateStripeEvent = async (args: {
  request: Request
  env: Readonly<Record<string, unknown>>
  rawBody: string
  nowMs: number
}): Promise<AuthenticatedProviderEvent | null> => {
  const secret = String(
    args.env[STRIPE_PAYMENT_ENV_KEYS.runtimeWebhookSecret] || '',
  ).trim()
  if (!secret.startsWith('whsec_')) return null
  const signatureHeader = args.request.headers.get('stripe-signature') || ''
  if (!await verifyStripeWebhookSignature({
    rawBody: args.rawBody,
    signatureHeader,
    secret,
    nowMs: args.nowMs,
  })) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(args.rawBody)
  } catch {
    return null
  }
  const event = asRecord(parsed)
  const providerObject = asRecord(asRecord(event?.data)?.object)
  const eventId = readString(event, 'id')
  const eventType = readString(event, 'type')
  const providerObjectId = readString(providerObject, 'id')
  if (
    !eventId
    || !eventType
    || !providerObjectId
    || readString(event, 'api_version') !== STRIPE_PAYMENT_WEBHOOK_API_VERSION
  ) return null
  return Object.freeze({
    provider: 'stripe',
    eventId,
    eventType,
    providerObjectId,
    rawBodyHash: await sha256Hex(args.rawBody),
  })
}

const authenticateStraitsxEvent = async (args: {
  request: Request
  env: Readonly<Record<string, unknown>>
  rawBody: string
}): Promise<AuthenticatedProviderEvent | null> => {
  const sourceAddress = args.request.headers.get('cf-connecting-ip') || ''
  if (!isAllowedStraitsxCallbackSource(sourceAddress)) return null
  const secret = String(
    args.env[STRAITSX_ENV_KEYS.sandboxCallbackSecret] || '',
  ).trim()
  const signature = args.request.headers.get(
    STRAITSX_HEADER_NAMES.callbackSignature,
  ) || ''
  if (!secret || !await verifyStraitsxCallbackSignature({
    rawBody: args.rawBody,
    signature,
    secret,
  })) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(args.rawBody)
  } catch {
    return null
  }
  const event = asRecord(parsed)
  const paymentMethod = asRecord(event?.payment_method)
  const contractId = readString(event, 'id')
  const status = readString(event, 'status')
  const contractType = readString(event, 'type') || 'payment'
  const providerObjectId = readString(paymentMethod, 'id')
  if (!contractId || !status || !providerObjectId) return null
  const rawBodyHash = await sha256Hex(args.rawBody)
  const deliveryHash = await sha256Hex(`${contractId}:${rawBodyHash}`)
  return Object.freeze({
    provider: 'straitsx',
    eventId: `sxevt_${deliveryHash}`,
    eventType: `${contractType}:${status}`,
    providerObjectId,
    rawBodyHash,
  })
}

const json = (status: number, body: unknown, corsHeaders: Record<string, string>): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders,
    },
  })

export const handlePaymentProviderEvent = async (args: {
  request: Request
  provider: PaymentEventProvider
  env: Readonly<Record<string, unknown>>
  store: PaymentRuntimeStore
  service: PaymentRuntimeService
  corsHeaders: Record<string, string>
  now?: () => Date
}): Promise<Response> => {
  const rawBody = await args.request.text()
  const now = args.now?.() || new Date()
  const event = args.provider === 'stripe'
    ? await authenticateStripeEvent({
        request: args.request,
        env: args.env,
        rawBody,
        nowMs: now.getTime(),
      })
    : await authenticateStraitsxEvent({
        request: args.request,
        env: args.env,
        rawBody,
      })
  if (!event) {
    return json(400, {
      ok: false,
      code: args.provider === 'stripe'
        ? 'signature_verification_failed'
        : 'callback_authentication_failed',
    }, args.corsHeaders)
  }
  const claim = await args.store.claimProviderEvent({
    provider: event.provider,
    eventId: event.eventId,
    semanticKey: `${event.eventType}:${event.providerObjectId}`,
    rawBodyHash: event.rawBodyHash,
    receivedAt: now.toISOString(),
  })
  if (claim.ok === false) {
    return json(409, { ok: false, code: claim.code }, args.corsHeaders)
  }
  if (!claim.shouldProcess) {
    return json(200, {
      ok: true,
      received: true,
      duplicate: true,
    }, args.corsHeaders)
  }
  try {
    const result = await args.service.settleFromProviderRead({
      rail: event.provider,
      providerObjectId: event.providerObjectId,
    })
    if (result.ok === false) {
      throw new Error(`Authoritative provider state is unresolved: ${result.code}.`)
    }
    const completed = await args.store.completeProviderEvent({
      provider: event.provider,
      eventId: claim.claimEventId,
      claimToken: claim.claimToken,
      processedAt: (args.now?.() || new Date()).toISOString(),
    })
    if (!completed) {
      throw new Error('Provider event claim lease was lost before completion.')
    }
    return json(200, {
      ok: true,
      received: true,
      duplicate: false,
    }, args.corsHeaders)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider event processing failed.'
    await args.store.failProviderEvent({
      provider: event.provider,
      eventId: claim.claimEventId,
      claimToken: claim.claimToken,
      error: message,
    })
    return json(503, {
      ok: false,
      code: 'provider_outcome_unknown',
    }, args.corsHeaders)
  }
}
