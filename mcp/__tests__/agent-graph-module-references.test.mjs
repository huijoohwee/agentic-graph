import assert from "node:assert/strict";
import test from "node:test";
import { createFixture, ingestFixture, materializeFixture, writeFile } from "./agent-graph-runtime-test-support.mjs";

test("literal module calls use native AST, source resolution, query and explanation without executing code", async t => {
  const fixture = await createFixture(t);
  await writeFile(fixture.corpusRoot, "lazy.mjs", `
    export async function lazy(name) {
      await import('./target.mjs');
      require('./target.mjs');
      require(name);
      import(name);
      const text = "require('./fake.mjs')";
    }
    // require('./comment.mjs')
    throw new Error('must not execute');
  `);
  await writeFile(fixture.corpusRoot, "target.mjs", "export const value = 1;\n");
  const result = await ingestFixture(fixture);
  const graph = await materializeFixture(fixture, result);
  const references = graph.nodes.filter(n => n.type === 'CodeDependency' && n.properties['corpus:sourcePath'] === 'lazy.mjs');
  assert.equal(references.length, 2);
  assert.ok(references.every(n => n.label === './target.mjs'));
  const target = graph.nodes.find(n => n.type === 'SourceFile' && n.properties['corpus:sourcePath'] === 'target.mjs');
  for (const reference of references) {
    const resolution = graph.edges.find(e => e.source === reference.id && e.target === target.id);
    assert.equal(resolution.properties['evidence:certainty'], 'inferred');
    const premise = graph.edges.find(e => e.target === reference.id);
    assert.equal(premise.properties['evidence:certainty'], 'exact');
    assert.match(premise.properties['evidence:explanation'], /execution/);
    assert.ok(resolution.properties['evidence:premiseEdgeIds'].includes(premise.id));
    const explain = await fixture.runtime.explainEdge({ graphId: result.graphId, expectedSnapshotDigest: result.snapshotDigest, edgeId: resolution.id });
    assert.equal(explain.ok, true);
    assert.match(explain.evidence.explanation, /does not prove runtime binding/);
    const queried = await fixture.runtime.query({ graphId: result.graphId, expectedSnapshotDigest: result.snapshotDigest,
      mode: 'path', from: reference.id, to: target.id, direction: 'outgoing', maxDepth: 2 });
    assert.equal(queried.found, true);
    assert.equal(queried.cost.modelCalls, 0);
    assert.equal(queried.retrieval.vectorStore, false);
  }
});
