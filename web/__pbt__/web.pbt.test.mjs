// =============================================================================
// Property-based tests — Vercel Frontend view/validation logic (spec task 9.1).
// Properties 5 and 32. fast-check, >=100 runs each. The view builders and the
// submission validator are PURE and perform no I/O — ZERO live calls. The
// `POST /run` forward is an injected seam (Property 5) so no network occurs.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import { guardedSubmit, validateSubmission } from "../src/lib/submission-validation.js";
import { buildRunManifestView } from "../src/lib/run-manifest-view.js";
import { buildApprovalPromptView } from "../src/lib/approval-prompt-view.js";
import { buildShotPlanView } from "../src/lib/shot-plan-view.js";
import { buildEvidencePackView } from "../src/lib/evidence-pack-view.js";

const RUNS = 200;
const wordArb = fc.string({ minLength: 1, maxLength: 16 }).map((s) => s.replace(/[^A-Za-z0-9]/g, "x") || "x");

// -----------------------------------------------------------------------------
// Feature: agenticgraph-acos-mcp-connector, Property 5: For any submission where the reference URL is empty or not a syntactically valid HTTP/HTTPS URL, or the brief is empty or exceeds 5,000 characters, or the budget cap is not a number in [0.01, 999,999.99], the Frontend rejects the submission, displays an error identifying the invalid field, and does not forward to POST /run.
// -----------------------------------------------------------------------------
test("Property 5: Frontend input validation rejects malformed submissions", async () => {
  // Invalid submissions: each carries the field expected to be named.
  const invalidArb = fc.oneof(
    fc.constantFrom("", "   ", "not-a-url", "ftp://x.co/a", "/relative").map((u) => ({ sub: { referenceUrl: u, brief: "ok", budgetUsd: 10 }, field: "referenceUrl" })),
    fc.constant({ sub: { brief: "ok", budgetUsd: 10 }, field: "referenceUrl" }),
    fc.constant({ sub: { referenceUrl: "https://x.co/v", brief: "", budgetUsd: 10 }, field: "brief" }),
    fc.integer({ min: 5001, max: 5200 }).map((n) => ({ sub: { referenceUrl: "https://x.co/v", brief: "b".repeat(n), budgetUsd: 10 }, field: "brief" })),
    fc.constantFrom(0, -1, 1_000_000, Number.NaN, "10").map((b) => ({ sub: { referenceUrl: "https://x.co/v", brief: "ok", budgetUsd: b }, field: "budgetUsd" })),
  );
  await fc.assert(
    fc.asyncProperty(invalidArb, async ({ sub, field }) => {
      const result = validateSubmission(sub);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.field === field));
      // Does NOT forward to POST /run.
      let forwarded = 0;
      const guard = await guardedSubmit(sub, () => { forwarded += 1; return { ok: true }; });
      assert.equal(guard.forwarded, false);
      assert.equal(forwarded, 0);
      assert.ok(guard.errors.length >= 1);
    }),
    { numRuns: RUNS },
  );

  // Valid submissions forward exactly once (the converse keeps the gate honest).
  const validArb = fc.record({
    referenceUrl: fc.constantFrom("https://x.co/v", "http://ref.test/a"),
    brief: fc.string({ minLength: 1, maxLength: 100 }).map((s) => (s.trim().length ? s : "brief")),
    budgetUsd: fc.double({ min: 0.01, max: 999_999.99, noNaN: true, noDefaultInfinity: true }).map((n) => Number(n.toFixed(2))),
  });
  await fc.assert(
    fc.asyncProperty(validArb, async (sub) => {
      assert.equal(validateSubmission(sub).valid, true);
      let forwarded = 0;
      const guard = await guardedSubmit(sub, () => { forwarded += 1; return { ok: true }; });
      assert.equal(guard.forwarded, true);
      assert.equal(forwarded, 1);
    }),
    { numRuns: RUNS },
  );
});

