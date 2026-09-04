import {
  buildEvidence,
  compareStableStrings,
  AgentGraphError,
  makeEdge,
  makeNode,
  sha256,
  stableEntityId,
} from "./contract.mjs";

const MAX_DETAILED_JSON_VALUES = 90_000;
const MAX_COMPACT_DIRECT_CHILDREN = 10_000;
const COMPACT_ARRAY_RANGE_SIZE = 1_000;
const MAX_SEARCH_CHUNK_CHARS = 280;
const MAX_SEARCH_TOKEN_CHARS = 128 * 1024;
const SEARCH_TOKEN_PATTERN = /[\p{L}\p{N}_.$/@-]+/gu;
const SENSITIVE_KEY_PATTERN = /(?:secret|token|password|credential|private.?key|api.?key)/iu;

function countDetailedValues(rootExpression, typescript, options) {
  const stack = rootExpression ? [rootExpression] : [];
  let values = 0;
  while (stack.length) {
    options.checkpoint("json.compaction-analysis");
    const node = stack.pop();
    if (typescript.isObjectLiteralExpression(node)) {
      for (let index = node.properties.length - 1; index >= 0; index -= 1) {
        options.checkpoint("json.compaction-analysis-properties");
        const property = node.properties[index];
        if (!typescript.isPropertyAssignment(property)) continue;
        values += 1;
        if (values > MAX_DETAILED_JSON_VALUES) return values;
        stack.push(property.initializer);
      }
    } else if (typescript.isArrayLiteralExpression(node)) {
      for (let index = node.elements.length - 1; index >= 0; index -= 1) {
        options.checkpoint("json.compaction-analysis-items");
        values += 1;
        if (values > MAX_DETAILED_JSON_VALUES) return values;
        stack.push(node.elements[index]);
      }
    }
  }
  return values;
}

function compactGraph(options, sourceNode) {
  const nodes = new Map();
  const edges = new Map();
  const addNode = (node, stage) => {
    if (!nodes.has(node.id)) {
      options.retainRecord?.("node", stage);
      nodes.set(node.id, node);
    }
  };
  const addEdge = (edge, stage) => {
    if (!edges.has(edge.id)) {
      options.retainRecord?.("edge", stage);
      edges.set(edge.id, edge);
    }
  };
  addNode(sourceNode, "json.source");
  return { addEdge, addNode, edges, nodes };
}

function valueType(node, typescript) {
  if (typescript.isObjectLiteralExpression(node)) return "object";
  if (typescript.isArrayLiteralExpression(node)) return "array";
  if (typescript.isStringLiteral(node)) return "string";
  if (typescript.isNumericLiteral(node)) return "number";
  if ([typescript.SyntaxKind.TrueKeyword, typescript.SyntaxKind.FalseKeyword].includes(node.kind)) {
    return "boolean";
  }
  if (node.kind === typescript.SyntaxKind.NullKeyword) return "null";
  return "unknown";
}

function collectSensitiveValueSpans(rootExpression, sourceFile, typescript, options) {
  const spans = [];
  const stack = rootExpression
    ? [{ node: rootExpression, pathParts: [], sensitive: false }]
    : [];
  while (stack.length) {
    options.checkpoint("json.compaction-redaction");
    const { node, pathParts, sensitive } = stack.pop();
    if (typescript.isObjectLiteralExpression(node)) {
      for (let index = node.properties.length - 1; index >= 0; index -= 1) {
        options.checkpoint("json.compaction-redaction-properties");
        const property = node.properties[index];
        if (!typescript.isPropertyAssignment(property)) continue;
        const key = String(
          property.name?.text ?? property.name?.getText(sourceFile) ?? "key",
        );
        const nextPath = [...pathParts, key];
        const childSensitive = sensitive
          || SENSITIVE_KEY_PATTERN.test(key)
          || SENSITIVE_KEY_PATTERN.test(nextPath.join("."));
        if (childSensitive) {
          spans.push({
            endOffset: property.initializer.getEnd(),
            startOffset: property.initializer.getStart(sourceFile),
          });
        } else {
          stack.push({
            node: property.initializer,
            pathParts: nextPath,
            sensitive: false,
          });
        }
      }
    } else if (typescript.isArrayLiteralExpression(node)) {
      for (let index = node.elements.length - 1; index >= 0; index -= 1) {
        options.checkpoint("json.compaction-redaction-items");
        const element = node.elements[index];
        if (sensitive) {
          spans.push({
            endOffset: element.getEnd(),
            startOffset: element.getStart(sourceFile),
          });
        } else {
          stack.push({
            node: element,
            pathParts: [...pathParts, `[${index}]`],
            sensitive: false,
          });
        }
      }
    }
  }
  return spans.sort((left, right) => left.startOffset - right.startOffset);
}

