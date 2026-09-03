// =============================================================================
// AI Gateway client — unit tests
// agentic-graph-widget-canvas-media spec · Task 2.3
// Requirements: R2.1, R2.2, R2.3, R2.4, R2.5, R2.6, R2.7, R2.10, R8.6, R8.8
//
// Pure offline tests — ZERO network calls, ZERO paid actions.
// Tests exercise both:
//   (a) the live createAiGatewayClient with an injectable fetchImpl, and
//   (b) the deterministic createMockAiGatewayClient from the mock module.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createAiGatewayClient,
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  VIDEO_POLL_INTERVAL_MS,
  VIDEO_POLL_MAX_DURATION_MS,
} from "../video-remix/ai-gateway-client.js";

import { createMockAiGatewayClient } from "../video-remix/ai-gateway-mock.js";

// =============================================================================
// Helpers — injectable fetch factory
// =============================================================================

/**
 * Build a Response-like object that the live client will accept.
 *
 * @param {object} body      - JSON body to return
 * @param {number} [status]  - HTTP status code (default 200)
 */
function jsonFetchResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === "content-type" ? "application/json" : null;
      },
    },
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

/**
 * Create a fetch stub that always returns the same response body / status.
 *
 * @param {object} body
 * @param {number} [status]
 */
function makeFetch(body, status = 200) {
  return async (_url, _opts) => jsonFetchResponse(body, status);
}

/**
 * Create a fetch stub that throws a network error (simulates connection refusal).
 */
function makeNetworkErrorFetch() {
  return async (_url, _opts) => { throw new Error("connection refused"); };
}

/**
 * Create a fetch stub that returns responses from a sequential list.
 * Each call pops the next response; if the list is exhausted, the last entry
 * repeats.
 *
 * @param {Array<{ body: object, status?: number }>} responses
 */
function makeSequentialFetch(responses) {
  let index = 0;
  return async (_url, _opts) => {
    const entry = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return jsonFetchResponse(entry.body, entry.status ?? 200);
  };
}

/** Builds a no-op async sleep that ticks a virtual clock instead of waiting. */
function makeInstantSleep() {
  return async (_ms) => {}; // instant
}

// Canonical gateway base URL used across tests.
const BASE_URL = "https://gateway.example.com";

// =============================================================================
// Section 1 — Exported constants (R2.2, R2.3, R2.4, R2.5, R2.6)
// =============================================================================

test("DEFAULT_CHAT_MODEL is 'agnes/seed' (R2.2)", () => {
  assert.equal(DEFAULT_CHAT_MODEL, "agnes/seed");
});

test("DEFAULT_IMAGE_MODEL is 'seedream' (R2.3)", () => {
  assert.equal(DEFAULT_IMAGE_MODEL, "seedream");
});

test("DEFAULT_VIDEO_MODEL is 'seedance' (R2.4)", () => {
  assert.equal(DEFAULT_VIDEO_MODEL, "seedance");
});

test("VIDEO_POLL_INTERVAL_MS is 5000 (R2.5)", () => {
  assert.equal(VIDEO_POLL_INTERVAL_MS, 5_000);
});

test("VIDEO_POLL_MAX_DURATION_MS is 600000 (R2.6)", () => {
  assert.equal(VIDEO_POLL_MAX_DURATION_MS, 600_000);
});

// =============================================================================
// Section 2 — Model routing via live client (R2.2, R2.3, R2.4)
// =============================================================================

test("R2.2: chat routes to 'agnes/seed' by default", async () => {
  let calledUrl = null;
  const fetchImpl = async (url, _opts) => {
    calledUrl = url;
    return jsonFetchResponse({
      choices: [{ message: { content: "hello" } }],
    });
  };
  const client = createAiGatewayClient({ fetchImpl, gatewayBaseUrl: BASE_URL });
  const result = await client.chat({ prompt: "test" });

  assert.ok(result.ok, `expected ok=true, got: ${JSON.stringify(result)}`);
  assert.equal(result.model, DEFAULT_CHAT_MODEL);
  assert.ok(calledUrl.includes(DEFAULT_CHAT_MODEL), `URL '${calledUrl}' should include default chat model`);
});

