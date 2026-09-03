// =============================================================================
// Shared fast-check arbitraries for the agentic-graph-acos-mcp-connector PBT suite.
//
// Spec task 9.1 created this module; spec task 9.4 FORMALIZES and EXTENDS it so
// EVERY edge case the design Testing Strategy calls out has an explicit, named,
// boundary-focused generator that the property tests consume directly (instead
// of re-deriving generators or sampling only random interior values):
//
//   - empty / whitespace strings                       -> emptyOrWhitespaceArb
//   - non-HTTP URLs / valid absolute HTTP(S) URLs       -> nonHttpUrlArb / httpUrlArb
//   - out-of-range / in-range budgets                   -> outOfRangeBudgetArb / inRangeBudgetArb
//   - N at the [1,500] shot boundaries                  -> shotCountBoundaryArb / shotCountOutOfRangeArb
//   - maxIterations at the [1,100] boundaries           -> maxIterationsBoundaryArb
//   - token ages straddling the 15-minute gate window   -> gateTokenAgeAroundWindowArb
//   - Approval_Token states {valid, expired, consumed,
//     mismatched, absent, bad-signature}               -> approvalTokenStateArb / tokenStateArb
//   - Auth_Token states {valid, malformed,
//     bad-signature, expired}                           -> authTokenStateArb
//   - token ages straddling the configured-expiry
//     window + window bounds [5min, 24h]                -> expiryWindowBoundaryArb / tokenAgeAroundExpiryArb
//   - ledger deviations straddling +/-0.01 USD          -> ledgerDeviationCentsArb / ledgerReconciliationCaseArb
//   - saturation at the concurrency limit               -> concurrencyAroundLimitArb
//
// PURE generators only — no I/O, no live network/AWS/Cloudflare calls. They
// build plain input data; tiers map the produced descriptors onto their own
// deterministic seams (e.g. minting a real HS256 JWT for an Auth_Token state).
// Single responsibility = arbitraries; kept well under the 600-line ceiling.
// =============================================================================

import fc from "fast-check";

// A fixed "now" epoch so token-age arbitraries are deterministic. The 15-minute
// Approval_Token validity window (R4.7) is GATE_TTL_MS.
export const NOW_MS = 1_700_000_000_000;
export const GATE_TTL_MS = 15 * 60 * 1000;

// =============================================================================
// Strings (empty / whitespace edge cases for required-field validation)
// =============================================================================

/** Empty or whitespace-only strings (edge case for required-field validation). */
export const emptyOrWhitespaceArb = fc.constantFrom("", " ", "   ", "\t", "\n", "  \t \n ");

/** A non-empty, trimmed alphanumeric token (safe building block for ids/briefs). */
export const wordArb = fc
  .string({ minLength: 1, maxLength: 24 })
  .map((s) => s.replace(/[^A-Za-z0-9]/g, "x"))
  .filter((s) => s.trim().length > 0);

/** A creative brief in the valid 1..5000 char range (R2.1). */
export const briefArb = fc
  .string({ minLength: 1, maxLength: 200 })
  .map((s) => (s.trim().length > 0 ? s : `brief-${s}x`));

/** A brief that exceeds the 5000-char Director limit (invalid). */
export const overlongBriefArb = fc
  .integer({ min: 5001, max: 5200 })
  .map((n) => "b".repeat(n));

// =============================================================================
// URLs (non-HTTP edge cases vs valid absolute HTTP/HTTPS)
// =============================================================================

/** A syntactically valid absolute HTTP/HTTPS URL. */
export const httpUrlArb = fc
  .record({
    scheme: fc.constantFrom("http", "https"),
    host: fc.constantFrom("example.com", "ref.video", "cdn.test", "airvio.co"),
    path: fc.string({ minLength: 0, maxLength: 16 }).map((s) => s.replace(/[^A-Za-z0-9/_-]/g, "")),
  })
  .map(({ scheme, host, path }) => `${scheme}://${host}/${path}`.replace(/\/+$/, "/"));

/** A non-HTTP / non-absolute URL (edge case the validators must reject). */
export const nonHttpUrlArb = fc.constantFrom(
  "",
  "   ",
  "not-a-url",
  "ftp://example.com/x",
  "file:///etc/passwd",
  "/relative/path",
  "javascript:alert(1)",
  "mailto:a@b.co",
);

// =============================================================================
// Budgets (out-of-range edge cases vs Director-valid [0.01, 100000.00])
// =============================================================================

