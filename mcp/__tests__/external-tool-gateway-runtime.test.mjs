import assert from "node:assert/strict";
import test from "node:test";

import { EXTERNAL_TOOL_GATEWAY_TOOL_NAMES } from "../external-tool-gateway-contract.js";
import { createExternalToolGatewayRuntime } from "../external-tool-gateway-runtime.js";
import {
  EXTERNAL_MCP_PROFILES_ENV,
  computeExternalToolSchemaDigest,
  loadExternalToolProfileRegistry,
} from "../external-tool-profile-registry.js";

const SECRET = "test-only-external-mcp-approval-secret-32chars";
const NOW = 1_800_000_000_000;
const UPSTREAM_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["deck_title", "markdown", "content_type", "folder_id", "request_id"],
  properties: {
    deck_title: { type: "string", minLength: 1 },
    markdown: { type: "string", minLength: 1 },
    content_type: { type: "string", const: "text/markdown" },
    folder_id: { type: "string", const: "approved-folder" },
    request_id: { type: "string", minLength: 8 },
  },
});

const PROFILE = Object.freeze({
  id: "slides-host",
  label: "Slides Host",
  transport: {
    type: "streamable-http",
    url: "https://mcp.example.com/mcp",
    timeoutMs: 12_000,
  },
  tools: [{
    name: "create_presentation",
    label: "Create presentation",
    description: "Create one external slide deck.",
    artifactKind: "slides",
    upstreamInputSchemaDigest: computeExternalToolSchemaDigest(UPSTREAM_SCHEMA),
    argumentMapping: {
      title: "deck_title",
      content: "markdown",
      contentType: "content_type",
    },
    constantArguments: { folder_id: "approved-folder" },
    idempotencyArgumentName: "request_id",
    result: {
      idPointer: "/structuredContent/id",
      urlPointer: "/structuredContent/url",
      titlePointer: "/structuredContent/title",
      mimeType: "application/vnd.example.presentation",
      allowedOrigins: ["https://docs.example.com"],
    },
  }],
});

const ARTIFACT = Object.freeze({
  title: "Quarterly plan",
  content: "# Slide 1\n\n---\n\n# Slide 2",
  contentType: "text/markdown",
  fileName: "quarterly-plan.md",
  workspacePath: "workspace:/agentic-graph/quarterly-plan.md",
  sourceUrl: "https://sources.example.com/plan",
});

const makeRegistry = (profiles = [PROFILE]) => loadExternalToolProfileRegistry({
  env: {
    NODE_ENV: "test",
    [EXTERNAL_MCP_PROFILES_ENV]: JSON.stringify({ profiles }),
  },
});

const makeCallArgs = (capability, overrides = {}) => ({
  capabilityId: capability.capabilityId,
  capabilityRevision: capability.capabilityRevision,
  artifact: ARTIFACT,
  idempotencyKey: "deck-run-0001",
  ...overrides,
});
const callRuntime = (runtime, args, context = {}) => runtime.call(args, { markSideEffectDispatched: () => {}, ...context });

test("catalog and describe expose only opaque capability and canonical artifact metadata", async () => {
  const registry = makeRegistry();
  const runtime = createExternalToolGatewayRuntime({ registry, approvalSecret: SECRET, now: NOW });
  const catalog = runtime.catalog({ artifactKinds: ["slides"] });
  assert.equal(catalog.ok, true);
  assert.equal(catalog.count, 1);
  const serializedCatalog = JSON.stringify(catalog);
  for (const forbidden of ["mcp.example.com", "create_presentation", "approved-folder", "deck_title", "markdown"]) {
    assert.equal(serializedCatalog.includes(forbidden), false, `catalog leaked ${forbidden}`);
  }

  const described = await runtime.describe({ capabilityId: catalog.capabilities[0].capabilityId });
  assert.equal(described.ok, true);
  assert.equal(described.artifactSchema.properties.content.type, "string");
  assert.equal(JSON.stringify(described).includes("create_presentation"), false);
  assert.equal(JSON.stringify(described).includes("deck_title"), false);
  assert.equal((await runtime.run(EXTERNAL_TOOL_GATEWAY_TOOL_NAMES.search, { query: "presentation" })).count, 1);
});

