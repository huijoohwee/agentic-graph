import { commissionRuleKey, vendorKey } from "../registry/scope-keys.mjs";
import { decideVendorTransition } from "./vendor-lifecycle-state.mjs";
import { hashVendorRecord } from "./vendor-records.mjs";
import { collectVendorViolations } from "./vendor-schema.mjs";

export class VendorRegistry {
  constructor({ commissionRuleLookup, clock = () => new Date().toISOString() } = {}) {
    this.commissionRuleLookup = commissionRuleLookup ?? (() => null);
    this.clock = clock;
    this.vendors = new Map();
  }

  register(candidate) {
    const violations = collectVendorViolations(candidate);
    const rule = violations.length === 0
      ? this.commissionRuleLookup(commissionRuleKey(candidate.commissionRuleId, candidate.commissionRuleRevision))
      : null;
    if (violations.length === 0 && !rule) {
      violations.push({ fieldId: "commissionRuleRevision", reason: "commission-rule-unresolvable" });
    }
    if (violations.length > 0) return { status: "reject", violations };
    const timestamp = this.clock();
    const recordWithoutHash = {
      vendorId: candidate.vendorId,
      displayName: candidate.displayName,
      lifecycleState: "pending_review",
      commissionRuleId: candidate.commissionRuleId,
      commissionRuleRevision: candidate.commissionRuleRevision,
      settlementCurrency: candidate.settlementCurrency,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const record = Object.freeze({ ...recordWithoutHash, contentHash: hashVendorRecord(recordWithoutHash) });
    this.vendors.set(vendorKey(record.vendorId), record);
    return { status: "registered", vendorId: record.vendorId, contentHash: record.contentHash };
  }

  transition(vendorId, requestedTransition, actor) {
    if (typeof actor !== "string" || actor.length === 0) {
      return { status: "reject", reason: "operator-reference-required" };
    }
    const key = vendorKey(vendorId);
    const current = this.vendors.get(key);
    if (!current) return { status: "reject", reason: "vendor-not-found" };
    const decision = decideVendorTransition(current.lifecycleState, requestedTransition);
    if (!decision.ok) return { status: "reject", reason: decision.reason };
    const updatedAt = this.clock();
    const nextWithoutHash = {
      ...current,
      lifecycleState: decision.nextState,
      updatedAt,
      lastTransitionActor: actor,
    };
    const next = Object.freeze({ ...nextWithoutHash, contentHash: hashVendorRecord(nextWithoutHash) });
    this.vendors.set(key, next);
    return { status: "transitioned", from: current.lifecycleState, to: next.lifecycleState };
  }

  dispatchVerdict(vendorId) {
    const vendor = this.get(vendorId);
    if (!vendor) return { allowed: false, reason: "vendor-not-found" };
    if (vendor.lifecycleState === "active") return { allowed: true };
    return { allowed: false, reason: `vendor-${vendor.lifecycleState.replaceAll("_", "-")}` };
  }

  get(vendorId) {
    const value = this.vendors.get(vendorKey(vendorId));
    return value ? { ...value } : null;
  }

  list() {
    return [...this.vendors.values()].map(value => ({ ...value })).sort((left, right) => left.vendorId.localeCompare(right.vendorId));
  }
}

export function createVendorRegistry(options) {
  return new VendorRegistry(options);
}
