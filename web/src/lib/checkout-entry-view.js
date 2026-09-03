// Post-render checkout entry-point view-model for the agentic-graph Cloudflare Pages
// Frontend.
//
// Spec: agentic-graph-acos-mcp-connector, task 7.8 (R1.7; design Correctness
// Property 32; design Frontend `renderManifest`).
//
// R1.7: "WHEN a render completes and the `payment-action` Approval_Gate is
// approved, THE Frontend SHALL present the rendered asset and a Stripe checkout
// entry point to the end creator user."
//
// This module is the PURE, framework-agnostic, ZERO-network/ZERO-browser
// view-model builder that turns a Run_Manifest (or a manifest-bearing envelope)
// into a render-ready post-render checkout entry point:
//
//   { showCheckout, assetRef, checkoutAvailable, gateApproved, ... }
//
// The checkout entry point is presented IFF BOTH conditions hold (R1.7):
//   1. the `payment-action` Approval_Gate is `approved`, AND
//   2. a rendered asset reference exists.
// Before approval (gate pending/rejected/required/absent) NO checkout entry is
// shown; if no rendered asset exists, NO checkout entry is shown even when the
// gate is approved. The rendered asset reference itself is surfaced whenever it
// exists, independent of the gate, so the creator can preview the asset.
//
// SCHEMA REUSE (do NOT fork):
//   * ApprovalGate MIRRORS the durable Run_Manifest (design Data Models) and
//     the runtime `buildApprovalGates` projection in
//     `mcp/video-remix/approvals.js`. The runtime emits `{ id, approvalState }`
//     with `approvalState` one of `approved`/`required`; the design Data Model
//     uses `{ gateId, approvalState }` with `pending`/`approved`/`rejected`.
//     This view tolerates BOTH carriers (`gateId` || `id`,
//     `approvalState` || `state`) and treats ONLY the literal `approved` as
//     approved — matching the approval-prompt-view (task 7.6) posture.
//   * The rendered asset reference MIRRORS the Render_Harness assets in
//     `mcp/video-remix/render-harness.js` / `run-video-remix.js`
//     (`{ shotId, assetUrl, ledgerEventId, costCents, storageUri }`), surfaced
//     on the manifest as `render.assets[]`. The view reads these fields rather
//     than re-deriving a different schema, and also surfaces the Stripe
//     `commerce.checkout.sessionId` when it already exists.
//
// STACK BOUNDARY (R11): the product tier holds no model provider keys; this
// builder reads only manifest data and performs no I/O.

// --- Contract constants -----------------------------------------------------

/** The Approval_Gate that authorizes the Stripe checkout entry point (R1.7). */
export const PAYMENT_GATE_ID = "payment-action";

/** The Approval_Gate state that authorizes presenting checkout (R9.1, R1.7). */
export const APPROVED_STATE = "approved";

// --- Helpers ----------------------------------------------------------------

/**
 * Resolve the raw Run_Manifest object from any of the carriers the Frontend may
 * receive:
 *   - a raw Run_Manifest (`{ approvalGates, render, commerce, ... }`)
 *   - a manifest nested under `runManifest` / `manifest` / `payload`
 * Tolerates malformed/missing input by returning an empty object (never throws).
 *
 * @param {unknown} input Run_Manifest or manifest-bearing envelope
 * @returns {object}
 */
export function resolveManifest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  // Common nesting carriers: unwrap one level when present.
  for (const key of ["runManifest", "manifest", "payload"]) {
    const nested = input[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      // Only unwrap when the nested object actually looks like a manifest.
      if (Array.isArray(nested.approvalGates) || nested.render || nested.commerce) {
        return nested;
      }
    }
  }

  return input;
}

/**
 * Resolve the `approvalGates[]` array from a (already-unwrapped) manifest.
 * Tolerates a missing/non-array field by returning an empty array.
 *
 * @param {object} manifest
 * @returns {Array<unknown>}
 */
function resolveGates(manifest) {
  return Array.isArray(manifest.approvalGates) ? manifest.approvalGates : [];
}

/**
 * Resolve the rendered asset list from a (already-unwrapped) manifest. Assets
 * surface under `render.assets[]` (runtime / Render_Harness contract); a bare
 * top-level `assets[]` is also tolerated for resilience.
 *
 * @param {object} manifest
 * @returns {Array<unknown>}
 */
function resolveAssets(manifest) {
  const render = manifest.render;
  if (render && typeof render === "object" && !Array.isArray(render) && Array.isArray(render.assets)) {
    return render.assets;
  }
  return Array.isArray(manifest.assets) ? manifest.assets : [];
}

/**
 * Trim a value to a non-empty string, falling back to `fallback` (default "").
 * Mirrors the defensive `cleanString` / `toText` posture used across the
 * product-tier view builders without importing it (each module stays
 * self-contained).
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
 * Read a gate's id from either carrier (`gateId` per the design Data Model, or
 * `id` per the runtime `buildApprovalGates` projection).
 *
 * @param {object} gate
 * @returns {string}
 */
