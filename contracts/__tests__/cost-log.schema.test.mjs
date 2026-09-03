// =============================================================================
// Cost_Log SSOT schema — unit + property tests
// agentic-graph-acos-mcp-connector spec · Task 8.4 · Requirements R10.1, R10.2
//   · Correctness Property 19 (Cost_Log field-domain validity)
// Pure validator: ZERO network calls, deterministic.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateCostLog,
  createCostLog,
  isUnknownIndicator,
  isTokenCountInDomain,
  COST_LOG_UNKNOWN,
  COST_LOG_FIELDS,
  COST_LOG_TOKEN_FIELDS,
  COST_LOG_DIRECTOR_FIELD_MAP,
} from "../cost-log.schema.js";

// Verify the module is reachable via the aggregate entry point too (SSOT).
import * as contracts from "../index.js";

// --- helpers ----------------------------------------------------------------

/** A complete, canonical, schema-valid Cost_Log (all token counts known). */
function completeCostLog(overrides = {}) {
  return {
    model: "byteplus/seed-1.6",
    prompt_tokens: 1200,
    completion_tokens: 340,
    cache_hits: 2,
    estimated_cost_usd: 0.0123,
    incomplete: false,
    ...overrides,
  };
}

const pathsOf = (result) => result.errors.map((e) => e.path);

// --- 0. SSOT reachability ---------------------------------------------------

test("cost-log schema is re-exported from the aggregate contracts entry point", () => {
  assert.equal(typeof contracts.validateCostLog, "function");
  assert.equal(typeof contracts.createCostLog, "function");
  assert.equal(contracts.COST_LOG_UNKNOWN, COST_LOG_UNKNOWN);
});

test("canonical field constants + unknown indicator are stable", () => {
  assert.equal(COST_LOG_UNKNOWN, "unknown");
  assert.deepEqual(Object.values(COST_LOG_FIELDS), [
    "model",
    "prompt_tokens",
    "completion_tokens",
    "cache_hits",
    "estimated_cost_usd",
    "incomplete",
  ]);
  assert.deepEqual(COST_LOG_TOKEN_FIELDS, ["prompt_tokens", "completion_tokens"]);
  // canonical snake_case -> camelCase Director mapping documented for reuse.
  assert.equal(COST_LOG_DIRECTOR_FIELD_MAP.estimated_cost_usd, "estimatedCostUsd");
});

// --- 1. a valid Cost_Log passes ---------------------------------------------

