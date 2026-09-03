// Tests for the approval-decision transmission client (agentic-graph-acos-mcp-connector
// spec, task 7.7 / R13.2, R13.3 / design Frontend `renderApprovalPrompts`).
//
// Covers the focused behaviors the task calls out, with ZERO live network calls
// (the transport is an injectable seam; the elapsed/response signals are
// injected; there are NO real timers):
//   1. a SUCCESSFUL transmit within 2s → succeeded, transmitted, in-deadline,
//      prompt NOT retained, no error
//   2. a transmit FAILURE → prompt retained + error indication + a retry allowed
//   3. NO success within 10s → timedOut, prompt retained, error, retry allowed
//   4. the retry budget caps at 3 (a 4th retry / 5th attempt is not allowed)
//   5. the 2s / 10s deadline-window metadata flags
//   6. request shape: Bearer Auth_Token + gateId/decision body, no secret leak
//   7. invalid decisions never transmit

import test from "node:test";
import assert from "node:assert/strict";

import {
  transmitApprovalDecision,
  buildApprovalDecisionRequest,
  isValidDecision,
  APPROVAL_TRANSMIT_DEADLINE_MS,
  APPROVAL_RESPONSE_TIMEOUT_MS,
  MAX_APPROVAL_RETRIES,
  APPROVAL_DECISION_PATH,
  APPROVAL_DECISION_METHOD,
} from "../src/lib/approval-decision-client.js";

// --- Helpers ----------------------------------------------------------------

const AUTH_TOKEN = "auth.token.value-xyz";

/** A transport spy that records each call and returns a canned response. */
function spyTransport(response = { ok: true }) {
  const calls = [];
  const transport = async (req) => {
    calls.push(req);
    return response;
  };
  return { transport, calls };
}

/** A transport that always rejects, modelling a transport failure. */
function failingTransport(err = new Error("network down")) {
  const calls = [];
  const transport = async (req) => {
    calls.push(req);
    throw err;
  };
  return { transport, calls };
}

function validArgs(overrides = {}) {
  return { gateId: "payment-action", decision: "approved", authToken: AUTH_TOKEN, ...overrides };
}

// --- 1. Successful transmit within 2s ---------------------------------------

test("transmitApprovalDecision: a successful transmit within 2s succeeds and transmits exactly once", async () => {
  const { transport, calls } = spyTransport();

  const res = await transmitApprovalDecision(validArgs(), { transport });

  assert.equal(res.succeeded, true);
  assert.equal(res.transmitted, true);
  assert.equal(res.transmitWithinDeadline, true, "within the 2,000 ms deadline (R13.2)");
  assert.equal(res.timedOut, false);
  assert.equal(res.promptRetained, false, "a successful decision retires the prompt");
  assert.equal(res.errorIndication, null);
  assert.equal(calls.length, 1, "transmitted exactly once (R13.2)");
});

test("transmitApprovalDecision: a transmit exactly at the 2000ms deadline is still within-deadline", async () => {
  const { transport } = spyTransport();

  const res = await transmitApprovalDecision(validArgs(), {
    transport,
    transmitElapsedMs: APPROVAL_TRANSMIT_DEADLINE_MS,
  });

  assert.equal(res.transmitElapsedMs, 2000);
  assert.equal(res.transmitWithinDeadline, true);
  assert.equal(res.succeeded, true);
});

test("transmitApprovalDecision: a transmit beyond 2000ms is flagged past-deadline but still transmits", async () => {
  const { transport, calls } = spyTransport();

  const res = await transmitApprovalDecision(validArgs(), {
    transport,
    transmitElapsedMs: APPROVAL_TRANSMIT_DEADLINE_MS + 1,
  });

  assert.equal(calls.length, 1);
  assert.equal(res.transmitElapsedMs, 2001);
  assert.equal(res.transmitWithinDeadline, false, "past the 2,000 ms deadline (R13.2)");
  assert.equal(res.transmitDeadlineMs, 2000);
});

// --- 2. Transmit failure → prompt retained + error + retry allowed ----------

