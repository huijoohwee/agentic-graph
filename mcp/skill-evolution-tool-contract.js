export const SKILL_EVOLUTION_REQUEST_SCHEMA = "agenticgraph-skill-evolution-request/v1";
export const SKILL_EVOLUTION_RESULT_SCHEMA = "agenticgraph-skill-evolution-result/v1";
export const SKILL_EVOLUTION_SCHEMA = SKILL_EVOLUTION_RESULT_SCHEMA;
export const SKILL_EVOLUTION_TOOL_NAME = "agenticgraph.skill.evolve";
export const SKILL_EVOLUTION_OPERATIONS = Object.freeze(["plan", "start", "step", "status", "cancel"]);
export const SKILL_EVOLUTION_LEARNING_RATE_SEMANTIC = "textual-mutation-budget";

function deepFreezeContract(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreezeContract(child, seen);
  return Object.freeze(value);
}

export const SKILL_EVOLUTION_INVOCATION = Object.freeze({
  command: "/skill.evolve",
  semantics: Object.freeze(["#skill-evolution"]),
  bindings: Object.freeze([
    "@skill-catalog",
    "@skill-policy",
    "@runtime-proof",
    "@operator",
  ]),
});

const TOKEN = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 160,
  pattern: "^[A-Za-z0-9](?:[A-Za-z0-9._:/-]*[A-Za-z0-9])?$",
});
const OPAQUE_REF = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 4096,
  pattern: "^(?=.*\\S)[^\\u0000-\\u001f\\u007f]+$",
});
const REVISION = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 160,
  pattern: "^[A-Za-z0-9](?:[A-Za-z0-9._:/+-]*[A-Za-z0-9])?$",
});
const SHA256 = Object.freeze({ type: "string", pattern: "^[a-f0-9]{64}$" });
const SOURCE_REVISION = Object.freeze({ type: "string", pattern: "^[a-f0-9]{40}$" });
const IDEMPOTENCY_KEY = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 200,
  pattern: "^(?=.*\\S)[^\\u0000-\\u001f\\u007f]+$",
});
const RUN_ID = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 160,
  pattern: "^[A-Za-z0-9](?:[A-Za-z0-9._:-]*[A-Za-z0-9])?$",
});

export const SKILL_EVOLUTION_REF_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["id", "revision", "digest"],
  properties: { id: TOKEN, revision: REVISION, digest: SHA256 },
});

export const SKILL_EVOLUTION_BASELINE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["skillId", "revision", "digest", "artifactRef", "normalizedChars"],
  properties: {
    skillId: TOKEN,
    revision: REVISION,
    digest: SHA256,
    artifactRef: OPAQUE_REF,
    normalizedChars: { type: "integer", minimum: 1, maximum: 10000000 },
  },
});

export const SKILL_EVOLUTION_DATASET_ENTRY_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["id", "digest", "ref"],
  properties: { id: TOKEN, digest: SHA256, ref: OPAQUE_REF },
});

export const SKILL_EVOLUTION_DATASET_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["training", "validation"],
  properties: {
    training: {
      type: "array",
      minItems: 1,
      maxItems: 1000,
      items: SKILL_EVOLUTION_DATASET_ENTRY_SCHEMA,
    },
    validation: {
      type: "array",
      minItems: 1,
      maxItems: 1000,
      items: SKILL_EVOLUTION_DATASET_ENTRY_SCHEMA,
    },
  },
});

export const SKILL_EVOLUTION_EVALUATOR_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["id", "revision", "digest", "metric"],
  properties: {
    ...SKILL_EVOLUTION_REF_SCHEMA.properties,
    metric: {
      type: "object",
      additionalProperties: false,
      required: ["id", "direction", "threshold"],
      properties: {
        id: TOKEN,
        direction: { enum: ["maximize", "minimize"] },
        threshold: { type: "number", minimum: -Number.MAX_VALUE, maximum: Number.MAX_VALUE },
      },
    },
  },
});

const INVOCATION_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["command", "semantics", "bindings"],
  properties: {
    command: { const: SKILL_EVOLUTION_INVOCATION.command },
    semantics: { const: [...SKILL_EVOLUTION_INVOCATION.semantics] },
    bindings: { const: [...SKILL_EVOLUTION_INVOCATION.bindings] },
  },
});

