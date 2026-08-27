// Research_Harness for the video-remix Director runtime
// (agenticgraph-acos-mcp-connector spec, task 3.1 / R6.1 / Property 10 —
// production side).
//
// Responsibility (single): given a reference URL (+ optional query / result
// cap), produce an Evidence_Pack `{ sources[], citations[], summary }` of 3..50
// Source_Cards. Search context comes from the Exa SSOT
// (`grph-shared/src/search/exaMcpSsot.ts`) and the human-readable summary from
// the BytePlus summary model — but BOTH are reached through an INJECTABLE
// client seam so the local runtime makes ZERO live network/model calls. Live
// wiring + provider routing through the Cloudflare AI Gateway is exercised in
// integration task 9.2; here the default clients are deterministic, in-memory
// mocks so unit/property tests are network-free.
//
// Boundary notes (do not overstep adjacent tasks):
//   * Source_Card `sourceId` uniqueness within the Evidence_Pack is spec task
//     3.2 (R6.2 / Property 10): the harness ENFORCES it via
//     `assignUniqueSourceIds` (evidence.js) on the final, capped source set,
//     deterministically de-duplicating/assigning ids WITHOUT changing the
//     source count, so even a client returning duplicate or missing ids yields
//     a pack of all-unique ids. Citations mirror the resulting unique ids.
//   * The degraded `weak_signal` path (Exa error / 30s timeout / <3 sources)
//     is spec task 3.3 (R6.4 / R6.5 / Property 11 — production side), now
//     implemented here: an Exa error OR an (injectable, timer-free) 30s
//     deadline signal yields an Evidence_Pack with EMPTY sources/citations, a
//     degraded summary, status `weak_signal`, and the partial input retained
//     unchanged — never fabricating sources to fill the gap; a successful
//     search returning fewer than 3 Source_Cards is marked `weak_signal` while
//     KEEPING the real (sub-minimum) count, again without fabrication. The
//     Director-side halt-before-storyboard wiring is task 3.4.
//   * The `paid-model-call` approval gate is enforced at the McpAgent boundary
//     / Director (reuse-not-rebuild). The harness produces evidence GIVEN an
//     Exa client; it performs no gate check itself.
//
// Pure / SDK-agnostic apart from the injected clients: importable by both the
// Node tests and the Cloudflare Worker bundle.

import { cleanString } from "./helpers.js";
import { normalizeSourceCards, assignUniqueSourceIds } from "./evidence.js";

// Contract constants (R6.1). `maxResults` is capped at 10 at the input
// boundary (matches the Exa SSOT `EXA_MCP_DEFAULT_MAX_RESULTS` and the
// `RESEARCH_INPUT_SCHEMA` `maximum: 10`); a successful Evidence_Pack carries
// between 3 and 50 Source_Cards.
export const RESEARCH_MAX_RESULTS = 10;
export const RESEARCH_MIN_RESULTS = 1;
export const RESEARCH_MIN_SOURCE_CARDS = 3;
export const RESEARCH_MAX_SOURCE_CARDS = 50;
export const RESEARCH_DEFAULT_MAX_RESULTS = 10;
// Structural 30s deadline (R6.1). Timer-free here — recorded as metadata so the
// live wiring (task 9.2) can enforce the actual timeout. The deterministic mock
// resolves synchronously, so it can never exceed the deadline locally.
export const RESEARCH_DEADLINE_MS = 30000;

export const RESEARCH_GATE_ID = "paid-model-call";

const RESEARCH_STATUS_COMPLETE = "complete";
const RESEARCH_STATUS_WEAK_SIGNAL = "weak_signal";

// Degrade reasons surfaced on the envelope so the Director (task 3.4) can
// distinguish WHY a stage is `weak_signal` without re-deriving it.
export const RESEARCH_DEGRADE_EXA_ERROR = "exa_error";
export const RESEARCH_DEGRADE_DEADLINE = "deadline_exceeded";
export const RESEARCH_DEGRADE_INSUFFICIENT_SOURCES = "insufficient_sources";

/**
 * Typed input-validation error for the Research_Harness contract. Mirrors the
 * `DirectorInputValidationError` shape (a `field` naming the offending input)
 * so the McpAgent / Agent_Api boundary can surface the bad field to callers.
 */
export class ResearchHarnessInputError extends Error {
  constructor(field, message) {
    super(message || `Invalid research input: ${field}`);
    this.name = "ResearchHarnessInputError";
    this.code = "invalid_research_input";
    this.field = field;
  }
}

