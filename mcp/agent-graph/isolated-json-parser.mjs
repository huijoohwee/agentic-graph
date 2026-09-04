import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  AgentGraphError,
  remainingAgentGraphDuration,
  throwIfAborted,
} from "./contract.mjs";

const JSON_HELPER_PATH = fileURLToPath(new URL("./json-parser-worker.mjs", import.meta.url));
const JSON_ISOLATION_THRESHOLD_BYTES = 512 * 1024;
const JSON_ISOLATION_VALUE_THRESHOLD = 90_000;
const JSON_ISOLATION_SYNTAX_THRESHOLD = 90_000;
const JSON_ISOLATION_DEPTH_THRESHOLD = 4_096;
const JSON_WORKER_HEAP_MIB = 768;
const MAX_ISOLATED_JSON_HEADER_BYTES = 1024 * 1024;
const MAX_ISOLATED_JSON_OUTPUT_BYTES = 256 * 1024 * 1024;

const jsonWorkerEnvironment = (host = {}) => Object.fromEntries([
  ["PATH", host.PATH || host.Path],
  ["SystemRoot", host.SystemRoot || host.SYSTEMROOT],
  ["ComSpec", host.ComSpec || host.COMSPEC],
  ["PATHEXT", host.PATHEXT],
  ["TMPDIR", host.TMPDIR],
  ["TMP", host.TMP],
  ["TEMP", host.TEMP],
  ["LANG", "C"],
  ["LC_ALL", "C"],
].filter(([, value]) => typeof value === "string"));

function denseJsonValueCountExceedsThreshold(source, options) {
  const text = String(source?.text || "");
  const containers = [];
  let escaped = false;
  let inString = false;
  let inScalar = false;
  let syntaxUnits = 0;
  let values = 0;
  const countSyntaxUnit = () => {
    syntaxUnits += 1;
    return syntaxUnits > JSON_ISOLATION_SYNTAX_THRESHOLD;
  };
  for (let index = 0; index < text.length; index += 1) {
    if (index % 4_096 === 0) options.checkpoint?.("json.isolation-preflight");
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    const whitespace = char === " " || char === "\t" || char === "\r" || char === "\n";
    const parent = containers.at(-1);
    if (parent?.type === "array" && parent.expectValue
      && !whitespace && char !== "]") {
      parent.expectValue = false;
      values += 1;
      if (values > JSON_ISOLATION_VALUE_THRESHOLD) return true;
    }
    if (char === '"') {
      if (countSyntaxUnit()) return true;
      inString = true;
      inScalar = false;
    } else if (char === "[") {
      if (countSyntaxUnit()) return true;
      containers.push({ expectValue: true, type: "array" });
      if (containers.length > JSON_ISOLATION_DEPTH_THRESHOLD) return true;
      inScalar = false;
    } else if (char === "{") {
      if (countSyntaxUnit()) return true;
      containers.push({ type: "object" });
      if (containers.length > JSON_ISOLATION_DEPTH_THRESHOLD) return true;
      inScalar = false;
    } else if (char === ":") {
      if (countSyntaxUnit()) return true;
      values += 1;
      if (values > JSON_ISOLATION_VALUE_THRESHOLD) return true;
      inScalar = false;
    } else if (char === ",") {
      if (countSyntaxUnit()) return true;
      const container = containers.at(-1);
      if (container?.type === "array") container.expectValue = true;
      inScalar = false;
    } else if (char === "]" || char === "}") {
      if (countSyntaxUnit()) return true;
      containers.pop();
      inScalar = false;
    } else if (whitespace) {
      inScalar = false;
    } else if (!inScalar) {
      if (countSyntaxUnit()) return true;
      inScalar = true;
    }
  }
  return false;
}

export const shouldIsolateJsonSource = (source, options = {}) => (
  Buffer.byteLength(String(source?.text || ""), "utf8") > JSON_ISOLATION_THRESHOLD_BYTES
  || denseJsonValueCountExceedsThreshold(source, options)
);

const boundedProcessCode = (value, fallback) => {
  const candidate = String(value || "").trim();
  return /^[A-Za-z][A-Za-z0-9._-]{0,63}$/u.test(candidate)
    ? candidate
    : fallback;
};

