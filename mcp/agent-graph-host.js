import path from "node:path";
import Ajv from "ajv";

import {
  AGENT_GRAPH_INPUT_SCHEMAS,
  AGENT_GRAPH_INVOCATION_PROOF_SCHEMA,
} from "./agent-graph-tool-contract.js";
import { createLocalAgentGraphPdfConverter } from "./agent-graph-pdf-converter.js";
import {
  createAgentGraphRuntime,
  AGENT_GRAPH_TOOL_NAMES,
} from "./agent-graph/runtime.mjs";
import { selectAgentGraphOutputRoot } from "./agent-graph/storage-root.mjs";
import { verifyAgentGraphInvocation } from "./agent-graph-invocation-proof.js";

const TOOL_OPERATION = Object.freeze({
  [AGENT_GRAPH_TOOL_NAMES.parserGenerate]: "parser_generate",
  [AGENT_GRAPH_TOOL_NAMES.ingest]: "ingest",
  [AGENT_GRAPH_TOOL_NAMES.query]: "query",
  [AGENT_GRAPH_TOOL_NAMES.explainEdge]: "explain_edge",
});

const RESULT_SCHEMA = Object.freeze({
  parser_generate: "agentic-graph-agent-graph-parser-generate/v1",
  ingest: "agentic-graph-agent-graph-ingest/v1",
  query: "agentic-graph-agent-graph-query/v1",
  explain_edge: "agentic-graph-agent-graph-explain-edge/v1",
});

const runtimeCache = new Map();
const ajv = new Ajv({ allErrors: true, strict: false });
const inputValidators = Object.freeze(Object.fromEntries(
  Object.entries(AGENT_GRAPH_INPUT_SCHEMAS).map(([operation, schema]) => [operation, ajv.compile(schema)]),
));
const invocationValidator = ajv.compile(AGENT_GRAPH_INVOCATION_PROOF_SCHEMA);

const renamedEnv = (env, currentName, legacyName) => (
  String(env[currentName] || "").trim()
    ? env[currentName]
    : env[legacyName]
);

const failure = (operation, code, message) => ({
  schema: RESULT_SCHEMA[operation],
  ok: false,
  operation,
  error: { code, message },
});

function validateInvocation(toolName, invocation) {
  if (invocation === undefined) return null;
  if (!invocationValidator(invocation)) {
    const details = (invocationValidator.errors || []).slice(0, 4).map((error) => (
      `${error.instancePath || "/"} ${error.message || error.keyword}`
    )).join("; ");
    return `invocation must be a source-backed resolved proof: ${details}`;
  }
  if (invocation.tool !== toolName) {
    return "invocation proof is bound to a different MCP tool";
  }
  return null;
}

function validateArguments(operation, args) {
  const validator = inputValidators[operation];
  if (validator(args)) return "";
  return (validator.errors || []).slice(0, 8).map((error) => (
    `${error.instancePath || "/"} ${error.message || error.keyword}`
  )).join("; ");
}

function runtimeKey(rootDir, env) {
  return JSON.stringify([
    rootDir,
    renamedEnv(env, "AGENTIC_OS_AGENT_GRAPH_ALLOWED_ROOTS", "AGENTIC_OS_KNOWLEDGE_GRAPH_ALLOWED_ROOTS") || "",
    renamedEnv(env, "AGENTIC_OS_AGENT_GRAPH_OUTPUT_ROOT", "AGENTIC_OS_KNOWLEDGE_GRAPH_OUTPUT_ROOT") || "",
    renamedEnv(env, "AGENTIC_OS_AGENT_GRAPH_PDF_TIMEOUT_MS", "AGENTIC_OS_KNOWLEDGE_GRAPH_PDF_TIMEOUT_MS") || "",
    renamedEnv(env, "AGENTIC_OS_AGENT_GRAPH_PDF_MAX_OUTPUT_BYTES", "AGENTIC_OS_KNOWLEDGE_GRAPH_PDF_MAX_OUTPUT_BYTES") || "",
    renamedEnv(env, "AGENTIC_OS_AGENT_GRAPH_REPOSITORY_HOSTS", "AGENTIC_OS_KNOWLEDGE_GRAPH_REPOSITORY_HOSTS") || "",
    renamedEnv(env, "AGENTIC_OS_AGENT_GRAPH_ALLOW_PRIVATE_REPOSITORY_NETWORK", "AGENTIC_OS_KNOWLEDGE_GRAPH_ALLOW_PRIVATE_REPOSITORY_NETWORK") || "",
    env.AGENTIC_OS_PYTHON || "",
  ]);
}

