// Unit tests for budget-cap enforcement
// (agenticgraph-acos-mcp-connector spec, task 2.9 - R4.6 / Property 9).
//
// R4.6: WHEN Budget_Meters reach or exceed the configured budget cap mid-run,
//   THE Director SHALL record `budget_exceeded`, halt all further spend-bearing
//   stages, and surface a budget-exceeded indication to the operator.
//
// Property 9: For any run in which cumulative Budget_Meters spend reaches or
//   exceeds the configured budget cap mid-run, the Director records
//   `budget_exceeded`, halts all further spend-bearing stages, and surfaces a
//   budget-exceeded indication.
//
// This is the implementation seam for Property 9; the consolidated
// property-based test lands in task 9.1. These are example-based unit asserts
// of the DETERMINISTIC, timer-free model:
//   * cumulative spend is driven by an injectable `simulatedSpendUsd` signal, so
//     a run can reach/exceed the cap WITHOUT any real provider call;
//   * reaching/exceeding the cap sets Run_State `budget_exceeded` (its own
//     terminal state, distinct from the `blocked` causes);
//   * all further spend-bearing stages are halted (no render/payment provider
//     calls; downstream render/publish/checkout stages are `budget_held`);
//   * an operator-facing indication is surfaced on Budget_Meters
//     (`budgetExceeded` + a message);
//   * the converse (under cap) leaves the run un-exceeded.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runVideoRemix,
  budgetCapExceeded,
  normalizeCumulativeSpendUsd,
} from "../video-remix-runtime.js";

// Three source cards so research is not a weak signal — lets the tests
// attribute the halt to the budget cap (R4.6) rather than the weak-signal
// halt (R4.5).
const THREE_SOURCE_CARDS = Object.freeze([
  { url: "https://example.com/a", sourceId: "source-1" },
  { url: "https://example.com/b", sourceId: "source-2" },
  { url: "https://example.com/c", sourceId: "source-3" },
]);

// All spend-gate approvals — without the cap this run would reach `complete`,
// so a `budget_exceeded` result is attributable to the cap alone.
const ALL_APPROVALS = Object.freeze([
  { gateId: "paid-model-call", approvalState: "approved", token: "tok-paid" },
  { gateId: "render-action", approvalState: "approved", token: "tok-render" },
  { gateId: "payment-action", approvalState: "approved", token: "tok-pay" },
  { gateId: "cloud-deploy", approvalState: "approved", token: "tok-deploy" },
]);

const LIVE_BASE_ARGS = Object.freeze({
  referenceUrl: "https://example.com/reference.mp4",
  brief: "Budget-cap enforcement.",
  mode: "live",
  runId: "budget-cap-001",
  sourceCards: THREE_SOURCE_CARDS,
  approvals: ALL_APPROVALS,
});

// ---------------------------------------------------------------------------
// Pure helpers: budgetCapExceeded / normalizeCumulativeSpendUsd.
// ---------------------------------------------------------------------------

test("budgetCapExceeded: cumulative spend >= positive cap trips, < cap does not", () => {
  assert.equal(budgetCapExceeded(10, 10), true); // reaches the cap (>=)
  assert.equal(budgetCapExceeded(10.01, 10), true); // exceeds the cap
  assert.equal(budgetCapExceeded(9.99, 10), false); // under the cap
  assert.equal(budgetCapExceeded(0, 10), false); // no spend
});

test("budgetCapExceeded: an unconfigured / non-positive cap can never be exceeded", () => {
  // Guards a 0-spend run with an omitted budget (normalized to 0) from a false
  // `0 >= 0` trip.
  assert.equal(budgetCapExceeded(0, 0), false);
  assert.equal(budgetCapExceeded(5, 0), false);
  assert.equal(budgetCapExceeded(5, -1), false);
});

test("normalizeCumulativeSpendUsd: non-negative, rounded to cents, with fallback", () => {
  assert.equal(normalizeCumulativeSpendUsd(1.239), 1.24);
  assert.equal(normalizeCumulativeSpendUsd(-3), 0);
  assert.equal(normalizeCumulativeSpendUsd("not-a-number"), 0);
  assert.equal(normalizeCumulativeSpendUsd(undefined, 2.5), 2.5);
});

// ---------------------------------------------------------------------------
// Integration: cumulative spend >= cap -> budget_exceeded + halt + indication.
// ---------------------------------------------------------------------------

test("R4.6: cumulative spend reaching the cap sets Run_State budget_exceeded", () => {
  const { payload } = runVideoRemix({
    ...LIVE_BASE_ARGS,
    budgetUsd: 10,
    simulatedSpendUsd: 10, // exactly reaches the cap (>=)
  });
  assert.equal(payload.state, "budget_exceeded");
});

