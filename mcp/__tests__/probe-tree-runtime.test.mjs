import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildAgenticGraphLocalMcpToolDefinitions, AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";
import {
  evolveProbeTree,
  generateProbeOptions,
  parseProbeMarkdown,
  selectProbeOption,
} from "../probe-tree-runtime.js";
import { buildProbeModelPrompt } from "../probe-tree-model-adapter.js";

async function tempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-probe-tree-"));
}

test("probe.generate recalls scoped exemplars and does not mutate the markdown graph store", async () => {
  const rootDir = await tempRoot();
  const storeDir = path.join(rootDir, "data/probe-tree");
  await fs.mkdir(storeDir, { recursive: true });
  await fs.writeFile(path.join(storeDir, "sentinel.txt"), "before", "utf8");
  await fs.mkdir(path.join(rootDir, "data/memory-layer"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "data/memory-layer/local-memory-store.json"), JSON.stringify({
    version: "agentic-graph-memory-store/v0.1",
    updated_at: "2026-07-07T00:00:00.000Z",
    memories: [{
      id: "mem-1",
      memory: "Probe exemplar for onboarding: What information is still missing?",
      scope: { app_id: "agentic-graph-probe-tree" },
      categories: ["probe-tree"],
      metadata: { recommended_question: "What information is still missing?" },
      created_at: "2026-07-07T00:00:00.000Z",
      updated_at: "2026-07-07T00:00:00.000Z",
    }],
  }, null, 2), "utf8");

  const result = await generateProbeOptions({
    thread_root_id: "onboarding",
    current_node_id: "root",
    context_text: "Compare onboarding across identity proof, account owner, required documents, and completion status.",
    k: 2,
  }, { rootDir, env: {} });

  assert.equal(result.ok, false);
  assert.equal(result.options.length, 0);
  assert.equal(result.options.some((option) => option.text === "What information is still missing?"), false);
  assert.equal(result.recalled_exemplars.length, 1);
  assert.equal(result.token_budget.within_budget, true);
  assert.equal(result.degraded, true);
  assert.equal(result.stateGraph.checkpointer, "markdown-graph-store");
  assert.equal(result.response.structuredContent.widgets.length, 1);
  assert.equal(result.response.structuredContent.widgets[0].id, "root");
  assert.equal(result.degraded_reason, "insufficient_user_input_context");
  assert.equal(result.response.structuredContent.cards.length, 0);
  assert.equal(result.response.structuredContent.panels[0].label, "Probe-Tree Branches");
  assert.equal(await fs.readFile(path.join(storeDir, "sentinel.txt"), "utf8"), "before");
});

test("probe.generate honors explicit zero recall against a seeded memory store", async () => {
  const rootDir = await tempRoot();
  await fs.mkdir(path.join(rootDir, "data/memory-layer"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "data/memory-layer/local-memory-store.json"), JSON.stringify({
    version: "agentic-graph-memory-store/v0.1",
    updated_at: "2026-07-07T00:00:00.000Z",
    memories: [{
      id: "mem-1",
      memory: "Probe exemplar for procurement: Which legal approver signs off the exception?",
      scope: { app_id: "agentic-graph-probe-tree" },
      categories: ["probe-tree"],
      metadata: { recommended_question: "Which legal approver signs off the exception?" },
      created_at: "2026-07-07T00:00:00.000Z",
      updated_at: "2026-07-07T00:00:00.000Z",
    }],
  }, null, 2), "utf8");

  const result = await generateProbeOptions({
    thread_root_id: "procurement",
    current_node_id: "root",
    context_text: "Compare procurement exceptions across contract owner, risk owner, legal review, and expiry date.",
    k: 2,
    recall_top_k: 0,
  }, { rootDir, env: {} });

  assert.equal(result.ok, false);
  assert.equal(result.degraded_reason, "insufficient_user_input_context");
  assert.equal(result.recalled_exemplars.length, 0);
  assert.equal(result.token_budget.recalled_exemplar_count, 0);
  assert.equal(result.options.some((option) => option.text === "Which legal approver signs off the exception?"), false);
});

