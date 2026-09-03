import assert from "node:assert/strict";
import { test } from "node:test";

import {
  handleTravelCommerceOfferIngress,
  TRAVEL_AGENT_OFFERS_PATH,
} from "../travel-commerce-ingress.mjs";
import { handleTravelCommerceServiceRoute } from "../travel-commerce-router.mjs";

const definitions = JSON.stringify([
  { agentId: "agent-flight", declaredCategory: "flight" },
]);

const requestBody = Object.freeze({
  operation: "evaluateOffer",
  principalId: "principal-public-edge",
  reservationId: "ordinary-public-edge-1",
  intent: Object.freeze({
    intentId: "public-edge-event:flight-leg",
    category: "flight",
    constraints: Object.freeze({
      bundle_id: "bundle-public-edge",
      changed_leg_id: "hotel-leg",
      prior_offer_id: "prior-flight",
      prior_amount_minor: 1_000,
    }),
  }),
  guardrailIntent: Object.freeze({
    kind: "flight",
    origin: "SIN",
    destination: "NRT",
    dateRangeStart: "2026-09-01",
    dateRangeEnd: "2026-09-10",
    budgetCeiling: Object.freeze({ amountMinor: 5_000, currency: "SGD" }),
  }),
});

const request = (headers = {}) => new Request(`https://airvio.co${TRAVEL_AGENT_OFFERS_PATH}`, {
  method: "POST",
  headers: {
    authorization: "Bearer public-runtime-credential",
    cookie: "session=must-not-cross",
    "content-type": "application/json",
    "x-agentic-graph-component": "Attacker_Spoof",
    ...headers,
  },
  body: JSON.stringify(requestBody),
});

test("public ordinary-offer ingress authenticates before routing and cannot be header-spoofed", async () => {
  let routed = 0;
  const incoming = request({ authorization: "Bearer wrong" });
  const response = await handleTravelCommerceOfferIngress(incoming, {}, {
    authorize: async () => ({ ok: false, status: 401, code: "unauthorized" }),
    route: async () => { routed += 1; throw new Error("must not route"); },
  });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), "Bearer");
  assert.deepEqual(await response.json(), { error: { code: "unauthorized" } });
  assert.equal(routed, 0);
  assert.equal(incoming.bodyUsed, false);
});

test("authenticated public Edge ingress strips credentials and invokes the registered atomic Guardrail", async () => {
  const evaluations = [];
  const cache = new Map();
  const env = {
    TRAVEL_AGENT_DEFINITION_CACHE: {
      get: async (key) => cache.get(key) ?? null,
      put: async (key, value) => { cache.set(key, value); },
    },
    TRAVEL_AGENT_DEFINITIONS_JSON: definitions,
    TRAVEL_DISCOVERY_MODE: "deterministic-demo",
    TRAVEL_SETTLEMENT_CURRENCY: "SGD",
    TRAVEL_DEMO_QUOTE_RULES_JSON: JSON.stringify({ flight: { deltaMinor: 50 } }),
    TRAVEL_GUARDRAIL: {
      ready: async () => ({ ok: true, capability: "registered-offer-atomic-guardrail", lane: "Dev_Lane" }),
      evaluateOffer: async (input) => {
        evaluations.push(input);
        return { ok: true, offer: input.offer, attempts: 0, costLog: {
          model: "none", prompt_tokens: 0, completion_tokens: 0,
          cache_hits: 0, estimated_cost_usd: 0, incomplete: false,
        } };
      },
      commitOffer: async () => ({ kind: "committed" }),
      releaseOffer: async () => ({ kind: "released" }),
    },
  };
  let internalRequest;
  const response = await handleTravelCommerceOfferIngress(request(), env, {
    authorize: async (incoming) => ({
      ok: incoming.headers.get("authorization") === "Bearer public-runtime-credential",
      status: 200,
    }),
    route: async (internal, routeEnv) => {
      internalRequest = internal;
      return handleTravelCommerceServiceRoute(internal, routeEnv);
    },
  });

  assert.equal(response.status, 200);
  assert.equal(new URL(internalRequest.url).pathname, "/v1/route-intent");
  assert.equal(internalRequest.headers.get("authorization"), null);
  assert.equal(internalRequest.headers.get("cookie"), null);
  assert.equal(internalRequest.headers.get("x-agentic-graph-component"), "Edge_Orchestrator");
  assert.equal(evaluations.length, 1);
  assert.deepEqual(evaluations[0].context, {
    principalId: "principal-public-edge",
    operationId: "ordinary-public-edge-1",
    agentId: "agent-flight",
    priceVerification: "deterministic-demo",
  });
  assert.equal(evaluations[0].offer.amountMinor, 1_050);
});
