// Render_Harness for the video-remix Director runtime
// (agentic-graph-acos-mcp-connector spec, task 3.9 / R8.1-R8.6 / Properties 15, 16,
// 1 — the render-dispatch + asset/ledger side).
//
// Responsibility (single): GIVEN a set of shots and a render Approval_Token,
// dispatch per-shot generation through the existing Strytree/BytePlus queue and
// return one stored asset reference + one Credit_Ledger event per completed
// shot. The harness wires the Render_Harness contract onto the reused payment
// worker assets (`strytreeApi.ts`: BytePlus/external video provider queue, R2 media bucket,
// `StrytreeCreditLedgerActor`) THROUGH INJECTABLE SEAMS (render-providers.js)
// so the local runtime makes ZERO live network calls; the live wiring is
// integration task 9.2.
//
// Contract (R8.3):
//   input  : { shots[], renderGateToken }
//   output : { assets:[{ shotId, assetUrl, ledgerEventId, costCents }] }
//
// Behavior:
//   * R8.1 (Property — dispatch latency): with a valid, unexpired render
//     Approval_Token the harness dispatches within 5s of stage invocation. The
//     synchronous deterministic seam dispatches immediately; the 5s deadline is
//     recorded as metadata and asserted structurally (an injectable elapsed
//     signal models a slow live dispatch without a real timer).
//   * R8.2 / Property 1: a missing / expired / consumed / gate-mismatched /
//     unsigned render Approval_Token is REJECTED — no provider dispatch, zero
//     provider spend, and an error naming the failed token check. A valid
//     Auth_Token never substitutes (render-token.js only inspects the render
//     Approval_Token).
//   * R8.3 / R8.4 / Property 15: each completed shot returns EXACTLY one asset
//     reference resolvable under the agentic-graph media bucket and EXACTLY one
//     Credit_Ledger event id, with the ledger event (capturing provider spend +
//     provider identity) recorded BEFORE the asset reference is returned.
//   * R8.5 / Property 16: a shot with no provider key OR for which cumulative
//     recorded provider spend has reached/exceeded the budget cap routes to the
//     deterministic zero-spend mock provider and records a zero-spend ledger
//     event.
//   * R8.6: a failed dispatch (provider error or no asset within 120s) returns
//     an error naming the failed shot, records a ledger event reflecting the
//     actual spend incurred, and leaves previously rendered shot assets
//     unchanged.
//
// Pure / SDK-agnostic apart from the injected clients: importable by both the
// Node tests and the Cloudflare Worker bundle.

import { cleanString } from "./helpers.js";
import { resolveShotRenderPrompt } from "./expressive-storyboard.js";
import { RENDER_GATE_ID, verifyRenderToken } from "./render-token.js";
import { buildApprovalRejectionError } from "./approval-rejection.js";
import {
  createDeterministicRenderQueueClient,
  createDeterministicMockProviderClient,
  createDeterministicLedgerClient,
  renderLedgerEventId,
  selectRenderProvider,
} from "./render-providers.js";
import { assertComplete } from "./provenance.js";

// Structural dispatch deadline (R8.1): generation must be dispatched within 5s
// of stage invocation. Timer-free here — the deterministic seam dispatches
// synchronously; an injectable elapsed signal models a slow live dispatch.
export const RENDER_DISPATCH_DEADLINE_MS = 5000;
// Per-shot provider completion deadline (R8.6): a dispatch that returns no asset
// within 120s is a failure. Recorded as metadata; the live wiring (9.2) enforces
// the real timeout, and an injectable per-shot outcome models it locally.
export const RENDER_COMPLETION_TIMEOUT_MS = 120000;

const RENDER_STATUS_COMPLETE = "complete";
const RENDER_STATUS_REJECTED = "rejected";
const RENDER_STATUS_FAILED = "failed";

const RENDER_FAILURE_DISPATCH_ERROR = "dispatch_error";
const RENDER_FAILURE_NO_ASSET_TIMEOUT = "no_asset_within_timeout";

/**
 * Attach provenance to an asset record (R6.1, R6.3, R6.6).
 * When `provenanceBuilder` is a function, calls it and attaches the chain.
 * If the chain is incomplete and `failIfProvenanceIncomplete` is true, returns
 * `{ failure }` so the caller can break the loop; otherwise `{ failure: null }`.
 */
