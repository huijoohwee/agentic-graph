import assert from "node:assert/strict";
import { promises as fileSystem } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  deserializeDecisionNode,
  persistDecision,
  persistDecisions,
  serializeDecisionNode,
} from "../decisionPersistence.js";
import { readAgenticOsNodeState } from "../agenticOsNodeContract.js";

function decision(decisionId, overrides = {}) {
  return {
    decisionId,
    decisionType: "quest_flag",
    entityRef: "npc.guide",
    payload: { nested: { z: 3, a: 1 }, value: true },
    producedAt: "2026-07-20T00:00:00.000Z",
    ...overrides,
  };
}

function fixtureMarkdown(nodes = "    []") {
  return [
    "---",
    'kgSchema: "agentic-os-computing-flow/v1"',
    'title: "Unchanged title"',
    "flow:",
    "  nodes:",
    nodes,
    "  edges:",
    "    []",
    "---",
    "",
    "# Untouched body",
    "",
    "Body bytes must remain exactly the same.  ",
    "",
  ].join("\n");
}

async function withFixture(run) {
  const directory = await fileSystem.mkdtemp(path.join(tmpdir(), "agentic-graph-ecs-persist-"));
  const agenticOsPath = path.join(directory, "world.md");
  const original = fixtureMarkdown();
  await fileSystem.writeFile(agenticOsPath, original, "utf8");
  try {
    await run({ directory, agenticOsPath, original });
  } finally {
    await fileSystem.rm(directory, { force: true, recursive: true });
  }
}

test("Decision YAML round-trip preserves the exact five canonical fields", () => {
  const record = decision("quest-1");
  const serialized = serializeDecisionNode(record);
  assert.match(serialized, /type: "EcsDecision"/);
  assert.ok(serialized.indexOf('"a":1') < serialized.indexOf('"z":3'));
  assert.deepEqual(deserializeDecisionNode(serialized), record);
});

test("persistDecisions inserts sorted EcsDecision nodes and preserves untouched Markdown bytes", async () => {
  await withFixture(async ({ agenticOsPath, original }) => {
    const result = await persistDecisions(agenticOsPath, [decision("z-last"), decision("a-first")]);
    assert.deepEqual(result, { ok: true, persistedCount: 2, idempotentCount: 0 });

    const updated = await fileSystem.readFile(agenticOsPath, "utf8");
    const originalBody = original.slice(original.indexOf("---\n\n# Untouched body"));
    const updatedBody = updated.slice(updated.indexOf("---\n\n# Untouched body"));
    assert.equal(updatedBody, originalBody);
    assert.ok(updated.indexOf("ecs-decision:a-first") < updated.indexOf("ecs-decision:z-last"));
    const decisionNodes = readAgenticOsNodeState(updated).nodes.filter((node) => node.type === "EcsDecision");
    assert.equal(decisionNodes.length, 2);
    assert.deepEqual(
      decisionNodes.map((node) => node.properties.ecsDecision.decisionId),
      ["a-first", "z-last"],
    );
  });
});

test("identical persisted decision ids are no-ops and leave the file byte-identical", async () => {
  await withFixture(async ({ agenticOsPath }) => {
    assert.equal((await persistDecision(agenticOsPath, decision("same"))).ok, true);
    const once = await fileSystem.readFile(agenticOsPath, "utf8");
    const result = await persistDecision(agenticOsPath, decision("same"));
    const twice = await fileSystem.readFile(agenticOsPath, "utf8");
    assert.deepEqual(result, { ok: true, persistedCount: 0, idempotentCount: 1 });
    assert.equal(twice, once);
  });
});

test("duplicate decision ids in a batch or source AGENTIC_OS are rejected even when identical", async () => {
  await withFixture(async ({ agenticOsPath, original }) => {
    const record = decision("duplicate");
    const duplicateBatch = await persistDecisions(agenticOsPath, [record, record]);
    assert.equal(duplicateBatch.ok, false);
    assert.equal(duplicateBatch.errorCode, "ECS_DECISION_DUPLICATE_ID");
    assert.equal(await fileSystem.readFile(agenticOsPath, "utf8"), original);

    const duplicateSource = fixtureMarkdown(
      [serializeDecisionNode(record), serializeDecisionNode(record)].join("\n"),
    );
    await fileSystem.writeFile(agenticOsPath, duplicateSource, "utf8");
    const sourceResult = await persistDecision(agenticOsPath, decision("new"));
    assert.equal(sourceResult.ok, false);
    assert.equal(sourceResult.errorCode, "ECS_DECISION_DUPLICATE_ID");
    assert.equal(await fileSystem.readFile(agenticOsPath, "utf8"), duplicateSource);
  });
});

