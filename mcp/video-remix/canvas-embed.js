// Canvas embed SSOT for the video-remix connector (agentic-graph-acos-mcp-connector).
//
// Capability: "agentic-canvas-os (AWS + Vercel) calls agentic-graph MCP for the
// canvas." The Storyboard_Harness emits a Kgc_Document (`kgc-computing-flow/v1`,
// one node per planned shot); rather than reimplementing the renderer, the
// product tier EMBEDS the live agentic-graph canvas doc-view scoped to the run. This
// module is the single source of truth for:
//   * the canvas doc-view URL scheme (`/doc-view?run=<runId>[&doc=<docId>]`),
//   * the availability predicate (is a storyboard canvas ready to embed?),
//   * the cross-origin embed security attributes (sandbox / referrer policy),
//   * the Demo_Pack canvas-url derivation (kind `canvas`).
//
// PURE: no I/O, no timers, no model/provider calls (R11 — the product tier holds
// no keys; deriving an embed URL is keyless string work). Importable by both the
// Node tests and the Cloudflare Worker bundle. The product-tier web view mirrors
// this scheme in `web/src/lib/canvas-embed-view.js` (tier-independent, like
// `shot-plan-view.js` mirrors the flow shape) — keep the two in step.

import { cleanString } from "./helpers.js";

// The agentic-graph control-plane canvas doc-view route. The canvas is hosted under
// the Cloudflare control plane (`airvio.co/agentic-graph`); the doc-view route
// hydrates a single document by id/run. Centralized here so neither tier
// hardcodes the path inline (goal.md: centralize route policy).
export const CANVAS_DOC_VIEW_PATH = "/doc-view";

// Query parameter names carried by the embed URL. `run` scopes the embedded
// canvas to the authenticated run (the entitlement seam — see the embed note);
// `doc` optionally pins the storyboard Kgc_Document graph id.
export const CANVAS_RUN_PARAM = "run";
export const CANVAS_DOC_PARAM = "doc";

// Documented default control-plane canvas base (overridable per call / by env —
// like demo-pack.js `DEFAULT_FRONTEND_URL`). Never a route-specific hardcode in
// logic: callers pass a configured base; this is only the demo fallback.
export const DEFAULT_CONTROL_PLANE_CANVAS_BASE = "https://airvio.co/agentic-graph";

// Demo_Pack url kind for the embedded canvas (joins `frontend` / `agent-api` /
// `agent-api-health`). The canvas is a judge-facing artifact backing the
// Actions & Tool Use and Demo & Presentation dimensions.
export const CANVAS_URL_KIND = "canvas";

// Cross-origin embed security attributes (the Vercel product frames the
// `airvio.co/agentic-graph` doc-view). `sandbox` lets the canvas run its own scripts
// against its own origin but withholds top-navigation/popups/forms; the
// referrer is suppressed so the run scope is never leaked in a Referer header.
// The doc-view route itself must (a) allow `frame-ancestors` of the Vercel
// origin and (b) honor the same entitlement check as `GET /runs/{id}` so a
// session can only frame its own run's canvas (R15.4/R15.5 parity).
export const CANVAS_EMBED_SANDBOX = "allow-scripts allow-same-origin";
export const CANVAS_EMBED_REFERRER_POLICY = "no-referrer";
export const CANVAS_EMBED_ENTITLEMENT_NOTE =
  "doc-view must allow frame-ancestors of the Vercel origin and scope the run " +
  "to the entitled caller (same check as GET /runs/{id}).";

// The storyboard stage statuses at which a canvas is ready to embed. `complete`
// is the runtime terminal; `completed` is the design spelling; `fallback` is the
// R7.5 single-node document, which still renders one valid node.
const STORYBOARD_READY_STATUSES = Object.freeze(["complete", "completed", "fallback"]);

// Normalize a base url by trimming whitespace and stripping trailing slashes so
// the path join never doubles a `/`. Returns "" for a missing/blank base.
function normalizeBaseUrl(baseUrl) {
  const base = cleanString(baseUrl);
  return base ? base.replace(/\/+$/, "") : "";
}

/**
 * Build the agentic-graph canvas doc-view embed URL for a run.
 *
 * `${base}/doc-view?run=<runId>` with an optional `&doc=<docId>`. Returns "" when
 * there is no usable base url OR no runId — an embed URL is meaningful only for
 * a real, run-scoped canvas (so the Demo_Pack never lists a runless canvas url).
 *
 * @param {object} args
 * @param {string} [args.baseUrl] control-plane canvas base (default fallback)
 * @param {string} args.runId run id the embedded canvas is scoped to (required)
 * @param {string} [args.docId] optional storyboard Kgc_Document graph id
 * @returns {string}
 */
