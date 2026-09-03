import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  PersistentMemoryStoreError,
  createLocalPersistentMemoryStore,
  createPersistentMemoryFileStore,
  resolvePersistentMemoryStateDirectory,
} from "../persistent-memory-store.js";

const requestDigest = (value) => createHash("sha256").update(value).digest("hex");

async function storeFixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "persistent-memory-store-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return {
    directory,
    store: createPersistentMemoryFileStore({
      directory,
      storeId: "memory-test",
      now: () => 1_000,
      ...options,
    }),
  };
}

const addMemory = (id, memory) => (draft, { nextRevision }) => {
  draft.entries.push({ id, memory });
  draft.events.push({ type: "memory.added", id, revision: nextRevision });
  return { ok: true, memory_id: id, store_revision: nextRevision };
};

test("persistent memory survives restart without expiry or path disclosure", async (t) => {
  const { directory, store } = await storeFixture(t);
  const initial = await store.read();
  assert.equal(initial.schema, "agentic-graph-persistent-memory-store/v1");
  assert.equal(initial.revision, 0);
  assert.deepEqual(initial.entries, []);
  assert.deepEqual(initial.events, []);
  assert.deepEqual(initial.receipts, []);
  assert.match(initial.checksum, /^[a-f0-9]{64}$/);

  const result = await store.transact({
    expectedRevision: 0,
    idempotencyKey: "add-memory-1",
    requestDigest: requestDigest("add-memory-1"),
    apply: addMemory("memory-1", "Keep source-owned runtime state."),
  });
  assert.deepEqual(result, {
    ok: true,
    memory_id: "memory-1",
    store_revision: 1,
  });

  const restarted = createPersistentMemoryFileStore({
    directory,
    storeId: "memory-test",
    now: () => 9_000_000_000_000,
  });
  const state = await restarted.read();
  assert.equal(state.revision, 1);
  assert.equal(state.entries[0].memory, "Keep source-owned runtime state.");
  assert.equal(state.events.length, 1);
  assert.equal(state.receipts.length, 1);
  assert.equal(JSON.stringify({ result, state }).includes(directory), false);
});

test("checksum corruption fails closed", async (t) => {
  const { directory, store } = await storeFixture(t);
  await store.transact({
    expectedRevision: 0,
    apply: addMemory("memory-1", "Original memory."),
  });

  const manifestsDirectory = path.join(directory, "manifests");
  const [manifestName] = await readdir(manifestsDirectory);
  const manifestPath = path.join(manifestsDirectory, manifestName);
  const state = JSON.parse(await readFile(manifestPath, "utf8"));
  state.entries[0].memory = "Tampered memory.";
  await writeFile(manifestPath, `${JSON.stringify(state)}\n`, "utf8");

  await assert.rejects(
    store.read(),
    (error) => (
      error instanceof PersistentMemoryStoreError
      && error.code === "corrupt_state"
      && /checksum/.test(error.message)
    ),
  );
});

test("transactions enforce revision compare-and-set before apply", async (t) => {
  const { store } = await storeFixture(t);
  await store.transact({
    expectedRevision: 0,
    apply: addMemory("memory-1", "First memory."),
  });
  let applied = false;
  await assert.rejects(
    store.transact({
      expectedRevision: 0,
      apply: (draft) => {
        applied = true;
        draft.entries.push({ id: "memory-2", memory: "Must not commit." });
        return { ok: true };
      },
    }),
    (error) => (
      error instanceof PersistentMemoryStoreError
      && error.code === "stale_revision"
      && error.currentRevision === 1
    ),
  );
  assert.equal(applied, false);
  const state = await store.read();
  assert.equal(state.revision, 1);
  assert.deepEqual(state.entries.map(({ id }) => id), ["memory-1"]);
});

test("idempotency receipts replay before CAS and reject changed requests", async (t) => {
  const { store } = await storeFixture(t);
  const digest = requestDigest("same-request");
  let applyCount = 0;
  const first = await store.transact({
    expectedRevision: 0,
    idempotencyKey: "request-1",
    requestDigest: digest,
    apply: (draft, context) => {
      applyCount += 1;
      return addMemory("memory-1", "Idempotent memory.")(draft, context);
    },
  });
  const replay = await store.transact({
    expectedRevision: 0,
    idempotencyKey: "request-1",
    requestDigest: digest,
    apply: () => {
      throw new Error("replayed transaction must not call apply");
    },
  });
  assert.deepEqual(replay, first);
  assert.equal(applyCount, 1);

  await assert.rejects(
    store.transact({
      expectedRevision: 0,
      idempotencyKey: "request-1",
      requestDigest: requestDigest("changed-request"),
      apply: () => ({ ok: false }),
    }),
    (error) => (
      error instanceof PersistentMemoryStoreError
      && error.code === "idempotency_conflict"
    ),
  );
});

