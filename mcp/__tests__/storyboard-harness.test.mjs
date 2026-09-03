// Unit tests for the Storyboard_Harness contract
// (agentic-graph-acos-mcp-connector spec, task 3.5 / R7.1 / Property 12 —
// production side).
//
// R7.1: WHEN the storyboard stage runs with an approved brief, THE
// Storyboard_Harness SHALL emit a AgenticOs_Document that successfully validates
// against the `agentic-os-computing-flow/v1` schema, with a non-empty `flow.nodes[]`
// array.
//
// These are example-based unit asserts of the harness contract: the input
// contract `{ brief, evidencePack, shotCount? }`, the output shape
// `{ canvasDocumentMarkdown, flow:{nodes[],edges[]} }`, validity as a
// `agentic-os-computing-flow/v1` AgenticOs_Document with a non-empty `flow.nodes[]`, the
// injectable BytePlus chat client seam, and the deterministic network-free
// default. This is the implementation seam for Property 12 (production side);
// exact-N node count + schema rejection is task 3.6 (storyboard-harness-count-
// schema.test.mjs), fallback is task 3.7 (storyboard-harness-fallback.test.mjs),
// and source referential integrity is task 3.8 (storyboard-references.test.mjs).
// The consolidated property-based test lands in task 9.1.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runStoryboardHarness,
  validateStoryboardInput,
  validateAgenticOsComputingFlowV1,
  clampShotCount,
  collectEvidenceSourceIds,
  createDeterministicStoryboardClient,
  StoryboardHarnessInputError,
  AGENTIC_OS_COMPUTING_FLOW_SCHEMA,
  STORYBOARD_GATE_ID,
  STORYBOARD_MAX_SHOTS,
  STORYBOARD_DEFAULT_SHOT_COUNT,
} from "../video-remix-runtime.js";

function evidencePackOf(count) {
  const sources = Array.from({ length: count }, (_, index) => ({
    sourceId: `src-${index + 1}`,
    url: `https://example.com/evidence/${index + 1}`,
  }));
  return {
    sources,
    citations: sources.map((s) => ({ sourceId: s.sourceId, url: s.url })),
    summary: "Source-backed evidence is ready for storyboard planning.",
  };
}

const VALID_INPUT = Object.freeze({
  brief: "Launch teaser remix with bold kinetic typography",
  evidencePack: evidencePackOf(4),
  shotCount: 5,
});

// ---------------------------------------------------------------------------
// Input contract: { brief, evidencePack, shotCount? }
// ---------------------------------------------------------------------------

test("validateStoryboardInput accepts a valid contract and normalizes values", () => {
  const out = validateStoryboardInput(VALID_INPUT);
  assert.equal(out.brief, "Launch teaser remix with bold kinetic typography");
  assert.equal(out.shotCount, 5);
  assert.equal(out.sourceCount, 4);
  assert.deepEqual(out.sourceIds, ["src-1", "src-2", "src-3", "src-4"]);
});

test("validateStoryboardInput rejects a missing/empty brief, naming the field", () => {
  for (const bad of [undefined, null, "", "   ", 42]) {
    assert.throws(
      () => validateStoryboardInput({ ...VALID_INPUT, brief: bad }),
      (err) =>
        err instanceof StoryboardHarnessInputError &&
        err.field === "brief" &&
        err.code === "invalid_storyboard_input",
      `brief=${JSON.stringify(bad)} must be rejected`,
    );
  }
});

test("validateStoryboardInput rejects a brief over 5000 chars, naming the field", () => {
  assert.throws(
    () => validateStoryboardInput({ ...VALID_INPUT, brief: "x".repeat(5001) }),
    (err) => err instanceof StoryboardHarnessInputError && err.field === "brief",
  );
});

test("validateStoryboardInput rejects a missing/invalid evidencePack, naming the field", () => {
  for (const bad of [undefined, null, "pack", [], { summary: "no sources" }]) {
    assert.throws(
      () => validateStoryboardInput({ ...VALID_INPUT, evidencePack: bad }),
      (err) => err instanceof StoryboardHarnessInputError && err.field === "evidencePack",
      `evidencePack=${JSON.stringify(bad)} must be rejected`,
    );
  }
});

