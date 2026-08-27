import {
  compileResearchThesisSpec,
  buildResearchThesisReviewAudit,
  preflightResearchThesisCompileRequest,
  sha256TextHash,
  type ResearchThesisCompileRequest,
  type ResearchThesisCandidateGraphDelta,
  type ResearchThesisCostLog,
  type ResearchThesisEvidenceLedgerRow,
  type ResearchThesisReviewAudit,
  type ResearchThesisRunManifest,
  type ResearchThesisSourceSummary,
  type ResearchThesisSpec,
} from '../../../canvas/src/features/research-agent/researchThesisContract'

type ResearchWorkerArtifactKind =
  | 'manifest'
  | 'source_summaries'
  | 'thesis_spec'
  | 'evidence_ledger'
  | 'candidate_delta'
  | 'cost_log'
  | 'review_audit'

type ResearchWorkerArtifactPointer = {
  kind: ResearchWorkerArtifactKind
  key: string
  storage: 'r2' | 'local-dev'
}

type ResearchWorkerRunRow = {
  runId: string
  status: 'queued' | 'ready' | 'failed' | 'committed'
  manifest: ResearchThesisRunManifest
  sourceSummaries?: ResearchThesisSourceSummary[] | null
  spec?: ResearchThesisSpec | null
  evidenceLedger?: ResearchThesisEvidenceLedgerRow[] | null
  candidateDelta?: ResearchThesisCandidateGraphDelta | null
  audit?: ResearchThesisReviewAudit | null
  costLog?: ResearchThesisCostLog | null
  artifactPointers?: ResearchWorkerArtifactPointer[] | null
  error?: string | null
  createdAt: string
  updatedAt: string
}

type ResearchWorkerEnv = Record<string, unknown> & {
  DB?: unknown
  RESEARCH_THESIS_QUEUE?: { send?: (message: unknown) => Promise<void> }
  RESEARCH_THESIS_ARTIFACTS?: { put?: (key: string, value: string, options?: unknown) => Promise<unknown> }
  RESEARCH_THESIS_CACHE?: { get?: (key: string) => Promise<string | null>; put?: (key: string, value: string) => Promise<unknown> }
  RESEARCH_DEV_RUNS?: Map<string, ResearchWorkerRunRow>
}

type D1DatabaseLike = {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      run?: () => Promise<unknown>
      first?: <T = Record<string, unknown>>() => Promise<T | null>
    }
  }
}

type QueueBatchLike = {
  messages?: Array<{
    body?: unknown
    ack?: () => void
    retry?: () => void
  }>
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,authorization',
  'access-control-max-age': '86400',
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...CORS_HEADERS,
    },
  })

const noContent = (): Response => new Response(null, { status: 204, headers: CORS_HEADERS })

const normalizeString = (value: unknown): string => String(value || '').trim()

const RESEARCH_SUMMARY_CACHE_PREFIX = 'research-thesis-summary:'

