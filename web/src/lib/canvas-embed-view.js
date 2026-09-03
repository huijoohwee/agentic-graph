// Embedded agentic-graph canvas view-model for the agentic-graph Cloudflare Pages frontend.
//
// Capability: "agentic-graph canvas (Cloudflare) calls agentic-graph MCP for the
// canvas." When the Storyboard_Harness produces a AgenticOs_Document, the product tier
// EMBEDS the live agentic-graph canvas doc-view (scoped to the run) rather than
// reimplementing the renderer — agentic-graph owns the canvas engine, the product is
// the OS shell around it.
//
// This is the PURE, framework-agnostic, ZERO-network/ZERO-browser view-model
// builder that turns a Run_Manifest + the configured control-plane canvas base
// URL into a render-ready embed descriptor:
//
//   { available, src, runId, sandbox, referrerPolicy, title, reason }
//
// SCHEME MIRROR (do NOT fork): the doc-view URL scheme + embed security
// attributes MIRROR the control-plane SSOT in
// `mcp/video-remix/canvas-embed.js` (`/doc-view?run=<runId>[&doc=<docId>]`,
// `CANVAS_EMBED_SANDBOX`, `CANVAS_EMBED_REFERRER_POLICY`). The product tier keeps
// this module self-contained (no cross-tier import) exactly like
// `shot-plan-view.js` mirrors the flow shape.
//
// STACK BOUNDARY (R11/R15.7): reads only manifest data + a PUBLIC canvas base
// URL; holds no model key, no auth secret; performs no I/O. The embed is
// cross-origin (Vercel frames `airvio.co/agentic-graph`), so the doc-view route must
// allow `frame-ancestors` of the Vercel origin AND scope the run to the entitled
// caller (same check as `GET /runs/{id}`) — the embed never authorizes spend.

// --- Contract constants (mirror mcp/video-remix/canvas-embed.js) ------------

export const CANVAS_DOC_VIEW_PATH = "/doc-view";
export const CANVAS_RUN_PARAM = "run";
export const CANVAS_DOC_PARAM = "doc";
export const CANVAS_EMBED_SANDBOX = "allow-scripts allow-same-origin";
export const CANVAS_EMBED_REFERRER_POLICY = "no-referrer";

/** Storyboard stage statuses at which a canvas is ready to embed (R7.5 fallback included). */
const STORYBOARD_READY_STATUSES = Object.freeze(["complete", "completed", "fallback"]);

// --- Helpers ----------------------------------------------------------------

function toText(value, fallback = "") {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return fallback;
}

/** Resolve the underlying manifest from a raw manifest or a nested envelope. */
function resolveManifest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  for (const key of ["runManifest", "manifest"]) {
    const nested = input[key];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) return nested;
  }
  return input;
}

function resolveStoryboardStage(manifest) {
  const stages = Array.isArray(manifest.stages) ? manifest.stages : [];
  for (const stage of stages) {
    if (stage && typeof stage === "object" && stage.id === "storyboard") return stage;
  }
  return null;
}

/** Count storyboard shot nodes from any AgenticOs_Document carrier on the manifest. */
function storyboardNodeCount(manifest) {
  const stage = resolveStoryboardStage(manifest);
  const carriers = [manifest.agenticOsDocument, manifest.storyboard, stage && stage.artifact];
  for (const carrier of carriers) {
    const flow = carrier && typeof carrier === "object" ? carrier.flow : null;
    if (flow && Array.isArray(flow.nodes) && flow.nodes.length > 0) return flow.nodes.length;
  }
  return 0;
}

/** True iff the storyboard produced a canvas ready to embed. */
function storyboardCanvasAvailable(manifest) {
  const stage = resolveStoryboardStage(manifest);
  const statusReady =
    stage && typeof stage.status === "string" && STORYBOARD_READY_STATUSES.includes(stage.status);
  return Boolean(statusReady) || storyboardNodeCount(manifest) > 0;
}

/** Best-effort storyboard AgenticOs_Document graph id (pins the embedded doc). */
function resolveDocId(manifest) {
  const stage = resolveStoryboardStage(manifest);
  const carriers = [manifest.agenticOsDocument, manifest.storyboard, stage && stage.artifact];
  for (const carrier of carriers) {
    if (carrier && typeof carrier === "object") {
      const id = toText(carrier.graphId || carrier.docId || carrier.id);
      if (id) return id;
    }
  }
  return "";
}

function normalizeBaseUrl(baseUrl) {
  const base = toText(baseUrl);
  return base ? base.replace(/\/+$/, "") : "";
}

/**
 * Build the run-scoped canvas doc-view embed URL. Returns "" when no base url or
 * no runId is available (an embed URL is meaningful only for a real run).
 *
 * @param {{ baseUrl?: string, runId: string, docId?: string }} args
 * @returns {string}
 */
export function resolveCanvasDocViewUrl({ baseUrl, runId, docId } = {}) {
  const base = normalizeBaseUrl(baseUrl);
  const run = toText(runId);
  if (!base || !run) return "";
  const params = new URLSearchParams();
  params.set(CANVAS_RUN_PARAM, run);
  const doc = toText(docId);
  if (doc) params.set(CANVAS_DOC_PARAM, doc);
  return `${base}${CANVAS_DOC_VIEW_PATH}?${params.toString()}`;
}

// --- Public API -------------------------------------------------------------

/**
 * Build the embedded-canvas view-model from a Run_Manifest and the configured
 * control-plane canvas base URL.
 *
 * `available` is true only when (a) a canvas base URL is configured, (b) the run
 * has an id, and (c) the storyboard produced a AgenticOs_Document (ready status or >=1
 * shot node). When available, `src` is the run-scoped doc-view URL and the embed
 * carries the cross-origin security attributes. When not available, `available`
 * is false with a human-readable `reason` and an empty `src` (the UI hides the
 * embed). Pure and deterministic; never throws for malformed input.
 *
 * @param {unknown} manifest Run_Manifest or manifest-bearing envelope
 * @param {object} [opts]
 * @param {string} [opts.canvasBaseUrl] control-plane canvas base (public URL)
 * @param {string} [opts.runId] explicit run id (falls back to manifest.runId)
 * @returns {{
 *   available: boolean,
 *   src: string,
 *   runId: string,
 *   docId: string,
 *   sandbox: string,
 *   referrerPolicy: string,
 *   title: string,
 *   reason: string,
 * }}
 */
export function buildCanvasEmbedView(manifest, opts = {}) {
  const resolved = resolveManifest(manifest);
  const runId = toText(opts.runId) || toText(resolved.runId);
  const baseUrl = normalizeBaseUrl(opts.canvasBaseUrl);

  const base = {
    available: false,
    src: "",
    runId,
    docId: "",
    sandbox: CANVAS_EMBED_SANDBOX,
    referrerPolicy: CANVAS_EMBED_REFERRER_POLICY,
    title: "agentic-graph canvas",
    reason: "",
  };

  if (!baseUrl) return { ...base, reason: "canvas base URL not configured" };
  if (!runId) return { ...base, reason: "run id not available" };
  if (!storyboardCanvasAvailable(resolved)) return { ...base, reason: "storyboard canvas not ready" };

  const docId = resolveDocId(resolved);
  const src = resolveCanvasDocViewUrl({ baseUrl, runId, docId });
  if (!src) return { ...base, reason: "canvas URL could not be resolved" };

  return {
    ...base,
    available: true,
    src,
    docId,
    title: `agentic-graph canvas — run ${runId}`,
  };
}
