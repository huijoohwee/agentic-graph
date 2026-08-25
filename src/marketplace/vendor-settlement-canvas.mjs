import { createPendingQueue } from "../registry/pending-queue.mjs";
import { OPERATOR_SCOPE, vendorSettlementCanvasOperatorKey } from "../registry/scope-keys.mjs";

export function projectVendorSettlementCanvas(vendors, payoutPositions, options = {}) {
  const key = vendorSettlementCanvasOperatorKey(options.subscriptionScope ?? OPERATOR_SCOPE);
  if (!key.ok) return key;
  const payoutsByVendor = new Map(payoutPositions.map(position => [position.vendorId, position]));
  const rows = vendors.map(vendor => {
    const payout = payoutsByVendor.get(vendor.vendorId) ?? null;
    return {
      key: `vendor:${vendor.vendorId}`,
      type: "vendor-settlement-position",
      value: {
        vendorId: vendor.vendorId,
        lifecycleState: vendor.lifecycleState,
        commissionRuleRevision: vendor.commissionRuleRevision,
        outstandingPayoutPosition: payout?.state ?? "none",
      },
      contentHash: [vendor.contentHash, payout?.contentHash ?? "none"].sort().join(":"),
    };
  }).sort((left, right) => left.key.localeCompare(right.key));
  const pendingQueue = options.pendingQueue ?? createPendingQueue(options.clientId ?? "vendor-settlement-operator");
  if (options.offlineChange) pendingQueue.append(options.offlineChange, options.recordedAt);
  return { ok: true, key: key.value, revision: options.revision ?? 1, rows, pendingQueue };
}

export function renderVendorSettlementCanvas(projection, options = {}) {
  if (!projection.ok) return projection;
  return {
    ok: true,
    element: "section",
    ariaLabel: "Vendor settlement positions",
    widthCssPx: options.widthCssPx ?? 360,
    hasHorizontalOverflow: false,
    rows: projection.rows.map(row => ({
      element: "article",
      key: row.key,
      type: row.type,
      fields: Object.entries(row.value).map(([key, value]) => ({
        element: "dl",
        key,
        value: String(value),
      })),
      contentHash: row.contentHash,
    })),
  };
}

export function mergeVendorSettlementStates(left, right) {
  if (!left.ok || !right.ok) return left.ok ? right : left;
  const rows = new Map();
  for (const row of [...left.rows, ...right.rows]) {
    const current = rows.get(row.key);
    if (!current || compareRows(row, current) >= 0) rows.set(row.key, row);
  }
  return {
    ...left,
    revision: Math.max(left.revision, right.revision),
    rows: [...rows.values()].sort((first, second) => first.key.localeCompare(second.key)),
  };
}

function compareRows(left, right) {
  return `${left.contentHash}:${JSON.stringify(left.value)}`.localeCompare(
    `${right.contentHash}:${JSON.stringify(right.value)}`,
  );
}
