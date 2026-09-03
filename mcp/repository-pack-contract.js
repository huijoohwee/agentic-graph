export const REPOSITORY_PACK_TOOL_NAME = "agentic-graph.repository.pack";
export const REPOSITORY_PACK_SCHEMA_VERSION = "agentic-graph-repository-pack-result/v1";
export const REPOSITORY_PACK_FORMAT_VERSION = "agentic-graph-repository-pack/v1";
export const REPOSITORY_PACK_INVOCATION = "/repository.pack #repository-packing @repository-root @runtime-proof";

export const REPOSITORY_PACK_DEFAULT_REQUEST = Object.freeze({
  repositoryPath: ".",
  outputDirectory: "data/outputs/repository-packs",
  includePaths: Object.freeze([]),
  excludePaths: Object.freeze([]),
  maxFiles: 12_000,
  maxFileBytes: 2_097_152,
  maxTotalBytes: 134_217_728,
});

export const REPOSITORY_PACK_HARD_BOUNDS = Object.freeze({
  maxFiles: 20_000,
  maxFileBytes: 8_388_608,
  maxTotalBytes: 268_435_456,
  maxPolicyPaths: 256,
  maxPathBytes: 1_024,
  defaultMaxOutputBytes: 268_435_456,
  hardMaxOutputBytes: 536_870_912,
  defaultRuntimeMs: 60_000,
  hardRuntimeMs: 120_000,
  maxResponseBytes: 65_536,
});

const POLICY_PATH_SCHEMA = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: REPOSITORY_PACK_HARD_BOUNDS.maxPathBytes,
  pattern: "^(?![A-Za-z][A-Za-z0-9+.-]*:)(?!/)(?!.*\\\\)(?!.*(?:^|/)\\.{1,2}(?:/|$))(?!.*//)[^\\u0000-\\u001F\\u007F]+$",
});

export const REPOSITORY_PACK_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    repositoryPath: {
      ...POLICY_PATH_SCHEMA,
      pattern: "^(?:\\.|(?![A-Za-z][A-Za-z0-9+.-]*:)(?!/)(?!.*\\\\)(?!.*(?:^|/)\\.{1,2}(?:/|$))(?!.*//)[^\\u0000-\\u001F\\u007F]+)$",
      default: REPOSITORY_PACK_DEFAULT_REQUEST.repositoryPath,
      description: "Repository-relative path beneath the host MCP root that must resolve to an exact Git worktree root.",
    },
    outputDirectory: {
      ...POLICY_PATH_SCHEMA,
      default: REPOSITORY_PACK_DEFAULT_REQUEST.outputDirectory,
      description: "Repository-relative artifact directory beneath the selected worktree.",
    },
    includePaths: {
      type: "array",
      maxItems: REPOSITORY_PACK_HARD_BOUNDS.maxPolicyPaths,
      uniqueItems: true,
      default: [],
      items: POLICY_PATH_SCHEMA,
      description: "Optional repository-relative file or directory prefixes; empty selects every eligible path.",
    },
    excludePaths: {
      type: "array",
      maxItems: REPOSITORY_PACK_HARD_BOUNDS.maxPolicyPaths,
      uniqueItems: true,
      default: [],
      items: POLICY_PATH_SCHEMA,
      description: "Repository-relative file or directory prefixes removed after inclusion.",
    },
    maxFiles: {
      type: "integer",
      minimum: 1,
      maximum: REPOSITORY_PACK_HARD_BOUNDS.maxFiles,
      default: REPOSITORY_PACK_DEFAULT_REQUEST.maxFiles,
      description: "Maximum selected candidates after include/exclude policy.",
    },
    maxFileBytes: {
      type: "integer",
      minimum: 1,
      maximum: REPOSITORY_PACK_HARD_BOUNDS.maxFileBytes,
      default: REPOSITORY_PACK_DEFAULT_REQUEST.maxFileBytes,
    },
    maxTotalBytes: {
      type: "integer",
      minimum: 1,
      maximum: REPOSITORY_PACK_HARD_BOUNDS.maxTotalBytes,
      default: REPOSITORY_PACK_DEFAULT_REQUEST.maxTotalBytes,
    },
  },
});

