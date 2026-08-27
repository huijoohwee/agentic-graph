export const AGENTICGRAPH_PROBE_TREE_CONTRACT_VERSION = "agenticgraph-probe-tree/v0.1";
export const PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION = "probe-tree-llm-response/v5";

import {
  PROBE_TREE_MULTI_SELECT_LIMITS,
  areProbeTreeCardsMutuallyDistinct,
  cleanProbeTreeResponseText,
  isProbeTreeCardUserInputRelevant,
  isProbeTreeTerminalGenerationRequest,
  normalizeProbeTreeSelectionOptions,
  resolveProbeTreeTerminalGenerationRequest,
  resolveProbeTreeContextAnchors,
  safeProbeTreeResponseId,
} from "./probeTreeUserInputRelevance.mjs";
import { buildRichMediaTextMarkdownDocument } from "../rich-media/richMediaTextMarkdownContract.mjs";

export {
  PROBE_TREE_MULTI_SELECT_LIMITS,
  areProbeTreeContinuationChoicesSuggested,
  areProbeTreeCardsMutuallyDistinct,
  collectProbeTreeContextKeywords,
  extractProbeTreeClarificationContextText,
  extractProbeTreeUserInputText,
  isProbeTreeCardUserInputRelevant,
  isProbeTreeTerminalGenerationRequest,
  normalizeProbeTreeContextAnchors,
  normalizeProbeTreeSelectionOptions,
  resolveProbeTreeTerminalGenerationRequest,
  resolveProbeTreeContextAnchors,
} from "./probeTreeUserInputRelevance.mjs";

export const PROBE_TREE_CARD_VARIANTS = Object.freeze({
  openAnswer: "probe-tree-type-1",
  boundedMultiSelect: "probe-tree-type-2",
});

export const AGENTICGRAPH_PROBE_TREE_TOOL_NAMES = Object.freeze({
  generate: "agenticgraph.probe.generate",
  select: "agenticgraph.probe.select",
  evolve: "agenticgraph.probe.evolve",
});

export const PROBE_TREE_DEFAULTS = Object.freeze({
  optionCount: 3,
  minOptionCount: 2,
  maxOptionCount: 4,
  recallTopK: 5,
  tokenBudget: 1200,
  optionCompletionTokenEstimate: 64,
  maxDepth: 8,
  appMemoryScope: "agenticgraph-probe-tree",
});

const boundedResponseInteger = (value, fallback, min, max) => {
  const parsed = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback;
  return Math.max(min, Math.min(max, parsed));
};

const buildStructuredResponseOptions = ({ options, optionCount, degraded, contextText }) => {
  const candidates = Array.isArray(options) ? options : [];
  const seen = new Set();
  const out = [];
  for (const candidate of candidates) {
    const question = cleanProbeTreeResponseText(candidate?.text || candidate?.question);
    if (!question || seen.has(question.toLowerCase())) continue;
    seen.add(question.toLowerCase());
    const index = out.length;
    const candidateOptionId = cleanProbeTreeResponseText(candidate?.id, 160)
      || `probe-option-${safeProbeTreeResponseId(question, String(index + 1)).slice(0, 72)}-${index + 1}`;
    const selectionOptions = normalizeProbeTreeSelectionOptions(candidate?.selectionOptions);
    const contextAnchors = resolveProbeTreeContextAnchors({
      contextText,
      question,
      contextAnchors: candidate?.contextAnchors || candidate?.context_anchors,
    });
    if (!isProbeTreeCardUserInputRelevant({ contextText, question, selectionOptions, contextAnchors })) continue;
    if (!areProbeTreeCardsMutuallyDistinct([
      ...out.map(card => ({ question: card.question, selectionOptions: card.selectionOptions })),
      { question, selectionOptions },
    ])) continue;
    out.push({
      id: candidateOptionId,
      label: cleanProbeTreeResponseText(candidate?.label, 120) || question,
      kind: "text",
      candidateOptionId,
      question,
      output: "",
      probeTreeCardVariant: PROBE_TREE_CARD_VARIANTS.boundedMultiSelect,
      selectionMode: "multiple",
      selectionOptions,
      contextAnchors,
      allowOther: true,
      rationale: cleanProbeTreeResponseText(candidate?.rationale),
      evidenceNeeded: cleanProbeTreeResponseText(candidate?.evidenceNeeded || candidate?.evidence_needed),
      confidence: cleanProbeTreeResponseText(candidate?.confidence, 32) || (degraded ? "low" : "medium"),
      nextAction: AGENTICGRAPH_PROBE_TREE_TOOL_NAMES.select,
    });
    if (out.length >= optionCount) break;
  }
  return out;
};

