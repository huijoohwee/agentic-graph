export const PAYOUT_STATES = Object.freeze(["pending", "blocked", "dispatched", "settled", "failed"]);

export const PAYOUT_TRANSITION_TABLE = Object.freeze({
  pending: Object.freeze({ block: "blocked", dispatch: "dispatched", fail: "failed" }),
  blocked: Object.freeze({ dispatch: "dispatched" }),
  dispatched: Object.freeze({ settle: "settled", fail: "failed" }),
  settled: Object.freeze({}),
  failed: Object.freeze({}),
});

export function decidePayoutTransition(currentState, requestedTransition) {
  const nextState = PAYOUT_TRANSITION_TABLE[currentState]?.[requestedTransition];
  return nextState
    ? { ok: true, currentState, requestedTransition, nextState }
    : { ok: false, reason: "payout-state-transition-rejected", currentState, requestedTransition };
}

export function isTerminalPayoutState(state) {
  return state === "settled" || state === "failed";
}
