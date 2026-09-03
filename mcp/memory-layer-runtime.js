import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  AGENTIC_OS_MEMORY_LAYER_CONTRACT_VERSION,
  AGENTIC_OS_MEMORY_LAYER_DEFAULT_MAX_MEMORY_TOKENS,
  AGENTIC_OS_MEMORY_LAYER_DEFAULT_TOP_K,
  buildMemoryCostLog,
  estimateMemoryTokens,
  normalizeMemoryMessages,
  normalizeMemoryScope,
  normalizeMemoryText,
  requireMemoryScope,
} from "../canvas/src/features/memory/aiAgentsMemoryLayerContract.mjs";

const STORE_VERSION = "agentic-graph-memory-store/v0.1";
const WORD_RE = /[a-z0-9]+/gi;
const CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT = "/chat-log";

const nowIso = () => new Date().toISOString();

const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
};

const hashId = (prefix, parts) =>
  `${prefix}_${createHash("sha256").update(parts.map((part) => String(part || "")).join("\n")).digest("hex").slice(0, 20)}`;

const tokenize = (text) =>
  Array.from(new Set(String(text || "").toLowerCase().match(WORD_RE) || []))
    .filter((token) => token.length > 1);

const scoreMemory = (query, memory) => {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return 0;
  const memoryTokens = new Set(tokenize(memory));
  const overlap = queryTokens.filter((token) => memoryTokens.has(token)).length;
  if (!overlap) return 0;
  return Number((overlap / queryTokens.length).toFixed(6));
};

const scopeMatches = (recordScope, queryScope) =>
  Object.entries(queryScope).every(([key, value]) => recordScope?.[key] === value);

const buildStorePath = ({ rootDir, storePath }) => {
  const configured = String(storePath || process.env.AGENTIC_OS_MEMORY_STORE_PATH || "").trim();
  if (configured) return path.resolve(rootDir, configured);
  return path.join(rootDir, "data", "memory-layer", "local-memory-store.json");
};

const buildProceduralMemoryDir = ({ rootDir }) =>
  path.join(rootDir, "data", "memory-layer", "procedural");

const buildUserModelDir = ({ rootDir }) =>
  path.join(rootDir, "data", "memory-layer", "user-models");

const normalizeWorkspaceLikePath = (value) => {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) return "/";
  const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
  const collapsed = withLeading.replace(/\/+/g, "/").replace(/\/+$/, "");
  return collapsed || "/";
};

const resolveUserModelWorkspaceDocument = ({ rootDir, workspacePath, defaultLocalRootPath, documentSlug }) => {
  const normalizedPath = workspacePath
    ? normalizeWorkspaceLikePath(workspacePath)
    : normalizeWorkspaceLikePath(`${defaultLocalRootPath || CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT}/user-models/${documentSlug}.md`);
  return {
    workspacePath: normalizedPath,
    absolutePath: resolvePathInsideRoot(rootDir, normalizedPath.replace(/^\/+/, "")),
  };
};

const resolvePathInsideRoot = (rootDir, candidatePath) => {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, String(candidatePath || ""));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Path must stay inside AGENTIC_OS_ROOT (${root}).`);
  }
  return resolved;
};

const toRootRelativePath = (rootDir, absolutePath) =>
  path.relative(path.resolve(rootDir), absolutePath).split(path.sep).join("/");

const slugifyMemoryText = (value) =>
  normalizeMemoryText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
  || "procedural-memory";

const readJsonOrThrow = async (filePath, label) => {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`Procedural memory extract requires ${label} at ${filePath}.`);
    throw new Error(`Failed to read ${label} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const toKtv = (key, type, value) => stableStringify({ key, type, value });

const buildGoalNode = ({ title, runId, outputDirRelative }) => ({
  id: "goal_input",
  type: "InputWidget",
  label: "Goal Input",
  summary: title,
  runAction: {
    fn: "harness.replay.goal",
    runId,
    outputDir: outputDirRelative,
  },
});

