// Run_Manifest rendering view-model for the agentic-graph Cloudflare Pages frontend.
//
// Spec: agentic-graph-acos-mcp-connector, task 7.10 (R1.9, R13.4; design Correctness
// Property 32; design Frontend `renderManifest`).
//
// R13.4: "WHEN the Frontend receives an updated Run_Manifest, THE Frontend SHALL
// render the current Run_State, the complete stage list, and the Budget_Meters
// within 2 seconds of receipt."
// R1.9: "WHEN the Run_Manifest state changes at a stage transition, THE Frontend
// SHALL display the updated Run_Manifest state to the end creator user."
//
// This module is the PURE, framework-agnostic, ZERO-network/ZERO-browser
// view-model builder that turns a Run_Manifest into a render-ready view:
//
//   { runState, stages: [...], budgetMeters, renderWithinDeadline,
//     renderDeadlineMs, ... }
//
// exposing the current Run_State, the complete source-declared stage list, and the
// Budget_Meters (estimatedCostUsd, actualCostUsd, providerSpendUsd). Re-building
// from an updated manifest yields the new state / stages / meters, which is how
// the Frontend reflects each stage transition (R1.9 / R13.4 / Property 32).
//
// STAGE-LIST REUSE (do NOT fork): `buildRunInitiationView` projects the runtime
// manifest directly. The frontend never backfills or mirrors stage topology.
//
// RUN_STATE MIRROR (do NOT fork): the canonical Run_State catalog mirrors the
// design Data Models / Glossary. The runtime is the single source of truth for
// the emitted `state`; this view surfaces it verbatim and additionally flags
// whether it is a known canonical state and whether it is terminal — it never
// rewrites the runtime's state value.
//
// 2s RENDER DEADLINE (R13.4): the "within 2 seconds of receipt" bound is
// recorded as STRUCTURAL METADATA and asserted structurally — there is NO real
// timer. An injectable elapsed signal (`renderElapsedMs`) models a slow render,
// mirroring the approval-prompt-view (`renderElapsedMs` /
// `APPROVAL_PROMPT_DEADLINE_MS`) and run-submission-client patterns.
//
// STACK BOUNDARY (R11): the product tier holds no model provider keys; this
// builder reads only manifest data and performs no I/O.

import { buildRunInitiationView } from "./run-initiation-view.js";

// --- Contract constants -----------------------------------------------------

/**
 * Structural render deadline (R13.4): an updated Run_Manifest must render
 * Run_State + the complete stage list + Budget_Meters within 2,000 ms of
 * receipt. Timer-free here — the builder is synchronous; an injectable elapsed
 * signal models a slow render so the deadline can be asserted structurally.
 */
export const MANIFEST_RENDER_DEADLINE_MS = 2000;

/**
 * Canonical Run_State catalog (design Data Models / Glossary). Surfaced so a
 * renderer can recognise a known lifecycle state; it is NOT a filter — the view
 * surfaces whatever `state` the runtime emits, even a runtime-internal variant
 * (e.g. `dry_run_ready`, `complete`), so the product tier never desyncs from the
 * worker source of truth.
 */
export const RUN_STATES = Object.freeze([
  "running",
  "blocked",
  "budget_exceeded",
  "approval_required",
  "verification_failed",
  "completed",
]);

/**
 * Terminal Run_States: a run in one of these states has reached the end of its
 * lifecycle (no further automatic transitions). `completed` is the canonical
 * success terminal; the runtime also emits `complete` for the same meaning, so
 * both are recognised. `blocked` / `budget_exceeded` / `verification_failed` are
 * fail-closed terminals.
 */
export const TERMINAL_RUN_STATES = Object.freeze([
  "completed",
  "complete",
  "blocked",
  "budget_exceeded",
  "verification_failed",
]);

/** Run_State surfaced when the manifest carries no usable `state` value. */
export const DEFAULT_RUN_STATE = "running";

/** The Budget_Meters fields surfaced by the view (design Data Models). */
export const BUDGET_METER_FIELDS = Object.freeze([
  "estimatedCostUsd",
  "actualCostUsd",
  "providerSpendUsd",
]);

// --- Helpers ----------------------------------------------------------------

/**
 * Resolve the underlying Run_Manifest from any of the carriers the Frontend may
 * receive: a raw manifest, or a manifest nested under `runManifest` / `manifest`
 * (the Agent_Api / MCP forwarding envelopes). Tolerates malformed/missing input
 * by returning an empty object (never throws).
 *
 * @param {unknown} input Run_Manifest or manifest-bearing envelope
 * @returns {object}
 */
export function resolveManifest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  for (const key of ["runManifest", "manifest"]) {
    const nested = input[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return nested;
    }
  }
  return input;
}

/**
 * Resolve the current Run_State from a manifest. The runtime is the source of
 * truth, so a non-empty `state` string is surfaced verbatim (trimmed); a
 * missing/blank/malformed state falls back to `DEFAULT_RUN_STATE` so the view
 * always has a displayable lifecycle value.
 *
 * @param {object} manifest resolved manifest
 * @returns {string}
 */
export function resolveRunState(manifest) {
  const raw = manifest && typeof manifest === "object" ? manifest.state : null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed) return trimmed;
  }
  return DEFAULT_RUN_STATE;
}

/**
 * Coerce a value to a finite, non-negative USD meter amount. A
 * missing/malformed/negative value falls back to 0 so a meter ALWAYS surfaces a
 * displayable amount (R13.4) and never NaN.
 *
 * @param {unknown} value
 * @returns {number}
 */
