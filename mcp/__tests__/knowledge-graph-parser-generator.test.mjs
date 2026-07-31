import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  KNOWLEDGE_GRAPH_DEFAULT_PARSER_PROFILE,
  KNOWLEDGE_GRAPH_DECLARATIVE_GRAMMAR_SCHEMA_ID,
} from "../knowledge-graph-parser-contract.js";
import { EVIDENCE_FIELDS, sha256 } from "../knowledge-graph/contract.mjs";
import {
  compileDeclarativeGrammar,
} from "../knowledge-graph/declarative-grammar-parser.mjs";
import { compileParserDispatch, compileParserRegistry } from "../knowledge-graph/parser-generator.mjs";
import { parseKnowledgeSource } from "../knowledge-graph/parsers.mjs";
import {
  createKnowledgeGraphRuntime,
  generateKnowledgeGraphParser,
} from "../knowledge-graph/runtime.mjs";
import {
  PORTABLE_SOURCE_PARSER_REGISTRY,
  SOURCE_PARSER_REGISTRY,
} from "../knowledge-graph/source-parser-registry.mjs";

const declarativeGrammar = () => ({
  schema: KNOWLEDGE_GRAPH_DECLARATIVE_GRAMMAR_SCHEMA_ID,
  start: "document",
  tokens: [
    { id: "entity-keyword", literal: "entity" },
    { id: "equals", literal: "=" },
    { id: "identifier", kind: "identifier" },
    { id: "newline", kind: "newline" },
    { id: "number", kind: "number" },
    { id: "whitespace", kind: "whitespace", skip: true },
  ],
  rules: [
    {
      id: "document",
      alternatives: [{
        sequence: [{ rule: "entity", min: 1, max: 256 }],
      }],
    },
    {
      id: "entity",
      alternatives: [{
        sequence: [
          { token: "entity-keyword" },
          { token: "identifier", capture: "name" },
          { token: "equals" },
          { token: "number", capture: "value" },
          { token: "newline", min: 0, max: 1 },
        ],
      }],
    },
  ],
});

const declarativeDescriptor = (grammar = declarativeGrammar()) => ({
  id: "entity-records",
  kind: "entity-records",
  adapter: "declarative-grammar",
  fidelity: "ast",
  extensions: [".entity"],
  basenames: [],
  basenameFamilies: [],
  priority: 100,
  grammar,
});

test("parser generator compiles deterministic inert extension and basename matchers", () => {
  assert.equal(SOURCE_PARSER_REGISTRY.match("src/main.ts")?.kind, "typescript");
  assert.equal(SOURCE_PARSER_REGISTRY.match("src/Service.java")?.kind, "brace-code");
  assert.equal(SOURCE_PARSER_REGISTRY.match("Dockerfile")?.kind, "structural-config");
  assert.equal(SOURCE_PARSER_REGISTRY.match("assets/image.png"), null);
  assert.match(SOURCE_PARSER_REGISTRY.digest, /^[a-f0-9]{64}$/);
  const rebuilt = compileParserRegistry([...SOURCE_PARSER_REGISTRY.descriptors].reverse());
  assert.equal(rebuilt.digest, SOURCE_PARSER_REGISTRY.digest);
});

test("parser generator uses deterministic longest-suffix matching", () => {
  const registry = compileParserRegistry([
    {
      id: "general-json",
      kind: "general-json",
      adapter: "general-json",
      fidelity: "ast",
      extensions: [".json"],
      basenames: [],
      priority: 100,
    },
    {
      id: "schema-json",
      kind: "schema-json",
      adapter: "schema-json",
      fidelity: "ast",
      extensions: [".schema.json"],
      basenames: [],
      priority: 1,
    },
  ]);
  assert.equal(registry.match("config/app.schema.json")?.id, "schema-json");
  assert.equal(registry.match("config/app.json")?.id, "general-json");
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
  assert.throws(
    () => compileParserRegistry([
      { id: "one", kind: "same", adapter: "one", fidelity: "ast", extensions: [".one"], basenames: [], priority: 1 },
      { id: "two", kind: "same", adapter: "two", fidelity: "ast", extensions: [".two"], basenames: [], priority: 1 },
    ]),
    (error) => error?.code === "parser_registry_invalid",
  );
  assert.throws(
    () => compileParserRegistry([
      { id: "same", kind: "one", adapter: "one", fidelity: "ast", extensions: [".one"], basenames: [], priority: 1 },
      { id: "same", kind: "two", adapter: "two", fidelity: "ast", extensions: [".two"], basenames: [], priority: 1 },
    ]),
    (error) => error?.code === "parser_registry_invalid",
  );
});

