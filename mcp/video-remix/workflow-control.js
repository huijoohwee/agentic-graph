import { cleanString } from "./helpers.js";
import { buildHierarchicalNarrativePlan, buildVisualContinuityLedger, DEFAULT_RETRIEVAL_TOP_K, DEFAULT_SHOTS_PER_ACT } from "./narrative-continuity.js";
import { buildVideoAgentNegotiation, DEFAULT_NEGOTIATION_ROUNDS } from "./agent-collaboration.js";
import { DEFAULT_NARRATIVE_QUALITY_THRESHOLD, DEFAULT_VISUAL_QUALITY_THRESHOLD } from "./visual-quality-monitor.js";
import {
  buildLongScriptDesign,
  bindLongScriptToShots,
  DEFAULT_SCRIPT_RETRIEVAL_TOP_K,
  DEFAULT_SCRIPT_SEGMENT_CHARACTERS,
  DEFAULT_STORYBOARD_CONTEXT_CHARACTERS,
} from "./long-script-engine.js";
import { buildExpressiveStoryboard } from "./expressive-storyboard.js";
import { buildMultiCameraSimulation } from "./multi-camera-simulation.js";
import { buildReferenceImageSelection, normalizeReferenceSelectionPolicy, REFERENCE_IMAGE_KINDS } from "./reference-image-selection.js";
import { buildAutomatedImageGeneration, normalizeImagePromptPolicy } from "./automated-image-generation.js";
import { normalizeImageConsistencyPolicy } from "./image-consistency-check.js";
import { buildParallelShotPlan, normalizeParallelShotPolicy } from "./parallel-shot-generation.js";
import { buildMultiAgentVideoPipeline } from "./multi-agent-pipeline.js";

export const VIDEO_WORKFLOW_SCHEMA = "agentic-graph.video_workflow/v1";
export const VIDEO_WORKFLOW_ACTIONS = Object.freeze(["run", "plan", "revise", "render", "resume"]);
export const DEFAULT_CONTEXT_CHARACTER_BUDGET = 12000;

export class VideoWorkflowInputError extends Error {
  constructor(field, message) {
    super(message || `Invalid video workflow input: ${field}`);
    this.name = "VideoWorkflowInputError";
    this.code = "invalid_video_workflow_input";
    this.field = field;
  }
}

function normalizeAction(value) {
  const action = cleanString(value, "run");
  if (!VIDEO_WORKFLOW_ACTIONS.includes(action)) {
    throw new VideoWorkflowInputError("workflow.action", `workflow.action must be one of ${VIDEO_WORKFLOW_ACTIONS.join(" | ")}`);
  }
  return action;
}

function normalizeCharacters(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new VideoWorkflowInputError("workflow.characters", "workflow.characters must be an array");
  const characters = value.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new VideoWorkflowInputError(`workflow.characters[${index}]`, "each character must be an object");
    }
    const id = cleanString(entry.id || entry.name);
    const name = cleanString(entry.name || entry.id);
    if (!id || !name) {
      throw new VideoWorkflowInputError(`workflow.characters[${index}]`, "each character requires id or name");
    }
    return {
      id,
      name,
      description: cleanString(entry.description),
      referenceImageId: cleanString(entry.referenceImageId),
    };
  });
  const ids = characters.map((character) => character.id);
  if (new Set(ids).size !== ids.length) {
    throw new VideoWorkflowInputError("workflow.characters", "character ids must be unique");
  }
  return characters;
}

function normalizeReferenceImages(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new VideoWorkflowInputError("workflow.referenceImages", "workflow.referenceImages must be an array");
  }
  return value.map((entry, index) => {
    const id = cleanString(entry?.id);
    const width = Number(entry?.width);
    const height = Number(entry?.height);
    if (!id || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new VideoWorkflowInputError(
        `workflow.referenceImages[${index}]`,
        "each reference image requires id and positive width/height metadata",
      );
    }
    return {
      id,
      width,
      height,
      assetUrl: cleanString(entry.assetUrl),
      kind: REFERENCE_IMAGE_KINDS.includes(entry.kind) ? entry.kind : "style",
      entityIds: Array.isArray(entry.entityIds) ? entry.entityIds.map((entityId) => cleanString(entityId)).filter(Boolean) : [],
      sceneId: cleanString(entry.sceneId),
      actionBeatId: cleanString(entry.actionBeatId),
      sourceShotId: cleanString(entry.sourceShotId),
      environmentState: entry.environmentState && typeof entry.environmentState === "object" && !Array.isArray(entry.environmentState) ? entry.environmentState : {},
    };
  });
}