test("concurrent stores commit a same-key request exactly once", async (t) => {
  const { directory, store: left } = await storeFixture(t);
  const right = createPersistentMemoryFileStore({
    directory,
    storeId: "memory-test",
    now: () => 1_000,
  });
  const digest = requestDigest("concurrent-request");
  let applyCount = 0;
  const transact = (store) => store.transact({
    expectedRevision: 0,
    idempotencyKey: "concurrent-key",
    requestDigest: digest,
    apply: (draft, context) => {
      applyCount += 1;
      return addMemory("memory-1", "One durable write.")(draft, context);
    },
  });
  const [leftResult, rightResult] = await Promise.all([
    transact(left),
    transact(right),
  ]);
  assert.deepEqual(leftResult, rightResult);
  assert.equal(applyCount, 1);
  const state = await left.read();
  assert.equal(state.revision, 1);
  assert.equal(state.entries.length, 1);
  assert.equal(state.receipts.length, 1);
});

test("strict bounds reject an oversized draft without committing it", async (t) => {
  const { store } = await storeFixture(t, {
    limits: { maxEntries: 1 },
  });
  await assert.rejects(
    store.transact({
      expectedRevision: 0,
      apply: (draft, { nextRevision }) => {
        draft.entries.push(
          { id: "memory-1", memory: "First." },
          { id: "memory-2", memory: "Second." },
        );
        return { ok: true, store_revision: nextRevision };
      },
    }),
    (error) => (
      error instanceof PersistentMemoryStoreError
      && error.code === "capacity_reached"
    ),
  );
  assert.equal((await store.read()).revision, 0);
});

test("local store router isolates exact scopes, revisions, and quotas", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "persistent-memory-router-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const router = createLocalPersistentMemoryStore({
    rootDir: process.cwd(),
    env: {
      AGENTIC_OS_MEMORY_STATE_DIR: directory,
      AGENTIC_OS_MEMORY_STORE_ID: "operator-local",
    },
    now: () => 1_000,
    limits: { maxEntries: 1 },
  });
  const scopeA = {
    tenant_id: "tenant-a",
    workspace_id: "workspace-a",
    agent_id: "agent-a",
    subject_id: "subject-a",
  };
  const scopeB = { ...scopeA, subject_id: "subject-b" };
  const storeA = router.forScope(scopeA);
  const storeB = router.forScope(scopeB);
  assert.equal(router.forScope({ ...scopeA }), storeA);
  assert.notEqual(storeA.storeId, storeB.storeId);
  assert.equal(JSON.stringify([storeA.storeId, storeB.storeId]).includes("subject"), false);

  await storeA.transact({ expectedRevision: 0, apply: addMemory("a-1", "Scope A.") });
  await storeB.transact({ expectedRevision: 0, apply: addMemory("b-1", "Scope B.") });
  assert.deepEqual((await storeA.read()).entries.map(({ id }) => id), ["a-1"]);
  assert.deepEqual((await storeB.read()).entries.map(({ id }) => id), ["b-1"]);
  assert.equal((await storeA.read()).revision, 1);
  assert.equal((await storeB.read()).revision, 1);
  const restarted = createLocalPersistentMemoryStore({
    rootDir: process.cwd(),
    env: {
      AGENTIC_OS_MEMORY_STATE_DIR: directory,
      AGENTIC_OS_MEMORY_STORE_ID: "operator-local",
    },
    now: () => 2_000,
    limits: { maxEntries: 1 },
  });
  assert.equal(restarted.forScope(scopeA).storeId, storeA.storeId);
  assert.equal((await restarted.forScope(scopeA).read()).entries[0].id, "a-1");
  await assert.rejects(
    storeA.transact({ expectedRevision: 1, apply: addMemory("a-2", "Over quota.") }),
    (error) => error instanceof PersistentMemoryStoreError && error.code === "capacity_reached",
  );
  assert.equal((await storeB.read()).revision, 1);
  assert.throws(
    () => router.forScope({ ...scopeA, unexpected: "field" }),
    (error) => error instanceof PersistentMemoryStoreError && error.code === "invalid_argument",
  );
});

