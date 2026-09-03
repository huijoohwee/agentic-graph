import assert from "node:assert/strict";
import { test } from "node:test";

import { handleTravelCommerceServiceRoute } from "../travel-commerce-router.mjs";
import { createTravelDiscoveryWorker } from "../../agenticgraph-travel-discovery/index.mjs";

const definitions = JSON.stringify([
  { agentId: "agent-flight", declaredCategory: "flight" },
  { agentId: "agent-hotel", declaredCategory: "hotel" },
  { agentId: "agent-experience", declaredCategory: "experience" },
]);

const liveDefinitions = JSON.stringify([
  { agentId: "agent-flight", declaredCategory: "flight" },
  { agentId: "agent-experience", declaredCategory: "experience" },
]);

const definitionCacheValues = new Map();
const definitionCacheKv = Object.freeze({
  async get(key) { return definitionCacheValues.get(key) ?? null; },
  async put(key, value) { definitionCacheValues.set(key, value); },
});

const body = Object.freeze({
  operation: "routeIntent",
  intent: Object.freeze({
    intentId: "event-1:experience-leg",
    category: "experience",
    constraints: Object.freeze({
      bundle_id: "bundle-1",
      changed_leg_id: "flight-leg",
      prior_offer_id: "experience-old",
      prior_amount_minor: 250,
    }),
  }),
});

const routeRequest = (value = body, headers = {}) => new Request("https://agent-registry.internal/v1/route-intent", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-agenticgraph-component": "Reopt_Worker",
    ...headers,
  },
  body: JSON.stringify(value),
});

const costLog = Object.freeze({
  model: "none", prompt_tokens: 0, completion_tokens: 0,
  cache_hits: 0, estimated_cost_usd: 0, incomplete: false,
});

const guardrailBinding = (overrides = {}) => Object.freeze({
  ready: async () => ({
    ok: true,
    capability: "registered-offer-atomic-guardrail",
    lane: "Dev_Lane",
  }),
  evaluateOffer: async (input) => ({
    ok: true, offer: input.offer, attempts: 0, costLog,
  }),
  commitOffer: async () => ({ kind: "committed" }),
  releaseOffer: async () => ({ kind: "released" }),
  ...overrides,
});

const guardrailRequest = (value, headers = {}) => new Request("https://agent-registry.internal/v1/route-intent", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-agenticgraph-component": "Edge_Orchestrator",
    ...headers,
  },
  body: JSON.stringify(value),
});

test("route-intent uses the actual registry outcome and validates a live provider quote", async () => {
  const calls = [];
  const env = {
    TRAVEL_AGENT_DEFINITION_CACHE: definitionCacheKv,
    TRAVEL_AGENT_DEFINITIONS_JSON: liveDefinitions,
    TRAVEL_DISCOVERY_MODE: "live",
    TRAVEL_DISCOVERY_DEADLINE_MS: "6000",
    TRAVEL_SETTLEMENT_CURRENCY: "SGD",
    TRAVEL_DISCOVERY_HARNESS: {
      async fetch() {
        throw new Error("flight provider must not receive experience dispatch");
      },
    },
    TRAVEL_EXPERIENCE_DISCOVERY_HARNESS: {
      async fetch(request) {
        calls.push(request);
        if (new URL(request.url).pathname === "/readyz") {
          return Response.json({
            ok: true,
            capabilities: {
              categories: ["flight", "hotel", "experience"],
              inventory: "live-search-and-verify",
              verificationRequired: false,
            },
          });
        }
        return Response.json({
          kind: "offer",
          legId: "experience-leg",
          offerId: "experience-new",
          amountMinor: 275,
          currency: "SGD",
          priceVerification: "verified",
          agentId: "agent-experience",
          promptTokens: 0,
          completionTokens: 0,
          dollarCost: 0,
          provenance: { source: "provider-contract-test", priceVerification: "verified", currency: "SGD" },
        });
      },
    },
  };
  const response = await handleTravelCommerceServiceRoute(routeRequest(), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    kind: "offer",
    legId: "experience-leg",
    offerId: "experience-new",
    amountMinor: 275,
    currency: "SGD",
    priceVerification: "verified",
    agentId: "agent-experience",
    promptTokens: 0,
    completionTokens: 0,
    dollarCost: 0,
    provenance: { source: "provider-contract-test", priceVerification: "verified", currency: "SGD" },
  });
  const providerBody = await calls[0].json();
  assert.equal(providerBody.agentId, "agent-experience");
  assert.equal(providerBody.intent.category, "experience");
  assert.equal(providerBody.legId, "experience-leg");
});

