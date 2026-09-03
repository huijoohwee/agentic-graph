import assert from "node:assert/strict";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  APPLICATION_COMPONENT_CATALOG_DIGEST,
  APPLICATION_INVOCATION,
  APPLICATION_MANIFEST_SCHEMA_ID,
  digestApplicationManifestSource,
  stableApplicationJson,
} from "../../contracts/agent-application.schema.js";
import { AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from "../../canvas/src/features/agent-ready/agentic-graph-local-mcp-tool-names.mjs";
import {
  createApplicationAdapterRegistry,
  createDefaultApplicationAdapterRegistry,
} from "../agent-application-adapter-registry.js";
import { createAgentApplicationRuntime } from "../agent-application-runtime.js";
import { buildAgentApplicationToolDefinitions } from "../agent-application-tool-contract.js";

const SHA = "a".repeat(64);
const INTEGRATION = Object.freeze({
  integrationProfileId: `kgip_${"1".repeat(32)}`,
  integrationProfileRevision: "2".repeat(64),
  capabilityId: `agenticOsap_${"3".repeat(32)}`,
  capabilityRevision: "4".repeat(64),
  schemaDigest: "5".repeat(64),
  artifactKind: "slides",
  approvalRequired: true,
  replay: "idempotency-key",
});
const GATEWAY_OWNER = Object.freeze({
  ownerId: "agentic-graph.external-tool-gateway",
  implementationRevision: "1.0.0",
  implementationDigest: "6".repeat(64),
});
const component = (id) => ({ id, revision: "1.0.0" });
const endpoint = (node, port) => ({ node, port });
const graphNode = (id, componentId, config) => ({ id, component: component(componentId), config });
const sealManifest = (manifest) => {
  manifest.source.sha256 = digestApplicationManifestSource(manifest);
  return manifest;
};
const makeManifest = ({ policyDigest, nodes, edges, entrypoints, outputs, id, maxOutputBytes = 1_048_576 }) => sealManifest({
  schemaVersion: APPLICATION_MANIFEST_SCHEMA_ID,
  invocation: structuredClone(APPLICATION_INVOCATION),
  application: { id, revision: "1.0.0" },
  source: { uri: `workspace:/${id}.json`, sha256: "0".repeat(64) },
  runtimeProof: { catalogDigest: APPLICATION_COMPONENT_CATALOG_DIGEST, adapterPolicyDigest: policyDigest },
  nodes,
  edges,
  entrypoints,
  outputs,
  bounds: { maxSteps: nodes.length, maxRuntimeMs: 5_000, maxOutputBytes },
});
const makePassThroughManifest = (policyDigest, maxOutputBytes = 1_048_576) => makeManifest({
  policyDigest,
  id: "hardening-pass-through",
  nodes: [graphNode("input", "core.input", { value: { kind: "text", value: "source" } }), graphNode("output", "core.output", {})],
  edges: [{ from: endpoint("input", "value"), to: endpoint("output", "value") }],
  entrypoints: [endpoint("input", "value")],
  outputs: [{ name: "result", node: "output", port: "result" }],
  maxOutputBytes,
});
const makeExternalManifest = (policyDigest, maxOutputBytes = 1_048_576) => makeManifest({
  policyDigest,
  id: "hardening-external",
  nodes: [
    graphNode("input", "core.input", { value: { kind: "artifact", value: { title: "Deck", content: "# Slide", contentType: "text/markdown" } } }),
    graphNode("external", "integration.external-artifact", {
      integrationProfileId: INTEGRATION.integrationProfileId,
      integrationProfileRevision: INTEGRATION.integrationProfileRevision,
      capabilityId: INTEGRATION.capabilityId,
      capabilityRevision: INTEGRATION.capabilityRevision,
    }),
    graphNode("output", "core.output", {}),
  ],
  edges: [
    { from: endpoint("input", "value"), to: endpoint("external", "artifact") },
    { from: endpoint("external", "receipt"), to: endpoint("output", "value") },
  ],
  entrypoints: [endpoint("input", "value")],
  outputs: [{ name: "result", node: "output", port: "result" }],
  maxOutputBytes,
});
const makeChainManifest = (policyDigest, count, maxOutputBytes) => {
  const nodes = [graphNode("input", "core.input", { value: { kind: "text", value: "source" } })];
  const edges = [];
  let prior = "input";
  let priorPort = "value";
  for (let index = 0; index < count - 2; index += 1) {
    const id = `prompt-${index}`;
    nodes.push(graphNode(id, "prompt.template", { template: "{{input}}" }));
    edges.push({ from: endpoint(prior, priorPort), to: endpoint(id, "input") });
    prior = id;
    priorPort = "prompt";
  }
  nodes.push(graphNode("output", "core.output", {}));
  edges.push({ from: endpoint(prior, priorPort), to: endpoint("output", "value") });
  return makeManifest({ policyDigest, id: `hardening-chain-${count}`, nodes, edges, entrypoints: [endpoint("input", "value")], outputs: [{ name: "result", node: "output", port: "result" }], maxOutputBytes });
};
const makeUnknownManifest = (policyDigest) => {
  const nodes = Array.from({ length: 64 }, (_, index) => graphNode(`missing-${index}`, "missing.component", {}));
  const edges = nodes.slice(1).map((entry, index) => ({ from: endpoint(nodes[index].id, "value"), to: endpoint(entry.id, "value") }));
  return makeManifest({ policyDigest, id: "hardening-unknown", nodes, edges, entrypoints: [endpoint(nodes[0].id, "value")], outputs: [{ name: "result", node: nodes.at(-1).id, port: "result" }], maxOutputBytes: 1_024 });
};

const makeGateway = (call = async () => { throw new Error("unexpected gateway call"); }) => Object.freeze({
  ownerEvidence: GATEWAY_OWNER,
  listApplicationIntegrations: () => [INTEGRATION],
  resolveApplicationIntegration: () => ({ ok: true, evidence: INTEGRATION }),
  validateApplicationArtifact: () => ({ ok: true, artifactDigest: SHA }),
  call,
});
const makeHarness = ({ call, resolveExternalApproval, executionLedger } = {}) => {
  const gateway = makeGateway(call);
  const adapterRegistry = createDefaultApplicationAdapterRegistry({ externalGateway: gateway, resolveExternalApproval });
  const ledger = executionLedger || new Map();
  return { gateway, adapterRegistry, ledger, runtime: createAgentApplicationRuntime({ adapterRegistry, executionLedger: ledger }) };
};
const executeArgs = (manifest, planned, idempotencyKey, mode = "dry-run") => ({ manifest, expectedPlanDigest: planned.plan.planDigest, idempotencyKey, mode });
const validators = Object.fromEntries(buildAgentApplicationToolDefinitions({ toolNames: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES, withDefaults: (definition) => definition }).map((definition) => [definition.name, new Ajv2020({ strict: false }).compile(definition.outputSchema)]));
const assertToolOutput = (toolName, value) => {
  const valid = validators[toolName](value);
  assert.equal(valid, true, JSON.stringify(validators[toolName].errors));
};
const assertBoundedExecute = (value, maxBytes = 1_024) => {
  assert.ok(Buffer.byteLength(stableApplicationJson(value)) <= maxBytes, `terminal output exceeded ${maxBytes} bytes`);
  assertToolOutput(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationExecute, value);
};
const rebuildRegistry = (base, adapters, resolveNodeOwnerEvidence = base.resolveNodeOwnerEvidence) => {
  const core = createApplicationAdapterRegistry(adapters, { preference: adapters.map((adapter) => adapter.id) });
  return Object.freeze({ ...core, integrations: base.integrations, resolveNodeOwnerEvidence });
};

test("execute bounds a 64-node planning failure before it leaves the MCP boundary", async () => {
  const { runtime, adapterRegistry } = makeHarness();
  const manifest = makeUnknownManifest(adapterRegistry.policyDigest);
  const result = await runtime.execute({ manifest, expectedPlanDigest: SHA, idempotencyKey: "unknown-bound-0001", mode: "dry-run" });
  assert.equal(result.error.code, "application_manifest_invalid");
  assert.equal(result.diagnosticsTruncated, true);
  assert.equal(result.cached, false);
  assertBoundedExecute(result);
});

test("a 41-node cumulative output failure truncates step diagnostics within its bound", async () => {
  const { runtime, adapterRegistry } = makeHarness();
  const manifest = makeChainManifest(adapterRegistry.policyDigest, 41, 1_024);
  const planned = runtime.plan({ manifest, mode: "dry-run" });
  assert.equal(planned.ok, true, JSON.stringify(planned));
  const result = await runtime.execute(executeArgs(manifest, planned, "chain-bound-0001"));
  assert.equal(result.error.code, "application_output_bound_exceeded");
  assert.equal(result.stepsTruncated, true);
  assertBoundedExecute(result);
});

test("caller cancellation before dispatch aborts approval and remains retry-safe", async () => {
  let startApproval;
  let releaseApproval;
  let approvalSignal;
  let gatewayCalls = 0;
  const approvalStarted = new Promise((resolve) => { startApproval = resolve; });
  const approvalGate = new Promise((resolve) => { releaseApproval = resolve; });
  const { runtime, adapterRegistry, ledger } = makeHarness({
    call: async () => { gatewayCalls += 1; return { ok: false, error: { code: "unexpected", message: "unexpected" } }; },
    resolveExternalApproval: async ({ signal }) => { approvalSignal = signal; startApproval(); return approvalGate; },
  });
  const manifest = makeExternalManifest(adapterRegistry.policyDigest);
  const planned = runtime.plan({ manifest, mode: "live" });
  const caller = new AbortController();
  const execution = runtime.execute(executeArgs(manifest, planned, "caller-cancel-pre-0001", "live"), { signal: caller.signal });
  await approvalStarted;
  caller.abort(new Error("private caller reason"));
  const result = await execution;
  assert.equal(result.error.code, "application_cancelled");
  assert.deepEqual(result.evidence, { cancellationRequested: true, reconciliationRequired: false, sideEffectDispatched: false });
  assert.equal(approvalSignal.aborted, true);
  assert.equal(ledger.get("caller-cancel-pre-0001").protected, false);
  assertToolOutput(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationExecute, result);
  releaseApproval({ hostOwnedApproval: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gatewayCalls, 0);
});

test("a pre-aborted caller is rejected before planning invokes an extension", async () => {
  const base = makeHarness();
  const manifest = makePassThroughManifest(base.adapterRegistry.policyDigest);
  const planned = base.runtime.plan({ manifest, mode: "dry-run" });
  let resolutions = 0;
  const hostileRegistry = Object.freeze({
    ...base.adapterRegistry,
    resolve: (...args) => { resolutions += 1; return base.adapterRegistry.resolve(...args); },
  });
  const caller = new AbortController();
  caller.abort(new Error("PRIVATE_CANCEL_REASON"));
  const result = await createAgentApplicationRuntime({ adapterRegistry: hostileRegistry }).execute(executeArgs(manifest, planned, "pre-aborted-0001"), { signal: caller.signal });
  assert.equal(result.error.code, "application_cancelled");
  assert.deepEqual(result.evidence, { cancellationRequested: true, reconciliationRequired: false, sideEffectDispatched: false });
  assert.equal(resolutions, 0);
  assert.equal(stableApplicationJson(result).includes("PRIVATE_CANCEL_REASON"), false);
  assertToolOutput(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationExecute, result);
});

test("caller cancellation after dispatch returns promptly and protects reconciliation", async () => {
  let signalDispatch;
  let releaseGateway;
  let gatewayCalls = 0;
  const dispatched = new Promise((resolve) => { signalDispatch = resolve; });
  const gatewayGate = new Promise((resolve) => { releaseGateway = resolve; });
  const { runtime, adapterRegistry, ledger } = makeHarness({
    resolveExternalApproval: async () => ({ hostOwnedApproval: true }),
    call: async (args, context) => { gatewayCalls += 1; context.markSideEffectDispatched("b".repeat(64)); signalDispatch(); return gatewayGate; },
  });
  const manifest = makeExternalManifest(adapterRegistry.policyDigest);
  const planned = runtime.plan({ manifest, mode: "live" });
  const caller = new AbortController();
  const execution = runtime.execute(executeArgs(manifest, planned, "caller-cancel-post-0001", "live"), { signal: caller.signal });
  await dispatched;
  caller.abort();
  const result = await execution;
  assert.equal(result.error.code, "application_cancelled");
  assert.deepEqual(result.evidence, { actionDigest: "b".repeat(64), cancellationRequested: true, externalCallAttempted: true, reconciliationRequired: true, sideEffectDispatched: true });
  assert.equal(ledger.get("caller-cancel-post-0001").protected, true);
  assert.equal(gatewayCalls, 1);
  assertToolOutput(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationExecute, result);
  releaseGateway({ ok: false, actionDigest: "b".repeat(64), error: { code: "external_mcp_call_failed", message: "late" } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gatewayCalls, 1);
});

test("post-dispatch output overflow remains protected and replay does not repeat egress", async () => {
  let gatewayCalls = 0;
  const { runtime, adapterRegistry, ledger } = makeHarness({
    resolveExternalApproval: async () => ({ hostOwnedApproval: true }),
    call: async (args, context) => {
      gatewayCalls += 1;
      context.markSideEffectDispatched("c".repeat(64));
      return { ok: true, cached: false, actionDigest: "c".repeat(64), receipt: { id: "receipt", detail: "x".repeat(5_000) } };
    },
  });
  const manifest = makeExternalManifest(adapterRegistry.policyDigest, 1_024);
  const planned = runtime.plan({ manifest, mode: "live" });
  const args = executeArgs(manifest, planned, "dispatch-bound-0001", "live");
  const first = await runtime.execute(args);
  assert.equal(first.error.code, "application_output_bound_exceeded");
  assert.deepEqual(first.evidence, { actionDigest: "c".repeat(64), externalCallAttempted: true, reconciliationRequired: true, sideEffectDispatched: true });
  assert.equal(ledger.get("dispatch-bound-0001").protected, true);
  assertBoundedExecute(first);
  const replay = await runtime.execute(structuredClone(args));
  assert.equal(replay.cached, true);
  assert.equal(gatewayCalls, 1);
  assertBoundedExecute(replay);
});

test("gateway preflight failures stay unprotected until the mutation marker fires", async () => {
  for (const [index, code] of ["approval_invalid_signature", "upstream_schema_changed"].entries()) {
    const ledger = new Map();
    const { runtime, adapterRegistry } = makeHarness({
      executionLedger: ledger,
      resolveExternalApproval: async () => ({ hostOwnedApproval: true }),
      call: async () => ({ ok: false, actionDigest: "d".repeat(64), error: { code, message: "private gateway detail" } }),
    });
    const manifest = makeExternalManifest(adapterRegistry.policyDigest);
    const planned = runtime.plan({ manifest, mode: "live" });
    const key = `preflight-safe-000${index}`;
    const result = await runtime.execute(executeArgs(manifest, planned, key, "live"));
    assert.equal(result.error.code, code);
    assert.equal(result.evidence.sideEffectDispatched, undefined);
    assert.equal(result.evidence.reconciliationRequired, undefined);
    assert.equal(ledger.get(key).protected, false);
    assert.equal(stableApplicationJson(result).includes("private gateway detail"), false);
    assertToolOutput(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationExecute, result);
  }
});

test("a truthy non-boolean gateway replay marker cannot masquerade as a cache hit", async () => {
  const ledger = new Map();
  const { runtime, adapterRegistry } = makeHarness({
    executionLedger: ledger,
    resolveExternalApproval: async () => ({ hostOwnedApproval: true }),
    call: async () => ({ ok: true, cached: "false", actionDigest: "d".repeat(64), receipt: { id: "untrusted" } }),
  });
  const manifest = makeExternalManifest(adapterRegistry.policyDigest);
  const planned = runtime.plan({ manifest, mode: "live" });
  const result = await runtime.execute(executeArgs(manifest, planned, "invalid-cache-0001", "live"));
  assert.equal(result.error.code, "external_mcp_call_failed");
  assert.equal(ledger.get("invalid-cache-0001").protected, false);
  assertToolOutput(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationExecute, result);
});

test("hostile adapter failures and evidence are projected through a closed public contract", async () => {
  const base = makeHarness();
  const adapters = base.adapterRegistry.adapters.map((adapter) => adapter.adapterKind === "core.input" ? {
    ...adapter,
    execute: async () => ({ ok: false, status: "blocked", error: { code: "__proto__", message: "PRIVATE_OWNER_MESSAGE" }, evidence: { renderer: "literal/v1", privateToken: "PRIVATE_EVIDENCE", paidProviderCalls: 9_999_999_999 } }),
  } : adapter);
  const registry = rebuildRegistry(base.adapterRegistry, adapters);
  const runtime = createAgentApplicationRuntime({ adapterRegistry: registry });
  const manifest = makePassThroughManifest(registry.policyDigest);
  const planned = runtime.plan({ manifest, mode: "dry-run" });
  const result = await runtime.execute(executeArgs(manifest, planned, "hostile-adapter-0001"));
  assert.equal(result.error.code, "component_execution_blocked");
  assert.deepEqual(result.evidence, { renderer: "literal/v1" });
  const serialized = stableApplicationJson(result);
  for (const secret of ["__proto__", "PRIVATE_OWNER_MESSAGE", "PRIVATE_EVIDENCE", "privateToken"]) assert.equal(serialized.includes(secret), false);
  assert.equal(Object.isFrozen(Object.prototype), false);
  assertToolOutput(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationExecute, result);
});

test("catalog and plan reject hostile extension metadata without reflecting it", () => {
  const base = makeHarness();
  const integrationSecret = "PRIVATE_INTEGRATION_SECRET";
  const integrationRegistry = Object.freeze({ ...base.adapterRegistry, integrations: [{ ...INTEGRATION, privateToken: integrationSecret }] });
  const catalog = createAgentApplicationRuntime({ adapterRegistry: integrationRegistry }).catalog({});
  assert.equal(catalog.error.code, "integration_catalog_invalid");
  assert.equal(stableApplicationJson(catalog).includes(integrationSecret), false);
  assertToolOutput(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationCatalog, catalog);

  const sparseIntegrations = [];
  sparseIntegrations.length = 1;
  sparseIntegrations.privateToken = integrationSecret;
  const sparseRegistry = Object.freeze({ ...base.adapterRegistry, integrations: sparseIntegrations });
  const sparseCatalog = createAgentApplicationRuntime({ adapterRegistry: sparseRegistry }).catalog({});
  assert.equal(sparseCatalog.error.code, "integration_catalog_invalid");
  assertToolOutput(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationCatalog, sparseCatalog);
  const missingRegistry = Object.freeze({ ...base.adapterRegistry, integrations: undefined });
  assert.equal(createAgentApplicationRuntime({ adapterRegistry: missingRegistry }).catalog({}).error.code, "integration_catalog_invalid");

  const adapterSecret = "PRIVATE_ADAPTER_SECRET";
  const adapterRegistry = Object.freeze({
    ...base.adapterRegistry,
    resolve: (componentValue, mode) => {
      const result = base.adapterRegistry.resolve(componentValue, mode);
      return componentValue.id === "core.input" ? { ok: true, adapter: { ...result.adapter, supportedComponents: [{ ...result.adapter.supportedComponents[0], privateToken: adapterSecret }] } } : result;
    },
  });
  const adapterCatalog = createAgentApplicationRuntime({ adapterRegistry }).catalog({});
  assert.equal(adapterCatalog.error.code, "adapter_evidence_invalid");
  assert.equal(stableApplicationJson(adapterCatalog).includes(adapterSecret), false);
  assertToolOutput(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationCatalog, adapterCatalog);

  const ownerSecret = "PRIVATE_OWNER_EVIDENCE";
  const ownerRegistry = Object.freeze({
    ...base.adapterRegistry,
    resolveNodeOwnerEvidence: (node, componentValue, adapter) => {
      const result = base.adapterRegistry.resolveNodeOwnerEvidence(node, componentValue, adapter);
      return { ok: true, evidence: { ...result.evidence, privateToken: ownerSecret } };
    },
  });
  const ownerRuntime = createAgentApplicationRuntime({ adapterRegistry: ownerRegistry });
  const manifest = makePassThroughManifest(ownerRegistry.policyDigest);
  const ownerPlan = ownerRuntime.plan({ manifest, mode: "dry-run" });
  assert.equal(ownerPlan.error.code, "owner_evidence_invalid");
  assert.equal(stableApplicationJson(ownerPlan).includes(ownerSecret), false);
  assertToolOutput(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationPlan, ownerPlan);
});

test("execute re-resolves owner evidence before every step and stops owner drift", async () => {
  const base = makeHarness();
  let drift = false;
  let outputExecutions = 0;
  const adapters = base.adapterRegistry.adapters.map((adapter) => adapter.adapterKind === "core.input" ? {
    ...adapter,
    execute: async (args) => { const result = await adapter.execute(args); drift = true; return result; },
  } : adapter.adapterKind === "core.output" ? {
    ...adapter,
    execute: async (args) => { outputExecutions += 1; return adapter.execute(args); },
  } : adapter);
  let registry;
  const core = createApplicationAdapterRegistry(adapters, { preference: adapters.map((adapter) => adapter.id) });
  registry = Object.freeze({
    ...core,
    integrations: base.adapterRegistry.integrations,
    resolveNodeOwnerEvidence: (node, componentValue, adapter) => {
      const result = base.adapterRegistry.resolveNodeOwnerEvidence(node, componentValue, adapter);
      return drift && node.id === "output" ? { ok: true, evidence: { ...result.evidence, digest: "e".repeat(64) } } : result;
    },
  });
  const runtime = createAgentApplicationRuntime({ adapterRegistry: registry });
  const manifest = makePassThroughManifest(registry.policyDigest);
  const planned = runtime.plan({ manifest, mode: "dry-run" });
  assert.equal(planned.ok, true);
  const result = await runtime.execute(executeArgs(manifest, planned, "owner-drift-0001"));
  assert.equal(result.error.code, "planned_owner_drift");
  assert.equal(outputExecutions, 0);
  assertToolOutput(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.applicationExecute, result);
});
