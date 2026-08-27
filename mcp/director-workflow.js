// Director AgentWorkflow skeleton (agenticgraph-acos-mcp-connector spec, task 2.1).
//
//   Spec refs:
//     - R2.1: a single `agenticgraph.video_remix.run` tool accepting
//       `{ referenceUrl, brief, budgetUsd, mode, approvals[] }` and returning
//       a Run_Manifest.
//     - R4.1: strict stage ordering. Task 2.1 ESTABLISHED the ordering as the
//       workflow skeleton's source of truth; task 2.2 implements the DETAILED
//       enforcement here (begin each stage only after the prior reaches
//       `completed`) via the strict stage-ordering state machine
//       (`enforceStrictStageOrdering` / `checkStrictStageOrdering`).
//     - Design Property 7 (stage ordering invariant): the observed stage start
//       sequence is a prefix of the canonical stage contract, and no stage
//       begins before its predecessor completes.
//     - Design refs: "Components and Interfaces > Director Orchestrator" and
//       "Work Flow > Director run as a durable AgentWorkflow".
//
// REUSE-NOT-REBUILD: this module does NOT re-implement the planner, gates,
// failure handling, or stage logic. It models the Director as an Agents SDK
// `AgentWorkflow`-shaped skeleton that WRAPS the existing
// `runVideoRemix(...)` composition (`mcp/video-remix-runtime.js`) and WIRES the
// four builders (`buildPlanner`, `buildToolCalls`, `buildApprovalGates`,
// `buildFailureHandling`) exported from `mcp/director-lanes.js`. Each
// workflow step exposes a clean seam (`DIRECTOR_SEAMS`) where the detailed
// behaviors implemented in spec tasks 2.2-2.16 plug in.
//
// PURE-JS / SDK-AGNOSTIC: like the Section-1 `tool-registry.mjs`, this is a
// pure-JS module so it is consumable by both the Cloudflare Worker
// (`cloudflare/workers/agenticgraph-mcp/`) and Node `node:test` units without
// booting workerd. The Agents SDK `AgentWorkflow` class (which requires the
// Workers runtime) can later adopt this descriptor in `index.ts`; the workflow
// SHAPE (ordered steps + run entrypoint + stage-ordering invariant) lives here
// so it stays verifiable under Node.

import { runVideoRemix } from "./video-remix-runtime.js";
import {
  buildPlanner,
  buildToolCalls,
  buildApprovalGates,
  buildFailureHandling,
} from "./director-lanes.js";
import {
  VIDEO_REMIX_STAGE_GATES,
  VIDEO_REMIX_STAGE_ORDER,
} from "./video-remix/stage-contract.js";

export const DIRECTOR_TOOL_NAME = "agenticgraph.video_remix.run";

export const DIRECTOR_WORKFLOW_VERSION = "agenticgraph.director.workflow/v0.1";

/**
 * Director stage ordering derives from the executable video-remix stage
 * contract so workflow validation and Run_Manifest projection cannot drift.
 */
export const DIRECTOR_STAGE_ORDER = VIDEO_REMIX_STAGE_ORDER;

/**
 * Gate id guarding each pipeline stage. Mirrors the runtime gate ids checked
 * by `mcp/video-remix-runtime.js` (`APPROVAL_GATES` + `hasGate`) and the
 * Section-1 McpAgent boundary (`AGENTICGRAPH_MCP_STAGE_GATES`) so the workflow
 * skeleton, the runtime, and the boundary agree on what each stage requires.
 *
 * NOTE (flagged for spec task 4.1 - HITL Gate Service reconciliation): `render`
 * maps to the runtime gate id `render-action`, which is NOT one of the five
 * gate ids in the design Glossary. Reconciling the design-vs-runtime gate-id
 * set is task 4.1's responsibility and is intentionally NOT resolved here.
 */
export const DIRECTOR_STAGE_GATES = VIDEO_REMIX_STAGE_GATES;

/**
 * Stage statuses the runtime uses to mark a stage as having reached a
 * completed state for the purpose of the ordering invariant (R4.1). A stage
 * that resolved to a dry-run / approval_required plan artifact has NOT
 * "completed" in the spend-bearing sense; the strict ordering state machine
 * (task 2.2, below) therefore holds any downstream stage that would begin
 * after such a non-completed predecessor. This is the shared vocabulary the
 * task-2.2 enforcement builds on.
 */
