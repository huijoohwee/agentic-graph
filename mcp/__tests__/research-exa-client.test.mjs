// Tests for the LIVE Exa MCP research client + its integration with the
// Research_Harness degraded path (agentic-graph-acos-mcp-connector runtime-readiness
// path, step 3 / R6.1, R6.4). ZERO live network calls — `fetchImpl` is a fake.

import test from "node:test";
import assert from "node:assert/strict";

import {
  createExaMcpClient,
  extractExaResults,
  ExaClientError,
  EXA_MCP_SEARCH_TOOL,
  EXA_MCP_API_KEY_HEADER,
} from "../video-remix/research-exa-client.js";
import { runResearchHarness } from "../video-remix/research-harness.js";

function jsonResponse(body, { status = 200 } = {}) {
  return {
    status,
    headers: { get: (k) => (k.toLowerCase() === "content-type" ? "application/json" : null) },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function toolsCallReply(results) {
  return {
    jsonrpc: "2.0",
    id: 1,
    result: { structuredContent: { results } },
  };
}

const SAMPLE_RESULTS = [
  { id: "exa-1", url: "https://news.example.com/a", title: "Remix trend A" },
  { id: "exa-2", url: "https://blog.example.org/b", title: "Remix trend B" },
  { id: "exa-3", url: "https://video.example.net/c", title: "Remix trend C" },
  { id: "exa-4", url: "https://x.example.io/d", title: "Remix trend D" },
];

// --- result extraction -------------------------------------------------------

test("extractExaResults: reads structuredContent.results", () => {
  assert.equal(extractExaResults(toolsCallReply(SAMPLE_RESULTS)).length, 4);
});

test("extractExaResults: parses results from a text content frame", () => {
  const rpc = {
    result: { content: [{ type: "text", text: JSON.stringify({ results: SAMPLE_RESULTS }) }] },
  };
  assert.equal(extractExaResults(rpc).length, 4);
});

// --- live client request shaping + mapping ----------------------------------

test("createExaMcpClient: issues a web_search_exa tools/call and maps results to raw cards", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init: { ...init, body: JSON.parse(init.body) } });
    return jsonResponse(toolsCallReply(SAMPLE_RESULTS));
  };
  const client = createExaMcpClient({ fetchImpl, apiKey: "exa-secret-key" });

  const cards = await client.search({
    referenceUrl: "https://example.com/ref",
    query: "vertical promo remix",
    maxResults: 4,
  });

  assert.equal(calls.length, 1, "exactly one live Exa call");
  assert.equal(calls[0].init.body.params.name, EXA_MCP_SEARCH_TOOL);
  assert.equal(calls[0].init.body.params.arguments.numResults, 4);
  assert.equal(calls[0].init.headers[EXA_MCP_API_KEY_HEADER], "exa-secret-key");
  assert.equal(cards.length, 4);
  assert.equal(cards[0].url, "https://news.example.com/a");
  assert.equal(cards[0].platform, "news.example.com");
});

test("createExaMcpClient: omits the api-key header in hosted-free mode", async () => {
  let seenHeaders;
  const fetchImpl = async (_url, init) => {
    seenHeaders = init.headers;
    return jsonResponse(toolsCallReply(SAMPLE_RESULTS));
  };
  const client = createExaMcpClient({ fetchImpl });
  await client.search({ referenceUrl: "https://example.com/ref", maxResults: 3 });
  assert.equal(seenHeaders[EXA_MCP_API_KEY_HEADER], undefined);
});

test("createExaMcpClient: a non-2xx response throws ExaClientError", async () => {
  const fetchImpl = async () => jsonResponse({ error: "rate limited" }, { status: 429 });
  const client = createExaMcpClient({ fetchImpl });
  await assert.rejects(
    () => client.search({ referenceUrl: "https://example.com/ref" }),
    (err) => err instanceof ExaClientError,
  );
});

// --- integration with the harness: success path -----------------------------

test("runResearchHarness with the live Exa client builds a sourced Evidence_Pack", async () => {
  const fetchImpl = async () => jsonResponse(toolsCallReply(SAMPLE_RESULTS));
  const exaClient = createExaMcpClient({ fetchImpl });

  const result = await runResearchHarness(
    { referenceUrl: "https://example.com/ref", query: "remix", maxResults: 4 },
    { exaClient },
  );

  assert.equal(result.status, "complete");
  assert.ok(result.evidencePack.sources.length >= 3, "3..50 source cards");
  assert.equal(result.evidencePack.citations.length, result.evidencePack.sources.length);
  // Unique source ids (R6.2) preserved through normalization.
  const ids = new Set(result.evidencePack.sources.map((s) => s.sourceId));
  assert.equal(ids.size, result.evidencePack.sources.length);
});

// --- integration with the harness: degraded path (R6.4) ---------------------

test("runResearchHarness degrades to weak_signal when the live Exa client throws", async () => {
  const fetchImpl = async () => {
    throw new Error("ECONNRESET");
  };
  const exaClient = createExaMcpClient({ fetchImpl });

  const result = await runResearchHarness(
    { referenceUrl: "https://example.com/ref", query: "remix" },
    { exaClient },
  );

  assert.equal(result.status, "weak_signal");
  assert.equal(result.degraded, true);
  assert.deepEqual(result.evidencePack.sources, [], "no fabricated sources on failure");
  assert.deepEqual(result.evidencePack.citations, []);
});
