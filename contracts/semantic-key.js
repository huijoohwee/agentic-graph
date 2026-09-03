const normalizeJsonValue = (value) => {
  if (Array.isArray(value)) return value.map(normalizeJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort((left, right) => left.localeCompare(right)).reduce((out, key) => {
    out[key] = normalizeJsonValue(value[key]);
    return out;
  }, {});
};

export const stableStringify = (value) => JSON.stringify(normalizeJsonValue(value));

export function hashSemanticParts(parts) {
  const input = parts.map((part) => part == null ? "" : String(part)).join("|");
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildSemanticKey(namespace, parts, { prefix = "agentic_os" } = {}) {
  const normalizedNamespace = String(namespace || "semantic").trim() || "semantic";
  return `${prefix}_${hashSemanticParts([normalizedNamespace, stableStringify(parts)])}`;
}
