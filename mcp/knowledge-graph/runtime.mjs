import fs from "node:fs/promises";
import path from "node:path";

import {
  checkKnowledgeGraphBudget,
  createKnowledgeGraphDeadline,
  KnowledgeGraphError,
  compareStableStrings,
  knowledgeGraphFailure,
  remainingKnowledgeGraphDuration,
  sha256,
} from "./contract.mjs";
import {
  discoverKnowledgeSources,
  hydrateKnowledgeSource,
  resolveRealDirectory,
} from "./discovery.mjs";
import {
  parseKnowledgeSource,
  parserDescriptorForSource,
  parserLimitFragmentForSource,
} from "./parsers.mjs";
import { runKnowledgeGraphObjectTransaction } from "./object-transaction.mjs";
import {
  explainKnowledgeGraphSnapshotEdge,
  projectKnowledgeGraphSnapshot,
  queryKnowledgeGraphSnapshot,
} from "./query.mjs";
import { acquireRepositoryUrl } from "./repository-acquisition.mjs";
import { buildRepositoryScopedResolutionEdges } from "./resolution.mjs";
import {
  createResolutionRetentionBudget,
  fragmentForResolution,
  retainResolutionFragment,
} from "./resolution-retention.mjs";
import { SOURCE_PARSER_REGISTRY } from "./source-parser-registry.mjs";
import { persistKnowledgeGraphSource } from "./source-persistence.mjs";
import {
  sourceArtifactByteLimit,
  sourceArtifactRecordLimit,
  sourcePartCountLimit,
} from "./source-sharding.mjs";
import {
  ensureKnowledgeGraphStorageRoot,
  knowledgeGraphSourceShardByteLimit,
  listKnowledgeGraphSourceEntries,
  readKnowledgeGraphSnapshot,
  readKnowledgeGraphSnapshotIfPresent,
  readKnowledgeGraphSourceParts,
  writeKnowledgeGraphSnapshotAtomic,
} from "./store.mjs";

export const KNOWLEDGE_GRAPH_TOOL_NAMES = Object.freeze({
  ingest: "knowgrph.knowledge_graph.ingest",
  query: "knowgrph.knowledge_graph.query",
  explainEdge: "knowgrph.knowledge_graph.explain_edge",
});

const RESULT_SCHEMAS = Object.freeze({
  ingest: "knowgrph-knowledge-graph-ingest/v1",
  query: "knowgrph-knowledge-graph-query/v1",
  explain_edge: "knowgrph-knowledge-graph-explain-edge/v1",
});

const GRAPH_ID = /^kg:graph:[a-f0-9]{32}$/;
const ingestTails = new Map();
const success = (operation, payload) => ({ schema: RESULT_SCHEMAS[operation], ok: true, operation, ...payload });
const failure = (operation, error) => ({ schema: RESULT_SCHEMAS[operation], operation, ...knowledgeGraphFailure(error) });

