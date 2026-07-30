import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";

import { atomicWriteSkillEvolutionJson, syncSkillEvolutionDirectory } from "./skill-evolution-file-io.js";
import { SkillEvolutionStoreError, assertState, createSkillEvolutionFilesystemMutex, positiveInteger, replayUpdates, requireReplayKey, requireRunId } from "./skill-evolution-store.js";
import { addReplayMembershipKeys, createEmptyReplayMembership, isValidReplayMembership, replayMembershipMayContain } from "./skill-evolution-replay-membership.js";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CLAIM_TTL_MS = 30 * 1000;
const DEFAULT_MAX_ENTRIES = 256;
const DEFAULT_MAX_REPLAY_ENTRIES = 20_000;
const DEFAULT_LOCK_TTL_MS = 30 * 1000;
const DEFAULT_LOCK_WAIT_MS = 5 * 1000;
const DEFAULT_LOCK_RETRY_MS = 10;
const MAX_REPLAY_UPDATES = 64;
const RECORD_VERSION = 2;
const INDEX_VERSION = 1;
const REPLAY_VERSION = 1;
const SHA256 = /^[a-f0-9]{64}$/;
const RECORD_NAME = /^[a-f0-9]{64}\.json$/;

const clone = (value) => structuredClone(value);
const digestText = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const digestRunId = (runId) => digestText(runId);

function persisted(value, label) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new TypeError(`${label} is not JSON-serializable`);
    return JSON.parse(serialized);
  } catch (error) {
    throw new SkillEvolutionStoreError(
      "invalid_argument",
      `${label} is not persistable: ${error.message}`,
    );
  }
}

function emptyReplayIndex() {
  return { head: null, entries: 0, depth: 0, membership: createEmptyReplayMembership() };
}

function validateReplayIndex(index) {
  if (
    !index
    || typeof index !== "object"
    || Array.isArray(index)
    || !(index.head === null || SHA256.test(index.head))
    || !Number.isSafeInteger(index.entries)
    || index.entries < 0
    || !Number.isSafeInteger(index.depth)
    || index.depth < 0
    || !isValidReplayMembership(index.membership)
    || ((index.head === null) !== (index.depth === 0))
    || (index.depth === 0 && index.entries !== 0)
  ) {
    throw new SkillEvolutionStoreError("invalid_argument", "Stored replay index is invalid");
  }
  return index;
}

function validateRecord(record, runDigest, expectedRunId, replayEntryLimit) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new SkillEvolutionStoreError("invalid_argument", "Stored run record is invalid");
  }
  requireRunId(record.runId);
  assertState(record.state);
  const index = validateReplayIndex(record.replayIndex);
  if (
    record.version !== RECORD_VERSION
    || digestRunId(record.runId) !== runDigest
    || (expectedRunId !== undefined && record.runId !== expectedRunId)
    || !Number.isFinite(record.expiresAt)
    || index.entries > replayEntryLimit
    || index.depth > replayEntryLimit
  ) {
    throw new SkillEvolutionStoreError("invalid_argument", "Stored run record is invalid");
  }
  if (record.claim !== null) {
    const claim = record.claim;
    if (
      !claim
      || typeof claim.token !== "string"
      || claim.token.length === 0
      || claim.token.length > 512
      || typeof claim.owner !== "string"
      || claim.owner.trim() === ""
      || claim.owner.length > 200
      || !Number.isFinite(claim.expiresAt)
    ) {
      throw new SkillEvolutionStoreError("invalid_argument", "Stored claim is invalid");
    }
  }
  return record;
}

