import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { atomicWriteSkillEvolutionJson } from "./skill-evolution-file-io.js";
import { createSkillEvolutionFilesystemMutex } from "./skill-evolution-store.js";

const STATE_SCHEMA = "knowgrph-persistent-memory-store/v1";
const SHA256 = /^[a-f0-9]{64}$/;
const BOUNDED_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SCOPE_KEYS = Object.freeze(["tenant_id", "workspace_id", "agent_id", "subject_id"]);
const REDACTION_MARKER_KEYS = Object.freeze([
  "action",
  "entry_id",
  "entry_key",
  "redacted",
  "revision",
]);
const STATE_KEYS = Object.freeze([
  "checksum",
  "entries",
  "events",
  "receipts",
  "revision",
  "schema",
  "store_id",
  "updated_at",
]);
const RECEIPT_KEYS = Object.freeze([
  "committed_revision",
  "key_digest",
  "request_digest",
  "result",
]);
const DEFAULT_LIMITS = Object.freeze({
  maxEntries: 10_000,
  maxEvents: 50_000,
  maxReceipts: 10_000,
  maxEntryBytes: 256 * 1024,
  maxEventBytes: 64 * 1024,
  maxReceiptBytes: 256 * 1024,
  maxStateBytes: 64 * 1024 * 1024,
  maxIdempotencyKeyBytes: 512,
  lockTtlMs: 30_000,
  lockWaitMs: 5_000,
  lockRetryMs: 10,
});

export class PersistentMemoryStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PersistentMemoryStoreError";
    this.code = code;
    if (Number.isSafeInteger(details.currentRevision)) {
      this.currentRevision = details.currentRevision;
    }
  }
}

const fail = (code, message, details) => {
  throw new PersistentMemoryStoreError(code, message, details);
};

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const sha256 = (value) => createHash("sha256").update(String(value), "utf8").digest("hex");
const clone = (value) => structuredClone(value);
const utf8Bytes = (value) => Buffer.byteLength(value, "utf8");
const jsonBytes = (value) => utf8Bytes(JSON.stringify(value));

const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isRecord(value)) return JSON.stringify(value);
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
};

const persisted = (value, label) => {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) fail("invalid_argument", `${label} must be JSON-serializable`);
    return JSON.parse(serialized);
  } catch (error) {
    if (error instanceof PersistentMemoryStoreError) throw error;
    fail("invalid_argument", `${label} must be JSON-serializable`);
  }
};

const sameExactKeys = (value, keys) => (
  isRecord(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
);

const positiveLimit = (value, fallback, label) => {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    fail("invalid_argument", `${label} must be a positive safe integer`);
  }
  return resolved;
};

const normalizeLimits = (limits = {}) => {
  if (!isRecord(limits)) fail("invalid_argument", "limits must be an object");
  const unknown = Object.keys(limits).filter((key) => !Object.hasOwn(DEFAULT_LIMITS, key));
  if (unknown.length) fail("invalid_argument", `Unknown persistent-memory limit: ${unknown[0]}`);
  return Object.freeze(Object.fromEntries(
    Object.entries(DEFAULT_LIMITS).map(([key, fallback]) => [
      key,
      positiveLimit(limits[key], fallback, key),
    ]),
  ));
};

const normalizeStoreId = (storeId = "default") => {
  const resolved = String(storeId || "").trim();
  if (!resolved || utf8Bytes(resolved) > 256) {
    fail("invalid_argument", "storeId must be a non-empty string of at most 256 UTF-8 bytes");
  }
  return resolved;
};

const currentTimestamp = (now) => {
  const value = now();
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) fail("invalid_argument", "now must return a valid timestamp");
  return date.toISOString();
};

const checksumPayload = (state) => ({
  schema: state.schema,
  store_id: state.store_id,
  revision: state.revision,
  updated_at: state.updated_at,
  entries: state.entries,
  events: state.events,
  receipts: state.receipts,
});

