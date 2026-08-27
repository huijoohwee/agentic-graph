// Evidence/research source-card normalization + market-radar builder for the
// video-remix Director runtime. Extracted verbatim from
// `mcp/video-remix-runtime.js` (reuse-not-rebuild).

import { cleanString } from "./helpers.js";

function normalizeSourceCards(values, referenceUrl, nowIso) {
  const cards = Array.isArray(values) ? values : [];
  return cards.map((card, index) => {
    const url = cleanString(card?.url, index === 0 ? referenceUrl : "");
    const parsed = url ? new URL(url) : new URL(referenceUrl);
    const sourceId = cleanString(card?.sourceId, `source-${index + 1}`);
    return {
      sourceId,
      url: parsed.toString(),
      platform: cleanString(card?.platform, parsed.hostname.replace(/^www\./, "")),
      title: cleanString(card?.title || card?.visiblePublisher, `Reference evidence ${index + 1}`),
      evidenceLevel: ["A", "B", "C"].includes(card?.evidenceLevel) ? card.evidenceLevel : "B",
      captureTime: cleanString(card?.captureTime, nowIso),
      observedFields: Array.isArray(card?.observedFields) && card.observedFields.length
        ? card.observedFields.map((field) => cleanString(field)).filter(Boolean)
        : ["url", "title_or_snippet"],
    };
  });
}

/**
 * Enforce Source_Card `sourceId` uniqueness WITHIN an Evidence_Pack
 * (agenticgraph-acos-mcp-connector spec, task 3.2 / R6.2 / Property 10).
 *
 * R6.2: WHEN the Research_Harness creates an Evidence_Pack, THE Research_Harness
 * SHALL assign each Source_Card a `sourceId` that is unique within that
 * Evidence_Pack.
 *
 * Deterministic, fabrication-free normalization: it never adds or removes
 * sources (the source COUNT is preserved) — it only re-labels colliding or
 * missing ids. A missing/blank `sourceId` falls back to the stable positional
 * id `source-{index+1}`; a collision (whether from a duplicate client id or a
 * fallback clash) is disambiguated by appending the smallest `-N` (N starting
 * at 2) suffix that is not yet taken. Order is preserved so downstream
 * citations mirror the resulting unique ids one-to-one.
 *
 * @param {Array} sources - Source_Cards (already normalized by
 *   `normalizeSourceCards`); each may carry a `sourceId`.
 * @returns {Array} the same cards, in the same order and count, each carrying a
 *   `sourceId` unique within the returned set.
 */
function assignUniqueSourceIds(sources) {
  const cards = Array.isArray(sources) ? sources : [];
  const seen = new Set();
  return cards.map((card, index) => {
    const base = cleanString(card?.sourceId, `source-${index + 1}`);
    let candidate = base;
    let suffix = 2;
    while (seen.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    seen.add(candidate);
    return candidate === card?.sourceId ? card : { ...card, sourceId: candidate };
  });
}

function buildMarketRadar(sources, brief) {
  return {
    claims: sources.length
      ? sources.map((source, index) => ({
        claimId: `claim-${index + 1}`,
        summary: `Source-backed remix signal for ${brief.slice(0, 96) || "the submitted brief"}.`,
        sourceCardIds: [source.sourceId],
        confidence: source.evidenceLevel === "A" ? "medium" : "low",
      }))
      : [{
        claimId: "claim-pending-1",
        summary: "No source-backed market or reference claim is available.",
        sourceCardIds: [],
        confidence: "none",
      }],
  };
}

export { normalizeSourceCards, assignUniqueSourceIds, buildMarketRadar };
