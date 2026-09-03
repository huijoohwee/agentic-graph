// Approval_Token issuance + storage for the video-remix Hitl_Gate_Service
// (agentic-graph-acos-mcp-connector spec, task 4.1 / R4.7 / R11.6 / design
// "Hitl_Gate_Service" + Correctness Property 1 + the gate catalog).
//
// Responsibility (single): MINT and STORE per-gate Approval_Tokens for the
// named Approval_Gates, so a downstream paid action can present one and have it
// verified at the spend boundary. This module is the issuance + storage half of
// the Hitl_Gate_Service; the verification-at-spend-boundary half (task 4.2) and
// the rejection path (task 4.4) reuse the SHARED `verifyGateToken` predicate
// from `gate-token.js`.
//
// Single-use enforcement (task 4.3 / R11.8 / Property 1) lives here too, because
// it is a STORAGE mutation: `consume(tokenId)` flips the stored token's
// `consumed` flag to `true` so a second `verifyGateToken` of the same token
// fails closed with reason `consumed`. `consumeSeam()` returns a function shaped
// for `withApprovalGate`'s optional `consume` hook (called by the guard strictly
// AFTER a permitted spend completes), so wiring single-use into a spend boundary
// is a one-liner: `withApprovalGate(gateId, token, spendFn, { consume:
// issuer.consumeSeam() })`. Consumption is therefore applied only on a permitted
// (successful) use — a rejected token never reaches the guard's consume hook and
// is left unconsumed. Wiring the gate into the Director.render and
// Commerce.checkout boundaries is task 4.5.
//
// ---------------------------------------------------------------------------
// GATE-ID CATALOG RECONCILIATION (resolved here, flagged across the render
// modules and `tool-registry.mjs` / `director-workflow.js`).
// ---------------------------------------------------------------------------
// The design Glossary enumerates five gate ids (`consumer-repo-write`,
// `cloud-deploy`, `paid-model-call`, `payment-action`, `authenticated-browser`)
// and the render harness runtime uses a sixth, `render-action`, for the render
// spend boundary. The discrepancy is RESOLVED in favor of KEEPING
// `render-action` as a canonical gate (the media-render spend boundary),
// because the *requirements themselves* require a gate distinct from
// `paid-model-call`:
//   * R4.2 — "require a verified, unexpired Approval_Token for THE RENDER
//     Approval_Gate before executing the render stage";
//   * R8.1 / R8.2 — speak of "a valid, unexpired render Approval_Token";
//   * the design Render_Harness contract input is `renderGateToken`.
// Merging render into `paid-model-call` would also weaken single-use token
// semantics — one `paid-model-call` token could not independently authorize
// research, storyboard, AND render — and `paid-model-call` (provider token/API
// spend) is a different risk class from `render-action` (BytePlus/external video provider
// render-queue spend) in the `APPROVAL_GATES` catalog. The design Glossary's
// five-item list is therefore an INCOMPLETE enumeration; the canonical catalog
// is the `APPROVAL_GATES` set (six gates) that `buildApprovalGates` projects
// from. This issuer derives its catalog from that single source of truth so the
// issuer, the render/commerce harnesses, the runtime, and the McpAgent boundary
// cannot drift. (A clarifying note is recorded in design.md's glossary.)
//
// Pure / SDK-agnostic + deterministic seams: the clock (`now`), the token-id
// generator (`newTokenId`), and the signer (`sign`) are all INJECTABLE so the
// local runtime makes zero live calls and the behavior is unit/property
// testable. The default in-memory store is the local-runtime seam; a durable
// store (Workers durable storage / KV) is deferred to the deploy task and can
// be supplied via the same `store` interface.

import { APPROVAL_GATES } from "./constants.js";
import {
  DEFAULT_GATE_TOKEN_TTL_MS,
  resolveNowMs,
  verifyGateToken,
} from "./gate-token.js";

// Canonical Approval_Gate id catalog — derived from `APPROVAL_GATES` (the same
// source `buildApprovalGates` projects from) so there is ONE source of truth.
// Includes `render-action` per the reconciliation above.
export const APPROVAL_GATE_IDS = Object.freeze(APPROVAL_GATES.map((gate) => gate.id));

// Default single-use validity window: 15 minutes since issuance (R4.7). Shared
// with `gate-token.js` so issuance and verification agree on the TTL.
export const APPROVAL_TOKEN_TTL_MS = DEFAULT_GATE_TOKEN_TTL_MS;

/**
 * Raised when issuance is requested for a gate id outside the canonical
 * catalog, so a caller can name the offending gate (fail-closed: never mint a
 * token for an unknown gate).
 */
