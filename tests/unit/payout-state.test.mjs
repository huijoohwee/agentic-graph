import assert from "node:assert/strict";
import { test } from "node:test";

import { PAYOUT_TRANSITION_TABLE, decidePayoutTransition, isTerminalPayoutState } from "../../src/payout/payout-state.mjs";

test("payout state table accepts declared transitions including blocked recovery", () => {
  for (const [currentState, transitions] of Object.entries(PAYOUT_TRANSITION_TABLE)) {
    for (const [requestedTransition, nextState] of Object.entries(transitions)) {
      assert.equal(decidePayoutTransition(currentState, requestedTransition).nextState, nextState);
    }
  }
  assert.equal(decidePayoutTransition("blocked", "dispatch").nextState, "dispatched");
});

test("settled and failed payouts are terminal", () => {
  for (const state of ["settled", "failed"]) {
    assert.equal(isTerminalPayoutState(state), true);
    for (const transition of ["block", "dispatch", "settle", "fail"]) {
      assert.equal(decidePayoutTransition(state, transition).ok, false);
    }
  }
});