test("R2.3: image routes to 'seedream' by default", async () => {
  let calledUrl = null;
  const fetchImpl = async (url, _opts) => {
    calledUrl = url;
    return jsonFetchResponse({ data: [{ b64_json: "abc123" }] });
  };
  const client = createAiGatewayClient({ fetchImpl, gatewayBaseUrl: BASE_URL });
  const result = await client.image({ prompt: "a scene" });

  assert.ok(result.ok, `expected ok=true, got: ${JSON.stringify(result)}`);
  assert.equal(result.model, DEFAULT_IMAGE_MODEL);
  assert.ok(calledUrl.includes(DEFAULT_IMAGE_MODEL), `URL '${calledUrl}' should include default image model`);
});

test("R2.4: submitVideo routes to 'seedance' by default", async () => {
  let calledUrl = null;
  const fetchImpl = async (url, _opts) => {
    calledUrl = url;
    return jsonFetchResponse({ taskId: "task-123" });
  };
  const client = createAiGatewayClient({ fetchImpl, gatewayBaseUrl: BASE_URL });
  const result = await client.submitVideo({ prompt: "a video" });

  assert.ok(result.ok, `expected ok=true, got: ${JSON.stringify(result)}`);
  assert.equal(result.model, DEFAULT_VIDEO_MODEL);
  assert.ok(calledUrl.includes(DEFAULT_VIDEO_MODEL), `URL '${calledUrl}' should include default video model`);
});

// =============================================================================
// Section 3 — Model override (R2.10)
// =============================================================================

test("R2.10: passing model to chat uses that model instead of the group default", async () => {
  let calledUrl = null;
  const fetchImpl = async (url, _opts) => {
    calledUrl = url;
    return jsonFetchResponse({ choices: [{ message: { content: "yo" } }] });
  };
  const client = createAiGatewayClient({ fetchImpl, gatewayBaseUrl: BASE_URL });
  const result = await client.chat({ prompt: "hi", model: "custom-chat-v2" });

  assert.ok(result.ok);
  assert.equal(result.model, "custom-chat-v2");
  assert.ok(calledUrl.includes("custom-chat-v2"), `URL '${calledUrl}' should include overridden model`);
  assert.ok(!calledUrl.includes(DEFAULT_CHAT_MODEL), "URL must not contain the default chat model when overridden");
});

test("R2.10: passing model to image uses that model instead of the group default", async () => {
  let calledUrl = null;
  const fetchImpl = async (url, _opts) => {
    calledUrl = url;
    return jsonFetchResponse({ data: [{ b64_json: "xyz" }] });
  };
  const client = createAiGatewayClient({ fetchImpl, gatewayBaseUrl: BASE_URL });
  const result = await client.image({ prompt: "scene", model: "custom-image-v1" });

  assert.ok(result.ok);
  assert.equal(result.model, "custom-image-v1");
  assert.ok(calledUrl.includes("custom-image-v1"));
});

test("R2.10: passing model to submitVideo uses that model instead of the group default", async () => {
  let calledUrl = null;
  const fetchImpl = async (url, _opts) => {
    calledUrl = url;
    return jsonFetchResponse({ taskId: "t-override" });
  };
  const client = createAiGatewayClient({ fetchImpl, gatewayBaseUrl: BASE_URL });
  const result = await client.submitVideo({ prompt: "clip", model: "custom-video-v3" });

  assert.ok(result.ok);
  assert.equal(result.model, "custom-video-v3");
  assert.ok(calledUrl.includes("custom-video-v3"));
});

// =============================================================================
// Section 4 — Gateway error path (R2.7)
// =============================================================================

