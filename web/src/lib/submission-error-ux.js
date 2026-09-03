// Submission-error UX view-model for the agentic-graph Cloudflare Pages frontend.
//
// Spec: agentic-graph-acos-mcp-connector, task 7.9 (R1.8; design Frontend
// `submitRun` "on error/timeout (30s) shows an error and retains inputs";
// design Correctness Property 32 manifest/UX completeness).
//
// R1.8: "IF the Agent_Api returns an error response OR no response within 30
// seconds for the `POST /run` submission, THEN THE Frontend SHALL display an
// error message indicating the run could not be initiated AND SHALL retain the
// end creator user's submitted inputs."
//
// This module is the PURE, framework-agnostic, ZERO-network / ZERO-browser /
// ZERO-timer view-model builder that turns the OUTCOME of a `POST /run`
// submission (the resolved `submitRun` result, OR a thrown transport error,
// PLUS how long the response took) into a render-ready view:
//
//   { status, errorIndication, retainedInputs, timedOut, advance, ... }
//
// REUSE (do NOT fork): the submission field set `{ referenceUrl, brief,
// budgetUsd }` mirrors the validated submission produced by
// `submission-validation.js` (task 7.1) and forwarded by
// `run-submission-client.js` (task 7.2). The 30,000 ms response window here is
// the UX-side analogue of the structural deadline pattern used across the
// product/worker tiers (`RUN_SUBMIT_DEADLINE_MS`, `MCP_FORWARD_DEADLINE_MS`,
// health `checkElapsedMs`): there is NO real timer — the caller injects the
// observed elapsed time so the outcome is asserted structurally.
//
// STACK BOUNDARY (R11): the product tier holds no model provider keys; this
// builder reads only the submission + outcome and performs no I/O.

// --- Contract constants (single source of truth) ----------------------------

/**
 * The response window for a `POST /run` submission (R1.8). If no response is
 * observed within this window the submission is treated as timed out. Timer-free
 * here — the caller injects the observed `responseElapsedMs`.
 */
export const RUN_RESPONSE_DEADLINE_MS = 30_000;

/** Submission-outcome status values surfaced to the UI. */
export const SUBMISSION_STATUS = Object.freeze({
  SUCCESS: "success",
  ERROR: "error",
  TIMED_OUT: "timed_out",
});

/** Error-indication codes surfaced to the UI for a failed submission. */
export const SUBMISSION_ERROR_CODE = Object.freeze({
  TIMED_OUT: "timed_out",
  ERROR_RESPONSE: "error_response",
  NO_RESPONSE: "no_response",
});

/**
 * The single user-facing message for a failed submission (R1.8): the run could
 * not be initiated. Kept identical across failure modes so the UI shows one
 * clear message; the machine-readable `code` distinguishes the cause.
 */
export const RUN_NOT_INITIATED_MESSAGE =
  "The run could not be initiated. Your inputs have been kept so you can try again.";

/** The submission fields retained verbatim on a failed submission (R1.8). */
const RETAINED_FIELDS = Object.freeze(["referenceUrl", "brief", "budgetUsd"]);

// --- Helpers ----------------------------------------------------------------

/**
 * Extract the user's submitted inputs to retain on failure (R1.8). Returns a
 * SHALLOW COPY of ONLY the known submission fields, so the retained value can be
 * fed straight back into the form without leaking unrelated/internal fields.
 * Missing fields are preserved as `undefined` so the form keys stay stable.
 *
 * Never throws for malformed input: a non-object submission yields an object
 * with all fields `undefined`.
 *
 * @param {unknown} submission `{ referenceUrl, brief, budgetUsd }`
 * @returns {{ referenceUrl: unknown, brief: unknown, budgetUsd: unknown }}
 */
export function extractRetainedInputs(submission) {
  const src =
    submission && typeof submission === "object" && !Array.isArray(submission)
      ? submission
      : {};
  const retained = {};
  for (const field of RETAINED_FIELDS) {
    retained[field] = src[field];
  }
  return retained;
}

/**
 * Resolve the (timer-free) observed response-elapsed signal. The real elapsed
 * time is measured by the live wiring; here the caller injects it so the 30,000
 * ms window can be evaluated structurally. A missing/invalid value defaults to 0
 * (treated as an immediate response — never a spurious timeout).
 *
 * @param {unknown} value
 * @returns {number}
 */
