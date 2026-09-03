// =============================================================================
// Run_Manifest — canonical schema + pure validator (SSOT)
// agentic-graph-acos-mcp-connector spec · Section 8 (Data models / shared contracts)
// Task 8.1 · Requirements R2.1, R5.4 · design.md › Data Models › Run_Manifest
// =============================================================================
//
// WHY THIS FILE EXISTS
// --------------------
// The Run_Manifest shape was previously MIRRORED ad-hoc across tiers:
//   - worker:  cloudflare/workers/agentic-graph-mcp/run-manifest/*.mjs (persistence)
//   - mcp:     mcp/director-workflow.js + mcp/video-remix-runtime.js (producer)
//   - web:     web/src/lib/* view builders (render Run_State / stages / budgetMeters)
//
// This module is the SINGLE SOURCE OF TRUTH for that shape. Platform target is
// Cloudflare-only. It is:
//   - framework-agnostic and dependency-free (no JSON-schema lib),
//   - plain ESM ("type":"module") reachable by every tier (.js / .mjs),
//   - a PURE validator: `validateRunManifest(m) -> { valid, errors:[{path,reason}] }`
//     that NEVER throws, makes ZERO network calls, and is fully deterministic.
//
// This task PUBLISHES the SSOT only. Existing tiers are NOT re-pointed here yet
// (later integration tasks own that); the shapes below mirror EXACTLY what the
// tiers already emit/consume so the re-point is a no-op. See RECONCILIATION
// NOTES at the bottom for the small divergences that were unified.
// =============================================================================

// -----------------------------------------------------------------------------
// Canonical enums / field constants
// -----------------------------------------------------------------------------

/**
 * Run_State lifecycle (design Data Models; requirements Glossary "Run_State").
 * The Director lifecycle state carried at `Run_Manifest.state`.
 */
export const RUN_STATE = Object.freeze({
  RUNNING: "running",
  BLOCKED: "blocked",
  BUDGET_EXCEEDED: "budget_exceeded",
  APPROVAL_REQUIRED: "approval_required",
  VERIFICATION_FAILED: "verification_failed",
  COMPLETED: "completed",
});

/** All valid Run_State values, frozen for membership checks. */
export const RUN_STATE_VALUES = Object.freeze(Object.values(RUN_STATE));

/** Execution modes (requirements Glossary Dry_Run / Live_Mode; R2.1, R2.6). */
export const RUN_MODE = Object.freeze({ LIVE: "live", DRY_RUN: "dry-run" });
export const RUN_MODE_VALUES = Object.freeze(Object.values(RUN_MODE));

/**
 * Pipeline stage ids in canonical sequencing order (R4.1).
 * The Director sequences these strictly: research → storyboard → render →
 * publish → checkout.
 */
export const STAGE_ID = Object.freeze({
  RESEARCH: "research",
  STORYBOARD: "storyboard",
  RENDER: "render",
  EDIT: "edit",
  PUBLISH: "publish",
  CHECKOUT: "checkout",
});
export const STAGE_ID_VALUES = Object.freeze(Object.values(STAGE_ID));

/** Per-stage status values (design Data Models › Stage.status). */
export const STAGE_STATUS = Object.freeze({
  PENDING: "pending",
  RUNNING: "running",
  APPROVAL_REQUIRED: "approval_required",
  WEAK_SIGNAL: "weak_signal",
  COMPLETED: "completed",
  BLOCKED: "blocked",
});
export const STAGE_STATUS_VALUES = Object.freeze(Object.values(STAGE_STATUS));

/**
 * Approval_Gate ids (design Data Models › ApprovalGate.gateId). Includes
 * `render-action` per the design "Resolved Decisions" reconciliation: the
 * render stage keeps its own gate distinct from `paid-model-call`. (The
 * requirements Glossary lists five gate ids and omits `render-action`; design
 * is the SSOT here — see RECONCILIATION NOTES.)
 */
