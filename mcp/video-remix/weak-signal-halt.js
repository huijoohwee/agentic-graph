// Weak-signal halt-before-storyboard gate for the video-remix Director runtime
// (agenticgraph-acos-mcp-connector spec, task 3.4 / R4.5, R6.5 / Property 11 —
// the Director HALT side).
//
// Responsibility (single): given the research Source_Card count, decide whether
// the Director must HALT before the storyboard stage because research came back
// with fewer than the required minimum (a `weak_signal`), and expose an
// observable "awaiting approval to continue past weak signal" indication. The
// halt is LIFTED only when a verified continuation Approval_Token is supplied.
//
// Boundary / reuse notes (do not overstep adjacent tasks):
//   * The Research_Harness (task 3.3) already marks its envelope `weak_signal`
//     and NEVER fabricates sources. This module is purely the Director-side
//     halt decision over the resulting (genuine, sub-minimum) source count —
//     it never adds sources and never re-derives evidence.
//   * The continuation approval is modeled as an INJECTABLE input (a boolean or
//     a `{ verified, gateId }` token), NOT a real wait/timer, so the halt and
//     its release are deterministic and unit/property testable. Live wiring of
//     a real Approval_Token through the Hitl_Gate_Service is Section 4.
//   * Strict ordering (task 2.2) is honored: while halted, the storyboard and
//     every downstream stage must NOT begin (executed === false).
//
// Pure / SDK-agnostic: importable by both the Node tests and the Cloudflare
// Worker bundle.

// Continuation gate id authorizing a run to proceed PAST a weak-signal research
// stage. Kept distinct from the spend-boundary gate ids so the override is
// observable as its own, explicit operator decision (R4.5).
export const WEAK_SIGNAL_CONTINUE_GATE_ID = "weak-signal-continue";

const RESEARCH_STATUS_WEAK_SIGNAL = "weak_signal";
const STORYBOARD_STATUS_BLOCKED_WEAK_SIGNAL = "blocked_weak_signal";
// Stages that must remain un-begun while the run is halted on a weak signal:
// storyboard (the stage the halt protects) plus every stage downstream of it.
const HELD_DOWNSTREAM_STAGE_IDS = Object.freeze(["storyboard", "render", "publish", "checkout"]);

/**
 * Verify an injected continuation approval. Accepts:
 *   * `true` — a permissive, already-verified continuation signal (tests/live
 *     glue that has already validated a token through the gate service);
 *   * `{ verified: true, gateId?: "weak-signal-continue" }` — a token-shaped
 *     object; it authorizes continuation only when `verified` is truthy AND, if
 *     a `gateId` is present, it matches the continuation gate.
 * Anything else (absent / falsy / mismatched gate) does NOT authorize
 * continuation, so the run stays halted (R4.5).
 */
export function verifyContinuationApproval(approval) {
  if (approval === true) return true;
  if (approval && typeof approval === "object") {
    const matchesGate =
      approval.gateId === undefined || approval.gateId === WEAK_SIGNAL_CONTINUE_GATE_ID;
    return Boolean(approval.verified) && matchesGate;
  }
  return false;
}

/**
 * Build the weak-signal halt decision (R4.5 / R6.5 / Property 11 — Director
 * side).
 *
 * @param {number} sourceCount         - genuine Source_Card count from research.
 * @param {number} requiredSourceCount - minimum sources before storyboard.
 * @param {boolean|object} [continuationApproval] - injected continuation token.
 *
 * @returns {{
 *   weakSignal: boolean,
 *   sourceCount: number,
 *   requiredSourceCount: number,
 *   halted: boolean,
 *   continuationApproved: boolean,
 *   awaitingApprovalToContinue: boolean,
 *   gateId: string,
 *   summary: object,
 *   haltEnforced: (ctx: object) => boolean,
 * }}
 *
 * `weakSignal` is true whenever the genuine source count is below the minimum
 * (no fabrication). `halted` is true while weak AND no verified continuation
 * approval exists; once a verified continuation token is supplied the halt is
 * LIFTED so the run may proceed past research (subject to other gates).
 */
export function buildWeakSignalHalt(sourceCount, requiredSourceCount, continuationApproval) {
  const count = Number.isFinite(sourceCount) ? sourceCount : 0;
  const required = Number.isFinite(requiredSourceCount) ? requiredSourceCount : 3;
  const weakSignal = count < required;
  const continuationApproved = weakSignal ? verifyContinuationApproval(continuationApproval) : false;
  const halted = weakSignal && !continuationApproved;
  const awaitingApprovalToContinue = halted;
  const indication = halted
    ? `Research returned ${count} of the required ${required} sources (weak_signal); ` +
      `halted before storyboard. Awaiting a verified continuation Approval_Token ` +
      `(gate '${WEAK_SIGNAL_CONTINUE_GATE_ID}') to proceed; no sources are fabricated.`
    : null;

  return {
    weakSignal,
    sourceCount: count,
    requiredSourceCount: required,
    halted,
    continuationApproved,
    awaitingApprovalToContinue,
    gateId: WEAK_SIGNAL_CONTINUE_GATE_ID,
    // Serializable indication surfaced on the Run_Manifest so the halt and the
    // "awaiting approval to continue" state are observable to the operator/UI.
    summary: {
      weakSignal,
      sourceCount: count,
      requiredSourceCount: required,
      halted,
      continuationApproved,
      awaitingApprovalToContinue,
      continuationGateId: WEAK_SIGNAL_CONTINUE_GATE_ID,
      indication,
    },
    /**
     * Assert the halt invariant against the assembled manifest fields. Vacuously
     * true when not halted; otherwise the run must be `blocked`, research must be
     * `weak_signal`, storyboard must be `blocked_weak_signal`, every downstream
     * stage must be un-begun (executed === false), and the awaiting-approval
     * indication must be set.
     */
    haltEnforced({ state, researchStatus, storyboardStatus, stages } = {}) {
      if (!halted) return true;
      const downstreamHeld = Array.isArray(stages)
        ? stages
            .filter((stage) => HELD_DOWNSTREAM_STAGE_IDS.includes(stage.id))
            .every((stage) => stage.executed === false)
        : false;
      return (
        state === "blocked" &&
        researchStatus === RESEARCH_STATUS_WEAK_SIGNAL &&
        storyboardStatus === STORYBOARD_STATUS_BLOCKED_WEAK_SIGNAL &&
        downstreamHeld &&
        awaitingApprovalToContinue === true
      );
    },
  };
}