function resolveResponseElapsedMs(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Decide whether a resolved `submitRun` result represents an ERROR response
 * from the Agent_Api (R1.8 "returns an error response"). Tolerant of several
 * shapes WITHOUT forking a schema:
 *   - a fetch-like Response: `ok === false` OR a numeric `status >= 400`
 *   - a structured failure envelope: a truthy `error`, or `forwarded === false`
 *     with `valid === true` (validation passed but the forward did not land)
 *   - an explicit `{ ok: false }`
 *
 * A nullish result is NOT itself an error here (the "no response" degenerate
 * case is handled separately so it can be reported distinctly).
 *
 * @param {unknown} result
 * @returns {boolean}
 */
export function isErrorResult(result) {
  if (!result || typeof result !== "object") return false;

  if (result.ok === false) return true;
  if (Number.isFinite(result.status) && result.status >= 400) return true;
  if (result.error !== undefined && result.error !== null) return true;
  // A valid-but-not-forwarded submitRun envelope is a failed initiation.
  if (result.valid === true && result.forwarded === false) return true;

  return false;
}

/**
 * Derive a stable error indication `{ code, message, detail }` for a failed
 * submission. The user-facing `message` is constant (R1.8); `code` carries the
 * machine-readable cause and `detail` carries a best-effort, non-throwing
 * description pulled from the error/result for diagnostics (never shown as the
 * primary message).
 *
 * @param {string} code one of SUBMISSION_ERROR_CODE
 * @param {unknown} [source] the error or result the indication derives from
 * @returns {{ code: string, message: string, detail: string|null }}
 */
function buildErrorIndication(code, source) {
  let detail = null;
  if (source && typeof source === "object") {
    if (typeof source.message === "string" && source.message) {
      detail = source.message;
    } else if (typeof source.error === "string" && source.error) {
      detail = source.error;
    } else if (Number.isFinite(source.status)) {
      detail = `HTTP ${source.status}`;
    }
  } else if (typeof source === "string" && source) {
    detail = source;
  }
  return { code, message: RUN_NOT_INITIATED_MESSAGE, detail };
}

// --- Public API -------------------------------------------------------------

/**
 * Resolve the submission-error UX outcome for a `POST /run` submission (R1.8).
 *
 * Given the user's `submission`, the submission OUTCOME (either a resolved
 * `result` or a thrown `error`), and the observed `responseElapsedMs`, produce a
 * render-ready view-model:
 *
 *   - On NO response within 30,000 ms (`responseElapsedMs > 30,000`): status
 *     `timed_out`, an error indication, and the user's inputs are RETAINED.
 *   - On an ERROR response / thrown transport error (within the window): status
 *     `error`, an error indication, and the user's inputs are RETAINED.
 *   - On a SUCCESS response within the window: status `success`, NO error
 *     indication, inputs are NOT retained (the flow advances).
 *   - Degenerate (no result, no error, within window): treated as a failed
 *     initiation (`error` / `no_response`) with inputs RETAINED — never a
 *     silent success.
 *
 * The 30,000 ms boundary is INCLUSIVE of "within": a response observed at
 * exactly 30,000 ms is on-time; only strictly more than 30,000 ms times out.
 *
 * Pure and deterministic: performs no I/O, uses no real timer, never mutates the
 * input, and never throws for malformed input.
 *
 * @param {{
 *   submission?: unknown,
 *   result?: unknown,
 *   error?: unknown,
 *   responseElapsedMs?: number,
 * }} [args]
 * @returns {{
 *   status: string,
 *   ok: boolean,
 *   advance: boolean,
 *   timedOut: boolean,
 *   errorIndication: { code: string, message: string, detail: string|null } | null,
 *   retainedInputs: { referenceUrl: unknown, brief: unknown, budgetUsd: unknown } | null,
 *   responseElapsedMs: number,
 *   responseDeadlineMs: number,
 *   result?: unknown,
 * }}
 */
export function resolveSubmissionOutcome(args = {}) {
  const safeArgs = args && typeof args === "object" ? args : {};
  const { submission, result, error } = safeArgs;

  const responseElapsedMs = resolveResponseElapsedMs(safeArgs.responseElapsedMs);
  const timedOut = responseElapsedMs > RUN_RESPONSE_DEADLINE_MS;

  const hasError = error !== undefined && error !== null;
  const hasResult = result !== undefined && result !== null;
  const resultIsError = isErrorResult(result);

  // --- Failure modes (inputs retained) ---------------------------------------
  // No response within 30s takes precedence: per R1.8 a late response is still a
  // failed initiation regardless of what eventually arrives.
  if (timedOut) {
    return {
      status: SUBMISSION_STATUS.TIMED_OUT,
      ok: false,
      advance: false,
      timedOut: true,
      errorIndication: buildErrorIndication(
        SUBMISSION_ERROR_CODE.TIMED_OUT,
        hasError ? error : result,
      ),
      retainedInputs: extractRetainedInputs(submission),
      responseElapsedMs,
      responseDeadlineMs: RUN_RESPONSE_DEADLINE_MS,
      result,
    };
  }

  if (hasError || resultIsError) {
    return {
      status: SUBMISSION_STATUS.ERROR,
      ok: false,
      advance: false,
      timedOut: false,
      errorIndication: buildErrorIndication(
        SUBMISSION_ERROR_CODE.ERROR_RESPONSE,
        hasError ? error : result,
      ),
      retainedInputs: extractRetainedInputs(submission),
      responseElapsedMs,
      responseDeadlineMs: RUN_RESPONSE_DEADLINE_MS,
      result,
    };
  }

  // Degenerate: neither a result nor an error arrived within the window. This is
  // not a success — the run could not be initiated, so retain inputs (R1.8).
  if (!hasResult) {
    return {
      status: SUBMISSION_STATUS.ERROR,
      ok: false,
      advance: false,
      timedOut: false,
      errorIndication: buildErrorIndication(SUBMISSION_ERROR_CODE.NO_RESPONSE),
      retainedInputs: extractRetainedInputs(submission),
      responseElapsedMs,
      responseDeadlineMs: RUN_RESPONSE_DEADLINE_MS,
      result,
    };
  }

  // --- Success (inputs cleared / flow advances) ------------------------------
  return {
    status: SUBMISSION_STATUS.SUCCESS,
    ok: true,
    advance: true,
    timedOut: false,
    errorIndication: null,
    retainedInputs: null,
    responseElapsedMs,
    responseDeadlineMs: RUN_RESPONSE_DEADLINE_MS,
    result,
  };
}
