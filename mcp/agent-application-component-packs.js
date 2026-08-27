import {
  APPLICATION_COMPONENT_CATALOG,
  APPLICATION_COMPONENT_CATALOG_DIGEST,
  APPLICATION_COMPONENT_CATALOG_SCHEMA_ID,
  deepFreezeApplicationValue,
  digestApplicationValue,
  stableApplicationJson,
  validateApplicationComponentCatalog,
} from "../contracts/agent-application.schema.js";
import { createApplicationAdapterRegistry } from "./agent-application-adapter-registry.js";

export const APPLICATION_COMPONENT_PACK_SCHEMA_ID = "agenticgraph.application-component-pack/v1";
export const APPLICATION_COMPONENT_PACK_POLICY_SCHEMA_ID = "agenticgraph.application-component-pack-policy/v1";

const PACK_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const EXACT_REVISION = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const ID_SEGMENT = "[a-z0-9]+(?:[._-][a-z0-9]+)*";
const SOURCE_URI = new RegExp(`^(?:workspace:/${ID_SEGMENT}(?:/${ID_SEGMENT})*|kgdoc:${ID_SEGMENT}(?:/${ID_SEGMENT})*|urn:agenticgraph:(?!(?:http|https|file|ftp|ws|wss)(?::|$))${ID_SEGMENT}(?::${ID_SEGMENT})*)$`);
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_PACKS = 16;
const MAX_PACK_COMPONENTS = 16;
const MAX_COMPONENTS = 100;
const MAX_PACK_BYTES = 256 * 1024;
const MAX_CONFIG_SCHEMA_DEPTH = 32;
const MAX_CONFIG_SCHEMA_NODES = 2048;
const MAX_CONFIG_PROPERTIES = 128;
const compareCodeUnits = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const componentKey = (component) => `${component.id}@${component.revision}`;
const refKey = (reference) => `${reference.id}@${reference.revision}`;
const CONTROL_CONFIG_NAMES = new Set(["accessmaterial", "adapter", "address", "apikey", "apitokenvalue", "approval", "args", "arguments", "auth", "authorization", "baseurl", "binary", "callback", "cmd", "command", "commandline", "commands", "connection", "connectionstring", "credential", "credentials", "cwd", "destination", "directory", "dsn", "endpoint", "endpoints", "endpointurl", "env", "environment", "executable", "filepath", "header", "headers", "host", "hostname", "module", "modulepath", "package", "packages", "path", "port", "ports", "process", "processspec", "provider", "proxy", "rawmcpobject", "rawtoolresult", "redirect", "registry", "secret", "secrets", "settingsmap", "shell", "shellscript", "socket", "token", "tokens", "transport", "uri", "url", "webhook", "workingdirectory"]);
const CONFIG_PROPERTY_NAME = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/;
const FORBIDDEN_SCHEMA_KEYS = new Set(["$anchor", "$defs", "$dynamicAnchor", "$dynamicRef", "$id", "$recursiveAnchor", "$recursiveRef", "$ref", "$vocabulary", "definitions", "dependencies", "format", "pattern", "patternProperties"]);
const ALLOWED_SCHEMA_KEYS = new Set([
  "$comment", "$schema", "additionalProperties", "allOf", "anyOf", "const", "contains", "default", "dependentRequired", "dependentSchemas", "deprecated", "description", "else", "enum", "examples", "exclusiveMaximum", "exclusiveMinimum", "if", "items", "maxContains", "maximum", "maxItems", "maxLength", "maxProperties", "minContains", "minimum", "minItems", "minLength", "minProperties", "multipleOf", "not", "oneOf", "prefixItems", "properties", "propertyNames", "readOnly", "required", "then", "title", "type", "unevaluatedProperties", "uniqueItems", "writeOnly",
]);
const SINGLE_SCHEMA_KEYS = ["contains", "else", "if", "items", "not", "propertyNames", "then"];
const ARRAY_SCHEMA_KEYS = ["allOf", "anyOf", "oneOf", "prefixItems"];

