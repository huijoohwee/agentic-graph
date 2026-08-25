export const VENDOR_LIFECYCLE_STATES = Object.freeze([
  "pending_review",
  "approved",
  "active",
  "suspended",
]);

export const VENDOR_LIFECYCLE_TRANSITIONS = Object.freeze([
  "submit_for_approval",
  "approve",
  "activate",
  "suspend",
  "reinstate",
]);

// Independently derived frozen-lifecycle pattern; no external implementation is reused.
export const VENDOR_LIFECYCLE_TABLE = Object.freeze({
  pending_review: Object.freeze({
    submit_for_approval: "pending_review",
    approve: "approved",
    suspend: "suspended",
  }),
  approved: Object.freeze({ activate: "active", suspend: "suspended" }),
  active: Object.freeze({ suspend: "suspended" }),
  suspended: Object.freeze({ reinstate: "approved" }),
});

export function decideVendorTransition(currentState, requestedTransition) {
  const nextState = VENDOR_LIFECYCLE_TABLE[currentState]?.[requestedTransition];
  if (!nextState) {
    return {
      ok: false,
      reason: "vendor-state-transition-rejected",
      currentState,
      requestedTransition,
    };
  }
  return { ok: true, currentState, requestedTransition, nextState };
}
