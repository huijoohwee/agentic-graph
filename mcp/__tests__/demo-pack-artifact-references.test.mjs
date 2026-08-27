// Unit tests for Demo_Pack artifact-reference completeness
// (agenticgraph-acos-mcp-connector spec, task 2.15 - R3.6, R3.7 / Property 23,
// artifact half).
//
// Property 23 (artifact half): "each of the Evidence_Pack citations, the
// rendered asset reference, and the Stripe session identifier is referenced in
// the Demo_Pack when it exists and is marked not available when it does not."
//
// These tests assert:
//   * all three artifacts present -> referenced on `artifactReferences` and in
//     the backing section's evidence text,
//   * each artifact missing -> marked "not available",
//   * composition with the 2.14 reachability half: the `demo_presentation`
//     dimension is verified only when its url is reachable AND its Stripe
//     session exists,
//   * the non-url-backed artifact dimensions are driven by artifact presence.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildDemoPack,
  buildArtifactReferences,
  markArtifactCompleteness,
  NOT_AVAILABLE,
} from "../video-remix/demo-pack.js";

// A terminal run with every artifact present.
const FULL_ARGS = Object.freeze({
  state: "complete",
  sources: [
    { sourceId: "s1", url: "https://example.com/a" },
    { sourceId: "s2", url: "https://example.com/b" },
  ],
  assets: [{ shotId: "shot-1", assetUrl: "https://airvio.co/assets/shot-1.mp4", ledgerEventId: "led-1" }],
  checkout: { sessionId: "cs_test_demo", payoutSettled: true },
});

function section(demoPack, id) {
  return demoPack.sections.find((s) => s.id === id);
}

// ---------------------------------------------------------------------------
// All three artifacts present -> referenced.
// ---------------------------------------------------------------------------

test("artifacts present are referenced on artifactReferences and in section evidence", () => {
  const demoPack = buildDemoPack({ ...FULL_ARGS });
  const refs = demoPack.artifactReferences;

  assert.equal(refs.evidenceCitations.status, "present");
  assert.equal(refs.evidenceCitations.count, 2);
  assert.deepEqual(refs.evidenceCitations.citations, [
    { sourceId: "s1", url: "https://example.com/a" },
    { sourceId: "s2", url: "https://example.com/b" },
  ]);

  assert.equal(refs.renderedAsset.status, "present");
  assert.equal(refs.renderedAsset.reference.assetUrl, "https://airvio.co/assets/shot-1.mp4");
  assert.equal(refs.renderedAsset.reference.ledgerEventId, "led-1");

  assert.equal(refs.stripeSession.status, "present");
  assert.equal(refs.stripeSession.sessionId, "cs_test_demo");

  // Each artifact is referenced in its backing section's evidence text.
  assert.match(section(demoPack, "autonomy_decision_making").evidence, /Evidence_Pack citation\(s\) referenced/);
  assert.match(section(demoPack, "actions_tool_use").evidence, /https:\/\/airvio\.co\/assets\/shot-1\.mp4/);
  assert.match(section(demoPack, "demo_presentation").evidence, /cs_test_demo/);
});

// ---------------------------------------------------------------------------
// Each artifact missing -> marked "not available".
// ---------------------------------------------------------------------------

test("missing artifacts are marked not available on artifactReferences and in evidence", () => {
  const demoPack = buildDemoPack({ state: "complete", sources: [], assets: [], checkout: {} });
  const refs = demoPack.artifactReferences;

  assert.equal(refs.evidenceCitations.status, NOT_AVAILABLE);
  assert.equal(refs.evidenceCitations.count, 0);
  assert.deepEqual(refs.evidenceCitations.citations, []);

  assert.equal(refs.renderedAsset.status, NOT_AVAILABLE);
  assert.equal(refs.renderedAsset.reference, null);

  assert.equal(refs.stripeSession.status, NOT_AVAILABLE);
  assert.equal(refs.stripeSession.sessionId, null);

  // Each backing section's evidence says "not available".
  assert.match(section(demoPack, "autonomy_decision_making").evidence, /Evidence_Pack citations not available/);
  assert.match(section(demoPack, "actions_tool_use").evidence, /rendered asset reference not available/);
  assert.match(section(demoPack, "demo_presentation").evidence, /Stripe checkout session not available/);
});

// ---------------------------------------------------------------------------
// Mixed presence: only some artifacts exist.
// ---------------------------------------------------------------------------

test("a partially-present run references what exists and marks the rest not available", () => {
  const demoPack = buildDemoPack({
    state: "complete",
    sources: [{ sourceId: "s1", url: "https://example.com/a" }],
    assets: [],
    checkout: { sessionId: "cs_partial" },
  });
  const refs = demoPack.artifactReferences;

  assert.equal(refs.evidenceCitations.status, "present");
  assert.equal(refs.renderedAsset.status, NOT_AVAILABLE);
  assert.equal(refs.stripeSession.status, "present");
});

// ---------------------------------------------------------------------------
// A rendered asset known only by ledger event id (no assetUrl) still counts.
// ---------------------------------------------------------------------------

