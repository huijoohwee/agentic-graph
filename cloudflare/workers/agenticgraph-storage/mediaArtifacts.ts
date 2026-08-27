// =============================================================================
// media_artifacts D1 read/write layer — knowgrph-storage worker
// knowgrph-widget-canvas-media spec · Task 8.2
// Requirements: R3.9, R5.7, R6.3
//
// WHY THIS IS A SEPARATE FILE
// ----------------------------
// db.ts must stay under 600 lines per repo hygiene. This file owns the
// media_artifacts table surface: types, error class, and CRUD functions.
// It imports the raw D1 helpers from db.ts (no drizzle schema object needed
// here — raw SQL keeps the dependency surface minimal and avoids circular
// module definitions with db.ts).
// =============================================================================

import {
  execute,
  queryFirst,
  queryAll,
  normalizeString,
  normalizeNumber,
  isoFromMs,
} from './db'
import type { D1DatabaseLike } from './db'

// -----------------------------------------------------------------------------
// Error class — stale-write rejection (R5.7 monotonic ownership)
// -----------------------------------------------------------------------------

/**
 * Thrown by `upsertMediaArtifact` when the incoming `version` is strictly
 * less than the version already stored in D1. A stale write must never
 * overwrite a higher-version record (R5.7).
 */
export class MediaArtifactStaleWriteError extends Error {
  readonly id: string
  readonly storedVersion: number
  readonly incomingVersion: number

