import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  AGENTIC_OS_PROBE_TREE_CONTRACT_VERSION,
  AGENTIC_OS_PROBE_TREE_TOOL_NAMES,
  PROBE_TREE_DEFAULTS,
  buildProbeTreeStructuredResponse,
  isProbeTreeCardUserInputRelevant,
  normalizeProbeTreeSelectionOptions,
  resolveProbeTreeContextAnchors,
} from "../canvas/src/features/agent-ready/probeTreeContract.mjs";
import {
  addMemoryLayerMemory,
  searchMemoryLayerMemories,
} from "./memory-layer-runtime.js";
import { estimateMemoryTokens } from "../canvas/src/features/memory/aiAgentsMemoryLayerContract.mjs";
import { buildProbeModelPrompt, generateProbeOptionsWithLocalModel } from "./probe-tree-model-adapter.js";

const STORE_SCHEMA = "agentic-os-computing-flow/v1";
const NODE_TYPE = "probe";
const EDGE_TYPE = "branches-to";

const nowIso = () => new Date().toISOString();
const normalizeString = (value) => String(value || "").replace(/\s+/g, " ").trim();
const hashParts = (prefix, parts) =>
  `${prefix}_${createHash("sha256").update(parts.map((part) => String(part || "")).join("\n")).digest("hex").slice(0, 16)}`;

const safeId = (value, fallback) => {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
};

const zeroCostLog = (model = "none") => ({
  model,
  prompt_tokens: 0,
  completion_tokens: 0,
  cache_hits: 0,
  estimated_cost_usd: 0,
});

const estimateCompletionTokens = (k) => k * PROBE_TREE_DEFAULTS.optionCompletionTokenEstimate;

const boundedInteger = ({ value, fallback, min, max }) => {
  const raw = value === null || value === undefined || String(value).trim() === "" ? NaN : Number(value);
  const parsed = Number.isFinite(raw) ? Math.floor(raw) : fallback;
  return Math.max(min, Math.min(max, parsed));
};

const buildTokenBudgetReport = ({ tokenBudget, promptTokens, completionTokens, recalledCount }) => ({
  budget: tokenBudget,
  estimated_prompt_tokens: promptTokens,
  estimated_completion_tokens: completionTokens,
  estimated_total_tokens: promptTokens + completionTokens,
  recalled_exemplar_count: recalledCount,
  within_budget: promptTokens + completionTokens <= tokenBudget,
});

const defaultGraphStoreDir = (rootDir) => path.join(rootDir, "data", "probe-tree");

const resolveStoreDir = ({ rootDir, graphStoreDir }) => {
  const configured = normalizeString(graphStoreDir);
  const resolved = configured ? path.resolve(rootDir, configured) : defaultGraphStoreDir(rootDir);
  const rel = path.relative(rootDir, resolved);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`graph_store_dir must resolve inside AGENTIC_OS_ROOT (${rootDir}).`);
  }
  return resolved;
};

const threadDir = (storeDir, threadRootId) => path.join(storeDir, "threads", safeId(threadRootId, "thread"), "nodes");
const nodePath = (storeDir, threadRootId, nodeId) => path.join(threadDir(storeDir, threadRootId), `${safeId(nodeId, "node")}.md`);

const parseScalar = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw.slice(1, -1);
    }
  }
  return raw;
};

const scalarYaml = (value) => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
  return JSON.stringify(String(value));
};

export function parseProbeMarkdown(markdown) {
  const text = String(markdown || "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return { frontmatter: {}, body: text };
  const endIndex = lines.slice(1).findIndex((line) => line.trim() === "---");
  if (endIndex < 0) return { frontmatter: {}, body: text };
  const frontmatter = {};
  for (const line of lines.slice(1, endIndex + 1)) {
    const match = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!match) continue;
    frontmatter[match[1]] = parseScalar(match[2]);
  }
  return { frontmatter, body: lines.slice(endIndex + 2).join("\n") };
}

