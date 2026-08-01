import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import {
  buildEvidence,
  checkKnowledgeGraphBudget,
  KnowledgeGraphError,
  makeEdge,
  makeNode,
  sha256,
  stableEntityId,
  throwIfAborted,
  remainingKnowledgeGraphDuration,
  versionKnowledgeGraphParserOutput,
} from "./contract.mjs";
import {
  BRACE_CODE_PARSER_ID,
  BRACE_CODE_PARSER_VERSION,
  parseBraceCodeSource,
} from "./brace-code-parser.mjs";
import { compactJsonConfigSource } from "./json-config-compaction.mjs";
import { createDeclarativeGrammarSourceParser } from "./declarative-grammar-source.mjs";
import {
  runIsolatedJsonParser,
  shouldIsolateJsonSource,
} from "./isolated-json-parser.mjs";
import { createParserDispatch, parseSourceWithDispatch } from "./parser-dispatch.mjs";
import { createSourceOnlyFragment, resolveParserDescriptorForSource } from "./parser-routing.mjs";
import {
  pythonRuntimeGrammarValidationSource,
  recoverPythonRuntimeGrammar,
} from "./python-syntax-recovery.mjs";
import { parseSqlSource, SQL_PARSER_ID, SQL_PARSER_VERSION } from "./sql-parser.mjs";
import { SOURCE_PARSER_REGISTRY } from "./source-parser-registry.mjs";
import {
  parseTypeScriptSource,
  TYPESCRIPT_PARSER_ID,
  TYPESCRIPT_PARSER_VERSION,
} from "./typescript-parser.mjs";

const require = createRequire(import.meta.url);
let typescript = null;
try { typescript = require("typescript"); } catch { typescript = null; }

const PYTHON_HELPER_PATH = fileURLToPath(new URL("./python-ast-helper.py", import.meta.url));
export const PYTHON_PARSER_ID = "local-python-stdlib-ast";
export const PYTHON_PARSER_VERSION = versionKnowledgeGraphParserOutput("1.0.0+python-runtime-probed");
export const MARKDOWN_PARSER_ID = "local-markdown-structure";
export const MARKDOWN_PARSER_VERSION = versionKnowledgeGraphParserOutput("1.0.0");
export const JSON_CONFIG_PARSER_ID = "local-json-config-ast";
const JSON_TYPESCRIPT_VERSION = String(typescript?.version || "unavailable").replace(/[^A-Za-z0-9._-]+/g, "-");
export const JSON_CONFIG_PARSER_VERSION = versionKnowledgeGraphParserOutput(`1.3.0+typescript-${JSON_TYPESCRIPT_VERSION}`);
export const STRUCTURAL_CONFIG_PARSER_ID = "local-config-structure";
export const STRUCTURAL_CONFIG_PARSER_VERSION = versionKnowledgeGraphParserOutput("1.0.0");
export const SOURCE_INVENTORY_PARSER_ID = "local-source-inventory";
export const SOURCE_INVENTORY_PARSER_VERSION = versionKnowledgeGraphParserOutput("1.0.0");
export const PDF_PARSER_ID = "local-pdf-markdown-adapter";
export const PDF_PARSER_VERSION = versionKnowledgeGraphParserOutput("1.2.0");
export const DECLARATIVE_GRAMMAR_PARSER_ID = "local-declarative-grammar";
export const DECLARATIVE_GRAMMAR_PARSER_VERSION = versionKnowledgeGraphParserOutput("1.0.0");
const MAX_PARSER_NODES = 100_000;
const MAX_PARSER_EDGES = 200_000;
const MAX_PARSER_RECORDS = 250_000;

function normalizePythonVersionInfo(value) {
  if (!Array.isArray(value) || value.length !== 5) {
    throw new Error("Python AST helper returned invalid runtime version metadata.");
  }
  const [major, minor, micro, releaseLevelRaw, serial] = value;
  const releaseLevel = String(releaseLevelRaw || "");
  if (![major, minor, micro, serial].every((part) => (
    Number.isSafeInteger(part) && part >= 0
  )) || !releaseLevel || releaseLevel.length > 32 || !/^[A-Za-z0-9._-]+$/.test(releaseLevel)) {
    throw new Error("Python AST helper returned invalid runtime version metadata.");
  }
  return [major, minor, micro, releaseLevel, serial];
}

function pythonParserVersionForRuntime(versionInfo) {
  const runtimeVersion = normalizePythonVersionInfo(versionInfo)
    .map(String)
    .join("-")
    .replace(/[^A-Za-z0-9._-]+/g, "-");
  return `${PYTHON_PARSER_VERSION}.sys-${runtimeVersion}`;
}
const MAX_PARSER_OPERATIONS = 2_000_000;

const boundedParserLimit = (value, fallback, maximum) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
};

