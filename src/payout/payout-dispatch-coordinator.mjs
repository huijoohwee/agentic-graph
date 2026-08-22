import { MAX_RETRY_ATTEMPTS, MAX_RETRY_INTERVAL_MS } from "../registry/pending-queue.mjs";
import { payoutKey } from "../registry/scope-keys.mjs";
import { decidePayoutTransition, isTerminalPayoutState } from "./payout-state.mjs";

export class PayoutDispatchCoordinator {
  constructor({ sessionLog, vendorRegistry, railPort, clock = () => Date.now() }) {
    this.sessionLog = sessionLog;
    this.vendorRegistry = vendorRegistry;
    this.railPort = railPort;
    this.clock = clock;
    this.records = new Map();
  }

  async attempt(split) {
    const key = payoutKey(split.splitId);
    const prior = this.records.get(key);
    if (prior?.state === "settled" || prior?.state === "failed") return clone(prior);
    const entries = this.sessionLog.readOrdered(split.sessionId);
    const verified = entries.find(entry => (
      entry.eventType === "settlement-verified"
      && entry.bundleId === split.bundleId
      && entry.splitId === split.splitId
    ));
    if (!verified) return this.block(split, prior, "settlement-verification-absent");
    const vendorVerdict = this.vendorRegistry.dispatchVerdict(split.vendorId);
    if (!vendorVerdict.allowed) return this.block(split, prior, vendorVerdict.reason);
    const now = this.clock();
    if (prior?.nextAttemptAt && now < prior.nextAttemptAt) return clone(prior);
    if ((prior?.attemptCount ?? 0) >= MAX_RETRY_ATTEMPTS) {
      return this.fail(split, prior, "retry-bound-exhausted", prior?.lastResult ?? null);
    }
    const dispatched = this.transition(split, prior, "dispatch", {
      attemptCount: (prior?.attemptCount ?? 0) + 1,
      idempotencyKey: `marketplace-payout:${split.splitId}`,
      lastAttemptAt: now,
      nextAttemptAt: null,
    });
    this.appendEvent(split, "payout-dispatched", dispatched);
    const result = await this.railPort.dispatch({
      splitId: split.splitId,
      bundleId: split.bundleId,
      netMinor: split.netPayoutAmountMinor,
      currency: split.settlementCurrency,
      vendorRef: split.vendorId,
      idempotencyKey: dispatched.idempotencyKey,
    });
    if (result.ok) {
      const settled = this.transition(split, dispatched, "settle", {
        settlementReference: result.settlementRef,
        terminalReason: null,
        terminalAt: this.clock(),
        lastResult: result,
      });
      this.appendEvent(split, "payout-settled", settled);
      return clone(settled);
    }
    const fingerprint = JSON.stringify(result);
    if (prior?.lastResultFingerprint === fingerprint) {
      return this.fail(split, dispatched, "unchanged-result-circuit-breaker", result);
    }
    if (!result.retryable) return this.fail(split, dispatched, result.reason, result);
    const retry = { ...dispatched, state: "pending", lastResult: result, lastResultFingerprint: fingerprint,
      nextAttemptAt: this.clock() + MAX_RETRY_INTERVAL_MS };
    this.records.set(key, retry);
    return clone(retry);
  }

  get(splitId) {
    const value = this.records.get(payoutKey(splitId));
    return value ? clone(value) : null;
  }

  all() {
    return [...this.records.values()].map(clone);
  }

  block(split, prior, reason) {
    if (prior?.state === "blocked") {
      const record = { ...prior, terminalReason: reason, nextAttemptAt: null };
      this.records.set(payoutKey(split.splitId), record);
      return clone(record);
    }
    const record = this.transition(split, prior, "block", { terminalReason: reason, nextAttemptAt: null });
    return clone(record);
  }

  fail(split, prior, reason, lastResult) {
    const record = this.transition(split, prior, "fail", {
      terminalReason: reason,
      terminalAt: this.clock(),
      lastResult,
      nextAttemptAt: null,
    });
    this.appendEvent(split, "payout-failed", record);
    return clone(record);
  }

  transition(split, prior, requestedTransition, changes) {
    const currentState = prior?.state ?? "pending";
    const decision = decidePayoutTransition(currentState, requestedTransition);
    if (!decision.ok) {
      if (isTerminalPayoutState(currentState)) return prior;
      throw new Error(`unexpected payout transition: ${currentState}:${requestedTransition}`);
    }
    const record = {
      payoutId: prior?.payoutId ?? `payout:${split.splitId}`,
      splitId: split.splitId,
      bundleId: split.bundleId,
      vendorId: split.vendorId,
      state: decision.nextState,
      attemptCount: prior?.attemptCount ?? 0,
      idempotencyKey: prior?.idempotencyKey ?? `marketplace-payout:${split.splitId}`,
      settlementReference: prior?.settlementReference ?? null,
      terminalReason: prior?.terminalReason ?? null,
      ...changes,
    };
    this.records.set(payoutKey(split.splitId), record);
    return record;
  }

  appendEvent(split, eventType, record) {
    this.sessionLog.append(split.sessionId, {
      eventType,
      splitId: split.splitId,
      bundleId: split.bundleId,
      vendorId: split.vendorId,
      agentId: null,
      reason: record.terminalReason ?? undefined,
      recordedAt: new Date(this.clock()).toISOString(),
    });
  }
}

export function createPayoutDispatchCoordinator(options) {
  return new PayoutDispatchCoordinator(options);
}

export async function runPayoutDispatchAlarm(coordinator, dueSplits) {
  const results = [];
  for (const split of dueSplits) results.push(await coordinator.attempt(split));
  return results;
}

function clone(value) {
  return value ? structuredClone(value) : value;
}
