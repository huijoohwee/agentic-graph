import assert from "node:assert/strict";
import test from "node:test";

import { findRepositoryPackIndependenceViolations } from "../check-repository-pack-independence.mjs";

const attribution = [
  "Conceptual inspiration: https://github.com/yamadashy/repomix",
  "agentic-graph does not copy or depend on that project.",
].join("\n");

test("repository pack independence accepts local and Node imports with bounded attribution", () => {
  const violations = findRepositoryPackIndependenceViolations({
    manifestEntries: [{ path: "package.json", text: '{"dependencies":{}}' }],
    sourceEntries: [{
      path: "mcp/repository-pack-runtime.js",
      text: 'import fs from "node:fs/promises"; import { format } from "./repository-pack-format.js";',
    }],
    attributionText: attribution,
  });
  assert.deepEqual(violations, []);
});

test("repository pack independence rejects package, remote import, and network coupling", () => {
  const forbiddenName = ["repo", "mix"].join("");
  const violations = findRepositoryPackIndependenceViolations({
    manifestEntries: [{
      path: "package.json",
      text: JSON.stringify({ dependencies: { [forbiddenName]: "latest" } }),
    }],
    sourceEntries: [{
      path: "mcp/repository-pack-runtime.js",
      text: 'import https from "node:https"; import runtime from "https://example.invalid/runtime.js"; fetch("https://example.invalid");',
    }],
    attributionText: attribution,
  });
  assert.equal(violations.some((entry) => entry.includes("forbidden package")), true);
  assert.equal(violations.some((entry) => entry.includes("external import")), true);
  assert.equal(violations.some((entry) => entry.includes("network or VCS import")), true);
  assert.equal(violations.some((entry) => entry.includes("network module")), true);
  assert.equal(violations.some((entry) => entry.includes("network API usage")), true);
});

test("repository pack independence requires the explicit no-copy boundary", () => {
  const violations = findRepositoryPackIndependenceViolations({
    attributionText: "An unrelated repository packing note.",
  });
  assert.equal(violations.some((entry) => entry.includes("missing bounded conceptual attribution")), true);
});

test("repository pack independence rejects forbidden integration identity and missing local wiring", () => {
  const forbiddenName = ["repo", "mix"].join("");
  const violations = findRepositoryPackIndependenceViolations({
    integrationEntries: [{
      path: "mcp/server.js",
      text: `const adapter = ${JSON.stringify(forbiddenName)};`,
    }],
    attributionText: attribution,
  });
  assert.equal(violations.some((entry) => entry.includes("forbidden integration identity")), true);
  assert.equal(violations.some((entry) => entry.includes("missing local repository-pack wiring")), true);
});
