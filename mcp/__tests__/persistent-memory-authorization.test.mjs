import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PERSISTENT_MEMORY_AUTHORIZATION_MAX_TTL_SECONDS,
  PERSISTENT_MEMORY_MUTATION_TOOL_NAMES,
  PersistentMemoryAuthorizationError,
  createPersistentMemoryAuthorizationRequestDigest,
  mintPersistentMemoryAuthorization,
  verifyPersistentMemoryAuthorization,
} from "../persistent-memory-authorization.js";

const HOST_SECRET = Buffer.from(
  "host-a-persistent-memory-authorization-secret-0001",
  "utf8",
);
const OTHER_HOST_SECRET = Buffer.from(
  "host-b-persistent-memory-authorization-secret-0002",
  "utf8",
);
const TOOL = "agenticgraph.memory.write";
const ISSUED_AT = Date.parse("2026-07-24T08:00:00.000Z");
const NONCE = Buffer.alloc(24, 0x42);

const request = (authorizationToken = undefined) => ({
  scope: {
    tenant_id: "tenant-a",
    workspace_id: "workspace-a",
    agent_id: "agent-a",
    subject_id: "subject-a",
  },
  target: "memory",
  action: "add",
  content: "Keep the restart proof in durable memory.",
  tags: ["runtime", "restart"],
  expected_revision: 0,
  idempotency_key: "authorization-test-0001",
  ...(authorizationToken === undefined
    ? {}
    : { authorization_token: authorizationToken }),
});

const mint = (overrides = {}) => mintPersistentMemoryAuthorization({
  hostSecret: HOST_SECRET,
  toolName: TOOL,
  request: request("ignored-before-mint"),
  ttlSeconds: 300,
  now: () => ISSUED_AT,
  nonce: NONCE,
  ...overrides,
});

const verify = (authorizationToken, overrides = {}) => (
  verifyPersistentMemoryAuthorization({
    hostSecret: HOST_SECRET,
    toolName: TOOL,
    request: request(authorizationToken),
    authorizationToken,
    now: () => ISSUED_AT + 1_000,
    ...overrides,
  })
);

const rejectsCode = (callback, code) => {
  assert.throws(
    callback,
    (error) => (
      error instanceof PersistentMemoryAuthorizationError
      && error.code === code
    ),
  );
};

test("canonical request digest sorts JSON keys and excludes only the top-level authorization token", () => {
  const left = request("first-token");
  const right = {
    authorization_token: "different-token",
    tags: ["runtime", "restart"],
    content: "Keep the restart proof in durable memory.",
    action: "add",
    target: "memory",
    idempotency_key: "authorization-test-0001",
    expected_revision: 0,
    scope: {
      subject_id: "subject-a",
      agent_id: "agent-a",
      workspace_id: "workspace-a",
      tenant_id: "tenant-a",
    },
  };
  assert.equal(
    createPersistentMemoryAuthorizationRequestDigest(left),
    createPersistentMemoryAuthorizationRequestDigest(right),
  );
  assert.notEqual(
    createPersistentMemoryAuthorizationRequestDigest(left),
    createPersistentMemoryAuthorizationRequestDigest({
      ...right,
      content: "A different authorized mutation.",
    }),
  );
  assert.match(createPersistentMemoryAuthorizationRequestDigest(left), /^[a-f0-9]{64}$/);
});

test("minted opaque token verifies for its exact host, tool, and canonical request", () => {
  const minted = mint();
  assert.match(minted.authorization_token, /^kgpm1\.[A-Za-z0-9_-]{54}\.[A-Za-z0-9_-]{43}$/);
  assert.equal(minted.authorization_token.length, 104);
  assert.deepEqual(
    {
      issued_at: minted.issued_at,
      expires_at: minted.expires_at,
    },
    {
      issued_at: "2026-07-24T08:00:00.000Z",
      expires_at: "2026-07-24T08:05:00.000Z",
    },
  );

  const receipt = verify(minted.authorization_token);
  assert.deepEqual(receipt, {
    schema: "agenticgraph-persistent-memory-authorization-receipt/v1",
    status: "authorized",
    authorization_id: receipt.authorization_id,
    tool_name: TOOL,
    request_digest: createPersistentMemoryAuthorizationRequestDigest(request()),
    issued_at: "2026-07-24T08:00:00.000Z",
    expires_at: "2026-07-24T08:05:00.000Z",
    verified_at: "2026-07-24T08:00:01.000Z",
  });
  assert.match(receipt.authorization_id, /^[a-f0-9]{64}$/);
  assert.ok(Buffer.byteLength(JSON.stringify(receipt), "utf8") < 1_024);
});

