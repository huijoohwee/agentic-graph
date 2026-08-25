import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const REPOSITORY_ROOT = new URL("../../", import.meta.url);
const MANIFEST_PATTERN = /(?:^|\/)(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock)$/u;
const SOURCE_PATTERN = /\.(?:cjs|js|json|jsonc|jsx|mjs|toml|ts|tsx|yaml|yml)$/u;
const FORBIDDEN_NAMESPACES = Object.freeze([
  `@${"medusa"}js/`,
  `@${"mercur"}js/`,
]);
const FORBIDDEN_PACKAGES = Object.freeze([
  ["json", "rules", "engine"].join("-"),
  ["x", "state"].join(""),
]);

export function findForbiddenCommerceReferences(entries) {
  const findings = [];
  for (const { path, content } of entries) {
    if (MANIFEST_PATTERN.test(path)) {
      for (const name of [...FORBIDDEN_NAMESPACES, ...FORBIDDEN_PACKAGES]) {
        if (content.includes(name)) findings.push({ path, reason: `forbidden-manifest-reference:${name}` });
      }
    }
    if (SOURCE_PATTERN.test(path)) {
      for (const namespace of FORBIDDEN_NAMESPACES) {
        if (containsImport(content, namespace)) findings.push({ path, reason: `forbidden-import:${namespace}` });
      }
      for (const hostname of hostedCommerceHostnames(content)) {
        findings.push({ path, reason: `forbidden-hostname:${hostname}` });
      }
    }
  }
  return findings;
}

test("repository has no foreign commerce dependency or hosted runtime path", async () => {
  const entries = await trackedTextEntries();
  assert.deepEqual(findForbiddenCommerceReferences(entries), []);
});

test("clean-room scan rejects a synthetic forbidden specifier", () => {
  const namespace = FORBIDDEN_NAMESPACES[0];
  const findings = findForbiddenCommerceReferences([
    { path: "fixtures/package.json", content: JSON.stringify({ dependencies: { [`${namespace}core`]: "1.0.0" } }) },
    { path: "fixtures/entry.mjs", content: `import ${JSON.stringify(`${namespace}core`)};` },
  ]);
  assert.deepEqual(findings, [
    { path: "fixtures/package.json", reason: `forbidden-manifest-reference:${namespace}` },
    { path: "fixtures/entry.mjs", reason: `forbidden-import:${namespace}` },
  ]);
});

function containsImport(content, namespace) {
  const escaped = namespace.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:from\\s*|import\\s*\\(|import\\s+|require\\s*\\()\\s*["']${escaped}`, "u").test(content);
}

function hostedCommerceHostnames(content) {
  const hostnames = new Set();
  for (const match of content.matchAll(/https?:\/\/([a-z0-9.-]+)/giu)) {
    const hostname = match[1].toLowerCase();
    if (hostname.includes("medusa") || hostname.includes("mercur")) hostnames.add(hostname);
  }
  return [...hostnames].sort();
}

async function trackedTextEntries() {
  const paths = execFileSync("git", ["ls-files", "-z"], {
    cwd: REPOSITORY_ROOT,
    encoding: "utf8",
  }).split("\0").filter(Boolean);
  const entries = await Promise.all(paths.map(async path => ({
    path,
    content: await readFile(new URL(path, REPOSITORY_ROOT), "utf8").catch(() => ""),
  })));
  return entries.filter(({ content }) => !content.includes("\0"));
}
