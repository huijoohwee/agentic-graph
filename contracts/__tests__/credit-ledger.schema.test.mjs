// =============================================================================
// Credit_Ledger event SSOT schema — unit + property tests
// agentic-graph-acos-mcp-connector spec · Task 8.5 · Requirements R8.4, R8.5
// Pure validator + cents<->usd mapping: ZERO network calls, deterministic.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateCreditLedgerEvent,
  createCreditLedgerEvent,
  creditLedgerEventFromRenderEvent,
  renderEventFromCreditLedgerEvent,
  centsToUsd,
  usdToCents,
  CREDIT_LEDGER_FIELDS,
  CREDIT_LEDGER_ID_FIELDS,
  CREDIT_LEDGER_PROVIDER,
  RENDER_LEDGER_SPEND_CENTS_FIELD,
} from "../credit-ledger.schema.js";

// Verify the module is reachable via the aggregate entry point too (SSOT).
import * as contracts from "../index.js";

// --- helpers ----------------------------------------------------------------

/** A complete, canonical, schema-valid Credit_Ledger event. */
function completeEvent(overrides = {}) {
  return {
    ledgerEventId: "ledger_render_run-1_shot-1",
    runId: "run-1",
    shotId: "shot-1",
    provider: CREDIT_LEDGER_PROVIDER.BYTEPLUS_QUEUE,
    providerSpendUsd: 0.12,
    ...overrides,
  };
}

const pathsOf = (result) => result.errors.map((e) => e.path);

// --- 0. SSOT reachability ---------------------------------------------------

test("credit-ledger schema is re-exported from the aggregate contracts entry point", () => {
  assert.equal(typeof contracts.validateCreditLedgerEvent, "function");
  assert.equal(typeof contracts.createCreditLedgerEvent, "function");
  assert.equal(typeof contracts.centsToUsd, "function");
  assert.equal(contracts.CREDIT_LEDGER_PROVIDER.MOCK, CREDIT_LEDGER_PROVIDER.MOCK);
});

test("canonical field constants are stable", () => {
  assert.deepEqual(Object.values(CREDIT_LEDGER_FIELDS), [
    "ledgerEventId",
    "runId",
    "shotId",
    "provider",
    "providerSpendUsd",
  ]);
  assert.deepEqual(CREDIT_LEDGER_ID_FIELDS, ["ledgerEventId", "runId", "shotId"]);
  assert.equal(RENDER_LEDGER_SPEND_CENTS_FIELD, "providerSpendCents");
});

// --- 1. a valid event passes -------------------------------------------------

