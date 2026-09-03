import { test } from "node:test";
import assert from "node:assert/strict";

import { handleAnnotateImageTool, handleAnnotateVideoFrameTool } from "../annotation-runtime.js";
import { buildAgenticGraphLocalMcpToolDefinitions, AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";

test("local MCP descriptors expose annotation tools as local idempotent processes", () => {
  const definitions = buildAgenticGraphLocalMcpToolDefinitions();
  const imageTool = definitions.find((tool) => tool.name === AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.annotateImage);
  const videoTool = definitions.find((tool) => tool.name === AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.annotateVideoFrame);

  assert.ok(imageTool, "agentic-graph.annotate.image descriptor must exist");
  assert.ok(videoTool, "agentic-graph.annotate.video_frame descriptor must exist");
  assert.equal(imageTool.annotations.idempotentHint, true);
  assert.equal(videoTool.annotations.idempotentHint, true);
  assert.equal(videoTool.inputSchema.required.includes("frame_timestamp_ms"), true);
});

test("handleAnnotateImageTool returns deterministic heuristic annotation output", async () => {
  const first = await handleAnnotateImageTool({
    asset_url: "https://example.com/assets/city-square.png",
    tasks: ["caption", "object_detection"],
  });
  const second = await handleAnnotateImageTool({
    asset_url: "https://example.com/assets/city-square.png",
    tasks: ["object_detection", "caption"],
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.annotation_id, second.annotation_id);
  assert.equal(first.model_id, "heuristic-local");
  assert.match(first.tasks.caption.text, /city square/i);
  assert.equal(Array.isArray(first.tasks.object_detection.objects), true);
});

test("handleAnnotateVideoFrameTool validates model hints and frame timestamps", async () => {
  const invalidModel = await handleAnnotateVideoFrameTool({
    asset_url: "https://example.com/video.mp4",
    tasks: ["caption"],
    frame_timestamp_ms: 1200,
    model_hint: "unknown-model",
  });
  const valid = await handleAnnotateVideoFrameTool({
    asset_url: "https://example.com/video.mp4",
    tasks: ["caption"],
    frame_timestamp_ms: 1200,
  });

  assert.equal(invalidModel.ok, false);
  assert.equal(invalidModel.error.code, "model_not_configured");
  assert.equal(valid.ok, true);
  assert.match(valid.tasks.caption.text, /1200ms/);
});