function pathIsInside(candidatePath, rootPath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function resolveAllowedRoots(deps, budget = {}) {
  const roots = [deps.knowgrphRoot, ...(Array.isArray(deps.allowedRoots) ? deps.allowedRoots : [])].filter(Boolean);
  const resolved = [];
  for (const root of roots) {
    checkKnowledgeGraphBudget({ ...budget, stage: "allowed-root-resolution" });
    const real = await resolveRealDirectory(root, { ...budget, stage: "allowed-root-resolution" });
    if (!resolved.includes(real)) resolved.push(real);
  }
  if (!resolved.length) throw new KnowledgeGraphError("allowed_roots_required", "At least one host-owned allowed root is required.");
  return resolved;
}

async function assertLocalRootAllowed(rootPathRaw, deps, budget = {}) {
  const rootPath = await resolveRealDirectory(rootPathRaw, { ...budget, stage: "input-root-resolution" });
  const allowedRoots = await resolveAllowedRoots(deps, budget);
  if (!allowedRoots.some((allowed) => pathIsInside(rootPath, allowed))) {
    throw new KnowledgeGraphError("root_outside_allowed_roots", "rootPath is outside the host-owned allowed roots.");
  }
  return rootPath;
}

async function resolveOutputRoot(deps, budget = {}) {
  const configured = path.resolve(deps.outputRoot || path.join(deps.knowgrphRoot, "data", "outputs", "knowledge-graph"));
  let ancestor = configured;
  const tail = [];
  while (true) {
    checkKnowledgeGraphBudget({ ...budget, stage: "output-root-resolution" });
    try {
      const real = await fs.realpath(ancestor);
      checkKnowledgeGraphBudget({ ...budget, stage: "output-root-resolution" });
      const resolved = path.resolve(real, ...tail);
      if (!pathIsInside(resolved, real)) throw new KnowledgeGraphError("output_outside_output_root", "Output root is invalid.");
      return resolved;
    } catch (error) {
      if (error instanceof KnowledgeGraphError) throw error;
    }
    const parent = path.dirname(ancestor);
    if (parent === ancestor) return configured;
    tail.unshift(path.basename(ancestor));
    ancestor = parent;
  }
}

const graphIdFor = (identity) => `kg:graph:${sha256(identity).slice(0, 32)}`;
const graphPointerPath = (outputRoot, graphId) => path.join(outputRoot, "graphs", `${graphId.slice("kg:graph:".length)}.json`);

async function resolveIngestSource(args, deps, abortSignal, deadline) {
  const budget = { abortSignal, deadline };
  checkKnowledgeGraphBudget({ ...budget, stage: "source-resolution" });
  const hasRoot = Boolean(String(args.rootPath || "").trim());
  const hasUrl = Boolean(String(args.repositoryUrl || "").trim());
  if (hasRoot === hasUrl) {
    throw new KnowledgeGraphError("source_identity_required", "Provide exactly one of rootPath or repositoryUrl.");
  }
  const outputRoot = await resolveOutputRoot(deps, budget);
  if (hasUrl) {
    const canonicalOutputRoot = await ensureKnowledgeGraphStorageRoot(outputRoot);
    checkKnowledgeGraphBudget({ ...budget, stage: "repository-acquisition-root" });
    const requestedTimeout = Number(args.acquisitionTimeoutMs);
    const remaining = Math.max(1, remainingKnowledgeGraphDuration(deadline));
    const acquired = await acquireRepositoryUrl({
      repositoryUrl: args.repositoryUrl,
      repositoryRef: args.repositoryRef,
      cacheRoot: path.join(canonicalOutputRoot, "acquisitions"),
      allowedRoot: canonicalOutputRoot,
      abortSignal,
      timeoutMs: Number.isFinite(requestedTimeout) && requestedTimeout > 0
        ? Math.min(requestedTimeout, remaining)
        : remaining,
    });
    checkKnowledgeGraphBudget({ ...budget, stage: "repository-acquisition" });
    return {
      rootPath: acquired.rootPath,
      outputRoot: canonicalOutputRoot,
      graphId: graphIdFor(`repository-url\0${acquired.identity.repositoryUrl}\0${acquired.identity.ref}\0${acquired.identity.subpath}`),
      acquisition: acquired.identity,
    };
  }
  const rootPath = await assertLocalRootAllowed(args.rootPath, deps, budget);
  if (rootPath === outputRoot) {
    throw new KnowledgeGraphError("output_root_matches_input_root", "The generated-output root must not equal the indexed corpus root.");
  }
  return {
    rootPath,
    outputRoot,
    graphId: graphIdFor(`local-directory\0${rootPath}`),
    acquisition: { mode: "local-directory", networkRequests: 0, complete: true },
  };
}

async function serializeIngest(graphId, operation, budget = {}) {
  const previous = ingestTails.get(graphId);
  let release;
  const tail = new Promise((resolve) => { release = resolve; });
  ingestTails.set(graphId, tail);
  if (previous) {
    await previous;
    checkKnowledgeGraphBudget({ ...budget, stage: "ingest-queue" });
  }
  try {
    return await operation();
  } finally {
    release();
    if (ingestTails.get(graphId) === tail) ingestTails.delete(graphId);
  }
}

async function reusableFragment(previousSnapshot, entry, budget = {}) {
  if (!previousSnapshot || !entry) return null;
  checkKnowledgeGraphBudget({ ...budget, stage: "source-shard-reuse" });
  const relevantTypes = new Set([
    "CodeDependency",
    "DocumentLinkReference",
    "SourceFile",
    "SqlTable",
    "SqlTableReference",
  ]);
  const nodes = [];
  const edges = [];
  const nodeIds = new Set();
  for await (const part of readKnowledgeGraphSourceParts(previousSnapshot, entry)) {
    for (const node of part.nodes || []) {
      if (relevantTypes.has(node.type)) {
        nodes.push(node);
        nodeIds.add(node.id);
      }
    }
    for (const edge of part.edges || []) {
      if (nodeIds.has(edge.target)) edges.push(edge);
    }
  }
  checkKnowledgeGraphBudget({ ...budget, stage: "source-shard-reuse" });
  return {
    nodes,
    edges,
    status: entry.status,
  };
}

function createPeriodicCheckpoint(abortSignal, deadline, stage) {
  let operations = 0;
  const checkpoint = () => {
    operations += 1;
    if (operations % 128 === 0) {
      checkKnowledgeGraphBudget({ abortSignal, deadline, stage, details: { operations } });
    }
  };
  checkpoint.force = () => checkKnowledgeGraphBudget({
    abortSignal,
    deadline,
    stage,
    details: { operations },
  });
  return checkpoint;
}

function createOperationAbortSignal(deadline, externalSignal) {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) onExternalAbort();
  else externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error("knowledge graph deadline exceeded")),
    Math.max(1, remainingKnowledgeGraphDuration(deadline)),
  );
  timer.unref?.();
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
}