test("public parser generator returns only a digest-bound inert native registry", () => {
  const builtIn = generateKnowledgeGraphParser({
    profile: KNOWLEDGE_GRAPH_DEFAULT_PARSER_PROFILE,
  });
  assert.equal(builtIn.ok, true, JSON.stringify(builtIn));
  assert.equal(builtIn.parserRegistryDigest, SOURCE_PARSER_REGISTRY.digest);
  assert.equal(builtIn.parserRegistry, PORTABLE_SOURCE_PARSER_REGISTRY);
  assert.equal(JSON.stringify(builtIn).includes("executable"), false);
  assert.equal(JSON.stringify(builtIn).includes("modulePath"), false);
  assert.equal(JSON.stringify(builtIn).includes("sourcePath"), false);

  const descriptors = [
    {
      id: "schema-json",
      kind: "schema-json",
      adapter: "json-config",
      fidelity: "ast",
      extensions: [".schema.json"],
      basenames: [],
      basenameFamilies: [],
      priority: 100,
    },
    {
      id: "general-json",
      kind: "general-json",
      adapter: "json-config",
      fidelity: "ast",
      extensions: [".json"],
      basenames: [],
      basenameFamilies: [],
      priority: 50,
    },
  ];
  const generated = generateKnowledgeGraphParser({ descriptors });
  assert.equal(generated.ok, true, JSON.stringify(generated));
  assert.equal(generated.operation, "parser_generate");
  assert.equal(generated.parserRegistry.digest, generated.parserRegistryDigest);
  assert.deepEqual(
    Object.keys(generated).sort(),
    ["ok", "operation", "parserRegistry", "parserRegistryDigest", "schema"],
  );
  assert.deepEqual(
    Object.keys(generated.parserRegistry).sort(),
    ["descriptors", "digest", "schema"],
  );
  assert.equal(
    compileParserRegistry(generated.parserRegistry.descriptors)
      .match("config/app.schema.json")?.id,
    "schema-json",
  );
  assert.equal(JSON.stringify(generated).includes("executable"), false);
  assert.equal(JSON.stringify(generated).includes("modulePath"), false);
  assert.equal(JSON.stringify(generated).includes("sourcePath"), false);

  const missingSelection = generateKnowledgeGraphParser({});
  assert.equal(missingSelection.ok, false);
  assert.equal(missingSelection.error.code, "parser_generate_invalid");

  const unexpectedSelection = generateKnowledgeGraphParser({
    profile: KNOWLEDGE_GRAPH_DEFAULT_PARSER_PROFILE,
    ignored: true,
  });
  assert.equal(unexpectedSelection.ok, false);
  assert.equal(unexpectedSelection.error.code, "parser_generate_invalid");

  const bothSelections = generateKnowledgeGraphParser({
    profile: KNOWLEDGE_GRAPH_DEFAULT_PARSER_PROFILE,
    descriptors,
  });
  assert.equal(bothSelections.ok, false);
  assert.equal(bothSelections.error.code, "parser_generate_invalid");

  const unsupportedProfile = generateKnowledgeGraphParser({ profile: "other-source" });
  assert.equal(unsupportedProfile.ok, false);
  assert.equal(unsupportedProfile.error.code, "parser_profile_unsupported");

  const unsupported = generateKnowledgeGraphParser({
    descriptors: [{
      id: "unsupported",
      kind: "unsupported",
      adapter: "not-native",
      fidelity: "ast",
      extensions: [".unsupported"],
      basenames: [],
      basenameFamilies: [],
      priority: 1,
    }],
  });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.error.code, "parser_adapter_unsupported");
});

