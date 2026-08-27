// AI Gateway client — single egress for all BytePlus model calls.
// agenticgraph-widget-canvas-media · Task 2.1 · Requirements 2.1–2.7, 2.10
//
// PURE module — no live network. `fetchImpl` is injectable (R8.1).
// Platform: Cloudflare only. No Vercel/AWS references.
//
// Models (group defaults, overrideable per-call via R2.10):
//   chat  → "agnes/seed"   image → "seedream"   video → "seedance"
//
// Video async (R2.5, R2.6):
//   submitVideo → { ok, taskId }
//   pollVideo   → { ok, status: "pending"|"complete"|"failed", ephemeralUrl? }
//   pollVideoUntilDone drives the 5s / 600s loop; timeout → structured result.
// On any gateway/provider error: { ok: false, error, code } — no partial artifact.
//
// Mock counterpart (createMockAiGatewayClient) lives in task 2.2 to stay ≤600 lines.

import { AGENTICGRAPH_MEDIA_HOST } from "../../contracts/media-artifact.schema.js";

// Suppress unused-import lint: AGENTICGRAPH_MEDIA_HOST is imported so tests can
// confirm the module resolves the contract import correctly.
void AGENTICGRAPH_MEDIA_HOST;

// ---------------------------------------------------------------------------
// Exported constants
// ---------------------------------------------------------------------------

/** Default BytePlus chat model (R2.2). */
export const DEFAULT_CHAT_MODEL = "agnes/seed";

/** Default BytePlus image model (R2.3). */
export const DEFAULT_IMAGE_MODEL = "seedream";

/** Default BytePlus video model (R2.4). */
export const DEFAULT_VIDEO_MODEL = "seedance";

/** Poll interval for async video tasks: 5 000 ms (R2.5). */
export const VIDEO_POLL_INTERVAL_MS = 5_000;