function unavailableProjection(snapshot, limitRaw) {
  const numericLimit = Number(limitRaw);
  const limit = Number.isFinite(numericLimit)
    ? Math.max(1, Math.min(1000, Math.floor(numericLimit)))
    : 200;
  return {
    token: `kg:projection:${sha256(`${snapshot.pointer.snapshotDigest}\0${limit}`).slice(0, 24)}`,
    readOnly: true,
    graphData: {
      context: "knowgrph-knowledge-graph-projection",
      type: "Graph",
      nodes: [],
      edges: [],
    },
    complete: false,
    truncated: true,
    limit,
    reason: "projection_unavailable",
  };
}

function assertExpectedSnapshot(args, snapshot) {
  const expected = String(args.expectedSnapshotDigest || "").trim();
  if (!expected) throw new KnowledgeGraphError("expected_snapshot_digest_required", "expectedSnapshotDigest is required.");
  if (expected !== snapshot.pointer.snapshotDigest) {
    throw new KnowledgeGraphError("stale_snapshot_digest", "Knowledge graph snapshot digest does not match the caller's expected digest.", {
      expectedSnapshotDigest: expected,
      actualSnapshotDigest: snapshot.pointer.snapshotDigest,
    });
  }
}

async function ingestResolvedTransaction(
  args,
  deps,
  abortSignal,
  deadline,
  resolved,
  objectTransaction,
) {
  const budget = { abortSignal, deadline };
  checkKnowledgeGraphBudget({ ...budget, stage: "ingest-start" });
  const pointerPath = graphPointerPath(resolved.outputRoot, resolved.graphId);
  const strict = args.strict !== false;
  const useCache = args.useCache !== false;
  const previousSnapshot = useCache
    ? await readKnowledgeGraphSnapshotIfPresent(pointerPath, {
      allowedRoot: resolved.outputRoot,
      expectedGraphId: resolved.graphId,
      ...budget,
    })
    : null;
  checkKnowledgeGraphBudget({ ...budget, stage: "previous-snapshot-read" });
  const previousEntries = new Map(
    (previousSnapshot ? await listKnowledgeGraphSourceEntries(previousSnapshot) : [])
      .map((entry) => [entry.sourcePath, entry]),
  );
  checkKnowledgeGraphBudget({ ...budget, stage: "previous-source-index-read" });
  const outputExclusion = pathIsInside(resolved.outputRoot, resolved.rootPath)
    ? `${path.relative(resolved.rootPath, resolved.outputRoot).replaceAll("\\", "/")}/**`
    : "";
  const discovered = await discoverKnowledgeSources({
    rootPath: resolved.rootPath,
    include: args.include,
    exclude: [...(Array.isArray(args.exclude) ? args.exclude : []), ...(outputExclusion ? [outputExclusion] : [])],
    maxFiles: args.maxFiles,
    maxFileBytes: args.maxFileBytes,
    maxTotalBytes: args.maxTotalBytes,
    maxDurationMs: args.maxDurationMs,
    abortSignal,
    deadline,
  });
  const fragments = new Map();
  const sourceEntries = [];
  const sourceShardByteLimit = knowledgeGraphSourceShardByteLimit(deps.maxSourceShardBytes);
  const sourceByteLimit = sourceArtifactByteLimit(deps.maxSourceArtifactBytes);
  const sourceRecordLimit = sourceArtifactRecordLimit(deps.maxSourceArtifactRecords);
  const partCountLimit = sourcePartCountLimit(deps.maxSourceParts);
  const resolutionRetention = createResolutionRetentionBudget({
    maxBytes: args.maxResolutionBytes,
    maxRecords: args.maxResolutionRecords,
  });
  let parsed = 0;
  let reused = 0;
  const parserCheckpoint = createPeriodicCheckpoint(abortSignal, deadline, "source-parsing");
  for (const source of discovered.sources) {
    parserCheckpoint.force();
    const descriptor = parserDescriptorForSource(source, deps);
    const previous = previousEntries.get(source.relativePath);
    const reusable = useCache
      && previous?.status !== "limited"
      && previous?.contentHash === source.contentHash
      && previous?.parserId === descriptor.parserId
      && previous?.parserVersion === descriptor.parserVersion
      && previous?.repositoryId === source.repositoryId
      && previous?.repositoryPath === source.repositoryPath
      && Number.isSafeInteger(previous?.maxPartBytes)
      && previous.maxPartBytes <= sourceShardByteLimit
      && Number.isSafeInteger(previous?.sourceArtifactBytes)
      && previous.sourceArtifactBytes <= sourceByteLimit
      && Number.isSafeInteger(previous?.sourceArtifactRecords)
      && previous.sourceArtifactRecords <= sourceRecordLimit
      && Number(previous.nodePartCount || 0) + Number(previous.edgePartCount || 0) <= partCountLimit
      ? await reusableFragment(previousSnapshot, previous, budget)
      : null;
    let fragment = null;
    if (!reusable) {
      const hydrated = await hydrateKnowledgeSource(source, {
        rootPath: resolved.rootPath,
        maxFileBytes: args.maxFileBytes,
        abortSignal,
        deadline,
      });
      try {
        fragment = await parseKnowledgeSource(hydrated, {
          ...deps,
          abortSignal,
          deadline,
          checkpoint: parserCheckpoint,
          maxParserNodes: args.maxParserNodes,
          maxParserEdges: args.maxParserEdges,
          maxParserRecords: args.maxParserRecords,
        });
      } catch (error) {
        if (strict || !(error instanceof KnowledgeGraphError)
          || ![
            "parser_operation_limit_exceeded",
            "parser_record_limit_exceeded",
          ].includes(error.code)) throw error;
        fragment = parserLimitFragmentForSource(hydrated, deps, error);
      }
    }
    parserCheckpoint.force();
    const persisted = await persistKnowledgeGraphSource({
      source,
      fragment: fragment || {
        parserId: previous.parserId,
        parserVersion: previous.parserVersion,
        nodes: [],
        edges: [],
        diagnostics: previous.diagnostics,
        status: previous.status,
      },
      reusableEntry: reusable ? previous : null,
      strict,
      pointerPath, outputRoot: resolved.outputRoot, objectTransaction,
      deps, budget, checkpoint: parserCheckpoint,
    });
    const annotated = persisted.fragment;
    const resolutionFragment = reusable
      ? reusable
      : fragmentForResolution(annotated, parserCheckpoint);
    retainResolutionFragment(resolutionRetention, source.relativePath, resolutionFragment);
    fragments.set(source.relativePath, resolutionFragment);
    sourceEntries.push(persisted.sourceEntry);
    if (reusable) reused += 1;
    else parsed += 1;
  }

  const incomplete = [...fragments.entries()]
    .filter(([, fragment]) => fragment.status !== "parsed");
  const incompleteSources = [...new Set([
    ...(discovered.admission.incompleteSources || []),
    ...incomplete.map(([sourcePath]) => sourcePath),
  ])].sort(compareStableStrings);
  const completenessReasons = [...new Set([
    ...(discovered.admission.reasons || []),
    ...incomplete.map(([, fragment]) => `parser_${String(fragment.status || "unknown")}`),
    ...(resolved.acquisition?.complete === false ? ["acquisition_incomplete"] : []),
  ])].sort(compareStableStrings);
  const complete = discovered.admission.complete === true
    && resolved.acquisition?.complete !== false
    && incompleteSources.length === 0;
  const completeness = {
    complete,
    admission: discovered.admission,
    incompleteSources,
    reasons: completenessReasons,
  };
  if (strict && !complete) {
    throw new KnowledgeGraphError(
      "strict_ingest_incomplete",
      "Strict ingestion preserved the previous ready snapshot because source parsing was incomplete.",
      {
        complete: false,
        sources: incompleteSources,
        reasons: completenessReasons,
        previousReadySnapshotPreserved: Boolean(previousSnapshot),
      },
    );
  }
  await discovered.revalidateAdmission();
  const derivedEdgesByRepository = buildRepositoryScopedResolutionEdges(
    discovered.sources,
    fragments,
    { ...budget, retentionBudget: resolutionRetention },
  );
  parserCheckpoint.force();
  const rootContentHash = sha256(sourceEntries.map((entry) => (
    `${entry.sourcePath}\0${entry.contentHash}\0${entry.parserId}\0${entry.parserVersion}`
  )).sort(compareStableStrings).join("\n"));
  const currentPaths = new Set(discovered.sources.map((source) => source.relativePath));
  const deletedPaths = [...previousEntries.keys()]
    .filter((sourcePath) => !currentPaths.has(sourcePath))
    .sort(compareStableStrings);
  completeness.deletedPaths = deletedPaths;
  const ready = discovered.sources.filter((source) => source.status === "ready").length;
  const skipped = discovered.sources.filter((source) => source.status === "skipped").length;
  const unsupported = discovered.sources.filter((source) => source.status === "unsupported").length;
  const snapshot = await writeKnowledgeGraphSnapshotAtomic(pointerPath, {
    graphId: resolved.graphId,
    sourceEntries,
    derivedEdgesByRepository,
    diagnostics: discovered.diagnostics,
    rootContentHash,
    admission: discovered.admission,
    completeness,
    parserRegistryDigest: SOURCE_PARSER_REGISTRY.digest,
  }, {
    allowedRoot: resolved.outputRoot,
    objectTransaction,
    maxSnapshotArtifactBytes: deps.maxSnapshotArtifactBytes,
    maxSnapshotArtifactRecords: deps.maxSnapshotArtifactRecords,
    maxSnapshotSourceParts: deps.maxSnapshotSourceParts,
    ...budget,
  });

  let projection;
  try {
    projection = await projectKnowledgeGraphSnapshot(snapshot, args.projectionLimit, budget);
  } catch (error) {
    projection = unavailableProjection(snapshot, args.projectionLimit, error);
  }
  return success("ingest", {
    graphId: resolved.graphId,
    snapshotDigest: snapshot.pointer.snapshotDigest,
    complete,
    counts: {
      repositories: snapshot.manifest.repositories.length,
      sources: sourceEntries.length,
      ready,
      skipped,
      unsupported,
      parsed,
      reused,
      deleted: deletedPaths.length,
      nodes: snapshot.manifest.graph.nodes,
      edges: snapshot.manifest.graph.edges,
      visitedFiles: discovered.admission.counts.filesVisited,
      admittedBytes: discovered.admission.counts.bytesAdmitted,
      ignoredEntries: discovered.admission.counts.ignoredEntries,
    },
    completeness,
    projection,
    diagnostics: snapshot.manifest.diagnostics,
    parserCoverage: snapshot.manifest.parserCoverage,
    acquisition: resolved.acquisition,
    retrieval: snapshot.manifest.retrieval,
    cost: snapshot.manifest.cost,
  });
}

