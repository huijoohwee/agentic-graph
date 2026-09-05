import path from "node:path";

import {
  checkAgentGraphBudget,
  createAgentGraphDeadline,
  AgentGraphError,
  compareStableStrings,
  agentGraphFailure,
  remainingAgentGraphDuration,
  sha256,
} from "./contract.mjs";
import {
  discoverKnowledgeSources,
  hydrateKnowledgeSource,
} from "./discovery.mjs";
import {
  strictIngestIncompleteMessage,
  summarizeAgentGraphCompleteness,
} from "./ingest-completeness.mjs";
import { pathIsInside, resolveIngestSource, resolveOutputRoot } from "./ingest-source.mjs";
import {
  createAgentGraphParserDispatch,
  parseKnowledgeSource,
  parserDescriptorForSource,
  parserLimitFragmentForSource,
  probePythonParserRuntime,
} from "./parsers.mjs";
import { runAgentGraphObjectTransaction } from "./object-transaction.mjs";
import {
  explainAgentGraphSnapshotEdge,
  projectAgentGraphSnapshot,
  queryAgentGraphSnapshot,
} from "./query.mjs";
import { unavailableProjection } from "./projection-fallback.mjs";
import { buildRepositoryScopedResolutionEdges } from "./resolution.mjs";
import {
  createResolutionRetentionBudget,
  fragmentForResolution,
  retainResolutionFragment,
} from "./resolution-retention.mjs";
import {
  generateAgentGraphParser,
  parserRegistryForIngest,
} from "./parser-runtime.mjs";
export { generateAgentGraphParser };
import { persistAgentGraphSource } from "./source-persistence.mjs";
import {
  sourceArtifactByteLimit,
  sourceArtifactRecordLimit,
  sourcePartCountLimit,
} from "./source-sharding.mjs";
import {
  agentGraphSourceShardByteLimit,
  listAgentGraphSourceEntries,
  readAgentGraphSnapshot,
  readAgentGraphSnapshotIfPresent,
  readAgentGraphSourceParts,
  writeAgentGraphSnapshotAtomic,
} from "./store.mjs";

export const AGENT_GRAPH_TOOL_NAMES = Object.freeze({
  parserGenerate: "agentic-graph.agent_graph.parser_generate",
  ingest: "agentic-graph.agent_graph.ingest",
  query: "agentic-graph.agent_graph.query",
  explainEdge: "agentic-graph.agent_graph.explain_edge",
});

const RESULT_SCHEMAS = Object.freeze({
  parser_generate: "agentic-graph-agent-graph-parser-generate/v1",
  ingest: "agentic-graph-agent-graph-ingest/v1",
  query: "agentic-graph-agent-graph-query/v1",
  explain_edge: "agentic-graph-agent-graph-explain-edge/v1",
});

const GRAPH_ID = /^kg:graph:[a-f0-9]{32}$/;
const ingestTails = new Map();
const success = (operation, payload) => ({ schema: RESULT_SCHEMAS[operation], ok: true, operation, ...payload });
const failure = (operation, error) => ({ schema: RESULT_SCHEMAS[operation], operation, ...agentGraphFailure(error) });

const graphPointerPath = (outputRoot, graphId) => path.join(outputRoot, "graphs", `${graphId.slice("kg:graph:".length)}.json`);

async function serializeIngest(graphId, operation, budget = {}) {
  const previous = ingestTails.get(graphId);
  let release;
  const tail = new Promise((resolve) => { release = resolve; });
  ingestTails.set(graphId, tail);
  if (previous) {
    await previous;
    checkAgentGraphBudget({ ...budget, stage: "ingest-queue" });
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
  checkAgentGraphBudget({ ...budget, stage: "source-shard-reuse" });
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
  for await (const part of readAgentGraphSourceParts(previousSnapshot, entry)) {
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
  checkAgentGraphBudget({ ...budget, stage: "source-shard-reuse" });
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
      checkAgentGraphBudget({ abortSignal, deadline, stage, details: { operations } });
    }
  };
  checkpoint.force = () => checkAgentGraphBudget({
    abortSignal,
    deadline,
    stage,
    details: { operations },
  });
  return checkpoint;
}

