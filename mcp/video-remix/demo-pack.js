// Demo_Pack builder for the video-remix Director runtime (spec task 2.13 /
// R3.1, R3.2 / Property 22). Extends the verbatim extraction from
// `mcp/video-remix-runtime.js` (reuse-not-rebuild): the existing builder only
// emitted `DEMO_SECTIONS` status markers + caller-supplied urls. This version
// assembles, at a TERMINAL Run_State, exactly seven NON-EMPTY evidence sections
// (one per judging dimension) and a `urls[]` collection that always carries at
// least one Frontend URL and at least one Agent_Api endpoint.
//
// Scope of task 2.13 is the seven-sections + required-urls ASSEMBLY. Task 2.14
// (R3.3 / Property 23) adds URL reachability marking via an INJECTABLE probe
// result set (see `markReachability` below): a url confirmed to return HTTP 200
// within 5s is flipped `reachable:true` and its backing section to
// `verified:true`; any url that did not return 200 within 5s leaves its section
// `verified:false` and records the failing url (on the section and in
// `demoPack.failingUrls[]`). The runtime performs NO real network call — the
// live probe is wired in integration task 9.2 / health task 2.16.
//
// Task 2.15 (R3.6, R3.7 / Property 23, artifact half) adds artifact-reference
// completeness via `buildArtifactReferences` + `markArtifactCompleteness`
// (see below): each of the three artifacts — Evidence_Pack citations, the
// rendered asset reference (assetUrl / ledgerEventId), and the Stripe checkout
// session id — is REFERENCED when it exists and explicitly marked "not
// available" when it does not, surfaced as `demoPack.artifactReferences` and
// reflected in the backing section's evidence + `verified`. It composes with
// the 2.14 reachability half: a section that is BOTH url-backed and
// artifact-backed (the judge-facing `demo_presentation` dimension) is verified
// only when its url is reachable AND its artifact is present.
//
// Task 2.16 (R3.4, R3.5) adds the health-route retry/record layer via
// `runHealthCheck` (imported from `./health-check.js`): after the deploy
// Approval_Gate(s) are approved, an INJECTABLE sequence of `GET /health` probe
// attempts is retried up to 3 times when an attempt does not return HTTP 200
// within 5s; if all attempts fail, a distinct health-check failure indication
// is recorded as `demoPack.healthCheck = { url, probed, attempts, passed,
// failureRecorded }`. Like the 2.14 reachability marking it is PURE and
// TIMER-FREE (no socket, no sleep); the live probe is wired in integration
// task 9.2. It is consistent with the 2.14 `agent-api-health` url.

import { DEMO_SECTIONS } from "./constants.js";
import { cleanString } from "./helpers.js";
import { runHealthCheck } from "./health-check.js";
import { CANVAS_URL_KIND, resolveCanvasDocViewUrl } from "./canvas-embed.js";

// The seven judging dimensions, keyed by the canonical `DEMO_SECTIONS` id
// (design › User Flow › Hackathon judge; R3.1). Exactly one section per
// dimension, in the fixed catalog order.
const JUDGING_DIMENSIONS = Object.freeze({
  agent_overview: "Agent Overview",
  autonomy_decision_making: "Autonomy & Decision-Making",
  actions_tool_use: "Actions & Tool Use",
  orchestration: "Orchestration",
  human_in_the_loop: "Human-in-the-Loop",
  failure_handling: "Failure Handling",
  demo_presentation: "Demo & Presentation",
});

// Terminal Run_States at which the Demo_Pack is assembled (R3.1). The runtime
// uses `complete` for the design `completed` state; `blocked` and
// `budget_exceeded` are fail-closed terminals; `dry_run_ready` is the terminal
// of a dry run; `verification_failed` is included for completeness. The halt
// states `approval_required` / `running` are NOT terminal (a run there is still
// awaiting input), so they carry no demo urls.
const TERMINAL_RUN_STATES = Object.freeze([
  "complete",
  "completed",
  "blocked",
  "budget_exceeded",
  "verification_failed",
  "dry_run_ready",
]);

