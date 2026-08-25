import { collectCommissionRuleViolations } from "./commission-rule-schema.mjs";

const BASIS_POINT_DENOMINATOR = 10_000n;

// Independently derived integer commission pattern; no external evaluator is reused.
export function evaluateCommission({ grossMinor, rule, currency }) {
  if (!Number.isSafeInteger(grossMinor) || grossMinor <= 0) {
    return { ok: false, reason: "invalid-gross-minor" };
  }
  if (typeof currency !== "string" || currency.length === 0) {
    return { ok: false, reason: "invalid-currency" };
  }
  if (!rule) return { ok: false, reason: "unresolvable-rule" };
  const violations = collectCommissionRuleViolations(rule);
  if (violations.length > 0) {
    return {
      ok: false,
      reason: violations.some(({ reason }) => reason === "rate-out-of-range")
        ? "rate-out-of-range"
        : "malformed-rule",
      violations,
    };
  }
  const basisPoints = rule.kind === "flat"
    ? rule.bps
    : rule.tiers.find(({ upToMinor }) => upToMinor === null || grossMinor <= upToMinor)?.bps;
  if (!Number.isInteger(basisPoints)) return { ok: false, reason: "malformed-rule" };
  const commissionMinor = Number((BigInt(grossMinor) * BigInt(basisPoints)) / BASIS_POINT_DENOMINATOR);
  const netMinor = grossMinor - commissionMinor;
  return {
    ok: true,
    commissionMinor,
    netMinor,
    ruleRevision: rule.revision,
  };
}
