import assert from "node:assert/strict";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import { AGENTIC_OS_LOCAL_MCP_TOOL_NAMES, buildAgenticGraphLocalMcpToolDefinitions } from "../local-tool-contract.js";
import {
  WORKSPACE_ARTIFACT_APPLY_TOOL_NAME,
  WORKSPACE_ARTIFACT_PLAN_TOOL_NAME,
  WORKSPACE_ARTIFACT_TOOL_DEFINITIONS,
} from "../workspace-artifact-contract.js";

test("workspace artifact lifecycle registers exactly one plan and one apply tool", () => {
  assert.deepEqual(WORKSPACE_ARTIFACT_TOOL_DEFINITIONS.map(({ name }) => name), [
    WORKSPACE_ARTIFACT_PLAN_TOOL_NAME,
    WORKSPACE_ARTIFACT_APPLY_TOOL_NAME,
  ]);
  assert.equal(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.workspaceArtifactPlan, WORKSPACE_ARTIFACT_PLAN_TOOL_NAME);
  assert.equal(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.workspaceArtifactApply, WORKSPACE_ARTIFACT_APPLY_TOOL_NAME);
  const definitions = buildAgenticGraphLocalMcpToolDefinitions();
  assert.deepEqual(definitions.map(({ name }) => name), Object.values(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES));
  for (const definition of WORKSPACE_ARTIFACT_TOOL_DEFINITIONS) {
    assert.ok(definitions.some(({ name }) => name === definition.name));
    assert.doesNotThrow(() => new Ajv2020({ strict: false }).compile(definition.inputSchema));
    assert.doesNotThrow(() => new Ajv2020({ strict: false }).compile(definition.outputSchema));
  }
});

test("workspace artifact schemas stay closed and apply alone carries authority fields", () => {
  const [plan, apply] = WORKSPACE_ARTIFACT_TOOL_DEFINITIONS;
  assert.equal(plan.inputSchema.additionalProperties, false);
  assert.equal(apply.inputSchema.additionalProperties, false);
  assert.equal("planDigest" in plan.inputSchema.properties, false);
  assert.equal("operatorAuthorized" in plan.inputSchema.properties, false);
  assert.equal(apply.inputSchema.properties.operatorAuthorized.type, "boolean");
  assert.equal(plan.annotations.readOnlyHint, true);
  assert.equal(apply.annotations.destructiveHint, true);
});