const buildTaskNode = ({ task, completedStep, runId, outputDirRelative }) => ({
  id: `task_${slugifyMemoryText(task.task_id).replace(/-/g, "_")}`,
  type: "ComputeWidget",
  label: normalizeMemoryText(task.label) || task.task_id,
  summary: normalizeMemoryText(
    `${completedStep?.tool_name || task.tool_name} via ${task.agent_id}${completedStep?.attempt ? ` (attempt ${completedStep.attempt})` : ""}`
  ),
  runAction: {
    fn: "harness.replay.step",
    runId,
    outputDir: outputDirRelative,
    taskId: task.task_id,
    toolName: completedStep?.tool_name || task.tool_name,
    agentId: task.agent_id,
  },
});

const formatFlowNodeLines = (node, index) => {
  const x = 120 + (index * 320);
  const y = node.id === "goal_input" ? 240 : 240;
  const handles = node.id === "goal_input"
    ? { source: ["out"] }
    : { target: ["in"], source: ["out"] };
  const portTypes = node.id === "goal_input"
    ? { out: { out: "task_signal" } }
    : { in: { in: "task_signal" }, out: { out: "task_signal" } };
  return [
    `    - id: ${toKtv("id", "string", node.id)}`,
    `      type: ${toKtv("type", "string", node.type)}`,
    `      label: ${toKtv("label", "string", node.label)}`,
    `      x: ${toKtv("x", "number", x)}`,
    `      y: ${toKtv("y", "number", y)}`,
    `      handles: ${toKtv("handles", "object", handles)}`,
    `      "flow:portTypes": ${toKtv("flow:portTypes", "object", portTypes)}`,
    `      summary: ${toKtv("summary", "string", node.summary)}`,
    `      "canvas:runAction": ${toKtv("canvas:runAction", "object", node.runAction)}`,
  ];
};

const formatEdgeLines = (edges) =>
  edges.map((edge) => `    - ${stableStringify(edge)}`);

const buildProceduralMemoryMarkdown = ({
  documentTitle,
  runId,
  providerMode,
  scope,
  outputDirRelative,
  terminationReason,
  goalIntent,
  completedTasks,
}) => {
  const nodes = [
    buildGoalNode({ title: goalIntent, runId, outputDirRelative }),
    ...completedTasks.map(({ task, step }) => buildTaskNode({ task, completedStep: step, runId, outputDirRelative })),
  ];
  const nodeIdByTask = new Map(completedTasks.map(({ task }, index) => [task.task_id, nodes[index + 1].id]));
  const edges = completedTasks.map(({ task }, index) => {
    const sources = Array.isArray(task.depends_on) && task.depends_on.length
      ? task.depends_on.map((dependencyId) => nodeIdByTask.get(dependencyId)).filter(Boolean)
      : [index === 0 ? "goal_input" : nodes[index].id];
    return sources.map((sourceId) => ({
      id: `edge_${slugifyMemoryText(`${sourceId}_${nodeIdByTask.get(task.task_id)}`).replace(/-/g, "_")}`,
      source: sourceId,
      sourceHandle: "out",
      target: nodeIdByTask.get(task.task_id),
      targetHandle: "in",
      type: "task_signal",
    }));
  }).flat();

  const lines = [
    "---",
    'schema: "agentic-os-computing-flow/v1"',
    'kgCanvas2dRenderer: "storyboard"',
    'memory_kind: "procedural"',
    `memory_scope: ${stableStringify(scope)}`,
    `source_run: ${stableStringify({ run_id: runId, provider_mode: providerMode, output_dir: outputDirRelative, termination_reason: terminationReason })}`,
    "socket_types:",
    '  task_signal: {color: "#6366f1", edgeWidthPx: 2, handleStrokeWidthPx: 2, accepts: [task_signal]}',
    "flow:",
    `  direction: ${toKtv("direction", "string", "LR")}`,
    `  edgeType: ${toKtv("edgeType", "string", "smoothstep")}`,
    `  computed: ${toKtv("computed", "boolean", true)}`,
    `  snapToGrid: ${toKtv("snapToGrid", "boolean", true)}`,
    "  nodes:",
    ...nodes.flatMap((node, index) => formatFlowNodeLines(node, index)),
    "  edges:",
    ...formatEdgeLines(edges),
    "---",
    "",
    `# ${documentTitle}`,
    "",
    `Derived from harness run \`${runId}\` in \`${providerMode}\` mode.`,
    "",
    "## Goal",
    "",
    goalIntent,
    "",
    "## Completed Flow",
    "",
    ...completedTasks.map(({ task, step }) =>
      `- \`${task.task_id}\` -> \`${step?.tool_name || task.tool_name}\` by \`${task.agent_id}\`${step?.attempt ? ` (attempt ${step.attempt})` : ""}`
    ),
    "",
    "## Replay",
    "",
    `- Output dir: \`${outputDirRelative}\``,
    `- Termination reason: \`${terminationReason}\``,
  ];
  return `${lines.join("\n")}\n`;
};

