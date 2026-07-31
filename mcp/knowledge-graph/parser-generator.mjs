import { KnowledgeGraphError, compareStableStrings, sha256, stableStringify } from "./contract.mjs";
import { compileDeclarativeGrammar } from "./declarative-grammar-parser.mjs";

const MAX_DESCRIPTORS = 128;
const MAX_MATCHERS_PER_DESCRIPTOR = 64;
const SAFE_TOKEN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SAFE_EXTENSION = /^\.[a-z0-9][a-z0-9.+_-]{0,31}$/;
const SAFE_BASENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_BASENAME_FAMILY = /^\.[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;
const SAFE_BASENAME_FAMILY_SUFFIX = /^[a-z0-9][a-z0-9._-]{0,126}$/;

const asUniqueSorted = (values, validate, field) => {
  if (!Array.isArray(values) || values.length > MAX_MATCHERS_PER_DESCRIPTOR) {
    throw new KnowledgeGraphError("parser_descriptor_invalid", `${field} must be a bounded array.`);
  }
  const normalized = values.map((value) => String(value || "").trim());
  if (normalized.some((value) => !validate.test(value))) {
    throw new KnowledgeGraphError("parser_descriptor_invalid", `${field} contains an unsafe matcher.`);
  }
  return [...new Set(normalized)].sort(compareStableStrings);
};

function normalizeDescriptor(raw, index, adapterFidelities) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new KnowledgeGraphError("parser_descriptor_invalid", `Parser descriptor ${index} must be an object.`);
  }
  const allowedKeys = new Set([
    "id",
    "kind",
    "adapter",
    "fidelity",
    "extensions",
    "basenames",
    "basenameFamilies",
    "priority",
    "grammar",
  ]);
  const unexpected = Object.keys(raw).filter((key) => !allowedKeys.has(key));
  if (unexpected.length) {
    throw new KnowledgeGraphError("parser_descriptor_invalid", `Parser descriptor ${index} has unsupported keys.`, {
      keys: unexpected.sort(compareStableStrings),
    });
  }
  const id = String(raw.id || "").trim();
  const kind = String(raw.kind || "").trim();
  const adapter = String(raw.adapter || "").trim();
  const fidelity = String(raw.fidelity || "").trim();
  if (![id, kind, adapter, fidelity].every((value) => SAFE_TOKEN.test(value))) {
    throw new KnowledgeGraphError("parser_descriptor_invalid", `Parser descriptor ${index} has an invalid identity token.`);
  }
  if (adapterFidelities) {
    if (!Object.hasOwn(adapterFidelities, adapter)) {
      throw new KnowledgeGraphError(
        "parser_adapter_unsupported",
        `Parser descriptor ${id} requests an adapter that is not registered by the native runtime.`,
        { adapter },
      );
    }
    if (adapterFidelities[adapter] !== fidelity) {
      throw new KnowledgeGraphError(
        "parser_descriptor_invalid",
        `Parser descriptor ${id} fidelity does not match its native adapter.`,
        { adapter, expectedFidelity: adapterFidelities[adapter], fidelity },
      );
    }
  }
  const hasGrammar = Object.hasOwn(raw, "grammar");
  if (adapter === "declarative-grammar" && !hasGrammar) {
    throw new KnowledgeGraphError(
      "parser_descriptor_invalid",
      `Parser descriptor ${id} requires a bounded declarative grammar.`,
    );
  }
  if (adapter !== "declarative-grammar" && hasGrammar) {
    throw new KnowledgeGraphError(
      "parser_descriptor_invalid",
      `Parser descriptor ${id} cannot attach a grammar to a native fixed adapter.`,
    );
  }
  const grammar = hasGrammar
    ? compileDeclarativeGrammar(raw.grammar).grammar
    : null;
  const extensions = asUniqueSorted(raw.extensions || [], SAFE_EXTENSION, "extensions");
  const basenames = asUniqueSorted(raw.basenames || [], SAFE_BASENAME, "basenames");
  const basenameFamilies = asUniqueSorted(
    raw.basenameFamilies || [],
    SAFE_BASENAME_FAMILY,
    "basenameFamilies",
  );
  if (!extensions.length && !basenames.length && !basenameFamilies.length) {
    throw new KnowledgeGraphError("parser_descriptor_invalid", `Parser descriptor ${id} has no inert matcher.`);
  }
  const priority = Number(raw.priority ?? 0);
  if (!Number.isSafeInteger(priority) || priority < -1000 || priority > 1000) {
    throw new KnowledgeGraphError("parser_descriptor_invalid", `Parser descriptor ${id} has an invalid priority.`);
  }
  return Object.freeze({
    id,
    kind,
    adapter,
    fidelity,
    extensions,
    basenames,
    basenameFamilies,
    priority,
    ...(grammar ? { grammar } : {}),
  });
}

