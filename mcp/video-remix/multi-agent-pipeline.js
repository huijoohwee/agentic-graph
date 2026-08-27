import { cleanString } from "./helpers.js";

export const MULTI_AGENT_VIDEO_PIPELINE_SCHEMA = "agenticgraph.multi_agent_video_pipeline/v1";

export const MULTI_AGENT_VIDEO_PIPELINE_STAGES = Object.freeze([
  { stageId: "input", dependsOn: [], agentIds: ["production_director"], inputPaths: ["creativePlan", "storyboardProfile", "referenceImages"] },
  { stageId: "central_orchestration", dependsOn: ["input"], agentIds: ["production_director"], inputPaths: ["action", "context", "qualityPolicy"] },
  { stageId: "script_understanding", dependsOn: ["central_orchestration"], agentIds: ["narrative_planner"], inputPaths: ["longScript", "creativePlan.characters"] },
  { stageId: "scene_shot_planning", dependsOn: ["script_understanding"], agentIds: ["storyboard_designer", "camera_director", "render_scheduler"], inputPaths: ["storyboardDesign", "multiCameraDesign", "parallelShotPlan"] },
  { stageId: "visual_asset_planning", dependsOn: ["scene_shot_planning"], agentIds: ["reference_curator", "image_prompt_designer"], inputPaths: ["referenceSelection", "imageGeneration"] },
  { stageId: "asset_indexing", dependsOn: ["visual_asset_planning"], agentIds: ["reference_curator", "first_frame_reviewer"], inputPaths: ["referenceSelection.catalog", "imageConsistency.selections"] },
  { stageId: "consistency_continuity", dependsOn: ["asset_indexing"], agentIds: ["continuity_supervisor", "first_frame_reviewer", "visual_quality_reviewer"], inputPaths: ["continuity", "imageConsistency", "qualityReview"] },
  { stageId: "visual_synthesis_assembly", dependsOn: ["consistency_continuity"], agentIds: ["render_scheduler", "production_director"], inputPaths: ["parallelShotExecution", "renderResult", "editResult"] },
  { stageId: "output", dependsOn: ["visual_synthesis_assembly"], agentIds: ["production_director"], inputPaths: ["assets", "publishedUrls", "videoAccounting"] },
]);

