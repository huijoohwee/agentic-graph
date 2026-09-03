// =============================================================================
// Media artifact auto-save, retrieval, and conflict-safe sync
// agentic-graph-widget-canvas-media spec · Task 9
// Requirements: R5.1, R5.2, R5.3, R5.5, R5.6, R5.7, R5.9, R5.10, R6.5
//
// Pure utility module — no Cloudflare Worker bindings, no live network.
// All D1 writes go through the injectable `db: D1DatabaseLike` parameter.
// The module is importable by both the canvas SPA and Node offline tests.
// =============================================================================

import type {
  MediaArtifactInput,
  MediaArtifactRecord,
} from '../../../../cloudflare/workers/agentic-graph-storage/mediaArtifacts'
import {
  upsertMediaArtifact,
  readMediaArtifactsByRun,
  MediaArtifactStaleWriteError,
} from '../../../../cloudflare/workers/agentic-graph-storage/mediaArtifacts'
import type { D1DatabaseLike } from '../../../../cloudflare/workers/shared/d1'

// -----------------------------------------------------------------------------
// Error classes (R5.9, R5.10)
// -----------------------------------------------------------------------------

/**
 * Thrown when all retry attempts for a D1 auto-save write fail (R5.9).
 * Carries the ids of the artifacts that could not be saved so the caller can
 * preserve unsaved local state and surface a save-failure indication.
 */
export class MediaArtifactSyncWriteError extends Error {
  readonly failedIds: string[]
  readonly attemptCount: number
  readonly cause: unknown

  constructor(failedIds: string[], attemptCount: number, cause?: unknown) {
    super(
      `MediaArtifactSyncWriteError: failed to write ${failedIds.length} artifact(s) after ${attemptCount} attempt(s): ${failedIds.join(', ')}`,
    )
    this.name = 'MediaArtifactSyncWriteError'
    this.failedIds = failedIds
    this.attemptCount = attemptCount
    this.cause = cause
  }
}

/**
 * Thrown when D1 retrieval fails (R5.10).
 * Ensures the caller does not treat partial or empty state as authoritative.
 */
export class MediaArtifactSyncRetrieveError extends Error {
  readonly workspaceId: string
  readonly runId: string
  readonly cause: unknown

  constructor(workspaceId: string, runId: string, cause?: unknown) {
    super(
      `MediaArtifactSyncRetrieveError: failed to retrieve media artifacts for run "${runId}" in workspace "${workspaceId}"`,
    )
    this.name = 'MediaArtifactSyncRetrieveError'
    this.workspaceId = workspaceId
    this.runId = runId
    this.cause = cause
  }
}

// -----------------------------------------------------------------------------
// Conflict type (R5.6, R5.7)
// -----------------------------------------------------------------------------

/**
 * Surfaces when a stale write is detected — the incoming version is lower than
 * the stored version. The caller must choose an explicit resolution strategy
 * rather than letting the write silently overwrite newer state.
 */
export type MediaArtifactConflict = {
  /** Artifact id (`runId:stageId:shotId`) */
  id: string
  /** Version currently stored in D1 */
  storedVersion: number
  /** Version the caller was trying to write */
  incomingVersion: number
  /** Caller-set resolution; starts as "pending" */
  resolution: 'pending' | 'accept-local' | 'accept-remote'
}

// -----------------------------------------------------------------------------
// Options
// -----------------------------------------------------------------------------

export type MediaArtifactSyncOptions = {
  /** Debounce window for batching rapid save calls (ms). Default 500. */
  debounceMs?: number
  /** Timeout for a D1 write to complete (ms). Default 2000. */
  writeTimeoutMs?: number
  /** Maximum number of write retry attempts before throwing. Default 3. */
  maxRetries?: number
  /** Timeout for a D1 retrieval to complete (ms). Default 3000. */
  retrieveTimeoutMs?: number
}

const DEFAULTS = {
  debounceMs: 500,
  writeTimeoutMs: 2000,
  maxRetries: 3,
  retrieveTimeoutMs: 3000,
} as const

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

