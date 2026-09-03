import assert from "node:assert/strict";
import test from "node:test";

import {
  APPLICATION_ADAPTER_INTERFACE_REVISION,
  APPLICATION_COMPONENT_CATALOG,
  APPLICATION_COMPONENT_CATALOG_DIGEST,
  APPLICATION_INVOCATION,
  APPLICATION_MANIFEST_SCHEMA_ID,
  digestApplicationManifestSource,
  stableApplicationJson,
} from "../../contracts/agent-application.schema.js";
import {
  createApplicationAdapterRegistry,
  createDefaultApplicationAdapterRegistry,
} from "../agent-application-adapter-registry.js";
import { createAgentApplicationRuntime } from "../agent-application-runtime.js";
import { createExternalToolGatewayRuntime } from "../external-tool-gateway-runtime.js";
import {
  computeExternalToolSchemaDigest,
  loadExternalToolProfileRegistry,
} from "../external-tool-profile-registry.js";

const PRIVATE_PROFILE_ID = "private-slides-host";
const PRIVATE_TRANSPORT_URL = "https://private-provider.example/mcp";
const PRIVATE_TOOL_NAME = "create_private_deck";
const PRIVATE_CONSTANT = "private-tenant-folder";
const UPSTREAM_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["deck_title", "markdown", "tenant_folder", "request_id"],
  properties: {
    deck_title: { type: "string", minLength: 1 },
    markdown: { type: "string", minLength: 1 },
    tenant_folder: { type: "string", const: PRIVATE_CONSTANT },
    request_id: { type: "string", minLength: 8 },
  },
});
const PROFILE = Object.freeze({
  id: PRIVATE_PROFILE_ID,
  label: "Private Slides Host",
  transport: { type: "streamable-http", url: PRIVATE_TRANSPORT_URL, timeoutMs: 5_000 },
  tools: [{
    name: PRIVATE_TOOL_NAME,
    label: "Create private deck",
    artifactKind: "slides",
    upstreamInputSchemaDigest: computeExternalToolSchemaDigest(UPSTREAM_SCHEMA),
    argumentMapping: { title: "deck_title", content: "markdown" },
    constantArguments: { tenant_folder: PRIVATE_CONSTANT },
    idempotencyArgumentName: "request_id",
    result: {
      idPointer: "/structuredContent/id",
      urlPointer: "/structuredContent/url",
      titlePointer: "/structuredContent/title",
      mimeType: "application/vnd.example.presentation",
      allowedOrigins: ["https://docs.example.com"],
    },
  }],
});

