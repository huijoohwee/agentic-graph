// Unit tests for the Research_Harness contract
// (agentic-graph-acos-mcp-connector spec, task 3.1 / R6.1 / Property 10 —
// production side).
//
// R6.1: WHEN the research stage runs, THE Research_Harness SHALL query Exa
// through the Ai_Gateway and, within 30 seconds, produce an Evidence_Pack
// containing at least 3 and at most 50 Source_Cards.
//
// These are example-based unit asserts of the harness contract: the input
// clamp (`maxResults<=10`), the 3..50 Source_Card bound, the Evidence_Pack
// output shape `{ sources[], citations[], summary }`, the injectable client
// seam, and the deterministic network-free default. This is the implementation
// seam for Property 10; the consolidated property-based test lands in task 9.1.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runResearchHarness,
  validateResearchInput,
  clampMaxResults,
  createDeterministicExaClient,
  createDeterministicSummaryClient,
  ResearchHarnessInputError,
  RESEARCH_MAX_RESULTS,
  RESEARCH_MIN_SOURCE_CARDS,
  RESEARCH_MAX_SOURCE_CARDS,
  RESEARCH_DEADLINE_MS,
  RESEARCH_GATE_ID,
} from "../video-remix-runtime.js";

const VALID_INPUT = Object.freeze({
  referenceUrl: "https://example.com/reference.mp4",
  query: "launch teaser remix",
  maxResults: 6,
});

// ---------------------------------------------------------------------------
// Input contract: { referenceUrl, query?, maxResults<=10 }
// ---------------------------------------------------------------------------

test("validateResearchInput accepts a valid contract and normalizes values", () => {
  const out = validateResearchInput(VALID_INPUT);
  assert.equal(out.referenceUrl, "https://example.com/reference.mp4");
  assert.equal(out.query, "launch teaser remix");
  assert.equal(out.maxResults, 6);
});

test("validateResearchInput rejects a missing/invalid referenceUrl, naming the field", () => {
  for (const bad of [undefined, "", "   ", "not-a-url", "ftp://example.com/x"]) {
    assert.throws(
      () => validateResearchInput({ ...VALID_INPUT, referenceUrl: bad }),
      (err) =>
        err instanceof ResearchHarnessInputError &&
        err.field === "referenceUrl" &&
        err.code === "invalid_research_input",
      `referenceUrl=${JSON.stringify(bad)} must be rejected`,
    );
  }
});

test("validateResearchInput rejects a non-string query, naming the field", () => {
  assert.throws(
    () => validateResearchInput({ ...VALID_INPUT, query: 42 }),
    (err) => err instanceof ResearchHarnessInputError && err.field === "query",
  );
});

test("validateResearchInput rejects a non-numeric maxResults, naming the field", () => {
  assert.throws(
    () => validateResearchInput({ ...VALID_INPUT, maxResults: "lots" }),
    (err) => err instanceof ResearchHarnessInputError && err.field === "maxResults",
  );
});

test("query is optional — an omitted query is accepted", () => {
  const { query, ...rest } = VALID_INPUT;
  void query;
  const out = validateResearchInput(rest);
  assert.equal(out.query, "");
});

// ---------------------------------------------------------------------------
// maxResults<=10 clamp
// ---------------------------------------------------------------------------

test("clampMaxResults clamps into [1, 10] and defaults when unset", () => {
  assert.equal(clampMaxResults(undefined), 10);
  assert.equal(clampMaxResults(11), RESEARCH_MAX_RESULTS);
  assert.equal(clampMaxResults(999), RESEARCH_MAX_RESULTS);
  assert.equal(clampMaxResults(0), 1);
  assert.equal(clampMaxResults(-5), 1);
  assert.equal(clampMaxResults(7), 7);
  assert.equal(clampMaxResults(3.9), 3);
});

test("validateResearchInput clamps an out-of-range maxResults to <=10", () => {
  assert.equal(validateResearchInput({ ...VALID_INPUT, maxResults: 50 }).maxResults, 10);
  assert.equal(validateResearchInput({ ...VALID_INPUT, maxResults: 0 }).maxResults, 1);
});

// ---------------------------------------------------------------------------
// Evidence_Pack shape + 3..50 Source_Card bound (R6.1)
// ---------------------------------------------------------------------------

test("R6.1: produces an Evidence_Pack { sources[], citations[], summary } with 3..50 sources", async () => {
  const result = await runResearchHarness(VALID_INPUT);

  assert.equal(result.status, "complete");
  assert.equal(result.gateId, RESEARCH_GATE_ID);
  assert.equal(result.deadlineMs, RESEARCH_DEADLINE_MS);

  const pack = result.evidencePack;
  assert.ok(pack && typeof pack === "object", "evidencePack must be present");
  assert.ok(Array.isArray(pack.sources), "sources must be an array");
  assert.ok(Array.isArray(pack.citations), "citations must be an array");
  assert.equal(typeof pack.summary, "string");
  assert.ok(pack.summary.length > 0, "summary must be non-empty");

  assert.ok(
    pack.sources.length >= RESEARCH_MIN_SOURCE_CARDS &&
      pack.sources.length <= RESEARCH_MAX_SOURCE_CARDS,
    `expected 3..50 sources, got ${pack.sources.length}`,
  );
  // maxResults=6 is honored as the cap.
  assert.equal(pack.sources.length, 6);
});

