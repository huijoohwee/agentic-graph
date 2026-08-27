// Health-route retry/record layer for Demo_Pack assembly
// (agenticgraph-acos-mcp-connector spec, task 2.16 — R3.4, R3.5).
//
// R3.4: WHEN the product is deployed and the deploy Approval_Gates are
//   approved, THE Agent_Api SHALL return HTTP 200 on its `GET /health` route
//   within 5 seconds.
// R3.5: IF `GET /health` does not return HTTP 200 within 5 seconds after the
//   deploy Approval_Gates are approved, THEN THE Director SHALL retry the
//   request up to 3 times and, if all retries fail, record a health-check
//   failure indication in the Demo_Pack.
//
// PURE and TIMER-FREE, exactly like the 2.14 reachability marking: this layer
// NEVER opens a socket and NEVER sleeps. It accepts an INJECTABLE sequence (or
// function) of health-probe attempt RESULTS, so a unit test needs no network
// and no real 5s timer. The live probe (an HTTP GET with a 5s deadline) is
// wired in integration task 9.2 and passed in here as `attempts`.
//
// Trigger rule: the probe runs ONLY after the deploy Approval_Gate(s) are
// approved (R3.4 — "WHEN ... the deploy Approval_Gates are approved"). Before
// approval — or when no probe is injected (the runtime default, no real network
// call) — no attempt is made and no failure is recorded.

import { cleanString } from "./helpers.js";

// Retry budget (R3.5 — "retry the request up to 3 times"). A passing attempt
// inside this budget short-circuits the remaining attempts.
const MAX_HEALTH_ATTEMPTS = 3;
// Per-attempt deadline (R3.4 / R3.5 — "within 5 seconds"). Metadata only: the
// model is timer-free; a real scheduler enforces this on the live probe.
const HEALTH_DEADLINE_MS = 5000;
// Default `GET /health` endpoint, kept consistent with the Demo_Pack
// `worker-health` url (demo-pack.js DEFAULT_WORKER_HEALTH_URL).
const DEFAULT_HEALTH_URL = "https://airvio.co/agenticgraph/mcp/health";

// Read a probe-reported latency (ms) from any of the accepted aliases, kept
// consistent with the 2.14 reachability resolver in demo-pack.js. Returns a
// finite number or `undefined` when the probe reported no timing.
function readLatencyMs(result) {
  for (const key of ["latencyMs", "elapsedMs", "durationMs", "ms"]) {
    const v = result[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

// Interpret a single health-probe attempt RESULT against the 5s deadline.
// Counts as a PASS ONLY when it represents an HTTP 200 that arrived WITHIN the
// deadline (R3.4 / R3.5 — "within 5 seconds"). Accepts the same flexible shapes
// as the 2.14 reachability resolver:
//   * boolean `true`  -> 200 within 5s
//   * `{ status }`    -> pass iff status === 200 (and within the deadline)
//   * `{ timedOut:true }` -> fail (no 200 within 5s)
//   * `{ latencyMs | elapsedMs | durationMs | ms }` over the deadline -> fail,
//     even for a 200 (a response that arrived too late is a timeout failure —
//     the deterministic "within 5s" boundary)
//   * `{ ok | passed | reachable: boolean }` -> that boolean
// Anything else (false / null / unknown) is treated as a FAILED attempt.
function resolveHealthPass(result, deadlineMs = HEALTH_DEADLINE_MS) {
  if (result === true) return true;
  if (result === false || result == null) return false;
  if (typeof result === "object") {
    if (result.timedOut === true) return false;
    // A reported latency over the deadline is a timeout failure, even for a
    // 200 — this enforces the "within 5s" rule per attempt (R3.4, R3.5).
    const latencyMs = readLatencyMs(result);
    if (typeof latencyMs === "number" && latencyMs > deadlineMs) return false;
    if (typeof result.status === "number") return result.status === 200;
    if (typeof result.ok === "boolean") return result.ok;
    if (typeof result.passed === "boolean") return result.passed;
    if (typeof result.reachable === "boolean") return result.reachable;
  }
  return false;
}

// Pull the result for attempt `index` from any injectable shape:
//   * a probe FUNCTION  (index, url) => boolean | { status | ok | timedOut | ... }
//   * a precomputed ARRAY of results consumed in attempt order
function attemptResultAt(attempts, index, url) {
  if (typeof attempts === "function") return attempts(index, url);
  if (Array.isArray(attempts)) return attempts[index];
  return undefined;
}

// Run the health-route retry/record layer. Returns a distinct, observable
// `healthCheck` record for the Demo_Pack:
//   { url, probed, attempts, deadlineMs, passed, failureRecorded }
// where `failureRecorded` is true ONLY when the probe ran and all (up to 3)
// attempts failed to return HTTP 200 within 5s (R3.5). On a passing attempt
// inside the budget, `passed:true` with the 1-based attempt count is recorded.
function runHealthCheck({ deployApproved = false, url, attempts } = {}) {
  const healthUrl = cleanString(url, DEFAULT_HEALTH_URL);

  // R3.4 trigger: no probe before the deploy Approval_Gate(s) are approved, and
  // no probe when none is injected (runtime default — no real network call).
  if (deployApproved !== true || attempts == null) {
    return {
      url: healthUrl,
      probed: false,
      attempts: 0,
      deadlineMs: HEALTH_DEADLINE_MS,
      passed: false,
      failureRecorded: false,
    };
  }

  let made = 0;
  let passed = false;
  for (let i = 0; i < MAX_HEALTH_ATTEMPTS; i += 1) {
    made += 1;
    if (resolveHealthPass(attemptResultAt(attempts, i, healthUrl))) {
      passed = true;
      break;
    }
  }

  return {
    url: healthUrl,
    probed: true,
    attempts: made,
    deadlineMs: HEALTH_DEADLINE_MS,
    passed,
    // R3.5: all (up to 3) attempts failed -> record a health-check failure.
    failureRecorded: !passed,
  };
}

export {
  runHealthCheck,
  resolveHealthPass,
  MAX_HEALTH_ATTEMPTS,
  HEALTH_DEADLINE_MS,
  DEFAULT_HEALTH_URL,
};
