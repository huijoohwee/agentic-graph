// Tests for the approval-prompt rendering view-model
// (agentic-graph-acos-mcp-connector spec, task 7.6 / R1.6 + R13.1 / design
// Correctness Property 32 / design Frontend `renderApprovalPrompts`).
//
// Covers:
//   - EXACTLY ONE prompt per PENDING Approval_Gate (only pending; approved /
//     rejected gates raise no prompt)
//   - each prompt shows the gate id + the estimated spend amount (R1.6)
//   - the 2,000 ms render-deadline metadata + past-deadline flag (R13.1)
//   - no pending gates -> empty prompts list (renders gracefully)
//   - a malformed / empty manifest never throws
//
// The ApprovalGate shape MIRRORS the durable Run_Manifest in the design Data
// Models / worker tier (`{ gateId, approvalState, estimatedCostUsd, token }`).
//
// ZERO network / ZERO browser.

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildApprovalPromptView,
  resolveApprovalGates,
  isPendingGate,
  APPROVAL_PROMPT_DEADLINE_MS,
  CANONICAL_GATE_IDS,
} from "../src/lib/approval-prompt-view.js";

// --- Fixtures ---------------------------------------------------------------

/** A single ApprovalGate as the durable Run_Manifest carries it. */
function gate(gateId, approvalState = "pending", estimatedCostUsd = 0) {
  return { gateId, approvalState, estimatedCostUsd, token: null };
}

/**
 * A live-without-approvals Run_Manifest as the Director emits at run initiation:
 * all five spend gates are `pending` with per-gate estimated costs.
 */
function manifestWithGates(gates, overrides = {}) {
  return {
    runId: "run-7-6",
    state: "blocked",
    mode: "live",
    stages: [],
    approvalGates: gates,
    budgetMeters: { estimatedCostUsd: 0, actualCostUsd: 0, providerSpendUsd: 0 },
    demoPack: null,
    failures: [],
    reconciliationFlags: [],
    ...overrides,
  };
}

const allPendingManifest = () =>
  manifestWithGates([
    gate("paid-model-call", "pending", 1.25),
    gate("render-action", "pending", 4.5),
    gate("cloud-deploy", "pending", 0),
    gate("payment-action", "pending", 12.99),
    gate("authenticated-browser", "pending", 0),
  ]);

// --- One prompt per pending gate --------------------------------------------

test("renders exactly one prompt per pending Approval_Gate", () => {
  const view = buildApprovalPromptView(allPendingManifest());
  assert.equal(view.pendingCount, 5);
  assert.equal(view.prompts.length, 5);
  assert.equal(view.hasPending, true);
});

test("only pending gates raise a prompt (approved / rejected do not)", () => {
  const view = buildApprovalPromptView(
    manifestWithGates([
      gate("paid-model-call", "pending", 1.25),
      gate("render-action", "approved", 4.5),
      gate("cloud-deploy", "rejected", 0),
      gate("payment-action", "pending", 12.99),
    ]),
  );
  assert.equal(view.pendingCount, 2);
  assert.equal(view.gateCount, 4);
  assert.deepEqual(
    view.prompts.map((p) => p.gateId),
    ["paid-model-call", "payment-action"],
  );
});

test("prompt count equals the count of pending gates for any mix", () => {
  for (const pending of [0, 1, 2, 3, 4, 5, 6]) {
    const gates = [];
    for (let i = 0; i < pending; i += 1) gates.push(gate(`g-${i}`, "pending", i));
    for (let i = 0; i < 3; i += 1) gates.push(gate(`a-${i}`, "approved", i));
    const view = buildApprovalPromptView(manifestWithGates(gates));
    assert.equal(view.pendingCount, pending);
    assert.equal(view.prompts.length, pending);
  }
});

test("prompts preserve manifest order via the order field", () => {
  const view = buildApprovalPromptView(allPendingManifest());
  view.prompts.forEach((p, i) => assert.equal(p.order, i));
});

test("does NOT dedup colliding pending gate ids (every pending gate renders)", () => {
  const view = buildApprovalPromptView(
    manifestWithGates([
      gate("paid-model-call", "pending", 1),
      gate("paid-model-call", "pending", 2),
      gate("paid-model-call", "pending", 3),
    ]),
  );
  assert.equal(view.pendingCount, 3);
});

// --- Each prompt shows gateId + estimated spend amount (R1.6) ----------------

test("each prompt surfaces the gate id and the estimated spend amount", () => {
  const view = buildApprovalPromptView(allPendingManifest());
  const paid = view.prompts.find((p) => p.gateId === "paid-model-call");
  assert.equal(paid.gateId, "paid-model-call");
  assert.equal(paid.estimatedCostUsd, 1.25);
  assert.equal(paid.estimatedCostDisplay, "$1.25");

  const payment = view.prompts.find((p) => p.gateId === "payment-action");
  assert.equal(payment.estimatedCostUsd, 12.99);
  assert.equal(payment.estimatedCostDisplay, "$12.99");
});

test("a zero estimated cost is shown as $0.00 (not blank/NaN)", () => {
  const view = buildApprovalPromptView(
    manifestWithGates([gate("cloud-deploy", "pending", 0)]),
  );
  assert.equal(view.prompts[0].estimatedCostUsd, 0);
  assert.equal(view.prompts[0].estimatedCostDisplay, "$0.00");
});

