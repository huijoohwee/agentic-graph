import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const allowedNote = path.join(repoRoot, "docs", "agent-team-runtime.md");
const externalName = ["crew", "ai"].join("");
const forbiddenIdentifiers = [
  ["Crew", "Base"].join(""),
  ["crew", "ai_tools"].join(""),
  ["kick", "off_async"].join(""),
  ["kick", "off_for_each"].join(""),
  ["Hierarchical", "Manager"].join(""),
];

async function sourceFiles(entry) {
  const stat = await fs.lstat(entry);
  if (stat.isSymbolicLink()) return [];
  if (stat.isFile()) return [entry];
  if (!stat.isDirectory()) return [];
  const output = [];
  for (const child of await fs.readdir(entry, { withFileTypes: true })) {
    if (["node_modules", ".git", ".knowgrph-workspace", "dist", "build", ".cache", "__pycache__"].includes(child.name)) continue;
    output.push(...await sourceFiles(path.join(entry, child.name)));
  }
  return output;
}

test("agent-team runtime guards forbidden external framework names and dependency manifests", async () => {
  const sourceRoots = [
    path.join(repoRoot, "contracts"),
    path.join(repoRoot, "mcp"),
    path.join(repoRoot, "canvas", "src", "features", "agent-ready"),
    allowedNote,
  ];
  const dependencyFilePattern = /(?:^|\/)(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|pyproject\.toml|poetry\.lock|uv\.lock|Pipfile(?:\.lock)?|setup\.(?:py|cfg)|requirements[^/]*\.txt|environment[^/]*\.(?:yml|yaml)|pixi\.(?:toml|lock))$/;
  const dependencyFiles = (await sourceFiles(repoRoot))
    .filter((file) => dependencyFilePattern.test(file.split(path.sep).join("/")));
  const files = [...new Set([
    ...(await Promise.all(sourceRoots.map(sourceFiles))).flat(),
    ...dependencyFiles,
  ])];
  const violations = [];
  for (const file of files) {
    const content = await fs.readFile(file, "utf8").catch(() => "");
    const normalized = content.toLowerCase();
    if (file !== allowedNote && normalized.includes(externalName)) {
      violations.push(`${path.relative(repoRoot, file)} contains the external framework name`);
    }
    for (const identifier of forbiddenIdentifiers) {
      if (content.includes(identifier)) {
        violations.push(`${path.relative(repoRoot, file)} contains forbidden external identifier ${identifier}`);
      }
    }
  }
  assert.deepEqual(violations, []);

  const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
  const dependencyNames = [
    ...Object.keys(manifest.dependencies || {}),
    ...Object.keys(manifest.devDependencies || {}),
  ].map((name) => name.toLowerCase());
  assert.equal(dependencyNames.some((name) => name.includes(externalName)), false);
});
