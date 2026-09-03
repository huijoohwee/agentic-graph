const OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: true,
  required: ["ok", "schema"],
  properties: {
    ok: { type: "boolean" },
    schema: { type: "string" },
    policy_id: { type: "string" },
    policy_digest: { type: "string" },
    decision: { type: "string", enum: ["allow", "deny"] },
    reason_code: { type: "string" },
    errors: { type: "array", items: { type: "string" } },
    enforcement: { type: "object", additionalProperties: true },
  },
});

const OPERATION_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["kind"],
  properties: {
    kind: { type: "string", enum: ["filesystem.read", "filesystem.write", "process.execute", "network.request", "credentials.use"] },
    path: { type: "string" },
    executable: { type: "string" },
    runtime_ms: { type: "number", minimum: 0 },
    url: { type: "string" },
    method: { type: "string" },
    environment: { type: "string" },
  },
});

export const buildAgentSandboxPolicyToolDefinitions = ({ toolNames, withDefaults, readOnlyAnnotations }) => [
  withDefaults({
    name: toolNames.sandboxPolicyValidate,
    description: "Use this when a local MCP host needs to validate and compile one source-backed dependency-free agent sandbox policy without executing commands, accessing credentials, or opening network connections.",
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["policy_path"],
      properties: { policy_path: { type: "string", description: "YAML 1.2 JSON-compatible policy path inside AGENTIC_OS_ROOT." } },
    },
  }, readOnlyAnnotations),
  withDefaults({
    name: toolNames.sandboxPolicyAuthorize,
    description: "Use this when a local MCP host needs a fail-closed preflight decision for one filesystem, process, network, or credential operation under a compiled sandbox policy; this does not provide OS isolation or execute the operation.",
    outputSchema: OUTPUT_SCHEMA,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["policy_path", "operation"],
      properties: {
        policy_path: { type: "string", description: "YAML 1.2 JSON-compatible policy path inside AGENTIC_OS_ROOT." },
        operation: OPERATION_SCHEMA,
      },
    },
  }, readOnlyAnnotations),
];
