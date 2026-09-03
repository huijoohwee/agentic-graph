// Bounded-retry failure-handling model for the video-remix Director runtime
// (spec tasks 2.6 / 2.7 — R5.1, R5.2, R5.3, R5.4 / Property 8).
//
// DETERMINISTIC, PURE, timer-free policy extracted verbatim from
// `mcp/video-remix-runtime.js` (reuse-not-rebuild): it maps an attempt index to
// the backoff delay a real scheduler WOULD wait, so the policy is
// unit/property testable without timers. Importable by both the Node tests and
// the Cloudflare Worker bundle.

import {
  DEFAULT_MAX_ITERATIONS,
  MAX_ITERATIONS_MIN,
  MAX_ITERATIONS_MAX,
  RETRY_BACKOFF_BASE_MS,
  RETRY_BACKOFF_CAP_MS,
  RETRY_RUN_STATE_RUNNING,
  RETRY_RUN_STATE_EXHAUSTED,
  RUN_STATE_BLOCKED,
  FAILURE_REASON_EXHAUSTED,
} from "./constants.js";
import { cleanString } from "./helpers.js";

/**
 * Normalize and clamp `maxIterations` to the inclusive range [1,100] (R5.2).
 *
 * Non-finite / missing values fall back to `fallback` (default
 * `DEFAULT_MAX_ITERATIONS`), which is itself clamped into range. A fractional
 * value is floored before clamping (iterations are whole attempts).
 *
 * NOTE: this is intentionally SEPARATE from `normalizeCount` (which clamps to
 * [1,12] and is shared with `shotCount`). `maxIterations` has its own [1,100]
 * domain per R5.2 and the worker schema; reusing `normalizeCount` would have
 * silently capped a valid `maxIterations` of, say, 50 down to 12.
 */
export function normalizeMaxIterations(value, fallback = DEFAULT_MAX_ITERATIONS) {
  const number = Number(value);
  const fallbackNumber = Number(fallback);
  const safeFallback = Number.isFinite(fallbackNumber)
    ? Math.floor(fallbackNumber)
    : DEFAULT_MAX_ITERATIONS;
  const candidate = Number.isFinite(number) ? Math.floor(number) : safeFallback;
  return Math.max(MAX_ITERATIONS_MIN, Math.min(MAX_ITERATIONS_MAX, candidate));
}

/**
 * Pure exponential-backoff delay for a zero-based attempt index (R5.1).
 *
 *   attemptIndex 0 -> 1000ms (1s)
 *   attemptIndex 1 -> 2000ms (2s)
 *   attemptIndex 2 -> 4000ms (4s)
 *   ...doubling...
 *   capped at `capMs` (default 30000ms / 30s)
 *
 * `baseMs` / `capMs` are overridable (kept for testability); invalid overrides
 * fall back to the R5.1 defaults. The growth term is guarded against overflow
 * for very large indices so the result is always a finite, capped delay.
 */
export function computeRetryBackoffMs(attemptIndex, options = {}) {
  const baseRaw = Number(options.baseMs);
  const capRaw = Number(options.capMs);
  const baseMs = Number.isFinite(baseRaw) && baseRaw > 0 ? baseRaw : RETRY_BACKOFF_BASE_MS;
  const capMs = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : RETRY_BACKOFF_CAP_MS;
  const idx = Math.max(0, Math.floor(Number(attemptIndex) || 0));
  // 2**53 already dwarfs any sane cap; short-circuit to avoid Infinity math.
  const grown = idx >= 53 ? Number.POSITIVE_INFINITY : baseMs * 2 ** idx;
  return Math.min(capMs, grown);
}

/**
 * Run_State for a given `retryCount` under `maxIterations` (R5.3): `running`
 * while `retryCount < maxIterations`, otherwise the `exhausted` seam marker
 * (task 2.7 maps `exhausted` -> `blocked` + failure record). `maxIterations`
 * is normalized into [1,100] first.
 */
export function retryRunStateFor(retryCount, maxIterations) {
  const bounded = normalizeMaxIterations(maxIterations);
  const count = Math.max(0, Math.floor(Number(retryCount) || 0));
  return count < bounded ? RETRY_RUN_STATE_RUNNING : RETRY_RUN_STATE_EXHAUSTED;
}

/**
 * Fail-closed Run_State decision for a stage's `retryCount` under
 * `maxIterations` (spec task 2.7 / R5.4 / Property 8 — exhaustion half).
 *
 * This is the seam that maps the `exhausted` marker surfaced by task 2.6
 * (`retryRunStateFor` / `buildBoundedRetryPlan().exhaustionRunState`) to the
 * actual Director Run_State transition:
 *   - WHILE `retryCount < maxIterations` the run stays `running` (R5.3);
 *   - once `retryCount` reaches `maxIterations` the run FAILS CLOSED to
 *     `blocked` (R5.4) — all further stage iterations halt and a failure
 *     record is appended to the Run_Manifest (see `buildExhaustionFailureRecord`).
 *
 * Returns `"running"` (non-exhausted, keep retrying) or `"blocked"` (exhausted,
 * fail closed). Pure and timer-free, so the transition is unit/property testable.
 */
