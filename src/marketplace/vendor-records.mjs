import { createHash } from "node:crypto";

export function hashVendorRecord(vendor) {
  return createHash("sha256").update(canonicalJson(vendor)).digest("hex");
}

export function vendorToRow(vendor) {
  return {
    vendor_id: vendor.vendorId,
    display_name: vendor.displayName,
    lifecycle_state: vendor.lifecycleState,
    commission_rule_id: vendor.commissionRuleId,
    commission_rule_revision: vendor.commissionRuleRevision,
    settlement_currency: vendor.settlementCurrency,
    content_hash: vendor.contentHash,
    created_at: vendor.createdAt,
    updated_at: vendor.updatedAt,
  };
}

export function rowToVendor(row) {
  return {
    vendorId: row.vendor_id,
    displayName: row.display_name,
    lifecycleState: row.lifecycle_state,
    commissionRuleId: row.commission_rule_id,
    commissionRuleRevision: row.commission_rule_revision,
    settlementCurrency: row.settlement_currency,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