const withChecksum = (state) => ({
  ...checksumPayload(state),
  checksum: sha256(canonicalJson(checksumPayload(state))),
});

const assertBoundedObjects = (values, countLimit, itemByteLimit, label, code) => {
  if (!Array.isArray(values)) fail(code, `${label} must be an array`);
  if (values.length > countLimit) fail(code, `${label} exceeds its entry limit`);
  for (const value of values) {
    if (!isRecord(value)) fail(code, `${label} entries must be objects`);
    if (jsonBytes(value) > itemByteLimit) fail(code, `${label} contains an oversized entry`);
  }
};

const validateReceipt = (receipt, stateRevision, limits, code) => {
  if (!sameExactKeys(receipt, RECEIPT_KEYS)) fail(code, "Stored receipt is invalid");
  if (
    !SHA256.test(receipt.key_digest)
    || !SHA256.test(receipt.request_digest)
    || !Number.isSafeInteger(receipt.committed_revision)
    || receipt.committed_revision <= 0
    || receipt.committed_revision > stateRevision
  ) {
    fail(code, "Stored receipt is invalid");
  }
  if (jsonBytes(receipt) > limits.maxReceiptBytes) fail(code, "Stored receipt is oversized");
};

const validateState = (state, storeId, limits, code = "corrupt_state") => {
  if (!sameExactKeys(state, STATE_KEYS)) fail(code, "Persistent-memory state is invalid");
  if (
    state.schema !== STATE_SCHEMA
    || state.store_id !== storeId
    || !Number.isSafeInteger(state.revision)
    || state.revision < 0
    || typeof state.updated_at !== "string"
    || !Number.isFinite(Date.parse(state.updated_at))
    || !SHA256.test(state.checksum)
  ) {
    fail(code, "Persistent-memory state is invalid");
  }
  assertBoundedObjects(state.entries, limits.maxEntries, limits.maxEntryBytes, "entries", code);
  assertBoundedObjects(state.events, limits.maxEvents, limits.maxEventBytes, "events", code);
  if (!Array.isArray(state.receipts) || state.receipts.length > limits.maxReceipts) {
    fail(code, "receipts exceeds its entry limit");
  }
  const receiptKeys = new Set();
  for (const receipt of state.receipts) {
    validateReceipt(receipt, state.revision, limits, code);
    if (receiptKeys.has(receipt.key_digest)) fail(code, "Stored receipt keys must be unique");
    receiptKeys.add(receipt.key_digest);
  }
  const expectedChecksum = sha256(canonicalJson(checksumPayload(state)));
  if (state.checksum !== expectedChecksum) fail(code, "Persistent-memory checksum mismatch");
  if (jsonBytes(state) > limits.maxStateBytes) fail(code, "Persistent-memory state is oversized");
  return state;
};

const createInitialState = (storeId, now) => withChecksum({
  schema: STATE_SCHEMA,
  store_id: storeId,
  revision: 0,
  updated_at: currentTimestamp(now),
  entries: [],
  events: [],
  receipts: [],
});

const validateIdempotency = (idempotencyKey, requestDigest, limits) => {
  const hasKey = idempotencyKey !== undefined && idempotencyKey !== null;
  const hasDigest = requestDigest !== undefined && requestDigest !== null;
  if (hasKey !== hasDigest) {
    fail("invalid_argument", "idempotencyKey and requestDigest must be supplied together");
  }
  if (!hasKey) return null;
  if (
    typeof idempotencyKey !== "string"
    || idempotencyKey.length === 0
    || utf8Bytes(idempotencyKey) > limits.maxIdempotencyKeyBytes
  ) {
    fail("invalid_argument", "idempotencyKey is invalid");
  }
  if (typeof requestDigest !== "string" || !SHA256.test(requestDigest)) {
    fail("invalid_argument", "requestDigest must be a lowercase SHA-256 digest");
  }
  return { keyDigest: sha256(idempotencyKey), requestDigest };
};

