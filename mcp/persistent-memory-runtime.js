import { createHash } from "node:crypto";

import {
  PersistentMemoryAuthorizationError,
  createPersistentMemoryAuthorizationRequestDigest,
  verifyPersistentMemoryAuthorization,
} from "./persistent-memory-authorization.js";
import {
  PERSISTENT_MEMORY_CONTRACT_VERSION,
  PERSISTENT_MEMORY_LIMITS,
  PERSISTENT_MEMORY_TOOL_NAMES,
} from "./persistent-memory-contract.mjs";
import {
  PersistentMemoryPolicyError,
  assertAllowedKeys,
  assertPersistentMemoryCapacity,
  assertSafePersistentText,
  countUnicodeCodePoints,
  normalizePersistentMemoryContent,
  normalizePersistentMemoryEvidence,
  normalizePersistentMemoryKind,
  normalizePersistentMemoryOperator,
  normalizePersistentMemoryScope,
  normalizePersistentMemoryTags,
  normalizePersistentMemoryTarget,
} from "./persistent-memory-policy.js";
import {
  searchPersistentMemorySnapshot,
  snapshotPersistentMemoryAtRevision,
} from "./persistent-memory-search.js";
import { PersistentMemoryStoreError } from "./persistent-memory-store.js";

const SCOPE_KEYS = ["tenant_id", "workspace_id", "agent_id", "subject_id"];
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const ECONOMICS = Object.freeze({
  provider: "local-deterministic",
  model_calls: 0,
  estimated_cost_usd: 0,
});
const WRITE_KEYS = [
  "scope", "target", "action", "operator", "evidence", "expected_revision",
  "idempotency_key", "authorization_token", "content", "entry_id", "previous_content", "kind", "tags",
];
const COMPACT_KEYS = [
  "scope", "target", "entries", "content", "reason", "operator", "evidence",
  "expected_revision", "idempotency_key", "authorization_token", "kind", "tags",
];
const SEARCH_KEYS = [
  "query", "scope", "target", "kinds", "tags", "limit", "max_characters",
  "as_of_revision",
];
const SESSION_KEYS = ["scope", "query", "session_id", "limit", "max_characters", "as_of_revision"];
const PROFILE_KEYS = [
  "scope", "action", "operator", "expected_revision", "idempotency_key",
  "authorization_token", "content", "entry_id", "previous_content", "kind", "tags", "evidence",
  "query", "limit", "as_of_revision",
];

const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
};

const digest = (value) => createHash("sha256").update(stableStringify(value)).digest("hex");
const publicStoreId = (value) => ID_PATTERN.test(String(value || ""))
  ? String(value)
  : `store_${digest(String(value || "")).slice(0, 24)}`;
const scopeKey = (scope) => SCOPE_KEYS.map((key) => scope[key]).join("\u001f");
const entryKey = (entry) => `${scopeKey(entry.scope)}\u001f${entry.target}\u001f${entry.entry_id}`;
const sameScope = (left, right) => SCOPE_KEYS.every((key) => left?.[key] === right[key]);
const clone = (value) => JSON.parse(JSON.stringify(value));

const success = (operation, fields = {}) => ({
  ok: true,
  contractVersion: PERSISTENT_MEMORY_CONTRACT_VERSION,
  operation,
  economics: { ...ECONOMICS },
  ...fields,
});

const fail = (code, message, details) => {
  throw new PersistentMemoryRuntimeError(code, message, details);
};

