import { KNOWGRPH_LOCAL_MCP_TOOL_NAMES } from "../canvas/src/features/agent-ready/knowgrphLocalMcpToolNames.mjs";

export const PAYMENT_APPROVAL_GATE_ID = "payment-action";

export const PAYMENT_TOOL_NAMES = Object.freeze({
  railSelect: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.paymentRailSelect,
  intentCreate: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.paymentIntentCreate,
  status: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.paymentStatus,
  eventSettle: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.paymentEventSettle,
  reconcile: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.paymentReconcile,
  receiptProject: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.paymentReceiptProject,
  refund: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.paymentRefund,
  readiness: KNOWGRPH_LOCAL_MCP_TOOL_NAMES.paymentReadiness,
});

export const PAYMENT_TOOL_NAME_VALUES = Object.freeze(Object.values(PAYMENT_TOOL_NAMES));
export const PAYMENT_RAIL_IDS = Object.freeze(["stripe", "straitsx"]);
export const PAYMENT_SETTLEMENT_ASSETS = Object.freeze(["fiat", "xsgd"]);

const READ_ONLY_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
});

const APPROVAL_GATED_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: true,
  idempotentHint: true,
});

const IDENTIFIER_SCHEMA = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 128,
  pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
});

const UUID_SCHEMA = Object.freeze({
  type: "string",
  format: "uuid",
});

const CURRENCY_SCHEMA = Object.freeze({
  type: "string",
  pattern: "^[a-z]{3}$",
});

const APPROVAL_TOKEN_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["gateId", "issuedAt"],
  properties: {
    tokenId: IDENTIFIER_SCHEMA,
    gateId: { type: "string", const: PAYMENT_APPROVAL_GATE_ID },
    issuedAt: { anyOf: [{ type: "number" }, { type: "string", format: "date-time" }] },
    consumed: { type: "boolean" },
    verified: { type: "boolean" },
    signature: { type: "string", minLength: 1 },
    estimatedCostUsd: { type: "number", minimum: 0 },
  },
});

const PUBLIC_STATUS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["intentId", "state", "amountMinor", "currency"],
  properties: {
    intentId: IDENTIFIER_SCHEMA,
    state: {
      type: "string",
      enum: [
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
      ],
    },
    amountMinor: { type: "integer", minimum: 0 },
    currency: CURRENCY_SCHEMA,
  },
});

const ERROR_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["code", "message"],
  properties: {
    code: { type: "string", minLength: 1 },
    message: { type: "string", minLength: 1 },
    reason: { type: "string", minLength: 1 },
  },
});

const NULL_SCHEMA = Object.freeze({ type: "null" });

const buildOutputSchema = (resultSchema) => ({
  type: "object",
  additionalProperties: false,
  required: [
    "ok",
    "tool",
    "operation",
    "approvalRequired",
    "result",
    "error",
    "providerCallCount",
    "modelCallCount",
    "modelCostUsd",
  ],
  properties: {
    ok: { type: "boolean" },
    tool: { type: "string", enum: PAYMENT_TOOL_NAME_VALUES },
    operation: {
      type: "string",
      enum: ["rail_select", "intent_create", "status", "event_settle", "reconcile", "receipt_project", "refund", "readiness"],
    },
    approvalRequired: { type: "boolean" },
    result: { anyOf: [resultSchema, NULL_SCHEMA] },
    error: { anyOf: [ERROR_SCHEMA, NULL_SCHEMA] },
    providerCallCount: { type: "integer", minimum: 0 },
    modelCallCount: { type: "integer", const: 0 },
    modelCostUsd: { type: "number", const: 0 },
  },
});

const RAIL_SELECTION_RESULT_SCHEMA = Object.freeze({
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["rail", "reason", "compatibleRails"],
      properties: {
        rail: { type: "string", enum: PAYMENT_RAIL_IDS },
        reason: { type: "string", enum: ["sgd_fiat", "xsgd", "card_currency", "only_ready_rail"] },
        compatibleRails: {
          type: "array",
          items: { type: "string", enum: PAYMENT_RAIL_IDS },
          maxItems: 2,
          uniqueItems: true,
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["rail", "reason", "compatibleRails"],
      properties: {
        rail: { type: "null" },
        reason: { type: "string", const: "no_ready_compatible_rail" },
        compatibleRails: {
          type: "array",
          items: { type: "string", enum: PAYMENT_RAIL_IDS },
          maxItems: 2,
          uniqueItems: true,
        },
      },
    },
  ],
});

