// =============================================================================
// Property-based tests — Demo_Pack assembly logic (spec task 9.1).
// Properties 22, 23. fast-check, >=100 runs each. The Demo_Pack builder is pure
// and timer-free (URL reachability / health probes are injected), so ZERO live
// network calls occur.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
  buildDemoPack,
  isTerminalRunState,
  FRONTEND_URL_KIND,
  AGENT_API_URL_KINDS,
  NOT_AVAILABLE,
} from "../video-remix/demo-pack.js";
import { wordArb } from "./arbitraries.mjs";

const RUNS = 200;

const TERMINAL_STATES = ["complete", "completed", "blocked", "budget_exceeded", "dry_run_ready", "verification_failed"];
const NON_TERMINAL_STATES = ["approval_required", "running"];

const sourcesArb = fc.array(
  fc.record({ sourceId: wordArb.map((s) => `src-${s}`), url: fc.webUrl() }),
  { maxLength: 5 },
);
const assetsArb = fc.array(
  fc.record({ shotId: wordArb, assetUrl: fc.webUrl(), ledgerEventId: wordArb.map((s) => `led-${s}`) }),
  { maxLength: 5 },
);
const checkoutArb = fc.oneof(
  fc.constant({}),
  fc.record({ sessionId: wordArb.map((s) => `cs_${s}`), payoutSettled: fc.boolean() }),
);

// -----------------------------------------------------------------------------
// Feature: agentic-graph-acos-mcp-connector, Property 22: For any Director run that reaches a terminal Run_State, the assembled Demo_Pack contains exactly seven non-empty evidence sections (one per judging dimension) and a urls[] collection containing at least one Frontend URL and at least one Agent_Api endpoint.
// -----------------------------------------------------------------------------
test("Property 22: Demo_Pack has seven non-empty sections with required URLs", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...TERMINAL_STATES),
      sourcesArb,
      assetsArb,
      checkoutArb,
      (state, sources, assets, checkout) => {
        const demoPack = buildDemoPack({ state, sources, assets, checkout });
        assert.equal(demoPack.atTerminalRunState, true);

        // Exactly seven non-empty sections, one per judging dimension.
        assert.equal(demoPack.sections.length, 7);
        assert.equal(new Set(demoPack.sections.map((s) => s.dimension)).size, 7);
        for (const section of demoPack.sections) {
          assert.equal(typeof section.evidence, "string");
          assert.ok(section.evidence.trim().length > 0);
        }

        // urls[] carries >=1 Frontend URL and >=1 Agent_Api endpoint.
        const frontend = demoPack.urls.filter((u) => u.kind === FRONTEND_URL_KIND);
        const agentApi = demoPack.urls.filter((u) => AGENT_API_URL_KINDS.includes(u.kind));
        assert.ok(frontend.length >= 1);
        assert.ok(agentApi.length >= 1);
        for (const entry of demoPack.urls) {
          assert.ok(typeof entry.url === "string" && entry.url.length > 0);
        }
      },
    ),
    { numRuns: RUNS },
  );

  // Off a terminal state, no demo urls are emitted (the run is still in flight).
  fc.assert(
    fc.property(fc.constantFrom(...NON_TERMINAL_STATES), (state) => {
      assert.equal(isTerminalRunState(state), false);
      const demoPack = buildDemoPack({ state, sources: [], assets: [], checkout: {} });
      assert.equal(demoPack.atTerminalRunState, false);
      assert.deepEqual(demoPack.urls, []);
      assert.equal(demoPack.sections.length, 7);
    }),
    { numRuns: 100 },
  );
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-acos-mcp-connector, Property 23: For any terminal run, each of the Evidence_Pack citations, the rendered asset reference, and the Stripe session identifier is referenced in the Demo_Pack when it exists and is marked not available when it does not; any Demo_Pack URL that does not return HTTP 200 within 5 seconds causes its corresponding section to be marked unverified with the failing URL recorded.
// -----------------------------------------------------------------------------
test("Property 23: Demo_Pack artifact-reference completeness", () => {
  fc.assert(
    fc.property(
      sourcesArb,
      assetsArb,
      checkoutArb,
      fc.boolean(),
      (sources, assets, checkout, reachable) => {
        // Inject a deterministic reachability result for every url (no network).
        const reachability = () => ({ status: reachable ? 200 : 503 });
        const demoPack = buildDemoPack({ state: "complete", sources, assets, checkout, reachability });

        const refs = demoPack.artifactReferences;
        // Each artifact is referenced when present and "not available" otherwise.
        const hasCitations = sources.length > 0;
        const hasAsset = assets.some((a) => a.assetUrl || a.ledgerEventId);
        const hasSession = Boolean(checkout && checkout.sessionId);

        assert.equal(refs.evidenceCitations.status, hasCitations ? "present" : NOT_AVAILABLE);
        assert.equal(refs.renderedAsset.status, hasAsset ? "present" : NOT_AVAILABLE);
        assert.equal(refs.stripeSession.status, hasSession ? "present" : NOT_AVAILABLE);

        // A url that does not return 200 marks its section unverified + records the failing url.
        if (!reachable) {
          assert.ok(demoPack.failingUrls.length >= 1);
          const demoSection = demoPack.sections.find((s) => s.id === "demo_presentation");
          assert.equal(demoSection.verified, false);
        }
      },
    ),
    { numRuns: RUNS },
  );
});