const classifyUserModelMemory = (entry) => {
  const categories = Array.isArray(entry?.categories) ? entry.categories.map(normalizeMemoryText).filter(Boolean) : [];
  const metadata = entry?.metadata && typeof entry.metadata === "object" ? entry.metadata : {};
  const memoryKind = normalizeMemoryText(metadata.memory_kind);
  const memoryKey = normalizeMemoryText(metadata.memory_key || metadata.preference_key);
  if (memoryKind === "procedural_agenticOs" || categories.includes("procedural")) return "procedural";
  if (memoryKey || categories.some((category) => ["preference", "preferences", "profile", "style"].includes(category))) return "preferences";
  return "context";
};

const buildUserModelMarkdown = ({
  documentTitle,
  scope,
  selectedMemories,
  categories,
  memoryStorePath,
}) => {
  const preferences = selectedMemories.filter((entry) => classifyUserModelMemory(entry) === "preferences");
  const procedural = selectedMemories.filter((entry) => classifyUserModelMemory(entry) === "procedural");
  const context = selectedMemories.filter((entry) => classifyUserModelMemory(entry) === "context");
  const buildMemoryLines = (entries, { includeMetadata = false } = {}) =>
    entries.map((entry) => {
      const stamp = normalizeMemoryText(entry.updated_at || entry.created_at) || "unknown";
      const suffix = includeMetadata && entry.metadata?.document_path
        ? ` (${entry.metadata.document_path})`
        : "";
      return `- ${entry.memory} [${stamp}]${suffix}`;
    });
  const lines = [
    "---",
    'schema: "agentic-os-user-model/v1"',
    'memory_kind: "user_model"',
    `memory_scope: ${stableStringify(scope)}`,
    `memory_categories: ${stableStringify(categories)}`,
    `memory_store: ${stableStringify({ path: memoryStorePath, memory_count: selectedMemories.length })}`,
    "---",
    "",
    `# ${documentTitle}`,
    "",
    "## Scope",
    "",
    `- ${stableStringify(scope)}`,
    "",
    "## Preferences",
    "",
    ...(preferences.length ? buildMemoryLines(preferences) : ["- No explicit preference memories recorded yet."]),
    "",
    "## Active Context",
    "",
    ...(context.length ? buildMemoryLines(context) : ["- No scoped context memories recorded yet."]),
    "",
    "## Procedural Memory",
    "",
    ...(procedural.length ? buildMemoryLines(procedural, { includeMetadata: true }) : ["- No procedural memories recorded yet."]),
    "",
    "## Memory Ledger",
    "",
    ...buildMemoryLines(selectedMemories, { includeMetadata: true }),
  ];
  return `${lines.join("\n")}\n`;
};

const readStore = async (storePath) => {
  try {
    const text = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.memories)) return parsed;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return { version: STORE_VERSION, updated_at: nowIso(), memories: [] };
};

const writeStore = async (storePath, store) => {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
};

const memoryTextFromInput = (input) => {
  const text = normalizeMemoryText(input?.text);
  if (text) return text;
  const messages = normalizeMemoryMessages(input?.messages);
  return normalizeMemoryText(messages.map((message) => `${message.role}: ${message.content}`).join("\n"));
};

