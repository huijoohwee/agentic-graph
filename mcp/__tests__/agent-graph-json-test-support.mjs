import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { sha256 } from "../agent-graph/contract.mjs";
import { createAgentGraphRuntime } from "../agent-graph/runtime.mjs";
import {
  readAgentGraphRepositoryIndex,
  readAgentGraphSnapshot,
  readAgentGraphSourceShard,
  writeAgentGraphSnapshotAtomic,
  writeAgentGraphSourceShard,
} from "../agent-graph/store.mjs";

export async function createJsonFixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-kg-json-evidence-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const corpusRoot = path.join(base, "corpus");
  const outputRoot = path.join(base, "output");
  await fs.mkdir(corpusRoot, { recursive: true });
  const runtime = createAgentGraphRuntime({
    agenticGraphRoot: base,
    allowedRoots: [corpusRoot],
    outputRoot,
  });
  return { base, corpusRoot, outputRoot, runtime };
}

const pointerPath = (value, graphId) => path.join(
  value.outputRoot,
  "graphs",
  `${graphId.slice("kg:graph:".length)}.json`,
);

const sourceOffset = (text, line, column) => (
  text.split("\n").slice(0, line - 1).reduce(
    (offset, value) => offset + value.length + 1,
    0,
  ) + column - 1
);

export const exactEvidenceSlice = (text, edge) => {
  const properties = edge.properties;
  return text.slice(
    sourceOffset(
      text,
      properties["evidence:lineStart"],
      properties["evidence:columnStart"],
    ),
    sourceOffset(
      text,
      properties["evidence:lineEnd"],
      properties["evidence:columnEnd"],
    ),
  );
};

export async function sourceSnapshot(value, ingest) {
  const graphPointer = pointerPath(value, ingest.graphId);
  const snapshot = await readAgentGraphSnapshot(graphPointer, {
    allowedRoot: value.outputRoot,
    expectedGraphId: ingest.graphId,
  });
  const repository = snapshot.manifest.repositories[0];
  const index = await readAgentGraphRepositoryIndex(snapshot, repository);
  const entry = index.sources[0];
  const shard = await readAgentGraphSourceShard(snapshot, entry);
  return { graphPointer, snapshot, entry, shard };
}

export async function publishValidPriorParserSnapshot(value, current, parserVersion) {
  const parserDigest = sha256(`${current.entry.parserId}\0${parserVersion}`);
  const fragment = {
    ...current.shard,
    parserVersion,
    nodes: current.shard.nodes.map((node) => (
      node.type === "SourceFile"
        ? {
          ...node,
          properties: {
            ...node.properties,
            "corpus:parserVersion": parserVersion,
          },
        }
        : node
    )),
    edges: current.shard.edges.map((edge) => ({
      ...edge,
      properties: {
        ...edge.properties,
        "evidence:parserVersion": parserVersion,
        "evidence:parserDigest": parserDigest,
      },
    })),
  };
  const sourceEntry = await writeAgentGraphSourceShard(
    current.graphPointer,
    {
      relativePath: current.entry.sourcePath,
      contentHash: current.entry.contentHash,
      byteSize: current.entry.byteSize,
      kind: current.entry.kind,
      repositoryId: current.entry.repositoryId,
      repositoryPath: current.entry.repositoryPath,
    },
    fragment,
    { allowedRoot: value.outputRoot },
  );
  const rootContentHash = sha256([
    sourceEntry,
  ].map((entry) => (
    `${entry.sourcePath}\0${entry.contentHash}\0${entry.parserId}\0${entry.parserVersion}`
  )).sort().join("\n"));
  await writeAgentGraphSnapshotAtomic(current.graphPointer, {
    graphId: current.snapshot.pointer.graphId,
    sourceEntries: [sourceEntry],
    derivedEdgesByRepository: new Map(),
    diagnostics: current.snapshot.manifest.diagnostics,
    rootContentHash,
    admission: current.snapshot.manifest.admission,
    completeness: current.snapshot.manifest.completeness,
    parserRegistryDigest: current.snapshot.manifest.parserRegistryDigest,
  }, {
    allowedRoot: value.outputRoot,
  });
}
