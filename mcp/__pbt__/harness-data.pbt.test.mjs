// =============================================================================
// Property-based tests — research / storyboard / render harness logic
// (spec task 9.1). Properties 10, 11, 12, 14, 15, 16. fast-check, >=100 runs
// each, external deps mocked via the harness deterministic injectable seams
// (ZERO live network/AWS calls).
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
  // research / evidence (Property 10, 11)
  runResearchHarness,
  RESEARCH_MIN_SOURCE_CARDS,
  buildWeakSignalHalt,
  checkSourceReferentialIntegrity,
  // storyboard (Property 12, 14)
  runStoryboardHarness,
  validateKgcComputingFlowV1,
  flowRoundTripEquivalent,
  STORYBOARD_STATUS_COMPLETE,
  STORYBOARD_STATUS_FALLBACK,
  STORYBOARD_MAX_SHOTS,
  KGC_COMPUTING_FLOW_SCHEMA,
  // render (Property 15, 16)
  runRenderHarness,
  RENDER_GATE_ID,
  PROVIDER_BYTEPLUS_QUEUE,
  PROVIDER_MOCK,
  DEFAULT_MEDIA_BUCKET,
  MEDIA_BUCKET_PREFIX,
  selectRenderProvider,
} from "../video-remix-runtime.js";
import { wordArb, briefArb, shotCountBoundaryArb } from "./arbitraries.mjs";
const RUNS = 150;

function evidencePackOf(count) {
  const sources = Array.from({ length: count }, (_, i) => ({
    sourceId: `src-${i + 1}`,
    url: `https://example.com/evidence/${i + 1}`,
  }));
  return { sources, citations: sources.map((s) => ({ sourceId: s.sourceId, url: s.url })), summary: "ready" };
}

function validRenderToken(issuedAt = Date.now()) {
  return { gateId: RENDER_GATE_ID, issuedAt, consumed: false, verified: true };
}