const exactDataRecord = (value, keys) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return false;
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length && ownKeys.every((key) => {
    const descriptor = typeof key === "string" ? Object.getOwnPropertyDescriptor(value, key) : null;
    return descriptor?.enumerable === true && "value" in descriptor && keys.includes(key);
  });
};
const exactDataArray = (value, max, { min = 0 } = {}) => {
  if (!Array.isArray(value) || value.length < min || value.length > max) return false;
  const expected = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
  return Reflect.ownKeys(value).length === expected.size && Reflect.ownKeys(value).every((key) => typeof key === "string" && expected.has(key))
    && Array.from({ length: value.length }, (_, index) => Object.getOwnPropertyDescriptor(value, String(index))).every((descriptor) => descriptor?.enumerable === true && "value" in descriptor);
};
const dataRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const normalizeConfigName = (value) => String(value).normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g, "");
const assertConfigPropertyName = (name, path) => {
  if (name !== name.normalize("NFKC") || !CONFIG_PROPERTY_NAME.test(name)) throw new TypeError(`${path} must use a normalized ASCII config-property identifier.`);
  if (CONTROL_CONFIG_NAMES.has(normalizeConfigName(name))) throw new TypeError(`${path} is a forbidden control-plane field.`);
};
const assertPackConfigSchema = (schema, label) => {
  const pending = [{ schema, path: label, depth: 0 }];
  let nodes = 0;
  const queue = (child, path, depth) => {
    if (!dataRecord(child)) throw new TypeError(`${path} must be an explicit object schema.`);
    pending.push({ schema: child, path, depth });
  };
  while (pending.length) {
    const current = pending.pop();
    if (current.depth > MAX_CONFIG_SCHEMA_DEPTH) throw new TypeError(`${label} exceeds schema depth ${MAX_CONFIG_SCHEMA_DEPTH}.`);
    if (++nodes > MAX_CONFIG_SCHEMA_NODES) throw new TypeError(`${label} exceeds ${MAX_CONFIG_SCHEMA_NODES} schema nodes.`);
    const value = current.schema;
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_SCHEMA_KEYS.has(key)) throw new TypeError(`${current.path}.${key} is forbidden for host component packs.`);
      if (!ALLOWED_SCHEMA_KEYS.has(key)) throw new TypeError(`${current.path}.${key} is not part of the closed host component-pack schema dialect.`);
    }
    const types = typeof value.type === "string" ? [value.type] : Array.isArray(value.type) ? value.type : [];
    const compositions = ARRAY_SCHEMA_KEYS.filter((key) => Object.hasOwn(value, key));
    const hasScalarConstraint = Object.hasOwn(value, "const") || Object.hasOwn(value, "enum");
    if (!types.length && !compositions.length && !hasScalarConstraint) throw new TypeError(`${current.path} must declare an explicit type, scalar enum/const, or closed composition.`);
    if (hasScalarConstraint) {
      const candidates = Object.hasOwn(value, "enum") ? value.enum : [value.const];
      if (!Array.isArray(candidates) || candidates.some((entry) => entry !== null && typeof entry === "object")) throw new TypeError(`${current.path} enum/const values must be scalar.`);
    }
    const objectSchema = types.includes("object") || Object.hasOwn(value, "properties") || Object.hasOwn(value, "additionalProperties");
    if (objectSchema && value.additionalProperties !== false) throw new TypeError(`${current.path} object schemas must set additionalProperties to false.`);
    if (Object.hasOwn(value, "unevaluatedProperties") && value.unevaluatedProperties !== false) throw new TypeError(`${current.path}.unevaluatedProperties must be false when present.`);
    if (Object.hasOwn(value, "properties")) {
      if (!dataRecord(value.properties) || Object.keys(value.properties).length > MAX_CONFIG_PROPERTIES) throw new TypeError(`${current.path}.properties must be a bounded object map.`);
      for (const [name, child] of Object.entries(value.properties)) {
        assertConfigPropertyName(name, `${current.path}.properties.${name}`);
        queue(child, `${current.path}.properties.${name}`, current.depth + 1);
      }
    }
    if (types.includes("array")) {
      if (!dataRecord(value.items) || !Number.isInteger(value.maxItems) || value.maxItems < 0 || value.maxItems > 1024) throw new TypeError(`${current.path} arrays require an object items schema and maxItems of at most 1024.`);
    }
    for (const key of SINGLE_SCHEMA_KEYS) if (Object.hasOwn(value, key)) queue(value[key], `${current.path}.${key}`, current.depth + 1);
    for (const key of ARRAY_SCHEMA_KEYS) if (Object.hasOwn(value, key)) {
      if (!Array.isArray(value[key]) || value[key].length < 1 || value[key].length > 32) throw new TypeError(`${current.path}.${key} must contain 1-32 schemas.`);
      value[key].forEach((child, index) => queue(child, `${current.path}.${key}[${index}]`, current.depth + 1));
    }
    if (Object.hasOwn(value, "dependentSchemas")) {
      if (!dataRecord(value.dependentSchemas) || Object.keys(value.dependentSchemas).length > MAX_CONFIG_PROPERTIES) throw new TypeError(`${current.path}.dependentSchemas must be a bounded schema map.`);
      for (const [name, child] of Object.entries(value.dependentSchemas)) {
        assertConfigPropertyName(name, `${current.path}.dependentSchemas.${name}`);
        queue(child, `${current.path}.dependentSchemas.${name}`, current.depth + 1);
      }
    }
  }
};
const cleanJson = (value) => JSON.parse(stableApplicationJson(value));
const canonicalPackProjection = (pack) => {
  const clean = cleanJson(pack);
  const source = clean.source && typeof clean.source === "object" && !Array.isArray(clean.source) ? clean.source : {};
  const { sha256: ignored, ...sourceWithoutDigest } = source;
  const components = Array.isArray(clean.components) ? [...clean.components].sort((left, right) => compareCodeUnits(componentKey(left), componentKey(right))) : clean.components;
  return { ...clean, source: sourceWithoutDigest, components };
};

