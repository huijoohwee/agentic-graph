// Storyboard_Harness: validates and emits AGENTIC_OS storyboard documents from an
// approved brief plus Evidence_Pack through an injectable chat-client seam.

import { cleanString } from "./helpers.js";
import { DEFAULT_SHOT_COUNT } from "./constants.js";
import {
  buildShotPlan,
  buildStoryboardMarkdown,
  buildStoryboardFlow,
  DEFAULT_TOKEN_BUDGET_CEILING,
  checkNarrativeCoherence,
  wrapChatClientWithTokenCeiling,
} from "./storyboard.js";
import {
  FALLBACK_SHOT_COUNT,
  buildFallbackStoryboardDocument,
  reasoningSignaledFailure,
  fallbackReasonFrom,
  flowRoundTripEquivalent,
} from "./storyboard-fallback.js";
import {
  STORYBOARD_STATUS_UNRESOLVED_SOURCE,
  StoryboardUnresolvedSourceError,
  checkSourceReferentialIntegrity,
  buildUnresolvedSourceResult,
} from "./storyboard-references.js";

// Contract constants (R7.1 / R7.2). The `agentic-os-computing-flow/v1` schema id the
// emitted AgenticOs_Document declares; the storyboard spend boundary gate id (mirrors
// `SPEND_BEARING_STAGE_GATES.storyboard`); and the planned-shot count window
// [1,500] (matches the worker `STORYBOARD_INPUT_SCHEMA` `minimum:1, maximum:500`).
export const AGENTIC_OS_COMPUTING_FLOW_SCHEMA = "agentic-os-computing-flow/v1";
export const STORYBOARD_GATE_ID = "paid-model-call";
export const STORYBOARD_MIN_SHOTS = 1;
export const STORYBOARD_MAX_SHOTS = 500;
export const STORYBOARD_DEFAULT_SHOT_COUNT = DEFAULT_SHOT_COUNT;
export const STORYBOARD_BRIEF_MAX_LENGTH = 5000;
export { DEFAULT_TOKEN_BUDGET_CEILING, checkNarrativeCoherence, wrapChatClientWithTokenCeiling };
const STORYBOARD_STATUS_COMPLETE = "complete";
// Terminal status for the R7.4 reject path: the produced AgenticOs_Document failed
// `agentic-os-computing-flow/v1` validation (or the one-node-per-shot count invariant),
// so the harness emits NO `flow.nodes[]` to the canvas.
const STORYBOARD_STATUS_REJECTED = "rejected";
// Terminal status for the R7.5 fallback path: storyboard reasoning FAILED, so
// the harness emitted a single-node fallback AgenticOs_Document that still validates
// and round-trips, with `fallbackSubstituted:true`. Distinct from `complete`
// (normal emission) and `rejected` (produced document failed validation).
const STORYBOARD_STATUS_FALLBACK = "fallback";
export { STORYBOARD_STATUS_COMPLETE, STORYBOARD_STATUS_REJECTED, STORYBOARD_STATUS_FALLBACK };
// Re-export the source referential-integrity surface (task 3.8 / R6.3 / R6.6 /
// Property 10): the unresolved-source status + typed error from one import site.
export { STORYBOARD_STATUS_UNRESOLVED_SOURCE, StoryboardUnresolvedSourceError };

/**
 * Typed input-validation error for the Storyboard_Harness contract. Mirrors the
 * `ResearchHarnessInputError` / `DirectorInputValidationError` shape (a `field`
 * naming the offending input) so the McpAgent / Agent_Api boundary can surface
 * the bad field to callers.
 */
export class StoryboardHarnessInputError extends Error {
  constructor(field, message) {
    super(message || `Invalid storyboard input: ${field}`);
    this.name = "StoryboardHarnessInputError";
    this.code = "invalid_storyboard_input";
    this.field = field;
  }
}

/**
 * Typed schema-validation error for the Storyboard_Harness emission gate (R7.4 /
 * Property 12). Raised/surfaced when the produced AgenticOs_Document fails
 * `agentic-os-computing-flow/v1` validation OR the exact one-node-per-shot count
 * invariant (R7.2). Carries the list of `errors` identifying every failed
 * check so the reject path can name the validation failure to the caller.
 */
