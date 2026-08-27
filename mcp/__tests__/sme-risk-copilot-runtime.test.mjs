import assert from "node:assert/strict";
import test from "node:test";

import { SME_PROFILE_SCHEMA_ID, parseSmeProfileMarkdown } from "../../contracts/sme-profile.schema.js";
import { validateCostLog } from "../../contracts/cost-log.schema.js";
import { buildAgenticGraphLocalMcpToolDefinitions } from "../local-tool-contract.js";
import { buildSmeCanvasEvidence } from "../sme-risk-coverage/canvas-evidence.js";
import { computeSmeRiskRun } from "../sme-risk-coverage/core.js";
import {
  SME_CARE_STATUS_VIEWS,
  SME_GROWTH_TRIGGER_MAP,
  SME_MARKETPLACE_GATE_ID,
  adaptSmeCareText,
  draftSmeBrokerNudge,
  evaluateSmeGrowthTriggers,
  matchSmeCoverageCategories,
  normalizeSmeCareSource,
  readSmeCareAgentStatus,
} from "../sme-risk-copilot-runtime.js";

const profile = (overrides = {}) => ({
  schema: SME_PROFILE_SCHEMA_ID,
  profile_id: "synthetic-growth-stage",
  industry: "logistics",
  size: 48,
  growth_stage: "growth",
  assets: ["warehouse equipment"],
  digital_footprint: "online booking and staff email",
  suppliers: ["regional logistics supplier"],
  declared_coverage: [{ category: "cyber", scope: "full" }],
  ...overrides,
});

const assertZeroCost = (costLog) => {
  assert.equal(validateCostLog(costLog).valid, true);
  assert.equal(costLog.prompt_tokens, 0);
  assert.equal(costLog.completion_tokens, 0);
  assert.equal(costLog.estimated_cost_usd, 0);
};

test("source normalization rejects sensitive fields before persistence or spend", () => {
  const accepted = normalizeSmeCareSource(profile({ suppliers: undefined }));
  assert.equal(accepted.ok, true);
  assert.ok(accepted.missing_fields.includes("suppliers"));
  assert.equal(accepted.mutation_performed, false);
  assertZeroCost(accepted.cost_log);

  const rejected = normalizeSmeCareSource({ ...profile(), bank_account: "redacted" });
  assert.equal(rejected.ok, false);
  assert.deepEqual(rejected.error.rejected_fields, ["bank_account"]);
  assert.doesNotMatch(JSON.stringify(rejected), /redacted/);
  assertZeroCost(rejected.cost_log);

  const markdown = `---\nschema: ${JSON.stringify(SME_PROFILE_SCHEMA_ID)}\nprofile_id: "synthetic-safe"\nindustry: "services"\nsize: 2\ngrowth_stage: "pre_seed"\napi_key: "redacted"\n---\n`;
  const parsed = parseSmeProfileMarkdown(markdown);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error.code, "unsafe_sme_profile");
});

test("trigger engine emits only the six declared milestones with one source owner each", () => {
  const result = evaluateSmeGrowthTriggers({
    changes: SME_GROWTH_TRIGGER_MAP.map((rule, index) => ({ element: index % 2 ? "edge" : "node", milestone: rule.milestone, source_field: `growth_signals[${index}]`, operation: "added" })),
  });
  assert.equal(result.ok, true);
  assert.deepEqual(new Set(result.matched_rule_ids), new Set(SME_GROWTH_TRIGGER_MAP.map((rule) => rule.id)));
  assert.ok(result.trigger_events.every((event) => event.source_field && SME_GROWTH_TRIGGER_MAP.some((rule) => rule.id === event.rule_id)));
  assertZeroCost(result.cost_log);

  const unmatched = evaluateSmeGrowthTriggers({ changes: [{ element: "node", milestone: "routine_update", source_field: "notes", operation: "added" }] });
  assert.equal(unmatched.none, true);
  assert.deepEqual(unmatched.trigger_events, []);
  assert.equal(evaluateSmeGrowthTriggers({ changes: [{ element: "node", milestone: "first_hire" }] }).error.code, "invalid_reg_delta");
});

