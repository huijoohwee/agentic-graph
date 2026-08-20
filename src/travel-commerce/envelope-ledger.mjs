import { assertMinorUnits, reject } from "./contracts.mjs";

/** One ledger instance represents one principal and therefore has no cross-principal mutable state. */
export class EnvelopeLedger {
  #holds = new Map(); #next = 1;
  constructor(principalId, totalBudget, { invalidate = () => {} } = {}) { this.principalId = principalId; this.totalBudget = assertMinorUnits(totalBudget); this.invalidate = invalidate; }
  availableBalance() { return this.totalBudget - [...this.#holds.values()].filter(hold => hold.state !== "released").reduce((sum, hold) => sum + hold.amount, 0); }
  checkAndReserve({ offerId, amount, cascadeId = null }) { amount = assertMinorUnits(amount); const availableAtCheck = this.availableBalance(); if (amount > availableAtCheck) return reject("insufficient-envelope", { availableAtCheck }); const hold = Object.freeze({ holdId: `hold-${this.#next++}`, principalId: this.principalId, offerId, amount, cascadeId, state: "reserved" }); this.#holds.set(hold.holdId, hold); this.#assertConservation(); return { kind: "reserved", hold, availableAfter: this.availableBalance() }; }
  commitHold(holdId) { return this.#transition(holdId, "committed"); }
  releaseHold(holdId) { return this.#transition(holdId, "released"); }
  releaseCascade(cascadeId) { let count = 0; for (const hold of this.#holds.values()) if (hold.cascadeId === cascadeId && hold.state === "reserved") { this.#transition(hold.holdId, "released"); count += 1; } return { kind: "released", count }; }
  holds() { return [...this.#holds.values()].map(hold => ({ ...hold })); }
  #transition(holdId, target) { const hold = this.#holds.get(holdId); if (!hold || (hold.state !== "reserved" && hold.state !== target)) return reject("illegal-transition"); if (hold.state === target) return { kind: "noop", hold }; const next = Object.freeze({ ...hold, state: target }); this.#holds.set(holdId, next); this.invalidate(this.principalId); this.#assertConservation(); return { kind: target === "released" ? "released" : "committed", hold: next }; }
  #assertConservation() { const active = this.#holds.values().reduce((sum, hold) => sum + (hold.state === "released" ? 0 : hold.amount), 0); if (this.totalBudget !== this.availableBalance() + active) throw new Error("envelope conservation violated"); }
}
