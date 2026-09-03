import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const AUTHORIZATION_CONTEXT = "agentic-graph-persistent-memory-host-authorization/v1";
const RECEIPT_SCHEMA = "agentic-graph-persistent-memory-authorization-receipt/v1";
const TOKEN_PREFIX = "kgpm1";
const TOKEN_NONCE_BYTES = 24;
const TOKEN_PAYLOAD_BYTES = 16 + TOKEN_NONCE_BYTES;
const TOKEN_PAYLOAD_LENGTH = 54;
const TOKEN_SIGNATURE_LENGTH = 43;
const TOKEN_PATTERN = /^kgpm1\.([A-Za-z0-9_-]{54})\.([A-Za-z0-9_-]{43})$/;
const MAX_TOKEN_CHARACTERS = 104;
const MIN_HOST_SECRET_BYTES = 32;
const MAX_HOST_SECRET_BYTES = 4_096;
const MAX_REQUEST_BYTES = 128 * 1024;
const MAX_CANONICAL_DEPTH = 32;
const MAX_CANONICAL_ITEMS = 10_000;
const MAX_TOOL_NAME_CHARACTERS = 96;
const MAX_DATE_MS = Date.parse("9999-12-31T23:59:59.999Z");
const DEFAULT_TTL_SECONDS = 300;

export const PERSISTENT_MEMORY_AUTHORIZATION_MAX_TTL_SECONDS = 15 * 60;

export const PERSISTENT_MEMORY_MUTATION_TOOL_NAMES = Object.freeze([
  "agentic-graph.memory.write",
  "agentic-graph.memory.compact",
  "agentic-graph.user.profile",
]);

const MUTATION_TOOLS = new Set(PERSISTENT_MEMORY_MUTATION_TOOL_NAMES);

export class PersistentMemoryAuthorizationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PersistentMemoryAuthorizationError";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new PersistentMemoryAuthorizationError(code, message);
};

const utf8Bytes = (value) => Buffer.byteLength(value, "utf8");

const isPlainRecord = (value) => (
  Boolean(value)
  && typeof value === "object"
  && !Array.isArray(value)
  && (
    Object.getPrototypeOf(value) === Object.prototype
    || Object.getPrototypeOf(value) === null
  )
);

const normalizeToolName = (toolName) => {
  if (
    typeof toolName !== "string"
    || toolName.length > MAX_TOOL_NAME_CHARACTERS
    || !MUTATION_TOOLS.has(toolName)
  ) {
    fail(
      "unsupported_mutation_tool",
      "Authorization is available only for a registered persistent-memory mutation tool.",
    );
  }
  return toolName;
};

const normalizeHostSecret = (hostSecret) => {
  let secret;
  if (typeof hostSecret === "string") {
    secret = Buffer.from(hostSecret, "utf8");
  } else if (Buffer.isBuffer(hostSecret) || hostSecret instanceof Uint8Array) {
    secret = Buffer.from(hostSecret);
  } else {
    fail("invalid_host_secret", "Host authorization secret must be a byte sequence.");
  }
  if (
    secret.byteLength < MIN_HOST_SECRET_BYTES
    || secret.byteLength > MAX_HOST_SECRET_BYTES
  ) {
    fail(
      "invalid_host_secret",
      `Host authorization secret must contain ${MIN_HOST_SECRET_BYTES} to ${MAX_HOST_SECRET_BYTES} bytes.`,
    );
  }
  return secret;
};

const normalizeTime = (value, label) => {
  const resolved = typeof value === "function" ? value() : value;
  const milliseconds = resolved instanceof Date
    ? resolved.getTime()
    : typeof resolved === "string"
      ? Date.parse(resolved)
      : resolved;
  if (
    !Number.isSafeInteger(milliseconds)
    || milliseconds < 0
    || milliseconds > MAX_DATE_MS
  ) {
    fail("invalid_authorization_time", `${label} must resolve to a valid UTC timestamp.`);
  }
  return milliseconds;
};

const normalizeTtlSeconds = (ttlSeconds) => {
  if (
    !Number.isSafeInteger(ttlSeconds)
    || ttlSeconds < 1
    || ttlSeconds > PERSISTENT_MEMORY_AUTHORIZATION_MAX_TTL_SECONDS
  ) {
    fail(
      "invalid_authorization_ttl",
      `Authorization TTL must be an integer from 1 to ${PERSISTENT_MEMORY_AUTHORIZATION_MAX_TTL_SECONDS} seconds.`,
    );
  }
  return ttlSeconds;
};

