// Unit tests for the Director AgentWorkflow skeleton
// (agenticgraph-acos-mcp-connector spec, task 2.1 - R2.1, R4.1 / Property 7).
//
// These tests assert the SKELETON guarantees only (task 2.1 scope):
//   * the workflow wraps `runVideoRemix` and preserves its Run_Manifest shape
//     (Section-1 McpAgent compatibility, reuse-not-rebuild),
//   * the four lane builders are wired as the workflow plan,
//   * the canonical stage ordering research -> storyboard -> render -> edit ->
//     publish -> checkout is established and the produced Run_Manifest's stage
//     sequence is a prefix of it (Property 7).
//
// Detailed per-stage behaviors (begin-after-completed enforcement, halt paths,
// retry, budget, cost-log, demo-pack) are tasks 2.2-2.16 and are intentionally
// NOT asserted here.

import { test } from "node:test";
import assert from "node:assert/strict";

import { runVideoRemix } from "../video-remix-runtime.js";
import {
  DIRECTOR_STAGE_ORDER,
  DIRECTOR_STAGE_GATES,
  DIRECTOR_TOOL_NAME,
  DIRECTOR_SEAMS,
  buildDirectorPlan,
  buildDirectorSteps,
  extractDirectorStageOrder,
  checkStageOrderingInvariant,
  assertStageOrderingInvariant,
  checkStrictStageOrdering,
  enforceStrictStageOrdering,
  assertStrictStageOrdering,
  isStageCompleted,
  hasStageBegun,
  createDirectorWorkflow,
  runDirectorWorkflow,
} from "../director-workflow.js";

const VALID_RUN_ARGS = Object.freeze({
  referenceUrl: "https://example.com/reference.mp4",
  brief: "Remix the reference into a sellable launch teaser.",
  mode: "live",
  budgetUsd: 20,
  runId: "director-workflow-skeleton-001",
  shotCount: 3,
  approvals: ["paid-model-call", "render-action", "payment-action", "cloud-deploy"],
  sourceCards: [
    { sourceId: "s1", url: "https://example.com/a", evidenceLevel: "A" },
    { sourceId: "s2", url: "https://example.com/b", evidenceLevel: "B" },
    { sourceId: "s3", url: "https://example.com/c", evidenceLevel: "B" },
  ],
});

// ---------------------------------------------------------------------------
// Canonical ordering constant (R4.1 / Property 7).
// ---------------------------------------------------------------------------

test("canonical stage order includes edit between render and publish", () => {
  assert.deepEqual(
    [...DIRECTOR_STAGE_ORDER],
    ["research", "storyboard", "render", "edit", "publish", "checkout"],
  );
});

test("every pipeline stage has a guarding gate id wired", () => {
  for (const stageId of DIRECTOR_STAGE_ORDER) {
    assert.ok(
      typeof DIRECTOR_STAGE_GATES[stageId] === "string" && DIRECTOR_STAGE_GATES[stageId].length > 0,
      `stage ${stageId} has a gate id`,
    );
  }
});

// ---------------------------------------------------------------------------
// Builder wiring (reuse-not-rebuild).
// ---------------------------------------------------------------------------

test("buildDirectorPlan wires all four lane builders", () => {
  const plan = buildDirectorPlan(VALID_RUN_ARGS);
  assert.ok(plan.planner && Array.isArray(plan.planner.tasks), "buildPlanner wired");
  assert.ok(Array.isArray(plan.toolCalls) && plan.toolCalls.length > 0, "buildToolCalls wired");
  assert.ok(Array.isArray(plan.approvalGates) && plan.approvalGates.length >= 5, "buildApprovalGates wired (>=5 gates)");
  assert.ok(plan.failureHandling && typeof plan.failureHandling.policy === "string", "buildFailureHandling wired");
});

test("buildDirectorSteps produces one ordered step per canonical stage", () => {
  const steps = buildDirectorSteps();
  assert.equal(steps.length, DIRECTOR_STAGE_ORDER.length);
  steps.forEach((step, index) => {
    assert.equal(step.stageId, DIRECTOR_STAGE_ORDER[index]);
    assert.equal(step.index, index);
    assert.equal(step.gateId, DIRECTOR_STAGE_GATES[step.stageId]);
    assert.equal(step.requiresPrecedingCompleted, index > 0);
    assert.equal(step.precedingStageId, index > 0 ? DIRECTOR_STAGE_ORDER[index - 1] : null);
  });
});

test("seam map documents the 2.2-2.16 follow-on tasks", () => {
  for (const taskId of ["2.2", "2.6", "2.9", "2.13", "3.14"]) {
    assert.ok(typeof DIRECTOR_SEAMS[taskId] === "string" && DIRECTOR_SEAMS[taskId].length > 0, `seam ${taskId} documented`);
  }
});

