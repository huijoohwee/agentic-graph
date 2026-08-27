import { withApprovalGate } from "./video-remix/approval-gate-guard.js";
import {
  PAYMENT_APPROVAL_GATE_ID,
  PAYMENT_RAIL_IDS,
  PAYMENT_SETTLEMENT_ASSETS,
  PAYMENT_TOOL_NAMES,
  PAYMENT_TOOL_NAME_VALUES,
  isPaymentToolName,
} from "./payment-tool-contract.js";

const OPERATION_BY_TOOL = Object.freeze({
  [PAYMENT_TOOL_NAMES.railSelect]: "rail_select",
  [PAYMENT_TOOL_NAMES.intentCreate]: "intent_create",
  [PAYMENT_TOOL_NAMES.status]: "status",
  [PAYMENT_TOOL_NAMES.eventSettle]: "event_settle",
  [PAYMENT_TOOL_NAMES.reconcile]: "reconcile",
  [PAYMENT_TOOL_NAMES.receiptProject]: "receipt_project",
  [PAYMENT_TOOL_NAMES.refund]: "refund",
  [PAYMENT_TOOL_NAMES.readiness]: "readiness",
});

const APPROVAL_GATED_TOOLS = new Set([
  PAYMENT_TOOL_NAMES.intentCreate,
  PAYMENT_TOOL_NAMES.eventSettle,
  PAYMENT_TOOL_NAMES.reconcile,
  PAYMENT_TOOL_NAMES.refund,
]);

const ADAPTER_KEY_BY_TOOL = Object.freeze({
  [PAYMENT_TOOL_NAMES.intentCreate]: "intentCreate",
  [PAYMENT_TOOL_NAMES.status]: "status",
  [PAYMENT_TOOL_NAMES.eventSettle]: "eventSettle",
  [PAYMENT_TOOL_NAMES.reconcile]: "reconcile",
  [PAYMENT_TOOL_NAMES.receiptProject]: "receiptProject",
  [PAYMENT_TOOL_NAMES.refund]: "refund",
});

const PAYMENT_COMMANDS = Object.freeze([
  "/payment.rail.select",
  "/payment.intent.create",
  "/payment.event.settle",
  "/payment.reconcile",
  "/payment.receipt.project",
  "/payment.refund",
  "/payment.readiness",
]);

const PAYMENT_SEMANTICS = Object.freeze([
  "#payment-rail-selection",
  "#payment-idempotency",
  "#payment-settlement-integrity",
  "#offline-intent-queue",
  "#payment-data-minimization",
  "#payment-readiness",
]);

const PAYMENT_BINDINGS = Object.freeze([
  "@payment-rail",
  "@payment-intent",
  "@payment-provider",
  "@payment-event",
  "@payment-record",
  "@payment-readiness",
]);

const STRIPE_REQUIRED_CREDENTIAL_NAMES = Object.freeze([
  "PAYMENT_STRIPE_SANDBOX_RESTRICTED_KEY",
  "PAYMENT_STRIPE_MCP_SANDBOX_RESTRICTED_KEY",
  "PAYMENT_STRIPE_SANDBOX_WEBHOOK_SECRET",
]);

const STRAITSX_BASE_CREDENTIAL_NAMES = Object.freeze([
  "STRAITSX_SANDBOX_APP_API_KEY",
  "STRAITSX_SANDBOX_CALLBACK_SIGNING_SECRET",
]);

const STRAITSX_SIGNING_CREDENTIAL_NAMES = Object.freeze([
  "STRAITSX_SANDBOX_PUBLIC_KEY_ID",
  "STRAITSX_SANDBOX_REQUEST_SIGNING_PRIVATE_KEY",
]);

const STRAITSX_INTEGRATION_MODELS = new Set([
  "regular_transfer",
  "first_party_transfer",
  "third_party_transfer",
]);

const STRAITSX_FUND_FLOW_BY_MODEL = Object.freeze({
  regular_transfer: "own_account_collection",
  first_party_transfer: "customer_own_account_collection",
  third_party_transfer: "customer_third_party_collection",
});

