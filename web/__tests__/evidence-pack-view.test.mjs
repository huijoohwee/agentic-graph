// Tests for the Evidence_Pack display view-model
// (agenticgraph-acos-mcp-connector spec, task 7.4 / R1.4 / design Correctness
// Property 32 / design Frontend `renderManifest`).
//
// Covers:
//   - the view lists EVERY cited source in the Evidence_Pack (count matches the
//     pack's sources/citations; no dropping, no dedup beyond the pack's own ids)
//   - each source entry carries its sourceId + display fields
//   - an empty / degraded pack (no sources, R6.4 weak_signal) renders gracefully
//     with zero entries while still surfacing the degraded summary/status
//   - both the raw Evidence_Pack and the Research_Harness envelope are accepted
//   - malformed input never throws
//
// The Evidence_Pack / Source_Card shape MIRRORS the Research_Harness output in
// `mcp/video-remix/research-harness.js` + `mcp/video-remix/evidence.js`.
//
// ZERO network / ZERO browser.

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEvidencePackView,
  resolveEvidencePack,
} from "../src/lib/evidence-pack-view.js";

// --- Fixtures ---------------------------------------------------------------

/**
 * A success-path Evidence_Pack as the Research_Harness emits it: N Source_Cards
 * each with a unique sourceId + display fields, citations mirroring the source
 * ids one-to-one, and a source-backed summary.
 */
function evidencePack(count = 4) {
  const sources = [];
  const citations = [];
  for (let i = 1; i <= count; i += 1) {
    const sourceId = `exa-example.com-${i}`;
    const url = `https://example.com/evidence/${i}`;
    sources.push({
      sourceId,
      url,
      platform: `example-${i}`,
      title: `Evidence ${i}: reference remix signal`,
      evidenceLevel: i % 3 === 1 ? "A" : "B",
      captureTime: "2024-01-01T00:00:00.000Z",
      observedFields: ["url", "title_or_snippet"],
    });
    citations.push({ sourceId, url });
  }
  return {
    sources,
    citations,
    summary: `Source-backed evidence (${count} cards) is ready for storyboard planning.`,
    trustPolicy: "downstream claims must reference sourceCardIds; sources are never fabricated",
  };
}

/** The Research_Harness envelope that wraps an Evidence_Pack. */
function harnessEnvelope(count = 4, overrides = {}) {
  return {
    status: "complete",
    degraded: false,
    degradeReason: null,
    gateId: "paid-model-call",
    paidProviderCalls: 0,
    maxResults: 10,
    deadlineMs: 30000,
    referenceUrl: "https://example.com/v",
    query: "reference remix signal",
    evidencePack: evidencePack(count),
    ...overrides,
  };
}

/** The degraded `weak_signal` envelope (Exa error / 30s deadline, R6.4). */
function degradedEnvelope() {
  return {
    status: "weak_signal",
    degraded: true,
    degradeReason: "exa_error",
    gateId: "paid-model-call",
    paidProviderCalls: 0,
    maxResults: 10,
    deadlineMs: 30000,
    referenceUrl: "https://example.com/v",
    query: "reference remix signal",
    evidencePack: {
      sources: [],
      citations: [],
      summary: "Weak signal: the research provider returned an error; no sources.",
      trustPolicy: "downstream claims must reference sourceCardIds; sources are never fabricated",
    },
  };
}

// --- Every cited source listed ----------------------------------------------

test("lists every cited source in the Evidence_Pack (count matches sources)", () => {
  const pack = evidencePack(7);
  const view = buildEvidencePackView(pack);
  assert.equal(view.count, 7);
  assert.equal(view.sources.length, 7);
  // The sourceIds match the pack one-to-one, in pack order.
  assert.deepEqual(
    view.sources.map((s) => s.sourceId),
    pack.sources.map((s) => s.sourceId),
  );
});

test("count matches the pack's citations on the success path", () => {
  const pack = evidencePack(5);
  const view = buildEvidencePackView(pack);
  assert.equal(view.count, pack.sources.length);
  assert.equal(view.citationCount, pack.citations.length);
  assert.equal(view.count, view.citationCount);
});

test("accepts the Research_Harness envelope and lists every source", () => {
  const view = buildEvidencePackView(harnessEnvelope(6));
  assert.equal(view.count, 6);
  assert.equal(view.status, "complete");
  assert.equal(view.degraded, false);
});

test("preserves source order (no reordering)", () => {
  const view = buildEvidencePackView(evidencePack(4));
  view.sources.forEach((s, i) => assert.equal(s.order, i));
});

test("does NOT dedup beyond the pack's own ids (every card renders)", () => {
  // The pack here intentionally carries duplicate sourceIds (the harness would
  // have de-duped, but the Frontend must not silently collapse entries).
  const pack = {
    sources: [
      { sourceId: "dup", url: "https://a.example/1", platform: "a", title: "A", evidenceLevel: "A" },
      { sourceId: "dup", url: "https://a.example/2", platform: "a", title: "B", evidenceLevel: "B" },
      { sourceId: "dup", url: "https://a.example/3", platform: "a", title: "C", evidenceLevel: "C" },
    ],
    citations: [{ sourceId: "dup", url: "https://a.example/1" }],
    summary: "three cards, colliding ids",
  };
  const view = buildEvidencePackView(pack);
  // Every card is rendered — count is preserved despite the colliding ids.
  assert.equal(view.count, 3);
  assert.equal(view.sources.length, 3);
});