test("validateStoryboardInput rejects a non-numeric shotCount, naming the field", () => {
  assert.throws(
    () => validateStoryboardInput({ ...VALID_INPUT, shotCount: "lots" }),
    (err) => err instanceof StoryboardHarnessInputError && err.field === "shotCount",
  );
});

test("shotCount is optional — an omitted shotCount defaults", () => {
  const { shotCount, ...rest } = VALID_INPUT;
  void shotCount;
  const out = validateStoryboardInput(rest);
  assert.equal(out.shotCount, STORYBOARD_DEFAULT_SHOT_COUNT);
});

// ---------------------------------------------------------------------------
// shotCount clamp into [1, 500]
// ---------------------------------------------------------------------------

test("clampShotCount clamps into [1, 500] and defaults when unset", () => {
  assert.equal(clampShotCount(undefined), STORYBOARD_DEFAULT_SHOT_COUNT);
  assert.equal(clampShotCount(0), 1);
  assert.equal(clampShotCount(-5), 1);
  assert.equal(clampShotCount(501), STORYBOARD_MAX_SHOTS);
  assert.equal(clampShotCount(99999), STORYBOARD_MAX_SHOTS);
  assert.equal(clampShotCount(7), 7);
  assert.equal(clampShotCount(3.9), 3);
});

// ---------------------------------------------------------------------------
// collectEvidenceSourceIds (referential seam for task 3.8)
// ---------------------------------------------------------------------------

test("collectEvidenceSourceIds returns ordered unique non-empty ids", () => {
  const pack = {
    sources: [
      { sourceId: "a" },
      { sourceId: "b" },
      { sourceId: "a" },
      { sourceId: "" },
      { sourceId: "c" },
    ],
  };
  assert.deepEqual(collectEvidenceSourceIds(pack), ["a", "b", "c"]);
  assert.deepEqual(collectEvidenceSourceIds({ sources: [] }), []);
  assert.deepEqual(collectEvidenceSourceIds({}), []);
});

// ---------------------------------------------------------------------------
// R7.1: AgenticOs_Document output shape + validity + non-empty flow.nodes[]
// ---------------------------------------------------------------------------

test("R7.1: emits a AgenticOs_Document { canvasDocumentMarkdown, flow:{nodes,edges} } valid against agentic-os-computing-flow/v1 with non-empty nodes", async () => {
  const result = await runStoryboardHarness(VALID_INPUT);

  assert.equal(result.status, "complete");
  assert.equal(result.gateId, STORYBOARD_GATE_ID);
  assert.equal(result.schema, AGENTIC_OS_COMPUTING_FLOW_SCHEMA);

  assert.equal(typeof result.canvasDocumentMarkdown, "string");
  assert.ok(result.canvasDocumentMarkdown.includes(`kgSchema: "${AGENTIC_OS_COMPUTING_FLOW_SCHEMA}"`));

  assert.ok(result.flow && typeof result.flow === "object");
  assert.ok(Array.isArray(result.flow.nodes), "flow.nodes must be an array");
  assert.ok(Array.isArray(result.flow.edges), "flow.edges must be an array");
  assert.ok(result.flow.nodes.length > 0, "flow.nodes must be non-empty (R7.1)");

  // The emitted document self-validates against the schema.
  assert.equal(result.schemaValid, true, JSON.stringify(result.schemaErrors));
  const validation = validateAgenticOsComputingFlowV1({
    canvasDocumentMarkdown: result.canvasDocumentMarkdown,
    flow: result.flow,
  });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
});