const component = (id) => ({ id, revision: "1.0.0" });
const endpoint = (node, port) => ({ node, port });
const node = (id, componentId, config) => ({ id, component: component(componentId), config });
const sealManifest = (manifest) => {
  manifest.source.sha256 = digestApplicationManifestSource(manifest);
  return manifest;
};
const makeManifest = ({ policyDigest, nodes, edges, entrypoints, outputs, id }) => sealManifest({
  schemaVersion: APPLICATION_MANIFEST_SCHEMA_ID,
  invocation: structuredClone(APPLICATION_INVOCATION),
  application: { id, revision: "1.0.0" },
  source: { uri: `workspace:/${id}.json`, sha256: "0".repeat(64) },
  runtimeProof: { catalogDigest: APPLICATION_COMPONENT_CATALOG_DIGEST, adapterPolicyDigest: policyDigest },
  nodes,
  edges,
  entrypoints,
  outputs,
  bounds: { maxSteps: nodes.length, maxRuntimeMs: 5_000, maxOutputBytes: 1_048_576 },
});
const makePassThroughManifest = (policyDigest, value = { kind: "text", value: "private manifest config" }) => makeManifest({
  policyDigest,
  id: "pass-through-app",
  nodes: [node("input", "core.input", { value }), node("output", "core.output", {})],
  edges: [{ from: endpoint("input", "value"), to: endpoint("output", "value") }],
  entrypoints: [endpoint("input", "value")],
  outputs: [{ name: "result", node: "output", port: "result" }],
});
const makeAgentManifest = (policyDigest) => makeManifest({
  policyDigest,
  id: "offline-agent-app",
  nodes: [
    node("input", "core.input", { value: { kind: "text", value: "Assess this SME profile without a provider call." } }),
    node("agent", "agent.registered", { agentDefinitionId: "agent.sme-care" }),
    node("output", "core.output", {}),
  ],
  edges: [
    { from: endpoint("input", "value"), to: endpoint("agent", "prompt") },
    { from: endpoint("agent", "plan"), to: endpoint("output", "value") },
  ],
  entrypoints: [endpoint("input", "value")],
  outputs: [{ name: "result", node: "output", port: "result" }],
});
const makePromptManifest = (policyDigest) => makeManifest({
  policyDigest,
  id: "failure-stop-app",
  nodes: [
    node("input", "core.input", { value: { kind: "text", value: "source" } }),
    node("prompt", "prompt.template", { template: "Review: {{input}}" }),
    node("output", "core.output", {}),
  ],
  edges: [
    { from: endpoint("input", "value"), to: endpoint("prompt", "input") },
    { from: endpoint("prompt", "prompt"), to: endpoint("output", "value") },
  ],
  entrypoints: [endpoint("input", "value")],
  outputs: [{ name: "result", node: "output", port: "result" }],
});
const makeExternalManifest = (policyDigest, integration) => makeManifest({
  policyDigest,
  id: "approval-gated-external-app",
  nodes: [
    node("input", "core.input", { value: { kind: "artifact", value: { title: "Deck", content: "# Slide", contentType: "text/markdown" } } }),
    node("external", "integration.external-artifact", {
      integrationProfileId: integration.integrationProfileId,
      integrationProfileRevision: integration.integrationProfileRevision,
      capabilityId: integration.capabilityId,
      capabilityRevision: integration.capabilityRevision,
    }),
    node("output", "core.output", {}),
  ],
  edges: [
    { from: endpoint("input", "value"), to: endpoint("external", "artifact") },
    { from: endpoint("external", "receipt"), to: endpoint("output", "value") },
  ],
  entrypoints: [endpoint("input", "value")],
  outputs: [{ name: "result", node: "output", port: "result" }],
});

const makeGatewayHarness = () => {
  const registry = loadExternalToolProfileRegistry({
    env: { NODE_ENV: "test" },
    rawProfilesJson: JSON.stringify({ profiles: [PROFILE] }),
  });
  const inner = createExternalToolGatewayRuntime({
    registry,
    createSession: async () => { throw new Error("external connection must not occur in these tests"); },
  });
  let calls = 0;
  const gateway = Object.freeze({
    ...inner,
    call: async (args, context) => { calls += 1; return inner.call(args, context); },
  });
  return { gateway, callCount: () => calls };
};
const makeRuntimeHarness = (options = {}) => {
  const gatewayHarness = makeGatewayHarness();
  const adapterRegistry = createDefaultApplicationAdapterRegistry({ externalGateway: gatewayHarness.gateway, ...options });
  const runtime = createAgentApplicationRuntime({ adapterRegistry });
  return { ...gatewayHarness, adapterRegistry, runtime };
};
const modePlan = (runtime, manifest, mode = "dry-run") => runtime.plan({ manifest, mode });

