import assert from "node:assert/strict";
import { test } from "node:test";

import { createPayoutDispatchCoordinator } from "../../src/payout/payout-dispatch-coordinator.mjs";
import { createSessionLogStore, payoutOrderingVerdict } from "../../src/registry/session-log.mjs";
import { fc, propertyConfig, tag } from "../support/pbt.mjs";

test(tag("knowgrph-native-marketplace-layer", 23, "Payout Ordering Invariant"), async () => {
  await fc.assert(fc.asyncProperty(
    fc.boolean(),
    fc.constantFrom("pending_review", "approved", "active", "suspended"),
    async (settlementVerified, vendorState) => {
      const sessionLog = createSessionLogStore();
      if (settlementVerified) sessionLog.append("session", { eventType: "settlement-verified", splitId: "split", bundleId: "bundle", agentId: null,
        recordedAt: "2026-08-22T00:00:00.000Z" });
      let movements = 0;
      const coordinator = createPayoutDispatchCoordinator({
        sessionLog,
        vendorRegistry: { dispatchVerdict: () => vendorState === "active" ? { allowed: true } : { allowed: false, reason: `vendor-${vendorState}` } },
        railPort: { async dispatch() { movements += 1; return { ok: true, settlementRef: "settled" }; } },
        clock: () => 1_800_000_000_000,
      });
      await coordinator.attempt({ splitId: "split", bundleId: "bundle", vendorId: "vendor", sessionId: "session",
        netPayoutAmountMinor: 1, settlementCurrency: "SGD" });
      assert.equal(movements, settlementVerified && vendorState === "active" ? 1 : 0);
      const verdict = payoutOrderingVerdict(sessionLog.readOrdered("session"), "split");
      if (movements === 1) assert.equal(verdict.dispatchAllowed, true);
    },
  ), propertyConfig(300));
});
