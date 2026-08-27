// Env-gated live/mock stage-client resolver for the video-remix Director
// (agenticgraph-acos-mcp-connector runtime-readiness path, task 12.5).
//
// PURPOSE: decide — from the deployment environment — whether each stage runs
// against a LIVE provider client or the deterministic in-memory MOCK that
// Sections 1–10 ship. The rule is fail-safe and explicit:
//
//   * LIVE only when the operator opts in (`AGENTICGRAPH_LIVE_CLIENTS` truthy) OR a
//     provider credential is present (e.g. `EXA_API_KEY`). Otherwise every
//     client is null and the Director/harness uses its deterministic mock, so
//     local runs and un-configured deploys make ZERO live/paid calls.
//   * The control-plane stack boundary (R11) is unchanged: model keys live only
//     on this (Cloudflare control-plane) tier; the AWS/Vercel product tiers
//     never receive these clients.
//
// CURRENT COVERAGE: the Exa research client (task 12.2) is live-wireable now.
// Storyboard (BytePlus chat), Render (Strytree/BytePlus queue), and Commerce
// (Stripe) live clients are task 12.4 — their slots are present and return null
// until 12.4 lands, so they transparently fall back to the existing mocks.
//
// This module is pure apart from the injected `fetchImpl`, so it is importable
// by both the Cloudflare Worker bundle and the Node tests, and unit-testable
// with a fake `fetch` (ZERO live calls).

import { createExaMcpClient } from "./research-exa-client.js";
import { runResearchHarness } from "./research-harness.js";
import {
  createByteplusStoryboardClient,
  createAiGatewayVisualReviewClient,
  createAiGatewayImageGenerationClient,
  createStrytreeRenderQueueClient,
  createStripeCommerceClients,
} from "./live-stage-clients.js";
import { createAiGatewayClient } from "./ai-gateway-client.js";
import {
  createBytePlusVideoProvider,
  DEFAULT_SHOT_SPEND_CENTS,
  PROVIDER_BYTEPLUS_QUEUE,
} from "./render-providers.js";
import { createMediaPersister } from "./media-persist.js";
import { resolveShotRenderPrompt } from "./expressive-storyboard.js";

const DIRECTOR_TOOL_NAME = "agenticgraph.video_remix.run";

