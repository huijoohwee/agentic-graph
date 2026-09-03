// =============================================================================
// Auth_Token + Caller_Identity SSOT schema — unit + property tests
// agentic-graph-acos-mcp-connector spec · Task 8.3 · Requirements R15.2, R15.4,
//   R15.7, R15.8
// Pure validators: ZERO network calls, deterministic.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateAuthToken,
  validateCallerIdentity,
  resolveExpiryWindowSeconds,
  isExpiryWindowInDomain,
  normalizeEntitledRunIds,
  createCallerIdentity,
  isEntitledToRun,
  DEFAULT_EXPIRY_WINDOW_SECONDS,
  MIN_EXPIRY_WINDOW_SECONDS,
  MAX_EXPIRY_WINDOW_SECONDS,
  AUTH_TOKEN_SIGNATURE_ALG,
} from "../auth.schema.js";

// Verify the module is reachable via the aggregate entry point too (SSOT).
import * as contracts from "../index.js";

// --- helpers ----------------------------------------------------------------

const ISSUED_AT_MS = 1_700_000_000_000;

/** A complete, canonical, schema-valid Auth_Token (mirrors the AWS minter). */
function completeToken(overrides = {}) {
  return {
    subject: "sess_11111111-2222-3333-4444-555555555555",
    issuedAt: ISSUED_AT_MS,
    expiryWindowSeconds: DEFAULT_EXPIRY_WINDOW_SECONDS,
    signature: "eyJhbGciOiJIUzI1NiJ9.payload.signature",
    entitledRunIds: ["run-a", "run-b"],
    ...overrides,
  };
}

/** A complete, canonical, schema-valid Caller_Identity (buildCallerIdentity). */
function completeIdentity(overrides = {}) {
  return {
    subject: "sess_11111111-2222-3333-4444-555555555555",
    principalId: "sess_11111111-2222-3333-4444-555555555555",
    entitledRunIds: ["run-a", "run-b"],
    issuedAt: Math.floor(ISSUED_AT_MS / 1000),
    expiryWindowSeconds: DEFAULT_EXPIRY_WINDOW_SECONDS,
    ...overrides,
  };
}

const pathsOf = (result) => result.errors.map((e) => e.path);

// --- 0. SSOT reachability ---------------------------------------------------

test("auth schema is re-exported from the aggregate contracts entry point", () => {
  assert.equal(typeof contracts.validateAuthToken, "function");
  assert.equal(typeof contracts.validateCallerIdentity, "function");
  assert.equal(contracts.DEFAULT_EXPIRY_WINDOW_SECONDS, DEFAULT_EXPIRY_WINDOW_SECONDS);
});

test("canonical expiry-window constants mirror the AWS minter (R15.8)", () => {
  assert.equal(MIN_EXPIRY_WINDOW_SECONDS, 300);
  assert.equal(MAX_EXPIRY_WINDOW_SECONDS, 86400);
  assert.equal(DEFAULT_EXPIRY_WINDOW_SECONDS, 3600);
  assert.equal(AUTH_TOKEN_SIGNATURE_ALG, "HS256");
});

// --- 1. Valid Auth_Token + Caller_Identity pass -----------------------------

