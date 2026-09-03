// =============================================================================
// AgenticOs_Document (`agentic-os-computing-flow/v1`) canonical parser/serializer — tests
// agentic-graph-acos-mcp-connector spec · Task 8.6 · Requirement R7.3 · Property 13
// Pure parser/serializer: ZERO network calls, deterministic.
// =============================================================================
//
// Property 13 (R7.3): for any emitted AgenticOs_Document, parse -> serialize -> parse
// yields an EQUIVALENT flow structure — identical node count, identical SET of
// node ids, identical node ORDERING, and identical edge CONNECTIONS.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AGENTIC_OS_COMPUTING_FLOW_SCHEMA,
  AGENTIC_OS_NODE_FIELDS,
  AGENTIC_OS_EDGE_FIELDS,
  normalizeAgenticOsNode,
  normalizeAgenticOsEdge,
  normalizeAgenticOsFlow,
  extractFlowFromMarkdown,
  parseAgenticOsDocument,
  serializeAgenticOsDocument,
  serializeAgenticOsFlow,
  parseAgenticOsFlow,
  agenticOsFlowEquivalent,
  agenticOsDocumentEquivalent,
  agenticOsFlowRoundTripEquivalent,
  agenticOsRoundTripEquivalent,
} from "../agentic-os-document.schema.js";

// Reachable via the aggregate entry point too (SSOT).
import * as contracts from "../index.js";

// --- helpers ----------------------------------------------------------------

/** Build a `agentic-os-computing-flow/v1` AgenticOs_Document with N shots (mirrors the
 *  storyboard-harness node/edge shape: chain shot[i] -> shot[i+1]). */
function buildAgenticOsDocument(shotCount) {
  const nodes = Array.from({ length: shotCount }, (_, i) => ({
    id: `shot-${i + 1}`,
    label: `Shot ${i + 1}`,
    type: "video-remix-shot",
    status: "planned",
  }));
  const edges = nodes.slice(1).map((node, i) => ({
    id: `edge-${i + 1}`,
    source: nodes[i].id,
    target: node.id,
  }));
  const nodeYaml = nodes
    .map((n) =>
      [
        `    - id: "${n.id}"`,
        `      label: "${n.label}"`,
        `      type: "${n.type}"`,
        `      status: "${n.status}"`,
      ].join("\n"),
    )
    .join("\n");
  const edgeYaml = edges
    .map((e) =>
      [`    - id: "${e.id}"`, `      source: "${e.source}"`, `      target: "${e.target}"`].join(
        "\n",
      ),
    )
    .join("\n");
  const canvasDocumentMarkdown = [
    "---",
    `kgSchema: "${AGENTIC_OS_COMPUTING_FLOW_SCHEMA}"`,
    'kgCanvasSurfaceMode: "2d"',
    'title: "Video Remix Storyboard - run-x"',
    'referenceUrl: "https://example.com/ref.mp4"',
    "flow:",
    "  nodes:",
    nodeYaml || "    []",
    "  edges:",
    edgeYaml || "    []",
    "---",
    "",
    "# Video Remix Storyboard",
  ].join("\n");
  return { canvasDocumentMarkdown, flow: { nodes, edges } };
}

// --- 0. SSOT reachability ----------------------------------------------------

test("agentic-os-document schema is re-exported from the aggregate contracts entry point", () => {
  assert.equal(typeof contracts.parseAgenticOsDocument, "function");
  assert.equal(typeof contracts.serializeAgenticOsDocument, "function");
  assert.equal(typeof contracts.agenticOsRoundTripEquivalent, "function");
  assert.equal(contracts.AGENTIC_OS_COMPUTING_FLOW_SCHEMA, AGENTIC_OS_COMPUTING_FLOW_SCHEMA);
});