function resolveOpts(opts: MediaArtifactSyncOptions | undefined) {
  const debounceMs =
    typeof opts?.debounceMs === 'number' && opts.debounceMs >= 0
      ? opts.debounceMs
      : DEFAULTS.debounceMs
  const writeTimeoutMs =
    typeof opts?.writeTimeoutMs === 'number' && opts.writeTimeoutMs > 0
      ? opts.writeTimeoutMs
      : DEFAULTS.writeTimeoutMs
  const maxRetries =
    typeof opts?.maxRetries === 'number' && opts.maxRetries >= 0
      ? opts.maxRetries
      : DEFAULTS.maxRetries
  const retrieveTimeoutMs =
    typeof opts?.retrieveTimeoutMs === 'number' && opts.retrieveTimeoutMs > 0
      ? opts.retrieveTimeoutMs
      : DEFAULTS.retrieveTimeoutMs
  return { debounceMs, writeTimeoutMs, maxRetries, retrieveTimeoutMs }
}

/** Returns a Promise that rejects after `ms` milliseconds. */
function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms),
  )
}

// -----------------------------------------------------------------------------
// createMediaArtifactSyncWriter
//
// Returns a debounced `save` function that batches rapid calls and writes
// artifacts to D1 with retry logic and stale-write protection.
// -----------------------------------------------------------------------------

export type MediaArtifactSyncWriter = {
  /**
   * Queue artifacts for a debounced D1 write.
   * Resolves with the saved records on success.
   * Rejects with `MediaArtifactSyncWriteError` after maxRetries exhaustion.
   * Surfaces `MediaArtifactConflict` when a stale write is detected.
   */
  save(args: {
    workspaceId: string
    runId: string
    artifacts: MediaArtifactInput[]
    nowIso?: string
  }): Promise<MediaArtifactRecord[]>
  /** Flush any pending debounced save immediately (useful in tests). */
  flush(): Promise<MediaArtifactRecord[]>
}

/**
 * Create a media artifact sync writer bound to the given D1 database.
 * All writes are debounced, retried, and protected against stale overwrites.
 *
 * @param db - injectable D1DatabaseLike (worker binding in production; mock in tests).
 * @param opts - configurable timing and retry parameters.
 * @param onConflict - optional callback invoked when a stale-write conflict is
 *   detected; the caller may present a resolution UI and then call `save` again
 *   with the resolved artifact.
 */