export const addMemoryLayerMemory = async (input = {}, options = {}) => {
  const startedAt = performance.now();
  const scope = requireMemoryScope(input);
  const memory = memoryTextFromInput(input);
  if (!memory) throw new Error("Memory add requires text or at least one valid message.");

  const storePath = buildStorePath(options);
  const store = await readStore(storePath);
  const metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
    ? { ...input.metadata }
    : {};
  const memoryKey = normalizeMemoryText(metadata.memory_key || metadata.preference_key);
  const identityParts = [stableStringify(scope), memoryKey || memory];
  const id = hashId("kgmem", identityParts);
  const existingIndex = store.memories.findIndex((entry) => entry.id === id);
  const timestamp = nowIso();
  const baseRecord = {
    id,
    memory,
    scope,
    categories: Array.isArray(metadata.categories) ? metadata.categories.map(normalizeMemoryText).filter(Boolean) : [],
    metadata,
    created_at: timestamp,
    updated_at: timestamp,
  };

  let event = "ADD";
  if (existingIndex >= 0) {
    const previous = store.memories[existingIndex];
    event = previous.memory === memory ? "NONE" : "UPDATE";
    store.memories[existingIndex] = {
      ...previous,
      ...baseRecord,
      created_at: previous.created_at || timestamp,
      updated_at: event === "NONE" ? previous.updated_at || timestamp : timestamp,
    };
  } else {
    store.memories.push(baseRecord);
  }

  store.updated_at = timestamp;
  await writeStore(storePath, store);
  const latencyMs = performance.now() - startedAt;
  return {
    contractVersion: AGENTIC_OS_MEMORY_LAYER_CONTRACT_VERSION,
    memory_ids: [id],
    results: [{ id, memory, event }],
    cost_log: buildMemoryCostLog({ provider: "local-json", operation: "add", latencyMs }),
    store_path: storePath,
  };
};