export function compactWorkflowContext(entries, characterBudget = DEFAULT_CONTEXT_CHARACTER_BUDGET) {
  const source = Array.isArray(entries) ? entries : [];
  const budget = Number.isFinite(Number(characterBudget))
    ? Math.max(1, Math.floor(Number(characterBudget)))
    : DEFAULT_CONTEXT_CHARACTER_BUDGET;
  const retained = [];
  let retainedCharacters = 0;
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const entry = source[index];
    const content = cleanString(entry?.content);
    if (!content) continue;
    if (retainedCharacters + content.length > budget) continue;
    retained.unshift({
      role: cleanString(entry?.role, "context"),
      content,
    });
    retainedCharacters += content.length;
  }
  return {
    budgetCharacters: budget,
    inputCount: source.length,
    retainedCount: retained.length,
    droppedCount: source.length - retained.length,
    retainedCharacters,
    entries: retained,
  };
}

function normalizeRevision(value, action) {
  if (value == null) {
    if (action === "revise") throw new VideoWorkflowInputError("workflow.revision", "revise action requires workflow.revision");
    return { note: "", shotPrompts: {} };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new VideoWorkflowInputError("workflow.revision", "workflow.revision must be an object");
  }
  const shotPrompts = value.shotPrompts && typeof value.shotPrompts === "object" && !Array.isArray(value.shotPrompts)
    ? Object.fromEntries(
        Object.entries(value.shotPrompts)
          .map(([shotId, prompt]) => [cleanString(shotId), cleanString(prompt)])
          .filter(([shotId, prompt]) => shotId && prompt),
      )
    : {};
  return { note: cleanString(value.note), shotPrompts };
}

function normalizeCheckpoint(value, sessionId, action) {
  if (value == null) {
    if (action === "resume") throw new VideoWorkflowInputError("workflow.checkpoint", "resume action requires workflow.checkpoint");
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new VideoWorkflowInputError("workflow.checkpoint", "workflow.checkpoint must be an object");
  }
  const checkpointSessionId = cleanString(value.sessionId);
  if (checkpointSessionId && checkpointSessionId !== sessionId) {
    throw new VideoWorkflowInputError("workflow.checkpoint.sessionId", "checkpoint sessionId must match workflow.sessionId");
  }
  return value;
}

function landscapeGuard(referenceImages) {
  const rejected = referenceImages
    .filter((image) => image.width <= image.height)
    .map((image) => ({ id: image.id, width: image.width, height: image.height, reason: "landscape_required" }));
  return {
    required: true,
    ok: rejected.length === 0,
    checkedCount: referenceImages.length,
    rejected,
  };
}

function normalizePolicy(value, fields) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(fields.flatMap(({ key, min, max, fallback }) => {
    const number = Number(input[key]);
    const resolved = Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
    return resolved === undefined ? [] : [[key, resolved]];
  }));
}

function reusableAssets(checkpoint, plannedShotIds) {
  const assets = Array.isArray(checkpoint?.renderAssets) ? checkpoint.renderAssets : [];
  const latestByShotId = new Map();
  for (const asset of assets) {
    const shotId = cleanString(asset?.shotId);
    const assetUrl = cleanString(asset?.durableR2Url || asset?.assetUrl || asset?.storageUri);
    if (!shotId || !assetUrl || !plannedShotIds.has(shotId)) continue;
    latestByShotId.set(shotId, { ...asset, shotId, assetUrl });
  }
  return [...latestByShotId.values()];
}

export function applyWorkflowRevision(plannedShots, revision) {
  const prompts = revision?.shotPrompts || {};
  const knownIds = new Set((Array.isArray(plannedShots) ? plannedShots : []).map((shot) => cleanString(shot?.shotId)));
  const unknownShotIds = Object.keys(prompts).filter((shotId) => !knownIds.has(shotId));
  if (unknownShotIds.length) {
    throw new VideoWorkflowInputError("workflow.revision.shotPrompts", `unknown shot ids: ${unknownShotIds.join(", ")}`);
  }
  return (Array.isArray(plannedShots) ? plannedShots : []).map((shot) => ({
    ...shot,
    prompt: prompts[shot.shotId] || shot.prompt,
    revised: Boolean(prompts[shot.shotId]),
  }));
}