function applyProvenance({ asset, shot, runId, dispatchResult, provenanceBuilder, failIfProvenanceIncomplete, ledgerEventId }) {
  if (typeof provenanceBuilder !== "function") return { failure: null };
  let chain;
  try {
    chain = provenanceBuilder(shot, runId, dispatchResult);
  } catch (err) {
    if (failIfProvenanceIncomplete) {
      return { failure: { shotId: shot.shotId, reason: cleanString(err && err.message, "provenance_incomplete"), ledgerEventId, providerSpendCents: asset.costCents } };
    }
    return { failure: null };
  }
  if (chain == null) return { failure: null };
  if (failIfProvenanceIncomplete) {
    try {
      assertComplete(chain);
    } catch (err) {
      return { failure: { shotId: shot.shotId, reason: cleanString(err && err.message, "provenance_incomplete"), ledgerEventId, providerSpendCents: asset.costCents } };
    }
  }
  asset.provenance = chain;
  return { failure: null };
}

/**
 * Typed input-validation error for the Render_Harness contract. Mirrors
 * `ResearchHarnessInputError` (a `field` naming the offending input) so the
 * McpAgent / Agent_Api boundary can surface the bad field to callers. NOTE: a
 * token failure is NOT an input error — it is a fail-closed REJECTION result
 * (R8.2), so the harness returns a rejection envelope rather than throwing.
 */
export class RenderHarnessInputError extends Error {
  constructor(field, message) {
    super(message || `Invalid render input: ${field}`);
    this.name = "RenderHarnessInputError";
    this.code = "invalid_render_input";
    this.field = field;
  }
}

/**
 * Normalize one shot entry into `{ shotId, prompt, raw }`. Accepts a bare
 * string (treated as the shotId) or an object carrying `shotId`/`id`. Throws a
 * typed `RenderHarnessInputError` naming the field when a shot lacks an id.
 */
function normalizeShot(shot, index) {
  if (typeof shot === "string") {
    const shotId = cleanString(shot);
    if (!shotId) throw new RenderHarnessInputError(`shots[${index}].shotId`, "shot id must be a non-empty string");
    return { shotId, prompt: "", raw: shot };
  }
  if (shot && typeof shot === "object") {
    const shotId = cleanString(shot.shotId || shot.id);
    if (!shotId) {
      throw new RenderHarnessInputError(`shots[${index}].shotId`, "each shot requires a non-empty shotId");
    }
    return { shotId, prompt: resolveShotRenderPrompt(shot), imagePrompt: cleanString(shot.imagePrompt), primaryReference: shot.primaryReference || null, firstFrameReferences: Array.isArray(shot.firstFrameReferences) ? shot.firstFrameReferences : [], raw: shot };
  }
  throw new RenderHarnessInputError(`shots[${index}]`, "each shot must be a string id or an object with a shotId");
}

/**
 * Enforce the Render_Harness input contract `{ shots[], renderGateToken }`.
 * Validates and normalizes `shots[]` (a non-empty array of shots with unique,
 * non-empty ids) and returns `{ shots }`. The `renderGateToken` is NOT
 * validated here — it is verified at the spend boundary by `verifyRenderToken`
 * so a bad token yields a fail-closed rejection (R8.2), not an input error.
 */
export function validateRenderInput(args = {}) {
  const input = args && typeof args === "object" ? args : {};
  if (!Array.isArray(input.shots) || input.shots.length === 0) {
    throw new RenderHarnessInputError("shots", "shots must be a non-empty array");
  }
  const shots = input.shots.map((shot, index) => normalizeShot(shot, index));
  const seen = new Set();
  for (const shot of shots) {
    if (seen.has(shot.shotId)) {
      throw new RenderHarnessInputError("shots", `duplicate shotId '${shot.shotId}' — shot ids must be unique`);
    }
    seen.add(shot.shotId);
  }
  return { shots };
}

/**
 * Build the fail-closed rejection envelope for an invalid render Approval_Token
 * (R8.2 / Property 1). No assets, no dispatch, zero provider spend, an error
 * naming the failed token check.
 */
