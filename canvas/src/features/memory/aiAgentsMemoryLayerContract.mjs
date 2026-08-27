export const AGENTICGRAPH_MEMORY_LAYER_CONTRACT_VERSION = "agenticgraph-memory-layer/v0.1";

export const AGENTICGRAPH_MEMORY_LAYER_DEFAULT_TOP_K = 10;
export const AGENTICGRAPH_MEMORY_LAYER_DEFAULT_MAX_MEMORY_TOKENS = 500;

export const AGENTICGRAPH_MEMORY_LAYER_PROVIDER_MODES = Object.freeze([
  "local-json",
  "mem0-platform",
  "mem0-oss",
  "external-mcp",
]);

export const AGENTICGRAPH_MEMORY_LAYER_MCP_TOOL_NAMES = Object.freeze({
  add: "agenticgraph.memory.add",
  search: "agenticgraph.memory.search",
  assemblePrompt: "agenticgraph.memory.assemble_prompt",
  extractProcedural: "agenticgraph.memory.extract_procedural",
  materializeUserModel: "agenticgraph.memory.materialize_user_model",
});

export const AGENTICGRAPH_MEMORY_LAYER_ENV = Object.freeze({
  storePath: "AGENTICGRAPH_MEMORY_STORE_PATH",
  providerMode: "AGENTICGRAPH_MEMORY_PROVIDER_MODE",
  mem0ApiKey: "MEM0_API_KEY",
  vectorStoreProvider: "VECTOR_STORE_PROVIDER",
  llmProvider: "LLM_PROVIDER",
  embedderProvider: "EMBEDDER_PROVIDER",
});

export const MEMORY_MESSAGE_ROLES = Object.freeze(["user", "assistant", "system"]);
export const MEMORY_SCOPE_FIELDS = Object.freeze(["user_id", "agent_id", "run_id", "app_id"]);

export const MEMORY_COST_LOG_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["provider", "operation", "latency_ms", "estimated_cost_usd"],
  properties: {
    provider: { type: "string" },
    operation: { type: "string", enum: ["add", "search", "assemble_prompt", "extract_procedural", "materialize_user_model"] },
    latency_ms: { type: "number" },
    estimated_cost_usd: { oneOf: [{ type: "number" }, { type: "null" }] },
  },
});

export const MEMORY_RESULT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["id", "memory", "score", "created_at"],
  properties: {
    id: { type: "string" },
    memory: { type: "string" },
    score: { type: "number" },
    categories: { type: "array", items: { type: "string" } },
    created_at: { type: "string" },
    updated_at: { type: "string" },
    metadata: { type: "object", additionalProperties: true },
  },
});

export const MEMORY_ADD_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    text: { type: "string", description: "Optional plain memory text. Use messages for full conversation turns." },
    messages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "content"],
        properties: {
          role: { type: "string", enum: MEMORY_MESSAGE_ROLES },
          content: { type: "string" },
        },
      },
      description: "Conversation messages to persist as memory input.",
    },
    user_id: { type: "string", description: "Runtime user scope. Required unless another scope field is supplied." },
    agent_id: { type: "string", description: "Runtime agent scope." },
    run_id: { type: "string", description: "Runtime run/session scope." },
    app_id: { type: "string", description: "Runtime app/workspace scope." },
    metadata: { type: "object", additionalProperties: true },
    infer: { type: "boolean", default: true, description: "External Mem0 engines may extract facts; local-json stores normalized text deterministically." },
  },
});

export const MEMORY_ADD_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["contractVersion", "memory_ids", "results", "cost_log"],
  properties: {
    contractVersion: { type: "string" },
    memory_ids: { type: "array", items: { type: "string" } },
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        required: ["id", "memory", "event"],
        properties: {
          id: { type: "string" },
          memory: { type: "string" },
          event: { type: "string", enum: ["ADD", "UPDATE", "DELETE", "NONE"] },
        },
      },
    },
    cost_log: MEMORY_COST_LOG_SCHEMA,
  },
});

export const MEMORY_SEARCH_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["query"],
  properties: {
    query: { type: "string", description: "Semantic memory search query." },
    user_id: { type: "string", description: "Runtime user scope. Required unless another scope field is supplied." },
    agent_id: { type: "string", description: "Runtime agent scope." },
    run_id: { type: "string", description: "Runtime run/session scope." },
    app_id: { type: "string", description: "Runtime app/workspace scope." },
    top_k: { type: "number", default: AGENTICGRAPH_MEMORY_LAYER_DEFAULT_TOP_K },
    filters: { type: "object", additionalProperties: true },
  },
});

export const MEMORY_SEARCH_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["contractVersion", "results", "latency_ms", "cost_log"],
  properties: {
    contractVersion: { type: "string" },
    results: { type: "array", items: MEMORY_RESULT_SCHEMA },
    latency_ms: { type: "number" },
    cost_log: MEMORY_COST_LOG_SCHEMA,
  },
});

