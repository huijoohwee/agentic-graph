// Unit tests for Cost_Log aggregation
// (agentic-graph-acos-mcp-connector spec, task 2.10 - R2.4, R10.3 / Property 20).
//
// R2.4:  THE Director SHALL record exactly one Cost_Log entry per model-bearing
//   stage in the Run_Manifest, each entry containing the stage id, the estimated
//   cost in USD, and the actual cost in USD.
// R10.3: WHEN a Cost_Log is emitted, THE Director SHALL aggregate the entry into
//   the Run_Manifest Budget_Meters within 1 second of emission.
//
// Property 20: For any set of emitted Cost_Logs in a run, the Director
//   aggregates them into Budget_Meters such that the aggregated estimated/actual
//   costs equal the sums of the corresponding Cost_Log fields, and each
//   model-bearing stage has exactly one Cost_Log entry carrying its stage id,
//   estimated cost, and actual cost.
//
// This is the implementation seam for Property 20; the consolidated
// property-based test lands in task 9.1. These are example-based unit asserts:
//   * exactly ONE Cost_Log entry per model-bearing stage (research + storyboard),
//     each carrying the three required fields { stageId, estimatedCostUsd,
//     actualCostUsd };
//   * the per-stage entry is attached to its Stage (`Stage.costLog`);
//   * the Budget_Meters aggregate EQUALS the sums of the per-stage entries
//     (aggregation correctness — Property 20);
//   * `estimatedCostUsd` is derived from the aggregate and preserves the prior
//     planned-model-cost semantics (0 when unapproved / weak-signal / dry-run);
//   * the timing contract ("within 1s of emission") is asserted STRUCTURALLY:
//     the aggregation is computed in the same synchronous pass, so the
//     guardrail/validation check recomputes the aggregate and it matches.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runVideoRemix,
  buildModelStageCostLogs,
  aggregateCostLogs,
  costLogAggregationHolds,
  MODEL_BEARING_STAGE_IDS,
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
  brief: "Cost-log aggregation, fully approved live run.",
  mode: "live",
  budgetUsd: 20,
  runId: "cost-log-approved-001",
  shotCount: 3,
  sourceCards: THREE_SOURCE_CARDS,
  approvals: ALL_APPROVALS,
});

const MODEL_STAGE_IDS = ["research", "storyboard"];

// ---------------------------------------------------------------------------
// Pure helpers: buildModelStageCostLogs / aggregateCostLogs / holds.
// ---------------------------------------------------------------------------

test("buildModelStageCostLogs: exactly one entry per model-bearing stage with three fields", () => {
  const logs = buildModelStageCostLogs({ plannedEstimateUsd: 0.03, actualCostUsd: 0 });
  assert.equal(logs.length, MODEL_BEARING_STAGE_IDS.length);
  assert.deepEqual(
    logs.map((l) => l.stageId),
    MODEL_STAGE_IDS,
  );
  for (const entry of logs) {
    assert.ok(Object.prototype.hasOwnProperty.call(entry, "stageId"));
    assert.ok(Object.prototype.hasOwnProperty.call(entry, "estimatedCostUsd"));
    assert.ok(Object.prototype.hasOwnProperty.call(entry, "actualCostUsd"));
    assert.equal(typeof entry.estimatedCostUsd, "number");
    assert.equal(typeof entry.actualCostUsd, "number");
  }
});

test("aggregateCostLogs: aggregate equals the sums of the per-stage entries", () => {
  const logs = buildModelStageCostLogs({ plannedEstimateUsd: 0.03, actualCostUsd: 0.05 });
  const aggregate = aggregateCostLogs(logs);
  const sumEstimated = logs.reduce((t, l) => t + l.estimatedCostUsd, 0);
  const sumActual = logs.reduce((t, l) => t + l.actualCostUsd, 0);
  assert.equal(aggregate.estimatedCostUsd, Number(sumEstimated.toFixed(2)));
  assert.equal(aggregate.actualCostUsd, Number(sumActual.toFixed(2)));
  assert.equal(aggregate.entryCount, logs.length);
  // The split sums back to the input totals EXACTLY (no cent lost/created).
  assert.equal(aggregate.estimatedCostUsd, 0.03);
  assert.equal(aggregate.actualCostUsd, 0.05);
  assert.equal(costLogAggregationHolds(logs, aggregate), true);
});

test("costLogAggregationHolds: rejects a missing, duplicate, or tampered stage ledger", () => {
  const logs = buildModelStageCostLogs({ plannedEstimateUsd: 0.03 });
  const aggregate = aggregateCostLogs(logs);
  // Missing a stage (only one entry).
  assert.equal(costLogAggregationHolds([logs[0]], aggregate), false);
  // Duplicate stage.
  assert.equal(costLogAggregationHolds([logs[0], logs[0]], aggregateCostLogs([logs[0], logs[0]])), false);
  // Tampered aggregate no longer equals the sums.
  assert.equal(costLogAggregationHolds(logs, { ...aggregate, estimatedCostUsd: aggregate.estimatedCostUsd + 1 }), false);
});

// ---------------------------------------------------------------------------
// R2.4: exactly one Cost_Log per model-bearing stage on the Run_Manifest.
// ---------------------------------------------------------------------------

