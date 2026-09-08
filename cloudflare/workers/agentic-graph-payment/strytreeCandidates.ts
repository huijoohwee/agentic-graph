import { readBoundedJson } from './travelAgency/boundedJson'
import type { D1DatabaseLike } from '../shared/d1'
import type { StrytreeCandidateRunRow, StrytreeBranchCandidateRow, StrytreeNodeRow, StrytreeWorkerEnv, HeadersRecord } from './strytreeTypes'
import { queryFirst, queryAll, normalizeNumber, normalizeString, execute } from '../shared/d1'
import { buildId, CANDIDATE_CREDIT_COST, stableJson, canonicalRequest, asRecord, readRequestJson, errorJson, readIdempotencyKey, MAX_CANDIDATES, json, STRYTREE_API_VERSION } from './strytreeSupport'
import { requireUserContext, readStory, readNode, writeLedgerEvent, writeAuditEvent, prepareAuditEvent } from './strytreeData'

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
     ORDER BY created_at, id LIMIT 4`,
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

const CANDIDATE_COLUMNS = [
  'id', 'candidate_run_id', 'generation_job_id', 'user_id', 'story_id', 'parent_node_id',
  'provider', 'status', 'title', 'synopsis', 'prompt', 'video_object_key', 'thumbnail_object_key',
  'credit_cost', 'elapsed_ms', 'inherited_asset_count', 'continuity_score', 'moderation_status',
  'publish_eligible', 'result_json', 'token_cost_json', 'created_at', 'updated_at',
] as const
const MAX_INTENT_BYTES = 499_999

type CandidateIntent = {
  kind: 'strytree-candidate-intent'
  version: 1
  requestDigest: string
  candidatesDigest: string
  ledgerEventId: string
  candidates: StrytreeBranchCandidateRow[]
}

const boundedStoredJson = (value: string | null): unknown => {
  if (typeof value !== 'string' || value.length > MAX_INTENT_BYTES) return null
  if (new TextEncoder().encode(value).byteLength > MAX_INTENT_BYTES) return null
  try { return JSON.parse(value) } catch { return null }
}

const digestJson = async (value: unknown): Promise<string> => {
  const bytes = new TextEncoder().encode(canonicalRequest(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

const matchesRequest = (run: StrytreeCandidateRunRow, userId: string, key: string, identity: string): boolean => {
  const stored = asRecord(boundedStoredJson(run.request_json))
  if (!stored || run.user_id !== userId || run.idempotency_key !== key) return false
  try { return canonicalRequest({ ...stored, idempotency_key: key }) === identity } catch { return false }
}

const validRun = (run: StrytreeCandidateRunRow, payload: Record<string, unknown>, count: number): boolean =>
  run.story_id === normalizeString(payload.story_id) && run.parent_node_id === normalizeString(payload.parent_node_id) &&
  run.max_candidates === count && run.quoted_cost_credits === count * CANDIDATE_CREDIT_COST &&
  run.id === buildId('candrun', [run.user_id, run.parent_node_id, run.idempotency_key]) &&
  typeof run.created_at === 'string' && Number.isFinite(Date.parse(run.created_at))

const storedRequestDigest = async (run: StrytreeCandidateRunRow): Promise<string | null> => {
  const payload = asRecord(boundedStoredJson(run.request_json))
  const count = normalizeNumber(payload?.max_candidates, 1)
  if (!payload || !run.idempotency_key || run.idempotency_key.length > 512 || count < 1 || count > MAX_CANDIDATES ||
    !validRun(run, payload, count)) return null
  try { return await digestJson({ ...payload, idempotency_key: run.idempotency_key }) } catch { return null }
}

const readIntent = async (run: StrytreeCandidateRunRow, requestDigest: string): Promise<CandidateIntent | null> => {
  const intent = asRecord(boundedStoredJson(run.scorecard_json))
  if (!intent || intent.kind !== 'strytree-candidate-intent' || intent.version !== 1 ||
    intent.requestDigest !== requestDigest || typeof intent.candidatesDigest !== 'string' ||
    intent.ledgerEventId !== buildId('ledger_candrun', [run.user_id, run.id, run.idempotency_key]) ||
    !Array.isArray(intent.candidates) || intent.candidates.length !== run.max_candidates) return null
  for (const [index, value] of intent.candidates.entries()) {
    const candidate = asRecord(value)
    const ordinal = index + 1
    if (!candidate || Object.keys(candidate).length !== CANDIDATE_COLUMNS.length ||
      CANDIDATE_COLUMNS.some(column => !Object.hasOwn(candidate, column)) ||
      candidate.id !== buildId('cand', [run.id, ordinal]) || candidate.candidate_run_id !== run.id ||
      candidate.user_id !== run.user_id || candidate.story_id !== run.story_id || candidate.parent_node_id !== run.parent_node_id ||
      candidate.generation_job_id !== null || candidate.provider !== 'deterministic-fallback' || candidate.status !== 'succeeded' ||
      typeof candidate.title !== 'string' || typeof candidate.synopsis !== 'string' || typeof candidate.prompt !== 'string' ||
      candidate.video_object_key !== null || candidate.thumbnail_object_key !== null || candidate.credit_cost !== CANDIDATE_CREDIT_COST ||
      candidate.elapsed_ms !== 0 || candidate.inherited_asset_count !== 0 || candidate.continuity_score !== Math.min(0.95, 0.72 + ordinal * 0.05) ||
      candidate.moderation_status !== 'approved' || candidate.publish_eligible !== 1 ||
      candidate.created_at !== run.created_at || candidate.updated_at !== run.created_at ||
      candidate.result_json !== stableJson({ fallback: true, reason: 'provider_not_required_for_deterministic_validation', ordinal }) ||
      candidate.token_cost_json !== stableJson({ model: 'none', prompt_tokens: 0, completion_tokens: 0, estimated_cost_usd: 0 })) return null
  }
  if (new Set(intent.candidates.map(candidate => asRecord(candidate)?.id)).size !== run.max_candidates ||
    await digestJson(intent.candidates) !== intent.candidatesDigest) return null
  return intent as unknown as CandidateIntent
}

const completeResponse = async (
  db: D1DatabaseLike, run: StrytreeCandidateRunRow, requestDigest: string, corsHeaders: HeadersRecord, options: { created?: boolean; scorecards?: boolean } = {},
): Promise<Response> => {
  const unavailable = () => errorJson(503, 'candidate_reconciliation_required', corsHeaders, { candidate_run_id: run.id })
  if (run.status !== 'completed') return unavailable()
  const checkpoint = boundedStoredJson(run.scorecard_json)
  const legacyScorecards = Array.isArray(checkpoint) ? checkpoint : null
  const intent = legacyScorecards ? null : await readIntent(run, requestDigest)
  if (!legacyScorecards && !intent) return unavailable()
  const candidates = await readCandidatesForRun(db, run.id)
  if (candidates.length !== run.max_candidates || new Set(candidates.map(candidate => candidate.id)).size !== run.max_candidates) return unavailable()
  const expectedIds = new Set(Array.from({ length: run.max_candidates }, (_, index) => buildId('cand', [run.id, index + 1])))
  for (const candidate of candidates) {
    if (!expectedIds.has(candidate.id) || candidate.candidate_run_id !== run.id || candidate.user_id !== run.user_id ||
      candidate.story_id !== run.story_id || candidate.parent_node_id !== run.parent_node_id ||
      candidate.credit_cost !== CANDIDATE_CREDIT_COST || !['succeeded', 'published'].includes(candidate.status)) return unavailable()
    const original = intent?.candidates.find(row => row.id === candidate.id)
    if (original && CANDIDATE_COLUMNS.some(column => column !== 'status' && column !== 'updated_at' && candidate[column] !== original[column])) return unavailable()
    if (legacyScorecards) {
      const scorecard = legacyScorecards.find(value => asRecord(value)?.candidate_id === candidate.id)
      if (canonicalRequest(scorecard) !== canonicalRequest(mapCandidateScorecard({ ...candidate, status: 'succeeded' }))) return unavailable()
    }
  }
  if (legacyScorecards && legacyScorecards.length !== run.max_candidates) return unavailable()
  const ledgerEventId = buildId('ledger_candrun', [run.user_id, run.id, run.idempotency_key])
  const audit = await queryFirst(db, `SELECT a.*, l.user_id AS ledger_user_id, l.event_type AS ledger_event_type,
    l.amount_credits AS ledger_amount, l.related_object_type AS ledger_object_type, l.related_object_id AS ledger_object_id,
    l.idempotency_key AS ledger_key, l.provider_event_id AS ledger_provider_event, l.metadata_json AS ledger_metadata,
    l.created_at AS ledger_created_at, l.balance_after_credits AS ledger_balance
    FROM strytree_audit_events a JOIN strytree_token_ledger l ON l.id = ? WHERE a.id = ? LIMIT 1`,
    [ledgerEventId, buildId('audit', ['candidate_run', run.id, run.idempotency_key])])
  if (!audit || audit.actor_user_id !== run.user_id || audit.action !== 'candidate_run' || audit.object_type !== 'strytree_candidate_run' ||
    audit.object_id !== run.id || audit.status !== 'completed' || audit.idempotency_key !== run.idempotency_key || audit.created_at !== run.created_at ||
    canonicalRequest(boundedStoredJson(typeof audit.metadata_json === 'string' ? audit.metadata_json : null)) !==
      canonicalRequest({ quoted_cost_credits: run.quoted_cost_credits, ledger_event_id: ledgerEventId })) return unavailable()
  const ledgerMetadata = { max_candidates: run.max_candidates, parent_node_id: run.parent_node_id,
    ...(intent ? { request_digest: requestDigest } : {}) }
  if (audit.ledger_user_id !== run.user_id || audit.ledger_event_type !== 'candidate_run_debit' ||
    audit.ledger_amount !== -run.quoted_cost_credits || audit.ledger_object_type !== 'strytree_candidate_run' ||
    audit.ledger_object_id !== run.id || audit.ledger_key !== run.idempotency_key || audit.ledger_provider_event !== null ||
    audit.ledger_created_at !== run.created_at || typeof audit.ledger_balance !== 'number' ||
    !Number.isSafeInteger(audit.ledger_balance) || audit.ledger_balance < 0 ||
    canonicalRequest(boundedStoredJson(typeof audit.ledger_metadata === 'string' ? audit.ledger_metadata : null)) !== canonicalRequest(ledgerMetadata)) return unavailable()
  return json(options.created ? 202 : 200, { ok: true, apiVersion: STRYTREE_API_VERSION, candidate_run_id: run.id,
    status: run.status, max_candidates: run.max_candidates, quoted_cost_credits: run.quoted_cost_credits,
    ledger_event_id: ledgerEventId, ...(options.created || options.scorecards ? {} : { idempotent_replay: true }),
    ...(options.scorecards ? { parent_node_id: run.parent_node_id, scorecards: candidates.map(mapCandidateScorecard) } : {}) }, corsHeaders)
}

export const handleCreateCandidateRun = async (
  request: Request, env: StrytreeWorkerEnv, db: D1DatabaseLike, corsHeaders: HeadersRecord,
): Promise<Response> => {
  const user = await requireUserContext(request, db, corsHeaders)
  if (user instanceof Response) return user
  const payload = asRecord(await readBoundedJson(request, 32 * 1024))
  if (!payload) return errorJson(400, 'invalid_json_body', corsHeaders)
  const idempotencyKey = readIdempotencyKey(request, payload)
  if (!idempotencyKey) return errorJson(400, 'missing_idempotency_key', corsHeaders)
  if (idempotencyKey.length > 512) return errorJson(400, 'invalid_idempotency_key', corsHeaders)
  const maxCandidates = payload.max_candidates === undefined ? 1 : payload.max_candidates
  if (typeof maxCandidates !== 'number' || !Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > MAX_CANDIDATES) {
    return errorJson(400, 'candidate_bound_exceeded', corsHeaders, { max_candidates: MAX_CANDIDATES })
  }
  let identity: string
  let requestDigest: string
  try {
    const normalized = { ...payload, idempotency_key: idempotencyKey }
    identity = canonicalRequest(normalized)
    requestDigest = await digestJson(normalized)
  } catch { return errorJson(400, 'invalid_json_body', corsHeaders) }
  let run: StrytreeCandidateRunRow | null = null
  const unavailable = () => errorJson(503, 'candidate_creation_unavailable', corsHeaders,
    run ? { candidate_run_id: run.id, retryable: true } : { retryable: true })
  try {
    run = await readCandidateRunByIdempotency(db, user.userId, idempotencyKey)
    if (run && !matchesRequest(run, user.userId, idempotencyKey, identity)) return errorJson(409, 'idempotency_conflict', corsHeaders)
    if (run && !validRun(run, payload, maxCandidates)) return errorJson(503, 'candidate_reconciliation_required', corsHeaders)
    if (run?.status === 'completed') return await completeResponse(db, run, requestDigest, corsHeaders)
    // A native transaction is required before admitting an intent or a debit.
    if (typeof db.batch !== 'function') return errorJson(503, 'candidate_batch_unavailable', corsHeaders)
    if (!run) {
      const storyId = normalizeString(payload.story_id)
      const parentNodeId = normalizeString(payload.parent_node_id)
      if (!storyId || !parentNodeId) return errorJson(400, 'missing_story_or_parent_node', corsHeaders)
      const story = await readStory(db, storyId)
      const parentNode = await readNode(db, parentNodeId)
      if (!story || !parentNode || parentNode.story_id !== story.id) return errorJson(404, 'parent_node_not_found', corsHeaders)
      if (parentNode.status === 'dropped' || parentNode.moderation_status === 'rejected') return errorJson(409, 'parent_node_not_extendable', corsHeaders)
      const nowIso = new Date().toISOString()
      const runId = buildId('candrun', [user.userId, parentNode.id, idempotencyKey])
      const candidates = createDeterministicCandidates({ runId, userId: user.userId, storyId: story.id,
        parentNode, prompt: normalizeString(payload.prompt), maxCandidates, nowIso })
      const intent: CandidateIntent = { kind: 'strytree-candidate-intent', version: 1, requestDigest,
        candidatesDigest: await digestJson(candidates),
        ledgerEventId: buildId('ledger_candrun', [user.userId, runId, idempotencyKey]), candidates }
      const checkpoint = stableJson(intent)
      if (checkpoint.length > MAX_INTENT_BYTES || new TextEncoder().encode(checkpoint).byteLength > MAX_INTENT_BYTES) {
        return errorJson(413, 'candidate_intent_too_large', corsHeaders)
      }
      // Global key and generated-ID conflicts never authorize another user's debit.
      await execute(db, `INSERT INTO strytree_candidate_runs (
        id, user_id, story_id, parent_node_id, status, max_candidates, quoted_cost_credits,
        idempotency_key, request_json, scorecard_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'preparing', ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      [runId, user.userId, story.id, parentNode.id, maxCandidates, maxCandidates * CANDIDATE_CREDIT_COST,
        idempotencyKey, stableJson(payload), checkpoint, nowIso, nowIso])
      run = await readCandidateRunByIdempotency(db, user.userId, idempotencyKey)
      if (!run || !matchesRequest(run, user.userId, idempotencyKey, identity)) return errorJson(409, 'idempotency_conflict', corsHeaders)
      if (!validRun(run, payload, maxCandidates)) return errorJson(503, 'candidate_reconciliation_required', corsHeaders)
      if (run.status === 'completed') return await completeResponse(db, run, requestDigest, corsHeaders)
    }
    const intent = await readIntent(run, requestDigest)
    if (run.status !== 'preparing' || !intent) return errorJson(503, 'candidate_reconciliation_required', corsHeaders, { candidate_run_id: run.id })
    try {
      // The actor owns balance and replay; a stale D1 balance must not reject recovery.
      await writeLedgerEvent(db, env, { id: intent.ledgerEventId, userId: run.user_id,
        eventType: 'candidate_run_debit', amountCredits: -run.quoted_cost_credits, balanceAfterCredits: 0,
        relatedObjectType: 'strytree_candidate_run', relatedObjectId: run.id, idempotencyKey: run.idempotency_key,
        metadata: { max_candidates: run.max_candidates, parent_node_id: run.parent_node_id, request_digest: requestDigest }, nowIso: run.created_at })
    } catch (error) {
      const reason = error instanceof Error ? error.message : ''
      if (reason === 'insufficient-balance') return errorJson(402, 'insufficient_balance', corsHeaders, { required_credits: run.quoted_cost_credits })
      if (['idempotency-conflict', 'ledger-effect-conflict', 'ledger-actor-user-conflict'].includes(reason)) {
        return errorJson(409, 'idempotency_conflict', corsHeaders)
      }
      return unavailable()
    }
    const guard = `id = ? AND user_id = ? AND status = 'preparing' AND request_json = ? AND scorecard_json = ?
      AND story_id = ? AND parent_node_id = ? AND max_candidates = ? AND quoted_cost_credits = ?
      AND idempotency_key = ? AND created_at = ? AND updated_at = ?`
    const guardValues = [run.id, run.user_id, run.request_json, run.scorecard_json, run.story_id, run.parent_node_id,
      run.max_candidates, run.quoted_cost_credits, run.idempotency_key, run.created_at, run.updated_at]
    const statements = intent.candidates.map(candidate => db.prepare(`INSERT INTO strytree_branch_candidates (
      ${CANDIDATE_COLUMNS.join(', ')}
    ) SELECT ${CANDIDATE_COLUMNS.map(() => '?').join(', ')}
      WHERE EXISTS (SELECT 1 FROM strytree_candidate_runs WHERE ${guard})`)
      .bind(...CANDIDATE_COLUMNS.map(column => candidate[column]), ...guardValues))
    statements.push(prepareAuditEvent(db, { actorUserId: run.user_id, action: 'candidate_run', objectType: 'strytree_candidate_run',
      objectId: run.id, status: 'completed', idempotencyKey: run.idempotency_key,
      metadata: { quoted_cost_credits: run.quoted_cost_credits, ledger_event_id: intent.ledgerEventId }, nowIso: run.created_at,
      when: { sql: `EXISTS (SELECT 1 FROM strytree_candidate_runs WHERE ${guard})`, values: guardValues } }))
    statements.push(db.prepare(`UPDATE strytree_candidate_runs SET status = 'completed', updated_at = ? WHERE ${guard} RETURNING id`)
      .bind(run.created_at, ...guardValues))
    let completedHere = false
    try {
      const results = await db.batch(statements)
      const last = results[results.length - 1]
      completedHere = Array.isArray(last?.results) && last.results.some(value => asRecord(value)?.id === run?.id)
    } catch {
      // A lost acknowledgement can follow a committed native batch; observe once.
    }
    const current = await readCandidateRunByIdempotency(db, user.userId, idempotencyKey)
    if (!current || !matchesRequest(current, user.userId, idempotencyKey, identity)) return errorJson(409, 'idempotency_conflict', corsHeaders)
    if (!validRun(current, payload, maxCandidates) || current.status !== 'completed') return unavailable()
    return await completeResponse(db, current, requestDigest, corsHeaders, { created: completedHere })
  } catch { return unavailable() }
}