function getRuntime({ rootDir, env }) {
  const absoluteRoot = path.resolve(rootDir);
  const key = runtimeKey(absoluteRoot, env);
  if (runtimeCache.has(key)) return runtimeCache.get(key);
  const configuredAllowedRoots = String(renamedEnv(
    env,
    "AGENTIC_OS_AGENT_GRAPH_ALLOWED_ROOTS",
    "AGENTIC_OS_KNOWLEDGE_GRAPH_ALLOWED_ROOTS",
  ) || "")
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => path.resolve(absoluteRoot, value));
  const outputRoot = selectAgentGraphOutputRoot({
    rootDir: absoluteRoot,
    configuredRoot: env.AGENTIC_OS_AGENT_GRAPH_OUTPUT_ROOT,
    legacyConfiguredRoot: env.AGENTIC_OS_KNOWLEDGE_GRAPH_OUTPUT_ROOT,
  });
  const pdfConverter = createLocalAgentGraphPdfConverter({
    rootDir: absoluteRoot,
    timeoutMs: renamedEnv(env, "AGENTIC_OS_AGENT_GRAPH_PDF_TIMEOUT_MS", "AGENTIC_OS_KNOWLEDGE_GRAPH_PDF_TIMEOUT_MS"),
    maxOutputBytes: renamedEnv(env, "AGENTIC_OS_AGENT_GRAPH_PDF_MAX_OUTPUT_BYTES", "AGENTIC_OS_KNOWLEDGE_GRAPH_PDF_MAX_OUTPUT_BYTES"),
  });
  const repositoryHosts = String(renamedEnv(
    env,
    "AGENTIC_OS_AGENT_GRAPH_REPOSITORY_HOSTS",
    "AGENTIC_OS_KNOWLEDGE_GRAPH_REPOSITORY_HOSTS",
  ) || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const runtime = createAgentGraphRuntime({
    agenticGraphRoot: absoluteRoot,
    allowedRoots: configuredAllowedRoots,
    repositoryHosts,
    allowPrivateRepositoryNetwork:
      renamedEnv(
        env,
        "AGENTIC_OS_AGENT_GRAPH_ALLOW_PRIVATE_REPOSITORY_NETWORK",
        "AGENTIC_OS_KNOWLEDGE_GRAPH_ALLOW_PRIVATE_REPOSITORY_NETWORK",
      ) === "1",
    outputRoot,
    pdfConverter,
    pdfConverterVersion: "agentic-graph-native-pdf-v3",
    pythonBin: env.AGENTIC_OS_PYTHON || "python3",
  });
  runtimeCache.set(key, runtime);
  return runtime;
}

export const isAgentGraphToolName = (toolName) => Object.hasOwn(TOOL_OPERATION, toolName);

export async function runAgentGraphTool(toolName, args, {
  rootDir,
  env = process.env,
  abortSignal,
  docsResolver,
  onProgress,
} = {}) {
  const operation = TOOL_OPERATION[toolName];
  if (!operation) return failure("query", "unknown_tool", `Unknown knowledge graph tool: ${String(toolName || "")}`);
  const invocationError = validateInvocation(toolName, args?.invocation);
  if (invocationError) return failure(operation, "invalid_invocation", invocationError);
  const sourceInvocationError = await verifyAgentGraphInvocation(toolName, args?.invocation, {
    rootDir,
    env,
    docsResolver,
  });
  if (sourceInvocationError) return failure(operation, "invalid_invocation", sourceInvocationError);
  const argumentsError = validateArguments(operation, args);
  if (argumentsError) return failure(operation, "invalid_arguments", `Knowledge graph arguments failed validation: ${argumentsError}`);
  const { invocation: _invocation, ...runtimeArgs } = args || {};
  return getRuntime({ rootDir, env }).run(toolName, runtimeArgs, { abortSignal, onProgress });
}
