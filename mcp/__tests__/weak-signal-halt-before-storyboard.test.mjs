// Unit tests for the Director weak-signal halt-before-storyboard gate
// (agentic-graph-acos-mcp-connector spec, task 3.4 — R4.5, R6.5 / Property 11,
// the Director HALT side).
//
// R4.5: WHEN the Research_Harness returns fewer than 3 sources, THE Director
// SHALL mark the research stage `weak_signal` and halt before the storyboard
// stage, remaining halted until a verified Approval_Token authorizes
// continuation. (Refines AC-2 alternate path)
//
// R6.5: IF Exa returns fewer than 3 Source_Cards, THE Research_Harness SHALL
// mark the stage `weak_signal` and SHALL NOT fabricate additional sources to
// reach the minimum count.
//
// These are example-based unit asserts of the Director-side halt: with fewer
// than 3 sources the run is `blocked`, research is `weak_signal`, the
// storyboard and every downstream stage do NOT begin, and the manifest exposes
// an observable "awaiting approval to continue past weak signal" indication.
// A verified continuation Approval_Token lifts the halt. With sufficient
// sources the run proceeds past research with no halt. The consolidated
// property-based test for Property 11 lands in task 9.1.

import { test } from "node:test";
import assert from "node:assert/strict";

import { runVideoRemix } from "../video-remix-runtime.js";
import { runDirectorWorkflow } from "../director-workflow.js";
import {
  buildWeakSignalHalt,
  verifyContinuationApproval,
  WEAK_SIGNAL_CONTINUE_GATE_ID,
} from "../video-remix-runtime.js";

const DOWNSTREAM_OF_RESEARCH = Object.freeze(["storyboard", "render", "publish", "checkout"]);

// Two sources => below the required minimum of 3 => weak signal. Live + the
// paid-model-call gate approved so research actually runs over the supplied
// cards (an unapproved gate would block earlier for a different reason).
const WEAK_SIGNAL_ARGS = Object.freeze({
  referenceUrl: "https://example.com/reference.mp4",
  brief: "Remix the reference into a sellable launch teaser.",
  mode: "live",
  budgetUsd: 20,
  runId: "weak-signal-halt-001",
  shotCount: 4,
  approvals: ["paid-model-call", "render-action", "payment-action", "cloud-deploy"],
  sourceCards: [
    { sourceId: "s1", url: "https://example.com/a", evidenceLevel: "A" },
    { sourceId: "s2", url: "https://example.com/b", evidenceLevel: "B" },
  ],
});

// Three sources => meets the minimum => no weak signal, run proceeds.
const SUFFICIENT_SOURCES_ARGS = Object.freeze({
  ...WEAK_SIGNAL_ARGS,
  runId: "weak-signal-sufficient-001",
  sourceCards: [
    { sourceId: "s1", url: "https://example.com/a", evidenceLevel: "A" },
    { sourceId: "s2", url: "https://example.com/b", evidenceLevel: "B" },
    { sourceId: "s3", url: "https://example.com/c", evidenceLevel: "B" },
  ],
});

const stageById = (payload, id) => payload.stages.find((stage) => stage.id === id);

// ---------------------------------------------------------------------------
// Director HALT side (R4.5 / Property 11): fewer than 3 sources.
// ---------------------------------------------------------------------------

test("R4.5: fewer than 3 sources marks research `weak_signal` and Run_State `blocked`", () => {
  const { payload } = runVideoRemix(WEAK_SIGNAL_ARGS);
  assert.equal(payload.state, "blocked");
  const research = stageById(payload, "research");
  assert.equal(research.status, "weak_signal");
  assert.equal(research.weakSignal, true);
});

