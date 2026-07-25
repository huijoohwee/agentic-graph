import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENTIC_CANVAS_OS_DOCS_SOURCE_ROOT_URL,
} from "../agentic-canvas-os-docs-contract.mjs";
import {
  PERSISTENT_MEMORY_CONTRACT_VERSION,
  PERSISTENT_MEMORY_INVOCATION_ROUTES,
} from "../persistent-memory-contract.mjs";
import {
  PersistentMemoryInvocationError,
  createPersistentMemoryInvocationRuntime,
  parsePersistentMemoryInvocation,
} from "../persistent-memory-invocation-runtime.js";

const SOURCE_REVISION = "a".repeat(40);
const OTHER_REVISION = "b".repeat(40);
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const ECONOMICS = {
  provider: "local-deterministic",
  model_calls: 0,
  estimated_cost_usd: 0,
};
const KIND_BY_SIGIL = {
  "/": "command",
  "#": "semantic",
  "@": "binding",
};
const FILE_BY_KIND = {
  command: "DICTIONARY-COMMAND.md",
  semantic: "DICTIONARY-SEMANTIC.md",
  binding: "DICTIONARY-BINDING.md",
};

const sourcePathFor = (token) => `${FILE_BY_KIND[KIND_BY_SIGIL[token[0]]]}#${token}`;
const sourceUrlFor = (token, revision = SOURCE_REVISION) => {
  const root = AGENTIC_CANVAS_OS_DOCS_SOURCE_ROOT_URL.replace(
    "/blob/main/",
    `/blob/${revision}/`,
  );
  return `${root}/${sourcePathFor(token)}`;
};
const tokenList = (tokens) => tokens.map((token) => `\`${token}\``).join(", ");

const rowFor = (token, { intent = "Canonical intent." } = {}) => {
  const kind = KIND_BY_SIGIL[token[0]];
  if (kind === "command") {
    const route = PERSISTENT_MEMORY_INVOCATION_ROUTES[token];
    return `| \`${token}\` | ${intent} | ${tokenList(route.bindings)} | ${tokenList(route.semantics)} | Canonical completion proof. |`;
  }
  if (kind === "semantic") {
    return `| \`${token}\` | Canonical meaning. | Canonical match. | Canonical proof. |`;
  }
  return `| \`${token}\` | Canonical meaning. | Canonical authority. | Canonical boundary. |`;
};

const createDocsResolver = ({
  transform,
  revision = SOURCE_REVISION,
} = {}) => {
  const calls = [];
  const callsByToken = new Map();
  const resolveToken = async (request) => {
    assert.deepEqual(Object.keys(request).sort(), ["includeContent", "token"]);
    assert.equal(request.includeContent, true);
    const token = request.token;
    const count = (callsByToken.get(token) || 0) + 1;
    callsByToken.set(token, count);
    calls.push(token);
    const payload = {
      ok: true,
      sourceRevision: revision,
      token,
      invocation: {
        token,
        kind: KIND_BY_SIGIL[token[0]],
        sourcePath: sourcePathFor(token),
        sourceUrl: sourceUrlFor(token, revision),
        content: rowFor(token),
      },
    };
    return transform ? transform(structuredClone(payload), { token, count }) : payload;
  };
  return { calls, callsByToken, resolveToken };
};

const invocationFor = (command, {
  semantics = PERSISTENT_MEMORY_INVOCATION_ROUTES[command]?.semantics || [],
  bindings = PERSISTENT_MEMORY_INVOCATION_ROUTES[command]?.bindings || [],
} = {}) => [command, ...semantics, ...bindings].join(" ");

const requestFor = (command, overrides = {}) => ({
  invocation: invocationFor(command),
  source_revision: SOURCE_REVISION,
  arguments: {
    nested: { command },
    sequence: [3, 2, 1],
  },
  ...overrides,
});

const coreResultFor = (toolName) => ({
  ok: true,
  contractVersion: PERSISTENT_MEMORY_CONTRACT_VERSION,
  operation: toolName,
  economics: { ...ECONOMICS },
});

