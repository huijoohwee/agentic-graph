// Approval-decision transmission client for the agentic-graph Cloudflare Pages
// Frontend.
//
// Spec: agentic-graph-acos-mcp-connector, task 7.7 (R13.2, R13.3; design Frontend
// `renderApprovalPrompts` → approval decision transmission).
//
// R13.2: "WHEN the end creator user approves a gate in the Frontend, THE
// Frontend SHALL transmit the approval decision to the Agent_Api for forwarding
// to the Hitl_Gate_Service within 2 seconds of the approval action."
// R13.3: "IF transmission of an approval decision to the Agent_Api fails or does
// not receive a success response within 10 seconds, THEN THE Frontend SHALL
// retain the pending approval prompt, display an error indication that the
// approval was not submitted, and allow the end creator user to retry up to 3
// times."
//
// SCOPE OF THIS TASK (7.7): build + transmit the creator's approval/decision for
// a single Approval_Gate to the Agent_Api (attaching the caller-supplied
// Auth_Token as `Authorization: Bearer <token>`), within a STRUCTURAL 2,000 ms
// transmit deadline (R13.2). On a transport FAILURE, OR when NO success response
// arrives within the 10,000 ms response window (R13.3), the result RETAINS the
// pending prompt, surfaces an error indication, and reports the remaining retry
// budget (max 3 retries). The retry budget caps at 3: a 4th attempt is not
// allowed.
//
// PURE + INJECTABLE: transmission goes THROUGH AN INJECTABLE TRANSPORT SEAM so
// the local runtime/tests make ZERO live network calls. The 2,000 ms transmit
// deadline and the 10,000 ms response window are recorded as STRUCTURAL METADATA
// and asserted structurally — there is NO real timer here. Injectable elapsed
// signals (`transmitElapsedMs`, `responseElapsedMs`) model a slow transmit / a
// slow response, mirroring the run-submission-client (`submitElapsedMs` /
// `RUN_SUBMIT_DEADLINE_MS`) and approval-prompt-view (`renderElapsedMs`)
// deadline patterns.
//
// STACK BOUNDARY (R11/R15.7): the product tier holds NO model provider keys and
// NO authentication secret. This client attaches ONLY the caller-supplied
// Auth_Token; it never reads, embeds, or transmits any model provider key or
// signing secret. The Auth_Token is opaque to the client.

import { buildAuthHeader } from "./run-submission-client.js";

// --- Contract constants -----------------------------------------------------

/**
 * Structural transmit deadline (R13.2): the approval decision must be
 * transmitted to the Agent_Api within 2,000 ms of the approval action.
 * Timer-free here — the deterministic seam transmits synchronously; an
 * injectable elapsed signal models a slow live transmit.
 */
export const APPROVAL_TRANSMIT_DEADLINE_MS = 2000;

/**
 * Structural response window (R13.3): a success response must arrive within
 * 10,000 ms. No success within this window is treated as a timeout — the prompt
 * is retained, an error indication surfaces, and a retry is allowed (subject to
 * the retry budget).
 */
export const APPROVAL_RESPONSE_TIMEOUT_MS = 10000;

/**
 * Maximum number of retries the creator is allowed after a failed/timed-out
 * transmission (R13.3: "allow the end creator user to retry up to 3 times").
 * The first transmission is attempt 1; retries are attempts 2, 3, and 4 — so
 * attempts 1..4 are permitted and a 5th attempt is refused. Equivalently, after
 * the initial attempt up to `MAX_APPROVAL_RETRIES` retries remain.
 */
export const MAX_APPROVAL_RETRIES = 3;

/** Default Agent_Api approval-decision endpoint path. */
export const APPROVAL_DECISION_PATH = "/approvals";

/** HTTP method for transmitting an approval decision. */
export const APPROVAL_DECISION_METHOD = "POST";

/** The decision values a creator may transmit for a gate. */
export const APPROVAL_DECISIONS = Object.freeze(["approved", "rejected"]);

/**
 * Typed approval-transmission error. `code: "not_implemented"` is surfaced by
 * the default seam until a live transport is wired; other transport failures
 * surface `code: "approval_transmit_failed"`.
 */
export class ApprovalTransmitError extends Error {
  constructor(message, code = "approval_transmit_failed") {
    super(message);
    this.name = "ApprovalTransmitError";
    this.code = code;
  }
}

/**
 * Default transport seam. Until the live transport is wired, invoking the
 * client without an injected transport surfaces a clearly-tagged
 * not-implemented signal rather than silently succeeding or making a live call.
 */
async function defaultTransport() {
  throw new ApprovalTransmitError(
    "approval-decision live transport is not wired yet",
    "not_implemented",
  );
}

// --- Helpers ----------------------------------------------------------------

/**
 * Resolve a timer-free elapsed signal (ms). The real elapsed time is measured by
 * the live wiring; here a caller injects the elapsed value so the deadline /
 * response-window metadata can be asserted structurally. Defaults to 0.
 *
 * @param {unknown} value injected elapsed signal (ms)
 * @returns {number}
 */