function toMeterAmount(value) {
  const amount = Number(value);
  if (Number.isFinite(amount) && amount >= 0) return amount;
  return 0;
}

/**
 * Format a USD amount as a deterministic, locale-independent display string
 * (e.g. `$0.00`, `$42.50`).
 *
 * @param {number} amount finite, non-negative USD amount
 * @returns {string}
 */
function formatUsd(amount) {
  return `$${amount.toFixed(2)}`;
}

/**
 * Build the Budget_Meters view (design Data Models): the three canonical USD
 * meters, each coerced to a finite non-negative number with a `$0.00`-formatted
 * display companion. Tolerates a missing/malformed `budgetMeters` object by
 * zeroing every meter.
 *
 * @param {object} manifest resolved manifest
 * @returns {{
 *   estimatedCostUsd: number,
 *   actualCostUsd: number,
 *   providerSpendUsd: number,
 *   estimatedCostDisplay: string,
 *   actualCostDisplay: string,
 *   providerSpendDisplay: string,
 * }}
 */
export function buildBudgetMetersView(manifest) {
  const meters =
    manifest && typeof manifest.budgetMeters === "object" && manifest.budgetMeters
      ? manifest.budgetMeters
      : {};
  const estimatedCostUsd = toMeterAmount(meters.estimatedCostUsd);
  const actualCostUsd = toMeterAmount(meters.actualCostUsd);
  const providerSpendUsd = toMeterAmount(meters.providerSpendUsd);
  return {
    estimatedCostUsd,
    actualCostUsd,
    providerSpendUsd,
    estimatedCostDisplay: formatUsd(estimatedCostUsd),
    actualCostDisplay: formatUsd(actualCostUsd),
    providerSpendDisplay: formatUsd(providerSpendUsd),
  };
}

/**
 * Resolve the (timer-free) render-elapsed signal. The real elapsed time is
 * measured by the live wiring; here a caller injects whether the render exceeded
 * the 2,000 ms deadline so the metadata can be asserted structurally. Defaults
 * to 0 (synchronous deterministic build).
 *
 * @param {unknown} value injected elapsed signal (ms)
 * @returns {number}
 */
function resolveRenderElapsedMs(value) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

// --- Public API -------------------------------------------------------------

/**
 * Build the Run_Manifest rendering view-model from a Run_Manifest (or a
 * manifest-bearing envelope).
 *
 * The result exposes the current `runState` (surfaced verbatim from the runtime,
 * falling back to `running` when absent), the COMPLETE `stages[]` list (every
 * planned creative stage in canonical order with its current manifest status and
 * guarding gate id — built via the shared `buildRunInitiationView` so the list
 * is always complete), and the `budgetMeters` (estimatedCostUsd, actualCostUsd,
 * providerSpendUsd, each with a formatted display companion).
 *
 * Re-building from an updated manifest reflects the stage transition: the new
 * state, the new per-stage statuses, and the new meters all appear in the fresh
 * view (R1.9 / R13.4 / Property 32). The builder is pure, so the same manifest
 * always yields the same view and an updated manifest always yields the updated
 * view.
 *
 * The 2,000 ms render deadline (R13.4) is recorded as structural metadata:
 * `renderDeadlineMs` is the bound, `renderElapsedMs` is the injected elapsed
 * signal (default 0), and `renderWithinDeadline` is true iff the elapsed signal
 * is within the bound. There is NO real timer.
 *
 * Pure and deterministic: performs no I/O, never mutates the input, and never
 * throws for malformed input.
 *
 * @param {unknown} manifest Run_Manifest or manifest-bearing envelope
 * @param {object} [opts]
 * @param {number} [opts.renderElapsedMs] injected elapsed signal (ms) modelling
 *   render latency for the 2,000 ms deadline assertion (default 0 — synchronous)
 * @returns {{
 *   runState: string,
 *   isKnownRunState: boolean,
 *   isTerminalState: boolean,
 *   stages: Array<{
 *     id: string,
 *     label: string,
 *     order: number,
 *     status: string,
 *     gateId: string|null,
 *   }>,
 *   stageCount: number,
 *   budgetMeters: {
 *     estimatedCostUsd: number,
 *     actualCostUsd: number,
 *     providerSpendUsd: number,
 *     estimatedCostDisplay: string,
 *     actualCostDisplay: string,
 *     providerSpendDisplay: string,
 *   },
 *   renderElapsedMs: number,
 *   renderWithinDeadline: boolean,
 *   renderDeadlineMs: number,
 * }}
 */
export function buildRunManifestView(manifest, opts = {}) {
  const resolved = resolveManifest(manifest);

  const runState = resolveRunState(resolved);

  // COMPLETE stage list (R13.4): reuse the run-initiation builder so every
  // planned creative stage is present in canonical order, each reflecting its
  // current manifest status and guarding gate id.
  const initiationView = buildRunInitiationView(resolved);
  const stages = initiationView.stages;

  const budgetMeters = buildBudgetMetersView(resolved);

  // 2,000 ms render-deadline metadata (R13.4) — asserted structurally.
  const renderElapsedMs = resolveRenderElapsedMs(opts.renderElapsedMs);

  return {
    runState,
    isKnownRunState: RUN_STATES.includes(runState),
    isTerminalState: TERMINAL_RUN_STATES.includes(runState),
    stages,
    stageCount: stages.length,
    budgetMeters,
    renderElapsedMs,
    renderWithinDeadline: renderElapsedMs <= MANIFEST_RENDER_DEADLINE_MS,
    renderDeadlineMs: MANIFEST_RENDER_DEADLINE_MS,
  };
}