test("R2.7: non-2xx HTTP response from chat returns { ok: false, error, code }", async () => {
  const client = createAiGatewayClient({
    fetchImpl: makeFetch({ message: "bad input" }, 400),
    gatewayBaseUrl: BASE_URL,
  });
  const result = await client.chat({ prompt: "test" });

  assert.equal(result.ok, false);
  assert.equal(typeof result.error, "string");
  assert.ok(result.error.length > 0);
  assert.equal(typeof result.code, "string");
  assert.ok(result.code.length > 0);
  // No partial artifact fields.
  assert.equal("text" in result, false);
  assert.equal("bytesOrB64" in result, false);
});

test("R2.7: non-2xx HTTP response from image returns { ok: false, error, code } with no artifact", async () => {
  const client = createAiGatewayClient({
    fetchImpl: makeFetch({ error: "server error" }, 500),
    gatewayBaseUrl: BASE_URL,
  });
  const result = await client.image({ prompt: "scene" });

  assert.equal(result.ok, false);
  assert.equal(typeof result.error, "string");
  assert.equal(typeof result.code, "string");
  assert.equal("bytesOrB64" in result, false);
});

test("R2.7: non-2xx HTTP response from submitVideo returns { ok: false, error, code }", async () => {
  const client = createAiGatewayClient({
    fetchImpl: makeFetch({ error: "quota exceeded" }, 429),
    gatewayBaseUrl: BASE_URL,
  });
  const result = await client.submitVideo({ prompt: "clip" });

  assert.equal(result.ok, false);
  assert.equal(typeof result.error, "string");
  assert.equal(typeof result.code, "string");
  assert.equal("taskId" in result, false);
});

test("R2.7: network error from fetchImpl returns { ok: false, error, code }", async () => {
  const client = createAiGatewayClient({
    fetchImpl: makeNetworkErrorFetch(),
    gatewayBaseUrl: BASE_URL,
  });
  const result = await client.chat({ prompt: "ping" });

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("network error") || result.error.includes("connection refused") || result.error.length > 0);
  assert.equal(typeof result.code, "string");
});

// =============================================================================
// Section 5 — pollVideoUntilDone: submit → poll loop (R2.5)
// =============================================================================

test("R2.5: pollVideoUntilDone completes when pollVideo returns status 'complete'", async () => {
  // Sequential fetch:
  //   1st call → submit: returns taskId
  //   2nd call → poll:   returns pending
  //   3rd call → poll:   returns complete with ephemeral URL
  let tick = 0;
  const responses = [
    { body: { taskId: "task-loop-test" } },                              // submitVideo
    { body: { status: "pending" } },                                     // poll 1
    { body: { status: "complete", url: "https://provider.example/v.mp4" } }, // poll 2
  ];
  const fetchImpl = makeSequentialFetch(responses);

  // Use a virtual clock and instant sleep so no real time passes.
  let virtualTime = 0;
  const now = () => virtualTime;
  const sleep = makeInstantSleep();

  const client = createAiGatewayClient({ fetchImpl, gatewayBaseUrl: BASE_URL, now });

  // Submit first, then drive the poll loop with instant sleep.
  const submitted = await client.submitVideo({ prompt: "loop test" });
  assert.ok(submitted.ok, `submitVideo failed: ${JSON.stringify(submitted)}`);

  // Reset fetch for polling (re-create sequential for poll calls only)
  tick = 0;
  const pollResponses = [
    { body: { status: "pending" } },
    { body: { status: "complete", url: "https://provider.example/v.mp4" } },
  ];
  const pollFetch = makeSequentialFetch(pollResponses);
  const pollClient = createAiGatewayClient({ fetchImpl: pollFetch, gatewayBaseUrl: BASE_URL, now });

  const done = await pollClient.pollVideoUntilDone({
    taskId: submitted.taskId,
    model: DEFAULT_VIDEO_MODEL,
    intervalMs: 0,
    maxDurationMs: 600_000,
    sleep,
  });

  assert.equal(done.ok, true, `expected ok=true, got: ${JSON.stringify(done)}`);
  assert.equal(done.model, DEFAULT_VIDEO_MODEL);
  assert.equal(typeof done.elapsed, "number");
});

