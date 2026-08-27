import { buildSemanticKey } from "../../contracts/semantic-key.js";

export const SME_CANVAS_EVIDENCE_SCHEMA = "agenticgraph-sme-canvas-evidence/v1";
export const SME_CANVAS_DOCUMENT_SCHEMA = "kgc-computing-flow/v1";
export const SME_CANVAS_EVIDENCE_FILE = "canvas-evidence.md";

const json = (value) => JSON.stringify(value);

const canvasData = (value) => {
  if (Array.isArray(value)) return value.map(canvasData);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key === "key" ? "semantic_key" : key === "type" ? "evidence_type" : key,
    canvasData(item),
  ]));
};

const node = ({ id, type, label, x, y, data, inputs = [], outputs = [] }) => ({
  id,
  type,
  label,
  status: "complete",
  position: { x, y },
  handles: { ...(inputs.length ? { target: inputs } : {}), ...(outputs.length ? { source: outputs } : {}) },
  properties: {
    "flow:portTypes": {
      in: Object.fromEntries(inputs.map((port) => [port, "sme-evidence"])),
      out: Object.fromEntries(outputs.map((port) => [port, "sme-evidence"])),
    },
  },
  data: canvasData(data),
});

const COVERAGE_VISUALS = Object.freeze({
  covered: { color: "#16a34a", label: "covered" },
  partially_covered: { color: "#d97706", label: "partially covered" },
  uncovered: { color: "#dc2626", label: "uncovered" },
});

const edge = (source, target, relation, coverageState = "") => ({
  id: buildSemanticKey("sme.canvas.edge", { source, target, relation }),
  source,
  target,
  sourceHandle: relation,
  targetHandle: relation,
  label: relation.replaceAll("_", " "),
  type: "sme-evidence",
  ...(COVERAGE_VISUALS[coverageState] ? { data: { coverage_state: coverageState, ...COVERAGE_VISUALS[coverageState], visual_role: "risk_coverage" } } : {}),
});

const serializeNode = (item) => [
  `    - id: ${json(item.id)}`,
  `      type: ${json(item.type)}`,
  `      label: ${json(item.label)}`,
  `      status: ${json(item.status)}`,
  `      position: ${json(item.position)}`,
  `      handles: ${json(item.handles)}`,
  `      properties: ${json(item.properties)}`,
  `      data: ${json(item.data)}`,
].join("\n");

const serializeEdge = (item) => [
  `    - id: ${json(item.id)}`,
  `      source: ${json(item.source)}`,
  `      sourceHandle: ${json(item.sourceHandle)}`,
  `      target: ${json(item.target)}`,
  `      targetHandle: ${json(item.targetHandle)}`,
  `      label: ${json(item.label)}`,
  `      type: ${json(item.type)}`,
  item.data ? `      data: ${json(item.data)}` : "",
].filter(Boolean).join("\n");

const findRationale = (run, itemKey) => run.rationales.find((item) => item.item_key === itemKey);

const totalCost = (run) => run.costLogs.reduce((sum, item) => sum + Number(item.estimated_cost_usd || 0), 0);

