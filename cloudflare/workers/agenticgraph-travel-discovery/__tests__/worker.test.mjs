import assert from "node:assert/strict";
import { test } from "node:test";

import { createTravelDiscoveryWorker } from "../index.mjs";

const catalogue = JSON.stringify({
  "flight-leg": {
    tripType: "1",
    adultNum: 1,
    childNum: 0,
    infantNum: 0,
    fromCity: "SIN",
    toCity: "NRT",
    fromDate: "20260901",
    retDate: null,
    airlines: ["TR"],
    expectedCurrency: "SGD",
    currencyMinorUnits: 2,
  },
});

const env = Object.freeze({
  ATLAS_API_BASE_URL: "https://atlas.provider.test",
  ATLAS_SEARCH_PATH: "/search.do",
  ATLAS_VERIFY_PATH: "/verify.do",
  ATLAS_CLIENT_ID: "client-id-secret",
  ATLAS_CLIENT_SECRET: "client-secret-secret",
  ATLAS_ROUTE_CATALOGUE_JSON: catalogue,
  ATLAS_AGENT_ID: "agent-flight",
  ATLAS_TIMEOUT_MS: "5500",
  ATLAS_READINESS_PROBE_TIMEOUT_MS: "5500",
  ATLAS_MAX_RESPONSE_BYTES: "4194304",
});

const input = Object.freeze({
  operation: "discoverOffers",
  contractVersion: "knowgrph.travel-discovery/v1",
  agentId: "agent-flight",
  legId: "flight-leg",
  intent: Object.freeze({
    intentId: "event-1:flight-leg",
    category: "flight",
    constraints: Object.freeze({
      bundle_id: "bundle-1",
      changed_leg_id: "hotel-leg",
      prior_offer_id: "flight-old",
      prior_amount_minor: 12000,
    }),
  }),
});

const request = (body = input, headers = {}) => new Request("https://travel-discovery.internal/v1/requote", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-knowgrph-component": "Agent_Registry",
    ...headers,
  },
  body: JSON.stringify(body),
});

const oversizedStreamingRequest = (onPull) => {
  let emitted = 0;
  const totalChunks = 64;
  const body = new ReadableStream({
    pull(controller) {
      onPull();
      if (emitted >= totalChunks) {
        controller.close();
        return;
      }
      controller.enqueue(new Uint8Array(1_024).fill(120));
      emitted += 1;
    },
  });
  const streamed = new Request("https://travel-discovery.internal/v1/requote", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-knowgrph-component": "Agent_Registry",
    },
    body,
    duplex: "half",
  });
  assert.equal(streamed.headers.get("content-length"), null);
  return Object.freeze({ streamed, totalChunks });
};

const atlasSegment = (overrides = {}) => ({
  carrier: "TR",
  flightNumber: "TR808",
  depAirport: "SIN",
  depTime: "202609010600",
  arrAirport: "NRT",
  arrTime: "202609011400",
  ...overrides,
});

const atlasFare = (overrides = {}) => ({
  routingIdentifier: "atlas-routing-reference-1",
  currency: "SGD",
  fromSegments: [atlasSegment()],
  retSegments: [],
  adultPrice: 100.1,
  adultTax: 20.2,
  childPrice: 0,
  childTax: 0,
  infantPrice: 0,
  infantTax: 0,
  transactionFee: 2,
  transactionFeeMode: "PER_PAX",
  ...overrides,
});