function boundedParserOptions(source, options) {
  const limits = {
    maxNodes: boundedParserLimit(options.maxParserNodes, MAX_PARSER_NODES, MAX_PARSER_NODES),
    maxEdges: boundedParserLimit(options.maxParserEdges, MAX_PARSER_EDGES, MAX_PARSER_EDGES),
    maxRecords: boundedParserLimit(options.maxParserRecords, MAX_PARSER_RECORDS, MAX_PARSER_RECORDS),
  };
  const maxOperations = boundedParserLimit(
    options.maxParserOperations,
    MAX_PARSER_OPERATIONS,
    MAX_PARSER_OPERATIONS,
  );
  let operations = 0;
  const retained = { nodes: 0, edges: 0, diagnostics: 0 };
  const retainedRecordCount = () => retained.nodes + retained.edges + retained.diagnostics;
  const retainRecord = (kind, stage = "parser-output") => {
    const key = kind === "node" ? "nodes" : kind === "edge" ? "edges" : "diagnostics";
    retained[key] += 1;
    const attemptedRecords = retainedRecordCount();
    if (retained.nodes > limits.maxNodes
      || retained.edges > limits.maxEdges
      || attemptedRecords > limits.maxRecords) {
      throw new KnowledgeGraphError("parser_record_limit_exceeded", `Parser output exceeded its graph limits for ${source.relativePath}.`, {
        sourcePath: source.relativePath,
        attemptedRecords,
        nodes: retained.nodes,
        edges: retained.edges,
        diagnostics: retained.diagnostics,
        stage,
        ...limits,
      });
    }
  };
  const checkpoint = (stage = "parser") => {
    operations += 1;
    if (operations > maxOperations) {
      throw new KnowledgeGraphError("parser_operation_limit_exceeded", `Parser traversal exceeded its operation limit for ${source.relativePath}.`, {
        sourcePath: source.relativePath,
        attemptedOperations: operations,
        maxOperations,
        retainedRecords: retainedRecordCount(),
        nodes: retained.nodes,
        edges: retained.edges,
        diagnostics: retained.diagnostics,
        ...limits,
      });
    }
    options.checkpoint?.(stage);
    if (operations % 128 === 0) {
      checkKnowledgeGraphBudget({
        abortSignal: options.abortSignal,
        deadline: options.deadline,
        stage,
        details: { sourcePath: source.relativePath, operations },
      });
    }
  };
  return {
    ...options,
    ...limits,
    maxOperations,
    limits,
    checkpoint,
    retainRecord,
  };
}

function assertParserFragmentBounds(source, fragment, options) {
  const nodes = fragment.nodes.length;
  const edges = fragment.edges.length;
  const diagnostics = Array.isArray(fragment.diagnostics) ? fragment.diagnostics.length : 0;
  const records = nodes + edges + diagnostics;
  if (nodes > options.maxNodes
    || edges > options.maxEdges
    || records > options.maxRecords) {
    throw new KnowledgeGraphError("parser_record_limit_exceeded", `Parser output exceeded its graph limits for ${source.relativePath}.`, {
      sourcePath: source.relativePath,
      attemptedRecords: records,
      records,
      nodes,
      edges,
      diagnostics,
      maxNodes: options.maxNodes,
      maxEdges: options.maxEdges,
      maxRecords: options.maxRecords,
    });
  }
  return fragment;
}

function sourceNodeFor(source, parserId, parserVersion, parserFidelity, extraProperties = {}) {
  return makeNode({
    id: stableEntityId("SourceFile", source.relativePath, "source"),
    label: source.relativePath,
    type: "SourceFile",
    sourcePath: source.relativePath,
    properties: {
      "corpus:contentHash": source.contentHash,
      "corpus:byteSize": source.byteSize,
      "corpus:parserId": parserId,
      "corpus:parserVersion": parserVersion,
      "corpus:parserFidelity": parserFidelity,
      "corpus:sourceStatus": source.status,
      ...(source.parserDescriptorId ? {
        "corpus:parserDescriptorId": source.parserDescriptorId,
      } : {}),
      ...(source.parserAdapter ? {
        "corpus:parserAdapter": source.parserAdapter,
      } : {}),
      ...(source.parserRegistryDigest ? {
        "corpus:parserRegistryDigest": source.parserRegistryDigest,
      } : {}),
      ...extraProperties,
    },
  });
}

const sourceOnlyFragment = createSourceOnlyFragment({ inventoryParserId: SOURCE_INVENTORY_PARSER_ID, sourceNodeFor });

export function parserLimitFragmentForSource(source, options = {}, limitError = null) {
  const descriptor = parserDescriptorForSource(source, options);
  const code = limitError?.code === "parser_operation_limit_exceeded"
    ? "parser_operation_limit_exceeded"
    : "parser_record_limit_exceeded";
  const message = code === "parser_operation_limit_exceeded"
    ? `Structural facts were omitted after the parser operation bound was reached for ${source.relativePath}.`
    : `Structural facts were omitted after the parser record bound was reached for ${source.relativePath}.`;
  return {
    ...sourceOnlyFragment(source, descriptor, [{
      code,
      sourcePath: source.relativePath,
      message,
    }]),
    nodes: [sourceNodeFor(source, descriptor.parserId, descriptor.parserVersion, descriptor.fidelity, {
      "corpus:sourceStatus": "limited",
    })],
    status: "limited",
  };
}

export function sourceArtifactLimitFragmentForSource(source, options = {}) {
  const descriptor = parserDescriptorForSource(source, options);
  return {
    ...sourceOnlyFragment(source, descriptor, [{
      code: "source_artifact_limit_exceeded",
      sourcePath: source.relativePath,
      message: `Structural facts were omitted after the source artifact bound was reached for ${source.relativePath}.`,
    }]),
    nodes: [sourceNodeFor(source, descriptor.parserId, descriptor.parserVersion, descriptor.fidelity, {
      "corpus:sourceStatus": "limited",
    })],
    status: "limited",
  };
}

const PARSER_IDENTITIES = Object.freeze({
  typescript: { parserId: TYPESCRIPT_PARSER_ID, parserVersion: TYPESCRIPT_PARSER_VERSION, fidelity: "ast" }, python: { parserId: PYTHON_PARSER_ID, parserVersion: PYTHON_PARSER_VERSION, fidelity: "ast" },
  sql: { parserId: SQL_PARSER_ID, parserVersion: SQL_PARSER_VERSION, fidelity: "structural-parser" }, markdown: { parserId: MARKDOWN_PARSER_ID, parserVersion: MARKDOWN_PARSER_VERSION, fidelity: "structural-parser" },
  "json-config": { parserId: JSON_CONFIG_PARSER_ID, parserVersion: JSON_CONFIG_PARSER_VERSION, fidelity: "ast" },
  "structural-config": { parserId: STRUCTURAL_CONFIG_PARSER_ID, parserVersion: STRUCTURAL_CONFIG_PARSER_VERSION, fidelity: "structural-parser" },
  "brace-code": { parserId: BRACE_CODE_PARSER_ID, parserVersion: BRACE_CODE_PARSER_VERSION, fidelity: "structural-parser" }, "declarative-grammar": { parserId: DECLARATIVE_GRAMMAR_PARSER_ID, parserVersion: DECLARATIVE_GRAMMAR_PARSER_VERSION, fidelity: "ast" },
  pdf: { parserId: PDF_PARSER_ID, parserVersion: PDF_PARSER_VERSION, fidelity: "pending" }, inventory: { parserId: SOURCE_INVENTORY_PARSER_ID, parserVersion: SOURCE_INVENTORY_PARSER_VERSION, fidelity: "inventory-only" },
});

