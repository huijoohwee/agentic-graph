import assert from "node:assert/strict";
import test from "node:test";

import {
  APPLICATION_ADAPTER_INTERFACE_ID,
  APPLICATION_ADAPTER_INTERFACE_REVISION,
  APPLICATION_COMPONENT_CATALOG,
  APPLICATION_COMPONENT_CATALOG_DIGEST,
  APPLICATION_INVOCATION,
  APPLICATION_MANIFEST_SCHEMA_ID,
  digestApplicationManifestSource,
  digestApplicationValue,
  stableApplicationJson,
} from "../../contracts/agent-application.schema.js";
import { createDefaultApplicationAdapterRegistry } from "../agent-application-adapter-registry.js";
import {
  APPLICATION_COMPONENT_PACK_SCHEMA_ID,
  createApplicationComponentPackRegistry,
  digestApplicationComponentPackSource,
} from "../agent-application-component-packs.js";
import { createAgentApplicationRuntime } from "../agent-application-runtime.js";

const DRAFT = "https://json-schema.org/draft/2020-12/schema";
const SHA = (label) => digestApplicationValue({ label });
const ref = (id, revision = "1.0.0") => ({ id, revision });
const endpoint = (node, port) => ({ node, port });

const gatewayHarness = () => {
  let calls = 0;
  const gateway = Object.freeze({
    ownerEvidence: Object.freeze({ ownerId: "agentic-graph.external-tool-gateway", implementationRevision: "1.0.0", implementationDigest: SHA("gateway") }),
    listApplicationIntegrations: () => [],
    resolveApplicationIntegration: () => ({ ok: false, error: { code: "capability_not_found", message: "No test integration." } }),
    validateApplicationArtifact: () => ({ ok: false, error: { code: "invalid_artifact", message: "No test artifact." } }),
    call: async () => { calls += 1; throw new Error("component-pack tests must remain offline"); },
  });
  return { gateway, calls: () => calls };
};

const makeComponent = (id, { adapterKind = id, ownerId = "host.offline-transform", inputs = [{ name: "input", schemaRef: "agentic-graph.application-value/v1", kinds: ["text"], required: true }], capability = `${id}.execute` } = {}) => ({
  id,
  revision: "1.0.0",
  title: `Host ${id}`,
  description: `A separately defined offline ${id} extension.`,
  stability: "stable",
  inputs,
  outputs: [{ name: "output", schemaRef: "agentic-graph.application-value/v1", kinds: ["text"] }],
  configSchema: { $schema: DRAFT, type: "object", additionalProperties: false, properties: {} },
  runtime: {
    adapterKind,
    interfaceId: APPLICATION_ADAPTER_INTERFACE_ID,
    interfaceRevision: APPLICATION_ADAPTER_INTERFACE_REVISION,
    ownerId,
    riskClass: "local-pure",
    readiness: "runtime-executable",
    providedCapabilities: [{ id: `${id}.produce`, revision: "v1" }],
    requiredCapabilities: [{ id: capability, revision: "v1" }],
    sideEffect: "none",
    replay: "safe",
  },
  migrations: [],
});

const sealPack = (pack) => {
  pack.source.sha256 = digestApplicationComponentPackSource(pack);
  return pack;
};
const makePack = (id, components = [makeComponent(`extension.${id}`)], uri = `workspace:/component-packs/${id}.json`) => sealPack({
  schemaVersion: APPLICATION_COMPONENT_PACK_SCHEMA_ID,
  id: `host.${id}`,
  revision: "1.0.0",
  source: { uri, sha256: "0".repeat(64) },
  components,
});