export const digestApplicationComponentPackSource = (pack) => digestApplicationValue(canonicalPackProjection(pack));

const normalizePack = (rawPack) => {
  let serialized;
  try { serialized = stableApplicationJson(rawPack); } catch (error) { throw new TypeError(`Component pack must be pure JSON data: ${error instanceof Error ? error.message : String(error)}`); }
  if (Buffer.byteLength(serialized, "utf8") > MAX_PACK_BYTES) throw new TypeError(`Component pack exceeds ${MAX_PACK_BYTES} canonical bytes.`);
  const pack = JSON.parse(serialized);
  if (!exactDataRecord(pack, ["schemaVersion", "id", "revision", "source", "components"])) throw new TypeError("Component pack must use the exact closed data contract.");
  if (pack.schemaVersion !== APPLICATION_COMPONENT_PACK_SCHEMA_ID || !PACK_ID.test(pack.id) || pack.id.length > 120 || !EXACT_REVISION.test(pack.revision) || pack.revision.length > 40) throw new TypeError("Component pack identity or revision is invalid.");
  if (!exactDataRecord(pack.source, ["uri", "sha256"]) || typeof pack.source.uri !== "string" || pack.source.uri.length > 512 || !SOURCE_URI.test(pack.source.uri) || !SHA256.test(pack.source.sha256)) throw new TypeError("Component pack source must be an allowed inert source URI with canonical SHA-256.");
  if (!exactDataArray(pack.components, MAX_PACK_COMPONENTS, { min: 1 })) throw new TypeError(`Component pack components must be an exact array with 1-${MAX_PACK_COMPONENTS} entries.`);
  if (digestApplicationComponentPackSource(pack) !== pack.source.sha256) throw new TypeError("Component pack source SHA-256 does not match its canonical definition.");
  pack.components.forEach((component, index) => assertPackConfigSchema(component?.configSchema, `pack.components[${index}].configSchema`));
  const validation = validateApplicationComponentCatalog({ schemaVersion: APPLICATION_COMPONENT_CATALOG_SCHEMA_ID, catalogRevision: pack.revision, components: pack.components });
  if (!validation.ok) throw new TypeError(`Component pack definition is invalid: ${validation.errors.join(" ")}`);
  const packSource = deepFreezeApplicationValue({ id: pack.id, revision: pack.revision, uri: pack.source.uri, sha256: pack.source.sha256 });
  const components = pack.components.map((component) => {
    const componentValidation = validateApplicationComponentCatalog({ schemaVersion: APPLICATION_COMPONENT_CATALOG_SCHEMA_ID, catalogRevision: component.revision, components: [component] });
    if (!componentValidation.ok) throw new TypeError(`Component pack member is invalid: ${componentValidation.errors.join(" ")}`);
    return componentValidation.catalog.components[0];
  }).sort((left, right) => compareCodeUnits(componentKey(left), componentKey(right)));
  const definitionDigest = digestApplicationValue({ schemaVersion: pack.schemaVersion, source: packSource, components: components.map((component) => ({ id: component.id, revision: component.revision, definitionDigest: component.definitionDigest })) });
  return deepFreezeApplicationValue({ schemaVersion: pack.schemaVersion, id: pack.id, revision: pack.revision, source: packSource, definitionDigest, components });
};

