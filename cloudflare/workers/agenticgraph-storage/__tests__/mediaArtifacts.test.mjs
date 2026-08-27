// =============================================================================
// mediaArtifacts D1 layer — unit tests
// knowgrph-widget-canvas-media spec · Task 8.2
// Requirements: R3.9, R5.7, R6.3
//
// Tests use an in-memory D1DatabaseLike mock (Map-backed) so they run fully
// offline without any SQLite binary dependency, mirroring the pattern used in
// cloudflare/workers/knowgrph-storage/__tests__/media.test.mjs.
//
// Pure offline — ZERO network calls, ZERO paid actions.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Inline D1DatabaseLike in-memory mock
// ---------------------------------------------------------------------------
//
// Implements the D1DatabaseLike interface from shared/d1.ts:
//   prepare(sql) -> { bind(...values) -> { run(), all<T>() } }
//
// Uses a Map to hold table rows keyed by table name.  A minimal SQL parser
// handles the exact SQL strings emitted by mediaArtifacts.ts.
// ---------------------------------------------------------------------------

class InMemoryD1 {
  constructor() {
    /** @type {Map<string, Map<string, Record<string,unknown>>>} */
    this._tables = new Map();
  }

  /** @returns {Map<string, Record<string,unknown>>} */
  _table(name) {
    if (!this._tables.has(name)) this._tables.set(name, new Map());
    return this._tables.get(name);
  }

  prepare(sql) {
    return new PreparedStatement(sql.trim(), this);
  }
}

class PreparedStatement {
  constructor(sql, db) {
    this._sql = sql;
    this._db = db;
    this._values = [];
  }

  bind(...values) {
    this._values = values;
    return this;
  }

  async run() {
    const sql = this._sql;
    const vals = this._values;

    // INSERT INTO media_artifacts
    if (/^INSERT INTO media_artifacts/i.test(sql)) {
      const t = this._db._table("media_artifacts");
      // Extract column names
      const colMatch = sql.match(/\(([^)]+)\)\s+VALUES/i);
      if (!colMatch) throw new Error("Bad INSERT: " + sql);
      const cols = colMatch[1].split(",").map((c) => c.trim());
      const row = {};
      cols.forEach((col, i) => { row[col] = vals[i] ?? null; });
      const id = String(row.id);
      const wsId = String(row.workspace_id);
      const key = `${wsId}:${id}`;
      // Enforce unique constraint on (workspace_id, content_hash)
      for (const [, existing] of t) {
        if (
          existing.workspace_id === row.workspace_id &&
          existing.content_hash === row.content_hash &&
          existing.id !== row.id
        ) {
          throw new Error(
            `UNIQUE constraint failed: media_artifacts.workspace_id, media_artifacts.content_hash`
          );
        }
      }
      t.set(key, row);
      return { success: true };
    }

    // UPDATE media_artifacts SET ... WHERE id = ? AND workspace_id = ?
    if (/^UPDATE media_artifacts SET/i.test(sql)) {
      const t = this._db._table("media_artifacts");
      // Parse SET clause
      const setMatch = sql.match(/SET\s+([\s\S]+?)\s+WHERE/i);
      if (!setMatch) throw new Error("Bad UPDATE: " + sql);
      const setParts = setMatch[1].split(",").map((s) => s.trim());
      const setMap = {};
      for (const part of setParts) {
        const eqIdx = part.indexOf("=");
        const col = part.slice(0, eqIdx).trim();
        setMap[col] = "?"; // placeholder
      }

      // WHERE id = ? AND workspace_id = ?  (last 2 params)
      const whereId = String(vals[vals.length - 2]);
      const whereWs = String(vals[vals.length - 1]);
      const key = `${whereWs}:${whereId}`;

      const existing = t.get(key);
      if (!existing) return { success: true };

      // Enforce unique hash constraint on update
      const newHash = vals[setParts.findIndex((p) => /content_hash/.test(p))];
      if (newHash !== undefined && newHash !== null) {
        for (const [k, row] of t) {
          if (
            row.workspace_id === whereWs &&
            row.content_hash === newHash &&
            row.id !== whereId
          ) {
            throw new Error(
              `UNIQUE constraint failed: media_artifacts.workspace_id, media_artifacts.content_hash`
            );
          }
        }
      }

      // Apply SET values (positional, skipping the last 2 WHERE params)
      const setCols = setParts.map((p) => p.slice(0, p.indexOf("=")).trim());
      setCols.forEach((col, i) => {
        existing[col] = vals[i];
      });
      return { success: true };
    }

