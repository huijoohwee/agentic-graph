// Unit tests for ledger-vs-meters reconciliation
// (agentic-graph-acos-mcp-connector spec, task 2.12 - R10.4, R10.5 / Property 21).
//
// R10.4: THE Credit_Ledger SHALL remain consistent such that the sum of
//   recorded ledger events equals the total provider spend reported in
//   Budget_Meters within a tolerance of ±0.01 USD.
// R10.5: IF the sum of recorded Credit_Ledger events deviates from the total
//   provider spend reported in Budget_Meters by more than ±0.01 USD, THEN THE
//   Director SHALL flag a reconciliation discrepancy and preserve both the
//   Credit_Ledger events and Budget_Meters values without modification.
// Property 21: For any run, either the ledger sum equals the Budget_Meters
//   provider spend within ±0.01 USD, or — when the deviation exceeds ±0.01 USD
//   — the Director flags a reconciliation discrepancy and preserves both
//   records without modification.
//
// The reconciliation works in integer cents (cents-exact, no float drift). A
// deviation of EXACTLY 1 cent (0.01 USD) is WITHIN tolerance (no flag); a
// deviation strictly greater than 1 cent is flagged. The discrepancy path is
// exercised via the injectable, timer-free `simulatedMetersProviderSpendCents`
// signal so a Budget_Meters reading can be made to diverge from the
// asset-derived Credit_Ledger sum WITHOUT any real provider call.
//
// This is the Property-21 implementation seam; the consolidated property-based
// test is task 9.1. These example-based unit asserts cover the consistent case
// (within ±0.01, no flag), the discrepancy case (deviation > ±0.01 flags and
// preserves both records unchanged), and the boundary at exactly ±0.01.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runVideoRemix,
  deriveLedgerEventsFromAssets,
  buildReconciliationFlag,
  reconcileLedgerVsMeters,
  ledgerReconciliationHolds,
  buildLedgerReconciliation,
  RECONCILIATION_TOLERANCE_CENTS,
  RECONCILIATION_CHECK_ID,
} from "../video-remix-runtime.js";
import { runDirectorWorkflow } from "../director-workflow.js";

const THREE_SOURCE_CARDS = Object.freeze([
  { sourceId: "s1", url: "https://example.com/a", evidenceLevel: "A" },
  { sourceId: "s2", url: "https://example.com/b", evidenceLevel: "B" },
  { sourceId: "s3", url: "https://example.com/c", evidenceLevel: "B" },
]);

const ALL_APPROVALS = Object.freeze([
  { gateId: "paid-model-call", approvalState: "approved", token: "tok-paid" },
  { gateId: "render-action", approvalState: "approved", token: "tok-render" },
  { gateId: "payment-action", approvalState: "approved", token: "tok-pay" },
  { gateId: "cloud-deploy", approvalState: "approved", token: "tok-deploy" },
]);

const LIVE_APPROVED_ARGS = Object.freeze({
  referenceUrl: "https://example.com/reference.mp4",
  brief: "Ledger-vs-meters reconciliation, fully approved live run.",
  mode: "live",
  budgetUsd: 50,
  runId: "reconciliation-approved-001",
  shotCount: 3,
  sourceCards: THREE_SOURCE_CARDS,
  approvals: ALL_APPROVALS,
});

const ASSETS = Object.freeze([
  { shotId: "shot-1", ledgerEventId: "ledger-1", provider: "byteplus", costCents: 120 },
  { shotId: "shot-2", ledgerEventId: "ledger-2", provider: "external_video_provider", costCents: 80 },
]);

// ---------------------------------------------------------------------------
// Pure helpers.
// ---------------------------------------------------------------------------

test("deriveLedgerEventsFromAssets: one event per asset carrying id, provider, and costCents", () => {
  const events = deriveLedgerEventsFromAssets(ASSETS);
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((e) => e.ledgerEventId), ["ledger-1", "ledger-2"]);
  assert.deepEqual(events.map((e) => e.provider), ["byteplus", "external_video_provider"]);
  assert.deepEqual(events.map((e) => e.costCents), [120, 80]);
});

test("deriveLedgerEventsFromAssets: zero-spend asset defaults to the mock provider; assets without a ledger id are ignored", () => {
  const events = deriveLedgerEventsFromAssets([
    { shotId: "shot-1", ledgerEventId: "ledger-1", costCents: 0 },
    { shotId: "shot-2", costCents: 50 }, // no ledgerEventId -> not a ledger event
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].provider, "mock");
  assert.equal(events[0].costCents, 0);
});

test("reconcileLedgerVsMeters: equal totals are consistent with no flag (R10.4)", () => {
  const events = deriveLedgerEventsFromAssets(ASSETS); // sum 200c
  const result = reconcileLedgerVsMeters({ ledgerEvents: events, metersProviderSpendCents: 200 });
  assert.equal(result.ledgerSumCents, 200);
  assert.equal(result.deviationCents, 0);
  assert.equal(result.consistent, true);
  assert.deepEqual(result.flags, []);
  assert.equal(ledgerReconciliationHolds(result), true);
});

