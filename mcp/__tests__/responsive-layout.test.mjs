// =============================================================================
// Responsive layout metadata — unit tests
// agenticgraph-widget-canvas-media spec · Task 11
// Requirements: R1.1, R1.2, R1.3, R1.5, R1.6, R1.7, R1.9, R1.10
//
// Pure offline — ZERO network calls. All helpers are inlined from the
// responsiveLayoutContract.ts logic so this runs in Node without TypeScript.
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Constants (mirrors responsiveLayoutContract.ts / media-artifact.schema.js)
// ---------------------------------------------------------------------------

const MEDIA_LOGICAL_FRAME = Object.freeze({ w: 1920, h: 1080 });

const RESPONSIVE_PROOF_CLASSES = [
  [320, 640],
  [390, 844],
  [768, 1024],
  [1366, 768],
  [1920, 1080],
];

const MOBILE_VIEWPORT_THRESHOLD = 768;

// ---------------------------------------------------------------------------
// Inlined pure helpers (mirrors responsiveLayoutContract.ts)
// ---------------------------------------------------------------------------

function validateLayoutMetadata(layout) {
  const errors = [];
  const add = (path, reason) => errors.push({ path, reason });
  if (!layout || typeof layout !== "object" || Array.isArray(layout)) {
    add("", "must be a non-null object");
    return { valid: false, errors };
  }
  if (!layout.frame || layout.frame.w !== MEDIA_LOGICAL_FRAME.w || layout.frame.h !== MEDIA_LOGICAL_FRAME.h) {
    add("frame", `must be { w: ${MEDIA_LOGICAL_FRAME.w}, h: ${MEDIA_LOGICAL_FRAME.h} }`);
  }
  if (!Array.isArray(layout.widgets)) {
    add("widgets", "must be an array");
  }
  if (layout.edges !== undefined && !Array.isArray(layout.edges)) {
    add("edges", "must be an array when present");
  }
  return { valid: errors.length === 0, errors };
}

function deriveLayoutForProofClass(metadata, proofClass) {
  if (!metadata) return { placements: null, error: "layout metadata is missing (R1.10)" };
  const validation = validateLayoutMetadata(metadata);
  if (!validation.valid) {
    return { placements: null, error: `layout metadata failed validation: ${validation.errors.map(e => `${e.path}: ${e.reason}`).join("; ")} (R1.10)` };
  }
  const [vpW, vpH] = proofClass;
  const scaleX = vpW / MEDIA_LOGICAL_FRAME.w;
  const scaleY = vpH / MEDIA_LOGICAL_FRAME.h;
  const placements = metadata.widgets.map(w => ({
    ...w,
    x: Math.round(w.x * scaleX),
    y: Math.round(w.y * scaleY),
  }));
  return { placements, error: null };
}

function toPixelRect(r, frameW, frameH) {
  return {
    left:   r.x,
    top:    r.y,
    right:  r.x + r.wPct / 100 * frameW,
    bottom: r.y + r.hPct / 100 * frameH,
    z: r.z,
  };
}

function findOverlappingWidgets(placements, frameW = MEDIA_LOGICAL_FRAME.w, frameH = MEDIA_LOGICAL_FRAME.h) {
  const overlaps = [];
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = toPixelRect(placements[i], frameW, frameH);
      const b = toPixelRect(placements[j], frameW, frameH);
      if (a.z !== b.z) continue;
      const overlapW = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapH = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlapW > 0 && overlapH > 0) overlaps.push([placements[i].id, placements[j].id]);
    }
  }
  return overlaps;
}

function widgetCenterExclusionZone(w, frameW = MEDIA_LOGICAL_FRAME.w, frameH = MEDIA_LOGICAL_FRAME.h) {
  const pixW = w.wPct / 100 * frameW;
  const pixH = w.hPct / 100 * frameH;
  const marginX = pixW * 0.25;
  const marginY = pixH * 0.25;
  return { left: w.x + marginX, top: w.y + marginY, right: w.x + pixW - marginX, bottom: w.y + pixH - marginY };
}

function segmentIntersectsRect(a, b, rect) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  function clip(p, q) {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else        { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  }
  if (!clip(-dx, a.x - rect.left))   return false;
  if (!clip( dx, rect.right - a.x))  return false;
  if (!clip(-dy, a.y - rect.top))    return false;
  if (!clip( dy, rect.bottom - a.y)) return false;
  return t0 <= t1;
}