function isAbsoluteHttpUrl(value) {
  const text = cleanString(value);
  if (!text) return false;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Clamp a requested `maxResults` into the accepted `[1, 10]` window (R6.1 /
 * RESEARCH_INPUT_SCHEMA). An omitted value defaults to RESEARCH_DEFAULT_MAX_
 * RESULTS. A non-numeric value is rejected by `validateResearchInput`; this
 * helper assumes a finite number and only clamps the range.
 */
export function clampMaxResults(value) {
  if (value === undefined || value === null) return RESEARCH_DEFAULT_MAX_RESULTS;
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return RESEARCH_DEFAULT_MAX_RESULTS;
  return Math.max(RESEARCH_MIN_RESULTS, Math.min(RESEARCH_MAX_RESULTS, number));
}

/**
 * Enforce the Research_Harness input contract
 * `{ referenceUrl, query?, maxResults<=10 }`. Returns the normalized accepted
 * values `{ referenceUrl, query, maxResults }`. Throws a typed
 * `ResearchHarnessInputError` naming the bad field otherwise.
 */
export function validateResearchInput(args = {}) {
  const input = args && typeof args === "object" ? args : {};

  // referenceUrl: required, absolute http/https URL.
  if (!isAbsoluteHttpUrl(input.referenceUrl)) {
    throw new ResearchHarnessInputError(
      "referenceUrl",
      "referenceUrl is required and must be an absolute http(s) URL",
    );
  }
  const referenceUrl = new URL(cleanString(input.referenceUrl)).toString();

  // query: optional. When provided it must be a string (it may be empty).
  let query = "";
  if (input.query !== undefined && input.query !== null) {
    if (typeof input.query !== "string") {
      throw new ResearchHarnessInputError("query", "query must be a string when provided");
    }
    query = input.query.trim();
  }

  // maxResults: optional. When provided it must be numeric; the value is then
  // CLAMPED into [1, 10] (the contract's `maxResults<=10`).
  if (input.maxResults !== undefined && input.maxResults !== null) {
    const candidate = Number(input.maxResults);
    if (!Number.isFinite(candidate)) {
      throw new ResearchHarnessInputError("maxResults", "maxResults must be a number when provided");
    }
  }
  const maxResults = clampMaxResults(input.maxResults);

  return { referenceUrl, query, maxResults };
}

/**
 * Build a deterministic, network-free Exa client. This is the DEFAULT search
 * seam: it derives stable Source_Card candidates from the reference URL host so
 * a run is reproducible and makes zero live calls. The live Exa client wired
 * through the Cloudflare AI Gateway is exercised in integration task 9.2 and
 * injected via `deps.exaClient`.
 *
 * The returned client exposes `search({ referenceUrl, query, maxResults })`
 * returning an array of raw source candidates (the shape `normalizeSourceCards`
 * accepts). It emits unique `sourceId`s so it does not violate the task 3.2
 * uniqueness seam.
 */
export function createDeterministicExaClient(options = {}) {
  const count = Number.isFinite(options.count) ? Math.floor(options.count) : null;
  return {
    isDeterministicMock: true,
    search({ referenceUrl, query, maxResults }) {
      const cap = clampMaxResults(maxResults);
      const total = count === null ? cap : Math.max(0, Math.min(cap, count));
      const host = (() => {
        try {
          return new URL(referenceUrl).hostname.replace(/^www\./, "");
        } catch {
          return "reference.local";
        }
      })();
      const topic = cleanString(query, "reference remix signal");
      const cards = [];
      for (let index = 0; index < total; index += 1) {
        const ordinal = index + 1;
        const platform = `${host.split(".")[0] || "reference"}-${ordinal}`;
        cards.push({
          sourceId: `exa-${host}-${ordinal}`,
          url: `https://${host}/evidence/${ordinal}?q=${encodeURIComponent(topic)}`,
          platform,
          title: `Evidence ${ordinal}: ${topic}`,
          evidenceLevel: ordinal % 3 === 1 ? "A" : "B",
          observedFields: ["url", "title_or_snippet"],
        });
      }
      return cards;
    },
  };
}

/**
 * Build a deterministic, network-free BytePlus summary client. This is the
 * DEFAULT summary seam: it composes a stable, source-grounded summary string
 * with zero model spend. The live BytePlus summary model routed through the
 * Cloudflare AI Gateway is exercised in integration task 9.2 and injected via
 * `deps.summaryClient`.
 */
export function createDeterministicSummaryClient() {
  return {
    isDeterministicMock: true,
    summarize({ query, sources }) {
      const cards = Array.isArray(sources) ? sources : [];
      if (cards.length < RESEARCH_MIN_SOURCE_CARDS) {
        return "Weak signal: fewer than three source cards are available; no fabricated sources.";
      }
      const topic = cleanString(query, "the submitted brief");
      return (
        `Source-backed evidence (${cards.length} cards) is ready for storyboard planning ` +
        `for ${topic}. Downstream claims must reference sourceCardIds; sources are never fabricated.`
      );
    },
  };
}

function buildCitations(sources) {
  return sources.map((source) => ({ sourceId: source.sourceId, url: source.url }));
}

/**
 * Resolve the (timer-free) 30s deadline seam. The real timeout is enforced by
 * the live wiring (task 9.2); here the caller injects whether the deadline was
 * exceeded so unit/property tests stay synchronous and network-free. Accepts a
 * boolean or a `() => boolean` predicate.
 */
function isDeadlineExceeded(signal) {
  if (typeof signal === "function") {
    return Boolean(signal());
  }
  return Boolean(signal);
}

/**
 * A raw Exa result may signal a timeout WITHOUT throwing (e.g. an aborted
 * query returning a sentinel). Detect the `{ timedOut: true }` shape.
 */
function rawResultSignalsTimeout(rawResult) {
  return Boolean(
    rawResult &&
      typeof rawResult === "object" &&
      !Array.isArray(rawResult) &&
      rawResult.timedOut,
  );
}

/**
 * Build the degraded Evidence_Pack envelope for the R6.4 path (Exa error or 30s
 * timeout). The pack carries EMPTY sources and citations, a degraded summary
 * string, status `weak_signal`, and the validated partial input retained
 * unchanged. NO sources are fabricated to fill the gap.
 */
function buildDegradedResult({ referenceUrl, query, maxResults, reason, paidProviderCalls }) {
  const summary =
    reason === RESEARCH_DEGRADE_DEADLINE
      ? "Weak signal: the research query did not complete within the 30s deadline; " +
        "returning a degraded summary with no sources. Sources are never fabricated."
      : "Weak signal: the research provider returned an error; returning a degraded " +
        "summary with no sources. Sources are never fabricated.";
  return {
    status: RESEARCH_STATUS_WEAK_SIGNAL,
    degraded: true,
    degradeReason: reason,
    gateId: RESEARCH_GATE_ID,
    paidProviderCalls,
    maxResults,
    deadlineMs: RESEARCH_DEADLINE_MS,
    referenceUrl,
    query,
    evidencePack: {
      sources: [],
      citations: [],
      summary,
      trustPolicy:
        "downstream claims must reference sourceCardIds; sources are never fabricated",
    },
  };
}

/**
 * Run the Research_Harness over an injectable Exa + summary client seam.
 *
 * Contract (R6.1 / Property 10 production side):
 *   input  : { referenceUrl, query?, maxResults<=10 }
 *   output : { status, gateId, paidProviderCalls, maxResults, deadlineMs,
 *              evidencePack: { sources[], citations[], summary } }
 *
 * On the success path the Evidence_Pack carries between RESEARCH_MIN_SOURCE_
 * CARDS (3) and RESEARCH_MAX_SOURCE_CARDS (50) Source_Cards; the returned set
 * is additionally capped at the clamped `maxResults`. The default clients are
 * deterministic and network-free (zero paid-provider calls). Async so an
 * injected live client may return a promise.
 *
 * Degraded path (R6.4 / R6.5 / Property 11):
 *   * If the Exa client throws, OR the (injectable, timer-free) 30s deadline
 *     signal fires, OR the raw result signals a timeout, the harness returns a
 *     degraded Evidence_Pack with EMPTY `sources`/`citations`, a degraded
 *     `summary`, status `weak_signal`, `degraded:true`, the offending
 *     `degradeReason`, and the validated partial input (`referenceUrl`,
 *     `query`) retained unchanged. It NEVER fabricates sources.
 *   * If the search succeeds but returns fewer than 3 Source_Cards, the harness
 *     marks the stage `weak_signal` and KEEPS the real (sub-minimum) count
 *     without fabricating additional sources to reach the minimum.
 *
 * @param {object} input  - the Research_Harness input contract.
 * @param {object} [deps] - injectable seams.
 * @param {object} [deps.exaClient]     - `{ search({referenceUrl,query,maxResults}) }`.
 * @param {object} [deps.summaryClient] - `{ summarize({referenceUrl,query,sources}) }`.
 * @param {() => string} [deps.now]     - ISO timestamp source (capture time).
 * @param {boolean|(() => boolean)} [deps.timeoutSignal] - models the 30s
 *   deadline without a real timer; truthy ⇒ degraded `deadline_exceeded`.
 */
export async function runResearchHarness(input, deps = {}) {
  const { referenceUrl, query, maxResults } = validateResearchInput(input);

  const exaClient = deps.exaClient || createDeterministicExaClient();
  const summaryClient = deps.summaryClient || createDeterministicSummaryClient();
  const nowIso = typeof deps.now === "function" ? deps.now() : new Date().toISOString();

  // The local runtime makes no live calls, so the deterministic default path
  // records zero paid-provider calls. A caller wiring a live client accounts
  // spend through the Cost_Log / Budget_Meters seams at the Director.
  const usedDeterministicClients =
    Boolean(exaClient.isDeterministicMock) && Boolean(summaryClient.isDeterministicMock);
  const paidProviderCalls = usedDeterministicClients ? 0 : Number(deps.paidProviderCalls) || 0;

  // Degraded path (R6.4) — 30s deadline. Modeled via an injectable signal (no
  // real timer): if the deadline is already exceeded, short-circuit to a
  // degraded pack WITHOUT issuing the search, retaining the partial input.
  if (isDeadlineExceeded(deps.timeoutSignal)) {
    return buildDegradedResult({
      referenceUrl,
      query,
      maxResults,
      reason: RESEARCH_DEGRADE_DEADLINE,
      paidProviderCalls,
    });
  }

  // Search via the (injectable) Exa seam. The default client is synchronous and
  // network-free; an injected live client may return a promise — `await` covers
  // both. Degraded path (R6.4): an Exa error yields a degraded pack with empty
  // sources, `weak_signal`, partial input retained, and no fabrication.
  let rawResult;
  try {
    rawResult = await exaClient.search({ referenceUrl, query, maxResults });
  } catch {
    return buildDegradedResult({
      referenceUrl,
      query,
      maxResults,
      reason: RESEARCH_DEGRADE_EXA_ERROR,
      paidProviderCalls,
    });
  }

  // Degraded path (R6.4) — the search itself may signal a timeout without
  // throwing (e.g. an aborted query). Treat it the same as the deadline path.
  if (rawResultSignalsTimeout(rawResult)) {
    return buildDegradedResult({
      referenceUrl,
      query,
      maxResults,
      reason: RESEARCH_DEGRADE_DEADLINE,
      paidProviderCalls,
    });
  }

  const rawSources = Array.isArray(rawResult) ? rawResult : [];

  // Normalize raw candidates into Source_Cards (reuse evidence.js), then honor
  // the contract bounds: cap to the clamped maxResults AND the 50-card ceiling.
  const normalized = normalizeSourceCards(rawSources, referenceUrl, nowIso);
  const cap = Math.min(maxResults, RESEARCH_MAX_SOURCE_CARDS);
  // ENFORCE Source_Card uniqueness within the pack (task 3.2 / R6.2 /
  // Property 10): deterministically de-duplicate/assign ids on the final,
  // capped set WITHOUT changing the source count. Citations are built from this
  // set so they mirror the now-unique ids one-to-one.
  const sources = assignUniqueSourceIds(normalized.slice(0, cap));

  const summary = await summaryClient.summarize({ referenceUrl, query, sources });
  const citations = buildCitations(sources);

  // Status marker (R6.5): a successful search returning fewer than 3
  // Source_Cards is `weak_signal` — the REAL (sub-minimum) count is preserved;
  // no sources are fabricated to reach the minimum. 3..50 ⇒ `complete`.
  const isWeakSignal = sources.length < RESEARCH_MIN_SOURCE_CARDS;
  const status = isWeakSignal ? RESEARCH_STATUS_WEAK_SIGNAL : RESEARCH_STATUS_COMPLETE;

  return {
    status,
    degraded: isWeakSignal,
    degradeReason: isWeakSignal ? RESEARCH_DEGRADE_INSUFFICIENT_SOURCES : null,
    gateId: RESEARCH_GATE_ID,
    paidProviderCalls,
    maxResults,
    deadlineMs: RESEARCH_DEADLINE_MS,
    referenceUrl,
    query,
    evidencePack: {
      sources,
      citations,
      summary: cleanString(summary, "Source-backed evidence is ready for storyboard planning."),
      trustPolicy:
        "downstream claims must reference sourceCardIds; sources are never fabricated",
    },
  };
}
