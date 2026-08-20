import { reject } from "./contracts.mjs";

export class CostLog {
  #entries = [];
  record(cascadeId, outcome) {
    const entry = Object.freeze({ cascadeId, outcome: outcome.kind, promptTokens: 0, completionTokens: 0, dollarCost: 0, recordedAt: new Date().toISOString() });
    this.#entries.push(entry); return entry;
  }
  entries() { return [...this.#entries]; }
}

/** Makes aggregate-only D1 use explicit; the graph and ledger have no D1 dependency. */
export function assertStoragePlacement({ caller, purpose }) {
  if (["bundle-graph-store", "envelope-ledger", "reopt-worker"].includes(caller)) return reject("storage-placement", { caller });
  if (purpose !== "aggregate-reporting") return reject("storage-placement", { caller });
  return { kind: "ok" };
}