const PROVIDER_INSTRUCTION_SCHEMA = Object.freeze({
  anyOf: [
    NULL_SCHEMA,
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "reference"],
      properties: {
        kind: { type: "string", enum: ["hosted_checkout", "provider_instruction"] },
        reference: { type: "string", minLength: 1, maxLength: 2048 },
      },
    },
  ],
});

const MUTATION_RESULT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["intent", "rail", "instruction", "idempotentReplay", "operationReference"],
  properties: {
    intent: PUBLIC_STATUS_SCHEMA,
    rail: { type: "string", enum: PAYMENT_RAIL_IDS },
    instruction: PROVIDER_INSTRUCTION_SCHEMA,
    idempotentReplay: { type: "boolean" },
    operationReference: { anyOf: [IDENTIFIER_SCHEMA, NULL_SCHEMA] },
  },
});

const RECEIPT_RESULT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["document", "recordCount"],
  properties: {
    document: { type: "string" },
    recordCount: { type: "integer", minimum: 0 },
  },
});

const CAPABILITY_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "rails", "currencies", "settlementAssets", "operations", "schemaSource", "invocations", "transports"],
  properties: {
    schemaVersion: { type: "string", const: "knowgrph-payment-capability/v1" },
    rails: { type: "array", items: { type: "string", enum: PAYMENT_RAIL_IDS }, uniqueItems: true },
    currencies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rail", "values", "source"],
        properties: {
          rail: { type: "string", enum: PAYMENT_RAIL_IDS },
          values: { type: "array", items: CURRENCY_SCHEMA, uniqueItems: true },
          source: { type: "string", enum: ["configured_card_currency_set", "fixed"] },
        },
      },
    },
    settlementAssets: { type: "array", items: { type: "string", enum: PAYMENT_SETTLEMENT_ASSETS }, uniqueItems: true },
    operations: { type: "array", items: { type: "string", enum: PAYMENT_TOOL_NAME_VALUES }, uniqueItems: true },
    schemaSource: { type: "string", const: "mcp_tools_list" },
    invocations: {
      type: "object",
      additionalProperties: false,
      required: ["commands", "semantics", "bindings"],
      properties: {
        commands: { type: "array", items: { type: "string" } },
        semantics: { type: "array", items: { type: "string" } },
        bindings: { type: "array", items: { type: "string" } },
      },
    },
    transports: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rail", "kind", "endpoint", "confirmationRequired", "localProxy"],
        properties: {
          rail: { type: "string", enum: PAYMENT_RAIL_IDS },
          kind: { type: "string", enum: ["existing_local_mcp", "federated_hosted_mcp", "provider_rest"] },
          endpoint: { anyOf: [{ type: "string" }, NULL_SCHEMA] },
          confirmationRequired: { type: "boolean" },
          localProxy: { type: "boolean", const: false },
        },
      },
    },
  },
});

const RAIL_READINESS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "rail",
    "enabled",
    "runtimeReady",
    "status",
    "environment",
    "requiredCredentialNames",
    "configuredCredentialNames",
    "checks",
  ],
  properties: {
    rail: { type: "string", enum: PAYMENT_RAIL_IDS },
    enabled: { type: "boolean" },
    runtimeReady: { type: "boolean" },
    status: { type: "string", enum: ["runtime_ready", "blocked"] },
    environment: { type: "string" },
    requiredCredentialNames: { type: "array", items: { type: "string" }, uniqueItems: true },
    configuredCredentialNames: { type: "array", items: { type: "string" }, uniqueItems: true },
    checks: { type: "object", additionalProperties: { type: "boolean" } },
  },
});

export const PAYMENT_READINESS_RESULT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["capability", "rails", "unavailableSources"],
  properties: {
    capability: CAPABILITY_SCHEMA,
    rails: { type: "array", items: RAIL_READINESS_SCHEMA, minItems: 1, maxItems: 2 },
    unavailableSources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rail", "source", "reason"],
        properties: {
          rail: { type: "string", enum: PAYMENT_RAIL_IDS },
          source: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  },
});

const INTENT_ID_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["intentId"],
  properties: { intentId: IDENTIFIER_SCHEMA },
});

const APPROVED_INTENT_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["intentId"],
  properties: {
    intentId: IDENTIFIER_SCHEMA,
    approvalToken: APPROVAL_TOKEN_SCHEMA,
  },
});

const tool = (name, description, inputSchema, resultSchema, annotations) => ({
  name,
  description,
  inputSchema,
  outputSchema: buildOutputSchema(resultSchema),
  annotations,
});

export const isPaymentToolName = (toolName) => PAYMENT_TOOL_NAME_VALUES.includes(toolName);