test("actual registry/router and Atlas adapter satisfy their consumer-provider contract end to end", async () => {
  const atlasCalls = [];
  const provider = createTravelDiscoveryWorker({
    fetchFn: async (request) => {
      atlasCalls.push(request);
      const routing = {
          routingIdentifier: "atlas-live-routing-1",
          currency: "SGD",
          fromSegments: [{
            carrier: "TR",
            flightNumber: "TR808",
            depAirport: "SIN",
            depTime: "202609010600",
            arrAirport: "NRT",
            arrTime: "202609011400",
          }],
          retSegments: [],
          adultPrice: 100.1,
          adultTax: 20.2,
          childPrice: 0,
          childTax: 0,
          infantPrice: 0,
          infantTax: 0,
          transactionFee: 2,
          transactionFeeMode: "PER_PAX",
      };
      return new URL(request.url).pathname === "/search.do"
        ? Response.json({ status: 0, routings: [routing] })
        : Response.json({
            status: 0,
            sessionId: "atlas-live-verification-session",
            maxSeats: 4,
            routing,
          });
    },
  });
  const providerEnv = {
    ATLAS_API_BASE_URL: "https://atlas.provider.test",
    ATLAS_SEARCH_PATH: "/search.do",
    ATLAS_VERIFY_PATH: "/verify.do",
    ATLAS_CLIENT_ID: "contract-test-client",
    ATLAS_CLIENT_SECRET: "contract-test-secret",
    ATLAS_ROUTE_CATALOGUE_JSON: JSON.stringify({
      "flight-leg": {
        tripType: "1", adultNum: 1, childNum: 0, infantNum: 0,
        fromCity: "SIN", toCity: "NRT", fromDate: "20260901", retDate: null,
        airlines: ["TR"], expectedCurrency: "SGD", currencyMinorUnits: 2,
      },
    }),
    ATLAS_AGENT_ID: "agent-flight",
    ATLAS_TIMEOUT_MS: "5500",
    ATLAS_READINESS_PROBE_TIMEOUT_MS: "5500",
    ATLAS_MAX_RESPONSE_BYTES: "4194304",
  };
  const serviceBinding = {
    fetch: (request) => provider.fetch(request, providerEnv),
  };
  const response = await handleTravelCommerceServiceRoute(routeRequest({
    operation: "routeIntent",
    intent: {
      intentId: "event-1:flight-leg",
      category: "flight",
      constraints: {
        bundle_id: "bundle-1",
        changed_leg_id: "hotel-leg",
        prior_offer_id: "flight-old",
        prior_amount_minor: 12000,
      },
    },
  }), {
    TRAVEL_AGENT_DEFINITION_CACHE: definitionCacheKv,
    TRAVEL_AGENT_DEFINITIONS_JSON: JSON.stringify([
      { agentId: "agent-flight", declaredCategory: "flight" },
    ]),
    TRAVEL_DISCOVERY_MODE: "live",
    TRAVEL_DISCOVERY_DEADLINE_MS: "6000",
    TRAVEL_SETTLEMENT_CURRENCY: "SGD",
    TRAVEL_DISCOVERY_HARNESS: serviceBinding,
  });
  assert.equal(response.status, 200);
  const quote = await response.json();
  assert.equal(quote.amountMinor, 12230);
  assert.equal(quote.currency, "SGD");
  assert.equal(quote.priceVerification, "verified");
  assert.equal(quote.agentId, "agent-flight");
  assert.equal(quote.provenance.provider, "atlas-atriptech");
  assert.equal(quote.provenance.bookability, "verified-not-ordered");
  assert.equal(atlasCalls.length, 2);
  assert.equal(atlasCalls[0].headers.get("x-atlas-client-secret"), "contract-test-secret");
});

