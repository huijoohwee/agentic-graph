import { PERSISTENT_MEMORY_LIMITS } from "./persistent-memory-contract.mjs";
import { countUnicodeCodePoints } from "./persistent-memory-policy.js";

const SCOPE_KEYS = ["tenant_id", "workspace_id", "agent_id", "subject_id"];
const clone = (value) => JSON.parse(JSON.stringify(value));
const scopeKey = (scope) => SCOPE_KEYS.map((key) => scope[key]).join("\u001f");
const entryKey = (entry) =>
  `${scopeKey(entry.scope)}\u001f${entry.target}\u001f${entry.entry_id}`;
const sameScope = (left, right) =>
  SCOPE_KEYS.every((key) => left?.[key] === right[key]);
const codePointSlice = (value, length) =>
  Array.from(value).slice(0, length).join("");

export const snapshotPersistentMemoryAtRevision = (state, revision) => {
  if (revision === state.revision) return clone(state.entries);
  const byKey = new Map();
  [...state.events]
    .filter((event) => Number.isInteger(event.revision) && event.revision <= revision)
    .sort((left, right) =>
      left.revision - right.revision
      || String(left.event_id).localeCompare(String(right.event_id)))
    .forEach((event) => {
      if (event.redacted === true) {
        byKey.delete(event.entry_key);
      } else if (event.after) {
        byKey.set(event.entry_key || entryKey(event.after), clone(event.after));
      } else {
        byKey.delete(event.entry_key || entryKey(event.before));
      }
    });
  return [...byKey.values()];
};

const tokenize = (value) => Array.from(new Set(
  String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .match(/[\p{L}\p{N}]+/gu) || [],
));

const scoreEntry = (queryTokens, entry) => {
  if (!queryTokens.length) return 1;
  const searchable = `${entry.content} ${entry.kind} ${(entry.tags || []).join(" ")}`;
  const entryTokens = new Set(tokenize(searchable));
  const overlap = queryTokens.filter((token) => entryTokens.has(token)).length;
  if (!overlap) return 0;
  const exactBonus = entry.content
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .includes(queryTokens.join(" "))
    ? 0.05
    : 0;
  return Number(Math.min(1, overlap / queryTokens.length + exactBonus).toFixed(6));
};

const diversify = (scored) => {
  const buckets = new Map();
  for (const item of scored) {
    if (!buckets.has(item.entry.kind)) buckets.set(item.entry.kind, []);
    buckets.get(item.entry.kind).push(item);
  }
  for (const bucket of buckets.values()) {
    bucket.sort((left, right) =>
      right.score - left.score
      || right.entry.updated_revision - left.entry.updated_revision
      || left.entry.entry_id.localeCompare(right.entry.entry_id));
  }
  const orderedKinds = [...buckets]
    .sort((left, right) =>
      right[1][0].score - left[1][0].score
      || left[0].localeCompare(right[0]))
    .map(([kind]) => kind);
  const output = [];
  while (orderedKinds.some((kind) => buckets.get(kind).length)) {
    for (const kind of orderedKinds) {
      const next = buckets.get(kind).shift();
      if (next) output.push(next);
    }
  }
  return output;
};

const buildCitation = (entry, revision) => ({
  entry_id: entry.entry_id,
  source_ids: (entry.provenance || [])
    .map(({ source_type, source_id }) => ({ source_type, source_id })),
  created_revision: entry.created_revision,
  updated_revision: entry.updated_revision,
  as_of_revision: revision,
});

export const searchPersistentMemorySnapshot = (entries, {
  scope,
  query,
  target = "memory",
  kinds,
  tags,
  limit = 10,
  maxCharacters = PERSISTENT_MEMORY_LIMITS.memoryCharacters,
  revision,
  sessionId,
  requireSessionProvenance = false,
}) => {
  const queryTokens = tokenize(query);
  const kindSet = kinds ? new Set(kinds) : null;
  const tagSet = tags ? new Set(tags) : null;
  const scored = entries
    .filter((entry) =>
      sameScope(entry.scope, scope)
      && (target === "all" || entry.target === target)
      && (!kindSet || kindSet.has(entry.kind))
      && (!tagSet || [...tagSet].every((tag) => entry.tags?.includes(tag)))
      && (
        !requireSessionProvenance
        || entry.provenance?.some((item) => item.source_type === "session")
      )
      && (
        !sessionId
        || entry.provenance?.some((item) =>
          item.source_type === "session" && item.source_id === sessionId)
      ))
    .map((entry) => ({ entry, score: scoreEntry(queryTokens, entry) }))
    .filter(({ score }) => score > 0);
  const results = [];
  let remaining = maxCharacters;
  for (const { entry, score } of diversify(scored)) {
    if (results.length >= limit || remaining <= 0) break;
    const content = codePointSlice(entry.content, remaining);
    if (!content) break;
    remaining -= countUnicodeCodePoints(content);
    results.push({
      rank: results.length + 1,
      id: entry.entry_id,
      entry_id: entry.entry_id,
      target: entry.target,
      kind: entry.kind,
      tags: [...(entry.tags || [])],
      content,
      truncated: content !== entry.content,
      score,
      citation: buildCitation(entry, revision),
    });
  }
  return { results, injected_characters: maxCharacters - remaining };
};
