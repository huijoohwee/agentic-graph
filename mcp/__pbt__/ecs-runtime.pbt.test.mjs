import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import fc from "fast-check";

import { createEcsRuntime, resolveSafeKgcMarkdownPath } from "../ecs-runtime.js";
import { AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";

const check = (property) => fc.assert(property, { numRuns: 100 });
const invalidToken = fc.string({ minLength: 1, maxLength: 30 }).map((value) => `invalid-${value}`);

const invalidInvocation = fc.oneof(
  invalidToken.map((scope) => ({
    toolName: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart,
    args: { kgcPath: "unused.md", scope, binding: "@source.frontmatter" },
  })),
  invalidToken.map((binding) => ({
    toolName: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick,
    args: { sessionId: "unused", scope: "#agentic-ecs", binding },
  })),
  fc.jsonValue().map((decisions) => ({
    toolName: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist,
    args: { sessionId: "unused", scope: "#agentic-ecs", binding: "@ecs-session", decisions },
  })),
  fc.oneof(fc.integer(), fc.string(), fc.array(fc.jsonValue()), fc.constant(null)).map((args) => ({
    toolName: AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick,
    args,
  })),
);

test("Feature: agentic-graph-agentic-ecs, Property 24: invalid ECS invocations are structured and mutation-free", async () => {
  let hydrationCalls = 0;
  let tickCalls = 0;
  let persistenceCalls = 0;
  const runtime = createEcsRuntime({
    rootDir: process.cwd(),
    hydrateKgcDocument: () => {
      hydrationCalls += 1;
      return { ok: true, world: {}, decisionIndex: new Map() };
    },
    worldTick: async () => {
      tickCalls += 1;
      return { ok: true, decisions: [], deferred_decisions: [], cost_logs: [] };
    },
    persistDecisions: async () => {
      persistenceCalls += 1;
      return { ok: true, persistedCount: 0, idempotentCount: 0 };
    },
    disposeWorld: () => true,
  });

  await check(fc.asyncProperty(invalidInvocation, async ({ toolName, args }) => {
    const before = [hydrationCalls, tickCalls, persistenceCalls];
    const result = await runtime.run(toolName, args);
    assert.equal(result.ok, false);
    assert.equal(typeof result.errorCode, "string");
    assert.ok(result.errorCode.length > 0);
    assert.equal(typeof result.message, "string");
    assert.equal(result.execution_boundary, "dev-only");
    assert.deepEqual([hydrationCalls, tickCalls, persistenceCalls], before);
  }));
});

test("Feature: agentic-graph-agentic-ecs, Property 24: traversal-shaped Markdown paths never escape the root", async () => {
  const safeSegment = fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-_"), {
    minLength: 1,
    maxLength: 20,
  });
  await check(fc.asyncProperty(
    fc.array(safeSegment, { minLength: 1, maxLength: 5 }),
    async (segments) => {
      const kgcPath = path.join("..", ...segments, "world.md");
      const result = await resolveSafeKgcMarkdownPath(kgcPath, { rootDir: process.cwd() });
      assert.equal(result.ok, false);
      assert.equal(result.errorCode, "ECS_KGC_PATH_OUTSIDE_ROOT");
      assert.equal(result.execution_boundary, "dev-only");
    },
  ));
});
