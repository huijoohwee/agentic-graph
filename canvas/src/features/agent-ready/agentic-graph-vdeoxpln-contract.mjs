import { AGENTIC_OS_AGENT_READY_DEFAULT_WORKSPACE_ID, buildAgenticGraphAgentReadyToolContracts, AGENTIC_OS_AGENT_READY_TOOL_IDS } from "./agentic-graph-agent-ready-tool-contract.mjs"; import { hashSemanticParts, stableStringify } from "../../../../contracts/semantic-key.js"; import { buildAgenticGraphLocalMcpToolNameList, AGENTIC_OS_LOCAL_MCP_TOOL_NAMES, AGENTIC_OS_OS_STATUS_TOOL_NAME } from "./agentic-graph-local-mcp-tool-names.mjs"; import { buildVdeoxplnToolPromptLines, buildVdeoxplnToolRoutingAliases } from "./agentic-graph-vdeoxpln-routing-tools.mjs"; import { buildAgenticGraphApplicationCompositionVdeoxpln } from "./agentic-graph-application-composition-vdeoxpln.mjs"; import { buildRawAgenticGraphVdeoxplnRegistry } from "./agentic-graph-vdeoxpln-registry-data.mjs";
export const AGENTIC_OS_VDEOXPLN_CONTRACT_VERSION = "agentic-graph-vdeoxpln/v0.1"; export { buildAgenticGraphLocalMcpToolNameList, AGENTIC_OS_LOCAL_MCP_TOOL_NAMES, AGENTIC_OS_OS_STATUS_TOOL_NAME };

export const AGENTIC_OS_VDEOXPLN_IDS = Object.freeze({
  sourceFiles: "agentic-graph-source-files",
  agentReady: "agentic-graph-agent-ready",
  localMcp: "agentic-graph-mcp-local",
  chatToCanvas: "agentic-graph-chat-to-canvas",
  strybldr: "agentic-graph-strybldr",
  researchVisual: "agentic-graph-research-visual",
  memoryLayer: "agentic-graph-memory-layer", aiShowrunner: "agentic-graph-ai-showrunner", htmlVideoRenderer: "agentic-graph-html-video-renderer", videoAgent: "agentic-graph-video-agent", visualAnnotationEngine: "agentic-graph-visual-annotation-engine", voiceStudio: "agentic-graph-ai-voice-studio", applicationComposition: "agentic-graph-application-composition", commerceReadiness: "agentic-graph-commerce-readiness",
});
const normalizeString = (value) => String(value || "").trim();

const normalizeStringArray = (values) =>
  Array.from(new Set((Array.isArray(values) ? values : [])
    .map(normalizeString)
    .filter(Boolean)))
    .sort((left, right) => left.localeCompare(right));

const normalizeOrderedStringArray = (values) => {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
};

export const stableStringifyVdeoxplnValue = stableStringify;

export const buildAgenticGraphVdeoxplnSemanticKey = (scope, parts) => {
  const normalizedScope = normalizeString(scope) || "vdeoxpln";
  return `kgvx_${hashSemanticParts([
    normalizedScope,
    AGENTIC_OS_VDEOXPLN_CONTRACT_VERSION,
    stableStringifyVdeoxplnValue(parts),
  ])}`;
};

const buildPublishedToolNames = () =>
  buildAgenticGraphAgentReadyToolContracts({ defaultWorkspaceId: AGENTIC_OS_AGENT_READY_DEFAULT_WORKSPACE_ID })
    .map((tool) => tool.name);

const buildBrowserToolContracts = () =>
  buildAgenticGraphAgentReadyToolContracts({
    defaultWorkspaceId: AGENTIC_OS_AGENT_READY_DEFAULT_WORKSPACE_ID,
    includeBrowserOnlyTools: true,
  });

const buildBrowserToolNames = () => buildBrowserToolContracts().map((tool) => tool.name);

const buildReadOnlyBrowserToolNames = () => {
  const publishedToolNames = new Set(buildPublishedToolNames());
  return buildBrowserToolContracts()
    .filter((tool) => tool.annotations?.readOnlyHint === true && !publishedToolNames.has(tool.name))
    .map((tool) => tool.name);
};