  constructor(id: string, storedVersion: number, incomingVersion: number) {
    super(
      `MediaArtifactStaleWriteError: stale write rejected for id "${id}" — ` +
      `incoming version ${incomingVersion} is lower than stored version ${storedVersion}`,
    )
    this.name = 'MediaArtifactStaleWriteError'
    this.id = id
    this.storedVersion = storedVersion
    this.incomingVersion = incomingVersion
  }
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Mirror of the `media_artifacts` D1 table columns (snake_case).
 * `id` = `{runId}:{stageId}:{shotId}`
 */
export type MediaArtifactRow = {
  id: string
  workspace_id: string
  run_id: string
  stage_id: string
  shot_id: string
  kind: string                  // "text" | "image" | "video"
  durable_r2_url: string        // never an ephemeral provider URL (R3.4/R3.5)
  content_hash: string          // sha256, dedupe key (R3.9)
  media_type: string | null
  provenance_json: string       // serialized ProvenanceChain (R6.3)
  layout_json: string | null    // serialized ResponsiveLayoutMetadata
  version: number               // monotonic ownership counter (R5.7)
  created_at: string
  updated_at: string
}

/**
 * Application-layer representation of a media artifact (camelCase).
 * Matches the shape of `ArtifactRecord` from the contracts module.
 */
export type MediaArtifactRecord = {
  id: string
  workspaceId: string
  runId: string
  stageId: string
  shotId: string
  kind: string
  durableR2Url: string
  contentHash: string
  mediaType: string | null
  provenanceJson: string
  layoutJson: string | null
  version: number
  createdAt: string
  updatedAt: string
}

/**
 * Input shape for `upsertMediaArtifact`. `id` is derived from
 * `{runId}:{stageId}:{shotId}` if not supplied.
 */
export type MediaArtifactInput = {
  id?: string
  workspaceId: string
  runId: string
  stageId: string
  shotId: string
  kind: string
  durableR2Url: string
  contentHash: string
  mediaType?: string | null
  provenanceJson: string
  layoutJson?: string | null
  version: number
  createdAtMs?: number
  updatedAtMs?: number
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

function buildId(runId: string, stageId: string, shotId: string): string {
  return `${runId}:${stageId}:${shotId}`
}

function rowToRecord(row: MediaArtifactRow): MediaArtifactRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    runId: row.run_id,
    stageId: row.stage_id,
    shotId: row.shot_id,
    kind: row.kind,
    durableR2Url: row.durable_r2_url,
    contentHash: row.content_hash,
    mediaType: row.media_type,
    provenanceJson: row.provenance_json,
    layoutJson: row.layout_json,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRow(raw: Record<string, unknown>): MediaArtifactRow {
  return {
    id: normalizeString(raw.id),
    workspace_id: normalizeString(raw.workspace_id),
    run_id: normalizeString(raw.run_id),
    stage_id: normalizeString(raw.stage_id),
    shot_id: normalizeString(raw.shot_id),
    kind: normalizeString(raw.kind),
    durable_r2_url: normalizeString(raw.durable_r2_url),
    content_hash: normalizeString(raw.content_hash),
    media_type: typeof raw.media_type === 'string' ? raw.media_type : null,
    provenance_json: normalizeString(raw.provenance_json),
    layout_json: typeof raw.layout_json === 'string' ? raw.layout_json : null,
    version: normalizeNumber(raw.version),
    created_at: normalizeString(raw.created_at),
    updated_at: normalizeString(raw.updated_at),
  }
}

// -----------------------------------------------------------------------------
// upsertMediaArtifact — write or update; throws on stale write (R5.7)
// -----------------------------------------------------------------------------

/**
 * Upsert a media artifact row, enforcing monotonic version ownership (R5.7).
 *
 * - On INSERT (no existing row): always applies.
 * - On UPDATE with `version` ≥ stored `version`: applies (forward write).
 * - On UPDATE with `version` < stored `version`: throws
 *   `MediaArtifactStaleWriteError` — a lower-version write must never
 *   overwrite a higher-version record.
 *
 * @throws {MediaArtifactStaleWriteError} when the incoming version is stale.
 */
export async function upsertMediaArtifact(
  db: D1DatabaseLike,
  record: MediaArtifactInput,
  nowIso: string,
): Promise<void> {
  const id = record.id ?? buildId(record.runId, record.stageId, record.shotId)
  const createdAt = record.createdAtMs ? isoFromMs(record.createdAtMs, nowIso) : nowIso
  const updatedAt = record.updatedAtMs ? isoFromMs(record.updatedAtMs, nowIso) : nowIso

  const existing = await queryFirst<{ version: number }>(
    db,
    'SELECT version FROM media_artifacts WHERE id = ? AND workspace_id = ?',
    [id, record.workspaceId],
  )

  if (existing !== null) {
    const storedVersion = normalizeNumber(existing.version)
    const incomingVersion = normalizeNumber(record.version)

    // R5.7: reject a lower-version write.
    if (incomingVersion < storedVersion) {
      throw new MediaArtifactStaleWriteError(id, storedVersion, incomingVersion)
    }

    await execute(
      db,
      `UPDATE media_artifacts SET
         run_id = ?,
         stage_id = ?,
         shot_id = ?,
         kind = ?,
         durable_r2_url = ?,
         content_hash = ?,
         media_type = ?,
         provenance_json = ?,
         layout_json = ?,
         version = ?,
         updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
      [
        record.runId,
        record.stageId,
        record.shotId,
        record.kind,
        record.durableR2Url,
        record.contentHash,
        record.mediaType ?? null,
        record.provenanceJson,
        record.layoutJson ?? null,
        incomingVersion,
        updatedAt,
        id,
        record.workspaceId,
      ],
    )
    return
  }

  // No existing row — insert fresh.
  await execute(
    db,
    `INSERT INTO media_artifacts (
       id, workspace_id, run_id, stage_id, shot_id,
       kind, durable_r2_url, content_hash, media_type,
       provenance_json, layout_json, version, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      record.workspaceId,
      record.runId,
      record.stageId,
      record.shotId,
      record.kind,
      record.durableR2Url,
      record.contentHash,
      record.mediaType ?? null,
      record.provenanceJson,
      record.layoutJson ?? null,
      normalizeNumber(record.version),
      createdAt,
      updatedAt,
    ],
  )
}

// -----------------------------------------------------------------------------
// readMediaArtifact — single row by id + workspaceId
// -----------------------------------------------------------------------------

/**
 * Return the `MediaArtifactRecord` for `id` in the given workspace, or `null`
 * when the row does not exist.
 */
export async function readMediaArtifact(
  db: D1DatabaseLike,
  id: string,
  workspaceId: string,
): Promise<MediaArtifactRecord | null> {
  const row = await queryFirst<Record<string, unknown>>(
    db,
    'SELECT * FROM media_artifacts WHERE id = ? AND workspace_id = ? LIMIT 1',
    [id, workspaceId],
  )
  return row ? rowToRecord(toRow(row)) : null
}

// -----------------------------------------------------------------------------
// readMediaArtifactsByRun — all rows for a run ordered by created_at
// -----------------------------------------------------------------------------

/**
 * Return all `MediaArtifactRecord`s for the given `workspaceId` / `runId`,
 * ordered by `created_at` ascending.
 */
export async function readMediaArtifactsByRun(
  db: D1DatabaseLike,
  workspaceId: string,
  runId: string,
): Promise<MediaArtifactRecord[]> {
  const rows = await queryAll<Record<string, unknown>>(
    db,
    'SELECT * FROM media_artifacts WHERE workspace_id = ? AND run_id = ? ORDER BY created_at ASC',
    [workspaceId, runId],
  )
  return rows.map((r) => rowToRecord(toRow(r)))
}

// -----------------------------------------------------------------------------
// listRecentMediaArtifacts — workspace media inventory ordered by updated_at
// -----------------------------------------------------------------------------

export async function listRecentMediaArtifacts(
  db: D1DatabaseLike,
  workspaceId: string,
  limit = 50,
): Promise<MediaArtifactRecord[]> {
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(normalizeNumber(limit, 50))))
  const rows = await queryAll<Record<string, unknown>>(
    db,
    'SELECT * FROM media_artifacts WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT ?',
    [workspaceId, boundedLimit],
  )
  return rows.map((r) => rowToRecord(toRow(r)))
}

// -----------------------------------------------------------------------------
// update/delete media artifact — operator-owned metadata mutation
// -----------------------------------------------------------------------------

export async function updateMediaArtifactProvenance(
  db: D1DatabaseLike,
  workspaceId: string,
  id: string,
  provenanceJson: string,
  nowIso: string,
): Promise<MediaArtifactRecord | null> {
  await execute(
    db,
    'UPDATE media_artifacts SET provenance_json = ?, version = version + 1, updated_at = ? WHERE workspace_id = ? AND id = ?',
    [provenanceJson, nowIso, workspaceId, id],
  )
  return readMediaArtifact(db, id, workspaceId)
}

export async function deleteMediaArtifact(
  db: D1DatabaseLike,
  workspaceId: string,
  id: string,
): Promise<MediaArtifactRecord | null> {
  const existing = await readMediaArtifact(db, id, workspaceId)
  if (!existing) return null
  await execute(
    db,
    'DELETE FROM media_artifacts WHERE workspace_id = ? AND id = ?',
    [workspaceId, id],
  )
  return existing
}

// -----------------------------------------------------------------------------
// findMediaArtifactByHash — content-hash dedupe lookup (R3.9)
// -----------------------------------------------------------------------------

/**
 * Return the artifact record whose `content_hash` matches `contentHash` within
 * `workspaceId`, or `null` when no match exists.
 *
 * Used by the media persist path to deduplicate R2 writes: when a row already
 * exists for this hash the caller reuses the stored `durableR2Url` without
 * writing a new R2 object (R3.9).
 */
export async function findMediaArtifactByHash(
  db: D1DatabaseLike,
  workspaceId: string,
  contentHash: string,
): Promise<MediaArtifactRecord | null> {
  const row = await queryFirst<Record<string, unknown>>(
    db,
    'SELECT * FROM media_artifacts WHERE workspace_id = ? AND content_hash = ? LIMIT 1',
    [workspaceId, contentHash],
  )
  return row ? rowToRecord(toRow(row)) : null
}
