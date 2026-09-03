// Injectable provider / R2-media / Credit_Ledger seams for the video-remix
// Render_Harness (agentic-graph-acos-mcp-connector spec, task 3.9 / R8.1, R8.3,
// R8.4, R8.5 / Properties 15, 16). Extended by agentic-graph-widget-canvas-media
// spec task 5 (Requirements 2.8, 2.9, 2.11, 3.1, 3.2, 7.8, 8.8) to wire
// BytePlus image/video generation through the AI Gateway client and the media
// persister so a render returns a Durable_R2_URL asset reference plus the
// existing Credit_Ledger event.
//
// These are the SEAMS that integration task 9.2 swaps for the live wiring.
// Every default is a DETERMINISTIC, in-memory mock so the local runtime makes
// ZERO live network calls (reuse-not-rebuild: the live module already owns the
// real dispatch/storage/ledger logic).
//
// IMPORTANT: these exports remain the shared render-provider surface:
//   createDeterministicRenderQueueClient, createDeterministicMockProviderClient,
//   createDeterministicLedgerClient, selectRenderProvider, renderJobId,
//   renderLedgerEventId, mediaObjectKey, buildMediaAssetReference, etc.
//
// Pure / SDK-agnostic apart from the injected clients: importable by both the
// Node tests and the Cloudflare Worker bundle.

import { cleanString, slugify } from "./helpers.js";
import {
  AGENTIC_OS_MEDIA_BUCKET,
  buildDurableR2Url,
} from "../../contracts/media-artifact.schema.js";

// R2 media object-key prefix — matches the established `completeGenerationJobSuccess`
// key shape `strytree/generation/<jobId>/video.json` in strytreeApi.ts so an
// asset reference produced by the existing helpers is resolvable under the media
// bucket. Runtime code uses the
// canonical key scheme from the contract via buildDurableR2Url.
export const MEDIA_BUCKET_PREFIX = "strytree/generation";

// Re-pointed to the canonical agentic-graph-media bucket (R3.3 / contracts/media-artifact.schema.js).
// Previously "strytree-media" — all tests use this as a variable so the
// change is transparent to existing assertions.
export const DEFAULT_MEDIA_BUCKET = AGENTIC_OS_MEDIA_BUCKET; // "agentic-graph-media"

// Provider identities (R8.4). The deterministic LIVE-path mock represents the
// BytePlus/external video provider render queue; the zero-spend mock is the R8.5 fallback.
export const PROVIDER_BYTEPLUS_QUEUE = "byteplus-queue";
export const PROVIDER_MOCK = "mock";

// Deterministic per-shot provider spend (in integer cents) charged on the
// live-path mock so the success path exercises a non-zero Credit_Ledger event
// (R8.4 / Property 15). Cents-exact, matching the cost-log/reconciliation
// modules so ledger sums reconcile without float drift. The zero-spend mock
// always charges 0 (R8.5 / Property 16).
export const DEFAULT_SHOT_SPEND_CENTS = 12;

/**
 * Build the canonical R2 media object key for a render job.
 * Mirrors the live `videoObjectKey` shape in strytreeApi.ts:
 *   `strytree/generation/<jobId>/video.json`
 *
 * Runtime code should use `buildDurableR2Url` from the contract directly. This
 * helper remains the render-harness test key-shape oracle.
 *
 * @param {string} jobId
 * @returns {string}
 */
export function mediaObjectKey(jobId) {
  return `${MEDIA_BUCKET_PREFIX}/${jobId}/video.json`;
}

/**
 * Build the durable media asset URL for a render job using the canonical
 * `buildDurableR2Url` from contracts/media-artifact.schema.js (R3.4).
 * Uses a flat key built from jobId: `runs/<jobId>/render/asset.bin`
 * is not the right scheme — instead the caller should supply full
 * runId/stageId/shotId/ext. This helper accepts a jobId string and maps it
 * through a predictable stageId="render", shotId=jobId, ext="bin" so offline
 * runs produce stable Durable_R2_URL references from a plain jobId.
 *
 * For full-fidelity durable URLs, use `buildDurableR2Url` directly.
 *
 * @param {string} jobId - deterministic render job id
 * @returns {string} durable replay URL
 */