test("parser accepts one lowercase command with unique semantic and binding tokens", () => {
  const parsed = parsePersistentMemoryInvocation(
    "  /memory.search @operator #vcc @agent #truth @memory-store #memory-search  ",
  );
  assert.equal(parsed.command, "/memory.search");
  assert.deepEqual(parsed.semantics, ["#vcc", "#truth", "#memory-search"]);
  assert.deepEqual(parsed.bindings, ["@operator", "@agent", "@memory-store"]);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.semantics), true);
});

test("parser returns typed errors for malformed, duplicate, mixed-case, and forbidden tokens", () => {
  const cases = [
    ["", "invalid_invocation_syntax"],
    ["/memory.search /session.search", "invalid_invocation_command"],
    ["#truth @agent", "invalid_invocation_command"],
    ["/Memory.search #truth @agent", "mixed_case_invocation_token"],
    ["/memory.search #truth #truth @agent", "duplicate_invocation_token"],
    ["/memory.search truth @agent", "invalid_invocation_token"],
    ["/memory.seed #frontmatter @operator", "forbidden_invocation_token"],
    ["/memory.search #frozen-snapshot @agent", "forbidden_invocation_token"],
    ["/memory.search #truth @memory-snapshot", "forbidden_invocation_token"],
  ];
  for (const [invocation, code] of cases) {
    assert.throws(
      () => parsePersistentMemoryInvocation(invocation),
      (error) => error instanceof PersistentMemoryInvocationError && error.code === code,
      invocation,
    );
  }
});

test("all five exact canonical tuples dispatch their registered core tools", async () => {
  for (const [command, route] of Object.entries(PERSISTENT_MEMORY_INVOCATION_ROUTES)) {
    const docs = createDocsResolver();
    const dispatchCalls = [];
    const coreResult = coreResultFor(route.toolName);
    const runtime = createPersistentMemoryInvocationRuntime({
      resolveToken: docs.resolveToken,
      dispatch: async (...args) => {
        dispatchCalls.push(args);
        return coreResult;
      },
    });
    const request = requestFor(command);
    const output = await runtime.run(request);

    assert.equal(output.ok, true, command);
    assert.equal(output.contractVersion, PERSISTENT_MEMORY_CONTRACT_VERSION);
    assert.equal(output.operation, "invoke");
    assert.equal(output.command, command);
    assert.equal(output.toolName, route.toolName);
    assert.equal(output.sourceRevision, SOURCE_REVISION);
    assert.deepEqual(output.tuple, {
      command,
      semantics: [...route.semantics],
      bindings: [...route.bindings],
      toolName: route.toolName,
    });
    assert.equal(DIGEST_PATTERN.test(output.digests.tuple), true);
    assert.equal(DIGEST_PATTERN.test(output.digests.row), true);
    assert.equal(DIGEST_PATTERN.test(output.digests.payload), true);
    assert.deepEqual(output.economics, ECONOMICS);
    assert.equal(output.deploymentAttempted, false);
    assert.strictEqual(output.result, coreResult);
    assert.equal(dispatchCalls.length, 1);
    assert.equal(dispatchCalls[0][0], route.toolName);
    assert.deepEqual(dispatchCalls[0][1], request.arguments);
    assert.strictEqual(
      dispatchCalls[0][2].invocationReceipt,
      output.receipt,
    );
    assert.equal(output.receipt.tupleDigest, output.digests.tuple);
    assert.equal(output.receipt.rowDigest, output.digests.row);
    assert.equal(output.receipt.payloadDigest, output.digests.payload);
    assert.equal(
      docs.calls.length,
      (1 + route.semantics.length + route.bindings.length) * (route.mutates ? 2 : 1),
      command,
    );
    assert.equal(JSON.stringify(output).includes(process.cwd()), false);
  }
});