test("catalog and deterministic plan expose bounded public evidence without private runtime configuration", () => {
  const { runtime, adapterRegistry } = makeRuntimeHarness();
  const catalog = runtime.catalog();
  assert.equal(catalog.ok, true);
  const catalogJson = stableApplicationJson(catalog);
  for (const secret of [PRIVATE_PROFILE_ID, PRIVATE_TRANSPORT_URL, PRIVATE_TOOL_NAME, PRIVATE_CONSTANT]) assert.equal(catalogJson.includes(secret), false, `catalog leaked ${secret}`);
  assert.equal(catalogJson.includes('"transport"'), false);
  assert.equal(catalogJson.includes('"source":"'), false);

  const manifest = makePassThroughManifest(adapterRegistry.policyDigest);
  const first = modePlan(runtime, manifest);
  const second = modePlan(runtime, structuredClone(manifest));
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(stableApplicationJson(first), stableApplicationJson(second));
  assert.match(first.plan.planDigest, /^[0-9a-f]{64}$/);
  const planJson = stableApplicationJson(first.plan);
  assert.equal(planJson.includes("private manifest config"), false);
  for (const forbidden of ['"config"', '"configSchema"', '"$schema"', '"properties"', PRIVATE_TRANSPORT_URL]) assert.equal(planJson.includes(forbidden), false, `plan leaked ${forbidden}`);

  const permuted = structuredClone(manifest);
  permuted.nodes.reverse();
  sealManifest(permuted);
  const permutationPlan = modePlan(runtime, permuted);
  assert.equal(permutationPlan.ok, true);
  assert.equal(permutationPlan.plan.planDigest, first.plan.planDigest);

  const live = modePlan(runtime, manifest, "live");
  assert.equal(live.ok, true);
  assert.equal(live.plan.mode, "live");
  assert.notEqual(live.plan.planDigest, first.plan.planDigest, "execution mode must be plan-digest bound");
});

test("catalog rejects every non-empty argument object", () => {
  const { runtime } = makeRuntimeHarness();
  assert.equal(runtime.catalog({ unexpected: true }).error.code, "invalid_catalog_input");
  assert.equal(runtime.run("agentic-graph.application.catalog", { unexpected: true }).error.code, "invalid_catalog_input");
});

test("adapter registry rejects unsupported interface and resolves component revisions exactly", () => {
  const { adapterRegistry } = makeRuntimeHarness();
  const descriptor = { ...adapterRegistry.adapters[0], interfaceRevision: `${APPLICATION_ADAPTER_INTERFACE_REVISION}.unsupported` };
  assert.throws(() => createApplicationAdapterRegistry([descriptor]), /unsupported interface/);

  const exactComponent = APPLICATION_COMPONENT_CATALOG.components.find((entry) => entry.id === "core.input");
  assert.equal(adapterRegistry.resolve(exactComponent, "dry-run").ok, true);
  const drifted = structuredClone(exactComponent);
  drifted.revision = "1.0.1";
  const resolution = adapterRegistry.resolve(drifted, "dry-run");
  assert.equal(resolution.ok, false);
  assert.equal(resolution.error.code, "component_adapter_unavailable");

  const inputAdapter = adapterRegistry.adapters.find((adapter) => adapter.adapterKind === "core.input");
  const alternate = { ...inputAdapter, id: `${inputAdapter.id}.alternate` };
  const ambiguous = createApplicationAdapterRegistry([inputAdapter, alternate]);
  assert.equal(ambiguous.resolve(exactComponent, "dry-run").error.code, "component_adapter_ambiguous");

  assert.throws(() => createApplicationAdapterRegistry([{ ...inputAdapter, supportedComponents: Array.from({ length: 33 }, (_, index) => ({ id: `component-${index}`, revision: "1.0.0" })) }]), /at most 32/);
  assert.throws(() => createApplicationAdapterRegistry([{ ...inputAdapter, capabilities: Array.from({ length: 33 }, (_, index) => ({ id: `capability-${index}`, revision: "v1" })) }]), /at most 32/);
  assert.throws(() => createApplicationAdapterRegistry([{ ...inputAdapter, supportedModes: ["dry-run", "live", "dry-run"] }]), /invalid supported modes/);
  assert.throws(() => createApplicationAdapterRegistry([{ ...inputAdapter, id: null, adapterKind: null, ownerId: null, capabilities: [{ id: null, revision: null }] }]), /identity is invalid/);
  assert.throws(() => createApplicationAdapterRegistry([Object.create(inputAdapter)]), /own-data descriptor/);
  const sparseRefs = [];
  sparseRefs.length = 1;
  sparseRefs.privateRef = { id: "core.input", revision: "1.0.0" };
  assert.throws(() => createApplicationAdapterRegistry([{ ...inputAdapter, supportedComponents: sparseRefs }]), /exact non-empty data array/);
});

