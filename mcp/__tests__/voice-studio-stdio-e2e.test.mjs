import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { VOICE_STUDIO_REQUEST_SCHEMA_VERSION } from "../../contracts/voice-studio.schema.js";
import { AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const sha = "c".repeat(64);
test("local stdio MCP lists voice studio, replays dry-run, and blocks unconfigured live execution", async () => {
  const client = new Client({ name: "agenticgraph-voice-studio-e2e", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "mcp", "server.js")],
    cwd: repoRoot,
    env: {
      PATH: String(process.env.PATH || ""),
      HOME: String(process.env.HOME || ""),
      NODE_ENV: "test",
      AGENTICGRAPH_ROOT: repoRoot,
      AGENTICGRAPH_PYTHON: String(process.env.AGENTICGRAPH_PYTHON || "python3"),
    },
    stderr: "pipe",
  });
  let stderrText = "";
  transport.stderr?.on("data", (chunk) => { stderrText += String(chunk); });
  const input = {
    schemaVersion: VOICE_STUDIO_REQUEST_SCHEMA_VERSION,
    operation: "clone",
    mode: "dry-run",
    requestId: "stdio-clone-request",
    idempotencyKey: "stdio-voice-clone-0001",
    approvalReceiptId: "approval-stdio-clone",
    costPolicy: { currency: "USD", maxActualCostUsd: 0, maxProviderCalls: 0, maxNetworkCalls: 0 },
    limits: { maxDurationMs: 300_000, maxBytes: 100_000_000, maxTextCharacters: 20_000, timeoutMs: 120_000 },
    sourceAudio: { artifactId: "audio-sample-1", sha256: sha, mediaType: "audio/webm", bytes: 1024, durationMs: 20_000 },
    speakerAuthorization: {
      consentReceiptId: "consent-owner-0001",
      rightsReceiptId: "rights-owner-0001",
      permittedUses: ["private studio creation"],
      disclosureRequired: true,
      retentionPolicy: "session-only",
    },
    profileIntent: { profileId: "profile-owner", displayName: "Owner voice" },
  };

  try {
    await client.connect(transport, { timeout: 10_000 });
    const listed = await client.listTools(undefined, { timeout: 10_000 });
    const tool = listed.tools.find((entry) => entry.name === AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.voiceStudio);
    assert.ok(tool, `missing voice studio tool; stderr=${stderrText}`);
    assert.equal(tool.inputSchema?.oneOf?.length, 3);
    assert.equal(tool.outputSchema?.required?.includes("proof"), true);

    const first = await client.callTool({
      name: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.voiceStudio,
      arguments: input,
    }, undefined, { timeout: 10_000 });
    const replay = await client.callTool({
      name: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.voiceStudio,
      arguments: structuredClone(input),
    }, undefined, { timeout: 10_000 });
    assert.equal(first.isError, false, stderrText);
    assert.equal(first.structuredContent?.result?.verification, "manifest-only");
    assert.equal(first.structuredContent?.proof?.networkCalls, 0);
    assert.equal(first.structuredContent?.proof?.repositoryWrites, 0);
    assert.equal(first.structuredContent?.cost?.actualCostUsd, 0);
    assert.equal(replay.structuredContent?.cached, true);
    assert.deepEqual(
      { ...replay.structuredContent, cached: false },
      first.structuredContent,
    );

    const live = await client.callTool({
      name: AGENTICGRAPH_LOCAL_MCP_TOOL_NAMES.voiceStudio,
      arguments: {
        ...input,
        mode: "live",
        requestId: "stdio-live-request",
        idempotencyKey: "stdio-voice-live-0001",
      },
    }, undefined, { timeout: 10_000 });
    assert.equal(live.isError, true);
    assert.equal(live.structuredContent?.error?.code, "approval_verifier_unavailable");
    assert.equal(live.structuredContent?.proof?.externalCallAttempted, false);
  } finally {
    await client.close().catch(() => undefined);
  }
});
