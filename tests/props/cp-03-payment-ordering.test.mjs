import assert from "node:assert/strict";
import { test } from "node:test";

import { createSessionLogStore, paymentOrderingVerdict } from "../../src/registry/session-log.mjs";
import { createMockAvalancheClient, createMockStraitsXClient } from "../support/mocks/payment-clients.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";

const EVENT_TYPES = ["gate-pass", "human-confirm", "issuance"];

test(tag("knowgrph-agentic-commerce-platform", 3, "Payment Ordering Invariant"), () => {
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom(...EVENT_TYPES), { minLength: 1, maxLength: 12 }),
      (eventTypes) => {
        const straitsX = createMockStraitsXClient();
        const avalanche = createMockAvalancheClient();
        const store = createSessionLogStore();
        for (const eventType of eventTypes) {
          store.append("session-property", {
            eventType,
            offerId: "offer-1",
            agentId: "agent-1",
            recordedAt: "2026-08-19T00:00:00.000Z",
          });
        }
        const entries = store.readOrdered("session-property");
        const verdict = paymentOrderingVerdict(entries, "offer-1");
        const expectedGateIndex = eventTypes.indexOf("gate-pass");
        const expectedConfirmIndex = eventTypes.indexOf("human-confirm");
        const expectedIssuanceCount = eventTypes.filter((eventType) => eventType === "issuance").length;
        assert.equal(verdict.gatePassBeforeHumanConfirm, expectedGateIndex >= 0 && expectedConfirmIndex >= 0 && expectedGateIndex < expectedConfirmIndex);
        assert.equal(verdict.atMostOneIssuance, expectedIssuanceCount <= 1);
        if (!verdict.issuanceAllowed) {
          assert.equal(straitsX.calls.length, 0);
          assert.equal(avalanche.calls.length, 0);
        }
      },
    ),
    propertyConfig(500),
  );
});