test("probe.generate refuses generic wrappers when no model is configured", async () => {
  const rootDir = await tempRoot();
  const contextText = "/agentic-graph.probe-tree invest in China, India, SE Asia?";
  const result = await generateProbeOptions({
    thread_root_id: "investment-comparison",
    current_node_id: "root",
    context_text: contextText,
    k: 3,
    recall_top_k: 0,
  }, { rootDir, env: {} });

  assert.equal(result.ok, false);
  assert.equal(result.degraded, true);
  assert.equal(result.degraded_reason, "insufficient_user_input_context");
  assert.equal(result.options.length, 0);
  assert.equal(result.response.structuredContent.cards.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /which relationship between|compare current evidence|resolve the dependency|choose the decision order/i);
});

test("probe.generate does not echo literal authored alternatives without a model", async () => {
  const rootDir = await tempRoot();
  const contextText = "/agentic-graph.probe-tree recommend invest in India, China, or SE Asia";
  const result = await generateProbeOptions({
    thread_root_id: "investment-comparison",
    current_node_id: "root",
    context_text: contextText,
    k: 3,
    recall_top_k: 0,
  }, { rootDir, env: {} });

  assert.equal(result.ok, false);
  assert.equal(result.degraded, true);
  assert.equal(result.degraded_reason, "insufficient_user_input_context");
  assert.equal(result.options.length, 0);
  assert.equal(result.response.structuredContent.cards.length, 0);
  assert.equal(result.cost_log.model, "none");
  assert.equal(result.cost_log.estimated_cost_usd, 0);
  assert.doesNotMatch(JSON.stringify(result.response.structuredContent.cards), /recommend invest|which relationship between|scope choice|priority choice|compare current evidence|resolve the dependency|choose the decision order/i);
});

test("probe model prompt keeps selected child input primary and ancestors lineage-only", () => {
  const prompt = buildProbeModelPrompt({
    contextText: [
      "Authored request:",
      "1. SE Asia logistics",
      "Selected continuation question: Which region and workflow should guide the next branch?",
      "Selected continuation answer: 1. SE Asia logistics",
      "Probe lineage context: probe-root: question=Assess the global logistics root.",
    ].join("\n"),
    recalledExemplars: [],
    k: 3,
  });

  assert.match(prompt, /Current selected child input: SE Asia logistics/);
  assert.match(prompt, /Preceding probe context \(lineage only\): Which region and workflow should guide the next branch\?/);
  assert.match(prompt, /probe-root: question=Assess the global logistics root/);
  assert.match(prompt, /suggested clarification answer/);
  assert.match(prompt, /Never split the selected focus/);
  assert.match(prompt, /Never pair copied nouns inside canned relationship\/evidence\/dependency\/decision-order questions/);
  assert.match(prompt, /return \{"options":\[\]\}/);
});

test("probe.generate enforces token budget before local model invocation", async () => {
  const rootDir = await tempRoot();
  await fs.mkdir(path.join(rootDir, "data/memory-layer"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "data/memory-layer/local-memory-store.json"), JSON.stringify({
    version: "agentic-graph-memory-store/v0.1",
    updated_at: "2026-07-07T00:00:00.000Z",
    memories: [{
      id: "mem-1",
      memory: "Probe exemplar ".repeat(200),
      scope: { app_id: "agentic-graph-probe-tree" },
      categories: ["probe-tree"],
      metadata: { recommended_question: "What information is still missing?" },
      created_at: "2026-07-07T00:00:00.000Z",
      updated_at: "2026-07-07T00:00:00.000Z",
    }],
  }, null, 2), "utf8");
  let called = false;

  const result = await generateProbeOptions({
    thread_root_id: "budgeted",
    current_node_id: "root",
    context_text: "x".repeat(2000),
    k: 4,
    token_budget: 10,
  }, {
    rootDir,
    env: { AGENTIC_OS_PROBE_TREE_MODEL: "qwen-local" },
    fetchImpl: async () => {
      called = true;
      throw new Error("unexpected model call");
    },
  });

  assert.equal(called, false);
  assert.equal(result.degraded, true);
  assert.equal(result.degraded_reason, "token_budget_ceiling");
  assert.equal(result.token_budget.within_budget, false);
  assert.equal(result.recalled_exemplars.length, 0);
});

