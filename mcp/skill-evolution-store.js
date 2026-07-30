import { createHash, randomUUID } from "node:crypto";
import { link, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import path from "node:path";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CLAIM_TTL_MS = 30 * 1000;
const DEFAULT_MAX_ENTRIES = 256;
const DEFAULT_MAX_REPLAY_ENTRIES = 20_000;
export const SKILL_EVOLUTION_MAX_REPLAY_KEY_BYTES = 512;
const MAX_REPLAY_UPDATES = 64;

export const SKILL_EVOLUTION_STORE_ERROR_CODES = Object.freeze([
  "invalid_argument",
  "not_found",
  "stale_revision",
  "claim_conflict",
  "claim_expired",
  "claim_token_invalid",
  "capacity_reached",
]);

export class SkillEvolutionStoreError extends Error {
  constructor(code, message, state = null) {
    super(message);
    this.name = "SkillEvolutionStoreError";
    this.code = code;
    this.state = state;
  }
}

export function positiveInteger(value, fallback, label) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return resolved;
}

function validRunId(runId) {
  return typeof runId === "string" && runId.length > 0 && runId.length <= 160;
}

export function requireRunId(runId) {
  if (!validRunId(runId)) {
    throw new SkillEvolutionStoreError(
      "invalid_argument",
      "runId must be a non-empty bounded string",
    );
  }
}

function clone(value) {
  return structuredClone(value);
}

export function assertState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new SkillEvolutionStoreError("invalid_argument", "state must be an object");
  }
  if (!Number.isSafeInteger(state.revision) || state.revision <= 0) {
    throw new SkillEvolutionStoreError("invalid_argument", "state.revision must be a positive safe integer");
  }
}

export function requireReplayKey(key, label = "replayKey") {
  if (
    typeof key !== "string"
    || key.length === 0
    || Buffer.byteLength(key, "utf8") > SKILL_EVOLUTION_MAX_REPLAY_KEY_BYTES
  ) {
    throw new SkillEvolutionStoreError(
      "invalid_argument",
      `${label} must be a non-empty string of at most ${SKILL_EVOLUTION_MAX_REPLAY_KEY_BYTES} UTF-8 bytes`,
    );
  }
}

export function replayUpdates(replayKey, replay, replayRecords, copy = clone) {
  if (!Array.isArray(replayRecords) || replayRecords.length > MAX_REPLAY_UPDATES) {
    throw new SkillEvolutionStoreError(
      "invalid_argument",
      `replayRecords must contain at most ${MAX_REPLAY_UPDATES} entries`,
    );
  }
  const updates = replayKey === undefined ? [] : [{ key: replayKey, replay }];
  const seen = new Set();
  for (const entry of [...updates, ...replayRecords]) {
    requireReplayKey(entry?.key, "Replay record key");
    if (seen.has(entry.key)) {
      throw new SkillEvolutionStoreError("invalid_argument", "Replay record keys must be unique");
    }
    seen.add(entry.key);
  }
  return [...updates, ...replayRecords].map((entry) => ({
    key: entry.key,
    replay: copy(entry.replay),
  }));
}

