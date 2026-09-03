// Video_Agent render -> edit execution helper for the Director.
//
// Keeps the top-level run manifest assembly lean while ensuring the normal
// Director path uses the shared Render_Harness and Editing_Stage harness instead
// of synthetic asset/edit references.

import { buildDurableR2Url, mediaObjectKey } from "../../contracts/media-artifact.schema.js";
import { validateCostLog } from "../../contracts/cost-log.schema.js";
import {
  creditLedgerEventFromRenderEvent,
  validateCreditLedgerEvent,
} from "../../contracts/credit-ledger.schema.js";
import { cleanString } from "./helpers.js";
import { RENDER_GATE_ID } from "./render-token.js";
import { runRenderHarness } from "./render-harness.js";
import { runEditingHarness, runEditingHarnessSync } from "./editing-harness.js";
import { FAILURE_REASON_EXHAUSTED, RUN_STATE_BLOCKED } from "./constants.js";
import { computeRetryBackoffMs, runWithBoundedRetry } from "./retry.js";
import { buildVisualReviewPackets, runVisualQualityMonitor } from "./visual-quality-monitor.js";
import { buildVideoAgentNegotiation } from "./agent-collaboration.js";
import { runImageConsistencyCheck } from "./image-consistency-check.js";
import { runParallelShotGeneration } from "./parallel-shot-generation.js";

const DEFAULT_ASSET_DURATION_MS = 1000;

function approvedRenderToken(renderApproved, nowMs) {
  if (!renderApproved) return undefined;
  return {
    gateId: RENDER_GATE_ID,
    issuedAt: nowMs,
    consumed: false,
    verified: true,
  };
}

function createManifestReferencePersister() {
  let persistCallCount = 0;
  return {
    get persistCallCount() {
      return persistCallCount;
    },
    persist({ runId, stageId, shotId, ext, contentType }) {
      persistCallCount += 1;
      const keyArgs = {
        runId: cleanString(runId, "video-remix-run"),
        stageId: cleanString(stageId, "edit"),
        shotId: cleanString(shotId, "manifest"),
        ext: cleanString(ext, "json"),
      };
      return {
        durableR2Url: buildDurableR2Url(keyArgs),
        objectKey: mediaObjectKey(keyArgs),
        contentType: cleanString(contentType, "application/json"),
      };
    },
  };
}

function normalizeAsset(asset) {
  const durationMs = Number.isFinite(Number(asset?.durationMs))
    ? Math.max(1, Math.round(Number(asset.durationMs)))
    : DEFAULT_ASSET_DURATION_MS;
  const assetUrl = cleanString(asset?.durableR2Url || asset?.assetUrl);
  return {
    ...asset,
    assetUrl,
    durableR2Url: cleanString(asset?.durableR2Url || assetUrl, assetUrl),
    storageUri: cleanString(asset?.storageUri || asset?.assetUrl || asset?.durableR2Url, assetUrl),
    durationMs,
  };
}

function assetDurationsByShot(assets) {
  return Object.fromEntries(assets.map((asset) => [asset.shotId, asset.durationMs]));
}

function mergeAssets(plannedShots, priorAssets, renderedAssets) {
  const latestByShotId = new Map();
  for (const asset of [...(Array.isArray(priorAssets) ? priorAssets : []), ...(Array.isArray(renderedAssets) ? renderedAssets : [])]) {
    const normalized = normalizeAsset(asset);
    if (normalized.shotId && normalized.assetUrl) latestByShotId.set(normalized.shotId, normalized);
  }
  return (Array.isArray(plannedShots) ? plannedShots : [])
    .map((shot) => latestByShotId.get(shot.shotId))
    .filter(Boolean);
}

function pendingShots(plannedShots, priorAssets) {
  const completed = new Set((Array.isArray(priorAssets) ? priorAssets : []).map((asset) => cleanString(asset?.shotId)));
  return (Array.isArray(plannedShots) ? plannedShots : []).filter((shot) => !completed.has(shot.shotId));
}

function completeResumeResult(priorAssets) {
  return {
    status: "complete",
    dispatched: false,
    resumed: true,
    assets: priorAssets,
    ledgerEvents: [],
    paidProviderCalls: 0,
    providerSpendCents: 0,
    failure: null,
  };
}

function pendingImageConsistency(plannedShots, policy = {}) {
  return {
    status: "pending",
    policy,
    selections: [],
    shots: plannedShots,
    issues: [{ severity: "info", code: "image_consistency_live_execution_pending" }],
    costLogs: [],
    costLogValidationFailures: [],
    candidateProviderCalls: 0,
    reviewProviderCalls: 0,
    retryTrace: [],
    ok: true,
  };
}

