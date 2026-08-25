const BASIS_POINT_MAX = 10_000;
const RULE_KINDS = new Set(["flat", "tiered"]);

export function collectCommissionRuleViolations(rule) {
  if (!isRecord(rule)) return [{ fieldId: "rule", reason: "invalid" }];
  const violations = [];
  requireString(rule, "commissionRuleId", violations);
  requireString(rule, "revision", violations);
  if (!RULE_KINDS.has(rule.kind)) violations.push({ fieldId: "kind", reason: "invalid" });
  if (rule.kind === "flat") validateBasisPoints(rule.bps, "bps", violations);
  if (rule.kind === "tiered") validateTiers(rule.tiers, violations);
  return violations;
}

function validateTiers(tiers, violations) {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    violations.push({ fieldId: "tiers", reason: "invalid" });
    return;
  }
  let priorBoundary = 0;
  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index];
    if (!isRecord(tier)) {
      violations.push({ fieldId: `tiers.${index}`, reason: "invalid" });
      continue;
    }
    validateBasisPoints(tier.bps, `tiers.${index}.bps`, violations);
    const finalTier = index === tiers.length - 1;
    if (finalTier && tier.upToMinor !== null) {
      violations.push({ fieldId: `tiers.${index}.upToMinor`, reason: "open-ended-final-tier-required" });
    } else if (!finalTier && (!Number.isSafeInteger(tier.upToMinor) || tier.upToMinor <= priorBoundary)) {
      violations.push({ fieldId: `tiers.${index}.upToMinor`, reason: "ascending-inclusive-boundary-required" });
    } else if (!finalTier) {
      priorBoundary = tier.upToMinor;
    }
  }
}

function validateBasisPoints(value, fieldId, violations) {
  if (!Number.isInteger(value) || value < 0 || value > BASIS_POINT_MAX) {
    violations.push({ fieldId, reason: "rate-out-of-range" });
  }
}

function requireString(value, fieldId, violations) {
  if (typeof value[fieldId] !== "string" || value[fieldId].length === 0) {
    violations.push({ fieldId, reason: "missing" });
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
