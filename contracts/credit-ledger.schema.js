// =============================================================================
// Credit_Ledger event — canonical schema + pure validator (SSOT)
// agentic-graph-acos-mcp-connector spec · Section 8 (Data models / shared contracts)
// Task 8.5 · Requirements R8.4, R8.5 · design.md › Data Models › CreditLedgerEvent
// =============================================================================
//
// WHY THIS FILE EXISTS
// --------------------
// A Credit_Ledger event records, for one rendered shot, the provider identity
// and the provider spend incurred (R8.4), with a zero-spend event written when
// a shot routes to the deterministic mock provider (R8.5). The shape is
// currently emitted ad-hoc by the Render_Harness seam
// (`createDeterministicLedgerClient` / `renderLedgerEventId` in
// `mcp/video-remix/render-providers.js`) and persisted by the live
// `StrytreeCreditLedgerActor`. This module is the SINGLE SOURCE OF TRUTH for
// the canonical event shape so no tier forks the field names.
//
// This module is:
//   - framework-agnostic and dependency-free (no JSON-schema lib),
//   - plain ESM ("type":"module") reachable by every tier (.js / .mjs),
//   - a PURE validator: `validateCreditLedgerEvent(e) -> { valid, errors:[{path,reason}] }`
//     that NEVER throws, makes ZERO network calls, and is fully deterministic.
//
// This task PUBLISHES the SSOT only. Existing tiers are NOT re-pointed here yet
// (later integration tasks own that).
//
// See SPEND-REPRESENTATION RECONCILIATION at the bottom for the canonical
// decision (USD vs cents) and the cents↔usd mapping helpers.
// =============================================================================

// -----------------------------------------------------------------------------
// Canonical field constants + provider identities
// -----------------------------------------------------------------------------

/**
 * Canonical Credit_Ledger event field names — CAMELCASE, exactly as the design
 * Data Models › CreditLedgerEvent and the task title specify. The render-harness
 * seam emits the same id/run/shot/provider fields; only the spend field name
 * differs by representation (see SPEND-REPRESENTATION RECONCILIATION).
 */
export const CREDIT_LEDGER_FIELDS = Object.freeze({
  LEDGER_EVENT_ID: "ledgerEventId",
  RUN_ID: "runId",
  SHOT_ID: "shotId",
  PROVIDER: "provider",
  PROVIDER_SPEND_USD: "providerSpendUsd",
});

/** The required non-empty identity fields on every Credit_Ledger event. */
export const CREDIT_LEDGER_ID_FIELDS = Object.freeze([
  CREDIT_LEDGER_FIELDS.LEDGER_EVENT_ID,
  CREDIT_LEDGER_FIELDS.RUN_ID,
  CREDIT_LEDGER_FIELDS.SHOT_ID,
]);

/**
 * Provider identities (R8.4). Mirrors the constants in
 * `mcp/video-remix/render-providers.js`: the live-path BytePlus/external video provider render
 * queue and the deterministic zero-spend mock (the R8.5 fallback).
 */
export const CREDIT_LEDGER_PROVIDER = Object.freeze({
  BYTEPLUS_QUEUE: "byteplus-queue",
  MOCK: "mock",
});

/** The render-harness ledger-event spend field name (integer cents). */
export const RENDER_LEDGER_SPEND_CENTS_FIELD = "providerSpendCents";

// -----------------------------------------------------------------------------
// Small pure predicates (no throw, no I/O)
// -----------------------------------------------------------------------------

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeNumber(value) {
  return isFiniteNumber(value) && value >= 0;
}

function isNonNegativeInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

// -----------------------------------------------------------------------------
// Canonical spend representation + cents↔usd mapping helpers
// -----------------------------------------------------------------------------

/**
 * Convert integer provider-spend cents (the render-harness representation) to
 * the canonical USD decimal. Uses the SAME convention as
 * `mcp/video-remix/{cost-log,budget-meters,reconciliation}.js`
 * (`Number((cents / 100).toFixed(2))`) so ledger sums reconcile without float
 * drift. Pure; non-finite / negative input normalizes to 0.
 *
 * @param {unknown} cents
 * @returns {number} USD decimal >= 0
 */
