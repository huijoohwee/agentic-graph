import type { StrytreePaymentPackage, HeadersRecord, StrytreeWorkerEnv, KVNamespaceLike } from './strytreeTypes'
import { normalizeString, normalizeNumber } from '../shared/d1'

export const STRYTREE_API_VERSION = '2026-05-31.strytree.v1'
export const CANDIDATE_CREDIT_COST = 5
export const GENERATION_CREDIT_COST = 5
export const MAX_CANDIDATES = 3
export const EXTERNAL_VIDEO_PROVIDER_DEFAULT_BASE_URL = 'https://api.external-video-provider.invalid'
export const EXTERNAL_VIDEO_PROVIDER_GENERATING_STATUS = 5
export const EXTERNAL_VIDEO_PROVIDER_SUCCESS_STATUS = 1
export const EXTERNAL_VIDEO_PROVIDER_FAILED_STATUSES = new Set([7, 8])
const STRYTREE_WEBHOOK_TOLERANCE_SECONDS = 5 * 60
export const STRYTREE_PAYMENT_PACKAGES: Record<string, StrytreePaymentPackage> = {
  credits_20: { id: 'credits_20', creditAmount: 20, amountTotal: 500, currency: 'usd' },
  credits_50: { id: 'credits_50', creditAmount: 50, amountTotal: 1000, currency: 'usd' },
  credits_100: { id: 'credits_100', creditAmount: 100, amountTotal: 1800, currency: 'usd' },
}

const textEncoder = new TextEncoder()

export class StrytreeProviderError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'StrytreeProviderError'
    this.code = code
  }
}

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

export const json = (
  status: number,
  body: unknown,
  corsHeaders: HeadersRecord,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders,
    },
  })

export const errorJson = (
  status: number,
  code: string,
  corsHeaders: HeadersRecord,
  extra: Record<string, unknown> = {},
): Response =>
  json(status, { ok: false, apiVersion: STRYTREE_API_VERSION, error: code, code, ...extra }, corsHeaders)

export const readRequestJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export const stableJson = (value: unknown): string => {
  try {
    return JSON.stringify(value && typeof value === 'object' ? value : {})
  } catch {
    return '{}'
  }
}

export const canonicalRequest = (value: unknown): string => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)

export const parseJsonRecord = (value: string | null | undefined): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(String(value || '{}'))
    return asRecord(parsed) || {}
  } catch {
    return {}
  }
}

const sanitizeIdPart = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80)

const hashParts = (parts: unknown[]): string => {
  const text = parts.map(part => String(part ?? '')).join('|')
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export const buildId = (prefix: string, parts: unknown[]): string =>
  `${prefix}_${sanitizeIdPart(parts.map(part => String(part ?? '')).join('_')) || hashParts(parts)}_${hashParts(parts)}`

export const readPathId = (value: string): string => decodeURIComponent(value).trim()

export const readEnvString = (env: StrytreeWorkerEnv, ...keys: string[]): string => {
  for (const key of keys) {
    const value = normalizeString(env[key])
    if (value) return value
  }
  return ''
}

export const readEnvNumber = (env: StrytreeWorkerEnv, key: string, fallback: number): number => {
  const value = Number(env[key])
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

export const localCheckoutEnabled = (env: StrytreeWorkerEnv): boolean =>
  readEnvString(env, 'STRYTREE_CHECKOUT_MODE').toLowerCase() === 'local-development'

export const makeTraceId = (): string => {
  const maybeCrypto = globalThis.crypto as Crypto | undefined
  return typeof maybeCrypto?.randomUUID === 'function'
    ? maybeCrypto.randomUUID()
    : buildId('trace', [Date.now(), Math.random()])
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
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return mismatch === 0
}

export const verifyTimestampedSignature = async (
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
  if (ageSeconds > STRYTREE_WEBHOOK_TOLERANCE_SECONDS) return false
  const expected = await hmacSha256Hex(secret, `${Math.floor(timestamp)}.${payload}`)
  return signatures.some(signature => timingSafeHexEqual(signature, expected))
}

const readProviderSpendCents = (value: string | null): number => {
  const record = parseJsonRecord(value)
  if (Object.keys(record).length > 0) {
    return normalizeNumber(record.spent_cents || record.spend_cents || record.amount_cents)
  }
  return normalizeNumber(value)
}

export const assertProviderBudgetAllowsGeneration = async (
  env: StrytreeWorkerEnv,
  corsHeaders: HeadersRecord,
): Promise<Response | null> => {
  const limitCents = readEnvNumber(env, 'STRYTREE_DAILY_PROVIDER_BUDGET_CENTS', 0)
  if (limitCents <= 0) return null
  const kv = env.STRYTREE_PROVIDER_BUDGET_KV as KVNamespaceLike | undefined
  if (typeof kv?.get !== 'function') return errorJson(503, 'provider_budget_unavailable', corsHeaders)
  const today = new Date().toISOString().slice(0, 10)
  const key = readEnvString(env, 'STRYTREE_PROVIDER_SPEND_KV_KEY') || `strytree:provider-spend:${today}`
  const spentCents = readProviderSpendCents(await kv.get(key))
  if (spentCents >= limitCents) {
    return errorJson(429, 'provider_budget_exceeded', corsHeaders, {
      provider_budget_limit_cents: limitCents,
      provider_spend_cents: spentCents,
      provider_budget_key: key,
    })
  }
  return null
}

export const readIdempotencyKey = (request: Request, payload: Record<string, unknown> | null): string =>
  normalizeString(payload?.idempotency_key || request.headers.get('idempotency-key') || request.headers.get('Idempotency-Key'))
