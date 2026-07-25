import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import {
  AGENT_TEAM_HARD_BOUNDS,
  AGENT_TEAM_INVOCATION,
  AGENT_TEAM_SOURCE_SCHEMA,
  AGENT_TEAM_TOOL_NAMES,
} from "../../contracts/agent-team.schema.js";
import { digestAgentTeamSourceDocument } from "../agent-team-source.js";

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
  return { docsRoot, revision };
}

async function createTeamFixture(rootDir) {
  const uri = "teams/stdio-team.json";
  const document = {
    schema: AGENT_TEAM_SOURCE_SCHEMA,
    teamId: "team.stdio",
    teamRevision: "team-revision-1",
    source: { uri, digest: "0".repeat(64) },
    manager: {
      participantId: "lead",
      agentId: "agent.lead",
      agentRevision: "agent-revision-1",
      role: "Coordinator",
      goal: "Own the exact workflow result.",
      persona: "Concise.",
    },
    specialists: [{
      participantId: "research",
      agentId: "agent.research",
      agentRevision: "agent-revision-1",
      role: "Research specialist",
      goal: "Return evidence.",
      persona: "Precise.",
    }],
    workflow: {
      workflowId: "workflow.stdio",
      workflowRevision: "workflow-revision-1",
      allowedBranchIds: ["delegate-research"],
    },
    reviewPolicy: {
      policyId: "review.standard",
      policyRevision: "review-revision-1",
    },
    bounds: { ...AGENT_TEAM_HARD_BOUNDS },
  };
  document.source.digest = digestAgentTeamSourceDocument(document);
  await fs.mkdir(path.join(rootDir, "teams"), { recursive: true });
  await fs.writeFile(path.join(rootDir, uri), `${JSON.stringify(document, null, 2)}\n`);
  return document;
}

test("canonical local stdio MCP registers all four tools but fails plan without a host reference verifier", async (t) => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-agent-team-stdio-"));
  const docsFixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-agent-team-docs-"));
  t.after(() => fs.rm(runtimeRoot, { recursive: true, force: true }));
  t.after(() => fs.rm(docsFixtureRoot, { recursive: true, force: true }));
  const [{ docsRoot, revision }, team] = await Promise.all([
    createDocsFixture(docsFixtureRoot),
    createTeamFixture(runtimeRoot),
  ]);
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
      KNOWGRPH_AGENT_TEAM_ADAPTER_ID: "",
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
    assert.equal(planned.isError, true, stderrText);
    assert.equal(planned.structuredContent.ok, false);
    assert.equal(planned.structuredContent.error.code, "reference_verifier_unavailable");
    assert.equal(planned.structuredContent.usage.turns, 0);

    const runs = await client.callTool({
      name: AGENT_TEAM_TOOL_NAMES.list,
      arguments: {},
    }, undefined, { timeout: 10_000 });
    assert.equal(runs.isError, false, stderrText);
    assert.deepEqual(runs.structuredContent.result.runs, []);
  } finally {
    await client.close().catch(() => undefined);
  }
});
