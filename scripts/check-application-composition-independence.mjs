import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const compositionEntries = [
  "contracts/agent-application.schema.js",
  "mcp/agent-application-adapter-registry.js",
  "mcp/agent-application-component-packs.js",
  "mcp/agent-application-runtime.js",
  "mcp/agent-application-tool-contract.js",
];
const SKIP_DEPENDENCY_DIRECTORIES = new Set([".git", ".wrangler", "build", "coverage", "dist", "node_modules"]);
const discoverDependencyFiles = () => {
  const json = [];
  const text = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!SKIP_DEPENDENCY_DIRECTORIES.has(entry.name)) pending.push(join(directory, entry.name)); continue; }
      if (!entry.isFile()) continue;
      const path = join(directory, entry.name);
      const relativePath = relative(root, path);
      if (["package.json", "package-lock.json", "npm-shrinkwrap.json"].includes(entry.name)) json.push(relativePath);
      else if (/^requirements(?:[-_.][^/]*)?\.txt$/i.test(entry.name) || ["pnpm-lock.yaml", "yarn.lock", "pyproject.toml", "poetry.lock", "uv.lock"].includes(entry.name)) text.push(relativePath);
    }
  }
  return { json: json.sort(), text: text.sort() };
};
const { json: dependencyFiles, text: textDependencyFiles } = discoverDependencyFiles();
const FORBIDDEN_TAGLINE_FINGERPRINT = "b8d9788fdce0dc5681d4fa3bd666357b9fa3c35b4ec07a6dc8806741c08b1fdb";
const FINGERPRINT_SELF_TEST = "b5e36133a0fcb569b7001c04de7d24121dd257c68ee660476cdceb58ecabcb91";
const errors = [];
const forbiddenDependency = (name) => {
  const normalized = String(name || "").toLowerCase();
  return normalized === "langchain" || normalized.startsWith("@langchain/") || /^langchain[-_]/.test(normalized);
};
const forbiddenCompositionFramework = (name) => forbiddenDependency(name) || ["langgraph", "langsmith", "langserve", "deepagents"].includes(String(name || "").toLowerCase());
const forbiddenLocator = (value) => {
  let normalized = String(value || "").toLowerCase();
  try { normalized = decodeURIComponent(normalized); } catch {}
  return normalized.includes("langchain-ai/langchain") || normalized.includes("@langchain/")
    || /(?:^|[^a-z0-9])langchain(?:[-_][a-z0-9.-]*)?(?:$|[^a-z0-9])/.test(normalized);
};
for (const declaration of ["langchain>=1", 'name = "langchain"', '"langchain@npm:^1.0.0":', 'safe = { git = "https://github.com/langchain-ai/langchain" }', "alias@npm:%40langchain/core@1"]) {
  if (!forbiddenLocator(declaration)) errors.push(`composition dependency locator self-test failed for ${declaration}`);
}
for (const declaration of ["mylangchain", "langchained-tools", "safe-chain>=1"]) if (forbiddenLocator(declaration)) errors.push(`composition dependency locator self-test produced a false positive for ${declaration}`);
const dependencyNames = new Set();
const forbiddenLocators = [];
const collectDependencySections = (value) => {
  if (!value || typeof value !== "object") return;
  for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "bundledDependencies"]) {
    const entries = value[section];
    if (Array.isArray(entries)) for (const name of entries) dependencyNames.add(name);
    else if (entries && typeof entries === "object") for (const name of Object.keys(entries)) dependencyNames.add(name);
  }
};

