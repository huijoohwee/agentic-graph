// Kgc_Document shot-plan display view-model for the agentic-graph Cloudflare Pages
// Frontend.
//
// Spec: agentic-graph-acos-mcp-connector, task 7.5 (R1.5; design Correctness
// Property 32; design Frontend `renderManifest`).
//
// R1.5: "WHEN the Storyboard_Harness produces a Kgc_Document, THE Frontend SHALL
// render the shot-plan with EXACTLY ONE visual node per planned shot defined in
// the Kgc_Document." This module is the PURE, framework-agnostic,
// ZERO-network/ZERO-browser view-model builder that turns a Kgc_Document (or the
// Storyboard_Harness envelope that wraps one) into a render-ready shot-plan:
//
//   { nodes: [...], shotCount, edges: [...], ... }
//
// with EXACTLY ONE rendered visual node per planned shot — the count of rendered
// nodes equals the count of `flow.nodes[]` entries in the Kgc_Document — in flow
// order, with NO dropping and NO de-duplication (the Storyboard_Harness already
// enforces one-node-per-shot + node-id uniqueness in spec tasks 3.5/3.6 / R7.2;
// the Frontend must not silently collapse or reorder entries). Edges are
// surfaced so the canvas can draw shot-to-shot connections.
//
// SCHEMA REUSE (do NOT fork): the `kgc-computing-flow/v1` flow shape MIRRORS the
// Storyboard_Harness output in `mcp/video-remix/storyboard-harness.js`
// (`{ canvasDocumentMarkdown, flow:{ nodes[], edges[] } }`) and the per-node /
// per-edge fields produced by `mcp/video-remix/storyboard.js`
// `buildStoryboardFlow` (node `{ id, label, type, status }`, edge
// `{ id, source, target }`). The view reads these fields rather than
// re-deriving a different schema.
//
// STACK BOUNDARY (R11): the product tier holds no model provider keys; this
// builder reads only Kgc_Document data and performs no I/O.

// --- Helpers ----------------------------------------------------------------

/**
 * Resolve the `kgc-computing-flow/v1` flow `{ nodes[], edges[] }` from any of the
 * Kgc_Document carriers the Frontend may receive:
 *   - a raw Kgc_Document with a top-level `flow` (`{ flow:{nodes,edges}, ... }`)
 *   - the Storyboard_Harness result envelope (also exposes a top-level `flow`)
 *   - a Kgc_Document nested under `kgcDocument` / `document` / `canvasDocument`
 * Tolerates malformed/missing input by returning `null`.
 *
 * @param {unknown} input Kgc_Document or Storyboard_Harness envelope
 * @returns {{ nodes?: unknown, edges?: unknown }|null}
 */
export function resolveKgcFlow(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  // Common nesting carriers: unwrap one level when present.
  for (const key of ["kgcDocument", "document", "canvasDocument"]) {
    const nested = input[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const resolved = resolveKgcFlow(nested);
      if (resolved) return resolved;
    }
  }

  const flow = input.flow;
  if (flow && typeof flow === "object" && !Array.isArray(flow)) return flow;
  return null;
}

/**
 * Trim a value to a non-empty string, falling back to `fallback` (default "").
 * Mirrors the defensive `cleanString` posture used across the worker tier
 * without importing it (the product tier keeps this module self-contained).
 *
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string}
 */
function toText(value, fallback = "") {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return fallback;
}

/**
 * Build a single display entry for a flow node, carrying its `id` plus the
 * human-readable display fields. A blank/missing `id` falls back to a stable
 * positional id so EVERY planned shot still renders as a distinct visual node
 * (R1.5 — no dropping). `order` preserves the node's position in the flow.
 *
 * @param {unknown} node
 * @param {number} index position in the flow (0-based)
 * @returns {object}
 */