test("route-intent fails closed for missing categories and malformed provider output", async () => {
  let providerCalls = 0;
  const env = {
    TRAVEL_AGENT_DEFINITION_CACHE: definitionCacheKv,
    TRAVEL_AGENT_DEFINITIONS_JSON: liveDefinitions,
    TRAVEL_DISCOVERY_MODE: "live",
    TRAVEL_SETTLEMENT_CURRENCY: "SGD",
    TRAVEL_DISCOVERY_HARNESS: {
      async fetch() {
        throw new Error("flight provider must not receive experience dispatch");
      },
    },
    TRAVEL_EXPERIENCE_DISCOVERY_HARNESS: {
      async fetch() {
        providerCalls += 1;
        return Response.json({ ...body, agentId: "wrong-agent" });
      },
    },
  };
  const unmatched = await handleTravelCommerceServiceRoute(routeRequest({
    ...body,
    intent: { ...body.intent, category: "rail" },
  }), env);
  assert.equal(unmatched.status, 422);
  assert.equal(providerCalls, 0);

  const malformed = await handleTravelCommerceServiceRoute(routeRequest(), env);
  assert.equal(malformed.status, 502);
  assert.equal(providerCalls, 1);
});

test("route-intent rejects a quote denominated outside the envelope currency", async () => {
  const response = await handleTravelCommerceServiceRoute(routeRequest(), {
    TRAVEL_AGENT_DEFINITION_CACHE: definitionCacheKv,
    TRAVEL_AGENT_DEFINITIONS_JSON: liveDefinitions,
    TRAVEL_DISCOVERY_MODE: "live",
    TRAVEL_DISCOVERY_DEADLINE_MS: "6000",
    TRAVEL_SETTLEMENT_CURRENCY: "SGD",
    TRAVEL_DISCOVERY_HARNESS: {
      fetch: async () => Response.json({ ok: false }, { status: 503 }),
    },
    TRAVEL_EXPERIENCE_DISCOVERY_HARNESS: {
      fetch: async () => Response.json({
        kind: "offer",
        legId: "experience-leg",
        offerId: "experience-usd",
        amountMinor: 275,
        currency: "USD",
        priceVerification: "verified",
        agentId: "agent-experience",
        promptTokens: 0,
        completionTokens: 0,
        dollarCost: 0,
        provenance: { source: "currency-contract-test", currency: "USD" },
      }),
    },
  });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false, code: "discovery-provider-malformed" });
});

test("route-intent rejects caller spoofing, unknown fields, and unsafe minor units", async () => {
  const env = {
    TRAVEL_AGENT_DEFINITION_CACHE: definitionCacheKv,
    TRAVEL_AGENT_DEFINITIONS_JSON: liveDefinitions,
    TRAVEL_DISCOVERY_MODE: "deterministic-demo",
    TRAVEL_SETTLEMENT_CURRENCY: "SGD",
    TRAVEL_DEMO_QUOTE_RULES_JSON: JSON.stringify({
      flight: { deltaMinor: 50 }, hotel: { deltaMinor: 25 }, experience: { deltaMinor: 10 },
    }),
  };
  assert.equal((await handleTravelCommerceServiceRoute(routeRequest(body, {
    "x-agenticgraph-component": "Issuance_Service",
  }), env)).status, 403);
  assert.equal((await handleTravelCommerceServiceRoute(routeRequest({ ...body, apiKey: "must-not-cross" }), env)).status, 400);
  assert.equal((await handleTravelCommerceServiceRoute(routeRequest({
    ...body,
    intent: { ...body.intent, constraints: { ...body.intent.constraints, prior_amount_minor: -1 } },
  }), env)).status, 400);
});