test("execution replans and rejects manifest drift before any component or gateway call", async () => {
  const { runtime, adapterRegistry, callCount } = makeRuntimeHarness();
  const manifest = makePassThroughManifest(adapterRegistry.policyDigest);
  const planned = modePlan(runtime, manifest);
  assert.equal(planned.ok, true);
  const drifted = structuredClone(manifest);
  drifted.nodes[0].config.value.value = "changed after planning";
  sealManifest(drifted);
  const result = await runtime.execute({ manifest: drifted, expectedPlanDigest: planned.plan.planDigest, idempotencyKey: "replan-drift-0001", mode: "dry-run" });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "application_plan_drift");
  assert.equal(callCount(), 0);

  const modeUpgrade = await runtime.execute({ manifest, expectedPlanDigest: planned.plan.planDigest, idempotencyKey: "mode-upgrade-0001", mode: "live" });
  assert.equal(modeUpgrade.error.code, "application_plan_drift");
  assert.equal(callCount(), 0);
});

test("execute blocks exact planned-adapter drift before invoking the changed adapter", async () => {
  const base = makeRuntimeHarness();
  const manifest = makePassThroughManifest(base.adapterRegistry.policyDigest);
  const expected = modePlan(base.runtime, manifest);
  let inputResolutions = 0;
  const statefulRegistry = Object.freeze({
    ...base.adapterRegistry,
    resolve: (componentValue, mode) => {
      const resolved = base.adapterRegistry.resolve(componentValue, mode);
      if (componentValue.id !== "core.input" || !mode || ++inputResolutions === 1) return resolved;
      return { ok: true, adapter: Object.freeze({ ...resolved.adapter, implementationDigest: "e".repeat(64), execute: async () => { throw new Error("drifted adapter must not execute"); } }) };
    },
  });
  const runtime = createAgentApplicationRuntime({ adapterRegistry: statefulRegistry });
  const result = await runtime.execute({ manifest, expectedPlanDigest: expected.plan.planDigest, idempotencyKey: "adapter-drift-0001", mode: "dry-run" });
  assert.equal(result.error.code, "planned_adapter_drift");
});

test("output byte bounds stop admission before downstream execution", async () => {
  const { runtime, adapterRegistry } = makeRuntimeHarness();
  const manifest = makePassThroughManifest(adapterRegistry.policyDigest, { kind: "text", value: "x".repeat(2_000) });
  manifest.bounds.maxOutputBytes = 1_024;
  sealManifest(manifest);
  const planned = modePlan(runtime, manifest);
  const result = await runtime.execute({ manifest, expectedPlanDigest: planned.plan.planDigest, idempotencyKey: "output-bound-0001", mode: "dry-run" });
  assert.equal(result.error.code, "application_output_bound_exceeded");
  assert.equal(result.steps.length, 0);
});

test("offline registered-agent execution performs zero provider calls and replays by idempotency", async () => {
  const { runtime, adapterRegistry, callCount } = makeRuntimeHarness();
  const manifest = makeAgentManifest(adapterRegistry.policyDigest);
  const planned = modePlan(runtime, manifest);
  assert.equal(planned.ok, true, JSON.stringify(planned));
  const args = { manifest, expectedPlanDigest: planned.plan.planDigest, idempotencyKey: "offline-agent-0001", mode: "dry-run" };
  const first = await runtime.execute(args);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.status, "completed");
  assert.equal(first.outputs.result.kind, "agent-plan");
  assert.equal(first.outputs.result.value.status, "planned");
  assert.equal(first.outputs.result.value.budgetMeters.paidProviderCalls, 0);
  assert.equal(first.steps.find((step) => step.nodeId === "agent").evidence.paidProviderCalls, 0);
  assert.equal(callCount(), 0);

  const second = await runtime.execute(structuredClone(args));
  assert.equal(second.ok, true);
  assert.equal(second.cached, true);
  assert.equal(second.executionDigest, first.executionDigest);
  assert.deepEqual(second.outputs, first.outputs);
  assert.equal(callCount(), 0);
});

