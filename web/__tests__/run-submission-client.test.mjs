// Tests for the `POST /run` submission client (agenticgraph-acos-mcp-connector spec,
// task 7.2 / R1.1, R15 caller side / design Frontend `submitRun` /
// Correctness Property 5).
//
// Covers the focused behaviors the task calls out, with ZERO live network calls
// (the transport is an injectable seam; the elapsed signal is injected):
//   1. a VALID submission forwards EXACTLY ONCE via the injectable transport,
//      carrying `Authorization: Bearer <token>` + a JSON body of the validated
//      submission
//   2. the 2,000 ms forward-deadline metadata + a past-deadline flag for a slow
//      forward
//   3. an INVALID submission does NOT forward (no transport call) and surfaces
//      structured field errors (Property 5 / R1.2 reuse of guardedSubmit)
//   4. no secret / model provider key is attached beyond the supplied Auth_Token

import test from "node:test";
import assert from "node:assert/strict";

import {
  submitRun,
  buildRunSubmitHttpRequest,
  buildAuthHeader,
  RUN_SUBMIT_DEADLINE_MS,
  RUN_SUBMIT_PATH,
  RUN_SUBMIT_METHOD,
} from "../src/lib/run-submission-client.js";

// --- Helpers ----------------------------------------------------------------

/** A minimal fully-valid submission; override individual fields per test. */
function validSubmission(overrides = {}) {
  return {
    referenceUrl: "https://example.com/reference-video",
    brief: "Remix this reference into a 30s vertical promo.",
    budgetUsd: 12.5,
    ...overrides,
  };
}

/** A transport spy that records each call and returns a canned response. */
function spyTransport(response = { runId: "run-123" }) {
  const calls = [];
  const transport = async (req) => {
    calls.push(req);
    return response;
  };
  return { transport, calls };
}

const AUTH_TOKEN = "auth.token.value-xyz";

// --- 1. Valid submission forwards exactly once with Bearer + JSON body -------

test("submitRun: a valid submission forwards EXACTLY ONCE via the injectable transport", async () => {
  const { transport, calls } = spyTransport();

  const res = await submitRun(
    { submission: validSubmission(), authToken: AUTH_TOKEN },
    { transport },
  );

  assert.equal(res.forwarded, true);
  assert.equal(res.valid, true);
  assert.deepEqual(res.errors, []);
  assert.equal(calls.length, 1, "forwarded exactly once (R1.1 / Property 5)");
  assert.equal(res.result.runId, "run-123");
});

test("submitRun: the forwarded request attaches Authorization: Bearer <token>", async () => {
  const { transport, calls } = spyTransport();

  await submitRun({ submission: validSubmission(), authToken: AUTH_TOKEN }, { transport });

  const req = calls[0];
  assert.equal(req.method, RUN_SUBMIT_METHOD);
  assert.equal(req.url, RUN_SUBMIT_PATH);
  assert.equal(req.headers.authorization, `Bearer ${AUTH_TOKEN}`, "R15 caller side");
});

test("submitRun: the forwarded body is the validated submission as JSON fields", async () => {
  const { transport, calls } = spyTransport();
  const submission = validSubmission();

  await submitRun({ submission, authToken: AUTH_TOKEN }, { transport });

  const req = calls[0];
  assert.equal(req.headers["content-type"], "application/json");
  assert.deepEqual(req.body, {
    referenceUrl: submission.referenceUrl,
    brief: submission.brief,
    budgetUsd: submission.budgetUsd,
  });
});

test("submitRun: approvals[] is forwarded unchanged on an approval-gated re-submit", async () => {
  const { transport, calls } = spyTransport();
  const approvals = ["paid-model-call", "render-action"];

  await submitRun(
    { submission: validSubmission(), authToken: AUTH_TOKEN, approvals },
    { transport },
  );

  assert.deepEqual(calls[0].body.approvals, approvals);
});

// --- 2. 2,000 ms forward-deadline metadata + past-deadline flag --------------

test("submitRun: the forward-deadline metadata is 2000ms and within-deadline by default", async () => {
  const { transport } = spyTransport();

  const res = await submitRun({ submission: validSubmission(), authToken: AUTH_TOKEN }, { transport });

  assert.equal(RUN_SUBMIT_DEADLINE_MS, 2000, "R1.1 deadline is 2,000 ms");
  assert.equal(res.submitDeadlineMs, 2000);
  // Synchronous deterministic seam forwards immediately -> within the window.
  assert.equal(res.submitElapsedMs, 0);
  assert.equal(res.submitWithinDeadline, true);
});

test("submitRun: a forward exactly at the 2000ms deadline is still within-deadline", async () => {
  const { transport } = spyTransport();

  const res = await submitRun(
    { submission: validSubmission(), authToken: AUTH_TOKEN },
    { transport, submitElapsedMs: RUN_SUBMIT_DEADLINE_MS },
  );

  assert.equal(res.submitElapsedMs, 2000);
  assert.equal(res.submitWithinDeadline, true);
});

