// `POST /run` submission client for the agenticgraph Cloudflare Pages frontend.
//
// Spec: agenticgraph-acos-mcp-connector, task 7.2 (R1.1, R15 caller side; design
// Frontend `submitRun`; Correctness Property 5 forwarding decision).
//
// SCOPE OF THIS TASK (7.2): build the `POST /run` submission request and forward
// a VALID creator submission to the Agent_Api `POST /run` endpoint WITHIN A
// 2,000 ms DEADLINE (R1.1), attaching the caller-supplied Auth_Token as an
// `Authorization: Bearer <token>` header (R15 caller side). Forwarding goes
// THROUGH AN INJECTABLE TRANSPORT SEAM so the local runtime/tests make ZERO live
// network calls; the live wiring (a real `fetch` to the Agent_Api origin) is a
// drop-in swap for the default seam.
//
// Validation REUSES `guardedSubmit` from `submission-validation.js` (task 7.1) —
// this module does NOT duplicate validation. An invalid submission is NOT
// forwarded (R1.2 / Property 5); only a valid submission reaches `POST /run`.
//
// The 2,000 ms forward deadline is recorded as STRUCTURAL METADATA and asserted
// structurally — there is NO real timer here. An injectable elapsed signal
// (`submitElapsedMs`) models a slow live forward, mirroring the Agent_Api
// `mcp-forwarder` (`forwardElapsedMs` / `MCP_FORWARD_DEADLINE_MS`) and the
// health-handler (`checkElapsedMs`) deadline pattern.
//
// STACK BOUNDARY (R11/R15.7): the product tier holds NO model provider keys and
// NO authentication secret. This client attaches ONLY the caller-supplied
// Auth_Token; it never reads, embeds, or transmits any model provider key or
// signing secret. The Auth_Token is opaque to the client.

import { guardedSubmit } from "./submission-validation.js";

// --- Transport / contract constants -----------------------------------------

// Structural submission deadline (R1.1): a valid submission must be forwarded to
// `POST /run` within 2,000 ms. Timer-free here — the deterministic seam forwards
// synchronously; an injectable elapsed signal models a slow live forward.
export const RUN_SUBMIT_DEADLINE_MS = 2000;

// Default Agent_Api `POST /run` endpoint path. The product tier targets its own
// AWS Agent_Api origin (which then forwards MCP to the control plane — R11), so
// the default is a relative path resolved against the deployed Frontend origin.
export const RUN_SUBMIT_PATH = "/run";

// HTTP method for the submission (R1.1 / design `POST /run`).
export const RUN_SUBMIT_METHOD = "POST";

/**
 * Typed submission error. `code: "not_implemented"` is surfaced by the default
 * seam until a live `fetch` transport is wired; other transport failures surface
 * `code: "run_submit_failed"`.
 */
export class RunSubmitError extends Error {
  constructor(message, code = "run_submit_failed") {
    super(message);
    this.name = "RunSubmitError";
    this.code = code;
  }
}

/**
 * Default transport seam. Until the live `POST /run` `fetch` is wired, invoking
 * the client without an injected transport surfaces a clearly-tagged
 * not-implemented signal rather than silently succeeding or making a live call.
 */
async function defaultTransport() {
  throw new RunSubmitError(
    "POST /run live transport is not wired yet",
    "not_implemented",
  );
}

/**
 * Build the `Authorization: Bearer <token>` header for a caller-supplied
 * Auth_Token. Returns an empty header set when no usable token is present (the
 * Agent_Api then rejects with 401 — R15.1); the client never invents a token.
 *
 * @param {unknown} authToken caller-supplied Auth_Token (opaque string)
 * @returns {{ authorization?: string }}
 */
export function buildAuthHeader(authToken) {
  if (typeof authToken === "string" && authToken.length > 0) {
    return { authorization: `Bearer ${authToken}` };
  }
  return {};
}

/**
 * Build the HTTP request descriptor the transport sends for a `POST /run`
 * submission. This is the exact shape the live wiring hands to `fetch`: a POST
 * to the `/run` path with the Authorization header (when a token is present)
 * and a JSON body of the VALIDATED submission.
 *
 * Only the validated submission fields are forwarded as the JSON body — no model
 * provider key and no auth secret are ever attached beyond the supplied
 * Auth_Token (R11.1 / R15.7).
 *
 * @param {object} submission the client-validated submission `{ referenceUrl, brief, budgetUsd }`
 * @param {object} [opts]
 * @param {string} [opts.authToken] caller-supplied Auth_Token (Bearer)
 * @param {Array<string|{ gateId: string }>} [opts.approvals] optional approval
 *   list forwarded unchanged to the Agent_Api when the caller is re-submitting a
 *   run after user approval.
 * @param {string} [opts.endpoint] `POST /run` URL/path (default `/run`)
 * @returns {{ url: string, method: "POST", headers: object, body: object }}
 */