export const APPROVAL_GATE_ID = Object.freeze({
  CONSUMER_REPO_WRITE: "consumer-repo-write",
  CLOUD_DEPLOY: "cloud-deploy",
  PAID_MODEL_CALL: "paid-model-call",
  RENDER_ACTION: "render-action",
  EDIT_MANIFEST_ASSEMBLY: "edit-manifest-assembly",
  PAYMENT_ACTION: "payment-action",
  AUTHENTICATED_BROWSER: "authenticated-browser",
});
export const APPROVAL_GATE_ID_VALUES = Object.freeze(Object.values(APPROVAL_GATE_ID));

/** Approval gate state (design Data Models › ApprovalGate.approvalState). */
export const APPROVAL_GATE_STATE = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
});
export const APPROVAL_GATE_STATE_VALUES = Object.freeze(Object.values(APPROVAL_GATE_STATE));

/** Canonical top-level Run_Manifest field names (stable for cross-tier use). */
export const RUN_MANIFEST_FIELDS = Object.freeze({
  RUN_ID: "runId",
  STATE: "state",
  MODE: "mode",
  STAGES: "stages",
  APPROVAL_GATES: "approvalGates",
  BUDGET_METERS: "budgetMeters",
  DEMO_PACK: "demoPack",
  FAILURES: "failures",
  RECONCILIATION_FLAGS: "reconciliationFlags",
});

/** Budget_Meters field names (design Data Models › Budget_Meters; R10.4). */
export const BUDGET_METERS_FIELDS = Object.freeze({
  ESTIMATED_COST_USD: "estimatedCostUsd",
  ACTUAL_COST_USD: "actualCostUsd",
  PROVIDER_SPEND_USD: "providerSpendUsd",
});

// -----------------------------------------------------------------------------
// Small pure predicates (no throw, no I/O)
// -----------------------------------------------------------------------------

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isNonNegativeInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNonNegativeNumber(value) {
  return isFiniteNumber(value) && value >= 0;
}

// -----------------------------------------------------------------------------
// Validator — pure, never throws, returns structured {path, reason} errors
// -----------------------------------------------------------------------------

/**
 * Validate a Run_Manifest against the canonical SSOT schema.
 *
 * Pure and total: any input (including `undefined`, `null`, primitives,
 * circular-free objects) yields a result object and never throws.
 *
 * @param {unknown} manifest
 * @returns {{ valid: boolean, errors: Array<{ path: string, reason: string }> }}
 */
export function validateRunManifest(manifest) {
  const errors = [];
  const add = (path, reason) => errors.push({ path, reason });

  if (!isPlainObject(manifest)) {
    add("", "Run_Manifest must be a non-null object");
    return { valid: false, errors };
  }

  validateRunId(manifest, add);
  validateState(manifest, add);
  validateMode(manifest, add);
  validateStages(manifest, add);
  validateApprovalGates(manifest, add);
  validateBudgetMeters(manifest, add);
  validateDemoPack(manifest, add);
  validateFailures(manifest, add);
  validateReconciliationFlags(manifest, add);

  return { valid: errors.length === 0, errors };
}

// --- top-level field validators ---------------------------------------------

function validateRunId(m, add) {
  if (!("runId" in m)) return add("runId", "required field is missing");
  if (!isNonEmptyString(m.runId)) add("runId", "must be a non-empty string");
}

function validateState(m, add) {
  if (!("state" in m)) return add("state", "required field is missing");
  if (!RUN_STATE_VALUES.includes(m.state)) {
    add("state", `must be one of ${RUN_STATE_VALUES.join(", ")}`);
  }
}

function validateMode(m, add) {
  if (!("mode" in m)) return add("mode", "required field is missing");
  if (!RUN_MODE_VALUES.includes(m.mode)) {
    add("mode", `must be one of ${RUN_MODE_VALUES.join(", ")}`);
  }
}

function validateStages(m, add) {
  if (!("stages" in m)) return add("stages", "required field is missing");
  if (!Array.isArray(m.stages)) return add("stages", "must be an array");
  m.stages.forEach((stage, i) => validateStage(stage, `stages[${i}]`, add));
}

