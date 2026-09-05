import {
  buildEvidence,
  makeEdge,
  makeNode,
  stableEntityId,
} from "./contract.mjs";

const IDENTIFIER = "[A-Za-z_][A-Za-z0-9_]*";
const IMPORTABLE_NAME = new RegExp(`^\\.*${IDENTIFIER}(?:\\.${IDENTIFIER})*$`);
const SIMPLE_CASE_PATTERN = /^(?:_|[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*|None|True|False|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*')$/u;
const SIMPLE_TYPE_PARAMETERS = new RegExp(`^${IDENTIFIER}(?:\\s*,\\s*${IDENTIFIER})*$`);

const PYTHON_GRAMMAR_GAPS = Object.freeze([
  {
    id: "match-statement",
    label: "the match statement",
    minimumMinor: 10,
    matches: (line) => /^\s*match\s+.+:\s*(?:#.*)?$/.test(line),
  },
  {
    id: "exception-group",
    label: "the exception-group syntax",
    minimumMinor: 11,
    matches: (line) => /^\s*except\s*\*/.test(line),
  },
  {
    id: "type-alias",
    label: "the type-alias statement",
    minimumMinor: 12,
    matches: (line) => new RegExp(`^\\s*type\\s+${IDENTIFIER}(?:\\[[^\\]]*\\])?\\s*=`).test(line),
  },
  {
    id: "type-parameters",
    label: "type parameters",
    minimumMinor: 12,
    matches: (line) => new RegExp(`^\\s*(?:async\\s+def|def|class)\\s+${IDENTIFIER}\\s*\\[`).test(line),
  },
]);

function versionParts(value) {
  if (!Array.isArray(value)) return null;
  const major = Number(value[0]);
  const minor = Number(value[1]);
  return Number.isSafeInteger(major) && Number.isSafeInteger(minor) ? { major, minor } : null;
}

function sourceLine(text, lineNumber) {
  const lines = String(text || "").split("\n");
  return lines[Math.max(0, lineNumber - 1)] || "";
}

function runtimeGapForDiagnostics({ diagnostics, text, pythonVersionInfo }) {
  const version = versionParts(pythonVersionInfo);
  if (!version) return null;
  const syntaxDiagnostic = (Array.isArray(diagnostics) ? diagnostics : []).find(
    (diagnostic) => diagnostic?.code === "python_syntax_error",
  );
  const lineNumber = Number(syntaxDiagnostic?.lineStart);
  if (!Number.isSafeInteger(lineNumber) || lineNumber < 1) return null;
  const line = sourceLine(text, lineNumber);
  return PYTHON_GRAMMAR_GAPS.find((gap) => (
    (version.major < 3 || (version.major === 3 && version.minor < gap.minimumMinor))
      && gap.matches(line)
  )) || null;
}

function indentationFor(line) {
  return /^\s*/u.exec(line)?.[0].length || 0;
}

function needsGrammarLowering(version, minimumMinor) {
  return version.major < 3 || (version.major === 3 && version.minor < minimumMinor);
}

function commentSuffix(comment) {
  return comment ? ` ${comment}` : "";
}

function lowerMatchHeader(line) {
  const match = /^(\s*)match\s+(.+?)\s*:\s*(#.*)?$/u.exec(line);
  if (!match || !match[2].trim()) return null;
  return `${match[1]}if (${match[2].trim()}) is not None:${commentSuffix(match[3])}`;
}

function lowerCaseHeader(line) {
  const match = /^(\s*)case\s+(.+?)\s*:\s*(#.*)?$/u.exec(line);
  const pattern = match?.[2]?.trim();
  if (!match || !SIMPLE_CASE_PATTERN.test(pattern)) return null;
  const condition = pattern === "_" ? "True" : `(${pattern}) is not None`;
  return `${match[1]}if ${condition}:${commentSuffix(match[3])}`;
}

function lowerExceptionGroupHeader(line) {
  const match = /^(\s*)except\s*\*\s+(.+?)\s*$/u.exec(line);
  return match && match[2].endsWith(":") ? `${match[1]}except ${match[2]}` : null;
}

function lowerTypeAlias(line) {
  const match = new RegExp(`^(\\s*)type\\s+(${IDENTIFIER})(?:\\[([^\\]\\n]+)\\])?\\s*=\\s*(.+)$`).exec(line);
  if (!match || (match[3] && !SIMPLE_TYPE_PARAMETERS.test(match[3].trim()))) return null;
  return `${match[1]}${match[2]} = ${match[4]}`;
}

function lowerTypeParameters(line) {
  const match = new RegExp(`^(\\s*)((?:async\\s+)?def|class)\\s+(${IDENTIFIER})\\s*\\[([^\\]\\n]+)\\](.*)$`).exec(line);
  if (!match || !SIMPLE_TYPE_PARAMETERS.test(match[4].trim())) return null;
  return `${match[1]}${match[2]} ${match[3]}${match[5]}`;
}

/**
 * Rewrites only a conservative subset of newer grammar into Python 3.9
 * scaffolding so the local AST can reject any remaining malformed syntax.
 */
export function pythonRuntimeGrammarValidationSource({ source, diagnostics, pythonVersionInfo }) {
  const gap = runtimeGapForDiagnostics({ diagnostics, text: source?.text, pythonVersionInfo });
  const version = versionParts(pythonVersionInfo);
  if (!gap || !version) return null;
  const lowered = [];
  const matchStack = [];
  let changed = false;
  for (const line of String(source?.text || "").split("\n")) {
    const code = removeInlineComment(line).trim();
    const indentation = indentationFor(line);
    if (code) {
      while (matchStack.length && indentation <= matchStack.at(-1).indentation) matchStack.pop();
    }
    if (needsGrammarLowering(version, 10) && /^\s*match\b/u.test(line)) {
      const replacement = lowerMatchHeader(line);
      if (!replacement) return null;
      matchStack.push({ indentation });
      lowered.push(replacement);
      changed = true;
      continue;
    }
    if (needsGrammarLowering(version, 10) && /^\s*case\s+.+:\s*(?:#.*)?$/u.test(line)) {
      if (!matchStack.length || indentation <= matchStack.at(-1).indentation) return null;
      const replacement = lowerCaseHeader(line);
      if (!replacement) return null;
      lowered.push(replacement);
      changed = true;
      continue;
    }
    if (needsGrammarLowering(version, 11) && /^\s*except\s*\*/u.test(line)) {
      const replacement = lowerExceptionGroupHeader(line);
      if (!replacement) return null;
      lowered.push(replacement);
      changed = true;
      continue;
    }
    if (needsGrammarLowering(version, 12) && /^\s*type\s+/u.test(line)) {
      const replacement = lowerTypeAlias(line);
      if (!replacement) return null;
      lowered.push(replacement);
      changed = true;
      continue;
    }
    if (needsGrammarLowering(version, 12) && /^\s*(?:async\s+def|def|class)\s+/u.test(line)) {
      const replacement = lowerTypeParameters(line);
      const typeParameterCandidate = new RegExp(`^\\s*(?:async\\s+def|def|class)\\s+${IDENTIFIER}\\s*\\[`).test(line);
      if (typeParameterCandidate && !replacement) return null;
      lowered.push(replacement || line);
      if (replacement) changed = true;
      continue;
    }
    lowered.push(line);
  }
  return changed ? lowered.join("\n") : null;
}

function removeInlineComment(line) {
  let quote = "";
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "#") return line.slice(0, index);
  }
  return line;
}

function qualifiedName(parent, name) {
  return parent ? `${parent.qualifiedName}.${name}` : name;
}

function importNames(line) {
  const withoutComment = removeInlineComment(line);
  const fromMatch = new RegExp(`^\\s*from\\s+(\\.*${IDENTIFIER}(?:\\.${IDENTIFIER})*|\\.+)\\s+import\\s+`).exec(withoutComment);
  if (fromMatch) return [fromMatch[1]];
  const importMatch = /^\s*import\s+(.+?)\s*$/.exec(withoutComment);
  if (!importMatch) return [];
  return importMatch[1]
    .split(",")
    .map((value) => value.trim().split(/\s+as\s+/i)[0].trim())
    .filter((value) => IMPORTABLE_NAME.test(value));
}

function baseNames(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim().replace(/\[[^\]]*\]$/u, ""))
    .filter((entry) => new RegExp(`^${IDENTIFIER}(?:\\.${IDENTIFIER})*$`).test(entry));
}

function evidenceFor({ source, descriptor, line, lineNumber, ruleId, explanation }) {
  return buildEvidence({
    sourcePath: source.relativePath,
    sourceDigest: source.contentHash,
    text: source.text,
    lineStart: lineNumber,
    lineEnd: lineNumber,
    columnStart: Math.max(1, line.search(/\S/u) + 1),
    columnEnd: line.length + 1,
    excerpt: line,
    ruleId,
    explanation,
    parserId: descriptor.parserId,
    parserVersion: descriptor.parserVersion,
    confidence: "medium",
  });
}

function sourceNodeWithRecoveryProperties(fragment, gap, version) {
  const sourceNode = fragment.nodes[0];
  return {
    ...sourceNode,
    properties: {
      ...sourceNode.properties,
      "corpus:parserFidelity": "lexical-recovery",
      "code:pythonRecoveryFeature": gap.id,
      "code:pythonRuntime": `${version.major}.${version.minor}`,
    },
  };
}

/**
 * Retains deterministic source-level Python relationships when the installed
 * local AST runtime predates a known language feature at its syntax-error line.
 */
export function recoverPythonRuntimeGrammar({
  source,
  descriptor,
  diagnostics,
  options,
  pythonVersionInfo,
  syntaxValidated,
  sourceOnlyFragment,
}) {
  const gap = runtimeGapForDiagnostics({
    diagnostics,
    text: source.text,
    pythonVersionInfo,
  });
  const version = versionParts(pythonVersionInfo);
  if (!gap || !version || syntaxValidated !== true) return null;
  const base = sourceOnlyFragment(source, descriptor, []);
  const sourceNode = sourceNodeWithRecoveryProperties(base, gap, version);
  const nodes = new Map([[sourceNode.id, sourceNode]]);
  const edges = new Map();
  options.retainRecord?.("node", "python.recovery.source");
  const addNode = (node, stage) => {
    if (!nodes.has(node.id)) {
      options.retainRecord?.("node", stage);
      nodes.set(node.id, node);
    }
    return node.id;
  };
  const addEdge = (edge, stage) => {
    if (!edges.has(edge.id)) {
      options.retainRecord?.("edge", stage);
      edges.set(edge.id, edge);
    }
  };
  const classStack = [];
  const lines = String(source.text || "").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    options.checkpoint?.("python.recovery.lines");
    const line = lines[index];
    if (!removeInlineComment(line).trim()) continue;
    const lineNumber = index + 1;
    const indentation = indentationFor(line);
    while (classStack.length && indentation <= classStack.at(-1).indentation) classStack.pop();
    const classMatch = new RegExp(`^\\s*class\\s+(${IDENTIFIER})(?:\\s*\\[[^\\]]*\\])?\\s*(?:\\(([^)]*)\\))?\\s*:`).exec(line);
    if (classMatch) {
      const parent = classStack.at(-1) || null;
      const name = classMatch[1];
      const namePath = qualifiedName(parent, name);
      const node = makeNode({
        id: stableEntityId("CodeClass", source.relativePath, `${namePath}:${lineNumber}`),
        label: name,
        type: "CodeClass",
        sourcePath: source.relativePath,
        properties: {
          "code:kind": "class",
          "code:qualifiedName": namePath,
          "corpus:lineStart": lineNumber,
        },
      });
      addNode(node, "python.recovery.declarations");
      const owner = parent?.id || sourceNode.id;
      addEdge(makeEdge({
        source: owner,
        target: node.id,
        label: parent ? "containsDeclaration" : "declares",
        evidence: evidenceFor({
          source, descriptor, line, lineNumber,
          ruleId: "python.recovery.declaration",
          explanation: `${parent?.qualifiedName || source.relativePath} declares class ${namePath} through local lexical recovery.`,
        }),
      }), "python.recovery.declaration-edges");
      for (const baseName of baseNames(classMatch[2])) {
        const baseNode = makeNode({
          id: stableEntityId("CodeReference", source.relativePath, `${baseName}:${lineNumber}`),
          label: baseName,
          type: "CodeReference",
          sourcePath: source.relativePath,
          properties: { "code:referenceKind": "extends" },
        });
        addNode(baseNode, "python.recovery.inheritance");
        addEdge(makeEdge({
          source: node.id,
          target: baseNode.id,
          label: "extends",
          evidence: evidenceFor({
            source, descriptor, line, lineNumber,
            ruleId: "python.recovery.inheritance",
            explanation: `${namePath} extends ${baseName} through local lexical recovery.`,
          }),
        }), "python.recovery.inheritance-edges");
      }
      classStack.push({ id: node.id, indentation, qualifiedName: namePath });
      continue;
    }
    const functionMatch = new RegExp(`^\\s*(?:async\\s+)?def\\s+(${IDENTIFIER})(?:\\s*\\[[^\\]]*\\])?\\s*\\(`).exec(line);
    if (functionMatch) {
      const parent = classStack.at(-1) || null;
      const name = functionMatch[1];
      const namePath = qualifiedName(parent, name);
      const type = parent ? "CodeMethod" : "CodeFunction";
      const node = makeNode({
        id: stableEntityId(type, source.relativePath, `${namePath}:${lineNumber}`),
        label: name,
        type,
        sourcePath: source.relativePath,
        properties: {
          "code:kind": parent ? "method" : "function",
          "code:qualifiedName": namePath,
          "corpus:lineStart": lineNumber,
        },
      });
      addNode(node, "python.recovery.declarations");
      const owner = parent?.id || sourceNode.id;
      addEdge(makeEdge({
        source: owner,
        target: node.id,
        label: parent ? "containsDeclaration" : "declares",
        evidence: evidenceFor({
          source, descriptor, line, lineNumber,
          ruleId: "python.recovery.declaration",
          explanation: `${parent?.qualifiedName || source.relativePath} declares ${parent ? "method" : "function"} ${namePath} through local lexical recovery.`,
        }),
      }), "python.recovery.declaration-edges");
      continue;
    }
    for (const moduleName of importNames(line)) {
      const dependency = makeNode({
        id: stableEntityId("CodeDependency", source.relativePath, `${moduleName}:${lineNumber}`),
        label: moduleName,
        type: "CodeDependency",
        sourcePath: source.relativePath,
        properties: { "code:module": moduleName },
      });
      addNode(dependency, "python.recovery.imports");
      addEdge(makeEdge({
        source: sourceNode.id,
        target: dependency.id,
        label: "imports",
        evidence: evidenceFor({
          source, descriptor, line, lineNumber,
          ruleId: "python.recovery.import",
          explanation: `${source.relativePath} imports ${moduleName} through local lexical recovery.`,
        }),
      }), "python.recovery.import-edges");
    }
  }
  const normalizedDiagnostics = (Array.isArray(diagnostics) ? diagnostics : []).map((diagnostic) => ({
    ...diagnostic,
    sourcePath: source.relativePath,
  }));
  const recoveryDiagnostic = {
    code: "python_runtime_grammar_recovered",
    sourcePath: source.relativePath,
    message: `The local Python ${version.major}.${version.minor} AST runtime predates ${gap.label}; deterministic lexical recovery retained declarations and imports.`,
  };
  for (const diagnostic of [recoveryDiagnostic, ...normalizedDiagnostics]) {
    options.retainRecord?.("diagnostic", "python.recovery.diagnostics");
  }
  return {
    parserId: descriptor.parserId,
    parserVersion: descriptor.parserVersion,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    diagnostics: [recoveryDiagnostic, ...normalizedDiagnostics],
    status: "parsed",
  };
}