export const SKILL_EVOLUTION_SCHEDULE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["epochs", "batchSize", "miniBatchSize", "learningRate", "seed"],
  properties: {
    epochs: { type: "integer", minimum: 1, maximum: 100 },
    batchSize: { type: "integer", minimum: 1, maximum: 1000 },
    miniBatchSize: { type: "integer", minimum: 1, maximum: 1000 },
    learningRate: {
      type: "object",
      additionalProperties: false,
      required: ["initial", "decay", "floor"],
      properties: {
        initial: { type: "number", exclusiveMinimum: 0, maximum: 1 },
        decay: { type: "number", exclusiveMinimum: 0, maximum: 1 },
        floor: { type: "number", minimum: 0, maximum: 1 },
      },
    },
    seed: {
      type: "string",
      minLength: 1,
      maxLength: 256,
      pattern: "^(?=.*\\S)[^\\u0000-\\u001f\\u007f]+$",
    },
  },
});

export const SKILL_EVOLUTION_VALIDATION_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["minDelta", "patience", "requiredGates"],
  properties: {
    minDelta: { type: "number", minimum: 0, maximum: Number.MAX_VALUE },
    patience: { type: "integer", minimum: 1, maximum: 100 },
    requiredGates: {
      type: "array",
      minItems: 1,
      maxItems: 32,
      uniqueItems: true,
      items: TOKEN,
    },
  },
});

export const SKILL_EVOLUTION_BOUNDS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "maxCandidates",
    "maxAdapterCalls",
    "maxMutationOperations",
    "maxChangedChars",
    "maxTokens",
    "maxCostUsd",
    "maxDurationMs",
  ],
  properties: {
    maxCandidates: { type: "integer", minimum: 1, maximum: 10000 },
    maxAdapterCalls: { type: "integer", minimum: 1, maximum: 100000 },
    maxMutationOperations: { type: "integer", minimum: 1, maximum: 10000 },
    maxChangedChars: { type: "integer", minimum: 1, maximum: 1000000 },
    maxTokens: { type: "integer", minimum: 1, maximum: 100000000 },
    maxCostUsd: { type: "number", minimum: 0, maximum: 1000000 },
    maxDurationMs: { type: "integer", minimum: 1, maximum: 604800000 },
  },
});

const COMMON_PROPERTIES = Object.freeze({
  schema: { const: SKILL_EVOLUTION_REQUEST_SCHEMA },
  operation: { enum: [...SKILL_EVOLUTION_OPERATIONS] },
  invocation: INVOCATION_SCHEMA,
});
const PLAN_START_PROPERTIES = Object.freeze({
  ...COMMON_PROPERTIES,
  sourceRevision: SOURCE_REVISION,
  baseline: SKILL_EVOLUTION_BASELINE_SCHEMA,
  executor: SKILL_EVOLUTION_REF_SCHEMA,
  candidateAdapter: SKILL_EVOLUTION_REF_SCHEMA,
  dataset: SKILL_EVOLUTION_DATASET_SCHEMA,
  evaluator: SKILL_EVOLUTION_EVALUATOR_SCHEMA,
  schedule: SKILL_EVOLUTION_SCHEDULE_SCHEMA,
  validation: SKILL_EVOLUTION_VALIDATION_SCHEMA,
  bounds: SKILL_EVOLUTION_BOUNDS_SCHEMA,
  idempotencyKey: IDEMPOTENCY_KEY,
});

export const SKILL_EVOLUTION_SPEC_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "schema", "operation", "invocation", "sourceRevision", "baseline", "executor",
    "candidateAdapter", "dataset", "evaluator", "schedule", "validation", "bounds",
    "idempotencyKey",
  ],
  properties: {
    ...PLAN_START_PROPERTIES,
    operation: { enum: ["plan", "start"] },
  },
});

const PLAN_OR_START_SCHEMA = Object.freeze({
  ...SKILL_EVOLUTION_SPEC_SCHEMA,
  properties: {
    ...PLAN_START_PROPERTIES,
    operation: { enum: ["plan", "start"] },
  },
});
const STEP_OR_CANCEL_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["schema", "operation", "invocation", "runId", "expectedRevision", "idempotencyKey"],
  properties: {
    ...COMMON_PROPERTIES,
    operation: { enum: ["step", "cancel"] },
    runId: RUN_ID,
    expectedRevision: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    idempotencyKey: IDEMPOTENCY_KEY,
  },
});
const STATUS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["schema", "operation", "invocation", "runId"],
  properties: {
    ...COMMON_PROPERTIES,
    operation: { const: "status" },
    runId: RUN_ID,
  },
});