const normalizeExactScope = (scope) => {
  if (!sameExactKeys(scope, SCOPE_KEYS)) {
    fail("invalid_argument", "scope must contain exactly tenant_id, workspace_id, agent_id, and subject_id");
  }
  const normalized = {};
  for (const key of SCOPE_KEYS) {
    if (typeof scope[key] !== "string" || !BOUNDED_ID.test(scope[key])) {
      fail("invalid_argument", `scope.${key} must be a bounded identifier`);
    }
    normalized[key] = scope[key];
  }
  return normalized;
};

const normalizeRedaction = (redactedEntryKey, redactedEntryId) => {
  const hasKey = redactedEntryKey !== undefined && redactedEntryKey !== null;
  const hasId = redactedEntryId !== undefined && redactedEntryId !== null;
  if (hasKey !== hasId) {
    fail("invalid_argument", "redactedEntryKey and redactedEntryId must be supplied together");
  }
  if (!hasKey) return null;
  const parts = typeof redactedEntryKey === "string" ? redactedEntryKey.split("\u001f") : [];
  if (
    typeof redactedEntryId !== "string"
    || !BOUNDED_ID.test(redactedEntryId)
    || parts.length !== 6
    || parts.slice(0, 4).some((part) => !BOUNDED_ID.test(part))
    || !["memory", "user"].includes(parts[4])
    || parts[5] !== redactedEntryId
  ) {
    fail("invalid_argument", "redaction must name one exact scoped entry key");
  }
  return { entryKey: redactedEntryKey, entryId: redactedEntryId };
};

const isRedactionMarker = (event, redaction, revision) => (
  sameExactKeys(event, REDACTION_MARKER_KEYS)
  && event.action === "redact"
  && event.entry_key === redaction.entryKey
  && event.entry_id === redaction.entryId
  && event.redacted === true
  && event.revision === revision
);

const receiptMatchesEntry = (receipt, entryId) => {
  const result = receipt?.result;
  return result?.entry?.entry_id === entryId
    || result?.entry?.id === entryId
    || result?.entry_id === entryId
    || result?.memory_id === entryId;
};

const isInside = (root, candidate) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
};

const resolvePhysicalPath = (candidate) => {
  let cursor = path.resolve(candidate);
  const missingSegments = [];
  while (true) {
    try {
      return path.resolve(realpathSync(cursor), ...missingSegments.reverse());
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      missingSegments.push(path.basename(cursor));
      cursor = parent;
    }
  }
};