test("tuple validation rejects missing, extra, wrong-family, and unknown authority before resolution", async () => {
  const docs = createDocsResolver();
  let dispatchCalls = 0;
  const runtime = createPersistentMemoryInvocationRuntime({
    resolveToken: docs.resolveToken,
    dispatch: async () => {
      dispatchCalls += 1;
    },
  });
  const route = PERSISTENT_MEMORY_INVOCATION_ROUTES["/memory.search"];
  const secretToken = `#ghp_${"x".repeat(24)}`;
  const cases = [
    {
      invocation: invocationFor("/memory.search", {
        semantics: route.semantics.slice(1),
        bindings: route.bindings,
      }),
      code: "invocation_tuple_mismatch",
    },
    {
      invocation: invocationFor("/memory.search", {
        semantics: [...route.semantics, "#persistent-memory"],
        bindings: route.bindings,
      }),
      code: "invocation_tuple_mismatch",
    },
    {
      invocation: invocationFor("/memory.search", {
        semantics: [...route.semantics, "#memory-store"],
        bindings: route.bindings.filter((token) => token !== "@memory-store"),
      }),
      code: "invocation_tuple_mismatch",
    },
    {
      invocation: "/unknown.command #truth @agent",
      code: "unknown_invocation_command",
    },
    {
      invocation: invocationFor("/memory.search", {
        semantics: [...route.semantics, secretToken],
        bindings: route.bindings,
      }),
      code: "invocation_tuple_mismatch",
      secretToken,
    },
  ];
  for (const candidate of cases) {
    const result = await runtime.run({
      ...requestFor("/memory.search"),
      invocation: candidate.invocation,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, candidate.code);
    if (candidate.secretToken) {
      assert.equal(JSON.stringify(result).includes(candidate.secretToken), false);
    }
  }
  assert.equal(docs.calls.length, 0);
  assert.equal(dispatchCalls, 0);
});

test("closed request validation rejects extra fields, invalid revision, and non-object arguments", async () => {
  const docs = createDocsResolver();
  let dispatchCalls = 0;
  const runtime = createPersistentMemoryInvocationRuntime({
    resolveToken: docs.resolveToken,
    dispatch: async () => {
      dispatchCalls += 1;
    },
  });
  const cases = [
    {
      request: { ...requestFor("/memory.search"), extra: true },
      code: "invalid_invocation_request",
    },
    {
      request: requestFor("/memory.search", { source_revision: "main" }),
      code: "invalid_source_revision",
    },
    {
      request: requestFor("/memory.search", { arguments: [] }),
      code: "invalid_invocation_arguments",
    },
    {
      request: requestFor("/memory.search", { arguments: { invalid: undefined } }),
      code: "invalid_invocation_arguments",
    },
  ];
  for (const candidate of cases) {
    const result = await runtime.run(candidate.request);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, candidate.code);
    assert.deepEqual(result.economics, ECONOMICS);
    assert.equal(result.deploymentAttempted, false);
  }
  assert.equal(docs.calls.length, 0);
  assert.equal(dispatchCalls, 0);
});

test("docs resolution is exact-token, kind, path, URL, content, and revision fenced", async () => {
  const mutations = [
    {
      mutate: (payload) => ({ ...payload, sourceRevision: OTHER_REVISION }),
      code: "invocation_source_revision_mismatch",
    },
    {
      mutate: (payload) => ({ ...payload, token: "/session.search" }),
      code: "invocation_token_mismatch",
    },
    {
      mutate: (payload) => ({
        ...payload,
        invocation: { ...payload.invocation, kind: "binding" },
      }),
      code: "invocation_kind_mismatch",
    },
    {
      mutate: (payload) => ({
        ...payload,
        invocation: { ...payload.invocation, sourcePath: "MEMORY.md" },
      }),
      code: "invocation_source_path_mismatch",
    },
    {
      mutate: (payload) => ({
        ...payload,
        invocation: { ...payload.invocation, sourceUrl: "https://example.invalid/" },
      }),
      code: "invocation_source_url_mismatch",
    },
    {
      mutate: (payload) => ({
        ...payload,
        invocation: { ...payload.invocation, content: "not a table row" },
      }),
      code: "invocation_content_invalid",
    },
  ];
  for (const candidate of mutations) {
    const docs = createDocsResolver({
      transform: (payload, context) => (
        context.token === "/memory.search" ? candidate.mutate(payload) : payload
      ),
    });
    let dispatchCalls = 0;
    const runtime = createPersistentMemoryInvocationRuntime({
      resolveToken: docs.resolveToken,
      dispatch: async () => {
        dispatchCalls += 1;
      },
    });
    const result = await runtime.run(requestFor("/memory.search"));
    assert.equal(result.ok, false, candidate.code);
    assert.equal(result.error.code, candidate.code);
    assert.equal(dispatchCalls, 0);
  }
});

