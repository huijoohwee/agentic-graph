import assert from "node:assert/strict";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { createExternalToolApprovalToken } from "../external-tool-approval.js";
import { createExternalToolGatewayRuntime } from "../external-tool-gateway-runtime.js";
import { EXTERNAL_MCP_PROFILES_ENV, computeExternalToolSchemaDigest, loadExternalToolProfileRegistry } from "../external-tool-profile-registry.js";

const SECRET = "test-only-external-mcp-approval-secret-32chars";
const FIXTURE_HOST_ENV = Object.freeze({ NODE_ENV: "test", TMPDIR: tmpdir() });
const fixturePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/external-slides-mcp-server.mjs");
const FIXTURE_SLIDES_INPUT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["title", "markdown", "request_id"],
  properties: {
    title: { type: "string", minLength: 1 },
    markdown: { type: "string", minLength: 1 },
    request_id: { type: "string", minLength: 8 },
  },
});
const FIXTURE_PROFILE = Object.freeze({
  id: "fixture-slides",
  label: "Fixture Slides",
  transport: {
    type: "stdio",
    command: process.execPath,
    args: [fixturePath],
    cwd: path.resolve(path.dirname(fixturePath), "../../.."),
    envFrom: { TMPDIR: "TMPDIR" },
    timeoutMs: 5_000,
  },
  tools: [
    {
      name: "create_fixture_deck",
      label: "Create fixture deck",
      artifactKind: "slides",
      upstreamInputSchemaDigest: computeExternalToolSchemaDigest(FIXTURE_SLIDES_INPUT_SCHEMA),
      argumentMapping: { title: "title", content: "markdown" },
      idempotencyArgumentName: "request_id",
      result: {
        idPointer: "/structuredContent/id",
        urlPointer: "/structuredContent/url",
        titlePointer: "/structuredContent/title",
        mimeType: "application/vnd.example.presentation",
        allowedOrigins: ["https://docs.example.com"],
      },
    },
    {
      name: "create_fixture_sheet",
      label: "Create fixture sheet",
      artifactKind: "spreadsheet",
      upstreamInputSchemaDigest: computeExternalToolSchemaDigest(FIXTURE_SLIDES_INPUT_SCHEMA),
      argumentMapping: { title: "title", content: "markdown" },
      idempotencyArgumentName: "request_id",
      result: {
        idPointer: "/structuredContent/id",
        urlPointer: "/structuredContent/url",
        titlePointer: "/structuredContent/title",
        mimeType: "application/vnd.example.spreadsheet",
        allowedOrigins: ["https://docs.example.com"],
      },
    },
  ],
});
const FIXTURE_PROFILES_JSON = JSON.stringify({ profiles: [FIXTURE_PROFILE] });
const fixtureOutputPath = (requestId, suffix) =>
  path.join(tmpdir(), "agentic-graph-external-mcp-fixture", `${requestId}.${suffix}`);

const buildFixtureCallArgs = (capability, idempotencyKey) => ({
  capabilityId: capability.capabilityId,
  capabilityRevision: capability.capabilityRevision,
  artifact: {
    title: "Fixture deck",
    content: "# First\n\n---\n\n# Second",
    contentType: "text/markdown",
  },
  idempotencyKey,
});

test("gateway invokes an exact host-approved stdio Slides MCP and returns only a sanitized receipt", async () => {
  const registry = loadExternalToolProfileRegistry({
    env: FIXTURE_HOST_ENV,
    rawProfilesJson: FIXTURE_PROFILES_JSON,
  });
  const capability = registry.capabilities[0];
  const runtime = createExternalToolGatewayRuntime({ registry, approvalSecret: SECRET, env: FIXTURE_HOST_ENV, now: 1_800_000_000_000 });
  const callArgs = buildFixtureCallArgs(capability, "fixture-deck-0001");
  const approvalToken = runtime.createApprovalToken(callArgs, { tokenId: "fixture-approval-token-0001" });
  const outputPath = fixtureOutputPath("fixture-deck-0001", "slides.md");
  try {
    const result = await runtime.call({ ...callArgs, approvalToken }, { markSideEffectDispatched: () => {} });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.cached, false);
    assert.equal(result.receipt.externalId, "fixture-deck-0001");
    assert.equal(result.receipt.webUrl, "https://docs.example.com/decks/fixture-deck-0001");
    assert.equal(JSON.stringify(result).includes("fixture_secret"), false);
    assert.equal(await readFile(outputPath, "utf8"), callArgs.artifact.content);
  } finally {
    await unlink(outputPath).catch(() => undefined);
  }
});

