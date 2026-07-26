import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import {
  AGENT_TEAM_HARD_BOUNDS,
  AGENT_TEAM_INVOCATION,
  AGENT_TEAM_TOOL_NAMES,
} from "../../contracts/agent-team.schema.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function createDocsFixture(rootDir) {
  const repositoryRoot = path.join(rootDir, "agentic-canvas-os");
  const docsRoot = path.join(repositoryRoot, "docs");
  await fs.mkdir(docsRoot, { recursive: true });
  const dictionary = (token) => `---\ndictionary_entries:\n  - ${token}\n---\n\n| Token | Meaning |\n|---|---|\n| \`${token}\` | Agent team fixture. |\n`;
  await Promise.all([
    fs.writeFile(path.join(docsRoot, "FACTS.md"), "---\ntitle: Fixture\n---\n"),
    fs.writeFile(path.join(docsRoot, "DICTIONARY-COMMAND.md"), dictionary(AGENT_TEAM_INVOCATION.command)),
    fs.writeFile(path.join(docsRoot, "DICTIONARY-SEMANTIC.md"), dictionary(AGENT_TEAM_INVOCATION.semantic)),
    fs.writeFile(path.join(docsRoot, "DICTIONARY-BINDING.md"), dictionary(AGENT_TEAM_INVOCATION.binding)),
    fs.writeFile(path.join(docsRoot, "LIVE-AGENT-PROVIDER-PROOF.md"), "---\nschema: unavailable\nstatus: unavailable\n---\n"),
    fs.writeFile(path.join(docsRoot, "PROGRESSIVE-AGENTS.md"), "---\nschema: unavailable\nstatus: unavailable\n---\n"),
  ]);
  execFileSync("git", ["init", "-q"], { cwd: repositoryRoot });
  execFileSync("git", ["add", "docs"], { cwd: repositoryRoot });
  execFileSync("git", [
    "-c", "user.name=Knowgrph Test",
    "-c", "user.email=test@knowgrph.local",
    "commit", "-qm", "agent team docs fixture",
  ], { cwd: repositoryRoot });
  const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
  execFileSync("git", [
    "remote", "add", "origin", "https://github.com/huijoohwee/agentic-canvas-os.git",
  ], { cwd: repositoryRoot });
  execFileSync("git", ["update-ref", "refs/remotes/origin/main", revision], { cwd: repositoryRoot });
  return { docsRoot, revision };
}