export function buildProbeTreeStructuredResponse(args = {}) {
  const currentNodeId = cleanProbeTreeResponseText(args.currentNodeId || args.current_node_id, 160) || "n-deliver";
  const threadRootId = cleanProbeTreeResponseText(args.threadRootId || args.thread_root_id, 160) || currentNodeId;
  const contextText = cleanProbeTreeResponseText(args.contextText || args.context_text, 12_000);
  const optionCount = boundedResponseInteger(
    args.optionCount,
    Array.isArray(args.options) ? args.options.length : PROBE_TREE_DEFAULTS.optionCount,
    PROBE_TREE_DEFAULTS.minOptionCount,
    PROBE_TREE_DEFAULTS.maxOptionCount,
  );
  const probeTreeDepth = boundedResponseInteger(args.probeTreeDepth || args.probe_tree_depth, 1, 1, PROBE_TREE_DEFAULTS.maxDepth);
  const cards = buildStructuredResponseOptions({ options: args.options, optionCount, degraded: args.degraded === true, contextText })
    .map(card => ({ ...card, parentNodeId: currentNodeId, probeTreeDepth }));
  const panelId = `probe-tree-branches-${safeProbeTreeResponseId(currentNodeId, "current-node")}`;
  const panelBody = [
    "# Probe-Tree Branches",
    "",
    `\`source=${currentNodeId} · contract=${PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION}\``,
    "",
    ...cards.flatMap((card, index) => [
      `${index + 1}. **${card.question}**`,
      ...card.selectionOptions.map((option, optionIndex) => `   ${optionIndex + 1}. ${option.label}`),
      ...(card.rationale ? [`   _${card.rationale}_`] : []),
      ...(card.evidenceNeeded ? [`   > ${card.evidenceNeeded}`] : []),
    ]),
  ].join("\n");
  const panelOutput = buildRichMediaTextMarkdownDocument({
    body: panelBody,
    title: "Probe-Tree Branches",
    sourceContract: AGENTICGRAPH_PROBE_TREE_CONTRACT_VERSION,
  });
  return {
    structuredContent: {
      contractVersion: PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION,
      widgets: [{
        id: currentNodeId,
        label: `Probe source: ${currentNodeId}`,
        kind: "text",
        nodeTypeId: "TextGeneration",
        formId: "textGeneration",
        widgetTypeId: "default",
        prompt: contextText,
        output: contextText,
        cardTypeLabel: "Widget Card",
        lane: "SOURCE",
        invocation: AGENTICGRAPH_PROBE_TREE_TOOL_NAMES.generate,
        responseContractVersion: PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION,
        probeTreeThreadRootId: threadRootId,
        probeTreeCurrentNodeId: currentNodeId,
      }],
      cards,
      panels: [{
        id: panelId,
        label: "Probe-Tree Branches",
        kind: "text",
        output: panelOutput,
        responseContractVersion: PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION,
        probeTreeThreadRootId: threadRootId,
        probeTreeCurrentNodeId: currentNodeId,
        probeTreeOptionCount: cards.length,
      }],
      edges: [{
        id: `${panelId}-summary`,
        source: currentNodeId,
        sourceHandle: "text_out",
        target: panelId,
        targetHandle: "output",
        label: "probeTreeSummary",
      }],
    },
  };
}

const optionSchema = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["id", "text", "rationale", "evidenceNeeded", "selectionOptions", "contextAnchors"],
  properties: {
    id: { type: "string" },
    text: { type: "string" },
    rationale: { type: "string" },
    evidenceNeeded: { type: "string" },
    selectionOptions: { type: "array", minItems: 2, maxItems: 4 },
    contextAnchors: { type: "array", minItems: 2, maxItems: 6, items: { type: "string" } },
  },
});

const costLogSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["model", "prompt_tokens", "completion_tokens", "cache_hits", "estimated_cost_usd"],
  properties: {
    model: { type: "string" },
    prompt_tokens: { type: "number" },
    completion_tokens: { type: "number" },
    cache_hits: { type: "number" },
    estimated_cost_usd: { oneOf: [{ type: "number" }, { type: "null" }] },
  },
});

export const PROBE_GENERATE_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["thread_root_id", "current_node_id"],
  properties: {
    thread_root_id: { type: "string", minLength: 1 },
    current_node_id: { type: "string", minLength: 1 },
    context_text: { type: "string" },
    k: { type: "integer", minimum: PROBE_TREE_DEFAULTS.minOptionCount, maximum: PROBE_TREE_DEFAULTS.maxOptionCount, default: PROBE_TREE_DEFAULTS.optionCount },
    recall_top_k: { type: "integer", minimum: 0, maximum: 20, default: PROBE_TREE_DEFAULTS.recallTopK },
    token_budget: { type: "integer", minimum: 1, default: PROBE_TREE_DEFAULTS.tokenBudget },
    probe_tree_depth: { type: "integer", minimum: 1, maximum: PROBE_TREE_DEFAULTS.maxDepth, default: 1 },
    graph_store_dir: { type: "string" },
  },
});

export const PROBE_SELECT_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["thread_root_id", "parent_node_id", "chosen_option"],
  properties: {
    thread_root_id: { type: "string", minLength: 1 },
    parent_node_id: { type: "string", minLength: 1 },
    chosen_option: optionSchema,
    context_text: { type: "string" },
    terminal: { type: "boolean", default: false },
    graph_store_dir: { type: "string" },
  },
});

export const PROBE_EVOLVE_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["thread_root_id"],
  properties: {
    thread_root_id: { type: "string", minLength: 1 },
    terminal_node_id: { type: "string" },
    resolved: { type: "boolean", default: true },
    rating: { type: "number", minimum: 0, maximum: 1 },
    allow_partial_path: { type: "boolean", default: false },
    graph_store_dir: { type: "string" },
  },
});

export const PROBE_GENERATE_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["contractVersion", "ok", "options", "response", "cost_log"],
  properties: {
    contractVersion: { type: "string" },
    ok: { type: "boolean" },
    options: { type: "array", maxItems: PROBE_TREE_DEFAULTS.maxOptionCount, items: optionSchema },
    response: {
      type: "object",
      additionalProperties: false,
      required: ["structuredContent"],
      properties: {
        structuredContent: {
          type: "object",
          additionalProperties: true,
          required: ["contractVersion", "widgets", "cards", "panels", "edges"],
          properties: {
            contractVersion: { const: PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION },
            widgets: { type: "array", minItems: 1, maxItems: 1, items: { type: "object", additionalProperties: true } },
            cards: { type: "array", maxItems: PROBE_TREE_DEFAULTS.maxOptionCount, items: { type: "object", additionalProperties: true } },
            panels: { type: "array", minItems: 1, maxItems: 1, items: { type: "object", additionalProperties: true } },
            edges: { type: "array", items: { type: "object", additionalProperties: true } },
          },
        },
      },
    },
    degraded: { type: "boolean" },
    recalled_exemplars: { type: "array", items: { type: "object", additionalProperties: true } },
    token_budget: { type: "object", additionalProperties: true },
    cost_log: costLogSchema,
  },
});

export const PROBE_SELECT_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["contractVersion", "ok", "new_node_id", "edge_id", "node_path", "cost_log"],
  properties: {
    contractVersion: { type: "string" },
    ok: { type: "boolean" },
    new_node_id: { type: "string" },
    edge_id: { type: "string" },
    node_path: { type: "string" },
    checkpoint: { type: "object", additionalProperties: true },
    cost_log: costLogSchema,
  },
});

export const PROBE_EVOLVE_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["contractVersion", "ok", "updated_scores", "exemplar_id", "cost_log"],
  properties: {
    contractVersion: { type: "string" },
    ok: { type: "boolean" },
    updated_scores: { type: "array", items: { type: "object", additionalProperties: true } },
    exemplar_id: { type: "string" },
    complete_path_scored: { type: "boolean" },
    unscored_parent_node_ids: { type: "array", items: { type: "string" } },
    cost_log: costLogSchema,
  },
});