async function ingestResolved(args, deps, abortSignal, deadline, resolved) {
  return runKnowledgeGraphObjectTransaction(
    graphPointerPath(resolved.outputRoot, resolved.graphId),
    { abortSignal, allowedRoot: resolved.outputRoot, deadline },
    (objectTransaction) => ingestResolvedTransaction(
      args, deps, abortSignal, deadline, resolved, objectTransaction,
    ),
  );
}

export async function ingestKnowledgeGraph(args, deps = {}, options = {}) {
  const normalized = args && typeof args === "object" && !Array.isArray(args) ? args : {};
  const deadline = createKnowledgeGraphDeadline(normalized.maxDurationMs, { now: deps.now });
  const operationAbort = createOperationAbortSignal(deadline, options.abortSignal);
  try {
    const resolved = await resolveIngestSource(normalized, deps, operationAbort.signal, deadline);
    return await serializeIngest(
      resolved.graphId,
      () => ingestResolved(normalized, deps, operationAbort.signal, deadline, resolved),
      { abortSignal: operationAbort.signal, deadline },
    );
  } catch (error) {
    let normalizedError = error;
    try {
      checkKnowledgeGraphBudget({
        abortSignal: options.abortSignal,
        deadline,
        stage: "ingest",
      });
    } catch (budgetError) {
      normalizedError = budgetError;
    }
    return failure("ingest", normalizedError);
  } finally {
    operationAbort.cleanup();
  }
}