function buildDeferredEditResult(plannedShots, state) {
  return {
    status: state === "awaiting_review" ? "awaiting_review" : "blocked",
    blocksPublish: true,
    manifest: {
      entries: (Array.isArray(plannedShots) ? plannedShots : []).map((shot) => ({
        shotId: shot.shotId,
        assetUrl: "",
      })),
    },
    persistCallCount: 0,
  };
}

function retryingQueueClient(queueClient, maxIterations, retryTrace) {
  if (!queueClient || typeof queueClient.dispatch !== "function") return queueClient;
  return {
    ...queueClient,
    async dispatch(args) {
      const result = await runWithBoundedRetry(() => queueClient.dispatch(args), {
        maxIterations,
        onRetry: (entry) => retryTrace.push({ shotId: cleanString(args?.shot?.shotId), ...entry }),
      });
      retryTrace.push(...result.attempts.filter((entry) => entry.status === "complete").map((entry) => ({
        shotId: cleanString(args?.shot?.shotId),
        ...entry,
      })));
      if (!result.ok) throw result.error;
      return result.value;
    },
  };
}

function buildVideoCostLog(renderResult) {
  const estimatedCostUsd = Number(((Number(renderResult?.providerSpendCents) || 0) / 100).toFixed(2));
  return {
    model: "byteplus-video",
    prompt_tokens: "unknown",
    completion_tokens: "unknown",
    cache_hits: 0,
    estimated_cost_usd: estimatedCostUsd,
    incomplete: true,
  };
}

function buildVideoAccounting(renderResult, qualityReview = null, imageConsistency = null) {
  const imageCostLogs = Array.isArray(imageConsistency?.costLogs) ? imageConsistency.costLogs : [];
  if (!renderResult || renderResult.dispatched !== true) {
    return {
      costLogs: [...imageCostLogs, ...(qualityReview?.costLogs || [])],
      costLogValidationFailures: [...(imageConsistency?.costLogValidationFailures || []), ...(qualityReview?.costLogValidationFailures || [])],
      creditLedgerEvents: [],
      creditLedgerValidationFailures: [],
    };
  }
  const costLog = buildVideoCostLog(renderResult);
  const costLogValidation = validateCostLog(costLog);
  const creditLedgerEvents = (Array.isArray(renderResult.ledgerEvents) ? renderResult.ledgerEvents : [])
    .map(creditLedgerEventFromRenderEvent);
  const creditLedgerValidationFailures = creditLedgerEvents
    .map((event) => ({ event, validation: validateCreditLedgerEvent(event) }))
    .filter(({ validation }) => !validation.valid);
  const qualityCostLogs = Array.isArray(qualityReview?.costLogs) ? qualityReview.costLogs : [];
  return {
    costLogs: [...(costLogValidation.valid ? [costLog] : []), ...imageCostLogs, ...qualityCostLogs],
    costLogValidationFailures: [
      ...(costLogValidation.valid ? [] : [{ costLog, validation: costLogValidation }]),
      ...(imageConsistency?.costLogValidationFailures || []),
      ...(qualityReview?.costLogValidationFailures || []),
    ],
    creditLedgerEvents,
    creditLedgerValidationFailures,
  };
}

