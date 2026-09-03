import assert from "node:assert/strict";
import { promises as fileSystem } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { allocateEntity, createWorld, registerComponent } from "../../ecs/index.js";
import { snapshotWorld } from "../../ecs/world.js";
import { createEcsRuntime, resolveSafeKgcMarkdownPath } from "../ecs-runtime.js";
import { createEcsSessionStore } from "../ecs-session-store.js";
import { AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";

async function withTempRoot(run) {
  const baseDirectory = await fileSystem.mkdtemp(path.join(tmpdir(), "agentic-graph-ecs-runtime-"));
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
  kgcPath: "world.md",
  scope: "#agentic-ecs",
  binding: "@source.frontmatter",
});

const sessionArgs = (sessionId) => ({
  sessionId,
  scope: "#agentic-ecs",
  binding: "@ecs-session",
});

const completedDecision = (
  decisionId = "decision-security-proof",
  payload = { accepted: true },
) => ({
  decisionId,
  decisionType: "world_tick_result",
  entityRef: "npc.guide",
  payload,
  producedAt: "2026-07-20T00:00:00.000Z",
});

const validEmptyKgc = () => [
  "---",
  'kgSchema: "kgc-computing-flow/v1"',
  "flow:",
  "  nodes: []",
  "  edges: []",
  "---",
  "",
].join("\n");

test("safe KGC path resolution rejects absolute, traversal, non-Markdown, missing, and symlink-escape paths", async () => {
  await withTempRoot(async ({ baseDirectory, rootDir }) => {
    const outsidePath = path.join(baseDirectory, "outside.md");
    await fileSystem.writeFile(outsidePath, "outside", "utf8");
    await fileSystem.symlink(outsidePath, path.join(rootDir, "escape.md"));
    await fileSystem.writeFile(path.join(rootDir, "not-markdown.txt"), "not markdown", "utf8");
    await fileSystem.symlink("not-markdown.txt", path.join(rootDir, "markdown-alias.md"));
    await fileSystem.mkdir(path.join(rootDir, "directory.md"));

    const valid = await resolveSafeKgcMarkdownPath("world.md", { rootDir });
    assert.equal(valid.ok, true);
    assert.equal(valid.relativePath, "world.md");
    assert.equal(valid.execution_boundary, "dev-only");

    const cases = [
      [outsidePath, "ECS_ABSOLUTE_KGC_PATH_FORBIDDEN"],
      ["../outside.md", "ECS_KGC_PATH_OUTSIDE_ROOT"],
      ["world.txt", "ECS_KGC_MARKDOWN_REQUIRED"],
      ["markdown-alias.md", "ECS_KGC_MARKDOWN_REQUIRED"],
      ["directory.md", "ECS_KGC_FILE_REQUIRED"],
      ["missing.md", "ECS_KGC_PATH_UNREADABLE"],
      ["escape.md", "ECS_KGC_SYMLINK_ESCAPE"],
    ];
    for (const [kgcPath, errorCode] of cases) {
      const result = await resolveSafeKgcMarkdownPath(kgcPath, { rootDir });
      assert.equal(result.ok, false, kgcPath);
      assert.equal(result.errorCode, errorCode, kgcPath);
      assert.equal(result.execution_boundary, "dev-only");
      assert.equal(result.message.includes(baseDirectory), false, kgcPath);
      assert.equal(result.message.includes(outsidePath), false, kgcPath);
    }
  });
});

test("failed Hydration leaves the private session store empty", async () => {
  await withTempRoot(async ({ rootDir }) => {
    const sessionStore = createEcsSessionStore();
    let disposalCalls = 0;
    const runtime = createEcsRuntime({
      rootDir,
      sessionStore,
      hydrateKgcDocument: () => ({
        ok: false,
        errorCode: "ECS_KGC_INVALID_ENTITY",
        message: "injected Hydration failure",
      }),
      disposeWorld: () => {
        disposalCalls += 1;
        return true;
      },
    });

    const result = await runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart, startArgs);
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "ECS_KGC_INVALID_ENTITY");
    assert.equal(sessionStore.size(), 0);
    assert.equal(disposalCalls, 0);
  });
});

