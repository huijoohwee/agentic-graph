// Shared constants for the video-remix Director runtime.
//
// Extracted verbatim from `mcp/video-remix-runtime.js` (reuse-not-rebuild) so
// the cohesive runtime modules under `mcp/video-remix/` share one source of
// truth for the contract version, retry/budget/failure domain constants, and
// the approval-gate / demo-section catalogs. Pure data — importable by both
// the Node tests and the Cloudflare Worker bundle.

import {
  VIDEO_REMIX_SPEND_BEARING_STAGES,
  VIDEO_REMIX_STAGE_GATES,
} from "./stage-contract.js";

const CONTRACT_VERSION = "agenticgraph.video_remix/v0.1";
const DEFAULT_MAX_ITERATIONS = 8;
const DEFAULT_SHOT_COUNT = 4;
const REQUIRED_RESEARCH_SOURCE_COUNT = 3;

// ---------------------------------------------------------------------------
// Bounded-retry failure-handling model (spec task 2.6 / R5.1, R5.2, R5.3 /
// Property 8 — partial; the fail-closed-on-exhaustion half is task 2.7).
// ---------------------------------------------------------------------------
// This is a DETERMINISTIC, PURE model of the Director's bounded-retry policy.
// It NEVER sleeps — it maps an attempt index to the backoff delay that a real
// scheduler WOULD wait, so the policy is unit/property testable without timers.
//
//   * R5.1: exponential backoff starting at 1s, doubling each attempt, capped
//     at 30s per attempt; `retryCount` increments by exactly 1 per attempt.
//   * R5.2: total iterations are bounded by `maxIterations`, a positive integer
//     in [1,100]. This range is reconciled with the Section-1 worker schemas
//     (`cloudflare/workers/agenticgraph-mcp/index.ts` Zod `.int().min(1).max(100)`
//     and `tool-registry.mjs` JSON Schema `minimum:1, maximum:100`), which
//     already accept [1,100]. The runtime previously clamped maxIterations to
//     [1,12] via `normalizeCount`; `normalizeMaxIterations` below widens it to
//     [1,100] so the runtime and the MCP boundary agree on the accepted space.
//   * R5.3: WHILE `retryCount < maxIterations`, Run_State stays `running`.
//
// SEAM (task 2.7): when `retryCount` reaches `maxIterations` the run fails
// closed — Run_State becomes `blocked` and a failure record
// `{ stageId, finalRetryCount, reason }` is appended. That transition is NOT
// implemented here; this model only surfaces the `exhausted` run-state marker
// so task 2.7 can map it to `blocked` + the failure record.
const RETRY_BACKOFF_BASE_MS = 1000; // first attempt delay (R5.1)
const RETRY_BACKOFF_CAP_MS = 30000; // per-attempt cap (R5.1)
const MAX_ITERATIONS_MIN = 1; // R5.2 inclusive lower bound
const MAX_ITERATIONS_MAX = 100; // R5.2 inclusive upper bound (reconciled with worker schema)
const RETRY_RUN_STATE_RUNNING = "running"; // R5.3
const RETRY_RUN_STATE_EXHAUSTED = "exhausted"; // seam for task 2.7 (-> blocked)
const RUN_STATE_BLOCKED = "blocked"; // fail-closed Run_State on exhaustion (R5.4 / task 2.7)
// ---------------------------------------------------------------------------
// Budget-cap enforcement (spec task 2.9 / R4.6 / Property 9).
// ---------------------------------------------------------------------------
// R4.6: WHEN cumulative Budget_Meters spend reaches or exceeds the configured
// budget cap mid-run, THE Director SHALL record `budget_exceeded`, halt all
// further spend-bearing stages, and surface a budget-exceeded indication to the
// operator.
//
// `budget_exceeded` is its OWN terminal Run_State (the design Run_State enum is
// `running | blocked | budget_exceeded | approval_required | verification_failed
// | completed`). It is distinct from the `blocked` causes (weak-signal,
// provider-unavailability, retry-exhaustion): those halt the run for a
// degraded/failed reason, whereas `budget_exceeded` halts because the spend cap
// was reached. The Section-1 McpAgent Director output schema treats `state` as a
// permissive string (`z.string().optional()` in `index.ts`; `{ type: "string" }`
// in `tool-registry.mjs`), so the new state passes through with no schema change.
//
// Enforcement is DETERMINISTIC and timer-free. Cumulative spend is driven by an
// injectable signal (`simulatedSpendUsd`) so a test can push cumulative spend to
// or past the cap WITHOUT any real provider call; in production it is the same
// derived spend the Budget_Meters already track (provider spend + model spend).
const RUN_STATE_BUDGET_EXCEEDED = "budget_exceeded"; // R4.6 terminal state
// Status applied to a spend-bearing stage that is HELD (does not begin) because
// the budget cap was reached mid-run (R4.6 — "halt all further spend-bearing
// stages"). Distinct from `approval_required` (no token) and the dry-run
// resolution; it marks a stage that WOULD have spent but was halted by the cap.
const STAGE_STATUS_BUDGET_HELD = "budget_held";
// Reason codes recorded on a failure record so the cause is observable on the
// Run_Manifest (R5.4). The exhaustion reason is the canonical fail-closed cause.
const FAILURE_REASON_EXHAUSTED = "retry_exhausted_after_max_iterations";
const FAILURE_REASON_TRANSIENT = "transient_injected_tool_failure_retry_bounded";
// Total-provider-unavailability reason code (spec task 2.8 / R5.5). Distinct
// from the retry-exhaustion reason: an exhaustion failure CONSUMED its bounded
// retries (finalRetryCount == maxIterations), whereas a provider-unavailability
// degraded failure consumes NO additional retries (finalRetryCount stays at the
// CURRENT retryCount). The sibling reason code keeps the two fail-closed causes
// distinguishable on the canonical Run_Manifest `failures[]`.
const FAILURE_REASON_PROVIDER_UNAVAILABLE = "provider_unavailable_degraded";

