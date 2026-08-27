export const AGENTICGRAPH_GEOSPATIAL_MCP_TOOL_NAMES = Object.freeze({
  command: "agenticgraph.geospatial.command",
});

const VISIBILITY_SCHEMA = Object.freeze({
  type: "boolean",
  description: "True shows the target; false hides it.",
});

export const buildGeospatialLayerToolDefinition = (toolName = AGENTICGRAPH_GEOSPATIAL_MCP_TOOL_NAMES.command) => ({
  name: toolName,
  title: "Control enhanced Geospatial Mode layers",
  description: "Use this to enable Geospatial Mode or set a configured extrusion or 3D asset visibility through the gated browser bridge.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["command"],
    properties: {
      command: {
        oneOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["kind", "enabled"],
            properties: {
              kind: { const: "mode.set" },
              enabled: { type: "boolean" },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["kind", "layerId", "visible"],
            properties: {
              kind: { const: "extrusion.visibility" },
              layerId: { type: "string", minLength: 1, maxLength: 200 },
              visible: VISIBILITY_SCHEMA,
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["kind", "assetId", "visible"],
            properties: {
              kind: { const: "asset.visibility" },
              assetId: { type: "string", minLength: 1, maxLength: 200 },
              visible: VISIBILITY_SCHEMA,
            },
          },
        ],
      },
      host: { type: "string", description: "Canvas host. Defaults to the configured local UI host." },
      port: { type: "number", minimum: 1, maximum: 65535, description: "Canvas port. Defaults to the configured local UI port." },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["ok", "envelope", "url"],
    properties: {
      ok: { type: "boolean" },
      envelope: { type: "object", additionalProperties: true },
      url: { type: "string" },
      error: { type: "object", additionalProperties: true },
    },
  },
});
