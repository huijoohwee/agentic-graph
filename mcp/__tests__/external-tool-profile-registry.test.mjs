import assert from "node:assert/strict";
import test from "node:test";

import {
  EXTERNAL_MCP_PROFILES_ENV,
  ExternalToolProfileConfigError,
  buildExternalToolCapabilityId,
  computeExternalToolSchemaDigest,
  loadExternalToolProfileRegistry,
} from "../external-tool-profile-registry.js";

const UPSTREAM_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["deck_title", "markdown", "content_type", "folder_id", "request_id"],
  properties: {
    deck_title: { type: "string" },
    markdown: { type: "string" },
    content_type: { type: "string" },
    folder_id: { type: "string" },
    request_id: { type: "string" },
  },
});

const buildProfile = (overrides = {}) => ({
  id: "slides-host",
  label: "Slides Host",
  enabled: true,
  transport: {
    type: "streamable-http",
    url: "https://mcp.example.com/mcp",
    headersFromEnv: { Authorization: "SLIDES_MCP_AUTHORIZATION" },
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
  ...overrides,
});

const load = (profiles) => loadExternalToolProfileRegistry({
  env: {
    NODE_ENV: "test",
    SLIDES_MCP_AUTHORIZATION: "Bearer host-secret",
    [EXTERNAL_MCP_PROFILES_ENV]: JSON.stringify({ profiles }),
  },
});

test("host profile registry creates opaque capabilities without public transport or tool identity", () => {
  const registry = load([buildProfile()]);
  assert.equal(registry.profiles.length, 1);
  assert.equal(registry.capabilities.length, 1);
  const capability = registry.capabilities[0];
  assert.equal(capability.capabilityId, buildExternalToolCapabilityId("slides-host", "create_presentation"));
  assert.match(capability.capabilityId, /^agenticOsap_[0-9a-f]{32}$/);
  assert.match(capability.capabilityRevision, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(capability.public).sort(), [
    "approvalRequired",
    "artifactKind",
    "capabilityId",
    "capabilityRevision",
    "description",
    "label",
    "profileLabel",
    "transportType",
  ]);
  const serializedPublic = JSON.stringify(capability.public);
  for (const forbidden of ["mcp.example.com", "create_presentation", "Authorization", "SLIDES_MCP_AUTHORIZATION", "approved-folder"]) {
    assert.equal(serializedPublic.includes(forbidden), false, `public capability leaked ${forbidden}`);
  }
});

test("disabled profiles and tools are absent from the active capability catalog", () => {
  const disabledProfile = buildProfile({ id: "disabled-profile", enabled: false });
  const disabledToolProfile = buildProfile({
    id: "disabled-tool",
    tools: [{ ...buildProfile().tools[0], enabled: false }],
  });
  const registry = load([disabledProfile, disabledToolProfile]);
  assert.equal(registry.capabilities.length, 0);
});

test("profile registry accepts absolute stdio with env references but rejects caller-like command indirection", () => {
  const stdioProfile = buildProfile({
    id: "stdio-slides",
    transport: {
      type: "stdio",
      command: "/usr/bin/node",
      args: ["/opt/approved/slides-server.mjs"],
      cwd: "/opt/approved",
      envFrom: { SLIDES_TOKEN: "SLIDES_MCP_TOKEN" },
      timeoutMs: 5_000,
    },
  });
  const registry = loadExternalToolProfileRegistry({
    env: {
      NODE_ENV: "test",
      SLIDES_MCP_TOKEN: "host-secret",
      [EXTERNAL_MCP_PROFILES_ENV]: JSON.stringify({ profiles: [stdioProfile] }),
    },
  });
  assert.equal(registry.capabilities[0].transportType, "stdio");

  assert.throws(
    () => load([{ ...stdioProfile, transport: { ...stdioProfile.transport, command: "node" } }]),
    (error) => error instanceof ExternalToolProfileConfigError && /absolute host-approved path/.test(error.message),
  );
});

test("profile registry accepts SSE transport without leaking endpoint or headers publicly", () => {
  const registry = load([buildProfile({
    id: "sse-slides",
    transport: {
      type: "sse",
      url: "https://mcp.example.com/sse",
      headersFromEnv: { Authorization: "SLIDES_MCP_AUTHORIZATION" },
      timeoutMs: 12_000,
    },
  })]);
  const capability = registry.capabilities[0];
  assert.equal(capability.transportType, "sse");
  assert.equal(capability.public.transportType, "sse");
  assert.equal(JSON.stringify(capability.public).includes("mcp.example.com"), false);
  assert.equal(JSON.stringify(capability.public).includes("Authorization"), false);
});

test("profile registry rejects unsafe endpoints, secret-like arguments, and mapping collisions", () => {
  assert.throws(
    () => load([buildProfile({ transport: { type: "streamable-http", url: "http://10.0.0.3/mcp" } })]),
    /must use HTTPS/,
  );
  assert.throws(
    () => load([buildProfile({ transport: { type: "streamable-http", url: "https://user:pass@mcp.example.com/mcp" } })]),
    /credentials/,
  );
  assert.throws(
    () => load([buildProfile({
      tools: [{ ...buildProfile().tools[0], argumentMapping: { content: "api_key" } }],
    })]),
    /forbidden upstream argument name/,
  );
  assert.throws(
    () => load([buildProfile({
      tools: [{ ...buildProfile().tools[0], constantArguments: { markdown: "collision" } }],
    })]),
    /collides with mapped argument/,
  );
});

test("loopback HTTP profiles require an explicit non-production development exception", () => {
  const loopbackProfile = buildProfile({
    transport: {
      type: "streamable-http",
      url: "http://127.0.0.1:4317/mcp",
      developmentLoopback: true,
    },
  });
  assert.equal(load([loopbackProfile]).capabilities.length, 1);
  assert.throws(
    () => loadExternalToolProfileRegistry({
      env: {
        NODE_ENV: "production",
        [EXTERNAL_MCP_PROFILES_ENV]: JSON.stringify({ profiles: [loopbackProfile] }),
      },
    }),
    /requires developmentLoopback outside production/,
  );
});

export { UPSTREAM_SCHEMA, buildProfile };
