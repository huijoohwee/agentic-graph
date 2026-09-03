// =============================================================================
// Media artifact sync — unit tests
// agentic-graph-widget-canvas-media spec · Task 9
// Requirements: R5.1, R5.2, R5.5, R5.6, R5.7, R5.9, R5.10
//
// Uses the same in-memory D1 mock as media-persist.test.mjs.
// Pure offline — ZERO network calls, ZERO paid actions.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Inline in-memory D1DatabaseLike mock (mirrors mediaArtifacts.test.mjs)
// ---------------------------------------------------------------------------

class InMemoryD1 {
  constructor() { this._tables = new Map(); }
  _table(name) {
    if (!this._tables.has(name)) this._tables.set(name, new Map());
    return this._tables.get(name);
  }
  prepare(sql) { return new PreparedStatement(sql.trim(), this); }
}

class PreparedStatement {
  constructor(sql, db) { this._sql = sql; this._db = db; this._values = []; }
  bind(...values) { this._values = values; return this; }

  async run() {
    const sql = this._sql;
    const vals = this._values;
    if (/^INSERT INTO media_artifacts/i.test(sql)) {
      const t = this._db._table("media_artifacts");
      const colMatch = sql.match(/\(([^)]+)\)\s+VALUES/i);
      if (!colMatch) throw new Error("Bad INSERT: " + sql);
      const cols = colMatch[1].split(",").map((c) => c.trim());
      const row = {};
      cols.forEach((col, i) => { row[col] = vals[i] ?? null; });
      const key = `${row.workspace_id}:${row.id}`;
      for (const [, ex] of t) {
        if (ex.workspace_id === row.workspace_id && ex.content_hash === row.content_hash && ex.id !== row.id)
          throw new Error("UNIQUE constraint failed: media_artifacts.workspace_id, media_artifacts.content_hash");
      }
      t.set(key, row);
      return { success: true };
    }
    if (/^UPDATE media_artifacts SET/i.test(sql)) {
      const t = this._db._table("media_artifacts");
      const setMatch = sql.match(/SET\s+([\s\S]+?)\s+WHERE/i);
      if (!setMatch) throw new Error("Bad UPDATE");
      const setParts = setMatch[1].split(",").map((s) => s.trim());
      const whereId = String(vals[vals.length - 2]);
      const whereWs = String(vals[vals.length - 1]);
      const key = `${whereWs}:${whereId}`;
      const existing = t.get(key);
      if (!existing) return { success: true };
      const setCols = setParts.map((p) => p.slice(0, p.indexOf("=")).trim());
      setCols.forEach((col, i) => { existing[col] = vals[i]; });
      return { success: true };
    }
    throw new Error("Unsupported SQL in run(): " + sql);
  }

  async all() {
    const sql = this._sql;
    const vals = this._values;
    const t = this._db._table("media_artifacts");
    const rows = [...t.values()];
    if (/SELECT version FROM media_artifacts WHERE id = \? AND workspace_id = \?/i.test(sql)) {
      const [id, wsId] = vals;
      const row = t.get(`${wsId}:${id}`);
      return { results: row ? [{ version: row.version }] : [] };
    }
    if (/SELECT \* FROM media_artifacts WHERE id = \? AND workspace_id = \?/i.test(sql)) {
      const [id, wsId] = vals;
      const row = t.get(`${wsId}:${id}`);
      return { results: row ? [row] : [] };
    }
    if (/SELECT \* FROM media_artifacts WHERE workspace_id = \? AND run_id = \?/i.test(sql)) {
      const [wsId, runId] = vals;
      return { results: rows.filter((r) => r.workspace_id === wsId && r.run_id === runId).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))) };
    }
    if (/SELECT \* FROM media_artifacts WHERE workspace_id = \? AND content_hash = \?/i.test(sql)) {
      const [wsId, ch] = vals;
      const found = rows.find((r) => r.workspace_id === wsId && r.content_hash === ch);
      return { results: found ? [found] : [] };
    }
    throw new Error("Unsupported SQL in all(): " + sql);
  }
}