const isolatedJsonProcessError = ({
  code = "parser_failed",
  message,
  source,
  stage,
  causeCategory,
  causeCode,
  details = {},
}) => new AgentGraphError(code, message, {
  complete: false,
  sourcePath: source.relativePath,
  stage,
  causeCategory,
  causeCode: boundedProcessCode(causeCode, "unknown"),
  ...details,
});

const JSON_WORKER_ERROR_CODES = new Set([
  "parser_operation_limit_exceeded",
  "parser_record_limit_exceeded",
]);
const JSON_WORKER_STAGES = new Set([
  "json.compact-item-edges",
  "json.compact-item-nodes",
  "json.compact-property-edges",
  "json.compact-property-nodes",
  "json.compact-range-edges",
  "json.compact-range-nodes",
  "json.compaction-search-index",
  "json.diagnostics",
  "json.item-edges",
  "json.item-nodes",
  "json.property-edges",
  "json.property-nodes",
  "json.search-index-edges",
  "json.search-index-nodes",
  "json.source",
]);
const JSON_WORKER_NUMERIC_DETAIL_KEYS = [
  "attemptedOperations",
  "attemptedRecords",
  "diagnostics",
  "edges",
  "maxEdges",
  "maxNodes",
  "maxOperations",
  "maxRecords",
  "maxTokenCharacters",
  "nodes",
  "records",
  "retainedRecords",
  "tokenCharacters",
];

const isolatedJsonWorkerError = (source, value) => {
  const raw = value && typeof value === "object" ? value : {};
  const code = JSON_WORKER_ERROR_CODES.has(raw.code)
    ? raw.code
    : "parser_failed";
  const rawDetails = raw.details && typeof raw.details === "object"
    ? raw.details
    : {};
  const details = {};
  for (const key of JSON_WORKER_NUMERIC_DETAIL_KEYS) {
    const numeric = Number(rawDetails[key]);
    if (Number.isSafeInteger(numeric) && numeric >= 0) details[key] = numeric;
  }
  const workerStage = String(rawDetails.stage || "");
  const stage = JSON_WORKER_STAGES.has(workerStage)
    ? workerStage
    : "json.ast-isolated-worker";
  return isolatedJsonProcessError({
    code,
    message: code === "parser_record_limit_exceeded"
      ? `Isolated JSON parser exceeded a record bound for ${source.relativePath}.`
      : code === "parser_operation_limit_exceeded"
        ? `Isolated JSON parser exceeded its traversal bound for ${source.relativePath}.`
        : `Isolated JSON parser failed for ${source.relativePath}.`,
    source,
    stage,
    causeCategory: "worker-response",
    causeCode: JSON_WORKER_ERROR_CODES.has(raw.code) ? raw.code : "unknown",
    details,
  });
};