// ---------------------------------------------------------------------------
// Stage-ordering invariant (Property 7) over real runtime output.
// ---------------------------------------------------------------------------

test("runtime Run_Manifest derives the canonical stage order", () => {
  const { payload } = runVideoRemix(VALID_RUN_ARGS);
  const ids = payload.stages.map((s) => s.id);
  assert.deepEqual(ids, [...DIRECTOR_STAGE_ORDER]);
});

test("extractDirectorStageOrder returns the complete canonical sequence", () => {
  const { payload } = runVideoRemix(VALID_RUN_ARGS);
  const observed = extractDirectorStageOrder(payload);
  assert.deepEqual(observed, [...DIRECTOR_STAGE_ORDER]);
});

test("checkStageOrderingInvariant passes for a complete live run", () => {
  const { payload } = runVideoRemix(VALID_RUN_ARGS);
  const result = checkStageOrderingInvariant(payload);
  assert.equal(result.ok, true, JSON.stringify(result.violations));
  assert.deepEqual(result.observed, [...DIRECTOR_STAGE_ORDER]);
});

test("checkStageOrderingInvariant passes for dry-run and blocked runs (prefix holds)", () => {
  const dryRun = runVideoRemix({
    referenceUrl: "https://example.com/reference.mp4",
    brief: "Dry-run ordering.",
    mode: "dry-run",
    runId: "director-workflow-dry-001",
    shotCount: 2,
  }).payload;
  assert.equal(checkStageOrderingInvariant(dryRun).ok, true);

  // Live without approvals -> blocked early, but the produced stage sequence
  // must still be a prefix of the canonical order.
  const blocked = runVideoRemix({
    referenceUrl: "https://example.com/reference.mp4",
    brief: "Blocked ordering.",
    mode: "live",
    runId: "director-workflow-blocked-001",
  }).payload;
  const blockedResult = checkStageOrderingInvariant(blocked);
  assert.equal(blockedResult.ok, true, JSON.stringify(blockedResult.violations));
});

test("checkStageOrderingInvariant detects a reordered sequence", () => {
  const reordered = {
    runId: "bad",
    stages: [
      { id: "storyboard", status: "complete" },
      { id: "research", status: "complete" },
    ],
  };
  const result = checkStageOrderingInvariant(reordered);
  assert.equal(result.ok, false);
  assert.ok(result.violations.length > 0);
});

test("checkStageOrderingInvariant detects an unknown stage id", () => {
  const result = checkStageOrderingInvariant({
    runId: "bad",
    stages: [
      { id: "research", status: "complete" },
      { id: "transcode", status: "complete" },
    ],
  });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.startsWith("unknown_stage:transcode")));
});

test("assertStageOrderingInvariant throws on violation and returns on success", () => {
  assert.throws(
    () => assertStageOrderingInvariant({ runId: "x", stages: [{ id: "checkout" }, { id: "research" }] }),
    /stage ordering invariant violated/i,
  );
  const { payload } = runVideoRemix(VALID_RUN_ARGS);
  assert.equal(assertStageOrderingInvariant(payload).ok, true);
});

// ---------------------------------------------------------------------------
// Workflow run wrapper - Section-1 compatibility.
// ---------------------------------------------------------------------------

test("createDirectorWorkflow.run wraps runVideoRemix and preserves the payload shape", () => {
  const workflow = createDirectorWorkflow();
  assert.equal(workflow.name, DIRECTOR_TOOL_NAME);
  const wrapped = workflow.run(VALID_RUN_ARGS);
  const direct = runVideoRemix(VALID_RUN_ARGS);

  // Payload is the runtime payload, unchanged (compatibility with the
  // McpAgent tool-registry / durable persistence / diagnostics).
  assert.equal(wrapped.payload.contractVersion, direct.payload.contractVersion);
  assert.deepEqual(
    wrapped.payload.stages.map((s) => s.id),
    direct.payload.stages.map((s) => s.id),
  );
  assert.equal(wrapped.payload.state, direct.payload.state);
  assert.equal(typeof wrapped.text, "string");

  // The workflow sibling carries the wired plan, ordered steps, and the
  // ordering invariant result.
  assert.equal(wrapped.workflow.name, DIRECTOR_TOOL_NAME);
  assert.deepEqual(wrapped.workflow.stageOrder, [...DIRECTOR_STAGE_ORDER]);
  assert.equal(wrapped.workflow.steps.length, DIRECTOR_STAGE_ORDER.length);
  assert.equal(wrapped.workflow.ordering.ok, true);
  assert.ok(wrapped.workflow.plan.planner, "plan wired via builders");
});

