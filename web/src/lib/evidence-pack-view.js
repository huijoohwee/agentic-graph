// Evidence_Pack display view-model for the agenticgraph Cloudflare Pages frontend.
//
// Spec: agenticgraph-acos-mcp-connector, task 7.4 (R1.4; design Correctness
// Property 32; design Frontend `renderManifest`).
//
// R1.4: "WHEN the Research_Harness produces an Evidence_Pack, THE Frontend SHALL
// display EVERY cited source contained in the Evidence_Pack to the end creator
// user." This module is the PURE, framework-agnostic, ZERO-network/ZERO-browser
// view-model builder that turns an Evidence_Pack (or the Research_Harness
// envelope that wraps one) into a render-ready list:
//
//   { sources: [...], count, citationCount, summary, status, degraded, ... }
//
// listing EVERY Source_Card contained in the pack — one display entry per
// cited source, in pack order, with NO dropping and NO de-duplication beyond
// the pack's own ids (the Research_Harness already enforces sourceId uniqueness
// in spec task 3.2 / R6.2; the Frontend must not silently collapse entries).
//
// SCHEMA REUSE (do NOT fork): the Evidence_Pack / Source_Card shape MIRRORS the
// Research_Harness output in `mcp/video-remix/research-harness.js`
// (`{ sources[], citations[], summary }`) and the per-card fields produced by
// `mcp/video-remix/evidence.js` `normalizeSourceCards`
// (`{ sourceId, url, platform, title, evidenceLevel, captureTime,
// observedFields }`). Citations mirror `{ sourceId, url }`. The view reads
// these fields rather than re-deriving a different schema.
//
// STACK BOUNDARY (R11): the product tier holds no model provider keys; this
// builder reads only Evidence_Pack data and performs no I/O.

// --- Helpers ----------------------------------------------------------------

/**
 * Resolve the Evidence_Pack `{ sources[], citations[], summary }` from either a
 * raw pack or the Research_Harness envelope `{ ..., evidencePack: {...} }`
 * (see `runResearchHarness` in `mcp/video-remix/research-harness.js`).
 * Tolerates malformed/missing input by returning `null`.
 *
 * @param {unknown} input Evidence_Pack or Research_Harness envelope
 * @returns {object|null}
 */
export function resolveEvidencePack(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  // Research_Harness envelope wraps the pack under `evidencePack`.
  if (input.evidencePack && typeof input.evidencePack === "object" && !Array.isArray(input.evidencePack)) {
    return input.evidencePack;
  }
  return input;
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
 * Index the pack's `citations[]` by `sourceId` so each Source_Card can surface
 * its citation URL. Tolerates a missing/non-array `citations` field. First
 * citation per sourceId wins (the harness emits one citation per source).
 *
 * @param {unknown} citations
 * @returns {Map<string, string>} sourceId -> citation url
 */
function indexCitations(citations) {
  const byId = new Map();
  const list = Array.isArray(citations) ? citations : [];
  for (const citation of list) {
    if (citation && typeof citation === "object" && typeof citation.sourceId === "string") {
      if (!byId.has(citation.sourceId)) {
        byId.set(citation.sourceId, toText(citation.url));
      }
    }
  }
  return byId;
}

/**
 * Build a single display entry for a Source_Card, carrying its `sourceId` plus
 * the human-readable display fields. A blank/missing `sourceId` falls back to a
 * stable positional id so EVERY card still renders as a distinct entry (R1.4 —
 * no dropping). `cited` records whether a matching citation exists in the pack;
 * `citationUrl` prefers the citation URL and falls back to the source URL.
 *
 * @param {unknown} card
 * @param {number} index position in the pack (0-based)
 * @param {Map<string, string>} citationsById
 * @returns {object}
 */
function buildSourceEntry(card, index, citationsById) {
  const safeCard = card && typeof card === "object" && !Array.isArray(card) ? card : {};
  const sourceId = toText(safeCard.sourceId, `source-${index + 1}`);
  const url = toText(safeCard.url);
  const cited = citationsById.has(sourceId);
  const citationUrl = cited ? toText(citationsById.get(sourceId), url) : url;
  return {
    sourceId,
    order: index,
    url,
    platform: toText(safeCard.platform),
    title: toText(safeCard.title || safeCard.visiblePublisher, `Source ${index + 1}`),
    evidenceLevel: toText(safeCard.evidenceLevel),
    captureTime: toText(safeCard.captureTime),
    cited,
    citationUrl,
  };
}

// --- Public API -------------------------------------------------------------

/**
 * Build the Evidence_Pack display view-model from an Evidence_Pack (or the
 * Research_Harness envelope that wraps one).
 *
 * The result lists EVERY Source_Card contained in the pack — one entry per
 * card, in pack order, with NO dropping and NO de-duplication beyond the pack's
 * own ids (R1.4 / Property 32). `count` equals the number of rendered source
 * entries, which equals the pack's `sources[]` length; on the Research_Harness
 * success path (citations mirror sources one-to-one) it also equals
 * `citationCount`. A degraded/empty pack (no sources — the R6.4 `weak_signal`
 * path) renders gracefully with an empty `sources` list, `count` 0, and
 * `hasSources` false, still surfacing the degraded `summary` and `status`.
 *
 * Pure and deterministic: performs no I/O, never mutates the input, and never
 * throws for malformed input.
 *
 * @param {unknown} input Evidence_Pack or Research_Harness envelope
 * @returns {{
 *   sources: Array<{
 *     sourceId: string,
 *     order: number,
 *     url: string,
 *     platform: string,
 *     title: string,
 *     evidenceLevel: string,
 *     captureTime: string,
 *     cited: boolean,
 *     citationUrl: string,
 *   }>,
 *   count: number,
 *   citationCount: number,
 *   hasSources: boolean,
 *   summary: string,
 *   status: string|null,
 *   degraded: boolean,
 * }}
 */
export function buildEvidencePackView(input) {
  const pack = resolveEvidencePack(input) || {};
  const envelope = input && typeof input === "object" && !Array.isArray(input) ? input : {};

  const rawSources = Array.isArray(pack.sources) ? pack.sources : [];
  const citationsById = indexCitations(pack.citations);
  const citationCount = Array.isArray(pack.citations) ? pack.citations.length : 0;

  // One display entry per Source_Card, in pack order — every cited source is
  // listed (R1.4): no dropping, no dedup beyond the pack's own ids.
  const sources = rawSources.map((card, index) => buildSourceEntry(card, index, citationsById));

  // Status / degraded flags come from the Research_Harness envelope when the
  // caller passes one; a raw pack carries neither, so they default sensibly.
  const status = typeof envelope.status === "string" ? envelope.status : null;
  const degraded =
    typeof envelope.degraded === "boolean" ? envelope.degraded : sources.length === 0;

  return {
    sources,
    count: sources.length,
    citationCount,
    hasSources: sources.length > 0,
    summary: toText(pack.summary),
    status,
    degraded,
  };
}
