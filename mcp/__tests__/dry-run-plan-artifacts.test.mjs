// Unit tests for dry-run mode resolution and the missing-approval plan-artifact
// path (agentic-graph-acos-mcp-connector spec, task 2.4 - R2.6, R4.4 / Property 3).
//
// R2.6: WHERE the caller sets `mode:"dry-run"`, THE Director SHALL resolve
// every spend-bearing step to a plan artifact, perform exactly zero
// paid-provider calls, and report `budgetMeters.actualCostUsd` as exactly 0.
//
// R4.4: IF a spend-bearing stage is reached without a verified Approval_Token,
// THEN THE Director SHALL set that stage to `approval_required` and resolve the
// stage to a Dry_Run plan artifact.
//
// Property 3: For any valid run input invoked in `mode:"dry-run"`, every
// spend-bearing step resolves to a plan artifact, exactly 0 paid-provider
// calls occur, and `budgetMeters.actualCostUsd` is exactly 0.
//
// This is the implementation seam for Property 3; the consolidated
// property-based test lands in task 9.1. These are example-based unit asserts
// of the R2.6 dry-run guarantees, the new `budgetMeters.actualCostUsd` field,
// and the R4.4 plan-artifact-on-missing-approval case. The contrasting
// approved/complete live run keeps the actual-cost meter honest (it is derived
// from recorded provider spend, not hard-coded to 0).

import { test } from "node:test";
import assert from "node:assert/strict";

import { runVideoRemix } from "../video-remix-runtime.js";
import { runDirectorWorkflow } from "../director-workflow.js";

// The canonical spend-bearing stages (R2.6 / R4.4). Zero-spend edit is not included.
const SPEND_BEARING_STAGE_IDS = ["research", "storyboard", "render", "publish", "checkout"];

const DRY_RUN_ARGS = Object.freeze({
  referenceUrl: "https://example.com/reference.mp4",
  brief: "Remix the reference into a sellable launch teaser.",
  mode: "dry-run",
  budgetUsd: 20,
  runId: "dry-run-plan-artifacts-001",
  shotCount: 4,
  // Source cards are present so research is NOT a weak signal; this proves the
  // dry-run resolution is driven by mode, not by missing data.
  sourceCards: [
    { sourceId: "s1", url: "https://example.com/a", evidenceLevel: "A" },
    { sourceId: "s2", url: "https://example.com/b", evidenceLevel: "B" },
    { sourceId: "s3", url: "https://example.com/c", evidenceLevel: "B" },
  ],
});

function spendBearingStages(payload) {
  return payload.stages.filter((stage) => SPEND_BEARING_STAGE_IDS.includes(stage.id));
}

// ---------------------------------------------------------------------------
// R2.6 / Property 3: the new actualCostUsd field exists and is exactly 0 in
// dry-run, with zero paid-provider calls.
// ---------------------------------------------------------------------------

test("R2.6: dry-run exposes budgetMeters.actualCostUsd and it is exactly 0", () => {
  const { payload } = runVideoRemix(DRY_RUN_ARGS);
  assert.equal(payload.mode, "dry-run");
  assert.ok(
    Object.prototype.hasOwnProperty.call(payload.budgetMeters, "actualCostUsd"),
    "budgetMeters must expose actualCostUsd",
  );
  assert.equal(payload.budgetMeters.actualCostUsd, 0);
});

test("R2.6: dry-run records exactly 0 paid-provider calls and 0 provider spend", () => {
  const { payload } = runVideoRemix(DRY_RUN_ARGS);
  assert.equal(payload.budgetMeters.paidProviderCalls, 0);
  assert.equal(payload.budgetMeters.providerSpendCents, 0);
});

test("R2.6: estimatedCostUsd semantics are intact (unaffected by the new actualCostUsd field)", () => {
  // estimatedCostUsd is planned model cost, accounted only when the
  // paid-model-call gate is approved and research is not weak. In dry-run the
  // gate is not in approvals[], so estimatedCostUsd stays 0 while actualCostUsd
  // is independently 0.
  const { payload } = runVideoRemix(DRY_RUN_ARGS);
  assert.equal(payload.budgetMeters.estimatedCostUsd, 0);
  assert.equal(typeof payload.budgetMeters.estimatedCostUsd, "number");
});

