import path from "node:path";

import {
  buildEvidence,
  checkKnowledgeGraphBudget,
  compareStableStrings,
  KnowledgeGraphError,
  makeEdge,
} from "./contract.mjs";
import {
  createResolutionRetentionBudget,
  retainResolutionRecord,
} from "./resolution-retention.mjs";

const RESOLVER_ID = "local-repository-scoped-resolver";
const RESOLVER_VERSION = "2.0.0";
const CODE_EXTENSIONS = [".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"];
const CODE_PREMISE_LABELS = new Set(["imports", "reexports"]);
const MAX_DERIVED_EDGES = 200_000;
const MAX_EVIDENCE_CANDIDATE_IDS = 64;

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
  candidateCount = candidateIds.length,
  targetId,
}) {
  const premise = premiseEdges[0]?.properties || {};
  const retainedCandidateIds = candidateIds.slice(0, MAX_EVIDENCE_CANDIDATE_IDS);
  if (targetId && !retainedCandidateIds.includes(targetId)) {
    retainedCandidateIds[retainedCandidateIds.length - 1] = targetId;
    retainedCandidateIds.sort(compareStableStrings);
  }
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
    candidateCount,
    candidateIds: retainedCandidateIds,
  });
}

function appendDerived(derived, edge, repository, derivedBudget, retentionBudget) {
  if (derivedBudget.count >= derivedBudget.maxEdges) {
    throw new KnowledgeGraphError("resolution_edge_limit_exceeded", "Repository resolution exceeded its derived-edge limit.", {
      repositoryId: repository.repositoryId,
      maxEdges: derivedBudget.maxEdges,
    });
  }
  retainResolutionRecord(
    retentionBudget,
    edge.properties["evidence:sourcePath"],
    edge,
    {
      recordKind: "derived-edge",
      repositoryId: repository.repositoryId,
    },
  );
  derived.push(edge);
  derivedBudget.count += 1;
}

function premiseEdgesFor(premiseEdgesByTarget, targetId, labels = null) {
  const premiseEdges = premiseEdgesByTarget.get(targetId) || [];
  return labels ? premiseEdges.filter((edge) => labels.has(edge.label)) : premiseEdges;
}

function resolveCodeDependencies(
  repository,
  sourceByPath,
  dependencies,
  premiseEdgesByTarget,
  derived,
  checkpoint,
  derivedBudget,
  retentionBudget,
) {
  for (const dependency of dependencies.sort((left, right) => compareStableStrings(left.id, right.id))) {
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
    const premiseEdges = premiseEdgesFor(
      premiseEdgesByTarget,
      dependency.id,
      CODE_PREMISE_LABELS,
    );
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
          targetId: target.id,
          ambiguous,
          ruleId: "resolve.relative-code-import.repository",
          explanation: ambiguous
            ? `Relative module ${moduleName} has ${candidates.length} candidates inside repository ${repository.repositoryPath}; ${target.label} is preserved as one candidate.`
            : `Relative module ${moduleName} resolves to ${target.label} inside repository ${repository.repositoryPath}.`,
        }),
      }), repository, derivedBudget, retentionBudget);
    }
  }
}

function resolveSqlReferences(
  repository,
  sourceByPath,
  tables,
  references,
  premiseEdgesByTarget,
  derived,
  checkpoint,
  derivedBudget,
  retentionBudget,
) {
  const exactTables = new Map();
  const shortTables = new Map();
  for (const node of tables) {
    checkpoint();
    const full = normalizedLabel(node.properties?.["sql:qualifiedName"] || node.label);
    const short = full.split(".").at(-1);
    exactTables.set(full, [...(exactTables.get(full) || []), node]);
    shortTables.set(short, [...(shortTables.get(short) || []), node]);
  }
  for (const reference of references.sort((left, right) => compareStableStrings(left.id, right.id))) {
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
    const premiseEdges = premiseEdgesFor(premiseEdgesByTarget, reference.id);
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
          targetId: target.id,
          ambiguous,
          ruleId: "resolve.sql-table.repository-qualified",
          explanation: ambiguous
            ? `SQL reference ${reference.label} has ${sorted.length} repository-scoped candidates; ${target.label} is preserved as one candidate.`
            : `SQL reference ${reference.label} resolves to ${target.label} inside repository ${repository.repositoryPath}.`,
        }),
      }), repository, derivedBudget, retentionBudget);
    }
  }
}

