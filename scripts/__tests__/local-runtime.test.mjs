import assert from "node:assert/strict";
import { chmodSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  classifyCanonicalRuntimeResidue,
  parseConsumerPinnedDocsRef,
  resolveCanonicalMainWorktree,
  resolveWorkspaceRootFromGitCommonDir,
  validateCanonicalRuntimeCandidate,
} from "../local-runtime-candidate-lib.mjs";
import { endLocalRuntimeTurn } from "../local-runtime-lib.mjs";
import {
  startSessionRuntime,
  validateOwnedSessionService,
} from "../local-runtime-session-lib.mjs";
import {
  APEX_PORT,
  LOCAL_RUNTIME_SCHEMA,
  SESSION_RUNTIME_SCHEMA,
  STORAGE_PORT,
  acquireLock,
  runtimeLocations,
  validateOwnedService,
} from "../local-runtime-supervisor-lib.mjs";

const applicationSha = "a".repeat(40);
const docsSha = "b".repeat(40);

function repository(id, revision, overrides = {}) {
  return {
    id,
    branch: "main",
    clean: true,
    headSha: revision,
    remoteSha: revision,
    protectedChecksVerified: true,
    checks: ["verified"],
    ...overrides,
  };
}

function validCandidate(overrides = {}) {
  return {
    agenticCanvasOs: repository("agentic-os", docsSha),
    agenticGraph: {
      ...repository("agentic-graph", applicationSha),
      gitCommonDir: "/workspace/agentic-graph/.git",
      hasDevApexScript: true,
      hasStorageWorkerScript: true,
    },
    ...overrides,
  };
}

test("canonical runtime accepts only clean protected exact-main sources", () => {
  const validated = validateCanonicalRuntimeCandidate(validCandidate());
  assert.equal(validated.agenticGraph.headSha, applicationSha);
  assert.equal(validated.agenticCanvasOs.revisionBinding, "fetched-tip");
});

test("canonical runtime binds agentic-os to the consumer pin when it is an ancestor of origin/main", () => {
  const pinSha = "e".repeat(40);
  const tipSha = "f".repeat(40);
  const candidate = validCandidate({
    agenticCanvasOs: repository("agentic-os", pinSha, {
      remoteSha: tipSha,
      consumerPinnedRef: pinSha,
      consumerPinnedRefIsAncestorOfRemote: true,
    }),
  });
  const validated = validateCanonicalRuntimeCandidate(candidate);
  assert.equal(validated.agenticCanvasOs.headSha, pinSha);
  assert.equal(validated.agenticCanvasOs.revisionBinding, "consumer-pin");
});

test("canonical runtime rejects a consumer pin that is not an ancestor of fetched origin/main", () => {
  const pinSha = "e".repeat(40);
  const candidate = validCandidate({
    agenticCanvasOs: repository("agentic-os", pinSha, {
      remoteSha: "f".repeat(40),
      consumerPinnedRef: pinSha,
      consumerPinnedRefIsAncestorOfRemote: false,
    }),
  });
  assert.throws(() => validateCanonicalRuntimeCandidate(candidate), /consumer-pinned docs_dependency ref/);
});

test("canonical runtime rejects an agentic-os HEAD that matches neither tip nor consumer pin", () => {
  const candidate = validCandidate({
    agenticCanvasOs: repository("agentic-os", docsSha, {
      remoteSha: "f".repeat(40),
      consumerPinnedRef: "e".repeat(40),
      consumerPinnedRefIsAncestorOfRemote: true,
    }),
  });
  assert.throws(() => validateCanonicalRuntimeCandidate(candidate), /consumer-pinned docs_dependency ref/);
});

test("canonical runtime never relaxes the agentic-graph tip requirement to a pin", () => {
  const candidate = validCandidate({
    agenticGraph: {
      ...validCandidate().agenticGraph,
      remoteSha: "c".repeat(40),
      consumerPinnedRef: applicationSha,
      consumerPinnedRefIsAncestorOfRemote: true,
    },
  });
  assert.throws(() => validateCanonicalRuntimeCandidate(candidate), /must equal fetched origin\/main/);
});

