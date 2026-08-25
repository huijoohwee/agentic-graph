export function createPayoutRailPort({ serviceBinding, enabled = false } = {}) {
  return Object.freeze({
    async dispatch(request) {
      const invalid = validateDispatchRequest(request);
      if (invalid) return { ok: false, retryable: false, reason: invalid };
      if (!enabled) return { ok: false, retryable: false, reason: "real-payout-disabled" };
      if (!serviceBinding || typeof serviceBinding.fetch !== "function") {
        return { ok: false, retryable: true, reason: "net-settlement-binding-unavailable" };
      }
      try {
        const response = await serviceBinding.fetch(new Request("https://net-settlement.internal/v1/net-settlements", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": request.idempotencyKey,
          },
          body: JSON.stringify({
            cascadeId: request.idempotencyKey,
            bundleId: request.bundleId,
            amountMinor: request.netMinor,
            currency: request.currency,
            caller: "Marketplace_Payout_Coordinator",
            vendorRef: request.vendorRef,
          }),
        }));
        const result = await response.json();
        if (response.ok && result && typeof result.settlementId === "string") {
          return { ok: true, settlementRef: result.settlementId };
        }
        return { ok: false, retryable: response.status >= 500, reason: "net-settlement-rejected" };
      } catch {
        return { ok: false, retryable: true, reason: "net-settlement-unavailable" };
      }
    },
  });
}

export function createStubPayoutRailPort(result = { ok: false, retryable: false, reason: "real-payout-disabled" }) {
  return Object.freeze({ async dispatch() { return { ...result }; } });
}

function validateDispatchRequest(request) {
  if (!request || !Number.isSafeInteger(request.netMinor) || request.netMinor < 0) return "invalid-net-minor";
  for (const field of ["splitId", "bundleId", "currency", "vendorRef", "idempotencyKey"]) {
    if (typeof request[field] !== "string" || request[field].length === 0) return `invalid-${field}`;
  }
  return null;
}