export function parserDescriptorForSource(source, options = {}) {
  return resolveParserDescriptorForSource(source, options, PARSER_IDENTITIES);
}

function createRetainedGraph(options, sourceNode, stagePrefix) {
  const nodes = new Map();
  const edges = new Map();
  const addNode = (node, stage = `${stagePrefix}.nodes`) => {
    if (!nodes.has(node.id)) {
      options.retainRecord?.("node", stage);
      nodes.set(node.id, node);
    }
    return node.id;
  };
  const addEdge = (edge, stage = `${stagePrefix}.edges`) => {
    if (!edges.has(edge.id)) {
      options.retainRecord?.("edge", stage);
      edges.set(edge.id, edge);
    }
    return edge.id;
  };
  addNode(sourceNode, `${stagePrefix}.source`);
  return { nodes, edges, addNode, addEdge };
}

function retainDiagnostics(options, diagnostics, stage) {
  for (let index = 0; index < diagnostics.length; index += 1) {
    options.retainRecord?.("diagnostic", stage);
  }
  return diagnostics;
}

function runPythonAstFacts({ pythonBin, sourcePath, text, timeoutMs = 10_000, abortSignal }) {
  return new Promise((resolve, reject) => {
    throwIfAborted(abortSignal);
    const child = spawn(pythonBin, [PYTHON_HELPER_PATH], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      abortSignal?.removeEventListener("abort", onAbort);
      if (error) reject(error); else resolve(value);
    };
    const onAbort = () => {
      child.kill("SIGKILL");
      finish(new KnowledgeGraphError("aborted", "Python AST extraction was aborted."));
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`Python AST extraction exceeded ${timeoutMs}ms.`));
    }, timeoutMs);
    abortSignal?.addEventListener("abort", onAbort, { once: true });
    child.on("error", (error) => finish(error));
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 8 * 1024 * 1024) {
        child.kill("SIGKILL");
        finish(new Error("Python AST output exceeded 8 MiB."));
      }
    });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8").slice(0, 8192); });
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) return finish(new Error(`Python AST helper exited ${code}: ${stderr.trim()}`));
      try { finish(null, JSON.parse(stdout)); } catch { finish(new Error("Python AST helper returned invalid JSON.")); }
    });
    child.stdin.end(JSON.stringify({ sourcePath, text }));
  });
}

export async function probePythonParserRuntime(options = {}) {
  const facts = await runPythonAstFacts({
    pythonBin: options.pythonBin || "python3",
    sourcePath: "<python-runtime-probe>",
    text: "",
    timeoutMs: Math.max(1, Math.min(
      Number(options.pythonTimeoutMs) || 10_000,
      remainingKnowledgeGraphDuration(options.deadline),
    )),
    abortSignal: options.abortSignal,
  });
  const pythonVersionInfo = normalizePythonVersionInfo(facts?.pythonVersionInfo);
  return {
    pythonParserVersion: pythonParserVersionForRuntime(pythonVersionInfo),
    pythonVersionInfo,
  };
}

async function parseJsonConfigSourceWithIsolation(source, options) {
  if (options.isolatedJsonChild === true
    || !shouldIsolateJsonSource(source, options)) {
    return parseJsonConfigSource(source, options);
  }
  return runIsolatedJsonParser(source, options);
}