/** A Director-valid budget in [0.01, 100000.00] (R2.1). */
export const inRangeBudgetArb = fc
  .double({ min: 0.01, max: 100000, noNaN: true, noDefaultInfinity: true })
  .map((n) => Number(n.toFixed(2)))
  .filter((n) => n >= 0.01 && n <= 100000);

/** A budget OUTSIDE the Director [0.01, 100000.00] range (invalid when provided). */
export const outOfRangeBudgetArb = fc.oneof(
  fc.constantFrom(0, -0.01, -1, 100000.01, 1_000_000),
  fc.double({ min: -1000, max: -0.01, noNaN: true, noDefaultInfinity: true }).map((n) => Number(n.toFixed(2))),
  fc.double({ min: 100000.01, max: 10_000_000, noNaN: true, noDefaultInfinity: true }).map((n) => Number(n.toFixed(2))),
);

// =============================================================================
// Shot counts — N at the [1,500] boundaries (R7.2, Property 12)
// =============================================================================

export const SHOT_COUNT_MIN = 1;
export const SHOT_COUNT_MAX = 500;

/** N in the valid [1,500] shot range, weighted toward the boundaries. */
export const shotCountInRangeArb = fc.oneof(
  fc.constantFrom(1, 2, 3, 499, 500),
  fc.integer({ min: 1, max: 500 }),
);

/**
 * N focused HARD on the [1,500] boundaries. The first/last legal values and
 * their immediate neighbours dominate, with a thin interior sample so the
 * property still ranges across the domain (Property 12).
 */
export const shotCountBoundaryArb = fc.oneof(
  { arbitrary: fc.constantFrom(SHOT_COUNT_MIN, SHOT_COUNT_MIN + 1, SHOT_COUNT_MAX - 1, SHOT_COUNT_MAX), weight: 4 },
  { arbitrary: fc.integer({ min: SHOT_COUNT_MIN, max: SHOT_COUNT_MAX }), weight: 1 },
);

/** N OUTSIDE [1,500] (clamping / rejection edge cases): 0, negatives, > max. */
export const shotCountOutOfRangeArb = fc.oneof(
  fc.constantFrom(0, -1, SHOT_COUNT_MAX + 1, SHOT_COUNT_MAX + 2, 1000),
  fc.integer({ min: SHOT_COUNT_MAX + 1, max: 5000 }),
);

// =============================================================================
// Bounded-retry — maxIterations at the [1,100] boundaries (R5.2, Property 8)
// =============================================================================

export const MAX_ITERATIONS_MIN = 1;
export const MAX_ITERATIONS_MAX = 100;

/**
 * `maxIterations` focused on the [1,100] boundaries plus out-of-range / non-int
 * values to exercise clamping (R5.2, Property 8).
 */
export const maxIterationsBoundaryArb = fc.oneof(
  { arbitrary: fc.constantFrom(MAX_ITERATIONS_MIN, MAX_ITERATIONS_MIN + 1, MAX_ITERATIONS_MAX - 1, MAX_ITERATIONS_MAX), weight: 3 },
  { arbitrary: fc.constantFrom(0, -5, MAX_ITERATIONS_MAX + 1, 1000, 1.9, Number.NaN), weight: 2 },
  { arbitrary: fc.integer({ min: MAX_ITERATIONS_MIN, max: MAX_ITERATIONS_MAX }), weight: 1 },
);

// =============================================================================
// Approval_Token states + ages straddling the 15-minute gate window
// (R4.7 / R11.6-11.8 / Property 1)
// =============================================================================

/**
 * Build a fully-valid Approval_Token for a gate: present, gate-matched,
 * unconsumed, signed, issued within the 15-minute window.
 */
export function validToken(gateId, issuedAt = NOW_MS) {
  return { gateId, issuedAt, consumed: false, verified: true };
}

/**
 * Token issuance AGES (ms before NOW_MS) focused on the 15-minute boundary:
 * 0, mid-window, one tick inside the cap, exactly the cap, one tick past, and
 * deep-expired. `expectValid` is true ONLY while age <= GATE_TTL_MS.
 */
export const gateTokenAgeAroundWindowArb = fc.oneof(
  fc.constantFrom(0, 1, Math.floor(GATE_TTL_MS / 2), GATE_TTL_MS - 1, GATE_TTL_MS).map((age) => ({ age, expectValid: true })),
  fc.constantFrom(GATE_TTL_MS + 1, GATE_TTL_MS + 1000, 2 * GATE_TTL_MS, 60 * 60 * 1000).map((age) => ({ age, expectValid: false })),
);