test("consumer pinned docs ref parsing is conservative", () => {
  const pin = "0123456789abcdef0123456789abcdef01234567";
  const frontmatter = [
    "---",
    "title: \"Contract\"",
    "docs_dependency:",
    "  repository: \"https://github.com/huijoohwee/agentic-os.git\"",
    `  ref: "${pin}"`,
    "---",
    "body",
  ].join("\n");
  assert.equal(parseConsumerPinnedDocsRef(frontmatter), pin);
  assert.equal(parseConsumerPinnedDocsRef(frontmatter.replace("docs_dependency:", "other_dependency:")), null);
  assert.equal(parseConsumerPinnedDocsRef(frontmatter.replace(pin, "not-a-sha")), null);
  assert.equal(parseConsumerPinnedDocsRef(`ref: "${pin}"`), null);
  assert.equal(parseConsumerPinnedDocsRef(["---", "docs_dependency:", "---", `  ref: "${pin}"`].join("\n")), null);
  assert.equal(parseConsumerPinnedDocsRef(null), null);
});

test("canonical runtime residue tolerates foreign parallel docs but blocks runtime authority drift", () => {
  const foreign = classifyCanonicalRuntimeResidue({
    repositoryId: "agentic-graph",
    statusPorcelain: "?? docs/documents/agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.md\n",
  });
  assert.equal(foreign.clean, false);
  assert.equal(foreign.runtimeSafe, true);
  assert.equal(foreign.blocking.length, 0);
  assert.deepEqual(
    foreign.foreign.map(entry => ({ path: entry.path, reason: entry.reason })),
    [{
      path: "docs/documents/agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.md",
      reason: "foreign-parallel-residue",
    }],
  );

  const blocking = classifyCanonicalRuntimeResidue({
    repositoryId: "agentic-graph",
    statusPorcelain: [
      "?? src/runtime-drift.ts",
      " M docs/documents/agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.md",
    ].join("\n"),
  });
  assert.equal(blocking.runtimeSafe, false);
  assert.deepEqual(
    blocking.blocking.map(entry => ({ path: entry.path, reason: entry.reason })),
    [
      { path: "src/runtime-drift.ts", reason: "untracked-runtime-authority" },
      { path: "docs/documents/agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.md", reason: "tracked-residue" },
    ],
  );
});

test("canonical runtime follows the single registered main worktree from a feature checkout", () => {
  const porcelain = [
    "worktree /workspace/agentic-os",
    `HEAD ${docsSha}`,
    "branch refs/heads/docs/feature",
    "",
    "worktree /workspace/.worktrees/canonical/agentic-os",
    `HEAD ${docsSha}`,
    "branch refs/heads/main",
    "",
  ].join("\n");
  assert.equal(
    resolveCanonicalMainWorktree(porcelain),
    path.resolve("/workspace/.worktrees/canonical/agentic-os"),
  );
  assert.equal(
    resolveWorkspaceRootFromGitCommonDir("/workspace/agentic-os/.git"),
    path.resolve("/workspace"),
  );
  assert.throws(
    () => resolveCanonicalMainWorktree(porcelain.replace("branch refs/heads/main", "detached")),
    /found 0/,
  );
});

for (const [name, candidate, expected] of [
  ["task branch", validCandidate({ agenticGraph: { ...validCandidate().agenticGraph, branch: "agent/device/task" } }), /must be on main/],
  ["dirty docs", validCandidate({
    agenticCanvasOs: repository("agentic-os", docsSha, {
      clean: false,
      residue: classifyCanonicalRuntimeResidue({
        repositoryId: "agentic-os",
        statusPorcelain: " M docs/PROJECT-RULES.md\n",
      }),
    }),
  }), /runtime-blocking residue/],
  ["stale application", validCandidate({ agenticGraph: { ...validCandidate().agenticGraph, remoteSha: "c".repeat(40) } }), /must equal fetched origin\/main/],
  ["missing protected checks", validCandidate({ agenticGraph: { ...validCandidate().agenticGraph, protectedChecksVerified: false } }), /protected checks/],
  ["missing storage owner", validCandidate({ agenticGraph: { ...validCandidate().agenticGraph, hasStorageWorkerScript: false } }), /storage:worker:dev/],
]) {
  test(`canonical runtime rejects ${name}`, () => {
    assert.throws(() => validateCanonicalRuntimeCandidate(candidate), expected);
  });
}