export function serializeProbeMarkdown(frontmatter, body) {
  const keys = [
    "kgSchema",
    "probeTreeSchema",
    "type",
    "id",
    "thread_root_id",
    "parent_node_id",
    "status",
    "score",
    "depth",
    "checkpoint",
    "option",
    "edge",
    "flow",
  ];
  const ordered = [
    ...keys.filter((key) => Object.prototype.hasOwnProperty.call(frontmatter, key)),
    ...Object.keys(frontmatter).filter((key) => !keys.includes(key)).sort(),
  ];
  return [
    "---",
    ...ordered.map((key) => `${key}: ${scalarYaml(frontmatter[key])}`),
    "---",
    "",
    String(body || "").trim(),
    "",
  ].join("\n");
}

const readProbeNode = async (filePath) => {
  const raw = await fs.readFile(filePath, "utf8");
  return { filePath, raw, ...parseProbeMarkdown(raw) };
};

const listProbeNodes = async ({ rootDir, graphStoreDir, threadRootId }) => {
  const storeDir = resolveStoreDir({ rootDir, graphStoreDir });
  const dir = threadDir(storeDir, threadRootId);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const nodes = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      nodes.push(await readProbeNode(path.join(dir, entry.name)));
    }
    return nodes;
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
};

const pathRelativeToRoot = (rootDir, filePath) => path.relative(rootDir, filePath).replace(/\\/g, "/");

function buildProbeTreeStateGraphDefinition() {
  return {
    engine: "probe-tree-stategraph",
    langGraphCompatible: true,
    state: ["thread_root_id", "current_node_id", "context_text", "options", "checkpoint"],
    nodes: ["recall_exemplars", "generate_options", "persist_selection", "score_path", "write_exemplar"],
    edges: [
      { source: "START", target: "recall_exemplars" },
      { source: "recall_exemplars", target: "generate_options" },
      { source: "generate_options", target: "END" },
      { source: "persist_selection", target: "END" },
      { source: "score_path", target: "write_exemplar" },
      { source: "write_exemplar", target: "END" },
    ],
    checkpointer: "markdown-graph-store",
  };
}

const buildOptions = ({ contextText, generatedOptions = [], k }) => {
  const topic = normalizeString(contextText).slice(0, 220);
  const seen = new Set();
  const options = [];
  for (const candidate of generatedOptions) {
    const text = normalizeString(candidate.text);
    if (!text || seen.has(text.toLowerCase())) continue;
    const selectionOptions = normalizeProbeTreeSelectionOptions(candidate.selectionOptions);
    const contextAnchors = resolveProbeTreeContextAnchors({
      contextText,
      question: text,
      contextAnchors: candidate.contextAnchors,
    });
    if (!isProbeTreeCardUserInputRelevant({ contextText, question: text, selectionOptions, contextAnchors })) continue;
    seen.add(text.toLowerCase());
    options.push({
      id: hashParts("probe_option", [topic, text, options.length]),
      text,
      rationale: normalizeString(candidate.rationale),
      evidenceNeeded: normalizeString(candidate.evidenceNeeded),
      selectionOptions,
      contextAnchors,
    });
    if (options.length >= k) break;
  }
  return options;
};

const fitRecalledExemplarsToBudget = ({ contextText, recalledExemplars, k, tokenBudget }) => {
  const completionTokens = estimateCompletionTokens(k);
  const selected = [...recalledExemplars];
  let promptTokens = estimateMemoryTokens(buildProbeModelPrompt({ contextText, recalledExemplars: selected, k }));
  while (selected.length && promptTokens + completionTokens > tokenBudget) {
    selected.pop();
    promptTokens = estimateMemoryTokens(buildProbeModelPrompt({ contextText, recalledExemplars: selected, k }));
  }
  return {
    recalledExemplars: selected,
    report: buildTokenBudgetReport({
      tokenBudget,
      promptTokens,
      completionTokens,
      recalledCount: selected.length,
    }),
  };
};

