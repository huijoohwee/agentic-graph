// Unit tests for Budget_Meters update timing
// (agentic-graph-acos-mcp-connector spec, task 2.11 - R2.5).
//
// R2.5: WHILE Run_State is in-progress, THE Director SHALL update Budget_Meters
//   within 2 seconds of each spend event to reflect cumulative estimated and
//   actual spend.
//
// This is a timing/structural criterion. The design Testing Strategy classifies
// such timing criteria as example/integration, not PBT. In the synchronous
// local runtime "within 2s of each spend event" is satisfied by updating
// Budget_Meters in the SAME synchronous pass as the spend event, so the contract
// is asserted STRUCTURALLY (the cumulative meters equal the sum of the recorded
// spend events, recomputed in the same pass) — mirroring how task 2.10 asserts
// Cost_Log aggregation. No real timer is introduced.
//
// These example-based unit asserts cover:
//   * the pure budget-meters helpers (buildSpendEvents / aggregateSpendEvents /
//     budgetMetersReflectSpendEvents / buildBudgetMetersUpdate);
//   * the Run_Manifest contract: budgetMeters.estimatedCostUsd and
//     budgetMeters.actualCostUsd EQUAL the sum of the recorded spend events;
//   * the same-pass guardrail/validation check holds;
//   * consistency with 2.10 (cumulative estimated == Cost_Log aggregate
//     estimated) and 2.9 (the injectable cumulative-spend signal is a spend
//     event reflected in actual spend);
//   * dry-run / live-without-approvals keep the meters at 0 (R2.6 / R2.3).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runVideoRemix,
  buildSpendEvents,
  aggregateSpendEvents,
  budgetMetersReflectSpendEvents,
  buildBudgetMetersUpdate,
} from "../video-remix-runtime.js";
import { runDirectorWorkflow } from "../director-workflow.js";

const THREE_SOURCE_CARDS = Object.freeze([
  { sourceId: "s1", url: "https://example.com/a", evidenceLevel: "A" },
  { sourceId: "s2", url: "https://example.com/b", evidenceLevel: "B" },
  { sourceId: "s3", url: "https://example.com/c", evidenceLevel: "B" },
]);

const ALL_APPROVALS = Object.freeze([
  { gateId: "paid-model-call", approvalState: "approved", token: "tok-paid" },
  { gateId: "render-action", approvalState: "approved", token: "tok-render" },
  { gateId: "payment-action", approvalState: "approved", token: "tok-pay" },
  { gateId: "cloud-deploy", approvalState: "approved", token: "tok-deploy" },
]);

const LIVE_APPROVED_ARGS = Object.freeze({
  referenceUrl: "https://example.com/reference.mp4",
  brief: "Budget-meters update timing, fully approved live run.",
  mode: "live",
  budgetUsd: 20,
  runId: "budget-meters-approved-001",
  shotCount: 3,
  sourceCards: THREE_SOURCE_CARDS,
  approvals: ALL_APPROVALS,
});

const MODEL_COST_LOGS = Object.freeze([
  { stageId: "research", estimatedCostUsd: 0.02, actualCostUsd: 0.01 },
  { stageId: "storyboard", estimatedCostUsd: 0.01, actualCostUsd: 0.04 },
]);

function sumEstimated(events) {
  return Number(events.reduce((t, e) => t + e.estimatedCostUsd, 0).toFixed(2));
}
function sumActual(events) {
  return Number(events.reduce((t, e) => t + e.actualCostUsd, 0).toFixed(2));
}

// ---------------------------------------------------------------------------
// Pure helpers.
// ---------------------------------------------------------------------------

test("buildSpendEvents: one model_call event per model Cost_Log, carrying both costs", () => {
  const events = buildSpendEvents({ modelCostLogs: MODEL_COST_LOGS });
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((e) => e.kind), ["model_call", "model_call"]);
  assert.deepEqual(events.map((e) => e.stageId), ["research", "storyboard"]);
  for (const event of events) {
    assert.equal(typeof event.estimatedCostUsd, "number");
    assert.equal(typeof event.actualCostUsd, "number");
  }
});