function resolveElapsedMs(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Clamp the current attempt number to a positive integer (default 1 — the first
 * transmission). Attempt 1 is the initial transmission; attempts 2..(1+max) are
 * retries.
 *
 * @param {unknown} value injected attempt number
 * @returns {number}
 */
function resolveAttempt(value) {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  return 1;
}

/**
 * True iff `decision` is a recognized approval decision (`approved`/`rejected`).
 *
 * @param {unknown} decision
 * @returns {boolean}
 */
export function isValidDecision(decision) {
  return APPROVAL_DECISIONS.includes(decision);
}

/**
 * Build the HTTP request descriptor the transport sends for an approval
 * decision. This is the exact shape the live wiring hands to `fetch`: a POST to
 * the approvals path with the Authorization header (when a token is present) and
 * a JSON body carrying ONLY the gate id and the decision.
 *
 * Only the gate id + decision are forwarded — no model provider key and no auth
 * secret are ever attached beyond the supplied Auth_Token (R11.1 / R15.7).
 *
 * @param {{ gateId: string, decision: string }} args
 * @param {object} [opts]
 * @param {string} [opts.authToken] caller-supplied Auth_Token (Bearer)
 * @param {string} [opts.endpoint] approvals URL/path (default `/approvals`)
 * @returns {{ url: string, method: "POST", headers: object, body: object }}
 */
export function buildApprovalDecisionRequest(args = {}, opts = {}) {
  const endpoint =
    typeof opts.endpoint === "string" && opts.endpoint
      ? opts.endpoint
      : APPROVAL_DECISION_PATH;

  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    ...buildAuthHeader(opts.authToken),
  };

  // JSON body carries ONLY the gate id + decision (R11.1 / R15.7) — no secret /
  // model key is ever included.
  const body = {
    gateId: args.gateId,
    decision: args.decision,
  };

  return {
    url: endpoint,
    method: APPROVAL_DECISION_METHOD,
    headers,
    body,
  };
}

/**
 * Build the failure/timeout result envelope shared by the failure paths
 * (R13.3): the prompt is RETAINED, an error indication is surfaced, and the
 * remaining retry budget is reported. `retriesRemaining` is the number of
 * retries still permitted AFTER the current attempt (capped at
 * `MAX_APPROVAL_RETRIES`); when 0 the creator has exhausted the retry budget and
 * `retryAllowed` is false.
 *
 * @param {object} fields
 * @returns {object}
 */
function buildFailureResult(fields) {
  const {
    attempt,
    transmitted,
    transmitElapsedMs,
    transmitWithinDeadline,
    timedOut,
    responseElapsedMs,
    errorIndication,
    request,
  } = fields;

  // Retries remaining AFTER this attempt. Initial transmission is attempt 1;
  // up to MAX_APPROVAL_RETRIES retries follow, so attempts 1..(1+max) run.
  const retriesRemaining = Math.max(0, MAX_APPROVAL_RETRIES - (attempt - 1));

  return {
    transmitted,
    transmitWithinDeadline,
    transmitDeadlineMs: APPROVAL_TRANSMIT_DEADLINE_MS,
    transmitElapsedMs,
    succeeded: false,
    timedOut,
    responseTimeoutMs: APPROVAL_RESPONSE_TIMEOUT_MS,
    responseElapsedMs,
    promptRetained: true,
    errorIndication,
    attempt,
    retriesRemaining,
    retryAllowed: retriesRemaining > 0,
    request,
  };
}

// --- Public API -------------------------------------------------------------

/**
 * Transmit the creator's approval/decision for a single Approval_Gate to the
 * Agent_Api.
 *
 * On a VALID request (recognized `gateId` + `decision`, and the retry budget not
 * exhausted) it transmits EXACTLY ONCE through the injectable transport seam,
 * attaching the caller-supplied Auth_Token as `Authorization: Bearer <token>`
 * and a JSON body carrying the gate id + decision, and records the 2,000 ms
 * transmit-deadline metadata (R13.2).
 *
 * Outcomes (R13.2 / R13.3):
 *   - SUCCESS: the transport resolves and a success response arrives within the
 *     10,000 ms window → `{ succeeded: true, transmitted: true, timedOut: false,
 *     promptRetained: false, errorIndication: null }`.
 *   - TIMEOUT: the transport resolves but `responseElapsedMs` exceeds the
 *     10,000 ms window → treated as no success: `{ succeeded: false,
 *     timedOut: true, promptRetained: true, errorIndication: {...} }` and a
 *     retry is allowed (subject to the retry budget).
 *   - FAILURE: the transport rejects → `{ succeeded: false, transmitted: false,
 *     promptRetained: true, errorIndication: {...} }` and a retry is allowed
 *     (subject to the retry budget).
 *
 * The retry budget caps at `MAX_APPROVAL_RETRIES` (3): when the supplied
 * `attempt` already exceeds `1 + MAX_APPROVAL_RETRIES`, the transmission is
 * REFUSED (no transport call), the prompt is retained, and `retryAllowed` is
 * false — a 4th retry (5th attempt) is not allowed.
 *
 * @param {{ gateId: string, decision: string, authToken?: string }} args
 * @param {object} [deps]
 * @param {(req) => Promise<unknown>|unknown} [deps.transport] injectable seam
 *   (default: not-implemented; live transport is a drop-in swap). Invoked
 *   EXACTLY ONCE per permitted transmission, never when invalid/budget-exhausted.
 * @param {string} [deps.endpoint] approvals URL/path (default `/approvals`)
 * @param {number} [deps.transmitElapsedMs] injected elapsed signal (ms) for the
 *   2,000 ms transmit deadline (default 0 — synchronous)
 * @param {number} [deps.responseElapsedMs] injected elapsed signal (ms) for the
 *   10,000 ms response window (default 0 — immediate)
 * @param {number} [deps.attempt] the current attempt number (default 1 — first
 *   transmission); retries pass 2, 3, 4
 * @returns {Promise<object>} the approval-transmission result envelope
 */