export async function generateProbeOptions(input = {}, options = {}) {
  const startedAt = performance.now();
  const threadRootId = normalizeString(input.thread_root_id);
  const currentNodeId = normalizeString(input.current_node_id);
  if (!threadRootId) throw new Error("thread_root_id is required.");
  if (!currentNodeId) throw new Error("current_node_id is required.");
  const k = boundedInteger({ value: input.k, fallback: PROBE_TREE_DEFAULTS.optionCount, min: PROBE_TREE_DEFAULTS.minOptionCount, max: PROBE_TREE_DEFAULTS.maxOptionCount });
  const recallTopK = boundedInteger({ value: input.recall_top_k, fallback: PROBE_TREE_DEFAULTS.recallTopK, min: 0, max: 20 });
  const tokenBudget = boundedInteger({ value: input.token_budget, fallback: PROBE_TREE_DEFAULTS.tokenBudget, min: 1, max: Number.MAX_SAFE_INTEGER });
  const contextText = normalizeString(input.context_text) || `${threadRootId} ${currentNodeId}`;
  const memoryResult = recallTopK > 0
    ? await searchMemoryLayerMemories({
      query: contextText,
      app_id: PROBE_TREE_DEFAULTS.appMemoryScope,
      top_k: recallTopK,
    }, { rootDir: options.rootDir })
    : { results: [] };
  const recalledCandidates = Array.isArray(memoryResult.results) ? memoryResult.results : [];
  const budgetedRecall = fitRecalledExemplarsToBudget({ contextText, recalledExemplars: recalledCandidates, k, tokenBudget });
  const recalledExemplars = budgetedRecall.recalledExemplars;
  let modelResult = { configured: false, reason: "model_not_configured", options: [], costLog: null };
  if (budgetedRecall.report.within_budget) {
    try {
      modelResult = await generateProbeOptionsWithLocalModel({
        contextText,
        recalledExemplars,
        k,
        env: options.env || process.env,
        fetchImpl: options.fetchImpl || fetch,
      });
    } catch (error) {
      modelResult = {
        configured: true,
        reason: error instanceof Error ? error.message : String(error),
        options: [],
        costLog: null,
      };
    }
  } else {
    modelResult = { configured: false, reason: "token_budget_ceiling", options: [], costLog: null };
  }
  const resultOptions = buildOptions({ contextText, generatedOptions: modelResult.options, k });
  const modelConfigured = modelResult.configured === true;
  const modelSatisfied = modelConfigured && Array.isArray(modelResult.options) && modelResult.options.length > 0;
  const degraded = !modelSatisfied || resultOptions.length < k;
  const hasBoundedOptions = resultOptions.length >= PROBE_TREE_DEFAULTS.minOptionCount;
  const degradedReason = !budgetedRecall.report.within_budget
      ? "token_budget_ceiling"
    : !hasBoundedOptions
      ? "insufficient_user_input_context"
      : modelSatisfied
        ? (resultOptions.length < k ? "model_returned_fewer_than_k_options" : "")
        : modelResult.reason;
  const costLog = modelResult.costLog || zeroCostLog("none");
  return {
    contractVersion: AGENTIC_OS_PROBE_TREE_CONTRACT_VERSION,
    ok: hasBoundedOptions,
    thread_root_id: threadRootId,
    current_node_id: currentNodeId,
    options: resultOptions,
    recalled_exemplars: recalledExemplars,
    token_budget: budgetedRecall.report,
    model_adapter: {
      provider: modelResult.provider || "",
      model: modelResult.model || "",
      configured: modelConfigured,
    },
    degraded,
    degraded_reason: degradedReason,
    response: buildProbeTreeStructuredResponse({
      threadRootId,
      currentNodeId,
      contextText,
      options: resultOptions,
      optionCount: k,
      probeTreeDepth: input.probe_tree_depth,
      degraded,
    }),
    stateGraph: buildProbeTreeStateGraphDefinition(),
    latency_ms: Math.max(0, performance.now() - startedAt),
    cost_log: costLog,
  };
}

