import { queryFirst } from '../shared/d1'
import type { D1DatabaseLike } from '../shared/d1'
import type { StrytreeGenerationJobRow } from './strytreeTypes'

const LEASE_MS = 120_000
const SQL_NOW_MS = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)"
const LIVE_LEASE_SQL = `json_extract(result_json, '$.expiresAtMs') > ${SQL_NOW_MS}`

export type GenerationFinalization = {
  mode: 'local' | 'provider'
  artifact: string
  resultJson: string
  providerJobId: string
}

type Checkpoint = {
  kind: 'strytree-generation-claim'
  version: 1
  token: string
  expiresAtMs: number
  finalization?: GenerationFinalization
}

export class GenerationClaimError extends Error {
  readonly retryable: boolean
  readonly reconciliation: boolean

  constructor(readonly code: string, message = code, reconciliation = false) {
    super(message)
    this.name = 'GenerationClaimError'
    this.retryable = !reconciliation
    this.reconciliation = reconciliation
  }
}

export type GenerationClaim = {
  readonly job: StrytreeGenerationJobRow
  readonly finalization: GenerationFinalization | null
  prepareFinalization(value: GenerationFinalization): Promise<void>
  assertOwned(): Promise<void>
  submitted(videoId: string): Promise<void>
  requireReconciliation(message: string): Promise<never>
  beginRefund(code: string, message: string): Promise<void>
  // setSql is a caller-owned terminal SET clause, never request/provider input.
  finish(setSql: string, values: unknown[]): Promise<void>
}

const readCheckpoint = (value: string | null): Checkpoint | null => {
  try {
    const record = JSON.parse(value || 'null') as Partial<Checkpoint> | null
    return record?.kind === 'strytree-generation-claim' && record.version === 1
      && typeof record.token === 'string' && record.token.length > 0
      && Number.isSafeInteger(record.expiresAtMs) && Number(record.expiresAtMs) > 0
      ? record as Checkpoint : null
  } catch {
    return null
  }
}

const validateFinalization = (value: unknown, job: StrytreeGenerationJobRow): GenerationFinalization => {
  const entry = value as Partial<GenerationFinalization> | null
  if (!entry || (entry.mode !== 'local' && entry.mode !== 'provider')
    || typeof entry.artifact !== 'string' || typeof entry.resultJson !== 'string'
    || typeof entry.providerJobId !== 'string' || !entry.providerJobId.trim()
    || (entry.mode === 'provider' ? entry.providerJobId !== job.provider_job_id : job.provider_job_id !== null)) {
    throw new GenerationClaimError('generation_finalization_invalid', 'Finalization identity does not match the job.', true)
  }
  return Object.freeze({ mode: entry.mode, artifact: entry.artifact,
    resultJson: entry.resultJson, providerJobId: entry.providerJobId })
}

const readFinalization = (job: StrytreeGenerationJobRow, checkpoint = readCheckpoint(job.result_json)) =>
  checkpoint && Object.prototype.hasOwnProperty.call(checkpoint, 'finalization')
    ? validateFinalization(checkpoint.finalization, job) : null

const serializeCheckpoint = (checkpoint: Checkpoint): string => {
  const serialized = JSON.stringify(checkpoint)
  if (serialized.length >= 500_000 || new TextEncoder().encode(serialized).byteLength >= 500_000) {
    throw new GenerationClaimError('generation_finalization_too_large', 'Generation checkpoint must be below 500000 UTF-8 bytes.', true)
  }
  return serialized
}

const updateRow = async (
  db: D1DatabaseLike,
  setSql: string,
  values: unknown[],
  whereSql: string,
  guards: unknown[],
): Promise<StrytreeGenerationJobRow> => {
  let row: StrytreeGenerationJobRow | null
  try {
    row = await queryFirst<StrytreeGenerationJobRow>(db,
      `UPDATE strytree_generation_jobs SET ${setSql} WHERE ${whereSql} RETURNING *`,
      [...values, ...guards])
  } catch (error) {
    throw new GenerationClaimError('generation_claim_storage_unavailable',
      error instanceof Error ? error.message : String(error))
  }
  if (!row) throw new GenerationClaimError('generation_claim_lost')
  return row
}

const exactWhere = 'id = ? AND status = ? AND result_json IS ? AND provider_job_id IS ?'
const guardsFor = (job: StrytreeGenerationJobRow): unknown[] =>
  [job.id, job.status, job.result_json, job.provider_job_id]