async function reportIngestProgress(onProgress, value) { if (typeof onProgress === "function") await onProgress(value); }

function createOperationAbortSignal(deadline, externalSignal) {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) onExternalAbort();
  else externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error("knowledge graph deadline exceeded")),
    Math.max(1, remainingAgentGraphDuration(deadline)),
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

function assertExpectedSnapshot(args, snapshot) {
  const expected = String(args.expectedSnapshotDigest || "").trim();
  if (!expected) throw new AgentGraphError("expected_snapshot_digest_required", "expectedSnapshotDigest is required.");
  if (expected !== snapshot.pointer.snapshotDigest) {
    throw new AgentGraphError("stale_snapshot_digest", "Knowledge graph snapshot digest does not match the caller's expected digest.", {
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
  parserRegistry,
  objectTransaction,
  onProgress,
) {
  const budget = { abortSignal, deadline };
  checkAgentGraphBudget({ ...budget, stage: "ingest-start" });
  const pointerPath = graphPointerPath(resolved.outputRoot, resolved.graphId);
  const strict = args.strict !== false;
  const useCache = args.useCache !== false;
  const previousSnapshot = useCache
    ? await readAgentGraphSnapshotIfPresent(pointerPath, {
      allowedRoot: resolved.outputRoot,
      expectedGraphId: resolved.graphId,
      ...budget,
    })
    : null;
  checkAgentGraphBudget({ ...budget, stage: "previous-snapshot-read" });
  const registryMatchesPrevious = previousSnapshot?.schemaFamily === "canonical"
    && previousSnapshot.manifest?.parserRegistryDigest === parserRegistry.digest;
  const previousEntries = new Map(
    (previousSnapshot && registryMatchesPrevious
      ? await listAgentGraphSourceEntries(previousSnapshot)
      : [])
      .map((entry) => [entry.sourcePath, entry]),
  );
  checkAgentGraphBudget({ ...budget, stage: "previous-source-index-read" });
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
    parserRegistry,
  });
  let parserDeps = {
    ...deps,
    parserRegistry,
    parserDispatch: createAgentGraphParserDispatch(parserRegistry),
  };
  if (discovered.sources.some((source) => source.parserAdapter === "python")) {
    try {
      const pythonRuntime = await probePythonParserRuntime({
        ...deps,
        ...budget,
      });
      parserDeps = { ...parserDeps, ...pythonRuntime };
    } catch (error) {
      if (error instanceof AgentGraphError
        && ["aborted", "max_duration_exceeded"].includes(error.code)) throw error;
    }
  }
  checkAgentGraphBudget({ ...budget, stage: "parser-runtime-probe" });
  const fragments = new Map();
  const sourceEntries = [];
  const sourceShardByteLimit = agentGraphSourceShardByteLimit(deps.maxSourceShardBytes);
  const sourceByteLimit = sourceArtifactByteLimit(deps.maxSourceArtifactBytes);
  const sourceRecordLimit = sourceArtifactRecordLimit(deps.maxSourceArtifactRecords);
  const partCountLimit = sourcePartCountLimit(deps.maxSourceParts);
  const resolutionRetention = createResolutionRetentionBudget({
    maxBytes: args.maxResolutionBytes,
    maxRecords: args.maxResolutionRecords,
  });
  let parsed = 0;
  let reused = 0;
  let sourceIndex = 0;
  const parserCheckpoint = createPeriodicCheckpoint(abortSignal, deadline, "source-parsing");
  for (const source of discovered.sources) {
    parserCheckpoint.force();
    const descriptor = parserDescriptorForSource(source, parserDeps);
    const previous = previousEntries.get(source.relativePath);
    const reusable = useCache
      && previous?.status === "parsed"
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
          ...parserDeps,
          abortSignal,
          deadline,
          checkpoint: parserCheckpoint,
          maxParserNodes: args.maxParserNodes,
          maxParserEdges: args.maxParserEdges,
          maxParserRecords: args.maxParserRecords,
        });
      } catch (error) {
        if (strict || !(error instanceof AgentGraphError)
          || ![
            "parser_operation_limit_exceeded",
            "parser_record_limit_exceeded",
          ].includes(error.code)) throw error;
        fragment = parserLimitFragmentForSource(hydrated, parserDeps, error);
      }
    }
    parserCheckpoint.force();
    const persisted = await persistAgentGraphSource({
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
      deps: parserDeps, budget, checkpoint: parserCheckpoint,
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
    sourceIndex += 1;
    await reportIngestProgress(onProgress, {
      schema: "agentic-graph-agent-graph-import-progress/v1",
      kind: "source-parsed",
      graphId: resolved.graphId,
      parserRegistryDigest: parserRegistry.digest,
      sourcePath: source.relativePath,
      sourceIndex,
      sourceTotal: discovered.sources.length,
      fragment: {
        nodes: annotated.nodes,
        edges: annotated.edges,
      },
    });
  }

  const completeness = summarizeAgentGraphCompleteness({
    admission: discovered.admission,
    fragments,
    acquisitionComplete: resolved.acquisition?.complete,
  });
  if (strict && !completeness.complete) {
    throw new AgentGraphError(
      "strict_ingest_incomplete",
      strictIngestIncompleteMessage({
        ...completeness,
        previousReadySnapshotPreserved: Boolean(previousSnapshot),
      }),
      {
        complete: false,
        sources: completeness.incompleteSources,
        reasons: completeness.reasons,
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
  const rootContentHash = sha256([
    `parser-registry\0${parserRegistry.digest}`,
    ...sourceEntries.map((entry) => (
      `${entry.sourcePath}\0${entry.contentHash}\0${entry.parserId}\0${entry.parserVersion}`
    )).sort(compareStableStrings),
  ].join("\n"));
  const currentPaths = new Set(discovered.sources.map((source) => source.relativePath));
  const deletedPaths = [...previousEntries.keys()]
    .filter((sourcePath) => !currentPaths.has(sourcePath))
    .sort(compareStableStrings);
  completeness.deletedPaths = deletedPaths;
  const ready = discovered.sources.filter((source) => source.status === "ready").length;
  const skipped = discovered.sources.filter((source) => source.status === "skipped").length;
  const unsupported = discovered.sources.filter((source) => source.status === "unsupported").length;
  const snapshot = await writeAgentGraphSnapshotAtomic(pointerPath, {
    graphId: resolved.graphId,
    sourceEntries,
    derivedEdgesByRepository,
    diagnostics: discovered.diagnostics,
    rootContentHash,
    admission: discovered.admission,
    completeness,
    parserRegistryDigest: parserRegistry.digest,
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
    projection = await projectAgentGraphSnapshot(snapshot, args.projectionLimit, budget);
  } catch (error) {
    projection = unavailableProjection(snapshot, args.projectionLimit, args.projectionByteLimit);
  }
  return success("ingest", {
    graphId: resolved.graphId,
    snapshotDigest: snapshot.pointer.snapshotDigest,
    parserRegistryDigest: parserRegistry.digest,
    complete: completeness.complete,
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

async function ingestResolved(args, deps, abortSignal, deadline, resolved, parserRegistry, onProgress) {
  return runAgentGraphObjectTransaction(
    graphPointerPath(resolved.outputRoot, resolved.graphId),
    { abortSignal, allowedRoot: resolved.outputRoot, deadline },
    (objectTransaction) => ingestResolvedTransaction(
      args, deps, abortSignal, deadline, resolved, parserRegistry, objectTransaction, onProgress,
    ),
  );
}

export async function ingestAgentGraph(args, deps = {}, options = {}) {
  const normalized = args && typeof args === "object" && !Array.isArray(args) ? args : {};
  const deadline = createAgentGraphDeadline(normalized.maxDurationMs, { now: deps.now });
  const operationAbort = createOperationAbortSignal(deadline, options.abortSignal);
  try {
    const parserRegistry = parserRegistryForIngest(normalized);
    const resolved = await resolveIngestSource(normalized, deps, operationAbort.signal, deadline);
    return await serializeIngest(
      resolved.graphId,
      () => ingestResolved(
        normalized,
        deps,
        operationAbort.signal,
        deadline,
        resolved,
        parserRegistry,
        options.onProgress,
      ),
      { abortSignal: operationAbort.signal, deadline },
    );
  } catch (error) {
    let normalizedError = error;
    try {
      checkAgentGraphBudget({
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
  if (!GRAPH_ID.test(graphId)) throw new AgentGraphError("graph_id_invalid", "graphId is invalid.");
  const outputRoot = await resolveOutputRoot(deps, budget);
  const snapshot = await readAgentGraphSnapshot(graphPointerPath(outputRoot, graphId), {
    allowedRoot: outputRoot,
    expectedGraphId: graphId,
    ...budget,
  });
  assertExpectedSnapshot(args, snapshot);
  return snapshot;
}

async function runSnapshotOperation(operation, args, deps, options, perform) {
  const normalized = args && typeof args === "object" && !Array.isArray(args) ? args : {};
  const deadline = createAgentGraphDeadline(normalized.maxDurationMs, { now: deps.now });
  const operationAbort = createOperationAbortSignal(deadline, options.abortSignal);
  const budget = { abortSignal: operationAbort.signal, deadline };
  try {
    const snapshot = await snapshotForRead(normalized, deps, budget);
    const payload = await perform(snapshot, normalized, budget);
    checkAgentGraphBudget({ ...budget, stage: operation });
    return success(operation, { graphId: normalized.graphId, ...payload });
  } catch (caught) {
    let error = caught;
    try {
      checkAgentGraphBudget({ abortSignal: options.abortSignal, deadline, stage: operation });
    } catch (budgetError) {
      error = budgetError;
    }
    return failure(operation, error);
  } finally {
    operationAbort.cleanup();
  }
}

export async function queryAgentGraphArtifact(args, deps = {}, options = {}) {
  return runSnapshotOperation("query", args, deps, options, (snapshot, normalized, budget) => (
    queryAgentGraphSnapshot(snapshot, normalized, budget)
  ));
}

export async function explainAgentGraphEdge(args, deps = {}, options = {}) {
  return runSnapshotOperation("explain_edge", args, deps, options, (snapshot, normalized, budget) => (
    explainAgentGraphSnapshotEdge(snapshot, normalized.edgeId, budget)
  ));
}

export function createAgentGraphRuntime({
  agenticGraphRoot,
  allowedRoots,
  repositoryHosts,
  allowPrivateRepositoryNetwork = false,
  outputRoot,
  pdfConverter = null,
  pdfConverterVersion = "pending",
  pythonBin = process.env.AGENTIC_OS_PYTHON || "python3",
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
    agenticGraphRoot: path.resolve(agenticGraphRoot),
    allowedRoots,
    repositoryHosts,
    allowPrivateRepositoryNetwork: allowPrivateRepositoryNetwork === true,
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
    generateAgentGraphParser: (args) => generateAgentGraphParser(args),
    ingest: (args, options) => ingestAgentGraph(args, deps, options),
    query: (args, options) => queryAgentGraphArtifact(args, deps, options),
    explainEdge: (args, options) => explainAgentGraphEdge(args, deps, options),
    run: async (toolName, args = {}, options = {}) => {
      if (toolName === AGENT_GRAPH_TOOL_NAMES.parserGenerate) {
        return generateAgentGraphParser(args);
      }
      if (toolName === AGENT_GRAPH_TOOL_NAMES.ingest) return ingestAgentGraph(args, deps, options);
      if (toolName === AGENT_GRAPH_TOOL_NAMES.query) return queryAgentGraphArtifact(args, deps, options);
      if (toolName === AGENT_GRAPH_TOOL_NAMES.explainEdge) return explainAgentGraphEdge(args, deps, options);
      return failure("query", new AgentGraphError("unknown_tool", `Unknown knowledge graph tool: ${String(toolName || "")}`));
    },
  });
}