const readJsonBody = async (request: Request): Promise<Record<string, unknown> | null> => {
  try {
    const parsed = await request.json()
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

const readDb = (env: ResearchWorkerEnv): D1DatabaseLike | null => {
  const db = env.DB
  return db && typeof (db as D1DatabaseLike).prepare === 'function' ? db as D1DatabaseLike : null
}

const rowToRun = (row: Record<string, unknown> | null): ResearchWorkerRunRow | null => {
  if (!row) return null
  const parse = <T>(value: unknown): T | null => {
    if (!value) return null
    if (typeof value !== 'string') return value as T
    try {
      return JSON.parse(value) as T
    } catch {
      return null
    }
  }
  const manifest = parse<ResearchThesisRunManifest>(row.manifest_json)
  if (!manifest) return null
  return {
    runId: normalizeString(row.run_id),
    status: normalizeString(row.status) as ResearchWorkerRunRow['status'],
    manifest,
    sourceSummaries: parse<ResearchThesisSourceSummary[]>(row.source_summaries_json),
    spec: parse<ResearchThesisSpec>(row.spec_json),
    evidenceLedger: parse<ResearchThesisEvidenceLedgerRow[]>(row.evidence_ledger_json),
    candidateDelta: parse<ResearchThesisCandidateGraphDelta>(row.candidate_delta_json),
    audit: parse<ResearchThesisReviewAudit>(row.audit_json),
    costLog: parse<ResearchThesisCostLog>(row.cost_log_json),
    artifactPointers: parse<ResearchWorkerArtifactPointer[]>(row.artifact_pointers_json),
    error: normalizeString(row.error_message) || null,
    createdAt: normalizeString(row.created_at),
    updatedAt: normalizeString(row.updated_at),
  }
}

const putRun = async (env: ResearchWorkerEnv, row: ResearchWorkerRunRow): Promise<void> => {
  const memory = env.RESEARCH_DEV_RUNS
  if (memory instanceof Map) {
    memory.set(row.runId, row)
    return
  }
  const db = readDb(env)
  if (!db) throw new Error('missing Cloudflare D1 binding DB')
  await db.prepare(
    `INSERT INTO research_thesis_runs (
       run_id, status, manifest_json, source_summaries_json, spec_json,
       evidence_ledger_json, candidate_delta_json, audit_json, cost_log_json,
       artifact_pointers_json, error_message, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(run_id) DO UPDATE SET
       status = excluded.status,
       manifest_json = excluded.manifest_json,
       source_summaries_json = excluded.source_summaries_json,
       spec_json = excluded.spec_json,
       evidence_ledger_json = excluded.evidence_ledger_json,
       candidate_delta_json = excluded.candidate_delta_json,
       audit_json = excluded.audit_json,
       cost_log_json = excluded.cost_log_json,
       artifact_pointers_json = excluded.artifact_pointers_json,
       error_message = excluded.error_message,
       updated_at = excluded.updated_at`,
  ).bind(
    row.runId,
    row.status,
    JSON.stringify(row.manifest),
    row.sourceSummaries ? JSON.stringify(row.sourceSummaries) : null,
    row.spec ? JSON.stringify(row.spec) : null,
    row.evidenceLedger ? JSON.stringify(row.evidenceLedger) : null,
    row.candidateDelta ? JSON.stringify(row.candidateDelta) : null,
    row.audit ? JSON.stringify(row.audit) : null,
    row.costLog ? JSON.stringify(row.costLog) : null,
    row.artifactPointers ? JSON.stringify(row.artifactPointers) : null,
    row.error || null,
    row.createdAt,
    row.updatedAt,
  ).run?.()
}

const getRun = async (env: ResearchWorkerEnv, runId: string): Promise<ResearchWorkerRunRow | null> => {
  const memory = env.RESEARCH_DEV_RUNS
  if (memory instanceof Map) return memory.get(runId) || null
  const db = readDb(env)
  if (!db) throw new Error('missing Cloudflare D1 binding DB')
  const row = await db.prepare(
    `SELECT run_id, status, manifest_json, source_summaries_json, spec_json,
            evidence_ledger_json, candidate_delta_json, audit_json, cost_log_json,
            artifact_pointers_json, error_message, created_at, updated_at
     FROM research_thesis_runs
     WHERE run_id = ?`,
  ).bind(runId).first?.<Record<string, unknown>>()
  return rowToRun(row || null)
}

const putArtifact = async (
  env: ResearchWorkerEnv,
  kind: ResearchWorkerArtifactKind,
  key: string,
  value: unknown,
): Promise<ResearchWorkerArtifactPointer> => {
  const bucket = env.RESEARCH_THESIS_ARTIFACTS
  if (bucket && typeof bucket.put === 'function') {
    await bucket.put(key, JSON.stringify(value), { httpMetadata: { contentType: 'application/json' } })
    return { kind, key, storage: 'r2' }
  }
  return { kind, key, storage: 'local-dev' }
}

const buildWorkerSummaryCache = async (
  env: ResearchWorkerEnv,
  request: ResearchThesisCompileRequest,
): Promise<{ cache: Map<string, ResearchThesisSourceSummary>; persist: (summaries: ResearchThesisSourceSummary[]) => Promise<void> }> => {
  const cache = new Map<string, ResearchThesisSourceSummary>()
  const kv = env.RESEARCH_THESIS_CACHE
  const sources = Array.isArray(request.sources) ? request.sources : []
  if (kv && typeof kv.get === 'function') {
    for (const source of sources) {
      const text = String(source?.text || '')
      const contentHash = normalizeString(source?.contentHash) || await sha256TextHash(text)
      if (!contentHash) continue
      const raw = await kv.get(`${RESEARCH_SUMMARY_CACHE_PREFIX}${contentHash}`)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as ResearchThesisSourceSummary
        if (parsed && typeof parsed === 'object') cache.set(contentHash, parsed)
      } catch {
        void 0
      }
    }
  }
  return {
    cache,
    persist: async summaries => {
      if (!kv || typeof kv.put !== 'function') return
      await Promise.all(summaries.map(summary => (
        kv.put(`${RESEARCH_SUMMARY_CACHE_PREFIX}${summary.content_hash}`, JSON.stringify({ ...summary, cache_hit: false }))
      )))
    },
  }
}

const processCompile = async (env: ResearchWorkerEnv, request: ResearchThesisCompileRequest): Promise<ResearchWorkerRunRow> => {
  const summaryCache = await buildWorkerSummaryCache(env, request)
  const result = await compileResearchThesisSpec(request, { summaryCache: summaryCache.cache })
  const nowIso = new Date().toISOString()
  if (result.ok === false) {
    const preflight = await preflightResearchThesisCompileRequest(request)
    const fallbackRunId = preflight.ok ? preflight.manifest.run_id : `kgra_invalid_${Date.now()}`
    const fallbackManifest = preflight.ok ? preflight.manifest : {
      schema_version: 'research-thesis-run/v1',
      run_id: fallbackRunId,
      status: 'manifested',
      created_at: nowIso,
      source_refs: [],
      prompt_hash: '',
      budget: { max_input_tokens: 0, max_output_tokens: 0, estimated_input_tokens: result.error.estimated_input_tokens },
      bounds: { max_source_files: 0, max_extracted_windows_per_source: 0, max_compile_iterations: 0, max_verification_fan_out: 0, max_wall_clock_ms: 0 },
      source_hash_reuse: false,
    } as ResearchThesisRunManifest
    const row: ResearchWorkerRunRow = {
      runId: fallbackRunId,
      status: 'failed',
      manifest: fallbackManifest,
      costLog: result.cost_log,
      artifactPointers: [
        await putArtifact(env, 'cost_log', `${fallbackRunId}/cost-log.json`, result.cost_log),
      ],
      error: result.error.message,
      createdAt: fallbackManifest.created_at,
      updatedAt: nowIso,
    }
    await putRun(env, row)
    return row
  }
  await summaryCache.persist(result.source_summaries)
  const artifactPointers = [
    await putArtifact(env, 'manifest', `${result.manifest.run_id}/manifest.json`, result.manifest),
    await putArtifact(env, 'source_summaries', `${result.manifest.run_id}/source-summaries.json`, result.source_summaries),
    await putArtifact(env, 'thesis_spec', `${result.manifest.run_id}/thesis-spec.json`, result.spec),
    await putArtifact(env, 'evidence_ledger', `${result.manifest.run_id}/evidence-ledger.json`, result.evidence_ledger),
    await putArtifact(env, 'candidate_delta', `${result.manifest.run_id}/candidate-delta.json`, result.candidate_delta),
    await putArtifact(env, 'cost_log', `${result.manifest.run_id}/cost-log.json`, result.cost_log),
  ]
  const row: ResearchWorkerRunRow = {
    runId: result.manifest.run_id,
    status: 'ready',
    manifest: result.manifest,
    sourceSummaries: result.source_summaries,
    spec: result.spec,
    evidenceLedger: result.evidence_ledger,
    candidateDelta: result.candidate_delta,
    costLog: result.cost_log,
    artifactPointers,
    error: null,
    createdAt: result.manifest.created_at,
    updatedAt: nowIso,
  }
  await putRun(env, row)
  return row
}

const createCompileRun = async (request: Request, env: ResearchWorkerEnv): Promise<Response> => {
  const body = await readJsonBody(request)
  if (!body) return json(400, { ok: false, error: 'invalid research thesis request body' })
  const compileRequest = body as ResearchThesisCompileRequest
  const preflight = await preflightResearchThesisCompileRequest(compileRequest)
  if (preflight.ok === false) {
    return json(preflight.error.code === 'budget_exceeded' ? 402 : 400, {
      ok: false,
      error: preflight.error,
      cost_log: preflight.cost_log,
    })
  }
  const nowIso = new Date().toISOString()
  const queuedRow: ResearchWorkerRunRow = {
    runId: preflight.manifest.run_id,
    status: 'queued',
    manifest: preflight.manifest,
    error: null,
    createdAt: preflight.manifest.created_at,
    updatedAt: nowIso,
  }
  await putRun(env, queuedRow)
  const queue = env.RESEARCH_THESIS_QUEUE
  if (queue && typeof queue.send === 'function') {
    await queue.send({ type: 'research.thesis.compile.requested', request: compileRequest })
    return json(202, { ok: true, status: 'queued', run_id: queuedRow.runId, manifest: queuedRow.manifest })
  }
  const readyRow = await processCompile(env, compileRequest)
  return json(200, { ok: true, status: readyRow.status, run_id: readyRow.runId, manifest: readyRow.manifest })
}

const routeRunId = (pathname: string): string => {
  const match = /^\/api\/research\/runs\/([^/]+)(?:\/|$)/.exec(pathname)
  return decodeURIComponent(match?.[1] || '')
}

const commitRun = async (request: Request, env: ResearchWorkerEnv, runId: string): Promise<Response> => {
  const row = await getRun(env, runId)
  if (!row || !row.spec) return json(404, { ok: false, error: 'research thesis run not ready' })
  const body = await readJsonBody(request)
  const acceptedCandidateIds = Array.isArray(body?.acceptedCandidateIds)
    ? body.acceptedCandidateIds.map(normalizeString).filter(Boolean)
    : []
  const rejectedCandidateIds = Array.isArray(body?.rejectedCandidateIds)
    ? body.rejectedCandidateIds.map(normalizeString).filter(Boolean)
    : []
  const audit = buildResearchThesisReviewAudit({
    spec: row.spec,
    acceptedCandidateIds,
    rejectedCandidateIds,
  })
  const auditArtifactPointer = await putArtifact(env, 'review_audit', `${row.runId}/review-audit.json`, audit)
  const nextRow: ResearchWorkerRunRow = {
    ...row,
    status: 'committed',
    audit,
    artifactPointers: [...(row.artifactPointers || []), auditArtifactPointer],
    updatedAt: new Date().toISOString(),
  }
  await putRun(env, nextRow)
  return json(200, { ok: true, run_id: row.runId, audit })
}

const handleResearchRequest = async (request: Request, env: ResearchWorkerEnv): Promise<Response> => {
  if (request.method === 'OPTIONS') return noContent()
  const url = new URL(request.url)
  if (url.pathname === '/api/research/thesis-compile' && request.method === 'POST') {
    return createCompileRun(request, env)
  }
  const runId = routeRunId(url.pathname)
  if (!runId) return json(404, { ok: false, error: 'research route not found' })
  if (url.pathname.endsWith('/commit') && request.method === 'POST') return commitRun(request, env, runId)
  const row = await getRun(env, runId)
  if (!row) return json(404, { ok: false, error: 'research thesis run not found' })
  if (url.pathname.endsWith('/candidates')) {
    return json(200, { ok: true, run_id: runId, candidate_delta: row.candidateDelta || null })
  }
  return json(200, {
    ok: true,
    run_id: runId,
    status: row.status,
    manifest: row.manifest,
    source_summaries: row.sourceSummaries || null,
    spec: row.spec || null,
    evidence_ledger: row.evidenceLedger || null,
    candidate_delta: row.candidateDelta || null,
    audit: row.audit || null,
    cost_log: row.costLog || null,
    artifact_pointers: row.artifactPointers || null,
    error: row.error || null,
  })
}

export const processResearchThesisQueueMessage = async (
  body: unknown,
  env: ResearchWorkerEnv,
): Promise<'processed' | 'ignored'> => {
  const message = body && typeof body === 'object' ? body as Record<string, unknown> : null
  if (!message || message.type !== 'research.thesis.compile.requested') return 'ignored'
  const request = message.request && typeof message.request === 'object' ? message.request as ResearchThesisCompileRequest : null
  if (!request) throw new Error('missing research thesis compile request')
  await processCompile(env, request)
  return 'processed'
}

export const createKnowgrphResearchWorker = () => ({
  async fetch(request: Request, env: ResearchWorkerEnv): Promise<Response> {
    try {
      return await handleResearchRequest(request, env)
    } catch (err) {
      return json(500, { ok: false, error: err instanceof Error ? err.message : 'unexpected research worker error' })
    }
  },
  async queue(batch: QueueBatchLike, env: ResearchWorkerEnv): Promise<void> {
    for (const message of batch.messages || []) {
      try {
        await processResearchThesisQueueMessage(message.body, env)
        if (typeof message.ack === 'function') message.ack()
      } catch (err) {
        if (typeof message.retry === 'function') message.retry()
        throw err
      }
    }
  },
})

const worker = Object.assign(createKnowgrphResearchWorker(), {
  processResearchThesisQueueMessage,
})

export default worker
