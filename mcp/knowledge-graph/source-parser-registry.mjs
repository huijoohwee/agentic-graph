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

export const SOURCE_PARSER_REGISTRY = compileParserRegistry(SOURCE_PARSER_DESCRIPTORS);

export const SOURCE_PARSER_STRUCTURAL_INCLUDE_PATTERNS = Object.freeze([
  ...new Set(SOURCE_PARSER_REGISTRY.descriptors
    .filter((descriptor) => descriptor.fidelity !== "inventory-only")
    .flatMap((descriptor) => [
      ...descriptor.extensions.map((extension) => `*${extension}`),
      ...descriptor.basenames,
      ...descriptor.basenameFamilies.flatMap((family) => [family, `${family}.*`]),
    ])),
].sort());
