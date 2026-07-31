import {
  buildEvidence,
  makeEdge,
  makeNode,
  spanFromOffsets,
  stableEntityId,
} from "./contract.mjs";
import { compileDeclarativeGrammar } from "./declarative-grammar-parser.mjs";

export function parseDeclarativeGrammarGraph({
  descriptor,
  options = {},
  parserId,
  parserVersion,
  source,
  sourceNode,
}) {
  const compiled = compileDeclarativeGrammar(descriptor.grammar);
  const text = String(source.text || "");
  const root = compiled.parse(text, options);
  const nodes = new Map([[sourceNode.id, sourceNode]]);
  const edges = new Map();
  const retainNode = (node, stage) => {
    if (!nodes.has(node.id)) {
      options.retainRecord?.("node", stage);
      nodes.set(node.id, node);
    }
  };
  const retainEdge = (edge, stage) => {
    if (!edges.has(edge.id)) {
      options.retainRecord?.("edge", stage);
      edges.set(edge.id, edge);
    }
  };
  const visit = (astNode, parentId, parentRule, pathKey) => {
    options.checkpoint?.("declarative-grammar.graph");
    const isToken = astNode.kind === "token";
    const identity = isToken ? astNode.tokenId : astNode.ruleId;
    const type = isToken ? "SyntaxToken" : "SyntaxNode";
    const id = stableEntityId(
      type,
      source.relativePath,
      `${pathKey}:${identity}:${astNode.startOffset}:${astNode.endOffset}`,
    );
    const span = spanFromOffsets(text, astNode.startOffset, astNode.endOffset);
    retainNode(makeNode({
      id,
      label: astNode.capture || identity,
      type,
      sourcePath: source.relativePath,
      properties: {
        "syntax:grammarDigest": compiled.digest,
        ...(isToken
          ? {
              "syntax:tokenId": astNode.tokenId,
              "syntax:value": astNode.value.slice(0, 160),
            }
          : {
              "syntax:ruleId": astNode.ruleId,
              "syntax:alternative": astNode.alternative,
            }),
        ...(astNode.capture ? { "syntax:capture": astNode.capture } : {}),
        "corpus:lineStart": span.lineStart,
        "corpus:lineEnd": span.lineEnd,
        "corpus:columnStart": span.columnStart,
        "corpus:columnEnd": span.columnEnd,
      },
    }), "declarative-grammar.nodes");
    const rootEdge = parentId === sourceNode.id;
    const evidence = buildEvidence({
      sourcePath: source.relativePath,
      sourceDigest: source.contentHash,
      text,
      startOffset: astNode.startOffset,
      endOffset: astNode.endOffset,
      ruleId: rootEdge
        ? `declarative-grammar.${compiled.digest.slice(0, 16)}.root`
        : `declarative-grammar.${compiled.digest.slice(0, 16)}.${parentRule}.${identity}`,
      explanation: rootEdge
        ? `${source.relativePath} parses as grammar root ${identity}.`
        : `${parentRule} contains ${isToken ? "token" : "syntax rule"} ${identity} according to the verified declarative grammar.`,
      parserId,
      parserVersion,
    });
    retainEdge(makeEdge({
      source: parentId,
      target: id,
      label: rootEdge
        ? "hasSyntaxTree"
        : isToken ? "containsSyntaxToken" : "containsSyntaxNode",
      evidence,
      properties: {
        "syntax:grammarDigest": compiled.digest,
        ...(astNode.capture ? { "syntax:capture": astNode.capture } : {}),
      },
      anchor: pathKey,
    }), "declarative-grammar.edges");
    if (!isToken) {
      astNode.children.forEach((child, index) => (
        visit(child, id, astNode.ruleId, `${pathKey}.${index}`)
      ));
    }
  };
  visit(root, sourceNode.id, "source", "0");
  return {
    parserId,
    parserVersion,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    diagnostics: [],
    status: "parsed",
  };
}
