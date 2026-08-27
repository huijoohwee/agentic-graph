// Unit tests for the Storyboard_Harness source referential integrity
// (agenticgraph-acos-mcp-connector spec, task 3.8 / R6.3 / R6.6 / Property 10 —
// the storyboard-claim side).
//
// Task 3.8 — source referential integrity (R6.3 / R6.6 / Property 10). Every
// downstream claim's referenced sourceId(s) MUST resolve to a Source_Card
// present in the associated Evidence_Pack; a claim referencing an out-of-pack
// sourceId is rejected with an unresolved-source error and emits no nodes. The
// success/reject(schema)/fallback paths stay distinct. The consolidated
// property-based test lands in task 9.1.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runStoryboardHarness,
  collectClaimSourceIds,
  findUnresolvedSourceReferences,
  checkSourceReferentialIntegrity,
  StoryboardUnresolvedSourceError,
  STORYBOARD_STATUS_COMPLETE,
  STORYBOARD_STATUS_REJECTED,
  STORYBOARD_STATUS_UNRESOLVED_SOURCE,
} from "../video-remix-runtime.js";

function evidencePackOf(count) {
  const sources = Array.from({ length: count }, (_, index) => ({
    sourceId: `src-${index + 1}`,
    url: `https://example.com/evidence/${index + 1}`,
  }));
  return {
    sources,
    citations: sources.map((s) => ({ sourceId: s.sourceId, url: s.url })),
    summary: "Source-backed evidence is ready for storyboard planning.",
  };
}

const VALID_INPUT = Object.freeze({
  brief: "Launch teaser remix with bold kinetic typography",
  evidencePack: evidencePackOf(4),
  shotCount: 5,
});

// ---------------------------------------------------------------------------
// Pure helpers: collectClaimSourceIds / findUnresolvedSourceReferences /
// checkSourceReferentialIntegrity
// ---------------------------------------------------------------------------

test("collectClaimSourceIds returns ordered unique non-empty ids across claims", () => {
  const shots = [
    { shotId: "shot-1", sourceCardIds: ["a", "b"] },
    { shotId: "shot-2", sourceCardIds: ["a", "", "c"] },
    { shotId: "shot-3", sourceCardIds: [] },
  ];
  assert.deepEqual(collectClaimSourceIds(shots), ["a", "b", "c"]);
  assert.deepEqual(collectClaimSourceIds([]), []);
  assert.deepEqual(collectClaimSourceIds(undefined), []);
});

test("findUnresolvedSourceReferences flags only out-of-pack references, in claim order", () => {
  const shots = [
    { shotId: "shot-1", sourceCardIds: ["src-1"] },
    { shotId: "shot-2", sourceCardIds: ["ghost-9", "src-2"] },
    { shotId: "shot-3", sourceCardIds: ["src-3", "ghost-7"] },
  ];
  const out = findUnresolvedSourceReferences(shots, ["src-1", "src-2", "src-3"]);
  assert.deepEqual(out, [
    { shotId: "shot-2", sourceId: "ghost-9" },
    { shotId: "shot-3", sourceId: "ghost-7" },
  ]);
});

test("findUnresolvedSourceReferences returns [] when every reference is in-pack", () => {
  const shots = [{ shotId: "shot-1", sourceCardIds: ["src-1"] }];
  assert.deepEqual(findUnresolvedSourceReferences(shots, ["src-1", "src-2"]), []);
  // No references at all is also clean (a claim need not cite a source).
  assert.deepEqual(findUnresolvedSourceReferences([{ shotId: "shot-1", sourceCardIds: [] }], []), []);
});

test("checkSourceReferentialIntegrity returns ok for in-pack claims and a typed error otherwise", () => {
  const ok = checkSourceReferentialIntegrity(
    [{ shotId: "shot-1", sourceCardIds: ["src-1"] }],
    ["src-1"],
  );
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.unresolved, []);
  assert.equal(ok.error, null);

  const bad = checkSourceReferentialIntegrity(
    [{ shotId: "shot-1", sourceCardIds: ["ghost-1"] }],
    ["src-1"],
  );
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.unresolved, [{ shotId: "shot-1", sourceId: "ghost-1" }]);
  assert.ok(bad.error instanceof StoryboardUnresolvedSourceError);
  assert.equal(bad.error.code, "unresolved_source_reference");
  assert.equal(bad.error.field, "sourceCardIds");
  assert.ok(bad.error.message.includes("ghost-1"));
});

// ---------------------------------------------------------------------------
// R6.3: a claim referencing an in-pack sourceId is accepted (success intact)
// ---------------------------------------------------------------------------

