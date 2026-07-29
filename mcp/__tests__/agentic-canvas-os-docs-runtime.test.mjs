import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME,
  AGENTIC_CANVAS_OS_DOCS_SOURCE_ROOT_URL,
  AGENTIC_CANVAS_OS_DOCS_WORKSPACE_ROOT,
} from "../agentic-canvas-os-docs-contract.mjs";
import {
  resolveAgenticCanvasOsDocsRoot,
  resolveAgenticCanvasOsDocsRevision,
  runAgenticCanvasOsDocsInvokeTool,
} from "../agentic-canvas-os-docs-runtime.js";
import {
  buildAgentLiveProviderProofSummary,
  buildAgenticCanvasOsDocsCatalog,
  buildAgenticCanvasOsDocsCatalogDigest,
  buildAgenticCanvasOsDocsInvokePayload,
  buildProgressiveAgentsReadinessSummary,
  resolveAgentLiveProviderProofRevisionFromGitHub,
} from "../agentic-canvas-os-docs-core.mjs";
import { buildKnowgrphLocalMcpToolDefinitions, KNOWGRPH_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWGRPH_ROOT = path.resolve(__dirname, "..", "..");
const DOCS_ENV = process.env.KNOWGRPH_AGENTIC_CANVAS_OS_DOCS_ROOT
  ? { KNOWGRPH_AGENTIC_CANVAS_OS_DOCS_ROOT: path.resolve(process.env.KNOWGRPH_AGENTIC_CANVAS_OS_DOCS_ROOT) }
  : {};
const DOCS_ROOT = (() => {
  try {
    return resolveAgenticCanvasOsDocsRoot({ rootDir: KNOWGRPH_ROOT, env: DOCS_ENV });
  } catch (error) {
    if (DOCS_ENV.KNOWGRPH_AGENTIC_CANVAS_OS_DOCS_ROOT) throw error;
    return "";
  }
})();
const DOCS_AVAILABLE = Boolean(DOCS_ROOT) && existsSync(path.join(DOCS_ROOT, "FACTS.md"));

test("Agentic Canvas OS docs root resolves from explicit configuration or an ancestor workspace", { skip: !DOCS_AVAILABLE }, () => {
  assert.equal(resolveAgenticCanvasOsDocsRoot({ rootDir: KNOWGRPH_ROOT, env: DOCS_ENV }), DOCS_ROOT);
});

test("linked Knowgrph worktrees resolve the canonical ancestor Agentic Canvas OS docs root", () => {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "knowgrph-docs-root-"));
  const docsRoot = path.join(workspaceRoot, "agentic-canvas-os", "docs");
  const taskRoot = path.join(workspaceRoot, ".worktrees", "knowgrph", "xr-invocation-runtime");
  try {
    mkdirSync(docsRoot, { recursive: true });
    mkdirSync(taskRoot, { recursive: true });
    writeFileSync(path.join(docsRoot, "FACTS.md"), "# Source marker\n");
    assert.equal(realpathSync(resolveAgenticCanvasOsDocsRoot({ rootDir: taskRoot, env: {} })), realpathSync(docsRoot));
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("registered external Knowgrph worktrees recover the canonical docs root from Git metadata", () => {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "knowgrph-external-docs-root-"));
  const externalParent = mkdtempSync(path.join(tmpdir(), "knowgrph-external-worktree-"));
  const repositoryRoot = path.join(workspaceRoot, "knowgrph");
  const docsRoot = path.join(workspaceRoot, "agentic-canvas-os", "docs");
  const taskRoot = path.join(externalParent, "xr-invocation-runtime");
  try {
    mkdirSync(repositoryRoot, { recursive: true });
    mkdirSync(docsRoot, { recursive: true });
    writeFileSync(path.join(repositoryRoot, "README.md"), "# Knowgrph fixture\n");
    writeFileSync(path.join(docsRoot, "FACTS.md"), "# Source marker\n");
    execFileSync("git", ["init", "-q"], { cwd: repositoryRoot });
    execFileSync("git", ["add", "README.md"], { cwd: repositoryRoot });
    execFileSync("git", ["-c", "user.name=Knowgrph Test", "-c", "user.email=test@knowgrph.local", "commit", "-qm", "test source"], { cwd: repositoryRoot });
    execFileSync("git", ["worktree", "add", "--detach", taskRoot, "HEAD"], { cwd: repositoryRoot, stdio: "ignore" });
    assert.equal(realpathSync(resolveAgenticCanvasOsDocsRoot({ rootDir: taskRoot, env: {} })), realpathSync(docsRoot));
  } finally {
    rmSync(externalParent, { recursive: true, force: true });
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("configured docs revision must match checkout HEAD with a clean docs tree", async () => {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "knowgrph-docs-revision-"));
  const repositoryRoot = path.join(workspaceRoot, "agentic-canvas-os");
  const docsRoot = path.join(repositoryRoot, "docs");
  try {
    mkdirSync(docsRoot, { recursive: true });
    writeFileSync(path.join(docsRoot, "FACTS.md"), "# Canonical bytes\n");
    execFileSync("git", ["init", "-q"], { cwd: repositoryRoot });
    execFileSync("git", ["add", "docs/FACTS.md"], { cwd: repositoryRoot });
    execFileSync("git", ["-c", "user.name=Knowgrph Test", "-c", "user.email=test@knowgrph.local", "commit", "-qm", "test docs"], { cwd: repositoryRoot });
    const headRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
    execFileSync("git", ["remote", "add", "origin", "https://github.com/huijoohwee/agentic-canvas-os.git"], { cwd: repositoryRoot });
    execFileSync("git", ["update-ref", "refs/remotes/origin/main", headRevision], { cwd: repositoryRoot });

    await assert.rejects(
      resolveAgenticCanvasOsDocsRevision({
        absoluteDocsRoot: docsRoot,
        env: { KNOWGRPH_AGENTIC_CANVAS_OS_DOCS_REVISION: "b".repeat(40) },
      }),
      /does not match docs checkout HEAD/,
    );

    writeFileSync(path.join(docsRoot, "FACTS.md"), "# Dirty bytes\n");
    await assert.rejects(
      resolveAgenticCanvasOsDocsRevision({
        absoluteDocsRoot: docsRoot,
        env: { KNOWGRPH_AGENTIC_CANVAS_OS_DOCS_REVISION: headRevision },
      }),
      /uncommitted content/,
    );
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("docs revision rejects an arbitrary synthetic repository with no canonical origin", async () => {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "knowgrph-docs-untrusted-"));
  const repositoryRoot = path.join(workspaceRoot, "agentic-canvas-os");
  const docsRoot = path.join(repositoryRoot, "docs");
  try {
    mkdirSync(docsRoot, { recursive: true });
    writeFileSync(path.join(docsRoot, "FACTS.md"), "# Forged source marker\n");
    execFileSync("git", ["init", "-q"], { cwd: repositoryRoot });
    execFileSync("git", ["add", "docs/FACTS.md"], { cwd: repositoryRoot });
    execFileSync("git", [
      "-c", "user.name=Knowgrph Test",
      "-c", "user.email=test@knowgrph.local",
      "commit", "-qm", "forged docs",
    ], { cwd: repositoryRoot });
    const forgedRevision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();

    await assert.rejects(
      resolveAgenticCanvasOsDocsRevision({ absoluteDocsRoot: docsRoot, env: {} }),
      /no canonical origin/,
    );

    await assert.rejects(
      runAgenticCanvasOsDocsInvokeTool({}, {
        rootDir: repositoryRoot,
        env: { KNOWGRPH_AGENTIC_CANVAS_OS_DOCS_ROOT: docsRoot },
      }),
      (error) => {
        assert.equal(error.code, "docs_source_authority_unverified");
        assert.equal(error.message, "Agentic Canvas OS docs source authority could not be verified.");
        assert.equal(error.message.includes(workspaceRoot), false);
        return true;
      },
    );

    execFileSync("git", ["remote", "add", "origin", "https://github.com/example/forged-docs.git"], { cwd: repositoryRoot });
    execFileSync("git", ["update-ref", "refs/remotes/origin/main", forgedRevision], { cwd: repositoryRoot });
    await assert.rejects(
      resolveAgenticCanvasOsDocsRevision({ absoluteDocsRoot: docsRoot, env: {} }),
      /origin is not canonical/,
    );
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("docs revision accepts canonical GitHub origin forms with a fetched origin/main fence", async () => {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "knowgrph-docs-canonical-origin-"));
  const repositoryRoot = path.join(workspaceRoot, "agentic-canvas-os");
  const docsRoot = path.join(repositoryRoot, "docs");
  try {
    mkdirSync(docsRoot, { recursive: true });
    writeFileSync(path.join(docsRoot, "FACTS.md"), "# Canonical source marker\n");
    execFileSync("git", ["init", "-q"], { cwd: repositoryRoot });
    execFileSync("git", ["add", "docs/FACTS.md"], { cwd: repositoryRoot });
    execFileSync("git", [
      "-c", "user.name=Knowgrph Test",
      "-c", "user.email=test@knowgrph.local",
      "commit", "-qm", "canonical docs",
    ], { cwd: repositoryRoot });
    const headRevision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
    execFileSync("git", ["remote", "add", "origin", "https://github.com/huijoohwee/agentic-canvas-os.git"], { cwd: repositoryRoot });
    execFileSync("git", ["update-ref", "refs/remotes/origin/main", headRevision], { cwd: repositoryRoot });

    for (const remoteUrl of [
      "https://github.com/huijoohwee/agentic-canvas-os.git",
      "git@github.com:huijoohwee/agentic-canvas-os.git",
      "ssh://git@github.com/huijoohwee/agentic-canvas-os.git",
    ]) {
      execFileSync("git", ["remote", "set-url", "origin", remoteUrl], { cwd: repositoryRoot });
      assert.equal(
        await resolveAgenticCanvasOsDocsRevision({ absoluteDocsRoot: docsRoot, env: {} }),
        headRevision,
      );
    }
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("docs revision rejects a clean local HEAD that is ahead of fetched origin/main", async () => {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "knowgrph-docs-ahead-"));
  const repositoryRoot = path.join(workspaceRoot, "agentic-canvas-os");
  const docsRoot = path.join(repositoryRoot, "docs");
  try {
    mkdirSync(docsRoot, { recursive: true });
    writeFileSync(path.join(docsRoot, "FACTS.md"), "# Canonical source marker\n");
    execFileSync("git", ["init", "-q"], { cwd: repositoryRoot });
    execFileSync("git", ["add", "docs/FACTS.md"], { cwd: repositoryRoot });
    execFileSync("git", [
      "-c", "user.name=Knowgrph Test",
      "-c", "user.email=test@knowgrph.local",
      "commit", "-qm", "fetched docs",
    ], { cwd: repositoryRoot });
    const fetchedRevision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
    execFileSync("git", ["remote", "add", "origin", "https://github.com/huijoohwee/agentic-canvas-os.git"], { cwd: repositoryRoot });
    execFileSync("git", ["update-ref", "refs/remotes/origin/main", fetchedRevision], { cwd: repositoryRoot });
    writeFileSync(path.join(docsRoot, "FACTS.md"), "# Unfetched local source marker\n");
    execFileSync("git", ["add", "docs/FACTS.md"], { cwd: repositoryRoot });
    execFileSync("git", [
      "-c", "user.name=Knowgrph Test",
      "-c", "user.email=test@knowgrph.local",
      "commit", "-qm", "unfetched docs",
    ], { cwd: repositoryRoot });

    await assert.rejects(
      resolveAgenticCanvasOsDocsRevision({ absoluteDocsRoot: docsRoot, env: {} }),
      /not contained in fetched origin\/main/,
    );
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("local MCP descriptor exposes Agentic Canvas OS docs invocation as read-only", () => {
  const definitions = buildKnowgrphLocalMcpToolDefinitions();
  const descriptor = definitions.find((tool) => tool.name === AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME);

  assert.ok(descriptor, "docs invocation descriptor must exist");
  assert.equal(KNOWGRPH_LOCAL_MCP_TOOL_NAMES.agenticCanvasOsDocsInvoke, AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME);
  assert.equal(descriptor.annotations.readOnlyHint, true);
  assert.equal(descriptor.inputSchema.properties.token.type, "string");
  assert.equal(descriptor.outputSchema.properties.progressiveAgentsReadiness.additionalProperties, false);
});

test("live provider proof summary fails closed when canonical evidence is incomplete", () => {
  const result = buildAgentLiveProviderProofSummary({
    markdown: "---\nschema: agent-live-provider-proof-contract/v1\nstatus: runtime-ready-dev\n---\n",
    sourceRevision: "a".repeat(40),
    proofRevision: "b".repeat(40),
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.providerCalls, 0);
  assert.equal(result.sourceUrl.includes("b".repeat(40)), true);
});

test("progressive Agents readiness fails closed when source evidence is incomplete", () => {
  const result = buildProgressiveAgentsReadinessSummary({
    markdown: "---\nschema: progressive-agents-runtime-contract/v1\nstatus: runtime-ready-dev\n---\n",
    sourceRevision: "a".repeat(40),
  });
  assert.equal(result.status, "unavailable");
  assert.equal(result.contractReady, false);
  assert.equal(result.configured, null);
});

test("standalone docs catalog retains the branch source URL without a revision", () => {
  const catalog = buildAgenticCanvasOsDocsCatalog({
    "FACTS.md": "",
    "DICTIONARY-COMMAND.md": "---\ndictionary_entries:\n  - /query\n---\n| `/query` | Query source docs |",
    "DICTIONARY-SEMANTIC.md": "",
    "DICTIONARY-BINDING.md": "",
  });
  const query = catalog.find((entry) => entry.token === "/query");

  assert.equal(query?.sourceUrl, `${AGENTIC_CANVAS_OS_DOCS_SOURCE_ROOT_URL}/DICTIONARY-COMMAND.md#/query`);
});

test("catalog digest is deterministic, order independent, and sensitive to source metadata", () => {
  const entries = [
    { token: "#known", kind: "semantic", label: "Known", summary: "Semantic source", sourcePath: "DICTIONARY-SEMANTIC.md##known" },
    { token: "/known", kind: "command", label: "Known", summary: "Command source", sourcePath: "DICTIONARY-COMMAND.md#/known" },
  ];
  const digest = buildAgenticCanvasOsDocsCatalogDigest(entries);

  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(buildAgenticCanvasOsDocsCatalogDigest([...entries].reverse()), digest);
  assert.notEqual(
    buildAgenticCanvasOsDocsCatalogDigest([{ ...entries[0], summary: "Drifted" }, entries[1]]),
    digest,
  );
});

test("docs invocation rejects syntactically valid tokens absent from the source catalog", () => {
  const result = buildAgenticCanvasOsDocsInvokePayload({
    docsContentByFileName: {
      "FACTS.md": "",
      "DICTIONARY-COMMAND.md": "---\ndictionary_entries:\n  - /known\n---\n| `/known` | Known |",
      "DICTIONARY-SEMANTIC.md": "---\ndictionary_entries:\n  - #known\n---\n| `#known` | Known |",
      "DICTIONARY-BINDING.md": "---\ndictionary_entries:\n  - @known\n---\n| `@known` | Known |",
    },
    sourceRevision: "a".repeat(40),
    token: "/invented.but.valid",
  });
  assert.equal(result.ok, false);
  assert.equal(result.invocation, null);
  assert.equal(result.error.code, "unknown_invocation_token");
});

test("live provider proof revision falls back to exact read-only remote history", async () => {
  const requests = [];
  const revision = await resolveAgentLiveProviderProofRevisionFromGitHub({
    sourceRevision: "a".repeat(40),
    token: "test-token",
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify([{ sha: "c".repeat(40) }, { sha: "b".repeat(40) }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  assert.equal(revision, "b".repeat(40));
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /sha=a{40}.*LIVE-AGENT-PROVIDER-PROOF\.md/);
  assert.equal(requests[0].init.headers.authorization, "Bearer test-token");
});

test("local MCP docs invocation catalogs /, #, and @ entries from source docs", { skip: !DOCS_AVAILABLE }, async () => {
  const result = await runAgenticCanvasOsDocsInvokeTool({ limit: 500 }, {
    rootDir: KNOWGRPH_ROOT,
    env: DOCS_ENV,
  });

  assert.equal(result.ok, true);
  assert.equal(result.docsRoot, AGENTIC_CANVAS_OS_DOCS_WORKSPACE_ROOT);
  assert.equal(result.absoluteDocsRoot, DOCS_ROOT);
  assert.match(result.sourceRevision, /^[0-9a-f]{40}$/);
  assert.match(result.catalogDigest, /^[0-9a-f]{64}$/);
  assert.equal(result.catalogDigest, buildAgenticCanvasOsDocsCatalogDigest(result.catalog));
  assert.equal(
    result.sourceRootUrl,
    `https://github.com/huijoohwee/agentic-canvas-os/blob/${result.sourceRevision}/docs`,
  );
  assert.ok(
    result.catalog.every((entry) => entry.sourceUrl.startsWith(`${result.sourceRootUrl}/`)),
    "runtime catalog source URLs must share the exact source revision",
  );
  assert.deepEqual(result.liveAgentProviderProof, {
    schema: "agent-live-provider-proof-summary/v1",
    status: "verified-bounded-live",
    evidenceSchema: "agent-live-provider-proof-contract/v1",
    sourceStatus: "runtime-ready-dev",
    sourceRevision: result.sourceRevision,
    proofRevision: "dae927d40f3e8e55687334ed47c2be5dffe14b36",
    sourcePath: "docs/LIVE-AGENT-PROVIDER-PROOF.md",
    sourceUrl: "https://github.com/huijoohwee/agentic-canvas-os/blob/dae927d40f3e8e55687334ed47c2be5dffe14b36/docs/LIVE-AGENT-PROVIDER-PROOF.md",
    model: "gpt-5.6-sol",
    reasoningEffort: "low",
    providerCalls: 3,
    inputTokens: 576,
    outputTokens: 53,
    cachedInputTokens: 0,
    estimatedCostUsd: 0.00447,
    finalAnswerOwners: { delegation: "manager", handoff: "specialist" },
    continuationContext: "all_turns",
    defaultWorkerConfigured: false,
  });
  assert.deepEqual(result.progressiveAgentsReadiness, {
    schema: "progressive-agents-readiness-summary/v1",
    status: "runtime-ready-dev",
    sourceRevision: result.sourceRevision,
    sourcePath: "docs/PROGRESSIVE-AGENTS.md",
    sourceUrl: `https://github.com/huijoohwee/agentic-canvas-os/blob/${result.sourceRevision}/docs/PROGRESSIVE-AGENTS.md`,
    contractSchema: "progressive-agents-runtime-contract/v1",
    runtimeScope: "single-agent execution, tool-bearing agent execution, and explicit specialist workflow delegation",
    runtimeOwner: "../agent-api/src/progressive-agents.js",
    runtimeProof: "../__tests__/progressive-agents.test.mjs",
    contractReady: true,
    configured: false,
    progressionPolicy: "single-agent-then-tools-then-specialists",
    growthStages: ["single-agent", "tool-enabled-agent", "specialist-workflow"],
    externalSdkDependency: false,
    providerExecutionStatus: "unverified",
    defaultWorkerConfigured: false,
    deployPolicy: "Dev-only until explicit operator approval",
  });
  assert.ok(result.counts.command > 0, "slash command entries must be present");
  assert.ok(result.counts.semantic > 0, "hash semantic entries must be present");
  assert.ok(result.counts.binding > 0, "at binding entries must be present");
  assert.ok(result.catalog.some((entry) => entry.token === "/query"));
  assert.ok(result.catalog.some((entry) => entry.token === "#runtime-ready"));
  assert.ok(result.catalog.some((entry) => entry.token === "@mcp-gateway"));
  assert.ok(result.catalog.some((entry) => entry.token === "/sandbox.policy.validate"));
  assert.ok(result.catalog.some((entry) => entry.token === "#agent-sandbox-policy"));
  assert.ok(result.catalog.some((entry) => entry.token === "@sandbox-policy"));
  assert.ok(result.catalog.some((entry) => entry.token === "/agent.toolkit"));
  assert.ok(result.catalog.some((entry) => entry.token === "#agent-toolkit"));
  assert.ok(result.catalog.some((entry) => entry.token === "@agent-toolkit-observer"));
});

test("local MCP docs invocation treats sigil-only queries as token-prefix filters", { skip: !DOCS_AVAILABLE }, async () => {
  let catalogDigest = "";
  for (const [query, kind] of [["/", "command"], ["#", "semantic"], ["@", "binding"]]) {
    const result = await runAgenticCanvasOsDocsInvokeTool({ query, limit: 500 }, {
      rootDir: KNOWGRPH_ROOT,
      env: DOCS_ENV,
    });

    assert.equal(result.ok, true);
    assert.match(result.catalogDigest, /^[0-9a-f]{64}$/);
    if (catalogDigest) assert.equal(result.catalogDigest, catalogDigest);
    catalogDigest = result.catalogDigest;
    assert.equal(result.catalog.length, result.counts[kind]);
    assert.ok(result.catalog.every((entry) => entry.token.startsWith(query)));
  }
});

test("local MCP docs invocation resolves specific /, #, and @ tokens with source content", { skip: !DOCS_AVAILABLE }, async () => {
  for (const [token, expectedSourceUrlSuffix = ""] of [
    ["/query", "/DICTIONARY-COMMAND.md#/query"],
    ["#runtime-ready", "/DICTIONARY-SEMANTIC.md##runtime-ready"],
    ["@mcp-gateway", "/DICTIONARY-BINDING.md#@mcp-gateway"],
    ["/motion.control"], ["#pose"], ["@canvas"],
    ["/agent.toolkit"], ["#agent-toolkit"], ["@agent-toolkit-observer"],
  ]) {
    const result = await runAgenticCanvasOsDocsInvokeTool({ token, includeContent: true }, {
      rootDir: KNOWGRPH_ROOT,
      env: DOCS_ENV,
    });

    assert.equal(result.ok, true);
    assert.equal(result.invocation.token, token);
    assert.match(result.invocation.sourcePath, /^DICTIONARY-/);
    assert.ok(result.invocation.sourceUrl.startsWith(`${result.sourceRootUrl}/`));
    assert.ok(result.invocation.sourceUrl.includes(`/blob/${result.sourceRevision}/docs/`));
    if (expectedSourceUrlSuffix) {
      assert.equal(result.invocation.sourceUrl, `${result.sourceRootUrl}${expectedSourceUrlSuffix}`);
    }
    assert.ok(result.invocation.content.includes(token));
  }
});

test("local MCP docs invocation resolves native sandbox policy routes from source dictionaries", { skip: !DOCS_AVAILABLE }, async () => {
  for (const token of ["/sandbox.policy.validate", "/sandbox.policy.authorize", "#agent-sandbox-policy", "@sandbox-policy"]) {
    const result = await runAgenticCanvasOsDocsInvokeTool({ token, includeContent: true }, {
      rootDir: KNOWGRPH_ROOT,
      env: DOCS_ENV,
    });
    assert.equal(result.ok, true);
    assert.equal(result.invocation.token, token);
    assert.ok(result.invocation.content.includes(token));
  }
});