test("buildSpendEvents: render + cumulative spend appended only when non-zero (actual only)", () => {
  const events = buildSpendEvents({
    modelCostLogs: MODEL_COST_LOGS,
    renderProviderSpendUsd: 0.5,
    cumulativeSpendUsd: 1.25,
  });
  const render = events.find((e) => e.kind === "render_provider");
  const cumulative = events.find((e) => e.kind === "cumulative_spend");
  assert.ok(render && render.actualCostUsd === 0.5 && render.estimatedCostUsd === 0);
  assert.ok(cumulative && cumulative.actualCostUsd === 1.25 && cumulative.estimatedCostUsd === 0);

  // Zero-valued render/cumulative contributions are omitted.
  const none = buildSpendEvents({ modelCostLogs: MODEL_COST_LOGS, renderProviderSpendUsd: 0, cumulativeSpendUsd: 0 });
  assert.equal(none.filter((e) => e.kind !== "model_call").length, 0);
});

test("aggregateSpendEvents: cumulative totals equal the sums of the per-event contributions", () => {
  const events = buildSpendEvents({
    modelCostLogs: MODEL_COST_LOGS,
    renderProviderSpendUsd: 0.5,
    cumulativeSpendUsd: 1.25,
  });
  const aggregate = aggregateSpendEvents(events);
  assert.equal(aggregate.estimatedCostUsd, sumEstimated(events));
  assert.equal(aggregate.actualCostUsd, sumActual(events));
  assert.equal(aggregate.estimatedCostUsd, 0.03); // 0.02 + 0.01
  assert.equal(aggregate.actualCostUsd, 1.8); // 0.01 + 0.04 + 0.5 + 1.25
  assert.equal(aggregate.eventCount, events.length);
});

test("budgetMetersReflectSpendEvents: holds for matching meters, rejects a tampered meter", () => {
  const update = buildBudgetMetersUpdate({
    modelCostLogs: MODEL_COST_LOGS,
    renderProviderSpendUsd: 0.5,
    cumulativeSpendUsd: 1.25,
  });
  assert.equal(update.updatedSynchronously, true);
  assert.equal(
    budgetMetersReflectSpendEvents(update.spendEvents, {
      estimatedCostUsd: update.cumulativeEstimatedCostUsd,
      actualCostUsd: update.cumulativeActualCostUsd,
    }),
    true,
  );
  // A meter that does not reflect every spend event fails the structural check.
  assert.equal(
    budgetMetersReflectSpendEvents(update.spendEvents, {
      estimatedCostUsd: update.cumulativeEstimatedCostUsd,
      actualCostUsd: update.cumulativeActualCostUsd + 1,
    }),
    false,
  );
});

// ---------------------------------------------------------------------------
// R2.5 on the Run_Manifest: meters equal the sum of recorded spend events.
// ---------------------------------------------------------------------------

test("R2.5: budgetMeters reflect cumulative estimated/actual spend equal to the spend-event sums", () => {
  const { payload } = runVideoRemix(LIVE_APPROVED_ARGS);
  const { budgetMeters } = payload;

  assert.ok(Array.isArray(budgetMeters.spendEvents), "budgetMeters must expose spendEvents");
  assert.equal(budgetMeters.estimatedCostUsd, sumEstimated(budgetMeters.spendEvents));
  assert.equal(budgetMeters.actualCostUsd, sumActual(budgetMeters.spendEvents));
  assert.equal(budgetMeters.spendEventCount, budgetMeters.spendEvents.length);

  // The same-pass guarantee and the guardrail + validation check all hold.
  assert.equal(budgetMeters.budgetMetersUpdatedSynchronously, true);
  assert.equal(payload.guardrails.budgetMetersUpdatedSynchronously, true);
  const check = payload.validation.checks.find(
    (c) => c.id === "budget_meters_reflect_cumulative_spend_events",
  );
  assert.ok(check && check.ok === true);
});

