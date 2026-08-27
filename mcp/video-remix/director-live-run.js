// Async Director live stage-execution path (agenticgraph-acos-mcp-connector spec,
// task 12.5a). Composes the already-verified Director gate enforcers
// (`enforceDirectorRenderGate` / `enforceDirectorCheckoutGate`, which call the
// async harness variants from task 12.4a) with the env-gated live-client → deps
// mapping (`resolveGateClientDeps`, task 12.5) into ONE async entry point that
// executes the gated render → checkout spend boundaries against LIVE clients
// when configured, and against the deterministic mocks otherwise.
//
// WHY THIS IS SEPARATE FROM `runVideoRemix`: the synchronous `runVideoRemix`
// builds the planning Run_Manifest (validation, approval gates, evidence,
// storyboard, planned shots, dry-run/halt resolution) and SYNTHESIZES the
// render/checkout artifacts — it is the single source of truth for the contract
// tests and the dry-run/gated-halt behavior, and stays synchronous. This module
// is the DEPLOYED, approval-gated EXECUTION layer that runs on top of that base
// manifest: given verified Approval_Tokens it executes the real spend-bearing
// stages and merges the results back into the manifest. It performs ZERO live
// network calls unless a live client is injected via `clients` (env-resolved by
// `resolveStageClients`), so it is fully unit-testable with mocks.
//
// Boundary preserved (R4.2 / R4.3 / R9.3 / Property 1 / Property 17): the gate
// enforcers own the single spend-boundary verification; a missing/invalid token
// blocks the stage, records the rejection, and leaves spend-bearing state
// unchanged. This module never re-verifies and never bypasses a gate.

import {
  enforceDirectorRenderGate,
  enforceDirectorCheckoutGate,
} from "./director-gates.js";
import { RUN_STATE_BLOCKED, MODEL_BEARING_PAID_STAGES } from "./constants.js";
import { buildBudgetMetersUpdate } from "./budget-meters.js";
import { buildDemoPack } from "./demo-pack.js";
import { buildRunText, slugify } from "./helpers.js";
import { buildEditStage } from "./editing-harness.js";
import { buildLedgerReconciliation } from "./reconciliation.js";
import { buildExhaustionFailureRecord } from "./retry.js";
import { resolveGateClientDeps, resolveStageClients } from "./live-clients.js";
import { runVideoRemix } from "./run-video-remix.js";
import { executeVideoAgentStagesAsync } from "./video-agent-execution.js";
import { buildVideoWorkflowCheckpoint, prepareVideoWorkflow, refreshVideoWorkflowIntelligence } from "./workflow-control.js";
import { buildStoryboardFlow, buildStoryboardMarkdown } from "./storyboard.js";
import { runStoryboardHarness } from "./storyboard-harness.js";
import { runWithBoundedRetry } from "./retry.js";
import { aggregateCostLogs, costLogAggregationHolds } from "./cost-log.js";
import { buildStoryboardScriptContext } from "./long-script-engine.js";

function retryingStoryboardClient(client, maxIterations, retryTrace, wait) {
  return {
    ...client,
    async plan(input) {
      const result = await runWithBoundedRetry(() => client.plan(input), {
        maxIterations,
        wait,
        onRetry: (entry) => retryTrace.push({ stageId: "storyboard", ...entry }),
      });
      retryTrace.push(...result.attempts.filter((entry) => entry.status === "complete").map((entry) => ({ stageId: "storyboard", ...entry })));
      if (!result.ok) throw result.error;
      return result.value;
    },
  };
}

