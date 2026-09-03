import { buildAgentTeamToolOutputSchemas } from "./agent-team-output.schema.js";

export const AGENT_TEAM_SOURCE_SCHEMA = "agentic-graph.agent-team.source/v1";
export const AGENT_TEAM_PLAN_SCHEMA = "agentic-graph.agent-team.plan/v1";
export const AGENT_TEAM_RUN_SCHEMA = "agentic-graph.agent-team.run/v1";
export const AGENT_TEAM_RESULT_SCHEMA = "agentic-graph-agent-team-result/v1";
export const AGENT_TEAM_INVOCATION = Object.freeze({
  command: "/agent.team",
  semantic: "#role-based-agent-team",
  binding: "@agent-team",
  text: "/agent.team #role-based-agent-team @agent-team",
});
export const AGENT_TEAM_TOOL_NAMES = Object.freeze({
  plan: "agentic-graph.agent_team.plan",
  start: "agentic-graph.agent_team.start",
  list: "agentic-graph.agent_team.list",
  control: "agentic-graph.agent_team.control",
});
export const AGENT_TEAM_HARD_BOUNDS = Object.freeze({
  maxTurns: 24,
  maxDelegationDepth: 4,
  maxFanout: 8,
  maxRetriesPerTurn: 2,
  maxStageTimeMs: 60_000,
  maxRunTimeMs: 900_000,
  maxTokens: 120_000,
  maxCostUsd: 5,
});
export const AGENT_TEAM_CONTROL_ACTIONS = Object.freeze([
  "pause", "resume", "cancel", "retry", "request_review", "record_review",
]);

const ID = "^[a-z][a-z0-9._-]{0,79}$";
const REVISION = "^[A-Za-z0-9][A-Za-z0-9._:+-]{0,159}$";
const SHA = "^[0-9a-f]{40}$";
const DIGEST = "^[0-9a-f]{64}$";
const RUN_ID = "^atr_[0-9a-f]{24}$";
const PLAN_ID = "^atp_[0-9a-f]{24}$";
const TEXT = Object.freeze({ type: "string", minLength: 1, maxLength: 100_000 });
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value, maximum = 100_000) => typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
const unique = (values) => new Set(values).size === values.length;

export const AGENT_TEAM_BOUNDS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "maxTurns", "maxDelegationDepth", "maxFanout", "maxRetriesPerTurn",
    "maxStageTimeMs", "maxRunTimeMs", "maxTokens", "maxCostUsd",
  ],
  properties: {
    maxTurns: { type: "integer", minimum: 1, maximum: AGENT_TEAM_HARD_BOUNDS.maxTurns },
    maxDelegationDepth: { type: "integer", minimum: 0, maximum: AGENT_TEAM_HARD_BOUNDS.maxDelegationDepth },
    maxFanout: { type: "integer", minimum: 1, maximum: AGENT_TEAM_HARD_BOUNDS.maxFanout },
    maxRetriesPerTurn: { type: "integer", minimum: 0, maximum: AGENT_TEAM_HARD_BOUNDS.maxRetriesPerTurn },
    maxStageTimeMs: { type: "integer", minimum: 100, maximum: AGENT_TEAM_HARD_BOUNDS.maxStageTimeMs },
    maxRunTimeMs: { type: "integer", minimum: 100, maximum: AGENT_TEAM_HARD_BOUNDS.maxRunTimeMs },
    maxTokens: { type: "integer", minimum: 1, maximum: AGENT_TEAM_HARD_BOUNDS.maxTokens },
    maxCostUsd: { type: "number", minimum: 0, maximum: AGENT_TEAM_HARD_BOUNDS.maxCostUsd },
  },
});

export const AGENT_TEAM_PARTICIPANT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["participantId", "agentId", "agentRevision", "role", "goal", "persona"],
  properties: {
    participantId: { type: "string", pattern: ID },
    agentId: { type: "string", pattern: ID },
    agentRevision: { type: "string", pattern: REVISION },
    role: { type: "string", minLength: 1, maxLength: 160 },
    goal: { type: "string", minLength: 1, maxLength: 4_000 },
    persona: {
      type: "string",
      maxLength: 4_000,
      description: "Descriptive collaboration style only; never authority, instructions, model choice, or tool access.",
    },
  },
});

