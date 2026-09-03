export const PERSISTENT_MEMORY_CONTRACT_VERSION = "agentic-graph-persistent-memory/v1";

export const PERSISTENT_MEMORY_TOOL_NAMES = Object.freeze({
  write: "agentic-graph.memory.write",
  compact: "agentic-graph.memory.compact",
  search: "agentic-graph.memory.search",
  sessionSearch: "agentic-graph.session.search",
  userProfile: "agentic-graph.user.profile",
  invoke: "agentic-graph.memory.invoke",
});

export const PERSISTENT_MEMORY_LIMITS = Object.freeze({
  memoryCharacters: 2_200,
  userCharacters: 1_375,
  maxEntryCharacters: 2_200,
  maxQueryCharacters: 500,
  maxResults: 20,
  maxTags: 12,
  maxEntriesPerCompact: 50,
});

const boundedId = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 160,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
});

export const PERSISTENT_MEMORY_SCOPE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["tenant_id", "workspace_id", "agent_id", "subject_id"],
  properties: {
    tenant_id: boundedId,
    workspace_id: boundedId,
    agent_id: boundedId,
    subject_id: boundedId,
  },
});

export const PERSISTENT_MEMORY_OPERATOR_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["id", "approved"],
  properties: {
    id: boundedId,
    approved: { type: "boolean" },
  },
});

export const PERSISTENT_MEMORY_EVIDENCE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["source_type", "source_id", "excerpt"],
  properties: {
    source_type: {
      type: "string",
      enum: ["operator", "session", "artifact", "tool"],
    },
    source_id: boundedId,
    excerpt: { type: "string", minLength: 1, maxLength: 1_600 },
    explicit: { type: "boolean", default: false },
  },
});

const kindSchema = Object.freeze({
  type: "string",
  enum: ["fact", "preference", "procedure", "decision", "session", "note"],
});

const tagsSchema = Object.freeze({
  type: "array",
  maxItems: PERSISTENT_MEMORY_LIMITS.maxTags,
  uniqueItems: true,
  items: {
    type: "string",
    minLength: 1,
    maxLength: 64,
    pattern: "^[a-z0-9][a-z0-9.-]*$",
  },
});

const userProfileContentSchema = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: PERSISTENT_MEMORY_LIMITS.userCharacters,
  pattern: "^(?:response_length=(?:concise|balanced|detailed)|response_style=(?:plain|technical|conversational|formal)|response_format=(?:prose|bullets|numbered|table)|code_explanation=(?:minimal|balanced|detailed)|language=(?:en|en-SG|zh|zh-CN|zh-TW|ms|id|ta|hi|ja|ko|fr|de|es|pt|it|nl|th|vi|fil)|date_format=(?:iso-8601|day-month-year|month-day-year)|time_format=(?:12-hour|24-hour))$",
});

const mutationProperties = Object.freeze({
  scope: PERSISTENT_MEMORY_SCOPE_SCHEMA,
  operator: PERSISTENT_MEMORY_OPERATOR_SCHEMA,
  authorization_token: {
    type: "string",
    minLength: 104,
    maxLength: 104,
    pattern: "^kgpm1\\.[A-Za-z0-9_-]{54}\\.[A-Za-z0-9_-]{43}$",
  },
  expected_revision: { type: "integer", minimum: 0 },
  idempotency_key: {
    type: "string",
    minLength: 8,
    maxLength: 200,
  },
});

export const PERSISTENT_MEMORY_WRITE_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "scope",
    "target",
    "action",
    "operator",
    "authorization_token",
    "evidence",
    "expected_revision",
    "idempotency_key",
  ],
  properties: {
    ...mutationProperties,
    target: { type: "string", const: "memory" },
    action: { type: "string", enum: ["add", "replace", "remove"] },
    content: {
      type: "string",
      minLength: 1,
      maxLength: PERSISTENT_MEMORY_LIMITS.maxEntryCharacters,
    },
    entry_id: boundedId,
    previous_content: {
      type: "string",
      minLength: 1,
      maxLength: PERSISTENT_MEMORY_LIMITS.maxEntryCharacters,
    },
    kind: kindSchema,
    tags: tagsSchema,
    evidence: PERSISTENT_MEMORY_EVIDENCE_SCHEMA,
  },
});

