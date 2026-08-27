// =============================================================================
// Demo_Pack SSOT schema — unit + property tests
// agenticgraph-acos-mcp-connector spec · Task 8.7 · Requirements R3.1, R3.2
// Pure validator: ZERO network calls, deterministic.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateDemoPack,
  createDemoPack,
  DEMO_PACK_DIMENSIONS,
  DEMO_PACK_DIMENSION_IDS,
  DEMO_PACK_DIMENSION_BY_ID,
  DEMO_PACK_SECTION_COUNT,
  DEMO_PACK_URL_KINDS,
  DEMO_PACK_FRONTEND_URL_KIND,
  DEMO_PACK_WORKER_URL_KINDS,
  DEMO_PACK_AGENT_API_URL_KINDS,
} from "../demo-pack.schema.js";

// Verify the module is reachable via the aggregate entry point too (SSOT).
import * as contracts from "../index.js";

// Cross-check against the runtime builder to prove the reconciliation holds.
import { buildDemoPack } from "../../mcp/video-remix/demo-pack.js";

// --- helpers ----------------------------------------------------------------

const pathsOf = (result) => result.errors.map((e) => e.path);

/** A complete, canonical, schema-valid Demo_Pack. */
function completePack(overrides = {}) {
  return {
    urls: [
      { kind: "frontend", url: "https://airvio.co/agenticgraph" },
      { kind: "worker", url: "https://airvio.co/agenticgraph/mcp" },
      { kind: "worker-health", url: "https://airvio.co/agenticgraph/mcp/health" },
    ],
    sections: DEMO_PACK_DIMENSIONS.map((dimension) => ({
      dimension,
      evidence: `Evidence for ${dimension}.`,
      verified: false,
    })),
    ...overrides,
  };
}

// --- 0. SSOT reachability + stable constants --------------------------------

test("demo-pack schema is re-exported from the aggregate contracts entry point", () => {
  assert.equal(typeof contracts.validateDemoPack, "function");
  assert.equal(typeof contracts.createDemoPack, "function");
  assert.deepEqual(contracts.DEMO_PACK_DIMENSIONS, DEMO_PACK_DIMENSIONS);
});

test("canonical dimension catalog is the seven judging dimensions in fixed order", () => {
  assert.equal(DEMO_PACK_SECTION_COUNT, 7);
  assert.deepEqual(DEMO_PACK_DIMENSIONS, [
    "Agent Overview",
    "Autonomy & Decision-Making",
    "Actions & Tool Use",
    "Orchestration",
    "Human-in-the-Loop",
    "Failure Handling",
    "Demo & Presentation",
  ]);
  assert.equal(DEMO_PACK_DIMENSION_IDS.length, 7);
  for (const id of DEMO_PACK_DIMENSION_IDS) {
    assert.ok(DEMO_PACK_DIMENSIONS.includes(DEMO_PACK_DIMENSION_BY_ID[id]));
  }
});

test("canonical url kinds include the required-coverage kinds", () => {
  assert.ok(DEMO_PACK_URL_KINDS.includes(DEMO_PACK_FRONTEND_URL_KIND));
  for (const k of DEMO_PACK_WORKER_URL_KINDS) {
    assert.ok(DEMO_PACK_URL_KINDS.includes(k));
  }
  // backward-compat alias points to the same set
  assert.deepEqual(DEMO_PACK_AGENT_API_URL_KINDS, DEMO_PACK_WORKER_URL_KINDS);
});

// --- 1. a valid Demo_Pack passes --------------------------------------------

test("a complete, canonical Demo_Pack is valid with no errors", () => {
  const result = validateDemoPack(completePack());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("createDemoPack factory yields a schema-valid Demo_Pack", () => {
  assert.equal(validateDemoPack(createDemoPack()).valid, true);
  const withEvidence = createDemoPack({
    evidence: { agent_overview: "Custom overview evidence" },
    verified: { "Demo & Presentation": true },
  });
  const result = validateDemoPack(withEvidence);
  assert.equal(result.valid, true);
});

// --- 2. exactly 7 sections (6 or 8 flagged) (R3.1) --------------------------

test("exactly 7 sections required: 6 sections is flagged", () => {
  const pack = completePack();
  pack.sections = pack.sections.slice(0, 6);
  const result = validateDemoPack(pack);
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("sections"));
});

test("exactly 7 sections required: 8 sections is flagged", () => {
  const pack = completePack();
  // duplicate the first dimension to reach 8 entries
  pack.sections = [...pack.sections, { ...pack.sections[0] }];
  const result = validateDemoPack(pack);
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("sections"));
});