test("a conflicting existing decision rejects the whole batch without changing bytes", async () => {
  await withFixture(async ({ agenticOsPath }) => {
    assert.equal((await persistDecision(agenticOsPath, decision("same"))).ok, true);
    const before = await fileSystem.readFile(agenticOsPath, "utf8");
    const result = await persistDecisions(agenticOsPath, [
      decision("new"),
      decision("same", { payload: { changed: true } }),
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "ECS_DECISION_ID_CONFLICT");
    assert.equal(await fileSystem.readFile(agenticOsPath, "utf8"), before);
  });
});

test("invalid decision shapes cannot persist raw stores or partial batches", async () => {
  await withFixture(async ({ agenticOsPath, original }) => {
    const invalid = {
      ...decision("bad", { decisionType: "raw_component_store" }),
      stores: { Position: new Float32Array([1]) },
    };
    const result = await persistDecisions(agenticOsPath, [decision("valid"), invalid]);
    assert.equal(result.ok, false);
    assert.match(result.errorCode, /^ECS_/);
    assert.equal(await fileSystem.readFile(agenticOsPath, "utf8"), original);
  });
});

test("calendar-invalid ISO timestamps are rejected before persistence", async () => {
  await withFixture(async ({ agenticOsPath, original }) => {
    const invalid = decision("bad-date", { producedAt: "2026-02-31T00:00:00.000Z" });
    assert.throws(
      () => serializeDecisionNode(invalid),
      (error) => error.code === "ECS_DECISION_INVALID_TIMESTAMP",
    );
    const result = await persistDecision(agenticOsPath, invalid);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "ECS_DECISION_INVALID_TIMESTAMP");
    assert.equal(await fileSystem.readFile(agenticOsPath, "utf8"), original);
  });
});

test("rename failure retains decisions, cleans the sibling temp, and preserves target bytes", async () => {
  await withFixture(async ({ directory, agenticOsPath, original }) => {
    const failingFileSystem = {
      readFile: fileSystem.readFile.bind(fileSystem),
      rename: async () => {
        throw new Error("injected rename failure");
      },
      unlink: fileSystem.unlink.bind(fileSystem),
      writeFile: fileSystem.writeFile.bind(fileSystem),
    };
    const record = decision("retained");
    const result = await persistDecision(agenticOsPath, record, { fileSystem: failingFileSystem });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "ECS_DECISION_WRITE_FAILED");
    assert.deepEqual(result.retainedDecisions, [record]);
    assert.equal(await fileSystem.readFile(agenticOsPath, "utf8"), original);
    assert.deepEqual(await fileSystem.readdir(directory), ["world.md"]);
  });
});

test("write failure retains decisions and leaves the source and directory unchanged", async () => {
  await withFixture(async ({ directory, agenticOsPath, original }) => {
    const failingFileSystem = {
      readFile: fileSystem.readFile.bind(fileSystem),
      rename: fileSystem.rename.bind(fileSystem),
      unlink: fileSystem.unlink.bind(fileSystem),
      writeFile: async () => {
        throw new Error("injected write failure");
      },
    };
    const record = decision("write-retained");
    const result = await persistDecision(agenticOsPath, record, { fileSystem: failingFileSystem });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "ECS_DECISION_WRITE_FAILED");
    assert.deepEqual(result.retainedDecisions, [record]);
    assert.equal(await fileSystem.readFile(agenticOsPath, "utf8"), original);
    assert.deepEqual(await fileSystem.readdir(directory), ["world.md"]);
  });
});

test("persistence preserves CRLF line endings in inserted nodes and untouched content", async () => {
  await withFixture(async ({ agenticOsPath, original }) => {
    const crlf = original.replace(/\n/g, "\r\n");
    await fileSystem.writeFile(agenticOsPath, crlf, "utf8");
    assert.equal((await persistDecision(agenticOsPath, decision("crlf"))).ok, true);
    const updated = await fileSystem.readFile(agenticOsPath, "utf8");
    assert.equal(updated.replace(/\r\n/g, "").includes("\n"), false);
    assert.ok(updated.endsWith("Body bytes must remain exactly the same.  \r\n"));
  });
});

test("concurrent in-process persists to one canonical path serialize without losing either batch", async () => {
  await withFixture(async ({ directory, agenticOsPath }) => {
    const aliasPath = path.join(directory, "world-alias.md");
    await fileSystem.symlink(agenticOsPath, aliasPath);
    let activeTransactions = 0;
    let maximumActiveTransactions = 0;
    const delayedFileSystem = {
      realpath: fileSystem.realpath.bind(fileSystem),
      async readFile(filePath, encoding) {
        activeTransactions += 1;
        maximumActiveTransactions = Math.max(maximumActiveTransactions, activeTransactions);
        const value = await fileSystem.readFile(filePath, encoding);
        await new Promise((resolve) => setTimeout(resolve, 15));
        return value;
      },
      async rename(from, to) {
        try {
          await fileSystem.rename(from, to);
        } finally {
          activeTransactions -= 1;
        }
      },
      unlink: fileSystem.unlink.bind(fileSystem),
      writeFile: fileSystem.writeFile.bind(fileSystem),
    };

    const results = await Promise.all([
      persistDecision(agenticOsPath, decision("concurrent-a"), { fileSystem: delayedFileSystem }),
      persistDecision(aliasPath, decision("concurrent-b"), { fileSystem: delayedFileSystem }),
    ]);
    assert.deepEqual(results, [
      { ok: true, persistedCount: 1, idempotentCount: 0 },
      { ok: true, persistedCount: 1, idempotentCount: 0 },
    ]);
    assert.equal(maximumActiveTransactions, 1);
    const persistedIds = readAgenticOsNodeState(await fileSystem.readFile(agenticOsPath, "utf8")).nodes
      .filter((node) => node.type === "EcsDecision")
      .map((node) => node.properties.ecsDecision.decisionId)
      .sort();
    assert.deepEqual(persistedIds, ["concurrent-a", "concurrent-b"]);
  });
});