export const AGENT_TEAM_SOURCE_DOCUMENT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "schema", "teamId", "teamRevision", "source", "manager", "specialists",
    "workflow", "reviewPolicy", "bounds",
  ],
  properties: {
    schema: { const: AGENT_TEAM_SOURCE_SCHEMA },
    teamId: { type: "string", pattern: ID },
    teamRevision: { type: "string", pattern: REVISION },
    source: {
      type: "object",
      additionalProperties: false,
      required: ["uri", "digest"],
      properties: {
        uri: { type: "string", minLength: 1, maxLength: 4_096 },
        digest: { type: "string", pattern: DIGEST },
      },
    },
    manager: AGENT_TEAM_PARTICIPANT_SCHEMA,
    specialists: {
      type: "array",
      minItems: 1,
      maxItems: 15,
      items: AGENT_TEAM_PARTICIPANT_SCHEMA,
    },
    workflow: {
      type: "object",
      additionalProperties: false,
      required: ["workflowId", "workflowRevision", "allowedBranchIds"],
      properties: {
        workflowId: { type: "string", pattern: ID },
        workflowRevision: { type: "string", pattern: REVISION },
        allowedBranchIds: {
          type: "array",
          minItems: 1,
          maxItems: AGENT_TEAM_HARD_BOUNDS.maxTurns,
          uniqueItems: true,
          items: { type: "string", pattern: ID },
        },
      },
    },
    reviewPolicy: {
      type: "object",
      additionalProperties: false,
      required: ["policyId", "policyRevision"],
      properties: {
        policyId: { type: "string", pattern: ID },
        policyRevision: { type: "string", pattern: REVISION },
      },
    },
    bounds: AGENT_TEAM_BOUNDS_SCHEMA,
  },
});

const INVOCATION_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["command", "semantic", "binding", "sourceRevision"],
  properties: {
    command: { const: AGENT_TEAM_INVOCATION.command },
    semantic: { const: AGENT_TEAM_INVOCATION.semantic },
    binding: { const: AGENT_TEAM_INVOCATION.binding },
    sourceRevision: { type: "string", pattern: SHA },
  },
});

const SOURCE_IDENTITY_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["uri", "digest"],
  properties: {
    uri: { type: "string", minLength: 1, maxLength: 4_096 },
    digest: { type: "string", pattern: DIGEST },
  },
});

export const AGENT_TEAM_PLAN_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["invocation", "teamSource", "requestedTask", "bounds", "idempotencyKey"],
  properties: {
    invocation: INVOCATION_SCHEMA,
    teamSource: SOURCE_IDENTITY_SCHEMA,
    requestedTask: TEXT,
    bounds: AGENT_TEAM_BOUNDS_SCHEMA,
    idempotencyKey: { type: "string", minLength: 8, maxLength: 200 },
  },
});

export const AGENT_TEAM_START_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "planId", "planDigest", "teamRevision", "expectedStateVersion", "idempotencyKey",
  ],
  properties: {
    planId: { type: "string", pattern: PLAN_ID },
    planDigest: { type: "string", pattern: DIGEST },
    teamRevision: { type: "string", pattern: REVISION },
    expectedStateVersion: { const: 1 },
    idempotencyKey: { type: "string", minLength: 8, maxLength: 200 },
  },
});

export const AGENT_TEAM_LIST_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    runId: { type: "string", pattern: RUN_ID },
    states: {
      type: "array",
      maxItems: 10,
      uniqueItems: true,
      items: {
        enum: ["queued", "running", "review_pending", "paused", "blocked", "failed", "completed", "canceled"],
      },
    },
    limit: { type: "integer", minimum: 1, maximum: 200 },
  },
});

export const AGENT_TEAM_CONTROL_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["runId", "expectedStateVersion", "action", "idempotencyKey", "reason"],
  allOf: [{
    if: {
      required: ["action"],
      properties: { action: { const: "record_review" } },
    },
    then: { required: ["reviewReceipt"] },
    else: { not: { required: ["reviewReceipt"] } },
  }],
  properties: {
    runId: { type: "string", pattern: RUN_ID },
    expectedStateVersion: { type: "integer", minimum: 1 },
    action: { enum: AGENT_TEAM_CONTROL_ACTIONS },
    idempotencyKey: { type: "string", minLength: 8, maxLength: 200 },
    reason: { type: "string", minLength: 1, maxLength: 2_000 },
    reviewReceipt: {
      type: "object",
      additionalProperties: false,
      required: ["policyId", "policyRevision", "decision", "receiptId"],
      properties: {
        policyId: { type: "string", pattern: ID },
        policyRevision: { type: "string", pattern: REVISION },
        decision: { enum: ["approve", "revise", "reject"] },
        receiptId: { type: "string", minLength: 8, maxLength: 200 },
      },
    },
  },
});