test("generated declarative grammar ingests unknown syntax as a deterministic explained AST", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "knowgrph-declarative-grammar-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const corpusRoot = path.join(root, "corpus");
  const knowgrphRoot = path.join(root, "host");
  const outputRoot = path.join(knowgrphRoot, "outputs");
  await fs.mkdir(corpusRoot, { recursive: true });
  await fs.mkdir(knowgrphRoot, { recursive: true });
  await fs.writeFile(
    path.join(corpusRoot, "model.entity"),
    "entity Account = 1\nentity Invoice = 2\n",
  );
  const runtime = createKnowledgeGraphRuntime({
    knowgrphRoot,
    allowedRoots: [corpusRoot],
    outputRoot,
  });
  const generated = runtime.generateKnowledgeGraphParser({
    descriptors: [declarativeDescriptor()],
  });
  assert.equal(generated.ok, true, JSON.stringify(generated));
  assert.equal(generated.parserRegistry.descriptors[0].grammar.schema, KNOWLEDGE_GRAPH_DECLARATIVE_GRAMMAR_SCHEMA_ID);
  const ingest = await runtime.ingest({
    rootPath: corpusRoot,
    strict: true,
    projectionLimit: 1_000,
    parserRegistry: generated.parserRegistry,
    expectedParserRegistryDigest: generated.parserRegistryDigest,
  });
  assert.equal(ingest.ok, true, JSON.stringify(ingest));
  assert.equal(ingest.counts.sources, 1);
  assert.equal(ingest.counts.parsed, 1);
  assert.equal(ingest.retrieval.vectorStore, false);
  const { nodes, edges } = ingest.projection.graphData;
  assert.ok(nodes.some((node) => (
    node.type === "SyntaxNode"
    && node.properties["syntax:ruleId"] === "entity"
  )));
  assert.ok(nodes.some((node) => (
    node.type === "SyntaxToken"
    && node.properties["syntax:capture"] === "name"
    && node.properties["syntax:value"] === "Account"
  )));
  assert.ok(edges.length > 0);
  for (const edge of edges) {
    for (const field of EVIDENCE_FIELDS) {
      assert.ok(Object.hasOwn(edge.properties, field), `${edge.id} missing ${field}`);
    }
    assert.equal(edge.properties["evidence:sourcePath"], "model.entity");
    assert.equal(edge.properties["evidence:sourceDigest"], sha256("entity Account = 1\nentity Invoice = 2\n"));
    assert.equal(edge.properties["evidence:parserId"], "local-declarative-grammar");
    assert.match(edge.properties["evidence:parserVersion"], /^1\.0\.0\+grammar-[a-f0-9]{16}$/);
    assert.ok(edge.properties["evidence:explanation"]);
  }

  const reorderedGrammar = declarativeGrammar();
  reorderedGrammar.tokens.reverse();
  reorderedGrammar.rules.reverse();
  const regenerated = generateKnowledgeGraphParser({
    descriptors: [declarativeDescriptor(reorderedGrammar)],
  });
  assert.equal(regenerated.ok, true, JSON.stringify(regenerated));
  assert.equal(regenerated.parserRegistryDigest, generated.parserRegistryDigest);
  assert.deepEqual(regenerated.parserRegistry, generated.parserRegistry);
  const warm = await runtime.ingest({
    rootPath: corpusRoot,
    strict: true,
    projectionLimit: 1_000,
    parserRegistry: regenerated.parserRegistry,
    expectedParserRegistryDigest: regenerated.parserRegistryDigest,
  });
  assert.equal(warm.ok, true, JSON.stringify(warm));
  assert.equal(warm.snapshotDigest, ingest.snapshotDigest);
  assert.deepEqual(warm.projection.graphData, ingest.projection.graphData);
});