export function createSkillEvolutionMemoryStore({
  ttlMs,
  claimTtlMs,
  maxEntries,
  maxReplayEntries,
  now = Date.now,
  tokenFactory = randomUUID,
} = {}) {
  const defaultTtlMs = positiveInteger(ttlMs, DEFAULT_TTL_MS, "ttlMs");
  const defaultClaimTtlMs = positiveInteger(claimTtlMs, DEFAULT_CLAIM_TTL_MS, "claimTtlMs");
  const entryLimit = positiveInteger(maxEntries, DEFAULT_MAX_ENTRIES, "maxEntries");
  const replayEntryLimit = positiveInteger(
    maxReplayEntries,
    DEFAULT_MAX_REPLAY_ENTRIES,
    "maxReplayEntries",
  );
  if (typeof now !== "function" || typeof tokenFactory !== "function") {
    throw new TypeError("now and tokenFactory must be functions");
  }

  const records = new Map();
  const replaysByRun = new Map();

  function currentTime() {
    const value = now();
    if (!Number.isFinite(value)) throw new TypeError("now must return a finite timestamp");
    return value;
  }

  function clearExpiredClaim(record, timestamp) {
    if (record.claim && record.claim.expiresAt <= timestamp) record.claim = null;
  }

  function liveRecord(runId, timestamp = currentTime()) {
    const record = records.get(runId);
    if (!record) return null;
    clearExpiredClaim(record, timestamp);
    if (record.expiresAt <= timestamp && !record.claim) {
      records.delete(runId);
      replaysByRun.delete(runId);
      return null;
    }
    return record;
  }

  function publicState(record) {
    return clone(record.state);
  }

  function resolvedTtl(value) {
    return positiveInteger(value, defaultTtlMs, "ttlMs");
  }

  function sweepExpiredInternal() {
    const timestamp = currentTime();
    let evicted = 0;
    for (const runId of records.keys()) {
      const before = records.has(runId);
      liveRecord(runId, timestamp);
      if (before && !records.has(runId)) evicted += 1;
    }
    return evicted;
  }

  async function sweepExpired() {
    return sweepExpiredInternal();
  }

  async function put(runId, state, { ttlMs: entryTtlMs, replayKey, replay } = {}) {
    requireRunId(runId);
    assertState(state);
    const updates = replayUpdates(replayKey, replay, []);
    if (updates.length > replayEntryLimit) {
      throw new SkillEvolutionStoreError(
        "capacity_reached",
        `Replay record capacity ${replayEntryLimit} was reached`,
      );
    }
    sweepExpiredInternal();
    const existing = liveRecord(runId);
    if (existing) return { created: false, state: publicState(existing) };
    if (records.size >= entryLimit) {
      throw new SkillEvolutionStoreError(
        "capacity_reached",
        `Skill-evolution store capacity ${entryLimit} was reached`,
      );
    }
    const timestamp = currentTime();
    const stored = clone(state);
    records.set(runId, {
      state: stored,
      expiresAt: timestamp + resolvedTtl(entryTtlMs),
      claim: null,
    });
    replaysByRun.set(runId, new Map(updates.map(({ key, replay: value }) => [key, value])));
    return { created: true, state: clone(stored) };
  }

  async function get(runId) {
    requireRunId(runId);
    const record = liveRecord(runId);
    return record ? publicState(record) : null;
  }

  async function getReplay(runId, replayKey) {
    requireRunId(runId);
    requireReplayKey(replayKey);
    const record = liveRecord(runId);
    const replay = record ? replaysByRun.get(runId)?.get(replayKey) : undefined;
    return replay === undefined ? null : clone(replay);
  }

  async function claim(runId, { expectedRevision, owner, ttlMs: requestedClaimTtlMs } = {}) {
    requireRunId(runId);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0) {
      throw new SkillEvolutionStoreError("invalid_argument", "expectedRevision must be a positive safe integer");
    }
    if (typeof owner !== "string" || owner.trim() === "" || owner.length > 200) {
      throw new SkillEvolutionStoreError("invalid_argument", "owner must be a non-empty bounded string");
    }
    const timestamp = currentTime();
    const record = liveRecord(runId, timestamp);
    if (!record) return { ok: false, code: "not_found" };
    const state = publicState(record);
    if (record.state.revision !== expectedRevision) {
      return { ok: false, code: "stale_revision", state };
    }
    const leaseTtlMs = positiveInteger(requestedClaimTtlMs, defaultClaimTtlMs, "claim ttlMs");
    if (record.claim) {
      if (record.claim.owner !== owner) return { ok: false, code: "claim_conflict", state };
      record.claim.expiresAt = timestamp + leaseTtlMs;
      record.expiresAt = Math.max(record.expiresAt, record.claim.expiresAt);
      return { ok: true, token: record.claim.token, state };
    }
    const token = tokenFactory();
    if (typeof token !== "string" || token.length === 0 || token.length > 512) {
      throw new SkillEvolutionStoreError("invalid_argument", "tokenFactory returned an invalid claim token");
    }
    record.claim = { token, owner, expiresAt: timestamp + leaseTtlMs };
    record.expiresAt = Math.max(record.expiresAt, record.claim.expiresAt);
    return { ok: true, token, state };
  }

  async function replace(runId, {
    expectedRevision,
    token,
    state,
    ttlMs: entryTtlMs,
    replayKey,
    replay,
    replayRecords = [],
  } = {}) {
    requireRunId(runId);
    assertState(state);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0) {
      throw new SkillEvolutionStoreError("invalid_argument", "expectedRevision must be a positive safe integer");
    }
    const timestamp = currentTime();
    const record = records.get(runId);
    if (!record) throw new SkillEvolutionStoreError("not_found", `Run ${runId} was not found`);
    const expiredClaim = record.claim && record.claim.expiresAt <= timestamp;
    const expiredState = expiredClaim ? publicState(record) : null;
    clearExpiredClaim(record, timestamp);
    if (expiredClaim) {
      if (record.expiresAt <= timestamp) {
        records.delete(runId);
        replaysByRun.delete(runId);
      }
      throw new SkillEvolutionStoreError("claim_expired", `Claim for ${runId} expired`, expiredState);
    }
    if (record.expiresAt <= timestamp && !record.claim) {
      records.delete(runId);
      replaysByRun.delete(runId);
      throw new SkillEvolutionStoreError("not_found", `Run ${runId} expired`);
    }
    if (!record.claim || record.claim.token !== token) {
      throw new SkillEvolutionStoreError("claim_token_invalid", `A current claim token is required for ${runId}`, publicState(record));
    }
    if (record.state.revision !== expectedRevision) {
      throw new SkillEvolutionStoreError("stale_revision", `Run ${runId} revision is stale`, publicState(record));
    }
    if (state.revision !== expectedRevision + 1) {
      throw new SkillEvolutionStoreError(
        "invalid_argument",
        `Replacement state revision must be ${expectedRevision + 1}`,
        publicState(record),
      );
    }
    const pendingReplays = replayUpdates(replayKey, replay, replayRecords);
    const currentReplays = replaysByRun.get(runId) || new Map();
    const addedKeys = pendingReplays.filter(({ key }) => !currentReplays.has(key)).length;
    if (currentReplays.size + addedKeys > replayEntryLimit) {
      throw new SkillEvolutionStoreError(
        "capacity_reached",
        `Replay record capacity ${replayEntryLimit} was reached`,
        publicState(record),
      );
    }
    const nextState = clone(state);
    const nextExpiresAt = timestamp + resolvedTtl(entryTtlMs);
    record.state = nextState;
    for (const entry of pendingReplays) currentReplays.set(entry.key, entry.replay);
    replaysByRun.set(runId, currentReplays);
    record.expiresAt = nextExpiresAt;
    record.claim = null;
    return publicState(record);
  }

  async function checkpoint(runId, {
    expectedRevision,
    token,
    state,
    ttlMs: entryTtlMs,
  } = {}) {
    requireRunId(runId);
    assertState(state);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0 || state.revision !== expectedRevision) {
      throw new SkillEvolutionStoreError("invalid_argument", "Checkpoint state must retain the exact current revision");
    }
    const timestamp = currentTime();
    const record = records.get(runId);
    if (!record) throw new SkillEvolutionStoreError("not_found", `Run ${runId} was not found`);
    const expiredClaim = record.claim && record.claim.expiresAt <= timestamp;
    const expiredState = expiredClaim ? publicState(record) : null;
    clearExpiredClaim(record, timestamp);
    if (expiredClaim) throw new SkillEvolutionStoreError("claim_expired", `Claim for ${runId} expired`, expiredState);
    if (!record.claim || record.claim.token !== token) {
      throw new SkillEvolutionStoreError("claim_token_invalid", `A current claim token is required for ${runId}`, publicState(record));
    }
    if (record.state.revision !== expectedRevision) {
      throw new SkillEvolutionStoreError("stale_revision", `Run ${runId} revision is stale`, publicState(record));
    }
    record.state = clone(state);
    record.expiresAt = Math.max(timestamp + resolvedTtl(entryTtlMs), record.claim.expiresAt);
    return publicState(record);
  }

  async function release(runId, { token } = {}) {
    requireRunId(runId);
    const record = liveRecord(runId);
    if (!record) return { released: false, code: "not_found" };
    if (!record.claim || record.claim.token !== token) {
      return { released: false, code: "claim_token_invalid", state: publicState(record) };
    }
    record.claim = null;
    return { released: true, state: publicState(record) };
  }

  async function size() {
    sweepExpiredInternal();
    return records.size;
  }

  return Object.freeze({ put, get, getReplay, claim, checkpoint, replace, release, size, sweepExpired });
}

