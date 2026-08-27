import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { PERSISTENT_MEMORY_TOOL_NAMES as TOOLS } from "../persistent-memory-contract.mjs";
import { createPersistentMemoryRuntime } from "../persistent-memory-runtime.js";
import { createPersistentMemoryFileStore } from "../persistent-memory-store.js";

const SCOPE = Object.freeze({
  tenant_id: "tenant-a",
  workspace_id: "workspace-a",
  agent_id: "agent-a",
  subject_id: "subject-a",
});
const OPERATOR = Object.freeze({ id: "operator-a", approved: true });
const authorizeMutation = ({ toolName }) => Object.freeze({
  schema: "test-host-authorization/v1",
  status: "authorized",
  tool_name: toolName,
});

const evidence = (sourceId, excerpt, overrides = {}) => ({
  source_type: "operator",
  source_id: sourceId,
  excerpt,
  explicit: true,
  ...overrides,
});

const addArgs = ({
  content,
  kind,
  tags,
  sourceId,
  evidenceOverrides,
  expectedRevision = 0,
  idempotencyKey,
}) => ({
  scope: SCOPE,
  target: "memory",
  action: "add",
  content,
  kind,
  tags,
  evidence: evidence(
    sourceId,
    "The operator explicitly approved this durable session record.",
    evidenceOverrides,
  ),
  operator: OPERATOR,
  expected_revision: expectedRevision,
  idempotency_key: idempotencyKey,
});

async function fixture(t, label) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `agenticgraph-pmemory-${label}-`));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 6, 24, 0, 0, tick++));
  const store = createPersistentMemoryFileStore({
    directory,
    storeId: `store-${label}`,
    now,
  });
  return {
    store,
    runtime: createPersistentMemoryRuntime({ store, now, authorizeMutation }),
  };
}

test("session search is read-only, cited, and limited to named session evidence", async (t) => {
  const { runtime, store } = await fixture(t, "session");
  await runtime.run(TOOLS.write, addArgs({
    content: "Deployment evidence was captured in session one.",
    kind: "session",
    tags: ["deployment"],
    sourceId: "session-one",
    evidenceOverrides: { source_type: "session" },
    idempotencyKey: "session-add-0001",
  }));
  await runtime.run(TOOLS.write, addArgs({
    content: "Deployment evidence also exists as a durable fact.",
    kind: "fact",
    tags: ["deployment"],
    sourceId: "artifact-one",
    expectedRevision: 1,
    idempotencyKey: "session-add-0002",
  }));
  await runtime.run(TOOLS.write, addArgs({
    content: "Deployment evidence from an operator-only session note.",
    kind: "session",
    tags: ["deployment"],
    sourceId: "operator-session-note",
    expectedRevision: 2,
    idempotencyKey: "session-add-0003",
  }));
  const before = await store.read();
  const found = await runtime.run(TOOLS.sessionSearch, {
    scope: SCOPE,
    query: "deployment evidence",
    session_id: "session-one",
  });
  assert.equal(found.results.length, 1);
  assert.equal(found.results[0].kind, "session");
  assert.equal(found.results[0].citation.source_ids[0].source_id, "session-one");
  assert.equal((await runtime.run(TOOLS.sessionSearch, {
    scope: SCOPE,
    query: "operator only",
  })).results.length, 0);
  assert.equal((await runtime.run(TOOLS.sessionSearch, {
    scope: SCOPE,
    query: "deployment evidence",
    session_id: "session-two",
  })).results.length, 0);
  const after = await store.read();
  assert.equal(after.revision, before.revision);
  assert.equal(after.events.length, before.events.length);
});

test("compaction inherits common kind and unioned tags so session recall stays reachable", async (t) => {
  const { runtime } = await fixture(t, "session-compact");
  const first = await runtime.run(TOOLS.write, addArgs({
    content: "Session one recorded deployment tests.",
    kind: "session",
    tags: ["deployment"],
    sourceId: "session-one",
    evidenceOverrides: { source_type: "session" },
    idempotencyKey: "session-compact-add-0001",
  }));
  const second = await runtime.run(TOOLS.write, addArgs({
    content: "Session one recorded restart evidence.",
    kind: "session",
    tags: ["restart"],
    sourceId: "session-one",
    evidenceOverrides: { source_type: "session" },
    expectedRevision: 1,
    idempotencyKey: "session-compact-add-0002",
  }));
  const compacted = await runtime.run(TOOLS.compact, {
    scope: SCOPE,
    target: "memory",
    entries: [
      { entry_id: first.entry.id, previous_content: first.entry.content },
      { entry_id: second.entry.id, previous_content: second.entry.content },
    ],
    content: "Session one: deployment tests and restart evidence.",
    reason: "Preserve one cited session record.",
    evidence: evidence(
      "session-one",
      "The session evidence was explicitly compacted.",
      { source_type: "session" },
    ),
    operator: OPERATOR,
    expected_revision: 2,
    idempotency_key: "session-compact-run-0001",
  });
  assert.equal(compacted.entry.kind, "session");
  assert.deepEqual(compacted.entry.tags, ["deployment", "restart"]);
  assert.equal((await runtime.run(TOOLS.sessionSearch, {
    scope: SCOPE,
    query: "deployment restart",
    session_id: "session-one",
  })).results.length, 1);
  assert.equal((await runtime.run(TOOLS.search, {
    scope: SCOPE,
    query: "deployment restart",
    tags: ["deployment", "restart"],
  })).results.length, 1);
});