test("deterministic demo mode is stable, explicit, and non-bookable", async () => {
  const env = {
    TRAVEL_AGENT_DEFINITION_CACHE: definitionCacheKv,
    TRAVEL_AGENT_DEFINITIONS_JSON: definitions,
    TRAVEL_DISCOVERY_MODE: "deterministic-demo",
    TRAVEL_SETTLEMENT_CURRENCY: "SGD",
    TRAVEL_DEMO_QUOTE_RULES_JSON: JSON.stringify({
      flight: { deltaMinor: 50 }, hotel: { deltaMinor: 25 }, experience: { deltaMinor: 10 },
    }),
    TRAVEL_GUARDRAIL: guardrailBinding(),
  };
  const first = await handleTravelCommerceServiceRoute(routeRequest(), env);
  const second = await handleTravelCommerceServiceRoute(routeRequest(), env);
  assert.equal(first.status, 200);
  const firstQuote = await first.json();
  assert.deepEqual(firstQuote, await second.json());
  assert.equal(firstQuote.currency, "SGD");
  assert.equal(firstQuote.priceVerification, "deterministic-demo");
  assert.equal(firstQuote.provenance.nonBookable, "true");
  const ready = await handleTravelCommerceServiceRoute(new Request("https://internal/agenticgraph/control-plane/mcp/readyz"), env);
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), {
    ok: true,
    service: "agenticgraph-mcp",
    mode: "deterministic-demo",
    bookable: false,
    dependencies: { registry: "configured", discovery: "deterministic-demo" },
  });
});

test("live readiness probes the provider and missing production configuration returns 503", async () => {
  const live = await handleTravelCommerceServiceRoute(new Request("https://internal/livez"), {});
  assert.equal(live.status, 200);
  const missing = await handleTravelCommerceServiceRoute(new Request("https://internal/readyz"), {});
  assert.equal(missing.status, 503);

  let experienceProbeStarted = false;
  let flightObservedConcurrentProbe = false;
  const ready = await handleTravelCommerceServiceRoute(new Request("https://internal/readyz"), {
    TRAVEL_AGENT_DEFINITION_CACHE: definitionCacheKv,
    TRAVEL_AGENT_DEFINITIONS_JSON: liveDefinitions,
    TRAVEL_DISCOVERY_MODE: "live",
    TRAVEL_SETTLEMENT_CURRENCY: "SGD",
    TRAVEL_GUARDRAIL: guardrailBinding(),
    TRAVEL_DISCOVERY_HARNESS: {
      fetch: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        flightObservedConcurrentProbe = experienceProbeStarted;
        return Response.json({
          ok: true,
          capabilities: {
            categories: ["flight"],
            inventory: "live-search-and-verify",
            verificationRequired: false,
          },
        });
      },
    },
    TRAVEL_EXPERIENCE_DISCOVERY_HARNESS: {
      fetch: async () => {
        experienceProbeStarted = true;
        return Response.json({
          ok: true,
          capabilities: {
            categories: ["experience"],
            inventory: "live-search-and-verify",
            verificationRequired: false,
          },
        });
      },
    },
  });
  assert.equal(ready.status, 200);
  assert.equal(flightObservedConcurrentProbe, true);
});

test("live production category declarations fail closed without the experience adapter", async () => {
  const response = await handleTravelCommerceServiceRoute(new Request("https://internal/readyz"), {
    TRAVEL_AGENT_DEFINITION_CACHE: definitionCacheKv,
    TRAVEL_AGENT_DEFINITIONS_JSON: liveDefinitions,
    TRAVEL_DISCOVERY_MODE: "live",
    TRAVEL_SETTLEMENT_CURRENCY: "SGD",
    TRAVEL_DISCOVERY_HARNESS: { fetch: async () => Response.json({ ok: true }) },
    TRAVEL_GUARDRAIL: guardrailBinding(),
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    ok: false,
    service: "agenticgraph-mcp",
    code: "configuration-missing",
    fields: ["TRAVEL_EXPERIENCE_DISCOVERY_HARNESS"],
    dependencies: { registry: "configured", discovery: "blocked" },
  });
});

