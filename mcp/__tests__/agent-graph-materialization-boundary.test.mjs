import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  computeAgentGraphArtifactDigest,
  computeAgentGraphArtifactDigestBounded,
  sha256,
} from "../agent-graph/contract.mjs";
import { materializeAgentGraphRepository } from "../agent-graph/materialize.mjs";
import {
  writeAgentGraphSnapshotAtomic,
  writeAgentGraphSourceShard,
} from "../agent-graph/store.mjs";

const repositoryId = "repository:materialization-boundary";

async function snapshotFixture(t) {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-materialize-"));
  t.after(() => fs.rm(outputRoot, { recursive: true, force: true }));
  const pointerPath = path.join(outputRoot, "graphs", "materialization-boundary.json");
  const sourcePath = "fixture.md";
  const properties = Object.fromEntries(Array.from(
    { length: 100 },
    (_, index) => [`fixture:property:${String(index).padStart(3, "0")}`, `value-${index}`],
  ));
  const sourceEntry = await writeAgentGraphSourceShard(
    pointerPath,
    {
      relativePath: sourcePath,
      contentHash: sha256(sourcePath),
      byteSize: 1,
      kind: "document",
      status: "ready",
      repositoryId,
      repositoryPath: ".",
    },
    {
      nodes: [{
        id: "source:fixture.md",
        type: "SourceFile",
        label: sourcePath,
        properties,
      }],
      edges: [],
      diagnostics: [],
      parserId: "fixture",
      parserVersion: "1",
      status: "parsed",
    },
    { allowedRoot: outputRoot },
  );
  const snapshot = await writeAgentGraphSnapshotAtomic(
    pointerPath,
    {
      graphId: `kg:graph:${"a".repeat(32)}`,
      sourceEntries: [sourceEntry],
      derivedEdgesByRepository: new Map(),
      diagnostics: [],
      rootContentHash: sha256("root"),
      admission: { complete: true, counts: {} },
      completeness: { complete: true, incompleteSources: [], reasons: [] },
      parserRegistryDigest: sha256("registry"),
    },
    { allowedRoot: outputRoot },
  );
  return snapshot;
}

test("bounded digest keeps two-argument compatibility and a final checkpoint", () => {
  const artifact = { nested: { value: "fixture" } };
  let checkpoints = 0;
  const bounded = computeAgentGraphArtifactDigestBounded(
    artifact,
    1_024,
    () => { checkpoints += 1; },
  );
  assert.equal(bounded.digest, computeAgentGraphArtifactDigest(artifact));
  assert.equal(computeAgentGraphArtifactDigestBounded(artifact, 1_024).digest, bounded.digest);
  assert.equal(checkpoints, 2);
});

test("materialization computes the self-digest within its explicit byte cap", async (t) => {
  const snapshot = await snapshotFixture(t);
  const artifact = await materializeAgentGraphRepository(snapshot, repositoryId);
  assert.equal(
    artifact.metadata.agentGraph.digest,
    computeAgentGraphArtifactDigest(artifact),
  );
  await assert.rejects(
    materializeAgentGraphRepository(snapshot, repositoryId, { maxArtifactBytes: 128 }),
    (error) => error?.code === "artifact_too_large"
      && error?.details?.maxBytes === 128
      && error?.details?.previousArtifactPreserved === true,
  );
});

test("materialization observes a deadline during streamed self-digest traversal", async (t) => {
  const snapshot = await snapshotFixture(t);
  let checks = 0;
  const deadline = {
    maxDurationMs: 100,
    startedAt: 0,
    deadlineAt: 100,
    now() {
      checks += 1;
      return checks >= 4 ? 100 : 0;
    },
  };
  await assert.rejects(
    materializeAgentGraphRepository(snapshot, repositoryId, { deadline }),
    (error) => error?.code === "max_duration_exceeded"
      && error?.details?.stage === "snapshot-materialization",
  );
  assert.equal(checks, 4);
});

test("materialization observes an abort during streamed self-digest traversal", async (t) => {
  const snapshot = await snapshotFixture(t);
  let checks = 0;
  const abortSignal = {
    get aborted() {
      checks += 1;
      return checks >= 4;
    },
  };
  await assert.rejects(
    materializeAgentGraphRepository(snapshot, repositoryId, { abortSignal }),
    (error) => error?.code === "aborted",
  );
  assert.equal(checks, 4);
});