async function applyLiveCreativePlan(payload, clients, args, deps) {
  if (!clients?.storyboardClient || !approvedGate(payload, "paid-model-call")) return null;
  const retryTrace = [];
  const result = await runStoryboardHarness({
    brief: payload.brief,
    evidencePack: payload.evidencePack,
    shotCount: payload.storyboard.plannedShots.length,
    scriptContext: buildStoryboardScriptContext(
      payload.workflow?.longScript,
      args.workflow?.narrativePolicy?.storyboardContextCharacters,
    ),
    storyboardProfile: payload.workflow?.storyboardDesign?.profile,
  }, {
    chatClient: retryingStoryboardClient(clients.storyboardClient, payload.maxIterations, retryTrace, deps.retryWait),
    runId: payload.runId,
    referenceUrl: payload.referenceUrl,
    paidProviderCalls: 1,
  });
  if (result.status !== "complete") return null;
  const workflow = prepareVideoWorkflow({
    workflow: args.workflow,
    runId: payload.runId,
    brief: payload.brief,
    plannedShots: result.plannedShots,
    sourceCards: payload.evidencePack?.sources,
  });
  const modelPlan = result.creativePlan || {};
  if (!workflow.creativePlan.script.text && modelPlan.script) {
    workflow.creativePlan.script = { source: "model", text: modelPlan.script };
  } else if (!args.workflow?.script && modelPlan.script) {
    workflow.creativePlan.script = { source: "model", text: modelPlan.script };
  }
  if (workflow.creativePlan.characters.length === 0 && Array.isArray(modelPlan.characters)) {
    workflow.creativePlan.characters = modelPlan.characters;
  }
  const enrichedWorkflow = refreshVideoWorkflowIntelligence(workflow, payload.evidencePack?.sources);
  payload.storyboard = {
    ...payload.storyboard,
    canvasDocumentMarkdown: buildStoryboardMarkdown({
      runId: payload.runId,
      referenceUrl: payload.referenceUrl,
      brief: payload.brief,
      shots: enrichedWorkflow.plannedShots,
    }),
    flow: buildStoryboardFlow(enrichedWorkflow.plannedShots),
    plannedShots: enrichedWorkflow.plannedShots,
    narrativeCoherence: result.narrativeCoherence,
  };
  payload.workflow = {
    ...payload.workflow,
    creativePlan: enrichedWorkflow.creativePlan,
    narrative: enrichedWorkflow.narrative,
    continuity: enrichedWorkflow.continuity,
    parallelShotPlan: enrichedWorkflow.parallelShotPlan,
    multiAgentPipeline: enrichedWorkflow.multiAgentPipeline,
    negotiation: enrichedWorkflow.negotiation,
    retryTrace,
  };
  return enrichedWorkflow;
}

/**
 * Derive the planned shots the render stage dispatches from a Run_Manifest's
 * storyboard. The storyboard flow nodes (one per planned shot, R7.2) carry the
 * shot ids; prompts come from `plannedShots` when present. Returns `[]` when no
 * storyboard is available (the render stage is then skipped).
 *
 * @param {object} manifest
 * @returns {Array<{ shotId: string, prompt: string }>}
 */
export function plannedShotsFromManifest(manifest) {
  const storyboard = manifest && typeof manifest === "object" ? manifest.storyboard : null;
  const planned = Array.isArray(storyboard?.plannedShots) ? storyboard.plannedShots : null;
  if (planned && planned.length) {
    return planned.map((shot) => ({
      shotId: String(shot.shotId ?? shot.id ?? ""),
      prompt: String(shot.prompt ?? shot.label ?? ""),
    })).filter((s) => s.shotId);
  }
  const nodes = Array.isArray(storyboard?.flow?.nodes) ? storyboard.flow.nodes : [];
  return nodes
    .map((node) => ({ shotId: String(node.id ?? ""), prompt: String(node.label ?? "") }))
    .filter((s) => s.shotId);
}

function approvedGate(manifest, gateId) {
  return Array.isArray(manifest?.approvalGates) &&
    manifest.approvalGates.some((gate) => gate?.id === gateId && gate?.approvalState === "approved");
}

function updateCheck(manifest, id, ok) {
  const checks = Array.isArray(manifest?.validation?.checks) ? manifest.validation.checks : [];
  const existing = checks.find((entry) => entry.id === id);
  if (existing) existing.ok = Boolean(ok);
  else checks.push({ id, ok: Boolean(ok) });
  if (manifest.validation) manifest.validation.checks = checks;
}

function replaceStage(manifest, id, patch) {
  manifest.stages = (Array.isArray(manifest.stages) ? manifest.stages : []).map((stage) =>
    stage?.id === id ? { ...stage, ...patch } : stage,
  );
}