async function parsePythonSource(source, options) {
  const descriptor = parserDescriptorForSource(source, options);
  let facts;
  let versionInfo;
  let runtimeParserVersion;
  try {
    facts = await runPythonAstFacts({
      pythonBin: options.pythonBin || "python3",
      sourcePath: source.relativePath,
      text: source.text || "",
      timeoutMs: Math.max(1, Math.min(
        Number(options.pythonTimeoutMs) || 10_000,
        remainingKnowledgeGraphDuration(options.deadline),
      )),
      abortSignal: options.abortSignal,
    });
    versionInfo = normalizePythonVersionInfo(facts?.pythonVersionInfo);
    runtimeParserVersion = pythonParserVersionForRuntime(versionInfo);
    if (descriptor.parserVersion !== PYTHON_PARSER_VERSION
      && descriptor.parserVersion !== runtimeParserVersion) {
      throw new Error("Python runtime identity changed after parser cache resolution.");
    }
  } catch (error) {
    if (error instanceof KnowledgeGraphError && ["aborted", "max_duration_exceeded"].includes(error.code)) throw error;
    return {
      ...sourceOnlyFragment(source, descriptor),
      diagnostics: [{ code: "python_ast_unavailable", sourcePath: source.relativePath, message: error.message }],
      status: "error",
    };
  }
  const parsedDescriptor = { ...descriptor, parserVersion: runtimeParserVersion };
  const validationSource = pythonRuntimeGrammarValidationSource({
    source,
    diagnostics: facts.diagnostics,
    pythonVersionInfo: versionInfo,
  });
  let syntaxValidated = false;
  if (validationSource) {
    try {
      options.checkpoint?.("python.recovery.validation");
      const validationFacts = await runPythonAstFacts({
        pythonBin: options.pythonBin || "python3",
        sourcePath: source.relativePath,
        text: validationSource,
        timeoutMs: Math.max(1, Math.min(
          Number(options.pythonTimeoutMs) || 10_000,
          remainingKnowledgeGraphDuration(options.deadline),
        )),
        abortSignal: options.abortSignal,
      });
      syntaxValidated = (validationFacts.diagnostics || []).length === 0;
    } catch (error) {
      if (error instanceof KnowledgeGraphError && ["aborted", "max_duration_exceeded"].includes(error.code)) throw error;
    }
  }
  const recovered = recoverPythonRuntimeGrammar({
    source,
    descriptor: parsedDescriptor,
    diagnostics: facts.diagnostics,
    options,
    pythonVersionInfo: versionInfo,
    syntaxValidated,
    sourceOnlyFragment,
  });
  if (recovered) return recovered;
  const sourceNode = sourceNodeFor(source, parsedDescriptor.parserId, parsedDescriptor.parserVersion, parsedDescriptor.fidelity, {
    "code:pythonVersionInfo": versionInfo,
  });
  const { nodes, edges, addNode, addEdge } = createRetainedGraph(
    options,
    sourceNode,
    "python",
  );
  const declarationIdByName = new Map();
  const evidenceFor = (fact, ruleId, explanation, confidence = "high") => buildEvidence({
    sourcePath: source.relativePath,
    sourceDigest: source.contentHash,
    text: source.text,
    lineStart: fact.lineStart,
    lineEnd: fact.lineEnd,
    columnStart: fact.columnStart,
    columnEnd: fact.columnEnd,
    ruleId,
    explanation,
    parserId: parsedDescriptor.parserId,
    parserVersion: parsedDescriptor.parserVersion,
    confidence,
  });
  for (const fact of facts.declarations || []) {
    options.checkpoint("python.declarations");
    const type = fact.kind === "class" ? "CodeClass" : fact.kind === "method" ? "CodeMethod" : "CodeFunction";
    const id = stableEntityId(type, source.relativePath, `${fact.qualifiedName}:${fact.lineStart}:${fact.columnStart}`);
    declarationIdByName.set(fact.qualifiedName, id);
    addNode(makeNode({ id, label: fact.name, type, sourcePath: source.relativePath, properties: { "code:kind": fact.kind, "code:qualifiedName": fact.qualifiedName, "corpus:lineStart": fact.lineStart } }));
  }
  for (const fact of facts.declarations || []) {
    options.checkpoint("python.declaration-edges");
    const target = declarationIdByName.get(fact.qualifiedName);
    const parentName = fact.qualifiedName.split(".").slice(0, -1).join(".");
    const parent = declarationIdByName.get(parentName) || sourceNode.id;
    addEdge(makeEdge({ source: parent, target, label: parent === sourceNode.id ? "declares" : "containsDeclaration", evidence: evidenceFor(fact, "python.declaration.ast", `${parent === sourceNode.id ? source.relativePath : parentName} declares ${fact.kind} ${fact.qualifiedName}.`) }));
  }
  for (const fact of facts.imports || []) {
    options.checkpoint("python.imports");
    const id = stableEntityId("CodeDependency", source.relativePath, `${fact.module}:${fact.lineStart}:${fact.columnStart}`);
    addNode(makeNode({ id, label: fact.module, type: "CodeDependency", sourcePath: source.relativePath, properties: { "code:module": fact.module } }));
    addEdge(makeEdge({ source: sourceNode.id, target: id, label: "imports", evidence: evidenceFor(fact, "python.import.ast", `${source.relativePath} imports module ${fact.module}.`) }));
  }
  for (const fact of facts.calls || []) {
    options.checkpoint("python.calls");
    const owner = declarationIdByName.get(fact.owner) || sourceNode.id;
    const id = stableEntityId("CodeCallReference", source.relativePath, `${fact.target}:${fact.lineStart}:${fact.columnStart}`);
    addNode(makeNode({ id, label: fact.target, type: "CodeCallReference", sourcePath: source.relativePath, properties: { "code:referenceKind": "call" } }));
    addEdge(makeEdge({ source: owner, target: id, label: "calls", evidence: evidenceFor(fact, "python.call.ast", `${fact.owner || source.relativePath} calls ${fact.target}.`) }));
  }
  for (const fact of facts.inherits || []) {
    options.checkpoint("python.inheritance");
    const owner = declarationIdByName.get(fact.owner) || sourceNode.id;
    const id = stableEntityId("CodeReference", source.relativePath, `${fact.target}:${fact.lineStart}:${fact.columnStart}`);
    addNode(makeNode({ id, label: fact.target, type: "CodeReference", sourcePath: source.relativePath, properties: { "code:referenceKind": "extends" } }));
    addEdge(makeEdge({ source: owner, target: id, label: "extends", evidence: evidenceFor(fact, "python.extends.ast", `${fact.owner} extends ${fact.target}.`) }));
  }
  const diagnostics = (facts.diagnostics || []).map((diagnostic) => {
    options.retainRecord?.("diagnostic", "python.diagnostics");
    return {
      ...diagnostic,
      sourcePath: source.relativePath,
    };
  });
  return { parserId: parsedDescriptor.parserId, parserVersion: parsedDescriptor.parserVersion, nodes: [...nodes.values()], edges: [...edges.values()], diagnostics, status: diagnostics.length ? "partial" : "parsed" };
}