test("reconcileLedgerVsMeters: deviation of EXACTLY 0.01 USD is within tolerance (boundary, no flag)", () => {
  const events = deriveLedgerEventsFromAssets(ASSETS); // sum 200c
  // 201c meters vs 200c ledger = 1c deviation == tolerance -> consistent.
  const result = reconcileLedgerVsMeters({ ledgerEvents: events, metersProviderSpendCents: 201 });
  assert.equal(result.deviationCents, RECONCILIATION_TOLERANCE_CENTS);
  assert.equal(result.consistent, true);
  assert.deepEqual(result.flags, []);
  // And symmetrically below by exactly one cent.
  const below = reconcileLedgerVsMeters({ ledgerEvents: events, metersProviderSpendCents: 199 });
  assert.equal(below.deviationCents, 1);
  assert.equal(below.consistent, true);
  assert.deepEqual(below.flags, []);
});

test("reconcileLedgerVsMeters: deviation greater than 0.01 USD flags a discrepancy (R10.5)", () => {
  const events = deriveLedgerEventsFromAssets(ASSETS); // sum 200c
  // 202c meters vs 200c ledger = 2c deviation > tolerance -> flagged.
  const result = reconcileLedgerVsMeters({ ledgerEvents: events, metersProviderSpendCents: 202, runId: "r-x" });
  assert.equal(result.deviationCents, 2);
  assert.equal(result.consistent, false);
  assert.equal(result.flags.length, 1);
  assert.match(result.flags[0], /reconciliation-discrepancy run=r-x/);
  assert.match(result.flags[0], /preserved unchanged/);
  assert.equal(ledgerReconciliationHolds(result), true);
});

test("buildReconciliationFlag: renders cents as USD and notes both records preserved", () => {
  const flag = buildReconciliationFlag({
    runId: "run-7",
    ledgerSumCents: 200,
    metersProviderSpendCents: 350,
    deviationCents: 150,
  });
  assert.match(flag, /run=run-7/);
  assert.match(flag, /\$2\.00/);
  assert.match(flag, /\$3\.50/);
  assert.match(flag, /\$1\.50/);
  assert.match(flag, /both Credit_Ledger events and Budget_Meters values preserved unchanged/);
});

test("buildLedgerReconciliation: surfaces the preserved ledger events, summary, guardrail, and validation check", () => {
  const recon = buildLedgerReconciliation({ assets: ASSETS, metersProviderSpendCents: 200, runId: "run-z" });
  assert.equal(recon.ledgerEvents.length, 2);
  assert.equal(recon.summary.ledgerSumCents, 200);
  assert.equal(recon.summary.providerSpendCents, 200);
  assert.equal(recon.summary.consistent, true);
  assert.equal(recon.summary.ledgerEventCount, 2);
  assert.equal(recon.guardrailOk, true);
  assert.deepEqual(recon.validationCheck, { id: RECONCILIATION_CHECK_ID, ok: true });
});

// ---------------------------------------------------------------------------
// Consistent case on the Run_Manifest (within ±0.01, no flag).
// ---------------------------------------------------------------------------

test("R10.4: a normal run reconciles consistently with an empty reconciliationFlags[]", () => {
  const { payload } = runVideoRemix(LIVE_APPROVED_ARGS);
  const recon = payload.budgetMeters.reconciliation;
  // Ledger events are derived from the run's render assets (one per shot).
  assert.equal(recon.ledgerEventCount, payload.render.assets.length);
  // Ledger sum equals the meters provider spend (both ledger-derived) -> consistent.
  assert.equal(recon.consistent, true);
  assert.equal(recon.flagged, false);
  assert.deepEqual(payload.reconciliationFlags, []);
  assert.equal(payload.guardrails.creditLedgerConsistentOrReconciliationFlagged, true);
  const check = payload.validation.checks.find((c) => c.id === RECONCILIATION_CHECK_ID);
  assert.ok(check && check.ok === true);
});

// ---------------------------------------------------------------------------
// Discrepancy case on the Run_Manifest (deviation > ±0.01 flags + preserves
// both records unchanged).
// ---------------------------------------------------------------------------