const STRAITSX_DYNAMIC_PAYNOW_CREATE_PATH = "/v1/payments/paynow";
const STRAITSX_DYNAMIC_PAYNOW_READ_PATH_TEMPLATE = "/v1/payments/paynow/{paymentId}";

const PUBLIC_PAYMENT_STATES = new Set([
  "idle",
  "queued_offline",
  "pending_provider",
  "paid",
  "refunded",
  "no_payment_required",
  "failed",
  "expired",
  "cancelled",
  "reconciliation_unresolved",
]);

const identifier = (value) => {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(normalized) ? normalized : "";
};

const currency = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[a-z]{3}$/.test(normalized) ? normalized : "";
};

const envText = (env, name) => String(env?.[name] || "").trim();
const envEnabled = (env, name) => envText(env, name).toLowerCase() === "true";
const presentCredentialNames = (env, names) => names.filter((name) => Boolean(envText(env, name)));
const bool = (value) => value === true;
const buyerProductConfigured = (env) => {
  const amountMinorText = envText(env, "PAYMENT_BUYER_PRODUCT_AMOUNT_MINOR");
  const amountMinor = /^[1-9]\d*$/.test(amountMinorText) ? Number(amountMinorText) : Number.NaN;
  const productCurrency = envText(env, "PAYMENT_BUYER_PRODUCT_CURRENCY").toLowerCase();
  const settlementAsset = envText(env, "PAYMENT_BUYER_PRODUCT_SETTLEMENT_ASSET").toLowerCase();
  return Number.isSafeInteger(amountMinor)
    && /^[a-z]{3}$/.test(productCurrency)
    && ["fiat", "xsgd"].includes(settlementAsset);
};

const normalizeProviderCallCount = (value, fallback = 0) => {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : fallback;
};

const normalizeError = (code, message, reason) => {
  const codeText = String(code || "").trim();
  const reasonText = String(reason || "").trim();
  return {
    code: /^[a-z][a-z0-9_]{0,63}$/.test(codeText) ? codeText : "payment_runtime_failure",
    message: String(message || "The payment operation could not be completed."),
    ...(/^[a-z][a-z0-9_]{0,63}$/.test(reasonText) ? { reason: reasonText } : {}),
  };
};

const response = (toolName, { ok, result = null, error = null, providerCallCount = 0 }) => ({
  ok,
  tool: toolName,
  operation: OPERATION_BY_TOOL[toolName],
  approvalRequired: APPROVAL_GATED_TOOLS.has(toolName),
  result,
  error,
  providerCallCount: normalizeProviderCallCount(providerCallCount),
  modelCallCount: 0,
  modelCostUsd: 0,
});

const failure = (toolName, code, message, options = {}) => response(toolName, {
  ok: false,
  result: options.result ?? null,
  error: normalizeError(code, message, options.reason),
  providerCallCount: options.providerCallCount,
});

const normalizePublicStatus = (value) => {
  const candidate = value?.result && typeof value.result === "object" ? value.result : value;
  const intentId = identifier(candidate?.intentId);
  const state = String(candidate?.state || "").trim();
  const amountMinor = Number(candidate?.amountMinor);
  const normalizedCurrency = currency(candidate?.currency);
  if (
    !intentId
    || !PUBLIC_PAYMENT_STATES.has(state)
    || !Number.isSafeInteger(amountMinor)
    || amountMinor < 0
    || !normalizedCurrency
  ) {
    return null;
  }
  return { intentId, state, amountMinor, currency: normalizedCurrency };
};

const normalizeInstruction = (value) => {
  if (!value || typeof value !== "object") return null;
  const kind = String(value.kind || "").trim();
  const providerValue = value.value && typeof value.value === "object"
    ? value.value
    : null;
  const reference = String(
    kind === "provider_instruction"
      ? providerValue?.qrCodeData
        || providerValue?.virtualPaymentAddress
        || providerValue?.externalReference
        || providerValue?.referenceId
        || providerValue?.id
        || (typeof value.value === "string" ? value.value : "")
      : value.reference || value.url || "",
  ).trim();
  if (!["hosted_checkout", "provider_instruction"].includes(kind) || !reference || reference.length > 2048) {
    return null;
  }
  return { kind, reference };
};

