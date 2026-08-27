import { createHash } from "node:crypto";

import {
  AGENTIC_CANVAS_OS_DOCS_SOURCE_ROOT_URL,
} from "./agentic-canvas-os-docs-contract.mjs";
import { runAgenticCanvasOsDocsInvokeTool } from "./agentic-canvas-os-docs-runtime.js";
import {
  PERSISTENT_MEMORY_CONTRACT_VERSION,
  PERSISTENT_MEMORY_INVOCATION_ROUTES,
} from "./persistent-memory-contract.mjs";

const INVOCATION_RESULT_SCHEMA = "agenticgraph-persistent-memory-invocation-result/v1";
const INVOCATION_RECEIPT_SCHEMA = "agenticgraph-persistent-memory-invocation-receipt/v1";
const SOURCE_REVISION_PATTERN = /^[0-9a-f]{40}$/;
const TOKEN_PATTERN = /^[/#@][a-z0-9_.-]{1,96}$/;
const MAX_INVOCATION_LENGTH = 800;
const MAX_INVOCATION_TOKENS = 12;
const REQUEST_KEYS = Object.freeze(["arguments", "invocation", "source_revision"]);
const FORBIDDEN_TOKENS = new Set([
  "/memory.seed",
  "#frozen-snapshot",
  "@memory-snapshot",
]);
const KIND_BY_SIGIL = Object.freeze({
  "/": "command",
  "#": "semantic",
  "@": "binding",
});
const FILE_BY_KIND = Object.freeze({
  command: "DICTIONARY-COMMAND.md",
  semantic: "DICTIONARY-SEMANTIC.md",
  binding: "DICTIONARY-BINDING.md",
});
const ECONOMICS = Object.freeze({
  provider: "local-deterministic",
  model_calls: 0,
  estimated_cost_usd: 0,
});

export class PersistentMemoryInvocationError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "PersistentMemoryInvocationError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

const fail = (code, message, details) => {
  throw new PersistentMemoryInvocationError(code, message, details);
};

const isRecord = (value) => (
  Boolean(value)
  && typeof value === "object"
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);

const canonicalJson = (value, ancestors = new Set(), depth = 0) => {
  if (depth > 32) fail("invalid_invocation_arguments", "Invocation arguments exceed the maximum nesting depth.");
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail("invalid_invocation_arguments", "Invocation arguments must contain only finite JSON numbers.");
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    fail("invalid_invocation_arguments", "Invocation arguments must be JSON serializable.");
  }
  if (ancestors.has(value)) {
    fail("invalid_invocation_arguments", "Invocation arguments must not contain cycles.");
  }
  ancestors.add(value);
  let serialized;
  if (Array.isArray(value)) {
    serialized = `[${value.map((entry) => canonicalJson(entry, ancestors, depth + 1)).join(",")}]`;
  } else {
    if (!isRecord(value)) {
      fail("invalid_invocation_arguments", "Invocation arguments must contain only plain JSON objects.");
    }
    const keys = Object.keys(value).sort();
    serialized = `{${keys.map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key], ancestors, depth + 1)}`
    )).join(",")}}`;
  }
  ancestors.delete(value);
  return serialized;
};

const digestText = (value) => createHash("sha256").update(value).digest("hex");
const digestValue = (value) => digestText(canonicalJson(value));
const cloneJson = (value) => JSON.parse(canonicalJson(value));

const uniqueTokens = (tokens, code, label) => {
  if (new Set(tokens).size !== tokens.length) {
    fail(code, `${label} must not contain duplicate tokens.`);
  }
};

export function parsePersistentMemoryInvocation(value) {
  if (typeof value !== "string" || !value.trim() || value.length > MAX_INVOCATION_LENGTH) {
    fail(
      "invalid_invocation_syntax",
      `Invocation must be a non-empty string no longer than ${MAX_INVOCATION_LENGTH} characters.`,
    );
  }
  const tokens = value.trim().split(/\s+/);
  if (tokens.length > MAX_INVOCATION_TOKENS) {
    fail(
      "invalid_invocation_syntax",
      `Invocation must contain at most ${MAX_INVOCATION_TOKENS} tokens.`,
    );
  }

  const seen = new Set();
  const commands = [];
  const semantics = [];
  const bindings = [];
  for (const token of tokens) {
    if (token !== token.toLowerCase()) {
      fail("mixed_case_invocation_token", "Invocation tokens must be lowercase.");
    }
    if (!TOKEN_PATTERN.test(token)) {
      fail("invalid_invocation_token", "Invocation contains an invalid token.");
    }
    if (FORBIDDEN_TOKENS.has(token)) {
      fail("forbidden_invocation_token", "Invocation contains a non-executable token.");
    }
    if (seen.has(token)) {
      fail("duplicate_invocation_token", "Invocation contains a duplicate token.");
    }
    seen.add(token);
    if (token.startsWith("/")) commands.push(token);
    if (token.startsWith("#")) semantics.push(token);
    if (token.startsWith("@")) bindings.push(token);
  }
  if (commands.length !== 1) {
    fail("invalid_invocation_command", "Invocation must contain exactly one slash command.");
  }
  uniqueTokens(semantics, "duplicate_invocation_token", "Semantic filters");
  uniqueTokens(bindings, "duplicate_invocation_token", "Bindings");
  return Object.freeze({
    command: commands[0],
    semantics: Object.freeze(semantics),
    bindings: Object.freeze(bindings),
    tokens: Object.freeze(tokens),
  });
}

const compareTokenSets = (actual, expected, family) => {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((token) => !actualSet.has(token));
  const extra = actual.filter((token) => !expectedSet.has(token));
  if (missing.length || extra.length || actualSet.size !== expectedSet.size) {
    fail("invocation_tuple_mismatch", `Invocation ${family} do not match the registered route.`, {
      family,
      missing,
      extra_count: extra.length,
    });
  }
};

const routeForInvocation = (parsed) => {
  const route = PERSISTENT_MEMORY_INVOCATION_ROUTES[parsed.command];
  if (!route) {
    fail("unknown_invocation_command", "Invocation command is not registered.");
  }
  compareTokenSets(parsed.semantics, route.semantics, "semantics");
  compareTokenSets(parsed.bindings, route.bindings, "bindings");
  return route;
};

const expectedSourcePath = (token, kind) => `${FILE_BY_KIND[kind]}#${token}`;