function mergeVideoAgentResult(manifest, video, args = {}, workflow = null) {
  const executionFailure = video.executionFailure;
  if (executionFailure) manifest.state = RUN_STATE_BLOCKED;
  else if (video.negotiation?.decision === "block") manifest.state = RUN_STATE_BLOCKED;
  else if (video.qualityReview?.status === "revise") manifest.state = "awaiting_review";

  const editResult = video.editResult;
  const publishedUrls = manifest.state === "complete" && !editResult.blocksPublish ? video.publishedUrls : [];
  const checkout = manifest.state === "complete" && !editResult.blocksPublish
    ? {
        sessionId: manifest.commerce?.checkout?.sessionId || `cs_test_${slugify(manifest.runId, "run")}`,
        payoutSettled: manifest.commerce?.checkout?.payoutSettled || approvedGate(manifest, "payment-action"),
      }
    : { sessionId: "", payoutSettled: false };

  if (Array.isArray(video.plannedShots) && video.plannedShots.length) {
    manifest.storyboard = {
      ...manifest.storyboard,
      plannedShots: video.plannedShots,
      flow: buildStoryboardFlow(video.plannedShots),
      canvasDocumentMarkdown: buildStoryboardMarkdown({ runId: manifest.runId, referenceUrl: manifest.referenceUrl, brief: manifest.brief, shots: video.plannedShots }),
    };
  }
  manifest.render = { assets: video.assets };
  manifest.edit = editResult;
  manifest.commerce = { publish: { publishedUrls }, checkout };

  replaceStage(manifest, "render", {
    status: video.renderResult?.status === "complete" && video.assets.length ? "complete" : video.renderResult?.status || "blocked",
    executed: video.assets.length > 0,
    artifact: video.assets.length > 0 ? null : undefined,
    assetCount: video.assets.length,
  });
  replaceStage(manifest, "edit", buildEditStage("edit", editResult));
  replaceStage(manifest, "publish", { status: publishedUrls.length ? "complete" : "blocked", executed: publishedUrls.length > 0, publishedCount: publishedUrls.length });
  replaceStage(manifest, "checkout", { status: checkout.sessionId ? "complete" : "blocked", executed: Boolean(checkout.sessionId) });

  const failures = Array.isArray(manifest.failureHandling?.failures) ? manifest.failureHandling.failures : [];
  manifest.failureHandling = { ...(manifest.failureHandling || {}), failures: executionFailure ? [...failures, executionFailure] : failures };
  const exhaustionFailures = manifest.failureHandling.failures
    .filter((failure) => failure.exhausted)
    .map((failure) => buildExhaustionFailureRecord(failure));
  const providerFailures = (Array.isArray(manifest.failures) ? manifest.failures : [])
    .filter((failure) => failure.reason === "provider_unavailable_degraded");
  manifest.failures = [...exhaustionFailures, ...providerFailures];

  const qualityCostUsd = (video.qualityReview?.costLogs || []).reduce(
    (total, entry) => total + (Number(entry?.estimated_cost_usd) || 0),
    0,
  );
  const qualityDirectorLogs = qualityCostUsd > 0 || video.qualityProviderCalls > 0
    ? [{ stageId: "visual_review", estimatedCostUsd: qualityCostUsd, actualCostUsd: qualityCostUsd }]
    : [];
  const imageConsistencyCostUsd = (video.imageConsistency?.costLogs || []).reduce(
    (total, entry) => total + (Number(entry?.estimated_cost_usd) || 0),
    0,
  );
  const imageConsistencyDirectorLogs = imageConsistencyCostUsd > 0 || video.imageCandidateProviderCalls > 0 || video.imageReviewProviderCalls > 0
    ? [{ stageId: "image_consistency", estimatedCostUsd: imageConsistencyCostUsd, actualCostUsd: imageConsistencyCostUsd }]
    : [];
  manifest.costLogs = [
    ...(Array.isArray(manifest.costLogs) ? manifest.costLogs.filter((entry) => !["image_consistency", "visual_review"].includes(entry.stageId)) : []),
    ...imageConsistencyDirectorLogs,
    ...qualityDirectorLogs,
  ];
  const budgetUpdate = buildBudgetMetersUpdate({
    modelCostLogs: manifest.costLogs,
    renderProviderSpendUsd: video.providerSpendCents / 100,
    cumulativeSpendUsd: Number(manifest.budgetMeters?.cumulativeSpendUsd) || 0,
  });
  const modelCalls = approvedGate(manifest, "paid-model-call") && !manifest.weakSignalHalt?.halted
    ? MODEL_BEARING_PAID_STAGES
    : 0;
  manifest.budgetMeters = {
    ...manifest.budgetMeters,
    estimatedCostUsd: budgetUpdate.cumulativeEstimatedCostUsd,
    actualCostUsd: budgetUpdate.cumulativeActualCostUsd,
    spendEvents: budgetUpdate.spendEvents,
    spendEventCount: budgetUpdate.spendEventCount,
    budgetMetersUpdatedSynchronously: budgetUpdate.updatedSynchronously,
    providerSpendCents: video.providerSpendCents,
    costLogAggregate: aggregateCostLogs(manifest.costLogs),
    paidProviderCalls: modelCalls + video.imageCandidateProviderCalls + video.imageReviewProviderCalls + video.renderProviderCalls + video.qualityProviderCalls + (checkout.payoutSettled ? 1 : 0),
  };
  const budgetUsd = Number(manifest.budgetMeters.budgetUsd) || 0;
  const budgetExceeded = budgetUsd > 0 && manifest.budgetMeters.actualCostUsd >= budgetUsd;
  if (budgetExceeded) {
    manifest.state = "budget_exceeded";
    manifest.budgetMeters.budgetExceeded = true;
    manifest.budgetMeters.budgetExceededMessage = `Budget cap of $${budgetUsd.toFixed(2)} reached; publish and checkout halted.`;
    manifest.commerce = { publish: { publishedUrls: [] }, checkout: { sessionId: "", payoutSettled: false } };
    replaceStage(manifest, "publish", { status: "budget_held", executed: false, publishedCount: 0 });
    replaceStage(manifest, "checkout", { status: "budget_held", executed: false });
  }

  const reconciliation = buildLedgerReconciliation({ assets: video.assets, metersProviderSpendCents: video.providerSpendCents, runId: manifest.runId });
  manifest.budgetMeters.reconciliation = reconciliation.summary;
  manifest.reconciliationFlags = reconciliation.flags;
  manifest.videoAgent = {
    costLogs: video.videoAccounting.costLogs,
    costLogValidationFailures: video.videoAccounting.costLogValidationFailures,
    creditLedgerEvents: video.videoAccounting.creditLedgerEvents,
    creditLedgerValidationFailures: video.videoAccounting.creditLedgerValidationFailures,
    editManifestPersistCallCount: video.manifestPersistCallCount,
    qualityReview: video.qualityReview,
    imageConsistency: video.imageConsistency,
    parallelShotExecution: video.parallelShotExecution,
    multiAgentPipeline: null,
    negotiation: video.negotiation,
  };
  if (workflow) {
    const checkpointWorkflow = Array.isArray(video.plannedShots) ? { ...workflow, plannedShots: video.plannedShots } : workflow;
    const checkpoint = buildVideoWorkflowCheckpoint(checkpointWorkflow, video);
    manifest.videoAgent.multiAgentPipeline = checkpoint.multiAgentPipeline;
    manifest.workflow = {
      ...manifest.workflow,
      imageConsistency: video.imageConsistency,
      parallelShotPlan: workflow.parallelShotPlan,
      parallelShotExecution: video.parallelShotExecution,
      multiAgentPipeline: checkpoint.multiAgentPipeline,
      retryTrace: video.retryTrace,
      resume: {
        reusedShotCount: workflow.reusedAssets.length,
        pendingShotCount: workflow.pendingShots.length,
      },
      checkpoint,
    };
  }
  manifest.demoPack = buildDemoPack({
    state: manifest.state,
    sources: manifest.evidencePack?.sources,
    assets: video.assets,
    checkout,
    deployApproved: approvedGate(manifest, "cloud-deploy"),
    frontendUrl: args.frontendUrl,
    agentApiUrl: args.agentApiUrl,
    backendHealthUrl: args.backendHealthUrl,
    healthAttempts: args.healthAttempts,
  });

  manifest.guardrails.failsClosedOnRetryExhaustion = !exhaustionFailures.length || manifest.state === RUN_STATE_BLOCKED;
  manifest.guardrails.noPrematureFailureRecord = exhaustionFailures.length === manifest.failureHandling.failures.filter((failure) => failure.exhausted).length;
  manifest.guardrails.budgetMetersUpdatedSynchronously = budgetUpdate.updatedSynchronously;
  manifest.guardrails.creditLedgerConsistentOrReconciliationFlagged = reconciliation.guardrailOk;
  manifest.guardrails.videoAgentCostLogsValidate = video.videoAccounting.costLogValidationFailures.length === 0;
  manifest.guardrails.videoAgentCreditLedgerEventsValidate = video.videoAccounting.creditLedgerValidationFailures.length === 0;
  manifest.guardrails.editManifestPersistedExactlyOnce = editResult.status !== "complete" || video.manifestPersistCallCount === 1;
  manifest.guardrails.editBlocksPublish = !editResult.blocksPublish || publishedUrls.length === 0;
  manifest.guardrails.visualReviewBlocksLowQualityPublish = !["revise", "block"].includes(video.negotiation?.decision) || publishedUrls.length === 0;

  updateCheck(manifest, "failure_retry_bounded", manifest.failureHandling.failures.every((failure) => failure.retryCount <= manifest.maxIterations));
  updateCheck(manifest, "exhaustion_fails_closed_with_record", !exhaustionFailures.length || manifest.state === RUN_STATE_BLOCKED);
  updateCheck(manifest, "no_premature_failure_record", manifest.guardrails.noPrematureFailureRecord);
  updateCheck(manifest, "budget_meters_reflect_cumulative_spend_events", budgetUpdate.updatedSynchronously);
  updateCheck(manifest, "cost_log_aggregation_one_per_model_stage", costLogAggregationHolds(manifest.costLogs, manifest.budgetMeters.costLogAggregate));
  updateCheck(manifest, reconciliation.validationCheck.id, reconciliation.validationCheck.ok);
  updateCheck(manifest, "video_agent_cost_logs_validate", manifest.guardrails.videoAgentCostLogsValidate);
  updateCheck(manifest, "video_agent_credit_ledger_events_validate", manifest.guardrails.videoAgentCreditLedgerEventsValidate);
  updateCheck(manifest, "edit_manifest_persisted_exactly_once", manifest.guardrails.editManifestPersistedExactlyOnce);
  updateCheck(manifest, "edit_result_blocks_publish", manifest.guardrails.editBlocksPublish);
  updateCheck(manifest, "visual_review_blocks_low_quality_publish", manifest.guardrails.visualReviewBlocksLowQualityPublish);
  manifest.validation.ok = ["complete", "approval_required", "dry_run_ready", "blocked", "budget_exceeded"].includes(manifest.state);
}