test("probe.generate uses host-owned Ollama adapter when configured and keeps cost local-zero", async () => {
  const rootDir = await tempRoot();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return {
      ok: true,
      async json() {
        return {
          model: "qwen-local",
          message: {
            content: JSON.stringify({
              options: [
                {
                  text: "Which care-plan coaching language should guide the next branch?",
                  rationale: "Uses only the requested care-plan coaching scope.",
                  evidenceNeeded: "User selection",
                  selectionOptions: [
                    "Prioritize English-first coaching with Mandarin support",
                    "Prioritize Mandarin-first coaching with English support",
                  ],
                  contextAnchors: ["care-plan coaching", "English", "Mandarin"],
                },
                {
                  text: "Which caregiver or member summary should guide the next branch?",
                  rationale: "Uses only the requested summary scope.",
                  evidenceNeeded: "User selection",
                  selectionOptions: [
                    "Prioritize a concise caregiver action summary",
                    "Prioritize a concise member self-management summary",
                  ],
                  contextAnchors: ["caregiver summary", "member summary"],
                },
              ],
            }),
          },
          prompt_eval_count: 42,
          eval_count: 24,
        };
      },
    };
  };

  const result = await generateProbeOptions({
    thread_root_id: "care-agent",
    current_node_id: "root",
    context_text: "Choose care-plan coaching across English, Mandarin, caregiver summary, and member summary.",
    k: 2,
    recall_top_k: 0,
  }, {
    rootDir,
    env: {
      AGENTIC_OS_PROBE_TREE_MODEL: "qwen-local",
      AGENTIC_OS_PROBE_TREE_MODEL_URL: "http://127.0.0.1:11434",
    },
    fetchImpl,
  });

  assert.equal(result.ok, true);
  assert.equal(result.degraded, false);
  assert.equal(result.model_adapter.configured, true);
  assert.equal(result.options[0].text, "Which care-plan coaching language should guide the next branch?");
  assert.equal(result.cost_log.model, "qwen-local");
  assert.equal(result.cost_log.prompt_tokens, 42);
  assert.equal(result.cost_log.completion_tokens, 24);
  assert.equal(result.cost_log.estimated_cost_usd, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.stream, false);
  assert.equal(calls[0].body.format.type, "object");
});

test("probe.select persists a child node with branches-to edge and leaves parent markdown unchanged", async () => {
  const rootDir = await tempRoot();
  const parentPath = path.join(rootDir, "data/probe-tree/threads/thread-a/nodes/root.md");
  await fs.mkdir(path.dirname(parentPath), { recursive: true });
  await fs.writeFile(parentPath, "---\nid: \"root\"\n---\n\n# Root\n", "utf8");
  const beforeParent = await fs.readFile(parentPath, "utf8");

  const result = await selectProbeOption({
    thread_root_id: "thread-a",
    parent_node_id: "root",
    chosen_option: { id: "o1", text: "What outcome would make this resolved?", rationale: "terminal condition" },
  }, { rootDir });

  assert.equal(result.ok, true);
  assert.equal(result.parent_unchanged, true);
  assert.equal(result.cost_log.estimated_cost_usd, 0);
  assert.match(result.node_path, /^data\/probe-tree\/threads\/thread-a\/nodes\/probe_node_/);
  assert.equal(await fs.readFile(parentPath, "utf8"), beforeParent);

  const written = await fs.readFile(path.join(rootDir, result.node_path), "utf8");
  const parsed = parseProbeMarkdown(written);
  assert.equal(parsed.frontmatter.type, "probe");
  assert.equal(parsed.frontmatter.edge.type, "branches-to");
  assert.equal(parsed.frontmatter.edge.source, "root");
  assert.equal(parsed.frontmatter.edge.target, result.new_node_id);
  assert.equal(parsed.frontmatter.checkpoint.forked_from_node_id, "root");
});

