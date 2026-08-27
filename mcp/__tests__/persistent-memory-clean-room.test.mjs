import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const blockedProject = ["agent", "memory"].join("");
const blockedOwner = ["rohit", "g00"].join("");
const implementationFiles = [
  "mcp/memory-local-runtime.js",
  "mcp/persistent-memory-authorization.js",
  "mcp/persistent-memory-contract.mjs",
  "mcp/persistent-memory-invocation-runtime.js",
  "mcp/persistent-memory-policy.js",
  "mcp/persistent-memory-runtime.js",
  "mcp/persistent-memory-search.js",
  "mcp/persistent-memory-store.js",
  "mcp/persistent-memory-tool-contract.js",
  "mcp/local-tool-contract.js",
  "mcp/server.js",
  "canvas/src/features/agent-ready/agenticgraphLocalMcpToolNames.mjs",
];

const manifestPaths = [
  "package.json",
  "package-lock.json",
  "mcp/package.json",
  "canvas/package.json",
  ".gitmodules",
];

test("persistent memory has no forbidden package, import, endpoint, or vendored runtime", async () => {
  const violations = [];
  for (const relativePath of [...implementationFiles, ...manifestPaths]) {
    const absolutePath = path.join(repoRoot, relativePath);
    const content = await fs.readFile(absolutePath, "utf8").catch((error) => {
      if (error?.code === "ENOENT") return "";
      throw error;
    });
    const normalized = content.toLowerCase();
    if (normalized.includes(blockedProject)) {
      violations.push(`${relativePath} contains a forbidden project identity`);
    }
    if (normalized.includes(blockedOwner)) {
      violations.push(`${relativePath} contains a forbidden owner identity`);
    }
  }
  assert.deepEqual(violations, []);

  for (const relativePath of ["package.json", "mcp/package.json", "canvas/package.json"]) {
    const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), "utf8"));
    const dependencyNames = [
      ...Object.keys(manifest.dependencies || {}),
      ...Object.keys(manifest.devDependencies || {}),
      ...Object.keys(manifest.optionalDependencies || {}),
      ...Object.keys(manifest.peerDependencies || {}),
    ].map((name) => name.toLowerCase());
    assert.equal(
      dependencyNames.some((name) => name.includes(blockedProject)),
      false,
      `${relativePath} must not depend on the forbidden runtime`,
    );
  }
});
