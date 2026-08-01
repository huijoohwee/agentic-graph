import {
  buildEvidence,
  KnowledgeGraphError,
  makeEdge,
  makeNode,
  stableEntityId,
  versionKnowledgeGraphParserOutput,
} from "./contract.mjs";

export const BRACE_CODE_PARSER_ID = "local-brace-code-structure";
export const BRACE_CODE_PARSER_VERSION = versionKnowledgeGraphParserOutput("1.0.0");

const CONTROL_WORDS = new Set(["catch", "do", "else", "for", "if", "lock", "switch", "try", "while"]);
const CHECKPOINT_INTERVAL = 1_024;
const DEFAULT_LIMITS = Object.freeze({
  maxNodes: 100_000,
  maxEdges: 100_000,
  maxRecords: 100_000,
});

function runCheckpoint(checkpoint, stage, index = 0) {
  if (typeof checkpoint === "function" && index % CHECKPOINT_INTERVAL === 0) checkpoint(stage);
}

function normalizeLimit(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

function resolveLimits({ limits, maxNodes, maxEdges, maxRecords }) {
  const configured = limits && typeof limits === "object" ? limits : {};
  return {
    maxNodes: normalizeLimit(maxNodes ?? configured.maxNodes ?? configured.nodes, DEFAULT_LIMITS.maxNodes),
    maxEdges: normalizeLimit(maxEdges ?? configured.maxEdges ?? configured.edges, DEFAULT_LIMITS.maxEdges),
    maxRecords: normalizeLimit(maxRecords ?? configured.maxRecords ?? configured.records, DEFAULT_LIMITS.maxRecords),
  };
}

function throwRecordLimit(sourcePath, limits, attemptedRecords, dimension = "records") {
  throw new KnowledgeGraphError(
    "parser_record_limit_exceeded",
    `Brace-code parsing exceeded the configured ${dimension} limit for ${sourcePath}.`,
    {
      parserId: BRACE_CODE_PARSER_ID,
      sourcePath,
      attemptedRecords,
      ...limits,
    },
  );
}

function effectiveRecordLimit(limits) {
  return Math.min(
    limits.maxRecords,
    Math.max(0, limits.maxNodes - 1),
    limits.maxEdges,
  );
}

function maskCommentsAndStrings(text, checkpoint) {
  let output = "";
  let state = "code";
  let quote = "";
  for (let index = 0; index < text.length; index += 1) {
    runCheckpoint(checkpoint, "brace-code.mask", index);
    const char = text[index];
    const next = text[index + 1] || "";
    if (state === "line-comment") {
      if (char === "\n") {
        state = "code";
        output += "\n";
      } else output += " ";
      continue;
    }
    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        output += "  ";
        index += 1;
        state = "code";
      } else output += char === "\n" ? "\n" : " ";
      continue;
    }
    if (state === "string") {
      if (char === "\\") {
        output += " ";
        if (next) {
          output += next === "\n" ? "\n" : " ";
          index += 1;
        }
      } else if (char === quote) {
        output += " ";
        state = "code";
      } else output += char === "\n" ? "\n" : " ";
      continue;
    }
    if (char === "/" && next === "/") {
      output += "  ";
      index += 1;
      state = "line-comment";
    } else if (char === "/" && next === "*") {
      output += "  ";
      index += 1;
      state = "block-comment";
    } else if (char === "'" || char === '"' || char === "`") {
      output += " ";
      quote = char;
      state = "string";
    } else output += char;
  }
  return output;
}

function closingBraces(masked, checkpoint) {
  const closeByOpen = new Map();
  const stack = [];
  for (let index = 0; index < masked.length; index += 1) {
    runCheckpoint(checkpoint, "brace-code.braces", index);
    if (masked[index] === "{") stack.push(index);
    else if (masked[index] === "}" && stack.length) closeByOpen.set(stack.pop(), index);
  }
  for (let index = 0; index < stack.length; index += 1) {
    runCheckpoint(checkpoint, "brace-code.unclosed-braces", index);
    closeByOpen.set(stack[index], masked.length);
  }
  return closeByOpen;
}

function assignDeclarationParents(masked, declarations, checkpoint) {
  const ownerByOpen = new Map();
  for (let index = 0; index < declarations.length; index += 1) {
    runCheckpoint(checkpoint, "brace-code.declaration-owners", index);
    const declaration = declarations[index];
    if (!ownerByOpen.has(declaration.open)) ownerByOpen.set(declaration.open, declaration);
  }

  const braceStack = [];
  let declarationIndex = 0;
  for (let offset = 0; offset < masked.length; offset += 1) {
    runCheckpoint(checkpoint, "brace-code.declaration-parents", offset);
    while (declarations[declarationIndex]?.start === offset) {
      const declaration = declarations[declarationIndex];
      const candidate = braceStack.at(-1)?.nearestOwner || null;
      declaration.parent = candidate
        && candidate.open < declaration.start
        && candidate.close >= declaration.close
        ? candidate
        : null;
      declarationIndex += 1;
    }
    if (masked[offset] === "{") {
      braceStack.push({
        nearestOwner: ownerByOpen.get(offset) || braceStack.at(-1)?.nearestOwner || null,
      });
    } else if (masked[offset] === "}" && braceStack.length) {
      braceStack.pop();
    }
  }
  while (declarationIndex < declarations.length) {
    declarations[declarationIndex].parent = null;
    declarationIndex += 1;
  }
}