test("R4.6: cumulative spend exceeding the cap sets Run_State budget_exceeded", () => {
  const { payload } = runVideoRemix({
    ...LIVE_BASE_ARGS,
    budgetUsd: 10,
    simulatedSpendUsd: 25, // exceeds the cap
  });
  assert.equal(payload.state, "budget_exceeded");
});

test("R4.6: budget_exceeded halts all further spend-bearing stages", () => {
  const { payload } = runVideoRemix({
    ...LIVE_BASE_ARGS,
    budgetUsd: 10,
    simulatedSpendUsd: 12,
  });

  // No assets, no published URLs, no checkout session — nothing downstream
  // executed (R4.6 "halt all further spend-bearing stages").
  assert.equal(payload.render.assets.length, 0);
  assert.deepEqual(payload.commerce.publish.publishedUrls, []);
  assert.equal(payload.commerce.checkout.sessionId, "");
  assert.equal(payload.commerce.checkout.payoutSettled, false);

  // The downstream render/publish/checkout stages are HELD by the cap.
  const held = payload.stages.filter((s) => ["render", "publish", "checkout"].includes(s.id));
  assert.equal(held.length, 3);
  for (const stage of held) {
    assert.equal(stage.status, "budget_held");
    assert.equal(stage.executed, false);
    assert.equal(stage.artifact.reason, "budget_exceeded_halted");
  }

  // No render or payment provider calls were made.
  assert.equal(payload.render.assets.length, 0);
});

test("R4.6: a budget-exceeded indication is surfaced to the operator on Budget_Meters", () => {
  const { payload, text } = runVideoRemix({
    ...LIVE_BASE_ARGS,
    budgetUsd: 10,
    simulatedSpendUsd: 12.5,
  });

  assert.equal(payload.budgetMeters.budgetExceeded, true);
  assert.equal(payload.budgetMeters.cumulativeSpendUsd, 12.5);
  assert.ok(
    typeof payload.budgetMeters.budgetExceededMessage === "string" &&
      payload.budgetMeters.budgetExceededMessage.length > 0,
  );
  // Budget_Meters literally "reach or exceed" the cap (R4.6): actual cost >= cap.
  assert.ok(payload.budgetMeters.actualCostUsd >= payload.budgetMeters.budgetUsd);
  // The operator-facing text surfaces the indication too.
  assert.match(text, /Budget exceeded:/);

  // The validation check and guardrail hold.
  const check = payload.validation.checks.find(
    (c) => c.id === "budget_cap_halts_spend_bearing_stages",
  );
  assert.ok(check && check.ok === true);
  assert.equal(payload.guardrails.budgetCapHaltsSpendBearingStages, true);
  // The terminal state is still a valid Run_Manifest.
  assert.equal(payload.validation.ok, true);
});

// ---------------------------------------------------------------------------
// Converse: under the cap -> not budget_exceeded.
// ---------------------------------------------------------------------------

test("R4.6 (converse): cumulative spend under the cap does not set budget_exceeded", () => {
  const { payload } = runVideoRemix({
    ...LIVE_BASE_ARGS,
    budgetUsd: 100,
    simulatedSpendUsd: 5, // well under the cap
  });
  assert.notEqual(payload.state, "budget_exceeded");
  assert.equal(payload.budgetMeters.budgetExceeded, false);
  assert.equal(payload.budgetMeters.budgetExceededMessage, null);
  // With all approvals and sufficient sources, an under-cap live run completes.
  assert.equal(payload.state, "complete");
  // The guardrail/check hold vacuously when the cap was not exceeded.
  const check = payload.validation.checks.find(
    (c) => c.id === "budget_cap_halts_spend_bearing_stages",
  );
  assert.ok(check && check.ok === true);
  assert.equal(payload.guardrails.budgetCapHaltsSpendBearingStages, true);
});

test("R4.6 (converse): dry-run never trips the cap and reports zero actual cost", () => {
  // Dry-run performs zero paid actions (Property 3): even with an injected
  // spend signal the cap is not enforced and actualCostUsd stays exactly 0.
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/reference.mp4",
    brief: "Budget-cap enforcement, dry-run.",
    mode: "dry-run",
    runId: "budget-cap-dryrun-001",
    sourceCards: THREE_SOURCE_CARDS,
    budgetUsd: 10,
    simulatedSpendUsd: 50,
  });
  assert.notEqual(payload.state, "budget_exceeded");
  assert.equal(payload.budgetMeters.budgetExceeded, false);
  assert.equal(payload.budgetMeters.actualCostUsd, 0);
});

test("R4.6 (converse): an omitted budget cap is never exceeded", () => {
  const { payload } = runVideoRemix({
    ...LIVE_BASE_ARGS,
    // budgetUsd omitted -> normalized to 0 -> cap inert
    simulatedSpendUsd: 999,
  });
  assert.notEqual(payload.state, "budget_exceeded");
  assert.equal(payload.budgetMeters.budgetExceeded, false);
});