test("R2.4: the Run_Manifest carries exactly one Cost_Log per model-bearing stage", () => {
  const { payload } = runVideoRemix(LIVE_APPROVED_ARGS);
  assert.ok(Array.isArray(payload.costLogs));
  assert.equal(payload.costLogs.length, 2);
  assert.deepEqual(
    payload.costLogs.map((l) => l.stageId).sort(),
    [...MODEL_STAGE_IDS].sort(),
  );
  for (const entry of payload.costLogs) {
    assert.equal(typeof entry.stageId, "string");
    assert.equal(typeof entry.estimatedCostUsd, "number");
    assert.equal(typeof entry.actualCostUsd, "number");
  }
});

test("R2.4: each model-bearing Stage carries its single Cost_Log entry", () => {
  const { payload } = runVideoRemix(LIVE_APPROVED_ARGS);
  for (const stageId of MODEL_STAGE_IDS) {
    const stage = payload.stages.find((s) => s.id === stageId);
    assert.ok(stage, `${stageId} stage must exist`);
    assert.ok(stage.costLog, `${stageId} must carry a costLog`);
    assert.equal(stage.costLog.stageId, stageId);
    assert.equal(typeof stage.costLog.estimatedCostUsd, "number");
    assert.equal(typeof stage.costLog.actualCostUsd, "number");
  }
  // The render/publish/checkout stages are NOT model-bearing -> no costLog.
  for (const stageId of ["render", "publish", "checkout"]) {
    const stage = payload.stages.find((s) => s.id === stageId);
    assert.equal(stage.costLog, undefined, `${stageId} must not carry a costLog`);
  }
});

// ---------------------------------------------------------------------------
// R10.3 / Property 20: Budget_Meters aggregate equals the per-stage sums.
// ---------------------------------------------------------------------------

test("Property 20: budgetMeters aggregate equals the sums of the per-stage Cost_Logs", () => {
  const { payload } = runVideoRemix(LIVE_APPROVED_ARGS);
  const { costLogs, budgetMeters } = payload;

  const sumEstimated = Number(costLogs.reduce((t, l) => t + l.estimatedCostUsd, 0).toFixed(2));
  const sumActual = Number(costLogs.reduce((t, l) => t + l.actualCostUsd, 0).toFixed(2));

  assert.ok(budgetMeters.costLogAggregate, "budgetMeters must expose costLogAggregate");
  assert.equal(budgetMeters.costLogAggregate.estimatedCostUsd, sumEstimated);
  assert.equal(budgetMeters.costLogAggregate.actualCostUsd, sumActual);
  assert.equal(budgetMeters.costLogAggregate.entryCount, 2);

  // estimatedCostUsd is derived from the aggregate (the planned model estimate),
  // so the meter is provably the sum of the per-stage entries.
  assert.equal(budgetMeters.estimatedCostUsd, sumEstimated);
  assert.equal(budgetMeters.estimatedCostUsd, 0.03); // Math.min(budgetUsd, 0.03) split + re-summed

  // The guardrail and validation check both hold (structural "within 1s").
  assert.equal(payload.guardrails.costLogAggregatedIntoBudgetMeters, true);
  const check = payload.validation.checks.find(
    (c) => c.id === "cost_log_aggregation_one_per_model_stage",
  );
  assert.ok(check && check.ok === true);
});

// ---------------------------------------------------------------------------
// Consistency with R2.3 / R2.6: aggregate is 0 when no model stage is accounted.
// ---------------------------------------------------------------------------

test("R2.3 consistency: live run with empty approvals[] aggregates to 0 estimated cost", () => {
  const { payload } = runVideoRemix({
    ...LIVE_APPROVED_ARGS,
    runId: "cost-log-noapproval-001",
    approvals: [],
  });
  // Still exactly one Cost_Log per model-bearing stage (R2.4) ...
  assert.equal(payload.costLogs.length, 2);
  // ... but every entry is 0, so the aggregate (and the meter) is 0 (R2.3).
  for (const entry of payload.costLogs) {
    assert.equal(entry.estimatedCostUsd, 0);
    assert.equal(entry.actualCostUsd, 0);
  }
  assert.equal(payload.budgetMeters.estimatedCostUsd, 0);
  assert.equal(payload.budgetMeters.costLogAggregate.estimatedCostUsd, 0);
  assert.equal(payload.budgetMeters.costLogAggregate.actualCostUsd, 0);
  assert.equal(payload.guardrails.costLogAggregatedIntoBudgetMeters, true);
});

test("R2.6 consistency: dry-run aggregates to 0 actual cost and exposes one Cost_Log per stage", () => {
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/reference.mp4",
    brief: "Cost-log aggregation, dry-run.",
    mode: "dry-run",
    budgetUsd: 20,
    runId: "cost-log-dryrun-001",
    shotCount: 3,
    sourceCards: THREE_SOURCE_CARDS,
  });
  assert.equal(payload.costLogs.length, 2);
  assert.equal(payload.budgetMeters.costLogAggregate.actualCostUsd, 0);
  // Dry-run does not approve the paid-model-call gate, so estimated is 0 too.
  assert.equal(payload.budgetMeters.costLogAggregate.estimatedCostUsd, 0);
  assert.equal(payload.guardrails.costLogAggregatedIntoBudgetMeters, true);
});

// ---------------------------------------------------------------------------
// Aggregation flows through the Director workflow wrapper unchanged.
// ---------------------------------------------------------------------------

test("Property 20 holds through the Director workflow wrapper", () => {
  const { payload } = runDirectorWorkflow(LIVE_APPROVED_ARGS);
  assert.equal(payload.costLogs.length, 2);
  assert.equal(
    payload.budgetMeters.estimatedCostUsd,
    payload.budgetMeters.costLogAggregate.estimatedCostUsd,
  );
  assert.equal(payload.guardrails.costLogAggregatedIntoBudgetMeters, true);
});
