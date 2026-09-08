import { acquireGenerationClaim, GenerationClaimError, type GenerationClaim } from './strytreeGenerationDispatch'
import { runExternalVideoProviderIfConfigured } from './strytreeGenerationProvider'
import type { StrytreeWorkerEnv, StrytreeGenerationJobRow, HeadersRecord, QueueLike, ExternalVideoProviderResult, R2BucketLike, StrytreeGenerationQueueMessage } from './strytreeTypes'
import { canonicalRequest, asRecord, parseJsonRecord, GENERATION_CREDIT_COST, readRequestJson, errorJson, readIdempotencyKey, assertProviderBudgetAllowsGeneration, buildId, json, STRYTREE_API_VERSION, stableJson, StrytreeProviderError } from './strytreeSupport'
import { normalizeString, execute, queryFirst } from '../shared/d1'
import type { D1DatabaseLike } from '../shared/d1'
import { requireUserContext, readStory, readNode, readGenerationJob, readBalance, writeLedgerEvent, writeAuditEvent, readGenerationJobById } from './strytreeData'

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

const enqueueGenerationJob = async (db: D1DatabaseLike, queue: QueueLike, id: string): Promise<void> => {
  const send = queue.send
  if (typeof send !== 'function') throw new Error('generation_queue_unavailable')
  const current = await readGenerationJobById(db, id)
  if (!current || current.status !== 'queued') return
  const previous = asRecord(parseJsonRecord(current.result_json).enqueue)
  if (previous?.accepted === true || (typeof previous?.expiresAtMs === 'number' && previous.expiresAtMs > Date.now())) return
  const checkpoint = stableJson({ enqueue: { token: crypto.randomUUID(), expiresAtMs: Date.now() + 120_000 } })
  const admitted = await queryFirst(db, `UPDATE strytree_generation_jobs SET result_json = ?
    WHERE id = ? AND status = 'queued' AND debit_ledger_event_id IS NOT NULL AND result_json IS ? RETURNING id`,
  [checkpoint, id, current.result_json])
  if (!admitted) return
  try {
    await send.call(queue, { type: 'strytree.generation_job.created', job_id: id })
  } catch (error) {
    await execute(db, `UPDATE strytree_generation_jobs SET result_json = NULL
      WHERE id = ? AND status = 'queued' AND result_json = ?`, [id, checkpoint])
    throw error
  }
  await execute(db, `UPDATE strytree_generation_jobs SET result_json = ?
    WHERE id = ? AND status = 'queued' AND result_json = ?`,
  [stableJson({ enqueue: { accepted: true } }), id, checkpoint])
}

