// Tests for single-use Approval_Token enforcement (agentic-graph-acos-mcp-connector
// spec, task 4.3 / R11.8 / Property 1).
//
// Covers: a first PERMITTED use marks the stored token consumed; a second use
// of the same token is rejected with reason `consumed` and never invokes the
// spend function; a REJECTED first attempt does NOT consume the token; and
// consumption happens strictly AFTER the spend (ordering), wired through the
// `withApprovalGate` consume seam so single-use composes with the spend
// boundary guard.

import test from "node:test";
import assert from "node:assert/strict";

import {
  createApprovalTokenIssuer,
  withApprovalGate,
  verifyGateToken,
} from "../video-remix-runtime.js";

const FIXED_NOW = 1_700_000_000_000; // deterministic clock for the suite
const GATE = "render-action";

function freshIssuer(extra = {}) {
  return createApprovalTokenIssuer({ now: FIXED_NOW, ...extra });
}

// --- issuer.consume directly ------------------------------------------------

test("issuer.consume marks a stored token consumed so re-verification fails", () => {
  const issuer = freshIssuer();
  const token = issuer.issue(GATE);

  // Valid before consumption.
  assert.equal(verifyGateToken(token, { gateId: GATE, now: FIXED_NOW }).valid, true);

  const consumed = issuer.consume(token.tokenId);
  assert.equal(consumed.consumed, true, "returned token is flagged consumed");
  assert.equal(issuer.get(token.tokenId).consumed, true, "stored token is mutated");

  const after = verifyGateToken(issuer.get(token.tokenId), { gateId: GATE, now: FIXED_NOW });
  assert.equal(after.valid, false);
  assert.equal(after.reason, "consumed");
});

test("issuer.consume is idempotent and a no-op for unknown token ids", () => {
  const issuer = freshIssuer();
  const token = issuer.issue(GATE);

  const first = issuer.consume(token.tokenId);
  const second = issuer.consume(token.tokenId);
  assert.equal(first.consumed, true);
  assert.equal(second.consumed, true, "consuming again is idempotent");

  assert.equal(issuer.consume("does-not-exist"), undefined, "no token is fabricated");
});

// --- first permitted use marks the token consumed ---------------------------

test("a first permitted use through the guard marks the token consumed", async () => {
  const issuer = freshIssuer();
  const token = issuer.issue(GATE);

  let spendCalls = 0;
  const first = await withApprovalGate(
    GATE,
    token,
    () => {
      spendCalls += 1;
      return "asset-1";
    },
    { now: FIXED_NOW, consume: issuer.consumeSeam() },
  );

  assert.equal(first.permitted, true);
  assert.equal(first.result, "asset-1");
  assert.equal(spendCalls, 1, "spend ran exactly once on the permitted use");
  assert.equal(issuer.get(token.tokenId).consumed, true, "token is consumed after the spend");
});

// --- second use of the same token is rejected, spendFn not invoked ----------

test("a second use of the same token is rejected (consumed) without spending", async () => {
  const issuer = freshIssuer();
  const token = issuer.issue(GATE);
  const consumeSeam = issuer.consumeSeam();

  let spendCalls = 0;
  const spendFn = () => {
    spendCalls += 1;
    return "asset";
  };

  const first = await withApprovalGate(GATE, token, spendFn, {
    now: FIXED_NOW,
    consume: consumeSeam,
  });
  assert.equal(first.permitted, true);
  assert.equal(spendCalls, 1);

  // Re-present the SAME token (re-read from the store to reflect the mutation,
  // mirroring how a Director boundary would look it up before spending again).
  const second = await withApprovalGate(GATE, issuer.get(token.tokenId), spendFn, {
    now: FIXED_NOW,
    consume: consumeSeam,
  });
  assert.equal(second.permitted, false, "a consumed token cannot authorize a second action");
  assert.equal(second.reason, "consumed");
  assert.equal(spendCalls, 1, "spend was NOT invoked a second time");
});

// --- a rejected first attempt does NOT consume the token --------------------

test("a rejected attempt does NOT consume the token (it can still be used)", async () => {
  const issuer = freshIssuer();
  const token = issuer.issue(GATE);

  let spendCalls = 0;
  const spendFn = () => {
    spendCalls += 1;
    return "asset";
  };

  // Reject via gate mismatch — the guard must never reach the consume seam.
  const rejected = await withApprovalGate("payment-action", token, spendFn, {
    now: FIXED_NOW,
    consume: issuer.consumeSeam(),
  });
  assert.equal(rejected.permitted, false);
  assert.equal(rejected.reason, "gate_mismatch");
  assert.equal(spendCalls, 0, "rejected attempt never spends");
  assert.equal(
    issuer.get(token.tokenId).consumed,
    false,
    "a never-permitted token is left unconsumed",
  );

  // Proof it is still spendable on its correct gate afterwards.
  const ok = await withApprovalGate(GATE, issuer.get(token.tokenId), spendFn, {
    now: FIXED_NOW,
    consume: issuer.consumeSeam(),
  });
  assert.equal(ok.permitted, true);
  assert.equal(spendCalls, 1);
  assert.equal(issuer.get(token.tokenId).consumed, true);
});

// --- consumption happens AFTER the spend (ordering) -------------------------

test("consumption is applied strictly after the spend completes (ordering)", async () => {
  const issuer = freshIssuer();
  const token = issuer.issue(GATE);
  const order = [];

  await withApprovalGate(
    GATE,
    token,
    () => {
      // At spend time the token must still be unconsumed; the guard consumes
      // only after this resolves.
      assert.equal(
        issuer.get(token.tokenId).consumed,
        false,
        "token must NOT be consumed before/while the spend runs",
      );
      order.push("spend");
      return "asset";
    },
    {
      now: FIXED_NOW,
      consume: (args) => {
        order.push("consume");
        return issuer.consume(args.token.tokenId);
      },
    },
  );

  assert.deepEqual(order, ["spend", "consume"], "spend precedes consume");
  assert.equal(issuer.get(token.tokenId).consumed, true);
});