const AGENT_TEAM_OUTPUT_SCHEMAS = buildAgentTeamToolOutputSchemas({
  resultSchema: AGENT_TEAM_RESULT_SCHEMA,
  bounds: AGENT_TEAM_HARD_BOUNDS,
  controlActions: AGENT_TEAM_CONTROL_ACTIONS,
  patterns: { id: ID, revision: REVISION, sha: SHA, digest: DIGEST, runId: RUN_ID, planId: PLAN_ID },
  boundsSchema: AGENT_TEAM_BOUNDS_SCHEMA,
  workflowSchema: AGENT_TEAM_SOURCE_DOCUMENT_SCHEMA.properties.workflow,
  sourceIdentitySchema: SOURCE_IDENTITY_SCHEMA,
});
export const AGENT_TEAM_PLAN_OUTPUT_SCHEMA = Object.freeze(AGENT_TEAM_OUTPUT_SCHEMAS.plan);
export const AGENT_TEAM_START_OUTPUT_SCHEMA = Object.freeze(AGENT_TEAM_OUTPUT_SCHEMAS.start);
export const AGENT_TEAM_LIST_OUTPUT_SCHEMA = Object.freeze(AGENT_TEAM_OUTPUT_SCHEMAS.list);
export const AGENT_TEAM_CONTROL_OUTPUT_SCHEMA = Object.freeze(AGENT_TEAM_OUTPUT_SCHEMAS.control);
export const AGENT_TEAM_TOOL_OUTPUT_SCHEMA = Object.freeze(AGENT_TEAM_OUTPUT_SCHEMAS.all);

const add = (issues, path, reason) => issues.push({ path, reason });
const rejectAdditionalProperties = (value, schema, path, issues) => {
  if (!isRecord(value)) return;
  const allowed = new Set(Object.keys(schema.properties || {}));
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      add(issues, path ? `${path}.${key}` : key, "additional property is not allowed");
    }
  }
};
const validId = (value) => new RegExp(ID).test(String(value || ""));
const validRevision = (value) => new RegExp(REVISION).test(String(value || ""));
const validDigest = (value) => new RegExp(DIGEST).test(String(value || ""));
const validSha = (value) => new RegExp(SHA).test(String(value || ""));

export function validateAgentTeamBounds(bounds, path = "bounds") {
  const issues = [];
  if (!isRecord(bounds)) return { ok: false, issues: [{ path, reason: "must be an object" }] };
  rejectAdditionalProperties(bounds, AGENT_TEAM_BOUNDS_SCHEMA, path, issues);
  for (const [field, maximum] of Object.entries(AGENT_TEAM_HARD_BOUNDS)) {
    const value = bounds[field];
    const minimum = ["maxDelegationDepth", "maxRetriesPerTurn"].includes(field)
      ? 0
      : (["maxStageTimeMs", "maxRunTimeMs"].includes(field) ? 100 : 1);
    const valid = field === "maxCostUsd"
      ? typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= maximum
      : Number.isInteger(value) && value >= minimum && value <= maximum;
    if (!valid) add(issues, `${path}.${field}`, `must not exceed the hard maximum ${maximum}`);
  }
  if (Number(bounds.maxStageTimeMs) > Number(bounds.maxRunTimeMs)) {
    add(issues, `${path}.maxStageTimeMs`, "must not exceed maxRunTimeMs");
  }
  return { ok: issues.length === 0, issues };
}

const validateParticipant = (participant, path, issues) => {
  if (!isRecord(participant)) return add(issues, path, "must be an object");
  rejectAdditionalProperties(participant, AGENT_TEAM_PARTICIPANT_SCHEMA, path, issues);
  if (!validId(participant.participantId)) add(issues, `${path}.participantId`, "must be a stable participant id");
  if (!validId(participant.agentId)) add(issues, `${path}.agentId`, "must be an exact Agent Definition id");
  if (!validRevision(participant.agentRevision)) add(issues, `${path}.agentRevision`, "must be an exact Agent Definition revision");
  if (!text(participant.role, 160)) add(issues, `${path}.role`, "must be bounded descriptive metadata");
  if (!text(participant.goal, 4_000)) add(issues, `${path}.goal`, "must be bounded descriptive metadata");
  if (typeof participant.persona !== "string" || participant.persona.length > 4_000) {
    add(issues, `${path}.persona`, "must be bounded descriptive metadata");
  }
};