const makeAdapter = (component, calls = { value: 0 }, overrides = {}) => ({
  id: `host.${component.id}`,
  revision: "1.0.0",
  adapterKind: component.runtime.adapterKind,
  interfaceId: component.runtime.interfaceId,
  interfaceRevision: component.runtime.interfaceRevision,
  implementationRevision: "1.0.0",
  implementationDigest: SHA(`adapter:${component.id}`),
  ownerId: component.runtime.ownerId,
  ownerImplementationRevision: "1.0.0",
  ownerImplementationDigest: SHA(`owner:${component.runtime.ownerId}`),
  supportedComponents: [ref(component.id, component.revision)],
  supportedModes: ["dry-run", "live"],
  capabilities: structuredClone(component.runtime.requiredCapabilities),
  sideEffect: component.runtime.sideEffect,
  replay: component.runtime.replay,
  execute: async ({ inputs }) => {
    calls.value += 1;
    return { ok: true, status: "completed", outputs: { output: { kind: "text", value: String(inputs.input?.value || "").toUpperCase() } }, evidence: { externalCalls: 0, paidProviderCalls: 0 } };
  },
  ...overrides,
});
const makeOwner = (component, revision = () => "1.0.0") => ({
  component: ref(component.id, component.revision),
  ownerId: component.runtime.ownerId,
  resolve: () => ({ ok: true, evidence: { contractId: "host.offline-transform", ownerId: component.runtime.ownerId, revision: revision(), digest: SHA(`owner-evidence:${revision()}`) } }),
});

const makeBase = () => {
  const gateway = gatewayHarness();
  return { ...gateway, baseRegistry: createDefaultApplicationAdapterRegistry({ externalGateway: gateway.gateway }) };
};
const compose = ({ baseRegistry, packs, adapters, owners }) => createApplicationComponentPackRegistry({ baseRegistry, packs, adapters, ownerResolvers: owners });

const sealManifest = (manifest) => {
  manifest.source.sha256 = digestApplicationManifestSource(manifest);
  return manifest;
};
const makeManifest = (registry, componentId = "extension.uppercase") => sealManifest({
  schemaVersion: APPLICATION_MANIFEST_SCHEMA_ID,
  invocation: structuredClone(APPLICATION_INVOCATION),
  application: { id: "host-extension-proof", revision: "1.0.0" },
  source: { uri: "workspace:/applications/host-extension-proof.json", sha256: "0".repeat(64) },
  runtimeProof: { catalogDigest: registry.componentCatalogDigest, adapterPolicyDigest: registry.policyDigest },
  nodes: [
    { id: "input", component: ref("core.input"), config: { value: { kind: "text", value: "hello extension" } } },
    { id: "transform", component: ref(componentId), config: {} },
    { id: "output", component: ref("core.output"), config: {} },
  ],
  edges: [
    { from: endpoint("input", "value"), to: endpoint("transform", "input") },
    { from: endpoint("transform", "output"), to: endpoint("output", "value") },
  ],
  entrypoints: [endpoint("input", "value")],
  outputs: [{ name: "result", node: "output", port: "result" }],
  bounds: { maxSteps: 3, maxRuntimeMs: 5_000, maxOutputBytes: 1_048_576 },
});

test("default server registry stays unchanged while a host-admitted offline component pack plans and executes", async () => {
  const { baseRegistry, calls: externalCalls } = makeBase();
  const defaultCatalog = createAgentApplicationRuntime({ adapterRegistry: baseRegistry }).catalog({});
  assert.equal(defaultCatalog.catalogDigest, APPLICATION_COMPONENT_CATALOG_DIGEST);
  assert.equal(defaultCatalog.components.length, APPLICATION_COMPONENT_CATALOG.components.length);
  assert.equal("componentCatalog" in baseRegistry, false);

  const component = makeComponent("extension.uppercase");
  const pack = makePack("uppercase", [component]);
  const adapterCalls = { value: 0 };
  const registry = compose({ baseRegistry, packs: [pack], adapters: [makeAdapter(component, adapterCalls)], owners: [makeOwner(component)] });
  const runtime = createAgentApplicationRuntime({ adapterRegistry: registry });
  const catalog = runtime.catalog({});
  assert.equal(catalog.ok, true);
  assert.equal(catalog.components.length, APPLICATION_COMPONENT_CATALOG.components.length + 1);
  assert.equal(catalog.catalogDigest, registry.componentCatalogDigest);
  assert.equal(stableApplicationJson(catalog).includes(pack.source.uri), false);

  const manifest = makeManifest(registry);
  const planned = runtime.plan({ manifest, mode: "dry-run" });
  assert.equal(planned.ok, true, JSON.stringify(planned));
  assert.equal(planned.plan.nodes.find((node) => node.id === "transform").component.sourceDigest, catalog.components.find((entry) => entry.id === component.id).sourceDigest);
  const result = await runtime.execute({ manifest, expectedPlanDigest: planned.plan.planDigest, idempotencyKey: "pack-offline-0001", mode: "dry-run" });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.outputs.result, { kind: "text", value: "HELLO EXTENSION" });
  assert.equal(adapterCalls.value, 1);
  assert.equal(externalCalls(), 0);

  assert.equal(runtime.catalog({ packs: [pack] }).error.code, "invalid_catalog_input");
  assert.equal(runtime.plan({ manifest, mode: "dry-run", packs: [pack] }).error.code, "invalid_plan_input");
  assert.throws(() => runtime.run("agentic-graph.application.pack.register", { pack }), /Unknown application composition tool/);
});