test("registered offers are derived by the registry and sent through the named atomic Guardrail binding", async () => {
  const evaluations = [];
  const lifecycleCalls = [];
  const env = {
    TRAVEL_AGENT_DEFINITION_CACHE: definitionCacheKv,
    TRAVEL_AGENT_DEFINITIONS_JSON: definitions,
    TRAVEL_DISCOVERY_MODE: "deterministic-demo",
    TRAVEL_SETTLEMENT_CURRENCY: "SGD",
    TRAVEL_DEMO_QUOTE_RULES_JSON: JSON.stringify({
      flight: { deltaMinor: 50 }, hotel: { deltaMinor: 25 }, experience: { deltaMinor: 10 },
    }),
    TRAVEL_GUARDRAIL: guardrailBinding({
      evaluateOffer: async (input) => {
        evaluations.push(input);
        return { ok: true, offer: input.offer, attempts: 0, costLog };
      },
      commitOffer: async (input) => { lifecycleCalls.push(["commit", input]); return { kind: "committed" }; },
      releaseOffer: async (input) => { lifecycleCalls.push(["release", input]); return { kind: "released" }; },
    }),
  };
  const request = {
    operation: "evaluateOffer",
    principalId: "principal-registered",
    reservationId: "ordinary-reservation-1",
    intent: {
      intentId: "event-registered:flight-leg",
      category: "flight",
      constraints: {
        bundle_id: "bundle-registered",
        changed_leg_id: "hotel-leg",
        prior_offer_id: "flight-old",
        prior_amount_minor: 1000,
      },
    },
    guardrailIntent: {
      kind: "flight", origin: "SIN", destination: "NRT",
      dateRangeStart: "2026-09-01", dateRangeEnd: "2026-09-10",
      budgetCeiling: { amountMinor: 5000, currency: "SGD" },
    },
  };

  const unauthorized = await handleTravelCommerceServiceRoute(guardrailRequest(request, {
    "x-agenticgraph-component": "Shopper_Client",
  }), env);
  assert.equal(unauthorized.status, 403);
  assert.equal(evaluations.length, 0);
  const bypass = await handleTravelCommerceServiceRoute(routeRequest(body, {
    "x-agenticgraph-component": "Edge_Orchestrator",
  }), env);
  assert.equal(bypass.status, 400);
  assert.equal(evaluations.length, 0);

  const response = await handleTravelCommerceServiceRoute(guardrailRequest(request), env);
  assert.equal(response.status, 200);
  assert.equal(evaluations.length, 1);
  assert.deepEqual(evaluations[0].context, {
    principalId: "principal-registered",
    operationId: "ordinary-reservation-1",
    agentId: "agent-flight",
    priceVerification: "deterministic-demo",
  });
  assert.equal(evaluations[0].offer.amountMinor, 1050);
  assert.equal(evaluations[0].offer.currency, "SGD");

  const unregisteredLifecycle = await handleTravelCommerceServiceRoute(guardrailRequest({
    operation: "releaseOffer", principalId: "principal-registered",
    reservationId: "ordinary-reservation-1", agentId: "agent-unregistered",
  }), env);
  assert.equal(unregisteredLifecycle.status, 422);
  assert.equal(lifecycleCalls.length, 0);

  const committed = await handleTravelCommerceServiceRoute(guardrailRequest({
    operation: "commitOffer", principalId: "principal-registered",
    reservationId: "ordinary-reservation-1", agentId: "agent-flight",
  }), env);
  assert.equal(committed.status, 200);
  const released = await handleTravelCommerceServiceRoute(guardrailRequest({
    operation: "releaseOffer", principalId: "principal-registered",
    reservationId: "ordinary-reservation-2", agentId: "agent-flight",
  }), env);
  assert.equal(released.status, 200);
  assert.deepEqual(lifecycleCalls, [
    ["commit", { principalId: "principal-registered", operationId: "ordinary-reservation-1", agentId: "agent-flight" }],
    ["release", { principalId: "principal-registered", operationId: "ordinary-reservation-2", agentId: "agent-flight" }],
  ]);
});

