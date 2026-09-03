import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  deserializeDecisionNode,
  mergeDecisionsIntoAgenticOsMarkdown,
  serializeDecisionNode,
} from "../decisionDocument.js";

function decision(decisionId, overrides = {}) {
  return {
    decisionId,
    decisionType: "quest_flag",
    entityRef: "npc.guide",
    payload: { completed: true },
    producedAt: "2026-07-21T00:00:00.000Z",
    ...overrides,
  };
}

function fixtureMarkdown() {
  return [
    "---",
    'kgSchema: "agentic-os-computing-flow/v1"',
    'title: "Byte-preserved fixture"',
    "flow:",
    "  nodes: []",
    "  edges: []",
    "---",
    "",
    "# Untouched body",
    "",
    "Trailing spaces survive.  ",
    "",
  ].join("\n");
}

test("pure Decision merge preserves body bytes and canonicalizes insertion order", () => {
  const original = fixtureMarkdown();
  const result = mergeDecisionsIntoAgenticOsMarkdown(original, [
    decision("z-last"),
    decision("a-first"),
  ]);

  assert.equal(result.persistedCount, 2);
  assert.equal(result.idempotentCount, 0);
  assert.equal(
    result.markdown.slice(result.markdown.indexOf("---\n\n# Untouched body")),
    original.slice(original.indexOf("---\n\n# Untouched body")),
  );
  assert.ok(result.markdown.indexOf("ecs-decision:a-first") < result.markdown.indexOf("ecs-decision:z-last"));
});

test("pure Decision merge is byte-idempotent for identical records", () => {
  const records = [decision("first"), decision("second")];
  const once = mergeDecisionsIntoAgenticOsMarkdown(fixtureMarkdown(), records);
  const twice = mergeDecisionsIntoAgenticOsMarkdown(once.markdown, [...records].reverse());

  assert.deepEqual(twice, {
    markdown: once.markdown,
    persistedCount: 0,
    idempotentCount: 2,
  });
});

test("pure Decision merge rejects an existing-id conflict without producing output", () => {
  const record = decision("same");
  const once = mergeDecisionsIntoAgenticOsMarkdown(fixtureMarkdown(), [record]);

  assert.throws(
    () => mergeDecisionsIntoAgenticOsMarkdown(once.markdown, [
      { ...record, payload: { completed: false } },
    ]),
    (error) => error.code === "ECS_DECISION_ID_CONFLICT" && error.ref === "same",
  );
});

test("pure Decision document rejects malformed batches, Markdown, and YAML nodes", () => {
  assert.throws(
    () => mergeDecisionsIntoAgenticOsMarkdown(fixtureMarkdown(), [decision("duplicate"), decision("duplicate")]),
    (error) => error.code === "ECS_DECISION_DUPLICATE_ID",
  );
  assert.throws(
    () => mergeDecisionsIntoAgenticOsMarkdown("# no frontmatter\n", [decision("new")]),
    (error) => error.code === "ECS_AGENTIC_OS_FRONTMATTER_REQUIRED",
  );
  assert.throws(
    () => deserializeDecisionNode("- type: [unterminated"),
    (error) => error.code === "ECS_DECISION_INVALID_YAML",
  );
});

test("Decision document browser seam has no Node built-in imports", async () => {
  const source = await readFile(new URL("../decisionDocument.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /(?:from\s+|import\s*\()["']node:/);

  const record = decision("round-trip");
  assert.deepEqual(deserializeDecisionNode(serializeDecisionNode(record)), record);
});
