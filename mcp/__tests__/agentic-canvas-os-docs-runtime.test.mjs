import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
  buildAgenticCanvasOsDocsRoutingDigest,
  buildAgenticCanvasOsDocsInvokePayload,
  buildProgressiveAgentsReadinessSummary,
} from "../agentic-canvas-os-docs-core.mjs";
import { buildAgenticGraphLocalMcpToolDefinitions, AGENTIC_OS_LOCAL_MCP_TOOL_NAMES } from "../local-tool-contract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENTIC_OS_ROOT = path.resolve(__dirname, "..", "..");
const DOCS_ENV = process.env.AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT
  ? { AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT: path.resolve(process.env.AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT) }
  : {};
const DOCS_ROOT = (() => {
  try {
    return resolveAgenticCanvasOsDocsRoot({ rootDir: AGENTIC_OS_ROOT, env: DOCS_ENV });
  } catch (error) {
    if (DOCS_ENV.AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT) throw error;
    return "";
  }
})();
const DOCS_AVAILABLE = Boolean(DOCS_ROOT) && existsSync(path.join(DOCS_ROOT, "DICTIONARY-COMMAND.md"));

test("Agentic Canvas OS docs root resolves from explicit configuration or an ancestor workspace", { skip: !DOCS_AVAILABLE }, () => {
  assert.equal(resolveAgenticCanvasOsDocsRoot({ rootDir: AGENTIC_OS_ROOT, env: DOCS_ENV }), DOCS_ROOT);
});

