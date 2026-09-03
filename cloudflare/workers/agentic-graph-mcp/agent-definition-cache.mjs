import { createAgentRegistry } from "../../../src/registry/agent-registry.mjs";

const ACTIVE_SNAPSHOT_KEY = "travel-commerce:agent-definitions:active:v1";
const SNAPSHOT_SCHEMA = "agentic-graph.agent-definition-cache/v1";
const MAX_MEMORY_REVISIONS = 4;

const canonicalDefinitions = (definitions) => JSON.stringify(definitions.map((definition) => ({
  agentId: definition.agentId,
  contentHash: definition.contentHash,
  declaredCategory: definition.declaredCategory,
  declaredToolAllowlist: [...definition.declaredToolAllowlist],
  schemaRevision: definition.schemaRevision,
  trustStatus: definition.trustStatus,
})));

const buildRegistry = (definitions) => {
  const registry = createAgentRegistry();
  for (const definition of definitions) {
    const result = registry.register(definition, {
      status: "pass",
      passResultId: `configured:${definition.agentId}`,
      contentHash: definition.contentHash,
      schemaRevision: definition.schemaRevision,
    });
    if (result.status !== "registered") throw new Error("registry configuration rejected");
  }
  return registry;
};

const readSnapshot = (raw) => {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 64 * 1024) return null;
  try {
    const value = JSON.parse(raw);
    return value?.schema === SNAPSHOT_SCHEMA && typeof value.canonical === "string"
      ? value.canonical
      : null;
  } catch {
    return null;
  }
};

const idsFromCanonical = (canonical) => {
  try {
    const value = JSON.parse(canonical);
    return Array.isArray(value)
      ? new Set(value.flatMap((item) => typeof item?.agentId === "string" ? [item.agentId] : []))
      : new Set();
  } catch {
    return new Set();
  }
};

const classifyDefinitionChange = (previous, next) => {
  if (!previous) return "initial-registration";
  if (previous === next) return "none";
  const before = idsFromCanonical(previous);
  const after = idsFromCanonical(next);
  const registered = [...after].some((agentId) => !before.has(agentId));
  const deregistered = [...before].some((agentId) => !after.has(agentId));
  if (registered && deregistered) return "registration-and-deregistration";
  if (registered) return "registration";
  if (deregistered) return "deregistration";
  // A changed definition for the same identity is an atomic de-register/register.
  return "registration-and-deregistration";
};

export class AgentDefinitionCache {
  constructor() {
    this.memory = new Map();
  }

  async resolve(definitions, kv) {
    const canonical = canonicalDefinitions(definitions);
    const memory = this.memory.get(canonical);
    if (memory) return Object.freeze({ ok: true, registry: memory, source: "memory", invalidation: "none" });

    let previous;
    try {
      previous = readSnapshot(await kv.get(ACTIVE_SNAPSHOT_KEY));
    } catch {
      return Object.freeze({ ok: false, reason: "kv-read-failed" });
    }

    const invalidation = classifyDefinitionChange(previous, canonical);
    if (invalidation !== "none" && invalidation !== "initial-registration") this.memory.clear();
    if (previous !== canonical) {
      try {
        await kv.put(ACTIVE_SNAPSHOT_KEY, JSON.stringify({ schema: SNAPSHOT_SCHEMA, canonical }));
      } catch {
        return Object.freeze({ ok: false, reason: "kv-write-failed" });
      }
    }

    const registry = buildRegistry(definitions);
    this.memory.set(canonical, registry);
    while (this.memory.size > MAX_MEMORY_REVISIONS) this.memory.delete(this.memory.keys().next().value);
    return Object.freeze({
      ok: true,
      registry,
      source: previous === canonical ? "kv" : "configuration",
      invalidation,
    });
  }
}

export const sharedAgentDefinitionCache = new AgentDefinitionCache();
