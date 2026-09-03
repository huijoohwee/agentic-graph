// Unit tests for the Render_Harness token-FAILURE path
// (agentic-graph-acos-mcp-connector spec, task 3.10 / R8.2 / Design Property 1 —
// the render spend-boundary fail-closed side).
//
// R8.2: IF the render Approval_Token is missing, expired, or fails validation,
// THEN THE Render_Harness SHALL reject the render request, perform no provider
// dispatch, record zero provider spend, and return an error indication
// identifying the Approval_Token failure.
//
// Design Property 1 (approval-gate invariant for paid actions): a paid action
// executes ONLY if the presented Approval_Token is verified, matches the
// requested action's gate, is unexpired (issuance age <= 15 minutes), and has
// not been previously consumed; in every other case the action is blocked, no
// paid-provider call occurs, spend-bearing state is unchanged, and the
// rejection reason is recorded. A valid Auth_Token never substitutes for an
// Approval_Token at any spend boundary.
//
// These are example-based unit asserts of every token-failure state (missing,
// malformed, gate-mismatched, unsigned/unverified, expired, consumed) at BOTH
// the pure predicate (`verifyRenderToken`) and the harness-envelope
// (`runRenderHarness` -> fail-closed rejection) layers. The deterministic
// injectable seams (so the local runtime makes ZERO live network calls) are
// wrapped with spies to prove no dispatch / no ledger write occurs on
// rejection.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runRenderHarness,
  verifyRenderToken,
  RENDER_GATE_ID,
  RENDER_TOKEN_TTL_MS,
  RENDER_TOKEN_REASON_ABSENT,
  RENDER_TOKEN_REASON_MALFORMED,
  RENDER_TOKEN_REASON_GATE_MISMATCH,
  RENDER_TOKEN_REASON_INVALID_SIGNATURE,
  RENDER_TOKEN_REASON_EXPIRED,
  RENDER_TOKEN_REASON_CONSUMED,
  createDeterministicRenderQueueClient,
  createDeterministicMockProviderClient,
  createDeterministicLedgerClient,
} from "../video-remix-runtime.js";

const SHOTS = Object.freeze([
  { shotId: "shot-1", prompt: "open on skyline" },
  { shotId: "shot-2", prompt: "cut to product" },
]);

// A fixed clock so the expiry window (R4.7, 15 min) is deterministic.
const NOW = 1_700_000_000_000;
const now = () => NOW;

// A valid render Approval_Token (targets the render gate, signed, unexpired,
// unconsumed) — the baseline each failure case perturbs exactly one field of.
function validRenderToken(overrides = {}) {
  return {
    gateId: RENDER_GATE_ID,
    issuedAt: NOW,
    consumed: false,
    verified: true,
    ...overrides,
  };
}

// Build spy seams that record every dispatch / ledger write so a rejection can
// assert ZERO provider dispatch and ZERO ledger writes (zero provider spend).
function spySeams() {
  const calls = { queueDispatch: 0, mockDispatch: 0, ledgerRecord: 0 };
  const queue = createDeterministicRenderQueueClient();
  const mock = createDeterministicMockProviderClient();
  const ledger = createDeterministicLedgerClient();
  return {
    calls,
    queueClient: {
      ...queue,
      dispatch(args) {
        calls.queueDispatch += 1;
        return queue.dispatch(args);
      },
    },
    mockClient: {
      ...mock,
      dispatch(args) {
        calls.mockDispatch += 1;
        return mock.dispatch(args);
      },
    },
    ledgerClient: {
      ...ledger,
      record(args) {
        calls.ledgerRecord += 1;
        return ledger.record(args);
      },
    },
  };
}

// The full set of token-failure states for R8.2 / Property 1. Each entry is a
// token (or absence) that must be rejected with the named reason.
const TOKEN_FAILURE_CASES = [
  { name: "missing (undefined)", token: undefined, reason: RENDER_TOKEN_REASON_ABSENT },
  { name: "missing (null)", token: null, reason: RENDER_TOKEN_REASON_ABSENT },
  { name: "missing (false)", token: false, reason: RENDER_TOKEN_REASON_ABSENT },
  { name: "malformed (non-object string)", token: "not-a-token", reason: RENDER_TOKEN_REASON_MALFORMED },
  {
    name: "gate-mismatched (wrong gate)",
    token: validRenderToken({ gateId: "payment-action" }),
    reason: RENDER_TOKEN_REASON_GATE_MISMATCH,
  },
  {
    name: "gate-mismatched (gate omitted)",
    token: validRenderToken({ gateId: undefined }),
    reason: RENDER_TOKEN_REASON_GATE_MISMATCH,
  },
  {
    name: "unsigned / unverified (no signature, not verified)",
    token: validRenderToken({ verified: false, signature: "" }),
    reason: RENDER_TOKEN_REASON_INVALID_SIGNATURE,
  },
  {
    name: "expired (issued > 15 min ago)",
    token: validRenderToken({ issuedAt: NOW - (RENDER_TOKEN_TTL_MS + 1) }),
    reason: RENDER_TOKEN_REASON_EXPIRED,
  },
  {
    name: "expired (issuedAt missing/unparseable)",
    token: validRenderToken({ issuedAt: undefined }),
    reason: RENDER_TOKEN_REASON_EXPIRED,
  },
  {
    name: "expired (future-dated issuance fails closed)",
    token: validRenderToken({ issuedAt: NOW + 60_000 }),
    reason: RENDER_TOKEN_REASON_EXPIRED,
  },
  {
    name: "consumed (single-use already spent)",
    token: validRenderToken({ consumed: true }),
    reason: RENDER_TOKEN_REASON_CONSUMED,
  },
];