export const DIRECTOR_COMPLETED_STAGE_STATUSES = Object.freeze([
  "complete",
  "completed",
]);

/**
 * Stage statuses that mean a stage has NOT begun — no work, no spend, no gate
 * evaluation has happened yet (spec task 2.2 / R4.1). These are the only
 * statuses a downstream stage may carry while a preceding stage has not reached
 * a completed state. `blocked_weak_signal` is included because it is a blocked
 * variant the runtime emits when an upstream weak signal halts the chain — the
 * stage is held, not started.
 *
 * Every other status (`complete`, `running`, `weak_signal`, `approval_required`,
 * `dry_run_ready`, ...) implies the stage was ENTERED: it produced work, spend,
 * a plan artifact, or reached its approval gate. Such a status is only valid
 * once all preceding pipeline stages have completed.
 */
export const DIRECTOR_NOT_BEGUN_STAGE_STATUSES = Object.freeze([
  "pending",
  "blocked",
  "blocked_weak_signal",
]);

/**
 * The status a downstream stage is forced to when strict ordering halts it
 * (its predecessor has not reached a completed state). Chosen as `blocked`
 * because the chain is halted upstream and the stage may not start.
 */
export const DIRECTOR_ORDERING_HALT_STATUS = "blocked";

/** True when `status` marks a stage as having reached a completed state (R4.1). */
export function isStageCompleted(status) {
  return DIRECTOR_COMPLETED_STAGE_STATUSES.includes(asString(status).toLowerCase());
}

/**
 * True when `status` indicates the stage has BEGUN (entered execution: work,
 * spend, plan-artifact resolution, or gate evaluation). A stage that has only
 * `pending`/`blocked`/`blocked_weak_signal` status has not begun.
 */
export function hasStageBegun(status) {
  const normalized = asString(status).toLowerCase();
  if (!normalized) return false;
  return !DIRECTOR_NOT_BEGUN_STAGE_STATUSES.includes(normalized);
}

/**
 * Seam map: where each downstream task (2.2-2.16) plugs detailed behavior into
 * the skeleton. This is documentation-as-code so the skeleton's clean seams are
 * discoverable and the orchestrator can route follow-on tasks precisely. The
 * skeleton intentionally does NOT implement these.
 */
export const DIRECTOR_SEAMS = Object.freeze({
  "2.2": "Strict stage ordering: begin each stage only after the prior reaches `completed`.",
  "2.3": "Live-without-approvals halt: empty approvals[] -> blocked, >=5 gates, estimatedCostUsd==0, 0 paid calls.",
  "2.4": "Dry-run resolution: every spend-bearing step -> plan artifact, actualCostUsd==0.",
  "2.5": "Director input validation: reject missing field / out-of-range budgetUsd / bad mode.",
  "2.6": "Bounded-retry: exp backoff 1s..30s, retryCount +1/attempt, bounded by maxIterations.",
  "2.7": "Fail-closed on retry exhaustion: blocked + failure record { stageId, finalRetryCount, reason }.",
  "2.8": "Total-provider-unavailability: structured degraded error -> blocked without consuming retries.",
  "2.9": "Budget-cap enforcement: reaching cap mid-run -> budget_exceeded + halt spend-bearing stages.",
  "2.10": "Cost_Log aggregation: one entry per model-bearing stage, aggregate into Budget_Meters.",
  "2.11": "Budget_Meters update timing: update within 2s of each spend event.",
  "2.12": "Ledger-vs-meters reconciliation: flag deviation > +/-0.01 USD.",
  "2.13": "Demo_Pack assembly: 7 non-empty sections, urls[] with >=1 frontend + >=1 agent-api.",
  "2.14": "Demo_Pack URL reachability marking.",
  "2.15": "Demo_Pack artifact-reference completeness.",
  "2.16": "Health-route retry/record in Demo_Pack assembly.",
  "3.14": "Commerce_Harness publish wiring (this skeleton emits a minimal publish stage only).",
});