test("pack, adapter, and owner input order does not change catalog, policy, or plan digests", () => {
  const { baseRegistry } = makeBase();
  const uppercase = makeComponent("extension.uppercase");
  const suffix = makeComponent("extension.suffix");
  const packs = [makePack("uppercase", [uppercase]), makePack("suffix", [suffix], "kgdoc:component-pack/suffix")];
  const adapters = [makeAdapter(uppercase), makeAdapter(suffix)];
  const owners = [makeOwner(uppercase), makeOwner(suffix)];
  const left = compose({ baseRegistry, packs, adapters, owners });
  const right = compose({ baseRegistry, packs: [...packs].reverse(), adapters: [...adapters].reverse(), owners: [...owners].reverse() });
  assert.equal(left.componentCatalogDigest, right.componentCatalogDigest);
  assert.equal(left.policyDigest, right.policyDigest);
  assert.equal(digestApplicationValue(left.policy), left.policyDigest);
  assert.equal(digestApplicationValue(left.adapterPolicy), left.componentPackPolicy.adapterPolicyDigest);
  const manifest = makeManifest(left);
  const leftPlan = createAgentApplicationRuntime({ adapterRegistry: left }).plan({ manifest, mode: "dry-run" });
  const rightPlan = createAgentApplicationRuntime({ adapterRegistry: right }).plan({ manifest, mode: "dry-run" });
  assert.equal(leftPlan.ok, true, JSON.stringify(leftPlan));
  assert.equal(rightPlan.ok, true, JSON.stringify(rightPlan));
  assert.equal(leftPlan.plan.planDigest, rightPlan.plan.planDigest);

  const reorderedComponents = structuredClone(packs[0]);
  reorderedComponents.components.reverse();
  assert.equal(digestApplicationComponentPackSource(reorderedComponents), packs[0].source.sha256);
});