const RAW_VDEOXPLN = buildRawAgenticGraphVdeoxplnRegistry({
  AGENTIC_OS_VDEOXPLN_IDS,
  AGENTIC_OS_AGENT_READY_TOOL_IDS,
  AGENTIC_OS_LOCAL_MCP_TOOL_NAMES,
  buildAgenticGraphLocalMcpToolNameList,
  buildReadOnlyBrowserToolNames,
  buildAgenticGraphApplicationCompositionVdeoxpln,
});

const normalizeVdeoxpln = (vdeoxpln) => {
  const normalizedTools = {
    published: normalizeStringArray(vdeoxpln.tools?.published),
    browserLocal: normalizeStringArray(vdeoxpln.tools?.browserLocal),
    local: normalizeStringArray(vdeoxpln.tools?.local),
  };
  const semanticKey = buildAgenticGraphVdeoxplnSemanticKey(vdeoxpln.id, {
    id: vdeoxpln.id,
    scope: vdeoxpln.scope,
    mutation: vdeoxpln.mutation,
    owners: normalizeStringArray(vdeoxpln.owners),
    tools: normalizedTools,
    triggers: normalizeStringArray(vdeoxpln.triggers),
    outputs: normalizeStringArray(vdeoxpln.outputs),
    workflow: normalizeOrderedStringArray(vdeoxpln.workflow),
    artifactPolicy: vdeoxpln.artifactPolicy || {},
    aiPolicy: vdeoxpln.aiPolicy || {},
  });
  const path = `/.well-known/agent-skills/${vdeoxpln.id}.md`;
  return Object.freeze({
    ...vdeoxpln,
    version: AGENTIC_OS_VDEOXPLN_CONTRACT_VERSION,
    triggers: normalizeStringArray(vdeoxpln.triggers),
    inputs: normalizeStringArray(vdeoxpln.inputs),
    outputs: normalizeStringArray(vdeoxpln.outputs),
    owners: normalizeStringArray(vdeoxpln.owners),
    tools: Object.freeze(normalizedTools),
    workflow: normalizeOrderedStringArray(vdeoxpln.workflow),
    validation: normalizeStringArray(vdeoxpln.validation),
    publish: normalizeStringArray(vdeoxpln.publish),
    semanticKey,
    agentSkill: Object.freeze({
      name: vdeoxpln.id,
      type: "markdown",
      description: vdeoxpln.purpose,
      path,
    }),
  });
};

export const buildAgenticGraphVdeoxplnRegistry = () =>
  RAW_VDEOXPLN.map(normalizeVdeoxpln)
    .sort((left, right) => left.id.localeCompare(right.id));

export const buildAgenticGraphVdeoxplnToolNameSets = () => ({
  published: new Set(buildPublishedToolNames()),
  browserLocal: new Set(buildBrowserToolNames()),
  local: new Set(Object.values(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES)),
});

