// Tests for the submission-error UX view-model (agentic-graph-acos-mcp-connector
// spec, task 7.9 / R1.8 / design Frontend `submitRun` error+timeout handling /
// design Correctness Property 32).
//
// Covers the focused behaviors the task calls out, with ZERO network calls and
// ZERO real timers (the observed elapsed time is injected):
//   1. POST /run error response -> error indication + retained inputs
//   2. no response within 30s    -> timed out + error indication + retained inputs
//   3. success within 30s        -> no error, inputs NOT retained (advance)
//   4. the 30,000 ms boundary    -> exactly 30s is on-time; 30s + 1ms times out
//   5. malformed input           -> never throws

import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveSubmissionOutcome,
  extractRetainedInputs,
  isErrorResult,
  RUN_RESPONSE_DEADLINE_MS,
  RUN_NOT_INITIATED_MESSAGE,
  SUBMISSION_STATUS,
  SUBMISSION_ERROR_CODE,
} from "../src/lib/submission-error-ux.js";

// --- Helpers ----------------------------------------------------------------

/** A representative creator submission; override individual fields per test. */
function submission(overrides = {}) {
  return {
    referenceUrl: "https://example.com/reference-video",
    brief: "Remix this reference into a 30s vertical promo.",
    budgetUsd: 12.5,
    ...overrides,
  };
}

/** A successful submitRun envelope (task 7.2 shape). */
function successResult() {
  return {
    forwarded: true,
    valid: true,
    errors: [],
    result: { runId: "run-123" },
  };
}

// --- 1. POST /run error response -> error indication + retained inputs -------

test("resolveSubmissionOutcome: a thrown transport error surfaces an error indication", () => {
  const sub = submission();
  const error = new Error("network refused");
  error.code = "run_submit_failed";

  const out = resolveSubmissionOutcome({ submission: sub, error, responseElapsedMs: 1200 });

  assert.equal(out.status, SUBMISSION_STATUS.ERROR);
  assert.equal(out.ok, false);
  assert.equal(out.advance, false);
  assert.equal(out.timedOut, false);
  assert.equal(out.errorIndication.code, SUBMISSION_ERROR_CODE.ERROR_RESPONSE);
  assert.equal(out.errorIndication.message, RUN_NOT_INITIATED_MESSAGE);
});

test("resolveSubmissionOutcome: an error response RETAINS the user's submitted inputs (R1.8)", () => {
  const sub = submission();
  const out = resolveSubmissionOutcome({
    submission: sub,
    error: new Error("boom"),
    responseElapsedMs: 500,
  });

  assert.deepEqual(out.retainedInputs, {
    referenceUrl: sub.referenceUrl,
    brief: sub.brief,
    budgetUsd: sub.budgetUsd,
  });
});

test("resolveSubmissionOutcome: a fetch-like non-2xx result is treated as an error response", () => {
  const sub = submission();
  const out = resolveSubmissionOutcome({
    submission: sub,
    result: { ok: false, status: 500 },
    responseElapsedMs: 800,
  });

  assert.equal(out.status, SUBMISSION_STATUS.ERROR);
  assert.equal(out.errorIndication.detail, "HTTP 500");
  assert.deepEqual(out.retainedInputs, {
    referenceUrl: sub.referenceUrl,
    brief: sub.brief,
    budgetUsd: sub.budgetUsd,
  });
});

test("resolveSubmissionOutcome: a valid-but-not-forwarded envelope is a failed initiation", () => {
  const out = resolveSubmissionOutcome({
    submission: submission(),
    result: { forwarded: false, valid: true, errors: [] },
    responseElapsedMs: 100,
  });

  assert.equal(out.status, SUBMISSION_STATUS.ERROR);
  assert.equal(out.advance, false);
  assert.ok(out.retainedInputs);
});

// --- 2. no response within 30s -> timed out + error + retained inputs --------

