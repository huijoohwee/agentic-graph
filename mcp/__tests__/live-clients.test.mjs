// Tests for the env-gated live/mock stage-client resolver (task 12.5).
// ZERO live calls — a fake `fetch` backs the live Exa client.

import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveStageClients,
  createLiveArgsResolver,
} from "../video-remix/live-clients.js";

function jsonResponse(body) {
  return {
    status: 200,
    headers: { get: (k) => (k.toLowerCase() === "content-type" ? "application/json" : null) },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

const EXA_REPLY = {
  jsonrpc: "2.0",
  id: 1,
  result: {
    structuredContent: {
      results: [
        { id: "exa-1", url: "https://a.example.com/1", title: "A" },
        { id: "exa-2", url: "https://b.example.org/2", title: "B" },
        { id: "exa-3", url: "https://c.example.net/3", title: "C" },
      ],
    },
  },
};

// --- resolveStageClients: env gating ----------------------------------------

test("resolveStageClients: defaults to MOCK with an empty env (no live clients)", () => {
  const clients = resolveStageClients({});
  assert.equal(clients.live, false);
  assert.equal(clients.mode, "mock");
  assert.equal(clients.exaClient, null);
});

test("resolveStageClients: AGENTIC_OS_LIVE_CLIENTS=1 enables live (hosted-free Exa)", () => {
  const clients = resolveStageClients({ AGENTIC_OS_LIVE_CLIENTS: "1" }, { fetchImpl: async () => jsonResponse(EXA_REPLY) });
  assert.equal(clients.live, true);
  assert.equal(clients.mode, "live");
  assert.ok(clients.exaClient && clients.exaClient.isDeterministicMock === false);
  // task 12.4 slots still null -> mock fallback.
  assert.equal(clients.storyboardClient, null);
  assert.equal(clients.renderClient, null);
  assert.equal(clients.commerceClient, null);
});

test("resolveStageClients: presence of EXA_API_KEY alone enables live", () => {
  const clients = resolveStageClients({ EXA_API_KEY: "exa-key" }, { fetchImpl: async () => jsonResponse(EXA_REPLY) });
  assert.equal(clients.live, true);
  assert.ok(clients.exaClient);
});

// --- createLiveArgsResolver: Director args augmentation ----------------------

test("createLiveArgsResolver: injects live sourceCards for a Director run", async () => {
  const clients = resolveStageClients(
    { AGENTIC_OS_LIVE_CLIENTS: "1" },
    { fetchImpl: async () => jsonResponse(EXA_REPLY) },
  );
  const resolve = createLiveArgsResolver(clients);

  const out = await resolve("agentic-graph.video_remix.run", {
    referenceUrl: "https://example.com/ref",
    brief: "Promo remix",
  });

  assert.ok(Array.isArray(out.sourceCards), "sourceCards injected");
  assert.ok(out.sourceCards.length >= 3);
  assert.equal(out.referenceUrl, "https://example.com/ref", "original args preserved");
});

test("createLiveArgsResolver: is identity for non-Director tools", async () => {
  const clients = resolveStageClients({ AGENTIC_OS_LIVE_CLIENTS: "1" }, { fetchImpl: async () => jsonResponse(EXA_REPLY) });
  const resolve = createLiveArgsResolver(clients);
  const args = { referenceUrl: "https://example.com/ref" };
  const out = await resolve("agentic-graph.video_remix.research", args);
  assert.equal(out, args);
});

test("createLiveArgsResolver: is identity in MOCK mode (no live clients)", async () => {
  const clients = resolveStageClients({}); // mock
  const resolve = createLiveArgsResolver(clients);
  const args = { referenceUrl: "https://example.com/ref", brief: "x" };
  const out = await resolve("agentic-graph.video_remix.run", args);
  assert.equal(out.sourceCards, undefined, "no injection in mock mode");
});

test("createLiveArgsResolver: never overrides caller-supplied sourceCards", async () => {
  const clients = resolveStageClients({ AGENTIC_OS_LIVE_CLIENTS: "1" }, { fetchImpl: async () => jsonResponse(EXA_REPLY) });
  const resolve = createLiveArgsResolver(clients);
  const caller = [{ sourceId: "caller-1", url: "https://caller.example/x" }];
  const out = await resolve("agentic-graph.video_remix.run", {
    referenceUrl: "https://example.com/ref",
    sourceCards: caller,
  });
  assert.deepEqual(out.sourceCards, caller, "explicit caller evidence preserved");
});

test("createLiveArgsResolver: falls back to unchanged args when live research throws", async () => {
  const clients = resolveStageClients(
    { AGENTIC_OS_LIVE_CLIENTS: "1" },
    { fetchImpl: async () => { throw new Error("network down"); } },
  );
  const resolve = createLiveArgsResolver(clients);
  const out = await resolve("agentic-graph.video_remix.run", {
    referenceUrl: "https://example.com/ref",
    brief: "x",
  });
  // Exa failure -> harness degrades to empty sources -> no injection, no throw.
  assert.equal(out.sourceCards, undefined);
});

// --- end-to-end: resolver output feeds the synchronous Director -------------

test("live-resolved sourceCards flow into runVideoRemix as a sourced Evidence_Pack", async () => {
  const clients = resolveStageClients({ AGENTIC_OS_LIVE_CLIENTS: "1" }, { fetchImpl: async () => jsonResponse(EXA_REPLY) });
  const resolve = createLiveArgsResolver(clients);
  const { runVideoRemix } = await import("../video-remix-runtime.js");

  const baseArgs = {
    referenceUrl: "https://example.com/ref",
    brief: "Promo remix",
    mode: "live",
    budgetUsd: 25,
    approvals: ["paid-model-call"],
  };
  const augmented = await resolve("agentic-graph.video_remix.run", baseArgs);
  const result = runVideoRemix(augmented);
  const payload = result.payload ?? result;

  assert.ok(payload.evidencePack.sources.length >= 3, "Director built a sourced pack from live cards");
  assert.equal(
    payload.evidencePack.citations.length,
    payload.evidencePack.sources.length,
  );
});
