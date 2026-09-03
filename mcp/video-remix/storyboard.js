// Storyboard shot-plan + AGENTIC_OS storyboard-markdown builders for the video-remix
// Director runtime. Extracted verbatim from `mcp/video-remix-runtime.js`
// (reuse-not-rebuild).

import { REQUIRED_RESEARCH_SOURCE_COUNT } from "./constants.js";
import { cleanString } from "./helpers.js";

function buildShotPlan({ brief, sourceCount, shotCount }) {
  return Array.from({ length: shotCount }, (_, index) => {
    const shotNumber = index + 1;
    return {
      shotId: `shot-${shotNumber}`,
      label: `Shot ${shotNumber}`,
      type: "video-remix-shot",
      status: sourceCount >= REQUIRED_RESEARCH_SOURCE_COUNT ? "planned" : "blocked_weak_signal",
      prompt: `${brief || "Create a video remix"} - scene ${shotNumber}`,
      durationS: 4,
    };
  });
}

function buildStoryboardMarkdown({ runId, referenceUrl, brief, shots }) {
  const nodeYaml = shots.map((shot) => [
    `    - id: "${shot.shotId}"`,
    `      label: "${shot.label}"`,
    `      type: "${shot.type}"`,
    `      status: "${shot.status}"`,
    `      dramaticPurpose: ${JSON.stringify(cleanString(shot.dramaticPurpose))}`,
    `      dramaticIntensity: ${Number(shot.dramaticIntensity) || 0}`,
    `      durationS: ${Number(shot.durationS) || 0}`,
    `      cinematography: ${JSON.stringify(shot.cinematography || {})}`,
    `      cameraAssignment: ${JSON.stringify(shot.cameraAssignment || {})}`,
    `      spatialBlocking: ${JSON.stringify(shot.spatialBlocking || {})}`,
    `      primaryReference: ${JSON.stringify(shot.primaryReference || null)}`,
    `      firstFrameReferences: ${JSON.stringify(shot.firstFrameReferences || [])}`,
    `      imageGeneration: ${JSON.stringify(shot.imageGeneration || null)}`,
    `      imageConsistency: ${JSON.stringify(shot.imageConsistency || null)}`,
    `      parallelShot: ${JSON.stringify(shot.parallelShot || null)}`,
  ].join("\n")).join("\n");
  const edgeYaml = shots.slice(1).map((shot, index) => [
    `    - id: "edge-${index + 1}"`,
    `      source: "${shots[index].shotId}"`,
    `      target: "${shot.shotId}"`,
  ].join("\n")).join("\n");
  return [
    "---",
    'kgSchema: "agentic-os-computing-flow/v1"',
    'kgCanvasSurfaceMode: "2d"',
    'kgCanvas2dRenderer: "storyboard"',
    `title: "Video Remix Storyboard - ${runId}"`,
    `referenceUrl: "${referenceUrl}"`,
    "flow:",
    "  nodes:",
    nodeYaml || "    []",
    "  edges:",
    edgeYaml || "    []",
    "---",
    "",
    "# Video Remix Storyboard",
    "",
    brief,
  ].join("\n");
}

// Structured `flow:{nodes[],edges[]}` counterpart to `buildStoryboardMarkdown`.
// Single source of truth for the storyboard graph so the AgenticOs_Document markdown
// (the YAML frontmatter `flow:` block) and the structured `flow` object the
// harness returns are derived from the SAME shot plan (reuse-not-rebuild). One
// node per shot, in order; edges chain consecutive shots
// (shot[i] -> shot[i+1]). Pure — no schema validation here (that is the
// harness's `validateAgenticOsComputingFlowV1` seam).
function buildStoryboardFlow(shots) {
  const list = Array.isArray(shots) ? shots : [];
  const nodes = list.map((shot) => ({
    id: shot.shotId,
    label: shot.label,
    type: shot.type,
    status: shot.status,
    dramaticPurpose: cleanString(shot.dramaticPurpose),
    dramaticIntensity: Number(shot.dramaticIntensity) || 0,
    durationS: Number(shot.durationS) || 0,
    cinematography: shot.cinematography || {},
    cameraAssignment: shot.cameraAssignment || {},
    spatialBlocking: shot.spatialBlocking || {},
    primaryReference: shot.primaryReference || null,
    firstFrameReferences: shot.firstFrameReferences || [],
    imageGeneration: shot.imageGeneration || null,
    imageConsistency: shot.imageConsistency || null,
    parallelShot: shot.parallelShot || null,
  }));
  const edges = list.slice(1).map((shot, index) => ({
    id: `edge-${index + 1}`,
    source: list[index].shotId,
    target: shot.shotId,
  }));
  return { nodes, edges };
}

const DEFAULT_TOKEN_BUDGET_CEILING = 2000;

function checkNarrativeCoherence(plannedShots) {
  const shots = Array.isArray(plannedShots) ? plannedShots : [];
  if (shots.length < 2) return { ok: true, repeatedShotIds: [] };
  const repeated = new Set();
  for (let index = 1; index < shots.length; index += 1) {
    const previous = cleanString(shots[index - 1]?.shotId || shots[index - 1]?.id);
    const current = cleanString(shots[index]?.shotId || shots[index]?.id);
    if (previous && current && previous === current) {
      repeated.add(previous);
      repeated.add(current);
    }
  }
  return { ok: repeated.size === 0, repeatedShotIds: [...repeated] };
}

function tokenCountFromCostLog(costLog, remainingCeiling) {
  if (!costLog || typeof costLog !== "object") return 0;
  const prompt = costLog.prompt_tokens ?? costLog.promptTokens;
  const completion = costLog.completion_tokens ?? costLog.completionTokens;
  if (prompt === "unknown" || completion === "unknown" || costLog.usageTokens === "unknown") {
    return remainingCeiling;
  }
  const total = costLog.usageTokens ?? costLog.total_tokens ?? costLog.totalTokens;
  if (Number.isFinite(Number(total))) return Math.max(0, Number(total));
  return Math.max(0, Number(prompt) || 0) + Math.max(0, Number(completion) || 0);
}

function wrapChatClientWithTokenCeiling(chatClient, { ceiling, onDegrade } = {}) {
  const numericCeiling = Number(ceiling);
  if (!Number.isFinite(numericCeiling) || numericCeiling <= 0) return chatClient;
  let consumed = 0;
  let calls = 0;
  let degraded = false;
  return {
    ...chatClient,
    async plan(args = {}) {
      if (degraded && calls > 0) return { shots: [], degraded: true, reason: "token_budget_ceiling" };
      calls += 1;
      const result = await chatClient.plan(args);
      consumed += tokenCountFromCostLog(result?.costLog, Math.max(0, numericCeiling - consumed));
      if (!degraded && consumed >= numericCeiling) {
        degraded = true;
        if (typeof onDegrade === "function") {
          onDegrade({ plannedShotCountAtDegradation: Array.isArray(result?.shots) ? result.shots.length : 0 });
        }
      }
      return result;
    },
    tokenBudget: { ceiling: numericCeiling, consumed: () => consumed, degraded: () => degraded },
  };
}

export {
  buildShotPlan,
  buildStoryboardMarkdown,
  buildStoryboardFlow,
  DEFAULT_TOKEN_BUDGET_CEILING,
  checkNarrativeCoherence,
  wrapChatClientWithTokenCeiling,
};