test("each source has a sourceId + url; citations mirror them one-to-one", async () => {
  const { evidencePack } = await runResearchHarness(VALID_INPUT);
  for (const source of evidencePack.sources) {
    assert.ok(source.sourceId, "every Source_Card needs a sourceId");
    assert.ok(source.url, "every Source_Card needs a url");
  }
  assert.equal(evidencePack.citations.length, evidencePack.sources.length);
  evidencePack.citations.forEach((citation, index) => {
    assert.equal(citation.sourceId, evidencePack.sources[index].sourceId);
    assert.equal(citation.url, evidencePack.sources[index].url);
  });
});

test("the result is capped at the clamped maxResults (<=10)", async () => {
  const { evidencePack } = await runResearchHarness({ ...VALID_INPUT, maxResults: 50 });
  assert.ok(evidencePack.sources.length <= RESEARCH_MAX_RESULTS);
  assert.equal(evidencePack.sources.length, 10);
});

// ---------------------------------------------------------------------------
// Source_Card uniqueness seam (task 3.2): the default mock must not violate it.
// ---------------------------------------------------------------------------

test("the deterministic default emits unique sourceIds (does not violate the 3.2 seam)", async () => {
  const { evidencePack } = await runResearchHarness({ ...VALID_INPUT, maxResults: 10 });
  const ids = evidencePack.sources.map((source) => source.sourceId);
  assert.equal(new Set(ids).size, ids.length, "sourceIds must be unique");
});

// ---------------------------------------------------------------------------
// Deterministic, network-free default
// ---------------------------------------------------------------------------

test("the default clients are deterministic and record zero paid-provider calls", async () => {
  // Pin the clock so `captureTime` (set via `new Date().toISOString()` when no
  // `deps.now` is injected) is identical across both calls — otherwise two calls
  // at different milliseconds produce different `captureTime` fields and
  // `deepEqual` fails intermittently. The production harness uses the real clock
  // on deployed runs; this is a test-only seam.
  const pinnedNow = () => "2026-01-01T00:00:00.000Z";
  const a = await runResearchHarness(VALID_INPUT, { now: pinnedNow });
  const b = await runResearchHarness(VALID_INPUT, { now: pinnedNow });
  assert.equal(a.paidProviderCalls, 0);
  assert.deepEqual(a.evidencePack, b.evidencePack, "same input must yield the same Evidence_Pack");
});

// ---------------------------------------------------------------------------
// Injectable client seam (live wiring lands in task 9.2)
// ---------------------------------------------------------------------------

test("an injected Exa client is used for search (sync)", async () => {
  let called = 0;
  const exaClient = {
    search({ referenceUrl, maxResults }) {
      called += 1;
      assert.equal(referenceUrl, "https://example.com/reference.mp4");
      assert.equal(maxResults, 6);
      return [
        { sourceId: "inj-1", url: "https://injected.test/1" },
        { sourceId: "inj-2", url: "https://injected.test/2" },
        { sourceId: "inj-3", url: "https://injected.test/3" },
        { sourceId: "inj-4", url: "https://injected.test/4" },
      ];
    },
  };
  const result = await runResearchHarness(VALID_INPUT, { exaClient });
  assert.equal(called, 1);
  assert.equal(result.evidencePack.sources.length, 4);
  assert.equal(result.evidencePack.sources[0].sourceId, "inj-1");
});

test("an injected async Exa + summary client is awaited", async () => {
  const exaClient = {
    async search() {
      return [
        { sourceId: "a-1", url: "https://async.test/1" },
        { sourceId: "a-2", url: "https://async.test/2" },
        { sourceId: "a-3", url: "https://async.test/3" },
      ];
    },
  };
  const summaryClient = {
    async summarize({ sources }) {
      return `async summary over ${sources.length} cards`;
    },
  };
  const result = await runResearchHarness(VALID_INPUT, {
    exaClient,
    summaryClient,
    paidProviderCalls: 2,
  });
  assert.equal(result.evidencePack.summary, "async summary over 3 cards");
  // Non-deterministic (live) clients let the caller report paid-provider calls.
  assert.equal(result.paidProviderCalls, 2);
});

// ---------------------------------------------------------------------------
// Mock client builders are usable standalone (the seam task 9.2 swaps out).
// ---------------------------------------------------------------------------

test("createDeterministicExaClient honors a fixed count and the maxResults cap", () => {
  const client = createDeterministicExaClient({ count: 4 });
  assert.equal(client.search({ referenceUrl: "https://h.test/v", maxResults: 10 }).length, 4);
  // The maxResults cap still applies on top of the fixed count.
  assert.equal(client.search({ referenceUrl: "https://h.test/v", maxResults: 2 }).length, 2);
});

test("createDeterministicSummaryClient flags weak signal for <3 cards", () => {
  const client = createDeterministicSummaryClient();
  const summary = client.summarize({ sources: [{ sourceId: "x", url: "https://x.test" }] });
  assert.match(summary, /[Ww]eak signal/);
});
