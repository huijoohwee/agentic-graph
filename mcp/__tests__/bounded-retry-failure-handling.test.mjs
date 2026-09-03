// Unit tests for the bounded-retry failure-handling model
// (agentic-graph-acos-mcp-connector spec, task 2.6 - R5.1, R5.2, R5.3 / Property 8 —
// partial; the fail-closed-on-exhaustion half is task 2.7).
//
// R5.1: WHEN a single stage tool fails, THE Director SHALL retry the stage
//   using exponential backoff starting at 1 second and capped at 30 seconds per
//   attempt, and SHALL increment the stage retry count by exactly 1 on each
//   retry.
// R5.2: THE Director SHALL limit total stage iterations to `maxIterations`,
//   where `maxIterations` is a positive integer between 1 and 100 inclusive.
// R5.3: WHILE the stage retry count is less than `maxIterations`, THE Director
//   SHALL keep Run_State set to `running` and continue retrying.
//
// This is the implementation seam for Property 8; the consolidated
// property-based test lands in task 9.1. These are example-based unit asserts
// of the DETERMINISTIC, PURE, timer-free model (no sleeping): a backoff
// schedule function mapping attempt index -> delay ms, retryCount increments of
// exactly 1, attempts bounded by maxIterations, and Run_State `running` while
// retryCount < maxIterations.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runVideoRemix,
  normalizeMaxIterations,
  computeRetryBackoffMs,
  retryRunStateFor,
  buildBoundedRetryPlan,
  exhaustionRunState,
  buildExhaustionFailureRecord,
} from "../video-remix-runtime.js";

// ---------------------------------------------------------------------------
// R5.1: exponential backoff schedule (1s, 2s, 4s, ..., capped at 30s).
// ---------------------------------------------------------------------------

test("R5.1: computeRetryBackoffMs doubles from 1s per attempt and caps at 30s", () => {
  // Zero-based attempt index -> delay ms.
  assert.equal(computeRetryBackoffMs(0), 1000); // 1s
  assert.equal(computeRetryBackoffMs(1), 2000); // 2s
  assert.equal(computeRetryBackoffMs(2), 4000); // 4s
  assert.equal(computeRetryBackoffMs(3), 8000); // 8s
  assert.equal(computeRetryBackoffMs(4), 16000); // 16s
  // 32s would exceed the 30s cap -> capped.
  assert.equal(computeRetryBackoffMs(5), 30000); // capped (would be 32s)
  assert.equal(computeRetryBackoffMs(6), 30000); // capped (would be 64s)
  assert.equal(computeRetryBackoffMs(50), 30000); // still capped, never overflows
});

test("R5.1: the backoff delay never starts below 1s and never exceeds 30s", () => {
  for (let i = 0; i < 200; i += 1) {
    const delay = computeRetryBackoffMs(i);
    assert.ok(delay >= 1000, `attempt ${i} delay >= 1s`);
    assert.ok(delay <= 30000, `attempt ${i} delay <= 30s`);
    assert.ok(Number.isFinite(delay), `attempt ${i} delay is finite`);
  }
});

test("R5.1: negative / non-finite attempt indices clamp to the first attempt (1s)", () => {
  assert.equal(computeRetryBackoffMs(-5), 1000);
  assert.equal(computeRetryBackoffMs(Number.NaN), 1000);
  assert.equal(computeRetryBackoffMs(2.9), 4000); // floored to index 2
});

test("R5.1: the bounded-retry schedule is 1s, 2s, 4s, 8s, ... capped at 30s", () => {
  const plan = buildBoundedRetryPlan({ maxIterations: 8 });
  assert.deepEqual(
    plan.schedule.map((s) => s.delayMs),
    [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000],
  );
  assert.equal(plan.baseMs, 1000);
  assert.equal(plan.capMs, 30000);
});

// ---------------------------------------------------------------------------
// R5.1: retryCount increments by exactly 1 per attempt.
// ---------------------------------------------------------------------------