const expectedSourceUrl = (sourceRevision, sourcePath) => {
  const revisionRoot = AGENTIC_CANVAS_OS_DOCS_SOURCE_ROOT_URL.replace(
    "/blob/main/",
    `/blob/${sourceRevision}/`,
  );
  return `${revisionRoot}/${sourcePath}`;
};

const parseDictionaryRow = (content, token, expectedColumns) => {
  if (
    typeof content !== "string"
    || content !== content.trim()
    || content.includes("\n")
    || !content.startsWith("|")
    || !content.endsWith("|")
  ) {
    fail("invocation_content_invalid", `Canonical dictionary row is invalid for ${token}.`, { token });
  }
  const rawCells = content.split("|");
  if (rawCells.shift()?.trim() !== "" || rawCells.pop()?.trim() !== "") {
    fail("invocation_content_invalid", `Canonical dictionary row is invalid for ${token}.`, { token });
  }
  const cells = rawCells.map((cell) => cell.trim());
  if (cells.length !== expectedColumns || cells[0] !== `\`${token}\``) {
    fail("invocation_content_invalid", `Canonical dictionary row has the wrong shape for ${token}.`, {
      token,
      expectedColumns,
    });
  }
  return cells;
};

const parseTokenListCell = (cell, sigil, token) => {
  const items = cell.split(",").map((item) => item.trim()).filter(Boolean);
  const tokens = items.map((item) => {
    const match = item.match(/^`([#@][a-z0-9_.-]{1,96})`$/);
    if (!match || !match[1].startsWith(sigil)) {
      fail("invocation_row_mismatch", `Canonical command row has an invalid ${sigil} list for ${token}.`, {
        token,
      });
    }
    return match[1];
  });
  uniqueTokens(tokens, "invocation_row_mismatch", `Canonical ${sigil} list`);
  return tokens;
};

