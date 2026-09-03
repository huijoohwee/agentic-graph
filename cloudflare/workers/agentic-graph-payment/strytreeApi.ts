import {
  execute,
  normalizeNumber,
  normalizeString,
  queryAll,
  queryFirst,
  type D1DatabaseLike,
} from '../shared/d1'
import { inspectStrytreeReadiness } from './strytreeReadiness'

type HeadersRecord = Record<string, string>

export type StrytreeWorkerEnv = Record<string, unknown> & {
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

type QueueLike = {
  send?: (body: unknown) => Promise<void>
}

type R2BucketLike = {
  put?: (key: string, value: string | ArrayBuffer | ReadableStream | Blob, options?: unknown) => Promise<unknown>
}

type KVNamespaceLike = {
  get?: (key: string) => Promise<string | null>
}

type DurableObjectStubLike = {
  fetch?: (request: Request | string) => Promise<Response>
}

type DurableObjectNamespaceLike = {
  idFromName?: (name: string) => unknown
  get?: (id: unknown) => DurableObjectStubLike
  getByName?: (name: string) => DurableObjectStubLike
}

type StrytreeLedgerMutationResult = {
  ledgerEventId: string
  balanceAfterCredits: number
  idempotentReplay: boolean
  authority: 'durable-object' | 'direct-d1'
}

type FetchLike = (input: string | Request, init?: RequestInit) => Promise<Response>

type ExternalVideoProviderRequest = {
  endpoint: string
  body: Record<string, unknown>
}

type ExternalVideoProviderResult = {
  videoId: string
  status: number
  videoUrl: string | null
  responseJson: Record<string, unknown>
  submittedAtMs: number
  completedAtMs: number
}

type StrytreeUserContext = {
  userId: string
  displayName: string
  role: string
}

type StrytreeStoryRow = {
  id: string
  slug: string
  title: string
  tagline: string | null
  status: string
  poster_object_key: string | null
  root_node_id: string | null
  snapshot_version: number
}

type StrytreeNodeRow = {
  id: string
  story_id: string
  parent_node_id: string | null
  selected_candidate_id: string | null
  creator_user_id: string
  title: string
  synopsis: string
  prompt: string | null
  status: string
  visibility: string
  is_free_window: number
  unlock_price_credits: number
  video_object_key: string | null
  thumbnail_object_key: string | null
  age_days: number
  likes_count: number
  impressions_count: number
  paid_unlocks_count: number
  moderation_status: string
  created_at: string
  updated_at: string
}

type StrytreeAssetRow = {
  id: string
  story_id: string
  owner_node_id: string | null
  asset_type: string
  name: string
  ref_name: string | null
  external_provider_image_id: string | null
  object_key: string | null
  prompt_prefix: string | null
  negative_prompt: string | null
  created_at: string
}

type StrytreeCandidateRunRow = {
  id: string
  user_id: string
  story_id: string
  parent_node_id: string
  status: string
  max_candidates: number
  quoted_cost_credits: number
  idempotency_key: string
  request_json: string
  scorecard_json: string | null
  created_at: string
  updated_at: string
}

type StrytreeBranchCandidateRow = {
  id: string
  candidate_run_id: string
  generation_job_id: string | null
  user_id: string
  story_id: string
  parent_node_id: string
  provider: string
  status: string
  title: string | null
  synopsis: string | null
  prompt: string | null
  video_object_key: string | null
  thumbnail_object_key: string | null
  credit_cost: number
  elapsed_ms: number
  inherited_asset_count: number
  continuity_score: number
  moderation_status: string
  publish_eligible: number
  result_json: string | null
  token_cost_json: string | null
  created_at: string
  updated_at: string
}

type StrytreeGenerationJobRow = {
  id: string
  user_id: string
  story_id: string
  parent_node_id: string
  status: string
  debit_ledger_event_id: string | null
  refund_ledger_event_id: string | null
  provider: string
  provider_job_id: string | null
  request_json: string
  result_json: string | null
  fallback_artifact_json: string | null
  error_code: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

type StrytreeGenerationQueueMessage = {
  type?: string
  job_id?: string
  simulate_provider_failure?: boolean
}

type StrytreePaymentPackage = {
  id: string
  creditAmount: number
  amountTotal: number
  currency: string
}

type StrytreePaymentSessionRow = {
  id: string
  user_id: string
  package_id: string
  status: string
  provider: string
  provider_session_id: string | null
  amount_total: number
  currency: string
  credit_amount: number
  idempotency_key: string
  request_json: string
  response_json: string
  created_at: string
  updated_at: string
  completed_at: string | null
}

type StrytreePendingPaymentSessionRow = {
  id: string
  package_id: string
  status: string
  provider_session_id: string | null
  amount_total: number
  currency: string
  credit_amount: number
  created_at: string
  updated_at: string
}

const STRYTREE_API_VERSION = '2026-05-31.strytree.v1'
const CANDIDATE_CREDIT_COST = 5
const GENERATION_CREDIT_COST = 5
const MAX_CANDIDATES = 3
const EXTERNAL_VIDEO_PROVIDER_DEFAULT_BASE_URL = 'https://api.external-video-provider.invalid'
const EXTERNAL_VIDEO_PROVIDER_GENERATING_STATUS = 5
const EXTERNAL_VIDEO_PROVIDER_SUCCESS_STATUS = 1
const EXTERNAL_VIDEO_PROVIDER_FAILED_STATUSES = new Set([7, 8])
const STRYTREE_WEBHOOK_TOLERANCE_SECONDS = 5 * 60
const STRYTREE_PAYMENT_PACKAGES: Record<string, StrytreePaymentPackage> = {
  credits_20: { id: 'credits_20', creditAmount: 20, amountTotal: 500, currency: 'usd' },
  credits_50: { id: 'credits_50', creditAmount: 50, amountTotal: 1000, currency: 'usd' },
  credits_100: { id: 'credits_100', creditAmount: 100, amountTotal: 1800, currency: 'usd' },
}

const textEncoder = new TextEncoder()

class StrytreeProviderError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'StrytreeProviderError'
    this.code = code
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

const json = (
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

const errorJson = (
  status: number,
  code: string,
  corsHeaders: HeadersRecord,
  extra: Record<string, unknown> = {},
): Response =>
  json(status, { ok: false, apiVersion: STRYTREE_API_VERSION, error: code, code, ...extra }, corsHeaders)

const readRequestJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json()
  } catch {
    return null
  }
}

const stableJson = (value: unknown): string => {
  try {
    return JSON.stringify(value && typeof value === 'object' ? value : {})
  } catch {
    return '{}'
  }
}

const parseJsonRecord = (value: string | null | undefined): Record<string, unknown> => {
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

const buildId = (prefix: string, parts: unknown[]): string =>
  `${prefix}_${sanitizeIdPart(parts.map(part => String(part ?? '')).join('_')) || hashParts(parts)}_${hashParts(parts)}`

const readPathId = (value: string): string => decodeURIComponent(value).trim()

const readEnvString = (env: StrytreeWorkerEnv, ...keys: string[]): string => {
  for (const key of keys) {
    const value = normalizeString(env[key])
    if (value) return value
  }
  return ''
}

const readEnvNumber = (env: StrytreeWorkerEnv, key: string, fallback: number): number => {
  const value = Number(env[key])
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

const localCheckoutEnabled = (env: StrytreeWorkerEnv): boolean =>
  readEnvString(env, 'STRYTREE_CHECKOUT_MODE').toLowerCase() === 'local-development'

const makeTraceId = (): string => {
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

const verifyTimestampedSignature = async (
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

const readNumberField = (value: unknown): number | null => {
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const readExternalVideoProviderFetch = (env: StrytreeWorkerEnv): FetchLike => {
  const fetchOverride = env.STRYTREE_EXTERNAL_VIDEO_PROVIDER_FETCH
  return typeof fetchOverride === 'function' ? fetchOverride as FetchLike : fetch
}

const readProviderSpendCents = (value: string | null): number => {
  const record = parseJsonRecord(value)
  if (Object.keys(record).length > 0) {
    return normalizeNumber(record.spent_cents || record.spend_cents || record.amount_cents)
  }
  return normalizeNumber(value)
}

const assertProviderBudgetAllowsGeneration = async (
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

const buildExternalVideoProviderImageReferences = (value: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    const record = asRecord(item)
    if (!record) return []
    const imgId = readNumberField(record.img_id)
    const refName = normalizeString(record.ref_name)
    if (imgId == null || !refName) return []
    return [{
      type: normalizeString(record.type) || 'subject',
      img_id: imgId,
      ref_name: refName,
    }]
  })
}

const buildExternalVideoProviderGenerationRequest = (
  requestPayload: Record<string, unknown>,
): ExternalVideoProviderRequest | null => {
  const options = asRecord(requestPayload.options) || {}
  const prompt = normalizeString(requestPayload.prompt)
  if (!prompt) return null
  const model = normalizeString(requestPayload.model || options.model) || 'v4.5'
  const duration = readNumberField(requestPayload.duration || options.duration || options.duration_seconds) || 5
  const quality = normalizeString(requestPayload.quality || options.quality) || '540p'
  const seed = readNumberField(requestPayload.seed || options.seed) || 123456789
  const imageReferences = buildExternalVideoProviderImageReferences(requestPayload.image_references || options.image_references)
  if (imageReferences.length > 0) {
    return {
      endpoint: '/openapi/v2/video/fusion/generate',
      body: {
        image_references: imageReferences,
        prompt,
        model,
        duration,
        quality,
        aspect_ratio: normalizeString(requestPayload.aspect_ratio || options.aspect_ratio) || '16:9',
        seed,
      },
    }
  }
  const imgId = readNumberField(requestPayload.img_id || options.img_id)
  if (imgId == null) return null
  return {
    endpoint: '/openapi/v2/video/img/generate',
    body: {
      img_id: imgId,
      prompt,
      model,
      duration,
      quality,
      motion_mode: normalizeString(requestPayload.motion_mode || options.motion_mode) || 'normal',
      negative_prompt: normalizeString(requestPayload.negative_prompt || options.negative_prompt) || undefined,
      seed,
      water_mark: false,
    },
  }
}

const readIdempotencyKey = (request: Request, payload: Record<string, unknown> | null): string =>
  normalizeString(payload?.idempotency_key || request.headers.get('idempotency-key') || request.headers.get('Idempotency-Key'))

const readBearerToken = (request: Request): string => {
  const authorization = request.headers.get('authorization') || ''
  const bearer = /^bearer\s+(.+)$/i.exec(authorization)?.[1] || ''
  return normalizeString(bearer || request.headers.get('x-strytree-session') || '')
}

const readUserContext = async (
  request: Request,
  db: D1DatabaseLike,
): Promise<StrytreeUserContext | null> => {
  const sessionId = readBearerToken(request)
  if (!sessionId) return null
  const nowIso = new Date().toISOString()
  const session = await queryFirst<{ user_id: string | null }>(
    db,
    'SELECT user_id FROM strytree_sessions WHERE id = ? AND expires_at > ? LIMIT 1',
    [sessionId, nowIso],
  )
  const userId = normalizeString(session?.user_id)
  if (!userId) return null
  const user = await queryFirst<{ id: string; display_name: string; role: string }>(
    db,
    'SELECT id, display_name, role FROM strytree_users WHERE id = ? LIMIT 1',
    [userId],
  )
  if (!user?.id) return null
  return {
    userId: String(user.id),
    displayName: normalizeString(user.display_name) || 'Strytree user',
    role: normalizeString(user.role) || 'user',
  }
}

const requireUserContext = async (
  request: Request,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<StrytreeUserContext | Response> => {
  const user = await readUserContext(request, db)
  return user || errorJson(401, 'unauthorized', corsHeaders)
}

const readStory = async (db: D1DatabaseLike, storyId: string): Promise<StrytreeStoryRow | null> =>
  queryFirst<StrytreeStoryRow>(
    db,
    `SELECT id, slug, title, tagline, status, poster_object_key, root_node_id,
       snapshot_version
     FROM strytree_stories
     WHERE id = ? OR slug = ?
     LIMIT 1`,
    [storyId, storyId],
  )

const readNode = async (db: D1DatabaseLike, nodeId: string): Promise<StrytreeNodeRow | null> =>
  queryFirst<StrytreeNodeRow>(
    db,
    `SELECT id, story_id, parent_node_id, selected_candidate_id, creator_user_id,
       title, synopsis, prompt, status, visibility, is_free_window,
       unlock_price_credits, video_object_key, thumbnail_object_key, age_days,
       likes_count, impressions_count, paid_unlocks_count, moderation_status,
       created_at, updated_at
     FROM strytree_nodes
     WHERE id = ?
     LIMIT 1`,
    [nodeId],
  )

const readStoryNodes = async (db: D1DatabaseLike, storyId: string): Promise<StrytreeNodeRow[]> =>
  queryAll<StrytreeNodeRow>(
    db,
    `SELECT id, story_id, parent_node_id, selected_candidate_id, creator_user_id,
       title, synopsis, prompt, status, visibility, is_free_window,
       unlock_price_credits, video_object_key, thumbnail_object_key, age_days,
       likes_count, impressions_count, paid_unlocks_count, moderation_status,
       created_at, updated_at
     FROM strytree_nodes
     WHERE story_id = ?
     ORDER BY created_at, id`,
    [storyId],
  )

const readStoryAssets = async (db: D1DatabaseLike, storyId: string): Promise<StrytreeAssetRow[]> =>
  queryAll<StrytreeAssetRow>(
    db,
    `SELECT id, story_id, owner_node_id, asset_type, name, ref_name, external_provider_image_id,
       object_key, prompt_prefix, negative_prompt, created_at
     FROM strytree_assets
     WHERE story_id = ?
     ORDER BY created_at, id`,
    [storyId],
  )

const readUnlockedNodeIds = async (db: D1DatabaseLike, userId: string | null): Promise<Set<string>> => {
  if (!userId) return new Set()
  const rows = await queryAll<{ node_id: string }>(
    db,
    'SELECT node_id FROM strytree_unlocks WHERE user_id = ?',
    [userId],
  )
  return new Set(rows.map(row => String(row.node_id || '')).filter(Boolean))
}

const readExistingUnlock = async (
  db: D1DatabaseLike,
  userId: string,
  nodeId: string,
): Promise<{ ledger_event_id: string } | null> =>
  queryFirst<{ ledger_event_id: string }>(
    db,
    'SELECT ledger_event_id FROM strytree_unlocks WHERE user_id = ? AND node_id = ? LIMIT 1',
    [userId, nodeId],
  )

const readBalance = async (db: D1DatabaseLike, userId: string): Promise<number> => {
  const row = await queryFirst<{ balance_after_credits: number }>(
    db,
    `SELECT balance_after_credits
     FROM strytree_token_ledger
     WHERE user_id = ?
     ORDER BY authority_version DESC, created_at DESC, id DESC
     LIMIT 1`,
    [userId],
  )
  return normalizeNumber(row?.balance_after_credits)
}

const readPaymentSessionByIdempotency = async (
  db: D1DatabaseLike,
  userId: string,
  idempotencyKey: string,
): Promise<StrytreePaymentSessionRow | null> =>
  queryFirst<StrytreePaymentSessionRow>(
    db,
    'SELECT * FROM strytree_payment_sessions WHERE user_id = ? AND idempotency_key = ? LIMIT 1',
    [userId, idempotencyKey],
  )

const readPaymentSessionById = async (
  db: D1DatabaseLike,
  sessionId: string,
): Promise<StrytreePaymentSessionRow | null> =>
  queryFirst<StrytreePaymentSessionRow>(
    db,
    'SELECT * FROM strytree_payment_sessions WHERE id = ? LIMIT 1',
    [sessionId],
  )

const readPaymentSessionByProviderSessionId = async (
  db: D1DatabaseLike,
  providerSessionId: string,
): Promise<StrytreePaymentSessionRow | null> =>
  queryFirst<StrytreePaymentSessionRow>(
    db,
    'SELECT * FROM strytree_payment_sessions WHERE provider_session_id = ? LIMIT 1',
    [providerSessionId],
  )

const readPaymentSessionForUser = async (
  db: D1DatabaseLike,
  userId: string,
  sessionId: string,
): Promise<StrytreePaymentSessionRow | null> =>
  queryFirst<StrytreePaymentSessionRow>(
    db,
    'SELECT * FROM strytree_payment_sessions WHERE id = ? AND user_id = ? LIMIT 1',
    [sessionId, userId],
  )

const readPendingPaymentSessions = async (
  db: D1DatabaseLike,
  userId: string,
): Promise<StrytreePendingPaymentSessionRow[]> =>
  queryAll<StrytreePendingPaymentSessionRow>(
    db,
    `SELECT id, package_id, status, provider_session_id, amount_total,
       currency, credit_amount, created_at, updated_at
     FROM strytree_payment_sessions
     WHERE user_id = ? AND status = ?
     ORDER BY created_at DESC, id DESC`,
    [userId, 'open'],
  )

const readGenerationJob = async (
  db: D1DatabaseLike,
  jobId: string,
  userId: string,
): Promise<StrytreeGenerationJobRow | null> =>
  queryFirst<StrytreeGenerationJobRow>(
    db,
    'SELECT * FROM strytree_generation_jobs WHERE id = ? AND user_id = ? LIMIT 1',
    [jobId, userId],
  )

const readGenerationJobById = async (
  db: D1DatabaseLike,
  jobId: string,
): Promise<StrytreeGenerationJobRow | null> =>
  queryFirst<StrytreeGenerationJobRow>(
    db,
    'SELECT * FROM strytree_generation_jobs WHERE id = ? LIMIT 1',
    [jobId],
  )


const writeAuditEvent = async (
  db: D1DatabaseLike,
  args: {
    actorUserId: string | null
    action: string
    objectType: string
    objectId: string
    status: string
    idempotencyKey?: string
    metadata?: unknown
    nowIso: string
  },
): Promise<void> => {
  await execute(
    db,
    `INSERT INTO strytree_audit_events (
       id, actor_user_id, action, object_type, object_id, status,
       idempotency_key, metadata_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      buildId('audit', [args.action, args.objectId, args.idempotencyKey || args.nowIso]),
      args.actorUserId,
      args.action,
      args.objectType,
      args.objectId,
      args.status,
      args.idempotencyKey || null,
      stableJson(args.metadata || {}),
      args.nowIso,
    ],
  )
}

const writeLedgerEvent = async (
  db: D1DatabaseLike,
  env: StrytreeWorkerEnv,
  args: {
    id: string
    userId: string
    eventType: string
    amountCredits: number
    balanceAfterCredits: number
    relatedObjectType: string
    relatedObjectId: string
    providerEventId?: string | null
    idempotencyKey: string
    metadata?: unknown
    nowIso: string
  },
): Promise<StrytreeLedgerMutationResult> => {
  const ledgerNamespace = env.STRYTREE_CREDIT_LEDGER as DurableObjectNamespaceLike | undefined
  const stub = typeof ledgerNamespace?.getByName === 'function'
    ? ledgerNamespace.getByName(args.userId)
    : typeof ledgerNamespace?.idFromName === 'function' && typeof ledgerNamespace.get === 'function'
      ? ledgerNamespace.get(ledgerNamespace.idFromName(args.userId))
      : null
  if (typeof stub?.fetch === 'function') {
    const response = await stub.fetch(new Request('https://strytree-credit-ledger.internal/mutations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stableJson({
        id: args.id,
        user_id: args.userId,
        event_type: args.eventType,
        amount_credits: args.amountCredits,
        related_object_type: args.relatedObjectType,
        related_object_id: args.relatedObjectId,
        provider_event_id: args.providerEventId || null,
        idempotency_key: args.idempotencyKey,
        metadata_json: stableJson(args.metadata || {}),
        created_at: args.nowIso,
      }),
    }))
    const result = await response.json().catch(() => null) as Record<string, unknown> | null
    if (!response.ok || result?.ok !== true) {
      throw new Error(normalizeString(result?.error) || `Strytree credit ledger actor failed with HTTP ${response.status}`)
    }
    return {
      ledgerEventId: normalizeString(result.ledger_event_id) || args.id,
      balanceAfterCredits: normalizeNumber(result.balance_after_credits, args.balanceAfterCredits),
      idempotentReplay: result.idempotent_replay === true,
      authority: 'durable-object',
    }
  }
  void db
  throw new Error('missing authoritative Strytree credit ledger binding')
}

const handleCreateCheckoutSession = async (
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
  await writeAuditEvent(db, {
    actorUserId: args.userId,
    action: 'checkout_session_settle',
    objectType: 'strytree_payment_session',
    objectId: args.session.id,
    status: 'completed',
    idempotencyKey: args.idempotencyKey,
    metadata: { ledger_event_id: ledgerMutation.ledgerEventId, credit_amount: creditAmount },
    nowIso: args.nowIso,
  })
  return {
    ledgerEventId: ledgerMutation.ledgerEventId,
    balanceAfterCredits: ledgerMutation.balanceAfterCredits,
    idempotentReplay: ledgerMutation.idempotentReplay,
  }
}

const handleCompleteCheckoutSession = async (
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

const handleGetWallet = async (
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

const handleCheckoutWebhook = async (
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
  const eventId = normalizeString(event.id || event.event_id)
  if (!eventId) return errorJson(400, 'missing_provider_event_id', corsHeaders)
  const eventType = normalizeString(event.type || event.event_type)
  const dataObject = asRecord(asRecord(event.data)?.object) || asRecord(event.object) || event
  const metadata = asRecord(dataObject.metadata) || {}
  const paymentSessionId = normalizeString(
    dataObject.payment_session_id ||
    metadata.strytree_payment_session_id ||
    metadata.payment_session_id,
  )
  const providerSessionId = normalizeString(
    dataObject.provider_session_id ||
    dataObject.id ||
    event.provider_session_id,
  )
  const paymentStatus = normalizeString(dataObject.payment_status || dataObject.status)
  const success = (
    eventType === 'checkout.session.completed' ||
    eventType === 'checkout.session.async_payment_succeeded' ||
    paymentStatus === 'paid' ||
    paymentStatus === 'complete' ||
    paymentStatus === 'completed'
  )
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

const mapGenerationJobResponse = (job: StrytreeGenerationJobRow) => {
  const result = parseJsonRecord(job.result_json)
  const fallback = parseJsonRecord(job.fallback_artifact_json)
  return {
    job_id: job.id,
    status: job.status,
    story_id: job.story_id,
    parent_node_id: job.parent_node_id,
    provider: job.provider,
    provider_job_id: job.provider_job_id,
    debit_ledger_event_id: job.debit_ledger_event_id,
    refund_ledger_event_id: job.refund_ledger_event_id,
    quoted_cost_credits: GENERATION_CREDIT_COST,
    video_object_key: result.video_object_key || null,
    thumbnail_object_key: result.thumbnail_object_key || null,
    preview_url: result.preview_url || null,
    fallback_artifact: Object.keys(fallback).length > 0 ? fallback : null,
    error_code: job.error_code,
    error_message: job.error_message,
    updated_at: job.updated_at,
  }
}

const handleCreateGenerationJob = async (
  request: Request,
  env: StrytreeWorkerEnv,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  const user = await requireUserContext(request, db, corsHeaders)
  if (user instanceof Response) return user
  const payload = asRecord(await readRequestJson(request))
  if (!payload) return errorJson(400, 'invalid_json_body', corsHeaders)
  const idempotencyKey = readIdempotencyKey(request, payload)
  if (!idempotencyKey) return errorJson(400, 'missing_idempotency_key', corsHeaders)
  const storyId = normalizeString(payload.story_id)
  const parentNodeId = normalizeString(payload.parent_node_id)
  const prompt = normalizeString(payload.prompt)
  if (!storyId || !parentNodeId || !prompt) return errorJson(400, 'missing_generation_fields', corsHeaders)
  const story = await readStory(db, storyId)
  const parentNode = await readNode(db, parentNodeId)
  if (!story || !parentNode || parentNode.story_id !== story.id) return errorJson(404, 'parent_node_not_found', corsHeaders)
  if (parentNode.status === 'dropped' || parentNode.moderation_status === 'rejected') {
    return errorJson(409, 'parent_node_not_extendable', corsHeaders)
  }
  const budgetError = await assertProviderBudgetAllowsGeneration(env, corsHeaders)
  if (budgetError) return budgetError
  const jobId = buildId('gen', [user.userId, parentNode.id, idempotencyKey])
  const existing = await readGenerationJob(db, jobId, user.userId)
  if (existing) {
    return json(200, {
      ok: true,
      apiVersion: STRYTREE_API_VERSION,
      ...mapGenerationJobResponse(existing),
      idempotent_replay: true,
    }, corsHeaders)
  }
  const balance = await readBalance(db, user.userId)
  if (balance < GENERATION_CREDIT_COST) {
    return errorJson(402, 'insufficient_balance', corsHeaders, {
      balance_credits: balance,
      required_credits: GENERATION_CREDIT_COST,
    })
  }
  const nowIso = new Date().toISOString()
  const ledgerEventId = buildId('ledger_generation', [user.userId, jobId, idempotencyKey])
  const ledgerMutation = await writeLedgerEvent(db, env, {
    id: ledgerEventId,
    userId: user.userId,
    eventType: 'generation_debit',
    amountCredits: -GENERATION_CREDIT_COST,
    balanceAfterCredits: balance - GENERATION_CREDIT_COST,
    relatedObjectType: 'strytree_generation_job',
    relatedObjectId: jobId,
    idempotencyKey,
    metadata: {
      story_id: story.id,
      parent_node_id: parentNode.id,
      provider: 'external_video_provider',
    },
    nowIso,
  })
  const requestJson = stableJson({
    ...payload,
    idempotency_key: idempotencyKey,
    quoted_cost_credits: GENERATION_CREDIT_COST,
  })
  await execute(
    db,
    `INSERT INTO strytree_generation_jobs (
       id, user_id, story_id, parent_node_id, status, debit_ledger_event_id,
       refund_ledger_event_id, provider, provider_job_id, request_json,
       result_json, fallback_artifact_json, error_code, error_message,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      jobId,
      user.userId,
      story.id,
      parentNode.id,
      'queued',
      ledgerEventId,
      null,
      'external_video_provider',
      null,
      requestJson,
      null,
      null,
      null,
      null,
      nowIso,
      nowIso,
    ],
  )
  const queue = env.STRYTREE_GENERATION_QUEUE as QueueLike | undefined
  if (typeof queue?.send === 'function') {
    await queue.send({
      type: 'strytree.generation_job.created',
      job_id: jobId,
      simulate_provider_failure: payload.simulate_provider_failure === true,
    })
  }
  await writeAuditEvent(db, {
    actorUserId: user.userId,
    action: 'generation_job_create',
    objectType: 'strytree_generation_job',
    objectId: jobId,
    status: 'queued',
    idempotencyKey,
    metadata: { debit_ledger_event_id: ledgerEventId, quoted_cost_credits: GENERATION_CREDIT_COST },
    nowIso,
  })
  return json(202, {
    ok: true,
    apiVersion: STRYTREE_API_VERSION,
      job_id: jobId,
      status: 'queued',
      quoted_cost_credits: GENERATION_CREDIT_COST,
      ledger_event_id: ledgerMutation.ledgerEventId,
      ledger_authority: ledgerMutation.authority,
  }, corsHeaders)
}

const handleGetGenerationJob = async (
  request: Request,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
  jobId: string,
): Promise<Response> => {
  const user = await requireUserContext(request, db, corsHeaders)
  if (user instanceof Response) return user
  const job = await readGenerationJob(db, jobId, user.userId)
  if (!job) return errorJson(404, 'job_not_found', corsHeaders)
  return json(200, { ok: true, apiVersion: STRYTREE_API_VERSION, ...mapGenerationJobResponse(job) }, corsHeaders)
}

const readJsonResponse = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    return asRecord(await response.json()) || {}
  } catch {
    return {}
  }
}

const readExternalVideoProviderVideoId = (body: Record<string, unknown>): string => {
  const response = asRecord(body.Resp) || body
  return normalizeString(response.video_id || response.id)
}

const readExternalVideoProviderStatus = (body: Record<string, unknown>): number => {
  const response = asRecord(body.Resp) || body
  return normalizeNumber(response.status)
}

const readExternalVideoProviderVideoUrl = (body: Record<string, unknown>): string | null => {
  const response = asRecord(body.Resp) || body
  return normalizeString(response.url) || null
}

const sleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise(resolve => setTimeout(resolve, ms))

const runExternalVideoProviderIfConfigured = async (
  env: StrytreeWorkerEnv,
  job: StrytreeGenerationJobRow,
  requestPayload: Record<string, unknown>,
): Promise<ExternalVideoProviderResult | null> => {
  const providerMode = normalizeString(env.STRYTREE_PROVIDER_MODE).toLowerCase()
  const forceLive = providerMode === 'live' || providerMode === 'external_video_provider'
  const apiKey = readEnvString(env, 'STRYTREE_EXTERNAL_VIDEO_PROVIDER_API_KEY', 'EXTERNAL_VIDEO_PROVIDER_API_KEY')
  if (!apiKey) {
    if (forceLive) throw new StrytreeProviderError('missing_external_video_provider_api_key', 'External video provider mode requires a server-side API key.')
    return null
  }
  const providerRequest = buildExternalVideoProviderGenerationRequest(requestPayload)
  if (!providerRequest) {
    if (forceLive) throw new StrytreeProviderError('missing_external_video_provider_media_reference', 'External video provider live mode requires image_references or img_id in the generation payload.')
    return null
  }
  const fetcher = readExternalVideoProviderFetch(env)
  const baseUrl = (readEnvString(env, 'STRYTREE_EXTERNAL_VIDEO_PROVIDER_BASE_URL') || EXTERNAL_VIDEO_PROVIDER_DEFAULT_BASE_URL).replace(/\/+$/g, '')
  const submittedAtMs = Date.now()
  const submitResponse = await fetcher(`${baseUrl}${providerRequest.endpoint}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'API-KEY': apiKey,
      'Ai-trace-id': makeTraceId(),
    },
    body: stableJson(providerRequest.body),
  })
  const submitJson = await readJsonResponse(submitResponse)
  if (!submitResponse.ok || normalizeNumber(submitJson.ErrCode) > 0) {
    throw new StrytreeProviderError(
      'external_video_provider_submit_failed',
      normalizeString(submitJson.ErrMsg) || `External video provider submit failed with HTTP ${submitResponse.status}.`,
    )
  }
  const videoId = readExternalVideoProviderVideoId(submitJson)
  if (!videoId) throw new StrytreeProviderError('external_video_provider_missing_video_id', 'External video provider submit response did not include a video id.')
  const maxPolls = Math.max(1, Math.floor(readEnvNumber(env, 'STRYTREE_EXTERNAL_VIDEO_PROVIDER_MAX_POLLS', 60)))
  const intervalMs = Math.floor(readEnvNumber(env, 'STRYTREE_EXTERNAL_VIDEO_PROVIDER_POLL_INTERVAL_MS', 1500))
  let lastJson: Record<string, unknown> = submitJson
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (attempt > 0) await sleep(intervalMs)
    const pollResponse = await fetcher(`${baseUrl}/openapi/v2/video/result/${encodeURIComponent(videoId)}`, {
      method: 'GET',
      headers: {
        'API-KEY': apiKey,
        'Ai-trace-id': makeTraceId(),
      },
    })
    const pollJson = await readJsonResponse(pollResponse)
    lastJson = pollJson
    if (!pollResponse.ok || normalizeNumber(pollJson.ErrCode) > 0) {
      throw new StrytreeProviderError(
        'external_video_provider_poll_failed',
        normalizeString(pollJson.ErrMsg) || `External video provider poll failed with HTTP ${pollResponse.status}.`,
      )
    }
    const status = readExternalVideoProviderStatus(pollJson)
    if (status === EXTERNAL_VIDEO_PROVIDER_SUCCESS_STATUS) {
      return {
        videoId,
        status,
        videoUrl: readExternalVideoProviderVideoUrl(pollJson),
        responseJson: pollJson,
        submittedAtMs,
        completedAtMs: Date.now(),
      }
    }
    if (EXTERNAL_VIDEO_PROVIDER_FAILED_STATUSES.has(status)) {
      throw new StrytreeProviderError('external_video_provider_generation_failed', `External video provider generation ended with status ${status}.`)
    }
    if (status !== EXTERNAL_VIDEO_PROVIDER_GENERATING_STATUS && attempt === maxPolls - 1) {
      throw new StrytreeProviderError('external_video_provider_unknown_status', `External video provider generation ended with unknown status ${status}.`)
    }
  }
  throw new StrytreeProviderError('external_video_provider_poll_timeout', `External video provider generation did not finish after ${maxPolls} poll attempts. Last response: ${stableJson(lastJson)}`)
}

const completeGenerationJobSuccess = async (
  db: D1DatabaseLike,
  env: StrytreeWorkerEnv,
  job: StrytreeGenerationJobRow,
  nowIso: string,
  providerResult: ExternalVideoProviderResult | null,
): Promise<void> => {
  const bucket = env.STRYTREE_MEDIA_BUCKET as R2BucketLike | undefined
  if (typeof bucket?.put !== 'function') {
    throw new Error('missing Strytree R2 media bucket binding')
  }
  const videoObjectKey = `strytree/generation/${job.id}/video.json`
  const thumbnailObjectKey = `strytree/generation/${job.id}/thumbnail.json`
  const requestPayload = parseJsonRecord(job.request_json)
  const artifact = stableJson({
    job_id: job.id,
    provider: 'external_video_provider',
    provider_job_id: providerResult?.videoId || null,
    prompt: normalizeString(requestPayload.prompt),
    generated_at: nowIso,
    mode: providerResult ? 'external-video-provider-live-poll' : 'server-side-provider-safe-artifact',
    source_url: providerResult?.videoUrl || null,
    external_provider_status: providerResult?.status || null,
    elapsed_ms: providerResult ? Math.max(0, providerResult.completedAtMs - providerResult.submittedAtMs) : 0,
    provider_response: providerResult?.responseJson || null,
  })
  await bucket.put(videoObjectKey, artifact, { httpMetadata: { contentType: 'application/json; charset=utf-8' } })
  await bucket.put(thumbnailObjectKey, artifact, { httpMetadata: { contentType: 'application/json; charset=utf-8' } })
  await execute(
    db,
    `UPDATE strytree_generation_jobs
     SET status = ?, provider_job_id = ?, result_json = ?, error_code = ?,
       error_message = ?, updated_at = ?
     WHERE id = ?`,
    [
      'succeeded',
      providerResult?.videoId || buildId('pv', [job.id]),
      stableJson({
        video_object_key: videoObjectKey,
        thumbnail_object_key: thumbnailObjectKey,
        preview_url: `/api/strytree/media/${encodeURIComponent(videoObjectKey)}`,
        provider_url: providerResult?.videoUrl || null,
        provider_status: providerResult?.status || null,
      }),
      null,
      null,
      nowIso,
      job.id,
    ],
  )
  await writeAuditEvent(db, {
    actorUserId: job.user_id,
    action: 'generation_job_complete',
    objectType: 'strytree_generation_job',
    objectId: job.id,
    status: 'succeeded',
    metadata: {
      video_object_key: videoObjectKey,
      thumbnail_object_key: thumbnailObjectKey,
      provider_job_id: providerResult?.videoId || null,
      mode: providerResult ? 'external-video-provider-live-poll' : 'server-side-provider-safe-artifact',
    },
    nowIso,
  })
}

const completeGenerationJobFailure = async (
  db: D1DatabaseLike,
  env: StrytreeWorkerEnv,
  job: StrytreeGenerationJobRow,
  nowIso: string,
  errorCode = 'provider_unavailable',
  errorMessage = 'Strytree provider simulation failed before artifact write.',
): Promise<void> => {
  if (job.refund_ledger_event_id) return
  const balance = await readBalance(db, job.user_id)
  const refundLedgerEventId = buildId('ledger_refund', [job.user_id, job.id])
  const ledgerMutation = await writeLedgerEvent(db, env, {
    id: refundLedgerEventId,
    userId: job.user_id,
    eventType: 'refund_credit',
    amountCredits: GENERATION_CREDIT_COST,
    balanceAfterCredits: balance + GENERATION_CREDIT_COST,
    relatedObjectType: 'strytree_generation_job',
    relatedObjectId: job.id,
    idempotencyKey: `${job.id}:refund`,
    metadata: {
      debit_ledger_event_id: job.debit_ledger_event_id,
      error_code: errorCode,
    },
    nowIso,
  })
  await execute(
    db,
    `UPDATE strytree_generation_jobs
     SET status = ?, refund_ledger_event_id = ?, fallback_artifact_json = ?,
       error_code = ?, error_message = ?, updated_at = ?
     WHERE id = ?`,
    [
      'failed',
      ledgerMutation.ledgerEventId,
      stableJson({
        kind: 'strytree_generation_fallback',
        reason: errorCode,
        message: errorMessage,
        debit_ledger_event_id: job.debit_ledger_event_id,
      }),
      errorCode,
      errorMessage,
      nowIso,
      job.id,
    ],
  )
  await writeAuditEvent(db, {
    actorUserId: job.user_id,
    action: 'generation_job_refund',
    objectType: 'strytree_generation_job',
    objectId: job.id,
    status: 'failed',
    metadata: { refund_ledger_event_id: ledgerMutation.ledgerEventId, error_code: errorCode },
    nowIso,
  })
}

export const processStrytreeQueueMessage = async (
  body: unknown,
  env: StrytreeWorkerEnv,
  db: D1DatabaseLike,
): Promise<'processed' | 'ignored'> => {
  const message = asRecord(body) as StrytreeGenerationQueueMessage | null
  if (!message || message.type !== 'strytree.generation_job.created') return 'ignored'
  const jobId = normalizeString(message.job_id)
  if (!jobId) throw new Error('missing Strytree generation job id')
  const job = await readGenerationJobById(db, jobId)
  if (!job) throw new Error(`Strytree generation job not found: ${jobId}`)
  if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'moderated') return 'processed'
  const nowIso = new Date().toISOString()
  await execute(
    db,
    `UPDATE strytree_generation_jobs
     SET status = ?, updated_at = ?
     WHERE id = ?`,
    ['processing', nowIso, job.id],
  )
  const requestPayload = parseJsonRecord(job.request_json)
  const shouldFail = (
    message.simulate_provider_failure === true ||
    requestPayload.simulate_provider_failure === true ||
    normalizeString(env.STRYTREE_PROVIDER_MODE).toLowerCase() === 'fail'
  )
  if (shouldFail) {
    await completeGenerationJobFailure(db, env, job, nowIso)
    return 'processed'
  }
  try {
    const providerResult = await runExternalVideoProviderIfConfigured(env, job, requestPayload)
    await completeGenerationJobSuccess(db, env, job, nowIso, providerResult)
  } catch (err) {
    const messageText = err instanceof Error ? err.message : 'Strytree generation artifact write failed.'
    const code = err instanceof StrytreeProviderError ? err.code : 'artifact_write_failed'
    await completeGenerationJobFailure(db, env, job, nowIso, code, messageText)
  }
  return 'processed'
}

const mapNodeForSnapshot = (
  node: StrytreeNodeRow,
  unlockedNodeIds: Set<string>,
  viewerUserId: string | null,
) => {
  const free = Number(node.is_free_window || 0) === 1
  const ownsNode = viewerUserId ? node.creator_user_id === viewerUserId : false
  const unlocked = unlockedNodeIds.has(node.id)
  const full = free || ownsNode || unlocked
  return {
    id: node.id,
    parent_node_id: node.parent_node_id,
    selected_candidate_id: node.selected_candidate_id,
    title: node.title,
    synopsis: node.synopsis,
    status: node.status,
    visibility: node.visibility,
    is_free_window: free,
    unlock_price_credits: normalizeNumber(node.unlock_price_credits),
    likes_count: normalizeNumber(node.likes_count),
    impressions_count: normalizeNumber(node.impressions_count),
    paid_unlocks_count: normalizeNumber(node.paid_unlocks_count),
    moderation_status: node.moderation_status,
    entitlement_hint: full ? 'full' : 'locked',
    thumbnail_object_key: node.thumbnail_object_key,
    video_object_key: full ? node.video_object_key : null,
    created_at: node.created_at,
    updated_at: node.updated_at,
  }
}

const handleStoryTree = async (
  request: Request,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
  storyId: string,
): Promise<Response> => {
  const story = await readStory(db, storyId)
  if (!story || story.status === 'hidden') return errorJson(404, 'story_not_found', corsHeaders)
  const viewer = await readUserContext(request, db)
  const [nodes, assets, unlockedNodeIds] = await Promise.all([
    readStoryNodes(db, story.id),
    readStoryAssets(db, story.id),
    readUnlockedNodeIds(db, viewer?.userId || null),
  ])
  const visibleNodes = nodes.filter(node => node.visibility !== 'hidden')
  const mappedNodes = visibleNodes.map(node => mapNodeForSnapshot(node, unlockedNodeIds, viewer?.userId || null))
  return json(200, {
    ok: true,
    apiVersion: STRYTREE_API_VERSION,
    story: {
      id: story.id,
      slug: story.slug,
      title: story.title,
      tagline: story.tagline,
      status: story.status,
      poster_object_key: story.poster_object_key,
      root_node_id: story.root_node_id,
    },
    nodes: mappedNodes,
    assets: assets.map(asset => ({
      id: asset.id,
      owner_node_id: asset.owner_node_id,
      asset_type: asset.asset_type,
      name: asset.name,
      ref_name: asset.ref_name,
      external_provider_image_id: asset.external_provider_image_id,
      object_key: asset.object_key,
    })),
    stats: {
      active_branch_count: mappedNodes.filter(node => node.status !== 'dropped').length,
      total_likes: mappedNodes.reduce((sum, node) => sum + normalizeNumber(node.likes_count), 0),
    },
    snapshot: {
      version: normalizeNumber(story.snapshot_version, 1),
      generated_at: new Date().toISOString(),
    },
  }, corsHeaders)
}

const handleUnlockNode = async (
  request: Request,
  env: StrytreeWorkerEnv,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
  nodeId: string,
): Promise<Response> => {
  const user = await requireUserContext(request, db, corsHeaders)
  if (user instanceof Response) return user
  const payload = asRecord(await readRequestJson(request))
  const idempotencyKey = readIdempotencyKey(request, payload)
  if (!idempotencyKey) return errorJson(400, 'missing_idempotency_key', corsHeaders)
  const node = await readNode(db, nodeId)
  if (!node || node.visibility === 'hidden') return errorJson(404, 'node_not_found', corsHeaders)
  if (node.moderation_status === 'rejected') return errorJson(409, 'node_not_unlockable', corsHeaders)
  const price = normalizeNumber(node.unlock_price_credits)
  if (Number(node.is_free_window || 0) === 1 || price <= 0) {
    return json(200, {
      ok: true,
      apiVersion: STRYTREE_API_VERSION,
      node_id: node.id,
      entitlement: 'full',
      ledger_event_id: null,
      creator_credit_credits: 0,
      platform_fee_credits: 0,
      already_unlocked: true,
    }, corsHeaders)
  }
  const existing = await readExistingUnlock(db, user.userId, node.id)
  if (existing) {
    return json(200, {
      ok: true,
      apiVersion: STRYTREE_API_VERSION,
      node_id: node.id,
      entitlement: 'full',
      ledger_event_id: existing.ledger_event_id,
      creator_credit_credits: 0,
      platform_fee_credits: 0,
      already_unlocked: true,
    }, corsHeaders)
  }
  const balance = await readBalance(db, user.userId)
  if (balance < price) {
    return errorJson(402, 'insufficient_balance', corsHeaders, {
      balance_credits: balance,
      required_credits: price,
    })
  }
  const nowIso = new Date().toISOString()
  const balanceAfter = balance - price
  const ledgerEventId = buildId('ledger_unlock', [user.userId, node.id, idempotencyKey])
  const creatorCredit = Math.floor(price * 0.8)
  const platformFee = price - creatorCredit
  const ledgerMutation = await writeLedgerEvent(db, env, {
    id: ledgerEventId,
    userId: user.userId,
    eventType: 'unlock_debit',
    amountCredits: -price,
    balanceAfterCredits: balanceAfter,
    relatedObjectType: 'strytree_node',
    relatedObjectId: node.id,
    idempotencyKey,
    metadata: {
      creator_user_id: node.creator_user_id,
      creator_credit_credits: creatorCredit,
      platform_fee_credits: platformFee,
    },
    nowIso,
  })
  await execute(
    db,
    `INSERT INTO strytree_unlocks (
       id, user_id, node_id, ledger_event_id, idempotency_key, created_at
     ) VALUES (?, ?, ?, ?, ?, ?)`,
    [buildId('unlock', [user.userId, node.id]), user.userId, node.id, ledgerMutation.ledgerEventId, idempotencyKey, nowIso],
  )
  await execute(
    db,
    `UPDATE strytree_nodes
     SET paid_unlocks_count = paid_unlocks_count + 1, updated_at = ?
     WHERE id = ?`,
    [nowIso, node.id],
  )
  await writeAuditEvent(db, {
    actorUserId: user.userId,
    action: 'unlock',
    objectType: 'strytree_node',
    objectId: node.id,
    status: 'succeeded',
    idempotencyKey,
    metadata: { ledger_event_id: ledgerMutation.ledgerEventId, price_credits: price },
    nowIso,
  })
  return json(200, {
    ok: true,
    apiVersion: STRYTREE_API_VERSION,
    node_id: node.id,
    entitlement: 'full',
    ledger_event_id: ledgerMutation.ledgerEventId,
    creator_credit_credits: creatorCredit,
    platform_fee_credits: platformFee,
    balance_after_credits: ledgerMutation.balanceAfterCredits,
  }, corsHeaders)
}

const readCandidateRunByIdempotency = async (
  db: D1DatabaseLike,
  userId: string,
  idempotencyKey: string,
): Promise<StrytreeCandidateRunRow | null> =>
  queryFirst<StrytreeCandidateRunRow>(
    db,
    'SELECT * FROM strytree_candidate_runs WHERE user_id = ? AND idempotency_key = ? LIMIT 1',
    [userId, idempotencyKey],
  )

const readCandidateRun = async (
  db: D1DatabaseLike,
  candidateRunId: string,
  userId: string,
): Promise<StrytreeCandidateRunRow | null> =>
  queryFirst<StrytreeCandidateRunRow>(
    db,
    'SELECT * FROM strytree_candidate_runs WHERE id = ? AND user_id = ? LIMIT 1',
    [candidateRunId, userId],
  )

const readCandidatesForRun = async (
  db: D1DatabaseLike,
  candidateRunId: string,
): Promise<StrytreeBranchCandidateRow[]> =>
  queryAll<StrytreeBranchCandidateRow>(
    db,
    `SELECT *
     FROM strytree_branch_candidates
     WHERE candidate_run_id = ?
     ORDER BY created_at, id`,
    [candidateRunId],
  )

const mapCandidateScorecard = (candidate: StrytreeBranchCandidateRow) => ({
  candidate_id: candidate.id,
  provider: candidate.provider,
  status: candidate.status,
  title: candidate.title,
  synopsis: candidate.synopsis,
  credit_cost: normalizeNumber(candidate.credit_cost),
  elapsed_ms: normalizeNumber(candidate.elapsed_ms),
  inherited_asset_count: normalizeNumber(candidate.inherited_asset_count),
  continuity_score: Number(candidate.continuity_score || 0),
  moderation_status: candidate.moderation_status,
  publish_eligible: Number(candidate.publish_eligible || 0) === 1,
  thumbnail_object_key: candidate.thumbnail_object_key,
  video_object_key: candidate.video_object_key,
})

const createDeterministicCandidates = (
  args: {
    runId: string
    userId: string
    storyId: string
    parentNode: StrytreeNodeRow
    prompt: string
    maxCandidates: number
    nowIso: string
  },
): StrytreeBranchCandidateRow[] => {
  const prompt = normalizeString(args.prompt) || normalizeString(args.parentNode.prompt) || args.parentNode.synopsis
  return Array.from({ length: args.maxCandidates }, (_, index) => {
    const ordinal = index + 1
    const id = buildId('cand', [args.runId, ordinal])
    return {
      id,
      candidate_run_id: args.runId,
      generation_job_id: null,
      user_id: args.userId,
      story_id: args.storyId,
      parent_node_id: args.parentNode.id,
      provider: 'deterministic-fallback',
      status: 'succeeded',
      title: `Continuation ${ordinal}: ${args.parentNode.title}`,
      synopsis: `${prompt.slice(0, 140)}${prompt.length > 140 ? '...' : ''}`,
      prompt: `${prompt}\n\nCandidate ${ordinal}: keep continuity with ${args.parentNode.title}.`,
      video_object_key: null,
      thumbnail_object_key: null,
      credit_cost: CANDIDATE_CREDIT_COST,
      elapsed_ms: 0,
      inherited_asset_count: 0,
      continuity_score: Math.min(0.95, 0.72 + ordinal * 0.05),
      moderation_status: 'approved',
      publish_eligible: 1,
      result_json: stableJson({
        fallback: true,
        reason: 'provider_not_required_for_deterministic_validation',
        ordinal,
      }),
      token_cost_json: stableJson({
        model: 'none',
        prompt_tokens: 0,
        completion_tokens: 0,
        estimated_cost_usd: 0,
      }),
      created_at: args.nowIso,
      updated_at: args.nowIso,
    }
  })
}

const handleCreateCandidateRun = async (
  request: Request,
  env: StrytreeWorkerEnv,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<Response> => {
  const user = await requireUserContext(request, db, corsHeaders)
  if (user instanceof Response) return user
  const payload = asRecord(await readRequestJson(request))
  if (!payload) return errorJson(400, 'invalid_json_body', corsHeaders)
  const idempotencyKey = readIdempotencyKey(request, payload)
  if (!idempotencyKey) return errorJson(400, 'missing_idempotency_key', corsHeaders)
  const maxCandidates = normalizeNumber(payload.max_candidates, 1)
  if (maxCandidates < 1 || maxCandidates > MAX_CANDIDATES) {
    return errorJson(400, 'candidate_bound_exceeded', corsHeaders, { max_candidates: MAX_CANDIDATES })
  }
  const existing = await readCandidateRunByIdempotency(db, user.userId, idempotencyKey)
  if (existing) {
    return json(200, {
      ok: true,
      apiVersion: STRYTREE_API_VERSION,
      candidate_run_id: existing.id,
      status: existing.status,
      max_candidates: normalizeNumber(existing.max_candidates),
      quoted_cost_credits: normalizeNumber(existing.quoted_cost_credits),
      idempotent_replay: true,
    }, corsHeaders)
  }
  const storyId = normalizeString(payload.story_id)
  const parentNodeId = normalizeString(payload.parent_node_id)
  if (!storyId || !parentNodeId) return errorJson(400, 'missing_story_or_parent_node', corsHeaders)
  const story = await readStory(db, storyId)
  const parentNode = await readNode(db, parentNodeId)
  if (!story || !parentNode || parentNode.story_id !== story.id) return errorJson(404, 'parent_node_not_found', corsHeaders)
  if (parentNode.status === 'dropped' || parentNode.moderation_status === 'rejected') {
    return errorJson(409, 'parent_node_not_extendable', corsHeaders)
  }
  const quotedCost = maxCandidates * CANDIDATE_CREDIT_COST
  const balance = await readBalance(db, user.userId)
  if (balance < quotedCost) {
    return errorJson(402, 'insufficient_balance', corsHeaders, {
      balance_credits: balance,
      required_credits: quotedCost,
    })
  }
  const nowIso = new Date().toISOString()
  const runId = buildId('candrun', [user.userId, parentNode.id, idempotencyKey])
  const ledgerEventId = buildId('ledger_candrun', [user.userId, runId, idempotencyKey])
  const prompt = normalizeString(payload.prompt)
  const requestJson = stableJson(payload)
  const candidates = createDeterministicCandidates({
    runId,
    userId: user.userId,
    storyId: story.id,
    parentNode,
    prompt,
    maxCandidates,
    nowIso,
  })
  const ledgerMutation = await writeLedgerEvent(db, env, {
    id: ledgerEventId,
    userId: user.userId,
    eventType: 'candidate_run_debit',
    amountCredits: -quotedCost,
    balanceAfterCredits: balance - quotedCost,
    relatedObjectType: 'strytree_candidate_run',
    relatedObjectId: runId,
    idempotencyKey,
    metadata: { max_candidates: maxCandidates, parent_node_id: parentNode.id },
    nowIso,
  })
  await execute(
    db,
    `INSERT INTO strytree_candidate_runs (
       id, user_id, story_id, parent_node_id, status, max_candidates,
       quoted_cost_credits, idempotency_key, request_json, scorecard_json,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      runId,
      user.userId,
      story.id,
      parentNode.id,
      'completed',
      maxCandidates,
      quotedCost,
      idempotencyKey,
      requestJson,
      stableJson(candidates.map(mapCandidateScorecard)),
      nowIso,
      nowIso,
    ],
  )
  for (const candidate of candidates) {
    await execute(
      db,
      `INSERT INTO strytree_branch_candidates (
         id, candidate_run_id, generation_job_id, user_id, story_id,
         parent_node_id, provider, status, title, synopsis, prompt,
         video_object_key, thumbnail_object_key, credit_cost, elapsed_ms,
         inherited_asset_count, continuity_score, moderation_status,
         publish_eligible, result_json, token_cost_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        candidate.id,
        candidate.candidate_run_id,
        candidate.generation_job_id,
        candidate.user_id,
        candidate.story_id,
        candidate.parent_node_id,
        candidate.provider,
        candidate.status,
        candidate.title,
        candidate.synopsis,
        candidate.prompt,
        candidate.video_object_key,
        candidate.thumbnail_object_key,
        candidate.credit_cost,
        candidate.elapsed_ms,
        candidate.inherited_asset_count,
        candidate.continuity_score,
        candidate.moderation_status,
        candidate.publish_eligible,
        candidate.result_json,
        candidate.token_cost_json,
        candidate.created_at,
        candidate.updated_at,
      ],
    )
  }
  const queue = env.STRYTREE_GENERATION_QUEUE as QueueLike | undefined
  if (typeof queue?.send === 'function') {
    await queue.send({
      type: 'strytree.candidate_run.created',
      candidate_run_id: runId,
      story_id: story.id,
      parent_node_id: parentNode.id,
      max_candidates: maxCandidates,
    })
  }
  await writeAuditEvent(db, {
    actorUserId: user.userId,
    action: 'candidate_run',
    objectType: 'strytree_candidate_run',
    objectId: runId,
    status: 'completed',
    idempotencyKey,
    metadata: { quoted_cost_credits: quotedCost, ledger_event_id: ledgerMutation.ledgerEventId },
    nowIso,
  })
  return json(202, {
    ok: true,
    apiVersion: STRYTREE_API_VERSION,
    candidate_run_id: runId,
    status: 'completed',
    max_candidates: maxCandidates,
    quoted_cost_credits: quotedCost,
    ledger_event_id: ledgerMutation.ledgerEventId,
  }, corsHeaders)
}

const handleGetCandidateRun = async (
  request: Request,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
  candidateRunId: string,
): Promise<Response> => {
  const user = await requireUserContext(request, db, corsHeaders)
  if (user instanceof Response) return user
  const run = await readCandidateRun(db, candidateRunId, user.userId)
  if (!run) return errorJson(404, 'candidate_run_not_found', corsHeaders)
  const candidates = await readCandidatesForRun(db, run.id)
  return json(200, {
    ok: true,
    apiVersion: STRYTREE_API_VERSION,
    candidate_run_id: run.id,
    status: run.status,
    parent_node_id: run.parent_node_id,
    max_candidates: normalizeNumber(run.max_candidates),
    quoted_cost_credits: normalizeNumber(run.quoted_cost_credits),
    scorecards: candidates.map(mapCandidateScorecard),
  }, corsHeaders)
}

const readCandidate = async (
  db: D1DatabaseLike,
  candidateId: string,
  userId: string,
): Promise<StrytreeBranchCandidateRow | null> =>
  queryFirst<StrytreeBranchCandidateRow>(
    db,
    'SELECT * FROM strytree_branch_candidates WHERE id = ? AND user_id = ? LIMIT 1',
    [candidateId, userId],
  )

const readMergePlanForCandidate = async (
  db: D1DatabaseLike,
  candidateId: string,
): Promise<{ published_node_id: string | null } | null> =>
  queryFirst<{ published_node_id: string | null }>(
    db,
    'SELECT published_node_id FROM strytree_candidate_merge_plans WHERE selected_candidate_id = ? LIMIT 1',
    [candidateId],
  )

const handlePublishCandidate = async (
  request: Request,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
  candidateId: string,
): Promise<Response> => {
  const user = await requireUserContext(request, db, corsHeaders)
  if (user instanceof Response) return user
  const payload = asRecord(await readRequestJson(request))
  const idempotencyKey = readIdempotencyKey(request, payload)
  if (!idempotencyKey) return errorJson(400, 'missing_idempotency_key', corsHeaders)
  const candidate = await readCandidate(db, candidateId, user.userId)
  if (!candidate) return errorJson(404, 'candidate_run_not_found', corsHeaders)
  const existingMergePlan = await readMergePlanForCandidate(db, candidate.id)
  if (candidate.status === 'published' && existingMergePlan?.published_node_id) {
    return json(200, {
      ok: true,
      apiVersion: STRYTREE_API_VERSION,
      published_node_id: existingMergePlan.published_node_id,
      parent_node_id: candidate.parent_node_id,
      selected_candidate_id: candidate.id,
      idempotent_replay: true,
    }, corsHeaders)
  }
  if (
    Number(candidate.publish_eligible || 0) !== 1 ||
    candidate.moderation_status !== 'approved' ||
    candidate.status !== 'succeeded'
  ) {
    return errorJson(409, 'candidate_not_publishable', corsHeaders)
  }
  const parentNode = await readNode(db, candidate.parent_node_id)
  const story = await readStory(db, candidate.story_id)
  if (!parentNode || !story) return errorJson(404, 'parent_node_not_found', corsHeaders)
  const nowIso = new Date().toISOString()
  const publishedNodeId = buildId('node', [candidate.id, idempotencyKey])
  const title = normalizeString(payload?.title) || candidate.title || `Continuation of ${parentNode.title}`
  const synopsis = normalizeString(payload?.synopsis) || candidate.synopsis || parentNode.synopsis
  await execute(
    db,
    `INSERT INTO strytree_nodes (
       id, story_id, parent_node_id, selected_candidate_id, creator_user_id,
       title, synopsis, prompt, status, visibility, is_free_window,
       unlock_price_credits, video_object_key, thumbnail_object_key,
       age_days, likes_count, impressions_count, paid_unlocks_count,
       moderation_status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      publishedNodeId,
      story.id,
      parentNode.id,
      candidate.id,
      user.userId,
      title,
      synopsis,
      candidate.prompt,
      'active',
      'public',
      1,
      0,
      candidate.video_object_key,
      candidate.thumbnail_object_key,
      0,
      0,
      0,
      0,
      'approved',
      nowIso,
      nowIso,
    ],
  )
  await execute(
    db,
    `INSERT INTO strytree_candidate_merge_plans (
       id, user_id, story_id, parent_node_id, selected_candidate_id,
       status, merge_json, published_node_id, idempotency_key,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      buildId('merge', [candidate.id, idempotencyKey]),
      user.userId,
      story.id,
      parentNode.id,
      candidate.id,
      'published',
      stableJson({
        title,
        synopsis,
        merge_notes: normalizeString(payload?.merge_notes),
      }),
      publishedNodeId,
      idempotencyKey,
      nowIso,
      nowIso,
    ],
  )
  await execute(
    db,
    'UPDATE strytree_branch_candidates SET status = ?, updated_at = ? WHERE id = ?',
    ['published', nowIso, candidate.id],
  )
  await execute(
    db,
    'UPDATE strytree_stories SET snapshot_version = snapshot_version + 1, updated_at = ? WHERE id = ?',
    [nowIso, story.id],
  )
  await writeAuditEvent(db, {
    actorUserId: user.userId,
    action: 'candidate_publish',
    objectType: 'strytree_branch_candidate',
    objectId: candidate.id,
    status: 'published',
    idempotencyKey,
    metadata: { published_node_id: publishedNodeId },
    nowIso,
  })
  return json(200, {
    ok: true,
    apiVersion: STRYTREE_API_VERSION,
    published_node_id: publishedNodeId,
    parent_node_id: parentNode.id,
    selected_candidate_id: candidate.id,
    snapshot_version: normalizeNumber(story.snapshot_version, 1) + 1,
  }, corsHeaders)
}

export const isStrytreeRoute = (pathname: string): boolean =>
  pathname === '/api/strytree' || pathname.startsWith('/api/strytree/')

export const handleStrytreeRoute = async (
  request: Request,
  env: StrytreeWorkerEnv,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<Response | null> => {
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/api/strytree/readyz') {
    return inspectStrytreeReadiness(env, db, corsHeaders)
  }
  const storyTreeMatch = /^\/api\/strytree\/stories\/([^/]+)\/tree$/.exec(url.pathname)
  if (request.method === 'GET' && storyTreeMatch?.[1]) {
    return handleStoryTree(request, db, corsHeaders, readPathId(storyTreeMatch[1]))
  }
  const unlockMatch = /^\/api\/strytree\/nodes\/([^/]+)\/unlock$/.exec(url.pathname)
  if (request.method === 'POST' && unlockMatch?.[1]) {
    return handleUnlockNode(request, env, db, corsHeaders, readPathId(unlockMatch[1]))
  }
  if (request.method === 'POST' && url.pathname === '/api/strytree/checkout/sessions') {
    return handleCreateCheckoutSession(request, env, db, corsHeaders)
  }
  if (request.method === 'POST' && url.pathname === '/api/strytree/checkout/webhook') {
    return handleCheckoutWebhook(request, env, db, corsHeaders)
  }
  if (request.method === 'GET' && url.pathname === '/api/strytree/wallet') {
    return handleGetWallet(request, db, corsHeaders)
  }
  const checkoutCompleteMatch = /^\/api\/strytree\/checkout\/sessions\/([^/]+)\/complete$/.exec(url.pathname)
  if (request.method === 'POST' && checkoutCompleteMatch?.[1]) {
    return handleCompleteCheckoutSession(request, env, db, corsHeaders, readPathId(checkoutCompleteMatch[1]))
  }
  if (request.method === 'POST' && url.pathname === '/api/strytree/generation-jobs') {
    return handleCreateGenerationJob(request, env, db, corsHeaders)
  }
  const generationJobMatch = /^\/api\/strytree\/generation-jobs\/([^/]+)$/.exec(url.pathname)
  if (request.method === 'GET' && generationJobMatch?.[1]) {
    return handleGetGenerationJob(request, db, corsHeaders, readPathId(generationJobMatch[1]))
  }
  if (request.method === 'POST' && url.pathname === '/api/strytree/candidate-runs') {
    return handleCreateCandidateRun(request, env, db, corsHeaders)
  }
  const candidateRunMatch = /^\/api\/strytree\/candidate-runs\/([^/]+)$/.exec(url.pathname)
  if (request.method === 'GET' && candidateRunMatch?.[1]) {
    return handleGetCandidateRun(request, db, corsHeaders, readPathId(candidateRunMatch[1]))
  }
  const publishMatch = /^\/api\/strytree\/candidates\/([^/]+)\/publish$/.exec(url.pathname)
  if (request.method === 'POST' && publishMatch?.[1]) {
    return handlePublishCandidate(request, db, corsHeaders, readPathId(publishMatch[1]))
  }
  return null
}