export const PERSISTENT_MEMORY_COMPACT_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "scope",
    "target",
    "entries",
    "content",
    "reason",
    "operator",
    "authorization_token",
    "evidence",
    "expected_revision",
    "idempotency_key",
  ],
  properties: {
    ...mutationProperties,
    target: { type: "string", const: "memory" },
    entries: {
      type: "array",
      minItems: 2,
      maxItems: PERSISTENT_MEMORY_LIMITS.maxEntriesPerCompact,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["entry_id", "previous_content"],
        properties: {
          entry_id: boundedId,
          previous_content: {
            type: "string",
            minLength: 1,
            maxLength: PERSISTENT_MEMORY_LIMITS.maxEntryCharacters,
          },
        },
      },
    },
    content: {
      type: "string",
      minLength: 1,
      maxLength: PERSISTENT_MEMORY_LIMITS.maxEntryCharacters,
    },
    reason: { type: "string", minLength: 1, maxLength: 240 },
    kind: kindSchema,
    tags: tagsSchema,
    evidence: PERSISTENT_MEMORY_EVIDENCE_SCHEMA,
  },
});

export const PERSISTENT_MEMORY_SEARCH_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["scope", "query"],
  properties: {
    scope: PERSISTENT_MEMORY_SCOPE_SCHEMA,
    query: {
      type: "string",
      minLength: 1,
      maxLength: PERSISTENT_MEMORY_LIMITS.maxQueryCharacters,
    },
    target: { type: "string", enum: ["memory", "user", "all"] },
    kinds: { type: "array", uniqueItems: true, maxItems: 6, items: kindSchema },
    tags: tagsSchema,
    limit: {
      type: "integer",
      minimum: 1,
      maximum: PERSISTENT_MEMORY_LIMITS.maxResults,
    },
    max_characters: { type: "integer", minimum: 1, maximum: 4_000 },
    as_of_revision: { type: "integer", minimum: 0 },
  },
});

export const PERSISTENT_SESSION_SEARCH_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["scope", "query"],
  properties: {
    scope: PERSISTENT_MEMORY_SCOPE_SCHEMA,
    query: {
      type: "string",
      minLength: 1,
      maxLength: PERSISTENT_MEMORY_LIMITS.maxQueryCharacters,
    },
    session_id: boundedId,
    limit: {
      type: "integer",
      minimum: 1,
      maximum: PERSISTENT_MEMORY_LIMITS.maxResults,
    },
    max_characters: { type: "integer", minimum: 1, maximum: 4_000 },
    as_of_revision: { type: "integer", minimum: 0 },
  },
});

export const PERSISTENT_USER_PROFILE_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["scope", "action", "operator"],
  properties: {
    ...mutationProperties,
    action: { type: "string", enum: ["add", "replace", "remove", "inspect"] },
    content: userProfileContentSchema,
    entry_id: boundedId,
    previous_content: {
      type: "string",
      minLength: 1,
      maxLength: PERSISTENT_MEMORY_LIMITS.userCharacters,
    },
    kind: { type: "string", const: "preference" },
    tags: { type: "array", maxItems: 0 },
    evidence: PERSISTENT_MEMORY_EVIDENCE_SCHEMA,
    query: { type: "string", maxLength: PERSISTENT_MEMORY_LIMITS.maxQueryCharacters },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: PERSISTENT_MEMORY_LIMITS.maxResults,
    },
    as_of_revision: { type: "integer", minimum: 0 },
  },
  oneOf: [
    {
      properties: { action: { const: "inspect" } },
    },
    {
      required: [
        "authorization_token",
        "evidence",
        "expected_revision",
        "idempotency_key",
      ],
      properties: { action: { enum: ["add", "replace", "remove"] } },
    },
  ],
});

