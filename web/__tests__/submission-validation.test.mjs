// Tests for client-side submission validation + the thin submit guard
// (agentic-graph-acos-mcp-connector spec, task 7.1 / R1.2 / design Frontend
// `submitRun` / Correctness Property 5).
//
// Covers every field at its boundaries:
//   referenceUrl : empty, non-absolute/relative, non-http(s) scheme, valid ok
//   brief        : empty fail, 1 ok, 5000 ok, 5001 fail
//   budgetUsd    : <0.01 fail, 0.01 ok, 999999.99 ok, >999999.99 fail, non-number
// plus: a fully valid submission → valid:true with no errors; each violation
// names the offending field + carries a reason; and the submit guard does NOT
// forward to `POST /run` when invalid (and DOES when valid). ZERO network/browser.

import test from "node:test";
import assert from "node:assert/strict";

import {
  validateSubmission,
  guardedSubmit,
  BRIEF_MAX_LENGTH,
  BUDGET_USD_MIN,
  BUDGET_USD_MAX,
} from "../src/lib/submission-validation.js";

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

/** True iff `errors` contains at least one entry naming `field`. */
function hasFieldError(errors, field) {
  return errors.some((e) => e.field === field);
}

/** Assert every error carries a non-empty, human-readable reason string. */
function assertReasons(errors) {
  for (const e of errors) {
    assert.equal(typeof e.reason, "string");
    assert.ok(e.reason.length > 0, "each error carries a human-readable reason");
  }
}

// --- Fully valid submission -------------------------------------------------

test("a fully valid submission is valid with no errors", () => {
  const { valid, errors } = validateSubmission(validSubmission());
  assert.equal(valid, true);
  assert.deepEqual(errors, []);
});

// --- referenceUrl boundaries ------------------------------------------------

test("referenceUrl: empty string fails", () => {
  const { valid, errors } = validateSubmission(validSubmission({ referenceUrl: "" }));
  assert.equal(valid, false);
  assert.ok(hasFieldError(errors, "referenceUrl"));
  assertReasons(errors);
});

test("referenceUrl: missing fails", () => {
  const s = validSubmission();
  delete s.referenceUrl;
  const { valid, errors } = validateSubmission(s);
  assert.equal(valid, false);
  assert.ok(hasFieldError(errors, "referenceUrl"));
});

test("referenceUrl: a relative (non-absolute) URL fails", () => {
  const { valid, errors } = validateSubmission(validSubmission({ referenceUrl: "/videos/abc" }));
  assert.equal(valid, false);
  assert.ok(hasFieldError(errors, "referenceUrl"));
});

test("referenceUrl: a non-http(s) scheme fails", () => {
  for (const bad of ["ftp://example.com/x", "file:///etc/passwd", "data:text/plain,hi"]) {
    const { valid, errors } = validateSubmission(validSubmission({ referenceUrl: bad }));
    assert.equal(valid, false, `expected ${bad} to fail`);
    assert.ok(hasFieldError(errors, "referenceUrl"));
  }
});

test("referenceUrl: http and https are both accepted", () => {
  for (const ok of ["http://example.com/x", "https://example.com/x"]) {
    const { valid, errors } = validateSubmission(validSubmission({ referenceUrl: ok }));
    assert.equal(valid, true, `${ok}: ${JSON.stringify(errors)}`);
  }
});

// --- brief boundaries -------------------------------------------------------

test("brief: empty string fails", () => {
  const { valid, errors } = validateSubmission(validSubmission({ brief: "" }));
  assert.equal(valid, false);
  assert.ok(hasFieldError(errors, "brief"));
});

test("brief: exactly 1 character is accepted", () => {
  const { valid, errors } = validateSubmission(validSubmission({ brief: "x" }));
  assert.equal(valid, true, JSON.stringify(errors));
});

test("brief: exactly 5000 characters is accepted", () => {
  const { valid, errors } = validateSubmission(
    validSubmission({ brief: "b".repeat(BRIEF_MAX_LENGTH) }),
  );
  assert.equal(valid, true, JSON.stringify(errors));
});

test("brief: 5001 characters fails", () => {
  const { valid, errors } = validateSubmission(
    validSubmission({ brief: "b".repeat(BRIEF_MAX_LENGTH + 1) }),
  );
  assert.equal(valid, false);
  assert.ok(hasFieldError(errors, "brief"));
});