// -----------------------------------------------------------------------------
// Feature: agentic-graph-acos-mcp-connector, Property 10: For any Evidence_Pack produced by the Research_Harness, every Source_Card sourceId is unique within the pack; and for any Storyboard_Harness output, every research-derived claim references at least one sourceId that resolves to a Source_Card present in the associated Evidence_Pack -- a claim referencing a sourceId absent from the pack is rejected with an unresolved-source error.
// -----------------------------------------------------------------------------
test("Property 10: source-card uniqueness and referential integrity", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.webUrl(),
      fc.integer({ min: 1, max: 10 }),
      async (referenceUrl, maxResults) => {
        const { evidencePack } = await runResearchHarness({ referenceUrl, maxResults });
        const ids = evidencePack.sources.map((s) => s.sourceId);
        // Every sourceId is unique within the pack (R6.2).
        assert.equal(new Set(ids).size, ids.length);

        const allowed = ids;
        // A claim referencing only in-pack ids resolves; one referencing an
        // absent id is rejected with an unresolved-source error (R6.3/R6.6).
        const okClaim = checkSourceReferentialIntegrity(
          [{ shotId: "shot-1", sourceCardIds: ids.length ? [ids[0]] : [] }],
          allowed,
        );
        assert.equal(okClaim.ok, true);
        const badClaim = checkSourceReferentialIntegrity(
          [{ shotId: "shot-1", sourceCardIds: ["ghost-source-id"] }],
          allowed,
        );
        assert.equal(badClaim.ok, false);
        assert.ok(badClaim.error && badClaim.error.code === "unresolved_source_reference");
      },
    ),
    { numRuns: RUNS },
  );
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-acos-mcp-connector, Property 11: For any research result yielding fewer than 3 Source_Cards, the Research_Harness marks the stage weak_signal, does not fabricate sources to reach the minimum, and the Director halts before the storyboard stage until a verified Approval_Token authorizes continuation.
// -----------------------------------------------------------------------------
test("Property 11: weak-signal on insufficient sources without fabrication", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 2 }),
      fc.boolean(),
      (sourceCount, continued) => {
        const halt = buildWeakSignalHalt(sourceCount, RESEARCH_MIN_SOURCE_CARDS, continued ? true : undefined);
        // Below the minimum is a weak signal; the count is never inflated.
        assert.equal(halt.weakSignal, true);
        assert.equal(halt.sourceCount, sourceCount);
        assert.ok(halt.sourceCount < RESEARCH_MIN_SOURCE_CARDS);
        // Halted until a verified continuation approval lifts it.
        if (continued) {
          assert.equal(halt.halted, false);
        } else {
          assert.equal(halt.halted, true);
          assert.equal(halt.awaitingApprovalToContinue, true);
        }
      },
    ),
    { numRuns: RUNS },
  );
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-acos-mcp-connector, Property 12: For any approved brief and plan of N planned shots (1 <= N <= 500), the emitted Kgc_Document validates against the kgc-computing-flow/v1 schema and contains exactly N flow.nodes[] entries (non-empty).
// -----------------------------------------------------------------------------
test("Property 12: storyboard node count and schema validity", async () => {
  // N focused on the [1,500] shot boundaries via the shared boundary generator
  // (spec task 9.4) so the first/last legal shot counts are always exercised.
  await fc.assert(
    fc.asyncProperty(briefArb, shotCountBoundaryArb, async (brief, n) => {
      const result = await runStoryboardHarness({ brief, evidencePack: evidencePackOf(4), shotCount: n });
      const expected = Math.min(n, STORYBOARD_MAX_SHOTS);
      assert.equal(result.status, STORYBOARD_STATUS_COMPLETE);
      assert.equal(result.flow.nodes.length, expected);
      assert.ok(result.flow.nodes.length >= 1);
      assert.equal(result.schema, KGC_COMPUTING_FLOW_SCHEMA);
      const validation = validateKgcComputingFlowV1({
        canvasDocumentMarkdown: result.canvasDocumentMarkdown,
        flow: result.flow,
      });
      assert.equal(validation.valid, true, JSON.stringify(validation.errors));
    }),
    { numRuns: RUNS },
  );
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-acos-mcp-connector, Property 14: For any storyboard reasoning failure, the emitted fallback Kgc_Document contains exactly one flow.nodes[] entry, validates against kgc-computing-flow/v1, satisfies the round-trip property, and is accompanied by an indication that fallback content was substituted.
// -----------------------------------------------------------------------------
test("Property 14: storyboard fallback preserves validity and round-trip", async () => {
  await fc.assert(
    fc.asyncProperty(
      briefArb,
      fc.integer({ min: 0, max: 6 }),
      fc.boolean(),
      async (brief, sourceN, throws) => {
        const chatClient = throws
          ? { plan() { throw new Error("reasoning unavailable"); } }
          : { plan() { return { reasoningFailed: true, reason: "degraded gateway" }; } };
        const result = await runStoryboardHarness(
          { brief, evidencePack: evidencePackOf(sourceN) },
          { chatClient },
        );
        // Indication that fallback content was substituted.
        assert.equal(result.status, STORYBOARD_STATUS_FALLBACK);
        assert.equal(result.fallbackSubstituted, true);
        // Exactly one node, valid, round-trips.
        assert.equal(result.flow.nodes.length, 1);
        assert.equal(result.schemaValid, true, JSON.stringify(result.schemaErrors));
        const validation = validateKgcComputingFlowV1({
          canvasDocumentMarkdown: result.canvasDocumentMarkdown,
          flow: result.flow,
        });
        assert.equal(validation.valid, true, JSON.stringify(validation.errors));
        assert.equal(flowRoundTripEquivalent(result.flow), true);
      },
    ),
    { numRuns: RUNS },
  );
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-acos-mcp-connector, Property 15: For any successfully rendered shot, the Render_Harness returns exactly one asset reference resolvable under the agentic-graph media bucket and records exactly one Credit_Ledger event -- capturing provider spend and provider identity -- before returning the asset reference.
// -----------------------------------------------------------------------------
test("Property 15: render success yields exactly one asset and one ledger event", () => {
  const assetRe = new RegExp(`^r2://${DEFAULT_MEDIA_BUCKET}/${MEDIA_BUCKET_PREFIX}/`);
  fc.assert(
    fc.property(
      fc.uniqueArray(wordArb, { minLength: 1, maxLength: 8 }),
      wordArb,
      (shotIds, runId) => {
        const shots = shotIds.map((id, i) => ({ shotId: `shot-${id}-${i}`, prompt: `p-${i}` }));
        const result = runRenderHarness(
          { shots, renderGateToken: validRenderToken() },
          { providerKeyAvailable: true, runId: `p15-${runId}` },
        );
        assert.equal(result.status, "complete");
        // Exactly one asset + one ledger event per shot.
        assert.equal(result.assets.length, shots.length);
        assert.equal(result.ledgerEvents.length, shots.length);
        assert.equal(new Set(result.assets.map((a) => a.shotId)).size, shots.length);
        for (const asset of result.assets) {
          assert.match(asset.assetUrl, assetRe);
          const matches = result.ledgerEvents.filter((e) => e.ledgerEventId === asset.ledgerEventId);
          assert.equal(matches.length, 1, "exactly one ledger event per asset");
          assert.equal(matches[0].provider, PROVIDER_BYTEPLUS_QUEUE);
          assert.ok(Number.isInteger(matches[0].providerSpendCents) && matches[0].providerSpendCents >= 0);
        }
      },
    ),
    { numRuns: RUNS },
  );
});

// -----------------------------------------------------------------------------
// Feature: agentic-graph-acos-mcp-connector, Property 16: For any shot where no provider key is available or cumulative recorded provider spend for the run meets or exceeds the budget cap, the Render_Harness routes the shot to the deterministic mock provider and records a Credit_Ledger event with provider spend equal to zero.
// -----------------------------------------------------------------------------
test("Property 16: budget/keyless renders use the zero-spend mock provider", () => {
  // Pure routing predicate over the keyless / over-budget matrix.
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.integer({ min: 0, max: 5000 }),
      fc.option(fc.integer({ min: 0, max: 5000 }), { nil: undefined }),
      (providerKeyAvailable, cumulativeSpendCents, budgetCapCents) => {
        const route = selectRenderProvider({ providerKeyAvailable, cumulativeSpendCents, budgetCapCents });
        const capReached = Number.isFinite(budgetCapCents) && cumulativeSpendCents >= budgetCapCents;
        const expectMock = !providerKeyAvailable || capReached;
        assert.equal(route.useMock, expectMock);
      },
    ),
    { numRuns: RUNS },
  );

  // Harness-level: a keyless run routes every shot to the zero-spend mock and
  // records a zero-spend ledger event while still emitting an asset.
  fc.assert(
    fc.property(fc.uniqueArray(wordArb, { minLength: 1, maxLength: 6 }), wordArb, (shotIds, runId) => {
      const shots = shotIds.map((id, i) => ({ shotId: `shot-${id}-${i}` }));
      const result = runRenderHarness(
        { shots, renderGateToken: validRenderToken() },
        { providerKeyAvailable: false, runId: `p16-${runId}` },
      );
      assert.equal(result.status, "complete");
      assert.equal(result.assets.length, shots.length);
      assert.equal(result.paidProviderCalls, 0);
      for (const asset of result.assets) assert.equal(asset.provider, PROVIDER_MOCK);
      for (const event of result.ledgerEvents) {
        assert.equal(event.provider, PROVIDER_MOCK);
        assert.equal(event.providerSpendCents, 0);
      }
    }),
    { numRuns: RUNS },
  );
});
