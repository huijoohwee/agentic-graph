import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runAgenticCanvasOsDocsInvokeTool } from "../agentic-canvas-os-docs-runtime.js";
import { runKnowledgeGraphTool } from "../knowledge-graph-host.js";
import {
  AGENTIC_CANVAS_OS_ROUTING_SCHEMA_ID,
  KNOWLEDGE_GRAPH_INVOCATION_SCHEMA_ID,
} from "../knowledge-graph-tool-contract.js";
import { KNOWLEDGE_GRAPH_TOOL_NAMES } from "../knowledge-graph/runtime.mjs";
import { SOURCE_PARSER_DESCRIPTORS } from "../knowledge-graph/source-parser-registry.mjs";

const ACTION = "/fixture.route";
const SEMANTIC = "#fixture-semantic";
const BINDING = "@fixture-binding";

const dictionary = (token, row) => (
  `---\ndictionary_entries:\n  - "${token}"\n---\n\n`
  + "| Token | Summary | Bindings | Semantics | Outcome |\n"
  + "|---|---|---|---|---|\n"
  + `${row}\n`
);

async function createCanonicalDocsFixture(root) {
  const repositoryRoot = path.join(root, "agentic-canvas-os");
  const docsRoot = path.join(repositoryRoot, "docs");
  await fs.mkdir(docsRoot, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(docsRoot, "FACTS.md"), "---\ntitle: Fixture\n---\n"),
    fs.writeFile(path.join(docsRoot, "DICTIONARY-COMMAND.md"), dictionary(
      ACTION,
      `| \`${ACTION}\` | Fixture route. | \`${BINDING}\` | \`${SEMANTIC}\` | \`${KNOWLEDGE_GRAPH_TOOL_NAMES.parserGenerate}\` |`,
    )),
    fs.writeFile(path.join(docsRoot, "DICTIONARY-SEMANTIC.md"), dictionary(
      SEMANTIC,
      `| \`${SEMANTIC}\` | Fixture semantic. | | | |`,
    )),
    fs.writeFile(path.join(docsRoot, "DICTIONARY-BINDING.md"), dictionary(
      BINDING,
      `| \`${BINDING}\` | Fixture binding. | | | |`,
    )),
    fs.writeFile(path.join(docsRoot, "LIVE-AGENT-PROVIDER-PROOF.md"), "---\nschema: unavailable\nstatus: unavailable\n---\n"),
    fs.writeFile(path.join(docsRoot, "PROGRESSIVE-AGENTS.md"), "---\nschema: unavailable\nstatus: unavailable\n---\n"),
  ]);
  execFileSync("git", ["init", "-q"], { cwd: repositoryRoot });
  execFileSync("git", ["add", "docs"], { cwd: repositoryRoot });
  execFileSync("git", [
    "-c", "user.name=Knowgrph Test",
    "-c", "user.email=test@knowgrph.local",
    "commit", "-qm", "source-backed catalog fixture",
  ], { cwd: repositoryRoot });
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  execFileSync("git", [
    "remote", "add", "origin", "https://github.com/huijoohwee/agentic-canvas-os.git",
  ], { cwd: repositoryRoot });
  execFileSync("git", ["update-ref", "refs/remotes/origin/main", revision], {
    cwd: repositoryRoot,
  });
  return { docsRoot, repositoryRoot };
}

test("knowledge-graph host verifies one exact invocation against the authoritative docs catalog", async (t) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-kg-invocation-"));
  t.after(() => fs.rm(temporaryRoot, { recursive: true, force: true }));
  const { docsRoot, repositoryRoot } = await createCanonicalDocsFixture(temporaryRoot);
  const env = { KNOWGRPH_AGENTIC_CANVAS_OS_DOCS_ROOT: docsRoot };
  const source = await runAgenticCanvasOsDocsInvokeTool({ token: ACTION }, {
    rootDir: repositoryRoot,
    env,
  });
  const invocation = {
    schema: KNOWLEDGE_GRAPH_INVOCATION_SCHEMA_ID,
    tool: KNOWLEDGE_GRAPH_TOOL_NAMES.parserGenerate,
    action: ACTION,
    semantics: [SEMANTIC],
    bindings: [BINDING],
    sourceRevision: source.sourceRevision,
    catalogDigest: source.catalogDigest,
    routingSchema: AGENTIC_CANVAS_OS_ROUTING_SCHEMA_ID,
    routingDigest: source.routingDigest,
  };

  const accepted = await runKnowledgeGraphTool(
    KNOWLEDGE_GRAPH_TOOL_NAMES.parserGenerate,
    { descriptors: SOURCE_PARSER_DESCRIPTORS, invocation },
    { rootDir: repositoryRoot, env },
  );
  assert.equal(accepted.ok, true, JSON.stringify(accepted));

  const forged = await runKnowledgeGraphTool(
    KNOWLEDGE_GRAPH_TOOL_NAMES.parserGenerate,
    {
      descriptors: SOURCE_PARSER_DESCRIPTORS,
      invocation: { ...invocation, routingDigest: "f".repeat(64) },
    },
    { rootDir: repositoryRoot, env },
  );
  assert.equal(forged.ok, false);
  assert.equal(forged.error.code, "invalid_invocation");
  assert.match(forged.error.message, /authoritative catalog|routing digest/i);
});