test("each node has id/label/type/status; edges chain consecutive shots and resolve to node ids", async () => {
  const result = await runStoryboardHarness(VALID_INPUT);
  const nodeIds = new Set();
  for (const node of result.flow.nodes) {
    for (const field of ["id", "label", "type", "status"]) {
      assert.equal(typeof node[field], "string");
      assert.ok(node[field].length > 0);
    }
    nodeIds.add(node.id);
  }
  // N shots -> N nodes (natural consequence; exact-N enforcement is task 3.6).
  assert.equal(result.flow.nodes.length, 5);
  // N-1 edges chaining consecutive nodes.
  assert.equal(result.flow.edges.length, 4);
  for (const edge of result.flow.edges) {
    assert.ok(nodeIds.has(edge.source));
    assert.ok(nodeIds.has(edge.target));
  }
});

test("storyboard claims reference only sourceIds present in the Evidence_Pack (clean 3.8 seam)", async () => {
  const result = await runStoryboardHarness(VALID_INPUT);
  const packIds = new Set(VALID_INPUT.evidencePack.sources.map((s) => s.sourceId));
  assert.ok(result.sourceReferences.every((id) => packIds.has(id)));
  for (const shot of result.plannedShots) {
    for (const id of shot.sourceCardIds) {
      assert.ok(packIds.has(id), `shot source ${id} must resolve to the Evidence_Pack`);
    }
  }
});

// ---------------------------------------------------------------------------
// Deterministic, network-free default
// ---------------------------------------------------------------------------

test("the default chat client is deterministic and records zero paid-provider calls", async () => {
  const a = await runStoryboardHarness(VALID_INPUT);
  const b = await runStoryboardHarness(VALID_INPUT);
  assert.equal(a.paidProviderCalls, 0);
  assert.equal(a.fallbackSubstituted, false);
  assert.equal(a.canvasDocumentMarkdown, b.canvasDocumentMarkdown);
  assert.deepEqual(a.flow, b.flow);
});

test("a default-shotCount run still emits a valid non-empty AgenticOs_Document", async () => {
  const { shotCount, ...rest } = VALID_INPUT;
  void shotCount;
  const result = await runStoryboardHarness(rest);
  assert.equal(result.shotCount, STORYBOARD_DEFAULT_SHOT_COUNT);
  assert.equal(result.schemaValid, true);
  assert.ok(result.flow.nodes.length > 0);
});

// ---------------------------------------------------------------------------
// Injectable BytePlus chat client seam (live wiring lands in task 9.2)
// ---------------------------------------------------------------------------

test("an injected chat client supplies the per-shot reasoning (sync)", async () => {
  let called = 0;
  const chatClient = {
    plan({ brief, sourceIds, shotCount }) {
      called += 1;
      assert.ok(brief.length > 0);
      assert.deepEqual(sourceIds, ["src-1", "src-2", "src-3", "src-4"]);
      assert.equal(shotCount, 5);
      return {
        shots: Array.from({ length: shotCount }, (_, i) => ({
          prompt: `injected scene ${i + 1}`,
          sourceCardIds: [sourceIds[0]],
        })),
      };
    },
  };
  const result = await runStoryboardHarness(VALID_INPUT, { chatClient });
  assert.equal(called, 1);
  assert.equal(result.plannedShots[0].prompt, "injected scene 1");
  assert.equal(result.schemaValid, true);
  // A non-deterministic (live) client lets the caller report paid-provider calls.
  assert.equal(result.paidProviderCalls, 0);
});

test("an injected async chat client is awaited and its paid-call count honored", async () => {
  const chatClient = {
    async plan({ shotCount }) {
      return { shots: Array.from({ length: shotCount }, (_, i) => ({ prompt: `async ${i + 1}`, sourceCardIds: [] })) };
    },
  };
  const result = await runStoryboardHarness(VALID_INPUT, { chatClient, paidProviderCalls: 1 });
  assert.equal(result.plannedShots[1].prompt, "async 2");
  assert.equal(result.paidProviderCalls, 1);
  assert.equal(result.schemaValid, true);
});

test("runId/referenceUrl deps are stamped into the canvas markdown", async () => {
  const result = await runStoryboardHarness(VALID_INPUT, {
    runId: "run-xyz",
    referenceUrl: "https://example.com/reference.mp4",
  });
  assert.ok(result.canvasDocumentMarkdown.includes("run-xyz"));
  assert.ok(result.canvasDocumentMarkdown.includes("https://example.com/reference.mp4"));
});