test("R5.1: retryCount increments by exactly 1 on each attempt", () => {
  const plan = buildBoundedRetryPlan({ maxIterations: 10 });
  plan.schedule.forEach((entry, index) => {
    assert.equal(entry.retryCount, index + 1, "retryCount is 1-based, +1 per attempt");
    assert.equal(entry.attempt, index + 1);
    if (index > 0) {
      assert.equal(
        entry.retryCount - plan.schedule[index - 1].retryCount,
        1,
        "consecutive retryCount delta is exactly 1",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// R5.2: total iterations bounded by maxIterations.
// ---------------------------------------------------------------------------

test("R5.2: the schedule length equals the bounded maxIterations (attempts bounded)", () => {
  assert.equal(buildBoundedRetryPlan({ maxIterations: 1 }).schedule.length, 1);
  assert.equal(buildBoundedRetryPlan({ maxIterations: 5 }).schedule.length, 5);
  assert.equal(buildBoundedRetryPlan({ maxIterations: 100 }).schedule.length, 100);
  // Out-of-range requests are clamped before bounding the attempts.
  assert.equal(buildBoundedRetryPlan({ maxIterations: 250 }).schedule.length, 100);
  assert.equal(buildBoundedRetryPlan({ maxIterations: 0 }).schedule.length, 1);
});

test("R5.2: the final retryCount never exceeds maxIterations", () => {
  for (const requested of [1, 7, 12, 13, 50, 100, 500]) {
    const plan = buildBoundedRetryPlan({ maxIterations: requested });
    const finalRetryCount = plan.schedule[plan.schedule.length - 1].retryCount;
    assert.equal(finalRetryCount, plan.maxIterations);
    assert.ok(finalRetryCount <= 100, "never exceeds the [1,100] ceiling");
  }
});

// ---------------------------------------------------------------------------
// R5.3: Run_State stays `running` while retryCount < maxIterations.
// ---------------------------------------------------------------------------

test("R5.3: retryRunStateFor is `running` below maxIterations and `exhausted` at the bound", () => {
  assert.equal(retryRunStateFor(1, 8), "running");
  assert.equal(retryRunStateFor(7, 8), "running");
  // retryCount == maxIterations: no longer < maxIterations -> exhausted seam (task 2.7).
  assert.equal(retryRunStateFor(8, 8), "exhausted");
  assert.equal(retryRunStateFor(9, 8), "exhausted");
});

test("R5.3: every schedule entry below the bound carries runState `running`", () => {
  const plan = buildBoundedRetryPlan({ maxIterations: 5 });
  plan.schedule.forEach((entry) => {
    if (entry.retryCount < plan.maxIterations) {
      assert.equal(entry.runState, "running", `retryCount ${entry.retryCount} keeps running`);
    } else {
      // Only the final attempt reaches the exhaustion seam.
      assert.equal(entry.runState, "exhausted", "final attempt marks the exhaustion seam");
    }
  });
  // Exactly one exhausted entry (the last), the rest running.
  const exhausted = plan.schedule.filter((e) => e.runState === "exhausted");
  assert.equal(exhausted.length, 1);
  assert.equal(exhausted[0].retryCount, plan.maxIterations);
});

test("R5.3: with maxIterations = 1 the single attempt is immediately at the exhaustion seam", () => {
  const plan = buildBoundedRetryPlan({ maxIterations: 1 });
  assert.equal(plan.schedule.length, 1);
  assert.equal(plan.schedule[0].retryCount, 1);
  assert.equal(plan.schedule[0].runState, "exhausted"); // 1 is not < 1
});

// ---------------------------------------------------------------------------
// R5.2: maxIterations clamped/validated to [1,100].
// ---------------------------------------------------------------------------

test("R5.2: normalizeMaxIterations clamps to the inclusive range [1,100]", () => {
  // In-range values pass through (floored).
  assert.equal(normalizeMaxIterations(1), 1);
  assert.equal(normalizeMaxIterations(8), 8);
  assert.equal(normalizeMaxIterations(50), 50);
  assert.equal(normalizeMaxIterations(100), 100);
  assert.equal(normalizeMaxIterations(12.9), 12);

  // Below the floor clamps to 1.
  assert.equal(normalizeMaxIterations(0), 1);
  assert.equal(normalizeMaxIterations(-10), 1);

  // Above the ceiling clamps to 100.
  assert.equal(normalizeMaxIterations(101), 100);
  assert.equal(normalizeMaxIterations(1000), 100);

  // Non-finite / missing falls back to the default (8), itself in range.
  assert.equal(normalizeMaxIterations(undefined), 8);
  assert.equal(normalizeMaxIterations(Number.NaN), 8);
  assert.equal(normalizeMaxIterations("nope"), 8);
});

test("R5.2: maxIterations of 50 (valid per worker schema) is no longer capped to 12", () => {
  // Regression guard for the [1,12] -> [1,100] reconciliation: a caller passing
  // a maxIterations the Section-1 worker schema accepts must survive the runtime.
  const plan = buildBoundedRetryPlan({ maxIterations: 50 });
  assert.equal(plan.maxIterations, 50);
  assert.equal(plan.schedule.length, 50);
});

// ---------------------------------------------------------------------------
// Integration: the runtime Run_Manifest surfaces the bounded-retry model and
// honors the [1,100] maxIterations bound (reconciled with the worker schema).
// ---------------------------------------------------------------------------

const BASE_ARGS = Object.freeze({
  referenceUrl: "https://example.com/reference.mp4",
  brief: "Bounded-retry failure-handling model.",
  mode: "dry-run",
  runId: "bounded-retry-001",
});

// Three source cards so research is not a weak signal — lets the exhaustion
// tests below attribute `blocked` to retry exhaustion (R5.4) rather than to the
// weak-signal halt (R4.5).
const THREE_SOURCE_CARDS = Object.freeze([
  { url: "https://example.com/a", sourceId: "source-1" },
  { url: "https://example.com/b", sourceId: "source-2" },
  { url: "https://example.com/c", sourceId: "source-3" },
]);

test("runVideoRemix carries maxIterations in [1,100] and the backoff schedule", () => {
  const { payload } = runVideoRemix({ ...BASE_ARGS, maxIterations: 50 });
  // R5.2: the manifest reflects the widened [1,100] bound (was clamped to 12).
  assert.equal(payload.maxIterations, 50);
  assert.equal(payload.failureHandling.maxIterations, 50);

  // R5.1: the backoff schedule is attached and starts at 1s, caps at 30s.
  const schedule = payload.failureHandling.backoff.schedule;
  assert.equal(schedule.length, 50);
  assert.equal(schedule[0].delayMs, 1000);
  assert.equal(schedule[0].retryCount, 1);
  assert.equal(payload.failureHandling.backoff.capMs, 30000);
  assert.ok(schedule.every((s) => s.delayMs <= 30000));
});

test("runVideoRemix clamps an over-range maxIterations to 100", () => {
  const { payload } = runVideoRemix({ ...BASE_ARGS, maxIterations: 1000 });
  assert.equal(payload.maxIterations, 100);
  assert.equal(payload.failureHandling.backoff.schedule.length, 100);
});

test("an injected stage failure records retryCount +1 and runState running (below bound)", () => {
  const { payload } = runVideoRemix({
    ...BASE_ARGS,
    maxIterations: 8,
    failOnceTool: "agentic-graph.video_remix.render",
  });
  const failures = payload.failureHandling.failures;
  assert.equal(failures.length, 1);
  assert.equal(failures[0].retryCount, 1); // +1 per attempt (R5.1)
  assert.equal(failures[0].backoffMs, 1000); // first retry waits 1s (R5.1)
  assert.equal(failures[0].runState, "running"); // 1 < 8 (R5.3)
  // The existing failure_retry_bounded validation check still holds.
  const check = payload.validation.checks.find((c) => c.id === "failure_retry_bounded");
  assert.ok(check && check.ok === true);
});

// ---------------------------------------------------------------------------
// R5.4 / task 2.7: fail closed on retry exhaustion. Once retryCount reaches
// maxIterations the run sets Run_State `blocked`, halts further iterations, and
// appends a failure record { stageId, finalRetryCount, reason } to the
// Run_Manifest. This is the exhaustion half of Property 8 (the consolidated
// property-based test lands in task 9.1).
// ---------------------------------------------------------------------------

test("R5.4: exhaustionRunState is `running` below the bound and `blocked` at/after it", () => {
  // Non-exhausted: the bounded retry keeps running (R5.3).
  assert.equal(exhaustionRunState(1, 8), "running");
  assert.equal(exhaustionRunState(7, 8), "running");
  // Exhausted: retryCount reaches maxIterations -> fail closed (R5.4).
  assert.equal(exhaustionRunState(8, 8), "blocked");
  assert.equal(exhaustionRunState(9, 8), "blocked");
  // maxIterations = 1: the single attempt is immediately exhausted -> blocked.
  assert.equal(exhaustionRunState(1, 1), "blocked");
});

test("R5.4: buildExhaustionFailureRecord yields the canonical { stageId, finalRetryCount, reason } shape", () => {
  const record = buildExhaustionFailureRecord({
    stageId: "render",
    finalRetryCount: 8,
    reason: "retry_exhausted_after_max_iterations",
  });
  assert.deepEqual(Object.keys(record).sort(), ["finalRetryCount", "reason", "stageId"]);
  assert.equal(record.stageId, "render");
  assert.equal(record.finalRetryCount, 8);
  assert.equal(record.reason, "retry_exhausted_after_max_iterations");
});

test("R5.4: a stage that fails past maxIterations sets Run_State blocked and appends one failure record", () => {
  const maxIterations = 5;
  const { payload } = runVideoRemix({
    ...BASE_ARGS,
    maxIterations,
    sourceCards: THREE_SOURCE_CARDS,
    // Fail-always injection: the stage fails on every attempt, exhausting its
    // bounded retries at maxIterations.
    failAlwaysTool: "agentic-graph.video_remix.render",
  });

  // Run_State fails closed (R5.4) — attributable to exhaustion, not weak signal.
  assert.equal(payload.state, "blocked");

  // Exactly one canonical failure record appended to the Run_Manifest.
  assert.ok(Array.isArray(payload.failures), "Run_Manifest carries a failures[] array");
  assert.equal(payload.failures.length, 1);
  const [record] = payload.failures;
  assert.deepEqual(Object.keys(record).sort(), ["finalRetryCount", "reason", "stageId"]);
  assert.equal(record.stageId, "render"); // derived from the injected tool name
  assert.equal(record.finalRetryCount, maxIterations); // exhausted at the bound (R5.2)
  assert.equal(record.reason, "retry_exhausted_after_max_iterations");

  // The fail-closed validation check + guardrail hold.
  const check = payload.validation.checks.find((c) => c.id === "exhaustion_fails_closed_with_record");
  assert.ok(check && check.ok === true);
  assert.equal(payload.guardrails.failsClosedOnRetryExhaustion, true);
});

test("R5.4: maxIterations = 1 exhausts on the first attempt and fails closed with a record", () => {
  const { payload } = runVideoRemix({
    ...BASE_ARGS,
    maxIterations: 1,
    sourceCards: THREE_SOURCE_CARDS,
    failAlwaysTool: "agentic-graph.video_remix.storyboard",
  });
  assert.equal(payload.state, "blocked");
  assert.equal(payload.failures.length, 1);
  assert.equal(payload.failures[0].stageId, "storyboard");
  assert.equal(payload.failures[0].finalRetryCount, 1); // 1 is not < 1 -> exhausted
});

test("R5.4 (converse): a non-exhausted bounded retry stays running and appends no premature failure record", () => {
  const { payload } = runVideoRemix({
    ...BASE_ARGS,
    maxIterations: 8,
    failOnceTool: "agentic-graph.video_remix.render",
  });

  // The single transient failure has NOT exhausted: its retry stays `running`
  // (R5.3) and it is not marked exhausted.
  const [retry] = payload.failureHandling.failures;
  assert.equal(retry.runState, "running");
  assert.equal(retry.exhausted, false);

  // No premature canonical failure record is appended to the Run_Manifest.
  assert.deepEqual(payload.failures, []);
  const check = payload.validation.checks.find((c) => c.id === "no_premature_failure_record");
  assert.ok(check && check.ok === true);
  assert.equal(payload.guardrails.noPrematureFailureRecord, true);
});
