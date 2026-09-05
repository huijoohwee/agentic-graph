import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import {
  AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA,
  dictionaryFileForAgenticCanvasOsToken,
  kindForAgenticCanvasOsToken,
  serializeAgenticCanvasOsDocsCatalogForDigest,
  serializeAgenticCanvasOsDocsRoutingForDigest,
} from "../agentic-canvas-os-docs-contract.mjs";

const catalog = [
  {
    token: " #ready ", kind: " SEMANTIC ", label: " Ready ", summary: " Ready ",
    sourcePath: " DICTIONARY-SEMANTIC.md##ready ",
    mcpTools: [], mcpTool: "must-not-fallback",
  },
  {
    token: " /query ", kind: " COMMAND ", label: " Query ", summary: " Find  facts\nnow ",
    sourcePath: " DICTIONARY-COMMAND.md#/query ",
    mcpTools: [" agentic-graph.query ", "agentic-graph.explain", "agentic-graph.query", ""],
    semantics: [" #ready ", "#ready", "/wrong", "#review"],
    bindings: [" @url: ", "@url:", "#wrong", "@runtime-proof"],
  },
  {
    token: " @url: ", kind: " BINDING ", label: " URL ", summary: " Bind URL ",
    sourcePath: " DICTIONARY-BINDING.md#@url: ",
    mcpTool: " agentic-graph.lookup ", semantics: "not-an-array",
  },
];

const catalogBytes = '[{"token":"@url:","kind":"binding","label":"URL","summary":"Bind URL","sourcePath":"DICTIONARY-BINDING.md#@url:"},{"token":"/query","kind":"command","label":"Query","summary":"Find  facts\\nnow","sourcePath":"DICTIONARY-COMMAND.md#/query"},{"token":"#ready","kind":"semantic","label":"Ready","summary":"Ready","sourcePath":"DICTIONARY-SEMANTIC.md##ready"}]\n';
const routingBytes = '{"schema":"agentic-canvas-os-docs-routing/v1","routes":[{"token":"@url:","kind":"binding","sourcePath":"DICTIONARY-BINDING.md#@url:","mcpTools":["agentic-graph.lookup"],"semantics":[],"bindings":[]},{"token":"/query","kind":"command","sourcePath":"DICTIONARY-COMMAND.md#/query","mcpTools":["agentic-graph.query","agentic-graph.explain"],"semantics":["#ready","#review"],"bindings":["@url:","@runtime-proof"]},{"token":"#ready","kind":"semantic","sourcePath":"DICTIONARY-SEMANTIC.md##ready","mcpTools":[],"semantics":[],"bindings":[]}]}\n';

test("shared catalog serialization preserves the Graph wire bytes and opaque source paths", () => {
  assert.equal(serializeAgenticCanvasOsDocsCatalogForDigest(catalog), catalogBytes);
  assert.equal(serializeAgenticCanvasOsDocsCatalogForDigest([...catalog].reverse()), catalogBytes);
  assert.equal(serializeAgenticCanvasOsDocsCatalogForDigest(), "[]\n");
});

test("shared route serialization retains the product schema, ordered routes, and binding declarations", () => {
  assert.equal(serializeAgenticCanvasOsDocsRoutingForDigest(catalog), routingBytes);
  assert.equal(serializeAgenticCanvasOsDocsRoutingForDigest([...catalog].reverse()), routingBytes);
  assert.equal(
    serializeAgenticCanvasOsDocsRoutingForDigest(),
    '{"schema":"agentic-canvas-os-docs-routing/v1","routes":[]}\n',
  );
});

test("discovery prefixes retain product dictionary ownership without validating or dispatching", () => {
  assert.equal(kindForAgenticCanvasOsToken(" / "), "command");
  assert.equal(kindForAgenticCanvasOsToken(" # "), "semantic");
  assert.equal(kindForAgenticCanvasOsToken(" @ "), "binding");
  assert.equal(kindForAgenticCanvasOsToken("/editing incomplete body"), "command");
  assert.equal(dictionaryFileForAgenticCanvasOsToken("@url:"), "DICTIONARY-BINDING.md");
  assert.equal(dictionaryFileForAgenticCanvasOsToken("unresolved"), "");
});

test("browser bundles the installed invocation core and executes the same Graph contract", async () => {
  const result = await build({
    absWorkingDir: fileURLToPath(new URL("../..", import.meta.url)),
    entryPoints: ["mcp/agentic-canvas-os-docs-contract.mjs"],
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2020",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  const inputs = Object.keys(result.metafile.inputs);
  assert.ok(inputs.some((input) => input.endsWith("node_modules/agentic-os/src/invocation.mjs")));
  for (const output of Object.values(result.metafile.outputs)) assert.deepEqual(output.imports, []);
  assert.equal(result.outputFiles.length, 1);
  assert.ok(result.outputFiles[0].contents.byteLength < 20_000);
  const browser = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
  assert.equal(browser.AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA, AGENTIC_CANVAS_OS_DOCS_ROUTING_SCHEMA);
  assert.equal(browser.dictionaryFileForAgenticCanvasOsToken("@url:"), "DICTIONARY-BINDING.md");
  assert.equal(browser.serializeAgenticCanvasOsDocsCatalogForDigest(catalog), catalogBytes);
  assert.equal(browser.serializeAgenticCanvasOsDocsRoutingForDigest(catalog), routingBytes);
});
