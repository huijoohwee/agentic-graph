// Approval-prompt rendering view-model for the agenticgraph Cloudflare Pages
// Frontend.
//
// Spec: agenticgraph-acos-mcp-connector, task 7.6 (R1.6, R13.1; design Correctness
// Property 32; design Frontend `renderApprovalPrompts`).
//
// R13.1: "WHEN the Run_Manifest contains one or more pending Approval_Gate
// entries, THE Frontend SHALL render an approval prompt for EACH pending
// Approval_Gate within 2 seconds of receiving the Run_Manifest, displaying the
// gate identifier and the associated spend amount."
// R1.6: "WHEN the Director raises an Approval_Gate, THE Frontend SHALL render an
// approval prompt that displays the gate id and the estimated cost of the gated
// action."
//
// This module is the PURE, framework-agnostic, ZERO-network/ZERO-browser
// view-model builder that turns a Run_Manifest (or a manifest-bearing envelope)
// into a render-ready set of approval prompts:
//
//   { prompts: [...], pendingCount, renderWithinDeadline, renderDeadlineMs, ... }
//
// with EXACTLY ONE prompt per PENDING Approval_Gate — gates whose
// `approvalState` is `approved` or `rejected` raise NO prompt (the creator has
// nothing left to decide on them) — in manifest order, each prompt carrying the
// gate id and the estimated spend amount. The rendered prompt count equals the
// count of pending gates: NO dropping and NO de-duplication beyond the
// manifest's own gate set.
//
// SCHEMA REUSE (do NOT fork): the ApprovalGate shape MIRRORS the durable
// Run_Manifest in the design Data Models / worker tier:
//   ApprovalGate { gateId, approvalState: "pending"|"approved"|"rejected",
//                  estimatedCostUsd: decimal, token: Approval_Token|null }
// and the canonical gate-id catalog used by the Hitl_Gate_Service
// (`consumer-repo-write`, `cloud-deploy`, `paid-model-call`, `render-action`,
// `payment-action`, `authenticated-browser`). The view reads these fields
// rather than re-deriving a different schema.
//
// 2s RENDER DEADLINE (R13.1): the "within 2 seconds of receiving the manifest"
// bound is recorded as STRUCTURAL METADATA and asserted structurally — there is
// NO real timer here. An injectable elapsed signal (`renderElapsedMs`) models a
// slow render, mirroring the run-submission-client (`submitElapsedMs` /
// `RUN_SUBMIT_DEADLINE_MS`) and Agent_Api deadline patterns.
//
// STACK BOUNDARY (R11): the product tier holds no model provider keys; this
// builder reads only manifest data and performs no I/O.

// --- Contract constants -----------------------------------------------------

/**
 * Structural render deadline (R13.1): each pending Approval_Gate must render a
 * prompt within 2,000 ms of the Frontend receiving the Run_Manifest. Timer-free
 * here — the builder is synchronous; an injectable elapsed signal models a slow
 * render so the deadline can be asserted structurally.
 */
export const APPROVAL_PROMPT_DEADLINE_MS = 2000;

/** The Approval_Gate state that requires a creator decision (raises a prompt). */
export const PENDING_APPROVAL_STATE = "pending";

/**
 * The canonical Approval_Gate id catalog (design Data Models / Hitl_Gate_Service
 * `buildApprovalGates`). Surfaced so a renderer can label a known gate; an
 * unknown id still renders (the catalog is NOT a filter — every pending gate in
 * the manifest raises a prompt).
 */
export const CANONICAL_GATE_IDS = Object.freeze([
  "consumer-repo-write",
  "cloud-deploy",
  "paid-model-call",
  "render-action",
  "payment-action",
  "authenticated-browser",
]);

/** Human-readable labels for the canonical gates (display only). */
export const GATE_LABELS = Object.freeze({
  "consumer-repo-write": "Consumer Repo Write",
  "cloud-deploy": "Cloud Deploy",
  "paid-model-call": "Paid Model Call",
  "render-action": "Render Action",
  "payment-action": "Payment Action",
  "authenticated-browser": "Authenticated Browser",
});

// --- Helpers ----------------------------------------------------------------

/**
 * Resolve the `approvalGates[]` array from any of the manifest carriers the
 * Frontend may receive:
 *   - a raw Run_Manifest (`{ approvalGates: [...] }`)
 *   - a manifest nested under `runManifest` / `manifest`
 * Tolerates malformed/missing input by returning an empty array (never throws).
 *
 * @param {unknown} input Run_Manifest or manifest-bearing envelope
 * @returns {Array<unknown>}
 */
export function resolveApprovalGates(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];

  // Common nesting carriers: unwrap one level when present.
  for (const key of ["runManifest", "manifest"]) {
    const nested = input[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const gates = nested.approvalGates;
      if (Array.isArray(gates)) return gates;
    }
  }

  return Array.isArray(input.approvalGates) ? input.approvalGates : [];
}

/**
 * Trim a value to a non-empty string, falling back to `fallback` (default "").
 * Mirrors the defensive `toText` posture used across the product-tier view
 * builders without importing it (each module stays self-contained).
 *
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
function toText(value, fallback = "") {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return fallback;
}

/**
 * Coerce a value to a finite, non-negative spend amount (USD). A
 * missing/malformed/negative `estimatedCostUsd` falls back to 0 so a prompt
 * ALWAYS surfaces a displayable amount (R1.6 / R13.1) and never NaN.
 *
 * @param {unknown} value
 * @returns {number}
 */