export class ApprovalTokenIssueError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ApprovalTokenIssueError";
    this.code = "approval_token_issue_failed";
    Object.assign(this, details);
  }
}

/**
 * Is `gateId` one of the canonical Approval_Gate ids?
 * @param {string} gateId
 * @returns {boolean}
 */
export function isCanonicalGateId(gateId) {
  return APPROVAL_GATE_IDS.includes(gateId);
}

/**
 * Default deterministic signer seam. Produces a verifiable, NON-cryptographic
 * marker for the local runtime; the real signing/verification material is wired
 * at the deployed Hitl_Gate_Service. Kept deterministic (no randomness) so the
 * local runtime is reproducible.
 */
function defaultSign(gateId, issuedAtMs, tokenId) {
  return `sig:${gateId}:${issuedAtMs}:${tokenId}`;
}

/**
 * Build the default in-memory Approval_Token store seam for the LOCAL runtime.
 * Keyed by `tokenId` for single-use consumption + retrieval. A durable store
 * (deferred to the deploy task) can implement the same interface and be passed
 * to `createApprovalTokenIssuer({ store })`.
 *
 * Interface: { save(token), get(tokenId), has(tokenId), delete(tokenId),
 *              list(), clear(), size() }.
 */
export function createInMemoryApprovalTokenStore() {
  const tokens = new Map();
  return {
    save(token) {
      tokens.set(token.tokenId, token);
      return token;
    },
    get(tokenId) {
      return tokens.get(tokenId);
    },
    has(tokenId) {
      return tokens.has(tokenId);
    },
    delete(tokenId) {
      return tokens.delete(tokenId);
    },
    list() {
      return [...tokens.values()];
    },
    clear() {
      tokens.clear();
    },
    size() {
      return tokens.size;
    },
  };
}

/**
 * Create an Approval_Token issuer over an injectable store + deterministic
 * seams.
 *
 * @param {object} [options]
 * @param {object} [options.store] - token store (defaults to in-memory seam).
 * @param {() => number | number} [options.now] - injectable clock (epoch ms).
 * @param {number} [options.ttlMs] - validity window (defaults to 15 min).
 * @param {string[]} [options.gateIds] - canonical gate-id catalog (defaults to
 *   APPROVAL_GATE_IDS; pass a subset to scope an issuer to specific gates).
 * @param {(gateId: string, issuedAtMs: number, tokenId: string) => string}
 *   [options.sign] - injectable signer seam.
 * @param {() => string} [options.newTokenId] - injectable token-id generator.
 * @returns issuer with { issue, get, has, list, revoke, verify, gateIds,
 *   ttlMs, store }.
 */