test("canonical runtime accepts non-blocking foreign residue in canonical agentic-graph", () => {
  const candidate = validCandidate({
    agenticGraph: {
      ...validCandidate().agenticGraph,
      clean: false,
      residue: classifyCanonicalRuntimeResidue({
        repositoryId: "agentic-graph",
        statusPorcelain: "?? docs/documents/agentic-graph-storage-sync-prd-tad-adr-mvp-gtm.md\n",
      }),
    },
  });
  assert.equal(validateCanonicalRuntimeCandidate(candidate).agenticGraph.headSha, applicationSha);
});

test("service ownership binds listener group repository command and token", () => {
  const token = "runtime-owner-token";
  const tokenDigest = "5822ab207d650e4afca6e5c0f3c0b153bda3b69c2b969f61793a5467704d6b0f";
  const service = { name: "apex", supervisorPid: 100, listenerPid: 101, commandMarker: "node_modules/.bin/vite" };
  const evidence = {
    pid: 101,
    processGroupId: 100,
    command: "node /workspace/agentic-graph/node_modules/.bin/vite --strictPort",
    gitCommonDir: "/workspace/agentic-graph/.git",
    listenerEnvironment: `node_modules/.bin/vite AGENTIC_LOCAL_RUNTIME_TOKEN=${token}`,
  };
  assert.equal(validateOwnedService({ service, processEvidence: evidence, token, tokenDigest, candidate: validCandidate() }), true);
  assert.equal(validateOwnedService({
    service,
    processEvidence: { ...evidence, pid: 102 },
    token,
    tokenDigest,
    candidate: validCandidate(),
  }), true);
  assert.throws(
    () => validateOwnedService({ service, processEvidence: null, token, tokenDigest, candidate: validCandidate() }),
    /process is unavailable/,
  );
  assert.throws(
    () => validateOwnedService({ service, processEvidence: { ...evidence, gitCommonDir: "/workspace/other/.git" }, token, tokenDigest, candidate: validCandidate() }),
    /unrelated repository/,
  );
  assert.throws(
    () => validateOwnedService({ service, processEvidence: { ...evidence, processGroupId: 999 }, token, tokenDigest, candidate: validCandidate() }),
    /process group/,
  );
  assert.throws(
    () => validateOwnedService({ service, processEvidence: { ...evidence, listenerEnvironment: "node_modules/.bin/vite" }, token, tokenDigest, candidate: validCandidate() }),
    /ownership token/,
  );
});

test("session Vite ownership binds exact session, process start, repository, command, and token", () => {
  const token = "runtime-owner-token";
  const state = {
    schema: SESSION_RUNTIME_SCHEMA,
    status: "session-dev",
    sessionId: "session-a",
    source: { revision: applicationSha },
    agenticCanvasOs: { revision: docsSha },
    ownershipTokenDigest: "5822ab207d650e4afca6e5c0f3c0b153bda3b69c2b969f61793a5467704d6b0f",
    service: {
      supervisorPid: 100,
      listenerPid: 101,
      commandMarker: "node_modules/.bin/vite",
      processStartedAt: "Sat Jul 26 12:00:00 2026",
      listenerCwd: "/workspace/agentic-graph/canvas",
    },
  };
  const candidate = {
    agenticGraph: {
      root: "/workspace/agentic-graph",
      gitCommonDir: "/workspace/agentic-graph/.git",
      headSha: applicationSha,
    },
  };
  const evidence = {
    pid: 101,
    processGroupId: 100,
    processStartedAt: state.service.processStartedAt,
    cwd: state.service.listenerCwd,
    command: "node /workspace/agentic-graph/node_modules/.bin/vite --strictPort",
    gitCommonDir: candidate.agenticGraph.gitCommonDir,
    listenerEnvironment: `AGENTIC_SESSION_ID=session-a AGENTIC_SESSION_RUNTIME_TOKEN=${token} ` +
      `AGENTIC_OS_SOURCE_REVISION=${applicationSha} AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_REVISION=${docsSha}`,
  };
  assert.equal(validateOwnedSessionService({
    state, processEvidence: evidence, token, candidate, sessionId: "session-a",
  }), true);
  assert.throws(() => validateOwnedSessionService({
    state, processEvidence: evidence, token, candidate, sessionId: "session-b",
  }), /another session/);
  assert.throws(() => validateOwnedSessionService({
    state,
    processEvidence: { ...evidence, processStartedAt: "Sat Jul 26 12:00:01 2026" },
    token,
    candidate,
    sessionId: "session-a",
  }), /start identity/);
  assert.throws(() => validateOwnedSessionService({
    state,
    processEvidence: { ...evidence, listenerEnvironment: "AGENTIC_SESSION_ID=session-a" },
    token,
    candidate,
    sessionId: "session-a",
  }), /ownership token/);
});