test("broker nudge stays draft-only and supports local language or explicit fallback", () => {
  const trigger = evaluateSmeGrowthTriggers({ changes: [{ element: "node", milestone: "first_customer_data_tool", source_field: "digital_footprint" }] }).trigger_event;
  for (const lang of ["en-SG", "ms", "id", "zh"]) {
    const result = draftSmeBrokerNudge({ trigger_event: trigger, target_lang: lang });
    assert.equal(result.ok, true);
    assert.equal(result.lang, lang);
    assert.equal(result.approval_state, "pending");
    assert.deepEqual(result.send_events, []);
    assertZeroCost(result.cost_log);
  }
  const fallback = draftSmeBrokerNudge({ trigger_event: trigger, target_lang: "zh", adapter_available: false });
  assert.equal(fallback.lang, "en-SG");
  assert.ok(fallback.fallback_reason);
  assert.equal(draftSmeBrokerNudge({ trigger_event: { rule_id: "invented", milestone: "invented" } }).error.code, "unmatched_trigger_event");

  const adapterFallback = adaptSmeCareText({ text: "Review the change.", target_lang: "ms" });
  assert.equal(adapterFallback.lang, "en-SG");
  assert.ok(adapterFallback.fallback_reason);
});

test("marketplace matching is approval-gated, category-only, bounded, and single-use", () => {
  const now = Date.UTC(2026, 6, 14, 6, 0, 0);
  const request = { approved_gap_id: "synthetic-gap", gap: { domain: "cyber" }, max_candidates: 10 };
  const blocked = matchSmeCoverageCategories(request, { now });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error.code, "approval_required");
  assertZeroCost(blocked.cost_log);

  const approvalToken = { gateId: SME_MARKETPLACE_GATE_ID, issuedAt: now, consumed: false, verified: true, tokenId: "synthetic-approval" };
  const matched = matchSmeCoverageCategories({ ...request, approval_token: approvalToken }, { now });
  assert.equal(matched.ok, true);
  assert.ok(matched.scored_candidates.length > 0 && matched.scored_candidates.length <= 10);
  assert.equal(matched.scored_candidates[0].domain, "cyber");
  assert.ok(matched.handoff_packet.id);
  assert.doesNotMatch(JSON.stringify(matched), /"(?:quote_id|bind_id|policy_number)"/);
  assert.equal(approvalToken.consumed, true);
  assert.equal(matchSmeCoverageCategories({ ...request, approval_token: approvalToken }, { now }).error.reason, "consumed");
});

test("SME status views and MCP discovery are typed, read-only, and exact-zero-cost", () => {
  for (const view of SME_CARE_STATUS_VIEWS) {
    const before = JSON.stringify(SME_GROWTH_TRIGGER_MAP);
    const result = readSmeCareAgentStatus(view);
    assert.equal(result.ok, true);
    assert.equal(result.view, view);
    assert.deepEqual(result.unavailableSources, []);
    assert.equal(result.mutation_performed, false);
    assertZeroCost(result.cost_log);
    assert.equal(JSON.stringify(SME_GROWTH_TRIGGER_MAP), before);
  }
  const names = new Set(buildAgenticGraphLocalMcpToolDefinitions().map((tool) => tool.name));
  for (const name of ["agenticgraph.sme.source.normalize", "agenticgraph.sme.trigger.evaluate", "agenticgraph.sme.broker.draft_nudge", "agenticgraph.sme.marketplace.match", "agenticgraph.sme.multilingual.adapt", "sme_care_agent_status"]) assert.equal(names.has(name), true, name);
});

test("Canvas projection marks each exposure relationship with red, amber, or green coverage state", () => {
  const run = computeSmeRiskRun(profile()).run;
  const evidence = buildSmeCanvasEvidence(run);
  const coverageEdges = evidence.flow.edges.filter((edge) => edge.data?.visual_role === "risk_coverage");
  assert.equal(coverageEdges.length, 3);
  assert.deepEqual(new Set(coverageEdges.map((edge) => edge.data.coverage_state)), new Set(["covered", "uncovered"]));
  assert.ok(coverageEdges.every((edge) => ["#16a34a", "#d97706", "#dc2626"].includes(edge.data.color)));
});