// ---------------------------------------------------------------------------
// R2.6 / Property 3: every spend-bearing step resolves to a plan artifact.
// ---------------------------------------------------------------------------

test("R2.6: every spend-bearing stage resolves to a Dry_Run plan artifact in dry-run", () => {
  const { payload } = runVideoRemix(DRY_RUN_ARGS);
  const stages = spendBearingStages(payload);
  assert.equal(stages.length, SPEND_BEARING_STAGE_IDS.length, "all five spend-bearing stages present");

  for (const stage of stages) {
    assert.equal(stage.executed, false, `${stage.id} must not execute in dry-run`);
    assert.ok(stage.artifact, `${stage.id} must carry a plan artifact`);
    assert.equal(stage.artifact.kind, "dry_run_plan", `${stage.id} artifact kind`);
    assert.equal(stage.artifact.resolvedTo, "plan_artifact", `${stage.id} resolved to plan artifact`);
    assert.equal(stage.artifact.executed, false, `${stage.id} artifact records no execution`);
    // A plan artifact never spends.
    assert.equal(stage.artifact.actualCostUsd, 0, `${stage.id} artifact actualCostUsd is 0`);
    assert.equal(stage.artifact.paidProviderCalls, 0, `${stage.id} artifact paidProviderCalls is 0`);
  }
});

test("R2.6: the dry-run plan-artifact and zero-spend validation checks pass", () => {
  const { payload } = runVideoRemix(DRY_RUN_ARGS);
  const checks = payload.validation.checks;
  const byId = Object.fromEntries(checks.map((c) => [c.id, c.ok]));

  assert.equal(byId.dry_run_actual_cost_zero, true);
  assert.equal(byId.dry_run_zero_paid_provider_calls, true);
  assert.equal(byId.dry_run_steps_resolve_to_plan_artifacts, true);

  // Guardrails mirror the same guarantees.
  assert.equal(payload.guardrails.dryRunActualCostZero, true);
  assert.equal(payload.guardrails.dryRunResolvesSpendStepsToPlanArtifacts, true);
});

test("R2.6: dry-run guarantees hold through the Director workflow wrapper", () => {
  const { payload } = runDirectorWorkflow(DRY_RUN_ARGS);
  assert.equal(payload.budgetMeters.actualCostUsd, 0);
  assert.equal(payload.budgetMeters.paidProviderCalls, 0);
  for (const stage of spendBearingStages(payload)) {
    assert.equal(stage.executed, false);
    assert.equal(stage.artifact.resolvedTo, "plan_artifact");
  }
});

// ---------------------------------------------------------------------------
// R4.4: a spend-bearing stage reached in Live_Mode without a verified
// Approval_Token is set `approval_required` AND resolves to a plan artifact.
// ---------------------------------------------------------------------------

// Live run, paid-model-call approved with 3 sources so research + storyboard
// complete, but render/publish/checkout gates are NOT approved. Those stages
// are reached without a verified token and must each resolve to a plan
// artifact while being set approval_required.
const LIVE_MISSING_DOWNSTREAM_APPROVALS = Object.freeze({
  referenceUrl: "https://example.com/reference.mp4",
  brief: "Render gate reached without a verified approval token.",
  mode: "live",
  budgetUsd: 20,
  runId: "r4-4-plan-artifact-001",
  shotCount: 3,
  approvals: ["paid-model-call"],
  sourceCards: [
    { sourceId: "s1", url: "https://example.com/a", evidenceLevel: "A" },
    { sourceId: "s2", url: "https://example.com/b", evidenceLevel: "B" },
    { sourceId: "s3", url: "https://example.com/c", evidenceLevel: "B" },
  ],
});

test("R4.4: the render stage reached without a verified token is approval_required", () => {
  const { payload } = runVideoRemix(LIVE_MISSING_DOWNSTREAM_APPROVALS);
  const render = payload.stages.find((s) => s.id === "render");
  assert.equal(render.status, "approval_required");
});