function parseMarkdownStructure(source, descriptor, markdownText, extraSourceProperties = {}, options = {}) {
  const adaptedSource = { ...source, text: markdownText };
  const sourceNode = sourceNodeFor(adaptedSource, descriptor.parserId, descriptor.parserVersion, descriptor.fidelity, extraSourceProperties);
  const { nodes, edges, addNode, addEdge } = createRetainedGraph(
    options,
    sourceNode,
    "markdown",
  );
  const headingStack = [];
  const occurrenceByKey = new Map();
  const lines = String(markdownText || "").split("\n");
  let fenceMarker = "";
  const evidenceFor = (line, lineNumber, columnStart, columnEnd, ruleId, explanation) => buildEvidence({ sourcePath: source.relativePath, sourceDigest: source.contentHash, text: line, lineStart: lineNumber, lineEnd: lineNumber, columnStart, columnEnd, excerpt: line, ruleId, explanation, parserId: descriptor.parserId, parserVersion: descriptor.parserVersion });
  for (let index = 0; index < lines.length; index += 1) {
    options.checkpoint?.("markdown.lines");
    const line = lines[index];
    const lineNumber = index + 1;
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (!fenceMarker) fenceMarker = fence[1][0];
      else if (fenceMarker === fence[1][0]) fenceMarker = "";
      continue;
    }
    if (fenceMarker) continue;
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const label = heading[2].replace(/\s+#+\s*$/, "").trim();
      while (headingStack.length && headingStack.at(-1).level >= level) headingStack.pop();
      const parent = headingStack.at(-1)?.id || sourceNode.id;
      const parentKey = headingStack.map((entry) => entry.label.toLowerCase()).join("/");
      const occurrenceKey = `${parentKey}/${label.toLowerCase()}`;
      const occurrence = (occurrenceByKey.get(occurrenceKey) || 0) + 1;
      occurrenceByKey.set(occurrenceKey, occurrence);
      const id = stableEntityId("DocumentSection", source.relativePath, `${occurrenceKey}:${occurrence}`);
      const pageMatch = /^page\s+(\d+)\b/i.exec(label);
      addNode(makeNode({ id, label, type: "DocumentSection", sourcePath: source.relativePath, properties: { "doc:headingLevel": level, "doc:headingPath": [...headingStack.map((entry) => entry.label), label].join(" / "), "corpus:lineStart": lineNumber, ...(pageMatch ? { "pdf:page": Number(pageMatch[1]) } : {}) } }), "markdown.heading-nodes");
      const edge = makeEdge({ source: parent, target: id, label: "containsSection", evidence: evidenceFor(line, lineNumber, 1, line.length + 1, "markdown.heading.structure", `${parent === sourceNode.id ? source.relativePath : "The parent section"} contains heading ${label}.`) });
      addEdge(edge, "markdown.heading-edges");
      headingStack.push({ id, level, label, ...(pageMatch ? { page: Number(pageMatch[1]) } : {}) });
    }
    const linkPattern = /(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
    let match;
    while ((match = linkPattern.exec(line))) {
      options.checkpoint?.("markdown.links");
      const label = match[1].trim();
      const target = match[2].trim();
      const id = stableEntityId("DocumentLinkReference", source.relativePath, `${target}:${lineNumber}:${match.index + 1}`);
      addNode(makeNode({ id, label: label || target, type: "DocumentLinkReference", sourcePath: source.relativePath, properties: { "doc:target": target, "corpus:lineStart": lineNumber } }), "markdown.link-nodes");
      const owner = headingStack.at(-1)?.id || sourceNode.id;
      const edge = makeEdge({ source: owner, target: id, label: "linksTo", evidence: evidenceFor(line, lineNumber, match.index + 1, match.index + match[0].length + 1, "markdown.link.structure", `${owner === sourceNode.id ? source.relativePath : "The current section"} links to ${target}.`) });
      addEdge(edge, "markdown.link-edges");
    }
    if (!heading && line.trim()) {
      const leading = line.search(/\S/);
      const content = line.trim();
      for (let offset = 0, chunkIndex = 0; offset < content.length; offset += 280, chunkIndex += 1) {
        options.checkpoint?.("markdown.text");
        const chunk = content.slice(offset, offset + 280);
        const owner = headingStack.at(-1)?.id || sourceNode.id;
        const id = stableEntityId("DocumentText", source.relativePath, `${lineNumber}:${chunkIndex}:${sha256(chunk)}`);
        const page = [...headingStack].reverse().find((entry) => Number.isInteger(entry.page))?.page;
        addNode(makeNode({
          id,
          label: chunk,
          type: "DocumentText",
          sourcePath: source.relativePath,
          properties: {
            "doc:text": chunk,
            "doc:chunkIndex": chunkIndex,
            "corpus:lineStart": lineNumber,
            ...(Number.isInteger(page) ? { "pdf:page": page } : {}),
          },
        }), "markdown.text-nodes");
        const edge = makeEdge({
          source: owner,
          target: id,
          label: "containsText",
          evidence: evidenceFor(chunk, lineNumber, leading + offset + 1, leading + offset + chunk.length + 1, "markdown.text.structure", `${owner === sourceNode.id ? source.relativePath : "The current section"} contains this locally extracted text unit.`),
          anchor: `${lineNumber}:${chunkIndex}`,
        });
        addEdge(edge, "markdown.text-edges");
      }
    }
  }
  const diagnostics = retainDiagnostics(
    options,
    nodes.size > 1 ? [] : [{
      code: "markdown_structure_not_found",
      sourcePath: source.relativePath,
      message: `No headings, links, or bounded text units were found in ${source.relativePath}.`,
    }],
    "markdown.diagnostics",
  );
  return { parserId: descriptor.parserId, parserVersion: descriptor.parserVersion, nodes: [...nodes.values()], edges: [...edges.values()], diagnostics, status: "parsed" };
}

