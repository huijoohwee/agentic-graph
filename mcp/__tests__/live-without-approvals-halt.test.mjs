// Unit tests for the live-without-approvals halt path
// (agenticgraph-acos-mcp-connector spec, task 2.3 - R2.3 / Property 2).
//
// R2.3: WHEN the solo founder calls `agenticgraph.video_remix.run` in Live_Mode
// with an empty `approvals[]` array, THE Director SHALL halt at the first
// spend boundary, return Run_State `blocked`, emit at least 5 Approval_Gate
// entries, set `budgetMeters.estimatedCostUsd` to exactly 0, and record
// exactly 0 paid-provider calls.
//
// Property 2: For any valid `agenticgraph.video_remix.run` input invoked in
// Live_Mode with an empty `approvals[]` array, the resulting Run_Manifest has
// Run_State `blocked`, at least 5 Approval_Gate entries,
// `budgetMeters.estimatedCostUsd` exactly 0, and exactly 0 paid-provider calls
// recorded.
//
// This is the implementation seam for Property 2; the consolidated
// property-based test lands in task 9.1. These are example-based unit asserts
// of the four R2.3 conditions plus the contrasting approved/dry-run cases that
// keep the paid-provider-call counter honest (it is derived from approved
// spend boundaries, not hard-coded to 0).

import { test } from "node:test";
import assert from "node:assert/strict";

import { runVideoRemix } from "../video-remix-runtime.js";
import { runDirectorWorkflow } from "../director-workflow.js";

const LIVE_NO_APPROVALS_ARGS = Object.freeze({
  referenceUrl: "https://example.com/reference.mp4",
  brief: "Remix the reference into a sellable launch teaser.",
  mode: "live",
  budgetUsd: 20,
  runId: "live-without-approvals-001",
  shotCount: 4,
  approvals: [], // empty approvals -> halt at the first spend boundary
  // Even if a caller pre-supplies source cards, an unapproved paid-model-call
  // gate means research never runs, so they must be ignored (no spend).
  sourceCards: [
    { sourceId: "s1", url: "https://example.com/a", evidenceLevel: "A" },
    { sourceId: "s2", url: "https://example.com/b", evidenceLevel: "B" },
    { sourceId: "s3", url: "https://example.com/c", evidenceLevel: "B" },
  ],
});

// ---------------------------------------------------------------------------
// The four R2.3 conditions, asserted directly on the Run_Manifest.
// ---------------------------------------------------------------------------

test("R2.3: live run with empty approvals[] -> Run_State exactly `blocked`", () => {
  const { payload } = runVideoRemix(LIVE_NO_APPROVALS_ARGS);
  assert.equal(payload.mode, "live");
  assert.equal(payload.state, "blocked");
});

test("R2.3: live run with empty approvals[] emits >= 5 Approval_Gate entries", () => {
  const { payload } = runVideoRemix(LIVE_NO_APPROVALS_ARGS);
  assert.ok(Array.isArray(payload.approvalGates));
  assert.ok(
    payload.approvalGates.length >= 5,
    `expected >= 5 approval gates, got ${payload.approvalGates.length}`,
  );
  // None of them are approved in the empty-approvals case.
  for (const gate of payload.approvalGates) {
    assert.notEqual(gate.approvalState, "approved", `${gate.id} must not be approved`);
  }
});

test("R2.3: live run with empty approvals[] -> budgetMeters.estimatedCostUsd === 0", () => {
  const { payload } = runVideoRemix(LIVE_NO_APPROVALS_ARGS);
  assert.equal(payload.budgetMeters.estimatedCostUsd, 0);
});

test("R2.3: live run with empty approvals[] records exactly 0 paid-provider calls", () => {
  const { payload } = runVideoRemix(LIVE_NO_APPROVALS_ARGS);
  assert.equal(typeof payload.budgetMeters.paidProviderCalls, "number");
  assert.equal(payload.budgetMeters.paidProviderCalls, 0);
  assert.equal(payload.budgetMeters.providerSpendCents, 0);
});

test("R2.3: all four conditions hold together and the validation check passes", () => {
  const { payload } = runVideoRemix(LIVE_NO_APPROVALS_ARGS);
  assert.equal(payload.state, "blocked");
  assert.ok(payload.approvalGates.length >= 5);
  assert.equal(payload.budgetMeters.estimatedCostUsd, 0);
  assert.equal(payload.budgetMeters.paidProviderCalls, 0);

  const check = payload.validation.checks.find(
    (c) => c.id === "live_without_approvals_halts_with_zero_spend",
  );
  assert.ok(check, "validation check present");
  assert.equal(check.ok, true);

  const noPaidCalls = payload.validation.checks.find(
    (c) => c.id === "no_paid_provider_calls_without_approval",
  );
  assert.ok(noPaidCalls && noPaidCalls.ok === true);
});

test("R2.3: the same halt guarantees hold through the Director workflow wrapper", () => {
  const { payload } = runDirectorWorkflow(LIVE_NO_APPROVALS_ARGS);
  assert.equal(payload.state, "blocked");
  assert.ok(payload.approvalGates.length >= 5);
  assert.equal(payload.budgetMeters.estimatedCostUsd, 0);
  assert.equal(payload.budgetMeters.paidProviderCalls, 0);
});

// ---------------------------------------------------------------------------
// Counter honesty: the paid-provider-call count is derived from approved spend
// boundaries, so it must move to a non-zero value once approvals authorize
// spend, and stay 0 in dry-run. This guards against a hard-coded-0 regression.
// ---------------------------------------------------------------------------

test("dry-run records exactly 0 paid-provider calls (R2.6 contrast)", () => {
  const { payload } = runVideoRemix({
    ...LIVE_NO_APPROVALS_ARGS,
    mode: "dry-run",
    runId: "dry-run-counter-001",
  });
  assert.equal(payload.budgetMeters.paidProviderCalls, 0);
});

test("a fully-approved complete live run records > 0 paid-provider calls (counter is real)", () => {
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/reference.mp4",
    brief: "Fully approved live run.",
    mode: "live",
    budgetUsd: 20,
    runId: "live-approved-counter-001",
    shotCount: 3,
    approvals: ["paid-model-call", "render-action", "payment-action", "cloud-deploy"],
    sourceCards: [
      { sourceId: "s1", url: "https://example.com/a", evidenceLevel: "A" },
      { sourceId: "s2", url: "https://example.com/b", evidenceLevel: "B" },
      { sourceId: "s3", url: "https://example.com/c", evidenceLevel: "B" },
    ],
  });
  assert.equal(payload.state, "complete");
  assert.ok(
    payload.budgetMeters.paidProviderCalls > 0,
    `expected > 0 paid-provider calls for a complete approved run, got ${payload.budgetMeters.paidProviderCalls}`,
  );
});