test("Hydration and persistence errors never expose KGC source bytes", async () => {
  await withTempRoot(async ({ rootDir }) => {
    const sourceSecret = "TOP_SECRET_KGC_VALUE";
    await fileSystem.writeFile(
      path.join(rootDir, "world.md"),
      `---\nflow: [\nsecret: ${sourceSecret}\n---\n`,
      "utf8",
    );
    const hydrationRuntime = createEcsRuntime({ rootDir });
    const hydrationFailure = await hydrationRuntime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart,
      startArgs,
    );
    assert.equal(hydrationFailure.ok, false);
    assert.equal(hydrationFailure.errorCode, "ECS_KGC_INVALID_YAML");
    assert.equal(JSON.stringify(hydrationFailure).includes(sourceSecret), false);

    await fileSystem.writeFile(path.join(rootDir, "world.md"), "fixture", "utf8");
    const persistenceRuntime = createEcsRuntime({
      rootDir,
      hydrateKgcDocument: () => ({ ok: true, world: {}, decisionIndex: new Map() }),
      worldTick: async () => ({
        ok: true,
        decisions: [completedDecision()],
        deferred_decisions: [],
        cost_logs: [],
      }),
      disposeWorld: () => true,
    });
    const started = await persistenceRuntime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart,
      startArgs,
    );
    await persistenceRuntime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick,
      sessionArgs(started.sessionId),
    );
    await fileSystem.writeFile(
      path.join(rootDir, "world.md"),
      `---\nflow: [\nsecret: ${sourceSecret}\n---\n`,
      "utf8",
    );
    const persistenceFailure = await persistenceRuntime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist,
      sessionArgs(started.sessionId),
    );
    assert.equal(persistenceFailure.ok, false);
    assert.equal(persistenceFailure.errorCode, "ECS_KGC_INVALID_YAML");
    assert.equal(persistenceFailure.sessionRetained, true);
    assert.equal(JSON.stringify(persistenceFailure).includes(sourceSecret), false);
  });
});

test("Decision persistence stays bound to the start-time canonical path and repository root", async () => {
  await withTempRoot(async ({ baseDirectory, rootDir }) => {
    const outsidePath = path.join(baseDirectory, "outside.md");
    const alternatePath = path.join(rootDir, "alternate.md");
    const outsideOriginal = validEmptyKgc();
    const alternateOriginal = `${validEmptyKgc()}# alternate\n`;
    await fileSystem.writeFile(outsidePath, outsideOriginal, "utf8");
    await fileSystem.writeFile(alternatePath, alternateOriginal, "utf8");
    const runtime = createEcsRuntime({
      rootDir,
      hydrateKgcDocument: () => ({ ok: true, world: {}, decisionIndex: new Map() }),
      worldTick: async () => ({
        ok: true,
        decisions: [completedDecision("decision-path-proof")],
        deferred_decisions: [],
        cost_logs: [],
      }),
      disposeWorld: () => true,
    });
    const started = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart,
      startArgs,
    );
    await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick,
      sessionArgs(started.sessionId),
    );

    const sessionPath = path.join(rootDir, "world.md");
    await fileSystem.unlink(sessionPath);
    await fileSystem.symlink(outsidePath, sessionPath);
    const outsideFailure = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist,
      sessionArgs(started.sessionId),
    );
    assert.equal(outsideFailure.ok, false);
    assert.equal(outsideFailure.errorCode, "ECS_KGC_PATH_OUTSIDE_ROOT");
    assert.equal(outsideFailure.sessionRetained, true);
    assert.equal(await fileSystem.readFile(outsidePath, "utf8"), outsideOriginal);

    await fileSystem.unlink(sessionPath);
    await fileSystem.symlink(alternatePath, sessionPath);
    const changedFailure = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist,
      sessionArgs(started.sessionId),
    );
    assert.equal(changedFailure.ok, false);
    assert.equal(changedFailure.errorCode, "ECS_KGC_PATH_CHANGED");
    assert.equal(changedFailure.sessionRetained, true);
    assert.equal(await fileSystem.readFile(alternatePath, "utf8"), alternateOriginal);
  });
});

test("invalid scope, binding, and caller-authored Decisions fail before runtime mutation", async () => {
  await withTempRoot(async ({ rootDir }) => {
    let hydrationCalls = 0;
    let tickCalls = 0;
    let persistenceCalls = 0;
    const runtime = createEcsRuntime({
      rootDir,
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

    const unknownScope = await runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart, {
      ...startArgs,
      scope: "#other",
    });
    assert.equal(unknownScope.errorCode, "ECS_UNKNOWN_SCOPE");

    const unknownBinding = await runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart, {
      ...startArgs,
      binding: "@other",
    });
    assert.equal(unknownBinding.errorCode, "ECS_UNKNOWN_BINDING");

    const authoredDecisions = await runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist, {
      ...sessionArgs("not-read"),
      decisions: [],
    });
    assert.equal(authoredDecisions.errorCode, "ECS_INVALID_ARGUMENTS");
    assert.equal(hydrationCalls, 0);
    assert.equal(tickCalls, 0);
    assert.equal(persistenceCalls, 0);
  });
});