async function createTeamFixture(rootDir) {
  const sourcePath = path.join(
    repoRoot,
    "data/config/agents/agent-teams/collaborative-intelligence.json",
  );
  const document = JSON.parse(await fs.readFile(sourcePath, "utf8"));
  const targetPath = path.join(rootDir, document.source.uri);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(document, null, 2)}\n`);
  return document;
}

const startFakeOllama = async () => {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += String(chunk);
    requests.push(JSON.parse(raw));
    const call = requests.length;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      model: "agent-team-test-model",
      message: {
        content: JSON.stringify({
          output: call === 4
            ? "Manager final synthesis from both specialists."
            : `Bounded local role output ${call}.`,
        }),
      },
      prompt_eval_count: 20,
      eval_count: 10,
    }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    requests,
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

test("canonical local stdio MCP plans and completes the registered team through the host-owned local model adapter", async (t) => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-agent-team-stdio-"));
  const docsFixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-agent-team-docs-"));
  t.after(() => fs.rm(runtimeRoot, { recursive: true, force: true }));
  t.after(() => fs.rm(docsFixtureRoot, { recursive: true, force: true }));
  const [{ docsRoot, revision }, team] = await Promise.all([
    createDocsFixture(docsFixtureRoot),
    createTeamFixture(runtimeRoot),
  ]);
  const ollama = await startFakeOllama();
  t.after(() => ollama.close());
  const client = new Client({ name: "knowgrph-agent-team-e2e", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "mcp", "server.js")],
    cwd: repoRoot,
    env: {
      PATH: String(process.env.PATH || ""),
      HOME: String(process.env.HOME || ""),
      NODE_ENV: "test",
      KNOWGRPH_ROOT: runtimeRoot,
      KNOWGRPH_AGENTIC_CANVAS_OS_DOCS_ROOT: docsRoot,
      KNOWGRPH_AGENTIC_CANVAS_OS_DOCS_REVISION: revision,
      KNOWGRPH_AGENTIC_CANVAS_OS_LIVE_PROOF_REVISION: revision,
      KNOWGRPH_AGENT_TEAM_MODEL: "agent-team-test-model",
      KNOWGRPH_AGENT_TEAM_MODEL_URL: ollama.url,
      KNOWGRPH_AGENT_TEAM_MODEL_TIMEOUT_MS: "5000",
      KNOWGRPH_AGENT_TEAM_MODEL_MAX_OUTPUT_TOKENS: "256",
    },
    stderr: "pipe",
  });
  let stderrText = "";
  transport.stderr?.on("data", (chunk) => { stderrText += String(chunk); });
  try {
    await client.connect(transport, { timeout: 10_000 });
    const listed = await client.listTools(undefined, { timeout: 10_000 });
    const definitions = Object.values(AGENT_TEAM_TOOL_NAMES).map((name) => listed.tools.find((tool) => tool.name === name));
    assert.equal(definitions.every(Boolean), true, stderrText);
    assert.equal(definitions[0].annotations.readOnlyHint, true);
    assert.equal(definitions[1].annotations.readOnlyHint, false);
    assert.equal(definitions[2].annotations.readOnlyHint, true);
    assert.equal(definitions[3].inputSchema.properties.action.enum.includes("record_review"), true);
    assert.equal(definitions.every((definition) => Boolean(definition.outputSchema)), true);

    const planInput = {
      invocation: {
        command: AGENT_TEAM_INVOCATION.command,
        semantic: AGENT_TEAM_INVOCATION.semantic,
        binding: AGENT_TEAM_INVOCATION.binding,
        sourceRevision: revision,
      },
      teamSource: { ...team.source },
      requestedTask: "Produce one bounded result.",
      bounds: { ...AGENT_TEAM_HARD_BOUNDS },
      idempotencyKey: "stdio-plan-idempotency",
    };
    const planned = await client.callTool({
      name: AGENT_TEAM_TOOL_NAMES.plan,
      arguments: planInput,
    }, undefined, { timeout: 10_000 });
    assert.equal(planned.isError, false, `${JSON.stringify(planned.structuredContent)}\n${stderrText}`);
    assert.equal(planned.structuredContent.ok, true);
    assert.equal(planned.structuredContent.usage.turns, 0);

    const started = await client.callTool({
      name: AGENT_TEAM_TOOL_NAMES.start,
      arguments: {
        planId: planned.structuredContent.result.planId,
        planDigest: planned.structuredContent.planDigest,
        teamRevision: planned.structuredContent.teamRevision,
        expectedStateVersion: 1,
        idempotencyKey: "stdio-start-idempotency",
      },
    }, undefined, { timeout: 20_000 });
    assert.equal(started.isError, false, stderrText);
    assert.equal(started.structuredContent.state, "completed");
    assert.equal(
      started.structuredContent.result.finalAnswer,
      "Manager final synthesis from both specialists.",
    );
    assert.equal(started.structuredContent.usage.turns, 2);
    assert.equal(started.structuredContent.usage.costUsd, 0);
    assert.equal(ollama.requests.length, 4);

    const replayed = await client.callTool({
      name: AGENT_TEAM_TOOL_NAMES.start,
      arguments: {
        planId: planned.structuredContent.result.planId,
        planDigest: planned.structuredContent.planDigest,
        teamRevision: planned.structuredContent.teamRevision,
        expectedStateVersion: 1,
        idempotencyKey: "stdio-start-idempotency",
      },
    }, undefined, { timeout: 10_000 });
    assert.deepEqual(replayed.structuredContent, started.structuredContent);
    assert.equal(ollama.requests.length, 4);

    const runs = await client.callTool({
      name: AGENT_TEAM_TOOL_NAMES.list,
      arguments: {},
    }, undefined, { timeout: 10_000 });
    assert.equal(runs.isError, false, stderrText);
    assert.equal(runs.structuredContent.result.runs.length, 1);
    assert.equal(runs.structuredContent.result.runs[0].state, "completed");
  } finally {
    await client.close().catch(() => undefined);
  }
});