function buildNodeEntry(node, index) {
  const safeNode = node && typeof node === "object" && !Array.isArray(node) ? node : {};
  const id = toText(safeNode.id, `shot-${index + 1}`);
  return {
    id,
    order: index,
    label: toText(safeNode.label, `Shot ${index + 1}`),
    type: toText(safeNode.type, "video-remix-shot"),
    status: toText(safeNode.status),
  };
}

/**
 * Build a single display entry for a flow edge, carrying its `id`, `source`, and
 * `target`. `connected` records whether both endpoints resolve to rendered node
 * ids so the canvas can decide whether to draw the connection. A blank/missing
 * edge `id` falls back to a stable positional id.
 *
 * @param {unknown} edge
 * @param {number} index position in the flow (0-based)
 * @param {Set<string>} nodeIds rendered node ids
 * @returns {object}
 */
function buildEdgeEntry(edge, index, nodeIds) {
  const safeEdge = edge && typeof edge === "object" && !Array.isArray(edge) ? edge : {};
  const source = toText(safeEdge.source);
  const target = toText(safeEdge.target);
  return {
    id: toText(safeEdge.id, `edge-${index + 1}`),
    order: index,
    source,
    target,
    connected: Boolean(source) && Boolean(target) && nodeIds.has(source) && nodeIds.has(target),
  };
}

// --- Public API -------------------------------------------------------------

/**
 * Build the Kgc_Document shot-plan display view-model from a Kgc_Document (or
 * the Storyboard_Harness envelope that wraps one).
 *
 * The result renders EXACTLY ONE visual node per planned shot defined in the
 * Kgc_Document — `nodes.length === shotCount === flow.nodes[].length` — in flow
 * order, preserving node ids, with NO dropping and NO de-duplication (R1.5 /
 * Property 32). This holds for an N-shot plan (N nodes -> N rendered nodes) AND
 * for the single-node fallback document (R7.5 -> exactly 1 rendered node).
 * Edges are surfaced for connection rendering. A malformed/empty document
 * renders gracefully with an empty `nodes` list, `shotCount` 0, and `hasNodes`
 * false.
 *
 * Pure and deterministic: performs no I/O, never mutates the input, and never
 * throws for malformed input.
 *
 * @param {unknown} kgcDocument Kgc_Document or Storyboard_Harness envelope
 * @returns {{
 *   nodes: Array<{ id: string, order: number, label: string, type: string, status: string }>,
 *   shotCount: number,
 *   edges: Array<{ id: string, order: number, source: string, target: string, connected: boolean }>,
 *   edgeCount: number,
 *   hasNodes: boolean,
 *   schema: string,
 *   fallbackSubstituted: boolean,
 *   status: string|null,
 * }}
 */
export function buildShotPlanView(kgcDocument) {
  const flow = resolveKgcFlow(kgcDocument) || {};
  const envelope =
    kgcDocument && typeof kgcDocument === "object" && !Array.isArray(kgcDocument) ? kgcDocument : {};

  const rawNodes = Array.isArray(flow.nodes) ? flow.nodes : [];
  const rawEdges = Array.isArray(flow.edges) ? flow.edges : [];

  // One visual node per planned shot, in flow order — every flow node renders
  // (R1.5): no dropping, no dedup, no reordering. The rendered node count
  // equals the count of planned shots in the Kgc_Document.
  const nodes = rawNodes.map((node, index) => buildNodeEntry(node, index));

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = rawEdges.map((edge, index) => buildEdgeEntry(edge, index, nodeIds));

  // Schema / status / fallback flags come from the Storyboard_Harness envelope
  // when the caller passes one; a raw Kgc_Document carries neither, so they
  // default sensibly.
  const schema = toText(envelope.schema, "kgc-computing-flow/v1");
  const status = typeof envelope.status === "string" ? envelope.status : null;
  const fallbackSubstituted = envelope.fallbackSubstituted === true;

  return {
    nodes,
    shotCount: nodes.length,
    edges,
    edgeCount: edges.length,
    hasNodes: nodes.length > 0,
    schema,
    fallbackSubstituted,
    status,
  };
}