test("canonical field constants are stable", () => {
  assert.deepEqual(AGENTIC_OS_NODE_FIELDS, ["id", "label", "type", "status", "properties"]);
  assert.deepEqual(AGENTIC_OS_EDGE_FIELDS, ["id", "source", "target"]);
  assert.equal(AGENTIC_OS_COMPUTING_FLOW_SCHEMA, "agentic-os-computing-flow/v1");
});

// --- 1. normalization --------------------------------------------------------

test("normalizeAgenticOsNode / normalizeAgenticOsEdge coerce to canonical string fields", () => {
  assert.deepEqual(normalizeAgenticOsNode({ id: "n1", label: "L", type: "t", status: "s", extra: 9 }), {
    id: "n1",
    label: "L",
    type: "t",
    status: "s",
    properties: {},
  });
  // non-object -> all empty strings, never throws
  assert.deepEqual(normalizeAgenticOsNode(null), {
    id: "",
    label: "",
    type: "",
    status: "",
    properties: {},
  });
  assert.deepEqual(normalizeAgenticOsEdge({ id: "e1", source: "a", target: "b", junk: true }), {
    id: "e1",
    source: "a",
    target: "b",
  });
  assert.deepEqual(normalizeAgenticOsEdge(42), { id: "", source: "", target: "" });
});

test("node properties preserve canonical JSON-safe data through parse and serialize", () => {
  const properties = {
    ecsEntity: {
      components: { Position: { y: 2, x: 1 }, Tags: { values: ["npc", null, true] } },
      entityRef: "npc.one",
    },
  };
  const input = {
    flow: {
      nodes: [{ id: "entity-1", label: "NPC", type: "EcsEntity", status: "ready", properties }],
      edges: [],
    },
  };

  const once = parseAgenticOsDocument(input);
  const twice = parseAgenticOsDocument(serializeAgenticOsDocument(once));
  assert.deepEqual(once.flow.nodes[0].properties, properties);
  assert.deepEqual(twice.flow.nodes[0].properties, properties);
  assert.equal(serializeAgenticOsDocument(once), serializeAgenticOsDocument(twice));
});

test("node properties reject non-JSON-safe values without breaking parser totality", () => {
  const cyclic = {};
  cyclic.self = cyclic;
  assert.deepEqual(normalizeAgenticOsNode({ id: "n1", properties: cyclic }).properties, {});
  assert.deepEqual(normalizeAgenticOsNode({ id: "n2", properties: { invalid: undefined } }).properties, {});
});

test("node properties preserve reserved keys as safe own properties", () => {
  const properties = JSON.parse(
    '{"__proto__":{"safe":true},"constructor":{"prototype":"data"},"prototype":"value"}',
  );
  const normalized = normalizeAgenticOsNode({ id: "reserved", properties }).properties;
  assert.equal(Object.getPrototypeOf(normalized), Object.prototype);
  assert.equal(Object.hasOwn(normalized, "__proto__"), true);
  assert.equal(Object.hasOwn(normalized, "constructor"), true);
  assert.equal(Object.hasOwn(normalized, "prototype"), true);
  assert.deepEqual(normalized, properties);

  const roundTrip = parseAgenticOsDocument(
    serializeAgenticOsDocument({ flow: { nodes: [{ id: "reserved", properties }], edges: [] } }),
  );
  assert.deepEqual(roundTrip.flow.nodes[0].properties, properties);
});

test("markdown extraction preserves inline JSON-safe node properties", () => {
  const markdown = [
    "---",
    'kgSchema: "agentic-os-computing-flow/v1"',
    "flow:",
    "  nodes:",
    '    - id: "entity-1"',
    '      label: "NPC"',
    '      type: "EcsEntity"',
    '      status: "ready"',
    '      properties: {"ecsEntity":{"components":{"Position":{"x":1}},"entityRef":"npc.one"}}',
    "  edges: []",
    "---",
  ].join("\n");
  assert.deepEqual(extractFlowFromMarkdown(markdown).nodes[0].properties, {
    ecsEntity: { components: { Position: { x: 1 } }, entityRef: "npc.one" },
  });
});