export function executeVideoAgentStages({
  liveRequested,
  state,
  renderApproved,
  plannedShots,
  runId,
  nowMs,
  budgetUsd,
  renderDeps,
  mediaPersister,
  maxIterations,
  priorAssets = [],
  renderEnabled = true,
  narrative,
  continuity,
  storyboardDesign,
  multiCameraDesign,
  referenceSelection,
  imageGeneration,
  imageConsistencyPolicy,
  parallelShotPlan,
  qualityPolicy,
} = {}) {
  const shotsToRender = pendingShots(plannedShots, priorAssets);
  const imageConsistency = pendingImageConsistency(plannedShots, imageConsistencyPolicy);
  const shouldRender = renderEnabled && liveRequested && state === "complete" && renderApproved && imageConsistency.ok;
  let renderResult = null;
  let renderedAssets = [];

  if (shouldRender && shotsToRender.length > 0) {
    renderResult = runRenderHarness(
      {
        shots: shotsToRender,
        renderGateToken: approvedRenderToken(renderApproved, nowMs),
      },
      {
        runId,
        now: nowMs,
        providerKeyAvailable: false,
        budgetCapCents: Math.round((Number(budgetUsd) || 0) * 100),
        ...(renderDeps && typeof renderDeps === "object" ? renderDeps : {}),
      },
    );
    renderedAssets = (Array.isArray(renderResult.assets) ? renderResult.assets : []).map(normalizeAsset);
  } else if (shouldRender && shotsToRender.length === 0 && priorAssets.length > 0) {
    renderResult = completeResumeResult(priorAssets);
  }
  const assets = mergeAssets(plannedShots, priorAssets, renderedAssets);

  const qualityReview = {
    status: "unverified",
    findings: [{ code: "vlm_review_client_unavailable" }],
    proposedRevisions: {},
    paidProviderCalls: 0,
    costLogs: [],
    costLogValidationFailures: [],
    retryTrace: [],
  };
  const negotiation = buildVideoAgentNegotiation({ narrative, continuity, storyboardDesign, multiCameraDesign, referenceSelection, imageGeneration, imageConsistency, parallelShotPlan, qualityReview, maxRounds: qualityPolicy?.maxNegotiationRounds });
  const persister = mediaPersister || createManifestReferencePersister();
  const editResult = !renderEnabled && assets.length === 0
    ? buildDeferredEditResult(plannedShots, state)
    : runEditingHarnessSync(
        {
          plannedShots,
          renderAssets: assets,
          assetDurationsMs: assetDurationsByShot(assets),
        },
        { runId, mediaPersister: persister },
      );

  const editedUrl = editResult.status === "complete"
    ? cleanString(editResult.editedVideoReference?.durableR2Url)
    : "";
  const publishedUrls = editedUrl ? [editedUrl] : [];
  const videoAccounting = buildVideoAccounting(renderResult, qualityReview, imageConsistency);

  return {
    renderResult,
    assets,
    editResult,
    publishedUrls,
    providerSpendCents: Number(renderResult?.providerSpendCents) || 0,
    renderProviderCalls: Number(renderResult?.paidProviderCalls) || 0,
    videoAccounting,
    manifestPersistCallCount: Number(editResult.persistCallCount || persister.persistCallCount || 0),
    executionFailure: buildVideoAgentExecutionFailure({ renderResult, editResult, qualityReview, maxIterations }),
    retryTrace: [],
    qualityReview,
    imageConsistency,
    parallelShotExecution: { ...(parallelShotPlan?.coverage || {}), batches: parallelShotPlan?.batches || [], maxObservedConcurrency: 1, status: "sync_serial" },
    negotiation,
    qualityProviderCalls: 0,
    imageCandidateProviderCalls: 0,
    imageReviewProviderCalls: 0,
  };
}