test("a complete, canonical Cost_Log is valid with no errors", () => {
  const result = validateCostLog(completeCostLog());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("zero token counts / zero cost / zero cache hits are valid", () => {
  const result = validateCostLog(
    completeCostLog({
      prompt_tokens: 0,
      completion_tokens: 0,
      cache_hits: 0,
      estimated_cost_usd: 0,
      incomplete: false,
    }),
  );
  assert.equal(result.valid, true);
});

// --- 2. model: non-empty OR "unknown" indicator -----------------------------

test("model = the explicit unknown indicator is valid", () => {
  const result = validateCostLog(completeCostLog({ model: COST_LOG_UNKNOWN }));
  assert.equal(result.valid, true);
});

test("model flagged when empty / blank / non-string / missing", () => {
  for (const bad of ["", "   ", 7, null, {}]) {
    const result = validateCostLog(completeCostLog({ model: bad }));
    assert.equal(result.valid, false);
    assert.ok(pathsOf(result).includes("model"));
  }
  const missing = completeCostLog();
  delete missing.model;
  const result = validateCostLog(missing);
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("model"));
});

// --- 3. token counts: integer >= 0 OR unknown indicator ---------------------

test("prompt/completion tokens accept the unknown indicator (entry marked incomplete)", () => {
  const result = validateCostLog(
    completeCostLog({
      prompt_tokens: COST_LOG_UNKNOWN,
      completion_tokens: COST_LOG_UNKNOWN,
      incomplete: true,
    }),
  );
  assert.equal(result.valid, true);
});

test("a single unknown token count is valid when incomplete is true", () => {
  const result = validateCostLog(
    completeCostLog({ prompt_tokens: COST_LOG_UNKNOWN, incomplete: true }),
  );
  assert.equal(result.valid, true);
});

test("token counts flagged when negative / non-integer / wrong string / null", () => {
  for (const field of COST_LOG_TOKEN_FIELDS) {
    for (const bad of [-1, 1.5, "unkown", "0", null, {}, NaN]) {
      const result = validateCostLog(completeCostLog({ [field]: bad }));
      assert.equal(result.valid, false, `expected ${field}=${String(bad)} invalid`);
      assert.ok(pathsOf(result).includes(field));
    }
  }
});

test("isTokenCountInDomain matches the integer>=0-or-unknown rule", () => {
  for (const ok of [0, 1, 999999, COST_LOG_UNKNOWN]) {
    assert.equal(isTokenCountInDomain(ok), true);
  }
  for (const bad of [-1, 1.5, "0", "", null, undefined, NaN]) {
    assert.equal(isTokenCountInDomain(bad), false);
  }
});

// --- 4. cache_hits: integer >= 0 (no unknown allowed) -----------------------

test("cache_hits flagged when negative / non-integer / unknown / missing", () => {
  for (const bad of [-1, 2.5, COST_LOG_UNKNOWN, "3", null]) {
    const result = validateCostLog(completeCostLog({ cache_hits: bad }));
    assert.equal(result.valid, false);
    assert.ok(pathsOf(result).includes("cache_hits"));
  }
  const missing = completeCostLog();
  delete missing.cache_hits;
  assert.ok(pathsOf(validateCostLog(missing)).includes("cache_hits"));
});

// --- 5. estimated_cost_usd: number >= 0.00 ----------------------------------

test("estimated_cost_usd accepts 0.00 and positive decimals", () => {
  for (const ok of [0, 0.0, 0.01, 12.34]) {
    assert.equal(validateCostLog(completeCostLog({ estimated_cost_usd: ok })).valid, true);
  }
});

test("estimated_cost_usd flagged when negative / non-number / missing", () => {
  for (const bad of [-0.01, -5, "1.0", null, NaN, Infinity]) {
    const result = validateCostLog(completeCostLog({ estimated_cost_usd: bad }));
    assert.equal(result.valid, false);
    assert.ok(pathsOf(result).includes("estimated_cost_usd"));
  }
  const missing = completeCostLog();
  delete missing.estimated_cost_usd;
  assert.ok(pathsOf(validateCostLog(missing)).includes("estimated_cost_usd"));
});

// --- 6. incomplete flag consistency (R10.2) ---------------------------------

test("incomplete must be a boolean and is required", () => {
  for (const bad of ["true", 1, null]) {
    const result = validateCostLog(completeCostLog({ incomplete: bad }));
    assert.equal(result.valid, false);
    assert.ok(pathsOf(result).includes("incomplete"));
  }
  const missing = completeCostLog();
  delete missing.incomplete;
  assert.ok(pathsOf(validateCostLog(missing)).includes("incomplete"));
});

test("incomplete=false flagged when a token count is unknown (must be true, R10.2)", () => {
  const result = validateCostLog(
    completeCostLog({ prompt_tokens: COST_LOG_UNKNOWN, incomplete: false }),
  );
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("incomplete"));
});

test("incomplete=true flagged when all token counts are concrete (must be false, R10.2)", () => {
  const result = validateCostLog(
    completeCostLog({ prompt_tokens: 10, completion_tokens: 20, incomplete: true }),
  );
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("incomplete"));
});

// --- 7. each violation flagged with path + non-empty reason -----------------

