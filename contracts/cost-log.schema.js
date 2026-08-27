// =============================================================================
// Cost_Log — canonical schema + pure validator (SSOT)
// agenticgraph-acos-mcp-connector spec · Section 8 (Data models / shared contracts)
// Task 8.4 · Requirements R10.1, R10.2 · design.md › Data Models › Cost_Log
//          · Correctness Property 19 (Cost_Log field-domain validity)
// =============================================================================
//
// WHY THIS FILE EXISTS
// --------------------
// Two distinct "Cost_Log" shapes live in the spec, and they must NOT be
// conflated. This module is the SINGLE SOURCE OF TRUTH for the FIRST one:
//
//   (A) RAW Ai_Gateway Cost_Log  — emitted per model call by the Ai_Gateway
//       (R10.1, R10.2; design Data Models › Cost_Log). Canonical SNAKE_CASE:
//         { model, prompt_tokens, completion_tokens, cache_hits,
//           estimated_cost_usd, incomplete }
//       This is the field-domain contract validated here (Property 19).
//
//   (B) Director per-stage aggregation record — recorded by the Director in the
//       Run_Manifest (R2.4; Property 20). Canonical CAMELCASE:
//         { stageId, estimatedCostUsd, actualCostUsd }
//       This is a DIFFERENT record and is already owned by
//       `mcp/video-remix/cost-log.js` (buildModelStageCostLogs /
//       aggregateCostLogs). It is NOT what this schema validates.
//
// See FIELD-NAMING RECONCILIATION at the bottom for the canonical decision and
// the snake_case ↔ camelCase mapping between (A) and (B).
//
// This module is:
//   - framework-agnostic and dependency-free (no JSON-schema lib),
//   - plain ESM ("type":"module") reachable by every tier (.js / .mjs),
//   - a PURE validator: `validateCostLog(c) -> { valid, errors:[{path,reason}] }`
//     that NEVER throws, makes ZERO network calls, and is fully deterministic.
//
// This task PUBLISHES the SSOT only. Existing tiers are NOT re-pointed here yet;
// the shape mirrors EXACTLY the raw Ai_Gateway Cost_Log described in the design
// (and referenced by `mcp/video-remix/cost-log.js` as "the raw Ai_Gateway
// token-bearing Cost_Log ... field-domain validity is task 8.4 / Property 19").
// =============================================================================

// -----------------------------------------------------------------------------
// Canonical field constants + unknown indicator
// -----------------------------------------------------------------------------

/**
 * The explicit "unknown" indicator (R10.2). When a provider does not report a
 * token count, the affected token field is set to this exact value rather than
 * being dropped, and the entry is marked `incomplete: true`.
 */
export const COST_LOG_UNKNOWN = "unknown";

/**
 * Canonical RAW Ai_Gateway Cost_Log field names — SNAKE_CASE per the design
 * Data Models and R10.1/R10.2 (stable for cross-tier use).
 */
export const COST_LOG_FIELDS = Object.freeze({
  MODEL: "model",
  PROMPT_TOKENS: "prompt_tokens",
  COMPLETION_TOKENS: "completion_tokens",
  CACHE_HITS: "cache_hits",
  ESTIMATED_COST_USD: "estimated_cost_usd",
  INCOMPLETE: "incomplete",
});

/** The token-count fields that may carry the unknown indicator (R10.2). */
export const COST_LOG_TOKEN_FIELDS = Object.freeze([
  COST_LOG_FIELDS.PROMPT_TOKENS,
  COST_LOG_FIELDS.COMPLETION_TOKENS,
]);

/**
 * Canonical mapping from the RAW Ai_Gateway Cost_Log (snake_case, this module)
 * to the Director per-stage aggregation record (camelCase, owned by
 * `mcp/video-remix/cost-log.js`). Documents the reconciliation so neither tier
 * forks the field names. NOTE: the Director record carries
 * `estimatedCostUsd`/`actualCostUsd`; only `estimated_cost_usd` has a direct
 * raw counterpart — `actualCostUsd` is a Director-computed value with no raw
 * Ai_Gateway field, and `stageId` is added by the Director.
 */
export const COST_LOG_DIRECTOR_FIELD_MAP = Object.freeze({
  estimated_cost_usd: "estimatedCostUsd",
});

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

function isNonNegativeInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNonNegativeNumber(value) {
  return isFiniteNumber(value) && value >= 0;
}

/** Is a value the explicit unknown indicator (R10.2)? */
export function isUnknownIndicator(value) {
  return value === COST_LOG_UNKNOWN;
}

/**
 * Is a token-count value in its valid domain — an integer ≥ 0 OR the explicit
 * unknown indicator (R10.1 prompt_tokens/completion_tokens; R10.2)? Pure.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isTokenCountInDomain(value) {
  return isNonNegativeInteger(value) || isUnknownIndicator(value);
}

// -----------------------------------------------------------------------------
// Validator — pure, never throws, returns structured {path, reason} errors
// -----------------------------------------------------------------------------

/**
 * Validate a RAW Ai_Gateway Cost_Log against the canonical SSOT schema
 * (design Data Models › Cost_Log; R10.1, R10.2; Property 19).
 *
 * Field-domain constraints (Property 19):
 *   * `model`              — non-empty string. The unknown case is expressed by
 *                            the explicit `"unknown"` value, which is itself a
 *                            non-empty string, so a single rule covers both
 *                            "non-empty model name" and the unknown indicator.
 *                            REQUIRED.
 *   * `prompt_tokens`      — integer ≥ 0 OR the `"unknown"` indicator. REQUIRED.
 *   * `completion_tokens`  — integer ≥ 0 OR the `"unknown"` indicator. REQUIRED.
 *   * `cache_hits`         — integer ≥ 0 (no unknown indicator permitted; the
 *                            gateway always knows its own cache outcome).
 *                            REQUIRED.
 *   * `estimated_cost_usd` — number ≥ 0.00. REQUIRED.
 *   * `incomplete`         — boolean. REQUIRED. Cross-field rule (R10.2): MUST
 *                            be `true` when any token field is unknown, and MUST
 *                            be `false` when both token counts are concrete
 *                            integers. This is what makes an unknown-token entry
 *                            "marked incomplete and retained rather than
 *                            discarded".
 *
 * Pure and total: any input (including `undefined`, `null`, primitives) yields
 * a result object and never throws.
 *
 * @param {unknown} costLog
 * @returns {{ valid: boolean, errors: Array<{ path: string, reason: string }> }}
 */
export function validateCostLog(costLog) {
  const errors = [];
  const add = (path, reason) => errors.push({ path, reason });

  if (!isPlainObject(costLog)) {
    add("", "Cost_Log must be a non-null object");
    return { valid: false, errors };
  }

  validateModel(costLog, add);
  validateTokenField(costLog, COST_LOG_FIELDS.PROMPT_TOKENS, add);
  validateTokenField(costLog, COST_LOG_FIELDS.COMPLETION_TOKENS, add);
  validateCacheHits(costLog, add);
  validateEstimatedCost(costLog, add);
  validateIncomplete(costLog, add);

  return { valid: errors.length === 0, errors };
}

// --- per-field validators ----------------------------------------------------

function validateModel(c, add) {
  const field = COST_LOG_FIELDS.MODEL;
  if (!(field in c)) return add(field, "required field is missing");
  // Non-empty string covers both a real model name and the "unknown" indicator
  // (which is itself a non-empty string).
  if (!isNonEmptyString(c[field])) {
    add(field, `must be a non-empty string (or the "${COST_LOG_UNKNOWN}" indicator)`);
  }
}

function validateTokenField(c, field, add) {
  if (!(field in c)) return add(field, "required field is missing");
  if (!isTokenCountInDomain(c[field])) {
    add(field, `must be an integer >= 0 or the "${COST_LOG_UNKNOWN}" indicator`);
  }
}

function validateCacheHits(c, add) {
  const field = COST_LOG_FIELDS.CACHE_HITS;
  if (!(field in c)) return add(field, "required field is missing");
  if (!isNonNegativeInteger(c[field])) {
    add(field, "must be an integer >= 0");
  }
}

function validateEstimatedCost(c, add) {
  const field = COST_LOG_FIELDS.ESTIMATED_COST_USD;
  if (!(field in c)) return add(field, "required field is missing");
  if (!isNonNegativeNumber(c[field])) {
    add(field, "must be a number >= 0.00");
  }
}