test("session lifecycle retains only completed tick Decisions, retains write failures, and disposes after complete persistence", async () => {
  await withTempRoot(async ({ rootDir }) => {
    const world = { name: "fixture-world" };
    const canonicalKgcPath = await fileSystem.realpath(path.join(rootDir, "world.md"));
    const completedDecision = {
      decisionId: "decision-1",
      decisionType: "world_tick_result",
      entityRef: "npc.guide",
      payload: { moved: true },
      producedAt: "2026-07-20T00:00:00.000Z",
    };
    const deferredDecision = {
      decisionId: "deferred-1",
      status: "deferred",
      deferred_reason: "executor_unavailable",
    };
    const disposedWorlds = [];
    const persistedBatches = [];
    let persistenceAttempts = 0;
    const runtime = createEcsRuntime({
      rootDir,
      fileSystem,
      hydrateKgcDocument: (text) => {
        assert.equal(text, "fixture");
        return { ok: true, world, decisionIndex: new Map() };
      },
      worldTick: async (receivedWorld, input) => {
        assert.equal(receivedWorld, world);
        assert.deepEqual(input, { delta: 1 });
        return {
          ok: true,
          decisions: [completedDecision],
          deferred_decisions: [deferredDecision],
          cost_logs: [{
            model: "none",
            prompt_tokens: 0,
            completion_tokens: 0,
            cache_hits: 0,
            estimated_cost_usd: 0,
            incomplete: false,
          }],
        };
      },
      persistDecisions: async (kgcPath, decisions, options) => {
        persistenceAttempts += 1;
        assert.equal(kgcPath, canonicalKgcPath);
        assert.equal(options.fileSystem, fileSystem);
        persistedBatches.push(decisions);
        if (persistenceAttempts === 1) {
          return { ok: false, errorCode: "ECS_DECISION_WRITE_FAILED", message: "injected write failure" };
        }
        return { ok: true, persistedCount: decisions.length, idempotentCount: 0 };
      },
      disposeWorld: (receivedWorld) => {
        disposedWorlds.push(receivedWorld);
        return true;
      },
    });

    const started = await runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart, startArgs);
    assert.equal(started.ok, true);
    assert.equal(started.kgcPath, "world.md");

    const rejectedAuthored = await runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist, {
      ...sessionArgs(started.sessionId),
      decisions: [completedDecision],
    });
    assert.equal(rejectedAuthored.errorCode, "ECS_INVALID_ARGUMENTS");
    assert.equal(persistenceAttempts, 0);

    const ticked = await runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick, {
      ...sessionArgs(started.sessionId),
      input: { delta: 1 },
    });
    assert.equal(ticked.ok, true);
    assert.equal(ticked.pendingDecisionCount, 1);
    assert.deepEqual(ticked.decisions, [completedDecision]);
    assert.deepEqual(ticked.deferred_decisions, [deferredDecision]);

    const failedPersist = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist,
      sessionArgs(started.sessionId),
    );
    assert.equal(failedPersist.ok, false);
    assert.equal(failedPersist.errorCode, "ECS_DECISION_WRITE_FAILED");
    assert.equal(failedPersist.sessionRetained, true);
    assert.equal(failedPersist.retainedDecisionCount, 1);
    assert.deepEqual(disposedWorlds, []);

    const persisted = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist,
      sessionArgs(started.sessionId),
    );
    assert.deepEqual(persistedBatches, [[completedDecision], [completedDecision]]);
    assert.equal(persisted.ok, true);
    assert.equal(persisted.persistedCount, 1);
    assert.equal(persisted.sessionClosed, true);
    assert.deepEqual(disposedWorlds, [world]);

    const closed = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick,
      sessionArgs(started.sessionId),
    );
    assert.equal(closed.errorCode, "ECS_SESSION_NOT_FOUND");
  });
});

test("persisting a session with zero pending Decisions closes without calling persistence", async () => {
  await withTempRoot(async ({ rootDir }) => {
    const world = {};
    let persistenceCalls = 0;
    let disposalCalls = 0;
    const runtime = createEcsRuntime({
      rootDir,
      hydrateKgcDocument: () => ({ ok: true, world, decisionIndex: new Map() }),
      persistDecisions: async () => {
        persistenceCalls += 1;
        return { ok: true, persistedCount: 0, idempotentCount: 0 };
      },
      disposeWorld: () => {
        disposalCalls += 1;
        return true;
      },
    });
    const started = await runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart, startArgs);
    const persisted = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist,
      sessionArgs(started.sessionId),
    );
    assert.equal(persisted.ok, true);
    assert.equal(persisted.persistedCount, 0);
    assert.equal(persistenceCalls, 0);
    assert.equal(disposalCalls, 1);
  });
});