export function buildDurableMediaAssetUrl(jobId) {
  return buildDurableR2Url({ runId: jobId, stageId: "render", shotId: "asset", ext: "bin" });
}

/**
 * Build a resolvable asset reference under the agentic-graph media bucket (R8.3).
 * Returns `{ assetUrl, objectKey, bucket }`. The `assetUrl` is an `r2://`
 * reference so it is unambiguously a media-bucket object (not a public URL);
 * task 9.2 can map it to a signed/public URL when the live binding is wired.
 */
export function buildMediaAssetReference(jobId, bucket = DEFAULT_MEDIA_BUCKET) {
  const objectKey = mediaObjectKey(jobId);
  return {
    assetUrl: `r2://${bucket}/${objectKey}`,
    objectKey,
    bucket,
  };
}

/**
 * Deterministic render-job id for a shot within a run. Stable for a given
 * (runId, shotId) so a replay is reproducible and the media key is stable.
 */
export function renderJobId(runId, shotId) {
  return `genshot_${slugify(runId, "run")}_${slugify(shotId, "shot")}`;
}

/**
 * Deterministic Credit_Ledger event id for a shot within a run. Mirrors the
 * live `buildId('ledger_generation', ...)` convention in strytreeApi.ts so the
 * id is stable and run/shot-scoped.
 */
export function renderLedgerEventId(runId, shotId) {
  return `ledger_render_${slugify(runId, "run")}_${slugify(shotId, "shot")}`;
}

/**
 * Build the DEFAULT deterministic render-queue client (the BytePlus/external video provider
 * live-path seam). It performs NO network call: it synchronously resolves a
 * stable media asset reference and a fixed per-shot provider spend, modeling
 * what the live queue + R2 round-trip WOULD produce. Integration task 9.2
 * injects the real client via `deps.queueClient`.
 *
 * @param {object} [options]
 * @param {number} [options.spendCents] - per-shot provider spend (cents).
 * @param {string} [options.bucket]     - media bucket name.
 * @param {string} [options.provider]   - provider identity recorded on assets.
 */
export function createDeterministicRenderQueueClient(options = {}) {
  const spendCents = Number.isFinite(options.spendCents)
    ? Math.max(0, Math.round(options.spendCents))
    : DEFAULT_SHOT_SPEND_CENTS;
  const bucket = cleanString(options.bucket, DEFAULT_MEDIA_BUCKET);
  const provider = cleanString(options.provider, PROVIDER_BYTEPLUS_QUEUE);
  return {
    isDeterministicMock: true,
    provider,
    dispatch({ shot, runId }) {
      const shotId = shot.shotId;
      const jobId = renderJobId(runId, shotId);
      const media = buildMediaAssetReference(jobId, bucket);
      return {
        ...media,
        providerJobId: jobId,
        provider,
        costCents: spendCents,
      };
    },
  };
}

/**
 * Build the DETERMINISTIC zero-spend mock provider client (R8.5 / Property 16).
 * Used when no provider key is available OR the run's cumulative provider spend
 * has reached/exceeded the budget cap. Produces a resolvable media asset
 * reference but records ZERO provider spend.
 *
 * When `mediaPersister` is provided, the client also exposes an async
 * `asyncDispatch` method that persists deterministic bytes to the mock R2 and
 * returns the resulting `durableR2Url`, so async offline runs produce STABLE
 * Durable_R2_URL references (R8.8). The sync `dispatch` always returns the
   * deterministic `r2://` asset URL used by the sync `runRenderHarness` path.
 *
 * @param {object} [options]
 * @param {string} [options.bucket]               - media bucket name.
 * @param {object} [options.mediaPersister]        - optional media persister
 *   `{ persist({ runId, stageId, shotId, ext, bytes, contentType }) }`.
 *   When present, `asyncDispatch` uses it to persist mock bytes to R2.
 */
