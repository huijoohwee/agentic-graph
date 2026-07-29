import { createHash } from "node:crypto";

export class AgenticSdlcProjectionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AgenticSdlcProjectionError";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new AgenticSdlcProjectionError(code, message);
};
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export function canonicalValue(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Object.is(value, -0) ? 0 : value;
  }
  if (!value || typeof value !== "object" || ancestors.has(value)) {
    fail("invalid_projection_input", "Projection input must be finite, acyclic JSON.");
  }
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    fail("invalid_projection_input", "Projection input must contain only JSON records.");
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    const out = value.map((item) => canonicalValue(item, ancestors));
    ancestors.delete(value);
    return out;
  }
  const out = {};
  for (const key of Object.keys(value).sort(compareText)) {
    if (value[key] === undefined) continue;
    out[key] = canonicalValue(value[key], ancestors);
  }
  ancestors.delete(value);
  return out;
}

export const stableJson = (value) => JSON.stringify(canonicalValue(value));
export const cloneJson = (value) => JSON.parse(stableJson(value));
export const digestJson = (value) =>
  createHash("sha256").update(stableJson(value), "utf8").digest("hex");
export const typedId = (type, ...parts) =>
  `sdlc-${type}-${Buffer.from(JSON.stringify(parts.map((part) =>
    typeof part === "string" || typeof part === "number"
      ? String(part).trim()
      : "")), "utf8").toString("base64url")}`;

export function assertBoundedJson(value, {
  maxArrayItems = 200,
  maxObjectProperties = 100,
  maxStringLength = 16_384,
  maxDepth = 64,
  maxValues = 100_000,
} = {}) {
  let values = 0;
  const visit = (item, depth) => {
    values += 1;
    if (values > maxValues || depth > maxDepth) {
      fail("projection_too_large", "Projection exceeds the closed MCP JSON bound.");
    }
    if (typeof item === "string" && item.length > maxStringLength) {
      fail("projection_too_large", "Projection contains an oversized JSON string.");
    }
    if (item === null || ["string", "boolean", "number"].includes(typeof item)) return;
    if (Array.isArray(item)) {
      if (item.length > maxArrayItems) {
        fail("projection_too_large", "Projection contains an oversized JSON array.");
      }
      item.forEach((entry) => visit(entry, depth + 1));
      return;
    }
    if (!item || typeof item !== "object") {
      fail("invalid_projection_input", "Projection contains a non-JSON value.");
    }
    const entries = Object.entries(item);
    if (entries.length > maxObjectProperties) {
      fail("projection_too_large", "Projection contains an oversized JSON object.");
    }
    entries.forEach(([, entry]) => visit(entry, depth + 1));
  };
  visit(value, 0);
}

export function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