test("resolveSubmissionOutcome: no response within 30s -> timed_out + retained inputs (R1.8)", () => {
  const sub = submission();
  const out = resolveSubmissionOutcome({
    submission: sub,
    responseElapsedMs: RUN_RESPONSE_DEADLINE_MS + 5_000,
  });

  assert.equal(out.status, SUBMISSION_STATUS.TIMED_OUT);
  assert.equal(out.ok, false);
  assert.equal(out.advance, false);
  assert.equal(out.timedOut, true);
  assert.equal(out.errorIndication.code, SUBMISSION_ERROR_CODE.TIMED_OUT);
  assert.equal(out.errorIndication.message, RUN_NOT_INITIATED_MESSAGE);
  assert.deepEqual(out.retainedInputs, {
    referenceUrl: sub.referenceUrl,
    brief: sub.brief,
    budgetUsd: sub.budgetUsd,
  });
});

test("resolveSubmissionOutcome: a late response that eventually arrives still times out (R1.8)", () => {
  // A success envelope that arrives AFTER 30s is still a failed initiation.
  const out = resolveSubmissionOutcome({
    submission: submission(),
    result: successResult(),
    responseElapsedMs: RUN_RESPONSE_DEADLINE_MS + 1,
  });

  assert.equal(out.status, SUBMISSION_STATUS.TIMED_OUT);
  assert.equal(out.timedOut, true);
  assert.equal(out.advance, false);
  assert.ok(out.retainedInputs, "inputs retained even though a result arrived late");
});

// --- 3. success within 30s -> no error, inputs NOT retained (advance) --------

test("resolveSubmissionOutcome: a success within 30s advances and does NOT retain inputs", () => {
  const out = resolveSubmissionOutcome({
    submission: submission(),
    result: successResult(),
    responseElapsedMs: 1_500,
  });

  assert.equal(out.status, SUBMISSION_STATUS.SUCCESS);
  assert.equal(out.ok, true);
  assert.equal(out.advance, true);
  assert.equal(out.timedOut, false);
  assert.equal(out.errorIndication, null);
  assert.equal(out.retainedInputs, null, "inputs cleared on success (flow advances)");
});

test("resolveSubmissionOutcome: an immediate success (elapsed defaults to 0) advances", () => {
  const out = resolveSubmissionOutcome({ submission: submission(), result: successResult() });

  assert.equal(out.status, SUBMISSION_STATUS.SUCCESS);
  assert.equal(out.responseElapsedMs, 0);
  assert.equal(out.advance, true);
  assert.equal(out.retainedInputs, null);
});

// --- 4. the 30,000 ms boundary ----------------------------------------------

test("resolveSubmissionOutcome: a response at EXACTLY 30,000 ms is on-time (not timed out)", () => {
  assert.equal(RUN_RESPONSE_DEADLINE_MS, 30_000, "R1.8 window is 30 seconds");

  const out = resolveSubmissionOutcome({
    submission: submission(),
    result: successResult(),
    responseElapsedMs: RUN_RESPONSE_DEADLINE_MS,
  });

  assert.equal(out.timedOut, false, "exactly 30s is within the window");
  assert.equal(out.status, SUBMISSION_STATUS.SUCCESS);
  assert.equal(out.advance, true);
});

test("resolveSubmissionOutcome: a response at 30,000 ms + 1 ms times out", () => {
  const out = resolveSubmissionOutcome({
    submission: submission(),
    result: successResult(),
    responseElapsedMs: RUN_RESPONSE_DEADLINE_MS + 1,
  });

  assert.equal(out.timedOut, true, "one ms past the window times out");
  assert.equal(out.status, SUBMISSION_STATUS.TIMED_OUT);
});

// --- degenerate: no result, no error, within window --------------------------

test("resolveSubmissionOutcome: no result and no error within the window is a failed initiation", () => {
  const out = resolveSubmissionOutcome({ submission: submission(), responseElapsedMs: 200 });

  assert.equal(out.status, SUBMISSION_STATUS.ERROR);
  assert.equal(out.errorIndication.code, SUBMISSION_ERROR_CODE.NO_RESPONSE);
  assert.equal(out.advance, false);
  assert.ok(out.retainedInputs);
});

// --- 5. malformed input -> never throws --------------------------------------