const resolveGitCommonDirectory = (rootDir) => {
  const root = path.resolve(rootDir);
  const invoke = (args) => String(execFileSync(
    "git",
    ["-C", root, "rev-parse", ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  )).trim();
  try {
    return path.resolve(invoke(["--path-format=absolute", "--git-common-dir"]));
  } catch {
    try {
      const common = invoke(["--git-common-dir"]);
      return path.resolve(root, common);
    } catch {
      return root;
    }
  }
};

const assertStateDirectoryOutsideRepository = (directory, rootDir, gitCommonDirectory) => {
  const canonicalRoot = path.basename(gitCommonDirectory) === ".git"
    ? path.dirname(gitCommonDirectory)
    : gitCommonDirectory;
  const physicalDirectory = resolvePhysicalPath(directory);
  for (const repositoryPath of new Set([
    resolvePhysicalPath(rootDir),
    resolvePhysicalPath(canonicalRoot),
  ])) {
    if (isInside(repositoryPath, physicalDirectory)) {
      throw new TypeError("Persistent-memory state must remain outside the Knowgrph repository.");
    }
  }
  return physicalDirectory;
};

export function resolvePersistentMemoryStateDirectory(env = process.env, rootDir = process.cwd()) {
  if (!isRecord(env)) throw new TypeError("env must be an object");
  const repositoryRoot = path.resolve(rootDir);
  const gitCommonDirectory = resolveGitCommonDirectory(repositoryRoot);
  const configured = String(env.KNOWGRPH_MEMORY_STATE_DIR || "").trim();
  const namespace = String(env.KNOWGRPH_MEMORY_NAMESPACE || "local-operator").trim() || "local-operator";
  const configuredStateRoot = String(env.XDG_STATE_HOME || "").trim();
  const stateRoot = configuredStateRoot && path.isAbsolute(configuredStateRoot)
    ? configuredStateRoot
    : path.join(homedir(), ".local", "state");
  const directory = configured
    ? path.resolve(configured)
    : path.join(
      stateRoot,
      "knowgrph",
      "persistent-memory",
      sha256(gitCommonDirectory).slice(0, 24),
      sha256(namespace).slice(0, 24),
    );
  return assertStateDirectoryOutsideRepository(directory, repositoryRoot, gitCommonDirectory);
}

export function createPersistentMemoryFileStore({
  directory,
  storeId,
  now = Date.now,
  limits,
} = {}) {
  if (typeof directory !== "string" || !directory.trim() || directory.includes("\0")) {
    fail("invalid_argument", "directory must be a non-empty filesystem path");
  }
  if (typeof now !== "function") fail("invalid_argument", "now must be a function");
  const resolvedStoreId = normalizeStoreId(storeId);
  const resolvedLimits = normalizeLimits(limits);
  const rootDirectory = path.resolve(directory);
  const manifestsDirectory = path.join(rootDirectory, "manifests");
  const locksDirectory = path.join(rootDirectory, "locks");
  const storeDigest = sha256(resolvedStoreId);
  const statePath = path.join(manifestsDirectory, `${storeDigest}.json`);
  let ready;
  const ensureReady = () => ready ||= Promise.all([
    mkdir(manifestsDirectory, { recursive: true, mode: 0o700 }),
    mkdir(locksDirectory, { recursive: true, mode: 0o700 }),
  ]);
  const withFilesystemLock = createSkillEvolutionFilesystemMutex({
    locksDirectory,
    ready: ensureReady,
    lockTtlMs: resolvedLimits.lockTtlMs,
    lockWaitMs: resolvedLimits.lockWaitMs,
    lockRetryMs: resolvedLimits.lockRetryMs,
  });

  const withStoreLock = async (action) => {
    try {
      return await withFilesystemLock(storeDigest, action);
    } catch (error) {
      if (error?.code === "claim_conflict") {
        fail("busy", "Persistent-memory store is busy");
      }
      throw error;
    }
  };

  const readState = async () => {
    let source;
    try {
      source = await readFile(statePath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return createInitialState(resolvedStoreId, now);
      throw error;
    }
    if (utf8Bytes(source) > resolvedLimits.maxStateBytes) {
      fail("corrupt_state", "Persistent-memory state is oversized");
    }
    let state;
    try {
      state = JSON.parse(source);
    } catch {
      fail("corrupt_state", "Persistent-memory state is not valid JSON");
    }
    return validateState(state, resolvedStoreId, resolvedLimits);
  };

  const read = () => withStoreLock(async () => clone(await readState()));

  const transact = ({
    expectedRevision,
    idempotencyKey,
    requestDigest,
    redactedEntryKey,
    redactedEntryId,
    apply,
  } = {}) => {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      fail("invalid_argument", "expectedRevision must be a non-negative safe integer");
    }
    if (typeof apply !== "function") fail("invalid_argument", "apply must be a function");
    const idempotency = validateIdempotency(idempotencyKey, requestDigest, resolvedLimits);
    const redaction = normalizeRedaction(redactedEntryKey, redactedEntryId);
    return withStoreLock(async ({ assertOwned }) => {
      const before = await readState();
      if (idempotency) {
        const receipt = before.receipts.find(({ key_digest: key }) => key === idempotency.keyDigest);
        if (receipt) {
          if (receipt.request_digest !== idempotency.requestDigest) {
            fail("idempotency_conflict", "Idempotency key was already used for a different request");
          }
          return clone(receipt.result);
        }
      }
      if (before.revision !== expectedRevision) {
        fail("stale_revision", "Persistent-memory revision is stale", {
          currentRevision: before.revision,
        });
      }
      if (before.revision === Number.MAX_SAFE_INTEGER) {
        fail("capacity_reached", "Persistent-memory revision capacity was reached");
      }
      const nextRevision = before.revision + 1;
      const draft = clone(before);
      const result = persisted(await apply(draft, {
        beforeRevision: before.revision,
        nextRevision,
      }), "Transaction result");
      const entries = persisted(draft.entries, "draft.entries");
      const events = persisted(draft.events, "draft.events");
      assertBoundedObjects(
        entries,
        resolvedLimits.maxEntries,
        resolvedLimits.maxEntryBytes,
        "entries",
        "capacity_reached",
      );
      assertBoundedObjects(
        events,
        resolvedLimits.maxEvents,
        resolvedLimits.maxEventBytes,
        "events",
        "capacity_reached",
      );
      let receipts = clone(before.receipts);
      if (redaction) {
        const retainedEvents = before.events.filter(({ entry_key: key }) => key !== redaction.entryKey);
        const marker = events.at(-1);
        if (
          !isRedactionMarker(marker, redaction, nextRevision)
          || canonicalJson(events.slice(0, -1)) !== canonicalJson(retainedEvents)
        ) {
          fail("invalid_argument", "redaction may only remove matching lifecycle events and append its marker");
        }
        receipts = receipts.filter((receipt) => !receiptMatchesEntry(receipt, redaction.entryId));
      } else {
        if (events.length < before.events.length) {
          fail("invalid_argument", "events must remain append-only");
        }
        for (let index = 0; index < before.events.length; index += 1) {
          if (canonicalJson(events[index]) !== canonicalJson(before.events[index])) {
            fail("invalid_argument", "events must remain append-only");
          }
        }
      }
      if (idempotency) {
        if (receipts.length >= resolvedLimits.maxReceipts) {
          fail("capacity_reached", "receipts exceeds its entry limit");
        }
        const receipt = {
          key_digest: idempotency.keyDigest,
          request_digest: idempotency.requestDigest,
          committed_revision: nextRevision,
          result,
        };
        if (jsonBytes(receipt) > resolvedLimits.maxReceiptBytes) {
          fail("capacity_reached", "Transaction result exceeds the receipt limit");
        }
        receipts.push(receipt);
      }
      const successor = withChecksum({
        schema: STATE_SCHEMA,
        store_id: resolvedStoreId,
        revision: nextRevision,
        updated_at: currentTimestamp(now),
        entries,
        events,
        receipts,
      });
      validateState(successor, resolvedStoreId, resolvedLimits, "invalid_argument");
      if (jsonBytes(successor) > resolvedLimits.maxStateBytes) {
        fail("capacity_reached", "Persistent-memory state exceeds its byte limit");
      }
      await atomicWriteSkillEvolutionJson(statePath, successor, assertOwned);
      return clone(result);
    });
  };

  return Object.freeze({
    storeId: resolvedStoreId,
    read,
    transact,
  });
}

export function createLocalPersistentMemoryStore({
  rootDir = process.cwd(),
  env = process.env,
  now,
  limits,
} = {}) {
  const directory = resolvePersistentMemoryStateDirectory(env, rootDir);
  const namespace = normalizeStoreId(String(env.KNOWGRPH_MEMORY_STORE_ID || "local").trim() || "local");
  const stores = new Map();
  return Object.freeze({
    forScope(scope) {
      const normalized = normalizeExactScope(scope);
      const scopeDigest = sha256(canonicalJson({ namespace, scope: normalized }));
      if (!stores.has(scopeDigest)) {
        stores.set(scopeDigest, createPersistentMemoryFileStore({
          directory,
          storeId: `scope_${scopeDigest}`,
          now,
          limits,
        }));
      }
      return stores.get(scopeDigest);
    },
  });
}
