// Tests for the 503 polling-fallback driver (agentic-graph-acos-mcp-connector spec,
// task 7.11 / R13.5 / design Property 32 area + Error Handling "Agent_Api
// saturation → Frontend polls GET /runs/{id} every 5s up to 12 attempts").
//
// Covers the focused behaviors the task calls out, with ZERO live network calls
// and ZERO real timers (the poll + the 5,000 ms wait are both injectable seams):
//   1. the FIRST confirmed non-503 resumes immediately (no further polls)
//   2. repeated 503s poll up to 12 attempts, then exhaust
//   3. the 5s interval + 12-attempt-cap metadata is structural
//   4. a non-503 MID-sequence resumes on that attempt
//   5. MALFORMED / thrown outcomes never throw (fail-closed keep-polling)
//   6. request shape: GET /runs/{id} + Bearer Auth_Token, no secret leak
//   7. an invalid runId short-circuits with an error indication, no polls

import test from "node:test";
import assert from "node:assert/strict";

import {
  pollRunStatusFallback,
  parsePollStatus,
  isServiceUnavailable,
  buildRunStatusRequest,
  POLL_INTERVAL_MS,
  MAX_POLL_ATTEMPTS,
  SERVICE_UNAVAILABLE_STATUS,
  RUN_STATUS_METHOD,
} from "../src/lib/run-poll-fallback.js";

// --- Helpers ----------------------------------------------------------------

const AUTH_TOKEN = "auth.token.value-xyz";
const RUN_ID = "run-abc-123";

/**
 * A poll seam that returns a scripted sequence of outcomes (one per attempt),
 * recording each request + advance wait. Outcomes past the script length repeat
 * the final scripted value.
 */
function scriptedPoll(sequence) {
  const calls = [];
  const poll = async (req, attempt) => {
    calls.push({ req, attempt });
    const idx = Math.min(attempt - 1, sequence.length - 1);
    return sequence[idx];
  };
  return { poll, calls };
}

/** An `advance` seam recorder — records each (ms, attempt) wait, no real timer. */
function advanceRecorder() {
  const waits = [];
  const advance = async (ms, attempt) => {
    waits.push({ ms, attempt });
  };
  return { advance, waits };
}

// --- 1. First confirmed non-503 resumes immediately -------------------------

test("pollRunStatusFallback: a first-attempt non-503 resumes immediately with no further polls", async () => {
  const { poll, calls } = scriptedPoll([200]);
  const { advance, waits } = advanceRecorder();

  const res = await pollRunStatusFallback({ runId: RUN_ID, authToken: AUTH_TOKEN }, { poll, advance });

  assert.equal(res.resumed, true, "resumes on the first non-503 (R13.5)");
  assert.equal(res.exhausted, false);
  assert.equal(res.attempts, 1, "exactly one poll");
  assert.equal(res.finalStatus, 200);
  assert.equal(calls.length, 1, "no further polls after recovery");
  assert.equal(waits.length, 1, "one 5,000 ms wait preceded the single poll");
  assert.equal(res.errorIndication, null);
});

test("pollRunStatusFallback: a non-503 error status (e.g. 404) still resumes (any confirmed non-503)", async () => {
  const { poll, calls } = scriptedPoll([404]);

  const res = await pollRunStatusFallback({ runId: RUN_ID }, { poll });

  assert.equal(res.resumed, true, "503 is the ONLY status that keeps polling");
  assert.equal(res.finalStatus, 404);
  assert.equal(calls.length, 1);
});

// --- 2. Repeated 503s poll up to 12 then exhaust ----------------------------

test("pollRunStatusFallback: 12 consecutive 503s exhaust the budget after exactly 12 polls", async () => {
  const { poll, calls } = scriptedPoll([503]);
  const { advance, waits } = advanceRecorder();

  const res = await pollRunStatusFallback({ runId: RUN_ID }, { poll, advance });

  assert.equal(res.resumed, false);
  assert.equal(res.exhausted, true, "no non-503 after 12 polls → exhausted (R13.5)");
  assert.equal(res.attempts, MAX_POLL_ATTEMPTS);
  assert.equal(calls.length, 12, "exactly 12 polls, no 13th");
  assert.equal(waits.length, 12, "one 5,000 ms wait per attempt");
  assert.equal(res.finalStatus, null);
  assert.equal(res.errorIndication.code, "poll_fallback_exhausted");
  assert.equal(res.history.length, 12);
  assert.ok(res.history.every((h) => h.status === SERVICE_UNAVAILABLE_STATUS));
});