export const SKILL_EVOLUTION_TOOL_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    ...PLAN_START_PROPERTIES,
    runId: RUN_ID,
    expectedRevision: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  },
  oneOf: [PLAN_OR_START_SCHEMA, STEP_OR_CANCEL_SCHEMA, STATUS_SCHEMA],
});

const NULL_SCHEMA = Object.freeze({ type: "null" });
const FINITE_NUMBER_OR_NULL = Object.freeze({
  oneOf: [
    { type: "number", minimum: -Number.MAX_VALUE, maximum: Number.MAX_VALUE },
    NULL_SCHEMA,
  ],
});
const RESULT_PLAN_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "epochs", "batchSize", "miniBatchSize", "learningRate", "batchesPerEpoch",
    "miniBatchesPerEpoch", "maxCandidateCalls",
  ],
  properties: {
    epochs: SKILL_EVOLUTION_SCHEDULE_SCHEMA.properties.epochs,
    batchSize: SKILL_EVOLUTION_SCHEDULE_SCHEMA.properties.batchSize,
    miniBatchSize: SKILL_EVOLUTION_SCHEDULE_SCHEMA.properties.miniBatchSize,
    learningRate: SKILL_EVOLUTION_SCHEDULE_SCHEMA.properties.learningRate,
    batchesPerEpoch: { type: "integer", minimum: 1, maximum: 1000 },
    miniBatchesPerEpoch: { type: "integer", minimum: 1, maximum: 1000000 },
    maxCandidateCalls: { type: "integer", minimum: 1, maximum: 1000000 },
  },
});
const CANDIDATE_SNAPSHOT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["candidateRef", "diffRef", "digest", "parentDigest"],
  properties: {
    candidateRef: OPAQUE_REF,
    diffRef: { oneOf: [OPAQUE_REF, NULL_SCHEMA] },
    digest: SHA256,
    parentDigest: { oneOf: [SHA256, NULL_SCHEMA] },
  },
});
const CANDIDATE_STATE_SCHEMA = Object.freeze({ oneOf: [NULL_SCHEMA, CANDIDATE_SNAPSHOT_SCHEMA] });
const PROPOSAL_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["status", "candidateRef", "diffRef", "digest"],
  properties: {
    status: { const: "review_pending" },
    candidateRef: OPAQUE_REF,
    diffRef: OPAQUE_REF,
    digest: SHA256,
  },
});

