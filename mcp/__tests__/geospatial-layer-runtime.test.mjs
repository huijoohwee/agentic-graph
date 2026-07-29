import assert from "node:assert/strict";
import test from "node:test";
import { KNOWGRPH_GEOSPATIAL_MCP_TOOL_NAMES, buildGeospatialLayerToolDefinition } from "../geospatial-layer-tool-contract.js";
import { runGeospatialLayerTool } from "../geospatial-layer-runtime.js";
import { buildKnowgrphLocalMcpToolDefinitions } from "../local-tool-contract.js";

test("geospatial MCP tool exposes the three bounded command actions", () => {
  const definition = buildGeospatialLayerToolDefinition();
  assert.equal(definition.name, KNOWGRPH_GEOSPATIAL_MCP_TOOL_NAMES.command);
  assert.equal(definition.inputSchema.properties.command.oneOf.length, 3);
  assert.equal(
    buildKnowgrphLocalMcpToolDefinitions().filter(tool => tool.name === definition.name).length,
    1,
  );
});

test("geospatial MCP runtime returns a validated command envelope and local Canvas URL", () => {
  const result = runGeospatialLayerTool(
    { command: { kind: "extrusion.visibility", layerId: "buildings:building", visible: false } },
    { host: "127.0.0.1", port: 5173 },
  );
  assert.equal(result.ok, true);
  assert.equal(result.envelope.schemaId, "knowgrph-geospatial-command/v1");
  assert.match(result.url, /^http:\/\/127\.0\.0\.1:5173\/\?kgGeo=1&kgGeoCommand=/);
});

test("invalid geospatial MCP input returns a typed error without a URL", () => {
  const result = runGeospatialLayerTool({ command: { kind: "delete.everything" } });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "invalid-command");
  assert.equal(result.url, "");
});
