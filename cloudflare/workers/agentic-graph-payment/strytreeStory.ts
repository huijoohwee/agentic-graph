import type { StrytreeNodeRow, HeadersRecord, StrytreeWorkerEnv } from './strytreeTypes'
import { normalizeNumber, queryFirst } from '../shared/d1'
import type { D1DatabaseLike } from '../shared/d1'
import { readStory, readUserContext, readStoryNodes, readStoryAssets, readUnlockedNodeIds, requireUserContext, readNode, readExistingUnlock, readUnlockReplay, writeLedgerEvent, prepareAuditEvent } from './strytreeData'
import { errorJson, json, STRYTREE_API_VERSION, asRecord, readRequestJson, readIdempotencyKey, buildId } from './strytreeSupport'

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

export const handleStoryTree = async (
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

const unlockCompletionSql = `SELECT u.ledger_event_id, u.idempotency_key, l.amount_credits,
    l.balance_after_credits, a.metadata_json
  FROM strytree_unlocks u
  JOIN strytree_token_ledger l ON l.id = u.ledger_event_id AND l.user_id = u.user_id
    AND l.event_type = 'unlock_debit' AND l.related_object_type = 'strytree_node'
    AND l.related_object_id = u.node_id AND l.idempotency_key = u.idempotency_key
    AND l.authority_version > 0 AND length(l.semantic_digest) > 0
  JOIN strytree_audit_events a ON a.actor_user_id = u.user_id AND a.action = 'unlock'
    AND a.object_type = 'strytree_node' AND a.object_id = u.node_id
    AND a.status = 'succeeded' AND a.idempotency_key = u.idempotency_key
  JOIN strytree_nodes n ON n.id = u.node_id AND n.paid_unlocks_count > 0
  WHERE u.user_id = ? AND u.node_id = ? LIMIT 1`

const unlockCompletion = (value: unknown) => {
  const row = asRecord(value)
  if (!row) return null
  try {
    const metadata = asRecord(JSON.parse(String(row.metadata_json)))
    if (!metadata || typeof row.ledger_event_id !== 'string' || typeof row.idempotency_key !== 'string'
      || typeof row.amount_credits !== 'number' || !Number.isSafeInteger(row.amount_credits)
      || row.amount_credits >= 0 || metadata.ledger_event_id !== row.ledger_event_id
      || metadata.price_credits !== -row.amount_credits) return null
    return row
  } catch { return null }
}

// The unique entitlement insert makes a concurrent loser roll back its entire batch.
// A lost acknowledgement is recovered only from the completed, matching stored effect.
const finalizeUnlock = async (
  db: D1DatabaseLike,
  args: { userId: string; nodeId: string; ledgerEventId: string; key: string; price: number; nowIso: string },
) => {
  const { userId, nodeId, ledgerEventId, key, price, nowIso } = args
  const matches = (value: unknown) => {
    const row = unlockCompletion(value)
    return row?.ledger_event_id === ledgerEventId && row.idempotency_key === key
      && row.amount_credits === -price ? row : null
  }
  try {
    if (!db.batch) return null
    const results = await db.batch([
      db.prepare(`INSERT INTO strytree_unlocks
        (id, user_id, node_id, ledger_event_id, idempotency_key, created_at)
        VALUES (?, ?, (SELECT id FROM strytree_nodes WHERE id = ?
          AND visibility <> 'hidden' AND moderation_status <> 'rejected'), ?, ?, ?)`)
        .bind(buildId('unlock', [userId, nodeId]), userId, nodeId, ledgerEventId, key, nowIso),
      db.prepare(`UPDATE strytree_nodes SET paid_unlocks_count = paid_unlocks_count + 1,
        updated_at = ? WHERE id = ?`).bind(nowIso, nodeId),
      prepareAuditEvent(db, {
        actorUserId: userId, action: 'unlock', objectType: 'strytree_node', objectId: nodeId,
        status: 'succeeded', idempotencyKey: key,
        metadata: { ledger_event_id: ledgerEventId, price_credits: price }, nowIso,
      }),
      db.prepare(unlockCompletionSql).bind(userId, nodeId),
    ])
    if (results.length === 4 && results.every(result => result.success !== false)) {
      const completed = matches(results[3]?.results?.[0])
      if (completed) return completed
    }
  } catch { /* A native rollback or lost acknowledgement requires one exact stored read. */ }
  return matches(await queryFirst(db, unlockCompletionSql, [userId, nodeId]))
}

export const handleUnlockNode = async (
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
  const unavailable = () => errorJson(503, 'unlock_completion_unavailable', corsHeaders)
  const ledgerFailure = (error: unknown, price?: number) => {
    const reason = error instanceof Error ? error.message : ''
    if (reason === 'insufficient-balance') return errorJson(402, 'insufficient_balance', corsHeaders, { required_credits: price })
    if (['idempotency-conflict', 'ledger-effect-conflict', 'ledger-actor-user-conflict', 'unlock-key-conflict'].includes(reason)) {
      return errorJson(409, 'idempotency_conflict', corsHeaders)
    }
    return unavailable()
  }
  let replay: Awaited<ReturnType<typeof readUnlockReplay>>
  try { replay = await readUnlockReplay(db, env, { userId: user.userId, nodeId: node.id, idempotencyKey }) }
  catch (error) { return ledgerFailure(error) }
  const price = replay.found ? -replay.amountCredits : normalizeNumber(node.unlock_price_credits)
  if (!replay.found && (Number(node.is_free_window || 0) === 1 || price <= 0)) {
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
    const completed = unlockCompletion(await queryFirst(db, unlockCompletionSql, [user.userId, node.id]))
    if (!completed || completed.ledger_event_id !== existing.ledger_event_id
      || (replay.found && (completed.ledger_event_id !== replay.ledgerEventId
      || completed.idempotency_key !== replay.idempotencyKey))) return unavailable()
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
  if (typeof db.batch !== 'function') return unavailable()
  const nowIso = replay.found ? replay.createdAt : new Date().toISOString()
  const effectKey = replay.found ? replay.idempotencyKey : replay.scopedKey
  const ledgerEventId = replay.found ? replay.ledgerEventId : buildId('ledger_unlock', [user.userId, node.id, effectKey])
  const creatorCredit = replay.found ? replay.metadata.creator_credit_credits : Math.floor(price * 0.8)
  const platformFee = replay.found ? replay.metadata.platform_fee_credits : price - Number(creatorCredit)
  if (!Number.isSafeInteger(price) || price <= 0 || typeof creatorCredit !== 'number'
    || typeof platformFee !== 'number' || !Number.isSafeInteger(creatorCredit) || creatorCredit < 0
    || !Number.isSafeInteger(platformFee) || platformFee < 0 || creatorCredit + platformFee !== price) return unavailable()
  let ledgerMutation: Pick<Awaited<ReturnType<typeof writeLedgerEvent>>, 'ledgerEventId' | 'balanceAfterCredits'>
  try { ledgerMutation = replay.found ? replay : await writeLedgerEvent(db, env, {
    id: ledgerEventId,
    userId: user.userId,
    eventType: 'unlock_debit',
    amountCredits: -price,
    balanceAfterCredits: 0,
    relatedObjectType: 'strytree_node',
    relatedObjectId: node.id,
    idempotencyKey: effectKey,
    metadata: {
      creator_user_id: node.creator_user_id,
      creator_credit_credits: creatorCredit,
      platform_fee_credits: platformFee,
      unlock_client_key: idempotencyKey,
    },
    nowIso,
  }) } catch (error) { return ledgerFailure(error, price) }
  const completed = await finalizeUnlock(db, {
    userId: user.userId, nodeId: node.id, ledgerEventId: ledgerMutation.ledgerEventId,
    key: effectKey, price, nowIso,
  })
  if (!completed) return unavailable()
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
