// Tests for the post-render checkout entry-point view-model
// (agenticgraph-acos-mcp-connector spec, task 7.8 / R1.7 / design Correctness
// Property 32 / design Frontend `renderManifest`).
//
// Covers:
//   - payment-action approved + rendered asset present -> checkout entry shown
//     with the asset surfaced
//   - payment-action pending/rejected/required/absent -> NO checkout entry
//   - rendered asset missing -> NO checkout entry even when the gate is approved
//   - the rendered asset is surfaced whenever it exists, independent of the gate
//   - both the runtime gate carrier (`id` + approved/required) and the design
//     Data Model carrier (`gateId` + pending/approved/rejected) are accepted
//   - both a raw Run_Manifest and a manifest-bearing envelope are accepted
//   - malformed / empty input never throws
//
// The ApprovalGate shape MIRRORS `mcp/video-remix/approvals.js`; the rendered
// asset reference MIRRORS `mcp/video-remix/render-harness.js` /
// `run-video-remix.js`.
//
// ZERO network / ZERO browser.

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCheckoutEntryView,
  resolveManifest,
  PAYMENT_GATE_ID,
  APPROVED_STATE,
} from "../src/lib/checkout-entry-view.js";

// --- Fixtures ---------------------------------------------------------------

/** A rendered asset reference as the Render_Harness / runtime emits it. */
function asset(shotId = "shot-1") {
  return {
    shotId,
    assetUrl: `https://airvio.co/agenticgraph/assets/media/run-1/${shotId}.mp4`,
    storageUri: `r2://agenticgraph-media/run-1/${shotId}.mp4`,
    ledgerEventId: `ledger-run-1-${shotId}`,
    costCents: 0,
  };
}

/**
 * Build the canonical six-gate `approvalGates[]` projection (runtime carrier:
 * `{ id, approvalState }` with approved/required), setting the `payment-action`
 * gate to the given state.
 */
function runtimeGates(paymentState = "required") {
  const ids = [
    "paid-model-call",
    "render-action",
    "payment-action",
    "cloud-deploy",
    "consumer-repo-write",
    "authenticated-browser",
  ];
  return ids.map((id) => ({
    id,
    approvalState: id === PAYMENT_GATE_ID ? paymentState : "required",
    tokenRequired: true,
  }));
}

/** A Run_Manifest with the given payment-gate state and rendered assets. */
function manifest({ paymentState = "required", assets = [asset()], sessionId = "" } = {}) {
  return {
    runId: "run-1",
    state: "complete",
    approvalGates: runtimeGates(paymentState),
    render: { assets },
    commerce: { publish: { publishedUrls: [] }, checkout: { sessionId, payoutSettled: false } },
  };
}

// --- payment-action approved + asset present -> checkout shown --------------

test("payment-action approved + rendered asset present -> checkout entry shown with asset", () => {
  const view = buildCheckoutEntryView(manifest({ paymentState: "approved" }));
  assert.equal(view.showCheckout, true);
  assert.equal(view.checkoutAvailable, true);
  assert.equal(view.gateApproved, true);
  assert.equal(view.assetReady, true);
  assert.ok(view.assetRef);
  assert.equal(view.assetRef.shotId, "shot-1");
  assert.ok(view.assetRef.assetUrl.length > 0);
  assert.equal(view.paymentGateState, "approved");
  assert.equal(view.reason, "checkout_ready");
});

test("an existing Stripe session id is surfaced when present", () => {
  const view = buildCheckoutEntryView(manifest({ paymentState: "approved", sessionId: "cs_test_run_1" }));
  assert.equal(view.showCheckout, true);
  assert.equal(view.sessionId, "cs_test_run_1");
});

// --- payment-action not approved -> no checkout entry -----------------------

test("payment-action required (pre-approval) -> no checkout entry", () => {
  const view = buildCheckoutEntryView(manifest({ paymentState: "required" }));
  assert.equal(view.showCheckout, false);
  assert.equal(view.gateApproved, false);
  // The asset still exists and is surfaced for preview, independent of the gate.
  assert.equal(view.assetReady, true);
  assert.ok(view.assetRef);
  assert.equal(view.reason, "awaiting_payment_gate");
});

test("payment-action pending (design Data Model state) -> no checkout entry", () => {
  const m = manifest({ paymentState: "approved" });
  // Switch to the design Data Model carrier with `pending`.
  m.approvalGates = [{ gateId: PAYMENT_GATE_ID, approvalState: "pending", estimatedCostUsd: 5 }];
  const view = buildCheckoutEntryView(m);
  assert.equal(view.showCheckout, false);
  assert.equal(view.gateApproved, false);
  assert.equal(view.paymentGateState, "pending");
});

test("payment-action rejected -> no checkout entry", () => {
  const m = manifest({ paymentState: "approved" });
  m.approvalGates = [{ gateId: PAYMENT_GATE_ID, approvalState: "rejected", estimatedCostUsd: 5 }];
  const view = buildCheckoutEntryView(m);
  assert.equal(view.showCheckout, false);
  assert.equal(view.gateApproved, false);
});

test("payment-action gate absent entirely -> no checkout entry", () => {
  const m = manifest({ paymentState: "approved" });
  m.approvalGates = m.approvalGates.filter((g) => g.id !== PAYMENT_GATE_ID);
  const view = buildCheckoutEntryView(m);
  assert.equal(view.showCheckout, false);
  assert.equal(view.gateApproved, false);
  assert.equal(view.paymentGateState, null);
});

