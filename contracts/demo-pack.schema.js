// =============================================================================
// Demo_Pack — canonical schema + pure validator (SSOT)
// agentic-graph-acos-mcp-connector spec · Section 8 (Data models / shared contracts)
// Task 8.7 · Requirements R3.1, R3.2 · design.md › Data Models › Demo_Pack
// =============================================================================
//
// WHY THIS FILE EXISTS
// --------------------
// The Demo_Pack is the hackathon-judge evidence aggregate the Director assembles
// at a terminal Run_State (design › User Flow › Hackathon judge). The design
// Data Models specify it as:
//
//   Demo_Pack {
//     urls: { url, kind }[]      // >=1 Frontend URL + >=1 Agent_Api endpoint (R3.2)
//     sections: DemoSection[7]   // exactly one per judging dimension, each non-empty (R3.1)
//   }
//   DemoSection { dimension, evidence (non-empty), verified (boolean) }
//
// The Director runtime already BUILDS this shape in
// `mcp/video-remix/demo-pack.js` (`buildDemoPack`). That builder emits a
// SUPERSET of the contract (each url also carries `reachable`/`section`; each
// section also carries `id`/`status`/`failingUrls`/`artifact`). This module is
// the SINGLE SOURCE OF TRUTH for the CROSS-TIER Demo_Pack contract so the AWS
// Agent_Api / Vercel web tiers validate the judge surface without forking field
// names. See DEMO_PACK RECONCILIATION at the bottom for the exact field-by-field
// mapping against the mcp builder.
//
// This module is:
//   - framework-agnostic and dependency-free (no JSON-schema lib),
//   - plain ESM ("type":"module") reachable by every tier (.js / .mjs),
//   - a PURE validator: `validateDemoPack(p) -> { valid, errors:[{path,reason}] }`
//     that NEVER throws, makes ZERO network calls, and is fully deterministic.
//
// It is lenient about EXTRA properties (the runtime builder's superset fields
// pass through cleanly) but strict about the contract's required shape.
//
// This task PUBLISHES the SSOT only. Existing tiers are NOT re-pointed here yet
// (later integration tasks own that).
// =============================================================================

// -----------------------------------------------------------------------------
// Canonical judging dimensions (R3.1)
// -----------------------------------------------------------------------------

/**
 * The seven judging dimensions, keyed by the canonical snake-case id used by
 * the runtime `DEMO_SECTIONS` catalog (`mcp/video-remix/constants.js`) and the
 * `JUDGING_DIMENSIONS` map in `mcp/video-remix/demo-pack.js`. The VALUE is the
 * human-readable `dimension` string the contract carries. Frozen + ordered so
 * the catalog is stable across tiers.
 */
export const DEMO_PACK_DIMENSION_BY_ID = Object.freeze({
  agent_overview: "Agent Overview",
  autonomy_decision_making: "Autonomy & Decision-Making",
  actions_tool_use: "Actions & Tool Use",
  orchestration: "Orchestration",
  human_in_the_loop: "Human-in-the-Loop",
  failure_handling: "Failure Handling",
  demo_presentation: "Demo & Presentation",
});

/** Canonical snake-case dimension ids, in fixed catalog order. */
export const DEMO_PACK_DIMENSION_IDS = Object.freeze(
  Object.keys(DEMO_PACK_DIMENSION_BY_ID),
);

/** Canonical human-readable dimension strings, in fixed catalog order (R3.1). */
export const DEMO_PACK_DIMENSIONS = Object.freeze(
  Object.values(DEMO_PACK_DIMENSION_BY_ID),
);

/** The exact number of evidence sections a Demo_Pack must carry (R3.1). */
export const DEMO_PACK_SECTION_COUNT = DEMO_PACK_DIMENSIONS.length; // 7

// -----------------------------------------------------------------------------
// Canonical URL kinds (R3.2)
// -----------------------------------------------------------------------------