export function refreshVideoWorkflowIntelligence(workflow, sourceCards = [], priorImageGeneration = workflow?.imageGeneration, priorParallelShotPlan = workflow?.parallelShotPlan, priorPipeline = workflow?.multiAgentPipeline) {
  const longScript = buildLongScriptDesign({
    script: workflow.creativePlan.script.text,
    plannedShots: workflow.plannedShots,
    policy: workflow.narrativePolicy,
  });
  const scriptBoundShots = bindLongScriptToShots(workflow.plannedShots, longScript);
  const storyboardDesign = buildExpressiveStoryboard({ plannedShots: scriptBoundShots, profile: workflow.storyboardProfile });
  const multiCameraDesign = buildMultiCameraSimulation({ plannedShots: storyboardDesign.shots, profile: storyboardDesign.profile.multiCamera });
  const referenceSelection = buildReferenceImageSelection({
    plannedShots: multiCameraDesign.shots,
    referenceImages: workflow.referenceImages,
    characters: workflow.creativePlan.characters,
    priorAssets: workflow.reusedAssets,
    policy: workflow.referencePolicy,
  });
  const imageGeneration = buildAutomatedImageGeneration({
    plannedShots: referenceSelection.shots,
    characters: workflow.creativePlan.characters,
    referenceSelection,
    priorGeneration: priorImageGeneration,
    policy: workflow.imagePromptPolicy,
  });
  const parallelShotPlan = buildParallelShotPlan({ plannedShots: imageGeneration.shots, policy: workflow.parallelShotPolicy, priorPlan: priorParallelShotPlan });
  const plannedShots = parallelShotPlan.shots;
  const pendingShotIds = new Set(workflow.pendingShots.map((shot) => shot.shotId));
  const narrative = buildHierarchicalNarrativePlan({
    script: workflow.creativePlan.script.text,
    plannedShots,
    sourceCards,
    longScript,
    policy: workflow.narrativePolicy,
  });
  const continuity = buildVisualContinuityLedger({
    plannedShots,
    characters: workflow.creativePlan.characters,
    referenceImages: workflow.referenceImages,
  });
  const enrichedWorkflow = {
    ...workflow,
    storyboardProfile: storyboardDesign.profile,
    plannedShots,
    pendingShots: plannedShots.filter((shot) => pendingShotIds.has(shot.shotId)),
    longScript,
    storyboardDesign,
    multiCameraDesign,
    referenceSelection,
    imageGeneration,
    parallelShotPlan,
    narrative,
    continuity,
    negotiation: buildVideoAgentNegotiation({ narrative, continuity, storyboardDesign, multiCameraDesign, referenceSelection, imageGeneration, parallelShotPlan, maxRounds: workflow.qualityPolicy.maxNegotiationRounds }),
  };
  return { ...enrichedWorkflow, multiAgentPipeline: buildMultiAgentVideoPipeline({ workflow: enrichedWorkflow, priorPipeline }) };
}