const DIRECTOR_BRIEF_MAX_LENGTH = 5000;
const DIRECTOR_BUDGET_MIN_USD = 0.01;
const DIRECTOR_BUDGET_MAX_USD = 100000.0;
const DIRECTOR_VALID_MODES = Object.freeze(["live", "dry-run"]);
// Model-bearing stages that each cross the `paid-model-call` spend boundary
// (research + storyboard). Used to count recorded paid-provider calls (R2.3,
// R2.6 / Properties 2, 3). Render and payment provider calls are counted
// separately from produced assets / settled payout.
const MODEL_BEARING_PAID_STAGES = 2;

// Spend-bearing pipeline stages (spec task 2.4 / R2.6, R4.4 / Property 3).
// Each of these crosses a spend boundary in Live_Mode (model token spend,
// render provider spend, deploy, or payment). In `mode:"dry-run"` — and in
// Live_Mode whenever the stage is reached without a verified Approval_Token —
// the stage MUST resolve to a Dry_Run plan artifact rather than executing.
const SPEND_BEARING_STAGES = VIDEO_REMIX_SPEND_BEARING_STAGES;

// Gate id guarding each spend-bearing stage. Mirrors `APPROVAL_GATES` /
// `DIRECTOR_STAGE_GATES` so the runtime, the workflow skeleton, and the
// Section-1 McpAgent boundary agree on what each stage requires. Recorded on
// the plan artifact so a dry-run / approval_required resolution is observable.
const SPEND_BEARING_STAGE_GATES = Object.freeze(Object.fromEntries(
  SPEND_BEARING_STAGES.map((stageId) => [stageId, VIDEO_REMIX_STAGE_GATES[stageId]]),
));

// Planned per-model-stage estimate ceiling used when a model-bearing stage
// resolves to a plan artifact (so the dry-run plan shows what the step WOULD
// cost). This is plan metadata only and never contributes to actual spend.
const PLANNED_MODEL_COST_USD = 0.03;

const APPROVAL_GATES = Object.freeze([
  { id: "paid-model-call", actionKind: "paid_call", risk: "Exa, BytePlus, external video provider, or provider token/API spend" },
  { id: "render-action", actionKind: "media_render", risk: "BytePlus/external video provider render queue spend" },
  { id: "edit-manifest-assembly", actionKind: "zero_spend_edit", risk: "none - zero-spend Edit_Manifest assembly, never gates execution" },
  { id: "payment-action", actionKind: "payment", risk: "Stripe checkout, settlement, refund, or payout mutation" },
  { id: "cloud-deploy", actionKind: "deploy", risk: "AWS, Vercel, or Cloudflare resource mutation" },
  { id: "consumer-repo-write", actionKind: "file_write", risk: "consumer repository mutation" },
  { id: "authenticated-browser", actionKind: "browser_auth", risk: "authenticated browser inspection" },
]);

const DEMO_SECTIONS = Object.freeze([
  "agent_overview",
  "autonomy_decision_making",
  "actions_tool_use",
  "orchestration",
  "human_in_the_loop",
  "failure_handling",
  "demo_presentation",
]);

export {
  CONTRACT_VERSION,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_SHOT_COUNT,
  REQUIRED_RESEARCH_SOURCE_COUNT,
  RETRY_BACKOFF_BASE_MS,
  RETRY_BACKOFF_CAP_MS,
  MAX_ITERATIONS_MIN,
  MAX_ITERATIONS_MAX,
  RETRY_RUN_STATE_RUNNING,
  RETRY_RUN_STATE_EXHAUSTED,
  RUN_STATE_BLOCKED,
  RUN_STATE_BUDGET_EXCEEDED,
  STAGE_STATUS_BUDGET_HELD,
  FAILURE_REASON_EXHAUSTED,
  FAILURE_REASON_TRANSIENT,
  FAILURE_REASON_PROVIDER_UNAVAILABLE,
  DIRECTOR_BRIEF_MAX_LENGTH,
  DIRECTOR_BUDGET_MIN_USD,
  DIRECTOR_BUDGET_MAX_USD,
  DIRECTOR_VALID_MODES,
  MODEL_BEARING_PAID_STAGES,
  SPEND_BEARING_STAGES,
  SPEND_BEARING_STAGE_GATES,
  PLANNED_MODEL_COST_USD,
  APPROVAL_GATES,
  DEMO_SECTIONS,
};
