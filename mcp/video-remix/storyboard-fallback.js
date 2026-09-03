// Reasoning-failure single-node FALLBACK for the Storyboard_Harness
// (agentic-graph-acos-mcp-connector spec, task 3.7 / R7.5 / Property 14).
//
// R7.5: IF storyboard reasoning fails, THEN THE Storyboard_Harness SHALL emit a
// fallback Kgc_Document containing exactly ONE `flow.nodes[]` entry that
// validates against `kgc-computing-flow/v1` and satisfies the round-trip
// property of R7.3, and SHALL return an indication that fallback content was
// substituted.
//
// This module is the cohesive helper extracted out of `storyboard-harness.js`
// so that file stays under the 600-line ceiling (reuse-not-rebuild /
// harness-first). It owns three concerns and nothing else:
//   1. detect a reasoning failure SIGNAL in a chat-client result
//      (`reasoningSignaledFailure`) — a THROW from the client is detected by the
//      harness directly and is also a reasoning failure;
//   2. build the single-node fallback Kgc_Document
//      (`buildFallbackStoryboardDocument`) from the SAME shot-plan/markdown/flow
//      builders the success path uses (reuse-not-rebuild via `storyboard.js`);
//   3. provide the structural round-trip helper (`flowRoundTripEquivalent`,
//      `serializeFlow`, `parseFlow`) that proves Property 14's round-trip clause
//      for the single-node flow. As of spec task 8.6 / Property 13 the dedicated
//      `kgc-computing-flow/v1` parser/serializer lands in the shared contracts
//      package (`contracts/kgc-document.schema.js`); these helpers now DELEGATE
//      to that canonical SSOT (no fork) so the fallback round-trip is asserted
//      over the same parse(serialize(flow)) implementation the rest of the
//      system uses (identical node count, identical set + ordering of node ids,
//      identical edge connections, stable on a second pass).
//
// The module does NOT validate the document against the schema itself — the
// harness runs the produced document through its own exported
// `emitValidatedStoryboard` / `validateKgcComputingFlowV1` gate so there is a
// single validation source of truth and no circular import.
//
// Pure / SDK-agnostic: importable by both the Node tests and the Worker bundle.

import { cleanString } from "./helpers.js";
import { buildShotPlan, buildStoryboardMarkdown, buildStoryboardFlow } from "./storyboard.js";
// Canonical `kgc-computing-flow/v1` parser/serializer SSOT (spec task 8.6 /
// R7.3 / Property 13). The round-trip helpers below DELEGATE here so the
// fallback uses the SSOT rather than a fork.
import {
  serializeKgcFlow,
  parseKgcFlow,
  kgcFlowEquivalent,
  kgcFlowRoundTripEquivalent,
} from "../../contracts/kgc-document.schema.js";

// Exactly one node in a fallback document (R7.5 / Property 14).
export const FALLBACK_SHOT_COUNT = 1;
// Canonical reason recorded when the fallback is substituted because reasoning
// failed without a more specific cause being available.
export const FALLBACK_REASON = "storyboard_reasoning_failed";
// Default prompt for the single fallback shot when the brief is empty.
const FALLBACK_DEFAULT_PROMPT = "Storyboard fallback shot";

/**
 * Detect whether a chat-client `plan(...)` RESULT explicitly signals a reasoning
 * failure. This is the non-throwing failure channel: a client that completes but
 * reports it could not reason (e.g. a degraded BytePlus/AI-Gateway response)
 * returns a result carrying `reasoningFailed:true` or `failed:true`.
 *
 * A THROW from the client is a reasoning failure too, but it is caught by the
 * harness directly (not here). A normal result with no failure flag — including
 * an empty/partial result — is NOT treated as a failure, so the success path
 * (tasks 3.5 / 3.6) is unchanged.
 *
 * @param {*} reasoning - the resolved value of `chatClient.plan(...)`.
 * @returns {boolean} true only when the result explicitly signals failure.
 */
export function reasoningSignaledFailure(reasoning) {
  return Boolean(
    reasoning &&
      typeof reasoning === "object" &&
      (reasoning.reasoningFailed === true || reasoning.failed === true),
  );
}

