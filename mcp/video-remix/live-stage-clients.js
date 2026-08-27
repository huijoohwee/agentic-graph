// LIVE stage clients for the video-remix Director runtime — Storyboard
// (BytePlus chat via Cloudflare AI Gateway), Render (Strytree/BytePlus queue),
// and Commerce (Stripe via the payment worker)
// (agenticgraph-acos-mcp-connector runtime-readiness path, task 12.4).
//
// These are the drop-in replacements for the deterministic in-memory mocks in
// `storyboard-harness.js`, `render-harness.js`, and `commerce-harness.js`. Each
// matches the EXACT injectable client seam the corresponding harness expects,
// performs a single real HTTP call through an injectable `fetchImpl`, maps the
// response into the harness contract shape, and FAILS CLOSED with a typed error
// so the harness's defined fallback path engages (storyboard single-node
// fallback R7.5; render mock-provider fallback R8.5/R8.6; commerce gate
// rejection / R9.4 failure). Model routing stays on the Cloudflare control
// plane (R11): these clients live only on the control-plane tier.
//
// ── Harness async constraint (RESOLVED by task 12.4a) ────────────────────────
//   * `runStoryboardHarness` is ASYNC and `await`s `chatClient.plan(...)`, so
//     the live BytePlus storyboard client below is consumable via that harness.
//   * The Render + Commerce live clients are async (real network calls). The
//     synchronous `runRenderHarness` / `runCheckout` / `runPublish` cannot
//     consume them, so task 12.4a added ASYNC sibling entry points —
//     `runRenderHarnessAsync`, `runCheckoutAsync`, `runPublishAsync` — that
//     `await` these seams. The live wiring layer must call those async variants
//     (the `requiresAsyncHarness: true` flag marks clients that require them).
//     The deterministic sync harnesses remain the default for the Director/test
//     path. These clients are exported + unit-tested in isolation and surfaced
//     by `resolveStageClients`; threading them into the deployed Director run is
//     the remaining live-wiring step (task 12.5 extension).
//
// Pure / SDK-agnostic apart from the injected `fetchImpl`: importable by both
// the Node tests and the Cloudflare Worker bundle, and unit-testable with a
// fake `fetch` (ZERO live calls).

import { cleanString } from "./helpers.js";
import { CINEMATOGRAPHY_GRAMMAR, resolveShotRenderPrompt } from "./expressive-storyboard.js";

const plainRecord = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

// Default endpoints / models. Kept as local constants (same discipline as the
// Exa client) so this JS module imports nothing from the TS SSOTs at runtime.
export const DEFAULT_AI_GATEWAY_CHAT_PATH = "/chat/completions";
export const DEFAULT_BYTEPLUS_CHAT_MODEL = "skylark-chat";

/** Typed errors so each harness routes to its defined fallback path. */
export class StoryboardClientError extends Error {
  constructor(message, code = "storyboard_request_failed") {
    super(message);
    this.name = "StoryboardClientError";
    this.code = code;
  }
}
export class RenderClientError extends Error {
  constructor(message, code = "render_dispatch_failed") {
    super(message);
    this.name = "RenderClientError";
    this.code = code;
  }
}
export class ImageGenerationClientError extends Error {
  constructor(message, code = "image_generation_request_failed") {
    super(message);
    this.name = "ImageGenerationClientError";
    this.code = code;
  }
}
export class CommerceClientError extends Error {
  constructor(message, code = "commerce_request_failed") {
    super(message);
    this.name = "CommerceClientError";
    this.code = code;
  }
}

/** Resolve a fetch implementation or throw a typed error for the given ErrorCtor. */
function resolveFetch(fetchImpl, ErrorCtor) {
  const impl = typeof fetchImpl === "function" ? fetchImpl : globalThis.fetch;
  if (typeof impl !== "function") {
    throw new ErrorCtor("no fetch implementation available for the live client");
  }
  return impl;
}

