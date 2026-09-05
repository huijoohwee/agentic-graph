import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { createAgentGraphRuntime, AGENT_GRAPH_TOOL_NAMES } from "../agent-graph/runtime.mjs";
import {
  readAgentGraphRepositoryIndex,
  readAgentGraphResolutionShards,
  readAgentGraphSnapshot,
  readAgentGraphSourceShard,
} from "../agent-graph/store.mjs";

const execFileAsync = promisify(execFile);

export async function writeFile(root, relativePath, contents) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, contents);
  return target;
}

export async function initializeRepository(repositoryPath) {
  await fs.mkdir(repositoryPath, { recursive: true });
  await execFileAsync("git", ["init", "--quiet", repositoryPath], {
    env: {
      PATH: String(process.env.PATH || ""),
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
    },
  });
}

export async function writeFakePythonRuntime(target, versionInfo, { failSources = false } = {}) {
  const encodedVersion = JSON.stringify(versionInfo);
  const sourceFailure = failSources
    ? [
        "  if (request.sourcePath !== '<python-runtime-probe>') {",
        "    process.stderr.write('synthetic source parse failure\\n');",
        "    process.exitCode = 2;",
        "    return;",
        "  }",
      ]
    : [];
  await fs.writeFile(target, [
    "#!/usr/bin/env node",
    "let input = '';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => { input += chunk; });",
    "process.stdin.on('end', () => {",
    "  const request = JSON.parse(input);",
    ...sourceFailure,
    `  process.stdout.write(JSON.stringify({ pythonVersionInfo: ${encodedVersion}, declarations: [], imports: [], calls: [], inherits: [], diagnostics: [] }));`,
    "});",
    "",
  ].join("\n"));
  await fs.chmod(target, 0o700);
}

export async function createFixture(t, { withPdfConverter = true } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "agentic-graph-kg-runtime-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const agenticGraphRoot = path.join(base, "host");
  const corpusRoot = path.join(base, "corpus");
  const outputRoot = path.join(agenticGraphRoot, "outputs");
  await fs.mkdir(agenticGraphRoot, { recursive: true });
  await initializeRepository(corpusRoot);
  await writeFile(corpusRoot, "src/db.ts", "export function load() { return 1; }\n");
  await writeFile(corpusRoot, "src/db/index.ts", "export function alternate() { return 2; }\n");
  await writeFile(corpusRoot, "src/app.ts", [
    'import { load } from "./db";',
    "export const multiline =",
    "  async () => load();",
    "",
  ].join("\n"));
  await writeFile(corpusRoot, "src/Service.java", [
    "public class Service",
    "{",
    "  public void run()",
    "  {",
    "  }",
    "}",
    "",
  ].join("\n"));
  await writeFile(corpusRoot, "lib.py", "class Service:\n    def run(self):\n        return 1\n");
  await writeFile(corpusRoot, "sql/accounts.sql", [
    "/* schema preface */",
    "CREATE TABLE IF NOT EXISTS accounts (",
    "  tenant_id INTEGER,",
    "  id INTEGER,",
    "  CONSTRAINT accounts_pk PRIMARY KEY (tenant_id, id)",
    ");",
    "",
  ].join("\n"));
  await writeFile(corpusRoot, "sql/users.sql", [
    "CREATE TABLE IF NOT EXISTS users (",
    "  tenant_id INTEGER,",
    "  account_id INTEGER,",
    "  CONSTRAINT users_fk FOREIGN KEY (tenant_id, account_id)",
    "    REFERENCES accounts(tenant_id, id)",
    ");",
    "",
  ].join("\n"));
  await writeFile(corpusRoot, "README.md", "# Corpus\n## Schema\n[Accounts](sql/accounts.sql)\n");
  await writeFile(corpusRoot, "config.json", '{"constructor":{"toString":"kept"},"credentials":{"value":"secret"}}\n');
  await writeFile(corpusRoot, "wrangler.toml", 'name = "fixture"\n[credentials]\nvalue = "secret"\n');
  await writeFile(corpusRoot, "paper.pdf", Buffer.from("%PDF-1.4\nlocal fixture\n%%EOF\n"));
  await writeFile(corpusRoot, "README.rst", "Corpus inventory fallback\n");
  await writeFile(corpusRoot, "assets/opaque.bin", Buffer.from([0, 1, 2, 3]));
  await initializeRepository(path.join(corpusRoot, "nested"));
  await writeFile(corpusRoot, "nested/schema.sql", "CREATE TABLE accounts (id INTEGER PRIMARY KEY);\n");
  let pdfCalls = 0;
  const runtime = createAgentGraphRuntime({
    agenticGraphRoot,
    allowedRoots: [corpusRoot],
    outputRoot,
    pdfConverter: withPdfConverter
      ? async () => {
        pdfCalls += 1;
        return "# Research\n## Page 1\nDeterministic PDF evidence\n";
      }
      : null,
    pdfConverterVersion: withPdfConverter ? "fixture-v1" : "pending",
  });
  return { base, agenticGraphRoot, corpusRoot, outputRoot, runtime, pdfCalls: () => pdfCalls };
}

export async function ingestFixture(fixture, extra = {}) {
  const result = await fixture.runtime.run(AGENT_GRAPH_TOOL_NAMES.ingest, {
    rootPath: fixture.corpusRoot,
    strict: true,
    ...extra,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

export function pointerPathFor(fixture, graphId) {
  return path.join(fixture.outputRoot, "graphs", `${graphId.slice("kg:graph:".length)}.json`);
}

export async function materializeFixture(fixture, ingest) {
  const snapshot = await readAgentGraphSnapshot(pointerPathFor(fixture, ingest.graphId), {
    allowedRoot: fixture.outputRoot,
    expectedGraphId: ingest.graphId,
  });
  const nodes = [];
  const edges = [];
  const sources = [];
  for (const repository of snapshot.manifest.repositories) {
    const index = await readAgentGraphRepositoryIndex(snapshot, repository);
    sources.push(...index.sources);
    for (const entry of index.sources) {
      const shard = await readAgentGraphSourceShard(snapshot, entry);
      nodes.push(...shard.nodes);
      edges.push(...shard.edges);
    }
    for await (const resolution of readAgentGraphResolutionShards(snapshot, index)) {
      edges.push(...resolution.edges);
    }
  }
  return { snapshot, nodes, edges, sources };
}