export const PERSISTENT_MEMORY_INVOKE_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["invocation", "source_revision", "arguments"],
  properties: {
    invocation: { type: "string", minLength: 1, maxLength: 800 },
    source_revision: { type: "string", pattern: "^[0-9a-f]{40}$" },
    arguments: { type: "object", additionalProperties: true },
  },
});

export const PERSISTENT_MEMORY_ECONOMICS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["provider", "model_calls", "estimated_cost_usd"],
  properties: {
    provider: { const: "local-deterministic" },
    model_calls: { const: 0 },
    estimated_cost_usd: { const: 0 },
  },
});

export const PERSISTENT_MEMORY_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["ok", "contractVersion", "operation", "economics"],
  properties: {
    ok: { type: "boolean" },
    contractVersion: { const: PERSISTENT_MEMORY_CONTRACT_VERSION },
    operation: { type: "string" },
    economics: PERSISTENT_MEMORY_ECONOMICS_SCHEMA,
    error: {
      type: "object",
      additionalProperties: true,
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
      },
    },
  },
  oneOf: [
    {
      properties: { ok: { const: true } },
      not: { required: ["error"] },
    },
    {
      required: ["error"],
      properties: { ok: { const: false } },
    },
  ],
});

export const PERSISTENT_MEMORY_SEARCH_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["ok", "contractVersion", "operation", "results", "economics"],
  properties: {
    ok: { type: "boolean" },
    contractVersion: { type: "string" },
    operation: { type: "string" },
    results: { type: "array", items: { type: "object", additionalProperties: true } },
    economics: PERSISTENT_MEMORY_ECONOMICS_SCHEMA,
    error: {
      type: "object",
      additionalProperties: true,
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
      },
    },
  },
  oneOf: [
    {
      properties: { ok: { const: true } },
      not: { required: ["error"] },
    },
    {
      required: ["error"],
      properties: { ok: { const: false } },
    },
  ],
});

export const PERSISTENT_MEMORY_INVOCATION_ROUTES = Object.freeze({
  "/memory.write": Object.freeze({
    toolName: PERSISTENT_MEMORY_TOOL_NAMES.write,
    semantics: Object.freeze(["#persistent-memory", "#memory-capacity", "#vcc"]),
    bindings: Object.freeze(["@memory-store", "@memory-entry", "@memory-policy", "@operator"]),
    mutates: true,
  }),
  "/memory.compact": Object.freeze({
    toolName: PERSISTENT_MEMORY_TOOL_NAMES.compact,
    semantics: Object.freeze(["#persistent-memory", "#memory-capacity", "#vcc"]),
    bindings: Object.freeze(["@memory-store", "@memory-policy", "@runtime-proof"]),
    mutates: true,
  }),
  "/memory.search": Object.freeze({
    toolName: PERSISTENT_MEMORY_TOOL_NAMES.search,
    semantics: Object.freeze(["#memory-search", "#truth", "#vcc"]),
    bindings: Object.freeze(["@agent", "@memory-store", "@operator"]),
    mutates: false,
  }),
  "/session.search": Object.freeze({
    toolName: PERSISTENT_MEMORY_TOOL_NAMES.sessionSearch,
    semantics: Object.freeze(["#session-search", "#truth", "#vcc"]),
    bindings: Object.freeze(["@session-index", "@operator"]),
    mutates: false,
  }),
  "/user.profile": Object.freeze({
    toolName: PERSISTENT_MEMORY_TOOL_NAMES.userProfile,
    semantics: Object.freeze(["#user-profile", "#memory-capacity", "#vcc"]),
    bindings: Object.freeze(["@user-profile", "@memory-entry", "@memory-policy", "@operator"]),
    mutates: true,
  }),
});

export const isPersistentMemoryToolName = (toolName) =>
  Object.values(PERSISTENT_MEMORY_TOOL_NAMES).includes(toolName);