const normalizeMutationResult = (value) => {
  const candidate = value?.result && typeof value.result === "object" ? value.result : value;
  const intent = normalizePublicStatus(candidate?.intent);
  const rail = PAYMENT_RAIL_IDS.includes(candidate?.rail) ? candidate.rail : null;
  if (!intent || !rail) return null;
  return {
    intent,
    rail,
    instruction: normalizeInstruction(candidate.instruction),
    idempotentReplay: candidate.idempotentReplay === true,
    operationReference: identifier(candidate.operationReference || candidate.refundReference) || null,
  };
};

const adapterFailure = (toolName, adapterResult, fallbackProviderCallCount) => failure(
  toolName,
  adapterResult?.code || adapterResult?.error?.code || "payment_operation_failed",
  "The payment adapter returned a typed failure. Review operator-only payment logs for correlation details.",
  {
    reason: adapterResult?.reason || adapterResult?.error?.reason,
    providerCallCount: normalizeProviderCallCount(adapterResult?.providerCallCount, fallbackProviderCallCount),
  },
);

export function buildPaymentCapabilityDiscovery({ cardSettledCurrencies = [] } = {}) {
  const configuredCurrencies = [...new Set(
    cardSettledCurrencies.map(currency).filter(Boolean),
  )].sort();
  return {
    schemaVersion: "agenticgraph-payment-capability/v1",
    rails: [...PAYMENT_RAIL_IDS],
    currencies: [
      { rail: "stripe", values: configuredCurrencies, source: "configured_card_currency_set" },
      { rail: "straitsx", values: ["sgd"], source: "fixed" },
    ],
    settlementAssets: [...PAYMENT_SETTLEMENT_ASSETS],
    operations: [...PAYMENT_TOOL_NAME_VALUES],
    schemaSource: "mcp_tools_list",
    invocations: {
      commands: [...PAYMENT_COMMANDS],
      semantics: [...PAYMENT_SEMANTICS],
      bindings: [...PAYMENT_BINDINGS],
    },
    transports: [
      {
        rail: "stripe",
        kind: "federated_hosted_mcp",
        endpoint: "https://mcp.stripe.com",
        confirmationRequired: true,
        localProxy: false,
      },
      {
        rail: "straitsx",
        kind: "provider_rest",
        endpoint: null,
        confirmationRequired: true,
        localProxy: false,
      },
    ],
  };
}

const buildRailReadiness = ({ rail, enabled, environment, requiredCredentialNames, configuredCredentialNames, checks }) => {
  const runtimeReady = enabled && Object.values(checks).every(Boolean);
  return {
    rail,
    enabled,
    runtimeReady,
    status: runtimeReady ? "runtime_ready" : "blocked",
    environment: environment || "unconfigured",
    requiredCredentialNames: [...requiredCredentialNames],
    configuredCredentialNames: [...configuredCredentialNames],
    checks,
  };
};

const unavailableReadinessSources = (rails) => rails.flatMap((entry) => {
  const missing = [];
  if (!entry.enabled) {
    missing.push({ rail: entry.rail, source: `${entry.rail}.enabled`, reason: "rail_disabled_or_unconfigured" });
  }
  for (const [check, ready] of Object.entries(entry.checks)) {
    if (!ready) {
      missing.push({ rail: entry.rail, source: `${entry.rail}.${check}`, reason: "unverified" });
    }
  }
  return missing;
});

