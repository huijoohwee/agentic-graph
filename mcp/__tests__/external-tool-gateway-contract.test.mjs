import assert from "node:assert/strict";
import test from "node:test";

import {
  EXTERNAL_TOOL_GATEWAY_TOOL_NAMES,
  buildExternalToolGatewayDefinitions,
  isExternalToolGatewayToolName,
} from "../external-tool-gateway-contract.js";
import { buildKnowgrphLocalMcpToolDefinitions, KNOWGRPH_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";

test("shared local MCP registry publishes the four capability-scoped gateway tools in stable order", () => {
  const definitions = buildKnowgrphLocalMcpToolDefinitions();
  const gatewayNames = Object.values(EXTERNAL_TOOL_GATEWAY_TOOL_NAMES);
  const indexes = gatewayNames.map((name) => definitions.findIndex((tool) => tool.name === name));
  assert.equal(indexes.every((index) => index >= 0), true);
  assert.deepEqual(indexes, [...indexes].sort((left, right) => left - right));
  assert.deepEqual(gatewayNames, [
    KNOWGRPH_LOCAL_MCP_TOOL_NAMES.toolCatalog,
    KNOWGRPH_LOCAL_MCP_TOOL_NAMES.toolSearch,
    KNOWGRPH_LOCAL_MCP_TOOL_NAMES.toolDescribe,
    KNOWGRPH_LOCAL_MCP_TOOL_NAMES.toolCall,
  ]);
  for (const name of gatewayNames) assert.equal(isExternalToolGatewayToolName(name), true);
  assert.equal(isExternalToolGatewayToolName("knowgrph.tool.unapproved"), false);
});

test("gateway capability schema admits stdio, streamable-http, and sse transports", () => {
  const transportEnum = buildExternalToolGatewayDefinitions()[0].outputSchema.properties.capabilities.items.properties.transportType.enum;
  assert.deepEqual(transportEnum, ["stdio", "streamable-http", "sse"]);
});

test("gateway descriptors expose bounded top-level schemas and mutation annotations", () => {
  const definitions = buildExternalToolGatewayDefinitions();
  assert.equal(definitions.length, 4);
  for (const definition of definitions) {
    assert.equal(definition.inputSchema.additionalProperties, false);
    assert.match(definition.description, /^Use this when/);
  }
  const [catalog, search, describe, call] = definitions;
  for (const tool of [catalog, search, describe]) {
    assert.deepEqual(tool.annotations, {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    });
  }
  assert.deepEqual(call.annotations, {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: true,
    idempotentHint: true,
  });
  assert.deepEqual(call.inputSchema.required, [
    "capabilityId",
    "capabilityRevision",
    "artifact",
    "idempotencyKey",
    "approvalToken",
  ]);
  for (const forbidden of ["endpoint", "command", "cwd", "env", "headers", "toolName", "arguments"]) {
    assert.equal(Object.hasOwn(call.inputSchema.properties, forbidden), false, `call schema exposed ${forbidden}`);
  }
});
