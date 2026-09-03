import assert from "node:assert/strict";
import { promises as fileSystem } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createWorld } from "../../ecs/index.js";
import { createEcsRuntime } from "../ecs-runtime.js";
import { AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";

async function withTempRoot(run) {
  const baseDirectory = await fileSystem.mkdtemp(path.join(tmpdir(), "agentic-graph-ecs-security-"));
  const rootDir = path.join(baseDirectory, "repo");
  await fileSystem.mkdir(rootDir);
  await fileSystem.writeFile(path.join(rootDir, "world.md"), "fixture", "utf8");
  try {
    await run({ baseDirectory, rootDir });
  } finally {
    await fileSystem.rm(baseDirectory, { force: true, recursive: true });
  }
}

const startArgs = Object.freeze({
  agenticOsPath: "world.md",
  scope: "#agentic-ecs",
  binding: "@source.frontmatter",
});

const sessionArgs = (sessionId) => ({
  sessionId,
  scope: "#agentic-ecs",
  binding: "@ecs-session",
});

const validEmptyAgenticOs = () => [
  "---", 'kgSchema: "agentic-os-computing-flow/v1"', "flow:",
  "  nodes: []", "  edges: []", "---", "",
].join("\n");

const boundFileSystem = (realpath) => ({
  open: (...args) => fileSystem.open(...args),
  realpath,
  rename: (...args) => fileSystem.rename(...args),
  stat: (...args) => fileSystem.stat(...args),
  unlink: (...args) => fileSystem.unlink(...args),
  writeFile: (...args) => fileSystem.writeFile(...args),
});

test("session start rejects a parent-directory swap between validation and open", async () => {
  await withTempRoot(async ({ baseDirectory, rootDir }) => {
    const safeDirectory = path.join(rootDir, "safe");
    const movedDirectory = path.join(rootDir, "safe-original");
    const outsideDirectory = path.join(baseDirectory, "outside");
    await fileSystem.mkdir(safeDirectory);
    await fileSystem.mkdir(outsideDirectory);
    await fileSystem.writeFile(path.join(safeDirectory, "world.md"), validEmptyAgenticOs(), "utf8");
    await fileSystem.writeFile(path.join(outsideDirectory, "world.md"), "OUTSIDE_SECRET", "utf8");
    const canonicalTarget = await fileSystem.realpath(path.join(safeDirectory, "world.md"));
    let swapped = false;
    const swappingFileSystem = boundFileSystem((value) => fileSystem.realpath(value));
    swappingFileSystem.open = async (...args) => {
      if (!swapped && path.resolve(args[0]) === canonicalTarget) {
        swapped = true;
        await fileSystem.rename(safeDirectory, movedDirectory);
        await fileSystem.symlink(outsideDirectory, safeDirectory);
      }
      return fileSystem.open(...args);
    };
    let hydrationCalls = 0;
    const runtime = createEcsRuntime({
      rootDir,
      fileSystem: swappingFileSystem,
      hydrateAgenticOsDocument: () => {
        hydrationCalls += 1;
        return { ok: true, world: {}, decisionIndex: new Map() };
      },
      disposeWorld: () => true,
    });
    const result = await runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart, {
      ...startArgs,
      agenticOsPath: "safe/world.md",
    });
    assert.equal(result.errorCode, "ECS_AGENTIC_OS_READ_FAILED");
    assert.equal(hydrationCalls, 0);
    assert.equal(JSON.stringify(result).includes("OUTSIDE_SECRET"), false);
  });
});

test("session start rechecks containment after a stat-time parent swap", async () => {
  await withTempRoot(async ({ baseDirectory, rootDir }) => {
    const safeDirectory = path.join(rootDir, "safe");
    const movedDirectory = path.join(rootDir, "safe-original");
    const outsideDirectory = path.join(baseDirectory, "outside");
    await fileSystem.mkdir(safeDirectory);
    await fileSystem.mkdir(outsideDirectory);
    await fileSystem.writeFile(path.join(safeDirectory, "world.md"), validEmptyAgenticOs(), "utf8");
    await fileSystem.writeFile(path.join(outsideDirectory, "world.md"), "OUTSIDE_SECRET", "utf8");
    const canonicalTarget = await fileSystem.realpath(path.join(safeDirectory, "world.md"));
    let swapped = false;
    const swappingFileSystem = boundFileSystem((value) => fileSystem.realpath(value));
    swappingFileSystem.stat = async (...args) => {
      if (!swapped && path.resolve(args[0]) === canonicalTarget) {
        swapped = true;
        await fileSystem.rename(safeDirectory, movedDirectory);
        await fileSystem.symlink(outsideDirectory, safeDirectory);
      }
      return fileSystem.stat(...args);
    };
    let hydrationCalls = 0;
    const runtime = createEcsRuntime({
      rootDir,
      fileSystem: swappingFileSystem,
      hydrateAgenticOsDocument: () => {
        hydrationCalls += 1;
        return { ok: true, world: {}, decisionIndex: new Map() };
      },
      disposeWorld: () => true,
    });
    const result = await runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart, {
      ...startArgs,
      agenticOsPath: "safe/world.md",
    });
    assert.equal(result.errorCode, "ECS_AGENTIC_OS_SYMLINK_ESCAPE");
    assert.equal(hydrationCalls, 0);
    assert.equal(JSON.stringify(result).includes("OUTSIDE_SECRET"), false);
  });
});

