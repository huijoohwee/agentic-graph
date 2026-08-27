import assert from "node:assert/strict";
import test from "node:test";

import rawCatalog from "../../data/config/agents/agent-application-components.json" with { type: "json" };
import {
  APPLICATION_ADAPTER_INTERFACE_REVISION,
  APPLICATION_COMPONENT_CATALOG_DIGEST,
  APPLICATION_COMPONENT_CATALOG_SCHEMA_ID,
  APPLICATION_INVOCATION,
  APPLICATION_MANIFEST_SCHEMA_ID,
  compileApplicationManifest,
  deepFreezeApplicationValue,
  digestApplicationManifestSource,
  digestApplicationValue,
  stableApplicationJson,
  validateApplicationComponentCatalog,
} from "../agent-application.schema.js";

const SHA = "a".repeat(64);
const component = (id, revision = "1.0.0") => ({ id, revision });
const endpoint = (node, port) => ({ node, port });
const node = (id, componentId, config, revision) => ({ id, component: component(componentId, revision), config });

const sealManifest = (manifest) => {
  manifest.source.sha256 = digestApplicationManifestSource(manifest);
  return manifest;
};

const makeManifest = ({ nodes, edges, entrypoints, outputs, id = "contract-proof" }) => sealManifest({
  schemaVersion: APPLICATION_MANIFEST_SCHEMA_ID,
  invocation: structuredClone(APPLICATION_INVOCATION),
  application: { id, revision: "1.0.0" },
  source: { uri: `workspace:/${id}.json`, sha256: "0".repeat(64) },
  runtimeProof: { catalogDigest: APPLICATION_COMPONENT_CATALOG_DIGEST, adapterPolicyDigest: SHA },
  nodes,
  edges,
  entrypoints,
  outputs,
  bounds: { maxSteps: nodes.length, maxRuntimeMs: 5_000, maxOutputBytes: 1_048_576 },
});

const makeTwoBranchManifest = () => makeManifest({
  nodes: [
    node("input-a", "core.input", { value: { kind: "text", value: "alpha" } }),
    node("output-a", "core.output", {}),
    node("input-b", "core.input", { value: { kind: "json", value: { beta: true } } }),
    node("output-b", "core.output", {}),
  ],
  edges: [
    { from: endpoint("input-a", "value"), to: endpoint("output-a", "value") },
    { from: endpoint("input-b", "value"), to: endpoint("output-b", "value") },
  ],
  entrypoints: [endpoint("input-a", "value"), endpoint("input-b", "value")],
  outputs: [
    { name: "alpha", node: "output-a", port: "result" },
    { name: "beta", node: "output-b", port: "result" },
  ],
});

test("canonical JSON rejects non-JSON values and remains prototype-safe", () => {
  const cycle = {};
  cycle.self = cycle;
  const sparse = [];
  sparse.length = 2;
  sparse[1] = "present";
  const accessor = {};
  Object.defineProperty(accessor, "value", { enumerable: true, get: () => "not-json-data" });
  const decorated = [];
  Object.defineProperty(decorated, "hidden", { value: true });
  for (const value of [undefined, { value: Number.NaN }, { value: 1n }, new Date(), cycle, sparse, accessor, decorated]) {
    assert.throws(() => stableApplicationJson(value), TypeError);
  }

  const withPrototypeKey = JSON.parse('{"a":1,"__proto__":{"polluted":true}}');
  assert.equal(Object.prototype.polluted, undefined);
  assert.match(stableApplicationJson(withPrototypeKey), /"__proto__"/);
  assert.notEqual(digestApplicationValue(withPrototypeKey), digestApplicationValue({ a: 1 }));
  assert.equal(Object.prototype.polluted, undefined);

  const manifest = makeTwoBranchManifest();
  manifest.nodes[0].config.value.value = undefined;
  const rejected = compileApplicationManifest(manifest);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.diagnostics[0].code, "manifest_not_json");
});