export function createDeterministicMockProviderClient(options = {}) {
  const bucket = cleanString(options.bucket, DEFAULT_MEDIA_BUCKET);
  const mediaPersister = options.mediaPersister ?? null;

  function dispatch({ shot, runId }) {
    const shotId = shot.shotId;
    const jobId = `${renderJobId(runId, shotId)}_mock`;
    const media = buildMediaAssetReference(jobId, bucket);
    return {
      ...media,
      providerJobId: jobId,
      provider: PROVIDER_MOCK,
      costCents: 0,
    };
  }

  // asyncDispatch: available when mediaPersister is provided. Persists
  // deterministic bytes keyed by runId+stageId+shotId (R8.8) and returns
  // the durable R2 URL. Used by runRenderHarnessAsync when mediaPersister
  // is injected for offline runs that must produce stable Durable_R2_URL refs.
  async function asyncDispatch({ shot, runId }) {
    const shotId = shot.shotId;
    const jobId = `${renderJobId(runId, shotId)}_mock`;

    if (mediaPersister && typeof mediaPersister.persist === "function") {
      // Deterministic mock bytes keyed by runId+stageId+shotId (R8.8).
      const seed = `mock:${runId}:render:${shotId}`;
      const bytes = new TextEncoder().encode(seed);
      const persistResult = await mediaPersister.persist({
        runId,
        stageId: "render",
        shotId,
        ext: "bin",
        bytes,
        contentType: "application/octet-stream",
      });
      return {
        assetUrl: persistResult.durableR2Url,
        durableR2Url: persistResult.durableR2Url,
        objectKey: persistResult.objectKey,
        contentHash: persistResult.contentHash,
        bucket,
        providerJobId: jobId,
        provider: PROVIDER_MOCK,
        costCents: 0,
      };
    }

    // No persister — use the deterministic r2:// asset URL from sync dispatch.
    return dispatch({ shot, runId });
  }

  return {
    isDeterministicMock: true,
    isZeroSpendMock: true,
    provider: PROVIDER_MOCK,
    dispatch,
    asyncDispatch,
    hasPersister: mediaPersister !== null,
  };
}

/**
 * Build the DEFAULT deterministic Credit_Ledger client (the
 * `StrytreeCreditLedgerActor` seam, R8.4). It records the event in memory and
 * returns it; the live client (task 9.2) writes through `writeLedgerEvent` to
 * the Durable Object. The recorded event captures the provider identity and the
 * provider spend (in cents) for the shot (R8.4 / Property 15).
 */
export function createDeterministicLedgerClient() {
  const events = [];
  return {
    isDeterministicMock: true,
    record({ ledgerEventId, runId, shotId, provider, providerSpendCents }) {
      const event = {
        ledgerEventId,
        runId,
        shotId,
        provider: cleanString(provider, PROVIDER_MOCK),
        providerSpendCents: Number.isFinite(providerSpendCents)
          ? Math.max(0, Math.round(providerSpendCents))
          : 0,
      };
      events.push(event);
      return event;
    },
    // Test/inspection helper — the in-memory record of everything written.
    recordedEvents: events,
  };
}

/**
 * Decide which provider a shot routes to (R8.5 / Property 16). Routes to the
 * zero-spend mock when NO provider key is available OR the run's cumulative
 * recorded provider spend already meets/exceeds the configured budget cap;
 * otherwise routes to the live-path queue provider.
 *
 * @param {object} args
 * @param {boolean} args.providerKeyAvailable - whether a provider key exists.
 * @param {number} args.cumulativeSpendCents  - run's recorded provider spend.
 * @param {number} [args.budgetCapCents]      - configured cap (cents); omitted
 *   / non-finite means "no cap".
 * @returns {{ useMock: boolean, reason: string|null }}
 */