function validateStage(stage, path, add) {
  if (!isPlainObject(stage)) return add(path, "must be an object");

  if (!("id" in stage)) add(`${path}.id`, "required field is missing");
  else if (!STAGE_ID_VALUES.includes(stage.id)) {
    add(`${path}.id`, `must be one of ${STAGE_ID_VALUES.join(", ")}`);
  }

  if (!("status" in stage)) add(`${path}.status`, "required field is missing");
  else if (!STAGE_STATUS_VALUES.includes(stage.status)) {
    add(`${path}.status`, `must be one of ${STAGE_STATUS_VALUES.join(", ")}`);
  }

  if (!("retryCount" in stage)) add(`${path}.retryCount`, "required field is missing");
  else if (!isNonNegativeInteger(stage.retryCount)) {
    add(`${path}.retryCount`, "must be an integer >= 0");
  }

  // costLog: exactly one Cost_Log per model-bearing stage, else null (R2.4).
  // Cost_Log field-domain validation is owned by task 8.4; here we only assert
  // the SSOT shape contract: object or null.
  if (!("costLog" in stage)) add(`${path}.costLog`, "required field is missing");
  else if (stage.costLog !== null && !isPlainObject(stage.costLog)) {
    add(`${path}.costLog`, "must be a Cost_Log object or null");
  }

  // artifact: plan artifact in dry-run / approval_required, else null.
  if (!("artifact" in stage)) add(`${path}.artifact`, "required field is missing");
  else if (stage.artifact !== null && !isPlainObject(stage.artifact)) {
    add(`${path}.artifact`, "must be an object or null");
  }
}

function validateApprovalGates(m, add) {
  if (!("approvalGates" in m)) return add("approvalGates", "required field is missing");
  if (!Array.isArray(m.approvalGates)) return add("approvalGates", "must be an array");
  m.approvalGates.forEach((gate, i) => validateApprovalGate(gate, `approvalGates[${i}]`, add));
}

function validateApprovalGate(gate, path, add) {
  if (!isPlainObject(gate)) return add(path, "must be an object");

  if (!("gateId" in gate)) add(`${path}.gateId`, "required field is missing");
  else if (!APPROVAL_GATE_ID_VALUES.includes(gate.gateId)) {
    add(`${path}.gateId`, `must be one of ${APPROVAL_GATE_ID_VALUES.join(", ")}`);
  }

  if (!("approvalState" in gate)) add(`${path}.approvalState`, "required field is missing");
  else if (!APPROVAL_GATE_STATE_VALUES.includes(gate.approvalState)) {
    add(`${path}.approvalState`, `must be one of ${APPROVAL_GATE_STATE_VALUES.join(", ")}`);
  }

  if (!("estimatedCostUsd" in gate)) add(`${path}.estimatedCostUsd`, "required field is missing");
  else if (!isNonNegativeNumber(gate.estimatedCostUsd)) {
    add(`${path}.estimatedCostUsd`, "must be a number >= 0");
  }

  // token: Approval_Token object or null (full token validation is task 8.2).
  if (!("token" in gate)) add(`${path}.token`, "required field is missing");
  else if (gate.token !== null && !isPlainObject(gate.token)) {
    add(`${path}.token`, "must be an Approval_Token object or null");
  }
}

function validateBudgetMeters(m, add) {
  if (!("budgetMeters" in m)) return add("budgetMeters", "required field is missing");
  const bm = m.budgetMeters;
  if (!isPlainObject(bm)) return add("budgetMeters", "must be an object");

  for (const field of Object.values(BUDGET_METERS_FIELDS)) {
    if (!(field in bm)) add(`budgetMeters.${field}`, "required field is missing");
    else if (!isNonNegativeNumber(bm[field])) {
      add(`budgetMeters.${field}`, "must be a number >= 0");
    }
  }
}

function validateDemoPack(m, add) {
  // Demo_Pack | null. Full Demo_Pack validation is owned by the Demo_Pack
  // contract (R3); the SSOT shape contract here is object-or-null.
  if (!("demoPack" in m)) return add("demoPack", "required field is missing");
  if (m.demoPack !== null && !isPlainObject(m.demoPack)) {
    add("demoPack", "must be a Demo_Pack object or null");
  }
}