test("authorization is bound to the exact mutation tool and request", () => {
  const minted = mint();
  rejectsCode(
    () => verify(minted.authorization_token, {
      toolName: "agenticgraph.memory.compact",
    }),
    "authorization_signature_mismatch",
  );
  rejectsCode(
    () => verify(minted.authorization_token, {
      request: {
        ...request(minted.authorization_token),
        expected_revision: 1,
      },
    }),
    "authorization_signature_mismatch",
  );
});

test("a different host secret cannot verify a token", () => {
  const minted = mint();
  rejectsCode(
    () => verify(minted.authorization_token, {
      hostSecret: OTHER_HOST_SECRET,
    }),
    "authorization_signature_mismatch",
  );
});

test("expired and future-issued authorizations fail closed", () => {
  const minted = mint({ ttlSeconds: 60 });
  rejectsCode(
    () => verify(minted.authorization_token, {
      now: () => ISSUED_AT + 60_000,
    }),
    "authorization_expired",
  );
  rejectsCode(
    () => verify(minted.authorization_token, {
      now: () => ISSUED_AT - 1,
    }),
    "authorization_not_yet_valid",
  );
});

test("the validity window is positive and never exceeds fifteen minutes", () => {
  const maximum = mint({
    ttlSeconds: PERSISTENT_MEMORY_AUTHORIZATION_MAX_TTL_SECONDS,
  });
  assert.equal(
    maximum.expires_at,
    "2026-07-24T08:15:00.000Z",
  );
  assert.equal(verify(maximum.authorization_token).status, "authorized");
  for (const ttlSeconds of [
    0,
    PERSISTENT_MEMORY_AUTHORIZATION_MAX_TTL_SECONDS + 1,
    1.5,
  ]) {
    rejectsCode(
      () => mint({ ttlSeconds }),
      "invalid_authorization_ttl",
    );
  }
});

test("host secrets are byte-bounded and all mutation tool names are explicit", () => {
  assert.deepEqual(PERSISTENT_MEMORY_MUTATION_TOOL_NAMES, [
    "agenticgraph.memory.write",
    "agenticgraph.memory.compact",
    "agenticgraph.user.profile",
  ]);
  for (const hostSecret of [
    Buffer.alloc(31, 0x61),
    "short-secret",
    Buffer.alloc(4_097, 0x61),
  ]) {
    rejectsCode(
      () => mint({ hostSecret }),
      "invalid_host_secret",
    );
  }
  rejectsCode(
    () => mint({ toolName: "agenticgraph.memory.search" }),
    "unsupported_mutation_tool",
  );
});

test("malformed tokens and malformed JSON requests are rejected with typed errors", () => {
  for (const authorizationToken of [
    "",
    "kgpm1",
    "kgpm1.not-base64.signature",
    "x".repeat(105),
    42,
  ]) {
    rejectsCode(
      () => verify(authorizationToken),
      "malformed_authorization_token",
    );
  }
  rejectsCode(
    () => verify(`kgpm1.${"A".repeat(54)}.${"A".repeat(43)}`),
    "authorization_signature_mismatch",
  );

  const cyclic = {};
  cyclic.self = cyclic;
  rejectsCode(
    () => createPersistentMemoryAuthorizationRequestDigest(cyclic),
    "invalid_authorization_request",
  );
  rejectsCode(
    () => createPersistentMemoryAuthorizationRequestDigest({
      value: Number.NaN,
    }),
    "invalid_authorization_request",
  );
});

test("receipt and typed failures disclose no token, secret, raw input, or path", () => {
  const rawContent = "/private/agent-state/secret-memory-value";
  const sensitiveRequest = {
    ...request(),
    content: rawContent,
  };
  const minted = mint({ request: sensitiveRequest });
  const receipt = verify(minted.authorization_token, {
    request: {
      ...sensitiveRequest,
      authorization_token: minted.authorization_token,
    },
  });
  const serializedReceipt = JSON.stringify(receipt);
  assert.equal(serializedReceipt.includes(minted.authorization_token), false);
  assert.equal(serializedReceipt.includes(HOST_SECRET.toString("utf8")), false);
  assert.equal(serializedReceipt.includes(rawContent), false);
  assert.equal(serializedReceipt.includes("/private/"), false);

  let caught;
  try {
    verify(minted.authorization_token, {
      request: {
        ...sensitiveRequest,
        content: `${rawContent}-changed`,
      },
    });
  } catch (error) {
    caught = error;
  }
  assert.equal(caught instanceof PersistentMemoryAuthorizationError, true);
  const serializedError = JSON.stringify({
    name: caught.name,
    code: caught.code,
    message: caught.message,
  });
  assert.equal(serializedError.includes(minted.authorization_token), false);
  assert.equal(serializedError.includes(HOST_SECRET.toString("utf8")), false);
  assert.equal(serializedError.includes(rawContent), false);
  assert.equal(serializedError.includes("/private/"), false);
});
