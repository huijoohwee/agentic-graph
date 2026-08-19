import { createHash } from "node:crypto";

import { normalizeCategoryLabel } from "./scope-keys.mjs";

export const TRUST_STATUS = "declared-and-present";
export const REQUIRED_AGENT_DEFINITION_FIELDS = [
  "agentId",
  "declaredCategory",
  "declaredToolAllowlist",
  "trustStatus",
  "schemaRevision",
  "contentHash",
];

export async function validateAgentDefinition(submitted, options = {}) {
  const schemaResult = await retrieveSchema(options.schemaProvider, options.deadlineMs ?? 5_000);
  if (!schemaResult.ok) {
    return reject([{ fieldId: "schema", reason: "schema-unavailable" }]);
  }

  const violations = collectDefinitionViolations(submitted, schemaResult.schema);
  if (violations.length > 0) {
    return reject(violations);
  }

  const contentHash = submitted.contentHash || hashDefinition(submitted);
  return {
    status: "pass",
    passResultId: `validation-pass:${contentHash}`,
    contentHash,
    schemaRevision: submitted.schemaRevision,
  };
}

export function collectDefinitionViolations(submitted, schema = {}) {
  if (!isRecord(submitted)) {
    return REQUIRED_AGENT_DEFINITION_FIELDS.map((fieldId) => ({ fieldId, reason: "missing" }));
  }

  const violations = [];
  for (const fieldId of REQUIRED_AGENT_DEFINITION_FIELDS) {
    if (!(fieldId in submitted)) {
      violations.push({ fieldId, reason: "missing" });
    }
  }

  if ("agentId" in submitted && !isNonEmptyString(submitted.agentId)) {
    violations.push({ fieldId: "agentId", reason: "invalid" });
  }

  if ("declaredCategory" in submitted && !normalizeCategoryLabel(submitted.declaredCategory).ok) {
    violations.push({ fieldId: "declaredCategory", reason: "invalid" });
  }

  if ("declaredToolAllowlist" in submitted && !isStringArray(submitted.declaredToolAllowlist)) {
    violations.push({ fieldId: "declaredToolAllowlist", reason: "invalid" });
  }

  if ("trustStatus" in submitted && submitted.trustStatus !== TRUST_STATUS) {
    violations.push({ fieldId: "trustStatus", reason: "not-allowed" });
  }

  if ("schemaRevision" in submitted && !isNonEmptyString(submitted.schemaRevision)) {
    violations.push({ fieldId: "schemaRevision", reason: "invalid" });
  }

  if ("contentHash" in submitted && !isNonEmptyString(submitted.contentHash)) {
    violations.push({ fieldId: "contentHash", reason: "invalid" });
  }

  const allowedTools = schema.allowedTools;
  if (Array.isArray(allowedTools) && Array.isArray(submitted.declaredToolAllowlist)) {
    for (const tool of submitted.declaredToolAllowlist) {
      if (!allowedTools.includes(tool)) {
        violations.push({ fieldId: "declaredToolAllowlist", reason: "not-allowed" });
      }
    }
  }

  return violations;
}

export function hashDefinition(definition) {
  return createHash("sha256").update(JSON.stringify(definition, Object.keys(definition).sort())).digest("hex");
}

async function retrieveSchema(schemaProvider, deadlineMs) {
  if (typeof schemaProvider !== "function") {
    return { ok: true, schema: {} };
  }

  try {
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ ok: false }), deadlineMs));
    const retrieval = Promise.resolve(schemaProvider()).then((schema) => ({ ok: true, schema }));
    const result = await Promise.race([retrieval, timeout]);
    if (!result.ok || !isRecord(result.schema)) {
      return { ok: false };
    }
    return result;
  } catch {
    return { ok: false };
  }
}

function reject(violations) {
  return { status: "reject", violations };
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every(isNonEmptyString);
}