function buildTokenRejection(verification) {
  return {
    status: RENDER_STATUS_REJECTED,
    rejected: true,
    gateId: verification.gateId,
    reason: verification.reason,
    // Canonical rejection error (shared with the gate guard + commerce harness)
    // naming the failed approval check; the render-specific code and message
    // stay owned here while the envelope shape comes from one builder.
    error: buildApprovalRejectionError(verification, {
      code: "render_approval_token_failed",
      message: `Render Approval_Token failed verification (${verification.reason}); no provider dispatch performed.`,
    }),
    assets: [],
    ledgerEvents: [],
    providerDispatchCalls: 0,
    paidProviderCalls: 0,
    providerSpendCents: 0,
    dispatched: false,
    dispatchDeadlineMs: RENDER_DISPATCH_DEADLINE_MS,
    completionTimeoutMs: RENDER_COMPLETION_TIMEOUT_MS,
  };
}

/**
 * Resolve the per-shot dispatch outcome from an injectable seam. `deps.outcomes`
 * maps a shotId to `{ failed?: boolean, reason?: string, spentCents?: number }`
 * so a test can model a provider error / 120s no-asset timeout (R8.6) and any
 * partial spend incurred — all WITHOUT a real timer or network call.
 */
function resolveShotOutcome(outcomes, shotId) {
  if (!outcomes || typeof outcomes !== "object") return null;
  const outcome = outcomes[shotId];
  return outcome && typeof outcome === "object" ? outcome : null;
}

/**
 * Run the Render_Harness over the injectable queue / mock / ledger seams.
 *
 * @param {object} input - the Render_Harness input `{ shots[], renderGateToken }`.
 * @param {object} [deps]
 * @param {string}  [deps.runId]                 - run id (scopes ids/keys).
 * @param {boolean} [deps.providerKeyAvailable]  - whether a provider key exists
 *   (default false -> local keyless runtime routes every shot to the zero-spend
 *   mock, R8.5).
 * @param {number}  [deps.budgetCapCents]        - configured budget cap (cents).
 * @param {object}  [deps.queueClient]           - live-path queue seam.
 * @param {object}  [deps.mockClient]            - zero-spend mock seam.
 * @param {object}  [deps.ledgerClient]          - Credit_Ledger seam.
 * @param {() => number|number} [deps.now]       - injectable clock (epoch ms).
 * @param {number}  [deps.dispatchElapsedMs]     - models live dispatch latency
 *   for the 5s deadline assertion (default 0 — synchronous).
 * @param {object}  [deps.outcomes]              - per-shot failure/spend overrides.
 * @param {Function} [deps.provenanceBuilder]   - `(shot, runId, dispatchResult) => ProvenanceChain|null`
   *   called per shot; attaches `provenance` to the asset record (R6.1, R6.3).
   *   Omit when no provenance chain is available.
 * @param {boolean} [deps.failIfProvenanceIncomplete] - when true (default false),
 *   a missing or incomplete provenance chain fails the shot (R6.6).
 * @returns {{ status, assets, ledgerEvents, ... }} the render result envelope.
 */
