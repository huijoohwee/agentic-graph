// Client-side submission validation for the agenticgraph Cloudflare Pages frontend.
//
// Spec: agenticgraph-acos-mcp-connector, task 7.1 (R1.2; design Frontend
// `submitRun`; Correctness Property 5).
//
// Pure, deterministic, ZERO-dependency, ZERO-network/ZERO-browser validator for
// the creator submission `{ referenceUrl, brief, budgetUsd }`. It returns a
// structured result
//   { valid: boolean, errors: Array<{ field, reason }> }
// where each error names the offending field and the reason it failed, so the
// UI can render a field-specific error message, and a thin submit guard can
// gate the `POST /run` forward on `valid`.
//
// This is the FIRST gate. The client-side bounds here are intentionally
// TIGHTER than the server-side `POST /run` bounds (task 5.2: brief ≤ 10,000;
// budget ≤ 999,999,999.99). The Agent_Api re-validates everything regardless;
// this gate exists to give the creator immediate, specific feedback and to
// avoid a needless round-trip (R1.2 / Property 5).
//
// Client-side schema (R1.2):
//   - referenceUrl : required, non-empty, absolute http/https URL
//   - brief        : required string, length 1..5,000 chars
//   - budgetUsd    : number in [0.01, 999,999.99]

// --- Client-side bounds (single source of truth) ----------------------------

/** Minimum length of `brief`, in characters. */
export const BRIEF_MIN_LENGTH = 1;
/** Maximum length of `brief`, in characters (client-side, tighter than server). */
export const BRIEF_MAX_LENGTH = 5_000;
/** Minimum permitted `budgetUsd` value (inclusive). */
export const BUDGET_USD_MIN = 0.01;
/** Maximum permitted `budgetUsd` value (inclusive, client-side cap). */
export const BUDGET_USD_MAX = 999_999.99;

/** Absolute-URL schemes accepted for `referenceUrl`. */
const ALLOWED_URL_PROTOCOLS = Object.freeze(["http:", "https:"]);

// --- Field validators (each pushes 0..n structured errors) ------------------

/**
 * Validate `referenceUrl`: required, non-empty, an absolute http/https URL.
 *
 * @param {unknown} value
 * @param {Array<{ field: string, reason: string }>} errors
 */
function validateReferenceUrl(value, errors) {
  const field = "referenceUrl";

  if (value === undefined || value === null) {
    errors.push({ field, reason: "referenceUrl is required" });
    return;
  }
  if (typeof value !== "string") {
    errors.push({ field, reason: "referenceUrl must be a string" });
    return;
  }
  if (value.length === 0) {
    errors.push({ field, reason: "referenceUrl must not be empty" });
    return;
  }

  let parsed;
  try {
    // The URL constructor throws on relative/invalid URLs, giving us an
    // "absolute URL" check with zero dependencies and zero network calls.
    parsed = new URL(value);
  } catch {
    errors.push({ field, reason: "referenceUrl must be an absolute URL" });
    return;
  }
  if (!ALLOWED_URL_PROTOCOLS.includes(parsed.protocol)) {
    errors.push({
      field,
      reason: "referenceUrl must use the http or https scheme",
    });
  }
}

/**
 * Validate `brief`: required string of length BRIEF_MIN_LENGTH..BRIEF_MAX_LENGTH.
 *
 * @param {unknown} value
 * @param {Array<{ field: string, reason: string }>} errors
 */
function validateBrief(value, errors) {
  const field = "brief";

  if (value === undefined || value === null) {
    errors.push({ field, reason: "brief is required" });
    return;
  }
  if (typeof value !== "string") {
    errors.push({ field, reason: "brief must be a string" });
    return;
  }
  if (value.length < BRIEF_MIN_LENGTH) {
    errors.push({ field, reason: "brief must not be empty" });
    return;
  }
  if (value.length > BRIEF_MAX_LENGTH) {
    errors.push({
      field,
      reason: `brief must be at most ${BRIEF_MAX_LENGTH} characters (got ${value.length})`,
    });
  }
}

/**
 * Validate `budgetUsd`: a finite number in [BUDGET_USD_MIN, BUDGET_USD_MAX].
 *
 * @param {unknown} value
 * @param {Array<{ field: string, reason: string }>} errors
 */
function validateBudgetUsd(value, errors) {
  const field = "budgetUsd";

  if (value === undefined || value === null) {
    errors.push({ field, reason: "budgetUsd is required" });
    return;
  }
  // Reject booleans, strings, NaN, Infinity — only finite numbers qualify.
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push({ field, reason: "budgetUsd must be a finite number" });
    return;
  }
  if (value < BUDGET_USD_MIN || value > BUDGET_USD_MAX) {
    errors.push({
      field,
      reason: `budgetUsd must be between ${BUDGET_USD_MIN} and ${BUDGET_USD_MAX} inclusive (got ${value})`,
    });
  }
}

// --- Public API -------------------------------------------------------------

/**
 * Validate a creator submission against the R1.2 client-side schema.
 *
 * Pure and deterministic: it performs no I/O and never throws for malformed
 * input — every problem is reported as a structured `{ field, reason }` entry.
 *
 * @param {unknown} submission `{ referenceUrl, brief, budgetUsd }`
 * @returns {{ valid: boolean, errors: Array<{ field: string, reason: string }> }}
 */
export function validateSubmission(submission) {
  const errors = [];

  if (
    submission === undefined ||
    submission === null ||
    typeof submission !== "object" ||
    Array.isArray(submission)
  ) {
    errors.push({ field: "submission", reason: "submission must be an object" });
    return { valid: false, errors };
  }

  validateReferenceUrl(submission.referenceUrl, errors);
  validateBrief(submission.brief, errors);
  validateBudgetUsd(submission.budgetUsd, errors);

  return { valid: errors.length === 0, errors };
}

/**
 * Thin submit guard: forwards a submission to `POST /run` (via the injected
 * `forward` seam) ONLY when client-side validation passes. On any violation it
 * does NOT forward; instead it returns the structured errors so the caller can
 * display a field-specific error message (R1.2 / Property 5).
 *
 * The actual `POST /run` network wiring is task 7.2; this guard models only the
 * "do not forward when invalid" boundary and keeps the logic network-free and
 * unit-testable. `forward` is invoked with the validated submission and its
 * resolved value is returned under `result` when forwarding occurs.
 *
 * @param {unknown} submission `{ referenceUrl, brief, budgetUsd }`
 * @param {(submission: object) => unknown} [forward] seam invoked iff valid
 * @returns {Promise<{
 *   forwarded: boolean,
 *   valid: boolean,
 *   errors: Array<{ field: string, reason: string }>,
 *   result?: unknown,
 * }>}
 */
export async function guardedSubmit(submission, forward) {
  const { valid, errors } = validateSubmission(submission);

  if (!valid) {
    // Do NOT forward to POST /run on any violation (R1.2 / Property 5).
    return { forwarded: false, valid: false, errors };
  }

  if (typeof forward !== "function") {
    // Valid but no forward seam wired yet (task 7.2 owns the POST wiring).
    return { forwarded: false, valid: true, errors: [] };
  }

  const result = await forward(submission);
  return { forwarded: true, valid: true, errors: [], result };
}
