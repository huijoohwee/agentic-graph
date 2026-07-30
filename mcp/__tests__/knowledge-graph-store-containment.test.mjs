import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { sha256 } from "../knowledge-graph/contract.mjs";
import { createKnowledgeGraphRuntime } from "../knowledge-graph/runtime.mjs";

async function createFixture(t) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-kg-containment-"));
  const base = await fs.realpath(created);
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const host = path.join(base, "host");
  const corpus = path.join(base, "corpus");
  const output = path.join(host, "output");
  await fs.mkdir(corpus, { recursive: true });
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(corpus, "main.ts"), "export const value = 1;\n");
  const realCorpus = await fs.realpath(corpus);
  const graphId = `kg:graph:${sha256(`local-directory\0${realCorpus}`).slice(0, 32)}`;
  const pointerPath = path.join(output, "graphs", `${graphId.slice("kg:graph:".length)}.json`);
  const runtime = createKnowledgeGraphRuntime({
    knowgrphRoot: host,
    allowedRoots: [corpus],
    outputRoot: output,
  });
  return { base, corpus, graphId, output, pointerPath, runtime };
}

test("ingest rejects a symlinked graph directory before writing outside outputRoot", async (t) => {
  const fixture = await createFixture(t);
  const escaped = path.join(fixture.base, "escaped-graphs");
  await fs.mkdir(escaped);
  await fs.symlink(escaped, path.join(fixture.output, "graphs"));

  const result = await fixture.runtime.ingest({ rootPath: fixture.corpus, strict: true });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "artifact_path_symlink");
  assert.deepEqual(await fs.readdir(escaped), []);
});

test("ingest rejects a symlinked per-graph store before writing outside outputRoot", async (t) => {
  const fixture = await createFixture(t);
  const escaped = path.join(fixture.base, "escaped-store");
  await fs.mkdir(path.dirname(fixture.pointerPath), { recursive: true });
  await fs.mkdir(escaped);
  await fs.symlink(escaped, `${fixture.pointerPath}.store`);

  const result = await fixture.runtime.ingest({ rootPath: fixture.corpus, strict: true });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "artifact_path_symlink");
  assert.deepEqual(await fs.readdir(escaped), []);
});

test("pointer publication rejects a pre-existing file symlink without changing its target", async (t) => {
  const fixture = await createFixture(t);
  const outsideFile = path.join(fixture.base, "outside-pointer.json");
  const sentinel = "outside remains unchanged\n";
  await fs.mkdir(path.dirname(fixture.pointerPath), { recursive: true });
  await fs.writeFile(outsideFile, sentinel);
  await fs.symlink(outsideFile, fixture.pointerPath);

  const result = await fixture.runtime.ingest({ rootPath: fixture.corpus, strict: true });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "artifact_path_symlink");
  assert.equal(await fs.readFile(outsideFile, "utf8"), sentinel);
});

test("query rejects a source store moved outside outputRoot and replaced by a symlink", async (t) => {
  const fixture = await createFixture(t);
  const ingest = await fixture.runtime.ingest({ rootPath: fixture.corpus, strict: true });
  assert.equal(ingest.ok, true, JSON.stringify(ingest));
  const storePath = `${fixture.pointerPath}.store`;
  const escaped = path.join(fixture.base, "escaped-existing-store");
  await fs.rename(storePath, escaped);
  await fs.symlink(escaped, storePath);

  const result = await fixture.runtime.query({
    graphId: fixture.graphId,
    expectedSnapshotDigest: ingest.snapshotDigest,
    mode: "summary",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "artifact_path_unstable");
});
