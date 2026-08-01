import assert from "node:assert/strict";
import test from "node:test";

import {
  KNOWLEDGE_GRAPH_CANONICAL_NODE_OUTPUT_REVISION,
  MAX_KNOWLEDGE_GRAPH_LABEL_LENGTH,
  makeEdge,
  makeNode,
  sha256,
} from "../knowledge-graph/contract.mjs";
import {
  parseKnowledgeSource,
  parserDescriptorForSource,
} from "../knowledge-graph/parsers.mjs";

const assertCanonicalLabel = (label) => {
  assert.equal(typeof label, "string");
  assert.ok(label.length > 0);
  assert.ok(label.length <= MAX_KNOWLEDGE_GRAPH_LABEL_LENGTH);
  assert.equal(label, label.trim());
  assert.equal(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(label), false);
};

test("graph constructors canonicalize bounded display labels before persistence", () => {
  const raw = ` \u0000${"label".repeat(4_000)}\u007f `;
  const node = makeNode({
    id: "node:fixture",
    label: raw,
    type: "Fixture",
    sourcePath: "docs/fixture.md",
  });
  const edge = makeEdge({
    source: node.id,
    target: node.id,
    label: "\u0001 related \u007f",
    sourcePath: "docs/fixture.md",
    evidence: {
      sourcePath: "docs/fixture.md",
      parserId: "fixture",
      parserVersion: "fixture-v1",
      ruleId: "fixture.edge",
      explanation: "Fixture explains its own edge.",
    },
  });

  assertCanonicalLabel(node.label);
  assert.equal(node.label.length, MAX_KNOWLEDGE_GRAPH_LABEL_LENGTH);
  assertCanonicalLabel(edge.label);
  assert.equal(edge.label, "related");
});

test("Markdown chunk display labels remain canonical across a whitespace boundary", async () => {
  const rawSecondChunk = ` \u0001${"b".repeat(40)}`;
  const text = `${"a".repeat(280)}${rawSecondChunk}`;
  const fragment = await parseKnowledgeSource({
    relativePath: "docs/chunk-boundary.md",
    text,
    contentHash: sha256(text),
    byteSize: Buffer.byteLength(text),
    kind: "markdown",
    status: "ready",
    diagnostics: [],
  });
  const chunks = fragment.nodes.filter((node) => node.type === "DocumentText");

  assert.equal(chunks.length, 2);
  for (const node of fragment.nodes) assertCanonicalLabel(node.label);
  assert.equal(chunks[1].label, "b".repeat(40));
  assert.equal(chunks[1].properties["doc:text"], rawSecondChunk);
});

test("every native parser identity invalidates pre-canonical cached fragments", () => {
  const sourceKinds = [
    ["src/main.ts", "typescript"],
    ["src/main.py", "python"],
    ["schema/tables.sql", "sql"],
    ["docs/guide.md", "markdown"],
    ["config/app.json", "json-config"],
    ["config/app.yaml", "structural-config"],
    ["src/main.rs", "brace-code"],
    ["docs/evidence.pdf", "pdf"],
    ["docs/readme.rst", "inventory"],
  ];

  for (const [relativePath, kind] of sourceKinds) {
    const descriptor = parserDescriptorForSource({ relativePath, kind, status: "ready" });
    assert.ok(
      descriptor.parserVersion.includes(KNOWLEDGE_GRAPH_CANONICAL_NODE_OUTPUT_REVISION),
      `${kind} parser version did not invalidate pre-canonical source shards`,
    );
  }
});