test("URLs and authority-like words remain inert application data", () => {
  const manifest = makeManifest({
    nodes: [node("input", "core.input", { value: { kind: "json", value: { prompt: "Review https://example.com/source", endpoint: "descriptive data only" } } }), node("output", "core.output", {})],
    edges: [{ from: endpoint("input", "value"), to: endpoint("output", "value") }], entrypoints: [endpoint("input", "value")], outputs: [{ name: "result", node: "output", port: "result" }],
  });
  assert.equal(compileApplicationManifest(manifest).ok, true);
});

test("deep freeze covers nested objects, arrays, and compiled manifest state", () => {
  const frozen = deepFreezeApplicationValue({ nested: { list: [{ value: 1 }] } });
  assert.equal(Object.isFrozen(frozen), true);
  assert.equal(Object.isFrozen(frozen.nested), true);
  assert.equal(Object.isFrozen(frozen.nested.list), true);
  assert.equal(Object.isFrozen(frozen.nested.list[0]), true);
  assert.throws(() => { frozen.nested.list[0].value = 2; }, TypeError);

  const compiled = compileApplicationManifest(makeTwoBranchManifest());
  assert.equal(compiled.ok, true, JSON.stringify(compiled.diagnostics));
  assert.equal(Object.isFrozen(compiled.manifest.nodes[0].config.value), true);
  assert.equal(Object.isFrozen(compiled.resolvedComponents["input-a"].configSchema), true);
  assert.throws(() => { compiled.manifest.nodes[0].config.value.kind = "artifact"; }, TypeError);
});

test("catalog validation is total and returns diagnostics for malformed documents", () => {
  const malformed = [
    null,
    {},
    { schemaVersion: APPLICATION_COMPONENT_CATALOG_SCHEMA_ID, catalogRevision: "1.0.0", components: "not-an-array" },
    { ...structuredClone(rawCatalog), components: [{ ...structuredClone(rawCatalog.components[0]), inputs: "not-an-array" }] },
    { ...structuredClone(rawCatalog), components: [{ ...structuredClone(rawCatalog.components[0]), outputs: [{ ...structuredClone(rawCatalog.components[0].outputs[0]), kinds: {} }] }] },
    { ...structuredClone(rawCatalog), components: [{ ...structuredClone(rawCatalog.components[0]), configSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", additionalProperties: false, $ref: "#/$defs/missing" } }] },
  ];
  for (const [index, document] of malformed.entries()) {
    let result;
    assert.doesNotThrow(() => { result = validateApplicationComponentCatalog(document); }, `malformed catalog ${index} threw`);
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0);
  }
});

test("catalog rejects component port and capability collections above 32 entries", () => {
  const cases = [
    ["inputs", Array.from({ length: 33 }, (_, index) => ({ name: `input-${index}`, schemaRef: "agenticgraph.application-value/v1", kinds: ["text"], required: true }))],
    ["outputs", Array.from({ length: 33 }, (_, index) => ({ name: `output-${index}`, schemaRef: "agenticgraph.application-value/v1", kinds: ["text"] }))],
    ["providedCapabilities", Array.from({ length: 33 }, (_, index) => ({ id: `application.capability-${index}`, revision: "v1" }))],
    ["requiredCapabilities", Array.from({ length: 33 }, (_, index) => ({ id: `application.requirement-${index}`, revision: "v1" }))],
  ];
  for (const [field, entries] of cases) {
    const catalog = structuredClone(rawCatalog);
    if (field === "inputs" || field === "outputs") catalog.components[0][field] = entries;
    else catalog.components[0].runtime[field] = entries;
    const validation = validateApplicationComponentCatalog(catalog);
    assert.equal(validation.ok, false, `${field} unexpectedly accepted`);
    assert.ok(validation.errors.some((error) => error.includes("at most 32")), `${field} omitted its bound diagnostic`);
  }
});

test("Draft 2020-12 prefixItems enforce the exact ordered invocation tuple", () => {
  const manifest = makeTwoBranchManifest();
  [manifest.invocation.bindings[0], manifest.invocation.bindings[1]] = [manifest.invocation.bindings[1], manifest.invocation.bindings[0]];
  sealManifest(manifest);
  const compiled = compileApplicationManifest(manifest);
  assert.equal(compiled.ok, false);
  assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === "manifest_schema_invalid"));
});

