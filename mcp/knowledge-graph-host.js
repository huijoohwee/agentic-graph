import path from "node:path";
import Ajv from "ajv";

import {
  KNOWLEDGE_GRAPH_INPUT_SCHEMAS,
  KNOWLEDGE_GRAPH_INVOCATION_PROOF_SCHEMA,
} from "./knowledge-graph-tool-contract.js";
import { createLocalKnowledgeGraphPdfConverter } from "./knowledge-graph-pdf-converter.js";
import {
  createKnowledgeGraphRuntime,
  KNOWLEDGE_GRAPH_TOOL_NAMES,
} from "./knowledge-graph/runtime.mjs";

const TOOL_OPERATION = Object.freeze({
  [KNOWLEDGE_GRAPH_TOOL_NAMES.ingest]: "ingest",
  [KNOWLEDGE_GRAPH_TOOL_NAMES.query]: "query",
  [KNOWLEDGE_GRAPH_TOOL_NAMES.explainEdge]: "explain_edge",
});

const RESULT_SCHEMA = Object.freeze({
  ingest: "knowgrph-knowledge-graph-ingest/v1",
  query: "knowgrph-knowledge-graph-query/v1",
  explain_edge: "knowgrph-knowledge-graph-explain-edge/v1",
});

const runtimeCache = new Map();
const ajv = new Ajv({ allErrors: true, strict: false });
const inputValidators = Object.freeze(Object.fromEntries(
  Object.entries(KNOWLEDGE_GRAPH_INPUT_SCHEMAS).map(([operation, schema]) => [operation, ajv.compile(schema)]),
));
const invocationValidator = ajv.compile(KNOWLEDGE_GRAPH_INVOCATION_PROOF_SCHEMA);

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
    env.KNOWGRPH_KNOWLEDGE_GRAPH_ALLOWED_ROOTS || "",
    env.KNOWGRPH_KNOWLEDGE_GRAPH_OUTPUT_ROOT || "",
    env.KNOWGRPH_KNOWLEDGE_GRAPH_PDF_TIMEOUT_MS || "",
    env.KNOWGRPH_KNOWLEDGE_GRAPH_PDF_MAX_OUTPUT_BYTES || "",
    env.KNOWGRPH_PYTHON || "",
  ]);
}

function getRuntime({ rootDir, env }) {
  const absoluteRoot = path.resolve(rootDir);
  const key = runtimeKey(absoluteRoot, env);
  if (runtimeCache.has(key)) return runtimeCache.get(key);
  const configuredAllowedRoots = String(env.KNOWGRPH_KNOWLEDGE_GRAPH_ALLOWED_ROOTS || "")
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => path.resolve(absoluteRoot, value));
  const outputRoot = path.resolve(
    absoluteRoot,
    env.KNOWGRPH_KNOWLEDGE_GRAPH_OUTPUT_ROOT || "data/outputs/knowledge-graph",
  );
  const pdfConverter = createLocalKnowledgeGraphPdfConverter({
    rootDir: absoluteRoot,
    timeoutMs: env.KNOWGRPH_KNOWLEDGE_GRAPH_PDF_TIMEOUT_MS,
    maxOutputBytes: env.KNOWGRPH_KNOWLEDGE_GRAPH_PDF_MAX_OUTPUT_BYTES,
  });
  const runtime = createKnowledgeGraphRuntime({
    knowgrphRoot: absoluteRoot,
    allowedRoots: configuredAllowedRoots,
    outputRoot,
    pdfConverter,
    pdfConverterVersion: "knowgrph-native-pdf-v3",
    pythonBin: env.KNOWGRPH_PYTHON || "python3",
  });
  runtimeCache.set(key, runtime);
  return runtime;
}

export const isKnowledgeGraphToolName = (toolName) => Object.hasOwn(TOOL_OPERATION, toolName);

export async function runKnowledgeGraphTool(toolName, args, {
  rootDir,
  env = process.env,
  abortSignal,
} = {}) {
  const operation = TOOL_OPERATION[toolName];
  if (!operation) return failure("query", "unknown_tool", `Unknown knowledge graph tool: ${String(toolName || "")}`);
  const invocationError = validateInvocation(toolName, args?.invocation);
  if (invocationError) return failure(operation, "invalid_invocation", invocationError);
  const argumentsError = validateArguments(operation, args);
  if (argumentsError) return failure(operation, "invalid_arguments", `Knowledge graph arguments failed validation: ${argumentsError}`);
  const { invocation: _invocation, ...runtimeArgs } = args || {};
  return getRuntime({ rootDir, env }).run(toolName, runtimeArgs, { abortSignal });
}
