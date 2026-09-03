// Source referential integrity for the Storyboard_Harness
// (agentic-graph-acos-mcp-connector spec, task 3.8 / R6.3 / R6.6 / Property 10 —
// the storyboard-claim side).
//
// R6.3: THE Storyboard_Harness SHALL reference at least one `sourceId`, each
// resolving to a Source_Card present in the associated Evidence_Pack, for every
// downstream claim derived from research.
// R6.6: IF the Storyboard_Harness produces a downstream claim that references a
// `sourceId` not present in the associated Evidence_Pack, THEN THE
// Storyboard_Harness SHALL reject the claim and return an error indicating an
// unresolved source reference.
//
// This module is the cohesive helper extracted out of `storyboard-harness.js`
// so that file stays under the 600-line ceiling (reuse-not-rebuild /
// harness-first). It owns one concern: given the produced storyboard CLAIMS
// (the per-shot `sourceCardIds`) and the set of Source_Card ids actually
// present in the supplied Evidence_Pack (the `collectEvidenceSourceIds` seam),
// determine whether every referenced `sourceId` resolves to an in-pack
// Source_Card, and surface a typed unresolved-source error otherwise.
//
// The deterministic default storyboard client references only in-pack ids by
// construction, so the success path (tasks 3.5/3.6) is unchanged. The rejection
// triggers only when an injected (live) chat client — or a `beforeEmit`
// transform — produces a claim that references a `sourceId` absent from the
// Evidence_Pack. This is DISTINCT from the R7.4 schema reject (a malformed
// produced document) and the R7.5 reasoning-failure fallback.
//
// Pure / SDK-agnostic: importable by both the Node tests and the Worker bundle.

import { cleanString } from "./helpers.js";

// Terminal status for the R6.6 unresolved-source reject path: a produced claim
// referenced a `sourceId` absent from the Evidence_Pack, so the harness emits
// NO `flow.nodes[]` and surfaces an unresolved-source error. Distinct from
// `complete` (normal emission), `rejected` (a produced document that failed
// `kgc-computing-flow/v1` validation), and `fallback` (reasoning failure).
export const STORYBOARD_STATUS_UNRESOLVED_SOURCE = "unresolved_source";

/**
 * Typed error for the Storyboard_Harness source referential-integrity gate
 * (R6.3 / R6.6 / Property 10). Raised/surfaced when a produced claim references
 * a `sourceId` that is NOT present in the associated Evidence_Pack. Carries the
 * list of `unresolved` `{ shotId, sourceId }` pairs so the reject path can name
 * every unresolved reference to the caller. Mirrors the `field`/`code` shape of
 * the sibling `StoryboardHarnessInputError` / `StoryboardSchemaValidationError`.
 */
export class StoryboardUnresolvedSourceError extends Error {
  constructor(unresolved) {
    const list = Array.isArray(unresolved) ? unresolved : [];
    const detail = list
      .map((ref) => `${cleanString(ref?.sourceId, "<empty>")} (claim ${cleanString(ref?.shotId, "<unknown>")})`)
      .join("; ");
    super(`Storyboard claim references unresolved source(s) not in the Evidence_Pack: ${detail}`);
    this.name = "StoryboardUnresolvedSourceError";
    this.code = "unresolved_source_reference";
    this.field = "sourceCardIds";
    this.unresolved = list;
  }
}

/**
 * Collect every `sourceId` referenced by the produced storyboard claims (the
 * per-shot `sourceCardIds`). Returns an ordered, unique list of non-empty ids.
 *
 * @param {Array<{ shotId?: string, sourceCardIds?: string[] }>} plannedShots
 * @returns {string[]}
 */