/**
 * Extract a human-readable reason from a thrown error or a failure-signalling
 * result, falling back to the canonical `FALLBACK_REASON`.
 */
export function fallbackReasonFrom(source) {
  if (source instanceof Error) return cleanString(source.message, FALLBACK_REASON);
  if (source && typeof source === "object") return cleanString(source.reason, FALLBACK_REASON);
  return FALLBACK_REASON;
}

/**
 * Build the single-node fallback Kgc_Document `{ canvasDocumentMarkdown, flow,
 * plannedShots }`. Reuses `buildShotPlan` (forced to exactly ONE shot),
 * `buildStoryboardMarkdown`, and `buildStoryboardFlow` so the fallback document
 * is structurally identical to a one-shot success document and therefore
 * validates against `kgc-computing-flow/v1` and round-trips by construction.
 *
 * The single shot references one Evidence_Pack `sourceId` when any is available
 * (keeping the referential seam clean), otherwise none.
 *
 * @param {object} params
 * @param {string} params.brief        - the approved brief (stamped into markdown).
 * @param {string[]} [params.sourceIds]- Evidence_Pack source ids.
 * @param {string} [params.runId]      - run id stamped into the canvas markdown.
 * @param {string} [params.referenceUrl] - reference url stamped into the markdown.
 * @param {number} [params.sourceCount] - Evidence_Pack source count (node status).
 */
export function buildFallbackStoryboardDocument({ brief, sourceIds, runId, referenceUrl, sourceCount } = {}) {
  const ids = Array.isArray(sourceIds) ? sourceIds : [];
  const topic = cleanString(brief, FALLBACK_DEFAULT_PROMPT);
  const resolvedRunId = cleanString(runId, "video-remix-run");
  const resolvedReferenceUrl = cleanString(referenceUrl);
  const resolvedSourceCount = Number.isFinite(sourceCount) ? sourceCount : ids.length;

  // Exactly one shot (R7.5). Reuse the canonical shot-plan builder, then enrich
  // with the fallback prompt + one source reference (clean referential seam).
  const baseShots = buildShotPlan({ brief: topic, sourceCount: resolvedSourceCount, shotCount: FALLBACK_SHOT_COUNT });
  const plannedShots = baseShots.map((shot) => ({
    ...shot,
    prompt: `${topic} - fallback storyboard`,
    sourceCardIds: ids.length ? [ids[0]] : [],
  }));

  const canvasDocumentMarkdown = buildStoryboardMarkdown({
    runId: resolvedRunId,
    referenceUrl: resolvedReferenceUrl,
    brief: topic,
    shots: plannedShots,
  });
  const flow = buildStoryboardFlow(plannedShots);

  return { canvasDocumentMarkdown, flow, plannedShots };
}

/**
 * Minimal structural serializer for a flow graph. DELEGATES to the canonical
 * `kgc-computing-flow/v1` serializer (`contracts/kgc-document.schema.js`,
 * `serializeKgcFlow`) so there is no fork: it emits a stable JSON string
 * capturing only the round-trip-significant fields (node count + ordering +
 * ids/labels/types/status, and edge connections).
 */
export function serializeFlow(flow) {
  return serializeKgcFlow(flow);
}

/**
 * Inverse of `serializeFlow`: parse a serialized flow back into `{ nodes, edges }`.
 * DELEGATES to the canonical `parseKgcFlow`.
 */
export function parseFlow(serialized) {
  return parseKgcFlow(serialized);
}

/**
 * Flow-structure equivalence per R7.3 / Property 13: identical node count,
 * identical set of node ids, identical node ORDERING, and identical edge
 * connections (source -> target pairs, in order). DELEGATES to the canonical
 * `kgcFlowEquivalent`.
 */
export function flowEquivalent(a, b) {
  return kgcFlowEquivalent(a, b);
}

/**
 * Property 14 round-trip clause for a flow: parse(serialize(flow)) yields a flow
 * equivalent to the original, AND a second parse(serialize(...)) pass is stable
 * (parse → serialize → parse is idempotent up to equivalence). DELEGATES to the
 * canonical `kgcFlowRoundTripEquivalent`. Returns a boolean.
 */
export function flowRoundTripEquivalent(flow) {
  return kgcFlowRoundTripEquivalent(flow);
}
