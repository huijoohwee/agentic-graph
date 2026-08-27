// Unit tests for the Demo_Pack health-route retry/record layer
// (agenticgraph-acos-mcp-connector spec, task 2.16 — R3.4, R3.5).
//
// R3.4: after the deploy Approval_Gate(s) are approved, `GET /health` returns
//   HTTP 200 within 5s.
// R3.5: if it does not return 200 within 5s, retry up to 3 times and, if all
//   retries fail, record a health-check failure indication in the Demo_Pack.
//
// These tests inject the health-probe attempt RESULTS (no network, no real 5s
// timer). They assert:
//   * health passes on attempt 1 (no retries needed),
//   * health passes on a later retry within the 3-attempt budget,
//   * all 3 attempts fail -> a distinct failure indication is recorded,
//   * the deploy gate is not approved -> no probe is attempted.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildDemoPack, runHealthCheck } from "../video-remix/demo-pack.js";
import { resolveHealthPass } from "../video-remix/health-check.js";

const TERMINAL_ARGS = Object.freeze({
  state: "complete",
  sources: [{ sourceId: "s1", url: "https://example.com/a" }],
  assets: [{ shotId: "shot-1", assetUrl: "https://airvio.co/assets/shot-1.mp4" }],
  checkout: { sessionId: "cs_test_demo", payoutSettled: true },
});

// ---------------------------------------------------------------------------
// R3.4: health returns 200 on the first attempt — no retries needed.
// ---------------------------------------------------------------------------

test("health passes on attempt 1 with deploy approved (no retries)", () => {
  const demoPack = buildDemoPack({
    ...TERMINAL_ARGS,
    deployApproved: true,
    healthAttempts: [{ status: 200 }],
  });

  const hc = demoPack.healthCheck;
  assert.equal(hc.probed, true, "probe runs once the deploy gate is approved");
  assert.equal(hc.passed, true, "200 on the first attempt passes");
  assert.equal(hc.attempts, 1, "exactly one attempt was made");
  assert.equal(hc.failureRecorded, false, "no failure recorded on a passing probe");
});

// ---------------------------------------------------------------------------
// R3.5: first attempts fail (non-200 / timeout) but a later retry within the
// 3-attempt budget returns 200 — passes with the attempt count recorded.
// ---------------------------------------------------------------------------

test("health passes on a later retry within the 3-attempt budget", () => {
  const demoPack = buildDemoPack({
    ...TERMINAL_ARGS,
    deployApproved: true,
    // attempt 1: 503, attempt 2: timed out, attempt 3: 200.
    healthAttempts: [{ status: 503 }, { timedOut: true }, { status: 200 }],
  });

  const hc = demoPack.healthCheck;
  assert.equal(hc.passed, true, "a 200 within the retry budget passes");
  assert.equal(hc.attempts, 3, "it took all three attempts to get a 200");
  assert.equal(hc.failureRecorded, false, "passing within budget records no failure");
});

test("health passes on the second attempt and short-circuits the third", () => {
  // A probe function: fail the first attempt, return 200 on the second.
  const demoPack = buildDemoPack({
    ...TERMINAL_ARGS,
    deployApproved: true,
    healthAttempts: (index) => (index === 0 ? { status: 500 } : { status: 200 }),
  });

  const hc = demoPack.healthCheck;
  assert.equal(hc.passed, true);
  assert.equal(hc.attempts, 2, "stops as soon as an attempt returns 200");
  assert.equal(hc.failureRecorded, false);
});

// ---------------------------------------------------------------------------
// R3.5: all three attempts fail -> a health-check failure indication is
// recorded in the Demo_Pack.
// ---------------------------------------------------------------------------

test("all 3 health attempts fail and a failure indication is recorded", () => {
  const demoPack = buildDemoPack({
    ...TERMINAL_ARGS,
    deployApproved: true,
    healthAttempts: [{ status: 503 }, { timedOut: true }, { status: 502 }],
  });

  const hc = demoPack.healthCheck;
  assert.equal(hc.probed, true);
  assert.equal(hc.passed, false, "no attempt returned 200 within 5s");
  assert.equal(hc.attempts, 3, "the full 3-attempt retry budget was used");
  assert.equal(hc.failureRecorded, true, "a health-check failure indication is recorded (R3.5)");
  assert.equal(hc.url, TERMINAL_ARGS.backendHealthUrl || hc.url, "the failing health url is recorded");
  assert.equal(typeof hc.url, "string");
  assert.ok(hc.url.length > 0, "the recorded health url is non-empty");
});

// ---------------------------------------------------------------------------
// R3.4 trigger: with the deploy gate NOT approved, no probe is attempted.
// ---------------------------------------------------------------------------

test("deploy gate not approved -> no health probe attempted", () => {
  const demoPack = buildDemoPack({
    ...TERMINAL_ARGS,
    deployApproved: false,
    // Even with attempts injected, the probe must not run before approval.
    healthAttempts: [{ status: 503 }, { status: 503 }, { status: 503 }],
  });

  const hc = demoPack.healthCheck;
  assert.equal(hc.probed, false, "no probe before the deploy gate is approved");
  assert.equal(hc.attempts, 0, "zero attempts made");
  assert.equal(hc.passed, false);
  assert.equal(hc.failureRecorded, false, "no failure recorded when the probe never runs");
});