export function createMediaArtifactSyncWriter(
  db: D1DatabaseLike,
  opts?: MediaArtifactSyncOptions,
  onConflict?: (conflict: MediaArtifactConflict) => void,
): MediaArtifactSyncWriter {
  const { debounceMs, writeTimeoutMs, maxRetries } = resolveOpts(opts)

  // Latest pending save args — only the most-recent call per flush cycle is
  // written (latest-result ownership, R5.7).
  let pending: {
    workspaceId: string
    runId: string
    artifacts: MediaArtifactInput[]
    nowIso: string
    resolve: (records: MediaArtifactRecord[]) => void
    reject: (err: unknown) => void
  } | null = null

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  async function writeWithRetry(
    workspaceId: string,
    artifacts: MediaArtifactInput[],
    nowIso: string,
    attemptsLeft: number,
  ): Promise<MediaArtifactRecord[]> {
    const failedIds: string[] = []
    let lastError: unknown

    // Single attempt — write all artifacts; bail fast on stale conflict.
    for (const artifact of artifacts) {
      try {
        await Promise.race([
          upsertMediaArtifact(db, artifact, nowIso),
          rejectAfter(writeTimeoutMs, `write timeout after ${writeTimeoutMs}ms`),
        ])
      } catch (err) {
        if (err instanceof MediaArtifactStaleWriteError) {
          // Surface conflict and do not retry — explicit resolution required (R5.6).
          const conflict: MediaArtifactConflict = {
            id: err.id,
            storedVersion: err.storedVersion,
            incomingVersion: err.incomingVersion,
            resolution: 'pending',
          }
          onConflict?.(conflict)
          // Re-throw so the caller can handle the conflict.
          throw err
        }
        const id =
          artifact.id ??
          `${artifact.runId}:${artifact.stageId}:${artifact.shotId}`
        failedIds.push(id)
        lastError = err
      }
    }

    if (failedIds.length > 0) {
      if (attemptsLeft > 1) {
        // Retry only the failed artifacts.
        const failed = artifacts.filter((a) => {
          const id = a.id ?? `${a.runId}:${a.stageId}:${a.shotId}`
          return failedIds.includes(id)
        })
        return writeWithRetry(workspaceId, failed, nowIso, attemptsLeft - 1)
      }
      throw new MediaArtifactSyncWriteError(failedIds, maxRetries, lastError)
    }

    // Read back the saved records.
    const runId = artifacts[0]?.runId ?? ''
    if (!runId) return []
    return readMediaArtifactsByRun(db, workspaceId, runId)
  }

  function scheduledFlush() {
    const args = pending
    pending = null
    debounceTimer = null
    if (!args) return

    const attemptCount = maxRetries > 0 ? maxRetries : 1
    writeWithRetry(args.workspaceId, args.artifacts, args.nowIso, attemptCount)
      .then(args.resolve)
      .catch(args.reject)
  }

  function save(args: {
    workspaceId: string
    runId: string
    artifacts: MediaArtifactInput[]
    nowIso?: string
  }): Promise<MediaArtifactRecord[]> {
    return new Promise<MediaArtifactRecord[]>((resolve, reject) => {
      // Latest-result ownership: replace any queued pending write (R5.7).
      if (pending) {
        // Resolve the superseded call with an empty array — it was overtaken.
        pending.resolve([])
      }
      pending = {
        workspaceId: args.workspaceId,
        runId: args.runId,
        artifacts: args.artifacts,
        nowIso: args.nowIso ?? new Date().toISOString(),
        resolve,
        reject,
      }

      if (debounceTimer !== null) clearTimeout(debounceTimer)
      if (debounceMs === 0) {
        scheduledFlush()
      } else {
        debounceTimer = setTimeout(scheduledFlush, debounceMs)
      }
    })
  }

  function flush(): Promise<MediaArtifactRecord[]> {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    scheduledFlush()
    return pending
      ? new Promise((resolve, reject) => {
          const prev = pending!
          pending = { ...prev, resolve, reject }
        })
      : Promise.resolve([])
  }

  return { save, flush }
}

// -----------------------------------------------------------------------------
// retrieveMediaArtifacts (R5.2, R5.10)
// -----------------------------------------------------------------------------

/**
 * Retrieve all media artifacts for a run from D1, completing within
 * `retrieveTimeoutMs`. Throws `MediaArtifactSyncRetrieveError` on failure —
 * the caller must not treat partial or empty state as authoritative (R5.10).
 */
export async function retrieveMediaArtifacts(
  db: D1DatabaseLike,
  args: { workspaceId: string; runId: string },
  opts?: Pick<MediaArtifactSyncOptions, 'retrieveTimeoutMs'>,
): Promise<MediaArtifactRecord[]> {
  const { retrieveTimeoutMs } = resolveOpts(opts)
  try {
    return await Promise.race([
      readMediaArtifactsByRun(db, args.workspaceId, args.runId),
      rejectAfter(
        retrieveTimeoutMs,
        `retrieval timeout after ${retrieveTimeoutMs}ms`,
      ),
    ])
  } catch (err) {
    throw new MediaArtifactSyncRetrieveError(args.workspaceId, args.runId, err)
  }
}

// -----------------------------------------------------------------------------
// resolveConflict (R5.6)
// -----------------------------------------------------------------------------

/**
 * Resolve a stale-write conflict by choosing which version to keep.
 * Returns a new `MediaArtifactConflict` with the chosen `resolution` set.
 * The caller then writes the appropriate artifact to D1 using `save`.
 */
export function resolveConflict(
  conflict: MediaArtifactConflict,
  choice: 'accept-local' | 'accept-remote',
): MediaArtifactConflict {
  return { ...conflict, resolution: choice }
}