test("turn end migrates local storage before handoff and proves canonical runtime ready", async t => {
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "agentic-session-runtime-"));
  const candidate = {
    workspaceRoot,
    agenticCanvasOsRoot: "/workspace/agentic-os",
    agenticCanvasOs: { headSha: docsSha, treeSha: "c".repeat(40) },
    agenticGraph: {
      root: "/workspace/agentic-graph",
      gitCommonDir: "/workspace/agentic-graph/.git",
      headSha: applicationSha,
      treeSha: "d".repeat(40),
    },
    protectedChecks: {
      "agentic-os": ["test", "build", "docs-contract", "collaboration-integration"],
      "agentic-graph": ["Integration Gate"],
    },
  };
  const listeners = new Map();
  const processes = new Map();
  const launchedCommands = [];
  const runtimeEffects = [];
  const stoppedGroups = [];
  let migrationError = null;
  let nextGroup = 100;
  const dependencies = {
    inspectCanonicalCandidate: () => candidate,
    openLog: () => 1,
    closeLog: () => {},
    runCommand: async invocation => {
      runtimeEffects.push("migrate-storage");
      assert.equal(invocation.cwd, candidate.agenticGraph.root);
      assert.equal(invocation.command, "npm");
      assert.deepEqual(invocation.args, ["run", "storage:d1:migrate:local"]);
      assert.equal(invocation.env.AGENTIC_OS_SOURCE_REVISION, applicationSha);
      assert.equal(invocation.env.AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT, "/workspace/agentic-os/catalog/dictionaries");
      assert.equal(invocation.env.AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_REVISION, docsSha);
      assert.equal(invocation.env.AGENTIC_OS_STORAGE_DEV_PROXY_TARGET, "http://127.0.0.1:8787");
      assert.equal(invocation.env.AGENTIC_LOCAL_RUNTIME_TOKEN, undefined);
      if (migrationError) throw migrationError;
    },
    writePrivateFile: (filePath, text) => {
      runtimeEffects.push(`write-token:${path.basename(filePath)}`);
      writeFileSync(filePath, text, { encoding: "utf8", mode: 0o600 });
      chmodSync(filePath, 0o600);
    },
    spawnService: ({ cwd, env, args }) => {
      launchedCommands.push(args);
      const port = args.includes(String(STORAGE_PORT)) ? STORAGE_PORT : APEX_PORT;
      runtimeEffects.push(`spawn:${port}`);
      const supervisorPid = nextGroup;
      nextGroup += 100;
      const listenerPid = supervisorPid + 1;
      const commandMarker = port === STORAGE_PORT ? "workerd" : "node_modules/.bin/vite";
      listeners.set(port, listenerPid);
      processes.set(listenerPid, {
        pid: listenerPid,
        cwd,
        processGroupId: supervisorPid,
        processStartedAt: `process-start-${listenerPid}`,
        command: `node ${commandMarker}`,
        listenerEnvironment: Object.entries(env).map(([key, value]) => `${key}=${value}`).join(" "),
        gitCommonDir: candidate.agenticGraph.gitCommonDir,
      });
      return { pid: supervisorPid, unref: () => {} };
    },
    readListenerPid: port => listeners.get(port) || null,
    readListenerPids: port => listeners.has(port) ? [listeners.get(port)] : [],
    inspectListenerProcess: pid => processes.get(pid),
    readHttpStatus: async () => 200,
    waitForHttp: async () => 200,
    stopProcessGroup: supervisorPid => {
      stoppedGroups.push(supervisorPid);
      runtimeEffects.push(`stop:${supervisorPid}`);
      for (const [port, listenerPid] of listeners) {
        if (processes.get(listenerPid)?.processGroupId === supervisorPid) listeners.delete(port);
      }
    },
    waitForPortRelease: async port => assert.equal(listeners.has(port), false),
    now: () => new Date("2026-07-26T05:00:00.000Z"),
  };
  const locations = runtimeLocations(workspaceRoot);
  const options = {
    repository: candidate.agenticGraph.root,
    agenticCanvasOsRoot: candidate.agenticCanvasOsRoot,
    sessionId: "session-a",
    timeoutMs: 10_000,
  };
  try {
    const session = await startSessionRuntime(options, dependencies);
    assert.equal(session.schema, SESSION_RUNTIME_SCHEMA);
    assert.equal(session.status, "session-dev");
    assert.equal(session.ready, false);
    assert.equal(listeners.get(APEX_PORT), 101);

    await assert.rejects(() => endLocalRuntimeTurn({ ...options, sessionId: "session-b" }, dependencies), /another session/);
    assert.deepEqual(stoppedGroups, []);
    assert.equal(listeners.get(APEX_PORT), 101);

    await t.test("migration failure leaves the active session and canonical runtime effects untouched", async () => {
      migrationError = new Error("local D1 migration failed");
      runtimeEffects.length = 0;
      await assert.rejects(() => endLocalRuntimeTurn(options, dependencies), /local D1 migration failed/);
      assert.deepEqual(runtimeEffects, ["migrate-storage"]);
      assert.deepEqual(stoppedGroups, []);
      assert.equal(listeners.get(APEX_PORT), 101);
      assert.equal(JSON.parse(await readFile(locations.sessionStatePath, "utf8")).sessionId, "session-a");
      await assert.rejects(readFile(locations.tokenPath), error => error?.code === "ENOENT");
      await assert.rejects(readFile(locations.statePath), error => error?.code === "ENOENT");
      await assert.rejects(readFile(locations.reviewCandidatePath), error => error?.code === "ENOENT");
    });

    migrationError = null;
    runtimeEffects.length = 0;
    const result = await endLocalRuntimeTurn(options, dependencies);
    assert.equal(result.schema, LOCAL_RUNTIME_SCHEMA);
    assert.equal(result.status, "runtime-ready");
    assert.equal(result.ready, true);
    assert.equal(result.application, "agentic-os");
    assert.equal(result.handoff.status, "session-runtime-stopped");
    assert.equal(result.handoff.stoppedSessionRuntime, true);
    assert.ok(stoppedGroups.includes(100));
    assert.equal(listeners.get(STORAGE_PORT), 201);
    assert.equal(listeners.get(APEX_PORT), 301);
    assert.deepEqual(runtimeEffects, [
      "migrate-storage",
      "stop:100",
      "write-token:owner.token",
      `spawn:${STORAGE_PORT}`,
      `spawn:${APEX_PORT}`,
    ]);
    assert.deepEqual(launchedCommands[1], [
      "run", "storage:worker:dev", "--", "--local", "--var",
      "AGENTIC_OS_STORAGE_LOCAL_RUNTIME:true", "--ip", "127.0.0.1", "--port", "8787",
    ]);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});