test("gateway invokes an exact host-approved stdio Sheets MCP and creates the external file", async () => {
  const registry = loadExternalToolProfileRegistry({
    env: FIXTURE_HOST_ENV,
    rawProfilesJson: FIXTURE_PROFILES_JSON,
  });
  const capability = registry.capabilities.find(entry => entry.artifactKind === "spreadsheet");
  assert.ok(capability);
  const runtime = createExternalToolGatewayRuntime({ registry, approvalSecret: SECRET, env: FIXTURE_HOST_ENV, now: 1_800_000_000_000 });
  const callArgs = {
    ...buildFixtureCallArgs(capability, "fixture-sheet-0003"),
    artifact: {
      title: "Fixture sheet",
      content: "| Month | Revenue |\n| --- | ---: |\n| Jan | 100 |",
      contentType: "text/markdown",
    },
  };
  const approvalToken = runtime.createApprovalToken(callArgs, { tokenId: "fixture-approval-token-sheet-0003" });
  const outputPath = fixtureOutputPath("fixture-sheet-0003", "sheet.md");
  try {
    const result = await runtime.call({ ...callArgs, approvalToken }, { markSideEffectDispatched: () => {} });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.receipt.webUrl, "https://docs.example.com/sheets/fixture-sheet-0003");
    assert.equal(await readFile(outputPath, "utf8"), callArgs.artifact.content);
  } finally {
    await unlink(outputPath).catch(() => undefined);
  }
});

test("local agentic-graph stdio server dispatches tool.call through the approved external stdio profile", async () => {
  const repoRoot = path.resolve(path.dirname(fixturePath), "../../..");
  const registry = loadExternalToolProfileRegistry({ env: { NODE_ENV: "test" }, rawProfilesJson: FIXTURE_PROFILES_JSON });
  const capability = registry.capabilities[0];
  const callArgs = buildFixtureCallArgs(capability, "fixture-deck-server-0002");
  const approvalToken = createExternalToolApprovalToken({
    ...callArgs,
    secret: SECRET,
    now: Date.now(),
    tokenId: "fixture-approval-token-server-0002",
  });
  const client = new Client({ name: "external-gateway-server-dispatch-test", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "mcp/server.js")],
    cwd: repoRoot,
    env: {
      PATH: String(process.env.PATH || ""),
      HOME: String(process.env.HOME || ""),
      TMPDIR: String(process.env.TMPDIR || tmpdir()),
      NODE_ENV: "test",
      AGENTIC_OS_ROOT: repoRoot,
      [EXTERNAL_MCP_PROFILES_ENV]: FIXTURE_PROFILES_JSON,
      AGENTIC_OS_EXTERNAL_MCP_APPROVAL_SECRET: SECRET,
    },
    stderr: "pipe",
  });
  try {
    await client.connect(transport, { timeout: 10_000, maxTotalTimeout: 10_000 });
    const result = await client.callTool({
      name: "agentic-graph.tool.call",
      arguments: { ...callArgs, approvalToken },
    }, undefined, { timeout: 10_000, maxTotalTimeout: 10_000 });
    assert.equal(result.isError, false, JSON.stringify(result));
    assert.equal(result.structuredContent?.ok, true);
    assert.equal(result.structuredContent?.receipt?.externalId, "fixture-deck-server-0002");
    assert.equal(result.structuredContent?.receipt?.webUrl, "https://docs.example.com/decks/fixture-deck-server-0002");
  } finally {
    await client.close().catch(() => undefined);
    await unlink(fixtureOutputPath("fixture-deck-server-0002", "slides.md")).catch(() => undefined);
  }
});
