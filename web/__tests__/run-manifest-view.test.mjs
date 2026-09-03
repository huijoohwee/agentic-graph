// Tests for the Run_Manifest rendering view-model
// (agentic-graph-acos-mcp-connector spec, task 7.10 / R1.9 + R13.4 / design
// Correctness Property 32 / design Frontend `renderManifest`).
//
// Covers:
//   - renders the current Run_State + the COMPLETE stage list + Budget_Meters
//     (R13.4)
//   - the 2,000 ms render-deadline metadata + past-deadline flag (R13.4)
//   - re-building from an UPDATED manifest reflects the new state / stages /
//     meters at a stage transition (R1.9)
//   - a malformed / empty manifest never throws (renders gracefully)
//
// The Run_Manifest shape MIRRORS the durable manifest in the design Data
// Models / worker tier (`{ runId, state, stages[], approvalGates[],
// budgetMeters, ... }`).
//
// ZERO network / ZERO browser.

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRunManifestView,
  buildBudgetMetersView,
  resolveManifest,
  resolveRunState,
  MANIFEST_RENDER_DEADLINE_MS,
  RUN_STATES,
  TERMINAL_RUN_STATES,
  DEFAULT_RUN_STATE,
  BUDGET_METER_FIELDS,
} from "../src/lib/run-manifest-view.js";

// --- Fixtures ---------------------------------------------------------------

/** A single Stage entry as the durable Run_Manifest carries it. */
function stage(id, status, retryCount = 0) {
  return { id, status, retryCount, costLog: null, artifact: null };
}

/**
 * A Run_Manifest as the Director emits it. `meters` overrides the three
 * canonical Budget_Meters; `stages` is the worker `stages[]` array.
 */
function manifest(overrides = {}) {
  return {
    runId: "run-7-10",
    state: "running",
    mode: "live",
    stages: [],
    approvalGates: [],
    budgetMeters: { estimatedCostUsd: 0, actualCostUsd: 0, providerSpendUsd: 0 },
    demoPack: null,
    failures: [],
    reconciliationFlags: [],
    ...overrides,
  };
}

// --- Run_State + complete stage list + Budget_Meters (R13.4) -----------------

test("renders the current Run_State surfaced verbatim from the manifest", () => {
  const view = buildRunManifestView(manifest({ state: "approval_required" }));
  assert.equal(view.runState, "approval_required");
  assert.equal(view.isKnownRunState, true);
  assert.equal(view.isTerminalState, false);
});

test("renders the complete source-declared stage list in manifest order", () => {
  const stages = [stage("research", "complete"), stage("edit", "pending")];
  const view = buildRunManifestView(manifest({ stages }));
  assert.equal(view.stageCount, stages.length);
  assert.deepEqual(view.stages.map((entry) => entry.id), stages.map((entry) => entry.id));
  view.stages.forEach((s, i) => assert.equal(s.order, i));
});

test("a sparse manifest remains sparse without downstream backfill", () => {
  const view = buildRunManifestView(
    manifest({ stages: [stage("research", "completed")] }),
  );
  assert.equal(view.stageCount, 1);
  const research = view.stages.find((s) => s.id === "research");
  assert.equal(research.status, "completed");
  assert.equal(view.stages.some((s) => s.id === "checkout"), false);
});

test("each stage reflects its current manifest status", () => {
  const view = buildRunManifestView(
    manifest({
      stages: [
        stage("research", "completed"),
        stage("storyboard", "running"),
        stage("render", "approval_required"),
      ],
    }),
  );
  const byId = Object.fromEntries(view.stages.map((s) => [s.id, s.status]));
  assert.equal(byId.research, "completed");
  assert.equal(byId.storyboard, "running");
  assert.equal(byId.render, "approval_required");
});

test("renders the three canonical Budget_Meters with display companions", () => {
  const view = buildRunManifestView(
    manifest({
      budgetMeters: {
        estimatedCostUsd: 12.5,
        actualCostUsd: 4,
        providerSpendUsd: 3.999,
      },
    }),
  );
  for (const field of BUDGET_METER_FIELDS) {
    assert.ok(field in view.budgetMeters, `meter ${field} present`);
  }
  assert.equal(view.budgetMeters.estimatedCostUsd, 12.5);
  assert.equal(view.budgetMeters.estimatedCostDisplay, "$12.50");
  assert.equal(view.budgetMeters.actualCostUsd, 4);
  assert.equal(view.budgetMeters.actualCostDisplay, "$4.00");
  assert.equal(view.budgetMeters.providerSpendDisplay, "$4.00");
});

