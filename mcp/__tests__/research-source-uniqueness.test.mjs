// Unit tests for Source_Card sourceId uniqueness within an Evidence_Pack
// (agentic-graph-acos-mcp-connector spec, task 3.2 / R6.2 / Property 10).
//
// R6.2: WHEN the Research_Harness creates an Evidence_Pack, THE Research_Harness
// SHALL assign each Source_Card a `sourceId` that is unique within that
// Evidence_Pack.
//
// These example-based asserts exercise the uniqueness ENFORCEMENT seam: a
// client returning duplicate ids, a client returning missing/blank ids, and a
// mixed/colliding case. In every case the resulting pack must have all-unique
// sourceIds, the SAME source count (no fabrication / no removal), and citations
// that mirror the (now-unique) ids one-to-one. This is the implementation seam
// for Property 10; the consolidated property-based test lands in task 9.1.

import { test } from "node:test";
import assert from "node:assert/strict";

import { runResearchHarness } from "../video-remix-runtime.js";

const VALID_INPUT = Object.freeze({
  referenceUrl: "https://example.com/reference.mp4",
  query: "launch teaser remix",
  maxResults: 10,
});

function makeExaClient(cards) {
  return {
    // Intentionally NOT flagged isDeterministicMock so we observe the raw seam,
    // but the harness still records 0 paid calls unless told otherwise.
    search() {
      return cards;
    },
  };
}

function assertAllUnique(sources) {
  const ids = sources.map((source) => source.sourceId);
  assert.equal(new Set(ids).size, ids.length, `sourceIds must be unique: ${ids.join(",")}`);
  for (const id of ids) {
    assert.ok(typeof id === "string" && id.length > 0, "every sourceId must be a non-empty string");
  }
}

function assertCitationsMirror(pack) {
  assert.equal(pack.citations.length, pack.sources.length, "one citation per source");
  pack.citations.forEach((citation, index) => {
    assert.equal(citation.sourceId, pack.sources[index].sourceId, "citation mirrors source id");
    assert.equal(citation.url, pack.sources[index].url, "citation mirrors source url");
  });
}

test("R6.2: a client returning DUPLICATE sourceIds yields all-unique ids, same count", async () => {
  const exaClient = makeExaClient([
    { sourceId: "dup", url: "https://dup.test/1" },
    { sourceId: "dup", url: "https://dup.test/2" },
    { sourceId: "dup", url: "https://dup.test/3" },
    { sourceId: "dup", url: "https://dup.test/4" },
  ]);
  const { evidencePack } = await runResearchHarness(VALID_INPUT, { exaClient });

  assert.equal(evidencePack.sources.length, 4, "source COUNT must be preserved (no fabrication/removal)");
  assertAllUnique(evidencePack.sources);
  assertCitationsMirror(evidencePack);
});

test("R6.2: MISSING/blank sourceIds get stable unique ids, same count", async () => {
  const exaClient = makeExaClient([
    { url: "https://miss.test/1" },
    { sourceId: "", url: "https://miss.test/2" },
    { sourceId: "   ", url: "https://miss.test/3" },
    { sourceId: null, url: "https://miss.test/4" },
  ]);
  const { evidencePack } = await runResearchHarness(VALID_INPUT, { exaClient });

  assert.equal(evidencePack.sources.length, 4, "source COUNT must be preserved");
  assertAllUnique(evidencePack.sources);
  assertCitationsMirror(evidencePack);
});

test("R6.2: mixed explicit + colliding-with-fallback ids are all disambiguated", async () => {
  // An explicit id that clashes with the positional fallback `source-2` plus
  // duplicate explicit ids — all must end up unique without dropping sources.
  const exaClient = makeExaClient([
    { sourceId: "source-2", url: "https://mix.test/a" },
    { url: "https://mix.test/b" }, // fallback would be source-2 -> must be disambiguated
    { sourceId: "x", url: "https://mix.test/c" },
    { sourceId: "x", url: "https://mix.test/d" },
    { sourceId: "x", url: "https://mix.test/e" },
  ]);
  const { evidencePack } = await runResearchHarness(VALID_INPUT, { exaClient });

  assert.equal(evidencePack.sources.length, 5, "source COUNT must be preserved");
  assertAllUnique(evidencePack.sources);
  assertCitationsMirror(evidencePack);
});

test("R6.2: de-duplication is deterministic for the same input", async () => {
  const cards = [
    { sourceId: "dup", url: "https://det.test/1" },
    { sourceId: "dup", url: "https://det.test/2" },
    { sourceId: "dup", url: "https://det.test/3" },
  ];
  const a = await runResearchHarness(VALID_INPUT, { exaClient: makeExaClient(cards) });
  const b = await runResearchHarness(VALID_INPUT, { exaClient: makeExaClient(cards) });
  assert.deepEqual(
    a.evidencePack.sources.map((s) => s.sourceId),
    b.evidencePack.sources.map((s) => s.sourceId),
    "the same duplicate input must yield the same unique ids",
  );
});

test("R6.2: the deterministic default Evidence_Pack already has all-unique ids", async () => {
  const { evidencePack } = await runResearchHarness(VALID_INPUT);
  assertAllUnique(evidencePack.sources);
  assertCitationsMirror(evidencePack);
});