export function validateAgentTeamSourceDocument(document) {
  const issues = [];
  if (!isRecord(document)) return { ok: false, issues: [{ path: "", reason: "team source must be an object" }] };
  rejectAdditionalProperties(document, AGENT_TEAM_SOURCE_DOCUMENT_SCHEMA, "", issues);
  if (document.schema !== AGENT_TEAM_SOURCE_SCHEMA) add(issues, "schema", `must equal ${AGENT_TEAM_SOURCE_SCHEMA}`);
  if (!validId(document.teamId)) add(issues, "teamId", "must be a stable team id");
  if (!validRevision(document.teamRevision)) add(issues, "teamRevision", "must be an exact immutable revision");
  rejectAdditionalProperties(
    document.source,
    AGENT_TEAM_SOURCE_DOCUMENT_SCHEMA.properties.source,
    "source",
    issues,
  );
  if (!isRecord(document.source) || !text(document.source.uri, 4_096) || !validDigest(document.source.digest)) {
    add(issues, "source", "must contain an exact URI and lowercase sha256 digest");
  }
  validateParticipant(document.manager, "manager", issues);
  const specialists = Array.isArray(document.specialists) ? document.specialists : [];
  if (specialists.length < 1 || specialists.length > 15) add(issues, "specialists", "must contain 1 through 15 specialists");
  specialists.forEach((participant, index) => validateParticipant(participant, `specialists[${index}]`, issues));
  const participants = [document.manager, ...specialists].filter(isRecord);
  if (!unique(participants.map((participant) => participant.participantId))) add(issues, "participants", "participant ids must be unique");
  const workflow = document.workflow;
  rejectAdditionalProperties(
    workflow,
    AGENT_TEAM_SOURCE_DOCUMENT_SCHEMA.properties.workflow,
    "workflow",
    issues,
  );
  if (!isRecord(workflow) || !validId(workflow.workflowId) || !validRevision(workflow.workflowRevision)) {
    add(issues, "workflow", "must reference one exact Agent Orchestration workflow");
  }
  if (
    !Array.isArray(workflow?.allowedBranchIds)
    || workflow.allowedBranchIds.length < 1
    || workflow.allowedBranchIds.length > AGENT_TEAM_HARD_BOUNDS.maxTurns
    || !workflow.allowedBranchIds.every(validId)
    || !unique(workflow.allowedBranchIds)
  ) add(issues, "workflow.allowedBranchIds", "must be a unique bounded registered branch-id array");
  const review = document.reviewPolicy;
  rejectAdditionalProperties(
    review,
    AGENT_TEAM_SOURCE_DOCUMENT_SCHEMA.properties.reviewPolicy,
    "reviewPolicy",
    issues,
  );
  if (!isRecord(review) || !validId(review.policyId) || !validRevision(review.policyRevision)) {
    add(issues, "reviewPolicy", "must reference one exact review policy");
  }
  issues.push(...validateAgentTeamBounds(document.bounds).issues);
  return { ok: issues.length === 0, issues };
}

export function validateAgentTeamPlanRequest(input) {
  const issues = [];
  if (!isRecord(input)) return { ok: false, issues: [{ path: "", reason: "plan input must be an object" }] };
  const invocation = input.invocation;
  if (
    !isRecord(invocation)
    || invocation.command !== AGENT_TEAM_INVOCATION.command
    || invocation.semantic !== AGENT_TEAM_INVOCATION.semantic
    || invocation.binding !== AGENT_TEAM_INVOCATION.binding
    || !validSha(invocation.sourceRevision)
  ) add(issues, "invocation", "must contain the exact source-revision-fenced canonical tuple");
  if (!isRecord(input.teamSource) || !text(input.teamSource.uri, 4_096) || !validDigest(input.teamSource.digest)) {
    add(issues, "teamSource", "must contain an exact local source URI and digest");
  }
  if (!text(input.requestedTask)) add(issues, "requestedTask", "must be non-empty and at most 100000 characters");
  if (!text(input.idempotencyKey, 200) || input.idempotencyKey.length < 8) add(issues, "idempotencyKey", "must contain 8 through 200 characters");
  issues.push(...validateAgentTeamBounds(input.bounds).issues);
  return { ok: issues.length === 0, issues };
}

export const effectiveAgentTeamBounds = (sourceBounds, callerBounds) => (
  Object.freeze(Object.fromEntries(
    Object.keys(AGENT_TEAM_HARD_BOUNDS).map((field) => [
      field,
      Math.min(AGENT_TEAM_HARD_BOUNDS[field], sourceBounds[field], callerBounds[field]),
    ]),
  ))
);