export function buildPaymentRailReadinessSnapshot({
  env = process.env,
  evidence = {},
  rail,
} = {}) {
  const stripeEnvironment = envText(env, "PAYMENT_STRIPE_MODE").toLowerCase();
  const stripeConfiguredCredentials = presentCredentialNames(env, STRIPE_REQUIRED_CREDENTIAL_NAMES);
  const stripeChecks = {
    credentialsPresent: stripeConfiguredCredentials.length === STRIPE_REQUIRED_CREDENTIAL_NAMES.length,
    environmentMatch: stripeEnvironment === "sandbox",
    buyerProductConfigured: buyerProductConfigured(env),
    cardCurrencySetConfigured: envText(env, "PAYMENT_CARD_SETTLED_CURRENCIES")
      .split(",")
      .some((value) => Boolean(currency(value))),
    checkoutPriceAuthorityConfigured: envText(env, "STRIPE_CHECKOUT_PRICE_ID").startsWith("price_"),
    requestApiVersionPinned: bool(evidence.stripe?.requestApiVersionPinned),
    webhookApiVersionPinned: bool(evidence.stripe?.webhookApiVersionPinned),
    callbackVerificationConfigured: Boolean(envText(env, "PAYMENT_STRIPE_SANDBOX_WEBHOOK_SECRET")),
    hostedMcpAllowlistReviewed: bool(evidence.stripe?.hostedMcpAllowlistReviewed),
    providerReadVerified: bool(evidence.stripe?.providerReadVerified),
    sandboxSettlementVerified: bool(evidence.stripe?.sandboxSettlementVerified),
  };
  const stripe = buildRailReadiness({
    rail: "stripe",
    enabled: Boolean(stripeEnvironment || stripeConfiguredCredentials.length),
    environment: stripeEnvironment,
    requiredCredentialNames: STRIPE_REQUIRED_CREDENTIAL_NAMES,
    configuredCredentialNames: stripeConfiguredCredentials,
    checks: stripeChecks,
  });

  const straitsxEnvironment = envText(env, "STRAITSX_MODE").toLowerCase();
  const authMode = envText(env, "STRAITSX_AUTHENTICATION_MODE").toLowerCase();
  const straitsxRequiredCredentials = authMode === "http_request_signing"
    ? [...STRAITSX_BASE_CREDENTIAL_NAMES, ...STRAITSX_SIGNING_CREDENTIAL_NAMES]
    : [...STRAITSX_BASE_CREDENTIAL_NAMES];
  const straitsxConfiguredCredentials = presentCredentialNames(env, straitsxRequiredCredentials);
  const integrationModel = envText(env, "STRAITSX_INTEGRATION_MODEL").toLowerCase();
  const fundFlow = envText(env, "STRAITSX_FUND_FLOW").toLowerCase();
  const paymentMethod = envText(env, "STRAITSX_PAYMENT_METHOD").toLowerCase();
  const grantedProducts = new Set(
    envText(env, "STRAITSX_GRANTED_PRODUCTS").toLowerCase().split(",").map((value) => value.trim()).filter(Boolean),
  );
  const straitsxChecks = {
    credentialsPresent: straitsxConfiguredCredentials.length === straitsxRequiredCredentials.length,
    environmentMatch: straitsxEnvironment === "sandbox",
    buyerProductConfigured: buyerProductConfigured(env),
    integrationModelBound: STRAITSX_INTEGRATION_MODELS.has(integrationModel),
    fundFlowBound: Boolean(fundFlow),
    integrationModelCompatible:
      STRAITSX_FUND_FLOW_BY_MODEL[integrationModel] === fundFlow,
    productGrantPresent: Boolean(paymentMethod) && grantedProducts.has(paymentMethod),
    providerContractConfigured:
      paymentMethod === "dynamic_paynow"
      && envText(env, "STRAITSX_PAYMENT_CREATE_PATH") === STRAITSX_DYNAMIC_PAYNOW_CREATE_PATH
      && envText(env, "STRAITSX_PAYMENT_READ_PATH_TEMPLATE")
        === STRAITSX_DYNAMIC_PAYNOW_READ_PATH_TEMPLATE,
    providerContractBound: bool(evidence.straitsx?.providerContractBound),
    signingClockHealthy: bool(evidence.straitsx?.signingClockHealthy),
    callbackVerificationConfigured: Boolean(envText(env, "STRAITSX_SANDBOX_CALLBACK_SIGNING_SECRET")),
    helloVerified: bool(evidence.straitsx?.helloVerified),
    providerReadVerified: bool(evidence.straitsx?.providerReadVerified),
    sandboxSettlementVerified: bool(evidence.straitsx?.sandboxSettlementVerified),
  };
  const straitsx = buildRailReadiness({
    rail: "straitsx",
    enabled: envEnabled(env, "STRAITSX_ENABLED"),
    environment: straitsxEnvironment,
    requiredCredentialNames: straitsxRequiredCredentials,
    configuredCredentialNames: straitsxConfiguredCredentials,
    checks: straitsxChecks,
  });

  const requestedRail = PAYMENT_RAIL_IDS.includes(rail) ? rail : null;
  const rails = requestedRail ? [stripe, straitsx].filter((entry) => entry.rail === requestedRail) : [stripe, straitsx];
  const cardSettledCurrencies = envText(env, "PAYMENT_CARD_SETTLED_CURRENCIES").split(",").map((value) => value.trim());
  return {
    capability: buildPaymentCapabilityDiscovery({ cardSettledCurrencies }),
    rails,
    unavailableSources: unavailableReadinessSources(rails),
  };
}