function isTerminalRunState(state) {
  return TERMINAL_RUN_STATES.includes(state);
}

// Default demo endpoints (Cloudflare-only). Frontend = Pages app at airvio.co/agenticgraph;
// Worker = agenticgraph-mcp Worker base endpoint + its open `GET /health` liveness route.
const DEFAULT_FRONTEND_URL = "https://airvio.co/agenticgraph";
const DEFAULT_WORKER_URL = "https://airvio.co/agenticgraph/mcp";
const DEFAULT_WORKER_HEALTH_URL = "https://airvio.co/agenticgraph/mcp/health";

// Url kinds that count as a Worker endpoint for the ">=1 Worker" requirement.
const FRONTEND_URL_KIND = "frontend";
const WORKER_URL_KINDS = Object.freeze(["worker", "worker-health"]);
// Backward-compatible alias for callers that imported the old name.
const AGENT_API_URL_KINDS = WORKER_URL_KINDS;

// EXPLICIT, INJECTABLE 5-second reachability deadline (R3.2, R3.3 — a url is
// reachable ONLY when it returns HTTP 200 "within 5 seconds"). This is the
// deterministic timeout seam: it is metadata only (the model is timer-free, it
// never opens a socket or sleeps), but it lets a probe report HOW LONG a
// request took and have a 200 that arrived AFTER the deadline correctly counted
// as a timeout failure. The live probe (task 9.2) enforces the same 5s deadline
// on a real socket; unit tests inject a latency to exercise the boundary with
// zero network. Overridable per `buildDemoPack`/`markReachability` call.
const URL_REACHABILITY_DEADLINE_MS = 5000;

// Assemble the Demo_Pack `urls[]` (R3.2). At a terminal Run_State this always
// contains >=1 Frontend URL and >=1 Agent_Api endpoint. `reachable:false` is the
// seam for task 2.14 (reachability marking flips it after a probe). Off a
// terminal state the run is still in flight, so no demo urls are emitted.
//
// `canvasUrl` is OPT-IN: when a run-scoped agenticgraph canvas doc-view URL is
// available (the storyboard stage produced a Kgc_Document and a control-plane
// canvas base is configured), a `canvas` entry is added so the embedded canvas
// counts as a judge-facing artifact. Absent a canvasUrl the urls[] shape is
// unchanged (backward compatible — no canvas entry).
function buildDemoUrls({ state, frontendUrl, workerUrl, workerHealthUrl, canvasUrl }) {
  if (!isTerminalRunState(state)) return [];
  const urls = [
    { kind: FRONTEND_URL_KIND, url: cleanString(frontendUrl, DEFAULT_FRONTEND_URL), reachable: false },
    { kind: "worker", url: cleanString(workerUrl, DEFAULT_WORKER_URL), reachable: false },
    { kind: "worker-health", url: cleanString(workerHealthUrl, DEFAULT_WORKER_HEALTH_URL), reachable: false },
  ];
  const canvas = cleanString(canvasUrl);
  if (canvas) urls.push({ kind: CANVAS_URL_KIND, url: canvas, reachable: false });
  return urls;
}

// Explicit, observable marker for an artifact reference that does not exist at
// assembly time (R3.7). Surfaced both on `artifactReferences` and in the
// affected section's evidence text.
const NOT_AVAILABLE = "not available";