/** POST JSON and return the parsed JSON body; throw the typed error on non-2xx. */
async function postJson(fetchImpl, url, { headers, body }, ErrorCtor) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(headers ?? {}) },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ErrorCtor(`request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const status = typeof response?.status === "number" ? response.status : 0;
  if (status && (status < 200 || status >= 300)) {
    throw new ErrorCtor(`request returned HTTP ${status}`);
  }
  try {
    return await response.json();
  } catch {
    throw new ErrorCtor("response was not valid JSON");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Storyboard — BytePlus chat via Cloudflare AI Gateway (USABLE NOW; async seam)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a shot plan `{ shots: [{ prompt, sourceCardIds }] }` out of an
 * OpenAI-compatible chat completion. The model is prompted to answer with a
 * JSON object `{ shots: [...] }`; we read `choices[0].message.content` and parse
 * it. Tolerates content already being an object (some gateways return parsed).
 */
export function parseStoryboardCompletion(completion) {
  const choice = Array.isArray(completion?.choices) ? completion.choices[0] : null;
  const content = choice?.message?.content;
  let parsed = null;
  if (content && typeof content === "object") {
    parsed = content;
  } else if (typeof content === "string" && content.trim()) {
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = null;
    }
  }
  const shots = Array.isArray(parsed?.shots) ? parsed.shots : [];
  return shots.map((shot) => ({
    prompt: cleanString(shot?.prompt),
    sourceCardIds: Array.isArray(shot?.sourceCardIds)
      ? shot.sourceCardIds.map((id) => cleanString(id)).filter(Boolean)
      : [],
    actId: cleanString(shot?.actId),
    sceneId: cleanString(shot?.sceneId),
    objective: cleanString(shot?.objective),
    characterIds: Array.isArray(shot?.characterIds) ? shot.characterIds.map((id) => cleanString(id)).filter(Boolean) : [],
    characterStates: plainRecord(shot?.characterStates),
    environmentState: plainRecord(shot?.environmentState),
    dependencyShotIds: Array.isArray(shot?.dependencyShotIds) ? shot.dependencyShotIds.map((id) => cleanString(id)).filter(Boolean) : [],
    transitionReason: cleanString(shot?.transitionReason),
    scriptSegmentIds: Array.isArray(shot?.scriptSegmentIds) ? shot.scriptSegmentIds.map((id) => cleanString(id)).filter(Boolean) : [],
    scriptUnitIds: Array.isArray(shot?.scriptUnitIds) ? shot.scriptUnitIds.map((id) => cleanString(id)).filter(Boolean) : [],
    dialogueUnitIds: Array.isArray(shot?.dialogueUnitIds) ? shot.dialogueUnitIds.map((id) => cleanString(id)).filter(Boolean) : [],
    dramaticPurpose: cleanString(shot?.dramaticPurpose),
    dramaticIntensity: Number(shot?.dramaticIntensity),
    cinematography: plainRecord(shot?.cinematography),
    actionBeatId: cleanString(shot?.actionBeatId),
    cameraId: cleanString(shot?.cameraId),
    spatialBlocking: plainRecord(shot?.spatialBlocking),
  }));
}

export function parseCreativePlanCompletion(completion) {
  const choice = Array.isArray(completion?.choices) ? completion.choices[0] : null;
  const content = choice?.message?.content;
  let parsed = null;
  if (content && typeof content === "object") parsed = content;
  else if (typeof content === "string" && content.trim()) {
    try { parsed = JSON.parse(content); } catch { parsed = null; }
  }
  const characters = Array.isArray(parsed?.characters)
    ? parsed.characters.map((character) => ({
        id: cleanString(character?.id || character?.name),
        name: cleanString(character?.name || character?.id),
        description: cleanString(character?.description),
        referenceImageId: cleanString(character?.referenceImageId),
      })).filter((character) => character.id && character.name)
    : [];
  return {
    script: cleanString(parsed?.script),
    characters,
  };
}

/**
 * Build a LIVE BytePlus storyboard chat client exposing the
 * `plan({ brief, sourceIds, shotCount }) -> { shots: [...] }` seam that
 * `runStoryboardHarness` awaits. Routes through the Cloudflare AI Gateway chat
 * endpoint. Throws `StoryboardClientError` on transport/HTTP/parse failure so
 * the harness emits its single-node fallback (R7.5).
 *
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {string} [opts.endpoint] AI Gateway chat completions URL (required for live use)
 * @param {string} [opts.model] BytePlus chat model id (default `skylark-chat`)
 * @param {string} [opts.apiKey] bearer token for the gateway/provider
 */
export function createByteplusStoryboardClient(opts = {}) {
  const fetchImpl = resolveFetch(opts.fetchImpl, StoryboardClientError);
  const endpoint = cleanString(opts.endpoint);
  const model = cleanString(opts.model) || DEFAULT_BYTEPLUS_CHAT_MODEL;
  return {
    isDeterministicMock: false,
    requiresAsyncHarness: false, // runStoryboardHarness already awaits plan()
    async plan({ brief, sourceIds, shotCount, scriptContext, storyboardProfile }) {
      if (!endpoint) {
        throw new StoryboardClientError("no AI Gateway chat endpoint configured", "storyboard_unconfigured");
      }
      const headers = {};
      if (cleanString(opts.apiKey)) headers.authorization = `Bearer ${opts.apiKey}`;
      const ids = Array.isArray(sourceIds) ? sourceIds : [];
      const scriptEntries = Array.isArray(scriptContext?.entries) ? scriptContext.entries : [];
      const instruction =
        `You are a video production planner. Produce a concise script, a character continuity registry, and exactly ${shotCount} shots as ` +
        `JSON {"script":string,"characters":[{"id":string,"name":string,"description":string}],"shots":[{"prompt":string,"sourceCardIds":string[],"actId":string,"sceneId":string,"objective":string,"characterIds":string[],"characterStates":object,"environmentState":object,"dependencyShotIds":string[],"transitionReason":string,"scriptSegmentIds":string[],"scriptUnitIds":string[],"dialogueUnitIds":string[],"dramaticPurpose":string,"dramaticIntensity":number,"cinematography":{"shotSize":string,"cameraAngle":string,"cameraMovement":string,"composition":string,"transition":string,"lightingIntent":string,"audienceRationale":string},"actionBeatId":string,"cameraId":string,"spatialBlocking":{"characters":object,"background":object}}]}. Each shot's ` +
        `sourceCardIds MUST be drawn only from this evidence id set: ${JSON.stringify(ids)}. ` +
        `Treat the supplied script segments as immutable source material: preserve their plot order and dialogue wording, cite their segment/unit ids on shots, and do not invent replacement dialogue. ` +
        `Script segments: ${JSON.stringify(scriptEntries)}. ` +
        `Storyboard profile: ${JSON.stringify(storyboardProfile || {})}. Use only this cinematography grammar: ${JSON.stringify(CINEMATOGRAPHY_GRAMMAR)}. Establish a deliberate intensity and duration rhythm across shots for the stated audience and requirements. For shots in the same scene and action beat, preserve identical character coordinates and background state while varying only the requested camera coverage. ` +
        `Brief: ${cleanString(brief)}`;
      const completion = await postJson(
        fetchImpl,
        endpoint,
        {
          headers,
          body: {
            model,
            messages: [
              { role: "system", content: "Respond ONLY with the requested JSON object." },
              { role: "user", content: instruction },
            ],
            response_format: { type: "json_object" },
          },
        },
        StoryboardClientError,
      );
      const shots = parseStoryboardCompletion(completion);
      const creativePlan = parseCreativePlanCompletion(completion);
      if (shots.length === 0) {
        // No usable shots → fail closed so the harness emits its fallback (R7.5).
        throw new StoryboardClientError("model returned no usable shots", "storyboard_empty_plan");
      }
      return { shots, creativePlan };
    },
  };
}