function edgeCenterObstructions(fromW, toW, allWidgets, frameW = MEDIA_LOGICAL_FRAME.w, frameH = MEDIA_LOGICAL_FRAME.h) {
  const fromPt = { x: fromW.x + fromW.wPct / 100 * frameW / 2, y: fromW.y + fromW.hPct / 100 * frameH / 2 };
  const toPt   = { x: toW.x   + toW.wPct   / 100 * frameW / 2, y: toW.y   + toW.hPct   / 100 * frameH / 2 };
  return allWidgets
    .filter(w => w.id !== fromW.id && w.id !== toW.id)
    .filter(w => segmentIntersectsRect(fromPt, toPt, widgetCenterExclusionZone(w, frameW, frameH)))
    .map(w => w.id);
}

function isMobileViewport(viewportWidth) {
  return viewportWidth < MOBILE_VIEWPORT_THRESHOLD;
}

function allWidgetSizesWithinTolerance(placements, renderedSizes, tolerancePct = 2) {
  const violations = [];
  for (const p of placements) {
    const rendered = renderedSizes[p.id];
    if (!rendered) continue;
    if (Math.abs(rendered.wPct - p.wPct) > tolerancePct) violations.push({ id: p.id, axis: "w", expected: p.wPct, actual: rendered.wPct });
    if (Math.abs(rendered.hPct - p.hPct) > tolerancePct) violations.push({ id: p.id, axis: "h", expected: p.hPct, actual: rendered.hPct });
  }
  return { ok: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Sample metadata for tests
// ---------------------------------------------------------------------------

// Three non-overlapping widgets in the logical 1920×1080 frame
function makeMetadata(overrides = {}) {
  return {
    frame: { w: 1920, h: 1080 },
    widgets: overrides.widgets ?? [
      { id: "img-1", kind: "image", x:    0, y:   0, z: 1, wPct: 30, hPct: 50 },
      { id: "vid-1", kind: "video", x:  700, y:   0, z: 1, wPct: 30, hPct: 50 },
      { id: "txt-1", kind: "text",  x: 1400, y:   0, z: 1, wPct: 30, hPct: 50 },
    ],
    edges: overrides.edges ?? [
      { id: "e1", from: "img-1", to: "vid-1" },
    ],
    ...overrides,
  };
}

// ===========================================================================
// R1.1 — Logical frame MUST be 1920×1080
// ===========================================================================

test("MEDIA_LOGICAL_FRAME is 1920x1080 (R1.1)", () => {
  assert.equal(MEDIA_LOGICAL_FRAME.w, 1920);
  assert.equal(MEDIA_LOGICAL_FRAME.h, 1080);
});

test("validateLayoutMetadata: frame must be {w:1920,h:1080} (R1.1)", () => {
  const bad = { ...makeMetadata(), frame: { w: 1280, h: 720 } };
  const result = validateLayoutMetadata(bad);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.path === "frame"));
});

