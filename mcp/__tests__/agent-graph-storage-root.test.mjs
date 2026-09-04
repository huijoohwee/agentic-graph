import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { selectAgentGraphOutputRoot } from "../agent-graph/storage-root.mjs";

const rootDir = path.resolve("/fixture/agentic-graph");
const currentRoot = path.resolve(rootDir, "data/outputs/agent-graph");
const legacyRoot = path.resolve(rootDir, "data/outputs/knowledge-graph");

test("new installations select the agent-graph storage root", () => {
  assert.equal(selectAgentGraphOutputRoot({ rootDir, pathExists: () => false }), currentRoot);
});

test("existing snapshots retain their pre-rename storage root", () => {
  assert.equal(selectAgentGraphOutputRoot({
    rootDir,
    pathExists: candidate => candidate === legacyRoot,
  }), legacyRoot);
});

test("ambiguous implicit storage roots fail closed", () => {
  assert.throws(
    () => selectAgentGraphOutputRoot({ rootDir, pathExists: () => true }),
    /storage is ambiguous/,
  );
});

test("the canonical environment setting resolves ambiguity", () => {
  assert.equal(selectAgentGraphOutputRoot({
    rootDir,
    configuredRoot: "current",
    legacyConfiguredRoot: "legacy",
    pathExists: () => true,
  }), path.resolve(rootDir, "current"));
});

test("the pre-rename environment setting remains a bounded fallback", () => {
  assert.equal(selectAgentGraphOutputRoot({
    rootDir,
    legacyConfiguredRoot: "retained",
    pathExists: () => false,
  }), path.resolve(rootDir, "retained"));
});