test("linked agentic-graph worktrees resolve the canonical ancestor Agentic Canvas OS docs root", () => {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "agentic-graph-docs-root-"));
  const docsRoot = path.join(workspaceRoot, "agentic-os", "catalog", "dictionaries");
  const taskRoot = path.join(workspaceRoot, ".worktrees", "agentic-graph", "xr-invocation-runtime");
  try {
    mkdirSync(docsRoot, { recursive: true });
    mkdirSync(taskRoot, { recursive: true });
    writeFileSync(path.join(docsRoot, "DICTIONARY-COMMAND.md"), "# Source marker\n");
    assert.equal(realpathSync(resolveAgenticCanvasOsDocsRoot({ rootDir: taskRoot, env: {} })), realpathSync(docsRoot));
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("registered external agentic-graph worktrees recover the canonical docs root from Git metadata", () => {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "agentic-graph-external-docs-root-"));
  const externalParent = mkdtempSync(path.join(tmpdir(), "agentic-graph-external-worktree-"));
  const repositoryRoot = path.join(workspaceRoot, "agentic-graph");
  const docsRoot = path.join(workspaceRoot, "agentic-os", "catalog", "dictionaries");
  const taskRoot = path.join(externalParent, "xr-invocation-runtime");
  try {
    mkdirSync(repositoryRoot, { recursive: true });
    mkdirSync(docsRoot, { recursive: true });
    writeFileSync(path.join(repositoryRoot, "README.md"), "# agentic-graph fixture\n");
    writeFileSync(path.join(docsRoot, "DICTIONARY-COMMAND.md"), "# Source marker\n");
    execFileSync("git", ["init", "-q"], { cwd: repositoryRoot });
    execFileSync("git", ["add", "README.md"], { cwd: repositoryRoot });
    execFileSync("git", ["-c", "user.name=agentic-graph Test", "-c", "user.email=test@agentic-graph.local", "commit", "-qm", "test source"], { cwd: repositoryRoot });
    execFileSync("git", ["worktree", "add", "--detach", taskRoot, "HEAD"], { cwd: repositoryRoot, stdio: "ignore" });
    assert.equal(realpathSync(resolveAgenticCanvasOsDocsRoot({ rootDir: taskRoot, env: {} })), realpathSync(docsRoot));
  } finally {
    rmSync(externalParent, { recursive: true, force: true });
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("configured docs revision must match checkout HEAD with a clean docs tree", async () => {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "agentic-graph-docs-revision-"));
  const repositoryRoot = path.join(workspaceRoot, "agentic-os");
  const docsRoot = path.join(repositoryRoot, "catalog", "dictionaries");
  try {
    mkdirSync(docsRoot, { recursive: true });
    writeFileSync(path.join(docsRoot, "DICTIONARY-COMMAND.md"), "# Canonical bytes\n");
    execFileSync("git", ["init", "-q"], { cwd: repositoryRoot });
    execFileSync("git", ["add", "catalog/dictionaries/DICTIONARY-COMMAND.md"], { cwd: repositoryRoot });
    execFileSync("git", ["-c", "user.name=agentic-graph Test", "-c", "user.email=test@agentic-graph.local", "commit", "-qm", "test docs"], { cwd: repositoryRoot });
    const headRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
    execFileSync("git", ["remote", "add", "origin", "https://github.com/huijoohwee/agentic-os.git"], { cwd: repositoryRoot });
    execFileSync("git", ["update-ref", "refs/remotes/origin/main", headRevision], { cwd: repositoryRoot });

    await assert.rejects(
      resolveAgenticCanvasOsDocsRevision({
        absoluteDocsRoot: docsRoot,
        env: { AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_REVISION: "b".repeat(40) },
      }),
      /does not match docs checkout HEAD/,
    );

    writeFileSync(path.join(docsRoot, "DICTIONARY-COMMAND.md"), "# Dirty bytes\n");
    await assert.rejects(
      resolveAgenticCanvasOsDocsRevision({
        absoluteDocsRoot: docsRoot,
        env: { AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_REVISION: headRevision },
      }),
      /uncommitted content/,
    );
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("docs revision rejects an arbitrary synthetic repository with no canonical origin", async () => {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "agentic-graph-docs-untrusted-"));
  const repositoryRoot = path.join(workspaceRoot, "agentic-os");
  const docsRoot = path.join(repositoryRoot, "catalog", "dictionaries");
  try {
    mkdirSync(docsRoot, { recursive: true });
    writeFileSync(path.join(docsRoot, "DICTIONARY-COMMAND.md"), "# Forged source marker\n");
    execFileSync("git", ["init", "-q"], { cwd: repositoryRoot });
    execFileSync("git", ["add", "catalog/dictionaries/DICTIONARY-COMMAND.md"], { cwd: repositoryRoot });
    execFileSync("git", [
      "-c", "user.name=agentic-graph Test",
      "-c", "user.email=test@agentic-graph.local",
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
        env: { AGENTIC_OS_AGENTIC_CANVAS_OS_DOCS_ROOT: docsRoot },
      }),
      (error) => {
        assert.equal(error.code, "docs_source_authority_unverified");
        assert.equal(error.message, "Agentic OS docs source authority could not be verified.");
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
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "agentic-graph-docs-canonical-origin-"));
  const repositoryRoot = path.join(workspaceRoot, "agentic-os");
  const docsRoot = path.join(repositoryRoot, "catalog", "dictionaries");
  try {
    mkdirSync(docsRoot, { recursive: true });
    writeFileSync(path.join(docsRoot, "DICTIONARY-COMMAND.md"), "# Canonical source marker\n");
    execFileSync("git", ["init", "-q"], { cwd: repositoryRoot });
    execFileSync("git", ["add", "catalog/dictionaries/DICTIONARY-COMMAND.md"], { cwd: repositoryRoot });
    execFileSync("git", [
      "-c", "user.name=agentic-graph Test",
      "-c", "user.email=test@agentic-graph.local",
      "commit", "-qm", "canonical docs",
    ], { cwd: repositoryRoot });
    const headRevision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
    execFileSync("git", ["remote", "add", "origin", "https://github.com/huijoohwee/agentic-os.git"], { cwd: repositoryRoot });
    execFileSync("git", ["update-ref", "refs/remotes/origin/main", headRevision], { cwd: repositoryRoot });

    for (const remoteUrl of [
      "https://github.com/huijoohwee/agentic-os.git",
      "git@github.com:huijoohwee/agentic-os.git",
      "ssh://git@github.com/huijoohwee/agentic-os.git",
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
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), "agentic-graph-docs-ahead-"));
  const repositoryRoot = path.join(workspaceRoot, "agentic-os");
  const docsRoot = path.join(repositoryRoot, "catalog", "dictionaries");
  try {
    mkdirSync(docsRoot, { recursive: true });
    writeFileSync(path.join(docsRoot, "DICTIONARY-COMMAND.md"), "# Canonical source marker\n");
    execFileSync("git", ["init", "-q"], { cwd: repositoryRoot });
    execFileSync("git", ["add", "catalog/dictionaries/DICTIONARY-COMMAND.md"], { cwd: repositoryRoot });
    execFileSync("git", [
      "-c", "user.name=agentic-graph Test",
      "-c", "user.email=test@agentic-graph.local",
      "commit", "-qm", "fetched docs",
    ], { cwd: repositoryRoot });
    const fetchedRevision = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
    execFileSync("git", ["remote", "add", "origin", "https://github.com/huijoohwee/agentic-os.git"], { cwd: repositoryRoot });
    execFileSync("git", ["update-ref", "refs/remotes/origin/main", fetchedRevision], { cwd: repositoryRoot });
    writeFileSync(path.join(docsRoot, "DICTIONARY-COMMAND.md"), "# Unfetched local source marker\n");
    execFileSync("git", ["add", "catalog/dictionaries/DICTIONARY-COMMAND.md"], { cwd: repositoryRoot });
    execFileSync("git", [
      "-c", "user.name=agentic-graph Test",
      "-c", "user.email=test@agentic-graph.local",
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
  const definitions = buildAgenticGraphLocalMcpToolDefinitions();
  const descriptor = definitions.find((tool) => tool.name === AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME);

  assert.ok(descriptor, "docs invocation descriptor must exist");
  assert.equal(AGENTIC_OS_LOCAL_MCP_TOOL_NAMES.agenticCanvasOsDocsInvoke, AGENTIC_CANVAS_OS_DOCS_MCP_TOOL_NAME);
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

test("docs catalog derives MCP tool, semantics, and bindings from the command dictionary row", () => {
  const catalog = buildAgenticCanvasOsDocsCatalog({
    "FACTS.md": "",
    "DICTIONARY-COMMAND.md": [
      "---",
      "dictionary_entries:",
      "  - /source.ingest",
      "---",
      "| Command | Intent | Bindings | Semantics | Outcome |",
      "| --- | --- | --- | --- | --- |",
      "| `/source.ingest` | Build the selected source graph | `@source.root` | `#source.graph` | `agentic-graph.source.ingest` returns a graph and `agentic-graph.source.inspect` returns its proof |",
    ].join("\n"),
    "DICTIONARY-SEMANTIC.md": "---\ndictionary_entries:\n  - #source.graph\n---\n| `#source.graph` | Source graph |",
    "DICTIONARY-BINDING.md": "---\ndictionary_entries:\n  - @source.root\n---\n| `@source.root` | Source root |",
  });
  const command = catalog.find((entry) => entry.token === "/source.ingest");

  assert.equal(command?.summary, "Build the selected source graph");
  assert.equal(command?.mcpTool, "agentic-graph.source.ingest");
  assert.deepEqual(command?.mcpTools, ["agentic-graph.source.ingest", "agentic-graph.source.inspect"]);
  assert.deepEqual(command?.semantics, ["#source.graph"]);
  assert.deepEqual(command?.bindings, ["@source.root"]);
});

test("docs catalog preserves the canonical trailing-colon Import URL binding", () => {
  const catalog = buildAgenticCanvasOsDocsCatalog({
    "FACTS.md": "",
    "DICTIONARY-COMMAND.md": [
      "---",
      "dictionary_entries:",
      '  - "/ingest-url"',
      "---",
      "| Command | Intent | Bindings | Semantics | Outcome |",
      "| --- | --- | --- | --- | --- |",
      "| `/ingest-url` | Import one URL | `@url:`, `@reference-policy` | `#canvas` | `agentic-graph.control_local_import_url` returns one typed result |",
    ].join("\n"),
    "DICTIONARY-SEMANTIC.md": "---\ndictionary_entries:\n  - \"#canvas\"\n---\n| `#canvas` | Canvas |",
    "DICTIONARY-BINDING.md": [
      "---",
      "dictionary_entries:",
      '  - "@url:"',
      '  - "@reference-policy"',
      "---",
      "| `@url:` | URL value |",
      "| `@reference-policy` | Reference policy |",
    ].join("\n"),
  });
  const command = catalog.find((entry) => entry.token === "/ingest-url");

  assert.deepEqual(command?.bindings, ["@url:", "@reference-policy"]);
  assert.equal(catalog.some((entry) => entry.token === "@url:"), true);
  assert.equal(catalog.some((entry) => entry.token === "@url"), false);
});

test("docs catalog derives the canonical Canvas View command tuple and MCP owner", { skip: !DOCS_AVAILABLE }, () => {
  const docsContentByFileName = Object.fromEntries([
    "DICTIONARY-COMMAND.md",
    "DICTIONARY-SEMANTIC.md",
    "DICTIONARY-BINDING.md",
  ].map(fileName => [fileName, readFileSync(path.join(DOCS_ROOT, fileName), "utf8")]));
  const catalog = buildAgenticCanvasOsDocsCatalog(docsContentByFileName);
  const command = catalog.find(entry => entry.token === "/canvas.view.set");

  assert.equal(command?.mcpTool, "agentic-graph.control_local_canvas_view");
  assert.deepEqual(command?.mcpTools, ["agentic-graph.control_local_canvas_view"]);
  assert.deepEqual(command?.semantics, ["#canvas-view"]);
  assert.deepEqual(command?.bindings, ["@canvas-view"]);
  assert.equal(catalog.some(entry => entry.token === "#canvas-view"), true);
  assert.equal(catalog.some(entry => entry.token === "@canvas-view"), true);
});

test("docs catalog derives the canonical Canvas Interaction command tuple and MCP owner", { skip: !DOCS_AVAILABLE }, () => {
  const docsContentByFileName = Object.fromEntries([
    "DICTIONARY-COMMAND.md",
    "DICTIONARY-SEMANTIC.md",
    "DICTIONARY-BINDING.md",
  ].map(fileName => [fileName, readFileSync(path.join(DOCS_ROOT, fileName), "utf8")]));
  const catalog = buildAgenticCanvasOsDocsCatalog(docsContentByFileName);
  const command = catalog.find(entry => entry.token === "/canvas.interaction.tune");

  assert.equal(command?.mcpTool, "agentic-graph.control_local_canvas_interaction");
  assert.deepEqual(command?.mcpTools, ["agentic-graph.control_local_canvas_interaction"]);
  assert.equal(command?.semantics.includes("#canvas-interaction"), true);
  assert.equal(command?.bindings.includes("@canvas"), true);
  assert.equal(catalog.some(entry => entry.token === "#canvas-interaction"), true);
  assert.equal(catalog.some(entry => entry.token === "@canvas"), true);
});

test("docs catalog derives the canonical Workspace Launch command tuple and MCP owner", { skip: !DOCS_AVAILABLE }, () => {
  const docsContentByFileName = Object.fromEntries([
    "DICTIONARY-COMMAND.md",
    "DICTIONARY-SEMANTIC.md",
    "DICTIONARY-BINDING.md",
  ].map(fileName => [fileName, readFileSync(path.join(DOCS_ROOT, fileName), "utf8")]));
  const catalog = buildAgenticCanvasOsDocsCatalog(docsContentByFileName);
  const command = catalog.find(entry => entry.token === "/workspace.launch");

  assert.equal(command?.mcpTool, "agentic-graph.control_local_workspace_launch");
  assert.deepEqual(command?.mcpTools, ["agentic-graph.control_local_workspace_launch"]);
  assert.deepEqual(command?.semantics, ["#workspace-launch"]);
  assert.deepEqual(command?.bindings, ["@canvas"]);
  assert.equal(catalog.some(entry => entry.token === "#workspace-launch"), true);
  assert.equal(catalog.some(entry => entry.token === "@canvas"), true);
});

test("docs catalog derives the canonical Main Toolbar command tuple and MCP owner", { skip: !DOCS_AVAILABLE }, () => {
  const docsContentByFileName = Object.fromEntries([
    "DICTIONARY-COMMAND.md",
    "DICTIONARY-SEMANTIC.md",
    "DICTIONARY-BINDING.md",
  ].map(fileName => [fileName, readFileSync(path.join(DOCS_ROOT, fileName), "utf8")]));
  const catalog = buildAgenticCanvasOsDocsCatalog(docsContentByFileName);
  const command = catalog.find(entry => entry.token === "/toolbar.invoke");

  assert.equal(command?.mcpTool, "agentic-graph.control_local_toolbar_action");
  assert.deepEqual(command?.mcpTools, ["agentic-graph.control_local_toolbar_action"]);
  assert.deepEqual(command?.semantics, ["#toolbar-action"]);
  assert.deepEqual(command?.bindings, ["@canvas"]);
  assert.equal(catalog.some(entry => entry.token === "#toolbar-action"), true);
  assert.equal(catalog.some(entry => entry.token === "@canvas"), true);
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
  assert.equal(
    buildAgenticCanvasOsDocsCatalogDigest([entries[0], {
      ...entries[1],
      mcpTool: "agentic-graph.source.ingest",
      semantics: ["#known"],
      bindings: ["@known"],
    }]),
    digest,
  );
  assert.notEqual(
    buildAgenticCanvasOsDocsRoutingDigest(entries),
    buildAgenticCanvasOsDocsRoutingDigest([entries[0], {
      ...entries[1],
      mcpTools: ["agentic-graph.source.ingest", "agentic-graph.source.inspect"],
      semantics: ["#known"],
      bindings: ["@known"],
    }]),
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

test("local MCP docs invocation catalogs /, #, and @ entries from source docs", { skip: !DOCS_AVAILABLE }, async () => {
  const result = await runAgenticCanvasOsDocsInvokeTool({ limit: 500 }, {
    rootDir: AGENTIC_OS_ROOT,
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
    `https://github.com/huijoohwee/agentic-os/blob/${result.sourceRevision}/catalog/dictionaries`,
  );
  assert.ok(
    result.catalog.every((entry) => entry.sourceUrl.startsWith(`${result.sourceRootUrl}/`)),
    "runtime catalog source URLs must share the exact source revision",
  );
  // This immutable historical paid-provider observation cannot promote the migrated free core.
  assert.equal(result.liveAgentProviderProof.status, "unavailable");
  assert.equal(result.liveAgentProviderProof.sourceStatus, "historical-snapshot");
  assert.equal(result.liveAgentProviderProof.proofRevision, "dae927d40f3e8e55687334ed47c2be5dffe14b36");
  assert.equal(result.liveAgentProviderProof.sourceUrl,
    "https://github.com/huijoohwee/agentic-canvas-os/blob/dae927d40f3e8e55687334ed47c2be5dffe14b36/docs/LIVE-AGENT-PROVIDER-PROOF.md");
  assert.equal(result.progressiveAgentsReadiness.status, "unavailable");
  assert.equal(result.progressiveAgentsReadiness.contractReady, false);
  assert.equal(result.progressiveAgentsReadiness.configured, null);
  assert.equal(result.progressiveAgentsReadiness.sourcePath, "runtime/agents/docs/PROGRESSIVE-AGENTS.md");
  assert.equal(result.progressiveAgentsReadiness.sourceUrl,
    `https://github.com/huijoohwee/agentic-os/blob/${result.sourceRevision}/runtime/agents/docs/PROGRESSIVE-AGENTS.md`);
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
      rootDir: AGENTIC_OS_ROOT,
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
      rootDir: AGENTIC_OS_ROOT,
      env: DOCS_ENV,
    });

    assert.equal(result.ok, true);
    assert.equal(result.invocation.token, token);
    assert.match(result.invocation.sourcePath, /^DICTIONARY-/);
    assert.ok(result.invocation.sourceUrl.startsWith(`${result.sourceRootUrl}/`));
    assert.ok(result.invocation.sourceUrl.includes(`/blob/${result.sourceRevision}/catalog/dictionaries/`));
    if (expectedSourceUrlSuffix) {
      assert.equal(result.invocation.sourceUrl, `${result.sourceRootUrl}${expectedSourceUrlSuffix}`);
    }
    assert.ok(result.invocation.content.includes(token));
  }
});

test("local MCP docs invocation resolves native sandbox policy routes from source dictionaries", { skip: !DOCS_AVAILABLE }, async () => {
  for (const token of ["/sandbox.policy.validate", "/sandbox.policy.authorize", "#agent-sandbox-policy", "@sandbox-policy"]) {
    const result = await runAgenticCanvasOsDocsInvokeTool({ token, includeContent: true }, {
      rootDir: AGENTIC_OS_ROOT,
      env: DOCS_ENV,
    });
    assert.equal(result.ok, true);
    assert.equal(result.invocation.token, token);
    assert.ok(result.invocation.content.includes(token));
  }
});