test("R2.5: mock pollVideoUntilDone drives submit→poll loop and completes on 'complete' status", async () => {
  // Use mock client with videoCompletionAfterPolls=2 to test multi-poll loop.
  const client = createMockAiGatewayClient({
    videoCompletionAfterPolls: 2,
    sleepImpl: makeInstantSleep(),
  });

  const submitted = await client.submitVideo({ prompt: "multi-poll test" });
  assert.ok(submitted.ok);

  const done = await client.pollVideoUntilDone({
    taskId: submitted.taskId,
    model: DEFAULT_VIDEO_MODEL,
    intervalMs: 0,
    maxDurationMs: 600_000,
    sleep: makeInstantSleep(),
  });

  assert.equal(done.ok, true, `expected ok=true, got: ${JSON.stringify(done)}`);
  assert.ok(done.ephemeralUrl.startsWith("https://mock.provider/video/"));
  assert.equal(done.mediaType, "video/mp4");
});

// =============================================================================
// Section 6 — 600s poll-timeout failure path (R2.6)
// =============================================================================

test("R2.6: pollVideoUntilDone returns { ok: false, timedOut: true } when maxDurationMs exceeded (live client)", async () => {
  // pollVideo always returns pending — clock starts past the deadline so the
  // first iteration immediately times out.
  const pollFetch = makeFetch({ status: "pending" });

  // Virtual clock starts at 0, but we set maxDurationMs=0 so elapsed (0) >= 0
  // immediately triggers the timeout on the first iteration.
  let virtualTime = 0;
  const now = () => virtualTime;

  const client = createAiGatewayClient({
    fetchImpl: pollFetch,
    gatewayBaseUrl: BASE_URL,
    now,
  });

  const done = await client.pollVideoUntilDone({
    taskId: "task-timeout",
    model: DEFAULT_VIDEO_MODEL,
    intervalMs: 0,
    maxDurationMs: 0, // Expire immediately.
    sleep: makeInstantSleep(),
  });

  assert.equal(done.ok, false, `expected ok=false, got: ${JSON.stringify(done)}`);
  assert.equal(done.timedOut, true);
  assert.equal(typeof done.error, "string");
  assert.ok(done.error.length > 0);
  assert.equal(done.model, DEFAULT_VIDEO_MODEL);
  // No partial artifact in timeout response.
  assert.equal("ephemeralUrl" in done, false);
  assert.equal("bytesOrB64" in done, false);
});

test("R2.6: mock pollVideoUntilDone returns { ok: false, timedOut: true } when maxDurationMs exceeded", async () => {
  // Build a clock that advances beyond maxDurationMs on the first poll check.
  let virtualTime = 0;
  const now = () => virtualTime;
  const sleep = async (_ms) => {
    // Advance time past the limit during sleep so next iteration times out.
    virtualTime += 700_000;
  };

  const client = createMockAiGatewayClient({
    videoCompletionAfterPolls: 99, // never completes naturally
    videoLatencyMs: 0,
    now,
    sleepImpl: sleep,
  });

  const submitted = await client.submitVideo({ prompt: "timeout test" });
  assert.ok(submitted.ok);

  const done = await client.pollVideoUntilDone({
    taskId: submitted.taskId,
    model: DEFAULT_VIDEO_MODEL,
    intervalMs: 5_000,
    maxDurationMs: 600_000,
    sleep,
  });

  assert.equal(done.ok, false, `expected ok=false, got: ${JSON.stringify(done)}`);
  assert.equal(done.timedOut, true);
  assert.equal(typeof done.error, "string");
  assert.ok(done.error.length > 0);
  assert.equal(typeof done.code, "string");
  assert.equal("ephemeralUrl" in done, false);
});

// =============================================================================
// Section 7 — pollVideoUntilDone propagates gateway errors from pollVideo (R2.7)
// =============================================================================