export async function executeVideoAgentStagesAsync({
  liveRequested,
  state,
  renderApproved,
  plannedShots,
  runId,
  nowMs,
  budgetUsd,
  renderDeps,
  mediaPersister,
  maxIterations,
  priorAssets = [],
  renderEnabled = true,
  narrative,
  continuity,
  storyboardDesign,
  multiCameraDesign,
  referenceSelection,
  imageGeneration,
  imageConsistencyPolicy,
  parallelShotPlan,
  qualityPolicy,
  imageGenerationClient,
  visualReviewClient,
  priorImageConsistency,
  retryWait,
} = {}) {
  let shotsToRender = pendingShots(plannedShots, priorAssets);
  const shouldRender = renderEnabled && liveRequested && state === "complete" && renderApproved;
  let executionShots = plannedShots;
  let renderResult = null;
  let renderedAssets = [];
  const retryTrace = [];

  const imageConsistency = shouldRender
    ? await runImageConsistencyCheck({
        plannedShots: shotsToRender,
        imageClient: imageGenerationClient,
        reviewClient: visualReviewClient,
        priorResult: priorImageConsistency,
        policy: imageConsistencyPolicy,
        runId,
        maxIterations,
        wait: retryWait,
      })
    : {
        status: "skipped",
        policy: imageConsistencyPolicy || {},
        selections: [],
        shots: shotsToRender,
        issues: [],
        costLogs: [],
        candidateProviderCalls: 0,
        reviewProviderCalls: 0,
        retryTrace: [],
        ok: true,
      };
  if (imageConsistency.shots.length) {
    const selectedByShotId = new Map(imageConsistency.shots.map((shot) => [shot.shotId, shot]));
    executionShots = plannedShots.map((shot) => selectedByShotId.get(shot.shotId) || shot);
    shotsToRender = executionShots.filter((shot) => selectedByShotId.has(shot.shotId));
  }
  retryTrace.push(...imageConsistency.retryTrace);
  const consistencyAllowsRender = imageConsistency.ok !== false;

  if (shouldRender && consistencyAllowsRender && shotsToRender.length > 0) {
    const retryRenderDeps = renderDeps && typeof renderDeps === "object"
      ? { ...renderDeps, queueClient: retryingQueueClient(renderDeps.queueClient, maxIterations, retryTrace) }
      : renderDeps;
    renderResult = await runParallelShotGeneration({
      shots: shotsToRender,
      plan: parallelShotPlan,
      renderDeps: { providerKeyAvailable: false, ...(retryRenderDeps && typeof retryRenderDeps === "object" ? retryRenderDeps : {}) },
      runId,
      now: nowMs,
      budgetCapCents: Math.round((Number(budgetUsd) || 0) * 100),
      renderTokenFactory: () => approvedRenderToken(renderApproved, nowMs),
    });
    renderedAssets = (Array.isArray(renderResult.assets) ? renderResult.assets : []).map(normalizeAsset);
  } else if (shouldRender && consistencyAllowsRender && shotsToRender.length === 0 && priorAssets.length > 0) {
    renderResult = completeResumeResult(priorAssets);
  }
  const assets = mergeAssets(executionShots, priorAssets, renderedAssets);

  const qualityReview = await runVisualQualityMonitor({
    packets: buildVisualReviewPackets({ plannedShots: executionShots, assets, continuity }),
    reviewClient: visualReviewClient,
    policy: qualityPolicy,
    maxIterations,
    wait: retryWait,
  });
  const negotiation = buildVideoAgentNegotiation({ narrative, continuity, storyboardDesign, multiCameraDesign, referenceSelection, imageGeneration, imageConsistency, parallelShotPlan, qualityReview, maxRounds: qualityPolicy?.maxNegotiationRounds });
  const qualityBlocksEdit = ["revise", "failed"].includes(qualityReview.status) || imageConsistency.ok === false;
  const persister = mediaPersister || createManifestReferencePersister();
  const editResult = qualityBlocksEdit
    ? { ...buildDeferredEditResult(executionShots, "awaiting_review"), status: "awaiting_quality_revision" }
    : !renderEnabled && assets.length === 0
      ? buildDeferredEditResult(executionShots, state)
    : await runEditingHarness(
        {
          plannedShots: executionShots,
          renderAssets: assets,
          assetDurationsMs: assetDurationsByShot(assets),
        },
        { runId, mediaPersister: persister },
      );

  const editedUrl = editResult.status === "complete"
    ? cleanString(editResult.editedVideoReference?.durableR2Url)
    : "";
  const publishedUrls = editedUrl ? [editedUrl] : [];
  const videoAccounting = buildVideoAccounting(renderResult, qualityReview, imageConsistency);

  return {
    renderResult,
    plannedShots: executionShots,
    assets,
    editResult,
    publishedUrls,
    providerSpendCents: Number(renderResult?.providerSpendCents) || 0,
    renderProviderCalls: Number(renderResult?.paidProviderCalls) || 0,
    videoAccounting,
    manifestPersistCallCount: Number(editResult.persistCallCount || persister.persistCallCount || 0),
    executionFailure: buildVideoAgentExecutionFailure({ renderResult, editResult, imageConsistency, qualityReview, maxIterations }),
    retryTrace: [...retryTrace, ...qualityReview.retryTrace],
    imageConsistency,
    parallelShotExecution: renderResult?.parallelExecution || { batches: [], maxObservedConcurrency: 0, status: "not_executed" },
    qualityReview,
    negotiation,
    qualityProviderCalls: qualityReview.paidProviderCalls,
    imageCandidateProviderCalls: imageConsistency.candidateProviderCalls,
    imageReviewProviderCalls: imageConsistency.reviewProviderCalls,
  };
}

export function buildVideoAgentExecutionFailure({ renderResult, editResult, qualityReview, maxIterations } = {}) {
  const stageId = renderResult?.status === "failed" || renderResult?.status === "rejected"
    ? "render"
    : qualityReview?.status === "failed"
      ? "visual_review"
    : editResult?.status === "failed" || editResult?.status === "rejected"
      ? "edit"
      : "";
  if (!stageId) return null;
  const finalRetryCount = Math.max(1, Math.floor(Number(maxIterations) || 1));
  return {
    toolName: `agentic-graph.video_remix.${stageId}`,
    stageId,
    failureKind: `${stageId}_stage_failure_exhausted`,
    retryCount: finalRetryCount,
    finalRetryCount,
    backoffMs: computeRetryBackoffMs(finalRetryCount - 1),
    runState: RUN_STATE_BLOCKED,
    exhausted: true,
    reason: FAILURE_REASON_EXHAUSTED,
    resolution: "failed closed: Run_State blocked, downstream stages halted, prior artifacts preserved",
  };
}