// Per-dimension evidence content. Each entry returns a NON-EMPTY string drawn
// from the actual run artifacts so every section is substantive at a terminal
// state (R3.1). Artifact-backed dimensions reference the concrete artifact when
// it exists and say "not available" when it does not (R3.6, R3.7).
function buildSectionEvidence(id, ctx) {
  const { evidenced, sourceCount, assetCount, state, artifactReferences } = ctx;
  const refs = artifactReferences || {};
  const citationsRef = refs.evidenceCitations || { status: NOT_AVAILABLE };
  const assetRef = refs.renderedAsset || { status: NOT_AVAILABLE };
  const sessionRef = refs.stripeSession || { status: NOT_AVAILABLE };
  const citationsText = citationsRef.status === "present"
    ? `${citationsRef.count} Evidence_Pack citation(s) referenced (e.g. ${citationsRef.citations[0].url})`
    : `Evidence_Pack citations ${NOT_AVAILABLE}`;
  const assetText = assetRef.status === "present"
    ? `rendered asset reference ${assetRef.reference.assetUrl || assetRef.reference.ledgerEventId}`
    : `rendered asset reference ${NOT_AVAILABLE}`;
  const sessionText = sessionRef.status === "present"
    ? `Stripe checkout session ${sessionRef.sessionId}`
    : `Stripe checkout session ${NOT_AVAILABLE}`;
  switch (id) {
    case "agent_overview":
      return `Single autonomous Director (agenticgraph.video_remix.run) drove the ` +
        `research -> storyboard -> render -> edit -> publish -> checkout loop to terminal Run_State "${state}".`;
    case "autonomy_decision_making":
      return `Director resolved each spend boundary autonomously under a dry-run-first policy, ` +
        `escalating to a human Approval_Gate only at paid actions; ${sourceCount} research source(s) informed planning; ${citationsText}.`;
    case "actions_tool_use":
      return `Tool calls exercised: research (via Cloudflare AI Gateway), storyboard (BytePlus), render, publish, checkout; ` +
        `${assetCount} rendered asset reference(s) produced through the existing Strytree/BytePlus queue; ${assetText}.`;
    case "orchestration":
      return `Strict stage ordering enforced (each stage begins only after the prior reaches completed), ` +
        `persisted as a durable Run_Manifest with Budget_Meters and Cost_Log accounting.`;
    case "human_in_the_loop":
      return `Spend boundaries gated by single-use, 15-minute Approval_Tokens (paid-model-call, render-action, ` +
        `payment-action, cloud-deploy); no paid action executes without a verified, unconsumed token.`;
    case "failure_handling":
      return `Bounded-retry policy (exponential backoff 1s..30s, capped by maxIterations) with fail-closed ` +
        `transition to blocked plus a failure record on exhaustion or total provider unavailability.`;
    case "demo_presentation":
      return evidenced
        ? `Sold-asset demo ready: ${sessionText} and reachable Frontend + Agent_Api URLs are listed for judges.`
        : `Evidence-backed demo at Run_State "${state}": Frontend + Agent_Api URLs are listed for judges; ${sessionText}.`;
    default:
      return `Evidence recorded for ${JUDGING_DIMENSIONS[id] || id} at Run_State "${state}".`;
  }
}

// Build the seven judging-dimension sections (R3.1). Iterates the fixed
// `DEMO_SECTIONS` catalog so the result is exactly seven entries, one per
// dimension, each with a non-empty `evidence` string. `verified` is false until
// task 2.14/2.15 confirm the referenced url/artifact.
function buildSections(ctx) {
  return DEMO_SECTIONS.map((id) => ({
    id,
    dimension: JUDGING_DIMENSIONS[id] || id,
    status: ctx.evidenced ? "evidenced" : "draft_ready",
    evidence: buildSectionEvidence(id, ctx),
    verified: false,
  }));
}

// ---------------------------------------------------------------------------
// Task 2.14 — Demo_Pack URL reachability marking (R3.3 / Property 23).
// ---------------------------------------------------------------------------
// PURE and TIMER-FREE: this never opens a socket. It accepts an INJECTABLE
// reachability result set and folds it into the Demo_Pack, so a unit test needs
// no network and no real 5s timer. The live probe (an HTTP HEAD/GET with a 5s
// deadline) is wired in integration task 9.2 / health task 2.16 and passed in
// here as `reachability`.