test("R2.7: pollVideoUntilDone propagates gateway error from pollVideo (live client)", async () => {
  // pollVideo returns a 500 error.
  const pollFetch = makeFetch({ error: "internal error" }, 500);
  const now = () => 0;
  const client = createAiGatewayClient({
    fetchImpl: pollFetch,
    gatewayBaseUrl: BASE_URL,
    now,
  });

  const done = await client.pollVideoUntilDone({
    taskId: "task-err",
    model: DEFAULT_VIDEO_MODEL,
    intervalMs: 0,
    maxDurationMs: 600_000,
    sleep: makeInstantSleep(),
  });

  assert.equal(done.ok, false, `expected ok=false, got: ${JSON.stringify(done)}`);
  assert.equal(done.timedOut, undefined); // not a timeout — a gateway error
  assert.equal(typeof done.error, "string");
  assert.equal(typeof done.code, "string");
});

test("R2.7: mock pollVideoUntilDone propagates gateway error (failVideo=true)", async () => {
  const client = createMockAiGatewayClient({
    failVideo: true,
    sleepImpl: makeInstantSleep(),
  });

  // submitVideo should itself fail when failVideo=true.
  const submitted = await client.submitVideo({ prompt: "fail test" });
  assert.equal(submitted.ok, false);
  assert.equal(typeof submitted.error, "string");

  // pollVideoUntilDone with a manual taskId should propagate the error.
  const done = await client.pollVideoUntilDone({
    taskId: "manual-task",
    model: DEFAULT_VIDEO_MODEL,
    intervalMs: 0,
    maxDurationMs: 600_000,
    sleep: makeInstantSleep(),
  });

  assert.equal(done.ok, false);
  assert.equal(done.timedOut, undefined);
  assert.equal(typeof done.error, "string");
});

// =============================================================================
// Section 8 — Mock client: model routing defaults (R2.2, R2.3, R2.4)
// =============================================================================

test("mock chat uses 'agnes/seed' by default (R2.2)", async () => {
  const client = createMockAiGatewayClient();
  const result = await client.chat({ prompt: "hello" });
  assert.ok(result.ok);
  assert.equal(result.model, "agnes/seed");
  assert.equal(typeof result.text, "string");
  assert.ok(result.text.startsWith("mock-chat:"));
});

test("mock image uses 'seedream' by default (R2.3)", async () => {
  const client = createMockAiGatewayClient();
  const result = await client.image({ prompt: "sunset" });
  assert.ok(result.ok);
  assert.equal(result.model, "seedream");
  assert.ok(result.bytesOrB64.startsWith("mock-image-b64-"));
  assert.equal(result.mediaType, "image/png");
});

test("mock submitVideo uses 'seedance' by default (R2.4)", async () => {
  const client = createMockAiGatewayClient();
  const result = await client.submitVideo({ prompt: "a clip" });
  assert.ok(result.ok);
  assert.equal(result.model, "seedance");
  assert.ok(result.taskId.startsWith("mock-task-"));
});

// =============================================================================
// Section 9 — Mock client: model override (R2.10)
// =============================================================================

test("mock chat respects model override (R2.10)", async () => {
  const client = createMockAiGatewayClient();
  const result = await client.chat({ prompt: "hi", model: "my-chat-model" });
  assert.ok(result.ok);
  assert.equal(result.model, "my-chat-model");
});

test("mock image respects model override (R2.10)", async () => {
  const client = createMockAiGatewayClient();
  const result = await client.image({ prompt: "hi", model: "my-image-model" });
  assert.ok(result.ok);
  assert.equal(result.model, "my-image-model");
});

test("mock submitVideo respects model override (R2.10)", async () => {
  const client = createMockAiGatewayClient();
  const result = await client.submitVideo({ prompt: "hi", model: "my-video-model" });
  assert.ok(result.ok);
  assert.equal(result.model, "my-video-model");
});

// =============================================================================
// Section 10 — Mock client: deterministic output (R8.6, R8.8)
// =============================================================================

test("R8.8: identical inputs to createMockAiGatewayClient produce byte-for-byte identical chat outputs", async () => {
  const prompt = "determinism check";

  const client1 = createMockAiGatewayClient();
  const client2 = createMockAiGatewayClient();

  const r1 = await client1.chat({ prompt });
  const r2 = await client2.chat({ prompt });

  assert.equal(r1.text, r2.text);
  assert.equal(r1.model, r2.model);
});