// -----------------------------------------------------------------------------
// Feature: agenticgraph-acos-mcp-connector, Property 32: For any Run_Manifest received by the Frontend, the rendered output reflects the current Run_State, the complete stage list, and the Budget_Meters; and for any Run_Manifest containing pending Approval_Gate entries, exactly one approval prompt is rendered per pending gate, each displaying the gate identifier and the associated spend amount. The shot-plan render contains exactly one visual node per planned shot in the Kgc_Document, and every Evidence_Pack source is displayed.
// -----------------------------------------------------------------------------
test("Property 32: manifest and approval-prompt rendering completeness", () => {
  const gateArb = fc.record({
    gateId: fc.constantFrom("paid-model-call", "render-action", "payment-action", "cloud-deploy"),
    approvalState: fc.constantFrom("pending", "approved", "rejected"),
    estimatedCostUsd: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }).map((n) => Number(n.toFixed(2))),
    token: fc.constant(null),
  });
  const stageArb = fc.record({
    id: wordArb,
    gateId: wordArb,
    status: fc.constantFrom("pending", "running", "complete", "approval_required", "blocked"),
  });
  const manifestArb = fc.record({
    state: fc.constantFrom("running", "blocked", "approval_required", "completed", "budget_exceeded"),
    stages: fc.uniqueArray(stageArb, { selector: (stage) => stage.id, maxLength: 12 }),
    approvalGates: fc.array(gateArb, { maxLength: 8 }),
    budgetMeters: fc.record({
      estimatedCostUsd: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }).map((n) => Number(n.toFixed(2))),
      actualCostUsd: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }).map((n) => Number(n.toFixed(2))),
      providerSpendUsd: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }).map((n) => Number(n.toFixed(2))),
    }),
  });

  fc.assert(
    fc.property(manifestArb, (manifest) => {
      // Manifest view reflects current Run_State, the complete stage list, and meters.
      const view = buildRunManifestView(manifest);
      assert.equal(view.runState, manifest.state);
      assert.deepEqual(view.stages.map(({ id }) => id), manifest.stages.map(({ id }) => id));
      assert.equal(view.budgetMeters.estimatedCostUsd, manifest.budgetMeters.estimatedCostUsd);
      assert.equal(view.budgetMeters.actualCostUsd, manifest.budgetMeters.actualCostUsd);
      assert.equal(view.budgetMeters.providerSpendUsd, manifest.budgetMeters.providerSpendUsd);

      // Exactly one approval prompt per PENDING gate, each with gate id + spend.
      const promptView = buildApprovalPromptView(manifest);
      const pendingGates = manifest.approvalGates.filter((g) => g.approvalState === "pending");
      assert.equal(promptView.prompts.length, pendingGates.length);
      for (const prompt of promptView.prompts) {
        assert.ok(typeof prompt.gateId === "string" && prompt.gateId.length > 0);
        assert.equal(typeof prompt.estimatedCostUsd, "number");
        assert.equal(prompt.approvalState, "pending");
      }
    }),
    { numRuns: RUNS },
  );

  // Shot-plan: exactly one visual node per planned shot in the Kgc_Document.
  const nodeArb = fc.record({ id: wordArb, label: fc.string({ maxLength: 8 }), type: fc.constant("video-remix-shot"), status: fc.constant("planned") });
  fc.assert(
    fc.property(fc.array(nodeArb, { minLength: 0, maxLength: 30 }), (nodes) => {
      const edges = nodes.slice(1).map((n, i) => ({ id: `e-${i}`, source: nodes[i].id, target: n.id }));
      const view = buildShotPlanView({ flow: { nodes, edges } });
      assert.equal(view.nodes.length, nodes.length);
      assert.equal(view.shotCount, nodes.length);
    }),
    { numRuns: RUNS },
  );

  // Evidence pack: every Source_Card is displayed (one entry per source).
  const sourceArb = fc.record({ sourceId: wordArb.map((s) => `src-${s}`), url: fc.webUrl() });
  fc.assert(
    fc.property(fc.array(sourceArb, { maxLength: 20 }), (sources) => {
      const citations = sources.map((s) => ({ sourceId: s.sourceId, url: s.url }));
      const view = buildEvidencePackView({ sources, citations, summary: "s" });
      assert.equal(view.count, sources.length);
      assert.equal(view.sources.length, sources.length);
    }),
    { numRuns: RUNS },
  );
});
