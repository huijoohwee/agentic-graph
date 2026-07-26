import { PERSISTENT_MEMORY_LIMITS } from "./persistent-memory-contract.mjs";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const TAG_PATTERN = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const TARGETS = new Set(["memory", "user"]);
const KINDS = new Set(["fact", "preference", "procedure", "decision", "session", "note"]);
const EVIDENCE_TYPES = new Set(["operator", "session", "artifact", "tool"]);
const SCOPE_KEYS = ["tenant_id", "workspace_id", "agent_id", "subject_id"];
const USER_PROFILE_PREFERENCE_PATTERN = /^(?:response_length=(?:concise|balanced|detailed)|response_style=(?:plain|technical|conversational|formal)|response_format=(?:prose|bullets|numbered|table)|code_explanation=(?:minimal|balanced|detailed)|language=(?:en|en-SG|zh|zh-CN|zh-TW|ms|id|ta|hi|ja|ko|fr|de|es|pt|it|nl|th|vi|fil)|date_format=(?:iso-8601|day-month-year|month-day-year)|time_format=(?:12-hour|24-hour))$/u;
const PERSONAL_PROFILE_CLAIM_PATTERN = /\b(?:(?:the\s+)?(?:user|customer|client|person|subject|he|she|they)\s+(?:is|has|believes|supports|votes|practices|identifies|suffers|was\s+diagnosed)|i\s+(?:am|have|believe|support|vote|practice|identify|suffer)|my\s+[\p{L}\p{N}_-]+)\b/iu;

const BLOCKED_TEXT_RULES = Object.freeze([
  {
    category: "credential",
    pattern:
      /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/-]{8,}=?|\b(?:https?|wss?):\/\/[^\s/:@]+:[^\s/@]+@|\b(?:sk-[A-Za-z0-9_-]{12,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,}|(?:api[_ -]?key|access[_ -]?token|password|secret)\s*[:=]\s*["']?\S{6,}))/iu,
  },
  {
    category: "invisible_control",
    pattern: /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u,
  },
  {
    category: "prompt_injection",
    pattern:
      /(?:ignore\s+(?:(?:all|any|the)\s+)?(?:previous|prior)\s+instructions?|disregard\s+(?:previous|prior)\s+instructions?|override\s+(?:the\s+)?(?:system|developer|security|policy)\b|reveal\s+(?:the\s+)?(?:system prompt|credentials?|secrets?)|(?:exfiltrat\w*|send|upload|transmit)\b.{0,80}\b(?:credentials?|secrets?|system prompt|private data)\b|(?:system|developer)\s+message\s*:|jailbreak|<\|im_(?:start|end)\|>|\[INST\])/iu,
  },
]);

const fail = (code, message, details) => {
  throw new PersistentMemoryPolicyError(code, message, details);
};

const assertPlainObject = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_input", `${label} must be an object.`);
  }
  return value;
};

export class PersistentMemoryPolicyError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "PersistentMemoryPolicyError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const countUnicodeCodePoints = (value) => Array.from(String(value)).length;

export function assertAllowedKeys(value, allowedKeys, label = "input") {
  assertPlainObject(value, label);
  const unknown = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unknown.length) {
    fail("invalid_input", `${label} contains unsupported fields.`, { field_count: unknown.length });
  }
}

export function normalizePersistentMemoryScope(value) {
  const scope = assertPlainObject(value, "scope");
  assertAllowedKeys(scope, SCOPE_KEYS, "scope");
  const normalized = {};
  for (const key of SCOPE_KEYS) {
    if (typeof scope[key] !== "string" || !ID_PATTERN.test(scope[key])) {
      fail("invalid_scope", `scope.${key} must be a bounded identifier.`);
    }
    assertSafePersistentText(scope[key], { field: `scope.${key}` });
    normalized[key] = scope[key];
  }
  return normalized;
}

export function normalizePersistentMemoryOperator(value, { requireApproval = true } = {}) {
  const operator = assertPlainObject(value, "operator");
  assertAllowedKeys(operator, ["id", "approved"], "operator");
  if (typeof operator.id !== "string" || !ID_PATTERN.test(operator.id)) {
    fail("invalid_operator", "operator.id must be a bounded identifier.");
  }
  assertSafePersistentText(operator.id, { field: "operator.id" });
  if (typeof operator.approved !== "boolean") {
    fail("invalid_operator", "operator.approved must be a boolean.");
  }
  if (requireApproval && operator.approved !== true) {
    fail("approval_required", "Explicit operator approval is required.");
  }
  return { id: operator.id, approved: operator.approved };
}