test("component failure stops the graph and cached replay never retries", async () => {
  const base = makeRuntimeHarness();
  const attempts = new Map();
  const adapters = base.adapterRegistry.adapters.map((adapter) => ({
    ...adapter,
    execute: async (args) => {
      attempts.set(adapter.adapterKind, (attempts.get(adapter.adapterKind) || 0) + 1);
      if (adapter.adapterKind === "prompt.template") throw new Error("private adapter failure detail");
      return adapter.execute(args);
    },
  }));
  const registryCore = createApplicationAdapterRegistry(adapters, { preference: adapters.map((adapter) => adapter.id) });
  const adapterRegistry = Object.freeze({
    ...registryCore,
    integrations: base.adapterRegistry.integrations,
    resolveNodeOwnerEvidence: base.adapterRegistry.resolveNodeOwnerEvidence,
  });
  const runtime = createAgentApplicationRuntime({ adapterRegistry });
  const manifest = makePromptManifest(adapterRegistry.policyDigest);
  const planned = modePlan(runtime, manifest);
  assert.equal(planned.ok, true, JSON.stringify(planned));
  const args = { manifest, expectedPlanDigest: planned.plan.planDigest, idempotencyKey: "failure-stop-0001", mode: "dry-run" };
  const first = await runtime.execute(args);
  assert.equal(first.ok, false);
  assert.equal(first.error.code, "component_execution_failed");
  assert.equal(stableApplicationJson(first).includes("private adapter failure detail"), false);
  assert.equal(attempts.get("core.input"), 1);
  assert.equal(attempts.get("prompt.template"), 1);
  assert.equal(attempts.has("core.output"), false);

  const second = await runtime.execute(structuredClone(args));
  assert.equal(second.ok, false);
  assert.equal(second.cached, true);
  assert.equal(attempts.get("core.input"), 1);
  assert.equal(attempts.get("prompt.template"), 1);
  assert.equal(attempts.has("core.output"), false);
});

test("missing external owner approval blocks before the gateway call", async () => {
  const { runtime, adapterRegistry, gateway, callCount } = makeRuntimeHarness();
  const integration = gateway.listApplicationIntegrations()[0];
  assert.ok(integration);
  const manifest = makeExternalManifest(adapterRegistry.policyDigest, integration);
  const planned = modePlan(runtime, manifest, "live");
  assert.equal(planned.ok, true, JSON.stringify(planned));
  const result = await runtime.execute({ manifest, expectedPlanDigest: planned.plan.planDigest, idempotencyKey: "external-approval-0001", mode: "live" });
  assert.equal(result.ok, false);
  assert.equal(result.status, "approval_required");
  assert.equal(result.error.code, "approval_required");
  assert.equal(result.failedNodeId, "external");
  assert.equal(callCount(), 0);
  assert.equal(result.steps.some((step) => step.nodeId === "output"), false);
});

test("dry-run validates canonical external artifacts without gateway egress", async () => {
  const { runtime, adapterRegistry, gateway, callCount } = makeRuntimeHarness();
  const manifest = makeExternalManifest(adapterRegistry.policyDigest, gateway.listApplicationIntegrations()[0]);
  manifest.nodes.find((entry) => entry.id === "input").config.value.value = { title: "Missing canonical content fields" };
  sealManifest(manifest);
  const planned = modePlan(runtime, manifest, "dry-run");
  const result = await runtime.execute({ manifest, expectedPlanDigest: planned.plan.planDigest, idempotencyKey: "invalid-artifact-0001", mode: "dry-run" });
  assert.equal(result.error.code, "invalid_artifact");
  assert.equal(callCount(), 0);
});