test("a complete, canonical Credit_Ledger event is valid with no errors", () => {
  const result = validateCreditLedgerEvent(completeEvent());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

// --- 2. required ids must be non-empty --------------------------------------

test("each required id field flagged when empty / blank / non-string / missing", () => {
  for (const field of CREDIT_LEDGER_ID_FIELDS) {
    for (const bad of ["", "   ", 7, null, {}, []]) {
      const result = validateCreditLedgerEvent(completeEvent({ [field]: bad }));
      assert.equal(result.valid, false, `expected ${field}=${String(bad)} invalid`);
      assert.ok(pathsOf(result).includes(field));
    }
    const missing = completeEvent();
    delete missing[field];
    const result = validateCreditLedgerEvent(missing);
    assert.equal(result.valid, false);
    assert.ok(pathsOf(result).includes(field));
  }
});

// --- 3. provider identity required ------------------------------------------

test("provider identity flagged when empty / blank / non-string / missing", () => {
  for (const bad of ["", "  ", 1, null, {}]) {
    const result = validateCreditLedgerEvent(completeEvent({ provider: bad }));
    assert.equal(result.valid, false);
    assert.ok(pathsOf(result).includes("provider"));
  }
  const missing = completeEvent();
  delete missing.provider;
  assert.ok(pathsOf(validateCreditLedgerEvent(missing)).includes("provider"));
});

test("both byteplus-queue and mock provider identities are valid", () => {
  for (const provider of Object.values(CREDIT_LEDGER_PROVIDER)) {
    assert.equal(validateCreditLedgerEvent(completeEvent({ provider })).valid, true);
  }
});

// --- 4. providerSpendUsd >= 0 (0 valid for mock, R8.5) ----------------------

test("providerSpendUsd accepts 0 (mock provider, R8.5) and positive decimals", () => {
  for (const ok of [0, 0.0, 0.01, 0.12, 9999.99]) {
    assert.equal(
      validateCreditLedgerEvent(completeEvent({ providerSpendUsd: ok })).valid,
      true,
    );
  }
});

test("zero-spend mock event is valid (R8.5)", () => {
  const result = validateCreditLedgerEvent(
    completeEvent({ provider: CREDIT_LEDGER_PROVIDER.MOCK, providerSpendUsd: 0 }),
  );
  assert.equal(result.valid, true);
});

test("providerSpendUsd flagged when negative / non-number / NaN / Infinity / missing", () => {
  for (const bad of [-0.01, -5, "1.0", null, NaN, Infinity, {}]) {
    const result = validateCreditLedgerEvent(completeEvent({ providerSpendUsd: bad }));
    assert.equal(result.valid, false, `expected providerSpendUsd=${String(bad)} invalid`);
    assert.ok(pathsOf(result).includes("providerSpendUsd"));
  }
  const missing = completeEvent();
  delete missing.providerSpendUsd;
  assert.ok(pathsOf(validateCreditLedgerEvent(missing)).includes("providerSpendUsd"));
});

// --- 5. cents <-> usd mapping helper round-trips ----------------------------

test("centsToUsd / usdToCents convert with the cents-exact convention", () => {
  assert.equal(centsToUsd(12), 0.12);
  assert.equal(centsToUsd(0), 0);
  assert.equal(centsToUsd(100), 1);
  assert.equal(usdToCents(0.12), 12);
  assert.equal(usdToCents(1), 100);
  // non-finite / negative normalize to 0
  assert.equal(centsToUsd(NaN), 0);
  assert.equal(centsToUsd(-5), 0);
  assert.equal(usdToCents(NaN), 0);
  assert.equal(usdToCents(-1), 0);
});

test("PROPERTY: cents -> usd -> cents round-trips for any non-negative integer cents", () => {
  for (let cents = 0; cents <= 100000; cents += 7) {
    assert.equal(usdToCents(centsToUsd(cents)), cents, `round-trip failed at ${cents}`);
  }
});

test("render-harness ledger event maps to a valid canonical event and round-trips", () => {
  // shape exactly as createDeterministicLedgerClient().record(...) returns.
  const renderEvent = {
    ledgerEventId: "ledger_render_run-1_shot-1",
    runId: "run-1",
    shotId: "shot-1",
    provider: CREDIT_LEDGER_PROVIDER.BYTEPLUS_QUEUE,
    [RENDER_LEDGER_SPEND_CENTS_FIELD]: 12,
  };
  const canonical = creditLedgerEventFromRenderEvent(renderEvent);
  assert.equal(canonical.providerSpendUsd, 0.12);
  assert.equal(validateCreditLedgerEvent(canonical).valid, true);

  const back = renderEventFromCreditLedgerEvent(canonical);
  assert.deepEqual(back, renderEvent);
});

test("zero-spend render event maps to a valid zero-spend canonical event (R8.5)", () => {
  const renderEvent = {
    ledgerEventId: "ledger_render_run-1_shot-1_mock",
    runId: "run-1",
    shotId: "shot-1",
    provider: CREDIT_LEDGER_PROVIDER.MOCK,
    [RENDER_LEDGER_SPEND_CENTS_FIELD]: 0,
  };
  const canonical = creditLedgerEventFromRenderEvent(renderEvent);
  assert.equal(canonical.providerSpendUsd, 0);
  assert.equal(validateCreditLedgerEvent(canonical).valid, true);
});

// --- 6. each violation flagged with path + non-empty reason -----------------

test("every reported error carries a string path and a non-empty reason", () => {
  const result = validateCreditLedgerEvent({
    ledgerEventId: "",
    runId: 5,
    shotId: null,
    provider: "",
    providerSpendUsd: -1,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 5);
  for (const e of result.errors) {
    assert.equal(typeof e.path, "string");
    assert.equal(typeof e.reason, "string");
    assert.ok(e.reason.length > 0);
  }
});

// --- 7. malformed input never throws (totality) -----------------------------

test("validateCreditLedgerEvent is total: non-object inputs never throw", () => {
  for (const bad of [undefined, null, 0, 1, "x", true, [], NaN, Symbol("s")]) {
    const result = validateCreditLedgerEvent(bad);
    assert.equal(result.valid, false);
    assert.ok(Array.isArray(result.errors));
    assert.ok(result.errors.length > 0);
  }
});

test("mapping helpers are total: garbage input never throws", () => {
  for (const bad of [undefined, null, 0, "x", true, []]) {
    assert.doesNotThrow(() => creditLedgerEventFromRenderEvent(bad));
    assert.doesNotThrow(() => renderEventFromCreditLedgerEvent(bad));
  }
});

// --- 8. createCreditLedgerEvent factory derives a schema-valid event --------

test("createCreditLedgerEvent builds a valid event from usd or cents input", () => {
  const fromUsd = createCreditLedgerEvent({
    ledgerEventId: "ledger_render_r_s",
    runId: "r",
    shotId: "s",
    provider: CREDIT_LEDGER_PROVIDER.BYTEPLUS_QUEUE,
    providerSpendUsd: 0.5,
  });
  assert.equal(fromUsd.providerSpendUsd, 0.5);
  assert.equal(validateCreditLedgerEvent(fromUsd).valid, true);

  // cents input is converted via centsToUsd.
  const fromCents = createCreditLedgerEvent({
    runId: "r",
    shotId: "s",
    [RENDER_LEDGER_SPEND_CENTS_FIELD]: 12,
  });
  assert.equal(fromCents.providerSpendUsd, 0.12);
  assert.equal(validateCreditLedgerEvent(fromCents).valid, true);

  // a bare factory call still yields a valid, zero-spend mock event.
  const bare = createCreditLedgerEvent();
  assert.equal(bare.provider, CREDIT_LEDGER_PROVIDER.MOCK);
  assert.equal(bare.providerSpendUsd, 0);
  assert.equal(validateCreditLedgerEvent(bare).valid, true);
});

// --- 9. Property-style sweeps (deterministic, in-process) -------------------

test("PROPERTY: a complete event with any single field corrupted stays total and invalid", () => {
  const corruptions = {
    ledgerEventId: ["", "   ", 5, null, {}],
    runId: ["", "   ", 5, null, []],
    shotId: ["", "   ", 5, null, {}],
    provider: ["", "  ", 1, null, {}],
    providerSpendUsd: [-0.01, "1", null, NaN, Infinity, {}],
  };
  for (const [field, badValues] of Object.entries(corruptions)) {
    for (const bad of badValues) {
      const entry = completeEvent();
      entry[field] = bad;
      const result = validateCreditLedgerEvent(entry);
      assert.equal(result.valid, false, `expected ${field}=${String(bad)} invalid`);
      assert.ok(
        pathsOf(result).includes(field),
        `expected an error path for ${field}, got ${JSON.stringify(pathsOf(result))}`,
      );
    }
  }
});