export function centsToUsd(cents) {
  if (!isFiniteNumber(cents)) return 0;
  const safe = Math.max(0, Math.round(cents));
  return Number((safe / 100).toFixed(2));
}

/**
 * Convert a canonical USD decimal to integer provider-spend cents (the
 * render-harness representation). Inverse of {@link centsToUsd} within cent
 * precision. Pure; non-finite / negative input normalizes to 0.
 *
 * @param {unknown} usd
 * @returns {number} integer cents >= 0
 */
export function usdToCents(usd) {
  if (!isFiniteNumber(usd)) return 0;
  return Math.max(0, Math.round(usd * 100));
}

/**
 * Map a render-harness ledger event (`{ ledgerEventId, runId, shotId, provider,
 * providerSpendCents }`, as emitted by `createDeterministicLedgerClient`) to a
 * canonical Credit_Ledger event (`providerSpendUsd`). This is the documented
 * bridge between the two representations so neither side forks. Pure.
 *
 * @param {object} renderEvent
 * @returns {object} canonical Credit_Ledger event
 */
export function creditLedgerEventFromRenderEvent(renderEvent = {}) {
  const e = isPlainObject(renderEvent) ? renderEvent : {};
  return {
    ledgerEventId: e.ledgerEventId,
    runId: e.runId,
    shotId: e.shotId,
    provider: e.provider,
    providerSpendUsd: centsToUsd(e[RENDER_LEDGER_SPEND_CENTS_FIELD]),
  };
}

/**
 * Inverse mapping — project a canonical Credit_Ledger event back to the
 * render-harness shape (`providerSpendCents`). Together with
 * {@link creditLedgerEventFromRenderEvent} this round-trips spend within cent
 * precision. Pure.
 *
 * @param {object} event
 * @returns {object} render-harness ledger event shape
 */
export function renderEventFromCreditLedgerEvent(event = {}) {
  const e = isPlainObject(event) ? event : {};
  return {
    ledgerEventId: e.ledgerEventId,
    runId: e.runId,
    shotId: e.shotId,
    provider: e.provider,
    providerSpendCents: usdToCents(e.providerSpendUsd),
  };
}

// -----------------------------------------------------------------------------
// Validator — pure, never throws, returns structured {path, reason} errors
// -----------------------------------------------------------------------------

/**
 * Validate a Credit_Ledger event against the canonical SSOT schema
 * (design Data Models › CreditLedgerEvent; R8.4, R8.5).
 *
 * Field-domain constraints:
 *   * `ledgerEventId`    — non-empty string. REQUIRED (R8.4: each completed shot
 *                          returns exactly one ledger event identifier).
 *   * `runId`            — non-empty string. REQUIRED.
 *   * `shotId`           — non-empty string. REQUIRED.
 *   * `provider`         — non-empty string provider identity. REQUIRED (R8.4).
 *   * `providerSpendUsd` — number >= 0. REQUIRED. Zero is explicitly valid and
 *                          is the value recorded for the mock provider (R8.5).
 *
 * Pure and total: any input (including `undefined`, `null`, primitives) yields
 * a result object and never throws.
 *
 * @param {unknown} event
 * @returns {{ valid: boolean, errors: Array<{ path: string, reason: string }> }}
 */
export function validateCreditLedgerEvent(event) {
  const errors = [];
  const add = (path, reason) => errors.push({ path, reason });

  if (!isPlainObject(event)) {
    add("", "Credit_Ledger event must be a non-null object");
    return { valid: false, errors };
  }

  for (const field of CREDIT_LEDGER_ID_FIELDS) {
    validateNonEmptyString(event, field, add);
  }
  validateNonEmptyString(event, CREDIT_LEDGER_FIELDS.PROVIDER, add);
  validateProviderSpend(event, add);

  return { valid: errors.length === 0, errors };
}

// --- per-field validators ----------------------------------------------------

function validateNonEmptyString(e, field, add) {
  if (!(field in e)) return add(field, "required field is missing");
  if (!isNonEmptyString(e[field])) {
    add(field, "must be a non-empty string");
  }
}

