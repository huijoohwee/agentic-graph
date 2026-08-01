import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverKnowledgeSources } from "../knowledge-graph/discovery.mjs";
import { createKnowledgeGraphRuntime } from "../knowledge-graph/runtime.mjs";
import { pythonRuntimeGrammarValidationSource } from "../knowledge-graph/python-syntax-recovery.mjs";
import {
  readKnowledgeGraphRepositoryIndex,
  readKnowledgeGraphSnapshot,
  readKnowledgeGraphSourceShard,
} from "../knowledge-graph/store.mjs";

async function writeLegacyPythonRuntime(rootPath) {
  const executable = path.join(rootPath, "legacy-python-runtime");
  await fs.writeFile(executable, [
    "#!/usr/bin/env node",
    "let input = '';",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', chunk => { input += chunk; });",
    "process.stdin.on('end', () => {",
    "  const request = JSON.parse(input);",
    "  const source = String(request.text || '');",
    "  const syntaxLine = source.split('\\n').findIndex((line) => (",
    "    line.includes('match value:') || line.includes('except* ValueError:') || line.includes('def broken(')",
    "  )) + 1;",
    "  const diagnostics = syntaxLine > 0 ? [{",
    "    code: 'python_syntax_error',",
    "    message: 'invalid syntax',",
    "    lineStart: syntaxLine,",
    "    lineEnd: syntaxLine,",
    "    columnStart: 5,",
    "    columnEnd: 10,",
    "  }] : [];",
    "  process.stdout.write(JSON.stringify({",
    "    pythonVersionInfo: [3, 9, 6, 'final', 0],",
    "    declarations: [], imports: [], calls: [], inherits: [], diagnostics,",
    "  }));",
    "});",
    "",
  ].join("\n"));
  await fs.chmod(executable, 0o700);
  return executable;
}

function pointerPath(outputRoot, graphId) {
  return path.join(outputRoot, "graphs", `${graphId.slice("kg:graph:".length)}.json`);
}

async function sourceShard(outputRoot, result, sourcePath) {
  const snapshot = await readKnowledgeGraphSnapshot(pointerPath(outputRoot, result.graphId), {
    allowedRoot: outputRoot,
    expectedGraphId: result.graphId,
  });
  const repository = snapshot.manifest.repositories[0];
  const index = await readKnowledgeGraphRepositoryIndex(snapshot, repository);
  const source = index.sources.find((entry) => entry.sourcePath === sourcePath);
  assert.ok(source, `missing persisted source ${sourcePath}`);
  return readKnowledgeGraphSourceShard(snapshot, source);
}

test("discovery keeps invalid UTF-8 NUL payloads out of text parser routes", async (t) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-text-classification-"));
  t.after(() => fs.rm(rootPath, { recursive: true, force: true }));
  await fs.writeFile(path.join(rootPath, "masquerading.ts"), Buffer.from([0x00, 0xff, 0xfe, 0x61]));
  const discovered = await discoverKnowledgeSources({ rootPath });
  const source = discovered.sources.find((entry) => entry.relativePath === "masquerading.ts");
  assert.equal(source?.status, "unsupported");
  assert.equal(source?.diagnostics[0]?.code, "binary_unsupported");
  assert.equal(discovered.admission.complete, false);
});

test("embedded-NUL text admission validates UTF-8 beyond the binary sniff prefix", async (t) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-text-classification-late-invalid-"));
  t.after(() => fs.rm(rootPath, { recursive: true, force: true }));
  await fs.writeFile(path.join(rootPath, "masquerading.ts"), Buffer.concat([
    Buffer.from("export const separator = '\0';\n/*"),
    Buffer.alloc(9_000, 0x61),
    Buffer.from("*/\n"),
    Buffer.from([0xff]),
  ]));
  const discovered = await discoverKnowledgeSources({ rootPath });
  const source = discovered.sources.find((entry) => entry.relativePath === "masquerading.ts");
  assert.equal(source?.status, "unsupported");
  assert.equal(source?.diagnostics[0]?.code, "binary_unsupported");
  assert.equal(discovered.admission.complete, false);
});