/** The Approval_Token state matrix labels (Property 1 / R11.6-11.8). */
export const approvalTokenStateArb = fc.constantFrom(
  "valid",
  "expired",
  "consumed",
  "mismatched",
  "absent",
  "bad-signature",
);

/**
 * Arbitrary that yields `{ token, gateId, expectValid }` across the full
 * Approval_Token state matrix for a requested gate id. `expectValid` is true
 * ONLY for the fully-valid case; every other case must be blocked (Property 1).
 * Valid/expired ages straddle the 15-minute window via gateTokenAgeAroundWindowArb;
 * absent / malformed / mismatched / bad-signature / consumed states are all
 * represented as explicit boundary cases.
 */
export function tokenStateArb(gateId, otherGateId = "cloud-deploy") {
  return fc.oneof(
    // valid / expired — ages straddling the 15-minute window boundary
    gateTokenAgeAroundWindowArb.map(({ age, expectValid }) => ({
      token: validToken(gateId, NOW_MS - age),
      gateId,
      expectValid,
    })),
    // absent
    fc.constantFrom(null, undefined, false).map((token) => ({ token, gateId, expectValid: false })),
    // malformed (non-object)
    fc.constantFrom("token", 42, true).map((token) => ({ token, gateId, expectValid: false })),
    // gate mismatch
    fc.constant(null).map(() => ({ token: validToken(otherGateId), gateId, expectValid: false })),
    // missing gate id
    fc.constant(null).map(() => ({ token: { issuedAt: NOW_MS, consumed: false, verified: true }, gateId, expectValid: false })),
    // bad / missing signature
    fc.constant(null).map(() => ({ token: { gateId, issuedAt: NOW_MS, consumed: false, verified: false, signature: "" }, gateId, expectValid: false })),
    // future-dated issuance (fails closed as expired)
    fc.integer({ min: 1, max: 600_000 }).map((d) => ({ token: validToken(gateId, NOW_MS + d), gateId, expectValid: false })),
    // consumed (single-use already spent)
    fc.constant(null).map(() => ({ token: { ...validToken(gateId), consumed: true }, gateId, expectValid: false })),
  );
}

/**
 * An Auth_Token-shaped credential (subject/entitledRunIds/exp/signature) — it
 * carries NO gate id, so it must never satisfy an Approval_Gate (R15.9).
 */
export const authTokenShapedArb = fc.record({
  subject: wordArb.map((s) => `sess_${s}`),
  entitledRunIds: fc.array(wordArb.map((s) => `run_${s}`), { maxLength: 3 }),
  issuedAt: fc.constant(NOW_MS),
  expiryWindowSeconds: fc.constantFrom(300, 3600, 86400),
  signature: fc.constant("hs256-auth-signature"),
});

// =============================================================================
// Auth_Token states + configured-expiry window (R15.1/15.3/15.8, Properties 28, 30)
// =============================================================================

export const EXPIRY_WINDOW_MIN_SECONDS = 5 * 60; // 300
export const EXPIRY_WINDOW_MAX_SECONDS = 24 * 60 * 60; // 86400
export const EXPIRY_WINDOW_DEFAULT_SECONDS = 60 * 60; // 3600

/**
 * Auth_Token state matrix the Agent_Api must reject (all but "valid"): missing,
 * malformed, bad-signature, expired (Property 28 / R15.1, R15.3). The tier maps
 * each label onto a real in-process HS256 JWT via its deterministic seams.
 */
export const authTokenStateArb = fc.constantFrom("valid", "missing", "malformed", "bad-signature", "expired");

/**
 * Requested expiry-window values focused on the [300, 86400]-second bounds plus
 * out-of-range and unset/non-numeric values that must clamp / default to 3600
 * (Property 30 / R15.8).
 */
export const expiryWindowBoundaryArb = fc.oneof(
  { arbitrary: fc.constantFrom(EXPIRY_WINDOW_MIN_SECONDS, EXPIRY_WINDOW_MIN_SECONDS - 1, EXPIRY_WINDOW_MAX_SECONDS, EXPIRY_WINDOW_MAX_SECONDS + 1), weight: 3 },
  { arbitrary: fc.constantFrom(undefined, null, "60", Number.NaN, 1.5, -100000), weight: 2 },
  { arbitrary: fc.integer({ min: EXPIRY_WINDOW_MIN_SECONDS, max: EXPIRY_WINDOW_MAX_SECONDS }), weight: 1 },
);