function collectCommentSpans(text, options) {
  const spans = [];
  let escaped = false;
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    if (index % 4_096 === 0) options.checkpoint("json.compaction-comments");
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char !== "/" || !["/", "*"].includes(text[index + 1])) continue;
    const startOffset = index;
    if (text[index + 1] === "/") {
      index += 2;
      while (index < text.length && !["\r", "\n"].includes(text[index])) {
        if (index % 4_096 === 0) options.checkpoint("json.compaction-line-comment");
        index += 1;
      }
    } else {
      index += 2;
      while (index < text.length
        && !(text[index] === "*" && text[index + 1] === "/")) {
        if (index % 4_096 === 0) options.checkpoint("json.compaction-block-comment");
        index += 1;
      }
      if (index < text.length) index += 1;
    }
    spans.push({ endOffset: Math.min(text.length, index + 1), startOffset });
  }
  return spans;
}

export function compactJsonConfigSource({
  descriptor,
  options,
  rootExpression,
  source,
  sourceFile,
  sourceNode,
  typescript,
}) {
  if (countDetailedValues(rootExpression, typescript, options) <= MAX_DETAILED_JSON_VALUES) {
    return null;
  }
  const graph = compactGraph(options, sourceNode);
  const text = String(source.text || "");
  const sensitiveSpans = [
    ...collectSensitiveValueSpans(
      rootExpression,
      sourceFile,
      typescript,
      options,
    ),
    ...collectCommentSpans(text, options),
  ].sort((left, right) => left.startOffset - right.startOffset);
  sourceNode.properties["config:representation"] = "deterministic-ast-ranges+lexical-index";
  sourceNode.properties["config:queryCoverage"] = "all-nonsensitive-json-lexical-tokens";
  const position = (offset) => sourceFile.getLineAndCharacterOfPosition(offset);
  const span = (first, last = first) => {
    const startOffset = first.getStart(sourceFile);
    const endOffset = last.getEnd();
    const start = position(startOffset);
    const end = position(endOffset);
    return {
      endOffset,
      lineEnd: end.line + 1,
      lineStart: start.line + 1,
      startOffset,
    };
  };
  const evidence = (range, ruleId, explanation, excerpt) => {
    const start = position(range.startOffset);
    const end = position(range.endOffset);
    return buildEvidence({
      sourcePath: source.relativePath,
      sourceDigest: source.contentHash,
      text,
      lineStart: start.line + 1,
      lineEnd: end.line + 1,
      columnStart: start.character + 1,
      columnEnd: end.character + 1,
      excerpt,
      ruleId,
      explanation,
      parserId: descriptor.parserId,
      parserVersion: descriptor.parserVersion,
    });
  };
  const subtreeDigest = (range) => sha256(text.slice(range.startOffset, range.endOffset));
  const rangeContainsSensitiveValue = (range) => sensitiveSpans.some((sensitive) => (
    sensitive.startOffset < range.endOffset && sensitive.endOffset > range.startOffset
  ));
  const integrityProperties = (range) => rangeContainsSensitiveValue(range)
    ? {
      "config:redacted": true,
      "config:integrityDigest": sha256(
        `redacted\0${source.contentHash}\0${range.startOffset}\0${range.endOffset}`,
      ),
    }
    : { "config:subtreeDigest": subtreeDigest(range) };
  const integrityExplanation = (range) => rangeContainsSensitiveValue(range)
    ? "the range contains a redacted sensitive value and is bound to the source-level integrity identity"
    : "the exact local subtree is identified by its digest";
  const structuralRanges = [];
  const rangedContainers = new Set();

  const addArrayRanges = (arrayNode, parentId, pathParts) => {
    const containerKey = `${arrayNode.getStart(sourceFile)}:${arrayNode.getEnd()}:array`;
    if (rangedContainers.has(containerKey)) return;
    rangedContainers.add(containerKey);
    for (let startIndex = 0; startIndex < arrayNode.elements.length; startIndex += COMPACT_ARRAY_RANGE_SIZE) {
      options.checkpoint("json.compact-array-ranges");
      const endIndex = Math.min(
        arrayNode.elements.length - 1,
        startIndex + COMPACT_ARRAY_RANGE_SIZE - 1,
      );
      const first = arrayNode.elements[startIndex];
      const last = arrayNode.elements[endIndex];
      const range = span(first, last);
      const keyPath = [...pathParts, `[${startIndex}..${endIndex}]`].join(".");
      const id = stableEntityId("ConfigItemRange", source.relativePath, keyPath);
      graph.addNode(makeNode({
        id,
        label: keyPath,
        type: "ConfigItemRange",
        sourcePath: source.relativePath,
        properties: {
          "config:keyPath": keyPath,
          "config:itemStart": startIndex,
          "config:itemEnd": endIndex,
          "config:itemCount": endIndex - startIndex + 1,
          "config:representation": "deterministic-ast-range",
          ...integrityProperties(range),
          "corpus:lineStart": range.lineStart,
          "corpus:lineEnd": range.lineEnd,
        },
      }), "json.compact-range-nodes");
      graph.addEdge(makeEdge({
        source: parentId,
        target: id,
        label: "hasConfigItemRange",
        anchor: `${range.startOffset}:${range.endOffset}`,
        evidence: evidence(
          range,
          "json.array-range.ast",
          `${pathParts.join(".") || source.relativePath} contains JSON AST items ${startIndex} through ${endIndex}; ${integrityExplanation(range)}.`,
          `[${startIndex}..${endIndex}]`,
        ),
      }), "json.compact-range-edges");
      structuralRanges.push({
        depth: pathParts.length,
        endOffset: range.endOffset,
        id,
        startOffset: range.startOffset,
      });
    }
  };

  const addPropertyRanges = (objectNode, properties, parentId, pathParts) => {
    const containerKey = `${objectNode.getStart(sourceFile)}:${objectNode.getEnd()}:object`;
    if (rangedContainers.has(containerKey)) return;
    rangedContainers.add(containerKey);
    for (let startIndex = 0; startIndex < properties.length; startIndex += COMPACT_ARRAY_RANGE_SIZE) {
      options.checkpoint("json.compact-property-ranges");
      const endIndex = Math.min(
        properties.length - 1,
        startIndex + COMPACT_ARRAY_RANGE_SIZE - 1,
      );
      const first = properties[startIndex];
      const last = properties[endIndex];
      const range = span(first, last);
      const keyPath = [
        ...pathParts,
        `[properties:${startIndex}..${endIndex}]`,
      ].join(".");
      const id = stableEntityId("ConfigKeyRange", source.relativePath, keyPath);
      graph.addNode(makeNode({
        id,
        label: keyPath,
        type: "ConfigKeyRange",
        sourcePath: source.relativePath,
        properties: {
          "config:keyPath": keyPath,
          "config:propertyStart": startIndex,
          "config:propertyEnd": endIndex,
          "config:propertyCount": endIndex - startIndex + 1,
          "config:representation": "deterministic-ast-range",
          ...integrityProperties(range),
          "corpus:lineStart": range.lineStart,
          "corpus:lineEnd": range.lineEnd,
        },
      }), "json.compact-range-nodes");
      graph.addEdge(makeEdge({
        source: parentId,
        target: id,
        label: "hasConfigKeyRange",
        anchor: `${range.startOffset}:${range.endOffset}`,
        evidence: evidence(
          range,
          "json.object-range.ast",
          `${pathParts.join(".") || source.relativePath} contains JSON AST properties ${startIndex} through ${endIndex}; ${integrityExplanation(range)}.`,
          keyPath,
        ),
      }), "json.compact-range-edges");
      structuralRanges.push({
        depth: pathParts.length,
        endOffset: range.endOffset,
        id,
        startOffset: range.startOffset,
      });
    }
  };

  const connectorIds = new Map();
  const addConfigKey = (property, parentId, pathParts) => {
    const key = String(
      property.name?.text ?? property.name?.getText(sourceFile) ?? "key",
    );
    const nextPath = [...pathParts, key];
    const keyPath = nextPath.join(".");
    const existingId = connectorIds.get(`property:${keyPath}`);
    if (existingId) return { id: existingId, key, pathParts: nextPath };
    const range = span(property);
    const id = stableEntityId("ConfigKey", source.relativePath, keyPath);
    const redacted = rangeContainsSensitiveValue(range);
    graph.addNode(makeNode({
      id,
      label: keyPath,
      type: "ConfigKey",
      sourcePath: source.relativePath,
      properties: {
        "config:key": key,
        "config:keyPath": keyPath,
        "config:valueType": valueType(property.initializer, typescript),
        "config:representation": "deterministic-ast-subtree",
        ...integrityProperties(range),
        "corpus:lineStart": range.lineStart,
        "corpus:lineEnd": range.lineEnd,
      },
    }), "json.compact-property-nodes");
    graph.addEdge(makeEdge({
      source: parentId,
      target: id,
      label: "hasConfigKey",
      anchor: `${range.startOffset}:${range.endOffset}`,
      evidence: evidence(
        range,
        "json.config-key.ast",
        `${pathParts.join(".") || source.relativePath} contains configuration key ${keyPath}; ${integrityExplanation(range)}.`,
        redacted
          ? `${key}=<redacted>`
          : `${property.name?.getText(sourceFile).slice(0, 160) || key}: <omitted>`,
      ),
    }), "json.compact-property-edges");
    connectorIds.set(`property:${keyPath}`, id);
    return { id, key, pathParts: nextPath };
  };

  const addConfigItem = (element, parentId, pathParts, index) => {
    const nextPath = [...pathParts, `[${index}]`];
    const keyPath = nextPath.join(".");
    const existingId = connectorIds.get(`item:${keyPath}`);
    if (existingId) return { id: existingId, pathParts: nextPath };
    const range = span(element);
    const id = stableEntityId("ConfigItem", source.relativePath, keyPath);
    graph.addNode(makeNode({
      id,
      label: keyPath,
      type: "ConfigItem",
      sourcePath: source.relativePath,
      properties: {
        "config:index": index,
        "config:keyPath": keyPath,
        "config:representation": "deterministic-ast-subtree",
        ...integrityProperties(range),
        "corpus:lineStart": range.lineStart,
        "corpus:lineEnd": range.lineEnd,
      },
    }), "json.compact-item-nodes");
    graph.addEdge(makeEdge({
      source: parentId,
      target: id,
      label: "hasConfigItem",
      anchor: `${range.startOffset}:${range.endOffset}`,
      evidence: evidence(
        range,
        "json.config-item.ast",
        `${pathParts.join(".") || source.relativePath} contains JSON AST item ${index}; ${integrityExplanation(range)}.`,
        `[${index}]`,
      ),
    }), "json.compact-item-edges");
    connectorIds.set(`item:${keyPath}`, id);
    return { id, pathParts: nextPath };
  };

  if (typescript.isArrayLiteralExpression(rootExpression)) {
    addArrayRanges(rootExpression, sourceNode.id, []);
  } else if (typescript.isObjectLiteralExpression(rootExpression)) {
    const properties = rootExpression.properties.filter(
      (property) => typescript.isPropertyAssignment(property),
    );
    if (properties.length > MAX_COMPACT_DIRECT_CHILDREN) {
      addPropertyRanges(rootExpression, properties, sourceNode.id, []);
    } else {
      for (const property of properties) {
        options.checkpoint("json.compact-properties");
        const connector = addConfigKey(property, sourceNode.id, []);
        if (typescript.isArrayLiteralExpression(property.initializer)) {
          addArrayRanges(property.initializer, connector.id, connector.pathParts);
        }
      }
    }
  }

  const rangeCandidates = [];
  const discoveryStack = rootExpression ? [{
    node: rootExpression,
    pathParts: [],
    steps: [],
  }] : [];
  while (discoveryStack.length) {
    options.checkpoint("json.compact-container-discovery");
    const current = discoveryStack.pop();
    if (typescript.isObjectLiteralExpression(current.node)) {
      const properties = current.node.properties.filter(
        (property) => typescript.isPropertyAssignment(property),
      );
      if (properties.length > MAX_COMPACT_DIRECT_CHILDREN) {
        rangeCandidates.push({
          ...current,
          kind: "object",
          properties,
          startOffset: current.node.getStart(sourceFile),
          endOffset: current.node.getEnd(),
        });
      }
      for (let index = properties.length - 1; index >= 0; index -= 1) {
        options.checkpoint("json.compact-container-properties");
        const property = properties[index];
        const child = property.initializer;
        if (!typescript.isObjectLiteralExpression(child)
          && !typescript.isArrayLiteralExpression(child)) continue;
        const key = String(
          property.name?.text ?? property.name?.getText(sourceFile) ?? "key",
        );
        discoveryStack.push({
          node: child,
          pathParts: [...current.pathParts, key],
          steps: [...current.steps, {
            kind: "property",
            pathParts: current.pathParts,
            property,
          }],
        });
      }
    } else if (typescript.isArrayLiteralExpression(current.node)) {
      if (current.pathParts.length === 0
        || current.node.elements.length > MAX_COMPACT_DIRECT_CHILDREN) {
        rangeCandidates.push({
          ...current,
          kind: "array",
          startOffset: current.node.getStart(sourceFile),
          endOffset: current.node.getEnd(),
        });
      }
      for (let index = current.node.elements.length - 1; index >= 0; index -= 1) {
        options.checkpoint("json.compact-container-items");
        const child = current.node.elements[index];
        if (!typescript.isObjectLiteralExpression(child)
          && !typescript.isArrayLiteralExpression(child)) continue;
        discoveryStack.push({
          node: child,
          pathParts: [...current.pathParts, `[${index}]`],
          steps: [...current.steps, {
            element: child,
            index,
            kind: "item",
            pathParts: current.pathParts,
          }],
        });
      }
    }
  }
  rangeCandidates.sort((left, right) => (
    left.startOffset - right.startOffset
    || right.endOffset - left.endOffset
    || compareStableStrings(left.pathParts.join("."), right.pathParts.join("."))
  ));
  const containingStructuralRange = (startOffset, endOffset) => {
    let selected = null;
    for (const range of structuralRanges) {
      if (range.startOffset > startOffset || range.endOffset < endOffset) continue;
      if (!selected
        || range.depth > selected.depth
        || (
          range.depth === selected.depth
          && range.endOffset - range.startOffset < selected.endOffset - selected.startOffset
        )) selected = range;
    }
    return selected;
  };
  for (const candidate of rangeCandidates) {
    options.checkpoint("json.compact-container-materialization");
    let parentId = sourceNode.id;
    for (const step of candidate.steps) {
      options.checkpoint("json.compact-container-connectors");
      if (step.kind === "item") {
        const elementRange = span(step.element);
        const ownerRange = containingStructuralRange(
          elementRange.startOffset,
          elementRange.endOffset,
        );
        if (ownerRange) {
          parentId = ownerRange.id;
        } else {
          parentId = addConfigItem(
            step.element,
            parentId,
            step.pathParts,
            step.index,
          ).id;
        }
      } else {
        const propertyRange = span(step.property);
        const ownerRange = containingStructuralRange(
          propertyRange.startOffset,
          propertyRange.endOffset,
        );
        if (ownerRange) parentId = ownerRange.id;
        parentId = addConfigKey(step.property, parentId, step.pathParts).id;
      }
    }
    if (candidate.kind === "array") {
      addArrayRanges(candidate.node, parentId, candidate.pathParts);
    } else {
      addPropertyRanges(
        candidate.node,
        candidate.properties,
        parentId,
        candidate.pathParts,
      );
    }
  }

  let sensitiveIndex = 0;
  let indexedTokenOrdinal = 0;
  let chunkTokens = [];
  let chunkStartOffset = -1;
  let chunkEndOffset = -1;
  let chunkCharacters = 0;
  let chunkOwnerId = "";
  const flushSearchChunk = () => {
    if (!chunkTokens.length) return;
    const searchText = chunkTokens.join(" ");
    const sourceExcerpt = text.slice(chunkStartOffset, chunkEndOffset);
    const start = position(chunkStartOffset);
    const end = position(chunkEndOffset);
    const id = stableEntityId(
      "ConfigSearchChunk",
      source.relativePath,
      `${chunkStartOffset}:${chunkEndOffset}:${sha256(searchText)}`,
    );
    graph.addNode(makeNode({
      id,
      label: `JSON lexical tokens ${indexedTokenOrdinal - chunkTokens.length + 1}-${indexedTokenOrdinal}`,
      type: "ConfigSearchChunk",
      sourcePath: source.relativePath,
      properties: {
        "config:searchText": searchText,
        "config:tokenCount": chunkTokens.length,
        "config:representation": "deterministic-redacted-lexical-index",
        "config:searchDigest": sha256(searchText),
        "corpus:lineStart": start.line + 1,
        "corpus:lineEnd": end.line + 1,
      },
    }), "json.search-index-nodes");
    graph.addEdge(makeEdge({
      source: chunkOwnerId || sourceNode.id,
      target: id,
      label: "indexesConfigTokens",
      anchor: `${chunkStartOffset}:${chunkEndOffset}`,
      evidence: evidence(
        {
          endOffset: chunkEndOffset,
          startOffset: chunkStartOffset,
        },
        "json.lexical-index.ast",
        `${source.relativePath} exposes these locally parsed nonsensitive JSON lexical tokens for deterministic graph queries.`,
        sourceExcerpt,
      ),
    }), "json.search-index-edges");
    chunkTokens = [];
    chunkStartOffset = -1;
    chunkEndOffset = -1;
    chunkCharacters = 0;
    chunkOwnerId = "";
  };
  const indexToken = (token, tokenStart, tokenEnd) => {
    while (sensitiveIndex < sensitiveSpans.length
      && sensitiveSpans[sensitiveIndex].endOffset <= tokenStart) {
      const excluded = sensitiveSpans[sensitiveIndex];
      if (chunkTokens.length
        && excluded.startOffset < tokenStart
        && excluded.endOffset > chunkEndOffset) {
        flushSearchChunk();
      }
      sensitiveIndex += 1;
    }
    const sensitive = sensitiveSpans[sensitiveIndex];
    if (sensitive && sensitive.startOffset < tokenEnd && sensitive.endOffset > tokenStart) {
      flushSearchChunk();
      return;
    }
    if (token.length > MAX_SEARCH_TOKEN_CHARS) {
      throw new AgentGraphError(
        "parser_record_limit_exceeded",
        `JSON lexical token exceeds its query-index bound for ${source.relativePath}.`,
        {
          sourcePath: source.relativePath,
          tokenCharacters: token.length,
          maxTokenCharacters: MAX_SEARCH_TOKEN_CHARS,
          stage: "json.compaction-search-index",
        },
      );
    }
    const ownerId = containingStructuralRange(tokenStart, tokenEnd)?.id || sourceNode.id;
    if (chunkTokens.length
      && (
        ownerId !== chunkOwnerId
        || tokenEnd - chunkStartOffset > MAX_SEARCH_CHUNK_CHARS
        || chunkCharacters + 1 + token.length > MAX_SEARCH_CHUNK_CHARS
      )) {
      flushSearchChunk();
    }
    if (!chunkTokens.length) {
      chunkStartOffset = tokenStart;
      chunkOwnerId = ownerId;
    }
    chunkTokens.push(token);
    chunkEndOffset = tokenEnd;
    chunkCharacters += (chunkTokens.length > 1 ? 1 : 0) + token.length;
    indexedTokenOrdinal += 1;
  };
  for (const match of text.matchAll(SEARCH_TOKEN_PATTERN)) {
    options.checkpoint("json.compaction-search-index");
    const token = match[0];
    const tokenStart = match.index;
    if (token.length > MAX_SEARCH_TOKEN_CHARS) {
      throw new AgentGraphError(
        "parser_record_limit_exceeded",
        `JSON lexical token exceeds its query-index bound for ${source.relativePath}.`,
        {
          sourcePath: source.relativePath,
          tokenCharacters: token.length,
          maxTokenCharacters: MAX_SEARCH_TOKEN_CHARS,
          stage: "json.compaction-search-index",
        },
      );
    }
    if (token.length <= MAX_SEARCH_CHUNK_CHARS) {
      indexToken(token, tokenStart, tokenStart + token.length);
      continue;
    }
    for (let offset = 0; offset < token.length; offset += MAX_SEARCH_CHUNK_CHARS) {
      options.checkpoint("json.compaction-search-token-segments");
      const segment = token.slice(offset, offset + MAX_SEARCH_CHUNK_CHARS);
      indexToken(segment, tokenStart + offset, tokenStart + offset + segment.length);
      flushSearchChunk();
    }
  }
  flushSearchChunk();

  const diagnostics = (sourceFile.parseDiagnostics || []).map((diagnostic) => {
    options.retainRecord?.("diagnostic", "json.diagnostics");
    const start = Number.isFinite(diagnostic.start) ? diagnostic.start : 0;
    const location = position(start);
    return {
      code: "json_syntax_error",
      sourcePath: source.relativePath,
      lineStart: location.line + 1,
      columnStart: location.character + 1,
      message: typescript.flattenDiagnosticMessageText(diagnostic.messageText, " "),
    };
  });
  return {
    parserId: descriptor.parserId,
    parserVersion: descriptor.parserVersion,
    nodes: [...graph.nodes.values()],
    edges: [...graph.edges.values()],
    diagnostics,
    status: diagnostics.length ? "partial" : "parsed",
  };
}
