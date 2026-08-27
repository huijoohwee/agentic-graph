export const WORKSPACE_ARTIFACT_PLAN_TOOL_NAME = "agenticgraph.workspace_artifact.plan";
export const WORKSPACE_ARTIFACT_APPLY_TOOL_NAME = "agenticgraph.workspace_artifact.apply";

const OPERATION = Object.freeze([
  "inspect",
  "create-file",
  "create-folder",
  "update-file",
  "import-file",
  "export-file",
  "trash-file",
]);

const REQUEST_PROPERTIES = Object.freeze({
  operation: { type: "string", enum: OPERATION },
  workspaceRoot: { type: "string", minLength: 1, maxLength: 4096 },
  path: { type: "string", minLength: 1, maxLength: 1024 },
  sourcePath: { type: "string", minLength: 1, maxLength: 4096 },
  destinationPath: { type: "string", minLength: 1, maxLength: 4096 },
  trashPath: { type: "string", minLength: 1, maxLength: 1024 },
  content: { type: "string", maxLength: 1048576 },
  expectedDigest: { type: "string", pattern: "^[0-9a-f]{64}$" },
  collisionPolicy: { type: "string", enum: ["fail", "verify-identical"], default: "fail" },
});

const PLAN_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["operation", "workspaceRoot", "path"],
  properties: REQUEST_PROPERTIES,
});

const APPLY_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["operation", "workspaceRoot", "path", "planDigest"],
  properties: {
    ...REQUEST_PROPERTIES,
    planDigest: { type: "string", pattern: "^[0-9a-f]{64}$" },
    operatorAuthorized: { type: "boolean", default: false },
  },
});

const RESULT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["ok", "schemaVersion", "operation", "planDigest", "economics"],
  properties: {
    ok: { type: "boolean" },
    schemaVersion: { type: "string" },
    operation: { type: "string", enum: OPERATION },
    planDigest: { type: "string", pattern: "^[0-9a-f]{64}$" },
    economics: {
      type: "object",
      additionalProperties: false,
      required: ["networkCalls", "modelCalls", "inputTokens", "outputTokens", "estimatedCostUsd"],
      properties: {
        networkCalls: { const: 0 }, modelCalls: { const: 0 }, inputTokens: { const: 0 },
        outputTokens: { const: 0 }, estimatedCostUsd: { const: 0 },
      },
    },
  },
});

export const WORKSPACE_ARTIFACT_TOOL_DEFINITIONS = Object.freeze([
  Object.freeze({
    name: WORKSPACE_ARTIFACT_PLAN_TOOL_NAME,
    description: "Use this when an agent needs a read-only plan for one bounded configured-root workspace file or folder operation.",
    inputSchema: PLAN_INPUT_SCHEMA,
    outputSchema: RESULT_SCHEMA,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  }),
  Object.freeze({
    name: WORKSPACE_ARTIFACT_APPLY_TOOL_NAME,
    description: "Use this when an operator has authorized one exact digest-fenced workspace artifact plan and needs a verified read-back receipt.",
    inputSchema: APPLY_INPUT_SCHEMA,
    outputSchema: RESULT_SCHEMA,
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false, idempotentHint: true },
  }),
]);

export const isWorkspaceArtifactToolName = (name) => (
  name === WORKSPACE_ARTIFACT_PLAN_TOOL_NAME || name === WORKSPACE_ARTIFACT_APPLY_TOOL_NAME
);