test("malformed or unsupported tick Decisions are rejected before pending session state changes", async () => {
  await withTempRoot(async ({ rootDir }) => {
    let persistenceCalls = 0;
    const runtime = createEcsRuntime({
      rootDir,
      hydrateKgcDocument: () => ({ ok: true, world: {}, decisionIndex: new Map() }),
      worldTick: async () => ({
        ok: true,
        decisions: [{
          decisionId: "invalid-decision",
          decisionType: "raw_component_store",
          entityRef: "npc.guide",
          payload: {},
          producedAt: "2026-07-20T00:00:00.000Z",
        }],
        deferred_decisions: [],
        cost_logs: [],
      }),
      persistDecisions: async () => {
        persistenceCalls += 1;
        return { ok: true, persistedCount: 0, idempotentCount: 0 };
      },
      disposeWorld: () => true,
    });
    const started = await runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart, startArgs);
    const ticked = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick,
      sessionArgs(started.sessionId),
    );
    assert.equal(ticked.ok, false);
    assert.equal(ticked.errorCode, "ECS_DECISION_UNSUPPORTED_TYPE");

    const persisted = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist,
      sessionArgs(started.sessionId),
    );
    assert.equal(persisted.ok, true);
    assert.equal(persisted.persistedCount, 0);
    assert.equal(persistenceCalls, 0);
  });
});

test("a post-commit pending Decision conflict reports the committed tick and preserves usage", async () => {
  await withTempRoot(async ({ rootDir }) => {
    const world = createWorld({
      systems: [(context) => {
        const nextValue = context.read(0, "Counter", "value") + 1;
        context.write(0, "Counter", "value", nextValue);
        context.emitDecision(completedDecision("stable-id", { value: nextValue }));
      }],
    });
    registerComponent(world, "Counter", { value: "i32" });
    allocateEntity(world, {
      entityRef: "npc.guide",
      components: { Counter: { value: 1 } },
    });
    const runtime = createEcsRuntime({
      rootDir,
      hydrateKgcDocument: () => ({ ok: true, world, decisionIndex: new Map() }),
      disposeWorld: () => true,
    });
    const started = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart,
      startArgs,
    );
    const first = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick,
      sessionArgs(started.sessionId),
    );
    assert.equal(first.ok, true);
    assert.equal(first.tickCount, 1);
    assert.equal(first.pendingDecisionCount, 1);

    const conflict = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsWorldTick,
      sessionArgs(started.sessionId),
    );
    assert.equal(conflict.ok, false);
    assert.equal(conflict.errorCode, "ECS_DECISION_ID_CONFLICT");
    assert.equal(conflict.tickCount, 2);
    assert.equal(conflict.tickCommitted, true);
    assert.equal(conflict.pendingDecisionCount, 1);
    assert.equal(conflict.cost_logs.length, 1);
    assert.equal(conflict.cost_logs[0].model, "none");
    assert.equal(snapshotWorld(world).entities[0].components.Counter.value, 3);
  });
});

test("terminal disposal failure stays structured and retains the session for retry", async () => {
  await withTempRoot(async ({ rootDir }) => {
    let disposalAttempts = 0;
    const runtime = createEcsRuntime({
      rootDir,
      hydrateKgcDocument: () => ({ ok: true, world: {}, decisionIndex: new Map() }),
      disposeWorld: () => {
        disposalAttempts += 1;
        if (disposalAttempts === 1) throw new Error("injected disposal failure");
        return true;
      },
    });
    const started = await runtime.run(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsSessionStart, startArgs);
    const failed = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist,
      sessionArgs(started.sessionId),
    );
    assert.equal(failed.ok, false);
    assert.equal(failed.errorCode, "ECS_SESSION_DISPOSE_FAILED");
    assert.equal(failed.sessionRetained, true);
    assert.equal(failed.message, "ECS session disposal failed");
    assert.equal(JSON.stringify(failed).includes("injected disposal failure"), false);

    const retried = await runtime.run(
      AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.ecsDecisionPersist,
      sessionArgs(started.sessionId),
    );
    assert.equal(retried.ok, true);
    assert.equal(retried.sessionClosed, true);
    assert.equal(disposalAttempts, 2);
  });
});