export async function runVideoRemixAsync(args = {}, deps = {}) {
  const mediaPersister = deps.mediaPersister || args.mediaPersister;
  const clients = deps.clients || resolveStageClients(deps.env || args.env || {}, {
    fetchImpl: deps.fetchImpl,
    mediaPersister,
    r2Client: deps.r2Client,
  });
  const { renderDeps } = resolveGateClientDeps(clients, { runId: args.runId });
  if (!renderDeps.queueClient) return runVideoRemix(args);

  const result = runVideoRemix({ ...args, renderDeps: undefined, mediaPersister });
  const payload = result.payload;
  const liveWorkflow = await applyLiveCreativePlan(payload, clients, args, deps);
  if (liveWorkflow?.negotiation?.decision === "block") payload.state = RUN_STATE_BLOCKED;
  if (!(payload.mode === "live" && payload.state === "complete" && approvedGate(payload, "render-action"))) {
    return result;
  }

  const workflow = liveWorkflow || prepareVideoWorkflow({
    workflow: args.workflow,
    runId: payload.runId,
    brief: payload.brief,
    plannedShots: payload.storyboard.plannedShots,
    sourceCards: payload.evidencePack?.sources,
  });
  const video = await executeVideoAgentStagesAsync({
    liveRequested: true,
    state: payload.state,
    renderApproved: true,
    plannedShots: payload.storyboard.plannedShots,
    runId: payload.runId,
    nowMs: Date.now(),
    budgetUsd: payload.budgetMeters.budgetUsd,
    renderDeps,
    mediaPersister,
    maxIterations: payload.maxIterations,
    priorAssets: workflow.reusedAssets,
    renderEnabled: workflow.renderEnabled,
    narrative: workflow.narrative,
    continuity: workflow.continuity,
    storyboardDesign: workflow.storyboardDesign,
    multiCameraDesign: workflow.multiCameraDesign,
    referenceSelection: workflow.referenceSelection,
    imageGeneration: workflow.imageGeneration,
    imageConsistencyPolicy: workflow.imageConsistencyPolicy,
    parallelShotPlan: workflow.parallelShotPlan,
    qualityPolicy: workflow.qualityPolicy,
    imageGenerationClient: deps.imageGenerationClient || clients.imageGenerationClient,
    visualReviewClient: deps.visualReviewClient || clients.visualReviewClient,
    priorImageConsistency: args.workflow?.checkpoint?.imageConsistency,
    retryWait: deps.retryWait,
  });
  mergeVideoAgentResult(payload, video, args, workflow);
  return {
    payload,
    text: buildRunText({
      runId: payload.runId,
      mode: payload.mode,
      state: payload.state,
      sources: payload.evidencePack?.sources,
      approvalGates: payload.approvalGates,
      budgetMeters: payload.budgetMeters,
      budgetExceeded: payload.budgetMeters?.budgetExceeded,
      weakSignalHalt: payload.weakSignalHalt,
    }),
  };
}