for (const relativePath of dependencyFiles) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) continue;
  let document;
  try { document = JSON.parse(readFileSync(path, "utf8")); }
  catch (error) { errors.push(`${relativePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); continue; }
  for (const packagePath of Object.keys(document.packages || {})) {
    const marker = "node_modules/";
    const index = packagePath.lastIndexOf(marker);
    if (index >= 0) dependencyNames.add(packagePath.slice(index + marker.length));
  }
  const inspectDependencyDocument = (value, path = "$") => {
    if (typeof value === "string") {
      if (forbiddenLocator(value)) forbiddenLocators.push(`${relativePath}:${path}`);
      return;
    }
    if (!value || typeof value !== "object") return;
    collectDependencySections(value);
    for (const [key, child] of Object.entries(value)) inspectDependencyDocument(child, `${path}.${key}`);
  };
  inspectDependencyDocument(document);
}
for (const relativePath of textDependencyFiles) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) continue;
  for (const [index, rawLine] of readFileSync(path, "utf8").split(/\r?\n/).entries()) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line) continue;
    const packageMatch = line.match(/^([A-Za-z0-9_.-]+)/);
    if (packageMatch) dependencyNames.add(packageMatch[1]);
    if (forbiddenLocator(line)) forbiddenLocators.push(`${relativePath}:${index + 1}`);
  }
}
for (const relativeModulesRoot of ["node_modules", "canvas/node_modules", "gympgrph/node_modules", "mcp/node_modules", "cloudflare/workers/agentic-graph-mcp/node_modules"]) {
  const modulesRoot = resolve(root, relativeModulesRoot);
  if (!existsSync(modulesRoot)) continue;
  for (const entry of readdirSync(modulesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === ".bin") continue;
    if (!entry.name.startsWith("@")) dependencyNames.add(entry.name);
    else for (const scoped of readdirSync(resolve(modulesRoot, entry.name), { withFileTypes: true })) if (scoped.isDirectory()) dependencyNames.add(`${entry.name}/${scoped.name}`);
  }
}
for (const name of [...dependencyNames].sort()) if (forbiddenDependency(name)) errors.push(`composition dependency manifests/lock include forbidden external framework package ${name}`);
for (const locator of forbiddenLocators) errors.push(`composition dependency manifests/lock include a forbidden VCS or version locator at ${locator}`);

const importPatterns = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*(?:\(\s*)?["']([^"']+)["']/g,
  /\brequire\s*\(\s*["']([^"']+)["']/g,
];
const visited = new Set();
const compositionTexts = [];
const compositionTextPaths = new Set();
const addCompositionText = (path) => {
  if (!existsSync(path) || compositionTextPaths.has(path)) return;
  compositionTextPaths.add(path);
  compositionTexts.push(readFileSync(path, "utf8"));
};
const pending = compositionEntries.map((relativePath) => resolve(root, relativePath));
while (pending.length) {
  const path = pending.shift();
  if (visited.has(path) || !existsSync(path)) continue;
  visited.add(path);
  const source = readFileSync(path, "utf8");
  addCompositionText(path);
  if (forbiddenLocator(source)) errors.push(`${path.slice(root.length + 1)} contains a forbidden external framework locator outside the import parser`);
  for (const importPattern of importPatterns) for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (/^https?:/i.test(specifier) || forbiddenCompositionFramework(specifier) || forbiddenCompositionFramework(specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/"))) errors.push(`${path.slice(root.length + 1)} imports forbidden external framework surface ${specifier}`);
      if (!specifier.startsWith(".")) continue;
      const candidate = resolve(dirname(path), specifier);
      for (const localPath of extname(candidate) ? [candidate] : [`${candidate}.js`, `${candidate}.mjs`, resolve(candidate, "index.js")]) if (existsSync(localPath) && !visited.has(localPath)) { pending.push(localPath); break; }
    }
}

const compositionDocPath = resolve(root, "docs/agent-application-composition.md");
const compositionDoc = readFileSync(compositionDocPath, "utf8");
addCompositionText(compositionDocPath);
for (const relativePath of [
  "contracts/__tests__/agent-application-contract.test.mjs",
  "data/config/agents/agent-application-components.json",
  "mcp/__tests__/agent-application-component-packs.test.mjs",
  "mcp/__tests__/agent-application-hardening.test.mjs",
  "mcp/__tests__/agent-application-runtime.test.mjs",
  "mcp/__tests__/agent-application-stdio-e2e.test.mjs",
  "scripts/check-application-composition-independence.mjs",
]) addCompositionText(resolve(root, relativePath));
const hasHashedWordWindow = (text, size, expected) => {
  const words = text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase().split(" ");
  for (let index = 0; index + size <= words.length; index += 1) if (createHash("sha256").update(words.slice(index, index + size).join(" ")).digest("hex") === expected) return true;
  return false;
};
const selfTestText = Array.from({ length: 35 }, (_, index) => `guard${String(index).padStart(2, "0")}`).join(" ");
if (!hasHashedWordWindow(selfTestText, 35, FINGERPRINT_SELF_TEST)) errors.push("composition tagline fingerprint self-test failed");
for (const text of compositionTexts) {
  if (hasHashedWordWindow(text, 35, FORBIDDEN_TAGLINE_FINGERPRINT)) errors.push("composition-owned documentation/source repeats the forbidden external 35-word tagline");
}
if (!compositionDoc.includes("https://github.com/langchain-ai/langchain")) errors.push("composition documentation must retain attribution-only inspiration provenance");
if (!/no langchain code, prose, prompt, api, schema, fixture, test, package, service, or runtime dependency is copied or required/i.test(compositionDoc)) errors.push("composition documentation must retain the exact clean-room boundary");

if (errors.length) {
  console.error("Application composition independence check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Application composition independence check passed (${compositionTextPaths.size} owned texts; ${dependencyFiles.length + textDependencyFiles.length} dependency manifests/locks).`);