export function exhaustionRunState(retryCount, maxIterations) {
  return retryRunStateFor(retryCount, maxIterations) === RETRY_RUN_STATE_EXHAUSTED
    ? RUN_STATE_BLOCKED
    : RETRY_RUN_STATE_RUNNING;
}

/**
 * Build the canonical R5.4 failure record appended to the Run_Manifest on
 * retry exhaustion (spec task 2.7). The shape is exactly the design
 * Run_Manifest `failures[]` element — `{ stageId, finalRetryCount, reason }` —
 * so the top-level Run_Manifest `failures[]` and the per-failure entries in
 * `failureHandling.failures` share one canonical field set rather than two
 * divergent shapes.
 */
export function buildExhaustionFailureRecord({ stageId, finalRetryCount, reason } = {}) {
  return {
    stageId: cleanString(stageId, "unknown_stage"),
    finalRetryCount: Math.max(0, Math.floor(Number(finalRetryCount) || 0)),
    reason: cleanString(reason, FAILURE_REASON_EXHAUSTED),
  };
}

/**
 * Derive a stage identifier from an injected-failure tool name. Strips the
 * canonical `agentic-graph.video_remix.` prefix (so `…render` -> `render`); for any
 * other dotted tool name it falls back to the last dotted segment, and to the
 * raw value when there is no dot. Used to populate the `stageId` field of a
 * failure record (R5.4) from the deterministic test-injection tool name.
 */
function deriveFailureStageId(toolName) {
  const clean = cleanString(toolName);
  if (!clean) return "";
  const knownPrefix = "agentic-graph.video_remix.";
  if (clean.startsWith(knownPrefix)) {
    const stage = clean.slice(knownPrefix.length);
    return stage || clean;
  }
  const segments = clean.split(".");
  return segments[segments.length - 1] || clean;
}

/**
 * Build the deterministic bounded-retry plan for a stage (task 2.6 /
 * R5.1–R5.3 / Property 8 partial). Produces a `schedule` of exactly
 * `maxIterations` attempts (R5.2 — total iterations bounded by maxIterations);
 * each entry carries:
 *   - `attempt` / `retryCount`: 1-based, incrementing by exactly 1 (R5.1),
 *   - `delayMs`: the exponential backoff delay for that attempt (R5.1),
 *   - `runState`: `running` while `retryCount < maxIterations`, else
 *     `exhausted` (R5.3 + task 2.7 seam).
 *
 * Pure and timer-free: the schedule states what a scheduler WOULD wait, so the
 * policy is fully unit/property testable. The fail-closed transition at the
 * final (`exhausted`) entry is task 2.7.
 */
export function buildBoundedRetryPlan({ maxIterations, baseMs, capMs } = {}) {
  const bounded = normalizeMaxIterations(maxIterations);
  const backoffOptions = { baseMs, capMs };
  const resolvedBaseMs =
    Number.isFinite(Number(baseMs)) && Number(baseMs) > 0 ? Number(baseMs) : RETRY_BACKOFF_BASE_MS;
  const resolvedCapMs =
    Number.isFinite(Number(capMs)) && Number(capMs) > 0 ? Number(capMs) : RETRY_BACKOFF_CAP_MS;
  const schedule = Array.from({ length: bounded }, (_, index) => {
    const retryCount = index + 1; // increments by exactly 1 per attempt (R5.1)
    return {
      attempt: retryCount,
      retryCount,
      delayMs: computeRetryBackoffMs(index, backoffOptions), // index 0 -> 1s
      runState: retryCount < bounded ? RETRY_RUN_STATE_RUNNING : RETRY_RUN_STATE_EXHAUSTED,
    };
  });
  return {
    maxIterations: bounded,
    baseMs: resolvedBaseMs,
    capMs: resolvedCapMs,
    schedule,
    // Seam for task 2.7: the run-state once retries are exhausted. This model
    // only marks it; task 2.7 performs the `blocked` transition + failure record.
    exhaustionRunState: RETRY_RUN_STATE_EXHAUSTED,
  };
}

export async function runWithBoundedRetry(operation, options = {}) {
  if (typeof operation !== "function") throw new TypeError("operation must be a function");
  const maxIterations = normalizeMaxIterations(options.maxIterations);
  const wait = typeof options.wait === "function"
    ? options.wait
    : (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));
  const attempts = [];
  let lastError = null;
  for (let index = 0; index < maxIterations; index += 1) {
    const attempt = index + 1;
    try {
      const value = await operation({ attempt, retryCount: index });
      attempts.push({ attempt, status: "complete", delayMs: index === 0 ? 0 : computeRetryBackoffMs(index - 1) });
      return { ok: true, value, attempts, finalRetryCount: index };
    } catch (error) {
      lastError = error;
      const exhausted = attempt >= maxIterations;
      attempts.push({
        attempt,
        status: exhausted ? RETRY_RUN_STATE_EXHAUSTED : "retry_scheduled",
        delayMs: exhausted ? 0 : computeRetryBackoffMs(index),
        reason: cleanString(error?.message, "operation_failed"),
      });
      if (exhausted) break;
      if (typeof options.onRetry === "function") options.onRetry(attempts[attempts.length - 1]);
      await wait(attempts[attempts.length - 1].delayMs);
    }
  }
  return { ok: false, error: lastError, attempts, finalRetryCount: maxIterations };
}

export { deriveFailureStageId };