const buildCompositeCatalog = (packs) => {
  const normalizedPacks = packs.map(normalizePack).sort((left, right) => compareCodeUnits(left.id, right.id) || compareCodeUnits(left.revision, right.revision));
  if (new Set(normalizedPacks.map((pack) => pack.id)).size !== normalizedPacks.length) throw new TypeError("Component pack ids must be unique; select one exact revision per pack id.");
  if (new Set(normalizedPacks.map((pack) => pack.source.uri)).size !== normalizedPacks.length) throw new TypeError("Component pack source URIs must be unique.");
  const extensionComponents = normalizedPacks.flatMap((pack) => pack.components);
  const components = [...APPLICATION_COMPONENT_CATALOG.components, ...extensionComponents];
  if (components.length > MAX_COMPONENTS) throw new TypeError(`Composite component catalog exceeds ${MAX_COMPONENTS} entries.`);
  const keys = components.map(componentKey);
  if (new Set(keys).size !== keys.length) throw new TypeError("Composite component catalog contains a duplicate exact component reference.");
  components.sort((left, right) => compareCodeUnits(left.id, right.id) || compareCodeUnits(left.revision, right.revision));
  const componentPacks = normalizedPacks.map(({ components: ignored, ...pack }) => pack);
  const catalog = deepFreezeApplicationValue({
    schemaVersion: APPLICATION_COMPONENT_CATALOG.schemaVersion,
    catalogRevision: APPLICATION_COMPONENT_CATALOG.catalogRevision,
    componentPacks,
    components,
  });
  return { normalizedPacks, extensionComponents, catalog, catalogDigest: digestApplicationValue(catalog) };
};

const normalizeOwnerResolvers = (entries, extensionByKey) => {
  if (!exactDataArray(entries, MAX_COMPONENTS)) throw new TypeError("Component pack owner resolvers must be an exact bounded host array.");
  const normalized = entries.map((entry) => {
    if (!exactDataRecord(entry, ["component", "ownerId", "resolve"]) || !exactDataRecord(entry.component, ["id", "revision"]) || typeof entry.resolve !== "function") throw new TypeError("Component pack owner resolvers must use the exact host-only contract.");
    const key = refKey(entry.component);
    const component = extensionByKey.get(key);
    if (!component || entry.ownerId !== component.runtime.ownerId) throw new TypeError(`Component pack owner resolver mismatch for ${key}.`);
    return Object.freeze({ component: Object.freeze({ ...entry.component }), ownerId: entry.ownerId, resolve: entry.resolve });
  }).sort((left, right) => compareCodeUnits(refKey(left.component), refKey(right.component)));
  if (new Set(normalized.map((entry) => refKey(entry.component))).size !== normalized.length) throw new TypeError("Component pack owner resolver selection is ambiguous.");
  if (normalized.length !== extensionByKey.size) throw new TypeError("Every component pack component requires exactly one host owner resolver.");
  return normalized;
};