export function createAiGatewayVisualReviewClient(opts = {}) {
  const fetchImpl = resolveFetch(opts.fetchImpl, StoryboardClientError);
  const endpoint = cleanString(opts.endpoint);
  const model = cleanString(opts.model) || DEFAULT_BYTEPLUS_CHAT_MODEL;
  return {
    isDeterministicMock: false,
    async review(packet = {}) {
      if (!endpoint) throw new StoryboardClientError("no AI Gateway chat endpoint configured", "visual_review_unconfigured");
      const headers = {};
      if (cleanString(opts.apiKey)) headers.authorization = `Bearer ${opts.apiKey}`;
      const assetUrl = cleanString(packet.assetUrl);
      const mediaContent = /\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(assetUrl)
        ? { type: "video_url", video_url: { url: assetUrl } }
        : { type: "image_url", image_url: { url: assetUrl, detail: "high" } };
      const completion = await postJson(fetchImpl, endpoint, {
        headers,
        body: {
          model,
          messages: [{
            role: "user",
            content: [
              {
                type: "text",
                text: `Review narrative and visual continuity. Return JSON {"narrativeScore":number,"visualScore":number,"findings":string[],"proposedPrompt":string}. Expected state: ${JSON.stringify(packet.expectedContinuity || {})}. Planned prompt: ${cleanString(packet.prompt)}`,
              },
              mediaContent,
            ],
          }],
          response_format: { type: "json_object" },
        },
      }, StoryboardClientError);
      const choice = Array.isArray(completion?.choices) ? completion.choices[0] : null;
      let result = choice?.message?.content;
      if (typeof result === "string") {
        try { result = JSON.parse(result); } catch { result = null; }
      }
      if (!result || typeof result !== "object") {
        throw new StoryboardClientError("visual review returned invalid JSON", "visual_review_invalid");
      }
      const usage = completion?.usage || {};
      const promptTokens = Number.isInteger(usage.prompt_tokens) ? usage.prompt_tokens : "unknown";
      const completionTokens = Number.isInteger(usage.completion_tokens) ? usage.completion_tokens : "unknown";
      return {
        narrativeScore: Number(result.narrativeScore),
        visualScore: Number(result.visualScore),
        findings: Array.isArray(result.findings) ? result.findings : [],
        proposedPrompt: cleanString(result.proposedPrompt),
        costLog: {
          model,
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          cache_hits: Number.isInteger(usage.cache_hits) ? usage.cache_hits : 0,
          estimated_cost_usd: Number(usage.estimated_cost_usd || completion?.estimated_cost_usd) || 0,
          incomplete: promptTokens === "unknown" || completionTokens === "unknown",
        },
      };
    },
    async reviewCandidate(packet = {}) {
      if (!endpoint) throw new StoryboardClientError("no AI Gateway chat endpoint configured", "image_consistency_review_unconfigured");
      const headers = {};
      if (cleanString(opts.apiKey)) headers.authorization = `Bearer ${opts.apiKey}`;
      const completion = await postJson(fetchImpl, endpoint, {
        headers,
        body: {
          model,
          messages: [{
            role: "user",
            content: [
              {
                type: "text",
                text: `Evaluate this candidate first frame against the planned references and spatial continuity. Return JSON {"identityScore":number,"environmentScore":number,"spatialScore":number,"temporalScore":number,"technicalScore":number,"findings":string[]}. Expected state: ${JSON.stringify(packet.expectedContinuity || {})}. Planned image prompt: ${cleanString(packet.prompt)}`,
              },
              { type: "image_url", image_url: { url: cleanString(packet.assetUrl), detail: "high" } },
            ],
          }],
          response_format: { type: "json_object" },
        },
      }, StoryboardClientError);
      const choice = Array.isArray(completion?.choices) ? completion.choices[0] : null;
      let result = choice?.message?.content;
      if (typeof result === "string") {
        try { result = JSON.parse(result); } catch { result = null; }
      }
      if (!result || typeof result !== "object") {
        throw new StoryboardClientError("image consistency review returned invalid JSON", "image_consistency_review_invalid");
      }
      const usage = completion?.usage || {};
      return {
        identityScore: Number(result.identityScore),
        environmentScore: Number(result.environmentScore),
        spatialScore: Number(result.spatialScore),
        temporalScore: Number(result.temporalScore),
        technicalScore: Number(result.technicalScore),
        findings: Array.isArray(result.findings) ? result.findings : [],
        costLog: {
          model,
          prompt_tokens: Number.isInteger(usage.prompt_tokens) ? usage.prompt_tokens : "unknown",
          completion_tokens: Number.isInteger(usage.completion_tokens) ? usage.completion_tokens : "unknown",
          cache_hits: Number.isInteger(usage.cache_hits) ? usage.cache_hits : 0,
          estimated_cost_usd: Number(usage.estimated_cost_usd || completion?.estimated_cost_usd) || 0,
          incomplete: !Number.isInteger(usage.prompt_tokens) || !Number.isInteger(usage.completion_tokens),
        },
      };
    },
  };
}

