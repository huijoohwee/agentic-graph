import { createHash } from "node:crypto";

import Ajv2020 from "ajv/dist/2020.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import componentCatalogDocument from "../data/config/agents/agent-application-components.json" with { type: "json" };

export const APPLICATION_MANIFEST_SCHEMA_ID = "agentic-graph.application-manifest/v1";
export const APPLICATION_COMPONENT_CATALOG_SCHEMA_ID = "agentic-graph.application-component-catalog/v1";
export const APPLICATION_VALUE_SCHEMA_ID = "agentic-graph.application-value/v1";
export const APPLICATION_PLAN_SCHEMA_ID = "application-composition-plan/v1";
export const APPLICATION_RESULT_SCHEMA_ID = "agentic-graph.application-result/v1";
export const APPLICATION_ADAPTER_INTERFACE_ID = "agentic-graph.component-adapter";
export const APPLICATION_ADAPTER_INTERFACE_REVISION = "agentic-graph.component-adapter/v1";
export const APPLICATION_INVOCATION = deepFreezeApplicationValue({
  action: "/application.compose",
  semantic: "#application-composition",
  bindings: ["@application-manifest", "@component-catalog", "@integration-profile", "@runtime-proof"],
});

const DRAFT_2020_12 = "https://json-schema.org/draft/2020-12/schema";
const SAFE_ID = "^[a-z0-9]+(?:[._-][a-z0-9]+)*$";
const SAFE_NODE_ID = "^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$";
const EXACT_REVISION = "^[0-9]+\\.[0-9]+\\.[0-9]+$";
const SOURCE_URI = "^(?:workspace:/|kgdoc:|urn:agentic-graph:)[^\\s]{1,500}$";
const SHA256 = "^[0-9a-f]{64}$";
const MAX_MANIFEST_BYTES = 128 * 1024;
const MAX_COMPONENTS = 100;
const MAX_NODES = 64;
const MAX_EDGES = 128;
const validatorFactory = new AjvJsonSchemaValidator(new Ajv2020({ strict: false }));
const validatorCache = new Map();
const compareCodeUnits = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const stableValue = (value, path = "$", ancestors = new WeakSet()) => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number.`);
    return value;
  }
  if (typeof value !== "object") throw new TypeError(`${path} contains non-JSON-safe ${typeof value}.`);
  if (ancestors.has(value)) throw new TypeError(`${path} contains a cycle.`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== value.length + 1 || ownKeys.some((key) => typeof key === "symbol")) throw new TypeError(`${path} contains a sparse, decorated, or accessor array.`);
    for (let index = 0; index < value.length; index += 1) { const descriptor = Object.getOwnPropertyDescriptor(value, String(index)); if (!descriptor?.enumerable || !("value" in descriptor)) throw new TypeError(`${path} contains a sparse, decorated, or accessor array.`); }
    const normalized = value.map((entry, index) => stableValue(entry, `${path}[${index}]`, ancestors));
    ancestors.delete(value);
    return normalized;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${path} contains a non-JSON object.`);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === "symbol") || ownKeys.some((key) => { const descriptor = Object.getOwnPropertyDescriptor(value, key); return !descriptor?.enumerable || !("value" in descriptor); })) throw new TypeError(`${path} contains a symbol, hidden property, or accessor.`);
  const normalized = Object.create(null);
  for (const key of Object.keys(value).sort(compareCodeUnits)) normalized[key] = stableValue(value[key], `${path}.${key}`, ancestors);
  ancestors.delete(value);
  return normalized;
};
export const stableApplicationJson = (value) => JSON.stringify(stableValue(value));
export const digestApplicationValue = (value) => createHash("sha256").update(stableApplicationJson(value)).digest("hex");
export function deepFreezeApplicationValue(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreezeApplicationValue(child, seen);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

export const APPLICATION_VALUE_SCHEMA = deepFreezeApplicationValue({
  $schema: DRAFT_2020_12,
  $id: APPLICATION_VALUE_SCHEMA_ID,
  type: "object",
  additionalProperties: false,
  required: ["kind", "value"],
  properties: { kind: { type: "string", enum: ["agent-plan", "artifact", "external-receipt", "json", "text"] }, value: {} },
});
const PORT_ENDPOINT_SCHEMA = deepFreezeApplicationValue({
  type: "object", additionalProperties: false, required: ["node", "port"],
  properties: {
    node: { type: "string", pattern: SAFE_NODE_ID, maxLength: 120 },
    port: { type: "string", pattern: SAFE_NODE_ID, maxLength: 120 },
  },
});
export const APPLICATION_MANIFEST_SCHEMA = deepFreezeApplicationValue({
  $schema: DRAFT_2020_12, $id: APPLICATION_MANIFEST_SCHEMA_ID, type: "object", additionalProperties: false,
  required: ["schemaVersion", "invocation", "application", "source", "runtimeProof", "nodes", "edges", "entrypoints", "outputs", "bounds"],
  properties: {
    schemaVersion: { const: APPLICATION_MANIFEST_SCHEMA_ID },
    invocation: {
      type: "object", additionalProperties: false, required: ["action", "semantic", "bindings"],
      properties: {
        action: { const: APPLICATION_INVOCATION.action }, semantic: { const: APPLICATION_INVOCATION.semantic },
        bindings: { type: "array", prefixItems: APPLICATION_INVOCATION.bindings.map((binding) => ({ const: binding })), minItems: 4, maxItems: 4 },
      },
    },
    application: {
      type: "object", additionalProperties: false, required: ["id", "revision"],
      properties: { id: { type: "string", pattern: SAFE_ID, maxLength: 120 }, revision: { type: "string", pattern: EXACT_REVISION, maxLength: 40 } },
    },
    source: {
      type: "object", additionalProperties: false, required: ["uri", "sha256"],
      properties: { uri: { type: "string", pattern: SOURCE_URI, maxLength: 512 }, sha256: { type: "string", pattern: SHA256 } },
    },
    runtimeProof: {
      type: "object", additionalProperties: false, required: ["catalogDigest", "adapterPolicyDigest"],
      properties: { catalogDigest: { type: "string", pattern: SHA256 }, adapterPolicyDigest: { type: "string", pattern: SHA256 } },
    },
    nodes: {
      type: "array", minItems: 1, maxItems: MAX_NODES,
      items: {
        type: "object", additionalProperties: false, required: ["id", "component", "config"],
        properties: {
          id: { type: "string", pattern: SAFE_NODE_ID, maxLength: 120 },
          component: {
            type: "object", additionalProperties: false, required: ["id", "revision"],
            properties: { id: { type: "string", pattern: SAFE_ID, maxLength: 120 }, revision: { type: "string", pattern: EXACT_REVISION, maxLength: 40 } },
          },
          config: { type: "object" },
        },
      },
    },
    edges: {
      type: "array", maxItems: MAX_EDGES,
      items: { type: "object", additionalProperties: false, required: ["from", "to"], properties: { from: PORT_ENDPOINT_SCHEMA, to: PORT_ENDPOINT_SCHEMA } },
    },
    entrypoints: { type: "array", minItems: 1, maxItems: MAX_NODES, items: PORT_ENDPOINT_SCHEMA },
    outputs: {
      type: "array", minItems: 1, maxItems: MAX_NODES,
      items: {
        type: "object", additionalProperties: false, required: ["name", "node", "port"],
        properties: { name: { type: "string", pattern: SAFE_NODE_ID, maxLength: 120 }, node: PORT_ENDPOINT_SCHEMA.properties.node, port: PORT_ENDPOINT_SCHEMA.properties.port },
      },
    },
    bounds: {
      type: "object", additionalProperties: false, required: ["maxSteps", "maxRuntimeMs", "maxOutputBytes"],
      properties: {
        maxSteps: { type: "integer", minimum: 1, maximum: MAX_NODES }, maxRuntimeMs: { type: "integer", minimum: 1000, maximum: 60000 },
        maxOutputBytes: { type: "integer", minimum: 1024, maximum: 1048576 },
      },
    },
  },
});

const schemaValidator = (schema) => {
  const digest = digestApplicationValue(schema);
  if (!validatorCache.has(digest)) validatorCache.set(digest, validatorFactory.getValidator(schema));
  return validatorCache.get(digest);
};
const validateJsonSchema = (schema, value) => {
  try {
    const result = schemaValidator(schema)(value);
    return result.valid ? [] : [result.errorMessage || "JSON Schema validation failed."];
  } catch (error) { return [`JSON Schema could not be compiled: ${error instanceof Error ? error.message : String(error)}`]; }
};
const exactKeys = (value, expected, label, errors) => {
  if (!isRecord(value)) { errors.push(`${label} must be an object.`); return; }
  const expectedSet = new Set(expected);
  for (const key of Object.keys(value)) if (!expectedSet.has(key)) errors.push(`${label}.${key} is unsupported.`);
  for (const key of expected) if (!(key in value)) errors.push(`${label}.${key} is required.`);
};
const validId = (value) => new RegExp(SAFE_ID).test(String(value || ""));
const validRevision = (value) => new RegExp(EXACT_REVISION).test(String(value || ""));
const normalizePort = (port, direction, label, errors) => {
  const keys = direction === "input" ? ["name", "schemaRef", "kinds", "required"] : ["name", "schemaRef", "kinds"];
  const kinds = Array.isArray(port?.kinds) ? port.kinds : [];
  exactKeys(port, keys, label, errors);
  if (!validId(port?.name) || String(port?.name).length > 120) errors.push(`${label}.name is invalid.`);
  if (port?.schemaRef !== APPLICATION_VALUE_SCHEMA_ID) errors.push(`${label}.schemaRef is unsupported.`);
  if (!Array.isArray(port?.kinds) || !port.kinds.length || new Set(port.kinds).size !== port.kinds.length) errors.push(`${label}.kinds must be a non-empty unique array.`);
  for (const kind of kinds) if (!APPLICATION_VALUE_SCHEMA.properties.kind.enum.includes(kind)) errors.push(`${label}.kinds contains unsupported ${kind}.`);
  if (direction === "input" && typeof port?.required !== "boolean") errors.push(`${label}.required must be boolean.`);
  return deepFreezeApplicationValue({ name: port?.name, schemaRef: port?.schemaRef, schema: APPLICATION_VALUE_SCHEMA, schemaDigest: digestApplicationValue(APPLICATION_VALUE_SCHEMA), kinds: [...kinds].sort(compareCodeUnits), ...(direction === "input" ? { required: port?.required } : {}) });
};
const normalizeCapabilities = (entries, label, errors, { nonEmpty = false } = {}) => {
  if (!Array.isArray(entries) || (nonEmpty && !entries.length) || entries.length > 32) { errors.push(`${label} must be ${nonEmpty ? "a non-empty" : "an"} array with at most 32 entries.`); return []; }
  const normalized = entries.map((entry, index) => {
    exactKeys(entry, ["id", "revision"], `${label}[${index}]`, errors);
    if (!validId(entry?.id) || !validId(entry?.revision)) errors.push(`${label}[${index}] is invalid.`);
    return { id: entry?.id, revision: entry?.revision };
  }).sort((left, right) => compareCodeUnits(left.id, right.id) || compareCodeUnits(left.revision, right.revision));
  if (new Set(normalized.map((entry) => `${entry.id}@${entry.revision}`)).size !== normalized.length) errors.push(`${label} contains duplicates.`);
  return normalized;
};

export function validateApplicationComponentCatalog(document = componentCatalogDocument) {
  const errors = [];
  exactKeys(document, ["schemaVersion", "catalogRevision", "components"], "catalog", errors);
  if (document?.schemaVersion !== APPLICATION_COMPONENT_CATALOG_SCHEMA_ID) errors.push(`catalog.schemaVersion must equal ${APPLICATION_COMPONENT_CATALOG_SCHEMA_ID}.`);
  if (!validRevision(document?.catalogRevision)) errors.push("catalog.catalogRevision must be an exact semantic revision.");
  if (!Array.isArray(document?.components) || !document.components.length || document.components.length > MAX_COMPONENTS) errors.push(`catalog.components must contain 1-${MAX_COMPONENTS} entries.`);
  const normalized = [];
  const keys = new Set();
  for (const [index, component] of (Array.isArray(document?.components) ? document.components : []).entries()) {
    const label = `catalog.components[${index}]`;
    const errorCount = errors.length;
    if (!isRecord(component)) { errors.push(`${label} must be an object.`); continue; }
    exactKeys(component, ["id", "revision", "title", "description", "stability", "inputs", "outputs", "configSchema", "runtime", "migrations"], label, errors);
    if (!validId(component?.id) || !validRevision(component?.revision)) errors.push(`${label} requires a valid id and exact revision.`);
    const key = `${component?.id}@${component?.revision}`;
    if (keys.has(key)) errors.push(`${label} duplicates ${key}.`);
    keys.add(key);
    if (typeof component?.title !== "string" || !component.title.trim() || component.title.length > 160) errors.push(`${label}.title must be a non-empty string of at most 160 characters.`);
    if (typeof component?.description !== "string" || !component.description.trim() || component.description.length > 500) errors.push(`${label}.description must be a non-empty string of at most 500 characters.`);
    if (!["experimental", "stable", "deprecated"].includes(component?.stability)) errors.push(`${label}.stability is invalid.`);
    if (!Array.isArray(component?.inputs) || component.inputs.length > 32 || !Array.isArray(component?.outputs) || !component?.outputs?.length || component.outputs.length > 32) errors.push(`${label} inputs and outputs must be arrays with at most 32 entries, and outputs must be non-empty.`);
    const inputs = (Array.isArray(component?.inputs) ? component.inputs.slice(0, 33) : []).map((port, portIndex) => normalizePort(port, "input", `${label}.inputs[${portIndex}]`, errors));
    const outputs = (Array.isArray(component?.outputs) ? component.outputs.slice(0, 33) : []).map((port, portIndex) => normalizePort(port, "output", `${label}.outputs[${portIndex}]`, errors));
    for (const [direction, ports] of [["inputs", inputs], ["outputs", outputs]]) if (new Set(ports.map((port) => port.name)).size !== ports.length) errors.push(`${label}.${direction} contains duplicate names.`);
    if (!isRecord(component?.configSchema) || component.configSchema.$schema !== DRAFT_2020_12 || component.configSchema.additionalProperties !== false) errors.push(`${label}.configSchema must be a closed Draft 2020-12 schema.`);
    else try { schemaValidator(component.configSchema); } catch (error) { errors.push(`${label}.configSchema is invalid: ${error instanceof Error ? error.message : String(error)}`); }
    const runtimeKeys = ["adapterKind", "interfaceId", "interfaceRevision", "ownerId", "riskClass", "readiness", "providedCapabilities", "requiredCapabilities", "sideEffect", "replay"];
    exactKeys(component?.runtime, runtimeKeys, `${label}.runtime`, errors);
    if (!validId(component?.runtime?.adapterKind)) errors.push(`${label}.runtime.adapterKind is invalid.`);
    if (component?.runtime?.interfaceId !== APPLICATION_ADAPTER_INTERFACE_ID) errors.push(`${label}.runtime.interfaceId must equal ${APPLICATION_ADAPTER_INTERFACE_ID}.`);
    if (component?.runtime?.interfaceRevision !== APPLICATION_ADAPTER_INTERFACE_REVISION) errors.push(`${label}.runtime.interfaceRevision must equal ${APPLICATION_ADAPTER_INTERFACE_REVISION}.`);
    for (const field of ["ownerId", "riskClass", "readiness"]) if (!validId(component?.runtime?.[field])) errors.push(`${label}.runtime.${field} is invalid.`);
    const providedCapabilities = normalizeCapabilities(component?.runtime?.providedCapabilities, `${label}.runtime.providedCapabilities`, errors);
    const requiredCapabilities = normalizeCapabilities(component?.runtime?.requiredCapabilities, `${label}.runtime.requiredCapabilities`, errors, { nonEmpty: true });
    if (!Array.isArray(component?.migrations) || component.migrations.length) errors.push(`${label}.migrations must be empty in catalog v1; migration metadata requires a future closed schema revision.`);
    if (!["none", "external-write"].includes(component?.runtime?.sideEffect)) errors.push(`${label}.runtime.sideEffect is invalid.`);
    if (!["safe", "idempotency-key"].includes(component?.runtime?.replay)) errors.push(`${label}.runtime.replay is invalid.`);
    if (errors.length > errorCount) continue;
    const sourceDigest = digestApplicationValue(component);
    const normalizedBase = {
      ...structuredClone(component), source: { catalogSchemaVersion: document.schemaVersion, catalogRevision: document.catalogRevision, sourceDigest },
      inputs, outputs, configSchemaDigest: digestApplicationValue(component.configSchema),
      runtime: { ...component.runtime, providedCapabilities, requiredCapabilities }, migrations: [...(component.migrations || [])],
    };
    normalized.push(deepFreezeApplicationValue({ ...normalizedBase, definitionDigest: digestApplicationValue(normalizedBase) }));
  }
  if (errors.length) return { ok: false, errors, catalog: null, catalogDigest: "" };
  normalized.sort((left, right) => compareCodeUnits(left.id, right.id) || compareCodeUnits(left.revision, right.revision));
  const catalog = deepFreezeApplicationValue({ schemaVersion: document.schemaVersion, catalogRevision: document.catalogRevision, components: normalized });
  return { ok: true, errors: [], catalog, catalogDigest: digestApplicationValue(catalog) };
}

const catalogValidation = validateApplicationComponentCatalog();
if (!catalogValidation.ok) throw new Error(`Invalid application component catalog: ${catalogValidation.errors.join(" ")}`);
export const APPLICATION_COMPONENT_CATALOG = catalogValidation.catalog;
export const APPLICATION_COMPONENT_CATALOG_DIGEST = catalogValidation.catalogDigest;
export const listApplicationComponents = () => APPLICATION_COMPONENT_CATALOG.components.map((component) => structuredClone(component));

const componentByRef = (catalog, ref) => catalog.components.find((component) => component.id === ref.id && component.revision === ref.revision);
const portByName = (ports, name) => ports.find((port) => port.name === name);
const endpointKey = (endpoint) => `${endpoint.node}.${endpoint.port}`;
const walk = (seeds, adjacency) => {
  const visited = new Set(seeds);
  const pending = [...seeds];
  while (pending.length) for (const next of adjacency.get(pending.shift()) || []) if (!visited.has(next)) { visited.add(next); pending.push(next); }
  return visited;
};
export const digestApplicationManifestSource = (manifest) => {
  const { sha256: ignored, ...source } = manifest.source;
  return digestApplicationValue({
    ...manifest,
    source,
    nodes: [...manifest.nodes].sort((left, right) => compareCodeUnits(left.id, right.id)),
    edges: [...manifest.edges].sort((left, right) => compareCodeUnits(endpointKey(left.from), endpointKey(right.from)) || compareCodeUnits(endpointKey(left.to), endpointKey(right.to))),
    entrypoints: [...manifest.entrypoints].sort((left, right) => compareCodeUnits(endpointKey(left), endpointKey(right))),
    outputs: [...manifest.outputs].sort((left, right) => compareCodeUnits(left.name, right.name) || compareCodeUnits(endpointKey(left), endpointKey(right))),
  });
};

export function compileApplicationManifest(raw, { catalog = APPLICATION_COMPONENT_CATALOG, catalogDigest = digestApplicationValue(catalog) } = {}) {
  const diagnostics = [];
  let serialized;
  try { serialized = stableApplicationJson(raw); } catch (error) { diagnostics.push({ code: "manifest_not_json", message: error instanceof Error ? error.message : String(error) }); }
  if (typeof serialized !== "string") diagnostics.push({ code: "manifest_not_json", message: "Application manifest must be a JSON value." });
  else if (Buffer.byteLength(serialized) > MAX_MANIFEST_BYTES) diagnostics.push({ code: "manifest_too_large", message: `Application manifest exceeds ${MAX_MANIFEST_BYTES} bytes.` });
  if (diagnostics.length) return { ok: false, diagnostics };
  for (const message of validateJsonSchema(APPLICATION_MANIFEST_SCHEMA, raw)) diagnostics.push({ code: "manifest_schema_invalid", message });
  if (diagnostics.length) return { ok: false, diagnostics };
  if (stableApplicationJson(raw.invocation.bindings) !== stableApplicationJson(APPLICATION_INVOCATION.bindings)) diagnostics.push({ code: "invocation_mismatch", message: "Invocation bindings must equal the canonical ordered tuple." });
  if (raw.source.sha256 !== digestApplicationManifestSource(raw)) diagnostics.push({ code: "manifest_source_drift", message: "source.sha256 must equal the canonical manifest projection excluding only source.sha256." });
  if (raw.runtimeProof.catalogDigest !== catalogDigest) diagnostics.push({ code: "catalog_revision_mismatch", message: "runtimeProof.catalogDigest does not match the exact active component catalog." });
  const nodes = [...raw.nodes].sort((left, right) => compareCodeUnits(left.id, right.id));
  if (new Set(nodes.map((node) => node.id)).size !== nodes.length) diagnostics.push({ code: "duplicate_node", message: "Application node ids must be unique." });
  const resolved = new Map();
  const effectiveOutputKinds = new Map();
  for (const node of nodes) {
    const component = componentByRef(catalog, node.component);
    if (!component) {
      const available = catalog.components.filter((entry) => entry.id === node.component.id);
      diagnostics.push({ code: available.length ? "component_migration_required" : "component_unavailable", message: available.length ? `${node.component.id}@${node.component.revision} is unavailable; explicit migration is required.` : `${node.component.id}@${node.component.revision} is unavailable.`, nodeId: node.id, requested: node.component, availableRevisions: available.map((entry) => entry.revision), migrations: available.flatMap((entry) => entry.migrations) });
      continue;
    }
    for (const message of validateJsonSchema(component.configSchema, node.config)) diagnostics.push({ code: "component_config_invalid", message, nodeId: node.id, component: node.component });
    resolved.set(node.id, component);
    effectiveOutputKinds.set(node.id, Object.fromEntries(component.outputs.map((port) => [port.name, component.id === "core.input" && port.name === "value" && node.config?.value?.kind ? [node.config.value.kind] : [...port.kinds]])));
  }
  const incoming = new Map(nodes.map((node) => [node.id, new Map()]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  const reverse = new Map(nodes.map((node) => [node.id, []]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const edgeKeys = new Set();
  const edges = [...raw.edges].sort((left, right) => compareCodeUnits(endpointKey(left.from), endpointKey(right.from)) || compareCodeUnits(endpointKey(left.to), endpointKey(right.to)));
  for (const edge of edges) {
    const edgeKey = `${endpointKey(edge.from)}->${endpointKey(edge.to)}`;
    if (edgeKeys.has(edgeKey)) { diagnostics.push({ code: "duplicate_edge", message: `Duplicate edge ${edgeKey}.` }); continue; }
    edgeKeys.add(edgeKey);
    const source = resolved.get(edge.from.node);
    const target = resolved.get(edge.to.node);
    if (!source || !target) { diagnostics.push({ code: "edge_node_unavailable", message: `Edge ${edgeKey} references an unavailable node.` }); continue; }
    const sourcePort = portByName(source.outputs, edge.from.port);
    const targetPort = portByName(target.inputs, edge.to.port);
    if (!sourcePort || !targetPort) { diagnostics.push({ code: "edge_port_unavailable", message: `Edge ${edgeKey} references an unavailable port.` }); continue; }
    const sourceKinds = effectiveOutputKinds.get(edge.from.node)[edge.from.port] || [];
    if (sourcePort.schemaDigest !== targetPort.schemaDigest || !sourceKinds.every((kind) => targetPort.kinds.includes(kind))) diagnostics.push({ code: "edge_type_mismatch", message: `Edge ${edgeKey} output kinds must be assignable to its input.` });
    const prior = incoming.get(edge.to.node).get(edge.to.port);
    if (prior) diagnostics.push({ code: "input_fan_in_forbidden", message: `Input ${endpointKey(edge.to)} accepts exactly one producer.` });
    else incoming.get(edge.to.node).set(edge.to.port, edge);
    outgoing.get(edge.from.node).push(edge.to.node);
    reverse.get(edge.to.node).push(edge.from.node);
    indegree.set(edge.to.node, indegree.get(edge.to.node) + 1);
  }
  for (const node of nodes) for (const port of resolved.get(node.id)?.inputs || []) if (port.required && !incoming.get(node.id).has(port.name)) diagnostics.push({ code: "required_input_missing", message: `Required input ${node.id}.${port.name} is not connected.`, nodeId: node.id });
  if (new Set(raw.entrypoints.map(endpointKey)).size !== raw.entrypoints.length) diagnostics.push({ code: "duplicate_entrypoint", message: "Application entrypoints must be unique." });
  if (new Set(raw.outputs.map((output) => output.name)).size !== raw.outputs.length || new Set(raw.outputs.map(endpointKey)).size !== raw.outputs.length) diagnostics.push({ code: "duplicate_output", message: "Application output names and endpoints must be unique." });
  for (const endpoint of raw.entrypoints) {
    const component = resolved.get(endpoint.node);
    if (!component || !portByName(component.outputs, endpoint.port)) diagnostics.push({ code: "entrypoint_unavailable", message: `Entrypoint ${endpointKey(endpoint)} is unavailable.` });
    else if (component.inputs.length || incoming.get(endpoint.node).size) diagnostics.push({ code: "entrypoint_not_source", message: `Entrypoint ${endpointKey(endpoint)} must belong to an input-free source node.` });
  }
  for (const output of raw.outputs) if (!portByName(resolved.get(output.node)?.outputs || [], output.port)) diagnostics.push({ code: "output_unavailable", message: `Output ${output.name} references unavailable ${endpointKey(output)}.` });
  const entryNodes = new Set(raw.entrypoints.map((entry) => entry.node));
  for (const node of nodes) if (indegree.get(node.id) === 0 && !entryNodes.has(node.id)) diagnostics.push({ code: "source_not_declared", message: `Source node ${node.id} must be a declared entrypoint.` });
  const outputNodes = new Set(raw.outputs.map((output) => output.node));
  for (const node of nodes) if (!outgoing.get(node.id).length && !outputNodes.has(node.id)) diagnostics.push({ code: "sink_not_declared", message: `Sink node ${node.id} must be a declared output.` });
  const reachable = walk(entryNodes, outgoing);
  const productive = walk(outputNodes, reverse);
  for (const output of raw.outputs) if (!reachable.has(output.node)) diagnostics.push({ code: "output_unreachable", message: `Output ${output.name} is unreachable from an entrypoint.` });
  for (const node of nodes) if (!reachable.has(node.id) || !productive.has(node.id)) diagnostics.push({ code: "node_unreachable", message: `Node ${node.id} must lie on a declared entrypoint-to-output path.` });
  if (!nodes.some((node) => node.component.id === "core.output")) diagnostics.push({ code: "output_missing", message: "Application graph requires at least one core.output node." });
  const ready = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id).sort(compareCodeUnits);
  const executionOrder = [];
  while (ready.length) {
    const nodeId = ready.shift();
    executionOrder.push(nodeId);
    for (const nextId of [...outgoing.get(nodeId)].sort(compareCodeUnits)) {
      indegree.set(nextId, indegree.get(nextId) - 1);
      if (indegree.get(nextId) === 0) { ready.push(nextId); ready.sort(compareCodeUnits); }
    }
  }
  if (executionOrder.length !== nodes.length) diagnostics.push({ code: "graph_cycle", message: "Application graph must be acyclic." });
  if (raw.bounds.maxSteps < nodes.length) diagnostics.push({ code: "step_bound_too_small", message: "bounds.maxSteps must cover every graph node." });
  if (diagnostics.length) return { ok: false, diagnostics };
  const entrypoints = [...raw.entrypoints].sort((left, right) => compareCodeUnits(endpointKey(left), endpointKey(right)));
  const outputs = [...raw.outputs].sort((left, right) => compareCodeUnits(left.name, right.name) || compareCodeUnits(endpointKey(left), endpointKey(right)));
  const manifest = deepFreezeApplicationValue({ ...structuredClone(raw), nodes: structuredClone(nodes), edges: structuredClone(edges), entrypoints: structuredClone(entrypoints), outputs: structuredClone(outputs) });
  const resolvedComponents = Object.fromEntries(nodes.map((node) => [node.id, resolved.get(node.id)]));
  return { ok: true, diagnostics: [], manifest, manifestDigest: digestApplicationValue(manifest), catalogDigest, executionOrder: deepFreezeApplicationValue(executionOrder), resolvedComponents: deepFreezeApplicationValue(resolvedComponents), effectiveOutputKinds: deepFreezeApplicationValue(Object.fromEntries(effectiveOutputKinds)) };
}