test("a complete, canonical Auth_Token is valid with no errors", () => {
  const result = validateAuthToken(completeToken());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("the core design token shape { subject, issuedAt, expiryWindowSeconds, signature } is valid", () => {
  const result = validateAuthToken({
    subject: "sess_core",
    issuedAt: ISSUED_AT_MS,
    expiryWindowSeconds: 3600,
    signature: "sig",
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("a token with a `verified:true` marker (no signature string) is valid", () => {
  const result = validateAuthToken(completeToken({ signature: undefined, verified: true }));
  assert.equal(result.valid, true);
});

test("an ISO-8601 issuedAt is accepted", () => {
  const result = validateAuthToken(completeToken({ issuedAt: new Date(ISSUED_AT_MS).toISOString() }));
  assert.equal(result.valid, true);
});

test("a token without expiryWindowSeconds is valid (defaults to 3600 downstream)", () => {
  const token = completeToken();
  delete token.expiryWindowSeconds;
  const result = validateAuthToken(token);
  assert.equal(result.valid, true);
});

test("a token without entitledRunIds is valid (empty set at mint time, R15.4)", () => {
  const token = completeToken();
  delete token.entitledRunIds;
  const result = validateAuthToken(token);
  assert.equal(result.valid, true);
});

test("a complete, canonical Caller_Identity is valid with no errors", () => {
  const result = validateCallerIdentity(completeIdentity());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("a Caller_Identity with null issuedAt / null expiryWindowSeconds is valid", () => {
  const result = validateCallerIdentity(
    completeIdentity({ issuedAt: null, expiryWindowSeconds: null }),
  );
  assert.equal(result.valid, true);
});

test("a Caller_Identity with only principalId (no subject) is valid", () => {
  const result = validateCallerIdentity({ principalId: "p-1", entitledRunIds: [] });
  assert.equal(result.valid, true);
});

// --- 2. expiryWindowSeconds clamp domain [300, 86400] + default 3600 --------

test("resolveExpiryWindowSeconds clamps below MIN up to 300", () => {
  assert.deepEqual(resolveExpiryWindowSeconds(60), {
    seconds: MIN_EXPIRY_WINDOW_SECONDS,
    clamped: true,
    defaulted: false,
  });
});

test("resolveExpiryWindowSeconds clamps above MAX down to 86400", () => {
  assert.deepEqual(resolveExpiryWindowSeconds(999_999), {
    seconds: MAX_EXPIRY_WINDOW_SECONDS,
    clamped: true,
    defaulted: false,
  });
});

test("resolveExpiryWindowSeconds defaults to 3600 when unset / non-finite", () => {
  for (const bad of [undefined, null, NaN, Infinity, "not-a-number"]) {
    assert.deepEqual(resolveExpiryWindowSeconds(bad), {
      seconds: DEFAULT_EXPIRY_WINDOW_SECONDS,
      clamped: false,
      defaulted: true,
    });
  }
});

test("resolveExpiryWindowSeconds passes through an in-domain integer and truncates fractions", () => {
  assert.deepEqual(resolveExpiryWindowSeconds(7200), { seconds: 7200, clamped: false, defaulted: false });
  assert.deepEqual(resolveExpiryWindowSeconds(7200.9), { seconds: 7200, clamped: false, defaulted: false });
});

test("isExpiryWindowInDomain accepts the boundaries and rejects just outside", () => {
  assert.equal(isExpiryWindowInDomain(MIN_EXPIRY_WINDOW_SECONDS), true);
  assert.equal(isExpiryWindowInDomain(MAX_EXPIRY_WINDOW_SECONDS), true);
  assert.equal(isExpiryWindowInDomain(MIN_EXPIRY_WINDOW_SECONDS - 1), false);
  assert.equal(isExpiryWindowInDomain(MAX_EXPIRY_WINDOW_SECONDS + 1), false);
  assert.equal(isExpiryWindowInDomain(3600.5), false); // non-integer
});

test("validateAuthToken flags an out-of-domain expiryWindowSeconds with path+reason", () => {
  for (const bad of [299, 86401, 0, -1, 3600.5]) {
    const result = validateAuthToken(completeToken({ expiryWindowSeconds: bad }));
    assert.equal(result.valid, false);
    assert.ok(pathsOf(result).includes("expiryWindowSeconds"));
  }
});

// --- 3. entitledRunIds is a set (array of strings, dedup-friendly) ----------

test("normalizeEntitledRunIds de-duplicates and drops empties / non-strings", () => {
  // Mirrors the AWS minter EXACTLY: filter is `length > 0` (whitespace kept).
  assert.deepEqual(
    normalizeEntitledRunIds(["a", "a", "b", "", null, 7, "c"]),
    ["a", "b", "c"],
  );
  assert.deepEqual(normalizeEntitledRunIds("not-an-array"), []);
  assert.deepEqual(normalizeEntitledRunIds(undefined), []);
});

test("validateAuthToken accepts duplicate run ids (dedup-friendly, not an error)", () => {
  const result = validateAuthToken(completeToken({ entitledRunIds: ["run-a", "run-a", "run-b"] }));
  assert.equal(result.valid, true);
});

test("validateAuthToken flags a non-array entitledRunIds", () => {
  const result = validateAuthToken(completeToken({ entitledRunIds: "run-a" }));
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("entitledRunIds"));
});

test("validateAuthToken flags a non-string element with an indexed path", () => {
  const result = validateAuthToken(completeToken({ entitledRunIds: ["ok", 42, ""] }));
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("entitledRunIds[1]"));
  assert.ok(pathsOf(result).includes("entitledRunIds[2]"));
});

// --- 4. subject required ----------------------------------------------------

test("validateAuthToken flags a missing subject", () => {
  const token = completeToken();
  delete token.subject;
  const result = validateAuthToken(token);
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("subject"));
});

test("validateAuthToken flags an empty / non-string subject", () => {
  for (const bad of ["", "   ", 7, null, {}]) {
    const result = validateAuthToken(completeToken({ subject: bad }));
    assert.equal(result.valid, false);
    assert.ok(pathsOf(result).includes("subject"));
  }
});

test("validateCallerIdentity flags identity with no subject and no principalId", () => {
  const result = validateCallerIdentity({ entitledRunIds: [] });
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("principalId"));
});

// --- 5. missing / invalid fields flagged with path+reason -------------------

test("validateAuthToken flags a missing issuedAt", () => {
  const token = completeToken();
  delete token.issuedAt;
  const result = validateAuthToken(token);
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("issuedAt"));
});

test("validateAuthToken flags an unparseable issuedAt", () => {
  const result = validateAuthToken(completeToken({ issuedAt: "yesterday" }));
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("issuedAt"));
});

test("validateAuthToken flags a missing verifiable signature marker (R15.7)", () => {
  const token = completeToken();
  delete token.signature;
  const result = validateAuthToken(token);
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("signature"));
});

test("validateAuthToken flags an empty signature string with no verified flag", () => {
  const result = validateAuthToken(completeToken({ signature: "   ", verified: false }));
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("signature"));
});