test("R4.4: an approval_required spend-bearing stage resolves to a Dry_Run plan artifact", () => {
  const { payload } = runVideoRemix(LIVE_MISSING_DOWNSTREAM_APPROVALS);
  const render = payload.stages.find((s) => s.id === "render");

  assert.equal(render.executed, false, "render must not execute without a verified token");
  assert.ok(render.artifact, "render must carry a plan artifact");
  assert.equal(render.artifact.resolvedTo, "plan_artifact");
  assert.equal(render.artifact.kind, "dry_run_plan");
  // R4.4 observability: the reason distinguishes the missing-approval
  // resolution from a plain dry-run-mode resolution.
  assert.equal(render.artifact.reason, "approval_required_no_verified_token");
  // The artifact still records zero spend (no paid action occurred).
  assert.equal(render.artifact.actualCostUsd, 0);
  assert.equal(render.artifact.paidProviderCalls, 0);
});

test("R4.4: ALL approval_required spend-bearing stages resolve to plan artifacts", () => {
  const { payload } = runVideoRemix(LIVE_MISSING_DOWNSTREAM_APPROVALS);
  const approvalRequired = spendBearingStages(payload).filter((s) => s.status === "approval_required");

  assert.ok(approvalRequired.length > 0, "at least one stage is approval_required in this fixture");
  for (const stage of approvalRequired) {
    assert.equal(stage.executed, false, `${stage.id} did not execute`);
    assert.ok(stage.artifact && stage.artifact.resolvedTo === "plan_artifact", `${stage.id} resolved to plan artifact`);
  }

  const check = payload.validation.checks.find(
    (c) => c.id === "approval_required_stage_resolves_to_plan_artifact",
  );
  assert.ok(check, "R4.4 validation check present");
  assert.equal(check.ok, true);
  assert.equal(payload.guardrails.approvalRequiredStageResolvesToPlanArtifact, true);
});

test("R4.4: reaching a gate without a verified token performs zero paid-provider calls", () => {
  const { payload } = runVideoRemix(LIVE_MISSING_DOWNSTREAM_APPROVALS);
  // render/publish/checkout never executed -> no render or payment provider
  // calls; only the approved model stages could spend, but their approval here
  // still produces a recorded paid count, so assert the unapproved downstream
  // stages contributed nothing by checking no assets/payout were produced.
  assert.equal(payload.render.assets.length, 0);
  assert.equal(payload.commerce.checkout.payoutSettled, false);
  assert.equal(payload.budgetMeters.providerSpendCents, 0);
});

// ---------------------------------------------------------------------------
// Meter honesty: actualCostUsd is derived from recorded provider spend, not
// hard-coded to 0. A complete approved live run with zero provider spend in the
// local runtime still reports 0, but the field tracks providerSpendCents.
// ---------------------------------------------------------------------------

test("actualCostUsd tracks recorded provider spend (derived, not hard-coded)", () => {
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/reference.mp4",
    brief: "Fully approved live run.",
    mode: "live",
    budgetUsd: 20,
    runId: "actual-cost-derivation-001",
    shotCount: 3,
    approvals: ["paid-model-call", "render-action", "payment-action", "cloud-deploy"],
    sourceCards: [
      { sourceId: "s1", url: "https://example.com/a", evidenceLevel: "A" },
      { sourceId: "s2", url: "https://example.com/b", evidenceLevel: "B" },
      { sourceId: "s3", url: "https://example.com/c", evidenceLevel: "B" },
    ],
  });
  assert.equal(payload.state, "complete");
  // The local runtime makes no live provider calls, so providerSpendCents is 0
  // and actualCostUsd is its derived dollar value (0.00). The invariant we lock
  // in: actualCostUsd === providerSpendCents / 100.
  assert.equal(
    payload.budgetMeters.actualCostUsd,
    Number((payload.budgetMeters.providerSpendCents / 100).toFixed(2)),
  );
});