export const searchMemoryLayerMemories = async (input = {}, options = {}) => {
  const startedAt = performance.now();
  const scope = requireMemoryScope(input);
  const query = normalizeMemoryText(input.query);
  if (!query) throw new Error("Memory search requires a non-empty query.");
  const topK = Math.max(1, Math.min(100, Math.floor(Number(input.top_k) || AGENTIC_OS_MEMORY_LAYER_DEFAULT_TOP_K)));
  const storePath = buildStorePath(options);
  const store = await readStore(storePath);
  const results = store.memories
    .filter((entry) => scopeMatches(entry.scope, scope))
    .map((entry) => ({ ...entry, score: scoreMemory(query, entry.memory) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || String(right.updated_at || "").localeCompare(String(left.updated_at || "")))
    .slice(0, topK)
    .map((entry) => ({
      id: entry.id,
      memory: entry.memory,
      score: entry.score,
      categories: entry.categories || [],
      created_at: entry.created_at,
      updated_at: entry.updated_at,
      metadata: entry.metadata || {},
    }));
  const latencyMs = performance.now() - startedAt;
  return {
    contractVersion: AGENTIC_OS_MEMORY_LAYER_CONTRACT_VERSION,
    results,
    latency_ms: Math.max(0, latencyMs),
    cost_log: buildMemoryCostLog({ provider: "local-json", operation: "search", latencyMs }),
    store_path: storePath,
  };
};

export const assembleMemoryLayerPrompt = (input = {}) => {
  const startedAt = performance.now();
  const base = normalizeMemoryText(input.base_system_message);
  const memories = Array.isArray(input.memories) ? input.memories : [];
  const maxTokens = Math.max(0, Math.floor(Number(input.max_memory_tokens) || AGENTIC_OS_MEMORY_LAYER_DEFAULT_MAX_MEMORY_TOKENS));
  const selected = [];
  let tokenEstimate = 0;
  for (const memory of memories) {
    const text = normalizeMemoryText(memory?.memory);
    if (!text) continue;
    const nextTokens = estimateMemoryTokens(text);
    if (tokenEstimate + nextTokens > maxTokens) break;
    selected.push(text);
    tokenEstimate += nextTokens;
  }
  const memorySection = selected.length
    ? `\n\n## Relevant Context\n${selected.map((memory) => `- ${memory}`).join("\n")}`
    : "";
  const latencyMs = performance.now() - startedAt;
  return {
    contractVersion: AGENTIC_OS_MEMORY_LAYER_CONTRACT_VERSION,
    enriched_system_message: `${base}${memorySection}`,
    injected_memory_count: selected.length,
    injected_token_estimate: tokenEstimate,
    cost_log: buildMemoryCostLog({ provider: "local-json", operation: "assemble_prompt", latencyMs }),
  };
};

export const inspectMemoryLayerStore = async (options = {}) => {
  const storePath = buildStorePath(options);
  const store = await readStore(storePath);
  const scopes = Array.from(new Set(store.memories.map((entry) => stableStringify(normalizeMemoryScope(entry.scope)))))
    .sort();
  return {
    contractVersion: AGENTIC_OS_MEMORY_LAYER_CONTRACT_VERSION,
    store_path: storePath,
    memory_count: store.memories.length,
    scope_count: scopes.length,
    updated_at: store.updated_at || "",
  };
};

export const extractProceduralMemory = async (input = {}, options = {}) => {
  const startedAt = performance.now();
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const outputDir = resolvePathInsideRoot(rootDir, input.output_dir);
  const statePath = path.join(outputDir, "state.json");
  const goalPath = path.join(outputDir, "goal.json");
  const state = await readJsonOrThrow(statePath, "state.json");
  const goalPayload = await readJsonOrThrow(goalPath, "goal.json").catch(() => ({}));

  const sourceRunId = normalizeMemoryText(input.run_id || state?.run?.run_id || goalPayload?.run_id);
  const scope = requireMemoryScope({ ...input, run_id: sourceRunId || input.run_id });
  const completedTaskIds = Array.isArray(state?.completed_task_ids) ? state.completed_task_ids : [];
  const completedStepByTask = new Map(
    (Array.isArray(state?.steps) ? state.steps : [])
      .filter((step) => step && step.status === "completed" && step.task_id)
      .map((step) => [String(step.task_id), step])
  );
  const plan = Array.isArray(state?.plan) ? state.plan : [];
  const completedTasks = completedTaskIds
    .map((taskId) => {
      const task = plan.find((entry) => String(entry?.task_id) === String(taskId));
      return task ? { task, step: completedStepByTask.get(String(taskId)) || null } : null;
    })
    .filter(Boolean);
  if (!completedTasks.length) {
    throw new Error(`Procedural memory extract requires at least one completed task in ${statePath}.`);
  }

  const goalIntent = normalizeMemoryText(
    goalPayload?.goal?.intent
    || goalPayload?.raw_goal
    || state?.goal?.intent
    || "Recovered harness procedure"
  );
  const documentTitle = normalizeMemoryText(input.title) || `Procedural Memory: ${goalIntent}`;
  const documentSlug = slugifyMemoryText(input.document_slug || documentTitle || sourceRunId);
  const proceduralDir = buildProceduralMemoryDir({ rootDir });
  const documentPath = path.join(proceduralDir, `${documentSlug}.md`);
  const outputDirRelative = toRootRelativePath(rootDir, outputDir);
  const documentMarkdown = buildProceduralMemoryMarkdown({
    documentTitle,
    runId: sourceRunId,
    providerMode: normalizeMemoryText(state?.run?.provider_mode) || "unknown",
    scope,
    outputDirRelative,
    terminationReason: normalizeMemoryText(state?.run?.termination_reason) || "unknown",
    goalIntent,
    completedTasks,
  });

  await fs.mkdir(proceduralDir, { recursive: true });
  await fs.writeFile(documentPath, documentMarkdown, "utf8");

  let memoryWrite = null;
  if (input.persist_memory !== false) {
    const summary = normalizeMemoryText([
      `Procedural memory for ${goalIntent}.`,
      `Completed tasks: ${completedTasks.map(({ task }) => task.task_id).join(" -> ")}.`,
      `AGENTIC_OS document: ${toRootRelativePath(rootDir, documentPath)}.`,
    ].join(" "));
    memoryWrite = await addMemoryLayerMemory({
      ...scope,
      text: summary,
      metadata: {
        memory_key: `procedural:${documentSlug}`,
        memory_kind: "procedural_agenticOs",
        document_path: toRootRelativePath(rootDir, documentPath),
        output_dir: outputDirRelative,
        run_id: sourceRunId,
        categories: ["procedural", "agenticOs", "harness"],
      },
    }, options);
  }

  const latencyMs = performance.now() - startedAt;
  return {
    contractVersion: AGENTIC_OS_MEMORY_LAYER_CONTRACT_VERSION,
    source_run_id: sourceRunId,
    source_output_dir: outputDirRelative,
    document_path: toRootRelativePath(rootDir, documentPath),
    document_title: documentTitle,
    document_markdown: documentMarkdown,
    task_count: completedTasks.length,
    memory_write: memoryWrite,
    cost_log: buildMemoryCostLog({ provider: "local-json", operation: "extract_procedural", latencyMs }),
  };
};

export const materializeUserModel = async (input = {}, options = {}) => {
  const startedAt = performance.now();
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const scope = requireMemoryScope(input);
  const maxMemories = Math.max(1, Math.min(100, Math.floor(Number(input.max_memories) || 20)));
  const storePath = buildStorePath({ ...options, rootDir });
  const store = await readStore(storePath);
  const selectedMemories = store.memories
    .filter((entry) => scopeMatches(entry.scope, scope))
    .sort((left, right) => String(right.updated_at || right.created_at || "").localeCompare(String(left.updated_at || left.created_at || "")))
    .slice(0, maxMemories)
    .map((entry) => ({
      ...entry,
      memory: normalizeMemoryText(entry.memory),
      categories: Array.isArray(entry.categories) ? entry.categories.map(normalizeMemoryText).filter(Boolean) : [],
      metadata: entry.metadata && typeof entry.metadata === "object" ? { ...entry.metadata } : {},
    }))
    .filter((entry) => entry.memory);
  if (!selectedMemories.length) {
    throw new Error("User model materialization requires at least one scoped memory in the local memory store.");
  }

  const scopeLabel = scope.user_id || scope.agent_id || scope.app_id || scope.run_id || "scoped-profile";
  const documentTitle = normalizeMemoryText(input.title) || `User Model: ${scopeLabel}`;
  const documentSlug = slugifyMemoryText(input.document_slug || documentTitle);
  const userModelDir = buildUserModelDir({ rootDir });
  const documentPath = path.join(userModelDir, `${documentSlug}.md`);
  const workspaceDocument = resolveUserModelWorkspaceDocument({
    rootDir,
    workspacePath: input.workspace_path,
    defaultLocalRootPath: input.default_local_root_path,
    documentSlug,
  });
  const categories = Array.from(new Set(selectedMemories.flatMap((entry) => entry.categories))).sort((left, right) => left.localeCompare(right));
  const documentMarkdown = buildUserModelMarkdown({
    documentTitle,
    scope,
    selectedMemories,
    categories,
    memoryStorePath: toRootRelativePath(rootDir, storePath),
  });

  await fs.mkdir(userModelDir, { recursive: true });
  await fs.writeFile(documentPath, documentMarkdown, "utf8");
  await fs.mkdir(path.dirname(workspaceDocument.absolutePath), { recursive: true });
  await fs.writeFile(workspaceDocument.absolutePath, documentMarkdown, "utf8");

  const latencyMs = performance.now() - startedAt;
  return {
    contractVersion: AGENTIC_OS_MEMORY_LAYER_CONTRACT_VERSION,
    document_path: toRootRelativePath(rootDir, documentPath),
    workspace_document_path: workspaceDocument.workspacePath,
    document_title: documentTitle,
    document_markdown: documentMarkdown,
    memory_count: selectedMemories.length,
    categories,
    memory_ids: selectedMemories.map((entry) => entry.id),
    scope,
    cost_log: buildMemoryCostLog({ provider: "local-json", operation: "materialize_user_model", latencyMs }),
  };
};
