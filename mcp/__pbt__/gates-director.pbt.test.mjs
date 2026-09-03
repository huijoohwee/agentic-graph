// =============================================================================
// Property-based tests — Director + approval-gate logic (spec task 9.1).
// Properties 1, 2, 3, 4, 7, 8, 9. fast-check, >=100 runs each, external deps
// mocked via the runtime's deterministic injectable seams (ZERO live calls).
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
  withApprovalGate,
  RENDER_GATE_ID,
  PAYMENT_GATE_ID,
  runVideoRemix,
  DirectorInputValidationError,
  validateDirectorInput,
  buildBoundedRetryPlan,
  computeRetryBackoffMs,
  normalizeMaxIterations,
  exhaustionRunState,
  budgetCapExceeded,
  normalizeCumulativeSpendUsd,
} from "../video-remix-runtime.js";
import {
  checkStageOrderingInvariant,
  checkStrictStageOrdering,
  runDirectorWorkflow,
} from "../director-workflow.js";
import {
  NOW_MS,
  GATE_TTL_MS,
  httpUrlArb,
  briefArb,
  overlongBriefArb,
  inRangeBudgetArb,
  outOfRangeBudgetArb,
  shotCountInRangeArb,
  wordArb,
  emptyOrWhitespaceArb,
  tokenStateArb,
  authTokenShapedArb,
  gateTokenAgeAroundWindowArb,
  maxIterationsBoundaryArb,
} from "./arbitraries.mjs";

const RUNS = 200;
const now = () => NOW_MS;

const threeSources = [
  { sourceId: "s1", url: "https://example.com/a", evidenceLevel: "A" },
  { sourceId: "s2", url: "https://example.com/b", evidenceLevel: "B" },
  { sourceId: "s3", url: "https://example.com/c", evidenceLevel: "B" },
];

