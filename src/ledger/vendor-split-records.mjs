export function createVendorSplitRow({
  bundleId,
  vendor,
  coveredLegIds,
  grossAmountMinor,
  commissionAmountMinor,
  netPayoutAmountMinor,
}) {
  const sortedLegIds = [...coveredLegIds].sort((left, right) => left.localeCompare(right));
  return Object.freeze({
    splitId: `split:${bundleId}:${vendor.vendorId}`,
    bundleId,
    vendorId: vendor.vendorId,
    coveredLegIds: Object.freeze(sortedLegIds),
    settlementCurrency: vendor.settlementCurrency,
    grossAmountMinor,
    commissionAmountMinor,
    netPayoutAmountMinor,
    commissionRuleId: vendor.commissionRuleId,
    commissionRuleRevision: vendor.commissionRuleRevision,
  });
}

export function serializeVendorSplitRows(rows) {
  return JSON.stringify(rows.map(row => ({
    splitId: row.splitId,
    bundleId: row.bundleId,
    vendorId: row.vendorId,
    coveredLegIds: [...row.coveredLegIds].sort((left, right) => left.localeCompare(right)),
    settlementCurrency: row.settlementCurrency,
    grossAmountMinor: row.grossAmountMinor,
    commissionAmountMinor: row.commissionAmountMinor,
    netPayoutAmountMinor: row.netPayoutAmountMinor,
    commissionRuleId: row.commissionRuleId,
    commissionRuleRevision: row.commissionRuleRevision,
  })).sort((left, right) => left.vendorId.localeCompare(right.vendorId)));
}