export function runRenderHarness(input, deps = {}) {
  const { shots } = validateRenderInput(input);
  const runId = cleanString(deps.runId, "video-remix-run");

  // Spend boundary (R8.2 / Property 1): verify the render Approval_Token BEFORE
  // any dispatch. A failed check is a fail-closed rejection — zero spend.
  const verification = verifyRenderToken(input.renderGateToken, {
    now: deps.now,
    gateId: RENDER_GATE_ID,
  });
  if (!verification.valid) {
    return buildTokenRejection(verification);
  }

  const queueClient = deps.queueClient || createDeterministicRenderQueueClient();
  const mockClient = deps.mockClient || createDeterministicMockProviderClient();
  const ledgerClient = deps.ledgerClient || createDeterministicLedgerClient();
  const providerKeyAvailable = Boolean(deps.providerKeyAvailable);
  const budgetCapCents = deps.budgetCapCents;
  const outcomes = deps.outcomes;
  const provenanceBuilder = deps.provenanceBuilder ?? null;
  const failIfProvenanceIncomplete = Boolean(deps.failIfProvenanceIncomplete);

  const assets = [];
  const ledgerEvents = [];
  let cumulativeSpendCents = 0;
  let providerDispatchCalls = 0;
  let failure = null;

  for (const shot of shots) {
    const { shotId } = shot;

    // Provider routing (R8.5 / Property 16): no key OR cap reached -> zero-spend
    // mock; otherwise the live-path queue provider.
    const route = selectRenderProvider({
      providerKeyAvailable,
      cumulativeSpendCents,
      budgetCapCents,
    });
    const client = route.useMock ? mockClient : queueClient;

    // Dispatch failure / 120s no-asset timeout (R8.6): record a ledger event
    // reflecting the actual spend incurred, name the failed shot, and STOP so
    // previously rendered shot assets are left unchanged.
    const outcome = resolveShotOutcome(outcomes, shotId);
    if (outcome && outcome.failed) {
      const spentCents = route.useMock
        ? 0
        : Number.isFinite(outcome.spentCents)
          ? Math.max(0, Math.round(outcome.spentCents))
          : 0;
      const ledgerEventId = renderLedgerEventId(runId, shotId);
      const provider = route.useMock ? mockClient.provider : queueClient.provider;
      const ledgerEvent = ledgerClient.record({
        ledgerEventId,
        runId,
        shotId,
        provider,
        providerSpendCents: spentCents,
      });
      ledgerEvents.push(ledgerEvent);
      cumulativeSpendCents += spentCents;
      failure = {
        shotId,
        reason: cleanString(outcome.reason, RENDER_FAILURE_DISPATCH_ERROR),
        ledgerEventId,
        providerSpendCents: spentCents,
      };
      break;
    }

    // Dispatch through the (injectable) queue/mock seam. Deterministic and
    // network-free locally; an injected live client (9.2) may dispatch for real.
    let dispatchResult;
    try {
      dispatchResult = client.dispatch({ shot, runId });
    } catch (error) {
      const ledgerEventId = renderLedgerEventId(runId, shotId);
      const ledgerEvent = ledgerClient.record({
        ledgerEventId,
        runId,
        shotId,
        provider: route.useMock ? mockClient.provider : queueClient.provider,
        providerSpendCents: 0,
      });
      ledgerEvents.push(ledgerEvent);
      failure = {
        shotId,
        reason: cleanString(error && error.message, RENDER_FAILURE_DISPATCH_ERROR),
        ledgerEventId,
        providerSpendCents: 0,
      };
      break;
    }

    // A dispatch that resolves without an asset reference is a no-asset timeout
    // (R8.6) — fail-closed, record actual spend, leave prior assets unchanged.
    if (!dispatchResult || !dispatchResult.assetUrl) {
      const ledgerEventId = renderLedgerEventId(runId, shotId);
      const ledgerEvent = ledgerClient.record({
        ledgerEventId,
        runId,
        shotId,
        provider: route.useMock ? mockClient.provider : queueClient.provider,
        providerSpendCents: 0,
      });
      ledgerEvents.push(ledgerEvent);
      failure = {
        shotId,
        reason: RENDER_FAILURE_NO_ASSET_TIMEOUT,
        ledgerEventId,
        providerSpendCents: 0,
      };
      break;
    }

    const costCents = route.useMock ? 0 : Math.max(0, Math.round(Number(dispatchResult.costCents) || 0));
    const provider = route.useMock ? mockClient.provider : cleanString(dispatchResult.provider, queueClient.provider);
    if (!route.useMock) providerDispatchCalls += 1;

    // R8.4 / Property 15: record EXACTLY one Credit_Ledger event (capturing
    // provider spend + provider identity) BEFORE returning the asset reference.
    const ledgerEventId = renderLedgerEventId(runId, shotId);
    const ledgerEvent = ledgerClient.record({
      ledgerEventId,
      runId,
      shotId,
      provider,
      providerSpendCents: costCents,
    });
    ledgerEvents.push(ledgerEvent);
    cumulativeSpendCents += costCents;

    // R8.3 / Property 15: EXACTLY one asset reference per completed shot,
    // resolvable under the agentic-graph media bucket, carrying its single ledger
    // event id. The contract fields are `{ shotId, assetUrl, ledgerEventId,
    // costCents }`; `provider`/`objectKey`/`bucket` are observable metadata.
    const asset = {
      shotId,
      assetUrl: dispatchResult.assetUrl,
      durableR2Url: dispatchResult.durableR2Url ?? dispatchResult.assetUrl,
      ledgerEventId,
      costCents,
      provider,
      objectKey: dispatchResult.objectKey ?? null,
      bucket: dispatchResult.bucket ?? null,
    };
    // R6.1, R6.3, R6.6: attach provenance before marking step complete.
    const { failure: provenanceFailure } = applyProvenance({
      asset, shot, runId, dispatchResult,
      provenanceBuilder, failIfProvenanceIncomplete, ledgerEventId,
    });
    if (provenanceFailure) { failure = provenanceFailure; break; }
    assets.push(asset);
  }

  const dispatchElapsedMs = Number.isFinite(deps.dispatchElapsedMs)
    ? Math.max(0, deps.dispatchElapsedMs)
    : 0;

  return {
    status: failure ? RENDER_STATUS_FAILED : RENDER_STATUS_COMPLETE,
    gateId: RENDER_GATE_ID,
    dispatched: true,
    dispatchElapsedMs,
    dispatchWithinDeadline: dispatchElapsedMs <= RENDER_DISPATCH_DEADLINE_MS,
    dispatchDeadlineMs: RENDER_DISPATCH_DEADLINE_MS,
    completionTimeoutMs: RENDER_COMPLETION_TIMEOUT_MS,
    assets,
    ledgerEvents,
    providerDispatchCalls,
    // Local default routes everything to the zero-spend mock, so paid-provider
    // calls are 0; a live-path dispatch increments providerDispatchCalls, which
    // the Director accounts as paid-provider calls.
    paidProviderCalls: providerDispatchCalls,
    providerSpendCents: cumulativeSpendCents,
    failure,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Async variant (task 12.4a) — identical semantics to `runRenderHarness` but
// `await`s the dispatch + ledger seams so a LIVE async render client
// (`createStrytreeRenderQueueClient`, task 12.4) can be consumed. The sync
// `runRenderHarness` above remains the default for the deterministic Director /
// test path. A parity test (`render-harness-async.test.mjs`) asserts the two
// produce identical results on the same deterministic seams so they cannot
// drift; keep any change to one mirrored in the other.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Async sibling of {@link runRenderHarness}. Same contract, same fail-closed
 * token rejection (R8.2), same routing (R8.5/16), same per-shot ledger+asset
 * emission (R8.3/8.4), same dispatch-failure / no-asset semantics (R8.6) — the
 * only difference is that `client.dispatch(...)` and `ledgerClient.record(...)`
 * are awaited, so an async live client works. Awaiting a synchronous mock seam
 * is a no-op, so behavior matches the sync variant exactly.
 */
export async function runRenderHarnessAsync(input, deps = {}) {
  const { shots } = validateRenderInput(input);
  const runId = cleanString(deps.runId, "video-remix-run");

  const verification = verifyRenderToken(input.renderGateToken, {
    now: deps.now,
    gateId: RENDER_GATE_ID,
  });
  if (!verification.valid) {
    return buildTokenRejection(verification);
  }

  const queueClient = deps.queueClient || createDeterministicRenderQueueClient();
  const mockClient = deps.mockClient || createDeterministicMockProviderClient();
  const ledgerClient = deps.ledgerClient || createDeterministicLedgerClient();
  const providerKeyAvailable = Boolean(deps.providerKeyAvailable);
  const budgetCapCents = deps.budgetCapCents;
  const outcomes = deps.outcomes;
  const provenanceBuilder = deps.provenanceBuilder ?? null;
  const failIfProvenanceIncomplete = Boolean(deps.failIfProvenanceIncomplete);

  const assets = [];
  const ledgerEvents = [];
  let cumulativeSpendCents = 0;
  let providerDispatchCalls = 0;
  let failure = null;

  for (const shot of shots) {
    const { shotId } = shot;

    const route = selectRenderProvider({
      providerKeyAvailable,
      cumulativeSpendCents,
      budgetCapCents,
    });
    const client = route.useMock ? mockClient : queueClient;

    const outcome = resolveShotOutcome(outcomes, shotId);
    if (outcome && outcome.failed) {
      const spentCents = route.useMock
        ? 0
        : Number.isFinite(outcome.spentCents)
          ? Math.max(0, Math.round(outcome.spentCents))
          : 0;
      const ledgerEventId = renderLedgerEventId(runId, shotId);
      const provider = route.useMock ? mockClient.provider : queueClient.provider;
      const ledgerEvent = await ledgerClient.record({
        ledgerEventId,
        runId,
        shotId,
        provider,
        providerSpendCents: spentCents,
      });
      ledgerEvents.push(ledgerEvent);
      cumulativeSpendCents += spentCents;
      failure = {
        shotId,
        reason: cleanString(outcome.reason, RENDER_FAILURE_DISPATCH_ERROR),
        ledgerEventId,
        providerSpendCents: spentCents,
      };
      break;
    }

    let dispatchResult;
    try {
      dispatchResult = await client.dispatch({ shot, runId });
    } catch (error) {
      const ledgerEventId = renderLedgerEventId(runId, shotId);
      const ledgerEvent = await ledgerClient.record({
        ledgerEventId,
        runId,
        shotId,
        provider: route.useMock ? mockClient.provider : queueClient.provider,
        providerSpendCents: 0,
      });
      ledgerEvents.push(ledgerEvent);
      failure = {
        shotId,
        reason: cleanString(error && error.message, RENDER_FAILURE_DISPATCH_ERROR),
        ledgerEventId,
        providerSpendCents: 0,
      };
      break;
    }

    if (!dispatchResult || !dispatchResult.assetUrl) {
      const ledgerEventId = renderLedgerEventId(runId, shotId);
      const ledgerEvent = await ledgerClient.record({
        ledgerEventId,
        runId,
        shotId,
        provider: route.useMock ? mockClient.provider : queueClient.provider,
        providerSpendCents: 0,
      });
      ledgerEvents.push(ledgerEvent);
      failure = {
        shotId,
        reason: RENDER_FAILURE_NO_ASSET_TIMEOUT,
        ledgerEventId,
        providerSpendCents: 0,
      };
      break;
    }

    const costCents = route.useMock ? 0 : Math.max(0, Math.round(Number(dispatchResult.costCents) || 0));
    const provider = route.useMock ? mockClient.provider : cleanString(dispatchResult.provider, queueClient.provider);
    if (!route.useMock) providerDispatchCalls += 1;

    const ledgerEventId = renderLedgerEventId(runId, shotId);
    const ledgerEvent = await ledgerClient.record({
      ledgerEventId,
      runId,
      shotId,
      provider,
      providerSpendCents: costCents,
    });
    ledgerEvents.push(ledgerEvent);
    cumulativeSpendCents += costCents;

    const asset = {
      shotId,
      assetUrl: dispatchResult.assetUrl,
      durableR2Url: dispatchResult.durableR2Url ?? dispatchResult.assetUrl,
      ledgerEventId,
      costCents,
      provider,
      objectKey: dispatchResult.objectKey ?? null,
      bucket: dispatchResult.bucket ?? null,
    };
    // R6.1, R6.3, R6.6: attach provenance before marking step complete.
    const { failure: provenanceFailure } = applyProvenance({
      asset, shot, runId, dispatchResult,
      provenanceBuilder, failIfProvenanceIncomplete, ledgerEventId,
    });
    if (provenanceFailure) { failure = provenanceFailure; break; }
    assets.push(asset);
  }

  const dispatchElapsedMs = Number.isFinite(deps.dispatchElapsedMs)
    ? Math.max(0, deps.dispatchElapsedMs)
    : 0;

  return {
    status: failure ? RENDER_STATUS_FAILED : RENDER_STATUS_COMPLETE,
    gateId: RENDER_GATE_ID,
    dispatched: true,
    dispatchElapsedMs,
    dispatchWithinDeadline: dispatchElapsedMs <= RENDER_DISPATCH_DEADLINE_MS,
    dispatchDeadlineMs: RENDER_DISPATCH_DEADLINE_MS,
    completionTimeoutMs: RENDER_COMPLETION_TIMEOUT_MS,
    assets,
    ledgerEvents,
    providerDispatchCalls,
    paidProviderCalls: providerDispatchCalls,
    providerSpendCents: cumulativeSpendCents,
    failure,
  };
}