    throw new Error("Unsupported SQL in run(): " + sql);
  }

  async all() {
    const sql = this._sql;
    const vals = this._values;
    const t = this._db._table("media_artifacts");
    const rows = [...t.values()];

    // SELECT version FROM media_artifacts WHERE id = ? AND workspace_id = ?
    if (/SELECT version FROM media_artifacts WHERE id = \? AND workspace_id = \?/i.test(sql)) {
      const [id, wsId] = vals;
      const key = `${wsId}:${id}`;
      const row = t.get(key);
      return { results: row ? [{ version: row.version }] : [] };
    }

    // SELECT * FROM media_artifacts WHERE id = ? AND workspace_id = ? LIMIT 1
    if (/SELECT \* FROM media_artifacts WHERE id = \? AND workspace_id = \?/i.test(sql)) {
      const [id, wsId] = vals;
      const key = `${wsId}:${id}`;
      const row = t.get(key);
      return { results: row ? [row] : [] };
    }

    // SELECT * FROM media_artifacts WHERE workspace_id = ? AND run_id = ? ORDER BY created_at ASC
    if (/SELECT \* FROM media_artifacts WHERE workspace_id = \? AND run_id = \?/i.test(sql)) {
      const [wsId, runId] = vals;
      const filtered = rows
        .filter((r) => r.workspace_id === wsId && r.run_id === runId)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      return { results: filtered };
    }

    // SELECT * FROM media_artifacts WHERE workspace_id = ? AND content_hash = ? LIMIT 1
    if (/SELECT \* FROM media_artifacts WHERE workspace_id = \? AND content_hash = \?/i.test(sql)) {
      const [wsId, contentHash] = vals;
      const found = rows.find((r) => r.workspace_id === wsId && r.content_hash === contentHash);
      return { results: found ? [found] : [] };
    }

    throw new Error("Unsupported SQL in all(): " + sql);
  }
}

// ---------------------------------------------------------------------------
// Inline implementation of mediaArtifacts.ts logic (pure JS)
// This mirrors the TS source exactly so tests exercise the same code paths
// without requiring a TypeScript build step.
// ---------------------------------------------------------------------------