export function resolveCanvasDocViewUrl({ baseUrl, runId, docId } = {}) {
  const base = normalizeBaseUrl(baseUrl) || normalizeBaseUrl(DEFAULT_CONTROL_PLANE_CANVAS_BASE);
  const run = cleanString(runId);
  if (!base || !run) return "";
  const params = new URLSearchParams();
  params.set(CANVAS_RUN_PARAM, run);
  const doc = cleanString(docId);
  if (doc) params.set(CANVAS_DOC_PARAM, doc);
  return `${base}${CANVAS_DOC_VIEW_PATH}?${params.toString()}`;
}

/**
 * Resolve the storyboard stage record from a Run_Manifest, tolerating a
 * missing/sparse `stages[]`. Returns the stage object or null.
 *
 * @param {object} manifest
 * @returns {object|null}
 */
function resolveStoryboardStage(manifest) {
  const stages = manifest && Array.isArray(manifest.stages) ? manifest.stages : [];
  for (const stage of stages) {
    if (stage && typeof stage === "object" && stage.id === "storyboard") return stage;
  }
  return null;
}

/**
 * Count the planned shot nodes available on a manifest's storyboard, from either
 * a top-level `kgcDocument`/`storyboard` envelope or the storyboard stage
 * artifact. Mirrors the `kgc-computing-flow/v1` flow shape (one node per shot).
 *
 * @param {object} manifest
 * @returns {number}
 */
function storyboardNodeCount(manifest) {
  if (!manifest || typeof manifest !== "object") return 0;
  const carriers = [manifest.kgcDocument, manifest.storyboard, resolveStoryboardStage(manifest)?.artifact];
  for (const carrier of carriers) {
    const flow = carrier && typeof carrier === "object" ? carrier.flow : null;
    if (flow && Array.isArray(flow.nodes) && flow.nodes.length > 0) return flow.nodes.length;
  }
  return 0;
}

/**
 * True iff a storyboard canvas is ready to embed for this run: the storyboard
 * stage reached a ready status, OR a Kgc_Document with at least one shot node is
 * present on the manifest. A run still in research/awaiting-approval has no
 * canvas to frame yet, so this returns false (the embed stays hidden).
 *
 * @param {object} manifest Run_Manifest (or manifest-bearing object)
 * @returns {boolean}
 */
export function storyboardCanvasAvailable(manifest) {
  if (!manifest || typeof manifest !== "object") return false;
  const stage = resolveStoryboardStage(manifest);
  const statusReady =
    stage && typeof stage.status === "string" && STORYBOARD_READY_STATUSES.includes(stage.status);
  return Boolean(statusReady) || storyboardNodeCount(manifest) > 0;
}

/**
 * Derive the storyboard Kgc_Document graph id from a manifest when present, so
 * the embed can pin the exact document. Best-effort: returns "" when none.
 *
 * @param {object} manifest
 * @returns {string}
 */
export function resolveStoryboardDocId(manifest) {
  if (!manifest || typeof manifest !== "object") return "";
  const carriers = [manifest.kgcDocument, manifest.storyboard, resolveStoryboardStage(manifest)?.artifact];
  for (const carrier of carriers) {
    if (carrier && typeof carrier === "object") {
      const id = cleanString(carrier.graphId || carrier.docId || carrier.id);
      if (id) return id;
    }
  }
  return "";
}

/**
 * Build the run-scoped canvas embed URL from a Run_Manifest, returning "" when
 * no canvas is available yet (research/pre-storyboard) or no run id is present.
 * This is the seam the Demo_Pack (control plane) and the product view both use
 * to decide whether a canvas artifact exists.
 *
 * @param {object} args
 * @param {object} args.manifest Run_Manifest
 * @param {string} [args.baseUrl] control-plane canvas base
 * @param {string} [args.runId] explicit run id (falls back to manifest.runId)
 * @returns {string}
 */
export function buildCanvasUrlFromManifest({ manifest, baseUrl, runId } = {}) {
  if (!storyboardCanvasAvailable(manifest)) return "";
  const id = cleanString(runId) || cleanString(manifest && manifest.runId);
  if (!id) return "";
  return resolveCanvasDocViewUrl({ baseUrl, runId: id, docId: resolveStoryboardDocId(manifest) });
}