export class StoryboardSchemaValidationError extends Error {
  constructor(errors) {
    const list = Array.isArray(errors) ? errors : [String(errors)];
    super(`AgenticOs_Document failed ${AGENTIC_OS_COMPUTING_FLOW_SCHEMA} validation: ${list.join("; ")}`);
    this.name = "StoryboardSchemaValidationError";
    this.code = "invalid_agenticOs_document";
    this.errors = list;
  }
}

/**
 * Clamp a requested `shotCount` into the accepted `[1, 500]` window (R7.2). An
 * omitted value defaults to STORYBOARD_DEFAULT_SHOT_COUNT; a non-finite value is
 * rejected upstream by `validateStoryboardInput`.
 */
export function clampShotCount(value) {
  if (value === undefined || value === null) return STORYBOARD_DEFAULT_SHOT_COUNT;
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return STORYBOARD_DEFAULT_SHOT_COUNT;
  return Math.max(STORYBOARD_MIN_SHOTS, Math.min(STORYBOARD_MAX_SHOTS, number));
}

/**
 * Extract the set of Source_Card ids present in an Evidence_Pack (the seam the
 * 3.8 referential-integrity gate validates against). Returns an ordered, unique
 * list of non-empty `sourceId`s; an empty list when the pack has no sources.
 */