// --- Each entry carries sourceId + display fields ---------------------------

test("each source entry carries its sourceId and display fields", () => {
  const view = buildEvidencePackView(evidencePack(3));
  for (const s of view.sources) {
    assert.equal(typeof s.sourceId, "string");
    assert.ok(s.sourceId.length > 0);
    assert.equal(typeof s.url, "string");
    assert.ok(s.url.length > 0);
    assert.equal(typeof s.platform, "string");
    assert.equal(typeof s.title, "string");
    assert.ok(s.title.length > 0);
    assert.equal(typeof s.evidenceLevel, "string");
    assert.equal(typeof s.cited, "boolean");
    assert.equal(typeof s.citationUrl, "string");
  }
});

test("cited flag and citationUrl reflect the pack's citations", () => {
  const pack = evidencePack(2);
  const view = buildEvidencePackView(pack);
  for (const s of view.sources) {
    assert.equal(s.cited, true);
    assert.equal(s.citationUrl, pack.citations.find((c) => c.sourceId === s.sourceId).url);
  }
});

test("a source with no matching citation is still listed, marked uncited", () => {
  const pack = {
    sources: [{ sourceId: "s1", url: "https://x.example/1", platform: "x", title: "X", evidenceLevel: "B" }],
    citations: [],
    summary: "one uncited source",
  };
  const view = buildEvidencePackView(pack);
  assert.equal(view.count, 1);
  assert.equal(view.sources[0].cited, false);
  // citationUrl falls back to the source url when no citation exists.
  assert.equal(view.sources[0].citationUrl, "https://x.example/1");
});

test("a blank/missing sourceId falls back to a stable positional id (no drop)", () => {
  const pack = {
    sources: [{ url: "https://y.example/1", platform: "y", title: "Y", evidenceLevel: "B" }, {}],
    citations: [],
    summary: "cards missing ids",
  };
  const view = buildEvidencePackView(pack);
  assert.equal(view.count, 2);
  assert.equal(view.sources[0].sourceId, "source-1");
  assert.equal(view.sources[1].sourceId, "source-2");
});

// --- Empty / degraded pack renders gracefully -------------------------------

test("an empty pack renders gracefully with zero entries", () => {
  const view = buildEvidencePackView({ sources: [], citations: [], summary: "" });
  assert.equal(view.count, 0);
  assert.deepEqual(view.sources, []);
  assert.equal(view.hasSources, false);
});

test("a degraded weak_signal envelope renders zero entries but keeps summary/status", () => {
  const view = buildEvidencePackView(degradedEnvelope());
  assert.equal(view.count, 0);
  assert.equal(view.hasSources, false);
  assert.equal(view.degraded, true);
  assert.equal(view.status, "weak_signal");
  assert.ok(view.summary.length > 0);
});

test("a pack with no sources[] field is tolerated (zero entries)", () => {
  const view = buildEvidencePackView({ summary: "no sources field" });
  assert.equal(view.count, 0);
  assert.equal(view.hasSources, false);
  assert.equal(view.summary, "no sources field");
});

// --- Malformed input never throws -------------------------------------------

test("malformed input never throws and yields an empty view", () => {
  for (const bad of [null, undefined, 5, "x", [], true, NaN]) {
    const view = buildEvidencePackView(bad);
    assert.equal(view.count, 0);
    assert.deepEqual(view.sources, []);
    assert.equal(view.hasSources, false);
    assert.equal(view.citationCount, 0);
  }
});

test("malformed source / citation entries are tolerated without throwing", () => {
  const view = buildEvidencePackView({
    sources: [null, 5, "x", { sourceId: "ok", url: "https://z.example/1", title: "Z", platform: "z", evidenceLevel: "A" }],
    citations: [null, 7, { sourceId: "ok", url: "https://z.example/1" }, { url: "no-source-id" }],
    summary: "mixed garbage",
  });
  // Every entry in sources[] still renders (4), even the malformed ones.
  assert.equal(view.count, 4);
  const ok = view.sources.find((s) => s.sourceId === "ok");
  assert.equal(ok.cited, true);
});

// --- resolveEvidencePack unwrapping -----------------------------------------

test("resolveEvidencePack unwraps the harness envelope", () => {
  const env = harnessEnvelope(2);
  assert.equal(resolveEvidencePack(env), env.evidencePack);
});

test("resolveEvidencePack returns a raw pack unchanged", () => {
  const pack = evidencePack(2);
  assert.equal(resolveEvidencePack(pack), pack);
});

test("resolveEvidencePack returns null for malformed input", () => {
  for (const bad of [null, undefined, 5, "x", []]) {
    assert.equal(resolveEvidencePack(bad), null);
  }
});