test("pre-call approval blocks expire while attempted external failures remain protected", async () => {
  const originalNow = Date.now;
  let now = 1_900_000_000_000;
  Date.now = () => now;
  try {
    const base = makeGatewayHarness();
    const approvalRegistry = createDefaultApplicationAdapterRegistry({ externalGateway: base.gateway });
    const approvalLedger = new Map();
    const approvalRuntime = createAgentApplicationRuntime({
      adapterRegistry: approvalRegistry,
      executionLedger: approvalLedger,
      maxLedgerEntries: 1,
      ledgerTtlMs: 60_000,
    });
    const integration = base.gateway.listApplicationIntegrations()[0];
    const approvalManifest = makeExternalManifest(approvalRegistry.policyDigest, integration);
    const approvalPlan = modePlan(approvalRuntime, approvalManifest, "live");
    assert.equal(approvalPlan.ok, true);

    const first = await approvalRuntime.execute({ manifest: approvalManifest, expectedPlanDigest: approvalPlan.plan.planDigest, idempotencyKey: "approval-ledger-0001", mode: "live" });
    assert.equal(first.error.code, "approval_required");
    assert.equal(base.callCount(), 0);
    assert.equal(approvalLedger.get("approval-ledger-0001").protected, false);

    now += 60_001;
    const second = await approvalRuntime.execute({ manifest: approvalManifest, expectedPlanDigest: approvalPlan.plan.planDigest, idempotencyKey: "approval-ledger-0002", mode: "live" });
    assert.equal(second.error.code, "approval_required");
    assert.equal(base.callCount(), 0);
    assert.equal(approvalLedger.has("approval-ledger-0001"), false);
    assert.equal(approvalLedger.get("approval-ledger-0002").protected, false);

    let attemptedCalls = 0;
    const attemptedGateway = Object.freeze({
      ...base.gateway,
      call: async (args, context) => {
        attemptedCalls += 1;
        context.markSideEffectDispatched("f".repeat(64));
        return { ok: false, actionDigest: "f".repeat(64), error: { code: "external_mcp_call_failed", message: "External MCP invocation failed without exposing upstream details." } };
      },
    });
    const attemptedRegistry = createDefaultApplicationAdapterRegistry({
      externalGateway: attemptedGateway,
      resolveExternalApproval: async () => ({ hostOwnedApproval: true }),
    });
    const attemptedLedger = new Map();
    const attemptedRuntime = createAgentApplicationRuntime({
      adapterRegistry: attemptedRegistry,
      executionLedger: attemptedLedger,
      maxLedgerEntries: 1,
      ledgerTtlMs: 60_000,
    });
    const attemptedManifest = makeExternalManifest(attemptedRegistry.policyDigest, integration);
    const attemptedPlan = modePlan(attemptedRuntime, attemptedManifest, "live");
    const attempted = await attemptedRuntime.execute({ manifest: attemptedManifest, expectedPlanDigest: attemptedPlan.plan.planDigest, idempotencyKey: "attempted-ledger-0001", mode: "live" });
    assert.equal(attempted.error.code, "external_mcp_call_failed");
    assert.equal(attemptedCalls, 1);
    assert.equal(attemptedLedger.get("attempted-ledger-0001").protected, true);

    now += 60_001;
    const full = await attemptedRuntime.execute({ manifest: attemptedManifest, expectedPlanDigest: attemptedPlan.plan.planDigest, idempotencyKey: "attempted-ledger-0002", mode: "live" });
    assert.equal(full.error.code, "application_ledger_full");
    assert.equal(attemptedCalls, 1);
    assert.equal(attemptedLedger.has("attempted-ledger-0001"), true);
  } finally {
    Date.now = originalNow;
  }
});