function parseJsonConfigSource(source, options) {
  const descriptor = parserDescriptorForSource(source, options);
  const sourceNode = sourceNodeFor(source, descriptor.parserId, descriptor.parserVersion, descriptor.fidelity);
  if (!typescript) return { ...sourceOnlyFragment(source, descriptor), diagnostics: [{ code: "typescript_unavailable", sourcePath: source.relativePath, message: "Local TypeScript JSON parser is unavailable." }], status: "error" };
  const ts = typescript;
  const sourceFile = ts.parseJsonText(source.relativePath, source.text || "");
  const rootExpression = sourceFile.statements?.[0]?.expression;
  const compacted = compactJsonConfigSource({
    descriptor,
    options,
    rootExpression,
    source,
    sourceFile,
    sourceNode,
    typescript: ts,
  });
  if (compacted) return compacted;
  const { nodes, edges, addNode, addEdge } = createRetainedGraph(
    options,
    sourceNode,
    "json",
  );
  const sensitiveKey = /(?:secret|token|password|credential|private.?key|api.?key)/i;
  const evidenceFor = (node, explanation, excerpt) => {
    const startOffset = node.getStart(sourceFile);
    const endOffset = node.getEnd();
    const start = sourceFile.getLineAndCharacterOfPosition(startOffset);
    const end = sourceFile.getLineAndCharacterOfPosition(endOffset);
    return buildEvidence({
      sourcePath: source.relativePath,
      sourceDigest: source.contentHash,
      text: source.text,
      lineStart: start.line + 1,
      lineEnd: end.line + 1,
      columnStart: start.character + 1,
      columnEnd: end.character + 1,
      excerpt,
      ruleId: "json.config-key.ast",
      explanation,
      parserId: descriptor.parserId,
      parserVersion: descriptor.parserVersion,
    });
  };
  const scalarType = (node) => {
    if (ts.isStringLiteral(node)) return "string";
    if (ts.isNumericLiteral(node)) return "number";
    if ([ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(node.kind)) return "boolean";
    if (node.kind === ts.SyntaxKind.NullKeyword) return "null";
    return "";
  };
  function visitValue(node, parentId, pathParts, sensitiveAncestor = false) {
    options.checkpoint("json.ast");
    if (!node) return;
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        options.checkpoint("json.properties");
        if (!ts.isPropertyAssignment(property)) continue;
        const key = property.name?.text ?? property.name?.getText(sourceFile) ?? "key";
        const nextPath = [...pathParts, String(key)];
        const redacted = sensitiveAncestor || sensitiveKey.test(String(key)) || sensitiveKey.test(nextPath.join("."));
        const id = stableEntityId("ConfigKey", source.relativePath, nextPath.join("."));
        const valueType = scalarType(property.initializer);
        const properties = { "config:key": String(key), "config:keyPath": nextPath.join("."), "corpus:lineStart": sourceFile.getLineAndCharacterOfPosition(property.getStart(sourceFile)).line + 1 };
        if (redacted) properties["config:redacted"] = true;
        if (valueType) properties["config:valueType"] = valueType;
        addNode(makeNode({ id, label: nextPath.join("."), type: "ConfigKey", sourcePath: source.relativePath, properties }), "json.property-nodes");
        const observedKeyExcerpt = redacted
          ? `${String(key)}=<redacted>`
          : `${property.name?.getText(sourceFile).slice(0, 160) || String(key)}: <omitted>`;
        const edge = makeEdge({ source: parentId, target: id, label: "hasConfigKey", evidence: evidenceFor(property, `${parentId === sourceNode.id ? source.relativePath : pathParts.join(".")} contains configuration key ${nextPath.join(".")}.`, observedKeyExcerpt) });
        addEdge(edge, "json.property-edges");
        visitValue(property.initializer, id, nextPath, redacted);
      }
    } else if (ts.isArrayLiteralExpression(node)) {
      node.elements.forEach((element, index) => {
        options.checkpoint("json.items");
        const nextPath = [...pathParts, `[${index}]`];
        const id = stableEntityId("ConfigItem", source.relativePath, nextPath.join("."));
        addNode(makeNode({ id, label: nextPath.join("."), type: "ConfigItem", sourcePath: source.relativePath, properties: { "config:index": index, "config:keyPath": nextPath.join(".") } }), "json.item-nodes");
        const edge = makeEdge({ source: parentId, target: id, label: "hasConfigItem", evidence: evidenceFor(element, `${pathParts.join(".") || source.relativePath} contains array item ${index}.`, `[${index}]`) });
        addEdge(edge, "json.item-edges");
        visitValue(element, id, nextPath, sensitiveAncestor);
      });
    }
  }
  visitValue(rootExpression, sourceNode.id, []);
  const diagnostics = (sourceFile.parseDiagnostics || []).map((diagnostic) => {
    options.retainRecord?.("diagnostic", "json.diagnostics");
    const start = Number.isFinite(diagnostic.start) ? diagnostic.start : 0;
    const position = sourceFile.getLineAndCharacterOfPosition(start);
    return { code: "json_syntax_error", sourcePath: source.relativePath, lineStart: position.line + 1, columnStart: position.character + 1, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " ") };
  });
  return { parserId: descriptor.parserId, parserVersion: descriptor.parserVersion, nodes: [...nodes.values()], edges: [...edges.values()], diagnostics, status: diagnostics.length ? "partial" : "parsed" };
}