export function collectEvidenceSourceIds(evidencePack) {
  const sources = Array.isArray(evidencePack?.sources) ? evidencePack.sources : [];
  const seen = new Set();
  const ids = [];
  for (const source of sources) {
    const id = cleanString(source?.sourceId);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Enforce the Storyboard_Harness input contract
 * `{ brief, evidencePack, shotCount? }`. Returns the normalized accepted values
 * `{ brief, evidencePack, sourceIds, sourceCount, shotCount }`. Throws a typed
 * `StoryboardHarnessInputError` naming the bad field otherwise.
 *
 * R7.1 runs "with an approved brief": `brief` is required, a non-empty string
 * of at most STORYBOARD_BRIEF_MAX_LENGTH characters. `evidencePack` is required
 * and must be an object exposing a `sources[]` array (the Research_Harness
 * Evidence_Pack shape). `shotCount` is optional; when provided it must be a
 * finite number (it is then clamped into [1,500]).
 */
export function validateStoryboardInput(args = {}) {
  const input = args && typeof args === "object" ? args : {};

  // brief: required, non-empty, <= 5000 chars (matches STORYBOARD_INPUT_SCHEMA).
  if (typeof input.brief !== "string" || input.brief.trim().length === 0) {
    throw new StoryboardHarnessInputError("brief", "brief is required and must be a non-empty string");
  }
  if (input.brief.length > STORYBOARD_BRIEF_MAX_LENGTH) {
    throw new StoryboardHarnessInputError(
      "brief",
      `brief must be at most ${STORYBOARD_BRIEF_MAX_LENGTH} characters`,
    );
  }
  const brief = input.brief.trim();

  // evidencePack: required object exposing a sources[] array.
  if (!input.evidencePack || typeof input.evidencePack !== "object" || Array.isArray(input.evidencePack)) {
    throw new StoryboardHarnessInputError(
      "evidencePack",
      "evidencePack is required and must be an Evidence_Pack object",
    );
  }
  if (!Array.isArray(input.evidencePack.sources)) {
    throw new StoryboardHarnessInputError(
      "evidencePack",
      "evidencePack.sources must be an array of Source_Cards",
    );
  }
  const evidencePack = input.evidencePack;
  const sourceIds = collectEvidenceSourceIds(evidencePack);
  const sourceCount = evidencePack.sources.length;

  // shotCount: optional. When provided it must be numeric; it is then CLAMPED
  // into [1, 500] (the contract's planned-shot window).
  if (input.shotCount !== undefined && input.shotCount !== null) {
    const candidate = Number(input.shotCount);
    if (!Number.isFinite(candidate)) {
      throw new StoryboardHarnessInputError("shotCount", "shotCount must be a number when provided");
    }
  }
  const shotCount = clampShotCount(input.shotCount);
  const scriptContext = input.scriptContext && typeof input.scriptContext === "object" && !Array.isArray(input.scriptContext)
    ? input.scriptContext
    : null;
  const storyboardProfile = input.storyboardProfile && typeof input.storyboardProfile === "object" && !Array.isArray(input.storyboardProfile) ? input.storyboardProfile : null;

  return { brief, evidencePack, sourceIds, sourceCount, shotCount, scriptContext, storyboardProfile };
}

/**
 * Build a deterministic, network-free BytePlus chat client. This is the DEFAULT
 * reasoning seam: it composes stable, evidence-grounded shot prompts with zero
 * model spend. The live BytePlus chat model routed through the Cloudflare AI
 * Gateway is exercised in integration task 9.2 and injected via
 * `deps.chatClient`.
 *
 * The returned client exposes
 * `plan({ brief, sourceIds, shotCount }) -> { shots: [{ prompt, sourceCardIds }] }`
 * with exactly `shotCount` entries. Each shot references one Evidence_Pack
 * `sourceId` (round-robin) when any are available, keeping the referential seam
 * (task 3.8) clean by construction.
 */
export function createDeterministicStoryboardClient() {
  return {
    isDeterministicMock: true,
    plan({ brief, sourceIds, shotCount }) {
      const ids = Array.isArray(sourceIds) ? sourceIds : [];
      const topic = cleanString(brief, "Create a video remix");
      const total = clampShotCount(shotCount);
      const shots = [];
      for (let index = 0; index < total; index += 1) {
        const sceneNumber = index + 1;
        const sourceCardIds = ids.length ? [ids[index % ids.length]] : [];
        shots.push({
          prompt: `${topic} - scene ${sceneNumber}`,
          sourceCardIds,
        });
      }
      return { shots };
    },
  };
}

/**
 * Validate a AgenticOs_Document against the `agentic-os-computing-flow/v1` schema (the
 * production-side half of Property 12). Returns `{ valid, errors[] }`. A valid
 * document MUST:
 *   * declare the `agentic-os-computing-flow/v1` schema in its canvas markdown
 *     frontmatter (`kgSchema: "agentic-os-computing-flow/v1"`),
 *   * carry a `flow.nodes[]` array that is NON-EMPTY (R7.1), where every node is
 *     an object with non-empty string `id`/`label`/`type`/`status` and all node
 *     ids are unique, and
 *   * carry a `flow.edges[]` array where every edge is an object with `source`
 *     and `target` that both resolve to a node id in the document.
 *
 * Exported so spec task 3.6 can reuse it as the reject-on-invalid-schema gate
 * (emit no nodes when this returns `valid:false`).
 */
export function validateAgenticOsComputingFlowV1(doc) {
  const errors = [];
  if (!doc || typeof doc !== "object") {
    return { valid: false, errors: ["document must be an object"] };
  }

  const markdown = doc.canvasDocumentMarkdown;
  if (typeof markdown !== "string" || markdown.trim().length === 0) {
    errors.push("canvasDocumentMarkdown must be a non-empty string");
  } else if (!markdown.includes(`kgSchema: "${AGENTIC_OS_COMPUTING_FLOW_SCHEMA}"`)) {
    errors.push(`canvasDocumentMarkdown must declare kgSchema: "${AGENTIC_OS_COMPUTING_FLOW_SCHEMA}"`);
  }

  const flow = doc.flow;
  if (!flow || typeof flow !== "object") {
    errors.push("flow must be an object with nodes[] and edges[]");
    return { valid: false, errors };
  }

  const nodes = flow.nodes;
  const nodeIds = new Set();
  if (!Array.isArray(nodes) || nodes.length === 0) {
    errors.push("flow.nodes must be a non-empty array");
  } else {
    nodes.forEach((node, index) => {
      if (!node || typeof node !== "object") {
        errors.push(`flow.nodes[${index}] must be an object`);
        return;
      }
      for (const field of ["id", "label", "type", "status"]) {
        if (typeof node[field] !== "string" || node[field].trim().length === 0) {
          errors.push(`flow.nodes[${index}].${field} must be a non-empty string`);
        }
      }
      const id = cleanString(node.id);
      if (id) {
        if (nodeIds.has(id)) errors.push(`flow.nodes[${index}].id "${id}" is not unique`);
        nodeIds.add(id);
      }
    });
  }

  const edges = flow.edges;
  if (!Array.isArray(edges)) {
    errors.push("flow.edges must be an array");
  } else {
    edges.forEach((edge, index) => {
      if (!edge || typeof edge !== "object") {
        errors.push(`flow.edges[${index}] must be an object`);
        return;
      }
      for (const field of ["source", "target"]) {
        const ref = cleanString(edge[field]);
        if (!ref) {
          errors.push(`flow.edges[${index}].${field} must be a non-empty string`);
        } else if (!nodeIds.has(ref)) {
          errors.push(`flow.edges[${index}].${field} "${ref}" does not resolve to a node id`);
        }
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Emission gate for the Storyboard_Harness (spec task 3.6 — R7.2 / R7.4 /
 * Property 12). Given a built AgenticOs_Document `{ canvasDocumentMarkdown, flow }`
 * and the planned shot count N, this gate enforces BOTH guarantees before the
 * document is allowed onto the canvas:
 *
 *   * R7.2 — exactly one `flow.nodes[]` entry per planned shot, so the node
 *     count equals N (with N already clamped/validated into [1,500] upstream).
 *   * R7.4 — the document validates against `agentic-os-computing-flow/v1`.
 *
 * On success returns `{ ok:true, schemaValid:true, schemaErrors:[],
 * canvasDocumentMarkdown, flow }` (the document is emitted as-is).
 *
 * On ANY failed check returns `{ ok:false, schemaValid:false, schemaErrors[],
 * validationError, canvasDocumentMarkdown:null, flow:{ nodes:[], edges:[] } }`:
 * the harness REJECTS the document, surfaces a `validationError` naming the
 * failure, and emits NO `flow.nodes[]` — it does not surface a partial/invalid
 * canvas. The reasoning-failure single-node FALLBACK is a different path
 * (task 3.7 / R7.5) and is NOT taken here.
 *
 * Reuses the exported `validateAgenticOsComputingFlowV1` gate (reuse-not-rebuild).
 *
 * @param {object} doc - `{ canvasDocumentMarkdown, flow }`.
 * @param {number} [expectedShotCount] - planned shot count N; when a finite
 *   number, the node count MUST equal it (R7.2).
 */
export function emitValidatedStoryboard(doc, expectedShotCount) {
  const canvasDocumentMarkdown = doc?.canvasDocumentMarkdown;
  const flow = doc?.flow;
  const nodeCount = Array.isArray(flow?.nodes) ? flow.nodes.length : 0;

  const errors = [];

  // R7.2: exactly one node per planned shot (count == N).
  if (Number.isFinite(expectedShotCount) && nodeCount !== expectedShotCount) {
    errors.push(
      `flow.nodes count ${nodeCount} does not equal planned shot count ${expectedShotCount}`,
    );
  }

  // R7.4: validate against agentic-os-computing-flow/v1.
  const validation = validateAgenticOsComputingFlowV1({ canvasDocumentMarkdown, flow });
  if (!validation.valid) errors.push(...validation.errors);

  if (errors.length > 0) {
    return {
      ok: false,
      schemaValid: false,
      schemaErrors: errors,
      validationError: new StoryboardSchemaValidationError(errors).message,
      // Emit NO flow.nodes[] and surface no partial/invalid canvas (R7.4).
      canvasDocumentMarkdown: null,
      flow: { nodes: [], edges: [] },
    };
  }

  return {
    ok: true,
    schemaValid: true,
    schemaErrors: [],
    validationError: null,
    canvasDocumentMarkdown,
    flow,
  };
}

/**
 * Build the R7.5 reasoning-failure FALLBACK result (spec task 3.7 / Property 14).
 * Invoked when the injected chat client THROWS or its result SIGNALS failure.
 * Emits a single-node AgenticOs_Document that (a) validates via the SAME
 * `emitValidatedStoryboard` gate and (b) satisfies the round-trip property
 * (R7.3) via `flowRoundTripEquivalent`, with `fallbackSubstituted:true`. Built
 * from the same builders as the success path (valid + round-trips by
 * construction; the gate + round-trip check are belt-and-braces).
 *
 * @returns the Storyboard_Harness result object (status `fallback`).
 */
function buildStoryboardFallbackResult({ brief, sourceIds, sourceCount, runId, referenceUrl, paidProviderCalls, reason }) {
  const { canvasDocumentMarkdown, flow, plannedShots } = buildFallbackStoryboardDocument({
    brief,
    sourceIds,
    sourceCount,
    runId,
    referenceUrl,
  });

  // Re-use the schema/count gate (exactly one node, R7.5). The fallback is valid
  // by construction; if the gate ever rejected it that is a genuine defect, so
  // surface it as a schema validation error rather than silently emitting.
  const emission = emitValidatedStoryboard({ canvasDocumentMarkdown, flow }, FALLBACK_SHOT_COUNT);
  if (!emission.ok) {
    throw new StoryboardSchemaValidationError(emission.schemaErrors);
  }

  return {
    status: STORYBOARD_STATUS_FALLBACK,
    gateId: STORYBOARD_GATE_ID,
    paidProviderCalls,
    schema: AGENTIC_OS_COMPUTING_FLOW_SCHEMA,
    // Exactly one node emitted on the fallback path (R7.5).
    shotCount: emission.flow.nodes.length,
    plannedShotCount: FALLBACK_SHOT_COUNT,
    sourceReferences: sourceIds,
    // Observable indication that fallback content was substituted (R7.5).
    fallbackSubstituted: true,
    fallbackReason: reason,
    // The single-node flow round-trips (R7.3 clause of Property 14).
    roundTripOk: flowRoundTripEquivalent(emission.flow),
    schemaValid: emission.schemaValid,
    schemaErrors: emission.schemaErrors,
    validationError: emission.validationError,
    canvasDocumentMarkdown: emission.canvasDocumentMarkdown,
    flow: emission.flow,
    plannedShots,
  };
}

/**
 * Run the Storyboard_Harness over an injectable BytePlus chat client seam.
 *
 * Contract (R7.1 / Property 12 production side):
 *   input  : { brief, evidencePack, shotCount? }
 *   output : { status, gateId, paidProviderCalls, schema, shotCount,
 *              sourceReferences[], fallbackSubstituted, schemaValid,
 *              canvasDocumentMarkdown, flow: { nodes[], edges[] }, plannedShots }
 *
 * The emitted AgenticOs_Document (`{ canvasDocumentMarkdown, flow }`) validates
 * against `agentic-os-computing-flow/v1` and carries a NON-EMPTY `flow.nodes[]`. The
 * default client is deterministic and network-free (zero paid-provider calls).
 * Async so an injected live client may return a promise. Distinct terminal
 * statuses: `complete` (3.5), `rejected` (3.6 schema), `fallback` (3.7), and
 * `unresolved_source` (3.8 referential integrity) — see file header.
 *
 * @param {object} input  - the Storyboard_Harness input contract.
 * @param {object} [deps] - injectable seams.
 * @param {object} [deps.chatClient] - `{ plan({brief,sourceIds,shotCount}) }`.
 * @param {string} [deps.runId]      - run id stamped into the canvas markdown.
 * @param {string} [deps.referenceUrl] - reference url stamped into the markdown.
 * @param {number} [deps.paidProviderCalls] - paid-call count for a live client.
 */
export async function runStoryboardHarness(input, deps = {}) {
  const { brief, evidencePack, sourceIds, sourceCount, shotCount, scriptContext, storyboardProfile } = validateStoryboardInput(input);

  let degradedMode = null;
  const chatClient = wrapChatClientWithTokenCeiling(
    deps.chatClient || createDeterministicStoryboardClient(),
    {
      ceiling: deps.tokenBudgetCeiling ?? DEFAULT_TOKEN_BUDGET_CEILING,
      onDegrade: (event) => {
        degradedMode = {
          degraded: true,
          reason: "token_budget_ceiling",
          plannedShotCountAtDegradation: event.plannedShotCountAtDegradation,
        };
        if (typeof deps.onDegrade === "function") deps.onDegrade(degradedMode);
      },
    },
  );
  const usedDeterministicClient = Boolean(chatClient.isDeterministicMock);
  // The local runtime makes no live calls, so the deterministic default path
  // records zero paid-provider calls. A caller wiring a live client accounts
  // spend through the Cost_Log / Budget_Meters seams at the Director.
  const paidProviderCalls = usedDeterministicClient ? 0 : Number(deps.paidProviderCalls) || 0;

  const runId = cleanString(deps.runId, "video-remix-run");
  const referenceUrl = cleanString(deps.referenceUrl);

  // Reasoning seam (BytePlus chat via AI Gateway, injectable; may return a
  // promise). Reasoning FAILURE is the R7.5 fallback trigger: the client THROWS
  // or its result SIGNALS failure (`reasoningFailed`/`failed`) -> single-node
  // fallback AgenticOs_Document below (task 3.7).
  let reasoning;
  let reasoningFailure = null;
  try {
    reasoning = await chatClient.plan({ brief, sourceIds, shotCount, scriptContext, storyboardProfile });
    if (reasoningSignaledFailure(reasoning)) reasoningFailure = reasoning;
  } catch (error) {
    reasoningFailure = error;
  }

  if (reasoningFailure) {
    return buildStoryboardFallbackResult({
      brief,
      sourceIds,
      sourceCount,
      runId,
      referenceUrl,
      paidProviderCalls,
      reason: fallbackReasonFrom(reasoningFailure),
    });
  }

  const ideas = Array.isArray(reasoning?.shots) ? reasoning.shots : [];

  // Canonical shot plan (reuse-not-rebuild): `buildShotPlan` yields exactly
  // `shotCount` shots, each enriched with the chat-derived prompt + the
  // Evidence_Pack `sourceCardIds` (the claims the 3.8 gate below verifies).
  const baseShots = buildShotPlan({ brief, sourceCount, shotCount });
  let plannedShots = baseShots.map((shot, index) => {
    const idea = ideas[index] || {};
    const sourceCardIds = Array.isArray(idea.sourceCardIds) ? idea.sourceCardIds : [];
    return {
      ...shot,
      prompt: cleanString(idea.prompt, shot.prompt),
      sourceCardIds,
      actId: cleanString(idea.actId),
      sceneId: cleanString(idea.sceneId),
      objective: cleanString(idea.objective),
      characterIds: Array.isArray(idea.characterIds) ? idea.characterIds : [],
      characterStates: idea.characterStates && typeof idea.characterStates === "object" ? idea.characterStates : {},
      environmentState: idea.environmentState && typeof idea.environmentState === "object" ? idea.environmentState : {},
      dependencyShotIds: Array.isArray(idea.dependencyShotIds) ? idea.dependencyShotIds : [],
      transitionReason: cleanString(idea.transitionReason),
      scriptSegmentIds: Array.isArray(idea.scriptSegmentIds) ? idea.scriptSegmentIds : [],
      scriptUnitIds: Array.isArray(idea.scriptUnitIds) ? idea.scriptUnitIds : [],
      dialogueUnitIds: Array.isArray(idea.dialogueUnitIds) ? idea.dialogueUnitIds : [],
      dramaticPurpose: cleanString(idea.dramaticPurpose),
      dramaticIntensity: Number(idea.dramaticIntensity),
      cinematography: idea.cinematography && typeof idea.cinematography === "object" ? idea.cinematography : {},
      actionBeatId: cleanString(idea.actionBeatId),
      cameraId: cleanString(idea.cameraId),
      spatialBlocking: idea.spatialBlocking && typeof idea.spatialBlocking === "object" ? idea.spatialBlocking : {},
    };
  });

  // Emit the AgenticOs_Document: canvas markdown (`buildStoryboardMarkdown`) + the
  // structured graph (`buildStoryboardFlow`), both from the SAME shot plan.
  const canvasDocumentMarkdown = buildStoryboardMarkdown({ runId, referenceUrl, brief, shots: plannedShots });
  let flow = buildStoryboardFlow(plannedShots);

  // Optional pre-emit transform seam: a live reasoning client may post-process
  // the raw graph and/or the claims before they are gated. Identity by default,
  // so the deterministic path is unchanged. Exposed so the R7.4 schema reject
  // AND the R6.6 unresolved-source reject are exercisable end-to-end.
  if (typeof deps.beforeEmit === "function") {
    const transformed = deps.beforeEmit({ canvasDocumentMarkdown, flow, plannedShots });
    if (transformed && typeof transformed === "object") {
      if (transformed.flow) flow = transformed.flow;
      if (Array.isArray(transformed.plannedShots)) plannedShots = transformed.plannedShots;
    }
  }

  // Source referential-integrity gate (task 3.8 — R6.3 / R6.6 / Property 10):
  // every claim's referenced `sourceId` MUST resolve to an in-pack Source_Card
  // (`sourceIds` is the `collectEvidenceSourceIds` seam). An out-of-pack claim
  // is REJECTED (status `unresolved_source`, no nodes; result assembled in
  // `storyboard-references.js`). No-op on the deterministic success path.
  const referential = checkSourceReferentialIntegrity(plannedShots, sourceIds);
  if (!referential.ok) {
    return buildUnresolvedSourceResult({
      referential,
      gateId: STORYBOARD_GATE_ID,
      schema: AGENTIC_OS_COMPUTING_FLOW_SCHEMA,
      paidProviderCalls,
      plannedShotCount: shotCount,
      sourceReferences: sourceIds,
      plannedShots,
    });
  }

  // Validation + count gate (task 3.6 — R7.2 / R7.4 / Property 12): exactly N
  // nodes for N planned shots AND `agentic-os-computing-flow/v1` validity. On failure
  // the harness REJECTS with a validation error and emits NO `flow.nodes[]`.
  const emission = emitValidatedStoryboard({ canvasDocumentMarkdown, flow }, shotCount);

  if (!emission.ok) {
    return {
      status: STORYBOARD_STATUS_REJECTED,
      gateId: STORYBOARD_GATE_ID,
      paidProviderCalls,
      schema: AGENTIC_OS_COMPUTING_FLOW_SCHEMA,
      // No nodes emitted (R7.4).
      shotCount: 0,
      plannedShotCount: shotCount,
      sourceReferences: sourceIds,
      // Reasoning-failure fallback is task 3.7; never substituted here.
      fallbackSubstituted: false,
      schemaValid: false,
      schemaErrors: emission.schemaErrors,
      validationError: emission.validationError,
      // Surface no partial/invalid canvas; emit empty nodes/edges.
      canvasDocumentMarkdown: emission.canvasDocumentMarkdown,
      flow: emission.flow,
      plannedShots,
    };
  }

  return {
    status: STORYBOARD_STATUS_COMPLETE,
    gateId: STORYBOARD_GATE_ID,
    paidProviderCalls,
    schema: AGENTIC_OS_COMPUTING_FLOW_SCHEMA,
    shotCount: plannedShots.length,
    // Source ids referenced by the claims; all verified in-pack by the 3.8 gate.
    sourceReferences: sourceIds,
    narrativeCoherence: checkNarrativeCoherence(plannedShots),
    degradedMode,
    // Reasoning-failure fallback is task 3.7; never substituted here.
    fallbackSubstituted: false,
    schemaValid: emission.schemaValid,
    schemaErrors: emission.schemaErrors,
    validationError: emission.validationError,
    canvasDocumentMarkdown: emission.canvasDocumentMarkdown,
    flow: emission.flow,
    plannedShots,
    creativePlan: reasoning?.creativePlan ?? null,
  };
}