/**
 * Execute the gated, spend-bearing Director stages (render → checkout) against
 * a base Run_Manifest, using env-resolved live clients when configured.
 *
 * Tokens are the verified Approval_Tokens issued by the Hitl_Gate_Service:
 *   - `renderToken` authorizes the render spend boundary (`render-action`);
 *   - `paymentToken` authorizes the checkout/payout boundary (`payment-action`).
 * When a token is absent the corresponding stage is enforced with `undefined`
 * (the harness fail-closes: rejection recorded, no spend, state unchanged), so
 * the live-without-approvals invariant (AC-1 / Property 2) is preserved.
 *
 * @param {object} manifest base Run_Manifest (from the synchronous `runVideoRemix`)
 * @param {object} [params]
 * @param {ReturnType<import("./live-clients.js").resolveStageClients>} [params.clients]
 *   env-resolved stage clients; live render/commerce clients are mapped into the
 *   gate deps via `resolveGateClientDeps`. Omit/mock → deterministic mock path.
 * @param {object|string} [params.renderToken] verified render Approval_Token
 * @param {object|string} [params.paymentToken] verified payment Approval_Token
 * @param {Array} [params.shots] override planned shots (defaults to the
 *   storyboard-derived shots from the manifest)
 * @param {{ assetUrl?: string, priceId?: string }} [params.checkout] checkout input;
 *   `assetUrl` defaults to the first rendered asset's url when omitted
 * @param {(args: object) => any} [params.consume] issuer single-use consume seam
 * @param {() => number} [params.now] clock seam
 * @param {string} [params.runId] run id (scopes ids/keys)
 * @param {boolean} [params.skipRender] skip the render stage (e.g. already done)
 * @param {boolean} [params.skipCheckout] skip the checkout stage
 * @returns {Promise<{ manifest: object, render: object|null, checkout: object|null }>}
 */