export async function selectProbeOption(input = {}, options = {}) {
  const threadRootId = normalizeString(input.thread_root_id);
  const parentNodeId = normalizeString(input.parent_node_id);
  const chosenOption = input.chosen_option && typeof input.chosen_option === "object" ? input.chosen_option : null;
  if (!threadRootId) throw new Error("thread_root_id is required.");
  if (!parentNodeId) throw new Error("parent_node_id is required.");
  if (!chosenOption || !normalizeString(chosenOption.text)) throw new Error("chosen_option.text is required.");

  const rootDir = options.rootDir || process.cwd();
  const storeDir = resolveStoreDir({ rootDir, graphStoreDir: input.graph_store_dir });
  const existingNodes = await listProbeNodes({ rootDir, graphStoreDir: input.graph_store_dir, threadRootId });
  const parentDepth = existingNodes.find((node) => node.frontmatter.id === parentNodeId)?.frontmatter.depth;
  const depth = Math.max(1, Math.floor(Number(parentDepth) || 0) + 1);
  if (depth > PROBE_TREE_DEFAULTS.maxDepth) throw new Error(`probe-tree max depth ${PROBE_TREE_DEFAULTS.maxDepth} reached.`);

  const timestamp = nowIso();
  const newNodeId = hashParts("probe_node", [threadRootId, parentNodeId, normalizeString(chosenOption.id), normalizeString(chosenOption.text), timestamp]);
  const edgeId = hashParts("probe_edge", [threadRootId, parentNodeId, newNodeId]);
  const status = input.terminal === true ? "resolved" : "active";
  const filePath = nodePath(storeDir, threadRootId, newNodeId);
  const frontmatter = {
    kgSchema: STORE_SCHEMA,
    probeTreeSchema: AGENTIC_OS_PROBE_TREE_CONTRACT_VERSION,
    type: NODE_TYPE,
    id: newNodeId,
    thread_root_id: threadRootId,
    parent_node_id: parentNodeId,
    status,
    score: 0,
    depth,
    checkpoint: {
      id: hashParts("probe_checkpoint", [threadRootId, newNodeId]),
      forked_from_node_id: parentNodeId,
      created_at: timestamp,
    },
    option: {
      id: normalizeString(chosenOption.id) || hashParts("probe_option", [chosenOption.text]),
      text: normalizeString(chosenOption.text),
      rationale: normalizeString(chosenOption.rationale),
    },
    edge: {
      id: edgeId,
      type: EDGE_TYPE,
      source: parentNodeId,
      target: newNodeId,
    },
    flow: {
      nodes: [{ id: newNodeId, label: normalizeString(chosenOption.text), type: NODE_TYPE, status }],
      edges: [{ id: edgeId, source: parentNodeId, target: newNodeId, type: EDGE_TYPE }],
    },
  };
  const body = ["# Probe Node", "", normalizeString(input.context_text) || normalizeString(chosenOption.text)].join("\n");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, serializeProbeMarkdown(frontmatter, body), { encoding: "utf8", flag: "wx" });
  return {
    contractVersion: AGENTIC_OS_PROBE_TREE_CONTRACT_VERSION,
    ok: true,
    new_node_id: newNodeId,
    edge_id: edgeId,
    node_path: pathRelativeToRoot(rootDir, filePath),
    parent_unchanged: true,
    checkpoint: frontmatter.checkpoint,
    stateGraph: buildProbeTreeStateGraphDefinition(),
    cost_log: zeroCostLog("probe-tree-select"),
  };
}

const findResolvedPath = (nodes, terminalNodeId) => {
  const byId = new Map(nodes.map((node) => [normalizeString(node.frontmatter.id), node]));
  const terminal = terminalNodeId
    ? byId.get(terminalNodeId)
    : nodes.find((node) => ["resolved", "terminal"].includes(normalizeString(node.frontmatter.status)));
  if (!terminal) throw new Error("No resolved probe node found. Pass terminal_node_id or mark a selected node terminal.");
  const pathNodes = [];
  const unscoredParentNodeIds = [];
  const seen = new Set();
  let cursor = terminal;
  while (cursor) {
    const id = normalizeString(cursor.frontmatter.id);
    if (!id || seen.has(id)) break;
    seen.add(id);
    pathNodes.unshift(cursor);
    const parentId = normalizeString(cursor.frontmatter.parent_node_id);
    if (!parentId) {
      cursor = null;
    } else {
      cursor = byId.get(parentId);
      if (!cursor) unscoredParentNodeIds.push(parentId);
    }
  }
  return { pathNodes, unscoredParentNodeIds };
};