export const createSkillEvolutionStore = createSkillEvolutionMemoryStore;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function createSkillEvolutionFilesystemMutex({
  locksDirectory,
  ready,
  lockTtlMs,
  lockWaitMs,
  lockRetryMs,
}) {
  const lockPath = (scope) => path.join(locksDirectory, `${scope}.lock`);
  const localHostname = hostname();

  async function lockSnapshot(filePath) {
    try {
      const details = await stat(filePath);
      const owner = JSON.parse(await readFile(filePath, "utf8"));
      if (
        !details.isFile()
        || typeof owner?.token !== "string"
        || owner.token.length === 0
        || owner.token.length > 512
        || !Number.isSafeInteger(owner.pid)
        || owner.pid <= 0
        || typeof owner.hostname !== "string"
        || owner.hostname.length === 0
      ) return null;
      return { details, owner };
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      if (error instanceof SyntaxError || error?.code === "EISDIR") return null;
      throw error;
    }
  }

  function processIsLive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if (error?.code === "ESRCH") return false;
      if (error?.code === "EPERM") return true;
      throw error;
    }
  }

  async function retire(filePath) {
    const first = await lockSnapshot(filePath);
    if (!first || first.owner.hostname !== localHostname || processIsLive(first.owner.pid)
      || Date.now() - first.details.mtimeMs < lockTtlMs) return false;
    const recoveryId = createHash("sha256").update(first.owner.token).digest("hex").slice(0, 24);
    const recoveryPath = `${filePath}.recovery.${recoveryId}`;
    let recovery;
    try {
      recovery = await open(recoveryPath, "wx", 0o600);
      await recovery.writeFile(`${JSON.stringify({ pid: process.pid, hostname: localHostname })}\n`);
      await recovery.sync();
    } catch (error) {
      await recovery?.close().catch(() => {});
      if (error?.code === "EEXIST") return false;
      throw error;
    }
    try {
      await wait(Math.min(lockRetryMs, Math.max(1, Math.floor(lockTtlMs / 3))));
      const second = await lockSnapshot(filePath);
      if (!second || second.owner.token !== first.owner.token || second.owner.pid !== first.owner.pid
        || second.owner.hostname !== first.owner.hostname || processIsLive(second.owner.pid)
        || Date.now() - second.details.mtimeMs < lockTtlMs) return false;
      const retiredPath = `${filePath}.stale.${process.pid}.${randomUUID()}`;
      try { await rename(filePath, retiredPath); }
      catch (error) { if (error?.code === "ENOENT") return true; throw error; }
      await unlink(retiredPath).catch((error) => { if (error?.code !== "ENOENT") throw error; });
      return true;
    } finally {
      await recovery.close().catch(() => {});
      await unlink(recoveryPath).catch((error) => { if (error?.code !== "ENOENT") throw error; });
    }
  }

  async function acquire(scope) {
    await (typeof ready === "function" ? ready() : ready);
    const filePath = lockPath(scope);
    const startedAt = Date.now();
    while (true) {
      const token = randomUUID();
      const candidatePath = `${filePath}.candidate.${process.pid}.${token}`;
      let handle;
      try {
        handle = await open(candidatePath, "wx", 0o600);
        await handle.writeFile(`${JSON.stringify({ token, pid: process.pid, hostname: localHostname })}\n`);
        await handle.sync();
        await link(candidatePath, filePath);
        await unlink(candidatePath).catch(() => {});
        const details = await handle.stat();
        const lock = {
          filePath,
          handle,
          device: details.dev,
          inode: details.ino,
          lost: false,
          timer: null,
        };
        lock.timer = setInterval(() => {
          const timestamp = new Date();
          handle.utimes(timestamp, timestamp).catch(() => { lock.lost = true; });
        }, Math.max(1, Math.floor(lockTtlMs / 3)));
        lock.timer.unref();
        return lock;
      } catch (error) {
        await handle?.close().catch(() => {});
        await unlink(candidatePath).catch(() => {});
        if (error?.code !== "EEXIST") throw error;
        if (await retire(filePath)) continue;
        if (Date.now() - startedAt >= lockWaitMs) {
          throw new SkillEvolutionStoreError(
            "claim_conflict",
            `Timed out acquiring the durable store lock for ${scope}`,
          );
        }
        await wait(lockRetryMs);
      }
    }
  }

  async function pathOwned(lock) {
    try {
      const details = await stat(lock.filePath);
      return details.isFile() && details.dev === lock.device && details.ino === lock.inode;
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw error;
    }
  }

  async function owned(lock) {
    return !lock.lost && pathOwned(lock);
  }

  async function release(lock) {
    clearInterval(lock.timer);
    try {
      if (await pathOwned(lock)) await unlink(lock.filePath);
    } finally {
      await lock.handle.close();
    }
  }

  return async function withLock(scope, action) {
    const lock = await acquire(scope);
    const assertOwned = async () => {
      if (await owned(lock)) return;
      throw new SkillEvolutionStoreError(
        "claim_conflict",
        `Durable store lock ownership was lost for ${scope}`,
      );
    };
    try {
      const result = await action(Object.freeze({ assertOwned }));
      await assertOwned();
      return result;
    } finally {
      await release(lock);
    }
  };
}