test("R8.8: identical inputs produce byte-for-byte identical image outputs across separate client instances", async () => {
  const prompt = "determinism image check";

  const client1 = createMockAiGatewayClient();
  const client2 = createMockAiGatewayClient();

  const r1 = await client1.image({ prompt });
  const r2 = await client2.image({ prompt });

  assert.equal(r1.bytesOrB64, r2.bytesOrB64);
  assert.equal(r1.mediaType, r2.mediaType);
  assert.equal(r1.model, r2.model);
});

test("R8.8: identical inputs produce byte-for-byte identical video taskIds across separate client instances", async () => {
  const prompt = "determinism video check";

  const client1 = createMockAiGatewayClient();
  const client2 = createMockAiGatewayClient();

  const r1 = await client1.submitVideo({ prompt });
  const r2 = await client2.submitVideo({ prompt });

  assert.equal(r1.taskId, r2.taskId);
  assert.equal(r1.model, r2.model);
});

test("R8.6: same prompt on same client instance produces identical chat outputs on repeated calls", async () => {
  const client = createMockAiGatewayClient();
  const prompt = "repeat check";

  const r1 = await client.chat({ prompt });
  const r2 = await client.chat({ prompt });

  assert.equal(r1.text, r2.text);
  assert.equal(r1.model, r2.model);
});

test("R8.6: different prompts produce different mock chat outputs", async () => {
  const client = createMockAiGatewayClient();

  const r1 = await client.chat({ prompt: "prompt-alpha" });
  const r2 = await client.chat({ prompt: "prompt-beta" });

  assert.notEqual(r1.text, r2.text);
});

test("R8.8: pollVideoUntilDone on identical submit inputs produces identical ephemeralUrls across client instances", async () => {
  const sleepFn = makeInstantSleep();
  const opts = {
    videoCompletionAfterPolls: 1,
    videoLatencyMs: 0,
    sleepImpl: sleepFn,
  };

  const client1 = createMockAiGatewayClient(opts);
  const client2 = createMockAiGatewayClient(opts);

  const prompt = "identical video run";
  const s1 = await client1.submitVideo({ prompt });
  const s2 = await client2.submitVideo({ prompt });
  assert.equal(s1.taskId, s2.taskId, "taskIds must be identical for identical inputs");

  const d1 = await client1.pollVideoUntilDone({
    taskId: s1.taskId,
    intervalMs: 0,
    maxDurationMs: 600_000,
    sleep: sleepFn,
  });
  const d2 = await client2.pollVideoUntilDone({
    taskId: s2.taskId,
    intervalMs: 0,
    maxDurationMs: 600_000,
    sleep: sleepFn,
  });

  assert.equal(d1.ok, true);
  assert.equal(d2.ok, true);
  assert.equal(d1.ephemeralUrl, d2.ephemeralUrl);
  assert.equal(d1.mediaType, d2.mediaType);
});

// =============================================================================
// Section 11 — Mock failure paths
// =============================================================================

test("mock chat returns { ok: false, error, code } when failOnCall=true", async () => {
  const client = createMockAiGatewayClient({ failOnCall: true });
  const result = await client.chat({ prompt: "fail" });
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, "string");
  assert.equal(typeof result.code, "string");
  assert.equal("text" in result, false);
});

test("mock image returns { ok: false, error, code } when failOnCall=true", async () => {
  const client = createMockAiGatewayClient({ failOnCall: true });
  const result = await client.image({ prompt: "fail" });
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, "string");
  assert.equal(typeof result.code, "string");
  assert.equal("bytesOrB64" in result, false);
});

test("mock submitVideo returns { ok: false, error, code } when failOnCall=true", async () => {
  const client = createMockAiGatewayClient({ failOnCall: true });
  const result = await client.submitVideo({ prompt: "fail" });
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, "string");
  assert.equal(typeof result.code, "string");
});