export const SKILL_EVOLUTION_TOOL_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "schema", "runId", "revision", "operation", "status", "invocation", "sourceRevision",
    "baseline", "executor", "candidateAdapter", "dataset", "evaluator", "plan", "progress",
    "workingCandidate", "champion", "promotedCandidate", "metrics", "validation", "cost",
    "stopReason", "proposal", "errors",
    "applied", "modelWeightsMutated", "deploymentAttempted",
  ],
  properties: {
    schema: { const: SKILL_EVOLUTION_RESULT_SCHEMA },
    operation: { enum: [...SKILL_EVOLUTION_OPERATIONS] },
    status: { enum: ["planned", "ready", "running", "review_pending", "stopped", "canceled", "failed"] },
    runId: { oneOf: [RUN_ID, NULL_SCHEMA] },
    revision: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    invocation: INVOCATION_SCHEMA,
    sourceRevision: { oneOf: [SOURCE_REVISION, NULL_SCHEMA] },
    baseline: { oneOf: [SKILL_EVOLUTION_BASELINE_SCHEMA, NULL_SCHEMA] },
    executor: { oneOf: [SKILL_EVOLUTION_REF_SCHEMA, NULL_SCHEMA] },
    candidateAdapter: { oneOf: [SKILL_EVOLUTION_REF_SCHEMA, NULL_SCHEMA] },
    dataset: { oneOf: [SKILL_EVOLUTION_DATASET_SCHEMA, NULL_SCHEMA] },
    evaluator: { oneOf: [SKILL_EVOLUTION_EVALUATOR_SCHEMA, NULL_SCHEMA] },
    plan: { oneOf: [RESULT_PLAN_SCHEMA, NULL_SCHEMA] },
    progress: {
      type: "object",
      additionalProperties: false,
      required: ["epoch", "batch", "miniBatch", "candidatesEvaluated"],
      properties: {
        epoch: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        batch: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        miniBatch: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        candidatesEvaluated: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      },
    },
    workingCandidate: CANDIDATE_STATE_SCHEMA,
    champion: CANDIDATE_STATE_SCHEMA,
    promotedCandidate: CANDIDATE_STATE_SCHEMA,
    metrics: {
      type: "object",
      additionalProperties: false,
      required: ["baseline", "workingCandidate", "champion", "promotedCandidate"],
      properties: {
        baseline: FINITE_NUMBER_OR_NULL,
        workingCandidate: FINITE_NUMBER_OR_NULL,
        champion: FINITE_NUMBER_OR_NULL,
        promotedCandidate: FINITE_NUMBER_OR_NULL,
      },
    },
    validation: {
      type: "object",
      additionalProperties: false,
      required: ["disjoint", "gateResults", "staleEpochs"],
      properties: {
        disjoint: { type: "boolean" },
        gateResults: {
          type: "array",
          maxItems: 64,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "passed", "evidenceDigest"],
            properties: {
              id: TOKEN,
              passed: { type: "boolean" },
              evidenceDigest: { oneOf: [SHA256, NULL_SCHEMA] },
            },
          },
        },
        staleEpochs: { type: "integer", minimum: 0, maximum: 100 },
      },
    },
    cost: {
      type: "object",
      additionalProperties: false,
      required: ["adapterCalls", "mutationOperations", "changedChars", "tokens", "costUsd", "durationMs", "byPhase"],
      properties: {
        adapterCalls: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        mutationOperations: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        changedChars: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        tokens: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        costUsd: { type: "number", minimum: 0, maximum: Number.MAX_VALUE },
        durationMs: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        byPhase: {
          type: "object",
          additionalProperties: false,
          required: ["training", "validation"],
          properties: {
            training: {
              type: "object",
              additionalProperties: false,
              required: ["adapterCalls", "tokens", "costUsd", "durationMs"],
              properties: {
                adapterCalls: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
                tokens: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
                costUsd: { type: "number", minimum: 0, maximum: Number.MAX_VALUE },
                durationMs: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
              },
            },
            validation: {
              type: "object",
              additionalProperties: false,
              required: ["adapterCalls", "tokens", "costUsd", "durationMs"],
              properties: {
                adapterCalls: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
                tokens: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
                costUsd: { type: "number", minimum: 0, maximum: Number.MAX_VALUE },
                durationMs: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
              },
            },
          },
        },
      },
    },
    stopReason: {
      oneOf: [
        NULL_SCHEMA,
        { type: "string", minLength: 1, maxLength: 160, pattern: "^[a-z][a-z0-9._-]*$" },
      ],
    },
    proposal: { oneOf: [PROPOSAL_SCHEMA, NULL_SCHEMA] },
    applied: { const: false },
    modelWeightsMutated: { const: false },
    deploymentAttempted: { const: false },
    errors: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "field", "message"],
        properties: {
          code: { type: "string", minLength: 1, maxLength: 160, pattern: "^[a-z][a-z0-9._-]*$" },
          field: { oneOf: [{ type: "string", minLength: 1, maxLength: 512 }, NULL_SCHEMA] },
          message: { type: "string", minLength: 1, maxLength: 4096 },
        },
      },
    },
  },
  allOf: [
    {
      if: { properties: { operation: { const: "plan" } }, required: ["operation"] },
      then: {
        properties: {
          runId: { type: "null" },
          revision: { const: 0 },
          status: { enum: ["planned", "failed"] },
        },
      },
    },
    {
      if: { properties: { operation: { const: "start" } }, required: ["operation"] },
      then: {
        properties: { status: { enum: ["ready", "failed"] } },
        allOf: [{
          if: { properties: { status: { const: "ready" } }, required: ["status"] },
          then: { properties: { runId: RUN_ID, revision: { const: 1 } } },
        }],
      },
    },
    {
      if: { properties: { operation: { const: "step" } }, required: ["operation"] },
      then: { properties: { status: { enum: ["running", "review_pending", "stopped", "canceled", "failed"] } } },
    },
    {
      if: { properties: { operation: { const: "cancel" } }, required: ["operation"] },
      then: { properties: { status: { enum: ["canceled", "failed"] } } },
    },
    {
      if: { properties: { operation: { const: "status" } }, required: ["operation"] },
      then: { properties: { status: { enum: ["ready", "running", "review_pending", "stopped", "canceled", "failed"] } } },
    },
    {
      if: { properties: { status: { enum: ["ready", "running", "review_pending", "stopped", "canceled"] } }, required: ["status"] },
      then: { properties: { runId: RUN_ID, revision: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER } } },
    },
    {
      if: { properties: { status: { not: { const: "failed" } } }, required: ["status"] },
      then: {
        properties: {
          sourceRevision: SOURCE_REVISION,
          baseline: SKILL_EVOLUTION_BASELINE_SCHEMA,
          executor: SKILL_EVOLUTION_REF_SCHEMA,
          candidateAdapter: SKILL_EVOLUTION_REF_SCHEMA,
          dataset: SKILL_EVOLUTION_DATASET_SCHEMA,
          evaluator: SKILL_EVOLUTION_EVALUATOR_SCHEMA,
          plan: RESULT_PLAN_SCHEMA,
          workingCandidate: CANDIDATE_SNAPSHOT_SCHEMA,
          champion: CANDIDATE_SNAPSHOT_SCHEMA,
          validation: { properties: { disjoint: { const: true } } },
          errors: { type: "array", maxItems: 0 },
        },
      },
    },
    {
      if: {
        properties: { status: { const: "failed" }, runId: RUN_ID },
        required: ["status", "runId"],
      },
      then: {
        properties: {
          revision: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
          sourceRevision: SOURCE_REVISION,
          baseline: SKILL_EVOLUTION_BASELINE_SCHEMA,
          executor: SKILL_EVOLUTION_REF_SCHEMA,
          candidateAdapter: SKILL_EVOLUTION_REF_SCHEMA,
          dataset: SKILL_EVOLUTION_DATASET_SCHEMA,
          evaluator: SKILL_EVOLUTION_EVALUATOR_SCHEMA,
          plan: RESULT_PLAN_SCHEMA,
          workingCandidate: CANDIDATE_SNAPSHOT_SCHEMA,
          champion: CANDIDATE_SNAPSHOT_SCHEMA,
        },
      },
    },
    {
      if: {
        properties: { status: { const: "failed" }, runId: { type: "null" } },
        required: ["status", "runId"],
      },
      then: { properties: { revision: { const: 0 } } },
    },
    {
      if: { properties: { status: { const: "failed" } }, required: ["status"] },
      then: { properties: { errors: { type: "array", minItems: 1, maxItems: 100 } } },
    },
    {
      if: { properties: { status: { const: "review_pending" } }, required: ["status"] },
      then: { properties: { proposal: PROPOSAL_SCHEMA } },
      else: { properties: { proposal: { type: "null" } } },
    },
  ],
});

const ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
});

export function buildSkillEvolutionToolDefinition({ withDefaults = (definition) => definition } = {}) {
  if (typeof withDefaults !== "function") throw new TypeError("withDefaults must be a function");
  const definition = {
    name: SKILL_EVOLUTION_TOOL_NAME,
    description: "Use this when a local MCP host needs to plan or advance bounded skill-text evolution with deterministic training batches, held-out validation gates, revision fencing, and no model-weight updates.",
    inputSchema: SKILL_EVOLUTION_TOOL_INPUT_SCHEMA,
    outputSchema: SKILL_EVOLUTION_TOOL_OUTPUT_SCHEMA,
    annotations: ANNOTATIONS,
  };
  return deepFreezeContract(withDefaults(definition, ANNOTATIONS));
}

for (const contract of [
  SKILL_EVOLUTION_INVOCATION,
  SKILL_EVOLUTION_REF_SCHEMA,
  SKILL_EVOLUTION_BASELINE_SCHEMA,
  SKILL_EVOLUTION_DATASET_ENTRY_SCHEMA,
  SKILL_EVOLUTION_DATASET_SCHEMA,
  SKILL_EVOLUTION_EVALUATOR_SCHEMA,
  SKILL_EVOLUTION_SCHEDULE_SCHEMA,
  SKILL_EVOLUTION_VALIDATION_SCHEMA,
  SKILL_EVOLUTION_BOUNDS_SCHEMA,
  SKILL_EVOLUTION_SPEC_SCHEMA,
  SKILL_EVOLUTION_TOOL_INPUT_SCHEMA,
  SKILL_EVOLUTION_TOOL_OUTPUT_SCHEMA,
]) deepFreezeContract(contract);

export const SKILL_EVOLUTION_TOOL_DEFINITION = buildSkillEvolutionToolDefinition();