test("host lock serializes active owners and recovers a dead stale owner", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "agentic-local-runtime-lock-"));
  const lockPath = path.join(directory, "supervisor.lock");
  try {
    const release = acquireLock(lockPath);
    assert.throws(() => acquireLock(lockPath), new RegExp(`active PID ${process.pid}`));
    release();
    await writeFile(lockPath, `${JSON.stringify({ pid: 999_999_999 })}\n`, "utf8");
    const releaseRecovered = acquireLock(lockPath);
    releaseRecovered();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("package exposes canonical and session-handoff supervisor commands", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts["runtime:local:ensure"], "node ./scripts/local-runtime.mjs ensure");
  assert.equal(packageJson.scripts["runtime:local:status"], "node ./scripts/local-runtime.mjs status");
  assert.equal(packageJson.scripts["runtime:local:stop"], "node ./scripts/local-runtime.mjs stop");
  assert.equal(packageJson.scripts["runtime:session:start"], "node ./scripts/local-runtime.mjs session-start");
  assert.equal(packageJson.scripts["runtime:session:status"], "node ./scripts/local-runtime.mjs session-status");
  assert.equal(packageJson.scripts["runtime:session:stop"], "node ./scripts/local-runtime.mjs session-stop");
  assert.equal(packageJson.scripts["turn:end"], "node ./scripts/local-runtime.mjs turn-end");
  assert.equal(packageJson.scripts["device:turn-end"], undefined);
  assert.deepEqual({ apex: APEX_PORT, storage: STORAGE_PORT }, { apex: 5173, storage: 8787 });
  assert.equal(LOCAL_RUNTIME_SCHEMA, "agentic-local-runtime-readiness/v1");
});
