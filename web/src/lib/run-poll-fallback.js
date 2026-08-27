// 503 polling-fallback driver for the agenticgraph Cloudflare Pages frontend.
//
// Spec: agenticgraph-acos-mcp-connector, task 7.11 (R13.5; design Frontend "503
// fallback"; Error Handling › "Agent_Api saturation (R12.4) → Frontend falls
// back to polling GET /runs/{id} every 5s up to 12 attempts (R13.5)").
//
// R13.5: "IF the Agent_Api returns HTTP 503, THEN THE Frontend SHALL fall back
// to polling `GET /runs/{id}` for run status at 5-second intervals for a
// maximum of 12 attempts, and SHALL resume normal Agent_Api operation when a
// non-503 response is received."
//
// SCOPE OF THIS TASK (7.11): given that normal operation hit an HTTP 503, drive
// the fallback loop — poll `GET /runs/{id}` at a 5,000 ms interval for at most
// 12 attempts, RESUMING normal operation on the FIRST confirmed non-503
// response, and GIVING UP with an exhaustion indication after 12 consecutive
// 503s.
//
// PURE + INJECTABLE + TIMER-FREE: the poll itself goes THROUGH AN INJECTABLE
// POLL SEAM and the 5,000 ms wait between attempts goes THROUGH AN INJECTABLE
// `advance` SEAM, so the local runtime/tests make ZERO live network calls and
// use ZERO real timers. The live wiring swaps in a real `fetch` for the poll
// and a real `setTimeout`-backed delay for `advance`; the 5,000 ms interval and
// 12-attempt cap are recorded as STRUCTURAL METADATA and asserted structurally.
//
// FAIL-CLOSED ON UNCERTAINTY: normal operation resumes ONLY on a confirmed
// non-503 HTTP status. A 503 keeps polling; a MALFORMED outcome (an
// unparseable return value OR a thrown poll) is treated as "no confirmed
// recovery yet" and keeps polling (never throws), draining to the 12-attempt
// cap rather than resuming into a possibly-still-broken state.
//
// STACK BOUNDARY (R11/R15.7): the product tier holds NO model provider keys and
// NO authentication secret. This driver attaches ONLY the caller-supplied
// Auth_Token; it never reads, embeds, or transmits any model provider key or
// signing secret. The Auth_Token is opaque to the driver.

import { buildAuthHeader } from "./run-submission-client.js";

// --- Contract constants -----------------------------------------------------

/**
 * Poll interval (R13.5): the Frontend polls `GET /runs/{id}` at 5,000 ms
 * intervals. Timer-free here — the wait is delegated to the injectable
 * `advance` seam; this value is recorded as structural metadata and is the ms
 * value handed to `advance` before each poll attempt.
 */
export const POLL_INTERVAL_MS = 5000;

/**
 * Maximum poll attempts (R13.5): at most 12 polls before giving up. The 12th
 * consecutive 503 exhausts the fallback budget; there is no 13th poll.
 */
export const MAX_POLL_ATTEMPTS = 12;

/** The HTTP status that keeps the fallback polling (R13.5 / R12.4). */
export const SERVICE_UNAVAILABLE_STATUS = 503;

/** Default Agent_Api run-status endpoint template. `{id}` is substituted. */
export const RUN_STATUS_PATH_TEMPLATE = "/runs/{id}";

/** HTTP method used to poll run status (design `GET /runs/{id}`). */
export const RUN_STATUS_METHOD = "GET";

/**
 * Typed polling error surfaced when the driver cannot even begin (e.g. a blank
 * `runId`). Loop-time poll failures are absorbed (fail-closed) rather than
 * thrown — see the module header.
 */
export class RunPollError extends Error {
  constructor(message, code = "run_poll_failed") {
    super(message);
    this.name = "RunPollError";
    this.code = code;
  }
}

/**
 * Default poll seam. Until the live `GET /runs/{id}` `fetch` is wired, invoking
 * the driver without an injected poll surfaces a clearly-tagged not-implemented
 * signal rather than silently succeeding or making a live call. (The driver
 * absorbs this as a malformed/unavailable attempt — it never throws out.)
 */
async function defaultPoll() {
  throw new RunPollError(
    "GET /runs/{id} live poll transport is not wired yet",
    "not_implemented",
  );
}

/** Default `advance` seam: a timer-free no-op (tests inject a recorder). */
async function defaultAdvance() {}

// --- Pure helpers -----------------------------------------------------------