test("a missing / malformed estimated cost falls back to $0.00 (never NaN)", () => {
  const view = buildApprovalPromptView(
    manifestWithGates([
      { gateId: "render-action", approvalState: "pending", token: null }, // no cost
      { gateId: "payment-action", approvalState: "pending", estimatedCostUsd: "abc", token: null },
      { gateId: "paid-model-call", approvalState: "pending", estimatedCostUsd: -7, token: null },
    ]),
  );
  for (const p of view.prompts) {
    assert.equal(p.estimatedCostUsd, 0);
    assert.equal(p.estimatedCostDisplay, "$0.00");
    assert.ok(Number.isFinite(p.estimatedCostUsd));
  }
});

test("canonical gate ids are flagged and labelled", () => {
  const view = buildApprovalPromptView(allPendingManifest());
  for (const p of view.prompts) {
    assert.equal(p.isCanonicalGate, CANONICAL_GATE_IDS.includes(p.gateId));
    assert.equal(typeof p.label, "string");
    assert.ok(p.label.length > 0);
  }
});

test("a blank/missing gate id falls back to a stable positional id (no drop)", () => {
  const view = buildApprovalPromptView(
    manifestWithGates([
      { approvalState: "pending", estimatedCostUsd: 1, token: null },
      { gateId: "", approvalState: "pending", estimatedCostUsd: 2, token: null },
    ]),
  );
  assert.equal(view.pendingCount, 2);
  assert.equal(view.prompts[0].gateId, "gate-1");
  assert.equal(view.prompts[1].gateId, "gate-2");
});

// --- 2s render-deadline metadata + past-deadline flag (R13.1) ----------------

test("exposes the 2,000 ms render deadline metadata, within deadline by default", () => {
  const view = buildApprovalPromptView(allPendingManifest());
  assert.equal(view.renderDeadlineMs, APPROVAL_PROMPT_DEADLINE_MS);
  assert.equal(view.renderDeadlineMs, 2000);
  assert.equal(view.renderElapsedMs, 0);
  assert.equal(view.renderWithinDeadline, true);
});

test("an injected elapsed signal at the boundary is still within deadline", () => {
  const view = buildApprovalPromptView(allPendingManifest(), { renderElapsedMs: 2000 });
  assert.equal(view.renderElapsedMs, 2000);
  assert.equal(view.renderWithinDeadline, true);
});

test("an injected elapsed signal past 2,000 ms flips renderWithinDeadline false", () => {
  const view = buildApprovalPromptView(allPendingManifest(), { renderElapsedMs: 2001 });
  assert.equal(view.renderElapsedMs, 2001);
  assert.equal(view.renderWithinDeadline, false);
});

test("a non-finite / negative elapsed signal defaults to 0 (within deadline)", () => {
  for (const bad of [undefined, NaN, Infinity, "x", -10]) {
    const view = buildApprovalPromptView(allPendingManifest(), { renderElapsedMs: bad });
    assert.equal(view.renderElapsedMs, 0);
    assert.equal(view.renderWithinDeadline, true);
  }
});

// --- No pending gates -> empty prompts --------------------------------------

test("no pending gates yields an empty prompts list", () => {
  const view = buildApprovalPromptView(
    manifestWithGates([
      gate("paid-model-call", "approved", 1),
      gate("render-action", "rejected", 2),
    ]),
  );
  assert.equal(view.pendingCount, 0);
  assert.deepEqual(view.prompts, []);
  assert.equal(view.hasPending, false);
  assert.equal(view.gateCount, 2);
});

test("a manifest with no approvalGates renders gracefully (zero prompts)", () => {
  const view = buildApprovalPromptView(manifestWithGates([]));
  assert.equal(view.pendingCount, 0);
  assert.deepEqual(view.prompts, []);
  assert.equal(view.hasPending, false);
});

// --- Envelope unwrapping ----------------------------------------------------

test("accepts a manifest nested under runManifest / manifest", () => {
  const inner = allPendingManifest();
  assert.equal(buildApprovalPromptView({ runManifest: inner }).pendingCount, 5);
  assert.equal(buildApprovalPromptView({ manifest: inner }).pendingCount, 5);
});

test("resolveApprovalGates returns the gate array or empty for malformed input", () => {
  const inner = allPendingManifest();
  assert.equal(resolveApprovalGates(inner).length, 5);
  assert.equal(resolveApprovalGates({ runManifest: inner }).length, 5);
  for (const bad of [null, undefined, 5, "x", [], true, {}]) {
    assert.deepEqual(resolveApprovalGates(bad), []);
  }
});

// --- Malformed input never throws -------------------------------------------

test("malformed manifest input never throws and yields an empty view", () => {
  for (const bad of [null, undefined, 5, "x", [], true, NaN]) {
    const view = buildApprovalPromptView(bad);
    assert.equal(view.pendingCount, 0);
    assert.deepEqual(view.prompts, []);
    assert.equal(view.hasPending, false);
    assert.equal(view.gateCount, 0);
    // Deadline metadata is still present and sane.
    assert.equal(view.renderDeadlineMs, 2000);
    assert.equal(view.renderWithinDeadline, true);
  }
});

test("malformed gate entries are skipped without throwing", () => {
  const view = buildApprovalPromptView(
    manifestWithGates([
      null,
      5,
      "x",
      [],
      { approvalState: "pending", gateId: "render-action", estimatedCostUsd: 3, token: null },
    ]),
  );
  // Only the one well-formed pending gate raises a prompt.
  assert.equal(view.pendingCount, 1);
  assert.equal(view.prompts[0].gateId, "render-action");
});

test("isPendingGate only accepts well-formed pending gates", () => {
  assert.equal(isPendingGate(gate("x", "pending", 1)), true);
  assert.equal(isPendingGate(gate("x", "approved", 1)), false);
  assert.equal(isPendingGate(gate("x", "rejected", 1)), false);
  for (const bad of [null, undefined, 5, "x", [], true, {}]) {
    assert.equal(isPendingGate(bad), false);
  }
});