const SHA_OR_NULL = Object.freeze({
  type: ["string", "null"],
  pattern: "^[0-9a-f]{64}$",
});
const COUNT = Object.freeze({ type: "integer", minimum: 0 });
const COUNTS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "discoveredFiles",
    "embeddedFiles",
    "binaryFiles",
    "omittedFiles",
    "fileCount",
    "sourceBytes",
    "outputBytes",
  ],
  properties: {
    discoveredFiles: COUNT,
    embeddedFiles: COUNT,
    binaryFiles: COUNT,
    omittedFiles: COUNT,
    fileCount: COUNT,
    sourceBytes: COUNT,
    outputBytes: COUNT,
  },
});
const BOUNDS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "maxFiles",
    "maxFileBytes",
    "maxTotalBytes",
    "maxOutputBytes",
    "maxRuntimeMs",
    "maxResponseBytes",
    "maxPolicyPaths",
    "maxPathBytes",
  ],
  properties: {
    maxFiles: { type: "integer", minimum: 1, maximum: REPOSITORY_PACK_HARD_BOUNDS.maxFiles },
    maxFileBytes: { type: "integer", minimum: 1, maximum: REPOSITORY_PACK_HARD_BOUNDS.maxFileBytes },
    maxTotalBytes: { type: "integer", minimum: 1, maximum: REPOSITORY_PACK_HARD_BOUNDS.maxTotalBytes },
    maxOutputBytes: { type: "integer", minimum: 1, maximum: REPOSITORY_PACK_HARD_BOUNDS.hardMaxOutputBytes },
    maxRuntimeMs: { type: "integer", minimum: 1, maximum: REPOSITORY_PACK_HARD_BOUNDS.hardRuntimeMs },
    maxResponseBytes: { const: REPOSITORY_PACK_HARD_BOUNDS.maxResponseBytes },
    maxPolicyPaths: { const: REPOSITORY_PACK_HARD_BOUNDS.maxPolicyPaths },
    maxPathBytes: { const: REPOSITORY_PACK_HARD_BOUNDS.maxPathBytes },
  },
});
const OMISSIONS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["policyExcluded", "binary", "symlink", "submodule", "nonRegular"],
  properties: {
    policyExcluded: COUNT,
    binary: COUNT,
    symlink: COUNT,
    submodule: COUNT,
    nonRegular: COUNT,
  },
});
const ERROR_SCHEMA = Object.freeze({
  type: ["object", "null"],
  additionalProperties: false,
  required: ["code", "message"],
  properties: {
    code: { type: "string", minLength: 1, maxLength: 80 },
    message: { type: "string", minLength: 1, maxLength: 240 },
  },
});

export const REPOSITORY_PACK_OUTPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "ok",
    "status",
    "tool",
    "invocation",
    "artifactPath",
    "artifactSha256",
    "sourceSetSha256",
    "gitRevision",
    "counts",
    "bounds",
    "omissions",
    "reused",
    "networkCalls",
    "modelCalls",
    "inputTokens",
    "outputTokens",
    "costUsd",
    "error",
  ],
  properties: {
    schemaVersion: { const: REPOSITORY_PACK_SCHEMA_VERSION },
    ok: { type: "boolean" },
    status: { type: "string", enum: ["completed", "blocked"] },
    tool: { const: REPOSITORY_PACK_TOOL_NAME },
    invocation: { const: REPOSITORY_PACK_INVOCATION },
    artifactPath: {
      type: ["string", "null"],
      maxLength: 1_100,
      pattern: "^(?!/)(?!.*\\\\)(?!.*(?:^|/)\\.\\.(?:/|$)).+/[0-9a-f]{64}\\.md$",
    },
    artifactSha256: SHA_OR_NULL,
    sourceSetSha256: SHA_OR_NULL,
    gitRevision: { type: "string", pattern: "^(?:[0-9a-f]{40,64}|unavailable)$" },
    counts: COUNTS_SCHEMA,
    bounds: BOUNDS_SCHEMA,
    omissions: OMISSIONS_SCHEMA,
    reused: { type: "boolean" },
    networkCalls: { const: 0 },
    modelCalls: { const: 0 },
    inputTokens: { const: 0 },
    outputTokens: { const: 0 },
    costUsd: { const: 0 },
    error: ERROR_SCHEMA,
  },
});

export const REPOSITORY_PACK_TOOL_DEFINITION = Object.freeze({
  name: REPOSITORY_PACK_TOOL_NAME,
  title: "Pack repository for AI context",
  description: "Use this when a local MCP host needs one deterministic, bounded, AI-friendly Markdown artifact containing the selected Git worktree without model calls, network calls, or external packing services.",
  inputSchema: REPOSITORY_PACK_INPUT_SCHEMA,
  outputSchema: REPOSITORY_PACK_OUTPUT_SCHEMA,
});