function validateProviderSpend(e, add) {
  const field = CREDIT_LEDGER_FIELDS.PROVIDER_SPEND_USD;
  if (!(field in e)) return add(field, "required field is missing");
  if (!isNonNegativeNumber(e[field])) {
    add(field, "must be a number >= 0 (0 for the mock provider, R8.5)");
  }
}

// -----------------------------------------------------------------------------
// Convenience factory — a minimal, schema-valid Credit_Ledger event.
// -----------------------------------------------------------------------------

/**
 * Build a canonical, schema-valid Credit_Ledger event. A non-finite / negative
 * spend normalizes to 0 (the mock-provider value, R8.5); a `providerSpendCents`
 * field, if supplied instead of `providerSpendUsd`, is converted via
 * {@link centsToUsd} so render-harness events flow through cleanly.
 *
 * @param {{ ledgerEventId?: string, runId?: string, shotId?: string, provider?: string, providerSpendUsd?: number, providerSpendCents?: number }} [init]
 * @returns {object} a Credit_Ledger event that passes validateCreditLedgerEvent
 */
export function createCreditLedgerEvent(init = {}) {
  const source = isPlainObject(init) ? init : {};
  let spendUsd;
  if (isNonNegativeNumber(source.providerSpendUsd)) {
    spendUsd = source.providerSpendUsd;
  } else if (RENDER_LEDGER_SPEND_CENTS_FIELD in source) {
    spendUsd = centsToUsd(source[RENDER_LEDGER_SPEND_CENTS_FIELD]);
  } else {
    spendUsd = 0;
  }

  return {
    ledgerEventId: isNonEmptyString(source.ledgerEventId)
      ? source.ledgerEventId
      : "ledger_render_unknown",
    runId: isNonEmptyString(source.runId) ? source.runId : "run_unknown",
    shotId: isNonEmptyString(source.shotId) ? source.shotId : "shot_unknown",
    provider: isNonEmptyString(source.provider)
      ? source.provider
      : CREDIT_LEDGER_PROVIDER.MOCK,
    providerSpendUsd: spendUsd,
  };
}

/** Re-export for callers needing the integer-cents predicate. */
export { isNonNegativeInteger as isNonNegativeIntegerCents };

// =============================================================================
// SPEND-REPRESENTATION RECONCILIATION (canonical decision)
// =============================================================================
// TWO representations of per-shot provider spend exist in the codebase:
//
//   (A) render-harness seam — `mcp/video-remix/render-providers.js`
//       `createDeterministicLedgerClient().record({ ..., providerSpendCents })`
//       stores INTEGER CENTS, matching the cost-log / budget-meters /
//       reconciliation modules which accumulate in cents to avoid float drift.
//
//   (B) design Data Models › CreditLedgerEvent AND this task's title
//       `providerSpendUsd: decimal` (0 for the mock provider, R8.5).
//
// CANONICAL DECISION: the published Credit_Ledger event uses **providerSpendUsd
// (a USD decimal >= 0)**, matching the design Data Models (the SSOT for the
// cross-tier contract) and the task title. USD is the unit Budget_Meters and
// the Demo_Pack surface to operators/UI, so the cross-tier contract speaks USD.
//
// Integer cents remains the INTERNAL accounting unit for the render harness and
// the reconciliation math (it is exact and drift-free). The two are bridged by
// the documented, round-tripping helpers in THIS module:
//
//   render event { providerSpendCents }
//        │  creditLedgerEventFromRenderEvent  (centsToUsd: cents/100 -> 2dp USD)
//        ▼
//   canonical event { providerSpendUsd }
//        │  renderEventFromCreditLedgerEvent  (usdToCents: round(usd*100))
//        ▼
//   render event { providerSpendCents }
//
// centsToUsd / usdToCents reuse the EXACT convention already in
// `mcp/video-remix/{cost-log,budget-meters,reconciliation}.js`
// (`Number((cents/100).toFixed(2))` and `Math.round(usd*100)`) so a value that
// originates in the render harness reconciles against Budget_Meters within the
// ±0.01 USD tolerance (R10.4) with no representation fork. No tier is
// re-pointed by this task; the SSOT + bridge are published for later
// integration to consume.
// =============================================================================
