import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SERVER_PATH = path.resolve(REPO_ROOT, "mcp/server.js");

const createLocalMcpClient = () => {
  const client = new Client({
    name: "agentic-graph-annotation-stdio-e2e",
    version: "0.0.0",
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_PATH],
    cwd: REPO_ROOT,
    env: {
      PATH: String(process.env.PATH || ""),
      HOME: String(process.env.HOME || ""),
      NODE_ENV: "test",
      AGENTIC_OS_ROOT: REPO_ROOT,
      AGENTIC_OS_PYTHON: String(process.env.AGENTIC_OS_PYTHON || "python3"),
      AGENTIC_OS_MCP_TIMEOUT_MS: "600000",
    },
    stderr: "pipe",
  });
  let stderrText = "";
  transport.stderr?.on("data", (chunk) => {
    stderrText += String(chunk);
  });
  return { client, transport, readStderr: () => stderrText };
};

test("local stdio MCP lists and executes annotation tools end-to-end", async () => {
  const { client, transport, readStderr } = createLocalMcpClient();

  try {
    await client.connect(transport, { timeout: 10_000 });

    const listed = await client.listTools(undefined, { timeout: 10_000 });
    const imageTool = listed.tools.find((tool) => tool.name === AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.annotateImage);
    const videoTool = listed.tools.find((tool) => tool.name === AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.annotateVideoFrame);

    assert.ok(imageTool, `expected tools/list to include ${AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.annotateImage}, stderr=${JSON.stringify(readStderr())}`);
    assert.ok(videoTool, `expected tools/list to include ${AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.annotateVideoFrame}, stderr=${JSON.stringify(readStderr())}`);
    assert.equal(imageTool.outputSchema?.required?.includes("annotation_id"), true);
    assert.equal(videoTool.inputSchema?.required?.includes("frame_timestamp_ms"), true);

    const imageResult = await client.callTool({
      name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.annotateImage,
      arguments: {
        asset_url: "https://example.com/assets/city-square.png",
        tasks: ["caption", "object_detection"],
      },
    }, undefined, { timeout: 10_000 });

    assert.equal(imageResult.isError, false, `expected image annotation success, stderr=${JSON.stringify(readStderr())}`);
    assert.equal(imageResult.structuredContent?.ok, true);
    assert.equal(imageResult.structuredContent?.model_id, "heuristic-local");
    assert.match(String(imageResult.structuredContent?.tasks?.caption?.text || ""), /city square/i);

    const videoResult = await client.callTool({
      name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.annotateVideoFrame,
      arguments: {
        asset_url: "https://example.com/assets/replay.mp4",
        tasks: ["caption"],
        frame_timestamp_ms: 1200,
      },
    }, undefined, { timeout: 10_000 });

    assert.equal(videoResult.isError, false, `expected video-frame annotation success, stderr=${JSON.stringify(readStderr())}`);
    assert.equal(videoResult.structuredContent?.ok, true);
    assert.match(String(videoResult.structuredContent?.tasks?.caption?.text || ""), /1200ms/);

    const invalidResult = await client.callTool({
      name: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.annotateVideoFrame,
      arguments: {
        asset_url: "https://example.com/assets/replay.mp4",
        tasks: ["caption"],
      },
    }, undefined, { timeout: 10_000 });

    assert.equal(invalidResult.isError, true, `expected invalid payload failure, stderr=${JSON.stringify(readStderr())}`);
    assert.equal(invalidResult.structuredContent?.ok, false);
    assert.equal(invalidResult.structuredContent?.error?.code, "invalid_spec");
  } finally {
    await client.close().catch(() => undefined);
  }
});