test("R4.5: the run halts BEFORE storyboard — storyboard and all downstream stages do NOT begin", () => {
  const { payload } = runVideoRemix(WEAK_SIGNAL_ARGS);
  const storyboard = stageById(payload, "storyboard");
  assert.equal(storyboard.status, "blocked_weak_signal");
  // Storyboard + every downstream stage must be un-begun (executed === false).
  for (const id of DOWNSTREAM_OF_RESEARCH) {
    const stage = stageById(payload, id);
    assert.equal(stage.executed, false, `${id} must not begin while halted on weak signal`);
  }
  // No assets, no publish, no checkout session were produced.
  assert.equal(payload.render.assets.length, 0);
  assert.equal(payload.commerce.publish.publishedUrls.length, 0);
  assert.equal(payload.commerce.checkout.sessionId, "");
});

test("R4.5: the manifest exposes an observable awaiting-approval-to-continue indication", () => {
  const { payload } = runVideoRemix(WEAK_SIGNAL_ARGS);
  assert.ok(payload.weakSignalHalt, "weakSignalHalt summary present on manifest");
  assert.equal(payload.weakSignalHalt.weakSignal, true);
  assert.equal(payload.weakSignalHalt.halted, true);
  assert.equal(payload.weakSignalHalt.continuationApproved, false);
  assert.equal(payload.weakSignalHalt.awaitingApprovalToContinue, true);
  assert.equal(payload.weakSignalHalt.continuationGateId, WEAK_SIGNAL_CONTINUE_GATE_ID);
  assert.ok(
    typeof payload.weakSignalHalt.indication === "string" && payload.weakSignalHalt.indication.length > 0,
    "a human-readable awaiting-approval indication is present",
  );
  // The indication is also surfaced on the research stage for the UI.
  const research = stageById(payload, "research");
  assert.equal(research.awaitingApprovalToContinue, true);
  assert.equal(research.continuationGateId, WEAK_SIGNAL_CONTINUE_GATE_ID);
});

test("R6.5: the weak-signal halt never fabricates sources to reach the minimum", () => {
  const { payload } = runVideoRemix(WEAK_SIGNAL_ARGS);
  // The genuine, sub-minimum count is preserved (2 supplied cards).
  assert.equal(payload.evidencePack.sources.length, 2);
  assert.equal(payload.weakSignalHalt.sourceCount, 2);
  assert.equal(payload.weakSignalHalt.requiredSourceCount, 3);
});

test("R4.5: the halt invariant guardrail and validation check both pass", () => {
  const { payload } = runVideoRemix(WEAK_SIGNAL_ARGS);
  assert.equal(payload.guardrails.weakSignalHaltsBeforeStoryboard, true);
  const check = payload.validation.checks.find((c) => c.id === "weak_signal_halts_before_storyboard");
  assert.ok(check, "weak_signal_halts_before_storyboard validation check present");
  assert.equal(check.ok, true);
});

// ---------------------------------------------------------------------------
// Continuation approval lifts the halt (R4.5: "until a verified Approval_Token
// authorizes continuation"). Modeled as an injectable continuation token.
// ---------------------------------------------------------------------------

test("R4.5: a verified continuation Approval_Token lifts the halt and the run proceeds past research", () => {
  const { payload } = runVideoRemix({
    ...WEAK_SIGNAL_ARGS,
    runId: "weak-signal-continue-001",
    weakSignalContinuation: { verified: true, gateId: WEAK_SIGNAL_CONTINUE_GATE_ID },
  });
  // Research is STILL weak_signal (sources genuinely sub-minimum, no fabrication)...
  const research = stageById(payload, "research");
  assert.equal(research.status, "weak_signal");
  assert.equal(payload.evidencePack.sources.length, 2);
  // ...but the halt is lifted: not blocked on weak signal, storyboard no longer held.
  assert.equal(payload.weakSignalHalt.halted, false);
  assert.equal(payload.weakSignalHalt.continuationApproved, true);
  assert.equal(payload.weakSignalHalt.awaitingApprovalToContinue, false);
  assert.notEqual(stageById(payload, "storyboard").status, "blocked_weak_signal");
  // The halt guardrail/validation remain satisfied (vacuously true when not halted).
  assert.equal(payload.guardrails.weakSignalHaltsBeforeStoryboard, true);
  const check = payload.validation.checks.find((c) => c.id === "weak_signal_halts_before_storyboard");
  assert.equal(check.ok, true);
});