export function runIsolatedJsonParser(source, options, dependencies = {}) {
  return new Promise((resolve, reject) => {
    throwIfAborted(options.abortSignal);
    let child;
    try {
      child = (dependencies.spawn || spawn)(process.execPath, [
        `--max-old-space-size=${JSON_WORKER_HEAP_MIB}`,
        JSON_HELPER_PATH,
      ], {
        env: jsonWorkerEnvironment(process.env),
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      reject(isolatedJsonProcessError({
        message: `Isolated JSON parser could not be started for ${source.relativePath}.`,
        source,
        stage: "json.ast-isolated-spawn",
        causeCategory: "spawn",
        causeCode: error?.code,
      }));
      return;
    }
    const stdout = [];
    let stdoutBytes = 0;
    let stderrObserved = false;
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.abortSignal?.removeEventListener("abort", onAbort);
      if (error) reject(error); else resolve(value);
    };
    const onAbort = () => {
      child.kill("SIGKILL");
      finish(new AgentGraphError(
        "aborted",
        `JSON AST extraction was aborted for ${source.relativePath}.`,
        { complete: false, sourcePath: source.relativePath },
      ));
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new AgentGraphError(
        "max_duration_exceeded",
        `JSON AST extraction exceeded the operation deadline for ${source.relativePath}.`,
        { complete: false, sourcePath: source.relativePath, stage: "json.ast-isolated" },
      ));
    }, Math.max(1, remainingAgentGraphDuration(options.deadline)));
    options.abortSignal?.addEventListener("abort", onAbort, { once: true });
    child.on("error", (error) => finish(isolatedJsonProcessError({
      message: `Isolated JSON parser could not be started for ${source.relativePath}.`,
      source,
      stage: "json.ast-isolated-spawn",
      causeCategory: "spawn",
      causeCode: error?.code,
    })));
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_ISOLATED_JSON_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        finish(new AgentGraphError(
          "parser_record_limit_exceeded",
          `Isolated JSON parser output exceeded its byte bound for ${source.relativePath}.`,
          {
            complete: false,
            maxOutputBytes: MAX_ISOLATED_JSON_OUTPUT_BYTES,
            sourcePath: source.relativePath,
            stage: "json.ast-isolated-output",
          },
        ));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", () => { stderrObserved = true; });
    child.on("close", (code, signal) => {
      if (settled) return;
      if (code !== 0) {
        const exitedWithCode = Number.isInteger(code);
        finish(isolatedJsonProcessError({
          code: "parser_resource_limit_exceeded",
          message: `Isolated JSON parser terminated before producing a result for ${source.relativePath}.`,
          source,
          stage: "json.ast-isolated-exit",
          causeCategory: exitedWithCode ? "nonzero-exit" : "signal",
          causeCode: exitedWithCode ? `exit-${code}` : signal,
          details: {
            exitCode: exitedWithCode ? code : null,
            heapLimitMiB: JSON_WORKER_HEAP_MIB,
            signal: signal ? boundedProcessCode(signal, "unknown") : null,
            stderrObserved,
          },
        }));
        return;
      }
      try {
        const result = JSON.parse(Buffer.concat(stdout, stdoutBytes).toString("utf8"));
        if (result?.ok === true) finish(null, result.fragment);
        else finish(isolatedJsonWorkerError(source, result?.error));
      } catch {
        finish(new AgentGraphError(
          "parser_failed",
          `Isolated JSON parser returned invalid output for ${source.relativePath}.`,
          { complete: false, sourcePath: source.relativePath },
        ));
      }
    });
    const { text, ...sourceMetadata } = source;
    const header = Buffer.from(JSON.stringify({
      options: {
        maxParserEdges: options.maxEdges,
        maxParserNodes: options.maxNodes,
        maxParserOperations: options.maxOperations,
        maxParserRecords: options.maxRecords,
      },
      source: sourceMetadata,
    }));
    if (header.length > MAX_ISOLATED_JSON_HEADER_BYTES) {
      child.kill("SIGKILL");
      finish(new AgentGraphError(
        "parser_record_limit_exceeded",
        `Isolated JSON parser metadata exceeded its byte bound for ${source.relativePath}.`,
        {
          complete: false,
          maxHeaderBytes: MAX_ISOLATED_JSON_HEADER_BYTES,
          sourcePath: source.relativePath,
          stage: "json.ast-isolated-input",
        },
      ));
      return;
    }
    const prefix = Buffer.allocUnsafe(4);
    prefix.writeUInt32BE(header.length);
    child.stdin.on("error", (error) => {
      if (settled) return;
      child.kill("SIGKILL");
      finish(isolatedJsonProcessError({
        message: `Isolated JSON parser input channel failed for ${source.relativePath}.`,
        source,
        stage: "json.ast-isolated-input",
        causeCategory: "stdin",
        causeCode: error?.code,
      }));
    });
    try {
      child.stdin.write(prefix);
      child.stdin.write(header);
      child.stdin.end(String(text || ""), "utf8");
    } catch (error) {
      child.kill("SIGKILL");
      finish(isolatedJsonProcessError({
        message: `Isolated JSON parser input channel failed for ${source.relativePath}.`,
        source,
        stage: "json.ast-isolated-input",
        causeCategory: "stdin",
        causeCode: error?.code,
      }));
    }
  });
}