test("redaction hard-deletes lifecycle content and old receipts across restart", async (t) => {
  const { directory, store } = await storeFixture(t);
  const entryId = "memory-sensitive";
  const entryKey = ["tenant-a", "workspace-a", "agent-a", "subject-a", "memory", entryId].join("\u001f");
  const otherKey = ["tenant-a", "workspace-a", "agent-a", "subject-a", "memory", "memory-other"].join("\u001f");
  const secret = "Sensitive prior memory that must leave durable storage.";
  await store.transact({
    expectedRevision: 0,
    idempotencyKey: "write-sensitive",
    requestDigest: requestDigest("write-sensitive"),
    apply: (draft, { nextRevision }) => {
      const entry = { id: entryId, entry_id: entryId, content: secret };
      draft.entries.push(entry);
      draft.events.push(
        { action: "add", entry_key: entryKey, entry_id: entryId, revision: nextRevision, before: null, after: entry },
        { action: "add", entry_key: otherKey, entry_id: "memory-other", revision: nextRevision },
      );
      return { ok: true, entry, revision: nextRevision };
    },
  });

  await assert.rejects(
    store.transact({
      expectedRevision: 1,
      redactedEntryKey: entryKey,
      redactedEntryId: entryId,
      apply: (draft, { nextRevision }) => {
        draft.events = [{
          action: "redact", entry_key: entryKey, entry_id: entryId, redacted: true, revision: nextRevision,
        }];
        return { ok: true };
      },
    }),
    (error) => error instanceof PersistentMemoryStoreError && error.code === "invalid_argument",
  );

  const redactionResult = await store.transact({
    expectedRevision: 1,
    idempotencyKey: "redact-sensitive",
    requestDigest: requestDigest("redact-sensitive"),
    redactedEntryKey: entryKey,
    redactedEntryId: entryId,
    apply: (draft, { nextRevision }) => {
      draft.entries = draft.entries.filter(({ entry_id: id }) => id !== entryId);
      draft.events = draft.events.filter(({ entry_key: key }) => key !== entryKey);
      draft.events.push({
        action: "redact", entry_key: entryKey, entry_id: entryId, redacted: true, revision: nextRevision,
      });
      return { ok: true, entry: { id: entryId, entry_id: entryId, removed: true }, revision: nextRevision };
    },
  });

  const manifestsDirectory = path.join(directory, "manifests");
  const [manifestName] = await readdir(manifestsDirectory);
  const persistedSource = await readFile(path.join(manifestsDirectory, manifestName), "utf8");
  assert.equal(persistedSource.includes(secret), false);
  const restarted = createPersistentMemoryFileStore({ directory, storeId: "memory-test", now: () => 2_000 });
  const state = await restarted.read();
  assert.deepEqual(state.entries, []);
  assert.deepEqual(state.events.map(({ action, entry_key: key }) => [action, key]), [
    ["add", otherKey],
    ["redact", entryKey],
  ]);
  assert.equal(state.receipts.length, 1);
  assert.equal(JSON.stringify(state.receipts).includes(secret), false);
  const replay = await restarted.transact({
    expectedRevision: 1,
    idempotencyKey: "redact-sensitive",
    requestDigest: requestDigest("redact-sensitive"),
    redactedEntryKey: entryKey,
    redactedEntryId: entryId,
    apply: () => {
      throw new Error("redaction receipt must replay before apply");
    },
  });
  assert.deepEqual(replay, redactionResult);
  assert.equal((await restarted.read()).revision, 2);
});

const runGit = (cwd, args) => execFileSync(
  "git",
  ["-C", cwd, ...args],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);

async function createGitRepository(repositoryPath) {
  execFileSync("git", ["init", repositoryPath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  runGit(repositoryPath, ["config", "user.name", "Persistent Memory Test"]);
  runGit(repositoryPath, ["config", "user.email", "memory-test@example.invalid"]);
  await writeFile(path.join(repositoryPath, "seed.txt"), "seed\n", "utf8");
  runGit(repositoryPath, ["add", "seed.txt"]);
  runGit(repositoryPath, ["commit", "-m", "seed"]);
}

test("state roots isolate repositories and namespaces while sharing a Git common dir", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "persistent-memory-roots-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repositoryA = path.join(root, "agentic-graph-a");
  const repositoryB = path.join(root, "agentic-graph-b");
  const linkedWorktree = path.join(root, "agentic-graph-a-linked");
  const stateHome = path.join(root, "state-home");
  await createGitRepository(repositoryA);
  await createGitRepository(repositoryB);
  runGit(repositoryA, ["worktree", "add", "-b", "memory-test", linkedWorktree]);
  await mkdir(stateHome);

  const env = {
    XDG_STATE_HOME: stateHome,
    AGENTIC_OS_MEMORY_NAMESPACE: "operator-a",
  };
  const canonical = resolvePersistentMemoryStateDirectory(env, repositoryA);
  const linked = resolvePersistentMemoryStateDirectory(env, linkedWorktree);
  const otherRepository = resolvePersistentMemoryStateDirectory(env, repositoryB);
  const otherOperator = resolvePersistentMemoryStateDirectory({
    ...env,
    AGENTIC_OS_MEMORY_NAMESPACE: "operator-b",
  }, repositoryA);

  assert.equal(canonical, linked);
  assert.notEqual(canonical, otherRepository);
  assert.notEqual(canonical, otherOperator);
  assert.equal(canonical.startsWith(`${await realpath(stateHome)}${path.sep}`), true);
});

test("state directory overrides inside the repository are rejected", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "persistent-memory-inside-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = path.join(root, "agentic-graph");
  await createGitRepository(repository);
  assert.throws(
    () => resolvePersistentMemoryStateDirectory({
      AGENTIC_OS_MEMORY_STATE_DIR: path.join(repository, ".memory-state"),
    }, repository),
    /outside the agentic-graph repository/,
  );
});

test("state directory overrides cannot enter the repository through a symlink", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "persistent-memory-symlink-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repository = path.join(root, "agentic-graph");
  const linkedRepository = path.join(root, "state-link");
  await createGitRepository(repository);
  await symlink(repository, linkedRepository, "dir");

  assert.throws(
    () => resolvePersistentMemoryStateDirectory({
      AGENTIC_OS_MEMORY_STATE_DIR: path.join(linkedRepository, ".memory-state"),
    }, repository),
    /outside the agentic-graph repository/,
  );
});