// --- 3. each section: dimension + non-empty evidence + boolean verified -----

test("section with empty evidence is flagged with path (R3.1)", () => {
  for (const bad of ["", "   ", 5, null, undefined]) {
    const pack = completePack();
    pack.sections[2].evidence = bad;
    const result = validateDemoPack(pack);
    assert.equal(result.valid, false, `evidence=${String(bad)} should be invalid`);
    assert.ok(pathsOf(result).includes("sections[2].evidence"));
  }
});

test("section with non-boolean verified is flagged with path", () => {
  for (const bad of ["true", 1, 0, null, undefined, {}]) {
    const pack = completePack();
    pack.sections[4].verified = bad;
    const result = validateDemoPack(pack);
    assert.equal(result.valid, false, `verified=${String(bad)} should be invalid`);
    assert.ok(pathsOf(result).includes("sections[4].verified"));
  }
});

test("verified accepts both true and false", () => {
  const pack = completePack();
  pack.sections.forEach((s, i) => { s.verified = i % 2 === 0; });
  assert.equal(validateDemoPack(pack).valid, true);
});

// --- 4. the 7 canonical dimensions covered ----------------------------------

test("non-canonical dimension value is flagged", () => {
  const pack = completePack();
  pack.sections[0].dimension = "Not A Real Dimension";
  const result = validateDemoPack(pack);
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("sections[0].dimension"));
});

test("a missing canonical dimension (duplicate substituted) is flagged", () => {
  const pack = completePack();
  // replace the last dimension with a duplicate of the first -> coverage gap
  pack.sections[6].dimension = pack.sections[0].dimension;
  const result = validateDemoPack(pack);
  assert.equal(result.valid, false);
  // duplicate flagged on the offending section AND/OR coverage gap on sections
  const paths = pathsOf(result);
  assert.ok(paths.includes("sections[6].dimension") || paths.includes("sections"));
});

test("all seven canonical dimensions present exactly once passes", () => {
  const pack = completePack();
  const dims = pack.sections.map((s) => s.dimension).sort();
  assert.deepEqual(dims, [...DEMO_PACK_DIMENSIONS].sort());
  assert.equal(validateDemoPack(pack).valid, true);
});

// --- 5. urls[] { url, kind } validation (R3.2) ------------------------------

test("url entry with empty url is flagged with path", () => {
  for (const bad of ["", "  ", 5, null]) {
    const pack = completePack();
    pack.urls[0].url = bad;
    const result = validateDemoPack(pack);
    assert.equal(result.valid, false, `url=${String(bad)} should be invalid`);
    assert.ok(pathsOf(result).includes("urls[0].url"));
  }
});

test("url entry with non-canonical kind is flagged with path", () => {
  const pack = completePack();
  pack.urls[1].kind = "totally-unknown-kind";
  const result = validateDemoPack(pack);
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("urls[1].kind"));
});

test("non-object url entry is flagged", () => {
  const pack = completePack();
  pack.urls[0] = "https://airvio.co/agenticgraph";
  const result = validateDemoPack(pack);
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("urls[0]"));
});

test("asset and stripe-session are accepted canonical url kinds", () => {
  const pack = completePack();
  pack.urls.push({ kind: "asset", url: "https://media.example/r2/asset.mp4" });
  pack.urls.push({ kind: "stripe-session", url: "https://checkout.stripe.com/c/sess_123" });
  assert.equal(validateDemoPack(pack).valid, true);
});

// --- 6. >=1 frontend URL + >=1 worker URL present ----------------------------

test("missing a frontend URL is flagged", () => {
  const pack = completePack();
  pack.urls = pack.urls.filter((u) => u.kind !== "frontend");
  const result = validateDemoPack(pack);
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("urls"));
  assert.ok(result.errors.some((e) => /Frontend/.test(e.reason)));
});