/**
 * Parse an HTTP status code out of a poll outcome, tolerating the shapes the
 * live `fetch` wrapper and tests produce. Returns a finite integer status when
 * one can be determined, or `null` when the outcome is MALFORMED (unparseable).
 * Never throws.
 *
 * Accepted shapes:
 *   - a bare number:                 `503`
 *   - a `Response`-like object:      `{ status: 503 }`
 *   - an alternate field:            `{ statusCode: 200 }`
 *
 * @param {unknown} outcome
 * @returns {number|null}
 */
export function parsePollStatus(outcome) {
  if (typeof outcome === "number") {
    return Number.isFinite(outcome) ? Math.trunc(outcome) : null;
  }
  if (outcome && typeof outcome === "object") {
    const candidate =
      typeof outcome.status === "number"
        ? outcome.status
        : typeof outcome.statusCode === "number"
          ? outcome.statusCode
          : null;
    return candidate !== null && Number.isFinite(candidate)
      ? Math.trunc(candidate)
      : null;
  }
  return null;
}

/**
 * True iff the outcome is a confirmed HTTP 503 (the only status that keeps the
 * fallback polling). A malformed outcome is NOT a confirmed 503 — but it is
 * also not a confirmed non-503, so the driver treats it separately (fail-closed
 * keep-polling) rather than resuming. Never throws.
 *
 * @param {unknown} outcome
 * @returns {boolean}
 */
export function isServiceUnavailable(outcome) {
  return parsePollStatus(outcome) === SERVICE_UNAVAILABLE_STATUS;
}

/**
 * Substitute the run id into the run-status path template.
 *
 * @param {string} runId
 * @param {string} [template]
 * @returns {string}
 */
function buildRunStatusPath(runId, template = RUN_STATUS_PATH_TEMPLATE) {
  return template.replace("{id}", encodeURIComponent(runId));
}

/**
 * Build the HTTP request descriptor the poll seam sends for one
 * `GET /runs/{id}` poll. This is the exact shape the live wiring hands to
 * `fetch`: a GET to the run-status path with the Authorization header (when a
 * token is present). No body, no secret/model key beyond the supplied
 * Auth_Token (R11.1 / R15.7).
 *
 * @param {string} runId
 * @param {object} [opts]
 * @param {string} [opts.authToken] caller-supplied Auth_Token (Bearer)
 * @param {string} [opts.endpoint] run-status URL/path template (default `/runs/{id}`)
 * @returns {{ url: string, method: "GET", headers: object }}
 */
export function buildRunStatusRequest(runId, opts = {}) {
  const template =
    typeof opts.endpoint === "string" && opts.endpoint
      ? opts.endpoint
      : RUN_STATUS_PATH_TEMPLATE;

  const headers = {
    accept: "application/json",
    ...buildAuthHeader(opts.authToken),
  };

  return {
    url: buildRunStatusPath(runId, template),
    method: RUN_STATUS_METHOD,
    headers,
  };
}

// --- Public API -------------------------------------------------------------

/**
 * Drive the 503 polling fallback to completion.
 *
 * Precondition (caller side): normal operation already received an HTTP 503, so
 * this driver is invoked to poll until recovery. Each of the up-to-12 attempts
 * waits one `POLL_INTERVAL_MS` (5,000 ms, via the injectable `advance` seam)
 * and THEN polls `GET /runs/{id}` exactly once (via the injectable poll seam).
 *
 * Termination (R13.5):
 *   - RESUME: the FIRST attempt whose outcome is a confirmed non-503 status
 *     stops the loop → `{ resumed: true, exhausted: false, finalStatus: <code> }`.
 *   - EXHAUST: 12 consecutive 503s (or unparseable/thrown poll outcomes, which
 *     are treated fail-closed as "not yet recovered") drain the budget →
 *     `{ resumed: false, exhausted: true, finalStatus: null }`.
 *
 * The driver NEVER throws for loop-time issues: a thrown poll or a malformed
 * return value is absorbed into the attempt history (status `null`) and the
 * loop continues; only an invalid `runId` short-circuits with an error result
 * before any poll.
 *
 * @param {{ runId: string, authToken?: string }} args
 * @param {object} [deps]
 * @param {(req, attempt: number) => Promise<unknown>|unknown} [deps.poll]
 *   injectable poll seam (default: not-implemented; live `fetch` is a drop-in
 *   swap). Invoked at most `MAX_POLL_ATTEMPTS` times, once per attempt.
 * @param {(ms: number, attempt: number) => Promise<void>|void} [deps.advance]
 *   injectable wait seam invoked with `POLL_INTERVAL_MS` before each poll
 *   (default: timer-free no-op).
 * @param {string} [deps.endpoint] run-status URL/path template (default `/runs/{id}`)
 * @param {number} [deps.maxAttempts] override the attempt cap (default 12;
 *   clamped to a positive integer ≤ MAX_POLL_ATTEMPTS) — for tests/config only.
 * @returns {Promise<{
 *   runId: string,
 *   resumed: boolean,
 *   exhausted: boolean,
 *   attempts: number,
 *   pollIntervalMs: number,
 *   maxAttempts: number,
 *   finalStatus: number|null,
 *   waits: number[],
 *   history: Array<{ attempt: number, status: number|null }>,
 *   request: object|null,
 *   errorIndication: object|null,
 * }>}
 */