test("runDirectorWorkflow honors an injected runtime (seam for tests / future SDK adoption)", () => {
  const calls = [];
  const fakeRuntime = (args) => {
    calls.push(args);
    return {
      payload: {
        runId: "injected",
        stages: [
          { id: "research", status: "complete" },
          { id: "storyboard", status: "complete" },
        ],
      },
      text: "injected runtime",
    };
  };
  const result = runDirectorWorkflow(VALID_RUN_ARGS, { runtime: fakeRuntime });
  assert.equal(calls.length, 1);
  assert.equal(result.text, "injected runtime");
  assert.equal(result.workflow.ordering.ok, true);
  assert.deepEqual(result.workflow.ordering.observed, ["research", "storyboard"]);
});

// ---------------------------------------------------------------------------
// Strict stage ordering (task 2.2 / R4.1 / Property 7) — the STRONGER runtime
// guarantee: no stage begins (no work, no spend, no status beyond
// pending/blocked) before its immediately preceding stage reaches `completed`.
// ---------------------------------------------------------------------------

// Live run with paid+render+payment approvals but NO cloud-deploy approval and
// only 1 source: research begins, becomes weak_signal, and the chain must halt.
const WEAK_SIGNAL_HALT_ARGS = Object.freeze({
  referenceUrl: "https://example.com/reference.mp4",
  brief: "Weak signal halts the downstream chain.",
  mode: "live",
  budgetUsd: 20,
  runId: "director-strict-weak-001",
  shotCount: 3,
  approvals: ["paid-model-call", "render-action", "payment-action", "cloud-deploy"],
  sourceCards: [{ sourceId: "s1", url: "https://example.com/a", evidenceLevel: "A" }],
});

// Live run, paid approved, 3 sources, but render/payment/deploy NOT approved:
// research+storyboard complete, render halts at its gate (approval_required),
// and publish/checkout must NOT begin (must be held, not approval_required).
const GATE_HALT_AT_RENDER_ARGS = Object.freeze({
  referenceUrl: "https://example.com/reference.mp4",
  brief: "Render gate halts downstream stages.",
  mode: "live",
  budgetUsd: 20,
  runId: "director-strict-gate-001",
  shotCount: 3,
  approvals: ["paid-model-call"],
  sourceCards: [
    { sourceId: "s1", url: "https://example.com/a", evidenceLevel: "A" },
    { sourceId: "s2", url: "https://example.com/b", evidenceLevel: "B" },
    { sourceId: "s3", url: "https://example.com/c", evidenceLevel: "B" },
  ],
});

test("isStageCompleted / hasStageBegun classify statuses correctly", () => {
  assert.equal(isStageCompleted("complete"), true);
  assert.equal(isStageCompleted("completed"), true);
  assert.equal(isStageCompleted("approval_required"), false);
  assert.equal(isStageCompleted("pending"), false);

  // Begun = entered execution (work/spend/plan-artifact/gate eval).
  assert.equal(hasStageBegun("complete"), true);
  assert.equal(hasStageBegun("weak_signal"), true);
  assert.equal(hasStageBegun("approval_required"), true);
  assert.equal(hasStageBegun("dry_run_ready"), true);
  // Not begun = held / never started.
  assert.equal(hasStageBegun("pending"), false);
  assert.equal(hasStageBegun("blocked"), false);
  assert.equal(hasStageBegun("blocked_weak_signal"), false);
  assert.equal(hasStageBegun(""), false);
});

test("strict ordering holds for a fully-approved complete run (no downgrades)", () => {
  const wrapped = createDirectorWorkflow().run(VALID_RUN_ARGS);
  assert.equal(wrapped.workflow.strictOrdering.ok, true, JSON.stringify(wrapped.workflow.strictOrdering.violations));
  assert.deepEqual(wrapped.workflow.orderingHalts, []);
  // Every pipeline stage completed.
  for (const stage of wrapped.payload.stages) {
    if (DIRECTOR_STAGE_ORDER.includes(stage.id)) {
      assert.equal(stage.status, "complete", `${stage.id} completed`);
    }
  }
});