test("mock submitVideo returns { ok: false, error, code } when failVideo=true", async () => {
  const client = createMockAiGatewayClient({ failVideo: true });
  const result = await client.submitVideo({ prompt: "fail-video" });
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, "string");
  assert.equal(typeof result.code, "string");
});

// =============================================================================
// Section 12 — Live client: correct response extraction
// =============================================================================

test("live chat extracts text from OpenAI-compatible choices[0].message.content", async () => {
  const client = createAiGatewayClient({
    fetchImpl: makeFetch({ choices: [{ message: { content: "extracted text" } }] }),
    gatewayBaseUrl: BASE_URL,
  });
  const result = await client.chat({ prompt: "test" });
  assert.ok(result.ok);
  assert.equal(result.text, "extracted text");
});

test("live image extracts bytesOrB64 from data[0].b64_json", async () => {
  const client = createAiGatewayClient({
    fetchImpl: makeFetch({ data: [{ b64_json: "base64payload" }] }),
    gatewayBaseUrl: BASE_URL,
  });
  const result = await client.image({ prompt: "test" });
  assert.ok(result.ok);
  assert.equal(result.bytesOrB64, "base64payload");
  assert.equal(result.mediaType, "image/png");
});

test("live submitVideo extracts taskId from response", async () => {
  const client = createAiGatewayClient({
    fetchImpl: makeFetch({ taskId: "returned-task-id" }),
    gatewayBaseUrl: BASE_URL,
  });
  const result = await client.submitVideo({ prompt: "clip" });
  assert.ok(result.ok);
  assert.equal(result.taskId, "returned-task-id");
});

test("live pollVideo returns ok:true with status 'complete' for a complete response", async () => {
  const client = createAiGatewayClient({
    fetchImpl: makeFetch({ status: "complete", url: "https://provider.example/video.mp4" }),
    gatewayBaseUrl: BASE_URL,
  });
  const result = await client.pollVideo({ taskId: "t-1" });
  assert.ok(result.ok);
  assert.equal(result.status, "complete");
});

test("live pollVideo returns ok:true with status 'pending' for a pending response", async () => {
  const client = createAiGatewayClient({
    fetchImpl: makeFetch({ status: "pending" }),
    gatewayBaseUrl: BASE_URL,
  });
  const result = await client.pollVideo({ taskId: "t-2" });
  assert.ok(result.ok);
  assert.equal(result.status, "pending");
});

// =============================================================================
// Section 13 — costLog shape
// =============================================================================

test("live chat result includes a costLog with kind='chat'", async () => {
  const client = createAiGatewayClient({
    fetchImpl: makeFetch({ choices: [{ message: { content: "x" } }] }),
    gatewayBaseUrl: BASE_URL,
  });
  const result = await client.chat({ prompt: "test" });
  assert.ok(result.ok);
  assert.equal(result.costLog.kind, "chat");
  assert.equal(result.costLog.model, DEFAULT_CHAT_MODEL);
});

test("live image result includes a costLog with kind='image'", async () => {
  const client = createAiGatewayClient({
    fetchImpl: makeFetch({ data: [{ b64_json: "img" }] }),
    gatewayBaseUrl: BASE_URL,
  });
  const result = await client.image({ prompt: "test" });
  assert.ok(result.ok);
  assert.equal(result.costLog.kind, "image");
  assert.equal(result.costLog.model, DEFAULT_IMAGE_MODEL);
});

test("mock chat result includes a costLog with kind='chat'", async () => {
  const client = createMockAiGatewayClient();
  const result = await client.chat({ prompt: "costlog check" });
  assert.ok(result.ok);
  assert.equal(result.costLog.kind, "chat");
  assert.equal(result.costLog.model, DEFAULT_CHAT_MODEL);
});

test("mock image result includes a costLog with kind='image'", async () => {
  const client = createMockAiGatewayClient();
  const result = await client.image({ prompt: "costlog check" });
  assert.ok(result.ok);
  assert.equal(result.costLog.kind, "image");
  assert.equal(result.costLog.model, DEFAULT_IMAGE_MODEL);
});
