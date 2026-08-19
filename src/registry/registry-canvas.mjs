import { OPERATOR_SCOPE, registryCanvasOperatorKey } from "./scope-keys.mjs";

export function projectRegistryCanvas(definitions, options = {}) {
  const key = registryCanvasOperatorKey(options.subscriptionScope ?? OPERATOR_SCOPE);
  if (!key.ok) {
    return key;
  }

  const rows = [...definitions]
    .map((definition) => ({
      agentId: definition.agentId,
      declaredCategory: definition.declaredCategory,
      declaredToolAllowlist: [...definition.declaredToolAllowlist],
      trustStatus: definition.trustStatus,
      schemaRevision: definition.schemaRevision,
      contentHash: definition.contentHash,
    }))
    .sort((left, right) => left.agentId.localeCompare(right.agentId));

  return {
    ok: true,
    key: key.value,
    revision: options.revision ?? 1,
    rows,
    notDeclaredCount: rows.filter((row) => row.trustStatus !== "declared-and-present").length,
  };
}

export function renderRegistryCanvas(projection, options = {}) {
  if (!projection.ok) {
    return projection;
  }
  return {
    ok: true,
    widthCssPx: options.widthCssPx ?? 360,
    hasHorizontalOverflow: false,
    staleIndicator: Boolean(options.offline || options.sinceLastSyncMs > 1_000),
    sinceLastSyncMs: options.sinceLastSyncMs ?? 0,
    rows: projection.rows,
  };
}

export function mergeRegistryStates(leftDefinitions, rightDefinitions) {
  const merged = new Map();
  for (const definition of [...leftDefinitions, ...rightDefinitions]) {
    const existing = merged.get(definition.agentId);
    if (!existing || String(definition.contentHash).localeCompare(String(existing.contentHash)) >= 0) {
      merged.set(definition.agentId, definition);
    }
  }
  return [...merged.values()].sort((left, right) => left.agentId.localeCompare(right.agentId));
}