test("markdown extraction preserves block-style ECS node properties", () => {
  const markdown = [
    "---",
    'kgSchema: "agentic-os-computing-flow/v1"',
    "flow:",
    "  nodes:",
    '    - id: "schema-position"',
    '      type: "EcsComponentSchema"',
    "      properties:",
    "        ecsComponent:",
    '          name: "Position"',
    "          fields:",
    '            x: "f32"',
    '    - id: "entity-guide"',
    '      type: "EcsEntity"',
    "      properties:",
    "        ecsEntity:",
    '          entityRef: "npc.guide"',
    "          components:",
    "            Position:",
    "              x: 1",
    '    - id: "decision-one"',
    '      type: "EcsDecision"',
    "      properties:",
    "        ecsDecision:",
    '          decisionId: "decision-one"',
    '          decisionType: "world_tick_result"',
    '          entityRef: "npc.guide"',
    "          payload:",
    "            accepted: true",
    '          producedAt: "2026-07-20T00:00:00.000Z"',
    "  edges: []",
    "---",
  ].join("\n");
  const extracted = extractFlowFromMarkdown(markdown);
  assert.deepEqual(extracted.nodes.map((node) => node.properties), [
    { ecsComponent: { fields: { x: "f32" }, name: "Position" } },
    { ecsEntity: { components: { Position: { x: 1 } }, entityRef: "npc.guide" } },
    {
      ecsDecision: {
        decisionId: "decision-one",
        decisionType: "world_tick_result",
        entityRef: "npc.guide",
        payload: { accepted: true },
        producedAt: "2026-07-20T00:00:00.000Z",
      },
    },
  ]);
  assert.deepEqual(parseAgenticOsDocument(markdown).flow, extracted);
});

test("normalizeAgenticOsFlow preserves ordering and drops non-significant fields", () => {
  const flow = normalizeAgenticOsFlow({
    nodes: [{ id: "b" }, { id: "a" }],
    edges: [{ source: "b", target: "a" }],
  });
  assert.deepEqual(flow.nodes.map((n) => n.id), ["b", "a"]);
  assert.equal(flow.edges.length, 1);
  assert.equal(flow.edges[0].source, "b");
});

// --- 2. THE ROUND-TRIP GUARANTEE (R7.3 / Property 13) -----------------------

test("R7.3: parse->serialize->parse preserves node count, id set, ordering, and edges", () => {
  for (const n of [1, 2, 3, 7, 25, 100, 500]) {
    const doc = buildAgenticOsDocument(n);
    const once = parseAgenticOsDocument(doc);
    const reSerialized = serializeAgenticOsDocument(once);
    const twice = parseAgenticOsDocument(reSerialized);

    // identical node count
    assert.equal(twice.flow.nodes.length, n, `count mismatch at N=${n}`);
    assert.equal(once.flow.nodes.length, twice.flow.nodes.length);

    // identical SET of node ids
    const setOnce = new Set(once.flow.nodes.map((x) => x.id));
    const setTwice = new Set(twice.flow.nodes.map((x) => x.id));
    assert.equal(setOnce.size, setTwice.size);
    for (const id of setOnce) assert.ok(setTwice.has(id), `id ${id} lost at N=${n}`);

    // identical node ORDERING
    assert.deepEqual(
      once.flow.nodes.map((x) => x.id),
      twice.flow.nodes.map((x) => x.id),
      `ordering mismatch at N=${n}`,
    );

    // identical edge connections
    assert.deepEqual(
      once.flow.edges.map((e) => [e.source, e.target]),
      twice.flow.edges.map((e) => [e.source, e.target]),
      `edge mismatch at N=${n}`,
    );

    // the canonical guarantee helper agrees
    assert.equal(agenticOsRoundTripEquivalent(doc), true, `round-trip failed at N=${n}`);
  }
});