/** Maximum total polling duration: 600 000 ms (R2.5, R2.6). */
export const VIDEO_POLL_MAX_DURATION_MS = 600_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function cleanString(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

/** Use the per-call override when non-empty; otherwise return groupDefault (R2.10). */
function resolveModel(override, groupDefault) {
  const s = cleanString(override);
  return s.length > 0 ? s : groupDefault;
}

/** Build the full gateway URL: `{base}/{model}` */
function gatewayUrl(base, model) {
  return `${cleanString(base).replace(/\/+$/, "")}/${model}`;
}

async function safeJson(response) {
  try { return await response.json(); } catch { return null; }
}

/** Build a structured gateway error (never throws). */
function buildGatewayError(errOrResponse, context) {
  if (errOrResponse instanceof Error) {
    return { ok: false, error: `${context}: network error — ${errOrResponse.message}`, code: "network_error" };
  }
  if (errOrResponse && typeof errOrResponse === "object" && "status" in errOrResponse) {
    const status = Number(errOrResponse.status);
    return { ok: false, error: `${context}: HTTP ${status}`, code: "gateway_http_error", status };
  }
  return { ok: false, error: `${context}: unknown gateway error`, code: "gateway_unknown_error" };
}

function flattenExtra(extra) {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return {};
  const safe = {};
  for (const [k, v] of Object.entries(extra)) {
    if (typeof k === "string" && k !== "__proto__" && k !== "constructor") safe[k] = v;
  }
  return safe;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function _requireFetch() {
  if (typeof globalThis.fetch === "function") return globalThis.fetch;
  throw new Error(
    "createAiGatewayClient: no fetchImpl provided and globalThis.fetch is unavailable. " +
    "Pass a fetchImpl so the module stays network-free in tests.",
  );
}

// ---------------------------------------------------------------------------
// Data-extraction helpers
// ---------------------------------------------------------------------------

/** Extract chat text from OpenAI-compatible completion shape; null on missing. */
function extractChatText(data) {
  if (!data || typeof data !== "object") return null;
  const choices = Array.isArray(data.choices) ? data.choices : null;
  if (choices?.length > 0) {
    const msg = choices[0]?.message;
    if (typeof msg?.content === "string") return msg.content;
    if (typeof choices[0]?.text === "string") return choices[0].text;
  }
  for (const f of ["text", "response", "content"]) {
    if (typeof data[f] === "string" && data[f].length > 0) return data[f];
  }
  return null;
}

/** Extract image payload; null on missing content. */
function extractImageResult(data) {
  if (!data || typeof data !== "object") return null;
  const dataArr = Array.isArray(data.data) ? data.data : null;
  if (dataArr?.length > 0) {
    const item = dataArr[0];
    if (typeof item?.b64_json === "string" && item.b64_json.length > 0) {
      return { bytesOrB64: item.b64_json, ephemeralUrl: item.url || undefined, mediaType: "image/png" };
    }
    if (typeof item?.url === "string" && item.url.length > 0) {
      return { bytesOrB64: item.url, ephemeralUrl: item.url, mediaType: "image/png" };
    }
  }
  if (typeof data.b64_json === "string" && data.b64_json.length > 0) {
    return { bytesOrB64: data.b64_json, mediaType: "image/png" };
  }
  if (typeof data.url === "string" && data.url.length > 0) {
    return { bytesOrB64: data.url, ephemeralUrl: data.url, mediaType: "image/png" };
  }
  return null;
}

/** Extract task id from a video submit response; null on missing. */
function extractTaskId(data) {
  if (!data || typeof data !== "object") return null;
  for (const f of ["taskId", "task_id", "id", "jobId", "job_id"]) {
    if (typeof data[f] === "string" && data[f].length > 0) return data[f];
  }
  return null;
}

/** Normalize raw gateway status to "pending" | "complete" | "failed" | null. */
function normalizeVideoStatus(raw) {
  if (["complete", "completed", "succeed", "succeeded", "success", "done", "finished"].includes(raw)) return "complete";
  if (["failed", "failure", "error", "cancelled", "canceled"].includes(raw)) return "failed";
  if (["pending", "processing", "queued", "running", "in_progress", "inprogress", "waiting"].includes(raw)) return "pending";
  return null;
}

/** Extract video URL from a completed task response; undefined when absent. */
function extractVideoUrl(data) {
  if (!data || typeof data !== "object") return undefined;
  const paths = [
    data.url, data.videoUrl, data.video_url, data.outputUrl, data.output_url,
    data.result?.url, data.result?.videoUrl, data.result?.video_url,
    data.data?.url, data.data?.videoUrl,
  ];
  for (const c of paths) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return undefined;
}

/** Parse a poll-status response into the canonical shape. */
function extractPollResult(model, taskId, data) {
  if (!data || typeof data !== "object") {
    return { ok: false, error: `pollVideo(${model}, taskId=${taskId}): non-object response`, code: "gateway_parse_error" };
  }
  const rawStatus = cleanString(data.status ?? data.state ?? data.task_status).toLowerCase();
  const status = normalizeVideoStatus(rawStatus);
  if (!status) {
    return { ok: false, error: `pollVideo(${model}, taskId=${taskId}): unrecognized status "${rawStatus}"`, code: "gateway_unknown_status" };
  }
  if (status === "complete") {
    return { ok: true, status: "complete", ephemeralUrl: extractVideoUrl(data), mediaType: "video/mp4" };
  }
  if (status === "failed") {
    return { ok: true, status: "failed" };
  }
  return { ok: true, status: "pending" };
}

function buildCostLog(kind, model, data) {
  return {
    kind, model,
    usageTokens: data?.usage?.total_tokens ?? data?.usage?.totalTokens ?? null,
    rawUsage: data?.usage ?? null,
  };
}

// ---------------------------------------------------------------------------
// createAiGatewayClient
// ---------------------------------------------------------------------------

/**
 * Create the live AI Gateway client. Every call routes through `gatewayBaseUrl`
 * to BytePlus ModelArk (R2.1). `fetchImpl` is required for network-free tests.
 *
 * @param {{ fetchImpl, gatewayBaseUrl, accountId?, now? }} opts
 * @returns {{ chat, image, submitVideo, pollVideo, pollVideoUntilDone }}
 */
export function createAiGatewayClient({ fetchImpl, gatewayBaseUrl, accountId, now } = {}) {
  const fetch_ = typeof fetchImpl === "function" ? fetchImpl : _requireFetch();
  const baseUrl = cleanString(gatewayBaseUrl);
  const clock = typeof now === "function" ? now : () => Date.now();
  const acctId = cleanString(accountId);

  function buildHeaders(extra = {}) {
    const h = { "content-type": "application/json", accept: "application/json" };
    if (acctId) h["x-agenticgraph-account"] = acctId;
    return Object.assign(h, extra);
  }

  // --- chat (R2.2) -----------------------------------------------------------

  async function chat({ prompt, model: modelOverride, extra } = {}) {
    const model = resolveModel(modelOverride, DEFAULT_CHAT_MODEL);
    const url = gatewayUrl(baseUrl, model);
    let response;
    try {
      response = await fetch_(url, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ messages: [{ role: "user", content: cleanString(prompt) }], ...flattenExtra(extra) }),
      });
    } catch (err) { return buildGatewayError(err, `chat(${model})`); }
    if (!response.ok) return buildGatewayError(response, `chat(${model})`);
    const data = await safeJson(response);
    if (!data) return { ok: false, error: `chat(${model}): non-JSON response`, code: "gateway_parse_error" };
    const text = extractChatText(data);
    if (text === null) return { ok: false, error: `chat(${model}): missing text content`, code: "gateway_empty_response" };
    return { ok: true, text, model, costLog: buildCostLog("chat", model, data) };
  }

  // --- image (R2.3) ----------------------------------------------------------

  async function image({ prompt, model: modelOverride, extra } = {}) {
    const model = resolveModel(modelOverride, DEFAULT_IMAGE_MODEL);
    const url = gatewayUrl(baseUrl, model);
    let response;
    try {
      response = await fetch_(url, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ prompt: cleanString(prompt), ...flattenExtra(extra) }),
      });
    } catch (err) { return buildGatewayError(err, `image(${model})`); }
    if (!response.ok) return buildGatewayError(response, `image(${model})`);
    const data = await safeJson(response);
    if (!data) return { ok: false, error: `image(${model}): non-JSON response`, code: "gateway_parse_error" };
    const extracted = extractImageResult(data);
    if (!extracted) return { ok: false, error: `image(${model}): missing image content`, code: "gateway_empty_response" };
    return { ok: true, ...extracted, model, costLog: buildCostLog("image", model, data) };
  }

  // --- submitVideo (R2.4) ----------------------------------------------------

  async function submitVideo({ prompt, model: modelOverride, extra } = {}) {
    const model = resolveModel(modelOverride, DEFAULT_VIDEO_MODEL);
    const url = gatewayUrl(baseUrl, `${model}/submit`);
    let response;
    try {
      response = await fetch_(url, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ prompt: cleanString(prompt), ...flattenExtra(extra) }),
      });
    } catch (err) { return buildGatewayError(err, `submitVideo(${model})`); }
    if (!response.ok) return buildGatewayError(response, `submitVideo(${model})`);
    const data = await safeJson(response);
    if (!data) return { ok: false, error: `submitVideo(${model}): non-JSON response`, code: "gateway_parse_error" };
    const taskId = extractTaskId(data);
    if (!taskId) return { ok: false, error: `submitVideo(${model}): missing task id`, code: "gateway_missing_task_id" };
    return { ok: true, taskId, model };
  }

  // --- pollVideo (R2.5) ------------------------------------------------------

  async function pollVideo({ taskId, model: modelOverride } = {}) {
    const model = resolveModel(modelOverride, DEFAULT_VIDEO_MODEL);
    const url = gatewayUrl(baseUrl, `${model}/status/${encodeURIComponent(cleanString(taskId))}`);
    let response;
    try {
      response = await fetch_(url, { method: "GET", headers: buildHeaders() });
    } catch (err) { return buildGatewayError(err, `pollVideo(${model}, taskId=${taskId})`); }
    if (!response.ok) return buildGatewayError(response, `pollVideo(${model}, taskId=${taskId})`);
    const data = await safeJson(response);
    if (!data) return { ok: false, error: `pollVideo(${model}): non-JSON response`, code: "gateway_parse_error" };
    return extractPollResult(model, taskId, data);
  }

  // --- pollVideoUntilDone — drives 5s / 600s loop (R2.5, R2.6, R2.7) --------

  /**
   * Drive the submit → poll loop. Returns:
   *   { ok: true,  ephemeralUrl, mediaType, model, elapsed }   on success
   *   { ok: false, timedOut: true, elapsed, model }            on timeout (R2.6)
   *   { ok: false, error, code, model }                        on error (R2.7)
   */
  async function pollVideoUntilDone({
    taskId, model: modelOverride,
    intervalMs, maxDurationMs, sleep: sleepFn,
  } = {}) {
    const model = resolveModel(modelOverride, DEFAULT_VIDEO_MODEL);
    const interval = Number.isFinite(intervalMs) ? intervalMs : VIDEO_POLL_INTERVAL_MS;
    const maxDuration = Number.isFinite(maxDurationMs) ? maxDurationMs : VIDEO_POLL_MAX_DURATION_MS;
    const sleepImpl = typeof sleepFn === "function" ? sleepFn : defaultSleep;
    const startedAt = clock();

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const elapsed = clock() - startedAt;
      if (elapsed >= maxDuration) {
        return {
          ok: false, timedOut: true, model, elapsed,
          error: `video task timed out after ${elapsed}ms (max ${maxDuration}ms)`,
          code: "video_poll_timeout",
        };
      }

      const result = await pollVideo({ taskId, model });
      if (!result.ok) return { ...result, model };

      if (result.status === "complete") {
        return { ok: true, ephemeralUrl: result.ephemeralUrl, mediaType: result.mediaType || "video/mp4", model, elapsed: clock() - startedAt };
      }
      if (result.status === "failed") {
        return { ok: false, error: `provider reported task failed (taskId=${taskId})`, code: "video_task_failed", model, elapsed: clock() - startedAt };
      }

      await sleepImpl(interval);
    }
  }

  return Object.freeze({ chat, image, submitVideo, pollVideo, pollVideoUntilDone });
}
