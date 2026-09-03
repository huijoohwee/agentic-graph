// =============================================================================
// ApprovalGate + Approval_Token SSOT schema — unit + property tests
// agentic-graph-acos-mcp-connector spec · Task 8.2 · Requirements R4.7, R11.6, R11.8
// Pure validators: ZERO network calls, deterministic.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateApprovalToken,
  validateApprovalGate,
  isApprovalTokenWithinValidity,
  toIssuedAtMs,
  createApprovalGate,
  APPROVAL_TOKEN_TTL_MS,
  APPROVAL_GATE_ID,
  APPROVAL_GATE_ID_VALUES,
  APPROVAL_GATE_STATE,
  APPROVAL_GATE_STATE_VALUES,
} from "../approval.schema.js";

// Verify the module is reachable via the aggregate entry point too (SSOT).
import * as contracts from "../index.js";

// --- helpers ----------------------------------------------------------------

const ISSUED_AT_MS = 1_700_000_000_000;

/** A complete, canonical, schema-valid Approval_Token (mirrors the issuer). */
function completeToken(overrides = {}) {
  return {
    tokenId: "aptok-1",
    gateId: APPROVAL_GATE_ID.RENDER_ACTION,
    issuedAt: ISSUED_AT_MS,
    consumed: false,
    verified: true,
    signature: "sig:render-action:1700000000000:aptok-1",
    estimatedCostUsd: 4.2,
    ...overrides,
  };
}

/** A complete, canonical, schema-valid ApprovalGate (design Data Models). */
function completeGate(overrides = {}) {
  return {
    gateId: APPROVAL_GATE_ID.PAYMENT_ACTION,
    approvalState: APPROVAL_GATE_STATE.APPROVED,
    estimatedCostUsd: 9.99,
    token: completeToken({ gateId: APPROVAL_GATE_ID.PAYMENT_ACTION }),
    ...overrides,
  };
}

const pathsOf = (result) => result.errors.map((e) => e.path);

// --- 1. Valid ApprovalGate + Approval_Token pass ----------------------------