function validateFailures(m, add) {
  if (!("failures" in m)) return add("failures", "required field is missing");
  if (!Array.isArray(m.failures)) return add("failures", "must be an array");
  m.failures.forEach((rec, i) => validateFailureRecord(rec, `failures[${i}]`, add));
}

function validateFailureRecord(rec, path, add) {
  if (!isPlainObject(rec)) return add(path, "must be an object");

  if (!("stageId" in rec)) add(`${path}.stageId`, "required field is missing");
  else if (!STAGE_ID_VALUES.includes(rec.stageId)) {
    add(`${path}.stageId`, `must be one of ${STAGE_ID_VALUES.join(", ")}`);
  }

  if (!("finalRetryCount" in rec)) add(`${path}.finalRetryCount`, "required field is missing");
  else if (!isNonNegativeInteger(rec.finalRetryCount)) {
    add(`${path}.finalRetryCount`, "must be an integer >= 0");
  }

  if (!("reason" in rec)) add(`${path}.reason`, "required field is missing");
  else if (!isNonEmptyString(rec.reason)) {
    add(`${path}.reason`, "must be a non-empty string");
  }
}

function validateReconciliationFlags(m, add) {
  if (!("reconciliationFlags" in m)) {
    return add("reconciliationFlags", "required field is missing");
  }
  if (!Array.isArray(m.reconciliationFlags)) {
    return add("reconciliationFlags", "must be an array");
  }
  m.reconciliationFlags.forEach((flag, i) => {
    if (!isNonEmptyString(flag)) {
      add(`reconciliationFlags[${i}]`, "must be a non-empty string");
    }
  });
}

// -----------------------------------------------------------------------------
// Convenience factory — a minimal, schema-valid Run_Manifest skeleton.
// Mirrors the producer default (Director live-without-approvals baseline)
// so callers can build from a known-valid base.
// -----------------------------------------------------------------------------

/**
 * Build a canonical, schema-valid empty Run_Manifest.
 * @param {{ runId?: string, state?: string, mode?: string }} [init]
 * @returns {object} a Run_Manifest that passes validateRunManifest
 */
export function createRunManifest(init = {}) {
  return {
    runId: isNonEmptyString(init.runId) ? init.runId : "run-unknown",
    state: RUN_STATE_VALUES.includes(init.state) ? init.state : RUN_STATE.RUNNING,
    mode: RUN_MODE_VALUES.includes(init.mode) ? init.mode : RUN_MODE.LIVE,
    stages: [],
    approvalGates: [],
    budgetMeters: { estimatedCostUsd: 0, actualCostUsd: 0, providerSpendUsd: 0 },
    demoPack: null,
    failures: [],
    reconciliationFlags: [],
  };
}

// =============================================================================
// RECONCILIATION NOTES (differences unified into this SSOT)
// =============================================================================
// 1. runId + mode: the task title enumerates state/stages/approvalGates/
//    budgetMeters/demoPack/failures/reconciliationFlags, but the design Data
//    Models carry `runId` and `mode`. They are included here as required fields
//    so the SSOT mirrors what the tiers actually persist/read.
// 2. ApprovalGate.gateId enum: design Data Models lists SIX gate ids (adds
//    `render-action`); the requirements Glossary lists five. Design is the SSOT
//    per its "Resolved Decisions" note (render keeps a gate distinct from
//    `paid-model-call`). Six is the reconciled set.
// 3. mcp `director-lanes.js` buildApprovalGates() emits a richer *planning/lane*
//    gate object ({ id, actionKind, risk, dryRunArtifact, approvalState:"required" }).
//    That is a dry-run PLAN artifact, NOT the Run_Manifest ApprovalGate. The
//    canonical Run_Manifest ApprovalGate is the design shape
//    { gateId, approvalState(pending|approved|rejected), estimatedCostUsd, token }
//    validated above. Re-pointing happens in later integration tasks.
// 4. costLog / demoPack / token: validated here only at the SSOT shape level
//    (object|null). Their full field-domain schemas are owned by sibling
//    Section-8 tasks (8.2 Approval_Token, 8.4 Cost_Log) and the Demo_Pack
//    contract, and compose with this validator without duplication.
// =============================================================================