test("NEGATIVE CASE: a weak-signal research stage halts every downstream stage", () => {
  const wrapped = createDirectorWorkflow().run(WEAK_SIGNAL_HALT_ARGS);
  const byId = Object.fromEntries(wrapped.payload.stages.map((s) => [s.id, s]));

  // research begins and degrades to weak_signal (the frontier).
  assert.equal(byId.research.status, "weak_signal");
  assert.equal(wrapped.workflow.orderingFrontier, "research");

  // No stage after research may have begun.
  // must all be held at a not-begun status (pending/blocked/blocked_weak_signal).
  for (const stageId of ["storyboard", "render", "edit", "publish", "checkout"]) {
    assert.equal(
      hasStageBegun(byId[stageId].status),
      false,
      `${stageId} must not begin while research is weak_signal (status=${byId[stageId].status})`,
    );
  }

  // The strict guarantee holds on the enforced manifest.
  assert.equal(wrapped.workflow.strictOrdering.ok, true, JSON.stringify(wrapped.workflow.strictOrdering.violations));
});

test("NEGATIVE CASE: an unapproved render gate halts publish and checkout", () => {
  const wrapped = createDirectorWorkflow().run(GATE_HALT_AT_RENDER_ARGS);
  const byId = Object.fromEntries(wrapped.payload.stages.map((s) => [s.id, s]));

  // research + storyboard complete; render is the frontier, halted at its gate.
  assert.equal(byId.research.status, "complete");
  assert.equal(byId.storyboard.status, "complete");
  assert.equal(byId.render.status, "approval_required");
  assert.equal(wrapped.workflow.orderingFrontier, "render");

  // edit, publish, and checkout must not begin.
  // until render completes — they are downgraded/held.
  assert.equal(hasStageBegun(byId.edit.status), false, `edit held (status=${byId.edit.status})`);
  assert.equal(hasStageBegun(byId.publish.status), false, `publish held (status=${byId.publish.status})`);
  assert.equal(hasStageBegun(byId.checkout.status), false, `checkout held (status=${byId.checkout.status})`);

  // All three stages were downgraded by the ordering enforcer.
  const haltedIds = wrapped.workflow.orderingHalts.map((d) => d.stageId);
  assert.ok(haltedIds.includes("edit"));
  assert.ok(haltedIds.includes("publish"));
  assert.ok(haltedIds.includes("checkout"));

  assert.equal(wrapped.workflow.strictOrdering.ok, true);
});

test("checkStrictStageOrdering flags a stage that began before its predecessor completed", () => {
  // Synthetic violating manifest: storyboard reached approval_required while
  // research is still weak_signal (not completed).
  const violating = {
    runId: "synthetic-violation",
    stages: [
      { id: "research", status: "weak_signal" },
      { id: "storyboard", status: "approval_required" },
      { id: "render", status: "dry_run_ready" },
    ],
  };
  const result = checkStrictStageOrdering(violating);
  assert.equal(result.ok, false);
  assert.equal(result.frontier, "research");
  assert.ok(result.violations.some((v) => v.startsWith("began_before_predecessor_completed:storyboard")));
  assert.ok(result.violations.some((v) => v.startsWith("began_before_predecessor_completed:render")));

  // assert variant throws on the same violation.
  assert.throws(() => assertStrictStageOrdering(violating), /strict stage ordering violated/i);
});

test("enforceStrictStageOrdering downgrades begun downstream stages and is non-mutating", () => {
  const violating = {
    runId: "synthetic-violation",
    stages: [
      { id: "research", status: "weak_signal" },
      { id: "storyboard", status: "approval_required" },
      { id: "checkout", status: "dry_run_ready" },
    ],
  };
  const enforced = enforceStrictStageOrdering(violating);

  // Frontier is research; storyboard + checkout are downgraded to blocked.
  assert.equal(enforced.frontier, "research");
  const byId = Object.fromEntries(enforced.manifest.stages.map((s) => [s.id, s]));
  assert.equal(byId.storyboard.status, "blocked");
  assert.equal(byId.checkout.status, "blocked");
  assert.equal(byId.research.status, "weak_signal"); // frontier untouched

  // Enforced manifest now satisfies the strict check.
  assert.equal(checkStrictStageOrdering(enforced.manifest).ok, true);

  // Original input is left intact (non-mutating).
  assert.equal(violating.stages[1].status, "approval_required");
  assert.equal(violating.stages[2].status, "dry_run_ready");
});

test("enforceStrictStageOrdering leaves a clean prefix-complete run untouched", () => {
  const clean = {
    runId: "clean",
    stages: [
      { id: "research", status: "complete" },
      { id: "storyboard", status: "complete" },
      { id: "render", status: "approval_required" }, // frontier, allowed to begin
    ],
  };
  const enforced = enforceStrictStageOrdering(clean);
  assert.deepEqual(enforced.downgrades, []);
  assert.equal(enforced.frontier, "render");
  assert.equal(enforced.manifest.stages[2].status, "approval_required");
});
