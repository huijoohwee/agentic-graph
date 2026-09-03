import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import fc from "fast-check";

import {
  deserializeDecisionNode,
  persistDecisions,
  serializeDecisionNode,
} from "../decisionPersistence.js";
import { normalizeDecisionRecord } from "../agenticOsNodeContract.js";

const RUNS = 100;
const safeIdentifier = fc.stringOf(
  fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_."),
  { minLength: 1, maxLength: 24 },
);
const payload = fc.dictionary(safeIdentifier, fc.jsonValue(), { maxKeys: 8 });
const decisionArbitrary = fc.record({
  decisionId: safeIdentifier,
  decisionType: fc.constantFrom("dialogue_outcome", "quest_flag", "world_tick_result"),
  entityRef: safeIdentifier,
  payload,
  producedAt: fc.integer({ min: 0, max: 2_000_000_000_000 }).map((value) => new Date(value).toISOString()),
});

function fixtureMarkdown() {
  return [
    "---",
    'kgSchema: "agentic-os-computing-flow/v1"',
    "flow:",
    "  nodes: []",
    "  edges: []",
    "---",
    "",
    "# Property fixture",
    "",
  ].join("\n");
}

function createMemoryFileSystem(initial) {
  const targetPath = "/virtual/world.md";
  const files = new Map([[targetPath, initial]]);
  return {
    fileSystem: {
      async readFile(filePath) {
        if (!files.has(filePath)) throw new Error(`missing ${filePath}`);
        return files.get(filePath);
      },
      async rename(from, to) {
        if (!files.has(from)) throw new Error(`missing ${from}`);
        files.set(to, files.get(from));
        files.delete(from);
      },
      async unlink(filePath) {
        files.delete(filePath);
      },
      async writeFile(filePath, value) {
        assert.equal(path.dirname(filePath), path.dirname(targetPath));
        files.set(filePath, value);
      },
    },
    read: () => files.get(targetPath),
    targetPath,
  };
}

test("Feature: agentic-graph-agentic-ecs, Property 19: decision serialization round-trip", () => {
  fc.assert(
    fc.property(decisionArbitrary, (decision) => {
      assert.deepEqual(
        deserializeDecisionNode(serializeDecisionNode(decision)),
        normalizeDecisionRecord(decision),
      );
    }),
    { numRuns: RUNS },
  );
});

test("Feature: agentic-graph-agentic-ecs, Property 17/19: batch persistence is deterministic and idempotent", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uniqueArray(decisionArbitrary, {
        maxLength: 12,
        minLength: 1,
        selector: (decision) => decision.decisionId,
      }),
      async (decisions) => {
        const memory = createMemoryFileSystem(fixtureMarkdown());
        const first = await persistDecisions(memory.targetPath, decisions, {
          fileSystem: memory.fileSystem,
        });
        assert.equal(first.ok, true);
        assert.equal(first.persistedCount, decisions.length);
        const once = memory.read();
        const second = await persistDecisions(memory.targetPath, [...decisions].reverse(), {
          fileSystem: memory.fileSystem,
        });
        assert.equal(second.ok, true);
        assert.equal(second.persistedCount, 0);
        assert.equal(second.idempotentCount, decisions.length);
        assert.equal(memory.read(), once);
      },
    ),
    { numRuns: RUNS },
  );
});

test("Feature: agentic-graph-agentic-ecs, Property 18/20: conflicting batch preserves target bytes", async () => {
  await fc.assert(
    fc.asyncProperty(decisionArbitrary, payload, async (record, changedPayload) => {
      fc.pre(JSON.stringify(record.payload) !== JSON.stringify(changedPayload));
      const memory = createMemoryFileSystem(fixtureMarkdown());
      assert.equal(
        (
          await persistDecisions(memory.targetPath, [record], {
            fileSystem: memory.fileSystem,
          })
        ).ok,
        true,
      );
      const before = memory.read();
      const conflict = { ...record, payload: changedPayload };
      const result = await persistDecisions(memory.targetPath, [conflict], {
        fileSystem: memory.fileSystem,
      });
      assert.equal(result.ok, false);
      assert.equal(result.errorCode, "ECS_DECISION_ID_CONFLICT");
      assert.equal(memory.read(), before);
    }),
    { numRuns: RUNS },
  );
});