function resolveDocumentLinks(
  repository,
  sourceByPath,
  references,
  premiseEdgesByTarget,
  derived,
  checkpoint,
  derivedBudget,
  retentionBudget,
) {
  for (const reference of references) {
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
    const premiseEdges = premiseEdgesFor(premiseEdgesByTarget, reference.id);
    appendDerived(derived, makeEdge({
      source: reference.id,
      target: target.sourceNode.id,
      label: "resolvesToSource",
      anchor: `${reference.id}:${target.sourceNode.id}`,
      evidence: evidenceFromPremises({
        source,
        premiseEdges,
        candidateIds: [target.sourceNode.id],
        targetId: target.sourceNode.id,
        ambiguous: false,
        ruleId: "resolve.document-link.repository",
        explanation: `Document link ${targetValue} resolves to ${resolvedPath} inside repository ${repository.repositoryPath}.`,
      }),
    }), repository, derivedBudget, retentionBudget);
  }
}

function indexResolutionFragments(paths, fragments, checkpoint) {
  const indexed = {
    codeDependencies: [],
    documentReferences: [],
    premiseEdgesByTarget: new Map(),
    sqlReferences: [],
    tables: [],
  };
  for (const sourcePath of paths) {
    const fragment = fragments.get(sourcePath);
    if (!fragment) continue;
    for (const node of fragment.nodes) {
      checkpoint();
      if (node.type === "CodeDependency") indexed.codeDependencies.push(node);
      else if (node.type === "DocumentLinkReference") indexed.documentReferences.push(node);
      else if (node.type === "SqlTableReference") indexed.sqlReferences.push(node);
      else if (node.type === "SqlTable") indexed.tables.push(node);
    }
    for (const edge of fragment.edges) {
      checkpoint();
      const premiseEdges = indexed.premiseEdgesByTarget.get(edge.target);
      if (premiseEdges) premiseEdges.push(edge);
      else indexed.premiseEdgesByTarget.set(edge.target, [edge]);
    }
  }
  for (const premiseEdges of indexed.premiseEdgesByTarget.values()) {
    checkpoint();
    premiseEdges.sort((left, right) => compareStableStrings(left.id, right.id));
  }
  return indexed;
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
  const requestedMaxEdges = Number(options.maxEdges);
  const maxEdges = Number.isFinite(requestedMaxEdges) && requestedMaxEdges > 0
    ? Math.min(MAX_DERIVED_EDGES, Math.floor(requestedMaxEdges))
    : MAX_DERIVED_EDGES;
  const derivedBudget = { count: 0, maxEdges };
  const retentionBudget = options.retentionBudget || createResolutionRetentionBudget({
    maxBytes: options.maxResolutionBytes,
    maxRecords: options.maxResolutionRecords,
  });
  checkKnowledgeGraphBudget({ ...options, stage: "repository-resolution" });
  const sourceByPath = new Map();
  const repositoriesById = new Map();
  const pathsByRepository = new Map();
  for (const source of sources) {
    checkpoint();
    const fragment = fragments.get(source.relativePath);
    sourceByPath.set(source.relativePath, {
      ...source,
      sourceNode: fragment?.nodes?.find((node) => node.type === "SourceFile"),
    });
    repositoriesById.set(source.repositoryId, {
      repositoryId: source.repositoryId,
      repositoryPath: source.repositoryPath,
    });
    const repositoryPaths = pathsByRepository.get(source.repositoryId);
    if (repositoryPaths) repositoryPaths.add(source.relativePath);
    else pathsByRepository.set(source.repositoryId, new Set([source.relativePath]));
  }
  const byRepository = new Map();
  const repositories = [...repositoriesById.values()]
    .sort((left, right) => compareStableStrings(left.repositoryPath, right.repositoryPath));
  for (const repository of repositories) {
    checkpoint();
    const indexed = indexResolutionFragments(
      pathsByRepository.get(repository.repositoryId) || new Set(),
      fragments,
      checkpoint,
    );
    const derived = [];
    resolveCodeDependencies(
      repository,
      sourceByPath,
      indexed.codeDependencies,
      indexed.premiseEdgesByTarget,
      derived,
      checkpoint,
      derivedBudget,
      retentionBudget,
    );
    resolveSqlReferences(
      repository,
      sourceByPath,
      indexed.tables,
      indexed.sqlReferences,
      indexed.premiseEdgesByTarget,
      derived,
      checkpoint,
      derivedBudget,
      retentionBudget,
    );
    resolveDocumentLinks(
      repository,
      sourceByPath,
      indexed.documentReferences,
      indexed.premiseEdgesByTarget,
      derived,
      checkpoint,
      derivedBudget,
      retentionBudget,
    );
    derived.sort((left, right) => compareStableStrings(left.id, right.id));
    byRepository.set(repository.repositoryId, derived);
  }
  return byRepository;
}
