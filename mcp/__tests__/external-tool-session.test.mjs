import assert from "node:assert/strict";
import test from "node:test";

import { computeExternalToolSchemaDigest, loadExternalToolProfileRegistry } from "../external-tool-profile-registry.js";
import { assertExternalHttpRequestTarget, buildExternalToolTransport } from "../external-tool-session.js";

const INPUT_SCHEMA = Object.freeze({ type: "object", additionalProperties: false, required: ["content"], properties: { content: { type: "string" } } });

const tool = {
  name: "create_sheet",
  label: "Create sheet",
  artifactKind: "spreadsheet",
  upstreamInputSchemaDigest: computeExternalToolSchemaDigest(INPUT_SCHEMA),
  argumentMapping: { content: "content" },
  result: {
    urlPointer: "/structuredContent/url",
    allowedOrigins: ["https://sheets.example.com"],
  },
};

const loadProfile = (transport, env = {}) => loadExternalToolProfileRegistry({
  env: { NODE_ENV: "test", ...env },
  rawProfilesJson: JSON.stringify({ profiles: [{ id: "sheets-host", label: "Sheets Host", transport, tools: [tool] }] }),
}).profiles[0];

test("HTTP target validation permits only configured origin with public DNS", async () => {
  const profile = loadProfile({ type: "streamable-http", url: "https://mcp.example.com/mcp" });
  const lookupImpl = async () => [{ address: "93.184.216.34", family: 4 }];
  await assert.doesNotReject(() => assertExternalHttpRequestTarget({
    profile,
    url: new URL("https://mcp.example.com/mcp"),
    env: { NODE_ENV: "test" },
    lookupImpl,
  }));
  await assert.rejects(() => assertExternalHttpRequestTarget({
    profile,
    url: new URL("https://other.example.com/mcp"),
    env: { NODE_ENV: "test" },
    lookupImpl,
  }), /cross-origin/);
  await assert.rejects(() => assertExternalHttpRequestTarget({
    profile,
    url: new URL("https://mcp.example.com/mcp"),
    env: { NODE_ENV: "test" },
    lookupImpl: async () => [{ address: "10.0.0.5", family: 4 }],
  }), /private or invalid network address/);
  await assert.rejects(() => assertExternalHttpRequestTarget({
    profile,
    url: new URL("https://mcp.example.com/mcp"),
    env: { NODE_ENV: "test" },
    lookupImpl: async () => [{ address: "203.0.113.10", family: 4 }],
  }), /private or invalid network address/);
});

test("explicit development loopback bypass never applies in production", async () => {
  const profile = loadProfile({
    type: "streamable-http",
    url: "http://127.0.0.1:4317/mcp",
    developmentLoopback: true,
  });
  await assert.doesNotReject(() => assertExternalHttpRequestTarget({
    profile,
    url: new URL("http://127.0.0.1:4317/mcp"),
    env: { NODE_ENV: "test" },
  }));
  await assert.rejects(() => assertExternalHttpRequestTarget({
    profile,
    url: new URL("http://127.0.0.1:4317/mcp"),
    env: { NODE_ENV: "production" },
  }), /requires HTTPS/);
});

test("transport construction resolves host-managed env refs and fails closed when missing", () => {
  const httpProfile = loadProfile({
    type: "streamable-http",
    url: "https://mcp.example.com/mcp",
    headersFromEnv: { Authorization: "SHEETS_AUTHORIZATION" },
  });
  assert.throws(
    () => buildExternalToolTransport(httpProfile, { env: { NODE_ENV: "test" } }),
    /requires host environment variable SHEETS_AUTHORIZATION/,
  );
  assert.doesNotThrow(() => buildExternalToolTransport(httpProfile, {
    env: { NODE_ENV: "test", SHEETS_AUTHORIZATION: "Bearer host-secret" },
    fetchImpl: async () => { throw new Error("not called during construction"); },
  }));

  const sseProfile = loadProfile({
    type: "sse",
    url: "https://mcp.example.com/sse",
    headersFromEnv: { Authorization: "SHEETS_AUTHORIZATION" },
  });
  assert.throws(
    () => buildExternalToolTransport(sseProfile, { env: { NODE_ENV: "test" } }),
    /requires host environment variable SHEETS_AUTHORIZATION/,
  );
  assert.doesNotThrow(() => buildExternalToolTransport(sseProfile, {
    env: { NODE_ENV: "test", SHEETS_AUTHORIZATION: "Bearer host-secret" },
    fetchImpl: async () => { throw new Error("not called during construction"); },
  }));

  const stdioProfile = loadProfile({
    type: "stdio",
    command: "/usr/bin/node",
    args: ["/opt/approved/sheets.mjs"],
    envFrom: { SHEETS_TOKEN: "SHEETS_TOKEN_SOURCE" },
  });
  assert.throws(
    () => buildExternalToolTransport(stdioProfile, { env: { NODE_ENV: "test" } }),
    /requires host environment variable SHEETS_TOKEN_SOURCE/,
  );
});