test("probe markdown parser preserves semantic hyphen and dot frontmatter keys", () => {
  const parsed = parseProbeMarkdown([
    "---",
    "semantic-key: \"enabled\"",
    "kg.schema: \"agentic-os-computing-flow/v1\"",
    "flow: {\"nodes\":[],\"edges\":[]}",
    "---",
    "",
    "# Probe Node",
  ].join("\n"));

  assert.equal(parsed.frontmatter["semantic-key"], "enabled");
  assert.equal(parsed.frontmatter["kg.schema"], "agentic-os-computing-flow/v1");
  assert.deepEqual(parsed.frontmatter.flow, { nodes: [], edges: [] });
});

test("probe.evolve scores resolved path and writes a reusable memory exemplar", async () => {
  const rootDir = await tempRoot();
  const rootPath = path.join(rootDir, "data/probe-tree/threads/thread-b/nodes/root.md");
  await fs.mkdir(path.dirname(rootPath), { recursive: true });
  await fs.writeFile(rootPath, "---\nid: \"root\"\nstatus: \"active\"\nscore: 0\n---\n\n# Root\n", "utf8");
  const first = await selectProbeOption({
    thread_root_id: "thread-b",
    parent_node_id: "root",
    chosen_option: { id: "o1", text: "Which constraint matters most right now?", rationale: "narrowing" },
  }, { rootDir });
  const second = await selectProbeOption({
    thread_root_id: "thread-b",
    parent_node_id: first.new_node_id,
    chosen_option: { id: "o2", text: "What information is still missing?", rationale: "gap" },
    terminal: true,
  }, { rootDir });

  const result = await evolveProbeTree({
    thread_root_id: "thread-b",
    terminal_node_id: second.new_node_id,
    rating: 1,
  }, { rootDir });

  assert.equal(result.ok, true);
  assert.equal(result.updated_scores.length, 3);
  assert.equal(result.complete_path_scored, true);
  assert.ok(result.updated_scores.every((entry) => entry.score > 0));
  assert.match(result.exemplar_id, /^kgmem_/);
  assert.equal(result.cost_log.estimated_cost_usd, 0);

  const evolved = parseProbeMarkdown(await fs.readFile(path.join(rootDir, second.node_path), "utf8"));
  assert.equal(evolved.frontmatter.status, "resolved");
  assert.ok(evolved.frontmatter.score > 0);

  const memoryStore = JSON.parse(await fs.readFile(path.join(rootDir, "data/memory-layer/local-memory-store.json"), "utf8"));
  assert.equal(memoryStore.memories.length, 1);
  assert.equal(memoryStore.memories[0].metadata.terminal_node_id, second.new_node_id);
});