test("resolveSubmissionOutcome: never throws for malformed/edge inputs", () => {
  const weirdArgs = [
    undefined,
    null,
    {},
    "not-an-object",
    42,
    { submission: null },
    { submission: "x", result: 1, error: 0, responseElapsedMs: "nope" },
    { submission: [], responseElapsedMs: NaN },
    { submission: { referenceUrl: 1, brief: {}, budgetUsd: [] }, responseElapsedMs: Infinity },
    { submission: submission(), responseElapsedMs: -1_000 },
    { result: { status: "weird" } },
    { error: "string error", responseElapsedMs: 10 },
  ];

  for (const args of weirdArgs) {
    assert.doesNotThrow(() => {
      const out = resolveSubmissionOutcome(args);
      // Invariants that must hold for every outcome.
      assert.ok(Object.values(SUBMISSION_STATUS).includes(out.status));
      assert.ok(Number.isFinite(out.responseElapsedMs) && out.responseElapsedMs >= 0);
      assert.equal(out.responseDeadlineMs, RUN_RESPONSE_DEADLINE_MS);
      // A failure always retains inputs; a success never does.
      if (out.ok) {
        assert.equal(out.retainedInputs, null);
        assert.equal(out.errorIndication, null);
      } else {
        assert.ok(out.retainedInputs && typeof out.retainedInputs === "object");
        assert.ok(out.errorIndication && typeof out.errorIndication.message === "string");
      }
    }, `resolveSubmissionOutcome threw for ${JSON.stringify(args)}`);
  }
});

test("resolveSubmissionOutcome: a negative injected elapsed is clamped to 0 (no spurious timeout)", () => {
  const out = resolveSubmissionOutcome({
    submission: submission(),
    result: successResult(),
    responseElapsedMs: -5,
  });
  assert.equal(out.responseElapsedMs, 0);
  assert.equal(out.timedOut, false);
  assert.equal(out.status, SUBMISSION_STATUS.SUCCESS);
});

// --- extractRetainedInputs unit checks ---------------------------------------

test("extractRetainedInputs: returns only the known submission fields", () => {
  const out = extractRetainedInputs({
    referenceUrl: "https://x.test/v",
    brief: "b",
    budgetUsd: 3,
    secretField: "should-not-leak",
    authToken: "nope",
  });
  assert.deepEqual(Object.keys(out).sort(), ["brief", "budgetUsd", "referenceUrl"]);
  assert.equal(out.referenceUrl, "https://x.test/v");
  assert.equal(out.brief, "b");
  assert.equal(out.budgetUsd, 3);
});

test("extractRetainedInputs: tolerates a non-object submission with undefined fields", () => {
  for (const bad of [undefined, null, "x", 7, []]) {
    const out = extractRetainedInputs(bad);
    assert.deepEqual(Object.keys(out).sort(), ["brief", "budgetUsd", "referenceUrl"]);
    assert.equal(out.referenceUrl, undefined);
    assert.equal(out.brief, undefined);
    assert.equal(out.budgetUsd, undefined);
  }
});

test("extractRetainedInputs: does not mutate the source submission", () => {
  const sub = submission();
  const snapshot = JSON.stringify(sub);
  extractRetainedInputs(sub);
  assert.equal(JSON.stringify(sub), snapshot);
});

// --- isErrorResult unit checks -----------------------------------------------

test("isErrorResult: classifies error and success shapes", () => {
  assert.equal(isErrorResult({ ok: false }), true);
  assert.equal(isErrorResult({ status: 404 }), true);
  assert.equal(isErrorResult({ status: 503 }), true);
  assert.equal(isErrorResult({ error: "boom" }), true);
  assert.equal(isErrorResult({ valid: true, forwarded: false }), true);

  assert.equal(isErrorResult({ ok: true, status: 200 }), false);
  assert.equal(isErrorResult({ forwarded: true, valid: true }), false);
  assert.equal(isErrorResult(null), false);
  assert.equal(isErrorResult(undefined), false);
  assert.equal(isErrorResult("x"), false);
});
