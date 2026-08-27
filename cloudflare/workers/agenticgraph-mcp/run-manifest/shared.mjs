// Shared constants + base helpers for the Run_Manifest persistence modules
// (knowgrph-acos-mcp-connector spec). Extracted verbatim from
// `run-manifest-store.mjs` (reuse-not-rebuild) so the cohesive modules under
// `run-manifest/` share one source of truth for the storage keys, persistence
// deadline / failure status, the stage-transition diagnostic type, the shared
// console diagnostic sink, error-message coercion, and runId extraction.

/** Storage keys used inside each per-run Durable Object instance. */
export const RUN_MANIFEST_STORAGE_KEYS = Object.freeze({
  manifest: "manifest",
  persistedAt: "persistedAt",
  runId: "runId",
  contractVersion: "contractVersion",
  runNoteReceipts: "runNoteReceipts",
});

/**
 * Persistence deadline per R14.2: a Director run state change must be
 * written within 2,000 ms of the change, such that a subsequent
 * `GET /runs/{id}` returns the latest persisted state.
 */
export const RUN_MANIFEST_PERSISTENCE_DEADLINE_MS = 2000;

/**
 * Status code carried by a persistence-failure response/diagnostic (R14.3).
 * Stable string so downstream callers (McpAgent tool response, Agent_Api
 * error mapping) can branch on it without string-matching messages.
 */
export const RUN_MANIFEST_PERSISTENCE_FAILURE_STATUS = "persistence_failed";

/**
 * Stable `type` discriminator for stage-transition diagnostics (R14.5 /
 * task 1.5). Lets a unified emitter/collector branch on the diagnostic kind
 * without string-matching free-form messages.
 */
export const STAGE_TRANSITION_DIAGNOSTIC_TYPE = "stage_transition";

/**
 * Single console-backed diagnostic sink shared by every default emitter in
 * this module (persistence-failure - task 1.3 - and stage-transition -
 * task 1.5). Unifying on one writer avoids a second ad-hoc `console` sink:
 * each default emitter just supplies its own log label and forwards the
 * structured diagnostic so it surfaces in Workers logs / tail. Callers may
 * inject their own emitter (e.g. for tests or a metrics pipeline) wherever an
 * `emitDiagnostic` hook is accepted.
 */
function writeDiagnosticToConsole(label, diagnostic) {
  try {
    // eslint-disable-next-line no-console
    console.error(`[knowgrph-mcp] ${label}`, diagnostic);
  } catch {
    /* never let diagnostics throw into the run/persistence path */
  }
}

function toErrorMessage(error) {
  if (!error) return "unknown persistence failure";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return String(error?.message ?? error);
  } catch {
    return "unknown persistence failure";
  }
}

/**
 * Validate and normalize a runId pulled from a Run_Manifest payload.
 * Returns a non-empty trimmed string, or `null` if the manifest is missing
 * a usable runId.
 */
export function extractRunId(manifest) {
  if (!manifest || typeof manifest !== "object") return null;
  const id = String(manifest.runId ?? "").trim();
  return id || null;
}

export { writeDiagnosticToConsole, toErrorMessage };