export function collectClaimSourceIds(plannedShots) {
  const shots = Array.isArray(plannedShots) ? plannedShots : [];
  const seen = new Set();
  const ids = [];
  for (const shot of shots) {
    const refs = Array.isArray(shot?.sourceCardIds) ? shot.sourceCardIds : [];
    for (const ref of refs) {
      const id = cleanString(ref);
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

/**
 * Find every claim → `sourceId` reference that does NOT resolve to a
 * Source_Card present in the Evidence_Pack. Returns an ordered list of
 * `{ shotId, sourceId }` pairs (one per offending reference, preserving claim
 * order and reference order). An empty list means every referenced `sourceId`
 * resolves to an in-pack Source_Card (R6.3 satisfied).
 *
 * @param {Array<{ shotId?: string, sourceCardIds?: string[] }>} plannedShots
 * @param {string[]} allowedSourceIds - ids present in the Evidence_Pack
 *   (`collectEvidenceSourceIds` output).
 * @returns {Array<{ shotId: string, sourceId: string }>}
 */
export function findUnresolvedSourceReferences(plannedShots, allowedSourceIds) {
  const shots = Array.isArray(plannedShots) ? plannedShots : [];
  const allowed = new Set((Array.isArray(allowedSourceIds) ? allowedSourceIds : []).map((id) => cleanString(id)));
  const unresolved = [];
  shots.forEach((shot, index) => {
    const refs = Array.isArray(shot?.sourceCardIds) ? shot.sourceCardIds : [];
    const shotId = cleanString(shot?.shotId, `shot-${index + 1}`);
    for (const ref of refs) {
      const id = cleanString(ref);
      if (id && !allowed.has(id)) {
        unresolved.push({ shotId, sourceId: id });
      }
    }
  });
  return unresolved;
}

/**
 * Source referential-integrity gate (R6.3 / R6.6 / Property 10). Given the
 * produced claims and the Evidence_Pack source ids, returns
 * `{ ok, unresolved[], error }`:
 *   * `ok:true,  unresolved:[], error:null` when every referenced `sourceId`
 *     resolves to an in-pack Source_Card (or no claim references any source).
 *   * `ok:false, unresolved:[{shotId,sourceId}...], error:<typed>` when at least
 *     one claim references a `sourceId` absent from the Evidence_Pack. The typed
 *     `StoryboardUnresolvedSourceError` names every unresolved reference.
 *
 * This gate does NOT throw — the harness inspects the result and assembles the
 * `unresolved_source` reject result (no nodes emitted), keeping a single, pure
 * decision point.
 *
 * @param {Array} plannedShots
 * @param {string[]} allowedSourceIds
 */
export function checkSourceReferentialIntegrity(plannedShots, allowedSourceIds) {
  const unresolved = findUnresolvedSourceReferences(plannedShots, allowedSourceIds);
  if (unresolved.length === 0) {
    return { ok: true, unresolved: [], error: null };
  }
  return { ok: false, unresolved, error: new StoryboardUnresolvedSourceError(unresolved) };
}

/**
 * Assemble the Storyboard_Harness `unresolved_source` reject result (R6.6 /
 * Property 10). Emits NO `flow.nodes[]` (the unresolved claim is rejected, not
 * emitted), surfaces the typed unresolved-source error message + the offending
 * `{ shotId, sourceId }` pairs, and keeps the result shape aligned with the
 * sibling reject/fallback paths so the Director / McpAgent boundary can treat
 * every storyboard outcome uniformly. The schema gate is NOT the failing check
 * here, so `schemaValid:false` / `validationError:null` distinguish this from
 * the R7.4 schema reject, and `fallbackSubstituted:false` from the R7.5 fallback.
 *
 * Lives here (not in the harness) so `storyboard-harness.js` stays under the
 * 600-line ceiling; the harness wires it with a tiny call.
 *
 * @param {object} params
 * @param {{ unresolved: Array, error: Error }} params.referential - the failed
 *   `checkSourceReferentialIntegrity` result.
 * @param {string} params.gateId
 * @param {string} params.schema
 * @param {number} params.paidProviderCalls
 * @param {number} params.plannedShotCount
 * @param {string[]} params.sourceReferences
 * @param {Array} params.plannedShots
 */
export function buildUnresolvedSourceResult({
  referential,
  gateId,
  schema,
  paidProviderCalls,
  plannedShotCount,
  sourceReferences,
  plannedShots,
}) {
  return {
    status: STORYBOARD_STATUS_UNRESOLVED_SOURCE,
    gateId,
    paidProviderCalls,
    schema,
    // No nodes emitted (R6.6): the unresolved claim is rejected, not emitted.
    shotCount: 0,
    plannedShotCount,
    sourceReferences,
    // Reasoning-failure fallback (task 3.7) is a different path.
    fallbackSubstituted: false,
    // The schema gate is NOT the failing check here; the document is rejected
    // on referential grounds before validation.
    schemaValid: false,
    schemaErrors: [],
    validationError: null,
    // The unresolved-source rejection surface (R6.6).
    unresolvedSources: referential.unresolved,
    unresolvedSourceError: referential.error.message,
    canvasDocumentMarkdown: null,
    flow: { nodes: [], edges: [] },
    plannedShots,
  };
}