async function snapshotForRead(args, deps, budget) {
  const graphId = String(args.graphId || "").trim();
  if (!GRAPH_ID.test(graphId)) throw new KnowledgeGraphError("graph_id_invalid", "graphId is invalid.");
  const outputRoot = await resolveOutputRoot(deps, budget);
  const snapshot = await readKnowledgeGraphSnapshot(graphPointerPath(outputRoot, graphId), {
    allowedRoot: outputRoot,
    expectedGraphId: graphId,
    ...budget,
  });
  assertExpectedSnapshot(args, snapshot);
  return snapshot;
}

async function runSnapshotOperation(operation, args, deps, options, perform) {
  const normalized = args && typeof args === "object" && !Array.isArray(args) ? args : {};
  const deadline = createKnowledgeGraphDeadline(normalized.maxDurationMs, { now: deps.now });
  const operationAbort = createOperationAbortSignal(deadline, options.abortSignal);
  const budget = { abortSignal: operationAbort.signal, deadline };
  try {
    const snapshot = await snapshotForRead(normalized, deps, budget);
    const payload = await perform(snapshot, normalized, budget);
    checkKnowledgeGraphBudget({ ...budget, stage: operation });
    return success(operation, { graphId: normalized.graphId, ...payload });
  } catch (caught) {
    let error = caught;
    try {
      checkKnowledgeGraphBudget({ abortSignal: options.abortSignal, deadline, stage: operation });
    } catch (budgetError) {
      error = budgetError;
    }
    return failure(operation, error);
  } finally {
    operationAbort.cleanup();
  }
}

