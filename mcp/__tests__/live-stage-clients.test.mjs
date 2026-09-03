// Tests for the LIVE stage clients: BytePlus storyboard, Strytree render, and
// Stripe commerce. ZERO live calls — a fake `fetch` backs every client.

import test from "node:test";
import assert from "node:assert/strict";

import {
  createByteplusStoryboardClient,
  createAiGatewayVisualReviewClient,
  createAiGatewayImageGenerationClient,
  parseStoryboardCompletion,
  createStrytreeRenderQueueClient,
  createStripeCommerceClients,
  StoryboardClientError,
  RenderClientError,
  CommerceClientError,
} from "../video-remix/live-stage-clients.js";
import { runStoryboardHarness } from "../video-remix/storyboard-harness.js";
import { resolveStageClients } from "../video-remix/live-clients.js";

function jsonResponse(body, { status = 200 } = {}) {
  return {
    status,
    headers: { get: () => "application/json" },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function chatCompletion(shots) {
  return {
    choices: [{ message: { content: JSON.stringify({ shots }) } }],
  };
}

// ── Storyboard completion parsing ───────────────────────────────────────────

test("parseStoryboardCompletion: maps choices[0].message.content JSON to shots", () => {
  const shots = parseStoryboardCompletion(
    chatCompletion([
      { prompt: "scene 1", sourceCardIds: ["s-1"] },
      { prompt: "scene 2", sourceCardIds: [] },
    ]),
  );
  assert.equal(shots.length, 2);
  assert.equal(shots[0].prompt, "scene 1");
  assert.deepEqual(shots[0].sourceCardIds, ["s-1"]);
});

// ── Storyboard live client ──────────────────────────────────────────────────

test("createByteplusStoryboardClient: posts a chat completion and returns shots", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return jsonResponse(chatCompletion([{ prompt: "a", sourceCardIds: ["s-1"] }]));
  };
  const client = createByteplusStoryboardClient({
    fetchImpl,
    endpoint: "https://gateway.ai.cloudflare.com/v1/acct/gw/chat/completions",
    model: "skylark-chat",
    apiKey: "byteplus-key",
  });

  const out = await client.plan({ brief: "Promo", sourceIds: ["s-1"], shotCount: 1 });

  assert.equal(client.isDeterministicMock, false);
  assert.equal(client.requiresAsyncHarness, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.model, "skylark-chat");
  assert.equal(out.shots.length, 1);
});

test("createByteplusStoryboardClient grounds long-script planning in retained segment ids", async () => {
  let requestBody;
  const client = createByteplusStoryboardClient({
    endpoint: "https://gw/chat/completions",
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return jsonResponse(chatCompletion([{
        prompt: "retain the reveal",
        sourceCardIds: ["s-1"],
        scriptSegmentIds: ["script-segment-1"],
        scriptUnitIds: ["script-unit-1"],
        dialogueUnitIds: ["script-unit-2"],
        dramaticPurpose: "reveal",
        dramaticIntensity: 0.8,
        cinematography: { shotSize: "close-up", cameraAngle: "eye-level", cameraMovement: "dolly-in", composition: "leading-lines", transition: "match-cut" },
      }]));
    },
  });
  const result = await client.plan({
    brief: "Novel adaptation",
    sourceIds: ["s-1"],
    shotCount: 1,
    scriptContext: { entries: [{ segmentId: "script-segment-1", content: "Mira: Keep the reveal exact." }] },
    storyboardProfile: { userRequirements: "Prioritize the reveal", targetAudience: { description: "mystery readers" }, pace: "measured" },
  });

  const instruction = requestBody.messages[1].content;
  assert.match(instruction, /immutable source material/);
  assert.match(instruction, /Mira: Keep the reveal exact\./);
  assert.match(instruction, /mystery readers/);
  assert.match(instruction, /cameraMovements/);
  assert.deepEqual(result.shots[0].scriptSegmentIds, ["script-segment-1"]);
  assert.deepEqual(result.shots[0].dialogueUnitIds, ["script-unit-2"]);
  assert.equal(result.shots[0].cinematography.cameraMovement, "dolly-in");
});

test("createByteplusStoryboardClient: throws (→ harness fallback) on HTTP error", async () => {
  const client = createByteplusStoryboardClient({
    fetchImpl: async () => jsonResponse({ error: "x" }, { status: 500 }),
    endpoint: "https://gw/chat/completions",
  });
  await assert.rejects(
    () => client.plan({ brief: "b", sourceIds: [], shotCount: 1 }),
    (err) => err instanceof StoryboardClientError,
  );
});