test("every reported error carries a string path and a non-empty reason", () => {
  const result = validateCostLog({
    model: "",
    prompt_tokens: -1,
    completion_tokens: "x",
    cache_hits: -3,
    estimated_cost_usd: -1,
    incomplete: "no",
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 5);
  for (const e of result.errors) {
    assert.equal(typeof e.path, "string");
    assert.equal(typeof e.reason, "string");
    assert.ok(e.reason.length > 0);
  }
});

// --- 8. malformed input never throws (totality) -----------------------------

test("validateCostLog is total: non-object inputs never throw", () => {
  for (const bad of [undefined, null, 0, 1, "x", true, [], NaN, Symbol("s")]) {
    const result = validateCostLog(bad);
    assert.equal(result.valid, false);
    assert.ok(Array.isArray(result.errors));
    assert.ok(result.errors.length > 0);
  }
});

// --- 9. createCostLog factory derives a schema-valid entry ------------------

test("createCostLog builds a valid entry and derives incomplete from tokens", () => {
  const known = createCostLog({
    model: "exa/search",
    prompt_tokens: 5,
    completion_tokens: 7,
    cache_hits: 1,
    estimated_cost_usd: 0.5,
  });
  assert.equal(known.incomplete, false);
  assert.equal(validateCostLog(known).valid, true);

  const unknownTokens = createCostLog({ model: "byteplus", completion_tokens: 9 });
  assert.equal(unknownTokens.prompt_tokens, COST_LOG_UNKNOWN); // missing -> unknown
  assert.equal(unknownTokens.incomplete, true); // derived
  assert.equal(validateCostLog(unknownTokens).valid, true);

  // a bare factory call still yields a valid, retained entry (unknown indicator).
  const bare = createCostLog();
  assert.equal(bare.model, COST_LOG_UNKNOWN);
  assert.equal(bare.incomplete, true);
  assert.equal(validateCostLog(bare).valid, true);
});

test("isUnknownIndicator only matches the exact indicator string", () => {
  assert.equal(isUnknownIndicator(COST_LOG_UNKNOWN), true);
  for (const bad of ["Unknown", "UNKNOWN", "", null, 0, undefined]) {
    assert.equal(isUnknownIndicator(bad), false);
  }
});

// --- 10. Property-style sweeps (deterministic, in-process) ------------------

test("PROPERTY: a complete entry with any single field corrupted stays total and invalid", () => {
  const corruptions = {
    model: ["", "   ", 5, null, {}],
    prompt_tokens: [-1, 1.5, "0", "unkown", null, NaN],
    completion_tokens: [-2, 3.3, "x", null, {}],
    cache_hits: [-1, 2.5, COST_LOG_UNKNOWN, "3", null],
    estimated_cost_usd: [-0.01, "1", null, NaN, Infinity],
    incomplete: ["true", 1, null, {}],
  };
  for (const [field, badValues] of Object.entries(corruptions)) {
    for (const bad of badValues) {
      const entry = completeCostLog();
      entry[field] = bad;
      const result = validateCostLog(entry);
      assert.equal(result.valid, false, `expected ${field}=${String(bad)} to be invalid`);
      assert.ok(
        pathsOf(result).includes(field),
        `expected an error path for ${field}, got ${JSON.stringify(pathsOf(result))}`,
      );
    }
  }
});

test("PROPERTY: factory-derived entries are always valid across the token domain", () => {
  const tokenSamples = [0, 1, 42, 999999, COST_LOG_UNKNOWN, -1, 1.5, "bad", null, undefined];
  for (const p of tokenSamples) {
    for (const c of tokenSamples) {
      const entry = createCostLog({
        model: "m",
        prompt_tokens: p,
        completion_tokens: c,
        cache_hits: 0,
        estimated_cost_usd: 0,
      });
      const result = validateCostLog(entry);
      assert.equal(result.valid, true, `factory entry for (${String(p)},${String(c)}) should validate`);
      // incomplete is derived to satisfy the R10.2 consistency rule.
      const anyUnknown = isUnknownIndicator(entry.prompt_tokens) || isUnknownIndicator(entry.completion_tokens);
      assert.equal(entry.incomplete, anyUnknown);
    }
  }
});
