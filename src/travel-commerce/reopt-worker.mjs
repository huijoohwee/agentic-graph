import { cascadeKey, reject } from "./contracts.mjs";

export class ReoptWorker {
  #outcomes = new Map();
  constructor({ store, ledger, quote, settle = async () => {}, archive = async () => {}, log = () => {}, costLog = null, wallClockMs = 10_000 }) { Object.assign(this, { store, ledger, quote, settle, archive, log, costLog, wallClockMs }); }
  async handleMutation(event) {
    const key = cascadeKey(event); if (this.#outcomes.has(key)) return this.#outcomes.get(key);
    const started = Date.now(), cascadeId = `cascade-${event.eventId}`;
    const affected = this.store.affectedSet(event.legId);
    if (affected.kind === "rejected") return this.#record(key, reject(affected.reason, { cascadeId }));
    if (affected.order.length === 0) return this.#record(key, { kind: "no-op", cascadeId, reason: "no-outgoing-edges", affected: [] });
    const snapshotId = this.store.snapshot();
    let reservations = [];
    try {
      const quoted = await Promise.all(affected.order.map(async legId => ({ legId, result: await this.#withTimeout(this.quote(legId, event), started) })));
      const bad = quoted.find(({ result }) => !result || result.kind !== "offer"); if (bad) throw new Error(bad?.result?.reason ?? "requote-rejected");
      const old = new Map(this.store.legs().map(leg => [leg.legId, leg]));
      for (const { result } of quoted) { const reserved = this.ledger.checkAndReserve({ offerId: result.offerId, amount: result.amount, cascadeId }); if (reserved.kind !== "reserved") throw new Error(reserved.reason); reservations.push(reserved.hold); }
      const commits = quoted.map(({ legId, result }) => ({ legId, offerId: result.offerId, amount: result.amount }));
      const commit = this.store.commitAffectedSet(cascadeId, commits, affected.order); if (commit.kind !== "committed") throw new Error(commit.reason);
      const netAmount = commits.reduce((sum, commit) => sum + commit.amount - (old.get(commit.legId).committedAmount ?? 0), 0);
      let settlementCalls = 0; if (netAmount !== 0) { await this.settle({ cascadeId, amount: netAmount, caller: "Issuance_Service" }); settlementCalls = 1; }
      for (const hold of reservations) this.ledger.commitHold(hold.holdId);
      const outcome = { kind: "committed", cascadeId, affected: affected.order, snapshotId: commit.snapshotId, netAmount, settlementCalls, archiveDeferred: false };
      try { await this.archive({ bundleId: event.bundleId, cascadeId, snapshot: this.store.exportState(), outcome }); } catch { outcome.archiveDeferred = true; }
      return this.#record(key, outcome);
    } catch (error) {
      this.store.restore(snapshotId); this.ledger.releaseCascade(cascadeId);
      const reason = String(error.message || error); return this.#record(key, { kind: "rolled-back", cascadeId, affected: affected.order, reason, restoredSnapshotId: snapshotId, settlementCalls: 0 });
    }
  }
  async #withTimeout(promise, started) {
    const remaining = this.wallClockMs - (Date.now() - started);
    if (remaining <= 0) throw new Error("cascade-timeout");
    let timer;
    const timeout = new Promise((_, rejectPromise) => { timer = setTimeout(() => rejectPromise(new Error("cascade-timeout")), remaining); });
    try { return await Promise.race([promise, timeout]); } finally { clearTimeout(timer); }
  }
  #record(key, outcome) { this.#outcomes.set(key, outcome); this.costLog?.record(outcome.cascadeId, outcome); this.log({ outcome, at: new Date().toISOString(), materialityThreshold: null, rollbackNotification: "not-configured" }); return outcome; }
}