const makeClaim = (db: D1DatabaseLike, initial: StrytreeGenerationJobRow): GenerationClaim => {
  let job = initial
  const token = readCheckpoint(job.result_json)!.token

  const ownedUpdate = async (setSql: string, values: unknown[]): Promise<void> => {
    const checkpoint = readCheckpoint(job.result_json)
    if (!checkpoint || checkpoint.token !== token
      || (job.status !== 'processing' && job.status !== 'refunding')) {
      throw new GenerationClaimError('generation_claim_lost')
    }
    if (checkpoint.expiresAtMs <= Date.now()) {
      throw new GenerationClaimError('generation_claim_expired')
    }
    job = await updateRow(db, setSql, values, `${exactWhere} AND ${LIVE_LEASE_SQL}`, guardsFor(job))
  }

  const renew = (finalization = readFinalization(job)): string => serializeCheckpoint({
    kind: 'strytree-generation-claim', version: 1, token, expiresAtMs: Date.now() + LEASE_MS,
    ...(finalization ? { finalization } : {}),
  })

  return {
    get job() { return job },
    get finalization() { return readFinalization(job) },
    async prepareFinalization(value) {
      if (job.status !== 'processing') throw new GenerationClaimError('generation_claim_lost')
      const next = validateFinalization(value, job)
      const existing = readFinalization(job)
      if (existing && (existing.mode !== next.mode || existing.artifact !== next.artifact
        || existing.resultJson !== next.resultJson || existing.providerJobId !== next.providerJobId)) {
        throw new GenerationClaimError('generation_finalization_conflict', 'The persisted finalization cannot be replaced.', true)
      }
      await ownedUpdate('result_json = ?, updated_at = ?', [renew(existing || next), new Date().toISOString()])
    },
    async assertOwned() {
      await ownedUpdate('result_json = ?, updated_at = ?', [renew(), new Date().toISOString()])
    },
    async submitted(videoId) {
      if (readFinalization(job)) throw new GenerationClaimError('generation_finalization_in_progress')
      if (!videoId || !videoId.trim()) throw new GenerationClaimError('generation_provider_id_missing')
      const checkpoint = readCheckpoint(job.result_json)
      if (!checkpoint || checkpoint.token !== token
        || (job.status !== 'processing' && job.status !== 'reconciliation_required')
        || (job.provider_job_id !== null && job.provider_job_id !== videoId)) {
        throw new GenerationClaimError('generation_claim_lost')
      }
      // A late POST response must preserve its ID, but cannot revive an expired lease.
      job = await updateRow(db, 'provider_job_id = ?, updated_at = ?',
        [videoId, new Date().toISOString()],
        'id = ? AND status IN (?, ?) AND result_json IS ? AND (provider_job_id IS NULL OR provider_job_id = ?)',
        [job.id, 'processing', 'reconciliation_required', job.result_json, videoId])
      if (job.status === 'reconciliation_required' || checkpoint.expiresAtMs <= Date.now()) {
        throw new GenerationClaimError('generation_claim_expired')
      }
    },
    async requireReconciliation(message) {
      if (job.status !== 'processing') throw new GenerationClaimError('generation_claim_lost')
      // Exact checkpoint ownership permits retirement after expiry, never a new owner.
      job = await updateRow(db, 'status = ?, error_code = ?, error_message = ?, updated_at = ?',
        ['reconciliation_required', 'generation_reconciliation_required', message, new Date().toISOString()],
        exactWhere, guardsFor(job))
      throw new GenerationClaimError('generation_reconciliation_required', message, true)
    },
    async beginRefund(code, message) {
      if (readFinalization(job)) throw new GenerationClaimError('generation_finalization_in_progress')
      if (job.status === 'refunding') {
        await ownedUpdate('result_json = ?, updated_at = ?', [renew(), new Date().toISOString()])
        return
      }
      await ownedUpdate('status = ?, result_json = ?, error_code = ?, error_message = ?, updated_at = ?',
        ['refunding', renew(), code, message, new Date().toISOString()])
    },
    async finish(setSql, values) {
      await ownedUpdate(setSql, values)
    },
  }
}

export const acquireGenerationClaim = async (
  db: D1DatabaseLike,
  job: StrytreeGenerationJobRow,
): Promise<GenerationClaim | null> => {
  if (['succeeded', 'failed', 'moderated'].includes(job.status)) return null
  if (!job.debit_ledger_event_id) throw new GenerationClaimError('generation_debit_pending')
  const now = Date.now()
  const previous = readCheckpoint(job.result_json)
  const finalization = readFinalization(job, previous)
  const leased = job.status === 'processing' || job.status === 'refunding'
  if (leased && previous && previous.expiresAtMs > now) {
    throw new GenerationClaimError('generation_in_progress')
  }
  const expiryGuard = leased && previous
    ? ` AND json_extract(result_json, '$.expiresAtMs') <= ${SQL_NOW_MS}` : ''
  if (job.status === 'processing' && !job.provider_job_id && !finalization) {
    const message = 'Provider submission outcome is unknown; reconciliation is required before retry or refund.'
    await updateRow(db, 'status = ?, error_code = ?, error_message = ?, updated_at = ?',
      ['reconciliation_required', 'generation_reconciliation_required', message, new Date(now).toISOString()],
      `${exactWhere}${expiryGuard}`, guardsFor(job))
    throw new GenerationClaimError('generation_reconciliation_required', message, true)
  }
  if (job.status === 'reconciliation_required' && !job.provider_job_id && !finalization) {
    throw new GenerationClaimError('generation_reconciliation_required',
      job.error_message || 'Provider submission requires reconciliation.', true)
  }
  if (!['queued', 'processing', 'refunding', 'reconciliation_required'].includes(job.status)) {
    throw new GenerationClaimError('generation_state_requires_reconciliation', `Unexpected job status: ${job.status}`, true)
  }
  const checkpoint: Checkpoint = {
    kind: 'strytree-generation-claim', version: 1,
    token: crypto.randomUUID(), expiresAtMs: now + LEASE_MS,
    ...(finalization ? { finalization } : {}),
  }
  const claimed = await updateRow(db, 'status = ?, result_json = ?, updated_at = ?',
    [job.status === 'refunding' ? 'refunding' : 'processing', serializeCheckpoint(checkpoint), new Date(now).toISOString()],
    `${exactWhere}${expiryGuard} AND debit_ledger_event_id IS ?`, [...guardsFor(job), job.debit_ledger_event_id])
  return makeClaim(db, claimed)
}