// --- budgetUsd boundaries ---------------------------------------------------

test("budgetUsd: below 0.01 fails", () => {
  for (const bad of [0, 0.009, -5]) {
    const { valid, errors } = validateSubmission(validSubmission({ budgetUsd: bad }));
    assert.equal(valid, false, `expected ${bad} to fail`);
    assert.ok(hasFieldError(errors, "budgetUsd"));
  }
});

test("budgetUsd: 0.01 (minimum) is accepted", () => {
  const { valid, errors } = validateSubmission(validSubmission({ budgetUsd: BUDGET_USD_MIN }));
  assert.equal(valid, true, JSON.stringify(errors));
});

test("budgetUsd: 999999.99 (maximum) is accepted", () => {
  const { valid, errors } = validateSubmission(validSubmission({ budgetUsd: BUDGET_USD_MAX }));
  assert.equal(valid, true, JSON.stringify(errors));
});

test("budgetUsd: above 999999.99 fails", () => {
  for (const bad of [1_000_000, 999_999_999.99]) {
    const { valid, errors } = validateSubmission(validSubmission({ budgetUsd: bad }));
    assert.equal(valid, false, `expected ${bad} to fail`);
    assert.ok(hasFieldError(errors, "budgetUsd"));
  }
});

test("budgetUsd: a non-number fails", () => {
  for (const bad of ["10", true, null, NaN, Infinity, {}]) {
    const { valid, errors } = validateSubmission(validSubmission({ budgetUsd: bad }));
    assert.equal(valid, false, `expected ${String(bad)} to fail`);
    assert.ok(hasFieldError(errors, "budgetUsd"));
  }
});

// --- Multiple invalid fields are all named ----------------------------------

test("every invalid field is named in a single validation pass", () => {
  const { valid, errors } = validateSubmission({
    referenceUrl: "",
    brief: "",
    budgetUsd: 0,
  });
  assert.equal(valid, false);
  assert.ok(hasFieldError(errors, "referenceUrl"));
  assert.ok(hasFieldError(errors, "brief"));
  assert.ok(hasFieldError(errors, "budgetUsd"));
  assertReasons(errors);
});

test("a non-object submission is rejected", () => {
  for (const bad of [null, undefined, "x", 5, []]) {
    const { valid, errors } = validateSubmission(bad);
    assert.equal(valid, false, `expected ${String(bad)} to fail`);
    assert.ok(errors.length >= 1);
  }
});

// --- Submit guard (Property 5 forwarding decision) --------------------------

test("guard: a valid submission forwards to POST /run", async () => {
  let forwarded = null;
  const res = await guardedSubmit(validSubmission(), async (body) => {
    forwarded = body;
    return { runId: "run-123" };
  });
  assert.equal(res.forwarded, true);
  assert.equal(res.valid, true);
  assert.deepEqual(res.errors, []);
  assert.ok(forwarded, "the forward seam was invoked for a valid submission");
  assert.equal(res.result.runId, "run-123");
});

test("guard: an invalid submission does NOT forward to POST /run", async () => {
  let forwarded = false;
  const res = await guardedSubmit(
    { referenceUrl: "", brief: "", budgetUsd: 0 },
    async () => {
      forwarded = true;
      return {};
    },
  );
  assert.equal(res.forwarded, false, "no POST /run forward on any violation (R1.2)");
  assert.equal(res.valid, false);
  assert.equal(forwarded, false);
  assert.ok(res.errors.length >= 1);
  assert.ok(hasFieldError(res.errors, "referenceUrl"));
  assert.ok(hasFieldError(res.errors, "brief"));
  assert.ok(hasFieldError(res.errors, "budgetUsd"));
});

test("guard: a single invalid field still blocks the forward", async () => {
  let forwarded = false;
  const res = await guardedSubmit(
    validSubmission({ budgetUsd: 1_000_000 }),
    async () => {
      forwarded = true;
    },
  );
  assert.equal(forwarded, false);
  assert.equal(res.forwarded, false);
  assert.ok(hasFieldError(res.errors, "budgetUsd"));
});

test("guard: a valid submission with no forward seam reports valid but unforwarded", async () => {
  const res = await guardedSubmit(validSubmission());
  assert.equal(res.valid, true);
  assert.equal(res.forwarded, false);
  assert.deepEqual(res.errors, []);
});
