import { KnowledgeGraphError } from "./contract.mjs";
import { compileDeclarativeGrammar } from "./declarative-grammar-parser.mjs";
import { SOURCE_PARSER_REGISTRY } from "./source-parser-registry.mjs";

export const createSourceOnlyFragment = ({ inventoryParserId, sourceNodeFor }) => (
  (source, descriptor, diagnostics = source.diagnostics || []) => {
    const inventoryOnly = descriptor.parserId === inventoryParserId;
    const normalizedDiagnostics = Array.isArray(diagnostics) ? diagnostics : [];
    const admittedInventory = inventoryOnly && source.status === "ready";
    return {
      parserId: descriptor.parserId,
      parserVersion: descriptor.parserVersion,
      nodes: [sourceNodeFor(source, descriptor.parserId, descriptor.parserVersion, descriptor.fidelity)],
      edges: [],
      diagnostics: normalizedDiagnostics,
      status: admittedInventory
        ? "parsed"
        : source.status === "ready" ? "partial" : source.status,
    };
  }
);

function registryDescriptorForSource(source, options) {
  const parserRegistry = options.parserRegistry || SOURCE_PARSER_REGISTRY;
  if (!parserRegistry?.digest || typeof parserRegistry.match !== "function") {
    throw new KnowledgeGraphError(
      "parser_registry_invalid",
      "Source parsing requires a verified compiled parser registry.",
    );
  }
  const descriptor = parserRegistry.match(source.relativePath);
  if (source.parserRegistryDigest && source.parserRegistryDigest !== parserRegistry.digest) {
    throw new KnowledgeGraphError(
      "parser_registry_digest_mismatch",
      `Source parser registry changed after discovery: ${source.relativePath}.`,
    );
  }
  if (descriptor && source.parserDescriptorId && source.parserDescriptorId !== descriptor.id) {
    throw new KnowledgeGraphError(
      "parser_registry_route_mismatch",
      `Source parser descriptor changed after discovery: ${source.relativePath}.`,
    );
  }
  if (descriptor && source.status === "ready" && source.kind !== descriptor.kind) {
    throw new KnowledgeGraphError(
      "parser_registry_route_mismatch",
      `Source parser kind changed after discovery: ${source.relativePath}.`,
    );
  }
  return { descriptor, parserRegistry };
}

export function resolveParserDescriptorForSource(source, options, identities) {
  const { descriptor, parserRegistry } = registryDescriptorForSource(source, options);
  const common = {
    adapter: descriptor?.adapter || "inventory",
    descriptorId: descriptor?.id || "unregistered",
    parserRegistryDigest: parserRegistry.digest,
  };
  const identity = identities[descriptor?.adapter || "inventory"];
  if (descriptor?.adapter === "python") {
    const probedVersion = String(options.pythonParserVersion || "").trim();
    const parserVersion = probedVersion.startsWith(`${identity.parserVersion}.sys-`)
      && /^[A-Za-z0-9._+-]+$/.test(probedVersion)
      ? probedVersion
      : identity.parserVersion;
    return { ...common, ...identity, parserVersion };
  }
  if (descriptor?.adapter === "declarative-grammar") {
    const grammarDigest = compileDeclarativeGrammar(descriptor.grammar).digest;
    return {
      ...common,
      ...identity,
      parserVersion: `${identity.parserVersion}+grammar-${grammarDigest.slice(0, 16)}`,
    };
  }
  if (descriptor?.adapter === "pdf") {
    const converterVersion = String(options.pdfConverterVersion || "pending")
      .replace(/[^A-Za-z0-9._-]+/g, "-");
    return {
      ...common,
      ...identity,
      parserVersion: `${identity.parserVersion}+${converterVersion}`,
      fidelity: options.pdfConverter ? "native-converted-structure" : "pending",
    };
  }
  return { ...common, ...identity };
}
