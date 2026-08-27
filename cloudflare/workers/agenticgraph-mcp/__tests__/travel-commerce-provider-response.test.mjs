import assert from "node:assert/strict";
import { test } from "node:test";

import { AgentDefinitionCache } from "../agent-definition-cache.mjs";
import { handleTravelCommerceServiceRoute } from "../travel-commerce-router.mjs";

const encoder = new TextEncoder();
const quote = Object.freeze({
  kind: "offer",
  legId: "flight-leg",
  offerId: "flight-new",
  amountMinor: 12_230,
  currency: "SGD",
  priceVerification: "verified",
  agentId: "agent-flight",
  promptTokens: 0,
  completionTokens: 0,
  dollarCost: 0,
  provenance: Object.freeze({ source: "bounded-provider-test" }),
});

const routeRequest = () => new Request("https://agent-registry.internal/v1/route-intent", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-knowgrph-component": "Reopt_Worker",
  },
  body: JSON.stringify({
    operation: "routeIntent",
    intent: {
      intentId: "event-provider-boundary:flight-leg",
      category: "flight",
      constraints: {
        bundle_id: "bundle-provider-boundary",
        changed_leg_id: "hotel-leg",
        prior_offer_id: "flight-old",
        prior_amount_minor: 12_000,
      },
    },
  }),
});

const liveEnv = (providerFetch) => {
  const cache = new Map();
  return {
    TRAVEL_AGENT_DEFINITION_CACHE: {
      get: async (key) => cache.get(key) ?? null,
      put: async (key, value) => { cache.set(key, value); },
    },
    TRAVEL_AGENT_DEFINITIONS_JSON: JSON.stringify([
      { agentId: "agent-flight", declaredCategory: "flight" },
    ]),
    TRAVEL_DISCOVERY_MODE: "live",
    TRAVEL_DISCOVERY_DEADLINE_MS: "6000",
    TRAVEL_SETTLEMENT_CURRENCY: "SGD",
    TRAVEL_DISCOVERY_HARNESS: { fetch: providerFetch },
  };
};

const routeWith = (providerFetch) => handleTravelCommerceServiceRoute(
  routeRequest(),
  liveEnv(providerFetch),
  { registryCache: new AgentDefinitionCache() },
);

const chunkedResponse = (bytes, chunkBytes = 7, headers = {}) => {
  let offset = 0;
  return new Response(new ReadableStream({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      const end = Math.min(offset + chunkBytes, bytes.byteLength);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  }), {
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
};

test("live discovery accepts a bounded JSON response split across stream chunks", async () => {
  const response = await routeWith(async () => chunkedResponse(encoder.encode(JSON.stringify(quote))));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), quote);
});

test("live discovery cancels an oversized chunked response without Content-Length", async () => {
  let emitted = 0;
  let cancelled = false;
  const totalChunks = 128;
  const response = await routeWith(async () => new Response(new ReadableStream({
    pull(controller) {
      if (emitted >= totalChunks) {
        controller.close();
        return;
      }
      controller.enqueue(new Uint8Array(1_024).fill(0x20));
      emitted += 1;
    },
    cancel() { cancelled = true; },
  }), { headers: { "content-type": "application/json" } }));

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false, code: "discovery-provider-malformed" });
  assert.equal(cancelled, true);
  assert.equal(emitted < totalChunks, true);
});

test("live discovery cancels malformed length and media declarations before buffering", async () => {
  for (const headers of [
    { "content-type": "application/json", "content-length": "not-a-number" },
    { "content-type": "text/plain" },
  ]) {
    let cancelled = false;
    const response = await routeWith(async () => new Response(new ReadableStream({
      pull(controller) { controller.enqueue(encoder.encode(JSON.stringify(quote))); },
      cancel() { cancelled = true; },
    }), { headers }));
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { ok: false, code: "discovery-provider-malformed" });
    assert.equal(cancelled, true);
  }
});

test("live discovery rejects malformed JSON and invalid UTF-8", async () => {
  for (const bytes of [encoder.encode("{\"kind\":"), new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x7d])]) {
    const response = await routeWith(async () => chunkedResponse(bytes, 1));
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { ok: false, code: "discovery-provider-malformed" });
  }
});