test("Python recovery validation preserves unrelated malformed syntax", () => {
  const source = {
    text: [
      "match value:",
      "    case _:",
      "        pass",
      "",
      "def broken(",
    ].join("\n"),
  };
  const transformed = pythonRuntimeGrammarValidationSource({
    source,
    diagnostics: [{ code: "python_syntax_error", lineStart: 1 }],
    pythonVersionInfo: [3, 9, 6, "final", 0],
  });
  assert.match(String(transformed), /^if \(value\) is not None:/m);
  assert.match(String(transformed), /def broken\(/);
});

test("strict ingest accepts textual NULs and recovers newer Python grammar locally", async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-ingest-recovery-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const corpusRoot = path.join(base, "corpus");
  const outputRoot = path.join(base, "output");
  await fs.mkdir(corpusRoot, { recursive: true });
  await fs.writeFile(path.join(corpusRoot, "README.md"), "# Baseline\n");
  const runtime = createKnowledgeGraphRuntime({
    knowgrphRoot: base,
    allowedRoots: [corpusRoot],
    outputRoot,
    pythonBin: await writeLegacyPythonRuntime(base),
  });

  const baseline = await runtime.ingest({ rootPath: corpusRoot, strict: true });
  assert.equal(baseline.ok, true, JSON.stringify(baseline));
  const previousPointer = await fs.readFile(pointerPath(outputRoot, baseline.graphId), "utf8");
  await fs.mkdir(path.join(corpusRoot, "src"), { recursive: true });
  await fs.writeFile(path.join(corpusRoot, "src", "sync.ts"), "export const separator = '\0';\n");
  await fs.writeFile(path.join(corpusRoot, "src", "modern.py"), [
    "from utilities import normalize",
    "class Router:",
    "",
    "    def resolve(self, value):",
    "        match value:",
    "            case _:",
    "                return normalize(value)",
    "",
  ].join("\n"));
  await fs.writeFile(path.join(corpusRoot, "src", "groups.py"), [
    "def partition():",
    "    try:",
    "        pass",
    "    except* ValueError:",
    "        return 'invalid'",
    "",
  ].join("\n"));

  const recovered = await runtime.ingest({ rootPath: corpusRoot, strict: true });
  assert.equal(recovered.ok, true, JSON.stringify(recovered));
  assert.equal(recovered.complete, true);
  assert.deepEqual(recovered.completeness.incompleteSources, []);
  assert.deepEqual(recovered.completeness.reasons, []);
  assert.notEqual(
    await fs.readFile(pointerPath(outputRoot, recovered.graphId), "utf8"),
    previousPointer,
  );

  const typeScript = await sourceShard(outputRoot, recovered, "src/sync.ts");
  assert.equal(typeScript.status, "parsed");
  const python = await sourceShard(outputRoot, recovered, "src/modern.py");
  assert.equal(python.status, "parsed");
  assert.ok(python.diagnostics.some((diagnostic) => diagnostic.code === "python_runtime_grammar_recovered"));
  assert.ok(python.nodes.some((node) => (
    node.type === "SourceFile" && node.properties["corpus:parserFidelity"] === "lexical-recovery"
  )));
  assert.ok(python.nodes.some((node) => node.type === "CodeClass" && node.label === "Router"));
  assert.ok(python.nodes.some((node) => node.type === "CodeMethod" && node.label === "resolve"));
  assert.ok(python.edges.every((edge) => String(edge.properties["evidence:explanation"] || "").trim()));
  const groups = await sourceShard(outputRoot, recovered, "src/groups.py");
  assert.equal(groups.status, "parsed");
  assert.ok(groups.diagnostics.some((diagnostic) => diagnostic.code === "python_runtime_grammar_recovered"));

  const recoveredPointer = await fs.readFile(pointerPath(outputRoot, recovered.graphId), "utf8");
  await fs.writeFile(path.join(corpusRoot, "src", "broken.py"), [
    "def invalid(value):",
    "    match value:",
    "        case _:",
    "            return value",
    "",
    "def broken(",
  ].join("\n"));
  const failed = await runtime.ingest({ rootPath: corpusRoot, strict: true });
  assert.equal(failed.ok, false);
  assert.equal(failed.error.code, "strict_ingest_incomplete");
  assert.match(failed.error.message, /local parser returned an incomplete result/i);
  assert.match(failed.error.message, /src\/broken\.py/);
  assert.equal(await fs.readFile(pointerPath(outputRoot, recovered.graphId), "utf8"), recoveredPointer);
});