export function createAiGatewayImageGenerationClient(opts = {}) {
  const fetchImpl = resolveFetch(opts.fetchImpl, ImageGenerationClientError);
  const endpoint = cleanString(opts.endpoint);
  const model = cleanString(opts.model);
  return {
    isDeterministicMock: false,
    async generate({ runId, shotId, variantIndex, prompt, referenceImages } = {}) {
      if (!endpoint || !model) {
        throw new ImageGenerationClientError("image generation endpoint and model are required", "image_generation_unconfigured");
      }
      const headers = {};
      if (cleanString(opts.apiKey)) headers.authorization = `Bearer ${opts.apiKey}`;
      const completion = await postJson(fetchImpl, endpoint, {
        headers,
        body: {
          model,
          prompt: cleanString(prompt),
          n: 1,
          metadata: { run_id: cleanString(runId), shot_id: cleanString(shotId), variant_index: Number(variantIndex) || 0 },
          reference_images: (Array.isArray(referenceImages) ? referenceImages : []).map((reference) => cleanString(reference?.assetUrl)).filter(Boolean),
        },
      }, ImageGenerationClientError);
      const output = Array.isArray(completion?.data) ? completion.data[0] : Array.isArray(completion?.output) ? completion.output[0] : completion;
      const assetUrl = cleanString(output?.url || output?.assetUrl || output?.durableR2Url);
      if (!assetUrl) throw new ImageGenerationClientError("image generation returned no durable asset URL", "image_generation_no_asset");
      const usage = completion?.usage || {};
      return {
        assetUrl,
        durableR2Url: cleanString(output?.durableR2Url, assetUrl),
        provider: cleanString(completion?.provider || output?.provider),
        costLog: {
          model,
          prompt_tokens: Number.isInteger(usage.prompt_tokens) ? usage.prompt_tokens : "unknown",
          completion_tokens: Number.isInteger(usage.completion_tokens) ? usage.completion_tokens : "unknown",
          cache_hits: Number.isInteger(usage.cache_hits) ? usage.cache_hits : 0,
          estimated_cost_usd: Number(usage.estimated_cost_usd || completion?.estimated_cost_usd) || 0,
          incomplete: !Number.isInteger(usage.prompt_tokens) || !Number.isInteger(usage.completion_tokens),
        },
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Render — Strytree/BytePlus queue consumed by the async render harness.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a LIVE Strytree/BytePlus render-queue client exposing the
 * `dispatch({ shot, runId }) -> { assetUrl, costCents, provider, objectKey,
 * bucket }` seam `runRenderHarness` expects. Dispatches one generation request
 * to the payment-worker render endpoint and maps the response.
 *
 * Consumable via the task 12.4a async render entry point `runRenderHarnessAsync`
 * (the synchronous `runRenderHarness` cannot await a network seam).
 * `requiresAsyncHarness: true` marks that. Throwing routes the harness to its
 * zero-spend mock fallback (R8.5/R8.6).
 *
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {string} [opts.endpoint] render-queue dispatch URL
 * @param {string} [opts.apiKey] bearer token for the payment worker
 * @param {string} [opts.provider] provider identity recorded on the ledger event
 */
export function createStrytreeRenderQueueClient(opts = {}) {
  const fetchImpl = resolveFetch(opts.fetchImpl, RenderClientError);
  const endpoint = cleanString(opts.endpoint);
  const provider = cleanString(opts.provider) || "byteplus-video";
  return {
    isDeterministicMock: false,
    requiresAsyncHarness: true,
    provider,
    async dispatch({ shot, runId }) {
      if (!endpoint) {
        throw new RenderClientError("no render-queue endpoint configured", "render_unconfigured");
      }
      const headers = {};
      if (cleanString(opts.apiKey)) headers.authorization = `Bearer ${opts.apiKey}`;
      const body = await postJson(
        fetchImpl,
        endpoint,
        {
          headers,
          body: {
            runId: cleanString(runId),
            shotId: cleanString(shot?.shotId),
            prompt: resolveShotRenderPrompt(shot),
            imagePrompt: cleanString(shot?.imagePrompt),
            firstFrameImage: shot?.primaryReference?.assetUrl || undefined,
            referenceImages: Array.isArray(shot?.firstFrameReferences) ? shot.firstFrameReferences.map((reference) => reference.assetUrl).filter(Boolean) : [],
          },
        },
        RenderClientError,
      );
      const assetUrl = cleanString(body?.assetUrl);
      if (!assetUrl) {
        // No asset → treated by the harness as a no-asset failure (R8.6).
        throw new RenderClientError("render dispatch returned no assetUrl", "render_no_asset");
      }
      return {
        assetUrl,
        costCents: Number.isFinite(body?.costCents) ? Math.max(0, Math.round(body.costCents)) : 0,
        provider: cleanString(body?.provider) || provider,
        objectKey: cleanString(body?.objectKey) || null,
        bucket: cleanString(body?.bucket) || null,
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Commerce — Stripe via the payment worker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build LIVE commerce clients — `{ stripeClient, payoutClient, publishClient }`
 * — matching the seams `runCheckout`/`runPublish` expect:
 *   stripeClient.createCheckoutSession({...}) -> { session: { id, amountTotal, currency }, body }
 *   payoutClient.settle({...})                -> { settled, payoutState }
 *   publishClient.publish({ asset, runId })   -> { publishedUrl }
 *
 * Consumable via the task 12.4a async commerce entry points `runCheckoutAsync`
 * / `runPublishAsync` (the synchronous `runCheckout`/`runPublish` cannot await a
 * network seam). `requiresAsyncHarness: true` marks that. Throwing routes the
 * harness to its gate-rejection / R9.4 failure path.
 *
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {string} [opts.endpoint] payment-worker base URL
 * @param {string} [opts.apiKey] bearer token for the payment worker
 */
export function createStripeCommerceClients(opts = {}) {
  const fetchImpl = resolveFetch(opts.fetchImpl, CommerceClientError);
  const base = cleanString(opts.endpoint).replace(/\/+$/, "");
  const authHeaders = () => {
    const h = {};
    if (cleanString(opts.apiKey)) h.authorization = `Bearer ${opts.apiKey}`;
    return h;
  };
  const requireBase = () => {
    if (!base) throw new CommerceClientError("no payment-worker endpoint configured", "commerce_unconfigured");
    return base;
  };

  return {
    requiresAsyncHarness: true,
    stripeClient: {
      isDeterministicMock: false,
      async createCheckoutSession({ runId, assetUrl, priceId, amountTotal, currency }) {
        const body = await postJson(
          fetchImpl,
          `${requireBase()}/checkout/session`,
          {
            headers: authHeaders(),
            body: {
              runId: cleanString(runId),
              assetUrl: cleanString(assetUrl),
              priceId: cleanString(priceId) || undefined,
              amountTotal,
              currency,
            },
          },
          CommerceClientError,
        );
        const id = cleanString(body?.id || body?.sessionId);
        if (!id) {
          throw new CommerceClientError("checkout session create returned no id", "commerce_no_session");
        }
        return {
          session: {
            id,
            amountTotal: Number.isFinite(body?.amount_total ?? body?.amountTotal)
              ? (body.amount_total ?? body.amountTotal)
              : amountTotal,
            currency: cleanString(body?.currency || currency) || "usd",
          },
          body,
        };
      },
    },
    payoutClient: {
      isDeterministicMock: false,
      async settle({ sessionId, runId, amountTotal, currency }) {
        const body = await postJson(
          fetchImpl,
          `${requireBase()}/payout/settle`,
          {
            headers: authHeaders(),
            body: { sessionId: cleanString(sessionId), runId: cleanString(runId), amountTotal, currency },
          },
          CommerceClientError,
        );
        return {
          settled: Boolean(body?.settled),
          payoutState: cleanString(body?.payoutState) || "settled",
          confirmation: body?.confirmation ?? null,
        };
      },
    },
    publishClient: {
      isDeterministicMock: false,
      async publish({ asset, runId }) {
        const body = await postJson(
          fetchImpl,
          `${requireBase()}/publish`,
          {
            headers: authHeaders(),
            body: { runId: cleanString(runId), assetUrl: cleanString(asset?.assetUrl), shotId: cleanString(asset?.shotId) },
          },
          CommerceClientError,
        );
        const publishedUrl = cleanString(body?.publishedUrl) || cleanString(asset?.assetUrl);
        return { publishedUrl };
      },
    },
  };
}
