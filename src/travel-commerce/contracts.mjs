/** @typedef {string & { readonly __brand: "BundleId" }} BundleId */

export const LIMITS = Object.freeze({ maxLegs: 20, maxEdges: 20 });

export const reject = (reason, extra = {}) => Object.freeze({ kind: "rejected", reason, ...extra });

export function assertMinorUnits(amount) {
  if (!Number.isSafeInteger(amount)) throw new TypeError("Money must be an integer number of minor units.");
  return amount;
}

export function cascadeKey({ bundleId, legId, eventId }) {
  return `${bundleId}\u0000${legId}\u0000${eventId}`;
}