test("every reported error carries a string path and a non-empty reason", () => {
  const result = validateAuthToken({ subject: 1, issuedAt: "x", entitledRunIds: 3 });
  assert.equal(result.valid, false);
  for (const e of result.errors) {
    assert.equal(typeof e.path, "string");
    assert.equal(typeof e.reason, "string");
    assert.ok(e.reason.length > 0);
  }
});

// --- 6. malformed input never throws (totality) -----------------------------

test("validateAuthToken is total: non-object inputs never throw", () => {
  for (const bad of [undefined, null, 0, 1, "x", true, [], NaN, Symbol("s")]) {
    const result = validateAuthToken(bad);
    assert.equal(result.valid, false);
    assert.ok(Array.isArray(result.errors));
  }
});

test("validateCallerIdentity is total: non-object inputs never throw", () => {
  for (const bad of [undefined, null, 0, "x", true, [], NaN]) {
    const result = validateCallerIdentity(bad);
    assert.equal(result.valid, false);
    assert.ok(Array.isArray(result.errors));
  }
});

// --- 7. Property-style sweeps (deterministic, in-process) -------------------

test("PROPERTY: a complete token with any single field corrupted stays total and invalid", () => {
  const corruptions = {
    subject: ["", 5, null, {}],
    issuedAt: ["nope", {}, null, NaN],
    expiryWindowSeconds: [299, 86401, -1, 1.5, "3600"],
    signature: ["", "   "],
    entitledRunIds: ["x", 5, [5], [""]],
  };
  for (const [field, badValues] of Object.entries(corruptions)) {
    for (const bad of badValues) {
      const token = completeToken();
      if (field === "signature") token.verified = false; // remove the fallback marker
      token[field] = bad;
      const result = validateAuthToken(token);
      assert.equal(result.valid, false, `expected ${field}=${String(bad)} to be invalid`);
      assert.ok(result.errors.length > 0);
      // a field path mentioning the corrupted field is reported
      assert.ok(
        pathsOf(result).some((p) => p === field || p.startsWith(`${field}[`)),
        `expected an error path for ${field}, got ${JSON.stringify(pathsOf(result))}`,
      );
    }
  }
});

test("PROPERTY: across the full expiry domain, resolve -> validate is self-consistent", () => {
  for (let s = MIN_EXPIRY_WINDOW_SECONDS - 50; s <= MAX_EXPIRY_WINDOW_SECONDS + 50; s += 137) {
    const { seconds } = resolveExpiryWindowSeconds(s);
    // the resolved/clamped value is always in-domain and validates
    assert.equal(isExpiryWindowInDomain(seconds), true);
    const result = validateAuthToken(completeToken({ expiryWindowSeconds: seconds }));
    assert.equal(result.valid, true, `resolved window ${seconds} should validate`);
  }
});

// --- 8. createCallerIdentity / isEntitledToRun ------------------------------

test("createCallerIdentity derives a schema-valid identity from token claims", () => {
  const identity = createCallerIdentity({
    sub: "sess_xyz",
    entitledRunIds: ["r1", "r1", "r2"],
    iat: Math.floor(ISSUED_AT_MS / 1000),
    expiryWindowSeconds: 7200,
  });
  assert.equal(identity.subject, "sess_xyz");
  assert.equal(identity.principalId, "sess_xyz");
  assert.deepEqual(identity.entitledRunIds, ["r1", "r2"]);
  assert.equal(identity.expiryWindowSeconds, 7200);
  const result = validateCallerIdentity(identity);
  assert.equal(result.valid, true);
});

test("createCallerIdentity defaults an out-of-domain window to the canonical policy", () => {
  const identity = createCallerIdentity({ subject: "s", expiryWindowSeconds: 10 });
  assert.equal(identity.expiryWindowSeconds, MIN_EXPIRY_WINDOW_SECONDS); // clamped
  const identity2 = createCallerIdentity({ subject: "s" });
  assert.equal(identity2.expiryWindowSeconds, DEFAULT_EXPIRY_WINDOW_SECONDS); // defaulted
});

test("isEntitledToRun reflects the entitlement set (R15.4/R15.5)", () => {
  const identity = createCallerIdentity({ subject: "s", entitledRunIds: ["run-1"] });
  assert.equal(isEntitledToRun(identity, "run-1"), true);
  assert.equal(isEntitledToRun(identity, "run-2"), false);
  assert.equal(isEntitledToRun(identity, ""), false);
  assert.equal(isEntitledToRun(null, "run-1"), false);
});