test("missing a worker endpoint is flagged", () => {
  const pack = completePack();
  pack.urls = pack.urls.filter((u) => !DEMO_PACK_WORKER_URL_KINDS.includes(u.kind));
  const result = validateDemoPack(pack);
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("urls"));
  assert.ok(result.errors.some((e) => /Worker/.test(e.reason)));
});

test("worker-health alone satisfies the worker coverage requirement", () => {
  const pack = completePack();
  pack.urls = [
    { kind: "frontend", url: "https://airvio.co/agenticgraph" },
    { kind: "worker-health", url: "https://airvio.co/agenticgraph/mcp/health" },
  ];
  assert.equal(validateDemoPack(pack).valid, true);
});

// --- 7. missing / malformed top-level fields flagged with path + reason -----

test("missing urls / sections each flagged with path + non-empty reason", () => {
  const noUrls = completePack();
  delete noUrls.urls;
  let result = validateDemoPack(noUrls);
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("urls"));

  const noSections = completePack();
  delete noSections.sections;
  result = validateDemoPack(noSections);
  assert.equal(result.valid, false);
  assert.ok(pathsOf(result).includes("sections"));

  for (const e of validateDemoPack({}).errors) {
    assert.equal(typeof e.path, "string");
    assert.equal(typeof e.reason, "string");
    assert.ok(e.reason.length > 0);
  }
});

test("urls / sections of the wrong type are flagged", () => {
  assert.ok(pathsOf(validateDemoPack(completePack({ urls: "x" }))).includes("urls"));
  assert.ok(pathsOf(validateDemoPack(completePack({ sections: {} }))).includes("sections"));
});

// --- 8. malformed input never throws (totality) -----------------------------

test("validateDemoPack is total: non-object inputs never throw", () => {
  for (const bad of [undefined, null, 0, 1, "x", true, [], NaN, Symbol("s")]) {
    const result = validateDemoPack(bad);
    assert.equal(result.valid, false);
    assert.ok(Array.isArray(result.errors));
    assert.ok(result.errors.length > 0);
  }
});

test("validateDemoPack is total: deeply garbage sections/urls never throw", () => {
  const garbage = {
    urls: [null, 5, {}, { url: 1, kind: 2 }, []],
    sections: [null, "x", {}, { dimension: 7, evidence: [], verified: "no" }],
  };
  assert.doesNotThrow(() => validateDemoPack(garbage));
  const result = validateDemoPack(garbage);
  assert.equal(result.valid, false);
  for (const e of result.errors) {
    assert.equal(typeof e.path, "string");
    assert.ok(e.reason.length > 0);
  }
});

// --- 9. reconciliation: the runtime builder output validates ----------------

test("RECONCILIATION: a terminal-state runtime Demo_Pack passes validateDemoPack", () => {
  // buildDemoPack emits a SUPERSET (urls carry `reachable`; sections carry
  // `id`/`status`/etc.) — the contract validator must accept it unchanged.
  const runtimePack = buildDemoPack({
    state: "completed",
    sources: [{ sourceId: "s1", url: "https://src.example/1" }],
    assets: [{ assetUrl: "https://media.example/a.mp4", ledgerEventId: "led_1" }],
    checkout: { sessionId: "sess_123" },
  });  const result = validateDemoPack(runtimePack);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("RECONCILIATION: runtime section dimensions match the canonical catalog", () => {
  const runtimePack = buildDemoPack({ state: "completed" });
  const dims = runtimePack.sections.map((s) => s.dimension).sort();
  assert.deepEqual(dims, [...DEMO_PACK_DIMENSIONS].sort());
});

// --- 10. property-style sweep: single-field corruption stays total + invalid -

test("PROPERTY: corrupting any one section field keeps the result total and invalid", () => {
  const corruptions = {
    dimension: ["", "Nope", 5, null],
    evidence: ["", "   ", 5, null],
    verified: ["true", 1, null, {}],
  };
  for (const [field, badValues] of Object.entries(corruptions)) {
    for (const bad of badValues) {
      const pack = completePack();
      pack.sections[3][field] = bad;
      const result = validateDemoPack(pack);
      assert.equal(result.valid, false, `section.${field}=${String(bad)} should be invalid`);
      assert.ok(
        pathsOf(result).some((p) => p.startsWith("sections")),
        `expected a sections error path for ${field}`,
      );
    }
  }
});
