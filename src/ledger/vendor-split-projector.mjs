import { allocateMinorUnits } from "../commission/minor-unit-allocation.mjs";
import { createVendorSplitRow } from "./vendor-split-records.mjs";

export function projectVendorSplits({
  bundleId,
  legBreakdown,
  settledTotalMinor,
  currency,
  vendorLookup,
  evaluate,
}) {
  const inputViolation = validateInput({ bundleId, legBreakdown, settledTotalMinor, currency, vendorLookup, evaluate });
  if (inputViolation) return reject(inputViolation);
  const groups = groupLegs(legBreakdown);
  const allocation = allocateMinorUnits({
    totalMinor: settledTotalMinor,
    weights: groups.map(group => ({ id: group.vendorId, weight: group.weight })),
  });
  if (!allocation.ok) return reject(allocation.reason);
  const grossByVendor = new Map(allocation.shares.map(({ id, amountMinor }) => [id, amountMinor]));
  const splits = [];
  for (const group of groups) {
    const vendor = vendorLookup(group.vendorId);
    if (!vendor) return reject("vendor-unresolvable", { vendorId: group.vendorId });
    if (vendor.settlementCurrency !== currency || !vendor.commissionRule) {
      return reject("vendor-unresolvable", { vendorId: group.vendorId });
    }
    const grossAmountMinor = grossByVendor.get(group.vendorId);
    const commission = evaluate({ grossMinor: grossAmountMinor, rule: vendor.commissionRule, currency });
    if (!commission.ok) return reject("commission-rejected", { vendorId: group.vendorId, reason: commission.reason });
    splits.push(createVendorSplitRow({
      bundleId,
      vendor,
      coveredLegIds: group.legIds,
      grossAmountMinor,
      commissionAmountMinor: commission.commissionMinor,
      netPayoutAmountMinor: commission.netMinor,
    }));
  }
  const violation = splitInvariantViolation({ splits, legBreakdown, settledTotalMinor, currency });
  if (violation) return reject("split-invariant-violated", { violated: violation });
  return {
    ok: true,
    splits: Object.freeze(splits),
    event: Object.freeze({ eventType: "split-committed", bundleId, splitCount: splits.length }),
  };
}

function validateInput({ bundleId, legBreakdown, settledTotalMinor, currency, vendorLookup, evaluate }) {
  if (typeof bundleId !== "string" || bundleId.length === 0) return "invalid-bundle-id";
  if (!Number.isSafeInteger(settledTotalMinor) || settledTotalMinor <= 0) return "invalid-settled-total";
  if (typeof currency !== "string" || currency.length === 0) return "invalid-currency";
  if (typeof vendorLookup !== "function" || typeof evaluate !== "function") return "invalid-projector-dependency";
  if (!Array.isArray(legBreakdown) || legBreakdown.length === 0) return "invalid-leg-breakdown";
  const legIds = new Set();
  for (const leg of legBreakdown) {
    if (!leg || typeof leg.legId !== "string" || leg.legId.length === 0
      || typeof leg.vendorId !== "string" || leg.vendorId.length === 0
      || !Number.isSafeInteger(leg.amountMinor) || leg.amountMinor <= 0) return "invalid-leg-breakdown";
    if (legIds.has(leg.legId)) return "duplicate-leg";
    legIds.add(leg.legId);
  }
  return null;
}

function groupLegs(legBreakdown) {
  const grouped = new Map();
  for (const leg of legBreakdown) {
    const group = grouped.get(leg.vendorId) ?? { vendorId: leg.vendorId, legIds: [], weight: 0 };
    group.legIds.push(leg.legId);
    group.weight += leg.amountMinor;
    grouped.set(leg.vendorId, group);
  }
  return [...grouped.values()].map(group => ({
    ...group,
    legIds: group.legIds.sort((left, right) => left.localeCompare(right)),
  })).sort((left, right) => left.vendorId.localeCompare(right.vendorId));
}

function splitInvariantViolation({ splits, legBreakdown, settledTotalMinor, currency }) {
  if (splits.reduce((sum, split) => sum + split.grossAmountMinor, 0) !== settledTotalMinor) return "gross-conservation";
  if (new Set(splits.map(split => `${split.bundleId}:${split.vendorId}`)).size !== splits.length) return "vendor-row-uniqueness";
  const expectedLegIds = legBreakdown.map(({ legId }) => legId).sort();
  const coveredLegIds = splits.flatMap(({ coveredLegIds: ids }) => ids).sort();
  if (JSON.stringify(expectedLegIds) !== JSON.stringify(coveredLegIds)) return "leg-partition";
  for (const split of splits) {
    const amounts = [split.grossAmountMinor, split.commissionAmountMinor, split.netPayoutAmountMinor];
    if (!amounts.every(value => Number.isSafeInteger(value) && value >= 0)) return "integer-amounts";
    if (split.settlementCurrency !== currency) return "currency-consistency";
    if (split.grossAmountMinor !== split.commissionAmountMinor + split.netPayoutAmountMinor) return "commission-decomposition";
  }
  return null;
}

function reject(reason, details = {}) {
  return { ok: false, reason, ...details };
}