export function normalizePersistentMemoryEvidence(value, { target } = {}) {
  const evidence = assertPlainObject(value, "evidence");
  assertAllowedKeys(evidence, ["source_type", "source_id", "excerpt", "explicit"], "evidence");
  if (!EVIDENCE_TYPES.has(evidence.source_type)) {
    fail("invalid_evidence", "evidence.source_type is not supported.");
  }
  if (typeof evidence.source_id !== "string" || !ID_PATTERN.test(evidence.source_id)) {
    fail("invalid_evidence", "evidence.source_id must be a bounded identifier.");
  }
  assertSafePersistentText(evidence.source_id, { field: "evidence.source_id" });
  if (
    typeof evidence.excerpt !== "string"
    || !evidence.excerpt.trim()
    || countUnicodeCodePoints(evidence.excerpt) > 1_600
  ) {
    fail("invalid_evidence", "evidence.excerpt must contain 1 to 1600 characters.");
  }
  if (evidence.explicit !== undefined && typeof evidence.explicit !== "boolean") {
    fail("invalid_evidence", "evidence.explicit must be a boolean when supplied.");
  }
  if (target === "user" && evidence.explicit !== true) {
    fail(
      "unsupported_profile_inference",
      "User-profile writes require evidence explicitly marked as user-provided.",
    );
  }
  assertSafePersistentText(evidence.excerpt, { target, field: "evidence" });
  return {
    source_type: evidence.source_type,
    source_id: evidence.source_id,
    excerpt: evidence.excerpt,
    explicit: evidence.explicit === true,
  };
}

export function normalizePersistentMemoryTarget(value) {
  if (!TARGETS.has(value)) fail("invalid_target", "target must be memory or user.");
  return value;
}

export function normalizePersistentMemoryKind(value, fallback = "note") {
  const kind = value === undefined ? fallback : value;
  if (!KINDS.has(kind)) fail("invalid_kind", "kind is not supported.");
  return kind;
}

export function normalizePersistentMemoryTags(value = [], { target } = {}) {
  if (!Array.isArray(value) || value.length > PERSISTENT_MEMORY_LIMITS.maxTags) {
    fail("invalid_tags", `tags must contain at most ${PERSISTENT_MEMORY_LIMITS.maxTags} values.`);
  }
  if (new Set(value).size !== value.length || value.some((tag) => typeof tag !== "string" || !TAG_PATTERN.test(tag))) {
    fail("invalid_tags", "tags must be unique bounded lowercase identifiers.");
  }
  const tags = [...value].sort();
  assertSafePersistentText(tags.join(" "), { field: "tags" });
  if (target === "user") {
    assertSafePersistentText(tags.join(" ").replace(/[.-]/g, " "), { target, field: "tags" });
    if (tags.length) {
      fail("invalid_profile_preference", "User-profile tags are not accepted; use one allowlisted profile preference.");
    }
  }
  return tags;
}

export function assertSafePersistentText(value, { target, field = "content" } = {}) {
  const text = String(value);
  for (const rule of BLOCKED_TEXT_RULES) {
    if (rule.pattern.test(text)) {
      fail("unsafe_persistence_input", `${field} was blocked by the persistence safety policy.`, {
        category: rule.category,
      });
    }
  }
  if (
    target === "user"
    && /\b(?:race|ethnicity|religious (?:belief|affiliation)|political (?:belief|affiliation)|sexual orientation|gender identity|medical (?:condition|diagnosis)|health condition|disability|biometric data|genetic data|financial account|credit score|criminal history|immigration status|union membership)\b/iu.test(text)
  ) {
    fail("sensitive_profile_category", "Sensitive personal categories cannot be persisted in a user profile.");
  }
  if (
    target === "user"
    && /\b(?:i\s+infer|probably|likely|seems?\s+to)\b.{0,48}\b(?:prefers?|wants?|needs?|is)\b/iu.test(text)
  ) {
    fail(
      "unsupported_profile_inference",
      "Inferred profile claims cannot be persisted without direct user evidence.",
    );
  }
  if (field === "content" && PERSONAL_PROFILE_CLAIM_PATTERN.test(text)) {
    fail(
      "personal_profile_claim_rejected",
      "Free-form personal profile claims cannot be persisted.",
    );
  }
}

export function normalizePersistentMemoryContent(value, { target, field = "content" } = {}) {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_content", `${field} must be a non-empty string.`);
  }
  const entryLimit = target === "user"
    ? PERSISTENT_MEMORY_LIMITS.userCharacters
    : PERSISTENT_MEMORY_LIMITS.maxEntryCharacters;
  const characters = countUnicodeCodePoints(value);
  if (characters > entryLimit) {
    fail("entry_capacity_exceeded", `${field} exceeds its Unicode character limit.`, {
      limit: entryLimit,
      characters,
    });
  }
  assertSafePersistentText(value, { target, field });
  if (target === "user" && !USER_PROFILE_PREFERENCE_PATTERN.test(value)) {
    fail(
      "invalid_profile_preference",
      "User profiles accept only allowlisted, structured interaction preferences.",
    );
  }
  return value;
}

export function persistentMemoryCapacityForTarget(target) {
  return target === "user"
    ? PERSISTENT_MEMORY_LIMITS.userCharacters
    : PERSISTENT_MEMORY_LIMITS.memoryCharacters;
}

export function assertPersistentMemoryCapacity(entries, { scope, target }) {
  const characters = entries
    .filter((entry) =>
      entry.target === target
      && SCOPE_KEYS.every((key) => entry.scope?.[key] === scope[key]))
    .reduce((sum, entry) => sum + countUnicodeCodePoints(entry.content), 0);
  const limit = persistentMemoryCapacityForTarget(target);
  if (characters > limit) {
    fail("memory_capacity_exceeded", "The scoped persistent-memory capacity would be exceeded.", {
      target,
      characters,
      limit,
    });
  }
  return { characters, limit, remaining: limit - characters };
}