test("R7.3: round-trip holds when input is the SERIALIZED string form too", () => {
  const doc = buildAgenticOsDocument(5);
  const serialized = serializeAgenticOsDocument(doc);
  assert.equal(agenticOsRoundTripEquivalent(serialized), true);
  // parsing the string yields the same flow as parsing the object
  assert.equal(agenticOsDocumentEquivalent(doc, serialized), true);
});

test("R7.3: serialize is byte-stable across a second parse->serialize pass", () => {
  const doc = buildAgenticOsDocument(9);
  const first = serializeAgenticOsDocument(doc);
  const second = serializeAgenticOsDocument(parseAgenticOsDocument(first));
  assert.equal(first, second);
});

// --- 3. single-node fallback round-trips (R7.5 clause) ----------------------

test("single-node fallback AgenticOs_Document round-trips (identical count/ids/edges)", () => {
  const doc = buildAgenticOsDocument(1);
  assert.equal(doc.flow.nodes.length, 1);
  assert.equal(doc.flow.edges.length, 0);
  assert.equal(agenticOsRoundTripEquivalent(doc), true);

  const back = parseAgenticOsDocument(serializeAgenticOsDocument(doc));
  assert.equal(back.flow.nodes.length, 1);
  assert.deepEqual(back.flow.nodes[0], {
    id: "shot-1",
    label: "Shot 1",
    type: "video-remix-shot",
    status: "planned",
    properties: {},
  });
  assert.equal(back.flow.edges.length, 0);
});

// --- 4. parse from markdown when structured flow is absent ------------------

test("parseAgenticOsDocument extracts the flow from canvas-markdown frontmatter when flow object is absent", () => {
  const full = buildAgenticOsDocument(4);
  const markdownOnly = { canvasDocumentMarkdown: full.canvasDocumentMarkdown };
  const parsed = parseAgenticOsDocument(markdownOnly);
  assert.equal(parsed.flow.nodes.length, 4);
  assert.deepEqual(parsed.flow.nodes.map((n) => n.id), ["shot-1", "shot-2", "shot-3", "shot-4"]);
  assert.deepEqual(
    parsed.flow.edges.map((e) => [e.source, e.target]),
    [
      ["shot-1", "shot-2"],
      ["shot-2", "shot-3"],
      ["shot-3", "shot-4"],
    ],
  );
  // markdown-only and structured forms are equivalent + round-trip
  assert.equal(agenticOsDocumentEquivalent(markdownOnly, full), true);
  assert.equal(agenticOsRoundTripEquivalent(markdownOnly), true);
});

test("extractFlowFromMarkdown returns an empty flow when no flow block is present", () => {
  const flow = extractFlowFromMarkdown("# just a heading\n\nno frontmatter here");
  assert.deepEqual(flow, { nodes: [], edges: [] });
});

// --- 5. malformed input never throws (totality) -----------------------------

test("parseAgenticOsDocument is total: malformed inputs never throw and yield empty flow", () => {
  for (const bad of [undefined, null, 0, 1, true, [], NaN, "not json {", Symbol.iterator]) {
    assert.doesNotThrow(() => parseAgenticOsDocument(bad));
    const parsed = parseAgenticOsDocument(bad);
    assert.ok(Array.isArray(parsed.flow.nodes));
    assert.ok(Array.isArray(parsed.flow.edges));
  }
});

test("serializeAgenticOsDocument / agenticOsRoundTripEquivalent are total on garbage input", () => {
  for (const bad of [undefined, null, 0, "x", true, [], { flow: 5 }, { flow: { nodes: 3 } }]) {
    assert.doesNotThrow(() => serializeAgenticOsDocument(bad));
    assert.doesNotThrow(() => agenticOsRoundTripEquivalent(bad));
    // empty/garbage flow still round-trips trivially (0 nodes, 0 edges)
    assert.equal(agenticOsRoundTripEquivalent(bad), true);
  }
});