test("collection permutation preserves source and compiled digests with self-consistent frozen output", () => {
  const left = makeTwoBranchManifest();
  const right = structuredClone(left);
  right.nodes.reverse();
  right.edges.reverse();
  right.entrypoints.reverse();
  right.outputs.reverse();
  sealManifest(right);

  assert.equal(left.source.sha256, right.source.sha256);
  const compiledLeft = compileApplicationManifest(left);
  const compiledRight = compileApplicationManifest(right);
  assert.equal(compiledLeft.ok, true, JSON.stringify(compiledLeft.diagnostics));
  assert.equal(compiledRight.ok, true, JSON.stringify(compiledRight.diagnostics));
  assert.equal(compiledLeft.manifestDigest, compiledRight.manifestDigest);
  assert.equal(compiledLeft.manifest.source.sha256, digestApplicationManifestSource(compiledLeft.manifest));
  assert.equal(compiledLeft.manifestDigest, digestApplicationValue(compiledLeft.manifest));
  assert.deepEqual(compiledLeft.executionOrder, ["input-a", "input-b", "output-a", "output-b"]);
});

test("exact component and adapter-interface revisions fail closed without migration", () => {
  const manifest = makeTwoBranchManifest();
  manifest.nodes[0].component.revision = "1.0.1";
  sealManifest(manifest);
  const compiled = compileApplicationManifest(manifest);
  assert.equal(compiled.ok, false);
  assert.ok(compiled.diagnostics.some((diagnostic) => diagnostic.code === "component_migration_required"));

  const catalog = structuredClone(rawCatalog);
  catalog.components[0].runtime.interfaceRevision = `${APPLICATION_ADAPTER_INTERFACE_REVISION}.unsupported`;
  const validation = validateApplicationComponentCatalog(catalog);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes("interfaceRevision")));
});

test("edge kinds require subset assignability and every node must be productive", () => {
  const kindMismatch = makeManifest({
    nodes: [
      node("input", "core.input", { value: { kind: "artifact", value: { title: "artifact" } } }),
      node("agent", "agent.registered", { agentDefinitionId: "agent.sme-care" }),
      node("output", "core.output", {}),
    ],
    edges: [
      { from: endpoint("input", "value"), to: endpoint("agent", "prompt") },
      { from: endpoint("agent", "plan"), to: endpoint("output", "value") },
    ],
    entrypoints: [endpoint("input", "value")],
    outputs: [{ name: "result", node: "output", port: "result" }],
    id: "kind-mismatch",
  });
  const kindResult = compileApplicationManifest(kindMismatch);
  assert.equal(kindResult.ok, false);
  assert.ok(kindResult.diagnostics.some((diagnostic) => diagnostic.code === "edge_type_mismatch"));

  const inertDependency = makeManifest({
    nodes: [node("input", "core.input", { value: { kind: "text", value: "source" } }), node("prompt", "prompt.template", { template: "Static text" }), node("output", "core.output", {})],
    edges: [{ from: endpoint("input", "value"), to: endpoint("prompt", "input") }, { from: endpoint("prompt", "prompt"), to: endpoint("output", "value") }],
    entrypoints: [endpoint("input", "value")], outputs: [{ name: "result", node: "output", port: "result" }], id: "inert-dependency",
  });
  assert.ok(compileApplicationManifest(inertDependency).diagnostics.some((diagnostic) => diagnostic.code === "component_config_invalid"));

  const unreachable = makeTwoBranchManifest();
  unreachable.outputs = unreachable.outputs.slice(0, 1);
  sealManifest(unreachable);
  const reachabilityResult = compileApplicationManifest(unreachable);
  assert.equal(reachabilityResult.ok, false);
  assert.ok(reachabilityResult.diagnostics.some((diagnostic) => diagnostic.code === "sink_not_declared"));
  assert.ok(reachabilityResult.diagnostics.some((diagnostic) => diagnostic.code === "node_unreachable"));
});