test("a sibling pack change requires explicit catalog acceptance without inventing unchanged component drift", async () => {
  const { baseRegistry } = makeBase();
  const uppercase = makeComponent("extension.uppercase");
  const suffix = makeComponent("extension.suffix");
  const firstPack = makePack("transforms", [uppercase, suffix]);
  const changedPack = structuredClone(firstPack);
  changedPack.revision = "1.0.1";
  const changedSuffix = changedPack.components.find((component) => component.id === suffix.id);
  changedSuffix.revision = "1.0.1";
  changedSuffix.description = "An explicitly revised sibling definition.";
  sealPack(changedPack);
  const adapters = [makeAdapter(uppercase), makeAdapter(suffix)];
  const owners = [makeOwner(uppercase), makeOwner(suffix)];
  const first = compose({ baseRegistry, packs: [firstPack], adapters, owners });
  const reorderedPack = structuredClone(firstPack);
  reorderedPack.components.reverse();
  sealPack(reorderedPack);
  const reordered = compose({ baseRegistry, packs: [reorderedPack], adapters, owners });
  const changedAdapterCalls = { value: 0 };
  const changed = compose({ baseRegistry, packs: [changedPack], adapters: [makeAdapter(uppercase, changedAdapterCalls), makeAdapter(changedSuffix, changedAdapterCalls)], owners: [makeOwner(uppercase), makeOwner(changedSuffix)] });
  const firstUppercase = first.componentCatalog.components.find((component) => component.id === uppercase.id);
  const changedUppercase = changed.componentCatalog.components.find((component) => component.id === uppercase.id);
  assert.equal(firstUppercase.source.sourceDigest, changedUppercase.source.sourceDigest);
  assert.equal(firstUppercase.definitionDigest, changedUppercase.definitionDigest);
  assert.equal(first.componentCatalogDigest, reordered.componentCatalogDigest);
  assert.equal(first.policyDigest, reordered.policyDigest);
  assert.notEqual(first.componentCatalogDigest, changed.componentCatalogDigest);
  assert.notEqual(first.policyDigest, changed.policyDigest);

  const staleManifest = makeManifest(first);
  const acceptedBeforeChange = createAgentApplicationRuntime({ adapterRegistry: first }).plan({ manifest: staleManifest, mode: "dry-run" });
  assert.equal(acceptedBeforeChange.ok, true, JSON.stringify(acceptedBeforeChange));
  const changedRuntime = createAgentApplicationRuntime({ adapterRegistry: changed });
  const rejected = changedRuntime.plan({ manifest: staleManifest, mode: "dry-run" });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "application_manifest_invalid");
  assert.ok(rejected.diagnostics.some((diagnostic) => diagnostic.code === "catalog_revision_mismatch"));
  const discoverable = changedRuntime.catalog({});
  assert.equal(discoverable.ok, true);
  assert.equal(discoverable.catalogDigest, changed.componentCatalogDigest);
  assert.notEqual(discoverable.catalogDigest, staleManifest.runtimeProof.catalogDigest);
  const staleCatalogExecution = await changedRuntime.execute({ manifest: staleManifest, expectedPlanDigest: acceptedBeforeChange.plan.planDigest, idempotencyKey: "pack-stale-catalog-0001", mode: "dry-run" });
  assert.equal(staleCatalogExecution.ok, false);
  assert.equal(staleCatalogExecution.error.code, "application_manifest_invalid");
  assert.equal(changedAdapterCalls.value, 0);

  const stalePolicyManifest = makeManifest(changed);
  stalePolicyManifest.runtimeProof.adapterPolicyDigest = first.policyDigest;
  sealManifest(stalePolicyManifest);
  const stalePolicyPlan = changedRuntime.plan({ manifest: stalePolicyManifest, mode: "dry-run" });
  assert.equal(stalePolicyPlan.ok, false);
  assert.equal(stalePolicyPlan.error.code, "adapter_policy_drift");
  const stalePolicyExecution = await changedRuntime.execute({ manifest: stalePolicyManifest, expectedPlanDigest: SHA("stale-policy-plan"), idempotencyKey: "pack-stale-policy-0001", mode: "dry-run" });
  assert.equal(stalePolicyExecution.ok, false);
  assert.equal(stalePolicyExecution.error.code, "adapter_policy_drift");
  assert.equal(changedAdapterCalls.value, 0);
});

test("runtime snapshots an injected catalog so post-construction mutation cannot forge digest evidence", () => {
  const { baseRegistry } = makeBase();
  const component = makeComponent("extension.uppercase");
  const registry = compose({ baseRegistry, packs: [makePack("uppercase", [component])], adapters: [makeAdapter(component)], owners: [makeOwner(component)] });
  const mutableCatalog = structuredClone(registry.componentCatalog);
  const runtime = createAgentApplicationRuntime({ adapterRegistry: { ...registry, componentCatalog: mutableCatalog } });
  const manifest = makeManifest(registry);
  const beforeCatalog = runtime.catalog({});
  const beforePlan = runtime.plan({ manifest, mode: "dry-run" });
  assert.equal(beforeCatalog.ok, true);
  assert.equal(beforePlan.ok, true);
  mutableCatalog.components.find((entry) => entry.id === component.id).description = "mutated after runtime construction";
  mutableCatalog.components.find((entry) => entry.id === component.id).runtime.ownerId = "host.mutated-owner";
  const afterCatalog = runtime.catalog({});
  const afterPlan = runtime.plan({ manifest, mode: "dry-run" });
  assert.equal(afterCatalog.ok, true);
  assert.equal(afterCatalog.catalogDigest, beforeCatalog.catalogDigest);
  assert.equal(afterCatalog.components.find((entry) => entry.id === component.id).description, beforeCatalog.components.find((entry) => entry.id === component.id).description);
  assert.equal(afterPlan.ok, true);
  assert.equal(afterPlan.plan.planDigest, beforePlan.plan.planDigest);
});