export function createSkillEvolutionFileStore({
  directory,
  ttlMs,
  claimTtlMs,
  maxEntries,
  maxReplayEntries,
  lockTtlMs,
  lockWaitMs,
  lockRetryMs,
  now = Date.now,
  tokenFactory = randomUUID,
} = {}) {
  if (typeof directory !== "string" || directory.trim() === "" || directory.includes("\0")) {
    throw new TypeError("directory must be a non-empty filesystem path");
  }
  if (typeof now !== "function" || typeof tokenFactory !== "function") {
    throw new TypeError("now and tokenFactory must be functions");
  }
  const defaultTtlMs = positiveInteger(ttlMs, DEFAULT_TTL_MS, "ttlMs");
  const defaultClaimTtlMs = positiveInteger(claimTtlMs, DEFAULT_CLAIM_TTL_MS, "claimTtlMs");
  const entryLimit = positiveInteger(maxEntries, DEFAULT_MAX_ENTRIES, "maxEntries");
  const replayEntryLimit = positiveInteger(maxReplayEntries, DEFAULT_MAX_REPLAY_ENTRIES, "maxReplayEntries");
  const staleLockMs = positiveInteger(lockTtlMs, DEFAULT_LOCK_TTL_MS, "lockTtlMs");
  const lockTimeoutMs = positiveInteger(lockWaitMs, DEFAULT_LOCK_WAIT_MS, "lockWaitMs");
  const retryMs = positiveInteger(lockRetryMs, DEFAULT_LOCK_RETRY_MS, "lockRetryMs");
  const rootDirectory = path.resolve(directory);
  const recordsDirectory = path.join(rootDirectory, "records");
  const indexesDirectory = path.join(rootDirectory, "replay-indexes");
  const replaysDirectory = path.join(rootDirectory, "replays");
  const locksDirectory = path.join(rootDirectory, "locks");
  let ready;
  const ensureReady = () => ready ||= Promise.all([
    mkdir(recordsDirectory, { recursive: true, mode: 0o700 }),
    mkdir(indexesDirectory, { recursive: true, mode: 0o700 }),
    mkdir(replaysDirectory, { recursive: true, mode: 0o700 }),
    mkdir(locksDirectory, { recursive: true, mode: 0o700 }),
  ]);
  const mutexWithLock = createSkillEvolutionFilesystemMutex({ locksDirectory, ready: ensureReady,
    lockTtlMs: staleLockMs, lockWaitMs: lockTimeoutMs, lockRetryMs: retryMs });
  const lockContext = new AsyncLocalStorage();
  const withLock = (scope, action) => mutexWithLock(
    scope,
    (guard) => lockContext.run(guard, action),
  );

  function currentTime() {
    const value = now();
    if (!Number.isFinite(value)) throw new TypeError("now must return a finite timestamp");
    return value;
  }

  const resolvedTtl = (value) => positiveInteger(value, defaultTtlMs, "ttlMs");
  const recordPath = (runDigest) => path.join(recordsDirectory, `${runDigest}.json`);
  const indexRunDirectory = (runDigest) => path.join(indexesDirectory, runDigest);
  const replayRunDirectory = (runDigest) => path.join(replaysDirectory, runDigest);
  const indexPath = (runDigest, digest) => path.join(indexRunDirectory(runDigest), `${digest}.json`);
  const replayPath = (runDigest, digest) => path.join(replayRunDirectory(runDigest), `${digest}.json`);

  async function assertCommitOwned() {
    const guard = lockContext.getStore();
    if (!guard) throw new Error("Durable store writes require a lock ownership fence");
    await guard.assertOwned();
  }

  const atomicWrite = (filePath, value) => atomicWriteSkillEvolutionJson(
    filePath,
    value,
    assertCommitOwned,
  );

  async function readJson(filePath, missing = null) {
    try {
      return JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") return missing;
      if (error instanceof SyntaxError) {
        throw new SkillEvolutionStoreError("invalid_argument", "Stored JSON is invalid");
      }
      throw error;
    }
  }

  async function readRecord(runDigest, expectedRunId) {
    const record = await readJson(recordPath(runDigest));
    return record
      ? validateRecord(record, runDigest, expectedRunId, replayEntryLimit)
      : null;
  }

  async function readIndexPage(runId, runDigest, sidecarDigest) {
    const page = await readJson(indexPath(runDigest, sidecarDigest));
    if (
      !page
      || digestText(JSON.stringify(page)) !== sidecarDigest
      || page.version !== INDEX_VERSION
      || page.runId !== runId
      || !(page.parent === null || SHA256.test(page.parent))
      || !Array.isArray(page.entries)
      || page.entries.length === 0
      || page.entries.length > MAX_REPLAY_UPDATES + 1
    ) {
      throw new SkillEvolutionStoreError("invalid_argument", "Stored replay index page is invalid");
    }
    const seen = new Set();
    for (const entry of page.entries) {
      requireReplayKey(entry?.key, "Stored replay key");
      if (!SHA256.test(entry?.blob || "") || seen.has(entry.key)) {
        throw new SkillEvolutionStoreError("invalid_argument", "Stored replay index page is invalid");
      }
      seen.add(entry.key);
    }
    return page;
  }

  async function readReplay(runId, runDigest, key, sidecarDigest) {
    const payload = await readJson(replayPath(runDigest, sidecarDigest));
    if (
      !payload
      || digestText(JSON.stringify(payload)) !== sidecarDigest
      || payload.version !== REPLAY_VERSION
      || payload.runId !== runId
      || payload.key !== key
      || !Object.hasOwn(payload, "replay")
    ) {
      throw new SkillEvolutionStoreError("invalid_argument", "Stored replay record is invalid");
    }
    return clone(payload.replay);
  }

  async function findReplay(record, runDigest, key) {
    if (!replayMembershipMayContain(record.replayIndex.membership, key)) return null;
    let cursor = record.replayIndex.head;
    let traversed = 0;
    while (cursor !== null && traversed < record.replayIndex.depth) {
      const page = await readIndexPage(record.runId, runDigest, cursor);
      const match = page.entries.find((entry) => entry.key === key);
      if (match) return readReplay(record.runId, runDigest, key, match.blob);
      cursor = page.parent;
      traversed += 1;
    }
    if (cursor !== null || traversed !== record.replayIndex.depth) {
      throw new SkillEvolutionStoreError("invalid_argument", "Stored replay index chain is invalid");
    }
    return null;
  }

  async function prepareReplayIndex(record, runDigest, updates) {
    if (updates.length === 0) return record.replayIndex;
    const entries = record.replayIndex.entries + updates.length;
    const depth = record.replayIndex.depth + 1;
    if (entries > replayEntryLimit || depth > replayEntryLimit) {
      throw new SkillEvolutionStoreError(
        "capacity_reached",
        `Replay record capacity ${replayEntryLimit} was reached`,
        clone(record.state),
      );
    }
    const indexEntries = [];
    for (const update of updates) {
      const payload = {
        version: REPLAY_VERSION,
        runId: record.runId,
        key: update.key,
        replay: update.replay,
      };
      const blob = digestText(JSON.stringify(payload));
      await atomicWrite(replayPath(runDigest, blob), payload);
      indexEntries.push({ key: update.key, blob });
    }
    const page = {
      version: INDEX_VERSION,
      runId: record.runId,
      parent: record.replayIndex.head,
      entries: indexEntries,
    };
    const head = digestText(JSON.stringify(page));
    await atomicWrite(indexPath(runDigest, head), page);
    const membership = addReplayMembershipKeys(
      record.replayIndex.membership,
      updates.map(({ key }) => key),
    );
    return { head, entries, depth, membership };
  }

  async function removeRecord(runDigest) {
    let removed = false;
    try {
      await assertCommitOwned();
      await unlink(recordPath(runDigest));
      removed = true;
      await syncSkillEvolutionDirectory(recordsDirectory);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (removed) {
      await Promise.all([
        rm(indexRunDirectory(runDigest), { recursive: true, force: true }),
        rm(replayRunDirectory(runDigest), { recursive: true, force: true }),
      ]);
    }
    return removed;
  }

  async function liveRecord(runDigest, expectedRunId, timestamp = currentTime()) {
    const record = await readRecord(runDigest, expectedRunId);
    if (!record) return null;
    if (record.claim && record.claim.expiresAt <= timestamp) {
      record.claim = null;
      if (record.expiresAt <= timestamp) {
        await removeRecord(runDigest);
        return null;
      }
      await atomicWrite(recordPath(runDigest), record);
    } else if (record.expiresAt <= timestamp && !record.claim) {
      await removeRecord(runDigest);
      return null;
    }
    return record;
  }

  async function recordDigests() {
    await ready;
    return (await readdir(recordsDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && RECORD_NAME.test(entry.name))
      .map((entry) => entry.name.slice(0, -5));
  }

  async function sweepExpiredLocked() {
    const timestamp = currentTime();
    let evicted = 0;
    for (const runDigest of await recordDigests()) {
      await withLock(runDigest, async () => {
        const existed = await readRecord(runDigest);
        if (existed && !(await liveRecord(runDigest, undefined, timestamp))) evicted += 1;
      });
    }
    return evicted;
  }

  const sweepExpired = () => withLock("store", sweepExpiredLocked);

  async function put(runId, state, { ttlMs: entryTtlMs, replayKey, replay } = {}) {
    requireRunId(runId);
    assertState(state);
    const storedState = persisted(state, "Run state");
    const updates = replayUpdates(
      replayKey,
      replay,
      [],
      (value) => persisted(value, "Replay record"),
    );
    const runDigest = digestRunId(runId);
    return withLock("store", async () => {
      await sweepExpiredLocked();
      return withLock(runDigest, async () => {
        const existing = await liveRecord(runDigest, runId);
        if (existing) return { created: false, state: clone(existing.state) };
        if ((await recordDigests()).length >= entryLimit) {
          throw new SkillEvolutionStoreError(
            "capacity_reached",
            `Skill-evolution store capacity ${entryLimit} was reached`,
          );
        }
        const record = {
          version: RECORD_VERSION,
          runId,
          state: storedState,
          expiresAt: currentTime() + resolvedTtl(entryTtlMs),
          claim: null,
          replayIndex: emptyReplayIndex(),
        };
        record.replayIndex = await prepareReplayIndex(record, runDigest, updates);
        await atomicWrite(recordPath(runDigest), record);
        return { created: true, state: clone(storedState) };
      });
    });
  }

  async function get(runId) {
    requireRunId(runId);
    const runDigest = digestRunId(runId);
    return withLock(runDigest, async () => {
      const record = await liveRecord(runDigest, runId);
      return record ? clone(record.state) : null;
    });
  }

  async function getReplay(runId, replayKey) {
    requireRunId(runId);
    requireReplayKey(replayKey);
    const runDigest = digestRunId(runId);
    return withLock(runDigest, async () => {
      const record = await liveRecord(runDigest, runId);
      return record ? findReplay(record, runDigest, replayKey) : null;
    });
  }

  async function claim(runId, { expectedRevision, owner, ttlMs: requestedClaimTtlMs } = {}) {
    requireRunId(runId);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0) {
      throw new SkillEvolutionStoreError(
        "invalid_argument",
        "expectedRevision must be a positive safe integer",
      );
    }
    if (typeof owner !== "string" || owner.trim() === "" || owner.length > 200) {
      throw new SkillEvolutionStoreError(
        "invalid_argument",
        "owner must be a non-empty bounded string",
      );
    }
    const runDigest = digestRunId(runId);
    return withLock(runDigest, async () => {
      const timestamp = currentTime();
      const record = await liveRecord(runDigest, runId, timestamp);
      if (!record) return { ok: false, code: "not_found" };
      const state = clone(record.state);
      if (record.state.revision !== expectedRevision) {
        return { ok: false, code: "stale_revision", state };
      }
      const leaseTtlMs = positiveInteger(
        requestedClaimTtlMs,
        defaultClaimTtlMs,
        "claim ttlMs",
      );
      if (record.claim) {
        if (record.claim.owner !== owner) return { ok: false, code: "claim_conflict", state };
        record.claim.expiresAt = timestamp + leaseTtlMs;
      } else {
        const token = tokenFactory();
        if (typeof token !== "string" || token.length === 0 || token.length > 512) {
          throw new SkillEvolutionStoreError(
            "invalid_argument",
            "tokenFactory returned an invalid claim token",
          );
        }
        record.claim = { token, owner, expiresAt: timestamp + leaseTtlMs };
      }
      record.expiresAt = Math.max(record.expiresAt, record.claim.expiresAt);
      await atomicWrite(recordPath(runDigest), record);
      return { ok: true, token: record.claim.token, state };
    });
  }

  async function requireClaimedRecord(runId, expectedRevision, token, timestamp) {
    const runDigest = digestRunId(runId);
    const record = await readRecord(runDigest, runId);
    if (!record) throw new SkillEvolutionStoreError("not_found", `Run ${runId} was not found`);
    if (record.claim && record.claim.expiresAt <= timestamp) {
      const expiredState = clone(record.state);
      record.claim = null;
      if (record.expiresAt <= timestamp) await removeRecord(runDigest);
      else await atomicWrite(recordPath(runDigest), record);
      throw new SkillEvolutionStoreError(
        "claim_expired",
        `Claim for ${runId} expired`,
        expiredState,
      );
    }
    if (record.expiresAt <= timestamp && !record.claim) {
      await removeRecord(runDigest);
      throw new SkillEvolutionStoreError("not_found", `Run ${runId} expired`);
    }
    if (!record.claim || record.claim.token !== token) {
      throw new SkillEvolutionStoreError(
        "claim_token_invalid",
        `A current claim token is required for ${runId}`,
        clone(record.state),
      );
    }
    if (record.state.revision !== expectedRevision) {
      throw new SkillEvolutionStoreError(
        "stale_revision",
        `Run ${runId} revision is stale`,
        clone(record.state),
      );
    }
    return { runDigest, record };
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
      throw new SkillEvolutionStoreError(
        "invalid_argument",
        "expectedRevision must be a positive safe integer",
      );
    }
    const storedState = persisted(state, "Run state");
    const updates = replayUpdates(
      replayKey,
      replay,
      replayRecords,
      (value) => persisted(value, "Replay record"),
    );
    const runDigest = digestRunId(runId);
    return withLock(runDigest, async () => {
      const timestamp = currentTime();
      const claimed = await requireClaimedRecord(runId, expectedRevision, token, timestamp);
      if (storedState.revision !== expectedRevision + 1) {
        throw new SkillEvolutionStoreError(
          "invalid_argument",
          `Replacement state revision must be ${expectedRevision + 1}`,
          clone(claimed.record.state),
        );
      }
      const replayIndex = await prepareReplayIndex(claimed.record, runDigest, updates);
      const successor = {
        ...claimed.record,
        state: storedState,
        expiresAt: timestamp + resolvedTtl(entryTtlMs),
        claim: null,
        replayIndex,
      };
      await atomicWrite(recordPath(runDigest), successor);
      return clone(storedState);
    });
  }

  async function checkpoint(runId, {
    expectedRevision,
    token,
    state,
    ttlMs: entryTtlMs,
  } = {}) {
    requireRunId(runId);
    assertState(state);
    if (
      !Number.isSafeInteger(expectedRevision)
      || expectedRevision <= 0
      || state.revision !== expectedRevision
    ) {
      throw new SkillEvolutionStoreError(
        "invalid_argument",
        "Checkpoint state must retain the exact current revision",
      );
    }
    const storedState = persisted(state, "Run state");
    const runDigest = digestRunId(runId);
    return withLock(runDigest, async () => {
      const timestamp = currentTime();
      const claimed = await requireClaimedRecord(runId, expectedRevision, token, timestamp);
      claimed.record.state = storedState;
      claimed.record.expiresAt = Math.max(
        timestamp + resolvedTtl(entryTtlMs),
        claimed.record.claim.expiresAt,
      );
      await atomicWrite(recordPath(runDigest), claimed.record);
      return clone(storedState);
    });
  }

  async function release(runId, { token } = {}) {
    requireRunId(runId);
    const runDigest = digestRunId(runId);
    return withLock(runDigest, async () => {
      const record = await liveRecord(runDigest, runId);
      if (!record) return { released: false, code: "not_found" };
      if (!record.claim || record.claim.token !== token) {
        return { released: false, code: "claim_token_invalid", state: clone(record.state) };
      }
      record.claim = null;
      await atomicWrite(recordPath(runDigest), record);
      return { released: true, state: clone(record.state) };
    });
  }

  async function size() {
    return withLock("store", async () => {
      await sweepExpiredLocked();
      return (await recordDigests()).length;
    });
  }

  return Object.freeze({
    put,
    get,
    getReplay,
    claim,
    checkpoint,
    replace,
    release,
    size,
    sweepExpired,
  });
}