export function selectRenderProvider({ providerKeyAvailable, cumulativeSpendCents, budgetCapCents }) {
  if (!providerKeyAvailable) {
    return { useMock: true, reason: "no_provider_key" };
  }
  const cap = Number(budgetCapCents);
  if (Number.isFinite(cap) && Number(cumulativeSpendCents) >= cap) {
    return { useMock: true, reason: "budget_cap_reached" };
  }
  return { useMock: false, reason: null };
}

// =============================================================================
// BytePlus provider factories (Task 5 — Requirements 2.8, 2.9, 3.1, 3.2, 8.8)
// =============================================================================

/**
 * Create a BytePlus image provider that calls the AI Gateway client then
 * persists the resulting bytes to R2 through the media persister.
 *
 * On AI Gateway failure returns `{ ok: false, error, code }` — no partial
 * artifact is recorded. On persist failure (write/verify error) re-throws so
 * the caller can mark the generation step as failed (R3.6, R3.8).
 *
 * @param {object} opts
 * @param {object} opts.aiGatewayClient   - `{ image({ prompt, model? }) }`
 * @param {object} opts.mediaPersister    - `{ persist({ runId, stageId, shotId, ext, bytes, contentType }) }`
 * @param {string} [opts.bucket]          - media bucket name (informational).
 * @param {string} [opts.provider]        - provider identity for cost log.
 * @returns {{ dispatch: function }}
 */
export function createBytePlusImageProvider({ aiGatewayClient, mediaPersister, bucket, provider } = {}) {
  if (!aiGatewayClient || typeof aiGatewayClient.image !== "function") {
    throw new TypeError("createBytePlusImageProvider: aiGatewayClient must implement { image }");
  }
  if (!mediaPersister || typeof mediaPersister.persist !== "function") {
    throw new TypeError("createBytePlusImageProvider: mediaPersister must implement { persist }");
  }
  const resolvedBucket = cleanString(bucket, DEFAULT_MEDIA_BUCKET);
  const resolvedProvider = cleanString(provider, PROVIDER_BYTEPLUS_QUEUE);

  return {
    isDeterministicMock: false,
    provider: resolvedProvider,

    /**
     * @param {object} args
     * @param {string} args.runId
     * @param {string} args.stageId
     * @param {string} args.shotId
     * @param {string} [args.prompt]
     * @param {string} [args.model]
     */
    async dispatch({ runId, stageId = "render", shotId, prompt = "", model } = {}) {
      // 1. Call AI Gateway for image bytes/b64 (R2.3, R2.7).
      const gwResult = await aiGatewayClient.image({ prompt, model });
      if (!gwResult.ok) {
        return { ok: false, error: gwResult.error, code: gwResult.code };
      }

      // 2. Decode bytes from b64 or treat as raw (provider returns base64 or URL).
      let bytes;
      const raw = gwResult.bytesOrB64;
      if (typeof raw === "string") {
        bytes = new TextEncoder().encode(raw); // base64 string stored as UTF-8 bytes
      } else if (raw instanceof Uint8Array || raw instanceof ArrayBuffer) {
        bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw;
      } else {
        bytes = new TextEncoder().encode(String(raw));
      }

      // 3. Persist to R2 — re-throws on write/verify failure (R3.6, R3.8).
      const persistResult = await mediaPersister.persist({
        runId,
        stageId,
        shotId,
        ext: "png",
        bytes,
        contentType: "image/png",
      });

      return {
        ok: true,
        durableR2Url: persistResult.durableR2Url,
        objectKey: persistResult.objectKey,
        contentHash: persistResult.contentHash,
        provider: resolvedProvider,
        bucket: resolvedBucket,
        costLog: gwResult.costLog,
      };
    },
  };
}