test("command-row authority must exactly match the registered route", async () => {
  const docs = createDocsResolver({
    transform: (payload, { token }) => {
      if (token !== "/memory.search") return payload;
      return {
        ...payload,
        invocation: {
          ...payload.invocation,
          content: payload.invocation.content.replace(
            "`@agent`, `@memory-store`, `@operator`",
            "`@agent`, `@operator`",
          ),
        },
      };
    },
  });
  let dispatchCalls = 0;
  const runtime = createPersistentMemoryInvocationRuntime({
    resolveToken: docs.resolveToken,
    dispatch: async () => {
      dispatchCalls += 1;
    },
  });
  const result = await runtime.run(requestFor("/memory.search"));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "invocation_row_mismatch");
  assert.equal(dispatchCalls, 0);
});

test("mutations re-resolve immediately and reject docs drift before dispatch", async () => {
  const docs = createDocsResolver({
    transform: (payload, { token, count }) => {
      if (token !== "/memory.write" || count !== 2) return payload;
      return {
        ...payload,
        invocation: {
          ...payload.invocation,
          content: rowFor(token, { intent: "Changed canonical intent." }),
        },
      };
    },
  });
  let dispatchCalls = 0;
  const runtime = createPersistentMemoryInvocationRuntime({
    resolveToken: docs.resolveToken,
    dispatch: async () => {
      dispatchCalls += 1;
    },
  });
  const result = await runtime.run(requestFor("/memory.write"));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "invocation_source_drift");
  assert.equal(dispatchCalls, 0);
  for (const count of docs.callsByToken.values()) assert.equal(count, 2);
});

test("read routes resolve once and pass arguments plus the exact receipt directly to dispatch", async () => {
  const docs = createDocsResolver();
  const dispatchCalls = [];
  const runtime = createPersistentMemoryInvocationRuntime({
    resolveToken: docs.resolveToken,
    dispatch: async (toolName, args, options) => {
      dispatchCalls.push({ toolName, args, options });
      return { direct: true, args };
    },
  });
  const request = requestFor("/session.search", {
    arguments: {
      query: "operator decision",
      scope: {
        tenant_id: "tenant",
        workspace_id: "workspace",
        agent_id: "agent",
        subject_id: "subject",
      },
    },
  });
  const result = await runtime.run(request);
  const route = PERSISTENT_MEMORY_INVOCATION_ROUTES["/session.search"];
  assert.equal(result.ok, true);
  assert.equal(dispatchCalls.length, 1);
  assert.equal(dispatchCalls[0].toolName, route.toolName);
  assert.deepEqual(dispatchCalls[0].args, request.arguments);
  assert.strictEqual(dispatchCalls[0].options.invocationReceipt, result.receipt);
  assert.deepEqual(result.result, { direct: true, args: request.arguments });
  assert.equal(docs.calls.length, 1 + route.semantics.length + route.bindings.length);
});

test("dispatch failures remain typed and expose no resolver or filesystem details", async () => {
  const docs = createDocsResolver();
  const runtime = createPersistentMemoryInvocationRuntime({
    resolveToken: docs.resolveToken,
    dispatch: async () => {
      throw Object.assign(new Error(`/private/path/${process.cwd()}`), {
        code: "revision_conflict",
        details: { path: process.cwd() },
      });
    },
  });
  const result = await runtime.run(requestFor("/memory.search"));
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "revision_conflict");
  assert.equal(result.error.message, "Persistent memory dispatch failed.");
  assert.equal(JSON.stringify(result).includes(process.cwd()), false);
  assert.deepEqual(result.economics, ECONOMICS);
  assert.equal(result.deploymentAttempted, false);
});
