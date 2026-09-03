// =============================================================================
// Demo_Pack templating from a TERMINAL Run_Manifest
// agentic-graph-acos-mcp-connector spec · Section 10 (Demo & evidence pack assembly)
// Task 10.1 · Requirements R3.1 · Property 22 · design.md › Data Models ›
//   Demo_Pack and › Data Models › Run_Manifest
// =============================================================================
//
// WHY THIS FILE EXISTS (verify-and-extend, NOT a fork)
// ----------------------------------------------------
// `mcp/video-remix/demo-pack.js` already ASSEMBLES the seven-section /
// seven-dimension Demo_Pack — but its `buildDemoPack(...)` takes a LOOSE,
// pre-extracted argument bag (`{ state, sources, citations, assets, checkout,
// ... }`). The Director runtime hand-wires those fields inline when it builds
// its payload (see `run-video-remix.js`).
//
// Task 10.1 adds the missing LAYER: a deterministic TEMPLATING step that pulls
// the evidence FIELDS straight out of a terminal Run_Manifest OBJECT and feeds
// them to the existing `buildDemoPack` (reuse-not-rebuild). It also makes the
// seven-section -> seven-judging-dimension mapping EXPLICIT, binding each
// dimension to the Run_Manifest field(s) that substantiate it. The two SSOT
// contracts are the source of truth:
//   * `contracts/run-manifest.schema.js`  — the terminal Run_Manifest shape
//   * `contracts/demo-pack.schema.js`     — the seven canonical dimensions
//
// PURITY / TCO-ZERO / TOKEN-ECONOMICS
// -----------------------------------
// This module is PURE and TIMER-FREE. It performs ZERO live network / AWS /
// Cloudflare calls — it reads from an in-memory terminal Run_Manifest object
// only. URL reachability and `GET /health` probes remain INJECTABLE seams
// (forwarded verbatim to `buildDemoPack`); the live probes are wired by
// integration task 9.2 / health task 2.16, never here.
// =============================================================================

import { buildDemoPack, isTerminalRunState, JUDGING_DIMENSIONS } from "./demo-pack.js";
import { cleanString } from "./helpers.js";
import {
  DEMO_PACK_DIMENSION_BY_ID,
  DEMO_PACK_DIMENSION_IDS,
} from "../../contracts/demo-pack.schema.js";
import {
  RUN_STATE,
  STAGE_ID,
  APPROVAL_GATE_ID,
  APPROVAL_GATE_STATE,
} from "../../contracts/run-manifest.schema.js";

// ---------------------------------------------------------------------------
// The seven-section -> seven-judging-dimension mapping, made EXPLICIT (R3.1).
// ---------------------------------------------------------------------------
// One entry per judging dimension, in the fixed catalog order published by the
// SSOT Demo_Pack contract (`DEMO_PACK_DIMENSION_IDS`). Each entry records:
//   * `sectionId`  — the canonical snake-case section id (the `DEMO_SECTIONS`
//                    catalog id used by `buildDemoPack`),
//   * `dimension`  — the human-readable judging-dimension string (SSOT),
//   * `manifestEvidence` — the terminal Run_Manifest field(s) the templating
//                    pulls to substantiate this dimension. This is the
//                    documentation of WHAT each section is templated from.
// The mapping is asserted complete (exactly seven, one per dimension) at module
// load via `assertSevenDimensionMapping` below, so a drift in either SSOT
// catalog fails fast rather than silently dropping a dimension.
// Per-dimension binding to the Run_Manifest field(s) the templating reads. This
// is the "which manifest evidence backs which judging dimension" contract
// (design › Data Models › Demo_Pack references the Evidence_Pack citations, the
// rendered asset reference, and the Stripe session id; the orchestration /
// HITL / failure dimensions are backed by the manifest's stages / gates /
// failures / meters).
const MANIFEST_EVIDENCE_BINDINGS = Object.freeze({
  agent_overview: ["runId", "state", "mode"],
  autonomy_decision_making: ["evidencePack.sources", "evidencePack.citations", "approvalGates"],
  actions_tool_use: ["stages", "render.assets"],
  orchestration: ["stages", "budgetMeters", "costLogs"],
  human_in_the_loop: ["approvalGates"],
  failure_handling: ["failures", "budgetMeters", "reconciliationFlags"],
  demo_presentation: ["commerce.checkout", "demoPack.urls"],
});