export async function executeLiveStages(manifest, params = {}) {
  const {
    clients,
    renderToken,
    paymentToken,
    checkout,
    consume,
    now,
    runId,
    skipRender = false,
    skipCheckout = false,
  } = params;

  const { renderDeps, checkoutDeps } = resolveGateClientDeps(clients, { now, runId });
  const shots = Array.isArray(params.shots) && params.shots.length
    ? params.shots
    : plannedShotsFromManifest(manifest);

  let next = manifest && typeof manifest === "object" ? manifest : {};
  let renderEnforcement = null;
  let checkoutEnforcement = null;

  // ── Render spend boundary (R4.2 / R8.x) ────────────────────────────────────
  if (!skipRender && shots.length > 0) {
    const r = await enforceDirectorRenderGate(next, {
      token: renderToken,
      shots,
      consume,
      deps: renderDeps,
    });
    next = r.manifest;
    renderEnforcement = r.enforcement;
  }

  // ── Checkout / payout spend boundary (R4.3 / R9.x) ──────────────────────────
  if (!skipCheckout) {
    // Default the checkout asset to the first rendered asset when not supplied.
    const firstAsset = Array.isArray(next?.render?.assets) ? next.render.assets[0] : null;
    const checkoutInput = {
      ...(checkout ?? {}),
      assetUrl: (checkout && checkout.assetUrl) || (firstAsset && firstAsset.assetUrl) || "",
    };
    // Only attempt checkout when there is an asset url to sell (or an explicit
    // payment token forcing the gate to be exercised/recorded).
    if (checkoutInput.assetUrl || paymentToken !== undefined) {
      const c = await enforceDirectorCheckoutGate(next, {
        token: paymentToken,
        checkout: checkoutInput,
        consume,
        deps: checkoutDeps,
      });
      next = c.manifest;
      checkoutEnforcement = c.enforcement;
    }
  }

  return { manifest: next, render: renderEnforcement, checkout: checkoutEnforcement };
}