test("missing / malformed meters fall back to $0.00 (never NaN)", () => {
  const view = buildRunManifestView(
    manifest({
      budgetMeters: { estimatedCostUsd: "abc", actualCostUsd: -5 },
    }),
  );
  for (const field of BUDGET_METER_FIELDS) {
    assert.equal(view.budgetMeters[field], 0);
    assert.ok(Number.isFinite(view.budgetMeters[field]));
  }
  assert.equal(view.budgetMeters.estimatedCostDisplay, "$0.00");
  assert.equal(view.budgetMeters.providerSpendDisplay, "$0.00");
});

test("a missing state falls back to the default run state", () => {
  const view = buildRunManifestView(manifest({ state: undefined }));
  assert.equal(view.runState, DEFAULT_RUN_STATE);
});

test("terminal run states are flagged", () => {
  for (const terminal of TERMINAL_RUN_STATES) {
    const view = buildRunManifestView(manifest({ state: terminal }));
    assert.equal(view.isTerminalState, true);
  }
  const running = buildRunManifestView(manifest({ state: "running" }));
  assert.equal(running.isTerminalState, false);
});

test("a runtime-internal state is surfaced verbatim, flagged non-canonical", () => {
  const view = buildRunManifestView(manifest({ state: "dry_run_ready" }));
  assert.equal(view.runState, "dry_run_ready");
  assert.equal(view.isKnownRunState, false);
});

// --- 2s render-deadline metadata + past-deadline flag (R13.4) ----------------

test("exposes the 2,000 ms render deadline metadata, within deadline by default", () => {
  const view = buildRunManifestView(manifest());
  assert.equal(view.renderDeadlineMs, MANIFEST_RENDER_DEADLINE_MS);
  assert.equal(view.renderDeadlineMs, 2000);
  assert.equal(view.renderElapsedMs, 0);
  assert.equal(view.renderWithinDeadline, true);
});

test("an injected elapsed signal at the boundary is still within deadline", () => {
  const view = buildRunManifestView(manifest(), { renderElapsedMs: 2000 });
  assert.equal(view.renderElapsedMs, 2000);
  assert.equal(view.renderWithinDeadline, true);
});

test("an injected elapsed signal past 2,000 ms flips renderWithinDeadline false", () => {
  const view = buildRunManifestView(manifest(), { renderElapsedMs: 2001 });
  assert.equal(view.renderElapsedMs, 2001);
  assert.equal(view.renderWithinDeadline, false);
});

test("a non-finite / negative elapsed signal defaults to 0 (within deadline)", () => {
  for (const bad of [undefined, NaN, Infinity, "x", -10]) {
    const view = buildRunManifestView(manifest(), { renderElapsedMs: bad });
    assert.equal(view.renderElapsedMs, 0);
    assert.equal(view.renderWithinDeadline, true);
  }
});

// --- Re-building from an updated manifest reflects the transition (R1.9) ------

test("re-building from an updated manifest reflects the new state / stages / meters", () => {
  const before = buildRunManifestView(
    manifest({
      state: "running",
      stages: [stage("research", "running")],
      budgetMeters: { estimatedCostUsd: 1, actualCostUsd: 0, providerSpendUsd: 0 },
    }),
  );
  assert.equal(before.runState, "running");
  assert.equal(
    before.stages.find((s) => s.id === "research").status,
    "running",
  );
  assert.equal(before.budgetMeters.actualCostUsd, 0);

  // Stage transition: research completes, storyboard starts, spend accrues,
  // and the run moves to approval_required at the next spend boundary.
  const after = buildRunManifestView(
    manifest({
      state: "approval_required",
      stages: [
        stage("research", "completed"),
        stage("storyboard", "completed"),
        stage("render", "approval_required"),
      ],
      budgetMeters: { estimatedCostUsd: 6.5, actualCostUsd: 2.25, providerSpendUsd: 2.25 },
    }),
  );

  assert.equal(after.runState, "approval_required");
  assert.equal(
    after.stages.find((s) => s.id === "research").status,
    "completed",
  );
  assert.equal(
    after.stages.find((s) => s.id === "storyboard").status,
    "completed",
  );
  assert.equal(
    after.stages.find((s) => s.id === "render").status,
    "approval_required",
  );
  assert.equal(after.budgetMeters.estimatedCostUsd, 6.5);
  assert.equal(after.budgetMeters.actualCostUsd, 2.25);
  assert.equal(after.budgetMeters.actualCostDisplay, "$2.25");

  // The fresh view differs from the prior view (the transition is reflected).
  assert.notEqual(before.runState, after.runState);
  assert.notDeepEqual(before.budgetMeters, after.budgetMeters);
});