/** Truthy-string check for env flags (`"1"`, `"true"`, `"yes"`). */
function isTruthyFlag(value) {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Return a trimmed non-empty env string, or undefined when absent/blank. */
function cleanEnv(value) {
  const v = typeof value === "string" ? value.trim() : "";
  return v.length > 0 ? v : undefined;
}

export function adaptBytePlusVideoProviderToRenderClient(videoProvider, options = {}) {
  if (!videoProvider || typeof videoProvider.dispatch !== "function") {
    throw new TypeError("adaptBytePlusVideoProviderToRenderClient: videoProvider must implement { dispatch }");
  }
  const dispatchLog = [];
  return {
    isDeterministicMock: false,
    provider: videoProvider.provider || PROVIDER_BYTEPLUS_QUEUE,
    maxCostCentsPerShot: DEFAULT_SHOT_SPEND_CENTS,
    requiresAsyncHarness: true,
    dispatchLog,
    async dispatch({ shot, runId } = {}) {
      const shotId = cleanEnv(shot?.shotId || shot?.id);
      const prompt = resolveShotRenderPrompt(shot);
      const referenceImages = Array.isArray(shot?.firstFrameReferences) ? shot.firstFrameReferences.map((reference) => reference.assetUrl).filter(Boolean) : [];
      if (shot?.unplanned === true) {
        const event = { type: "unplannedShotDispatch", runId, shotId, prompt };
        dispatchLog.push(event);
        if (typeof options.onUnplannedShotDispatch === "function") {
          options.onUnplannedShotDispatch(event);
        }
      }
      const result = await videoProvider.dispatch({
        runId,
        stageId: "render",
        shotId,
        prompt,
        imagePrompt: cleanEnv(shot?.imagePrompt),
        firstFrameImage: cleanEnv(shot?.primaryReference?.assetUrl),
        referenceImages,
        model: shot?.model,
      });
      if (!result?.ok) {
        throw new Error(cleanEnv(result?.error) || cleanEnv(result?.code) || "byteplus_video_dispatch_failed");
      }
      return {
        assetUrl: result.durableR2Url,
        durableR2Url: result.durableR2Url,
        objectKey: result.objectKey,
        bucket: result.bucket,
        provider: result.provider || PROVIDER_BYTEPLUS_QUEUE,
        costCents: DEFAULT_SHOT_SPEND_CENTS,
      };
    },
  };
}

/**
 * Resolve the set of stage clients from an environment object. Returns a
 * descriptor `{ live, mode, exaClient, storyboardClient, renderClient,
 * commerceClient }` where a null client means "use the deterministic mock".
 *
 * LIVE is enabled when `AGENTICGRAPH_LIVE_CLIENTS` is truthy OR an `EXA_API_KEY` is
 * present. Exa connection mode follows the SSOT: `api-key-header` when a key is
 * supplied, otherwise `hosted-free`.
 *
 * @param {Record<string, string|undefined>} [env] environment (Worker `env` or
 *   `process.env`); pass the Worker binding env in the control plane.
 * @param {object} [deps]
 * @param {typeof fetch} [deps.fetchImpl] fetch implementation injected into live
 *   clients (default global `fetch`); tests pass a fake.
 * @param {object} [deps.mediaPersister] existing media persister for render outputs.
 * @param {object} [deps.r2Client] existing R2 binding used to construct the media persister.
 * @returns {{ live: boolean, mode: "live"|"mock", exaClient: object|null,
 *   storyboardClient: null, renderClient: null, commerceClient: null }}
 */
export function resolveStageClients(env = {}, deps = {}) {
  const source = env && typeof env === "object" ? env : {};
  const exaApiKey =
    typeof source.EXA_API_KEY === "string" && source.EXA_API_KEY.length > 0
      ? source.EXA_API_KEY
      : undefined;
  const live = isTruthyFlag(source.AGENTICGRAPH_LIVE_CLIENTS) || Boolean(
    exaApiKey || cleanEnv(source.AI_GATEWAY_CHAT_URL) || cleanEnv(source.AI_GATEWAY_IMAGE_URL) || cleanEnv(source.AI_GATEWAY_VIDEO_URL),
  );

  if (!live) {
    return {
      live: false,
      mode: "mock",
      exaClient: null,
      storyboardClient: null,
      visualReviewClient: null,
      imageGenerationClient: null,
      renderClient: null,
      commerceClient: null,
    };
  }

  const exaClient = createExaMcpClient({
    fetchImpl: deps.fetchImpl,
    apiKey: exaApiKey,
    endpoint: source.EXA_MCP_ENDPOINT,
  });

  // Storyboard live client (task 12.4) — BytePlus chat via Cloudflare AI
  // Gateway. USABLE NOW: runStoryboardHarness awaits plan(). Constructed only
  // when a gateway chat endpoint is configured; null otherwise (mock fallback).
  const aiGatewayChatUrl = cleanEnv(source.AI_GATEWAY_CHAT_URL);
  const storyboardClient = aiGatewayChatUrl
    ? createByteplusStoryboardClient({
        fetchImpl: deps.fetchImpl,
        endpoint: aiGatewayChatUrl,
        model: cleanEnv(source.BYTEPLUS_CHAT_MODEL),
        apiKey: cleanEnv(source.BYTEPLUS_API_KEY) || cleanEnv(source.AI_GATEWAY_TOKEN),
      })
    : null;
  const visualReviewClient = aiGatewayChatUrl
    ? createAiGatewayVisualReviewClient({
        fetchImpl: deps.fetchImpl,
        endpoint: aiGatewayChatUrl,
        model: cleanEnv(source.BYTEPLUS_CHAT_MODEL),
        apiKey: cleanEnv(source.BYTEPLUS_API_KEY) || cleanEnv(source.AI_GATEWAY_TOKEN),
      })
    : null;
  const aiGatewayImageUrl = cleanEnv(source.AI_GATEWAY_IMAGE_URL);
  const imageGenerationModel = cleanEnv(source.IMAGE_GENERATION_MODEL);
  const imageGenerationClient = aiGatewayImageUrl && imageGenerationModel
    ? createAiGatewayImageGenerationClient({
        fetchImpl: deps.fetchImpl,
        endpoint: aiGatewayImageUrl,
        model: imageGenerationModel,
        apiKey: cleanEnv(source.IMAGE_GENERATION_API_KEY) || cleanEnv(source.AI_GATEWAY_TOKEN),
      })
    : null;

  let renderClient = null;
  const renderProvider = cleanEnv(source.RENDER_PROVIDER)?.toLowerCase();
  if (renderProvider === "strytree") {
    const renderUrl = cleanEnv(source.STRYTREE_RENDER_URL);
    renderClient = renderUrl
      ? createStrytreeRenderQueueClient({
          fetchImpl: deps.fetchImpl,
          endpoint: renderUrl,
          apiKey: cleanEnv(source.STRYTREE_API_KEY),
        })
      : null;
  } else {
    const aiGatewayVideoUrl = cleanEnv(source.AI_GATEWAY_VIDEO_URL);
    const bytePlusKey = cleanEnv(source.BYTEPLUS_API_KEY) || cleanEnv(source.AI_GATEWAY_TOKEN);
    if (aiGatewayVideoUrl && bytePlusKey) {
      const mediaPersister = deps.mediaPersister || (
        deps.r2Client
          ? createMediaPersister({ r2Client: deps.r2Client, bucket: cleanEnv(source.AGENTICGRAPH_MEDIA_BUCKET) })
          : null
      );
      renderClient = mediaPersister
        ? adaptBytePlusVideoProviderToRenderClient(createBytePlusVideoProvider({
            aiGatewayClient: createAiGatewayClient({
              fetchImpl: deps.fetchImpl,
              gatewayBaseUrl: aiGatewayVideoUrl,
              accountId: cleanEnv(source.CLOUDFLARE_ACCOUNT_ID),
            }),
            mediaPersister,
            provider: PROVIDER_BYTEPLUS_QUEUE,
          }))
        : null;
    }
  }

  // Commerce live clients — Stripe via the payment worker. Constructed only
  // when its endpoint is set and consumed by the async Director path.
  const paymentUrl = cleanEnv(source.AGENTICGRAPH_PAYMENT_URL);
  const commerceClient = paymentUrl
    ? createStripeCommerceClients({
        fetchImpl: deps.fetchImpl,
        endpoint: paymentUrl,
        apiKey: cleanEnv(source.AGENTICGRAPH_PAYMENT_API_KEY),
      })
    : null;

  return {
    live: true,
    mode: "live",
    exaClient,
    // Async Director seams consume the live storyboard/render/commerce clients
    // when the matching configuration is present.
    storyboardClient,
    visualReviewClient,
    imageGenerationClient,
    renderClient,
    commerceClient,
  };
}

/**
 * Map env-resolved live stage clients into the `deps` shape the Director gate
 * enforcers (`enforceRenderGate` / `enforceCheckoutGate`, which call the async
 * harness variants) consume — so a deployed, gated render/checkout executes
 * against the live Render/Commerce clients when configured, and against the
 * deterministic mocks otherwise (task 12.5 extension; task 12.4a async path).
 *
 * Render: a live render client is injected as `queueClient`, and
 * `providerKeyAvailable` is set true (a configured live queue implies a provider
 * key) so routing uses the live path rather than the zero-spend mock. Commerce:
 * the live `stripeClient` / `payoutClient` / `publishClient` are injected. When
 * no live clients are present the base deps pass through unchanged (mock path).
 *
 * @param {ReturnType<typeof resolveStageClients>} clients
 * @param {object} [base] base harness deps merged into both (e.g. `{ now, runId }`)
 * @returns {{ renderDeps: object, checkoutDeps: object }}
 */
export function resolveGateClientDeps(clients, base = {}) {
  const renderDeps = { ...base };
  const checkoutDeps = { ...base };
  if (clients && clients.live) {
    if (clients.renderClient) {
      renderDeps.queueClient = clients.renderClient;
      renderDeps.providerKeyAvailable = true;
    }
    if (clients.commerceClient) {
      if (clients.commerceClient.stripeClient) checkoutDeps.stripeClient = clients.commerceClient.stripeClient;
      if (clients.commerceClient.payoutClient) checkoutDeps.payoutClient = clients.commerceClient.payoutClient;
      if (clients.commerceClient.publishClient) checkoutDeps.publishClient = clients.commerceClient.publishClient;
    }
  }
  return { renderDeps, checkoutDeps };
}

/**
 * Build an async args-resolver for the McpAgent dispatch boundary (task 12.5).
 *
 * For a Director (`agenticgraph.video_remix.run`) call, when a live Exa client is
 * configured and the caller did NOT already supply `sourceCards`, it runs the
 * Research_Harness against the live client and injects the resulting cards as
 * `args.sourceCards` so the synchronous Director builds its Evidence_Pack from
 * LIVE sources. Everything else passes through unchanged.
 *
 * Fail-safe: on any research failure / weak signal the args are returned
 * unchanged (no fabricated sources), so the Director's existing weak-signal
 * halt path (R4.5 / R6.5) governs. For non-Director tools, non-live envs, or
 * caller-supplied `sourceCards`, this is the identity function. It NEVER throws.
 *
 * @param {ReturnType<typeof resolveStageClients>} clients
 * @param {object} [opts]
 * @param {(input: object, deps: object) => Promise<object>} [opts.runResearch]
 *   research-harness runner seam (default `runResearchHarness`); tests inject.
 * @param {number} [opts.maxResults] research max results (default 10)
 * @returns {(toolName: string, args: object) => Promise<object>}
 */
export function createLiveArgsResolver(clients, opts = {}) {
  const runResearch =
    typeof opts.runResearch === "function" ? opts.runResearch : runResearchHarness;

  return async function resolveLiveArgs(toolName, args = {}) {
    const input = args && typeof args === "object" ? args : {};
    // Only the Director run benefits from live source pre-resolution.
    if (toolName !== DIRECTOR_TOOL_NAME) return input;
    if (!clients || !clients.live || !clients.exaClient) return input;
    // Respect caller-supplied evidence — never override an explicit sourceCards.
    if (Array.isArray(input.sourceCards) && input.sourceCards.length > 0) return input;
    if (typeof input.referenceUrl !== "string" || input.referenceUrl.length === 0) {
      return input;
    }

    try {
      const research = await runResearch(
        {
          referenceUrl: input.referenceUrl,
          query: typeof input.brief === "string" ? input.brief : undefined,
          maxResults: Number.isFinite(opts.maxResults) ? opts.maxResults : 10,
        },
        { exaClient: clients.exaClient },
      );
      const sources = research?.evidencePack?.sources;
      // Inject live sources only on the success path; a degraded/weak result
      // returns empty sources and we leave args untouched (no fabrication).
      if (Array.isArray(sources) && sources.length > 0) {
        return { ...input, sourceCards: sources };
      }
      return input;
    } catch {
      // Live research failure must never break the run; fall back to mock/Director.
      return input;
    }
  };
}
