import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, "..");
const FORBIDDEN_PRODUCT = ["repo", "mix"].join("");
const FORBIDDEN_REPOSITORY = ["yamadashy", FORBIDDEN_PRODUCT].join("/");
const OWNED_SOURCES = Object.freeze([
  "mcp/repository-pack-contract.js",
  "mcp/repository-pack-error.js",
  "mcp/repository-pack-format.js",
  "mcp/repository-pack-git.js",
  "mcp/repository-pack-publisher.js",
  "mcp/repository-pack-runtime.js",
]);
const INTEGRATION_SOURCES = Object.freeze([
  "mcp/server.js",
  "mcp/local-tool-contract.js",
  "canvas/src/features/agent-ready/agentic-graph-local-mcp-tool-names.mjs",
  "canvas/src/features/agent-ready/agentic-graph-vdeoxpln-registry-data.mjs",
  "mcp/README.md",
  "docs/runtime-readiness-contract.md",
]);
const REQUIRED_WIRING = Object.freeze({
  "mcp/server.js": [
    'from "./repository-pack-runtime.js"',
    "runRepositoryPackTool(args",
  ],
  "mcp/local-tool-contract.js": [
    'from "./repository-pack-contract.js"',
    "AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.repositoryPack",
  ],
  "canvas/src/features/agent-ready/agentic-graph-local-mcp-tool-names.mjs": [
    'repositoryPack: "agentic-graph.repository.pack"',
  ],
});
const MANIFEST_CANDIDATES = Object.freeze([
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "mcp/package.json",
  "mcp/package-lock.json",
]);
const ATTRIBUTION_DOCUMENT = "docs/repository-packing-runtime.md";
const NETWORK_MODULES = new Set([
  "node:dgram",
  "node:dns",
  "node:http",
  "node:http2",
  "node:https",
  "node:net",
  "node:tls",
]);

const normalize = (value) => String(value || "").toLowerCase();
const containsForbiddenIdentity = (value) => {
  const text = normalize(value);
  return text.includes(FORBIDDEN_PRODUCT) || text.includes(FORBIDDEN_REPOSITORY);
};

const importSpecifiers = (source) => {
  const results = [];
  const pattern = /\b(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']/gu;
  for (const match of String(source).matchAll(pattern)) results.push(match[1]);
  const dynamicPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu;
  for (const match of String(source).matchAll(dynamicPattern)) results.push(match[1]);
  return results;
};

export const findRepositoryPackIndependenceViolations = ({
  manifestEntries = [],
  sourceEntries = [],
  integrationEntries = [],
  attributionText = "",
}) => {
  const violations = [];
  for (const entry of manifestEntries) {
    if (containsForbiddenIdentity(entry.text)) {
      violations.push(`${entry.path}: forbidden package or repository locator`);
    }
  }
  for (const entry of sourceEntries) {
    if (containsForbiddenIdentity(entry.text)) {
      violations.push(`${entry.path}: forbidden implementation identity`);
    }
    for (const specifier of importSpecifiers(entry.text)) {
      const allowed = specifier.startsWith("node:") || specifier.startsWith("./") || specifier.startsWith("../");
      if (!allowed) violations.push(`${entry.path}: external import ${JSON.stringify(specifier)}`);
      if (NETWORK_MODULES.has(specifier)) violations.push(`${entry.path}: network module ${JSON.stringify(specifier)}`);
      if (/^(?:https?:|git(?:\+|:)|github:)/iu.test(specifier)) {
        violations.push(`${entry.path}: network or VCS import ${JSON.stringify(specifier)}`);
      }
    }
    if (/\b(?:fetch|WebSocket|EventSource)\s*\(/u.test(entry.text)) {
      violations.push(`${entry.path}: network API usage`);
    }
    if (/\b(?:npx|npm\s+(?:install|exec)|pnpm\s+(?:add|dlx)|yarn\s+add)\b/iu.test(entry.text)) {
      violations.push(`${entry.path}: external package execution`);
    }
  }
  for (const entry of integrationEntries) {
    if (containsForbiddenIdentity(entry.text)) {
      violations.push(`${entry.path}: forbidden integration identity`);
    }
  }
  if (integrationEntries.length) {
    const byPath = new Map(integrationEntries.map((entry) => [entry.path, entry.text]));
    for (const [relativePath, snippets] of Object.entries(REQUIRED_WIRING)) {
      const text = byPath.get(relativePath);
      if (!text || snippets.some((snippet) => !text.includes(snippet))) {
        violations.push(`${relativePath}: missing local repository-pack wiring`);
      }
    }
  }
  const attribution = normalize(attributionText);
  if (
    !attribution.includes(FORBIDDEN_REPOSITORY)
    || !attribution.includes("conceptual inspiration")
    || !attribution.includes("does not copy or depend")
  ) {
    violations.push(`${ATTRIBUTION_DOCUMENT}: missing bounded conceptual attribution`);
  }
  return violations;
};

const readIfPresent = async (relativePath) => {
  try {
    return {
      path: relativePath,
      text: await fs.readFile(path.join(REPOSITORY_ROOT, relativePath), "utf8"),
    };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};

const main = async () => {
  const manifestEntries = (await Promise.all(MANIFEST_CANDIDATES.map(readIfPresent))).filter(Boolean);
  const sourceEntries = (await Promise.all(OWNED_SOURCES.map(readIfPresent))).filter(Boolean);
  const integrationEntries = (await Promise.all(INTEGRATION_SOURCES.map(readIfPresent))).filter(Boolean);
  if (sourceEntries.length !== OWNED_SOURCES.length) {
    throw new Error("Repository pack independence check could not read every owned implementation source.");
  }
  if (integrationEntries.length !== INTEGRATION_SOURCES.length) {
    throw new Error("Repository pack independence check could not read every integration source.");
  }
  const attribution = await readIfPresent(ATTRIBUTION_DOCUMENT);
  const violations = findRepositoryPackIndependenceViolations({
    manifestEntries,
    sourceEntries,
    integrationEntries,
    attributionText: attribution?.text || "",
  });
  if (violations.length) {
    process.stderr.write(`${violations.map((entry) => `- ${entry}`).join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("repository-pack independence: PASS\n");
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
