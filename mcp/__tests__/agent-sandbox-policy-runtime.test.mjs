import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  authorizeAgentSandboxOperation,
  compileAgentSandboxPolicy,
  loadAgentSandboxPolicy,
} from "../agent-sandbox-policy-runtime.js";
import { buildAgenticGraphLocalMcpToolDefinitions, AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";

const sourcePolicy = (overrides = {}) => JSON.stringify({
  schema: "agenticgraph-agent-sandbox-policy/v1",
  policy_id: "focused-runtime-proof",
  filesystem: { read: ["docs"], write: ["data/sandbox"] },
  process: { executables: ["/usr/bin/git"], max_runtime_ms: 5000, max_output_bytes: 4096 },
  network: {
    default: "deny",
    rules: [{
      id: "source-read",
      hosts: ["source.invalid"],
      ports: [443],
      protocols: ["https"],
      methods: ["GET"],
      path_prefixes: ["/api/"],
      executables: ["/usr/bin/git"],
    }],
  },
  credentials: { environment: ["SOURCE_READ_TOKEN"] },
  audit: { decision_log: "required", redact_values: true },
  ...overrides,
});

test("sandbox policy compiler rejects permissive defaults and unknown fields", () => {
  const result = compileAgentSandboxPolicy(sourcePolicy({ network: { default: "allow", rules: [] }, compatibility_alias: true }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("network.default must be deny")));
  assert.ok(result.errors.some((error) => error.includes("compatibility_alias")));
});

test("sandbox policy authorization fails closed across filesystem, network, process, and credentials", () => {
  const compiled = compileAgentSandboxPolicy(sourcePolicy());
  assert.equal(compiled.ok, true);
  assert.equal(compiled.enforcement.kernel_or_container_isolation, "required-not-provided");

  const workspaceRoot = path.resolve("/workspace");
  const decide = (operation) => authorizeAgentSandboxOperation(compiled, operation, { workspaceRoot });
  assert.equal(decide({ kind: "filesystem.read", path: "docs/readme.md" }).decision, "allow");
  assert.equal(decide({ kind: "filesystem.read", path: "../credential.txt" }).decision, "deny");
  assert.equal(decide({ kind: "process.execute", executable: "/usr/bin/git", runtime_ms: 5001 }).decision, "deny");
  assert.equal(decide({ kind: "credentials.use", environment: "UNLISTED_TOKEN" }).decision, "deny");
  assert.equal(decide({ kind: "network.request", url: "https://source.invalid/api/items", method: "GET", executable: "/usr/bin/git" }).decision, "allow");
  assert.equal(decide({ kind: "network.request", url: "https://source.invalid/api/items", method: "POST", executable: "/usr/bin/git" }).decision, "deny");
});

test("sandbox policy loader keeps policy paths inside the runtime root", async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "agenticgraph-sandbox-policy-"));
  await fs.writeFile(path.join(rootDir, "policy.yaml"), sourcePolicy(), "utf8");
  assert.equal((await loadAgentSandboxPolicy("policy.yaml", { rootDir })).ok, true);
  assert.equal((await loadAgentSandboxPolicy("../policy.yaml", { rootDir })).ok, false);
});

test("local MCP exposes sandbox policy validation and authorization as read-only preflight tools", () => {
  const definitions = buildAgenticGraphLocalMcpToolDefinitions();
  for (const toolName of [AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.sandboxPolicyValidate, AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.sandboxPolicyAuthorize]) {
    const descriptor = definitions.find((tool) => tool.name === toolName);
    assert.ok(descriptor);
    assert.equal(descriptor.annotations.readOnlyHint, true);
    assert.equal(descriptor.annotations.openWorldHint, false);
  }
});