test("an asset with only a ledgerEventId is referenced as present", () => {
  const refs = buildArtifactReferences({
    sources: [],
    assets: [{ shotId: "shot-1", ledgerEventId: "led-only" }],
    checkout: {},
  });
  assert.equal(refs.renderedAsset.status, "present");
  assert.equal(refs.renderedAsset.reference.assetUrl, null);
  assert.equal(refs.renderedAsset.reference.ledgerEventId, "led-only");
});

// ---------------------------------------------------------------------------
// Composition with reachability (2.14 half): demo_presentation is verified
// only when its url is reachable AND its Stripe session exists.
// ---------------------------------------------------------------------------

test("demo_presentation requires BOTH a reachable url and a Stripe session to verify", () => {
  // Reachable urls + session present -> verified.
  const both = buildDemoPack({ ...FULL_ARGS, reachability: () => ({ status: 200 }) });
  assert.equal(section(both, "demo_presentation").verified, true);

  // Reachable urls but NO session -> unverified (artifact half fails).
  const noSession = buildDemoPack({
    ...FULL_ARGS,
    checkout: {},
    reachability: () => ({ status: 200 }),
  });
  assert.equal(section(noSession, "demo_presentation").verified, false);

  // Session present but urls unreachable -> unverified (reachability half fails).
  const unreachable = buildDemoPack({ ...FULL_ARGS, reachability: () => ({ status: 503 }) });
  assert.equal(section(unreachable, "demo_presentation").verified, false);
});

// ---------------------------------------------------------------------------
// Non-url-backed artifact dimensions are driven solely by artifact presence.
// ---------------------------------------------------------------------------

test("non-url-backed artifact sections verify on artifact presence alone", () => {
  const present = buildDemoPack({ ...FULL_ARGS });
  assert.equal(section(present, "autonomy_decision_making").verified, true, "citations present -> verified");
  assert.equal(section(present, "actions_tool_use").verified, true, "asset present -> verified");

  const missing = buildDemoPack({ state: "complete", sources: [], assets: [], checkout: {} });
  assert.equal(section(missing, "autonomy_decision_making").verified, false, "no citations -> unverified");
  assert.equal(section(missing, "actions_tool_use").verified, false, "no asset -> unverified");
});

// ---------------------------------------------------------------------------
// The seven-section / dimension structure stays intact after the artifact pass.
// ---------------------------------------------------------------------------

test("artifact completeness preserves the seven-section structure and non-empty evidence", () => {
  const demoPack = buildDemoPack({ ...FULL_ARGS });
  assert.equal(demoPack.sections.length, 7);
  assert.equal(new Set(demoPack.sections.map((s) => s.dimension)).size, 7);
  for (const s of demoPack.sections) {
    assert.ok(s.evidence.trim().length > 0, `${s.id} has non-empty evidence`);
  }
});

// ---------------------------------------------------------------------------
// markArtifactCompleteness directly: combines vs. drives, records status.
// ---------------------------------------------------------------------------

test("markArtifactCompleteness combines with url-backed verified and records artifact status", () => {
  const sections = [
    // url-backed (carries failingUrls), already reachability-verified.
    { id: "demo_presentation", dimension: "Demo & Presentation", verified: true, failingUrls: [] },
    // non-url-backed artifact section.
    { id: "actions_tool_use", dimension: "Actions & Tool Use", verified: false },
    // non-artifact section untouched.
    { id: "orchestration", dimension: "Orchestration", verified: false },
  ];
  const artifactReferences = {
    stripeSession: { status: "present", sessionId: "cs_x" },
    renderedAsset: { status: NOT_AVAILABLE, reference: null },
  };
  const marked = markArtifactCompleteness({ sections, artifactReferences });

  const demo = marked.find((s) => s.id === "demo_presentation");
  assert.equal(demo.verified, true, "reachable AND session present -> verified");
  assert.equal(demo.artifact.status, "present");

  const actions = marked.find((s) => s.id === "actions_tool_use");
  assert.equal(actions.verified, false, "missing asset -> unverified");
  assert.equal(actions.artifact.status, NOT_AVAILABLE);

  const orchestration = marked.find((s) => s.id === "orchestration");
  assert.equal(orchestration.verified, false, "non-artifact section untouched");
  assert.equal("artifact" in orchestration, false, "no artifact field on non-artifact section");
});

// ---------------------------------------------------------------------------
// At a non-terminal state, artifact completeness is not applied (2.13 seam).
// ---------------------------------------------------------------------------

test("non-terminal state leaves artifact-backed sections unverified", () => {
  const demoPack = buildDemoPack({ ...FULL_ARGS, state: "approval_required" });
  assert.equal(demoPack.atTerminalRunState, false);
  assert.equal(section(demoPack, "demo_presentation").verified, false);
  assert.equal(section(demoPack, "actions_tool_use").verified, false);
  // artifactReferences is still computed for observability.
  assert.equal(demoPack.artifactReferences.stripeSession.status, "present");
});