function parseStructuralConfigSource(source, options) {
  const descriptor = parserDescriptorForSource(source, options);
  const sourceNode = sourceNodeFor(source, descriptor.parserId, descriptor.parserVersion, descriptor.fidelity);
  const { nodes, edges, addNode, addEdge } = createRetainedGraph(
    options,
    sourceNode,
    "config",
  );
  const stack = [];
  const occurrences = new Map();
  const sensitiveKey = /(?:secret|token|password|credential|private.?key|api.?key)/i;
  const lines = String(source.text || "").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    options.checkpoint("config.lines");
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;
    const indent = line.length - line.trimStart().length;
    const section = /^\[+([^\]]+)\]+$/.exec(trimmed);
    const block = /^(resource|module|provider|variable|output|data|service)\s+"?([^"\s{]+)"?(?:\s+"([^"]+)")?\s*\{/.exec(trimmed);
    const assignment = /^([A-Za-z_][A-Za-z0-9_.-]*)\s*[:=]/.exec(trimmed);
    const docker = /^(FROM|RUN|CMD|ENTRYPOINT|COPY|ADD|ENV|ARG|WORKDIR|EXPOSE|USER|VOLUME)\b/i.exec(trimmed);
    const key = section?.[1] || (block ? [block[1], block[2], block[3]].filter(Boolean).join(".") : assignment?.[1] || docker?.[1]?.toLowerCase());
    if (!key) continue;
    while (stack.length && stack.at(-1).indent >= indent && !(stack.at(-1).section && !section)) stack.pop();
    const parent = section ? sourceNode.id : stack.at(-1)?.id || sourceNode.id;
    const parentPath = parent === sourceNode.id ? "" : stack.at(-1)?.keyPath || "";
    const keyPath = parentPath ? `${parentPath}.${key}` : key;
    const occurrence = (occurrences.get(keyPath) || 0) + 1;
    occurrences.set(keyPath, occurrence);
    const id = stableEntityId("ConfigKey", source.relativePath, `${keyPath}:${occurrence}`);
    const redacted = sensitiveKey.test(keyPath) || sensitiveKey.test(key);
    addNode(makeNode({ id, label: keyPath, type: block ? "ConfigBlock" : section ? "ConfigSection" : docker ? "ConfigInstruction" : "ConfigKey", sourcePath: source.relativePath, properties: { "config:key": key, "config:keyPath": keyPath, "corpus:lineStart": index + 1, ...(redacted ? { "config:redacted": true } : {}) } }), "config.entry-nodes");
    const evidenceExcerpt = section
      ? `[${key}]`
      : block
        ? `${block[1]} ${[block[2], block[3]].filter(Boolean).join(" ")} {`
        : redacted
          ? `${key}=<redacted>`
          : `${key}=<omitted>`;
    const evidence = buildEvidence({ sourcePath: source.relativePath, sourceDigest: source.contentHash, text: line, lineStart: index + 1, lineEnd: index + 1, columnStart: indent + 1, columnEnd: line.length + 1, excerpt: evidenceExcerpt, ruleId: "config.entry.structure", explanation: `${parent === sourceNode.id ? source.relativePath : parentPath} contains configuration entry ${keyPath}.`, parserId: descriptor.parserId, parserVersion: descriptor.parserVersion, confidence: "medium" });
    const edge = makeEdge({ source: parent, target: id, label: block ? "declaresConfigBlock" : "hasConfigKey", evidence });
    addEdge(edge, "config.entry-edges");
    if (section || block || /:\s*(?:#.*)?$/.test(trimmed)) stack.push({ id, indent, keyPath, section: Boolean(section) });
  }
  const diagnostics = retainDiagnostics(
    options,
    nodes.size > 1 ? [] : [{
      code: "config_structure_not_found",
      sourcePath: source.relativePath,
      message: `No structural configuration entries were found in ${source.relativePath}.`,
    }],
    "config.diagnostics",
  );
  return { parserId: descriptor.parserId, parserVersion: descriptor.parserVersion, nodes: [...nodes.values()], edges: [...edges.values()], diagnostics, status: "parsed" };
}

async function parsePdfSource(source, options) {
  const descriptor = parserDescriptorForSource(source, options);
  if (typeof options.pdfConverter !== "function") {
    return { ...sourceOnlyFragment(source, descriptor), diagnostics: [{ code: "pdf_converter_pending", sourcePath: source.relativePath, message: `PDF ${source.relativePath} is inventoried; a local native converter must be injected for extraction.` }], status: "pending" };
  }
  try {
    throwIfAborted(options.abortSignal);
    checkKnowledgeGraphBudget({ ...options, stage: "pdf-conversion" });
    const converted = await options.pdfConverter({ sourcePath: source.relativePath, absolutePath: source.absolutePath, bytes: source.bytes, contentHash: source.contentHash, abortSignal: options.abortSignal });
    checkKnowledgeGraphBudget({ ...options, stage: "pdf-conversion" });
    const markdown = typeof converted === "string" ? converted : String(converted?.markdown || "");
    if (!markdown.trim()) throw new Error("PDF converter returned no Markdown.");
    if (Buffer.byteLength(markdown, "utf8") > 16 * 1024 * 1024) {
      throw new KnowledgeGraphError("parser_record_limit_exceeded", `PDF conversion output is too large for ${source.relativePath}.`, {
        sourcePath: source.relativePath,
        maxConvertedBytes: 16 * 1024 * 1024,
      });
    }
    const lines = markdown.split(/\r?\n/);
    if (lines.length > options.maxRecords) {
      throw new KnowledgeGraphError("parser_record_limit_exceeded", `PDF conversion produced too many records for ${source.relativePath}.`, {
        sourcePath: source.relativePath,
        records: lines.length,
        maxRecords: options.maxRecords,
      });
    }
    const extraction = converted && typeof converted === "object"
      && converted.extraction && typeof converted.extraction === "object"
      ? converted.extraction
      : null;
    const { pageCount, textLineCount } = extraction
      ? {
          pageCount: Number(extraction.pageCount),
          textLineCount: Number(extraction.textLineCount),
        }
      : {
          pageCount: lines.filter((line) => /^## Page [1-9][0-9]*\s*$/.test(line.trim())).length,
          textLineCount: lines.slice(1).filter((line) => {
            options.checkpoint("pdf.converted-lines");
            const trimmed = line.trim();
            return trimmed && !/^## Page [1-9][0-9]*\s*$/.test(trimmed);
          }).length,
        };
    if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
      throw new Error("PDF conversion found no readable pages.");
    }
    const blankPageCount = Number(extraction?.blankPageCount || 0);
    const nonTextPageCount = Number(extraction?.nonTextPageCount || 0);
    const parseDeclaredPages = (value, expectedCount) => {
      if (!Array.isArray(value) || value.length !== expectedCount) return null;
      const pages = value.map(Number);
      if (pages.some((page, index) => (
        !Number.isSafeInteger(page)
        || page < 1
        || page > pageCount
        || (index > 0 && page <= pages[index - 1])
      ))) return null;
      return pages;
    };
    const blankPages = extraction
      ? parseDeclaredPages(extraction.blankPages, blankPageCount)
      : [];
    const nonTextPages = extraction
      ? parseDeclaredPages(extraction.nonTextPages, nonTextPageCount)
      : [];
    const nonTextPageSet = nonTextPages ? new Set(nonTextPages) : null;
    const contentClass = String(extraction?.contentClass || (textLineCount ? "text" : "unknown"));
    if (extraction) {
      if (!Number.isSafeInteger(textLineCount)
        || textLineCount < 0
        || !Number.isSafeInteger(blankPageCount)
        || blankPageCount < 0
        || blankPageCount > pageCount
        || !Number.isSafeInteger(nonTextPageCount)
        || nonTextPageCount < 0
        || blankPageCount + nonTextPageCount > pageCount
        || !blankPages
        || !nonTextPages
        || blankPages.some((page) => nonTextPageSet.has(page))
        || ![
          "blank",
          "text",
          "text-with-blank-pages",
          "text-with-nontext-pages",
          "text-with-blank-and-nontext-pages",
        ].includes(contentClass)
        || (
          contentClass === "blank"
          && (textLineCount !== 0 || blankPageCount !== pageCount || nonTextPageCount !== 0)
        )
        || (
          contentClass === "text"
          && (textLineCount === 0 || blankPageCount !== 0 || nonTextPageCount !== 0)
        )
        || (
          contentClass === "text-with-blank-pages"
          && (
            textLineCount === 0
            || blankPageCount < 1
            || blankPageCount >= pageCount
            || nonTextPageCount !== 0
          )
        )
        || (
          contentClass === "text-with-nontext-pages"
          && (
            textLineCount === 0
            || blankPageCount !== 0
            || nonTextPageCount < 1
            || nonTextPageCount >= pageCount
          )
        )
        || (
          contentClass === "text-with-blank-and-nontext-pages"
          && (
            textLineCount === 0
            || blankPageCount < 1
            || nonTextPageCount < 1
            || blankPageCount + nonTextPageCount >= pageCount
          )
        )) {
        throw new Error("PDF converter returned inconsistent extraction metadata.");
      }
    }
    const blankDocument = contentClass === "blank"
      && Number.isSafeInteger(blankPageCount)
      && blankPageCount === pageCount
      && Number(extraction?.pageCount) === pageCount
      && Number(extraction?.textLineCount) === 0;
    if (!textLineCount && !blankDocument) {
      throw new Error("PDF conversion found no extractable text; image-only, encrypted, or unsupported visual content requires an explicit local OCR lane.");
    }
    const fragment = parseMarkdownStructure(source, descriptor, markdown, {
      "pdf:conversionHash": sha256(markdown),
      "pdf:converterVersion": String(options.pdfConverterVersion || "injected"),
      "pdf:pageCount": pageCount,
      "pdf:textLineCount": textLineCount,
      "pdf:blankPageCount": extraction ? blankPageCount : 0,
      "pdf:nonTextPageCount": extraction ? nonTextPageCount : 0,
      "pdf:contentClass": blankDocument ? "blank" : contentClass,
    }, options);
    const blankPageSet = new Set(blankPages || []);
    const classifiedNonTextPageSet = new Set(nonTextPages || []);
    const classifiedNodes = fragment.nodes.map((node) => {
      const pageNumber = Number(node.properties?.["pdf:page"]);
      if (node.type !== "DocumentSection" || !Number.isSafeInteger(pageNumber)) return node;
      const pageContentClass = blankPageSet.has(pageNumber)
        ? "blank"
        : classifiedNonTextPageSet.has(pageNumber) ? "nontext" : "text";
      return {
        ...node,
        properties: {
          ...node.properties,
          "pdf:pageContentClass": pageContentClass,
        },
      };
    });
    const converterDiagnostics = converted
      && typeof converted === "object"
      && Array.isArray(converted.diagnostics)
      ? converted.diagnostics
      : [];
    retainDiagnostics(options, converterDiagnostics, "pdf.converter-diagnostics");
    return {
      ...fragment,
      nodes: classifiedNodes,
      diagnostics: [...fragment.diagnostics, ...converterDiagnostics],
    };
  } catch (error) {
    if (error instanceof KnowledgeGraphError && [
      "aborted",
      "max_duration_exceeded",
      "parser_operation_limit_exceeded",
      "parser_record_limit_exceeded",
    ].includes(error.code)) throw error;
    return { ...sourceOnlyFragment(source, descriptor), diagnostics: [{ code: "pdf_conversion_failed", sourcePath: source.relativePath, message: error.message }], status: "error" };
  }
}

const parseDeclarativeGrammarSource = createDeclarativeGrammarSourceParser({
  parserDescriptorForSource,
  sourceNodeFor,
  sourceOnlyFragment,
});

const NATIVE_PARSER_ADAPTERS = Object.freeze({
  typescript: (source, options) => parseTypeScriptSource({ sourcePath: source.relativePath, text: source.text || "", contentHash: source.contentHash, byteSize: source.byteSize }, options),
  python: parsePythonSource,
  sql: (source, options) => parseSqlSource({ sourcePath: source.relativePath, text: source.text || "", contentHash: source.contentHash, byteSize: source.byteSize }, options),
  markdown: (source, options) => parseMarkdownStructure(source, parserDescriptorForSource(source, options), source.text || "", {}, options),
  "json-config": parseJsonConfigSourceWithIsolation,
  "structural-config": parseStructuralConfigSource,
  "brace-code": (source, options) => parseBraceCodeSource({
    sourcePath: source.relativePath,
    text: source.text || "",
    contentHash: source.contentHash,
    byteSize: source.byteSize,
    checkpoint: options.checkpoint,
    limits: options.limits,
    retainRecord: options.retainRecord,
  }),
  "declarative-grammar": parseDeclarativeGrammarSource,
  pdf: parsePdfSource,
  inventory: (source, options) => sourceOnlyFragment(source, parserDescriptorForSource(source, options)),
});

export function createKnowledgeGraphParserDispatch(parserRegistry = SOURCE_PARSER_REGISTRY) {
  return createParserDispatch(parserRegistry, NATIVE_PARSER_ADAPTERS);
}

const PARSER_DISPATCH = createKnowledgeGraphParserDispatch(SOURCE_PARSER_REGISTRY);

export async function parseKnowledgeSource(source, options = {}) {
  return parseSourceWithDispatch(source, options, {
    adapters: NATIVE_PARSER_ADAPTERS,
    assertParserFragmentBounds,
    boundedParserOptions,
    defaultDispatch: PARSER_DISPATCH,
    parserDescriptorForSource,
    sourceOnlyFragment,
  });
}