test("readiness names missing operator configuration and never reveals values", async () => {
  const probes = [];
  const worker = createTravelDiscoveryWorker({
    fetchFn: async (request) => {
      probes.push(request);
      return new URL(request.url).pathname === "/search.do"
        ? Response.json({ status: 0, routings: [atlasFare()] })
        : Response.json({
            status: 0,
            sessionId: "readiness-verification-session",
            maxSeats: 4,
            routing: atlasFare(),
          });
    },
  });
  const response = await worker.fetch(new Request("https://internal/readyz"), {});
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, "provider-unconfigured");
  assert.ok(body.fields.includes("ATLAS_CLIENT_SECRET"));
  assert.equal(JSON.stringify(body).includes("client-secret-secret"), false);

  const ready = await worker.fetch(new Request("https://internal/readyz"), env);
  assert.equal(ready.status, 200);
  const readyBody = await ready.json();
  assert.equal(readyBody.providerProbe, "live-authenticated-search-verify-passed");
  assert.deepEqual(readyBody.dependencies, { atlas: "live-capability-probe-passed" });
  assert.deepEqual(readyBody.capabilities, {
    categories: ["flight"], inventory: "live-search-and-verify", verificationRequired: false,
  });
  assert.equal(probes.length, 2);
  assert.equal(probes[0].method, "POST");
  assert.equal(probes[0].url, "https://atlas.provider.test/search.do");
  assert.equal(probes[0].headers.get("x-atlas-client-secret"), env.ATLAS_CLIENT_SECRET);
  assert.equal(probes[1].url, "https://atlas.provider.test/verify.do");
  assert.equal((await probes[1].json()).routingIdentifier, "atlas-routing-reference-1");

  const rejected = createTravelDiscoveryWorker({
    fetchFn: async () => new Response(null, { status: 401 }),
  });
  const rejectedResponse = await rejected.fetch(new Request("https://internal/readyz"), env);
  assert.equal(rejectedResponse.status, 503);
  const rejectedBody = await rejectedResponse.json();
  assert.equal(rejectedBody.providerProbe, "failed");
  assert.equal(rejectedBody.code, "provider-uat-probe-provider-error-unmapped");
  assert.equal(JSON.stringify(rejectedBody).includes(env.ATLAS_CLIENT_SECRET), false);

  const identityDrift = createTravelDiscoveryWorker({
    fetchFn: async (outbound) => new URL(outbound.url).pathname === "/search.do"
      ? Response.json({ status: 0, routings: [atlasFare()] })
      : Response.json({
          status: 0,
          sessionId: "readiness-drift-session",
          maxSeats: 4,
          routing: atlasFare({ routingIdentifier: "drifted-routing" }),
        }),
  });
  const driftResponse = await identityDrift.fetch(new Request("https://internal/readyz"), env);
  assert.equal(driftResponse.status, 503);
  assert.equal((await driftResponse.json()).code, "provider-uat-probe-provider-contract-violation");
});

test("Atlas/aTriptech request uses configured endpoint, route catalogue, and server-held credentials", async () => {
  const calls = [];
  const worker = createTravelDiscoveryWorker({
    fetchFn: async (outbound) => {
      calls.push(outbound);
      return new URL(outbound.url).pathname === "/search.do"
        ? Response.json({ status: 0, msg: null, routings: [atlasFare()] })
        : Response.json({
            status: 0,
            msg: "success",
            sessionId: "verification-session-1",
            maxSeats: 4,
            routing: atlasFare(),
          });
    },
  });
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 200);
  const quote = await response.json();
  assert.deepEqual(quote, {
    kind: "offer",
    legId: "flight-leg",
    offerId: quote.offerId,
    amountMinor: 12230,
    currency: "SGD",
    priceVerification: "verified",
    agentId: "agent-flight",
    promptTokens: 0,
    completionTokens: 0,
    dollarCost: 0,
    provenance: {
      provider: "atlas-atriptech",
      providerReference: "atlas-routing-reference-1",
      providerReferenceDigest: quote.provenance.providerReferenceDigest,
      currency: "SGD",
      priceVerification: "verified",
      verificationSessionDigest: quote.provenance.verificationSessionDigest,
      verificationValidForSeconds: "1800",
      inventoryState: "not-held-until-order",
      bookability: "verified-not-ordered",
      contractVersion: "knowgrph.travel-discovery/v1",
    },
  });
  assert.match(quote.offerId, /^atlas_[a-f0-9]{32}$/);
  assert.equal(calls[0].url, "https://atlas.provider.test/search.do");
  assert.equal(calls[0].headers.get("x-atlas-client-id"), env.ATLAS_CLIENT_ID);
  assert.equal(calls[0].headers.get("x-atlas-client-secret"), env.ATLAS_CLIENT_SECRET);
  assert.deepEqual(await calls[0].json(), {
    tripType: "1", adultNum: 1, childNum: 0, infantNum: 0,
    fromCity: "SIN", fromAirport: "", toCity: "NRT", toAirport: "",
    fromDate: "20260901", retDate: "", airlines: ["TR"],
    fromFlightNumbers: [], retFlightNumbers: [], includeMultipleFareFamily: false,
    currency: null, displayCurrency: "", requestSource: null,
  });
  assert.equal(calls[1].url, "https://atlas.provider.test/verify.do");
  assert.equal(calls[1].headers.get("x-atlas-client-secret"), env.ATLAS_CLIENT_SECRET);
  const verificationBody = await calls[1].json();
  assert.equal(verificationBody.routingIdentifier, "atlas-routing-reference-1");
  assert.equal(verificationBody.requestSource, null);
  assert.ok(verificationBody.maxResponseTime > 0 && verificationBody.maxResponseTime <= 5500);
  assert.equal(JSON.stringify(quote).includes(env.ATLAS_CLIENT_SECRET), false);
});