test("R6.3: a claim referencing an in-pack sourceId is accepted (status complete)", async () => {
  const chatClient = {
    plan({ sourceIds, shotCount }) {
      return {
        shots: Array.from({ length: shotCount }, (_, i) => ({
          prompt: `scene ${i + 1}`,
          // References only ids that exist in the Evidence_Pack.
          sourceCardIds: [sourceIds[i % sourceIds.length]],
        })),
      };
    },
  };
  const result = await runStoryboardHarness(VALID_INPUT, { chatClient });
  assert.equal(result.status, STORYBOARD_STATUS_COMPLETE);
  assert.equal(result.schemaValid, true, JSON.stringify(result.schemaErrors));
  assert.ok(result.flow.nodes.length > 0);
  assert.equal(result.fallbackSubstituted, false);
  // No unresolved-source surface on the accepted path.
  assert.equal(result.unresolvedSourceError, undefined);
  const packIds = new Set(VALID_INPUT.evidencePack.sources.map((s) => s.sourceId));
  for (const shot of result.plannedShots) {
    for (const id of shot.sourceCardIds) assert.ok(packIds.has(id));
  }
});

// ---------------------------------------------------------------------------
// R6.6: a claim referencing an out-of-pack sourceId is rejected
// ---------------------------------------------------------------------------

test("R6.6: an injected client claim referencing an out-of-pack sourceId is rejected with an unresolved-source error", async () => {
  const chatClient = {
    plan({ shotCount }) {
      return {
        shots: Array.from({ length: shotCount }, (_, i) => ({
          prompt: `scene ${i + 1}`,
          // The first shot cites a sourceId that is NOT in the Evidence_Pack.
          sourceCardIds: i === 0 ? ["ghost-404"] : ["src-1"],
        })),
      };
    },
  };
  const result = await runStoryboardHarness(VALID_INPUT, { chatClient });
  assert.equal(result.status, STORYBOARD_STATUS_UNRESOLVED_SOURCE);
  // No nodes emitted (R6.6): the unresolved claim is rejected, not emitted.
  assert.equal(result.shotCount, 0);
  assert.deepEqual(result.flow, { nodes: [], edges: [] });
  assert.equal(result.canvasDocumentMarkdown, null);
  // The unresolved-source surface names the offending reference.
  assert.ok(Array.isArray(result.unresolvedSources));
  assert.deepEqual(result.unresolvedSources, [{ shotId: "shot-1", sourceId: "ghost-404" }]);
  assert.ok(result.unresolvedSourceError && /ghost-404/.test(result.unresolvedSourceError));
  // Distinct from fallback and schema reject.
  assert.equal(result.fallbackSubstituted, false);
  assert.equal(result.validationError, null);
  assert.equal(result.paidProviderCalls, 0);
});

test("R6.6: a beforeEmit transform that injects an out-of-pack claim is rejected", async () => {
  const result = await runStoryboardHarness(VALID_INPUT, {
    beforeEmit: ({ plannedShots }) => ({
      plannedShots: plannedShots.map((shot, index) =>
        index === 1 ? { ...shot, sourceCardIds: ["not-in-pack"] } : shot,
      ),
    }),
  });
  assert.equal(result.status, STORYBOARD_STATUS_UNRESOLVED_SOURCE);
  assert.deepEqual(result.unresolvedSources, [{ shotId: "shot-2", sourceId: "not-in-pack" }]);
  assert.equal(result.flow.nodes.length, 0);
});

// ---------------------------------------------------------------------------
// The three reject/success paths remain distinct.
// ---------------------------------------------------------------------------

test("the success, schema-reject, and unresolved-source paths produce distinct statuses", async () => {
  // 1. success (default deterministic client references only in-pack ids).
  const success = await runStoryboardHarness(VALID_INPUT);
  assert.equal(success.status, STORYBOARD_STATUS_COMPLETE);

  // 2. schema reject (beforeEmit corrupts the graph with a dangling edge).
  const schemaReject = await runStoryboardHarness(VALID_INPUT, {
    beforeEmit: ({ flow }) => ({
      flow: {
        nodes: flow.nodes,
        edges: [...flow.edges, { id: "edge-bad", source: flow.nodes[0].id, target: "ghost" }],
      },
    }),
  });
  assert.equal(schemaReject.status, STORYBOARD_STATUS_REJECTED);
  assert.ok(/does not resolve/.test(schemaReject.validationError));
  assert.equal(schemaReject.unresolvedSourceError, undefined);

  // 3. unresolved-source reject (out-of-pack claim).
  const unresolved = await runStoryboardHarness(VALID_INPUT, {
    chatClient: {
      plan: ({ shotCount }) => ({
        shots: Array.from({ length: shotCount }, () => ({ prompt: "x", sourceCardIds: ["nope"] })),
      }),
    },
  });
  assert.equal(unresolved.status, STORYBOARD_STATUS_UNRESOLVED_SOURCE);
  assert.equal(unresolved.validationError, null);
  assert.ok(/nope/.test(unresolved.unresolvedSourceError));

  // All three statuses are mutually distinct.
  assert.equal(new Set([success.status, schemaReject.status, unresolved.status]).size, 3);
});

test("StoryboardUnresolvedSourceError carries the unresolved pairs and a typed code", () => {
  const err = new StoryboardUnresolvedSourceError([{ shotId: "shot-2", sourceId: "ghost" }]);
  assert.equal(err.name, "StoryboardUnresolvedSourceError");
  assert.equal(err.code, "unresolved_source_reference");
  assert.deepEqual(err.unresolved, [{ shotId: "shot-2", sourceId: "ghost" }]);
  assert.ok(err.message.includes("ghost"));
});
