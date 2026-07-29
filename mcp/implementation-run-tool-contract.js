export const IMPLEMENTATION_RUN_SCHEMA = "knowgrph-implementation-run/v1";

const TEXT = Object.freeze({ type: "string", minLength: 1, maxLength: 4096 });
const TOKEN = Object.freeze({ type: "string", pattern: "^[a-z0-9]+(?:[._-][a-z0-9]+)*$", maxLength: 120 });
const ABSOLUTE_PATH = Object.freeze({ type: "string", pattern: "^(?:/|[A-Za-z]:[\\\\/])", maxLength: 4096 });
const INVOCATION_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["action", "semantic", "bindings"],
  properties: {
    action: { const: "/implementation.run" },
    semantic: { const: "#managed-implementation-run" },
    bindings: {
      type: "array",
      minItems: 2,
      maxItems: 16,
      uniqueItems: true,
      items: { type: "string", pattern: "^@[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$", maxLength: 120 },
      allOf: [{ contains: { const: "@work-item" } }, { contains: { const: "@implementation-run" } }],
    },
  },
});
const WORK_ITEM_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["id", "objective", "acceptance"],
  properties: {
    id: TOKEN,
    objective: TEXT,
    acceptance: { type: "array", minItems: 1, maxItems: 50, items: TEXT },
  },
});
const VERIFY_STEP_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["profileId"],
  properties: {
    profileId: TOKEN,
  },
});
const BOUNDS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["maxAttempts", "maxRuntimeMs", "maxOutputBytes", "leaseTtlSeconds"],
  properties: {
    maxAttempts: { type: "integer", minimum: 1, maximum: 5 },
    maxRuntimeMs: { type: "integer", minimum: 1000, maximum: 86400000 },
    maxOutputBytes: { type: "integer", minimum: 1024, maximum: 10485760 },
    leaseTtlSeconds: { type: "integer", minimum: 300, maximum: 86400 },
  },
});

export const IMPLEMENTATION_RUN_SPEC_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "invocation", "workItem", "repoRoot", "worktreeRoot", "agenticCanvasOsRoot",
    "semanticScope", "runnerId", "sandboxPolicyPath", "allowedPaths", "verification",
    "idempotencyKey", "bounds",
  ],
  properties: {
    invocation: INVOCATION_SCHEMA,
    workItem: WORK_ITEM_SCHEMA,
    repoRoot: ABSOLUTE_PATH,
    worktreeRoot: ABSOLUTE_PATH,
    agenticCanvasOsRoot: ABSOLUTE_PATH,
    semanticScope: { type: "string", pattern: "^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$", maxLength: 100 },
    runnerId: TOKEN,
    sandboxPolicyPath: { type: "string", minLength: 1, maxLength: 4096 },
    agenticSdlcLedgerPath: {
      type: "string",
      minLength: 1,
      maxLength: 4096,
      description: "Optional repository-relative path where the runner must leave one exact agentic-sdlc-run/v1 ledger for independent validation and immutable observation.",
    },
    allowedPaths: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      uniqueItems: true,
      items: { type: "string", minLength: 1, maxLength: 4096 },
    },
    verification: { type: "array", minItems: 1, maxItems: 25, uniqueItems: true, items: VERIFY_STEP_SCHEMA },
    idempotencyKey: { type: "string", minLength: 8, maxLength: 200 },
    bounds: BOUNDS_SCHEMA,
  },
});

const RUN_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["schema", "ok"],
  properties: {
    schema: { type: "string" },
    ok: { type: "boolean" },
    runId: { type: "string" },
    state: { type: "string" },
    revision: { type: "integer" },
    error: { type: "object", additionalProperties: true },
  },
});

const descriptor = (name, description, inputSchema, annotations) => ({
  name,
  description,
  inputSchema,
  outputSchema: RUN_OUTPUT_SCHEMA,
  annotations,
});
const READ_ONLY = Object.freeze({ readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true });
const LOCAL_MUTATION = Object.freeze({ readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true });

export function buildImplementationRunToolDefinitions({ toolNames, withDefaults }) {
  return [
    withDefaults(descriptor(
      toolNames.implementationRunPlan,
      "Use this when a local MCP host needs to validate a managed implementation run and return an exact non-mutating execution plan, source revision, policy decision, and containment boundary.",
      IMPLEMENTATION_RUN_SPEC_SCHEMA,
      READ_ONLY,
    ), READ_ONLY),
    withDefaults(descriptor(
      toolNames.implementationRunStart,
      "Use this when a local MCP host needs to idempotently persist and start one bounded isolated implementation run under the local durable supervisor; it stops at delivery_ready and never merges or deploys.",
      IMPLEMENTATION_RUN_SPEC_SCHEMA,
      LOCAL_MUTATION,
    ), LOCAL_MUTATION),
    withDefaults(descriptor(
      toolNames.implementationRunList,
      "Use this when a local MCP host needs to list durable implementation runs or read one run without starting agents or changing repository state.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          runId: { type: "string", pattern: "^ir_[a-f0-9]{24}$" },
          cursor: { type: "string", pattern: "^ir_[a-f0-9]{24}$" },
          states: { type: "array", maxItems: 20, uniqueItems: true, items: { type: "string" } },
          limit: { type: "integer", minimum: 1, maximum: 200 },
          includeEvents: { type: "boolean", default: false },
        },
      },
      READ_ONLY,
    ), READ_ONLY),
    withDefaults(descriptor(
      toolNames.implementationRunControl,
      "Use this when a local MCP host needs to request a supervisor-owned pause, cancel, retry, or explicit review decision using compare-and-swap revision fencing.",
      {
        type: "object",
        additionalProperties: false,
        required: ["runId", "action", "expectedRevision"],
        allOf: [{
          if: { properties: { action: { const: "review" } }, required: ["action"] },
          then: { required: ["reviewDecision"] },
          else: { not: { required: ["reviewDecision"] } },
        }],
        properties: {
          runId: { type: "string", pattern: "^ir_[a-f0-9]{24}$" },
          action: { type: "string", enum: ["pause", "cancel", "retry", "review"] },
          expectedRevision: { type: "integer", minimum: 1 },
          reviewDecision: { type: "string", enum: ["accept", "changes_requested"] },
          note: { type: "string", maxLength: 2000 },
        },
      },
      LOCAL_MUTATION,
    ), LOCAL_MUTATION),
  ];
}