// --- 3. 5s interval + 12-attempt cap metadata -------------------------------

test("pollRunStatusFallback: surfaces the 5,000 ms interval and 12-attempt cap metadata", async () => {
  const { poll } = scriptedPoll([503]);
  const { advance, waits } = advanceRecorder();

  const res = await pollRunStatusFallback({ runId: RUN_ID }, { poll, advance });

  assert.equal(POLL_INTERVAL_MS, 5000, "R13.5 interval is 5,000 ms");
  assert.equal(MAX_POLL_ATTEMPTS, 12, "R13.5 cap is 12 attempts");
  assert.equal(res.pollIntervalMs, 5000);
  assert.equal(res.maxAttempts, 12);
  assert.deepEqual(res.waits, new Array(12).fill(5000), "every recorded wait is 5,000 ms");
  assert.ok(waits.every((w) => w.ms === 5000), "the advance seam is always called with 5,000 ms");
});

test("pollRunStatusFallback: a maxAttempts override is clamped to the 12-attempt contract cap", async () => {
  const { poll, calls } = scriptedPoll([503]);

  const res = await pollRunStatusFallback({ runId: RUN_ID }, { poll, maxAttempts: 999 });

  assert.equal(res.maxAttempts, MAX_POLL_ATTEMPTS, "cannot exceed the 12-attempt cap");
  assert.equal(calls.length, 12);
});

// --- 4. A non-503 mid-sequence resumes --------------------------------------

test("pollRunStatusFallback: a non-503 mid-sequence resumes on that attempt and stops", async () => {
  // 503, 503, 503, then 200 on attempt 4.
  const { poll, calls } = scriptedPoll([503, 503, 503, 200, 200]);

  const res = await pollRunStatusFallback({ runId: RUN_ID }, { poll });

  assert.equal(res.resumed, true);
  assert.equal(res.exhausted, false);
  assert.equal(res.attempts, 4, "resumes on the first non-503 (attempt 4)");
  assert.equal(res.finalStatus, 200);
  assert.equal(calls.length, 4, "no polls after recovery");
  assert.deepEqual(
    res.history.map((h) => h.status),
    [503, 503, 503, 200],
  );
});

// --- 5. Malformed / thrown outcomes never throw -----------------------------

test("pollRunStatusFallback: a malformed outcome is fail-closed (keeps polling), never throws", async () => {
  // Unparseable junk for attempts 1..3, then a real 200 on attempt 4.
  const { poll } = scriptedPoll([{ nope: true }, "weird", null, 200]);

  const res = await pollRunStatusFallback({ runId: RUN_ID }, { poll });

  assert.equal(res.resumed, true, "a malformed outcome is NOT a confirmed non-503, so polling continues");
  assert.equal(res.attempts, 4);
  assert.equal(res.finalStatus, 200);
  assert.deepEqual(
    res.history.map((h) => h.status),
    [null, null, null, 200],
    "malformed outcomes record status null",
  );
});

test("pollRunStatusFallback: a thrown poll is absorbed (status null) and the loop continues, never throws", async () => {
  let attempts = 0;
  const poll = async () => {
    attempts += 1;
    if (attempts < 3) throw new Error("transient network blip");
    return 200;
  };

  const res = await pollRunStatusFallback({ runId: RUN_ID }, { poll });

  assert.equal(res.resumed, true);
  assert.equal(res.attempts, 3, "two thrown polls absorbed, then recovery");
  assert.deepEqual(
    res.history.map((h) => h.status),
    [null, null, 200],
  );
});

test("pollRunStatusFallback: all-malformed outcomes exhaust without ever throwing", async () => {
  const { poll } = scriptedPoll([undefined]);

  await assert.doesNotReject(async () => {
    const res = await pollRunStatusFallback({ runId: RUN_ID }, { poll });
    assert.equal(res.exhausted, true);
    assert.equal(res.resumed, false);
    assert.equal(res.attempts, 12);
  });
});