function gateIdOf(gate) {
  return toText(gate.gateId) || toText(gate.id);
}

/**
 * Read a gate's approval state from either carrier (`approvalState` or `state`).
 *
 * @param {object} gate
 * @returns {string}
 */
function gateStateOf(gate) {
  return toText(gate.approvalState) || toText(gate.state);
}

/**
 * Locate the `payment-action` Approval_Gate among the manifest gates,
 * tolerating malformed/non-object entries. Returns `null` when absent.
 *
 * @param {Array<unknown>} gates
 * @returns {object|null}
 */
function findPaymentGate(gates) {
  for (const gate of gates) {
    if (gate && typeof gate === "object" && !Array.isArray(gate) && gateIdOf(gate) === PAYMENT_GATE_ID) {
      return gate;
    }
  }
  return null;
}

/**
 * Build the rendered-asset reference surfaced to the creator. Reuses the
 * Render_Harness asset shape `{ shotId, assetUrl, ledgerEventId, costCents,
 * storageUri }`. Returns `null` when no resolvable asset exists (an asset must
 * carry a non-empty `assetUrl` to be presentable).
 *
 * @param {Array<unknown>} assets
 * @returns {object|null}
 */
function buildAssetRef(assets) {
  for (const asset of assets) {
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) continue;
    const assetUrl = toText(asset.assetUrl);
    if (!assetUrl) continue;
    return {
      shotId: toText(asset.shotId),
      assetUrl,
      storageUri: toText(asset.storageUri) || null,
      ledgerEventId: toText(asset.ledgerEventId) || null,
    };
  }
  return null;
}

// --- Public API -------------------------------------------------------------

/**
 * Build the post-render checkout entry-point view-model from a Run_Manifest (or
 * a manifest-bearing envelope).
 *
 * The Stripe checkout entry point is presented (`showCheckout === true`) IFF
 * the `payment-action` Approval_Gate is `approved` AND a rendered asset
 * reference exists (R1.7 / Property 32). Otherwise `showCheckout` is false:
 *   - gate pending/rejected/required/absent -> no checkout entry (`gateApproved`
 *     false), even when an asset exists;
 *   - asset missing -> no checkout entry (`assetReady` false), even when the
 *     gate is approved.
 *
 * The rendered asset reference (`assetRef`) is surfaced whenever it exists,
 * independent of the gate, so the creator can preview the asset before/while
 * the gate is decided. The Stripe `sessionId` is surfaced when the manifest
 * already carries one (`commerce.checkout.sessionId`).
 *
 * Pure and deterministic: performs no I/O, never mutates the input, and never
 * throws for malformed input.
 *
 * @param {unknown} manifest Run_Manifest or manifest-bearing envelope
 * @returns {{
 *   showCheckout: boolean,
 *   checkoutAvailable: boolean,
 *   gateApproved: boolean,
 *   assetReady: boolean,
 *   assetRef: { shotId: string, assetUrl: string, storageUri: string|null, ledgerEventId: string|null }|null,
 *   paymentGateId: string,
 *   paymentGateState: string|null,
 *   sessionId: string|null,
 *   reason: string,
 * }}
 */
export function buildCheckoutEntryView(manifest) {
  const resolved = resolveManifest(manifest);
  const gates = resolveGates(resolved);
  const assets = resolveAssets(resolved);

  const paymentGate = findPaymentGate(gates);
  const paymentGateState = paymentGate ? (gateStateOf(paymentGate) || null) : null;
  const gateApproved = paymentGateState === APPROVED_STATE;

  const assetRef = buildAssetRef(assets);
  const assetReady = assetRef !== null;

  // R1.7 / Property 32: present checkout IFF payment-action approved AND a
  // rendered asset exists.
  const showCheckout = gateApproved && assetReady;

  // Surface an existing Stripe session id when the commerce stage already
  // created one (`commerce.checkout.sessionId`), tolerating absence.
  const commerce = resolved.commerce && typeof resolved.commerce === "object" ? resolved.commerce : {};
  const checkout = commerce.checkout && typeof commerce.checkout === "object" ? commerce.checkout : {};
  const sessionId = toText(checkout.sessionId) || null;

  // Human-readable rationale for the render layer (display only).
  let reason;
  if (showCheckout) reason = "checkout_ready";
  else if (!gateApproved && !assetReady) reason = "awaiting_payment_gate_and_asset";
  else if (!gateApproved) reason = "awaiting_payment_gate";
  else reason = "awaiting_rendered_asset";

  return {
    showCheckout,
    checkoutAvailable: showCheckout,
    gateApproved,
    assetReady,
    assetRef,
    paymentGateId: PAYMENT_GATE_ID,
    paymentGateState,
    sessionId,
    reason,
  };
}