export function createApprovalTokenIssuer(options = {}) {
  const store = options.store || createInMemoryApprovalTokenStore();
  const ttlMs = Number.isFinite(options.ttlMs) ? Number(options.ttlMs) : APPROVAL_TOKEN_TTL_MS;
  const gateIds = Array.isArray(options.gateIds) && options.gateIds.length > 0
    ? Object.freeze([...options.gateIds])
    : APPROVAL_GATE_IDS;
  const sign = typeof options.sign === "function" ? options.sign : defaultSign;

  // Deterministic monotonic token-id seam: stable + collision-free without
  // randomness, so the local runtime stays reproducible.
  let issuedCount = 0;
  const newTokenId =
    typeof options.newTokenId === "function"
      ? options.newTokenId
      : () => `aptok-${(issuedCount += 1)}`;

  /**
   * Issue a single-use Approval_Token for a canonical gate id (R4.7 / R11.6).
   * The token carries `gateId`, `issuedAt`, `consumed:false`, a verifiable
   * signature/`verified` marker, and `estimatedCostUsd` when available. It is
   * stored under `tokenId` for later single-use consumption + retrieval.
   *
   * @param {string} gateId - one of the canonical Approval_Gate ids.
   * @param {object} [issueOptions]
   * @param {number} [issueOptions.estimatedCostUsd] - gated action estimate.
   * @param {() => number | number} [issueOptions.now] - per-issue clock override.
   * @returns {{ tokenId, gateId, issuedAt, consumed, verified, signature,
   *   estimatedCostUsd? }}
   */
  function issue(gateId, issueOptions = {}) {
    if (typeof gateId !== "string" || !isCanonicalGateId(gateId)) {
      throw new ApprovalTokenIssueError(
        `Cannot issue Approval_Token for unknown gate id '${gateId}'.`,
        { gateId, canonicalGateIds: [...gateIds] },
      );
    }
    const issuedAt = resolveNowMs(issueOptions.now !== undefined ? issueOptions.now : options.now);
    const tokenId = newTokenId();
    const token = {
      tokenId,
      gateId,
      issuedAt,
      consumed: false,
      verified: true,
      signature: sign(gateId, issuedAt, tokenId),
    };
    // estimatedCostUsd is OPTIONAL — included only when a finite estimate is
    // supplied (shown in the approval prompt per R1.6 / R13.1).
    if (Number.isFinite(issueOptions.estimatedCostUsd)) {
      token.estimatedCostUsd = Number(issueOptions.estimatedCostUsd);
    }
    return store.save(token);
  }

  /**
   * Issue one Approval_Token per canonical gate id (or per supplied subset).
   * Convenience for seeding a fully-approved local run.
   *
   * @param {object} [batchOptions]
   * @param {string[]} [batchOptions.gateIds] - subset to issue (defaults to all).
   * @param {Record<string, number>} [batchOptions.estimatedCostUsd] - per-gate estimates.
   * @param {() => number | number} [batchOptions.now]
   * @returns {object[]} issued tokens in catalog order.
   */
  function issueAll(batchOptions = {}) {
    const targets = Array.isArray(batchOptions.gateIds) && batchOptions.gateIds.length > 0
      ? batchOptions.gateIds
      : gateIds;
    const estimates = batchOptions.estimatedCostUsd || {};
    return targets.map((gateId) =>
      issue(gateId, {
        estimatedCostUsd: estimates[gateId],
        now: batchOptions.now,
      }),
    );
  }

  /**
   * Retrieve a stored token by id.
   * @param {string} tokenId
   * @returns {object|undefined}
   */
  function get(tokenId) {
    return store.get(tokenId);
  }

  /**
   * Mark a stored Approval_Token consumed so it can never authorize a second
   * paid action (single-use enforcement, R11.8 / Property 1). Mutates the
   * stored token's `consumed` flag to `true` and persists it via the store, so
   * a subsequent `verifyGateToken` / `verify` of the same token fails closed
   * with reason `consumed`.
   *
   * Callers MUST only invoke this on a PERMITTED (successful) use, AFTER the
   * spend completes — `consumeSeam()` provides exactly that wiring for
   * `withApprovalGate`, which runs the consume hook strictly after the spend.
   * Idempotent: consuming an already-consumed token is a no-op that returns the
   * token unchanged. Returns `undefined` when no token is stored under
   * `tokenId` (nothing to consume — fail-closed, no token fabricated).
   *
   * @param {string} tokenId - the stored token's id.
   * @returns {object|undefined} the consumed token, or undefined if not found.
   */
  function consume(tokenId) {
    const token = store.get(tokenId);
    if (!token) return undefined;
    if (token.consumed === true) return token; // idempotent
    token.consumed = true;
    return store.save(token);
  }

  /**
   * Build a `consume` seam for `withApprovalGate` (task 4.3). The returned
   * function accepts the guard's `{ token }` argument (a token object or a bare
   * token id) and marks the corresponding stored token consumed AFTER a
   * permitted spend. A missing token/id is a safe no-op (returns undefined) so
   * the seam never throws inside the guard's post-spend step.
   *
   * Usage: `withApprovalGate(gateId, token, spendFn, { consume: issuer.consumeSeam() })`.
   *
   * @returns {(args?: { token?: object|string }) => object|undefined}
   */
  function consumeSeam() {
    return (args = {}) => {
      const presented = args.token;
      const tokenId =
        typeof presented === "string" ? presented : presented && presented.tokenId;
      if (tokenId === undefined || tokenId === null) return undefined;
      return consume(tokenId);
    };
  }

  /**
   * Read-only verification convenience that delegates to the SHARED
   * `verifyGateToken` predicate so issuance and verification share semantics
   * (gate-match, 15-min TTL, single-use `consumed`, signature). This does NOT
   * mark the token consumed — marking-on-permit is task 4.3's job. Looks the
   * token up by id when a string is passed, else verifies the object directly.
   *
   * @param {string|object} tokenOrId
   * @param {object} verifyOptions
   * @param {string} verifyOptions.gateId - the requested action's gate.
   * @param {() => number | number} [verifyOptions.now]
   * @returns {{ valid: boolean, reason: string|null, gateId: string }}
   */
  function verify(tokenOrId, verifyOptions = {}) {
    const token = typeof tokenOrId === "string" ? store.get(tokenOrId) : tokenOrId;
    return verifyGateToken(token, {
      gateId: verifyOptions.gateId,
      now: verifyOptions.now !== undefined ? verifyOptions.now : options.now,
      ttlMs,
    });
  }

  return {
    issue,
    issueAll,
    get,
    consume,
    consumeSeam,
    has: (tokenId) => store.has(tokenId),
    list: () => store.list(),
    revoke: (tokenId) => store.delete(tokenId),
    verify,
    gateIds,
    ttlMs,
    store,
  };
}