// ---------------------------------------------------------------------------
// Import the sync module by reproducing its logic inline (same approach as
// mediaArtifacts.test.mjs) so the tests run without a TypeScript build step.
// ---------------------------------------------------------------------------

// Re-implement upsertMediaArtifact and readMediaArtifactsByRun as pure JS to
// avoid importing the TS source directly in the offline Node test.

class MediaArtifactStaleWriteError extends Error {
  constructor(id, stored, incoming) {
    super(`stale write for "${id}": incoming ${incoming} < stored ${stored}`);
    this.name = "MediaArtifactStaleWriteError";
    this.id = id; this.storedVersion = stored; this.incomingVersion = incoming;
  }
}

class MediaArtifactSyncWriteError extends Error {
  constructor(failedIds, attemptCount, cause) {
    super(`sync write failed for [${failedIds.join(",")}] after ${attemptCount} attempt(s)`);
    this.name = "MediaArtifactSyncWriteError";
    this.failedIds = failedIds; this.attemptCount = attemptCount; this.cause = cause;
  }
}

class MediaArtifactSyncRetrieveError extends Error {
  constructor(ws, run, cause) {
    super(`retrieve failed for run "${run}" in workspace "${ws}"`);
    this.name = "MediaArtifactSyncRetrieveError";
    this.workspaceId = ws; this.runId = run; this.cause = cause;
  }
}

function normStr(v) { return String(v || "").trim(); }
function normNum(v, fb = 0) { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fb; }
function isoFromMs(ms, fb) { if (!Number.isFinite(ms) || ms <= 0) return fb; try { return new Date(ms).toISOString(); } catch { return fb; } }

async function execute(db, sql, vals = []) { await db.prepare(sql).bind(...vals).run(); }
async function queryFirst(db, sql, vals = []) {
  const r = await db.prepare(sql).bind(...vals).all();
  return Array.isArray(r.results) ? (r.results[0] ?? null) : null;
}
async function queryAll(db, sql, vals = []) {
  const r = await db.prepare(sql).bind(...vals).all();
  return Array.isArray(r.results) ? r.results : [];
}

function toRow(raw) {
  return {
    id: normStr(raw.id), workspace_id: normStr(raw.workspace_id),
    run_id: normStr(raw.run_id), stage_id: normStr(raw.stage_id), shot_id: normStr(raw.shot_id),
    kind: normStr(raw.kind), durable_r2_url: normStr(raw.durable_r2_url),
    content_hash: normStr(raw.content_hash),
    media_type: typeof raw.media_type === "string" ? raw.media_type : null,
    provenance_json: normStr(raw.provenance_json),
    layout_json: typeof raw.layout_json === "string" ? raw.layout_json : null,
    version: normNum(raw.version), created_at: normStr(raw.created_at), updated_at: normStr(raw.updated_at),
  };
}