test("probe-tree clean-room smoke completes generate-select-evolve with observable local-zero economics", async () => {
  const rootDir = await tempRoot();
  const rootPath = path.join(rootDir, "data/probe-tree/threads/thread-smoke/nodes/root.md");
  await fs.mkdir(path.dirname(rootPath), { recursive: true });
  await fs.writeFile(rootPath, "---\nid: \"root\"\nstatus: \"active\"\nscore: 0\n---\n\n# Root\n", "utf8");

  const generated = await generateProbeOptions({
    thread_root_id: "thread-smoke",
    current_node_id: "root",
    context_text: "Compare clean-room readiness across runtime trace, source evidence, completion status, and unresolved gap.",
    k: 2,
    recall_top_k: 0,
    token_budget: 1200,
  }, {
    rootDir,
    env: {
      AGENTIC_OS_PROBE_TREE_MODEL: "qwen-local",
      AGENTIC_OS_PROBE_TREE_MODEL_URL: "http://127.0.0.1:11434",
    },
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          model: "qwen-local",
          message: {
            content: JSON.stringify({
              options: [
                {
                  text: "Which clean-room completion status should the readiness review use?",
                  rationale: "Clarifies the requested clean-room readiness decision.",
                  evidenceNeeded: "User-selected completion status.",
                  selectionOptions: ["current clean-room readiness status", "target clean-room readiness status"],
                  contextAnchors: ["clean-room readiness", "completion status"],
                },
                {
                  text: "Which unresolved clean-room gap should the readiness review prioritize?",
                  rationale: "Clarifies the requested unresolved clean-room gap.",
                  evidenceNeeded: "User-selected unresolved gap.",
                  selectionOptions: ["unresolved runtime trace gap", "unresolved source evidence gap"],
                  contextAnchors: ["runtime trace", "source evidence", "unresolved gap"],
                },
              ],
            }),
          },
          prompt_eval_count: 24,
          eval_count: 18,
        };
      },
    }),
  });
  const selected = await selectProbeOption({
    thread_root_id: "thread-smoke",
    parent_node_id: "root",
    chosen_option: generated.options[0],
    terminal: true,
  }, { rootDir });
  const evolved = await evolveProbeTree({
    thread_root_id: "thread-smoke",
    terminal_node_id: selected.new_node_id,
    rating: 1,
  }, { rootDir });

  assert.equal(generated.ok, true);
  assert.equal(generated.token_budget.within_budget, true);
  assert.equal(generated.recalled_exemplars.length, 0);
  assert.equal(generated.cost_log.estimated_cost_usd, 0);
  assert.equal(selected.cost_log.estimated_cost_usd, 0);
  assert.equal(evolved.cost_log.estimated_cost_usd, 0);
  assert.equal(evolved.complete_path_scored, true);
  assert.deepEqual(evolved.path_node_ids, ["root", selected.new_node_id]);
});

test("probe.evolve rejects incomplete parent checkpoints unless explicitly partial", async () => {
  const rootDir = await tempRoot();
  const selected = await selectProbeOption({
    thread_root_id: "thread-c",
    parent_node_id: "missing-root",
    chosen_option: { id: "o1", text: "What information is still missing?", rationale: "gap" },
    terminal: true,
  }, { rootDir });

  await assert.rejects(
    () => evolveProbeTree({
      thread_root_id: "thread-c",
      terminal_node_id: selected.new_node_id,
    }, { rootDir }),
    /missing parent node\(s\): missing-root/,
  );

  const partial = await evolveProbeTree({
    thread_root_id: "thread-c",
    terminal_node_id: selected.new_node_id,
    allow_partial_path: true,
  }, { rootDir });
  assert.equal(partial.complete_path_scored, false);
  assert.deepEqual(partial.unscored_parent_node_ids, ["missing-root"]);
});

test("local MCP descriptors expose the probe-tree tools with mutation annotations", () => {
  const tools = buildAgenticGraphLocalMcpToolDefinitions();
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  assert.equal(byName.get(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.probeGenerate).annotations.readOnlyHint, true);
  assert.equal(byName.get(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.probeSelect).annotations.idempotentHint, false);
  assert.equal(byName.get(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.probeEvolve).annotations.idempotentHint, false);
  assert.equal(byName.get(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.probeGenerate).inputSchema.properties.k.minimum, 2);
  assert.ok(byName.get(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.probeGenerate).outputSchema.required.includes("response"));
  assert.ok(byName.get(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.probeSelect).outputSchema.required.includes("cost_log"));
  assert.ok(byName.get(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.probeEvolve).outputSchema.required.includes("cost_log"));
  assert.equal(byName.get(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.probeEvolve).inputSchema.required[0], "thread_root_id");
});