const compatibleRailsFor = ({ currency: inputCurrency, settlementAsset, cardSettledCurrencies }) => {
  const normalizedCurrency = currency(inputCurrency);
  const normalizedAsset = String(settlementAsset || "").trim().toLowerCase();
  if (normalizedAsset === "xsgd") return ["straitsx"];
  if (normalizedAsset !== "fiat" || !normalizedCurrency) return [];
  if (normalizedCurrency === "sgd") return ["stripe", "straitsx"];
  const configuredCurrencies = new Set((cardSettledCurrencies || []).map(currency).filter(Boolean));
  return configuredCurrencies.has(normalizedCurrency) ? ["stripe"] : [];
};

export function selectPaymentRail(args = {}) {
  const compatibleRails = compatibleRailsFor(args);
  const settlementAsset = String(args.settlementAsset || "").trim().toLowerCase();
  const readyRails = compatibleRails.filter((rail) => {
    if (args.readiness?.[rail] !== true) return false;
    return rail !== "straitsx" || settlementAsset !== "xsgd" || args.readiness?.xsgd === true;
  });
  if (readyRails.length === 0) {
    return { ok: false, rail: null, reason: "no_ready_compatible_rail", compatibleRails };
  }
  if (readyRails.length === 1 && compatibleRails.length > 1) {
    return { ok: true, rail: readyRails[0], reason: "only_ready_rail", compatibleRails };
  }
  if (settlementAsset === "xsgd") {
    return { ok: true, rail: "straitsx", reason: "xsgd", compatibleRails };
  }
  if (currency(args.currency) === "sgd") {
    return { ok: true, rail: "straitsx", reason: "sgd_fiat", compatibleRails };
  }
  return { ok: true, rail: "stripe", reason: "card_currency", compatibleRails };
}

const approvalReference = (token) => {
  const tokenId = identifier(token?.tokenId);
  if (tokenId) return `${PAYMENT_APPROVAL_GATE_ID}:${tokenId}`;
  const issuedAt = identifier(token?.issuedAt);
  return issuedAt
    ? `${PAYMENT_APPROVAL_GATE_ID}:${issuedAt}`
    : PAYMENT_APPROVAL_GATE_ID;
};

const withoutApprovalToken = (toolName, args) => {
  const { approvalToken: _approvalToken, ...adapterArgs } = args || {};
  return toolName === PAYMENT_TOOL_NAMES.intentCreate
    && String(adapterArgs.origin || "").trim().toLowerCase() === "agent"
    ? {
        ...adapterArgs,
        approvalRef: approvalReference(args?.approvalToken),
      }
    : adapterArgs;
};