export const handleGetCandidateRun = async (
  request: Request, db: D1DatabaseLike, corsHeaders: HeadersRecord, candidateRunId: string,
): Promise<Response> => {
  const user = await requireUserContext(request, db, corsHeaders)
  if (user instanceof Response) return user
  try {
    const run = await readCandidateRun(db, candidateRunId, user.userId)
    if (!run) return errorJson(404, 'candidate_run_not_found', corsHeaders)
    const invalid = () => errorJson(503, 'candidate_reconciliation_required', corsHeaders, { candidate_run_id: run.id })
    const requestDigest = await storedRequestDigest(run)
    if (!requestDigest) return invalid()
    if (run.status === 'preparing') {
      if (!await readIntent(run, requestDigest)) return invalid()
      return json(200, { ok: true, apiVersion: STRYTREE_API_VERSION, candidate_run_id: run.id, status: run.status,
        parent_node_id: run.parent_node_id, max_candidates: run.max_candidates,
        quoted_cost_credits: run.quoted_cost_credits, scorecards: [] }, corsHeaders)
    }
    return await completeResponse(db, run, requestDigest, corsHeaders, { scorecards: true })
  } catch { return errorJson(503, 'candidate_read_unavailable', corsHeaders, { retryable: true }) }
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

const CANDIDATE_PUBLICATION_SQL = `SELECT p.*, n.id AS committed_node_id, c.status AS candidate_status,
  a.id AS publication_audit_id, a.metadata_json AS publication_audit_metadata
  FROM strytree_candidate_merge_plans p
  LEFT JOIN strytree_nodes n ON n.id = p.published_node_id AND n.selected_candidate_id = p.selected_candidate_id
    AND n.creator_user_id = p.user_id AND n.story_id = p.story_id AND n.parent_node_id = p.parent_node_id
    AND n.status = 'active' AND n.visibility = 'public' AND n.moderation_status = 'approved'
    AND NOT EXISTS (SELECT 1 FROM strytree_nodes other WHERE other.selected_candidate_id = p.selected_candidate_id AND other.id <> n.id)
    AND NOT EXISTS (SELECT 1 FROM strytree_candidate_merge_plans other WHERE other.selected_candidate_id = p.selected_candidate_id AND other.id <> p.id)
  LEFT JOIN strytree_branch_candidates c ON c.id = p.selected_candidate_id AND c.user_id = p.user_id
    AND c.story_id = p.story_id AND c.parent_node_id = p.parent_node_id AND c.status = 'published'
  LEFT JOIN strytree_audit_events a ON a.actor_user_id = p.user_id AND a.action = 'candidate_publish'
    AND a.object_type = 'strytree_branch_candidate' AND a.object_id = p.selected_candidate_id
    AND a.status = 'published' AND a.idempotency_key = p.idempotency_key AND a.created_at = p.created_at
  WHERE p.selected_candidate_id = ? LIMIT 1`
const readMergePlanForCandidate = (db: D1DatabaseLike, candidateId: string): Promise<Record<string, unknown> | null> =>
  queryFirst<Record<string, unknown>>(db, CANDIDATE_PUBLICATION_SQL, [candidateId])

const readUnrecordedPublication = (db: D1DatabaseLike, candidateId: string) => queryFirst(db,
  `SELECT id FROM strytree_nodes WHERE selected_candidate_id = ?
   UNION ALL SELECT id FROM strytree_audit_events
     WHERE action = 'candidate_publish' AND object_type = 'strytree_branch_candidate' AND object_id = ? LIMIT 1`,
  [candidateId, candidateId])

export const handlePublishCandidate = async (
  request: Request,
  db: D1DatabaseLike,
  corsHeaders: HeadersRecord,
  candidateId: string,
): Promise<Response> => {
  const user = await requireUserContext(request, db, corsHeaders)
  if (user instanceof Response) return user
  const payload = asRecord(await readBoundedJson(request, 32 * 1024))
  if (!payload) return errorJson(400, 'invalid_json_body', corsHeaders)
  const idempotencyKey = readIdempotencyKey(request, payload)
  if (!idempotencyKey) return errorJson(400, 'missing_idempotency_key', corsHeaders)
  if (idempotencyKey.length > 512) return errorJson(400, 'invalid_idempotency_key', corsHeaders)
  const candidate = await readCandidate(db, candidateId, user.userId)
  if (!candidate) return errorJson(404, 'candidate_run_not_found', corsHeaders)
  const run = await readCandidateRun(db, candidate.candidate_run_id, user.userId)
  if (!run || run.status !== 'completed') return errorJson(503, 'candidate_reconciliation_required', corsHeaders)
  const requestDigest = await storedRequestDigest(run)
  if (!requestDigest) return errorJson(503, 'candidate_reconciliation_required', corsHeaders)
  const completion = await completeResponse(db, run, requestDigest, corsHeaders)
  if (completion.status !== 200) return completion
  const intent = { title: normalizeString(payload.title), synopsis: normalizeString(payload.synopsis),
    merge_notes: normalizeString(payload.merge_notes) }
  const reply = (plan: Record<string, unknown> | null, replay: boolean): Response => {
    if (!plan || typeof plan.published_node_id !== 'string' || !plan.published_node_id
      || typeof plan.parent_node_id !== 'string' || plan.status !== 'published') {
      return errorJson(503, 'candidate_publish_reconciliation_required', corsHeaders)
    }
    if (plan.user_id !== user.userId || plan.selected_candidate_id !== candidate.id || plan.idempotency_key !== idempotencyKey) {
      return errorJson(409, 'idempotency_conflict', corsHeaders)
    }
    const auditMetadata = boundedStoredJson(typeof plan.publication_audit_metadata === 'string' ? plan.publication_audit_metadata : null)
    if (plan.committed_node_id !== plan.published_node_id || plan.candidate_status !== 'published'
      || typeof plan.idempotency_key !== 'string'
      || plan.publication_audit_id !== buildId('audit', ['candidate_publish', candidate.id, plan.idempotency_key])
      || canonicalRequest(auditMetadata) !== canonicalRequest({ published_node_id: plan.published_node_id })) {
      return errorJson(503, 'candidate_publish_reconciliation_required', corsHeaders)
    }
    const merge = asRecord(boundedStoredJson(typeof plan.merge_json === 'string' ? plan.merge_json : null))
    if (!merge || typeof merge.title !== 'string' || typeof merge.synopsis !== 'string' || typeof merge.merge_notes !== 'string') return errorJson(409, 'idempotency_conflict', corsHeaders)
    const storedIntent = asRecord(merge.request)
    const equivalent = 'request' in merge ? storedIntent && canonicalRequest(storedIntent) === canonicalRequest(intent)
      : (!intent.title || intent.title === merge.title) && (!intent.synopsis || intent.synopsis === merge.synopsis)
        && intent.merge_notes === normalizeString(merge.merge_notes)
    if (!equivalent) return errorJson(409, 'idempotency_conflict', corsHeaders)
    return json(200, {
      ok: true, apiVersion: STRYTREE_API_VERSION, published_node_id: plan.published_node_id,
      parent_node_id: plan.parent_node_id, selected_candidate_id: candidate.id,
      ...(typeof merge.snapshot_version === 'number' ? { snapshot_version: merge.snapshot_version } : {}),
      ...(replay ? { idempotent_replay: true } : {}),
    }, corsHeaders)
  }
  const existing = await readMergePlanForCandidate(db, candidate.id)
  const keyOwner = await queryFirst<{ user_id: string; selected_candidate_id: string }>(db,
    'SELECT user_id, selected_candidate_id FROM strytree_candidate_merge_plans WHERE idempotency_key = ? LIMIT 1', [idempotencyKey])
  if (keyOwner && (keyOwner.user_id !== user.userId || keyOwner.selected_candidate_id !== candidate.id)) {
    return errorJson(409, 'idempotency_conflict', corsHeaders)
  }
  if (existing) return reply(existing, true)
  if (await readUnrecordedPublication(db, candidate.id)) {
    const committed = await readMergePlanForCandidate(db, candidate.id)
    return committed ? reply(committed, true) : errorJson(503, 'candidate_publish_reconciliation_required', corsHeaders)
  }
  if (Number(candidate.publish_eligible) !== 1 || candidate.moderation_status !== 'approved' || candidate.status !== 'succeeded') {
    return errorJson(409, 'candidate_not_publishable', corsHeaders)
  }
  const [parentNode, story] = await Promise.all([readNode(db, candidate.parent_node_id), readStory(db, candidate.story_id)])
  if (!parentNode || !story || parentNode.story_id !== story.id) return errorJson(404, 'parent_node_not_found', corsHeaders)
  if (parentNode.status === 'dropped' || parentNode.moderation_status === 'rejected') {
    return errorJson(409, 'parent_node_not_extendable', corsHeaders)
  }
  if (typeof db.batch !== 'function') return errorJson(503, 'candidate_publish_unavailable', corsHeaders)
  const nowIso = new Date().toISOString()
  // One immutable node/plan identity per candidate; request keys cannot create a second winner.
  const publishedNodeId = buildId('node', [candidate.id]), mergeId = buildId('merge', [candidate.id])
  const title = intent.title || candidate.title || `Continuation of ${parentNode.title}`
  const synopsis = intent.synopsis || candidate.synopsis || parentNode.synopsis
  try {
    const results = await db.batch([
      db.prepare(`INSERT INTO strytree_nodes (
        id, story_id, parent_node_id, selected_candidate_id, creator_user_id, title, synopsis, prompt,
        status, visibility, is_free_window, unlock_price_credits, video_object_key, thumbnail_object_key,
        age_days, likes_count, impressions_count, paid_unlocks_count, moderation_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, (
        SELECT c.user_id FROM strytree_branch_candidates c
        JOIN strytree_nodes p ON p.id = c.parent_node_id AND p.story_id = c.story_id
        JOIN strytree_stories s ON s.id = c.story_id
        JOIN strytree_candidate_runs r ON r.id = c.candidate_run_id AND r.user_id = c.user_id
          AND r.story_id = c.story_id AND r.parent_node_id = c.parent_node_id AND r.status = 'completed'
        WHERE c.id = ? AND c.user_id = ? AND c.story_id = ? AND c.parent_node_id = ?
          AND r.id = ? AND r.request_json = ? AND r.scorecard_json = ? AND r.max_candidates = ?
          AND r.quoted_cost_credits = ? AND r.idempotency_key = ? AND r.created_at = ? AND r.updated_at = ?
          AND c.status = 'succeeded' AND c.publish_eligible = 1 AND c.moderation_status = 'approved'
          AND p.status <> 'dropped' AND p.moderation_status <> 'rejected'
          AND NOT EXISTS (SELECT 1 FROM strytree_candidate_merge_plans WHERE selected_candidate_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM strytree_nodes WHERE selected_candidate_id = c.id)
          AND NOT EXISTS (SELECT 1 FROM strytree_audit_events
            WHERE action = 'candidate_publish' AND object_type = 'strytree_branch_candidate' AND object_id = c.id)
      ), ?, ?, ?, 'active', 'public', 1, 0, ?, ?, 0, 0, 0, 0, 'approved', ?, ?)`)
        .bind(publishedNodeId, story.id, parentNode.id, candidate.id,
          candidate.id, user.userId, story.id, parentNode.id, run.id, run.request_json, run.scorecard_json,
          run.max_candidates, run.quoted_cost_credits, run.idempotency_key, run.created_at, run.updated_at,
          title, synopsis, candidate.prompt,
          candidate.video_object_key, candidate.thumbnail_object_key, nowIso, nowIso),
      db.prepare(`INSERT INTO strytree_candidate_merge_plans (
        id, user_id, story_id, parent_node_id, selected_candidate_id, status, merge_json,
        published_node_id, idempotency_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'published', json_set(?, '$.snapshot_version',
        (SELECT snapshot_version + 1 FROM strytree_stories WHERE id = ?)), ?, ?, ?, ?)`)
        .bind(mergeId, user.userId, story.id, parentNode.id, candidate.id,
          stableJson({ title, synopsis, merge_notes: intent.merge_notes, request: intent }), story.id,
          publishedNodeId, idempotencyKey, nowIso, nowIso),
      db.prepare('UPDATE strytree_branch_candidates SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?')
        .bind('published', nowIso, candidate.id, user.userId),
      db.prepare('UPDATE strytree_stories SET snapshot_version = snapshot_version + 1, updated_at = ? WHERE id = ?')
        .bind(nowIso, story.id),
      prepareAuditEvent(db, { actorUserId: user.userId, action: 'candidate_publish', objectType: 'strytree_branch_candidate',
        objectId: candidate.id, status: 'published', idempotencyKey, metadata: { published_node_id: publishedNodeId }, nowIso }),
      db.prepare(CANDIDATE_PUBLICATION_SQL).bind(candidate.id),
    ])
    const winner = asRecord(results[results.length - 1]?.results?.[0])
    return reply(winner || await readMergePlanForCandidate(db, candidate.id), false)
  } catch {
    // A failed D1 batch rolls back every publication effect. A concurrent winner
    // is authoritative only after its committed identity has been read again.
    const winner = await readMergePlanForCandidate(db, candidate.id)
    const collision = await queryFirst<{ user_id: string; selected_candidate_id: string }>(db,
      'SELECT user_id, selected_candidate_id FROM strytree_candidate_merge_plans WHERE idempotency_key = ? LIMIT 1', [idempotencyKey])
    if (collision && (collision.user_id !== user.userId || collision.selected_candidate_id !== candidate.id)) {
      return errorJson(409, 'idempotency_conflict', corsHeaders)
    }
    if (winner) return reply(winner, true)
    if (await readUnrecordedPublication(db, candidate.id)) {
      const committed = await readMergePlanForCandidate(db, candidate.id)
      return committed ? reply(committed, true) : errorJson(503, 'candidate_publish_reconciliation_required', corsHeaders)
    }
    const latest = await readCandidate(db, candidate.id, user.userId)
    if (!latest) return errorJson(404, 'candidate_run_not_found', corsHeaders)
    if (latest.status === 'published') return reply(await readMergePlanForCandidate(db, candidate.id), true)
    if (Number(latest.publish_eligible) !== 1 || latest.moderation_status !== 'approved' || latest.status !== 'succeeded') {
      return errorJson(409, 'candidate_not_publishable', corsHeaders)
    }
    const latestParent = await readNode(db, latest.parent_node_id)
    if (!latestParent || latestParent.status === 'dropped' || latestParent.moderation_status === 'rejected') {
      return errorJson(409, 'parent_node_not_extendable', corsHeaders)
    }
    return errorJson(503, 'candidate_publish_unavailable', corsHeaders)
  }
}