function declarationMatches(masked, {
  checkpoint,
  limits,
  recordLimit,
  sourcePath,
}) {
  const declarationsByAnchor = new Map();
  const addDeclaration = (declaration) => {
    const key = `${declaration.start}:${declaration.open}`;
    const existing = declarationsByAnchor.get(key);
    if (existing && existing.kind !== "function") return;
    if (!existing && declarationsByAnchor.size >= recordLimit) {
      throwRecordLimit(sourcePath, limits, declarationsByAnchor.size + 1);
    }
    declarationsByAnchor.set(key, declaration);
  };
  const typePattern = /\b(class|interface|enum|struct|record|trait|protocol|object)\s+([A-Za-z_][A-Za-z0-9_]*)[^{;]*\{/g;
  let match;
  let matchCount = 0;
  while ((match = typePattern.exec(masked))) {
    runCheckpoint(checkpoint, "brace-code.type-declarations", matchCount);
    matchCount += 1;
    addDeclaration({
      kind: match[1],
      name: match[2],
      type: ["class", "record", "object"].includes(match[1]) ? "CodeClass" : `Code${match[1][0].toUpperCase()}${match[1].slice(1)}`,
      start: match.index,
      open: match.index + match[0].lastIndexOf("{"),
    });
  }
  const functionPatterns = [
    /\b(?:func|fn)\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>{}]*>)?\s*\([^;{}]*\)[^{;]*\{/g,
    /\b(?:function|fun)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{}]*\)[^{;]*\{/g,
    /(?:^|[;{}]\s*)(?:[A-Za-z_][A-Za-z0-9_<>,.:[\]?*&\s]*\s+)([A-Za-z_~][A-Za-z0-9_]*)\s*\([^;{}]*\)(?:\s*(?:const|noexcept|override|final|throws[^{]*))?\s*\{/gm,
  ];
  for (const pattern of functionPatterns) {
    while ((match = pattern.exec(masked))) {
      runCheckpoint(checkpoint, "brace-code.function-declarations", matchCount);
      matchCount += 1;
      const name = match[1];
      if (CONTROL_WORDS.has(name)) continue;
      addDeclaration({
        kind: "function",
        name,
        type: "CodeFunction",
        start: match.index + Math.max(0, match[0].indexOf(name)),
        open: match.index + match[0].lastIndexOf("{"),
      });
    }
  }
  const closeByOpen = closingBraces(masked, checkpoint);
  const declarations = [...declarationsByAnchor.values()]
    .map((entry) => ({ ...entry, close: closeByOpen.get(entry.open) ?? masked.length }))
    .sort((left, right) => left.start - right.start || right.close - left.close);
  assignDeclarationParents(masked, declarations, checkpoint);
  return declarations;
}

function dependencyMatches(text, {
  checkpoint,
  limits,
  recordLimit,
  recordOffset,
  sourcePath,
}) {
  const matches = [];
  const patterns = [
    /^\s*import\s+(?:[^;"']+\s+from\s+)?["']?([^"';\s]+)["']?\s*;?/gm,
    /^\s*(?:use|using)\s+([^;\n]+)\s*;/gm,
    /^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm,
    /^\s*(?:require|include)(?:_once)?\s*\(?\s*["']([^"']+)["']/gm,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      runCheckpoint(checkpoint, "brace-code.dependencies", matches.length);
      if (matches.length >= recordLimit) {
        throwRecordLimit(sourcePath, limits, recordOffset + matches.length + 1);
      }
      matches.push({ module: match[1].trim(), start: match.index, end: match.index + match[0].length });
    }
  }
  return matches.sort((left, right) => left.start - right.start);
}

function buildLineStarts(text, checkpoint) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    runCheckpoint(checkpoint, "brace-code.line-index", index);
    if (text[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function linePosition(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (lineStarts[middle] <= offset) low = middle + 1;
    else high = middle;
  }
  const lineIndex = Math.max(0, low - 1);
  return {
    line: lineIndex + 1,
    column: offset - lineStarts[lineIndex] + 1,
  };
}

function indexedSpan(text, lineStarts, startOffset, endOffset) {
  const start = Math.max(0, Math.min(text.length, Number(startOffset) || 0));
  const end = Math.max(start, Math.min(text.length, Number(endOffset) || start));
  const startPosition = linePosition(lineStarts, start);
  const endPosition = linePosition(lineStarts, end);
  return {
    lineStart: startPosition.line,
    lineEnd: endPosition.line,
    columnStart: startPosition.column,
    columnEnd: endPosition.column,
    excerpt: text.slice(start, Math.min(end, start + 320)),
  };
}

export function parseBraceCodeSource({
  sourcePath,
  text,
  contentHash,
  byteSize,
  checkpoint,
  limits,
  maxNodes,
  maxEdges,
  maxRecords,
  retainRecord = () => {},
}) {
  const parserId = BRACE_CODE_PARSER_ID;
  const parserVersion = BRACE_CODE_PARSER_VERSION;
  const parserLimits = resolveLimits({ limits, maxNodes, maxEdges, maxRecords });
  if (parserLimits.maxNodes < 1) throwRecordLimit(sourcePath, parserLimits, 1, "node");
  const recordLimit = effectiveRecordLimit(parserLimits);
  runCheckpoint(checkpoint, "brace-code.start");
  const sourceId = stableEntityId("SourceFile", sourcePath, "source");
  const sourceNode = makeNode({
    id: sourceId,
    label: sourcePath,
    type: "SourceFile",
    sourcePath,
    properties: {
      "corpus:contentHash": contentHash,
      "corpus:byteSize": byteSize,
      "corpus:parserId": parserId,
      "corpus:parserVersion": parserVersion,
      "corpus:parserFidelity": "structural-parser",
    },
  });
  const nodes = new Map();
  const edges = new Map();
  const addNode = (node, stage) => {
    if (!nodes.has(node.id)) {
      retainRecord("node", stage);
      nodes.set(node.id, node);
    }
  };
  const addEdge = (edge, stage) => {
    if (!edges.has(edge.id)) {
      retainRecord("edge", stage);
      edges.set(edge.id, edge);
    }
  };
  addNode(sourceNode, "brace-code.source");
  const masked = maskCommentsAndStrings(text, checkpoint);
  const declarations = declarationMatches(masked, {
    checkpoint,
    limits: parserLimits,
    recordLimit,
    sourcePath,
  });
  const lineStarts = buildLineStarts(text, checkpoint);
  const declarationIds = new Map();
  const evidence = (startOffset, endOffset, ruleId, explanation, confidence = "high") => {
    const span = indexedSpan(text, lineStarts, startOffset, endOffset);
    return buildEvidence({
      sourcePath,
      sourceDigest: contentHash,
      text,
      ...span,
      ruleId,
      explanation,
      parserId,
      parserVersion,
      confidence,
    });
  };
  for (let index = 0; index < declarations.length; index += 1) {
    runCheckpoint(checkpoint, "brace-code.declaration-records", index);
    const declaration = declarations[index];
    const parent = declaration.parent;
    const qualifiedName = parent ? `${parent.name}.${declaration.name}` : declaration.name;
    const id = stableEntityId(declaration.type, sourcePath, `${qualifiedName}:${declaration.start}`);
    declarationIds.set(declaration, id);
    addNode(makeNode({
      id,
      label: declaration.name,
      type: declaration.type,
      sourcePath,
      properties: { "code:kind": declaration.kind, "code:qualifiedName": qualifiedName },
    }), "brace-code.declaration-nodes");
    const owner = parent ? declarationIds.get(parent) : sourceId;
    const edge = makeEdge({
      source: owner || sourceId,
      target: id,
      label: parent ? "containsDeclaration" : "declares",
      evidence: evidence(
        declaration.start,
        Math.min(text.length, declaration.open + 1),
        "brace-code.declaration.structure",
        `${parent?.name || sourcePath} declares ${declaration.kind} ${qualifiedName}.`,
      ),
    });
    addEdge(edge, "brace-code.declaration-edges");
  }
  const remainingRecords = Math.max(0, recordLimit - declarations.length);
  const dependencies = dependencyMatches(text, {
    checkpoint,
    limits: parserLimits,
    recordLimit: remainingRecords,
    recordOffset: declarations.length,
    sourcePath,
  });
  for (let index = 0; index < dependencies.length; index += 1) {
    runCheckpoint(checkpoint, "brace-code.dependency-records", index);
    const dependency = dependencies[index];
    const id = stableEntityId("CodeDependency", sourcePath, `${dependency.module}:${dependency.start}`);
    addNode(makeNode({
      id,
      label: dependency.module,
      type: "CodeDependency",
      sourcePath,
      properties: { "code:module": dependency.module },
    }), "brace-code.dependency-nodes");
    const edge = makeEdge({
      source: sourceId,
      target: id,
      label: "imports",
      evidence: evidence(dependency.start, dependency.end, "brace-code.import.structure", `${sourcePath} imports ${dependency.module}.`),
    });
    addEdge(edge, "brace-code.dependency-edges");
  }
  if (nodes.size > parserLimits.maxNodes) throwRecordLimit(sourcePath, parserLimits, declarations.length + dependencies.length, "node");
  if (edges.size > parserLimits.maxEdges) throwRecordLimit(sourcePath, parserLimits, declarations.length + dependencies.length, "edge");
  runCheckpoint(checkpoint, "brace-code.complete");
  const diagnostics = declarations.length || edges.size
    ? []
    : [{ code: "brace_code_structure_not_found", sourcePath, message: `No bounded declaration or dependency structure was found in ${sourcePath}.` }];
  if (diagnostics.length) {
    retainRecord("diagnostic", "brace-code.diagnostics");
  }
  return { parserId, parserVersion, nodes: [...nodes.values()], edges: [...edges.values()], diagnostics, status: "parsed" };
}
