export const OPERATOR_SCOPE = "Operator_Scope";

const MAX_CATEGORY_LENGTH = 64;

export function normalizeCategoryLabel(category) {
  if (typeof category !== "string") {
    return { ok: false, reason: "invalid-category" };
  }
  const normalized = category.trim().toLocaleLowerCase();
  if (normalized.length === 0 || normalized.length > MAX_CATEGORY_LENGTH) {
    return { ok: false, reason: "invalid-category" };
  }
  return { ok: true, value: normalized };
}

export function agentDefinitionKey(agentId) {
  assertNonEmptyString(agentId, "agentId");
  return `agent_definition:${agentId}`;
}

export function routingEntryKey(category) {
  const normalized = normalizeCategoryLabel(category);
  if (!normalized.ok) {
    return normalized;
  }
  return { ok: true, value: `routing_entry:${normalized.value}`, normalizedCategory: normalized.value };
}

export function registryCanvasOperatorKey(subscriptionScope) {
  if (subscriptionScope !== OPERATOR_SCOPE) {
    return { ok: false, reason: "operator-scope-required" };
  }
  return { ok: true, value: "registry_canvas:operator" };
}

export function vendorKey(vendorId) {
  assertNonEmptyString(vendorId, "vendorId");
  return `vendor:${vendorId}`;
}

export function commissionRuleKey(commissionRuleId, revision) {
  assertNonEmptyString(commissionRuleId, "commissionRuleId");
  assertNonEmptyString(revision, "revision");
  return `commission_rule:${commissionRuleId}:${revision}`;
}

export function vendorSplitKey(bundleId, vendorId) {
  assertNonEmptyString(bundleId, "bundleId");
  assertNonEmptyString(vendorId, "vendorId");
  return `vendor_split:${bundleId}:${vendorId}`;
}

export function payoutKey(splitId) {
  assertNonEmptyString(splitId, "splitId");
  return `payout:${splitId}`;
}

export function vendorSettlementCanvasOperatorKey(subscriptionScope) {
  if (subscriptionScope !== OPERATOR_SCOPE) {
    return { ok: false, reason: "operator-scope-required" };
  }
  return { ok: true, value: "vendor_settlement_canvas:operator" };
}

export function registryPendingKey(clientId) {
  assertNonEmptyString(clientId, "clientId");
  return `registry_pending:${clientId}`;
}

export function sessionLogKey(sessionId) {
  assertNonEmptyString(sessionId, "sessionId");
  return `session_log:${sessionId}`;
}

function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}
