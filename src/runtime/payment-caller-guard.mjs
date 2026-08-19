import { paymentOrderingVerdict } from "../registry/session-log.mjs";

export const ISSUANCE_SERVICE_CALLER = "Issuance_Service";

export function assertPaymentCaller(caller) {
  if (caller !== ISSUANCE_SERVICE_CALLER) {
    return { ok: false, reason: "unauthorized-payment-caller" };
  }
  return { ok: true };
}

export function issueAfterOrderingCheck({ caller, sessionEntries, offerId, paymentClient, payload }) {
  const callerCheck = assertPaymentCaller(caller);
  if (!callerCheck.ok) {
    return { status: "fail-closed", reason: callerCheck.reason };
  }

  const verdict = paymentOrderingVerdict(sessionEntries, offerId);
  if (!verdict.issuanceAllowed) {
    return { status: "fail-closed", reason: "payment-ordering-invalid" };
  }

  const result = paymentClient.issueCard(payload);
  return { status: "issued", result, caller };
}
