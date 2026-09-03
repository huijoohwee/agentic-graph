// Tests for the Approval_Token issuer + store (agentic-graph-acos-mcp-connector
// spec, task 4.1 / R4.7 / R11.6 / design Hitl_Gate_Service + Property 1 gate
// catalog).
//
// Covers: issuance for each canonical gate id; an issued token verifying via
// the SHARED `verifyGateToken`; stored-token retrieval; estimatedCostUsd
// passthrough; unknown-gate rejection; expiry; single-use seam; and gate-id
// catalog consistency between the issuer, `buildApprovalGates`, and the
// render/commerce/research/storyboard harness gate ids.

import test from "node:test";
import assert from "node:assert/strict";

import {
  APPROVAL_GATE_IDS,
  APPROVAL_TOKEN_TTL_MS,
  ApprovalTokenIssueError,
  isCanonicalGateId,
  createInMemoryApprovalTokenStore,
  createApprovalTokenIssuer,
  verifyGateToken,
  RENDER_GATE_ID,
  PAYMENT_GATE_ID,
  RESEARCH_GATE_ID,
  STORYBOARD_GATE_ID,
} from "../video-remix-runtime.js";

import { APPROVAL_GATES } from "../video-remix/constants.js";
import { buildApprovalGates } from "../video-remix/approvals.js";

const FIXED_NOW = 1_700_000_000_000; // deterministic clock for the suite

function freshIssuer(extra = {}) {
  return createApprovalTokenIssuer({ now: FIXED_NOW, ...extra });
}

// --- Issuance for each canonical gate id -----------------------------------

for (const gateId of APPROVAL_GATE_IDS) {
  test(`issue mints a single-use Approval_Token for canonical gate '${gateId}'`, () => {
    const issuer = freshIssuer();
    const token = issuer.issue(gateId);

    assert.equal(token.gateId, gateId, "token targets the requested gate");
    assert.equal(token.issuedAt, FIXED_NOW, "issuedAt is stamped from the injected clock");
    assert.equal(token.consumed, false, "a freshly issued token is unconsumed (single-use)");
    assert.equal(token.verified, true, "token carries a verified marker");
    assert.equal(typeof token.signature, "string");
    assert.ok(token.signature.length > 0, "token carries a non-empty signature");
    assert.equal(typeof token.tokenId, "string");
    assert.ok(token.tokenId.length > 0, "token carries a storage key");
  });
}

// --- Issued token verifies via the shared verifyGateToken predicate --------

test("an issued token verifies via verifyGateToken within the 15-minute window", () => {
  const issuer = freshIssuer();
  for (const gateId of APPROVAL_GATE_IDS) {
    const token = issuer.issue(gateId);
    const result = verifyGateToken(token, { gateId, now: FIXED_NOW, ttlMs: APPROVAL_TOKEN_TTL_MS });
    assert.equal(result.valid, true, `issued ${gateId} token must verify`);
    assert.equal(result.reason, null);
  }
});

test("issuer.verify delegates to verifyGateToken and looks tokens up by id", () => {
  const issuer = freshIssuer();
  const token = issuer.issue("payment-action");
  // verify by object
  assert.equal(issuer.verify(token, { gateId: "payment-action", now: FIXED_NOW }).valid, true);
  // verify by stored id
  assert.equal(issuer.verify(token.tokenId, { gateId: "payment-action", now: FIXED_NOW }).valid, true);
  // gate mismatch fails closed
  assert.equal(issuer.verify(token, { gateId: "cloud-deploy", now: FIXED_NOW }).valid, false);
});

test("an issued token is rejected by verifyGateToken once past the 15-minute TTL", () => {
  const issuer = freshIssuer();
  const token = issuer.issue("render-action");
  const past = verifyGateToken(token, {
    gateId: "render-action",
    now: FIXED_NOW + APPROVAL_TOKEN_TTL_MS + 1,
  });
  assert.equal(past.valid, false);
  assert.equal(past.reason, "expired");
});

// --- Storage retrieval ------------------------------------------------------

test("issued tokens are stored and retrievable by id", () => {
  const issuer = freshIssuer();
  const token = issuer.issue("paid-model-call");

  assert.equal(issuer.has(token.tokenId), true);
  assert.deepEqual(issuer.get(token.tokenId), token, "stored token is retrievable");
  assert.equal(issuer.get("does-not-exist"), undefined);

  const all = issuer.list();
  assert.equal(all.length, 1);
  assert.equal(all[0].tokenId, token.tokenId);

  assert.equal(issuer.revoke(token.tokenId), true, "revoke deletes the stored token");
  assert.equal(issuer.has(token.tokenId), false);
});