export async function pollRunStatusFallback(args = {}, deps = {}) {
  const { runId, authToken } = args;
  const poll = typeof deps.poll === "function" ? deps.poll : defaultPoll;
  const advance = typeof deps.advance === "function" ? deps.advance : defaultAdvance;
  const endpoint =
    typeof deps.endpoint === "string" && deps.endpoint
      ? deps.endpoint
      : RUN_STATUS_PATH_TEMPLATE;
  const maxAttempts = resolveMaxAttempts(deps.maxAttempts);

  const runIdText = typeof runId === "string" ? runId.trim() : "";

  // --- Invalid runId: cannot build a poll target — short-circuit ----------
  if (!runIdText) {
    return {
      runId: "",
      resumed: false,
      exhausted: false,
      attempts: 0,
      pollIntervalMs: POLL_INTERVAL_MS,
      maxAttempts,
      finalStatus: null,
      waits: [],
      history: [],
      request: null,
      errorIndication: {
        code: "invalid_run_id",
        message: "run status polling requires a non-empty runId",
      },
    };
  }

  const request = buildRunStatusRequest(runIdText, { authToken, endpoint });

  const waits = [];
  const history = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // Wait one 5,000 ms interval BEFORE each poll (timer-free seam).
    await safeAdvance(advance, POLL_INTERVAL_MS, attempt);
    waits.push(POLL_INTERVAL_MS);

    // Poll EXACTLY ONCE through the injectable seam; absorb a thrown poll as a
    // malformed (status `null`) attempt so the driver never throws out.
    let status;
    try {
      const outcome = await poll(request, attempt);
      status = parsePollStatus(outcome);
    } catch {
      status = null;
    }
    history.push({ attempt, status });

    // RESUME on the FIRST confirmed non-503 status (R13.5).
    if (status !== null && status !== SERVICE_UNAVAILABLE_STATUS) {
      return {
        runId: runIdText,
        resumed: true,
        exhausted: false,
        attempts: attempt,
        pollIntervalMs: POLL_INTERVAL_MS,
        maxAttempts,
        finalStatus: status,
        waits,
        history,
        request,
        errorIndication: null,
      };
    }
    // A 503 (or a fail-closed malformed/thrown outcome) keeps polling.
  }

  // --- Budget exhausted: 12 consecutive non-resuming polls (R13.5) --------
  return {
    runId: runIdText,
    resumed: false,
    exhausted: true,
    attempts: maxAttempts,
    pollIntervalMs: POLL_INTERVAL_MS,
    maxAttempts,
    finalStatus: null,
    waits,
    history,
    request,
    errorIndication: {
      code: "poll_fallback_exhausted",
      message: `no non-503 response after ${maxAttempts} polls at ${POLL_INTERVAL_MS} ms intervals`,
    },
  };
}

// --- Internals --------------------------------------------------------------

/**
 * Clamp the attempt cap to a positive integer no greater than the contract
 * maximum of 12. Defaults to 12 when unset/invalid.
 *
 * @param {unknown} value
 * @returns {number}
 */
function resolveMaxAttempts(value) {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 1) {
    return Math.min(MAX_POLL_ATTEMPTS, Math.floor(n));
  }
  return MAX_POLL_ATTEMPTS;
}

/**
 * Invoke the `advance` seam without ever throwing — a misbehaving wait seam
 * must not break the fallback loop (the wait is best-effort metadata in the
 * timer-free model).
 */
async function safeAdvance(advance, ms, attempt) {
  try {
    await advance(ms, attempt);
  } catch {
    // Swallow: the wait is timer-free and best-effort in this model.
  }
}