test("transmitApprovalDecision: a transport failure retains the prompt, surfaces an error, allows a retry", async () => {
  const { transport, calls } = failingTransport();

  const res = await transmitApprovalDecision(validArgs(), { transport });

  assert.equal(calls.length, 1, "the seam was invoked once before failing");
  assert.equal(res.succeeded, false);
  assert.equal(res.transmitted, false);
  assert.equal(res.promptRetained, true, "the pending prompt is retained (R13.3)");
  assert.ok(res.errorIndication, "an error indication is surfaced (R13.3)");
  assert.equal(res.timedOut, false);
  assert.equal(res.retryAllowed, true, "a retry is allowed (R13.3)");
  assert.equal(res.retriesRemaining, MAX_APPROVAL_RETRIES, "3 retries remain after attempt 1");
});

test("transmitApprovalDecision: the failure error indication carries the transport error code", async () => {
  const err = new Error("boom");
  err.code = "econnreset";
  const { transport } = failingTransport(err);

  const res = await transmitApprovalDecision(validArgs(), { transport });

  assert.equal(res.errorIndication.code, "econnreset");
  assert.match(res.errorIndication.message, /boom/);
});

// --- 3. No success within 10s → timed out, prompt retained, retry allowed ---

test("transmitApprovalDecision: no success within 10s is a timeout, retains the prompt, allows a retry", async () => {
  const { transport, calls } = spyTransport();

  const res = await transmitApprovalDecision(validArgs(), {
    transport,
    responseElapsedMs: APPROVAL_RESPONSE_TIMEOUT_MS + 1,
  });

  assert.equal(calls.length, 1);
  assert.equal(res.timedOut, true, "no success within 10,000 ms is a timeout (R13.3)");
  assert.equal(res.succeeded, false);
  assert.equal(res.promptRetained, true, "the pending prompt is retained (R13.3)");
  assert.ok(res.errorIndication, "an error indication is surfaced (R13.3)");
  assert.equal(res.errorIndication.code, "approval_response_timeout");
  assert.equal(res.retryAllowed, true);
  assert.equal(res.responseTimeoutMs, 10000);
});

test("transmitApprovalDecision: a response exactly at the 10000ms window is NOT a timeout (success)", async () => {
  const { transport } = spyTransport();

  const res = await transmitApprovalDecision(validArgs(), {
    transport,
    responseElapsedMs: APPROVAL_RESPONSE_TIMEOUT_MS,
  });

  assert.equal(res.responseElapsedMs, 10000);
  assert.equal(res.timedOut, false, "exactly at the boundary is in-window");
  assert.equal(res.succeeded, true);
  assert.equal(res.promptRetained, false);
});

// --- 4. Retry budget caps at 3 (4th retry / 5th attempt not allowed) --------

test("transmitApprovalDecision: retries remaining decrease as the attempt number rises", async () => {
  const { transport } = failingTransport();

  const expected = [
    [1, MAX_APPROVAL_RETRIES], // attempt 1 → 3 retries remain
    [2, 2],
    [3, 1],
    [4, 0], // attempt 4 is the 3rd (last) retry → none remain after it
  ];
  for (const [attempt, retriesRemaining] of expected) {
    const res = await transmitApprovalDecision(validArgs(), { transport, attempt });
    assert.equal(res.retriesRemaining, retriesRemaining, `attempt ${attempt}`);
    assert.equal(res.retryAllowed, retriesRemaining > 0, `attempt ${attempt} retryAllowed`);
  }
});

test("transmitApprovalDecision: a 5th attempt (4th retry) is refused and does NOT transmit", async () => {
  const { transport, calls } = spyTransport();

  const res = await transmitApprovalDecision(validArgs(), { transport, attempt: MAX_APPROVAL_RETRIES + 2 });

  assert.equal(calls.length, 0, "no transmission once the retry budget is exhausted (R13.3)");
  assert.equal(res.transmitted, false);
  assert.equal(res.succeeded, false);
  assert.equal(res.promptRetained, true, "the prompt is still retained");
  assert.equal(res.retryAllowed, false, "no further retries allowed beyond 3");
  assert.equal(res.retriesRemaining, 0);
  assert.equal(res.errorIndication.code, "retry_budget_exhausted");
});

// --- 5. Deadline-window metadata flags --------------------------------------