// Each demo url backs an evidence section. The demo urls are the judge-facing
// surface — the "Demo & Presentation" dimension lists them — so by default they
// back the `demo_presentation` section. A url entry MAY override this with an
// explicit `section` field (kept for the 2.15 artifact-reference seam).
const URL_KIND_TO_SECTION = Object.freeze({
  [FRONTEND_URL_KIND]: "demo_presentation",
  "agent-api": "demo_presentation",
  "agent-api-health": "demo_presentation",
  // The embedded agenticgraph canvas backs the Actions & Tool Use dimension.
  [CANVAS_URL_KIND]: "actions_tool_use",
  "worker": "demo_presentation",
  "worker-health": "demo_presentation",
});

function sectionIdForUrl(entry) {
  return (
    cleanString(entry && entry.section, "") ||
    URL_KIND_TO_SECTION[entry && entry.kind] ||
    "demo_presentation"
  );
}

// Read a probe-reported latency (ms) from any of the accepted aliases. Returns
// a finite number or `undefined` when the probe reported no timing.
function readLatencyMs(result) {
  for (const key of ["latencyMs", "elapsedMs", "durationMs", "ms"]) {
    const v = result[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

// Interpret a single reachability result against the EXPLICIT 5s deadline. A
// result counts as reachable ONLY when it represents an HTTP 200 that arrived
// within `deadlineMs` (default `URL_REACHABILITY_DEADLINE_MS`). Returns `true`
// (confirmed 200 within deadline), `false` (confirmed non-200, explicit
// timeout, OR a response — even a 200 — whose reported latency exceeded the
// deadline), or `undefined` (unprobed/unknown — NOT a confirmed failure, so it
// is never recorded in `failingUrls`).
function resolveReachable(result, deadlineMs = URL_REACHABILITY_DEADLINE_MS) {
  if (result === true || result === false) return result;
  if (result == null) return undefined;
  if (typeof result === "object") {
    // Explicit timeout flag always fails (no 200 within 5s).
    if (result.timedOut === true) return false;
    // A reported latency over the deadline is a timeout, even for a 200 — this
    // is the deterministic "within 5s" boundary (R3.2, R3.3).
    const latencyMs = readLatencyMs(result);
    if (typeof latencyMs === "number" && latencyMs > deadlineMs) return false;
    if (typeof result.ok === "boolean") return result.ok;
    if (typeof result.reachable === "boolean") return result.reachable;
    if (typeof result.status === "number") return result.status === 200;
  }
  return undefined;
}

// Build a `url -> (true|false|undefined)` lookup from any injectable shape:
//   * a probe FUNCTION  (url, entry) => boolean | { ok | reachable | status | timedOut | latencyMs }
//   * a precomputed ARRAY of { url, ok|reachable|status|timedOut|latencyMs }
//   * a precomputed OBJECT/MAP keyed by url => boolean | { ... }
// The explicit `deadlineMs` (default 5s) is applied to every result so a 200
// that arrived too late is counted as a timeout failure.
function buildReachabilityLookup(reachability, urls, deadlineMs = URL_REACHABILITY_DEADLINE_MS) {
  const lookup = new Map();
  if (!reachability) return lookup;
  if (typeof reachability === "function") {
    for (const entry of urls) lookup.set(entry.url, resolveReachable(reachability(entry.url, entry), deadlineMs));
    return lookup;
  }
  if (reachability instanceof Map) {
    for (const [url, val] of reachability.entries()) lookup.set(url, resolveReachable(val, deadlineMs));
    return lookup;
  }
  if (Array.isArray(reachability)) {
    for (const r of reachability) {
      if (r && typeof r.url === "string") lookup.set(r.url, resolveReachable(r, deadlineMs));
    }
    return lookup;
  }
  if (typeof reachability === "object") {
    for (const [url, val] of Object.entries(reachability)) lookup.set(url, resolveReachable(val, deadlineMs));
  }
  return lookup;
}

// Fold the reachability result set into `urls[]` and `sections[]`. Returns the
// marked urls, the marked sections, and a flat `failingUrls[]` of every url
// CONFIRMED not to return HTTP 200 within 5s (R3.3). A url-backed section is
// `verified:true` only when ALL of its urls are confirmed reachable; otherwise
// it is `verified:false` and its confirmed failing urls are recorded on the
// section. Non-url-backed sections are left untouched (the 2.15 seam).
function markReachability({ urls = [], sections = [], reachability, deadlineMs = URL_REACHABILITY_DEADLINE_MS }) {
  const lookup = buildReachabilityLookup(reachability, urls, deadlineMs);

  const markedUrls = urls.map((entry) => ({ ...entry, reachable: lookup.get(entry.url) === true }));
  const failingUrls = markedUrls
    .filter((entry) => lookup.get(entry.url) === false)
    .map((entry) => entry.url);

  const urlsBySection = new Map();
  for (const entry of markedUrls) {
    const sid = sectionIdForUrl(entry);
    if (!urlsBySection.has(sid)) urlsBySection.set(sid, []);
    urlsBySection.get(sid).push(entry);
  }

  const markedSections = sections.map((section) => {
    const sectionUrls = urlsBySection.get(section.id) || [];
    if (sectionUrls.length === 0) return section; // not url-backed; 2.15 owns its `verified`
    const sectionFailing = sectionUrls
      .filter((entry) => lookup.get(entry.url) === false)
      .map((entry) => entry.url);
    const allReachable = sectionUrls.every((entry) => entry.reachable === true);
    return { ...section, verified: allReachable, failingUrls: sectionFailing };
  });

  return { urls: markedUrls, sections: markedSections, failingUrls };
}

// ---------------------------------------------------------------------------
// Task 2.15 — Demo_Pack artifact-reference completeness (R3.6, R3.7 /
// Property 23, artifact half).
// ---------------------------------------------------------------------------
// PURE: references the three Demo_Pack artifacts when they exist and marks each
// missing one "not available". The three artifacts (design › Demo_Pack):
//   * Evidence_Pack citations  (from evidencePack.citations / sources)
//   * rendered asset reference (from render.assets[].assetUrl|ledgerEventId)
//   * Stripe session id        (from commerce.checkout.sessionId)

// Each artifact backs one judging dimension. `demo_presentation` is also
// url-backed (2.14), so its `verified` combines BOTH predicates.
const ARTIFACT_SECTION_BINDINGS = Object.freeze({
  autonomy_decision_making: "evidenceCitations",
  actions_tool_use: "renderedAsset",
  demo_presentation: "stripeSession",
});

function isArtifactPresent(ref) {
  return Boolean(ref) && ref.status === "present";
}

// Build the `artifactReferences` map: a present/not-available record per
// artifact (R3.6 references the artifact when it exists; R3.7 marks it "not
// available" otherwise). `citations` defaults to the Evidence_Pack derivation
// (sourceId+url per source) when not supplied explicitly.
function buildArtifactReferences({ citations = [], sources = [], assets = [], checkout = {} }) {
  const citationList = (Array.isArray(citations) && citations.length
    ? citations
    : sources.map((s) => ({ sourceId: s && s.sourceId, url: s && s.url })))
    .filter((c) => c && c.url);
  const assetList = Array.isArray(assets) ? assets : [];
  const firstAsset = assetList.find((a) => a && (a.assetUrl || a.ledgerEventId)) || null;
  const sessionId = cleanString(checkout && checkout.sessionId, "");

  return {
    evidenceCitations: citationList.length > 0
      ? {
        status: "present",
        count: citationList.length,
        citations: citationList.map((c) => ({ sourceId: c.sourceId, url: c.url })),
      }
      : { status: NOT_AVAILABLE, count: 0, citations: [] },
    renderedAsset: firstAsset
      ? {
        status: "present",
        count: assetList.length,
        reference: { assetUrl: firstAsset.assetUrl || null, ledgerEventId: firstAsset.ledgerEventId || null },
      }
      : { status: NOT_AVAILABLE, count: 0, reference: null },
    stripeSession: sessionId
      ? { status: "present", sessionId }
      : { status: NOT_AVAILABLE, sessionId: null },
  };
}

// Fold artifact completeness into the sections. For an artifact-backed
// dimension, the section's `verified` is driven by artifact presence. A section
// that is ALSO url-backed (it already carries a `failingUrls` array from
// `markReachability`) combines BOTH predicates: verified only when its url is
// reachable AND its artifact is present. The artifact status is recorded on the
// section as `artifact` for observability.
function markArtifactCompleteness({ sections = [], artifactReferences = {} }) {
  return sections.map((section) => {
    const artifactKey = ARTIFACT_SECTION_BINDINGS[section.id];
    if (!artifactKey) return section;
    const ref = artifactReferences[artifactKey];
    const present = isArtifactPresent(ref);
    const urlBacked = Object.prototype.hasOwnProperty.call(section, "failingUrls");
    const verified = urlBacked ? section.verified === true && present : present;
    return { ...section, verified, artifact: { key: artifactKey, status: ref ? ref.status : NOT_AVAILABLE } };
  });
}

function buildDemoPack({
  state,
  sources = [],
  citations,
  assets = [],
  checkout = {},
  frontendUrl,
  workerUrl,
  workerHealthUrl,
  canvasUrl,
  canvasBaseUrl,
  runId,
  manifest,
  reachability,
  reachabilityDeadlineMs = URL_REACHABILITY_DEADLINE_MS,
  deployApproved = false,
  healthAttempts,
}) {
  const evidenced = state === "complete" || state === "completed";
  const resolvedCanvasUrl = cleanString(canvasUrl)
    || (cleanString(runId) && resolveCanvasDocViewUrl({
      baseUrl: canvasBaseUrl,
      runId,
      docId: manifest && (manifest.storyboardDocId || (manifest.kgcDocument && manifest.kgcDocument.graphId)),
    }))
    || "";
  const urls = buildDemoUrls({
    state,
    frontendUrl,
    workerUrl,
    workerHealthUrl,
    canvasUrl: resolvedCanvasUrl,
  });
  const artifactReferences = buildArtifactReferences({ citations, sources, assets, checkout });
  const ctx = {
    state,
    evidenced,
    sourceCount: sources.length,
    assetCount: assets.length,
    sessionId: checkout && checkout.sessionId ? checkout.sessionId : "",
    artifactReferences,
  };
  const marked = markReachability({ urls, sections: buildSections(ctx), reachability, deadlineMs: reachabilityDeadlineMs });
  const sections = isTerminalRunState(state)
    ? markArtifactCompleteness({ sections: marked.sections, artifactReferences })
    : marked.sections;
  const healthUrl = cleanString(workerHealthUrl, DEFAULT_WORKER_HEALTH_URL);
  const healthCheck = runHealthCheck({
    deployApproved: isTerminalRunState(state) && deployApproved === true,
    url: healthUrl,
    attempts: healthAttempts,
  });
  return {
    readiness: evidenced ? "live_ready" : "blocked_with_evidence",
    atTerminalRunState: isTerminalRunState(state),
    sections,
    marketEvidenceCount: sources.length,
    urls: marked.urls,
    failingUrls: marked.failingUrls,
    artifactReferences,
    healthCheck,
    assets,
    checkout,
  };
}

export {
  buildDemoPack,
  buildDemoUrls,
  markReachability,
  buildArtifactReferences,
  markArtifactCompleteness,
  runHealthCheck,
  isTerminalRunState,
  JUDGING_DIMENSIONS,
  TERMINAL_RUN_STATES,
  FRONTEND_URL_KIND,
  WORKER_URL_KINDS,
  AGENT_API_URL_KINDS,
  URL_REACHABILITY_DEADLINE_MS,
  URL_KIND_TO_SECTION,
  ARTIFACT_SECTION_BINDINGS,
  NOT_AVAILABLE,
  CANVAS_URL_KIND,
};