test("normalization rejects fractional-minor, wrong-currency, and incomplete fares before choosing the lowest valid fare", async () => {
  const worker = createTravelDiscoveryWorker({
    fetchFn: async (outbound) => new URL(outbound.url).pathname === "/search.do"
      ? Response.json({
          status: 0,
          routings: [
            atlasFare({ routingIdentifier: "fractional", adultPrice: 1.001 }),
            atlasFare({ routingIdentifier: "wrong-currency", currency: "USD" }),
            { routingIdentifier: "incomplete", currency: "SGD" },
            atlasFare({ routingIdentifier: "higher", adultPrice: 200 }),
            atlasFare({ routingIdentifier: "lower", adultPrice: 90 }),
          ],
        })
      : Response.json({
          status: 0,
          sessionId: "verification-session-lower",
          maxSeats: 4,
          routing: atlasFare({ routingIdentifier: "lower", adultPrice: 90 }),
        }),
  });
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 200);
  const quote = await response.json();
  assert.equal(quote.amountMinor, 11220);
  assert.equal(quote.provenance.providerReference, "lower");
});

test("normalization rejects deprecated or ambiguous transaction-fee fields", async () => {
  let calls = 0;
  const worker = createTravelDiscoveryWorker({
    fetchFn: async () => {
      calls += 1;
      return Response.json({
        status: 0,
        routings: [
          atlasFare({ transactionFee: undefined, transactionFeePerPax: 2 }),
          atlasFare({ transactionFeeMode: "PER_SEGMENT" }),
        ],
      });
    },
  });
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).code, "provider-contract-violation");
  assert.equal(calls, 1);
});

test("search and verification share one end-to-end provider deadline", async () => {
  let calls = 0;
  const worker = createTravelDiscoveryWorker({
    fetchFn: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return Response.json({ status: 0, routings: [atlasFare()] });
    },
  });
  const response = await worker.fetch(request(), { ...env, ATLAS_TIMEOUT_MS: "5" });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "provider-unavailable");
  assert.equal(calls, 1);
});

test("unconfigured routes and malformed requests make zero Atlas calls", async () => {
  let calls = 0;
  const worker = createTravelDiscoveryWorker({ fetchFn: async () => {
    calls += 1;
    return Response.json({ status: 0, routings: [] });
  } });
  const unknownRoute = await worker.fetch(request({ ...input, legId: "missing-leg" }), env);
  assert.equal(unknownRoute.status, 503);
  assert.equal((await unknownRoute.json()).code, "provider-unconfigured");
  assert.equal(calls, 0);

  assert.equal((await worker.fetch(request({ ...input, credential: "forbidden" }), env)).status, 400);
  assert.equal((await worker.fetch(request(input, { "x-knowgrph-component": "Reopt_Worker" }), env)).status, 403);
  assert.equal(calls, 0);
});

test("stream-limits an oversized request without trusting Content-Length", async () => {
  let providerCalls = 0;
  let pulls = 0;
  const worker = createTravelDiscoveryWorker({ fetchFn: async () => {
    providerCalls += 1;
    return Response.json({ status: 0, routings: [] });
  } });
  const { streamed, totalChunks } = oversizedStreamingRequest(() => { pulls += 1; });
  const response = await worker.fetch(streamed, env);
  assert.equal(response.status, 400);
  assert.equal(providerCalls, 0);
  assert.ok(pulls < totalChunks, `expected early stream cancellation, observed ${pulls} pulls`);
});

