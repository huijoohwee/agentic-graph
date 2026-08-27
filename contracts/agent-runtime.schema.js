import registryDocument from "../data/config/agents/agent-definitions.json" with { type: "json" };
import { prepareAgentDefinition } from "./agent-model-runtime.js";

export const AGENT_DEFINITION_REGISTRY_SCHEMA = "agenticgraph.agent-definition-registry/v1";
export const AGENT_RUN_INPUT_SCHEMA_ID = "agenticgraph.agent-run.input/v1";
export const AGENT_RUN_OUTPUT_SCHEMA_ID = "agenticgraph.agent-run.output/v1";
export const AGENT_RUNTIME_TOOL_NAME = "agenticgraph.superagent.run";
export const AGENT_RUNTIME_PAID_GATE_ID = "paid-model-call";

const AGENT_ID_PATTERN = /^agent\.([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const INVOCATION_PATTERN = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)-agent$/;
const MAX_BRIEF_CHARS = 20_000;

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const unique = (values) => new Set(values).size === values.length;

export function invocationForAgentId(agentId) {
  const match = String(agentId || "").trim().match(AGENT_ID_PATTERN);
  return match ? `/${match[1]}-agent` : "";
}

export function agentIdForInvocation(invocation) {
  const token = String(invocation || "").trim().toLowerCase().split(/\s+/, 1)[0];
  const match = token.match(INVOCATION_PATTERN);
  return match ? `agent.${match[1]}` : "";
}

export function validateAgentDefinitionRegistry(document = registryDocument) {
  const errors = [];
  const add = (path, reason) => errors.push({ path, reason });
  if (!isObject(document)) return { valid: false, errors: [{ path: "", reason: "registry must be an object" }] };
  if (document.schemaVersion !== AGENT_DEFINITION_REGISTRY_SCHEMA) add("schemaVersion", `must equal ${AGENT_DEFINITION_REGISTRY_SCHEMA}`);
  if (!isObject(document.profiles)) add("profiles", "must be an object");
  if (!Array.isArray(document.agents) || document.agents.length === 0) add("agents", "must be a non-empty array");

  const profileIds = new Set(Object.keys(isObject(document.profiles) ? document.profiles : {}));
  for (const [profileId, profile] of Object.entries(isObject(document.profiles) ? document.profiles : {})) {
    if (!Array.isArray(profile.roles) || profile.roles.length === 0) add(`profiles.${profileId}.roles`, "must be non-empty");
    if (!Array.isArray(profile.tasks) || profile.tasks.length === 0) add(`profiles.${profileId}.tasks`, "must be non-empty");
    const roleIds = (profile.roles || []).map((role) => role?.id).filter(nonEmpty);
    const taskIds = (profile.tasks || []).map((task) => task?.id).filter(nonEmpty);
    if (!unique(roleIds)) add(`profiles.${profileId}.roles`, "role ids must be unique");
    if (!unique(taskIds)) add(`profiles.${profileId}.tasks`, "task ids must be unique");
    for (const task of profile.tasks || []) {
      if (!roleIds.includes(task?.role)) add(`profiles.${profileId}.tasks.${task?.id || "unknown"}.role`, "must reference a profile role");
      for (const dependency of task?.dependsOn || []) {
        if (!taskIds.includes(dependency)) add(`profiles.${profileId}.tasks.${task?.id || "unknown"}.dependsOn`, `unknown dependency ${dependency}`);
      }
    }
  }

  const agentIds = [];
  const invocations = [];
  for (const [index, definition] of (Array.isArray(document.agents) ? document.agents : []).entries()) {
    const path = `agents[${index}]`;
    if (!isObject(definition)) {
      add(path, "must be an object");
      continue;
    }
    if (!AGENT_ID_PATTERN.test(definition.id || "")) add(`${path}.id`, "must match agent.<domain>");
    if (!profileIds.has(definition.planProfile)) add(`${path}.planProfile`, "must reference a profile");
    for (const field of ["title", "summary", "version", "inputSchemaRef", "outputSchemaRef", "fallback"]) {
      if (!nonEmpty(definition[field])) add(`${path}.${field}`, "must be a non-empty string");
    }
    if (definition.runtimeKernel === "sme.risk.profile") {
      if (definition.skillVariant !== "agent.sme") add(`${path}.skillVariant`, "must equal agent.sme for the SME risk kernel");
      if (definition.skillId !== "sme.risk.profile") add(`${path}.skillId`, "must equal sme.risk.profile");
      if (definition.skillInputSchemaRef !== "agenticgraph-sme-profile/v1") add(`${path}.skillInputSchemaRef`, "must reference the SME profile schema");
      if (definition.skillOutputSchemaRef !== "agenticgraph-sme-risk-run/v1") add(`${path}.skillOutputSchemaRef`, "must reference the SME run schema");
      if (definition.topology?.pattern !== "fan-out/fan-in" || definition.topology?.maxIterations !== 1) add(`${path}.topology`, "must declare bounded fan-out/fan-in topology");
      if (definition.bounds?.maxWallSeconds > 300 || definition.bounds?.tokenBudget > 100000) add(`${path}.bounds`, "must stay within the SME timeout and token budget");
      if (definition.modelRequirements?.providerId !== "cloudflare-workers-ai") add(`${path}.modelRequirements.providerId`, "must select the registered Workers AI provider");
      if (!definition.modelRequirements?.features?.includes("text")) add(`${path}.modelRequirements.features`, "must require text generation");
      if (definition.modelRequirements?.transport?.delivery !== "complete" || definition.modelRequirements?.transport?.connection !== "per-run") {
        add(`${path}.modelRequirements.transport`, "must require complete, per-run delivery");
      }
    }
    if (definition.modelRequirements !== undefined) {
      if (!isObject(definition.modelRequirements)) add(`${path}.modelRequirements`, "must be an object");
      if (!nonEmpty(definition.modelRequirements?.providerId)) add(`${path}.modelRequirements.providerId`, "must be a non-empty string");
      if (!Array.isArray(definition.modelRequirements?.features) || !definition.modelRequirements.features.every(nonEmpty)) {
        add(`${path}.modelRequirements.features`, "must be a string array");
      }
      if (!nonEmpty(definition.modelRequirements?.transport?.delivery) || !nonEmpty(definition.modelRequirements?.transport?.connection)) {
        add(`${path}.modelRequirements.transport`, "must declare delivery and connection");
      }
    }
    for (const field of ["capabilities", "policyRefs", "renderers", "vccs", "promptContract"]) {
      if (!Array.isArray(definition[field]) || definition[field].length === 0 || !definition[field].every(nonEmpty)) {
        add(`${path}.${field}`, "must be a non-empty string array");
      }
    }
    const invocation = invocationForAgentId(definition.id);
    if (!invocation) add(`${path}.id`, "must resolve to an invocation");
    agentIds.push(definition.id);
    invocations.push(invocation);
  }
  if (!unique(agentIds)) add("agents", "agent ids must be unique");
  if (!unique(invocations)) add("agents", "derived invocations must be unique");
  return { valid: errors.length === 0, errors };
}

const registryValidation = validateAgentDefinitionRegistry(registryDocument);
if (!registryValidation.valid) {
  throw new Error(`Invalid agent definition registry: ${JSON.stringify(registryValidation.errors)}`);
}

export const AGENT_DEFINITION_REGISTRY = Object.freeze(registryDocument);
export const AGENT_DEFINITIONS = Object.freeze(registryDocument.agents.map((definition) => Object.freeze({
  ...definition,
  invocation: invocationForAgentId(definition.id),
})));

export function listAgentDefinitions() {
  return AGENT_DEFINITIONS.map((definition) => ({ ...definition }));
}

export function resolveAgentDefinition(selector) {
  const raw = String(selector || "").trim().toLowerCase();
  if (!raw) return null;
  const agentId = raw.startsWith("/") ? agentIdForInvocation(raw) : raw;
  return AGENT_DEFINITIONS.find((definition) => definition.id === agentId) || null;
}

const approvedGateIds = (approvals) => new Set((Array.isArray(approvals) ? approvals : []).flatMap((approval) => {
  if (typeof approval === "string") return approval.trim() ? [approval.trim()] : [];
  if (!isObject(approval) || !nonEmpty(approval.gateId) || approval.approvalState === "rejected" || approval.approvalState === "pending") return [];
  return [approval.gateId.trim()];
}));

export const AGENT_RUN_INPUT_SCHEMA = Object.freeze({
  $id: AGENT_RUN_INPUT_SCHEMA_ID,
  type: "object",
  additionalProperties: false,
  required: ["brief"],
  anyOf: [{ required: ["agentDefinitionId"] }, { required: ["invocation"] }],
  properties: {
    agentDefinitionId: { type: "string", pattern: "^agent\\.[a-z0-9]+(?:-[a-z0-9]+)*$" },
    invocation: { type: "string", pattern: "^/[a-z0-9]+(?:-[a-z0-9]+)*-agent(?:\\s.*)?$" },
    brief: { type: "string", minLength: 1, maxLength: MAX_BRIEF_CHARS },
    mode: { type: "string", enum: ["dry-run", "live"], default: "dry-run" },
    runId: { type: "string", minLength: 1, maxLength: 128 },
    providerMode: { type: "string", enum: ["workers-ai", "byteplus-modelark", "mock"] },
    approvals: { type: "array", items: { oneOf: [{ type: "string" }, { type: "object", additionalProperties: true }] } },
    context: { type: "object", additionalProperties: true },
  },
});

export const AGENT_RUN_OUTPUT_SCHEMA = Object.freeze({
  $id: AGENT_RUN_OUTPUT_SCHEMA_ID,
  type: "object",
  additionalProperties: true,
  required: ["contractVersion", "runId", "agentDefinitionId", "invocation", "mode", "status", "plan", "budgetMeters"],
  properties: {
    contractVersion: { type: "string" },
    runId: { type: "string" },
    agentDefinitionId: { type: "string" },
    invocation: { type: "string" },
    mode: { type: "string", enum: ["dry-run", "live"] },
    status: { type: "string", enum: ["planned", "approval_required", "ready", "completed", "blocked"] },
    plan: { type: "object", additionalProperties: true },
    budgetMeters: { type: "object", additionalProperties: true },
    result: { type: "object", additionalProperties: true },
    modelRuntime: { type: "object", additionalProperties: true },
    error: { type: "object", additionalProperties: true },
  },
});

function validateAgentRunInput(input) {
  const errors = [];
  if (!isObject(input)) return { valid: false, errors: [{ path: "", reason: "input must be an object" }] };
  const byId = nonEmpty(input.agentDefinitionId) ? resolveAgentDefinition(input.agentDefinitionId) : null;
  const byInvocation = nonEmpty(input.invocation) ? resolveAgentDefinition(input.invocation) : null;
  if (!byId && !byInvocation) errors.push({ path: "agentDefinitionId", reason: "a known agentDefinitionId or invocation is required" });
  if (byId && byInvocation && byId.id !== byInvocation.id) errors.push({ path: "invocation", reason: "invocation and agentDefinitionId must resolve to the same agent" });
  if (!nonEmpty(input.brief)) errors.push({ path: "brief", reason: "must be a non-empty string" });
  if (typeof input.brief === "string" && input.brief.length > MAX_BRIEF_CHARS) errors.push({ path: "brief", reason: `must be at most ${MAX_BRIEF_CHARS} characters` });
  if (input.mode !== undefined && !["dry-run", "live"].includes(input.mode)) errors.push({ path: "mode", reason: "must be dry-run or live" });
  if (input.mode === "live" && input.providerMode !== undefined && input.providerMode !== "workers-ai") {
    errors.push({ path: "providerMode", reason: "live prepared-agent execution resolves through workers-ai" });
  }
  return { valid: errors.length === 0, errors, definition: byId || byInvocation };
}

const resolveToolName = (toolName, providerMode) => {
  if (toolName !== "video.generate") return toolName;
  if (providerMode === "mock") return "video.generate.mock";
  if (providerMode === "byteplus-modelark") return "video.generate.byteplus_modelark_placeholder";
  return "video.generate.provider_adapter";
};

export function compileAgentRun(input, { createRunId = () => crypto.randomUUID() } = {}) {
  const validation = validateAgentRunInput(input);
  if (!validation.valid) return { ok: false, error: { code: "invalid_agent_run_input", details: validation.errors } };
  const definition = validation.definition;
  const mode = input.mode || "dry-run";
  const providerMode = input.providerMode || (mode === "dry-run" ? "mock" : "workers-ai");
  const profile = registryDocument.profiles[definition.planProfile];
  const plan = {
    profileId: definition.planProfile,
    capabilities: [...definition.capabilities],
    roles: profile.roles.map((role) => ({ ...role, tools: role.tools.map((tool) => resolveToolName(tool, providerMode)) })),
    tasks: profile.tasks.map((task) => ({ ...task, dependsOn: [...task.dependsOn], tool: resolveToolName(task.tool, providerMode) })),
    policyRefs: [...definition.policyRefs],
    renderers: [...definition.renderers],
    bounds: { ...definition.bounds },
    vccs: [...definition.vccs],
    ...(definition.skillId ? { skill: {
      variant: definition.skillVariant,
      id: definition.skillId,
      inputSchemaRef: definition.skillInputSchemaRef,
      outputSchemaRef: definition.skillOutputSchemaRef,
      runtimeKernel: definition.runtimeKernel,
    } } : {}),
    ...(definition.topology ? { topology: structuredClone(definition.topology) } : {}),
  };
  const hasPaidApproval = approvedGateIds(input.approvals).has(AGENT_RUNTIME_PAID_GATE_ID);
  const status = mode === "dry-run" ? "planned" : hasPaidApproval ? "ready" : "approval_required";
  return {
    ok: status !== "approval_required",
    payload: {
      contractVersion: AGENT_RUN_OUTPUT_SCHEMA_ID,
      runId: String(input.runId || "").trim() || createRunId(),
      agentDefinitionId: definition.id,
      invocation: definition.invocation,
      mode,
      providerMode,
      status,
      plan,
      promptContract: [...definition.promptContract],
      fallback: definition.fallback,
      budgetMeters: { estimatedCostUsd: 0, actualCostUsd: 0, paidProviderCalls: 0 },
      ...(status === "approval_required" ? { error: { code: "approval_required", gateId: AGENT_RUNTIME_PAID_GATE_ID } } : {}),
    },
  };
}

export async function executeAgentRun(input, { modelResolver, runningAgentAdapters, createRunId } = {}) {
  const compiled = compileAgentRun(input, { createRunId });
  if (!compiled.payload || compiled.payload.status !== "ready") return compiled;
  const preparation = await prepareAgentDefinition(
    resolveAgentDefinition(compiled.payload.agentDefinitionId),
    { resolveModel: modelResolver },
  );
  if (!preparation.ok) {
    return { ok: false, payload: { ...compiled.payload, status: "blocked", error: preparation.error } };
  }
  const adapterId = preparation.preparedAgent.modelRuntime.provider.adapterId;
  const adapter = runningAgentAdapters?.resolve?.(adapterId);
  if (!adapter) {
    return {
      ok: false,
      payload: {
        ...compiled.payload,
        status: "blocked",
        modelRuntime: preparation.preparedAgent.modelRuntime,
        error: { code: "running_agent_adapter_unavailable", adapterId },
      },
    };
  }
  try {
    const result = await adapter.execute({
      input: { ...input },
      run: compiled.payload,
      preparedAgent: preparation.preparedAgent,
    });
    return {
      ok: true,
      payload: {
        ...compiled.payload,
        status: "completed",
        modelRuntime: preparation.preparedAgent.modelRuntime,
        result,
        budgetMeters: {
          ...compiled.payload.budgetMeters,
          estimatedCostUsd: null,
          actualCostUsd: null,
          paidProviderCalls: 1,
          costStatus: "provider_usage_unpriced",
        },
      },
    };
  } catch (error) {
    return {
      ok: false,
      payload: {
        ...compiled.payload,
        status: "blocked",
        modelRuntime: preparation.preparedAgent.modelRuntime,
        budgetMeters: {
          estimatedCostUsd: null,
          actualCostUsd: null,
          paidProviderCalls: 1,
          costStatus: "provider_call_failed_unpriced",
        },
        error: { code: "execution_failed", message: error instanceof Error ? error.message : String(error) },
      },
    };
  }
}