export const PROMPT_ASSEMBLER_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["base_system_message", "memories"],
  properties: {
    base_system_message: { type: "string" },
    memories: { type: "array", items: MEMORY_RESULT_SCHEMA },
    max_memory_tokens: { type: "number", default: AGENTICGRAPH_MEMORY_LAYER_DEFAULT_MAX_MEMORY_TOKENS },
  },
});

export const PROMPT_ASSEMBLER_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["contractVersion", "enriched_system_message", "injected_memory_count", "injected_token_estimate"],
  properties: {
    contractVersion: { type: "string" },
    enriched_system_message: { type: "string" },
    injected_memory_count: { type: "number" },
    injected_token_estimate: { type: "number" },
  },
});

export const PROCEDURAL_MEMORY_EXTRACT_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["output_dir"],
  properties: {
    output_dir: { type: "string", description: "Harness output directory containing state.json and related artifacts." },
    title: { type: "string", description: "Optional document title override." },
    document_slug: { type: "string", description: "Optional stable slug for the generated markdown document." },
    user_id: { type: "string", description: "Runtime user scope. Required unless another scope field is supplied." },
    agent_id: { type: "string", description: "Runtime agent scope." },
    run_id: { type: "string", description: "Runtime run/session scope override." },
    app_id: { type: "string", description: "Runtime app/workspace scope." },
    persist_memory: { type: "boolean", default: true, description: "When true, also writes a concise procedural summary into the scoped memory store." },
  },
});

export const PROCEDURAL_MEMORY_EXTRACT_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["contractVersion", "document_path", "document_title", "document_markdown", "task_count", "cost_log"],
  properties: {
    contractVersion: { type: "string" },
    document_path: { type: "string" },
    document_title: { type: "string" },
    document_markdown: { type: "string" },
    task_count: { type: "number" },
    source_run_id: { type: "string" },
    source_output_dir: { type: "string" },
    memory_write: { type: "object", additionalProperties: true },
    cost_log: MEMORY_COST_LOG_SCHEMA,
  },
});

export const USER_MODEL_MATERIALIZE_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "Optional document title override." },
    document_slug: { type: "string", description: "Optional stable slug for the generated markdown document." },
    workspace_path: { type: "string", description: "Optional stable workspace path for the mirrored USER_MODEL markdown document." },
    default_local_root_path: { type: "string", description: "Optional workspace root used when workspace_path is omitted. Defaults to /chat-log." },
    user_id: { type: "string", description: "Runtime user scope. Required unless another scope field is supplied." },
    agent_id: { type: "string", description: "Runtime agent scope." },
    run_id: { type: "string", description: "Runtime run/session scope." },
    app_id: { type: "string", description: "Runtime app/workspace scope." },
    max_memories: { type: "number", default: 20, description: "Maximum number of scoped memories to project into the markdown profile." },
  },
});

export const USER_MODEL_MATERIALIZE_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["contractVersion", "document_path", "workspace_document_path", "document_title", "document_markdown", "memory_count", "cost_log"],
  properties: {
    contractVersion: { type: "string" },
    document_path: { type: "string" },
    workspace_document_path: { type: "string" },
    document_title: { type: "string" },
    document_markdown: { type: "string" },
    memory_count: { type: "number" },
    categories: { type: "array", items: { type: "string" } },
    memory_ids: { type: "array", items: { type: "string" } },
    scope: { type: "object", additionalProperties: true },
    cost_log: MEMORY_COST_LOG_SCHEMA,
  },
});

export const normalizeMemoryText = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

export const normalizeMemoryMessages = (messages) => {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message) => ({
      role: String(message?.role || "").trim(),
      content: normalizeMemoryText(message?.content),
    }))
    .filter((message) => MEMORY_MESSAGE_ROLES.includes(message.role) && message.content);
};

export const normalizeMemoryScope = (input = {}) =>
  MEMORY_SCOPE_FIELDS.reduce((scope, key) => {
    const value = normalizeMemoryText(input[key]);
    if (value) scope[key] = value;
    return scope;
  }, {});

export const hasMemoryScope = (scope = {}) =>
  MEMORY_SCOPE_FIELDS.some((key) => typeof scope[key] === "string" && scope[key].trim());

export const requireMemoryScope = (input = {}) => {
  const scope = normalizeMemoryScope(input);
  if (!hasMemoryScope(scope)) {
    throw new Error("Memory scope requires at least one runtime field: user_id, agent_id, run_id, or app_id.");
  }
  return scope;
};

export const estimateMemoryTokens = (text) => {
  const normalized = normalizeMemoryText(text);
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
};

export const buildMemoryCostLog = ({ provider, operation, latencyMs }) => ({
  provider: AGENTICGRAPH_MEMORY_LAYER_PROVIDER_MODES.includes(provider) ? provider : "local-json",
  operation,
  latency_ms: Math.max(0, Number(latencyMs) || 0),
  estimated_cost_usd: provider === "local-json" ? null : null,
});