test("issueAll mints one token per canonical gate and stores them all", () => {
  const issuer = freshIssuer();
  const tokens = issuer.issueAll();
  assert.equal(tokens.length, APPROVAL_GATE_IDS.length);
  assert.deepEqual(
    tokens.map((t) => t.gateId).sort(),
    [...APPROVAL_GATE_IDS].sort(),
    "one token per canonical gate id",
  );
  assert.equal(issuer.list().length, APPROVAL_GATE_IDS.length);
});

test("an injectable store seam receives every issued token", () => {
  const store = createInMemoryApprovalTokenStore();
  const issuer = createApprovalTokenIssuer({ store, now: FIXED_NOW });
  issuer.issue("cloud-deploy");
  issuer.issue("payment-action");
  assert.equal(store.size(), 2, "the injected store backs the issuer");
  store.clear();
  assert.equal(store.size(), 0);
});

// --- estimatedCostUsd passthrough ------------------------------------------

test("issue carries estimatedCostUsd when a finite estimate is supplied", () => {
  const issuer = freshIssuer();
  const withCost = issuer.issue("render-action", { estimatedCostUsd: 1.25 });
  assert.equal(withCost.estimatedCostUsd, 1.25);

  const withoutCost = issuer.issue("render-action");
  assert.ok(!("estimatedCostUsd" in withoutCost), "estimate omitted when not supplied");

  const nonFinite = issuer.issue("render-action", { estimatedCostUsd: Number.NaN });
  assert.ok(!("estimatedCostUsd" in nonFinite), "non-finite estimate is not attached");
});

// --- Unknown-gate rejection (fail-closed) ----------------------------------

test("issue throws ApprovalTokenIssueError for a non-canonical gate id", () => {
  const issuer = freshIssuer();
  assert.throws(
    () => issuer.issue("totally-made-up-gate"),
    (err) => {
      assert.ok(err instanceof ApprovalTokenIssueError);
      assert.equal(err.code, "approval_token_issue_failed");
      assert.equal(err.gateId, "totally-made-up-gate");
      return true;
    },
  );
  assert.equal(issuer.list().length, 0, "no token is stored on a failed issue");
});

test("isCanonicalGateId recognizes exactly the APPROVAL_GATES catalog", () => {
  for (const gate of APPROVAL_GATES) assert.equal(isCanonicalGateId(gate.id), true);
  assert.equal(isCanonicalGateId("nope"), false);
});

// --- Gate-id catalog consistency (issuer <-> harnesses <-> buildApprovalGates)

test("issuer catalog equals the buildApprovalGates / APPROVAL_GATES gate-id set", () => {
  const fromConstants = APPROVAL_GATES.map((g) => g.id).sort();
  const fromBuild = buildApprovalGates(new Set()).map((g) => g.id).sort();
  assert.deepEqual([...APPROVAL_GATE_IDS].sort(), fromConstants, "issuer derives from APPROVAL_GATES");
  assert.deepEqual([...APPROVAL_GATE_IDS].sort(), fromBuild, "issuer agrees with buildApprovalGates");
});

test("every harness gate id is one the issuer can mint a token for", () => {
  // The render and commerce/payment spend boundaries, plus the model-bearing
  // research/storyboard gate, must all be coverable by the issuer catalog so a
  // run can be fully approved. This is the reconciliation guard: if a harness
  // gate id ever drifts from the canonical catalog, this test fails.
  for (const gateId of [RENDER_GATE_ID, PAYMENT_GATE_ID, RESEARCH_GATE_ID, STORYBOARD_GATE_ID]) {
    assert.equal(isCanonicalGateId(gateId), true, `harness gate '${gateId}' must be canonical`);
    const issuer = freshIssuer();
    const token = issuer.issue(gateId);
    assert.equal(
      verifyGateToken(token, { gateId, now: FIXED_NOW }).valid,
      true,
      `issuer must mint a verifiable token for harness gate '${gateId}'`,
    );
  }
});

test("render-action is retained as a canonical gate distinct from paid-model-call", () => {
  // Reconciliation decision (task 4.1): render keeps its own gate (R4.2 / R8.1
  // / R8.2 require a distinct render Approval_Gate/token); it is NOT merged into
  // paid-model-call.
  assert.equal(RENDER_GATE_ID, "render-action");
  assert.notEqual(RENDER_GATE_ID, RESEARCH_GATE_ID);
  assert.ok(APPROVAL_GATE_IDS.includes("render-action"));
  assert.ok(APPROVAL_GATE_IDS.includes("paid-model-call"));
});
