import { createAgentRegistry } from "./agent-registry.mjs";
import { validateAgentDefinition } from "./definition-validator.mjs";
import { handleMcpCommand } from "./mcp-surface.mjs";
import { projectRegistryCanvas, renderRegistryCanvas } from "./registry-canvas.mjs";
import { validateStartupConfig } from "../runtime/startup-config.mjs";
import { boundaryReport } from "../runtime/deploy-boundary.mjs";
import { evaluateCommission } from "../commission/commission-evaluator.mjs";
import { projectVendorSplits } from "../ledger/vendor-split-projector.mjs";
import { createVendorRegistry } from "../marketplace/vendor-registry.mjs";
import { projectVendorSettlementCanvas, renderVendorSettlementCanvas } from "../marketplace/vendor-settlement-canvas.mjs";
import { createPayoutDispatchCoordinator } from "../payout/payout-dispatch-coordinator.mjs";
import { createStubPayoutRailPort } from "../payout/payout-rail-port.mjs";
import { commissionRuleKey } from "./scope-keys.mjs";
import { createSessionLogStore } from "./session-log.mjs";

export function createAgenticCommerceRuntime(options = {}) {
  const registry = createAgentRegistry();
  const validator = (definition) => validateAgentDefinition(definition, { schemaProvider: options.schemaProvider });
  const marketplace = createMarketplaceComposition(options);
  return {
    registry,
    validator,
    startup: validateStartupConfig(options.env ?? {}),
    boundary: boundaryReport(),
    marketplace,
    mcp(command, args) {
      return handleMcpCommand(command, args, { registry, validator });
    },
    registryCanvas(canvasOptions = {}) {
      return renderRegistryCanvas(projectRegistryCanvas(registry.listDefinitions(), canvasOptions), canvasOptions);
    },
  };
}

function createMarketplaceComposition(options) {
  const commissionRules = new Map((options.commissionRules ?? []).map(rule => [
    commissionRuleKey(rule.commissionRuleId, rule.revision),
    Object.freeze({ ...rule }),
  ]));
  const sessionLog = options.marketplaceSessionLog ?? createSessionLogStore();
  const vendorRegistry = createVendorRegistry({
    commissionRuleLookup: key => commissionRules.get(key) ?? null,
    clock: options.marketplaceIsoClock,
  });
  const payoutCoordinator = createPayoutDispatchCoordinator({
    sessionLog,
    vendorRegistry,
    railPort: options.payoutRailPort ?? createStubPayoutRailPort(),
    clock: options.marketplaceClock,
  });
  return Object.freeze({
    commissionRules,
    vendorRegistry,
    sessionLog,
    payoutCoordinator,
    registerVendor(candidate) {
      return vendorRegistry.register(candidate);
    },
    transitionVendor({ vendorId, requestedTransition, actor, sessionId }) {
      const result = vendorRegistry.transition(vendorId, requestedTransition, actor);
      if (result.status === "transitioned" && result.to === "active") {
        sessionLog.append(sessionId, {
          eventType: "vendor-activated",
          vendorId,
          agentId: null,
          recordedAt: new Date(options.marketplaceClock?.() ?? Date.now()).toISOString(),
        });
      }
      return result;
    },
    projectSplits({ sessionId, ...input }) {
      const result = projectVendorSplits({
        ...input,
        vendorLookup: vendorId => {
          const vendor = vendorRegistry.get(vendorId);
          if (!vendor) return null;
          return {
            ...vendor,
            commissionRule: commissionRules.get(commissionRuleKey(vendor.commissionRuleId, vendor.commissionRuleRevision)) ?? null,
          };
        },
        evaluate: evaluateCommission,
      });
      if (result.ok) sessionLog.append(sessionId, {
        ...result.event,
        agentId: null,
        recordedAt: new Date(options.marketplaceClock?.() ?? Date.now()).toISOString(),
      });
      return result;
    },
    recordSettlementVerification({ sessionId, bundleId, splitIds }) {
      return splitIds.map(splitId => sessionLog.append(sessionId, {
        eventType: "settlement-verified",
        splitId,
        bundleId,
        agentId: null,
        recordedAt: new Date(options.marketplaceClock?.() ?? Date.now()).toISOString(),
      }));
    },
    async dispatchPayouts(sessionId, splits) {
      const outcomes = [];
      for (const split of splits) outcomes.push(await payoutCoordinator.attempt({ ...split, sessionId }));
      return outcomes;
    },
    settlementCanvas(canvasOptions = {}) {
      return renderVendorSettlementCanvas(projectVendorSettlementCanvas(
        vendorRegistry.list(),
        payoutCoordinator.all(),
        canvasOptions,
      ), canvasOptions);
    },
  });
}
