import { createRequire } from "node:module";
import path from "node:path";

import { makeEdge, makeNode, stableEntityId, versionAgentGraphParserOutput } from "./contract.mjs";

const require = createRequire(import.meta.url);
let typescript = null;
try {
  typescript = require("typescript");
} catch {
  typescript = null;
}

export const TYPESCRIPT_PARSER_ID = "local-typescript-ast";
const TYPESCRIPT_WRAPPER_VERSION = "1.1.0";
const TYPESCRIPT_RUNTIME_VERSION = String(typescript?.version || "unavailable").replace(/[^A-Za-z0-9._-]+/g, "-");
export const TYPESCRIPT_PARSER_VERSION = versionAgentGraphParserOutput(
  `${TYPESCRIPT_WRAPPER_VERSION}+typescript-${TYPESCRIPT_RUNTIME_VERSION}`,
);

const scriptKindForPath = (sourcePath) => {
  const extension = path.posix.extname(sourcePath).toLowerCase();
  if (extension === ".tsx") return typescript.ScriptKind.TSX;
  if (extension === ".jsx") return typescript.ScriptKind.JSX;
  if ([".js", ".mjs", ".cjs"].includes(extension)) return typescript.ScriptKind.JS;
  return typescript.ScriptKind.TS;
};

export function parseTypeScriptSource({ sourcePath, text, contentHash, byteSize }, options = {}) {
  options.checkpoint?.("typescript.start");
  const sourceId = stableEntityId("SourceFile", sourcePath, "source");
  const sourceNode = makeNode({
    id: sourceId,
    label: sourcePath,
    type: "SourceFile",
    sourcePath,
    properties: {
      "corpus:contentHash": contentHash,
      "corpus:byteSize": byteSize,
      "corpus:parserId": TYPESCRIPT_PARSER_ID,
      "corpus:parserVersion": TYPESCRIPT_PARSER_VERSION,
      "corpus:parserFidelity": "ast",
    },
  });
  if (!typescript) {
    return {
      parserId: TYPESCRIPT_PARSER_ID,
      parserVersion: TYPESCRIPT_PARSER_VERSION,
      nodes: [sourceNode],
      edges: [],
      diagnostics: [{ code: "typescript_unavailable", sourcePath, message: "Local TypeScript compiler is unavailable." }],
      status: "error",
    };
  }

  const ts = typescript;
  const sourceFile = ts.createSourceFile(sourcePath, text, ts.ScriptTarget.Latest, true, scriptKindForPath(sourcePath));
  options.checkpoint?.("typescript.ast-created");
  const nodes = new Map();
  const edges = new Map();

  const addNode = (node) => {
    options.checkpoint?.("typescript.nodes");
    if (!nodes.has(node.id)) {
      options.retainRecord?.("node", "typescript.nodes");
      nodes.set(node.id, node);
    }
    return node.id;
  };
  const evidenceFor = (
    astNode,
    ruleId,
    explanation,
    confidence = "high",
    startOffset = astNode.getStart(sourceFile),
  ) => {
    const endOffset = astNode.getEnd();
    const start = sourceFile.getLineAndCharacterOfPosition(startOffset);
    const end = sourceFile.getLineAndCharacterOfPosition(endOffset);
    return {
      sourcePath,
      sourceDigest: contentHash,
      lineStart: start.line + 1,
      lineEnd: end.line + 1,
      columnStart: start.character + 1,
      columnEnd: end.character + 1,
      excerpt: text.slice(startOffset, Math.min(endOffset, startOffset + 320)),
      ruleId,
      explanation,
      parserId: TYPESCRIPT_PARSER_ID,
      parserVersion: TYPESCRIPT_PARSER_VERSION,
      confidence,
    };
  };
  const addEdge = ({ source, target, label, astNode, ruleId, explanation, confidence = "high" }) => {
    options.checkpoint?.("typescript.edges");
    const startOffset = astNode.getStart(sourceFile);
    const edge = makeEdge({
      source,
      target,
      label,
      evidence: evidenceFor(astNode, ruleId, explanation, confidence, startOffset),
      anchor: String(startOffset),
    });
    if (!edges.has(edge.id)) {
      options.retainRecord?.("edge", "typescript.edges");
      edges.set(edge.id, edge);
    }
  };
  addNode(sourceNode);
  const identifierText = (nameNode, fallback) => {
    if (!nameNode) return fallback;
    if (ts.isIdentifier(nameNode) || ts.isStringLiteral(nameNode) || ts.isNumericLiteral(nameNode)) return nameNode.text;
    return nameNode.getText(sourceFile).slice(0, 160);
  };

  function declarationDescriptor(node) {
    if (ts.isClassDeclaration(node)) return { type: "CodeClass", kind: "class", name: identifierText(node.name, "default-class") };
    if (ts.isInterfaceDeclaration(node)) return { type: "CodeInterface", kind: "interface", name: identifierText(node.name, "interface") };
    if (ts.isEnumDeclaration(node)) return { type: "CodeEnum", kind: "enum", name: identifierText(node.name, "enum") };
    if (ts.isTypeAliasDeclaration(node)) return { type: "CodeTypeAlias", kind: "type", name: identifierText(node.name, "type") };
    if (ts.isFunctionDeclaration(node)) return { type: "CodeFunction", kind: "function", name: identifierText(node.name, "default-function") };
    if (ts.isMethodDeclaration(node)) return { type: "CodeMethod", kind: "method", name: identifierText(node.name, "method") };
    if (ts.isConstructorDeclaration(node)) return { type: "CodeMethod", kind: "constructor", name: "constructor" };
    if (ts.isVariableDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      return { type: "CodeFunction", kind: "function", name: identifierText(node.name, "function") };
    }
    return null;
  }

  function visitStructure(node, ownerId, scope) {
    options.checkpoint?.("typescript.ast-walk");
    const descriptor = declarationDescriptor(node);
    let nextOwner = ownerId;
    let nextScope = scope;
    if (descriptor) {
      const qualifiedName = [...scope, descriptor.name].join(".");
      const id = stableEntityId(descriptor.type, sourcePath, `${qualifiedName}:${node.getStart(sourceFile)}`);
      addNode(makeNode({
        id,
        label: descriptor.name,
        type: descriptor.type,
        sourcePath,
        properties: {
          "code:kind": descriptor.kind,
          "code:qualifiedName": qualifiedName,
          "corpus:lineStart": sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
        },
      }));
      addEdge({
        source: ownerId,
        target: id,
        label: ownerId === sourceId ? "declares" : "containsDeclaration",
        astNode: node,
        ruleId: "typescript.declaration.ast",
        explanation: `${ownerId === sourceId ? sourcePath : "The enclosing declaration"} declares ${descriptor.kind} ${qualifiedName}.`,
      });
      nextOwner = id;
      nextScope = [...scope, descriptor.name];
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const moduleName = node.moduleSpecifier.text;
      const dependencyId = stableEntityId("CodeDependency", sourcePath, `${moduleName}:${node.getStart(sourceFile)}`);
      addNode(makeNode({ id: dependencyId, label: moduleName, type: "CodeDependency", sourcePath, properties: { "code:module": moduleName } }));
      addEdge({ source: sourceId, target: dependencyId, label: "imports", astNode: node, ruleId: "typescript.import.ast", explanation: `${sourcePath} imports module ${moduleName}.` });
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const moduleName = node.moduleSpecifier.text;
      const dependencyId = stableEntityId("CodeDependency", sourcePath, `${moduleName}:${node.getStart(sourceFile)}`);
      addNode(makeNode({ id: dependencyId, label: moduleName, type: "CodeDependency", sourcePath, properties: { "code:module": moduleName } }));
      addEdge({ source: sourceId, target: dependencyId, label: "reexports", astNode: node, ruleId: "typescript.reexport.ast", explanation: `${sourcePath} re-exports declarations from module ${moduleName}.` });
    }
    if (ts.isHeritageClause(node) && nextOwner !== sourceId) {
      const label = node.token === ts.SyntaxKind.ExtendsKeyword ? "extends" : "implements";
      for (const typeNode of node.types) {
        const reference = typeNode.expression.getText(sourceFile).slice(0, 180);
        const referenceId = stableEntityId("CodeReference", sourcePath, `${label}:${reference}:${typeNode.getStart(sourceFile)}`);
        addNode(makeNode({ id: referenceId, label: reference, type: "CodeReference", sourcePath, properties: { "code:referenceKind": label } }));
        addEdge({ source: nextOwner, target: referenceId, label, astNode: typeNode, ruleId: `typescript.${label}.ast`, explanation: `The declaration ${label} ${reference}.` });
      }
    }
    if (ts.isCallExpression(node)) {
      const callName = node.expression.getText(sourceFile).slice(0, 200);
      const referenceId = stableEntityId("CodeCallReference", sourcePath, `${callName}:${node.getStart(sourceFile)}`);
      addNode(makeNode({ id: referenceId, label: callName, type: "CodeCallReference", sourcePath, properties: { "code:referenceKind": "call" } }));
      addEdge({ source: nextOwner, target: referenceId, label: "calls", astNode: node.expression, ruleId: "typescript.call.ast", explanation: `${nextOwner === sourceId ? sourcePath : "The enclosing declaration"} calls ${callName}.` });
    }
    ts.forEachChild(node, (child) => visitStructure(child, nextOwner, nextScope));
  }
  visitStructure(sourceFile, sourceId, []);

  const diagnostics = (sourceFile.parseDiagnostics || []).map((diagnostic) => {
    options.checkpoint?.("typescript.diagnostics");
    options.retainRecord?.("diagnostic", "typescript.diagnostics");
    const start = Number.isFinite(diagnostic.start) ? diagnostic.start : 0;
    const position = sourceFile.getLineAndCharacterOfPosition(start);
    return {
      code: "typescript_syntax_error",
      sourcePath,
      lineStart: position.line + 1,
      columnStart: position.character + 1,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
    };
  });
  return {
    parserId: TYPESCRIPT_PARSER_ID,
    parserVersion: TYPESCRIPT_PARSER_VERSION,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    diagnostics,
    status: diagnostics.length ? "partial" : "parsed",
  };
}
