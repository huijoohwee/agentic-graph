import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildAgenticGraphLocalMcpToolDefinitions, AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";
import { addMemoryLayerMemory, extractProceduralMemory, materializeUserModel } from "../memory-layer-runtime.js";

async function tempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-memory-layer-"));
}

test("extractProceduralMemory writes a reusable AGENTIC_OS document and scoped memory summary", async () => {
  const rootDir = await tempRoot();
  const outputDir = path.join(rootDir, "data/outputs/run-a");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "state.json"), JSON.stringify({
    run: {
      run_id: "run-a",
      provider_mode: "mock",
      termination_reason: "acceptance_criteria_passed",
    },
    goal: {
      intent: "Create a storyboard summary",
    },
    plan: [
      { task_id: "inspect_goal", label: "Inspect Goal", agent_id: "planner", tool_name: "workspace.inspect", depends_on: [] },
      { task_id: "research_goal", label: "Research Goal", agent_id: "researcher", tool_name: "research.scout", depends_on: ["inspect_goal"] },
      { task_id: "compose_canvas", label: "Compose Canvas", agent_id: "creator", tool_name: "canvas.write", depends_on: ["research_goal"] },
    ],
    completed_task_ids: ["inspect_goal", "research_goal", "compose_canvas"],
    steps: [
      { task_id: "inspect_goal", status: "completed", tool_name: "workspace.inspect", attempt: 1 },
      { task_id: "research_goal", status: "completed", tool_name: "research.scout", attempt: 1 },
      { task_id: "compose_canvas", status: "completed", tool_name: "canvas.write", attempt: 1 },
    ],
  }, null, 2), "utf8");
  await fs.writeFile(path.join(outputDir, "goal.json"), JSON.stringify({
    run_id: "run-a",
    raw_goal: "Create a storyboard summary",
    goal: { intent: "Create a storyboard summary" },
  }, null, 2), "utf8");

  const result = await extractProceduralMemory({
    output_dir: "data/outputs/run-a",
    app_id: "agentic-graph-test",
  }, { rootDir });

  assert.equal(result.source_run_id, "run-a");
  assert.equal(result.task_count, 3);
  assert.equal(result.cost_log.operation, "extract_procedural");
  assert.match(result.document_path, /^data\/memory-layer\/procedural\/.+\.md$/);

  const documentPath = path.join(rootDir, result.document_path);
  const documentMarkdown = await fs.readFile(documentPath, "utf8");
  assert.equal(documentMarkdown, result.document_markdown);
  assert.ok(documentMarkdown.includes('schema: "agentic-os-computing-flow/v1"'));
  assert.ok(documentMarkdown.includes('"canvas:runAction"'));
  assert.ok(documentMarkdown.includes("task_inspect_goal"));
  assert.ok(documentMarkdown.includes("task_research_goal"));
  assert.ok(documentMarkdown.includes("task_compose_canvas"));
  assert.ok(documentMarkdown.includes("harness.replay.step"));

  const memoryStore = JSON.parse(await fs.readFile(path.join(rootDir, "data/memory-layer/local-memory-store.json"), "utf8"));
  assert.equal(memoryStore.memories.length, 1);
  assert.equal(memoryStore.memories[0].scope.app_id, "agentic-graph-test");
  assert.equal(memoryStore.memories[0].metadata.memory_kind, "procedural_agenticOs");
  assert.equal(memoryStore.memories[0].metadata.document_path, result.document_path);
  assert.equal(result.memory_write.results[0].event, "ADD");
});

test("local MCP descriptor exposes procedural memory extraction as a mutating process tool", () => {
  const definitions = buildAgenticGraphLocalMcpToolDefinitions();
  const descriptor = definitions.find((tool) => tool.name === AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.memoryExtractProcedural);

  assert.ok(descriptor, "procedural extractor descriptor must exist");
  assert.equal(descriptor.annotations.readOnlyHint, false);
  assert.equal(descriptor.annotations.idempotentHint, false);
  assert.deepEqual(descriptor.inputSchema.required, ["output_dir"]);
  assert.ok(descriptor.outputSchema.required.includes("document_markdown"));
  assert.ok(descriptor.outputSchema.required.includes("task_count"));
});

test("materializeUserModel writes deterministic USER_MODEL markdown from scoped memory", async () => {
  const rootDir = await tempRoot();
  await addMemoryLayerMemory({
    app_id: "agentic-graph-test",
    user_id: "founder",
    text: "Prefers concise action-oriented updates and source-owned markdown artifacts.",
    metadata: {
      memory_key: "preference:communication",
      categories: ["preference", "communication"],
    },
  }, { rootDir });
  await addMemoryLayerMemory({
    app_id: "agentic-graph-test",
    user_id: "founder",
    text: "Procedural memory for extracting harness runs into reusable AGENTIC_OS markdown.",
    metadata: {
      memory_key: "procedural:extract",
      memory_kind: "procedural_agenticOs",
      document_path: "data/memory-layer/procedural/extract-harness.md",
      categories: ["procedural", "agenticOs"],
    },
  }, { rootDir });
  await addMemoryLayerMemory({
    app_id: "agentic-graph-test",
    user_id: "founder",
    text: "Currently focusing on startup-priority MCP onboarding and memory SSOT.",
    metadata: {
      categories: ["context", "roadmap"],
    },
  }, { rootDir });

  const result = await materializeUserModel({
    app_id: "agentic-graph-test",
    user_id: "founder",
    max_memories: 10,
  }, { rootDir });

  assert.equal(result.memory_count, 3);
  assert.equal(result.cost_log.operation, "materialize_user_model");
  assert.match(result.document_path, /^data\/memory-layer\/user-models\/.+\.md$/);
  assert.match(result.workspace_document_path, /^\/chat-log\/user-models\/.+\.md$/);
  assert.deepEqual(result.scope, { app_id: "agentic-graph-test", user_id: "founder" });
  assert.ok(result.categories.includes("communication"));
  assert.ok(result.categories.includes("procedural"));

  const documentMarkdown = await fs.readFile(path.join(rootDir, result.document_path), "utf8");
  assert.equal(documentMarkdown, result.document_markdown);
  const workspaceMarkdown = await fs.readFile(path.join(rootDir, result.workspace_document_path.replace(/^\/+/, "")), "utf8");
  assert.equal(workspaceMarkdown, result.document_markdown);
  assert.ok(documentMarkdown.includes('schema: "agentic-os-user-model/v1"'));
  assert.ok(documentMarkdown.includes("## Preferences"));
  assert.ok(documentMarkdown.includes("## Active Context"));
  assert.ok(documentMarkdown.includes("## Procedural Memory"));
  assert.ok(documentMarkdown.includes("source-owned markdown artifacts"));
  assert.ok(documentMarkdown.includes("data/memory-layer/procedural/extract-harness.md"));
});

test("local MCP descriptor exposes user-model materialization as a mutating process tool", () => {
  const definitions = buildAgenticGraphLocalMcpToolDefinitions();
  const descriptor = definitions.find((tool) => tool.name === AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.memoryMaterializeUserModel);

  assert.ok(descriptor, "user-model materializer descriptor must exist");
  assert.equal(descriptor.annotations.readOnlyHint, false);
  assert.equal(descriptor.annotations.idempotentHint, false);
  assert.ok(!("required" in descriptor.inputSchema) || descriptor.inputSchema.required === undefined);
  assert.ok(descriptor.outputSchema.required.includes("document_markdown"));
  assert.ok(descriptor.outputSchema.required.includes("workspace_document_path"));
  assert.ok(descriptor.outputSchema.required.includes("memory_count"));
});