test("submitRun: an injected slow forward beyond 2000ms is flagged past-deadline", async () => {
  const { transport, calls } = spyTransport();

  const res = await submitRun(
    { submission: validSubmission(), authToken: AUTH_TOKEN },
    { transport, submitElapsedMs: RUN_SUBMIT_DEADLINE_MS + 1 },
  );

  assert.equal(calls.length, 1, "the submission is still forwarded once");
  assert.equal(res.submitElapsedMs, 2001);
  assert.equal(res.submitWithinDeadline, false, "past the 2,000 ms deadline (R1.1)");
  assert.equal(res.submitDeadlineMs, 2000);
});

// --- 3. Invalid submission does NOT forward ----------------------------------

test("submitRun: an invalid submission does NOT forward (no transport call)", async () => {
  const { transport, calls } = spyTransport();

  const res = await submitRun(
    { submission: { referenceUrl: "", brief: "", budgetUsd: 0 }, authToken: AUTH_TOKEN },
    { transport },
  );

  assert.equal(res.forwarded, false, "no POST /run forward on any violation (R1.2 / Property 5)");
  assert.equal(res.valid, false);
  assert.equal(calls.length, 0, "the transport seam was never invoked");
  assert.ok(res.errors.length >= 1);
  assert.ok(res.errors.some((e) => e.field === "referenceUrl"));
  assert.ok(res.errors.some((e) => e.field === "brief"));
  assert.ok(res.errors.some((e) => e.field === "budgetUsd"));
});

test("submitRun: a single invalid field still blocks the forward", async () => {
  const { transport, calls } = spyTransport();

  const res = await submitRun(
    { submission: validSubmission({ budgetUsd: 1_000_000 }), authToken: AUTH_TOKEN },
    { transport },
  );

  assert.equal(res.forwarded, false);
  assert.equal(calls.length, 0);
  assert.ok(res.errors.some((e) => e.field === "budgetUsd"));
});

// --- 4. No secret / model key beyond the supplied Auth_Token -----------------

test("submitRun: no secret or model provider key is attached beyond the Auth_Token", async () => {
  const { transport, calls } = spyTransport();

  await submitRun({ submission: validSubmission(), authToken: AUTH_TOKEN }, { transport });

  const req = calls[0];
  const headerKeys = Object.keys(req.headers).map((k) => k.toLowerCase());
  // Only transport headers + the single Bearer Authorization are allowed.
  assert.deepEqual(headerKeys.sort(), ["accept", "authorization", "content-type"]);

  // Defensive: no HEADER smells like a provider/secret key (the JSON body is
  // the user-supplied submission and may legitimately contain arbitrary text,
  // so secret scanning is scoped to headers + the auth value).
  const headerBlob = JSON.stringify(req.headers).toLowerCase();
  for (const forbidden of [
    "api_key",
    "apikey",
    "api-key",
    "x-api-key",
    "secret",
    "byteplus",
    "modelark",
    "signing",
    "private_key",
  ]) {
    assert.ok(!headerBlob.includes(forbidden), `headers must not contain "${forbidden}"`);
  }

  // The body carries ONLY the three validated submission fields — nothing else
  // (no secret/model key smuggled into the request body).
  assert.deepEqual(Object.keys(req.body).sort(), ["brief", "budgetUsd", "referenceUrl"]);

  // The Authorization header carries ONLY the caller-supplied Auth_Token.
  assert.equal(req.headers.authorization, `Bearer ${AUTH_TOKEN}`);
});

// --- buildAuthHeader / buildRunSubmitHttpRequest unit checks -----------------

test("buildAuthHeader: returns a Bearer header for a non-empty token", () => {
  assert.deepEqual(buildAuthHeader("abc"), { authorization: "Bearer abc" });
});

test("buildAuthHeader: returns no header for a missing/empty token (Agent_Api 401s)", () => {
  for (const bad of [undefined, null, "", 123, {}]) {
    assert.deepEqual(buildAuthHeader(bad), {});
  }
});

test("submitRun: a missing Auth_Token forwards without an Authorization header (server 401s)", async () => {
  const { transport, calls } = spyTransport();

  const res = await submitRun({ submission: validSubmission() }, { transport });

  assert.equal(res.forwarded, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.authorization, undefined);
});

test("buildRunSubmitHttpRequest: honors a custom endpoint and omits Authorization when no token", () => {
  const req = buildRunSubmitHttpRequest(validSubmission(), { endpoint: "https://api.example.com/run" });
  assert.equal(req.url, "https://api.example.com/run");
  assert.equal(req.method, "POST");
  assert.equal(req.headers.authorization, undefined);
});

test("buildRunSubmitHttpRequest: includes approvals[] when provided", () => {
  const approvals = ["paid-model-call"];
  const req = buildRunSubmitHttpRequest(validSubmission(), { approvals });
  assert.deepEqual(req.body.approvals, approvals);
});

test("submitRun: a non-object submission is rejected and does not forward", async () => {
  const { transport, calls } = spyTransport();
  const res = await submitRun({ submission: null, authToken: AUTH_TOKEN }, { transport });
  assert.equal(res.valid, false);
  assert.equal(res.forwarded, false);
  assert.equal(calls.length, 0);
});