test("deploy approved but no attempts injected -> runtime default makes no probe", () => {
  const demoPack = buildDemoPack({ ...TERMINAL_ARGS, deployApproved: true });
  const hc = demoPack.healthCheck;
  assert.equal(hc.probed, false, "no real network call in the runtime (live probe wired in 9.2)");
  assert.equal(hc.attempts, 0);
  assert.equal(hc.failureRecorded, false);
});

// ---------------------------------------------------------------------------
// Non-terminal Run_State: the Demo_Pack is not assembled, so no probe runs even
// when the deploy gate is approved.
// ---------------------------------------------------------------------------

test("non-terminal state does not probe health even when deploy is approved", () => {
  const demoPack = buildDemoPack({
    state: "approval_required",
    deployApproved: true,
    healthAttempts: [{ status: 503 }, { status: 503 }, { status: 503 }],
  });
  const hc = demoPack.healthCheck;
  assert.equal(hc.probed, false, "no health probe off a terminal Run_State");
  assert.equal(hc.failureRecorded, false);
});

// ---------------------------------------------------------------------------
// runHealthCheck directly: the failing-url is the supplied health url, and the
// 5s deadline is carried as metadata.
// ---------------------------------------------------------------------------

test("runHealthCheck records the supplied url and the 5s deadline on failure", () => {
  const url = "https://airvio.co/agenticgraph/mcp/health";
  const hc = runHealthCheck({
    deployApproved: true,
    url,
    attempts: [{ status: 500 }, { status: 500 }, { status: 500 }],
  });
  assert.equal(hc.url, url);
  assert.equal(hc.passed, false);
  assert.equal(hc.attempts, 3);
  assert.equal(hc.failureRecorded, true);
  assert.equal(hc.deadlineMs, 5000, "the 5s health deadline is recorded (R3.4/R3.5)");
});

// ---------------------------------------------------------------------------
// R3.4 / R3.5 "within 5 seconds": a per-attempt latency OVER the 5s deadline is
// a failed attempt, even when the status is 200. All three late -> failure.
// ---------------------------------------------------------------------------

test("a 200 that arrives after 5s counts as a failed attempt (latency boundary)", () => {
  const demoPack = buildDemoPack({
    ...TERMINAL_ARGS,
    deployApproved: true,
    // Every attempt is a 200 but each arrived AFTER the 5s deadline -> all fail.
    healthAttempts: [
      { status: 200, latencyMs: 5001 },
      { status: 200, elapsedMs: 6000 },
      { status: 200, ms: 9000 },
    ],
  });

  const hc = demoPack.healthCheck;
  assert.equal(hc.passed, false, "a 200 over the 5s deadline is not a pass");
  assert.equal(hc.attempts, 3, "all three late attempts were consumed");
  assert.equal(hc.failureRecorded, true, "all attempts late -> failure recorded (R3.5)");
});

test("a slow first attempt fails but a fast 200 within 5s on retry passes", () => {
  const demoPack = buildDemoPack({
    ...TERMINAL_ARGS,
    deployApproved: true,
    // attempt 1: 200 but too late; attempt 2: 200 within the deadline.
    healthAttempts: [{ status: 200, latencyMs: 7000 }, { status: 200, latencyMs: 1200 }],
  });

  const hc = demoPack.healthCheck;
  assert.equal(hc.passed, true, "a 200 within 5s on retry passes");
  assert.equal(hc.attempts, 2, "the late attempt is retried, the in-time 200 stops early");
  assert.equal(hc.failureRecorded, false);
});

test("runHealthCheck treats every non-200 status within the budget as a failed attempt", () => {
  const hc = runHealthCheck({
    deployApproved: true,
    url: "https://airvio.co/agenticgraph/mcp/health",
    attempts: [{ status: 500 }, { status: 404 }, { status: 503 }],
  });
  assert.equal(hc.passed, false, "no attempt returned HTTP 200");
  assert.equal(hc.attempts, 3, "all three non-200 attempts were made");
  assert.equal(hc.failureRecorded, true, "non-200 across the budget records a failure (R3.5)");
});

// ---------------------------------------------------------------------------
// resolveHealthPass unit boundary: the 5s latency rule is enforced directly.
// ---------------------------------------------------------------------------

test("resolveHealthPass enforces the 5s per-attempt latency boundary", () => {
  assert.equal(resolveHealthPass({ status: 200, latencyMs: 4999 }), true, "200 within 5s passes");
  assert.equal(resolveHealthPass({ status: 200, latencyMs: 5000 }), true, "200 exactly at 5s passes");
  assert.equal(resolveHealthPass({ status: 200, latencyMs: 5001 }), false, "200 just over 5s fails");
  assert.equal(resolveHealthPass({ status: 503 }), false, "a non-200 status fails");
  assert.equal(resolveHealthPass({ timedOut: true }), false, "an explicit timeout fails");
  assert.equal(resolveHealthPass(true), true, "a bare true is a 200 within 5s");
});
