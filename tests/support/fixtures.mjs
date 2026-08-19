export function validDefinition(overrides = {}) {
  return {
    agentId: "agent-flight",
    declaredCategory: "flights",
    declaredToolAllowlist: ["discoverOffers"],
    trustStatus: "declared-and-present",
    schemaRevision: "schema-1",
    contentHash: "hash-flight",
    ...overrides,
  };
}

export function validIntent(overrides = {}) {
  return {
    intentId: "intent-1",
    category: "flights",
    constraints: { budgetMinor: 10_000, currency: "SGD" },
    principalId: "principal-1",
    ...overrides,
  };
}
