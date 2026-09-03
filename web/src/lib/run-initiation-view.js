// Run-initiation display view-model for the agentic-graph Cloudflare Pages frontend.
//
// Spec: agentic-graph-acos-mcp-connector, task 7.3 (R1.3; design Correctness
// Property 32; design Frontend `renderManifest`).
//
// R1.3: "WHEN a run is initiated, THE Frontend SHALL display each planned stage
// and the budget cap BEFORE any Approval_Gate is approved." This module is the
// PURE, framework-agnostic, ZERO-network/ZERO-browser view-model builder that
// turns a Run_Manifest (or a run-initiation payload) into a render-ready view:
//
//   { stages: [...], budgetCapUsd, anyGateApproved, ... }
//
// listing every source-declared stage in order plus the run's budget cap, suitable for
// rendering the moment a run is initiated and BEFORE any gate is approved.
//
// SCHEMA REUSE (do NOT fork): stage order, status, and gate ids are projected
// directly from the durable Run_Manifest. The frontend owns no stage mirror.
//
// STACK BOUNDARY (R11): the product tier holds no model provider keys; this
// builder reads only manifest data and performs no I/O.

/** Status shown for a planned stage that has no manifest status yet. */
export const DEFAULT_PLANNED_STATUS = "planned";

const stageLabel = (id) => id
  .split(/[-_]+/)
  .filter(Boolean)
  .map((part) => part[0].toUpperCase() + part.slice(1))
  .join(" ");

// --- Helpers ----------------------------------------------------------------

/**
 * Index `stages[]` from a manifest by stage id, tolerating a missing/empty or
 * non-array `stages` field (a minimal/empty manifest). Returns a Map so a
 * later lookup of a planned stage is O(1) and absent stages fall back cleanly.
 *
 * @param {unknown} manifest
 * @returns {Map<string, object>}
 */
function indexManifestStages(manifest) {
  const byId = new Map();
  const stages =
    manifest && typeof manifest === "object" && Array.isArray(manifest.stages)
      ? manifest.stages
      : [];
  for (const stage of stages) {
    if (stage && typeof stage === "object" && typeof stage.id === "string") {
      // First occurrence wins; the runtime emits at most one entry per stage.
      if (!byId.has(stage.id)) byId.set(stage.id, stage);
    }
  }
  return byId;
}

/**
 * Resolve the run's budget cap (USD) from a Run_Manifest or run-initiation
 * payload, WITHOUT forking the schema. The cap is sought in priority order:
 *   1. an explicit top-level `budgetCapUsd`
 *   2. the run-initiation `budgetUsd` (Director input field, R2.1)
 *   3. `budgetMeters.budgetUsd`
 *   4. `budgetMeters.budgetCapUsd`
 *
 * Returns a finite, non-negative number when a usable cap is present, else
 * `null` (a minimal/empty manifest carries no cap — the UI then shows "no cap"
 * rather than a fabricated value).
 *
 * @param {unknown} manifest
 * @returns {number|null}
 */
export function resolveBudgetCapUsd(manifest) {
  if (!manifest || typeof manifest !== "object") return null;

  const budgetMeters =
    manifest.budgetMeters && typeof manifest.budgetMeters === "object"
      ? manifest.budgetMeters
      : null;

  const candidates = [
    manifest.budgetCapUsd,
    manifest.budgetUsd,
    budgetMeters ? budgetMeters.budgetUsd : undefined,
    budgetMeters ? budgetMeters.budgetCapUsd : undefined,
  ];

  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

/**
 * True iff ANY Approval_Gate in the manifest is already approved. Used to flag
 * the run-initiation precondition (R1.3 is a "before any gate is approved"
 * display); tolerates a missing/empty `approvalGates`.
 *
 * @param {unknown} manifest
 * @returns {boolean}
 */
export function anyGateApproved(manifest) {
  const gates =
    manifest && typeof manifest === "object" && Array.isArray(manifest.approvalGates)
      ? manifest.approvalGates
      : [];
  return gates.some(
    (g) => g && typeof g === "object" && g.approvalState === "approved",
  );
}

// --- Public API -------------------------------------------------------------

/**
 * Build the run-initiation display view-model from a Run_Manifest (or a
 * run-initiation payload).
 *
 * The result lists the source-declared stages in manifest order. Per-stage `status` is
 * defaults to `"planned"` otherwise; the guarding gate id is surfaced so the UI
 * can label each spend boundary. The run's `budgetCapUsd` is surfaced (or
 * `null` when the input carries no cap). `anyGateApproved` records the R1.3
 * precondition so a renderer can assert it is displaying a pre-approval plan.
 *
 * Pure and deterministic: performs no I/O, never mutates the input, and never
 * throws for malformed input.
 *
 * @param {unknown} manifest Run_Manifest or run-initiation payload
 * @returns {{
 *   stages: Array<{
 *     id: string,
 *     label: string,
 *     order: number,
 *     status: string,
 *     gateId: string|null,
 *   }>,
 *   stageCount: number,
 *   budgetCapUsd: number|null,
 *   anyGateApproved: boolean,
 * }}
 */
export function buildRunInitiationView(manifest) {
  const safeManifest =
    manifest && typeof manifest === "object" && !Array.isArray(manifest)
      ? manifest
      : {};
  const stages = [...indexManifestStages(safeManifest).values()].map((manifestStage, index) => {
    const id = manifestStage.id;
    const status =
      manifestStage && typeof manifestStage.status === "string"
        ? manifestStage.status
        : DEFAULT_PLANNED_STATUS;
    return {
      id,
      label: stageLabel(id),
      order: index,
      status,
      gateId: typeof manifestStage.gateId === "string" ? manifestStage.gateId : null,
    };
  });

  return {
    stages,
    stageCount: stages.length,
    budgetCapUsd: resolveBudgetCapUsd(safeManifest),
    anyGateApproved: anyGateApproved(safeManifest),
  };
}