function list(value) {
  return Array.isArray(value) ? value : [];
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function planningInputKey(workflow) {
  return JSON.stringify(stableValue({
    schema: workflow?.schema,
    sessionId: workflow?.sessionId,
    revisionNumber: workflow?.revisionNumber,
    action: workflow?.action,
    shotIds: list(workflow?.plannedShots).map((shot) => cleanString(shot?.shotId)),
    longScriptSegments: list(workflow?.longScript?.segments).map((segment) => segment.segmentId),
    referenceIds: list(workflow?.referenceImages).map((reference) => reference.id),
    parallelPlanKey: workflow?.parallelShotPlan?.inputKey,
    imagePromptKeys: list(workflow?.imageGeneration?.prompts).map((prompt) => prompt.inputKey),
  }));
}

function executionState(execution) {
  return {
    imageConsistency: execution?.imageConsistency || null,
    qualityReview: execution?.qualityReview || null,
    parallelShotExecution: execution?.parallelShotExecution || null,
    renderResult: execution?.renderResult || null,
    editResult: execution?.editResult || null,
    assets: list(execution?.assets),
    publishedUrls: list(execution?.publishedUrls),
    providerSpendCents: Number(execution?.providerSpendCents) || 0,
    renderProviderCalls: Number(execution?.renderProviderCalls) || 0,
    videoAccounting: execution?.videoAccounting || null,
    retryTrace: list(execution?.retryTrace),
  };
}

function stageStatus(stageId, workflow, execution) {
  const blocked = workflow?.negotiation?.decision === "block";
  if (stageId === "input") return workflow?.schema && workflow?.creativePlan ? "complete" : "blocked";
  if (stageId === "central_orchestration") return blocked ? "blocked" : "complete";
  if (stageId === "script_understanding") return workflow?.longScript?.retention?.ok === false ? "blocked" : "complete";
  if (stageId === "scene_shot_planning") return [workflow?.storyboardDesign, workflow?.multiCameraDesign, workflow?.parallelShotPlan].some((entry) => entry?.ok === false) ? "blocked" : "complete";
  if (stageId === "visual_asset_planning") return [workflow?.referenceSelection, workflow?.imageGeneration].some((entry) => entry?.ok === false) ? "blocked" : "complete";
  if (stageId === "asset_indexing") {
    if (execution?.imageConsistency?.ok === false) return "blocked";
    if (execution?.imageConsistency?.status === "complete" || (execution?.imageConsistency?.status === "unverified" && execution?.imageConsistency?.policy?.required !== true)) return "complete";
    return "pending";
  }
  if (stageId === "consistency_continuity") {
    if (workflow?.continuity?.ok === false || execution?.qualityReview?.status === "failed") return "blocked";
    if (execution?.qualityReview?.status === "complete") return "complete";
    if (execution?.qualityReview?.status === "revise") return "awaiting_revision";
    return execution?.qualityReview?.status === "unverified" && execution?.renderResult?.status === "complete" ? "unverified" : "pending";
  }
  if (stageId === "visual_synthesis_assembly") {
    if ([execution?.renderResult?.status, execution?.editResult?.status].some((status) => ["failed", "rejected"].includes(status))) return "blocked";
    return execution?.renderResult?.status === "complete" && execution?.editResult?.status === "complete" ? "complete" : "pending";
  }
  if (stageId === "output") return list(execution?.assets).length && execution?.editResult?.status === "complete" ? "complete" : "pending";
  return "pending";
}

function stageIssues(stageId, workflow, execution) {
  const sources = {
    central_orchestration: workflow?.negotiation?.proposals,
    script_understanding: workflow?.longScript?.issues,
    scene_shot_planning: [...list(workflow?.storyboardDesign?.issues), ...list(workflow?.multiCameraDesign?.issues), ...list(workflow?.parallelShotPlan?.issues)],
    visual_asset_planning: [...list(workflow?.referenceSelection?.issues), ...list(workflow?.imageGeneration?.issues)],
    asset_indexing: execution?.imageConsistency?.issues,
    consistency_continuity: [...list(workflow?.continuity?.issues), ...list(execution?.qualityReview?.findings)],
    visual_synthesis_assembly: execution?.renderResult?.failure ? [execution.renderResult.failure] : [],
  };
  return list(sources[stageId]).filter((entry) => entry?.status === "block" || entry?.severity === "error" || entry?.code || entry?.reason);
}

function buildStages(workflow, execution) {
  const stages = [];
  MULTI_AGENT_VIDEO_PIPELINE_STAGES.forEach((definition, order) => {
    const dependencyStages = definition.dependsOn.map((dependency) =>
      stages.find((stage) => stage.stageId === dependency),
    );
    const ownStatus = stageStatus(definition.stageId, workflow, execution);
    const dependencyBlocked = dependencyStages.some((stage) => stage?.status === "blocked");
    const dependencyReady = dependencyStages.every((stage) =>
      ["complete", "unverified"].includes(stage?.status),
    );
    stages.push({
      ...definition,
      order,
      status: dependencyBlocked
        ? "blocked"
        : ownStatus === "complete" && !dependencyReady
          ? "pending"
          : ownStatus,
      issues: stageIssues(definition.stageId, workflow, execution),
    });
  });
  return stages;
}

function buildHandoffs(stages) {
  const byId = new Map(stages.map((stage) => [stage.stageId, stage]));
  return stages.flatMap((stage) => stage.dependsOn.map((sourceStageId) => {
    const source = byId.get(sourceStageId);
    return {
      handoffId: `${sourceStageId}->${stage.stageId}`,
      fromStageId: sourceStageId,
      toStageId: stage.stageId,
      fromAgentIds: source?.agentIds || [],
      toAgentIds: stage.agentIds,
      status: ["complete", "unverified"].includes(source?.status) ? "ready" : source?.status === "blocked" ? "blocked" : "pending",
    };
  }));
}

function addArtifact(index, seen, artifact) {
  const url = cleanString(artifact?.durableUrl || artifact?.assetUrl);
  const artifactId = cleanString(artifact?.artifactId, url);
  if (!artifactId || seen.has(artifactId)) return;
  seen.add(artifactId);
  index.push({ ...artifact, artifactId, durableUrl: url });
}

function buildArtifactIndex(workflow, execution) {
  const index = [];
  const seen = new Set();
  list(workflow?.referenceImages).forEach((reference) => addArtifact(index, seen, { artifactId: `reference:${reference.id}`, kind: "reference_image", stageId: "visual_asset_planning", durableUrl: reference.assetUrl }));
  list(execution?.imageConsistency?.selections).forEach((selection) => list(selection.candidates).forEach((candidate) => addArtifact(index, seen, { artifactId: candidate.candidateId, kind: "first_frame_candidate", stageId: "asset_indexing", shotId: selection.shotId, durableUrl: candidate.assetUrl, selected: candidate.candidateId === selection.selectedCandidate?.candidateId })));
  list(execution?.assets).forEach((asset) => addArtifact(index, seen, { artifactId: `clip:${asset.shotId}`, kind: "video_clip", stageId: "visual_synthesis_assembly", shotId: asset.shotId, durableUrl: asset.durableR2Url || asset.assetUrl, ledgerEventId: asset.ledgerEventId }));
  if (execution?.editResult?.editedVideoReference) addArtifact(index, seen, { artifactId: "assembled_video", kind: "assembled_video", stageId: "output", durableUrl: execution.editResult.editedVideoReference.durableR2Url });
  return index;
}

function buildResourceLedger(workflow, execution) {
  return {
    contextCharacters: Number(workflow?.context?.retainedCharacters) || 0,
    scriptUnitCount: Number(workflow?.longScript?.corpus?.unitCount) || 0,
    plannedShotCount: list(workflow?.plannedShots).length,
    reusedShotCount: list(workflow?.reusedAssets).length,
    imagePromptCount: list(workflow?.imageGeneration?.prompts).length,
    imageCandidateCalls: Number(execution?.imageConsistency?.candidateProviderCalls) || 0,
    imageReviewCalls: Number(execution?.imageConsistency?.reviewProviderCalls) || 0,
    renderProviderCalls: execution?.renderProviderCalls || Number(execution?.renderResult?.paidProviderCalls) || 0,
    providerSpendCents: execution?.providerSpendCents || Number(execution?.renderResult?.providerSpendCents) || 0,
    retryCount: list(execution?.retryTrace).filter((entry) => entry.status === "retry").length,
    costLogCount: list(execution?.videoAccounting?.costLogs).length,
  };
}

function validatePipeline(stages, handoffs) {
  const stageIds = new Set(stages.map((stage) => stage.stageId));
  const duplicateStageIds = stages.filter((stage, index) => stages.findIndex((candidate) => candidate.stageId === stage.stageId) !== index).map((stage) => stage.stageId);
  const invalidDependencies = stages.flatMap((stage) => stage.dependsOn.filter((dependency) => !stageIds.has(dependency)).map((dependency) => ({ stageId: stage.stageId, dependency })));
  const backwardHandoffs = handoffs.filter((handoff) => stages.findIndex((stage) => stage.stageId === handoff.fromStageId) >= stages.findIndex((stage) => stage.stageId === handoff.toStageId));
  return { ok: !duplicateStageIds.length && !invalidDependencies.length && !backwardHandoffs.length, duplicateStageIds, invalidDependencies, backwardHandoffs };
}

export function buildMultiAgentVideoPipeline({ workflow, execution: executionInput, priorPipeline } = {}) {
  const execution = executionState(executionInput);
  const inputKey = planningInputKey(workflow);
  const stages = buildStages(workflow, execution);
  const handoffs = buildHandoffs(stages);
  const validation = validatePipeline(stages, handoffs);
  const blocked = stages.some((stage) => stage.status === "blocked");
  const complete = stages.every((stage) => ["complete", "unverified"].includes(stage.status));
  const unverified = stages.some((stage) => stage.status === "unverified");
  return {
    schema: MULTI_AGENT_VIDEO_PIPELINE_SCHEMA,
    inputKey,
    reusedPlan: priorPipeline?.inputKey === inputKey,
    state: blocked ? "blocked" : complete ? unverified ? "complete_unverified" : "complete" : stages.some((stage) => stage.status === "awaiting_revision") ? "awaiting_revision" : "awaiting_execution",
    stages,
    handoffs,
    agentAssignments: Object.fromEntries([...new Set(stages.flatMap((stage) => stage.agentIds))].map((agentId) => [agentId, stages.filter((stage) => stage.agentIds.includes(agentId)).map((stage) => stage.stageId)])),
    artifactIndex: buildArtifactIndex(workflow, execution),
    resourceLedger: buildResourceLedger(workflow, execution),
    validation,
    ok: validation.ok && !blocked,
  };
}