test("the builder is pure: same manifest yields an equal view", () => {
  const m = manifest({
    state: "completed",
    stages: [stage("checkout", "completed")],
    budgetMeters: { estimatedCostUsd: 9, actualCostUsd: 9, providerSpendUsd: 9 },
  });
  assert.deepEqual(buildRunManifestView(m), buildRunManifestView(m));
});

test("re-building does not mutate the input manifest", () => {
  const m = manifest({ stages: [stage("research", "running")] });
  const snapshot = JSON.parse(JSON.stringify(m));
  buildRunManifestView(m);
  assert.deepEqual(m, snapshot);
});

// --- Envelope unwrapping ----------------------------------------------------

test("accepts a manifest nested under runManifest / manifest", () => {
  const inner = manifest({ state: "blocked" });
  assert.equal(buildRunManifestView({ runManifest: inner }).runState, "blocked");
  assert.equal(buildRunManifestView({ manifest: inner }).runState, "blocked");
});

test("resolveManifest unwraps carriers and tolerates malformed input", () => {
  const inner = manifest({ state: "running" });
  assert.equal(resolveManifest({ runManifest: inner }).state, "running");
  assert.equal(resolveManifest({ manifest: inner }).state, "running");
  assert.equal(resolveManifest(inner).state, "running");
  for (const bad of [null, undefined, 5, "x", [], true]) {
    assert.deepEqual(resolveManifest(bad), {});
  }
});

test("resolveRunState surfaces a trimmed state or the default", () => {
  assert.equal(resolveRunState({ state: "  completed  " }), "completed");
  assert.equal(resolveRunState({ state: "" }), DEFAULT_RUN_STATE);
  assert.equal(resolveRunState({}), DEFAULT_RUN_STATE);
  assert.equal(resolveRunState(null), DEFAULT_RUN_STATE);
});

test("buildBudgetMetersView zeroes a missing budgetMeters object", () => {
  const meters = buildBudgetMetersView({});
  for (const field of BUDGET_METER_FIELDS) assert.equal(meters[field], 0);
  assert.equal(meters.estimatedCostDisplay, "$0.00");
});

// --- Malformed / empty manifest never throws --------------------------------

test("malformed manifest input never throws or fabricates stage data", () => {
  for (const bad of [null, undefined, 5, "x", [], true, NaN]) {
    const view = buildRunManifestView(bad);
    // Run_State falls back to the default.
    assert.equal(view.runState, DEFAULT_RUN_STATE);
    assert.equal(view.stageCount, 0);
    // Meters are zeroed, not NaN.
    for (const field of BUDGET_METER_FIELDS) {
      assert.equal(view.budgetMeters[field], 0);
    }
    // Deadline metadata is present and sane.
    assert.equal(view.renderDeadlineMs, 2000);
    assert.equal(view.renderWithinDeadline, true);
  }
});

test("an empty manifest object renders gracefully", () => {
  const view = buildRunManifestView({});
  assert.equal(view.runState, DEFAULT_RUN_STATE);
  assert.equal(view.stageCount, 0);
  assert.equal(view.budgetMeters.estimatedCostUsd, 0);
});

test("RUN_STATES catalog matches the canonical lifecycle states", () => {
  assert.deepEqual(
    [...RUN_STATES],
    [
      "running",
      "blocked",
      "budget_exceeded",
      "approval_required",
      "verification_failed",
      "completed",
    ],
  );
});