const assertAdapterBindings = (registry, extensionByKey, baseAdapterIds) => {
  for (const adapter of registry.adapters.filter((candidate) => !baseAdapterIds.has(candidate.id))) {
    if (adapter.supportedComponents.some((reference) => !extensionByKey.has(refKey(reference)))) throw new TypeError(`Component pack adapter ${adapter.id} attempts to own a non-pack component.`);
  }
  for (const [key, component] of extensionByKey) {
    const candidates = registry.adapters.filter((adapter) => adapter.supportedComponents.some((reference) => refKey(reference) === key));
    if (!candidates.length) throw new TypeError(`Component pack adapter is missing for ${key}.`);
    if (candidates.length !== 1) throw new TypeError(`Component pack adapter selection is ambiguous for ${key}.`);
    const [adapter] = candidates;
    const capabilityKeys = new Set(adapter.capabilities.map(refKey));
    if (adapter.adapterKind !== component.runtime.adapterKind) throw new TypeError(`Component pack adapter kind mismatch for ${key}.`);
    if (adapter.interfaceId !== component.runtime.interfaceId || adapter.interfaceRevision !== component.runtime.interfaceRevision) throw new TypeError(`Component pack adapter interface mismatch for ${key}.`);
    if (adapter.ownerId !== component.runtime.ownerId) throw new TypeError(`Component pack adapter owner mismatch for ${key}.`);
    if (adapter.sideEffect !== component.runtime.sideEffect) throw new TypeError(`Component pack adapter side-effect mismatch for ${key}.`);
    if (adapter.replay !== component.runtime.replay) throw new TypeError(`Component pack adapter replay mismatch for ${key}.`);
    if (!component.runtime.requiredCapabilities.every((capability) => capabilityKeys.has(refKey(capability)))) throw new TypeError(`Component pack adapter capability mismatch for ${key}.`);
  }
};

export function createApplicationComponentPackRegistry({ baseRegistry, packs = [], adapters = [], ownerResolvers = [] } = {}) {
  if (!baseRegistry || !Array.isArray(baseRegistry.adapters) || typeof baseRegistry.resolve !== "function" || typeof baseRegistry.resolveNodeOwnerEvidence !== "function" || !SHA256.test(baseRegistry.policyDigest)) throw new TypeError("Component packs require the exact default host adapter registry.");
  if (!exactDataArray(packs, MAX_PACKS) || !exactDataArray(adapters, MAX_COMPONENTS) || !exactDataArray(ownerResolvers, MAX_COMPONENTS)) throw new TypeError("Component pack host inputs must be exact bounded arrays.");
  if (!packs.length) {
    if (adapters.length || ownerResolvers.length) throw new TypeError("Component pack host bindings require at least one admitted pack.");
    return baseRegistry;
  }
  const { normalizedPacks, extensionComponents, catalog, catalogDigest } = buildCompositeCatalog(packs);
  const extensionByKey = new Map(extensionComponents.map((component) => [componentKey(component), component]));
  const owners = normalizeOwnerResolvers(ownerResolvers, extensionByKey);
  const normalizedBase = createApplicationAdapterRegistry([...baseRegistry.adapters]);
  const baseAdapterIds = new Set(normalizedBase.adapters.map((adapter) => adapter.id));
  const combined = createApplicationAdapterRegistry([...normalizedBase.adapters, ...adapters]);
  assertAdapterBindings(combined, extensionByKey, baseAdapterIds);
  const ownerByKey = new Map(owners.map((entry) => [refKey(entry.component), entry]));
  const componentPackPolicy = deepFreezeApplicationValue({
    schemaVersion: APPLICATION_COMPONENT_PACK_POLICY_SCHEMA_ID,
    baseCatalogDigest: APPLICATION_COMPONENT_CATALOG_DIGEST,
    catalogDigest,
    adapterPolicyDigest: combined.policyDigest,
    packs: normalizedPacks.map(({ components: ignored, ...pack }) => pack),
    owners: owners.map(({ resolve: ignored, ...owner }) => owner),
  });
  const policyDigest = digestApplicationValue(componentPackPolicy);
  const resolveNodeOwnerEvidence = (node, component, adapter) => {
    const owner = ownerByKey.get(componentKey(component));
    return owner ? owner.resolve(node, component, adapter) : baseRegistry.resolveNodeOwnerEvidence(node, component, adapter);
  };
  return Object.freeze({
    ...combined,
    policy: componentPackPolicy,
    policyDigest,
    adapterPolicy: combined.policy,
    componentPackPolicy,
    componentCatalog: catalog,
    componentCatalogDigest: catalogDigest,
    integrations: baseRegistry.integrations,
    resolveNodeOwnerEvidence,
  });
}