export const buildPaymentToolDefinitions = () => [
  tool(
    PAYMENT_TOOL_NAMES.railSelect,
    "Use this when an agent needs to select exactly one compatible ready payment rail locally without provider or model calls.",
    {
      type: "object",
      additionalProperties: false,
      required: ["currency", "settlementAsset", "readiness", "cardSettledCurrencies"],
      properties: {
        currency: CURRENCY_SCHEMA,
        settlementAsset: { type: "string", enum: PAYMENT_SETTLEMENT_ASSETS },
        readiness: {
          type: "object",
          additionalProperties: false,
          required: ["stripe", "straitsx"],
          properties: {
            stripe: { type: "boolean" },
            straitsx: { type: "boolean" },
            xsgd: { type: "boolean" },
          },
        },
        cardSettledCurrencies: {
          type: "array",
          items: CURRENCY_SCHEMA,
          maxItems: 64,
          uniqueItems: true,
        },
      },
    },
    RAIL_SELECTION_RESULT_SCHEMA,
    READ_ONLY_ANNOTATIONS,
  ),
  tool(
    PAYMENT_TOOL_NAMES.intentCreate,
    "Use this when an approved agent needs to create an idempotent payment intent through a host-owned adapter.",
    {
      type: "object",
      additionalProperties: false,
      required: ["clientIntentKey", "amountMinor", "currency", "settlementAsset", "origin"],
      properties: {
        clientIntentKey: UUID_SCHEMA,
        amountMinor: { type: "integer", minimum: 1 },
        currency: CURRENCY_SCHEMA,
        settlementAsset: { type: "string", enum: PAYMENT_SETTLEMENT_ASSETS },
        origin: { type: "string", enum: ["buyer", "agent"] },
        approvalToken: APPROVAL_TOKEN_SCHEMA,
      },
    },
    MUTATION_RESULT_SCHEMA,
    APPROVAL_GATED_ANNOTATIONS,
  ),
  tool(
    PAYMENT_TOOL_NAMES.status,
    "Use this when an agent needs the buyer-safe four-field payment status projection with no provider or model call by default.",
    INTENT_ID_INPUT_SCHEMA,
    PUBLIC_STATUS_SCHEMA,
    READ_ONLY_ANNOTATIONS,
  ),
  tool(
    PAYMENT_TOOL_NAMES.eventSettle,
    "Use this when an approved agent needs to apply an already-authenticated provider event through the host-owned settlement adapter.",
    {
      type: "object",
      additionalProperties: false,
      required: ["intentId", "rail", "eventId"],
      properties: {
        intentId: IDENTIFIER_SCHEMA,
        rail: { type: "string", enum: PAYMENT_RAIL_IDS },
        eventId: IDENTIFIER_SCHEMA,
        approvalToken: APPROVAL_TOKEN_SCHEMA,
      },
    },
    MUTATION_RESULT_SCHEMA,
    APPROVAL_GATED_ANNOTATIONS,
  ),
  tool(
    PAYMENT_TOOL_NAMES.reconcile,
    "Use this when an approved agent needs to reconcile one existing payment operation through a host-owned adapter.",
    APPROVED_INTENT_INPUT_SCHEMA,
    MUTATION_RESULT_SCHEMA,
    APPROVAL_GATED_ANNOTATIONS,
  ),
  tool(
    PAYMENT_TOOL_NAMES.receiptProject,
    "Use this when an agent needs to project terminal payment records into the canonical local receipt document without network or model calls.",
    INTENT_ID_INPUT_SCHEMA,
    RECEIPT_RESULT_SCHEMA,
    READ_ONLY_ANNOTATIONS,
  ),
  tool(
    PAYMENT_TOOL_NAMES.refund,
    "Use this when an approved operator agent needs to request an idempotent refund through a host-owned adapter.",
    {
      type: "object",
      additionalProperties: false,
      required: ["intentId"],
      properties: {
        intentId: IDENTIFIER_SCHEMA,
        amountMinor: { type: "integer", minimum: 1 },
        approvalToken: APPROVAL_TOKEN_SCHEMA,
      },
    },
    MUTATION_RESULT_SCHEMA,
    APPROVAL_GATED_ANNOTATIONS,
  ),
  tool(
    PAYMENT_TOOL_NAMES.readiness,
    "Use this when an agent needs rail-neutral payment capabilities and fail-closed local rail readiness without provider or model calls.",
    {
      type: "object",
      additionalProperties: false,
      properties: { rail: { type: "string", enum: PAYMENT_RAIL_IDS } },
    },
    PAYMENT_READINESS_RESULT_SCHEMA,
    READ_ONLY_ANNOTATIONS,
  ),
];
