// Unit tests for Demo_Pack artifact-reference completeness surfaced THROUGH the
// terminal Run_Manifest templating layer
// (agentic-graph-acos-mcp-connector spec, task 10.3 — R3.6, R3.7 / Property 23).
//
// Task 10.3 is VERIFY-AND-EXTEND. The artifact-reference engine itself
// (`buildArtifactReferences` / `markArtifactCompleteness`) is covered against
// the loose `buildDemoPack(...)` argument bag by
// `demo-pack-artifact-references.test.mjs` (task 2.15). The templating layer
// (`buildDemoPackFromManifest`) is covered for the all-present and all-absent
// cases by `demo-pack-template.test.mjs` (task 10.1).
//
// This file closes the remaining gap mandated by task 10.3: that EACH of the
// three artifacts — Evidence_Pack citations, the rendered asset reference, and
// the Stripe session id — is, when surfaced from a TERMINAL Run_Manifest via
// `buildDemoPackFromManifest`:
//   * referenced when it exists (R3.6), and
//   * explicitly marked "not available" when it is the ONLY one absent (R3.7),
// with full coverage of all-three-present, each-individually-absent, and
// all-absent. PURE / TIMER-FREE: zero live network / AWS / Cloudflare calls —
// every manifest is an in-memory object.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildDemoPackFromManifest } from "../video-remix/demo-pack-template.js";
import { NOT_AVAILABLE } from "../video-remix/demo-pack.js";

// Build a terminal (canonical SSOT shape) Run_Manifest, selectively including
// each artifact. `citations`/`asset`/`session` toggle the three artifacts.
function terminalManifest({ citations = true, asset = true, session = true } = {}) {
  const stages = [
    {
      id: "research",
      status: "completed",
      retryCount: 0,
      costLog: null,
      artifact: citations
        ? {
          sources: [
            { sourceId: "s1", url: "https://example.com/a" },
            { sourceId: "s2", url: "https://example.com/b" },
          ],
        }
        : { sources: [] },
    },
    {
      id: "render",
      status: "completed",
      retryCount: 0,
      costLog: null,
      artifact: asset
        ? { assets: [{ shotId: "shot-1", assetUrl: "https://airvio.co/assets/shot-1.mp4", ledgerEventId: "led-1" }] }
        : { assets: [] },
    },
    {
      id: "checkout",
      status: "completed",
      retryCount: 0,
      costLog: null,
      artifact: session ? { checkout: { sessionId: "cs_test_103", payoutSettled: true } } : { checkout: {} },
    },
  ];
  return {
    runId: "task-10-3-terminal",
    state: "completed",
    mode: "live",
    stages,
    approvalGates: [{ gateId: "cloud-deploy", approvalState: "approved", estimatedCostUsd: 0, token: null }],
    budgetMeters: { estimatedCostUsd: 0, actualCostUsd: 0, providerSpendUsd: 0 },
    demoPack: null,
    failures: [],
    reconciliationFlags: [],
  };
}

function section(demoPack, id) {
  return demoPack.sections.find((s) => s.id === id);
}

// Assert the three artifact statuses on a templated Demo_Pack in one shot.
function assertStatuses(demoPack, { citations, asset, session }) {
  const refs = demoPack.artifactReferences;
  assert.equal(refs.evidenceCitations.status, citations, "evidenceCitations status");
  assert.equal(refs.renderedAsset.status, asset, "renderedAsset status");
  assert.equal(refs.stripeSession.status, session, "stripeSession status");
}

const PRESENT = "present";

// ---------------------------------------------------------------------------
// All three present (R3.6) — referenced on artifactReferences AND in evidence.
// ---------------------------------------------------------------------------

test("manifest with all three artifacts references each one (R3.6)", () => {
  const demoPack = buildDemoPackFromManifest(terminalManifest());
  assert.equal(demoPack.terminal, true);

  assertStatuses(demoPack, { citations: PRESENT, asset: PRESENT, session: PRESENT });

  // Concrete references flow into artifactReferences.
  assert.equal(demoPack.artifactReferences.evidenceCitations.count, 2);
  assert.equal(demoPack.artifactReferences.renderedAsset.reference.assetUrl, "https://airvio.co/assets/shot-1.mp4");
  assert.equal(demoPack.artifactReferences.stripeSession.sessionId, "cs_test_103");

  // ...and each appears in its backing section's evidence text (R3.6).
  assert.match(section(demoPack, "autonomy_decision_making").evidence, /Evidence_Pack citation\(s\) referenced/);
  assert.match(section(demoPack, "actions_tool_use").evidence, /https:\/\/airvio\.co\/assets\/shot-1\.mp4/);
  assert.match(section(demoPack, "demo_presentation").evidence, /cs_test_103/);
});

// ---------------------------------------------------------------------------
// Each individually absent (R3.7) — the absent one is "not available", the
// other two remain referenced.
// ---------------------------------------------------------------------------