test("pack admission rejects hostile data, unsupported sources and controls, and structural bounds", () => {
  const { baseRegistry } = makeBase();
  const component = makeComponent("extension.uppercase");
  const valid = makePack("uppercase", [component]);
  const admit = (packs) => compose({ baseRegistry, packs, adapters: [], owners: [] });
  const adapterCalls = { value: 0 };
  const rejectConfigSchema = (configSchema, expected) => {
    const hostile = structuredClone(valid);
    hostile.components[0].configSchema = configSchema;
    sealPack(hostile);
    assert.throws(() => compose({ baseRegistry, packs: [hostile], adapters: [makeAdapter(component, adapterCalls)], owners: [makeOwner(component)] }), expected);
    assert.equal(adapterCalls.value, 0);
  };

  const sparsePacks = [valid]; sparsePacks.length = 2;
  assert.throws(() => admit(sparsePacks), /exact bounded arrays/);
  const accessor = structuredClone(valid);
  Object.defineProperty(accessor, "id", { enumerable: true, get: () => "host.accessor" });
  assert.throws(() => admit([accessor]), /pure JSON data/);
  const executable = structuredClone(valid);
  executable.components[0].configSchema.properties.callback = { default: () => "execute" };
  assert.throws(() => admit([executable]), /pure JSON data/);
  const sparseComponents = structuredClone(valid);
  sparseComponents.components.length = 2;
  assert.throws(() => admit([sparseComponents]), /pure JSON data/);
  const oversized = structuredClone(valid);
  oversized.components[0].configSchema.properties.payload = { const: "x".repeat(300_000) };
  assert.throws(() => admit([oversized]), /exceeds 262144 canonical bytes/);

  rejectConfigSchema({ $schema: DRAFT, type: "object", additionalProperties: false, required: ["endpoint"], properties: { endpoint: { type: "string" } } }, /forbidden control-plane field/);
  for (const alias of ["baseUrl", "address", "destination", "process", "processSpec", "shell", "accessMaterial", "settingsMap", "commandLine", "endpointUrl", "apiTokenValue", "shellScript", "callback", "provider", "approval", "rawMcpObject", "rawToolResult", "adapter"]) {
    rejectConfigSchema({ $schema: DRAFT, type: "object", additionalProperties: false, properties: { [alias]: { type: "string" } } }, /forbidden control-plane field/);
  }
  rejectConfigSchema({ $schema: DRAFT, type: "object", additionalProperties: false, properties: { "ｅｎｄｐｏｉｎｔ": { type: "string" } } }, /normalized ASCII config-property identifier/);
  rejectConfigSchema({ $schema: DRAFT, type: "object", additionalProperties: false, properties: { settings: { type: "object" } } }, /object schemas must set additionalProperties to false/);
  rejectConfigSchema({ $schema: DRAFT, type: "object", additionalProperties: false, patternProperties: { ".*": { type: "string" } } }, /patternProperties is forbidden/);
  rejectConfigSchema({ $schema: DRAFT, type: "object", additionalProperties: false, definitions: { hidden: { type: "string", pattern: "(a+)+$", $ref: "https://example.invalid/schema" } } }, /definitions is forbidden/);
  rejectConfigSchema({ $schema: DRAFT, type: "object", additionalProperties: false, "x-loader": { command: "ignored-today" } }, /not part of the closed host component-pack schema dialect/);
  rejectConfigSchema({ $schema: DRAFT, type: "object", additionalProperties: false, properties: { value: { $ref: "https://json-schema.org/draft/2020-12/schema" } } }, /\$ref is forbidden/);
  rejectConfigSchema({ $schema: DRAFT, type: "object", additionalProperties: false, properties: { value: { type: "string", pattern: "(a+)+$" } } }, /pattern is forbidden/);
  for (const format of ["uri", "url", "future-custom-format"]) rejectConfigSchema({ $schema: DRAFT, type: "object", additionalProperties: false, properties: { value: { type: "string", format } } }, /format is forbidden/);
  rejectConfigSchema({ $schema: DRAFT, type: "object", additionalProperties: false, properties: { values: { type: "array", items: { type: "string" } } } }, /arrays require an object items schema and maxItems/);
  let deepSchema = { type: "string" };
  for (let depth = 0; depth < 34; depth += 1) deepSchema = { anyOf: [deepSchema] };
  rejectConfigSchema({ $schema: DRAFT, type: "object", additionalProperties: false, properties: { value: deepSchema } }, /exceeds schema depth 32/);

  for (const key of ["url", "modulePath", "package", "discover", "migration", "fallback"]) {
    const controlled = structuredClone(valid); controlled[key] = "forbidden";
    assert.throws(() => admit([controlled]), /exact closed data contract/);
  }
  for (const uri of ["https://example.com/pack.json", "workspace://example.com/pack.json", "workspace:/../pack.json", "workspace:/safe/../pack.json", "workspace:/./pack.json", "workspace:/Uppercase/pack.json", "workspace:/tilde~/pack.json", "workspace:/safe..segment/pack", "workspace:/safe-/pack", "kgdoc:Uppercase", "kgdoc:https://example.com/pack.json", "kgdoc://example.com/pack", "urn:agentic-graph:Uppercase", "urn:agentic-graph:http", "urn:agentic-graph:http:evil", "urn:agentic-graph:https:evil", "urn:agentic-graph:file:evil", "urn:agentic-graph:ftp:evil", "urn:agentic-graph:ws:evil", "urn:agentic-graph:wss:evil", "urn:agentic-graph:https://example.com"]) {
    const networkSource = structuredClone(valid); networkSource.source.uri = uri;
    assert.throws(() => admit([networkSource]), /allowed inert source URI/);
  }
  const drifted = structuredClone(valid); drifted.components[0].description = "changed after hashing";
  assert.throws(() => admit([drifted]), /does not match/);

  const tooManyPacks = Array.from({ length: 17 }, (_, index) => valid);
  assert.throws(() => admit(tooManyPacks), /exact bounded arrays/);
  const tooManyComponents = { ...structuredClone(valid), components: Array.from({ length: 17 }, (_, index) => makeComponent(`extension.too-many-${index}`)) };
  assert.throws(() => admit([tooManyComponents]), /1-16/);
  const totalOverflow = Array.from({ length: 6 }, (_, packIndex) => makePack(`overflow-${packIndex}`, Array.from({ length: 16 }, (_, componentIndex) => makeComponent(`extension.overflow-${packIndex}-${componentIndex}`)), `urn:agentic-graph:pack:overflow-${packIndex}`));
  assert.throws(() => admit(totalOverflow), /exceeds 100/);

  const duplicatePack = structuredClone(valid); duplicatePack.source.uri = "kgdoc:duplicate-pack"; sealPack(duplicatePack);
  assert.throws(() => admit([valid, duplicatePack]), /pack ids must be unique/);
  const duplicateComponent = makePack("other", [structuredClone(component)], "urn:agentic-graph:pack-other");
  assert.throws(() => admit([valid, duplicateComponent]), /duplicate exact component/);
});