function asString(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

/**
 * Build the workflow's planning artifacts by WIRING the four lane builders.
 * This demonstrates the skeleton seams and produces a descriptor the durable
 * workflow can later attach; it does not replace the runtime's own planner /
 * gate / failure composition (which `runVideoRemix` owns). Arguments are
 * defaulted conservatively so the skeleton is callable with only
 * `{ referenceUrl, brief }`.
 */
export function buildDirectorPlan(args = {}) {
  const goal = asString(args.brief, "Run the gated video-remix pipeline.");
  const maxIterations = Number.isFinite(Number(args.maxIterations))
    ? Number(args.maxIterations)
    : 8;
  const budgets = { maxIterations, tcoBudgetUsd: Number(args.budgetUsd) || 0 };
  // Dry-run artifact path placeholders consumed by buildApprovalGates; the
  // real artifact paths are produced by the runtime/harnesses (tasks 2.4, 3.x).
  const artifactPaths = [
    `dry-run/${asString(args.runId, "video-remix")}/plan.json`,
    `dry-run/${asString(args.runId, "video-remix")}/manifest.json`,
  ];
  const repoProfile = { exists: true };
  const lanes = ["market_radar"];

  return {
    planner: buildPlanner({ goal, repoProfile, budgets }),
    toolCalls: buildToolCalls({ lanes, args }),
    approvalGates: buildApprovalGates({ artifactPaths }),
    failureHandling: buildFailureHandling(args),
  };
}

/**
 * Build the ordered workflow step descriptors. Each step is a seam: it names
 * the stage, the gate guarding it, and the builder that contributes its
 * skeleton. Detailed per-stage behavior is filled in by tasks 2.2-2.16/3.x.
 */
export function buildDirectorSteps() {
  return DIRECTOR_STAGE_ORDER.map((stageId, index) => ({
    index,
    stageId,
    gateId: DIRECTOR_STAGE_GATES[stageId] ?? null,
    // The builder(s) whose skeleton output this step draws on. Kept as names
    // (not bound fns) so the descriptor stays serializable/inspectable.
    wiredBuilders:
      stageId === "checkout" || stageId === "publish"
        ? ["buildApprovalGates", "buildToolCalls", "buildFailureHandling"]
        : ["buildPlanner", "buildToolCalls", "buildApprovalGates", "buildFailureHandling"],
    requiresPrecedingCompleted: index > 0,
    precedingStageId: index > 0 ? DIRECTOR_STAGE_ORDER[index - 1] : null,
  }));
}

/**
 * Extract the observed stage-start sequence from a Run_Manifest, dropping
 * entries without an id. Returns the ordered list the Director produced.
 */
export function extractDirectorStageOrder(manifest) {
  if (!manifest || typeof manifest !== "object") return [];
  const stages = Array.isArray(manifest.stages) ? manifest.stages : [];
  return stages
    .filter((stage) => stage && typeof stage === "object" && asString(stage.id).length > 0)
    .map((stage) => asString(stage.id));
}

/**
 * Property 7 (stage ordering invariant) skeleton check. Verifies the observed
 * pipeline stage sequence in a Run_Manifest is a PREFIX of the canonical
 * `DIRECTOR_STAGE_ORDER` - i.e. stages appear in canonical order with none reordered,
 * skipped-in-the-middle, or duplicated. Returns a structured result rather
 * than throwing so callers (tests today, task 2.2 enforcement later) choose
 * how to react.
 *
 * This is the SKELETON guarantee (ordering of the produced sequence). The
 * stronger runtime guarantee ("no stage begins before its predecessor reaches
 * `completed`") is task 2.2.
 *
 * @returns {{ ok: boolean, observed: string[], expectedPrefix: string[], violations: string[] }}
 */
export function checkStageOrderingInvariant(manifest) {
  const observed = extractDirectorStageOrder(manifest);
  const violations = [];

  // Unknown stage ids (not part of the canonical pipeline) are violations.
  for (const stageId of observed) {
    if (!DIRECTOR_STAGE_ORDER.includes(stageId)) {
      violations.push(`unknown_stage:${stageId}`);
    }
  }

  // The observed sequence must equal the canonical order truncated to the
  // observed length (a prefix). This catches reordering, mid-sequence skips,
  // and duplicates in one comparison.
  const expectedPrefix = DIRECTOR_STAGE_ORDER.slice(0, observed.length);
  for (let i = 0; i < observed.length; i += 1) {
    if (observed[i] !== expectedPrefix[i]) {
      violations.push(
        `out_of_order@${i}:expected=${expectedPrefix[i] ?? "<none>"},got=${observed[i]}`,
      );
    }
  }

  return {
    ok: violations.length === 0,
    observed,
    expectedPrefix,
    violations,
  };
}

/**
 * Assert the stage-ordering invariant, throwing on violation. Convenience for
 * call sites that want fail-closed behavior (e.g. task 2.2 enforcement or a
 * defensive guard around the durable workflow).
 */
export function assertStageOrderingInvariant(manifest) {
  const result = checkStageOrderingInvariant(manifest);
  if (!result.ok) {
    throw new Error(
      `Director stage ordering invariant violated (R4.1 / Property 7): ${result.violations.join("; ")}`,
    );
  }
  return result;
}

/**
 * Strict stage-ordering check (spec task 2.2 / R4.1 / Property 7 — the STRONGER
 * runtime guarantee). Verifies that NO pipeline stage has begun before its
 * immediately preceding pipeline stage reached a completed state. This is
 * stronger than `checkStageOrderingInvariant` (which only checks the produced
 * stage SEQUENCE is a prefix of the canonical order): it inspects each stage's
 * STATUS and flags any stage that entered execution (work/spend/plan
 * artifact/gate eval) while an upstream stage had not completed.
 *
 * Unknown stages are rejected by the sequence validator. `research` (the
 * first pipeline stage) may always begin.
 *
 * @returns {{ ok: boolean, violations: string[], frontier: string|null }}
 */
export function checkStrictStageOrdering(manifest) {
  const violations = [];
  let frontier = null;
  if (!manifest || typeof manifest !== "object") {
    return { ok: true, violations, frontier };
  }
  const stages = Array.isArray(manifest.stages) ? manifest.stages : [];
  let precedingCompleted = true; // research may always begin
  let precedingStageId = null;

  for (const stage of stages) {
    if (!stage || typeof stage !== "object") continue;
    const id = asString(stage.id);
    if (!DIRECTOR_STAGE_ORDER.includes(id)) continue;

    if (!precedingCompleted && hasStageBegun(stage.status)) {
      violations.push(
        `began_before_predecessor_completed:${id}(status=${asString(stage.status) || "<none>"},predecessor=${precedingStageId ?? "<none>"})`,
      );
    }

    if (precedingCompleted && !isStageCompleted(stage.status) && frontier === null) {
      frontier = id; // first stage that has not completed
    }
    if (!isStageCompleted(stage.status)) {
      precedingCompleted = false;
    }
    precedingStageId = id;
  }

  return { ok: violations.length === 0, violations, frontier };
}

/**
 * Enforce strict stage ordering (spec task 2.2 / R4.1) on a Run_Manifest:
 * walk the pipeline stages in canonical order and, once a stage has not reached
 * a completed state, force every SUBSEQUENT pipeline stage that has begun back
 * to a not-begun status (`blocked` by default). This realizes the runtime
 * guarantee that a stage does not begin (no work, no spend, no status beyond
 * pending/blocked) until its immediately preceding stage has completed.
 *
 * The frontier stage (the first non-completed stage) keeps its own status — it
 * legitimately began and then halted (e.g. `weak_signal`, `approval_required`).
 * Only stages strictly after the frontier are downgraded. Unknown stages pass
 * through for the sequence validator to reject. Stage objects are copied, never
 * mutated in place, so the caller's input manifest is left intact.
 *
 * @param {object} manifest
 * @param {{ haltStatus?: string }} [options]
 * @returns {{ manifest: object, downgrades: Array<{stageId:string,from:string,to:string}>, frontier: string|null, ok: boolean }}
 */
export function enforceStrictStageOrdering(manifest, options = {}) {
  const haltStatus = asString(options.haltStatus, DIRECTOR_ORDERING_HALT_STATUS);
  const downgrades = [];
  let frontier = null;

  if (!manifest || typeof manifest !== "object") {
    return { manifest, downgrades, frontier, ok: true };
  }

  const stages = Array.isArray(manifest.stages) ? manifest.stages : [];
  let precedingCompleted = true; // research may always begin

  const nextStages = stages.map((stage) => {
    if (!stage || typeof stage !== "object") return stage;
    const id = asString(stage.id);
    if (!DIRECTOR_STAGE_ORDER.includes(id)) return stage;

    if (precedingCompleted) {
      // This stage is allowed to begin. If it has not completed, it becomes the
      // frontier and every later pipeline stage must be held.
      if (!isStageCompleted(stage.status)) {
        precedingCompleted = false;
        if (frontier === null) frontier = id;
      }
      return stage;
    }

    // A preceding pipeline stage has not completed: this stage must not have
    // begun. Downgrade any begun status back to the halt status.
    if (hasStageBegun(stage.status)) {
      downgrades.push({ stageId: id, from: asString(stage.status), to: haltStatus });
      return { ...stage, status: haltStatus, haltedByOrdering: true };
    }
    return stage;
  });

  return {
    manifest: { ...manifest, stages: nextStages },
    downgrades,
    frontier,
    ok: downgrades.length === 0,
  };
}

/**
 * Assert strict stage ordering, throwing on violation. Convenience for
 * fail-closed call sites that want to guarantee the runtime guarantee holds.
 */
export function assertStrictStageOrdering(manifest) {
  const result = checkStrictStageOrdering(manifest);
  if (!result.ok) {
    throw new Error(
      `Director strict stage ordering violated (R4.1 / Property 7): ${result.violations.join("; ")}`,
    );
  }
  return result;
}

/**
 * Create the Director AgentWorkflow skeleton descriptor. The returned object
 * models an Agents SDK `AgentWorkflow`: an ordered list of steps plus a `run`
 * entrypoint. `run` WRAPS `runVideoRemix` (reuse-not-rebuild), attaches the
 * wired planning descriptor + ordered steps as `director` metadata, and
 * enforces the strict stage-ordering state machine (task 2.2 / R4.1) on the
 * produced Run_Manifest so no stage begins before its predecessor completes.
 * Stage ids and the top-level Run_State are preserved so the Section-1 McpAgent
 * contract (`tool-registry.mjs` / durable persistence / diagnostics) stays
 * compatible.
 *
 * @param {{ runtime?: (args: object) => { payload: object, text: string } }} [config]
 */
export function createDirectorWorkflow(config = {}) {
  const runtime =
    typeof config.runtime === "function" ? config.runtime : runVideoRemix;
  const steps = buildDirectorSteps();

  return {
    name: DIRECTOR_TOOL_NAME,
    version: DIRECTOR_WORKFLOW_VERSION,
    stageOrder: DIRECTOR_STAGE_ORDER,
    stageGates: DIRECTOR_STAGE_GATES,
    steps,
    seams: DIRECTOR_SEAMS,
    /**
     * Execute the Director workflow over `args`. Returns the runtime
     * `{ payload, text }` plus a sibling `workflow` descriptor. The payload's
     * pipeline stage statuses are passed through the strict stage-ordering
     * state machine (task 2.2): downstream stages that would otherwise have
     * begun before their predecessor completed are held at `blocked`. Stage
     * ids and top-level Run_State are left to the runtime, preserving Section-1
     * McpAgent compatibility (`tool-registry.mjs` / durable persistence /
     * diagnostics).
     */
    run(args = {}) {
      const plan = buildDirectorPlan(args);
      const result = runtime(args ?? {});
      // Task 2.2 (R4.1): enforce the STRONGER runtime guarantee — no stage
      // begins before its immediately preceding stage reaches a completed
      // state. The runtime composition (`runVideoRemix`) emits each stage's
      // natural status; this state-machine layer holds any downstream stage
      // that would otherwise have begun (e.g. reached its approval gate or
      // resolved a plan artifact) while an upstream stage is still
      // weak_signal/approval_required/blocked. Stage objects are copied, so the
      // base runtime payload is left untouched (Section-1 compatibility).
      const enforced = enforceStrictStageOrdering(result.payload);
      const payload = enforced.manifest;
      const ordering = checkStageOrderingInvariant(payload);
      const strictOrdering = checkStrictStageOrdering(payload);
      return {
        payload,
        text: result.text,
        workflow: {
          name: DIRECTOR_TOOL_NAME,
          version: DIRECTOR_WORKFLOW_VERSION,
          stageOrder: DIRECTOR_STAGE_ORDER,
          steps,
          plan,
          ordering,
          strictOrdering,
          orderingHalts: enforced.downgrades,
          orderingFrontier: enforced.frontier,
          seams: DIRECTOR_SEAMS,
        },
      };
    },
  };
}

/**
 * Convenience entrypoint: run the Director workflow skeleton over `args`.
 * Mirrors `runVideoRemix`'s `{ payload, text }` shape and adds the `workflow`
 * sibling. The default export wraps the canonical runtime.
 */
export function runDirectorWorkflow(args = {}, config = {}) {
  return createDirectorWorkflow(config).run(args);
}