export function buildRunSubmitHttpRequest(submission, opts = {}) {
  const endpoint =
    typeof opts.endpoint === "string" && opts.endpoint ? opts.endpoint : RUN_SUBMIT_PATH;
  const src = submission && typeof submission === "object" ? submission : {};

  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    ...buildAuthHeader(opts.authToken),
  };

  // JSON body carries ONLY the validated submission fields (R11.1 / R15.7) —
  // no secret/model key is ever included.
  const body = {
    referenceUrl: src.referenceUrl,
    brief: src.brief,
    budgetUsd: src.budgetUsd,
    ...(Array.isArray(opts.approvals) ? { approvals: opts.approvals } : {}),
  };

  return {
    url: endpoint,
    method: RUN_SUBMIT_METHOD,
    headers,
    body,
  };
}

/**
 * Resolve the (timer-free) submission-elapsed signal. The real elapsed time is
 * measured by the live wiring; here a caller injects whether the forward
 * exceeded the 2,000 ms deadline so the metadata can be asserted structurally.
 * Defaults to 0 (synchronous deterministic seam).
 */
function resolveSubmitElapsedMs(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Submit a creator run to the Agent_Api `POST /run` endpoint.
 *
 * Validates the submission via `guardedSubmit` (task 7.1, REUSED — not
 * duplicated). On a VALID submission it forwards EXACTLY ONCE through the
 * injectable transport seam, attaching the caller-supplied Auth_Token as
 * `Authorization: Bearer <token>` and a JSON body of the validated submission,
 * and records the 2,000 ms forward-deadline metadata (R1.1). On an INVALID
 * submission it does NOT forward (R1.2 / Property 5) and returns the structured
 * field errors so the UI can show a field-specific message.
 *
 * @param {{ submission: object, authToken?: string, approvals?: Array<string|{ gateId: string }> }} args
 * @param {object} [deps]
 * @param {(req: { url, method, headers, body }) => Promise<unknown>|unknown} [deps.transport]
 *   injectable transport seam (default: not-implemented; live `fetch` is a
 *   drop-in swap). Invoked EXACTLY ONCE per VALID submission, never when invalid.
 * @param {string} [deps.endpoint] `POST /run` URL/path (default `/run`)
 * @param {number} [deps.submitElapsedMs] injected elapsed signal modelling live
 *   forward latency for the 2,000 ms deadline assertion (default 0 — synchronous)
 * @returns {Promise<{
 *   forwarded: boolean,
 *   valid: boolean,
 *   errors: Array<{ field: string, reason: string }>,
 *   request?: { url, method, headers, body },
 *   submitElapsedMs?: number,
 *   submitWithinDeadline?: boolean,
 *   submitDeadlineMs?: number,
 *   result?: unknown,
 * }>}
 */
export async function submitRun(args = {}, deps = {}) {
  const { submission, authToken, approvals } = args;
  const transport = typeof deps.transport === "function" ? deps.transport : defaultTransport;
  const endpoint =
    typeof deps.endpoint === "string" && deps.endpoint ? deps.endpoint : RUN_SUBMIT_PATH;

  // Built once so we can attach it to the result whether or not it forwards;
  // `guardedSubmit` is the single validation authority (task 7.1, REUSED).
  let httpRequest = null;

  const guarded = await guardedSubmit(submission, async (validatedBody) => {
    // Reached ONLY when validation passes — build + forward the request.
    httpRequest = buildRunSubmitHttpRequest(validatedBody, { authToken, endpoint, approvals });
    // Forward EXACTLY ONCE through the injectable seam (R1.1 / Property 5).
    return transport(httpRequest);
  });

  if (!guarded.valid) {
    // Do NOT forward to `POST /run` on any violation (R1.2 / Property 5).
    return { forwarded: false, valid: false, errors: guarded.errors };
  }

  // 2,000 ms forward-deadline metadata (R1.1) — asserted structurally.
  const submitElapsedMs = resolveSubmitElapsedMs(deps.submitElapsedMs);

  return {
    forwarded: guarded.forwarded,
    valid: true,
    errors: [],
    request: httpRequest,
    submitElapsedMs,
    submitWithinDeadline: submitElapsedMs <= RUN_SUBMIT_DEADLINE_MS,
    submitDeadlineMs: RUN_SUBMIT_DEADLINE_MS,
    result: guarded.result,
  };
}