const scoreForPathNode = ({ index, length, resolved, rating }) => {
  const base = resolved ? 0.7 : 0.4;
  const positionBonus = length > 1 ? (index + 1) / length * 0.2 : 0.2;
  const ratingBonus = Number.isFinite(Number(rating)) ? Number(rating) * 0.1 : 0.05;
  return Number(Math.min(1, base + positionBonus + ratingBonus).toFixed(4));
};

export async function evolveProbeTree(input = {}, options = {}) {
  const threadRootId = normalizeString(input.thread_root_id);
  if (!threadRootId) throw new Error("thread_root_id is required.");
  const rootDir = options.rootDir || process.cwd();
  const nodes = await listProbeNodes({ rootDir, graphStoreDir: input.graph_store_dir, threadRootId });
  const path = findResolvedPath(nodes, normalizeString(input.terminal_node_id));
  if (path.unscoredParentNodeIds.length && input.allow_partial_path !== true) {
    throw new Error(`Resolved probe path is incomplete; missing parent node(s): ${path.unscoredParentNodeIds.join(", ")}.`);
  }
  const pathNodes = path.pathNodes;
  const resolved = input.resolved !== false;
  const updatedScores = [];
  for (let index = 0; index < pathNodes.length; index += 1) {
    const node = pathNodes[index];
    const score = scoreForPathNode({ index, length: pathNodes.length, resolved, rating: input.rating });
    const nextFrontmatter = { ...node.frontmatter, score, evolved_at: nowIso() };
    await fs.writeFile(node.filePath, serializeProbeMarkdown(nextFrontmatter, node.body), "utf8");
    updatedScores.push({ node_id: normalizeString(node.frontmatter.id), score, node_path: pathRelativeToRoot(rootDir, node.filePath) });
  }
  const terminal = pathNodes[pathNodes.length - 1];
  const pathSummary = pathNodes.map((node) => normalizeString(node.frontmatter.option?.text) || normalizeString(node.frontmatter.id)).filter(Boolean).join(" -> ");
  const memory = await addMemoryLayerMemory({
    text: `Probe exemplar for ${threadRootId}: ${pathSummary}`,
    app_id: PROBE_TREE_DEFAULTS.appMemoryScope,
    metadata: {
      memory_key: hashParts("probe_exemplar", [threadRootId, pathSummary]),
      categories: ["probe-tree", "resolved-path"],
      thread_root_id: threadRootId,
      terminal_node_id: normalizeString(terminal.frontmatter.id),
      recommended_question: normalizeString(terminal.frontmatter.option?.text),
    },
  }, { rootDir });
  return {
    contractVersion: AGENTIC_OS_PROBE_TREE_CONTRACT_VERSION,
    ok: true,
    updated_scores: updatedScores,
    exemplar_id: memory.memory_ids?.[0] || "",
    path_node_ids: pathNodes.map((node) => normalizeString(node.frontmatter.id)),
    complete_path_scored: path.unscoredParentNodeIds.length === 0,
    unscored_parent_node_ids: path.unscoredParentNodeIds,
    stateGraph: buildProbeTreeStateGraphDefinition(),
    cost_log: zeroCostLog("probe-tree-evolve"),
  };
}

export async function runProbeTreeTool(toolName, input = {}, options = {}) {
  if (toolName === AGENTIC_OS_PROBE_TREE_TOOL_NAMES.generate) return generateProbeOptions(input, options);
  if (toolName === AGENTIC_OS_PROBE_TREE_TOOL_NAMES.select) return selectProbeOption(input, options);
  if (toolName === AGENTIC_OS_PROBE_TREE_TOOL_NAMES.evolve) return evolveProbeTree(input, options);
  throw new Error(`Unknown probe-tree tool: ${toolName}`);
}