test("an unverified / mismatched continuation token does NOT lift the halt", () => {
  const unverified = runVideoRemix({
    ...WEAK_SIGNAL_ARGS,
    runId: "weak-signal-unverified-001",
    weakSignalContinuation: { verified: false, gateId: WEAK_SIGNAL_CONTINUE_GATE_ID },
  }).payload;
  assert.equal(unverified.state, "blocked");
  assert.equal(unverified.weakSignalHalt.halted, true);

  const mismatched = runVideoRemix({
    ...WEAK_SIGNAL_ARGS,
    runId: "weak-signal-mismatch-001",
    weakSignalContinuation: { verified: true, gateId: "payment-action" },
  }).payload;
  assert.equal(mismatched.state, "blocked");
  assert.equal(mismatched.weakSignalHalt.halted, true);
});

// ---------------------------------------------------------------------------
// Sufficient sources: no halt, the run proceeds past research.
// ---------------------------------------------------------------------------

test("with >= 3 sources there is no weak signal and the run proceeds past research", () => {
  const { payload } = runVideoRemix(SUFFICIENT_SOURCES_ARGS);
  const research = stageById(payload, "research");
  assert.notEqual(research.status, "weak_signal");
  assert.equal(payload.weakSignalHalt.weakSignal, false);
  assert.equal(payload.weakSignalHalt.halted, false);
  assert.equal(payload.weakSignalHalt.awaitingApprovalToContinue, false);
  // Storyboard is not held; the run reached a terminal complete state.
  assert.notEqual(stageById(payload, "storyboard").status, "blocked_weak_signal");
  assert.equal(payload.state, "complete");
});

test("R4.5: the halt guarantees hold through the Director workflow wrapper", () => {
  const { payload } = runDirectorWorkflow(WEAK_SIGNAL_ARGS);
  assert.equal(payload.state, "blocked");
  assert.equal(stageById(payload, "research").status, "weak_signal");
  assert.equal(stageById(payload, "storyboard").status, "blocked_weak_signal");
  assert.equal(payload.weakSignalHalt.awaitingApprovalToContinue, true);
});

// ---------------------------------------------------------------------------
// Direct unit coverage of the pure halt module.
// ---------------------------------------------------------------------------

test("buildWeakSignalHalt: halts below the minimum, clears at or above it", () => {
  const halted = buildWeakSignalHalt(2, 3);
  assert.equal(halted.weakSignal, true);
  assert.equal(halted.halted, true);
  assert.equal(halted.awaitingApprovalToContinue, true);

  const sufficient = buildWeakSignalHalt(3, 3);
  assert.equal(sufficient.weakSignal, false);
  assert.equal(sufficient.halted, false);

  const continued = buildWeakSignalHalt(1, 3, true);
  assert.equal(continued.weakSignal, true);
  assert.equal(continued.continuationApproved, true);
  assert.equal(continued.halted, false);
});

test("verifyContinuationApproval: only a verified, gate-matching token authorizes continuation", () => {
  assert.equal(verifyContinuationApproval(true), true);
  assert.equal(verifyContinuationApproval({ verified: true }), true);
  assert.equal(verifyContinuationApproval({ verified: true, gateId: WEAK_SIGNAL_CONTINUE_GATE_ID }), true);
  assert.equal(verifyContinuationApproval({ verified: false }), false);
  assert.equal(verifyContinuationApproval({ verified: true, gateId: "payment-action" }), false);
  assert.equal(verifyContinuationApproval(undefined), false);
  assert.equal(verifyContinuationApproval(false), false);
});