// -----------------------------------------------------------------------------
// Feature: agentic-graph-acos-mcp-connector, Property 1: For any paid action requested in Live_Mode (render dispatch, checkout/payout, or any spend-bearing stage tool invoked directly over MCP), the action executes only if the presented Approval_Token is verified, matches the requested action's gate, is unexpired (issuance age <= 15 minutes), and has not been previously consumed; in every other case the action is blocked, no paid-provider call occurs, spend-bearing state is unchanged, and the rejection reason is recorded. On a permitted action the token is marked consumed so it can never authorize a second paid action. A valid Auth_Token never substitutes for an Approval_Token at any spend boundary.
// -----------------------------------------------------------------------------
test("Property 1: approval-gate invariant for paid actions", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(RENDER_GATE_ID, PAYMENT_GATE_ID).chain((gateId) =>
        fc.record({ gateId: fc.constant(gateId), spec: tokenStateArb(gateId) }),
      ),
      async ({ spec }) => {
        let spendCalls = 0;
        let consumed = false;
        const outcome = await withApprovalGate(
          spec.gateId,
          spec.token,
          () => {
            spendCalls += 1;
            return { dispatched: true };
          },
          { now, consume: () => { consumed = true; } },
        );

        if (spec.expectValid) {
          // Permitted: spend ran exactly once, token consumed afterward.
          assert.equal(outcome.permitted, true);
          assert.equal(spendCalls, 1);
          assert.equal(consumed, true);
          assert.equal(outcome.error ?? null, null);
        } else {
          // Blocked: spend never ran (state unchanged), rejection recorded.
          assert.equal(outcome.permitted, false);
          assert.equal(spendCalls, 0);
          assert.equal(consumed, false);
          assert.ok(outcome.error, "a structured rejection error is recorded");
          assert.ok(typeof outcome.reason === "string" && outcome.reason.length > 0);
        }
      },
    ),
    { numRuns: RUNS },
  );

  // A valid Auth_Token never substitutes for an Approval_Token (R15.9): it has
  // no gate id, so it can never authorize a spend boundary.
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(RENDER_GATE_ID, PAYMENT_GATE_ID),
      authTokenShapedArb,
      async (gateId, authToken) => {
        let spendCalls = 0;
        const outcome = await withApprovalGate(gateId, authToken, () => { spendCalls += 1; }, { now });
        assert.equal(outcome.permitted, false);
        assert.equal(spendCalls, 0);
      },
    ),
    { numRuns: RUNS },
  );

  // Token-age boundary: a gate-matched, signed, unconsumed token is permitted
  // iff its issuance age is within the 15-minute window (R4.7). Ages straddle
  // the cap exactly via the shared boundary generator (spec task 9.4).
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom(RENDER_GATE_ID, PAYMENT_GATE_ID),
      gateTokenAgeAroundWindowArb,
      async (gateId, { age, expectValid }) => {
        let spendCalls = 0;
        const token = { gateId, issuedAt: NOW_MS - age, consumed: false, verified: true };
        const outcome = await withApprovalGate(gateId, token, () => { spendCalls += 1; }, { now });
        assert.equal(outcome.permitted, expectValid);
        assert.equal(spendCalls, expectValid ? 1 : 0);
      },
    ),
    { numRuns: RUNS },
  );
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-acos-mcp-connector, Property 2: For any valid agentic-graph.video_remix.run input invoked in Live_Mode with an empty approvals[] array, the resulting Run_Manifest has Run_State blocked, at least 5 Approval_Gate entries, budgetMeters.estimatedCostUsd exactly 0, and exactly 0 paid-provider calls recorded.
// -----------------------------------------------------------------------------
test("Property 2: live-without-approvals halts with zero spend", () => {
  fc.assert(
    fc.property(
      httpUrlArb,
      briefArb,
      inRangeBudgetArb,
      shotCountInRangeArb,
      wordArb,
      (referenceUrl, brief, budgetUsd, shotCount, runId) => {
        const { payload } = runVideoRemix({
          referenceUrl,
          brief,
          mode: "live",
          budgetUsd,
          shotCount,
          runId: `p2-${runId}`,
          approvals: [],
        });
        assert.equal(payload.state, "blocked");
        assert.ok(Array.isArray(payload.approvalGates) && payload.approvalGates.length >= 5);
        assert.equal(payload.budgetMeters.estimatedCostUsd, 0);
        assert.equal(payload.budgetMeters.paidProviderCalls, 0);
      },
    ),
    { numRuns: RUNS },
  );
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-acos-mcp-connector, Property 3: For any valid run input invoked in mode:"dry-run", every spend-bearing step resolves to a plan artifact, exactly 0 paid-provider calls occur, and budgetMeters.actualCostUsd is exactly 0.
// -----------------------------------------------------------------------------
test("Property 3: dry-run performs zero paid actions", () => {
  const SPEND_BEARING = ["research", "storyboard", "render", "publish", "checkout"];
  fc.assert(
    fc.property(
      httpUrlArb,
      briefArb,
      inRangeBudgetArb,
      shotCountInRangeArb,
      wordArb,
      (referenceUrl, brief, budgetUsd, shotCount, runId) => {
        const { payload } = runVideoRemix({
          referenceUrl,
          brief,
          mode: "dry-run",
          budgetUsd,
          shotCount,
          runId: `p3-${runId}`,
          sourceCards: threeSources,
        });
        assert.equal(payload.budgetMeters.actualCostUsd, 0);
        assert.equal(payload.budgetMeters.paidProviderCalls, 0);
        const spend = payload.stages.filter((s) => SPEND_BEARING.includes(s.id));
        assert.equal(spend.length, SPEND_BEARING.length);
        for (const stage of spend) {
          assert.equal(stage.executed, false);
          assert.ok(stage.artifact && stage.artifact.resolvedTo === "plan_artifact");
        }
      },
    ),
    { numRuns: RUNS },
  );
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-acos-mcp-connector, Property 4: For any run input that omits a required field, supplies a budgetUsd outside [0.01, 100000.00], or supplies a mode other than "live"/"dry-run", the Director rejects the call with an error naming the invalid field, performs zero paid-provider calls, and creates no Run_Manifest; conversely, for any fully valid input a Run_Manifest is produced.
// -----------------------------------------------------------------------------
test("Property 4: Director input validation rejects malformed runs", () => {
  // The Director's validateDirectorInput accepts any *absolute* URL (the
  // http/https scheme is enforced by the Frontend/Agent_Api tiers, Properties
  // 5/6); it rejects only an empty or unparseable (non-absolute) referenceUrl.
  const directorInvalidUrlArb = fc.constantFrom("", " ", "   ", "not-a-url", "relative/only", "/leading-slash", "???");

  // Invalid-input half: each case carries the field expected to be named.
  const invalidArb = fc.oneof(
    // missing referenceUrl
    fc.record({ brief: briefArb }).map((r) => ({ args: r, field: "referenceUrl" })),
    // empty / non-absolute referenceUrl
    fc.record({ referenceUrl: directorInvalidUrlArb, brief: briefArb }).map((r) => ({ args: r, field: "referenceUrl" })),
    // missing brief
    fc.record({ referenceUrl: httpUrlArb }).map((r) => ({ args: r, field: "brief" })),
    // empty/whitespace brief
    fc.record({ referenceUrl: httpUrlArb, brief: emptyOrWhitespaceArb }).map((r) => ({ args: r, field: "brief" })),
    // overlong brief
    fc.record({ referenceUrl: httpUrlArb, brief: overlongBriefArb }).map((r) => ({ args: r, field: "brief" })),
    // out-of-range budget
    fc.record({ referenceUrl: httpUrlArb, brief: briefArb, budgetUsd: outOfRangeBudgetArb }).map((r) => ({ args: r, field: "budgetUsd" })),
    // invalid mode
    fc.record({ referenceUrl: httpUrlArb, brief: briefArb, mode: fc.constantFrom("fast", "test", "LIVE", "x") }).map((r) => ({ args: r, field: "mode" })),
  );

  fc.assert(
    fc.property(invalidArb, ({ args, field }) => {
      assert.throws(
        () => validateDirectorInput(args),
        (err) => err instanceof DirectorInputValidationError && err.field === field,
      );
      // Creates no Run_Manifest: runVideoRemix propagates the same throw.
      assert.throws(() => runVideoRemix(args), DirectorInputValidationError);
    }),
    { numRuns: RUNS },
  );

  // Valid-input half: a fully valid input is accepted and produces a manifest.
  fc.assert(
    fc.property(
      httpUrlArb,
      briefArb,
      fc.option(inRangeBudgetArb, { nil: undefined }),
      fc.constantFrom("live", "dry-run", undefined),
      wordArb,
      (referenceUrl, brief, budgetUsd, mode, runId) => {
        const args = { referenceUrl, brief, runId: `p4-${runId}` };
        if (budgetUsd !== undefined) args.budgetUsd = budgetUsd;
        if (mode !== undefined) args.mode = mode;
        const normalized = validateDirectorInput(args);
        assert.ok(normalized.referenceUrl && normalized.brief);
        const { payload } = runVideoRemix(args);
        assert.ok(payload && typeof payload.runId === "string" && payload.runId.length > 0);
      },
    ),
    { numRuns: RUNS },
  );
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-acos-mcp-connector, Property 7: For any Director run started in Live_Mode, the observed stage start sequence is a prefix of the canonical stage contract, and no stage begins before its immediately preceding stage has reached a completed state.
// -----------------------------------------------------------------------------
test("Property 7: stage ordering invariant", () => {
  const gateSubsetArb = fc.subarray(
    ["paid-model-call", "render-action", "payment-action", "cloud-deploy"],
    { minLength: 0, maxLength: 4 },
  );
  fc.assert(
    fc.property(
      httpUrlArb,
      briefArb,
      inRangeBudgetArb,
      shotCountInRangeArb.filter((n) => n <= 20),
      wordArb,
      gateSubsetArb,
      fc.integer({ min: 0, max: 5 }),
      (referenceUrl, brief, budgetUsd, shotCount, runId, approvals, sourceN) => {
        const sourceCards = Array.from({ length: sourceN }, (_, i) => ({
          sourceId: `src-${i + 1}`,
          url: `https://example.com/s/${i + 1}`,
          evidenceLevel: "B",
        }));
        const wrapped = runDirectorWorkflow({
          referenceUrl,
          brief,
          mode: "live",
          budgetUsd,
          shotCount,
          runId: `p7-${runId}`,
          approvals,
          sourceCards,
        });
        // Prefix invariant + strict (no stage begins before predecessor completed).
        assert.equal(wrapped.workflow.ordering.ok, true, JSON.stringify(wrapped.workflow.ordering.violations));
        assert.equal(wrapped.workflow.strictOrdering.ok, true, JSON.stringify(wrapped.workflow.strictOrdering.violations));
        // Raw manifest also satisfies the prefix invariant.
        assert.equal(checkStageOrderingInvariant(wrapped.payload).ok, true);
      },
    ),
    { numRuns: RUNS },
  );
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-acos-mcp-connector, Property 8: For any stage that fails repeatedly, each retry increments retryCount by exactly 1, the backoff delay for every attempt lies within [1s, 30s] and is non-decreasing up to the cap, the total number of attempts never exceeds maxIterations, Run_State remains running while retryCount < maxIterations, and once retryCount reaches maxIterations the Run_State becomes blocked with an appended failure record { stageId, finalRetryCount, reason }.
// -----------------------------------------------------------------------------
test("Property 8: bounded-retry failure handling", () => {
  // maxIterations focused HARD on the [1,100] boundaries plus out-of-range /
  // non-integer values, via the shared boundary generator (spec task 9.4).
  fc.assert(
    fc.property(maxIterationsBoundaryArb, (rawMax) => {
      const bounded = normalizeMaxIterations(rawMax);
      assert.ok(bounded >= 1 && bounded <= 100);
      const plan = buildBoundedRetryPlan({ maxIterations: rawMax });
      // Total attempts never exceed maxIterations (== bounded).
      assert.equal(plan.schedule.length, bounded);

      let prevDelay = -1;
      plan.schedule.forEach((entry, i) => {
        // retryCount increments by exactly 1.
        assert.equal(entry.retryCount, i + 1);
        // backoff delay within [1s, 30s] and equals the pure model.
        assert.equal(entry.delayMs, computeRetryBackoffMs(i));
        assert.ok(entry.delayMs >= 1000 && entry.delayMs <= 30000);
        // non-decreasing up to the cap.
        assert.ok(entry.delayMs >= prevDelay);
        prevDelay = entry.delayMs;
        // running while retryCount < max, exhausted at the last.
        const expected = entry.retryCount < bounded ? "running" : "exhausted";
        assert.equal(entry.runState, expected);
      });

      // Exhaustion fails closed to `blocked`; below the cap it stays `running`.
      assert.equal(exhaustionRunState(bounded, bounded), "blocked");
      if (bounded > 1) assert.equal(exhaustionRunState(bounded - 1, bounded), "running");
    }),
    { numRuns: RUNS },
  );
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-acos-mcp-connector, Property 9: For any run in which cumulative Budget_Meters spend reaches or exceeds the configured budget cap mid-run, the Director records budget_exceeded, halts all further spend-bearing stages, and surfaces a budget-exceeded indication.
// -----------------------------------------------------------------------------
test("Property 9: budget cap halts spend-bearing stages", () => {
  const ALL_APPROVALS = ["paid-model-call", "render-action", "payment-action", "cloud-deploy"];
  fc.assert(
    fc.property(
      httpUrlArb,
      briefArb,
      fc.double({ min: 1, max: 1000, noNaN: true, noDefaultInfinity: true }).map((n) => Number(n.toFixed(2))),
      fc.double({ min: 0, max: 2000, noNaN: true, noDefaultInfinity: true }).map((n) => Number(n.toFixed(2))),
      wordArb,
      (referenceUrl, brief, budgetUsd, simulatedSpendUsd, runId) => {
        const { payload } = runVideoRemix({
          referenceUrl,
          brief,
          mode: "live",
          budgetUsd,
          simulatedSpendUsd,
          runId: `p9-${runId}`,
          approvals: ALL_APPROVALS,
          sourceCards: threeSources,
        });
        const expectedExceeded = budgetCapExceeded(
          normalizeCumulativeSpendUsd(simulatedSpendUsd),
          budgetUsd,
        );
        if (expectedExceeded) {
          assert.equal(payload.state, "budget_exceeded");
          assert.equal(payload.budgetMeters.budgetExceeded, true);
          const held = payload.stages.filter((s) => ["render", "publish", "checkout"].includes(s.id));
          for (const stage of held) {
            assert.equal(stage.status, "budget_held");
            assert.equal(stage.executed, false);
          }
          assert.equal(payload.render.assets.length, 0);
        } else {
          assert.notEqual(payload.state, "budget_exceeded");
          assert.equal(payload.budgetMeters.budgetExceeded, false);
        }
      },
    ),
    { numRuns: RUNS },
  );
});