function toSpendAmount(value) {
  const amount = Number(value);
  if (Number.isFinite(amount) && amount >= 0) return amount;
  return 0;
}

/**
 * Format a spend amount as a USD display string (e.g. `$0.00`, `$42.50`). Pure
 * and locale-independent so the rendered value is deterministic across
 * environments.
 *
 * @param {number} amount finite, non-negative USD amount
 * @returns {string}
 */
function formatUsd(amount) {
  return `$${amount.toFixed(2)}`;
}

/**
 * True iff the gate is a PENDING Approval_Gate — the only state that requires a
 * creator decision and therefore raises a prompt (R13.1). Tolerates a
 * malformed/missing gate by returning false (no prompt for junk entries).
 *
 * @param {unknown} gate
 * @returns {boolean}
 */
export function isPendingGate(gate) {
  return (
    Boolean(gate) &&
    typeof gate === "object" &&
    !Array.isArray(gate) &&
    gate.approvalState === PENDING_APPROVAL_STATE
  );
}

/**
 * Build a single approval prompt for a pending gate, carrying its `gateId` and
 * the estimated spend amount (R1.6) plus display-ready fields. A blank/missing
 * `gateId` falls back to a stable positional id so every pending gate still
 * renders a distinct prompt (no dropping). `order` preserves the gate's
 * position among the rendered prompts.
 *
 * @param {object} gate a PENDING Approval_Gate
 * @param {number} order position among rendered prompts (0-based)
 * @returns {object}
 */
function buildPromptEntry(gate, order) {
  const gateId = toText(gate.gateId, `gate-${order + 1}`);
  const estimatedCostUsd = toSpendAmount(gate.estimatedCostUsd);
  return {
    gateId,
    order,
    label: GATE_LABELS[gateId] || gateId,
    approvalState: PENDING_APPROVAL_STATE,
    estimatedCostUsd,
    estimatedCostDisplay: formatUsd(estimatedCostUsd),
    isCanonicalGate: CANONICAL_GATE_IDS.includes(gateId),
  };
}

/**
 * Resolve the (timer-free) render-elapsed signal. The real elapsed time is
 * measured by the live wiring; here a caller injects whether the render
 * exceeded the 2,000 ms deadline so the metadata can be asserted structurally.
 * Defaults to 0 (synchronous deterministic build).
 *
 * @param {unknown} value injected elapsed signal (ms)
 * @returns {number}
 */
function resolveRenderElapsedMs(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

// --- Public API -------------------------------------------------------------

/**
 * Build the approval-prompt rendering view-model from a Run_Manifest (or a
 * manifest-bearing envelope).
 *
 * The result renders EXACTLY ONE prompt per PENDING Approval_Gate — gates whose
 * `approvalState` is `approved` or `rejected` raise NO prompt — in manifest
 * order, with NO dropping and NO de-duplication beyond the manifest's own gate
 * set (R1.6 / R13.1 / Property 32). Each prompt carries the gate id and the
 * estimated spend amount (both the raw `estimatedCostUsd` number and a
 * `$0.00`-formatted `estimatedCostDisplay`). `pendingCount` equals the number
 * of rendered prompts. A manifest with no pending gates renders gracefully with
 * an empty `prompts` list, `pendingCount` 0, and `hasPending` false.
 *
 * The 2,000 ms render deadline (R13.1) is recorded as structural metadata:
 * `renderDeadlineMs` is the bound, `renderElapsedMs` is the injected elapsed
 * signal (default 0), and `renderWithinDeadline` is true iff the elapsed signal
 * is within the bound. There is NO real timer.
 *
 * Pure and deterministic: performs no I/O, never mutates the input, and never
 * throws for malformed input.
 *
 * @param {unknown} manifest Run_Manifest or manifest-bearing envelope
 * @param {object} [opts]
 * @param {number} [opts.renderElapsedMs] injected elapsed signal (ms) modelling
 *   render latency for the 2,000 ms deadline assertion (default 0 — synchronous)
 * @returns {{
 *   prompts: Array<{
 *     gateId: string,
 *     order: number,
 *     label: string,
 *     approvalState: "pending",
 *     estimatedCostUsd: number,
 *     estimatedCostDisplay: string,
 *     isCanonicalGate: boolean,
 *   }>,
 *   pendingCount: number,
 *   hasPending: boolean,
 *   gateCount: number,
 *   renderElapsedMs: number,
 *   renderWithinDeadline: boolean,
 *   renderDeadlineMs: number,
 * }}
 */
export function buildApprovalPromptView(manifest, opts = {}) {
  const gates = resolveApprovalGates(manifest);

  // One prompt per PENDING gate, in manifest order — approved/rejected gates
  // raise no prompt (R13.1). No dropping, no dedup beyond the manifest's set.
  const prompts = [];
  for (const gate of gates) {
    if (isPendingGate(gate)) {
      prompts.push(buildPromptEntry(gate, prompts.length));
    }
  }

  // 2,000 ms render-deadline metadata (R13.1) — asserted structurally.
  const renderElapsedMs = resolveRenderElapsedMs(opts.renderElapsedMs);

  return {
    prompts,
    pendingCount: prompts.length,
    hasPending: prompts.length > 0,
    gateCount: gates.length,
    renderElapsedMs,
    renderWithinDeadline: renderElapsedMs <= APPROVAL_PROMPT_DEADLINE_MS,
    renderDeadlineMs: APPROVAL_PROMPT_DEADLINE_MS,
  };
}