/** Frontend (Vercel) URL kind — the R3.2 ">=1 Frontend URL" requirement. */
export const DEMO_PACK_FRONTEND_URL_KIND = "frontend";

/** Cloudflare Worker (agentic-graph-mcp) URL kind — the ">=1 Worker endpoint" requirement. */
export const DEMO_PACK_WORKER_URL_KIND = "worker";

/**
 * URL kinds that count as a Worker endpoint for the ">=1 Worker endpoint"
 * requirement. The base MCP endpoint and its open `GET /health` liveness route
 * both qualify.
 */
export const DEMO_PACK_WORKER_URL_KINDS = Object.freeze([
  "worker",
  "worker-health",
]);

// Backward-compatible alias — callers that imported the old name keep working.
export const DEMO_PACK_AGENT_API_URL_KINDS = DEMO_PACK_WORKER_URL_KINDS;

/**
 * Canonical Demo_Pack url kinds. `frontend` + the two worker kinds are
 * REQUIRED-coverage kinds; `asset`, `stripe-session`, and `canvas` are the
 * additional artifact surfaces a judge may follow.
 */
export const DEMO_PACK_URL_KINDS = Object.freeze([
  DEMO_PACK_FRONTEND_URL_KIND,
  ...DEMO_PACK_WORKER_URL_KINDS,
  "asset",
  "stripe-session",
  "canvas",
]);

// -----------------------------------------------------------------------------
// Small pure predicates (no throw, no I/O)
// -----------------------------------------------------------------------------

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isFrontendKind(kind) {
  return kind === DEMO_PACK_FRONTEND_URL_KIND;
}

function isAgentApiKind(kind) {
  return DEMO_PACK_WORKER_URL_KINDS.includes(kind);
}

// -----------------------------------------------------------------------------
// Validator — pure, never throws, returns structured {path, reason} errors
// -----------------------------------------------------------------------------

/**
 * Validate a Demo_Pack against the canonical SSOT schema (design Data Models ›
 * Demo_Pack; R3.1, R3.2).
 *
 * Required shape:
 *   * `urls`     — array. Each entry is `{ url, kind }` where `url` is a
 *                  non-empty string and `kind` is one of `DEMO_PACK_URL_KINDS`.
 *                  The collection MUST contain at least one Frontend URL and at
 *                  least one Agent_Api endpoint (R3.2). Extra entry fields
 *                  (e.g. the runtime's `reachable`/`section`) are ignored.
 *   * `sections` — array of EXACTLY seven entries (R3.1). Each entry is
 *                  `{ dimension, evidence, verified }` where `dimension` is one
 *                  of `DEMO_PACK_DIMENSIONS`, `evidence` is a non-empty string,
 *                  and `verified` is a boolean. The seven canonical dimensions
 *                  MUST each be covered exactly once (no duplicates, none
 *                  missing). Extra entry fields (e.g. the runtime's
 *                  `id`/`status`/`failingUrls`/`artifact`) are ignored.
 *
 * Pure and total: any input (including `undefined`, `null`, primitives) yields
 * a result object and never throws.
 *
 * @param {unknown} demoPack
 * @returns {{ valid: boolean, errors: Array<{ path: string, reason: string }> }}
 */
export function validateDemoPack(demoPack) {
  const errors = [];
  const add = (path, reason) => errors.push({ path, reason });

  if (!isPlainObject(demoPack)) {
    add("", "Demo_Pack must be a non-null object");
    return { valid: false, errors };
  }

  validateUrls(demoPack.urls, add);
  validateSections(demoPack.sections, add);

  return { valid: errors.length === 0, errors };
}

// --- urls[] (R3.2) ----------------------------------------------------------

