export const VENDOR_REQUIRED_FIELDS = Object.freeze([
  "vendorId",
  "displayName",
  "commissionRuleId",
  "commissionRuleRevision",
  "settlementCurrency",
]);

export function collectVendorViolations(candidate) {
  if (!isRecord(candidate)) {
    return VENDOR_REQUIRED_FIELDS.map(fieldId => ({ fieldId, reason: "missing" }));
  }
  const violations = [];
  for (const fieldId of VENDOR_REQUIRED_FIELDS) {
    if (typeof candidate[fieldId] !== "string" || candidate[fieldId].trim().length === 0) {
      violations.push({ fieldId, reason: fieldId in candidate ? "invalid" : "missing" });
    }
  }
  if (typeof candidate.settlementCurrency === "string" && !/^[A-Z]{3,8}$/u.test(candidate.settlementCurrency)) {
    violations.push({ fieldId: "settlementCurrency", reason: "invalid" });
  }
  return violations;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