test("parseAgenticOsFlow tolerates invalid JSON and non-string input", () => {
  assert.deepEqual(parseAgenticOsFlow("definitely not json"), { nodes: [], edges: [] });
  assert.deepEqual(parseAgenticOsFlow(null), { nodes: [], edges: [] });
  assert.deepEqual(parseAgenticOsFlow({ nodes: [{ id: "a" }], edges: [] }).nodes.map((n) => n.id), ["a"]);
});

// --- 6. equivalence semantics -----------------------------------------------

test("agenticOsFlowEquivalent detects count, ordering, id-set, and edge differences", () => {
  const base = buildAgenticOsDocument(3).flow;

  // identical -> equivalent
  assert.equal(agenticOsFlowEquivalent(base, buildAgenticOsDocument(3).flow), true);

  // different count
  assert.equal(agenticOsFlowEquivalent(base, buildAgenticOsDocument(4).flow), false);

  // different ordering (same set of ids, permuted)
  const permuted = { nodes: [base.nodes[1], base.nodes[0], base.nodes[2]], edges: base.edges };
  assert.equal(agenticOsFlowEquivalent(base, permuted), false);

  // different edge connection
  const rewired = {
    nodes: base.nodes,
    edges: [{ id: "edge-1", source: "shot-1", target: "shot-3" }, base.edges[1]],
  };
  assert.equal(agenticOsFlowEquivalent(base, rewired), false);
});

test("agenticOsFlowRoundTripEquivalent holds for the flow-level seam", () => {
  for (const n of [1, 3, 10]) {
    assert.equal(agenticOsFlowRoundTripEquivalent(buildAgenticOsDocument(n).flow), true);
  }
  // flow-level serialize/parse round-trips a hand-built flow with varied ids
  const flow = {
    nodes: [
      { id: "z", label: "Z", type: "t", status: "s" },
      { id: "a", label: "A", type: "t", status: "s" },
    ],
    edges: [{ id: "e", source: "z", target: "a" }],
  };
  const back = parseAgenticOsFlow(serializeAgenticOsFlow(flow));
  assert.equal(agenticOsFlowEquivalent(flow, back), true);
  assert.deepEqual(back.nodes.map((n) => n.id), ["z", "a"]);
});

// --- 7. property-style sweep over varied ids/orderings/edges ----------------

test("PROPERTY: round-trip preserves equivalence across varied ids, orderings, and edge sets", () => {
  // deterministic in-process sweep (no PBT lib dependency, network-free)
  for (let seed = 0; seed < 60; seed += 1) {
    const count = (seed % 12) + 1;
    const nodes = Array.from({ length: count }, (_, i) => ({
      id: `n_${seed}_${i}`,
      label: `Label ${i} (seed ${seed})`,
      type: i % 2 === 0 ? "video-remix-shot" : "transition",
      status: i % 3 === 0 ? "planned" : "blocked_weak_signal",
    }));
    // build a varied (but valid) edge set referencing existing node ids
    const edges = [];
    for (let i = 1; i < count; i += 1) {
      if ((seed + i) % 2 === 0) {
        edges.push({ id: `e_${seed}_${i}`, source: nodes[i - 1].id, target: nodes[i].id });
      }
    }
    const doc = { canvasDocumentMarkdown: `kgSchema: "${AGENTIC_OS_COMPUTING_FLOW_SCHEMA}"`, flow: { nodes, edges } };

    const once = parseAgenticOsDocument(doc);
    const twice = parseAgenticOsDocument(serializeAgenticOsDocument(once));

    assert.equal(twice.flow.nodes.length, count, `seed ${seed}: count`);
    assert.deepEqual(
      once.flow.nodes.map((n) => n.id),
      twice.flow.nodes.map((n) => n.id),
      `seed ${seed}: ordering`,
    );
    assert.deepEqual(
      once.flow.edges.map((e) => [e.source, e.target]),
      twice.flow.edges.map((e) => [e.source, e.target]),
      `seed ${seed}: edges`,
    );
    assert.equal(agenticOsRoundTripEquivalent(doc), true, `seed ${seed}: round-trip`);
  }
});