test("startup fails closed on missing, ambiguous, or mismatched private host bindings without invoking adapters", () => {
  const { baseRegistry } = makeBase();
  const component = makeComponent("extension.uppercase");
  const pack = makePack("uppercase", [component]);
  const calls = { value: 0 };
  const adapter = makeAdapter(component, calls);
  const owner = makeOwner(component);
  const admit = (adapters, owners = [owner]) => compose({ baseRegistry, packs: [pack], adapters, owners });

  assert.throws(() => admit([]), /adapter is missing/);
  let getterCalls = 0;
  const accessorAdapter = { ...adapter };
  Object.defineProperty(accessorAdapter, "id", { enumerable: true, get: () => { getterCalls += 1; return "host.accessor"; } });
  assert.throws(() => admit([accessorAdapter]), /own-data descriptor/);
  assert.equal(getterCalls, 0);
  assert.throws(() => admit([adapter, { ...adapter, id: "host.extension.uppercase.alternate", implementationDigest: SHA("alternate") }]), /selection is ambiguous/);
  const mismatches = [
    { interfaceId: "host.unsupported-interface" },
    { capabilities: [{ id: "extension.wrong", revision: "v1" }] },
    { sideEffect: "external-write" },
    { replay: "idempotency-key" },
    { ownerId: "host.other-owner" },
    { adapterKind: "extension.other-kind" },
  ];
  for (const override of mismatches) assert.throws(() => admit([{ ...adapter, ...override }]), /(unsupported interface|mismatch)/);
  assert.throws(() => admit([adapter], []), /requires exactly one host owner resolver/);
  let ownerGetterCalls = 0;
  const accessorOwner = { ...owner };
  Object.defineProperty(accessorOwner, "ownerId", { enumerable: true, get: () => { ownerGetterCalls += 1; return component.runtime.ownerId; } });
  assert.throws(() => admit([adapter], [accessorOwner]), /exact host-only contract/);
  assert.equal(ownerGetterCalls, 0);
  assert.throws(() => admit([adapter], [owner, { ...owner }]), /selection is ambiguous/);
  assert.throws(() => admit([adapter], [{ ...owner, ownerId: "host.other-owner" }]), /resolver mismatch/);
  const wrongEvidenceOwner = { ...owner, resolve: () => ({ ok: true, evidence: { contractId: "host.offline-transform", ownerId: "host.other-owner", revision: "1.0.0", digest: SHA("wrong-evidence-owner") } }) };
  const wrongEvidenceRegistry = admit([adapter], [wrongEvidenceOwner]);
  const wrongEvidencePlan = createAgentApplicationRuntime({ adapterRegistry: wrongEvidenceRegistry }).plan({ manifest: makeManifest(wrongEvidenceRegistry), mode: "dry-run" });
  assert.equal(wrongEvidencePlan.ok, false);
  assert.equal(wrongEvidencePlan.error.code, "owner_evidence_invalid");
  const dryRunOnly = admit([{ ...adapter, supportedModes: ["dry-run"] }]);
  const liveManifest = makeManifest(dryRunOnly);
  const livePlan = createAgentApplicationRuntime({ adapterRegistry: dryRunOnly }).plan({ manifest: liveManifest, mode: "live" });
  assert.equal(livePlan.ok, false);
  assert.equal(livePlan.error.code, "component_adapter_unavailable");
  assert.equal(calls.value, 0);
});

test("owner drift changes the exact plan and blocks execution before the extension adapter is invoked", async () => {
  const { baseRegistry } = makeBase();
  const component = makeComponent("extension.uppercase");
  const pack = makePack("uppercase", [component]);
  const calls = { value: 0 };
  let revision = "1.0.0";
  const registry = compose({ baseRegistry, packs: [pack], adapters: [makeAdapter(component, calls)], owners: [makeOwner(component, () => revision)] });
  const runtime = createAgentApplicationRuntime({ adapterRegistry: registry });
  const manifest = makeManifest(registry);
  const planned = runtime.plan({ manifest, mode: "dry-run" });
  assert.equal(planned.ok, true);
  revision = "1.0.1";
  const result = await runtime.execute({ manifest, expectedPlanDigest: planned.plan.planDigest, idempotencyKey: "pack-drift-0001", mode: "dry-run" });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "application_plan_drift");
  assert.equal(calls.value, 0);
});