test("R2.5: cumulative estimated spend equals the 2.10 Cost_Log aggregate estimated (consistency)", () => {
  const { payload } = runVideoRemix(LIVE_APPROVED_ARGS);
  const { budgetMeters } = payload;
  // The model_call spend events ARE the Cost_Log entries, so the cumulative
  // estimated spend equals the Cost_Log aggregate estimated (ties 2.11 to 2.10).
  assert.equal(budgetMeters.estimatedCostUsd, budgetMeters.costLogAggregate.estimatedCostUsd);
});

test("R2.5 + R2.9: an injectable spend signal is a spend event reflected in actual spend", () => {
  const { payload } = runVideoRemix({
    ...LIVE_APPROVED_ARGS,
    runId: "budget-meters-cumulative-001",
    budgetUsd: 100,
    simulatedSpendUsd: 7.5, // a recorded spend event well under the cap
  });
  const { budgetMeters } = payload;
  const cumulativeEvent = budgetMeters.spendEvents.find((e) => e.kind === "cumulative_spend");
  assert.ok(cumulativeEvent, "the injected spend signal is recorded as a spend event");
  assert.equal(cumulativeEvent.actualCostUsd, 7.5);
  // The meter reflects it: actual spend equals the sum of every recorded event.
  assert.equal(budgetMeters.actualCostUsd, sumActual(budgetMeters.spendEvents));
  assert.ok(budgetMeters.actualCostUsd >= 7.5);
  assert.equal(payload.guardrails.budgetMetersUpdatedSynchronously, true);
});

// ---------------------------------------------------------------------------
// Consistency with R2.3 / R2.6: meters stay 0 with no accounted spend.
// ---------------------------------------------------------------------------

test("R2.3 consistency: live run with empty approvals[] reflects zero cumulative spend", () => {
  const { payload } = runVideoRemix({
    ...LIVE_APPROVED_ARGS,
    runId: "budget-meters-noapproval-001",
    approvals: [],
  });
  const { budgetMeters } = payload;
  assert.equal(budgetMeters.estimatedCostUsd, 0);
  assert.equal(budgetMeters.actualCostUsd, 0);
  // The model Cost_Log spend events are still present but all zero.
  assert.equal(sumEstimated(budgetMeters.spendEvents), 0);
  assert.equal(sumActual(budgetMeters.spendEvents), 0);
  assert.equal(budgetMeters.budgetMetersUpdatedSynchronously, true);
});

test("R2.6 consistency: dry-run reflects zero cumulative actual spend", () => {
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/reference.mp4",
    brief: "Budget-meters update timing, dry-run.",
    mode: "dry-run",
    budgetUsd: 20,
    runId: "budget-meters-dryrun-001",
    shotCount: 3,
    sourceCards: THREE_SOURCE_CARDS,
    simulatedSpendUsd: 999, // ignored in dry-run (no spend event recorded)
  });
  const { budgetMeters } = payload;
  assert.equal(budgetMeters.actualCostUsd, 0);
  assert.equal(sumActual(budgetMeters.spendEvents), 0);
  // No render / cumulative spend events are recorded in dry-run.
  assert.equal(budgetMeters.spendEvents.filter((e) => e.kind !== "model_call").length, 0);
  assert.equal(payload.guardrails.budgetMetersUpdatedSynchronously, true);
});

// ---------------------------------------------------------------------------
// The contract flows through the Director workflow wrapper unchanged.
// ---------------------------------------------------------------------------

test("R2.5 holds through the Director workflow wrapper", () => {
  const { payload } = runDirectorWorkflow(LIVE_APPROVED_ARGS);
  const { budgetMeters } = payload;
  assert.equal(budgetMeters.estimatedCostUsd, sumEstimated(budgetMeters.spendEvents));
  assert.equal(budgetMeters.actualCostUsd, sumActual(budgetMeters.spendEvents));
  assert.equal(payload.guardrails.budgetMetersUpdatedSynchronously, true);
});
