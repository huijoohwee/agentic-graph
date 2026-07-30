import path from "node:path";

import {
  buildEvidence,
  checkKnowledgeGraphBudget,
  compareStableStrings,
  KnowledgeGraphError,
  makeEdge,
} from "./contract.mjs";

const RESOLVER_ID = "local-repository-scoped-resolver";
const RESOLVER_VERSION = "2.0.0";
const CODE_EXTENSIONS = [".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"];

const normalizedLabel = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/^(?:["`\[])|(?:["`\]])$/g, "");

function evidenceFromPremises({
  source,
  premiseEdges,
  ruleId,
  explanation,
  ambiguous,
  candidateIds,
}) {
  const premise = premiseEdges[0]?.properties || {};
  return buildEvidence({
    sourcePath: source.relativePath,
    sourceDigest: source.contentHash,
    lineStart: premise["evidence:lineStart"],
    lineEnd: premise["evidence:lineEnd"],
    columnStart: premise["evidence:columnStart"],
    columnEnd: premise["evidence:columnEnd"],
    excerpt: premise["evidence:excerpt"] || source.relativePath,
    ruleId,
    explanation,
    parserId: RESOLVER_ID,
    parserVersion: RESOLVER_VERSION,
    kind: ambiguous ? "ambiguous" : "inferred",
    certainty: ambiguous ? "ambiguous" : "inferred",
    confidence: ambiguous ? "low" : "high",
    premiseEdgeIds: premiseEdges.map((edge) => edge.id),
    candidateCount: candidateIds.length,
    candidateIds,
  });
}

function appendDerived(derived, edge, repository, maxEdges) {
  if (derived.length >= maxEdges) {
    throw new KnowledgeGraphError("resolution_edge_limit_exceeded", "Repository resolution exceeded its derived-edge limit.", {
      repositoryId: repository.repositoryId,
      maxEdges,
    });
  }
  derived.push(edge);
}

function resolveCodeDependencies(repository, sourceByPath, nodes, edges, checkpoint, maxEdges) {
  const derived = [];
  for (const dependency of nodes
    .filter((node) => node.type === "CodeDependency")
    .sort((left, right) => compareStableStrings(left.id, right.id))) {
    checkpoint();
    const moduleName = String(dependency.properties?.["code:module"] || dependency.label || "");
    if (!moduleName.startsWith(".")) continue;
    const sourcePath = String(dependency.properties?.["corpus:sourcePath"] || "");
    const source = sourceByPath.get(sourcePath);
    if (!source || source.repositoryId !== repository.repositoryId) continue;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), moduleName));
    if (!base || base === ".." || base.startsWith("../")) continue;
    const hasExtension = Boolean(path.posix.extname(base));
    const candidatePaths = hasExtension
      ? [base]
      : [...CODE_EXTENSIONS.map((extension) => `${base}${extension}`), ...CODE_EXTENSIONS.map((extension) => `${base}/index${extension}`)];
    const candidates = candidatePaths
      .map((candidatePath) => sourceByPath.get(candidatePath))
      .filter((candidate) => candidate?.repositoryId === repository.repositoryId)
      .map((candidate) => candidate.sourceNode)
      .filter(Boolean)
      .sort((left, right) => compareStableStrings(left.id, right.id));
    if (!candidates.length) continue;
    const premiseEdges = edges
      .filter((edge) => {
        checkpoint();
        return edge.target === dependency.id && ["imports", "reexports"].includes(edge.label);
      })
      .sort((left, right) => compareStableStrings(left.id, right.id));
    const candidateIds = candidates.map((candidate) => candidate.id);
    for (const target of candidates) {
      checkpoint();
      const ambiguous = candidates.length > 1;
      appendDerived(derived, makeEdge({
        source: dependency.id,
        target: target.id,
        label: "resolvesToSource",
        anchor: `${dependency.id}:${target.id}`,
        evidence: evidenceFromPremises({
          source,
          premiseEdges,
          candidateIds,
          ambiguous,
          ruleId: "resolve.relative-code-import.repository",
          explanation: ambiguous
            ? `Relative module ${moduleName} has ${candidates.length} candidates inside repository ${repository.repositoryPath}; ${target.label} is preserved as one candidate.`
            : `Relative module ${moduleName} resolves to ${target.label} inside repository ${repository.repositoryPath}.`,
        }),
      }), repository, maxEdges);
    }
  }
  return derived;
}

function resolveSqlReferences(repository, sourceByPath, nodes, edges, checkpoint, maxEdges) {
  const exactTables = new Map();
  const shortTables = new Map();
  for (const node of nodes.filter((candidate) => candidate.type === "SqlTable")) {
    checkpoint();
    const full = normalizedLabel(node.properties?.["sql:qualifiedName"] || node.label);
    const short = full.split(".").at(-1);
    exactTables.set(full, [...(exactTables.get(full) || []), node]);
    shortTables.set(short, [...(shortTables.get(short) || []), node]);
  }
  const derived = [];
  for (const reference of nodes
    .filter((node) => node.type === "SqlTableReference")
    .sort((left, right) => compareStableStrings(left.id, right.id))) {
    checkpoint();
    const sourcePath = String(reference.properties?.["corpus:sourcePath"] || "");
    const source = sourceByPath.get(sourcePath);
    if (!source || source.repositoryId !== repository.repositoryId) continue;
    const full = normalizedLabel(reference.properties?.["sql:qualifiedName"] || reference.label);
    const candidateSet = new Map();
    const candidates = full.includes(".") ? exactTables.get(full) || [] : shortTables.get(full) || [];
    for (const candidate of candidates) candidateSet.set(candidate.id, candidate);
    const sorted = [...candidateSet.values()].sort((left, right) => compareStableStrings(left.id, right.id));
    if (!sorted.length) continue;
    const premiseEdges = edges.filter((edge) => {
      checkpoint();
      return edge.target === reference.id;
    }).sort((left, right) => compareStableStrings(left.id, right.id));
    const candidateIds = sorted.map((candidate) => candidate.id);
    for (const target of sorted) {
      checkpoint();
      const ambiguous = sorted.length > 1;
      appendDerived(derived, makeEdge({
        source: reference.id,
        target: target.id,
        label: "resolvesTo",
        anchor: `${reference.id}:${target.id}`,
        evidence: evidenceFromPremises({
          source,
          premiseEdges,
          candidateIds,
          ambiguous,
          ruleId: "resolve.sql-table.repository-qualified",
          explanation: ambiguous
            ? `SQL reference ${reference.label} has ${sorted.length} repository-scoped candidates; ${target.label} is preserved as one candidate.`
            : `SQL reference ${reference.label} resolves to ${target.label} inside repository ${repository.repositoryPath}.`,
        }),
      }), repository, maxEdges);
    }
  }
  return derived;
}

function resolveDocumentLinks(repository, sourceByPath, nodes, edges, checkpoint, maxEdges) {
  const derived = [];
  for (const reference of nodes.filter((node) => node.type === "DocumentLinkReference")) {
    checkpoint();
    const targetValue = String(reference.properties?.["doc:target"] || "");
    if (!targetValue || /^[a-z][a-z0-9+.-]*:/i.test(targetValue) || targetValue.startsWith("#")) continue;
    const sourcePath = String(reference.properties?.["corpus:sourcePath"] || "");
    const source = sourceByPath.get(sourcePath);
    if (!source || source.repositoryId !== repository.repositoryId) continue;
    const withoutAnchor = targetValue.split("#")[0].split("?")[0];
    const resolvedPath = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), withoutAnchor));
    const target = sourceByPath.get(resolvedPath);
    if (!target?.sourceNode || target.repositoryId !== repository.repositoryId) continue;
    const premiseEdges = edges.filter((edge) => {
      checkpoint();
      return edge.target === reference.id;
    }).sort((left, right) => compareStableStrings(left.id, right.id));
    appendDerived(derived, makeEdge({
      source: reference.id,
      target: target.sourceNode.id,
      label: "resolvesToSource",
      anchor: `${reference.id}:${target.sourceNode.id}`,
      evidence: evidenceFromPremises({
        source,
        premiseEdges,
        candidateIds: [target.sourceNode.id],
        ambiguous: false,
        ruleId: "resolve.document-link.repository",
        explanation: `Document link ${targetValue} resolves to ${resolvedPath} inside repository ${repository.repositoryPath}.`,
      }),
    }), repository, maxEdges);
  }
  return derived;
}

export function buildRepositoryScopedResolutionEdges(sources, fragments, options = {}) {
  let operations = 0;
  const checkpoint = () => {
    operations += 1;
    if (operations % 128 === 0) {
      checkKnowledgeGraphBudget({
        abortSignal: options.abortSignal,
        deadline: options.deadline,
        stage: "repository-resolution",
        details: { operations },
      });
    }
  };
  const maxEdges = 200_000;
  checkKnowledgeGraphBudget({ ...options, stage: "repository-resolution" });
  const sourceByPath = new Map();
  for (const source of sources) {
    checkpoint();
    const fragment = fragments.get(source.relativePath);
    sourceByPath.set(source.relativePath, {
      ...source,
      sourceNode: fragment?.nodes?.find((node) => node.type === "SourceFile"),
    });
  }
  const byRepository = new Map();
  const repositories = [...new Map(sources.map((source) => [
    source.repositoryId,
    { repositoryId: source.repositoryId, repositoryPath: source.repositoryPath },
  ])).values()].sort((left, right) => compareStableStrings(left.repositoryPath, right.repositoryPath));
  for (const repository of repositories) {
    checkpoint();
    const paths = new Set(sources.filter((source) => source.repositoryId === repository.repositoryId).map((source) => source.relativePath));
    const scopedFragments = [...paths].map((sourcePath) => fragments.get(sourcePath)).filter(Boolean);
    const nodes = scopedFragments.flatMap((fragment) => (checkpoint(), fragment.nodes));
    const edges = scopedFragments.flatMap((fragment) => (checkpoint(), fragment.edges));
    const derived = [
      ...resolveCodeDependencies(repository, sourceByPath, nodes, edges, checkpoint, maxEdges),
      ...resolveSqlReferences(repository, sourceByPath, nodes, edges, checkpoint, maxEdges),
      ...resolveDocumentLinks(repository, sourceByPath, nodes, edges, checkpoint, maxEdges),
    ].sort((left, right) => compareStableStrings(left.id, right.id));
    if (derived.length > maxEdges) {
      throw new KnowledgeGraphError("resolution_edge_limit_exceeded", "Repository resolution exceeded its derived-edge limit.", {
        repositoryId: repository.repositoryId,
        maxEdges,
      });
    }
    byRepository.set(repository.repositoryId, derived);
  }
  return byRepository;
}