test("transmitApprovalDecision: surfaces the 2s transmit deadline and 10s response window metadata", async () => {
  const { transport } = spyTransport();

  const res = await transmitApprovalDecision(validArgs(), { transport });

  assert.equal(APPROVAL_TRANSMIT_DEADLINE_MS, 2000, "R13.2 deadline is 2,000 ms");
  assert.equal(APPROVAL_RESPONSE_TIMEOUT_MS, 10000, "R13.3 window is 10,000 ms");
  assert.equal(res.transmitDeadlineMs, 2000);
  assert.equal(res.responseTimeoutMs, 10000);
  assert.equal(res.transmitElapsedMs, 0, "synchronous deterministic seam");
  assert.equal(res.responseElapsedMs, 0);
});

// --- 6. Request shape: Bearer Auth_Token + gateId/decision; no secret leak ---

test("transmitApprovalDecision: attaches Authorization: Bearer <token> and a gateId/decision body", async () => {
  const { transport, calls } = spyTransport();

  await transmitApprovalDecision(validArgs(), { transport });

  const req = calls[0];
  assert.equal(req.method, APPROVAL_DECISION_METHOD);
  assert.equal(req.url, APPROVAL_DECISION_PATH);
  assert.equal(req.headers.authorization, `Bearer ${AUTH_TOKEN}`, "R15 caller side");
  assert.deepEqual(req.body, { gateId: "payment-action", decision: "approved" });
});

test("transmitApprovalDecision: no secret or model provider key beyond the Auth_Token", async () => {
  const { transport, calls } = spyTransport();

  await transmitApprovalDecision(validArgs(), { transport });

  const req = calls[0];
  const headerKeys = Object.keys(req.headers).map((k) => k.toLowerCase());
  assert.deepEqual(headerKeys.sort(), ["accept", "authorization", "content-type"]);

  const headerBlob = JSON.stringify(req.headers).toLowerCase();
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
    assert.ok(!headerBlob.includes(forbidden), `headers must not contain "${forbidden}"`);
  }
  assert.deepEqual(Object.keys(req.body).sort(), ["decision", "gateId"]);
});

test("buildApprovalDecisionRequest: honors a custom endpoint and omits Authorization with no token", () => {
  const req = buildApprovalDecisionRequest(
    { gateId: "render-action", decision: "rejected" },
    { endpoint: "https://api.example.com/approvals" },
  );
  assert.equal(req.url, "https://api.example.com/approvals");
  assert.equal(req.method, "POST");
  assert.equal(req.headers.authorization, undefined);
  assert.deepEqual(req.body, { gateId: "render-action", decision: "rejected" });
});

// --- 7. Invalid decisions never transmit ------------------------------------

test("isValidDecision: only 'approved' and 'rejected' are valid", () => {
  assert.equal(isValidDecision("approved"), true);
  assert.equal(isValidDecision("rejected"), true);
  for (const bad of ["pending", "", "APPROVED", null, undefined, 1, {}]) {
    assert.equal(isValidDecision(bad), false);
  }
});

test("transmitApprovalDecision: an invalid decision does NOT transmit and surfaces a field error", async () => {
  const { transport, calls } = spyTransport();

  const res = await transmitApprovalDecision(validArgs({ decision: "maybe" }), { transport });

  assert.equal(calls.length, 0, "no transmission for an invalid decision");
  assert.equal(res.transmitted, false);
  assert.equal(res.succeeded, false);
  assert.equal(res.promptRetained, true, "the prompt is retained so the creator can correct");
  assert.equal(res.errorIndication.code, "invalid_decision");
});

test("transmitApprovalDecision: a blank gateId does NOT transmit", async () => {
  const { transport, calls } = spyTransport();

  const res = await transmitApprovalDecision(validArgs({ gateId: "   " }), { transport });

  assert.equal(calls.length, 0);
  assert.equal(res.transmitted, false);
  assert.equal(res.errorIndication.code, "invalid_decision");
});

test("transmitApprovalDecision: a missing Auth_Token still transmits (Agent_Api then 401s)", async () => {
  const { transport, calls } = spyTransport();

  const res = await transmitApprovalDecision({ gateId: "payment-action", decision: "approved" }, { transport });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.authorization, undefined);
  assert.equal(res.succeeded, true);
});