// ---------------------------------------------------------------------------
// validateAgenticOsComputingFlowV1 (exported gate reused by task 3.6)
// ---------------------------------------------------------------------------

test("validateAgenticOsComputingFlowV1 rejects an empty flow.nodes[] (R7.1 non-empty requirement)", () => {
  const out = validateAgenticOsComputingFlowV1({
    canvasDocumentMarkdown: `---\nkgSchema: "${AGENTIC_OS_COMPUTING_FLOW_SCHEMA}"\n---\n# x`,
    flow: { nodes: [], edges: [] },
  });
  assert.equal(out.valid, false);
  assert.ok(out.errors.some((e) => /non-empty/.test(e)));
});

test("validateAgenticOsComputingFlowV1 rejects a missing kgSchema declaration", () => {
  const out = validateAgenticOsComputingFlowV1({
    canvasDocumentMarkdown: "---\ntitle: nope\n---\n# x",
    flow: { nodes: [{ id: "n1", label: "L", type: "t", status: "planned" }], edges: [] },
  });
  assert.equal(out.valid, false);
  assert.ok(out.errors.some((e) => /kgSchema/.test(e)));
});

test("validateAgenticOsComputingFlowV1 rejects an edge that does not resolve to a node id", () => {
  const out = validateAgenticOsComputingFlowV1({
    canvasDocumentMarkdown: `---\nkgSchema: "${AGENTIC_OS_COMPUTING_FLOW_SCHEMA}"\n---\n# x`,
    flow: {
      nodes: [{ id: "n1", label: "L", type: "t", status: "planned" }],
      edges: [{ id: "e1", source: "n1", target: "ghost" }],
    },
  });
  assert.equal(out.valid, false);
  assert.ok(out.errors.some((e) => /does not resolve/.test(e)));
});

test("validateAgenticOsComputingFlowV1 rejects duplicate node ids", () => {
  const out = validateAgenticOsComputingFlowV1({
    canvasDocumentMarkdown: `---\nkgSchema: "${AGENTIC_OS_COMPUTING_FLOW_SCHEMA}"\n---\n# x`,
    flow: {
      nodes: [
        { id: "n1", label: "L", type: "t", status: "planned" },
        { id: "n1", label: "L2", type: "t", status: "planned" },
      ],
      edges: [],
    },
  });
  assert.equal(out.valid, false);
  assert.ok(out.errors.some((e) => /not unique/.test(e)));
});

test("validateAgenticOsComputingFlowV1 accepts a well-formed document", () => {
  const out = validateAgenticOsComputingFlowV1({
    canvasDocumentMarkdown: `---\nkgSchema: "${AGENTIC_OS_COMPUTING_FLOW_SCHEMA}"\n---\n# x`,
    flow: {
      nodes: [
        { id: "n1", label: "L1", type: "video-remix-shot", status: "planned" },
        { id: "n2", label: "L2", type: "video-remix-shot", status: "planned" },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2" }],
    },
  });
  assert.equal(out.valid, true, JSON.stringify(out.errors));
});

// ---------------------------------------------------------------------------
// Mock client builder is usable standalone (the seam task 9.2 swaps out)
// ---------------------------------------------------------------------------

test("createDeterministicStoryboardClient produces exactly shotCount evidence-grounded shots", () => {
  const client = createDeterministicStoryboardClient();
  const { shots } = client.plan({ brief: "b", sourceIds: ["s1", "s2"], shotCount: 3 });
  assert.equal(shots.length, 3);
  assert.deepEqual(shots[0].sourceCardIds, ["s1"]);
  assert.deepEqual(shots[1].sourceCardIds, ["s2"]);
  assert.deepEqual(shots[2].sourceCardIds, ["s1"]);
  // Clamp still applies inside the client.
  assert.equal(client.plan({ brief: "b", sourceIds: [], shotCount: 9999 }).shots.length, STORYBOARD_MAX_SHOTS);
});
