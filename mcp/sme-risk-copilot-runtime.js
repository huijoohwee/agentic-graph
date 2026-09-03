import { createCostLog } from "../contracts/cost-log.schema.js";
import { buildSemanticKey } from "../contracts/semantic-key.js";
import { inspectSmeSourceSafety, summarizeSmeSource } from "../contracts/sme-source-safety.js";
import { verifyGateToken } from "./video-remix/gate-token.js";

export const SME_MARKETPLACE_GATE_ID = "sme-marketplace-match";
export const SME_CARE_STATUS_VIEWS = Object.freeze([
  "capabilities",
  "cost_summary",
  "gate_catalog",
  "circuit_breakers",
]);

export const SME_GROWTH_TRIGGER_MAP = Object.freeze([
  { id: "first-hire", milestone: "first_hire", category: "employee_protection", domain: "asset_physical" },
  { id: "first-premises-lease", milestone: "first_premises_lease", category: "property_and_public_liability", domain: "asset_physical" },
  { id: "first-customer-data-tool", milestone: "first_customer_data_tool", category: "cyber_liability", domain: "cyber" },
  { id: "first-cross-border-vendor", milestone: "first_cross_border_vendor", category: "supply_chain_interruption", domain: "supply_chain" },
  { id: "first-overseas-market", milestone: "first_overseas_market", category: "local_statutory_review", domain: "supply_chain" },
  { id: "fundraise-or-key-person", milestone: "fundraise_or_key_person", category: "management_and_key_person_review", domain: "asset_physical" },
]);

const COVERAGE_CATALOG = Object.freeze([
  { category_id: "cyber_liability", domain: "cyber", label: "Cyber liability and incident response" },
  { category_id: "data_breach_response", domain: "cyber", label: "Data-breach response support" },
  { category_id: "supply_chain_interruption", domain: "supply_chain", label: "Supply-chain interruption protection" },
  { category_id: "marine_cargo", domain: "supply_chain", label: "Marine cargo protection" },
  { category_id: "trade_credit", domain: "supply_chain", label: "Trade-credit protection" },
  { category_id: "property_and_public_liability", domain: "asset_physical", label: "Property and public-liability protection" },
  { category_id: "business_interruption", domain: "asset_physical", label: "Business-interruption protection" },
  { category_id: "employee_protection", domain: "asset_physical", label: "Employee injury and compensation protection" },
  { category_id: "management_and_key_person_review", domain: "asset_physical", label: "Management liability and key-person review" },
  { category_id: "local_statutory_review", domain: "supply_chain", label: "Local statutory coverage review" },
]);

const NUDGE_TEMPLATES = Object.freeze({
  "en-SG": ({ milestone, category }) => `Your ${milestone} milestone may have opened a ${category} protection gap. Review what changed with a licensed broker before relying on current coverage.`,
  ms: ({ milestone, category }) => `Pencapaian ${milestone} anda mungkin membuka jurang perlindungan ${category}. Semak perubahan ini dengan broker berlesen sebelum bergantung pada perlindungan semasa.`,
  id: ({ milestone, category }) => `Tahap ${milestone} Anda mungkin membuka kesenjangan perlindungan ${category}. Tinjau perubahan ini bersama broker berizin sebelum mengandalkan perlindungan saat ini.`,
  zh: ({ milestone, category }) => `您的 ${milestone} 里程碑可能带来 ${category} 保障缺口。在依赖现有保障前，请与持牌保险经纪核实相关变化。`,
});

const zeroCost = (stage) => ({
  ...createCostLog({ model: "local-deterministic", prompt_tokens: 0, completion_tokens: 0, cache_hits: 0, estimated_cost_usd: 0 }),
  stage,
  paid_model_calls: 0,
});
const normalizeText = (value) => String(value || "").trim();
const normalizeToken = (value) => normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const fail = (code, details = {}) => ({
  ok: false,
  error: { code, ...details },
  cost_log: zeroCost(code),
  mutation_performed: false,
});

export function normalizeSmeCareSource(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return fail("invalid_source", { reason: "profile must be an object" });
  const safety = inspectSmeSourceSafety(profile);
  if (!safety.safe) {
    return fail("unsafe_source", {
      reason: "registry, financial-account, or credential-like input is forbidden",
      rejected_fields: safety.rejected_fields,
    });
  }
  return {
    ok: true,
    source_summary: summarizeSmeSource(profile),
    missing_fields: summarizeSmeSource(profile).missing_fields,
    cost_log: zeroCost("source_normalize"),
    mutation_performed: false,
  };
}