const boundedInteger = (value, { label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER }) => {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    fail("invalid_input", `${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
};

const requireId = (value, label, { minLength = 1 } = {}) => {
  if (typeof value !== "string" || value.length < minLength || !ID_PATTERN.test(value)) {
    fail("invalid_input", `${label} must be a bounded identifier.`);
  }
  assertSafePersistentText(value, { field: label });
  return value;
};

const normalizePriorContent = (value, target, { allowUnsafe = false } = {}) => {
  const limit = target === "user" ? PERSISTENT_MEMORY_LIMITS.userCharacters : PERSISTENT_MEMORY_LIMITS.maxEntryCharacters;
  if (typeof value !== "string" || !value.trim() || countUnicodeCodePoints(value) > limit) {
    fail("invalid_input", "previous_content must be a bounded non-empty string.");
  }
  if (!allowUnsafe) assertSafePersistentText(value, { target, field: "previous_content" });
  return value;
};

const normalizeMutationFence = (args) => ({
  expectedRevision: boundedInteger(args.expected_revision, { label: "expected_revision" }),
  idempotencyKey: typeof args.idempotency_key === "string"
    && args.idempotency_key.length >= 8
    && args.idempotency_key.length <= 200
    ? args.idempotency_key
    : fail("invalid_input", "idempotency_key must contain 8 to 200 characters."),
});

const normalizeNow = (now) => {
  const raw = typeof now === "function" ? now() : new Date();
  const date = raw instanceof Date ? raw : new Date(raw);
  if (!Number.isFinite(date.getTime())) fail("invalid_clock", "The persistent-memory clock returned an invalid value.");
  return date.toISOString();
};

const normalizeStoreState = (state) => {
  if (!state || typeof state !== "object" || !Number.isInteger(state.revision) || state.revision < 0) {
    fail("invalid_store_state", "Persistent-memory state has an invalid revision.");
  }
  if (!Array.isArray(state.entries) || !Array.isArray(state.events)) {
    fail("invalid_store_state", "Persistent-memory state is missing its entry or lifecycle ledger.");
  }
  return state;
};

const provenanceRecord = ({ evidence, operator, timestamp, revision, action }) => ({
  source_type: evidence.source_type,
  source_id: evidence.source_id,
  excerpt: evidence.excerpt,
  explicit: evidence.explicit,
  operator_id: operator.id,
  recorded_at: timestamp,
  revision,
  action,
});

const uniqueProvenance = (records) => {
  const seen = new Set();
  return records.filter((record) => {
    const key = digest([record.source_type, record.source_id, record.excerpt, record.revision, record.action]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const lifecycleEvent = ({ action, before, after, revision, timestamp, operator, evidence, extra = {} }) => ({
  event_id: `evt_${digest([revision, action, before?.entry_id, after?.entry_id, extra]).slice(0, 24)}`,
  revision,
  timestamp,
  action,
  entry_key: entryKey(after || before),
  entry_id: (after || before).entry_id,
  target: (after || before).target,
  scope: clone((after || before).scope),
  before: before ? clone(before) : null,
  after: after ? clone(after) : null,
  operator_id: operator.id,
  evidence: clone(evidence),
  ...extra,
});

const resolveRevision = (state, value) => {
  if (value === undefined) return state.revision;
  const revision = boundedInteger(value, { label: "as_of_revision", maximum: state.revision });
  return revision;
};

export class PersistentMemoryRuntimeError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "PersistentMemoryRuntimeError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function createPersistentMemoryRuntime({
  store,
  now,
  authorizationSecret,
  authorizeMutation,
} = {}) {
  const directStore = store
    && typeof store.read === "function"
    && typeof store.transact === "function";
  if (!directStore && typeof store?.forScope !== "function") {
    throw new TypeError("createPersistentMemoryRuntime requires a persistent-memory store.");
  }
  if (authorizeMutation !== undefined && typeof authorizeMutation !== "function") {
    throw new TypeError("authorizeMutation must be a function when provided.");
  }
  const storeForScope = (scope) => directStore ? store : store.forScope(scope);
  const authorize = async (toolName, args) => {
    if (authorizeMutation) return authorizeMutation({ toolName, request: args });
    if (authorizationSecret === undefined || authorizationSecret === "") {
      fail("authorization_unavailable", "Host-bound mutation authorization is not configured.");
    }
    return verifyPersistentMemoryAuthorization({
      hostSecret: authorizationSecret,
      toolName,
      request: args,
      authorizationToken: args.authorization_token,
      now,
    });
  };
  const supported = new Set([
    PERSISTENT_MEMORY_TOOL_NAMES.write,
    PERSISTENT_MEMORY_TOOL_NAMES.compact,
    PERSISTENT_MEMORY_TOOL_NAMES.search,
    PERSISTENT_MEMORY_TOOL_NAMES.sessionSearch,
    PERSISTENT_MEMORY_TOOL_NAMES.userProfile,
  ]);

  const transact = async (scopedStore, toolName, args, apply, redaction = {}) => {
    const fence = normalizeMutationFence(args);
    const requestDigest = digest({
      toolName,
      requestDigest: createPersistentMemoryAuthorizationRequestDigest(args),
    });
    try {
      return await scopedStore.transact({
        ...fence,
        requestDigest,
        ...redaction,
        apply,
      });
    } catch (error) {
      if (
        error instanceof PersistentMemoryStoreError
        || error instanceof PersistentMemoryPolicyError
        || error instanceof PersistentMemoryRuntimeError
      ) throw error;
      throw new PersistentMemoryRuntimeError("store_transaction_failed", "The persistent-memory transaction failed.");
    }
  };

  const write = async (args, invocationReceipt, operation = PERSISTENT_MEMORY_TOOL_NAMES.write, forcedTarget) => {
    assertAllowedKeys(args, forcedTarget ? PROFILE_KEYS : WRITE_KEYS);
    const scope = normalizePersistentMemoryScope(args.scope);
    const target = forcedTarget || normalizePersistentMemoryTarget(args.target);
    if (!forcedTarget && target !== "memory") {
      fail("invalid_target", "User-profile mutations must use knowgrph.user.profile.");
    }
    const action = args.action;
    if (!["add", "replace", "remove"].includes(action)) fail("invalid_action", "action must be add, replace, or remove.");
    if (action === "add" && args.previous_content !== undefined) {
      fail("invalid_input", "previous_content is not accepted for add.");
    }
    if (action === "remove" && [args.content, args.kind, args.tags].some((value) => value !== undefined)) {
      fail("invalid_input", "remove accepts only the exact prior content and entry identifier.");
    }
    const operator = normalizePersistentMemoryOperator(args.operator);
    const evidence = normalizePersistentMemoryEvidence(args.evidence, { target });
    const timestamp = normalizeNow(now);
    const content = action === "remove" ? undefined : normalizePersistentMemoryContent(args.content, { target });
    const previousContent = action === "add"
      ? undefined
      : normalizePriorContent(args.previous_content, target, { allowUnsafe: action === "remove" });
    const providedEntryId = args.entry_id === undefined ? undefined : requireId(args.entry_id, "entry_id");
    if (action !== "add" && !providedEntryId) fail("invalid_input", "entry_id is required for replace and remove.");
    const kind = normalizePersistentMemoryKind(args.kind, target === "user" ? "preference" : "note");
    const tags = normalizePersistentMemoryTags(args.tags, { target });
    if (target === "user" && kind !== "preference") {
      fail("invalid_profile_preference", "User-profile entries must use the preference kind.");
    }
    const authorizationReceipt = await authorize(operation, args);
    const scopedStore = storeForScope(scope);
    const redactedEntryKey = action === "remove"
      ? entryKey({ scope, target, entry_id: providedEntryId })
      : undefined;

    return transact(scopedStore, operation, args, (draft, { nextRevision }) => {
      normalizeStoreState(draft);
      const currentIndex = draft.entries.findIndex((entry) =>
        entry.entry_id === providedEntryId && entry.target === target && sameScope(entry.scope, scope));
      const before = currentIndex >= 0 ? draft.entries[currentIndex] : null;
      if (action !== "add" && !before) fail("entry_not_found", "No entry exists for that exact scope and target.");
      if (action !== "add" && before.content !== previousContent) {
        fail("prior_content_mismatch", "previous_content did not exactly match the current entry.");
      }
      if (action === "add" && draft.entries.some((entry) =>
        entry.target === target && sameScope(entry.scope, scope) && entry.content === content)) {
        fail("duplicate_entry", "That exact content already exists in the scoped target.");
      }
      if (action === "replace" && draft.entries.some((entry, index) =>
        index !== currentIndex && entry.target === target && sameScope(entry.scope, scope) && entry.content === content)) {
        fail("duplicate_entry", "That exact content already exists in the scoped target.");
      }

      const entryId = providedEntryId || `mem_${digest([scope, target, args.idempotency_key, content]).slice(0, 24)}`;
      if (action === "add" && draft.entries.some((entry) =>
        entry.entry_id === entryId && entry.target === target && sameScope(entry.scope, scope))) {
        fail("duplicate_entry", "That entry identifier already exists in the scoped target.");
      }
      const provenance = provenanceRecord({ evidence, operator, timestamp, revision: nextRevision, action });
      const after = action === "remove" ? null : {
        id: entryId,
        entry_id: entryId,
        scope,
        target,
        kind: args.kind === undefined && before ? before.kind : kind,
        tags: args.tags === undefined && before ? [...before.tags] : tags,
        content,
        provenance: uniqueProvenance([...(before?.provenance || []), provenance]),
        created_at: before?.created_at || timestamp,
        updated_at: timestamp,
        created_revision: before?.created_revision || nextRevision,
        updated_revision: nextRevision,
      };
      if (before) draft.entries.splice(currentIndex, 1);
      if (after) draft.entries.push(after);
      const capacity = assertPersistentMemoryCapacity(draft.entries, { scope, target });
      const event = action === "remove"
        ? {
          action: "redact",
          entry_key: redactedEntryKey,
          entry_id: before.entry_id,
          redacted: true,
          revision: nextRevision,
        }
        : lifecycleEvent({
          action, before, after, revision: nextRevision, timestamp, operator, evidence,
          extra: {
            authorization_receipt_digest: digest(authorizationReceipt),
            ...(invocationReceipt
              ? { invocation_receipt_digest: digest(invocationReceipt) }
              : {}),
          },
        });
      if (action === "remove") {
        draft.events = draft.events.filter(({ entry_key: key }) => key !== redactedEntryKey);
      }
      draft.events.push(event);
      return success(operation, {
        revision: nextRevision,
        store_id: publicStoreId(scopedStore.storeId || draft.store_id),
        action,
        entry: after ? clone(after) : { id: before.entry_id, entry_id: before.entry_id, removed: true },
        lifecycle: {
          ...(event.event_id ? { event_id: event.event_id } : {}),
          action: event.action,
          revision: nextRevision,
          redacted: event.redacted === true,
        },
        authorization: {
          status: authorizationReceipt.status,
          receipt_digest: digest(authorizationReceipt),
          expires_at: authorizationReceipt.expires_at,
        },
        capacity,
      });
    }, action === "remove"
      ? { redactedEntryKey, redactedEntryId: providedEntryId }
      : {});
  };

  const compact = async (args, invocationReceipt) => {
    assertAllowedKeys(args, COMPACT_KEYS);
    const scope = normalizePersistentMemoryScope(args.scope);
    const target = normalizePersistentMemoryTarget(args.target);
    if (target === "user") {
      fail("invalid_profile_preference", "User-profile entries must be replaced or removed explicitly, not compacted.");
    }
    const operator = normalizePersistentMemoryOperator(args.operator);
    const evidence = normalizePersistentMemoryEvidence(args.evidence, { target });
    const content = normalizePersistentMemoryContent(args.content, { target });
    if (typeof args.reason !== "string" || !args.reason.trim() || countUnicodeCodePoints(args.reason) > 240) {
      fail("invalid_input", "reason must contain 1 to 240 characters.");
    }
    assertSafePersistentText(args.reason, { target, field: "reason" });
    if (!Array.isArray(args.entries) || args.entries.length < 2 || args.entries.length > PERSISTENT_MEMORY_LIMITS.maxEntriesPerCompact) {
      fail("invalid_input", "entries must name 2 to 50 prior entries.");
    }
    const requested = args.entries.map((item) => {
      assertAllowedKeys(item, ["entry_id", "previous_content"], "compact entry");
      return { entry_id: requireId(item.entry_id, "entry_id"), previous_content: normalizePriorContent(item.previous_content, target) };
    });
    if (new Set(requested.map(({ entry_id }) => entry_id)).size !== requested.length) {
      fail("invalid_input", "Compact entry identifiers must be unique.");
    }
    const timestamp = normalizeNow(now);
    const authorizationReceipt = await authorize(PERSISTENT_MEMORY_TOOL_NAMES.compact, args);
    const scopedStore = storeForScope(scope);

    return transact(scopedStore, PERSISTENT_MEMORY_TOOL_NAMES.compact, args, (draft, { nextRevision }) => {
      normalizeStoreState(draft);
      const selected = requested.map((request) => {
        const entry = draft.entries.find((candidate) =>
          candidate.entry_id === request.entry_id && candidate.target === target && sameScope(candidate.scope, scope));
        if (!entry) fail("entry_not_found", "A named compact entry does not exist for that exact scope and target.");
        if (entry.content !== request.previous_content) {
          fail("prior_content_mismatch", "A compact previous_content value did not exactly match its current entry.");
        }
        return entry;
      });
      const selectedIds = new Set(selected.map(({ entry_id }) => entry_id));
      const selectedKinds = new Set(selected.map(({ kind }) => kind));
      const kind = args.kind === undefined
        ? selectedKinds.size === 1
          ? selected[0].kind
          : fail("ambiguous_compaction_kind", "Compaction must name a kind when selected entries have different kinds.")
        : normalizePersistentMemoryKind(args.kind);
      const inheritedTags = [...new Set(selected.flatMap((entry) => entry.tags || []))].sort();
      const tags = args.tags === undefined
        ? normalizePersistentMemoryTags(inheritedTags, { target })
        : normalizePersistentMemoryTags(args.tags, { target });
      const beforeCapacity = assertPersistentMemoryCapacity(draft.entries, { scope, target });
      draft.entries = draft.entries.filter((entry) =>
        !(entry.target === target && sameScope(entry.scope, scope) && selectedIds.has(entry.entry_id)));
      const compactId = `mem_${digest([scope, target, requested.map(({ entry_id }) => entry_id).sort(), content]).slice(0, 24)}`;
      if (draft.entries.some((entry) =>
        entry.target === target && sameScope(entry.scope, scope)
        && (entry.entry_id === compactId || entry.content === content))) {
        fail("duplicate_entry", "Compaction would duplicate an existing scoped entry.");
      }
      const namedProvenance = uniqueProvenance(selected.flatMap((entry) => entry.provenance || []));
      const compactProvenance = provenanceRecord({
        evidence, operator, timestamp, revision: nextRevision, action: "compact",
      });
      const after = {
        id: compactId,
        entry_id: compactId,
        scope,
        target,
        kind,
        tags,
        content,
        provenance: uniqueProvenance([...namedProvenance, compactProvenance]),
        created_at: timestamp,
        updated_at: timestamp,
        created_revision: nextRevision,
        updated_revision: nextRevision,
      };
      draft.entries.push(after);
      const afterCapacity = assertPersistentMemoryCapacity(draft.entries, { scope, target });
      if (afterCapacity.characters >= beforeCapacity.characters) {
        fail("compaction_not_reducing", "Compaction must reduce scoped Unicode character usage.");
      }
      const compactGroupId = `compact_${digest([nextRevision, selectedIds, compactId]).slice(0, 20)}`;
      for (const entry of selected) {
        draft.events.push(lifecycleEvent({
          action: "compact_remove", before: entry, after: null, revision: nextRevision,
          timestamp, operator, evidence, extra: { compact_group_id: compactGroupId, reason: args.reason },
        }));
      }
      const addedEvent = lifecycleEvent({
        action: "compact_add", before: null, after, revision: nextRevision,
        timestamp, operator, evidence, extra: {
          compact_group_id: compactGroupId,
          reason: args.reason,
          compacted_entry_ids: [...selectedIds].sort(),
          authorization_receipt_digest: digest(authorizationReceipt),
          invocation_receipt_digest: invocationReceipt ? digest(invocationReceipt) : undefined,
        },
      });
      draft.events.push(addedEvent);
      return success(PERSISTENT_MEMORY_TOOL_NAMES.compact, {
        revision: nextRevision,
        store_id: publicStoreId(scopedStore.storeId || draft.store_id),
        action: "compact",
        entry: clone(after),
        compacted_entry_ids: [...selectedIds].sort(),
        preserved_sources: namedProvenance.map(({ source_type, source_id }) => ({ source_type, source_id })),
        lifecycle: { compact_group_id: compactGroupId, event_id: addedEvent.event_id, revision: nextRevision },
        authorization: {
          status: authorizationReceipt.status,
          receipt_digest: digest(authorizationReceipt),
          expires_at: authorizationReceipt.expires_at,
        },
        capacity: { before: beforeCapacity, after: afterCapacity },
      });
    });
  };

  const search = async (args, {
    operation = PERSISTENT_MEMORY_TOOL_NAMES.search,
    sessionOnly = false,
    forcedTarget,
  } = {}) => {
    assertAllowedKeys(args, sessionOnly ? SESSION_KEYS : SEARCH_KEYS);
    const scope = normalizePersistentMemoryScope(args.scope);
    if (typeof args.query !== "string" || !args.query.trim() || countUnicodeCodePoints(args.query) > PERSISTENT_MEMORY_LIMITS.maxQueryCharacters) {
      fail("invalid_query", "query must contain 1 to 500 characters.");
    }
    const state = normalizeStoreState(await storeForScope(scope).read());
    const revision = resolveRevision(state, args.as_of_revision);
    const target = forcedTarget || (args.target === undefined ? "memory" : args.target);
    if (!["memory", "user", "all"].includes(target)) fail("invalid_target", "target must be memory, user, or all.");
    const kinds = sessionOnly ? ["session"] : args.kinds;
    if (kinds !== undefined && (!Array.isArray(kinds) || kinds.length > 6 || new Set(kinds).size !== kinds.length)) {
      fail("invalid_input", "kinds must be a unique array.");
    }
    kinds?.forEach((kind) => normalizePersistentMemoryKind(kind));
    const tags = args.tags === undefined ? undefined : normalizePersistentMemoryTags(args.tags);
    const limit = args.limit === undefined ? 10 : boundedInteger(args.limit, {
      label: "limit", minimum: 1, maximum: PERSISTENT_MEMORY_LIMITS.maxResults,
    });
    const maxCharacters = args.max_characters === undefined
      ? (target === "user" ? PERSISTENT_MEMORY_LIMITS.userCharacters : PERSISTENT_MEMORY_LIMITS.memoryCharacters)
      : boundedInteger(args.max_characters, { label: "max_characters", minimum: 1, maximum: 4_000 });
    const sessionId = args.session_id === undefined ? undefined : requireId(args.session_id, "session_id");
    const snapshot = snapshotPersistentMemoryAtRevision(state, revision);
    const requireSessionProvenance = sessionOnly;
    const found = searchPersistentMemorySnapshot(snapshot, {
      scope, query: args.query, target, kinds, tags, limit, maxCharacters, revision, sessionId,
      requireSessionProvenance,
    });
    const snapshotEntries = snapshot.filter((entry) =>
      sameScope(entry.scope, scope)
      && (target === "all" || entry.target === target)
      && (!requireSessionProvenance || (
        entry.kind === "session" && entry.provenance?.some((item) => item.source_type === "session")
      )));
    return success(operation, {
      revision: state.revision,
      as_of_revision: revision,
      snapshot_digest: digest(snapshotEntries.sort((left, right) => entryKey(left).localeCompare(entryKey(right)))),
      scope,
      target,
      ...found,
    });
  };

  const userProfile = async (args, invocationReceipt) => {
    assertAllowedKeys(args, PROFILE_KEYS);
    if (args.action === "inspect") {
      if (["expected_revision", "idempotency_key", "authorization_token", "content", "entry_id", "previous_content", "kind", "tags", "evidence"]
        .some((key) => args[key] !== undefined)) {
        fail("invalid_input", "inspect does not accept mutation fields.");
      }
      normalizePersistentMemoryOperator(args.operator, { requireApproval: false });
      return search({
        scope: args.scope,
        query: args.query?.trim() || "*",
        target: "user",
        limit: args.limit,
        as_of_revision: args.as_of_revision,
      }, { operation: PERSISTENT_MEMORY_TOOL_NAMES.userProfile, forcedTarget: "user" });
    }
    if (args.query !== undefined || args.limit !== undefined || args.as_of_revision !== undefined) {
      fail("invalid_input", "Profile mutations do not accept inspection fields.");
    }
    return write(args, invocationReceipt, PERSISTENT_MEMORY_TOOL_NAMES.userProfile, "user");
  };

  return Object.freeze({
    supports(toolName) {
      return supported.has(toolName);
    },
    async run(toolName, args = {}, { invocationReceipt } = {}) {
      if (!supported.has(toolName)) fail("unsupported_tool", "The requested persistent-memory tool is not supported.");
      try {
        if (toolName === PERSISTENT_MEMORY_TOOL_NAMES.write) return await write(args, invocationReceipt);
        if (toolName === PERSISTENT_MEMORY_TOOL_NAMES.compact) return await compact(args, invocationReceipt);
        if (toolName === PERSISTENT_MEMORY_TOOL_NAMES.search) return await search(args);
        if (toolName === PERSISTENT_MEMORY_TOOL_NAMES.sessionSearch) {
          return await search(args, {
            operation: PERSISTENT_MEMORY_TOOL_NAMES.sessionSearch,
            sessionOnly: true,
            forcedTarget: "memory",
          });
        }
        return await userProfile(args, invocationReceipt);
      } catch (error) {
        if (error instanceof PersistentMemoryRuntimeError) throw error;
        if (error instanceof PersistentMemoryPolicyError) {
          throw new PersistentMemoryRuntimeError(error.code, error.message, error.details);
        }
        if (error instanceof PersistentMemoryAuthorizationError) {
          throw new PersistentMemoryRuntimeError(error.code, error.message);
        }
        if (error instanceof PersistentMemoryStoreError) throw error;
        throw new PersistentMemoryRuntimeError("runtime_failed", "The persistent-memory operation failed.");
      }
    },
  });
}