test("a complete, canonical Approval_Token is valid with no errors", () => {
  const result = validateApprovalToken(completeToken());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("a complete, canonical ApprovalGate is valid with no errors", () => {
  const result = validateApprovalGate(completeGate());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("a pending gate with a null token is valid", () => {
  const result = validateApprovalGate(
    completeGate({ approvalState: APPROVAL_GATE_STATE.PENDING, token: null }),
  );
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("the core design token shape { gateId, issuedAt, consumed, signature } is valid", () => {
  const result = validateApprovalToken({
    gateId: APPROVAL_GATE_ID.PAID_MODEL_CALL,
    issuedAt: ISSUED_AT_MS,
    consumed: false,
    signature: "abc",
  });
  assert.equal(result.valid, true);
});

test("createApprovalGate produces a schema-valid pending gate", () => {
  assert.equal(validateApprovalGate(createApprovalGate(APPROVAL_GATE_ID.RENDER_ACTION)).valid, true);
  assert.equal(
    validateApprovalGate(createApprovalGate(APPROVAL_GATE_ID.PAYMENT_ACTION, { estimatedCostUsd: 12 })).valid,
    true,
  );
});

test("the aggregate index re-exports the approval validators (SSOT entry point)", () => {
  assert.equal(typeof contracts.validateApprovalToken, "function");
  assert.equal(typeof contracts.validateApprovalGate, "function");
  assert.equal(contracts.APPROVAL_TOKEN_TTL_MS, APPROVAL_TOKEN_TTL_MS);
});

// --- 2. gateId enum validation ----------------------------------------------

test("every canonical gate id is accepted on a token", () => {
  for (const gateId of APPROVAL_GATE_ID_VALUES) {
    assert.equal(validateApprovalToken(completeToken({ gateId })).valid, true, gateId);
  }
});

test("an unknown token gateId is flagged at path 'gateId' with a reason", () => {
  const r = validateApprovalToken(completeToken({ gateId: "mystery-gate" }));
  assert.equal(r.valid, false);
  const err = r.errors.find((e) => e.path === "gateId");
  assert.ok(err && /one of/.test(err.reason));
});

test("every canonical gate id and state is accepted on a gate", () => {
  for (const gateId of APPROVAL_GATE_ID_VALUES) {
    for (const approvalState of APPROVAL_GATE_STATE_VALUES) {
      const r = validateApprovalGate({ gateId, approvalState, estimatedCostUsd: 1, token: null });
      assert.equal(r.valid, true, `${gateId}/${approvalState}`);
    }
  }
});

test("an unknown gate gateId / approvalState are flagged by path", () => {
  const r = validateApprovalGate(completeGate({ gateId: "nope", approvalState: "maybe" }));
  assert.equal(r.valid, false);
  assert.ok(pathsOf(r).includes("gateId"));
  assert.ok(pathsOf(r).includes("approvalState"));
});

test("a nested token gateId outside the enum is flagged at 'token.gateId'", () => {
  const r = validateApprovalGate(completeGate({ token: completeToken({ gateId: "bad" }) }));
  assert.equal(r.valid, false);
  assert.ok(pathsOf(r).includes("token.gateId"));
});

// --- 3. estimatedCostUsd >= 0 -----------------------------------------------

test("negative estimatedCostUsd on a gate is flagged", () => {
  const r = validateApprovalGate(completeGate({ estimatedCostUsd: -0.01 }));
  assert.equal(r.valid, false);
  assert.ok(pathsOf(r).includes("estimatedCostUsd"));
});

test("zero estimatedCostUsd is valid (live-without-approvals baseline)", () => {
  assert.equal(validateApprovalGate(completeGate({ estimatedCostUsd: 0 })).valid, true);
});

test("non-number estimatedCostUsd on a gate is flagged", () => {
  for (const bad of ["free", null, NaN, Infinity]) {
    const r = validateApprovalGate(completeGate({ estimatedCostUsd: bad }));
    assert.ok(pathsOf(r).includes("estimatedCostUsd"), String(bad));
  }
});

test("optional token estimatedCostUsd, when present and negative, is flagged", () => {
  const r = validateApprovalToken(completeToken({ estimatedCostUsd: -5 }));
  assert.ok(pathsOf(r).includes("estimatedCostUsd"));
});

// --- 4. consumed single-use flag --------------------------------------------

test("consumed:true and consumed:false are both valid (single-use flag domain, R11.8)", () => {
  assert.equal(validateApprovalToken(completeToken({ consumed: true })).valid, true);
  assert.equal(validateApprovalToken(completeToken({ consumed: false })).valid, true);
});

test("a non-boolean consumed is flagged at path 'consumed'", () => {
  for (const bad of ["yes", 1, 0, null, undefined]) {
    const r = validateApprovalToken(completeToken({ consumed: bad }));
    assert.equal(r.valid, false, String(bad));
    assert.ok(pathsOf(r).includes("consumed"));
  }
});

test("a missing consumed flag is flagged as a missing required field", () => {
  const t = completeToken();
  delete t.consumed;
  const r = validateApprovalToken(t);
  const err = r.errors.find((e) => e.path === "consumed");
  assert.ok(err && /missing/.test(err.reason));
});

// --- 5. 15-minute TTL constant published + validity semantics (R4.7) --------

test("the canonical 15-minute TTL constant is published as 15 * 60 * 1000", () => {
  assert.equal(APPROVAL_TOKEN_TTL_MS, 15 * 60 * 1000);
  assert.equal(APPROVAL_TOKEN_TTL_MS, 900_000);
});

test("isApprovalTokenWithinValidity honors the 15-minute window with an injectable clock", () => {
  const token = completeToken({ issuedAt: ISSUED_AT_MS });
  // exactly at issuance -> valid
  assert.equal(isApprovalTokenWithinValidity(token, { now: ISSUED_AT_MS }), true);
  // 14m59s later -> valid
  assert.equal(
    isApprovalTokenWithinValidity(token, { now: ISSUED_AT_MS + APPROVAL_TOKEN_TTL_MS - 1000 }),
    true,
  );
  // exactly 15m later -> still valid (inclusive boundary)
  assert.equal(
    isApprovalTokenWithinValidity(token, { now: ISSUED_AT_MS + APPROVAL_TOKEN_TTL_MS }),
    true,
  );
  // 15m + 1ms later -> expired
  assert.equal(
    isApprovalTokenWithinValidity(token, { now: ISSUED_AT_MS + APPROVAL_TOKEN_TTL_MS + 1 }),
    false,
  );
  // future-dated issuance -> fail closed
  assert.equal(isApprovalTokenWithinValidity(token, { now: ISSUED_AT_MS - 1 }), false);
});

test("isApprovalTokenWithinValidity fails closed for unparseable / non-object input", () => {
  assert.equal(isApprovalTokenWithinValidity(null), false);
  assert.equal(isApprovalTokenWithinValidity({ issuedAt: "not-a-date" }, { now: ISSUED_AT_MS }), false);
  assert.equal(isApprovalTokenWithinValidity({}, { now: ISSUED_AT_MS }), false);
});

// --- 6. issuedAt domain (epoch ms or ISO string) ----------------------------

test("issuedAt accepts epoch milliseconds and ISO-8601 strings", () => {
  assert.equal(validateApprovalToken(completeToken({ issuedAt: ISSUED_AT_MS })).valid, true);
  assert.equal(validateApprovalToken(completeToken({ issuedAt: "2023-11-14T22:13:20.000Z" })).valid, true);
});

test("issuedAt rejects unparseable, non-finite, and wrong-typed values", () => {
  for (const bad of ["not-a-date", "", NaN, Infinity, null, {}, []]) {
    const r = validateApprovalToken(completeToken({ issuedAt: bad }));
    assert.equal(r.valid, false, String(bad));
    assert.ok(pathsOf(r).includes("issuedAt"));
  }
});

test("toIssuedAtMs coerces epoch ms and ISO consistently and returns null otherwise", () => {
  assert.equal(toIssuedAtMs(ISSUED_AT_MS), ISSUED_AT_MS);
  assert.equal(toIssuedAtMs("2023-11-14T22:13:20.000Z"), ISSUED_AT_MS);
  assert.equal(toIssuedAtMs("not-a-date"), null);
  assert.equal(toIssuedAtMs(NaN), null);
  assert.equal(toIssuedAtMs(null), null);
});

// --- 7. missing / invalid fields flagged with path + reason -----------------

const REQUIRED_TOKEN_FIELDS = ["gateId", "issuedAt", "consumed"];

for (const field of REQUIRED_TOKEN_FIELDS) {
  test(`missing token field "${field}" is flagged with path + reason`, () => {
    const t = completeToken();
    delete t[field];
    const r = validateApprovalToken(t);
    assert.equal(r.valid, false);
    const err = r.errors.find((e) => e.path === field);
    assert.ok(err, `expected an error at path "${field}"`);
    assert.match(err.reason, /missing/);
  });
}

test("a token with neither signature nor verified marker is flagged", () => {
  const t = completeToken();
  delete t.verified;
  delete t.signature;
  const r = validateApprovalToken(t);
  assert.equal(r.valid, false);
  const err = r.errors.find((e) => e.path === "signature");
  assert.ok(err && /verifiable marker/.test(err.reason));
});

test("a token with only verified:true (no signature) is valid", () => {
  const t = completeToken();
  delete t.signature;
  assert.equal(validateApprovalToken(t).valid, true);
});

test("a token with only a non-empty signature (no verified) is valid", () => {
  const t = completeToken({ verified: false });
  assert.equal(validateApprovalToken(t).valid, true);
});

test("an empty / whitespace signature without verified is rejected", () => {
  const t = completeToken({ verified: false, signature: "   " });
  assert.equal(validateApprovalToken(t).valid, false);
});

test("a non-empty-string tokenId, when present, is required to be non-empty", () => {
  assert.ok(pathsOf(validateApprovalToken(completeToken({ tokenId: "" }))).includes("tokenId"));
  assert.ok(pathsOf(validateApprovalToken(completeToken({ tokenId: 5 }))).includes("tokenId"));
});

test("each required gate field, when missing, is flagged with path + reason", () => {
  for (const field of ["gateId", "approvalState", "estimatedCostUsd", "token"]) {
    const g = completeGate();
    delete g[field];
    const r = validateApprovalGate(g);
    assert.equal(r.valid, false);
    const err = r.errors.find((e) => e.path === field);
    assert.ok(err && /missing/.test(err.reason), `expected missing error at "${field}"`);
  }
});

test("a gate token that is neither object nor null is flagged at 'token'", () => {
  for (const bad of [5, "x", true]) {
    const r = validateApprovalGate(completeGate({ token: bad }));
    assert.ok(pathsOf(r).includes("token"), String(bad));
  }
});

// --- 8. Malformed input never throws (property-style, deterministic) --------

test("validateApprovalToken never throws and always returns a result shape", () => {
  const circular = {};
  circular.self = circular;
  const inputs = [
    undefined, null, 0, NaN, Infinity, "", "str", true, false,
    [], [1, 2], {}, { gateId: 1 }, { issuedAt: {} }, { consumed: "x" },
    circular, completeToken(),
  ];
  for (const input of inputs) {
    let result;
    assert.doesNotThrow(() => {
      result = validateApprovalToken(input);
    }, `threw on input: ${String(input)}`);
    assert.equal(typeof result.valid, "boolean");
    assert.ok(Array.isArray(result.errors));
    for (const e of result.errors) {
      assert.equal(typeof e.path, "string");
      assert.equal(typeof e.reason, "string");
    }
  }
});

test("validateApprovalGate never throws and always returns a result shape", () => {
  const circular = {};
  circular.self = circular;
  const inputs = [
    undefined, null, 0, NaN, "", "str", true, [], {}, { gateId: 1 },
    { token: 5 }, { token: { gateId: 1, issuedAt: {}, consumed: "x" } },
    circular, completeGate(),
  ];
  for (const input of inputs) {
    let result;
    assert.doesNotThrow(() => {
      result = validateApprovalGate(input);
    }, `threw on input: ${String(input)}`);
    assert.equal(typeof result.valid, "boolean");
    assert.ok(Array.isArray(result.errors));
    for (const e of result.errors) {
      assert.equal(typeof e.path, "string");
      assert.equal(typeof e.reason, "string");
    }
  }
});

test("single-field corruption sweep on a token stays total and reports errors", () => {
  const corruptions = [
    (t) => { t.gateId = "bad"; },
    (t) => { t.issuedAt = "nope"; },
    (t) => { t.consumed = 1; },
    (t) => { delete t.signature; delete t.verified; },
    (t) => { t.tokenId = ""; },
    (t) => { t.estimatedCostUsd = -1; },
  ];
  for (const corrupt of corruptions) {
    const t = completeToken();
    corrupt(t);
    let result;
    assert.doesNotThrow(() => {
      result = validateApprovalToken(t);
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 1);
  }
});