const validateCommandRow = (content, command, route) => {
  const cells = parseDictionaryRow(content, command, 5);
  const rowBindings = parseTokenListCell(cells[2], "@", command);
  const rowSemantics = parseTokenListCell(cells[3], "#", command);
  try {
    compareTokenSets(rowBindings, route.bindings, "row bindings");
    compareTokenSets(rowSemantics, route.semantics, "row semantics");
  } catch (error) {
    if (error instanceof PersistentMemoryInvocationError) {
      fail("invocation_row_mismatch", "Canonical command row does not match the registered route.", {
        command,
      });
    }
    throw error;
  }
  return digestText(content);
};

const validateResolvedToken = (payload, token, sourceRevision) => {
  const expectedKind = KIND_BY_SIGIL[token[0]];
  const sourcePath = expectedSourcePath(token, expectedKind);
  if (!payload || typeof payload !== "object" || payload.ok !== true) {
    fail("invocation_token_unavailable", `Canonical invocation token is unavailable: ${token}`, { token });
  }
  if (!SOURCE_REVISION_PATTERN.test(String(payload.sourceRevision || ""))) {
    fail("invocation_source_revision_invalid", "Canonical invocation source revision is invalid.", { token });
  }
  if (payload.sourceRevision !== sourceRevision) {
    fail("invocation_source_revision_mismatch", "Canonical invocation source revision does not match the request.", {
      token,
      expected: sourceRevision,
      actual: payload.sourceRevision,
    });
  }
  if (payload.token !== token || payload.invocation?.token !== token) {
    fail("invocation_token_mismatch", `Canonical invocation token did not echo exactly: ${token}`, { token });
  }
  if (payload.invocation?.kind !== expectedKind) {
    fail("invocation_kind_mismatch", `Canonical invocation kind is invalid for ${token}.`, {
      token,
      expectedKind,
    });
  }
  if (payload.invocation?.sourcePath !== sourcePath) {
    fail("invocation_source_path_mismatch", `Canonical invocation source path is invalid for ${token}.`, {
      token,
      expected: sourcePath,
    });
  }
  const sourceUrl = expectedSourceUrl(sourceRevision, sourcePath);
  if (payload.invocation?.sourceUrl !== sourceUrl) {
    fail("invocation_source_url_mismatch", `Canonical invocation source URL is invalid for ${token}.`, {
      token,
    });
  }
  const expectedColumns = expectedKind === "command" ? 5 : 4;
  parseDictionaryRow(payload.invocation?.content, token, expectedColumns);
  return Object.freeze({
    token,
    kind: expectedKind,
    sourcePath,
    sourceUrl,
    content: payload.invocation.content,
  });
};

const resolveInvocationEvidence = async ({
  tokens,
  command,
  route,
  sourceRevision,
  resolveToken,
}) => {
  let payloads;
  try {
    payloads = await Promise.all(tokens.map((token) => resolveToken({
      token,
      includeContent: true,
    })));
  } catch {
    fail("invocation_resolution_unavailable", "Canonical invocation metadata is unavailable.");
  }
  const entries = payloads.map((payload, index) => (
    validateResolvedToken(payload, tokens[index], sourceRevision)
  ));
  const commandEntry = entries.find((entry) => entry.token === command);
  const rowDigest = validateCommandRow(commandEntry.content, command, route);
  const resolutionDigest = digestValue(entries);
  return Object.freeze({ entries, rowDigest, resolutionDigest });
};

const validateRunRequest = (args) => {
  if (!isRecord(args)) {
    fail("invalid_invocation_request", "Invocation request must be an object.");
  }
  const keys = Object.keys(args).sort();
  if (keys.length !== REQUEST_KEYS.length || keys.some((key, index) => key !== REQUEST_KEYS[index])) {
    fail("invalid_invocation_request", "Invocation request must contain only invocation, source_revision, and arguments.");
  }
  if (!SOURCE_REVISION_PATTERN.test(String(args.source_revision || ""))) {
    fail("invalid_source_revision", "source_revision must be an exact lowercase 40-character SHA.");
  }
  if (!isRecord(args.arguments)) {
    fail("invalid_invocation_arguments", "arguments must be a plain JSON object.");
  }
  const operationArguments = cloneJson(args.arguments);
  return Object.freeze({
    parsed: parsePersistentMemoryInvocation(args.invocation),
    sourceRevision: args.source_revision,
    operationArguments,
    payloadDigest: digestValue(operationArguments),
  });
};

