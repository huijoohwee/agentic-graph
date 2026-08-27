import { validateCostLog } from "./cost-log.schema.js";
import { SME_RISK_DOMAINS, validateSmeProfile } from "./sme-profile.schema.js";

export const SME_RISK_RUN_SCHEMA_ID = "agenticgraph-sme-risk-run/v1";
export const SME_SEVERITIES = Object.freeze(["critical", "high", "medium", "low"]);
export const SME_MATCH_OUTCOMES = Object.freeze(["covered", "partially_covered", "uncovered"]);
export const SME_LIKELIHOODS = Object.freeze(["low", "medium", "high"]);
export const SME_GUIDANCE_DISCLAIMER = "Decision-support guidance only; this is not regulated financial or insurance advice.";

export function validateSmeRiskRun(run) {
  const errors = [];
  const add = (path, reason) => errors.push({ path, reason });
  const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const isText = (value) => typeof value === "string" && value.trim().length > 0;
  const requireArray = (field) => {
    if (!Array.isArray(run[field])) {
      add(field, "must be an array");
      return [];
    }
    return run[field];
  };
  if (!run || typeof run !== "object" || Array.isArray(run)) return { valid: false, errors: [{ path: "", reason: "run must be an object" }] };
  if (run.contractVersion !== SME_RISK_RUN_SCHEMA_ID) add("contractVersion", `must equal ${SME_RISK_RUN_SCHEMA_ID}`);
  for (const field of ["runId", "skillVariant", "skillId"]) if (!isText(run[field])) add(field, "must be a non-empty string");
  const profileValidation = validateSmeProfile(run.profile);
  if (!profileValidation.ok) add("profile", JSON.stringify(profileValidation.error));
  if (!isRecord(run.topology) || run.topology.pattern !== "fan-out/fan-in" || run.topology.maxIterations !== 1) add("topology", "must be the bounded one-pass fan-out/fan-in topology");
  if (!Array.isArray(run.topology?.domains) || run.topology.domains.length !== SME_RISK_DOMAINS.length || SME_RISK_DOMAINS.some((domain) => !run.topology.domains.includes(domain))) add("topology.domains", "must contain exactly the three declared SME risk domains");
  if (!Array.isArray(run.topology?.circuitBreakers) || run.topology.circuitBreakers.length === 0) add("topology.circuitBreakers", "must be a non-empty array");
  const exposures = run.exposureProfile?.exposures;
  if (!Array.isArray(exposures)) add("exposureProfile.exposures", "must be an array");
  else {
    if (exposures.length !== SME_RISK_DOMAINS.length) add("exposureProfile.exposures", "must contain exactly three exposures");
    for (const domain of SME_RISK_DOMAINS) if (exposures.filter((entry) => entry.domain === domain).length !== 1) add("exposureProfile.exposures", `must cover ${domain} exactly once`);
    exposures.forEach((entry, index) => {
      if (!isText(entry?.key) || !isText(entry?.type) || !isText(entry?.description)) add(`exposureProfile.exposures[${index}]`, "key, type, and description are required");
      if (!SME_LIKELIHOODS.includes(entry?.likelihood) || !SME_LIKELIHOODS.includes(entry?.impact)) add(`exposureProfile.exposures[${index}]`, "likelihood and impact must be low, medium, or high");
      if (!Array.isArray(entry?.source_fields) || entry.source_fields.length === 0 || entry.source_fields.some((field) => !isText(field))) add(`exposureProfile.exposures[${index}].source_fields`, "must trace to at least one profile field");
      if (!["declared", "insufficient_input"].includes(entry?.resolution)) add(`exposureProfile.exposures[${index}].resolution`, "invalid resolution");
    });
  }
  const exposureKeys = new Set(Array.isArray(exposures) ? exposures.map((entry) => entry.key) : []);
  const coverageMatches = requireArray("coverageMatches");
  if (coverageMatches.length !== exposureKeys.size) add("coverageMatches", "must contain one match per exposure");
  coverageMatches.forEach((entry, index) => {
    if (!exposureKeys.has(entry?.exposure_key)) add(`coverageMatches[${index}].exposure_key`, "must reference an exposure");
    if (!SME_MATCH_OUTCOMES.includes(entry?.outcome)) add(`coverageMatches[${index}].outcome`, "invalid outcome");
  });
  const gaps = requireArray("gaps");
  gaps.forEach((entry, index) => {
    if (!isText(entry?.key) || !exposureKeys.has(entry?.exposure_key)) add(`gaps[${index}]`, "key and valid exposure_key are required");
    if (!SME_SEVERITIES.includes(entry?.severity) || !SME_MATCH_OUTCOMES.includes(entry?.match_outcome)) add(`gaps[${index}]`, "invalid severity or match outcome");
  });
  const unknownRisks = requireArray("unknownRisks");
  unknownRisks.forEach((entry, index) => {
    if (!isText(entry?.key) || !exposureKeys.has(entry?.exposure_key) || !Array.isArray(entry?.trigger_fields) || entry.trigger_fields.length === 0) add(`unknownRisks[${index}]`, "must be traceable to one exposure and trigger field set");
  });
  const gapKeys = new Set(gaps.map((entry) => entry.key));
  const protections = requireArray("protections");
  protections.forEach((entry, index) => {
    if (!isText(entry?.key) || !gapKeys.has(entry?.gap_key) || !exposureKeys.has(entry?.exposure_key) || !SME_SEVERITIES.includes(entry?.severity) || !isText(entry?.guidance)) add(`protections[${index}]`, "must contain traceable provider-neutral guidance");
  });
  const visibleKeys = new Set([...gaps, ...unknownRisks, ...protections].map((entry) => entry.key));
  const rationales = requireArray("rationales");
  for (const itemKey of visibleKeys) if (rationales.filter((entry) => entry.item_key === itemKey).length !== 1) add("rationales", `must contain exactly one rationale for ${itemKey}`);
  rationales.forEach((entry, index) => {
    if (!isText(entry?.key) || !visibleKeys.has(entry?.item_key) || !exposureKeys.has(entry?.exposure_key) || !Array.isArray(entry?.cited_fields) || entry.cited_fields.length === 0 || !isText(entry?.text)) add(`rationales[${index}]`, "must trace one visible item to source fields");
  });
  if (!isRecord(run.trace) || !Array.isArray(run.trace.blocked) || !Array.isArray(run.trace.unsupportedInferences)) add("trace", "blocked and unsupportedInferences arrays are required");
  if (!Array.isArray(run.costLogs)) add("costLogs", "must be an array");
  else if (run.costLogs.length === 0) add("costLogs", "must not be empty");
  else run.costLogs.forEach((entry, index) => {
    const result = validateCostLog(entry);
    if (!result.valid) add(`costLogs[${index}]`, JSON.stringify(result.errors));
    if (entry.paid_model_calls !== 0) add(`costLogs[${index}].paid_model_calls`, "deterministic SME path must remain zero");
  });
  if (!isRecord(run.budget) || !Number.isInteger(run.budget.tokenBudget) || !Number.isInteger(run.budget.tokensUsed) || !Number.isFinite(run.budget.timeoutSeconds) || run.budget.paidModelCalls !== 0) add("budget", "typed zero-paid-call budget fields are required");
  if (!isRecord(run.delta) || typeof run.delta.changed !== "boolean" || !isText(run.delta.reason) || !Array.isArray(run.delta.added) || !Array.isArray(run.delta.removed) || !Array.isArray(run.delta.reranked)) add("delta", "typed growth delta is required");
  if (run.disclaimer !== SME_GUIDANCE_DISCLAIMER) add("disclaimer", "guidance-only disclaimer is required");
  if (!isRecord(run.deployment) || run.deployment.status !== "dev-only" || run.deployment.prodMirrorMutation !== false || run.deployment.cloudflareMutation !== false) add("deployment", "Dev-only no-mutation boundary is required");
  return { valid: errors.length === 0, errors };
}