function validateUrls(urls, add) {
  if (urls === undefined) {
    add("urls", "required field is missing");
    return;
  }
  if (!Array.isArray(urls)) {
    add("urls", "must be an array of { url, kind } entries");
    return;
  }

  let hasFrontend = false;
  let hasAgentApi = false;

  urls.forEach((entry, i) => {
    const base = `urls[${i}]`;
    if (!isPlainObject(entry)) {
      add(base, "must be an object of shape { url, kind }");
      return;
    }
    if (!isNonEmptyString(entry.url)) {
      add(`${base}.url`, "must be a non-empty string");
    }
    if (!isNonEmptyString(entry.kind)) {
      add(`${base}.kind`, "must be a non-empty string");
    } else if (!DEMO_PACK_URL_KINDS.includes(entry.kind)) {
      add(
        `${base}.kind`,
        `must be one of ${DEMO_PACK_URL_KINDS.join(", ")}`,
      );
    } else {
      if (isFrontendKind(entry.kind)) hasFrontend = true;
      if (isAgentApiKind(entry.kind)) hasAgentApi = true;
    }
  });

  if (!hasFrontend) {
    add("urls", "must contain at least one Frontend URL (kind 'frontend')");
  }
  if (!hasAgentApi) {
    add(
      "urls",
      `must contain at least one Worker endpoint (kind one of ${DEMO_PACK_WORKER_URL_KINDS.join(", ")})`,
    );
  }
}

// --- sections[7] (R3.1) -----------------------------------------------------

function validateSections(sections, add) {
  if (sections === undefined) {
    add("sections", "required field is missing");
    return;
  }
  if (!Array.isArray(sections)) {
    add("sections", "must be an array of exactly 7 evidence sections");
    return;
  }
  if (sections.length !== DEMO_PACK_SECTION_COUNT) {
    add(
      "sections",
      `must contain exactly ${DEMO_PACK_SECTION_COUNT} sections, one per judging dimension (got ${sections.length}) (R3.1)`,
    );
  }

  const seenDimensions = [];
  sections.forEach((section, i) => {
    const base = `sections[${i}]`;
    if (!isPlainObject(section)) {
      add(base, "must be an object of shape { dimension, evidence, verified }");
      return;
    }
    validateSectionDimension(section, base, add, seenDimensions);
    if (!isNonEmptyString(section.evidence)) {
      add(`${base}.evidence`, "must be a non-empty string (R3.1)");
    }
    if (typeof section.verified !== "boolean") {
      add(`${base}.verified`, "must be a boolean");
    }
  });

  validateDimensionCoverage(seenDimensions, add);
}

function validateSectionDimension(section, base, add, seenDimensions) {
  if (!isNonEmptyString(section.dimension)) {
    add(`${base}.dimension`, "must be a non-empty string");
    return;
  }
  if (!DEMO_PACK_DIMENSIONS.includes(section.dimension)) {
    add(
      `${base}.dimension`,
      `must be one of the seven judging dimensions: ${DEMO_PACK_DIMENSIONS.join(", ")}`,
    );
    return;
  }
  if (seenDimensions.includes(section.dimension)) {
    add(`${base}.dimension`, `duplicate dimension "${section.dimension}" (each must appear exactly once) (R3.1)`);
    return;
  }
  seenDimensions.push(section.dimension);
}

function validateDimensionCoverage(seenDimensions, add) {
  const missing = DEMO_PACK_DIMENSIONS.filter((d) => !seenDimensions.includes(d));
  if (missing.length > 0) {
    add(
      "sections",
      `missing required judging dimension(s): ${missing.join(", ")} (R3.1)`,
    );
  }
}

// -----------------------------------------------------------------------------
// Convenience factory — a minimal, schema-valid Demo_Pack.
// -----------------------------------------------------------------------------

/**
 * Build a canonical, schema-valid Demo_Pack. By default it emits the seven
 * canonical sections (each with placeholder non-empty evidence and
 * `verified:false`) plus the minimum R3.2 url coverage (one frontend + one
 * agent-api). Callers may override `urls`, per-dimension `evidence` (a map
 * keyed by dimension id OR display string), and per-dimension `verified`.
 *
 * @param {{
 *   urls?: Array<{ url: string, kind: string }>,
 *   evidence?: Record<string, string>,
 *   verified?: Record<string, boolean>,
 * }} [init]
 * @returns {{ urls: Array<{url:string,kind:string}>, sections: Array<{dimension:string,evidence:string,verified:boolean}> }}
 */