test("createByteplusStoryboardClient: throws when unconfigured (no endpoint)", async () => {
  const client = createByteplusStoryboardClient({ fetchImpl: async () => jsonResponse({}) });
  await assert.rejects(() => client.plan({ brief: "b", sourceIds: [], shotCount: 1 }));
});

test("createAiGatewayVisualReviewClient reuses multimodal chat and returns a Cost Log", async () => {
  let requestBody = null;
  const client = createAiGatewayVisualReviewClient({
    endpoint: "https://gw/chat/completions",
    model: "vision-model",
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify({ narrativeScore: 0.8, visualScore: 0.9, findings: [], proposedPrompt: "" }) } }],
        usage: { prompt_tokens: 12, completion_tokens: 4, cache_hits: 1, estimated_cost_usd: 0.01 },
      });
    },
  });
  const result = await client.review({ shotId: "shot-1", prompt: "p", assetUrl: "https://asset.example/frame.png", expectedContinuity: {} });
  assert.equal(requestBody.messages[0].content[1].type, "image_url");
  assert.equal(requestBody.messages[0].content[1].image_url.url, "https://asset.example/frame.png");
  assert.equal(result.visualScore, 0.9);
  assert.equal(result.costLog.estimated_cost_usd, 0.01);
});

test("createAiGatewayVisualReviewClient scores first-frame consistency dimensions", async () => {
  const client = createAiGatewayVisualReviewClient({
    endpoint: "https://gw/chat/completions",
    model: "vision-model",
    fetchImpl: async () => jsonResponse({
      choices: [{ message: { content: JSON.stringify({ identityScore: 0.9, environmentScore: 0.8, spatialScore: 0.95, temporalScore: 0.85, technicalScore: 0.9, findings: [] }) } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
  });
  const result = await client.reviewCandidate({ assetUrl: "https://asset.example/candidate.png", prompt: "p", expectedContinuity: {} });
  assert.equal(result.identityScore, 0.9);
  assert.equal(result.spatialScore, 0.95);
  assert.equal(result.costLog.incomplete, false);
});

test("createAiGatewayImageGenerationClient maps one durable candidate asset", async () => {
  let requestBody;
  const client = createAiGatewayImageGenerationClient({
    endpoint: "https://gw/images",
    model: "image-model",
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return jsonResponse({ data: [{ url: "https://asset.example/candidate.png" }], usage: { prompt_tokens: 8, completion_tokens: 0 } });
    },
  });
  const result = await client.generate({ runId: "run", shotId: "shot-1", variantIndex: 2, prompt: "p", referenceImages: [{ assetUrl: "https://asset.example/ref.png" }] });
  assert.equal(requestBody.metadata.variant_index, 2);
  assert.deepEqual(requestBody.reference_images, ["https://asset.example/ref.png"]);
  assert.equal(result.assetUrl, "https://asset.example/candidate.png");
});

test("runStoryboardHarness consumes the live storyboard client and emits a valid AgenticOs_Document", async () => {
  const evidencePack = {
    sources: [
      { sourceId: "s-1", url: "https://a.example/1" },
      { sourceId: "s-2", url: "https://b.example/2" },
      { sourceId: "s-3", url: "https://c.example/3" },
    ],
  };
  const fetchImpl = async () =>
    jsonResponse(
      chatCompletion([
        { prompt: "scene 1", sourceCardIds: ["s-1"] },
        { prompt: "scene 2", sourceCardIds: ["s-2"] },
      ]),
    );
  const chatClient = createByteplusStoryboardClient({
    fetchImpl,
    endpoint: "https://gw/chat/completions",
  });

  const result = await runStoryboardHarness(
    { brief: "Promo remix", evidencePack, shotCount: 2 },
    { chatClient },
  );

  assert.equal(result.status, "complete");
  assert.equal(result.schemaValid, true);
  assert.equal(result.flow.nodes.length, 2, "one node per planned shot");
  assert.equal(result.fallbackSubstituted, false);
});

test("runStoryboardHarness falls back to a single node when the live client fails", async () => {
  const evidencePack = { sources: [{ sourceId: "s-1", url: "https://a.example/1" }] };
  const chatClient = createByteplusStoryboardClient({
    fetchImpl: async () => jsonResponse({ error: "down" }, { status: 502 }),
    endpoint: "https://gw/chat/completions",
  });
  const result = await runStoryboardHarness(
    { brief: "Promo", evidencePack, shotCount: 3 },
    { chatClient },
  );
  assert.equal(result.status, "fallback");
  assert.equal(result.fallbackSubstituted, true);
  assert.equal(result.flow.nodes.length, 1, "single-node fallback (R7.5)");
});

// ── Render live-client seam (correct shape, fail-closed) ────────────────────

test("createStrytreeRenderQueueClient: dispatches and maps an asset", async () => {
  const client = createStrytreeRenderQueueClient({
    fetchImpl: async () => jsonResponse({ assetUrl: "https://r2/asset.mp4", costCents: 42, provider: "byteplus-video" }),
    endpoint: "https://pay/render",
  });
  assert.equal(client.requiresAsyncHarness, true, "marks async-only dispatch");
  const out = await client.dispatch({ shot: { shotId: "shot-1", prompt: "p" }, runId: "run-1" });
  assert.equal(out.assetUrl, "https://r2/asset.mp4");
  assert.equal(out.costCents, 42);
});

test("createStrytreeRenderQueueClient: throws on a no-asset response (→ R8.6 fallback)", async () => {
  const client = createStrytreeRenderQueueClient({
    fetchImpl: async () => jsonResponse({ costCents: 0 }),
    endpoint: "https://pay/render",
  });
  await assert.rejects(
    () => client.dispatch({ shot: { shotId: "shot-1" }, runId: "run-1" }),
    (err) => err instanceof RenderClientError,
  );
});

// ── Commerce live-client seam (correct shape, fail-closed) ──────────────────

test("createStripeCommerceClients: creates a session, settles, and publishes", async () => {
  const clients = createStripeCommerceClients({
    fetchImpl: async (url) => {
      if (url.endsWith("/checkout/session")) return jsonResponse({ id: "cs_live_1", amount_total: 500, currency: "usd" });
      if (url.endsWith("/payout/settle")) return jsonResponse({ settled: true, payoutState: "settled" });
      if (url.endsWith("/publish")) return jsonResponse({ publishedUrl: "https://cdn/pub.mp4" });
      return jsonResponse({});
    },
    endpoint: "https://pay.example",
  });
  assert.equal(clients.requiresAsyncHarness, true);

  const created = await clients.stripeClient.createCheckoutSession({ runId: "r", assetUrl: "https://a/x.mp4" });
  assert.equal(created.session.id, "cs_live_1");
  assert.equal(created.session.amountTotal, 500);

  const settled = await clients.payoutClient.settle({ sessionId: "cs_live_1", runId: "r" });
  assert.equal(settled.settled, true);

  const pub = await clients.publishClient.publish({ asset: { assetUrl: "https://a/x.mp4" }, runId: "r" });
  assert.equal(pub.publishedUrl, "https://cdn/pub.mp4");
});

test("createStripeCommerceClients: session create with no id throws (→ R9.4)", async () => {
  const clients = createStripeCommerceClients({
    fetchImpl: async () => jsonResponse({ amount_total: 100 }),
    endpoint: "https://pay.example",
  });
  await assert.rejects(
    () => clients.stripeClient.createCheckoutSession({ runId: "r", assetUrl: "https://a/x.mp4" }),
    (err) => err instanceof CommerceClientError,
  );
});

// ── resolveStageClients surfaces the live clients per-credential ────────────

test("resolveStageClients: populates storyboard/render/commerce slots when endpoints are set", () => {
  const clients = resolveStageClients(
    {
      AGENTIC_OS_LIVE_CLIENTS: "1",
      AI_GATEWAY_CHAT_URL: "https://gw/chat/completions",
      AI_GATEWAY_IMAGE_URL: "https://gw/images",
      IMAGE_GENERATION_MODEL: "image-model",
      RENDER_PROVIDER: "strytree",
      STRYTREE_RENDER_URL: "https://pay/render",
      AGENTIC_OS_PAYMENT_URL: "https://pay.example",
    },
    { fetchImpl: async () => jsonResponse({}) },
  );
  assert.equal(clients.live, true);
  assert.ok(clients.storyboardClient && clients.storyboardClient.isDeterministicMock === false);
  assert.ok(clients.imageGenerationClient && clients.imageGenerationClient.isDeterministicMock === false);
  assert.ok(clients.renderClient && clients.renderClient.requiresAsyncHarness === true);
  assert.ok(clients.commerceClient && clients.commerceClient.requiresAsyncHarness === true);
});

test("resolveStageClients: live with no stage endpoints leaves stage slots null (mock fallback)", () => {
  const clients = resolveStageClients({ AGENTIC_OS_LIVE_CLIENTS: "1" }, { fetchImpl: async () => jsonResponse({}) });
  assert.equal(clients.live, true);
  assert.ok(clients.exaClient, "exa is hosted-free capable");
  assert.equal(clients.storyboardClient, null);
  assert.equal(clients.imageGenerationClient, null);
  assert.equal(clients.renderClient, null);
  assert.equal(clients.commerceClient, null);
});
