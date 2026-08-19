import { normalizeCategoryLabel } from "./scope-keys.mjs";
import { createSessionLogStore } from "./session-log.mjs";

const NO_MATCH_REASON = Object.freeze({
  invalidCategory: "invalid-category",
  unmatchedCategory: "unmatched-category",
  ambiguousCategory: "ambiguous-category",
  registrationStateUnavailable: "registration-state-unavailable",
  agentNotRegistered: "agent-not-registered",
});

export class AgentRegistry {
  constructor(options = {}) {
    this.definitions = new Map();
    this.routingTable = new Map();
    this.validationPasses = new Map();
    this.sessionLog = options.sessionLog ?? createSessionLogStore();
    this.dispatches = [];
  }

  register(definition, validationResult) {
    if (validationResult?.status !== "pass") {
      return { status: "reject", reason: "validation-pass-required" };
    }

    const normalized = normalizeCategoryLabel(definition.declaredCategory);
    if (!normalized.ok) {
      return { status: "reject", reason: normalized.reason };
    }

    const existing = this.definitions.get(definition.agentId);
    if (existing) {
      this.remove(definition.agentId);
    }

    this.definitions.set(definition.agentId, { ...definition, declaredCategory: normalized.value });
    this.validationPasses.set(definition.agentId, validationResult);
    const agents = this.routingTable.get(normalized.value) ?? new Set();
    agents.add(definition.agentId);
    this.routingTable.set(normalized.value, agents);
    return { status: "registered", agentId: definition.agentId, normalizedCategory: normalized.value };
  }

  remove(agentId) {
    const definition = this.definitions.get(agentId);
    this.definitions.delete(agentId);
    this.validationPasses.delete(agentId);
    if (!definition) {
      return { status: "not-found" };
    }
    const agents = this.routingTable.get(definition.declaredCategory);
    agents?.delete(agentId);
    return { status: "removed", agentId };
  }

  listDefinitions() {
    return [...this.definitions.values()].map((definition) => ({ ...definition }));
  }

  route(intent, options = {}) {
    const sessionId = options.sessionId ?? "session:default";
    const normalized = normalizeCategoryLabel(intent?.category);
    if (!normalized.ok) {
      return this.recordNoMatch(sessionId, intent, NO_MATCH_REASON.invalidCategory);
    }

    const candidateIds = [...(this.routingTable.get(normalized.value) ?? [])];
    if (candidateIds.length === 0) {
      return this.recordNoMatch(sessionId, intent, NO_MATCH_REASON.unmatchedCategory);
    }

    const registeredIds = candidateIds.filter((agentId) => this.definitions.has(agentId));
    if (registeredIds.length === 0) {
      return this.recordNoMatch(sessionId, intent, NO_MATCH_REASON.agentNotRegistered);
    }
    if (registeredIds.length > 1) {
      return this.recordNoMatch(sessionId, intent, NO_MATCH_REASON.ambiguousCategory);
    }

    const agentId = registeredIds[0];
    const discoveryInput = {
      intentId: intent.intentId,
      category: normalized.value,
      constraints: intent.constraints,
    };
    this.sessionLog.append(sessionId, {
      eventType: "routing",
      intentId: intent.intentId,
      agentId,
      categoryReceived: intent.category,
      recordedAt: isoNow(),
    });
    const outcome = { status: "dispatch", intentId: intent.intentId, agentId, discoveryInput };
    this.dispatches.push(outcome);
    return outcome;
  }

  admitOffer(typedOffer, options = {}) {
    const sessionId = options.sessionId ?? "session:default";
    if (!this.definitions.has(typedOffer?.agentId)) {
      this.sessionLog.append(sessionId, {
        eventType: "fail-closed",
        offerId: typedOffer?.offer?.offerId,
        agentId: typedOffer?.agentId ?? null,
        reason: "unrecognized-agent",
        recordedAt: isoNow(),
      });
      return { status: "fail-closed", reason: "unrecognized-agent" };
    }
    return { status: "accepted", typedOffer };
  }

  recordNoMatch(sessionId, intent, reason) {
    this.sessionLog.append(sessionId, {
      eventType: "routing",
      intentId: intent?.intentId,
      agentId: null,
      reason,
      categoryReceived: intent?.category,
      recordedAt: isoNow(),
    });
    return { status: "no-match", intentId: intent?.intentId, reason, categoryReceived: intent?.category };
  }
}

export function createAgentRegistry(options) {
  return new AgentRegistry(options);
}

function isoNow() {
  return new Date().toISOString();
}