/**
 * Auth_Token issuance AGES (seconds) for straddling whichever effective expiry
 * window is in force: includes 0 and values around the [300, 86400] bounds so a
 * token is exercised on both sides of "age > window" (Property 30 / R15.8).
 */
export const tokenAgeAroundExpiryArb = fc.oneof(
  fc.constantFrom(
    0,
    EXPIRY_WINDOW_MIN_SECONDS - 1,
    EXPIRY_WINDOW_MIN_SECONDS,
    EXPIRY_WINDOW_MIN_SECONDS + 1,
    EXPIRY_WINDOW_DEFAULT_SECONDS,
    EXPIRY_WINDOW_MAX_SECONDS - 1,
    EXPIRY_WINDOW_MAX_SECONDS,
    EXPIRY_WINDOW_MAX_SECONDS + 1,
  ),
  fc.integer({ min: 0, max: 2 * EXPIRY_WINDOW_MAX_SECONDS }),
);

// =============================================================================
// Ledger / spend — deviations straddling the +/-0.01 USD tolerance
// (R10.4 / Property 21)
// =============================================================================

/** Integer cents in a modest range for render-asset spend events. */
export const spendCentsArb = fc.integer({ min: 0, max: 5000 });

// +/-0.01 USD reconciliation tolerance expressed in integer cents.
export const RECONCILIATION_TOLERANCE_CENTS = 1;

/**
 * Signed cent deviations focused on the +/-0.01 (== +/-1 cent) boundary: the
 * exactly-tolerable values {-1, 0, +1} alternate with just-intolerable {-2, +2}
 * and larger deviations, so Property 21 is exercised on BOTH sides of the
 * consistency threshold rather than from random interior noise.
 */
export const ledgerDeviationCentsArb = fc.oneof(
  { arbitrary: fc.constantFrom(-1, 0, 1, -2, 2), weight: 4 },
  { arbitrary: fc.integer({ min: -60000, max: 60000 }), weight: 1 },
);

/**
 * A reconciliation case: a set of Credit_Ledger assets plus a Budget_Meters
 * provider-spend total derived from the ledger sum offset by a boundary-focused
 * deviation, so the +/-0.01 consistency threshold is straddled deterministically
 * (Property 21). `metersProviderSpendCents` is clamped at >= 0.
 */
export const ledgerReconciliationCaseArb = fc
  .record({
    assets: fc.array(
      fc.record({
        shotId: wordArb,
        ledgerEventId: wordArb.map((s) => `led-${s}`),
        costCents: fc.integer({ min: 0, max: 5000 }),
        provider: fc.constantFrom("byteplus-queue", "mock"),
      }),
      { minLength: 0, maxLength: 10 },
    ),
    deviationCents: ledgerDeviationCentsArb,
    runId: wordArb,
  })
  .map(({ assets, deviationCents, runId }) => {
    const ledgerSum = assets
      .filter((a) => a.ledgerEventId)
      .reduce((t, a) => t + a.costCents, 0);
    const metersProviderSpendCents = Math.max(0, ledgerSum + deviationCents);
    return { assets, metersProviderSpendCents, deviationCents, runId };
  });

// =============================================================================
// Saturation — in-flight count straddling the concurrency limit (R12.4)
// =============================================================================

/**
 * `{ maxConcurrency, inFlight, expectSaturated }` straddling the configured
 * concurrency ceiling: inFlight is sampled at the limit and its immediate
 * neighbours so the saturated -> 503 boundary (R12.4) is exercised from both
 * sides. `expectSaturated` is true exactly when inFlight >= maxConcurrency.
 */
export const concurrencyAroundLimitArb = fc
  .integer({ min: 1, max: 64 })
  .chain((maxConcurrency) =>
    fc
      .oneof(
        fc.constantFrom(maxConcurrency - 1, maxConcurrency, maxConcurrency + 1),
        fc.integer({ min: 0, max: maxConcurrency + 8 }),
      )
      .map((inFlight) => ({
        maxConcurrency,
        inFlight: Math.max(0, inFlight),
        expectSaturated: Math.max(0, inFlight) >= maxConcurrency,
      })),
  );