export async function queryKnowledgeGraphArtifact(args, deps = {}, options = {}) {
  return runSnapshotOperation("query", args, deps, options, (snapshot, normalized, budget) => (
    queryKnowledgeGraphSnapshot(snapshot, normalized, budget)
  ));
}

export async function explainKnowledgeGraphEdge(args, deps = {}, options = {}) {
  return runSnapshotOperation("explain_edge", args, deps, options, (snapshot, normalized, budget) => (
    explainKnowledgeGraphSnapshotEdge(snapshot, normalized.edgeId, budget)
  ));
}

export function createKnowledgeGraphRuntime({
  knowgrphRoot,
  allowedRoots,
  outputRoot,
  pdfConverter = null,
  pdfConverterVersion = "pending",
  pythonBin = process.env.KNOWGRPH_PYTHON || "python3",
  now = Date.now,
  maxParserOperations,
  maxSourceShardBytes,
  maxSourcePartTargetBytes,
  maxSourceArtifactBytes,
  maxSourceArtifactRecords,
  maxSourceParts,
  maxSnapshotArtifactBytes,
  maxSnapshotArtifactRecords,
  maxSnapshotSourceParts,
}) {
  const deps = {
    knowgrphRoot: path.resolve(knowgrphRoot),
    allowedRoots,
    outputRoot,
    pdfConverter,
    pdfConverterVersion,
    pythonBin,
    now,
    maxParserOperations,
    maxSourceShardBytes,
    maxSourcePartTargetBytes,
    maxSourceArtifactBytes,
    maxSourceArtifactRecords,
    maxSourceParts,
    maxSnapshotArtifactBytes,
    maxSnapshotArtifactRecords,
    maxSnapshotSourceParts,
  };
  return Object.freeze({
    ingest: (args, options) => ingestKnowledgeGraph(args, deps, options),
    query: (args, options) => queryKnowledgeGraphArtifact(args, deps, options),
    explainEdge: (args, options) => explainKnowledgeGraphEdge(args, deps, options),
    run: async (toolName, args = {}, options = {}) => {
      if (toolName === KNOWLEDGE_GRAPH_TOOL_NAMES.ingest) return ingestKnowledgeGraph(args, deps, options);
      if (toolName === KNOWLEDGE_GRAPH_TOOL_NAMES.query) return queryKnowledgeGraphArtifact(args, deps, options);
      if (toolName === KNOWLEDGE_GRAPH_TOOL_NAMES.explainEdge) return explainKnowledgeGraphEdge(args, deps, options);
      return failure("query", new KnowledgeGraphError("unknown_tool", `Unknown knowledge graph tool: ${String(toolName || "")}`));
    },
  });
}
