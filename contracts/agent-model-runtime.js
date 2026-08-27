export const AGENT_MODEL_RUNTIME_SCHEMA = "agenticgraph.agent-model-runtime/v1";

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const validateRequirements = (requirements) => {
  if (!isObject(requirements)) return "agent definition does not declare model requirements";
  if (!nonEmpty(requirements.providerId)) return "providerId must be a non-empty string";
  if (!Array.isArray(requirements.features) || requirements.features.length === 0 || !requirements.features.every(nonEmpty)) {
    return "features must be a non-empty string array";
  }
  if (!isObject(requirements.transport) || !nonEmpty(requirements.transport.delivery) || !nonEmpty(requirements.transport.connection)) {
    return "transport delivery and connection must be non-empty strings";
  }
  return "";
};

const validateResolutionPacket = (packet, requirements) => {
  if (!isObject(packet)) return "model resolver must return a packet object";
  if (packet.schemaVersion !== AGENT_MODEL_RUNTIME_SCHEMA) return `schemaVersion must equal ${AGENT_MODEL_RUNTIME_SCHEMA}`;
  for (const [owner, fields] of [["provider", ["id", "revision", "adapterId"]], ["model", ["id"]], ["transport", ["id", "delivery", "connection"]]]) {
    if (!isObject(packet[owner])) return `${owner} must be an object`;
    for (const field of fields) {
      if (!nonEmpty(packet[owner][field])) return `${owner}.${field} must be a non-empty string`;
    }
  }
  if (!Array.isArray(packet.model.features) || !packet.model.features.every(nonEmpty)) return "model.features must be a string array";
  if (packet.provider.id !== requirements.providerId) return "resolved provider does not satisfy the agent definition";
  if (!requirements.features.every((feature) => packet.model.features.includes(feature))) return "resolved model does not satisfy required features";
  if (packet.transport.delivery !== requirements.transport.delivery || packet.transport.connection !== requirements.transport.connection) {
    return "resolved transport does not satisfy the agent definition";
  }
  return "";
};

const buildInstructions = (definition) => [
  `You are the ${definition.title}.`,
  ...definition.promptContract,
  `Fallback: ${definition.fallback}`,
  "Return source-grounded Markdown. Keep unknowns explicit and never invent citations, prices, policy coverage, or media URLs.",
];

export async function prepareAgentDefinition(definition, { resolveModel } = {}) {
  if (!isObject(definition) || !nonEmpty(definition.id) || !nonEmpty(definition.version)) {
    return { ok: false, error: { code: "invalid_agent_definition" } };
  }
  const requirementsError = validateRequirements(definition.modelRequirements);
  if (requirementsError) {
    return { ok: false, error: { code: "agent_model_not_prepared", message: requirementsError } };
  }
  if (typeof resolveModel !== "function") {
    return { ok: false, error: { code: "model_resolver_unavailable" } };
  }

  let resolution;
  try {
    resolution = await resolveModel({
      agent: { id: definition.id, version: definition.version },
      requirements: structuredClone(definition.modelRequirements),
    });
  } catch (error) {
    return {
      ok: false,
      error: { code: "model_resolution_failed", message: error instanceof Error ? error.message : String(error) },
    };
  }
  if (!isObject(resolution) || resolution.status !== "ready") {
    return {
      ok: false,
      error: {
        code: "model_resolution_blocked",
        reason: nonEmpty(resolution?.reason) ? resolution.reason : "resolver_did_not_return_ready",
      },
    };
  }
  const packetError = validateResolutionPacket(resolution.packet, definition.modelRequirements);
  if (packetError) {
    return { ok: false, error: { code: "invalid_model_resolution", message: packetError } };
  }

  return {
    ok: true,
    preparedAgent: Object.freeze({
      id: definition.id,
      version: definition.version,
      title: definition.title,
      instructions: Object.freeze(buildInstructions(definition)),
      modelRuntime: deepFreeze(structuredClone(resolution.packet)),
    }),
  };
}

export function createRunningAgentAdapterRegistry(adapters = []) {
  const byId = new Map();
  for (const adapter of adapters) {
    if (!isObject(adapter) || !nonEmpty(adapter.id) || typeof adapter.execute !== "function") {
      throw new TypeError("running agent adapters require a non-empty id and execute function");
    }
    if (byId.has(adapter.id)) throw new TypeError(`duplicate running agent adapter: ${adapter.id}`);
    byId.set(adapter.id, Object.freeze(adapter));
  }
  return Object.freeze({
    ids: Object.freeze([...byId.keys()]),
    resolve(adapterId) {
      return byId.get(String(adapterId || "").trim()) || null;
    },
  });
}