export function createPaymentRuntime({
  env = process.env,
  adapters = {},
  readinessEvidence = {},
  now,
  verifyApproval,
  consumeApproval,
} = {}) {
  const runReadAdapter = async (toolName, args) => {
    const adapter = adapters[ADAPTER_KEY_BY_TOOL[toolName]];
    if (typeof adapter !== "function") {
      const code = toolName === PAYMENT_TOOL_NAMES.status
        ? "payment_state_unconfigured"
        : "receipt_projection_unconfigured";
      return failure(toolName, code, "The host has not configured the local payment read adapter.");
    }
    try {
      const adapterResult = await adapter(args);
      if (adapterResult?.ok === false) return adapterFailure(toolName, adapterResult, 0);
      if (toolName === PAYMENT_TOOL_NAMES.status) {
        const result = normalizePublicStatus(adapterResult);
        return result
          ? response(toolName, { ok: true, result })
          : failure(toolName, "adapter_contract_invalid", "The local status adapter returned an invalid projection.");
      }
      const candidate = adapterResult?.result && typeof adapterResult.result === "object"
        ? adapterResult.result
        : adapterResult;
      if (typeof candidate?.document !== "string" || !Number.isSafeInteger(candidate?.recordCount) || candidate.recordCount < 0) {
        return failure(toolName, "adapter_contract_invalid", "The local receipt adapter returned an invalid projection.");
      }
      return response(toolName, {
        ok: true,
        result: { document: candidate.document, recordCount: candidate.recordCount },
      });
    } catch {
      return failure(toolName, "local_payment_read_failed", "The local payment projection could not be read.");
    }
  };

  const runApprovedAdapter = async (toolName, args, context) => {
    const adapter = adapters[ADAPTER_KEY_BY_TOOL[toolName]];
    let adapterInvoked = false;
    let gated;
    try {
      gated = await withApprovalGate(
        PAYMENT_APPROVAL_GATE_ID,
        args?.approvalToken,
        async () => {
          if (typeof adapter !== "function") return { adapterInvoked: false };
          adapterInvoked = true;
          const value = await adapter(withoutApprovalToken(toolName, args), context);
          return { adapterInvoked: true, value };
        },
        {
          now,
          verify: verifyApproval,
          consume: typeof consumeApproval === "function"
            ? async ({ token, gateId, result }) => {
              if (result?.adapterInvoked) await consumeApproval({ token, gateId, result: result.value });
            }
            : undefined,
        },
      );
    } catch {
      return adapterInvoked
        ? failure(
          toolName,
          "provider_outcome_unknown",
          "The provider outcome is unknown and must be reconciled using the same operation identity.",
          { providerCallCount: 1 },
        )
        : failure(toolName, "approval_check_failed", "The payment-action approval check could not be completed.");
    }
    if (!gated.permitted) {
      return failure(
        toolName,
        gated.reason === "absent" ? "approval_missing" : "approval_check_failed",
        "Payment execution was blocked by the payment-action approval gate.",
        { reason: gated.reason },
      );
    }
    if (!gated.result.adapterInvoked) {
      return failure(toolName, "provider_unconfigured", "The host has not configured this payment operation adapter.");
    }
    const adapterResult = gated.result.value;
    const providerCallCount = normalizeProviderCallCount(adapterResult?.providerCallCount, 1);
    if (adapterResult?.ok === false) return adapterFailure(toolName, adapterResult, providerCallCount);
    const result = normalizeMutationResult(adapterResult);
    return result
      ? response(toolName, { ok: true, result, providerCallCount })
      : failure(
        toolName,
        "adapter_contract_invalid",
        "The payment adapter returned an invalid rail-neutral result.",
        { providerCallCount },
      );
  };

  return Object.freeze({
    canHandle: isPaymentToolName,
    async run(toolName, args = {}, context = {}) {
      if (!isPaymentToolName(toolName)) {
        throw new Error(`Unsupported payment tool: ${String(toolName || "(missing)")}.`);
      }
      if (toolName === PAYMENT_TOOL_NAMES.railSelect) {
        const selection = selectPaymentRail(args);
        const { ok, ...result } = selection;
        return ok
          ? response(toolName, { ok: true, result })
          : failure(toolName, "rail_unavailable", "No ready compatible payment rail is available.", { result });
      }
      if (toolName === PAYMENT_TOOL_NAMES.readiness) {
        return response(toolName, {
          ok: true,
          result: buildPaymentRailReadinessSnapshot({
            env,
            evidence: readinessEvidence,
            rail: args.rail,
          }),
        });
      }
      if (toolName === PAYMENT_TOOL_NAMES.status || toolName === PAYMENT_TOOL_NAMES.receiptProject) {
        return runReadAdapter(toolName, args);
      }
      return runApprovedAdapter(toolName, args, context);
    },
  });
}

export { isPaymentToolName };