export function prepareVideoWorkflow({ workflow, runId, brief, plannedShots, sourceCards } = {}) {
  const input = workflow && typeof workflow === "object" && !Array.isArray(workflow) ? workflow : {};
  const action = normalizeAction(input.action);
  const sessionId = cleanString(input.sessionId, runId);
  const revision = normalizeRevision(input.revision, action);
  const checkpoint = normalizeCheckpoint(input.checkpoint, sessionId, action);
  const characters = normalizeCharacters(input.characters);
  const referenceImages = normalizeReferenceImages(input.referenceImages);
  const revisedShots = applyWorkflowRevision(plannedShots, revision);
  const plannedShotIds = new Set(revisedShots.map((shot) => shot.shotId));
  const reusedAssets = reusableAssets(checkpoint, plannedShotIds);
  const reusedShotIds = new Set(reusedAssets.map((asset) => asset.shotId));
  const pendingShots = revisedShots.filter((shot) => !reusedShotIds.has(shot.shotId));
  const context = compactWorkflowContext(input.context?.entries, input.context?.characterBudget);
  const renderGuard = landscapeGuard(referenceImages);
  const renderEnabled = ["run", "render", "resume"].includes(action) && renderGuard.ok;
  const narrativePolicy = normalizePolicy(input.narrativePolicy, [
    { key: "shotsPerAct", min: 1, max: 20, fallback: DEFAULT_SHOTS_PER_ACT },
    { key: "retrievalTopK", min: 1, max: 20, fallback: DEFAULT_RETRIEVAL_TOP_K },
    { key: "scriptRetrievalTopK", min: 1, max: 20, fallback: DEFAULT_SCRIPT_RETRIEVAL_TOP_K },
    { key: "segmentCharacters", min: 400, max: 12000, fallback: DEFAULT_SCRIPT_SEGMENT_CHARACTERS },
    { key: "storyboardContextCharacters", min: 1000, max: 100000, fallback: DEFAULT_STORYBOARD_CONTEXT_CHARACTERS },
  ]);
  const qualityPolicy = normalizePolicy(input.qualityPolicy, [
    { key: "narrativeThreshold", min: 0, max: 1, fallback: DEFAULT_NARRATIVE_QUALITY_THRESHOLD },
    { key: "visualThreshold", min: 0, max: 1, fallback: DEFAULT_VISUAL_QUALITY_THRESHOLD },
    { key: "maxNegotiationRounds", min: 1, max: 4, fallback: DEFAULT_NEGOTIATION_ROUNDS },
  ]);
  return refreshVideoWorkflowIntelligence({
    schema: VIDEO_WORKFLOW_SCHEMA,
    sessionId,
    action,
    revisionNumber: Math.max(0, Math.floor(Number(checkpoint?.revisionNumber) || 0)) + (action === "revise" ? 1 : 0),
    revision,
    creativePlan: {
      script: { source: cleanString(input.script) ? "operator" : "brief", text: cleanString(input.script, brief) },
      characters,
      storyboardShotCount: revisedShots.length,
    },
    context,
    storyboardProfile: input.storyboardProfile,
    referencePolicy: normalizeReferenceSelectionPolicy(input.referencePolicy),
    imagePromptPolicy: normalizeImagePromptPolicy(input.imagePromptPolicy),
    imageConsistencyPolicy: normalizeImageConsistencyPolicy(input.imageConsistencyPolicy),
    parallelShotPolicy: normalizeParallelShotPolicy(input.parallelShotPolicy),
    narrativePolicy,
    qualityPolicy,
    referenceImages,
    renderGuard,
    renderEnabled,
    plannedShots: revisedShots,
    pendingShots,
    reusedAssets,
  }, sourceCards, checkpoint?.imageGeneration, checkpoint?.parallelShotPlan, checkpoint?.multiAgentPipeline);
}

export function buildVideoWorkflowCheckpoint(workflow, execution = {}) {
  const renderedAssets = Array.isArray(execution.assets) ? execution.assets : [];
  const assetsByShotId = new Map(workflow.reusedAssets.map((asset) => [asset.shotId, asset]));
  renderedAssets.forEach((asset) => assetsByShotId.set(asset.shotId, asset));
  const renderAssets = workflow.plannedShots
    .map((shot) => assetsByShotId.get(shot.shotId))
    .filter(Boolean);
  const failedShotId = cleanString(execution.renderResult?.failure?.shotId);
  const renderStatus = workflow.plannedShots.map((shot) => ({
    shotId: shot.shotId,
    status: assetsByShotId.has(shot.shotId) ? "complete" : shot.shotId === failedShotId ? "failed" : "pending",
  }));
  const multiAgentPipeline = buildMultiAgentVideoPipeline({ workflow, execution, priorPipeline: workflow.multiAgentPipeline });
  return {
    schema: VIDEO_WORKFLOW_SCHEMA,
    sessionId: workflow.sessionId,
    revisionNumber: workflow.revisionNumber,
    action: workflow.action,
    context: workflow.context,
    longScript: workflow.longScript,
    storyboardDesign: workflow.storyboardDesign,
    multiCameraDesign: workflow.multiCameraDesign,
    referenceSelection: workflow.referenceSelection,
    imageGeneration: workflow.imageGeneration,
    imageConsistency: execution.imageConsistency || null,
    parallelShotPlan: workflow.parallelShotPlan,
    parallelShotExecution: execution.parallelShotExecution || null,
    multiAgentPipeline,
    narrative: workflow.narrative,
    continuity: workflow.continuity,
    qualityReview: execution.qualityReview || null,
    negotiation: execution.negotiation || workflow.negotiation,
    proposedRevisions: execution.negotiation?.proposedRevisions || {},
    renderStatus,
    renderAssets,
    completeShotCount: renderAssets.length,
    pendingShotCount: renderStatus.filter((entry) => entry.status !== "complete").length,
  };
}