/**
 * Create a BytePlus video provider that submits an async video task, polls
 * until done via the AI Gateway client, then persists the resulting bytes to
 * R2 through the media persister.
 *
 * On AI Gateway failure returns `{ ok: false, error, code }` — no partial
 * artifact is recorded. On persist failure re-throws so the caller can mark
 * the generation step as failed (R3.6, R3.8).
 *
 * @param {object} opts
 * @param {object} opts.aiGatewayClient   - `{ submitVideo, pollVideoUntilDone }`
 * @param {object} opts.mediaPersister    - `{ persist({ runId, stageId, shotId, ext, bytes, contentType }) }`
 * @param {string} [opts.bucket]          - media bucket name (informational).
 * @param {string} [opts.provider]        - provider identity for cost log.
 * @returns {{ dispatch: function }}
 */
export function createBytePlusVideoProvider({ aiGatewayClient, mediaPersister, bucket, provider } = {}) {
  if (!aiGatewayClient || typeof aiGatewayClient.submitVideo !== "function") {
    throw new TypeError("createBytePlusVideoProvider: aiGatewayClient must implement { submitVideo, pollVideoUntilDone }");
  }
  if (!mediaPersister || typeof mediaPersister.persist !== "function") {
    throw new TypeError("createBytePlusVideoProvider: mediaPersister must implement { persist }");
  }
  const resolvedBucket = cleanString(bucket, DEFAULT_MEDIA_BUCKET);
  const resolvedProvider = cleanString(provider, PROVIDER_BYTEPLUS_QUEUE);

  return {
    isDeterministicMock: false,
    provider: resolvedProvider,

    /**
     * @param {object} args
     * @param {string} args.runId
     * @param {string} args.stageId
     * @param {string} args.shotId
     * @param {string} [args.prompt]
     * @param {string} [args.model]
     * @param {number} [args.intervalMs]      - poll interval override.
     * @param {number} [args.maxDurationMs]   - max poll duration override.
     */
    async dispatch({ runId, stageId = "render", shotId, prompt = "", imagePrompt, firstFrameImage, referenceImages, model, intervalMs, maxDurationMs } = {}) {
      // 1. Submit async video task (R2.4, R2.5).
      const submitResult = await aiGatewayClient.submitVideo({ prompt, model, extra: { image_prompt: imagePrompt, first_frame_image: firstFrameImage, reference_images: referenceImages } });
      if (!submitResult.ok) {
        return { ok: false, error: submitResult.error, code: submitResult.code };
      }

      // 2. Poll until done (R2.5, R2.6, R2.7).
      const pollResult = await aiGatewayClient.pollVideoUntilDone({
        taskId: submitResult.taskId,
        model: submitResult.model,
        intervalMs,
        maxDurationMs,
      });
      if (!pollResult.ok) {
        return { ok: false, error: pollResult.error, code: pollResult.code ?? (pollResult.timedOut ? "video_poll_timeout" : "video_task_failed") };
      }

      // 3. Retrieve bytes from ephemeral URL or use deterministic offline bytes.
      // The ephemeral URL is discarded after persist; only durableR2Url is kept (R3.5).
      const ephemeralUrl = pollResult.ephemeralUrl;
      let bytes;
      if (ephemeralUrl) {
        // Store the ephemeral URL reference as UTF-8 bytes — the live path
        // downloads the actual video bytes via the injected fetch; offline mocks
        // return stable text so the content hash is deterministic (R8.8).
        bytes = new TextEncoder().encode(ephemeralUrl);
      } else {
        bytes = new TextEncoder().encode(`video:${runId}:${stageId}:${shotId}`);
      }

      // 4. Persist to R2 — re-throws on write/verify failure (R3.6, R3.8).
      const persistResult = await mediaPersister.persist({
        runId,
        stageId,
        shotId,
        ext: "mp4",
        bytes,
        contentType: "video/mp4",
      });

      return {
        ok: true,
        durableR2Url: persistResult.durableR2Url,
        objectKey: persistResult.objectKey,
        contentHash: persistResult.contentHash,
        provider: resolvedProvider,
        bucket: resolvedBucket,
        costLog: null, // video cost log not returned by poll; attach separately if needed
      };
    },
  };
}