test("pollRunStatusFallback: a misbehaving advance seam never breaks the loop", async () => {
  const { poll } = scriptedPoll([200]);
  const advance = async () => {
    throw new Error("timer seam exploded");
  };

  const res = await pollRunStatusFallback({ runId: RUN_ID }, { poll, advance });

  assert.equal(res.resumed, true, "a thrown advance is swallowed (best-effort wait)");
  assert.equal(res.finalStatus, 200);
});

// --- 6. Request shape: GET /runs/{id} + Bearer token, no secret leak --------

test("pollRunStatusFallback: polls GET /runs/{id} with an Authorization: Bearer token", async () => {
  const { poll, calls } = scriptedPoll([200]);

  const res = await pollRunStatusFallback({ runId: RUN_ID, authToken: AUTH_TOKEN }, { poll });

  const req = calls[0].req;
  assert.equal(req.method, RUN_STATUS_METHOD);
  assert.equal(req.method, "GET");
  assert.equal(req.url, `/runs/${RUN_ID}`, "the run id is substituted into the path");
  assert.equal(req.headers.authorization, `Bearer ${AUTH_TOKEN}`, "R15 caller side");
  assert.equal(res.request.url, `/runs/${RUN_ID}`);
});

test("buildRunStatusRequest: encodes the run id and omits Authorization with no token", () => {
  const req = buildRunStatusRequest("run/with space");
  assert.equal(req.url, "/runs/run%2Fwith%20space");
  assert.equal(req.method, "GET");
  assert.equal(req.headers.authorization, undefined);
});

test("buildRunStatusRequest: no secret or model provider key beyond the Auth_Token", () => {
  const req = buildRunStatusRequest(RUN_ID, { authToken: AUTH_TOKEN });
  const headerKeys = Object.keys(req.headers).map((k) => k.toLowerCase());
  assert.deepEqual(headerKeys.sort(), ["accept", "authorization"]);

  const blob = JSON.stringify(req).toLowerCase();
  for (const forbidden of [
    "api_key",
    "apikey",
    "x-api-key",
    "secret",
    "byteplus",
    "modelark",
    "signing",
    "private_key",
  ]) {
    assert.ok(!blob.includes(forbidden), `request must not contain "${forbidden}"`);
  }
  assert.equal(req.body, undefined, "a GET poll carries no body");
});

test("buildRunStatusRequest: honors a custom endpoint template", () => {
  const req = buildRunStatusRequest(RUN_ID, { endpoint: "https://api.example.com/status/{id}" });
  assert.equal(req.url, `https://api.example.com/status/${RUN_ID}`);
});

// --- 7. Invalid runId short-circuits, no polls ------------------------------

test("pollRunStatusFallback: a blank runId short-circuits with an error and never polls", async () => {
  const { poll, calls } = scriptedPoll([200]);
  const { advance, waits } = advanceRecorder();

  const res = await pollRunStatusFallback({ runId: "   " }, { poll, advance });

  assert.equal(calls.length, 0, "no poll without a valid run id");
  assert.equal(waits.length, 0, "no wait either");
  assert.equal(res.resumed, false);
  assert.equal(res.exhausted, false);
  assert.equal(res.attempts, 0);
  assert.equal(res.request, null);
  assert.equal(res.errorIndication.code, "invalid_run_id");
});

// --- Pure helpers -----------------------------------------------------------

test("parsePollStatus: tolerates bare numbers, Response-like, statusCode, and malformed shapes", () => {
  assert.equal(parsePollStatus(503), 503);
  assert.equal(parsePollStatus({ status: 200 }), 200);
  assert.equal(parsePollStatus({ statusCode: 404 }), 404);
  assert.equal(parsePollStatus(200.9), 200, "truncates to integer");
  for (const bad of [null, undefined, "200", {}, { status: "x" }, NaN, Infinity]) {
    assert.equal(parsePollStatus(bad), null, `malformed: ${JSON.stringify(bad)}`);
  }
});

test("isServiceUnavailable: true only for a confirmed 503", () => {
  assert.equal(isServiceUnavailable(503), true);
  assert.equal(isServiceUnavailable({ status: 503 }), true);
  assert.equal(SERVICE_UNAVAILABLE_STATUS, 503);
  for (const other of [200, 404, 500, 502, 504, null, "503", {}]) {
    assert.equal(isServiceUnavailable(other), false, `not 503: ${JSON.stringify(other)}`);
  }
});
