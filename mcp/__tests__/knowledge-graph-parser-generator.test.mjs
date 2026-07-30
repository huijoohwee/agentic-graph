import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { discoverKnowledgeSources } from "../knowledge-graph/discovery.mjs";
import { compileParserDispatch, compileParserRegistry } from "../knowledge-graph/parser-generator.mjs";
import {
  SOURCE_PARSER_REGISTRY,
  SOURCE_PARSER_STRUCTURAL_INCLUDE_PATTERNS,
} from "../knowledge-graph/source-parser-registry.mjs";

test("parser generator compiles deterministic inert extension and basename matchers", () => {
  assert.equal(SOURCE_PARSER_REGISTRY.match("src/main.ts")?.kind, "typescript");
  assert.equal(SOURCE_PARSER_REGISTRY.match("src/Service.java")?.kind, "brace-code");
  assert.equal(SOURCE_PARSER_REGISTRY.match("Dockerfile")?.kind, "structural-config");
  assert.equal(SOURCE_PARSER_REGISTRY.match("assets/image.png"), null);
  assert.match(SOURCE_PARSER_REGISTRY.digest, /^[a-f0-9]{64}$/);
  const rebuilt = compileParserRegistry([...SOURCE_PARSER_REGISTRY.descriptors].reverse());
  assert.equal(rebuilt.digest, SOURCE_PARSER_REGISTRY.digest);
});

test("parser generator rejects executable, ambiguous, and unbounded descriptors", () => {
  assert.throws(
    () => compileParserRegistry([{
      id: "unsafe",
      kind: "unsafe",
      adapter: "unsafe",
      fidelity: "ast",
      extensions: [".js"],
      basenames: [],
      priority: 1,
      execute: "anything",
    }]),
    (error) => error?.code === "parser_descriptor_invalid",
  );
  assert.throws(
    () => compileParserRegistry([
      { id: "one", kind: "one", adapter: "one", fidelity: "ast", extensions: [".x"], basenames: [], priority: 1 },
      { id: "two", kind: "two", adapter: "two", fidelity: "ast", extensions: [".x"], basenames: [], priority: 1 },
    ]),
    (error) => error?.code === "parser_registry_ambiguous",
  );
  assert.throws(
    () => compileParserRegistry([{
      id: "many",
      kind: "many",
      adapter: "many",
      fidelity: "ast",
      extensions: Array.from({ length: 65 }, (_, index) => `.x${index}`),
      basenames: [],
      priority: 1,
    }]),
    (error) => error?.code === "parser_descriptor_invalid",
  );
});

test("compiled dispatch invokes only host-supplied adapters", () => {
  const registry = compileParserRegistry([{
    id: "fixture",
    kind: "fixture",
    adapter: "fixture",
    fidelity: "ast",
    extensions: [".fixture"],
    basenames: [],
    priority: 1,
  }]);
  const dispatch = compileParserDispatch(registry, {
    fixture: (source) => ({ sourcePath: source.relativePath, parsed: true }),
  });
  assert.deepEqual(dispatch.parse({ kind: "fixture", relativePath: "a.fixture" }), {
    sourcePath: "a.fixture",
    parsed: true,
  });
  assert.throws(() => compileParserDispatch(registry, {}), (error) => error?.code === "parser_adapter_missing");
});

test("Launch parser scope admits structural sources and ignores unrelated unsupported files", async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-launch-parser-scope-"));
  try {
    await fs.mkdir(path.join(rootPath, "src"), { recursive: true });
    await Promise.all([
      fs.writeFile(path.join(rootPath, "src", "index.ts"), "export const answer = 42;\n"),
      fs.writeFile(path.join(rootPath, "README.rst"), "Unsupported documentation format.\n"),
      fs.writeFile(path.join(rootPath, "styles.css"), "body { color: black; }\n"),
    ]);
    const discovered = await discoverKnowledgeSources({
      rootPath,
      include: SOURCE_PARSER_STRUCTURAL_INCLUDE_PATTERNS,
      respectGitignore: false,
    });
    assert.deepEqual(discovered.sources.map((source) => source.relativePath), ["src/index.ts"]);
    assert.equal(discovered.admission.counts.filesUnsupported, 0);
    assert.equal(discovered.diagnostics.some((diagnostic) => diagnostic.code === "parser_unsupported"), false);
    assert.equal(SOURCE_PARSER_STRUCTURAL_INCLUDE_PATTERNS.includes("*.ts"), true);
    assert.equal(SOURCE_PARSER_STRUCTURAL_INCLUDE_PATTERNS.includes("*.css"), false);
    assert.equal(SOURCE_PARSER_STRUCTURAL_INCLUDE_PATTERNS.includes("*.rst"), false);
  } finally {
    await fs.rm(rootPath, { recursive: true, force: true });
  }
});