test("approved call maps canonical artifact deterministically and returns a sanitized receipt", async () => {
  const registry = makeRegistry();
  const capability = registry.capabilities[0];
  const events = [];
  let closeCount = 0;
  const runtime = createExternalToolGatewayRuntime({
    registry,
    approvalSecret: SECRET,
    now: NOW,
    createSession: async (profile, options) => {
      events.push({ type: "connect", profileId: profile.id, hasSignal: options.signal instanceof AbortSignal });
      return {
        listTools: async () => ({ tools: [{ name: "create_presentation", inputSchema: UPSTREAM_SCHEMA }] }),
        callTool: async (name, argumentsValue) => {
          events.push({ type: "call", name, argumentsValue });
          return {
            content: [{ type: "text", text: "raw provider text must not escape" }],
            structuredContent: {
              id: "deck-123",
              url: "https://docs.example.com/decks/deck-123?access_token=must-strip#fragment",
              title: "Quarterly plan",
              secret: "must-not-escape",
            },
          };
        },
        close: async () => { closeCount += 1; },
      };
    },
  });
  const callArgs = makeCallArgs(capability);
  const approvalToken = runtime.createApprovalToken(callArgs, { tokenId: "approval-token-runtime-0001" });
  const result = await callRuntime(runtime, { ...callArgs, approvalToken }, {
    markSideEffectDispatched: (actionDigest) => events.push({ type: "dispatch", actionDigest }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.cached, false);
  assert.equal(closeCount, 1);
  assert.deepEqual(events[0], { type: "connect", profileId: "slides-host", hasSignal: true });
  assert.deepEqual(events[1], { type: "dispatch", actionDigest: result.actionDigest });
  assert.deepEqual(events[2], {
    type: "call",
    name: "create_presentation",
    argumentsValue: {
      folder_id: "approved-folder",
      deck_title: ARTIFACT.title,
      markdown: ARTIFACT.content,
      content_type: ARTIFACT.contentType,
      request_id: callArgs.idempotencyKey,
    },
  });
  assert.deepEqual(result.receipt, {
    externalId: "deck-123",
    webUrl: "https://docs.example.com/decks/deck-123",
    title: "Quarterly plan",
    mimeType: "application/vnd.example.presentation",
    artifactKind: "slides",
    capabilityId: capability.capabilityId,
    capabilityRevision: capability.capabilityRevision,
    idempotencyKey: "deck-run-0001",
    digest: result.receipt.digest,
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("must-not-escape"), false);
  assert.equal(serialized.includes("access_token"), false);
  assert.match(result.receipt.digest, /^[0-9a-f]{64}$/);

  const cached = await callRuntime(runtime, { ...callArgs, approvalToken });
  assert.equal(cached.ok, true);
  assert.equal(cached.cached, true);
  assert.equal(events.filter((event) => event.type === "call").length, 1);
  assert.equal(events.filter((event) => event.type === "dispatch").length, 1, "cache replay must not report a new mutation dispatch");
  assert.equal(closeCount, 1);
});

test("schema drift blocks before approval consumption and closes the upstream session", async () => {
  const registry = makeRegistry();
  const capability = registry.capabilities[0];
  let liveSchema = { ...UPSTREAM_SCHEMA, required: [...UPSTREAM_SCHEMA.required, "new_required_field"] };
  let calls = 0;
  let closes = 0;
  const runtime = createExternalToolGatewayRuntime({
    registry,
    approvalSecret: SECRET,
    now: NOW,
    createSession: async () => ({
      listTools: async () => ({ tools: [{ name: "create_presentation", inputSchema: liveSchema }] }),
      callTool: async () => { calls += 1; return {}; },
      close: async () => { closes += 1; },
    }),
  });
  const callArgs = makeCallArgs(capability, { idempotencyKey: "deck-run-schema" });
  const approvalToken = runtime.createApprovalToken(callArgs, { tokenId: "approval-token-runtime-0002" });
  const drifted = await callRuntime(runtime, { ...callArgs, approvalToken });
  assert.equal(drifted.ok, false);
  assert.equal(drifted.error.code, "upstream_schema_changed");
  assert.equal(calls, 0);
  assert.equal(closes, 1);

  liveSchema = UPSTREAM_SCHEMA;
  const retried = await callRuntime(runtime, { ...callArgs, approvalToken });
  assert.equal(retried.ok, false, "the fake success lacks a receipt, proving approval passed after drift was fixed");
  assert.equal(retried.error.code, "invalid_upstream_receipt");
  assert.equal(calls, 1);
  assert.equal(closes, 2);
  const consumed = await callRuntime(runtime, { ...callArgs, approvalToken });
  assert.equal(consumed.error.code, "approval_consumed");
  assert.equal(calls, 1, "a consumed retry must not invoke the tool again");
  assert.equal(closes, 2, "a consumed retry must not reconnect");
});

test("invalid approvals fail before any external connection", async () => {
  const registry = makeRegistry();
  const capability = registry.capabilities[0];
  let calls = 0;
  let closes = 0;
  let connections = 0;
  const consumedTokenIds = new Set();
  const approvalReservations = new Set();
  const runtime = createExternalToolGatewayRuntime({
    registry,
    approvalSecret: SECRET,
    now: NOW,
    consumedTokenIds,
    approvalReservations,
    createSession: async () => { connections += 1; return ({
      listTools: async () => ({ tools: [{ name: "create_presentation", inputSchema: UPSTREAM_SCHEMA }] }),
      callTool: async () => { calls += 1; return {}; },
      close: async () => { closes += 1; },
    }); },
  });
  const callArgs = makeCallArgs(capability, { idempotencyKey: "deck-run-approval" });
  const absent = await callRuntime(runtime, callArgs);
  assert.equal(absent.ok, false);
  assert.equal(absent.error.code, "approval_required");
  assert.match(absent.actionDigest, /^[0-9a-f]{64}$/);
  assert.equal(calls, 0);

  const token = runtime.createApprovalToken(callArgs, { tokenId: "approval-token-runtime-0003" });
  const mismatch = await callRuntime(runtime, {
    ...callArgs,
    artifact: { ...ARTIFACT, title: "Changed after approval" },
    approvalToken: token,
  });
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error.code, "approval_digest_mismatch");
  const malformedToken = { ...runtime.createApprovalToken(callArgs, { tokenId: "approval-token-malformed-0001" }), tokenId: "short" };
  assert.equal((await callRuntime(runtime, { ...callArgs, approvalToken: malformedToken })).error.code, "approval_malformed");
  const invalidSignature = { ...runtime.createApprovalToken(callArgs, { tokenId: "approval-token-badsig-0001" }), signature: "0".repeat(64) };
  assert.equal((await callRuntime(runtime, { ...callArgs, approvalToken: invalidSignature })).error.code, "approval_invalid_signature");
  const consumedToken = runtime.createApprovalToken(callArgs, { tokenId: "approval-token-consumed-0001" });
  consumedTokenIds.add(consumedToken.tokenId);
  assert.equal((await callRuntime(runtime, { ...callArgs, approvalToken: consumedToken })).error.code, "approval_consumed");
  const reservedToken = runtime.createApprovalToken(callArgs, { tokenId: "approval-token-reserved-0001" });
  approvalReservations.add(reservedToken.tokenId);
  assert.equal((await callRuntime(runtime, { ...callArgs, approvalToken: reservedToken })).error.code, "approval_reserved");
  assert.equal(connections, 0);
  assert.equal(calls, 0);
  assert.equal(closes, 0);
});

test("an uncached mutation requires a host dispatch marker before any connection", async () => {
  const registry = makeRegistry();
  const capability = registry.capabilities[0];
  let connections = 0;
  const runtime = createExternalToolGatewayRuntime({
    registry,
    approvalSecret: SECRET,
    now: NOW,
    createSession: async () => { connections += 1; throw new Error("must not connect"); },
  });
  const callArgs = makeCallArgs(capability, { idempotencyKey: "deck-run-no-marker" });
  const approvalToken = runtime.createApprovalToken(callArgs, { tokenId: "approval-token-no-marker-0001" });
  const result = await runtime.call({ ...callArgs, approvalToken });
  assert.equal(result.error.code, "dispatch_marker_required");
  assert.equal(connections, 0);
});

test("approval reservation cleanup is not gated by synchronous or hanging session close", async () => {
  const registry = makeRegistry();
  const capability = registry.capabilities[0];
  const reservations = new Set();
  const driftedSchema = { ...UPSTREAM_SCHEMA, required: [...UPSTREAM_SCHEMA.required, "drifted"] };
  let closeStarted;
  let releaseClose;
  const started = new Promise((resolve) => { closeStarted = resolve; });
  const closeGate = new Promise((resolve) => { releaseClose = resolve; });
  let closeMode = "sync";
  const runtime = createExternalToolGatewayRuntime({
    registry,
    approvalSecret: SECRET,
    now: NOW,
    approvalReservations: reservations,
    createSession: async () => ({
      listTools: async () => ({ tools: [{ name: "create_presentation", inputSchema: driftedSchema }] }),
      callTool: async () => { throw new Error("must not mutate"); },
      close: () => { if (closeMode === "sync") return undefined; closeStarted(); return closeGate; },
    }),
  });
  const syncArgs = makeCallArgs(capability, { idempotencyKey: "deck-run-sync-close" });
  const syncToken = runtime.createApprovalToken(syncArgs, { tokenId: "approval-token-sync-close-0001" });
  assert.equal((await callRuntime(runtime, { ...syncArgs, approvalToken: syncToken })).error.code, "upstream_schema_changed");
  assert.equal(reservations.size, 0);

  closeMode = "hanging";
  const hangingArgs = makeCallArgs(capability, { idempotencyKey: "deck-run-hanging-close" });
  const hangingToken = runtime.createApprovalToken(hangingArgs, { tokenId: "approval-token-hanging-close-0001" });
  const pending = callRuntime(runtime, { ...hangingArgs, approvalToken: hangingToken });
  await started;
  assert.equal(reservations.size, 0, "reservation must release before transport close settles");
  releaseClose();
  assert.equal((await pending).error.code, "upstream_schema_changed");
});

test("consumed approval storage is host-validated, bounded, and expiry-evicted", async () => {
  const registry = makeRegistry();
  assert.throws(() => createExternalToolGatewayRuntime({ registry, consumedTokenIds: [] }), /consumed approval ledger bounds/);
  assert.throws(() => createExternalToolGatewayRuntime({ registry, consumedTokenExpiries: new Map([["orphan-token-id-0001", NOW + 1_000]]) }), /consumed approval ledger bounds/);
  assert.throws(() => createExternalToolGatewayRuntime({ registry, receiptCache: [] }), /host ledgers/);

  const capability = registry.capabilities[0];
  const consumedTokenIds = new Set();
  const consumedTokenExpiries = new Map();
  let clock = NOW;
  let connections = 0;
  let calls = 0;
  const runtime = createExternalToolGatewayRuntime({
    registry,
    approvalSecret: SECRET,
    now: () => clock,
    consumedTokenIds,
    consumedTokenExpiries,
    maxConsumedTokenIds: 1,
    createSession: async () => {
      connections += 1;
      return {
        listTools: async () => ({ tools: [{ name: "create_presentation", inputSchema: UPSTREAM_SCHEMA }] }),
        callTool: async () => { calls += 1; return { structuredContent: { id: `deck-${calls}`, url: `https://docs.example.com/decks/deck-${calls}` } }; },
        close: async () => undefined,
      };
    },
  });
  const firstArgs = makeCallArgs(capability, { idempotencyKey: "deck-run-ledger-one" });
  const firstToken = runtime.createApprovalToken(firstArgs, { tokenId: "approval-token-ledger-one-0001" });
  assert.equal((await callRuntime(runtime, { ...firstArgs, approvalToken: firstToken })).ok, true);
  assert.equal(consumedTokenIds.size, 1);
  assert.equal(consumedTokenExpiries.size, 1);

  const blockedArgs = makeCallArgs(capability, { idempotencyKey: "deck-run-ledger-two" });
  const blockedToken = runtime.createApprovalToken(blockedArgs, { tokenId: "approval-token-ledger-two-0001" });
  assert.equal((await callRuntime(runtime, { ...blockedArgs, approvalToken: blockedToken })).error.code, "approval_ledger_full");
  assert.equal(connections, 1, "full consumed ledger must block before another connection");

  clock += 15 * 60 * 1_000 + 1;
  const retriedToken = runtime.createApprovalToken(blockedArgs, { tokenId: "approval-token-ledger-two-0002" });
  assert.equal((await callRuntime(runtime, { ...blockedArgs, approvalToken: retriedToken })).ok, true);
  assert.equal(consumedTokenIds.has(firstToken.tokenId), false);
  assert.equal(consumedTokenExpiries.has(firstToken.tokenId), false);
  assert.equal(consumedTokenIds.size, 1);
  assert.equal(connections, 2);
  assert.equal(calls, 2);
});

test("one approval token permits only one concurrent pre-egress reservation", async () => {
  const registry = makeRegistry();
  const capability = registry.capabilities[0];
  let connections = 0;
  let calls = 0;
  let releaseCatalog;
  let catalogStarted;
  const catalogReady = new Promise((resolve) => { catalogStarted = resolve; });
  const catalogGate = new Promise((resolve) => { releaseCatalog = resolve; });
  const runtime = createExternalToolGatewayRuntime({
    registry,
    approvalSecret: SECRET,
    now: NOW,
    createSession: async () => {
      connections += 1;
      return {
        listTools: async () => { catalogStarted(); await catalogGate; return { tools: [{ name: "create_presentation", inputSchema: UPSTREAM_SCHEMA }] }; },
        callTool: async () => { calls += 1; return { structuredContent: { id: "deck-concurrent", url: "https://docs.example.com/decks/deck-concurrent" } }; },
        close: async () => undefined,
      };
    },
  });
  const callArgs = makeCallArgs(capability, { idempotencyKey: "deck-run-concurrent" });
  const approvalToken = runtime.createApprovalToken(callArgs, { tokenId: "approval-token-concurrent-0001" });
  const first = callRuntime(runtime, { ...callArgs, approvalToken });
  await catalogReady;
  const second = await callRuntime(runtime, { ...callArgs, approvalToken });
  assert.equal(second.error.code, "approval_reserved");
  assert.equal(connections, 1, "reserved replay must not create another session");
  releaseCatalog();
  assert.equal((await first).ok, true);
  assert.equal(calls, 1);
});

test("idempotency conflict and invalid workspace paths fail before external connection", async () => {
  const registry = makeRegistry();
  const capability = registry.capabilities[0];
  let connections = 0;
  const receiptCache = new Map([[
    `${capability.capabilityId}\u0000deck-run-conflict`,
    { actionDigest: "0".repeat(64), receipt: { existing: true } },
  ]]);
  const runtime = createExternalToolGatewayRuntime({
    registry,
    approvalSecret: SECRET,
    now: NOW,
    receiptCache,
    createSession: async () => { connections += 1; throw new Error("must not connect"); },
  });
  const conflictArgs = makeCallArgs(capability, { idempotencyKey: "deck-run-conflict" });
  const conflict = await callRuntime(runtime, conflictArgs);
  assert.equal(conflict.error.code, "idempotency_conflict");
  const invalidPath = await callRuntime(runtime, makeCallArgs(capability, {
    idempotencyKey: "deck-run-invalid-path",
    artifact: { ...ARTIFACT, workspacePath: "workspace:/agentic-graph/../secret.md" },
  }));
  assert.equal(invalidPath.error.code, "invalid_workspace_path");
  assert.equal(connections, 0);
});

test("receipt origin allowlist rejects an otherwise successful external mutation without leaking URL details", async () => {
  const registry = makeRegistry();
  const capability = registry.capabilities[0];
  const runtime = createExternalToolGatewayRuntime({
    registry,
    approvalSecret: SECRET,
    now: NOW,
    createSession: async () => ({
      listTools: async () => ({ tools: [{ name: "create_presentation", inputSchema: UPSTREAM_SCHEMA }] }),
      callTool: async () => ({ structuredContent: { id: "deck-evil", url: "https://evil.example/deck?secret=1" } }),
      close: async () => undefined,
    }),
  });
  const callArgs = makeCallArgs(capability, { idempotencyKey: "deck-run-origin" });
  const approvalToken = runtime.createApprovalToken(callArgs, { tokenId: "approval-token-runtime-0004" });
  const result = await callRuntime(runtime, { ...callArgs, approvalToken });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "invalid_upstream_receipt");
  assert.equal(JSON.stringify(result).includes("evil.example"), false);
});