export async function transmitApprovalDecision(args = {}, deps = {}) {
  const { gateId, decision, authToken } = args;
  const transport =
    typeof deps.transport === "function" ? deps.transport : defaultTransport;
  const endpoint =
    typeof deps.endpoint === "string" && deps.endpoint
      ? deps.endpoint
      : APPROVAL_DECISION_PATH;

  const attempt = resolveAttempt(deps.attempt);
  const transmitElapsedMs = resolveElapsedMs(deps.transmitElapsedMs);
  const responseElapsedMs = resolveElapsedMs(deps.responseElapsedMs);
  const transmitWithinDeadline = transmitElapsedMs <= APPROVAL_TRANSMIT_DEADLINE_MS;

  // --- Input validation: never transmit a junk decision -------------------
  const gateIdText = typeof gateId === "string" ? gateId.trim() : "";
  if (!gateIdText || !isValidDecision(decision)) {
    return buildFailureResult({
      attempt,
      transmitted: false,
      transmitElapsedMs,
      transmitWithinDeadline,
      timedOut: false,
      responseElapsedMs,
      errorIndication: {
        code: "invalid_decision",
        message: "approval decision requires a non-empty gateId and a decision of 'approved' or 'rejected'",
      },
      request: null,
    });
  }

  // --- Retry budget cap (R13.3): max 3 retries → attempts 1..4 ------------
  // A 5th attempt (4th retry) is refused: do NOT transmit, retain the prompt.
  if (attempt > MAX_APPROVAL_RETRIES + 1) {
    return {
      transmitted: false,
      transmitWithinDeadline,
      transmitDeadlineMs: APPROVAL_TRANSMIT_DEADLINE_MS,
      transmitElapsedMs,
      succeeded: false,
      timedOut: false,
      responseTimeoutMs: APPROVAL_RESPONSE_TIMEOUT_MS,
      responseElapsedMs,
      promptRetained: true,
      errorIndication: {
        code: "retry_budget_exhausted",
        message: `approval retry budget exhausted after ${MAX_APPROVAL_RETRIES} retries`,
      },
      attempt,
      retriesRemaining: 0,
      retryAllowed: false,
      request: null,
    };
  }

  // --- Build + transmit EXACTLY ONCE through the injectable seam ----------
  const request = buildApprovalDecisionRequest(
    { gateId: gateIdText, decision },
    { authToken, endpoint },
  );

  let response;
  try {
    response = await transport(request);
  } catch (err) {
    // Transport FAILURE (R13.3): retain the prompt, surface an error, allow a
    // retry (subject to the retry budget).
    return buildFailureResult({
      attempt,
      transmitted: false,
      transmitElapsedMs,
      transmitWithinDeadline,
      timedOut: false,
      responseElapsedMs,
      errorIndication: {
        code: err && err.code ? err.code : "approval_transmit_failed",
        message:
          err && err.message
            ? err.message
            : "approval decision transmission failed",
      },
      request,
    });
  }

  // --- No success within the 10,000 ms window (R13.3): treat as timeout ---
  if (responseElapsedMs > APPROVAL_RESPONSE_TIMEOUT_MS) {
    return buildFailureResult({
      attempt,
      transmitted: true,
      transmitElapsedMs,
      transmitWithinDeadline,
      timedOut: true,
      responseElapsedMs,
      errorIndication: {
        code: "approval_response_timeout",
        message: `no success response within ${APPROVAL_RESPONSE_TIMEOUT_MS} ms`,
      },
      request,
    });
  }

  // --- SUCCESS: transmitted and a success response arrived in-window ------
  return {
    transmitted: true,
    transmitWithinDeadline,
    transmitDeadlineMs: APPROVAL_TRANSMIT_DEADLINE_MS,
    transmitElapsedMs,
    succeeded: true,
    timedOut: false,
    responseTimeoutMs: APPROVAL_RESPONSE_TIMEOUT_MS,
    responseElapsedMs,
    promptRetained: false,
    errorIndication: null,
    attempt,
    retriesRemaining: MAX_APPROVAL_RETRIES,
    retryAllowed: false,
    request,
    result: response,
  };
}
