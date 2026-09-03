// Stage-transition diagnostics (R14.5 / Property 27, task 1.5). Extracted
// verbatim from `run-manifest-store.mjs` (reuse-not-rebuild): WHEN a Director
// run transitions from one stage to another, the Mcp_Agent emits an
// observability diagnostic record `{ runId, fromStage, toStage, utcTimestamp,
// outcomeStatus }`, derived directly from the manifest's ordered `stages[]`.

import {
  STAGE_TRANSITION_DIAGNOSTIC_TYPE,
  writeDiagnosticToConsole,
  extractRunId,
} from "./shared.mjs";

/**
 * Default observability sink for stage-transition diagnostics (R14.5).
 * Delegates to the same shared console writer as the persistence-failure
 * emitter so both diagnostic kinds share one sink.
 */
export function defaultStageTransitionDiagnosticEmitter(diagnostic) {
  writeDiagnosticToConsole(STAGE_TRANSITION_DIAGNOSTIC_TYPE, diagnostic);
}

// ---------------------------------------------------------------------------
// Stage-transition diagnostics (R14.5 / Property 27, task 1.5).
//
//   WHEN a Director run transitions from one stage to another, THE Mcp_Agent
//   SHALL emit an observability diagnostic record containing the run id, the
//   originating stage id, the destination stage id, a UTC timestamp, and the
//   transition outcome status.
//
// The Director (`mcp/video-remix-runtime.js`) returns the resulting
// Run_Manifest with an ordered source-owned `stages[]` sequence, including
// early-halt and blocked stages.
// We derive one diagnostic per consecutive transition straight from that
// ordered sequence so the diagnostics track exactly the stages the Director
// produced - no second source of truth (reuse-not-rebuild). The diagnostic
// carries exactly the five fields the requirement enumerates; the outcome
// status reflects the destination stage's status/outcome.
// ---------------------------------------------------------------------------

/**
 * Build a single stage-transition diagnostic with exactly the fields
 * `{ runId, fromStage, toStage, utcTimestamp, outcomeStatus }` (R14.5).
 * `utcTimestamp` is an ISO-8601 UTC string; `outcomeStatus` falls back to
 * `"unknown"` when the destination stage carries no status.
 *
 * @param {{ runId?: string | null, fromStage?: string | null, toStage?: string | null, outcomeStatus?: string | null, nowMs?: number }} [options]
 */
export function buildStageTransitionDiagnostic({
  runId = null,
  fromStage = null,
  toStage = null,
  outcomeStatus = null,
  nowMs,
} = {}) {
  const ts = Number.isFinite(nowMs) ? nowMs : Date.now();
  const status =
    outcomeStatus != null && String(outcomeStatus).length > 0
      ? String(outcomeStatus)
      : "unknown";
  return {
    runId: runId ? String(runId) : null,
    fromStage: fromStage ? String(fromStage) : null,
    toStage: toStage ? String(toStage) : null,
    utcTimestamp: new Date(ts).toISOString(),
    outcomeStatus: status,
  };
}

/**
 * Derive the ordered list of stage-transition diagnostics for a Run_Manifest.
 * One diagnostic is produced per consecutive pair of stages in the manifest's
 * `stages[]` array (the Director's ordered stage sequence), so an N-stage run
 * yields N-1 transitions. The `outcomeStatus` of each transition reflects the
 * destination stage's status (R14.5).
 *
 * Returns an empty array for a manifest with fewer than two stages (no
 * transition occurred) or a missing/!-object manifest.
 *
 * @param {{ runId?: string, stages?: Array<{ id?: string, status?: string }> }} manifest
 * @param {{ nowMs?: number }} [options]
 */
export function deriveStageTransitionDiagnostics(manifest, { nowMs } = {}) {
  if (!manifest || typeof manifest !== "object") return [];
  const runId = extractRunId(manifest);
  const stages = Array.isArray(manifest.stages) ? manifest.stages : [];
  const ordered = stages.filter(
    (stage) =>
      stage &&
      typeof stage === "object" &&
      stage.id != null &&
      String(stage.id).length > 0,
  );
  const diagnostics = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const fromStage = ordered[index - 1];
    const toStage = ordered[index];
    diagnostics.push(
      buildStageTransitionDiagnostic({
        runId,
        fromStage: fromStage.id,
        toStage: toStage.id,
        outcomeStatus: toStage.status,
        nowMs,
      }),
    );
  }
  return diagnostics;
}

/**
 * Derive and emit one stage-transition diagnostic per transition in the
 * Run_Manifest (R14.5). The emitter is injectable so tests can capture the
 * emitted records; it defaults to the shared console-backed sink. A throwing
 * emitter never propagates into the Director/persistence path. Returns the
 * derived diagnostics so callers can attach them to the tool response or
 * assert on them.
 *
 * @param {{ manifest: object, emit?: (diagnostic: object) => void, nowMs?: number }} options
 */
export function emitStageTransitionDiagnostics({
  manifest,
  emit = defaultStageTransitionDiagnosticEmitter,
  nowMs,
} = {}) {
  const diagnostics = deriveStageTransitionDiagnostics(manifest, { nowMs });
  const sink =
    typeof emit === "function" ? emit : defaultStageTransitionDiagnosticEmitter;
  for (const diagnostic of diagnostics) {
    try {
      sink(diagnostic);
    } catch {
      /* never let an injected emitter throw into the run path */
    }
  }
  return diagnostics;
}