export const validateAgenticGraphVdeoxplnRegistry = (registry = buildAgenticGraphVdeoxplnRegistry()) => {
  const errors = [];
  const ids = new Set();
  const toolSets = buildAgenticGraphVdeoxplnToolNameSets();
  for (const vdeoxpln of registry) {
    if (!vdeoxpln.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(vdeoxpln.id)) {
      errors.push(`${vdeoxpln.id || "(missing)"}: invalid provider-neutral id`);
    }
    if (ids.has(vdeoxpln.id)) errors.push(`${vdeoxpln.id}: duplicate vdeoxpln id`);
    ids.add(vdeoxpln.id);
    if (Array.isArray(vdeoxpln.aliases) && vdeoxpln.aliases.length > 0) {
      errors.push(`${vdeoxpln.id}: compatibility aliases are forbidden`);
    }
    if (!vdeoxpln.semanticKey || !vdeoxpln.semanticKey.startsWith("kgvx_")) {
      errors.push(`${vdeoxpln.id}: missing semantic key`);
    }
    for (const owner of vdeoxpln.owners || []) {
      if (owner.startsWith("/") || owner.includes("..")) {
        errors.push(`${vdeoxpln.id}: owner must be repo-relative and neutral (${owner})`);
      }
    }
    for (const [scope, tools] of Object.entries(vdeoxpln.tools || {})) {
      for (const toolName of tools || []) {
        if (!toolSets[scope]?.has(toolName)) {
          errors.push(`${vdeoxpln.id}: ${scope} tool does not resolve (${toolName})`);
        }
      }
    }
    if (vdeoxpln.aiPolicy?.mode !== "none") {
      if (!vdeoxpln.aiPolicy?.maxAttempts || Number(vdeoxpln.aiPolicy.maxAttempts) < 1) {
        errors.push(`${vdeoxpln.id}: AI policy must declare bounded maxAttempts`);
      }
      if (typeof vdeoxpln.aiPolicy?.fallback === "undefined") {
        errors.push(`${vdeoxpln.id}: AI policy must declare fallback`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
};

const VDEOXPLN_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "this",
  "to",
  "with",
]);

const tokenizeVdeoxplnText = (value) =>
  Array.from(new Set(String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part && part.length > 1 && !VDEOXPLN_STOP_WORDS.has(part))))
    .sort((left, right) => left.localeCompare(right));

const normalizeRoutingArray = (values) => normalizeStringArray(values).slice(0, 24);

const buildVdeoxplnRoutingSignalText = (args = {}) => {
  const stateSignals = [
    args.intentText,
    args.contentType,
    ...normalizeRoutingArray(args.contentTypes),
    args.requestedOutput,
    ...normalizeRoutingArray(args.requestedOutputs),
    ...normalizeRoutingArray(args.stateSignals),
  ];
  if (args.chatStorageTarget === "chatAgenticGraph") {
    stateSignals.push("kgc markdown graph canvas workspace artifact");
  } else if (args.chatStorageTarget === "chatHistory") {
    stateSignals.push("chat history narrative");
  }
  if (Number(args.sourceFileCount || 0) > 0 || args.hasSourceFiles === true) {
    stateSignals.push("source files source evidence workspace context");
  }
  if (args.hasGraphData === true) stateSignals.push("graph canvas topology");
  if (args.hasSelection === true) stateSignals.push("selection context");
  if (args.hasWorkspaceDocument === true) stateSignals.push("workspace document markdown");
  return stateSignals.map(normalizeString).filter(Boolean).join("\n");
};

const phraseMatchesSignal = (phrase, signalText, signalTokens) => {
  const normalizedPhrase = normalizeString(phrase).toLowerCase();
  if (!normalizedPhrase) return false;
  if (signalText.includes(normalizedPhrase)) return true;
  const phraseTokens = tokenizeVdeoxplnText(normalizedPhrase);
  if (phraseTokens.length === 0) return false;
  return phraseTokens.every((token) => signalTokens.has(token));
};

const scoreVdeoxplnForRouting = (vdeoxpln, signalText, signalTokens) => {
  const reasons = [];
  let score = 0;
  const addMatches = (label, values, weight) => {
    for (const value of values || []) {
      if (!phraseMatchesSignal(value, signalText, signalTokens)) continue;
      const tokens = tokenizeVdeoxplnText(value);
      const valueScore = weight + Math.min(4, tokens.length);
      score += valueScore;
      reasons.push(`${label}:${value}`);
    }
  };
  addMatches("trigger", vdeoxpln.triggers, 6);
  addMatches("input", vdeoxpln.inputs, 3);
  addMatches("output", vdeoxpln.outputs, 4);
  const toolRoutingAliases = vdeoxpln.id === AGENTIC_OS_VDEOXPLN_IDS.localMcp
    ? []
    : buildVdeoxplnToolRoutingAliases(vdeoxpln.tools);
  addMatches("tool", toolRoutingAliases, 8);
  addMatches("profile", [vdeoxpln.id, String(vdeoxpln.id || "").replace(/^agentic-graph-/, ""), vdeoxpln.title], 7);
  if (String(vdeoxpln.artifactPolicy?.graphMaterialization || "none") !== "none") {
    if (signalTokens.has("graph") || signalTokens.has("canvas") || signalTokens.has("kgc")) {
      score += 4;
      reasons.push("state:graph-materialization");
    }
  }
  if (String(vdeoxpln.artifactPolicy?.persistence || "").includes("source-files")) {
    if (signalTokens.has("source") || signalTokens.has("workspace") || signalTokens.has("artifact")) {
      score += 3;
      reasons.push("state:source-backed-artifact");
    }
  }
  return { score, reasons };
};

const buildVdeoxplnExecutionStages = (vdeoxpln) => {
  const graphMaterialization = String(vdeoxpln.artifactPolicy?.graphMaterialization || "none");
  const persistence = String(vdeoxpln.artifactPolicy?.persistence || "none");
  const stages = [
    {
      id: "registry",
      kind: "deterministic",
      owner: "canvas/src/features/agent-ready/agentic-graph-vdeoxpln-contract.mjs",
      summary: "Load the canonical vdeoxpln registry and selected vdeoxpln metadata.",
    },
  ];
  if (persistence.includes("workspace") || persistence.includes("source-files")) {
    stages.push({
      id: "source-backed-artifact",
      kind: "deterministic",
      owner: "canvas/src/features/workspace-fs/workspaceFs.ts",
      summary: "Persist material run state as a workspace document so Source Files can inspect it.",
    });
  }
  if (persistence.includes("source-files")) {
    stages.push({
      id: "source-files",
      kind: "deterministic",
      owner: "canvas/src/features/source-files/applyComposedGraphFromSourceFiles.ts",
      summary: "Reuse Source Files composition and signatures for graph-producing artifacts.",
    });
  }
  if (vdeoxpln.aiPolicy?.mode && vdeoxpln.aiPolicy.mode !== "none") {
    stages.push({
      id: "floating-panel-chat",
      kind: "ai-assisted",
      owner: "canvas/src/features/chat/floatingPanelChat/floatingPanelChatSubmitCoordinator.ts",
      summary: "Use the FloatingPanel Chat harness for provider calls, bounded retries, cost visibility, and fallback state.",
      maxAttempts: vdeoxpln.aiPolicy.maxAttempts,
      tokenBudget: vdeoxpln.aiPolicy.tokenBudget,
      fallback: vdeoxpln.aiPolicy.fallback,
    });
  }
  if (graphMaterialization === "kgc-validation-to-canvas-apply") {
    stages.push(
      {
        id: "kgc-validation",
        kind: "deterministic",
        owner: "canvas/src/features/chat/chatMarkdownValidation.ts",
        summary: "Validate structured KGC Markdown before graph apply.",
      },
      {
        id: "canvas-apply",
        kind: "deterministic",
        owner: "canvas/src/features/chat/chatKgcCanvasApply.ts",
        summary: "Apply only validated KGC workspace documents through the existing Canvas path.",
      },
    );
  }
  return stages;
};

export const buildAgenticGraphVdeoxplnRoutingPlan = (args = {}) => {
  const registry = Array.isArray(args.registry) ? args.registry : buildAgenticGraphVdeoxplnRegistry();
  const signalText = buildVdeoxplnRoutingSignalText(args).toLowerCase();
  const signalTokens = new Set(tokenizeVdeoxplnText(signalText));
  const routeOnlyContext = !signalText.trim() && Boolean(
    normalizeString(args.routePath)
    || normalizeString(args.filePath)
    || normalizeString(args.absolutePath)
    || normalizeString(args.url),
  );
  if (signalTokens.size === 0) {
    return {
      status: "declined",
      reason: routeOnlyContext
        ? "Route, URL, and file path values are intentionally ignored for vdeoxpln routing."
        : "No intent, content type, state, or capability signal was provided.",
      signalTokens: [],
      ignoredContextKeys: ["routePath", "filePath", "absolutePath", "url"],
      rankedVdeoxpln: [],
    };
  }

  const rankedVdeoxpln = registry
    .map((vdeoxpln) => {
      const match = scoreVdeoxplnForRouting(vdeoxpln, signalText, signalTokens);
      return {
        id: vdeoxpln.id,
        title: vdeoxpln.title,
        score: match.score,
        reasons: match.reasons,
        semanticKey: vdeoxpln.semanticKey,
      };
    })
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  const selectedRank = rankedVdeoxpln[0] || null;
  if (!selectedRank || selectedRank.score < 6) {
    return {
      status: "declined",
      reason: "No vdeoxpln matched the provided neutral intent and state signals.",
      signalTokens: Array.from(signalTokens).sort((left, right) => left.localeCompare(right)),
      ignoredContextKeys: ["routePath", "filePath", "absolutePath", "url"],
      rankedVdeoxpln,
    };
  }
  const selectedVdeoxpln = registry.find((vdeoxpln) => vdeoxpln.id === selectedRank.id);
  const semanticRunKey = buildAgenticGraphVdeoxplnSemanticKey("vdeoxpln-run", {
    vdeoxplnId: selectedVdeoxpln.id,
    vdeoxplnSemanticKey: selectedVdeoxpln.semanticKey,
    signalTokens: Array.from(signalTokens).sort((left, right) => left.localeCompare(right)),
    chatStorageTarget: normalizeString(args.chatStorageTarget),
    sourceFileCount: Number(args.sourceFileCount || 0),
    hasGraphData: args.hasGraphData === true,
    hasSelection: args.hasSelection === true,
    hasWorkspaceDocument: args.hasWorkspaceDocument === true,
  });
  return {
    status: "selected",
    reason: `Selected ${selectedVdeoxpln.id} from neutral trigger, input, output, and current-state signals.`,
    selectedVdeoxplnId: selectedVdeoxpln.id,
    selectedVdeoxpln: {
      id: selectedVdeoxpln.id,
      title: selectedVdeoxpln.title,
      purpose: selectedVdeoxpln.purpose,
      scope: selectedVdeoxpln.scope,
      mutation: selectedVdeoxpln.mutation,
      semanticKey: selectedVdeoxpln.semanticKey,
      owners: selectedVdeoxpln.owners,
      tools: selectedVdeoxpln.tools,
      artifactPolicy: selectedVdeoxpln.artifactPolicy,
      aiPolicy: selectedVdeoxpln.aiPolicy,
    },
    semanticRunKey,
    signalTokens: Array.from(signalTokens).sort((left, right) => left.localeCompare(right)),
    ignoredContextKeys: ["routePath", "filePath", "absolutePath", "url"],
    rankedVdeoxpln,
    executionStages: buildVdeoxplnExecutionStages(selectedVdeoxpln),
    artifactContract: {
      persistence: selectedVdeoxpln.artifactPolicy?.persistence || "none",
      graphMaterialization: selectedVdeoxpln.artifactPolicy?.graphMaterialization || "none",
      outputs: selectedVdeoxpln.outputs,
      semanticKeyInputs: selectedVdeoxpln.artifactPolicy?.semanticKeyInputs || [],
    },
  };
};

export const buildAgenticGraphVdeoxplnChatSystemPrompt = (plan) => {
  if (!plan || plan.status !== "selected" || !plan.selectedVdeoxpln) return "";
  const stageLines = (plan.executionStages || [])
    .map((stage) => `- ${stage.id}: ${stage.summary}`)
    .join("\n");
  return [
    "agentic-graph vdeoxpln execution contract:",
    `- Selected vdeoxpln: ${plan.selectedVdeoxpln.id}`,
    `- Semantic run key: ${plan.semanticRunKey}`,
    `- Persistence: ${plan.artifactContract?.persistence || "none"}`,
    `- Graph materialization: ${plan.artifactContract?.graphMaterialization || "none"}`,
    `- AI max attempts: ${String(plan.selectedVdeoxpln.aiPolicy?.maxAttempts ?? 0)}`,
    `- AI token budget: ${String(plan.selectedVdeoxpln.aiPolicy?.tokenBudget ?? 0)}`,
    `- AI fallback: ${plan.selectedVdeoxpln.aiPolicy?.fallback || "Return deterministic errors without model calls."}`,
    ...buildVdeoxplnToolPromptLines(plan.selectedVdeoxpln.tools),
    "Invoke only tools exposed by the active request or connected runtime. If a selected tool is unavailable, return its exact name and required inputs as a handoff instead of claiming execution.",
    "Use deterministic source, validation, and canvas owners for exact graph state. Use provider output only for the AI-assisted stage already routed through this FloatingPanel Chat harness.",
    "Do not infer vdeoxpln selection from route names, file names, absolute paths, demo fixtures, or compatibility aliases.",
    "Stages:",
    stageLines || "- registry: Load the selected vdeoxpln contract.",
  ].join("\n");
};

export const buildAgenticGraphVdeoxplnAgentSkillDefinitions = (
  registry = buildAgenticGraphVdeoxplnRegistry(),
) => registry.map((vdeoxpln) => ({
  ...vdeoxpln.agentSkill,
  vdeoxpln: {
    id: vdeoxpln.id,
    title: vdeoxpln.title,
    scope: vdeoxpln.scope,
    mutation: vdeoxpln.mutation,
    semanticKey: vdeoxpln.semanticKey,
    tools: vdeoxpln.tools,
    publish: vdeoxpln.publish,
  },
}));

const markdownList = (values) =>
  values && values.length ? values.map((value) => `- ${value}`).join("\n") : "- none";

export const buildAgenticGraphVdeoxplnMarkdown = (vdeoxpln) => `# ${vdeoxpln.title} Skill

Use this skill when: ${vdeoxpln.purpose}

## Contract

- Vdeoxpln id: \`${vdeoxpln.id}\`
- Contract version: \`${vdeoxpln.version}\`
- Semantic key: \`${vdeoxpln.semanticKey}\`
- Scope: \`${vdeoxpln.scope}\`
- Mutation boundary: \`${vdeoxpln.mutation}\`

## Triggers

${markdownList(vdeoxpln.triggers)}

## Inputs

${markdownList(vdeoxpln.inputs)}

## Outputs

${markdownList(vdeoxpln.outputs)}

## Tools

Published tools:
${markdownList(vdeoxpln.tools.published)}

Browser-local tools:
${markdownList(vdeoxpln.tools.browserLocal)}

Local MCP tools:
${markdownList(vdeoxpln.tools.local)}

## Workflow

${markdownList(vdeoxpln.workflow)}

## Source Owners

${markdownList(vdeoxpln.owners)}

## Artifact Policy

- Persistence: \`${vdeoxpln.artifactPolicy?.persistence || "none"}\`
- Graph materialization: \`${vdeoxpln.artifactPolicy?.graphMaterialization || "none"}\`
- Semantic-key inputs:
${markdownList(vdeoxpln.artifactPolicy?.semanticKeyInputs || [])}

## AI Policy

- Mode: \`${vdeoxpln.aiPolicy?.mode || "none"}\`
- Max attempts: \`${String(vdeoxpln.aiPolicy?.maxAttempts ?? 0)}\`
- Token budget: \`${String(vdeoxpln.aiPolicy?.tokenBudget ?? 0)}\`
- Fallback: ${vdeoxpln.aiPolicy?.fallback || "Return deterministic errors without model calls."}

## Validation

${markdownList(vdeoxpln.validation)}

## Guardrails

- Keep behavior source-owned in the listed agentic-graph owners.
- Do not add compatibility aliases for stale vdeoxpln ids.
- Do not route by absolute paths, demo filenames, provider keys, or public route labels.
- Do not copy external vdeoxpln source, prompts, schemas, examples, assets, or prose.
`;

export const buildAgenticGraphVdeoxplnMarkdownByName = (
  registry = buildAgenticGraphVdeoxplnRegistry(),
) => Object.fromEntries(registry.map((vdeoxpln) => [vdeoxpln.id, buildAgenticGraphVdeoxplnMarkdown(vdeoxpln)]));