function validateRegDelta(regDelta) {
  if (!regDelta || typeof regDelta !== "object" || !Array.isArray(regDelta.changes)) return fail("invalid_reg_delta", { reason: "reg_delta.changes must be an array" });
  if (regDelta.changes.length > 100) return fail("invalid_reg_delta", { reason: "reg_delta.changes exceeds 100 entries" });
  const changes = [];
  for (let index = 0; index < regDelta.changes.length; index += 1) {
    const change = regDelta.changes[index];
    const element = normalizeToken(change?.element);
    const milestone = normalizeToken(change?.milestone);
    const sourceField = normalizeText(change?.source_field);
    if (!change || typeof change !== "object" || !["node", "edge", "cluster"].includes(element) || !milestone || !sourceField) {
      return fail("invalid_reg_delta", { path: `changes[${index}]`, reason: "element, milestone, and one source_field are required" });
    }
    changes.push({ element, milestone, source_field: sourceField, operation: normalizeToken(change.operation || "added") });
  }
  return { ok: true, changes };
}

export function evaluateSmeGrowthTriggers(regDelta) {
  const validation = validateRegDelta(regDelta);
  if (!validation.ok) return validation;
  const rulesByMilestone = new Map(SME_GROWTH_TRIGGER_MAP.map((rule) => [rule.milestone, rule]));
  const emitted = new Map();
  for (const change of validation.changes) {
    if (change.operation !== "added") continue;
    const rule = rulesByMilestone.get(change.milestone);
    if (!rule || emitted.has(rule.id)) continue;
    emitted.set(rule.id, {
      id: rule.id,
      rule_id: rule.id,
      milestone: rule.milestone,
      category: rule.category,
      domain: rule.domain,
      source_field: change.source_field,
      reg_element: change.element,
      state: "draft",
    });
  }
  const triggerEvents = [...emitted.values()];
  return {
    ok: true,
    matched_rule_id: triggerEvents[0]?.rule_id || null,
    matched_rule_ids: triggerEvents.map((event) => event.rule_id),
    trigger_event: triggerEvents[0] || null,
    trigger_events: triggerEvents,
    none: triggerEvents.length === 0,
    cost_log: zeroCost("growth_trigger_evaluate"),
    mutation_performed: false,
  };
}

export function adaptSmeCareText({ text, target_lang: targetLang, localized_variants: variants = {}, adapter_available: available = false } = {}) {
  const source = normalizeText(text);
  const requested = normalizeText(targetLang).toLowerCase();
  if (!source || !["en", "en-sg", "ms", "id", "zh"].includes(requested)) return fail("invalid_multilingual_request", { reason: "text and target_lang=en|en-SG|ms|id|zh are required" });
  if (["en", "en-sg"].includes(requested)) return { ok: true, text: source, lang: "en-SG", cost_log: zeroCost("multilingual_adapter"), mutation_performed: false };
  const localized = available ? normalizeText(variants?.[requested]) : "";
  if (localized) return { ok: true, text: localized, lang: requested, cost_log: zeroCost("multilingual_adapter"), mutation_performed: false };
  return {
    ok: true,
    text: source,
    lang: "en-SG",
    fallback_reason: available ? "requested_language_output_unavailable" : "local_multilingual_adapter_unavailable",
    cost_log: zeroCost("multilingual_adapter_fallback"),
    mutation_performed: false,
  };
}

export function draftSmeBrokerNudge({ trigger_event: triggerEvent, target_lang: targetLang = "en-SG", adapter_available: available = true } = {}) {
  const rule = SME_GROWTH_TRIGGER_MAP.find((entry) => entry.id === triggerEvent?.rule_id && entry.milestone === triggerEvent?.milestone);
  if (!rule) return fail("unmatched_trigger_event", { reason: "trigger_event must match one declared Growth-Stage Trigger Map row" });
  const requested = normalizeText(targetLang).toLowerCase();
  const lang = requested === "en" ? "en-SG" : requested;
  const template = available ? NUDGE_TEMPLATES[lang] : null;
  const fallback = NUDGE_TEMPLATES["en-SG"](rule);
  const nudge = template ? template(rule) : fallback;
  return {
    ok: true,
    draft_artifact_id: buildSemanticKey("sme.nudge.draft", { rule_id: rule.id, source_field: triggerEvent.source_field, lang: template ? lang : "en-SG" }),
    nudge_draft: nudge,
    lang: template ? lang : "en-SG",
    ...(template ? {} : { fallback_reason: "local_multilingual_adapter_unavailable" }),
    approval_state: "pending",
    send_events: [],
    cost_log: zeroCost("broker_nudge_template"),
    mutation_performed: false,
  };
}