// ---------------------------------------------------------------------------
// Predicate layer: verifyRenderToken names the failed check for every state
// ---------------------------------------------------------------------------

for (const { name, token, reason } of TOKEN_FAILURE_CASES) {
  test(`verifyRenderToken rejects ${name} with reason '${reason}'`, () => {
    const result = verifyRenderToken(token, { now, gateId: RENDER_GATE_ID });
    assert.equal(result.valid, false, "token must not be valid");
    assert.equal(result.reason, reason, "the failed check must be named");
    assert.equal(result.gateId, RENDER_GATE_ID);
  });
}

test("verifyRenderToken accepts a valid, signed, unexpired, unconsumed token", () => {
  const result = verifyRenderToken(validRenderToken(), { now, gateId: RENDER_GATE_ID });
  assert.equal(result.valid, true);
  assert.equal(result.reason, null);
});

test("verifyRenderToken accepts a token signed via a non-empty signature string", () => {
  const token = validRenderToken({ verified: false, signature: "sig-abc123" });
  const result = verifyRenderToken(token, { now, gateId: RENDER_GATE_ID });
  assert.equal(result.valid, true);
  assert.equal(result.reason, null);
});

// ---------------------------------------------------------------------------
// Harness layer: each failure state -> fail-closed rejection envelope
//   * no provider dispatch (queue + mock seams never called)
//   * zero provider spend, zero ledger events
//   * an error naming the failed token check
//   * spend-bearing state unchanged (no assets emitted)
// ---------------------------------------------------------------------------

for (const { name, token, reason } of TOKEN_FAILURE_CASES) {
  test(`R8.2/Property 1: render request with ${name} is rejected with zero dispatch and zero spend`, () => {
    const seams = spySeams();
    const result = runRenderHarness(
      { shots: SHOTS, renderGateToken: token },
      {
        now,
        runId: `run-reject-${reason}`,
        // Make the live path the "tempting" route so a regression that skipped
        // the gate would dispatch a paid provider — the spies would catch it.
        providerKeyAvailable: true,
        queueClient: seams.queueClient,
        mockClient: seams.mockClient,
        ledgerClient: seams.ledgerClient,
      },
    );

    // Fail-closed rejection envelope.
    assert.equal(result.status, "rejected", "request must be rejected");
    assert.equal(result.rejected, true);
    assert.equal(result.dispatched, false, "no dispatch may occur");

    // No provider dispatch of any kind (live queue OR zero-spend mock).
    assert.equal(seams.calls.queueDispatch, 0, "queue must not be dispatched");
    assert.equal(seams.calls.mockDispatch, 0, "mock provider must not be dispatched");
    assert.equal(result.providerDispatchCalls, 0);
    assert.equal(result.paidProviderCalls, 0);

    // Zero provider spend / zero ledger writes / no assets (state unchanged).
    assert.equal(result.providerSpendCents, 0, "zero provider spend");
    assert.equal(seams.calls.ledgerRecord, 0, "no ledger event may be recorded");
    assert.deepEqual(result.ledgerEvents, []);
    assert.deepEqual(result.assets, []);

    // The error names the failed token check (reason + gate).
    assert.ok(result.error, "an error indication must be returned");
    assert.equal(result.error.code, "render_approval_token_failed");
    assert.equal(result.error.reason, reason, "error must name the failed token check");
    assert.equal(result.error.gateId, RENDER_GATE_ID);
    assert.equal(result.reason, reason);
    assert.match(result.error.message, new RegExp(reason));
  });
}

// ---------------------------------------------------------------------------
// Property 1: a valid Auth_Token never substitutes for an Approval_Token
// ---------------------------------------------------------------------------

test("Property 1: an Auth_Token-shaped credential never authorizes render spend", () => {
  // An Auth_Token carries subject/entitledRunIds/exp — NOT a render gateId or a
  // render Approval_Token signature. Presented as the render token it must be
  // rejected as gate-mismatched (fail-closed), with zero dispatch.
  const authTokenShaped = {
    subject: "session-123",
    entitledRunIds: ["run-reject-auth"],
    issuedAt: NOW,
    expiryWindowSeconds: 3600,
    signature: "hs256-auth-signature",
  };
  const seams = spySeams();
  const result = runRenderHarness(
    { shots: SHOTS, renderGateToken: authTokenShaped },
    {
      now,
      runId: "run-reject-auth",
      providerKeyAvailable: true,
      queueClient: seams.queueClient,
      mockClient: seams.mockClient,
      ledgerClient: seams.ledgerClient,
    },
  );

  assert.equal(result.status, "rejected");
  assert.equal(result.reason, RENDER_TOKEN_REASON_GATE_MISMATCH);
  assert.equal(seams.calls.queueDispatch, 0);
  assert.equal(seams.calls.mockDispatch, 0);
  assert.equal(result.providerSpendCents, 0);
  assert.deepEqual(result.assets, []);
});

// ---------------------------------------------------------------------------
// A valid token still dispatches — proves the gate blocks ONLY on failure
// ---------------------------------------------------------------------------

test("a valid token is NOT rejected and proceeds to dispatch (gate blocks only on failure)", () => {
  const seams = spySeams();
  const result = runRenderHarness(
    { shots: ["shot-1"], renderGateToken: validRenderToken() },
    {
      now,
      runId: "run-valid",
      providerKeyAvailable: true,
      queueClient: seams.queueClient,
      mockClient: seams.mockClient,
      ledgerClient: seams.ledgerClient,
    },
  );
  assert.equal(result.status, "complete");
  assert.equal(result.rejected ?? false, false);
  assert.equal(seams.calls.queueDispatch, 1, "valid token must dispatch exactly once");
  assert.equal(result.assets.length, 1);
});