export function compileParserRegistry(rawDescriptors, { adapterFidelities = null } = {}) {
  if (!Array.isArray(rawDescriptors) || !rawDescriptors.length || rawDescriptors.length > MAX_DESCRIPTORS) {
    throw new KnowledgeGraphError("parser_registry_invalid", `Parser registry must contain 1-${MAX_DESCRIPTORS} descriptors.`);
  }
  if (adapterFidelities !== null && (
    !adapterFidelities
    || typeof adapterFidelities !== "object"
    || Array.isArray(adapterFidelities)
  )) {
    throw new KnowledgeGraphError(
      "parser_registry_invalid",
      "Native parser adapter identities must be supplied as an inert fidelity record.",
    );
  }
  const descriptors = rawDescriptors.map((descriptor, index) => (
    normalizeDescriptor(descriptor, index, adapterFidelities)
  ));
  const ids = new Set();
  const kinds = new Set();
  const extensionOwners = new Map();
  const basenameOwners = new Map();
  const basenameFamilyOwners = new Map();
  for (const descriptor of descriptors) {
    if (ids.has(descriptor.id)) throw new KnowledgeGraphError("parser_registry_invalid", `Duplicate parser descriptor id: ${descriptor.id}`);
    if (kinds.has(descriptor.kind)) throw new KnowledgeGraphError("parser_registry_invalid", `Duplicate parser descriptor kind: ${descriptor.kind}`);
    ids.add(descriptor.id);
    kinds.add(descriptor.kind);
    for (const extension of descriptor.extensions) {
      const key = extension.toLowerCase();
      const owner = extensionOwners.get(key);
      if (owner && owner.priority === descriptor.priority) {
        throw new KnowledgeGraphError("parser_registry_ambiguous", `Extension ${extension} has equal-priority parser descriptors.`);
      }
      if (!owner || owner.priority < descriptor.priority) extensionOwners.set(key, descriptor);
    }
    for (const basename of descriptor.basenames) {
      const key = basename.toLowerCase();
      const owner = basenameOwners.get(key);
      if (owner && owner.priority === descriptor.priority) {
        throw new KnowledgeGraphError("parser_registry_ambiguous", `Basename ${basename} has equal-priority parser descriptors.`);
      }
      if (!owner || owner.priority < descriptor.priority) basenameOwners.set(key, descriptor);
    }
    for (const family of descriptor.basenameFamilies) {
      const key = family.toLowerCase();
      const owner = basenameFamilyOwners.get(key);
      if (owner && owner.priority === descriptor.priority) {
        throw new KnowledgeGraphError("parser_registry_ambiguous", `Basename family ${family} has equal-priority parser descriptors.`);
      }
      if (!owner || owner.priority < descriptor.priority) basenameFamilyOwners.set(key, descriptor);
    }
  }
  const canonical = descriptors
    .map(({
      id,
      kind,
      adapter,
      fidelity,
      extensions,
      basenames,
      basenameFamilies,
      priority,
      grammar,
    }) => (
      {
        id,
        kind,
        adapter,
        fidelity,
        extensions,
        basenames,
        basenameFamilies,
        priority,
        ...(grammar ? { grammar } : {}),
      }
    ))
    .sort((left, right) => compareStableStrings(left.id, right.id));
  const basenameFamilyMatchers = [...basenameFamilyOwners.entries()]
    .sort(([leftFamily, left], [rightFamily, right]) => (
      right.priority - left.priority
      || rightFamily.length - leftFamily.length
      || compareStableStrings(left.id, right.id)
    ));
  const extensionMatchers = [...extensionOwners.entries()]
    .sort(([leftExtension, left], [rightExtension, right]) => (
      rightExtension.length - leftExtension.length
      || right.priority - left.priority
      || compareStableStrings(leftExtension, rightExtension)
      || compareStableStrings(left.id, right.id)
    ));
  const digest = sha256(stableStringify(canonical, 0));
  return Object.freeze({
    digest,
    descriptors: Object.freeze(canonical),
    match(sourcePathRaw) {
      const sourcePath = String(sourcePathRaw || "").replaceAll("\\", "/");
      const basename = sourcePath.split("/").at(-1)?.toLowerCase() || "";
      const byName = basenameOwners.get(basename);
      if (byName) return byName;
      for (const [family, descriptor] of basenameFamilyMatchers) {
        const familySuffix = basename.startsWith(`${family}.`)
          ? basename.slice(family.length + 1)
          : "";
        if (basename === family || (
          basename.length <= 128
          && SAFE_BASENAME_FAMILY_SUFFIX.test(familySuffix)
        )) return descriptor;
      }
      for (const [extension, descriptor] of extensionMatchers) {
        if (basename.length > extension.length && basename.endsWith(extension)) return descriptor;
      }
      return null;
    },
    descriptor(kindRaw) {
      const kind = String(kindRaw || "");
      return descriptors.find((entry) => entry.kind === kind) || null;
    },
  });
}

export function compileParserDispatch(registry, adapters) {
  if (!registry?.digest || !adapters || typeof adapters !== "object" || Array.isArray(adapters)) {
    throw new KnowledgeGraphError("parser_dispatch_invalid", "Parser dispatch requires a compiled registry and adapter record.");
  }
  const dispatch = new Map();
  for (const descriptor of registry.descriptors) {
    const adapter = adapters[descriptor.adapter];
    if (typeof adapter !== "function") {
      throw new KnowledgeGraphError("parser_adapter_missing", `Parser adapter is missing: ${descriptor.adapter}`);
    }
    dispatch.set(descriptor.kind, adapter);
  }
  return Object.freeze({
    registryDigest: registry.digest,
    parse(source, options = {}) {
      const adapter = dispatch.get(String(source?.kind || ""));
      if (!adapter) throw new KnowledgeGraphError("parser_adapter_missing", `No parser adapter is registered for ${String(source?.kind || "")}.`);
      return adapter(source, options);
    },
  });
}