export function createDemoPack(init = {}) {
  const source = isPlainObject(init) ? init : {};
  const urls = Array.isArray(source.urls) && source.urls.length > 0
    ? source.urls
    : [
      { kind: DEMO_PACK_FRONTEND_URL_KIND, url: "https://airvio.co/agentic-graph" },
      { kind: "worker", url: "https://airvio.co/agentic-graph/mcp" },
    ];
  const evidence = isPlainObject(source.evidence) ? source.evidence : {};
  const verified = isPlainObject(source.verified) ? source.verified : {};

  const sections = DEMO_PACK_DIMENSION_IDS.map((id) => {
    const dimension = DEMO_PACK_DIMENSION_BY_ID[id];
    const ev = evidence[id] || evidence[dimension];
    const vf = id in verified ? verified[id] : verified[dimension];
    return {
      dimension,
      evidence: isNonEmptyString(ev) ? ev : `Evidence recorded for ${dimension}.`,
      verified: typeof vf === "boolean" ? vf : false,
    };
  });

  return { urls, sections };
}

// =============================================================================
// DEMO_PACK RECONCILIATION (canonical contract vs. runtime builder)
// =============================================================================
// The Director runtime builds the Demo_Pack in `mcp/video-remix/demo-pack.js`
// (`buildDemoPack`). Its output is a SUPERSET of this cross-tier contract:
//
//   runtime `buildDemoPack(...)` returns:
//     { readiness, atTerminalRunState, sections, marketEvidenceCount,
//       urls, failingUrls, artifactReferences, healthCheck, assets, checkout }
//
//   * `urls[]`     — runtime entries are { kind, url, reachable, section? }.
//                    The CONTRACT requires only { url, kind }; the extra
//                    `reachable`/`section` fields are IGNORED by validateDemoPack.
//                    Runtime kinds emitted today: "frontend", "agent-api",
//                    "agent-api-health" — all in DEMO_PACK_URL_KINDS, and the
//                    set always satisfies the R3.2 frontend+agent-api coverage
//                    at a terminal Run_State. ("asset"/"stripe-session" are
//                    additional canonical kinds reserved for artifact urls.)
//
//   * `sections[]` — runtime entries are { id, dimension, status, evidence,
//                    verified, failingUrls?, artifact? }. The CONTRACT requires
//                    only { dimension, evidence, verified }; the extra
//                    `id`/`status`/`failingUrls`/`artifact` fields are IGNORED.
//                    The runtime `dimension` strings come from `JUDGING_DIMENSIONS`
//                    in the builder, which are IDENTICAL to DEMO_PACK_DIMENSIONS
//                    here (same seven values, same order), so a terminal-state
//                    runtime Demo_Pack passes validateDemoPack unchanged.
//
// NAMING DIFFERENCES (documented, no fork):
//   * The contract carries the human-readable `dimension` string only; the
//     runtime ALSO keys each section by the snake-case `id`
//     (DEMO_PACK_DIMENSION_BY_ID maps id -> dimension so either side can derive
//     the other).
//   * The contract's `urls[].kind` vocabulary is the SAME tokens the runtime
//     emits; this module additionally enumerates "asset"/"stripe-session" for
//     completeness with the design's artifact references (R3.6).
//   * Runtime-only top-level fields (`readiness`, `atTerminalRunState`,
//     `failingUrls`, `artifactReferences`, `healthCheck`, `assets`, `checkout`,
//     `marketEvidenceCount`) are observability/runtime state, NOT part of the
//     cross-tier judge contract, so they are intentionally absent here.
//
// No tier is re-pointed by this task; the SSOT is published for later
// integration to consume.
// =============================================================================