test("only Evidence_Pack citations absent -> citations not available, others referenced (R3.7)", () => {
  const demoPack = buildDemoPackFromManifest(terminalManifest({ citations: false }));
  assertStatuses(demoPack, { citations: NOT_AVAILABLE, asset: PRESENT, session: PRESENT });
  assert.equal(demoPack.artifactReferences.evidenceCitations.count, 0);
  assert.deepEqual(demoPack.artifactReferences.evidenceCitations.citations, []);
  assert.match(section(demoPack, "autonomy_decision_making").evidence, /Evidence_Pack citations not available/);
  // The two present artifacts are still referenced.
  assert.match(section(demoPack, "actions_tool_use").evidence, /https:\/\/airvio\.co\/assets\/shot-1\.mp4/);
  assert.match(section(demoPack, "demo_presentation").evidence, /cs_test_103/);
});

test("only rendered asset absent -> asset not available, others referenced (R3.7)", () => {
  const demoPack = buildDemoPackFromManifest(terminalManifest({ asset: false }));
  assertStatuses(demoPack, { citations: PRESENT, asset: NOT_AVAILABLE, session: PRESENT });
  assert.equal(demoPack.artifactReferences.renderedAsset.reference, null);
  assert.match(section(demoPack, "actions_tool_use").evidence, /rendered asset reference not available/);
  // The two present artifacts are still referenced.
  assert.match(section(demoPack, "autonomy_decision_making").evidence, /Evidence_Pack citation\(s\) referenced/);
  assert.match(section(demoPack, "demo_presentation").evidence, /cs_test_103/);
});

test("only Stripe session absent -> session not available, others referenced (R3.7)", () => {
  const demoPack = buildDemoPackFromManifest(terminalManifest({ session: false }));
  assertStatuses(demoPack, { citations: PRESENT, asset: PRESENT, session: NOT_AVAILABLE });
  assert.equal(demoPack.artifactReferences.stripeSession.sessionId, null);
  assert.match(section(demoPack, "demo_presentation").evidence, /Stripe checkout session not available/);
  // The two present artifacts are still referenced.
  assert.match(section(demoPack, "autonomy_decision_making").evidence, /Evidence_Pack citation\(s\) referenced/);
  assert.match(section(demoPack, "actions_tool_use").evidence, /https:\/\/airvio\.co\/assets\/shot-1\.mp4/);
});

// ---------------------------------------------------------------------------
// All three absent (R3.7) — every artifact marked "not available".
// ---------------------------------------------------------------------------

test("manifest with no artifacts marks all three not available (R3.7)", () => {
  const demoPack = buildDemoPackFromManifest(terminalManifest({ citations: false, asset: false, session: false }));
  assert.equal(demoPack.terminal, true);
  assertStatuses(demoPack, { citations: NOT_AVAILABLE, asset: NOT_AVAILABLE, session: NOT_AVAILABLE });
  assert.match(section(demoPack, "autonomy_decision_making").evidence, /Evidence_Pack citations not available/);
  assert.match(section(demoPack, "actions_tool_use").evidence, /rendered asset reference not available/);
  assert.match(section(demoPack, "demo_presentation").evidence, /Stripe checkout session not available/);
  // Seven non-empty sections still hold with zero artifacts (R3.1 invariant).
  assert.equal(demoPack.sections.length, 7);
  for (const s of demoPack.sections) assert.ok(s.evidence.trim().length > 0, `${s.id} non-empty`);
});

// ---------------------------------------------------------------------------
// Artifact presence drives the backing sections' `verified` from the manifest
// path too (R3.7): an absent artifact leaves its section unverified.
// ---------------------------------------------------------------------------

test("artifact presence/absence drives section verified through the manifest path", () => {
  // All present + reachable urls -> all three artifact-backed sections verified.
  const present = buildDemoPackFromManifest(terminalManifest(), { reachability: () => ({ status: 200 }) });
  assert.equal(section(present, "autonomy_decision_making").verified, true, "citations present -> verified");
  assert.equal(section(present, "actions_tool_use").verified, true, "asset present -> verified");
  assert.equal(section(present, "demo_presentation").verified, true, "reachable url + session -> verified");

  // Each individually absent leaves exactly its backing section unverified.
  const noCit = buildDemoPackFromManifest(terminalManifest({ citations: false }), { reachability: () => ({ status: 200 }) });
  assert.equal(section(noCit, "autonomy_decision_making").verified, false, "no citations -> unverified");

  const noAsset = buildDemoPackFromManifest(terminalManifest({ asset: false }), { reachability: () => ({ status: 200 }) });
  assert.equal(section(noAsset, "actions_tool_use").verified, false, "no asset -> unverified");

  const noSession = buildDemoPackFromManifest(terminalManifest({ session: false }), { reachability: () => ({ status: 200 }) });
  assert.equal(section(noSession, "demo_presentation").verified, false, "no session -> unverified");
});
