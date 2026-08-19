import { LIMITS, reject, assertMinorUnits } from "./contracts.mjs";

/** Flat, single-bundle adjacency store.  Its synchronous API mirrors a DO's per-key serial execution. */
export class BundleGraphStore {
  #legs = new Map(); #edges = new Map(); #snapshots = new Map(); #nextSnapshot = 1;
  constructor(bundleId) { this.bundleId = bundleId; this.limits = LIMITS; }
  insertLeg(leg) {
    if (this.#legs.size >= LIMITS.maxLegs) return reject("scale-boundary-legs", { observedCount: this.#legs.size });
    if (this.#legs.has(leg.legId)) return reject("duplicate-leg", { observedCount: this.#legs.size });
    if ([...this.#legs.values()].some(existing => existing.principalId !== leg.principalId)) return reject("cross-principal-bundle", { observedCount: this.#legs.size });
    this.#legs.set(leg.legId, Object.freeze({ ...leg, committedOfferId: leg.committedOfferId ?? null, committedAmount: leg.committedAmount ?? null }));
    return { kind: "ok" };
  }
  insertEdge({ fromLegId, toLegId }) {
    if (this.#edges.size >= LIMITS.maxEdges) return reject("scale-boundary-edges", { observedCount: this.#edges.size });
    if (!this.#legs.has(fromLegId) || !this.#legs.has(toLegId)) return reject("unknown-leg", { observedCount: this.#edges.size });
    if (this.#wouldCycle(fromLegId, toLegId)) return reject("cyclic-dependency", { observedCount: this.#edges.size });
    const outgoing = this.#edges.get(fromLegId) ?? new Set(); outgoing.add(toLegId); this.#edges.set(fromLegId, outgoing);
    return { kind: "ok" };
  }
  isPresent(legId) { return this.#legs.has(legId); }
  affectedSet(changedLegId) {
    if (!this.isPresent(changedLegId)) return reject("unknown-leg");
    const seen = new Set([changedLegId]), order = [], queue = [changedLegId];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const source = queue[cursor];
      for (const target of this.#edges.get(source) ?? []) {
        if (target === changedLegId) return reject("cyclic-dependency");
        if (!seen.has(target)) { seen.add(target); order.push(target); queue.push(target); }
      }
    }
    return { kind: "ok", order };
  }
  snapshot() {
    const snapshotId = `snapshot-${this.#nextSnapshot++}`;
    this.#snapshots.set(snapshotId, this.exportState());
    return snapshotId;
  }
  commitAffectedSet(cascadeId, commits, expectedAffected) {
    const expected = new Set(expectedAffected);
    if (expected.size !== commits.length || commits.some(commit => !expected.has(commit.legId) || !this.#legs.has(commit.legId))) return reject("requote-malformed");
    const snapshotId = this.snapshot();
    const staged = commits.map(commit => ({ ...commit, amount: assertMinorUnits(commit.amount) }));
    for (const commit of staged) {
      const old = this.#legs.get(commit.legId);
      this.#legs.set(commit.legId, Object.freeze({ ...old, committedOfferId: commit.offerId, committedAmount: commit.amount, lastCascadeId: cascadeId }));
    }
    return { kind: "committed", snapshotId };
  }
  restore(snapshotId) {
    const state = this.#snapshots.get(snapshotId); if (!state) return reject("unknown-snapshot");
    this.#restore(state); return { kind: "restored", snapshotId };
  }
  legs() { return [...this.#legs.values()].map(leg => ({ ...leg })); }
  exportState() { return JSON.stringify({ legs: this.legs(), edges: [...this.#edges].map(([from, targets]) => [from, [...targets]]) }); }
  #restore(serialized) { const state = JSON.parse(serialized); this.#legs = new Map(state.legs.map(leg => [leg.legId, Object.freeze(leg)])); this.#edges = new Map(state.edges.map(([from, targets]) => [from, new Set(targets)])); }
  #wouldCycle(from, to) { if (from === to) return true; const queue = [to], seen = new Set(queue); for (let i = 0; i < queue.length; i += 1) for (const next of this.#edges.get(queue[i]) ?? []) { if (next === from) return true; if (!seen.has(next)) { seen.add(next); queue.push(next); } } return false; }
}