// --- asset missing -> no checkout even when approved ------------------------

test("asset missing -> no checkout entry even when payment-action approved", () => {
  const view = buildCheckoutEntryView(manifest({ paymentState: "approved", assets: [] }));
  assert.equal(view.showCheckout, false);
  assert.equal(view.gateApproved, true);
  assert.equal(view.assetReady, false);
  assert.equal(view.assetRef, null);
  assert.equal(view.reason, "awaiting_rendered_asset");
});

test("an asset with no assetUrl is not presentable (no checkout)", () => {
  const view = buildCheckoutEntryView(
    manifest({ paymentState: "approved", assets: [{ shotId: "shot-1", costCents: 0 }] }),
  );
  assert.equal(view.showCheckout, false);
  assert.equal(view.assetReady, false);
  assert.equal(view.assetRef, null);
});

test("neither gate approved nor asset present -> awaiting both", () => {
  const view = buildCheckoutEntryView(manifest({ paymentState: "required", assets: [] }));
  assert.equal(view.showCheckout, false);
  assert.equal(view.reason, "awaiting_payment_gate_and_asset");
});

// --- runtime + design carriers ----------------------------------------------

test("accepts the runtime gate carrier (id + approved)", () => {
  const m = manifest({ paymentState: "approved" });
  // runtimeGates already uses { id, approvalState }; confirm approval resolves.
  assert.equal(buildCheckoutEntryView(m).gateApproved, true);
});

test("accepts the design Data Model carrier (gateId + approved)", () => {
  const m = manifest({ paymentState: "approved" });
  m.approvalGates = [{ gateId: PAYMENT_GATE_ID, approvalState: APPROVED_STATE, estimatedCostUsd: 5 }];
  const view = buildCheckoutEntryView(m);
  assert.equal(view.gateApproved, true);
  assert.equal(view.showCheckout, true);
});

test("accepts a gate `state` alias for approvalState", () => {
  const m = manifest({ paymentState: "approved" });
  m.approvalGates = [{ id: PAYMENT_GATE_ID, state: "approved" }];
  assert.equal(buildCheckoutEntryView(m).gateApproved, true);
});

// --- envelope unwrapping ----------------------------------------------------

test("accepts a manifest-bearing envelope (runManifest / manifest / payload)", () => {
  const m = manifest({ paymentState: "approved" });
  for (const key of ["runManifest", "manifest", "payload"]) {
    const view = buildCheckoutEntryView({ [key]: m });
    assert.equal(view.showCheckout, true, `unwrap via ${key}`);
  }
});

test("resolveManifest unwraps a nested manifest carrier", () => {
  const m = manifest({ paymentState: "approved" });
  assert.equal(resolveManifest({ runManifest: m }), m);
  assert.equal(resolveManifest({ manifest: m }), m);
  assert.equal(resolveManifest({ payload: m }), m);
});

test("resolveManifest returns the top-level manifest unchanged", () => {
  const m = manifest({ paymentState: "approved" });
  assert.equal(resolveManifest(m), m);
});

// --- asset resolution from a bare top-level assets[] ------------------------

test("tolerates a bare top-level assets[] (no render wrapper)", () => {
  const view = buildCheckoutEntryView({
    approvalGates: runtimeGates("approved"),
    assets: [asset("shot-9")],
  });
  assert.equal(view.showCheckout, true);
  assert.equal(view.assetRef.shotId, "shot-9");
});

test("the first presentable asset is surfaced when several exist", () => {
  const view = buildCheckoutEntryView(
    manifest({ paymentState: "approved", assets: [{ shotId: "x" }, asset("shot-2"), asset("shot-3")] }),
  );
  assert.equal(view.assetRef.shotId, "shot-2");
});

// --- malformed input never throws -------------------------------------------

test("malformed input never throws and yields no checkout", () => {
  for (const bad of [null, undefined, 5, "x", [], true, NaN, {}]) {
    const view = buildCheckoutEntryView(bad);
    assert.equal(view.showCheckout, false);
    assert.equal(view.checkoutAvailable, false);
    assert.equal(view.gateApproved, false);
    assert.equal(view.assetReady, false);
    assert.equal(view.assetRef, null);
    assert.equal(view.paymentGateId, PAYMENT_GATE_ID);
  }
});

test("malformed gate / asset entries are tolerated without throwing", () => {
  const view = buildCheckoutEntryView({
    approvalGates: [null, 5, "x", [], { gateId: PAYMENT_GATE_ID, approvalState: "approved" }],
    render: { assets: [null, 7, "x", [], asset("ok")] },
  });
  assert.equal(view.gateApproved, true);
  assert.equal(view.assetReady, true);
  assert.equal(view.assetRef.shotId, "ok");
  assert.equal(view.showCheckout, true);
});

test("a manifest with no approvalGates / no render is tolerated", () => {
  const view = buildCheckoutEntryView({ runId: "run-1", state: "blocked" });
  assert.equal(view.showCheckout, false);
  assert.equal(view.gateApproved, false);
  assert.equal(view.assetReady, false);
  assert.equal(view.sessionId, null);
});