test("declarative grammar rejects ambiguity, left recursion, unsafe fields, and hard-bound overrun", () => {
  const ambiguous = declarativeGrammar();
  ambiguous.rules.find((rule) => rule.id === "entity").alternatives.push({
    sequence: [
      { token: "entity-keyword" },
      { token: "number" },
    ],
  });
  const ambiguousResult = generateKnowledgeGraphParser({
    descriptors: [declarativeDescriptor(ambiguous)],
  });
  assert.equal(ambiguousResult.ok, false);
  assert.equal(ambiguousResult.error.code, "declarative_grammar_invalid");
  assert.match(ambiguousResult.error.message, /ambiguous/i);

  const leftRecursive = declarativeGrammar();
  leftRecursive.rules = [{
    id: "document",
    alternatives: [
      { sequence: [{ rule: "document" }] },
      { sequence: [{ token: "identifier" }] },
    ],
  }];
  const leftRecursiveResult = generateKnowledgeGraphParser({
    descriptors: [declarativeDescriptor(leftRecursive)],
  });
  assert.equal(leftRecursiveResult.ok, false);
  assert.equal(leftRecursiveResult.error.code, "declarative_grammar_invalid");
  assert.match(leftRecursiveResult.error.message, /left-recursive/i);

  const unsafe = declarativeGrammar();
  unsafe.tokens[0].pattern = ".*";
  const unsafeResult = generateKnowledgeGraphParser({
    descriptors: [declarativeDescriptor(unsafe)],
  });
  assert.equal(unsafeResult.ok, false);
  assert.equal(unsafeResult.error.code, "declarative_grammar_invalid");

  const nullablePrefix = {
    schema: KNOWLEDGE_GRAPH_DECLARATIVE_GRAMMAR_SCHEMA_ID,
    start: "root",
    tokens: [{ id: "x", literal: "x" }],
    rules: [
      {
        id: "root",
        alternatives: [{ sequence: [{ rule: "maybe" }, { token: "x" }] }],
      },
      {
        id: "maybe",
        alternatives: [{ sequence: [{ token: "x", min: 0, max: 1 }] }],
      },
    ],
  };
  const nullablePrefixResult = generateKnowledgeGraphParser({
    descriptors: [declarativeDescriptor(nullablePrefix)],
  });
  assert.equal(nullablePrefixResult.ok, false);
  assert.equal(nullablePrefixResult.error.code, "declarative_grammar_invalid");
  assert.match(nullablePrefixResult.error.message, /nullable|ambiguous/i);

  const tooManyTokens = declarativeGrammar();
  tooManyTokens.tokens = Array.from(
    { length: 65 },
    (_, index) => ({ id: `literal-${index}`, literal: `literal-${index}` }),
  );
  const boundedResult = generateKnowledgeGraphParser({
    descriptors: [declarativeDescriptor(tooManyTokens)],
  });
  assert.equal(boundedResult.ok, false);
  assert.equal(boundedResult.error.code, "declarative_grammar_invalid");

  const compiled = compileDeclarativeGrammar(declarativeGrammar());
  assert.throws(
    () => compiled.parse("entity Account = 1\n", { maxDeclarativeTokens: 2 }),
    (error) => error?.code === "declarative_grammar_token_limit_exceeded",
  );
  assert.throws(
    () => compiled.parse("entity Account = 1\n", { maxDeclarativeOperations: 1 }),
    (error) => error?.code === "declarative_grammar_operation_limit_exceeded",
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

test("inventory and fallback sources stay queryable without synthesized unsupported diagnostics", async () => {
  const source = {
    relativePath: "styles.css",
    kind: "text",
    status: "ready",
    contentHash: sha256("body { color: black; }\n"),
    byteSize: 23,
    text: "body { color: black; }\n",
  };
  const inventory = await parseKnowledgeSource(source);
  assert.equal(inventory.status, "parsed");
  assert.equal(inventory.nodes.length, 1);
  assert.deepEqual(inventory.edges, []);
  assert.deepEqual(inventory.diagnostics, []);
  assert.equal(inventory.nodes[0].properties["corpus:parserFidelity"], "inventory-only");

  const fallback = await parseKnowledgeSource({
    ...source,
    relativePath: "README.rst",
    kind: "inventory",
    parserAdapter: "inventory",
    parserDescriptorId: "inventory-fallback",
    parserRegistryDigest: SOURCE_PARSER_REGISTRY.digest,
  });
  assert.equal(fallback.status, "parsed");
  assert.deepEqual(fallback.diagnostics, []);
  await assert.rejects(
    parseKnowledgeSource({
      ...source,
      relativePath: "unverified.rst",
      kind: "inventory",
    }),
    (error) => error?.code === "parser_registry_route_mismatch",
  );

  const unsupported = await parseKnowledgeSource({
    ...source,
    relativePath: "asset.bin",
    kind: "unsupported",
    status: "unsupported",
    diagnostics: [{
      code: "binary_source_unsupported",
      sourcePath: "asset.bin",
      message: "Binary source requires a registered local adapter.",
    }],
  });
  assert.equal(unsupported.status, "unsupported");
  assert.equal(unsupported.diagnostics[0].code, "binary_source_unsupported");
});