test("Decision persistence revalidates inside its serialized turn before writing", async () => {
  await withTempRoot(async ({ baseDirectory, rootDir }) => {
    const safeDirectory = path.join(rootDir, "safe");
    const movedDirectory = path.join(rootDir, "safe-original");
    const outsideDirectory = path.join(baseDirectory, "outside");
    const original = validEmptyAgenticOs();
    const outsideOriginal = `${validEmptyAgenticOs()}# outside\n`;
    await fileSystem.mkdir(safeDirectory);
    await fileSystem.mkdir(outsideDirectory);
    await fileSystem.writeFile(path.join(safeDirectory, "world.md"), original, "utf8");
    await fileSystem.writeFile(path.join(outsideDirectory, "world.md"), outsideOriginal, "utf8");
    const targetPath = await fileSystem.realpath(path.join(safeDirectory, "world.md"));
    let armed = false;
    let targetChecks = 0;
    const guardedFileSystem = boundFileSystem(async (value) => {
      if (armed && path.resolve(value) === targetPath) {
        targetChecks += 1;
        if (targetChecks === 2) {
          await fileSystem.rename(safeDirectory, movedDirectory);
          await fileSystem.symlink(outsideDirectory, safeDirectory);
        }
      }
      return fileSystem.realpath(value);
    });
    const runtime = createEcsRuntime({
      rootDir,
      fileSystem: guardedFileSystem,
      hydrateAgenticOsDocument: () => ({ ok: true, world: {}, decisionIndex: new Map() }),
      worldTick: async () => ({
        ok: true,
        decisions: [{
          decisionId: "decision-race-proof",
          decisionType: "world_tick_result",
          entityRef: "npc.guide",
          payload: { accepted: true },
          producedAt: "2026-07-20T00:00:00.000Z",
        }],
        deferred_decisions: [],
        cost_logs: [],
      }),
      disposeWorld: () => true,
    });
    const started = await runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart, {
      ...startArgs,
      agenticOsPath: "safe/world.md",
    });
    await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick,
      sessionArgs(started.sessionId),
    );
    armed = true;
    const result = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist,
      sessionArgs(started.sessionId),
    );
    assert.equal(result.errorCode, "ECS_AGENTIC_OS_PATH_OUTSIDE_ROOT");
    assert.equal(result.sessionRetained, true);
    assert.equal(await fileSystem.readFile(path.join(movedDirectory, "world.md"), "utf8"), original);
    assert.equal(await fileSystem.readFile(path.join(outsideDirectory, "world.md"), "utf8"), outsideOriginal);
  });
});

test("two sessions accept only trusted same-process replacement identities", async () => {
  await withTempRoot(async ({ rootDir }) => {
    await fileSystem.writeFile(path.join(rootDir, "world.md"), validEmptyAgenticOs(), "utf8");
    const runtime = createEcsRuntime({
      rootDir,
      hydrateAgenticOsDocument: () => ({ ok: true, world: {}, decisionIndex: new Map() }),
      worldTick: async (_world, input) => ({
        ok: true,
        decisions: [{
          decisionId: input.decisionId,
          decisionType: "world_tick_result",
          entityRef: "npc.guide",
          payload: { accepted: true },
          producedAt: "2026-07-20T00:00:00.000Z",
        }],
        deferred_decisions: [],
        cost_logs: [],
      }),
      disposeWorld: () => true,
    });
    const first = await runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart, startArgs);
    const second = await runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart, startArgs);
    await runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick, {
      ...sessionArgs(first.sessionId),
      input: { decisionId: "decision-first-session" },
    });
    await runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick, {
      ...sessionArgs(second.sessionId),
      input: { decisionId: "decision-second-session" },
    });
    const firstPersist = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist,
      sessionArgs(first.sessionId),
    );
    const secondPersist = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist,
      sessionArgs(second.sessionId),
    );
    assert.equal(firstPersist.ok, true);
    assert.equal(secondPersist.ok, true);
    const source = await fileSystem.readFile(path.join(rootDir, "world.md"), "utf8");
    assert.equal(source.match(/"decisionId":"decision-first-session"/g)?.length, 1);
    assert.equal(source.match(/"decisionId":"decision-second-session"/g)?.length, 1);
  });
});