const SECTION_DIMENSION_MAP = Object.freeze(
  DEMO_PACK_DIMENSION_IDS.map((sectionId) =>
    Object.freeze({
      sectionId,
      dimension: DEMO_PACK_DIMENSION_BY_ID[sectionId],
      manifestEvidence: Object.freeze(MANIFEST_EVIDENCE_BINDINGS[sectionId] || []),
    }),
  ),
);

// ---------------------------------------------------------------------------
// Small pure readers — tolerant of BOTH the runtime payload shape AND the
// canonical SSOT Run_Manifest shape (the runtime payload IS the terminal
// Run_Manifest object in practice; the SSOT contract is the slimmer cross-tier
// projection). Each reader falls back through the known field locations so the
// templating is deterministic regardless of which producer emitted the object.
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

// Locate a stage entry by its canonical stage id (R4.1 sequencing ids).
function findStage(manifest, stageId) {
  return asArray(manifest.stages).find((stage) => isPlainObject(stage) && stage.id === stageId) || null;
}

// Pull the Evidence_Pack sources. Primary location is `evidencePack.sources`
// (runtime payload); falls back to a research stage `artifact.sources` if a
// producer attached evidence there instead.
function readSources(manifest) {
  const direct = asArray(manifest.evidencePack && manifest.evidencePack.sources);
  if (direct.length > 0) return direct;
  const research = findStage(manifest, STAGE_ID.RESEARCH);
  const fromArtifact = research && isPlainObject(research.artifact)
    ? asArray(research.artifact.sources)
    : [];
  return fromArtifact;
}

// Pull the Evidence_Pack citations. Primary location is `evidencePack.citations`;
// otherwise it is derived inside `buildDemoPack` from the sources, so returning
// `undefined` here is safe (it defers to that derivation, R3.6).
function readCitations(manifest) {
  const direct = manifest.evidencePack && manifest.evidencePack.citations;
  return Array.isArray(direct) ? direct : undefined;
}

// Pull the rendered asset references. Primary location is `render.assets`;
// falls back to a render stage `artifact.assets`.
function readAssets(manifest) {
  const direct = asArray(manifest.render && manifest.render.assets);
  if (direct.length > 0) return direct;
  const render = findStage(manifest, STAGE_ID.RENDER);
  const fromArtifact = render && isPlainObject(render.artifact)
    ? asArray(render.artifact.assets)
    : [];
  return fromArtifact;
}

// Pull the Stripe checkout descriptor `{ sessionId, payoutSettled }`. Primary
// location is `commerce.checkout`; falls back to a checkout stage
// `artifact.checkout` or the stage's own `checkout` field.
function readCheckout(manifest) {
  const direct = manifest.commerce && manifest.commerce.checkout;
  if (isPlainObject(direct)) return direct;
  const checkout = findStage(manifest, STAGE_ID.CHECKOUT);
  if (checkout && isPlainObject(checkout.artifact) && isPlainObject(checkout.artifact.checkout)) {
    return checkout.artifact.checkout;
  }
  if (checkout && isPlainObject(checkout.checkout)) return checkout.checkout;
  return {};
}

// Determine whether the `cloud-deploy` Approval_Gate is approved. Tolerant of
// BOTH gate shapes: the canonical SSOT `{ gateId, approvalState }` and the
// runtime lane `{ id, approvalState }`.
function readDeployApproved(manifest) {
  return asArray(manifest.approvalGates).some((gate) => {
    if (!isPlainObject(gate)) return false;
    const gateId = cleanString(gate.gateId || gate.id);
    return gateId === APPROVAL_GATE_ID.CLOUD_DEPLOY && gate.approvalState === APPROVAL_GATE_STATE.APPROVED;
  });
}

