// Unit tests for the Research_Harness DEGRADED path
// (agenticgraph-acos-mcp-connector spec, task 3.3 / R6.4 / R6.5 / Property 11 —
// production side).
//
// R6.4: IF Exa returns an error or the query does not complete within 30
// seconds, THEN THE Research_Harness SHALL return a degraded summary with an
// empty source list, mark the stage `weak_signal`, retain any partial input
// data without modification, and SHALL NOT fabricate sources.
//
// R6.5: IF Exa returns fewer than 3 Source_Cards, THEN THE Research_Harness
// SHALL mark the stage `weak_signal` and SHALL NOT fabricate additional
// sources to reach the minimum count.
//
// These are example-based unit asserts. This is the implementation seam for
// Property 11; the consolidated property-based test lands in task 9.1.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runResearchHarness,
  RESEARCH_GATE_ID,
  RESEARCH_DEADLINE_MS,
  RESEARCH_DEGRADE_EXA_ERROR,
  RESEARCH_DEGRADE_DEADLINE,
  RESEARCH_DEGRADE_INSUFFICIENT_SOURCES,
} from "../video-remix-runtime.js";

const VALID_INPUT = Object.freeze({
  referenceUrl: "https://example.com/reference.mp4",
  query: "launch teaser remix",
  maxResults: 6,
});

// A summary client that fabricates sources if ever asked — used to prove the
// degraded path NEVER routes through summary-driven fabrication.
function fabricatingSummaryClient() {
  return {
    summarize() {
      return "FABRICATED: invented three sources to satisfy the minimum.";
    },
  };
}

function assertDegradedEmptyPack(result, expectedReason) {
  assert.equal(result.status, "weak_signal", "stage must be marked weak_signal");
  assert.equal(result.degraded, true);
  assert.equal(result.degradeReason, expectedReason);
  assert.equal(result.gateId, RESEARCH_GATE_ID);
  assert.equal(result.deadlineMs, RESEARCH_DEADLINE_MS);

  const pack = result.evidencePack;
  assert.ok(pack && typeof pack === "object", "evidencePack must be present");
  assert.deepEqual(pack.sources, [], "sources must be EMPTY (no fabrication)");
  assert.deepEqual(pack.citations, [], "citations must be EMPTY");
  assert.equal(typeof pack.summary, "string");
  assert.ok(pack.summary.length > 0, "degraded summary must be non-empty");
  assert.match(pack.summary, /never fabricated/i, "summary must affirm no fabrication");
}

// ---------------------------------------------------------------------------
// R6.4: Exa error → empty sources + weak_signal + no fabrication + input kept
// ---------------------------------------------------------------------------

test("R6.4: an Exa client that throws yields a degraded empty pack, weak_signal, no fabrication", async () => {
  const exaClient = {
    search() {
      throw new Error("exa upstream 503");
    },
  };
  const result = await runResearchHarness(VALID_INPUT, {
    exaClient,
    summaryClient: fabricatingSummaryClient(),
  });

  assertDegradedEmptyPack(result, RESEARCH_DEGRADE_EXA_ERROR);
  // Partial input retained without modification.
  assert.equal(result.referenceUrl, "https://example.com/reference.mp4");
  assert.equal(result.query, "launch teaser remix");
  assert.equal(result.maxResults, 6);
  // The fabricating summary client must not have leaked into the pack.
  assert.doesNotMatch(result.evidencePack.summary, /FABRICATED/);
});

test("R6.4: an async Exa client that rejects is treated as a degraded error path", async () => {
  const exaClient = {
    async search() {
      throw new Error("network timeout from provider");
    },
  };
  const result = await runResearchHarness(VALID_INPUT, { exaClient });
  assertDegradedEmptyPack(result, RESEARCH_DEGRADE_EXA_ERROR);
});

// ---------------------------------------------------------------------------
// R6.4: 30s timeout (injectable signal, timer-free) → same degraded pack
// ---------------------------------------------------------------------------

test("R6.4: an injected deadline signal (boolean) degrades without issuing the search", async () => {
  let searchCalls = 0;
  const exaClient = {
    search() {
      searchCalls += 1;
      return [{ sourceId: "x", url: "https://x.test/1" }];
    },
  };
  const result = await runResearchHarness(VALID_INPUT, {
    exaClient,
    timeoutSignal: true,
  });

  assertDegradedEmptyPack(result, RESEARCH_DEGRADE_DEADLINE);
  assert.equal(searchCalls, 0, "deadline short-circuits before the search is issued");
  // Partial input retained.
  assert.equal(result.referenceUrl, "https://example.com/reference.mp4");
  assert.equal(result.query, "launch teaser remix");
});

test("R6.4: a deadline predicate function is honored", async () => {
  const result = await runResearchHarness(VALID_INPUT, {
    timeoutSignal: () => true,
  });
  assertDegradedEmptyPack(result, RESEARCH_DEGRADE_DEADLINE);
});

test("R6.4: an Exa result that signals a timeout (no throw) degrades as deadline_exceeded", async () => {
  const exaClient = {
    search() {
      return { timedOut: true };
    },
  };
  const result = await runResearchHarness(VALID_INPUT, { exaClient });
  assertDegradedEmptyPack(result, RESEARCH_DEGRADE_DEADLINE);
});

// ---------------------------------------------------------------------------
// R6.5: fewer than 3 sources → weak_signal, REAL count preserved, no fabrication
// ---------------------------------------------------------------------------

test("R6.5: a search returning 2 sources is weak_signal and keeps the real count of 2", async () => {
  const exaClient = {
    search() {
      return [
        { sourceId: "real-1", url: "https://real.test/1" },
        { sourceId: "real-2", url: "https://real.test/2" },
      ];
    },
  };
  const result = await runResearchHarness(VALID_INPUT, {
    exaClient,
    summaryClient: fabricatingSummaryClient(),
  });

  assert.equal(result.status, "weak_signal");
  assert.equal(result.degraded, true);
  assert.equal(result.degradeReason, RESEARCH_DEGRADE_INSUFFICIENT_SOURCES);
  // The REAL count is preserved — NOT padded to the 3-card minimum.
  assert.equal(result.evidencePack.sources.length, 2);
  assert.equal(result.evidencePack.citations.length, 2);
  assert.deepEqual(
    result.evidencePack.sources.map((s) => s.sourceId),
    ["real-1", "real-2"],
  );
});

test("R6.5: a search returning exactly 0 sources is weak_signal with an empty (un-padded) pack", async () => {
  const exaClient = {
    search() {
      return [];
    },
  };
  const result = await runResearchHarness(VALID_INPUT, { exaClient });
  assert.equal(result.status, "weak_signal");
  assert.equal(result.degradeReason, RESEARCH_DEGRADE_INSUFFICIENT_SOURCES);
  assert.equal(result.evidencePack.sources.length, 0);
  assert.equal(result.evidencePack.citations.length, 0);
});

test("R6.5: exactly 3 sources is NOT weak_signal (boundary stays on the success path)", async () => {
  const exaClient = {
    search() {
      return [
        { sourceId: "s-1", url: "https://s.test/1" },
        { sourceId: "s-2", url: "https://s.test/2" },
        { sourceId: "s-3", url: "https://s.test/3" },
      ];
    },
  };
  const result = await runResearchHarness(VALID_INPUT, { exaClient });
  assert.equal(result.status, "complete");
  assert.equal(result.degraded, false);
  assert.equal(result.degradeReason, null);
  assert.equal(result.evidencePack.sources.length, 3);
});