test("MCP sanitizes executor metadata and System labels while retaining canonical usage", async () => {
  await withTempRoot(async ({ rootDir }) => {
    const sensitiveText = "SENSITIVE_EXECUTOR_DETAIL";
    const sensitiveCode = "ECS_API_KEY_SECRET";
    const usage = {
      model: "test/model", prompt_tokens: 2, completion_tokens: 1,
      cache_hits: 0, estimated_cost_usd: 0.001, incomplete: false,
    };
    const deferredWorld = createWorld({
      systems: [(context) => {
        context.requestReasoning({ decisionId: "deferred-one", prompt: sensitiveText });
        context.requestReasoning({ decisionId: "deferred-secret-code", prompt: sensitiveText });
      }],
      decisionExecutor: async (request) => {
        if (request.decisionId === "deferred-secret-code") {
          const error = new Error(sensitiveText);
          error.code = sensitiveCode;
          throw error;
        }
        return { decision: null, cost_logs: [{ ...usage, credential: sensitiveText }] };
      },
    });
    const deferredRuntime = createEcsRuntime({
      rootDir,
      hydrateAgenticOsDocument: () => ({ ok: true, world: deferredWorld, decisionIndex: new Map() }),
      disposeWorld: () => true,
    });
    const deferredSession = await deferredRuntime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart,
      startArgs,
    );
    const deferred = await deferredRuntime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick,
      sessionArgs(deferredSession.sessionId),
    );
    assert.deepEqual(deferred.cost_logs, [usage]);
    assert.deepEqual(deferred.deferred_decisions.map((item) => item.deferred_reason), [
      "ECS_INVALID_REASONING_RESULT", "executor_unavailable",
    ]);
    assert.equal(JSON.stringify(deferred).includes(sensitiveText), false);
    assert.equal(JSON.stringify(deferred).includes(sensitiveCode), false);

    const failingSystem = () => { throw new Error(sensitiveText); };
    Object.defineProperty(failingSystem, "name", { value: sensitiveText });
    const failingWorld = createWorld({ systems: [failingSystem] });
    const failingRuntime = createEcsRuntime({
      rootDir,
      hydrateAgenticOsDocument: () => ({ ok: true, world: failingWorld, decisionIndex: new Map() }),
      disposeWorld: () => true,
    });
    const failingSession = await failingRuntime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart,
      startArgs,
    );
    const failed = await failingRuntime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick,
      sessionArgs(failingSession.sessionId),
    );
    assert.equal(failed.message, "World_Tick failed");
    assert.equal(failed.failingSystemName, "system-0");
    assert.equal(JSON.stringify(failed).includes(sensitiveText), false);
  });
});

test("MCP rejects non-canonical Decision metadata without reflecting it", async () => {
  await withTempRoot(async ({ rootDir }) => {
    const sensitiveText = "DECISION_CREDENTIAL_SECRET";
    const runtime = createEcsRuntime({
      rootDir,
      hydrateAgenticOsDocument: () => ({ ok: true, world: {}, decisionIndex: new Map() }),
      worldTick: async () => ({
        ok: true,
        decisions: [{
          decisionId: "decision-extra-field",
          decisionType: "world_tick_result",
          entityRef: "npc.guide",
          payload: {},
          producedAt: "2026-07-20T00:00:00.000Z",
          credential: sensitiveText,
        }],
        deferred_decisions: [],
        cost_logs: [],
      }),
      disposeWorld: () => true,
    });
    const started = await runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart, startArgs);
    const result = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick,
      sessionArgs(started.sessionId),
    );
    assert.equal(result.errorCode, "ECS_INVALID_TICK_RESULT");
    assert.equal(result.tickCommitted, true);
    assert.equal(JSON.stringify(result).includes(sensitiveText), false);
  });
});

test("a post-rename disposal failure retries against the replacement file identity", async () => {
  await withTempRoot(async ({ rootDir }) => {
    await fileSystem.writeFile(path.join(rootDir, "world.md"), validEmptyAgenticOs(), "utf8");
    let disposalAttempts = 0;
    const runtime = createEcsRuntime({
      rootDir,
      hydrateAgenticOsDocument: () => ({ ok: true, world: {}, decisionIndex: new Map() }),
      worldTick: async () => ({
        ok: true,
        decisions: [{
          decisionId: "decision-disposal-retry",
          decisionType: "world_tick_result",
          entityRef: "npc.guide",
          payload: { committed: true },
          producedAt: "2026-07-20T00:00:00.000Z",
        }],
        deferred_decisions: [],
        cost_logs: [],
      }),
      disposeWorld: () => {
        disposalAttempts += 1;
        if (disposalAttempts === 1) throw new Error("injected disposal failure");
        return true;
      },
    });
    const started = await runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart, startArgs);
    await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick,
      sessionArgs(started.sessionId),
    );
    const committed = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist,
      sessionArgs(started.sessionId),
    );
    assert.equal(committed.errorCode, "ECS_SESSION_DISPOSE_FAILED");
    assert.equal(committed.sessionRetained, true);

    const retried = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist,
      sessionArgs(started.sessionId),
    );
    assert.equal(retried.ok, true);
    assert.equal(retried.persistedCount, 0);
    assert.equal(retried.idempotentCount, 1);
    assert.equal(retried.sessionClosed, true);
    const source = await fileSystem.readFile(path.join(rootDir, "world.md"), "utf8");
    assert.equal(source.match(/"decisionId":"decision-disposal-retry"/g)?.length, 1);
  });
});