const errorPayload = (error) => {
  const typed = error instanceof PersistentMemoryInvocationError;
  const code = typed
    ? error.code
    : /^[a-z][a-z0-9_]{0,95}$/.test(String(error?.code || ""))
      ? error.code
      : "persistent_memory_dispatch_failed";
  const message = typed ? error.message : "Persistent memory dispatch failed.";
  return {
    ok: false,
    contractVersion: PERSISTENT_MEMORY_CONTRACT_VERSION,
    operation: "invoke",
    schema: INVOCATION_RESULT_SCHEMA,
    error: {
      code,
      message,
      ...(typed && error.details !== undefined ? { details: error.details } : {}),
    },
    economics: { ...ECONOMICS },
    deploymentAttempted: false,
  };
};

export function createPersistentMemoryInvocationRuntime({
  resolveToken,
  dispatch,
  rootDir = process.cwd(),
  env = process.env,
} = {}) {
  if (resolveToken !== undefined && typeof resolveToken !== "function") {
    throw new TypeError("resolveToken must be a function when provided.");
  }
  if (typeof dispatch !== "function") {
    throw new TypeError("dispatch must be a function.");
  }
  const docsResolver = resolveToken || ((request) => (
    runAgenticCanvasOsDocsInvokeTool(request, { rootDir, env })
  ));

  const run = async (args) => {
    try {
      const request = validateRunRequest(args);
      const route = routeForInvocation(request.parsed);
      const tokens = [
        request.parsed.command,
        ...route.semantics,
        ...route.bindings,
      ];
      const initialEvidence = await resolveInvocationEvidence({
        tokens,
        command: request.parsed.command,
        route,
        sourceRevision: request.sourceRevision,
        resolveToken: docsResolver,
      });
      const tuple = Object.freeze({
        command: request.parsed.command,
        semantics: Object.freeze([...route.semantics]),
        bindings: Object.freeze([...route.bindings]),
        toolName: route.toolName,
      });
      const tupleDigest = digestValue({
        sourceRevision: request.sourceRevision,
        ...tuple,
        rowDigest: initialEvidence.rowDigest,
      });
      const invocationReceipt = Object.freeze({
        schema: INVOCATION_RECEIPT_SCHEMA,
        sourceRevision: request.sourceRevision,
        tuple,
        tupleDigest,
        rowDigest: initialEvidence.rowDigest,
        payloadDigest: request.payloadDigest,
        resolutionDigest: initialEvidence.resolutionDigest,
        deploymentAttempted: false,
      });

      if (route.mutates === true) {
        const currentEvidence = await resolveInvocationEvidence({
          tokens,
          command: request.parsed.command,
          route,
          sourceRevision: request.sourceRevision,
          resolveToken: docsResolver,
        });
        if (
          currentEvidence.rowDigest !== initialEvidence.rowDigest
          || currentEvidence.resolutionDigest !== initialEvidence.resolutionDigest
        ) {
          fail("invocation_source_drift", "Canonical invocation metadata changed before mutation dispatch.", {
            command: request.parsed.command,
          });
        }
      }

      const result = await dispatch(
        route.toolName,
        request.operationArguments,
        { invocationReceipt },
      );
      const dispatchedOk = result?.ok !== false;
      return {
        ok: dispatchedOk,
        contractVersion: PERSISTENT_MEMORY_CONTRACT_VERSION,
        operation: "invoke",
        schema: INVOCATION_RESULT_SCHEMA,
        command: request.parsed.command,
        toolName: route.toolName,
        sourceRevision: request.sourceRevision,
        invocation: [
          request.parsed.command,
          ...route.semantics,
          ...route.bindings,
        ].join(" "),
        tuple,
        digests: {
          tuple: tupleDigest,
          row: initialEvidence.rowDigest,
          payload: request.payloadDigest,
        },
        receipt: invocationReceipt,
        result,
        ...(!dispatchedOk && result?.error ? { error: result.error } : {}),
        economics: { ...ECONOMICS },
        deploymentAttempted: false,
      };
    } catch (error) {
      return errorPayload(error);
    }
  };

  return Object.freeze({ run });
}