// ---------------------------------------------------------------------------
// Public: extract the Demo_Pack evidence bag from a terminal Run_Manifest.
// ---------------------------------------------------------------------------
// PURE and total: any input (including non-objects) yields a result and never
// throws. The returned bag is exactly the argument shape `buildDemoPack`
// expects, so the templating step is a thin, deterministic projection of the
// manifest onto the existing assembler (reuse-not-rebuild).
//
// `options` carries the INJECTABLE seams that are NOT part of the manifest:
//   * `frontendUrl` / `agentApiUrl` / `backendHealthUrl` — endpoint hints,
//   * `reachability` — injected URL-probe result set (task 2.14 seam),
//   * `reachabilityDeadlineMs` — injected 5s reachability deadline (task 10.2;
//      defaults to the assembler's `URL_REACHABILITY_DEADLINE_MS` when unset),
//   * `healthAttempts` — injected `GET /health` attempt sequence (task 2.16).
// Endpoint hints fall back to any `demoPack.urls` already present on the
// manifest, then to the `buildDemoPack` defaults.
function extractManifestEvidence(manifest, options = {}) {
  const m = isPlainObject(manifest) ? manifest : {};
  const opts = isPlainObject(options) ? options : {};
  const existingUrls = asArray(m.demoPack && m.demoPack.urls);
  const urlByKinds = (kinds) => {
    const entry = existingUrls.find((u) => isPlainObject(u) && kinds.includes(u.kind));
    return entry ? entry.url : undefined;
  };
  return {
    state: cleanString(m.state),
    sources: readSources(m),
    citations: readCitations(m),
    assets: readAssets(m),
    checkout: readCheckout(m),
    deployApproved: readDeployApproved(m),
    frontendUrl: cleanString(opts.frontendUrl, "") || urlByKinds(["frontend"]),
    workerUrl: cleanString(opts.workerUrl, "") || urlByKinds(["worker"]),
    workerHealthUrl: cleanString(opts.workerHealthUrl, "") || urlByKinds(["worker-health"]),
    reachability: opts.reachability,
    reachabilityDeadlineMs: opts.reachabilityDeadlineMs,
    healthAttempts: opts.healthAttempts,
  };
}

// ---------------------------------------------------------------------------
// Public: build the Demo_Pack directly from a terminal Run_Manifest object.
// ---------------------------------------------------------------------------
// This is the task-10.1 entry point. It (1) extracts the evidence bag from the
// manifest via `extractManifestEvidence`, (2) delegates assembly to the
// existing `buildDemoPack` (so the seven-section / seven-dimension guarantees,
// reachability marking, artifact-reference completeness, and health retry all
// continue to hold), and (3) annotates the result with the explicit
// section->dimension mapping and a `terminal` flag.
//
// At a NON-terminal Run_State the underlying `buildDemoPack` emits no demo urls
// (the run is still in flight); `terminal:false` makes that observable to the
// caller without throwing.
function buildDemoPackFromManifest(manifest, options = {}) {
  const evidence = extractManifestEvidence(manifest, options);
  const demoPack = buildDemoPack(evidence);
  return {
    ...demoPack,
    terminal: isTerminalRunState(evidence.state),
    sectionDimensionMap: SECTION_DIMENSION_MAP,
  };
}

// ---------------------------------------------------------------------------
// Load-time invariant: the explicit mapping covers EXACTLY the seven judging
// dimensions, one per section, with no duplicates and none missing (R3.1). A
// drift between the runtime `JUDGING_DIMENSIONS` catalog and the SSOT
// `DEMO_PACK_DIMENSION_BY_ID` catalog fails fast here rather than silently
// producing a malformed mapping.
function assertSevenDimensionMapping() {
  const runtimeDimensions = Object.values(JUDGING_DIMENSIONS);
  const mappedDimensions = SECTION_DIMENSION_MAP.map((entry) => entry.dimension);
  const uniqueDimensions = new Set(mappedDimensions);
  const ok =
    SECTION_DIMENSION_MAP.length === 7 &&
    uniqueDimensions.size === 7 &&
    mappedDimensions.every((d, i) => d === runtimeDimensions[i]) &&
    SECTION_DIMENSION_MAP.every((entry) => entry.manifestEvidence.length > 0);
  if (!ok) {
    throw new Error(
      "demo-pack-template: SECTION_DIMENSION_MAP must bind exactly the seven judging dimensions " +
        "(one per section, each with manifest evidence) and match the runtime JUDGING_DIMENSIONS catalog.",
    );
  }
  return true;
}

assertSevenDimensionMapping();

export {
  SECTION_DIMENSION_MAP,
  extractManifestEvidence,
  buildDemoPackFromManifest,
  assertSevenDimensionMapping,
  // re-exports for callers that template off a manifest (no second import)
  RUN_STATE,
  STAGE_ID,
};