test("deadline-aborted delayed approval cannot continue into a gateway call", async () => {
  const gatewayHarness = makeGatewayHarness();
  let approvalStarted;
  let releaseApproval;
  const started = new Promise((resolve) => { approvalStarted = resolve; });
  const delayedApproval = new Promise((resolve) => { releaseApproval = resolve; });
  const adapterRegistry = createDefaultApplicationAdapterRegistry({
    externalGateway: gatewayHarness.gateway,
    resolveExternalApproval: async () => {
      approvalStarted();
      return delayedApproval;
    },
  });
  const runtime = createAgentApplicationRuntime({ adapterRegistry });
  const integration = gatewayHarness.gateway.listApplicationIntegrations()[0];
  const manifest = makeExternalManifest(adapterRegistry.policyDigest, integration);
  manifest.bounds.maxRuntimeMs = 1_000;
  sealManifest(manifest);
  const planned = modePlan(runtime, manifest, "live");
  assert.equal(planned.ok, true);

  const execution = runtime.execute({ manifest, expectedPlanDigest: planned.plan.planDigest, idempotencyKey: "delayed-approval-0001", mode: "live" });
  await started;
  const timedOut = await execution;
  assert.equal(timedOut.error.code, "application_deadline_exceeded");
  assert.deepEqual(timedOut.evidence, { cancellationRequested: true, reconciliationRequired: false, sideEffectDispatched: false });
  assert.equal(gatewayHarness.callCount(), 0);

  releaseApproval({ hostOwnedApproval: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gatewayHarness.callCount(), 0, "post-deadline approval release must remain fenced before the gateway");
});

test("an expired later-step deadline rejects before invoking its external adapter", async () => {
  const originalNow = Date.now;
  let now = 1_900_000_000_000;
  Date.now = () => now;
  let approvalRequests = 0;
  let releaseApproval;
  const delayedApproval = new Promise((resolve) => { releaseApproval = resolve; });
  try {
    const gatewayHarness = makeGatewayHarness();
    const baseRegistry = createDefaultApplicationAdapterRegistry({
      externalGateway: gatewayHarness.gateway,
      resolveExternalApproval: async () => { approvalRequests += 1; return delayedApproval; },
    });
    const adapters = baseRegistry.adapters.map((adapter) => adapter.adapterKind === "core.input" ? {
      ...adapter,
      execute: async (args) => { const result = await adapter.execute(args); now += 1_001; return result; },
    } : adapter);
    const registryCore = createApplicationAdapterRegistry(adapters, { preference: adapters.map((adapter) => adapter.id) });
    const adapterRegistry = Object.freeze({
      ...registryCore,
      integrations: baseRegistry.integrations,
      resolveNodeOwnerEvidence: baseRegistry.resolveNodeOwnerEvidence,
    });
    const runtime = createAgentApplicationRuntime({ adapterRegistry });
    const manifest = makeExternalManifest(adapterRegistry.policyDigest, gatewayHarness.gateway.listApplicationIntegrations()[0]);
    manifest.bounds.maxRuntimeMs = 1_000;
    sealManifest(manifest);
    const planned = modePlan(runtime, manifest, "live");
    const result = await runtime.execute({ manifest, expectedPlanDigest: planned.plan.planDigest, idempotencyKey: "expired-step-admission-0001", mode: "live" });
    assert.equal(result.error.code, "application_deadline_exceeded");
    assert.deepEqual(result.evidence, { cancellationRequested: true, reconciliationRequired: false, sideEffectDispatched: false });
    assert.equal(approvalRequests, 0, "expired admission must not invoke the external adapter");
    releaseApproval({ hostOwnedApproval: true });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(gatewayHarness.callCount(), 0, "releasing approval after expired admission must not reach the gateway");
  } finally {
    Date.now = originalNow;
  }
});
