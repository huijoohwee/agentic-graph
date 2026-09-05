import {
  AGENT_GRAPH_PARSER_REGISTRY_SCHEMA_ID,
  NATIVE_AGENT_GRAPH_PARSER_ADAPTERS,
} from "../agent-graph-parser-contract.js";
import { AgentGraphError, compareStableStrings } from "./contract.mjs";
import { compileParserRegistry } from "./parser-generator.mjs";

export const SOURCE_PARSER_DESCRIPTORS = Object.freeze([
  {
    id: "typescript-family",
    kind: "typescript",
    adapter: "typescript",
    fidelity: "ast",
    extensions: [".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"],
    basenames: [],
    priority: 100,
  },
  {
    id: "python",
    kind: "python",
    adapter: "python",
    fidelity: "ast",
    extensions: [".py"],
    basenames: [],
    priority: 100,
  },
  {
    id: "sql",
    kind: "sql",
    adapter: "sql",
    fidelity: "structural-parser",
    extensions: [".sql"],
    basenames: [],
    priority: 100,
  },
  {
    id: "markdown",
    kind: "markdown",
    adapter: "markdown",
    fidelity: "structural-parser",
    extensions: [".markdown", ".md", ".mdx"],
    basenames: [],
    priority: 100,
  },
  {
    id: "json-config",
    kind: "json-config",
    adapter: "json-config",
    fidelity: "ast",
    extensions: [".json", ".jsonc", ".jsonld"],
    basenames: [],
    priority: 100,
  },
  {
    id: "structural-config",
    kind: "structural-config",
    adapter: "structural-config",
    fidelity: "structural-parser",
    extensions: [".conf", ".env", ".ini", ".tf", ".tfvars", ".toml", ".yaml", ".yml"],
    basenames: ["Dockerfile"],
    basenameFamilies: [".env"],
    priority: 100,
  },
  {
    id: "brace-code",
    kind: "brace-code",
    adapter: "brace-code",
    fidelity: "structural-parser",
    extensions: [".c", ".cc", ".cpp", ".cs", ".go", ".h", ".hpp", ".java", ".kt", ".kts", ".php", ".rs", ".swift"],
    basenames: [],
    priority: 50,
  },
  {
    id: "pdf",
    kind: "pdf",
    adapter: "pdf",
    fidelity: "native-converted-structure",
    extensions: [".pdf"],
    basenames: [],
    priority: 100,
  },
  {
    id: "text",
    kind: "text",
    adapter: "inventory",
    fidelity: "inventory-only",
    extensions: [".bash", ".css", ".htm", ".html", ".sh", ".txt", ".zsh"],
    basenames: [],
    priority: 1,
  },
]);

export function compileSourceParserRegistry(descriptors) {
  return compileParserRegistry(descriptors, {
    adapterFidelities: NATIVE_AGENT_GRAPH_PARSER_ADAPTERS,
  });
}

export function portableSourceParserRegistry(registry) {
  if (!registry?.digest || !Array.isArray(registry.descriptors)) {
    throw new AgentGraphError(
      "parser_registry_invalid",
      "A compiled source parser registry is required.",
    );
  }
  return Object.freeze({
    schema: AGENT_GRAPH_PARSER_REGISTRY_SCHEMA_ID,
    digest: registry.digest,
    descriptors: registry.descriptors,
  });
}

export function verifyPortableSourceParserRegistry(candidate, expectedDigest = "") {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new AgentGraphError(
      "parser_registry_invalid",
      "parserRegistry must be a generated inert registry.",
    );
  }
  const keys = Object.keys(candidate).sort(compareStableStrings);
  const expectedKeys = ["descriptors", "digest", "schema"];
  if (keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== expectedKeys[index])
    || candidate.schema !== AGENT_GRAPH_PARSER_REGISTRY_SCHEMA_ID
    || !/^[a-f0-9]{64}$/.test(String(candidate.digest || ""))) {
    throw new AgentGraphError(
      "parser_registry_invalid",
      "parserRegistry does not match the generated registry contract.",
    );
  }
  const compiled = compileSourceParserRegistry(candidate.descriptors);
  if (candidate.digest !== compiled.digest) {
    throw new AgentGraphError(
      "parser_registry_digest_mismatch",
      "parserRegistry digest does not match its canonical descriptors.",
      { actualDigest: compiled.digest, suppliedDigest: String(candidate.digest || "") },
    );
  }
  const expected = String(expectedDigest || "").trim();
  if (expected && expected !== compiled.digest) {
    throw new AgentGraphError(
      "parser_registry_digest_mismatch",
      "Generated parser registry does not match expectedParserRegistryDigest.",
      { actualDigest: compiled.digest, expectedDigest: expected },
    );
  }
  return compiled;
}

export const SOURCE_PARSER_REGISTRY = compileSourceParserRegistry(SOURCE_PARSER_DESCRIPTORS);
export const PORTABLE_SOURCE_PARSER_REGISTRY = portableSourceParserRegistry(SOURCE_PARSER_REGISTRY);

export const sourceParserStructuralIncludePatterns = (registry = SOURCE_PARSER_REGISTRY) => Object.freeze([
  ...new Set(registry.descriptors
    .filter((descriptor) => descriptor.fidelity !== "inventory-only")
    .flatMap((descriptor) => [
      ...descriptor.extensions.map((extension) => `*${extension}`),
      ...descriptor.basenames,
      ...descriptor.basenameFamilies.flatMap((family) => [family, `${family}.*`]),
    ])),
].sort());

export const SOURCE_PARSER_STRUCTURAL_INCLUDE_PATTERNS =
  sourceParserStructuralIncludePatterns(SOURCE_PARSER_REGISTRY);

export const sourceParserIncludePatterns = (registry = SOURCE_PARSER_REGISTRY) => Object.freeze([
  ...new Set(registry.descriptors.flatMap((descriptor) => [
    ...descriptor.extensions.map((extension) => `*${extension}`),
    ...descriptor.basenames,
    ...descriptor.basenameFamilies.flatMap((family) => [family, `${family}.*`]),
  ])),
].sort());

export const SOURCE_PARSER_INCLUDE_PATTERNS = sourceParserIncludePatterns(SOURCE_PARSER_REGISTRY);