test("validateLayoutMetadata: valid metadata passes (R1.9)", () => {
  const result = validateLayoutMetadata(makeMetadata());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

// ===========================================================================
// R1.2 — Five responsive proof classes
// ===========================================================================

test("RESPONSIVE_PROOF_CLASSES has exactly 5 entries (R1.2)", () => {
  assert.equal(RESPONSIVE_PROOF_CLASSES.length, 5);
});

test("RESPONSIVE_PROOF_CLASSES contains [320,640] (R1.2)", () => {
  const found = RESPONSIVE_PROOF_CLASSES.find(([w, h]) => w === 320 && h === 640);
  assert.ok(found, "missing 320×640");
});

test("RESPONSIVE_PROOF_CLASSES contains [1920,1080] (R1.2)", () => {
  const found = RESPONSIVE_PROOF_CLASSES.find(([w, h]) => w === 1920 && h === 1080);
  assert.ok(found, "missing 1920×1080");
});

// ===========================================================================
// R1.2 — deriveLayoutForProofClass: proportional scaling
// ===========================================================================

test("deriveLayoutForProofClass scales x proportionally for 320x640 (R1.2)", () => {
  const meta = makeMetadata({
    widgets: [{ id: "w1", kind: "image", x: 960, y: 540, z: 1, wPct: 50, hPct: 50 }],
  });
  const result = deriveLayoutForProofClass(meta, [320, 640]);
  assert.equal(result.error, null);
  const w = result.placements[0];
  // 960 / 1920 * 320 = 160
  assert.equal(w.x, 160);
});

test("deriveLayoutForProofClass scales y proportionally for 390x844 (R1.2)", () => {
  const meta = makeMetadata({
    widgets: [{ id: "w1", kind: "video", x: 0, y: 540, z: 1, wPct: 100, hPct: 50 }],
  });
  const result = deriveLayoutForProofClass(meta, [390, 844]);
  assert.equal(result.error, null);
  const w = result.placements[0];
  // 540 / 1080 * 844 = 422
  assert.equal(w.y, 422);
});

test("deriveLayoutForProofClass returns identity for 1920x1080 (R1.2)", () => {
  const meta = makeMetadata();
  const result = deriveLayoutForProofClass(meta, [1920, 1080]);
  assert.equal(result.error, null);
  assert.equal(result.placements[0].x, meta.widgets[0].x);
  assert.equal(result.placements[0].y, meta.widgets[0].y);
});

// All 5 proof classes produce valid, non-null placements
for (const [vpW, vpH] of RESPONSIVE_PROOF_CLASSES) {
  test(`deriveLayoutForProofClass is non-null for ${vpW}x${vpH} (R1.2)`, () => {
    const result = deriveLayoutForProofClass(makeMetadata(), [vpW, vpH]);
    assert.equal(result.error, null);
    assert.ok(Array.isArray(result.placements) && result.placements.length > 0);
  });
}

// ===========================================================================
// R1.5 — Zero widget overlap at same z-index
// ===========================================================================

test("findOverlappingWidgets: non-overlapping widgets produce no overlaps (R1.5)", () => {
  const meta = makeMetadata();
  const result = deriveLayoutForProofClass(meta, [1920, 1080]);
  const overlaps = findOverlappingWidgets(result.placements);
  assert.deepEqual(overlaps, [], `expected no overlaps, got ${JSON.stringify(overlaps)}`);
});

test("findOverlappingWidgets: detects overlapping same-z widgets (R1.5)", () => {
  const meta = makeMetadata({
    widgets: [
      { id: "a", kind: "image", x:  0, y: 0, z: 1, wPct: 50, hPct: 50 },
      { id: "b", kind: "video", x: 50, y: 0, z: 1, wPct: 50, hPct: 50 }, // overlaps 'a' (x starts at 50px vs a.right=960px)
    ],
  });
  const result = deriveLayoutForProofClass(meta, [1920, 1080]);
  // a: x=0..960, b: x=50..1010 -> overlap at 50..960
  const overlaps = findOverlappingWidgets(result.placements);
  assert.ok(overlaps.length > 0, "expected overlap to be detected");
});

test("findOverlappingWidgets: different z-index widgets do NOT count as overlap (R1.5)", () => {
  const meta = makeMetadata({
    widgets: [
      { id: "a", kind: "image", x: 0, y: 0, z: 1, wPct: 50, hPct: 50 },
      { id: "b", kind: "video", x: 0, y: 0, z: 2, wPct: 50, hPct: 50 }, // same position, different z
    ],
  });
  const result = deriveLayoutForProofClass(meta, [1920, 1080]);
  const overlaps = findOverlappingWidgets(result.placements);
  assert.deepEqual(overlaps, [], "different z widgets should not overlap");
});

// ===========================================================================
// R1.5 — Proportional sizing within ±2%
// ===========================================================================

test("allWidgetSizesWithinTolerance: exact match passes (R1.5)", () => {
  const placements = [{ id: "w1", kind: "image", x: 0, y: 0, z: 1, wPct: 40, hPct: 30 }];
  const rendered = { "w1": { wPct: 40, hPct: 30 } };
  const result = allWidgetSizesWithinTolerance(placements, rendered);
  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
});

test("allWidgetSizesWithinTolerance: within 2% passes (R1.5)", () => {
  const placements = [{ id: "w1", kind: "image", x: 0, y: 0, z: 1, wPct: 40, hPct: 30 }];
  const rendered = { "w1": { wPct: 41.5, hPct: 31.5 } };
  const result = allWidgetSizesWithinTolerance(placements, rendered);
  assert.equal(result.ok, true);
});

test("allWidgetSizesWithinTolerance: beyond 2% fails (R1.5)", () => {
  const placements = [{ id: "w1", kind: "image", x: 0, y: 0, z: 1, wPct: 40, hPct: 30 }];
  const rendered = { "w1": { wPct: 43, hPct: 30 } }; // 3% off
  const result = allWidgetSizesWithinTolerance(placements, rendered);
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(v => v.id === "w1" && v.axis === "w"));
});

// ===========================================================================
// R1.3 — Mobile single-surface rule (below 768px)
// ===========================================================================

test("isMobileViewport: 767 is mobile (R1.3)", () => {
  assert.equal(isMobileViewport(767), true);
});

test("isMobileViewport: 768 is NOT mobile (R1.3)", () => {
  assert.equal(isMobileViewport(768), false);
});

test("isMobileViewport: 320 is mobile (R1.3)", () => {
  assert.equal(isMobileViewport(320), true);
});

test("isMobileViewport: 1920 is NOT mobile (R1.3)", () => {
  assert.equal(isMobileViewport(1920), false);
});

// ===========================================================================
// R1.6, R1.7 — Edge center-avoidance
// ===========================================================================

test("edgeCenterObstructions: no obstruction when widgets are well-separated (R1.6)", () => {
  const meta = makeMetadata(); // img-1 at x=0, vid-1 at x=700, txt-1 at x=1400
  const { placements } = deriveLayoutForProofClass(meta, [1920, 1080]);
  const [from, to] = [placements[0], placements[1]];
  // Edge goes from img-1 centroid (14.4%, 25%) to vid-1 centroid (50.8%, 25%)
  // txt-1 centroid is to the right — edge should not pass through it
  const obstructions = edgeCenterObstructions(from, to, placements);
  // txt-1 is not between img-1 and vid-1 centroids horizontally, so no obstruction
  assert.deepEqual(obstructions, []);
});

test("edgeCenterObstructions: detects obstruction when edge passes through center zone (R1.6)", () => {
  // Place widgets in a line: A(0,0), B(500,0) in center, C(1800,0)
  // Edge from A to C must pass through B's center zone
  const widgets = [
    { id: "A", kind: "image", x:    0, y: 400, z: 1, wPct: 10, hPct: 30 },
    { id: "B", kind: "text",  x:  900, y: 400, z: 1, wPct: 10, hPct: 30 }, // in the middle of A-C
    { id: "C", kind: "video", x: 1800, y: 400, z: 1, wPct: 10, hPct: 30 },
  ];
  const meta = makeMetadata({ widgets, edges: [] });
  const { placements } = deriveLayoutForProofClass(meta, [1920, 1080]);
  const fromW = placements.find(p => p.id === "A");
  const toW   = placements.find(p => p.id === "C");
  const obstructions = edgeCenterObstructions(fromW, toW, placements);
  assert.ok(obstructions.includes("B"), `expected B to be an obstruction, got: ${JSON.stringify(obstructions)}`);
});

test("edgeCenterObstructions: excludes from/to widgets from obstruction check (R1.6)", () => {
  // Even if from/to widgets would intersect each other's zones, they are excluded
  const widgets = [
    { id: "from", kind: "image", x: 0,    y: 0, z: 1, wPct: 50, hPct: 50 },
    { id: "to",   kind: "video", x: 960,  y: 0, z: 1, wPct: 50, hPct: 50 },
  ];
  const meta = makeMetadata({ widgets, edges: [] });
  const { placements } = deriveLayoutForProofClass(meta, [1920, 1080]);
  const obstructions = edgeCenterObstructions(placements[0], placements[1], placements);
  assert.ok(!obstructions.includes("from") && !obstructions.includes("to"), "from/to should be excluded");
});

// ===========================================================================
// R1.10 — Invalid/missing metadata: retain last valid, indicate failure
// ===========================================================================

test("deriveLayoutForProofClass: null metadata returns error (R1.10)", () => {
  const result = deriveLayoutForProofClass(null, [1920, 1080]);
  assert.equal(result.placements, null);
  assert.ok(result.error && result.error.includes("missing"));
});

test("deriveLayoutForProofClass: metadata with wrong frame returns error (R1.10)", () => {
  const bad = { frame: { w: 1280, h: 720 }, widgets: [], edges: [] };
  const result = deriveLayoutForProofClass(bad, [1920, 1080]);
  assert.equal(result.placements, null);
  assert.ok(result.error && result.error.length > 0);
});

test("deriveLayoutForProofClass: missing widgets array returns error (R1.10)", () => {
  const bad = { frame: { w: 1920, h: 1080 }, edges: [] }; // no widgets
  const result = deriveLayoutForProofClass(bad, [1920, 1080]);
  assert.equal(result.placements, null);
  assert.ok(result.error && result.error.length > 0);
});

test("deriveLayoutForProofClass: valid metadata returns non-null placements (R1.9)", () => {
  const result = deriveLayoutForProofClass(makeMetadata(), [1366, 768]);
  assert.equal(result.error, null);
  assert.ok(Array.isArray(result.placements));
  assert.equal(result.placements.length, makeMetadata().widgets.length);
});
