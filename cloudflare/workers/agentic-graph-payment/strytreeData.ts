import { normalizeString, queryFirst, queryAll, normalizeNumber } from '../shared/d1'
import type { D1DatabaseLike, D1StatementLike } from '../shared/d1'
import type { StrytreeUserContext, HeadersRecord, StrytreeStoryRow, StrytreeNodeRow, StrytreeAssetRow, StrytreePaymentSessionRow, StrytreePendingPaymentSessionRow, StrytreeGenerationJobRow, StrytreeWorkerEnv, StrytreeLedgerMutationResult, DurableObjectNamespaceLike } from './strytreeTypes'
import { errorJson, buildId, stableJson, asRecord } from './strytreeSupport'
import { readBoundedJson } from './travelAgency/boundedJson'
import { scopedUnlockKey } from './strytreeCreditLedger'

const readBearerToken = (request: Request): string => {
  const authorization = request.headers.get('authorization') || ''
  const bearer = /^bearer\s+(.+)$/i.exec(authorization)?.[1] || ''
  return normalizeString(bearer || request.headers.get('x-strytree-session') || '')
}

export const readUserContext = async (
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

export const requireUserContext = async (
  request: Request,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
): Promise<StrytreeUserContext | Response> => {
  const user = await readUserContext(request, db)
  return user || errorJson(401, 'unauthorized', corsHeaders)
}

export const readStory = async (db: D1DatabaseLike, storyId: string): Promise<StrytreeStoryRow | null> =>
  queryFirst<StrytreeStoryRow>(
    db,
    `SELECT id, slug, title, tagline, status, poster_object_key, root_node_id,
       snapshot_version
     FROM strytree_stories
     WHERE id = ? OR slug = ?
     LIMIT 1`,
    [storyId, storyId],
  )

export const readNode = async (db: D1DatabaseLike, nodeId: string): Promise<StrytreeNodeRow | null> =>
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

export const readStoryNodes = async (db: D1DatabaseLike, storyId: string): Promise<StrytreeNodeRow[]> =>
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

export const readStoryAssets = async (db: D1DatabaseLike, storyId: string): Promise<StrytreeAssetRow[]> =>
  queryAll<StrytreeAssetRow>(
    db,
    `SELECT id, story_id, owner_node_id, asset_type, name, ref_name, external_provider_image_id,
       object_key, prompt_prefix, negative_prompt, created_at
     FROM strytree_assets
     WHERE story_id = ?
     ORDER BY created_at, id`,
    [storyId],
  )

export const readUnlockedNodeIds = async (db: D1DatabaseLike, userId: string | null): Promise<Set<string>> => {
  if (!userId) return new Set()
  const rows = await queryAll<{ node_id: string }>(
    db,
    'SELECT node_id FROM strytree_unlocks WHERE user_id = ?',
    [userId],
  )
  return new Set(rows.map(row => String(row.node_id || '')).filter(Boolean))
}

export const readExistingUnlock = async (
  db: D1DatabaseLike,
  userId: string,
  nodeId: string,
): Promise<{ ledger_event_id: string } | null> =>
  queryFirst<{ ledger_event_id: string }>(
    db,
    'SELECT ledger_event_id FROM strytree_unlocks WHERE user_id = ? AND node_id = ? LIMIT 1',
    [userId, nodeId],
  )

export const readBalance = async (db: D1DatabaseLike, userId: string): Promise<number> => {
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

export const readPaymentSessionByIdempotency = async (
  db: D1DatabaseLike,
  userId: string,
  idempotencyKey: string,
): Promise<StrytreePaymentSessionRow | null> =>
  queryFirst<StrytreePaymentSessionRow>(
    db,
    'SELECT * FROM strytree_payment_sessions WHERE user_id = ? AND idempotency_key = ? LIMIT 1',
    [userId, idempotencyKey],
  )

export const readPaymentSessionById = async (
  db: D1DatabaseLike,
  sessionId: string,
): Promise<StrytreePaymentSessionRow | null> =>
  queryFirst<StrytreePaymentSessionRow>(
    db,
    'SELECT * FROM strytree_payment_sessions WHERE id = ? LIMIT 1',
    [sessionId],
  )

export const readPaymentSessionByProviderSessionId = async (
  db: D1DatabaseLike,
  providerSessionId: string,
): Promise<StrytreePaymentSessionRow | null> =>
  queryFirst<StrytreePaymentSessionRow>(
    db,
    'SELECT * FROM strytree_payment_sessions WHERE provider_session_id = ? LIMIT 1',
    [providerSessionId],
  )

export const readPaymentSessionForUser = async (
  db: D1DatabaseLike,
  userId: string,
  sessionId: string,
): Promise<StrytreePaymentSessionRow | null> =>
  queryFirst<StrytreePaymentSessionRow>(
    db,
    'SELECT * FROM strytree_payment_sessions WHERE id = ? AND user_id = ? LIMIT 1',
    [sessionId, userId],
  )

export const readPendingPaymentSessions = async (
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

export const readGenerationJob = async (
  db: D1DatabaseLike,
  jobId: string,
  userId: string,
): Promise<StrytreeGenerationJobRow | null> =>
  queryFirst<StrytreeGenerationJobRow>(
    db,
    'SELECT * FROM strytree_generation_jobs WHERE id = ? AND user_id = ? LIMIT 1',
    [jobId, userId],
  )

export const readGenerationJobById = async (
  db: D1DatabaseLike,
  jobId: string,
): Promise<StrytreeGenerationJobRow | null> =>
  queryFirst<StrytreeGenerationJobRow>(
    db,
    'SELECT * FROM strytree_generation_jobs WHERE id = ? LIMIT 1',
    [jobId],
  )


export const prepareAuditEvent = (
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
    replaySafe?: boolean
    when?: { sql: string; values: unknown[] }
  },
): D1StatementLike => db.prepare(
    `INSERT INTO strytree_audit_events (
       id, actor_user_id, action, object_type, object_id, status,
       idempotency_key, metadata_json, created_at
     ) ${args.when ? `SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${args.when.sql}` : 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'}
     ${args.replaySafe ? 'ON CONFLICT(id) DO NOTHING' : ''}`,
  ).bind(
      buildId('audit', [args.action, args.objectId, args.idempotencyKey || args.nowIso]),
      args.actorUserId,
      args.action,
      args.objectType,
      args.objectId,
      args.status,
      args.idempotencyKey || null,
      stableJson(args.metadata || {}),
      args.nowIso,
      ...(args.when?.values || []),
  )

export const writeAuditEvent = async (
  db: D1DatabaseLike,
  args: Parameters<typeof prepareAuditEvent>[1],
): Promise<void> => {
  await prepareAuditEvent(db, args).run()
}

const readLedgerStub = (env: StrytreeWorkerEnv, userId: string) => {
  const namespace = env.STRYTREE_CREDIT_LEDGER as DurableObjectNamespaceLike | undefined
  return typeof namespace?.getByName === 'function' ? namespace.getByName(userId)
    : typeof namespace?.idFromName === 'function' && typeof namespace.get === 'function'
      ? namespace.get(namespace.idFromName(userId)) : null
}

export type StrytreeUnlockReplay = { found: false; scopedKey: string } | {
  found: true; scopedKey: string; ledgerEventId: string; idempotencyKey: string
  amountCredits: number; balanceAfterCredits: number; authorityVersion: number
  semanticDigest: string; metadata: Record<string, unknown>; createdAt: string
}

export const readUnlockReplay = async (
  db: D1DatabaseLike,
  env: StrytreeWorkerEnv,
  args: { userId: string; nodeId: string; idempotencyKey: string },
): Promise<StrytreeUnlockReplay> => {
  void db
  const stub = readLedgerStub(env, args.userId)
  if (typeof stub?.fetch !== 'function') throw new Error('missing authoritative Strytree credit ledger binding')
  const scopedKey = await scopedUnlockKey(args.userId, args.idempotencyKey)
  const response = await stub.fetch(new Request('https://strytree-credit-ledger.internal/unlock-replay', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: stableJson({ user_id: args.userId, node_id: args.nodeId, idempotency_key: args.idempotencyKey }),
  }))
  const result = asRecord(await readBoundedJson(response, 32 * 1024))
  if (!response.ok || result?.ok !== true) throw new Error(normalizeString(result?.code) || 'unlock-reconciliation-required')
  if (result.scoped_key !== scopedKey) throw new Error('unlock-reconciliation-required')
  if (result.found === false) return { found: false, scopedKey }
  const event = asRecord(result.event)
  let metadata: Record<string, unknown> | null = null
  try { metadata = asRecord(JSON.parse(typeof event?.metadata_json === 'string' ? event.metadata_json : 'null')) } catch {}
  if (result.found !== true || !event || !metadata || event.user_id !== args.userId
    || event.event_type !== 'unlock_debit' || event.related_object_type !== 'strytree_node'
    || event.related_object_id !== args.nodeId || event.provider_event_id !== null
    || ![args.idempotencyKey, scopedKey].includes(String(event.idempotency_key))
    || typeof event.id !== 'string' || !event.id || event.id.length > 512
    || typeof event.created_at !== 'string' || !Number.isFinite(Date.parse(event.created_at))
    || typeof event.semantic_digest !== 'string' || !/^[a-f0-9]{64}$/.test(event.semantic_digest)
    || typeof event.amount_credits !== 'number' || !Number.isSafeInteger(event.amount_credits) || event.amount_credits >= 0
    || typeof event.balance_after_credits !== 'number' || !Number.isSafeInteger(event.balance_after_credits) || event.balance_after_credits < 0
    || typeof event.authority_version !== 'number' || !Number.isSafeInteger(event.authority_version) || event.authority_version < 1
    || typeof metadata.creator_user_id !== 'string' || !metadata.creator_user_id.trim()
    || typeof metadata.creator_credit_credits !== 'number' || !Number.isSafeInteger(metadata.creator_credit_credits) || metadata.creator_credit_credits < 0
    || typeof metadata.platform_fee_credits !== 'number' || !Number.isSafeInteger(metadata.platform_fee_credits) || metadata.platform_fee_credits < 0
    || metadata.creator_credit_credits + metadata.platform_fee_credits !== -event.amount_credits
    || metadata.unlock_client_key !== undefined && metadata.unlock_client_key !== args.idempotencyKey
    || event.idempotency_key === scopedKey && metadata.unlock_client_key !== args.idempotencyKey) {
    throw new Error('unlock-reconciliation-required')
  }
  return { found: true, scopedKey, ledgerEventId: event.id, idempotencyKey: String(event.idempotency_key),
    amountCredits: event.amount_credits, balanceAfterCredits: event.balance_after_credits,
    authorityVersion: event.authority_version, semanticDigest: event.semantic_digest, metadata, createdAt: event.created_at }
}

export const writeLedgerEvent = async (
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
  const stub = readLedgerStub(env, args.userId)
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
    const result = asRecord(await readBoundedJson(response, 32 * 1024))
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