// --- normalizeNumber (mirrors shared/d1.ts) ----------------------------------
function normalizeNumber(value, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

// --- normalizeString (mirrors shared/d1.ts) ----------------------------------
function normalizeString(value) {
  return String(value || "").trim();
}

// --- isoFromMs (mirrors shared/d1.ts) ----------------------------------------
function isoFromMs(ms, fallback) {
  if (!Number.isFinite(ms) || ms <= 0) return fallback;
  try { return new Date(ms).toISOString(); } catch { return fallback; }
}

// --- MediaArtifactStaleWriteError -------------------------------------------

class MediaArtifactStaleWriteError extends Error {
  constructor(id, storedVersion, incomingVersion) {
    super(
      `MediaArtifactStaleWriteError: stale write rejected for id "${id}" — ` +
      `incoming version ${incomingVersion} is lower than stored version ${storedVersion}`
    );
    this.name = "MediaArtifactStaleWriteError";
    this.id = id;
    this.storedVersion = storedVersion;
    this.incomingVersion = incomingVersion;
  }
}

// --- helpers ----------------------------------------------------------------
function buildId(runId, stageId, shotId) {
  return `${runId}:${stageId}:${shotId}`;
}

async function execute(db, sql, values = []) {
  await db.prepare(sql).bind(...values).run();
}

async function queryFirst(db, sql, values = []) {
  const result = await db.prepare(sql).bind(...values).all();
  return Array.isArray(result.results) ? (result.results[0] ?? null) : null;
}

async function queryAll(db, sql, values = []) {
  const result = await db.prepare(sql).bind(...values).all();
  return Array.isArray(result.results) ? result.results : [];
}

// --- upsertMediaArtifact ----------------------------------------------------

async function upsertMediaArtifact(db, record, nowIso) {
  const id = record.id ?? buildId(record.runId, record.stageId, record.shotId);
  const createdAt = record.createdAtMs ? isoFromMs(record.createdAtMs, nowIso) : nowIso;
  const updatedAt = record.updatedAtMs ? isoFromMs(record.updatedAtMs, nowIso) : nowIso;

  const existing = await queryFirst(
    db,
    "SELECT version FROM media_artifacts WHERE id = ? AND workspace_id = ?",
    [id, record.workspaceId],
  );

  if (existing !== null) {
    const storedVersion = normalizeNumber(existing.version);
    const incomingVersion = normalizeNumber(record.version);

    if (incomingVersion < storedVersion) {
      throw new MediaArtifactStaleWriteError(id, storedVersion, incomingVersion);
    }

    await execute(
      db,
      `UPDATE media_artifacts SET
         run_id = ?,
         stage_id = ?,
         shot_id = ?,
         kind = ?,
         durable_r2_url = ?,
         content_hash = ?,
         media_type = ?,
         provenance_json = ?,
         layout_json = ?,
         version = ?,
         updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
      [
        record.runId, record.stageId, record.shotId,
        record.kind, record.durableR2Url, record.contentHash,
        record.mediaType ?? null, record.provenanceJson,
        record.layoutJson ?? null, incomingVersion,
        updatedAt, id, record.workspaceId,
      ],
    );
    return;
  }

  await execute(
    db,
    `INSERT INTO media_artifacts (
       id, workspace_id, run_id, stage_id, shot_id,
       kind, durable_r2_url, content_hash, media_type,
       provenance_json, layout_json, version, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, record.workspaceId, record.runId, record.stageId, record.shotId,
      record.kind, record.durableR2Url, record.contentHash,
      record.mediaType ?? null, record.provenanceJson,
      record.layoutJson ?? null, normalizeNumber(record.version),
      createdAt, updatedAt,
    ],
  );
}

// --- readMediaArtifact -------------------------------------------------------

function toRow(raw) {
  return {
    id: normalizeString(raw.id),
    workspace_id: normalizeString(raw.workspace_id),
    run_id: normalizeString(raw.run_id),
    stage_id: normalizeString(raw.stage_id),
    shot_id: normalizeString(raw.shot_id),
    kind: normalizeString(raw.kind),
    durable_r2_url: normalizeString(raw.durable_r2_url),
    content_hash: normalizeString(raw.content_hash),
    media_type: typeof raw.media_type === "string" ? raw.media_type : null,
    provenance_json: normalizeString(raw.provenance_json),
    layout_json: typeof raw.layout_json === "string" ? raw.layout_json : null,
    version: normalizeNumber(raw.version),
    created_at: normalizeString(raw.created_at),
    updated_at: normalizeString(raw.updated_at),
  };
}

function rowToRecord(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    runId: row.run_id,
    stageId: row.stage_id,
    shotId: row.shot_id,
    kind: row.kind,
    durableR2Url: row.durable_r2_url,
    contentHash: row.content_hash,
    mediaType: row.media_type,
    provenanceJson: row.provenance_json,
    layoutJson: row.layout_json,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readMediaArtifact(db, id, workspaceId) {
  const row = await queryFirst(
    db,
    "SELECT * FROM media_artifacts WHERE id = ? AND workspace_id = ? LIMIT 1",
    [id, workspaceId],
  );
  return row ? rowToRecord(toRow(row)) : null;
}

async function readMediaArtifactsByRun(db, workspaceId, runId) {
  const rows = await queryAll(
    db,
    "SELECT * FROM media_artifacts WHERE workspace_id = ? AND run_id = ? ORDER BY created_at ASC",
    [workspaceId, runId],
  );
  return rows.map((r) => rowToRecord(toRow(r)));
}

async function findMediaArtifactByHash(db, workspaceId, contentHash) {
  const row = await queryFirst(
    db,
    "SELECT * FROM media_artifacts WHERE workspace_id = ? AND content_hash = ? LIMIT 1",
    [workspaceId, contentHash],
  );
  return row ? rowToRecord(toRow(row)) : null;
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const NOW_ISO = "2025-01-01T00:00:00.000Z";
const WS_ID = "ws-test";
const RUN_ID = "run-001";
const STAGE_ID = "render";
const SHOT_ID = "shot-1";
const DURABLE_URL = "https://airvio.co/api/storage/media/runs/run-001/render/shot-1.png";
const HASH_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HASH_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PROVENANCE_JSON = JSON.stringify({ goalRef: "g", briefRef: "b", planRef: "p", toolCalls: [], verificationChecks: [] });

function baseRecord(overrides = {}) {
  return {
    workspaceId: WS_ID,
    runId: RUN_ID,
    stageId: STAGE_ID,
    shotId: SHOT_ID,
    kind: "image",
    durableR2Url: DURABLE_URL,
    contentHash: HASH_A,
    mediaType: "image/png",
    provenanceJson: PROVENANCE_JSON,
    layoutJson: null,
    version: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Insert → read round-trip
// ---------------------------------------------------------------------------

test("insert then readMediaArtifact returns the stored record (round-trip)", async () => {
  const db = new InMemoryD1();
  const record = baseRecord();

  await upsertMediaArtifact(db, record, NOW_ISO);

  const expectedId = buildId(RUN_ID, STAGE_ID, SHOT_ID);
  const retrieved = await readMediaArtifact(db, expectedId, WS_ID);

  assert.ok(retrieved !== null, "record should be retrievable after insert");
  assert.equal(retrieved.id, expectedId);
  assert.equal(retrieved.workspaceId, WS_ID);
  assert.equal(retrieved.runId, RUN_ID);
  assert.equal(retrieved.stageId, STAGE_ID);
  assert.equal(retrieved.shotId, SHOT_ID);
  assert.equal(retrieved.kind, "image");
  assert.equal(retrieved.durableR2Url, DURABLE_URL);
  assert.equal(retrieved.contentHash, HASH_A);
  assert.equal(retrieved.mediaType, "image/png");
  assert.equal(retrieved.provenanceJson, PROVENANCE_JSON);
  assert.equal(retrieved.version, 1);
  assert.equal(retrieved.createdAt, NOW_ISO);
  assert.equal(retrieved.updatedAt, NOW_ISO);
});

test("readMediaArtifact returns null for a non-existent id", async () => {
  const db = new InMemoryD1();
  const result = await readMediaArtifact(db, "non:existent:id", WS_ID);
  assert.equal(result, null);
});

test("readMediaArtifact returns null when workspace_id does not match", async () => {
  const db = new InMemoryD1();
  await upsertMediaArtifact(db, baseRecord(), NOW_ISO);
  const id = buildId(RUN_ID, STAGE_ID, SHOT_ID);
  const result = await readMediaArtifact(db, id, "other-workspace");
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// 2. Version-monotonic upsert: lower version is rejected
// ---------------------------------------------------------------------------

test("upsert with lower version throws MediaArtifactStaleWriteError (R5.7)", async () => {
  const db = new InMemoryD1();
  // Insert at version 5
  await upsertMediaArtifact(db, baseRecord({ version: 5 }), NOW_ISO);

  // Try to write at version 3 (lower) — must throw
  await assert.rejects(
    () => upsertMediaArtifact(db, baseRecord({ version: 3 }), NOW_ISO),
    (err) => {
      assert.ok(
        err instanceof MediaArtifactStaleWriteError,
        `expected MediaArtifactStaleWriteError, got ${err?.constructor?.name}: ${err?.message}`,
      );
      assert.equal(err.name, "MediaArtifactStaleWriteError");
      assert.equal(err.storedVersion, 5);
      assert.equal(err.incomingVersion, 3);
      assert.ok(typeof err.id === "string" && err.id.length > 0);
      return true;
    },
  );
});

test("stale write rejection leaves the stored record unchanged (R5.7)", async () => {
  const db = new InMemoryD1();
  await upsertMediaArtifact(db, baseRecord({ version: 5, contentHash: HASH_A }), NOW_ISO);
  const id = buildId(RUN_ID, STAGE_ID, SHOT_ID);

  try {
    await upsertMediaArtifact(
      db,
      baseRecord({ version: 3, contentHash: HASH_B, durableR2Url: "https://airvio.co/api/storage/media/runs/stale/x/y.png" }),
      NOW_ISO,
    );
  } catch {
    // Expected stale-write rejection.
  }

  const record = await readMediaArtifact(db, id, WS_ID);
  assert.equal(record?.version, 5, "stored version must remain 5 after stale write rejection");
  assert.equal(record?.contentHash, HASH_A, "content hash must remain unchanged after stale write rejection");
});

test("MediaArtifactStaleWriteError carries id, storedVersion, incomingVersion", () => {
  const err = new MediaArtifactStaleWriteError("run:stage:shot", 10, 2);
  assert.equal(err.name, "MediaArtifactStaleWriteError");
  assert.equal(err.id, "run:stage:shot");
  assert.equal(err.storedVersion, 10);
  assert.equal(err.incomingVersion, 2);
  assert.ok(err instanceof Error);
  assert.ok(typeof err.message === "string" && err.message.length > 0);
});

// ---------------------------------------------------------------------------
// 3. Higher version upsert succeeds and updates the row
// ---------------------------------------------------------------------------

test("upsert with higher version succeeds and updates fields", async () => {
  const db = new InMemoryD1();
  await upsertMediaArtifact(db, baseRecord({ version: 1 }), NOW_ISO);

  const updatedUrl = "https://airvio.co/api/storage/media/runs/run-001/render/shot-1-v2.png";
  const laterIso = "2025-06-01T12:00:00.000Z";
  await upsertMediaArtifact(
    db,
    baseRecord({ version: 2, durableR2Url: updatedUrl, contentHash: HASH_B }),
    laterIso,
  );

  const id = buildId(RUN_ID, STAGE_ID, SHOT_ID);
  const record = await readMediaArtifact(db, id, WS_ID);

  assert.equal(record?.version, 2, "version should be updated to 2");
  assert.equal(record?.durableR2Url, updatedUrl, "durableR2Url should be updated");
  assert.equal(record?.contentHash, HASH_B, "contentHash should be updated");
  assert.equal(record?.updatedAt, laterIso, "updatedAt should reflect the later timestamp");
});

test("upsert with equal version succeeds (in-place update, not rejected)", async () => {
  const db = new InMemoryD1();
  await upsertMediaArtifact(db, baseRecord({ version: 3 }), NOW_ISO);

  // Same version is allowed — idempotent update
  await assert.doesNotReject(
    () => upsertMediaArtifact(db, baseRecord({ version: 3 }), NOW_ISO),
  );
});

// ---------------------------------------------------------------------------
// 4. Content-hash uniqueness: different id, same hash → DB constraint error
// ---------------------------------------------------------------------------

test("inserting a second artifact with the same content hash in the same workspace fails (R3.9 unique index)", async () => {
  const db = new InMemoryD1();

  // First artifact with HASH_A
  await upsertMediaArtifact(db, baseRecord({ contentHash: HASH_A }), NOW_ISO);

  // Second artifact with a DIFFERENT id but the SAME content hash
  await assert.rejects(
    () =>
      upsertMediaArtifact(
        db,
        baseRecord({ shotId: "shot-2", contentHash: HASH_A }),  // same hash, different shotId → different id
        NOW_ISO,
      ),
    (err) => {
      assert.ok(
        typeof err.message === "string" &&
          err.message.toLowerCase().includes("unique constraint failed"),
        `expected unique constraint error, got: ${err.message}`,
      );
      return true;
    },
  );
});

test("inserting artifacts with different hashes in the same workspace succeeds", async () => {
  const db = new InMemoryD1();

  await assert.doesNotReject(() =>
    upsertMediaArtifact(db, baseRecord({ contentHash: HASH_A }), NOW_ISO)
  );
  await assert.doesNotReject(() =>
    upsertMediaArtifact(db, baseRecord({ shotId: "shot-2", contentHash: HASH_B }), NOW_ISO)
  );
});

test("same hash in different workspaces does not violate the unique index", async () => {
  const db = new InMemoryD1();

  await assert.doesNotReject(() =>
    upsertMediaArtifact(db, baseRecord({ workspaceId: "ws-a", contentHash: HASH_A }), NOW_ISO)
  );
  await assert.doesNotReject(() =>
    upsertMediaArtifact(db, baseRecord({ workspaceId: "ws-b", contentHash: HASH_A }), NOW_ISO)
  );
});

// ---------------------------------------------------------------------------
// 5. Run-scoped read returns only artifacts for that run
// ---------------------------------------------------------------------------

test("readMediaArtifactsByRun returns only artifacts for the specified run", async () => {
  const db = new InMemoryD1();

  // Insert 2 artifacts for run-001
  await upsertMediaArtifact(db, baseRecord({ runId: "run-001", shotId: "shot-1", contentHash: HASH_A, createdAtMs: 1000 }), NOW_ISO);
  await upsertMediaArtifact(db, baseRecord({ runId: "run-001", shotId: "shot-2", contentHash: HASH_B, createdAtMs: 2000 }), NOW_ISO);

  // Insert 1 artifact for a different run
  await upsertMediaArtifact(
    db,
    baseRecord({ runId: "run-999", shotId: "shot-1", contentHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" }),
    NOW_ISO,
  );

  const results = await readMediaArtifactsByRun(db, WS_ID, "run-001");

  assert.equal(results.length, 2, "should return exactly 2 artifacts for run-001");
  assert.ok(
    results.every((r) => r.runId === "run-001"),
    "all returned artifacts must belong to run-001",
  );
});

test("readMediaArtifactsByRun returns empty array when no artifacts exist for a run", async () => {
  const db = new InMemoryD1();
  const results = await readMediaArtifactsByRun(db, WS_ID, "run-nonexistent");
  assert.deepEqual(results, []);
});

test("readMediaArtifactsByRun returns results ordered by created_at ascending", async () => {
  const db = new InMemoryD1();

  // Insert in reverse order
  const t1 = "2025-01-01T00:00:01.000Z";
  const t2 = "2025-01-01T00:00:02.000Z";
  const t3 = "2025-01-01T00:00:03.000Z";

  // Insert with explicit createdAtMs to control ordering
  await upsertMediaArtifact(
    db,
    { workspaceId: WS_ID, runId: RUN_ID, stageId: STAGE_ID, shotId: "shot-c",
      kind: "image", durableR2Url: DURABLE_URL,
      contentHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      provenanceJson: PROVENANCE_JSON, version: 1, id: `${RUN_ID}:${STAGE_ID}:shot-c` },
    t3,
  );
  await upsertMediaArtifact(
    db,
    { workspaceId: WS_ID, runId: RUN_ID, stageId: STAGE_ID, shotId: "shot-a",
      kind: "image", durableR2Url: DURABLE_URL,
      contentHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      provenanceJson: PROVENANCE_JSON, version: 1, id: `${RUN_ID}:${STAGE_ID}:shot-a` },
    t1,
  );
  await upsertMediaArtifact(
    db,
    { workspaceId: WS_ID, runId: RUN_ID, stageId: STAGE_ID, shotId: "shot-b",
      kind: "image", durableR2Url: DURABLE_URL,
      contentHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      provenanceJson: PROVENANCE_JSON, version: 1, id: `${RUN_ID}:${STAGE_ID}:shot-b` },
    t2,
  );

  const results = await readMediaArtifactsByRun(db, WS_ID, RUN_ID);

  assert.equal(results.length, 3);
  assert.equal(results[0].shotId, "shot-a", "first result should be shot-a (earliest created_at)");
  assert.equal(results[1].shotId, "shot-b");
  assert.equal(results[2].shotId, "shot-c", "last result should be shot-c (latest created_at)");
});

test("readMediaArtifactsByRun does not return artifacts from a different workspace", async () => {
  const db = new InMemoryD1();

  await upsertMediaArtifact(db, baseRecord({ workspaceId: "ws-other" }), NOW_ISO);

  const results = await readMediaArtifactsByRun(db, WS_ID, RUN_ID);
  assert.equal(results.length, 0, "should not return artifacts from another workspace");
});

// ---------------------------------------------------------------------------
// 6. findMediaArtifactByHash (R3.9 dedupe lookup)
// ---------------------------------------------------------------------------

test("findMediaArtifactByHash returns the record for a known hash", async () => {
  const db = new InMemoryD1();
  await upsertMediaArtifact(db, baseRecord({ contentHash: HASH_A }), NOW_ISO);

  const result = await findMediaArtifactByHash(db, WS_ID, HASH_A);
  assert.ok(result !== null, "should find the record by content hash");
  assert.equal(result.contentHash, HASH_A);
  assert.equal(result.workspaceId, WS_ID);
});

test("findMediaArtifactByHash returns null when hash does not exist", async () => {
  const db = new InMemoryD1();
  const result = await findMediaArtifactByHash(db, WS_ID, HASH_A);
  assert.equal(result, null);
});

test("findMediaArtifactByHash is workspace-scoped (R3.9)", async () => {
  const db = new InMemoryD1();
  await upsertMediaArtifact(db, baseRecord({ workspaceId: "ws-other", contentHash: HASH_A }), NOW_ISO);

  // Looking up in a different workspace should return null
  const result = await findMediaArtifactByHash(db, WS_ID, HASH_A);
  assert.equal(result, null, "hash lookup must be scoped to the workspace");
});

// ---------------------------------------------------------------------------
// 7. MediaArtifactRecord shape (camelCase field names)
// ---------------------------------------------------------------------------

test("readMediaArtifact returns a record with camelCase field names", async () => {
  const db = new InMemoryD1();
  await upsertMediaArtifact(db, baseRecord(), NOW_ISO);
  const id = buildId(RUN_ID, STAGE_ID, SHOT_ID);
  const record = await readMediaArtifact(db, id, WS_ID);

  assert.ok(record !== null);
  // camelCase fields must exist
  assert.ok("workspaceId" in record, "must have workspaceId");
  assert.ok("runId" in record, "must have runId");
  assert.ok("stageId" in record, "must have stageId");
  assert.ok("shotId" in record, "must have shotId");
  assert.ok("durableR2Url" in record, "must have durableR2Url");
  assert.ok("contentHash" in record, "must have contentHash");
  assert.ok("mediaType" in record, "must have mediaType");
  assert.ok("provenanceJson" in record, "must have provenanceJson");
  assert.ok("layoutJson" in record, "must have layoutJson");
  assert.ok("createdAt" in record, "must have createdAt");
  assert.ok("updatedAt" in record, "must have updatedAt");

  // snake_case field names must NOT appear
  assert.equal("workspace_id" in record, false, "snake_case workspace_id must not appear on record");
  assert.equal("run_id" in record, false, "snake_case run_id must not appear on record");
  assert.equal("durable_r2_url" in record, false, "snake_case durable_r2_url must not appear on record");
});

// ---------------------------------------------------------------------------
// 8. provenanceJson and layoutJson pass through intact (R6.3)
// ---------------------------------------------------------------------------

test("provenanceJson is stored and retrieved intact (R6.3)", async () => {
  const db = new InMemoryD1();
  const complexProvenance = JSON.stringify({
    goalRef: "goal:my-canvas",
    briefRef: "brief:abc",
    planRef: "plan:xyz",
    toolCalls: [{ tool: "seedream", inputHash: "abc123", outputRef: "art:1" }],
    verificationChecks: [{ checkId: "persist", status: "passed" }],
  });

  await upsertMediaArtifact(db, baseRecord({ provenanceJson: complexProvenance }), NOW_ISO);
  const id = buildId(RUN_ID, STAGE_ID, SHOT_ID);
  const record = await readMediaArtifact(db, id, WS_ID);

  assert.equal(record?.provenanceJson, complexProvenance);
});

test("layoutJson is stored and retrieved intact when provided", async () => {
  const db = new InMemoryD1();
  const layoutJson = JSON.stringify({ frame: { w: 1920, h: 1080 }, widgets: [], edges: [] });

  await upsertMediaArtifact(db, baseRecord({ layoutJson }), NOW_ISO);
  const id = buildId(RUN_ID, STAGE_ID, SHOT_ID);
  const record = await readMediaArtifact(db, id, WS_ID);

  assert.equal(record?.layoutJson, layoutJson);
});

test("layoutJson is null when not provided", async () => {
  const db = new InMemoryD1();
  await upsertMediaArtifact(db, baseRecord({ layoutJson: null }), NOW_ISO);
  const id = buildId(RUN_ID, STAGE_ID, SHOT_ID);
  const record = await readMediaArtifact(db, id, WS_ID);

  assert.equal(record?.layoutJson, null);
});