/**
 * `incomplete` is a required boolean AND must agree with the token fields
 * (R10.2): true when any token field is unknown, false when both are concrete
 * non-negative integers. The consistency rule is only enforced once the token
 * fields are themselves in-domain, so a single malformed token field is not
 * double-reported as an `incomplete` mismatch.
 */
function validateIncomplete(c, add) {
  const field = COST_LOG_FIELDS.INCOMPLETE;
  if (!(field in c)) return add(field, "required field is missing");
  if (typeof c[field] !== "boolean") {
    return add(field, "must be a boolean");
  }

  const tokensInDomain = COST_LOG_TOKEN_FIELDS.every((f) => isTokenCountInDomain(c[f]));
  if (!tokensInDomain) return; // token-field error already reported; skip cross-check

  const anyUnknown = COST_LOG_TOKEN_FIELDS.some((f) => isUnknownIndicator(c[f]));
  if (anyUnknown && c[field] !== true) {
    add(field, "must be true when any token count is the unknown indicator (R10.2)");
  } else if (!anyUnknown && c[field] !== false) {
    add(field, "must be false when all token counts are concrete integers (R10.2)");
  }
}

// -----------------------------------------------------------------------------
// Convenience factory — a minimal, schema-valid Cost_Log.
// Derives `incomplete` from the token fields so the cross-field rule holds by
// construction (R10.2), mirroring how the Ai_Gateway would mark an entry.
// -----------------------------------------------------------------------------

/**
 * Build a canonical, schema-valid RAW Ai_Gateway Cost_Log. Any token count that
 * is not a non-negative integer is normalized to the unknown indicator, and
 * `incomplete` is derived to satisfy the R10.2 consistency rule.
 *
 * @param {{ model?: string, prompt_tokens?: number|string, completion_tokens?: number|string, cache_hits?: number, estimated_cost_usd?: number }} [init]
 * @returns {object} a Cost_Log that passes validateCostLog
 */
export function createCostLog(init = {}) {
  const normalizeToken = (value) =>
    isNonNegativeInteger(value) ? value : COST_LOG_UNKNOWN;

  const prompt_tokens = normalizeToken(init.prompt_tokens);
  const completion_tokens = normalizeToken(init.completion_tokens);
  const incomplete =
    isUnknownIndicator(prompt_tokens) || isUnknownIndicator(completion_tokens);

  return {
    model: isNonEmptyString(init.model) ? init.model : COST_LOG_UNKNOWN,
    prompt_tokens,
    completion_tokens,
    cache_hits: isNonNegativeInteger(init.cache_hits) ? init.cache_hits : 0,
    estimated_cost_usd: isNonNegativeNumber(init.estimated_cost_usd)
      ? init.estimated_cost_usd
      : 0,
    incomplete,
  };
}

// =============================================================================
// FIELD-NAMING RECONCILIATION (canonical decision)
// =============================================================================
// CANONICAL: the RAW Ai_Gateway Cost_Log validated by THIS module uses
// SNAKE_CASE field names exactly as the design Data Models and R10.1/R10.2
// specify: { model, prompt_tokens, completion_tokens, cache_hits,
// estimated_cost_usd, incomplete }. This is Property 19's contract.
//
// The camelCase record produced by `mcp/video-remix/cost-log.js`
// ({ stageId, estimatedCostUsd, actualCostUsd }) is a SEPARATE artifact — the
// Director's per-stage Run_Manifest aggregation (R2.4 / Property 20), NOT the
// raw Ai_Gateway Cost_Log. That module's own header already states the raw
// token-bearing Cost_Log "field-domain validity is task 8.4 / Property 19",
// i.e. this file. The two are intentionally distinct:
//
//   raw Ai_Gateway Cost_Log (here)        Director aggregation (mcp module)
//   --------------------------------      ---------------------------------
//   model                                  stageId            (added)
//   prompt_tokens   | "unknown"            —
//   completion_tokens | "unknown"          —
//   cache_hits                             —
//   estimated_cost_usd  ─────────────────► estimatedCostUsd   (COST_LOG_DIRECTOR_FIELD_MAP)
//   incomplete                             —
//                                          actualCostUsd      (Director-computed; no raw field)
//
// Only `estimated_cost_usd → estimatedCostUsd` has a direct counterpart; it is
// published in COST_LOG_DIRECTOR_FIELD_MAP. No tier is re-pointed by this task;
// the SSOT is published for later integration to consume without forking names.
// =============================================================================