const normalizeNonce = (nonce) => {
  if (nonce === undefined) return randomBytes(TOKEN_NONCE_BYTES);
  if (!(Buffer.isBuffer(nonce) || nonce instanceof Uint8Array)) {
    fail("invalid_authorization_nonce", "Authorization nonce must be a byte sequence.");
  }
  const bytes = Buffer.from(nonce);
  if (bytes.byteLength !== TOKEN_NONCE_BYTES) {
    fail(
      "invalid_authorization_nonce",
      `Authorization nonce must contain exactly ${TOKEN_NONCE_BYTES} bytes.`,
    );
  }
  return bytes;
};

const assertDataProperty = (value, key) => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.hasOwn(descriptor, "value")) {
    fail("invalid_authorization_request", "Authorization request must contain only JSON data.");
  }
  return descriptor.value;
};

const canonicalJson = (
  value,
  state,
  ancestors = new Set(),
  depth = 0,
) => {
  if (depth > MAX_CANONICAL_DEPTH) {
    fail("invalid_authorization_request", "Authorization request exceeds the nesting limit.");
  }
  state.items += 1;
  if (state.items > MAX_CANONICAL_ITEMS) {
    fail("invalid_authorization_request", "Authorization request exceeds the item limit.");
  }
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    const serialized = JSON.stringify(value);
    if (utf8Bytes(serialized) > MAX_REQUEST_BYTES) {
      fail("invalid_authorization_request", "Authorization request exceeds the byte limit.");
    }
    return serialized;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail("invalid_authorization_request", "Authorization request must use finite JSON numbers.");
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    fail("invalid_authorization_request", "Authorization request must contain only JSON data.");
  }
  if (ancestors.has(value)) {
    fail("invalid_authorization_request", "Authorization request must not contain cycles.");
  }

  ancestors.add(value);
  let serialized;
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) {
      fail("invalid_authorization_request", "Authorization request arrays must be dense JSON arrays.");
    }
    const items = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        fail("invalid_authorization_request", "Authorization request arrays must be dense JSON arrays.");
      }
      items.push(canonicalJson(
        assertDataProperty(value, String(index)),
        state,
        ancestors,
        depth + 1,
      ));
    }
    serialized = `[${items.join(",")}]`;
  } else {
    if (!isPlainRecord(value)) {
      fail("invalid_authorization_request", "Authorization request must use plain JSON objects.");
    }
    const entries = [];
    for (const key of Object.keys(value).sort()) {
      entries.push(
        `${JSON.stringify(key)}:${canonicalJson(
          assertDataProperty(value, key),
          state,
          ancestors,
          depth + 1,
        )}`,
      );
    }
    serialized = `{${entries.join(",")}}`;
  }
  ancestors.delete(value);
  if (utf8Bytes(serialized) > MAX_REQUEST_BYTES) {
    fail("invalid_authorization_request", "Authorization request exceeds the byte limit.");
  }
  return serialized;
};