export function buildSmeCanvasEvidence(run) {
  const base = `sme-agent/runs/${run.runId}`;
  const sourcePath = `${base}/${SME_CANVAS_EVIDENCE_FILE}`;
  const ids = {
    source: buildSemanticKey("sme.canvas.source", { run_id: run.runId }),
    runtime: buildSemanticKey("sme.canvas.runtime", { run_id: run.runId }),
    profile: buildSemanticKey("sme.canvas.profile", { profile_id: run.profile.profile_id }),
    cost: buildSemanticKey("sme.canvas.cost", { run_id: run.runId }),
    boundary: buildSemanticKey("sme.canvas.boundary", { run_id: run.runId }),
    evidence: buildSemanticKey("sme.canvas.evidence", { run_id: run.runId }),
  };
  const nodes = [
    node({ id: ids.source, type: "input", label: "Source Files", x: 0, y: 220, outputs: ["invokes"], data: { kind: "source_files", source_path: sourcePath } }),
    node({ id: ids.runtime, type: "agent", label: "/sme-care-agent", x: 280, y: 220, inputs: ["invokes"], outputs: ["profiles", "meters", "bounds"], data: { kind: "runtime", invocation: "/sme-care-agent", run_id: run.runId, status: "completed", skill_variant: run.skillVariant, skill_id: run.skillId } }),
    node({ id: ids.profile, type: "sme-profile", label: `${run.profile.industry} · ${run.profile.growth_stage}`, x: 560, y: 220, inputs: ["profiles"], outputs: ["exposes"], data: { kind: "sme_profile", profile: run.profile } }),
  ];
  const edges = [edge(ids.source, ids.runtime, "invokes"), edge(ids.runtime, ids.profile, "profiles")];
  const exposureY = new Map();
  run.exposureProfile.exposures.forEach((exposure, index) => {
    const y = index * 360;
    const coverageState = run.coverageMatches.find((item) => item.exposure_key === exposure.key)?.outcome || "uncovered";
    exposureY.set(exposure.key, y);
    nodes.push(node({ id: exposure.key, type: "risk-exposure", label: `${exposure.domain}: ${exposure.type}`, x: 840, y, inputs: ["exposes"], outputs: ["reveals_gap", "reveals_unknown"], data: { kind: "risk_exposure", coverage_state: coverageState, coverage_color: COVERAGE_VISUALS[coverageState].color, ...exposure } }));
    edges.push(edge(ids.profile, exposure.key, "exposes", coverageState));
  });
  run.gaps.forEach((gap) => {
    const y = exposureY.get(gap.exposure_key) || 0;
    nodes.push(node({ id: gap.key, type: "coverage-gap", label: `${gap.domain}: ${gap.match_outcome}`, x: 1120, y, inputs: ["reveals_gap"], outputs: ["guides", "explains"], data: { kind: "coverage_gap", ...gap } }));
    edges.push(edge(gap.exposure_key, gap.key, "reveals_gap"));
  });
  run.unknownRisks.forEach((unknown) => {
    const y = (exposureY.get(unknown.exposure_key) || 0) + 140;
    nodes.push(node({ id: unknown.key, type: "unknown-risk", label: "Unknown risk · needs SME input", x: 1120, y, inputs: ["reveals_unknown"], outputs: ["explains"], data: { kind: "unknown_risk", ...unknown } }));
    edges.push(edge(unknown.exposure_key, unknown.key, "reveals_unknown"));
  });
  run.protections.forEach((protection) => {
    const gap = run.gaps.find((item) => item.key === protection.gap_key);
    const y = exposureY.get(protection.exposure_key) || 0;
    nodes.push(node({ id: protection.key, type: "protection", label: `${gap?.domain || "SME"}: protection guidance`, x: 1400, y, inputs: ["guides"], outputs: ["explains"], data: { kind: "protection", ...protection } }));
    edges.push(edge(protection.gap_key, protection.key, "guides"));
  });
  const explainableItems = [...run.gaps, ...run.unknownRisks, ...run.protections];
  explainableItems.forEach((item, index) => {
    const rationale = findRationale(run, item.key);
    if (!rationale) return;
    const rationaleNode = node({ id: rationale.key, type: "evidence", label: `Rationale ${index + 1}`, x: 1680, y: index * 120, inputs: ["explains"], outputs: ["proves"], data: { kind: "rationale", ...rationale } });
    nodes.push(rationaleNode);
    edges.push(edge(item.key, rationale.key, "explains"));
  });
  nodes.push(
    node({ id: ids.cost, type: "meter", label: "$0 · 0 provider calls", x: 560, y: 1180, inputs: ["meters"], outputs: ["proves"], data: { kind: "cost_proof", paid_provider_calls: run.budget.paidModelCalls, tokens_used: run.budget.tokensUsed, estimated_cost_usd: totalCost(run), cost_logs: run.costLogs } }),
    node({ id: ids.boundary, type: "boundary", label: "Dev-only · no deploy mutation", x: 840, y: 1180, inputs: ["bounds"], outputs: ["proves"], data: { kind: "deployment_boundary", ...run.deployment } }),
    node({ id: ids.evidence, type: "output", label: "Runtime-ready Canvas evidence", x: 1960, y: 540, inputs: ["proves"], data: { kind: "canvas_evidence", schema: SME_CANVAS_EVIDENCE_SCHEMA, run_id: run.runId, source_path: sourcePath } }),
  );
  edges.push(edge(ids.runtime, ids.cost, "meters"), edge(ids.runtime, ids.boundary, "bounds"));
  for (const rationale of run.rationales) edges.push(edge(rationale.key, ids.evidence, "proves"));
  edges.push(edge(ids.cost, ids.evidence, "proves"), edge(ids.boundary, ids.evidence, "proves"));

  const proof = {
    run_id: run.runId,
    profile_id: run.profile.profile_id,
    invocation: "/sme-care-agent",
    runtime_status: "runtime-ready",
    source_path: sourcePath,
    exposure_count: run.exposureProfile.exposures.length,
    gap_count: run.gaps.length,
    unknown_risk_count: run.unknownRisks.length,
    protection_count: run.protections.length,
    rationale_count: run.rationales.length,
    paid_provider_calls: run.budget.paidModelCalls,
    tokens_used: run.budget.tokensUsed,
    estimated_cost_usd: totalCost(run),
    deployment: run.deployment,
  };
  const markdown = [
    "---",
    `schema: ${json(SME_CANVAS_EVIDENCE_SCHEMA)}`,
    `kgSchema: ${json(SME_CANVAS_DOCUMENT_SCHEMA)}`,
    `kgCanvasSurfaceMode: "2d"`,
    `kgCanvasRenderMode: "2d"`,
    `kgCanvas2dRenderer: "storyboard"`,
    `kgDocumentSemanticMode: "document"`,
    `kgFrontmatterModeEnabled: true`,
    `kgMultiDimTableModeEnabled: false`,
    `kgDocumentStructureBaselineLock: false`,
    `runtime_evidence: ${json(proof)}`,
    "flow:",
    "  direction: LR",
    "  edgeType: smoothstep",
    "  snapToGrid: true",
    "  gridSize: 20",
    "  computed: false",
    "  nodes:",
    ...nodes.map(serializeNode),
    "  edges:",
    ...edges.map(serializeEdge),
    "---",
    "",
    "# SME Risk & Coverage Runtime Evidence",
    "",
    `This Source File is the deterministic Canvas projection of \`/sme-care-agent\` run \`${run.runId}\`. The frontmatter \`flow\` is the machine-readable graph SSOT.`,
    "",
    `- Exposures: ${proof.exposure_count}`,
    `- Coverage gaps: ${proof.gap_count}`,
    `- Unknown risks: ${proof.unknown_risk_count}`,
    `- Protection guidance items: ${proof.protection_count}`,
    `- Traceable rationales: ${proof.rationale_count}`,
    `- Runtime cost: $${proof.estimated_cost_usd}; ${proof.tokens_used} tokens; ${proof.paid_provider_calls} paid provider calls`,
    `- Deployment boundary: ${run.deployment.status}; Prod mirror mutation=${run.deployment.prodMirrorMutation}; Cloudflare mutation=${run.deployment.cloudflareMutation}`,
    "",
    run.disclaimer,
    "",
  ].join("\n");
  return { schema: SME_CANVAS_DOCUMENT_SCHEMA, canvasDocumentMarkdown: markdown, flow: { nodes, edges }, proof };
}