function rowToRecord(row) {
  return {
    id: row.id, workspaceId: row.workspace_id, runId: row.run_id,
    stageId: row.stage_id, shotId: row.shot_id, kind: row.kind,
    durableR2Url: row.durable_r2_url, contentHash: row.content_hash,
    mediaType: row.media_type, provenanceJson: row.provenance_json,
    layoutJson: row.layout_json, version: row.version,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function upsertMediaArtifact(db, record, nowIso) {
  const id = record.id ?? `${record.runId}:${record.stageId}:${record.shotId}`;
  const createdAt = record.createdAtMs ? isoFromMs(record.createdAtMs, nowIso) : nowIso;
  const updatedAt = record.updatedAtMs ? isoFromMs(record.updatedAtMs, nowIso) : nowIso;
  const existing = await queryFirst(db, "SELECT version FROM media_artifacts WHERE id = ? AND workspace_id = ?", [id, record.workspaceId]);
  if (existing !== null) {
    const stored = normNum(existing.version), incoming = normNum(record.version);
    if (incoming < stored) throw new MediaArtifactStaleWriteError(id, stored, incoming);
    await execute(db, `UPDATE media_artifacts SET run_id=?,stage_id=?,shot_id=?,kind=?,durable_r2_url=?,content_hash=?,media_type=?,provenance_json=?,layout_json=?,version=?,updated_at=? WHERE id=? AND workspace_id=?`,
      [record.runId, record.stageId, record.shotId, record.kind, record.durableR2Url, record.contentHash, record.mediaType ?? null, record.provenanceJson, record.layoutJson ?? null, incoming, updatedAt, id, record.workspaceId]);
    return;
  }
  await execute(db, `INSERT INTO media_artifacts (id,workspace_id,run_id,stage_id,shot_id,kind,durable_r2_url,content_hash,media_type,provenance_json,layout_json,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, record.workspaceId, record.runId, record.stageId, record.shotId, record.kind, record.durableR2Url, record.contentHash, record.mediaType ?? null, record.provenanceJson, record.layoutJson ?? null, normNum(record.version), createdAt, updatedAt]);
}

async function readMediaArtifactsByRun(db, wsId, runId) {
  const rows = await queryAll(db, "SELECT * FROM media_artifacts WHERE workspace_id = ? AND run_id = ? ORDER BY created_at ASC", [wsId, runId]);
  return rows.map((r) => rowToRecord(toRow(r)));
}

// ------- Sync writer (mirrors mediaArtifactSync.ts logic) --------------------

function rejectAfter(ms, msg) { return new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms)); }

function createMediaArtifactSyncWriter(db, opts = {}, onConflict = null) {
  const debounceMs = typeof opts.debounceMs === "number" && opts.debounceMs >= 0 ? opts.debounceMs : 500;
  const writeTimeoutMs = typeof opts.writeTimeoutMs === "number" && opts.writeTimeoutMs > 0 ? opts.writeTimeoutMs : 2000;
  const maxRetries = typeof opts.maxRetries === "number" && opts.maxRetries >= 0 ? opts.maxRetries : 3;

  let pending = null;
  let debounceTimer = null;

  async function writeWithRetry(wsId, artifacts, nowIso, attemptsLeft) {
    const failedIds = [];
    let lastErr;
    for (const a of artifacts) {
      try {
        await Promise.race([upsertMediaArtifact(db, a, nowIso), rejectAfter(writeTimeoutMs, "timeout")]);
      } catch (err) {
        if (err instanceof MediaArtifactStaleWriteError) {
          onConflict?.({ id: err.id, storedVersion: err.storedVersion, incomingVersion: err.incomingVersion, resolution: "pending" });
          throw err;
        }
        failedIds.push(a.id ?? `${a.runId}:${a.stageId}:${a.shotId}`);
        lastErr = err;
      }
    }
    if (failedIds.length > 0) {
      if (attemptsLeft > 1) {
        const failed = artifacts.filter((a) => failedIds.includes(a.id ?? `${a.runId}:${a.stageId}:${a.shotId}`));
        return writeWithRetry(wsId, failed, nowIso, attemptsLeft - 1);
      }
      throw new MediaArtifactSyncWriteError(failedIds, maxRetries, lastErr);
    }
    const runId = artifacts[0]?.runId ?? "";
    if (!runId) return [];
    return readMediaArtifactsByRun(db, wsId, runId);
  }

  function scheduledFlush() {
    const args = pending;
    pending = null;
    debounceTimer = null;
    if (!args) return;
    const attempts = maxRetries > 0 ? maxRetries : 1;
    writeWithRetry(args.workspaceId, args.artifacts, args.nowIso, attempts).then(args.resolve).catch(args.reject);
  }

  function save(args) {
    return new Promise((resolve, reject) => {
      if (pending) pending.resolve([]);
      pending = { workspaceId: args.workspaceId, runId: args.runId, artifacts: args.artifacts, nowIso: args.nowIso ?? new Date().toISOString(), resolve, reject };
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      if (debounceMs === 0) { scheduledFlush(); } else { debounceTimer = setTimeout(scheduledFlush, debounceMs); }
    });
  }

  function flush() {
    if (debounceTimer !== null) { clearTimeout(debounceTimer); debounceTimer = null; }
    scheduledFlush();
    return Promise.resolve([]);
  }

  return { save, flush };
}

async function retrieveMediaArtifacts(db, args, opts = {}) {
  const retrieveTimeoutMs = typeof opts.retrieveTimeoutMs === "number" && opts.retrieveTimeoutMs > 0 ? opts.retrieveTimeoutMs : 3000;
  try {
    return await Promise.race([readMediaArtifactsByRun(db, args.workspaceId, args.runId), rejectAfter(retrieveTimeoutMs, "retrieve timeout")]);
  } catch (err) {
    throw new MediaArtifactSyncRetrieveError(args.workspaceId, args.runId, err);
  }
}

function resolveConflict(conflict, choice) {
  return { ...conflict, resolution: choice };
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const WS = "ws-test";
const RUN = "run-001";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const PROV = JSON.stringify({ goalRef: "g", briefRef: "b", planRef: "p", toolCalls: [], verificationChecks: [] });
const DURABLE = "https://airvio.co/api/storage/media/runs/run-001/render/shot-1.png";

function artifact(overrides = {}) {
  return { workspaceId: WS, runId: RUN, stageId: "render", shotId: "shot-1", kind: "image", durableR2Url: DURABLE, contentHash: HASH_A, provenanceJson: PROV, version: 1, ...overrides };
}

// ---------------------------------------------------------------------------
// 1. Debounce: rapid calls batch and save only once
// ---------------------------------------------------------------------------

test("debounce: rapid successive saves resolve once and produce correct records (R5.1)", async () => {
  const db = new InMemoryD1();
  const writer = createMediaArtifactSyncWriter(db, { debounceMs: 30 });

  // Fire 3 rapid saves with different versions — only the last should persist
  const p1 = writer.save({ workspaceId: WS, runId: RUN, artifacts: [artifact({ version: 1, contentHash: HASH_A })], nowIso: "2025-01-01T00:00:01.000Z" });
  const p2 = writer.save({ workspaceId: WS, runId: RUN, artifacts: [artifact({ version: 2, contentHash: HASH_A })], nowIso: "2025-01-01T00:00:02.000Z" });
  const p3 = writer.save({ workspaceId: WS, runId: RUN, artifacts: [artifact({ version: 3, contentHash: HASH_A })], nowIso: "2025-01-01T00:00:03.000Z" });

  // p1 and p2 should resolve with [] (superseded by later call)
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.deepEqual(r1, [], "superseded save should resolve with empty array");
  assert.deepEqual(r2, [], "superseded save should resolve with empty array");

  // p3 should resolve with the saved records
  const r3 = await p3;
  assert.equal(r3.length, 1, "final save should return the persisted record");
  assert.equal(r3[0].version, 3);
});

test("debounce: zero debounceMs saves immediately without waiting (R5.1)", async () => {
  const db = new InMemoryD1();
  const writer = createMediaArtifactSyncWriter(db, { debounceMs: 0 });

  const result = await writer.save({ workspaceId: WS, runId: RUN, artifacts: [artifact()], nowIso: "2025-01-01T00:00:00.000Z" });
  assert.equal(result.length, 1);
  assert.equal(result[0].runId, RUN);
});

// ---------------------------------------------------------------------------
// 2. Write failure: 3 retries then MediaArtifactSyncWriteError
// ---------------------------------------------------------------------------

test("write failure: throws MediaArtifactSyncWriteError after maxRetries exhaustion (R5.9)", async () => {
  // Build a D1 that always throws on INSERT/UPDATE
  const failingDb = {
    prepare(sql) {
      return {
        bind(..._v) { return this; },
        async run() { throw new Error("D1 unavailable"); },
        async all() {
          // SELECT version → nothing (forces INSERT path)
          if (/SELECT version/i.test(sql)) return { results: [] };
          throw new Error("D1 unavailable");
        },
      };
    },
  };

  const writer = createMediaArtifactSyncWriter(failingDb, { debounceMs: 0, maxRetries: 2, writeTimeoutMs: 5000 });

  await assert.rejects(
    () => writer.save({ workspaceId: WS, runId: RUN, artifacts: [artifact()], nowIso: "2025-01-01T00:00:00.000Z" }),
    (err) => {
      assert.ok(err instanceof MediaArtifactSyncWriteError, `expected MediaArtifactSyncWriteError, got ${err?.constructor?.name}`);
      assert.equal(err.name, "MediaArtifactSyncWriteError");
      assert.ok(Array.isArray(err.failedIds) && err.failedIds.length > 0);
      assert.equal(typeof err.attemptCount, "number");
      return true;
    },
  );
});

test("write failure: failed ids are identified in the error (R5.9)", async () => {
  let callCount = 0;
  const partialFailDb = {
    prepare(sql) {
      return {
        bind(..._v) { return this; },
        async run() {
          callCount++;
          throw new Error("fail");
        },
        async all() {
          if (/SELECT version/i.test(sql)) return { results: [] };
          throw new Error("fail");
        },
      };
    },
  };

  const writer = createMediaArtifactSyncWriter(partialFailDb, { debounceMs: 0, maxRetries: 1 });
  let caught = null;
  try {
    await writer.save({ workspaceId: WS, runId: RUN, artifacts: [artifact({ shotId: "s1" }), artifact({ shotId: "s2", contentHash: HASH_B })], nowIso: "2025-01-01T00:00:00.000Z" });
  } catch (err) { caught = err; }

  assert.ok(caught instanceof MediaArtifactSyncWriteError);
  assert.ok(caught.failedIds.length >= 1);
  assert.ok(caught.failedIds.every((id) => typeof id === "string" && id.length > 0));
});

// ---------------------------------------------------------------------------
// 3. Stale write: conflict surfaced, stored record unchanged
// ---------------------------------------------------------------------------

test("stale write: conflict callback is invoked, stored record is not overwritten (R5.6, R5.7)", async () => {
  const db = new InMemoryD1();
  // Insert initial record at version 5
  await upsertMediaArtifact(db, artifact({ version: 5 }), "2025-01-01T00:00:00.000Z");

  const conflicts = [];
  const writer = createMediaArtifactSyncWriter(db, { debounceMs: 0 }, (c) => conflicts.push(c));

  await assert.rejects(
    () => writer.save({ workspaceId: WS, runId: RUN, artifacts: [artifact({ version: 3 })], nowIso: "2025-01-01T00:00:01.000Z" }),
    (err) => {
      assert.ok(err instanceof MediaArtifactStaleWriteError, `expected MediaArtifactStaleWriteError, got ${err?.constructor?.name}`);
      return true;
    },
  );

  assert.equal(conflicts.length, 1, "conflict callback must be invoked once");
  const c = conflicts[0];
  assert.equal(c.storedVersion, 5);
  assert.equal(c.incomingVersion, 3);
  assert.equal(c.resolution, "pending");

  // Stored record must still be at version 5
  const records = await readMediaArtifactsByRun(db, WS, RUN);
  assert.equal(records[0].version, 5, "stored version must remain 5 after stale-write rejection");
});

// ---------------------------------------------------------------------------
// 4. Retrieval: success and failure paths
// ---------------------------------------------------------------------------

test("retrieveMediaArtifacts returns records for an existing run (R5.2)", async () => {
  const db = new InMemoryD1();
  await upsertMediaArtifact(db, artifact({ contentHash: HASH_A }), "2025-01-01T00:00:00.000Z");
  await upsertMediaArtifact(db, artifact({ shotId: "shot-2", contentHash: HASH_B }), "2025-01-01T00:00:01.000Z");

  const records = await retrieveMediaArtifacts(db, { workspaceId: WS, runId: RUN });
  assert.equal(records.length, 2);
  assert.ok(records.every((r) => r.runId === RUN));
});

test("retrieveMediaArtifacts returns empty array when no artifacts exist (R5.2)", async () => {
  const db = new InMemoryD1();
  const records = await retrieveMediaArtifacts(db, { workspaceId: WS, runId: "nonexistent" });
  assert.deepEqual(records, []);
});

test("retrieveMediaArtifacts throws MediaArtifactSyncRetrieveError on D1 failure (R5.10)", async () => {
  const brokenDb = {
    prepare() {
      return { bind(..._v) { return this; }, async run() { throw new Error("D1 error"); }, async all() { throw new Error("D1 error"); } };
    },
  };

  await assert.rejects(
    () => retrieveMediaArtifacts(brokenDb, { workspaceId: WS, runId: RUN }),
    (err) => {
      assert.ok(err instanceof MediaArtifactSyncRetrieveError, `expected MediaArtifactSyncRetrieveError, got ${err?.constructor?.name}`);
      assert.equal(err.name, "MediaArtifactSyncRetrieveError");
      assert.equal(err.workspaceId, WS);
      assert.equal(err.runId, RUN);
      return true;
    },
  );
});

test("retrieveMediaArtifacts throws on timeout (R5.10)", async () => {
  const slowDb = {
    prepare() {
      return { bind(..._v) { return this; }, async run() { throw new Error("slow"); }, async all() { await new Promise((r) => setTimeout(r, 500)); return { results: [] }; } };
    },
  };

  await assert.rejects(
    () => retrieveMediaArtifacts(slowDb, { workspaceId: WS, runId: RUN }, { retrieveTimeoutMs: 50 }),
    (err) => {
      assert.ok(err instanceof MediaArtifactSyncRetrieveError);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// 5. resolveConflict helper
// ---------------------------------------------------------------------------

test("resolveConflict returns a conflict with resolution=accept-local (R5.6)", () => {
  const conflict = { id: "r:s:sh", storedVersion: 5, incomingVersion: 2, resolution: "pending" };
  const resolved = resolveConflict(conflict, "accept-local");
  assert.equal(resolved.resolution, "accept-local");
  assert.equal(resolved.id, conflict.id);
  assert.equal(resolved.storedVersion, 5);
  assert.equal(resolved.incomingVersion, 2);
});

test("resolveConflict returns a conflict with resolution=accept-remote (R5.6)", () => {
  const conflict = { id: "r:s:sh", storedVersion: 5, incomingVersion: 2, resolution: "pending" };
  const resolved = resolveConflict(conflict, "accept-remote");
  assert.equal(resolved.resolution, "accept-remote");
});

test("resolveConflict does not mutate the original conflict object (R5.6)", () => {
  const conflict = { id: "x", storedVersion: 3, incomingVersion: 1, resolution: "pending" };
  const resolved = resolveConflict(conflict, "accept-local");
  assert.equal(conflict.resolution, "pending", "original must be unchanged");
  assert.equal(resolved.resolution, "accept-local");
});

// ---------------------------------------------------------------------------
// 6. Error class shapes
// ---------------------------------------------------------------------------

test("MediaArtifactSyncWriteError has correct name and shape", () => {
  const err = new MediaArtifactSyncWriteError(["r:s:s1", "r:s:s2"], 3, new Error("cause"));
  assert.equal(err.name, "MediaArtifactSyncWriteError");
  assert.deepEqual(err.failedIds, ["r:s:s1", "r:s:s2"]);
  assert.equal(err.attemptCount, 3);
  assert.ok(err instanceof Error);
  assert.ok(typeof err.message === "string" && err.message.length > 0);
});

test("MediaArtifactSyncRetrieveError has correct name and shape", () => {
  const err = new MediaArtifactSyncRetrieveError("ws-1", "run-1", new Error("cause"));
  assert.equal(err.name, "MediaArtifactSyncRetrieveError");
  assert.equal(err.workspaceId, "ws-1");
  assert.equal(err.runId, "run-1");
  assert.ok(err instanceof Error);
});
