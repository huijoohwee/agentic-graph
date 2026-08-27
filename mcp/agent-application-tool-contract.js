import { APPLICATION_MANIFEST_SCHEMA, APPLICATION_VALUE_SCHEMA } from "../contracts/agent-application.schema.js";

const DRAFT = "https://json-schema.org/draft/2020-12/schema";
const DIGEST = { type: "string", pattern: "^[0-9a-f]{64}$" };
const EXACT_REVISION = { type: "string", pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+$" };
const ID = { type: "string", pattern: "^[a-z0-9]+(?:[._-][a-z0-9]+)*$" };
const CAPABILITY = { type: "object", additionalProperties: false, required: ["id", "revision"], properties: { id: ID, revision: ID } };
const COMPONENT_REF = { type: "object", additionalProperties: false, required: ["id", "revision"], properties: { id: ID, revision: EXACT_REVISION } };
const PORT = {
  type: "object", additionalProperties: false, required: ["name", "schemaRef", "schemaDigest", "kinds"],
  properties: { name: ID, schemaRef: { type: "string" }, schemaDigest: DIGEST, kinds: { type: "array", maxItems: 5, items: { type: "string" }, uniqueItems: true }, required: { type: "boolean" } },
};
const ADAPTER = {
  type: "object", additionalProperties: false,
  required: ["id", "revision", "interfaceId", "interfaceRevision", "implementationRevision", "implementationDigest", "ownerImplementationRevision", "ownerImplementationDigest", "supportedComponents", "supportedModes"],
  properties: {
    id: ID, revision: EXACT_REVISION, interfaceId: { type: "string" }, interfaceRevision: { type: "string" }, implementationRevision: EXACT_REVISION, implementationDigest: DIGEST,
    ownerImplementationRevision: EXACT_REVISION, ownerImplementationDigest: DIGEST,
    supportedComponents: { type: "array", maxItems: 32, items: COMPONENT_REF }, supportedModes: { type: "array", maxItems: 2, items: { enum: ["dry-run", "live"] }, uniqueItems: true },
  },
};
const INTEGRATION = {
  type: "object", additionalProperties: false,
  required: ["integrationProfileId", "integrationProfileRevision", "capabilityId", "capabilityRevision", "schemaDigest", "artifactKind", "approvalRequired", "replay"],
  properties: {
    integrationProfileId: { type: "string", pattern: "^kgip_[0-9a-f]{32}$" }, integrationProfileRevision: DIGEST,
    capabilityId: { type: "string", pattern: "^kgcap_[0-9a-f]{32}$" }, capabilityRevision: DIGEST, schemaDigest: DIGEST,
    artifactKind: { enum: ["slides", "spreadsheet"] }, approvalRequired: { const: true }, replay: { enum: ["idempotency-key", "unsupported"] },
  },
};
const OWNER_EVIDENCE = {
  type: "object", additionalProperties: false, required: ["contractId", "ownerId", "revision", "digest"],
  properties: { contractId: { type: "string", minLength: 1, maxLength: 160 }, ownerId: ID, revision: { type: "string", minLength: 1, maxLength: 160 }, digest: DIGEST, integration: INTEGRATION },
};
const EVIDENCE = {
  type: "object", additionalProperties: false,
  properties: {
    renderer: { type: "string", minLength: 1, maxLength: 160 }, ownerContract: { type: "string", minLength: 1, maxLength: 160 }, paidProviderCalls: { type: "integer", minimum: 0, maximum: 1000000 }, externalCalls: { type: "integer", minimum: 0, maximum: 1000000 },
    actionDigest: DIGEST, cached: { type: "boolean" }, externalCallAttempted: { type: "boolean" }, cancellationRequested: { type: "boolean" }, reconciliationRequired: { type: "boolean" }, sideEffectDispatched: { type: "boolean" },
  },
};
const STEP = {
  type: "object", additionalProperties: false, required: ["nodeId", "status", "ownerId", "adapterId", "outputDigests", "evidence"],
  properties: { nodeId: ID, status: { const: "completed" }, ownerId: ID, adapterId: ID, outputDigests: { type: "object", maxProperties: 32, additionalProperties: DIGEST }, evidence: EVIDENCE },
};
const ERROR = { type: "object", additionalProperties: false, required: ["code", "message"], properties: { code: { ...ID, maxLength: 120 }, message: { type: "string", maxLength: 640 } } };
const DIAGNOSTIC = { type: "object", additionalProperties: false, required: ["code", "message"], properties: { code: ID, message: { type: "string", maxLength: 1000 }, nodeId: ID, port: ID, requested: COMPONENT_REF, component: COMPONENT_REF, availableRevisions: { type: "array", maxItems: 100, items: EXACT_REVISION }, migrations: { type: "array", maxItems: 0 } } };
const FAILURE = {
  type: "object", additionalProperties: false, required: ["ok", "error"],
  properties: {
    ok: { const: false }, error: ERROR, diagnostics: { type: "array", maxItems: 256, items: DIAGNOSTIC }, diagnosticsTruncated: { type: "boolean" }, nodeId: ID, port: ID,
    actualPlanDigest: DIGEST, schemaVersion: { type: "string" }, status: { enum: ["blocked", "approval_required"] }, planDigest: DIGEST, executionDigest: DIGEST,
    idempotencyKey: { type: "string" }, mode: { enum: ["dry-run", "live"] }, failedNodeId: ID, steps: { type: "array", maxItems: 64, items: STEP }, stepsTruncated: { type: "boolean" }, evidence: EVIDENCE, cached: { type: "boolean" },
  },
};
const CATALOG_COMPONENT = {
  type: "object", additionalProperties: false,
  required: ["id", "revision", "title", "description", "stability", "sourceDigest", "definitionDigest", "interfaceId", "interfaceRevision", "inputs", "outputs", "providedCapabilities", "requiredCapabilities", "ownerId", "riskClass", "readiness", "configSchema", "configSchemaDigest", "sideEffect", "replay", "adapter"],
  properties: {
    id: ID, revision: EXACT_REVISION, title: { type: "string" }, description: { type: "string" }, stability: { enum: ["experimental", "stable", "deprecated"] }, sourceDigest: DIGEST, definitionDigest: DIGEST,
    interfaceId: { type: "string" }, interfaceRevision: { type: "string" }, inputs: { type: "array", maxItems: 32, items: PORT }, outputs: { type: "array", maxItems: 32, items: PORT },
    providedCapabilities: { type: "array", maxItems: 32, items: CAPABILITY }, requiredCapabilities: { type: "array", maxItems: 32, items: CAPABILITY },
    ownerId: ID, riskClass: ID, readiness: ID, configSchema: { type: "object" }, configSchemaDigest: DIGEST, sideEffect: { enum: ["none", "external-write"] }, replay: { enum: ["safe", "idempotency-key"] }, adapter: ADAPTER,
  },
};
const CATALOG_SUCCESS = {
  type: "object", additionalProperties: false, required: ["ok", "schemaVersion", "catalogRevision", "catalogDigest", "adapterPolicyDigest", "components", "integrations"],
  properties: { ok: { const: true }, schemaVersion: { const: "agenticgraph.application-catalog-result/v1" }, catalogRevision: EXACT_REVISION, catalogDigest: DIGEST, adapterPolicyDigest: DIGEST, components: { type: "array", maxItems: 100, items: CATALOG_COMPONENT }, integrations: { type: "array", maxItems: 1000, items: INTEGRATION } },
};
const PLAN_NODE = {
  type: "object", additionalProperties: false,
  required: ["id", "component", "interfaceId", "interfaceRevision", "inputs", "outputs", "providedCapabilities", "requiredCapabilities", "ownerId", "riskClass", "readiness", "sideEffect", "replay", "ownerEvidence", "adapter"],
  properties: {
    id: ID, component: { type: "object", additionalProperties: false, required: ["id", "revision", "sourceDigest", "definitionDigest", "configSchemaDigest"], properties: { id: ID, revision: EXACT_REVISION, sourceDigest: DIGEST, definitionDigest: DIGEST, configSchemaDigest: DIGEST } },
    interfaceId: { type: "string" }, interfaceRevision: { type: "string" }, inputs: { type: "array", maxItems: 32, items: PORT }, outputs: { type: "array", maxItems: 32, items: PORT },
    providedCapabilities: { type: "array", maxItems: 32, items: CAPABILITY }, requiredCapabilities: { type: "array", maxItems: 32, items: CAPABILITY }, ownerId: ID, riskClass: ID, readiness: ID,
    sideEffect: { enum: ["none", "external-write"] }, replay: { enum: ["safe", "idempotency-key"] }, ownerEvidence: OWNER_EVIDENCE, adapter: ADAPTER,
  },
};
const PLAN = {
  type: "object", additionalProperties: false,
  required: ["schemaVersion", "mode", "invocation", "application", "source", "manifestDigest", "catalogDigest", "adapterPolicyDigest", "nodes", "edges", "entrypoints", "outputs", "executionOrder", "bounds", "planDigest"],
  properties: {
    schemaVersion: { const: "application-composition-plan/v1" }, mode: { enum: ["dry-run", "live"] }, invocation: APPLICATION_MANIFEST_SCHEMA.properties.invocation,
    application: APPLICATION_MANIFEST_SCHEMA.properties.application, source: APPLICATION_MANIFEST_SCHEMA.properties.source, manifestDigest: DIGEST, catalogDigest: DIGEST, adapterPolicyDigest: DIGEST,
    nodes: { type: "array", maxItems: 64, items: PLAN_NODE }, edges: APPLICATION_MANIFEST_SCHEMA.properties.edges, entrypoints: APPLICATION_MANIFEST_SCHEMA.properties.entrypoints,
    outputs: APPLICATION_MANIFEST_SCHEMA.properties.outputs, executionOrder: { type: "array", maxItems: 64, items: ID }, bounds: APPLICATION_MANIFEST_SCHEMA.properties.bounds, planDigest: DIGEST,
  },
};
const PLAN_SUCCESS = { type: "object", additionalProperties: false, required: ["ok", "plan"], properties: { ok: { const: true }, plan: PLAN } };
const EXECUTE_SUCCESS = {
  type: "object", additionalProperties: false, required: ["ok", "schemaVersion", "status", "planDigest", "executionDigest", "idempotencyKey", "mode", "steps", "outputs", "boundsEvidence"],
  properties: {
    ok: { const: true }, schemaVersion: { const: "agenticgraph.application-result/v1" }, status: { const: "completed" }, planDigest: DIGEST, executionDigest: DIGEST,
    idempotencyKey: { type: "string" }, mode: { enum: ["dry-run", "live"] }, steps: { type: "array", maxItems: 64, items: STEP },
    outputs: { type: "object", maxProperties: 64, additionalProperties: APPLICATION_VALUE_SCHEMA }, boundsEvidence: { type: "object", additionalProperties: false, required: ["steps", "runtimeMs", "outputBytes"], properties: { steps: { type: "integer", minimum: 0, maximum: 64 }, runtimeMs: { type: "integer", minimum: 0 }, outputBytes: { type: "integer", minimum: 0 } } }, cached: { type: "boolean" },
  },
};
const READ_ONLY = Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
const EXECUTE = Object.freeze({ readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true });

export function buildAgentApplicationToolDefinitions({ toolNames, withDefaults }) {
  return [
    withDefaults({ name: toolNames.applicationCatalog, description: "Use this when a local MCP host needs the bounded provider-neutral component and opaque integration catalog for exact agent or LLM application composition.", inputSchema: { $schema: DRAFT, type: "object", additionalProperties: false, properties: {} }, outputSchema: { $schema: DRAFT, type: "object", oneOf: [CATALOG_SUCCESS, FAILURE] } }, READ_ONLY),
    withDefaults({ name: toolNames.applicationPlan, description: "Use this when a local MCP host needs to validate and compile one source-backed exact-revision application manifest into an immutable zero-call dependency plan.", inputSchema: { $schema: DRAFT, type: "object", additionalProperties: false, required: ["manifest", "mode"], properties: { manifest: APPLICATION_MANIFEST_SCHEMA, mode: { enum: ["dry-run", "live"] } } }, outputSchema: { $schema: DRAFT, type: "object", oneOf: [PLAN_SUCCESS, FAILURE] } }, READ_ONLY),
    withDefaults({ name: toolNames.applicationExecute, description: "Use this when a local MCP host needs to revalidate and execute one exact digest-bound application plan through existing host-owned runtime adapters with bounded stop behavior.", inputSchema: { $schema: DRAFT, type: "object", additionalProperties: false, required: ["manifest", "expectedPlanDigest", "idempotencyKey", "mode"], properties: { manifest: APPLICATION_MANIFEST_SCHEMA, expectedPlanDigest: DIGEST, idempotencyKey: { type: "string", pattern: "^[A-Za-z0-9._:-]{8,128}$" }, mode: { enum: ["dry-run", "live"] } } }, outputSchema: { $schema: DRAFT, type: "object", oneOf: [EXECUTE_SUCCESS, FAILURE] } }, EXECUTE),
  ];
}
