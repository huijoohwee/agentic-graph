// =============================================================================
// Property-based tests — published shared contracts (spec task 9.1).
// Property 13 (Kgc_Document round-trip) and Property 19 (Cost_Log field-domain
// validity). fast-check, >=100 runs each. The contract validators are PURE and
// dependency-free, so no external deps exist to mock — ZERO live calls.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import {
  parseKgcDocument,
  serializeKgcDocument,
  kgcFlowEquivalent,
  kgcRoundTripEquivalent,
  KGC_COMPUTING_FLOW_SCHEMA,
} from "../kgc-document.schema.js";
import {
  validateCostLog,
  createCostLog,
  COST_LOG_UNKNOWN,
} from "../cost-log.schema.js";

const RUNS = 200;

const idArb = fc.string({ minLength: 1, maxLength: 10 }).map((s) => s.replace(/[^A-Za-z0-9]/g, "n") || "n");

const nodeArb = fc.record({
  id: idArb,
  label: fc.string({ maxLength: 12 }),
  type: fc.constantFrom("video-remix-shot", "note", "group"),
  status: fc.constantFrom("planned", "rendered", "draft"),
});

// -----------------------------------------------------------------------------
// Feature: agenticgraph-acos-mcp-connector, Property 13: For any emitted Kgc_Document, parsing the document, serializing the parsed result, then parsing it again produces an equivalent flow structure -- identical node count, identical set of node identifiers, identical node ordering, and identical edge connections between nodes.
// -----------------------------------------------------------------------------
test("Property 13: Kgc_Document round-trip preservation", () => {
  fc.assert(
    fc.property(
      fc.array(nodeArb, { minLength: 0, maxLength: 30 }),
      (nodes) => {
        // Edges connect consecutive nodes (referential by construction); varied
        // node counts, id sets, and orderings are explored by the node array.
        const edges = nodes.slice(1).map((n, i) => ({ id: `edge-${i + 1}`, source: nodes[i].id, target: n.id }));
        const doc = {
          schema: KGC_COMPUTING_FLOW_SCHEMA,
          canvasDocumentMarkdown: `---\nkgSchema: "${KGC_COMPUTING_FLOW_SCHEMA}"\n---\n# plan`,
          flow: { nodes, edges },
        };

        // parse -> serialize -> parse yields an equivalent flow structure.
        const once = parseKgcDocument(doc);
        const twice = parseKgcDocument(serializeKgcDocument(once));
        assert.equal(kgcFlowEquivalent(once.flow, twice.flow), true);
        // Identical node count + ordering + id set preserved through the cycle.
        assert.equal(twice.flow.nodes.length, nodes.length);
        assert.deepEqual(twice.flow.nodes.map((n) => n.id), nodes.map((n) => n.id));
        // The canonical guarantee holds (and is byte-stable on the 2nd pass).
        assert.equal(kgcRoundTripEquivalent(doc), true);
      },
    ),
    { numRuns: RUNS },
  );
});

// -----------------------------------------------------------------------------
// Feature: agenticgraph-acos-mcp-connector, Property 19: For any completed model call, the emitted Cost_Log contains a non-empty model, prompt_tokens and completion_tokens that are integers >= 0 or an explicit unknown indicator, cache_hits >= 0, and estimated_cost_usd >= 0.00; entries with unknown token counts are marked incomplete and retained rather than discarded.
// -----------------------------------------------------------------------------
test("Property 19: Cost_Log field-domain validity", () => {
  const tokenFieldArb = fc.oneof(
    fc.integer({ min: 0, max: 100000 }),
    fc.constant(COST_LOG_UNKNOWN),
  );

  // Valid half: any in-domain combination, with `incomplete` derived to satisfy
  // the R10.2 consistency rule (createCostLog mirrors the Ai_Gateway).
  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 16 }).filter((s) => s.trim().length > 0),
      tokenFieldArb,
      tokenFieldArb,
      fc.integer({ min: 0, max: 10000 }),
      fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }).map((n) => Number(n.toFixed(4))),
      (model, prompt_tokens, completion_tokens, cache_hits, estimated_cost_usd) => {
        const log = createCostLog({ model, prompt_tokens, completion_tokens, cache_hits, estimated_cost_usd });
        const result = validateCostLog(log);
        assert.equal(result.valid, true, JSON.stringify(result.errors));
        // Unknown token counts -> marked incomplete and retained (not discarded).
        const anyUnknown = log.prompt_tokens === COST_LOG_UNKNOWN || log.completion_tokens === COST_LOG_UNKNOWN;
        assert.equal(log.incomplete, anyUnknown);
      },
    ),
    { numRuns: RUNS },
  );

  // Invalid half: an out-of-domain field is rejected with a structured error.
  const invalidArb = fc.oneof(
    fc.constant({ model: "", prompt_tokens: 1, completion_tokens: 1, cache_hits: 0, estimated_cost_usd: 0, incomplete: false }),
    fc.constant({ model: "m", prompt_tokens: -1, completion_tokens: 1, cache_hits: 0, estimated_cost_usd: 0, incomplete: false }),
    fc.constant({ model: "m", prompt_tokens: 1.5, completion_tokens: 1, cache_hits: 0, estimated_cost_usd: 0, incomplete: false }),
    fc.constant({ model: "m", prompt_tokens: 1, completion_tokens: 1, cache_hits: -2, estimated_cost_usd: 0, incomplete: false }),
    fc.constant({ model: "m", prompt_tokens: 1, completion_tokens: 1, cache_hits: 0, estimated_cost_usd: -0.01, incomplete: false }),
    // unknown token without incomplete:true -> consistency violation
    fc.constant({ model: "m", prompt_tokens: COST_LOG_UNKNOWN, completion_tokens: 1, cache_hits: 0, estimated_cost_usd: 0, incomplete: false }),
  );
  fc.assert(
    fc.property(invalidArb, (log) => {
      const result = validateCostLog(log);
      assert.equal(result.valid, false);
      assert.ok(result.errors.length >= 1 && result.errors.every((e) => typeof e.path === "string"));
    }),
    { numRuns: 100 },
  );
});