test("R10.5: a meters reading diverging by more than ±0.01 USD flags a discrepancy and preserves both records", () => {
  // Capture the unmodified baseline first.
  const baseline = runVideoRemix({ ...LIVE_APPROVED_ARGS, runId: "reconciliation-discrepancy-001" });
  const baselineAssetCostCents = baseline.payload.render.assets.map((a) => a.costCents);
  const baselineProviderSpendCents = baseline.payload.budgetMeters.providerSpendCents;

  // Inject a Budget_Meters provider-spend reading ($5.00) that diverges from the
  // asset-derived Credit_Ledger sum ($0.00) by well over the ±0.01 tolerance.
  const { payload } = runVideoRemix({
    ...LIVE_APPROVED_ARGS,
    runId: "reconciliation-discrepancy-001",
    simulatedMetersProviderSpendCents: 500,
  });
  const recon = payload.budgetMeters.reconciliation;

  // A discrepancy is flagged.
  assert.equal(recon.consistent, false);
  assert.equal(recon.flagged, true);
  assert.ok(recon.deviationCents > RECONCILIATION_TOLERANCE_CENTS);
  assert.equal(payload.reconciliationFlags.length, 1);
  assert.match(payload.reconciliationFlags[0], /reconciliation-discrepancy/);

  // Property 21 holds: flagged branch with both records preserved.
  assert.equal(payload.guardrails.creditLedgerConsistentOrReconciliationFlagged, true);
  const check = payload.validation.checks.find((c) => c.id === RECONCILIATION_CHECK_ID);
  assert.ok(check && check.ok === true);

  // PRESERVE BOTH RECORDS UNCHANGED (R10.5 — do not auto-correct):
  //  * the Credit_Ledger event costs (render assets) are unchanged — they were
  //    NOT rewritten up to the meters reading; every asset keeps its ledger id;
  assert.deepEqual(payload.render.assets.map((a) => a.costCents), baselineAssetCostCents);
  assert.ok(payload.render.assets.every((a) => Boolean(a.ledgerEventId)));
  //  * the ledger sum was NOT corrected up to the meters reading; and
  assert.equal(recon.ledgerSumCents, baselineProviderSpendCents);
  //  * the meters reading was NOT corrected down to the ledger sum.
  assert.equal(recon.providerSpendCents, 500);
  assert.notEqual(recon.ledgerSumCents, recon.providerSpendCents);
});

// ---------------------------------------------------------------------------
// Boundary at exactly ±0.01 on the Run_Manifest.
// ---------------------------------------------------------------------------

test("boundary: a meters reading exactly 0.01 USD from the ledger stays consistent (no flag)", () => {
  // Ledger sum is 0 (mock-provider zero-spend assets); inject a meters reading
  // of exactly 1 cent -> deviation == tolerance -> consistent, no flag.
  const { payload } = runVideoRemix({
    ...LIVE_APPROVED_ARGS,
    runId: "reconciliation-boundary-001",
    simulatedMetersProviderSpendCents: 1,
  });
  const recon = payload.budgetMeters.reconciliation;
  assert.equal(recon.deviationCents, RECONCILIATION_TOLERANCE_CENTS);
  assert.equal(recon.consistent, true);
  assert.deepEqual(payload.reconciliationFlags, []);
  assert.equal(payload.guardrails.creditLedgerConsistentOrReconciliationFlagged, true);
});

test("boundary: one cent past tolerance (0.02 USD) flips to a flagged discrepancy", () => {
  const { payload } = runVideoRemix({
    ...LIVE_APPROVED_ARGS,
    runId: "reconciliation-boundary-002",
    simulatedMetersProviderSpendCents: 2,
  });
  const recon = payload.budgetMeters.reconciliation;
  assert.equal(recon.deviationCents, 2);
  assert.equal(recon.consistent, false);
  assert.equal(payload.reconciliationFlags.length, 1);
  assert.equal(payload.guardrails.creditLedgerConsistentOrReconciliationFlagged, true);
});

// ---------------------------------------------------------------------------
// Consistency with dry-run and the Director workflow wrapper.
// ---------------------------------------------------------------------------

test("dry-run reconciles consistently (no assets, no meters spend, no flag)", () => {
  const { payload } = runVideoRemix({
    referenceUrl: "https://example.com/reference.mp4",
    brief: "Ledger-vs-meters reconciliation, dry-run.",
    mode: "dry-run",
    budgetUsd: 50,
    runId: "reconciliation-dryrun-001",
    shotCount: 3,
    sourceCards: THREE_SOURCE_CARDS,
    simulatedMetersProviderSpendCents: 999, // ignored in dry-run
  });
  const recon = payload.budgetMeters.reconciliation;
  assert.equal(recon.consistent, true);
  assert.deepEqual(payload.reconciliationFlags, []);
  assert.equal(payload.guardrails.creditLedgerConsistentOrReconciliationFlagged, true);
});

test("the reconciliation contract flows through the Director workflow wrapper unchanged", () => {
  const { payload } = runDirectorWorkflow(LIVE_APPROVED_ARGS);
  assert.equal(payload.budgetMeters.reconciliation.consistent, true);
  assert.deepEqual(payload.reconciliationFlags, []);
  assert.equal(payload.guardrails.creditLedgerConsistentOrReconciliationFlagged, true);
});