export const handleCreateGenerationJob = async (
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
  const jobId = buildId('gen', [user.userId, parentNode.id, idempotencyKey])
  const requestJson = canonicalRequest({ ...payload, idempotency_key: idempotencyKey,
    quoted_cost_credits: GENERATION_CREDIT_COST })
  let job = await readGenerationJob(db, jobId, user.userId)
  const existed = Boolean(job)
  const replay = (row: StrytreeGenerationJobRow) => json(200, { ok: true,
    apiVersion: STRYTREE_API_VERSION, ...mapGenerationJobResponse(row), idempotent_replay: true }, corsHeaders)
  if (job && canonicalRequest(parseJsonRecord(job.request_json)) !== requestJson) {
    return errorJson(409, 'idempotency_conflict', corsHeaders)
  }
  if (job && job.status !== 'queued') return replay(job)
  const queue = env.STRYTREE_GENERATION_QUEUE as QueueLike | undefined
  if (typeof queue?.send !== 'function') return errorJson(503, 'generation_queue_unavailable', corsHeaders)
  const budgetError = await assertProviderBudgetAllowsGeneration(env, corsHeaders)
  if (budgetError) return budgetError
  if (!job) {
    const nowIso = new Date().toISOString()
    // The intent precedes the financial effect, so a failed projection can be retried safely.
    await execute(db, `INSERT INTO strytree_generation_jobs (
      id, user_id, story_id, parent_node_id, status, provider, request_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'queued', 'external_video_provider', ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
    [jobId, user.userId, story.id, parentNode.id, requestJson, nowIso, nowIso])
    job = await readGenerationJob(db, jobId, user.userId)
    if (!job) throw new Error('generation_intent_missing')
    if (canonicalRequest(parseJsonRecord(job.request_json)) !== requestJson) {
      return errorJson(409, 'idempotency_conflict', corsHeaders)
    }
    if (job.status !== 'queued') return replay(job)
  }
  const ledgerEventId = buildId('ledger_generation', [user.userId, job.id, idempotencyKey])
  if (!job.debit_ledger_event_id) {
    const balance = await readBalance(db, user.userId)
    try {
      await writeLedgerEvent(db, env, {
        id: ledgerEventId, userId: user.userId, eventType: 'generation_debit',
        amountCredits: -GENERATION_CREDIT_COST, balanceAfterCredits: balance - GENERATION_CREDIT_COST,
        relatedObjectType: 'strytree_generation_job', relatedObjectId: job.id, idempotencyKey,
        metadata: { story_id: story.id, parent_node_id: parentNode.id, provider: 'external_video_provider' },
        nowIso: job.created_at,
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'insufficient-balance') {
        return errorJson(402, 'insufficient_balance', corsHeaders, { job_id: job.id,
          balance_credits: await readBalance(db, user.userId), required_credits: GENERATION_CREDIT_COST })
      }
      if (error instanceof Error && ['idempotency-conflict', 'ledger-effect-conflict'].includes(error.message)) {
        return errorJson(409, 'idempotency_conflict', corsHeaders)
      }
      throw error
    }
    await execute(db, `UPDATE strytree_generation_jobs SET debit_ledger_event_id = ?
      WHERE id = ? AND debit_ledger_event_id IS NULL`, [ledgerEventId, job.id])
    job = { ...job, debit_ledger_event_id: ledgerEventId }
  }
  await writeAuditEvent(db, {
    actorUserId: user.userId, action: 'generation_job_create', objectType: 'strytree_generation_job',
    objectId: job.id, status: 'queued', idempotencyKey, replaySafe: true,
    metadata: { debit_ledger_event_id: job.debit_ledger_event_id, quoted_cost_credits: GENERATION_CREDIT_COST },
    nowIso: job.created_at,
  })
  try {
    // A send rejection is ambiguous. Retain the intent; consumer ownership makes redelivery safe.
    await enqueueGenerationJob(db, queue, job.id)
  } catch {
    return errorJson(503, 'generation_queue_unavailable', corsHeaders, { job_id: job.id, retryable: true })
  }
  if (existed) return replay(await readGenerationJob(db, job.id, user.userId) || job)
  return json(202, { ok: true, apiVersion: STRYTREE_API_VERSION, job_id: job.id, status: 'queued',
    quoted_cost_credits: GENERATION_CREDIT_COST, ledger_event_id: job.debit_ledger_event_id,
    ledger_authority: 'durable-object' }, corsHeaders)
}

export const handleGetGenerationJob = async (
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

const completeGenerationJobSuccess = async (
  db: D1DatabaseLike,
  env: StrytreeWorkerEnv,
  job: StrytreeGenerationJobRow,
  nowIso: string,
  providerResult: ExternalVideoProviderResult | null,
  claim: GenerationClaim,
): Promise<void> => {
  const videoObjectKey = `strytree/generation/${job.id}/video.json`
  const thumbnailObjectKey = `strytree/generation/${job.id}/thumbnail.json`
  if (!claim.finalization) {
    const requestPayload = parseJsonRecord(job.request_json)
    const artifact = stableJson({
      job_id: job.id, provider: 'external_video_provider', provider_job_id: providerResult?.videoId || null,
      prompt: normalizeString(requestPayload.prompt), generated_at: new Date().toISOString(),
      mode: providerResult ? 'external-video-provider-live-poll' : 'server-side-provider-safe-artifact',
      source_url: providerResult?.videoUrl || null, external_provider_status: providerResult?.status || null,
      elapsed_ms: providerResult ? Math.max(0, providerResult.completedAtMs - providerResult.submittedAtMs) : 0,
      provider_response: providerResult?.responseJson || null,
    })
    await claim.prepareFinalization({ mode: providerResult ? 'provider' : 'local', artifact,
      providerJobId: providerResult?.videoId || buildId('pv', [job.id]),
      resultJson: stableJson({ video_object_key: videoObjectKey, thumbnail_object_key: thumbnailObjectKey,
        preview_url: `/api/strytree/media/${encodeURIComponent(videoObjectKey)}`,
        provider_url: providerResult?.videoUrl || null, provider_status: providerResult?.status || null }),
    })
  }
  const intent = claim.finalization!
  const bucket = env.STRYTREE_MEDIA_BUCKET as R2BucketLike | undefined
  if (typeof bucket?.put !== 'function') throw new Error('missing Strytree R2 media bucket binding')
  await claim.assertOwned()
  await bucket.put(videoObjectKey, intent.artifact, { httpMetadata: { contentType: 'application/json; charset=utf-8' } })
  await claim.assertOwned()
  await bucket.put(thumbnailObjectKey, intent.artifact, { httpMetadata: { contentType: 'application/json; charset=utf-8' } })
  await claim.assertOwned()
  await writeAuditEvent(db, {
    actorUserId: job.user_id, action: 'generation_job_complete', idempotencyKey: `${job.id}:complete`, replaySafe: true,
    objectType: 'strytree_generation_job', objectId: job.id, status: 'succeeded',
    metadata: { video_object_key: videoObjectKey, thumbnail_object_key: thumbnailObjectKey,
      provider_job_id: intent.mode === 'provider' ? intent.providerJobId : null,
      mode: intent.mode === 'provider' ? 'external-video-provider-live-poll' : 'server-side-provider-safe-artifact' },
    nowIso,
  })
  await claim.finish('status = ?, provider_job_id = ?, result_json = ?, error_code = ?, error_message = ?, updated_at = ?',
    ['succeeded', intent.providerJobId, intent.resultJson, null, null, new Date().toISOString()])
}

const completeGenerationJobFailure = async (
  db: D1DatabaseLike,
  env: StrytreeWorkerEnv,
  job: StrytreeGenerationJobRow,
  nowIso: string,
  errorCode = 'provider_unavailable',
  errorMessage = 'Strytree provider simulation failed before artifact write.',
  claim: GenerationClaim,
): Promise<void> => {
  await claim.beginRefund(errorCode, errorMessage)
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
  await writeAuditEvent(db, {
    actorUserId: job.user_id,
    action: 'generation_job_refund', idempotencyKey: `${job.id}:refund`, replaySafe: true,
    objectType: 'strytree_generation_job',
    objectId: job.id,
    status: 'failed',
    metadata: { refund_ledger_event_id: ledgerMutation.ledgerEventId, error_code: errorCode },
    nowIso,
  })
  await claim.finish(
    `status = ?, refund_ledger_event_id = ?, fallback_artifact_json = ?,
       error_code = ?, error_message = ?, updated_at = ?
     `,
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
    ],
  )

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
  const observed = await readGenerationJobById(db, jobId)
  if (!observed) throw new Error(`Strytree generation job not found: ${jobId}`)
  const claim = await acquireGenerationClaim(db, observed)
  if (!claim) return 'processed'
  const job = claim.job
  const nowIso = job.created_at
  const requestPayload = parseJsonRecord(job.request_json)
  if (job.status === 'refunding') {
    await completeGenerationJobFailure(db, env, job, nowIso, job.error_code!, job.error_message!, claim)
    return 'processed'
  }
  const shouldFail = !claim.finalization && !job.provider_job_id && (requestPayload.simulate_provider_failure === true ||
    normalizeString(env.STRYTREE_PROVIDER_MODE).toLowerCase() === 'fail')
  if (shouldFail) {
    await completeGenerationJobFailure(db, env, job, nowIso, 'provider_unavailable',
      'Strytree provider simulation failed before artifact write.', claim)
    return 'processed'
  }
  let providerResult: ExternalVideoProviderResult | null = null
  try {
    if (!claim.finalization) providerResult = await runExternalVideoProviderIfConfigured(env, job, requestPayload, claim)
  } catch (err) {
    if (err instanceof GenerationClaimError) throw err
    const messageText = err instanceof Error ? err.message : 'Strytree generation artifact write failed.'
    const code = err instanceof StrytreeProviderError ? err.code : 'artifact_write_failed'
    if (claim.job.provider_job_id && code !== 'external_video_provider_generation_failed') {
      return claim.requireReconciliation('Provider result is pending; resume the recorded job without resubmitting.')
    }
    await completeGenerationJobFailure(db, env, job, nowIso, code, messageText, claim)
    return 'processed'
  }
  try {
    await completeGenerationJobSuccess(db, env, job, nowIso, providerResult, claim)
  } catch (err) {
    if (err instanceof GenerationClaimError) throw err
    return claim.requireReconciliation('Artifact finalization is incomplete; retain the debit and recorded provider job.')
  }
  return 'processed'
}