test("registered-offer Guardrail failures remain fail closed", async () => {
  const response = await handleTravelCommerceServiceRoute(guardrailRequest({
    operation: "evaluateOffer",
    principalId: "principal-fail-closed",
    reservationId: "ordinary-fail-closed",
    intent: {
      intentId: "event-fail-closed:flight-leg", category: "flight",
      constraints: { bundle_id: "bundle-fail-closed", changed_leg_id: "hotel-leg",
        prior_offer_id: "flight-old", prior_amount_minor: 1000 },
    },
    guardrailIntent: {
      kind: "flight", origin: "SIN", destination: "NRT",
      dateRangeStart: "2026-09-01", dateRangeEnd: "2026-09-10",
      budgetCeiling: { amountMinor: 5000, currency: "SGD" },
    },
  }), {
    TRAVEL_AGENT_DEFINITION_CACHE: definitionCacheKv,
    TRAVEL_AGENT_DEFINITIONS_JSON: definitions,
    TRAVEL_DISCOVERY_MODE: "deterministic-demo",
    TRAVEL_SETTLEMENT_CURRENCY: "SGD",
    TRAVEL_DEMO_QUOTE_RULES_JSON: JSON.stringify({
      flight: { deltaMinor: 50 }, hotel: { deltaMinor: 25 }, experience: { deltaMinor: 10 },
    }),
    TRAVEL_GUARDRAIL: guardrailBinding({
      evaluateOffer: async () => { throw new Error("ledger unavailable"); },
    }),
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, code: "guardrail-unavailable" });
});

test("live registered offers require provider verification before Guardrail invocation", async () => {
  let guardrailCalls = 0;
  const response = await handleTravelCommerceServiceRoute(guardrailRequest({
    operation: "evaluateOffer",
    principalId: "principal-live-verification",
    reservationId: "ordinary-live-verification",
    intent: {
      intentId: "event-live-verification:flight-leg", category: "flight",
      constraints: { bundle_id: "bundle-live-verification", changed_leg_id: "hotel-leg",
        prior_offer_id: "flight-old", prior_amount_minor: 1000 },
    },
    guardrailIntent: {
      kind: "flight", origin: "SIN", destination: "NRT",
      dateRangeStart: "2026-09-01", dateRangeEnd: "2026-09-10",
      budgetCeiling: { amountMinor: 5000, currency: "SGD" },
    },
  }), {
    TRAVEL_AGENT_DEFINITION_CACHE: definitionCacheKv,
    TRAVEL_AGENT_DEFINITIONS_JSON: JSON.stringify([
      { agentId: "agent-flight", declaredCategory: "flight" },
    ]),
    TRAVEL_DISCOVERY_MODE: "live",
    TRAVEL_DISCOVERY_DEADLINE_MS: "6000",
    TRAVEL_SETTLEMENT_CURRENCY: "SGD",
    TRAVEL_DISCOVERY_HARNESS: {
      fetch: async () => Response.json({
        kind: "offer", legId: "flight-leg", offerId: "unverified-live-offer",
        amountMinor: 1050, currency: "SGD", priceVerification: "deterministic-demo",
        agentId: "agent-flight", promptTokens: 0, completionTokens: 0,
        dollarCost: 0, provenance: { source: "unverified-provider" },
      }),
    },
    TRAVEL_GUARDRAIL: guardrailBinding({
      evaluateOffer: async () => { guardrailCalls += 1; throw new Error("must not run"); },
    }),
  });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false, code: "discovery-provider-malformed" });
  assert.equal(guardrailCalls, 0);
});

test("guarded route cancels an oversized body without Content-Length", async () => {
  let pulls = 0;
  let emitted = 0;
  const totalChunks = 128;
  const bodyStream = new ReadableStream({
    pull(controller) {
      pulls += 1;
      if (emitted >= totalChunks) {
        controller.close();
        return;
      }
      controller.enqueue(new Uint8Array(1024).fill(123));
      emitted += 1;
    },
  });
  const request = new Request("https://agent-registry.internal/v1/route-intent", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agenticgraph-component": "Edge_Orchestrator",
    },
    body: bodyStream,
    duplex: "half",
  });
  assert.equal(request.headers.get("content-length"), null);
  const response = await handleTravelCommerceServiceRoute(request, {});
  assert.equal(response.status, 400);
  assert.equal(pulls < totalChunks, true);
});
