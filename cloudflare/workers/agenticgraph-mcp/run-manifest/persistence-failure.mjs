// Persistence-failure response/diagnostic builders (R14.3). Extracted verbatim
// from `run-manifest-store.mjs` (reuse-not-rebuild): on a Run_Manifest write
// failure the Mcp_Agent retains the most-recently-persisted state, returns a
// structured persistence-failure response, and emits an observability
// diagnostic.

import {
  RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS,
  writeDiagnosticToConsole,
  toErrorMessage,
} from "./shared.mjs";

/**
 * Default observability sink for persistence-failure diagnostics (R14.3).
 * Delegates to the shared console writer.
 */
export function defaultPersistenceDiagnosticEmitter(diagnostic) {
  writeDiagnosticToConsole("run_manifest_persistence_failure", diagnostic);
}

/**
 * Build the observability diagnostic emitted on a Run_Manifest persistence
 * failure (R14.3). Mirrors the stage-transition diagnostic shape (task 1.5)
 * with `{ runId, utcTimestamp, outcomeStatus }`, adding the retained-state
 * pointer and the failure reason so an operator can correlate the failed
 * write with the state that was preserved.
 *
 * @param {{ runId?: string | null, error?: unknown, retainedPersistedAt?: string | null, retainedStatePresent?: boolean, nowMs?: number }} [options]
 */
export function buildPersistenceFailureDiagnostic({
  runId = null,
  error,
  retainedPersistedAt = null,
  retainedStatePresent = false,
  nowMs,
} = {}) {
  const ts = Number.isFinite(nowMs) ? nowMs : Date.now();
  return {
    type: "run_manifest_persistence_failure",
    runId: runId ? String(runId) : null,
    utcTimestamp: new Date(ts).toISOString(),
    outcomeStatus: RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS,
    retainedStatePresent: Boolean(retainedStatePresent),
    retainedPersistedAt:
      typeof retainedPersistedAt === "string" ? retainedPersistedAt : null,
    error: { message: toErrorMessage(error) },
  };
}

/**
 * Build the structured persistence-failure response returned to the caller
 * (R14.3). `ok:false` + a stable `status` lets the McpAgent tool response and
 * the Agent_Api distinguish a persistence failure from a successful write,
 * while `retained` reports the most-recently-persisted state that survived the
 * failed write. The diagnostic is embedded so a single object carries both the
 * caller-facing response and the emitted observability record.
 *
 * @param {{ runId?: string | null, error?: unknown, retained?: ({ runId?: string | null, persistedAt?: string | null } | null), nowMs?: number }} [options]
 */
export function buildPersistenceFailureResponse({
  runId = null,
  error,
  retained = null,
  nowMs,
} = {}) {
  const retainedPersistedAt =
    retained && typeof retained.persistedAt === "string"
      ? retained.persistedAt
      : null;
  const retainedRunId =
    retained && typeof retained.runId === "string" ? retained.runId : null;
  const retainedStatePresent = Boolean(retained);
  const diagnostic = buildPersistenceFailureDiagnostic({
    runId: runId ?? retainedRunId,
    error,
    retainedPersistedAt,
    retainedStatePresent,
    nowMs,
  });
  return {
    ok: false,
    persisted: false,
    status: RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS,
    runId: runId ? String(runId) : retainedRunId,
    error: {
      code: RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS,
      message: toErrorMessage(error),
    },
    // The most-recently-persisted state is retained intact (R14.3); the
    // caller can re-read it via GET /knowgrph/control-plane/mcp/runs/{id}.
    retained: {
      present: retainedStatePresent,
      runId: retainedRunId,
      persistedAt: retainedPersistedAt,
    },
    diagnostic,
  };
}