export function createPersistentMemoryAuthorizationRequestDigest(request) {
  if (!isPlainRecord(request)) {
    fail("invalid_authorization_request", "Authorization request must be a plain JSON object.");
  }
  const unsignedRequest = Object.create(null);
  for (const key of Object.keys(request)) {
    if (key === "authorization_token") continue;
    Object.defineProperty(unsignedRequest, key, {
      configurable: false,
      enumerable: true,
      value: assertDataProperty(request, key),
      writable: false,
    });
  }
  const canonical = canonicalJson(unsignedRequest, { items: 0 });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

const encodePayload = ({ issuedAtMs, expiresAtMs, nonce }) => {
  const payload = Buffer.alloc(TOKEN_PAYLOAD_BYTES);
  payload.writeBigUInt64BE(BigInt(issuedAtMs), 0);
  payload.writeBigUInt64BE(BigInt(expiresAtMs), 8);
  nonce.copy(payload, 16);
  return payload.toString("base64url");
};

const decodePayload = (encoded) => {
  const payload = Buffer.from(encoded, "base64url");
  if (
    payload.byteLength !== TOKEN_PAYLOAD_BYTES
    || payload.toString("base64url") !== encoded
  ) {
    fail("malformed_authorization_token", "Authorization token is malformed.");
  }
  const issuedAt = payload.readBigUInt64BE(0);
  const expiresAt = payload.readBigUInt64BE(8);
  if (
    issuedAt > BigInt(MAX_DATE_MS)
    || expiresAt > BigInt(MAX_DATE_MS)
    || issuedAt > BigInt(Number.MAX_SAFE_INTEGER)
    || expiresAt > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    fail("malformed_authorization_token", "Authorization token is malformed.");
  }
  return {
    issuedAtMs: Number(issuedAt),
    expiresAtMs: Number(expiresAt),
  };
};

const signatureMessage = ({ toolName, requestDigest, payload }) => (
  `${AUTHORIZATION_CONTEXT}\0${toolName}\0${requestDigest}\0${payload}`
);

const signAuthorization = ({ hostSecret, toolName, requestDigest, payload }) => (
  createHmac("sha256", hostSecret)
    .update(signatureMessage({ toolName, requestDigest, payload }), "utf8")
    .digest()
);

const parseToken = (authorizationToken) => {
  if (
    typeof authorizationToken !== "string"
    || authorizationToken.length > MAX_TOKEN_CHARACTERS
  ) {
    fail("malformed_authorization_token", "Authorization token is malformed.");
  }
  const match = authorizationToken.match(TOKEN_PATTERN);
  if (!match) {
    fail("malformed_authorization_token", "Authorization token is malformed.");
  }
  const payload = match[1];
  const signature = Buffer.from(match[2], "base64url");
  if (
    payload.length !== TOKEN_PAYLOAD_LENGTH
    || signature.byteLength !== 32
    || signature.toString("base64url") !== match[2]
  ) {
    fail("malformed_authorization_token", "Authorization token is malformed.");
  }
  return {
    payload,
    signature,
    ...decodePayload(payload),
  };
};

export function mintPersistentMemoryAuthorization({
  hostSecret,
  toolName,
  request,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  now = Date.now,
  nonce,
} = {}) {
  const secret = normalizeHostSecret(hostSecret);
  const normalizedToolName = normalizeToolName(toolName);
  const issuedAtMs = normalizeTime(now, "now");
  const normalizedTtl = normalizeTtlSeconds(ttlSeconds);
  const expiresAtMs = issuedAtMs + (normalizedTtl * 1_000);
  if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs > MAX_DATE_MS) {
    fail("invalid_authorization_time", "Authorization expiry must be a valid UTC timestamp.");
  }
  const requestDigest = createPersistentMemoryAuthorizationRequestDigest(request);
  const payload = encodePayload({
    issuedAtMs,
    expiresAtMs,
    nonce: normalizeNonce(nonce),
  });
  const signature = signAuthorization({
    hostSecret: secret,
    toolName: normalizedToolName,
    requestDigest,
    payload,
  }).toString("base64url");
  const authorizationToken = `${TOKEN_PREFIX}.${payload}.${signature}`;
  if (authorizationToken.length !== MAX_TOKEN_CHARACTERS) {
    fail("authorization_internal_error", "Authorization token could not be created.");
  }
  return Object.freeze({
    authorization_token: authorizationToken,
    issued_at: new Date(issuedAtMs).toISOString(),
    expires_at: new Date(expiresAtMs).toISOString(),
  });
}

export function verifyPersistentMemoryAuthorization({
  hostSecret,
  toolName,
  request,
  authorizationToken,
  now = Date.now,
} = {}) {
  const secret = normalizeHostSecret(hostSecret);
  const normalizedToolName = normalizeToolName(toolName);
  const requestDigest = createPersistentMemoryAuthorizationRequestDigest(request);
  const parsed = parseToken(authorizationToken);
  const expectedSignature = signAuthorization({
    hostSecret: secret,
    toolName: normalizedToolName,
    requestDigest,
    payload: parsed.payload,
  });
  if (!timingSafeEqual(expectedSignature, parsed.signature)) {
    fail(
      "authorization_signature_mismatch",
      "Authorization token is not valid for this host, tool, and request.",
    );
  }

  const nowMs = normalizeTime(now, "now");
  if (
    parsed.expiresAtMs <= parsed.issuedAtMs
    || parsed.expiresAtMs - parsed.issuedAtMs
      > PERSISTENT_MEMORY_AUTHORIZATION_MAX_TTL_SECONDS * 1_000
  ) {
    fail("invalid_authorization_window", "Authorization token has an invalid validity window.");
  }
  if (parsed.issuedAtMs > nowMs) {
    fail("authorization_not_yet_valid", "Authorization token was issued in the future.");
  }
  if (parsed.expiresAtMs <= nowMs) {
    fail("authorization_expired", "Authorization token has expired.");
  }

  const receipt = {
    schema: RECEIPT_SCHEMA,
    status: "authorized",
    authorization_id: createHash("sha256")
      .update(authorizationToken, "utf8")
      .digest("hex"),
    tool_name: normalizedToolName,
    request_digest: requestDigest,
    issued_at: new Date(parsed.issuedAtMs).toISOString(),
    expires_at: new Date(parsed.expiresAtMs).toISOString(),
    verified_at: new Date(nowMs).toISOString(),
  };
  if (utf8Bytes(JSON.stringify(receipt)) > 1_024) {
    fail("authorization_internal_error", "Authorization receipt exceeds its byte limit.");
  }
  return Object.freeze(receipt);
}