export function matchSmeCoverageCategories({ approved_gap_id: gapId, gap, approval_token: approvalToken, max_candidates: maxCandidates = 10 } = {}, { now = Date.now() } = {}) {
  const normalizedGapId = normalizeText(gapId);
  const domain = normalizeToken(gap?.domain);
  if (!normalizedGapId || !["cyber", "supply_chain", "asset_physical"].includes(domain)) return fail("invalid_approved_gap", { reason: "approved_gap_id and gap.domain are required" });
  const approval = verifyGateToken(approvalToken, { gateId: SME_MARKETPLACE_GATE_ID, now });
  if (!approval.valid) return fail("approval_required", { gate_id: SME_MARKETPLACE_GATE_ID, reason: approval.reason });
  const limit = Number.isInteger(maxCandidates) ? Math.min(10, Math.max(1, maxCandidates)) : 10;
  const candidates = COVERAGE_CATALOG
    .map((entry) => ({ ...entry, score: entry.domain === domain ? 100 : 25 }))
    .sort((left, right) => right.score - left.score || left.category_id.localeCompare(right.category_id))
    .slice(0, limit)
    .map((entry, index) => ({ rank: index + 1, ...entry, rationale: entry.domain === domain ? "Direct category-level domain match." : "Secondary category for licensed-broker review." }));
  approvalToken.consumed = true;
  const packetId = buildSemanticKey("sme.broker.handoff", { approved_gap_id: normalizedGapId, candidate_ids: candidates.map((entry) => entry.category_id) });
  return {
    ok: true,
    approved_gap_id: normalizedGapId,
    scored_candidates: candidates,
    handoff_packet: {
      id: packetId,
      status: "ready_for_licensed_broker_review",
      advisory_boundary: "Category-level decision support only; no quote, bind, policy, premium, insurer, or product selection.",
      candidate_category_ids: candidates.map((entry) => entry.category_id),
    },
    approval_state: "approved",
    cost_log: zeroCost("marketplace_rule_match"),
    mutation_performed: false,
  };
}

export function readSmeCareAgentStatus(view) {
  const normalizedView = normalizeText(view);
  if (!SME_CARE_STATUS_VIEWS.includes(normalizedView)) return fail("invalid_view", { allowed: [...SME_CARE_STATUS_VIEWS] });
  const base = { ok: true, view: normalizedView, unavailableSources: [], cost_log: zeroCost("sme_care_agent_status"), mutation_performed: false };
  if (normalizedView === "capabilities") return { ...base, entries: ["agentic-graph.probe.generate", "agentic-graph.probe.select", "agentic-graph.probe.evolve", "agentic-graph.sme.source.normalize", "agentic-graph.sme.trigger.evaluate", "agentic-graph.sme.broker.draft_nudge", "agentic-graph.sme.marketplace.match", "agentic-graph.sme.multilingual.adapt"] };
  if (normalizedView === "cost_summary") return { ...base, totals: { prompt_tokens: 0, completion_tokens: 0, cache_hits: 0, paid_model_calls: 0, estimated_cost_usd: 0 } };
  if (normalizedView === "gate_catalog") return { ...base, gates: [{ id: SME_MARKETPLACE_GATE_ID, action: "category-level broker handoff", ttl_ms: 900_000, single_use: true }, { id: "operator-outbound-send", action: "outbound nudge send", status: "not_implemented" }] };
  return { ...base, breakers: [{ id: "probe_tree", max_iterations: 5, stop: "leaf_or_token_budget_1200" }, { id: "trigger_engine", max_iterations: 1, stop: "declared_rule_scan_complete" }, { id: "broker_nudge", max_iterations: 1, stop: "draft_created_or_validation_failed" }, { id: "marketplace_matcher", max_iterations: 1, stop: "catalog_round_complete_or_approval_denied" }] };
}

export async function runSmeRiskCopilotTool(toolName, args = {}, options = {}) {
  if (toolName === "agentic-graph.sme.source.normalize") return normalizeSmeCareSource(args.profile);
  if (toolName === "agentic-graph.sme.trigger.evaluate") return evaluateSmeGrowthTriggers(args.reg_delta);
  if (toolName === "agentic-graph.sme.broker.draft_nudge") return draftSmeBrokerNudge(args);
  if (toolName === "agentic-graph.sme.marketplace.match") return matchSmeCoverageCategories(args, options);
  if (toolName === "agentic-graph.sme.multilingual.adapt") return adaptSmeCareText(args);
  if (toolName === "sme_care_agent_status") return readSmeCareAgentStatus(args.view);
  return fail("unknown_sme_risk_copilot_tool", { tool: toolName });
}