test("Atlas failures map to the closed provider error taxonomy", async () => {
  const rateLimited = createTravelDiscoveryWorker({ fetchFn: async () => new Response("", { status: 429 }) });
  const rateResponse = await rateLimited.fetch(request(), env);
  assert.equal(rateResponse.status, 429);
  assert.equal((await rateResponse.json()).code, "rate-limited");

  const unmapped = createTravelDiscoveryWorker({
    fetchFn: async () => Response.json({ status: 9001, errorCode: "UNKNOWN_ATLAS_STATE", msg: "do not inspect" }),
  });
  const unmappedResponse = await unmapped.fetch(request(), env);
  assert.equal(unmappedResponse.status, 502);
  assert.equal((await unmappedResponse.json()).code, "provider-error-unmapped");

  const verifyFailure = createTravelDiscoveryWorker({
    fetchFn: async (outbound) => new URL(outbound.url).pathname === "/search.do"
      ? Response.json({ status: 0, routings: [atlasFare()] })
      : Response.json({ status: 207, msg: "must not be surfaced" }),
  });
  const verifyFailureResponse = await verifyFailure.fetch(request(), env);
  assert.equal(verifyFailureResponse.status, 502);
  assert.equal((await verifyFailureResponse.json()).code, "provider-error-unmapped");

  const mismatchedVerification = createTravelDiscoveryWorker({
    fetchFn: async (outbound) => new URL(outbound.url).pathname === "/search.do"
      ? Response.json({ status: 0, routings: [atlasFare()] })
      : Response.json({
          status: 0,
          sessionId: "verification-session-mismatch",
          maxSeats: 4,
          routing: atlasFare({ routingIdentifier: "different-routing-reference" }),
        }),
  });
  const mismatchResponse = await mismatchedVerification.fetch(request(), env);
  assert.equal(mismatchResponse.status, 502);
  assert.equal((await mismatchResponse.json()).code, "provider-contract-violation");
});

test("stream-limits an oversized Atlas response without trusting Content-Length", async () => {
  let pulls = 0;
  let emitted = 0;
  const totalChunks = 64;
  const worker = createTravelDiscoveryWorker({
    fetchFn: async () => new Response(new ReadableStream({
      pull(controller) {
        pulls += 1;
        if (emitted >= totalChunks) {
          controller.close();
          return;
        }
        controller.enqueue(new Uint8Array(256).fill(120));
        emitted += 1;
      },
    }), { headers: { "content-type": "application/json" } }),
  });
  const response = await worker.fetch(request(), { ...env, ATLAS_MAX_RESPONSE_BYTES: "1024" });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "provider-contract-violation");
  assert.ok(pulls < totalChunks, `expected early provider-stream cancellation, observed ${pulls} pulls`);
});

test("search rejects itinerary origin, destination, departure date, and carrier mismatches against the operator route", async () => {
  for (const [name, segment] of [
    ["origin", atlasSegment({ depAirport: "KUL" })],
    ["destination", atlasSegment({ arrAirport: "ICN" })],
    ["date", atlasSegment({ depTime: "202609020600" })],
    ["carrier", atlasSegment({ carrier: "SQ", flightNumber: "SQ12" })],
  ]) {
    let calls = 0;
    const worker = createTravelDiscoveryWorker({
      fetchFn: async () => {
        calls += 1;
        return Response.json({ status: 0, routings: [atlasFare({ fromSegments: [segment] })] });
      },
    });
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 404, `${name} mismatch must reject the search fare`);
    assert.equal((await response.json()).code, "provider-contract-violation");
    assert.equal(calls, 1, "invalid search itinerary must never reach verification");
  }
});

test("verification rejects any segment identity drift from the selected search routing", async () => {
  for (const [name, segment] of [
    ["flight", atlasSegment({ flightNumber: "TR809" })],
    ["time", atlasSegment({ depTime: "202609010700" })],
    ["connection", atlasSegment({ arrAirport: "KIX" })],
  ]) {
    const worker = createTravelDiscoveryWorker({
      fetchFn: async (outbound) => new URL(outbound.url).pathname === "/search.do"
        ? Response.json({ status: 0, routings: [atlasFare()] })
        : Response.json({
            status: 0,
            sessionId: `verification-session-${name}`,
            maxSeats: 4,
            routing: atlasFare({ fromSegments: [segment] }),
          }),
    });
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 502, `${name} drift must reject verification`);
    assert.equal((await response.json()).code, "provider-contract-violation");
  }
});
